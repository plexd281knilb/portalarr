export interface SystemLogEntry {
    id: string;
    timestamp: string;
    level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "SYSTEM";
    category: "SCANNER" | "API" | "COVER" | "DOWNLOAD" | "KINDLE" | "SYSTEM" | "DATABASE";
    message: string;
    details?: string;
}

class SystemLogger {
    private logs: SystemLogEntry[] = [];
    private maxLogs = 500;

    constructor() {
        this.addLog("INFO", "SYSTEM", "Portalarr System Logger Initialized. Capturing real-time activity stream.");
    }

    public addLog(
        level: "INFO" | "WARN" | "ERROR" | "SUCCESS" | "SYSTEM",
        category: "SCANNER" | "API" | "COVER" | "DOWNLOAD" | "KINDLE" | "SYSTEM" | "DATABASE",
        message: string,
        details?: string
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

        // Also output to Node console
        const prefix = `[${entry.timestamp.substring(11, 19)}] [${entry.category}] [${entry.level}]`;
        if (level === "ERROR") {
            console.error(`${prefix} ❌ ${message}`, details || "");
        } else if (level === "WARN") {
            console.warn(`${prefix} ⚠️ ${message}`, details || "");
        } else {
            console.log(`${prefix} ${message}`, details || "");
        }
    }

    public getLogs(): SystemLogEntry[] {
        return this.logs;
    }

    public clearLogs(): void {
        this.logs = [];
        this.addLog("INFO", "SYSTEM", "System logs buffer cleared by administrator.");
    }
}

const globalLogger = global as unknown as { systemLoggerInstance: SystemLogger };

export const logger = globalLogger.systemLoggerInstance || new SystemLogger();
if (process.env.NODE_ENV !== "production") {
    globalLogger.systemLoggerInstance = logger;
}
