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
    internalOk?: boolean;
    internalLatencyMs?: number;
    internalError?: string;
    summary?: string;
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
 * Supports dual-URL testing (Public Client URL + Internal LAN Fallback URL).
 */
export async function testMediaServerConnection(
    type: "JELLYFIN" | "EMBY",
    url: string,
    apiKey: string,
    timeoutMs = 6000,
    internalUrl?: string
): Promise<MediaServerConnectionResult> {
    const cleanPublic = cleanBaseUrl(url);
    const cleanInternal = internalUrl ? cleanBaseUrl(internalUrl) : "";

    if (!cleanPublic && !cleanInternal) {
        return { ok: false, error: "Missing server URL or API key" };
    }
    if (!apiKey) {
        return { ok: false, error: "Missing API key" };
    }

    // Helper to probe a single target
    const probeTarget = async (targetUrl: string): Promise<{ ok: boolean; latencyMs: number; data?: any; error?: string }> => {
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const res = await mediaServerFetch(targetUrl, "/System/Info", apiKey, {
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

            const data = await res.json().catch(() => ({}));
            return { ok: true, latencyMs, data };
        } catch (err: any) {
            return {
                ok: false,
                latencyMs: Date.now() - start,
                error: err.name === "AbortError" ? "Connection timed out" : (err.message || "Failed to reach media server")
            };
        }
    };

    // Probe targets in parallel if internalUrl is provided
    const [publicResult, internalResult] = await Promise.all([
        cleanPublic ? probeTarget(cleanPublic) : Promise.resolve(null),
        cleanInternal ? probeTarget(cleanInternal) : Promise.resolve(null)
    ]);

    // Consolidate response data
    const activeData = (internalResult?.ok ? internalResult.data : null) || (publicResult?.ok ? publicResult.data : null) || {};
    const serverName = activeData.ServerName || activeData.Name || (type === "JELLYFIN" ? "Jellyfin Server" : "Emby Server");
    const version = activeData.Version || "Unknown";
    const os = activeData.OperatingSystem || activeData.SystemArchitecture || "Linux";

    if (publicResult && internalResult) {
        const bothOk = publicResult.ok && internalResult.ok;
        const eitherOk = publicResult.ok || internalResult.ok;

        let summary = "";
        if (bothOk) {
            summary = `Connected (Public: ${publicResult.latencyMs}ms • LAN: ${internalResult.latencyMs}ms)`;
        } else if (internalResult.ok && !publicResult.ok) {
            summary = `LAN Operational (${internalResult.latencyMs}ms) • Public Reverse Proxy Unreachable (${publicResult.error})`;
        } else if (publicResult.ok && !internalResult.ok) {
            summary = `Public Operational (${publicResult.latencyMs}ms) • Internal LAN Unreachable (${internalResult.error})`;
        } else {
            summary = `Failed: Public (${publicResult.error}) • LAN (${internalResult.error})`;
        }

        return {
            ok: eitherOk,
            serverName,
            version,
            os,
            latencyMs: publicResult.latencyMs,
            internalOk: internalResult.ok,
            internalLatencyMs: internalResult.latencyMs,
            internalError: internalResult.ok ? undefined : internalResult.error,
            summary,
            error: eitherOk ? undefined : summary
        };
    }

    // Single target probe result
    const primary = publicResult || internalResult!;
    return {
        ok: primary.ok,
        serverName: primary.ok ? serverName : undefined,
        version: primary.ok ? version : undefined,
        os: primary.ok ? os : undefined,
        latencyMs: primary.latencyMs,
        error: primary.error
    };
}

/**
 * Discovers virtual folders and media libraries configured on Jellyfin or Emby.
 * Prefers internal LAN URL if available to bypass proxy header stripping and SSL overhead.
 */
export async function fetchMediaServerLibraries(
    type: "JELLYFIN" | "EMBY",
    url: string,
    apiKey: string,
    timeoutMs = 7000,
    internalUrl?: string
): Promise<MediaServerLibrary[]> {
    const urlsToTry = [internalUrl, url].filter(Boolean).map(u => cleanBaseUrl(u!));
    if (urlsToTry.length === 0 || !apiKey) return [];

    for (const targetUrl of urlsToTry) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            // 1. Try /Library/VirtualFolders
            const res = await mediaServerFetch(targetUrl, "/Library/VirtualFolders", apiKey, {
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

            // 2. Fallback: Query root views via /Library/MediaFolders
            const fallbackRes = await mediaServerFetch(targetUrl, "/Library/MediaFolders", apiKey, {
                method: "GET"
            }).catch(() => null);

            if (fallbackRes && fallbackRes.ok) {
                const fbData: any = await fallbackRes.json();
                const items = fbData.Items || fbData;
                if (Array.isArray(items) && items.length > 0) {
                    return items.map((f: any) => ({
                        id: String(f.Id || f.ItemId || f.Name),
                        title: f.Name || "Media Library",
                        type: (f.CollectionType || f.Type || "mixed").toLowerCase()
                    }));
                }
            }
        } catch (err) {
            console.warn(`[MEDIA-SERVER-LIBS] Failed to fetch libraries from ${type} (${targetUrl}):`, err);
        }
    }

    return [];
}

/**
 * Executes a resilient media server API call, trying internal LAN URL first if available,
 * and falling back to public URL.
 */
export async function resilientMediaServerFetch(
    server: { url: string; internalUrl?: string | null; apiKey: string },
    endpoint: string,
    options: RequestInit = {}
): Promise<Response> {
    const candidateUrls = [server.internalUrl, server.url].filter(Boolean) as string[];
    let lastResponse: Response | null = null;
    let lastErr: any = null;

    for (const rawUrl of candidateUrls) {
        try {
            const res = await mediaServerFetch(rawUrl, endpoint, server.apiKey, options);
            if (res.ok) {
                return res;
            }
            lastResponse = res;
        } catch (err: any) {
            lastErr = err;
        }
    }

    if (lastResponse) return lastResponse;
    throw lastErr || new Error("Failed to contact media server on any configured URL");
}

/**
 * Synchronizes user account existence and library folder permissions in Jellyfin or Emby.
 */
export async function syncUserMediaServerAccess(
    server: { id: string; name: string; type: string; url: string; internalUrl?: string | null; apiKey: string },
    user: { id: string; username: string; email?: string; jellyfinUserId?: string | null; embyUserId?: string | null },
    enabledServer: boolean,
    selectedLibraryIds: string[]
): Promise<{ success: boolean; remoteUserId?: string; error?: string }> {
    const cleanUrl = cleanBaseUrl(server.internalUrl || server.url);
    if (!cleanUrl || !server.apiKey) {
        return { success: false, error: "Missing server URL or API key" };
    }

    const isJellyfin = server.type.toUpperCase() === "JELLYFIN";
    const existingRemoteId = isJellyfin ? user.jellyfinUserId : user.embyUserId;

    try {
        let remoteUserId = existingRemoteId || "";

        // 1. Locate remote user ID if not known
        if (!remoteUserId) {
            const usersRes = await resilientMediaServerFetch(server, "/Users");

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
            const createRes = await resilientMediaServerFetch(server, "/Users/New", {
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
        const policyRes = await resilientMediaServerFetch(server, `/Users/${remoteUserId}/Policy`, {
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
    server: { id: string; name: string; type: string; url: string; internalUrl?: string | null; apiKey: string },
    user: { id: string; username: string; email?: string; jellyfinUserId?: string | null; embyUserId?: string | null },
    allowedLibraryIds: string[] = []
): Promise<{ success: boolean; remoteUserId?: string; created: boolean; error?: string }> {
    const cleanUrl = cleanBaseUrl(server.internalUrl || server.url);
    if (!cleanUrl || !server.apiKey) {
        return { success: false, created: false, error: "Missing server URL or API key" };
    }

    const isJellyfin = server.type.toUpperCase() === "JELLYFIN";
    let remoteUserId = (isJellyfin ? user.jellyfinUserId : user.embyUserId) || "";

    try {
        // 1. Check if user already exists on remote server
        if (!remoteUserId) {
            const usersRes = await resilientMediaServerFetch(server, "/Users");
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
            const createRes = await resilientMediaServerFetch(server, "/Users/New", {
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
            await resilientMediaServerFetch(server, `/Users/${remoteUserId}/Policy`, {
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
    newPassword: string,
    internalUrl?: string | null
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await resilientMediaServerFetch(
            { url: serverUrl, internalUrl, apiKey },
            `/Users/${remoteUserId}/Password`,
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

/**
 * Authorizes a Jellyfin Quick Connect code for a specific user using admin credentials.
 * Works seamlessly across both Internal LAN and Public URL endpoints.
 */
export async function authorizeQuickConnect(
    server: { url: string; internalUrl?: string | null; apiKey: string },
    code: string,
    userId: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    const cleanCode = (code || "").trim().toUpperCase();
    if (!cleanCode) {
        return { success: false, error: "Missing Quick Connect code." };
    }
    if (!userId) {
        return { success: false, error: "Missing user ID for authorization." };
    }

    try {
        const endpoint = `/QuickConnect/Authorize?code=${encodeURIComponent(cleanCode)}&userId=${encodeURIComponent(userId)}&Code=${encodeURIComponent(cleanCode)}&UserId=${encodeURIComponent(userId)}`;
        const res = await resilientMediaServerFetch(server, endpoint, {
            method: "POST"
        });

        if (res.ok || res.status === 204) {
            const bodyText = await res.text().catch(() => "");
            if (bodyText.trim() === "false") {
                return {
                    success: false,
                    error: `Code "${cleanCode}" was rejected by Jellyfin (not found or expired). Please select "Quick Connect" on your TV to generate a fresh 6-character code.`
                };
            }
            return {
                success: true,
                message: `Device successfully authorized for code ${cleanCode}! Your TV will log in immediately.`
            };
        }

        if (res.status === 404) {
            return {
                success: false,
                error: `Code "${cleanCode}" was not found or has expired. Please check your TV screen for a fresh code.`
            };
        }

        if (res.status === 401) {
            return {
                success: false,
                error: "Unauthorized: API key does not have permission to authorize Quick Connect."
            };
        }

        const body = await res.text().catch(() => "");
        return {
            success: false,
            error: `Jellyfin returned HTTP ${res.status}: ${body || res.statusText}`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to authorize Quick Connect on media server" };
    }
}

/**
 * Fetches all active playback sessions from a Jellyfin or Emby server.
 * Returns normalized session items matching Portalarr's stream telemetry model.
 */
export async function fetchMediaServerActiveSessions(
    server: { id: string; name: string; type: string; url: string; internalUrl?: string | null; apiKey: string }
): Promise<any[]> {
    try {
        const res = await resilientMediaServerFetch(server, "/Sessions?activeWithinSeconds=960", {
            cache: "no-store",
            signal: AbortSignal.timeout(3500)
        });
        if (!res.ok) return [];
        const rawSessions = await res.json().catch(() => []);
        if (!Array.isArray(rawSessions)) return [];

        const activeSessions: any[] = [];
        for (const s of rawSessions) {
            if (!s || !s.NowPlayingItem) continue;

            const nowPlaying = s.NowPlayingItem;
            const playState = s.PlayState || {};
            const transcodeInfo = s.TranscodingInfo;

            const isEpisode = nowPlaying.Type === "Episode" || !!nowPlaying.SeriesName;
            const seasonNum = nowPlaying.ParentIndexNumber !== undefined ? Number(nowPlaying.ParentIndexNumber) : undefined;
            const episodeNum = nowPlaying.IndexNumber !== undefined ? Number(nowPlaying.IndexNumber) : undefined;
            const seasonEpisodeTag = (seasonNum !== undefined && episodeNum !== undefined)
                ? `S${String(seasonNum).padStart(2, "0")}E${String(episodeNum).padStart(2, "0")}`
                : (seasonNum !== undefined ? `S${String(seasonNum).padStart(2, "0")}` : (nowPlaying.SeasonName || ""));

            let fullTitle = nowPlaying.Name || "Unknown Media";
            if (isEpisode && nowPlaying.SeriesName) {
                if (seasonEpisodeTag) {
                    fullTitle = `${nowPlaying.SeriesName} - ${seasonEpisodeTag}${nowPlaying.Name ? `: ${nowPlaying.Name}` : ""}`;
                } else {
                    fullTitle = `${nowPlaying.SeriesName} - ${nowPlaying.Name || "Episode"}`;
                }
            }

            const rawSessionKey = String(s.Id || `${nowPlaying.Id}_${s.DeviceId}`);
            const uniqueStreamKey = `${server.type.toLowerCase()}_${server.id}_${rawSessionKey}`;
            const userTitle = s.UserName || "Media User";

            // Poster image URL
            const cleanBase = (server.url || "").replace(/\/+$/, "");
            const thumbUrl = nowPlaying.Id
                ? `${cleanBase}/Items/${nowPlaying.Id}/Images/Primary?maxWidth=400&quality=85`
                : null;

            const isDirectPlay = playState.PlayMethod === "DirectPlay" || (!transcodeInfo && playState.PlayMethod !== "Transcode");
            const isDirectStream = playState.PlayMethod === "DirectStream";
            const isTranscode = Boolean(transcodeInfo || playState.PlayMethod === "Transcode");

            const videoDecision = isTranscode ? "transcode" : (isDirectStream ? "direct stream" : "direct play");
            const audioDecision = transcodeInfo?.IsAudioDirect === false ? "transcode" : "direct play";

            const videoCodec = (transcodeInfo?.VideoCodec || nowPlaying.MediaStreams?.find((m: any) => m.Type === "Video")?.Codec || "").toUpperCase();
            const audioCodec = (transcodeInfo?.AudioCodec || nowPlaying.MediaStreams?.find((m: any) => m.Type === "Audio")?.Codec || "").toUpperCase();

            let progressPercent = 0;
            if (nowPlaying.RunTimeTicks && playState.PositionTicks) {
                progressPercent = Math.min(100, Math.max(0, Math.round((playState.PositionTicks / nowPlaying.RunTimeTicks) * 100)));
            }

            const streamBitrate = transcodeInfo?.Bitrate
                ? Math.round(transcodeInfo.Bitrate / 1000)
                : (nowPlaying.Bitrate ? Math.round(nowPlaying.Bitrate / 1000) : 0);

            let durationMinutes = 0;
            let viewOffsetMinutes = 0;
            if (nowPlaying.RunTimeTicks) {
                durationMinutes = Math.round(Number(nowPlaying.RunTimeTicks) / (10000000 * 60));
            }
            if (playState.PositionTicks) {
                viewOffsetMinutes = Math.round(Number(playState.PositionTicks) / (10000000 * 60));
            }

            const videoStream = nowPlaying.MediaStreams?.find((m: any) => m.Type === 'Video');
            const videoHeight = videoStream?.Height || transcodeInfo?.Height;
            const videoResolution = videoHeight 
                ? (videoHeight >= 2160 ? '4K' : videoHeight >= 1080 ? '1080p' : videoHeight >= 720 ? '720p' : '480p') 
                : '1080p';

            const sessionItem: any = {
                instanceId: `media_server_${server.id}`,
                instanceName: server.name,
                serverId: server.id,
                serverName: server.name,
                serverType: server.type, // "JELLYFIN" | "EMBY"
                sessionKey: rawSessionKey,
                sessionId: String(s.Id || ""),
                uniqueStreamKey,
                user: userTitle,
                email: "",
                title: fullTitle,
                fullTitle,
                grandparentTitle: nowPlaying.SeriesName || "",
                parentTitle: nowPlaying.SeasonName || "",
                seasonNum,
                episodeNum,
                seasonEpisodeTag,
                episodeTitle: isEpisode ? (nowPlaying.Name || "") : "",
                mediaType: isEpisode ? "episode" : "movie",
                year: nowPlaying.ProductionYear ? String(nowPlaying.ProductionYear) : "",
                thumb: thumbUrl,
                player: s.Client || s.DeviceName || `${server.type} Client`,
                platform: s.DeviceName || s.Client || "",
                device: s.DeviceName || s.Client || "",
                ipAddress: s.RemoteEndPoint?.split(":")?.[0] || "",
                videoDecision,
                audioDecision,
                transcodeDecision: videoDecision,
                streamVideoResolution: videoResolution,
                sourceVideoResolution: videoResolution,
                videoCodec,
                audioCodec,
                streamBitrate,
                streamBitrateMbps: (streamBitrate ? (streamBitrate / 1000).toFixed(1) : "0"),
                bandwidthMbps: (streamBitrate ? (streamBitrate / 1000).toFixed(1) : "0"),
                transcodeHwRequested: Boolean(transcodeInfo?.HardwareAccelerationType),
                transcodeHwDecoding: transcodeInfo?.HardwareAccelerationType || "",
                transcodeHwEncoding: transcodeInfo?.HardwareAccelerationType || "",
                durationMinutes,
                viewOffsetMinutes,
                progressPercent,
                state: playState.IsPaused ? "paused" : "playing"
            };

            activeSessions.push(sessionItem);
        }

        return activeSessions;
    } catch (err: any) {
        console.warn(`[MEDIA-SERVER-SESSIONS] Failed fetching sessions for ${server.name} (${server.type}):`, err?.message || err);
        return [];
    }
}

/**
 * Remotely terminates an active playback session on a Jellyfin or Emby server.
 */
export async function stopMediaServerSession(
    server: { url: string; internalUrl?: string | null; apiKey: string },
    sessionId: string
): Promise<boolean> {
    try {
        const res = await resilientMediaServerFetch(
            server,
            `/Sessions/${encodeURIComponent(sessionId)}/Playing/Stop`,
            { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ Command: "Stop" }) }
        );
        return res.ok || res.status === 204;
    } catch {
        return false;
    }
}
