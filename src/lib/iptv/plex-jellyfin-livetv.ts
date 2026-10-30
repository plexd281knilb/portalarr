import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getPlexSharedServersList, getPlexServers } from "@/lib/plex";
import { resilientMediaServerFetch } from "@/lib/media-servers";
import { logger } from "@/lib/logger";
import { getIptvSettings } from "./provider-vault";
import { LiveTvEcosystemAuditReport, PlexHomeLiveTvMemberAudit } from "./types";

const PLEX_CLIENT_ID = "portalarr-custom-dashboard-app";

/**
 * Resolves a valid, working Plex Owner/Admin token from Settings or configured PlexServers.
 */
export async function resolveActivePlexAdminToken(): Promise<string> {
    const candidates: string[] = [];

    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    if (settings?.mainPlexToken) {
        const dec = decryptData(settings.mainPlexToken).trim();
        if (dec) candidates.push(dec);
    }

    const servers = await prisma.plexServer.findMany({
        where: { token: { not: null } },
        orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
    });

    for (const srv of servers) {
        if (srv.token) {
            const dec = decryptData(srv.token).trim();
            if (dec && !candidates.includes(dec)) {
                candidates.push(dec);
            }
        }
    }

    // If only one candidate or offline test environment, return first candidate if valid
    for (const token of candidates) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 3500);
            const res = await fetch("https://plex.tv/api/v2/user", {
                headers: {
                    "Accept": "application/json",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                },
                signal: controller.signal
            });
            clearTimeout(timer);
            if (res.ok) {
                return token;
            }
        } catch {
            // Network timeout or offline environment
        }
    }

    return candidates[0] || "";
}

let lastIptvActivitySyncTime = 0;
const ACTIVITY_SYNC_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Synchronizes lastIptvWatchedAt on User records from IptvWatchSession and WatchHistory (live TV plays).
 */
export async function syncUsersLastIptvActivity(force = false): Promise<void> {
    const now = Date.now();
    if (!force && (now - lastIptvActivitySyncTime < ACTIVITY_SYNC_COOLDOWN_MS)) {
        return;
    }
    lastIptvActivitySyncTime = now;

    const users = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            email: true,
            plexUsername: true,
            plexEmail: true,
            lastIptvWatchedAt: true
        }
    });

    const latestSessions = await prisma.iptvWatchSession.findMany({
        orderBy: { startedAt: "desc" },
        take: 500
    });

    const liveWatchHistory = await prisma.watchHistory.findMany({
        where: {
            OR: [
                { mediaType: "live" },
                { mediaType: "channel" },
                { mediaType: "iptv" },
                { title: { contains: "World Series" } },
                { title: { contains: "MLB" } },
                { title: { contains: "Baseball" } },
                { title: { contains: "NFL" } },
                { title: { contains: "NCAA" } },
                { title: { contains: "Football" } },
                { title: { contains: "Fox" } },
                { title: { contains: "ESPN" } },
                { title: { contains: "Live" } },
                { grandparentTitle: { contains: "MLB" } },
                { grandparentTitle: { contains: "NFL" } },
                { grandparentTitle: { contains: "NCAA" } },
                { grandparentTitle: { contains: "Fox" } },
                { grandparentTitle: { contains: "Baseball" } },
                { grandparentTitle: { contains: "Football" } },
                { grandparentTitle: { contains: "World Series" } },
                { player: { contains: "Live" } },
                { player: { contains: "Tuner" } }
            ]
        },
        orderBy: { watchedAt: "desc" },
        take: 1000
    });

    // Query all Tautulli instances for live stream and sports playback history
    const tautulliLiveHistory: { user: string; watchedAt: Date }[] = [];
    try {
        const tautulliInstances = await prisma.tautulliInstance.findMany();

        for (const inst of tautulliInstances) {
            if (!inst.url) continue;
            const apiKey = inst.apiKey ? decryptData(inst.apiKey).trim() : "";
            if (!apiKey) continue;
            const cleanBase = inst.url.replace(/\/+$/, "").replace(/\/api\/v2\/?$/, "");

            try {
                const fetchTautulliRows = async (extraParams: string) => {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 4000);
                    try {
                        const histUrl = `${cleanBase}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_history&${extraParams}`;
                        const res = await fetch(histUrl, {
                            headers: { "Accept": "application/json" },
                            signal: controller.signal
                        });
                        clearTimeout(timer);
                        if (res.ok) {
                            const json = await res.json().catch(() => null);
                            return Array.isArray(json?.response?.data?.data)
                                ? json.response.data.data
                                : Array.isArray(json?.response?.data)
                                ? json.response.data
                                : [];
                        }
                    } catch {
                        clearTimeout(timer);
                    }
                    return [];
                };

                const [genRows, liveSearch, foxSearch, seriesSearch, mlbSearch] = await Promise.all([
                    fetchTautulliRows("length=1000"),
                    fetchTautulliRows("search=live&length=300"),
                    fetchTautulliRows("search=fox&length=300"),
                    fetchTautulliRows("search=series&length=300"),
                    fetchTautulliRows("search=mlb&length=300")
                ]);

                const rows = [...genRows, ...liveSearch, ...foxSearch, ...seriesSearch, ...mlbSearch];

                for (const row of rows) {
                    const mediaType = String(row.media_type || "").toLowerCase();
                    const title = String(row.title || "").toLowerCase();
                    const grandTitle = String(row.grandparent_title || "").toLowerCase();
                    const parentTitle = String(row.parent_title || "").toLowerCase();
                    const product = String(row.product || "").toLowerCase();
                    const player = String(row.player || "").toLowerCase();
                    const section = String(row.section_type || "").toLowerCase();

                    const isLive = Boolean(
                        row.live === 1 ||
                        row.live === "1" ||
                        row.live === true ||
                        mediaType === "live" ||
                        mediaType === "channel" ||
                        mediaType === "iptv" ||
                        mediaType === "clip" ||
                        section === "live" ||
                        section === "livetv" ||
                        /world series|mlb|baseball|nfl|ncaa|football|fox|cbs|nbc|abc|espn|live tv|tuner|hdhr|dispatcharr|channel|sports|super bowl|playoffs/i.test(title) ||
                        /world series|mlb|baseball|nfl|ncaa|football|fox|cbs|nbc|abc|espn|live tv|tuner|hdhr|dispatcharr|channel|sports|super bowl|playoffs/i.test(grandTitle) ||
                        /world series|mlb|baseball|nfl|ncaa|football|fox|cbs|nbc|abc|espn|live tv|tuner|hdhr|dispatcharr|channel|sports|super bowl|playoffs/i.test(parentTitle) ||
                        /live tv|tuner|hdhr|dispatcharr/i.test(product) ||
                        /live tv|tuner|hdhr|dispatcharr/i.test(player)
                    );

                    if (isLive && row.date) {
                        const watchedAt = new Date(Number(row.date) * 1000);
                        const userStr = String(row.user || "").toLowerCase().trim();
                        const friendlyStr = String(row.friendly_name || "").toLowerCase().trim();
                        const uidStr = String(row.user_id || "").toLowerCase().trim();
                        const emailStr = String(row.email || "").toLowerCase().trim();
                        if (userStr && !isNaN(watchedAt.getTime())) {
                            tautulliLiveHistory.push({ user: userStr, watchedAt });
                        }
                        if (friendlyStr && !isNaN(watchedAt.getTime())) {
                            tautulliLiveHistory.push({ user: friendlyStr, watchedAt });
                        }
                        if (uidStr && !isNaN(watchedAt.getTime())) {
                            tautulliLiveHistory.push({ user: uidStr, watchedAt });
                        }
                        if (emailStr && !isNaN(watchedAt.getTime())) {
                            tautulliLiveHistory.push({ user: emailStr, watchedAt });
                        }
                    }
                }
            } catch {
                // Skip unreachable Tautulli instance during background sync
            }
        }
    } catch {}

    // Direct Plex Media Server /status/sessions/history/all scan for Live TV streams across discovered PMS instances
    try {
        const adminToken = await resolveActivePlexAdminToken();
        if (adminToken) {
            const discoveredServers = await getPlexServers(adminToken).catch(() => []);
            const candidateUrls = new Set<string>();

            for (const srv of discoveredServers) {
                for (const c of srv.connections) {
                    if (c.uri) candidateUrls.add(c.uri.replace(/\/+$/, ""));
                }
            }
            const dbPlexServers = await prisma.plexServer.findMany({ select: { url: true } });
            for (const s of dbPlexServers) {
                if (s.url) candidateUrls.add(s.url.replace(/\/+$/, ""));
            }

            for (const baseUrl of candidateUrls) {
                try {
                    const controller = new AbortController();
                    const timer = setTimeout(() => controller.abort(), 3500);
                    const hUrl = `${baseUrl}/status/sessions/history/all?sort=viewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=500`;
                    const res = await fetch(hUrl, {
                        headers: {
                            "Accept": "application/json",
                            "X-Plex-Token": adminToken,
                            "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                        },
                        signal: controller.signal
                    });
                    clearTimeout(timer);
                    if (res.ok) {
                        const hJson = await res.json().catch(() => null);
                        const hRows = hJson?.MediaContainer?.Metadata || [];
                        const rows = Array.isArray(hRows) ? hRows : [hRows];
                        for (const r of rows) {
                            const isLive = Boolean(
                                r.live === 1 ||
                                r.live === "1" ||
                                r.type === "live" ||
                                r.type === "clip" ||
                                r.channelIdentifier ||
                                /world series|mlb|baseball|nfl|ncaa|football|fox|cbs|nbc|abc|espn|news|live tv|tuner/i.test(r.title || "") ||
                                /world series|mlb|baseball|nfl|ncaa|football|fox|cbs|nbc|abc|espn|news|live tv|tuner/i.test(r.grandparentTitle || "")
                            );
                            if (isLive && r.viewedAt) {
                                const watchedAt = new Date(Number(r.viewedAt) * 1000);
                                const userStr = String(r.userName || r.user || "").toLowerCase().trim();
                                const emailStr = String(r.userEmail || r.email || "").toLowerCase().trim();
                                if (userStr && !isNaN(watchedAt.getTime())) {
                                    tautulliLiveHistory.push({ user: userStr, watchedAt });
                                }
                                if (emailStr && !isNaN(watchedAt.getTime())) {
                                    tautulliLiveHistory.push({ user: emailStr, watchedAt });
                                }
                            }
                        }
                    }
                } catch {}
            }
        }
    } catch {}

    for (const u of users) {

        const nameClean = u.name ? u.name.toLowerCase().trim() : "";
        const aliases = new Set(
            [
                u.username,
                u.email,
                u.email ? u.email.split("@")[0] : null,
                u.plexUsername,
                u.plexEmail,
                u.plexEmail ? u.plexEmail.split("@")[0] : null,
                nameClean,
                nameClean ? nameClean.replace(/\s+/g, "") : null,
                u.plexHomeUserId,
                u.id
            ]
                .filter(Boolean)
                .map((s) => String(s).toLowerCase().trim())
        );

        let latestDate: Date | null = u.lastIptvWatchedAt ? new Date(u.lastIptvWatchedAt) : null;
        let foundLiveStream = false;

        for (const sess of latestSessions) {
            if (
                sess.userId === u.id ||
                (sess.userName && aliases.has(sess.userName.toLowerCase().trim()))
            ) {
                const d = new Date(sess.startedAt);
                if (!latestDate || d > latestDate) {
                    latestDate = d;
                    foundLiveStream = true;
                }
            }
        }

        for (const wh of liveWatchHistory) {
            if (
                wh.userId === u.id ||
                (wh.user && aliases.has(wh.user.toLowerCase().trim())) ||
                (wh.userEmail && aliases.has(wh.userEmail.toLowerCase().trim()))
            ) {
                const d = new Date(wh.watchedAt);
                if (!latestDate || d > latestDate) {
                    latestDate = d;
                    foundLiveStream = true;
                }
            }
        }

        for (const th of tautulliLiveHistory) {
            const thUser = th.user.toLowerCase().trim();
            const aliasList = Array.from(aliases);
            if (aliases.has(thUser) || aliasList.some((a) => a && (thUser.includes(a) || a.includes(thUser)))) {
                if (!latestDate || th.watchedAt > latestDate) {
                    latestDate = th.watchedAt;
                    foundLiveStream = true;
                }
            }
        }

        const updateData: any = {};
        if (latestDate && (!u.lastIptvWatchedAt || latestDate.getTime() !== new Date(u.lastIptvWatchedAt).getTime())) {
            updateData.lastIptvWatchedAt = latestDate;
        }

        if (Object.keys(updateData).length > 0) {
            await prisma.user.update({
                where: { id: u.id },
                data: updateData
            }).catch(() => {});
        }
    }
}

/**
 * Audits all Jellyfin / Emby users for EnableLiveTvAccess policy and syncs state to Portalarr SQLite.
 */
export async function auditJellyfinLiveTvAccess(): Promise<{
    serversChecked: number;
    liveTvUsersCount: number;
}> {
    const mediaServers = await prisma.mediaServer.findMany({
        where: { isActive: true }
    });

    if (mediaServers.length === 0) {
        const localCount = await prisma.user.count({ where: { hasJellyfinLiveTvAccess: true } });
        return { serversChecked: 0, liveTvUsersCount: localCount };
    }

    const portalUsers = await prisma.user.findMany();
    let serversChecked = 0;
    const liveTvEnabledUserIds = new Set<string>();

    for (const ms of mediaServers) {
        try {
            const apiKey = decryptData(ms.apiKey);
            if (!apiKey) continue;

            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 4500);
            const res = await resilientMediaServerFetch(
                { url: ms.url, internalUrl: ms.internalUrl, apiKey },
                "/Users",
                { method: "GET", signal: controller.signal }
            );
            clearTimeout(timer);

            if (res.ok) {
                serversChecked++;
                const remoteUsers = await res.json().catch(() => []);
                if (Array.isArray(remoteUsers)) {
                    for (const ru of remoteUsers) {
                        const remoteId = String(ru.Id || "");
                        const remoteName = String(ru.Name || "").toLowerCase().trim();
                        const hasLiveTv = Boolean(ru.Policy?.EnableLiveTvAccess);

                        const matchedUser = portalUsers.find(
                            (pu) =>
                                (pu.jellyfinUserId && pu.jellyfinUserId === remoteId) ||
                                (pu.jellyfinUsername && pu.jellyfinUsername.toLowerCase().trim() === remoteName) ||
                                pu.username.toLowerCase().trim() === remoteName ||
                                pu.email.toLowerCase().split("@")[0] === remoteName
                        );

                        if (matchedUser) {
                            if (hasLiveTv) liveTvEnabledUserIds.add(matchedUser.id);
                            await prisma.user.update({
                                where: { id: matchedUser.id },
                                data: {
                                    jellyfinUserId: matchedUser.jellyfinUserId || remoteId,
                                    jellyfinUsername: matchedUser.jellyfinUsername || ru.Name,
                                    hasJellyfinLiveTvAccess: hasLiveTv
                                }
                            }).catch(() => {});
                        }
                    }
                }
            }
        } catch {
            // Skip unreachable media server during audit
        }
    }

    const finalCount = liveTvEnabledUserIds.size || (await prisma.user.count({ where: { hasJellyfinLiveTvAccess: true } }));
    return {
        serversChecked,
        liveTvUsersCount: finalCount
    };
}

/**
 * Comprehensive Plex Home & Live TV Privilege Auditor + Non-Destructive Inactivity Rotation Evaluator.
 * - Discovers all Plex Home members and checks if they have allowTuners / allowChannels enabled.
 * - Specifically flags users who are IN Plex Home WITHOUT Live TV privileges.
 * - Calculates inactivity days without auto-kicking anyone when plexHomeAutoKickEnabled === false.
 */
export async function auditPlexHomeAndLiveTvPrivileges(): Promise<LiveTvEcosystemAuditReport> {
    await syncUsersLastIptvActivity();
    const iptvSettings = await getIptvSettings();
    const adminToken = await resolveActivePlexAdminToken();

    const maxSlots = iptvSettings.plexHomeMaxSlots || 14;
    const inactivityThresholdDays = iptvSettings.plexHomeInactivityDays || 21;
    const autoKickEnabled = Boolean(iptvSettings.plexHomeAutoKickEnabled);

    const rawPlexMap = new Map<
        string,
        {
            plexUserId: string;
            username: string;
            email: string;
            title: string;
            thumb?: string;
            isOwnerAdmin: boolean;
            isPlexHomeMember: boolean;
            allowTuners: boolean;
            allowChannels: boolean;
            allowDvr: boolean;
        }
    >();

    let plexReachable = false;

    if (adminToken) {
        // 1. Query canonical XML https://plex.tv/api/users for home="1", allowTuners="1", allowChannels="1", allowDvr="1"
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const xmlRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                headers: {
                    "Accept": "application/xml, text/xml, */*",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                },
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timer);

            if (xmlRes.ok) {
                plexReachable = true;
                const xmlText = await xmlRes.text();
                const userBlocks = xmlText.matchAll(/<User\b([^>]*?)(?:\/>|>([\s\S]*?)<\/User>)/gi);
                for (const match of userBlocks) {
                    const attrs = match[1] || "";
                    const inner = match[2] || "";
                    const id = attrs.match(/\bid="([^"]*)"/i)?.[1] || "";
                    const username = attrs.match(/\busername="([^"]*)"/i)?.[1] || "";
                    const title = attrs.match(/\btitle="([^"]*)"/i)?.[1] || username || "Plex User";
                    const email = (attrs.match(/\bemail="([^"]*)"/i)?.[1] || "").toLowerCase().trim();
                    const thumb = attrs.match(/\bthumb="([^"]*)"/i)?.[1] || undefined;
                    const isHome = attrs.match(/\bhome="([^"]*)"/i)?.[1] === "1";

                    let allowTuners = attrs.match(/\ballowTuners="([^"]*)"/i)?.[1] === "1";
                    let allowChannels = attrs.match(/\ballowChannels="([^"]*)"/i)?.[1] === "1";
                    let allowDvr = attrs.match(/\ballowDvr="([^"]*)"/i)?.[1] === "1";

                    if (inner) {
                        const srvMatches = inner.matchAll(/<Server\b([^>]*?)(?:\/>|>[\s\S]*?<\/Server>)/gi);
                        for (const sm of srvMatches) {
                            const sAttrs = sm[1] || "";
                            if (sAttrs.match(/\ballowTuners="([^"]*)"/i)?.[1] === "1") allowTuners = true;
                            if (sAttrs.match(/\ballowChannels="([^"]*)"/i)?.[1] === "1") allowChannels = true;
                            if (sAttrs.match(/\ballowDvr="([^"]*)"/i)?.[1] === "1") allowDvr = true;
                        }
                    }

                    if (!id && !email && !username) continue;
                    const key = id || email || username.toLowerCase();
                    rawPlexMap.set(key, {
                        plexUserId: id || key,
                        username: username || title,
                        email,
                        title,
                        thumb,
                        isOwnerAdmin: false,
                        isPlexHomeMember: isHome,
                        allowTuners,
                        allowChannels,
                        allowDvr
                    });
                }
            }
        } catch {
            // Fallback or offline
        }

        // 2. Supplement with https://plex.tv/api/v2/home/users for managed/home accounts & owner flag
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 5000);
            const homeRes = await fetch("https://plex.tv/api/v2/home/users", {
                headers: {
                    "Accept": "application/json",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                },
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timer);

            if (homeRes.ok) {
                plexReachable = true;
                const homeData = await homeRes.json().catch(() => null);
                const homeUsers = Array.isArray(homeData?.users)
                    ? homeData.users
                    : Array.isArray(homeData)
                    ? homeData
                    : [];

                for (const hu of homeUsers) {
                    const id = String(hu.id || hu.uuid || "");
                    const email = String(hu.email || "").toLowerCase().trim();
                    const username = String(hu.username || hu.title || hu.friendlyName || "");
                    const title = String(hu.title || hu.friendlyName || username || "Home Member");
                    const isAdmin = Boolean(hu.admin);

                    const huAllowTuners = Boolean(hu.allowTuners || hu.settings?.allowTuners);
                    const huAllowChannels = Boolean(hu.allowChannels || hu.settings?.allowChannels);
                    const huAllowDvr = Boolean(hu.allowDvr || hu.settings?.allowDvr);

                    // Find existing entry in rawPlexMap by id, email, or username
                    let existing = rawPlexMap.get(id);
                    if (!existing && email) {
                        for (const val of rawPlexMap.values()) {
                            if (val.email && val.email === email) {
                                existing = val;
                                break;
                            }
                        }
                    }
                    if (!existing && username) {
                        for (const val of rawPlexMap.values()) {
                            if (val.username.toLowerCase() === username.toLowerCase()) {
                                existing = val;
                                break;
                            }
                        }
                    }

                    if (existing) {
                        existing.isPlexHomeMember = true;
                        existing.isOwnerAdmin = existing.isOwnerAdmin || isAdmin;
                        if (isAdmin) {
                            existing.allowTuners = true;
                            existing.allowChannels = true;
                            existing.allowDvr = true;
                        } else {
                            if (huAllowTuners) existing.allowTuners = true;
                            if (huAllowChannels) existing.allowChannels = true;
                            if (huAllowDvr) existing.allowDvr = true;
                        }
                    } else if (id || username) {
                        rawPlexMap.set(id || username.toLowerCase(), {
                            plexUserId: id || username,
                            username,
                            email,
                            title,
                            thumb: hu.thumb || undefined,
                            isOwnerAdmin: isAdmin,
                            isPlexHomeMember: true,
                            allowTuners: isAdmin ? true : huAllowTuners,
                            allowChannels: isAdmin ? true : huAllowChannels,
                            allowDvr: isAdmin ? true : huAllowDvr
                        });
                    }
                }
            }
        } catch {
            // Ignore v2 home error if offline
        }

        // 3. Supplement with canonical Plex server shares via getPlexSharedServersList
        try {
            const sharedServers = await getPlexSharedServersList(adminToken);
            if (sharedServers.length > 0) {
                plexReachable = true;
            }
            for (const sh of sharedServers) {
                const uId = String(sh.user?.id || "");
                const uEmail = (sh.user?.email || sh.invitedEmail || "").toLowerCase().trim();
                const uName = (sh.user?.username || sh.user?.title || "").toLowerCase().trim();

                const shAllowTuners = Boolean(sh.allowTuners);
                const shAllowChannels = Boolean(sh.allowChannels);
                const shAllowDvr = Boolean(sh.allowDvr);

                let matched = false;
                for (const val of rawPlexMap.values()) {
                    if (
                        (uId && String(val.plexUserId) === uId) ||
                        (uEmail && val.email === uEmail) ||
                        (uName && val.username.toLowerCase() === uName)
                    ) {
                        matched = true;
                        if (shAllowTuners) val.allowTuners = true;
                        if (shAllowChannels) val.allowChannels = true;
                        if (shAllowDvr) val.allowDvr = true;
                    }
                }

                // If not in rawPlexMap yet, add them so shared users are discovered
                if (!matched && (uId || uEmail || uName)) {
                    const key = uId || uEmail || uName;
                    rawPlexMap.set(key, {
                        plexUserId: uId || key,
                        username: sh.user?.username || sh.user?.title || uName || "Plex User",
                        email: uEmail,
                        title: sh.user?.title || sh.user?.username || uName || "Plex User",
                        thumb: sh.user?.thumb || undefined,
                        isOwnerAdmin: false,
                        isPlexHomeMember: false,
                        allowTuners: shAllowTuners,
                        allowChannels: shAllowChannels,
                        allowDvr: shAllowDvr
                    });
                }
            }
        } catch {}
    }

    // 3. Cross-reference with Portalarr SQLite User table (and include local DB state if Plex cloud is unreachable)
    const portalUsers = await prisma.user.findMany({
        orderBy: { username: "asc" }
    });

    // Merge any Portalarr users who are in Plex Home or have Live TV / DVR access locally
    for (const pu of portalUsers) {
        if (pu.isPlexHomeMember || pu.hasPlexLiveTvAccess || pu.hasPlexDvrAccess || pu.role === "ADMIN") {
            const isAlreadyInMap = Array.from(rawPlexMap.values()).some((val) => {
                const pEmails = [pu.email, pu.plexEmail].filter(Boolean).map((e) => e!.toLowerCase().trim());
                const pNames = [pu.username, pu.plexUsername, pu.name].filter(Boolean).map((n) => n!.toLowerCase().trim());
                if (pu.plexHomeUserId && String(pu.plexHomeUserId) === String(val.plexUserId)) return true;
                if (val.email && pEmails.includes(val.email.toLowerCase().trim())) return true;
                if (val.username && pNames.includes(val.username.toLowerCase().trim())) return true;
                return false;
            });

            if (!isAlreadyInMap) {
                const isOwner = pu.role === "ADMIN";
                rawPlexMap.set(pu.id, {
                    plexUserId: pu.plexHomeUserId || pu.id,
                    username: pu.plexUsername || pu.username,
                    email: (pu.plexEmail || pu.email).toLowerCase(),
                    title: pu.name || pu.username,
                    isOwnerAdmin: isOwner,
                    isPlexHomeMember: isOwner ? true : Boolean(pu.isPlexHomeMember),
                    allowTuners: isOwner ? true : Boolean(pu.hasPlexLiveTvAccess),
                    allowChannels: isOwner ? true : Boolean(pu.hasPlexLiveTvAccess),
                    allowDvr: isOwner ? true : Boolean(pu.hasPlexDvrAccess)
                });
            }
        }
    }

    const auditedMembers: PlexHomeLiveTvMemberAudit[] = [];

    for (const item of rawPlexMap.values()) {
        const matchedPortalUser = portalUsers.find((pu) => {
            const pEmails = [pu.email, pu.plexEmail].filter(Boolean).map((e) => e!.toLowerCase().trim());
            const pNames = [pu.username, pu.plexUsername, pu.name].filter(Boolean).map((n) => n!.toLowerCase().trim());

            if (pu.plexHomeUserId && String(pu.plexHomeUserId) === String(item.plexUserId)) return true;
            if (item.email && pEmails.includes(item.email.toLowerCase().trim())) return true;
            if (item.username && pNames.includes(item.username.toLowerCase().trim())) return true;
            if (item.title && pNames.includes(item.title.toLowerCase().trim())) return true;
            return false;
        });

        const isOwner = Boolean(item.isOwnerAdmin || matchedPortalUser?.role === "ADMIN");

        // Real privileges: From Plex API or explicitly granted in Portalarr
        const liveTvGranted = Boolean(
            isOwner ||
            item.allowTuners ||
            item.allowChannels ||
            matchedPortalUser?.hasPlexLiveTvAccess
        );

        const dvrGranted = Boolean(
            isOwner ||
            item.allowDvr ||
            matchedPortalUser?.hasPlexDvrAccess
        );

        const isHomeMember = Boolean(isOwner || item.isPlexHomeMember || matchedPortalUser?.isPlexHomeMember);

        // Sync discovered Plex Home & Live TV status into Portalarr User record
        if (matchedPortalUser) {
            await prisma.user.update({
                where: { id: matchedPortalUser.id },
                data: {
                    isPlexHomeMember: isHomeMember,
                    plexHomeUserId: item.plexUserId || matchedPortalUser.plexHomeUserId,
                    hasPlexLiveTvAccess: liveTvGranted,
                    hasPlexDvrAccess: dvrGranted,
                    ...(liveTvGranted ? { canAccessIptv: true } : {})
                }
            }).catch(() => {});
        }

        const lastWatchedDate = matchedPortalUser?.lastIptvWatchedAt
            ? new Date(matchedPortalUser.lastIptvWatchedAt)
            : null;

        const joinedDate = matchedPortalUser?.plexHomeJoinedAt
            ? new Date(matchedPortalUser.plexHomeJoinedAt)
            : null;

        const daysInactive = lastWatchedDate
            ? Math.max(0, Math.floor((Date.now() - lastWatchedDate.getTime()) / 86400000))
            : null;

        const daysInPlexHome = joinedDate
            ? Math.max(0, Math.floor((Date.now() - joinedDate.getTime()) / 86400000))
            : null;

        const missingLiveTvPrivilege =
            isHomeMember && !item.isOwnerAdmin && !liveTvGranted;

        const missingDvrPrivilege =
            isHomeMember && !item.isOwnerAdmin && !dvrGranted;

        const isInactiveCandidate =
            isHomeMember &&
            !item.isOwnerAdmin &&
            (
                (daysInactive !== null && daysInactive >= inactivityThresholdDays) ||
                (daysInactive === null && daysInPlexHome !== null && daysInPlexHome >= inactivityThresholdDays)
            );

        auditedMembers.push({
            plexUserId: item.plexUserId,
            username: item.username,
            email: item.email,
            title: item.title,
            thumb: item.thumb,
            isOwnerAdmin: item.isOwnerAdmin,
            isPlexHomeMember: isHomeMember,
            allowTuners: liveTvGranted,
            allowChannels: liveTvGranted,
            allowDvr: dvrGranted,
            missingLiveTvPrivilege,
            missingDvrPrivilege,
            portalarrUserId: matchedPortalUser?.id || null,
            portalarrUsername: matchedPortalUser?.username || null,
            lastIptvWatchedAt: lastWatchedDate ? lastWatchedDate.toISOString() : null,
            daysInactive,
            daysInPlexHome,
            isInactiveCandidate
        });
    }

    // Sort: Plex Home members first (anomalies at top), then non-home friends with tuners, then alphabetical
    auditedMembers.sort((a, b) => {
        if (a.missingLiveTvPrivilege !== b.missingLiveTvPrivilege) return a.missingLiveTvPrivilege ? -1 : 1;
        if (a.isPlexHomeMember !== b.isPlexHomeMember) return a.isPlexHomeMember ? -1 : 1;
        if (a.isOwnerAdmin !== b.isOwnerAdmin) return a.isOwnerAdmin ? -1 : 1;
        return a.username.localeCompare(b.username);
    });

    const nonOwnerHomeMembers = auditedMembers.filter((m) => m.isPlexHomeMember && !m.isOwnerAdmin);
    const missingLiveTvCount = nonOwnerHomeMembers.filter((m) => m.missingLiveTvPrivilege).length;
    const missingDvrCount = nonOwnerHomeMembers.filter((m) => m.missingDvrPrivilege).length;
    const withLiveTvCount = nonOwnerHomeMembers.filter((m) => m.allowTuners || m.allowChannels).length;
    const withDvrCount = nonOwnerHomeMembers.filter((m) => m.allowDvr).length;
    const inactiveCandidateCount = nonOwnerHomeMembers.filter((m) => m.isInactiveCandidate).length;

    const jfAudit = await auditJellyfinLiveTvAccess();

    return {
        plexReachable,
        plexHomeTotalMembers: nonOwnerHomeMembers.length,
        plexHomeMaxSlots: maxSlots,
        plexHomeAvailableSlots: Math.max(0, maxSlots - nonOwnerHomeMembers.length),
        plexHomeMissingLiveTvCount: missingLiveTvCount,
        plexHomeMissingDvrCount: missingDvrCount,
        plexHomeWithLiveTvCount: withLiveTvCount,
        plexHomeWithDvrCount: withDvrCount,
        plexHomeInactiveCandidateCount: inactiveCandidateCount,
        plexHomeAutoKickEnabled: autoKickEnabled,
        plexHomeInactivityDays: inactivityThresholdDays,
        plexMembers: auditedMembers,
        jellyfinServersChecked: jfAudit.serversChecked,
        jellyfinLiveTvUsersCount: jfAudit.liveTvUsersCount
    };
}

/**
 * Grants or revokes Plex Live TV & DVR tuner privileges (allowTuners & allowChannels) for a user.
 * Can target either a Portalarr userId or a direct plexUserId.
 */
export async function setPlexUserLiveTvPrivilege(
    targetUserOrPlexId: string,
    allow: boolean
): Promise<{ success: boolean; message: string; plexApiUpdated: boolean }> {
    const portalUser = await prisma.user.findUnique({ where: { id: targetUserOrPlexId } });
    const adminToken = await resolveActivePlexAdminToken();

    let plexUserId = portalUser?.plexHomeUserId || (!portalUser ? targetUserOrPlexId : "");
    const targetEmail = (portalUser?.plexEmail || portalUser?.email || "").toLowerCase().trim();
    const targetUsername = (portalUser?.plexUsername || portalUser?.username || "").toLowerCase().trim();

    let plexApiUpdated = false;

    if (adminToken) {
        // Resolve Plex ID from /api/users if not cached
        if (!plexUserId || !/^\d+$/.test(plexUserId)) {
            try {
                const xmlRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                    headers: {
                        "Accept": "application/xml",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                    }
                });
                if (xmlRes.ok) {
                    const xmlText = await xmlRes.text();
                    const blocks = xmlText.matchAll(/<User\b([^>]*?)(?:\/>|>[\s\S]*?<\/User>)/gi);
                    for (const b of blocks) {
                        const attrs = b[1] || "";
                        const uid = attrs.match(/\bid="([^"]*)"/i)?.[1] || "";
                        const uEmail = (attrs.match(/\bemail="([^"]*)"/i)?.[1] || "").toLowerCase().trim();
                        const uName = (attrs.match(/\busername="([^"]*)"/i)?.[1] || attrs.match(/\btitle="([^"]*)"/i)?.[1] || "").toLowerCase().trim();
                        if (
                            (targetEmail && uEmail === targetEmail) ||
                            (targetUsername && uName === targetUsername) ||
                            uid === targetUserOrPlexId
                        ) {
                            plexUserId = uid;
                            break;
                        }
                    }
                }
            } catch {}
        }

        const flagVal = allow ? "1" : "0";

        // 1. Update via canonical /api/friends/{plexUserId} endpoint (sets allowTuners & allowChannels)
        if (plexUserId && /^\d+$/.test(plexUserId)) {
            try {
                const friendUrl = `https://plex.tv/api/friends/${encodeURIComponent(plexUserId)}?allowTuners=${flagVal}&allowChannels=${flagVal}&X-Plex-Token=${encodeURIComponent(adminToken)}`;
                const res = await fetch(friendUrl, {
                    method: "PUT",
                    headers: {
                        "Accept": "application/xml, application/json, */*",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                    }
                });
                if (res.ok) {
                    plexApiUpdated = true;
                }
            } catch {}
        }

        // 2. Also update sharing_settings across owned server shares
        try {
            const shares = await getPlexSharedServersList(adminToken);
            const matchingShares = shares.filter((s) => {
                const sEmail = (s.user?.email || s.invitedEmail || "").toLowerCase().trim();
                const sName = (s.user?.username || s.user?.title || "").toLowerCase().trim();
                const sUid = String(s.user?.id || "");
                return (
                    (plexUserId && sUid === String(plexUserId)) ||
                    (targetEmail && sEmail === targetEmail) ||
                    (targetUsername && sName === targetUsername)
                );
            });

            for (const sh of matchingShares) {
                if (!sh.id || !sh.serverId) continue;
                const url = `https://plex.tv/api/servers/${encodeURIComponent(sh.serverId)}/shared_servers/${encodeURIComponent(String(sh.id))}`;
                const putRes = await fetch(url, {
                    method: "PUT",
                    headers: {
                        "Accept": "application/json, */*",
                        "Content-Type": "application/json",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                    },
                    body: JSON.stringify({
                        server_id: sh.serverId,
                        shared_server: {
                            allowTuners: flagVal,
                            allowChannels: flagVal
                        },
                        sharing_settings: {
                            allowTuners: flagVal,
                            allowChannels: flagVal
                        }
                    })
                }).catch(() => null);

                if (putRes && putRes.ok) {
                    plexApiUpdated = true;
                }
            }
        } catch {}
    }

    if (portalUser) {
        await prisma.user.update({
            where: { id: portalUser.id },
            data: {
                hasPlexLiveTvAccess: allow,
                ...(plexUserId ? { plexHomeUserId: plexUserId } : {}),
                ...(allow ? { canAccessIptv: true } : {})
            }
        });
    } else if (plexUserId) {
        await prisma.user.updateMany({
            where: { plexHomeUserId: plexUserId },
            data: {
                hasPlexLiveTvAccess: allow,
                ...(allow ? { canAccessIptv: true } : {})
            }
        });
    }

    const displayTarget = portalUser?.username || targetUsername || plexUserId;
    return {
        success: true,
        plexApiUpdated,
        message: allow
            ? `Enabled Plex Live TV streaming privileges for ${displayTarget}.`
            : `Revoked Plex Live TV streaming privileges for ${displayTarget}.`
    };
}

/**
 * Grants or revokes Plex DVR recording privileges (allowDvr) for a user.
 * Can target either a Portalarr userId or a direct plexUserId.
 */
export async function setPlexUserDvrPrivilege(
    targetUserOrPlexId: string,
    allow: boolean
): Promise<{ success: boolean; message: string; plexApiUpdated: boolean }> {
    const portalUser = await prisma.user.findUnique({ where: { id: targetUserOrPlexId } });
    const adminToken = await resolveActivePlexAdminToken();

    let plexUserId = portalUser?.plexHomeUserId || (!portalUser ? targetUserOrPlexId : "");
    const targetEmail = (portalUser?.plexEmail || portalUser?.email || "").toLowerCase().trim();
    const targetUsername = (portalUser?.plexUsername || portalUser?.username || "").toLowerCase().trim();

    let plexApiUpdated = false;

    if (adminToken) {
        if (!plexUserId || !/^\d+$/.test(plexUserId)) {
            try {
                const xmlRes = await fetch(`https://plex.tv/api/users?X-Plex-Token=${encodeURIComponent(adminToken)}`, {
                    headers: {
                        "Accept": "application/xml",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                    }
                });
                if (xmlRes.ok) {
                    const xmlText = await xmlRes.text();
                    const blocks = xmlText.matchAll(/<User\b([^>]*?)(?:\/>|>[\s\S]*?<\/User>)/gi);
                    for (const b of blocks) {
                        const attrs = b[1] || "";
                        const uid = attrs.match(/\bid="([^"]*)"/i)?.[1] || "";
                        const uEmail = (attrs.match(/\bemail="([^"]*)"/i)?.[1] || "").toLowerCase().trim();
                        const uName = (attrs.match(/\busername="([^"]*)"/i)?.[1] || attrs.match(/\btitle="([^"]*)"/i)?.[1] || "").toLowerCase().trim();
                        if (
                            (targetEmail && uEmail === targetEmail) ||
                            (targetUsername && uName === targetUsername) ||
                            uid === targetUserOrPlexId
                        ) {
                            plexUserId = uid;
                            break;
                        }
                    }
                }
            } catch {}
        }

        const dvrVal = allow ? "1" : "0";

        // 1. Update friend parameters
        if (plexUserId && /^\d+$/.test(plexUserId)) {
            try {
                const friendUrl = `https://plex.tv/api/friends/${encodeURIComponent(plexUserId)}?allowDvr=${dvrVal}&X-Plex-Token=${encodeURIComponent(adminToken)}`;
                const res = await fetch(friendUrl, {
                    method: "PUT",
                    headers: {
                        "Accept": "application/xml, application/json, */*",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                    }
                });
                if (res.ok) {
                    plexApiUpdated = true;
                }
            } catch {}
        }

        // 2. Also update server shares
        try {
            const shares = await getPlexSharedServersList(adminToken);
            const matchingShares = shares.filter((s) => {
                const sEmail = (s.user?.email || s.invitedEmail || "").toLowerCase().trim();
                const sName = (s.user?.username || s.user?.title || "").toLowerCase().trim();
                const sUid = String(s.user?.id || "");
                return (
                    (plexUserId && sUid === String(plexUserId)) ||
                    (targetEmail && sEmail === targetEmail) ||
                    (targetUsername && sName === targetUsername)
                );
            });

            for (const sh of matchingShares) {
                if (!sh.id || !sh.serverId) continue;
                const url = `https://plex.tv/api/servers/${encodeURIComponent(sh.serverId)}/shared_servers/${encodeURIComponent(String(sh.id))}`;
                const putRes = await fetch(url, {
                    method: "PUT",
                    headers: {
                        "Accept": "application/json, */*",
                        "Content-Type": "application/json",
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                    },
                    body: JSON.stringify({
                        server_id: sh.serverId,
                        shared_server: {
                            allowDvr: dvrVal
                        },
                        sharing_settings: {
                            allowDvr: dvrVal
                        }
                    })
                }).catch(() => null);

                if (putRes && putRes.ok) {
                    plexApiUpdated = true;
                }
            }
        } catch {}
    }

    if (portalUser) {
        await prisma.user.update({
            where: { id: portalUser.id },
            data: {
                hasPlexDvrAccess: allow,
                ...(plexUserId ? { plexHomeUserId: plexUserId } : {})
            }
        });
    } else if (plexUserId) {
        await prisma.user.updateMany({
            where: { plexHomeUserId: plexUserId },
            data: {
                hasPlexDvrAccess: allow
            }
        });
    }

    const displayTarget = portalUser?.username || targetUsername || plexUserId;
    return {
        success: true,
        plexApiUpdated,
        message: allow
            ? `Enabled Plex DVR recording privileges for ${displayTarget}.`
            : `Revoked Plex DVR recording privileges for ${displayTarget}.`
    };
}

/**
 * Invites a user into the server owner's Plex Home and enables Live TV tuner privileges.
 */
export async function inviteUserToPlexHome(
    userId: string,
    grantLiveTv = true
): Promise<{ success: boolean; message: string; error?: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return { success: false, message: "User not found", error: "User not found" };
    }

    const iptvSettings = await getIptvSettings();
    const currentHomeCount = await prisma.user.count({
        where: { isPlexHomeMember: true, role: { not: "ADMIN" } }
    });

    if (!user.isPlexHomeMember && currentHomeCount >= (iptvSettings.plexHomeMaxSlots || 14)) {
        return {
            success: false,
            message: `Plex Home is at capacity (${currentHomeCount}/${iptvSettings.plexHomeMaxSlots || 14} member slots used).`,
            error: `Plex Home is at capacity (${currentHomeCount}/${iptvSettings.plexHomeMaxSlots || 14} member slots used). Rotate an inactive member out or grant Jellyfin / Standalone M3U access instead.`
        };
    }

    const targetIdentifier = (user.plexEmail || user.email || user.plexUsername || user.username).trim();
    const adminToken = await resolveActivePlexAdminToken();
    let plexHomeUserId = user.plexHomeUserId || null;

    if (adminToken && targetIdentifier) {
        try {
            // 1. Canonical Plex Home invite endpoint
            const inviteUrl = `https://plex.tv/api/home/users?invitedEmail=${encodeURIComponent(targetIdentifier)}&X-Plex-Token=${encodeURIComponent(adminToken)}`;
            const res = await fetch(inviteUrl, {
                method: "POST",
                headers: {
                    "Accept": "application/json, application/xml, */*",
                    "X-Plex-Token": adminToken,
                    "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                },
                signal: AbortSignal.timeout(3500)
            }).catch(() => null);

            if (res && res.ok) {
                const text = await res.text().catch(() => "");
                const idMatch = text.match(/\bid="([^"]*)"/i)?.[1];
                if (idMatch) plexHomeUserId = idMatch;
            } else {
                // Fallback to v2 endpoint
                const v2Res = await fetch(
                    `https://plex.tv/api/v2/home/users?invitedEmail=${encodeURIComponent(targetIdentifier)}`,
                    {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            "X-Plex-Token": adminToken,
                            "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                        },
                        signal: AbortSignal.timeout(3500)
                    }
                ).catch(() => null);

                if (v2Res && v2Res.ok) {
                    const data = await v2Res.json().catch(() => null);
                    if (data?.id) plexHomeUserId = String(data.id);
                }
            }
        } catch (err: any) {
            logger.addLog("WARN", "PLEX", `[PLEX-HOME] Cloud invite warning for "${targetIdentifier}": ${err?.message || err}`);
        }
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            isPlexHomeMember: true,
            plexHomeUserId: plexHomeUserId || user.plexHomeUserId,
            plexHomeJoinedAt: user.plexHomeJoinedAt || new Date(),
            hasPlexLiveTvAccess: grantLiveTv,
            hasPlexDvrAccess: grantLiveTv,
            canAccessIptv: true
        }
    });

    if (grantLiveTv) {
        await setPlexUserLiveTvPrivilege(user.id, true);
        await setPlexUserDvrPrivilege(user.id, true);
    }

    return {
        success: true,
        message: `Added ${user.username} to Plex Home${grantLiveTv ? " with Live TV & DVR privileges enabled" : ""}.`
    };
}

/**
 * Removes a user from Plex Home (demoting them back to a standard Plex Friend while preserving VOD libraries).
 */
export async function removeUserFromPlexHome(
    userId: string
): Promise<{ success: boolean; message: string; error?: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return { success: false, message: "User not found", error: "User not found" };
    }

    const adminToken = await resolveActivePlexAdminToken();
    const plexId = user.plexHomeUserId;

    if (adminToken && plexId && /^\d+$/.test(plexId)) {
        try {
            await fetch(
                `https://plex.tv/api/home/users/${encodeURIComponent(plexId)}?X-Plex-Token=${encodeURIComponent(adminToken)}`,
                {
                    method: "DELETE",
                    headers: {
                        "X-Plex-Token": adminToken,
                        "X-Plex-Client-Identifier": PLEX_CLIENT_ID
                    }
                }
            ).catch(() => null);

            await setPlexUserLiveTvPrivilege(user.id, false);
            await setPlexUserDvrPrivilege(user.id, false);
        } catch {}
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            isPlexHomeMember: false,
            hasPlexLiveTvAccess: false,
            hasPlexDvrAccess: false,
            plexHomeJoinedAt: null
        }
    });

    return {
        success: true,
        message: `Removed ${user.username} from Plex Home (regular Movie & TV library access remains intact).`
    };
}

/**
 * Grants or revokes EnableLiveTvAccess on Jellyfin / Emby for a Portalarr user,
 * preserving 100% of their existing library folder policies.
 */
export async function setJellyfinUserLiveTvAccess(
    userId: string,
    enableLiveTv: boolean
): Promise<{ success: boolean; message: string; serversUpdated: number; error?: string }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
        return { success: false, message: "User not found", serversUpdated: 0, error: "User not found" };
    }

    const mediaServers = await prisma.mediaServer.findMany({
        where: { isActive: true }
    });

    let serversUpdated = 0;
    let discoveredRemoteId = user.jellyfinUserId || "";

    for (const ms of mediaServers) {
        try {
            const apiKey = decryptData(ms.apiKey);
            if (!apiKey) continue;

            const srvConfig = { url: ms.url, internalUrl: ms.internalUrl, apiKey };
            let remoteUserId = discoveredRemoteId;
            let currentPolicy: any = null;

            // 1. Find user on Jellyfin and retrieve their existing Policy object
            const usersRes = await resilientMediaServerFetch(srvConfig, "/Users", { method: "GET" });
            if (usersRes.ok) {
                const list = await usersRes.json().catch(() => []);
                if (Array.isArray(list)) {
                    const match = list.find(
                        (u: any) =>
                            (remoteUserId && u.Id === remoteUserId) ||
                            (u.Name && u.Name.toLowerCase() === (user.jellyfinUsername || user.username).toLowerCase()) ||
                            (u.Name && u.Name.toLowerCase() === user.username.toLowerCase())
                    );
                    if (match) {
                        remoteUserId = String(match.Id);
                        discoveredRemoteId = remoteUserId;
                        currentPolicy = match.Policy || {};
                    }
                }
            }

            // 2. Create user on Jellyfin if they don't exist yet and we are enabling Live TV
            if (!remoteUserId && enableLiveTv) {
                const createRes = await resilientMediaServerFetch(srvConfig, "/Users/New", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ Name: user.jellyfinUsername || user.username })
                });
                if (createRes.ok) {
                    const created = await createRes.json().catch(() => null);
                    if (created?.Id) {
                        remoteUserId = String(created.Id);
                        discoveredRemoteId = remoteUserId;
                        currentPolicy = created.Policy || {};
                    }
                }
            }

            if (!remoteUserId) continue;

            // Fetch full user object if Policy wasn't embedded in /Users list
            if (!currentPolicy) {
                const singleRes = await resilientMediaServerFetch(srvConfig, `/Users/${remoteUserId}`, {
                    method: "GET"
                });
                if (singleRes.ok) {
                    const singleData = await singleRes.json().catch(() => ({}));
                    currentPolicy = singleData.Policy || {};
                } else {
                    currentPolicy = {};
                }
            }

            // 3. Merge EnableLiveTvAccess while preserving existing EnabledFolders and restrictions
            const updatedPolicy = {
                ...currentPolicy,
                EnableLiveTvAccess: enableLiveTv,
                EnableLiveTvManagement: false
            };

            const policyRes = await resilientMediaServerFetch(srvConfig, `/Users/${remoteUserId}/Policy`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(updatedPolicy)
            });

            if (policyRes.ok) {
                serversUpdated++;
            }
        } catch (err: any) {
            logger.addLog("WARN", "SYSTEM", `[JELLYFIN-LIVETV] Policy sync warning on "${ms.name}": ${err?.message || err}`);
        }
    }

    await prisma.user.update({
        where: { id: user.id },
        data: {
            hasJellyfinLiveTvAccess: enableLiveTv,
            ...(discoveredRemoteId ? { jellyfinUserId: discoveredRemoteId } : {}),
            ...(enableLiveTv ? { canAccessIptv: true } : {})
        }
    });

    return {
        success: true,
        serversUpdated,
        message: enableLiveTv
            ? `Enabled Jellyfin Live TV policy for ${user.username}${serversUpdated > 0 ? ` (${serversUpdated} server${serversUpdated === 1 ? "" : "s"} synced)` : ""}.`
            : `Disabled Jellyfin Live TV policy for ${user.username}.`
    };
}
