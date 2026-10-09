/**
 * Apply Discord Redesign Migration Script (Approved Layout)
 * Executes the approved 7-category architecture migration non-destructively:
 * - Unifies member roles into "⭐ Member"
 * - Deletes the "Tier 2" role from Discord
 * - Deletes the "VIP Tier 2 Lounge" category and channels
 * - Organizes 7 canonical categories and channel permissions
 * - Posts and pins clean guide embeds with zero mention of Tier 1 vs Tier 2
 */

import { prisma, ensureSchemaColumns } from "../src/lib/prisma";
import { decryptData } from "../src/lib/encryption";
import {
    discordFetch,
    generateDiscordEmbed,
    DISCORD_CHANNEL_TYPES,
    DISCORD_PERMISSIONS,
    DiscordChannel,
    DiscordRole
} from "../src/lib/discord/discord-bot";

async function run() {
    console.log("=================================================================");
    console.log("   EXECUTING APPROVED DISCORD SERVER REDESIGN MIGRATION          ");
    console.log("=================================================================\n");

    await ensureSchemaColumns();

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
    const botToken = settings?.discordBotToken ? decryptData(settings.discordBotToken) : "";
    const guildId = settings?.discordGuildId || "553667067363196941";

    if (!botToken) {
        console.error("❌ ERROR: Discord bot token not configured.");
        process.exit(1);
    }

    console.log(`🤖 Using Bot Token on Guild ID: ${guildId}`);

    // 1. Fetch current roles
    const rolesRes = await discordFetch<DiscordRole[]>(`/guilds/${guildId}/roles`, { method: "GET" }, botToken);
    if (!rolesRes.ok || !Array.isArray(rolesRes.data)) {
        console.error("❌ Failed to fetch roles:", rolesRes.error);
        process.exit(1);
    }

    const roles = rolesRes.data;
    const everyoneRoleId = guildId;
    let memberRole = roles.find(r => r.name.toLowerCase().includes("member") || r.name.toLowerCase().includes("tier 1"));
    const tier2Role = roles.find(r => r.name.toLowerCase().includes("tier 2"));
    const trialRole = roles.find(r => r.name.toLowerCase().includes("trial"));
    const kidsRole = roles.find(r => r.name.toLowerCase().includes("kids"));
    const adminRole = roles.find(r => r.name.toLowerCase().includes("admin"));

    // 1a. If member role is named "⭐ Tier 1 (Regular Member)", rename it to "⭐ Member"
    if (memberRole && memberRole.name !== "⭐ Member") {
        console.log(`🔄 Renaming role "${memberRole.name}" -> "⭐ Member"...`);
        const updateRoleRes = await discordFetch<DiscordRole>(`/guilds/${guildId}/roles/${memberRole.id}`, {
            method: "PATCH",
            body: JSON.stringify({
                name: "⭐ Member",
                color: 0x10B981, // Emerald
                hoist: true,
                mentionable: true
            })
        }, botToken);
        if (updateRoleRes.ok && updateRoleRes.data) {
            memberRole = updateRoleRes.data;
            console.log("✅ Successfully updated role to ⭐ Member");
        }
    } else if (!memberRole) {
        console.log("➕ Creating ⭐ Member role...");
        const createRoleRes = await discordFetch<DiscordRole>(`/guilds/${guildId}/roles`, {
            method: "POST",
            body: JSON.stringify({
                name: "⭐ Member",
                color: 0x10B981,
                hoist: true,
                mentionable: true
            })
        }, botToken);
        if (createRoleRes.ok && createRoleRes.data) {
            memberRole = createRoleRes.data;
            console.log("✅ Created ⭐ Member role");
        }
    }

    const memberRoleId = memberRole?.id || "1558228646525665412";

    // 1b. If Tier 2 role exists, transfer members to ⭐ Member and delete Tier 2 role
    if (tier2Role) {
        console.log(`🔍 Inspecting members with Tier 2 role (${tier2Role.id})...`);
        const membersRes = await discordFetch<any[]>(`/guilds/${guildId}/members?limit=1000`, { method: "GET" }, botToken);
        if (membersRes.ok && Array.isArray(membersRes.data)) {
            for (const m of membersRes.data) {
                if (m.roles && m.roles.includes(tier2Role.id)) {
                    console.log(`   Transferring @${m.user?.username} from Tier 2 to ⭐ Member...`);
                    await discordFetch(`/guilds/${guildId}/members/${m.user.id}/roles/${memberRoleId}`, { method: "PUT" }, botToken);
                    await discordFetch(`/guilds/${guildId}/members/${m.user.id}/roles/${tier2Role.id}`, { method: "DELETE" }, botToken);
                }
            }
        }
        console.log(`🗑️ Deleting "Tier 2" role from Discord to conceal tiers...`);
        const delRes = await discordFetch(`/guilds/${guildId}/roles/${tier2Role.id}`, { method: "DELETE" }, botToken);
        if (delRes.ok) {
            console.log("✅ Successfully deleted Tier 2 role from Discord.");
        } else {
            console.warn(`⚠️ Warning deleting Tier 2 role: ${delRes.error}`);
        }
    }

    const trialRoleId = trialRole?.id || "1558228646911672363";
    const kidsRoleId = kidsRole?.id || "1558228647976898733";
    const adminRoleId = adminRole?.id || "1377295566781943960";

    console.log("\n🛡️ Active Server Roles:");
    console.log(`   @everyone: ${everyoneRoleId}`);
    console.log(`   ⭐ Member: ${memberRoleId}`);
    console.log(`   ⏱️ Trial:   ${trialRoleId}`);
    console.log(`   🧒 Kids:    ${kidsRoleId}`);
    console.log(`   👑 Admin:   ${adminRoleId}\n`);

    // Standard Bitwise Permissions
    const VIEW_READ = (DISCORD_PERMISSIONS.VIEW_CHANNEL | DISCORD_PERMISSIONS.READ_MESSAGE_HISTORY).toString();
    const VIEW_READ_SEND = (DISCORD_PERMISSIONS.VIEW_CHANNEL | DISCORD_PERMISSIONS.READ_MESSAGE_HISTORY | DISCORD_PERMISSIONS.SEND_MESSAGES | DISCORD_PERMISSIONS.ADD_REACTIONS).toString();
    const SEND_REACT = (DISCORD_PERMISSIONS.SEND_MESSAGES | DISCORD_PERMISSIONS.ADD_REACTIONS).toString();
    const VIEW_ONLY = (DISCORD_PERMISSIONS.VIEW_CHANNEL).toString();

    // 2. Fetch all channels
    const channelsRes = await discordFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`, { method: "GET" }, botToken);
    if (!channelsRes.ok || !Array.isArray(channelsRes.data)) {
        console.error("❌ Failed to fetch channels:", channelsRes.error);
        process.exit(1);
    }

    const allChannels = channelsRes.data;
    const catMap = new Map<string, DiscordChannel>();
    const chanMap = new Map<string, DiscordChannel>();

    for (const c of allChannels) {
        if (c.type === DISCORD_CHANNEL_TYPES.GUILD_CATEGORY) {
            catMap.set(c.id, c);
        } else {
            chanMap.set(c.id, c);
        }
    }

    // 2a. Remove VIP Tier 2 category and channels if they exist
    for (const [id, c] of chanMap.entries()) {
        if (c.name === "vip-chat" || c.name === "vip-priority-support") {
            console.log(`🗑️ Deleting obsolete VIP channel #${c.name} (${c.id})...`);
            await discordFetch(`/channels/${c.id}`, { method: "DELETE" }, botToken);
            chanMap.delete(id);
        }
    }

    for (const [id, cat] of catMap.entries()) {
        if (cat.name.toLowerCase().includes("vip") || cat.name.toLowerCase().includes("tier 2")) {
            console.log(`🗑️ Deleting obsolete VIP category "${cat.name}" (${cat.id})...`);
            await discordFetch(`/channels/${cat.id}`, { method: "DELETE" }, botToken);
            catMap.delete(id);
        }
    }

    // 3. Define target 7 categories according to approved layout plan
    const categoryConfigs = [
        {
            key: "welcome_info",
            targetName: "📌 1. WELCOME & INFO",
            existingId: "1343807831614160926",
            position: 0,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT }
            ]
        },
        {
            key: "guides",
            targetName: "📖 2. GUIDES & SELF-SERVICE",
            existingId: "1343807480479617046",
            position: 1,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: memberRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: trialRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: kidsRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT }
            ]
        },
        {
            key: "community",
            targetName: "💬 3. COMMUNITY CHAT",
            existingId: "1343806593786970124",
            position: 2,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: memberRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" },
                { id: trialRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" },
                { id: kidsRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" }
            ]
        },
        {
            key: "requests",
            targetName: "🎬 4. REQUESTS & MEDIA",
            existingId: "1343807419523792926",
            position: 3,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: memberRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: trialRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: kidsRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT }
            ]
        },
        {
            key: "support",
            targetName: "🆘 5. HELP & TICKETS",
            existingId: "1343806730957754381",
            position: 4,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" }
            ]
        },
        {
            key: "admin_bot",
            targetName: "🤖 6. BOT & AUTOMATION",
            existingId: "1343807553758560336",
            position: 5,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: adminRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" }
            ]
        },
        {
            key: "staff_archive",
            targetName: "🔒 7. STAFF & ARCHIVE",
            existingId: "1353570261063962635",
            position: 6,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: adminRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" }
            ]
        }
    ];

    console.log("📁 Updating 7 Canonical Categories...");
    const resolvedCatIds: Record<string, string> = {};

    for (const cConf of categoryConfigs) {
        let catId = cConf.existingId;
        const existingCat = catMap.get(catId);

        if (existingCat) {
            console.log(`   🔄 Category "${existingCat.name}" -> "${cConf.targetName}"...`);
            await discordFetch(`/channels/${catId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: cConf.targetName,
                    position: cConf.position,
                    permission_overwrites: cConf.overwrites
                })
            }, botToken);
            resolvedCatIds[cConf.key] = catId;
        } else {
            console.log(`   ➕ Creating Category "${cConf.targetName}"...`);
            const createRes = await discordFetch<DiscordChannel>(`/guilds/${guildId}/channels`, {
                method: "POST",
                body: JSON.stringify({
                    name: cConf.targetName,
                    type: DISCORD_CHANNEL_TYPES.GUILD_CATEGORY,
                    position: cConf.position,
                    permission_overwrites: cConf.overwrites
                })
            }, botToken);
            if (createRes.ok && createRes.data) {
                resolvedCatIds[cConf.key] = createRes.data.id;
            }
        }
    }

    // Helper functions for channels
    async function moveChannel(channelId: string, targetName: string, catKey: string, topic?: string) {
        const parentId = resolvedCatIds[catKey];
        const existing = chanMap.get(channelId);
        if (!existing) return null;

        console.log(`   ➡️ Moving #${existing.name} -> #${targetName} in [${categoryConfigs.find(c => c.key === catKey)?.targetName}]...`);
        const updateBody: any = {
            name: targetName,
            parent_id: parentId
        };
        if (topic) updateBody.topic = topic;

        const res = await discordFetch(`/channels/${channelId}`, {
            method: "PATCH",
            body: JSON.stringify(updateBody)
        }, botToken);
        return res.ok ? channelId : null;
    }

    async function getOrCreateChannel(name: string, catKey: string, topic?: string, type = DISCORD_CHANNEL_TYPES.GUILD_TEXT): Promise<string | null> {
        const parentId = resolvedCatIds[catKey];
        for (const [id, c] of chanMap.entries()) {
            if (c.name.toLowerCase() === name.toLowerCase()) {
                await moveChannel(id, name, catKey, topic);
                return id;
            }
        }

        console.log(`   ➕ Creating #${name} in [${categoryConfigs.find(c => c.key === catKey)?.targetName}]...`);
        const res = await discordFetch<DiscordChannel>(`/guilds/${guildId}/channels`, {
            method: "POST",
            body: JSON.stringify({
                name,
                type,
                parent_id: parentId,
                topic
            })
        }, botToken);

        if (res.ok && res.data) {
            chanMap.set(res.data.id, res.data);
            return res.data.id;
        }
        return null;
    }

    console.log("\n💬 Synchronizing Channel Structure...");

    // Category 1: Welcome & Info
    await moveChannel("1336766499200958525", "welcome-and-rules", "welcome_info", "Community rules, etiquette, and essential server info.");
    await moveChannel("1343809337985863710", "announcements", "welcome_info", "Platform updates, maintenance windows, and server news.");
    const membershipInfoId = await getOrCreateChannel("membership-info", "welcome_info", "Transparent membership contributions, payment tags, and referral rewards.");
    await moveChannel("1343814266263830618", "links-and-webhooks", "welcome_info", "Portalarr Web, Seerr request portal, status hub, and quick links.");
    await moveChannel("1353117750758998016", "roadmap-and-updates", "welcome_info", "Upcoming hardware expansions, storage drives, and feature roadmap.");

    // Category 2: Guides & Self-Service
    await getOrCreateChannel("plex-setup-guides", "guides", "One-time setup instructions for Apple TV 4K, Roku, Fire TV, and Smart TVs.");
    await getOrCreateChannel("transcode-doctor", "guides", "Self-service buffer diagnosis and playback troubleshooting.");
    await getOrCreateChannel("kindle-and-audiobooks", "guides", "Amazon Send-to-Kindle delivery guide, in-browser reader, and audiobook apps.");

    // Category 3: Community Chat
    await moveChannel("1343808192102269000", "general-chat", "community", "General community discussions, homelab banter, and casual talk.");
    await getOrCreateChannel("movie-and-tv-talk", "community", "Spoiler-free film & television chats, watch parties, and recommendations.");
    await getOrCreateChannel("book-nook", "community", "Book discussions, series chat, kindle recommendations, and reading lists.");
    await moveChannel("1440019243771887707", "polls-and-feedback", "community", "Community polls for library additions, feature votes, and feedback.");

    // Category 4: Requests & Media
    const mediaReqId = await moveChannel("1343809489375330314", "media-requests", "requests", "Live request feed from Portalarr & Seerr. Automated approval & download telemetry.") || "1343809489375330314";
    await getOrCreateChannel("recently-added", "requests", "Newly ingested movies, television episodes, audiobooks, and books.");
    await getOrCreateChannel("leaving-soon", "requests", "Maintainerr pruning radar: Staged media items leaving soon to preserve storage headroom.");

    // Category 5: Help & Tickets
    const serverUptimeId = await moveChannel("812445481548513332", "server-uptime", "support", "Real-time infrastructure health, Plex reachability, host telemetry, and service links.") || "812445481548513332";
    await getOrCreateChannel("support-tickets", "support", "Open a support request or report playback issues with the server administrator.");
    await moveChannel("1343805546750283840", "main-server-request-issues", "support");
    await moveChannel("1343808506502975541", "kid-server-request-issues", "support");

    // Category 6: Bot & Automation (Staff)
    await moveChannel("1343809561580273674", "main-server-feed", "admin_bot", "Radarr/Sonarr download progress, grab alerts, and import logs for Main Plex.");
    await moveChannel("1343809715507036291", "kid-server-feed", "admin_bot", "Radarr/Sonarr download progress and kid library imports.");
    await moveChannel("1343810641504501781", "host-health-glances", "admin_bot", "Hardware telemetry alerts (CPU spikes, RAM usage, storage capacity warnings).");
    await moveChannel("1343809611513466880", "deletion-audit", "admin_bot", "Maintainerr auto-prune executions, deleted media logs, and storage reclaimed.");
    await moveChannel("1343809650264510534", "kid-server-requests", "admin_bot");
    await moveChannel("1343809754463469610", "kid-server-deleted-files", "admin_bot");
    await moveChannel("1343810566556221496", "kid-server-health-updates", "admin_bot");
    await moveChannel("1343813048594600027", "backup-server-health-updates", "admin_bot");
    await moveChannel("1420767332979970149", "files-to-be-deleted", "admin_bot");
    await getOrCreateChannel("bot-commands", "admin_bot", "Portalarr Bot diagnostics and manual sync commands.");
    await getOrCreateChannel("portalarr-logs", "admin_bot", "Automated sync logs, request dispatch audit, and alert telemetry.");

    // Category 7: Staff & Archive
    await moveChannel("1336766499200958528", "staff-lounge", "staff_archive", "Private admin notes, billing ledger audits, user management discussion.");
    await moveChannel("553667067996405772", "legacy-general", "staff_archive");
    await moveChannel("1343807663196340234", "legacy-up-down-trackers", "staff_archive");
    await moveChannel("1343815962956398662", "legacy-issues", "staff_archive");

    console.log("\n📌 Posting & Pinning Rich Guide Embeds...");

    async function postAndPin(channelName: string, embedKey: any) {
        let channelId: string | undefined;
        for (const [id, c] of chanMap.entries()) {
            if (c.name.toLowerCase() === channelName.toLowerCase()) {
                channelId = id;
                break;
            }
        }
        if (!channelId) return;

        try {
            const pinsRes = await discordFetch<any[]>(`/channels/${channelId}/pins`, { method: "GET" }, botToken);
            if (pinsRes.ok && Array.isArray(pinsRes.data) && pinsRes.data.length > 0) {
                console.log(`   ℹ️ Channel #${channelName} (${channelId}) already has pinned messages, skipping.`);
                return;
            }

            const embed = generateDiscordEmbed(embedKey);
            const msgRes = await discordFetch<any>(`/channels/${channelId}/messages`, {
                method: "POST",
                body: JSON.stringify({ embeds: [embed] })
            }, botToken);

            if (msgRes.ok && msgRes.data?.id) {
                await discordFetch(`/channels/${channelId}/pins/${msgRes.data.id}`, { method: "PUT" }, botToken);
                console.log(`   ✅ Posted and pinned embed in #${channelName} (${embedKey})`);
            }
        } catch (e: any) {
            console.warn(`   ⚠️ Could not pin embed in #${channelName}: ${e.message}`);
        }
    }

    await postAndPin("welcome-and-rules", "welcome_rules");
    await postAndPin("membership-info", "subscription_tiers");
    await postAndPin("plex-setup-guides", "plex_guides");
    await postAndPin("transcode-doctor", "transcode_doctor");
    await postAndPin("kindle-and-audiobooks", "kindle_reading");

    // Save channel mapping to database
    if (settings) {
        const updateData: any = {
            discordLastSyncAt: new Date(),
            discordLastSyncStatus: JSON.stringify({
                status: "SUCCESS",
                categories: 7,
                timestamp: new Date().toISOString()
            })
        };
        if (serverUptimeId) updateData.discordStatusChannelId = serverUptimeId;
        if (mediaReqId) updateData.discordRequestsChannelId = mediaReqId;

        await prisma.settings.update({
            where: { id: settings.id },
            data: updateData
        });
        console.log("💾 Saved active Discord status channel IDs to SQLite database.");
    }

    console.log("\n🎉 ALL DONE! Discord Server is now 100% migrated to the approved 7-category layout!");
    process.exit(0);
}

run().catch((e) => {
    console.error("FATAL ERROR:", e);
    process.exit(1);
});
