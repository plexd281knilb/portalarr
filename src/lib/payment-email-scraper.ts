import { ImapFlow } from "imapflow";
import { simpleParser, ParsedMail } from "mailparser";
import prisma from "@/lib/prisma";
import { decryptData, encryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { addYears, addMonths } from "date-fns";

export interface ScrapedPayment {
    provider: "VENMO" | "PAYPAL" | "ZELLE" | "CASHAPP" | "OTHER";
    externalTxId?: string;
    senderName?: string;
    senderEmail?: string;
    senderHandle?: string;
    amount: number;
    currency: string;
    note?: string;
    emailSubject: string;
    emailDate: Date;
    emailUid: string;
    rawSnippet?: string;
}

/**
 * Test IMAP connection to an email source
 */
export async function testPaymentEmailConnection(config: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    mailbox?: string;
}): Promise<{ success: boolean; message: string; mailboxCount?: number }> {
    const client = new ImapFlow({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: {
            user: config.user,
            pass: config.pass
        },
        logger: false
    });

    try {
        await client.connect();
        const mailboxName = config.mailbox || "INBOX";
        const lock = await client.getMailboxLock(mailboxName);
        let count = 0;
        try {
            const status = await client.status(mailboxName, { messages: true, unseen: true });
            count = status.messages || 0;
        } finally {
            lock.release();
        }
        await client.logout();
        return {
            success: true,
            message: `Successfully connected to ${config.host} as ${config.user}. Mailbox "${mailboxName}" contains ${count} messages.`,
            mailboxCount: count
        };
    } catch (err: any) {
        try {
            await client.logout();
        } catch (_) {}
        return {
            success: false,
            message: `Connection failed: ${err.message || String(err)}`
        };
    }
}

/**
 * Check if the email subject or body is clearly noise / non-P2P transaction:
 * - Legal / Class Action settlement notices
 * - Insurance dividends / rebates / cash back promos
 * - Debit card purchases / merchant transactions (Walmart, Amazon, Target, etc.)
 * - Generic bank statements, security alerts, fraud alerts, tax documents (1099)
 * - Outgoing payments sent by the account owner
 * - Direct deposits, payroll, refunds, ATM withdrawals
 */
function isDisallowedSubjectOrBody(subject: string, text: string): boolean {
    const combined = `${subject} ${text}`.toLowerCase();

    const disallowedKeywords = [
        "class action",
        "class-action",
        "settlement",
        "legal notice",
        "notice of settlement",
        "dividend payment",
        "mutual dividend",
        "cash back",
        "cashback",
        "rebate",
        "claim payment",
        "qualified auto customers",
        "purchase with their debit card",
        "purchase with your debit card",
        "debit card purchase",
        "card purchase",
        "made a purchase",
        "purchase at",
        "transaction with",
        "walmart.com",
        "walmart",
        "amazon.com",
        "target.com",
        "best buy",
        "home depot",
        "costco",
        "uber eats",
        "doordash",
        "instacart",
        "statement available",
        "e-statement",
        "security alert",
        "fraud alert",
        "tax document",
        "form 1099",
        "1099-k",
        "1099-misc",
        "direct deposit",
        "payroll",
        "atm withdrawal",
        "withdrawal of",
        "you sent a payment",
        "you paid",
        "you sent money",
        "you made a payment",
        "you transferred",
        "scheduled transfer",
        "pre-approved",
        "special offer",
        "rate your experience"
    ];

    for (const kw of disallowedKeywords) {
        if (combined.includes(kw)) {
            return true;
        }
    }

    return false;
}

/**
 * Extract clean payment amount from text or subjects
 * Supports formats: $180.00, $180, 180.00 USD, split HTML lines ($ \n 180 \n 00 \n .), etc.
 * Enforces valid P2P bounds: $0 < amount <= $5,000.00
 */
function extractAmount(text: string): number | null {
    if (!text) return null;

    // 1. Look for split format (e.g. Venmo HTML text rendering: "$\n180\n00\n." or "$\s*180\s+00\s*\.")
    const splitMatch = text.match(/\$\s*(\d{1,5})\s*[\r\n\s]+(\d{2})\s*\./);
    if (splitMatch && splitMatch[1] && splitMatch[2]) {
        const val = parseFloat(`${splitMatch[1]}.${splitMatch[2]}`);
        if (!isNaN(val) && val > 0 && val <= 5000) return val;
    }

    // 2. Look for standard dollar formatting: $180.00 or $180 or $ 180.00 or $1,200.00
    const dollarMatch = text.match(/\$\s*([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i);
    if (dollarMatch && dollarMatch[1]) {
        const clean = dollarMatch[1].replace(/,/g, "");
        const val = parseFloat(clean);
        if (!isNaN(val) && val > 0 && val <= 5000) return val;
    }

    // 3. Look for 180.00 USD or 180 USD or 180.00 dollars
    const usdMatch = text.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s*(?:USD|dollars)/i);
    if (usdMatch && usdMatch[1]) {
        const clean = usdMatch[1].replace(/,/g, "");
        const val = parseFloat(clean);
        if (!isNaN(val) && val > 0 && val <= 5000) return val;
    }

    return null;
}

/**
 * Extract payment details from Venmo notification emails
 */
function parseVenmoEmail(parsed: ParsedMail, uid: string): ScrapedPayment | null {
    const subject = parsed.subject || "";
    const text = parsed.text || parsed.html || "";
    const fromAddress = parsed.from?.text || "";

    // 1. Must be from Venmo or mention Venmo
    const isVenmo = fromAddress.toLowerCase().includes("venmo.com") || 
                    subject.toLowerCase().includes("paid you") || 
                    subject.toLowerCase().includes("completed your request") ||
                    text.toLowerCase().includes("venmo.com");

    if (!isVenmo) return null;

    // 2. Reject noise, store purchases, debit card transactions
    if (isDisallowedSubjectOrBody(subject, text)) return null;

    // 3. Must be an INCOMING payment
    const isIncoming = /paid you/i.test(subject) || 
                       /completed your request/i.test(subject) || 
                       /money credited to your venmo account/i.test(text) ||
                       /paid you/i.test(text);

    if (!isIncoming) return null;

    // Explicitly reject outgoing / debit card transactions
    if (/purchase with their debit card/i.test(subject) || /purchase with your debit card/i.test(subject) || /you paid/i.test(subject) || /you sent/i.test(subject)) {
        return null;
    }

    const amount = extractAmount(subject) || extractAmount(text);
    if (!amount) return null;

    // Sender Name extraction
    let senderName = "";
    // e.g. "Jameson B paid you $180.00"
    const nameMatch = subject.match(/^(.*?)\s+(?:paid you|sent you|completed your request)/i) ||
                      text.match(/([A-Za-z\s.'-]{2,40})\s+(?:paid you|sent you)/i);
    if (nameMatch && nameMatch[1]) {
        senderName = nameMatch[1].replace(/["']/g, "").trim();
    }

    // Note / Memo extraction
    let note = "";
    // From subject quote: Jameson B paid you $180.00 - "Plex renewal for jameson"
    const subjectNoteMatch = subject.match(/-\s*["“](.*?)["”]/i) || subject.match(/["“](.*?)["”]/i);
    if (subjectNoteMatch && subjectNoteMatch[1]) {
        note = subjectNoteMatch[1].trim();
    } else {
        // From body: "Note: Plex" or "Note\n..." or "Message: ..." or "For: ..."
        const bodyNoteMatch = text.match(/(?:Note|Message|For):\s*([^\r\n]+)/i);
        if (bodyNoteMatch && bodyNoteMatch[1]) {
            note = bodyNoteMatch[1].trim();
        }
    }

    // Handle extraction (e.g. @jamesonb) - exclude "Sent to @myhandle"
    let senderHandle = "";
    const cleanTextWithoutSentTo = text.replace(/sent to[\s\n\r]*@[a-zA-Z0-9_-]+/gi, "");
    const handleMatch = cleanTextWithoutSentTo.match(/@([a-zA-Z0-9_-]{3,30})/);
    if (handleMatch && handleMatch[1]) {
        senderHandle = `@${handleMatch[1]}`;
    }

    // Transaction ID
    let externalTxId = "";
    const txMatch = text.match(/(?:Transaction ID|Payment ID|Story ID)[\s:\r\n]+([0-9a-zA-Z_-]{8,})/i) || 
                    text.match(/venmo\.com\/story\/([0-9a-zA-Z_-]+)/i);
    if (txMatch && txMatch[1]) {
        externalTxId = txMatch[1].trim();
    } else {
        externalTxId = `VENMO-${uid}-${parsed.date ? parsed.date.getTime() : Date.now()}`;
    }

    return {
        provider: "VENMO",
        externalTxId,
        senderName,
        senderHandle,
        amount,
        currency: "USD",
        note,
        emailSubject: subject,
        emailDate: parsed.date || new Date(),
        emailUid: uid,
        rawSnippet: text.slice(0, 500)
    };
}

/**
 * Extract payment details from PayPal notification emails
 */
function parsePayPalEmail(parsed: ParsedMail, uid: string): ScrapedPayment | null {
    const subject = parsed.subject || "";
    const text = parsed.text || parsed.html || "";
    const fromAddress = parsed.from?.text || "";

    const isPayPal = fromAddress.toLowerCase().includes("paypal.com") || 
                     text.toLowerCase().includes("paypal.com") ||
                     subject.toLowerCase().includes("paypal");

    if (!isPayPal) return null;

    // Reject noise, store purchases, invoices, security codes
    if (isDisallowedSubjectOrBody(subject, text)) return null;

    // Must be an incoming payment
    const isIncoming = /payment received/i.test(subject) ||
                       /sent you/i.test(subject) ||
                       /you've got money/i.test(subject) ||
                       /you received a payment/i.test(subject) ||
                       /sent you money/i.test(text) ||
                       /payment received from/i.test(text);

    if (!isIncoming) return null;

    if (/you sent a payment/i.test(subject) || /receipt for your payment/i.test(subject) || /your invoice/i.test(subject)) {
        return null;
    }

    const amount = extractAmount(subject) || extractAmount(text);
    if (!amount) return null;

    // Sender Name & Email extraction
    let senderName = "";
    let senderEmail = "";

    const paypalFromMatch = subject.match(/(?:from|received from)\s+([^()]+)(?:\s*\((.*?)\))?/i) ||
                            subject.match(/^(.*?)\s+sent you/i);
    if (paypalFromMatch) {
        senderName = (paypalFromMatch[1] || "").replace(/["']/g, "").trim();
        if (paypalFromMatch[2]) {
            senderEmail = paypalFromMatch[2].trim().toLowerCase();
        }
    }

    if (!senderEmail) {
        const bodyEmailMatch = text.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (bodyEmailMatch && !bodyEmailMatch[1].includes("paypal.com")) {
            senderEmail = bodyEmailMatch[1].trim().toLowerCase();
        }
    }

    // Note extraction
    let note = "";
    const noteMatch = text.match(/(?:Note from (?:buyer|customer|sender)|Message from (?:buyer|customer|sender)|Note|Message):\s*([^\r\n]+)/i);
    if (noteMatch && noteMatch[1]) {
        note = noteMatch[1].trim();
    }

    // Transaction ID
    let externalTxId = "";
    const txMatch = text.match(/Transaction ID:\s*([A-Za-z0-9]+)/i) || 
                    text.match(/Reference ID:\s*([A-Za-z0-9]+)/i);
    if (txMatch && txMatch[1]) {
        externalTxId = txMatch[1].trim();
    } else {
        externalTxId = `PAYPAL-${uid}-${parsed.date ? parsed.date.getTime() : Date.now()}`;
    }

    return {
        provider: "PAYPAL",
        externalTxId,
        senderName,
        senderEmail,
        amount,
        currency: "USD",
        note,
        emailSubject: subject,
        emailDate: parsed.date || new Date(),
        emailUid: uid,
        rawSnippet: text.slice(0, 500)
    };
}

/**
 * Extract payment details from Zelle notification emails (from banks or Zelle)
 */
function parseZelleEmail(parsed: ParsedMail, uid: string): ScrapedPayment | null {
    const subject = parsed.subject || "";
    const text = parsed.text || parsed.html || "";
    const fromAddress = parsed.from?.text || "";

    // Reject noise, store purchases, debit card transactions, class action notices, dividend notices
    if (isDisallowedSubjectOrBody(subject, text)) return null;

    const isZelleSource = subject.toLowerCase().includes("zelle") || 
                          text.toLowerCase().includes("zelle") ||
                          fromAddress.toLowerCase().includes("zellepay.com") ||
                          fromAddress.toLowerCase().includes("chase.com") ||
                          fromAddress.toLowerCase().includes("bankofamerica.com") ||
                          fromAddress.toLowerCase().includes("wellsfargo.com") ||
                          fromAddress.toLowerCase().includes("capitalone.com") ||
                          fromAddress.toLowerCase().includes("ally.com") ||
                          fromAddress.toLowerCase().includes("citi.com") ||
                          fromAddress.toLowerCase().includes("navyfederal.org") ||
                          fromAddress.toLowerCase().includes("usbank.com") ||
                          fromAddress.toLowerCase().includes("pnc.com") ||
                          fromAddress.toLowerCase().includes("td.com") ||
                          fromAddress.toLowerCase().includes("truist.com");

    if (!isZelleSource) return null;

    // STRICT CHECK: Bank emails have endless noise; require explicit incoming Zelle payment phrases!
    const incomingZellePatterns = [
        /sent you money with zelle/i,
        /sent you a payment with zelle/i,
        /has sent you money with zelle/i,
        /sent you money/i,
        /sent you \$/i,
        /has sent you \$/i,
        /received a zelle payment/i,
        /zelle payment from/i,
        /received from (.*?) with zelle/i,
        /deposited \$[0-9.]+\s*from/i,
        /money received with zelle/i,
        /payment from (.*?) has arrived/i,
        /you received \$[0-9.]+\s*from/i
    ];

    const hasIncomingZellePhrase = incomingZellePatterns.some(p => p.test(subject) || p.test(text));
    if (!hasIncomingZellePhrase) return null;

    const amount = extractAmount(subject) || extractAmount(text);
    if (!amount) return null;

    // Sender Name extraction
    let senderName = "";
    const zelleNameMatch = subject.match(/^(.*?)\s+(?:sent you|has sent you)/i) ||
                           text.match(/(?:from|Sender:|Sender Name:|payment from)\s*([A-Za-z\s]+?)(?:\s+with|\s+via|\s+sent|\.|\r|\n)/i) ||
                           text.match(/([A-Za-z\s]{2,40})\s+sent you/i);
    if (zelleNameMatch && zelleNameMatch[1]) {
        const cleanName = zelleNameMatch[1].replace(/["']/g, "").trim();
        // Guard against generic names
        if (!/^(a class|bank|walmart|zelle|customer|reminder)/i.test(cleanName)) {
            senderName = cleanName;
        }
    }

    // Memo / Note extraction
    let note = "";
    const memoMatch = text.match(/(?:Memo|Message|Reason|Note|For):\s*([^\r\n]+)/i);
    if (memoMatch && memoMatch[1]) {
        note = memoMatch[1].trim();
    }

    // Confirmation / Reference #
    let externalTxId = "";
    const refMatch = text.match(/(?:Confirmation|Reference|Ref|Transaction)\s*(?:#|number|ID)?\s*[:#]?\s*([A-Za-z0-9_-]+)/i);
    if (refMatch && refMatch[1]) {
        externalTxId = refMatch[1].trim();
    } else {
        externalTxId = `ZELLE-${uid}-${parsed.date ? parsed.date.getTime() : Date.now()}`;
    }

    return {
        provider: "ZELLE",
        externalTxId,
        senderName,
        amount,
        currency: "USD",
        note,
        emailSubject: subject,
        emailDate: parsed.date || new Date(),
        emailUid: uid,
        rawSnippet: text.slice(0, 500)
    };
}

/**
 * Extract payment details from Cash App notification emails
 */
function parseCashAppEmail(parsed: ParsedMail, uid: string): ScrapedPayment | null {
    const subject = parsed.subject || "";
    const text = parsed.text || parsed.html || "";
    const fromAddress = parsed.from?.text || "";

    if (isDisallowedSubjectOrBody(subject, text)) return null;

    const isCashApp = fromAddress.toLowerCase().includes("square.com") || 
                      fromAddress.toLowerCase().includes("squareup.com") ||
                      fromAddress.toLowerCase().includes("cash.app") ||
                      subject.toLowerCase().includes("cash app") ||
                      text.toLowerCase().includes("cash.app");

    if (!isCashApp) return null;

    const isIncoming = /sent you/i.test(subject) || 
                       /completed your request/i.test(subject) || 
                       /you received/i.test(subject) ||
                       /sent you \$/i.test(text);

    if (!isIncoming) return null;

    if (/you sent/i.test(subject) || /cash card purchase/i.test(subject)) {
        return null;
    }

    const amount = extractAmount(subject) || extractAmount(text);
    if (!amount) return null;

    // Sender Name & Cashtag extraction
    let senderName = "";
    let senderHandle = "";

    const cashNameMatch = subject.match(/^(.*?)\s+(?:\(\$|\$|sent you)/i);
    if (cashNameMatch && cashNameMatch[1]) {
        senderName = cashNameMatch[1].replace(/["']/g, "").trim();
    }

    const tagMatch = text.match(/\$([a-zA-Z0-9_-]{2,30})/);
    if (tagMatch && tagMatch[1]) {
        senderHandle = `$${tagMatch[1]}`;
    }

    // Note extraction
    let note = "";
    const forMatch = subject.match(/for\s+["“](.*?)["”]/i) || text.match(/(?:For|Note|Message):\s*([^\r\n]+)/i);
    if (forMatch && forMatch[1]) {
        note = forMatch[1].trim();
    }

    // Transaction ID
    let externalTxId = "";
    const txMatch = text.match(/(?:Identifier|Receipt #|Transaction ID):\s*([A-Za-z0-9_-]+)/i);
    if (txMatch && txMatch[1]) {
        externalTxId = txMatch[1].trim();
    } else {
        externalTxId = `CASHAPP-${uid}-${parsed.date ? parsed.date.getTime() : Date.now()}`;
    }

    return {
        provider: "CASHAPP",
        externalTxId,
        senderName,
        senderHandle,
        amount,
        currency: "USD",
        note,
        emailSubject: subject,
        emailDate: parsed.date || new Date(),
        emailUid: uid,
        rawSnippet: text.slice(0, 500)
    };
}

/**
 * Universal payment parser combining all providers
 */
export function parsePaymentEmail(parsed: ParsedMail, uid: string): ScrapedPayment | null {
    return parseVenmoEmail(parsed, uid) ||
           parsePayPalEmail(parsed, uid) ||
           parseZelleEmail(parsed, uid) ||
           parseCashAppEmail(parsed, uid);
}

/**
 * Match a scraped payment to a User in the database
 */
export async function matchPaymentToUser(payment: ScrapedPayment): Promise<any | null> {
    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            email: true,
            plexUsername: true,
            plexEmail: true,
            referralCode: true,
            status: true,
            trialEndsAt: true,
            subscriptionEndsAt: true,
            plexLibrarySectionIds: true
        }
    });

    const note = (payment.note || "").toLowerCase().trim();
    const senderName = (payment.senderName || "").toLowerCase().trim();
    const senderEmail = (payment.senderEmail || "").toLowerCase().trim();
    const senderHandle = (payment.senderHandle || "").replace(/^[@$]/, "").toLowerCase().trim();

    // 1. Direct match by Username / Plex Username / Referral Code in NOTE
    if (note) {
        // Strip common prefixes
        const cleanNote = note.replace(/^(?:plex|subscription|sub|for|user|username|payment|renewal|annual|monthly)[\s:=-]+/i, "").trim();
        
        for (const u of allUsers) {
            const uName = u.username.toLowerCase().trim();
            const pName = (u.plexUsername || "").toLowerCase().trim();
            const refCode = (u.referralCode || "").toLowerCase().trim();

            if (uName && (note.includes(uName) || cleanNote === uName)) {
                return u;
            }
            if (pName && (note.includes(pName) || cleanNote === pName)) {
                return u;
            }
            if (refCode && (note.includes(refCode) || cleanNote === refCode)) {
                return u;
            }
        }
    }

    // 2. Direct match by Sender Email
    if (senderEmail) {
        const emailMatch = allUsers.find(u => 
            u.email.toLowerCase() === senderEmail || 
            (u.plexEmail && u.plexEmail.toLowerCase() === senderEmail)
        );
        if (emailMatch) return emailMatch;
    }

    // 3. Direct match by Sender Handle (@venmo or $cashapp)
    if (senderHandle) {
        const handleMatch = allUsers.find(u => 
            u.username.toLowerCase() === senderHandle || 
            (u.referralCode && u.referralCode.toLowerCase() === senderHandle)
        );
        if (handleMatch) return handleMatch;
    }

    // 4. Match by Sender Name (Exact match or Prefix match)
    if (senderName) {
        const exactNameMatch = allUsers.find(u => 
            u.username.toLowerCase() === senderName || 
            (u.plexUsername && u.plexUsername.toLowerCase() === senderName)
        );
        if (exactNameMatch) return exactNameMatch;

        // Try matching stripped sender name (e.g. "Jameson B" -> "jamesonb")
        const strippedSenderName = senderName.replace(/[\s.'-]+/g, "");
        const prefixMatch = allUsers.find(u => {
            const emailPrefix = u.email.split("@")[0].toLowerCase().replace(/[\s.'_-]+/g, "");
            const uClean = u.username.toLowerCase().replace(/[\s.'_-]+/g, "");
            const pClean = (u.plexUsername || "").toLowerCase().replace(/[\s.'_-]+/g, "");
            return emailPrefix === strippedSenderName || uClean === strippedSenderName || pClean === strippedSenderName;
        });
        if (prefixMatch) return prefixMatch;

        // Try matching First Name part (e.g. "Jameson B" -> "jameson") if it starts with first name
        const firstNamePart = senderName.split(/\s+/)[0];
        if (firstNamePart && firstNamePart.length >= 3) {
            const firstNameMatches = allUsers.filter(u => 
                u.username.toLowerCase() === firstNamePart || 
                (u.plexUsername && u.plexUsername.toLowerCase() === firstNamePart) ||
                u.email.split("@")[0].toLowerCase().startsWith(firstNamePart)
            );
            if (firstNameMatches.length === 1) {
                return firstNameMatches[0];
            }
        }
    }

    return null;
}

/**
 * Grant subscription to a matched user based on the payment amount
 */
export async function applySubscriptionForPayment(user: any, payment: ScrapedPayment): Promise<{
    newExpiryDate: Date;
    periodGrantedText: string;
}> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    const yearlyPrice = settings?.yearlyPrice || 180;
    const monthlyPrice = settings?.monthlyPrice || 15;

    // Calculate base date: if user has an active future subscription, add onto it!
    const now = new Date();
    const existingExpiry = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
    const baseDate = existingExpiry && existingExpiry > now ? existingExpiry : now;

    let newExpiryDate: Date;
    let periodGrantedText = "";

    if (payment.amount >= (yearlyPrice * 0.85)) {
        // Full 1 Year Subscription
        newExpiryDate = addYears(baseDate, 1);
        periodGrantedText = `1 Year (Active until ${newExpiryDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })})`;
    } else {
        // Monthly calculation
        const months = Math.max(1, Math.round(payment.amount / monthlyPrice));
        newExpiryDate = addMonths(baseDate, months);
        periodGrantedText = `${months} Month${months > 1 ? "s" : ""} (Active until ${newExpiryDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })})`;
    }

    // Update User in database
    await prisma.user.update({
        where: { id: user.id },
        data: {
            status: "APPROVED",
            subscriptionEndsAt: newExpiryDate,
            convertedAt: user.convertedAt || now
        }
    });

    // Ensure Plex Sharing access is granted
    try {
        const { setUserTrialOrSubscription } = await import("@/app/actions");
        await setUserTrialOrSubscription(user.id, "CUSTOM", newExpiryDate.toISOString());
    } catch (plexErr) {
        logger.addLog("WARN", "PLEX", `[PAYMENT-SCRAPER] Failed to sync Plex sharing for "${user.username}": ${plexErr}`);
    }

    logger.addLog("INFO", "SYSTEM", `[PAYMENT-FULFILLMENT] Applied ${periodGrantedText} for user "${user.username}" via ${payment.provider} ($${payment.amount.toFixed(2)})`);

    return {
        newExpiryDate,
        periodGrantedText
    };
}

/**
 * Scan payment emails across all enabled sources (or a specific source)
 */
export async function scanPaymentEmailsInternal(sourceId?: string): Promise<{
    success: boolean;
    totalSources: number;
    scannedMessages: number;
    newPaymentsFound: number;
    autoAttributed: number;
    unmatched: number;
    errors: string[];
}> {
    const whereClause = sourceId ? { id: sourceId, enabled: true } : { enabled: true };
    const sources = await prisma.paymentEmailSource.findMany({ where: whereClause });

    let scannedMessages = 0;
    let newPaymentsFound = 0;
    let autoAttributed = 0;
    let unmatched = 0;
    const errors: string[] = [];

    if (sources.length === 0) {
        await prisma.settings.upsert({
            where: { id: "global" },
            update: {
                paymentLastScanAt: new Date(),
                paymentLastScanResult: JSON.stringify({
                    scannedAt: new Date().toISOString(),
                    totalSources: 0,
                    scannedMessages: 0,
                    newPaymentsFound: 0,
                    autoAttributed: 0,
                    unmatched: 0,
                    errors: []
                })
            },
            create: {
                id: "global",
                paymentLastScanAt: new Date()
            }
        }).catch(() => {});

        return {
            success: true,
            totalSources: 0,
            scannedMessages: 0,
            newPaymentsFound: 0,
            autoAttributed: 0,
            unmatched: 0,
            errors: []
        };
    }

    for (const src of sources) {
        let client: ImapFlow | null = null;
        try {
            const pass = decryptData(src.pass);
            client = new ImapFlow({
                host: src.host,
                port: src.port,
                secure: src.secure,
                auth: {
                    user: src.user,
                    pass: pass
                },
                logger: false
            });

            await client.connect();
            const lock = await client.getMailboxLock(src.mailbox || "INBOX");

            try {
                // Fetch recent messages: look back 14 days or fetch last 60 messages
                const sinceDate = new Date();
                sinceDate.setDate(sinceDate.getDate() - 14);

                const messages = client.fetch(
                    { since: sinceDate },
                    { uid: true, envelope: true, source: true }
                );

                let highestUid = src.lastUid || 0;

                for await (const msg of messages) {
                    scannedMessages++;
                    const uidStr = String(msg.uid);
                    if (msg.uid > highestUid) {
                        highestUid = msg.uid;
                    }

                    try {
                        if (!msg.source) continue;
                        const parsed: ParsedMail = await simpleParser(msg.source);
                        const scraped = parsePaymentEmail(parsed, uidStr);

                        if (scraped) {
                            // Check if transaction was already processed
                            const existing = await prisma.paymentTransaction.findFirst({
                                where: {
                                    provider: scraped.provider,
                                    externalTxId: scraped.externalTxId
                                }
                            });

                            if (!existing) {
                                newPaymentsFound++;
                                // Match with user
                                const matchedUser = await matchPaymentToUser(scraped);

                                if (matchedUser) {
                                    // Auto-grant subscription!
                                    const { periodGrantedText } = await applySubscriptionForPayment(matchedUser, scraped);
                                    autoAttributed++;

                                    await prisma.paymentTransaction.create({
                                        data: {
                                            sourceId: src.id,
                                            provider: scraped.provider,
                                            externalTxId: scraped.externalTxId,
                                            senderName: scraped.senderName || null,
                                            senderEmail: scraped.senderEmail || null,
                                            senderHandle: scraped.senderHandle || null,
                                            amount: scraped.amount,
                                            currency: scraped.currency,
                                            note: scraped.note || null,
                                            emailSubject: scraped.emailSubject,
                                            emailDate: scraped.emailDate,
                                            emailUid: uidStr,
                                            matchedUserId: matchedUser.id,
                                            status: "PROCESSED",
                                            appliedSubscription: true,
                                            subscriptionPeriodGranted: periodGrantedText,
                                            rawPayload: JSON.stringify({
                                                snippet: scraped.rawSnippet,
                                                autoMatched: true
                                            })
                                        }
                                    });
                                } else {
                                    // Record unmatched payment
                                    unmatched++;
                                    await prisma.paymentTransaction.create({
                                        data: {
                                            sourceId: src.id,
                                            provider: scraped.provider,
                                            externalTxId: scraped.externalTxId,
                                            senderName: scraped.senderName || null,
                                            senderEmail: scraped.senderEmail || null,
                                            senderHandle: scraped.senderHandle || null,
                                            amount: scraped.amount,
                                            currency: scraped.currency,
                                            note: scraped.note || null,
                                            emailSubject: scraped.emailSubject,
                                            emailDate: scraped.emailDate,
                                            emailUid: uidStr,
                                            status: "UNMATCHED",
                                            appliedSubscription: false,
                                            rawPayload: JSON.stringify({
                                                snippet: scraped.rawSnippet,
                                                autoMatched: false
                                            })
                                        }
                                    });
                                }
                            }
                        }
                    } catch (parseMsgErr: any) {
                        logger.addLog("WARN", "SYSTEM", `[PAYMENT-SCRAPER] Error parsing message UID ${msg.uid} on source "${src.name}": ${parseMsgErr.message}`);
                    }
                }

                // Update source last scanned timestamp and status
                await prisma.paymentEmailSource.update({
                    where: { id: src.id },
                    data: {
                        lastScannedAt: new Date(),
                        lastUid: highestUid,
                        lastStatus: `Active: Scanned OK at ${new Date().toLocaleTimeString()}`
                    }
                });

            } finally {
                lock.release();
            }

            await client.logout();
        } catch (srcErr: any) {
            const errMsg = `Source "${src.name}" (${src.user}): ${srcErr.message || String(srcErr)}`;
            errors.push(errMsg);
            logger.addLog("ERROR", "SYSTEM", `[PAYMENT-SCRAPER-ERROR] ${errMsg}`);
            
            await prisma.paymentEmailSource.update({
                where: { id: src.id },
                data: {
                    lastScannedAt: new Date(),
                    lastStatus: `Error: ${srcErr.message || String(srcErr)}`
                }
            }).catch(() => {});

            if (client) {
                try {
                    await client.logout();
                } catch (_) {}
            }
        }
    }

    const summaryResult = {
        scannedAt: new Date().toISOString(),
        totalSources: sources.length,
        scannedMessages,
        newPaymentsFound,
        autoAttributed,
        unmatched,
        errors
    };

    // Update global settings
    await prisma.settings.upsert({
        where: { id: "global" },
        update: {
            paymentLastScanAt: new Date(),
            paymentLastScanResult: JSON.stringify(summaryResult)
        },
        create: {
            id: "global",
            paymentLastScanAt: new Date(),
            paymentLastScanResult: JSON.stringify(summaryResult)
        }
    });

    return {
        success: errors.length === 0,
        totalSources: sources.length,
        scannedMessages,
        newPaymentsFound,
        autoAttributed,
        unmatched,
        errors
    };
}
