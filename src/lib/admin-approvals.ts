import prisma from "@/lib/prisma";
import { getAppUrl } from "@/lib/app-url";
import { logger } from "@/lib/logger";
import { decryptData } from "@/lib/encryption";
import { postDiscordMessage, type DiscordEmbed } from "@/lib/discord/discord-bot";
import { wrapInPortalarrEmailLayout, renderEmailTemplate, resolveSenderAddress, resolveEmailProviderConfig } from "@/lib/email-templates";
import nodemailer from "nodemailer";

export interface ApprovalNotifyResult {
    success: boolean;
    adminsNotified: number;
    discordNotified: boolean;
}

/**
 * Dispatches automated notifications to administrators whenever an action or email
 * is held in the Action Approval Queue awaiting review.
 */
export async function notifyAdminsOnPendingApproval(approval: {
    id: string;
    type: string;
    title: string;
    description?: string | null;
    targetUser?: string | null;
    targetEmail?: string | null;
    userId?: string | null;
    payload?: string | null;
}): Promise<ApprovalNotifyResult> {
    // 1. Suppress notifications during test runs or if disabled
    if (
        process.env.NODE_ENV === "test" || 
        process.env.PORTALARR_TEST === "true" || 
        process.env.DISABLE_DISCORD_NOTIFICATIONS === "true"
    ) {
        return { success: true, adminsNotified: 0, discordNotified: false };
    }

    let discordNotified = false;
    let adminsNotified = 0;

    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } }) || await prisma.settings.findFirst();
        if (!settings || settings.notifyAdminOnPendingApproval === false) {
            return { success: true, adminsNotified: 0, discordNotified: false };
        }

        const appUrl = await getAppUrl();
        const approvalsUrl = `${appUrl}/settings/access?tab=approvals`;

        let typeBadge = "⚖️ Action Gate";
        if (approval.type === "EMAIL") {
            typeBadge = "✉️ Outgoing Email";
        } else if (approval.type === "PLEX_ACCESS_GRANT") {
            typeBadge = "🟢 Plex Library Grant";
        } else if (approval.type === "PLEX_ACCESS_REVOKE") {
            typeBadge = "🔴 Plex Library Revocation";
        }

        const targetDisplay = approval.targetUser ? `@${approval.targetUser}` : (approval.targetEmail || "System Target");

        // 1. DISCORD NOTIFICATION (Bot or Webhook)
        if (settings.adminApprovalDiscordNotify !== false) {
            const webhookUrl = settings.seerrDiscordWebhookUrl?.trim();
            const botToken = settings.discordBotToken;
            const channelId = settings.discordStatusChannelId || settings.discordRequestsChannelId;

            if (webhookUrl || (botToken && channelId)) {
                const embed: DiscordEmbed = {
                    title: `⚖️ Action Approval Required: ${approval.title}`,
                    description: approval.description || "An action has been staged in the Action Approval Queue awaiting administrator review.",
                    color: 0xF59E0B, // Amber
                    url: approvalsUrl,
                    fields: [
                        { name: "Action Type", value: typeBadge, inline: true },
                        { name: "Target User / Entity", value: `\`${targetDisplay}\``, inline: true },
                        { name: "Queue Status", value: "⏳ Pending Review", inline: true }
                    ],
                    footer: { text: "DomsHomeLab (d281knilb) Governance • Click title link above to review & approve" },
                    timestamp: new Date().toISOString()
                };

                if (botToken && channelId) {
                    await postDiscordMessage({
                        botToken,
                        channelId,
                        embeds: [embed]
                    }).catch(e => {
                        console.warn("[DISCORD-APPROVAL-NOTIFY-BOT-ERROR]:", e?.message || e);
                    });
                } else if (webhookUrl) {
                    await fetch(webhookUrl, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            embeds: [embed]
                        }),
                        signal: AbortSignal.timeout(10000)
                    }).catch(e => {
                        console.warn("[DISCORD-APPROVAL-NOTIFY-WEBHOOK-ERROR]:", e?.message || e);
                    });
                }

                logger.addLog("INFO", "APPROVAL", `Dispatched Discord approval alert for "${approval.title}" (Target: ${targetDisplay})`);
                discordNotified = true;
            }
        }

        // 2. SMTP / RESEND ADMIN EMAIL ALERT
        const emailConfig = resolveEmailProviderConfig(settings);

        if (
            settings.adminApprovalEmailNotify !== false && 
            emailConfig.isConfigured
        ) {
            // Find all administrators with valid email addresses
            const admins = await prisma.user.findMany({
                where: {
                    role: { in: ["ADMIN", "SUPER_USER"] },
                    email: { not: "" }
                },
                select: { id: true, email: true, username: true }
            });

            if (admins.length > 0) {
                const resolvedSender = resolveSenderAddress("admin_approval", emailConfig.from);
                const senderEmail = resolvedSender.formatted;
                
                const transporter = nodemailer.createTransport({
                    host: emailConfig.host,
                    port: emailConfig.port,
                    secure: emailConfig.secure,
                    auth: {
                        user: emailConfig.user,
                        pass: emailConfig.pass
                    }
                });

                for (const admin of admins) {
                    if (!admin.email) continue;

                    const { subject: approvalSubject, html: finalHtml } = await renderEmailTemplate("admin_approval", {
                        adminName: admin.username,
                        actionTitle: approval.title,
                        actionType: typeBadge,
                        targetDisplay: targetDisplay,
                        details: approval.description || "No additional parameters",
                        approvalsUrl,
                        appUrl
                    }, {
                        actionButton: {
                            text: "Open Approval Queue",
                            url: approvalsUrl,
                            color: "#0284c7"
                        }
                    });

                    await transporter.sendMail({
                        from: senderEmail,
                        to: admin.email,
                        subject: approvalSubject,
                        html: finalHtml,
                        text: `Approval Required: ${approval.title} - ${approval.description || ""}\nReview at: ${approvalsUrl}`
                    }).catch(e => {
                        console.warn(`[EMAIL-APPROVAL-NOTIFY-SEND-ERROR] Failed sending alert to ${admin.email}:`, e?.message || e);
                    });

                    try {
                        await prisma.sentEmailLog.create({
                            data: {
                                recipient: admin.email,
                                recipientName: admin.username,
                                userId: admin.id,
                                subject: approvalSubject,
                                bodyPreview: `Approval Required: ${approval.title} - ${approval.description || ""}`.slice(0, 300),
                                html: finalHtml,
                                templateId: "admin_approval",
                                sendMode: "AUTOMATIC",
                                status: "SENT",
                                approvalId: approval.id,
                                sentAt: new Date()
                            }
                        });
                    } catch (logErr) {
                        console.warn("[SENT-EMAIL-LOG-APPROVAL-ALERT-ERROR]:", logErr);
                    }
                }

                logger.addLog("INFO", "APPROVAL", `Dispatched email approval alerts to ${admins.length} administrator(s) for "${approval.title}"`);
                adminsNotified = admins.length;
            }
        }

        return { success: true, adminsNotified, discordNotified };
    } catch (e: any) {
        console.error("[NOTIFY-ADMINS-ON-PENDING-APPROVAL-ERROR]:", e.message || e);
        return { success: false, adminsNotified: 0, discordNotified: false };
    }
}
