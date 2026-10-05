import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import { prisma } from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";

export interface AmazonBounceMatch {
    isBounce: boolean;
    reason: string;
    subject: string;
    from: string;
    date: Date;
    bodySnippet: string;
}

/**
 * Resolves IMAP connection settings by checking configured Email Sources
 * or inferring IMAP settings from primary SMTP credentials.
 */
export async function resolveKindleImapConfig() {
    const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    
    // 1. Check if there are active PaymentEmailSource entries in SQLite
    const sources = await prisma.paymentEmailSource.findMany({
        where: { enabled: true },
        orderBy: { createdAt: "desc" }
    });
    
    if (sources.length > 0) {
        const targetUser = (settings?.smtpUser || settings?.smtpFrom || "").toLowerCase();
        const matched = sources.find(s => s.user.toLowerCase() === targetUser);
        const chosen = matched || sources[0];
        
        return {
            host: chosen.host,
            port: chosen.port,
            secure: chosen.secure,
            user: chosen.user,
            pass: decryptData(chosen.pass),
            sourceName: chosen.name
        };
    }

    // 2. Derive IMAP config from primary server SMTP credentials
    if (settings?.smtpUser && settings?.smtpPass) {
        let host = settings.smtpHost || "imap.gmail.com";
        const port = 993;
        const secure = true;

        const lowerHost = (settings.smtpHost || "").toLowerCase();
        if (lowerHost.includes("gmail")) {
            host = "imap.gmail.com";
        } else if (lowerHost.includes("office365") || lowerHost.includes("outlook") || lowerHost.includes("live.com")) {
            host = "outlook.office365.com";
        } else if (lowerHost.includes("yahoo")) {
            host = "imap.mail.yahoo.com";
        } else if (lowerHost.includes("mail.me.com") || lowerHost.includes("icloud")) {
            host = "imap.mail.me.com";
        } else if (lowerHost.startsWith("smtp.")) {
            host = lowerHost.replace(/^smtp\./, "imap.");
        }

        return {
            host,
            port,
            secure,
            user: settings.smtpUser,
            pass: decryptData(settings.smtpPass),
            sourceName: "Primary SMTP Account"
        };
    }

    return null;
}

/**
 * Detects whether an incoming email represents an Amazon Send-to-Kindle delivery failure or rejection
 */
export function parseAmazonBounceEmail(parsed: ParsedMail): AmazonBounceMatch | null {
    const from = (parsed.from?.text || "").toLowerCase();
    const subject = (parsed.subject || "").toLowerCase();
    const text = (parsed.text || "").toLowerCase();

    const isFromAmazon = from.includes("amazon") || from.includes("kindle") || from.includes("postmaster") || from.includes("mailer-daemon");
    const hasAmazonKeywords = subject.includes("kindle") || subject.includes("personal document") || text.includes("kindle") || text.includes("personal document");

    if (!isFromAmazon && !hasAmazonKeywords) {
        return null;
    }

    // Indicators of rejection / non-approved sender
    const isNotApprovedSender = 
        text.includes("approved e-mail") ||
        text.includes("approved personal document") ||
        text.includes("not on your approved") ||
        text.includes("not authorized to send documents") ||
        subject.includes("did not have an approved sender address") ||
        subject.includes("not authorized");

    const isFormatIssue = 
        text.includes("unsupported file format") ||
        text.includes("problem with the document") ||
        text.includes("could not be delivered") ||
        subject.includes("problem with your document") ||
        subject.includes("could not be delivered");

    const isBounce = isNotApprovedSender || isFormatIssue || subject.includes("undeliverable") || text.includes("delivery failure");

    if (!isBounce) {
        return null;
    }

    let reason = "Amazon rejected Kindle document delivery.";
    if (isNotApprovedSender) {
        reason = "Sender address is not on your Amazon Approved Personal Document E-mail List. Add your server sender address in Amazon Manage Your Content and Devices > Preferences.";
    } else if (isFormatIssue) {
        reason = "Amazon Send-to-Kindle rejected document format or structure.";
    } else if (parsed.text) {
        const cleaned = parsed.text.replace(/\s+/g, " ").trim();
        reason = cleaned.substring(0, 160) + (cleaned.length > 160 ? "..." : "");
    }

    return {
        isBounce: true,
        reason,
        subject: parsed.subject || "Amazon Send-to-Kindle Notice",
        from: parsed.from?.text || "kindle-cs@amazon.com",
        date: parsed.date || new Date(),
        bodySnippet: (parsed.text || "").substring(0, 300)
    };
}

/**
 * Scans the IMAP inbox for Amazon Send-to-Kindle failure emails and reconciles
 * any failed deliveries with KindleDeliveryLog in SQLite.
 */
export async function scanKindleBouncesInternal(options?: {
    lookbackMinutes?: number;
    forceCheckAll?: boolean;
}): Promise<{
    success: boolean;
    checked: number;
    bouncesFound: number;
    message?: string;
    error?: string;
}> {
    const lookbackMin = options?.lookbackMinutes || 30;
    const cutoff = new Date(Date.now() - lookbackMin * 60 * 1000);

    // Find active delivered logs within the monitoring window
    const whereClause: any = {
        createdAt: { gte: cutoff }
    };
    if (!options?.forceCheckAll) {
        whereClause.status = "DELIVERED";
    }

    const deliveries = await prisma.kindleDeliveryLog.findMany({
        where: whereClause,
        orderBy: { createdAt: "desc" }
    });

    if (deliveries.length === 0 && !options?.forceCheckAll) {
        return {
            success: true,
            checked: 0,
            bouncesFound: 0,
            message: "No recent Kindle deliveries in monitoring window."
        };
    }

    const imapConfig = await resolveKindleImapConfig();
    if (!imapConfig) {
        return {
            success: false,
            checked: deliveries.length,
            bouncesFound: 0,
            message: "",
            error: "No IMAP credentials available. Please configure SMTP credentials or an Email Source in Settings to scan for Amazon bounces."
        };
    }

    let client: ImapFlow | null = null;
    let bouncesFound = 0;

    try {
        client = new ImapFlow({
            host: imapConfig.host,
            port: imapConfig.port,
            secure: imapConfig.secure,
            auth: {
                user: imapConfig.user,
                pass: imapConfig.pass
            },
            logger: false
        });

        await client.connect();
        const lock = await client.getMailboxLock("INBOX");

        try {
            // Fetch messages since cutoff (with 10-min safety buffer)
            const sinceDate = new Date(cutoff.getTime() - 10 * 60 * 1000);
            const messages = client.fetch(
                { since: sinceDate },
                { uid: true, envelope: true, source: true }
            );

            for await (const msg of messages) {
                if (!msg.source) continue;
                let parsed: ParsedMail;
                try {
                    parsed = await simpleParser(msg.source);
                } catch {
                    continue;
                }

                const bounce = parseAmazonBounceEmail(parsed);
                if (!bounce) continue;

                const fullText = `${bounce.subject} ${parsed.text || ""}`.toLowerCase();

                for (const delivery of deliveries) {
                    const titleMatch = delivery.bookTitle && fullText.includes(delivery.bookTitle.toLowerCase());
                    const emailMatch = delivery.recipientEmail && fullText.includes(delivery.recipientEmail.toLowerCase());
                    
                    const isMatch = titleMatch || emailMatch || (deliveries.length === 1 && Math.abs(bounce.date.getTime() - delivery.createdAt.getTime()) < 30 * 60 * 1000);

                    if (isMatch && delivery.status !== "FAILED") {
                        bouncesFound++;
                        await prisma.kindleDeliveryLog.update({
                            where: { id: delivery.id },
                            data: {
                                status: "FAILED",
                                errorMessage: bounce.reason,
                                diagnostics: JSON.stringify({
                                    detectedBy: "IMAP Amazon Bounce Scanner",
                                    bounceSubject: bounce.subject,
                                    bounceFrom: bounce.from,
                                    bounceDate: bounce.date.toISOString(),
                                    bodySnippet: bounce.bodySnippet
                                })
                            }
                        });

                        logger.addLog("ERROR", "KINDLE", `🔴 Amazon Send-to-Kindle rejection detected for "${delivery.bookTitle}" (to ${delivery.recipientEmail}): ${bounce.reason}`);
                    }
                }
            }
        } finally {
            lock.release();
        }

        await client.logout();
        return {
            success: true,
            checked: deliveries.length,
            bouncesFound,
            message: bouncesFound > 0
                ? `Detected ${bouncesFound} Amazon delivery rejection(s) and updated delivery logs.`
                : `Inbox scanned successfully (${deliveries.length} delivery checked, zero Amazon bounces).`
        };
    } catch (err: any) {
        console.error("[KINDLE-EMAIL-SCANNER] Error:", err.message || err);
        return {
            success: false,
            checked: deliveries.length,
            bouncesFound,
            message: "",
            error: `Failed to connect or scan IMAP inbox: ${err.message || String(err)}`
        };
    } finally {
        if (client) {
            try { await client.logout(); } catch {}
        }
    }
}
