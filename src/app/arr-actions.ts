"use server"

import { prisma } from "@/lib/prisma"
import { decryptData } from "@/lib/encryption"
import { getSession } from "@/app/auth-actions"

async function verifySuperUserOrAdmin() {
    const session = await getSession();
    if (!session || (session.role !== "ADMIN" && session.role !== "SUPER_USER")) {
        throw new Error("Unauthorized");
    }
    return session;
}

export async function testArrConfig(url: string, apiKey: string) {
    try {
        await verifySuperUserOrAdmin();
        const cleanUrl = url.replace(/\/+$/, "");
        const profilesRes = await fetch(`${cleanUrl}/api/v3/qualityprofile`, { headers: { "X-Api-Key": apiKey }, cache: "no-store" });
        const foldersRes = await fetch(`${cleanUrl}/api/v3/rootfolder`, { headers: { "X-Api-Key": apiKey }, cache: "no-store" });
        
        if (!profilesRes.ok) throw new Error(`Profiles API failed: ${profilesRes.statusText}`);
        if (!foldersRes.ok) throw new Error(`Folders API failed: ${foldersRes.statusText}`);
        
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

export async function getEnabledArrInstances(type: "radarr" | "sonarr") {
    try {
        await verifySuperUserOrAdmin();
        const apps = await prisma.mediaApp.findMany({
            where: { type, enabledForUsers: true }
        });
        return {
            success: true,
            data: apps.map(app => ({
                id: app.id,
                name: app.name,
                url: app.url,
                externalUrl: app.externalUrl,
                allowedQualityProfileIds: app.allowedQualityProfileIds ? app.allowedQualityProfileIds.split(",").map(s => s.trim()) : [],
                allowedRootFolderIds: app.allowedRootFolderIds ? app.allowedRootFolderIds.split(",").map(s => s.trim()) : [],
                apiKey: decryptData(app.apiKey || "")
            }))
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function arrApiGet(app: any, endpoint: string) {
    try {
        const cleanUrl = app.url.replace(/\/+$/, "");
        const res = await fetch(`${cleanUrl}${endpoint}`, {
            headers: { "X-Api-Key": app.apiKey },
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`API GET ${endpoint} failed: ${res.statusText}`);
        const text = await res.text();
        try {
            return { success: true, data: JSON.parse(text) };
        } catch (err) {
            throw new Error(`API returned non-JSON. Incorrect URL or proxy issue? (Response: ${text.slice(0, 30)}...)`);
        }
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function arrApiPost(app: any, endpoint: string, body: any) {
    try {
        const cleanUrl = app.url.replace(/\/+$/, "");
        const res = await fetch(`${cleanUrl}${endpoint}`, {
            method: "POST",
            headers: { 
                "X-Api-Key": app.apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`API POST ${endpoint} failed: ${res.statusText}`);
        const text = await res.text();
        try {
            return { success: true, data: JSON.parse(text) };
        } catch (err) {
            throw new Error(`API returned non-JSON. (Response: ${text.slice(0, 30)}...)`);
        }
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function arrApiPut(app: any, endpoint: string, body: any) {
    try {
        const cleanUrl = app.url.replace(/\/+$/, "");
        const res = await fetch(`${cleanUrl}${endpoint}`, {
            method: "PUT",
            headers: { 
                "X-Api-Key": app.apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`API PUT ${endpoint} failed: ${res.statusText}`);
        const text = await res.text();
        try {
            return { success: true, data: JSON.parse(text) };
        } catch (err) {
            throw new Error(`API returned non-JSON. (Response: ${text.slice(0, 30)}...)`);
        }
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ---- RADARR ----

export async function searchRadarrMovies(appId: string, term: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");
        
        return await arrApiGet(app, `/api/v3/movie/lookup?term=${encodeURIComponent(term)}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function addRadarrMovie(appId: string, movieData: any, qualityProfileId: number, rootFolderPath: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");

        if (app.allowedQualityProfileIds.length > 0 && !app.allowedQualityProfileIds.includes(qualityProfileId.toString())) {
            throw new Error("Quality profile not allowed for this instance");
        }

        const body = {
            ...movieData,
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
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");
        
        return await arrApiGet(app, "/api/v3/movie");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateRadarrMovie(appId: string, movie: any) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");
        
        return await arrApiPut(app, `/api/v3/movie/${movie.id}`, movie);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function triggerRadarrSearch(appId: string, movieId: number) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");
        
        return await arrApiPost(app, "/api/v3/command", { name: "MoviesSearch", movieIds: [movieId] });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getRadarrReleases(appId: string, movieId: number) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");
        
        return await arrApiGet(app, `/api/v3/release?movieId=${movieId}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function downloadRadarrRelease(appId: string, guid: string, indexerId: number) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");
        
        return await arrApiPost(app, "/api/v3/release", { guid, indexerId });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getRadarrQueue(appId: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");
        
        return await arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000&sortKey=timeLeft&sortDirection=ascending");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function forceImportRadarrQueueItem(appId: string, downloadId: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("radarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Radarr instance not found or disabled");

        const manualImportRes = await arrApiGet(app, `/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`);
        if (!manualImportRes.success || !manualImportRes.data) throw new Error(manualImportRes.error || "Failed to load files");
        
        const manualImportFiles = manualImportRes.data;
        if (manualImportFiles && manualImportFiles.length > 0) {
            const importPayload = manualImportFiles.map((file: any) => ({
                ...file,
                importApproved: true
            }));
            return await arrApiPost(app, "/api/v3/manualimport", importPayload);
        }
        
        return { success: false, error: "No files found to import" };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// ---- SONARR ----

export async function searchSonarrSeries(appId: string, term: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");
        
        return await arrApiGet(app, `/api/v3/series/lookup?term=${encodeURIComponent(term)}`);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function addSonarrSeries(appId: string, seriesData: any, qualityProfileId: number, rootFolderPath: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");

        if (app.allowedQualityProfileIds.length > 0 && !app.allowedQualityProfileIds.includes(qualityProfileId.toString())) {
            throw new Error("Quality profile not allowed for this instance");
        }

        const body = {
            ...seriesData,
            qualityProfileId,
            rootFolderPath,
            monitored: true,
            addOptions: {
                searchForMissingEpisodes: true
            }
        };

        return await arrApiPost(app, "/api/v3/series", body);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getSonarrLibrary(appId: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");
        
        return await arrApiGet(app, "/api/v3/series");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function updateSonarrSeries(appId: string, series: any) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");
        
        return await arrApiPut(app, `/api/v3/series/${series.id}`, series);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function triggerSonarrSearch(appId: string, seriesId: number) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");
        
        return await arrApiPost(app, "/api/v3/command", { name: "SeriesSearch", seriesId });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getSonarrReleases(appId: string, seriesId: number, seasonNumber?: number) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");
        
        let url = `/api/v3/release?seriesId=${seriesId}`;
        if (seasonNumber !== undefined) {
            url += `&seasonNumber=${seasonNumber}`;
        }
        return await arrApiGet(app, url);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function downloadSonarrRelease(appId: string, guid: string, indexerId: number) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");
        
        return await arrApiPost(app, "/api/v3/release", { guid, indexerId });
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getSonarrQueue(appId: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");
        
        return await arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000&sortKey=timeLeft&sortDirection=ascending");
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function forceImportSonarrQueueItem(appId: string, downloadId: string) {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances("sonarr");
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Sonarr instance not found or disabled");

        const manualImportRes = await arrApiGet(app, `/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`);
        if (!manualImportRes.success || !manualImportRes.data) throw new Error(manualImportRes.error || "Failed to load files");

        const manualImportFiles = manualImportRes.data;
        if (manualImportFiles && manualImportFiles.length > 0) {
            const importPayload = manualImportFiles.map((file: any) => ({
                ...file,
                importApproved: true
            }));
            return await arrApiPost(app, "/api/v3/manualimport", importPayload);
        }
        
        return { success: false, error: "No files found to import" };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Meta fetchers for Quality Profiles and Root Folders
export async function getArrProfilesAndFolders(appId: string, type: "radarr" | "sonarr") {
    try {
        await verifySuperUserOrAdmin();
        const appsRes = await getEnabledArrInstances(type);
        if (!appsRes.success || !appsRes.data) throw new Error(appsRes.error || "Failed to load instances");
        const app = appsRes.data.find((a: any) => a.id === appId);
        if (!app) throw new Error("Instance not found or disabled");

        const profilesRes = await arrApiGet(app, "/api/v3/qualityprofile");
        const foldersRes = await arrApiGet(app, "/api/v3/rootfolder");
        if (!profilesRes.success || !profilesRes.data) throw new Error(profilesRes.error || "Failed to load profiles");
        if (!foldersRes.success || !foldersRes.data) throw new Error(foldersRes.error || "Failed to load folders");

        return {
            success: true,
            data: {
                profiles: profilesRes.data.filter((p: any) => app.allowedQualityProfileIds.length === 0 || app.allowedQualityProfileIds.includes(p.id.toString())),
                folders: foldersRes.data.filter((f: any) => app.allowedRootFolderIds.length === 0 || app.allowedRootFolderIds.includes(f.id.toString()))
            }
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
