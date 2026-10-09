/**
 * Portalarr Bidirectional Discord Role Sync & Account Mapping Engine
 * 
 * Bridges Portalarr / Plex accounts with Discord Guild accounts when usernames differ.
 * Enforces unified "⭐ Member" role for both Tier 1 and Tier 2 members, strictly
 * concealing internal tier classifications from the public Discord server.
 */

import { prisma } from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { discordFetch, DiscordRole } from "./discord-bot";

export interface ResolvedRoleMap {
    admin?: string;
    moderator?: string;
    member?: string;
    trial?: string;
    kids?: string;
    livingRoom?: string;
    pending?: string;
}

export interface DiscordMemberInfo {
    id: string;
    username: string;
    discriminator?: string;
    globalName?: string | null;
    nickname?: string | null;
    avatarUrl?: string;
    roles: string[];
    joinedAt?: string;
    linkedUserId?: string | null;
    linkedUsername?: string | null;
    suggestedMatch?: {
        userId: string;
        username: string;
        confidence: number;
        matchReason: string;
    } | null;
}

/**
 * Resolves the role map IDs from the live guild roles
 */
export async function getDiscordRoleMap(botToken: string, guildId: string): Promise<ResolvedRoleMap> {
    const rolesRes = await discordFetch<DiscordRole[]>(`/guilds/${guildId}/roles`, { method: "GET" }, botToken);
    const map: ResolvedRoleMap = {};

    if (!rolesRes.ok || !Array.isArray(rolesRes.data)) {
        return map;
    }

    for (const r of rolesRes.data) {
        const nameLower = r.name.toLowerCase();
        if (nameLower.includes("admin")) map.admin = r.id;
        else if (nameLower.includes("moderator")) map.moderator = r.id;
        // Unified Member role: matches "⭐ Member" or legacy "tier 1"
        else if (nameLower.includes("member") || nameLower.includes("tier 1")) map.member = r.id;
        else if (nameLower.includes("trial")) map.trial = r.id;
        else if (nameLower.includes("kid")) map.kids = r.id;
        else if (nameLower.includes("living room")) map.livingRoom = r.id;
        else if (nameLower.includes("pending")) map.pending = r.id;
    }

    return map;
}

/**
 * Computes the expected Discord role for a Portalarr user.
 * CRITICAL: Both STANDARD (Tier 1) and TIER_2_VIP (Tier 2) receive the unified 'member' role!
 */
export function computeExpectedDiscordRole(user: {
    role?: string | null;
    status?: string | null;
    membershipTier?: string | null;
    accountType?: string | null;
}, roleMap: ResolvedRoleMap): string | null {
    if (user.role === "ADMIN") return roleMap.admin || null;
    if (user.accountType === "KID") return roleMap.kids || null;
    if (user.accountType === "LIVING_ROOM") return roleMap.livingRoom || null;
    
    // Unified Member role for all active paying members (Tier 1 and Tier 2)
    if (user.status === "APPROVED") {
        return roleMap.member || null;
    }

    if (user.status === "TRIAL" || user.membershipTier === "TRIAL") {
        return roleMap.trial || null;
    }

    if (user.status === "PENDING") {
        return roleMap.pending || null;
    }

    return roleMap.member || null;
}

/**
 * Smart Heuristic Auto-Matching Engine
 * Pairs Discord members with Portalarr users when usernames differ
 */
export function findBestMatch(
    discordUser: {
        discordId: string;
        discordUsername: string;
        nickname?: string | null;
        globalName?: string | null;
    },
    candidateUsers: Array<{
        id: string;
        username: string;
        email?: string | null;
        name?: string | null;
        plexUsername?: string | null;
    }>
): { userId: string; username: string; confidence: number; matchReason: string } | null {
    const cleanDiscUser = discordUser.discordUsername.toLowerCase().trim();
    const cleanNick = (discordUser.nickname || "").toLowerCase().trim();
    const cleanGlobal = (discordUser.globalName || "").toLowerCase().trim();

    let bestMatch: { userId: string; username: string; confidence: number; matchReason: string } | null = null;

    for (const u of candidateUsers) {
        const uName = u.username.toLowerCase().trim();
        const plexName = (u.plexUsername || "").toLowerCase().trim();
        const realName = (u.name || "").toLowerCase().trim();
        const emailPrefix = (u.email || "").split("@")[0].toLowerCase().trim();

        // 1. Exact username or Plex username match (100%)
        if (cleanDiscUser === uName || (plexName && cleanDiscUser === plexName)) {
            return { userId: u.id, username: u.username, confidence: 100, matchReason: "Exact username match" };
        }

        // 2. Email prefix match (95%)
        if (emailPrefix && cleanDiscUser === emailPrefix) {
            if (!bestMatch || bestMatch.confidence < 95) {
                bestMatch = { userId: u.id, username: u.username, confidence: 95, matchReason: "Matches email prefix" };
            }
        }

        // 3. Server nickname exact match to username or Plex username (90%)
        if (cleanNick && (cleanNick === uName || cleanNick === plexName)) {
            if (!bestMatch || bestMatch.confidence < 90) {
                bestMatch = { userId: u.id, username: u.username, confidence: 90, matchReason: "Matches server nickname" };
            }
        }

        // 4. Nickname or display name matches real name (85%)
        if (realName && (cleanNick === realName || cleanGlobal === realName)) {
            if (!bestMatch || bestMatch.confidence < 85) {
                bestMatch = { userId: u.id, username: u.username, confidence: 85, matchReason: "Matches full name" };
            }
        }

        // 5. Global display name matches username (80%)
        if (cleanGlobal && (cleanGlobal === uName || cleanGlobal === plexName)) {
            if (!bestMatch || bestMatch.confidence < 80) {
                bestMatch = { userId: u.id, username: u.username, confidence: 80, matchReason: "Matches display name" };
            }
        }

        // 6. Substring match (70%)
        if (cleanDiscUser.length > 4 && (uName.includes(cleanDiscUser) || cleanDiscUser.includes(uName))) {
            if (!bestMatch || bestMatch.confidence < 70) {
                bestMatch = { userId: u.id, username: u.username, confidence: 70, matchReason: "Partial username match" };
            }
        }
    }

    return bestMatch;
}

/**
 * Retrieves bot credentials from database settings
 */
async function getBotConfig() {
    const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
    if (!settings?.discordBotToken || !settings?.discordGuildId) {
        return null;
    }
    const rawToken = decryptData(settings.discordBotToken);
    if (!rawToken) return null;

    return {
        botToken: rawToken,
        guildId: settings.discordGuildId
    };
}

/**
 * Links a Portalarr user to a Discord account Snowflake ID
 */
export async function linkUserToDiscord(params: {
    userId: string;
    discordId: string;
    discordUsername?: string;
    discordDiscriminator?: string;
    discordAvatar?: string;
    syncRolesImmediately?: boolean;
}): Promise<{ success: boolean; error?: string; rolesSynced?: boolean }> {
    try {
        const { userId, discordId, discordUsername, discordDiscriminator, discordAvatar, syncRolesImmediately = true } = params;

        // Check if discordId is already linked to another user
        const existing = await prisma.user.findFirst({
            where: { discordId, id: { not: userId } }
        });
        if (existing) {
            return { success: false, error: `Discord account is already linked to user "${existing.username}"` };
        }

        // Update user record
        await prisma.user.update({
            where: { id: userId },
            data: {
                discordId,
                discordUsername: discordUsername || null,
                discordDiscriminator: discordDiscriminator || null,
                discordAvatar: discordAvatar || null,
                discordLinkedAt: new Date()
            }
        });

        let rolesSynced = false;
        if (syncRolesImmediately) {
            const syncRes = await syncUserRoleToDiscord(userId);
            rolesSynced = syncRes.success;
        }

        return { success: true, rolesSynced };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to link Discord account" };
    }
}

/**
 * Unlinks a user from Discord
 */
export async function unlinkUserFromDiscord(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                discordId: null,
                discordUsername: null,
                discordDiscriminator: null,
                discordAvatar: null,
                discordLinkedAt: null
            }
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to unlink Discord account" };
    }
}

/**
 * Pushes a single Portalarr user's role to Discord
 */
export async function syncUserRoleToDiscord(userId: string): Promise<{ success: boolean; error?: string; roleAssigned?: string }> {
    try {
        const config = await getBotConfig();
        if (!config) return { success: false, error: "Discord bot not configured" };

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user || !user.discordId) {
            return { success: false, error: "User has no linked Discord account" };
        }

        const roleMap = await getDiscordRoleMap(config.botToken, config.guildId);
        const expectedRoleId = computeExpectedDiscordRole(user, roleMap);

        if (!expectedRoleId) {
            return { success: false, error: "Could not resolve expected Discord role" };
        }

        // 1. Fetch member's current roles
        const memberRes = await discordFetch<any>(`/guilds/${config.guildId}/members/${user.discordId}`, { method: "GET" }, config.botToken);
        if (!memberRes.ok || !memberRes.data) {
            return { success: false, error: `Discord user ${user.discordId} not found in server` };
        }

        const currentRoles: string[] = memberRes.data.roles || [];
        const managedRoles = [roleMap.admin, roleMap.moderator, roleMap.member, roleMap.trial, roleMap.kids, roleMap.livingRoom, roleMap.pending].filter(Boolean) as string[];

        // 2. Add expected role if missing
        if (!currentRoles.includes(expectedRoleId)) {
            await discordFetch(`/guilds/${config.guildId}/members/${user.discordId}/roles/${expectedRoleId}`, { method: "PUT" }, config.botToken);
        }

        // 3. Remove conflicting managed roles (enforce single primary status role)
        for (const rId of managedRoles) {
            if (rId !== expectedRoleId && currentRoles.includes(rId)) {
                await discordFetch(`/guilds/${config.guildId}/members/${user.discordId}/roles/${rId}`, { method: "DELETE" }, config.botToken);
            }
        }

        return { success: true, roleAssigned: expectedRoleId };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to sync role to Discord" };
    }
}

/**
 * Batch pushes all linked Portalarr users' roles to Discord
 */
export async function syncAllUsersRolesToDiscord(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
    try {
        const linkedUsers = await prisma.user.findMany({
            where: { discordId: { not: null } },
            select: { id: true, username: true }
        });

        let syncedCount = 0;
        const errors: string[] = [];

        for (const u of linkedUsers) {
            const res = await syncUserRoleToDiscord(u.id);
            if (res.success) syncedCount++;
            else errors.push(`${u.username}: ${res.error}`);
        }

        return { success: true, syncedCount, errors };
    } catch (e: any) {
        return { success: false, syncedCount: 0, errors: [e.message] };
    }
}

/**
 * Pulls Discord roles into a Portalarr user's account status
 */
export async function syncDiscordRolesToPortalarr(discordId: string): Promise<{ success: boolean; error?: string; user?: any }> {
    try {
        const config = await getBotConfig();
        if (!config) return { success: false, error: "Discord bot not configured" };

        const user = await prisma.user.findFirst({ where: { discordId } });
        if (!user) return { success: false, error: "No Portalarr user linked to this Discord ID" };

        const roleMap = await getDiscordRoleMap(config.botToken, config.guildId);
        const memberRes = await discordFetch<any>(`/guilds/${config.guildId}/members/${discordId}`, { method: "GET" }, config.botToken);

        if (!memberRes.ok || !memberRes.data) {
            return { success: false, error: "Member not found in Discord guild" };
        }

        const roles: string[] = memberRes.data.roles || [];
        const updateData: any = {};

        if (roleMap.admin && roles.includes(roleMap.admin)) {
            updateData.role = "ADMIN";
            updateData.status = "APPROVED";
        } else if (roleMap.member && roles.includes(roleMap.member)) {
            updateData.status = "APPROVED";
            // Preserve TIER_2_VIP if already assigned by admin, otherwise default to STANDARD
            if (user.membershipTier !== "TIER_2_VIP") {
                updateData.membershipTier = "STANDARD";
            }
        } else if (roleMap.trial && roles.includes(roleMap.trial)) {
            updateData.status = "TRIAL";
            updateData.membershipTier = "TRIAL";
        } else if (roleMap.kids && roles.includes(roleMap.kids)) {
            updateData.accountType = "KID";
        } else if (roleMap.livingRoom && roles.includes(roleMap.livingRoom)) {
            updateData.accountType = "LIVING_ROOM";
        } else if (roleMap.pending && roles.includes(roleMap.pending)) {
            updateData.status = "PENDING";
        }

        if (Object.keys(updateData).length > 0) {
            const updated = await prisma.user.update({
                where: { id: user.id },
                data: updateData
            });
            return { success: true, user: updated };
        }

        return { success: true, user };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to sync roles from Discord" };
    }
}

/**
 * Batch pulls roles from Discord for all linked members
 */
export async function syncAllDiscordRolesToPortalarr(): Promise<{ success: boolean; syncedCount: number; errors: string[] }> {
    try {
        const linkedUsers = await prisma.user.findMany({
            where: { discordId: { not: null } },
            select: { id: true, username: true, discordId: true }
        });

        let syncedCount = 0;
        const errors: string[] = [];

        for (const u of linkedUsers) {
            if (!u.discordId) continue;
            const res = await syncDiscordRolesToPortalarr(u.discordId);
            if (res.success) syncedCount++;
            else errors.push(`${u.username}: ${res.error}`);
        }

        return { success: true, syncedCount, errors };
    } catch (e: any) {
        return { success: false, syncedCount: 0, errors: [e.message] };
    }
}

/**
 * Admin: Retrieves all Discord guild members with linked Portalarr status and auto-match suggestions
 */
export async function getDiscordMembersWithStatus(): Promise<{
    success: boolean;
    members?: DiscordMemberInfo[];
    unlinkedCount?: number;
    linkedCount?: number;
    error?: string;
}> {
    try {
        const config = await getBotConfig();
        if (!config) return { success: false, error: "Discord bot not configured" };

        // 1. Fetch guild members from Discord
        const membersRes = await discordFetch<any[]>(`/guilds/${config.guildId}/members?limit=1000`, { method: "GET" }, config.botToken);
        if (!membersRes.ok || !Array.isArray(membersRes.data)) {
            return { success: false, error: membersRes.error || "Failed to fetch Discord members" };
        }

        // 2. Fetch all Portalarr users
        const portalarrUsers = await prisma.user.findMany({
            select: {
                id: true,
                username: true,
                email: true,
                name: true,
                plexUsername: true,
                discordId: true,
                discordUsername: true
            }
        });

        const linkedMap = new Map<string, { id: string; username: string }>();
        for (const u of portalarrUsers) {
            if (u.discordId) {
                linkedMap.set(u.discordId, { id: u.id, username: u.username });
            }
        }

        const unlinkedPortalarrUsers = portalarrUsers.filter(u => !u.discordId);
        const memberInfos: DiscordMemberInfo[] = [];

        for (const m of membersRes.data) {
            if (!m.user || m.user.bot) continue;

            const dId = m.user.id;
            const linked = linkedMap.get(dId);

            const avatarUrl = m.user.avatar
                ? `https://cdn.discordapp.com/avatars/${dId}/${m.user.avatar}.png?size=128`
                : undefined;

            const memberInfo: DiscordMemberInfo = {
                id: dId,
                username: m.user.username,
                discriminator: m.user.discriminator,
                globalName: m.user.global_name,
                nickname: m.nick,
                avatarUrl,
                roles: m.roles || [],
                joinedAt: m.joined_at,
                linkedUserId: linked?.id || null,
                linkedUsername: linked?.username || null,
                suggestedMatch: null
            };

            // If unlinked, attempt heuristic auto-match against candidate Portalarr users
            if (!linked) {
                const match = findBestMatch(
                    {
                        discordId: dId,
                        discordUsername: m.user.username,
                        nickname: m.nick,
                        globalName: m.user.global_name
                    },
                    unlinkedPortalarrUsers
                );
                if (match) {
                    memberInfo.suggestedMatch = match;
                }
            }

            memberInfos.push(memberInfo);
        }

        const linkedCount = memberInfos.filter(m => m.linkedUserId).length;
        const unlinkedCount = memberInfos.length - linkedCount;

        return {
            success: true,
            members: memberInfos,
            linkedCount,
            unlinkedCount
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to retrieve Discord members" };
    }
}

/**
 * Auto-matches unlinked Discord users with Portalarr users (threshold >= 90% confidence)
 */
export async function autoMatchAndLinkUsers(): Promise<{
    success: boolean;
    linkedCount: number;
    results: Array<{ username: string; discordUsername: string; confidence: number }>;
    error?: string;
}> {
    try {
        const membersRes = await getDiscordMembersWithStatus();
        if (!membersRes.success || !membersRes.members) {
            return { success: false, linkedCount: 0, results: [], error: membersRes.error };
        }

        let linkedCount = 0;
        const results: Array<{ username: string; discordUsername: string; confidence: number }> = [];

        for (const m of membersRes.members) {
            if (!m.linkedUserId && m.suggestedMatch && m.suggestedMatch.confidence >= 90) {
                const linkRes = await linkUserToDiscord({
                    userId: m.suggestedMatch.userId,
                    discordId: m.id,
                    discordUsername: m.username,
                    discordDiscriminator: m.discriminator,
                    discordAvatar: m.avatarUrl,
                    syncRolesImmediately: true
                });

                if (linkRes.success) {
                    linkedCount++;
                    results.push({
                        username: m.suggestedMatch.username,
                        discordUsername: m.username,
                        confidence: m.suggestedMatch.confidence
                    });
                }
            }
        }

        return { success: true, linkedCount, results };
    } catch (e: any) {
        return { success: false, linkedCount: 0, results: [], error: e.message };
    }
}
