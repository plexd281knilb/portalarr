import path from "path";
import os from "os";
import nodemailer from "nodemailer";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveSenderAddress, resolveEmailProviderConfig } from "@/lib/email-templates";
import { notifyAdminsOnPendingApproval } from "@/lib/admin-approvals";
import { resolveContainedPath } from "@/lib/book-route-auth";

export function getNotificationCategoryForTemplate(templateId?: string): {
    field: "emailRequestApproved" | "emailMediaReady" | "emailSubscriptionReminders" | "emailAnnouncements" | "emailSupportTickets" | "emailReferralRewards";
    label: string;
} | null {
    if (!templateId) return null;

    if (
        templateId === "seerr_request_approved" ||
        templateId === "seerr_request_auto_approved" ||
        templateId === "seerr_request_declined" ||
        templateId === "seerr_request_failed" ||
        templateId === "media_request_approved" ||
        templateId === "request_approved" ||
        templateId === "book_request_approved"
    ) {
        return { field: "emailRequestApproved", label: "Media Request Approvals" };
    }

    if (
        templateId === "seerr_request_available" ||
        templateId === "media_ready" ||
        templateId === "book_ready"
    ) {
        return { field: "emailMediaReady", label: "Media Available & Ready to Stream" };
    }

    if (
        templateId.startsWith("subscription_renewal_reminder") ||
        templateId === "trial_expiring_soon" ||
        templateId === "trial_expired" ||
        templateId === "subscription_expired" ||
        templateId === "subscription_activated" ||
        templateId === "payment_received" ||
        templateId === "payment_underpayment" ||
        templateId === "payment_reminder"
    ) {
        return { field: "emailSubscriptionReminders", label: "Subscription & Renewal Reminders" };
    }

    if (
        templateId === "broadcast" ||
        templateId === "new_site_launch" ||
        templateId === "maintenance_announcement" ||
        templateId === "server_update"
    ) {
        return { field: "emailAnnouncements", label: "Server Announcements & Maintenance" };
    }

    if (
        templateId === "ticket_update" ||
        templateId === "ticket_reply" ||
        templateId === "support_ticket_update"
    ) {
        return { field: "emailSupportTickets", label: "Support Ticket Responses" };
    }

    if (
        templateId === "referral_reward_credited" ||
        templateId === "referral_bonus" ||
        templateId === "referral_invite"
    ) {
        return { field: "emailReferralRewards", label: "Referral Rewards & Community Credits" };
    }

    return null;
}

export async function getLinkedEmailCategoryForTemplate(templateId?: string): Promise<string | null> {
    if (!templateId) return null;
    const t = templateId.toLowerCase();

    if (
        t.startsWith("subscription_renewal_reminder") ||
        t.includes("payment_reminder") ||
        t.includes("payment_confirmed") ||
        t.includes("payment_received") ||
        t.includes("payment_underpayment") ||
        t.includes("subscription_activated") ||
        t.includes("trial_expiring") ||
        t.includes("trial_expired") ||
        t.includes("subscription_expired") ||
        t.includes("payment_receipt")
    ) {
        return "receiveSubscriptionReminders";
    }

    if (
        t === "broadcast" ||
        t === "new_site_launch" ||
        t === "maintenance_announcement" ||
        t === "server_update" ||
        t === "announcement"
    ) {
        return "receiveAnnouncements";
    }

    if (
        t === "media_ready" ||
        t === "book_ready" ||
        t === "seerr_request_available"
    ) {
        return "receiveMediaReady";
    }

    if (
        t === "seerr_request_approved" ||
        t === "seerr_request_auto_approved" ||
        t === "seerr_request_declined" ||
        t === "seerr_request_failed" ||
        t === "request_approved"
    ) {
        return "receiveRequestApproved";
    }

    if (t.includes("new_content") || t.includes("weekly_digest")) {
        return "receiveNewContent";
    }

    if (t.includes("ticket")) {
        return "receiveSupportTickets";
    }

    return null;
}

async function isAttachmentPathAllowed(rawAttachmentPath: string): Promise<boolean> {
    if (!rawAttachmentPath || typeof rawAttachmentPath !== "string" || rawAttachmentPath.includes("\0")) {
        return false;
    }
    const resolved = path.resolve(/*turbopackIgnore: true*/ rawAttachmentPath);
    const allowedRoots: string[] = [
        path.resolve(/*turbopackIgnore: true*/ process.cwd(), "data"),
        path.resolve(/*turbopackIgnore: true*/ os.tmpdir()),
    ];
    try {
        const libraries = await prisma.library.findMany({ select: { path: true } });
        for (const lib of libraries) {
            if (lib.path && lib.path.trim()) {
                allowedRoots.push(path.resolve(/*turbopackIgnore: true*/ lib.path));
            }
        }
    } catch {}

    return allowedRoots.some((root) => {
        if (!root) return false;
        const rel = path.relative(root, resolved);
        if (!rel || rel === "") return false;
        return !rel.startsWith("..") && !path.isAbsolute(rel) && resolveContainedPath(root, rel) !== null;
    });
}

export async function sendOrQueueEmail(options: {
    to: string | string[];
    subject: string;
    html: string;
    text?: string;
    templateId?: string;
    from?: string;
    targetUser?: string;
    userId?: string;
    bypassApproval?: boolean;
    skipAdminAlert?: boolean;
    attachments?: Array<{ filename: string; path: string; contentType?: string }>;
    sendMode?: "AUTOMATIC" | "APPROVED_AND_SENT";
    approvalId?: string;
    approvedBy?: string;
    approvedAt?: Date;
    isLinkedInboxDispatch?: boolean;
}): Promise<{ success: boolean; queued?: boolean; sent?: boolean; approvalId?: string; error?: string; logId?: string }> {
    try {
        if (options.attachments && options.attachments.length > 0) {
            for (const att of options.attachments) {
                if (!(await isAttachmentPathAllowed(att?.path))) {
                    return { success: false, error: "Forbidden attachment path" };
                }
            }
        }

        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const recipientStr = Array.isArray(options.to) ? options.to.join(", ") : options.to;
        const isExplicitAdminDispatch =
            options.templateId === "broadcast" ||
            options.templateId === "new_site_launch" ||
            options.templateId === "manual_email";

        const adminUsers = await prisma.user.findMany({
            where: { role: "ADMIN" },
            select: { email: true }
        });
        const adminEmailSet = new Set<string>(
            adminUsers.map(u => (u.email || "").trim().toLowerCase()).filter(Boolean)
        );
        if (settings?.smtpUser) {
            adminEmailSet.add(settings.smtpUser.trim().toLowerCase());
        }
        const ADMIN_ALERT_TEMPLATES = new Set([
            "admin_new_user",
            "admin_user_access_revoked",
            "admin_payment_received",
            "admin_approval",
            "media_request_admin",
            "seerr_request_new_admin",
            "ticket_error_alert",
            "library_access_request"
        ]);
        const recipientList = (Array.isArray(options.to) ? options.to : [options.to])
            .map(e => (e || "").trim().toLowerCase())
            .filter(Boolean);
        const isToAdminOnly =
            (recipientList.length > 0 && recipientList.every(e => adminEmailSet.has(e))) ||
            (options.templateId ? ADMIN_ALERT_TEMPLATES.has(options.templateId) : false);

        let targetUserRecord: any = null;
        if (options.userId) {
            targetUserRecord = await prisma.user.findUnique({
                where: { id: options.userId },
                include: { notificationPreference: true, linkedEmails: true }
            }).catch(() => null);
        }
        if (!targetUserRecord && options.targetUser) {
            targetUserRecord = await prisma.user.findFirst({
                where: { username: options.targetUser },
                include: { notificationPreference: true, linkedEmails: true }
            }).catch(() => null);
        }
        if (!targetUserRecord && options.to) {
            const toEmail = Array.isArray(options.to) ? options.to[0] : options.to;
            if (toEmail && typeof toEmail === "string") {
                targetUserRecord = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { email: toEmail.trim().toLowerCase() },
                            { plexEmail: toEmail.trim().toLowerCase() }
                        ]
                    },
                    include: { notificationPreference: true, linkedEmails: true }
                }).catch(() => null);
            }
        }

        if (settings?.emailNotificationsEnabled === false && !options.bypassApproval && !isExplicitAdminDispatch && !isToAdminOnly) {
            logger.addLog("INFO", "EMAIL", `Email notifications globally disabled in settings. Skipping email "${options.subject}" to ${recipientStr}`);
            console.log(`[EMAIL-GATE] Email notifications globally disabled. Skipping email: "${options.subject}"`);
            return { success: true, sent: false, queued: false };
        }

        let skipPrimaryOptOut = false;
        if (!options.isLinkedInboxDispatch && !isToAdminOnly && options.templateId && options.templateId !== "manual_email") {
            const notifCategory = getNotificationCategoryForTemplate(options.templateId);
            if (notifCategory && targetUserRecord?.notificationPreference) {
                const isPrefEnabled = (targetUserRecord.notificationPreference as any)[notifCategory.field];
                if (isPrefEnabled === false) {
                    skipPrimaryOptOut = true;
                    logger.addLog(
                        "INFO",
                        "EMAIL",
                        `[USER-PREFERENCE-GATE] User "${targetUserRecord.username}" opted out of ${notifCategory.label} emails for primary inbox. Evaluating linked inboxes before skipping "${options.subject}".`
                    );
                }
            }
        }

        const dispatchLinkedInboxes = async () => {
            if (!options.isLinkedInboxDispatch && !isToAdminOnly && options.templateId && targetUserRecord?.id) {
                const linkedCategory = await getLinkedEmailCategoryForTemplate(options.templateId);
                if (linkedCategory) {
                    try {
                        const linkedInboxes = (targetUserRecord.linkedEmails && targetUserRecord.linkedEmails.length > 0)
                            ? targetUserRecord.linkedEmails.filter((l: any) => Boolean(l[linkedCategory]) && (!l.verificationToken || l.isVerified))
                            : await prisma.userLinkedEmail.findMany({
                                where: {
                                    userId: targetUserRecord.id,
                                    [linkedCategory]: true,
                                    OR: [{ verificationToken: null }, { isVerified: true }]
                                }
                            });

                        for (const linked of linkedInboxes) {
                            const cleanLinkedEmail = (linked.email || "").trim().toLowerCase();
                            if (cleanLinkedEmail && !recipientList.includes(cleanLinkedEmail)) {
                                const linkedNote = `<div style="margin-bottom:14px;padding:8px 12px;background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.25);border-radius:8px;font-size:12px;color:#94a3b8;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">📬 Delivered to linked inbox <strong>${cleanLinkedEmail}</strong>${linked.label ? ` (${linked.label})` : ""} for <strong>${targetUserRecord.name || targetUserRecord.username}</strong></div>`;
                                const linkedHtml = options.html ? (linkedNote + options.html) : options.html;

                                await sendOrQueueEmail({
                                    ...options,
                                    to: cleanLinkedEmail,
                                    html: linkedHtml,
                                    isLinkedInboxDispatch: true,
                                    skipAdminAlert: true
                                }).catch(err => {
                                    console.warn(`[LINKED-INBOX-DISPATCH-ERROR] Failed to dispatch to linked inbox ${cleanLinkedEmail}:`, err?.message || err);
                                });
                            }
                        }
                    } catch (linkedErr: any) {
                        console.warn("[LINKED-INBOX-FANOUT-ERROR]:", linkedErr?.message || linkedErr);
                    }
                }
            }
        };

        if (skipPrimaryOptOut) {
            await dispatchLinkedInboxes();
            return { success: true, sent: false, queued: false };
        }

        let requireApproval = false;
        if (!options.bypassApproval && !isToAdminOnly) {
            const globalEmailApproval = settings?.requireApprovalForEmails ?? true;
            if (globalEmailApproval) {
                let policy: Record<string, boolean> = {};
                try {
                    if (settings?.emailApprovalPolicy) {
                        policy = JSON.parse(settings.emailApprovalPolicy);
                    }
                } catch {}

                if (options.templateId && policy[options.templateId] !== undefined) {
                    requireApproval = Boolean(policy[options.templateId]);
                } else {
                    requireApproval = true;
                }
            }
        }

        const emailConfig = resolveEmailProviderConfig(settings);
        const host = emailConfig.host;
        const port = emailConfig.port;
        const secure = emailConfig.secure;
        const user = emailConfig.user;
        const pass = emailConfig.pass;
        const defaultFrom = emailConfig.from;

        const resolvedSender = options.from
            ? { formatted: options.from, email: options.from, displayName: "DomsHomeLab" }
            : resolveSenderAddress(options.templateId, defaultFrom);
        const senderEmail = resolvedSender.formatted;

        if (requireApproval) {
            const attachmentNote = options.attachments && options.attachments.length > 0 ? ` [${options.attachments.length} attachment(s)]` : "";
            const approval = await prisma.adminApproval.create({
                data: {
                    type: "EMAIL",
                    status: "PENDING",
                    title: `Email: ${options.subject}`,
                    description: `To: ${recipientStr}${attachmentNote}`,
                    targetUser: options.targetUser || null,
                    targetEmail: Array.isArray(options.to) ? options.to[0] : options.to,
                    userId: options.userId || null,
                    payload: JSON.stringify({
                        to: options.to,
                        from: senderEmail,
                        subject: options.subject,
                        html: options.html,
                        text: options.text,
                        templateId: options.templateId,
                        targetUser: options.targetUser,
                        attachments: options.attachments
                    })
                }
            });
            logger.addLog("INFO", "APPROVAL", `Email "${options.subject}" to ${recipientStr} queued for admin approval (ID: ${approval.id}).`);
            logger.addLog("INFO", "EMAIL", `Email "${options.subject}" to ${recipientStr} staged in Admin Approval Queue (ID: ${approval.id}).`);
            if (!options.skipAdminAlert) {
                notifyAdminsOnPendingApproval(approval).catch(e => console.warn("[APPROVAL-NOTIFY-ERROR]:", e?.message || e));
            }
            return { success: true, queued: true, approvalId: approval.id };
        }

        if (!host || !user || !pass) {
            logger.addLog("WARN", "EMAIL", `Failed to dispatch email "${options.subject}" to ${recipientStr}: SMTP / Resend delivery settings not configured`);
            return { success: false, error: "Email delivery provider settings not configured" };
        }

        const transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass }
        });

        await transporter.sendMail({
            from: senderEmail,
            to: Array.isArray(options.to) ? options.to.join(", ") : options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            attachments: options.attachments
        });

        const effectiveMode = options.sendMode || (options.bypassApproval && options.approvalId ? "APPROVED_AND_SENT" : "AUTOMATIC");
        let bodyPreview = options.text;
        if (!bodyPreview && options.html) {
            bodyPreview = options.html
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
                .replace(/<[^>]+>/g, " ")
                .replace(/\s+/g, " ")
                .trim();
        }
        if (bodyPreview && bodyPreview.length > 300) {
            bodyPreview = bodyPreview.slice(0, 300) + "...";
        }

        let createdLog: any = null;
        try {
            createdLog = await prisma.sentEmailLog.create({
                data: {
                    recipient: recipientStr,
                    recipientName: options.targetUser || null,
                    userId: options.userId || null,
                    subject: options.subject,
                    bodyPreview: bodyPreview || null,
                    html: options.html,
                    templateId: options.templateId || "general",
                    sendMode: effectiveMode,
                    status: "SENT",
                    approvalId: options.approvalId || null,
                    approvedBy: options.approvedBy || null,
                    approvedAt: options.approvedAt || null,
                    sentAt: new Date()
                }
            });
        } catch (logErr: any) {
            console.warn("[SENT-EMAIL-LOG-ERROR]:", logErr.message || logErr);
        }

        logger.addLog("INFO", "EMAIL", `Dispatched email "${options.subject}" to ${recipientStr} (${effectiveMode === "APPROVED_AND_SENT" ? "Approved by Admin" : "Automatic"})`);

        await dispatchLinkedInboxes();

        return { success: true, sent: true, logId: createdLog?.id };
    } catch (e: any) {
        const recipientStr = Array.isArray(options.to) ? options.to.join(", ") : options.to;
        const effectiveMode = options.sendMode || (options.bypassApproval && options.approvalId ? "APPROVED_AND_SENT" : "AUTOMATIC");
        try {
            let bodyPreview = options.text;
            if (!bodyPreview && options.html) {
                bodyPreview = options.html
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
                    .replace(/<[^>]+>/g, " ")
                    .replace(/\s+/g, " ")
                    .trim();
            }
            if (bodyPreview && bodyPreview.length > 300) {
                bodyPreview = bodyPreview.slice(0, 300) + "...";
            }
            await prisma.sentEmailLog.create({
                data: {
                    recipient: recipientStr,
                    recipientName: options.targetUser || null,
                    userId: options.userId || null,
                    subject: options.subject,
                    bodyPreview: bodyPreview || null,
                    html: options.html,
                    templateId: options.templateId || "general",
                    sendMode: effectiveMode,
                    status: "FAILED",
                    error: e.message || String(e),
                    approvalId: options.approvalId || null,
                    approvedBy: options.approvedBy || null,
                    approvedAt: options.approvedAt || null,
                    sentAt: new Date()
                }
            });
        } catch {}
        logger.addLog("ERROR", "EMAIL", `Failed to dispatch email "${options.subject}" to ${recipientStr}: ${e.message || e}`);
        console.error("[EMAIL-GATE-ERROR]:", e.message || e);
        return { success: false, error: e.message || "Failed to send or queue email" };
    }
}
