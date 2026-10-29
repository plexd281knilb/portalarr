import prisma from "@/lib/prisma";
import { encryptData, decryptData } from "@/lib/encryption";
import { IptvCapacityMetrics, IptvProviderDTO, IptvSettingsDTO, IptvProviderType, IptvProviderStatus } from "./types";

/**
 * Retrieves the global IPTV settings, initializing default values if missing.
 */
export async function getIptvSettings(): Promise<IptvSettingsDTO> {
    let settings = await prisma.iptvSettings.findUnique({
        where: { id: "global" }
    });

    if (!settings) {
        settings = await prisma.iptvSettings.create({
            data: {
                id: "global",
                enabled: false,
                defaultMaxStreamsPerUser: 1,
                allowTrialAccess: false,
                trialDailyMinutesLimit: 30,
                enforceSingleHousehold: true,
                dvrBufferReservation: 1,
                autoPruneInactiveDays: 30,
                plexHomeMaxSlots: 14,
                plexHomeInactivityDays: 21,
                plexHomeAutoKickEnabled: false,
                healthCheckIntervalMinutes: 15,
                epgSyncSchedule: "daily_3am"
            }
        });
    }

    return {
        enabled: settings.enabled,
        dispatcharrUrl: settings.dispatcharrUrl || "",
        hasDispatcharrApiKey: Boolean(settings.dispatcharrApiKey),
        defaultMaxStreamsPerUser: settings.defaultMaxStreamsPerUser,
        allowTrialAccess: settings.allowTrialAccess,
        trialDailyMinutesLimit: settings.trialDailyMinutesLimit,
        enforceSingleHousehold: settings.enforceSingleHousehold,
        dvrBufferReservation: settings.dvrBufferReservation,
        autoPruneInactiveDays: settings.autoPruneInactiveDays,
        plexHomeMaxSlots: (settings as any).plexHomeMaxSlots ?? 14,
        plexHomeInactivityDays: (settings as any).plexHomeInactivityDays ?? 21,
        plexHomeAutoKickEnabled: Boolean((settings as any).plexHomeAutoKickEnabled),
        healthCheckIntervalMinutes: settings.healthCheckIntervalMinutes,
        epgSyncSchedule: settings.epgSyncSchedule || "daily_3am",
        lastHealthCheckAt: settings.lastHealthCheckAt?.toISOString() || null,
        lastEpgSyncAt: settings.lastEpgSyncAt?.toISOString() || null,
        lastEpgSyncStatus: settings.lastEpgSyncStatus
    };
}

/**
 * Updates global IPTV settings with encrypted API keys.
 */
export async function saveIptvSettings(data: Partial<IptvSettingsDTO> & { dispatcharrApiKey?: string }): Promise<IptvSettingsDTO> {
    const updatePayload: any = {};

    if (data.enabled !== undefined) updatePayload.enabled = data.enabled;
    if (data.dispatcharrUrl !== undefined) updatePayload.dispatcharrUrl = data.dispatcharrUrl.trim();
    if (data.dispatcharrApiKey !== undefined && data.dispatcharrApiKey.trim() !== "") {
        updatePayload.dispatcharrApiKey = encryptData(data.dispatcharrApiKey.trim());
    }
    if (data.defaultMaxStreamsPerUser !== undefined) updatePayload.defaultMaxStreamsPerUser = data.defaultMaxStreamsPerUser;
    if (data.allowTrialAccess !== undefined) updatePayload.allowTrialAccess = data.allowTrialAccess;
    if (data.trialDailyMinutesLimit !== undefined) updatePayload.trialDailyMinutesLimit = data.trialDailyMinutesLimit;
    if (data.enforceSingleHousehold !== undefined) updatePayload.enforceSingleHousehold = data.enforceSingleHousehold;
    if (data.dvrBufferReservation !== undefined) updatePayload.dvrBufferReservation = data.dvrBufferReservation;
    if (data.autoPruneInactiveDays !== undefined) updatePayload.autoPruneInactiveDays = data.autoPruneInactiveDays;
    if (data.plexHomeMaxSlots !== undefined) updatePayload.plexHomeMaxSlots = data.plexHomeMaxSlots;
    if (data.plexHomeInactivityDays !== undefined) updatePayload.plexHomeInactivityDays = data.plexHomeInactivityDays;
    if (data.plexHomeAutoKickEnabled !== undefined) updatePayload.plexHomeAutoKickEnabled = Boolean(data.plexHomeAutoKickEnabled);
    if (data.healthCheckIntervalMinutes !== undefined) updatePayload.healthCheckIntervalMinutes = data.healthCheckIntervalMinutes;
    if (data.epgSyncSchedule !== undefined) updatePayload.epgSyncSchedule = data.epgSyncSchedule;

    await prisma.iptvSettings.upsert({
        where: { id: "global" },
        create: {
            id: "global",
            ...updatePayload
        },
        update: updatePayload
    });

    return getIptvSettings();
}

/**
 * Retrieves the raw decrypted Dispatcharr API key for server-side integration.
 */
export async function getDecryptedDispatcharrApiKey(): Promise<string> {
    const settings = await prisma.iptvSettings.findUnique({
        where: { id: "global" },
        select: { dispatcharrApiKey: true }
    });
    if (!settings?.dispatcharrApiKey) return "";
    return decryptData(settings.dispatcharrApiKey);
}

/**
 * Encrypts provider credentials using AES-256-GCM.
 */
export function encryptProviderCredentials(input: {
    serverUrl?: string | null;
    username?: string | null;
    password?: string | null;
    m3uUrl?: string | null;
    epgUrl?: string | null;
}) {
    return {
        serverUrl: input.serverUrl ? encryptData(input.serverUrl.trim()) : null,
        username: input.username ? encryptData(input.username.trim()) : null,
        password: input.password ? encryptData(input.password) : null,
        m3uUrl: input.m3uUrl ? encryptData(input.m3uUrl.trim()) : null,
        epgUrl: input.epgUrl ? encryptData(input.epgUrl.trim()) : null
    };
}

/**
 * Decrypts provider credentials for internal execution.
 */
export function decryptProviderCredentials(provider: {
    serverUrl?: string | null;
    username?: string | null;
    password?: string | null;
    m3uUrl?: string | null;
    epgUrl?: string | null;
}) {
    return {
        serverUrl: provider.serverUrl ? decryptData(provider.serverUrl) : "",
        username: provider.username ? decryptData(provider.username) : "",
        password: provider.password ? decryptData(provider.password) : "",
        m3uUrl: provider.m3uUrl ? decryptData(provider.m3uUrl) : "",
        epgUrl: provider.epgUrl ? decryptData(provider.epgUrl) : ""
    };
}

/**
 * Masks sensitive provider credentials for safe client display.
 */
export function maskProviderCredentials(provider: any): IptvProviderDTO {
    const decryptedUsername = provider.username ? decryptData(provider.username) : "";
    const maskedUsername = decryptedUsername ? `${decryptedUsername.slice(0, 2)}***${decryptedUsername.slice(-1)}` : null;

    return {
        id: provider.id,
        name: provider.name,
        type: provider.type as IptvProviderType,
        serverUrl: provider.serverUrl ? "https://***[PROTECTED]" : null,
        username: maskedUsername,
        m3uUrl: provider.m3uUrl ? "https://***[M3U_VAULT]" : null,
        epgUrl: provider.epgUrl ? "https://***[EPG_VAULT]" : null,
        hdhrIp: provider.hdhrIp,
        maxConnections: provider.maxConnections,
        activeStreams: provider.activeStreams,
        status: provider.status as IptvProviderStatus,
        lastPingMs: provider.lastPingMs,
        accountExpiresAt: provider.accountExpiresAt?.toISOString() || null,
        lastHealthCheck: provider.lastHealthCheck?.toISOString() || null,
        healthError: provider.healthError,
        priorityOrder: provider.priorityOrder,
        enabled: provider.enabled,
        streamCount: provider._count?.channelStreams || 0
    };
}

/**
 * Computes capacity, saturation and DVR buffer reservations across all enabled providers.
 */
export async function calculateIptvCapacity(): Promise<IptvCapacityMetrics> {
    const [providers, settings] = await Promise.all([
        prisma.iptvProvider.findMany({
            where: { enabled: true },
            orderBy: { priorityOrder: "asc" }
        }),
        getIptvSettings()
    ]);

    let totalMaxConnections = 0;
    let totalActiveStreams = 0;

    const providerMetrics = providers.map((p) => {
        totalMaxConnections += p.maxConnections;
        totalActiveStreams += p.activeStreams;
        return {
            id: p.id,
            name: p.name,
            type: p.type as IptvProviderType,
            maxConnections: p.maxConnections,
            activeStreams: p.activeStreams,
            status: p.status as IptvProviderStatus
        };
    });

    const dvrReservedStreams = settings.dvrBufferReservation || 1;
    const availableStreams = Math.max(0, totalMaxConnections - totalActiveStreams);
    const freeStreamBuffer = Math.max(0, availableStreams - dvrReservedStreams);
    const saturationPercentage = totalMaxConnections > 0 
        ? Math.min(100, Math.round((totalActiveStreams / totalMaxConnections) * 100))
        : 0;

    return {
        totalMaxConnections,
        totalActiveStreams,
        availableStreams,
        dvrReservedStreams,
        freeStreamBuffer,
        saturationPercentage,
        isNearLimit: freeStreamBuffer <= 1 && totalMaxConnections > 0,
        isSaturated: availableStreams <= 0,
        providers: providerMetrics
    };
}
