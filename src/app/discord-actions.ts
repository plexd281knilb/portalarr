"use server";

import { prisma, ensureSchemaColumns } from "@/lib/prisma";
import { getCurrentUser } from "@/app/auth-actions";
import { encryptData, decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import {
    verifyDiscordBotCredentials,
    syncDiscordServerStructure,
    updateDiscordLiveStatus,
    postDiscordMessage,
    generateDiscordEmbed,
    getDiscordBotInviteUrl,
    DISCORD_SERVER_BLUEPRINT,
    DISCORD_ROLES_BLUEPRINT
} from "@/lib/discord/discord-bot";
import { getAdminInfrastructureStatusAction } from "@/app/actions";

async function verifyAdmin() {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
        throw new Error("Unauthorized: Admin permissions required");
    }
    return user;
}

export interface DiscordSettingsResult {
    success: boolean;
    error?: string;
    isConfigured: boolean;
    botTokenMasked?: string;
    guildId?: string;
    clientId?: string;
    serverSyncEnabled: boolean;
    statusChannelId?: string;
    requestsChannelId?: string;
    announcementsChannelId?: string;
    inviteUrl?: string;
    lastSyncAt?: string | null;
    lastSyncStatus?: any;
    blueprint: typeof DISCORD_SERVER_BLUEPRINT;
    rolesBlueprint: typeof DISCORD_ROLES_BLUEPRINT;
}

/**
 * Retrieves the current Discord Bot configuration and blueprint overview
 */
export async function getDiscordBotSettingsAction(): Promise<DiscordSettingsResult> {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();

        const hasToken = !!(settings?.discordBotToken && settings.discordBotToken.trim().length > 0);
        let maskedToken = "";
        if (hasToken) {
            const raw = decryptData(settings!.discordBotToken!);
            if (raw && raw.length > 8) {
                maskedToken = `${raw.slice(0, 4)}••••••••••••${raw.slice(-4)}`;
            } else {
                maskedToken = "••••••••••••••••";
            }
        }

        let parsedSyncStatus = null;
        if (settings?.discordLastSyncStatus) {
            try {
                parsedSyncStatus = JSON.parse(settings.discordLastSyncStatus);
            } catch {
                parsedSyncStatus = { summary: settings.discordLastSyncStatus };
            }
        }

        return {
            success: true,
            isConfigured: hasToken && !!settings?.discordGuildId,
            botTokenMasked: maskedToken,
            guildId: settings?.discordGuildId || "",
            clientId: settings?.discordClientId || "",
            serverSyncEnabled: settings?.discordServerSyncEnabled ?? true,
            statusChannelId: settings?.discordStatusChannelId || "",
            requestsChannelId: settings?.discordRequestsChannelId || "",
            announcementsChannelId: settings?.discordAnnouncementsChannelId || "",
            inviteUrl: settings?.discordInviteUrl || "",
            lastSyncAt: settings?.discordLastSyncAt ? settings.discordLastSyncAt.toISOString() : null,
            lastSyncStatus: parsedSyncStatus,
            blueprint: DISCORD_SERVER_BLUEPRINT,
            rolesBlueprint: DISCORD_ROLES_BLUEPRINT
        };
    } catch (e: any) {
        return {
            success: false,
            error: e?.message || "Failed to load Discord settings",
            isConfigured: false,
            serverSyncEnabled: true,
            blueprint: DISCORD_SERVER_BLUEPRINT,
            rolesBlueprint: DISCORD_ROLES_BLUEPRINT
        };
    }
}

/**
 * Saves Discord Bot credentials, channels, and toggles
 */
export async function saveDiscordBotSettingsAction(data: {
    discordBotToken?: string;
    discordGuildId?: string;
    discordClientId?: string;
    discordServerSyncEnabled?: boolean;
    discordStatusChannelId?: string;
    discordRequestsChannelId?: string;
    discordAnnouncementsChannelId?: string;
    discordInviteUrl?: string;
}): Promise<{ success: boolean; error?: string; message?: string }> {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();

        const updateData: any = {};

        // Only update token if a new, non-masked token string was passed
        if (typeof data.discordBotToken === "string") {
            const trimmed = data.discordBotToken.trim();
            if (trimmed && !trimmed.includes("••••")) {
                updateData.discordBotToken = encryptData(trimmed);
            } else if (trimmed === "") {
                updateData.discordBotToken = null;
            }
        }

        if (data.discordGuildId !== undefined) {
            updateData.discordGuildId = data.discordGuildId?.trim() || null;
        }

        if (data.discordClientId !== undefined) {
            updateData.discordClientId = data.discordClientId?.trim() || null;
        }

        if (data.discordServerSyncEnabled !== undefined) {
            updateData.discordServerSyncEnabled = data.discordServerSyncEnabled;
        }

        if (data.discordStatusChannelId !== undefined) {
            updateData.discordStatusChannelId = data.discordStatusChannelId?.trim() || null;
        }

        if (data.discordRequestsChannelId !== undefined) {
            updateData.discordRequestsChannelId = data.discordRequestsChannelId?.trim() || null;
        }

        if (data.discordAnnouncementsChannelId !== undefined) {
            updateData.discordAnnouncementsChannelId = data.discordAnnouncementsChannelId?.trim() || null;
        }

        if (data.discordInviteUrl !== undefined) {
            updateData.discordInviteUrl = data.discordInviteUrl?.trim() || null;
        }

        const existing = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();

        if (existing) {
            await prisma.settings.update({
                where: { id: existing.id },
                data: updateData
            });
        } else {
            await prisma.settings.create({
                data: {
                    id: "global",
                    ...updateData
                }
            });
        }

        logger.addLog("INFO", "DISCORD", "💾 Discord bot settings saved successfully.");
        return { success: true, message: "Discord bot settings saved successfully." };
    } catch (e: any) {
        logger.addLog("ERROR", "DISCORD", `Failed to save Discord settings: ${e?.message}`);
        return { success: false, error: e?.message || "Failed to save Discord settings" };
    }
}

/**
 * Tests Discord Bot Token and Guild access
 */
export async function testDiscordBotConnectionAction(options?: {
    botToken?: string;
    guildId?: string;
}): Promise<{
    success: boolean;
    error?: string;
    bot?: any;
    guild?: any;
}> {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();

        let tokenToUse = options?.botToken?.trim();
        let guildIdToUse = options?.guildId?.trim();

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();

        // If no explicit token passed or if masked, decrypt stored token
        if (!tokenToUse || tokenToUse.includes("••••")) {
            if (settings?.discordBotToken) {
                tokenToUse = decryptData(settings.discordBotToken);
            }
        }

        if (!guildIdToUse && settings?.discordGuildId) {
            guildIdToUse = settings.discordGuildId;
        }

        if (!tokenToUse) {
            return { success: false, error: "No Discord Bot Token provided or configured." };
        }

        return await verifyDiscordBotCredentials({
            botToken: tokenToUse,
            guildId: guildIdToUse
        });
    } catch (e: any) {
        return { success: false, error: e?.message || "Failed to test Discord Bot connection." };
    }
}

/**
 * 1-Click Server Provisioning: Syncs categories, channels, permissions, roles, and pinned embeds
 */
export async function syncDiscordServerAction(options?: {
    updateTopics?: boolean;
    createRoles?: boolean;
    postPinnedEmbeds?: boolean;
}): Promise<{
    success: boolean;
    error?: string;
    summaryText?: string;
    details?: any;
}> {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
        if (!settings?.discordBotToken || !settings?.discordGuildId) {
            return {
                success: false,
                error: "Discord Bot Token and Guild ID must be configured in settings before syncing."
            };
        }

        const rawToken = decryptData(settings.discordBotToken);
        if (!rawToken) {
            return { success: false, error: "Failed to decrypt Discord Bot Token." };
        }

        const res = await syncDiscordServerStructure({
            botToken: rawToken,
            guildId: settings.discordGuildId,
            options: {
                updateTopics: options?.updateTopics ?? true,
                createRoles: options?.createRoles ?? true,
                postPinnedEmbeds: options?.postPinnedEmbeds ?? true
            }
        });

        if (res.success) {
            const updatedChannelMap = res.channelMap;
            const statusChId = updatedChannelMap["system-status"] || settings.discordStatusChannelId;
            const requestsChId = updatedChannelMap["media-requests"] || settings.discordRequestsChannelId;
            const announcementsChId = updatedChannelMap["announcements"] || settings.discordAnnouncementsChannelId;

            // Record sync in database
            await prisma.settings.update({
                where: { id: settings.id },
                data: {
                    discordLastSyncAt: new Date(),
                    discordLastSyncStatus: JSON.stringify({
                        summaryText: res.summaryText,
                        categoriesCreated: res.categoriesCreated,
                        channelsCreated: res.channelsCreated,
                        rolesCreated: res.rolesCreated,
                        embedsPosted: res.embedsPosted,
                        timestamp: new Date().toISOString()
                    }),
                    ...(statusChId ? { discordStatusChannelId: statusChId } : {}),
                    ...(requestsChId ? { discordRequestsChannelId: requestsChId } : {}),
                    ...(announcementsChId ? { discordAnnouncementsChannelId: announcementsChId } : {})
                }
            });

            // Also refresh live status embed in #system-status if created
            if (statusChId) {
                try {
                    const healthRes = await getAdminInfrastructureStatusAction();
                    await updateDiscordLiveStatus({
                        botToken: rawToken,
                        guildId: settings.discordGuildId,
                        channelId: statusChId,
                        systemData: healthRes?.success ? healthRes : undefined
                    });
                } catch (err: any) {
                    logger.addLog("WARN", "DISCORD", `Could not post initial system status embed: ${err.message}`);
                }
            }
        }

        return {
            success: res.success,
            error: res.error,
            summaryText: res.summaryText,
            details: res
        };
    } catch (e: any) {
        logger.addLog("ERROR", "DISCORD", `Failed executing Discord server sync: ${e?.message}`);
        return { success: false, error: e?.message || "Failed executing Discord server sync." };
    }
}

/**
 * Updates the #system-status live embed with real-time platform telemetry
 */
export async function updateDiscordStatusEmbedAction(): Promise<{ success: boolean; error?: string; messageId?: string }> {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
        if (!settings?.discordBotToken || !settings?.discordGuildId) {
            return { success: false, error: "Discord credentials are not configured." };
        }

        const rawToken = decryptData(settings.discordBotToken);
        if (!rawToken) {
            return { success: false, error: "Failed to decrypt Discord token." };
        }

        const healthRes = await getAdminInfrastructureStatusAction();

        return await updateDiscordLiveStatus({
            botToken: rawToken,
            guildId: settings.discordGuildId,
            channelId: settings.discordStatusChannelId || undefined,
            systemData: healthRes?.success ? healthRes : undefined
        });
    } catch (e: any) {
        return { success: false, error: e?.message || "Failed to update Discord status embed." };
    }
}

/**
 * Posts a test message or guide embed to a specific channel
 */
export async function postDiscordTestMessageAction(
    channelId: string,
    message?: string
): Promise<{ success: boolean; error?: string }> {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();

        if (!channelId || !channelId.trim()) {
            return { success: false, error: "Channel ID is required." };
        }

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
        if (!settings?.discordBotToken) {
            return { success: false, error: "Discord Bot Token is not configured." };
        }

        const rawToken = decryptData(settings.discordBotToken);
        if (!rawToken) return { success: false, error: "Failed to decrypt Discord token." };

        const testEmbed = {
            title: "🎉 Portalarr Discord Bot: Connection Verified",
            description: message || "Your Discord Bot is fully connected to Portalarr Mission Control! Automated channel syncing, guide embeds, and system telemetry are ready.",
            color: 0x10B981,
            fields: [
                { name: "⚡ Status", value: "Online & Verified", inline: true },
                { name: "🕒 Timestamp", value: new Date().toLocaleTimeString(), inline: true }
            ],
            footer: { text: "Portalarr Mission Control • DomsHomeLab" }
        };

        const res = await postDiscordMessage({
            botToken: rawToken,
            channelId: channelId.trim(),
            embeds: [testEmbed]
        });

        return { success: res.success, error: res.error };
    } catch (e: any) {
        return { success: false, error: e?.message || "Failed to send test message." };
    }
}
