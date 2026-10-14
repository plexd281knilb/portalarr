export interface DockerPortBinding {
    privatePort: number;
    publicPort?: number;
    type: string;
    ip?: string;
}

export interface DockerContainerItem {
    id: string;
    fullId: string;
    name: string;
    image: string;
    state: "running" | "exited" | "paused" | "restarting" | "dead" | "unhealthy" | "unknown";
    status: string;
    created: number;
    startedAt?: string;
    ports: DockerPortBinding[];
    cpuPercent: number;
    memoryUsage: number; // in bytes
    memoryLimit: number; // in bytes
    memoryPercent: number;
    hostSource: "socket" | "pipe" | "cli" | "glances" | "simulated";
    hostName?: string;
}

export interface DockerFleetSummary {
    totalContainers: number;
    runningCount: number;
    stoppedCount: number;
    unhealthyCount: number;
    restartingCount: number;
    source: string;
    dockerVersion?: string;
    serverTime: string;
}

export interface ServiceUptimeSummary {
    id: string;
    name: string;
    type: string;
    category: "plex" | "glances" | "tautulli" | "apps" | "downloaders";
    url: string;
    monitored: boolean;
    status: "ONLINE" | "OFFLINE" | "PAUSED";
    latencyMs?: number;
    details?: string;
    uptimePercentage24h: number;
    uptimePercentage7d: number;
    uptimePercentage30d: number;
    currentStreak: string;
    lastChecked: string;
    pingHistory: (number | null)[];
}

export interface IncidentRecord {
    id: string;
    targetId: string;
    targetName: string;
    targetType: "service" | "container";
    category: string;
    severity: "CRITICAL" | "WARNING" | "INFO";
    status: "ACTIVE" | "RESOLVED";
    title: string;
    message: string;
    startedAt: string;
    resolvedAt?: string;
    durationMinutes?: number;
    notifiedDiscord: boolean;
    notifiedEmail: boolean;
}

export interface MonitoringConfig {
    enabled: boolean;
    probeIntervalSeconds: number;
    notifyDiscord: boolean;
    discordWebhookUrl?: string;
    notifyEmail: boolean;
    emailRecipient?: string;
    failureThreshold: number;
    notifyContainers: boolean;
    notifyServices: boolean;
}

export interface FleetTelemetryResponse {
    success: boolean;
    error?: string;
    services: ServiceUptimeSummary[];
    containers: DockerContainerItem[];
    fleetSummary: DockerFleetSummary;
    incidents: IncidentRecord[];
    activeIncidentsCount: number;
    overallUptime24h: number;
    overallUptime7d: number;
    lastProbeTime: string;
}
