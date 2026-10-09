/**
 * Discord Bot & Server Management Engine
 * Provides native Discord REST API v10 integration for server architecture provisioning,
 * category & channel lifecycle management, permission overwrites, roles setup,
 * rich guide embeds, and real-time infrastructure status telemetry.
 */

import { logger } from "@/lib/logger";

const DISCORD_API_BASE = "https://discord.com/api/v10";

// Discord Channel Types (v10)
export const DISCORD_CHANNEL_TYPES = {
    GUILD_TEXT: 0,
    DM: 1,
    GUILD_VOICE: 2,
    GROUP_DM: 3,
    GUILD_CATEGORY: 4,
    GUILD_ANNOUNCEMENT: 5,
    GUILD_FORUM: 15
} as const;

// Discord Permissions Bitwise Flags
export const DISCORD_PERMISSIONS = {
    CREATE_INSTANT_INVITE: 0x00000001,
    KICK_MEMBERS: 0x00000002,
    BAN_MEMBERS: 0x00000004,
    ADMINISTRATOR: 0x00000008,
    MANAGE_CHANNELS: 0x00000010,
    MANAGE_GUILD: 0x00000020,
    ADD_REACTIONS: 0x00000040,
    VIEW_AUDIT_LOG: 0x00000080,
    VIEW_CHANNEL: 0x00000400,
    SEND_MESSAGES: 0x00000800,
    SEND_TTS_MESSAGES: 0x00001000,
    MANAGE_MESSAGES: 0x00002000,
    EMBED_LINKS: 0x00004000,
    ATTACH_FILES: 0x00008000,
    READ_MESSAGE_HISTORY: 0x00010000,
    MENTION_EVERYONE: 0x00020000,
    MANAGE_ROLES: 0x10000000
} as const;

export interface DiscordEmbedField {
    name: string;
    value: string;
    inline?: boolean;
}

export interface DiscordEmbed {
    title?: string;
    description?: string;
    url?: string;
    color?: number;
    fields?: DiscordEmbedField[];
    footer?: { text: string; icon_url?: string };
    timestamp?: string;
    thumbnail?: { url: string };
    author?: { name: string; icon_url?: string; url?: string };
}

export interface DiscordUser {
    id: string;
    username: string;
    discriminator: string;
    avatar?: string | null;
    bot?: boolean;
}

export interface DiscordGuild {
    id: string;
    name: string;
    icon?: string | null;
    description?: string | null;
    member_count?: number;
    approximate_presence_count?: number;
    owner_id?: string;
    permissions?: string;
}

export interface DiscordChannel {
    id: string;
    name: string;
    type: number;
    parent_id?: string | null;
    topic?: string | null;
    position?: number;
    permission_overwrites?: any[];
}

export interface DiscordRole {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    position: number;
    permissions: string;
    mentionable: boolean;
}

export interface DiscordBlueprintChannel {
    name: string;
    topic: string;
    type?: number;
    readOnlyForEveryone?: boolean;
    adminOnly?: boolean;
    pinnedEmbedKey?: "welcome_rules" | "subscription_tiers" | "plex_guides" | "transcode_doctor" | "system_status" | "kindle_reading" | "audiobooks_guide" | "leaving_soon";
}

export interface DiscordBlueprintCategory {
    name: string;
    channels: DiscordBlueprintChannel[];
}

/**
 * Canonical Server Blueprint mirroring the Portalarr / DomsHomeLab Ecosystem
 */
export const DISCORD_SERVER_BLUEPRINT: DiscordBlueprintCategory[] = [
    {
        name: "📌 1. INFORMATION & RULES",
        channels: [
            {
                name: "welcome-and-rules",
                topic: "Server rules, guidelines, community etiquette, and mission control overview.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "welcome_rules"
            },
            {
                name: "announcements",
                topic: "Official platform updates, maintenance notices, outages, and changelogs.",
                type: DISCORD_CHANNEL_TYPES.GUILD_ANNOUNCEMENT,
                readOnlyForEveryone: true
            },
            {
                name: "system-status",
                topic: "Real-time infrastructure health, Plex reachability, host telemetry, and service links.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "system_status"
            },
            {
                name: "subscription-tiers",
                topic: "Membership tiers (Regular vs VIP), trial passes, renewal cadences, and payment methods.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "subscription_tiers"
            },
            {
                name: "links-and-webhooks",
                topic: "Portalarr Web Portal, Seerr media requests, Tautulli stream stats, and external guides.",
                readOnlyForEveryone: true
            },
            {
                name: "roadmap-and-updates",
                topic: "Upcoming server hardware migrations, capacity expansions, and feature roadmap.",
                readOnlyForEveryone: true
            }
        ]
    },
    {
        name: "📖 2. SETUP & GUIDES",
        channels: [
            {
                name: "plex-setup-guides",
                topic: "Direct Play optimization for Apple TV, Roku, Fire TV, Samsung/LG, Android TV, iOS, and Web.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "plex_guides"
            },
            {
                name: "transcode-doctor",
                topic: "Playback issue troubleshooting, buffer diagnosis, and client device fixes.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "transcode_doctor"
            },
            {
                name: "kindle-and-reading",
                topic: "Send-to-Kindle configuration, approved senders setup, ebook & comic reading.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "kindle_reading"
            },
            {
                name: "audiobooks-guide",
                topic: "Audiobook chapter management, streaming, mobile apps, and playback.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "audiobooks_guide"
            }
        ]
    },
    {
        name: "💬 3. COMMUNITY LOUNGE",
        channels: [
            {
                name: "general-chat",
                topic: "General community discussions, homelab banter, and casual talk.",
                readOnlyForEveryone: false
            },
            {
                name: "movies-and-tv",
                topic: "Spoiler-free film & television chats, watch parties, and reviews.",
                readOnlyForEveryone: false
            },
            {
                name: "reading-nook",
                topic: "Book discussions, series chat, kindle recommendations, and author discovery.",
                readOnlyForEveryone: false
            },
            {
                name: "book-nook",
                topic: "Book discussions, series chat, kindle recommendations, and author discovery.",
                readOnlyForEveryone: false
            },
            {
                name: "polls-and-feedback",
                topic: "Community polls for upcoming library additions, feature votes, and feedback.",
                readOnlyForEveryone: false
            }
        ]
    },
    {
        name: "🎬 4. REQUESTS & MEDIA",
        channels: [
            {
                name: "media-requests",
                topic: "Live request feed from Portalarr & Seerr. Automated approval & download telemetry.",
                readOnlyForEveryone: true
            },
            {
                name: "recently-added",
                topic: "Newly ingested movies, television episodes, audiobooks, and books.",
                readOnlyForEveryone: true
            },
            {
                name: "leaving-soon",
                topic: "Maintainerr pruning radar: Staged media items leaving soon to preserve storage headroom.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "leaving_soon"
            },
            {
                name: "recommendations",
                topic: "Member movie, TV, and book recommendations and discovery discussions.",
                readOnlyForEveryone: false
            }
        ]
    },
    {
        name: "🆘 5. SUPPORT & HELP DESK",
        channels: [
            {
                name: "support-tickets",
                topic: "Open a support request or question with the server administrator.",
                readOnlyForEveryone: false
            },
            {
                name: "server-uptime",
                topic: "Real-time infrastructure health, Plex reachability, host telemetry, and service links.",
                readOnlyForEveryone: true,
                pinnedEmbedKey: "system_status"
            }
        ]
    },
    {
        name: "🤖 6. BOT & AUTOMATION",
        channels: [
            {
                name: "main-server-feed",
                topic: "Radarr/Sonarr download progress, grab alerts, and import logs for Main Plex.",
                adminOnly: true
            },
            {
                name: "kid-server-feed",
                topic: "Radarr/Sonarr download progress and kid library imports.",
                adminOnly: true
            },
            {
                name: "host-health-glances",
                topic: "Hardware telemetry alerts (CPU spikes, RAM usage, storage capacity warnings).",
                adminOnly: true
            },
            {
                name: "deletion-audit",
                topic: "Maintainerr auto-prune executions, deleted media logs, and storage reclaimed.",
                adminOnly: true
            },
            {
                name: "bot-commands",
                topic: "Portalarr Bot diagnostics and manual sync commands.",
                adminOnly: true
            },
            {
                name: "portalarr-logs",
                topic: "Automated sync logs, request dispatch audit, and alert telemetry.",
                adminOnly: true
            }
        ]
    },
    {
        name: "🔒 7. STAFF & VAULT",
        channels: [
            {
                name: "staff-lounge",
                topic: "Private admin notes, billing ledger audits, user management discussion.",
                adminOnly: true
            }
        ]
    }
];

export const DISCORD_ROLES_BLUEPRINT = [
    {
        name: "👑 Admin",
        color: 0xF59E0B, // Amber-500
        hoist: true,
        mentionable: false
    },
    {
        name: "🛡️ Moderator",
        color: 0x06B6D4, // Cyan-500
        hoist: true,
        mentionable: true
    },
    {
        name: "⭐ Member",
        color: 0x10B981, // Emerald-500
        hoist: true,
        mentionable: true
    },
    {
        name: "⏱️ Trial Pass",
        color: 0x3B82F6, // Blue-500
        hoist: true,
        mentionable: true
    },
    {
        name: "🧒 Kids Account",
        color: 0xEC4899, // Pink-500
        hoist: true,
        mentionable: false
    },
    {
        name: "📺 Living Room Device",
        color: 0x6366F1, // Indigo-500
        hoist: false,
        mentionable: false
    },
    {
        name: "⏳ Pending Approval",
        color: 0x9CA3AF, // Slate-400
        hoist: true,
        mentionable: false
    }
];

/**
 * Generic Discord REST fetch wrapper with automatic HTTP 429 rate limit backoff
 */
export async function discordFetch<T = any>(
    endpoint: string,
    options: RequestInit = {},
    botToken: string,
    retryCount = 0
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
    if (!botToken || !botToken.trim()) {
        return { ok: false, status: 401, error: "Discord Bot Token is missing or empty" };
    }

    const cleanToken = botToken.trim().replace(/^Bot\s+/i, "");
    const url = endpoint.startsWith("http") ? endpoint : `${DISCORD_API_BASE}${endpoint}`;

    const headers: Record<string, string> = {
        "Authorization": `Bot ${cleanToken}`,
        "Content-Type": "application/json",
        "User-Agent": "PortalarrBot (https://github.com/plexd281knilb/portalarr, 3.0.0)",
        ...(options.headers as any)
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        if (response.status === 429) {
            const retryData = await response.json().catch(() => ({}));
            const retryAfterSec = typeof retryData.retry_after === "number" ? retryData.retry_after : 2;
            const waitMs = Math.ceil(retryAfterSec * 1000) + 150;

            if (retryCount < 5) {
                logger.addLog("WARN", "DISCORD", `HTTP 429 Rate limit hit on ${endpoint}. Backing off for ${waitMs}ms (Retry ${retryCount + 1}/5)`);
                await new Promise(r => setTimeout(r, waitMs));
                return discordFetch<T>(endpoint, options, botToken, retryCount + 1);
            } else {
                return { ok: false, status: 429, error: `Exceeded rate limit retries (${retryAfterSec}s retry-after)` };
            }
        }

        if (response.status === 204) {
            return { ok: true, status: 204, data: {} as T };
        }

        const data = await response.json().catch(() => null);

        if (!response.ok) {
            const errDetail = data?.message || response.statusText || "Unknown Discord API error";
            return { ok: false, status: response.status, data, error: `HTTP ${response.status}: ${errDetail}` };
        }

        return { ok: true, status: response.status, data };
    } catch (e: any) {
        return { ok: false, status: 0, error: e?.message || "Network error contacting Discord API" };
    }
}

/**
 * Validates bot token, queries current bot identity and guild details
 */
export async function verifyDiscordBotCredentials(credentials: {
    botToken: string;
    guildId?: string;
}): Promise<{
    success: boolean;
    error?: string;
    bot?: {
        id: string;
        username: string;
        discriminator: string;
        avatarUrl?: string;
    };
    guild?: {
        id: string;
        name: string;
        iconUrl?: string;
        memberCount?: number;
        hasAdminPermission?: boolean;
        permissions?: string;
    };
}> {
    const { botToken, guildId } = credentials;
    if (!botToken?.trim()) {
        return { success: false, error: "Please provide a Discord Bot Token." };
    }

    // 1. Fetch @me user info
    const meRes = await discordFetch<DiscordUser>("/users/@me", { method: "GET" }, botToken);
    if (!meRes.ok || !meRes.data) {
        return { success: false, error: meRes.error || "Failed to verify Bot Token with Discord." };
    }

    const botUser = meRes.data;
    const botAvatarUrl = botUser.avatar
        ? `https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=256`
        : `https://cdn.discordapp.com/embed/avatars/0.png`;

    const result: any = {
        success: true,
        bot: {
            id: botUser.id,
            username: botUser.username,
            discriminator: botUser.discriminator,
            avatarUrl: botAvatarUrl
        }
    };

    // 2. If guildId provided, fetch guild and member info
    if (guildId && guildId.trim()) {
        const cleanGuildId = guildId.trim();
        const guildRes = await discordFetch<DiscordGuild>(`/guilds/${cleanGuildId}?with_counts=true`, { method: "GET" }, botToken);
        if (!guildRes.ok || !guildRes.data) {
            return {
                ...result,
                success: false,
                error: `Bot token is valid, but failed to access Guild ${cleanGuildId}: ${guildRes.error}. Ensure the bot is added to the server with proper permissions.`
            };
        }

        const guild = guildRes.data;
        const guildIconUrl = guild.icon
            ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256`
            : undefined;

        // Check member permissions for bot
        const memberRes = await discordFetch<any>(`/guilds/${cleanGuildId}/members/${botUser.id}`, { method: "GET" }, botToken);
        let hasAdmin = false;
        let permsString = "";

        if (memberRes.ok && memberRes.data) {
            // Check roles or guild owner
            if (guild.owner_id === botUser.id) {
                hasAdmin = true;
            } else {
                // Fetch guild roles to check permissions bitmask
                const rolesRes = await discordFetch<DiscordRole[]>(`/guilds/${cleanGuildId}/roles`, { method: "GET" }, botToken);
                if (rolesRes.ok && Array.isArray(rolesRes.data)) {
                    const memberRoles = new Set(memberRes.data.roles || []);
                    for (const r of rolesRes.data) {
                        if (r.id === cleanGuildId || memberRoles.has(r.id)) {
                            try {
                                const bit = BigInt(r.permissions || "0");
                                const adminMask = BigInt(DISCORD_PERMISSIONS.ADMINISTRATOR);
                                const manageMask = BigInt(DISCORD_PERMISSIONS.MANAGE_CHANNELS);
                                if ((bit & adminMask) === adminMask) {
                                    hasAdmin = true;
                                    break;
                                }
                                if ((bit & manageMask) === manageMask) {
                                    hasAdmin = true;
                                }
                            } catch {}
                        }
                    }
                }
            }
        }

        result.guild = {
            id: guild.id,
            name: guild.name,
            iconUrl: guildIconUrl,
            memberCount: guild.member_count,
            hasAdminPermission: hasAdmin,
            permissions: permsString
        };
    }

    return result;
}

/**
 * Generates canonical, high-definition Discord Embeds matching Portalarr's design system
 */
export function generateDiscordEmbed(
    key: "welcome_rules" | "subscription_tiers" | "plex_guides" | "transcode_doctor" | "system_status" | "kindle_reading" | "audiobooks_guide" | "leaving_soon",
    customData?: any
): DiscordEmbed {
    const nowIso = new Date().toISOString();

    switch (key) {
        case "welcome_rules":
            return {
                title: "🚀 Welcome to DomsHomeLab & Portalarr Mission Control",
                description: "Welcome to the centralized media and homelab community! Portalarr provides unified access to high-performance Plex streaming stacks, Servarr automated request fulfillment, eBook & Audiobook readers, and real-time support.",
                color: 0x3B82F6, // Blue
                fields: [
                    {
                        name: "📌 1. Quality & Direct Play First",
                        value: "Always set your client player quality to **Maximum / Original** in settings. Leaving clients on the 720p 2.0 Mbps default forces unnecessary server transcoding and reduces video clarity."
                    },
                    {
                        name: "🚫 2. Household & Account Integrity",
                        value: "Accounts are provisioned for your approved household only. Sharing login credentials, streaming tokens, or links outside your household leads to immediate account revocation."
                    },
                    {
                        name: "📥 3. Automated Media Requests",
                        value: "Need a movie, TV show, anime, or book? Submit requests directly on the Portalarr Web App. Most verified media requests auto-approve and start grabbing within seconds!"
                    },
                    {
                        name: "🩺 4. Transcode Doctor Diagnostics",
                        value: "If you encounter buffering, audio stutter, or subtitle lag, visit <#transcode-doctor> for immediate 30-second fix instructions tailored to your specific device."
                    },
                    {
                        name: "💬 5. Spoiler Etiquette & Chat",
                        value: "Keep discussions friendly and spoiler-free! Always use spoiler tags `||spoiler content||` when discussing recent releases or plot twists in community channels."
                    }
                ],
                footer: { text: "DomsHomeLab • Portalarr Mission Control" },
                timestamp: nowIso
            };

        case "subscription_tiers":
            return {
                title: "💎 Membership Plans & Subscription Information",
                description: "Our media platform is privately funded and maintained. Transparent membership contributions cover dedicated high-bandwidth fiber connectivity, multi-terabyte NVMe storage, and enterprise hardware.",
                color: 0x10B981, // Emerald
                fields: [
                    {
                        name: "⭐ Member: Full Access",
                        value: "• **$17.50 / Month** (or **$180 / Year** discounted annual equivalent of $15/mo)\n• Full access to 1080p & 4K Plex Libraries\n• Unlimited eBooks, Audiobooks & Comic Readers\n• Send-to-Kindle automated document dispatch\n• Standard 10 movie / 10 TV episode weekly request quota\n• High-speed Direct Play streaming"
                    },
                    {
                        name: "⏱️ Trial Pass",
                        value: "• **7-Day Complimentary Pass** upon signup\n• Full library exploration & 3 trial request credits"
                    },
                    {
                        name: "💳 Accepted Payment Methods",
                        value: "• **Cash App**\n• **Apple Pay**\n• **PayPal**\n• **Zelle**\n\n*Important:* Always include your exact Portalarr username in the payment note/memo so payment auto-matches to your account."
                    },
                    {
                        name: "🎁 Referral Program: Earn Free Months",
                        value: "Every friend you invite through your unique referral link earns you **+1 FREE Month** of membership once their account is approved!"
                    }
                ],
                footer: { text: "DomsHomeLab • Transparent Billing & Access" },
                timestamp: nowIso
            };

        case "plex_guides":
            return {
                title: "📱 Plex Device Setup: Enable Direct Play in 30 Seconds",
                description: "Plex default settings often limit video quality to 720p 2 Mbps over the internet. Follow these steps on your device once to ensure **Crystal Clear 4K/1080p Original Quality** without server buffering.",
                color: 0xF59E0B, // Amber
                fields: [
                    {
                        name: "📺 Apple TV 4K",
                        value: "1. Open Plex Settings $\\rightarrow$ **Video**\n2. Set **Home Streaming** & **Remote Streaming** to `Maximum`\n3. Turn **Match Content (Dynamic Range & Frame Rate)** `ON`"
                    },
                    {
                        name: "📺 Roku Players & Roku TVs",
                        value: "1. Open Plex Settings $\\rightarrow$ **Video**\n2. Set **Local Quality** & **Remote Quality** to `Original`\n3. In Playback Options, ensure **Direct Play** is set to `Force` or `Auto`"
                    },
                    {
                        name: "📺 Amazon Fire TV & Android TV / Google TV",
                        value: "1. Open Plex Settings $\\rightarrow$ **Video**\n2. Set **Video Quality** to `Maximum`\n3. Scroll to **Subtitles** $\\rightarrow$ Set **Burn Subtitles** to `Only Image Formats`"
                    },
                    {
                        name: "📺 Samsung Tizen & LG webOS Smart TVs",
                        value: "1. Open Plex Settings $\\rightarrow$ **Video**\n2. Set **Local Quality** & **Remote Quality** to `Original`\n3. Enable **Direct Stream** and **Direct Play** checkboxes"
                    },
                    {
                        name: "📱 iPhone, iPad & Android Mobile",
                        value: "1. Open Plex Settings $\\rightarrow$ **Quality**\n2. Set **Remote Streaming** to `Maximum`\n3. In Advanced $\\rightarrow$ Turn **Use Old Video Player** `OFF`"
                    },
                    {
                        name: "💻 Windows / macOS / Linux PC",
                        value: "⚡ **Pro Tip:** Never use web browser tabs (Chrome/Safari) for 4K or HDR! Download the free official **Plex Desktop App** for native hardware decoding and Dolby Atmos pass-through."
                    }
                ],
                footer: { text: "DomsHomeLab • Device Setup Guides" },
                timestamp: nowIso
            };

        case "transcode_doctor":
            return {
                title: "🩺 Transcode Doctor: Stream Health & Buffer Diagnostics",
                description: "Encountering buffering, stutter, or reduced resolution? Here are the 3 most common causes and how to fix them immediately.",
                color: 0xEF4444, // Red
                fields: [
                    {
                        name: "🔴 Cause 1: Client Locked at 720p 2.0 Mbps (Severe Buffering)",
                        value: "**Fix:** While the video is playing, click the playback settings slider (gear icon) $\\rightarrow$ **Quality** $\\rightarrow$ Change from `Convert Automatically` or `720p` to **Original / Maximum**."
                    },
                    {
                        name: "🟡 Cause 2: Audio Transcoding (EAC3 $\\rightarrow$ AAC / Opus)",
                        value: "**Harmless!** If your TV or soundbar does not support 7.1 TrueHD or 5.1 EAC3 audio, the server converts the audio track in milliseconds while keeping the video track 100% Direct Play."
                    },
                    {
                        name: "🟠 Cause 3: Subtitle Burn-In Video Transcoding",
                        value: "**Fix:** Complex anime subtitles (ASS/SSA) or Blu-ray image subtitles (PGS) can force the server to re-encode the entire video frame. In Plex Settings $\\rightarrow$ Subtitles, change **Burn Subtitles** to `Only Image Formats` or select an SRT text subtitle track."
                    }
                ],
                footer: { text: "DomsHomeLab • Transcode Doctor Self-Service" },
                timestamp: nowIso
            };

        case "kindle_reading":
            return {
                title: "📚 Send-to-Kindle & E-Reader Integration",
                description: "Portalarr lets you read eBooks and graphic novels in your browser, or send books directly to your physical Amazon Kindle with 1 click.",
                color: 0x8B5CF6, // Violet
                fields: [
                    {
                        name: "1. Configure Amazon Approved Senders",
                        value: "Amazon requires you to authorize the sending email address before accepting documents.\n1. Go to **amazon.com/myk** $\\rightarrow$ Preferences $\\rightarrow$ **Personal Document Settings**\n2. Under *Approved Personal Document E-mail List*, add your lab dispatcher email."
                    },
                    {
                        name: "2. Save Your Kindle Address in Portalarr",
                        value: "In Portalarr $\\rightarrow$ **Profile** (or **Settings**), enter your `@kindle.com` address. When browsing the Library, tap the **Send to Kindle** button on any book!"
                    },
                    {
                        name: "3. In-Browser Paperwhite Reader",
                        value: "No Kindle device? No problem! Read directly in any modern browser with Bookerly typography, customizable dark/light themes, and automatic reading percentage syncing."
                    }
                ],
                footer: { text: "DomsHomeLab • Reading Guides" },
                timestamp: nowIso
            };

        case "audiobooks_guide":
            return {
                title: "🎧 Audiobooks Guide: Streaming, Chapters & Mobile Apps",
                description: "Our audiobook library supports full chapter navigation, background playback, and multi-track album consolidation.",
                color: 0x06B6D4, // Cyan
                fields: [
                    {
                        name: "🎵 In-Browser Web Player",
                        value: "Listen right inside Portalarr with the floating audio player, chapter selector, variable speed controls (0.75x to 2.5x), and sleep timer."
                    },
                    {
                        name: "📱 Recommended Mobile Apps",
                        value: "• **Plexamp (iOS & Android):** Best for mobile listening with audio caching and CarPlay/Android Auto.\n• **Prologue (iOS):** Premium dedicated audiobook player connecting directly to our server."
                    }
                ],
                footer: { text: "DomsHomeLab • Audiobooks Guide" },
                timestamp: nowIso
            };

        case "leaving_soon":
            return {
                title: "⏳ Leaving Soon: Storage Headroom & Media Retention",
                description: "To keep our server running smoothly and make room for upcoming 4K blockbusters, unwatched older movies and TV series enter our Maintainerr Leaving Soon grace period.",
                color: 0xDC2626, // Crimson Red
                fields: [
                    {
                        name: "🛡️ 14-Day Grace Period",
                        value: "Items staged for departure are marked with `Leaving Soon` badges and featured on the Plex Home Screen for 14 days before disk cleanup."
                    },
                    {
                        name: "🍿 Want to Keep Something?",
                        value: "Simply start watching the title, or message an Admin in <#support-tickets> to permanently exempt it from automatic pruning!"
                    }
                ],
                footer: { text: "Maintainerr Storage Management • DomsHomeLab" },
                timestamp: nowIso
            };

        case "system_status":
        default:
            const summary = customData?.summary || { totalConfigured: 0, onlineCount: 0, offlineCount: 0 };
            const services = customData?.services || [];
            const plexServices = services.filter((s: any) => s.category === "PLEX");
            const hostServices = services.filter((s: any) => s.category === "HOST");
            const arrServices = services.filter((s: any) => s.category === "ARR");
            const dlServices = services.filter((s: any) => s.category === "DOWNLOAD");

            const statusEmoji = (st: string) => st === "ONLINE" ? "🟢" : st === "PAUSED" ? "⏸️" : "🔴";

            const plexLines = plexServices.map((s: any) => `${statusEmoji(s.status)} **${s.name}**: \`${s.status}\` (${s.latencyMs || 0}ms)`).join("\n") || "No Plex servers configured";
            const hostLines = hostServices.map((s: any) => `${statusEmoji(s.status)} **${s.name}**: \`${s.status}\` (${s.latencyMs || 0}ms)`).join("\n") || "No Glances hosts configured";
            const arrLines = arrServices.map((s: any) => `${statusEmoji(s.status)} **${s.name}**: \`${s.status}\``).join("\n") || "No Servarr apps configured";
            const dlLines = dlServices.map((s: any) => `${statusEmoji(s.status)} **${s.name}**: \`${s.status}\``).join("\n") || "No download clients configured";

            const isAllHealthy = summary.offlineCount === 0;

            return {
                title: isAllHealthy ? "🟢 DomsHomeLab Infrastructure: All Systems Operational" : "⚠️ DomsHomeLab Infrastructure: Partial Outage / Degraded",
                description: `Live automated telemetry from Portalarr Mission Control. Checked every 60 seconds across monitored hosts and media servers.`,
                color: isAllHealthy ? 0x10B981 : 0xF59E0B,
                fields: [
                    { name: "🎬 Plex Media Servers", value: plexLines, inline: false },
                    { name: "🖥️ Physical Hosts & Hardware", value: hostLines, inline: false },
                    { name: "⚡ Request & Servarr Stack", value: arrLines, inline: true },
                    { name: "📥 Download Clients", value: dlLines, inline: true }
                ],
                footer: { text: `Last verified • ${summary.onlineCount}/${summary.totalConfigured} services online` },
                timestamp: nowIso
            };
    }
}

/**
 * Creates or synchronizes the complete Discord server architecture to match Portalarr
 */
export async function syncDiscordServerStructure(params: {
    botToken: string;
    guildId: string;
    options?: {
        updateTopics?: boolean;
        createRoles?: boolean;
        postPinnedEmbeds?: boolean;
    };
}): Promise<{
    success: boolean;
    error?: string;
    categoriesCreated: number;
    categoriesExisting: number;
    channelsCreated: number;
    channelsExisting: number;
    rolesCreated: number;
    embedsPosted: number;
    channelMap: Record<string, string>;
    summaryText: string;
}> {
    const { botToken, guildId, options = {} } = params;
    const { updateTopics = true, createRoles = true, postPinnedEmbeds = true } = options;

    if (!botToken?.trim() || !guildId?.trim()) {
        return {
            success: false,
            error: "Bot Token and Guild ID are required.",
            categoriesCreated: 0,
            categoriesExisting: 0,
            channelsCreated: 0,
            channelsExisting: 0,
            rolesCreated: 0,
            embedsPosted: 0,
            channelMap: {},
            summaryText: "Missing credentials"
        };
    }

    const cleanToken = botToken.trim();
    const cleanGuildId = guildId.trim();

    logger.addLog("INFO", "DISCORD", `🚀 Starting Discord server sync for Guild ID: ${cleanGuildId}...`);

    // 1. Fetch existing guild channels
    const channelsRes = await discordFetch<DiscordChannel[]>(`/guilds/${cleanGuildId}/channels`, { method: "GET" }, cleanToken);
    if (!channelsRes.ok || !Array.isArray(channelsRes.data)) {
        return {
            success: false,
            error: `Failed to fetch guild channels: ${channelsRes.error}`,
            categoriesCreated: 0,
            categoriesExisting: 0,
            channelsCreated: 0,
            channelsExisting: 0,
            rolesCreated: 0,
            embedsPosted: 0,
            channelMap: {},
            summaryText: channelsRes.error || "Failed to fetch guild channels"
        };
    }

    const existingChannels = channelsRes.data;
    const existingCategoryMap = new Map<string, DiscordChannel>();
    const existingChannelMap = new Map<string, DiscordChannel>();

    for (const ch of existingChannels) {
        const normName = ch.name.toLowerCase().trim();
        if (ch.type === DISCORD_CHANNEL_TYPES.GUILD_CATEGORY) {
            existingCategoryMap.set(normName, ch);
        } else {
            // Index by parentId + name, and by name alone
            const key = ch.parent_id ? `${ch.parent_id}:${normName}` : normName;
            existingChannelMap.set(key, ch);
            if (!existingChannelMap.has(normName)) {
                existingChannelMap.set(normName, ch);
            }
        }
    }

    let categoriesCreated = 0;
    let categoriesExisting = 0;
    let channelsCreated = 0;
    let channelsExisting = 0;
    let rolesCreated = 0;
    let embedsPosted = 0;
    const resolvedChannelMap: Record<string, string> = {};

    // 2. Fetch Guild Roles (if createRoles enabled)
    if (createRoles) {
        const rolesRes = await discordFetch<DiscordRole[]>(`/guilds/${cleanGuildId}/roles`, { method: "GET" }, cleanToken);
        if (rolesRes.ok && Array.isArray(rolesRes.data)) {
            const existingRoles = new Set(rolesRes.data.map(r => r.name.toLowerCase().trim()));

            for (const rBlueprint of DISCORD_ROLES_BLUEPRINT) {
                const normRName = rBlueprint.name.toLowerCase().trim();
                if (!existingRoles.has(normRName)) {
                    const createRoleRes = await discordFetch<DiscordRole>(`/guilds/${cleanGuildId}/roles`, {
                        method: "POST",
                        body: JSON.stringify({
                            name: rBlueprint.name,
                            color: rBlueprint.color,
                            hoist: rBlueprint.hoist,
                            mentionable: rBlueprint.mentionable
                        })
                    }, cleanToken);

                    if (createRoleRes.ok) {
                        rolesCreated++;
                        logger.addLog("INFO", "DISCORD", `✅ Created role: "${rBlueprint.name}"`);
                    } else {
                        logger.addLog("WARN", "DISCORD", `⚠️ Failed to create role "${rBlueprint.name}": ${createRoleRes.error}`);
                    }
                }
            }
        }
    }

    // 3. Process Categories & Channels from Blueprint
    let categoryPosition = 0;

    for (const catBlueprint of DISCORD_SERVER_BLUEPRINT) {
        const normCatName = catBlueprint.name.toLowerCase().trim();
        let targetCategory = existingCategoryMap.get(normCatName);

        if (!targetCategory) {
            // Create Category
            const catCreateRes = await discordFetch<DiscordChannel>(`/guilds/${cleanGuildId}/channels`, {
                method: "POST",
                body: JSON.stringify({
                    name: catBlueprint.name,
                    type: DISCORD_CHANNEL_TYPES.GUILD_CATEGORY,
                    position: categoryPosition
                })
            }, cleanToken);

            if (catCreateRes.ok && catCreateRes.data) {
                targetCategory = catCreateRes.data;
                existingCategoryMap.set(normCatName, targetCategory);
                categoriesCreated++;
                logger.addLog("INFO", "DISCORD", `📁 Created category: "${catBlueprint.name}"`);
            } else {
                logger.addLog("ERROR", "DISCORD", `❌ Failed to create category "${catBlueprint.name}": ${catCreateRes.error}`);
                continue;
            }
        } else {
            categoriesExisting++;
        }

        categoryPosition++;
        const categoryId = targetCategory.id;

        // Process channels inside this category
        let channelPosition = 0;
        for (const chBlueprint of catBlueprint.channels) {
            const normChName = chBlueprint.name.toLowerCase().trim();
            const scopedKey = `${categoryId}:${normChName}`;
            let targetChannel = existingChannelMap.get(scopedKey) || existingChannelMap.get(normChName);

            // Determine permission overwrites
            const permissionOverwrites: any[] = [];

            if (chBlueprint.readOnlyForEveryone) {
                // Deny SEND_MESSAGES for @everyone (id: cleanGuildId)
                permissionOverwrites.push({
                    id: cleanGuildId,
                    type: 0, // Role
                    allow: (DISCORD_PERMISSIONS.VIEW_CHANNEL | DISCORD_PERMISSIONS.READ_MESSAGE_HISTORY).toString(),
                    deny: (DISCORD_PERMISSIONS.SEND_MESSAGES | DISCORD_PERMISSIONS.ADD_REACTIONS).toString()
                });
            } else if (chBlueprint.adminOnly) {
                // Deny VIEW_CHANNEL for @everyone
                permissionOverwrites.push({
                    id: cleanGuildId,
                    type: 0, // Role
                    allow: "0",
                    deny: (DISCORD_PERMISSIONS.VIEW_CHANNEL).toString()
                });
            }

            if (!targetChannel) {
                // Create Channel
                const chCreateRes = await discordFetch<DiscordChannel>(`/guilds/${cleanGuildId}/channels`, {
                    method: "POST",
                    body: JSON.stringify({
                        name: chBlueprint.name,
                        type: chBlueprint.type ?? DISCORD_CHANNEL_TYPES.GUILD_TEXT,
                        parent_id: categoryId,
                        topic: chBlueprint.topic,
                        position: channelPosition,
                        permission_overwrites: permissionOverwrites.length > 0 ? permissionOverwrites : undefined
                    })
                }, cleanToken);

                if (chCreateRes.ok && chCreateRes.data) {
                    targetChannel = chCreateRes.data;
                    existingChannelMap.set(scopedKey, targetChannel);
                    existingChannelMap.set(normChName, targetChannel);
                    channelsCreated++;
                    logger.addLog("INFO", "DISCORD", `💬 Created channel: "#${chBlueprint.name}" under "${catBlueprint.name}"`);
                } else {
                    logger.addLog("ERROR", "DISCORD", `❌ Failed to create channel "#${chBlueprint.name}": ${chCreateRes.error}`);
                    continue;
                }
            } else {
                channelsExisting++;

                // Optional: update topic / parent / permissions if changed
                if (updateTopics && targetChannel.topic !== chBlueprint.topic) {
                    await discordFetch(`/channels/${targetChannel.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                            topic: chBlueprint.topic,
                            parent_id: categoryId
                        })
                    }, cleanToken);
                }
            }

            channelPosition++;
            resolvedChannelMap[chBlueprint.name] = targetChannel.id;

            // 4. Post Pinned Guide / Welcome Embeds if requested
            if (postPinnedEmbeds && chBlueprint.pinnedEmbedKey && targetChannel) {
                try {
                    // Check if channel already has pinned messages from bot
                    const pinsRes = await discordFetch<any[]>(`/channels/${targetChannel.id}/pins`, { method: "GET" }, cleanToken);
                    const hasPinnedEmbed = pinsRes.ok && Array.isArray(pinsRes.data) && pinsRes.data.length > 0;

                    if (!hasPinnedEmbed) {
                        const embed = generateDiscordEmbed(chBlueprint.pinnedEmbedKey);
                        const msgRes = await discordFetch<any>(`/channels/${targetChannel.id}/messages`, {
                            method: "POST",
                            body: JSON.stringify({
                                embeds: [embed]
                            })
                        }, cleanToken);

                        if (msgRes.ok && msgRes.data?.id) {
                            // Pin message
                            await discordFetch(`/channels/${targetChannel.id}/pins/${msgRes.data.id}`, {
                                method: "PUT"
                            }, cleanToken);
                            embedsPosted++;
                            logger.addLog("INFO", "DISCORD", `📌 Posted and pinned embed in "#${chBlueprint.name}"`);
                        }
                    }
                } catch (e: any) {
                    logger.addLog("WARN", "DISCORD", `Could not post pinned embed to #${chBlueprint.name}: ${e.message}`);
                }
            }
        }
    }

    const summaryText = `Server Sync Complete: ${categoriesCreated} categories created (${categoriesExisting} verified), ${channelsCreated} channels created (${channelsExisting} verified), ${rolesCreated} roles provisioned, ${embedsPosted} embeds posted.`;
    logger.addLog("INFO", "DISCORD", `🎉 ${summaryText}`);

    return {
        success: true,
        categoriesCreated,
        categoriesExisting,
        channelsCreated,
        channelsExisting,
        rolesCreated,
        embedsPosted,
        channelMap: resolvedChannelMap,
        summaryText
    };
}

/**
 * Updates or posts the real-time live system status embed in the #system-status channel
 */
export async function updateDiscordLiveStatus(params: {
    botToken: string;
    guildId: string;
    channelId?: string;
    systemData?: any;
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
    const { botToken, guildId, channelId, systemData } = params;

    let targetChannelId = channelId;

    // If channelId not explicitly passed, find #system-status
    if (!targetChannelId) {
        const channelsRes = await discordFetch<DiscordChannel[]>(`/guilds/${guildId}/channels`, { method: "GET" }, botToken);
        if (channelsRes.ok && Array.isArray(channelsRes.data)) {
            const statusCh = channelsRes.data.find(c => c.name.toLowerCase().includes("system-status"));
            if (statusCh) targetChannelId = statusCh.id;
        }
    }

    if (!targetChannelId) {
        return { success: false, error: "Could not find a #system-status channel in the server." };
    }

    // Generate current status embed
    const embed = generateDiscordEmbed("system_status", systemData);

    // Look for existing messages in the channel to edit or create new
    const msgListRes = await discordFetch<any[]>(`/channels/${targetChannelId}/messages?limit=5`, { method: "GET" }, botToken);
    let existingMsgId: string | null = null;

    if (msgListRes.ok && Array.isArray(msgListRes.data)) {
        // Find message authored by this bot
        const botMsg = msgListRes.data.find(m => m.author?.bot && m.embeds?.length > 0 && m.embeds[0]?.title?.includes("DomsHomeLab Infrastructure"));
        if (botMsg) existingMsgId = botMsg.id;
    }

    if (existingMsgId) {
        // Edit existing message
        const editRes = await discordFetch(`/channels/${targetChannelId}/messages/${existingMsgId}`, {
            method: "PATCH",
            body: JSON.stringify({ embeds: [embed] })
        }, botToken);

        if (editRes.ok) {
            return { success: true, messageId: existingMsgId };
        }
    }

    // Post new message
    const postRes = await discordFetch<any>(`/channels/${targetChannelId}/messages`, {
        method: "POST",
        body: JSON.stringify({ embeds: [embed] })
    }, botToken);

    if (postRes.ok && postRes.data?.id) {
        // Pin it
        await discordFetch(`/channels/${targetChannelId}/pins/${postRes.data.id}`, { method: "PUT" }, botToken).catch(() => {});
        return { success: true, messageId: postRes.data.id };
    }

    return { success: false, error: postRes.error || "Failed to post status message" };
}

/**
 * Posts an arbitrary Discord message with optional embeds
 */
export async function postDiscordMessage(params: {
    botToken: string;
    channelId: string;
    content?: string;
    embeds?: DiscordEmbed[];
}): Promise<{ success: boolean; error?: string; messageId?: string }> {
    const { botToken, channelId, content, embeds } = params;

    const res = await discordFetch<any>(`/channels/${channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
            content,
            embeds
        })
    }, botToken);

    if (res.ok && res.data?.id) {
        return { success: true, messageId: res.data.id };
    }

    return { success: false, error: res.error || "Failed to send Discord message" };
}

/**
 * Generates OAuth2 Bot Invite URL with Administrator or required permissions
 */
export function getDiscordBotInviteUrl(clientId?: string): string {
    const cleanId = (clientId || "").trim();
    if (!cleanId) return "";
    return `https://discord.com/oauth2/authorize?client_id=${cleanId}&permissions=8&scope=bot%20applications.commands`;
}
