export type ScriptInterpreter = "bash" | "sh" | "python3" | "node";

export type ScriptCategory = 
    | "Plex & Media" 
    | "Database" 
    | "Docker" 
    | "System & Backup" 
    | "Maintenance" 
    | "Custom";

export type ScriptStatus = "SUCCESS" | "FAILED" | "ABORTED" | "RUNNING" | "NEVER";

export interface UserScript {
    id: string;
    name: string;
    filename: string;
    description: string;
    category: ScriptCategory | string;
    interpreter: ScriptInterpreter;
    schedule: string; // e.g. "manual", "hourly", "daily_3am", "weekly_sun", or custom cron
    timeoutSeconds: number;
    content: string;
    lastRunAt?: string;
    lastExitCode?: number | null;
    lastDurationMs?: number;
    lastStatus?: ScriptStatus;
    createdAt: string;
    updatedAt: string;
}

export interface ScriptRunRecord {
    id: string;
    scriptId: string;
    scriptName: string;
    startedAt: string;
    finishedAt?: string;
    durationMs?: number;
    exitCode?: number | null;
    status: ScriptStatus;
    runMode: "interactive" | "background";
    logSnippet?: string;
    logFilePath?: string;
}

export interface ScriptExecutionOptions {
    scriptId: string;
    customCode?: string;
    runMode?: "interactive" | "background";
    onLog?: (line: string) => void;
    abortSignal?: AbortSignal;
}

export interface ScriptExecutionResult {
    runId: string;
    exitCode: number;
    durationMs: number;
    status: ScriptStatus;
    logs: string[];
}
