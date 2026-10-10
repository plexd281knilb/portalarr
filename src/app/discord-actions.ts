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
    discordFetch,
    DISCORD_SERVER_BLUEPRINT,
    DISCORD_ROLES_BLUEPRINT
} from "@/lib/discord/discord-bot";
import {
    getDiscordMembersWithStatus,
    linkUserToDiscord,
    unlinkUserFromDiscord,
    syncUserRoleToDiscord,
    syncAllUsersRolesToDiscord,
    syncDiscordRolesToPortalarr,
    syncAllDiscordRolesToPortalarr,
    autoMatchAndLinkUsers
} from "@/lib/discord/discord-role-sync";
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

/**
 * Admin: Retrieves all Discord guild members with linked Portalarr status and auto-match suggestions
 */
export async function getDiscordMembersWithStatusAction() {
    await verifyAdmin();
    return await getDiscordMembersWithStatus();
}

/**
 * Admin: Links a Portalarr user to a Discord account Snowflake ID
 */
export async function linkUserToDiscordAction(params: {
    userId: string;
    discordId: string;
    discordUsername?: string;
    discordDiscriminator?: string;
    discordAvatar?: string;
}) {
    await verifyAdmin();
    return await linkUserToDiscord({ ...params, syncRolesImmediately: true });
}

/**
 * Admin: Unlinks a user from Discord
 */
export async function unlinkUserFromDiscordAction(userId: string) {
    await verifyAdmin();
    return await unlinkUserFromDiscord(userId);
}

/**
 * Admin: Pushes a user's Portalarr role to Discord
 */
export async function syncUserRoleToDiscordAction(userId: string) {
    await verifyAdmin();
    return await syncUserRoleToDiscord(userId);
}

/**
 * Admin: Batch pushes all linked Portalarr users to Discord
 */
export async function syncAllUsersRolesToDiscordAction() {
    await verifyAdmin();
    return await syncAllUsersRolesToDiscord();
}

/**
 * Admin: Pulls Discord roles into a Portalarr user's account
 */
export async function syncDiscordRolesToPortalarrAction(discordId: string) {
    await verifyAdmin();
    return await syncDiscordRolesToPortalarr(discordId);
}

/**
 * Admin: Batch pulls Discord roles from all linked members into Portalarr
 */
export async function syncAllDiscordRolesToPortalarrAction() {
    await verifyAdmin();
    return await syncAllDiscordRolesToPortalarr();
}

/**
 * Admin: Auto-matches unlinked Discord users with Portalarr users
 */
export async function autoMatchDiscordUsersAction() {
    await verifyAdmin();
    return await autoMatchAndLinkUsers();
}

/**
 * User Self-Service: Links current logged-in user's account to Discord by username/tag/snowflake ID
 */
export async function linkMyDiscordAccountAction(query: string): Promise<{
    success: boolean;
    error?: string;
    discordUsername?: string;
    rolesSynced?: boolean;
}> {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) return { success: false, error: "Authentication required" };

        const cleanQuery = query.trim().replace(/^@/, "");
        if (!cleanQuery) return { success: false, error: "Please enter a Discord username or ID" };

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
        if (!settings?.discordBotToken || !settings?.discordGuildId) {
            return { success: false, error: "Discord integration is not configured" };
        }

        const rawToken = decryptData(settings.discordBotToken);
        if (!rawToken) return { success: false, error: "Failed to decrypt bot token" };

        const guildId = settings.discordGuildId;

        // Search members in guild
        let targetMember: any = null;

        // 1. If it's a numeric snowflake ID (17-20 digits)
        if (/^\d{17,20}$/.test(cleanQuery)) {
            const singleRes = await discordFetch(`/guilds/${guildId}/members/${cleanQuery}`, { method: "GET" }, rawToken);
            if (singleRes.ok && singleRes.data) {
                targetMember = singleRes.data;
            }
        }

        // 2. Search by query in guild
        if (!targetMember) {
            const searchRes = await discordFetch(`/guilds/${guildId}/members/search?query=${encodeURIComponent(cleanQuery)}&limit=10`, { method: "GET" }, rawToken);
            if (searchRes.ok && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                targetMember = searchRes.data.find((m: any) => 
                    m.user?.username?.toLowerCase() === cleanQuery.toLowerCase() ||
                    m.nick?.toLowerCase() === cleanQuery.toLowerCase()
                ) || searchRes.data[0];
            }
        }

        if (!targetMember || !targetMember.user) {
            return {
                success: false,
                error: `Could not find "${cleanQuery}" in the Discord server. Make sure you have joined the Discord server first!`
            };
        }

        const discordUser = targetMember.user;
        const avatarUrl = discordUser.avatar 
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
            : undefined;

        const linkRes = await linkUserToDiscord({
            userId: currentUser.id,
            discordId: discordUser.id,
            discordUsername: discordUser.username,
            discordDiscriminator: discordUser.discriminator,
            discordAvatar: avatarUrl,
            syncRolesImmediately: true
        });

        if (!linkRes.success) {
            return { success: false, error: linkRes.error };
        }

        return {
            success: true,
            discordUsername: discordUser.username,
            rolesSynced: linkRes.rolesSynced
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to link Discord account" };
    }
}

/**
 * User Self-Service: Unlinks current logged-in user's Discord account
 */
export async function unlinkMyDiscordAccountAction(): Promise<{ success: boolean; error?: string }> {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) return { success: false, error: "Authentication required" };
        return await unlinkUserFromDiscord(currentUser.id);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * User Self-Service: Re-syncs the current logged-in user's Discord role
 */
export async function syncMyDiscordRoleAction(): Promise<{ success: boolean; error?: string; roleName?: string }> {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) return { success: false, error: "Authentication required" };
        if (!currentUser.discordId) return { success: false, error: "No Discord account linked" };
        return await syncUserRoleToDiscord(currentUser.id);
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Admin: Links any Portalarr user to a Discord account by username/nickname/snowflake ID
 */
export async function adminLinkUserByHandleAction(userId: string, query: string): Promise<{
    success: boolean;
    error?: string;
    discordUsername?: string;
    discordId?: string;
    rolesSynced?: boolean;
}> {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();

        const cleanQuery = query.trim().replace(/^@/, "");
        if (!cleanQuery) return { success: false, error: "Please enter a Discord username or ID" };

        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser) return { success: false, error: "User not found" };

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
        if (!settings?.discordBotToken || !settings?.discordGuildId) {
            return { success: false, error: "Discord integration is not configured" };
        }

        const rawToken = decryptData(settings.discordBotToken);
        if (!rawToken) return { success: false, error: "Failed to decrypt bot token" };

        const guildId = settings.discordGuildId;
        let targetMember: any = null;

        // 1. If it's a numeric snowflake ID (17-20 digits)
        if (/^\d{17,20}$/.test(cleanQuery)) {
            const singleRes = await discordFetch(`/guilds/${guildId}/members/${cleanQuery}`, { method: "GET" }, rawToken);
            if (singleRes.ok && singleRes.data) {
                targetMember = singleRes.data;
            }
        }

        // 2. Search by query in guild
        if (!targetMember) {
            const searchRes = await discordFetch(`/guilds/${guildId}/members/search?query=${encodeURIComponent(cleanQuery)}&limit=10`, { method: "GET" }, rawToken);
            if (searchRes.ok && Array.isArray(searchRes.data) && searchRes.data.length > 0) {
                targetMember = searchRes.data.find((m: any) => 
                    m.user?.username?.toLowerCase() === cleanQuery.toLowerCase() ||
                    m.nick?.toLowerCase() === cleanQuery.toLowerCase() ||
                    m.user?.global_name?.toLowerCase() === cleanQuery.toLowerCase()
                ) || searchRes.data[0];
            }
        }

        if (!targetMember || !targetMember.user) {
            return {
                success: false,
                error: `Could not find member "${cleanQuery}" in the Discord server. Ensure the user has joined the Discord server first.`
            };
        }

        const discordUser = targetMember.user;
        const avatarUrl = discordUser.avatar 
            ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=128`
            : undefined;

        const linkRes = await linkUserToDiscord({
            userId: targetUser.id,
            discordId: discordUser.id,
            discordUsername: discordUser.username,
            discordDiscriminator: discordUser.discriminator,
            discordAvatar: avatarUrl,
            syncRolesImmediately: true
        });

        if (!linkRes.success) {
            return { success: false, error: linkRes.error };
        }

        return {
            success: true,
            discordUsername: discordUser.username,
            discordId: discordUser.id,
            rolesSynced: linkRes.rolesSynced
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to link Discord account" };
    }
}

/**
 * Retrieves the permanent Discord server invite URL (or generates an instant invite if not set)
 */
export async function getDiscordServerInviteUrlAction(): Promise<{
    success: boolean;
    inviteUrl?: string;
    error?: string;
}> {
    try {
        const currentUser = await getCurrentUser();
        if (!currentUser) return { success: false, error: "Authentication required" };

        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
        if (settings?.discordInviteUrl && settings.discordInviteUrl.trim().length > 0) {
            return { success: true, inviteUrl: settings.discordInviteUrl.trim() };
        }

        // If not set, generate an instant invite via bot if configured
        if (settings?.discordBotToken && settings?.discordGuildId) {
            const rawToken = decryptData(settings.discordBotToken);
            if (rawToken) {
                const guildId = settings.discordGuildId;
                const chRes = await discordFetch<any[]>(`/guilds/${guildId}/channels`, { method: "GET" }, rawToken);
                if (chRes.ok && Array.isArray(chRes.data)) {
                    const welcomeCh = chRes.data.find((c: any) => c.name === "welcome-and-rules") || chRes.data.find((c: any) => c.type === 0);
                    if (welcomeCh) {
                        const invRes = await discordFetch(`/channels/${welcomeCh.id}/invites`, {
                            method: "POST",
                            body: JSON.stringify({ max_age: 0, max_uses: 0, unique: false })
                        }, rawToken);

                        if (invRes.ok && invRes.data?.code) {
                            const newInviteUrl = `https://discord.gg/${invRes.data.code}`;
                            await prisma.settings.update({
                                where: { id: settings.id },
                                data: { discordInviteUrl: newInviteUrl }
                            });
                            return { success: true, inviteUrl: newInviteUrl };
                        }
                    }
                }
            }
        }

        return { success: false, error: "Discord invite URL is not configured" };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to retrieve Discord invite URL" };
    }
}



