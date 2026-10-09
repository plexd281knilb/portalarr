/**
 * Portalarr Discord Server Provisioning & Channel Sync CLI Script
 * 
 * Usage:
 *   npx tsx scripts/sync-discord-server.ts
 *   npx tsx scripts/sync-discord-server.ts --token="YOUR_BOT_TOKEN" --guild="YOUR_GUILD_ID"
 *   npx tsx scripts/sync-discord-server.ts --status-only
 */

import { prisma, ensureSchemaColumns } from "../src/lib/prisma";
import { encryptData, decryptData } from "../src/lib/encryption";
import {
    verifyDiscordBotCredentials,
    syncDiscordServerStructure,
    updateDiscordLiveStatus,
    DISCORD_SERVER_BLUEPRINT,
    DISCORD_ROLES_BLUEPRINT
} from "../src/lib/discord/discord-bot";
import { getAdminInfrastructureStatusAction } from "../src/app/actions";

async function main() {
    console.log("=================================================================");
    console.log("   PORTALARR DISCORD SERVER & BOT PROVISIONING UTILITY           ");
    console.log("=================================================================\n");

    await ensureSchemaColumns();

    // Parse CLI arguments
    const args = process.argv.slice(2);
    let cliToken = "";
    let cliGuild = "";
    let cliClient = "";
    let statusOnly = false;
    let skipEmbeds = false;

    for (const arg of args) {
        if (arg.startsWith("--token=")) cliToken = arg.split("=")[1].trim();
        if (arg.startsWith("--guild=")) cliGuild = arg.split("=")[1].trim();
        if (arg.startsWith("--client=")) cliClient = arg.split("=")[1].trim();
        if (arg === "--status-only") statusOnly = true;
        if (arg === "--skip-embeds") skipEmbeds = true;
    }

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();

    const botToken = cliToken || (settings?.discordBotToken ? decryptData(settings.discordBotToken) : "");
    const guildId = cliGuild || (settings?.discordGuildId || "");

    if (!botToken) {
        console.error("❌ ERROR: Discord Bot Token not found!");
        console.error("Provide --token=\"...\" or configure it in Portalarr Settings -> Discord Bot.\n");
        process.exit(1);
    }

    if (!guildId) {
        console.error("❌ ERROR: Discord Server (Guild) ID not found!");
        console.error("Provide --guild=\"...\" or configure it in Portalarr Settings -> Discord Bot.\n");
        process.exit(1);
    }

    console.log(`🔍 Verifying bot credentials for Guild ID: ${guildId}...`);
    const verifyRes = await verifyDiscordBotCredentials({ botToken, guildId });

    if (!verifyRes.success) {
        console.error(`❌ Verification Failed: ${verifyRes.error}\n`);
        process.exit(1);
    }

    console.log(`🤖 Connected as Bot: ${verifyRes.bot?.username}#${verifyRes.bot?.discriminator} (ID: ${verifyRes.bot?.id})`);
    console.log(`🏰 Connected to Server: "${verifyRes.guild?.name}" (${verifyRes.guild?.memberCount || 0} members)`);
    console.log(`🛡️ Administrator Permissions: ${verifyRes.guild?.hasAdminPermission ? "✅ YES (Full Access)" : "⚠️ Limited (Check Manage Channels / Roles)"}\n`);

    if (statusOnly) {
        console.log("📡 Refreshing live #system-status embed...");
        const healthRes = await getAdminInfrastructureStatusAction().catch(() => null);
        const statusRes = await updateDiscordLiveStatus({
            botToken,
            guildId,
            channelId: settings?.discordStatusChannelId || undefined,
            systemData: healthRes?.success ? healthRes : undefined
        });

        if (statusRes.success) {
            console.log(`✅ System Status Embed updated successfully! (Message ID: ${statusRes.messageId})`);
        } else {
            console.error(`❌ Failed updating status embed: ${statusRes.error}`);
        }
        return;
    }

    console.log("🚀 Starting Full Server Architecture Synchronization...");
    console.log(`📋 Blueprint includes ${DISCORD_SERVER_BLUEPRINT.length} categories, ${DISCORD_SERVER_BLUEPRINT.reduce((acc, c) => acc + c.channels.length, 0)} channels, and ${DISCORD_ROLES_BLUEPRINT.length} roles.\n`);

    const syncRes = await syncDiscordServerStructure({
        botToken,
        guildId,
        options: {
            updateTopics: true,
            createRoles: true,
            postPinnedEmbeds: !skipEmbeds
        }
    });

    if (!syncRes.success) {
        console.error(`❌ Sync Failed: ${syncRes.error}`);
        process.exit(1);
    }

    console.log("\n=================================================================");
    console.log("   🎉 DISCORD SERVER SYNCHRONIZATION SUMMARY                     ");
    console.log("=================================================================");
    console.log(`📁 Categories:     ${syncRes.categoriesCreated} created, ${syncRes.categoriesExisting} existing`);
    console.log(`💬 Channels:       ${syncRes.channelsCreated} created, ${syncRes.channelsExisting} existing`);
    console.log(`🛡️ Roles:          ${syncRes.rolesCreated} provisioned`);
    console.log(`📌 Pinned Embeds:  ${syncRes.embedsPosted} posted & pinned`);
    console.log("=================================================================\n");

    // Save channel mapping to database
    if (settings && syncRes.channelMap) {
        const updateData: any = {
            discordLastSyncAt: new Date(),
            discordLastSyncStatus: JSON.stringify({
                summaryText: syncRes.summaryText,
                categoriesCreated: syncRes.categoriesCreated,
                channelsCreated: syncRes.channelsCreated,
                rolesCreated: syncRes.rolesCreated,
                embedsPosted: syncRes.embedsPosted,
                timestamp: new Date().toISOString()
            })
        };

        if (syncRes.channelMap["system-status"]) updateData.discordStatusChannelId = syncRes.channelMap["system-status"];
        if (syncRes.channelMap["media-requests"]) updateData.discordRequestsChannelId = syncRes.channelMap["media-requests"];
        if (syncRes.channelMap["announcements"]) updateData.discordAnnouncementsChannelId = syncRes.channelMap["announcements"];
        if (cliToken) updateData.discordBotToken = encryptData(cliToken);
        if (cliGuild) updateData.discordGuildId = cliGuild;
        if (cliClient) updateData.discordClientId = cliClient;

        await prisma.settings.update({
            where: { id: settings.id },
            data: updateData
        });
        console.log("💾 Saved channel mappings and sync telemetry to SQLite database.");

        // Update live status embed in #system-status
        if (updateData.discordStatusChannelId) {
            console.log("📡 Posting initial real-time platform telemetry to #system-status...");
            const healthRes = await getAdminInfrastructureStatusAction().catch(() => null);
            await updateDiscordLiveStatus({
                botToken,
                guildId,
                channelId: updateData.discordStatusChannelId,
                systemData: healthRes?.success ? healthRes : undefined
            });
            console.log("✅ #system-status live dashboard is active!");
        }
    }

    console.log("\n✨ Done! Discord Server is now 100% matched with Portalarr Mission Control.\n");
}

main().catch((err) => {
    console.error("FATAL ERROR:", err);
    process.exit(1);
});
