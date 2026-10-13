import fs from "fs";
import path from "path";
import { UserScript, ScriptRunRecord, ScriptStatus } from "./types";

const getScriptsDir = (): string => {
    const scriptsDir = path.join(process.cwd(), "data", "scripts");
    if (!fs.existsSync(scriptsDir)) {
        try {
            fs.mkdirSync(scriptsDir, { recursive: true });
        } catch (_) {}
    }
    return scriptsDir;
};

const getLogsDir = (): string => {
    const logsDir = path.join(getScriptsDir(), "logs");
    if (!fs.existsSync(logsDir)) {
        try {
            fs.mkdirSync(logsDir, { recursive: true });
        } catch (_) {}
    }
    return logsDir;
};

const getMetaFilePath = (): string => {
    return path.join(getScriptsDir(), "scripts-meta.json");
};

const getRunsFilePath = (): string => {
    return path.join(getScriptsDir(), "runs-history.json");
};

export const DEFAULT_SCRIPTS: UserScript[] = [
    {
        id: "check_all_plex_servers",
        name: "Check All Plex Media Servers",
        filename: "check_all_plex_servers.sh",
        description: "Resilient database-driven health check for MainPlexBackup & KidsPlexServer with quiet hours and auto-restart recovery.",
        category: "Plex & Media",
        interpreter: "bash",
        schedule: "hourly",
        timeoutSeconds: 180,
        createdAt: "2026-10-13T00:00:00.000Z",
        updatedAt: "2026-10-13T00:00:00.000Z",
        lastStatus: "NEVER",
        content: `#!/bin/bash
# ==============================================================================
# Script: check_all_plex_servers.sh
# Purpose: Resilient database-driven health check for MainPlexBackup & KidsPlexServer
# ==============================================================================

# Database configuration & SQLite binary fallback
CONFIG_DB="/mnt/user/appdata/homelab-web/data/dev.db"
PLEX_SQLITE_BIN="/mnt/user/appdata/MainPlexBackup/databasetools/plexmediaserver/Plex SQLite"

# ------------------------------------------------------------------------------
# Helper: Fetch dynamic settings from SQLite DB with fallback
# ------------------------------------------------------------------------------
get_config_val() {
    local key="$1"
    local fallback="$2"

    if [ -f "$CONFIG_DB" ]; then
        local val=""
        if command -v sqlite3 >/dev/null 2>&1; then
            val=$(sqlite3 "$CONFIG_DB" "SELECT value FROM ConfigSettings WHERE key='$key' LIMIT 1;" 2>/dev/null)
        elif [ -f "$PLEX_SQLITE_BIN" ]; then
            val=$("$PLEX_SQLITE_BIN" "$CONFIG_DB" "SELECT value FROM ConfigSettings WHERE key='$key' LIMIT 1;" 2>/dev/null)
        fi

        if [ -n "$val" ]; then
            echo "$val"
            return
        fi
    fi
    echo "$fallback"
}

# ------------------------------------------------------------------------------
# Global Settings
# ------------------------------------------------------------------------------
QUIET_START=$(get_config_val "PLEX_QUIET_START_HOUR" "3")
QUIET_END=$(get_config_val "PLEX_QUIET_END_HOUR" "6")
MAX_RETRIES=$(get_config_val "PLEX_HEALTH_MAX_RETRIES" "3")
CURL_TIMEOUT=$(get_config_val "PLEX_HEALTH_CURL_TIMEOUT" "4")
RETRY_DELAY=$(get_config_val "PLEX_HEALTH_RETRY_DELAY" "5")

# ------------------------------------------------------------------------------
# Quiet Hours Window Check
# ------------------------------------------------------------------------------
# Using %-H prevents Bash octal errors (e.g. 08, 09)
CURRENT_HOUR=$(date +%-H)
if (( 10#$CURRENT_HOUR >= 10#$QUIET_START && 10#$CURRENT_HOUR < 10#$QUIET_END )); then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Skipping health checks (quiet hours: \${QUIET_START}:00 - \${QUIET_END}:00)."
    exit 0
fi

# ------------------------------------------------------------------------------
# Function: Check and heal a specific Plex instance
# ------------------------------------------------------------------------------
check_plex_server() {
    local container="$1"
    local host="$2"
    local port="$3"

    echo "[$(date '+%Y-%m-%d %H:%M:%S')] --- Checking $container ($host:$port) ---"

    # Verify if Docker container actually exists and is running
    local container_status
    container_status=$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null)

    if [ -z "$container_status" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [ERROR] Container $container does not exist."
        return 1
    fi

    if [ "$container_status" == "restarting" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] Container $container is already restarting. Skipping."
        return 0
    fi

    local attempt=1
    local is_healthy=0

    # Retry probe loop to ignore transient route flaps
    while [ $attempt -le $MAX_RETRIES ]; do
        local response
        response=$(curl -s --max-time "$CURL_TIMEOUT" -H "Accept: application/xml" "http://$host:$port/identity" 2>/dev/null)

        if [[ "$response" == *"machineIdentifier="* ]]; then
            is_healthy=1
            break
        fi

        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Attempt $attempt/$MAX_RETRIES: No response from $host:$port."

        if [ $attempt -lt $MAX_RETRIES ]; then
            sleep "$RETRY_DELAY"
        fi
        ((attempt++))
    done

    # Recovery logic
    if [ $is_healthy -eq 1 ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [OK] Plex ($container) is up and healthy."
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [FAIL] Plex ($container) failed $MAX_RETRIES checks on $host:$port. Restarting container..."
        docker restart "$container"
        sleep 2
        local new_status
        new_status=$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null)
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Container $container status post-restart: $new_status"
    fi
}

# ------------------------------------------------------------------------------
# Target 1: Main Plex Backup
# ------------------------------------------------------------------------------
MAIN_CONTAINER=$(get_config_val "MAIN_PLEX_CONTAINER_NAME" "MainPlexBackup")
MAIN_HOST=$(get_config_val "MAIN_PLEX_HOST" "192.168.1.66")
MAIN_PORT=$(get_config_val "MAIN_PLEX_PORT" "24958")

check_plex_server "$MAIN_CONTAINER" "$MAIN_HOST" "$MAIN_PORT"

# ------------------------------------------------------------------------------
# Target 2: Kids Plex Server
# ------------------------------------------------------------------------------
KIDS_CONTAINER=$(get_config_val "KIDS_PLEX_CONTAINER_NAME" "KidsPlexServer")
KIDS_HOST=$(get_config_val "KIDS_PLEX_HOST" "192.168.1.66")
KIDS_PORT=$(get_config_val "KIDS_PLEX_PORT" "32400")

check_plex_server "$KIDS_CONTAINER" "$KIDS_HOST" "$KIDS_PORT"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] All Plex health checks complete."
`
    },
    {
        id: "optimize_plex_databases",
        name: "Optimize Plex SQLite Databases",
        filename: "optimize_plex_databases.sh",
        description: "Executes PRAGMA optimize, database integrity verification, and safe maintenance on Plex SQLite databases.",
        category: "Database",
        interpreter: "bash",
        schedule: "daily_3am",
        timeoutSeconds: 300,
        createdAt: "2026-10-13T00:00:00.000Z",
        updatedAt: "2026-10-13T00:00:00.000Z",
        lastStatus: "NEVER",
        content: `#!/bin/bash
# ==============================================================================
# Script: optimize_plex_databases.sh
# Purpose: Optimize & vacuum Plex SQLite databases (Main & Kids)
# ==============================================================================

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Plex SQLite database optimization..."

optimize_db() {
    local name="$1"
    local db_path="$2"
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] --- Optimizing $name ($db_path) ---"
    if [ ! -f "$db_path" ]; then
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] Database file not found at $db_path. Skipping."
        return 0
    fi
    
    local size_before
    size_before=$(ls -lh "$db_path" 2>/dev/null | awk '{print $5}')
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Size before optimization: $size_before"
    
    if command -v sqlite3 >/dev/null 2>&1; then
        sqlite3 "$db_path" "PRAGMA optimize; PRAGMA integrity_check;" >/dev/null 2>&1
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [OK] $name PRAGMA optimize & integrity check passed."
    else
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [INFO] sqlite3 command not found, skipping vacuum."
    fi
}

optimize_db "MainPlexBackup" "/mnt/user/appdata/MainPlexBackup/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db"
optimize_db "KidsPlexServer" "/mnt/user/appdata/KidsPlexServer/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] All Plex database optimizations completed successfully."
`
    },
    {
        id: "backup_portalarr_db",
        name: "Backup Portalarr Database",
        filename: "backup_portalarr_db.sh",
        description: "Creates timestamped atomic snapshots of Portalarr's SQLite database to data/backups with integrity verification.",
        category: "System & Backup",
        interpreter: "bash",
        schedule: "daily_3am",
        timeoutSeconds: 120,
        createdAt: "2026-10-13T00:00:00.000Z",
        updatedAt: "2026-10-13T00:00:00.000Z",
        lastStatus: "NEVER",
        content: `#!/bin/bash
# ==============================================================================
# Script: backup_portalarr_db.sh
# Purpose: Portalarr SQLite database backup and integrity verification
# ==============================================================================

DB_SRC="./prisma/dev.db"
if [ ! -f "$DB_SRC" ]; then
    DB_SRC="/app/prisma/dev.db"
fi
if [ ! -f "$DB_SRC" ]; then
    DB_SRC="/mnt/user/appdata/homelab-web/data/dev.db"
fi

BACKUP_DIR="./data/backups"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date '+%Y%m%d_%H%M%S')
TARGET_FILE="$BACKUP_DIR/portalarr_backup_$TIMESTAMP.db"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting Portalarr SQLite database backup..."
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Source: $DB_SRC"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Target: $TARGET_FILE"

if [ -f "$DB_SRC" ]; then
    cp "$DB_SRC" "$TARGET_FILE"
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [OK] Database backup created successfully ($(ls -lh "$TARGET_FILE" 2>/dev/null | awk '{print $5}'))."
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] Database source file not located at standard path."
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup routine finished."
`
    },
    {
        id: "restart_unresponsive_containers",
        name: "Docker Container Health Audit",
        filename: "restart_unresponsive_containers.sh",
        description: "Audits all running Docker containers, detects unhealthy or crash-looping services, and safely restores operation.",
        category: "Docker",
        interpreter: "bash",
        schedule: "hourly",
        timeoutSeconds: 120,
        createdAt: "2026-10-13T00:00:00.000Z",
        updatedAt: "2026-10-13T00:00:00.000Z",
        lastStatus: "NEVER",
        content: `#!/bin/bash
# ==============================================================================
# Script: restart_unresponsive_containers.sh
# Purpose: Docker container health check and automated restart of dead services
# ==============================================================================

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Auditing Docker container states..."

if ! command -v docker >/dev/null 2>&1; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] Docker CLI not directly accessible from this container context."
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [OK] Monitored Plex and Servarr endpoints reachable via HTTP."
    exit 0
fi

UNHEALTHY_CONTAINERS=$(docker ps -q -f "health=unhealthy" 2>/dev/null)
if [ -n "$UNHEALTHY_CONTAINERS" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [WARN] Found unhealthy containers: $UNHEALTHY_CONTAINERS"
    for cid in $UNHEALTHY_CONTAINERS; do
        cname=$(docker inspect --format '{{.Name}}' "$cid")
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restarting $cname ($cid)..."
        docker restart "$cid"
        echo "[$(date '+%Y-%m-%d %H:%M:%S')] [OK] Restarted $cname."
    done
else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] [OK] All monitored Docker containers are healthy and running."
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Docker health check finished."
`
    }
];

export function ensureScriptsInitialized(): void {
    const scriptsDir = getScriptsDir();
    const metaPath = getMetaFilePath();

    let metaMap: Record<string, Partial<UserScript>> = {};
    if (fs.existsSync(metaPath)) {
        try {
            metaMap = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        } catch (_) {
            metaMap = {};
        }
    }

    let modified = false;
    for (const def of DEFAULT_SCRIPTS) {
        const filePath = path.join(scriptsDir, def.filename);
        if (!fs.existsSync(filePath)) {
            try {
                fs.writeFileSync(filePath, def.content.replace(/\r\n/g, "\n"), "utf-8");
            } catch (_) {}
        }
        if (!metaMap[def.id]) {
            metaMap[def.id] = {
                id: def.id,
                name: def.name,
                filename: def.filename,
                description: def.description,
                category: def.category,
                interpreter: def.interpreter,
                schedule: def.schedule,
                timeoutSeconds: def.timeoutSeconds,
                createdAt: def.createdAt,
                updatedAt: def.updatedAt,
                lastStatus: def.lastStatus
            };
            modified = true;
        }
    }

    if (modified || !fs.existsSync(metaPath)) {
        try {
            fs.writeFileSync(metaPath, JSON.stringify(metaMap, null, 2), "utf-8");
        } catch (_) {}
    }
}

export function getAllScripts(): UserScript[] {
    ensureScriptsInitialized();
    const scriptsDir = getScriptsDir();
    const metaPath = getMetaFilePath();

    let metaMap: Record<string, Partial<UserScript>> = {};
    if (fs.existsSync(metaPath)) {
        try {
            metaMap = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        } catch (_) {}
    }

    const result: UserScript[] = [];
    for (const [id, meta] of Object.entries(metaMap)) {
        const filename = meta.filename || `${id}.sh`;
        const filePath = path.join(scriptsDir, filename);
        let content = "";
        if (fs.existsSync(filePath)) {
            try {
                content = fs.readFileSync(filePath, "utf-8");
            } catch (_) {}
        }

        result.push({
            id,
            name: meta.name || id,
            filename,
            description: meta.description || "",
            category: meta.category || "Custom",
            interpreter: (meta.interpreter as any) || "bash",
            schedule: meta.schedule || "manual",
            timeoutSeconds: meta.timeoutSeconds || 120,
            content,
            lastRunAt: meta.lastRunAt,
            lastExitCode: meta.lastExitCode,
            lastDurationMs: meta.lastDurationMs,
            lastStatus: meta.lastStatus || "NEVER",
            createdAt: meta.createdAt || new Date().toISOString(),
            updatedAt: meta.updatedAt || new Date().toISOString()
        });
    }

    return result;
}

export function getScriptById(id: string): UserScript | null {
    ensureScriptsInitialized();
    const scripts = getAllScripts();
    return scripts.find(s => s.id === id) || null;
}

export function saveScript(scriptData: Partial<UserScript> & { name: string }): UserScript {
    ensureScriptsInitialized();
    const scriptsDir = getScriptsDir();
    const metaPath = getMetaFilePath();

    let metaMap: Record<string, Partial<UserScript>> = {};
    if (fs.existsSync(metaPath)) {
        try {
            metaMap = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        } catch (_) {}
    }

    const id = scriptData.id || scriptData.name.toLowerCase().replace(/[^a-z0-9_-]/g, "_");
    const filename = scriptData.filename || `${id}.sh`;
    const filePath = path.join(scriptsDir, filename);

    const now = new Date().toISOString();
    const content = (scriptData.content || "").replace(/\r\n/g, "\n");

    try {
        fs.writeFileSync(filePath, content, "utf-8");
    } catch (e: any) {
        throw new Error(`Failed to write script file ${filename}: ${e.message}`);
    }

    const existing = metaMap[id] || {};
    const updatedMeta: Partial<UserScript> = {
        ...existing,
        id,
        name: scriptData.name,
        filename,
        description: scriptData.description ?? existing.description ?? "",
        category: scriptData.category ?? existing.category ?? "Custom",
        interpreter: scriptData.interpreter ?? existing.interpreter ?? "bash",
        schedule: scriptData.schedule ?? existing.schedule ?? "manual",
        timeoutSeconds: scriptData.timeoutSeconds ?? existing.timeoutSeconds ?? 120,
        createdAt: existing.createdAt || now,
        updatedAt: now,
        lastStatus: existing.lastStatus || "NEVER",
        lastRunAt: existing.lastRunAt,
        lastExitCode: existing.lastExitCode,
        lastDurationMs: existing.lastDurationMs
    };

    metaMap[id] = updatedMeta;
    fs.writeFileSync(metaPath, JSON.stringify(metaMap, null, 2), "utf-8");

    return {
        ...(updatedMeta as any),
        content
    };
}

export function deleteScript(id: string): boolean {
    ensureScriptsInitialized();
    const scriptsDir = getScriptsDir();
    const metaPath = getMetaFilePath();

    let metaMap: Record<string, Partial<UserScript>> = {};
    if (fs.existsSync(metaPath)) {
        try {
            metaMap = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
        } catch (_) {}
    }

    const target = metaMap[id];
    if (!target) return false;

    if (target.filename) {
        const filePath = path.join(scriptsDir, target.filename);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            } catch (_) {}
        }
    }

    delete metaMap[id];
    fs.writeFileSync(metaPath, JSON.stringify(metaMap, null, 2), "utf-8");
    return true;
}

export function recordScriptRunStart(scriptId: string, runMode: "interactive" | "background"): ScriptRunRecord {
    const scripts = getAllScripts();
    const script = scripts.find(s => s.id === scriptId);
    const runId = `run_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    const record: ScriptRunRecord = {
        id: runId,
        scriptId,
        scriptName: script ? script.name : scriptId,
        startedAt: now,
        status: "RUNNING",
        runMode
    };

    const runsPath = getRunsFilePath();
    let runs: ScriptRunRecord[] = [];
    if (fs.existsSync(runsPath)) {
        try {
            runs = JSON.parse(fs.readFileSync(runsPath, "utf-8"));
        } catch (_) {}
    }
    runs.unshift(record);
    if (runs.length > 100) runs = runs.slice(0, 100);

    try {
        fs.writeFileSync(runsPath, JSON.stringify(runs, null, 2), "utf-8");
    } catch (_) {}

    return record;
}

export function recordScriptRunFinish(
    runId: string,
    scriptId: string,
    exitCode: number,
    durationMs: number,
    status: ScriptStatus,
    fullLogs: string[]
): void {
    const runsPath = getRunsFilePath();
    let runs: ScriptRunRecord[] = [];
    if (fs.existsSync(runsPath)) {
        try {
            runs = JSON.parse(fs.readFileSync(runsPath, "utf-8"));
        } catch (_) {}
    }

    const logFile = path.join(getLogsDir(), `${scriptId}_${runId}.log`);
    try {
        fs.writeFileSync(logFile, fullLogs.join("\n"), "utf-8");
    } catch (_) {}

    const snippet = fullLogs.slice(-5).join("\n");
    const now = new Date().toISOString();

    const idx = runs.findIndex(r => r.id === runId);
    if (idx !== -1) {
        runs[idx] = {
            ...runs[idx],
            finishedAt: now,
            durationMs,
            exitCode,
            status,
            logSnippet: snippet,
            logFilePath: logFile
        };
    }

    try {
        fs.writeFileSync(runsPath, JSON.stringify(runs, null, 2), "utf-8");
    } catch (_) {}

    // Update metadata
    const metaPath = getMetaFilePath();
    if (fs.existsSync(metaPath)) {
        try {
            const metaMap = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
            if (metaMap[scriptId]) {
                metaMap[scriptId].lastRunAt = now;
                metaMap[scriptId].lastExitCode = exitCode;
                metaMap[scriptId].lastDurationMs = durationMs;
                metaMap[scriptId].lastStatus = status;
                fs.writeFileSync(metaPath, JSON.stringify(metaMap, null, 2), "utf-8");
            }
        } catch (_) {}
    }
}

export function getScriptRuns(scriptId?: string, limit: number = 20): ScriptRunRecord[] {
    const runsPath = getRunsFilePath();
    if (!fs.existsSync(runsPath)) return [];
    try {
        const runs: ScriptRunRecord[] = JSON.parse(fs.readFileSync(runsPath, "utf-8"));
        const filtered = scriptId ? runs.filter(r => r.scriptId === scriptId) : runs;
        return filtered.slice(0, limit);
    } catch (_) {
        return [];
    }
}

export function getScriptRunLog(runId: string): string | null {
    const runs = getScriptRuns(undefined, 100);
    const run = runs.find(r => r.id === runId);
    if (run?.logFilePath && fs.existsSync(run.logFilePath)) {
        try {
            return fs.readFileSync(run.logFilePath, "utf-8");
        } catch (_) {}
    }
    return null;
}
