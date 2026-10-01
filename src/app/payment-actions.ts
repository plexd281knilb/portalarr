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
                paymentEmailLookbackDays: (settings as any)?.paymentEmailLookbackDays ?? 1,
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
            : (settings?.paymentEmailLookbackDays ?? 1);

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

        const previousUserId = tx.matchedUserId;

        // If target user doesn't have a real name set yet, auto-populate from sender name
        if (!targetUser.name && tx.senderName && tx.senderName.trim()) {
            await prisma.user.update({
                where: { id: targetUser.id },
                data: { name: tx.senderName.trim() }
            }).catch(() => {});
        }

        // 1. Link transaction to target user
        await prisma.paymentTransaction.update({
            where: { id: transactionId },
            data: {
                matchedUserId: targetUser.id,
                status: "MANUAL",
                appliedSubscription: true,
                adminNotes: `Manually attributed by Admin to user "${targetUser.username}".`
            }
        });

        // 2. Recalculate target user's subscription from their actual matched transactions
        await recalculateUserSubscriptionFromPayments(targetUser.id);

        // 3. If previously matched to a different user, recalculate that user too so no secret credit remains!
        if (previousUserId && previousUserId !== targetUser.id) {
            await recalculateUserSubscriptionFromPayments(previousUserId);
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        const updatedTarget = await prisma.user.findUnique({ where: { id: targetUser.id } });
        const expiryFormatted = updatedTarget?.subscriptionEndsAt 
            ? new Date(updatedTarget.subscriptionEndsAt).toLocaleDateString() 
            : "Active";

        return {
            success: true,
            message: `Successfully attributed $${tx.amount.toFixed(2)} payment to "${targetUser.username}". Subscription valid until: ${expiryFormatted}`
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

        const affectedUserIds = new Set<string>();
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
                affectedUserIds.add(targetUser.id);

                if (!tx.matchedUserId) {
                    await prisma.paymentTransaction.update({
                        where: { id: tx.id },
                        data: {
                            matchedUserId: targetUser.id,
                            status: "PROCESSED",
                            appliedSubscription: true
                        }
                    });
                    matchedCount++;
                } else {
                    reevaluatedCount++;
                }

                // Auto-fill real name if missing
                if (!targetUser.name && tx.senderName && tx.senderName.trim()) {
                    await prisma.user.update({
                        where: { id: targetUser.id },
                        data: { name: tx.senderName.trim() }
                    }).catch(() => {});
                }
            }
        }

        // Recalculate each affected user's subscription deterministically from scratch
        for (const uId of affectedUserIds) {
            await recalculateUserSubscriptionFromPayments(uId);
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
            paymentEmailLookbackDays: paymentEmailLookbackDays ?? 1
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

        const tx = await prisma.paymentTransaction.findUnique({ where: { id: transactionId } });
        if (!tx) return { success: false, error: "Payment transaction not found." };

        const previousUserId = tx.matchedUserId;

        await prisma.paymentTransaction.delete({
            where: { id: transactionId }
        });

        if (previousUserId) {
            await recalculateUserSubscriptionFromPayments(previousUserId);
        }

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
    let finalCadence: "YEARLY" | "MONTHLY" = "YEARLY";

    for (const tx of matchedPayments) {
        const paymentDate = new Date(tx.emailDate);
        const { newExpiryDate, periodGrantedText, cadence } = calculateAlignedExpiryDate({
            paymentDate,
            totalAmount: tx.amount,
            yearlyPrice,
            monthlyPrice,
            existingExpiry: currentExpiry
        });
        currentExpiry = newExpiryDate;
        finalCadence = cadence;

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

    const newTier = (user.membershipTier === "TRIAL" || !user.membershipTier) && newStatus === "APPROVED" 
        ? "STANDARD" 
        : user.membershipTier;
    await prisma.user.update({
        where: { id: userId },
        data: {
            status: newStatus,
            membershipTier: newTier,
            subscriptionCadence: finalCadence,
            trialEndsAt: newStatus === "APPROVED" ? null : user.trialEndsAt,
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
                    adminNotes: customNote ? `Grouped payment: ${customNote}` : `Grouped with ${transactions.length} payments for user "${targetUser.username}".`
                }
            });
        }

        // Recalculate target user
        await recalculateUserSubscriptionFromPayments(targetUser.id);

        // Recalculate previous users so no secret credit remains
        for (const prevId of previousUserIds) {
            await recalculateUserSubscriptionFromPayments(prevId);
        }

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        const updatedUser = await prisma.user.findUnique({ where: { id: targetUser.id } });
        const expiryFormatted = updatedUser?.subscriptionEndsAt 
            ? new Date(updatedUser.subscriptionEndsAt).toLocaleDateString() 
            : "Active";

        return {
            success: true,
            message: `Successfully grouped ${transactions.length} payments ($${totalAmount.toFixed(2)}) for "${targetUser.username}". Subscription valid until: ${expiryFormatted}`
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

        if (split1.userId) {
            split1User = await prisma.user.findUnique({ where: { id: split1.userId } });
            if (split1User) {
                affectedUserIds.add(split1User.id);
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
                adminNotes: `Split 1 of ${splits.length} (from original $${originalTx.amount.toFixed(2)})`
            }
        });

        // 2. Create new transactions for Split #2..N
        for (let i = 1; i < splits.length; i++) {
            const splitItem = splits[i];
            const splitAmount = Number(splitItem.amount);
            let splitUser = null;

            if (splitItem.userId) {
                splitUser = await prisma.user.findUnique({ where: { id: splitItem.userId } });
                if (splitUser) {
                    affectedUserIds.add(splitUser.id);
                }
            }

            await prisma.paymentTransaction.create({
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
                    appliedSubscription: Boolean(splitUser),
                    adminNotes: `Split ${i + 1} of ${splits.length} (from original $${originalTx.amount.toFixed(2)})`
                }
            });
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

/**
 * Manually record a payment for a member (e.g. offline cash, Venmo/Zelle without email)
 */
export async function recordManualPaymentAction(data: {
    userId: string;
    amount: number;
    paymentDate?: string | Date;
    provider?: string;
    note?: string;
}) {
    try {
        await verifyAdmin();
        const { userId, amount, paymentDate, provider, note } = data;
        if (!userId) return { success: false, error: "Member is required." };
        const numAmount = Number(amount);
        if (isNaN(numAmount) || numAmount <= 0) {
            return { success: false, error: "Please enter a valid payment amount." };
        }

        const targetUser = await prisma.user.findUnique({ where: { id: userId } });
        if (!targetUser) return { success: false, error: "Member not found." };

        const pDate = paymentDate ? new Date(paymentDate) : new Date();
        const prov = (provider || "MANUAL").toUpperCase();

        const tx = await prisma.paymentTransaction.create({
            data: {
                provider: prov,
                amount: numAmount,
                currency: "USD",
                note: note || `Manual ${prov} payment recorded by Admin`,
                emailSubject: `Manual Payment: $${numAmount.toFixed(2)} (${prov})`,
                emailDate: pDate,
                matchedUserId: targetUser.id,
                status: "MANUAL",
                appliedSubscription: true,
                adminNotes: `Recorded by Admin on ${new Date().toLocaleDateString()}`
            }
        });

        // Recalculate user subscription from their matched payments
        await recalculateUserSubscriptionFromPayments(targetUser.id);

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        return {
            success: true,
            transactionId: tx.id,
            message: `Successfully recorded $${numAmount.toFixed(2)} payment for "${targetUser.username}".`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to record manual payment." };
    }
}

/**
 * Update a user's subscription billing cadence (Annual vs Monthly)
 */
export async function updateUserSubscriptionCadenceAction(userId: string, cadence: "YEARLY" | "MONTHLY") {
    try {
        await verifyAdmin();
        if (!userId) return { success: false, error: "User ID is required." };
        if (cadence !== "YEARLY" && cadence !== "MONTHLY") {
            return { success: false, error: "Invalid cadence. Must be YEARLY or MONTHLY." };
        }

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) return { success: false, error: "User not found." };

        await prisma.user.update({
            where: { id: userId },
            data: { subscriptionCadence: cadence }
        });

        revalidatePath("/settings");
        revalidatePath("/settings/access");
        revalidatePath("/settings/profile");

        logger.addLog("INFO", "DATABASE", `Admin updated subscription cadence for "${user.username}" to ${cadence}`);
        return {
            success: true,
            message: `Updated @${user.username}'s plan cadence to ${cadence === "YEARLY" ? "Annual ($180/yr)" : "Monthly ($15/mo)"}.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to update subscription cadence." };
    }
}

/**
 * Automated sweep to check active subscriptions and trials,
 * dispatching advance expiration and renewal warnings:
 * - Yearly plan: multi-stage warnings at 30, 14, 7, 3, and 1 days before expiration
 * - Monthly plan: warnings at 3 and 1 days before expiration
 * - Trial: warning at 3 days before trial ends
 *
 * Uses cycle-based milestone deduplication to guarantee 100% idempotency (zero duplicate emails).
 */
export async function sendSubscriptionRenewalRemindersInternal(): Promise<{
    success: boolean;
    scannedUsers: number;
    remindersSent: number;
    details: Array<{ username: string; plan: string; milestone: string; daysRemaining: number }>;
}> {
    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    if (!settings || !settings.emailNotificationsEnabled || settings.notifySubscriptionRenewal === false) {
        return { success: true, scannedUsers: 0, remindersSent: 0, details: [] };
    }

    const now = new Date();
    const yearlyPrice = settings.yearlyPrice || 180;
    const monthlyPrice = settings.monthlyPrice || 15;
    const { getAppUrl } = await import("@/lib/app-url");
    const appUrl = await getAppUrl();
    const { renderEmailTemplate } = await import("@/lib/email-templates");
    const { sendOrQueueEmail } = await import("@/app/actions");
    const { calculateUserRenewalSummary } = await import("@/lib/referral-rewards");

    const remindersSent: Array<{ username: string; plan: string; milestone: string; daysRemaining: number }> = [];

    // 1. Process Active Subscribed Members
    const activeMembers = await prisma.user.findMany({
        where: {
            status: "APPROVED",
            role: { not: "ADMIN" },
            subscriptionEndsAt: { not: null }
        },
        include: {
            notificationPreference: true,
            referrals: {
                select: {
                    id: true,
                    username: true,
                    name: true,
                    status: true,
                    convertedAt: true
                }
            }
        }
    });

    for (const member of activeMembers) {
        if (!member.email || !member.subscriptionEndsAt) continue;
        // Respect user notification preferences
        if (member.notificationPreference && member.notificationPreference.emailSubscriptionReminders === false) {
            continue;
        }

        const expiryDate = new Date(member.subscriptionEndsAt);
        const msRemaining = expiryDate.getTime() - now.getTime();
        const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

        // Only evaluate if within 31 days and not already expired
        if (daysRemaining <= 0 || daysRemaining > 31) continue;

        // Determine plan cadence
        const cadence = (member.subscriptionCadence || (
            expiryDate.getMonth() === 0 && expiryDate.getDate() === 1 ? "YEARLY" : "MONTHLY"
        )).toUpperCase();

        const isYearly = cadence === "YEARLY";

        // Cycle target key for idempotency: e.g. "2027-01-01"
        const cycleTarget = expiryDate.toISOString().slice(0, 10);
        let reminderState: { cycleTarget: string; milestones: string[] } = {
            cycleTarget,
            milestones: []
        };

        if (member.renewalRemindersSent) {
            try {
                const parsed = JSON.parse(member.renewalRemindersSent);
                if (parsed && parsed.cycleTarget === cycleTarget && Array.isArray(parsed.milestones)) {
                    reminderState = parsed;
                }
            } catch (_) {}
        }

        let dueMilestone: string | null = null;
        let milestoneLabel = "";

        if (isYearly) {
            // Yearly Plan: 30d, 14d, 7d, 3d, 1d milestones
            if (daysRemaining <= 30 && daysRemaining > 14 && !reminderState.milestones.includes("30d")) {
                dueMilestone = "30d";
                milestoneLabel = "30 Days";
            } else if (daysRemaining <= 14 && daysRemaining > 7 && !reminderState.milestones.includes("14d")) {
                dueMilestone = "14d";
                milestoneLabel = "14 Days";
            } else if (daysRemaining <= 7 && daysRemaining > 3 && !reminderState.milestones.includes("7d")) {
                dueMilestone = "7d";
                milestoneLabel = "7 Days";
            } else if (daysRemaining <= 3 && daysRemaining > 1 && !reminderState.milestones.includes("3d")) {
                dueMilestone = "3d";
                milestoneLabel = "3 Days";
            } else if (daysRemaining <= 1 && daysRemaining > 0 && !reminderState.milestones.includes("1d")) {
                dueMilestone = "1d";
                milestoneLabel = "1 Day";
            }
        } else {
            // Monthly Plan: 3d and 1d milestones
            if (daysRemaining <= 3 && daysRemaining > 1 && !reminderState.milestones.includes("3d")) {
                dueMilestone = "3d";
                milestoneLabel = "3 Days";
            } else if (daysRemaining <= 1 && daysRemaining > 0 && !reminderState.milestones.includes("1d")) {
                dueMilestone = "1d";
                milestoneLabel = "1 Day";
            }
        }

        if (dueMilestone) {
            try {
                const summary = calculateUserRenewalSummary({
                    user: member,
                    yearlyPrice,
                    monthlyPrice
                });

                const renewalDateStr = summary.expirationDateFormatted || new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(expiryDate);
                const friendNamesStr = summary.convertedFriends.map(f => `@${f.username}`).join(", ");
                const referralDiscountText = summary.convertedReferralsCount > 0
                    ? `-$${summary.rewardDiscountAmount.toFixed(2)} (${summary.convertedReferralsCount} friend${summary.convertedReferralsCount > 1 ? "s" : ""} referred: ${friendNamesStr})`
                    : "No active referral credits";
                const monthlyAlternativeText = summary.delayedMonthlyStartDate
                    ? `$${monthlyPrice}/month starting ${summary.delayedMonthlyStartDate}`
                    : `$${monthlyPrice}/month starting ${renewalDateStr}`;

                const templateId = isYearly ? "subscription_renewal_reminder_yearly" : "subscription_renewal_reminder_monthly";
                const netAmountDue = isYearly 
                    ? `$${summary.discountedYearlyPrice.toFixed(2)}` 
                    : `$${monthlyPrice.toFixed(2)}`;

                const { subject, html } = await renderEmailTemplate(templateId, {
                    username: member.username,
                    daysRemaining: String(daysRemaining),
                    renewalDate: renewalDateStr,
                    basePrice: isYearly ? `$${yearlyPrice.toFixed(2)} / year` : `$${monthlyPrice.toFixed(2)} / month`,
                    referralDiscountText,
                    amountDue: netAmountDue,
                    monthlyAlternativeText,
                    referralNoticeDetails: summary.reminderNoticeText,
                    paymentMemo: member.username,
                    billingUrl: `${appUrl}/settings/profile#billing`,
                    appUrl
                });

                await sendOrQueueEmail({
                    to: member.email,
                    subject,
                    html,
                    templateId,
                    targetUser: member.username,
                    userId: member.id
                });

                // Update user milestone tracking
                reminderState.milestones.push(dueMilestone);
                await prisma.user.update({
                    where: { id: member.id },
                    data: {
                        lastRenewalReminderSentAt: now,
                        renewalRemindersSent: JSON.stringify(reminderState)
                    }
                });

                remindersSent.push({
                    username: member.username,
                    plan: isYearly ? "Yearly" : "Monthly",
                    milestone: dueMilestone,
                    daysRemaining
                });

                logger.addLog("INFO", "EMAIL", `[RENEWAL-REMINDER] Dispatched ${isYearly ? 'Annual' : 'Monthly'} (${milestoneLabel}) reminder to "${member.username}" (${member.email}). Amount due: ${netAmountDue}`);
            } catch (remErr: any) {
                logger.addLog("WARN", "EMAIL", `[RENEWAL-REMINDER] Failed to dispatch reminder to "${member.username}": ${remErr.message}`);
            }
        }
    }

    // 2. Also process Trials Expiring Soon (if notifyTrialExpiring is enabled)
    if (settings.notifyTrialExpiring) {
        const expiringTrials = await prisma.user.findMany({
            where: {
                status: "TRIAL",
                role: { not: "ADMIN" },
                trialEndsAt: { not: null }
            }
        });

        for (const tUser of expiringTrials) {
            if (!tUser.email || !tUser.trialEndsAt) continue;
            const tExpiry = new Date(tUser.trialEndsAt);
            const msLeft = tExpiry.getTime() - now.getTime();
            const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

            if (daysLeft <= 0 || daysLeft > 3) continue;

            const tCycleTarget = tExpiry.toISOString().slice(0, 10);
            let tReminderState: { cycleTarget: string; milestones: string[] } = {
                cycleTarget: tCycleTarget,
                milestones: []
            };

            if (tUser.renewalRemindersSent) {
                try {
                    const parsed = JSON.parse(tUser.renewalRemindersSent);
                    if (parsed && parsed.cycleTarget === tCycleTarget && Array.isArray(parsed.milestones)) {
                        tReminderState = parsed;
                    }
                } catch (_) {}
            }

            if (!tReminderState.milestones.includes("trial_expiring")) {
                try {
                    const formattedExp = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(tExpiry);
                    const { subject, html } = await renderEmailTemplate("trial_expiring_soon", {
                        username: tUser.username,
                        email: tUser.email,
                        daysRemaining: String(daysLeft),
                        expirationDate: formattedExp,
                        renewUrl: `${appUrl}/settings/profile#billing`,
                        appUrl
                    });

                    await sendOrQueueEmail({
                        to: tUser.email,
                        subject,
                        html,
                        templateId: "trial_expiring_soon",
                        targetUser: tUser.username,
                        userId: tUser.id
                    });

                    tReminderState.milestones.push("trial_expiring");
                    await prisma.user.update({
                        where: { id: tUser.id },
                        data: {
                            lastRenewalReminderSentAt: now,
                            renewalRemindersSent: JSON.stringify(tReminderState)
                        }
                    });

                    remindersSent.push({
                        username: tUser.username,
                        plan: "Trial",
                        milestone: "trial_expiring",
                        daysRemaining: daysLeft
                    });

                    logger.addLog("INFO", "EMAIL", `[TRIAL-REMINDER] Dispatched trial expiring notice to "${tUser.username}" (${tUser.email})`);
                } catch (tErr: any) {
                    logger.addLog("WARN", "EMAIL", `[TRIAL-REMINDER] Failed to dispatch trial reminder to "${tUser.username}": ${tErr.message}`);
                }
            }
        }
    }

    return {
        success: true,
        scannedUsers: activeMembers.length,
        remindersSent: remindersSent.length,
        details: remindersSent
    };
}

/**
 * Admin action to trigger a manual subscription renewal reminder sweep
 */
export async function triggerSubscriptionRenewalCheckAction() {
    try {
        await verifyAdmin();
        const result = await sendSubscriptionRenewalRemindersInternal();

        revalidatePath("/settings");
        revalidatePath("/settings/access");

        return {
            success: true,
            remindersSent: result.remindersSent,
            scannedUsers: result.scannedUsers,
            details: result.details,
            message: result.remindersSent > 0
                ? `Dispatched ${result.remindersSent} advance renewal reminder(s) across ${result.scannedUsers} member(s).`
                : `Scan complete: Checked ${result.scannedUsers} active member(s). No renewal reminders due at this time.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to run renewal reminder sweep." };
    }
}




