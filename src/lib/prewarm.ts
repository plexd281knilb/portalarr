/**
 * Portalarr High-Performance Prewarming & SWR Memory Cache Engine
 * 
 * Provides:
 * 1. Global Prewarm: Warm Discovery carousels, Plex cluster sessions, Glances hardware,
 *    and Docker container fleet on server boot, periodic cron, and 1-click admin command.
 * 2. Personalized User Prewarm: Asynchronously prewarms user request quotas, active stream
 *    diagnostics, transcode doctor alerts, book library access, and Plex hub telemetry
 *    the instant a user logs in or visits the site.
 */

import { prisma } from "@/lib/prisma";

// --- IN-MEMORY SWR USER CACHE ---
interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttlMs: number;
}

const userCache = new Map<string, CacheEntry<any>>();
const lastUserPrewarmTimes = new Map<string, number>();
let lastGlobalPrewarmTime = 0;
let isGlobalPrewarming = false;

// Default TTLs
const DEFAULT_USER_CACHE_TTL = 3 * 60 * 1000; // 3 minutes fresh
const USER_PREWARM_DEBOUNCE_MS = 3 * 60 * 1000; // 3 minutes debounce per user session

/**
 * Retrieve cached user-scoped or system-scoped item from RAM
 */
export function getUserCache<T>(key: string): T | null {
    const entry = userCache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttlMs) {
        userCache.delete(key);
        return null;
    }
    return entry.data as T;
}

/**
 * Store user-scoped or system-scoped item in RAM
 */
export function setUserCache<T>(key: string, data: T, ttlMs: number = DEFAULT_USER_CACHE_TTL): void {
    userCache.set(key, {
        data,
        timestamp: Date.now(),
        ttlMs
    });
}

/**
 * Invalidate a specific cache key or all keys matching a prefix
 */
export function clearUserCache(keyOrPrefix?: string): void {
    if (!keyOrPrefix) {
        userCache.clear();
        return;
    }
    for (const k of Array.from(userCache.keys())) {
        if (k === keyOrPrefix || k.startsWith(keyOrPrefix)) {
            userCache.delete(k);
        }
    }
}

/**
 * Prewarms personal data for an individual user:
 * - Request Quota (Movies & TV shows remaining)
 * - AI Server Assistant diagnostic snapshot (active streams & issues)
 * - Proactive Stream Quality Doctor transcode alert
 * - Book Library Access permission
 * - Personal MyPlexHub watch stats and active sessions
 */
export async function prewarmUserSession(user: {
    id: string;
    username: string;
    role?: string;
    email?: string;
    status?: string;
    isImpersonating?: boolean;
}): Promise<{ success: boolean; warmedItems: string[] }> {
    const safeUsername = (user.username || "").trim();
    if (!safeUsername) return { success: false, warmedItems: [] };

    const userId = user.id;
    const userRole = user.role || "USER";
    const userKey = safeUsername.toLowerCase();
    const warmedItems: string[] = [];

    // Debounce checks: don't re-run prewarm if run within the last 3 minutes
    const lastTime = lastUserPrewarmTimes.get(userId) || 0;
    if (Date.now() - lastTime < USER_PREWARM_DEBOUNCE_MS) {
        return { success: true, warmedItems: ["skipped_debounced"] };
    }
    lastUserPrewarmTimes.set(userId, Date.now());

    // Update lastLogin to record site visit activity (debounced per user session)
    if (!user.isImpersonating) {
        prisma.user.update({
            where: { id: userId },
            data: { lastLogin: new Date() }
        }).catch((e) => {
            console.warn("[PREWARM] Failed to update lastLogin on site visit:", e);
        });
    }

    const tasks: Array<Promise<any>> = [];

    // 1. Prewarm User Request Quota
    tasks.push((async () => {
        try {
            const { getUserRequestQuotaAction } = await import("@/app/seerr-actions");
            // Direct compute and warm into cache
            const quotaRes = await getUserRequestQuotaAction();
            if (quotaRes && quotaRes.success && quotaRes.data) {
                setUserCache(`user_quota:${userId}`, quotaRes.data, DEFAULT_USER_CACHE_TTL);
                warmedItems.push("quota");
            }
        } catch (e: any) {
            // Silently log
        }
    })());

    // 2. Prewarm AI Server Assistant Diagnostic Snapshot
    tasks.push((async () => {
        try {
            const { getUserDiagnosticSnapshot } = await import("@/lib/ai-server-assistant");
            const snapshot = await getUserDiagnosticSnapshot({
                id: userId,
                username: safeUsername,
                email: user.email,
                role: userRole
            });
            if (snapshot) {
                setUserCache(`user_diag_snapshot:${userKey}`, snapshot, DEFAULT_USER_CACHE_TTL);
                warmedItems.push("ai_snapshot");
            }
        } catch (e) {}
    })());

    // 3. Prewarm Proactive Stream Quality Doctor Alert
    tasks.push((async () => {
        try {
            const { getUserTranscodeAlert } = await import("@/lib/telemetry/device-diagnostics");
            const alert = await getUserTranscodeAlert(safeUsername, user.email);
            if (alert) {
                setUserCache(`user_transcode_alert:${userKey}`, alert, DEFAULT_USER_CACHE_TTL);
                warmedItems.push("transcode_alert");
            }
        } catch (e) {}
    })());

    // 4. Prewarm Book Library Access Permission
    tasks.push((async () => {
        try {
            if (userRole === "ADMIN") {
                setUserCache(`user_lib_access:${userId}`, true, DEFAULT_USER_CACHE_TTL);
                warmedItems.push("library_access");
                return;
            }
            if ((user.status === "TRIAL" || (user as any).isTrial === true) && user.status !== "APPROVED") {
                setUserCache(`user_lib_access:${userId}`, false, DEFAULT_USER_CACHE_TTL);
                warmedItems.push("library_access");
                return;
            }

            const dbUser = await prisma.user.findUnique({
                where: { id: userId },
                select: { kindleEmail: true }
            });
            if (!dbUser?.kindleEmail || dbUser.kindleEmail.trim() === "") {
                setUserCache(`user_lib_access:${userId}`, false, DEFAULT_USER_CACHE_TTL);
                warmedItems.push("library_access");
                return;
            }

            const libs = await prisma.library.findMany().catch(() => []);
            const hasAccess = libs.some(lib => {
                const restricted = (lib.restrictedUsers || "").split(",").map(u => u.trim().toLowerCase());
                if (restricted.includes(userKey)) return false;
                if (lib.allowedUsers === "*") return true;
                const users = lib.allowedUsers.split(",").map(u => u.trim().toLowerCase());
                return users.includes(userKey);
            });

            setUserCache(`user_lib_access:${userId}`, hasAccess, DEFAULT_USER_CACHE_TTL);
            warmedItems.push("library_access");
        } catch (e) {}
    })());

    // 5. Prewarm Personal MyPlexHub Telemetry
    tasks.push((async () => {
        try {
            const { getUserPlexHubData } = await import("@/app/actions");
            const hubData = await getUserPlexHubData();
            if (hubData && hubData.success) {
                setUserCache(`user_plex_hub:${userKey}`, hubData, DEFAULT_USER_CACHE_TTL);
                warmedItems.push("plex_hub");
            }
        } catch (e) {}
    })());

    // 6. Prewarm User Profile Bootstrap (Account Settings Page)
    tasks.push((async () => {
        try {
            const { getUserProfileBootstrapAction } = await import("@/app/actions");
            const bootstrap = await getUserProfileBootstrapAction(true);
            if (bootstrap && bootstrap.success) {
                warmedItems.push("profile_bootstrap");
            }
        } catch (e) {}
    })());

    // 7. Prewarm User Media Servers & Libraries (Multi-Server Self-Selection)
    tasks.push((async () => {
        try {
            const { getUserMediaServersAndLibrariesAction } = await import("@/app/media-server-actions");
            const srvs = await getUserMediaServersAndLibrariesAction(true);
            if (srvs && srvs.success) {
                warmedItems.push("media_servers");
            }
        } catch (e) {}
    })());

    // 8. Admin / Super User Extra Prewarming
    if (userRole === "ADMIN" || userRole === "SUPER_USER") {
        tasks.push((async () => {
            try {
                const { getAdminDetailedStreamsAction } = await import("@/app/actions");
                const streams = await getAdminDetailedStreamsAction(true);
                if (streams && streams.success) {
                    setUserCache("admin_detailed_streams", streams, 30000); // 30s fresh
                    warmedItems.push("admin_streams");
                }
            } catch (e) {}
        })());
    }

    await Promise.allSettled(tasks);
    return { success: true, warmedItems };
}

/**
 * Prewarms global system caches:
 * - TMDb Discovery carousels (Trending, Popular, Upcoming, Kids)
 * - Plex availability GUID index
 * - System Landing Stats (Plex, Glances, Media Apps reachability)
 * - Discovery Home full payloads (Main & Kids)
 */
export async function prewarmGlobalSystem(): Promise<{
    success: boolean;
    durationMs: number;
    warmedKeys: string[];
}> {
    if (isGlobalPrewarming) {
        return { success: true, durationMs: 0, warmedKeys: ["already_running"] };
    }

    const startTime = Date.now();
    isGlobalPrewarming = true;
    const warmedKeys: string[] = [];

    try {
        const tasks: Array<Promise<any>> = [];

        // 1. Prewarm Discovery Media Caches (RAM + Disk)
        tasks.push((async () => {
            try {
                const { prewarmDiscoverCachesInternal } = await import("@/lib/seerr/media-cache");
                const res = await prewarmDiscoverCachesInternal();
                if (res.success) {
                    warmedKeys.push(`discovery_categories (${res.warmedKeys})`);
                }
            } catch (e) {}
        })());

        // 2. Prewarm Discovery Home Payloads (Main & Kids)
        tasks.push((async () => {
            try {
                const { getDiscoverHomeAction } = await import("@/app/seerr-actions");
                await Promise.allSettled([
                    getDiscoverHomeAction("main"),
                    getDiscoverHomeAction("kids")
                ]);
                warmedKeys.push("discover_home_sections");
            } catch (e) {}
        })());

        // 3. Prewarm Plex Availability GUID Index
        tasks.push((async () => {
            try {
                const { getPlexLibraryGuidIndex } = await import("@/lib/seerr/availability");
                await getPlexLibraryGuidIndex();
                warmedKeys.push("plex_guid_index");
            } catch (e) {}
        })());

        // 4. Prewarm System Landing Stats
        tasks.push((async () => {
            try {
                const { getLandingStats } = await import("@/app/actions");
                const stats = await getLandingStats();
                if (stats) {
                    setUserCache("system_landing_stats", stats, 10000); // 10s fresh
                    warmedKeys.push("landing_stats");
                }
            } catch (e) {}
        })());

        // 5. Prewarm Active Plex Streams & Glances Hosts
        tasks.push((async () => {
            try {
                const { getAdminDetailedStreamsAction } = await import("@/app/actions");
                const detailedStreams = await getAdminDetailedStreamsAction(true);
                if (detailedStreams && detailedStreams.success) {
                    setUserCache("admin_detailed_streams", detailedStreams, 20000); // 20s fresh
                    warmedKeys.push("active_streams_matrix");
                }
            } catch (e) {}
        })());

        // 6. Prewarm Docker Fleet Telemetry
        tasks.push((async () => {
            try {
                const { getFleetMonitoringDataAction } = await import("@/app/actions");
                const fleet = await getFleetMonitoringDataAction();
                if (fleet && fleet.success) {
                    setUserCache("system_fleet_dashboard", fleet, 30000); // 30s fresh
                    warmedKeys.push("docker_fleet_dashboard");
                }
            } catch (e) {}
        })());

        await Promise.allSettled(tasks);
        lastGlobalPrewarmTime = Date.now();
        const durationMs = Date.now() - startTime;
        return { success: true, durationMs, warmedKeys };
    } finally {
        isGlobalPrewarming = false;
    }
}
