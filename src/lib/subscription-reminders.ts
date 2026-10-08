/**
 * Subscription Renewal Reminders Engine & Schedule Calculator
 *
 * Provides deterministic calculation for advance renewal reminders,
 * configurable annual/monthly reminder schedules, and payment verification
 * ensuring already-paid members are never sent renewal reminders.
 */

export const DEFAULT_YEARLY_REMINDER_DAYS = [60, 30, 14, 3, 1];
export const DEFAULT_MONTHLY_REMINDER_DAYS = [7, 3, 1];

/**
 * Parses and normalizes a comma-separated string or array of days into a deduplicated,
 * descending-sorted list of positive integers.
 * E.g. "60, 30, 14, 3, 1" -> [60, 30, 14, 3, 1]
 */
export function parseReminderDays(
    raw: string | number[] | null | undefined,
    defaultDays: number[] = DEFAULT_YEARLY_REMINDER_DAYS
): number[] {
    if (raw === null || raw === undefined) {
        return [...defaultDays];
    }
    if (Array.isArray(raw)) {
        const cleaned = raw.map(n => Math.round(Number(n))).filter(n => !isNaN(n) && n > 0);
        return cleaned.length > 0 ? Array.from(new Set(cleaned)).sort((a, b) => b - a) : [...defaultDays];
    }
    const str = String(raw).trim();
    if (!str) return [...defaultDays];

    const parts = str
        .split(",")
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !isNaN(n) && n > 0);

    const unique = Array.from(new Set(parts)).sort((a, b) => b - a);
    return unique.length > 0 ? unique : [...defaultDays];
}

/**
 * Formats a list of milestone day numbers into a standard comma-separated string.
 */
export function formatReminderDays(days: number[]): string {
    return Array.from(new Set(days.filter(d => d > 0)))
        .sort((a, b) => b - a)
        .join(",");
}

export interface RenewalPaymentTransaction {
    id?: string;
    amount?: number;
    provider?: string;
    emailDate?: string | Date;
    status?: string;
    appliedSubscription?: boolean;
    subscriptionPeriodGranted?: string | null;
}

export interface RenewalUserTarget {
    id?: string;
    username?: string;
    role?: string;
    status?: string;
    subscriptionEndsAt?: string | Date | null;
    trialEndsAt?: string | Date | null;
    subscriptionCadence?: string | null;
    renewalRemindersSent?: string | null;
    lastRenewalReminderSentAt?: string | Date | null;
    paymentTransactions?: RenewalPaymentTransaction[];
}

export interface RenewalSettingsTarget {
    yearlyRenewalReminderDays?: string | null;
    monthlyRenewalReminderDays?: string | null;
    defaultTrialDays?: number | null;
    yearlyPrice?: number | null;
    monthlyPrice?: number | null;
}

export interface RenewalReminderInfo {
    status: "paid" | "scheduled" | "due_today" | "all_sent" | "expired" | "not_applicable";
    isPaid: boolean;
    cadence: "YEARLY" | "MONTHLY" | "TRIAL" | "NONE";
    nextReminderDate: Date | null;
    nextMilestoneDays: number | null;
    daysUntilNextReminder: number | null;
    daysRemaining: number;
    label: string;
    badgeText: string;
    details: string;
    sentMilestones: string[];
    allMilestones: number[];
}

/**
 * Checks whether an active subscriber has already made their payment covering
 * the current or upcoming renewal cycle.
 */
export function isUserSubscriptionPaidForCycle(params: {
    user: RenewalUserTarget;
    now?: Date;
    maxMilestoneDays?: number;
}): { isPaid: boolean; reason: string } {
    const { user } = params;
    const now = params.now || new Date();

    if (user.role === "ADMIN") {
        return { isPaid: true, reason: "Administrator account has permanent access." };
    }
    if (user.status !== "APPROVED") {
        return { isPaid: false, reason: "User account is not active." };
    }
    if (!user.subscriptionEndsAt) {
        return { isPaid: true, reason: "Permanent access account with no expiration." };
    }

    const expiryDate = new Date(user.subscriptionEndsAt);
    const msRemaining = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    if (daysRemaining <= 0) {
        return { isPaid: false, reason: "Subscription has expired." };
    }

    const maxDays = params.maxMilestoneDays || 60;

    // 1. If subscription extends beyond the maximum advance reminder window,
    // the user is already covered into the next cycle.
    if (daysRemaining > maxDays) {
        return {
            isPaid: true,
            reason: `Subscription is active and covered through ${expiryDate.toLocaleDateString()} (${daysRemaining} days remaining).`
        };
    }

    // 2. Check if a payment transaction has been processed during this renewal window.
    // Window starts slightly before the earliest reminder (e.g., maxDays + 7 days before expiration).
    const renewalWindowStart = new Date(expiryDate.getTime() - (maxDays + 7) * 24 * 60 * 60 * 1000);
    const transactions = user.paymentTransactions || [];

    for (const tx of transactions) {
        if (!tx.emailDate) continue;
        const txDate = new Date(tx.emailDate);
        const isConfirmed = tx.status === "PROCESSED" || tx.status === "MANUAL";
        const isApplied = tx.appliedSubscription !== false;

        if (isConfirmed && isApplied && txDate >= renewalWindowStart) {
            return {
                isPaid: true,
                reason: `Payment of $${(tx.amount || 0).toFixed(2)} recorded on ${txDate.toLocaleDateString()} for this renewal cycle.`
            };
        }
    }

    return { isPaid: false, reason: "No payment recorded yet for the upcoming cycle." };
}

/**
 * Calculates deterministic next reminder details for any user.
 */
export function getNextRenewalReminderInfo(params: {
    user: RenewalUserTarget;
    settings?: RenewalSettingsTarget | null;
    now?: Date;
}): RenewalReminderInfo {
    const { user, settings } = params;
    const now = params.now || new Date();

    // Default response for non-applicable users
    const defaultNA = (reason: string, badge: string = "N/A"): RenewalReminderInfo => ({
        status: "not_applicable",
        isPaid: true,
        cadence: "NONE",
        nextReminderDate: null,
        nextMilestoneDays: null,
        daysUntilNextReminder: null,
        daysRemaining: 0,
        label: reason,
        badgeText: badge,
        details: reason,
        sentMilestones: [],
        allMilestones: []
    });

    if (user.role === "ADMIN") {
        return defaultNA("Admin account (Permanent Access)", "Admin");
    }

    if (user.status === "PENDING") {
        return defaultNA("Account pending approval", "Pending");
    }

    if (user.status === "SUSPENDED" || user.status === "REJECTED") {
        return defaultNA(`Account is ${user.status.toLowerCase()}`, user.status);
    }

    // 1. TRIAL ACCOUNTS
    if (user.status === "TRIAL") {
        if (!user.trialEndsAt) {
            return defaultNA("Trial account without expiration date", "Trial (No Expiry)");
        }
        const trialExpiry = new Date(user.trialEndsAt);
        const msLeft = trialExpiry.getTime() - now.getTime();
        const daysLeft = Math.ceil(msLeft / (24 * 60 * 60 * 1000));

        if (daysLeft <= 0) {
            return {
                status: "expired",
                isPaid: false,
                cadence: "TRIAL",
                nextReminderDate: null,
                nextMilestoneDays: null,
                daysUntilNextReminder: null,
                daysRemaining: daysLeft,
                label: "Trial Expired",
                badgeText: "Expired",
                details: `Trial ended on ${formatDateDisplay(trialExpiry)}.`,
                sentMilestones: ["trial_expiring"],
                allMilestones: [3]
            };
        }

        // Check if trial reminder was already sent
        let sentTrialNotice = false;
        if (user.renewalRemindersSent) {
            try {
                const parsed = JSON.parse(user.renewalRemindersSent);
                if (parsed && Array.isArray(parsed.milestones) && parsed.milestones.includes("trial_expiring")) {
                    sentTrialNotice = true;
                }
            } catch (_) {}
        }

        if (sentTrialNotice) {
            return {
                status: "all_sent",
                isPaid: false,
                cadence: "TRIAL",
                nextReminderDate: null,
                nextMilestoneDays: null,
                daysUntilNextReminder: null,
                daysRemaining: daysLeft,
                label: "Trial Reminder Dispatched",
                badgeText: "Reminder Sent",
                details: `Trial notice dispatched. Trial expires in ${daysLeft} day(s) on ${formatDateDisplay(trialExpiry)}.`,
                sentMilestones: ["trial_expiring"],
                allMilestones: [3]
            };
        }

        // Trial reminder triggers at 3 days before expiration
        if (daysLeft <= 3) {
            return {
                status: "due_today",
                isPaid: false,
                cadence: "TRIAL",
                nextReminderDate: now,
                nextMilestoneDays: 3,
                daysUntilNextReminder: 0,
                daysRemaining: daysLeft,
                label: `Due Today (Trial expiring in ${daysLeft}d)`,
                badgeText: `Due Today (${daysLeft}d left)`,
                details: `Trial reminder due for dispatch today. Trial ends on ${formatDateDisplay(trialExpiry)}.`,
                sentMilestones: [],
                allMilestones: [3]
            };
        }

        const reminderDate = new Date(trialExpiry.getTime() - 3 * 24 * 60 * 60 * 1000);
        const daysUntil = Math.max(1, daysLeft - 3);

        return {
            status: "scheduled",
            isPaid: false,
            cadence: "TRIAL",
            nextReminderDate: reminderDate,
            nextMilestoneDays: 3,
            daysUntilNextReminder: daysUntil,
            daysRemaining: daysLeft,
            label: `${formatDateDisplay(reminderDate)} (3d notice • in ${daysUntil}d)`,
            badgeText: `${formatDateShort(reminderDate)} (in ${daysUntil}d)`,
            details: `Trial expiration notice will trigger on ${formatDateDisplay(reminderDate)} (3 days before trial ends).`,
            sentMilestones: [],
            allMilestones: [3]
        };
    }

    // 2. ACTIVE SUBSCRIBED MEMBERS
    if (!user.subscriptionEndsAt) {
        return defaultNA("Permanent Access (No Expiration Date)", "Permanent");
    }

    const expiryDate = new Date(user.subscriptionEndsAt);
    const msRemaining = expiryDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(msRemaining / (24 * 60 * 60 * 1000));

    if (daysRemaining <= 0 || user.status === "EXPIRED") {
        return {
            status: "expired",
            isPaid: false,
            cadence: "NONE",
            nextReminderDate: null,
            nextMilestoneDays: null,
            daysUntilNextReminder: null,
            daysRemaining,
            label: "Subscription Expired",
            badgeText: "Expired",
            details: `Subscription expired on ${formatDateDisplay(expiryDate)}.`,
            sentMilestones: [],
            allMilestones: []
        };
    }

    // Determine cadence
    const cadenceStr = (user.subscriptionCadence || (
        expiryDate.getMonth() === 0 && expiryDate.getDate() === 1 ? "YEARLY" : "MONTHLY"
    )).toUpperCase();
    const isYearly = cadenceStr === "YEARLY";
    const cadence: "YEARLY" | "MONTHLY" = isYearly ? "YEARLY" : "MONTHLY";

    // Parse configured milestones
    const yearlyMilestones = parseReminderDays(settings?.yearlyRenewalReminderDays, DEFAULT_YEARLY_REMINDER_DAYS);
    const monthlyMilestones = parseReminderDays(settings?.monthlyRenewalReminderDays, DEFAULT_MONTHLY_REMINDER_DAYS);
    const milestones = isYearly ? yearlyMilestones : monthlyMilestones;
    const maxMilestone = milestones.length > 0 ? milestones[0] : 30;

    // Check sent milestones for current target cycle
    const cycleTarget = expiryDate.toISOString().slice(0, 10);
    let sentMilestones: string[] = [];

    if (user.renewalRemindersSent) {
        try {
            const parsed = JSON.parse(user.renewalRemindersSent);
            if (parsed && parsed.cycleTarget === cycleTarget && Array.isArray(parsed.milestones)) {
                sentMilestones = parsed.milestones;
            }
        } catch (_) {}
    }

    // Check if user has already paid
    const paidCheck = isUserSubscriptionPaidForCycle({
        user,
        now,
        maxMilestoneDays: maxMilestone
    });

    if (paidCheck.isPaid) {
        // If paid through the future cycle beyond maxMilestone:
        if (daysRemaining > maxMilestone) {
            const nextCycleFirstMilestoneDate = new Date(expiryDate.getTime() - maxMilestone * 24 * 60 * 60 * 1000);
            const daysUntilNext = Math.ceil((nextCycleFirstMilestoneDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

            return {
                status: "paid",
                isPaid: true,
                cadence,
                nextReminderDate: nextCycleFirstMilestoneDate,
                nextMilestoneDays: maxMilestone,
                daysUntilNextReminder: daysUntilNext,
                daysRemaining,
                label: `Paid (Next reminder: ${formatDateDisplay(nextCycleFirstMilestoneDate)})`,
                badgeText: "Paid / Up to Date",
                details: `Subscription covered through ${formatDateDisplay(expiryDate)}. Next renewal cycle reminder scheduled for ${formatDateDisplay(nextCycleFirstMilestoneDate)} (${maxMilestone}d notice • in ${daysUntilNext} days).`,
                sentMilestones,
                allMilestones: milestones
            };
        }

        // Paid recently during this window
        return {
            status: "paid",
            isPaid: true,
            cadence,
            nextReminderDate: null,
            nextMilestoneDays: null,
            daysUntilNextReminder: null,
            daysRemaining,
            label: "Paid / Current Cycle Covered",
            badgeText: "Paid",
            details: paidCheck.reason,
            sentMilestones,
            allMilestones: milestones
        };
    }

    // If NOT paid: Evaluate upcoming reminder milestone according to bracket ranges
    for (let i = 0; i < milestones.length; i++) {
        const m = milestones[i];
        const nextLower = milestones[i + 1] || 0;
        const milestoneKey = `${m}d`;

        // Check if daysRemaining is within this milestone's bracket
        if (daysRemaining <= m && daysRemaining > nextLower) {
            if (!sentMilestones.includes(milestoneKey)) {
                // Milestone has arrived and is due today!
                return {
                    status: "due_today",
                    isPaid: false,
                    cadence,
                    nextReminderDate: now,
                    nextMilestoneDays: m,
                    daysUntilNextReminder: 0,
                    daysRemaining,
                    label: `Due Today (${formatMilestoneHumanLabel(m)} notice • ${daysRemaining}d left)`,
                    badgeText: `Due Today (${formatMilestoneHumanLabel(m)})`,
                    details: `${formatMilestoneHumanLabel(m)} renewal reminder is due today (${daysRemaining} day(s) until renewal on ${formatDateDisplay(expiryDate)}).`,
                    sentMilestones,
                    allMilestones: milestones
                };
            } else {
                // Current milestone bracket was already sent! Next reminder is the next lower milestone
                if (nextLower > 0) {
                    const daysToHit = daysRemaining - nextLower;
                    const targetDate = new Date(expiryDate.getTime() - nextLower * 24 * 60 * 60 * 1000);
                    return {
                        status: "scheduled",
                        isPaid: false,
                        cadence,
                        nextReminderDate: targetDate,
                        nextMilestoneDays: nextLower,
                        daysUntilNextReminder: daysToHit,
                        daysRemaining,
                        label: `${formatDateDisplay(targetDate)} (${formatMilestoneHumanLabel(nextLower)} notice • in ${daysToHit}d)`,
                        badgeText: `${formatDateShort(targetDate)} (${formatMilestoneHumanLabel(nextLower)})`,
                        details: `Advance renewal reminder (${formatMilestoneHumanLabel(nextLower)}) scheduled for ${formatDateDisplay(targetDate)} (${daysToHit} days from now).`,
                        sentMilestones,
                        allMilestones: milestones
                    };
                } else {
                    // No lower milestones remain
                    return {
                        status: "all_sent",
                        isPaid: false,
                        cadence,
                        nextReminderDate: null,
                        nextMilestoneDays: null,
                        daysUntilNextReminder: null,
                        daysRemaining,
                        label: `All Reminders Sent (Due ${formatDateDisplay(expiryDate)})`,
                        badgeText: "All Reminders Sent",
                        details: `All ${milestones.length} renewal reminders for this cycle have been dispatched. Subscription expires on ${formatDateDisplay(expiryDate)}.`,
                        sentMilestones,
                        allMilestones: milestones
                    };
                }
            }
        }
    }

    // If daysRemaining > max configured milestone (e.g. daysRemaining = 90 > 60):
    if (milestones.length > 0 && daysRemaining > milestones[0]) {
        const firstMilestone = milestones[0];
        const daysToHit = daysRemaining - firstMilestone;
        const targetDate = new Date(expiryDate.getTime() - firstMilestone * 24 * 60 * 60 * 1000);
        return {
            status: "scheduled",
            isPaid: false,
            cadence,
            nextReminderDate: targetDate,
            nextMilestoneDays: firstMilestone,
            daysUntilNextReminder: daysToHit,
            daysRemaining,
            label: `${formatDateDisplay(targetDate)} (${formatMilestoneHumanLabel(firstMilestone)} notice • in ${daysToHit}d)`,
            badgeText: `${formatDateShort(targetDate)} (${formatMilestoneHumanLabel(firstMilestone)})`,
            details: `Advance renewal reminder (${formatMilestoneHumanLabel(firstMilestone)}) scheduled for ${formatDateDisplay(targetDate)} (${daysToHit} days from now).`,
            sentMilestones,
            allMilestones: milestones
        };
    }

    // Default if somehow reached (e.g. empty milestones list or expired)
    return {
        status: "all_sent",
        isPaid: false,
        cadence,
        nextReminderDate: null,
        nextMilestoneDays: null,
        daysUntilNextReminder: null,
        daysRemaining,
        label: `Reminders Inactive (Expires ${formatDateDisplay(expiryDate)})`,
        badgeText: "None Configured",
        details: `No active renewal reminder milestones configured for ${cadence.toLowerCase()} members.`,
        sentMilestones,
        allMilestones: milestones
    };
}

/**
 * Determines which milestone is due right now during a background renewal sweep.
 */
export function getDueReminderMilestone(params: {
    daysRemaining: number;
    milestoneDays: number[];
    sentMilestones: string[];
}): { dueMilestone: string | null; milestoneLabel: string } {
    const { daysRemaining, milestoneDays, sentMilestones } = params;

    for (let i = 0; i < milestoneDays.length; i++) {
        const m = milestoneDays[i];
        const nextLower = milestoneDays[i + 1] || 0;
        const milestoneKey = `${m}d`;

        // Range check: between this milestone and the next lower milestone
        if (daysRemaining <= m && daysRemaining > nextLower && !sentMilestones.includes(milestoneKey)) {
            return {
                dueMilestone: milestoneKey,
                milestoneLabel: formatMilestoneHumanLabel(m)
            };
        }
    }

    return { dueMilestone: null, milestoneLabel: "" };
}

function formatMilestoneHumanLabel(days: number): string {
    if (days === 60) return "2 Months";
    if (days === 30) return "1 Month";
    if (days === 14) return "14 Days";
    if (days === 7) return "1 Week";
    if (days === 1) return "1 Day";
    return `${days} Days`;
}

function formatDateDisplay(d: Date): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    }).format(d);
}

function formatDateShort(d: Date): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric"
    }).format(d);
}
