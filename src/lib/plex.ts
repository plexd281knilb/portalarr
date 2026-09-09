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

let cachedServers: { token: string; timestamp: number; data: PlexServerResource[] } | null = null;
const SERVERS_CACHE_TTL = 30000; // 30 seconds

export async function getPlexServers(adminToken: string, forceRefresh = false): Promise<PlexServerResource[]> {
    if (!adminToken) return [];
    if (!forceRefresh && cachedServers && cachedServers.token === adminToken && (Date.now() - cachedServers.timestamp < SERVERS_CACHE_TTL)) {
        return cachedServers.data;
    }

    const parseResources = (data: any[]): PlexServerResource[] => {
        const servers: PlexServerResource[] = [];
        for (const item of data) {
            const provides = (item.provides || "").toLowerCase();
            if (provides.includes("server")) {
                const conns = Array.isArray(item.connections) ? item.connections : [];
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
    };

    // 1. Try modern resources endpoint with includeHttps=1 (omit includeRelay=1 to avoid relay hang)
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);
        const res = await fetch("https://plex.tv/api/v2/resources?includeHttps=1", {
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            signal: controller.signal,
            cache: "no-store"
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                const srvs = parseResources(data);
                if (srvs.length > 0) {
                    cachedServers = { token: adminToken, timestamp: Date.now(), data: srvs };
                    return srvs;
                }
            }
        }
    } catch (e: any) {}

    // 2. Fast Fallback: /api/v2/resources without query params
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 4000);
        const res = await fetch("https://plex.tv/api/v2/resources", {
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            signal: controller.signal,
            cache: "no-store"
        });
        clearTimeout(timeoutId);
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                const srvs = parseResources(data);
                if (srvs.length > 0) {
                    cachedServers = { token: adminToken, timestamp: Date.now(), data: srvs };
                    return srvs;
                }
            }
        }
    } catch (e) {}

    // 3. Fast Fallback: /api/servers (canonical XML endpoint, always succeeds in <300ms)
    try {
        const res = await fetch(`https://plex.tv/api/servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
            headers: {
                "Accept": "application/xml, text/xml, */*",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });
        if (res.ok) {
            const xml = await res.text();
            const srvMatches = xml.matchAll(/<Server\b([^>]*?)(?:\/>|>[\s\S]*?<\/Server>)/gi);
            const servers: PlexServerResource[] = [];
            for (const sm of srvMatches) {
                const attrs = sm[1] || "";
                const machineId = attrs.match(/\bmachineIdentifier="([^"]*)"/i)?.[1] || "";
                const name = attrs.match(/\bname="([^"]*)"/i)?.[1] || "Plex Server";
                const host = attrs.match(/\baddress="([^"]*)"/i)?.[1] || attrs.match(/\bhost="([^"]*)"/i)?.[1] || "";
                const port = parseInt(attrs.match(/\bport="([^"]*)"/i)?.[1] || "32400", 10);
                const scheme = attrs.match(/\bscheme="([^"]*)"/i)?.[1] || "http";
                const token = attrs.match(/\baccessToken="([^"]*)"/i)?.[1] || adminToken;
                if (machineId) {
                    servers.push({
                        name,
                        clientIdentifier: machineId,
                        accessToken: token,
                        connections: host ? [{
                            uri: `${scheme}://${host}:${port}`,
                            local: true,
                            relay: false,
                            address: host,
                            port
                        }] : []
                    });
                }
            }
            if (servers.length > 0) {
                cachedServers = { token: adminToken, timestamp: Date.now(), data: servers };
                return servers;
            }
        }
    } catch (e) {}

    // 4. Fallback: Lookup configured DB URLs from Settings / MediaApp
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const plexApps = await prisma.mediaApp.findMany({ where: { type: "plex" } });
        const dbUrls: string[] = [];
        if (settings?.mainPlexUrl) dbUrls.push(settings.mainPlexUrl);
        for (const app of plexApps) {
            if (app.url && !dbUrls.includes(app.url)) dbUrls.push(app.url);
        }
        if (dbUrls.length > 0) {
            const servers: PlexServerResource[] = [];
            for (let i = 0; i < dbUrls.length; i++) {
                servers.push({
                    name: i === 0 ? "Main Plex Server" : `Plex Server ${i + 1}`,
                    clientIdentifier: `plex-configured-${i + 1}`,
                    accessToken: adminToken,
                    connections: [{ uri: dbUrls[i], local: true, relay: false, address: "", port: 32400 }]
                });
            }
            return servers;
        }
    } catch (dbErr) {}

    return [];
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

export async function getPlexServerLibrarySections(adminToken: string, customPlexUrl?: string): Promise<PlexServerWithSections[]> {
    if (!adminToken) return [];

    // 1. Cloud discovery from canonical https://plex.tv/api/servers and https://plex.tv/pms/servers.xml
    // Plex Cloud stores every library section (<Section id="1" title="Movies" type="movie" />)
    // for all servers owned by the admin, regardless of whether direct IP connection is accessible!
    const cloudServersMap = new Map<string, { serverId: string; serverName: string; directUrl?: string; sections: PlexLibrarySection[] }>();

    const parseServerXml = (xml: string) => {
        const srvBlocks = xml.matchAll(/<Server\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Server>)/gi);
        for (const sb of srvBlocks) {
            const attrs = sb[1] || "";
            const inner = sb[2] || "";
            const machineId = attrs.match(/\bmachineIdentifier=["']?([^"'\s>]+)["']?/i)?.[1] || "";
            const name = attrs.match(/\bname=["']([^"']*)["']/i)?.[1] || "Plex Server";
            const host = attrs.match(/\baddress=["']?([^"'\s>]+)["']?/i)?.[1] || attrs.match(/\bhost=["']?([^"'\s>]+)["']?/i)?.[1] || "";
            const port = attrs.match(/\bport=["']?([^"'\s>]+)["']?/i)?.[1] || "32400";
            const scheme = attrs.match(/\bscheme=["']?([^"'\s>]+)["']?/i)?.[1] || "http";
            const directUrl = host ? `${scheme}://${host}:${port}` : undefined;

            const sections: PlexLibrarySection[] = [];
            if (inner) {
                const secMatches = inner.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                for (const sm of secMatches) {
                    const sAttrs = sm[1] || "";
                    const id = parseInt(sAttrs.match(/\bid=["']?([^"'\s>]+)["']?/i)?.[1] || sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || "0", 10);
                    const key = sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || String(id);
                    const title = sAttrs.match(/\btitle=["']([^"']*)["']/i)?.[1] || "Untitled Library";
                    const type = sAttrs.match(/\btype=["']([^"']*)["']/i)?.[1] || "movie";
                    if (!isNaN(id) && id > 0) {
                        sections.push({ id, key, title, type });
                    }
                }
            }
            if (machineId) {
                const existing = cloudServersMap.get(machineId);
                if (!existing) {
                    cloudServersMap.set(machineId, { serverId: machineId, serverName: name, directUrl, sections });
                } else if (sections.length > 0 && existing.sections.length === 0) {
                    existing.sections = sections;
                }
            }
        }
    };

    try {
        const srvXmlRes = await fetch(`https://plex.tv/api/servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
            headers: { 
                "Accept": "application/xml, text/xml, */*",
                "X-Plex-Token": adminToken, 
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" 
            },
            cache: "no-store"
        });
        if (srvXmlRes.ok) {
            parseServerXml(await srvXmlRes.text());
        }
    } catch (cloudErr) {
        console.warn("[PLEX-API] Failed to fetch cloud servers XML from api/servers:", cloudErr);
    }

    if (cloudServersMap.size === 0) {
        try {
            const pmsXmlRes = await fetch(`https://plex.tv/pms/servers.xml?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                headers: { 
                    "Accept": "application/xml, text/xml, */*",
                    "X-Plex-Token": adminToken, 
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" 
                },
                cache: "no-store"
            });
            if (pmsXmlRes.ok) {
                parseServerXml(await pmsXmlRes.text());
            }
        } catch (pmsErr) {}
    }

    // Also supplement sections from /api/v2/shared_servers if available
    try {
        const v2Res = await fetch("https://plex.tv/api/v2/shared_servers", {
            headers: {
                "Accept": "application/json",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });
        if (v2Res.ok) {
            const v2Data = await v2Res.json();
            if (Array.isArray(v2Data)) {
                for (const item of v2Data) {
                    const mId = item.machineIdentifier || item.server?.machineIdentifier || item.server_id;
                    const sName = item.server?.name || item.serverName || "Plex Server";
                    const itemSections: PlexLibrarySection[] = [];
                    const rawSecs = item.sections || item.library_sections || [];
                    if (Array.isArray(rawSecs)) {
                        for (const s of rawSecs) {
                            const id = parseInt(String(s.id || s.key || 0), 10);
                            const key = String(s.key || id);
                            const title = s.title || `Library ${id}`;
                            const type = s.type || "movie";
                            if (id > 0) {
                                itemSections.push({ id, key, title, type });
                            }
                        }
                    }
                    if (mId && itemSections.length > 0) {
                        const existing = cloudServersMap.get(mId);
                        if (!existing) {
                            cloudServersMap.set(mId, { serverId: mId, serverName: sName, sections: itemSections });
                        } else {
                            for (const sec of itemSections) {
                                if (!existing.sections.some(x => x.id === sec.id)) {
                                    existing.sections.push(sec);
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (v2Err) {}

    // 2. Fetch server resources from /api/v2/resources
    let servers = await getPlexServers(adminToken);

    // If getPlexServers returned 0, populate from cloudServersMap
    if (servers.length === 0 && cloudServersMap.size > 0) {
        for (const [mId, cSrv] of cloudServersMap.entries()) {
            servers.push({
                name: cSrv.serverName,
                clientIdentifier: mId,
                accessToken: adminToken,
                connections: cSrv.directUrl ? [{ uri: cSrv.directUrl, local: true, relay: false, address: "", port: 32400 }] : []
            });
        }
    }

    // 3. Lookup configured mainPlexUrl or MediaApp URLs from DB
    const dbPlexUrls: string[] = [];
    if (customPlexUrl) {
        dbPlexUrls.push(customPlexUrl);
    }
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (settings?.mainPlexUrl) dbPlexUrls.push(settings.mainPlexUrl);
        const plexApps = await prisma.mediaApp.findMany({ where: { type: "plex" } });
        for (const app of plexApps) {
            if (app.url && !dbPlexUrls.includes(app.url)) dbPlexUrls.push(app.url);
        }
    } catch (dbErr) {}

    // If still 0 servers discovered, synthesize from configured DB URLs
    if (servers.length === 0 && dbPlexUrls.length > 0) {
        for (let i = 0; i < dbPlexUrls.length; i++) {
            servers.push({
                name: i === 0 ? "Main Plex Server" : `Plex Server ${i + 1}`,
                clientIdentifier: `plex-configured-${i + 1}`,
                accessToken: adminToken,
                connections: [{ uri: dbPlexUrls[i], local: true, relay: false, address: "", port: 32400 }]
            });
        }
    }

    const results: PlexServerWithSections[] = [];

    await Promise.allSettled(servers.map(async (srv) => {
        const token = srv.accessToken || adminToken;
        let sectionsFound = false;

        // Build candidate connection URLs for direct PMS access
        const candidates: string[] = [];
        // 1. Configured DB URLs (fast local LAN)
        for (const u of dbPlexUrls) {
            if (u && !candidates.includes(u)) candidates.push(u);
        }
        // 2. Direct LAN IP:port from connections (bypasses .plex.direct DNS rebinding!)
        for (const conn of srv.connections) {
            if (conn.address && conn.port) {
                const httpUrl = `http://${conn.address}:${conn.port}`;
                if (!candidates.includes(httpUrl)) candidates.push(httpUrl);
            }
        }
        // 3. Cloud directUrl
        const cloudSrv = cloudServersMap.get(srv.clientIdentifier);
        if (cloudSrv?.directUrl && !candidates.includes(cloudSrv.directUrl)) {
            candidates.push(cloudSrv.directUrl);
        }
        // 4. Other connection URIs (.plex.direct, https, relay)
        for (const conn of srv.connections) {
            if (conn.uri && !candidates.includes(conn.uri)) candidates.push(conn.uri);
            if (conn.address && conn.port) {
                const httpsUrl = `https://${conn.address}:${conn.port}`;
                if (!candidates.includes(httpsUrl)) candidates.push(httpsUrl);
            }
        }

        // Try direct PMS connections
        for (const candUrl of candidates) {
            try {
                const cleanBase = candUrl.replace(/\/+$/, "");
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2500);

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
                    let serverMachineId = srv.clientIdentifier;

                    if (contentType.includes("json")) {
                        const data = await res.json();
                        if (data.MediaContainer?.machineIdentifier) {
                            serverMachineId = data.MediaContainer.machineIdentifier;
                        }
                        const rawDirs = data.MediaContainer?.Directory || [];
                        const dirs = Array.isArray(rawDirs) ? rawDirs : [rawDirs];
                        const cloudSrv = cloudServersMap.get(serverMachineId) || cloudServersMap.get(srv.clientIdentifier);
                        sections = dirs.map((d: any) => {
                            const pmsKey = String(d.key);
                            const title = d.title || "Untitled Library";
                            const cloudSec = cloudSrv?.sections?.find(cs => cs.key === pmsKey || cs.title.toLowerCase() === title.toLowerCase());
                            const finalId = cloudSec?.id || parseInt(d.id || d.key, 10) || 0;
                            return {
                                id: finalId,
                                key: pmsKey,
                                title,
                                type: d.type || "unknown",
                                agent: d.agent,
                                scanner: d.scanner,
                                thumb: d.thumb
                            };
                        }).filter((s: PlexLibrarySection) => s.id > 0);
                    } else {
                        const xmlText = await res.text();
                        const mIdMatch = xmlText.match(/\bmachineIdentifier=["']?([^"'\s>]+)["']?/i)?.[1];
                        if (mIdMatch) serverMachineId = mIdMatch;
                        const dirMatches = xmlText.matchAll(/<Directory\b([^>]*?)(?:\/>|>[\s\S]*?<\/Directory>)/gi);
                        const cloudSrv = cloudServersMap.get(serverMachineId) || cloudServersMap.get(srv.clientIdentifier);
                        for (const dm of dirMatches) {
                            const dAttrs = dm[1] || "";
                            const pmsKey = dAttrs.match(/\bkey="([^"]*)"/i)?.[1] || "";
                            const title = dAttrs.match(/\btitle="([^"]*)"/i)?.[1] || "Untitled Library";
                            const type = dAttrs.match(/\btype="([^"]*)"/i)?.[1] || "unknown";
                            const cloudSec = cloudSrv?.sections?.find(cs => cs.key === pmsKey || cs.title.toLowerCase() === title.toLowerCase());
                            const finalId = cloudSec?.id || parseInt(pmsKey, 10) || 0;
                            if (finalId > 0) {
                                sections.push({
                                    id: finalId,
                                    key: pmsKey,
                                    title,
                                    type
                                });
                            }
                        }
                    }

                    if (sections.length > 0) {
                        results.push({
                            serverId: serverMachineId,
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

        // Fallback 1: Use cloud library sections directly from https://plex.tv/api/servers!
        if (!sectionsFound && cloudSrv && cloudSrv.sections.length > 0) {
            results.push({
                serverId: srv.clientIdentifier,
                serverName: srv.name || cloudSrv.serverName,
                serverUrl: cloudSrv.directUrl || srv.connections[0]?.uri || "",
                sections: cloudSrv.sections
            });
            sectionsFound = true;
        }

        // Fallback 2: Query canonical plex.tv server XML, shared_servers/new XML, and shared_servers XML
        if (!sectionsFound && srv.clientIdentifier) {
            const urlsToTry = [
                `https://plex.tv/api/servers/${encodeURIComponent(srv.clientIdentifier)}?X-Plex-Token=${encodeURIComponent(adminToken)}`,
                `https://plex.tv/api/servers/${encodeURIComponent(srv.clientIdentifier)}/shared_servers/new?X-Plex-Token=${encodeURIComponent(adminToken)}`,
                `https://plex.tv/api/servers/${encodeURIComponent(srv.clientIdentifier)}/shared_servers?X-Plex-Token=${encodeURIComponent(adminToken)}`
            ];
            for (const tvUrl of urlsToTry) {
                if (sectionsFound) break;
                try {
                    const tvRes = await fetch(tvUrl, {
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
                            const secId = parseInt(sAttrs.match(/\bid=["']?([^"'\s>]+)["']?/i)?.[1] || sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || "", 10);
                            const secKey = sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || String(secId);
                            const title = sAttrs.match(/\btitle=["']([^"']*)["']/i)?.[1] || `Section ${secId}`;
                            const type = sAttrs.match(/\btype=["']([^"']*)["']/i)?.[1] || "movie";
                            if (!isNaN(secId) && secId > 0 && !secMap.has(secId)) {
                                secMap.set(secId, {
                                    id: secId,
                                    key: secKey,
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
                            sectionsFound = true;
                            break;
                        }
                    }
                } catch (tvErr) {
                    console.warn(`[PLEX-API] Fallback plex.tv section lookup failed for ${srv.clientIdentifier}:`, tvErr);
                }
            }
        }
    }));

    // Ensure any cloud server that was not in getPlexServers is added if it has sections
    for (const [mId, cSrv] of cloudServersMap.entries()) {
        if (!results.some(r => r.serverId === mId) && cSrv.sections.length > 0) {
            results.push({
                serverId: mId,
                serverName: cSrv.serverName,
                serverUrl: cSrv.directUrl || "",
                sections: cSrv.sections
            });
        }
    }

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

    // 1. Comprehensive discovery from canonical https://plex.tv/api/users
    // In a single fast request, /api/users returns EVERY user, their owned and shared servers,
    // the exact share ID (<Server id="..."/>), machineIdentifier, and all shared sections (<Section id="..." key="..." shared="1"/>)!
    try {
        const usersXmlRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
            headers: {
                "Accept": "application/xml, text/xml, */*",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });
        if (usersXmlRes.ok) {
            const xmlText = await usersXmlRes.text();
            const userBlocks = xmlText.matchAll(/<User\b([^>]*?)>([\s\S]*?)<\/User>/gi);
            for (const ub of userBlocks) {
                const uAttrs = ub[1] || "";
                const uInner = ub[2] || "";
                const userId = parseInt(uAttrs.match(/\bid="([^"]*)"/i)?.[1] || "0", 10);
                const userEmail = uAttrs.match(/\bemail="([^"]*)"/i)?.[1] || "";
                const username = uAttrs.match(/\busername="([^"]*)"/i)?.[1] || uAttrs.match(/\btitle="([^"]*)"/i)?.[1] || "";
                const userThumb = uAttrs.match(/\bthumb="([^"]*)"/i)?.[1] || "";

                const srvMatches = uInner.matchAll(/<Server\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Server>)/gi);
                for (const sm of srvMatches) {
                    const sAttrs = sm[1] || "";
                    const sInner = sm[2] || "";
                    const shareId = sAttrs.match(/\bid="([^"]*)"/i)?.[1] || "";
                    const machineId = sAttrs.match(/\bmachineIdentifier="([^"]*)"/i)?.[1] || "";
                    const serverName = sAttrs.match(/\bname="([^"]*)"/i)?.[1] || "Plex Server";
                    const allLibraries = sAttrs.match(/\ballLibraries="([^"]*)"/i)?.[1] === "1";

                    const secIds: number[] = [];
                    if (sInner) {
                        const secMatches = sInner.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                        for (const sc of secMatches) {
                            const scAttrs = sc[1] || "";
                            const id = parseInt(scAttrs.match(/\bid="([^"]*)"/i)?.[1] || "0", 10);
                            const key = parseInt(scAttrs.match(/\bkey="([^"]*)"/i)?.[1] || "0", 10);
                            const shared = scAttrs.match(/\bshared="([^"]*)"/i)?.[1] === "1";
                            if (shared || allLibraries) {
                                if (id > 0) secIds.push(id);
                                if (key > 0 && key !== id) secIds.push(key);
                            }
                        }
                    }

                    if (shareId || username || userEmail) {
                        items.push({
                            id: shareId,
                            serverId: machineId,
                            serverName,
                            user: {
                                id: userId || undefined,
                                email: userEmail,
                                username,
                                title: username,
                                thumb: userThumb
                            },
                            invitedEmail: userEmail,
                            librarySectionIds: secIds,
                            allLibraries,
                            accepted: true
                        });
                    }
                }
            }
        }
    } catch (usersErr) {
        console.warn("[PLEX-API] Failed to parse /api/users for shared servers:", usersErr);
    }

    // 2. Supplement with canonical server-specific shared_servers endpoint across owned servers
    let servers = await getPlexServers(adminToken);
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
                            const secId = parseInt(sAttrs.match(/\bid=["']?([^"'\s>]+)["']?/i)?.[1] || "0", 10);
                            const secKey = parseInt(sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || "0", 10);
                            const isShared = sAttrs.match(/\bshared=["']?([^"'\s>]+)["']?/i)?.[1] === "1";
                            if (isShared || allLibraries) {
                                if (!isNaN(secId) && secId > 0) sectionIds.push(secId);
                                if (!isNaN(secKey) && secKey > 0 && secKey !== secId) sectionIds.push(secKey);
                            }
                        }
                    }

                    // Check if already in items
                    const existing = items.find(it => 
                        (shareId && it.id && String(it.id) === String(shareId)) ||
                        (it.serverId === srvId && (
                            (email && it.user.email && it.user.email.toLowerCase() === email.toLowerCase()) ||
                            (username && it.user.username && it.user.username.toLowerCase() === username.toLowerCase())
                        ))
                    );

                    if (existing) {
                        if (shareId && !existing.id) existing.id = shareId;
                        if (sectionIds.length > 0) {
                            for (const sid of sectionIds) {
                                if (!existing.librarySectionIds.includes(sid)) existing.librarySectionIds.push(sid);
                            }
                        }
                        existing.allLibraries = existing.allLibraries || allLibraries;
                    } else if (shareId || username || email) {
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
        } catch (srvErr) {}
    }

    // 3. Supplement with modern JSON from https://plex.tv/api/v2/shared_servers
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
                        for (const s of item.sections) {
                            if (typeof s === "object" && s) {
                                const sid = parseInt(s.id, 10);
                                const skey = parseInt(s.key, 10);
                                if (!isNaN(sid) && sid > 0) sectionIds.push(sid);
                                if (!isNaN(skey) && skey > 0 && skey !== sid) sectionIds.push(skey);
                            } else {
                                const num = parseInt(s, 10);
                                if (!isNaN(num) && num > 0) sectionIds.push(num);
                            }
                        }
                    }

                    const isAll = Boolean(
                        item.all_libraries === true || 
                        item.allLibraries === true || 
                        item.all_libraries === 1 || 
                        item.allLibraries === 1 || 
                        item.all_libraries === "1" || 
                        item.allLibraries === "1"
                    );

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
    } catch (e) {}

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
        let server = serversWithSections.find(srv => 
            (srv.serverId && share.serverId && srv.serverId === share.serverId) ||
            (srv.serverName && share.serverName && srv.serverName.toLowerCase() === share.serverName.toLowerCase())
        );

        // Fall back to primary server if single server exists
        if (!server && serversWithSections.length === 1) {
            server = serversWithSections[0];
            srvId = server.serverId;
        }

        if (server) {
            if (share.allLibraries) {
                // All libraries on this server: push both cloud id and pms key
                for (const sec of server.sections) {
                    selectedKeys.push(`${srvId}:${sec.id}`);
                    selectedKeys.push(`${srvId}:${sec.key}`);
                }
            } else {
                // Explicitly shared library sections: match by cloud id OR pms key
                for (const sec of server.sections) {
                    const isShared = share.librarySectionIds.includes(sec.id) || 
                                     share.librarySectionIds.includes(parseInt(sec.key, 10));
                    if (isShared) {
                        selectedKeys.push(`${srvId}:${sec.id}`);
                        selectedKeys.push(`${srvId}:${sec.key}`);
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

/**
 * Resolves section keys (local PMS numbers or cloud IDs) to canonical Plex Cloud Section IDs.
 * Plex Rails PUT/POST endpoints require cloud section IDs in library_section_ids.
 */
export async function resolveServerSectionIds(
    adminToken: string,
    serverId: string,
    inputSectionIds: number[]
): Promise<number[]> {
    if (!adminToken || !serverId || !inputSectionIds || inputSectionIds.length === 0) {
        return inputSectionIds || [];
    }

    const idMap = new Map<number, number>();

    const parseServerSectionsXml = (xml: string, targetMachineId?: string) => {
        const srvBlocks = xml.matchAll(/<Server\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Server>)/gi);
        for (const sb of srvBlocks) {
            const attrs = sb[1] || "";
            const inner = sb[2] || "";
            const mId = attrs.match(/\bmachineIdentifier=["']?([^"'\s>]+)["']?/i)?.[1] || "";
            if (!targetMachineId || !mId || mId.toLowerCase() === targetMachineId.toLowerCase()) {
                const secMatches = inner.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                for (const sm of secMatches) {
                    const sAttrs = sm[1] || "";
                    const secId = parseInt(sAttrs.match(/\bid=["']?([^"'\s>]+)["']?/i)?.[1] || "", 10);
                    const secKey = parseInt(sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || "", 10);
                    if (!isNaN(secId) && secId > 0) {
                        idMap.set(secId, secId);
                        if (!isNaN(secKey) && secKey > 0) {
                            idMap.set(secKey, secId);
                        }
                    }
                }
            }
        }
    };

    // 1. Query canonical servers XML list (contains all owned servers & cloud section IDs)
    try {
        const res = await fetch(`https://plex.tv/api/servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
            headers: {
                "Accept": "application/xml, text/xml, */*",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });
        if (res.ok) {
            parseServerSectionsXml(await res.text(), serverId);
        }
    } catch (e) {}

    // 2. Fallback: query pms/servers.xml
    if (idMap.size === 0) {
        try {
            const res = await fetch(`https://plex.tv/pms/servers.xml?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                headers: {
                    "Accept": "application/xml, text/xml, */*",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                cache: "no-store"
            });
            if (res.ok) {
                parseServerSectionsXml(await res.text(), serverId);
            }
        } catch (e) {}
    }

    // 3. Fallback: query shared_servers/new XML
    if (idMap.size === 0 && serverId) {
        try {
            const resNew = await fetch(`https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers/new?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                headers: {
                    "Accept": "application/xml, text/xml, */*",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                cache: "no-store"
            });
            if (resNew.ok) {
                const xml = await resNew.text();
                const secMatches = xml.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                for (const sm of secMatches) {
                    const sAttrs = sm[1] || "";
                    const secId = parseInt(sAttrs.match(/\bid=["']?([^"'\s>]+)["']?/i)?.[1] || "", 10);
                    const secKey = parseInt(sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || "", 10);
                    if (!isNaN(secId) && secId > 0) {
                        idMap.set(secId, secId);
                        if (!isNaN(secKey) && secKey > 0) {
                            idMap.set(secKey, secId);
                        }
                    }
                }
            }
        } catch (e) {}
    }

    const resolved: number[] = [];
    for (const id of inputSectionIds) {
        const mapped = idMap.get(id) ?? id;
        if (!resolved.includes(mapped)) {
            resolved.push(mapped);
        }
    }
    return resolved;
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
    const rawSectionIds = Array.isArray(librarySectionIds) ? librarySectionIds : [];
    const sectionIds = serverId 
        ? await resolveServerSectionIds(adminToken, serverId, rawSectionIds)
        : rawSectionIds;

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

    // 0. Pre-check: if user already has a share on this server, update it directly!
    try {
        const existing = await getPlexSharedServersList(adminToken);
        const match = existing.find(s => 
            (s.serverId === serverId || !s.serverId) &&
            matchesPlexUser({ id: numInvitedId, email: cleanTarget, username: cleanTarget }, s)
        );
        if (match && match.id) {
            return await updatePlexUserShareSections(adminToken, String(match.id), sectionIds, serverId);
        }
    } catch (e) {}

    let success = false;
    let shareId: string | number | undefined = undefined;
    let errorMsg = "";

    // 1. Direct Canonical Rails Server Endpoint: POST https://plex.tv/api/servers/{serverId}/shared_servers
    // Body: JSON with server_id and shared_server (matches python-plexapi specification)
    if (serverId) {
        try {
            const sharedServerPayload: any = {
                library_section_ids: sectionIds
            };
            if (numInvitedId) {
                sharedServerPayload.invited_id = numInvitedId;
            }
            if (cleanTarget) {
                sharedServerPayload.invited_email = cleanTarget;
            }

            const bodyObj: any = {
                server_id: serverId,
                shared_server: sharedServerPayload,
                sharing_settings: {
                    allowSync: "0",
                    allowCameraUpload: "0",
                    allowChannels: "0"
                }
            };

            const url = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Accept": "application/json, text/javascript, */*",
                    "Content-Type": "application/json",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                body: JSON.stringify(bodyObj)
            });

            if (res.ok) {
                success = true;
                const data = await res.json().catch(() => null);
                if (data?.id) shareId = data.id;
            } else {
                const errText = await res.text().catch(() => "");
                errorMsg = `Server POST error (${res.status}): ${errText || res.statusText}`;

                // If already shared or conflict, update existing share
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

    // 2. Fallback: Query parameter POST on Rails endpoint
    if (!success && serverId) {
        try {
            const queryParams = new URLSearchParams({
                "library_section_ids": sectionIds.join(","),
                "allLibraries": "0",
                "X-Plex-Token": adminToken
            });
            if (cleanTarget) queryParams.set("invited_email", cleanTarget);
            if (numInvitedId) queryParams.set("invited_id", String(numInvitedId));

            const url = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers?${queryParams.toString()}`;
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Accept": "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });
            if (res.ok) {
                success = true;
            }
        } catch (e) {}
    }

    // 3. Modern plex.tv v2 API endpoint: POST https://plex.tv/api/v2/shared_servers
    if (!success) {
        try {
            const payload: any = {
                machineIdentifier: serverId,
                librarySectionIds: sectionIds,
                librarySectionIDs: sectionIds,
                allLibraries: false,
                all_libraries: false
            };
            if (numInvitedId) payload.invitedId = numInvitedId;
            if (cleanTarget) {
                payload.invitedEmail = cleanTarget;
                payload.email = cleanTarget;
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
                const data = await res.json().catch(() => null);
                return {
                    success: true,
                    shareId: data?.id,
                    message: `Successfully granted Plex library access to ${cleanTarget || 'user'} (${sectionIds.length} libraries).`
                };
            }
        } catch (e: any) {}
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

    // Resolve section IDs to ensure cloud IDs
    const resolvedSectionIds = serverId 
        ? await resolveServerSectionIds(adminToken, serverId, librarySectionIds)
        : librarySectionIds;

    let success = false;
    let errorMsg = "";

    // 1. Canonical Rails Server PUT endpoint (JSON body - matches python-plexapi specification):
    // PUT https://plex.tv/api/servers/{serverId}/shared_servers/{shareId}
    if (serverId) {
        try {
            const url = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers/${encodeURIComponent(String(shareId))}`;
            const res = await fetch(url, {
                method: "PUT",
                headers: {
                    "Accept": "application/json, text/javascript, */*",
                    "Content-Type": "application/json",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                body: JSON.stringify({
                    server_id: serverId,
                    shared_server: {
                        library_section_ids: resolvedSectionIds
                    }
                })
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

    // 2. Fallback: Direct Rails Server PUT with query parameters
    if (!success && serverId) {
        try {
            const queryUrl = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers/${encodeURIComponent(String(shareId))}?library_section_ids=${resolvedSectionIds.join(",")}&allLibraries=0&X-Plex-Token=${encodeURIComponent(adminToken)}`;
            const res = await fetch(queryUrl, {
                method: "PUT",
                headers: {
                    "Accept": "application/json, text/javascript, */*",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                }
            });
            if (res.ok) {
                success = true;
            }
        } catch (e) {}
    }

    // 3. Modern plex.tv v2 API endpoint: PUT https://plex.tv/api/v2/shared_servers/{shareId}
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
                    librarySectionIds: resolvedSectionIds,
                    librarySectionIDs: resolvedSectionIds,
                    allLibraries: false,
                    all_libraries: false
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

    if (success) {
        return {
            success: true,
            message: `Updated Plex library shares (${resolvedSectionIds.length} libraries enabled).`
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

