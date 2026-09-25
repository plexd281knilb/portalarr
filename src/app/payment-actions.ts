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
    calculateAlignedExpiryDate,
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
export async function scanPaymentEmailsAction(sourceId?: string, lookbackDays?: number) {
    try {
        await verifyAdmin();
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        const effectiveLookback = typeof lookbackDays === "number" && !isNaN(lookbackDays)
            ? lookbackDays
            : (settings?.paymentEmailLookbackDays ?? 365);

        // Ensure database settings persists the lookback window
        if (typeof lookbackDays === "number" && !isNaN(lookbackDays)) {
            await prisma.settings.upsert({
                where: { id: "global" },
                update: { paymentEmailLookbackDays: lookbackDays },
                create: { id: "global", paymentEmailLookbackDays: lookbackDays }
            }).catch(() => {});
        }

        const result = await scanPaymentEmailsInternal(sourceId, effectiveLookback);
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
        const parsedLookback = lookbackRaw !== null && lookbackRaw !== "" ? parseInt(lookbackRaw as string, 10) : undefined;
        const paymentEmailLookbackDays = parsedLookback !== undefined && !isNaN(parsedLookback) ? parsedLookback : undefined;

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
            paymentEmailScanInterval,
            paymentEmailLookbackDays: paymentEmailLookbackDays ?? 365
        };

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

/**
 * Helper to recalculate a user's subscription and Plex access based on their currently matched payments.
 */
export async function recalculateUserSubscriptionFromPayments(userId: string) {
    if (!userId) return;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    if (user.role === "ADMIN") return;

    const matchedPayments = await prisma.paymentTransaction.findMany({
        where: { matchedUserId: userId },
        orderBy: { emailDate: "asc" }
    });

    if (matchedPayments.length === 0) {
        // Only expire if user is not on a valid trial or permanent grant
        const isPermanent = user.status === "APPROVED" && !user.subscriptionEndsAt && !user.trialEndsAt;
        const isTrial = user.status === "TRIAL" && user.trialEndsAt && new Date(user.trialEndsAt) > new Date();

        if (!isPermanent && !isTrial) {
            await prisma.user.update({
                where: { id: userId },
                data: {
                    status: "EXPIRED",
                    subscriptionEndsAt: null
                }
            });
            try {
                const { revokePlexAccessForUserInternal } = await import("./actions");
                await revokePlexAccessForUserInternal(user, "All linked payments have been unmatched.");
            } catch (e) {}
        }
        return;
    }

    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    const yearlyPrice = settings?.yearlyPrice || 180;
    const monthlyPrice = settings?.monthlyPrice || 15;

    let currentExpiry: Date | null = null;

    for (const tx of matchedPayments) {
        const paymentDate = new Date(tx.emailDate);
        const { newExpiryDate, periodGrantedText } = calculateAlignedExpiryDate({
            paymentDate,
            totalAmount: tx.amount,
            yearlyPrice,
            monthlyPrice,
            existingExpiry: currentExpiry
        });
        currentExpiry = newExpiryDate;

        await prisma.paymentTransaction.update({
            where: { id: tx.id },
            data: {
                appliedSubscription: true,
                subscriptionPeriodGranted: periodGrantedText
            }
        });
    }

    const now = new Date();
    const isCurrentlyActive = currentExpiry ? currentExpiry > now : false;
    const newStatus = isCurrentlyActive ? "APPROVED" : "EXPIRED";

    await prisma.user.update({
        where: { id: userId },
        data: {
            status: newStatus,
            subscriptionEndsAt: currentExpiry
        }
    });

    if (isCurrentlyActive && currentExpiry) {
        try {
            const { setUserTrialOrSubscription } = await import("./actions");
            await setUserTrialOrSubscription(userId, "CUSTOM", currentExpiry.toISOString());
        } catch (e) {}
    } else {
        try {
            const { revokePlexAccessForUserInternal } = await import("./actions");
            await revokePlexAccessForUserInternal(user, "Subscription period has ended.");
        } catch (e) {}
    }
}

/**
 * Unmatch a single payment transaction from a user
 */
export async function unmatchPaymentTransactionAction(transactionId: string) {
    try {
        await verifyAdmin();
        if (!transactionId) return { success: false, error: "Transaction ID is required." };

        const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
        if (!tx) return { success: false, error: "Payment transaction not found." };

        const previousUserId = tx.matchedUserId;

        await prisma.paymentTransaction.update({
            where: { id: transactionId },
            data: {
                matchedUserId: null,
                status: "UNMATCHED",
                appliedSubscription: false,
                subscriptionPeriodGranted: null,
                adminNotes: `Unmatched by Admin on ${new Date().toLocaleDateString()}`
            }
        });

        if (previousUserId) {
            await recalculateUserSubscriptionFromPayments(previousUserId);
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            message: `Successfully unlinked $${tx.amount.toFixed(2)} payment.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to unmatch payment transaction." };
    }
}

/**
 * Unmatch multiple payment transactions
 */
export async function unmatchMultiplePaymentTransactionsAction(transactionIds: string[]) {
    try {
        await verifyAdmin();
        if (!transactionIds || transactionIds.length === 0) {
            return { success: false, error: "No transactions provided." };
        }

        const txs = await prisma.paymentTransaction.findMany({
            where: { id: { in: transactionIds } }
        });

        const affectedUserIds = new Set<string>();

        for (const tx of txs) {
            if (tx.matchedUserId) affectedUserIds.add(tx.matchedUserId);
            await prisma.paymentTransaction.update({
                where: { id: tx.id },
                data: {
                    matchedUserId: null,
                    status: "UNMATCHED",
                    appliedSubscription: false,
                    subscriptionPeriodGranted: null,
                    adminNotes: `Bulk unmatched by Admin on ${new Date().toLocaleDateString()}`
                }
            });
        }

        for (const uId of affectedUserIds) {
            await recalculateUserSubscriptionFromPayments(uId);
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            count: txs.length,
            message: `Successfully unlinked ${txs.length} payment transaction(s).`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to unmatch payment transactions." };
    }
}

/**
 * Group multiple payment transactions together and attribute them to a single user
 */
export async function groupAndAttributePaymentsAction(transactionIds: string[], userId: string, customNote?: string) {
    try {
        await verifyAdmin();
        if (!transactionIds || transactionIds.length === 0) {
            return { success: false, error: "No transactions selected to group." };
        }
        if (!userId) return { success: false, error: "Target user is required." };

        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser) return { success: false, error: "Target user not found." };

        const transactions = await prisma.paymentTransaction.findMany({
            where: { id: { in: transactionIds } },
            orderBy: { emailDate: "asc" }
        });

        if (transactions.length === 0) {
            return { success: false, error: "No matching transactions found." };
        }

        const previousUserIds = new Set<string>();
        for (const tx of transactions) {
            if (tx.matchedUserId && tx.matchedUserId !== userId) {
                previousUserIds.add(tx.matchedUserId);
            }
        }

        const totalAmount = transactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
        const primaryTx = transactions[0];

        const scrapedCombined = {
            provider: primaryTx.provider as any,
            externalTxId: primaryTx.externalTxId || undefined,
            senderName: primaryTx.senderName || undefined,
            senderEmail: primaryTx.senderEmail || undefined,
            senderHandle: primaryTx.senderHandle || undefined,
            amount: totalAmount,
            currency: primaryTx.currency || "USD",
            note: customNote || transactions.map(t => t.note).filter(Boolean).join(" | ") || undefined,
            emailSubject: primaryTx.emailSubject || "",
            emailDate: primaryTx.emailDate || new Date(),
            emailUid: primaryTx.emailUid || ""
        };

        const { periodGrantedText } = await applySubscriptionForPayment(targetUser, scrapedCombined);

        // If target user doesn't have a real name set, try to use sender name
        if (!targetUser.name && primaryTx.senderName && primaryTx.senderName.trim()) {
            await prisma.user.update({
                where: { id: targetUser.id },
                data: { name: primaryTx.senderName.trim() }
            }).catch(() => {});
        }

        for (let i = 0; i < transactions.length; i++) {
            const tx = transactions[i];
            await prisma.paymentTransaction.update({
                where: { id: tx.id },
                data: {
                    matchedUserId: targetUser.id,
                    status: "MANUAL",
                    appliedSubscription: true,
                    subscriptionPeriodGranted: `Grouped (${transactions.length} payments, total $${totalAmount.toFixed(2)}): ${periodGrantedText}`,
                    adminNotes: customNote ? `Grouped payment: ${customNote}` : `Grouped with ${transactions.length} payments for user "${targetUser.username}".`
                }
            });
        }

        for (const prevId of previousUserIds) {
            await recalculateUserSubscriptionFromPayments(prevId);
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            message: `Successfully grouped ${transactions.length} payments ($${totalAmount.toFixed(2)}) for "${targetUser.username}". Granted: ${periodGrantedText}`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to group payments." };
    }
}

/**
 * Split a payment transaction into multiple separate payments
 */
export async function splitPaymentTransactionAction(
    originalTxId: string, 
    splits: { amount: number; userId?: string | null; note?: string }[]
) {
    try {
        await verifyAdmin();
        if (!originalTxId) return { success: false, error: "Original transaction ID is required." };
        if (!Array.isArray(splits) || splits.length < 2) {
            return { success: false, error: "At least 2 split parts are required." };
        }

        const originalTx = await prisma.paymentTransaction.findUnique({
            where: { id: originalTxId }
        });
        if (!originalTx) return { success: false, error: "Original transaction not found." };

        const totalSplitAmount = splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
        if (Math.abs(totalSplitAmount - originalTx.amount) > 0.01) {
            return {
                success: false,
                error: `Total split amount ($${totalSplitAmount.toFixed(2)}) must equal the original payment amount ($${originalTx.amount.toFixed(2)}).`
            };
        }

        const previousUserId = originalTx.matchedUserId;
        const affectedUserIds = new Set<string>();
        if (previousUserId) affectedUserIds.add(previousUserId);

        // 1. Update the original transaction to become Split #1
        const split1 = splits[0];
        const split1Amount = Number(split1.amount);
        let split1User = null;
        let split1PeriodText: string | null = null;

        if (split1.userId) {
            split1User = await prisma.user.findUnique({ where: { id: split1.userId } });
            if (split1User) {
                affectedUserIds.add(split1User.id);
                const scraped1 = {
                    provider: originalTx.provider as any,
                    externalTxId: originalTx.externalTxId || undefined,
                    senderName: originalTx.senderName || undefined,
                    senderEmail: originalTx.senderEmail || undefined,
                    senderHandle: originalTx.senderHandle || undefined,
                    amount: split1Amount,
                    currency: originalTx.currency,
                    note: split1.note || originalTx.note || undefined,
                    emailSubject: originalTx.emailSubject || "",
                    emailDate: originalTx.emailDate,
                    emailUid: originalTx.emailUid || ""
                };
                const res = await applySubscriptionForPayment(split1User, scraped1);
                split1PeriodText = res.periodGrantedText;
            }
        }

        await prisma.paymentTransaction.update({
            where: { id: originalTx.id },
            data: {
                amount: split1Amount,
                note: split1.note || originalTx.note,
                matchedUserId: split1User ? split1User.id : null,
                status: split1User ? "MANUAL" : "UNMATCHED",
                appliedSubscription: Boolean(split1User),
                subscriptionPeriodGranted: split1PeriodText,
                adminNotes: `Split 1 of ${splits.length} (from original $${originalTx.amount.toFixed(2)})`
            }
        });

        // 2. Create new transactions for Split #2..N
        for (let i = 1; i < splits.length; i++) {
            const splitItem = splits[i];
            const splitAmount = Number(splitItem.amount);
            let splitUser = null;
            let splitPeriodText: string | null = null;

            if (splitItem.userId) {
                splitUser = await prisma.user.findUnique({ where: { id: splitItem.userId } });
                if (splitUser) {
                    affectedUserIds.add(splitUser.id);
                }
            }

            const newTx = await prisma.paymentTransaction.create({
                data: {
                    sourceId: originalTx.sourceId,
                    provider: originalTx.provider,
                    externalTxId: originalTx.externalTxId ? `${originalTx.externalTxId}-split-${i + 1}` : null,
                    senderName: originalTx.senderName,
                    senderEmail: originalTx.senderEmail,
                    senderHandle: originalTx.senderHandle,
                    amount: splitAmount,
                    currency: originalTx.currency,
                    note: splitItem.note || originalTx.note,
                    emailSubject: originalTx.emailSubject,
                    emailDate: originalTx.emailDate,
                    emailUid: originalTx.emailUid,
                    matchedUserId: splitUser ? splitUser.id : null,
                    status: splitUser ? "MANUAL" : "UNMATCHED",
                    appliedSubscription: false,
                    adminNotes: `Split ${i + 1} of ${splits.length} (from original $${originalTx.amount.toFixed(2)})`
                }
            });

            if (splitUser) {
                const scrapedSplit = {
                    provider: originalTx.provider as any,
                    externalTxId: newTx.externalTxId || undefined,
                    senderName: originalTx.senderName || undefined,
                    senderEmail: originalTx.senderEmail || undefined,
                    senderHandle: originalTx.senderHandle || undefined,
                    amount: splitAmount,
                    currency: originalTx.currency,
                    note: splitItem.note || originalTx.note || undefined,
                    emailSubject: originalTx.emailSubject || "",
                    emailDate: originalTx.emailDate,
                    emailUid: originalTx.emailUid || ""
                };
                const res = await applySubscriptionForPayment(splitUser, scrapedSplit);
                splitPeriodText = res.periodGrantedText;

                await prisma.paymentTransaction.update({
                    where: { id: newTx.id },
                    data: {
                        appliedSubscription: true,
                        subscriptionPeriodGranted: splitPeriodText
                    }
                });
            }
        }

        // 3. Recalculate any affected users
        for (const uId of affectedUserIds) {
            await recalculateUserSubscriptionFromPayments(uId);
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            message: `Successfully split $${originalTx.amount.toFixed(2)} payment into ${splits.length} parts.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to split payment transaction." };
    }
}

/**
 * Bulk delete payment transactions
 */
export async function bulkDeletePaymentTransactionsAction(transactionIds: string[]) {
    try {
        await verifyAdmin();
        if (!transactionIds || transactionIds.length === 0) {
            return { success: false, error: "No transactions selected." };
        }

        const txs = await prisma.paymentTransaction.findMany({
            where: { id: { in: transactionIds } }
        });

        const affectedUserIds = new Set<string>();
        for (const tx of txs) {
            if (tx.matchedUserId) affectedUserIds.add(tx.matchedUserId);
        }

        const result = await prisma.paymentTransaction.deleteMany({
            where: { id: { in: transactionIds } }
        });

        for (const uId of affectedUserIds) {
            await recalculateUserSubscriptionFromPayments(uId);
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            count: result.count,
            message: `Successfully deleted ${result.count} payment transaction(s).`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to delete payment transactions." };
    }
}


