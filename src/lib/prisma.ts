import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";

if (typeof window === "undefined" && !(global as any).__loggerPatched) {
    (global as any).__loggerPatched = true;

    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    function formatWithTimestamp(args: any[]) {
        const now = new Date();
        const YYYY = now.getFullYear();
        const MM = String(now.getMonth() + 1).padStart(2, "0");
        const DD = String(now.getDate()).padStart(2, "0");
        const hh = String(now.getHours()).padStart(2, "0");
        const mm = String(now.getMinutes()).padStart(2, "0");
        const ss = String(now.getSeconds()).padStart(2, "0");
        const ts = `[${YYYY}-${MM}-${DD} ${hh}:${mm}:${ss}]`;

        if (args.length > 0 && typeof args[0] === "string") {
            if (/^\[\d{4}-\d{2}-\d{2}/.test(args[0])) {
                return args;
            }
            return [`${ts} ${args[0]}`, ...args.slice(1)];
        }
        return [ts, ...args];
    }

    console.log = function (...args: any[]) {
        originalLog.apply(console, formatWithTimestamp(args) as any);
    };

    console.warn = function (...args: any[]) {
        originalWarn.apply(console, formatWithTimestamp(args) as any);
    };

    console.error = function (...args: any[]) {
        originalError.apply(console, formatWithTimestamp(args) as any);
    };
}

function getDatabaseFilePath(): string {
    const dbUrl = process.env.DATABASE_URL || "file:./prisma/dev.db";
    const rawPath = dbUrl.replace(/^file:/, "").trim();
    return path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
}

export function createDatabaseBackup() {
    try {
        const dbPath = getDatabaseFilePath();
        if (!fs.existsSync(dbPath)) return;
        const size = fs.statSync(dbPath).size;
        if (size === 0) return;

        const backupDir = path.join(path.dirname(dbPath), "backups");
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        const now = new Date();
        const stamp = now.toISOString().replace(/[:.]/g, "-");
        const backupFile = path.join(backupDir, `dev_backup_${stamp}.db`);

        const existingBackups = fs.readdirSync(backupDir)
            .filter(f => f.startsWith("dev_backup_") && f.endsWith(".db"))
            .sort();

        let shouldBackup = true;
        if (existingBackups.length > 0) {
            const latestBackup = path.join(backupDir, existingBackups[existingBackups.length - 1]);
            const latestStat = fs.statSync(latestBackup);
            if (now.getTime() - latestStat.mtime.getTime() < 30 * 60 * 1000) {
                shouldBackup = false;
            }
        }

        if (shouldBackup) {
            fs.copyFileSync(dbPath, backupFile);
            console.log(`[DB-BACKUP] Created database snapshot: ${backupFile} (${size} bytes)`);

            // Retain last 20 backups
            if (existingBackups.length >= 20) {
                for (let i = 0; i < existingBackups.length - 19; i++) {
                    try {
                        fs.unlinkSync(path.join(backupDir, existingBackups[i]));
                    } catch (e) {}
                }
            }
        }
    } catch (err: any) {
        console.warn("[DB-BACKUP] Failed to create backup:", err.message);
    }
}

let dbFileEnsured = false;

function ensureDatabaseFile() {
    if (dbFileEnsured) return;
    dbFileEnsured = true;

    try {
        const canonicalPath = getDatabaseFilePath();
        const rootPrismaPath = path.join(process.cwd(), "prisma", "dev.db");
        const legacyNestedPath = path.join(process.cwd(), "prisma", "prisma", "dev.db");

        const targetDir = path.dirname(canonicalPath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const canonicalExists = fs.existsSync(canonicalPath);
        const canonicalSize = canonicalExists ? fs.statSync(canonicalPath).size : 0;

        // ONLY initialize if the active database is missing or empty (0 bytes)
        if (canonicalSize === 0) {
            const backupDir = path.join(targetDir, "backups");
            const backupCandidates: string[] = [];
            if (fs.existsSync(backupDir)) {
                try {
                    const files = fs.readdirSync(backupDir)
                        .filter(f => f.startsWith("dev_backup_") && f.endsWith(".db"))
                        .map(f => path.join(backupDir, f))
                        .filter(f => fs.existsSync(f) && fs.statSync(f).size > 0)
                        .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
                    backupCandidates.push(...files);
                } catch (e) {}
            }

            // Strictly prioritize actual backups created from this installation
            for (const candidate of backupCandidates) {
                if (candidate !== canonicalPath && fs.existsSync(candidate)) {
                    const candidateSize = fs.statSync(candidate).size;
                    if (candidateSize > 0) {
                        console.log(`[DB-RECOVERY] Restoring database file from backup ${candidate} (${candidateSize} bytes) -> ${canonicalPath}`);
                        fs.copyFileSync(candidate, canonicalPath);
                        break;
                    }
                }
            }
        }
    } catch (err: any) {
        console.error("[DB-MIGRATION] Error during database file check:", err);
    }
}

ensureDatabaseFile();

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

let schemaPatchPromise: Promise<void> | null = null;
let schemaPatchCompleted = false;

export async function ensureSchemaColumns(): Promise<void> {
    if (schemaPatchCompleted) return;
    if (schemaPatchPromise) return schemaPatchPromise;

    schemaPatchPromise = (async () => {
        try {
            await prisma.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`).catch(() => {});
            await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = 10000;`).catch(() => {});
            await prisma.$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`).catch(() => {});

            // Auto-recover any failed/incomplete migrations in _prisma_migrations so Prisma never gets stuck in P3009/P3018
            try {
                await prisma.$executeRawUnsafe(`
                    UPDATE "_prisma_migrations" 
                    SET "finished_at" = COALESCE("finished_at", CURRENT_TIMESTAMP), 
                        "applied_steps_count" = CASE WHEN "applied_steps_count" = 0 THEN 1 ELSE "applied_steps_count" END
                    WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL;
                `);
            } catch (migErr) {
                // Ignore if table does not exist
            }

        // --- 1. SETTINGS TABLE ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "Settings" (
                    "id" TEXT PRIMARY KEY DEFAULT 'global',
                    "mainPlexUrl" TEXT,
                    "mainPlexToken" TEXT,
                    "smtpHost" TEXT,
                    "smtpPort" INTEGER,
                    "smtpUser" TEXT,
                    "smtpPass" TEXT,
                    "smtpFrom" TEXT NOT NULL DEFAULT '',
                    "refreshInterval" INTEGER NOT NULL DEFAULT 10,
                    "theme" TEXT NOT NULL DEFAULT 'dark',
                    "autoSyncInterval" INTEGER NOT NULL DEFAULT 6,
                    "lastAutoSync" DATETIME,
                    "betaDashboardText" TEXT,
                    "roadmapText" TEXT,
                    "alertBannerEnabled" BOOLEAN NOT NULL DEFAULT 0,
                    "alertBannerText" TEXT,
                    "downloadsPath" TEXT DEFAULT '/downloads',
                    "aiProvider" TEXT DEFAULT 'default',
                    "aiApiKey" TEXT,
                    "aiModel" TEXT DEFAULT 'gemini-2.5-flash',
                    "aiAutoResolve" BOOLEAN NOT NULL DEFAULT 1,
                    "googleBooksApiKey" TEXT,
                    "defaultTrialDays" INTEGER NOT NULL DEFAULT 14,
                    "defaultPlexLibraries" TEXT,
                    "paymentPaypal" TEXT,
                    "paymentVenmo" TEXT,
                    "paymentCashApp" TEXT,
                    "paymentZelle" TEXT,
                    "paymentInstructions" TEXT,
                    "subscriptionPrice" TEXT,
                    "yearlyPrice" REAL DEFAULT 180,
                    "monthlyPrice" REAL DEFAULT 15,
                    "renewalMonth" INTEGER DEFAULT 1,
                    "renewalDay" INTEGER DEFAULT 1,
                    "billingType" TEXT DEFAULT 'YEARLY_PRORATED',
                    "requireReferralForSignup" BOOLEAN NOT NULL DEFAULT 0
                );
            `);

            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Settings");`);
            const cols = tableInfo.map((c: any) => c.name);

            const settingsAddCols: [string, string][] = [
                ["smtpFrom", `ALTER TABLE "Settings" ADD COLUMN "smtpFrom" TEXT NOT NULL DEFAULT '';`],
                ["smtpHost", `ALTER TABLE "Settings" ADD COLUMN "smtpHost" TEXT;`],
                ["smtpPort", `ALTER TABLE "Settings" ADD COLUMN "smtpPort" INTEGER;`],
                ["smtpUser", `ALTER TABLE "Settings" ADD COLUMN "smtpUser" TEXT;`],
                ["smtpPass", `ALTER TABLE "Settings" ADD COLUMN "smtpPass" TEXT;`],
                ["mainPlexUrl", `ALTER TABLE "Settings" ADD COLUMN "mainPlexUrl" TEXT;`],
                ["mainPlexToken", `ALTER TABLE "Settings" ADD COLUMN "mainPlexToken" TEXT;`],
                ["downloadsPath", `ALTER TABLE "Settings" ADD COLUMN "downloadsPath" TEXT DEFAULT '/downloads';`],
                ["aiProvider", `ALTER TABLE "Settings" ADD COLUMN "aiProvider" TEXT DEFAULT 'default';`],
                ["aiApiKey", `ALTER TABLE "Settings" ADD COLUMN "aiApiKey" TEXT;`],
                ["aiModel", `ALTER TABLE "Settings" ADD COLUMN "aiModel" TEXT DEFAULT 'gemini-2.5-flash';`],
                ["aiAutoResolve", `ALTER TABLE "Settings" ADD COLUMN "aiAutoResolve" BOOLEAN NOT NULL DEFAULT 1;`],
                ["googleBooksApiKey", `ALTER TABLE "Settings" ADD COLUMN "googleBooksApiKey" TEXT;`],
                ["defaultTrialDays", `ALTER TABLE "Settings" ADD COLUMN "defaultTrialDays" INTEGER NOT NULL DEFAULT 14;`],
                ["defaultPlexLibraries", `ALTER TABLE "Settings" ADD COLUMN "defaultPlexLibraries" TEXT;`],
                ["paymentPaypal", `ALTER TABLE "Settings" ADD COLUMN "paymentPaypal" TEXT;`],
                ["paymentVenmo", `ALTER TABLE "Settings" ADD COLUMN "paymentVenmo" TEXT;`],
                ["paymentCashApp", `ALTER TABLE "Settings" ADD COLUMN "paymentCashApp" TEXT;`],
                ["paymentZelle", `ALTER TABLE "Settings" ADD COLUMN "paymentZelle" TEXT;`],
                ["paymentInstructions", `ALTER TABLE "Settings" ADD COLUMN "paymentInstructions" TEXT;`],
                ["subscriptionPrice", `ALTER TABLE "Settings" ADD COLUMN "subscriptionPrice" TEXT;`],
                ["yearlyPrice", `ALTER TABLE "Settings" ADD COLUMN "yearlyPrice" REAL DEFAULT 180;`],
                ["monthlyPrice", `ALTER TABLE "Settings" ADD COLUMN "monthlyPrice" REAL DEFAULT 15;`],
                ["renewalMonth", `ALTER TABLE "Settings" ADD COLUMN "renewalMonth" INTEGER DEFAULT 1;`],
                ["renewalDay", `ALTER TABLE "Settings" ADD COLUMN "renewalDay" INTEGER DEFAULT 1;`],
                ["billingType", `ALTER TABLE "Settings" ADD COLUMN "billingType" TEXT DEFAULT 'YEARLY_PRORATED';`],
                ["requireReferralForSignup", `ALTER TABLE "Settings" ADD COLUMN "requireReferralForSignup" BOOLEAN NOT NULL DEFAULT 0;`],
                ["emailNotificationsEnabled", `ALTER TABLE "Settings" ADD COLUMN "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["notifyUserApproval", `ALTER TABLE "Settings" ADD COLUMN "notifyUserApproval" BOOLEAN NOT NULL DEFAULT 1;`],
                ["notifyAdminNewUserRequest", `ALTER TABLE "Settings" ADD COLUMN "notifyAdminNewUserRequest" BOOLEAN NOT NULL DEFAULT 1;`],
                ["notifyPasswordReset", `ALTER TABLE "Settings" ADD COLUMN "notifyPasswordReset" BOOLEAN NOT NULL DEFAULT 1;`],
                ["notifyMediaRequests", `ALTER TABLE "Settings" ADD COLUMN "notifyMediaRequests" BOOLEAN NOT NULL DEFAULT 1;`],
                ["notifySupportTickets", `ALTER TABLE "Settings" ADD COLUMN "notifySupportTickets" BOOLEAN NOT NULL DEFAULT 1;`],
                ["notifySendToKindle", `ALTER TABLE "Settings" ADD COLUMN "notifySendToKindle" BOOLEAN NOT NULL DEFAULT 1;`]
            ];

            for (const [colName, ddl] of settingsAddCols) {
                if (!cols.includes(colName)) {
                    try {
                        console.log(`[DB-SCHEMA-AUTOFIX] Adding missing '${colName}' column to Settings table...`);
                        await prisma.$executeRawUnsafe(ddl);
                    } catch (err: any) {
                        if (!err?.message?.includes("duplicate column name")) {
                            console.warn(`[DB-SCHEMA-AUTOFIX] Notice on column '${colName}':`, err.message);
                        }
                    }
                }
            }

            // Ensure singleton row exists
            try {
                await prisma.$executeRawUnsafe(`
                    INSERT OR IGNORE INTO "Settings" ("id", "theme", "refreshInterval", "autoSyncInterval", "defaultTrialDays", "yearlyPrice", "monthlyPrice", "renewalMonth", "renewalDay", "billingType")
                    VALUES ('global', 'dark', 10, 6, 14, 180, 15, 1, 1, 'YEARLY_PRORATED');
                `);
            } catch (e) {}
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Settings table check error:", e.message || e);
        }

        // --- 2. USER TABLE ---
        try {
            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("User");`);
            const cols = tableInfo.map((c: any) => c.name);

            const userAddCols: [string, string][] = [
                ["kindleEmail", `ALTER TABLE "User" ADD COLUMN "kindleEmail" TEXT NOT NULL DEFAULT '';`],
                ["role", `ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'USER';`],
                ["status", `ALTER TABLE "User" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'APPROVED';`],
                ["trialEndsAt", `ALTER TABLE "User" ADD COLUMN "trialEndsAt" DATETIME;`],
                ["subscriptionEndsAt", `ALTER TABLE "User" ADD COLUMN "subscriptionEndsAt" DATETIME;`],
                ["plexUsername", `ALTER TABLE "User" ADD COLUMN "plexUsername" TEXT;`],
                ["plexEmail", `ALTER TABLE "User" ADD COLUMN "plexEmail" TEXT;`],
                ["plexLibrarySectionIds", `ALTER TABLE "User" ADD COLUMN "plexLibrarySectionIds" TEXT;`],
                ["referralCode", `ALTER TABLE "User" ADD COLUMN "referralCode" TEXT;`],
                ["referredByUserId", `ALTER TABLE "User" ADD COLUMN "referredByUserId" TEXT;`],
                ["convertedAt", `ALTER TABLE "User" ADD COLUMN "convertedAt" DATETIME;`],
                ["lastLogin", `ALTER TABLE "User" ADD COLUMN "lastLogin" DATETIME;`]
            ];

            for (const [colName, ddl] of userAddCols) {
                if (!cols.includes(colName)) {
                    try {
                        console.log(`[DB-SCHEMA-AUTOFIX] Adding missing '${colName}' column to User table...`);
                        await prisma.$executeRawUnsafe(ddl);
                    } catch (err: any) {
                        if (!err?.message?.includes("duplicate column name")) {
                            console.warn(`[DB-SCHEMA-AUTOFIX] Notice on column '${colName}':`, err.message);
                        }
                    }
                }
            }
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] User table check error:", e.message || e);
        }

        // --- 3. MEDIA APP TABLE ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "MediaApp" (
                    "id" TEXT PRIMARY KEY,
                    "type" TEXT NOT NULL,
                    "name" TEXT NOT NULL,
                    "url" TEXT NOT NULL,
                    "externalUrl" TEXT,
                    "apiKey" TEXT,
                    "enabledForUsers" BOOLEAN NOT NULL DEFAULT 0,
                    "allowedQualityProfileIds" TEXT,
                    "allowedRootFolderIds" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("MediaApp");`);
            const cols = tableInfo.map((c: any) => c.name);

            if (!cols.includes("externalUrl")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "MediaApp" ADD COLUMN "externalUrl" TEXT;`);
            }
            if (!cols.includes("apiKey")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "MediaApp" ADD COLUMN "apiKey" TEXT;`);
            }
            if (!cols.includes("enabledForUsers")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "MediaApp" ADD COLUMN "enabledForUsers" BOOLEAN NOT NULL DEFAULT 0;`);
            }
            if (!cols.includes("allowedQualityProfileIds")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "MediaApp" ADD COLUMN "allowedQualityProfileIds" TEXT;`);
            }
            if (!cols.includes("allowedRootFolderIds")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "MediaApp" ADD COLUMN "allowedRootFolderIds" TEXT;`);
            }
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] MediaApp table check error:", e.message || e);
        }

        // --- 4. INSTANCE & SERVICE TABLES ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "TautulliInstance" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "url" TEXT NOT NULL,
                    "apiKey" TEXT NOT NULL,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "GlancesInstance" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "url" TEXT NOT NULL,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "Service" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "url" TEXT NOT NULL,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "SupportTicket" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "email" TEXT NOT NULL,
                    "issue" TEXT NOT NULL,
                    "status" TEXT NOT NULL DEFAULT 'Pending',
                    "adminComment" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "BetaCard" (
                    "id" TEXT PRIMARY KEY,
                    "title" TEXT NOT NULL,
                    "content" TEXT NOT NULL,
                    "buttonText" TEXT,
                    "buttonUrl" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Auxiliary tables check error:", e.message || e);
        }

        // --- 5. LIBRARY TABLE ---
        try {
            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Library");`);
            const columns = tableInfo.map((c: any) => c.name);

            if (!columns.includes("restrictedUsers")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "restrictedUsers" TEXT DEFAULT "";`);
            }
            if (!columns.includes("downloadCategory")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "downloadCategory" TEXT DEFAULT "books";`);
            }
            if (!columns.includes("mediaType")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "mediaType" TEXT DEFAULT "ebook";`);
            }
            if (!columns.includes("allowedUsers")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "allowedUsers" TEXT DEFAULT "";`);
            }
            if (!columns.includes("path")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "path" TEXT DEFAULT "";`);
            }
            if (!columns.includes("description")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "description" TEXT DEFAULT "";`);
            }
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Failed to patch Library columns:", e.message || e);
        }

        // --- 6. BOOK TABLE ---
        try {
            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Book");`);
            const columns = tableInfo.map((c: any) => c.name);
            if (!columns.includes("mediaType")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Book" ADD COLUMN "mediaType" TEXT DEFAULT "ebook";`);
            }
            if (!columns.includes("series")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Book" ADD COLUMN "series" TEXT;`);
            }
            if (!columns.includes("volumeNumber")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "Book" ADD COLUMN "volumeNumber" TEXT;`);
            }
        } catch (e: any) {}

        // --- 7. BOOK REQUEST TABLE ---
        try {
            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("BookRequest");`);
            const columns = tableInfo.map((c: any) => c.name);
            if (!columns.includes("mediaType")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "mediaType" TEXT DEFAULT "ebook";`);
            }
            if (!columns.includes("type")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "type" TEXT DEFAULT "book";`);
            }
            if (!columns.includes("series")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "series" TEXT;`);
            }
            if (!columns.includes("volumeNumber")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "volumeNumber" TEXT;`);
            }
            if (!columns.includes("monitorSeries")) {
                await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "monitorSeries" BOOLEAN DEFAULT 0;`);
            }
        } catch (e: any) {}

        // --- 8. DELIVERY LOGS & COMMUNTIY SUGGESTIONS ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "KindleDeliveryLog" (
                    "id" TEXT PRIMARY KEY,
                    "bookId" TEXT,
                    "bookTitle" TEXT NOT NULL,
                    "bookAuthor" TEXT,
                    "recipientEmail" TEXT NOT NULL,
                    "userEmail" TEXT,
                    "username" TEXT NOT NULL,
                    "status" TEXT NOT NULL DEFAULT 'DELIVERED',
                    "errorMessage" TEXT,
                    "fileSize" REAL,
                    "fileType" TEXT,
                    "diagnostics" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (e: any) {}

        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "FailedRelease" (
                    "id" TEXT PRIMARY KEY,
                    "releaseTitle" TEXT NOT NULL,
                    "downloadUrl" TEXT,
                    "guid" TEXT,
                    "protocol" TEXT NOT NULL DEFAULT 'torrent',
                    "reason" TEXT,
                    "bookRequestId" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (e: any) {}

        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "FeatureSuggestion" (
                    "id" TEXT PRIMARY KEY,
                    "title" TEXT NOT NULL,
                    "description" TEXT,
                    "category" TEXT NOT NULL DEFAULT 'General',
                    "createdBy" TEXT NOT NULL DEFAULT 'Admin',
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "FeatureVote" (
                    "id" TEXT PRIMARY KEY,
                    "suggestionId" TEXT NOT NULL,
                    "username" TEXT NOT NULL,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "FeatureVote_suggestionId_fkey" FOREIGN KEY ("suggestionId") REFERENCES "FeatureSuggestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
                );
            `);
            await prisma.$executeRawUnsafe(`
                CREATE UNIQUE INDEX IF NOT EXISTS "FeatureVote_suggestionId_username_key" ON "FeatureVote"("suggestionId", "username");
            `);

            // Seed initial suggestions if empty
            const count: any[] = await prisma.$queryRawUnsafe(`SELECT count(*) as cnt FROM "FeatureSuggestion";`);
            const total = count?.[0]?.cnt || 0;
            if (total === 0) {
                console.log("[DB-SCHEMA-AUTOFIX] Seeding initial community feature suggestions...");
                const initialSuggestions = [
                    {
                        id: "sug_tunarr_live",
                        title: "Tunarr Live TV & 24/7 Channels",
                        description: "Stream personalized 24/7 TV channels, custom programming blocks, and continuously running shows directly in your media player.",
                        category: "Live TV"
                    },
                    {
                        id: "sug_audiobook_enhancements",
                        title: "Enhanced Audiobook Player & Playlists",
                        description: "Smarter chapter tracking, customizable bookmarks, listening speed presets, and cross-device listening resume.",
                        category: "Audiobooks"
                    },
                    {
                        id: "sug_plex_user_filter",
                        title: "Personal Plex Content & NSFW Filtering",
                        description: "Allow users to customize their Plex experience from Portalarr—toggle NSFW/mature content and hide specific tagged shows or movies.",
                        category: "Plex"
                    },
                    {
                        id: "sug_instant_notifications",
                        title: "Real-Time Discord & Telegram Notifications",
                        description: "Receive instant notifications on Discord, Telegram, or phone alerts when requested books, movies, or show episodes finish downloading.",
                        category: "Notifications"
                    },
                    {
                        id: "sug_listening_stats",
                        title: "Personal Reading & Listening Statistics",
                        description: "Track your reading speed, completed books, monthly listening hours, and personalized reading goal milestones.",
                        category: "Stats"
                    }
                ];

                for (const s of initialSuggestions) {
                    await prisma.$executeRawUnsafe(
                        `INSERT OR IGNORE INTO "FeatureSuggestion" ("id", "title", "description", "category", "createdBy", "createdAt", "updatedAt") VALUES (?, ?, ?, ?, 'Admin', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);`,
                        s.id,
                        s.title,
                        s.description,
                        s.category
                    );
                }
            }
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Failed to create or seed FeatureSuggestion tables:", e.message || e);
        }

        schemaPatchCompleted = true;
    } catch (globalErr: any) {
        console.error("[DB-SCHEMA-AUTOFIX] Critical error in ensureSchemaColumns:", globalErr.message || globalErr);
    } finally {
        schemaPatchPromise = null;
    }
})();

return schemaPatchPromise;
}

ensureSchemaColumns().catch(() => {});

// --- BACKGROUND SCHEDULER ---
const globalForScheduler = global as unknown as { schedulerInitialized?: boolean };

if (!globalForScheduler.schedulerInitialized) {
  globalForScheduler.schedulerInitialized = true;

  // Let Next.js boot finish before running the first check
  setTimeout(async () => {
    await ensureSchemaColumns();
    const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
    const intervalMinutes = settings?.autoSyncInterval || 5;
    console.log(`[BACKGROUND-JOB] Initializing library auto-scan job (Interval: ${intervalMinutes}m)...`);
    console.log(`[PORTALARR] Server is fully booted, ready, and listening on http://0.0.0.0:3000`);

    // Trigger instant initial library scan on boot
    try {
      const { scanLibraryInternal } = await import("../app/actions");
      console.log(`[BACKGROUND-JOB] Triggering instant initial boot scan for all libraries...`);
      const libraries = await prisma.library.findMany();
      for (const lib of libraries) {
        try {
          console.log(`[BACKGROUND-JOB] Initial boot scan for "${lib.name}"...`);
          await scanLibraryInternal(lib.id);
        } catch (libErr: any) {
          console.error(`[BACKGROUND-JOB] Boot scan error for "${lib.name}":`, libErr.message || libErr);
        }
      }
    } catch (bootErr: any) {
      console.error(`[BACKGROUND-JOB] Boot scan failed:`, bootErr.message || bootErr);
    }
    
    // Check every minute if periodic scan is due
    setInterval(async () => {
      if ((global as any).__PORTALARR_SYNC_IN_PROGRESS) {
        return;
      }
      try {
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        const intervalMinutes = settings?.autoSyncInterval || 5; // Default to 5 minutes
        
        const lastSync = settings?.lastAutoSync;
        const now = new Date();
        
        if (!lastSync || (now.getTime() - lastSync.getTime()) >= intervalMinutes * 60 * 1000) {
          (global as any).__PORTALARR_SYNC_IN_PROGRESS = true;
          console.log(`[BACKGROUND-JOB] Starting scheduled library scan and Plex friends sync (Interval: ${intervalMinutes}m)...`);
          
          const { scanLibraryInternal, syncPlexFriendsInternal } = await import("../app/actions");

          // Sync Plex Friends list and user accounts
          try {
            console.log(`[BACKGROUND-JOB] Syncing Plex friends...`);
            await syncPlexFriendsInternal();
          } catch (plexErr: any) {
            console.error(`[BACKGROUND-JOB] Error syncing Plex friends:`, plexErr.message || plexErr);
          }
          
          const libraries = await prisma.library.findMany();
          for (const lib of libraries) {
            try {
              console.log(`[BACKGROUND-JOB] Scanning library "${lib.name}"...`);
              await scanLibraryInternal(lib.id);
            } catch (libErr: any) {
              console.error(`[BACKGROUND-JOB] Error scanning library "${lib.name}":`, libErr.message || libErr);
            }
          }

          // Check for failed requests that are older than 5 days to auto-retry
          try {
            const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
            const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
            
            const failedRequests = await prisma.bookRequest.findMany({
              where: {
                OR: [
                  { status: { startsWith: "Failed" }, updatedAt: { lte: fiveDaysAgo } },
                  { status: { in: ["Downloading", "Searching"] }, updatedAt: { lte: twelveHoursAgo } },
                    { status: "Approved", updatedAt: { lte: new Date(now.getTime() - 2 * 60 * 1000) } }
                ]
              }
            });
            
            if (failedRequests.length > 0) {
              console.log(`[BACKGROUND-JOB] Found ${failedRequests.length} stuck/failed request(s). Auto-retrying...`);
              const { autoDownloadBookRequest } = await import("../app/actions");
              for (const req of failedRequests) {
                try {
                  await prisma.bookRequest.update({
                    where: { id: req.id },
                    data: { status: "Approved (Retrying)" }
                    });
                    
                    autoDownloadBookRequest(req.id, req.title, req.author || "").catch(err => {
                    console.error(`[AUTO-DOWNLOAD-RETRY-BG] Failed for request "${req.title}":`, err.message || err);
                  });
                } catch (reqErr: any) {
                  console.error(`[BACKGROUND-JOB] Error auto-retrying request "${req.title}":`, reqErr.message || reqErr);
                }
              }
            }
          } catch (retryErr: any) {
            console.error("[BACKGROUND-JOB] Error in scheduled auto-retry runner:", retryErr.message || retryErr);
          }
          
          // Auto-approve and download any existing "Pending" requests
          try {
            const pendingRequests = await prisma.bookRequest.findMany({
              where: { status: "Pending" }
            });
            
            if (pendingRequests.length > 0) {
              console.log(`[BACKGROUND-JOB] Found ${pendingRequests.length} Pending request(s). Auto-approving and downloading...`);
              const { autoDownloadBookRequest } = await import("../app/actions");
              for (const req of pendingRequests) {
                try {
                  await prisma.bookRequest.update({
                    where: { id: req.id },
                    data: { status: "Approved" }
                  });
                  
                  autoDownloadBookRequest(req.id, req.title, req.author || "").catch(err => {
                    console.error(`[AUTO-DOWNLOAD-PENDING-BG] Failed for request "${req.title}":`, err.message || err);
                  });
                } catch (reqErr: any) {
                  console.error(`[BACKGROUND-JOB] Error auto-approving request "${req.title}":`, reqErr.message || reqErr);
                }
              }
            }
          } catch (pendingErr: any) {
            console.error("[BACKGROUND-JOB] Error in auto-approving pending requests:", pendingErr.message || pendingErr);
          }

          // Auto-discover missing installments for monitored series
          try {
            const monitoredRequests = await prisma.bookRequest.findMany({
              where: { monitorSeries: true }
            });

            if (monitoredRequests.length > 0) {
              const { findMissingBooksInSeries, autoDownloadBookRequest } = await import("../app/actions");
              const handledSeries = new Set<string>();

              for (const mReq of monitoredRequests) {
                const seriesKey = `${mReq.series || mReq.title}-${mReq.author || ""}`.toLowerCase();
                if (handledSeries.has(seriesKey)) continue;
                handledSeries.add(seriesKey);

                try {
                  const res = await findMissingBooksInSeries(mReq.series || mReq.title, mReq.author || "Unknown Author");
                  if (res && res.success && Array.isArray(res.data)) {
                    for (const missingBook of res.data) {
                      // Check if already requested or exists
                      const existing = await prisma.bookRequest.findFirst({
                        where: {
                          title: missingBook.title,
                          mediaType: mReq.mediaType || "ebook"
                        }
                      });

                      if (!existing) {
                        console.log(`[SERIES-MONITOR] Auto-requesting new installment "${missingBook.title}" in series "${mReq.series || mReq.title}" for ${mReq.requestedBy}...`);
                        const newReq = await prisma.bookRequest.create({
                          data: {
                            title: missingBook.title,
                            author: missingBook.author || mReq.author || "Unknown Author",
                            series: mReq.series || mReq.title,
                            volumeNumber: (missingBook as any).volumeNumber ? String((missingBook as any).volumeNumber) : null,
                            coverUrl: missingBook.coverUrl || null,
                            publishYear: (missingBook as any).year ? String((missingBook as any).year) : null,
                            requestedBy: mReq.requestedBy,
                            type: "book",
                            mediaType: mReq.mediaType || "ebook",
                            status: "Approved",
                            monitorSeries: true
                          }
                        });

                        autoDownloadBookRequest(newReq.id, newReq.title, newReq.author || "").catch(err => {
                          console.error(`[SERIES-MONITOR-DOWNLOAD] Failed for "${newReq.title}":`, err.message || err);
                        });
                      }
                    }
                  }
                } catch (seriesScanErr: any) {
                  console.warn(`[SERIES-MONITOR] Failed series scan for "${mReq.series || mReq.title}":`, seriesScanErr.message || seriesScanErr);
                }
              }
            }
          } catch (seriesErr: any) {
            console.error("[BACKGROUND-JOB] Error in series auto-monitor runner:", seriesErr.message || seriesErr);
          }

          await prisma.settings.upsert({
            where: { id: "global" },
            update: { lastAutoSync: new Date() },
            create: { id: "global", lastAutoSync: new Date() }
          });
          
          console.log("[BACKGROUND-JOB] Scheduled library scan completed.");
        }
      } catch (err: any) {
        console.error("[BACKGROUND-JOB] Error in scheduled job runner:", err.message || err);
      } finally {
        (global as any).__PORTALARR_SYNC_IN_PROGRESS = false;
      }
    }, 60 * 1000); // 1 minute check
  }, 10000); // Wait 10s after server starts
}

export default prisma;


