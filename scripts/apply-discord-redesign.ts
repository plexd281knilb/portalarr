/**
 * Apply Discord Redesign Migration Script
 * Executes the approved 8-category architecture migration non-destructively.
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
    console.log("   EXECUTING DISCORD SERVER LAYOUT REDESIGN MIGRATION           ");
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

    // 1. Fetch roles
    const rolesRes = await discordFetch<DiscordRole[]>(`/guilds/${guildId}/roles`, { method: "GET" }, botToken);
    if (!rolesRes.ok || !Array.isArray(rolesRes.data)) {
        console.error("❌ Failed to fetch roles:", rolesRes.error);
        process.exit(1);
    }

    const roles = rolesRes.data;
    const roleByName = (name: string) => roles.find(r => r.name.toLowerCase().includes(name.toLowerCase()))?.id;

    const everyoneRoleId = guildId;
    const tier2RoleId = roleByName("Tier 2") || "1558228645393342586";
    const tier1RoleId = roleByName("Tier 1") || "1558228646525665412";
    const trialRoleId = roleByName("Trial Pass") || "1558228646911672363";
    const kidsRoleId = roleByName("Kids") || "1558228647976898733";
    const adminRoleId = roleByName("Admin") || "1377295566781943960";

    console.log("🛡️ Resolved Roles:");
    console.log(`   @everyone: ${everyoneRoleId}`);
    console.log(`   Tier 2:    ${tier2RoleId}`);
    console.log(`   Tier 1:    ${tier1RoleId}`);
    console.log(`   Trial:     ${trialRoleId}`);
    console.log(`   Kids:      ${kidsRoleId}`);
    console.log(`   Admin:     ${adminRoleId}\n`);

    // Standard Bitwise Permissions
    const VIEW_READ = (DISCORD_PERMISSIONS.VIEW_CHANNEL | DISCORD_PERMISSIONS.READ_MESSAGE_HISTORY).toString();
    const VIEW_READ_SEND = (DISCORD_PERMISSIONS.VIEW_CHANNEL | DISCORD_PERMISSIONS.READ_MESSAGE_HISTORY | DISCORD_PERMISSIONS.SEND_MESSAGES | DISCORD_PERMISSIONS.ADD_REACTIONS).toString();
    const SEND_REACT = (DISCORD_PERMISSIONS.SEND_MESSAGES | DISCORD_PERMISSIONS.ADD_REACTIONS).toString();
    const VIEW_ONLY = (DISCORD_PERMISSIONS.VIEW_CHANNEL).toString();

    // 2. Fetch existing channels
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

    // Define target 8 categories with mapped existing IDs or fallback to creation
    const categoryConfigs = [
        {
            key: "welcome_info",
            targetName: "📌 1. WELCOME & INFO",
            existingId: "1343807831614160926", // old Information
            position: 0,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT }
            ]
        },
        {
            key: "guides",
            targetName: "📖 2. GUIDES & SELF-SERVICE",
            existingId: "1343807480479617046", // old Kid Server Notifications
            position: 1,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: tier1RoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: tier2RoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: trialRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: kidsRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT }
            ]
        },
        {
            key: "community",
            targetName: "💬 3. COMMUNITY LOUNGE",
            existingId: "1343806593786970124", // old Discussion
            position: 2,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: tier1RoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" },
                { id: tier2RoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" },
                { id: trialRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" },
                { id: kidsRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" }
            ]
        },
        {
            key: "requests",
            targetName: "🎬 4. REQUESTS & MEDIA",
            existingId: "1343807419523792926", // old Main Server Notifications
            position: 3,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: tier1RoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: tier2RoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: trialRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT },
                { id: kidsRoleId, type: 0, allow: VIEW_READ, deny: SEND_REACT }
            ]
        },
        {
            key: "support",
            targetName: "🆘 5. SUPPORT & HELP DESK",
            existingId: "1343806730957754381", // old Issues
            position: 4,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" }
            ]
        },
        {
            key: "vip",
            targetName: "👑 6. VIP TIER 2 LOUNGE",
            existingId: "553667067996405770", // old Text Channels
            position: 5,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY },
                { id: tier2RoleId, type: 0, allow: VIEW_READ_SEND, deny: "0" }
            ]
        },
        {
            key: "admin_bot",
            targetName: "🤖 7. BOT & AUTOMATION",
            existingId: "1343807553758560336", // old Admin Notifications
            position: 6,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY }
            ]
        },
        {
            key: "staff_archive",
            targetName: "🔒 8. STAFF & ARCHIVE",
            existingId: "1353570261063962635", // old old/archived
            position: 7,
            overwrites: [
                { id: everyoneRoleId, type: 0, allow: "0", deny: VIEW_ONLY }
            ]
        }
    ];

    console.log("📁 Upgrading & Syncing Categories...");
    const resolvedCatIds: Record<string, string> = {};

    for (const cConf of categoryConfigs) {
        let catId = cConf.existingId;
        const existingCat = catMap.get(catId);

        if (existingCat) {
            console.log(`   🔄 Renaming Category "${existingCat.name}" -> "${cConf.targetName}"...`);
            const updateRes = await discordFetch(`/channels/${catId}`, {
                method: "PATCH",
                body: JSON.stringify({
                    name: cConf.targetName,
                    position: cConf.position,
                    permission_overwrites: cConf.overwrites
                })
            }, botToken);
            if (!updateRes.ok) {
                console.warn(`   ⚠️ Warning updating category ${cConf.targetName}: ${updateRes.error}`);
            }
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
            } else {
                console.error(`   ❌ Failed to create category ${cConf.targetName}: ${createRes.error}`);
            }
        }
    }

    console.log("\n💬 Upgrading & Re-parenting Channels...");

    // Helper to move / rename existing channel
    async function moveChannel(channelId: string, newName: string, parentCatKey: string, topic?: string) {
        const catId = resolvedCatIds[parentCatKey];
        if (!catId) return;
        const current = chanMap.get(channelId);
        if (!current) return;

        const payload: any = {
            name: newName,
            parent_id: catId
        };
        if (topic) payload.topic = topic;

        console.log(`   🔄 Moving #${current.name} -> #${newName} in ${categoryConfigs.find(c => c.key === parentCatKey)?.targetName}...`);
        const res = await discordFetch(`/channels/${channelId}`, {
            method: "PATCH",
            body: JSON.stringify(payload)
        }, botToken);
        if (!res.ok) {
            console.warn(`   ⚠️ Failed moving channel #${newName}: ${res.error}`);
        }
        return res.ok ? channelId : undefined;
    }

    // Helper to create channel if not exists
    async function getOrCreateChannel(
        name: string,
        parentCatKey: string,
        topic: string,
        type: number = DISCORD_CHANNEL_TYPES.GUILD_TEXT
    ): Promise<string | undefined> {
        const catId = resolvedCatIds[parentCatKey];
        if (!catId) return undefined;

        // Check if channel already exists with this name
        const norm = name.toLowerCase().trim();
        for (const [id, c] of chanMap.entries()) {
            if (c.name.toLowerCase().trim() === norm) {
                // Already exists, just ensure parent
                if (c.parent_id !== catId) {
                    await discordFetch(`/channels/${id}`, {
                        method: "PATCH",
                        body: JSON.stringify({ parent_id: catId, topic })
                    }, botToken);
                }
                return id;
            }
        }

        console.log(`   ➕ Creating Channel #${name}...`);
        const res = await discordFetch<DiscordChannel>(`/guilds/${guildId}/channels`, {
            method: "POST",
            body: JSON.stringify({
                name,
                type,
                parent_id: catId,
                topic
            })
        }, botToken);

        if (res.ok && res.data) {
            chanMap.set(res.data.id, res.data);
            return res.data.id;
        } else {
            console.error(`   ❌ Failed creating #${name}: ${res.error}`);
            return undefined;
        }
    }

    // Category 1: Welcome & Info
    await moveChannel("1336766499200958525", "welcome-and-rules", "welcome_info", "Server rules, guidelines, community etiquette, and mission control overview.");
    await moveChannel("1343809337985863710", "announcements", "welcome_info", "Official platform updates, maintenance notices, outages, and changelogs.");
    const subTierId = await getOrCreateChannel("subscription-tiers", "welcome_info", "Membership tiers (Regular vs VIP), trial passes, renewal cadences, and payment methods.");
    await moveChannel("1343814266263830618", "links-and-webhooks", "welcome_info", "Portalarr Web Portal, Seerr requests, Tautulli stats, and external guides.");
    await moveChannel("1353117750758998016", "roadmap-and-updates", "welcome_info", "Future features, planned expansions, and hardware roadmap.");
    await moveChannel("1369683308631560202", "plex-invites", "welcome_info", "Plex server invitation instructions and onboarding.");
    await moveChannel("1363921408215875604", "maintenance", "welcome_info", "Scheduled maintenance and container reboot windows.");

    // Category 2: Guides & Self-Service
    const plexGuidesId = await getOrCreateChannel("plex-setup-guides", "guides", "Direct Play optimization for Apple TV, Roku, Fire TV, Samsung/LG, Android TV, iOS, and Web.");
    const transcodeDocId = await getOrCreateChannel("transcode-doctor", "guides", "Playback issue troubleshooting, buffer diagnosis, and client device fixes.");
    const kindleReadingId = await getOrCreateChannel("kindle-and-reading", "guides", "Send-to-Kindle configuration, approved senders setup, ebook & comic reading.");
    const audiobooksGuideId = await getOrCreateChannel("audiobooks-guide", "guides", "Audiobook chapter management, streaming, mobile apps, and playback.");

    // Category 3: Community Lounge
    await moveChannel("1343808192102269000", "general-chat", "community", "General community discussions, homelab banter, and casual talk.");
    await getOrCreateChannel("movies-and-tv", "community", "Spoiler-free film & television chats, watch parties, and reviews.");
    await getOrCreateChannel("book-nook", "community", "Book discussions, series chat, kindle recommendations, and author discovery.");
    await moveChannel("1440019243771887707", "polls-and-feedback", "community", "Community polls for upcoming library additions, feature votes, and interface feedback.");

    // Category 4: Requests & Media
    const mediaReqId = await moveChannel("1343809489375330314", "media-requests", "requests", "Live request feed from Portalarr & Seerr. Automated approval & download telemetry.") || "1343809489375330314";
    await getOrCreateChannel("recently-added", "requests", "Newly ingested movies, television episodes, audiobooks, and books.");
    const leavingSoonId = await getOrCreateChannel("leaving-soon", "requests", "Maintainerr pruning radar: Staged media items leaving soon to preserve storage headroom.");

    // Category 5: Support & Help Desk
    const serverUptimeId = await moveChannel("812445481548513332", "server-uptime", "support", "Real-time infrastructure health, Plex reachability, host telemetry, and service links.") || "812445481548513332";
    await getOrCreateChannel("support-tickets", "support", "Open a support request or report playback issues with the server administrator.");
    await moveChannel("1343805546750283840", "main-server-request-issues", "support");
    await moveChannel("1343808506502975541", "kid-server-request-issues", "support");

    // Category 6: VIP Tier 2 Lounge
    await getOrCreateChannel("vip-chat", "vip", "Exclusive conversational channel for Tier 2 VIP supporters.");
    await getOrCreateChannel("vip-priority-support", "vip", "Direct 1-on-1 concierge assistance for device configuration and expedited requests.");

    // Category 7: Bot & Automation
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

    // Category 8: Staff & Archive
    await moveChannel("1336766499200958528", "staff-lounge", "staff_archive", "Private admin notes, billing ledger audits, user management discussion.");
    await moveChannel("553667067996405772", "legacy-general", "staff_archive");
    await moveChannel("1343807663196340234", "legacy-up-down-trackers", "staff_archive");
    await moveChannel("1343815962956398662", "legacy-issues", "staff_archive");

    console.log("\n📌 Posting & Pinning Rich Guide Embeds...");

    async function postAndPin(channelId: string | undefined, embedKey: any) {
        if (!channelId) return;
        try {
            const pinsRes = await discordFetch<any[]>(`/channels/${channelId}/pins`, { method: "GET" }, botToken);
            if (pinsRes.ok && Array.isArray(pinsRes.data) && pinsRes.data.length > 0) {
                console.log(`   ℹ️ Channel ${channelId} already has pinned messages, skipping.`);
                return;
            }

            const embed = generateDiscordEmbed(embedKey);
            const msgRes = await discordFetch<any>(`/channels/${channelId}/messages`, {
                method: "POST",
                body: JSON.stringify({ embeds: [embed] })
            }, botToken);

            if (msgRes.ok && msgRes.data?.id) {
                await discordFetch(`/channels/${channelId}/pins/${msgRes.data.id}`, { method: "PUT" }, botToken);
                console.log(`   ✅ Posted and pinned embed in channel ${channelId} (${embedKey})`);
            }
        } catch (e: any) {
            console.warn(`   ⚠️ Warning posting embed to ${channelId}:`, e.message);
        }
    }

    await postAndPin("1336766499200958525", "welcome_rules"); // #welcome-and-rules
    await postAndPin(subTierId, "subscription_tiers");
    await postAndPin(plexGuidesId, "plex_guides");
    await postAndPin(transcodeDocId, "transcode_doctor");
    await postAndPin(kindleReadingId, "kindle_reading");
    await postAndPin(audiobooksGuideId, "audiobooks_guide");
    await postAndPin(leavingSoonId, "leaving_soon");
    await postAndPin(serverUptimeId, "system_status");

    // 7. Update database settings
    console.log("\n💾 Updating Portalarr SQLite Settings...");
    await prisma.settings.updateMany({
        data: {
            discordStatusChannelId: serverUptimeId,
            discordRequestsChannelId: mediaReqId,
            discordAnnouncementsChannelId: "1343809337985863710",
            discordLastSyncAt: new Date()
        }
    });

    console.log("=================================================================");
    console.log("   🎉 DISCORD SERVER REDESIGN APPLIED SUCCESSFULLY!              ");
    console.log("=================================================================\n");
}

run().catch(err => {
    console.error("FATAL ERROR during Discord migration:", err);
    process.exit(1);
});
