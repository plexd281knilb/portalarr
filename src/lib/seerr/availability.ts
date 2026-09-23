import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getPlexServers, getPlexServerSections } from "@/lib/plex";
import { analyzeMediaStreamInfo } from "@/lib/curation/plex-analyzer";
import { getEnabledArrInstancesInternal, arrApiGet } from "@/app/arr-actions";
import { logger } from "@/lib/logger";

export interface MediaAvailabilityStatus {
    inLibrary: boolean;
    has4k?: boolean;
    plexRatingKey?: string;
    plexServerName?: string;
    plexServerUrl?: string;
    quality?: string;
    availableSeasons?: number[];
    isRequested: boolean;
    requestId?: string;
    requestStatus?: string; // "PENDING", "APPROVED", "DECLINED", "PROCESSING", "PARTIALLY_AVAILABLE", "AVAILABLE", "FAILED"
    is4kRequest?: boolean;
    requestedBy?: string;
    downloadProgress?: number;
    servarrStatus?: string;
}

// In-memory cache for fast availability checking (TTL: 2 minutes)
let plexLibraryGuidCache: {
    timestamp: number;
    guids: Map<string, { ratingKey: string; serverName: string; quality?: string; is4k?: boolean; type: string; title: string; year?: number }>;
} | null = null;

const CACHE_TTL_MS = 2 * 60 * 1000;

/**
 * Builds or retrieves the Plex GUID lookup cache across all configured servers
 */
export async function getPlexLibraryGuidIndex(forceRefresh = false): Promise<Map<string, { ratingKey: string; serverName: string; quality?: string; is4k?: boolean; type: string; title: string; year?: number }>> {
    const now = Date.now();
    if (!forceRefresh && plexLibraryGuidCache && (now - plexLibraryGuidCache.timestamp < CACHE_TTL_MS)) {
        return plexLibraryGuidCache.guids;
    }

    const index = new Map<string, { ratingKey: string; serverName: string; quality?: string; is4k?: boolean; type: string; title: string; year?: number }>();

    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return index;

        const servers = await getPlexServers(token).catch(() => []);
        
        await Promise.allSettled(servers.map(async (srv) => {
            const sToken = srv.accessToken || token;
            const primaryConn = srv.connections[0];
            if (!primaryConn?.uri) return;

            const base = primaryConn.uri.replace(/\/+$/, "");

            try {
                // Fetch library sections
                const secRes = await fetch(`${base}/library/sections?X-Plex-Token=${encodeURIComponent(sToken)}`, {
                    headers: { "Accept": "application/json" },
                    next: { revalidate: 300 }
                });
                if (!secRes.ok) return;

                const secData = await secRes.json();
                const sections = secData.MediaContainer?.Directory || [];

                await Promise.allSettled(sections.map(async (sec: any) => {
                    const secType = sec.type;
                    if (secType !== "movie" && secType !== "show") return;

                    try {
                        const itemsRes = await fetch(`${base}/library/sections/${sec.key}/all?includeGuids=1&X-Plex-Token=${encodeURIComponent(sToken)}`, {
                            headers: { "Accept": "application/json" },
                            next: { revalidate: 180 }
                        });
                        if (!itemsRes.ok) return;

                        const itemsData = await itemsRes.json();
                        const items = itemsData.MediaContainer?.Metadata || [];

                        for (const item of items) {
                            const streamInfo = analyzeMediaStreamInfo(item);
                            const ratingKey = String(item.ratingKey);
                            const is4k = streamInfo.detectedBadges.resolution === "4K";
                            const quality = streamInfo.detectedBadges.videoFormatLabel || streamInfo.detectedBadges.resolution || "1080p";
                            const record = {
                                ratingKey,
                                serverName: srv.name,
                                quality,
                                is4k,
                                type: secType === "show" ? "tv" : "movie",
                                title: item.title,
                                year: item.year ? parseInt(item.year, 10) : undefined
                            };

                            // Index by TMDb GUID
                            if (streamInfo.guids.tmdb) {
                                index.set(`tmdb:${secType === "show" ? "tv" : "movie"}:${streamInfo.guids.tmdb}`, record);
                            }
                            // Index by IMDb GUID
                            if (streamInfo.guids.imdb) {
                                index.set(`imdb:${streamInfo.guids.imdb}`, record);
                            }
                            // Index by TVDb GUID
                            if (streamInfo.guids.tvdb) {
                                index.set(`tvdb:${streamInfo.guids.tvdb}`, record);
                            }
                            // Index by normalized title + year
                            if (item.title) {
                                const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                                index.set(`title:${secType === "show" ? "tv" : "movie"}:${normTitle}:${item.year || ""}`, record);
                            }
                        }
                    } catch (e) {}
                }));
            } catch (e) {}
        }));

        plexLibraryGuidCache = {
            timestamp: now,
            guids: index
        };
    } catch (e) {
        logger.addLog("WARN", "SEERR", `Failed building Plex GUID cache: ${(e as Error).message}`);
    }

    return index;
}

/**
 * Checks single media availability against Plex and active MediaRequests
 */
export async function checkMediaAvailability(
    tmdbId: number,
    mediaType: "movie" | "tv",
    imdbId?: string,
    tvdbId?: number,
    title?: string,
    year?: number | string
): Promise<MediaAvailabilityStatus> {
    const result: MediaAvailabilityStatus = {
        inLibrary: false,
        isRequested: false
    };

    try {
        // 1. Check existing requests in SQLite
        const existingRequest = await prisma.mediaRequest.findFirst({
            where: {
                tmdbId,
                mediaType
            },
            orderBy: { createdAt: "desc" }
        });

        if (existingRequest) {
            result.isRequested = true;
            result.requestId = existingRequest.id;
            result.requestStatus = existingRequest.status;
            result.is4kRequest = existingRequest.is4k;
            result.requestedBy = existingRequest.requestedByUsername;
            result.downloadProgress = existingRequest.downloadProgress ?? undefined;

            if (existingRequest.status === "AVAILABLE" || existingRequest.status === "PARTIALLY_AVAILABLE") {
                result.inLibrary = true;
            }
        }

        // 2. Check Plex GUID index
        const guidIndex = await getPlexLibraryGuidIndex();
        
        let match = guidIndex.get(`tmdb:${mediaType}:${tmdbId}`);
        if (!match && imdbId) match = guidIndex.get(`imdb:${imdbId}`);
        if (!match && tvdbId) match = guidIndex.get(`tvdb:${tvdbId}`);
        if (!match && title) {
            const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
            match = guidIndex.get(`title:${mediaType}:${normTitle}:${year || ""}`);
        }

        if (match) {
            result.inLibrary = true;
            result.plexRatingKey = match.ratingKey;
            result.plexServerName = match.serverName;
            result.quality = match.quality;
            result.has4k = match.is4k;

            // If request exists and was pending/processing, auto-upgrade request to AVAILABLE
            if (existingRequest && existingRequest.status !== "AVAILABLE" && existingRequest.status !== "DECLINED") {
                await prisma.mediaRequest.update({
                    where: { id: existingRequest.id },
                    data: {
                        status: "AVAILABLE",
                        availableAt: new Date()
                    }
                }).catch(() => {});
                result.requestStatus = "AVAILABLE";
            }
        }
    } catch (e) {
        logger.addLog("WARN", "SEERR", `Error checking media availability: ${(e as Error).message}`);
    }

    return result;
}

/**
 * Batch checks media availability for a list of TMDb items for fast carousel and grid rendering
 */
export async function batchCheckMediaAvailability(
    items: { id: number; mediaType: "movie" | "tv"; imdbId?: string; tvdbId?: number; title?: string; releaseDate?: string }[]
): Promise<Record<number, MediaAvailabilityStatus>> {
    const results: Record<number, MediaAvailabilityStatus> = {};
    if (!items || items.length === 0) return results;

    try {
        // Fetch all active requests for these TMDb IDs in 1 single fast query
        const tmdbIds = items.map(i => i.id);
        const existingRequests = await prisma.mediaRequest.findMany({
            where: {
                tmdbId: { in: tmdbIds }
            }
        });

        const requestMap = new Map<string, any>();
        for (const req of existingRequests) {
            requestMap.set(`${req.mediaType}:${req.tmdbId}`, req);
        }

        const guidIndex = await getPlexLibraryGuidIndex().catch(() => new Map());

        for (const item of items) {
            const req = requestMap.get(`${item.mediaType}:${item.id}`);
            const status: MediaAvailabilityStatus = {
                inLibrary: false,
                isRequested: Boolean(req)
            };

            if (req) {
                status.requestId = req.id;
                status.requestStatus = req.status;
                status.is4kRequest = req.is4k;
                status.requestedBy = req.requestedByUsername;
                status.downloadProgress = req.downloadProgress ?? undefined;
                if (req.status === "AVAILABLE" || req.status === "PARTIALLY_AVAILABLE") {
                    status.inLibrary = true;
                }
            }

            // Check Plex Match
            let match = guidIndex.get(`tmdb:${item.mediaType}:${item.id}`);
            if (!match && item.imdbId) match = guidIndex.get(`imdb:${item.imdbId}`);
            if (!match && item.tvdbId) match = guidIndex.get(`tvdb:${item.tvdbId}`);
            if (!match && item.title) {
                const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                const year = item.releaseDate ? item.releaseDate.split("-")[0] : "";
                match = guidIndex.get(`title:${item.mediaType}:${normTitle}:${year}`);
            }

            if (match) {
                status.inLibrary = true;
                status.plexRatingKey = match.ratingKey;
                status.plexServerName = match.serverName;
                status.quality = match.quality;
                status.has4k = match.is4k;
                if (req && req.status !== "AVAILABLE" && req.status !== "DECLINED") {
                    status.requestStatus = "AVAILABLE";
                }
            }

            results[item.id] = status;
        }
    } catch (e) {
        logger.addLog("WARN", "SEERR", `Error batch checking media availability: ${(e as Error).message}`);
    }

    return results;
}
