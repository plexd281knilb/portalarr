"use server";

import { prisma, ensureSchemaColumns } from "@/lib/prisma";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import { revalidatePath } from "next/cache";
import { logger } from "@/lib/logger";

// Helper: Authentication verification matching Portalarr standard
async function verifySessionUser(): Promise<any> {
    await ensureSchemaColumns();
    if (process.env.PORTALARR_TEST_AUTH === "true") {
        if (process.env.PORTALARR_TEST_USER_ID) {
            const specificUser = await prisma.user.findUnique({
                where: { id: process.env.PORTALARR_TEST_USER_ID }
            });
            if (specificUser) return specificUser;
        }
        const testUser = await prisma.user.findFirst({
            where: { role: "ADMIN" }
        }) || await prisma.user.findFirst();
        if (testUser) return testUser;
        return {
            id: "test-admin-id",
            username: "admin",
            email: "admin@example.com",
            role: "ADMIN",
            status: "APPROVED"
        };
    }
    let token = "";
    try {
        const cookieStore = await cookies();
        token = cookieStore.get("session")?.value || "";
    } catch {}
    if (!token) throw new Error("Unauthorized");
    const { payload } = await jwtVerify(token, getJwtSecret());
    const userId = (payload.userId || payload.id) as string;
    const dbUser = await prisma.user.findUnique({
        where: { id: userId }
    });
    if (!dbUser) throw new Error("User not found");
    return dbUser;
}

function safeRevalidate(path: string) {
    try {
        revalidatePath(path);
    } catch {}
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface LinkedEmailRecord {
    id: string;
    userId: string;
    email: string;
    label: string | null;
    isVerified: boolean;
    verificationToken: string | null;
    receiveSubscriptionReminders: boolean;
    receiveAnnouncements: boolean;
    receiveMediaReady: boolean;
    receiveRequestApproved: boolean;
    receiveNewContent: boolean;
    receiveSupportTickets: boolean;
    createdAt: Date;
    updatedAt: Date;
}

/**
 * Fetch all linked notification emails for the authenticated user or target user (admin only).
 */
export async function getUserLinkedEmailsAction(targetUserId?: string): Promise<{
    success: boolean;
    linkedEmails?: LinkedEmailRecord[];
    primaryEmail?: string;
    error?: string;
}> {
    try {
        const currentUser = await verifySessionUser();
        const effectiveUserId = (targetUserId && currentUser.role === "ADMIN") ? targetUserId : currentUser.id;

        const user = await prisma.user.findUnique({
            where: { id: effectiveUserId },
            include: {
                linkedEmails: {
                    orderBy: { createdAt: "asc" }
                }
            }
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        return {
            success: true,
            linkedEmails: user.linkedEmails,
            primaryEmail: user.email
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to retrieve linked emails" };
    }
}

/**
 * Add or update a linked email with granular category routing toggles.
 */
export async function addOrUpdateLinkedEmailAction(data: {
    id?: string;
    email: string;
    label?: string;
    receiveSubscriptionReminders?: boolean;
    receiveAnnouncements?: boolean;
    receiveMediaReady?: boolean;
    receiveRequestApproved?: boolean;
    receiveNewContent?: boolean;
    receiveSupportTickets?: boolean;
    targetUserId?: string;
}): Promise<{
    success: boolean;
    linkedEmail?: LinkedEmailRecord;
    message?: string;
    error?: string;
}> {
    try {
        const currentUser = await verifySessionUser();
        const effectiveUserId = (data.targetUserId && currentUser.role === "ADMIN") ? data.targetUserId : currentUser.id;

        const targetUser = await prisma.user.findUnique({
            where: { id: effectiveUserId }
        });
        if (!targetUser) {
            return { success: false, error: "User not found" };
        }

        const cleanEmail = (data.email || "").trim().toLowerCase();
        if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
            return { success: false, error: "Please provide a valid email address (e.g. name@example.com)." };
        }

        // Check if identical to the primary account email
        if (cleanEmail === targetUser.email.toLowerCase()) {
            return {
                success: false,
                error: `"${cleanEmail}" is already your primary account login email. Primary emails automatically receive your account notifications.`
            };
        }

        // If editing an existing linked email
        if (data.id) {
            const existing = await prisma.userLinkedEmail.findUnique({
                where: { id: data.id }
            });
            if (!existing || (existing.userId !== effectiveUserId && currentUser.role !== "ADMIN")) {
                return { success: false, error: "Linked email record not found or access denied." };
            }

            // Check if changing email clashes with another linked email for this user
            if (existing.email.toLowerCase() !== cleanEmail) {
                const clash = await prisma.userLinkedEmail.findFirst({
                    where: {
                        userId: effectiveUserId,
                        email: cleanEmail,
                        id: { not: data.id }
                    }
                });
                if (clash) {
                    return { success: false, error: `"${cleanEmail}" is already linked to this account.` };
                }
            }

            const updated = await prisma.userLinkedEmail.update({
                where: { id: data.id },
                data: {
                    email: cleanEmail,
                    label: data.label?.trim() || null,
                    receiveSubscriptionReminders: data.receiveSubscriptionReminders ?? existing.receiveSubscriptionReminders,
                    receiveAnnouncements: data.receiveAnnouncements ?? existing.receiveAnnouncements,
                    receiveMediaReady: data.receiveMediaReady ?? existing.receiveMediaReady,
                    receiveRequestApproved: data.receiveRequestApproved ?? existing.receiveRequestApproved,
                    receiveNewContent: data.receiveNewContent ?? existing.receiveNewContent,
                    receiveSupportTickets: data.receiveSupportTickets ?? existing.receiveSupportTickets
                }
            });

            logger.addLog("INFO", "EMAIL", `Updated linked notification email "${cleanEmail}" for user "${targetUser.username}".`);
            safeRevalidate("/profile");
            safeRevalidate("/settings/profile");

            return {
                success: true,
                linkedEmail: updated,
                message: `Updated linked email "${cleanEmail}".`
            };
        }

        // Creating a new linked email
        const existingDuplicate = await prisma.userLinkedEmail.findFirst({
            where: {
                userId: effectiveUserId,
                email: cleanEmail
            }
        });
        if (existingDuplicate) {
            return { success: false, error: `"${cleanEmail}" is already linked to this account.` };
        }

        const count = await prisma.userLinkedEmail.count({
            where: { userId: effectiveUserId }
        });
        if (count >= 10) {
            return { success: false, error: "Maximum limit of 10 linked emails per account reached." };
        }

        const created = await prisma.userLinkedEmail.create({
            data: {
                userId: effectiveUserId,
                email: cleanEmail,
                label: data.label?.trim() || null,
                receiveSubscriptionReminders: data.receiveSubscriptionReminders ?? true,
                receiveAnnouncements: data.receiveAnnouncements ?? true,
                receiveMediaReady: data.receiveMediaReady ?? false,
                receiveRequestApproved: data.receiveRequestApproved ?? false,
                receiveNewContent: data.receiveNewContent ?? false,
                receiveSupportTickets: data.receiveSupportTickets ?? false
            }
        });

        logger.addLog("INFO", "EMAIL", `Linked new notification email "${cleanEmail}" (${data.label || "No Label"}) to user "${targetUser.username}".`);
        safeRevalidate("/profile");
        safeRevalidate("/settings/profile");

        return {
            success: true,
            linkedEmail: created,
            message: `Successfully linked "${cleanEmail}" for notifications.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to save linked email" };
    }
}

/**
 * Remove a linked email from a user account.
 */
export async function deleteLinkedEmailAction(id: string, targetUserId?: string): Promise<{
    success: boolean;
    message?: string;
    error?: string;
}> {
    try {
        const currentUser = await verifySessionUser();
        const effectiveUserId = (targetUserId && currentUser.role === "ADMIN") ? targetUserId : currentUser.id;

        const existing = await prisma.userLinkedEmail.findUnique({
            where: { id }
        });

        if (!existing || (existing.userId !== effectiveUserId && currentUser.role !== "ADMIN")) {
            return { success: false, error: "Linked email record not found or access denied." };
        }

        await prisma.userLinkedEmail.delete({
            where: { id }
        });

        logger.addLog("INFO", "EMAIL", `Removed linked notification email "${existing.email}" from user ID "${effectiveUserId}".`);
        safeRevalidate("/profile");
        safeRevalidate("/settings/profile");

        return {
            success: true,
            message: `Removed "${existing.email}" from linked inboxes.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to delete linked email" };
    }
}

/**
 * Quick toggle for a specific notification category on a linked email.
 */
export async function toggleLinkedEmailCategoryAction(
    id: string,
    category: "receiveSubscriptionReminders" | "receiveAnnouncements" | "receiveMediaReady" | "receiveRequestApproved" | "receiveNewContent" | "receiveSupportTickets",
    enabled: boolean,
    targetUserId?: string
): Promise<{
    success: boolean;
    linkedEmail?: LinkedEmailRecord;
    error?: string;
}> {
    try {
        const currentUser = await verifySessionUser();
        const effectiveUserId = (targetUserId && currentUser.role === "ADMIN") ? targetUserId : currentUser.id;

        const existing = await prisma.userLinkedEmail.findUnique({
            where: { id }
        });

        if (!existing || (existing.userId !== effectiveUserId && currentUser.role !== "ADMIN")) {
            return { success: false, error: "Linked email record not found or access denied." };
        }

        const updated = await prisma.userLinkedEmail.update({
            where: { id },
            data: {
                [category]: enabled
            }
        });

        safeRevalidate("/profile");
        safeRevalidate("/settings/profile");

        return {
            success: true,
            linkedEmail: updated
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to update category toggle" };
    }
}
