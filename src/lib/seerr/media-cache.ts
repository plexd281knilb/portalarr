import fs from "fs";
import path from "path";
import crypto from "crypto";
import { logger } from "@/lib/logger";

export interface CacheOptions {
    ttlMs?: number;        // Fresh TTL in milliseconds (default: 1 hour)
    staleTtlMs?: number;   // Maximum stale grace period in milliseconds (default: 24 hours)
    forceRefresh?: boolean; // Force fresh fetch regardless of cache
}

export interface CachePayload<T> {
    key: string;
    timestamp: number;
    ttlMs: number;
    staleTtlMs: number;
    data: T;
}

// Default standard TTL definitions
export const TTL_DISCOVER_HOME = 60 * 60 * 1000;          // 1 hour fresh
export const STALE_DISCOVER_HOME = 24 * 60 * 60 * 1000;    // 24 hours stale

export const TTL_DISCOVER_MEDIA = 2 * 60 * 60 * 1000;     // 2 hours fresh
export const STALE_DISCOVER_MEDIA = 24 * 60 * 60 * 1000;   // 24 hours stale

export const TTL_MEDIA_DETAILS = 24 * 60 * 60 * 1000;     // 24 hours fresh
export const STALE_MEDIA_DETAILS = 7 * 24 * 60 * 60 * 1000; // 7 days stale

export const TTL_MEDIA_SEARCH = 30 * 60 * 1000;           // 30 mins fresh
export const STALE_MEDIA_SEARCH = 6 * 60 * 60 * 1000;     // 6 hours stale

// 1. Tier 1: In-Memory RAM Cache Map
const memoryCache = new Map<string, CachePayload<any>>();
const MAX_MEMORY_KEYS = 2500;

// In-flight Promise deduplication (prevents cache stampede)
const inFlightFetches = new Map<string, Promise<any>>();

// 2. Tier 2: Persistent Disk Directory
function getDiskCacheDir(): string {
    const dir = path.join(process.cwd(), "data", "cache", "tmdb");
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e: any) {
            // Safe fallback if permission or concurrent creation issue
        }
    }
    return dir;
}

function getSafeDiskFilename(key: string): string {
    // Sanitize key and append hash to guarantee collision-free safe filenames
    const cleanPrefix = key.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48);
    const hash = crypto.createHash("md5").update(key).digest("hex").slice(0, 12);
    return `${cleanPrefix}_${hash}.json`;
}

function getDiskFilePath(key: string): string {
    return path.join(getDiskCacheDir(), getSafeDiskFilename(key));
}

/**
 * Read cached item from persistent disk
 */
async function readDiskCache<T>(key: string): Promise<CachePayload<T> | null> {
    try {
        const filePath = getDiskFilePath(key);
        if (!fs.existsSync(filePath)) return null;

        const content = await fs.promises.readFile(filePath, "utf-8");
        const parsed = JSON.parse(content) as CachePayload<T>;
        if (!parsed || !parsed.timestamp || parsed.data === undefined) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Write cached item to persistent disk asynchronously
 */
async function writeDiskCache<T>(payload: CachePayload<T>): Promise<void> {
    try {
        const filePath = getDiskFilePath(payload.key);
        const json = JSON.stringify(payload);
        await fs.promises.writeFile(filePath, json, "utf-8");
    } catch (e: any) {
        // Disk write failures should never crash application flow
    }
}

/**
 * Save entry to both Tier 1 (RAM) and Tier 2 (Disk)
 */
export async function setMediaCache<T>(key: string, data: T, options?: CacheOptions): Promise<void> {
    const ttlMs = options?.ttlMs ?? TTL_DISCOVER_HOME;
    const staleTtlMs = options?.staleTtlMs ?? STALE_DISCOVER_HOME;
    const now = Date.now();

    const payload: CachePayload<T> = {
        key,
        timestamp: now,
        ttlMs,
        staleTtlMs,
        data
    };

    // Trim memory cache if keys exceed limit
    if (memoryCache.size >= MAX_MEMORY_KEYS) {
        const firstKey = memoryCache.keys().next().value;
        if (firstKey) memoryCache.delete(firstKey);
    }

    memoryCache.set(key, payload);

    // Save to disk asynchronously
    writeDiskCache(payload).catch(() => {});
}

/**
 * Retrieve cached item from Tier 1 (RAM) or Tier 2 (Disk)
 */
export async function getMediaCache<T>(key: string): Promise<T | null> {
    const now = Date.now();

    // 1. Check RAM
    const memEntry = memoryCache.get(key);
    if (memEntry) {
        const age = now - memEntry.timestamp;
        if (age < memEntry.staleTtlMs) {
            return memEntry.data as T;
        }
        memoryCache.delete(key);
    }

    // 2. Check Disk
    const diskEntry = await readDiskCache<T>(key);
    if (diskEntry) {
        const age = now - diskEntry.timestamp;
        if (age < diskEntry.staleTtlMs) {
            // Promote to RAM
            memoryCache.set(key, diskEntry);
            return diskEntry.data;
        }
        // Expired on disk, delete file
        try {
            await fs.promises.unlink(getDiskFilePath(key));
        } catch {}
    }

    return null;
}

/**
 * High-performance Stale-While-Revalidate (SWR) fetching engine
 * - Returns in 0ms (from RAM) or <5ms (from Disk)
 * - Asynchronously revalidates in the background if stale without blocking the caller
 * - Deduplicates in-flight promises to prevent cache stampedes
 */
export async function getOrFetchMediaCache<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions
): Promise<T> {
    const ttlMs = options?.ttlMs ?? TTL_DISCOVER_HOME;
    const staleTtlMs = options?.staleTtlMs ?? STALE_DISCOVER_HOME;
    const forceRefresh = options?.forceRefresh ?? false;
    const now = Date.now();

    if (!forceRefresh) {
        // 1. Check RAM
        const memEntry = memoryCache.get(key);
        if (memEntry) {
            const age = now - memEntry.timestamp;
            // A) Fresh in RAM -> Return instantly (0ms)
            if (age < memEntry.ttlMs) {
                return memEntry.data as T;
            }
            // B) Stale in RAM but within grace period -> Return immediately (0ms) & revalidate in background
            if (age < memEntry.staleTtlMs) {
                triggerBackgroundRevalidation(key, fetchFn, options);
                return memEntry.data as T;
            }
        }

        // 2. Check Disk
        const diskEntry = await readDiskCache<T>(key);
        if (diskEntry) {
            const age = now - diskEntry.timestamp;
            // Promote to RAM
            memoryCache.set(key, diskEntry);

            // A) Fresh on Disk -> Return immediately (<5ms)
            if (age < diskEntry.ttlMs) {
                return diskEntry.data;
            }
            // B) Stale on Disk but within grace period -> Return immediately (<5ms) & revalidate in background
            if (age < diskEntry.staleTtlMs) {
                triggerBackgroundRevalidation(key, fetchFn, options);
                return diskEntry.data;
            }
        }
    }

    // 3. Cache Miss or Force Refresh: Check for existing in-flight promise to prevent stampede
    const existingPromise = inFlightFetches.get(key);
    if (existingPromise) {
        return existingPromise as Promise<T>;
    }

    // Execute fresh fetch and store
    const fetchPromise = (async () => {
        try {
            const freshData = await fetchFn();
            if (freshData !== null && freshData !== undefined) {
                await setMediaCache(key, freshData, options);
            }
            return freshData;
        } finally {
            inFlightFetches.delete(key);
        }
    })();

    inFlightFetches.set(key, fetchPromise);
    return fetchPromise;
}

/**
 * Triggers non-blocking background revalidation for stale cache entries
 */
function triggerBackgroundRevalidation<T>(
    key: string,
    fetchFn: () => Promise<T>,
    options?: CacheOptions
): void {
    if (inFlightFetches.has(key)) return;

    const bgPromise = (async () => {
        try {
            const freshData = await fetchFn();
            if (freshData !== null && freshData !== undefined) {
                await setMediaCache(key, freshData, options);
            }
        } catch (e: any) {
            // Silently log background revalidation failure without affecting active user sessions
            logger.addLog("WARN", "SEERR", `Background SWR revalidation failed for ${key}: ${e.message}`);
        } finally {
            inFlightFetches.delete(key);
        }
    })();

    inFlightFetches.set(key, bgPromise);
}

/**
 * Manually evict cache entry from RAM and disk
 */
export async function clearMediaCache(key?: string): Promise<void> {
    if (key) {
        memoryCache.delete(key);
        inFlightFetches.delete(key);
        try {
            const filePath = getDiskFilePath(key);
            if (fs.existsSync(filePath)) {
                await fs.promises.unlink(filePath);
            }
        } catch {}
    } else {
        memoryCache.clear();
        inFlightFetches.clear();
        try {
            const dir = getDiskCacheDir();
            if (fs.existsSync(dir)) {
                const files = await fs.promises.readdir(dir);
                await Promise.allSettled(files.map(f => fs.promises.unlink(path.join(dir, f))));
            }
        } catch {}
    }
}

/**
 * Prunes disk files that are older than max stale TTL (keeps storage clean)
 */
export async function pruneExpiredDiskMediaCache(): Promise<number> {
    try {
        const dir = getDiskCacheDir();
        if (!fs.existsSync(dir)) return 0;

        const files = await fs.promises.readdir(dir);
        let deleted = 0;
        const now = Date.now();

        for (const file of files) {
            if (!file.endsWith(".json")) continue;
            try {
                const fullPath = path.join(dir, file);
                const stat = await fs.promises.stat(fullPath);
                // If file hasn't been modified in 7 days, remove it
                if (now - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
                    await fs.promises.unlink(fullPath);
                    deleted++;
                }
            } catch {}
        }
        return deleted;
    } catch {
        return 0;
    }
}

/**
 * Background pre-warmer that ensures Home Discovery and top categories
 * are pre-loaded in RAM and persistent disk on boot and scheduled intervals.
 */
export async function prewarmDiscoverCachesInternal(): Promise<{ success: boolean; warmedKeys: number }> {
    try {
        let warmedKeys = 0;
        const {
            getTmdbTrending,
            getTmdbPopularMovies,
            getTmdbPopularTv,
            getTmdbUpcomingMovies,
            getTmdbTopRatedMovies,
            getTmdbKidsTrending,
            getTmdbKidsPopular,
            getTmdbDisneyPixar,
            getTmdbKidsTopRated
        } = await import("@/lib/curation/tmdb");

        const { getPlexLibraryGuidIndex } = await import("@/lib/seerr/availability");

        // 1. Warm Plex availability GUID index concurrently
        getPlexLibraryGuidIndex().catch(() => {});

        // 2. Warm Discovery Main Categories concurrently
        const mainTasks = [
            getOrFetchMediaCache("discover:media:trending:movie:1:false", () => getTmdbTrending("movie", "week", 1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:trending:tv:1:false", () => getTmdbTrending("tv", "week", 1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:popular:movie:1:false", () => getTmdbPopularMovies(1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:popular:tv:1:false", () => getTmdbPopularTv(1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:upcoming:movie:1:false", () => getTmdbUpcomingMovies(), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:top_rated:movie:1:false", () => getTmdbTopRatedMovies(1), { ttlMs: TTL_DISCOVER_MEDIA })
        ];

        // 3. Warm Discovery Kids Categories concurrently
        const kidsTasks = [
            getOrFetchMediaCache("discover:media:trending:movie:1:true", () => getTmdbKidsTrending("movie", 1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:trending:tv:1:true", () => getTmdbKidsTrending("tv", 1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:upcoming:all:1:true", () => getTmdbDisneyPixar(1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:popular:tv:1:true", () => getTmdbKidsPopular("tv", 1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:popular:movie:1:true", () => getTmdbKidsPopular("movie", 1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:top_rated:movie:1:true", () => getTmdbKidsTopRated("movie", 1), { ttlMs: TTL_DISCOVER_MEDIA }),
            getOrFetchMediaCache("discover:media:top_rated:tv:1:true", () => getTmdbKidsTopRated("tv", 1), { ttlMs: TTL_DISCOVER_MEDIA })
        ];

        const results = await Promise.allSettled([...mainTasks, ...kidsTasks]);
        warmedKeys = results.filter(r => r.status === "fulfilled").length;

        // 4. Pre-warm Discover Home feeds for instant hero & carousel loads
        try {
            const { getDiscoverHomeAction } = await import("@/app/seerr-actions");
            await Promise.allSettled([
                getDiscoverHomeAction("main"),
                getDiscoverHomeAction("kids")
            ]);
            warmedKeys += 2;
        } catch {}

        logger.addLog("INFO", "SEERR", `Pre-warmed ${warmedKeys} discovery media categories into high-speed persistent cache.`);
        return { success: true, warmedKeys };
    } catch (e: any) {
        logger.addLog("WARN", "SEERR", `Pre-warming discovery media failed: ${e.message}`);
        return { success: false, warmedKeys: 0 };
    }
}
