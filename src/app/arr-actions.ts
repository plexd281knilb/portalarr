"use server"

import { prisma } from "@/lib/prisma"
import { decryptData } from "@/lib/encryption"
import { getSession } from "@/app/auth-actions"
import { getCleanArrBase, arrApiGet, arrApiPost, arrApiPut, arrApiDelete } from "@/lib/arr-client"

async function verifyUser() {
    if (process.env.NODE_ENV !== "production" && process.env.PORTALARR_TEST_AUTH === "true") {
        if (process.env.PORTALARR_TEST_USER_ID) {
            const specific = await prisma.user.findUnique({ where: { id: process.env.PORTALARR_TEST_USER_ID } });
            if (specific) return { ...specific, userId: specific.id };
        }
        const admin = await prisma.user.findFirst({ where: { role: "ADMIN" } });
        if (admin) return { ...admin, userId: admin.id };
        return { id: "test-admin-id", userId: "test-admin-id", username: "admin", email: "admin@example.com", role: "ADMIN", status: "APPROVED" } as any;
    }
    const session = await getSession();
    if (!session || (!session.userId && !session.id)) {
        throw new Error("Unauthorized");
    }
    const status = String((session as any).status || "APPROVED").toUpperCase();
    if (session.role !== "ADMIN" && (status === "PENDING" || status === "REJECTED" || status === "SUSPENDED" || status === "EXPIRED")) {
        throw new Error("Unauthorized");
    }
    return session;
}

async function verifySuperUserOrAdmin() {
    const session = await verifyUser();
    if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_USER")) {
        throw new Error("Unauthorized");
    }
    return session;
}

export async function testArrConfig(url: string, apiKey: string) {
    try {
        await verifySuperUserOrAdmin();
        const base = getCleanArrBase(url);
        const cleanKey = (apiKey || "").trim();

        const headers = { 
            "X-Api-Key": cleanKey,
            "Accept": "application/json"
        };

        // Try v3 first (Radarr, Sonarr), then v1 (Readarr, Lidarr)
        let profilesRes = await fetch(`${base}/api/v3/qualityprofile?apikey=${encodeURIComponent(cleanKey)}`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (profilesRes.status === 404) {
            profilesRes = await fetch(`${base}/api/v1/qualityprofile?apikey=${encodeURIComponent(cleanKey)}`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
        }

        let foldersRes = await fetch(`${base}/api/v3/rootfolder?apikey=${encodeURIComponent(cleanKey)}`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (foldersRes.status === 404) {
            foldersRes = await fetch(`${base}/api/v1/rootfolder?apikey=${encodeURIComponent(cleanKey)}`, { headers, cache: "no-store", signal: AbortSignal.timeout(10000) });
        }
        
        if (!profilesRes.ok) throw new Error(`Profiles API failed: HTTP ${profilesRes.status} ${profilesRes.statusText}`);
        if (!foldersRes.ok) throw new Error(`Folders API failed: HTTP ${foldersRes.status} ${foldersRes.statusText}`);
        
        const profilesText = await profilesRes.text();
        const foldersText = await foldersRes.text();
        
        let profiles, folders;
        try {
            profiles = JSON.parse(profilesText);
            folders = JSON.parse(foldersText);
        } catch (err) {
            throw new Error(`API returned non-JSON. This usually means the URL is incorrect or a proxy is blocking access. (Response started with: ${profilesText.slice(0, 20)}...)`);
        }
        
        return { success: true, data: { profiles, folders } };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getArrProfilesAndFolders(appId: string, type?: "radarr" | "sonarr") {
    try {
        await verifyUser();
        if (!appId || appId === "none") {
            return { success: true, profiles: [], folders: [], data: { profiles: [], folders: [] } };
        }

        const app = await prisma.mediaApp.findUnique({
            where: { id: appId }
        });

        if (!app) {
            return { success: false, error: "Media app not found", profiles: [], folders: [], data: { profiles: [], folders: [] } };
        }

        const decryptedApp = {
            ...app,
            apiKey: decryptData(app.apiKey || "")
        };

        const [profilesRes, foldersRes] = await Promise.all([
            arrApiGet(decryptedApp, "/api/v3/qualityprofile"),
            arrApiGet(decryptedApp, "/api/v3/rootfolder")
        ]);

        let profiles: Array<{ id: number; name: string }> = Array.isArray(profilesRes.data)
            ? profilesRes.data.map((p: any) => ({ id: p.id, name: p.name }))
            : [];

        let folders: Array<{ id: number; path: string; freeSpace?: number; freeSpaceFormatted?: string }> = Array.isArray(foldersRes.data)
            ? foldersRes.data.map((f: any) => {
                let freeFormatted: string | undefined;
                if (typeof f.freeSpace === "number" && f.freeSpace > 0) {
                    const gb = f.freeSpace / (1024 * 1024 * 1024);
                    freeFormatted = gb >= 1000 ? `${(gb / 1024).toFixed(1)} TB free` : `${Math.round(gb)} GB free`;
                }
                return {
                    id: f.id,
                    path: f.path,
                    freeSpace: f.freeSpace,
                    freeSpaceFormatted: freeFormatted
                };
            })
            : [];

        // Apply Allowed Quality Profile ID restrictions
        if (app.allowedQualityProfileIds) {
            const allowedIds = app.allowedQualityProfileIds
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);
            if (allowedIds.length > 0) {
                const filtered = profiles.filter(p => allowedIds.includes(String(p.id)));
                if (filtered.length > 0) {
                    profiles = filtered;
                }
            }
        }

        // Apply Allowed Root Folder ID restrictions
        if (app.allowedRootFolderIds) {
            const allowedIds = app.allowedRootFolderIds
                .split(",")
                .map(s => s.trim())
                .filter(Boolean);
            if (allowedIds.length > 0) {
                const filtered = folders.filter(f => 
                    allowedIds.includes(String(f.id)) || 
                    allowedIds.some(af => f.path.toLowerCase().includes(af.toLowerCase()))
                );
                if (filtered.length > 0) {
                    folders = filtered;
                }
            }
        }

        return {
            success: true,
            profiles,
            folders,
            data: {
                profiles,
                folders
            }
        };
    } catch (e: any) {
        return { success: false, error: e.message, profiles: [], folders: [], data: { profiles: [], folders: [] } };
    }
}

export async function getArrAppById(appId: string, type: "radarr" | "sonarr") {
    const session = await verifySuperUserOrAdmin();
    if (!appId || appId === "none") {
        throw new Error("Invalid instance ID");
    }

    const app = await prisma.mediaApp.findUnique({
        where: { id: appId }
    });

    if (!app || app.type !== type) {
        throw new Error(`${type === "radarr" ? "Radarr" : "Sonarr"} instance not found`);
    }

    if (session.role !== "ADMIN" && !app.enabledForUsers) {
        throw new Error("Instance not permitted or disabled for users");
    }

    return {
        id: app.id,
        name: app.name,
        url: app.url,
        externalUrl: app.externalUrl,
        allowedQualityProfileIds: app.allowedQualityProfileIds ? app.allowedQualityProfileIds.split(",").map(s => s.trim()).filter(Boolean) : [],
        allowedRootFolderIds: app.allowedRootFolderIds ? app.allowedRootFolderIds.split(",").map(s => s.trim()).filter(Boolean) : [],
        apiKey: decryptData(app.apiKey || "")
    };
}

export async function getEnabledArrInstances(type: "radarr" | "sonarr") {
    try {
        let session: any = null;
        try {
            session = await verifyUser();
        } catch {}

        if (!session) {
            return { success: false, error: "Unauthorized", data: [] };
        }

        let apps;
        if (session.role === "ADMIN") {
            apps = await prisma.mediaApp.findMany({
                where: { type }
            });
        } else {
            apps = await prisma.mediaApp.findMany({
                where: { type, enabledForUsers: true }
            });
        }

        return {
            success: true,
            data: apps.map(app => ({
                id: app.id,
                name: app.name,
                url: app.url,
                externalUrl: app.externalUrl,
                allowedQualityProfileIds: app.allowedQualityProfileIds ? app.allowedQualityProfileIds.split(",").map(s => s.trim()).filter(Boolean) : [],
                allowedRootFolderIds: app.allowedRootFolderIds ? app.allowedRootFolderIds.split(",").map(s => s.trim()).filter(Boolean) : []
            }))
        };
    } catch (e: any) {
        return { success: false, error: e.message, data: [] };
    }
}

// ---- RADARR ----

export async function searchRadarrMovies(appId: string, term: string) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiGet(app, `/api/v3/movie/lookup?term=${encodeURIComponent(term)}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function addRadarrMovie(appId: string, movieData: any, qualityProfileId: number, rootFolderPath: string) {
    try {
        const app = await getArrAppById(appId, "radarr");

        if (app.allowedQualityProfileIds.length > 0 && !app.allowedQualityProfileIds.includes(qualityProfileId.toString())) {
            throw new Error("Quality profile not allowed for this instance");
        }

        // Remove id if it exists in movieData to prevent Bad Request when creating new entity
        const { id, ...cleanedMovieData } = movieData;

        const body = {
            ...cleanedMovieData,
            qualityProfileId,
            rootFolderPath,
            monitored: true,
            addOptions: {
                searchForMovie: true
            }
        };

        return await arrApiPost(app, "/api/v3/movie", body);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getRadarrLibrary(appId: string) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiGet(app, "/api/v3/movie");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateRadarrMovie(appId: string, movie: any) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiPut(app, `/api/v3/movie/${movie.id}`, movie);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteRadarrMovie(
    appId: string,
    movieId: number,
    deleteFiles: boolean = false,
    addImportExclusion: boolean = false
) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiDelete(app, `/api/v3/movie/${movieId}?deleteFiles=${deleteFiles}&addImportExclusion=${addImportExclusion}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function triggerRadarrSearch(appId: string, movieId: number) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiPost(app, "/api/v3/command", { name: "MoviesSearch", movieIds: [movieId] });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getRadarrReleases(appId: string, movieId: number) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiGet(app, `/api/v3/release?movieId=${movieId}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function downloadRadarrRelease(appId: string, guid: string, indexerId: number) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiPost(app, "/api/v3/release", { guid, indexerId });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getRadarrQueue(appId: string) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000&sortKey=timeLeft&sortDirection=ascending");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteRadarrQueueItem(
    appId: string,
    queueId: number,
    removeFromClient: boolean = true,
    blocklist: boolean = false
) {
    try {
        const app = await getArrAppById(appId, "radarr");
        return await arrApiDelete(app, `/api/v3/queue/${queueId}?removeFromClient=${removeFromClient}&blocklist=${blocklist}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function forceImportRadarrQueueItem(appId: string, downloadId: string) {
    try {
        const app = await getArrAppById(appId, "radarr");

        // Retrieve the queue to find the correct movieId for this download
        const queueRes = await arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000");
        let targetMovieId = 0;
        if (queueRes.success && queueRes.data && queueRes.data.records) {
            const queueItem = queueRes.data.records.find((r: any) => r.downloadId === downloadId);
            if (queueItem && queueItem.movieId) {
                targetMovieId = queueItem.movieId;
            }
        }

        // If queue mapping failed (e.g., ambiguous movies), fallback to history lookup
        if (targetMovieId === 0) {
            const historyRes = await arrApiGet(app, "/api/v3/history?page=1&pageSize=1000");
            if (historyRes.success && historyRes.data && historyRes.data.records) {
                const historyItem = historyRes.data.records.find((r: any) => r.data?.downloadId === downloadId);
                if (historyItem && historyItem.movieId) {
                    targetMovieId = historyItem.movieId;
                }
            }
        }

        const manualImportRes = await arrApiGet(app, `/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`);
        if (!manualImportRes.success || !manualImportRes.data) throw new Error(manualImportRes.error || "Failed to load files");
        
        const manualImportFiles = manualImportRes.data;
        if (manualImportFiles && manualImportFiles.length > 0) {
            const importPayload = manualImportFiles.map((file: any) => ({
                ...file,
                movieId: file.movieId || targetMovieId,
                importApproved: true
            }));
            return await arrApiPost(app, "/api/v3/command", {
                name: "ManualImport",
                files: importPayload,
                importMode: "move"
            });
        }
        
        return { success: false, error: "No files found to import" };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ---- SONARR ----

export async function searchSonarrSeries(appId: string, term: string) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiGet(app, `/api/v3/series/lookup?term=${encodeURIComponent(term)}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function addSonarrSeries(appId: string, seriesData: any, qualityProfileId: number, rootFolderPath: string) {
    try {
        const app = await getArrAppById(appId, "sonarr");

        if (app.allowedQualityProfileIds.length > 0 && !app.allowedQualityProfileIds.includes(qualityProfileId.toString())) {
            throw new Error("Quality profile not allowed for this instance");
        }

        // Remove id if it exists in seriesData to prevent Bad Request when creating new entity
        const { id, languageProfileId: lookupLangId, ...cleanedSeriesData } = seriesData;

        const body: any = {
            ...cleanedSeriesData,
            qualityProfileId,
            rootFolderPath,
            monitored: true,
            addOptions: {
                monitor: "unknown",
                searchForMissingEpisodes: true
            }
        };

        // Sonarr v3 requires languageProfileId. Sonarr v4 removed it and throws Bad Request if present.
        // We detect which version they are running by checking if the lookup payload included it.
        if (lookupLangId !== undefined) {
            body.languageProfileId = lookupLangId || 1;
        }

        return await arrApiPost(app, "/api/v3/series", body);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getSonarrLibrary(appId: string) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiGet(app, "/api/v3/series");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateSonarrSeries(appId: string, series: any) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiPut(app, `/api/v3/series/${series.id}`, series);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteSonarrSeries(
    appId: string,
    seriesId: number,
    deleteFiles: boolean = false,
    addImportListExclusion: boolean = false
) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiDelete(app, `/api/v3/series/${seriesId}?deleteFiles=${deleteFiles}&addImportListExclusion=${addImportListExclusion}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function triggerSonarrSearch(appId: string, seriesId: number) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiPost(app, "/api/v3/command", { name: "SeriesSearch", seriesId });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getSonarrEpisodes(appId: string, seriesId: number, seasonNumber: number) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiGet(app, `/api/v3/episode?seriesId=${seriesId}&seasonNumber=${seasonNumber}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateSonarrEpisodeMonitor(appId: string, episodeIds: number[], monitored: boolean) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiPut(app, `/api/v3/episode/monitor`, { episodeIds, monitored });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getSonarrReleases(appId: string, seriesId: number, seasonNumber?: number, episodeId?: number) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        let url = `/api/v3/release?seriesId=${seriesId}`;
        if (episodeId !== undefined) {
            url = `/api/v3/release?episodeId=${episodeId}`;
        } else if (seasonNumber !== undefined) {
            url += `&seasonNumber=${seasonNumber}`;
        }
        return await arrApiGet(app, url);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function downloadSonarrRelease(appId: string, guid: string, indexerId: number) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiPost(app, "/api/v3/release", { guid, indexerId });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getSonarrQueue(appId: string) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000&sortKey=timeLeft&sortDirection=ascending");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteSonarrQueueItem(
    appId: string,
    queueId: number,
    removeFromClient: boolean = true,
    blocklist: boolean = false
) {
    try {
        const app = await getArrAppById(appId, "sonarr");
        return await arrApiDelete(app, `/api/v3/queue/${queueId}?removeFromClient=${removeFromClient}&blocklist=${blocklist}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function forceImportSonarrQueueItem(appId: string, downloadId: string) {
    try {
        const app = await getArrAppById(appId, "sonarr");

        // Retrieve the queue to find the correct seriesId for this download
        const queueRes = await arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000");
        let targetSeriesId = 0;
        let targetEpisodeId = 0;
        if (queueRes.success && queueRes.data && queueRes.data.records) {
            const queueItem = queueRes.data.records.find((r: any) => r.downloadId === downloadId);
            if (queueItem && queueItem.seriesId) {
                targetSeriesId = queueItem.seriesId;
                if (queueItem.episodeId) {
                    targetEpisodeId = queueItem.episodeId;
                } else if (queueItem.episode?.id) {
                    targetEpisodeId = queueItem.episode.id;
                }
            }
        }

        // If queue mapping failed (e.g., ambiguous series), fallback to history lookup
        if (targetSeriesId === 0) {
            const historyRes = await arrApiGet(app, "/api/v3/history?page=1&pageSize=1000");
            if (historyRes.success && historyRes.data && historyRes.data.records) {
                const historyItem = historyRes.data.records.find((r: any) => r.data?.downloadId === downloadId);
                if (historyItem && historyItem.seriesId) {
                    targetSeriesId = historyItem.seriesId;
                    if (historyItem.episodeId) {
                        targetEpisodeId = historyItem.episodeId;
                    }
                }
            }
        }

        const manualImportRes = await arrApiGet(app, `/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`);
        if (!manualImportRes.success || !manualImportRes.data) throw new Error(manualImportRes.error || "Failed to load files");

        const manualImportFiles = manualImportRes.data;
        if (manualImportFiles && manualImportFiles.length > 0) {
            const importPayload = manualImportFiles.map((file: any) => ({
                ...file,
                seriesId: file.seriesId || targetSeriesId,
                episodeIds: (file.episodeIds && file.episodeIds.length > 0) ? file.episodeIds : (targetEpisodeId ? [targetEpisodeId] : []),
                importApproved: true
            }));
            return await arrApiPost(app, "/api/v3/command", {
                name: "ManualImport",
                files: importPayload,
                importMode: "move"
            });
        }
        
        return { success: false, error: "No files found to import" };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

