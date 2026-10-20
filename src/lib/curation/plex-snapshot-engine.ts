import fs from "fs";
import path from "path";
import os from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { PlexMediaStreamInfo, PruneCandidateItem } from "@/lib/curation/plex-analyzer";

const execFileAsync = promisify(execFile);

// Dynamic wrapper for Node 22.5+ node:sqlite
let DatabaseSyncClass: any = null;
try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sqliteMod = require("node:sqlite");
    DatabaseSyncClass = sqliteMod.DatabaseSync;
} catch (e) {
    DatabaseSyncClass = null;
}

export interface PlexServerSnapshotConfig {
    serverId: string;
    serverName: string;
    serverUrl?: string;
    token?: string;
    databasePath: string;
    snapshotPath?: string;
    lastSnapshotAt?: number;
}

// In-memory snapshot cache to prevent re-copying the database within the same TTL window
interface CachedSnapshot {
    snapshotPath: string;
    createdMs: number;
    sizeMb: number;
}
const snapshotCache = new Map<string, CachedSnapshot>();
const DEFAULT_SNAPSHOT_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Resolves the temp snapshot directory for Portalarr.
 */
export async function getPlexSnapshotDirectory(): Promise<string> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (settings?.plexSnapshotDir && settings.plexSnapshotDir.trim()) {
            return path.resolve(settings.plexSnapshotDir.trim());
        }
    } catch (e) {}

    if (process.platform === "win32") {
        return path.join(os.tmpdir(), "portalarr_snapshots");
    }
    return "/tmp/portalarr_snapshots";
}

/**
 * Validates and resolves a user-entered Plex database path.
 * Supports:
 * - Direct path to com.plexapp.plugins.library.db
 * - Plex Media Server data directory
 * - Docker / Unraid appdata plex directory
 */
export function resolvePlexDatabaseFilePath(inputPath?: string | null): string | null {
    if (!inputPath || !inputPath.trim()) return null;
    const cleanPath = inputPath.trim();

    const candidates = [
        cleanPath,
        path.join(cleanPath, "Plug-in Support", "Databases", "com.plexapp.plugins.library.db"),
        path.join(cleanPath, "Library", "Application Support", "Plex Media Server", "Plug-in Support", "Databases", "com.plexapp.plugins.library.db"),
        path.join(cleanPath, "Plex Media Server", "Plug-in Support", "Databases", "com.plexapp.plugins.library.db"),
        path.join(cleanPath, "com.plexapp.plugins.library.db")
    ];

    for (const cand of candidates) {
        try {
            if (fs.existsSync(cand) && fs.statSync(cand).isFile()) {
                return path.resolve(cand);
            }
        } catch (e) {}
    }

    return null;
}

/**
 * Proactively checks known standard paths for Plex databases across Unraid and Linux environments.
 */
export function discoverKnownPlexDatabasePaths(): string[] {
    const commonPaths = [
        "/mnt/user/appdata/plex/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db",
        "/mnt/remotes/Kid_Server_Appdata/KidsPlexServer/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db",
        "/mnt/remotes/Kid_Server_Appdata/MainPlexBackup/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db",
        "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db",
        "/config/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db"
    ];

    return commonPaths.filter(p => {
        try {
            return fs.existsSync(p) && fs.statSync(p).isFile();
        } catch (e) {
            return false;
        }
    });
}

/**
 * Cleans up old snapshot files from the temporary directory.
 */
function cleanStaleSnapshots(destPath: string) {
    const candidates = [destPath, `${destPath}-wal`, `${destPath}-shm`];
    for (const f of candidates) {
        try {
            if (fs.existsSync(f)) {
                fs.unlinkSync(f);
            }
        } catch (e) {}
    }
}

/**
 * Creates an atomic snapshot of a Plex SQLite database.
 * Modeled after the Unraid multi-server prune script:
 * 1. Executes sqlite3 "$src" ".backup '$dst'" (hot backup without database locks)
 * 2. Falls back to hot file copy + WAL checkpoint if sqlite3 CLI is unavailable.
 */
export async function createPlexDatabaseSnapshot(
    sourceDbPath: string,
    serverId: string,
    options: { force?: boolean; ttlMs?: number; label?: string } = {}
): Promise<{ success: boolean; snapshotPath?: string; sizeMb?: number; fromCache?: boolean; error?: string }> {
    const resolvedSource = resolvePlexDatabaseFilePath(sourceDbPath);
    if (!resolvedSource) {
        return { success: false, error: `Plex database file not found at: ${sourceDbPath}` };
    }

    const ttlMs = options.ttlMs ?? DEFAULT_SNAPSHOT_TTL_MS;
    const now = Date.now();

    // Check in-memory cache
    const cached = snapshotCache.get(serverId);
    if (!options.force && cached && (now - cached.createdMs < ttlMs)) {
        if (fs.existsSync(cached.snapshotPath)) {
            return {
                success: true,
                snapshotPath: cached.snapshotPath,
                sizeMb: cached.sizeMb,
                fromCache: true
            };
        }
    }

    const snapshotDir = await getPlexSnapshotDirectory();
    try {
        if (!fs.existsSync(snapshotDir)) {
            fs.mkdirSync(snapshotDir, { recursive: true });
        }
    } catch (e: any) {
        return { success: false, error: `Failed to create snapshot directory (${snapshotDir}): ${e.message}` };
    }

    const safeServerId = serverId.replace(/[^a-zA-Z0-9_-]/g, "_");
    const destSnapshotPath = path.join(snapshotDir, `${safeServerId}_snapshot.db`);

    cleanStaleSnapshots(destSnapshotPath);

    const startTime = Date.now();
    let methodUsed = "sqlite3_cli";

    try {
        // Strategy 1: Use sqlite3 CLI .backup command with 15s busy timeout
        // This is non-locking and ensures a coherent, checkpointed snapshot even if Plex is momentarily writing
        await execFileAsync("sqlite3", ["-cmd", ".timeout 15000", resolvedSource, `.backup '${destSnapshotPath.replace(/'/g, "''")}'`], { timeout: 45000 });
    } catch (cliErr) {
        // Strategy 2: File copy fallback with WAL and checkpoint
        methodUsed = "node_file_copy";
        try {
            fs.copyFileSync(resolvedSource, destSnapshotPath);
            const sourceWal = `${resolvedSource}-wal`;
            const destWal = `${destSnapshotPath}-wal`;

            if (fs.existsSync(sourceWal)) {
                try { fs.copyFileSync(sourceWal, destWal); } catch (e) {}
            }

            // CRITICAL: NEVER copy the source .db-shm file!
            // The .db-shm file contains active POSIX lock states and shared memory pointers from the running Plex process.
            // Copying it causes "Error: stepping, database is locked (5)".
            // SQLite automatically creates a fresh, unlocked -shm when opening the copy.
            const destShm = `${destSnapshotPath}-shm`;
            if (fs.existsSync(destShm)) {
                try { fs.unlinkSync(destShm); } catch (e) {}
            }

            // Checkpoint the copied WAL into the destination DB so it becomes self-contained
            if (DatabaseSyncClass) {
                try {
                    const tempDb = new DatabaseSyncClass(destSnapshotPath);
                    try { tempDb.exec("PRAGMA busy_timeout = 10000;"); } catch (e) {}
                    tempDb.exec("PRAGMA wal_checkpoint(TRUNCATE);");
                    tempDb.close();
                    if (fs.existsSync(destWal)) {
                        try { fs.unlinkSync(destWal); } catch (e) {}
                    }
                    if (fs.existsSync(destShm)) {
                        try { fs.unlinkSync(destShm); } catch (e) {}
                    }
                } catch (chkErr) {}
            }
        } catch (copyErr: any) {
            return {
                success: false,
                error: `Failed to create SQLite snapshot via copy fallback: ${copyErr.message}`
            };
        }
    }

    if (!fs.existsSync(destSnapshotPath)) {
        return { success: false, error: `Snapshot file was not created at ${destSnapshotPath}` };
    }

    const stat = fs.statSync(destSnapshotPath);
    const sizeMb = Math.round((stat.size / (1024 * 1024)) * 10) / 10;
    const elapsedMs = Date.now() - startTime;

    snapshotCache.set(serverId, {
        snapshotPath: destSnapshotPath,
        createdMs: Date.now(),
        sizeMb
    });

    const labelStr = options.label || serverId;
    logger.addLog("SUCCESS", "PLEX", `Created Plex database snapshot for "${labelStr}" (${sizeMb} MB in ${elapsedMs}ms via ${methodUsed}).`, `Path: ${destSnapshotPath}`);

    return {
        success: true,
        snapshotPath: destSnapshotPath,
        sizeMb,
        fromCache: false
    };
}

/**
 * Inspects a Plex SQLite database and returns statistics (item counts, sections, size).
 */
export function inspectPlexDatabase(dbPath: string): {
    success: boolean;
    movieCount: number;
    showCount: number;
    episodeCount: number;
    sectionCount: number;
    sections: Array<{ id: number; name: string; type: string }>;
    sizeMb: number;
    error?: string;
} {
    const resolved = resolvePlexDatabaseFilePath(dbPath);
    if (!resolved) {
        return { success: false, movieCount: 0, showCount: 0, episodeCount: 0, sectionCount: 0, sections: [], sizeMb: 0, error: "Database file not found." };
    }

    if (!DatabaseSyncClass) {
        return { success: false, movieCount: 0, showCount: 0, episodeCount: 0, sectionCount: 0, sections: [], sizeMb: 0, error: "node:sqlite DatabaseSync not supported in this runtime." };
    }

    let db: any = null;
    try {
        const stat = fs.statSync(resolved);
        const sizeMb = Math.round((stat.size / (1024 * 1024)) * 10) / 10;

        db = new DatabaseSyncClass(resolved, { readOnly: true });
        try { db.exec("PRAGMA busy_timeout = 10000;"); } catch (e) {}
        try { db.exec("PRAGMA query_only = ON;"); } catch (e) {}

        const sections = db.prepare(`
            SELECT id, name, section_type 
            FROM library_sections 
            WHERE section_type IN (1, 2)
            ORDER BY name ASC
        `).all().map((s: any) => ({
            id: s.id,
            name: s.name,
            type: s.section_type === 1 ? "movie" : "show"
        }));

        const counts = db.prepare(`
            SELECT 
                SUM(CASE WHEN metadata_type = 1 THEN 1 ELSE 0 END) AS movies,
                SUM(CASE WHEN metadata_type = 2 THEN 1 ELSE 0 END) AS shows,
                SUM(CASE WHEN metadata_type = 4 THEN 1 ELSE 0 END) AS episodes
            FROM metadata_items
        `).all()[0] || {};

        return {
            success: true,
            movieCount: counts.movies || 0,
            showCount: counts.shows || 0,
            episodeCount: counts.episodes || 0,
            sectionCount: sections.length,
            sections,
            sizeMb
        };
    } catch (e: any) {
        return {
            success: false,
            movieCount: 0,
            showCount: 0,
            episodeCount: 0,
            sectionCount: 0,
            sections: [],
            sizeMb: 0,
            error: e.message
        };
    } finally {
        if (db) {
            try { db.close(); } catch (e) {}
        }
    }
}

/**
 * Reads all tags (labels, genres, collections) for a library section directly from a snapshot.
 * Returns a high-speed map: ratingKey -> { labels: string[], genres: string[], collections: string[] }
 * Executed in <5ms with 0 Plex HTTP calls!
 */
export function getSnapshotLibraryTagsAudit(
    snapshotPath: string,
    sectionKey?: string | number
): Map<string, { labels: string[]; genres: string[]; collections: string[] }> {
    const resultMap = new Map<string, { labels: string[]; genres: string[]; collections: string[] }>();
    if (!DatabaseSyncClass || !fs.existsSync(snapshotPath)) return resultMap;

    let db: any = null;
    try {
        db = new DatabaseSyncClass(snapshotPath, { readOnly: true });
        try { db.exec("PRAGMA busy_timeout = 10000;"); } catch (e) {}
        try { db.exec("PRAGMA query_only = ON;"); } catch (e) {}

        const secId = sectionKey !== undefined && sectionKey !== null ? Number(sectionKey) : null;
        const sql = `
            SELECT 
                mi.id AS rating_key,
                t.tag,
                t.tag_type
            FROM metadata_items mi
            JOIN taggings tg ON tg.metadata_item_id = mi.id
            JOIN tags t ON t.id = tg.tag_id
            WHERE (? IS NULL OR mi.library_section_id = ?)
        `;

        const rows = db.prepare(sql).all(secId, secId);
        for (const row of rows) {
            const rKey = String(row.rating_key);
            let entry = resultMap.get(rKey);
            if (!entry) {
                entry = { labels: [], genres: [], collections: [] };
                resultMap.set(rKey, entry);
            }

            const tagStr = String(row.tag || "").trim();
            if (!tagStr) continue;

            if (row.tag_type === 11) {
                // Label (Plex Sharing Label)
                if (!entry.labels.includes(tagStr)) entry.labels.push(tagStr);
            } else if (row.tag_type === 1) {
                // Genre
                if (!entry.genres.includes(tagStr)) entry.genres.push(tagStr);
            } else if (row.tag_type === 2) {
                // Collection
                if (!entry.collections.includes(tagStr)) entry.collections.push(tagStr);
            }
        }
    } catch (e: any) {
        logger.addLog("WARN", "PLEX", `Failed to read tags audit from snapshot: ${e.message}`);
    } finally {
        if (db) {
            try { db.close(); } catch (e) {}
        }
    }

    return resultMap;
}

/**
 * Reads media items and stream codec specs from a Plex database snapshot.
 * Directly extracts 4K/1080p, HDR, Dolby Vision, audio formats, file sizes, and paths.
 * Replaces heavy PMS /all?includeStreams=1 calls with instant local SQLite queries.
 */
export function getSnapshotLibraryMediaItems(
    snapshotPath: string,
    sectionKey: string | number,
    options: { limit?: number; includeStreams?: boolean } = {}
): PlexMediaStreamInfo[] {
    const results: PlexMediaStreamInfo[] = [];
    if (!DatabaseSyncClass || !fs.existsSync(snapshotPath)) return results;

    let db: any = null;
    try {
        db = new DatabaseSyncClass(snapshotPath, { readOnly: true });
        try { db.exec("PRAGMA busy_timeout = 10000;"); } catch (e) {}
        try { db.exec("PRAGMA query_only = ON;"); } catch (e) {}
        const secId = Number(sectionKey);
        const limit = options.limit ?? 5000;

        const sql = `
            SELECT 
                mi.id AS rating_key,
                mi.metadata_type,
                mi.title,
                mi.year,
                mi.added_at,
                mi.updated_at,
                mi.guid,
                mitem.id AS media_id,
                mitem.width,
                mitem.height,
                mitem.bitrate,
                mitem.video_codec,
                mitem.audio_codec,
                mitem.audio_channels,
                mitem.size AS file_size,
                mp.file AS file_path,
                miv.view_count,
                miv.last_viewed_at
            FROM metadata_items mi
            JOIN library_sections ls ON mi.library_section_id = ls.id
            LEFT JOIN media_items mitem ON mitem.metadata_item_id = mi.id
            LEFT JOIN media_parts mp ON mp.media_item_id = mitem.id
            LEFT JOIN (
                SELECT 
                    guid,
                    COUNT(id) AS view_count,
                    MAX(viewed_at) AS last_viewed_at
                FROM metadata_item_views
                GROUP BY guid
            ) miv ON miv.guid = mi.guid
            WHERE mi.library_section_id = ? AND mi.metadata_type IN (1, 2)
            ORDER BY mi.added_at DESC
            LIMIT ?
        `;

        const rows = db.prepare(sql).all(secId, limit);

        // Also fetch tags map in a single indexed query
        const tagsMap = getSnapshotLibraryTagsAudit(snapshotPath, sectionKey);

        for (const row of rows) {
            const rKey = String(row.rating_key);
            const isMovie = row.metadata_type === 1;
            const tags = tagsMap.get(rKey) || { labels: [], genres: [], collections: [] };

            const rawAddedAt = row.added_at ? Number(row.added_at) * 1000 : Date.now();
            const rawUpdatedAt = row.updated_at ? Number(row.updated_at) * 1000 : rawAddedAt;
            const rawLastViewed = row.last_viewed_at ? Number(row.last_viewed_at) * 1000 : undefined;

            const guids: { imdb?: string; tmdb?: string; tvdb?: string } = {};
            const guidStr = String(row.guid || "");
            if (guidStr.includes("imdb://")) {
                const match = guidStr.match(/imdb:\/\/([^?]+)/);
                if (match) guids.imdb = match[1];
            }
            if (guidStr.includes("tmdb://")) {
                const match = guidStr.match(/tmdb:\/\/([^?]+)/);
                if (match) guids.tmdb = match[1];
            }
            if (guidStr.includes("tvdb://")) {
                const match = guidStr.match(/tvdb:\/\/([^?]+)/);
                if (match) guids.tvdb = match[1];
            }

            // Detect Badges
            const width = row.width || 0;
            const height = row.height || 0;
            let resolution: "4K" | "1080p" | "720p" | "SD" | undefined;
            if (width >= 3800 || height >= 2100) resolution = "4K";
            else if (width >= 1900 || height >= 1000) resolution = "1080p";
            else if (width >= 1200 || height >= 700) resolution = "720p";
            else if (width > 0 || height > 0) resolution = "SD";

            const audioChannels = row.audio_channels === 8 ? "7.1" : (row.audio_channels === 6 ? "5.1" : undefined);
            const videoCodec = row.video_codec ? String(row.video_codec).toUpperCase() : undefined;
            const audioCodec = row.audio_codec ? String(row.audio_codec).toUpperCase() : undefined;

            const isLeavingSoon = tags.labels.some(l => l.toLowerCase().includes("leaving soon")) ||
                tags.collections.some(c => c.toLowerCase().includes("leaving soon"));

            results.push({
                ratingKey: rKey,
                key: `/library/metadata/${rKey}`,
                title: row.title || "Untitled",
                year: row.year ? Number(row.year) : undefined,
                type: isMovie ? "movie" : "show",
                librarySectionID: secId,
                sectionKey: secId,
                addedAt: rawAddedAt,
                updatedAt: rawUpdatedAt,
                lastViewedAt: rawLastViewed,
                viewCount: row.view_count || 0,
                fileSize: row.file_size ? Number(row.file_size) : undefined,
                filePath: row.file_path || undefined,
                guids,
                media: [{
                    id: row.media_id || 0,
                    videoResolution: resolution,
                    videoCodec: row.video_codec,
                    audioCodec: row.audio_codec,
                    audioChannels: row.audio_channels,
                    bitrate: row.bitrate,
                    width: row.width,
                    height: row.height
                }],
                detectedBadges: {
                    resolution,
                    codec: videoCodec,
                    audioChannels
                },
                labels: tags.labels,
                genres: tags.genres,
                collections: tags.collections,
                isLeavingSoon
            });
        }
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed to get library media items from snapshot: ${e.message}`);
    } finally {
        if (db) {
            try { db.close(); } catch (e) {}
        }
    }

    return results;
}

/**
 * Multi-Server Unified Snapshot Prune Evaluation.
 * Modeled directly on the user's Unraid multi-share script:
 * - Attaches secondary server snapshots (Kids, Backup) via SQLite ATTACH DATABASE
 * - Queries thousands of movies and TV seasons in a single unified CTE query in <20ms
 * - Computes cross-server latest_activity, views, sizes, and paths
 * - Zero HTTP calls to Plex Media Server!
 */
export async function evaluatePruneCandidatesFromSnapshotsUnified(
    primaryServer: PlexServerSnapshotConfig,
    secondaryServers: PlexServerSnapshotConfig[],
    options: {
        unwatchedMinAgeDays?: number;
        watchedMinAgeDays?: number;
        unwatchedOnly?: boolean;
        evaluateSeasons?: boolean;
        maxCandidates?: number;
        sortBy?: "combined_oldest" | "dual_lane_cascade" | "combined_activity" | "oldest_added" | "oldest_watched" | "largest_size" | "least_plays" | "oldest_modified";
    } = {}
): Promise<{
    candidates: PruneCandidateItem[];
    totalRecoverableGb: number;
    evaluatedCount: number;
}> {
    if (!DatabaseSyncClass) {
        throw new Error("node:sqlite is required for SQLite snapshot evaluation.");
    }

    const unwatchedMinAgeDays = options.unwatchedMinAgeDays ?? 90;
    const watchedMinAgeDays = options.watchedMinAgeDays ?? 180;
    const unwatchedOnly = options.unwatchedOnly ?? false;
    const maxCandidates = options.maxCandidates ?? 50;
    const sortBy = options.sortBy ?? "combined_oldest";

    // 1. Ensure snapshots exist for primary and secondary servers
    const primarySnap = await createPlexDatabaseSnapshot(primaryServer.databasePath, primaryServer.serverId, { label: primaryServer.serverName });
    if (!primarySnap.success || !primarySnap.snapshotPath) {
        throw new Error(`Primary snapshot failed: ${primarySnap.error}`);
    }

    const secondarySnaps: Array<{ alias: string; snapshotPath: string; serverName: string; serverId: string }> = [];
    for (let i = 0; i < secondaryServers.length; i++) {
        const sec = secondaryServers[i];
        if (!sec.databasePath) continue;
        const snap = await createPlexDatabaseSnapshot(sec.databasePath, sec.serverId, { label: sec.serverName });
        if (snap.success && snap.snapshotPath) {
            secondarySnaps.push({
                alias: `sec_${i + 1}`,
                snapshotPath: snap.snapshotPath,
                serverName: sec.serverName,
                serverId: sec.serverId
            });
        }
    }

    let db: any = null;
    const candidates: PruneCandidateItem[] = [];
    let totalRecoverableGb = 0;
    let evaluatedCount = 0;

    try {
        db = new DatabaseSyncClass(primarySnap.snapshotPath, { readOnly: true });
        try { db.exec("PRAGMA busy_timeout = 10000;"); } catch (e) {}
        try { db.exec("PRAGMA query_only = ON;"); } catch (e) {}

        // Attach secondary server snapshots
        for (const sec of secondarySnaps) {
            const safePath = sec.snapshotPath.replace(/\\/g, "/").replace(/'/g, "''");
            db.exec(`ATTACH DATABASE '${safePath}' AS ${sec.alias};`);
        }

        // Build Multi-Database UNION ALL Query (Matches plex_prune_hourly.sh)
        const serverSources = [
            { alias: "main", serverId: primaryServer.serverId, serverName: primaryServer.serverName, tablePrefix: "" },
            ...secondarySnaps.map(s => ({ alias: s.alias, serverId: s.serverId, serverName: s.serverName, tablePrefix: `${s.alias}.` }))
        ];

        const unionQueries = serverSources.map(src => `
            SELECT 
                mi.id AS rating_key,
                '${src.serverId}' AS server_id,
                '${src.serverName.replace(/'/g, "''")}' AS server_name,
                mi.metadata_type,
                mi.title,
                ls.id AS section_id,
                ls.name AS section_name,
                ls.section_type,
                CASE 
                    WHEN mi.metadata_type = 4 THEN 
                        COALESCE(
                            (CASE WHEN show.guid LIKE '%local%' THEN 'local:' || COALESCE(show.title, 'unknown') ELSE show.guid END) ||
                            ':season:' || COALESCE(season.[index], 1),
                            CASE WHEN season.guid LIKE '%local%' THEN 'local:' || COALESCE(season.title, 'unknown') ELSE season.guid END,
                            mi.guid
                        )
                    ELSE 
                        (CASE WHEN mi.guid LIKE '%local%' THEN 'local:' || COALESCE(mi.title, 'unknown') ELSE mi.guid END)
                END AS unit_guid,
                CASE 
                    WHEN mi.metadata_type = 4 THEN COALESCE(show.title, mi.title)
                    ELSE mi.title
                END AS canonical_title,
                CASE 
                    WHEN mi.metadata_type = 4 THEN COALESCE(season.[index], 1)
                    ELSE NULL
                END AS season_number,
                mi.added_at,
                mi.updated_at,
                mitem.size AS file_size_bytes,
                mp.file AS file_path,
                miv.viewed_at,
                CASE WHEN miv.viewed_at IS NOT NULL THEN 1 ELSE 0 END AS has_view
            FROM ${src.tablePrefix}metadata_items mi
            JOIN ${src.tablePrefix}library_sections ls ON mi.library_section_id = ls.id
            JOIN ${src.tablePrefix}media_items mitem ON mitem.metadata_item_id = mi.id
            JOIN ${src.tablePrefix}media_parts mp ON mp.media_item_id = mitem.id
            LEFT JOIN ${src.tablePrefix}metadata_items season ON season.id = mi.parent_id AND mi.metadata_type = 4
            LEFT JOIN ${src.tablePrefix}metadata_items show ON show.id = season.parent_id AND mi.metadata_type = 4
            LEFT JOIN (
                SELECT MAX(viewed_at) AS viewed_at, guid 
                FROM ${src.tablePrefix}metadata_item_views 
                GROUP BY guid
            ) miv ON miv.guid = mi.guid
            WHERE ls.section_type IN (1, 2)
        `).join("\nUNION ALL\n");

        const fullSql = `
            WITH RawMedia AS (
                ${unionQueries}
            ),
            GlobalGuidActivity AS (
                SELECT 
                    unit_guid,
                    MAX(CASE 
                        WHEN viewed_at IS NOT NULL AND viewed_at > added_at AND viewed_at > updated_at THEN viewed_at
                        WHEN added_at > updated_at THEN added_at
                        ELSE updated_at
                    END) AS max_active_epoch,
                    MAX(viewed_at) AS global_last_viewed_epoch,
                    SUM(has_view) AS global_views,
                    GROUP_CONCAT(DISTINCT server_name) AS server_names
                FROM RawMedia
                GROUP BY unit_guid
            ),
            AggregatedUnits AS (
                SELECT 
                    rm.unit_guid,
                    rm.server_id,
                    rm.server_name,
                    rm.rating_key,
                    rm.section_id,
                    rm.section_name,
                    rm.canonical_title,
                    rm.metadata_type,
                    rm.season_number,
                    rm.file_path,
                    rm.added_at,
                    rm.updated_at,
                    SUM(rm.file_size_bytes) AS unit_bytes,
                    COUNT(rm.rating_key) AS part_count,
                    gga.max_active_epoch,
                    gga.global_last_viewed_epoch,
                    gga.global_views,
                    gga.server_names
                FROM RawMedia rm
                JOIN GlobalGuidActivity gga ON gga.unit_guid = rm.unit_guid
                WHERE rm.server_id = '${primaryServer.serverId}'
                GROUP BY rm.unit_guid
            )
            SELECT * FROM AggregatedUnits
        `;

        const rows = db.prepare(fullSql).all();
        evaluatedCount = rows.length;

        const nowSec = Math.floor(Date.now() / 1000);

        for (const row of rows) {
            const addedSec = Number(row.added_at || nowSec);
            const updatedSec = Number(row.updated_at || addedSec);
            const activeSec = Number(row.max_active_epoch || addedSec);
            const lastViewedSec = row.global_last_viewed_epoch ? Number(row.global_last_viewed_epoch) : undefined;
            const views = Number(row.global_views || 0);

            const daysSinceAdded = Math.max(0, Math.floor((nowSec - addedSec) / 86400));
            const daysSinceActive = Math.max(0, Math.floor((nowSec - activeSec) / 86400));
            const isWatched = views > 0 || (lastViewedSec !== undefined && lastViewedSec > 0);

            const sizeBytes = Number(row.unit_bytes || 0);
            const sizeGb = Math.round((sizeBytes / (1024 * 1024 * 1024)) * 100) / 100;

            const isSeason = row.metadata_type === 4 || row.season_number !== null;
            const itemType: "movie" | "season" = isSeason ? "season" : "movie";

            let lane: "unwatched" | "watched";
            let laneLabel: string;
            let reason: string;

            if (!isWatched) {
                // Lane 2: Never Watched (Dead Weight)
                if (daysSinceAdded < unwatchedMinAgeDays) continue;
                lane = "unwatched";
                laneLabel = "Lane 2: Never Watched";
                reason = isSeason
                    ? `Season ${row.season_number} (${row.part_count} eps) • Never Watched (Added ${daysSinceAdded}d ago)`
                    : `Never Watched (Added ${daysSinceAdded}d ago)`;
            } else {
                // Lane 1: Oldest Watched (Cold Storage)
                if (unwatchedOnly) continue;
                const daysSinceWatched = lastViewedSec
                    ? Math.max(0, Math.floor((nowSec - lastViewedSec) / 86400))
                    : daysSinceActive;

                if (daysSinceWatched < watchedMinAgeDays) continue;
                lane = "watched";
                laneLabel = "Lane 1: Oldest Watched";
                reason = isSeason
                    ? `Season ${row.season_number} (${views} plays across ${row.server_names}) • Last Watched ${daysSinceWatched}d ago`
                    : `Watched (${views} plays across ${row.server_names}) • Last Watched ${daysSinceWatched}d ago`;
            }

            candidates.push({
                ratingKey: String(row.rating_key),
                title: isSeason ? `${row.canonical_title} - Season ${row.season_number}` : row.canonical_title,
                type: itemType,
                sectionKey: String(row.section_id || "1"),
                sectionTitle: row.section_name || undefined,
                serverId: primaryServer.serverId,
                serverName: primaryServer.serverName,
                parentTitle: isSeason ? row.canonical_title : undefined,
                seasonNumber: row.season_number !== null ? Number(row.season_number) : undefined,
                episodeCount: isSeason ? Number(row.part_count || 0) : undefined,
                fileSizeGb: sizeGb,
                daysOld: daysSinceAdded,
                daysInactive: daysSinceActive,
                addedAt: addedSec * 1000,
                updatedAt: updatedSec * 1000,
                lastViewedAt: lastViewedSec ? lastViewedSec * 1000 : undefined,
                lastActivityDate: activeSec * 1000,
                viewCount: views,
                lane,
                laneLabel,
                reason,
                filePath: row.file_path,
                watchedOnServerName: row.server_names
            });
        }

        // Sorting Strategies
        if (sortBy === "dual_lane_cascade") {
            candidates.sort((a, b) => {
                if (a.lane === "unwatched" && b.lane !== "unwatched") return -1;
                if (a.lane !== "unwatched" && b.lane === "unwatched") return 1;
                return (b.daysInactive || 0) - (a.daysInactive || 0);
            });
        } else if (sortBy === "largest_size") {
            candidates.sort((a, b) => b.fileSizeGb - a.fileSizeGb);
        } else if (sortBy === "oldest_modified") {
            candidates.sort((a, b) => (a.updatedAt || 0) - (b.updatedAt || 0));
        } else {
            // combined_oldest
            candidates.sort((a, b) => (b.daysInactive || 0) - (a.daysInactive || 0));
        }

        const trimmed = candidates.slice(0, maxCandidates);
        totalRecoverableGb = Math.round(trimmed.reduce((acc, c) => acc + c.fileSizeGb, 0) * 100) / 100;

        return {
            candidates: trimmed,
            totalRecoverableGb,
            evaluatedCount
        };
    } finally {
        if (db) {
            for (const sec of secondarySnaps) {
                try { db.exec(`DETACH DATABASE ${sec.alias};`); } catch (e) {}
            }
            try { db.close(); } catch (e) {}
        }
    }
}
