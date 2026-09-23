import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { arrApiGet, arrApiPost, getEnabledArrInstancesInternal } from "@/app/arr-actions";
import { logger } from "@/lib/logger";

export interface DispatchResult {
    success: boolean;
    servarrId?: number;
    servarrAppId?: string;
    error?: string;
}

/**
 * Dispatches an approved MediaRequest to Radarr or Sonarr
 */
export async function dispatchMediaRequest(requestId: string): Promise<DispatchResult> {
    try {
        const req = await prisma.mediaRequest.findUnique({
            where: { id: requestId }
        });

        if (!req) {
            return { success: false, error: "Media request not found" };
        }

        const settings = await prisma.settings.findFirst({ where: { id: "global" } });

        let res: DispatchResult;
        if (req.mediaType === "movie") {
            res = await dispatchMovieRequest(req, settings);
        } else if (req.mediaType === "tv") {
            res = await dispatchTvRequest(req, settings);
        } else {
            return { success: false, error: `Unsupported media type: ${req.mediaType}` };
        }

        // Dual 4K + 1080p Ingestion Rule: When 4K is dispatched, auto-dispatch companion 1080p request
        if (res.success && req.is4k && !req.isDual1080pChild && (settings?.seerrAutoDual1080pFor4k ?? true)) {
            dispatchDual1080pCompanion(req, settings).catch(() => {});
        }

        return res;
    } catch (e: any) {
        logger.addLog("ERROR", "SEERR", `Dispatch failed for request ${requestId}: ${e.message}`);
        await prisma.mediaRequest.update({
            where: { id: requestId },
            data: {
                status: "FAILED",
                errorMessage: e.message
            }
        }).catch(() => {});
        return { success: false, error: e.message };
    }
}

/**
 * Dispatches a movie request to Radarr
 */
async function dispatchMovieRequest(req: any, settings: any): Promise<DispatchResult> {
    // 1. Determine target Radarr app
    const radarrAppsRes = await getEnabledArrInstancesInternal("radarr");
    if (!radarrAppsRes.success || !radarrAppsRes.data || radarrAppsRes.data.length === 0) {
        throw new Error("No Radarr instances configured or enabled. Please configure Radarr in Settings -> Apps.");
    }

    let targetApp = null;
    if (req.servarrAppId) {
        targetApp = radarrAppsRes.data.find(a => a.id === req.servarrAppId);
    }
    if (!targetApp) {
        if (req.isKids) {
            const preferredId = req.is4k ? settings?.seerrKidsMovie4kAppId : settings?.seerrKidsMovieAppId;
            if (preferredId) {
                targetApp = radarrAppsRes.data.find(a => a.id === preferredId);
            }
        }
    }
    if (!targetApp) {
        const preferredId = req.is4k ? settings?.seerrDefaultMovie4kAppId : settings?.seerrDefaultMovieAppId;
        if (preferredId) {
            targetApp = radarrAppsRes.data.find(a => a.id === preferredId);
        }
    }
    if (!targetApp) {
        targetApp = radarrAppsRes.data[0];
    }

    if (!targetApp) {
        throw new Error("Could not resolve a suitable Radarr instance for dispatch.");
    }

    // 2. Determine quality profile and root folder
    const profilesRes = await arrApiGet(targetApp, "/api/v3/qualityprofile");
    const foldersRes = await arrApiGet(targetApp, "/api/v3/rootfolder");

    if (!profilesRes.success || !profilesRes.data || profilesRes.data.length === 0) {
        throw new Error(`Failed to fetch quality profiles from Radarr (${targetApp.name}): ${profilesRes.error}`);
    }
    if (!foldersRes.success || !foldersRes.data || foldersRes.data.length === 0) {
        throw new Error(`Failed to fetch root folders from Radarr (${targetApp.name}): ${foldersRes.error}`);
    }

    const availableProfiles = profilesRes.data;
    const availableFolders = foldersRes.data;

    let qualityProfileId = req.qualityProfileId;
    if (!qualityProfileId || !availableProfiles.some((p: any) => p.id === qualityProfileId)) {
        let configuredProfileId: number | null | undefined = null;
        if (req.isKids) {
            configuredProfileId = req.is4k ? settings?.seerrKidsMovie4kProfileId : settings?.seerrKidsMovieProfileId;
        }
        if (!configuredProfileId) {
            configuredProfileId = req.is4k ? settings?.seerrDefaultMovie4kProfileId : settings?.seerrDefaultMovieProfileId;
        }
        if (configuredProfileId && availableProfiles.some((p: any) => p.id === configuredProfileId)) {
            qualityProfileId = configuredProfileId;
        } else {
            qualityProfileId = availableProfiles[0]?.id || 1;
        }
    }

    let rootFolderPath = req.rootFolderPath;
    if (!rootFolderPath || !availableFolders.some((f: any) => f.path === rootFolderPath)) {
        let configuredFolder: string | null | undefined = null;
        if (req.isKids) {
            configuredFolder = req.is4k ? settings?.seerrKidsMovie4kRootFolder : settings?.seerrKidsMovieRootFolder;
        }
        if (!configuredFolder) {
            configuredFolder = req.is4k ? settings?.seerrDefaultMovie4kRootFolder : settings?.seerrDefaultMovieRootFolder;
        }
        if (configuredFolder && availableFolders.some((f: any) => f.path === configuredFolder)) {
            rootFolderPath = configuredFolder;
        } else {
            rootFolderPath = availableFolders[0]?.path || "/movies";
        }
    }

    // 3. Lookup movie in Radarr by TMDb ID or title
    let lookupRes = await arrApiGet(targetApp, `/api/v3/movie/lookup/tmdb?tmdbId=${req.tmdbId}`);
    let movieData = lookupRes.success && lookupRes.data ? lookupRes.data : null;

    if (!movieData) {
        const titleLookup = await arrApiGet(targetApp, `/api/v3/movie/lookup?term=${encodeURIComponent(req.title)}`);
        if (titleLookup.success && Array.isArray(titleLookup.data) && titleLookup.data.length > 0) {
            movieData = titleLookup.data.find((m: any) => m.tmdbId === req.tmdbId) || titleLookup.data[0];
        }
    }

    if (!movieData) {
        throw new Error(`Radarr could not find metadata for TMDb ID ${req.tmdbId} ("${req.title}")`);
    }

    // 4. Construct payload and add movie to Radarr
    const { id, ...cleanedMovieData } = movieData;
    const addBody = {
        ...cleanedMovieData,
        qualityProfileId,
        rootFolderPath,
        monitored: true,
        addOptions: {
            searchForMovie: true
        }
    };

    const addRes = await arrApiPost(targetApp, "/api/v3/movie", addBody);

    let servarrId: number | undefined;

    if (addRes.success && addRes.data) {
        servarrId = addRes.data.id;
    } else {
        // If movie already exists in Radarr, fetch existing record and trigger search
        const existingMoviesRes = await arrApiGet(targetApp, `/api/v3/movie`);
        if (existingMoviesRes.success && Array.isArray(existingMoviesRes.data)) {
            const existing = existingMoviesRes.data.find((m: any) => m.tmdbId === req.tmdbId);
            if (existing) {
                servarrId = existing.id;
                // Trigger movie search
                await arrApiPost(targetApp, "/api/v3/command", { name: "MoviesSearch", movieIds: [existing.id] }).catch(() => {});
            }
        }
        if (!servarrId) {
            throw new Error(addRes.error || "Failed adding movie to Radarr");
        }
    }

    // 5. Update request status in SQLite
    await prisma.mediaRequest.update({
        where: { id: req.id },
        data: {
            status: "PROCESSING",
            servarrAppId: targetApp.id,
            servarrId,
            qualityProfileId,
            rootFolderPath,
            errorMessage: null
        }
    });

    logger.addLog("INFO", "SEERR", `Successfully dispatched movie request "${req.title}" (TMDb: ${req.tmdbId}) to Radarr (${targetApp.name}) with ID ${servarrId}`);
    return { success: true, servarrId, servarrAppId: targetApp.id };
}

/**
 * Dispatches a TV show request to Sonarr
 */
async function dispatchTvRequest(req: any, settings: any): Promise<DispatchResult> {
    // 1. Determine target Sonarr app
    const sonarrAppsRes = await getEnabledArrInstancesInternal("sonarr");
    if (!sonarrAppsRes.success || !sonarrAppsRes.data || sonarrAppsRes.data.length === 0) {
        throw new Error("No Sonarr instances configured or enabled. Please configure Sonarr in Settings -> Apps.");
    }

    let targetApp = null;
    if (req.servarrAppId) {
        targetApp = sonarrAppsRes.data.find(a => a.id === req.servarrAppId);
    }
    if (!targetApp) {
        if (req.isKids) {
            const preferredId = req.is4k ? settings?.seerrKidsTv4kAppId : settings?.seerrKidsTvAppId;
            if (preferredId) {
                targetApp = sonarrAppsRes.data.find(a => a.id === preferredId);
            }
        }
    }
    if (!targetApp) {
        const preferredId = req.is4k ? settings?.seerrDefaultTv4kAppId : settings?.seerrDefaultTvAppId;
        if (preferredId) {
            targetApp = sonarrAppsRes.data.find(a => a.id === preferredId);
        }
    }
    if (!targetApp) {
        targetApp = sonarrAppsRes.data[0];
    }

    if (!targetApp) {
        throw new Error("Could not resolve a suitable Sonarr instance for dispatch.");
    }

    // 2. Determine quality profile and root folder
    const profilesRes = await arrApiGet(targetApp, "/api/v3/qualityprofile");
    const foldersRes = await arrApiGet(targetApp, "/api/v3/rootfolder");

    if (!profilesRes.success || !profilesRes.data || profilesRes.data.length === 0) {
        throw new Error(`Failed to fetch quality profiles from Sonarr (${targetApp.name}): ${profilesRes.error}`);
    }
    if (!foldersRes.success || !foldersRes.data || foldersRes.data.length === 0) {
        throw new Error(`Failed to fetch root folders from Sonarr (${targetApp.name}): ${foldersRes.error}`);
    }

    const availableProfiles = profilesRes.data;
    const availableFolders = foldersRes.data;

    let qualityProfileId = req.qualityProfileId;
    if (!qualityProfileId || !availableProfiles.some((p: any) => p.id === qualityProfileId)) {
        let configuredProfileId: number | null | undefined = null;
        if (req.isKids) {
            configuredProfileId = req.is4k ? settings?.seerrKidsTv4kProfileId : settings?.seerrKidsTvProfileId;
        }
        if (!configuredProfileId) {
            configuredProfileId = req.is4k ? settings?.seerrDefaultTv4kProfileId : settings?.seerrDefaultTvProfileId;
        }
        if (configuredProfileId && availableProfiles.some((p: any) => p.id === configuredProfileId)) {
            qualityProfileId = configuredProfileId;
        } else {
            qualityProfileId = availableProfiles[0]?.id || 1;
        }
    }

    let rootFolderPath = req.rootFolderPath;
    if (!rootFolderPath || !availableFolders.some((f: any) => f.path === rootFolderPath)) {
        let configuredFolder: string | null | undefined = null;
        if (req.isKids) {
            configuredFolder = req.is4k ? settings?.seerrKidsTv4kRootFolder : settings?.seerrKidsTvRootFolder;
        }
        if (!configuredFolder) {
            configuredFolder = req.is4k ? settings?.seerrDefaultTv4kRootFolder : settings?.seerrDefaultTvRootFolder;
        }
        if (configuredFolder && availableFolders.some((f: any) => f.path === configuredFolder)) {
            rootFolderPath = configuredFolder;
        } else {
            rootFolderPath = availableFolders[0]?.path || "/tv";
        }
    }

    // 3. Lookup series in Sonarr
    let seriesData = null;
    if (req.tvdbId) {
        const tvdbLookup = await arrApiGet(targetApp, `/api/v3/series/lookup?term=tvdb:${req.tvdbId}`);
        if (tvdbLookup.success && Array.isArray(tvdbLookup.data) && tvdbLookup.data.length > 0) {
            seriesData = tvdbLookup.data[0];
        }
    }

    if (!seriesData) {
        const titleLookup = await arrApiGet(targetApp, `/api/v3/series/lookup?term=${encodeURIComponent(req.title)}`);
        if (titleLookup.success && Array.isArray(titleLookup.data) && titleLookup.data.length > 0) {
            seriesData = (req.tvdbId ? titleLookup.data.find((s: any) => s.tvdbId === req.tvdbId) : null) || titleLookup.data[0];
        }
    }

    if (!seriesData) {
        throw new Error(`Sonarr could not find metadata for series "${req.title}" (TVDb: ${req.tvdbId || "N/A"})`);
    }

    // 4. Configure seasons monitoring based on request
    let requestedSeasonsList: number[] | "all" = "all";
    if (req.seasons) {
        try {
            if (req.seasons === "all") {
                requestedSeasonsList = "all";
            } else {
                requestedSeasonsList = JSON.parse(req.seasons);
            }
        } catch {
            requestedSeasonsList = "all";
        }
    }

    const seasons = (seriesData.seasons || []).map((s: any) => {
        let isMonitored = true;
        if (Array.isArray(requestedSeasonsList)) {
            isMonitored = requestedSeasonsList.includes(s.seasonNumber);
        }
        return {
            ...s,
            monitored: isMonitored
        };
    });

    // 5. Construct payload and add series to Sonarr
    const { id, languageProfileId: lookupLangId, ...cleanedSeriesData } = seriesData;
    const addBody: any = {
        ...cleanedSeriesData,
        qualityProfileId,
        rootFolderPath,
        monitored: true,
        seasonFolder: true,
        seasons,
        addOptions: {
            monitor: "unknown",
            searchForMissingEpisodes: true
        }
    };

    if (lookupLangId !== undefined) {
        addBody.languageProfileId = lookupLangId || 1;
    }

    const addRes = await arrApiPost(targetApp, "/api/v3/series", addBody);

    let servarrId: number | undefined;

    if (addRes.success && addRes.data) {
        servarrId = addRes.data.id;
    } else {
        // If series already exists in Sonarr, fetch existing record and trigger search
        const existingSeriesRes = await arrApiGet(targetApp, `/api/v3/series`);
        if (existingSeriesRes.success && Array.isArray(existingSeriesRes.data)) {
            const existing = existingSeriesRes.data.find((s: any) => (req.tvdbId && s.tvdbId === req.tvdbId) || s.title.toLowerCase() === req.title.toLowerCase());
            if (existing) {
                servarrId = existing.id;
                await arrApiPost(targetApp, "/api/v3/command", { name: "SeriesSearch", seriesId: existing.id }).catch(() => {});
            }
        }
        if (!servarrId) {
            throw new Error(addRes.error || "Failed adding series to Sonarr");
        }
    }

    // 6. Update request status in SQLite
    await prisma.mediaRequest.update({
        where: { id: req.id },
        data: {
            status: "PROCESSING",
            servarrAppId: targetApp.id,
            servarrId,
            qualityProfileId,
            rootFolderPath,
            errorMessage: null
        }
    });

    logger.addLog("INFO", "SEERR", `Successfully dispatched TV request "${req.title}" (TVDb: ${req.tvdbId}) to Sonarr (${targetApp.name}) with ID ${servarrId}`);
    return { success: true, servarrId, servarrAppId: targetApp.id };
}

/**
 * Automatically creates and dispatches a companion 1080p request when a 4K request is processed
 */
async function dispatchDual1080pCompanion(req: any, settings: any) {
    try {
        if (!req.is4k || req.isDual1080pChild) return;
        if (settings?.seerrAutoDual1080pFor4k === false) return;

        // Check if a standard 1080p request already exists for this TMDb ID
        const existing1080p = await prisma.mediaRequest.findFirst({
            where: {
                tmdbId: req.tmdbId,
                mediaType: req.mediaType,
                is4k: false
            }
        });

        if (existing1080p) {
            if (existing1080p.status === "PENDING" || existing1080p.status === "APPROVED") {
                await dispatchMediaRequest(existing1080p.id);
            }
            return;
        }

        // Create companion standard 1080p request
        const companion = await prisma.mediaRequest.create({
            data: {
                mediaType: req.mediaType,
                tmdbId: req.tmdbId,
                tvdbId: req.tvdbId,
                imdbId: req.imdbId,
                title: req.title,
                releaseYear: req.releaseYear,
                posterPath: req.posterPath,
                backdropPath: req.backdropPath,
                overview: req.overview,
                status: "APPROVED",
                is4k: false,
                isKids: req.isKids ?? false,
                contentRating: req.contentRating,
                isDual1080pChild: true,
                parent4kRequestId: req.id,
                requestedByUserId: req.requestedByUserId,
                requestedByUsername: req.requestedByUsername,
                seasons: req.seasons
            }
        });

        logger.addLog("INFO", "SEERR", `Dual Ingestion: Automatically created and dispatching 1080p companion request for "${req.title}" (TMDb: ${req.tmdbId})`);
        await dispatchMediaRequest(companion.id);
    } catch (e: any) {
        logger.addLog("WARN", "SEERR", `Dual Ingestion companion dispatch notice for "${req.title}": ${e.message}`);
    }
}

