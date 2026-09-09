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
    allLibraries?: boolean;
    accepted: boolean;
}

export async function getPlexSharedServersList(adminToken: string): Promise<PlexSharedServerItem[]> {
    if (!adminToken) return [];
    const items: PlexSharedServerItem[] = [];

    // 1. Fetch JSON from https://plex.tv/api/v2/shared_servers
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
                    
                    // Extract section IDs from all possible v2 API payload variations
                    let sectionIds: number[] = [];
                    if (Array.isArray(item.library_section_ids)) {
                        sectionIds = item.library_section_ids.map((s: any) => parseInt(s, 10)).filter((n: number) => !isNaN(n));
                    } else if (Array.isArray(item.librarySectionIDs)) {
                        sectionIds = item.librarySectionIDs.map((s: any) => parseInt(s, 10)).filter((n: number) => !isNaN(n));
                    } else if (Array.isArray(item.librarySectionIds)) {
                        sectionIds = item.librarySectionIds.map((s: any) => parseInt(s, 10)).filter((n: number) => !isNaN(n));
                    } else if (Array.isArray(item.sections)) {
                        sectionIds = item.sections.map((s: any) => {
                            if (typeof s === 'object' && s !== null) {
                                return parseInt(s.id || s.key, 10);
                            }
                            return parseInt(s, 10);
                        }).filter((n: number) => !isNaN(n));
                    } else if (typeof item.library_section_ids === "string") {
                        sectionIds = item.library_section_ids.split(",").map((s: string) => parseInt(s.trim(), 10)).filter((n: number) => !isNaN(n));
                    }

                    const isAll = Boolean(
                        item.all_libraries === true || 
                        item.allLibraries === true || 
                        item.all_libraries === 1 || 
                        item.allLibraries === 1 || 
                        item.all_libraries === "1" || 
                        item.allLibraries === "1"
                    );

                    items.push({
                        id: item.id,
                        serverId: item.machine_identifier || item.machineIdentifier || item.server_id || item.serverId || "",
                        serverName: item.server_name || item.serverName,
                        user: {
                            id: rawUser.id || item.user_id || item.userID,
                            email: rawUser.email || item.email || item.invitedEmail || item.invited_email,
                            username: rawUser.username || rawUser.title || item.username || item.title,
                            title: rawUser.title || rawUser.username || item.title || item.username,
                            thumb: rawUser.thumb || item.thumb
                        },
                        invitedEmail: item.invited_email || item.invitedEmail || rawUser.email || item.email,
                        librarySectionIds: sectionIds,
                        allLibraries: isAll,
                        accepted: Boolean(item.accepted ?? true)
                    });
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] Failed to fetch shared_servers list:", e);
    }

    // 2. Fetch legacy XML /api/users to complement/enrich library sections
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

                const serverBlocks = block.match(/<Server\b[\s\S]*?<\/Server>/gi) || [];
                for (const srvBlock of serverBlocks) {
                    const shareId = srvBlock.match(/\bid="([^"]*)"/i)?.[1] || "";
                    const machineIdentifier = srvBlock.match(/\bmachineIdentifier="([^"]*)"/i)?.[1] || srvBlock.match(/\bserverId="([^"]*)"/i)?.[1] || "";
                    const srvName = srvBlock.match(/\bname="([^"]*)"/i)?.[1] || "";
                    const allLibsAttr = srvBlock.match(/\ballLibraries="([^"]*)"/i)?.[1];
                    const isAll = allLibsAttr === "1";

                    const sectionIds: number[] = [];
                    const secMatches = srvBlock.matchAll(/<Section\s+[^>]*\bid="([^"]*)"[^>]*\bkey="([^"]*)"[^>]*\bshared="([^"]*)"/gi);
                    for (const sm of secMatches) {
                        const secId = parseInt(sm[1] || sm[2], 10);
                        const isShared = sm[3] === "1" || sm[3] === "true";
                        if (!isNaN(secId) && (isShared || isAll)) {
                            sectionIds.push(secId);
                        }
                    }

                    if (sectionIds.length === 0) {
                        const allSecMatches = srvBlock.matchAll(/<Section\s+[^>]*\bid="([^"]*)"/gi);
                        for (const asm of allSecMatches) {
                            const secId = parseInt(asm[1], 10);
                            if (!isNaN(secId)) {
                                sectionIds.push(secId);
                            }
                        }
                    }

                    if (userEmail || username) {
                        const existingIdx = items.findIndex(it => 
                            (it.id && shareId && String(it.id) === String(shareId)) ||
                            (machineIdentifier && it.serverId === machineIdentifier && (
                                (it.user.email && it.user.email.toLowerCase() === userEmail.toLowerCase()) ||
                                (it.user.username && it.user.username.toLowerCase() === username.toLowerCase())
                            ))
                        );

                        if (existingIdx >= 0) {
                            if (!items[existingIdx].serverId && machineIdentifier) {
                                items[existingIdx].serverId = machineIdentifier;
                            }
                            if (items[existingIdx].librarySectionIds.length === 0 && sectionIds.length > 0) {
                                items[existingIdx].librarySectionIds = sectionIds;
                            }
                            items[existingIdx].allLibraries = items[existingIdx].allLibraries || isAll;
                        } else {
                            items.push({
                                id: shareId,
                                serverId: machineIdentifier,
                                serverName: srvName,
                                user: {
                                    email: userEmail,
                                    username: username,
                                    title: username,
                                    thumb: userThumb
                                },
                                invitedEmail: userEmail,
                                librarySectionIds: sectionIds,
                                allLibraries: isAll,
                                accepted: true
                            });
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn("[PLEX-API] Failed to fetch legacy XML users list:", e);
    }

    return items;
}

export async function getUserPlexSharedLibraries(
    adminToken: string, 
    user: { email?: string | null; username?: string | null; plexEmail?: string | null; plexUsername?: string | null }
): Promise<{ matchedShares: PlexSharedServerItem[]; selectedKeys: string[] }> {
    if (!adminToken) return { matchedShares: [], selectedKeys: [] };

    const targetEmail = (user.plexEmail || user.email || "").toLowerCase().trim();
    const targetUser = (user.plexUsername || user.username || "").toLowerCase().trim();

    const [shares, serversWithSections] = await Promise.all([
        getPlexSharedServersList(adminToken),
        getPlexServerLibrarySections(adminToken)
    ]);

    const matchedShares = shares.filter(s => {
        const shareEmail = (s.user.email || s.invitedEmail || "").toLowerCase().trim();
        const shareUser = (s.user.username || s.user.title || "").toLowerCase().trim();
        return (targetEmail && shareEmail === targetEmail) ||
               (targetUser && shareUser === targetUser) ||
               (targetEmail && shareUser === targetEmail) ||
               (targetUser && shareEmail === targetUser);
    });

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
        selectedKeys: Array.from(new Set(selectedKeys))
    };
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
            library_section_ids: sectionIds,
            librarySectionIDs: sectionIds,
            all_libraries: false,
            allLibraries: false
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
                    (s.serverId === serverId || !s.serverId) && (
                        (s.user.email && s.user.email.toLowerCase() === cleanTarget.toLowerCase()) ||
                        (s.user.username && s.user.username.toLowerCase() === cleanTarget.toLowerCase()) ||
                        (s.invitedEmail && s.invitedEmail.toLowerCase() === cleanTarget.toLowerCase())
                    )
                );
                if (match && match.id) {
                    return await updatePlexUserShareSections(adminToken, String(match.id), sectionIds, serverId);
                }
            }
        }
    } catch (e: any) {
        console.warn("[PLEX-API] Failed v2 invite:", e);
    }

    // 2. Fallback to server direct XML endpoint
    if (serverId) {
        try {
            const xmlUrl = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers?invited_email=${encodeURIComponent(cleanTarget)}&library_section_ids=${sectionIds.join(",")}&allLibraries=0`;
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
    librarySectionIds: number[],
    serverId?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    if (!adminToken) return { success: false, error: "Missing Plex Admin Token." };
    if (!shareId) return { success: false, error: "Missing Plex Share ID." };

    let success = false;
    let errorMsg = "";

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
        } else {
            const errText = await res.text().catch(() => "");
            errorMsg = `Plex API returned error (${res.status}): ${errText || res.statusText}`;
        }
    } catch (e: any) {
        errorMsg = e.message || "Network error updating Plex share";
    }

    // Fallback to direct XML endpoint if machine_identifier/serverId is provided
    if (!success && serverId) {
        try {
            const xmlUrl = `https://plex.tv/api/servers/${encodeURIComponent(serverId)}/shared_servers/${encodeURIComponent(String(shareId))}?library_section_ids=${librarySectionIds.join(",")}&allLibraries=0`;
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

