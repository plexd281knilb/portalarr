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
    ensureUserMediaServerAccount,
    setUserMediaServerPassword,
    authorizeQuickConnect,
    MediaServerLibrary,
    MediaServerConnectionResult
} from "@/lib/media-servers";
export type { MediaServerLibrary, MediaServerConnectionResult } from "@/lib/media-servers";
import { getPlexServerLibrarySections, getUserPlexSharedLibraries, PlexSharedServerItem } from "@/lib/plex";
import { syncUserPlexShareInternal } from "@/app/actions";
import { notifyAdminsOnPendingApproval } from "@/lib/admin-approvals";

/**
 * Helper to match a library section against the admin-configured whitelist.
 * Matches flexibly against Cloud Section ID, PMS Directory Key, or Library Title.
 */
function isLibInWhitelist(
    rawAllowedList: string[] | null | undefined, 
    sec: { id: string | number; key?: string | number; title?: string }
): boolean {
    if (!rawAllowedList || rawAllowedList.length === 0) {
        return true; // Unconfigured whitelist allows all libraries
    }
    if (rawAllowedList.includes("__none__")) {
        return false; // Explicitly no libraries allowed
    }
    const secIdStr = String(sec.id || "").trim();
    const secKeyStr = String(sec.key || "").trim();
    const secTitleLower = (sec.title || "").trim().toLowerCase();

    return rawAllowedList.some(item => {
        const clean = String(item).trim();
        if (!clean || clean === "__none__") return false;
        if (clean === secIdStr) return true;
        if (secKeyStr && clean === secKeyStr) return true;
        if (secTitleLower && clean.toLowerCase() === secTitleLower) return true;
        return false;
    });
}

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
    internalUrl?: string;
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
                internalUrl: m.internalUrl || undefined,
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
    internalUrl?: string;
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

        // Discover libraries (prefer internal LAN URL if provided)
        let rawKey = data.apiKey;
        if (data.id && (!rawKey || rawKey.startsWith("••••"))) {
            const existing = await prisma.mediaServer.findUnique({ where: { id: data.id } });
            if (existing) {
                try { rawKey = decryptData(existing.apiKey); } catch {}
            }
        }

        let libraries: MediaServerLibrary[] = [];
        if (rawKey) {
            libraries = await fetchMediaServerLibraries(data.type, data.url, rawKey, 7000, data.internalUrl);
        }

        const allowedLibStr = data.allowedLibraryIds 
            ? JSON.stringify(data.allowedLibraryIds) 
            : null;

        const cleanInternalUrl = data.internalUrl && data.internalUrl.trim() !== "" ? data.internalUrl.trim() : null;

        let server;
        if (data.id) {
            const updatePayload: any = {
                name: data.name,
                type: data.type.toUpperCase(),
                url: data.url.trim(),
                internalUrl: cleanInternalUrl,
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
                    url: data.url.trim(),
                    internalUrl: cleanInternalUrl,
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
    internalUrl?: string;
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
        let internalUrlToUse = params.internalUrl;
        if (params.serverId) {
            const srv = await prisma.mediaServer.findUnique({ where: { id: params.serverId } });
            if (srv) {
                if (!keyToUse && srv.apiKey) {
                    try { keyToUse = decryptData(srv.apiKey); } catch {}
                }
                if (!internalUrlToUse && srv.internalUrl) {
                    internalUrlToUse = srv.internalUrl;
                }
            }
        }

        if (!keyToUse) {
            return { ok: false, error: "API key is required for testing connection" };
        }

        const res = await testMediaServerConnection(params.type, params.url, keyToUse, 6000, internalUrlToUse);
        if (res.ok && params.serverId) {
            // Also refresh cached libraries
            const libs = await fetchMediaServerLibraries(params.type, params.url, keyToUse, 7000, internalUrlToUse);
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
            let existing = await prisma.plexServer.findFirst({
                where: {
                    OR: [
                        { id: params.serverId },
                        { clientIdentifier: params.serverId },
                        { name: params.serverId }
                    ]
                }
            });

            if (existing) {
                await prisma.plexServer.update({
                    where: { id: existing.id },
                    data: {
                        allowUserSelfSelect: params.allowUserSelfSelect,
                        allowTrialAccess: params.allowTrialAccess,
                        allowedLibraryIds: allowedStr
                    }
                });
            } else {
                const fallback = await prisma.plexServer.findFirst({ orderBy: { isDefault: "desc" } });
                if (fallback) {
                    await prisma.plexServer.update({
                        where: { id: fallback.id },
                        data: {
                            allowUserSelfSelect: params.allowUserSelfSelect,
                            allowTrialAccess: params.allowTrialAccess,
                            allowedLibraryIds: allowedStr
                        }
                    });
                } else {
                    return { success: false, error: `Plex server "${params.serverId}" not found in database.` };
                }
            }
        } else {
            let existing = await prisma.mediaServer.findFirst({
                where: {
                    OR: [
                        { id: params.serverId },
                        { name: params.serverId }
                    ]
                }
            });

            if (existing) {
                await prisma.mediaServer.update({
                    where: { id: existing.id },
                    data: {
                        allowUserSelfSelect: params.allowUserSelfSelect,
                        allowTrialAccess: params.allowTrialAccess,
                        allowedLibraryIds: allowedStr
                    }
                });
            } else {
                return { success: false, error: `${params.serverType} server "${params.serverId}" not found in database.` };
            }
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

        // Parse user enabled add-ons
        let userAddons: string[] = [];
        if (user.enabledAddons) {
            try { userAddons = JSON.parse(user.enabledAddons); } catch {}
        }
        const hasJellyfinAddon = userAddons.includes("jellyfin_access");
        const hasEmbyAddon = userAddons.includes("emby_access");
        const hasAudiobooksAddon = userAddons.includes("audiobooks") || userAddons.includes("books_audiobooks");

        const hasExplicitSelectedServers = selectedServerKeys.length > 0;
        const hasExplicitSelectedLibs = selectedMediaLibraryKeys.length > 0;

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

        // Discover Plex sections & live user shares
        let plexDiscoveredSections: any[] = [];
        let livePlexShareRes: { matchedShares: PlexSharedServerItem[]; selectedKeys: string[]; hasPlexShare: boolean } = {
            matchedShares: [],
            selectedKeys: [],
            hasPlexShare: false
        };

        if (adminPlexToken) {
            try {
                const [discovered, shareRes] = await Promise.all([
                    getPlexServerLibrarySections(adminPlexToken, settings?.mainPlexUrl || undefined).catch(() => []),
                    getUserPlexSharedLibraries(adminPlexToken, user).catch(() => ({ matchedShares: [], selectedKeys: [], hasPlexShare: false }))
                ]);
                plexDiscoveredSections = discovered || [];
                livePlexShareRes = shareRes || { matchedShares: [], selectedKeys: [], hasPlexShare: false };
            } catch {}
        }

        const userSavedPlexSectionIds = (user.selectedPlexLibrarySectionIds || "").split(",").map((s: string) => s.trim()).filter(Boolean);
        const userPlexSectionIds = (user.plexLibrarySectionIds || "").split(",").map((s: string) => s.trim()).filter(Boolean);

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

            const sectionsPool: Array<{ id: string; key: string; title: string; type: string }> = liveSections.length > 0 
                ? liveSections.map((s: any) => ({ 
                    id: String(s.id || s.key || ""), 
                    key: String(s.key || s.id || ""), 
                    title: s.title || "Untitled Library", 
                    type: s.type || "mixed" 
                  }))
                : (cachedLibs.length > 0 
                    ? cachedLibs.map(l => ({ id: String(l.id), key: String(l.id), title: l.title, type: l.type }))
                    : [
                        { id: "1", key: "1", title: "Movies", type: "movie" },
                        { id: "2", key: "2", title: "TV Shows", type: "show" }
                    ]);

            // Find live share on Plex for this server
            const liveShare = livePlexShareRes.matchedShares.find(s => 
                (s.serverId && p.clientIdentifier && s.serverId.toLowerCase() === p.clientIdentifier.toLowerCase()) ||
                (s.serverName && p.name && s.serverName.toLowerCase() === p.name.toLowerCase()) ||
                (s.serverId && p.id && s.serverId.toLowerCase() === p.id.toLowerCase())
            );
            const hasLiveShareOnServer = Boolean(liveShare);

            // Check if user has saved sections in DB for this server
            const hasSavedSectionsOnServer = sectionsPool.some(sec => {
                const uKey = `${p.clientIdentifier || p.id}:${sec.id}`;
                const pKey = `plex:${p.id}:${sec.id}`;
                return userSavedPlexSectionIds.includes(uKey) || 
                       userSavedPlexSectionIds.includes(String(sec.id)) ||
                       userPlexSectionIds.includes(uKey) ||
                       userPlexSectionIds.includes(String(sec.id)) ||
                       selectedMediaLibraryKeys.includes(pKey);
            });

            // Determine if this Plex server is selected:
            let isServerSelected = false;
            if (livePlexShareRes.hasPlexShare) {
                // Live ground truth from Plex Cloud:
                // If user is actively shared on this PMS in Plex, it is selected!
                if (hasLiveShareOnServer) {
                    isServerSelected = true;
                } else if (hasExplicitSelectedServers) {
                    isServerSelected = selectedServerKeys.includes(serverKey) || selectedServerKeys.includes(p.id);
                } else {
                    const isExplicitlyAllowed = Boolean(userAllowedServerKeys?.includes(serverKey) || userAllowedServerKeys?.includes(p.id));
                    isServerSelected = Boolean(isExplicitlyAllowed || user.role === "ADMIN");
                }
            } else {
                // Offline / fallback when live Plex Cloud share list is unavailable
                if (hasExplicitSelectedServers) {
                    isServerSelected = selectedServerKeys.includes(serverKey) || selectedServerKeys.includes(p.id) || hasSavedSectionsOnServer;
                } else {
                    const isExplicitlyAllowed = Boolean(userAllowedServerKeys?.includes(serverKey) || userAllowedServerKeys?.includes(p.id));
                    const isMainServer = p.name.toLowerCase().includes("main") || (settings?.mainPlexUrl && p.url === settings.mainPlexUrl) || (plexServers.length === 1);
                    isServerSelected = Boolean(hasSavedSectionsOnServer || isExplicitlyAllowed || isMainServer || user.role === "ADMIN");
                }
            }

            const allowedLibraries = sectionsPool
                .filter(sec => {
                    // Check Admin server whitelist flexibly matching key, cloud id, or title
                    if (!isLibInWhitelist(rawAllowedList, sec)) {
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
                    let isSelected = false;

                    if (isServerSelected) {
                        const isAudiobook = sec.title.toLowerCase().includes("audiobook") || sec.title.toLowerCase().includes("audio book");
                        if (liveShare) {
                            if (liveShare.allLibraries) {
                                isSelected = isAudiobook ? hasAudiobooksAddon : true;
                            } else {
                                const secIdNum = parseInt(sec.id, 10);
                                const secKeyNum = (sec as any).key ? parseInt((sec as any).key, 10) : NaN;
                                const isSharedInPlex = liveShare.librarySectionIds.includes(secIdNum) ||
                                    (!isNaN(secKeyNum) && liveShare.librarySectionIds.includes(secKeyNum)) ||
                                    liveShare.librarySectionIds.some(id => String(id) === String(sec.id) || String(id) === String((sec as any).key));
                                isSelected = isSharedInPlex;
                            }
                        } else if (hasExplicitSelectedLibs) {
                            const uKey = `${p.clientIdentifier || p.id}:${sec.id}`;
                            isSelected = selectedMediaLibraryKeys.includes(libKey) || 
                                         selectedMediaLibraryKeys.includes(sec.id) ||
                                         userSavedPlexSectionIds.includes(uKey) ||
                                         userSavedPlexSectionIds.includes(String(sec.id));
                        } else {
                            isSelected = isAudiobook ? hasAudiobooksAddon : true;
                        }
                    }

                    return {
                        libraryKey: libKey,
                        id: sec.id,
                        title: sec.title,
                        type: sec.type,
                        isSelected
                    };
                });

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

            // Determine if the server is actively granted/selected for this user:
            let isServerSelected = false;
            if (!isLockedForTrial) {
                if (hasExplicitSelectedServers) {
                    isServerSelected = selectedServerKeys.includes(serverKey) || selectedServerKeys.includes(m.id);
                } else {
                    // Check if user has explicit access to this Jellyfin/Emby server:
                    // 1. Admin per-user allowed server keys
                    const isExplicitlyAllowed = Boolean(userAllowedServerKeys?.includes(serverKey) || userAllowedServerKeys?.includes(m.id));
                    // 2. User already has a provisioned remote user ID
                    const hasRemoteUserId = Boolean(serverType === "JELLYFIN" ? user.jellyfinUserId : user.embyUserId);

                    isServerSelected = Boolean(isExplicitlyAllowed || hasRemoteUserId || (user.role === "ADMIN"));
                }
            }

            const allowedLibraries = cachedLibs
                .filter(sec => {
                    if (!isLibInWhitelist(rawAllowedList, sec)) {
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
                    let isSelected = false;
                    if (isServerSelected) {
                        if (hasExplicitSelectedLibs) {
                            isSelected = selectedMediaLibraryKeys.includes(libKey) || selectedMediaLibraryKeys.includes(sec.id);
                        } else {
                            isSelected = true;
                        }
                    }
                    return {
                        libraryKey: libKey,
                        id: sec.id,
                        title: sec.title,
                        type: sec.type,
                        isSelected
                    };
                });

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

        const activeServerKeys = resultServers.filter(s => s.isSelected).map(s => s.serverKey);
        const activeLibraryKeys = resultServers.flatMap(s => s.allowedLibraries.filter(l => l.isSelected).map(l => l.libraryKey));

        return {
            success: true,
            isTrial,
            servers: resultServers,
            selectedServerKeys: activeServerKeys,
            selectedMediaLibraryKeys: activeLibraryKeys,
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

        // Extract Plex target keys with server machine identifiers to preserve multi-server integrity
        const allPlexServers = await prisma.plexServer.findMany();
        const plexServerMap = new Map(allPlexServers.map(s => [s.id, s.clientIdentifier || s.id]));

        const plexTargetKeys: string[] = [];
        const legacyPlexSectionIds: string[] = [];

        for (const libKey of filteredLibraries) {
            const parts = libKey.split(":");
            if (parts[0] === "plex" && parts[2]) {
                const srvPrismaId = parts[1];
                const secId = parts[2];
                const srvMachineId = plexServerMap.get(srvPrismaId) || srvPrismaId;
                plexTargetKeys.push(`${srvMachineId}:${secId}`);
                legacyPlexSectionIds.push(secId);
            } else if (!libKey.includes(":")) {
                plexTargetKeys.push(libKey);
                legacyPlexSectionIds.push(libKey);
            }
        }

        const updateData: any = {
            selectedServerKeys: JSON.stringify(filteredServers),
            selectedMediaLibraryKeys: JSON.stringify(filteredLibraries),
            selectedPlexLibrarySectionIds: Array.from(new Set([...plexTargetKeys, ...legacyPlexSectionIds])).join(",")
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

        if (requireApproval && plexTargetKeys.length > 0) {
            const approval = await prisma.adminApproval.create({
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
                        selectedPlexSections: plexTargetKeys,
                        selectedKeys: plexTargetKeys
                    })
                }
            });
            logger.addLog("INFO", "APPROVAL", `Media server preference update for "${user.username}" staged in Admin Approval Queue (ID: ${approval.id}).`);
            notifyAdminsOnPendingApproval(approval).catch(e => console.warn("[APPROVAL-NOTIFY-ERROR]:", e?.message || e));
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
                syncUserPlexShareInternal(adminPlexToken, user, plexTargetKeys).catch(e => 
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

/**
 * Ensures the currently authenticated Full Member is provisioned on a Jellyfin or Emby media server.
 * Creates the user account on the server if not already present, applies library whitelist policies,
 * and updates prisma.user with their remote ID.
 */
export async function ensureUserMediaServerProvisionedAction(
    serverId?: string
): Promise<{
    success: boolean;
    serverName?: string;
    serverType?: string;
    serverUrl?: string;
    username?: string;
    remoteUserId?: string;
    created?: boolean;
    message?: string;
    error?: string;
}> {
    try {
        const user = await verifySessionUser();

        // Strict Full Member gating
        const isTrial = user.role === "TRIAL" || user.status === "TRIAL" || user.membershipTier === "TRIAL";
        if (isTrial) {
            return {
                success: false,
                error: "Jellyfin & Emby multi-platform streaming is exclusively available for Full Members. Upgrade your membership pass to unlock."
            };
        }

        // Find target server: by specific ID, or find first active Jellyfin/Emby server
        let srv = null;
        if (serverId) {
            srv = await prisma.mediaServer.findUnique({ where: { id: serverId } });
        }
        if (!srv) {
            srv = await prisma.mediaServer.findFirst({
                where: { isActive: true, type: { in: ["JELLYFIN", "EMBY"] } },
                orderBy: { createdAt: "asc" }
            });
        }

        if (!srv) {
            return { success: false, error: "No active Jellyfin or Emby media server found." };
        }

        let decKey = "";
        try { decKey = decryptData(srv.apiKey); } catch {}
        if (!decKey) {
            return { success: false, error: "Failed to decrypt media server API key." };
        }

        const srvType = srv.type.toUpperCase();
        const username = (srvType === "JELLYFIN" ? user.jellyfinUsername : user.embyUsername) || user.username;

        // Parse allowed libraries whitelist
        let allowedLibIds: string[] = [];
        if (srv.allowedLibraryIds) {
            try {
                const parsed = JSON.parse(srv.allowedLibraryIds);
                if (Array.isArray(parsed)) allowedLibIds = parsed.filter(x => x !== "__none__");
            } catch {
                allowedLibIds = srv.allowedLibraryIds.split(",").map(s => s.trim()).filter(x => x && x !== "__none__");
            }
        }

        const res = await ensureUserMediaServerAccount(
            { id: srv.id, name: srv.name, type: srv.type, url: srv.url, internalUrl: srv.internalUrl, apiKey: decKey },
            { 
                id: user.id, 
                username, 
                email: user.email, 
                jellyfinUserId: user.jellyfinUserId, 
                embyUserId: user.embyUserId 
            },
            allowedLibIds
        );

        if (!res.success) {
            return { success: false, error: res.error || `Failed to provision user on ${srv.name}` };
        }

        // Save remote user ID on prisma.user
        const idField = srvType === "JELLYFIN" ? "jellyfinUserId" : "embyUserId";
        const updateData: any = { [idField]: res.remoteUserId };

        // Ensure server is present in user's selectedServerKeys
        const srvKey = `${srvType.toLowerCase()}:${srv.id}`;
        let selectedKeys: string[] = [];
        if (user.selectedServerKeys) {
            try {
                const p = JSON.parse(user.selectedServerKeys);
                if (Array.isArray(p)) selectedKeys = p;
            } catch {
                selectedKeys = user.selectedServerKeys.split(",").map((s: string) => s.trim()).filter(Boolean);
            }
        }
        if (!selectedKeys.includes(srvKey) && !selectedKeys.includes(srv.id)) {
            selectedKeys.push(srvKey);
            updateData.selectedServerKeys = JSON.stringify(selectedKeys);
        }

        await prisma.user.update({
            where: { id: user.id },
            data: updateData
        });

        safeRevalidate("/profile");
        safeRevalidate("/settings");
        clearUserCache(`user_media_servers:${user.id}`);
        clearUserCache(`user_profile_bootstrap:${user.id}`);

        logger.addLog("SUCCESS", "MEDIA_SERVER", `Provisioned user "${username}" on ${srv.name} (${srvType}) [ID: ${res.remoteUserId}, Created: ${res.created}]`);

        return {
            success: true,
            serverName: srv.name,
            serverType: srv.type,
            serverUrl: srv.url,
            username,
            remoteUserId: res.remoteUserId,
            created: res.created,
            message: res.created 
                ? `Account "${username}" successfully created on ${srv.name} with no initial password!`
                : `Account "${username}" is active and synced on ${srv.name}.`
        };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to provision user account" };
    }
}

/**
 * Allows a Full Member to set or update their dedicated streaming password on Jellyfin or Emby.
 */
export async function setUserMediaServerPasswordAction(
    serverId: string,
    newPassword: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const user = await verifySessionUser();

        // Strict Full Member gating
        const isTrial = user.role === "TRIAL" || user.status === "TRIAL" || user.membershipTier === "TRIAL";
        if (isTrial) {
            return {
                success: false,
                error: "Jellyfin & Emby multi-platform streaming is exclusively available for Full Members."
            };
        }

        const trimmedPassword = (newPassword || "").trim();
        if (trimmedPassword.length < 4) {
            return { success: false, error: "Password must be at least 4 characters long." };
        }

        const srv = await prisma.mediaServer.findUnique({ where: { id: serverId } });
        if (!srv) {
            return { success: false, error: "Media server not found." };
        }

        let decKey = "";
        try { decKey = decryptData(srv.apiKey); } catch {}
        if (!decKey) {
            return { success: false, error: "Failed to decrypt media server API key." };
        }

        const srvType = srv.type.toUpperCase();
        let remoteUserId = srvType === "JELLYFIN" ? user.jellyfinUserId : user.embyUserId;

        // If user not yet provisioned, provision them first
        if (!remoteUserId) {
            const provRes = await ensureUserMediaServerProvisionedAction(srv.id);
            if (!provRes.success || !provRes.remoteUserId) {
                return { success: false, error: provRes.error || "Failed to initialize account on media server." };
            }
            remoteUserId = provRes.remoteUserId;
        }

        const passRes = await setUserMediaServerPassword(srv.url, decKey, remoteUserId, trimmedPassword, srv.internalUrl);
        if (!passRes.success) {
            return { success: false, error: passRes.error || "Failed to set streaming password." };
        }

        logger.addLog("SUCCESS", "MEDIA_SERVER", `Updated streaming password for user "${user.username}" on ${srv.name}`);
        return {
            success: true,
            message: `Streaming password set successfully on ${srv.name}! You can now use this password across all your ${srvType} player apps.`
        };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to set streaming password" };
    }
}

/**
 * Administrator bulk action: Provisions all active Full Members to a specified Jellyfin or Emby server.
 */
export async function provisionAllUsersToMediaServerAction(
    serverId: string
): Promise<{ success: boolean; count?: number; total?: number; message?: string; error?: string }> {
    try {
        await verifySessionAdmin();

        const srv = await prisma.mediaServer.findUnique({ where: { id: serverId } });
        if (!srv) {
            return { success: false, error: "Media server not found." };
        }

        let decKey = "";
        try { decKey = decryptData(srv.apiKey); } catch {}
        if (!decKey) {
            return { success: false, error: "Failed to decrypt media server API key." };
        }

        const srvType = srv.type.toUpperCase();

        // Parse allowed libraries whitelist
        let allowedLibIds: string[] = [];
        if (srv.allowedLibraryIds) {
            try {
                const parsed = JSON.parse(srv.allowedLibraryIds);
                if (Array.isArray(parsed)) allowedLibIds = parsed.filter(x => x !== "__none__");
            } catch {
                allowedLibIds = srv.allowedLibraryIds.split(",").map(s => s.trim()).filter(x => x && x !== "__none__");
            }
        }

        // Query all approved Full Members (excluding trial users)
        const eligibleUsers = await prisma.user.findMany({
            where: {
                status: "APPROVED",
                role: { not: "TRIAL" },
                membershipTier: { not: "TRIAL" }
            }
        });

        let successCount = 0;
        for (const u of eligibleUsers) {
            const username = (srvType === "JELLYFIN" ? u.jellyfinUsername : u.embyUsername) || u.username;
            try {
                const res = await ensureUserMediaServerAccount(
                    { id: srv.id, name: srv.name, type: srv.type, url: srv.url, internalUrl: srv.internalUrl, apiKey: decKey },
                    { 
                        id: u.id, 
                        username, 
                        email: u.email, 
                        jellyfinUserId: u.jellyfinUserId, 
                        embyUserId: u.embyUserId 
                    },
                    allowedLibIds
                );
                if (res.success && res.remoteUserId) {
                    const idField = srvType === "JELLYFIN" ? "jellyfinUserId" : "embyUserId";
                    await prisma.user.update({
                        where: { id: u.id },
                        data: { [idField]: res.remoteUserId }
                    });
                    successCount++;
                }
            } catch (err) {
                console.warn(`[BULK-PROV-ERROR] User "${u.username}":`, err);
            }
        }

        safeRevalidate("/settings");
        safeRevalidate("/profile");
        logger.addLog("SUCCESS", "MEDIA_SERVER", `Admin bulk-provisioned ${successCount}/${eligibleUsers.length} full members to ${srv.name}`);

        return {
            success: true,
            count: successCount,
            total: eligibleUsers.length,
            message: `Successfully provisioned & synchronized ${successCount} of ${eligibleUsers.length} Full Members to ${srv.name}!`
        };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to bulk provision users" };
    }
}

/**
 * Allows an authenticated Full Member to authorize a Quick Connect code shown on their TV/device.
 */
export async function authorizeMediaServerQuickConnectAction(
    serverId: string | undefined,
    code: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        const user = await verifySessionUser();

        // Strict Full Member gating
        const isTrial = user.role === "TRIAL" || user.status === "TRIAL" || user.membershipTier === "TRIAL";
        if (isTrial) {
            return {
                success: false,
                error: "Jellyfin & Emby multi-platform streaming is exclusively available for Full Members."
            };
        }

        const cleanCode = (code || "").trim().toUpperCase();
        if (!cleanCode || cleanCode.length < 3) {
            return { success: false, error: "Please enter a valid Quick Connect code from your TV screen." };
        }

        let srv = null;
        if (serverId) {
            srv = await prisma.mediaServer.findUnique({ where: { id: serverId } });
        }
        if (!srv) {
            srv = await prisma.mediaServer.findFirst({ where: { type: "JELLYFIN", isActive: true } });
        }
        if (!srv) {
            srv = await prisma.mediaServer.findFirst({ where: { isActive: true } });
        }
        if (!srv) {
            return { success: false, error: "No active Jellyfin or Emby server found." };
        }

        let decKey = "";
        try { decKey = decryptData(srv.apiKey); } catch {}
        if (!decKey) {
            return { success: false, error: "Failed to decrypt media server API key." };
        }

        const srvType = srv.type.toUpperCase();
        let remoteUserId = srvType === "JELLYFIN" ? user.jellyfinUserId : user.embyUserId;

        // Auto-provision if needed
        if (!remoteUserId) {
            const provRes = await ensureUserMediaServerProvisionedAction(srv.id);
            if (!provRes.success || !provRes.remoteUserId) {
                return { success: false, error: provRes.error || "Failed to initialize account on media server." };
            }
            remoteUserId = provRes.remoteUserId;
        }

        const res = await authorizeQuickConnect(
            { url: srv.url, internalUrl: srv.internalUrl, apiKey: decKey },
            cleanCode,
            remoteUserId
        );

        if (res.success) {
            logger.addLog("SUCCESS", "MEDIA_SERVER", `Authorized Quick Connect code "${cleanCode}" for user "${user.username}" on ${srv.name}`);
        } else {
            logger.addLog("WARN", "MEDIA_SERVER", `Failed to authorize Quick Connect code "${cleanCode}" for user "${user.username}": ${res.error}`);
        }

        return res;
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to authorize Quick Connect" };
    }
}
