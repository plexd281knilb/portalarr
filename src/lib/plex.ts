import { decryptData } from "@/lib/encryption";
import prisma from "@/lib/prisma";

export interface PlexFriendItem {
    id?: number | string;
    email: string;
    username: string;
    thumb?: string;
}

export async function getPlexServerFriends(adminToken: string): Promise<PlexFriendItem[]> {
    const friendsMap = new Map<string, PlexFriendItem>();

    const addFriend = (rawEmail?: string, rawUsername?: string, rawId?: number | string, rawThumb?: string) => {
        const email = (rawEmail || "").toLowerCase().trim();
        const username = (rawUsername || (email ? email.split('@')[0] : "")).trim();
        if (!email && !username) return;
        const key = email || username.toLowerCase();
        const existing = friendsMap.get(key);
        if (!existing) {
            friendsMap.set(key, { 
                id: rawId || undefined, 
                email, 
                username, 
                thumb: rawThumb || undefined 
            });
        } else {
            if (!existing.id && rawId) existing.id = rawId;
            if (!existing.thumb && rawThumb) existing.thumb = rawThumb;
            if (!existing.email && email) existing.email = email;
            if (!existing.username && username) existing.username = username;
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
                    const rawId = u.id || item.id;
                    const rawThumb = u.thumb || item.thumb;
                    addFriend(u.email || item.email, u.username || item.username || u.title || item.title, rawId, rawThumb);
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
                    const u = item.user || item.invited || {};
                    const rawId = u.id || item.user_id || item.userID;
                    const rawThumb = u.thumb || item.thumb;
                    addFriend(u.email || item.email || item.invitedEmail, u.username || item.username || u.title || item.title, rawId, rawThumb);
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] /api/v2/shared_servers error:", e);
    }

    // 3. Fetch legacy XML /api/users
    try {
        const xmlRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${encodeURIComponent(adminToken)}`);
        if (xmlRes.ok) {
            const xmlText = await xmlRes.text();
            const userBlocks = xmlText.matchAll(/<User\b([^>]*?)(?:\/>|>[\s\S]*?<\/User>)/gi);
            for (const match of userBlocks) {
                const attrs = match[1] || "";
                const id = attrs.match(/\bid="([^"]*)"/i)?.[1];
                const email = attrs.match(/\bemail="([^"]*)"/i)?.[1];
                const username = attrs.match(/\busername="([^"]*)"/i)?.[1] || attrs.match(/\btitle="([^"]*)"/i)?.[1];
                const thumb = attrs.match(/\bthumb="([^"]*)"/i)?.[1];
                addFriend(email, username, id, thumb);
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] /api/users XML error:", e);
    }

    // 4. Fetch canonical server-specific shared_servers XML across owned servers
    try {
        const servers = await getPlexServers(adminToken);
        await Promise.allSettled(servers.map(async (srv) => {
            if (!srv.clientIdentifier) return;
            try {
                const srvRes = await fetch(`https://plex.tv/api/servers/${encodeURIComponent(srv.clientIdentifier)}/shared_servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                    headers: {
                        "Accept": "application/xml, text/xml, */*",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                    }
                });
                if (srvRes.ok) {
                    const xml = await srvRes.text();
                    const matches = xml.matchAll(/<SharedServer\b([^>]*?)(?:\/>|>[\s\S]*?<\/SharedServer>)/gi);
                    for (const m of matches) {
                        const attrs = m[1] || "";
                        const email = attrs.match(/\bemail="([^"]*)"/i)?.[1] || attrs.match(/\binvitedEmail="([^"]*)"/i)?.[1];
                        const username = attrs.match(/\busername="([^"]*)"/i)?.[1];
                        const userId = attrs.match(/\buserID="([^"]*)"/i)?.[1];
                        addFriend(email, username, userId);
                    }
                }
            } catch (e) {}
        }));
    } catch (e) {}

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
    let servers = await getPlexServers(adminToken);
    
    // If getPlexServers returned 0, try legacy /api/servers to discover servers
    if (servers.length === 0) {
        try {
            const srvXmlRes = await fetch(`https://plex.tv/api/servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                headers: { "X-Plex-Token": adminToken, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
            });
            if (srvXmlRes.ok) {
                const srvXml = await srvXmlRes.text();
                const srvMatches = srvXml.matchAll(/<Server\b([^>]*?)(?:\/>|>[\s\S]*?<\/Server>)/gi);
                for (const sm of srvMatches) {
                    const attrs = sm[1] || "";
                    const machineIdentifier = attrs.match(/\bmachineIdentifier="([^"]*)"/i)?.[1] || "";
                    const name = attrs.match(/\bname="([^"]*)"/i)?.[1] || "Plex Server";
                    if (machineIdentifier) {
                        servers.push({
                            name,
                            clientIdentifier: machineIdentifier,
                            accessToken: adminToken,
                            connections: []
                        });
                    }
                }
            }
        } catch (e) {}
    }

    const results: PlexServerWithSections[] = [];

    await Promise.allSettled(servers.map(async (srv) => {
        const token = srv.accessToken || adminToken;
        let sectionsFound = false;

        for (const conn of srv.connections) {
            try {
                const cleanBase = conn.uri.replace(/\/+$/, "");
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 4000);

                const res = await fetch(`${cleanBase}/library/sections?X-Plex-Token=${encodeURIComponent(token)}`, {
                    headers: {
                        "Accept": "application/json, application/xml, text/xml, */*",
                        "X-Plex-Token": token,
                        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                    },
                    signal: controller.signal,
                    cache: "no-store"
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const contentType = res.headers.get("content-type") || "";
                    let sections: PlexLibrarySection[] = [];

                    if (contentType.includes("json")) {
                        const data = await res.json();
                        const rawDirs = data.MediaContainer?.Directory || [];
                        const dirs = Array.isArray(rawDirs) ? rawDirs : [rawDirs];
                        sections = dirs.map((d: any) => ({
                            id: parseInt(d.key, 10) || parseInt(d.id, 10) || 0,
                            key: String(d.key),
                            title: d.title || "Untitled Library",
                            type: d.type || "unknown",
                            agent: d.agent,
                            scanner: d.scanner,
                            thumb: d.thumb
                        })).filter((s: PlexLibrarySection) => s.id > 0);
                    } else {
                        const xmlText = await res.text();
                        const dirMatches = xmlText.matchAll(/<Directory\b([^>]*?)(?:\/>|>[\s\S]*?<\/Directory>)/gi);
                        for (const dm of dirMatches) {
                            const dAttrs = dm[1] || "";
                            const key = dAttrs.match(/\bkey="([^"]*)"/i)?.[1] || "";
                            const title = dAttrs.match(/\btitle="([^"]*)"/i)?.[1] || "Untitled Library";
                            const type = dAttrs.match(/\btype="([^"]*)"/i)?.[1] || "unknown";
                            const id = parseInt(key, 10) || 0;
                            if (id > 0) {
                                sections.push({
                                    id,
                                    key,
                                    title,
                                    type
                                });
                            }
                        }
                    }

                    if (sections.length > 0) {
                        results.push({
                            serverId: srv.clientIdentifier,
                            serverName: srv.name,
                            serverUrl: cleanBase,
                            sections
                        });
                        sectionsFound = true;
                        break;
                    }
                }
            } catch (e) {
                // Try next connection candidate
            }
        }

        // Fallback: If direct PMS connection failed or returned no sections, query plex.tv server shared_servers XML!
        if (!sectionsFound && srv.clientIdentifier) {
            try {
                const tvRes = await fetch(`https://plex.tv/api/servers/${encodeURIComponent(srv.clientIdentifier)}/shared_servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                    headers: {
                        "Accept": "application/xml, text/xml, */*",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                    },
                    cache: "no-store"
                });
                if (tvRes.ok) {
                    const xml = await tvRes.text();
                    const secMap = new Map<number, PlexLibrarySection>();
                    const secMatches = xml.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                    for (const sm of secMatches) {
                        const sAttrs = sm[1] || "";
                        const secId = parseInt(sAttrs.match(/\bid="([^"]*)"/i)?.[1] || sAttrs.match(/\bkey="([^"]*)"/i)?.[1] || "", 10);
                        const title = sAttrs.match(/\btitle="([^"]*)"/i)?.[1] || `Section ${secId}`;
                        const type = sAttrs.match(/\btype="([^"]*)"/i)?.[1] || "movie";
                        if (!isNaN(secId) && secId > 0 && !secMap.has(secId)) {
                            secMap.set(secId, {
                                id: secId,
                                key: String(secId),
                                title,
                                type
                            });
                        }
                    }
                    if (secMap.size > 0) {
                        results.push({
                            serverId: srv.clientIdentifier,
                            serverName: srv.name,
                            serverUrl: srv.connections[0]?.uri || "",
                            sections: Array.from(secMap.values())
                        });
                    }
                }
            } catch (tvErr) {
                console.warn(`[PLEX-API] Fallback plex.tv section lookup failed for ${srv.clientIdentifier}:`, tvErr);
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
    allLibraries?: boolean;
    accepted?: boolean;
}

export async function getPlexSharedServersList(adminToken: string): Promise<PlexSharedServerItem[]> {
    if (!adminToken) return [];
    const items: PlexSharedServerItem[] = [];

    // 1. Fetch servers to query canonical server-specific shared_servers
    let servers = await getPlexServers(adminToken);
    if (servers.length === 0) {
        try {
            const srvXmlRes = await fetch(`https://plex.tv/api/servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                headers: { "X-Plex-Token": adminToken, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
            });
            if (srvXmlRes.ok) {
                const srvXml = await srvXmlRes.text();
                const srvMatches = srvXml.matchAll(/<Server\b([^>]*?)(?:\/>|>[\s\S]*?<\/Server>)/gi);
                for (const sm of srvMatches) {
                    const attrs = sm[1] || "";
                    const machineIdentifier = attrs.match(/\bmachineIdentifier="([^"]*)"/i)?.[1] || "";
                    const name = attrs.match(/\bname="([^"]*)"/i)?.[1] || "Plex Server";
                    if (machineIdentifier) {
                        servers.push({
                            name,
                            clientIdentifier: machineIdentifier,
                            accessToken: adminToken,
                            connections: []
                        });
                    }
                }
            }
        } catch (e) {}
    }

    // 2. Fetch canonical server-specific shared_servers XML for each server
    for (const srv of servers) {
        const srvId = srv.clientIdentifier;
        if (!srvId) continue;
        try {
            const res = await fetch(`https://plex.tv/api/servers/${encodeURIComponent(srvId)}/shared_servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                headers: {
                    "Accept": "application/xml, text/xml, */*",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                cache: "no-store"
            });
            if (res.ok) {
                const xmlText = await res.text();
                const serverBlockMatches = xmlText.matchAll(/<SharedServer\b([^>]*?)(?:\/>|>([\s\S]*?)<\/SharedServer>)/gi);
                for (const match of serverBlockMatches) {
                    const attrs = match[1] || "";
                    const inner = match[2] || "";

                    const shareId = attrs.match(/\bid="([^"]*)"/i)?.[1] || "";
                    const username = attrs.match(/\busername="([^"]*)"/i)?.[1] || "";
                    const email = attrs.match(/\bemail="([^"]*)"/i)?.[1] || "";
                    const invitedEmail = attrs.match(/\binvitedEmail="([^"]*)"/i)?.[1] || email;
                    const userId = parseInt(attrs.match(/\buserID="([^"]*)"/i)?.[1] || "0", 10);
                    const allLibraries = attrs.match(/\ballLibraries="([^"]*)"/i)?.[1] === "1";
                    const serverName = attrs.match(/\bname="([^"]*)"/i)?.[1] || srv.name;

                    const sectionIds: number[] = [];
                    if (inner) {
                        const secMatches = inner.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                        for (const sm of secMatches) {
                            const sAttrs = sm[1] || "";
                            const secId = parseInt(sAttrs.match(/\bid="([^"]*)"/i)?.[1] || sAttrs.match(/\bkey="([^"]*)"/i)?.[1] || "", 10);
                            const isShared = sAttrs.match(/\bshared="([^"]*)"/i)?.[1] === "1";
                            if (!isNaN(secId) && (isShared || allLibraries)) {
                                sectionIds.push(secId);
                            }
                        }
                    }

                    if (shareId || username || email) {
                        items.push({
                            id: shareId,
                            serverId: srvId,
                            serverName,
                            user: {
                                id: userId || undefined,
                                email,
                                username,
                                title: username
                            },
                            invitedEmail,
                            librarySectionIds: sectionIds,
                            allLibraries,
                            accepted: true
                        });
                    }
                }
            }
        } catch (srvErr) {
            console.warn(`[PLEX-API] Failed to fetch shared_servers for server ${srvId}:`, srvErr);
        }
    }

    // 3. Complement with modern JSON from https://plex.tv/api/v2/shared_servers
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
                    const rawUser = item.user || item.invited || {};
                    const shareId = String(item.id || "");
                    const uEmail = rawUser.email || item.email || item.invitedEmail || item.invited_email || "";
                    const uName = rawUser.username || rawUser.title || item.username || item.title || "";
                    const mId = item.machine_identifier || item.machineIdentifier || item.server_id || item.serverId || "";

                    let sectionIds: number[] = [];
                    if (Array.isArray(item.library_section_ids)) {
                        sectionIds = item.library_section_ids.map((s: any) => parseInt(s, 10)).filter((n: number) => !isNaN(n));
                    } else if (Array.isArray(item.librarySectionIDs)) {
                        sectionIds = item.librarySectionIDs.map((s: any) => parseInt(s, 10)).filter((n: number) => !isNaN(n));
                    } else if (Array.isArray(item.librarySectionIds)) {
                        sectionIds = item.librarySectionIds.map((s: any) => parseInt(s, 10)).filter((n: number) => !isNaN(n));
                    } else if (Array.isArray(item.sections)) {
                        sectionIds = item.sections.map((s: any) => parseInt(typeof s === "object" ? (s.id || s.key) : s, 10)).filter((n: number) => !isNaN(n));
                    }

                    const isAll = Boolean(
                        item.all_libraries === true || 
                        item.allLibraries === true || 
                        item.all_libraries === 1 || 
                        item.allLibraries === 1 || 
                        item.all_libraries === "1" || 
                        item.allLibraries === "1"
                    );

                    // Check if already in items
                    const existingIdx = items.findIndex(it => 
                        (it.id && shareId && String(it.id) === shareId) ||
                        (mId && it.serverId === mId && (
                            (it.user.email && uEmail && it.user.email.toLowerCase() === uEmail.toLowerCase()) ||
                            (it.user.username && uName && it.user.username.toLowerCase() === uName.toLowerCase())
                        ))
                    );

                    if (existingIdx >= 0) {
                        if (!items[existingIdx].user.thumb && rawUser.thumb) {
                            items[existingIdx].user.thumb = rawUser.thumb;
                        }
                        if (items[existingIdx].librarySectionIds.length === 0 && sectionIds.length > 0) {
                            items[existingIdx].librarySectionIds = sectionIds;
                        }
                        items[existingIdx].allLibraries = items[existingIdx].allLibraries || isAll;
                    } else {
                        items.push({
                            id: item.id,
                            serverId: mId || (servers[0]?.clientIdentifier || ""),
                            serverName: item.server_name || item.serverName,
                            user: {
                                id: rawUser.id || item.user_id || item.userID,
                                email: uEmail,
                                username: uName,
                                title: uName,
                                thumb: rawUser.thumb || item.thumb
                            },
                            invitedEmail: item.invited_email || item.invitedEmail || uEmail,
                            librarySectionIds: sectionIds,
                            allLibraries: isAll,
                            accepted: Boolean(item.accepted ?? true)
                        });
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] Failed to fetch shared_servers list:", e);
    }

    // 4. Enrich with legacy XML /api/users
    try {
        const xmlRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
            cache: "no-store"
        });
        if (xmlRes.ok) {
            const xmlText = await xmlRes.text();
            const userBlocks = xmlText.match(/<User\b[\s\S]*?<\/User>/gi) || [];
            for (const block of userBlocks) {
                const userEmail = block.match(/\bemail="([^"]*)"/i)?.[1] || "";
                const username = block.match(/\busername="([^"]*)"/i)?.[1] || block.match(/\btitle="([^"]*)"/i)?.[1] || "";
                const userThumb = block.match(/\bthumb="([^"]*)"/i)?.[1] || "";

                if (userThumb) {
                    const match = items.find(it => 
                        (userEmail && it.user.email?.toLowerCase() === userEmail.toLowerCase()) ||
                        (username && it.user.username?.toLowerCase() === username.toLowerCase())
                    );
                    if (match && !match.user.thumb) {
                        match.user.thumb = userThumb;
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] Failed to fetch legacy XML users list:", e);
    }

    return items;
}

export function matchesPlexUser(
    target: { id?: number | string | null; email?: string | null; username?: string | null; plexEmail?: string | null; plexUsername?: string | null },
    share: PlexSharedServerItem | { user?: { id?: number | string; email?: string; username?: string; title?: string; thumb?: string }; invitedEmail?: string }
): boolean {
    // 0. Direct Plex user ID match if available
    if (target.id && share.user?.id && String(target.id) === String(share.user.id)) {
        return true;
    }

    const clean = (s?: string | null) => (s || "").toLowerCase().trim();
    const alphanumeric = (s?: string | null) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");

    const targetCandidates = [
        target.plexEmail,
        target.email,
        target.plexUsername,
        target.username
    ].map(clean).filter(Boolean);

    const targetPrefixes = targetCandidates
        .filter(c => c.includes("@"))
        .map(c => c.split("@")[0])
        .filter(Boolean);

    const shareCandidates = [
        share.user?.email,
        share.invitedEmail,
        share.user?.username,
        share.user?.title
    ].map(clean).filter(Boolean);

    const sharePrefixes = shareCandidates
        .filter(c => c.includes("@"))
        .map(c => c.split("@")[0])
        .filter(Boolean);

    // 1. Direct lowercase string match
    for (const tc of targetCandidates) {
        for (const sc of shareCandidates) {
            if (tc === sc) return true;
        }
    }

    // 2. Email prefix matches username
    for (const tp of targetPrefixes) {
        for (const sc of shareCandidates) {
            if (tp === sc) return true;
        }
    }
    for (const sp of sharePrefixes) {
        for (const tc of targetCandidates) {
            if (sp === tc) return true;
        }
    }

    // 3. Alphanumeric match (ignoring dots, underscores, dashes) if length >= 3
    const targetAlnum = [...targetCandidates, ...targetPrefixes].map(alphanumeric).filter(s => s.length >= 3);
    const shareAlnum = [...shareCandidates, ...sharePrefixes].map(alphanumeric).filter(s => s.length >= 3);

    for (const ta of targetAlnum) {
        for (const sa of shareAlnum) {
            if (ta === sa) return true;
        }
    }

    return false;
}

export async function findPlexUserFriend(
    adminToken: string,
    target: { id?: number | string | null; email?: string | null; username?: string | null; plexEmail?: string | null; plexUsername?: string | null }
): Promise<PlexFriendItem | null> {
    if (!adminToken) return null;
    const friends = await getPlexServerFriends(adminToken);
    for (const friend of friends) {
        if (target.id && friend.id && String(target.id) === String(friend.id)) {
            return friend;
        }
        if (matchesPlexUser(target, {
            id: "",
            serverId: "",
            librarySectionIds: [],
            user: { 
                id: friend.id ? Number(friend.id) : undefined, 
                email: friend.email, 
                username: friend.username, 
                title: friend.username, 
                thumb: friend.thumb 
            },
            invitedEmail: friend.email
        })) {
            return friend;
        }
    }
    return null;
}

export async function getUserPlexSharedLibraries(
    adminToken: string, 
    user: { email?: string | null; username?: string | null; plexEmail?: string | null; plexUsername?: string | null }
): Promise<{ matchedShares: PlexSharedServerItem[]; selectedKeys: string[]; hasPlexShare: boolean }> {
    if (!adminToken) return { matchedShares: [], selectedKeys: [], hasPlexShare: false };

    const [shares, serversWithSections] = await Promise.all([
        getPlexSharedServersList(adminToken),
        getPlexServerLibrarySections(adminToken)
    ]);

    const matchedShares = shares.filter(s => matchesPlexUser(user, s));
    const selectedKeys: string[] = [];

    for (const share of matchedShares) {
        let srvId = share.serverId;
        let server = serversWithSections.find(srv => srv.serverId === srvId);

        // Fall back to primary server if single server exists
        if (!server && serversWithSections.length === 1) {
            server = serversWithSections[0];
            srvId = server.serverId;
        }

        if (server) {
            if (share.allLibraries) {
                // All libraries on this server
                for (const sec of server.sections) {
                    selectedKeys.push(`${srvId}:${sec.id}`);
                }
            } else {
                // Only explicitly shared library sections for this server
                for (const secId of share.librarySectionIds) {
                    const secExists = server.sections.some(s => s.id === secId);
                    if (secExists) {
                        selectedKeys.push(`${srvId}:${secId}`);
                    }
                }
            }
        } else if (srvId) {
            for (const secId of share.librarySectionIds) {
                selectedKeys.push(`${srvId}:${secId}`);
            }
        }
    }

    return {
        matchedShares,
        selectedKeys: Array.from(new Set(selectedKeys)),
        hasPlexShare: matchedShares.length > 0
    };
}

export async function invitePlexFriendAndShare(
    adminToken: string, 
    serverId: string, 
    emailOrUsername: string, 
    librarySectionIds?: number[],
    invitedId?: number | string
): Promise<{ success: boolean; shareId?: string | number; message?: string; error?: string }> {
    if (!adminToken) return { success: false, error: "Missing Plex Admin Token." };
    if (!emailOrUsername && !invitedId) return { success: false, error: "Missing email, username, or Plex friend ID." };

    const cleanTarget = (emailOrUsername || "").trim();
    const sectionIds = Array.isArray(librarySectionIds) ? librarySectionIds : [];
    let numInvitedId = invitedId ? (parseInt(String(invitedId), 10) || undefined) : undefined;

    // Self-healing: if invitedId was not provided, look up friend by target email/username
    if (!numInvitedId && cleanTarget) {
        try {
            const friend = await findPlexUserFriend(adminToken, { email: cleanTarget, username: cleanTarget });
            if (friend?.id) {
                numInvitedId = parseInt(String(friend.id), 10) || undefined;
            }
        } catch (fErr) {}
    }

    let success = false;
    let shareId: string | number | undefined = undefined;
    let errorMsg = "";

    // 1. Direct Canonical Server Endpoint: POST https://plex.tv/api/servers/{serverId}/shared_servers
    if (serverId) {
        try {
            const payload: any = {
                server_id: serverId,
                shared_server: {
                    library_section_ids: sectionIds,
                    ...(numInvitedId ? { invited_id: numInvitedId } : {}),
                    ...(cleanTarget ? { invited_email: cleanTarget } : {})
                },
                sharing_settings: {}
            };

            const url = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers?X-Plex-Token=${encodeURIComponent(adminToken)}`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "Content-Type": "application/json",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                body: JSON.stringify(payload)
            });

            if (res.ok) {
                success = true;
                const text = await res.text();
                if (text.startsWith("{")) {
                    try {
                        const json = JSON.parse(text);
                        shareId = json.id || json.shared_server?.id;
                    } catch (je) {}
                } else {
                    const matchId = text.match(/\bid="([^"]*)"/i)?.[1];
                    if (matchId) shareId = matchId;
                }
            } else {
                const errText = await res.text().catch(() => "");
                errorMsg = `Server endpoint error (${res.status}): ${errText || res.statusText}`;

                // If already shared or conflict, update their existing share
                if (res.status === 400 || res.status === 409 || res.status === 422 || errText.toLowerCase().includes("already")) {
                    const existing = await getPlexSharedServersList(adminToken);
                    const match = existing.find(s => 
                        (s.serverId === serverId || !s.serverId) &&
                        matchesPlexUser({ id: numInvitedId, email: cleanTarget, username: cleanTarget }, s)
                    );
                    if (match && match.id) {
                        return await updatePlexUserShareSections(adminToken, String(match.id), sectionIds, serverId);
                    }
                }
            }
        } catch (e: any) {
            errorMsg = e.message || "Network error in server direct invite";
        }
    }

    // 2. Modern plex.tv v2 API endpoint: POST https://plex.tv/api/v2/shared_servers
    if (!success) {
        try {
            const payload: any = {
                invited_email: cleanTarget,
                library_section_ids: sectionIds,
                librarySectionIDs: sectionIds,
                all_libraries: false,
                allLibraries: false
            };
            if (numInvitedId) payload.invited_id = numInvitedId;
            if (serverId) {
                payload.machine_identifier = serverId;
                payload.server_id = serverId;
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
                    message: `Successfully granted Plex library access to ${cleanTarget || 'user'} (${sectionIds.length} libraries).`
                };
            } else {
                const errText = await res.text().catch(() => "");
                if (res.status === 400 || res.status === 409 || res.status === 422 || errText.toLowerCase().includes("already")) {
                    const existing = await getPlexSharedServersList(adminToken);
                    const match = existing.find(s => 
                        (s.serverId === serverId || !s.serverId) &&
                        matchesPlexUser({ id: numInvitedId, email: cleanTarget, username: cleanTarget }, s)
                    );
                    if (match && match.id) {
                        return await updatePlexUserShareSections(adminToken, String(match.id), sectionIds, serverId);
                    }
                }
                if (!errorMsg) {
                    errorMsg = `v2 error (${res.status}): ${errText || res.statusText}`;
                }
            }
        } catch (e: any) {
            if (!errorMsg) errorMsg = e.message || "Network error in v2 invite";
        }
    }

    if (success) {
        return {
            success: true,
            shareId,
            message: `Successfully granted Plex library access to ${cleanTarget || 'user'} (${sectionIds.length} libraries).`
        };
    }

    return {
        success: false,
        error: errorMsg || `Could not share Plex libraries with ${cleanTarget || 'user'}.`
    };
}

export async function updatePlexUserShareSections(
    adminToken: string, 
    shareId: string | number, 
    librarySectionIds: number[],
    serverId?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!adminToken) return { success: false, error: "Missing Plex Admin Token." };
    if (!shareId) return { success: false, error: "Missing Plex Share ID." };

    // In Plex, a share cannot exist with 0 libraries. Removing the share is required.
    if (!librarySectionIds || librarySectionIds.length === 0) {
        return await removePlexUserShare(adminToken, shareId, serverId);
    }

    let success = false;
    let errorMsg = "";

    // 1. Canonical Rails Server PUT endpoint: PUT https://plex.tv/api/servers/{serverId}/shared_servers/{shareId}
    if (serverId) {
        try {
            const payload = {
                server_id: serverId,
                shared_server: {
                    library_section_ids: librarySectionIds
                }
            };
            const url = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers/${encodeURIComponent(String(shareId))}?X-Plex-Token=${encodeURIComponent(adminToken)}`;
            const res = await fetch(url, {
                method: "PUT",
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "Content-Type": "application/json",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                body: JSON.stringify(payload)
            });
            if (res.ok) {
                success = true;
            } else {
                const text = await res.text().catch(() => "");
                errorMsg = `Server PUT error (${res.status}): ${text || res.statusText}`;
            }
        } catch (e: any) {
            errorMsg = e.message || "Network error in server share PUT";
        }
    }

    // 2. Modern plex.tv v2 API endpoint: PUT https://plex.tv/api/v2/shared_servers/{shareId}
    if (!success) {
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
                    library_section_ids: librarySectionIds,
                    librarySectionIDs: librarySectionIds,
                    all_libraries: false,
                    allLibraries: false
                })
            });

            if (res.ok) {
                success = true;
            } else if (!success) {
                const errText = await res.text().catch(() => "");
                errorMsg = `v2 PUT error (${res.status}): ${errText || res.statusText}`;
            }
        } catch (e: any) {
            if (!success) errorMsg = e.message || "Network error updating Plex share";
        }
    }

    // 3. Fallback query param URL on direct server endpoint
    if (!success && serverId) {
        try {
            const xmlUrl = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers/${encodeURIComponent(String(shareId))}?library_section_ids=${librarySectionIds.join(",")}&allLibraries=0&X-Plex-Token=${encodeURIComponent(adminToken)}`;
            const res = await fetch(xmlUrl, {
                method: "PUT",
                headers: {
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });
            if (res.ok) {
                success = true;
            }
        } catch (e: any) {
            console.warn("[PLEX-API] Fallback XML update share error:", e);
        }
    }

    if (success) {
        return {
            success: true,
            message: `Updated Plex library shares (${librarySectionIds.length} libraries enabled).`
        };
    } else {
        return {
            success: false,
            error: errorMsg || "Failed to update Plex shared libraries."
        };
    }
}

export async function removePlexUserShare(
    adminToken: string, 
    shareId: string | number,
    serverId?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!adminToken) return { success: false, error: "Missing Plex Admin Token." };
    if (!shareId) return { success: false, error: "Missing Plex Share ID." };

    let success = false;
    let errorMsg = "";

    // 1. Direct server XML endpoint (canonical PMS share deletion)
    if (serverId) {
        try {
            const xmlUrl = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers/${encodeURIComponent(String(shareId))}?X-Plex-Token=${encodeURIComponent(adminToken)}`;
            const res = await fetch(xmlUrl, {
                method: "DELETE",
                headers: {
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });
            if (res.ok) {
                success = true;
            } else {
                errorMsg = `Server endpoint error (${res.status}): ${res.statusText}`;
            }
        } catch (e: any) {
            errorMsg = e.message || "Network error deleting server share";
        }
    }

    // 2. Modern plex.tv v2 API endpoint
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
            success = true;
        } else if (!success) {
            const errText = await res.text().catch(() => "");
            errorMsg = `v2 endpoint error (${res.status}): ${errText || res.statusText}`;
        }
    } catch (e: any) {
        if (!success) errorMsg = e.message || "Network error deleting v2 share";
    }

    if (success) {
        return {
            success: true,
            message: "Plex share removed successfully."
        };
    }

    return {
        success: false,
        error: errorMsg || "Failed to remove Plex share."
    };
}

