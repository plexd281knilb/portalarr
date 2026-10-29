export type IptvProviderType = "XTREAM_CODES" | "M3U_URL" | "M3U_FILE" | "HDHOMERUN";

export type IptvProviderStatus = "ONLINE" | "DEGRADED" | "EXPIRED" | "OFFLINE";

export interface IptvSettingsDTO {
    enabled: boolean;
    dispatcharrUrl: string;
    hasDispatcharrApiKey: boolean;
    defaultMaxStreamsPerUser: number;
    allowTrialAccess: boolean;
    trialDailyMinutesLimit: number;
    enforceSingleHousehold: boolean;
    dvrBufferReservation: number;
    autoPruneInactiveDays: number;
    healthCheckIntervalMinutes: number;
    epgSyncSchedule: string;
    lastHealthCheckAt?: string | null;
    lastEpgSyncAt?: string | null;
    lastEpgSyncStatus?: string | null;
}

export interface IptvProviderDTO {
    id: string;
    name: string;
    type: IptvProviderType;
    serverUrl?: string | null; // Masked for non-admins
    username?: string | null;  // Masked
    m3uUrl?: string | null;    // Masked
    epgUrl?: string | null;    // Masked
    hdhrIp?: string | null;
    maxConnections: number;
    activeStreams: number;
    status: IptvProviderStatus;
    lastPingMs?: number | null;
    accountExpiresAt?: string | null;
    lastHealthCheck?: string | null;
    healthError?: string | null;
    priorityOrder: number;
    enabled: boolean;
    streamCount?: number;
}

export interface IptvProfileDTO {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
    icon?: string | null;
    virtualTunerSlug?: string | null;
    isPublic: boolean;
    minRoleRequired: string;
    channelCount: number;
}

export interface IptvChannelDTO {
    id: string;
    channelNumber?: number | null;
    callsign?: string | null;
    name: string;
    logoUrl?: string | null;
    genre?: string | null;
    xmltvId?: string | null;
    epgName?: string | null;
    isCustom: boolean;
    isActive: boolean;
    totalViewHours: number;
    lastWatchedAt?: string | null;
}

export interface IptvCapacityMetrics {
    totalMaxConnections: number;
    totalActiveStreams: number;
    availableStreams: number;
    dvrReservedStreams: number;
    freeStreamBuffer: number;
    saturationPercentage: number;
    isNearLimit: boolean;
    isSaturated: boolean;
    providers: {
        id: string;
        name: string;
        type: IptvProviderType;
        maxConnections: number;
        activeStreams: number;
        status: IptvProviderStatus;
    }[];
}

export interface IptvWatchSessionDTO {
    id: string;
    sessionKey: string;
    userId?: string | null;
    userName: string;
    channelId?: string | null;
    channelTitle: string;
    programTitle?: string | null;
    providerId?: string | null;
    providerName?: string | null;
    platform?: string | null;
    device?: string | null;
    ipAddress?: string | null;
    location?: string | null;
    streamBitrateKbps?: number | null;
    transcodeDecision?: string | null;
    transcodeHw: boolean;
    startedAt: string;
    durationSeconds: number;
    isSharingAlert: boolean;
}

export interface IptvUserTokenDTO {
    id: string;
    label: string;
    token: string;
    profileId?: string | null;
    profileName?: string | null;
    maxStreams: number;
    activeStreams: number;
    lastAccessIp?: string | null;
    lastAccessAt?: string | null;
    isRevoked: boolean;
    expiresAt?: string | null;
    m3uUrl?: string;
    epgUrl?: string;
}
