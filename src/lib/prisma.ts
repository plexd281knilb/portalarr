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

function ensureDatabaseFile() {
    try {
        const dbUrl = process.env.DATABASE_URL || "";
        if (dbUrl.startsWith("file:")) {
            const rawPath = dbUrl.replace("file:", "").trim();
            const targetPath = path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);
            
            const targetDir = path.dirname(targetPath);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }

            const targetExists = fs.existsSync(targetPath);
            const targetSize = targetExists ? fs.statSync(targetPath).size : 0;

            if (targetSize === 0) {
                const candidates = [
                    path.join(process.cwd(), "prisma", "dev.db"),
                    path.join(process.cwd(), "dev.db"),
                    "/app/prisma/dev.db",
                    "/app/dev.db"
                ];

                for (const candidate of candidates) {
                    if (candidate !== targetPath && fs.existsSync(candidate)) {
                        const candidateSize = fs.statSync(candidate).size;
                        if (candidateSize > 0) {
                            console.log(`[DB-MIGRATION] Restoring legacy database file from ${candidate} (${candidateSize} bytes) -> ${targetPath}`);
                            fs.copyFileSync(candidate, targetPath);
                            break;
                        }
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

let schemaPatched = false;

async function ensureSchemaColumns() {
    if (schemaPatched) return;
    schemaPatched = true;

    try {
        await prisma.$queryRawUnsafe(`PRAGMA journal_mode = WAL;`).catch(() => {});
        await prisma.$queryRawUnsafe(`PRAGMA busy_timeout = 5000;`).catch(() => {});
        await prisma.$queryRawUnsafe(`PRAGMA synchronous = NORMAL;`).catch(() => {});

        const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Library");`);
        const columns = tableInfo.map((c: any) => c.name);

        if (!columns.includes("restrictedUsers")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'restrictedUsers' column to Library table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "restrictedUsers" TEXT DEFAULT "";`);
        }
        if (!columns.includes("downloadCategory")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'downloadCategory' column to Library table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "downloadCategory" TEXT DEFAULT "books";`);
        }
        if (!columns.includes("mediaType")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'mediaType' column to Library table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "mediaType" TEXT DEFAULT "ebook";`);
        }
        if (!columns.includes("allowedUsers")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'allowedUsers' column to Library table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "allowedUsers" TEXT DEFAULT "";`);
        }
        if (!columns.includes("path")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'path' column to Library table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "path" TEXT DEFAULT "";`);
        }
        if (!columns.includes("description")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'description' column to Library table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Library" ADD COLUMN "description" TEXT DEFAULT "";`);
        }
    } catch (e: any) {
        console.error("[DB-SCHEMA-AUTOFIX] Failed to patch Library columns:", e.message || e);
    }

    try {
        const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("Book");`);
        const columns = tableInfo.map((c: any) => c.name);
        if (!columns.includes("mediaType")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'mediaType' column to Book table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Book" ADD COLUMN "mediaType" TEXT DEFAULT "ebook";`);
        }
        if (!columns.includes("series")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'series' column to Book table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Book" ADD COLUMN "series" TEXT;`);
        }
        if (!columns.includes("volumeNumber")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'volumeNumber' column to Book table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "Book" ADD COLUMN "volumeNumber" TEXT;`);
        }
    } catch (e: any) {}

    try {
        const tableInfo: any[] = await prisma.$queryRawUnsafe(`PRAGMA table_info("BookRequest");`);
        const columns = tableInfo.map((c: any) => c.name);
        if (!columns.includes("mediaType")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'mediaType' column to BookRequest table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "mediaType" TEXT DEFAULT "ebook";`);
        }
        if (!columns.includes("type")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'type' column to BookRequest table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "type" TEXT DEFAULT "book";`);
        }
        if (!columns.includes("series")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'series' column to BookRequest table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "series" TEXT;`);
        }
        if (!columns.includes("volumeNumber")) {
            console.log("[DB-SCHEMA-AUTOFIX] Adding missing 'volumeNumber' column to BookRequest table...");
            await prisma.$executeRawUnsafe(`ALTER TABLE "BookRequest" ADD COLUMN "volumeNumber" TEXT;`);
        }
    } catch (e: any) {}
}

ensureSchemaColumns();

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
            console.error("[BACKGROUND-JOB] Error in scheduled pending request runner:", pendingErr.message || pendingErr);
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


