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
                    "appUrl" TEXT,
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
                    "requireReferralForSignup" BOOLEAN NOT NULL DEFAULT 0,
                    "emailNotificationsEnabled" BOOLEAN NOT NULL DEFAULT 1,
                    "notifyUserApproval" BOOLEAN NOT NULL DEFAULT 1,
                    "notifyAdminNewUserRequest" BOOLEAN NOT NULL DEFAULT 1,
                    "notifyPasswordReset" BOOLEAN NOT NULL DEFAULT 1,
                    "notifyMediaRequests" BOOLEAN NOT NULL DEFAULT 1,
                    "notifySupportTickets" BOOLEAN NOT NULL DEFAULT 1,
                    "notifySendToKindle" BOOLEAN NOT NULL DEFAULT 1,
                    "tmdbApiKey" TEXT,
                    "traktClientId" TEXT,
                    "mdblistApiKey" TEXT,
                    "seerrAutoApproveAll" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrDefaultMovieProfileId" INTEGER,
                    "seerrDefaultTvProfileId" INTEGER,
                    "seerrDefaultMovieRootFolder" TEXT,
                    "seerrDefaultTvRootFolder" TEXT,
                    "seerrDefaultMovieAppId" TEXT,
                    "seerrDefaultMovie4kAppId" TEXT,
                    "seerrDefaultMovie4kProfileId" INTEGER,
                    "seerrDefaultMovie4kRootFolder" TEXT,
                    "seerrDefaultTvAppId" TEXT,
                    "seerrDefaultTv4kAppId" TEXT,
                    "seerrDefaultTv4kProfileId" INTEGER,
                    "seerrDefaultTv4kRootFolder" TEXT,
                    "seerrQuotaMovies" INTEGER DEFAULT 10,
                    "seerrQuotaTv" INTEGER DEFAULT 10,
                    "seerrQuotaDays" INTEGER DEFAULT 7,
                    "seerrNotificationOnAvailable" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrDiscordWebhookUrl" TEXT,
                    "seerrDiscordBotUsername" TEXT DEFAULT 'Portalarr',
                    "seerrDiscordBotAvatarUrl" TEXT,
                    "seerrDiscordNotifyPending" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrDiscordNotifyAutoApproved" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrDiscordNotifyApproved" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrDiscordNotifyDeclined" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrDiscordNotifyAvailable" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrDiscordNotifyFailed" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrEmailNotifyAdminNewRequest" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrEmailNotifyUserAutoApproved" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrEmailNotifyUserApproved" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrEmailNotifyUserDeclined" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrEmailNotifyUserAvailable" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrEmailNotifyUserFailed" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrFullAutoApprove" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrFullUnlimited" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrFullQuotaMovies" INTEGER DEFAULT 0,
                    "seerrFullQuotaTv" INTEGER DEFAULT 0,
                    "seerrFullQuotaDays" INTEGER DEFAULT 7,
                    "seerrTrialAutoApprove" BOOLEAN NOT NULL DEFAULT 0,
                    "seerrTrialQuotaMovies" INTEGER DEFAULT 3,
                    "seerrTrialQuotaTv" INTEGER DEFAULT 3,
                    "seerrTrialQuotaDays" INTEGER DEFAULT 7,
                    "seerrKidsAutoApprovePg" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrKidsRequireApprovalPg13" BOOLEAN NOT NULL DEFAULT 1,
                    "seerrKidsMovieAppId" TEXT,
                    "seerrKidsMovieProfileId" INTEGER,
                    "seerrKidsMovieRootFolder" TEXT,
                    "seerrKidsMovie4kAppId" TEXT,
                    "seerrKidsMovie4kProfileId" INTEGER,
                    "seerrKidsMovie4kRootFolder" TEXT,
                    "seerrKidsTvAppId" TEXT,
                    "seerrKidsTvProfileId" INTEGER,
                    "seerrKidsTvRootFolder" TEXT,
                    "seerrKidsTv4kAppId" TEXT,
                    "seerrKidsTv4kProfileId" INTEGER,
                    "seerrKidsTv4kRootFolder" TEXT,
                    "seerrAutoDual1080pFor4k" BOOLEAN NOT NULL DEFAULT 1,
                    "autoOverlaySync" BOOLEAN NOT NULL DEFAULT 1,
                    "autoCollectionSync" BOOLEAN NOT NULL DEFAULT 1,
                    "leavingSoonDiskThreshold" INTEGER DEFAULT 15,
                    "pruneWarningThresholdPercent" INTEGER DEFAULT 85,
                    "pruneDangerThresholdPercent" INTEGER DEFAULT 95,
                    "pruneTargetHeadroomGb" INTEGER DEFAULT 100,
                    "pruneEvaluateSeasons" BOOLEAN NOT NULL DEFAULT 1,
                    "enableAutoPruneDeletion" BOOLEAN NOT NULL DEFAULT 0,
                    "pruneDryRun" BOOLEAN NOT NULL DEFAULT 1,
                    "pruneTagCollection" BOOLEAN NOT NULL DEFAULT 1,
                    "pruneApplyOverlays" BOOLEAN NOT NULL DEFAULT 1,
                    "pruneDeleteFromArr" BOOLEAN NOT NULL DEFAULT 0,
                    "pruneDeleteFromDisk" BOOLEAN NOT NULL DEFAULT 0,
                    "pruneDaysNotice" INTEGER DEFAULT 14,
                    "pruneMinAgeDays" INTEGER DEFAULT 90,
                    "pruneUnwatchedMinAgeDays" INTEGER DEFAULT 90,
                    "pruneWatchedMinAgeDays" INTEGER DEFAULT 180,
                    "pruneUnwatchedOnly" BOOLEAN NOT NULL DEFAULT 1,
                    "enabledServersForOverlays" TEXT,
                    "enabledServersForCollections" TEXT,
                    "enabledServersForPruning" TEXT,
                    "comingSoonShares" TEXT,
                    "serverStorageConfig" TEXT,
                    "serverGuardRails" TEXT,
                    "placeholderDaysThreshold" INTEGER DEFAULT 90,
                    "placeholderTheatricalNoticeDays" INTEGER DEFAULT 60,
                    "placeholderDigitalCountdownDays" INTEGER DEFAULT 30,
                    "placeholderNowStreamingGraceDays" INTEGER DEFAULT 7,
                    "placeholderAutoPruneDays" INTEGER DEFAULT 14,
                    "placeholderBannerPosition" TEXT DEFAULT 'bottom',
                    "placeholderBannerTheme" TEXT DEFAULT 'indigo-purple',
                    "placeholderBannerFontSize" INTEGER DEFAULT 44,
                    "placeholderCustomText" TEXT,
                    "placeholderBannerTemplates" TEXT,
                    "placeholderEnabled" BOOLEAN NOT NULL DEFAULT 1,
                    "skipYoutubeTrailerDownloads" BOOLEAN NOT NULL DEFAULT 0,
                    "pruneBannerPosition" TEXT DEFAULT 'bottom',
                    "pruneBannerTheme" TEXT DEFAULT 'crimson-red',
                    "pruneBannerText" TEXT DEFAULT 'LEAVING SOON',
                    "pruneBannerFontSize" INTEGER DEFAULT 44,
                    "pruneBannerType" TEXT DEFAULT 'leaving_soon',
                    "pruneBannerTemplates" TEXT,
                    "pruneSortStrategy" TEXT DEFAULT 'combined_oldest',
                    "pruneOldestLimit" INTEGER DEFAULT 50,
                    "pruneRulePresets" TEXT,
                    "leavingSoonPromotedToHome" BOOLEAN NOT NULL DEFAULT 1,
                    "leavingSoonPromotedToRecommended" BOOLEAN NOT NULL DEFAULT 1,
                    "leavingSoonPromotedToSharedHome" BOOLEAN NOT NULL DEFAULT 1,
                    "leavingSoonHomeOrder" INTEGER DEFAULT 0,
                    "leavingSoonAutoThresholdDays" INTEGER DEFAULT 14,
                    "leavingSoonAutoHideEmpty" BOOLEAN NOT NULL DEFAULT 1,
                    "curationSyncEnabled" BOOLEAN NOT NULL DEFAULT 1,
                    "curationSyncSchedule" TEXT DEFAULT 'every_6_hours',
                    "curationSyncCron" TEXT,
                    "curationSyncOverlays" BOOLEAN NOT NULL DEFAULT 1,
                    "overlayIncrementalEnabled" BOOLEAN NOT NULL DEFAULT 1,
                    "overlayIncrementalSchedule" TEXT DEFAULT 'every_hour',
                    "overlayIncrementalBatchSize" INTEGER DEFAULT 200,
                    "overlayIncrementalLastRunAt" DATETIME,
                    "overlayRecheckEnabled" BOOLEAN NOT NULL DEFAULT 1,
                    "overlayRecheckSchedule" TEXT DEFAULT 'daily_4am',
                    "overlayRecheckScope" TEXT DEFAULT 'daily_recheck',
                    "overlayRecheckBatchSize" INTEGER DEFAULT 200,
                    "overlayRecheckLastRunAt" DATETIME,
                    "curationSyncCollections" BOOLEAN NOT NULL DEFAULT 1,
                    "curationSyncReleases" BOOLEAN NOT NULL DEFAULT 1,
                    "curationSyncPruning" BOOLEAN NOT NULL DEFAULT 1,
                    "curationSyncParentalTags" BOOLEAN NOT NULL DEFAULT 1,
                    "curationLastRunAt" DATETIME,
                    "curationLastRunStatus" TEXT,
                    "parentalTaggingEnabled" BOOLEAN NOT NULL DEFAULT 1,
                    "parentalTagFormat" TEXT DEFAULT 'prefix_category_severity',
                    "parentalTagPrefix" TEXT DEFAULT 'IMDb',
                    "parentalTagTarget" TEXT DEFAULT 'labels',
                    "parentalMinSeverity" TEXT DEFAULT 'Mild',
                    "parentalCategories" TEXT DEFAULT '["nudity","violence","profanity","alcohol","frightening"]',
                    "paymentEmailAutoScan" BOOLEAN NOT NULL DEFAULT 1,
                    "paymentEmailScanInterval" INTEGER DEFAULT 15,
                    "paymentLastScanAt" DATETIME,
                    "paymentLastScanResult" TEXT
                );
            `);

            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Settings");`);
            const cols = tableInfo.map((c: any) => c.name);

            const settingsAddCols: [string, string][] = [
                ["appUrl", `ALTER TABLE "Settings" ADD COLUMN "appUrl" TEXT;`],
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
                ["notifySendToKindle", `ALTER TABLE "Settings" ADD COLUMN "notifySendToKindle" BOOLEAN NOT NULL DEFAULT 1;`],
                ["tmdbApiKey", `ALTER TABLE "Settings" ADD COLUMN "tmdbApiKey" TEXT;`],
                ["traktClientId", `ALTER TABLE "Settings" ADD COLUMN "traktClientId" TEXT;`],
                ["mdblistApiKey", `ALTER TABLE "Settings" ADD COLUMN "mdblistApiKey" TEXT;`],
                ["autoOverlaySync", `ALTER TABLE "Settings" ADD COLUMN "autoOverlaySync" BOOLEAN NOT NULL DEFAULT 1;`],
                ["autoCollectionSync", `ALTER TABLE "Settings" ADD COLUMN "autoCollectionSync" BOOLEAN NOT NULL DEFAULT 1;`],
                ["leavingSoonDiskThreshold", `ALTER TABLE "Settings" ADD COLUMN "leavingSoonDiskThreshold" INTEGER DEFAULT 15;`],
                ["pruneWarningThresholdPercent", `ALTER TABLE "Settings" ADD COLUMN "pruneWarningThresholdPercent" INTEGER DEFAULT 85;`],
                ["pruneDangerThresholdPercent", `ALTER TABLE "Settings" ADD COLUMN "pruneDangerThresholdPercent" INTEGER DEFAULT 95;`],
                ["pruneTargetHeadroomGb", `ALTER TABLE "Settings" ADD COLUMN "pruneTargetHeadroomGb" INTEGER DEFAULT 100;`],
                ["pruneEvaluateSeasons", `ALTER TABLE "Settings" ADD COLUMN "pruneEvaluateSeasons" BOOLEAN NOT NULL DEFAULT 1;`],
                ["enableAutoPruneDeletion", `ALTER TABLE "Settings" ADD COLUMN "enableAutoPruneDeletion" BOOLEAN NOT NULL DEFAULT 0;`],
                ["pruneDryRun", `ALTER TABLE "Settings" ADD COLUMN "pruneDryRun" BOOLEAN NOT NULL DEFAULT 1;`],
                ["pruneTagCollection", `ALTER TABLE "Settings" ADD COLUMN "pruneTagCollection" BOOLEAN NOT NULL DEFAULT 1;`],
                ["pruneApplyOverlays", `ALTER TABLE "Settings" ADD COLUMN "pruneApplyOverlays" BOOLEAN NOT NULL DEFAULT 1;`],
                ["pruneDeleteFromArr", `ALTER TABLE "Settings" ADD COLUMN "pruneDeleteFromArr" BOOLEAN NOT NULL DEFAULT 0;`],
                ["pruneDeleteFromDisk", `ALTER TABLE "Settings" ADD COLUMN "pruneDeleteFromDisk" BOOLEAN NOT NULL DEFAULT 0;`],
                ["pruneDaysNotice", `ALTER TABLE "Settings" ADD COLUMN "pruneDaysNotice" INTEGER DEFAULT 14;`],
                ["pruneMinAgeDays", `ALTER TABLE "Settings" ADD COLUMN "pruneMinAgeDays" INTEGER DEFAULT 90;`],
                ["pruneUnwatchedOnly", `ALTER TABLE "Settings" ADD COLUMN "pruneUnwatchedOnly" BOOLEAN NOT NULL DEFAULT 1;`],
                ["enabledServersForOverlays", `ALTER TABLE "Settings" ADD COLUMN "enabledServersForOverlays" TEXT;`],
                ["enabledServersForCollections", `ALTER TABLE "Settings" ADD COLUMN "enabledServersForCollections" TEXT;`],
                ["enabledServersForPruning", `ALTER TABLE "Settings" ADD COLUMN "enabledServersForPruning" TEXT;`],
                ["comingSoonShares", `ALTER TABLE "Settings" ADD COLUMN "comingSoonShares" TEXT;`],
                ["serverStorageConfig", `ALTER TABLE "Settings" ADD COLUMN "serverStorageConfig" TEXT;`],
                ["serverGuardRails", `ALTER TABLE "Settings" ADD COLUMN "serverGuardRails" TEXT;`],
                ["placeholderDaysThreshold", `ALTER TABLE "Settings" ADD COLUMN "placeholderDaysThreshold" INTEGER DEFAULT 90;`],
                ["placeholderTheatricalNoticeDays", `ALTER TABLE "Settings" ADD COLUMN "placeholderTheatricalNoticeDays" INTEGER DEFAULT 60;`],
                ["placeholderDigitalCountdownDays", `ALTER TABLE "Settings" ADD COLUMN "placeholderDigitalCountdownDays" INTEGER DEFAULT 30;`],
                ["placeholderNowStreamingGraceDays", `ALTER TABLE "Settings" ADD COLUMN "placeholderNowStreamingGraceDays" INTEGER DEFAULT 7;`],
                ["placeholderAutoPruneDays", `ALTER TABLE "Settings" ADD COLUMN "placeholderAutoPruneDays" INTEGER DEFAULT 14;`],
                ["placeholderBannerPosition", `ALTER TABLE "Settings" ADD COLUMN "placeholderBannerPosition" TEXT DEFAULT 'bottom';`],
                ["placeholderBannerTheme", `ALTER TABLE "Settings" ADD COLUMN "placeholderBannerTheme" TEXT DEFAULT 'indigo-purple';`],
                ["placeholderBannerFontSize", `ALTER TABLE "Settings" ADD COLUMN "placeholderBannerFontSize" INTEGER DEFAULT 44;`],
                ["placeholderCustomText", `ALTER TABLE "Settings" ADD COLUMN "placeholderCustomText" TEXT;`],
                ["placeholderBannerTemplates", `ALTER TABLE "Settings" ADD COLUMN "placeholderBannerTemplates" TEXT;`],
                ["placeholderEnabled", `ALTER TABLE "Settings" ADD COLUMN "placeholderEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["skipYoutubeTrailerDownloads", `ALTER TABLE "Settings" ADD COLUMN "skipYoutubeTrailerDownloads" BOOLEAN NOT NULL DEFAULT 0;`],
                ["pruneBannerPosition", `ALTER TABLE "Settings" ADD COLUMN "pruneBannerPosition" TEXT DEFAULT 'bottom';`],
                ["pruneBannerTheme", `ALTER TABLE "Settings" ADD COLUMN "pruneBannerTheme" TEXT DEFAULT 'crimson-red';`],
                ["pruneBannerText", `ALTER TABLE "Settings" ADD COLUMN "pruneBannerText" TEXT DEFAULT 'LEAVING ON {date}';`],
                ["pruneBannerFontSize", `ALTER TABLE "Settings" ADD COLUMN "pruneBannerFontSize" INTEGER DEFAULT 44;`],
                ["pruneBannerType", `ALTER TABLE "Settings" ADD COLUMN "pruneBannerType" TEXT DEFAULT 'leaving_date';`],
                ["pruneBannerTemplates", `ALTER TABLE "Settings" ADD COLUMN "pruneBannerTemplates" TEXT;`],
                ["pruneSortStrategy", `ALTER TABLE "Settings" ADD COLUMN "pruneSortStrategy" TEXT DEFAULT 'combined_oldest';`],
                ["pruneOldestLimit", `ALTER TABLE "Settings" ADD COLUMN "pruneOldestLimit" INTEGER DEFAULT 50;`],
                ["pruneRulePresets", `ALTER TABLE "Settings" ADD COLUMN "pruneRulePresets" TEXT;`],
                ["leavingSoonPromotedToHome", `ALTER TABLE "Settings" ADD COLUMN "leavingSoonPromotedToHome" BOOLEAN NOT NULL DEFAULT 1;`],
                ["leavingSoonPromotedToRecommended", `ALTER TABLE "Settings" ADD COLUMN "leavingSoonPromotedToRecommended" BOOLEAN NOT NULL DEFAULT 1;`],
                ["leavingSoonPromotedToSharedHome", `ALTER TABLE "Settings" ADD COLUMN "leavingSoonPromotedToSharedHome" BOOLEAN NOT NULL DEFAULT 1;`],
                ["leavingSoonHomeOrder", `ALTER TABLE "Settings" ADD COLUMN "leavingSoonHomeOrder" INTEGER DEFAULT 0;`],
                ["leavingSoonAutoThresholdDays", `ALTER TABLE "Settings" ADD COLUMN "leavingSoonAutoThresholdDays" INTEGER DEFAULT 14;`],
                ["leavingSoonAutoHideEmpty", `ALTER TABLE "Settings" ADD COLUMN "leavingSoonAutoHideEmpty" BOOLEAN NOT NULL DEFAULT 1;`],
                ["curationSyncEnabled", `ALTER TABLE "Settings" ADD COLUMN "curationSyncEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["curationSyncSchedule", `ALTER TABLE "Settings" ADD COLUMN "curationSyncSchedule" TEXT DEFAULT 'every_6_hours';`],
                ["curationSyncCron", `ALTER TABLE "Settings" ADD COLUMN "curationSyncCron" TEXT;`],
                ["curationSyncOverlays", `ALTER TABLE "Settings" ADD COLUMN "curationSyncOverlays" BOOLEAN NOT NULL DEFAULT 1;`],
                ["curationSyncCollections", `ALTER TABLE "Settings" ADD COLUMN "curationSyncCollections" BOOLEAN NOT NULL DEFAULT 1;`],
                ["curationSyncReleases", `ALTER TABLE "Settings" ADD COLUMN "curationSyncReleases" BOOLEAN NOT NULL DEFAULT 1;`],
                ["curationSyncPruning", `ALTER TABLE "Settings" ADD COLUMN "curationSyncPruning" BOOLEAN NOT NULL DEFAULT 1;`],
                ["curationSyncParentalTags", `ALTER TABLE "Settings" ADD COLUMN "curationSyncParentalTags" BOOLEAN NOT NULL DEFAULT 1;`],
                ["curationLastRunAt", `ALTER TABLE "Settings" ADD COLUMN "curationLastRunAt" DATETIME;`],
                ["curationLastRunStatus", `ALTER TABLE "Settings" ADD COLUMN "curationLastRunStatus" TEXT;`],
                ["parentalTaggingEnabled", `ALTER TABLE "Settings" ADD COLUMN "parentalTaggingEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["parentalTagFormat", `ALTER TABLE "Settings" ADD COLUMN "parentalTagFormat" TEXT DEFAULT 'prefix_category_severity';`],
                ["parentalTagPrefix", `ALTER TABLE "Settings" ADD COLUMN "parentalTagPrefix" TEXT DEFAULT 'IMDb';`],
                ["parentalTagTarget", `ALTER TABLE "Settings" ADD COLUMN "parentalTagTarget" TEXT DEFAULT 'labels';`],
                ["parentalMinSeverity", `ALTER TABLE "Settings" ADD COLUMN "parentalMinSeverity" TEXT DEFAULT 'Mild';`],
                ["parentalCategories", `ALTER TABLE "Settings" ADD COLUMN "parentalCategories" TEXT DEFAULT '["nudity","violence","profanity","alcohol","frightening"]';`],
                ["enabledServersForTagging", `ALTER TABLE "Settings" ADD COLUMN "enabledServersForTagging" TEXT;`],
                ["paymentEmailAutoScan", `ALTER TABLE "Settings" ADD COLUMN "paymentEmailAutoScan" BOOLEAN NOT NULL DEFAULT 1;`],
                ["paymentEmailScanInterval", `ALTER TABLE "Settings" ADD COLUMN "paymentEmailScanInterval" INTEGER DEFAULT 15;`],
                ["paymentLastScanAt", `ALTER TABLE "Settings" ADD COLUMN "paymentLastScanAt" DATETIME;`],
                ["paymentLastScanResult", `ALTER TABLE "Settings" ADD COLUMN "paymentLastScanResult" TEXT;`],
                ["dismissedHubs", `ALTER TABLE "Settings" ADD COLUMN "dismissedHubs" TEXT;`],
                ["overlayIncrementalEnabled", `ALTER TABLE "Settings" ADD COLUMN "overlayIncrementalEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["overlayIncrementalSchedule", `ALTER TABLE "Settings" ADD COLUMN "overlayIncrementalSchedule" TEXT DEFAULT 'every_hour';`],
                ["overlayIncrementalBatchSize", `ALTER TABLE "Settings" ADD COLUMN "overlayIncrementalBatchSize" INTEGER DEFAULT 200;`],
                ["overlayIncrementalLastRunAt", `ALTER TABLE "Settings" ADD COLUMN "overlayIncrementalLastRunAt" DATETIME;`],
                ["overlayRecheckEnabled", `ALTER TABLE "Settings" ADD COLUMN "overlayRecheckEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["overlayRecheckSchedule", `ALTER TABLE "Settings" ADD COLUMN "overlayRecheckSchedule" TEXT DEFAULT 'daily_4am';`],
                ["overlayRecheckScope", `ALTER TABLE "Settings" ADD COLUMN "overlayRecheckScope" TEXT DEFAULT 'daily_recheck';`],
                ["overlayRecheckBatchSize", `ALTER TABLE "Settings" ADD COLUMN "overlayRecheckBatchSize" INTEGER DEFAULT 200;`],
                ["overlayRecheckLastRunAt", `ALTER TABLE "Settings" ADD COLUMN "overlayRecheckLastRunAt" DATETIME;`],
                ["pruneUnwatchedMinAgeDays", `ALTER TABLE "Settings" ADD COLUMN "pruneUnwatchedMinAgeDays" INTEGER DEFAULT 90;`],
                ["pruneWatchedMinAgeDays", `ALTER TABLE "Settings" ADD COLUMN "pruneWatchedMinAgeDays" INTEGER DEFAULT 180;`],
                ["seerrAutoApproveAll", `ALTER TABLE "Settings" ADD COLUMN "seerrAutoApproveAll" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrDefaultMovieAppId", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovieAppId" TEXT;`],
                ["seerrDefaultMovieProfileId", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovieProfileId" INTEGER;`],
                ["seerrDefaultMovieRootFolder", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovieRootFolder" TEXT;`],
                ["seerrDefaultMovie4kAppId", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovie4kAppId" TEXT;`],
                ["seerrDefaultMovie4kProfileId", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovie4kProfileId" INTEGER;`],
                ["seerrDefaultMovie4kRootFolder", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultMovie4kRootFolder" TEXT;`],
                ["seerrDefaultTvAppId", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTvAppId" TEXT;`],
                ["seerrDefaultTvProfileId", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTvProfileId" INTEGER;`],
                ["seerrDefaultTvRootFolder", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTvRootFolder" TEXT;`],
                ["seerrDefaultTv4kAppId", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTv4kAppId" TEXT;`],
                ["seerrDefaultTv4kProfileId", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTv4kProfileId" INTEGER;`],
                ["seerrDefaultTv4kRootFolder", `ALTER TABLE "Settings" ADD COLUMN "seerrDefaultTv4kRootFolder" TEXT;`],
                ["seerrQuotaMovies", `ALTER TABLE "Settings" ADD COLUMN "seerrQuotaMovies" INTEGER DEFAULT 10;`],
                ["seerrQuotaTv", `ALTER TABLE "Settings" ADD COLUMN "seerrQuotaTv" INTEGER DEFAULT 10;`],
                ["seerrQuotaDays", `ALTER TABLE "Settings" ADD COLUMN "seerrQuotaDays" INTEGER DEFAULT 7;`],
                ["seerrNotificationOnAvailable", `ALTER TABLE "Settings" ADD COLUMN "seerrNotificationOnAvailable" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrFullAutoApprove", `ALTER TABLE "Settings" ADD COLUMN "seerrFullAutoApprove" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrFullUnlimited", `ALTER TABLE "Settings" ADD COLUMN "seerrFullUnlimited" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrFullQuotaMovies", `ALTER TABLE "Settings" ADD COLUMN "seerrFullQuotaMovies" INTEGER DEFAULT 0;`],
                ["seerrFullQuotaTv", `ALTER TABLE "Settings" ADD COLUMN "seerrFullQuotaTv" INTEGER DEFAULT 0;`],
                ["seerrFullQuotaDays", `ALTER TABLE "Settings" ADD COLUMN "seerrFullQuotaDays" INTEGER DEFAULT 7;`],
                ["seerrTrialAutoApprove", `ALTER TABLE "Settings" ADD COLUMN "seerrTrialAutoApprove" BOOLEAN NOT NULL DEFAULT 0;`],
                ["seerrTrialQuotaMovies", `ALTER TABLE "Settings" ADD COLUMN "seerrTrialQuotaMovies" INTEGER DEFAULT 3;`],
                ["seerrTrialQuotaTv", `ALTER TABLE "Settings" ADD COLUMN "seerrTrialQuotaTv" INTEGER DEFAULT 3;`],
                ["seerrTrialQuotaDays", `ALTER TABLE "Settings" ADD COLUMN "seerrTrialQuotaDays" INTEGER DEFAULT 7;`],
                ["seerrKidsAutoApprovePg", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsAutoApprovePg" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrKidsRequireApprovalPg13", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsRequireApprovalPg13" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrKidsMovieAppId", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovieAppId" TEXT;`],
                ["seerrKidsMovieProfileId", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovieProfileId" INTEGER;`],
                ["seerrKidsMovieRootFolder", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovieRootFolder" TEXT;`],
                ["seerrKidsMovie4kAppId", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovie4kAppId" TEXT;`],
                ["seerrKidsMovie4kProfileId", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovie4kProfileId" INTEGER;`],
                ["seerrKidsMovie4kRootFolder", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsMovie4kRootFolder" TEXT;`],
                ["seerrKidsTvAppId", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsTvAppId" TEXT;`],
                ["seerrKidsTvProfileId", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsTvProfileId" INTEGER;`],
                ["seerrKidsTvRootFolder", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsTvRootFolder" TEXT;`],
                ["seerrKidsTv4kAppId", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsTv4kAppId" TEXT;`],
                ["seerrKidsTv4kProfileId", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsTv4kProfileId" INTEGER;`],
                ["seerrKidsTv4kRootFolder", `ALTER TABLE "Settings" ADD COLUMN "seerrKidsTv4kRootFolder" TEXT;`],
                ["seerrAutoDual1080pFor4k", `ALTER TABLE "Settings" ADD COLUMN "seerrAutoDual1080pFor4k" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrDiscordWebhookUrl", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordWebhookUrl" TEXT;`],
                ["seerrDiscordBotUsername", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordBotUsername" TEXT DEFAULT 'Portalarr';`],
                ["seerrDiscordBotAvatarUrl", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordBotAvatarUrl" TEXT;`],
                ["seerrDiscordNotifyPending", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordNotifyPending" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrDiscordNotifyAutoApproved", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordNotifyAutoApproved" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrDiscordNotifyApproved", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordNotifyApproved" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrDiscordNotifyDeclined", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordNotifyDeclined" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrDiscordNotifyAvailable", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordNotifyAvailable" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrDiscordNotifyFailed", `ALTER TABLE "Settings" ADD COLUMN "seerrDiscordNotifyFailed" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrEmailNotifyAdminNewRequest", `ALTER TABLE "Settings" ADD COLUMN "seerrEmailNotifyAdminNewRequest" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrEmailNotifyUserAutoApproved", `ALTER TABLE "Settings" ADD COLUMN "seerrEmailNotifyUserAutoApproved" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrEmailNotifyUserApproved", `ALTER TABLE "Settings" ADD COLUMN "seerrEmailNotifyUserApproved" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrEmailNotifyUserDeclined", `ALTER TABLE "Settings" ADD COLUMN "seerrEmailNotifyUserDeclined" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrEmailNotifyUserAvailable", `ALTER TABLE "Settings" ADD COLUMN "seerrEmailNotifyUserAvailable" BOOLEAN NOT NULL DEFAULT 1;`],
                ["seerrEmailNotifyUserFailed", `ALTER TABLE "Settings" ADD COLUMN "seerrEmailNotifyUserFailed" BOOLEAN NOT NULL DEFAULT 1;`],
                ["discordInviteUrl", `ALTER TABLE "Settings" ADD COLUMN "discordInviteUrl" TEXT;`],
                ["subscriptionGracePeriodDays", `ALTER TABLE "Settings" ADD COLUMN "subscriptionGracePeriodDays" INTEGER DEFAULT 3;`],
                ["membershipTiersEnabled", `ALTER TABLE "Settings" ADD COLUMN "membershipTiersEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["autoSuspendExpiredAccounts", `ALTER TABLE "Settings" ADD COLUMN "autoSuspendExpiredAccounts" BOOLEAN NOT NULL DEFAULT 0;`],
                ["notifyTrialWelcome", `ALTER TABLE "Settings" ADD COLUMN "notifyTrialWelcome" BOOLEAN NOT NULL DEFAULT 0;`],
                ["notifyTrialExpiring", `ALTER TABLE "Settings" ADD COLUMN "notifyTrialExpiring" BOOLEAN NOT NULL DEFAULT 0;`],
                ["notifyTrialExpired", `ALTER TABLE "Settings" ADD COLUMN "notifyTrialExpired" BOOLEAN NOT NULL DEFAULT 0;`],
                ["notifySubscriptionActive", `ALTER TABLE "Settings" ADD COLUMN "notifySubscriptionActive" BOOLEAN NOT NULL DEFAULT 0;`],
                ["notifyReferralReward", `ALTER TABLE "Settings" ADD COLUMN "notifyReferralReward" BOOLEAN NOT NULL DEFAULT 0;`],
                ["agregarrSyncEnabled", `ALTER TABLE "Settings" ADD COLUMN "agregarrSyncEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["agregarrSyncSchedule", `ALTER TABLE "Settings" ADD COLUMN "agregarrSyncSchedule" TEXT DEFAULT 'every_6_hours';`],
                ["agregarrLastRunAt", `ALTER TABLE "Settings" ADD COLUMN "agregarrLastRunAt" DATETIME;`],
                ["agregarrLastRunStatus", `ALTER TABLE "Settings" ADD COLUMN "agregarrLastRunStatus" TEXT;`],
                ["pruneSyncEnabled", `ALTER TABLE "Settings" ADD COLUMN "pruneSyncEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["pruneSyncSchedule", `ALTER TABLE "Settings" ADD COLUMN "pruneSyncSchedule" TEXT DEFAULT 'daily_5am';`],
                ["pruneLastRunAt", `ALTER TABLE "Settings" ADD COLUMN "pruneLastRunAt" DATETIME;`],
                ["pruneLastRunStatus", `ALTER TABLE "Settings" ADD COLUMN "pruneLastRunStatus" TEXT;`],
                ["taggingSyncEnabled", `ALTER TABLE "Settings" ADD COLUMN "taggingSyncEnabled" BOOLEAN NOT NULL DEFAULT 1;`],
                ["taggingSyncSchedule", `ALTER TABLE "Settings" ADD COLUMN "taggingSyncSchedule" TEXT DEFAULT 'daily_3am';`],
                ["taggingLastRunAt", `ALTER TABLE "Settings" ADD COLUMN "taggingLastRunAt" DATETIME;`],
                ["taggingLastRunStatus", `ALTER TABLE "Settings" ADD COLUMN "taggingLastRunStatus" TEXT;`]
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
                ["lastLogin", `ALTER TABLE "User" ADD COLUMN "lastLogin" DATETIME;`],
                ["accountType", `ALTER TABLE "User" ADD COLUMN "accountType" TEXT NOT NULL DEFAULT 'STANDARD';`],
                ["membershipTier", `ALTER TABLE "User" ADD COLUMN "membershipTier" TEXT NOT NULL DEFAULT 'STANDARD';`],
                ["canRequest", `ALTER TABLE "User" ADD COLUMN "canRequest" BOOLEAN NOT NULL DEFAULT 1;`],
                ["canRequest4k", `ALTER TABLE "User" ADD COLUMN "canRequest4k" BOOLEAN NOT NULL DEFAULT 0;`],
                ["autoApproveMovies", `ALTER TABLE "User" ADD COLUMN "autoApproveMovies" BOOLEAN NOT NULL DEFAULT 1;`],
                ["autoApproveTv", `ALTER TABLE "User" ADD COLUMN "autoApproveTv" BOOLEAN NOT NULL DEFAULT 1;`],
                ["requestLimitMovies", `ALTER TABLE "User" ADD COLUMN "requestLimitMovies" INTEGER DEFAULT 10;`],
                ["requestLimitTv", `ALTER TABLE "User" ADD COLUMN "requestLimitTv" INTEGER DEFAULT 10;`],
                ["requestLimitDays", `ALTER TABLE "User" ADD COLUMN "requestLimitDays" INTEGER DEFAULT 7;`]
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
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "PlexServer" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "url" TEXT NOT NULL,
                    "token" TEXT,
                    "clientIdentifier" TEXT,
                    "isDefault" BOOLEAN NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Auxiliary tables check error:", e.message || e);
        }

        // --- 5. LIBRARY TABLE ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "Library" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL UNIQUE,
                    "description" TEXT,
                    "path" TEXT NOT NULL DEFAULT '',
                    "allowedUsers" TEXT NOT NULL DEFAULT '',
                    "restrictedUsers" TEXT NOT NULL DEFAULT '',
                    "downloadCategory" TEXT NOT NULL DEFAULT 'books',
                    "mediaType" TEXT NOT NULL DEFAULT 'ebook',
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

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

        // --- 5.5 AUTHOR & BOOK SERIES TABLES ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "Author" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL UNIQUE,
                    "cleanName" TEXT,
                    "foreignAuthorId" TEXT,
                    "biography" TEXT,
                    "photoUrl" TEXT,
                    "birthDate" TEXT,
                    "deathDate" TEXT,
                    "monitored" BOOLEAN NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Author_cleanName_idx" ON "Author"("cleanName");`).catch(() => {});

            const authTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Author");`);
            const authCols = authTableInfo.map((c: any) => c.name);
            const authAddCols: [string, string][] = [
                ["cleanName", `ALTER TABLE "Author" ADD COLUMN "cleanName" TEXT;`],
                ["foreignAuthorId", `ALTER TABLE "Author" ADD COLUMN "foreignAuthorId" TEXT;`],
                ["biography", `ALTER TABLE "Author" ADD COLUMN "biography" TEXT;`],
                ["photoUrl", `ALTER TABLE "Author" ADD COLUMN "photoUrl" TEXT;`],
                ["birthDate", `ALTER TABLE "Author" ADD COLUMN "birthDate" TEXT;`],
                ["deathDate", `ALTER TABLE "Author" ADD COLUMN "deathDate" TEXT;`],
                ["monitored", `ALTER TABLE "Author" ADD COLUMN "monitored" BOOLEAN NOT NULL DEFAULT 0;`]
            ];
            for (const [colName, ddl] of authAddCols) {
                if (!authCols.includes(colName)) {
                    try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                }
            }
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Author table check error:", e.message || e);
        }

        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "BookSeries" (
                    "id" TEXT PRIMARY KEY,
                    "title" TEXT NOT NULL,
                    "cleanTitle" TEXT,
                    "authorId" TEXT,
                    "authorName" TEXT,
                    "foreignSeriesId" TEXT,
                    "description" TEXT,
                    "coverUrl" TEXT,
                    "totalVolumes" INTEGER,
                    "monitored" BOOLEAN NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "BookSeries_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author" ("id") ON DELETE CASCADE ON UPDATE CASCADE
                );
            `);
            await prisma.$executeRawUnsafe(`CREATE UNIQUE INDEX IF NOT EXISTS "BookSeries_title_authorName_key" ON "BookSeries"("title", "authorName");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BookSeries_authorId_idx" ON "BookSeries"("authorId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BookSeries_cleanTitle_idx" ON "BookSeries"("cleanTitle");`).catch(() => {});

            const seriesTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("BookSeries");`);
            const seriesCols = seriesTableInfo.map((c: any) => c.name);
            const seriesAddCols: [string, string][] = [
                ["cleanTitle", `ALTER TABLE "BookSeries" ADD COLUMN "cleanTitle" TEXT;`],
                ["authorId", `ALTER TABLE "BookSeries" ADD COLUMN "authorId" TEXT;`],
                ["authorName", `ALTER TABLE "BookSeries" ADD COLUMN "authorName" TEXT;`],
                ["foreignSeriesId", `ALTER TABLE "BookSeries" ADD COLUMN "foreignSeriesId" TEXT;`],
                ["description", `ALTER TABLE "BookSeries" ADD COLUMN "description" TEXT;`],
                ["coverUrl", `ALTER TABLE "BookSeries" ADD COLUMN "coverUrl" TEXT;`],
                ["totalVolumes", `ALTER TABLE "BookSeries" ADD COLUMN "totalVolumes" INTEGER;`],
                ["monitored", `ALTER TABLE "BookSeries" ADD COLUMN "monitored" BOOLEAN NOT NULL DEFAULT 0;`]
            ];
            for (const [colName, ddl] of seriesAddCols) {
                if (!seriesCols.includes(colName)) {
                    try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                }
            }
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] BookSeries table check error:", e.message || e);
        }

        // --- 6. BOOK TABLE ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "Book" (
                    "id" TEXT PRIMARY KEY,
                    "title" TEXT NOT NULL,
                    "author" TEXT,
                    "series" TEXT,
                    "volumeNumber" TEXT,
                    "coverUrl" TEXT,
                    "filePath" TEXT NOT NULL,
                    "fileSize" REAL,
                    "fileType" TEXT NOT NULL,
                    "mediaType" TEXT NOT NULL DEFAULT 'ebook',
                    "isbn" TEXT,
                    "asin" TEXT,
                    "narrator" TEXT,
                    "duration" REAL,
                    "chapters" TEXT,
                    "libraryId" TEXT NOT NULL,
                    "authorId" TEXT,
                    "seriesId" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "Book_libraryId_fkey" FOREIGN KEY ("libraryId") REFERENCES "Library" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
                    CONSTRAINT "Book_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "Author" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
                    CONSTRAINT "Book_seriesId_fkey" FOREIGN KEY ("seriesId") REFERENCES "BookSeries" ("id") ON DELETE SET NULL ON UPDATE CASCADE
                );
            `);

            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Book");`);
            const columns = tableInfo.map((c: any) => c.name);
            const bookAddCols: [string, string][] = [
                ["mediaType", `ALTER TABLE "Book" ADD COLUMN "mediaType" TEXT DEFAULT "ebook";`],
                ["series", `ALTER TABLE "Book" ADD COLUMN "series" TEXT;`],
                ["volumeNumber", `ALTER TABLE "Book" ADD COLUMN "volumeNumber" TEXT;`],
                ["coverUrl", `ALTER TABLE "Book" ADD COLUMN "coverUrl" TEXT;`],
                ["fileSize", `ALTER TABLE "Book" ADD COLUMN "fileSize" REAL;`],
                ["authorId", `ALTER TABLE "Book" ADD COLUMN "authorId" TEXT;`],
                ["seriesId", `ALTER TABLE "Book" ADD COLUMN "seriesId" TEXT;`],
                ["isbn", `ALTER TABLE "Book" ADD COLUMN "isbn" TEXT;`],
                ["asin", `ALTER TABLE "Book" ADD COLUMN "asin" TEXT;`],
                ["narrator", `ALTER TABLE "Book" ADD COLUMN "narrator" TEXT;`],
                ["duration", `ALTER TABLE "Book" ADD COLUMN "duration" REAL;`],
                ["chapters", `ALTER TABLE "Book" ADD COLUMN "chapters" TEXT;`]
            ];
            for (const [colName, ddl] of bookAddCols) {
                if (!columns.includes(colName)) {
                    try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                }
            }
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_authorId_idx" ON "Book"("authorId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_seriesId_idx" ON "Book"("seriesId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_libraryId_idx" ON "Book"("libraryId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_mediaType_idx" ON "Book"("mediaType");`).catch(() => {});
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Book table check error:", e.message || e);
        }

        // --- 7. BOOK REQUEST TABLE ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "BookRequest" (
                    "id" TEXT PRIMARY KEY,
                    "title" TEXT NOT NULL,
                    "author" TEXT,
                    "series" TEXT,
                    "volumeNumber" TEXT,
                    "coverUrl" TEXT,
                    "publishYear" TEXT,
                    "requestedBy" TEXT NOT NULL,
                    "requestedByUserId" TEXT,
                    "userEmail" TEXT,
                    "kindleEmail" TEXT,
                    "sendToKindle" BOOLEAN NOT NULL DEFAULT 0,
                    "type" TEXT NOT NULL DEFAULT 'book',
                    "mediaType" TEXT NOT NULL DEFAULT 'ebook',
                    "status" TEXT NOT NULL DEFAULT 'Pending',
                    "monitorSeries" BOOLEAN NOT NULL DEFAULT 0,
                    "libraryId" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("BookRequest");`);
            const columns = tableInfo.map((c: any) => c.name);
            const reqAddCols: [string, string][] = [
                ["mediaType", `ALTER TABLE "BookRequest" ADD COLUMN "mediaType" TEXT DEFAULT "ebook";`],
                ["type", `ALTER TABLE "BookRequest" ADD COLUMN "type" TEXT DEFAULT "book";`],
                ["series", `ALTER TABLE "BookRequest" ADD COLUMN "series" TEXT;`],
                ["volumeNumber", `ALTER TABLE "BookRequest" ADD COLUMN "volumeNumber" TEXT;`],
                ["monitorSeries", `ALTER TABLE "BookRequest" ADD COLUMN "monitorSeries" BOOLEAN DEFAULT 0;`],
                ["coverUrl", `ALTER TABLE "BookRequest" ADD COLUMN "coverUrl" TEXT;`],
                ["publishYear", `ALTER TABLE "BookRequest" ADD COLUMN "publishYear" TEXT;`],
                ["requestedByUserId", `ALTER TABLE "BookRequest" ADD COLUMN "requestedByUserId" TEXT;`],
                ["userEmail", `ALTER TABLE "BookRequest" ADD COLUMN "userEmail" TEXT;`],
                ["kindleEmail", `ALTER TABLE "BookRequest" ADD COLUMN "kindleEmail" TEXT;`],
                ["sendToKindle", `ALTER TABLE "BookRequest" ADD COLUMN "sendToKindle" BOOLEAN NOT NULL DEFAULT 0;`],
                ["libraryId", `ALTER TABLE "BookRequest" ADD COLUMN "libraryId" TEXT;`]
            ];
            for (const [colName, ddl] of reqAddCols) {
                if (!columns.includes(colName)) {
                    try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                }
            }
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] BookRequest table check error:", e.message || e);
        }

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

        // --- 10. EMAIL TEMPLATE TABLE ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "EmailTemplate" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "description" TEXT,
                    "subject" TEXT NOT NULL,
                    "body" TEXT NOT NULL,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Failed to create EmailTemplate table:", e.message || e);
        }

        // --- 10b. USER PREFERENCES (CONTENT & NOTIFICATIONS) ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "UserContentPreference" (
                    "id" TEXT PRIMARY KEY,
                    "userId" TEXT NOT NULL UNIQUE,
                    "excludedGenres" TEXT,
                    "excludedTags" TEXT,
                    "maxContentRating" TEXT,
                    "hideLeavingSoon" BOOLEAN NOT NULL DEFAULT 0,
                    "hideHorror" BOOLEAN NOT NULL DEFAULT 0,
                    "hideNsfw" BOOLEAN NOT NULL DEFAULT 0,
                    "hideGore" BOOLEAN NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "UserContentPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
                );
            `);
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "UserNotificationPreference" (
                    "id" TEXT PRIMARY KEY,
                    "userId" TEXT NOT NULL UNIQUE,
                    "emailMediaReady" BOOLEAN NOT NULL DEFAULT 1,
                    "emailNewContent" BOOLEAN NOT NULL DEFAULT 1,
                    "emailAnnouncements" BOOLEAN NOT NULL DEFAULT 1,
                    "emailSupportTickets" BOOLEAN NOT NULL DEFAULT 1,
                    "emailSubscriptionReminders" BOOLEAN NOT NULL DEFAULT 1,
                    "emailReferralRewards" BOOLEAN NOT NULL DEFAULT 1,
                    "discordMediaReady" BOOLEAN NOT NULL DEFAULT 0,
                    "discordAnnouncements" BOOLEAN NOT NULL DEFAULT 0,
                    "discordWebhookUrl" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "UserNotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
                );
            `);
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Failed to create User Preferences tables:", e.message || e);
        }

        // --- 11. CURATION, AGREGARR & KOMETA (PMM) TABLES & COLUMNS ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "MediaCollection" (
                    "id" TEXT PRIMARY KEY,
                    "title" TEXT NOT NULL,
                    "summary" TEXT,
                    "sortTitle" TEXT,
                    "type" TEXT NOT NULL DEFAULT 'curated',
                    "category" TEXT,
                    "serverId" TEXT,
                    "sectionKey" TEXT,
                    "sourceType" TEXT DEFAULT 'tmdb',
                    "sourceQuery" TEXT,
                    "rules" TEXT,
                    "posterUrl" TEXT,
                    "ratingKey" TEXT,
                    "itemCount" INTEGER NOT NULL DEFAULT 0,
                    "maxItems" INTEGER DEFAULT 0,
                    "excludedLabels" TEXT DEFAULT '',
                    "includePlaceholders" BOOLEAN DEFAULT 0,
                    "autoSync" BOOLEAN NOT NULL DEFAULT 1,
                    "syncInterval" TEXT NOT NULL DEFAULT 'daily',
                    "lastSyncedAt" DATETIME,
                    "orderIndex" INTEGER NOT NULL DEFAULT 0,
                    "promotedToHome" BOOLEAN NOT NULL DEFAULT 1,
                    "promotedToRecommended" BOOLEAN NOT NULL DEFAULT 1,
                    "promotedToSharedHome" BOOLEAN NOT NULL DEFAULT 1,
                    "collectionMode" TEXT DEFAULT 'default',
                    "sortPrefix" TEXT DEFAULT '!00_',
                    "activeDays" TEXT DEFAULT 'all',
                    "activeTimeRange" TEXT DEFAULT 'all_day',
                    "isSeasonal" BOOLEAN NOT NULL DEFAULT 0,
                    "scheduleStartMonth" INTEGER,
                    "scheduleStartDay" INTEGER,
                    "scheduleEndMonth" INTEGER,
                    "scheduleEndDay" INTEGER,
                    "seasonalAction" TEXT DEFAULT 'promote_hide',
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            try {
                const colTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("MediaCollection");`);
                const collCols = colTableInfo.map((c: any) => c.name);
                const collAddCols: [string, string][] = [
                    ["maxItems", `ALTER TABLE "MediaCollection" ADD COLUMN "maxItems" INTEGER DEFAULT 0;`],
                    ["excludedLabels", `ALTER TABLE "MediaCollection" ADD COLUMN "excludedLabels" TEXT DEFAULT '';`],
                    ["includePlaceholders", `ALTER TABLE "MediaCollection" ADD COLUMN "includePlaceholders" BOOLEAN DEFAULT 0;`],
                    ["orderIndex", `ALTER TABLE "MediaCollection" ADD COLUMN "orderIndex" INTEGER NOT NULL DEFAULT 0;`],
                    ["promotedToHome", `ALTER TABLE "MediaCollection" ADD COLUMN "promotedToHome" BOOLEAN NOT NULL DEFAULT 1;`],
                    ["promotedToRecommended", `ALTER TABLE "MediaCollection" ADD COLUMN "promotedToRecommended" BOOLEAN NOT NULL DEFAULT 1;`],
                    ["promotedToSharedHome", `ALTER TABLE "MediaCollection" ADD COLUMN "promotedToSharedHome" BOOLEAN NOT NULL DEFAULT 1;`],
                    ["collectionMode", `ALTER TABLE "MediaCollection" ADD COLUMN "collectionMode" TEXT DEFAULT 'default';`],
                    ["sortPrefix", `ALTER TABLE "MediaCollection" ADD COLUMN "sortPrefix" TEXT DEFAULT '!00_';`],
                    ["activeDays", `ALTER TABLE "MediaCollection" ADD COLUMN "activeDays" TEXT DEFAULT 'all';`],
                    ["activeTimeRange", `ALTER TABLE "MediaCollection" ADD COLUMN "activeTimeRange" TEXT DEFAULT 'all_day';`],
                    ["isSeasonal", `ALTER TABLE "MediaCollection" ADD COLUMN "isSeasonal" BOOLEAN NOT NULL DEFAULT 0;`],
                    ["scheduleStartMonth", `ALTER TABLE "MediaCollection" ADD COLUMN "scheduleStartMonth" INTEGER;`],
                    ["scheduleStartDay", `ALTER TABLE "MediaCollection" ADD COLUMN "scheduleStartDay" INTEGER;`],
                    ["scheduleEndMonth", `ALTER TABLE "MediaCollection" ADD COLUMN "scheduleEndMonth" INTEGER;`],
                    ["scheduleEndDay", `ALTER TABLE "MediaCollection" ADD COLUMN "scheduleEndDay" INTEGER;`],
                    ["seasonalAction", `ALTER TABLE "MediaCollection" ADD COLUMN "seasonalAction" TEXT DEFAULT 'promote_hide';`],
                    ["isIgnored", `ALTER TABLE "MediaCollection" ADD COLUMN "isIgnored" BOOLEAN NOT NULL DEFAULT 0;`]
                ];
                for (const [colName, ddl] of collAddCols) {
                    if (!collCols.includes(colName)) {
                        try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                    }
                }
            } catch (e) {}

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "MediaOverlayRule" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "serverId" TEXT,
                    "sectionKey" TEXT,
                    "overlayType" TEXT NOT NULL DEFAULT 'combined',
                    "position" TEXT NOT NULL DEFAULT 'top-right',
                    "videoPosition" TEXT DEFAULT 'top-right',
                    "audioPosition" TEXT DEFAULT 'top-left',
                    "editionPosition" TEXT DEFAULT 'bottom-right',
                    "ratingPosition" TEXT DEFAULT 'bottom-left',
                    "resolutionPosition" TEXT DEFAULT 'top-right',
                    "hdrPosition" TEXT DEFAULT 'top-right',
                    "codecPosition" TEXT DEFAULT 'top-right',
                    "channelsPosition" TEXT DEFAULT 'top-left',
                    "studioPosition" TEXT DEFAULT 'bottom-left',
                    "contentRatingPosition" TEXT DEFAULT 'bottom-left',
                    "ratingsPosition" TEXT DEFAULT 'bottom-left',
                    "showRibbon" BOOLEAN NOT NULL DEFAULT 0,
                    "ribbonPosition" TEXT NOT NULL DEFAULT 'top-right',
                    "ribbonTheme" TEXT NOT NULL DEFAULT 'purple',
                    "ribbonText" TEXT,
                    "ribbonType" TEXT NOT NULL DEFAULT 'auto_quality',
                    "theme" TEXT NOT NULL DEFAULT 'glass',
                    "badgeStyle" TEXT NOT NULL DEFAULT 'pill',
                    "showResolution" BOOLEAN NOT NULL DEFAULT 1,
                    "showHdr" BOOLEAN NOT NULL DEFAULT 1,
                    "showAudio" BOOLEAN NOT NULL DEFAULT 1,
                    "showRatings" BOOLEAN NOT NULL DEFAULT 0,
                    "showLeavingSoon" BOOLEAN NOT NULL DEFAULT 1,
                    "showAudioChannels" BOOLEAN NOT NULL DEFAULT 0,
                    "showCodec" BOOLEAN NOT NULL DEFAULT 0,
                    "showEdition" BOOLEAN NOT NULL DEFAULT 0,
                    "showStudio" BOOLEAN NOT NULL DEFAULT 0,
                    "showContentRating" BOOLEAN NOT NULL DEFAULT 0,
                    "customBadgeIds" TEXT,
                    "layerPriorityOrder" TEXT,
                    "enabled" BOOLEAN NOT NULL DEFAULT 1,
                    "itemCount" INTEGER NOT NULL DEFAULT 0,
                    "lastAppliedAt" DATETIME,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            try {
                const overlayTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("MediaOverlayRule");`);
                const overlayCols = overlayTableInfo.map((c: any) => c.name);
                const overlayAddCols: [string, string][] = [
                    ["videoPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "videoPosition" TEXT DEFAULT 'top-right';`],
                    ["audioPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "audioPosition" TEXT DEFAULT 'top-left';`],
                    ["editionPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "editionPosition" TEXT DEFAULT 'bottom-right';`],
                    ["ratingPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "ratingPosition" TEXT DEFAULT 'bottom-left';`],
                    ["resolutionPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "resolutionPosition" TEXT DEFAULT 'top-right';`],
                    ["hdrPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "hdrPosition" TEXT DEFAULT 'top-right';`],
                    ["codecPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "codecPosition" TEXT DEFAULT 'top-right';`],
                    ["channelsPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "channelsPosition" TEXT DEFAULT 'top-left';`],
                    ["studioPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "studioPosition" TEXT DEFAULT 'bottom-left';`],
                    ["contentRatingPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "contentRatingPosition" TEXT DEFAULT 'bottom-left';`],
                    ["ratingsPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "ratingsPosition" TEXT DEFAULT 'bottom-left';`],
                    ["showRibbon", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "showRibbon" BOOLEAN NOT NULL DEFAULT 0;`],
                    ["ribbonPosition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "ribbonPosition" TEXT NOT NULL DEFAULT 'top-right';`],
                    ["ribbonTheme", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "ribbonTheme" TEXT NOT NULL DEFAULT 'purple';`],
                    ["ribbonText", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "ribbonText" TEXT;`],
                    ["ribbonType", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "ribbonType" TEXT NOT NULL DEFAULT 'auto_quality';`],
                    ["showAudioChannels", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "showAudioChannels" BOOLEAN NOT NULL DEFAULT 0;`],
                    ["showCodec", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "showCodec" BOOLEAN NOT NULL DEFAULT 0;`],
                    ["showEdition", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "showEdition" BOOLEAN NOT NULL DEFAULT 0;`],
                    ["showStudio", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "showStudio" BOOLEAN NOT NULL DEFAULT 0;`],
                    ["showContentRating", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "showContentRating" BOOLEAN NOT NULL DEFAULT 0;`],
                    ["badgeScale", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "badgeScale" REAL DEFAULT 1.0;`],
                    ["categoryScales", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "categoryScales" TEXT;`],
                    ["customBadgeIds", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "customBadgeIds" TEXT;`],
                    ["layerPriorityOrder", `ALTER TABLE "MediaOverlayRule" ADD COLUMN "layerPriorityOrder" TEXT;`]
                ];
                for (const [colName, ddl] of overlayAddCols) {
                    if (!overlayCols.includes(colName)) {
                        try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                    }
                }
            } catch (e) {}

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "CustomBadge" (
                    "id" TEXT PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "category" TEXT NOT NULL DEFAULT 'custom',
                    "filePath" TEXT NOT NULL,
                    "fileType" TEXT NOT NULL DEFAULT 'png',
                    "mimeType" TEXT NOT NULL DEFAULT 'image/png',
                    "position" TEXT NOT NULL DEFAULT 'top-right',
                    "width" INTEGER NOT NULL DEFAULT 140,
                    "height" INTEGER NOT NULL DEFAULT 46,
                    "opacity" REAL NOT NULL DEFAULT 1.0,
                    "enabled" BOOLEAN NOT NULL DEFAULT 1,
                    "matchRule" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            try {
                const badgeTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("CustomBadge");`);
                const badgeCols = badgeTableInfo.map((c: any) => c.name);
                const badgeAddCols: [string, string][] = [
                    ["category", `ALTER TABLE "CustomBadge" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'custom';`],
                    ["fileType", `ALTER TABLE "CustomBadge" ADD COLUMN "fileType" TEXT NOT NULL DEFAULT 'png';`],
                    ["mimeType", `ALTER TABLE "CustomBadge" ADD COLUMN "mimeType" TEXT NOT NULL DEFAULT 'image/png';`],
                    ["position", `ALTER TABLE "CustomBadge" ADD COLUMN "position" TEXT NOT NULL DEFAULT 'top-right';`],
                    ["width", `ALTER TABLE "CustomBadge" ADD COLUMN "width" INTEGER NOT NULL DEFAULT 140;`],
                    ["height", `ALTER TABLE "CustomBadge" ADD COLUMN "height" INTEGER NOT NULL DEFAULT 46;`],
                    ["opacity", `ALTER TABLE "CustomBadge" ADD COLUMN "opacity" REAL NOT NULL DEFAULT 1.0;`],
                    ["enabled", `ALTER TABLE "CustomBadge" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT 1;`],
                    ["matchRule", `ALTER TABLE "CustomBadge" ADD COLUMN "matchRule" TEXT;`]
                ];
                for (const [colName, ddl] of badgeAddCols) {
                    if (!badgeCols.includes(colName)) {
                        try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                    }
                }
            } catch (e) {}

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "MediaArtBackup" (
                    "id" TEXT PRIMARY KEY,
                    "ratingKey" TEXT NOT NULL,
                    "serverId" TEXT,
                    "title" TEXT,
                    "originalArtUrl" TEXT,
                    "backupFilePath" TEXT NOT NULL,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await prisma.$executeRawUnsafe(`
                CREATE UNIQUE INDEX IF NOT EXISTS "MediaArtBackup_serverId_ratingKey_key" ON "MediaArtBackup"("serverId", "ratingKey");
            `);

            try {
                const backupTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("MediaArtBackup");`);
                const backupCols = backupTableInfo.map((c: any) => c.name);
                const backupAddCols: [string, string][] = [
                    ["mediaHash", `ALTER TABLE "MediaArtBackup" ADD COLUMN "mediaHash" TEXT;`],
                    ["appliedBadges", `ALTER TABLE "MediaArtBackup" ADD COLUMN "appliedBadges" TEXT;`]
                ];
                for (const [colName, ddl] of backupAddCols) {
                    if (!backupCols.includes(colName)) {
                        try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                    }
                }
            } catch (e) {}

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "UserContentPreference" (
                    "id" TEXT PRIMARY KEY,
                    "userId" TEXT NOT NULL UNIQUE,
                    "excludedGenres" TEXT,
                    "excludedTags" TEXT,
                    "maxContentRating" TEXT,
                    "hideLeavingSoon" BOOLEAN NOT NULL DEFAULT 0,
                    "hideHorror" BOOLEAN NOT NULL DEFAULT 0,
                    "hideNsfw" BOOLEAN NOT NULL DEFAULT 0,
                    "hideGore" BOOLEAN NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT "UserContentPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
                );
            `);

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "MediaContentAdvisory" (
                    "id" TEXT PRIMARY KEY,
                    "ratingKey" TEXT NOT NULL,
                    "serverId" TEXT,
                    "title" TEXT,
                    "imdbId" TEXT,
                    "tmdbId" TEXT,
                    "mpaaRating" TEXT,
                    "nudityLevel" TEXT,
                    "violenceLevel" TEXT,
                    "profanityLevel" TEXT,
                    "alcoholLevel" TEXT,
                    "frighteningLevel" TEXT,
                    "digitalReleaseDate" DATETIME,
                    "theatricalReleaseDate" DATETIME,
                    "inTheaters" BOOLEAN NOT NULL DEFAULT 0,
                    "isLeavingSoon" BOOLEAN NOT NULL DEFAULT 0,
                    "leavingSoonDate" DATETIME,
                    "leavingReason" TEXT,
                    "customTags" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await prisma.$executeRawUnsafe(`
                CREATE UNIQUE INDEX IF NOT EXISTS "MediaContentAdvisory_ratingKey_serverId_key" ON "MediaContentAdvisory"("ratingKey", "serverId");
            `);
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Failed to create Curation tables:", e.message || e);
        }

        // --- 11. PAYMENT EMAIL SOURCES & TRANSACTIONS TABLES ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "PaymentEmailSource" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "name" TEXT NOT NULL,
                    "host" TEXT NOT NULL,
                    "port" INTEGER NOT NULL DEFAULT 993,
                    "secure" BOOLEAN NOT NULL DEFAULT 1,
                    "user" TEXT NOT NULL,
                    "pass" TEXT NOT NULL,
                    "mailbox" TEXT NOT NULL DEFAULT 'INBOX',
                    "enabled" BOOLEAN NOT NULL DEFAULT 1,
                    "lastScannedAt" DATETIME,
                    "lastStatus" TEXT,
                    "lastUid" INTEGER NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "PaymentTransaction" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "sourceId" TEXT,
                    "provider" TEXT NOT NULL,
                    "externalTxId" TEXT,
                    "senderName" TEXT,
                    "senderEmail" TEXT,
                    "senderHandle" TEXT,
                    "amount" REAL NOT NULL,
                    "currency" TEXT NOT NULL DEFAULT 'USD',
                    "note" TEXT,
                    "emailSubject" TEXT NOT NULL,
                    "emailDate" DATETIME NOT NULL,
                    "emailUid" TEXT NOT NULL,
                    "matchedUserId" TEXT,
                    "status" TEXT NOT NULL DEFAULT 'UNMATCHED',
                    "appliedSubscription" BOOLEAN NOT NULL DEFAULT 0,
                    "subscriptionPeriodGranted" TEXT,
                    "adminNotes" TEXT,
                    "rawPayload" TEXT,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY ("sourceId") REFERENCES "PaymentEmailSource" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
                    FOREIGN KEY ("matchedUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
                );
            `);

            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentTransaction_matchedUserId_idx" ON "PaymentTransaction"("matchedUserId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentTransaction_provider_externalTxId_idx" ON "PaymentTransaction"("provider", "externalTxId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "PaymentTransaction_emailDate_idx" ON "PaymentTransaction"("emailDate");`).catch(() => {});
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Payment tables check error:", e.message || e);
        }

        // --- 12. MEDIA REQUESTS (SEERR REPLACEMENT) TABLE ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "MediaRequest" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "mediaType" TEXT NOT NULL,
                    "tmdbId" INTEGER,
                    "tvdbId" INTEGER,
                    "imdbId" TEXT,
                    "title" TEXT NOT NULL,
                    "releaseYear" TEXT,
                    "posterPath" TEXT,
                    "backdropPath" TEXT,
                    "overview" TEXT,
                    "status" TEXT NOT NULL DEFAULT 'PENDING',
                    "status4k" TEXT,
                    "is4k" BOOLEAN NOT NULL DEFAULT 0,
                    "isKids" BOOLEAN NOT NULL DEFAULT 0,
                    "contentRating" TEXT,
                    "isDual1080pChild" BOOLEAN NOT NULL DEFAULT 0,
                    "parent4kRequestId" TEXT,
                    "requestedByUserId" TEXT,
                    "requestedByUsername" TEXT NOT NULL,
                    "userEmail" TEXT,
                    "kindleEmail" TEXT,
                    "seasons" TEXT,
                    "bookAuthor" TEXT,
                    "bookSeries" TEXT,
                    "bookVolume" TEXT,
                    "bookLibraryId" TEXT,
                    "sendToKindle" BOOLEAN NOT NULL DEFAULT 0,
                    "format" TEXT,
                    "openLibraryId" TEXT,
                    "googleBooksId" TEXT,
                    "asin" TEXT,
                    "servarrAppId" TEXT,
                    "qualityProfileId" INTEGER,
                    "rootFolderPath" TEXT,
                    "servarrId" INTEGER,
                    "errorMessage" TEXT,
                    "downloadProgress" REAL,
                    "availableAt" DATETIME,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
                );
            `);

            const reqTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("MediaRequest");`);
            const reqCols = reqTableInfo.map((c: any) => c.name);
            const reqAddCols: [string, string][] = [
                ["isKids", `ALTER TABLE "MediaRequest" ADD COLUMN "isKids" BOOLEAN NOT NULL DEFAULT 0;`],
                ["contentRating", `ALTER TABLE "MediaRequest" ADD COLUMN "contentRating" TEXT;`],
                ["isDual1080pChild", `ALTER TABLE "MediaRequest" ADD COLUMN "isDual1080pChild" BOOLEAN NOT NULL DEFAULT 0;`],
                ["parent4kRequestId", `ALTER TABLE "MediaRequest" ADD COLUMN "parent4kRequestId" TEXT;`],
                ["userEmail", `ALTER TABLE "MediaRequest" ADD COLUMN "userEmail" TEXT;`],
                ["kindleEmail", `ALTER TABLE "MediaRequest" ADD COLUMN "kindleEmail" TEXT;`],
                ["bookAuthor", `ALTER TABLE "MediaRequest" ADD COLUMN "bookAuthor" TEXT;`],
                ["bookSeries", `ALTER TABLE "MediaRequest" ADD COLUMN "bookSeries" TEXT;`],
                ["bookVolume", `ALTER TABLE "MediaRequest" ADD COLUMN "bookVolume" TEXT;`],
                ["bookLibraryId", `ALTER TABLE "MediaRequest" ADD COLUMN "bookLibraryId" TEXT;`],
                ["sendToKindle", `ALTER TABLE "MediaRequest" ADD COLUMN "sendToKindle" BOOLEAN NOT NULL DEFAULT 0;`],
                ["format", `ALTER TABLE "MediaRequest" ADD COLUMN "format" TEXT;`],
                ["openLibraryId", `ALTER TABLE "MediaRequest" ADD COLUMN "openLibraryId" TEXT;`],
                ["googleBooksId", `ALTER TABLE "MediaRequest" ADD COLUMN "googleBooksId" TEXT;`],
                ["asin", `ALTER TABLE "MediaRequest" ADD COLUMN "asin" TEXT;`]
            ];
            for (const [colName, ddl] of reqAddCols) {
                if (!reqCols.includes(colName)) {
                    try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                }
            }

            // Check if tmdbId has a NOT NULL constraint on existing tables and migrate it to NULLABLE
            const tmdbCol = reqTableInfo.find((c: any) => c.name === "tmdbId");
            if (tmdbCol && (Number(tmdbCol.notnull) === 1 || tmdbCol.notnull == 1 || tmdbCol.notnull === true)) {
                try {
                    console.log("[DB-SCHEMA-AUTOFIX] Migrating MediaRequest table to relax NOT NULL constraint on tmdbId for books/audiobooks...");
                    const refreshedInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("MediaRequest");`);
                    const commonCols = refreshedInfo.map((c: any) => `"${c.name}"`).join(", ");

                    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=OFF;`);
                    await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "MediaRequest_migrating";`);
                    await prisma.$executeRawUnsafe(`
                        CREATE TABLE "MediaRequest_migrating" (
                            "id" TEXT NOT NULL PRIMARY KEY,
                            "mediaType" TEXT NOT NULL,
                            "tmdbId" INTEGER,
                            "tvdbId" INTEGER,
                            "imdbId" TEXT,
                            "title" TEXT NOT NULL,
                            "releaseYear" TEXT,
                            "posterPath" TEXT,
                            "backdropPath" TEXT,
                            "overview" TEXT,
                            "status" TEXT NOT NULL DEFAULT 'PENDING',
                            "status4k" TEXT,
                            "is4k" BOOLEAN NOT NULL DEFAULT 0,
                            "isKids" BOOLEAN NOT NULL DEFAULT 0,
                            "contentRating" TEXT,
                            "isDual1080pChild" BOOLEAN NOT NULL DEFAULT 0,
                            "parent4kRequestId" TEXT,
                            "requestedByUserId" TEXT,
                            "requestedByUsername" TEXT NOT NULL,
                            "userEmail" TEXT,
                            "kindleEmail" TEXT,
                            "seasons" TEXT,
                            "bookAuthor" TEXT,
                            "bookSeries" TEXT,
                            "bookVolume" TEXT,
                            "bookLibraryId" TEXT,
                            "sendToKindle" BOOLEAN NOT NULL DEFAULT 0,
                            "format" TEXT,
                            "openLibraryId" TEXT,
                            "googleBooksId" TEXT,
                            "asin" TEXT,
                            "servarrAppId" TEXT,
                            "qualityProfileId" INTEGER,
                            "rootFolderPath" TEXT,
                            "servarrId" INTEGER,
                            "errorMessage" TEXT,
                            "downloadProgress" REAL,
                            "availableAt" DATETIME,
                            "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                            FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
                        );
                    `);
                    await prisma.$executeRawUnsafe(`INSERT INTO "MediaRequest_migrating" (${commonCols}) SELECT ${commonCols} FROM "MediaRequest";`);
                    await prisma.$executeRawUnsafe(`DROP TABLE "MediaRequest";`);
                    await prisma.$executeRawUnsafe(`ALTER TABLE "MediaRequest_migrating" RENAME TO "MediaRequest";`);
                    await prisma.$executeRawUnsafe(`PRAGMA foreign_keys=ON;`);
                    console.log("[DB-SCHEMA-AUTOFIX] ✅ Successfully relaxed tmdbId constraint on MediaRequest.");
                } catch (migErr: any) {
                    console.error("[DB-SCHEMA-AUTOFIX] Failed MediaRequest tmdbId migration:", migErr.message || migErr);
                }
            }

            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MediaRequest_tmdbId_mediaType_idx" ON "MediaRequest"("tmdbId", "mediaType");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MediaRequest_status_idx" ON "MediaRequest"("status");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MediaRequest_requestedByUsername_idx" ON "MediaRequest"("requestedByUsername");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MediaRequest_requestedByUserId_idx" ON "MediaRequest"("requestedByUserId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "MediaRequest_mediaType_idx" ON "MediaRequest"("mediaType");`).catch(() => {});
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] MediaRequest table check error:", e.message || e);
        }

        // --- 13. STEP 5: AUTHOR, BOOKSERIES & BOOK RELATIONS ---
        try {
            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "Author" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "name" TEXT NOT NULL UNIQUE,
                    "cleanName" TEXT,
                    "foreignAuthorId" TEXT,
                    "biography" TEXT,
                    "photoUrl" TEXT,
                    "birthDate" TEXT,
                    "deathDate" TEXT,
                    "monitored" BOOLEAN NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                );
            `);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Author_cleanName_idx" ON "Author"("cleanName");`).catch(() => {});

            await prisma.$executeRawUnsafe(`
                CREATE TABLE IF NOT EXISTS "BookSeries" (
                    "id" TEXT NOT NULL PRIMARY KEY,
                    "title" TEXT NOT NULL,
                    "cleanTitle" TEXT,
                    "authorId" TEXT,
                    "authorName" TEXT,
                    "foreignSeriesId" TEXT,
                    "description" TEXT,
                    "coverUrl" TEXT,
                    "totalVolumes" INTEGER,
                    "monitored" BOOLEAN NOT NULL DEFAULT 0,
                    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY ("authorId") REFERENCES "Author" ("id") ON DELETE CASCADE ON UPDATE CASCADE
                );
            `);
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BookSeries_authorId_idx" ON "BookSeries"("authorId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "BookSeries_cleanTitle_idx" ON "BookSeries"("cleanTitle");`).catch(() => {});

            // Update Book table columns
            const bookTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Book");`);
            const bookCols = bookTableInfo.map((c: any) => c.name);
            const bookAddCols: [string, string][] = [
                ["authorId", `ALTER TABLE "Book" ADD COLUMN "authorId" TEXT;`],
                ["seriesId", `ALTER TABLE "Book" ADD COLUMN "seriesId" TEXT;`],
                ["isbn", `ALTER TABLE "Book" ADD COLUMN "isbn" TEXT;`],
                ["asin", `ALTER TABLE "Book" ADD COLUMN "asin" TEXT;`],
                ["narrator", `ALTER TABLE "Book" ADD COLUMN "narrator" TEXT;`],
                ["duration", `ALTER TABLE "Book" ADD COLUMN "duration" REAL;`],
                ["chapters", `ALTER TABLE "Book" ADD COLUMN "chapters" TEXT;`]
            ];
            for (const [colName, ddl] of bookAddCols) {
                if (!bookCols.includes(colName)) {
                    try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                }
            }
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_authorId_idx" ON "Book"("authorId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_seriesId_idx" ON "Book"("seriesId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_libraryId_idx" ON "Book"("libraryId");`).catch(() => {});
            await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Book_mediaType_idx" ON "Book"("mediaType");`).catch(() => {});

            // Update BookRequest table columns
            const bookReqTableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("BookRequest");`);
            const bookReqCols = bookReqTableInfo.map((c: any) => c.name);
            const bookReqAddCols: [string, string][] = [
                ["requestedByUserId", `ALTER TABLE "BookRequest" ADD COLUMN "requestedByUserId" TEXT;`],
                ["userEmail", `ALTER TABLE "BookRequest" ADD COLUMN "userEmail" TEXT;`],
                ["kindleEmail", `ALTER TABLE "BookRequest" ADD COLUMN "kindleEmail" TEXT;`],
                ["sendToKindle", `ALTER TABLE "BookRequest" ADD COLUMN "sendToKindle" BOOLEAN NOT NULL DEFAULT 0;`],
                ["libraryId", `ALTER TABLE "BookRequest" ADD COLUMN "libraryId" TEXT;`]
            ];
            for (const [colName, ddl] of bookReqAddCols) {
                if (!bookReqCols.includes(colName)) {
                    try { await prisma.$executeRawUnsafe(ddl); } catch (e) {}
                }
            }
        } catch (e: any) {
            console.error("[DB-SCHEMA-AUTOFIX] Author/BookSeries/Book table check error:", e.message || e);
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

// --- UNIVERSAL SCHEDULE HELPER ---
export function isScheduleDue(
  schedule: string | null | undefined,
  lastRunAt: Date | string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!schedule || schedule === "disabled" || schedule === "never" || schedule === "off") {
    return false;
  }

  const lastRun = lastRunAt ? new Date(lastRunAt) : null;
  const elapsedMs = lastRun && !isNaN(lastRun.getTime()) ? now.getTime() - lastRun.getTime() : Infinity;
  const s = schedule.toLowerCase().trim();

  // Hourly / Interval based (using slight buffer to prevent 1-min setInterval jitter from skipping)
  if (s === "every_hour" || s === "hourly" || s === "1h") {
    return elapsedMs >= 55 * 60 * 1000;
  }
  if (s === "every_2_hours" || s === "2h") {
    return elapsedMs >= (2 * 60 - 5) * 60 * 1000;
  }
  if (s === "every_3_hours" || s === "3h") {
    return elapsedMs >= (3 * 60 - 5) * 60 * 1000;
  }
  if (s === "every_4_hours" || s === "4h") {
    return elapsedMs >= (4 * 60 - 5) * 60 * 1000;
  }
  if (s === "every_6_hours" || s === "6h") {
    return elapsedMs >= (6 * 60 - 5) * 60 * 1000;
  }
  if (s === "every_12_hours" || s === "12h") {
    return elapsedMs >= (12 * 60 - 5) * 60 * 1000;
  }
  if (s === "every_24_hours" || s === "24h" || s === "daily_interval") {
    return elapsedMs >= (24 * 60 - 5) * 60 * 1000;
  }

  // Daily fixed hour (e.g. daily_3am, daily_4am, daily_5am, or daily_HH)
  let targetDailyHour: number | null = null;
  if (s === "daily_3am" || s === "3am") targetDailyHour = 3;
  else if (s === "daily_4am" || s === "4am") targetDailyHour = 4;
  else if (s === "daily_5am" || s === "5am") targetDailyHour = 5;
  else if (s.startsWith("daily_")) {
    const match = s.match(/daily_(\d+)(am|pm)?/);
    if (match) {
      let h = parseInt(match[1], 10);
      if (match[2] === "pm" && h < 12) h += 12;
      if (match[2] === "am" && h === 12) h = 0;
      targetDailyHour = h;
    }
  }

  if (targetDailyHour !== null) {
    const isTargetHour = now.getHours() === targetDailyHour;
    const isDifferentDay = !lastRun || lastRun.toDateString() !== now.toDateString();
    const hasBeenAtLeast12Hours = elapsedMs >= 12 * 60 * 60 * 1000;

    // Trigger during target hour window if not already run today
    if (isTargetHour && isDifferentDay && hasBeenAtLeast12Hours) {
      return true;
    }
    // Catch-up if server was offline during the target hour and hasn't run in >28 hours
    if (elapsedMs >= 28 * 60 * 60 * 1000) {
      return true;
    }
    return false;
  }

  // Weekly Sunday (default at 4:00 AM)
  if (s === "weekly_sun" || s === "weekly") {
    const isSunday = now.getDay() === 0;
    const isTargetHour = now.getHours() === 4;
    const isDifferentDay = !lastRun || lastRun.toDateString() !== now.toDateString();
    const hasBeenAtLeast4Days = elapsedMs >= 4 * 24 * 60 * 60 * 1000;

    if (isSunday && isTargetHour && isDifferentDay && hasBeenAtLeast4Days) {
      return true;
    }
    // Catch-up if missed and >8 days
    if (elapsedMs >= 8 * 24 * 60 * 60 * 1000) {
      return true;
    }
    return false;
  }

  // Monthly 1st (default at 4:00 AM)
  if (s === "monthly_1st" || s === "monthly") {
    const isFirstOfMonth = now.getDate() === 1;
    const isTargetHour = now.getHours() === 4;
    const isDifferentDay = !lastRun || lastRun.toDateString() !== now.toDateString();
    const hasBeenAtLeast20Days = elapsedMs >= 20 * 24 * 60 * 60 * 1000;

    if (isFirstOfMonth && isTargetHour && isDifferentDay && hasBeenAtLeast20Days) {
      return true;
    }
    // Catch-up if missed and >35 days
    if (elapsedMs >= 35 * 24 * 60 * 60 * 1000) {
      return true;
    }
    return false;
  }

  // Fallback: check if integer minutes or hours
  const num = parseInt(s, 10);
  if (!isNaN(num) && num > 0) {
    return elapsedMs >= (num * 60 - 5) * 1000;
  }

  return false;
}

// --- BACKGROUND SCHEDULER ---
const globalForScheduler = global as unknown as { schedulerInitialized?: boolean; lastSeerrSyncTime?: number };

if (!globalForScheduler.schedulerInitialized && !process.env.__PORTALARR_SCHEDULER_INITIALIZED) {
  globalForScheduler.schedulerInitialized = true;
  process.env.__PORTALARR_SCHEDULER_INITIALIZED = "true";

  // Let Next.js boot finish before running initial checks
  setTimeout(async () => {
    await ensureSchemaColumns();
    const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
    const intervalMinutes = settings?.autoSyncInterval || 5;
    console.log(`[BACKGROUND-SCHEDULER] Initializing Portalarr background scheduler (Interval: ${intervalMinutes}m)...`);
    console.log(`[PORTALARR] Server is fully booted, ready, and listening on http://0.0.0.0:3000`);

    // Auto-expire elapsed trials and subscriptions on boot
    try {
      const { expireDueTrialsAndSubscriptionsInternal } = await import("../app/actions");
      await expireDueTrialsAndSubscriptionsInternal();
    } catch (expErr: any) {
      console.warn("[BACKGROUND-SCHEDULER] Boot trial expiration check error:", expErr.message || expErr);
    }

    // Trigger initial boot scan for all libraries
    try {
      const { scanLibraryInternal } = await import("../app/actions");
      console.log(`[BACKGROUND-SCHEDULER] Triggering instant initial boot scan for all libraries...`);
      const libraries = await prisma.library.findMany();
      for (const lib of libraries) {
        try {
          console.log(`[BACKGROUND-SCHEDULER] Initial boot scan for "${lib.name}"...`);
          await scanLibraryInternal(lib.id);
        } catch (libErr: any) {
          console.error(`[BACKGROUND-SCHEDULER] Boot scan error for "${lib.name}":`, libErr.message || libErr);
        }
      }
    } catch (bootErr: any) {
      console.error(`[BACKGROUND-SCHEDULER] Boot scan failed:`, bootErr.message || bootErr);
    }
    
    // Main periodic scheduler loop: checks every 60 seconds
    setInterval(async () => {
      await ensureSchemaColumns().catch(() => {});
      const now = new Date();
      let settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);

      // 1. Trial & Subscription Expiration (Evaluated every minute)
      try {
        const { expireDueTrialsAndSubscriptionsInternal } = await import("../app/actions");
        await expireDueTrialsAndSubscriptionsInternal();
      } catch (trialExpErr: any) {
        console.warn("[BACKGROUND-SCHEDULER] 1-minute trial expiration check error:", trialExpErr.message || trialExpErr);
      }

      // 2. Poster Overlays Incremental Scan
      if (!(global as any).__PORTALARR_OVERLAY_INC_RUNNING) {
        const incEnabled = settings?.overlayIncrementalEnabled ?? true;
        const incSchedule = settings?.overlayIncrementalSchedule || "every_hour";
        const lastIncRun = settings?.overlayIncrementalLastRunAt;

        if (incEnabled && isScheduleDue(incSchedule, lastIncRun, now)) {
          (global as any).__PORTALARR_OVERLAY_INC_RUNNING = true;
          (async () => {
            try {
              console.log(`[OVERLAY-TIMER] Triggering scheduled incremental overlay scan (${incSchedule})...`);
              const { runOverlayIncrementalSyncInternal } = await import("../app/curation-actions");
              await runOverlayIncrementalSyncInternal();
            } catch (err: any) {
              console.error("[OVERLAY-TIMER] Error in incremental overlay background runner:", err.message || err);
            } finally {
              (global as any).__PORTALARR_OVERLAY_INC_RUNNING = false;
            }
          })();
        }
      }

      // 3. Poster Overlays Deep Library Recheck Scan
      if (!(global as any).__PORTALARR_OVERLAY_RECHECK_RUNNING) {
        const recheckEnabled = settings?.overlayRecheckEnabled ?? true;
        const recheckSchedule = settings?.overlayRecheckSchedule || "daily_4am";
        const lastRecheckRun = settings?.overlayRecheckLastRunAt;

        if (recheckEnabled && isScheduleDue(recheckSchedule, lastRecheckRun, now)) {
          (global as any).__PORTALARR_OVERLAY_RECHECK_RUNNING = true;
          (async () => {
            try {
              console.log(`[OVERLAY-TIMER] Triggering scheduled deep library recheck (${recheckSchedule})...`);
              const { runOverlayRecheckSyncInternal } = await import("../app/curation-actions");
              await runOverlayRecheckSyncInternal();
            } catch (err: any) {
              console.error("[OVERLAY-TIMER] Error in deep recheck background runner:", err.message || err);
            } finally {
              (global as any).__PORTALARR_OVERLAY_RECHECK_RUNNING = false;
            }
          })();
        }
      }

      // 4. Agregarr Collections Sync (Independent Studio Schedule)
      if (!(global as any).__PORTALARR_AGREGARR_RUNNING) {
        const agregarrEnabled = settings?.agregarrSyncEnabled ?? (settings?.curationSyncCollections ?? true);
        const agregarrSchedule = settings?.agregarrSyncSchedule || settings?.curationSyncSchedule || "every_6_hours";
        const lastAgregarrRun = settings?.agregarrLastRunAt || settings?.curationLastRunAt;

        if (agregarrEnabled && isScheduleDue(agregarrSchedule, lastAgregarrRun, now)) {
          (global as any).__PORTALARR_AGREGARR_RUNNING = true;
          (async () => {
            try {
              console.log(`[AGREGARR-TIMER] Triggering scheduled collection sync (${agregarrSchedule})...`);
              const { runAgregarrSyncInternal } = await import("../app/curation-actions");
              await runAgregarrSyncInternal();
            } catch (aErr: any) {
              console.error("[AGREGARR-TIMER] Error in Agregarr background runner:", aErr.message || aErr);
            } finally {
              (global as any).__PORTALARR_AGREGARR_RUNNING = false;
            }
          })();
        }
      }

      // 5. Maintainerr / Prune Leaving Soon Sync (Independent Studio Schedule)
      if (!(global as any).__PORTALARR_PRUNE_RUNNING) {
        const pruneEnabled = settings?.pruneSyncEnabled ?? (settings?.curationSyncPruning ?? true);
        const pruneSchedule = settings?.pruneSyncSchedule || "daily_5am";
        const lastPruneRun = settings?.pruneLastRunAt;

        if (pruneEnabled && isScheduleDue(pruneSchedule, lastPruneRun, now)) {
          (global as any).__PORTALARR_PRUNE_RUNNING = true;
          (async () => {
            try {
              console.log(`[MAINTAINERR-TIMER] Triggering scheduled prune sync (${pruneSchedule})...`);
              const { runMaintainerrSyncInternal } = await import("../app/curation-actions");
              await runMaintainerrSyncInternal();
            } catch (pErr: any) {
              console.error("[MAINTAINERR-TIMER] Error in Maintainerr background runner:", pErr.message || pErr);
            } finally {
              (global as any).__PORTALARR_PRUNE_RUNNING = false;
            }
          })();
        }
      }

      // 6. IMDb Parental Rating Tagging Sync (Independent Studio Schedule)
      if (!(global as any).__PORTALARR_TAGGING_RUNNING) {
        const taggingEnabled = settings?.taggingSyncEnabled ?? (settings?.parentalTaggingEnabled ?? (settings?.curationSyncParentalTags ?? true));
        const taggingSchedule = settings?.taggingSyncSchedule || "daily_3am";
        const lastTaggingRun = settings?.taggingLastRunAt;

        if (taggingEnabled && isScheduleDue(taggingSchedule, lastTaggingRun, now)) {
          (global as any).__PORTALARR_TAGGING_RUNNING = true;
          (async () => {
            try {
              console.log(`[TAGGING-TIMER] Triggering scheduled IMDb parental tagging sync (${taggingSchedule})...`);
              const { runParentalTagsSyncInternal } = await import("../app/curation-actions");
              await runParentalTagsSyncInternal();
            } catch (tErr: any) {
              console.error("[TAGGING-TIMER] Error in Tagging background runner:", tErr.message || tErr);
            } finally {
              (global as any).__PORTALARR_TAGGING_RUNNING = false;
            }
          })();
        }
      }

      // 5. Payment Email Scraper Scan
      if (!(global as any).__PORTALARR_PAYMENT_SCAN_RUNNING) {
        const paymentAutoScan = settings?.paymentEmailAutoScan ?? true;
        if (paymentAutoScan) {
          const scanIntervalMin = settings?.paymentEmailScanInterval || 15;
          const requiredIntervalMs = (scanIntervalMin * 60 - 5) * 1000;
          const lastScan = settings?.paymentLastScanAt;

          if (!lastScan || (now.getTime() - lastScan.getTime()) >= requiredIntervalMs) {
            (global as any).__PORTALARR_PAYMENT_SCAN_RUNNING = true;
            (async () => {
              try {
                const activeSourcesCount = await prisma.paymentEmailSource.count({ where: { enabled: true } }).catch(() => 0);
                if (activeSourcesCount > 0) {
                  console.log(`[PAYMENT-TIMER] Triggering scheduled payment email scan for ${activeSourcesCount} source(s) (every ${scanIntervalMin}m)...`);
                }
                const { scanPaymentEmailsInternal } = await import("./payment-email-scraper");
                await scanPaymentEmailsInternal();
              } catch (pErr: any) {
                console.error("[PAYMENT-TIMER] Error in payment email scraper background runner:", pErr.message || pErr);
              } finally {
                (global as any).__PORTALARR_PAYMENT_SCAN_RUNNING = false;
              }
            })();
          }
        }
      }

      // 6. Media Requests (Seerr) Queue & Availability Background Sync (every 2 minutes)
      if (!(global as any).__PORTALARR_SEERR_SYNC_RUNNING) {
        const lastSeerrTime = globalForScheduler.lastSeerrSyncTime || 0;
        if (now.getTime() - lastSeerrTime >= 2 * 60 * 1000) {
          globalForScheduler.lastSeerrSyncTime = now.getTime();
          (global as any).__PORTALARR_SEERR_SYNC_RUNNING = true;
          (async () => {
            try {
              const { syncMediaRequestsQueueAndAvailabilityInternal } = await import("../app/seerr-actions");
              await syncMediaRequestsQueueAndAvailabilityInternal();
            } catch (seerrErr: any) {
              console.error("[SEERR-SYNC-TIMER] Error in media requests queue sync:", seerrErr.message || seerrErr);
            } finally {
              (global as any).__PORTALARR_SEERR_SYNC_RUNNING = false;
            }
          })();
        }
      }

      // 7. Library Auto-Scan, Plex Friends Sync, and Book Requests Retry
      if (!(global as any).__PORTALARR_LIBRARY_SCAN_RUNNING) {
        const intervalMinutes = settings?.autoSyncInterval || 5;
        const lastSync = settings?.lastAutoSync;

        if (!lastSync || (now.getTime() - lastSync.getTime()) >= (intervalMinutes * 60 - 5) * 1000) {
          (global as any).__PORTALARR_LIBRARY_SCAN_RUNNING = true;
          (async () => {
            try {
              console.log(`[BACKGROUND-SCHEDULER] Starting scheduled library scan and Plex friends sync (Interval: ${intervalMinutes}m)...`);
              const { scanLibraryInternal, syncPlexFriendsInternal } = await import("../app/actions");

              // Sync Plex Friends list and user accounts
              try {
                console.log(`[BACKGROUND-SCHEDULER] Syncing Plex friends...`);
                await syncPlexFriendsInternal();
              } catch (plexErr: any) {
                console.error(`[BACKGROUND-SCHEDULER] Error syncing Plex friends:`, plexErr.message || plexErr);
              }

              // Scan configured libraries
              const libraries = await prisma.library.findMany();
              for (const lib of libraries) {
                try {
                  console.log(`[BACKGROUND-SCHEDULER] Scanning library "${lib.name}"...`);
                  await scanLibraryInternal(lib.id);
                } catch (libErr: any) {
                  console.error(`[BACKGROUND-SCHEDULER] Error scanning library "${lib.name}":`, libErr.message || libErr);
                }
              }

              // Check for failed/stuck requests to auto-retry
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
                  console.log(`[BACKGROUND-SCHEDULER] Found ${failedRequests.length} stuck/failed request(s). Auto-retrying...`);
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
                      console.error(`[BACKGROUND-SCHEDULER] Error auto-retrying request "${req.title}":`, reqErr.message || reqErr);
                    }
                  }
                }
              } catch (retryErr: any) {
                console.error("[BACKGROUND-SCHEDULER] Error in scheduled auto-retry runner:", retryErr.message || retryErr);
              }

              // Auto-approve and download any existing "Pending" requests
              try {
                const pendingRequests = await prisma.bookRequest.findMany({
                  where: { status: "Pending" }
                });

                if (pendingRequests.length > 0) {
                  console.log(`[BACKGROUND-SCHEDULER] Found ${pendingRequests.length} Pending request(s). Auto-approving and downloading...`);
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
                      console.error(`[BACKGROUND-SCHEDULER] Error auto-approving request "${req.title}":`, reqErr.message || reqErr);
                    }
                  }
                }
              } catch (pendingErr: any) {
                console.error("[BACKGROUND-SCHEDULER] Error in auto-approving pending requests:", pendingErr.message || pendingErr);
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
                console.error("[BACKGROUND-SCHEDULER] Error in series auto-monitor runner:", seriesErr.message || seriesErr);
              }

              await prisma.settings.upsert({
                where: { id: "global" },
                update: { lastAutoSync: new Date() },
                create: { id: "global", lastAutoSync: new Date() }
              });

              console.log("[BACKGROUND-SCHEDULER] Scheduled library scan completed.");
            } catch (err: any) {
              console.error("[BACKGROUND-SCHEDULER] Error in scheduled library scan runner:", err.message || err);
            } finally {
              (global as any).__PORTALARR_LIBRARY_SCAN_RUNNING = false;
            }
          })();
        }
      }
    }, 60 * 1000); // 1 minute ticker
  }, 10000); // Wait 10s after server starts
}

export default prisma;


