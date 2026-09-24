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
const ARR_CACHE_TTL_MS = 60 * 1000; // 1 minute

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

    const newIndex: ArrIndexCache = {
        timestamp: now,
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
        const defaultRadarr4k = radarrApps.find(a => a.id === settings?.seerrDefaultMovie4kAppId) || radarrApps.find(a => a.id !== defaultRadarr1080p?.id && a.name.toLowerCase().includes("4k"));

        const defaultSonarr1080p = sonarrApps.find(a => a.id === settings?.seerrDefaultTvAppId) || sonarrApps.find(a => !a.name.toLowerCase().includes("4k")) || sonarrApps[0];
        const defaultSonarr4k = sonarrApps.find(a => a.id === settings?.seerrDefaultTv4kAppId) || sonarrApps.find(a => a.id !== defaultSonarr1080p?.id && a.name.toLowerCase().includes("4k"));

        // Fetch Radarr 1080p
        if (defaultRadarr1080p) {
            try {
                const res = await arrApiGet(defaultRadarr1080p, "/api/v3/movie");
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
            } catch {}
        }

        // Fetch Radarr 4K
        if (defaultRadarr4k) {
            try {
                const res = await arrApiGet(defaultRadarr4k, "/api/v3/movie");
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
            } catch {}
        }

        // Fetch Sonarr 1080p
        if (defaultSonarr1080p) {
            try {
                const res = await arrApiGet(defaultSonarr1080p, "/api/v3/series");
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
            } catch {}
        }

        // Fetch Sonarr 4K
        if (defaultSonarr4k) {
            try {
                const res = await arrApiGet(defaultSonarr4k, "/api/v3/series");
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
            } catch {}
        }

        arrCache = newIndex;
    } catch (e: any) {
        logger.addLog("WARN", "SEERR", `Failed refreshing Arr index: ${e.message}`);
    }

    return newIndex;
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

        if (mediaType === "movie") {
            // Resolve Radarr 1080p App
            let app1080p = null;
            if (isKids) {
                app1080p = radarrApps.find(a => a.id === settings?.seerrKidsMovieAppId);
            }
            if (!app1080p) {
                app1080p = radarrApps.find(a => a.id === settings?.seerrDefaultMovieAppId) || radarrApps.find(a => !a.name.toLowerCase().includes("4k")) || radarrApps[0];
            }

            // Resolve Radarr 4K App
            let app4k = null;
            if (isKids) {
                app4k = radarrApps.find(a => a.id === settings?.seerrKidsMovie4kAppId);
            }
            if (!app4k) {
                app4k = radarrApps.find(a => a.id === settings?.seerrDefaultMovie4kAppId) || radarrApps.find(a => a.id !== app1080p?.id && a.name.toLowerCase().includes("4k"));
            }

            if (app1080p) {
                details.isConfigured1080p = true;
                details.app1080pId = app1080p.id;
                details.app1080pName = app1080p.name;

                try {
                    const res = await arrApiGet(app1080p, "/api/v3/movie");
                    if (res.success && Array.isArray(res.data)) {
                        const movie = res.data.find((m: any) => m.tmdbId === tmdbId || (imdbId && m.imdbId === imdbId));
                        if (movie) {
                            details.existsIn1080p = true;
                            details.servarr1080pId = movie.id;
                            details.isMonitored1080p = Boolean(movie.monitored);
                            details.hasFile1080p = Boolean(movie.hasFile);
                        }
                    }
                } catch (err: any) {
                    logger.addLog("WARN", "SEERR", `Error checking Radarr 1080p for movie ${tmdbId}: ${err.message}`);
                }
            }

            if (app4k) {
                details.isConfigured4k = true;
                details.app4kId = app4k.id;
                details.app4kName = app4k.name;

                try {
                    const res = await arrApiGet(app4k, "/api/v3/movie");
                    if (res.success && Array.isArray(res.data)) {
                        const movie = res.data.find((m: any) => m.tmdbId === tmdbId || (imdbId && m.imdbId === imdbId));
                        if (movie) {
                            details.existsIn4k = true;
                            details.servarr4kId = movie.id;
                            details.isMonitored4k = Boolean(movie.monitored);
                            details.hasFile4k = Boolean(movie.hasFile);
                        }
                    }
                } catch (err: any) {
                    logger.addLog("WARN", "SEERR", `Error checking Radarr 4K for movie ${tmdbId}: ${err.message}`);
                }
            }
        } else {
            // TV SHOWS (Sonarr)
            let app1080p = null;
            if (isKids) {
                app1080p = sonarrApps.find(a => a.id === settings?.seerrKidsTvAppId);
            }
            if (!app1080p) {
                app1080p = sonarrApps.find(a => a.id === settings?.seerrDefaultTvAppId) || sonarrApps.find(a => !a.name.toLowerCase().includes("4k")) || sonarrApps[0];
            }

            let app4k = null;
            if (isKids) {
                app4k = sonarrApps.find(a => a.id === settings?.seerrKidsTv4kAppId);
            }
            if (!app4k) {
                app4k = sonarrApps.find(a => a.id === settings?.seerrDefaultTv4kAppId) || sonarrApps.find(a => a.id !== app1080p?.id && a.name.toLowerCase().includes("4k"));
            }

            // Check Sonarr 1080p
            if (app1080p) {
                details.isConfigured1080p = true;
                details.app1080pId = app1080p.id;
                details.app1080pName = app1080p.name;
                details.seasons1080p = {};
                details.episodes1080p = {};

                try {
                    const seriesRes = await arrApiGet(app1080p, "/api/v3/series");
                    if (seriesRes.success && Array.isArray(seriesRes.data)) {
                        const series = seriesRes.data.find((s: any) => (tvdbId && s.tvdbId === tvdbId) || (imdbId && s.imdbId === imdbId) || normalizeTitle(s.title) === normalizeTitle(title));
                        if (series) {
                            details.existsIn1080p = true;
                            details.servarr1080pId = series.id;
                            details.isMonitored1080p = Boolean(series.monitored);

                            // Fetch all episodes for this series
                            const epRes = await arrApiGet(app1080p, `/api/v3/episode?seriesId=${series.id}`);
                            const episodesList: any[] = epRes.success && Array.isArray(epRes.data) ? epRes.data : [];

                            const seasonMap: Record<number, ArrSeasonMonitoring> = {};
                            const episodeMap: Record<string, ArrEpisodeMonitoring> = {};

                            for (const ep of episodesList) {
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

                                if (!seasonMap[sNum]) {
                                    seasonMap[sNum] = {
                                        seasonNumber: sNum,
                                        monitored: false,
                                        episodeCount: 0,
                                        monitoredEpisodeCount: 0,
                                        hasFileCount: 0,
                                        isFullyMonitored: false,
                                        isPartiallyMonitored: false
                                    };
                                }

                                seasonMap[sNum].episodeCount++;
                                if (ep.monitored) seasonMap[sNum].monitoredEpisodeCount++;
                                if (ep.hasFile) seasonMap[sNum].hasFileCount++;
                            }

                            // Reconcile with series.seasons metadata
                            for (const s of (series.seasons || [])) {
                                const sNum = s.seasonNumber;
                                if (!seasonMap[sNum]) {
                                    seasonMap[sNum] = {
                                        seasonNumber: sNum,
                                        monitored: Boolean(s.monitored),
                                        episodeCount: s.statistics?.totalEpisodeCount || 0,
                                        monitoredEpisodeCount: s.monitored ? (s.statistics?.totalEpisodeCount || 0) : 0,
                                        hasFileCount: s.statistics?.episodeFileCount || 0,
                                        isFullyMonitored: Boolean(s.monitored),
                                        isPartiallyMonitored: false
                                    };
                                } else {
                                    const sm = seasonMap[sNum];
                                    sm.monitored = Boolean(s.monitored) || sm.monitoredEpisodeCount > 0;
                                    sm.isFullyMonitored = sm.monitoredEpisodeCount > 0 && sm.monitoredEpisodeCount === sm.episodeCount;
                                    sm.isPartiallyMonitored = sm.monitoredEpisodeCount > 0 && !sm.isFullyMonitored;
                                }
                            }

                            details.seasons1080p = seasonMap;
                            details.episodes1080p = episodeMap;
                            details.hasFile1080p = episodesList.some(e => e.hasFile);
                            // Overall series is considered monitored if series flag is true or any non-specials season is monitored
                            details.isMonitored1080p = Boolean(series.monitored) || Object.values(seasonMap).some(s => s.seasonNumber > 0 && s.monitoredEpisodeCount > 0);
                        }
                    }
                } catch (err: any) {
                    logger.addLog("WARN", "SEERR", `Error checking Sonarr 1080p for series ${title}: ${err.message}`);
                }
            }

            // Check Sonarr 4K
            if (app4k) {
                details.isConfigured4k = true;
                details.app4kId = app4k.id;
                details.app4kName = app4k.name;
                details.seasons4k = {};
                details.episodes4k = {};

                try {
                    const seriesRes = await arrApiGet(app4k, "/api/v3/series");
                    if (seriesRes.success && Array.isArray(seriesRes.data)) {
                        const series = seriesRes.data.find((s: any) => (tvdbId && s.tvdbId === tvdbId) || (imdbId && s.imdbId === imdbId) || normalizeTitle(s.title) === normalizeTitle(title));
                        if (series) {
                            details.existsIn4k = true;
                            details.servarr4kId = series.id;
                            details.isMonitored4k = Boolean(series.monitored);

                            const epRes = await arrApiGet(app4k, `/api/v3/episode?seriesId=${series.id}`);
                            const episodesList: any[] = epRes.success && Array.isArray(epRes.data) ? epRes.data : [];

                            const seasonMap: Record<number, ArrSeasonMonitoring> = {};
                            const episodeMap: Record<string, ArrEpisodeMonitoring> = {};

                            for (const ep of episodesList) {
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

                                if (!seasonMap[sNum]) {
                                    seasonMap[sNum] = {
                                        seasonNumber: sNum,
                                        monitored: false,
                                        episodeCount: 0,
                                        monitoredEpisodeCount: 0,
                                        hasFileCount: 0,
                                        isFullyMonitored: false,
                                        isPartiallyMonitored: false
                                    };
                                }

                                seasonMap[sNum].episodeCount++;
                                if (ep.monitored) seasonMap[sNum].monitoredEpisodeCount++;
                                if (ep.hasFile) seasonMap[sNum].hasFileCount++;
                            }

                            for (const s of (series.seasons || [])) {
                                const sNum = s.seasonNumber;
                                if (!seasonMap[sNum]) {
                                    seasonMap[sNum] = {
                                        seasonNumber: sNum,
                                        monitored: Boolean(s.monitored),
                                        episodeCount: s.statistics?.totalEpisodeCount || 0,
                                        monitoredEpisodeCount: s.monitored ? (s.statistics?.totalEpisodeCount || 0) : 0,
                                        hasFileCount: s.statistics?.episodeFileCount || 0,
                                        isFullyMonitored: Boolean(s.monitored),
                                        isPartiallyMonitored: false
                                    };
                                } else {
                                    const sm = seasonMap[sNum];
                                    sm.monitored = Boolean(s.monitored) || sm.monitoredEpisodeCount > 0;
                                    sm.isFullyMonitored = sm.monitoredEpisodeCount > 0 && sm.monitoredEpisodeCount === sm.episodeCount;
                                    sm.isPartiallyMonitored = sm.monitoredEpisodeCount > 0 && !sm.isFullyMonitored;
                                }
                            }

                            details.seasons4k = seasonMap;
                            details.episodes4k = episodeMap;
                            details.hasFile4k = episodesList.some(e => e.hasFile);
                            details.isMonitored4k = Boolean(series.monitored) || Object.values(seasonMap).some(s => s.seasonNumber > 0 && s.monitoredEpisodeCount > 0);
                        }
                    }
                } catch (err: any) {
                    logger.addLog("WARN", "SEERR", `Error checking Sonarr 4K for series ${title}: ${err.message}`);
                }
            }
        }
    } catch (e: any) {
        logger.addLog("WARN", "SEERR", `getArrMediaMonitoringDetails error: ${e.message}`);
    }

    return details;
}
