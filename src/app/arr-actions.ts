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
        const res = await fetch(`${app.url}${endpoint}`, {
            headers: { "X-Api-Key": app.apiKey },
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`API GET ${endpoint} failed: ${res.statusText}`);
        return { success: true, data: await res.json() };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function arrApiPost(app: any, endpoint: string, body: any) {
    try {
        const res = await fetch(`${app.url}${endpoint}`, {
            method: "POST",
            headers: { 
                "X-Api-Key": app.apiKey,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(body),
            cache: "no-store"
        });
        if (!res.ok) throw new Error(`API POST ${endpoint} failed: ${res.statusText}`);
        return { success: true, data: await res.json() };
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
