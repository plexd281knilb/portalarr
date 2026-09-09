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

const getLogFilePath = () => {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
        try {
            fs.mkdirSync(dataDir, { recursive: true });
        } catch (e) {
            // Read-only filesystem or restricted environment: fall back to tmpdir
            return path.join(os.tmpdir(), 'portalarr_system_logs.jsonl');
        }
    }
    return path.join(dataDir, 'system_logs.jsonl');
};
const logFilePath = getLogFilePath();

class SystemLogger {
    private logs: SystemLogEntry[] = [];
    private maxLogs = 5000;
    private writeCount = 0;

    constructor() {
        this.addLog("INFO", "SYSTEM", "Portalarr System Logger Initialized. Capturing real-time activity stream.", undefined, true);
    }

    public addLog(
        level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "SYSTEM",
        category: LogCategory,
        message: string,
        details?: string,
        preventConsoleOutput = false
    ) {
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

    public getLogs(): SystemLogEntry[] {
        try {
            if (fs.existsSync(logFilePath)) {
                const lines = fs.readFileSync(logFilePath, 'utf8').trim().split('\n').filter(Boolean);
                const recent = lines.slice(-this.maxLogs);
                return recent.map(l => {
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
            // Fallback to memory
        }
        return this.logs;
    }

    public clearLogs(): void {
        this.logs = [];
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
