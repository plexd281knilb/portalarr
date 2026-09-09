import { decryptData } from "@/lib/encryption";
import prisma from "@/lib/prisma";

export async function getPlexServerFriends(adminToken: string) {
    const friendsMap = new Map<string, { email: string; username: string }>();

    const addFriend = (rawEmail?: string, rawUsername?: string) => {
        const email = (rawEmail || "").toLowerCase().trim();
        const username = (rawUsername || (email ? email.split('@')[0] : "")).trim();
        if (!email && !username) return;
        const key = email || username.toLowerCase();
        if (!friendsMap.has(key)) {
            friendsMap.set(key, { email, username });
        }
    };

    // 1. Fetch /api/v2/friends
    try {
        const res = await fetch("https://plex.tv/api/v2/friends", {
            headers: { "Accept": "application/json", "X-Plex-Token": adminToken, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
        });
        if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
                for (const item of list) {
                    const u = item.user || item;
                    addFriend(u.email || item.email, u.username || item.username || u.title || item.title);
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] /api/v2/friends error:", e);
    }

    // 2. Fetch /api/v2/shared_servers
    try {
        const res = await fetch("https://plex.tv/api/v2/shared_servers", {
            headers: { "Accept": "application/json", "X-Plex-Token": adminToken, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
        });
        if (res.ok) {
            const list = await res.json();
            if (Array.isArray(list)) {
                for (const item of list) {
                    const u = item.user || item;
                    addFriend(u.email || item.email || item.invitedEmail, u.username || item.username || u.title || item.title);
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] /api/v2/shared_servers error:", e);
    }

    // 3. Fetch legacy XML /api/users
    try {
        const xmlRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${adminToken}`);
        if (xmlRes.ok) {
            const xmlText = await xmlRes.text();
            const userMatches = xmlText.matchAll(/<User\s+[^>]*\bemail="([^"]*)"[^>]*\busername="([^"]*)"/gi);
            for (const match of userMatches) {
                addFriend(match[1], match[2]);
            }
            const titleMatches = xmlText.matchAll(/<User\s+[^>]*\btitle="([^"]*)"[^>]*\bemail="([^"]*)"/gi);
            for (const match of titleMatches) {
                addFriend(match[2], match[1]);
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] /api/users XML error:", e);
    }

    return Array.from(friendsMap.values());
}

export async function getPlexOwnerUser(adminToken: string) {
    if (!adminToken) return null;
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch("https://plex.tv/api/v2/user", {
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            signal: controller.signal,
            next: { revalidate: 300 }
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            const u = data.user || data;
            return {
                id: u.id,
                uuid: u.uuid,
                username: u.username || u.title || "",
                email: u.email || "",
                title: u.title || u.username || "",
                thumb: u.thumb || ""
            };
        }
    } catch (e) {
        console.warn("[PLEX-API] Failed to fetch Plex owner user:", e);
    }
    return null;
}

export interface PlexServerResource {
    name: string;
    clientIdentifier: string;
    accessToken: string;
    connections: {
        uri: string;
        local: boolean;
        relay: boolean;
        address: string;
        port: number;
    }[];
}

export async function getPlexServers(adminToken: string): Promise<PlexServerResource[]> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch("https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1", {
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            signal: controller.signal,
            next: { revalidate: 120 }
        });
        clearTimeout(timeoutId);
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];

        const servers: PlexServerResource[] = [];
        for (const item of data) {
            const provides = (item.provides || "").toLowerCase();
            if (provides.includes("server")) {
                const conns = Array.isArray(item.connections) ? item.connections : [];
                // Sort connections: local non-relay first, then remote non-relay, then relay
                conns.sort((a: any, b: any) => {
                    if (a.local && !b.local) return -1;
                    if (!a.local && b.local) return 1;
                    if (!a.relay && b.relay) return -1;
                    if (a.relay && !b.relay) return 1;
                    return 0;
                });
                servers.push({
                    name: item.name || "Plex Server",
                    clientIdentifier: item.clientIdentifier || item.machineIdentifier || "",
                    accessToken: item.accessToken || adminToken,
                    connections: conns.map((c: any) => ({
                        uri: c.uri,
                        local: Boolean(c.local),
                        relay: Boolean(c.relay),
                        address: c.address,
                        port: c.port
                    }))
                });
            }
        }
        return servers;
    } catch (e) {
        console.warn("[PLEX-API] Failed to fetch Plex server resources:", e);
        return [];
    }
}

export async function getPlexActiveSessions(adminToken: string): Promise<{ serverName: string; serverUrl: string; serverId: string; token: string; sessions: any[] }[]> {
    const servers = await getPlexServers(adminToken);
    const results: { serverName: string; serverUrl: string; serverId: string; token: string; sessions: any[] }[] = [];

    await Promise.allSettled(servers.map(async (srv) => {
        const token = srv.accessToken || adminToken;
        for (const conn of srv.connections) {
            try {
                const cleanBase = conn.uri.replace(/\/+$/, "");
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500);

                const res = await fetch(`${cleanBase}/status/sessions`, {
                    headers: {
                        "Accept": "application/json",
                        "X-Plex-Token": token,
                        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                    },
                    signal: controller.signal,
                    cache: "no-store"
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    const metadata = data.MediaContainer?.Metadata || [];
                    results.push({
                        serverName: srv.name,
                        serverUrl: cleanBase,
                        serverId: srv.clientIdentifier,
                        token,
                        sessions: Array.isArray(metadata) ? metadata : [metadata]
                    });
                    break; // Successfully queried this server via this connection
                }
            } catch (e) {
                // Try next connection candidate for this server
            }
        }
    }));

    return results;
}

export async function terminatePlexServerSession(serverUrl: string, token: string, sessionKey: string, sessionId?: string, reason?: string) {
    const cleanBase = serverUrl.replace(/\/+$/, "");
    const msg = reason || "Stream ended by user via Portalarr My Plex Hub";
    let success = false;

    // 1. Try standard DELETE /status/sessions/{sessionKey}
    try {
        const deleteUrl = `${cleanBase}/status/sessions/${encodeURIComponent(sessionKey)}?reason=${encodeURIComponent(msg)}&X-Plex-Token=${encodeURIComponent(token)}`;
        const res = await fetch(deleteUrl, {
            method: "DELETE",
            headers: { 
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });
        if (res.ok) success = true;
    } catch (e) {}

    // 2. Try fallback GET /status/sessions/terminate
    if (!success && sessionId) {
        try {
            const termUrl = `${cleanBase}/status/sessions/terminate?sessionId=${encodeURIComponent(sessionId)}&reason=${encodeURIComponent(msg)}&X-Plex-Token=${encodeURIComponent(token)}`;
            const res = await fetch(termUrl, {
                headers: { 
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });
            if (res.ok) success = true;
        } catch (e) {}
    }

    return { 
        success, 
        message: success ? "Stream terminated successfully." : "Failed to terminate stream on Plex Media Server." 
    };
}

export interface PlexLibrarySection {
    id: number;
    key: string;
    title: string;
    type: string;
    agent?: string;
    scanner?: string;
    thumb?: string;
}

export interface PlexServerWithSections {
    serverId: string;
    serverName: string;
    serverUrl: string;
    sections: PlexLibrarySection[];
}

export async function getPlexServerLibrarySections(adminToken: string): Promise<PlexServerWithSections[]> {
    if (!adminToken) return [];
    const servers = await getPlexServers(adminToken);
    const results: PlexServerWithSections[] = [];

    await Promise.allSettled(servers.map(async (srv) => {
        const token = srv.accessToken || adminToken;
        for (const conn of srv.connections) {
            try {
                const cleanBase = conn.uri.replace(/\/+$/, "");
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);

                const res = await fetch(`${cleanBase}/library/sections`, {
                    headers: {
                        "Accept": "application/json",
                        "X-Plex-Token": token,
                        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                    },
                    signal: controller.signal,
                    cache: "no-store"
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    const rawDirs = data.MediaContainer?.Directory || [];
                    const dirs = Array.isArray(rawDirs) ? rawDirs : [rawDirs];
                    const sections: PlexLibrarySection[] = dirs.map((d: any) => ({
                        id: parseInt(d.key, 10) || parseInt(d.id, 10) || 0,
                        key: String(d.key),
                        title: d.title || "Untitled Library",
                        type: d.type || "unknown",
                        agent: d.agent,
                        scanner: d.scanner,
                        thumb: d.thumb
                    })).filter((s: PlexLibrarySection) => s.id > 0);

                    results.push({
                        serverId: srv.clientIdentifier,
                        serverName: srv.name,
                        serverUrl: cleanBase,
                        sections
                    });
                    break;
                }
            } catch (e) {
                // Try next connection candidate
            }
        }
    }));

    return results;
}

export interface PlexSharedServerItem {
    id: number | string;
    serverId: string;
    serverName?: string;
    user: {
        id?: number;
        email?: string;
        username?: string;
        title?: string;
        thumb?: string;
    };
    invitedEmail?: string;
    librarySectionIds: number[];
    accepted: boolean;
}

export async function getPlexSharedServersList(adminToken: string): Promise<PlexSharedServerItem[]> {
    if (!adminToken) return [];
    const items: PlexSharedServerItem[] = [];

    try {
        const res = await fetch("https://plex.tv/api/v2/shared_servers", {
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });

        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                for (const item of data) {
                    const rawUser = item.user || {};
                    const rawSections = item.library_section_ids || item.librarySectionIds || [];
                    const sectionIds = Array.isArray(rawSections) 
                        ? rawSections.map((s: any) => parseInt(s, 10)).filter((n: number) => !isNaN(n))
                        : (typeof rawSections === "string" ? rawSections.split(",").map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n)) : []);

                    items.push({
                        id: item.id,
                        serverId: item.machine_identifier || item.machineIdentifier || item.server_id || "",
                        serverName: item.server_name || item.serverName,
                        user: {
                            id: rawUser.id,
                            email: rawUser.email || item.email || item.invitedEmail,
                            username: rawUser.username || rawUser.title || item.username || item.title,
                            title: rawUser.title || rawUser.username,
                            thumb: rawUser.thumb
                        },
                        invitedEmail: item.invited_email || item.invitedEmail || rawUser.email,
                        librarySectionIds: sectionIds,
                        accepted: Boolean(item.accepted ?? true)
                    });
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] Failed to fetch shared_servers list:", e);
    }

    return items;
}

export async function invitePlexFriendAndShare(
    adminToken: string, 
    serverId: string, 
    emailOrUsername: string, 
    librarySectionIds?: number[]
): Promise<{ success: boolean; shareId?: string | number; message?: string; error?: string }> {
    if (!adminToken) return { success: false, error: "Missing Plex Admin Token." };
    if (!emailOrUsername) return { success: false, error: "Missing email or username." };

    const cleanTarget = emailOrUsername.trim();
    const sectionIds = Array.isArray(librarySectionIds) ? librarySectionIds : [];

    // 1. Try modern plex.tv v2 API
    try {
        const payload: any = {
            invited_email: cleanTarget,
            library_section_ids: sectionIds
        };
        if (serverId) {
            payload.machine_identifier = serverId;
        }

        const res = await fetch("https://plex.tv/api/v2/shared_servers", {
            method: "POST",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            const data = await res.json();
            return {
                success: true,
                shareId: data?.id,
                message: `Successfully invited ${cleanTarget} to Plex server with ${sectionIds.length} libraries shared.`
            };
        } else {
            const errText = await res.text().catch(() => "");
            // If already shared, we will try updating their existing share
            if (errText.includes("already") || res.status === 409) {
                const existing = await getPlexSharedServersList(adminToken);
                const match = existing.find(s => 
                    (s.user.email && s.user.email.toLowerCase() === cleanTarget.toLowerCase()) ||
                    (s.user.username && s.user.username.toLowerCase() === cleanTarget.toLowerCase()) ||
                    (s.invitedEmail && s.invitedEmail.toLowerCase() === cleanTarget.toLowerCase())
                );
                if (match && match.id) {
                    return await updatePlexUserShareSections(adminToken, String(match.id), sectionIds);
                }
            }
        }
    } catch (e: any) {
        console.warn("[PLEX-API] Failed v2 invite:", e);
    }

    // 2. Fallback to server direct XML endpoint
    if (serverId) {
        try {
            const xmlUrl = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers?invited_email=${encodeURIComponent(cleanTarget)}&library_section_ids=${sectionIds.join(",")}`;
            const res = await fetch(xmlUrl, {
                method: "POST",
                headers: {
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });
            if (res.ok) {
                return {
                    success: true,
                    message: `Invited ${cleanTarget} to Plex server successfully.`
                };
            }
        } catch (e: any) {
            console.warn("[PLEX-API] Fallback invite error:", e);
        }
    }

    return {
        success: false,
        error: `Could not send Plex invite to ${cleanTarget}. Please verify the Plex account username or email exists.`
    };
}

export async function updatePlexUserShareSections(
    adminToken: string, 
    shareId: string | number, 
    librarySectionIds: number[]
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!adminToken) return { success: false, error: "Missing Plex Admin Token." };
    if (!shareId) return { success: false, error: "Missing Plex Share ID." };

    try {
        const res = await fetch(`https://plex.tv/api/v2/shared_servers/${encodeURIComponent(String(shareId))}`, {
            method: "PUT",
            headers: {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            body: JSON.stringify({
                library_section_ids: librarySectionIds
            })
        });

        if (res.ok) {
            return {
                success: true,
                message: `Updated Plex library shares (${librarySectionIds.length} libraries enabled).`
            };
        } else {
            const errText = await res.text().catch(() => "");
            return {
                success: false,
                error: `Plex API returned error (${res.status}): ${errText || res.statusText}`
            };
        }
    } catch (e: any) {
        return {
            success: false,
            error: e.message || "Failed to update Plex shared libraries."
        };
    }
}

export async function removePlexUserShare(
    adminToken: string, 
    shareId: string | number
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!adminToken) return { success: false, error: "Missing Plex Admin Token." };
    if (!shareId) return { success: false, error: "Missing Plex Share ID." };

    try {
        const res = await fetch(`https://plex.tv/api/v2/shared_servers/${encodeURIComponent(String(shareId))}`, {
            method: "DELETE",
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            }
        });

        if (res.ok) {
            return {
                success: true,
                message: "Plex share removed successfully."
            };
        }
    } catch (e: any) {
        return {
            success: false,
            error: e.message || "Failed to delete Plex share."
        };
    }

    return {
        success: false,
        error: "Failed to remove Plex share."
    };
}

