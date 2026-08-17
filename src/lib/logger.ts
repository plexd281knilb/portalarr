export interface SystemLogEntry {
    id: string;
    timestamp: string;
    level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "SYSTEM";
    category: "SCANNER" | "API" | "COVER" | "DOWNLOAD" | "KINDLE" | "SYSTEM" | "DATABASE";
    message: string;
    details?: string;
}

const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

import fs from 'fs';
import path from 'path';
import os from 'os';

const getLogFilePath = () => {
    const dataDir = path.join(process.cwd(), 'data');
    if (fs.existsSync(dataDir)) {
        return path.join(dataDir, 'system_logs.jsonl');
    }
    return path.join(os.tmpdir(), 'portalarr_system_logs.jsonl');
};
const logFilePath = getLogFilePath();

class SystemLogger {
    private logs: SystemLogEntry[] = [];
    private maxLogs = 2000;

    constructor() {
        this.addLog("INFO", "SYSTEM", "Portalarr System Logger Initialized. Capturing real-time activity stream.", undefined, true);
    }

    public addLog(
        level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "SYSTEM",
        category: "SCANNER" | "API" | "COVER" | "DOWNLOAD" | "KINDLE" | "SYSTEM" | "DATABASE",
        message: string,
        details?: string,
        preventConsoleOutput = false
    ) {
        const entry: SystemLogEntry = {
            id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
            timestamp: new Date().toISOString(),
            level,
            category,
            message,
            details
        };

        this.logs.unshift(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs = this.logs.slice(0, this.maxLogs);
        }

        try {
            fs.appendFileSync(logFilePath, JSON.stringify(entry) + '\n');
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
                return recent.map(l => JSON.parse(l)).reverse();
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
    
    const parseAndLog = (level: "INFO" | "WARN" | "ERROR", args: any[]) => {
        if (!args || args.length === 0) return;
        const msg = String(args[0]);
        if (msg.match(/^\[\d{2}:\d{2}:\d{2}\]/)) return;

        let category: SystemLogEntry["category"] = "SYSTEM";
        let cleanMsg = msg;

        const match = msg.match(/^\[([A-Z0-9-]+)\]\s+(.*)/i);
        if (match) {
            const rawCategory = match[1].toUpperCase();
            cleanMsg = match[2];
            if (rawCategory.includes("SCANNER") || rawCategory.includes("MOBI") || rawCategory.includes("FILE")) category = "SCANNER";
            else if (rawCategory.includes("API") || rawCategory.includes("AUTH") || rawCategory.includes("GET-LIBRARY") || rawCategory.includes("SERIES")) category = "API";
            else if (rawCategory.includes("COVER")) category = "COVER";
            else if (rawCategory.includes("DOWNLOAD") || rawCategory.includes("GRAB") || rawCategory.includes("RE-GRAB")) category = "DOWNLOAD";
            else if (rawCategory.includes("KINDLE") || rawCategory.includes("SMTP")) category = "KINDLE";
            else if (rawCategory.includes("DATABASE")) category = "DATABASE";
            else category = "SYSTEM";
        }

        const details = args.length > 1 ? args.slice(1).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(" ") : undefined;
        
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
