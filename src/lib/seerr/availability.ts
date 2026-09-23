import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getPlexServers } from "@/lib/plex";
import { analyzeMediaStreamInfo } from "@/lib/curation/plex-analyzer";
import { logger } from "@/lib/logger";

export interface MediaAvailabilityStatus {
    inLibrary: boolean;
    inMainLibraryOnly?: boolean;
    mainLibrarySection?: string;
    plexSectionName?: string;
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

export interface PlexGuidEntry {
    ratingKey: string;
    serverName: string;
    sectionKey: string;
    sectionTitle: string;
    isKidsSection: boolean;
    quality?: string;
    is4k?: boolean;
    type: string;
    title: string;
    year?: number;
}

// In-memory cache for fast availability checking (TTL: 2 minutes)
let plexLibraryGuidCache: {
    timestamp: number;
    guids: Map<string, PlexGuidEntry[]>;
} | null = null;

const CACHE_TTL_MS = 2 * 60 * 1000;

function addGuidEntry(map: Map<string, PlexGuidEntry[]>, key: string, entry: PlexGuidEntry) {
    const existing = map.get(key) || [];
    if (!existing.some(e => e.ratingKey === entry.ratingKey && e.serverName === entry.serverName && e.sectionKey === entry.sectionKey)) {
        existing.push(entry);
    }
    map.set(key, existing);
}

/**
 * Builds or retrieves the Plex GUID lookup cache across all configured servers
 */
export async function getPlexLibraryGuidIndex(forceRefresh = false): Promise<Map<string, PlexGuidEntry[]>> {
    const now = Date.now();
    if (!forceRefresh && plexLibraryGuidCache && (now - plexLibraryGuidCache.timestamp < CACHE_TTL_MS)) {
        return plexLibraryGuidCache.guids;
    }

    const index = new Map<string, PlexGuidEntry[]>();

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

                    const secTitle = String(sec.title || "");
                    const isKidsSection = /kids|children|family|cartoon|disney|junior|youth/i.test(secTitle);

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
                            const record: PlexGuidEntry = {
                                ratingKey,
                                serverName: srv.name,
                                sectionKey: String(sec.key),
                                sectionTitle: secTitle || (secType === "show" ? "TV Shows" : "Movies"),
                                isKidsSection,
                                quality,
                                is4k,
                                type: secType === "show" ? "tv" : "movie",
                                title: item.title,
                                year: item.year ? parseInt(item.year, 10) : undefined
                            };

                            // Index by TMDb GUID
                            if (streamInfo.guids.tmdb) {
                                addGuidEntry(index, `tmdb:${secType === "show" ? "tv" : "movie"}:${streamInfo.guids.tmdb}`, record);
                            }
                            // Index by IMDb GUID
                            if (streamInfo.guids.imdb) {
                                addGuidEntry(index, `imdb:${streamInfo.guids.imdb}`, record);
                            }
                            // Index by TVDb GUID
                            if (streamInfo.guids.tvdb) {
                                addGuidEntry(index, `tvdb:${streamInfo.guids.tvdb}`, record);
                            }
                            // Index by normalized title + year
                            if (item.title) {
                                const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                                addGuidEntry(index, `title:${secType === "show" ? "tv" : "movie"}:${normTitle}:${item.year || ""}`, record);
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
    year?: number | string,
    isKids = false
): Promise<MediaAvailabilityStatus> {
    const result: MediaAvailabilityStatus = {
        inLibrary: false,
        isRequested: false
    };

    try {
        // 1. Check existing requests in SQLite
        const existingRequest = await prisma.mediaRequest.findFirst({
            where: isKids
                ? { tmdbId, mediaType, isKids: true }
                : { tmdbId, mediaType },
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
        
        let matches = guidIndex.get(`tmdb:${mediaType}:${tmdbId}`) || [];
        if (matches.length === 0 && imdbId) matches = guidIndex.get(`imdb:${imdbId}`) || [];
        if (matches.length === 0 && tvdbId) matches = guidIndex.get(`tvdb:${tvdbId}`) || [];
        if (matches.length === 0 && title) {
            const normTitle = title.toLowerCase().replace(/[^a-z0-9]/g, "");
            matches = guidIndex.get(`title:${mediaType}:${normTitle}:${year || ""}`) || [];
        }

        if (matches.length > 0) {
            if (isKids) {
                // In Kids mode: only mark as inLibrary if present in a Kids-specific section
                const kidsMatch = matches.find(m => m.isKidsSection);
                if (kidsMatch) {
                    result.inLibrary = true;
                    result.plexRatingKey = kidsMatch.ratingKey;
                    result.plexServerName = kidsMatch.serverName;
                    result.plexSectionName = kidsMatch.sectionTitle;
                    result.quality = kidsMatch.quality;
                    result.has4k = kidsMatch.is4k;
                } else {
                    // Exists in main / non-kids library only
                    const mainMatch = matches.find(m => !m.isKidsSection) || matches[0];
                    result.inLibrary = false;
                    result.inMainLibraryOnly = true;
                    result.mainLibrarySection = mainMatch.sectionTitle;
                    result.plexRatingKey = mainMatch.ratingKey;
                    result.plexServerName = mainMatch.serverName;
                    result.quality = mainMatch.quality;
                    result.has4k = mainMatch.is4k;
                }
            } else {
                // In Main mode: any match counts as in library
                const primaryMatch = matches.find(m => !m.isKidsSection) || matches[0];
                result.inLibrary = true;
                result.plexRatingKey = primaryMatch.ratingKey;
                result.plexServerName = primaryMatch.serverName;
                result.plexSectionName = primaryMatch.sectionTitle;
                result.quality = primaryMatch.quality;
                result.has4k = primaryMatch.is4k;
            }

            // If request exists and was pending/processing, auto-upgrade request to AVAILABLE if in library
            if (result.inLibrary && existingRequest && existingRequest.status !== "AVAILABLE" && existingRequest.status !== "DECLINED") {
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
    items: { id: number; mediaType: "movie" | "tv"; imdbId?: string; tvdbId?: number; title?: string; releaseDate?: string }[],
    isKids = false
): Promise<Record<number, MediaAvailabilityStatus>> {
    const results: Record<number, MediaAvailabilityStatus> = {};
    if (!items || items.length === 0) return results;

    try {
        const tmdbIds = items.map(i => i.id);
        const existingRequests = await prisma.mediaRequest.findMany({
            where: isKids
                ? { tmdbId: { in: tmdbIds }, isKids: true }
                : { tmdbId: { in: tmdbIds } }
        });

        const requestMap = new Map<string, any>();
        for (const req of existingRequests) {
            requestMap.set(`${req.mediaType}:${req.tmdbId}`, req);
        }

        const guidIndex: Map<string, PlexGuidEntry[]> = await getPlexLibraryGuidIndex().catch(() => new Map<string, PlexGuidEntry[]>());

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
            let matches = guidIndex.get(`tmdb:${item.mediaType}:${item.id}`) || [];
            if (matches.length === 0 && item.imdbId) matches = guidIndex.get(`imdb:${item.imdbId}`) || [];
            if (matches.length === 0 && item.tvdbId) matches = guidIndex.get(`tvdb:${item.tvdbId}`) || [];
            if (matches.length === 0 && item.title) {
                const normTitle = item.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                const year = item.releaseDate ? item.releaseDate.split("-")[0] : "";
                matches = guidIndex.get(`title:${item.mediaType}:${normTitle}:${year}`) || [];
            }

            if (matches.length > 0) {
                if (isKids) {
                    const kidsMatch = matches.find(m => m.isKidsSection);
                    if (kidsMatch) {
                        status.inLibrary = true;
                        status.plexRatingKey = kidsMatch.ratingKey;
                        status.plexServerName = kidsMatch.serverName;
                        status.plexSectionName = kidsMatch.sectionTitle;
                        status.quality = kidsMatch.quality;
                        status.has4k = kidsMatch.is4k;
                    } else {
                        const mainMatch = matches.find(m => !m.isKidsSection) || matches[0];
                        status.inLibrary = false;
                        status.inMainLibraryOnly = true;
                        status.mainLibrarySection = mainMatch.sectionTitle;
                        status.plexRatingKey = mainMatch.ratingKey;
                        status.plexServerName = mainMatch.serverName;
                        status.quality = mainMatch.quality;
                        status.has4k = mainMatch.is4k;
                    }
                } else {
                    const primaryMatch = matches.find(m => !m.isKidsSection) || matches[0];
                    status.inLibrary = true;
                    status.plexRatingKey = primaryMatch.ratingKey;
                    status.plexServerName = primaryMatch.serverName;
                    status.plexSectionName = primaryMatch.sectionTitle;
                    status.quality = primaryMatch.quality;
                    status.has4k = primaryMatch.is4k;
                }

                if (status.inLibrary && req && req.status !== "AVAILABLE" && req.status !== "DECLINED") {
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
