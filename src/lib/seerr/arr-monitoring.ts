import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { arrApiGet, getEnabledArrInstancesInternal } from "@/app/arr-actions";
import { logger } from "@/lib/logger";

export interface ArrEpisodeMonitoring {
    id: number;
    seriesId: number;
    seasonNumber: number;
    episodeNumber: number;
    title: string;
    airDate?: string;
    monitored: boolean;
    hasFile: boolean;
}

export interface ArrSeasonMonitoring {
    seasonNumber: number;
    monitored: boolean;
    episodeCount: number;
    monitoredEpisodeCount: number;
    hasFileCount: number;
    isFullyMonitored: boolean;
    isPartiallyMonitored: boolean;
}

export interface ArrMediaMonitoringDetails {
    // 1080p instance
    isConfigured1080p: boolean;
    existsIn1080p: boolean;
    isMonitored1080p: boolean;
    hasFile1080p: boolean;
    app1080pId?: string;
    app1080pName?: string;
    servarr1080pId?: number;
    seasons1080p?: Record<number, ArrSeasonMonitoring>;
    episodes1080p?: Record<string, ArrEpisodeMonitoring>; // Key: "s{season}e{episode}"

    // 4K instance
    isConfigured4k: boolean;
    existsIn4k: boolean;
    isMonitored4k: boolean;
    hasFile4k: boolean;
    app4kId?: string;
    app4kName?: string;
    servarr4kId?: number;
    seasons4k?: Record<number, ArrSeasonMonitoring>;
    episodes4k?: Record<string, ArrEpisodeMonitoring>; // Key: "s{season}e{episode}"
}

export interface ArrQuickMonitoringStatus {
    isMonitored: boolean;
    isMonitored1080p: boolean;
    isMonitored4k: boolean;
    hasFile1080p: boolean;
    hasFile4k: boolean;
    hasFile: boolean;
}

// In-memory cache for fast index lookups (TTL: 60 seconds)
interface ArrIndexCache {
    timestamp: number;
    radarr1080p: Map<number, { id: number; monitored: boolean; hasFile: boolean }>;
    radarr4k: Map<number, { id: number; monitored: boolean; hasFile: boolean }>;
    sonarr1080p: Map<number, { id: number; monitored: boolean; seasons: any[] }>;
    sonarr4k: Map<number, { id: number; monitored: boolean; seasons: any[] }>;
    sonarrTitles1080p: Map<string, { id: number; monitored: boolean; seasons: any[] }>;
    sonarrTitles4k: Map<string, { id: number; monitored: boolean; seasons: any[] }>;
}

let arrCache: ArrIndexCache | null = null;
let inFlightArrPromise: Promise<ArrIndexCache> | null = null;
const ARR_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function normalizeTitle(t?: string): string {
    return (t || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * Builds or retrieves the quick lookup index of movies/series across configured 1080p and 4K instances
 */
export async function getArrIndex(forceRefresh = false): Promise<ArrIndexCache> {
    const now = Date.now();
    if (!forceRefresh && arrCache && (now - arrCache.timestamp < ARR_CACHE_TTL_MS)) {
        return arrCache;
    }

    if (inFlightArrPromise) {
        return inFlightArrPromise;
    }

    inFlightArrPromise = (async () => {
        const newIndex: ArrIndexCache = {
            timestamp: Date.now(),
            radarr1080p: new Map(),
            radarr4k: new Map(),
            sonarr1080p: new Map(),
            sonarr4k: new Map(),
            sonarrTitles1080p: new Map(),
            sonarrTitles4k: new Map()
        };

        try {
            const settings = await prisma.settings.findFirst({ where: { id: "global" } });
            const radarrAppsRes = await getEnabledArrInstancesInternal("radarr");
            const sonarrAppsRes = await getEnabledArrInstancesInternal("sonarr");

            const radarrApps = (radarrAppsRes.success && radarrAppsRes.data) ? radarrAppsRes.data : [];
            const sonarrApps = (sonarrAppsRes.success && sonarrAppsRes.data) ? sonarrAppsRes.data : [];

            // Identify target instances for 1080p and 4K
            const defaultRadarr1080p = radarrApps.find(a => a.id === settings?.seerrDefaultMovieAppId) || radarrApps.find(a => !a.name.toLowerCase().includes("4k")) || radarrApps[0];
            const defaultRadarr4k = (settings?.seerrDefaultMovie4kAppId && settings.seerrDefaultMovie4kAppId !== "none")
                ? radarrApps.find(a => a.id === settings.seerrDefaultMovie4kAppId)
                : null;

            const defaultSonarr1080p = sonarrApps.find(a => a.id === settings?.seerrDefaultTvAppId) || sonarrApps.find(a => !a.name.toLowerCase().includes("4k")) || sonarrApps[0];
            const defaultSonarr4k = (settings?.seerrDefaultTv4kAppId && settings.seerrDefaultTv4kAppId !== "none")
                ? sonarrApps.find(a => a.id === settings.seerrDefaultTv4kAppId)
                : null;

            // Fetch Radarr 1080p, Radarr 4k, Sonarr 1080p, Sonarr 4k in parallel with timeouts
            await Promise.allSettled([
                defaultRadarr1080p ? arrApiGet(defaultRadarr1080p, "/api/v3/movie").then(res => {
                    if (res.success && Array.isArray(res.data)) {
                        for (const m of res.data) {
                            if (m.tmdbId) {
                                newIndex.radarr1080p.set(m.tmdbId, {
                                    id: m.id,
                                    monitored: Boolean(m.monitored),
                                    hasFile: Boolean(m.hasFile)
                                });
                            }
                        }
                    }
                }).catch(() => {}) : Promise.resolve(),

                defaultRadarr4k ? arrApiGet(defaultRadarr4k, "/api/v3/movie").then(res => {
                    if (res.success && Array.isArray(res.data)) {
                        for (const m of res.data) {
                            if (m.tmdbId) {
                                newIndex.radarr4k.set(m.tmdbId, {
                                    id: m.id,
                                    monitored: Boolean(m.monitored),
                                    hasFile: Boolean(m.hasFile)
                                });
                            }
                        }
                    }
                }).catch(() => {}) : Promise.resolve(),

                defaultSonarr1080p ? arrApiGet(defaultSonarr1080p, "/api/v3/series").then(res => {
                    if (res.success && Array.isArray(res.data)) {
                        for (const s of res.data) {
                            if (s.tvdbId) {
                                newIndex.sonarr1080p.set(s.tvdbId, {
                                    id: s.id,
                                    monitored: Boolean(s.monitored),
                                    seasons: s.seasons || []
                                });
                            }
                            if (s.title) {
                                newIndex.sonarrTitles1080p.set(normalizeTitle(s.title), {
                                    id: s.id,
                                    monitored: Boolean(s.monitored),
                                    seasons: s.seasons || []
                                });
                            }
                        }
                    }
                }).catch(() => {}) : Promise.resolve(),

                defaultSonarr4k ? arrApiGet(defaultSonarr4k, "/api/v3/series").then(res => {
                    if (res.success && Array.isArray(res.data)) {
                        for (const s of res.data) {
                            if (s.tvdbId) {
                                newIndex.sonarr4k.set(s.tvdbId, {
                                    id: s.id,
                                    monitored: Boolean(s.monitored),
                                    seasons: s.seasons || []
                                });
                            }
                            if (s.title) {
                                newIndex.sonarrTitles4k.set(normalizeTitle(s.title), {
                                    id: s.id,
                                    monitored: Boolean(s.monitored),
                                    seasons: s.seasons || []
                                });
                            }
                        }
                    }
                }).catch(() => {}) : Promise.resolve()
            ]);

            arrCache = newIndex;
        } catch (e: any) {
            logger.addLog("WARN", "SEERR", `Failed refreshing Arr index: ${e.message}`);
        } finally {
            inFlightArrPromise = null;
        }

        return newIndex;
    })();

    return inFlightArrPromise;
}

/**
 * Fast lookup to check if an item is monitored in 1080p or 4K Arrs (for carousels and lists)
 */
export async function getQuickArrMonitoringStatus(
    tmdbId: number,
    mediaType: "movie" | "tv",
    tvdbId?: number,
    title?: string
): Promise<ArrQuickMonitoringStatus> {
    const index = await getArrIndex();

    if (mediaType === "movie") {
        const rad1080 = index.radarr1080p.get(tmdbId);
        const rad4k = index.radarr4k.get(tmdbId);

        const isMonitored1080p = Boolean(rad1080?.monitored);
        const isMonitored4k = Boolean(rad4k?.monitored);
        const hasFile1080p = Boolean(rad1080?.hasFile);
        const hasFile4k = Boolean(rad4k?.hasFile);

        return {
            isMonitored: isMonitored1080p || isMonitored4k,
            isMonitored1080p,
            isMonitored4k,
            hasFile1080p,
            hasFile4k,
            hasFile: hasFile1080p || hasFile4k
        };
    } else {
        const normTitle = normalizeTitle(title);
        const son1080 = (tvdbId ? index.sonarr1080p.get(tvdbId) : null) || (normTitle ? index.sonarrTitles1080p.get(normTitle) : null);
        const son4k = (tvdbId ? index.sonarr4k.get(tvdbId) : null) || (normTitle ? index.sonarrTitles4k.get(normTitle) : null);

        const isMonitored1080p = Boolean(son1080?.monitored || (son1080?.seasons && son1080.seasons.some((s: any) => s.monitored)));
        const isMonitored4k = Boolean(son4k?.monitored || (son4k?.seasons && son4k.seasons.some((s: any) => s.monitored)));
        const hasFile1080p = Boolean(son1080?.seasons && son1080.seasons.some((s: any) => s.statistics?.episodeFileCount > 0));
        const hasFile4k = Boolean(son4k?.seasons && son4k.seasons.some((s: any) => s.statistics?.episodeFileCount > 0));

        return {
            isMonitored: isMonitored1080p || isMonitored4k,
            isMonitored1080p,
            isMonitored4k,
            hasFile1080p,
            hasFile4k,
            hasFile: hasFile1080p || hasFile4k
        };
    }
}

/**
 * Queries target Radarr / Sonarr instances deeply for full media, season, and episode monitoring breakdown
 */
export async function getArrMediaMonitoringDetails(
    tmdbId: number,
    mediaType: "movie" | "tv",
    tvdbId?: number,
    imdbId?: string,
    title?: string,
    isKids = false
): Promise<ArrMediaMonitoringDetails> {
    const details: ArrMediaMonitoringDetails = {
        isConfigured1080p: false,
        existsIn1080p: false,
        isMonitored1080p: false,
        hasFile1080p: false,
        isConfigured4k: false,
        existsIn4k: false,
        isMonitored4k: false,
        hasFile4k: false
    };

    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const radarrAppsRes = await getEnabledArrInstancesInternal("radarr");
        const sonarrAppsRes = await getEnabledArrInstancesInternal("sonarr");

        const radarrApps = (radarrAppsRes.success && radarrAppsRes.data) ? radarrAppsRes.data : [];
        const sonarrApps = (sonarrAppsRes.success && sonarrAppsRes.data) ? sonarrAppsRes.data : [];

        // Pre-warm / retrieve in-memory Arr index (<1ms when cached)
        const index = await getArrIndex();

        if (mediaType === "movie") {
            let app1080p = isKids ? radarrApps.find(a => a.id === settings?.seerrKidsMovieAppId) : null;
            if (!app1080p) {
                app1080p = radarrApps.find(a => a.id === settings?.seerrDefaultMovieAppId) || radarrApps.find(a => !a.name.toLowerCase().includes("4k")) || radarrApps[0];
            }

            let app4k = null;
            if (isKids) {
                if (settings?.seerrKidsMovie4kAppId && settings.seerrKidsMovie4kAppId !== "none") {
                    app4k = radarrApps.find(a => a.id === settings.seerrKidsMovie4kAppId) || null;
                }
            } else {
                if (settings?.seerrDefaultMovie4kAppId && settings.seerrDefaultMovie4kAppId !== "none") {
                    app4k = radarrApps.find(a => a.id === settings.seerrDefaultMovie4kAppId) || null;
                }
            }

            if (app1080p) {
                details.isConfigured1080p = true;
                details.app1080pId = app1080p.id;
                details.app1080pName = app1080p.name;

                const movie1080 = index.radarr1080p.get(tmdbId);
                if (movie1080) {
                    details.existsIn1080p = true;
                    details.servarr1080pId = movie1080.id;
                    details.isMonitored1080p = Boolean(movie1080.monitored);
                    details.hasFile1080p = Boolean(movie1080.hasFile);
                }
            }

            if (app4k) {
                details.isConfigured4k = true;
                details.app4kId = app4k.id;
                details.app4kName = app4k.name;

                const movie4k = index.radarr4k.get(tmdbId);
                if (movie4k) {
                    details.existsIn4k = true;
                    details.servarr4kId = movie4k.id;
                    details.isMonitored4k = Boolean(movie4k.monitored);
                    details.hasFile4k = Boolean(movie4k.hasFile);
                }
            }
        } else {
            // TV SHOWS (Sonarr)
            let app1080p = isKids ? sonarrApps.find(a => a.id === settings?.seerrKidsTvAppId) : null;
            if (!app1080p) {
                app1080p = sonarrApps.find(a => a.id === settings?.seerrDefaultTvAppId) || sonarrApps.find(a => !a.name.toLowerCase().includes("4k")) || sonarrApps[0];
            }

            let app4k = null;
            if (isKids) {
                if (settings?.seerrKidsTv4kAppId && settings.seerrKidsTv4kAppId !== "none") {
                    app4k = sonarrApps.find(a => a.id === settings.seerrKidsTv4kAppId) || null;
                }
            } else {
                if (settings?.seerrDefaultTv4kAppId && settings.seerrDefaultTv4kAppId !== "none") {
                    app4k = sonarrApps.find(a => a.id === settings.seerrDefaultTv4kAppId) || null;
                }
            }

            const normTitle = normalizeTitle(title);
            const series1080 = (tvdbId ? index.sonarr1080p.get(tvdbId) : null) || (normTitle ? index.sonarrTitles1080p.get(normTitle) : null);
            const series4k = (tvdbId ? index.sonarr4k.get(tvdbId) : null) || (normTitle ? index.sonarrTitles4k.get(normTitle) : null);

            if (app1080p) {
                details.isConfigured1080p = true;
                details.app1080pId = app1080p.id;
                details.app1080pName = app1080p.name;
                details.seasons1080p = {};
                details.episodes1080p = {};

                if (series1080) {
                    details.existsIn1080p = true;
                    details.servarr1080pId = series1080.id;
                    details.isMonitored1080p = Boolean(series1080.monitored);

                    const seasonMap: Record<number, ArrSeasonMonitoring> = {};
                    for (const s of (series1080.seasons || [])) {
                        const sNum = s.seasonNumber;
                        seasonMap[sNum] = {
                            seasonNumber: sNum,
                            monitored: Boolean(s.monitored),
                            episodeCount: s.statistics?.totalEpisodeCount || 0,
                            monitoredEpisodeCount: s.monitored ? (s.statistics?.totalEpisodeCount || 0) : 0,
                            hasFileCount: s.statistics?.episodeFileCount || 0,
                            isFullyMonitored: Boolean(s.monitored),
                            isPartiallyMonitored: false
                        };
                    }
                    details.seasons1080p = seasonMap;
                    details.hasFile1080p = (series1080.seasons || []).some((s: any) => s.statistics?.episodeFileCount > 0);
                    details.isMonitored1080p = Boolean(series1080.monitored) || Object.values(seasonMap).some(s => s.seasonNumber > 0 && s.monitored);

                }
            }

            if (app4k) {
                details.isConfigured4k = true;
                details.app4kId = app4k.id;
                details.app4kName = app4k.name;
                details.seasons4k = {};
                details.episodes4k = {};

                if (series4k) {
                    details.existsIn4k = true;
                    details.servarr4kId = series4k.id;
                    details.isMonitored4k = Boolean(series4k.monitored);

                    const seasonMap4k: Record<number, ArrSeasonMonitoring> = {};
                    for (const s of (series4k.seasons || [])) {
                        const sNum = s.seasonNumber;
                        seasonMap4k[sNum] = {
                            seasonNumber: sNum,
                            monitored: Boolean(s.monitored),
                            episodeCount: s.statistics?.totalEpisodeCount || 0,
                            monitoredEpisodeCount: s.monitored ? (s.statistics?.totalEpisodeCount || 0) : 0,
                            hasFileCount: s.statistics?.episodeFileCount || 0,
                            isFullyMonitored: Boolean(s.monitored),
                            isPartiallyMonitored: false
                        };
                    }
                    details.seasons4k = seasonMap4k;
                    details.hasFile4k = (series4k.seasons || []).some((s: any) => s.statistics?.episodeFileCount > 0);
                    details.isMonitored4k = Boolean(series4k.monitored) || Object.values(seasonMap4k).some(s => s.seasonNumber > 0 && s.monitored);
                }
            }

            // Fetch episodes concurrently for 1080p and 4K if series exists
            const fetch1080 = (series1080 && app1080p)
                ? arrApiGet(app1080p, `/api/v3/episode?seriesId=${series1080.id}`)
                : Promise.resolve(null);
            const fetch4k = (series4k && app4k)
                ? arrApiGet(app4k, `/api/v3/episode?seriesId=${series4k.id}`)
                : Promise.resolve(null);

            const [res1080, res4k] = await Promise.allSettled([fetch1080, fetch4k]);

            if (res1080.status === "fulfilled" && res1080.value?.success && Array.isArray(res1080.value.data)) {
                const episodeMap: Record<string, ArrEpisodeMonitoring> = {};
                for (const ep of res1080.value.data) {
                    const sNum = ep.seasonNumber;
                    const eNum = ep.episodeNumber;
                    const key = `s${sNum}e${eNum}`;
                    episodeMap[key] = {
                        id: ep.id,
                        seriesId: ep.seriesId,
                        seasonNumber: sNum,
                        episodeNumber: eNum,
                        title: ep.title,
                        airDate: ep.airDate,
                        monitored: Boolean(ep.monitored),
                        hasFile: Boolean(ep.hasFile)
                    };
                }
                details.episodes1080p = episodeMap;
            }

            if (res4k.status === "fulfilled" && res4k.value?.success && Array.isArray(res4k.value.data)) {
                const episodeMap4k: Record<string, ArrEpisodeMonitoring> = {};
                for (const ep of res4k.value.data) {
                    const sNum = ep.seasonNumber;
                    const eNum = ep.episodeNumber;
                    const key = `s${sNum}e${eNum}`;
                    episodeMap4k[key] = {
                        id: ep.id,
                        seriesId: ep.seriesId,
                        seasonNumber: sNum,
                        episodeNumber: eNum,
                        title: ep.title,
                        airDate: ep.airDate,
                        monitored: Boolean(ep.monitored),
                        hasFile: Boolean(ep.hasFile)
                    };
                }
                details.episodes4k = episodeMap4k;
            }
        }
    } catch (e: any) {
        logger.addLog("WARN", "SEERR", `getArrMediaMonitoringDetails error: ${e.message}`);
    }

    return details;
}
