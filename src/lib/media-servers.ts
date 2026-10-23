/**
 * Multi-Platform Media Server Engine (Jellyfin & Emby)
 * Handles connection diagnostics, library discovery, and user folder policy syncing.
 */

export interface MediaServerLibrary {
    id: string;
    title: string;
    type: string; // "movies" | "tvshows" | "music" | "audiobooks" | "books" | "mixed"
}

export interface MediaServerConnectionResult {
    ok: boolean;
    serverName?: string;
    version?: string;
    os?: string;
    latencyMs?: number;
    error?: string;
}

function cleanBaseUrl(url: string): string {
    let clean = (url || "").trim();
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
        clean = `http://${clean}`;
    }
    return clean.replace(/\/+$/, "");
}

export function getMediaServerAuthHeaders(apiKey: string): Record<string, string> {
    const cleanKey = (apiKey || "").trim();
    return {
        "Accept": "application/json",
        "X-Emby-Token": cleanKey,
        "X-MediaBrowser-Token": cleanKey,
        "Authorization": `MediaBrowser Token="${cleanKey}"`,
        "X-Emby-Authorization": `MediaBrowser Client="Portalarr", Device="Portalarr Dashboard", DeviceId="portalarr-server", Version="1.3.5", Token="${cleanKey}"`
    };
}

/**
 * Universal proxy-resilient HTTP client for Jellyfin and Emby.
 * Automatically tries header-based auth and falls back to query parameter ?api_key= on 401.
 */
export async function mediaServerFetch(
    baseUrl: string,
    endpoint: string,
    apiKey: string,
    options: RequestInit = {}
): Promise<Response> {
    const cleanUrl = cleanBaseUrl(baseUrl);
    const headers = {
        ...getMediaServerAuthHeaders(apiKey),
        ...(options.headers || {})
    };

    let res = await fetch(`${cleanUrl}${endpoint}`, {
        ...options,
        headers
    });

    if (res.status === 401) {
        const sep = endpoint.includes("?") ? "&" : "?";
        const fallbackUrl = `${cleanUrl}${endpoint}${sep}api_key=${encodeURIComponent(apiKey.trim())}`;
        const retryRes = await fetch(fallbackUrl, {
            ...options,
            headers
        }).catch(() => null);
        if (retryRes) {
            res = retryRes;
        }
    }

    return res;
}

/**
 * Probes a Jellyfin or Emby instance via /System/Info with latency measurement.
 */
export async function testMediaServerConnection(
    type: "JELLYFIN" | "EMBY",
    url: string,
    apiKey: string,
    timeoutMs = 6000
): Promise<MediaServerConnectionResult> {
    const cleanUrl = cleanBaseUrl(url);
    if (!cleanUrl || !apiKey) {
        return { ok: false, error: "Missing server URL or API key" };
    }

    const start = Date.now();
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const res = await mediaServerFetch(cleanUrl, "/System/Info", apiKey, {
            method: "GET",
            signal: controller.signal
        });
        clearTimeout(timer);

        const latencyMs = Date.now() - start;

        if (!res.ok) {
            return {
                ok: false,
                latencyMs,
                error: `HTTP ${res.status}: ${res.statusText || "Unauthorized or server error"}`
            };
        }

        const data: any = await res.json();
        return {
            ok: true,
            serverName: data.ServerName || data.Name || (type === "JELLYFIN" ? "Jellyfin Server" : "Emby Server"),
            version: data.Version || "Unknown",
            os: data.OperatingSystem || data.SystemArchitecture || "Linux",
            latencyMs
        };
    } catch (err: any) {
        return {
            ok: false,
            latencyMs: Date.now() - start,
            error: err.name === "AbortError" ? "Connection timed out" : (err.message || "Failed to reach media server")
        };
    }
}

/**
 * Discovers virtual folders and media libraries configured on Jellyfin or Emby.
 */
export async function fetchMediaServerLibraries(
    type: "JELLYFIN" | "EMBY",
    url: string,
    apiKey: string,
    timeoutMs = 7000
): Promise<MediaServerLibrary[]> {
    const cleanUrl = cleanBaseUrl(url);
    if (!cleanUrl || !apiKey) return [];

    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        // 1. Try /Library/VirtualFolders
        const res = await mediaServerFetch(cleanUrl, "/Library/VirtualFolders", apiKey, {
            method: "GET",
            signal: controller.signal
        });
        clearTimeout(timer);

        if (res.ok) {
            const data: any = await res.json();
            if (Array.isArray(data) && data.length > 0) {
                return data.map((folder: any) => ({
                    id: String(folder.ItemId || folder.Id || folder.Name),
                    title: folder.Name || "Media Library",
                    type: (folder.CollectionType || "mixed").toLowerCase()
                }));
            }
        }

        // 2. Fallback: Query root views via /Users or /Library/MediaFolders
        const fallbackRes = await mediaServerFetch(cleanUrl, "/Library/MediaFolders", apiKey, {
            method: "GET"
        }).catch(() => null);

        if (fallbackRes && fallbackRes.ok) {
            const fbData: any = await fallbackRes.json();
            const items = fbData.Items || fbData;
            if (Array.isArray(items)) {
                return items.map((f: any) => ({
                    id: String(f.Id || f.ItemId || f.Name),
                    title: f.Name || "Media Library",
                    type: (f.CollectionType || f.Type || "mixed").toLowerCase()
                }));
            }
        }

        return [];
    } catch (err) {
        console.warn(`[MEDIA-SERVER-LIBS] Failed to fetch libraries from ${type} (${cleanUrl}):`, err);
        return [];
    }
}

/**
 * Synchronizes user account existence and library folder permissions in Jellyfin or Emby.
 */
export async function syncUserMediaServerAccess(
    server: { id: string; name: string; type: string; url: string; apiKey: string },
    user: { id: string; username: string; email?: string; jellyfinUserId?: string | null; embyUserId?: string | null },
    enabledServer: boolean,
    selectedLibraryIds: string[]
): Promise<{ success: boolean; remoteUserId?: string; error?: string }> {
    const cleanUrl = cleanBaseUrl(server.url);
    if (!cleanUrl || !server.apiKey) {
        return { success: false, error: "Missing server URL or API key" };
    }

    const isJellyfin = server.type.toUpperCase() === "JELLYFIN";
    const existingRemoteId = isJellyfin ? user.jellyfinUserId : user.embyUserId;

    try {
        let remoteUserId = existingRemoteId || "";

        // 1. Locate remote user ID if not known
        if (!remoteUserId) {
            const usersRes = await mediaServerFetch(server.url, "/Users", server.apiKey);

            if (usersRes.ok) {
                const usersList: any = await usersRes.json();
                if (Array.isArray(usersList)) {
                    const match = usersList.find((u: any) => 
                        (u.Name && u.Name.toLowerCase() === user.username.toLowerCase()) ||
                        (user.email && u.Email && u.Email.toLowerCase() === user.email.toLowerCase())
                    );
                    if (match) {
                        remoteUserId = match.Id;
                    }
                }
            }
        }

        // 2. If user doesn't exist and access is enabled, create user
        if (!remoteUserId && enabledServer) {
            const createRes = await mediaServerFetch(server.url, "/Users/New", server.apiKey, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    Name: user.username
                })
            });

            if (createRes.ok) {
                const newUser: any = await createRes.json();
                remoteUserId = newUser.Id;
            } else {
                return { success: false, error: `Failed to create remote user in ${server.type}: HTTP ${createRes.status}` };
            }
        }

        if (!remoteUserId) {
            // User does not exist and is disabled, nothing to sync
            return { success: true };
        }

        // 3. Update Policy (Folder Whitelist + Disabled State)
        const policyRes = await mediaServerFetch(server.url, `/Users/${remoteUserId}/Policy`, server.apiKey, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                EnableAllFolders: false,
                EnabledFolders: enabledServer ? selectedLibraryIds : [],
                IsDisabled: !enabledServer
            })
        });

        if (!policyRes.ok) {
            return { success: false, remoteUserId, error: `Failed to update user folder policy: HTTP ${policyRes.status}` };
        }

        return { success: true, remoteUserId };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to sync media server user access" };
    }
}

/**
 * Ensures a user account exists on Jellyfin or Emby, creating it with an initial blank password if absent,
 * and applying their permitted library whitelist.
 */
export async function ensureUserMediaServerAccount(
    server: { id: string; name: string; type: string; url: string; apiKey: string },
    user: { id: string; username: string; email?: string; jellyfinUserId?: string | null; embyUserId?: string | null },
    allowedLibraryIds: string[] = []
): Promise<{ success: boolean; remoteUserId?: string; created: boolean; error?: string }> {
    const cleanUrl = cleanBaseUrl(server.url);
    if (!cleanUrl || !server.apiKey) {
        return { success: false, created: false, error: "Missing server URL or API key" };
    }

    const isJellyfin = server.type.toUpperCase() === "JELLYFIN";
    let remoteUserId = (isJellyfin ? user.jellyfinUserId : user.embyUserId) || "";

    try {
        // 1. Check if user already exists on remote server
        if (!remoteUserId) {
            const usersRes = await mediaServerFetch(server.url, "/Users", server.apiKey);
            if (usersRes.ok) {
                const usersList: any = await usersRes.json();
                if (Array.isArray(usersList)) {
                    const match = usersList.find((u: any) => 
                        (u.Name && u.Name.toLowerCase() === user.username.toLowerCase()) ||
                        (user.email && u.Email && u.Email.toLowerCase() === user.email.toLowerCase())
                    );
                    if (match) {
                        remoteUserId = match.Id;
                    }
                }
            }
        }

        let wasCreated = false;
        // 2. If user doesn't exist, create them with blank password
        if (!remoteUserId) {
            const createRes = await mediaServerFetch(server.url, "/Users/New", server.apiKey, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    Name: user.username
                })
            });

            if (createRes.ok) {
                const newUser: any = await createRes.json();
                remoteUserId = newUser.Id;
                wasCreated = true;
            } else {
                return { 
                    success: false, 
                    created: false, 
                    error: `Failed to create account in ${server.type}: HTTP ${createRes.status}` 
                };
            }
        }

        // 3. Apply permitted library folder whitelist & enable account
        if (remoteUserId) {
            await mediaServerFetch(server.url, `/Users/${remoteUserId}/Policy`, server.apiKey, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    EnableAllFolders: allowedLibraryIds.length === 0,
                    EnabledFolders: allowedLibraryIds,
                    IsDisabled: false
                })
            });
        }

        return { success: true, remoteUserId, created: wasCreated };
    } catch (err: any) {
        return { success: false, created: false, error: err.message || "Failed to provision user on media server" };
    }
}

/**
 * Sets a dedicated streaming password for a user on Jellyfin or Emby using the admin API key.
 */
export async function setUserMediaServerPassword(
    serverUrl: string,
    apiKey: string,
    remoteUserId: string,
    newPassword: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await mediaServerFetch(
            serverUrl,
            `/Users/${remoteUserId}/Password`,
            apiKey,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    Id: remoteUserId,
                    NewPw: newPassword,
                    ResetPassword: false
                })
            }
        );

        if (!res.ok) {
            return { success: false, error: `Failed to set streaming password: HTTP ${res.status}` };
        }

        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to set streaming password" };
    }
}
