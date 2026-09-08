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
