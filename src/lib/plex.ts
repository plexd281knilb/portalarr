import { decryptData } from "@/lib/encryption";
import prisma from "@/lib/prisma";
import { logger, maskToken } from "@/lib/logger";

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

let cloudServersMapCache: {
    timestamp: number;
    data: Map<string, { serverId: string; serverName: string; directUrl?: string; sections: PlexLibrarySection[] }>;
} | null = null;

export async function getPlexCloudServersMap(
    adminToken: string, 
    forceRefresh = false
): Promise<Map<string, { serverId: string; serverName: string; directUrl?: string; sections: PlexLibrarySection[] }>> {
    if (!adminToken) return new Map();

    const now = Date.now();
    if (!forceRefresh && cloudServersMapCache && (now - cloudServersMapCache.timestamp < 60000)) {
        return cloudServersMapCache.data;
    }

    const cloudMap = new Map<string, { serverId: string; serverName: string; directUrl?: string; sections: PlexLibrarySection[] }>();

    const recordSection = (machineId: string, srvName: string, secId: number, secKey: string, title: string, type: string, directUrl?: string) => {
        if (!machineId) return;
        const cleanMachineId = machineId.trim();
        let srv = cloudMap.get(cleanMachineId);
        if (!srv) {
            for (const [k, v] of cloudMap.entries()) {
                if (k.toLowerCase() === cleanMachineId.toLowerCase()) {
                    srv = v;
                    break;
                }
            }
        }
        if (!srv) {
            srv = { serverId: cleanMachineId, serverName: srvName || "Plex Server", directUrl, sections: [] };
            cloudMap.set(cleanMachineId, srv);
        }
        if (srvName && (!srv.serverName || srv.serverName === "Plex Server")) {
            srv.serverName = srvName;
        }
        if (directUrl && !srv.directUrl) {
            srv.directUrl = directUrl;
        }

        const normKey = String(secKey || (secId < 1000000 ? secId : "")).trim();
        const normTitle = (title || "").trim();

        const existing = srv.sections.find(s => 
            (secId > 0 && s.id === secId) ||
            (normKey && s.key === normKey) ||
            (normTitle && s.title.toLowerCase() === normTitle.toLowerCase())
        );

        if (!existing) {
            if (secId > 0 || (normKey && parseInt(normKey, 10) > 0)) {
                srv.sections.push({
                    id: secId > 0 ? secId : (parseInt(normKey, 10) || 0),
                    key: normKey || String(secId),
                    title: normTitle || `Library ${normKey || secId}`,
                    type: type || "movie"
                });
            }
        } else {
            if (secId > 1000000 && existing.id < 1000000) {
                existing.id = secId;
            }
            if (normKey && !existing.key) {
                existing.key = normKey;
            }
            if (normTitle && (!existing.title || existing.title.startsWith("Library "))) {
                existing.title = normTitle;
            }
            if (type && (!existing.type || existing.type === "movie")) {
                existing.type = type;
            }
        }
    };

    // 1. Comprehensive discovery from canonical https://plex.tv/api/users
    try {
        const usersRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
            headers: {
                "Accept": "application/xml, text/xml, */*",
                "X-Plex-Token": adminToken,
                "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
            },
            cache: "no-store"
        });
        if (usersRes.ok) {
            const xml = await usersRes.text();
            const serverBlocks = xml.matchAll(/<Server\b([^>]*?)>([\s\S]*?)<\/Server>/gi);
            for (const sb of serverBlocks) {
                const sAttrs = sb[1] || "";
                const sInner = sb[2] || "";
                const machineId = sAttrs.match(/\bmachineIdentifier="([^"]*)"/i)?.[1] || "";
                const serverName = sAttrs.match(/\bname="([^"]*)"/i)?.[1] || "";
                if (!machineId) continue;

                const secMatches = sInner.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                for (const sm of secMatches) {
                    const scAttrs = sm[1] || "";
                    const secId = parseInt(scAttrs.match(/\bid="([^"]*)"/i)?.[1] || "0", 10);
                    const secKey = scAttrs.match(/\bkey="([^"]*)"/i)?.[1] || "";
                    const secTitle = scAttrs.match(/\btitle="([^"]*)"/i)?.[1] || "";
                    const secType = scAttrs.match(/\btype="([^"]*)"/i)?.[1] || "";
                    if (secId > 0 || secKey) {
                        recordSection(machineId, serverName, secId, secKey, secTitle, secType);
                    }
                }
            }
        }
    } catch (usersErr) {
        console.warn("[PLEX-API] Failed to fetch /api/users for cloud sections:", usersErr);
    }

    // 2. Discover servers and directUrls from /api/servers
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
            const xml = await srvXmlRes.text();
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

                if (inner) {
                    const secMatches = inner.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                    for (const sm of secMatches) {
                        const sAttrs = sm[1] || "";
                        const id = parseInt(sAttrs.match(/\bid=["']?([^"'\s>]+)["']?/i)?.[1] || sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || "0", 10);
                        const key = sAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || String(id);
                        const title = sAttrs.match(/\btitle=["']([^"']*)["']/i)?.[1] || "Untitled Library";
                        const type = sAttrs.match(/\btype=["']([^"']*)["']/i)?.[1] || "movie";
                        if (!isNaN(id) && id > 0) {
                            recordSection(machineId, name, id, key, title, type, directUrl);
                        }
                    }
                } else if (machineId) {
                    recordSection(machineId, name, 0, "", "", "", directUrl);
                }
            }
        }
    } catch (e) {}

    // 3. For all owned servers, query canonical server XML https://plex.tv/api/servers/{machineId}
    // This returns the exact cloud section IDs (e.g. 134414382) and local keys (e.g. 1) matching python-plexapi specification
    try {
        const ownedServers = await getPlexServers(adminToken).catch(() => []);
        for (const srv of ownedServers) {
            const srvId = srv.clientIdentifier;
            if (!srvId) continue;
            // 3a. Canonical server XML
            try {
                const srvRes = await fetch(`https://plex.tv/api/servers/${encodeURIComponent(srvId)}?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                    headers: {
                        "Accept": "application/xml, text/xml, */*",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                    },
                    cache: "no-store"
                });
                if (srvRes.ok) {
                    const srvXml = await srvRes.text();
                    const secMatches = srvXml.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                    for (const sm of secMatches) {
                        const scAttrs = sm[1] || "";
                        const secId = parseInt(scAttrs.match(/\bid=["']?([^"'\s>]+)["']?/i)?.[1] || "0", 10);
                        const secKey = scAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || "";
                        const secTitle = scAttrs.match(/\btitle=["']([^"']*)["']/i)?.[1] || "";
                        const secType = scAttrs.match(/\btype=["']([^"']*)["']/i)?.[1] || "";
                        if (secId > 0 || secKey) {
                            recordSection(srvId, srv.name || "", secId, secKey, secTitle, secType);
                        }
                    }
                }
            } catch (srvErr) {}

            // 3b. Shared servers XML fallback
            try {
                const shRes = await fetch(`https://plex.tv/api/servers/${encodeURIComponent(srvId)}/shared_servers?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                    headers: {
                        "Accept": "application/xml, text/xml, */*",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                    },
                    cache: "no-store"
                });
                if (shRes.ok) {
                    const shXml = await shRes.text();
                    const secMatches = shXml.matchAll(/<Section\b([^>]*?)(?:\/>|>[\s\S]*?<\/Section>)/gi);
                    for (const sm of secMatches) {
                        const scAttrs = sm[1] || "";
                        const secId = parseInt(scAttrs.match(/\bid=["']?([^"'\s>]+)["']?/i)?.[1] || "0", 10);
                        const secKey = scAttrs.match(/\bkey=["']?([^"'\s>]+)["']?/i)?.[1] || "";
                        const secTitle = scAttrs.match(/\btitle=["']([^"']*)["']/i)?.[1] || "";
                        const secType = scAttrs.match(/\btype=["']([^"']*)["']/i)?.[1] || "";
                        if (secId > 0 || secKey) {
                            recordSection(srvId, srv.name || "", secId, secKey, secTitle, secType);
                        }
                    }
                }
            } catch (shErr) {}
        }
    } catch (e) {}

    cloudServersMapCache = {
        timestamp: Date.now(),
        data: cloudMap
    };
    return cloudMap;
}

export async function getPlexServerLibrarySections(adminToken: string, customPlexUrl?: string): Promise<PlexServerWithSections[]> {
    if (!adminToken) return [];

    // 1. Cloud discovery from authoritative Plex Cloud map
    const cloudServersMap = await getPlexCloudServersMap(adminToken);

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
        const cloudSrv = cloudServersMap.get(srv.clientIdentifier) || 
                         Array.from(cloudServersMap.values()).find(c => 
                             c.serverId.toLowerCase() === srv.clientIdentifier.toLowerCase()
                         );
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
                        const cloudSrv = cloudServersMap.get(serverMachineId) || 
                                         cloudServersMap.get(srv.clientIdentifier) ||
                                         Array.from(cloudServersMap.values()).find(c => 
                                             c.serverId.toLowerCase() === serverMachineId.toLowerCase() ||
                                             c.serverId.toLowerCase() === srv.clientIdentifier.toLowerCase()
                                         );
                        sections = dirs.map((d: any) => {
                            const pmsKey = String(d.key);
                            const title = d.title || "Untitled Library";
                            const cloudSec = cloudSrv?.sections?.find(cs => 
                                cs.key === pmsKey || 
                                cs.title.toLowerCase() === title.toLowerCase() ||
                                String(cs.id) === pmsKey
                            );
                            const finalId = (cloudSec && cloudSec.id > 1000000) ? cloudSec.id : (cloudSec?.id || parseInt(d.id || d.key, 10) || 0);
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
                        const cloudSrv = cloudServersMap.get(serverMachineId) || 
                                         cloudServersMap.get(srv.clientIdentifier) ||
                                         Array.from(cloudServersMap.values()).find(c => 
                                             c.serverId.toLowerCase() === serverMachineId.toLowerCase() ||
                                             c.serverId.toLowerCase() === srv.clientIdentifier.toLowerCase()
                                         );
                        for (const dm of dirMatches) {
                            const dAttrs = dm[1] || "";
                            const pmsKey = dAttrs.match(/\bkey="([^"]*)"/i)?.[1] || "";
                            const title = dAttrs.match(/\btitle="([^"]*)"/i)?.[1] || "Untitled Library";
                            const type = dAttrs.match(/\btype="([^"]*)"/i)?.[1] || "unknown";
                            const cloudSec = cloudSrv?.sections?.find(cs => 
                                cs.key === pmsKey || 
                                cs.title.toLowerCase() === title.toLowerCase() ||
                                String(cs.id) === pmsKey
                            );
                            const finalId = (cloudSec && cloudSec.id > 1000000) ? cloudSec.id : (cloudSec?.id || parseInt(pmsKey, 10) || 0);
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
                        logger.addLog("SUCCESS", "PLEX", `✅ Loaded ${sections.length} library sections directly from "${srv.name}" (${cleanBase})`, `Sections: ${sections.map(s => `"${s.title}" (ID: ${s.id}, Key: ${s.key})`).join(", ")}`);
                        break;
                    }
                } else {
                    const text = await res.text().catch(() => "");
                    if (res.status === 401) {
                        logger.addLog("ERROR", "PLEX", `❌ PMS 401 Unauthorized on ${cleanBase}: Not authorized. Make sure the server is signed in and claimed by the account for this token (${maskToken(token)}).`, `Response: ${text.slice(0, 300)}`);
                    } else {
                        logger.addLog("WARN", "PLEX", `PMS HTTP ${res.status} on ${cleanBase}/library/sections: ${text.slice(0, 200)}`);
                    }
                }
            } catch (e: any) {
                // Try next connection candidate
            }
        }

        // Fallback 1: Use cloud library sections directly from https://plex.tv/api/servers!
        if (!sectionsFound && cloudSrv && cloudSrv.sections.length > 0) {
            logger.addLog("INFO", "PLEX", `Using Cloud library sections for "${srv.name}" (${cloudSrv.sections.length} sections found in cloud metadata)`);
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

export interface ResolvedPlexConnection {
    serverId: string;
    serverName: string;
    serverUrl: string;
    token: string;
    allCandidateUrls: string[];
}

const resolvedServerCache = new Map<string, { timestamp: number; data: ResolvedPlexConnection }>();
const RESOLVED_SERVER_CACHE_TTL = 60 * 1000; // 60 seconds

export async function resolveWorkingPlexServerConnection(
    serverIdOrName?: string,
    adminToken?: string,
    customPlexUrl?: string,
    forceRefresh = false
): Promise<ResolvedPlexConnection | null> {
    let token = adminToken || "";
    let mainPlexUrl = customPlexUrl || "";

    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!token && settings?.mainPlexToken) {
            token = decryptData(settings.mainPlexToken);
        }
        if (!mainPlexUrl && settings?.mainPlexUrl) {
            mainPlexUrl = settings.mainPlexUrl;
        }
    } catch (dbErr) {}

    if (!token) return null;

    const cacheKey = `${serverIdOrName || "default"}_${token}`;
    if (!forceRefresh && resolvedServerCache.has(cacheKey)) {
        const cached = resolvedServerCache.get(cacheKey)!;
        if (Date.now() - cached.timestamp < RESOLVED_SERVER_CACHE_TTL) {
            return cached.data;
        }
    }

    const cloudServersMap = await getPlexCloudServersMap(token).catch(() => new Map());
    const servers = await getPlexServers(token, forceRefresh).catch(() => []);

    // Also check media apps in DB
    const dbPlexUrls: string[] = [];
    if (mainPlexUrl) dbPlexUrls.push(mainPlexUrl);
    try {
        const plexApps = await prisma.mediaApp.findMany({ where: { type: "plex" } });
        for (const app of plexApps) {
            if (app.url && !dbPlexUrls.includes(app.url)) dbPlexUrls.push(app.url);
        }
    } catch (e) {}

    // Locate target server
    let targetServer: PlexServerResource | undefined;
    if (serverIdOrName) {
        targetServer = servers.find(s => 
            s.clientIdentifier.toLowerCase() === serverIdOrName.toLowerCase() ||
            s.name.toLowerCase() === serverIdOrName.toLowerCase()
        );
    }
    if (!targetServer && servers.length > 0) {
        targetServer = servers[0];
    }

    // Cloud fallback
    const targetCloud = serverIdOrName ? (
        cloudServersMap.get(serverIdOrName) ||
        Array.from(cloudServersMap.values()).find((c: any) => 
            c.serverId?.toLowerCase() === serverIdOrName.toLowerCase() ||
            c.serverName?.toLowerCase() === serverIdOrName.toLowerCase()
        )
    ) : Array.from(cloudServersMap.values())[0];

    const serverId = targetServer?.clientIdentifier || (targetCloud as any)?.serverId || serverIdOrName || "plex-server";
    const serverName = targetServer?.name || (targetCloud as any)?.serverName || "Plex Server";
    const serverToken = targetServer?.accessToken || token;

    // Build candidates in optimal priority order:
    // 1. Configured custom/DB URLs
    // 2. Direct LAN IP:port (http://<ip>:<port>) -> bypasses .plex.direct DNS rebinding & cert issues!
    // 3. Cloud directUrl
    // 4. Connection URIs (local connections first)
    // 5. Http alternatives for https://*.plex.direct URIs
    const candidateUrls: string[] = [];

    const addCandidate = (u?: string) => {
        if (!u) return;
        const clean = u.replace(/\/+$/, "");
        if (clean && !candidateUrls.includes(clean)) {
            candidateUrls.push(clean);
        }
    };

    for (const u of dbPlexUrls) addCandidate(u);

    if (targetServer?.connections) {
        for (const c of targetServer.connections) {
            if (c.address && c.port) {
                addCandidate(`http://${c.address}:${c.port}`);
            }
        }
    }

    if ((targetCloud as any)?.directUrl) {
        addCandidate((targetCloud as any).directUrl);
    }

    if (targetServer?.connections) {
        for (const c of targetServer.connections) {
            if (c.uri) {
                addCandidate(c.uri);
                if (c.uri.startsWith("https://") && c.uri.includes(".plex.direct")) {
                    addCandidate(c.uri.replace("https://", "http://"));
                }
            }
            if (c.address && c.port) {
                addCandidate(`https://${c.address}:${c.port}`);
            }
        }
    }

    // Default fallback if no candidates found
    if (candidateUrls.length === 0) {
        addCandidate("http://127.0.0.1:32400");
        addCandidate("http://localhost:32400");
    }

    // Probe candidates quickly to find the first working connection
    let workingUrl = "";
    for (const cand of candidateUrls) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`${cand}/identity`, {
                headers: {
                    Accept: "application/json, application/xml, text/xml, */*",
                    "X-Plex-Token": serverToken,
                    "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                },
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId);
            if (res.ok || res.status === 401 || res.status === 403) {
                workingUrl = cand;
                break;
            }
        } catch (e) {
            // Connection failed, proceed to next candidate
        }
    }

    // If probing didn't succeed, fallback to the top candidate
    if (!workingUrl && candidateUrls.length > 0) {
        workingUrl = candidateUrls[0];
    }

    const result: ResolvedPlexConnection = {
        serverId,
        serverName,
        serverUrl: workingUrl,
        token: serverToken,
        allCandidateUrls: candidateUrls
    };

    if (workingUrl) {
        resolvedServerCache.set(cacheKey, { timestamp: Date.now(), data: result });
    }

    return result;
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
                                if (id > 0) {
                                    secIds.push(id);
                                } else if (key > 0) {
                                    secIds.push(key);
                                }
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
                                if (!isNaN(secId) && secId > 0) {
                                    sectionIds.push(secId);
                                } else if (!isNaN(secKey) && secKey > 0) {
                                    sectionIds.push(secKey);
                                }
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
                // All libraries on this server: push canonical cloud id key
                for (const sec of server.sections) {
                    selectedKeys.push(`${srvId}:${sec.id}`);
                }
            } else {
                // Explicitly shared library sections: match by cloud id OR pms key
                for (const sec of server.sections) {
                    const isShared = share.librarySectionIds.includes(sec.id) || 
                                     (sec.key && share.librarySectionIds.includes(parseInt(sec.key, 10)));
                    if (isShared) {
                        selectedKeys.push(`${srvId}:${sec.id}`);
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

    const cloudServersMap = await getPlexCloudServersMap(adminToken);
    const cleanServerId = (serverId || "").toLowerCase().trim();
    const cloudSrv = cloudServersMap.get(serverId) || 
        Array.from(cloudServersMap.values()).find(s => 
            s.serverId.toLowerCase() === cleanServerId ||
            cleanServerId.includes(s.serverId.toLowerCase()) ||
            s.serverId.toLowerCase().includes(cleanServerId)
        );

    const resolved: number[] = [];

    for (const inputId of inputSectionIds) {
        const matchedSec = cloudSrv?.sections?.find(s => 
            s.id === inputId || 
            parseInt(s.key, 10) === inputId || 
            String(s.id) === String(inputId) || 
            s.key === String(inputId)
        );

        if (matchedSec) {
            // Use canonical cloud ID (> 1,000,000) when available; otherwise fall back to key or inputId. NEVER push both!
            const targetId = matchedSec.id > 0 ? matchedSec.id : (parseInt(matchedSec.key, 10) || inputId);
            if (targetId > 0 && !resolved.includes(targetId)) {
                resolved.push(targetId);
            }
        } else {
            if (inputId > 0 && !resolved.includes(inputId)) {
                resolved.push(inputId);
            }
        }
    }

    logger.addLog(
        "INFO", 
        "PLEX", 
        `[SECTION-MAP] Server "${serverId}": input=${JSON.stringify(inputSectionIds)} -> resolved=${JSON.stringify(resolved)}`, 
        `Discovered Cloud Sections: ${(cloudSrv?.sections || []).map(s => `"${s.title}" (CloudID: ${s.id}, Key: ${s.key})`).join(", ") || 'none'}`
    );

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

    let cleanTarget = (emailOrUsername || "").trim();
    const rawSectionIds = Array.isArray(librarySectionIds) ? librarySectionIds : [];
    const sectionIds = serverId 
        ? await resolveServerSectionIds(adminToken, serverId, rawSectionIds)
        : rawSectionIds;

    let numInvitedId = invitedId ? (parseInt(String(invitedId), 10) || undefined) : undefined;

    // Self-healing: if invitedId was not provided, look up friend by target email/username
    if (cleanTarget) {
        try {
            const friend = await findPlexUserFriend(adminToken, { id: numInvitedId, email: cleanTarget, username: cleanTarget });
            if (friend?.id && !numInvitedId) {
                numInvitedId = parseInt(String(friend.id), 10) || undefined;
            }
            if (friend?.email && !cleanTarget.includes("@")) {
                cleanTarget = friend.email;
            }
        } catch (fErr) {}
    }

    logger.addLog("INFO", "PLEX", `[GRANT/SHARE] Starting share for "${cleanTarget}" on server "${serverId}"`, `Target: "${cleanTarget}" | FriendID: ${numInvitedId || 'none'} | Sections: ${JSON.stringify(sectionIds)}`);

    // 0. Pre-check: if user already has a share on this server, update it directly!
    try {
        const existing = await getPlexSharedServersList(adminToken);
        const match = existing.find(s => 
            ((s.serverId && serverId && s.serverId.toLowerCase() === serverId.toLowerCase()) || !s.serverId) &&
            matchesPlexUser({ id: numInvitedId, email: cleanTarget, username: cleanTarget }, s)
        );
        if (match && match.id) {
            logger.addLog("INFO", "PLEX", `[GRANT/SHARE] User "${cleanTarget}" already has existing share ID ${match.id} on server "${serverId}". Redirecting to update share.`);
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
            } else if (cleanTarget) {
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
                logger.addLog("SUCCESS", "PLEX", `[GRANT/SHARE] Rails POST succeeded (HTTP 200) on server "${serverId}" for "${cleanTarget}"`, `Share ID: ${shareId || 'N/A'}`);
            } else {
                const errText = await res.text().catch(() => "");
                const cleanErr = errText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                
                if (res.status === 404) {
                    errorMsg = `Plex user or library section not found (404). Ensure "${cleanTarget}" is a valid registered Plex.tv account, or verify their exact Plex username/email.`;
                } else {
                    errorMsg = `Server POST error (${res.status}): ${cleanErr || res.statusText}`;
                }
                logger.addLog("WARN", "PLEX", `[GRANT/SHARE] Rails POST returned HTTP ${res.status} on server "${serverId}": ${cleanErr || errText.slice(0, 300)}`);

                // If already shared or conflict, update existing share
                if (res.status === 400 || res.status === 409 || res.status === 422 || errText.toLowerCase().includes("already")) {
                    const existing = await getPlexSharedServersList(adminToken);
                    const match = existing.find(s => 
                        ((s.serverId && serverId && s.serverId.toLowerCase() === serverId.toLowerCase()) || !s.serverId) &&
                        matchesPlexUser({ id: numInvitedId, email: cleanTarget, username: cleanTarget }, s)
                    );
                    if (match && match.id) {
                        logger.addLog("INFO", "PLEX", `[GRANT/SHARE] Found existing share ID ${match.id} after HTTP ${res.status}. Updating share.`);
                        return await updatePlexUserShareSections(adminToken, String(match.id), sectionIds, serverId);
                    }
                }
            }
        } catch (e: any) {
            errorMsg = e.message || "Network error in server direct invite";
            logger.addLog("WARN", "PLEX", `[GRANT/SHARE] Exception in Rails POST: ${e.message}`);
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
            if (numInvitedId) {
                queryParams.set("invited_id", String(numInvitedId));
            } else if (cleanTarget) {
                queryParams.set("invited_email", cleanTarget);
            }

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
                logger.addLog("SUCCESS", "PLEX", `[GRANT/SHARE] Rails query param POST succeeded on server "${serverId}" for "${cleanTarget}"`);
            } else {
                const qErrText = await res.text().catch(() => "");
                const cleanQErr = qErrText.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
                logger.addLog("WARN", "PLEX", `[GRANT/SHARE] Rails query param POST returned HTTP ${res.status}: ${cleanQErr || qErrText.slice(0, 300)}`);
            }
        } catch (e: any) {
            logger.addLog("WARN", "PLEX", `[GRANT/SHARE] Exception in Rails query param POST: ${e.message}`);
        }
    }

    if (success) {
        logger.addLog("SUCCESS", "PLEX", `[GRANT/SHARE] Successfully granted Plex library access to "${cleanTarget}" (${sectionIds.length} libraries)`);
        return {
            success: true,
            shareId,
            message: `Successfully granted Plex library access to ${cleanTarget || 'user'} (${sectionIds.length} libraries).`
        };
    }

    logger.addLog("ERROR", "PLEX", `❌ [GRANT/SHARE] Failed to share libraries with "${cleanTarget}" on server "${serverId}": ${errorMsg}`);
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

    logger.addLog("INFO", "PLEX", `[UPDATE-SHARE] Updating share ID ${shareId} on server "${serverId || 'unknown'}" with sections: ${JSON.stringify(resolvedSectionIds)}`);

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
                logger.addLog("SUCCESS", "PLEX", `[UPDATE-SHARE] Rails PUT succeeded (HTTP 200) for share ID ${shareId}`);
            } else {
                const text = await res.text().catch(() => "");
                errorMsg = `Server PUT error (${res.status}): ${text || res.statusText}`;
                logger.addLog("WARN", "PLEX", `[UPDATE-SHARE] Rails PUT returned HTTP ${res.status} for share ID ${shareId}: ${text.slice(0, 300)}`);
            }
        } catch (e: any) {
            errorMsg = e.message || "Network error in server share PUT";
            logger.addLog("WARN", "PLEX", `[UPDATE-SHARE] Exception in Rails PUT: ${e.message}`);
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
                logger.addLog("SUCCESS", "PLEX", `[UPDATE-SHARE] Rails query param PUT succeeded for share ID ${shareId}`);
            } else {
                logger.addLog("WARN", "PLEX", `[UPDATE-SHARE] Rails query param PUT returned HTTP ${res.status} for share ID ${shareId}`);
            }
        } catch (e: any) {
            logger.addLog("WARN", "PLEX", `[UPDATE-SHARE] Exception in Rails query param PUT: ${e.message}`);
        }
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
                logger.addLog("SUCCESS", "PLEX", `[UPDATE-SHARE] Modern v2 PUT succeeded for share ID ${shareId}`);
            } else if (!success) {
                const errText = await res.text().catch(() => "");
                errorMsg = `v2 PUT error (${res.status}): ${errText || res.statusText}`;
                logger.addLog("ERROR", "PLEX", `[UPDATE-SHARE] Modern v2 PUT failed with HTTP ${res.status} for share ID ${shareId}: ${errText.slice(0, 300)}`);
            }
        } catch (e: any) {
            if (!success) errorMsg = e.message || "Network error updating Plex share";
            logger.addLog("ERROR", "PLEX", `[UPDATE-SHARE] Exception in v2 PUT: ${e.message}`);
        }
    }

    if (success) {
        logger.addLog("SUCCESS", "PLEX", `[UPDATE-SHARE] Successfully updated share ID ${shareId} (${resolvedSectionIds.length} libraries enabled)`);
        return {
            success: true,
            message: `Updated Plex library shares (${resolvedSectionIds.length} libraries enabled).`
        };
    } else {
        logger.addLog("ERROR", "PLEX", `❌ [UPDATE-SHARE] Failed to update share ID ${shareId}: ${errorMsg}`);
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

    logger.addLog("INFO", "PLEX", `[REMOVE-SHARE] Removing Plex share ID ${shareId} on server "${serverId || 'all'}"`);

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
                logger.addLog("SUCCESS", "PLEX", `[REMOVE-SHARE] Server XML DELETE succeeded for share ID ${shareId}`);
            } else {
                errorMsg = `Server endpoint error (${res.status}): ${res.statusText}`;
                logger.addLog("WARN", "PLEX", `[REMOVE-SHARE] Server XML DELETE returned HTTP ${res.status} for share ID ${shareId}`);
            }
        } catch (e: any) {
            errorMsg = e.message || "Network error deleting server share";
            logger.addLog("WARN", "PLEX", `[REMOVE-SHARE] Exception in server XML DELETE: ${e.message}`);
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
            logger.addLog("SUCCESS", "PLEX", `[REMOVE-SHARE] Modern v2 DELETE succeeded for share ID ${shareId}`);
        } else if (!success) {
            const errText = await res.text().catch(() => "");
            errorMsg = `v2 endpoint error (${res.status}): ${errText || res.statusText}`;
            logger.addLog("ERROR", "PLEX", `[REMOVE-SHARE] Modern v2 DELETE returned HTTP ${res.status} for share ID ${shareId}: ${errText.slice(0, 300)}`);
        }
    } catch (e: any) {
        if (!success) errorMsg = e.message || "Network error deleting v2 share";
        logger.addLog("ERROR", "PLEX", `[REMOVE-SHARE] Exception in v2 DELETE: ${e.message}`);
    }

    if (success) {
        logger.addLog("SUCCESS", "PLEX", `[REMOVE-SHARE] Successfully removed Plex share ID ${shareId}`);
        return {
            success: true,
            message: "Plex share removed successfully."
        };
    }

    logger.addLog("ERROR", "PLEX", `❌ [REMOVE-SHARE] Failed to remove Plex share ID ${shareId}: ${errorMsg}`);
    return {
        success: false,
        error: errorMsg || "Failed to remove Plex share."
    };
}

