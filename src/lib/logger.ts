export type LogCategory = 
    | "PLEX" 
    | "TAUTULLI" 
    | "SCANNER" 
    | "DOWNLOAD" 
    | "AI_AGENT" 
    | "COVER" 
    | "AUTH" 
    | "KINDLE" 
    | "EMAIL" 
    | "APPS" 
    | "DATABASE" 
    | "API" 
    | "SYSTEM"
    | "CURATION"
    | "SETTINGS"
    | "SEERR"
    | "BOOK_ENGINE"
    | "PLEX_HUB"; // backward compatibility

export interface SystemLogEntry {
    id: string;
    timestamp: string;
    level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "SYSTEM";
    category: LogCategory;
    message: string;
    details?: string;
}

export function maskToken(token?: string | null): string {
    if (!token) return "none";
    const clean = token.trim();
    if (clean.length <= 6) return "***";
    return `${clean.slice(0, 3)}...${clean.slice(-3)}`;
}

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

import fs from 'fs';
import path from 'path';
import os from 'os';

const getDataDir = (): string => {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        try {
            fs.mkdirSync(dataDir, { recursive: true });
        } catch (e) {
            // Read-only filesystem or restricted environment: fall back to tmpdir
            return os.tmpdir();
        }
    }
    return dataDir;
};

const dataDir = getDataDir();
const logFilePath = path.join(dataDir, 'system_logs.jsonl');
const buildMarkerFilePath = path.join(dataDir, '.portalarr_build_id');

function getCurrentBuildIdentifier(): string {
    // 1. Next.js statically baked build timestamp from next.config.ts
    if (process.env.PORTALARR_BUILD_TIMESTAMP) {
        return `v${process.env.PORTALARR_BUILD_VERSION || '3.0'}_${process.env.PORTALARR_BUILD_TIMESTAMP}`;
    }

    // 2. Custom build ID env (if injected by Docker or CI/CD)
    if (process.env.PORTALARR_BUILD_ID) {
        return process.env.PORTALARR_BUILD_ID.trim();
    }

    // 3. Next.js standalone .next/BUILD_ID file
    try {
        const buildIdPath = path.join(process.cwd(), '.next', 'BUILD_ID');
        if (fs.existsSync(buildIdPath)) {
            const id = fs.readFileSync(buildIdPath, 'utf8').trim();
            if (id) return `build_${id}`;
        }
    } catch (e) {}

    // 4. Git commit hash if running in a Git repository
    try {
        const gitHeadPath = path.join(process.cwd(), '.git', 'HEAD');
        if (fs.existsSync(gitHeadPath)) {
            const headRef = fs.readFileSync(gitHeadPath, 'utf8').trim();
            if (headRef.startsWith('ref:')) {
                const refPath = path.join(process.cwd(), '.git', headRef.replace(/^ref:\s*/, ''));
                if (fs.existsSync(refPath)) {
                    return `git_${fs.readFileSync(refPath, 'utf8').trim().substring(0, 10)}`;
                }
            } else if (headRef) {
                return `git_${headRef.substring(0, 10)}`;
            }
        }
    } catch (e) {}

    // 5. Package.json version + file stat mtime
    try {
        const pkgPath = path.join(process.cwd(), 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
            const stat = fs.statSync(pkgPath);
            return `pkg_${pkg.version || '1.0.0'}_${Math.floor(stat.mtimeMs)}`;
        }
    } catch (e) {}

    return 'portalarr_dev';
}

class SystemLogger {
    private logs: SystemLogEntry[] = [];
    private maxLogs = 5000;
    private writeCount = 0;
    private diskLoaded = false;

    constructor() {
        this.loadRecentLogsFromDisk();
        if (this.logs.length === 0) {
            this.addLog("INFO", "SYSTEM", "Portalarr System Logger Initialized. Capturing real-time activity stream.", undefined, true);
        }
    }

    private loadRecentLogsFromDisk() {
        if (this.diskLoaded) return;
        this.diskLoaded = true;

        const currentBuildId = getCurrentBuildIdentifier();

        try {
            let previousBuildId: string | null = null;
            if (fs.existsSync(buildMarkerFilePath)) {
                try {
                    previousBuildId = fs.readFileSync(buildMarkerFilePath, 'utf8').trim();
                } catch (e) {}
            }

            // CRITICAL: If a new update was pushed or a new container image was deployed
            // (i.e. previous build marker exists and differs from current build ID),
            // reset/clear previous container logs fresh for the new version.
            if (previousBuildId && previousBuildId !== currentBuildId) {
                this.logs = [];
                try {
                    fs.writeFileSync(logFilePath, '');
                    fs.writeFileSync(buildMarkerFilePath, currentBuildId);
                } catch (e) {}

                this.addLog(
                    "SYSTEM",
                    "SYSTEM",
                    `🚀 Portalarr updated to new release (${currentBuildId}). Previous container logs were cleared for the fresh deployment.`,
                    undefined,
                    false
                );
                return;
            }

            // Record current build ID if not set yet
            if (!previousBuildId || previousBuildId !== currentBuildId) {
                try {
                    fs.writeFileSync(buildMarkerFilePath, currentBuildId);
                } catch (e) {}
            }

            if (fs.existsSync(logFilePath)) {
                const lines = fs.readFileSync(logFilePath, 'utf8').trim().split('\n').filter(Boolean);
                const recent = lines.slice(-this.maxLogs);
                this.logs = recent.map(l => {
                    try {
                        const parsed = JSON.parse(l);
                        if (parsed.category === "PLEX_HUB") parsed.category = "PLEX";
                        return parsed;
                    } catch (err) {
                        return null; // Ignore corrupted interleaved lines
                    }
                }).filter(Boolean).reverse();
            }
        } catch (e) {
            // Ignore disk load error
        }
    }

    public addLog(
        level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "SYSTEM",
        category: LogCategory,
        message: string,
        details?: string,
        preventConsoleOutput = false
    ) {
        if (!this.diskLoaded) {
            this.loadRecentLogsFromDisk();
        }

        // Normalize legacy categories
        let finalCategory: LogCategory = category;
        if (category === "PLEX_HUB") finalCategory = "PLEX";

        const entry: SystemLogEntry = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
            level,
            category: finalCategory,
            message,
            details
        };

        this.logs.unshift(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        try {
            fs.appendFileSync(logFilePath, JSON.stringify(entry) + '\n');
            this.writeCount++;
            
            // Clean up file periodically to prevent infinite growth
            if (this.writeCount > 500) {
                this.writeCount = 0;
                if (fs.existsSync(logFilePath)) {
                    const lines = fs.readFileSync(logFilePath, 'utf8').trim().split('\n').filter(Boolean);
                    if (lines.length > this.maxLogs * 1.5) {
                        fs.writeFileSync(logFilePath, lines.slice(-this.maxLogs).join('\n') + '\n');
                    }
                }
            }
        } catch (e) {
            // Ignore write errors
        }

        if (!preventConsoleOutput) {
            const prefix = `[${entry.timestamp.substring(11, 19)}] [${entry.category}] [${entry.level}]`;
            if (level === "ERROR") {
                originalConsoleError(`${prefix} ❌ ${message}`, details || "");
            } else if (level === "WARN") {
                originalConsoleWarn(`${prefix} ⚠️ ${message}`, details || "");
            } else {
                originalConsoleLog(`${prefix} ${message}`, details || "");
            }
        }
    }

    public getLogs(limit = 1000, sinceId?: string): SystemLogEntry[] {
        if (!this.diskLoaded) {
            this.loadRecentLogsFromDisk();
        }

        const safeLimit = Math.min(Math.max(1, limit), this.maxLogs);

        if (sinceId) {
            const idx = this.logs.findIndex(l => l.id === sinceId);
            if (idx === 0) {
                // Client already has the most recent log
                return [];
            }
            if (idx > 0) {
                // Return all entries newer than sinceId
                return this.logs.slice(0, idx);
            }
            // If sinceId was not found (e.g. pushed out of ring buffer), return the latest safeLimit logs
            return this.logs.slice(0, safeLimit);
        }

        return this.logs.slice(0, safeLimit);
    }

    public getTotalCount(): number {
        if (!this.diskLoaded) {
            this.loadRecentLogsFromDisk();
        }
        return this.logs.length;
    }

    public clearLogs(): void {
        this.logs = [];
        this.diskLoaded = true;
        try {
            fs.writeFileSync(logFilePath, '');
        } catch (e) {}
        this.addLog("INFO", "SYSTEM", "System logs buffer cleared by administrator.", undefined, true);
    }
}

const globalLogger = global as unknown as { systemLoggerInstance: SystemLogger, consoleIntercepted: boolean };

export const logger = globalLogger.systemLoggerInstance || new SystemLogger();
globalLogger.systemLoggerInstance = logger;

if (!globalLogger.consoleIntercepted) {
    globalLogger.consoleIntercepted = true;
    
    const formatArg = (a: any) => {
        if (!a) return String(a);
        if (a instanceof Error) {
            return a.stack || `${a.name}: ${a.message}`;
        }
        if (typeof a === 'object') {
            if (a.message || a.stack) {
                return `${a.name || 'Error'}: ${a.message} ${a.stack || ''}`;
            }
            try {
                return JSON.stringify(a);
            } catch {
                return String(a);
            }
        }
        return String(a);
    };

    const parseAndLog = (level: "INFO" | "WARN" | "ERROR", args: any[]) => {
        if (!args || args.length === 0) return;
        const rawFirstArg = String(args[0] ?? "");
        
        // Filter out expected Next.js Server Action cache miss warnings caused by deployment updates/reloads
        if (rawFirstArg.includes("Failed to find Server Action")) return;
        if (args.length > 1 && String(args[1]).includes("Failed to find Server Action")) return;

        // Filter out Node.js TLS rejection warning
        if (rawFirstArg.includes("NODE_TLS_REJECT_UNAUTHORIZED")) return;
        if (args.length > 1 && String(args[1]).includes("NODE_TLS_REJECT_UNAUTHORIZED")) return;

        // Filter out expected unauthorized session rejects from media app / server checks
        if (rawFirstArg.includes("[GET-MEDIA-APPS-ERROR]") || rawFirstArg === "Error: Unauthorized") return;
        if (args.length > 1 && (String(args[1]).includes("Error: Unauthorized") || String(args[1]) === "Unauthorized")) return;

        // 1. Strip timestamp prefixes (e.g. from prisma.ts or node console: "[2026-09-09 10:48:50]", "[10:48:50]", etc.)
        let cleanMsg = rawFirstArg
            .replace(/^\[\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?\]\s*/i, "")
            .replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/i, "")
            .trim();

        if (!cleanMsg && args.length > 1) {
            cleanMsg = formatArg(args[1]);
        }

        let category: LogCategory = "SYSTEM";
        let tag = "";

        // 2. Extract leading bracket tags like [PLEX], [TAUTULLI], [AI-AGENT], [SCANNER], etc.
        const tagMatch = cleanMsg.match(/^\[([A-Za-z0-9_.-]+)\]\s*(.*)/);
        if (tagMatch) {
            tag = tagMatch[1].toUpperCase();
            cleanMsg = tagMatch[2].trim();
        }

        // Build a combined lowercase search string from all arguments to detect category accurately
        const argDetails = args.slice(1).map(formatArg).join(" ");
        const searchPool = (tag + " " + cleanMsg + " " + argDetails).toLowerCase();

        const tagTokens = tag ? tag.split(/[-_\s]+/).map(t => t.toUpperCase()) : [];
        const hasTagToken = (...tokens: string[]) => tokens.some(t => tagTokens.includes(t.toUpperCase()));
        const hasTagSub = (...subs: string[]) => subs.some(s => tag.includes(s.toUpperCase()));

        // 1. TAUTULLI
        if (hasTagSub("TAUTULLI") || searchPool.includes("tautulli")) {
            category = "TAUTULLI";
        }
        // 2. KINDLE (Includes Mobi-Bounce format sanitization)
        else if (
            hasTagSub("KINDLE", "MOBI-BOUNCE", "MOBI_BOUNCE", "AUTO-KINDLE") || 
            hasTagToken("MOBI") ||
            searchPool.includes("kindle") ||
            searchPool.includes("mobi-bounce") ||
            searchPool.includes("send-to-kindle") ||
            searchPool.includes("kindle smtp")
        ) {
            category = "KINDLE";
        }
        // 3. COVER / ARTWORK / POSTER (Using exact tokens/prefixes to avoid "RECOVERY")
        else if (
            hasTagToken("COVER", "POSTER", "ARTWORK") ||
            hasTagSub("COVER-ENGINE", "COVER-API", "ITUNES-COVER", "GOOGLE-BOOKS-COVER", "OPEN-LIBRARY") ||
            searchPool.includes("cover-engine") ||
            searchPool.includes("cover artwork") ||
            searchPool.includes("fetching cover") ||
            searchPool.includes("downloaded cover") ||
            searchPool.includes("itunes-cover") ||
            searchPool.includes("google-books-cover") ||
            searchPool.includes("open-library-fallback")
        ) {
            category = "COVER";
        }
        // 4. AI AGENT
        else if (
            hasTagToken("AI", "GEMINI", "OPENAI", "CLAUDE", "GROQ", "OLLAMA", "DEEPSEEK", "ANTHROPIC") ||
            hasTagSub("AI-AGENT", "AI-METADATA", "AI-RESOLVER", "AI-FAILOVER", "AI-BATCH", "AI-LIBRARY", "AI-CHAPTERS", "AI-SINGLE", "RESOLVE-BOOK-AI", "SAVE-AI", "TEST-AI") ||
            searchPool.includes("gemini") ||
            searchPool.includes("openai") ||
            searchPool.includes("claude") ||
            searchPool.includes("groq") ||
            searchPool.includes("ollama") ||
            searchPool.includes("deepseek") ||
            searchPool.includes("ai metadata") ||
            searchPool.includes("ai agent") ||
            searchPool.includes("ai volume") ||
            searchPool.includes("ai library scan")
        ) {
            category = "AI_AGENT";
        }
        // 5. DOWNLOAD / TORZNAB / CLIENTS / REQUESTS (Checked BEFORE general auth to prevent qBit "login first" matching auth)
        else if (
            hasTagSub("PROWLARR", "TORZNAB", "QBIT", "SABNZBD", "NZBGET", "DOWNLOAD", "GRAB", "RE-GRAB", "IMPORT", "BLOCKLIST", "REQUEST", "FULFILL") ||
            searchPool.includes("prowlarr") ||
            searchPool.includes("qbittorrent") ||
            searchPool.includes("qbit") ||
            searchPool.includes("sabnzbd") ||
            searchPool.includes("nzbget") ||
            searchPool.includes("torznab") ||
            searchPool.includes("auto-download") ||
            searchPool.includes("getactivedownloads") ||
            searchPool.includes("downloaded") ||
            searchPool.includes("book request") ||
            searchPool.includes("series request") ||
            searchPool.includes("fulfill upload") ||
            searchPool.includes("delete download")
        ) {
            category = "DOWNLOAD";
        }
        // 6. PLEX (Plex Media Server, hub streams, friends sync, section shares)
        else if (
            hasTagSub("PLEX") || 
            hasTagToken("PMS") ||
            hasTagSub("SHARE", "SECTION-MAP") ||
            searchPool.includes("plex") ||
            searchPool.includes(" pms ")
        ) {
            category = "PLEX";
        }
        // 7. EMAIL / SMTP
        else if (
            hasTagSub("EMAIL", "SMTP", "MAILER") || 
            searchPool.includes("smtp") || 
            searchPool.includes("nodemailer") || 
            searchPool.includes("test email") ||
            searchPool.includes("email failed") ||
            searchPool.includes("email alert")
        ) {
            category = "EMAIL";
        }
        // 8. MEDIA APPS (Radarr, Sonarr, Readarr, Glances, Overseerr, etc.)
        else if (
            hasTagSub("RADARR", "SONARR", "READARR", "GLANCES", "OVERSEERR", "JELLYSEERR", "BAZARR", "OMBI", "MAINTAINERR", "MEDIA-APP") ||
            hasTagToken("APP", "APPS") ||
            searchPool.includes("radarr") ||
            searchPool.includes("sonarr") ||
            searchPool.includes("readarr") ||
            searchPool.includes("glances") ||
            searchPool.includes("overseerr") ||
            searchPool.includes("jellyseerr") ||
            searchPool.includes("bazarr") ||
            searchPool.includes("getpublicmediaapps")
        ) {
            category = "APPS";
        }
        // 9. DATABASE (Checked before general words to safely capture db-recovery, prisma, sqlite)
        else if (
            hasTagSub("DATABASE", "PRISMA", "SQLITE", "DB-BACKUP", "DB-MIGRATION", "DB-RECOVERY", "DB-SCHEMA") ||
            hasTagToken("DB") ||
            searchPool.includes("dev.db") ||
            searchPool.includes("database") ||
            searchPool.includes("prisma") ||
            searchPool.includes("sqlite") ||
            searchPool.includes("db-backup") ||
            searchPool.includes("schema-autofix")
        ) {
            category = "DATABASE";
        }
        // 10. AUTH / USERS / ACCESS / TICKETS
        else if (
            hasTagSub("AUTH", "LOGIN", "SESSION", "USER", "USERS", "TRIAL", "REFERRAL", "TICKET") ||
            searchPool.includes("login") ||
            searchPool.includes("session cookie") ||
            searchPool.includes("trial expired") ||
            searchPool.includes("subscription expired") ||
            searchPool.includes("auto-provisioned") ||
            searchPool.includes("ticket") ||
            searchPool.includes("getappusers") ||
            searchPool.includes("failed to approve user") ||
            searchPool.includes("failed to reject user") ||
            searchPool.includes("failed to create user") ||
            searchPool.includes("failed to delete user") ||
            searchPool.includes("access request")
        ) {
            category = "AUTH";
        }
        // 11. SCANNER / LIBRARY ORGANIZER / AUDIOBOOK / EPUB / COMICS
        else if (
            hasTagSub("SCANNER", "EPUB", "AUDIOBOOK", "SERIES-MONITOR", "SERIES-EXPANSION", "CHAPTER", "CHAPTERS", "RENAME", "CLEANUP", "PURGE", "PATH") ||
            searchPool.includes("scanning library") ||
            searchPool.includes("scan library") ||
            searchPool.includes("library") ||
            searchPool.includes("audiobook") ||
            searchPool.includes("chapter") ||
            searchPool.includes("comic") ||
            searchPool.includes("series-monitor") ||
            searchPool.includes("extractmetadata") ||
            searchPool.includes("parsefilenamemetadata")
        ) {
            category = "SCANNER";
        }
        // 12. API / HTTP / SPEEDTEST
        else if (
            hasTagSub("API", "HTTP", "SPEEDTEST", "STREAM", "PROXY") ||
            searchPool.includes("/api/") ||
            searchPool.includes("speedtest") ||
            searchPool.includes("stream book") ||
            searchPool.includes("upload failed")
        ) {
            category = "API";
        }
        // 13. CURATION / OVERLAYS / AGREGARR / KOMETA / PRUNING / COLLECTIONS
        else if (
            hasTagSub("CURATION", "OVERLAY", "KOMETA", "AGREGARR", "PRUNE", "LEAVING-SOON", "COLLECTION", "COLLECTIONS", "BADGE", "BADGES", "SEASONAL") ||
            hasTagToken("CURATION", "OVERLAY", "OVERLAYS", "COLLECTION", "COLLECTIONS") ||
            searchPool.includes("curation") ||
            searchPool.includes("curation-sync") ||
            searchPool.includes("curation-timer") ||
            searchPool.includes("overlay rule") ||
            searchPool.includes("applied overlays") ||
            searchPool.includes("leaving soon") ||
            searchPool.includes("prune simulation")
        ) {
            category = "CURATION";
        } else {
            category = "SYSTEM";
        }

        const details = argDetails.trim() || undefined;
        
        logger.addLog(level, category, cleanMsg, details, true);
    };

    console.log = (...args: any[]) => {
        originalConsoleLog(...args);
        parseAndLog("INFO", args);
    };
    console.warn = (...args: any[]) => {
        originalConsoleWarn(...args);
        parseAndLog("WARN", args);
    };
    console.error = (...args: any[]) => {
        originalConsoleError(...args);
        parseAndLog("ERROR", args);
    };
}
