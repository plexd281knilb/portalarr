import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface UserStreamAnalysis {
    username: string;
    email?: string;
    activeSessionsCount: number;
    sessions: any[];
    distinctIps: string[];
    distinctPublicIps: string[];
    devices: string[];
    platforms: string[];
    servers: string[];
    isMultiIp: boolean;
    isExcessiveConnections: boolean;
    isSharingSuspected: boolean;
    sharingReason?: string;
}

export interface WatchHistoryQueryOptions {
    user?: string;
    mediaType?: string;
    isSharingAlert?: boolean;
    search?: string;
    page?: number;
    limit?: number;
}

/**
 * Normalizes an IP address by stripping ports and IPv6 tunneling prefixes (::ffff:)
 */
export function normalizeIp(rawIp?: string | null): string {
    if (!rawIp) return "";
    let ip = rawIp.trim();
    if (ip.startsWith("::ffff:")) {
        ip = ip.replace("::ffff:", "");
    }
    // If IPv4 with port e.g. 192.168.1.50:52431
    if (ip.includes(":") && !ip.includes("::") && ip.split(":").length === 2) {
        ip = ip.split(":")[0];
    }
    return ip;
}

/**
 * Determines if an IP is local / private / loopback RFC1918
 */
export function isPrivateOrLocalIp(rawIp?: string | null): boolean {
    const ip = normalizeIp(rawIp);
    if (!ip) return true;
    if (ip === "localhost" || ip === "127.0.0.1" || ip === "::1") return true;
    if (ip.startsWith("192.168.")) return true;
    if (ip.startsWith("10.")) return true;
    if (ip.startsWith("169.254.")) return true;
    if (ip.startsWith("fc00:") || ip.startsWith("fe80:")) return true;

    // 172.16.0.0 – 172.31.255.255
    if (ip.startsWith("172.")) {
        const parts = ip.split(".");
        if (parts.length >= 2) {
            const secondOctet = parseInt(parts[1], 10);
            if (!isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Evaluates active stream sessions to detect concurrent connections and credential/password sharing
 */
export function analyzeActiveSessionsForSharing(
    sessions: any[],
    defaultMaxStreams: number = 3
): Map<string, UserStreamAnalysis> {
    const userMap = new Map<string, any[]>();

    for (const s of sessions) {
        const rawUser = (s.user || s.User?.title || s.User?.username || s.username || "Plex User").trim();
        const userKey = rawUser.toLowerCase();
        if (!userMap.has(userKey)) {
            userMap.set(userKey, []);
        }
        userMap.get(userKey)!.push(s);
    }

    const analyses = new Map<string, UserStreamAnalysis>();

    for (const [userKey, userSessions] of userMap.entries()) {
        const first = userSessions[0];
        const username = first.user || first.User?.title || userKey;
        const email = first.email || first.User?.email || "";

        const allIps = new Set<string>();
        const publicIps = new Set<string>();
        const devices = new Set<string>();
        const platforms = new Set<string>();
        const servers = new Set<string>();

        for (const s of userSessions) {
            const rawIp = s.ipAddress || s.Player?.address || s.ip_address || "";
            const cleanIp = normalizeIp(rawIp);
            if (cleanIp) {
                allIps.add(cleanIp);
                if (!isPrivateOrLocalIp(cleanIp)) {
                    publicIps.add(cleanIp);
                }
            }

            const dev = s.device || s.Player?.device || s.Player?.platform || "";
            if (dev) devices.add(dev);

            const plat = s.player || s.Player?.title || "";
            if (plat) platforms.add(plat);

            const srv = s.serverName || "";
            if (srv) servers.add(srv);
        }

        const distinctIpsList = Array.from(allIps);
        const distinctPublicIpsList = Array.from(publicIps);
        const streamCount = userSessions.length;

        // Multi-IP sharing detection: streaming from >= 2 distinct public IP addresses at the exact same time
        const isMultiIp = distinctPublicIpsList.length >= 2;
        const isExcessiveConnections = streamCount > defaultMaxStreams;
        const isSharingSuspected = isMultiIp || (streamCount >= 4 && distinctIpsList.length >= 2);

        let sharingReason: string | undefined = undefined;
        if (isMultiIp) {
            sharingReason = `Simultaneous playback from ${distinctPublicIpsList.length} distinct public IP addresses (${distinctPublicIpsList.join(", ")})`;
        } else if (isExcessiveConnections) {
            sharingReason = `User exceeds limit with ${streamCount} simultaneous active streams (limit: ${defaultMaxStreams})`;
        }

        analyses.set(userKey, {
            username,
            email,
            activeSessionsCount: streamCount,
            sessions: userSessions,
            distinctIps: distinctIpsList,
            distinctPublicIps: distinctPublicIpsList,
            devices: Array.from(devices),
            platforms: Array.from(platforms),
            servers: Array.from(servers),
            isMultiIp,
            isExcessiveConnections,
            isSharingSuspected,
            sharingReason
        });
    }

    return analyses;
}

/**
 * Records active streaming sessions into WatchHistory and performs security auditing
 */
export async function recordActivePlexSessions(
    sessions: any[]
): Promise<{ success: boolean; recorded: number; recordedCount: number; sharingAlerts: number; analyses: UserStreamAnalysis[] }> {
    if (!sessions || sessions.length === 0) {
        return { success: true, recorded: 0, recordedCount: 0, sharingAlerts: 0, analyses: [] };
    }

    try {
        const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
        const defaultMaxStreams = settings?.maxConcurrentStreamsPerUser || 3;
        const detectSharing = settings?.detectPasswordSharing ?? true;

        const analysesMap = analyzeActiveSessionsForSharing(sessions, defaultMaxStreams);
        const analysesList = Array.from(analysesMap.values());

        let recordedCount = 0;
        let alertCount = 0;

        for (const s of sessions) {
            const rawUser = (s.user || s.User?.title || s.User?.username || s.username || "Plex User").trim();
            const userKey = rawUser.toLowerCase();
            const analysis = analysesMap.get(userKey);

            const isSharingAlert = detectSharing && Boolean(analysis?.isSharingSuspected);
            const sharingAlertNote = isSharingAlert ? analysis?.sharingReason : null;

            if (isSharingAlert) {
                alertCount++;
            }

            const sessionKey = String(s.sessionKey || s.ratingKey || "");
            const ratingKey = String(s.ratingKey || "");
            const serverName = s.serverName || "Plex";
            const serverId = s.serverId || s.instanceId || null;
            const title = s.title || "Unknown Media";
            const grandparentTitle = s.grandparentTitle || null;
            const parentTitle = s.parentTitle || null;
            const seasonNum = s.seasonNum !== undefined ? Number(s.seasonNum) : null;
            const episodeNum = s.episodeNum !== undefined ? Number(s.episodeNum) : null;
            const mediaType = s.mediaType || (grandparentTitle ? "episode" : "movie");
            const year = s.year ? parseInt(String(s.year), 10) || null : null;
            const thumb = s.thumb || null;
            const player = s.player || null;
            const platform = s.device || null;
            const device = s.device || null;
            const rawIp = s.ipAddress || s.Player?.address || null;
            const ipAddress = normalizeIp(rawIp);
            const location = isPrivateOrLocalIp(ipAddress) ? "LAN" : "Remote";
            const videoDecision = s.videoDecision || "direct play";
            const audioDecision = s.audioDecision || "direct play";
            const transcodeHw = Boolean(s.transcodeHwRequested || s.transcodeHwEncoding || s.transcodeHwDecoding);
            const streamBitrate = s.streamBitrate ? Number(s.streamBitrate) : null;
            const durationMs = s.duration ? Math.round(Number(s.duration)) : (s.durationMs ? Math.round(Number(s.durationMs)) : null);
            const viewOffsetMs = s.viewOffset ? Math.round(Number(s.viewOffset)) : (s.viewOffsetMs ? Math.round(Number(s.viewOffsetMs)) : null);
            let progressPercent = s.progressPercent !== undefined ? Number(s.progressPercent) : 0;
            if (!progressPercent && viewOffsetMs && durationMs && durationMs > 0) {
                progressPercent = Math.min(100, Math.round((viewOffsetMs / durationMs) * 100));
            }
            const state = s.state || "playing";
            const isCompleted = progressPercent >= 90;

            // Resolve Portalarr user account if exists
            let userId: string | null = null;
            try {
                const matchedUser = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username: { equals: rawUser } },
                            { plexUsername: { equals: rawUser } },
                            { email: { equals: s.email || "" } }
                        ]
                    },
                    select: { id: true, sharingAlertCount: true }
                });
                if (matchedUser) {
                    userId = matchedUser.id;
                    if (isSharingAlert) {
                        await prisma.user.update({
                            where: { id: matchedUser.id },
                            data: {
                                sharingAlertCount: { increment: 1 },
                                lastSharingAlertAt: new Date()
                            }
                        }).catch(() => {});
                    }
                }
            } catch {}

            // Find recent existing stream record for this session key/user to update progress
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
            const existingRecord = await prisma.watchHistory.findFirst({
                where: {
                    user: rawUser,
                    serverName: serverName,
                    ...(sessionKey ? { sessionKey } : { title }),
                    watchedAt: { gte: fourHoursAgo }
                },
                orderBy: { watchedAt: "desc" }
            }).catch(() => null);

            if (existingRecord) {
                await prisma.watchHistory.update({
                    where: { id: existingRecord.id },
                    data: {
                        progressPercent: Math.max(existingRecord.progressPercent, progressPercent),
                        viewOffsetMs: viewOffsetMs || existingRecord.viewOffsetMs,
                        durationMs: durationMs || existingRecord.durationMs,
                        state: isCompleted ? "completed" : state,
                        stoppedAt: new Date(),
                        completed: existingRecord.completed || isCompleted,
                        isSharingAlert: existingRecord.isSharingAlert || isSharingAlert,
                        sharingAlertNote: sharingAlertNote || existingRecord.sharingAlertNote,
                        ipAddress: ipAddress || existingRecord.ipAddress
                    }
                }).catch(() => {});
            } else {
                await prisma.watchHistory.create({
                    data: {
                        sessionKey: sessionKey || undefined,
                        ratingKey: ratingKey || undefined,
                        serverName,
                        serverId,
                        user: rawUser,
                        userEmail: s.email || undefined,
                        userId,
                        title,
                        grandparentTitle,
                        parentTitle,
                        seasonNum,
                        episodeNum,
                        mediaType,
                        year,
                        thumb,
                        player,
                        platform,
                        device,
                        ipAddress,
                        location,
                        videoDecision,
                        audioDecision,
                        transcodeHw,
                        streamBitrate,
                        viewOffsetMs: viewOffsetMs || 0,
                        durationMs: durationMs || 0,
                        progressPercent,
                        state: isCompleted ? "completed" : state,
                        watchedAt: new Date(),
                        stoppedAt: new Date(),
                        completed: isCompleted,
                        isSharingAlert,
                        sharingAlertNote
                    }
                }).catch(() => {});
            }

            recordedCount++;
        }

        // Log security warnings for sharing events
        for (const a of analysesList) {
            if (a.isSharingSuspected) {
                logger.addLog(
                    "WARN",
                    "SECURITY",
                    `🚨 [CREDENTIAL-SHARING-ALERT] User "${a.username}" streaming concurrently across ${a.distinctPublicIps.length} distinct public IP addresses: [${a.distinctPublicIps.join(", ")}]. Devices: ${a.devices.join(", ")}.`
                );
            }
        }

        return { success: true, recorded: recordedCount, recordedCount, sharingAlerts: alertCount, analyses: analysesList };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error recording active streams:", err.message || err);
        return { success: false, recorded: 0, recordedCount: 0, sharingAlerts: 0, analyses: [] };
    }
}

/**
 * Ensures any watch history thumbnail URL is safely proxied through /api/media/image
 * to eliminate mixed content warnings and LAN IP unreachability in client browsers.
 */
export function formatWatchHistoryThumb(item: any): string | null {
    if (!item) return null;
    let rawThumb = item.thumb || "";
    const title = item.grandparentTitle || item.title || "";
    const year = item.year ? String(item.year) : "";
    const type = item.mediaType || (item.grandparentTitle ? "episode" : "movie");

    if (rawThumb && rawThumb.startsWith("/api/media/image")) {
        return rawThumb;
    }

    if (rawThumb && (rawThumb.startsWith("http://") || rawThumb.startsWith("https://"))) {
        try {
            const parsed = new URL(rawThumb);
            if (parsed.searchParams.has("img")) {
                rawThumb = parsed.searchParams.get("img") || "";
            } else if (parsed.searchParams.has("url")) {
                rawThumb = parsed.searchParams.get("url") || "";
            } else if (parsed.pathname.includes("/library/metadata/")) {
                rawThumb = parsed.pathname;
            }
        } catch (e) {}
    }

    if (rawThumb && rawThumb.includes("pms_image_proxy")) {
        try {
            const dummyUrl = new URL(rawThumb.startsWith("http") ? rawThumb : `http://localhost/${rawThumb.replace(/^\/+/, "")}`);
            const nested = dummyUrl.searchParams.get("img") || dummyUrl.searchParams.get("url");
            if (nested) rawThumb = nested;
        } catch (e) {}
    }

    if (rawThumb || title) {
        return `/api/media/image?serverId=${encodeURIComponent(item.serverId || "")}&serverName=${encodeURIComponent(item.serverName || "")}&thumb=${encodeURIComponent(rawThumb)}&title=${encodeURIComponent(title)}&year=${encodeURIComponent(year)}&type=${encodeURIComponent(type)}`;
    }
    return null;
}

/**
 * Retrieves paginated watch history with statistical rollups
 */
export async function getWatchHistory(options?: WatchHistoryQueryOptions) {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 25));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options?.user) {
        where.user = { contains: options.user };
    }
    if (options?.mediaType && options.mediaType !== "all") {
        where.mediaType = options.mediaType;
    }
    if (options?.isSharingAlert !== undefined) {
        where.isSharingAlert = options.isSharingAlert;
    }
    if (options?.search) {
        const q = options.search.trim();
        where.OR = [
            { title: { contains: q } },
            { grandparentTitle: { contains: q } },
            { user: { contains: q } },
            { player: { contains: q } },
            { ipAddress: { contains: q } }
        ];
    }

    try {
        const [total, items, totalAlerts, completedCount] = await Promise.all([
            prisma.watchHistory.count({ where }),
            prisma.watchHistory.findMany({
                where,
                orderBy: { watchedAt: "desc" },
                skip,
                take: limit
            }),
            prisma.watchHistory.count({ where: { isSharingAlert: true } }),
            prisma.watchHistory.count({ where: { completed: true } })
        ]);

        const formattedItems = items.map(it => ({
            ...it,
            thumb: formatWatchHistoryThumb(it)
        }));

        return {
            items: formattedItems,
            total,
            sharingAlertsCount: totalAlerts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            stats: {
                totalWatchSessions: total,
                completedMediaCount: completedCount,
                totalSharingAlerts: totalAlerts
            }
        };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error fetching watch history:", err.message || err);
        return {
            items: [],
            total: 0,
            sharingAlertsCount: 0,
            pagination: { page: 1, limit, total: 0, totalPages: 0 },
            stats: { totalWatchSessions: 0, completedMediaCount: 0, totalSharingAlerts: 0 }
        };
    }
}

/**
 * Retrieves per-user connection and credential sharing security insights
 */
export async function getConnectionSecurityInsights() {
    try {
        const [recentAlerts, usersWithAlerts] = await Promise.all([
            prisma.watchHistory.findMany({
                where: { isSharingAlert: true },
                orderBy: { watchedAt: "desc" },
                take: 10
            }),
            prisma.user.findMany({
                where: { sharingAlertCount: { gt: 0 } },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    sharingAlertCount: true,
                    lastSharingAlertAt: true,
                    maxConcurrentStreams: true
                },
                orderBy: { sharingAlertCount: "desc" }
            })
        ]);

        const formattedAlerts = recentAlerts.map(it => ({
            ...it,
            thumb: formatWatchHistoryThumb(it)
        }));

        return {
            usersWithAlerts,
            recentAlerts: formattedAlerts,
            recentFlaggedIncidents: formattedAlerts
        };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error fetching security insights:", err.message || err);
        return {
            usersWithAlerts: [],
            recentAlerts: [],
            recentFlaggedIncidents: []
        };
    }
}

/**
 * Aggregates all watch history into per-user telemetry profiles across all servers
 */
export async function getUserStreamProfiles() {
    try {
        const records = await prisma.watchHistory.findMany({
            orderBy: { watchedAt: "desc" },
            take: 2000
        });

        const userMap = new Map<string, {
            user: string;
            totalPlays: number;
            completedCount: number;
            totalWatchSeconds: number;
            directPlayCount: number;
            transcodeCount: number;
            servers: Set<string>;
            platforms: Set<string>;
            lastWatchedTitle: string;
            lastWatchedAt: Date;
            lastPlatform: string;
            lastIp: string;
            sharingAlerts: number;
        }>();

        for (const r of records) {
            const uKey = r.user.toLowerCase().trim();
            if (!userMap.has(uKey)) {
                userMap.set(uKey, {
                    user: r.user,
                    totalPlays: 0,
                    completedCount: 0,
                    totalWatchSeconds: 0,
                    directPlayCount: 0,
                    transcodeCount: 0,
                    servers: new Set(),
                    platforms: new Set(),
                    lastWatchedTitle: r.grandparentTitle ? `${r.grandparentTitle} - ${r.title}` : r.title,
                    lastWatchedAt: r.watchedAt,
                    lastPlatform: r.platform || r.player || "Unknown",
                    lastIp: r.ipAddress || "",
                    sharingAlerts: 0
                });
            }

            const profile = userMap.get(uKey)!;
            profile.totalPlays++;
            if (r.completed) profile.completedCount++;
            profile.totalWatchSeconds += Math.round((r.durationMs || 0) / 1000);
            if (r.videoDecision === "direct play") profile.directPlayCount++;
            if (r.videoDecision === "transcode") profile.transcodeCount++;
            if (r.serverName) profile.servers.add(r.serverName);
            if (r.platform) profile.platforms.add(r.platform);
            if (r.isSharingAlert) profile.sharingAlerts++;
        }

        const profiles = Array.from(userMap.values()).map(p => {
            const total = p.directPlayCount + p.transcodeCount;
            const transcodeRate = total > 0 ? Math.round((p.transcodeCount / total) * 100) : 0;
            return {
                user: p.user,
                totalPlays: p.totalPlays,
                completedCount: p.completedCount,
                totalWatchHours: Number((p.totalWatchSeconds / 3600).toFixed(1)),
                directPlayCount: p.directPlayCount,
                transcodeCount: p.transcodeCount,
                transcodeRate,
                servers: Array.from(p.servers),
                platforms: Array.from(p.platforms),
                lastWatchedTitle: p.lastWatchedTitle,
                lastWatchedAt: p.lastWatchedAt,
                lastPlatform: p.lastPlatform,
                lastIp: p.lastIp,
                sharingAlerts: p.sharingAlerts,
                frequentTranscoder: transcodeRate >= 50 && p.totalPlays >= 2
            };
        });

        profiles.sort((a, b) => b.totalPlays - a.totalPlays);
        return profiles;
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error building user stream profiles:", err);
        return [];
    }
}

/**
 * Returns multi-server cluster statistics and top content leaderboards
 */
export async function getStreamIntelligenceAnalytics() {
    try {
        const [totalSessions, allHistory, completedCount] = await Promise.all([
            prisma.watchHistory.count(),
            prisma.watchHistory.findMany({
                select: {
                    title: true,
                    grandparentTitle: true,
                    mediaType: true,
                    durationMs: true,
                    videoDecision: true,
                    serverName: true
                },
                take: 3000
            }),
            prisma.watchHistory.count({ where: { completed: true } })
        ]);

        let totalDurationSeconds = 0;
        let directPlayCount = 0;
        let transcodeCount = 0;

        const moviePlays = new Map<string, number>();
        const showPlays = new Map<string, number>();
        const serverPlays = new Map<string, number>();
        let moviesCount = 0;
        let episodesCount = 0;

        for (const h of allHistory) {
            totalDurationSeconds += Math.round((h.durationMs || 0) / 1000);
            if (h.videoDecision === "direct play") directPlayCount++;
            if (h.videoDecision === "transcode") transcodeCount++;

            if (h.serverName) {
                serverPlays.set(h.serverName, (serverPlays.get(h.serverName) || 0) + 1);
            }

            if (h.mediaType === "movie" || !h.grandparentTitle) {
                moviesCount++;
                const key = h.title;
                moviePlays.set(key, (moviePlays.get(key) || 0) + 1);
            } else {
                episodesCount++;
                const key = h.grandparentTitle || h.title;
                showPlays.set(key, (showPlays.get(key) || 0) + 1);
            }
        }

        const totalPlayback = directPlayCount + transcodeCount;
        const directPlayRatio = totalPlayback > 0 ? Math.round((directPlayCount / totalPlayback) * 100) : 100;

        const topMovies = Array.from(moviePlays.entries())
            .map(([title, plays]) => ({
                title,
                plays,
                thumb: `/api/media/image?title=${encodeURIComponent(title)}&type=movie`
            }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const topShows = Array.from(showPlays.entries())
            .map(([title, plays]) => ({
                title,
                plays,
                thumb: `/api/media/image?title=${encodeURIComponent(title)}&type=show`
            }))
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const playsByServer = Array.from(serverPlays.entries())
            .map(([server, plays]) => ({ server, plays }))
            .sort((a, b) => b.plays - a.plays);

        return {
            totalSessions,
            completedCount,
            totalWatchHours: Number((totalDurationSeconds / 3600).toFixed(1)),
            totalHoursStreamed: Number((totalDurationSeconds / 3600).toFixed(1)),
            directPlayCount,
            transcodeCount,
            directPlayRatio,
            directPlayPercentage: directPlayRatio,
            moviesCount,
            episodesCount,
            topMovies,
            topShows,
            playsByServer
        };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error calculating stream analytics:", err);
        return {
            totalSessions: 0,
            completedCount: 0,
            totalWatchHours: 0,
            totalHoursStreamed: 0,
            directPlayCount: 0,
            transcodeCount: 0,
            directPlayRatio: 100,
            directPlayPercentage: 100,
            moviesCount: 0,
            episodesCount: 0,
            topMovies: [],
            topShows: [],
            playsByServer: []
        };
    }
}

