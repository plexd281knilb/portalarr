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
 * Calculate the prorated cost to cover from paymentDate through Jan 1 of the next year.
 */
export function getProratedRestOfYearAmount(paymentDate: Date, monthlyPrice: number, yearlyPrice: number): {
    amount: number;
    daysRemainingInMonth: number;
    remainingFullMonths: number;
} {
    const year = paymentDate.getFullYear();
    const month = paymentDate.getMonth(); // 0 = Jan, 11 = Dec
    const day = paymentDate.getDate();
    
    // Days in current payment month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysRemainingInMonth = Math.max(0, daysInMonth - day);
    const monthProration = (daysRemainingInMonth / daysInMonth) * monthlyPrice;
    
    // Full remaining months after current month in this calendar year
    const remainingFullMonths = Math.max(0, 11 - month);
    const fullMonthsAmount = remainingFullMonths * monthlyPrice;
    
    const calculatedProrated = Math.round((monthProration + fullMonthsAmount) * 100) / 100;
    
    // In Q4 (Oct-Dec), if full yearly price is paid, it covers remainder + full upcoming year
    const amount = Math.min(yearlyPrice, Math.max(monthlyPrice, calculatedProrated));
    return {
        amount,
        daysRemainingInMonth,
        remainingFullMonths
    };
}

/**
 * Calculate aligned expiration date:
 * - Evaluates strictly against paymentDate (the email timestamp) for accurate historical & future calculations.
 * - Yearly: ALWAYS January 1st (Jan 1, YYYY at 23:59:59).
 * - Mid-Year Prorated: If totalAmount covers the prorated cost for the remainder of the year (within $5 tolerance),
 *   credits the user through January 1st of the upcoming year!
 * - Monthly: ALWAYS 1st day of target month (YYYY-MM-01 at 23:59:59).
 * - Tolerance buffer:
 *   - Yearly / Rest-of-Year ($180 standard or prorated): within $5 of target rate counts as full fulfillment.
 *   - Monthly ($15 standard): within $1.00 of monthly rate counts as full fulfillment.
 */
export function calculateAlignedExpiryDate(params: {
    paymentDate: Date;
    totalAmount: number;
    yearlyPrice: number;
    monthlyPrice: number;
    existingExpiry?: Date | null;
}): { 
    newExpiryDate: Date; 
    periodGrantedText: string; 
    isYearly: boolean; 
    isProratedRestOfYear: boolean; 
    monthsGranted: number 
} {
    const { paymentDate, totalAmount, yearlyPrice, monthlyPrice, existingExpiry } = params;
    
    const payMonth = paymentDate.getMonth(); // 0-indexed (0=Jan, 9=Oct, 11=Dec)
    const payYear = paymentDate.getFullYear();
    
    // 1. Check if payment covers the Full Yearly rate (tolerance: >= yearlyPrice - 5)
    const isFullYearly = totalAmount >= Math.max(1, yearlyPrice - 5);
    
    // 2. Check Mid-Year Prorated Rest-of-Year calculation (Jan-Sep only)
    const proratedInfo = getProratedRestOfYearAmount(paymentDate, monthlyPrice, yearlyPrice);
    // Mid-year proration applies if paid Jan-Sep (payMonth < 9) and total covers the rest of the year
    const isProratedRestOfYear = !isFullYearly && (payMonth < 9) && (totalAmount >= Math.max(1, proratedInfo.amount - 5));

    let newExpiryDate: Date;
    let periodGrantedText = "";
    let isYearly = false;
    let monthsGranted = 1;

    if (isFullYearly) {
        isYearly = true;
        const yearsCount = Math.max(1, Math.round(totalAmount / yearlyPrice));
        
        // Base target expiration year for this payment:
        // - If paying in Q4 (Oct, Nov, Dec), it covers remainder of year + next full year (e.g. Dec 2025 + 1 yr = Jan 1, 2027)
        // - If paying in Jan - Sep, it covers through Jan 1 of next year (e.g. Jan 2026 + 1 yr = Jan 1, 2027)
        const baseTargetYear = (payMonth >= 9 ? payYear + 1 + (yearsCount - 1) + 1 : payYear + (yearsCount - 1) + 1);
        
        if (existingExpiry && existingExpiry.getTime() > paymentDate.getTime()) {
            const currentExpYear = existingExpiry.getFullYear();
            const targetYear = Math.max(baseTargetYear, currentExpYear + (currentExpYear >= baseTargetYear ? yearsCount : 0));
            newExpiryDate = new Date(targetYear, 0, 1, 23, 59, 59, 999);
        } else {
            newExpiryDate = new Date(baseTargetYear, 0, 1, 23, 59, 59, 999);
        }
        periodGrantedText = `${yearsCount > 1 ? `${yearsCount} Years` : "1 Year"} (Active until Jan 1, ${newExpiryDate.getFullYear()})`;
    } else if (isProratedRestOfYear) {
        // Mid-Year Prorated: Credits through Jan 1st of upcoming year
        const targetYear = payYear + 1;
        newExpiryDate = new Date(targetYear, 0, 1, 23, 59, 59, 999);
        periodGrantedText = `Remainder of ${payYear} (Active until Jan 1, ${targetYear})`;
    } else {
        // Multi-Month / Monthly calculation with tolerance (e.g. $14+ counts for 1 month @ $15)
        monthsGranted = Math.max(1, Math.round(totalAmount / monthlyPrice));
        if (totalAmount < monthlyPrice && totalAmount >= (monthlyPrice - 1)) {
            monthsGranted = 1;
        }

        if (existingExpiry && existingExpiry.getTime() > paymentDate.getTime()) {
            newExpiryDate = new Date(existingExpiry);
            newExpiryDate.setMonth(newExpiryDate.getMonth() + monthsGranted);
            newExpiryDate.setDate(1);
            newExpiryDate.setHours(23, 59, 59, 999);
        } else {
            // If paying in Q4 (e.g. Dec), 6 months ($90) grants through July 1st of next year!
            if (payMonth >= 9) {
                newExpiryDate = new Date(payYear + 1, 0, 1, 23, 59, 59, 999);
                newExpiryDate.setMonth(newExpiryDate.getMonth() + (monthsGranted));
                newExpiryDate.setDate(1);
            } else {
                newExpiryDate = new Date(paymentDate);
                newExpiryDate.setMonth(newExpiryDate.getMonth() + monthsGranted + 1);
                newExpiryDate.setDate(1);
                newExpiryDate.setHours(23, 59, 59, 999);
            }
        }
        periodGrantedText = `${monthsGranted} Month${monthsGranted > 1 ? "s" : ""} (Active until ${newExpiryDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })})`;
    }

    return {
        newExpiryDate,
        periodGrantedText,
        isYearly,
        isProratedRestOfYear,
        monthsGranted
    };
}

/**
 * Match a scraped payment to a User in the database
 */
export async function matchPaymentToUser(payment: ScrapedPayment): Promise<any | null> {
    const allUsers = await prisma.user.findMany({
        select: {
            id: true,
            username: true,
            name: true,
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

    // 1. Direct match by Username / Plex Username / Referral Code / Real Name in NOTE
    if (note) {
        const cleanNote = note.replace(/^(?:plex|subscription|sub|for|user|username|payment|renewal|annual|monthly)[\s:=-]+/i, "").trim();
        
        for (const u of allUsers) {
            const uName = u.username.toLowerCase().trim();
            const realName = (u.name || "").toLowerCase().trim();
            const pName = (u.plexUsername || "").toLowerCase().trim();
            const refCode = (u.referralCode || "").toLowerCase().trim();

            if (uName && (note.includes(uName) || cleanNote === uName)) return u;
            if (realName && (note.includes(realName) || cleanNote === realName)) return u;
            if (pName && (note.includes(pName) || cleanNote === pName)) return u;
            if (refCode && (note.includes(refCode) || cleanNote === refCode)) return u;
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
            (u.referralCode && u.referralCode.toLowerCase() === senderHandle) ||
            (u.plexUsername && u.plexUsername.toLowerCase() === senderHandle)
        );
        if (handleMatch) return handleMatch;
    }

    // 4. Match by Sender Name
    if (senderName) {
        // A. Direct Name Match with u.name
        const exactRealNameMatch = allUsers.find(u => 
            u.name && u.name.toLowerCase().trim() === senderName
        );
        if (exactRealNameMatch) return exactRealNameMatch;

        // B. Direct match with username / plexUsername
        const exactNameMatch = allUsers.find(u => 
            u.username.toLowerCase() === senderName || 
            (u.plexUsername && u.plexUsername.toLowerCase() === senderName)
        );
        if (exactNameMatch) return exactNameMatch;

        // C. Clean stripped sender name (e.g. "Jonathan Juliano" -> "jonathanjuliano", "Jameson B" -> "jamesonb")
        const strippedSenderName = senderName.replace(/[\s.'_-]+/g, "");
        const strippedMatches = allUsers.filter(u => {
            const emailPrefix = u.email.split("@")[0].toLowerCase().replace(/[\s.'_-]+/g, "");
            const plexEmailPrefix = (u.plexEmail || "").split("@")[0].toLowerCase().replace(/[\s.'_-]+/g, "");
            const uClean = u.username.toLowerCase().replace(/[\s.'_-]+/g, "");
            const uNoDigits = uClean.replace(/\d+$/, "");
            const emailNoDigits = emailPrefix.replace(/\d+$/, "");
            const pClean = (u.plexUsername || "").toLowerCase().replace(/[\s.'_-]+/g, "");
            const realClean = (u.name || "").toLowerCase().replace(/[\s.'_-]+/g, "");
            return emailPrefix === strippedSenderName || 
                   plexEmailPrefix === strippedSenderName || 
                   uClean === strippedSenderName || 
                   uNoDigits === strippedSenderName ||
                   emailNoDigits === strippedSenderName ||
                   pClean === strippedSenderName ||
                   (realClean && realClean === strippedSenderName);
        });
        if (strippedMatches.length === 1) return strippedMatches[0];

        // D. First Initial + Last Name pattern & Shortened First Name patterns
        // e.g. "Edward McDonald" vs "edwmcdonald", "EdwardMcDonald1"
        // "Patrick King" vs "patrick.j.king", "patrick304"
        // "Dane Heidelman" vs "dheidelman", "dheid7"
        // "Cullin Lassiter" vs "cullin.lassiter@gmail.com", "cwbyzer0"
        // "David Garza" vs "dgarza"
        // "Trevor Scarborough" vs "trevscar1121", "trevsky313@gmail.com"
        const nameParts = senderName.split(/\s+/).filter(Boolean);
        if (nameParts.length >= 2) {
            const firstName = nameParts[0];
            const lastName = nameParts[nameParts.length - 1];
            const firstInitialLastName = `${firstName[0]}${lastName}`.replace(/[\s.'_-]+/g, "");
            const firstTwoLastName = `${firstName.slice(0, 2)}${lastName}`.replace(/[\s.'_-]+/g, "");
            const firstThreeLastName = `${firstName.slice(0, 3)}${lastName}`.replace(/[\s.'_-]+/g, "");
            const firstThreeLastPrefix = `${firstName.slice(0, 4)}${lastName.slice(0, 4)}`.replace(/[\s.'_-]+/g, "");

            const initialMatches = allUsers.filter(u => {
                const uClean = u.username.toLowerCase().replace(/[\s.'_-]+/g, "");
                const uNoDigits = uClean.replace(/\d+$/, "");
                const pClean = (u.plexUsername || "").toLowerCase().replace(/[\s.'_-]+/g, "");
                const emailPrefix = u.email.split("@")[0].toLowerCase().replace(/[\s.'_-]+/g, "");
                const emailNoDigits = emailPrefix.replace(/\d+$/, "");
                
                return uClean === firstInitialLastName || 
                       uNoDigits === firstInitialLastName ||
                       pClean === firstInitialLastName || 
                       emailPrefix === firstInitialLastName ||
                       emailNoDigits === firstInitialLastName ||
                       uClean === firstTwoLastName ||
                       uClean === firstThreeLastName ||
                       emailPrefix === firstThreeLastName ||
                       emailNoDigits === firstThreeLastName ||
                       (firstThreeLastPrefix.length >= 6 && uClean.startsWith(firstThreeLastPrefix)) ||
                       (firstThreeLastPrefix.length >= 6 && emailPrefix.startsWith(firstThreeLastPrefix)) ||
                       pClean === firstTwoLastName;
            });
            if (initialMatches.length === 1) return initialMatches[0];
        }

        // E. First Name alone if unique (e.g. "Jameson B" -> "jameson")
        const firstNamePart = nameParts[0];
        if (firstNamePart && firstNamePart.length >= 3) {
            const firstNameMatches = allUsers.filter(u => {
                const uClean = u.username.toLowerCase().replace(/[\s.'_-]+/g, "").replace(/\d+$/, "");
                const emailPrefix = u.email.split("@")[0].toLowerCase().replace(/[\s.'_-]+/g, "").replace(/\d+$/, "");
                const pClean = (u.plexUsername || "").toLowerCase().replace(/[\s.'_-]+/g, "").replace(/\d+$/, "");
                return uClean === firstNamePart || pClean === firstNamePart || emailPrefix === firstNamePart;
            });
            if (firstNameMatches.length === 1) {
                return firstNameMatches[0];
            }
        }
    }

    return null;
}

/**
 * Grant subscription to a matched user based on the payment amount and cumulative installments
 */
export async function applySubscriptionForPayment(user: any, payment: ScrapedPayment): Promise<{
    newExpiryDate: Date;
    periodGrantedText: string;
    totalCumulativeAmount: number;
}> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    const yearlyPrice = settings?.yearlyPrice || 180;
    const monthlyPrice = settings?.monthlyPrice || 15;

    const paymentDate = payment.emailDate ? new Date(payment.emailDate) : new Date();

    // Fetch prior payments for this user or sender within the same installment window / cycle
    // (e.g. +/- 90 days of paymentDate)
    const windowStart = new Date(paymentDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    const windowEnd = new Date(paymentDate.getTime() + 90 * 24 * 60 * 60 * 1000);

    const recentPayments = await prisma.paymentTransaction.findMany({
        where: {
            OR: [
                { matchedUserId: user.id },
                ...(payment.senderName ? [{ senderName: { equals: payment.senderName } }] : []),
                ...(payment.senderEmail ? [{ senderEmail: { equals: payment.senderEmail } }] : [])
            ],
            emailDate: {
                gte: windowStart,
                lte: windowEnd
            }
        }
    }).catch(() => [] as any[]);

    // Sum past payments in this cycle excluding the current transaction ID
    const pastInstallments = recentPayments.filter(p => p.externalTxId !== payment.externalTxId);
    const pastInstallmentsSum = pastInstallments.reduce((sum, p) => sum + (p.amount || 0), 0);

    const totalCumulativeAmount = pastInstallmentsSum + payment.amount;

    const existingExpiry = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;

    const { newExpiryDate, periodGrantedText } = calculateAlignedExpiryDate({
        paymentDate,
        totalAmount: totalCumulativeAmount,
        yearlyPrice,
        monthlyPrice,
        existingExpiry
    });

    const now = new Date();
    const isCurrentlyActive = newExpiryDate > now;
    const targetStatus = user.role === "ADMIN" ? "APPROVED" : (isCurrentlyActive ? "APPROVED" : "EXPIRED");
    const convertedAtDate = user.convertedAt || payment.emailDate || now;

    // Update User in database
    await prisma.user.update({
        where: { id: user.id },
        data: {
            status: targetStatus,
            subscriptionEndsAt: newExpiryDate,
            convertedAt: convertedAtDate
        }
    });

    // Retroactively update earlier installment transactions in this cycle so they link to this user and note the merged fulfillment
    if (recentPayments.length > 0) {
        for (const p of recentPayments) {
            if (p.externalTxId !== payment.externalTxId) {
                await prisma.paymentTransaction.update({
                    where: { id: p.id },
                    data: {
                        matchedUserId: user.id,
                        status: p.status === "MANUAL" ? "MANUAL" : "PROCESSED",
                        appliedSubscription: true,
                        subscriptionPeriodGranted: `Merged with cumulative installment (${periodGrantedText})`
                    }
                }).catch(() => {});
            }
        }
    }

    // Ensure Plex Sharing access is granted if active
    if (isCurrentlyActive) {
        try {
            // If the user's status was ALREADY APPROVED, we already updated their subscription date.
            // DO NOT re-sync or modify their active Plex shares, preserving all active libraries across all servers.
            // Only if they were previously EXPIRED, SUSPENDED, PENDING, or TRIAL do we restore their shares.
            if (user.status === "EXPIRED" || user.status === "SUSPENDED" || user.status === "PENDING" || user.status === "TRIAL") {
                const { setUserTrialOrSubscription } = await import("@/app/actions");
                await setUserTrialOrSubscription(user.id, "CUSTOM", newExpiryDate.toISOString());
            }
        } catch (plexErr) {
            logger.addLog("WARN", "PLEX", `[PAYMENT-SCRAPER] Failed to sync Plex sharing for "${user.username}": ${plexErr}`);
        }
    }

    logger.addLog(
        "INFO", 
        "SYSTEM", 
        `[PAYMENT-FULFILLMENT] Applied ${periodGrantedText} for user "${user.username}" (Current: $${payment.amount.toFixed(2)}, Cumulative: $${totalCumulativeAmount.toFixed(2)}) via ${payment.provider}`
    );

    return {
        newExpiryDate,
        periodGrantedText,
        totalCumulativeAmount
    };
}

/**
 * Scan payment emails across all enabled sources (or a specific source)
 * @param sourceId Optional specific source ID
 * @param lookbackDays Number of days to search back (default: 365 days / 1 year; 0 = last 300 messages)
 */
export async function scanPaymentEmailsInternal(sourceId?: string, lookbackDays?: number): Promise<{
    success: boolean;
    totalSources: number;
    scannedMessages: number;
    newPaymentsFound: number;
    autoAttributed: number;
    unmatched: number;
    duplicatePaymentsSkipped: number;
    errors: string[];
}> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    const effectiveLookbackDays = typeof lookbackDays === "number" 
        ? lookbackDays 
        : (settings?.paymentEmailLookbackDays ?? 365);

    const whereClause = sourceId ? { id: sourceId, enabled: true } : { enabled: true };
    const sources = await prisma.paymentEmailSource.findMany({ where: whereClause });

    let scannedMessages = 0;
    let newPaymentsFound = 0;
    let autoAttributed = 0;
    let unmatched = 0;
    let duplicatePaymentsSkipped = 0;
    const errors: string[] = [];

    if (sources.length === 0) {
        await prisma.settings.upsert({
            where: { id: "global" },
            update: {
                paymentEmailLookbackDays: effectiveLookbackDays,
                paymentLastScanAt: new Date(),
                paymentLastScanResult: JSON.stringify({
                    scannedAt: new Date().toISOString(),
                    totalSources: 0,
                    scannedMessages: 0,
                    newPaymentsFound: 0,
                    autoAttributed: 0,
                    unmatched: 0,
                    duplicatePaymentsSkipped: 0,
                    lookbackDays: effectiveLookbackDays,
                    errors: []
                })
            },
            create: {
                id: "global",
                paymentEmailLookbackDays: effectiveLookbackDays,
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
            duplicatePaymentsSkipped: 0,
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
            const mailboxName = src.mailbox || "INBOX";
            const lock = await client.getMailboxLock(mailboxName);

            try {
                let messages;
                if (effectiveLookbackDays && effectiveLookbackDays > 0) {
                    const sinceDate = new Date();
                    sinceDate.setDate(sinceDate.getDate() - effectiveLookbackDays);
                    logger.addLog("INFO", "SYSTEM", `[PAYMENT-SCRAPER] Scanning source "${src.name}" (${src.user}) in mailbox "${mailboxName}" since ${sinceDate.toLocaleDateString()} (${effectiveLookbackDays} days lookback)`);
                    messages = client.fetch(
                        { since: sinceDate },
                        { uid: true, envelope: true, source: true }
                    );
                } else {
                    const status = await client.status(mailboxName, { messages: true });
                    const totalMsgs = status.messages || 0;
                    const startSeq = Math.max(1, totalMsgs - 300);
                    logger.addLog("INFO", "SYSTEM", `[PAYMENT-SCRAPER] Scanning source "${src.name}" (${src.user}) in mailbox "${mailboxName}" across sequence ${startSeq}:* (last ${totalMsgs - startSeq + 1} messages)`);
                    messages = client.fetch(
                        `${startSeq}:*`,
                        { uid: true, envelope: true, source: true }
                    );
                }

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
                                logger.addLog("INFO", "SYSTEM", `[PAYMENT-SCRAPER] Detected inbound payment: ${scraped.provider} $${scraped.amount.toFixed(2)} from "${scraped.senderName || scraped.senderHandle || scraped.senderEmail || 'Unknown'}" (TxID: ${scraped.externalTxId})`);
                                
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
                            } else {
                                duplicatePaymentsSkipped++;
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
                        lastStatus: `Active: Scanned OK at ${new Date().toLocaleTimeString()} (${scannedMessages} msgs checked)`
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
        duplicatePaymentsSkipped,
        lookbackDays: effectiveLookbackDays,
        errors
    };

    // Update global settings
    await prisma.settings.upsert({
        where: { id: "global" },
        update: {
            paymentEmailLookbackDays: effectiveLookbackDays,
            paymentLastScanAt: new Date(),
            paymentLastScanResult: JSON.stringify(summaryResult)
        },
        create: {
            id: "global",
            paymentEmailLookbackDays: effectiveLookbackDays,
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
        duplicatePaymentsSkipped,
        errors
    };
}
