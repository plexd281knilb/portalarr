"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/app/auth-actions";
import { encryptData, decryptData } from "@/lib/encryption";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";
import { 
    testPaymentEmailConnection, 
    scanPaymentEmailsInternal, 
    applySubscriptionForPayment,
    matchPaymentToUser 
} from "@/lib/payment-email-scraper";

async function verifyAdmin() {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
        throw new Error("Unauthorized: Admin permissions required");
    }
    return user;
}

async function verifyUser() {
    const user = await getCurrentUser();
    if (!user) {
        throw new Error("Unauthorized: Login required");
    }
    return user;
}

/**
 * Get all configured payment email sources
 */
export async function getPaymentEmailSources() {
    try {
        await verifyAdmin();
        const sources = await prisma.paymentEmailSource.findMany({
            orderBy: { createdAt: "asc" }
        });

        const safeSources = sources.map(s => ({
            id: s.id,
            name: s.name,
            host: s.host,
            port: s.port,
            secure: s.secure,
            user: s.user,
            hasPassword: !!s.pass,
            mailbox: s.mailbox,
            enabled: s.enabled,
            lastScannedAt: s.lastScannedAt,
            lastStatus: s.lastStatus,
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
        }));

        const settings = await prisma.settings.findUnique({ where: { id: "global" } });

        return {
            success: true,
            sources: safeSources,
            config: {
                paymentEmailAutoScan: settings?.paymentEmailAutoScan ?? true,
                paymentEmailScanInterval: settings?.paymentEmailScanInterval ?? 15,
                paymentEmailLookbackDays: (settings as any)?.paymentEmailLookbackDays ?? 365,
                paymentLastScanAt: settings?.paymentLastScanAt,
                paymentLastScanResult: settings?.paymentLastScanResult ? JSON.parse(settings.paymentLastScanResult) : null
            }
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to fetch email sources", sources: [] };
    }
}

/**
 * Save or update a payment email source
 */
export async function savePaymentEmailSource(formData: FormData) {
    try {
        await verifyAdmin();
        const id = (formData.get("id") as string)?.trim();
        const name = (formData.get("name") as string)?.trim();
        const host = (formData.get("host") as string)?.trim();
        const port = parseInt((formData.get("port") as string) || "993", 10) || 993;
        const secure = formData.get("secure") === "true";
        const user = (formData.get("user") as string)?.trim();
        const pass = (formData.get("pass") as string)?.trim();
        const mailbox = (formData.get("mailbox") as string)?.trim() || "INBOX";
        const enabled = formData.get("enabled") === "true";

        if (!name || !host || !user) {
            return { success: false, error: "Name, Host, and User/Email are required." };
        }

        let encryptedPass: string | undefined = undefined;
        if (pass) {
            encryptedPass = encryptData(pass);
        }

        if (id) {
            const existing = await prisma.paymentEmailSource.findUnique({ where: { id } });
            if (!existing) return { success: false, error: "Email source not found." };

            const updateData: any = {
                name,
                host,
                port,
                secure,
                user,
                mailbox,
                enabled
            };
            if (encryptedPass) {
                updateData.pass = encryptedPass;
            }

            await prisma.paymentEmailSource.update({
                where: { id },
                data: updateData
            });
        } else {
            if (!encryptedPass) {
                return { success: false, error: "Password or App Password is required for new email sources." };
            }

            await prisma.paymentEmailSource.create({
                data: {
                    name,
                    host,
                    port,
                    secure,
                    user,
                    pass: encryptedPass,
                    mailbox,
                    enabled
                }
            });
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        return { success: true, message: "Payment email source saved successfully!" };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to save payment email source." };
    }
}

/**
 * Delete a payment email source
 */
export async function deletePaymentEmailSource(id: string) {
    try {
        await verifyAdmin();
        await prisma.paymentEmailSource.delete({ where: { id } });
        revalidatePath("/settings");
        revalidatePath("/settings/access");
        return { success: true, message: "Payment email source deleted." };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to delete payment email source." };
    }
}

/**
 * Test IMAP connection for an email source
 */
export async function testPaymentEmailSourceAction(formData: FormData) {
    try {
        await verifyAdmin();
        const id = (formData.get("id") as string)?.trim();
        const host = (formData.get("host") as string)?.trim();
        const port = parseInt((formData.get("port") as string) || "993", 10) || 993;
        const secure = formData.get("secure") === "true";
        const user = (formData.get("user") as string)?.trim();
        let pass = (formData.get("pass") as string)?.trim();
        const mailbox = (formData.get("mailbox") as string)?.trim() || "INBOX";

        if (!pass && id) {
            const existing = await prisma.paymentEmailSource.findUnique({ where: { id } });
            if (existing?.pass) {
                pass = decryptData(existing.pass);
            }
        }

        if (!host || !user || !pass) {
            return { success: false, message: "Host, User, and Password are required to test connection." };
        }

        const result = await testPaymentEmailConnection({
            host,
            port,
            secure,
            user,
            pass,
            mailbox
        });

        return result;
    } catch (e: any) {
        return { success: false, message: e.message || "Test failed" };
    }
}

/**
 * Trigger payment email scan across all or specific email sources
 * @param sourceId Optional specific source ID
 * @param lookbackDays Number of days to search back (default: 365 days / 1 year)
 */
export async function scanPaymentEmailsAction(sourceId?: string, lookbackDays: number = 365) {
    try {
        await verifyAdmin();
        const result = await scanPaymentEmailsInternal(sourceId, lookbackDays);
        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");
        return result;
    } catch (e: any) {
        return {
            success: false,
            totalSources: 0,
            scannedMessages: 0,
            newPaymentsFound: 0,
            autoAttributed: 0,
            unmatched: 0,
            duplicatePaymentsSkipped: 0,
            errors: [e.message || "Failed to run payment email scan"]
        };
    }
}

/**
 * Get payment transactions
 */
export async function getPaymentTransactions(filter: string = "ALL", limit: number = 100) {
    try {
        await verifyAdmin();
        let where: any = {};
        if (filter === "UNMATCHED") {
            where.status = "UNMATCHED";
        } else if (filter === "PROCESSED") {
            where.status = "PROCESSED";
        } else if (filter === "MANUAL") {
            where.status = "MANUAL";
        }

        const transactions = await prisma.paymentTransaction.findMany({
            where,
            orderBy: { emailDate: "desc" },
            take: limit,
            include: {
                matchedUser: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        status: true,
                        subscriptionEndsAt: true
                    }
                },
                source: {
                    select: {
                        id: true,
                        name: true,
                        user: true
                    }
                }
            }
        });

        return {
            success: true,
            transactions
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to fetch transactions", transactions: [] };
    }
}

/**
 * Manually assign an unmatched payment transaction to a user
 */
export async function manuallyAttributePaymentTransaction(transactionId: string, userId: string) {
    try {
        await verifyAdmin();
        const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
        if (!tx) return { success: false, error: "Transaction not found." };

        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser) return { success: false, error: "User not found." };

        const scrapedPayment = {
            provider: tx.provider as any,
            externalTxId: tx.externalTxId || undefined,
            senderName: tx.senderName || undefined,
            senderEmail: tx.senderEmail || undefined,
            senderHandle: tx.senderHandle || undefined,
            amount: tx.amount,
            currency: tx.currency,
            note: tx.note || undefined,
            emailSubject: tx.emailSubject || "",
            emailDate: tx.emailDate,
            emailUid: tx.emailUid || ""
        };

        const { periodGrantedText } = await applySubscriptionForPayment(targetUser, scrapedPayment);

        // If target user doesn't have a real name set yet, auto-populate from sender name
        if (!targetUser.name && tx.senderName && tx.senderName.trim()) {
            await prisma.user.update({
                where: { id: targetUser.id },
                data: { name: tx.senderName.trim() }
            }).catch(() => {});
        }

        await prisma.paymentTransaction.update({
            where: { id: transactionId },
            data: {
                matchedUserId: targetUser.id,
                status: "MANUAL",
                appliedSubscription: true,
                subscriptionPeriodGranted: periodGrantedText,
                adminNotes: `Manually attributed by Admin to user "${targetUser.username}".`
            }
        });

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            message: `Successfully attributed $${tx.amount.toFixed(2)} payment to "${targetUser.username}". Granted: ${periodGrantedText}`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to attribute transaction." };
    }
}

/**
 * Auto-match unmatched payments and re-evaluate all payment subscriptions chronologically
 */
export async function reprocessPaymentTransactionsAction() {
    try {
        await verifyAdmin();
        const allTransactions = await prisma.paymentTransaction.findMany({
            orderBy: { emailDate: "asc" }
        });

        let matchedCount = 0;
        let reevaluatedCount = 0;

        for (const tx of allTransactions) {
            const scrapedPayment = {
                provider: tx.provider as any,
                externalTxId: tx.externalTxId || undefined,
                senderName: tx.senderName || undefined,
                senderEmail: tx.senderEmail || undefined,
                senderHandle: tx.senderHandle || undefined,
                amount: tx.amount,
                currency: tx.currency,
                note: tx.note || undefined,
                emailSubject: tx.emailSubject || "",
                emailDate: tx.emailDate,
                emailUid: tx.emailUid || ""
            };

            let targetUser = null;
            if (tx.matchedUserId) {
                targetUser = await prisma.user.findUnique({ where: { id: tx.matchedUserId } });
            } else {
                targetUser = await matchPaymentToUser(scrapedPayment);
            }

            if (targetUser) {
                const { periodGrantedText } = await applySubscriptionForPayment(targetUser, scrapedPayment);

                // Auto-fill real name if missing
                if (!targetUser.name && tx.senderName && tx.senderName.trim()) {
                    await prisma.user.update({
                        where: { id: targetUser.id },
                        data: { name: tx.senderName.trim() }
                    }).catch(() => {});
                }

                await prisma.paymentTransaction.update({
                    where: { id: tx.id },
                    data: {
                        matchedUserId: targetUser.id,
                        status: tx.status === "MANUAL" ? "MANUAL" : "PROCESSED",
                        appliedSubscription: true,
                        subscriptionPeriodGranted: periodGrantedText
                    }
                });

                if (!tx.matchedUserId) {
                    matchedCount++;
                } else {
                    reevaluatedCount++;
                }
            }
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            message: `Successfully reprocessed payments: ${matchedCount} newly auto-matched, ${reevaluatedCount} existing re-aligned.`,
            matchedCount,
            reevaluatedCount,
            totalTransactions: allTransactions.length
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to reprocess payment transactions." };
    }
}

/**
 * Save automated scraper scan intervals & toggle
 */
export async function savePaymentEmailScraperConfig(formData: FormData) {
    try {
        await verifyAdmin();
        const paymentEmailAutoScan = formData.get("paymentEmailAutoScan") === "true";
        const paymentEmailScanInterval = parseInt((formData.get("paymentEmailScanInterval") as string) || "15", 10) || 15;
        const lookbackRaw = formData.get("paymentEmailLookbackDays");
        const paymentEmailLookbackDays = lookbackRaw !== null ? (parseInt(lookbackRaw as string, 10) || 365) : undefined;

        const updateData: any = {
            paymentEmailAutoScan,
            paymentEmailScanInterval
        };
        if (paymentEmailLookbackDays !== undefined) {
            updateData.paymentEmailLookbackDays = paymentEmailLookbackDays;
        }

        const createData: any = {
            id: "global",
            paymentEmailAutoScan,
            paymentEmailScanInterval
        };
        if (paymentEmailLookbackDays !== undefined) {
            createData.paymentEmailLookbackDays = paymentEmailLookbackDays;
        }

        await prisma.settings.upsert({
            where: { id: "global" },
            update: updateData,
            create: createData
        });

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        return { success: true, message: "Payment scraper schedule saved successfully!" };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to save configuration." };
    }
}

/**
 * "Check Access & Payment Status" trigger
 * Pings payment email sources to scan for any recent payments, updates user access, and returns live status
 */
export async function recheckUserAccessAndPaymentAction() {
    try {
        const user: any = await verifyUser();
        
        // 1. Run email scraper in background to pick up any recent payments
        let scanResult: any = null;
        try {
            scanResult = await scanPaymentEmailsInternal();
        } catch (scanErr: any) {
            console.warn("[RECHECK-ACCESS] Payment scan warning:", scanErr.message);
        }

        // 2. Fetch fresh user data from database
        const freshUser = await prisma.user.findUnique({
            where: { id: user.id },
            select: {
                id: true,
                username: true,
                email: true,
                kindleEmail: true,
                role: true,
                status: true,
                trialEndsAt: true,
                subscriptionEndsAt: true,
                convertedAt: true,
                plexUsername: true,
                plexEmail: true
            }
        });

        // 3. Fetch recent payments attributed to this user
        const userPayments = await prisma.paymentTransaction.findMany({
            where: { matchedUserId: user.id },
            orderBy: { emailDate: "desc" },
            take: 5
        });

        const isSubscribed = freshUser?.status === "APPROVED" && (
            !freshUser.subscriptionEndsAt || new Date(freshUser.subscriptionEndsAt) > new Date()
        );
        const isTrial = freshUser?.status === "TRIAL" && (
            freshUser.trialEndsAt ? new Date(freshUser.trialEndsAt) > new Date() : false
        );

        let statusText = "Pending Access";
        if (freshUser?.role === "ADMIN") statusText = "Server Administrator";
        else if (isSubscribed) statusText = `Active Subscription (Expires ${freshUser?.subscriptionEndsAt ? new Date(freshUser.subscriptionEndsAt).toLocaleDateString() : 'Never'})`;
        else if (isTrial) statusText = `Active Trial (Expires ${freshUser?.trialEndsAt ? new Date(freshUser.trialEndsAt).toLocaleDateString() : 'Soon'})`;
        else if (freshUser?.status === "EXPIRED") statusText = "Subscription Expired";

        return {
            success: true,
            user: freshUser,
            isSubscribed,
            isTrial,
            statusText,
            recentPayments: userPayments,
            scanSummary: scanResult ? {
                newPaymentsFound: scanResult.newPaymentsFound,
                autoAttributed: scanResult.autoAttributed
            } : null,
            message: scanResult?.newPaymentsFound 
                ? `Checked payment emails: Found ${scanResult.newPaymentsFound} payment(s), attributed to your account!`
                : `Account and email verification complete. Status: ${statusText}.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to recheck access status" };
    }
}

/**
 * Delete a single payment transaction
 */
export async function deletePaymentTransactionAction(transactionId: string) {
    try {
        await verifyAdmin();
        if (!transactionId) return { success: false, error: "Transaction ID is required." };

        await prisma.paymentTransaction.delete({
            where: { id: transactionId }
        });

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            message: "Payment transaction deleted successfully."
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to delete payment transaction." };
    }
}

/**
 * Purge all unmatched payment transactions (e.g. noise, old records)
 */
export async function purgeUnmatchedPaymentTransactionsAction() {
    try {
        await verifyAdmin();

        const result = await prisma.paymentTransaction.deleteMany({
            where: { status: "UNMATCHED" }
        });

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            count: result.count,
            message: `Successfully purged ${result.count} unmatched payment transaction(s).`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to purge unmatched payment transactions." };
    }
}

