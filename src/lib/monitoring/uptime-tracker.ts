import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { postDiscordMessage, resolveOrProvisionStatusChannel } from "@/lib/discord/discord-bot";
import { logger } from "@/lib/logger";
import type { 
    IncidentRecord, 
    MonitoringConfig, 
    ServiceUptimeSummary 
} from "./types";
import type { InfrastructureServiceItem } from "@/app/actions";

const getMonitoringDir = (): string => {
    const dir = path.join(process.cwd(), "data", "monitoring");
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (_) {}
    }
    return dir;
};

const getProbesFilePath = (): string => path.join(getMonitoringDir(), "probe-history.json");
const getIncidentsFilePath = (): string => path.join(getMonitoringDir(), "incidents.json");
const getConfigFilePath = (): string => path.join(getMonitoringDir(), "config.json");

interface ProbePoint {
    status: "ONLINE" | "OFFLINE" | "PAUSED";
    latencyMs?: number;
    timestamp: number;
}

// In-memory cache for fast telemetry reads
let probeCache: Record<string, ProbePoint[]> | null = null;
let incidentCache: IncidentRecord[] | null = null;
let configCache: MonitoringConfig | null = null;

const DEFAULT_CONFIG: MonitoringConfig = {
    enabled: true,
    probeIntervalSeconds: 30,
    notifyDiscord: true,
    discordWebhookUrl: "",
    notifyEmail: false,
    emailRecipient: "",
    failureThreshold: 1,
    notifyContainers: true,
    notifyServices: true
};

export function getMonitoringConfig(): MonitoringConfig {
    if (configCache) return configCache;
    const file = getConfigFilePath();
    let loaded: MonitoringConfig = { ...DEFAULT_CONFIG };
    if (fs.existsSync(file)) {
        try {
            const raw = JSON.parse(fs.readFileSync(file, "utf8"));
            loaded = { ...DEFAULT_CONFIG, ...raw };
        } catch (_) {}
    }
    configCache = loaded;
    return loaded;
}

export function saveMonitoringConfig(updates: Partial<MonitoringConfig>): MonitoringConfig {
    const current = getMonitoringConfig();
    const merged: MonitoringConfig = { ...current, ...updates };
    configCache = merged;
    try {
        fs.writeFileSync(getConfigFilePath(), JSON.stringify(merged, null, 2), "utf8");
    } catch (_) {}
    return merged;
}

function loadProbeHistory(): Record<string, ProbePoint[]> {
    if (probeCache) return probeCache;
    const file = getProbesFilePath();
    if (fs.existsSync(file)) {
        try {
            probeCache = JSON.parse(fs.readFileSync(file, "utf8"));
            return probeCache!;
        } catch (_) {}
    }
    probeCache = {};
    return probeCache;
}

function saveProbeHistory(data: Record<string, ProbePoint[]>): void {
    probeCache = data;
    try {
        fs.writeFileSync(getProbesFilePath(), JSON.stringify(data), "utf8");
    } catch (_) {}
}

export function getIncidentHistory(): IncidentRecord[] {
    if (incidentCache) return incidentCache;
    const file = getIncidentsFilePath();
    if (fs.existsSync(file)) {
        try {
            incidentCache = JSON.parse(fs.readFileSync(file, "utf8"));
            return incidentCache!;
        } catch (_) {}
    }
    incidentCache = [];
    return incidentCache;
}

function saveIncidents(incidents: IncidentRecord[]): void {
    incidentCache = incidents;
    try {
        fs.writeFileSync(getIncidentsFilePath(), JSON.stringify(incidents, null, 2), "utf8");
    } catch (_) {}
}

export function clearResolvedIncidents(): void {
    const list = getIncidentHistory();
    const activeOnly = list.filter(i => i.status === "ACTIVE");
    saveIncidents(activeOnly);
}

/**
 * Dispatches an outage notification embed to Discord (via Webhook or Bot #system-status channel).
 */
export async function dispatchDiscordOutageNotification(
    incident: IncidentRecord, 
    type: "STARTED" | "RESOLVED"
): Promise<boolean> {
    const config = getMonitoringConfig();
    if (!config.notifyDiscord) return false;

    try {
        const isResolved = type === "RESOLVED";
        const color = isResolved ? 0x10b981 : 0xe11d48; // Emerald or Crimson
        const title = isResolved 
            ? `✅ System Restored: ${incident.targetName}`
            : `🚨 Outage Incident Detected: ${incident.targetName}`;

        const embed = {
            title,
            description: isResolved 
                ? `**${incident.targetName}** has fully recovered and is back online.\n*Total Downtime: ${incident.durationMinutes || 1} minute(s)*`
                : `**${incident.targetName}** is currently unreachable or unresponsive.\n**Details:** ${incident.message}`,
            color,
            fields: [
                {
                    name: "Target Resource",
                    value: `\`${incident.targetName}\` (${incident.category.toUpperCase()})`,
                    inline: true
                },
                {
                    name: "Status",
                    value: isResolved ? "🟢 OPERATIONAL" : "🔴 OUTAGE ACTIVE",
                    inline: true
                },
                {
                    name: "Time",
                    value: new Date(isResolved ? (incident.resolvedAt || Date.now()) : incident.startedAt).toLocaleString("en-US", { timeZone: "UTC" }) + " UTC",
                    inline: true
                }
            ],
            footer: {
                text: "DomsHomeLab (d281knilb) Fleet Health Subsystem"
            },
            timestamp: new Date().toISOString()
        };

        // 1. Direct Webhook if configured
        const webhookUrl = config.discordWebhookUrl?.trim();
        if (webhookUrl && webhookUrl.startsWith("http")) {
            const res = await fetch(webhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    username: "DomsHomeLab Fleet Monitor",
                    avatar_url: "https://raw.githubusercontent.com/plexd281knilb/portalarr/main/public/favicon.ico",
                    embeds: [embed]
                }),
                signal: AbortSignal.timeout(5000),
                cache: "no-store"
            });
            if (res.ok) {
                logger.addLog("INFO", "MONITORING", `Dispatched Discord webhook outage notification for ${incident.targetName} (${type})`);
                return true;
            }
        }

        // 2. Built-in Discord Bot to #server-uptime / #system-status channel if available
        const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
        if (settings?.discordBotToken && (settings?.discordStatusChannelId || settings?.discordGuildId)) {
            const rawToken = decryptData(settings.discordBotToken);
            if (rawToken) {
                let targetChId = settings.discordStatusChannelId;
                if (!targetChId && settings.discordGuildId) {
                    const resolved = await resolveOrProvisionStatusChannel({
                        botToken: rawToken,
                        guildId: settings.discordGuildId,
                        autoCreate: true
                    });
                    if (resolved.channelId) {
                        targetChId = resolved.channelId;
                        await prisma.settings.update({
                            where: { id: settings.id },
                            data: { discordStatusChannelId: targetChId }
                        }).catch(() => {});
                    }
                }

                if (targetChId) {
                    const botRes = await postDiscordMessage({
                        botToken: rawToken,
                        channelId: targetChId,
                        embeds: [embed]
                    });
                    if (botRes.success) {
                        logger.addLog("INFO", "MONITORING", `Dispatched Discord bot outage alert to status channel (${targetChId}) for ${incident.targetName}`);
                        return true;
                    }
                }
            }
        }
    } catch (err: any) {
        logger.addLog("WARN", "MONITORING", `Failed to dispatch Discord outage alert: ${err.message}`);
    }
    return false;
}

/**
 * Evaluates state transitions and updates incidents for monitored services.
 */
async function processIncidentTransitions(
    service: InfrastructureServiceItem, 
    now: number
): Promise<void> {
    if (!service.monitored || service.status === "PAUSED") return;

    const incidents = getIncidentHistory();
    const activeIncident = incidents.find(i => i.targetId === service.id && i.status === "ACTIVE");

    if (service.status === "OFFLINE") {
        if (!activeIncident) {
            // New outage incident started!
            const newIncident: IncidentRecord = {
                id: `inc-${service.id}-${now}`,
                targetId: service.id,
                targetName: service.name,
                targetType: "service",
                category: service.category,
                severity: "CRITICAL",
                status: "ACTIVE",
                title: `${service.name} Unreachable`,
                message: service.details || "Host endpoint port closed or timed out",
                startedAt: new Date(now).toISOString(),
                notifiedDiscord: false,
                notifiedEmail: false
            };

            const notified = await dispatchDiscordOutageNotification(newIncident, "STARTED");
            newIncident.notifiedDiscord = notified;

            incidents.unshift(newIncident);
            saveIncidents(incidents);
            logger.addLog("WARN", "MONITORING", `Outage incident opened for ${service.name} (${service.details || "OFFLINE"})`);
        }
    } else if (service.status === "ONLINE") {
        if (activeIncident) {
            // Outage resolved!
            const startTime = new Date(activeIncident.startedAt).getTime();
            const durationMinutes = Math.max(1, Math.round((now - startTime) / 60000));
            activeIncident.status = "RESOLVED";
            activeIncident.resolvedAt = new Date(now).toISOString();
            activeIncident.durationMinutes = durationMinutes;

            await dispatchDiscordOutageNotification(activeIncident, "RESOLVED");
            saveIncidents(incidents);
            logger.addLog("INFO", "MONITORING", `Outage incident resolved for ${service.name} (Duration: ${durationMinutes}m)`);
        }
    }
}

/**
 * Record batch service probe results into persistent rolling history.
 */
export async function recordServiceProbes(services: InfrastructureServiceItem[]): Promise<void> {
    const history = loadProbeHistory();
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

    for (const s of services) {
        if (!s.id) continue;
        if (!history[s.id]) {
            history[s.id] = [];
        }

        history[s.id].push({
            status: s.status,
            latencyMs: s.latencyMs,
            timestamp: now
        });

        // Prune older than 30 days and cap to last 2,000 points per service
        if (history[s.id].length > 2000) {
            history[s.id] = history[s.id].slice(-1500);
        }
        history[s.id] = history[s.id].filter(p => p.timestamp >= thirtyDaysAgo);

        // Process outage incidents & notifications
        await processIncidentTransitions(s, now);
    }

    saveProbeHistory(history);
}

/**
 * Calculate precise uptime percentages (24h, 7d, 30d) and streak duration for a service.
 */
export function calculateServiceUptime(
    serviceId: string, 
    currentStatus: "ONLINE" | "OFFLINE" | "PAUSED",
    currentLatency?: number
): {
    pct24h: number;
    pct7d: number;
    pct30d: number;
    currentStreak: string;
    pingHistory: (number | null)[];
} {
    const history = loadProbeHistory();
    const points = history[serviceId] || [];
    const now = Date.now();

    const h24 = now - 86400000;
    const d7 = now - (7 * 86400000);
    const d30 = now - (30 * 86400000);

    const calcPct = (since: number): number => {
        const filtered = points.filter(p => p.timestamp >= since && p.status !== "PAUSED");
        if (filtered.length === 0) {
            return currentStatus === "ONLINE" ? 100 : currentStatus === "PAUSED" ? 100 : 0;
        }
        const onlineCount = filtered.filter(p => p.status === "ONLINE").length;
        return Math.round((onlineCount / filtered.length) * 1000) / 10;
    };

    // Calculate Streak
    let streakText = "Operational";
    if (currentStatus === "PAUSED") {
        streakText = "Monitoring Paused";
    } else {
        let streakPoints = 0;
        for (let i = points.length - 1; i >= 0; i--) {
            if (points[i].status === currentStatus) {
                streakPoints++;
            } else {
                break;
            }
        }
        // Assume avg ~30 seconds per probe if points present
        const estMinutes = Math.max(1, Math.round(streakPoints * 0.5));
        if (estMinutes < 60) {
            streakText = `${currentStatus === "ONLINE" ? "Up" : "Down"} for ${estMinutes}m`;
        } else if (estMinutes < 1440) {
            const hrs = Math.floor(estMinutes / 60);
            const mins = estMinutes % 60;
            streakText = `${currentStatus === "ONLINE" ? "Up" : "Down"} for ${hrs}h ${mins}m`;
        } else {
            const days = Math.floor(estMinutes / 1440);
            const hrs = Math.floor((estMinutes % 1440) / 60);
            streakText = `${currentStatus === "ONLINE" ? "Up" : "Down"} for ${days}d ${hrs}h`;
        }
    }

    // Ping History: last 10 points
    const lastPoints = points.slice(-10);
    const pingHistory: (number | null)[] = lastPoints.map(p => 
        p.status === "ONLINE" ? (p.latencyMs ?? 15) : null
    );
    if (pingHistory.length === 0 && currentStatus === "ONLINE") {
        pingHistory.push(currentLatency ?? 12);
    }

    return {
        pct24h: calcPct(h24),
        pct7d: calcPct(d7),
        pct30d: calcPct(d30),
        currentStreak: streakText,
        pingHistory
    };
}

/**
 * Send a sample outage alert to test Discord webhook / bot setup.
 */
export async function sendTestOutageAlert(): Promise<{ success: boolean; message?: string; error?: string }> {
    const testIncident: IncidentRecord = {
        id: `test-${Date.now()}`,
        targetId: "test-target",
        targetName: "Test Plex Server (MainPlexBackup)",
        targetType: "service",
        category: "plex",
        severity: "CRITICAL",
        status: "ACTIVE",
        title: "Test Outage Alert Probe",
        message: "This is a simulated outage notification to verify your Discord channel alerts.",
        startedAt: new Date().toISOString(),
        notifiedDiscord: false,
        notifiedEmail: false
    };

    const success = await dispatchDiscordOutageNotification(testIncident, "STARTED");
    if (success) {
        return { success: true, message: "Test outage alert embed sent successfully to Discord!" };
    }
    return { 
        success: false, 
        error: "Failed to dispatch test alert. Please verify your Discord Webhook URL or Discord Bot token and #system-status channel." 
    };
}
