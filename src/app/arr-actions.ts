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
    await verifySuperUserOrAdmin();
    const apps = await prisma.mediaApp.findMany({
        where: { type, enabledForUsers: true }
    });
    return apps.map(app => ({
        id: app.id,
        name: app.name,
        url: app.url,
        externalUrl: app.externalUrl,
        allowedQualityProfileIds: app.allowedQualityProfileIds ? app.allowedQualityProfileIds.split(",").map(s => s.trim()) : [],
        allowedRootFolderIds: app.allowedRootFolderIds ? app.allowedRootFolderIds.split(",").map(s => s.trim()) : [],
        apiKey: decryptData(app.apiKey || "")
    }));
}

export async function arrApiGet(app: any, endpoint: string) {
    const res = await fetch(`${app.url}${endpoint}`, {
        headers: { "X-Api-Key": app.apiKey },
        cache: "no-store"
    });
    if (!res.ok) throw new Error(`API GET ${endpoint} failed: ${res.statusText}`);
    return res.json();
}

export async function arrApiPost(app: any, endpoint: string, body: any) {
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
    return res.json();
}

// ---- RADARR ----

export async function searchRadarrMovies(appId: string, term: string) {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances("radarr");
    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error("Radarr instance not found or disabled");
    
    return arrApiGet(app, `/api/v3/movie/lookup?term=${encodeURIComponent(term)}`);
}

export async function addRadarrMovie(appId: string, movieData: any, qualityProfileId: number, rootFolderPath: string) {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances("radarr");
    const app = apps.find(a => a.id === appId);
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

    return arrApiPost(app, "/api/v3/movie", body);
}

export async function getRadarrQueue(appId: string) {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances("radarr");
    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error("Radarr instance not found or disabled");
    
    return arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000&sortKey=timeLeft&sortDirection=ascending");
}

export async function forceImportRadarrQueueItem(appId: string, downloadId: string) {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances("radarr");
    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error("Radarr instance not found or disabled");

    const manualImportFiles = await arrApiGet(app, `/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`);
    
    if (manualImportFiles && manualImportFiles.length > 0) {
        const importPayload = manualImportFiles.map((file: any) => ({
            ...file,
            importApproved: true
        }));
        return arrApiPost(app, "/api/v3/manualimport", importPayload);
    }
    
    return { success: false, message: "No files found to import" };
}

// ---- SONARR ----

export async function searchSonarrSeries(appId: string, term: string) {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances("sonarr");
    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error("Sonarr instance not found or disabled");
    
    return arrApiGet(app, `/api/v3/series/lookup?term=${encodeURIComponent(term)}`);
}

export async function addSonarrSeries(appId: string, seriesData: any, qualityProfileId: number, rootFolderPath: string) {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances("sonarr");
    const app = apps.find(a => a.id === appId);
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

    return arrApiPost(app, "/api/v3/series", body);
}

export async function getSonarrQueue(appId: string) {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances("sonarr");
    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error("Sonarr instance not found or disabled");
    
    return arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000&sortKey=timeLeft&sortDirection=ascending");
}

export async function forceImportSonarrQueueItem(appId: string, downloadId: string) {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances("sonarr");
    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error("Sonarr instance not found or disabled");

    const manualImportFiles = await arrApiGet(app, `/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`);
    
    if (manualImportFiles && manualImportFiles.length > 0) {
        const importPayload = manualImportFiles.map((file: any) => ({
            ...file,
            importApproved: true
        }));
        return arrApiPost(app, "/api/v3/manualimport", importPayload);
    }
    
    return { success: false, message: "No files found to import" };
}

// Meta fetchers for Quality Profiles and Root Folders
export async function getArrProfilesAndFolders(appId: string, type: "radarr" | "sonarr") {
    await verifySuperUserOrAdmin();
    const apps = await getEnabledArrInstances(type);
    const app = apps.find(a => a.id === appId);
    if (!app) throw new Error("Instance not found or disabled");

    const profiles = await arrApiGet(app, "/api/v3/qualityprofile");
    const folders = await arrApiGet(app, "/api/v3/rootfolder");

    return {
        profiles: profiles.filter((p: any) => app.allowedQualityProfileIds.length === 0 || app.allowedQualityProfileIds.includes(p.id.toString())),
        folders: folders.filter((f: any) => app.allowedRootFolderIds.length === 0 || app.allowedRootFolderIds.includes(f.id.toString()))
    };
}
