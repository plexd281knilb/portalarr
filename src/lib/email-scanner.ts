import imaps from "imap-simple";
import { simpleParser } from "mailparser";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function scanEmailAccounts() {
    const accounts = await prisma.emailAccount.findMany();
    const logs: string[] = [];
    let newPaymentsCount = 0;

    for (const account of accounts) {
        logs.push(`Scanning ${account.name} (${account.user})...`);

        try {
            const config = {
                imap: {
                    user: account.user,
                    password: account.pass,
                    host: account.host,
                    port: account.port,
                    tls: true,
                    authTimeout: 15000,
                    tlsOptions: { rejectUnauthorized: false } 
                }
            };

            const connection = await imaps.connect(config);
            await connection.openBox('INBOX');

            // Look back 90 days
            const delay = 90 * 24 * 3600 * 1000; 
            const searchDate = new Date(Date.now() - delay);
            
            // --- 1. SCAN VENMO ---
            try {
                const venmoSearch = [
                    ['FROM', 'venmo@venmo.com'],
                    ['SINCE', searchDate], 
                    ['SUBJECT', 'paid you'] 
                ];
                const venmoMessages = await connection.search(venmoSearch, { bodies: ['HEADER', 'TEXT', ''], struct: true });
                logs.push(`Found ${venmoMessages.length} Venmo emails.`);

                for (const item of venmoMessages) {
                    await processEmail(item, "Venmo");
                }
            } catch (e: any) { logs.push(`Venmo scan error: ${e.message}`); }

            // --- 2. SCAN PAYPAL ---
            try {
                const paypalSearch = [
                    ['FROM', 'service@paypal.com'],
                    ['SINCE', searchDate], 
                    ['SUBJECT', 'sent you'] 
                ];
                const paypalMessages = await connection.search(paypalSearch, { bodies: ['HEADER', 'TEXT', ''], struct: true });
                logs.push(`Found ${paypalMessages.length} PayPal emails.`);

                for (const item of paypalMessages) {
                    await processEmail(item, "PayPal");
                }
            } catch (e: any) { logs.push(`PayPal scan error: ${e.message}`); }

            connection.end();
        } catch (err: any) {
            console.error(err);
            logs.push(`Error connecting to ${account.name}: ${err.message}`);
        }
    }

    // --- HELPER FUNCTION TO PARSE & SAVE ---
    async function processEmail(item: any, provider: string) {
        const all = item.parts.find((part: any) => part.which === "");
        const mail = await simpleParser(all?.body);
        const subject = mail.subject || "";
        const html = mail.html || "";
        const date = mail.date || new Date();

        let payerName = "";
        let amount = 0;
        let externalId = "";

        // --- PARSING LOGIC ---
        if (provider === "Venmo") {
            // Subject: "Austin Bamrick paid you $180.00"
            const match = subject.match(/^(.*?) paid you \$([\d,]+\.\d{2})/);
            if (!match) return;
            payerName = match[1].trim();
            amount = parseFloat(match[2].replace(/,/g, ''));

            // ID extraction
            const idMatch = html.match(/Transaction ID<\/h3>[\s\S]*?<p[^>]*>(\d+)<\/p>/);
            externalId = idMatch ? idMatch[1] : `venmo_${payerName}_${amount}_${date.getTime()}`;
        } 
        else if (provider === "PayPal") {
            // Subject: "Derek Spies sent you $360.00 USD"
            // Note: We scan for 'sent you' to avoid requests/invoices
            const match = subject.match(/^(.*?) sent you \$([\d,]+\.\d{2})/);
            if (!match) return;
            payerName = match[1].trim();
            amount = parseFloat(match[2].replace(/,/g, ''));

            // ID extraction (PayPal HTML is very messy/nested)
            // We look for the "Transaction ID" label, then find the next alphanumeric string in a span
            // Or fallback to a generated ID since PayPal IDs (17 chars) are hard to regex reliably in messy HTML
            const idMatch = html.match(/Transaction ID[\s\S]*?<span>([A-Z0-9]{17})<\/span>/);
            externalId = idMatch ? idMatch[1] : `paypal_${payerName}_${amount}_${date.getTime()}`;
        }

        // --- SAVE TO DB ---
        if (payerName && amount > 0) {
            const exists = await prisma.payment.findUnique({ where: { externalId } });
            
            if (!exists) {
                // Auto-Link Logic
                const linkedUser = await prisma.subscriber.findFirst({
                    where: { 
                        OR: [
                            { fullName: { equals: payerName } }, 
                            { name: { equals: payerName } }
                        ]
                    }
                });

                await prisma.payment.create({
                    data: {
                        provider,
                        externalId,
                        payerName,
                        amount,
                        date,
                        status: linkedUser ? "Linked" : "Unlinked",
                        subscriberId: linkedUser ? linkedUser.id : null
                    }
                });

                if (linkedUser) {
                    await prisma.subscriber.update({
                        where: { id: linkedUser.id },
                        data: { lastPaymentAmount: amount, lastPaymentDate: date }
                    });
                }
                newPaymentsCount++;
            }
        }
    }

    logs.push(`Scan complete. Imported ${newPaymentsCount} new payments.`);
    return { success: true, logs };
}