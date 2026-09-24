import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getAppUrl } from "@/lib/app-url";
import { renderEmailTemplate } from "@/lib/email-templates";
import { logger } from "@/lib/logger";

export type SeerrNotificationEvent = 
    | "PENDING"
    | "AUTO_APPROVED"
    | "APPROVED"
    | "DECLINED"
    | "AVAILABLE"
    | "FAILED";

export interface SeerrNotificationPayload {
    id: string;
    mediaType: "movie" | "tv" | string;
    tmdbId: number;
    tvdbId?: number | null;
    imdbId?: string | null;
    title: string;
    releaseYear?: string | null;
    posterPath?: string | null;
    backdropPath?: string | null;
    overview?: string | null;
    status: string;
    is4k?: boolean;
    isKids?: boolean;
    contentRating?: string | null;
    requestedByUsername: string;
    requestedByUserId?: string | null;
    seasons?: string | null;
}

export interface SeerrNotificationExtra {
    declineReason?: string;
    errorMessage?: string;
    plexUrl?: string;
    customMessage?: string;
}

/**
 * Sends a rich Discord Embed notification for a Seerr request event
 */
export async function sendSeerrDiscordWebhook(
    event: SeerrNotificationEvent,
    request: SeerrNotificationPayload,
    extra?: SeerrNotificationExtra
): Promise<{ success: boolean; error?: string }> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!settings || !settings.seerrDiscordWebhookUrl || !settings.seerrDiscordWebhookUrl.trim()) {
            return { success: true }; // Not configured, silently skip
        }

        const webhookUrl = settings.seerrDiscordWebhookUrl.trim();

        // Check event toggle
        if (event === "PENDING" && settings.seerrDiscordNotifyPending === false) return { success: true };
        if (event === "AUTO_APPROVED" && settings.seerrDiscordNotifyAutoApproved === false) return { success: true };
        if (event === "APPROVED" && settings.seerrDiscordNotifyApproved === false) return { success: true };
        if (event === "DECLINED" && settings.seerrDiscordNotifyDeclined === false) return { success: true };
        if (event === "AVAILABLE" && settings.seerrDiscordNotifyAvailable === false) return { success: true };
        if (event === "FAILED" && settings.seerrDiscordNotifyFailed === false) return { success: true };

        const isMovie = request.mediaType === "movie";
        const mediaLabel = isMovie ? "Movie" : "TV Series";
        const yearStr = request.releaseYear ? ` (${request.releaseYear})` : "";
        const qualityStr = request.is4k ? "4K UHD" : "1080p Standard";
        const sectionStr = request.isKids ? "Kids & Family" : "Main Library";

        let titleText = "";
        let colorInt = 0x3B82F6; // Blue default
        let statusLabel = "";

        switch (event) {
            case "PENDING":
                titleText = `⏳ New ${mediaLabel} Request: ${request.title}${yearStr}`;
                colorInt = 0xF59E0B; // Amber
                statusLabel = "⏳ Pending Approval";
                break;
            case "AUTO_APPROVED":
                titleText = `🚀 Request Auto-Approved: ${request.title}${yearStr}`;
                colorInt = 0x3B82F6; // Blue
                statusLabel = "🚀 Auto-Approved & Downloading";
                break;
            case "APPROVED":
                titleText = `✅ Request Approved: ${request.title}${yearStr}`;
                colorInt = 0x3B82F6; // Blue
                statusLabel = "✅ Approved by Admin";
                break;
            case "DECLINED":
                titleText = `❌ Request Declined: ${request.title}${yearStr}`;
                colorInt = 0xEF4444; // Red
                statusLabel = "❌ Declined";
                break;
            case "AVAILABLE":
                titleText = `🎉 Media Available on Plex: ${request.title}${yearStr}`;
                colorInt = 0x10B981; // Emerald Green
                statusLabel = "🎉 Ready to Stream";
                break;
            case "FAILED":
                titleText = `⚠️ Request Issue: ${request.title}${yearStr}`;
                colorInt = 0xEF4444; // Red
                statusLabel = "⚠️ Download/Dispatch Issue";
                break;
        }

        const appUrl = await getAppUrl();
        const posterUrl = request.posterPath 
            ? (request.posterPath.startsWith("http") ? request.posterPath : `https://image.tmdb.org/t/p/w500${request.posterPath}`)
            : undefined;

        // Parse seasons if TV
        let seasonsText = "";
        if (!isMovie && request.seasons) {
            try {
                if (request.seasons === "all") {
                    seasonsText = "All Seasons";
                } else {
                    const parsed = JSON.parse(request.seasons);
                    if (Array.isArray(parsed)) {
                        seasonsText = parsed.map(s => `Season ${s}`).join(", ");
                    }
                }
            } catch {
                seasonsText = request.seasons;
            }
        }

        const fields: Array<{ name: string; value: string; inline?: boolean }> = [
            { name: "Status", value: statusLabel, inline: true },
            { name: "Requested By", value: request.requestedByUsername || "Unknown User", inline: true },
            { name: "Quality", value: qualityStr, inline: true },
            { name: "Media Type", value: mediaLabel, inline: true },
            { name: "Library Section", value: sectionStr, inline: true }
        ];

        if (request.contentRating) {
            fields.push({ name: "Rating", value: request.contentRating, inline: true });
        }

        if (seasonsText) {
            fields.push({ name: "Seasons", value: seasonsText, inline: true });
        }

        if (event === "DECLINED" && extra?.declineReason) {
            fields.push({ name: "Decline Reason", value: extra.declineReason, inline: false });
        }

        if (event === "FAILED" && extra?.errorMessage) {
            fields.push({ name: "Error Details", value: extra.errorMessage, inline: false });
        }

        const cleanOverview = request.overview ? request.overview.slice(0, 450) + (request.overview.length > 450 ? "..." : "") : "";

        const embed: any = {
            title: titleText,
            description: cleanOverview || undefined,
            color: colorInt,
            fields,
            footer: {
                text: "Portalarr • Media Request Management"
            },
            timestamp: new Date().toISOString()
        };

        if (extra?.plexUrl) {
            embed.url = extra.plexUrl;
        } else if (appUrl) {
            embed.url = `${appUrl}/requests`;
        }

        if (posterUrl) {
            embed.thumbnail = { url: posterUrl };
        }

        const botUsername = settings.seerrDiscordBotUsername || "Portalarr";
        const botAvatar = settings.seerrDiscordBotAvatarUrl || undefined;

        const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: botUsername,
                avatar_url: botAvatar,
                embeds: [embed]
            })
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            logger.addLog("WARN", "SEERR-DISCORD", `Discord webhook returned HTTP ${res.status}: ${errText}`);
            return { success: false, error: `Discord HTTP ${res.status}: ${errText}` };
        }

        logger.addLog("INFO", "SEERR-DISCORD", `Dispatched Discord webhook for event ${event} ("${request.title}")`);
        return { success: true };
    } catch (e: any) {
        logger.addLog("ERROR", "SEERR-DISCORD", `Failed sending Discord webhook: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * Sends a test Discord Webhook embed to verify webhook connectivity and bot appearance
 */
export async function sendTestSeerrDiscordWebhook(
    webhookUrl: string,
    botUsername?: string,
    botAvatarUrl?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
        if (!webhookUrl || !webhookUrl.startsWith("http")) {
            return { success: false, error: "Please provide a valid Discord Webhook URL starting with https://" };
        }

        const appUrl = await getAppUrl();
        const testEmbed = {
            title: "🎉 Portalarr Request Engine — Discord Webhook Test",
            description: "Discord Webhook notifications are successfully connected and ready to broadcast media request events, auto-approvals, and stream availability alerts!",
            color: 0x10B981, // Emerald green
            fields: [
                { name: "Status", value: "✅ Connected & Verified", inline: true },
                { name: "Event Triggers", value: "Requests, Approvals, Availability & Alerts", inline: true },
                { name: "Integration", value: "Radarr, Sonarr & Plex", inline: true }
            ],
            footer: {
                text: "Portalarr • Media Request Management Engine"
            },
            timestamp: new Date().toISOString()
        };

        const res = await fetch(webhookUrl.trim(), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                username: botUsername || "Portalarr",
                avatar_url: botAvatarUrl || undefined,
                embeds: [testEmbed]
            })
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => "");
            return { success: false, error: `Discord returned HTTP ${res.status}: ${errText || "Invalid webhook URL or permissions"}` };
        }

        return { success: true, message: "Test webhook sent successfully to Discord channel!" };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to reach Discord webhook endpoint" };
    }
}

/**
 * Dispatches an automated email notification for a Seerr media request event
 */
export async function sendSeerrEmailNotification(
    event: SeerrNotificationEvent,
    request: SeerrNotificationPayload,
    extra?: SeerrNotificationExtra
): Promise<{ success: boolean; error?: string }> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!settings || !settings.smtpHost || !settings.smtpUser || !settings.smtpPass) {
            return { success: true }; // SMTP not configured, skip
        }

        if (settings.emailNotificationsEnabled === false) {
            return { success: true }; // Master email notifications disabled
        }

        // Check event email toggle
        if (event === "PENDING" && settings.seerrEmailNotifyAdminNewRequest === false) return { success: true };
        if (event === "AUTO_APPROVED" && settings.seerrEmailNotifyUserAutoApproved === false) return { success: true };
        if (event === "APPROVED" && settings.seerrEmailNotifyUserApproved === false) return { success: true };
        if (event === "DECLINED" && settings.seerrEmailNotifyUserDeclined === false) return { success: true };
        if (event === "AVAILABLE" && (settings.seerrEmailNotifyUserAvailable === false || settings.seerrNotificationOnAvailable === false)) return { success: true };
        if (event === "FAILED" && settings.seerrEmailNotifyUserFailed === false) return { success: true };

        const isMovie = request.mediaType === "movie";
        const mediaLabel = isMovie ? "Movie" : "TV Series";
        const yearStr = request.releaseYear || "";
        const qualityStr = request.is4k ? "4K UHD" : "1080p Standard";
        const sectionStr = request.isKids ? "Kids & Family" : "Main Library";
        const appUrl = await getAppUrl();
        const senderEmail = settings.smtpFrom || settings.smtpUser;

        const transporter = nodemailer.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort || 587,
            secure: settings.smtpPort === 465,
            auth: {
                user: settings.smtpUser,
                pass: decryptData(settings.smtpPass)
            }
        });

        // Parse seasons for TV
        let seasonsText = "";
        if (!isMovie && request.seasons) {
            try {
                if (request.seasons === "all") {
                    seasonsText = "All Seasons";
                } else {
                    const parsed = JSON.parse(request.seasons);
                    if (Array.isArray(parsed)) {
                        seasonsText = parsed.map(s => `Season ${s}`).join(", ");
                    }
                }
            } catch {
                seasonsText = request.seasons;
            }
        }

        const posterUrl = request.posterPath 
            ? (request.posterPath.startsWith("http") ? request.posterPath : `https://image.tmdb.org/t/p/w500${request.posterPath}`)
            : "";

        const commonVars = {
            title: request.title,
            releaseYear: yearStr,
            mediaType: request.mediaType,
            mediaLabel,
            quality: qualityStr,
            section: sectionStr,
            contentRating: request.contentRating || "NR",
            overview: request.overview || "No overview available.",
            seasons: seasonsText || "N/A",
            posterUrl,
            appUrl,
            manageUrl: `${appUrl}/requests`,
            plexUrl: extra?.plexUrl || `${appUrl}/requests`,
            declineReason: extra?.declineReason || "Request declined by server administrator.",
            errorMessage: extra?.errorMessage || "Unknown dispatch or download error."
        };

        if (event === "PENDING") {
            // Send alert to all Admin accounts
            const admins = await prisma.user.findMany({
                where: { role: { in: ["ADMIN", "SUPER_USER"] } }
            });

            if (admins.length === 0) return { success: true };

            const { subject, html } = await renderEmailTemplate("seerr_request_new_admin", {
                ...commonVars,
                requestedBy: request.requestedByUsername
            });

            for (const admin of admins) {
                if (!admin.email || !admin.email.includes("@")) continue;
                await transporter.sendMail({
                    from: senderEmail,
                    to: admin.email,
                    subject,
                    html
                }).catch(e => logger.addLog("WARN", "SEERR-EMAIL", `Failed sending admin email to ${admin.email}: ${e.message}`));
            }

            logger.addLog("INFO", "SEERR-EMAIL", `Dispatched admin request notification for "${request.title}"`);
            return { success: true };
        }

        // For user events: look up requester's email
        let requesterUser: any = null;
        if (request.requestedByUserId) {
            requesterUser = await prisma.user.findUnique({ where: { id: request.requestedByUserId } });
        }
        if (!requesterUser && request.requestedByUsername) {
            requesterUser = await prisma.user.findUnique({ where: { username: request.requestedByUsername } });
        }

        if (!requesterUser || !requesterUser.email || !requesterUser.email.includes("@")) {
            logger.addLog("INFO", "SEERR-EMAIL", `No valid email for user ${request.requestedByUsername}. Skipping user email.`);
            return { success: true };
        }

        let templateId = "seerr_request_approved";
        switch (event) {
            case "AUTO_APPROVED":
                templateId = "seerr_request_auto_approved";
                break;
            case "APPROVED":
                templateId = "seerr_request_approved";
                break;
            case "DECLINED":
                templateId = "seerr_request_declined";
                break;
            case "AVAILABLE":
                templateId = "seerr_request_available";
                break;
            case "FAILED":
                templateId = "seerr_request_failed";
                break;
        }

        const { subject, html } = await renderEmailTemplate(templateId, {
            ...commonVars,
            username: requesterUser.username,
            requestedBy: requesterUser.username
        });

        await transporter.sendMail({
            from: senderEmail,
            to: requesterUser.email,
            subject,
            html
        });

        logger.addLog("INFO", "SEERR-EMAIL", `Dispatched ${templateId} email to ${requesterUser.email} for "${request.title}"`);
        return { success: true };
    } catch (e: any) {
        logger.addLog("ERROR", "SEERR-EMAIL", `Failed sending Seerr email notification: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * Unified helper to trigger both Discord Webhook and Email notifications asynchronously
 */
export async function notifyMediaRequestEvent(
    event: SeerrNotificationEvent,
    requestId: string,
    extra?: SeerrNotificationExtra
): Promise<void> {
    try {
        const req = await prisma.mediaRequest.findUnique({
            where: { id: requestId }
        });

        if (!req) return;

        const payload: SeerrNotificationPayload = {
            id: req.id,
            mediaType: req.mediaType,
            tmdbId: req.tmdbId,
            tvdbId: req.tvdbId,
            imdbId: req.imdbId,
            title: req.title,
            releaseYear: req.releaseYear,
            posterPath: req.posterPath,
            backdropPath: req.backdropPath,
            overview: req.overview,
            status: req.status,
            is4k: req.is4k,
            isKids: req.isKids,
            contentRating: req.contentRating,
            requestedByUsername: req.requestedByUsername,
            requestedByUserId: req.requestedByUserId,
            seasons: req.seasons
        };

        // Fire both Discord Webhook and Email in parallel in the background
        Promise.all([
            sendSeerrDiscordWebhook(event, payload, extra).catch(e => {
                logger.addLog("ERROR", "SEERR-NOTIFY", `Discord error: ${e?.message || e}`);
            }),
            sendSeerrEmailNotification(event, payload, extra).catch(e => {
                logger.addLog("ERROR", "SEERR-NOTIFY", `Email error: ${e?.message || e}`);
            })
        ]).catch(() => {});
    } catch (e: any) {
        logger.addLog("ERROR", "SEERR-NOTIFY", `Failed executing notifyMediaRequestEvent: ${e.message}`);
    }
}
