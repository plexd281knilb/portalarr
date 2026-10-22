"use server";

import { prisma, ensureSchemaColumns } from "@/lib/prisma";
import { encryptData, decryptData } from "@/lib/encryption";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import { revalidatePath } from "next/cache";
import { getUserCache, setUserCache, clearUserCache } from "@/lib/prewarm";
import { logger } from "@/lib/logger";
import { 
    testMediaServerConnection, 
    fetchMediaServerLibraries, 
    syncUserMediaServerAccess,
    MediaServerLibrary,
    MediaServerConnectionResult
} from "@/lib/media-servers";
import { getPlexServerLibrarySections } from "@/lib/plex";
import { syncUserPlexShareInternal } from "@/app/actions";

function safeRevalidate(path: string) {
    try {
        revalidatePath(path);
    } catch {}
}

// Helper: Authentication verification
async function verifySessionUser(): Promise<any> {
    await ensureSchemaColumns();
    if (process.env.PORTALARR_TEST_AUTH === "true") {
        if (process.env.PORTALARR_TEST_USER_ID) {
            const specificUser = await prisma.user.findUnique({
                where: { id: process.env.PORTALARR_TEST_USER_ID }
            });
            if (specificUser) return specificUser;
        }
        const testUser = await prisma.user.findFirst({
            where: { role: "ADMIN" }
        }) || await prisma.user.findFirst();
        if (testUser) return testUser;
        return {
            id: "test-admin-id",
            username: "admin",
            email: "admin@example.com",
            role: "ADMIN",
            status: "APPROVED",
            membershipTier: "STANDARD"
        };
    }
    let token = "";
    try {
        const cookieStore = await cookies();
        token = cookieStore.get("session")?.value || "";
    } catch {}
    if (!token) throw new Error("Unauthorized");
    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = (payload.userId || payload.id) as string;
    const dbUser = await prisma.user.findUnique({
        where: { id: userId }
    });
    if (!dbUser) throw new Error("User not found");
    return dbUser;
}

async function verifySessionAdmin(): Promise<any> {
    const user = await verifySessionUser();
    if (user.role !== "ADMIN") {
        throw new Error("Forbidden: Administrator privileges required");
    }
    return user;
}

// ============================================================================
// --- ADMIN MEDIA SERVER MANAGEMENT (PLEX, JELLYFIN, EMBY) ---
// ============================================================================

export interface DiscoveredServerInfo {
    id: string;
    name: string;
    type: "PLEX" | "JELLYFIN" | "EMBY";
    url: string;
    apiKey?: string;
    isActive: boolean;
    isMonitored: boolean;
    allowUserSelfSelect: boolean;
    allowTrialAccess: boolean;
    allowedLibraryIds: string[];
    cachedLibraries: MediaServerLibrary[];
    createdAt?: Date;
    updatedAt?: Date;
}

/**
 * Returns all configured media servers (Plex, Jellyfin, and Emby) with their libraries and access rules.
 */
export async function getAdminMediaServersAction(): Promise<{
    success: boolean;
    servers: DiscoveredServerInfo[];
    error?: string;
}> {
    try {
        await verifySessionAdmin();

        const [plexServers, mediaServers] = await Promise.all([
            prisma.plexServer.findMany({ orderBy: { name: "asc" } }),
            prisma.mediaServer.findMany({ orderBy: { name: "asc" } })
        ]);

        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        let adminPlexToken = "";
        if (settings?.mainPlexToken) {
            try { adminPlexToken = decryptData(settings.mainPlexToken); } catch {}
        }
        if (!adminPlexToken) {
            adminPlexToken = process.env.PLEX_TOKEN || process.env.MAIN_PLEX_TOKEN || "";
        }

        // Parse Plex servers
        const mappedPlex: DiscoveredServerInfo[] = [];
        for (const p of plexServers) {
            let allowedLibs: string[] = [];
            if (p.allowedLibraryIds) {
                try {
                    allowedLibs = JSON.parse(p.allowedLibraryIds);
                } catch {
                    allowedLibs = p.allowedLibraryIds.split(",").map((s: string) => s.trim()).filter(Boolean);
                }
            }

            let cached: MediaServerLibrary[] = [];
            if (p.cachedLibraries) {
                try { cached = JSON.parse(p.cachedLibraries); } catch {}
            }

            if (cached.length === 0) {
                try {
                    const token = p.token ? decryptData(p.token) : adminPlexToken;
                    if (token) {
                        const cleanUrl = p.url.replace(/\/+$/, "");
                        const sRes = await fetch(`${cleanUrl}/library/sections`, {
                            headers: { "Accept": "application/json", "X-Plex-Token": token },
                            signal: AbortSignal.timeout(3000)
                        });
                        if (sRes.ok) {
                            const sData = await sRes.json();
                            const dirs = sData.MediaContainer?.Directory || [];
                            cached = dirs.map((d: any) => ({
                                id: String(d.key),
                                title: d.title,
                                type: d.type === "movie" ? "movies" : d.type === "show" ? "tvshows" : d.type === "artist" ? "music" : d.type
                            }));
                            if (cached.length > 0) {
                                await prisma.plexServer.update({
                                    where: { id: p.id },
                                    data: { cachedLibraries: JSON.stringify(cached) }
                                }).catch(() => {});
                            }
                        }
                    }
                } catch (e) {}
            }

            let decToken = "";
            if (p.token) {
                try { decToken = decryptData(p.token); } catch {}
            }

            mappedPlex.push({
                id: p.id,
                name: p.name,
                type: "PLEX",
                url: p.url,
                apiKey: decToken || undefined,
                isActive: true,
                isMonitored: p.monitored,
                allowUserSelfSelect: p.allowUserSelfSelect !== false,
                allowTrialAccess: p.allowTrialAccess === true,
                allowedLibraryIds: allowedLibs,
                cachedLibraries: cached,
                createdAt: p.createdAt,
                updatedAt: p.updatedAt
            });
        }

        // Parse Jellyfin / Emby servers
        const mappedOther: DiscoveredServerInfo[] = mediaServers.map(m => {
            let allowedLibs: string[] = [];
            if (m.allowedLibraryIds) {
                try {
                    allowedLibs = JSON.parse(m.allowedLibraryIds);
                } catch {
                    allowedLibs = m.allowedLibraryIds.split(",").map((s: string) => s.trim()).filter(Boolean);
                }
            }

            let cached: MediaServerLibrary[] = [];
            if (m.cachedLibraries) {
                try { cached = JSON.parse(m.cachedLibraries); } catch {}
            }

            let decKey = "";
            if (m.apiKey) {
                try { decKey = decryptData(m.apiKey); } catch {}
            }

            return {
                id: m.id,
                name: m.name,
                type: m.type.toUpperCase() as "JELLYFIN" | "EMBY",
                url: m.url,
                apiKey: decKey || undefined,
                isActive: m.isActive,
                isMonitored: m.isMonitored,
                allowUserSelfSelect: m.allowUserSelfSelect !== false,
                allowTrialAccess: m.allowTrialAccess === true,
                allowedLibraryIds: allowedLibs,
                cachedLibraries: cached,
                createdAt: m.createdAt,
                updatedAt: m.updatedAt
            };
        });

        return {
            success: true,
            servers: [...mappedPlex, ...mappedOther]
        };
    } catch (err: any) {
        return { success: false, servers: [], error: err.message || "Failed to load media servers" };
    }
}

/**
 * Creates or updates an Emby or Jellyfin server.
 */
export async function saveMediaServerAction(data: {
    id?: string;
    name: string;
    type: "JELLYFIN" | "EMBY";
    url: string;
    apiKey: string;
    isActive?: boolean;
    isMonitored?: boolean;
    allowUserSelfSelect?: boolean;
    allowTrialAccess?: boolean;
    allowedLibraryIds?: string[];
}): Promise<{ success: boolean; server?: any; error?: string }> {
    try {
        await verifySessionAdmin();

        if (!data.name || !data.url || (!data.id && !data.apiKey)) {
            return { success: false, error: "Server name, URL, and API key are required" };
        }

        let encryptedKey = "";
        if (data.apiKey && !data.apiKey.startsWith("enc_") && data.apiKey.trim().length > 0) {
            encryptedKey = encryptData(data.apiKey.trim());
        }

        // Discover libraries
        let rawKey = data.apiKey;
        if (data.id && (!rawKey || rawKey.startsWith("••••"))) {
            const existing = await prisma.mediaServer.findUnique({ where: { id: data.id } });
            if (existing) {
                try { rawKey = decryptData(existing.apiKey); } catch {}
            }
        }

        let libraries: MediaServerLibrary[] = [];
        if (rawKey) {
            libraries = await fetchMediaServerLibraries(data.type, data.url, rawKey);
        }

        const allowedLibStr = data.allowedLibraryIds 
            ? JSON.stringify(data.allowedLibraryIds) 
            : null;

        let server;
        if (data.id) {
            const updatePayload: any = {
                name: data.name,
                type: data.type.toUpperCase(),
                url: data.url,
                isActive: data.isActive !== undefined ? data.isActive : true,
                isMonitored: data.isMonitored !== undefined ? data.isMonitored : true,
                allowUserSelfSelect: data.allowUserSelfSelect !== undefined ? data.allowUserSelfSelect : true,
                allowTrialAccess: data.allowTrialAccess !== undefined ? data.allowTrialAccess : false,
                allowedLibraryIds: allowedLibStr
            };
            if (encryptedKey) updatePayload.apiKey = encryptedKey;
            if (libraries.length > 0) updatePayload.cachedLibraries = JSON.stringify(libraries);

            server = await prisma.mediaServer.update({
                where: { id: data.id },
                data: updatePayload
            });
        } else {
            server = await prisma.mediaServer.create({
                data: {
                    name: data.name,
                    type: data.type.toUpperCase(),
                    url: data.url,
                    apiKey: encryptedKey || encryptData(data.apiKey || ""),
                    isActive: data.isActive !== undefined ? data.isActive : true,
                    isMonitored: data.isMonitored !== undefined ? data.isMonitored : true,
                    allowUserSelfSelect: data.allowUserSelfSelect !== undefined ? data.allowUserSelfSelect : true,
                    allowTrialAccess: data.allowTrialAccess !== undefined ? data.allowTrialAccess : false,
                    allowedLibraryIds: allowedLibStr,
                    cachedLibraries: libraries.length > 0 ? JSON.stringify(libraries) : JSON.stringify([
                        { id: "movies", title: "Movies", type: "movies" },
                        { id: "tvshows", title: "TV Shows", type: "tvshows" }
                    ])
                }
            });
        }

        safeRevalidate("/settings");
        safeRevalidate("/profile");
        return { success: true, server };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to save media server" };
    }
}

/**
 * Removes an Emby or Jellyfin server.
 */
export async function deleteMediaServerAction(id: string): Promise<{ success: boolean; error?: string }> {
    try {
        await verifySessionAdmin();
        await prisma.mediaServer.delete({ where: { id } });
        safeRevalidate("/settings");
        safeRevalidate("/profile");
        clearUserCache("user_media_servers:");
        clearUserCache("user_profile_bootstrap:");
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to delete media server" };
    }
}

/**
 * Tests connection to a Plex, Emby, or Jellyfin server and refreshes its cached libraries.
 */
export async function testMediaServerAction(params: {
    type: "PLEX" | "JELLYFIN" | "EMBY";
    url: string;
    apiKey?: string;
    serverId?: string;
}): Promise<MediaServerConnectionResult & { librariesCount?: number }> {
    try {
        await verifySessionAdmin();

        if (params.type === "PLEX") {
            const start = Date.now();
            let token = "";
            let serverName = "Plex Media Server";

            if (params.serverId) {
                const ps = await prisma.plexServer.findUnique({ where: { id: params.serverId } });
                if (ps) {
                    serverName = ps.name;
                    if (ps.token) {
                        try { token = decryptData(ps.token); } catch {}
                    }
                }
            }
            if (!token) {
                const settings = await prisma.settings.findUnique({ where: { id: "global" } });
                if (settings?.mainPlexToken) {
                    try { token = decryptData(settings.mainPlexToken); } catch {}
                }
            }
            if (!token) {
                token = process.env.PLEX_TOKEN || process.env.MAIN_PLEX_TOKEN || "";
            }

            const cleanUrl = params.url.replace(/\/+$/, "");
            const res = await fetch(`${cleanUrl}/library/sections`, {
                headers: {
                    "Accept": "application/json",
                    "X-Plex-Token": token
                },
                signal: AbortSignal.timeout(5000)
            });
            const latencyMs = Date.now() - start;

            if (!res.ok) {
                return { ok: false, error: `Plex returned HTTP ${res.status}: ${res.statusText}`, latencyMs };
            }

            const data = await res.json();
            const dirs = data.MediaContainer?.Directory || [];
            const libs: MediaServerLibrary[] = dirs.map((d: any) => ({
                id: String(d.key),
                title: d.title,
                type: d.type === "movie" ? "movies" : d.type === "show" ? "tvshows" : d.type === "artist" ? "music" : d.type
            }));

            if (params.serverId && libs.length > 0) {
                await prisma.plexServer.update({
                    where: { id: params.serverId },
                    data: { cachedLibraries: JSON.stringify(libs) }
                });
            }

            return {
                ok: true,
                serverName,
                version: data.MediaContainer?.version || "PMS Online",
                os: "Linux / PMS",
                latencyMs,
                librariesCount: libs.length
            };
        }

        let keyToUse = params.apiKey || "";
        if (!keyToUse && params.serverId) {
            const srv = await prisma.mediaServer.findUnique({ where: { id: params.serverId } });
            if (srv?.apiKey) {
                try { keyToUse = decryptData(srv.apiKey); } catch {}
            }
        }

        if (!keyToUse) {
            return { ok: false, error: "API key is required for testing connection" };
        }

        const res = await testMediaServerConnection(params.type, params.url, keyToUse);
        if (res.ok && params.serverId) {
            // Also refresh cached libraries
            const libs = await fetchMediaServerLibraries(params.type, params.url, keyToUse);
            if (libs.length > 0) {
                await prisma.mediaServer.update({
                    where: { id: params.serverId },
                    data: { cachedLibraries: JSON.stringify(libs) }
                });
            }
            return { ...res, librariesCount: libs.length };
        }
        return res;
    } catch (err: any) {
        return { ok: false, error: err.message || "Connection test failed" };
    }
}

/**
 * Configures the access rules for a specific server (Plex, Jellyfin, or Emby).
 */
export async function updateServerAccessRulesAction(params: {
    serverType: "PLEX" | "JELLYFIN" | "EMBY";
    serverId: string;
    allowUserSelfSelect: boolean;
    allowTrialAccess: boolean;
    allowedLibraryIds: string[];
}): Promise<{ success: boolean; error?: string }> {
    try {
        await verifySessionAdmin();
        const allowedStr = JSON.stringify(params.allowedLibraryIds);

        if (params.serverType === "PLEX") {
            await prisma.plexServer.update({
                where: { id: params.serverId },
                data: {
                    allowUserSelfSelect: params.allowUserSelfSelect,
                    allowTrialAccess: params.allowTrialAccess,
                    allowedLibraryIds: allowedStr
                }
            });
        } else {
            await prisma.mediaServer.update({
                where: { id: params.serverId },
                data: {
                    allowUserSelfSelect: params.allowUserSelfSelect,
                    allowTrialAccess: params.allowTrialAccess,
                    allowedLibraryIds: allowedStr
                }
            });
        }

        safeRevalidate("/settings");
        safeRevalidate("/profile");
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to update server access rules" };
    }
}

// ============================================================================
// --- USER SELF-SERVICE SERVER & LIBRARY SELECTION ---
// ============================================================================

export interface UserAvailableServer {
    serverKey: string; // e.g. "plex:cuid" or "jellyfin:cuid" or "emby:cuid"
    serverId: string;
    serverName: string;
    serverType: "PLEX" | "JELLYFIN" | "EMBY";
    serverUrl?: string;
    isSelected: boolean;
    isLockedForTrial?: boolean;
    allowedLibraries: {
        libraryKey: string; // e.g. "plex:cuid:1" or "jellyfin:cuid:movies"
        id: string;
        title: string;
        type: string;
        isSelected: boolean;
    }[];
}

/**
 * Returns all media servers and libraries that the current user is permitted to see and select.
 */
export async function getUserMediaServersAndLibrariesAction(bypassCache = false): Promise<{
    success: boolean;
    isTrial: boolean;
    servers: UserAvailableServer[];
    selectedServerKeys: string[];
    selectedMediaLibraryKeys: string[];
    jellyfinUsername: string;
    embyUsername: string;
    plexUsername: string;
    plexEmail: string;
    accountPreferences: Record<string, any>;
    error?: string;
}> {
    try {
        const user = await verifySessionUser();
        const isTrial = (user.status === "TRIAL" || user.membershipTier === "TRIAL") && user.role !== "ADMIN";

        // Parse per-user overrides if set by Admin
        let userAllowedServerKeys: string[] | null = null;
        if (user.allowedServerKeys) {
            try {
                userAllowedServerKeys = JSON.parse(user.allowedServerKeys);
            } catch {
                userAllowedServerKeys = user.allowedServerKeys.split(",").map((s: string) => s.trim()).filter(Boolean);
            }
        }

        let userAllowedLibKeys: string[] | null = null;
        if (user.allowedMediaLibraryKeys) {
            try {
                userAllowedLibKeys = JSON.parse(user.allowedMediaLibraryKeys);
            } catch {
                userAllowedLibKeys = user.allowedMediaLibraryKeys.split(",").map((s: string) => s.trim()).filter(Boolean);
            }
        }

        // Parse active selections
        let selectedServerKeys: string[] = [];
        if (user.selectedServerKeys) {
            try {
                selectedServerKeys = JSON.parse(user.selectedServerKeys);
            } catch {
                selectedServerKeys = user.selectedServerKeys.split(",").map((s: string) => s.trim()).filter(Boolean);
            }
        }

        let selectedMediaLibraryKeys: string[] = [];
        if (user.selectedMediaLibraryKeys) {
            try {
                selectedMediaLibraryKeys = JSON.parse(user.selectedMediaLibraryKeys);
            } catch {
                selectedMediaLibraryKeys = user.selectedMediaLibraryKeys.split(",").map((s: string) => s.trim()).filter(Boolean);
            }
        }

        // Account preferences
        let accountPreferences: Record<string, any> = {};
        if (user.accountPreferences) {
            try { accountPreferences = JSON.parse(user.accountPreferences); } catch {}
        }

        // Fetch all servers
        const [plexServers, mediaServers] = await Promise.all([
            prisma.plexServer.findMany({ orderBy: { name: "asc" } }),
            prisma.mediaServer.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
        ]);

        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        let adminPlexToken = "";
        if (settings?.mainPlexToken) {
            try { adminPlexToken = decryptData(settings.mainPlexToken); } catch {}
        }
        if (!adminPlexToken) {
            adminPlexToken = process.env.PLEX_TOKEN || process.env.MAIN_PLEX_TOKEN || "";
        }

        // Discover Plex sections
        let plexDiscoveredSections: any[] = [];
        if (adminPlexToken) {
            try {
                plexDiscoveredSections = await getPlexServerLibrarySections(adminPlexToken, settings?.mainPlexUrl || undefined);
            } catch {}
        }

        const resultServers: UserAvailableServer[] = [];

        // 1. Process Plex Servers
        for (const p of plexServers) {
            const serverKey = `plex:${p.id}`;

            // Check server eligibility
            if (!p.allowUserSelfSelect && user.role !== "ADMIN" && !userAllowedServerKeys?.includes(serverKey)) {
                continue;
            }
            if (userAllowedServerKeys && !userAllowedServerKeys.includes(serverKey) && user.role !== "ADMIN") {
                continue;
            }

            // Exclude Kids & Backup servers from trial users
            if (isTrial) {
                const sLower = p.name.toLowerCase();
                if (sLower.includes("kid") || sLower.includes("backup")) continue;
            }

            // Resolve libraries
            let rawAllowedList: string[] | null = null;
            if (p.allowedLibraryIds) {
                try {
                    rawAllowedList = JSON.parse(p.allowedLibraryIds);
                } catch {
                    rawAllowedList = p.allowedLibraryIds.split(",").map((s: string) => s.trim()).filter(Boolean);
                }
            }

            // Find sections for this server
            const srvMatch = plexDiscoveredSections.find(s => 
                s.serverId === p.clientIdentifier || s.serverName === p.name || s.serverId === p.id
            );
            const liveSections = srvMatch?.sections || [];
            let cachedLibs: MediaServerLibrary[] = [];
            if (p.cachedLibraries) {
                try { cachedLibs = JSON.parse(p.cachedLibraries); } catch {}
            }

            const sectionsPool: Array<{ id: string; title: string; type: string }> = liveSections.length > 0 
                ? liveSections.map((s: any) => ({ id: String(s.id || s.key), title: s.title, type: s.type || "mixed" }))
                : (cachedLibs.length > 0 ? cachedLibs : [
                    { id: "1", title: "Movies", type: "movie" },
                    { id: "2", title: "TV Shows", type: "show" }
                ]);

            const allowedLibraries = sectionsPool
                .filter(sec => {
                    // Check Admin server whitelist
                    if (rawAllowedList && rawAllowedList.length > 0 && !rawAllowedList.includes(sec.id)) {
                        return false;
                    }
                    const libKey = `plex:${p.id}:${sec.id}`;
                    if (userAllowedLibKeys && !userAllowedLibKeys.includes(libKey) && user.role !== "ADMIN") {
                        return false;
                    }
                    if (isTrial && sec.title.toLowerCase().includes("kid")) {
                        return false;
                    }
                    return true;
                })
                .map(sec => {
                    const libKey = `plex:${p.id}:${sec.id}`;
                    const isSelected = selectedMediaLibraryKeys.length > 0 
                        ? selectedMediaLibraryKeys.includes(libKey) || selectedMediaLibraryKeys.includes(sec.id)
                        : true; // Default selected if user has not yet customized
                    return {
                        libraryKey: libKey,
                        id: sec.id,
                        title: sec.title,
                        type: sec.type,
                        isSelected
                    };
                });

            const isServerSelected = selectedServerKeys.length > 0 
                ? selectedServerKeys.includes(serverKey) || selectedServerKeys.includes(p.id)
                : true;

            resultServers.push({
                serverKey,
                serverId: p.id,
                serverName: p.name,
                serverType: "PLEX",
                isSelected: isServerSelected,
                allowedLibraries
            });
        }

        // 2. Process Jellyfin & Emby Servers
        for (const m of mediaServers) {
            const serverType = m.type.toUpperCase() as "JELLYFIN" | "EMBY";
            const serverKey = `${serverType.toLowerCase()}:${m.id}`;

            // Check server eligibility
            if (!m.allowUserSelfSelect && user.role !== "ADMIN" && !userAllowedServerKeys?.includes(serverKey)) {
                continue;
            }
            if (userAllowedServerKeys && !userAllowedServerKeys.includes(serverKey) && user.role !== "ADMIN") {
                continue;
            }

            // Full-Member gating: trial members have Jellyfin/Emby servers locked
            const isLockedForTrial = isTrial && user.role !== "ADMIN" && user.role !== "SUPER_USER";

            let rawAllowedList: string[] | null = null;
            if (m.allowedLibraryIds) {
                try {
                    rawAllowedList = JSON.parse(m.allowedLibraryIds);
                } catch {
                    rawAllowedList = m.allowedLibraryIds.split(",").map((s: string) => s.trim()).filter(Boolean);
                }
            }

            let cachedLibs: MediaServerLibrary[] = [];
            if (m.cachedLibraries) {
                try { cachedLibs = JSON.parse(m.cachedLibraries); } catch {}
            }
            if (cachedLibs.length === 0) {
                cachedLibs = [
                    { id: "movies", title: "Movies", type: "movies" },
                    { id: "tvshows", title: "TV Shows", type: "tvshows" }
                ];
            }

            const allowedLibraries = cachedLibs
                .filter(sec => {
                    if (rawAllowedList && rawAllowedList.length > 0 && !rawAllowedList.includes(sec.id)) {
                        return false;
                    }
                    const libKey = `${serverType.toLowerCase()}:${m.id}:${sec.id}`;
                    if (userAllowedLibKeys && !userAllowedLibKeys.includes(libKey) && user.role !== "ADMIN") {
                        return false;
                    }
                    if (isTrial && sec.title.toLowerCase().includes("kid")) {
                        return false;
                    }
                    return true;
                })
                .map(sec => {
                    const libKey = `${serverType.toLowerCase()}:${m.id}:${sec.id}`;
                    const isSelected = selectedMediaLibraryKeys.length > 0 
                        ? selectedMediaLibraryKeys.includes(libKey) || selectedMediaLibraryKeys.includes(sec.id)
                        : true;
                    return {
                        libraryKey: libKey,
                        id: sec.id,
                        title: sec.title,
                        type: sec.type,
                        isSelected
                    };
                });

            const isServerSelected = !isLockedForTrial && (selectedServerKeys.length > 0 
                ? selectedServerKeys.includes(serverKey) || selectedServerKeys.includes(m.id)
                : true);

            resultServers.push({
                serverKey,
                serverId: m.id,
                serverName: m.name,
                serverType,
                serverUrl: m.url || "",
                isSelected: isServerSelected,
                isLockedForTrial,
                allowedLibraries
            });
        }

        return {
            success: true,
            isTrial,
            servers: resultServers,
            selectedServerKeys: selectedServerKeys.length > 0 ? selectedServerKeys : resultServers.map(s => s.serverKey),
            selectedMediaLibraryKeys: selectedMediaLibraryKeys.length > 0 
                ? selectedMediaLibraryKeys 
                : resultServers.flatMap(s => s.allowedLibraries.map(l => l.libraryKey)),
            jellyfinUsername: user.jellyfinUsername || user.username,
            embyUsername: user.embyUsername || user.username,
            plexUsername: user.plexUsername || "",
            plexEmail: user.plexEmail || user.email || "",
            accountPreferences
        };
    } catch (err: any) {
        return {
            success: false,
            isTrial: false,
            servers: [],
            selectedServerKeys: [],
            selectedMediaLibraryKeys: [],
            jellyfinUsername: "",
            embyUsername: "",
            plexUsername: "",
            plexEmail: "",
            accountPreferences: {},
            error: err.message || "Failed to load user server options"
        };
    }
}

/**
 * Updates the user's active media servers and library choices, strictly validating against the Admin whitelist.
 */
export async function updateUserMediaServersAndLibrariesAction(payload: {
    selectedServerKeys: string[];
    selectedMediaLibraryKeys: string[];
    jellyfinUsername?: string;
    embyUsername?: string;
}): Promise<{
    success: boolean;
    message?: string;
    staged?: boolean;
    error?: string;
}> {
    try {
        const user = await verifySessionUser();

        // 1. Fetch user's authorized whitelist
        const accessData = await getUserMediaServersAndLibrariesAction();
        if (!accessData.success) {
            return { success: false, error: "Failed to verify server authorization" };
        }

        // Full-Member restriction: strictly strip Jellyfin & Emby selections for trial users
        if (accessData.isTrial && user.role !== "ADMIN" && user.role !== "SUPER_USER") {
            payload.selectedServerKeys = payload.selectedServerKeys.filter(k => !k.startsWith("jellyfin:") && !k.startsWith("emby:"));
            payload.selectedMediaLibraryKeys = payload.selectedMediaLibraryKeys.filter(k => !k.startsWith("jellyfin:") && !k.startsWith("emby:"));
        }

        const validServerKeySet = new Set(accessData.servers.map(s => s.serverKey));
        const validLibraryKeySet = new Set(accessData.servers.flatMap(s => s.allowedLibraries.map(l => l.libraryKey)));

        // 2. Strict whitelist filter: strip unauthorized keys
        const filteredServers = (user.role === "ADMIN")
            ? payload.selectedServerKeys
            : payload.selectedServerKeys.filter(k => validServerKeySet.has(k) || Array.from(validServerKeySet).some(vk => vk.endsWith(`:${k}`)));

        const filteredLibraries = (user.role === "ADMIN")
            ? payload.selectedMediaLibraryKeys
            : payload.selectedMediaLibraryKeys.filter(k => validLibraryKeySet.has(k) || Array.from(validLibraryKeySet).some(vk => vk.endsWith(`:${k}`)));

        // Extract legacy Plex section IDs for backwards compatibility
        const plexSections: string[] = [];
        for (const libKey of filteredLibraries) {
            const parts = libKey.split(":");
            if (parts[0] === "plex" && parts[2]) {
                plexSections.push(parts[2]);
            } else if (!libKey.includes(":")) {
                plexSections.push(libKey);
            }
        }

        const updateData: any = {
            selectedServerKeys: JSON.stringify(filteredServers),
            selectedMediaLibraryKeys: JSON.stringify(filteredLibraries),
            selectedPlexLibrarySectionIds: Array.from(new Set(plexSections)).join(",")
        };
        if (payload.jellyfinUsername) updateData.jellyfinUsername = payload.jellyfinUsername.trim();
        if (payload.embyUsername) updateData.embyUsername = payload.embyUsername.trim();

        await prisma.user.update({
            where: { id: user.id },
            data: updateData
        });

        // 3. Check Admin Approval Policy for Plex changes
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        const requireApproval = (settings?.requireApprovalForPlexChanges !== false) && user.role !== "ADMIN";

        if (requireApproval && plexSections.length > 0) {
            await prisma.adminApproval.create({
                data: {
                    type: "PLEX_ACCESS_GRANT",
                    status: "PENDING",
                    title: `Media Server Preferences: ${user.username}`,
                    description: `User updated media server choices (${filteredServers.length} servers, ${filteredLibraries.length} libraries). Staged for approval.`,
                    targetUser: user.username,
                    targetEmail: user.email,
                    userId: user.id,
                    payload: JSON.stringify({
                        userId: user.id,
                        selectedServerKeys: filteredServers,
                        selectedMediaLibraryKeys: filteredLibraries,
                        selectedPlexSections: plexSections
                    })
                }
            });
            logger.addLog("INFO", "APPROVAL", `Media server preference update for "${user.username}" staged in Admin Approval Queue.`);
        } else {
            // Instant Plex sync if configured
            let adminPlexToken = "";
            if (settings?.mainPlexToken) {
                try { adminPlexToken = decryptData(settings.mainPlexToken); } catch {}
            }
            if (!adminPlexToken) {
                adminPlexToken = process.env.PLEX_TOKEN || process.env.MAIN_PLEX_TOKEN || "";
            }
            if (adminPlexToken) {
                syncUserPlexShareInternal(adminPlexToken, user, plexSections).catch(e => 
                    console.warn("[PLEX-SYNC-BG-ERROR]:", e?.message || e)
                );
            }
        }

        // 4. Trigger Jellyfin & Emby sync in background
        const otherServers = await prisma.mediaServer.findMany({ where: { isActive: true } });
        for (const srv of otherServers) {
            const srvType = srv.type.toUpperCase();
            const srvKey = `${srvType.toLowerCase()}:${srv.id}`;
            const isServerEnabled = filteredServers.includes(srvKey) || filteredServers.includes(srv.id);

            // Collect selected libraries for this specific server
            const serverSelectedLibs = filteredLibraries
                .filter(k => k.startsWith(`${srvType.toLowerCase()}:${srv.id}:`))
                .map(k => k.split(":")[2]);

            let decKey = "";
            try { decKey = decryptData(srv.apiKey); } catch {}
            if (decKey) {
                syncUserMediaServerAccess(
                    { id: srv.id, name: srv.name, type: srv.type, url: srv.url, apiKey: decKey },
                    { 
                        id: user.id, 
                        username: (srvType === "JELLYFIN" ? user.jellyfinUsername : user.embyUsername) || user.username,
                        email: user.email,
                        jellyfinUserId: user.jellyfinUserId,
                        embyUserId: user.embyUserId
                    },
                    isServerEnabled,
                    serverSelectedLibs
                ).then(res => {
                    if (res.remoteUserId) {
                        const idField = srvType === "JELLYFIN" ? "jellyfinUserId" : "embyUserId";
                        prisma.user.update({
                            where: { id: user.id },
                            data: { [idField]: res.remoteUserId }
                        }).catch(() => {});
                    }
                }).catch(e => console.warn(`[${srvType}-SYNC-ERROR]:`, e?.message || e));
            }
        }

        safeRevalidate("/profile");
        safeRevalidate("/settings");
        clearUserCache(`user_media_servers:${user.id}`);
        clearUserCache(`user_profile_bootstrap:${user.id}`);

        return {
            success: true,
            staged: requireApproval,
            message: requireApproval
                ? "Your media server preferences have been submitted for administrator approval!"
                : "Your media server & library preferences have been saved and synchronized!"
        };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to update media server selections" };
    }
}

/**
 * Saves extended account and playback preferences for Full Members.
 */
export async function updateUserAccountPreferencesAction(
    preferences: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
    try {
        const user = await verifySessionUser();

        let existing: Record<string, any> = {};
        if (user.accountPreferences) {
            try { existing = JSON.parse(user.accountPreferences); } catch {}
        }

        const merged = { ...existing, ...preferences, updatedAt: new Date().toISOString() };

        await prisma.user.update({
            where: { id: user.id },
            data: {
                accountPreferences: JSON.stringify(merged)
            }
        });

        safeRevalidate("/profile");
        return { success: true };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to update account preferences" };
    }
}
