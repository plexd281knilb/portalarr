/**
 * Referral Rewards & Renewal Calculation Engine
 * 
 * Provides pure calculations and formatted summaries for:
 * - Referral credits earned by members (+1 free month / $15 value per converted friend)
 * - Prorated and discounted annual renewal pricing ($180 - $15 = $165)
 * - Delayed monthly payment start dates (e.g. pushes monthly payments from January 1 to February 1)
 * - Payment reminder and invoice notices
 */

export interface ConvertedFriendInfo {
    id: string;
    username: string;
    name?: string | null;
    convertedAt?: Date | string | null;
}

export interface UserRenewalReferralSummary {
    hasActiveSubscription: boolean;
    expirationDateFormatted: string | null;
    rawExpirationDate: Date | null;
    convertedReferralsCount: number;
    convertedFriends: ConvertedFriendInfo[];
    baseYearlyPrice: number;
    annualMonthlyRate: number;
    monthlyRate: number;
    rewardDiscountAmount: number;
    discountedYearlyPrice: number;
    isFullYearFree: boolean;
    delayedMonthlyStartDate: string | null;
    delayedMonthlyMonthName: string | null;
    summaryText: string;
    reminderNoticeText: string;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

export interface ReferralTargetInput {
    yearlyPrice: number;
    referralBonusMonths?: number | null;
    referrals?: Array<{
        status?: string | null;
        convertedAt?: Date | string | null;
    }> | null;
}

/**
 * Single source of truth for annual referral discount math (+1 free month / yearlyPrice/12 off per converted referral or bonus month, capped at 12 months).
 */
export function computeReferralYearlyTarget(input: ReferralTargetInput): {
    annualMonthlyBase: number;
    convertedReferralsCount: number;
    rewardMonths: number;
    referralDiscount: number;
    effectiveYearlyTarget: number;
} {
    const yearlyPrice = Math.max(0, Number(input.yearlyPrice || 0));
    const annualMonthlyBase = Math.round((yearlyPrice / 12) * 100) / 100;
    const convertedFromRefs = Array.isArray(input.referrals)
        ? input.referrals.filter(r => r.status === "APPROVED" || Boolean(r.convertedAt)).length
        : 0;
    const bonusMonths = Math.max(0, Number(input.referralBonusMonths || 0));
    const convertedReferralsCount = convertedFromRefs + bonusMonths;
    const rewardMonths = Math.min(12, convertedReferralsCount);
    const referralDiscount = Math.min(yearlyPrice, Math.round(rewardMonths * annualMonthlyBase * 100) / 100);
    const effectiveYearlyTarget = Math.max(0, Math.round((yearlyPrice - referralDiscount) * 100) / 100);

    return {
        annualMonthlyBase,
        convertedReferralsCount,
        rewardMonths,
        referralDiscount,
        effectiveYearlyTarget
    };
}

/**
 * Derives the renewal date, referral reward credits, and discounted amounts for a member.
 */
export function calculateUserRenewalSummary(options: {
    user: {
        id?: string;
        username: string;
        status?: string;
        subscriptionEndsAt?: Date | string | null;
        referrals?: Array<{
            id: string;
            username: string;
            name?: string | null;
            status?: string;
            convertedAt?: Date | string | null;
        }>;
        referralBonusMonths?: number | null;
    };
    yearlyPrice?: number;
    monthlyPrice?: number;
}): UserRenewalReferralSummary {
    const { user } = options;
    const baseYearlyPrice = typeof options.yearlyPrice === "number" && options.yearlyPrice >= 0 
        ? options.yearlyPrice 
        : 180;
    // The annual plan's per-month rate (e.g. $180 / 12 = $15.00/mo)
    const annualMonthlyRate = baseYearlyPrice > 0 
        ? Math.round((baseYearlyPrice / 12) * 100) / 100 
        : 15;
    // The standalone monthly alternative rate (defaults to $17.50/mo standard monthly rate)
    const monthlyRate = typeof options.monthlyPrice === "number" && options.monthlyPrice > 0 
        ? options.monthlyPrice 
        : 17.50;

    const rawExpDate = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
    const hasActiveSubscription = user.status === "APPROVED" && rawExpDate !== null;

    let expirationDateFormatted: string | null = null;
    if (rawExpDate) {
        expirationDateFormatted = new Intl.DateTimeFormat("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric"
        }).format(rawExpDate);
    }

    // Filter referrals that are converted (status === "APPROVED" or convertedAt is set)
    const convertedFriends: ConvertedFriendInfo[] = [];
    if (user.referrals && Array.isArray(user.referrals)) {
        for (const ref of user.referrals) {
            if (ref.status === "APPROVED" || ref.convertedAt) {
                convertedFriends.push({
                    id: ref.id,
                    username: ref.username,
                    name: ref.name || null,
                    convertedAt: ref.convertedAt || null
                });
            }
        }
    }

    const bonusMonths = typeof user.referralBonusMonths === "number" ? Math.max(0, user.referralBonusMonths) : 0;
    const convertedReferralsCount = convertedFriends.length + bonusMonths;

    // Each converted referral awards 1 free month off the annual renewal (annualMonthlyRate, e.g. $15.00 for $180/yr)
    const rewardDiscountAmount = Math.min(convertedReferralsCount * annualMonthlyRate, baseYearlyPrice);
    const discountedYearlyPrice = Math.max(0, baseYearlyPrice - rewardDiscountAmount);
    const isFullYearFree = discountedYearlyPrice === 0 && convertedReferralsCount > 0;

    // Calculate delayed monthly renewal date
    let delayedMonthlyStartDate: string | null = null;
    let delayedMonthlyMonthName: string | null = null;

    if (rawExpDate && convertedReferralsCount > 0) {
        // Base delay begins from subscription expiration date (or next month if day is last of month)
        const expMonth = rawExpDate.getMonth();
        const expYear = rawExpDate.getFullYear();
        const expDay = rawExpDate.getDate();

        // If expiration is e.g. Dec 31 23:59:59 or Jan 1 00:00:00, the renewal cycle is January 1st
        const cycleStartMonth = (expMonth === 11 && expDay >= 30) ? 0 : expMonth;
        const cycleStartYear = (expMonth === 11 && expDay >= 30) ? expYear + 1 : expYear;

        // Advance by convertedReferralsCount months
        const targetMonthIdx = (cycleStartMonth + convertedReferralsCount) % 12;
        const targetYear = cycleStartYear + Math.floor((cycleStartMonth + convertedReferralsCount) / 12);

        delayedMonthlyMonthName = MONTH_NAMES[targetMonthIdx];
        delayedMonthlyStartDate = `${delayedMonthlyMonthName} 1, ${targetYear}`;
    }

    const friendNamesStr = convertedFriends.map(f => `@${f.username}`).join(", ");

    let summaryText = "";
    let reminderNoticeText = "";

    if (convertedReferralsCount > 0) {
        const monthWord = convertedReferralsCount === 1 ? "1 month" : `${convertedReferralsCount} months`;
        const friendCreditNote = friendNamesStr
            ? `for referring ${friendNamesStr}`
            : `for ${convertedReferralsCount} referral reward credit(s)`;
        const friendsClause = friendNamesStr
            ? `referred ${convertedReferralsCount} friend${convertedReferralsCount === 1 ? "" : "s"} (${friendNamesStr}) who became full members`
            : `earned ${convertedReferralsCount} referral reward credit(s)`;

        summaryText = `Referral Reward Applied: ${convertedReferralsCount} free month(s) earned ($${rewardDiscountAmount.toFixed(2)} total discount ${friendCreditNote}). Next annual renewal is $${discountedYearlyPrice.toFixed(2)}${delayedMonthlyStartDate ? `, or monthly billing delayed until ${delayedMonthlyStartDate}` : ""}.`;

        reminderNoticeText = isFullYearFree
            ? `🎁 Referral Rewards Applied: You ${friendsClause}! Your upcoming year is 100% FREE ($0.00 due).`
            : `🎁 Referral Rewards Applied: You ${friendsClause}! You get ${monthWord} off ($${rewardDiscountAmount.toFixed(2)} discount). Your annual renewal is discounted to $${discountedYearlyPrice.toFixed(2)} (was $${baseYearlyPrice.toFixed(2)})${delayedMonthlyStartDate ? `, or if you prefer monthly ($${monthlyRate.toFixed(2)}/mo), your payments are delayed until ${delayedMonthlyStartDate}` : ""}.`;
    } else {
        summaryText = `Standard subscription: $${baseYearlyPrice.toFixed(2)}/year renewal${expirationDateFormatted ? ` on ${expirationDateFormatted}` : ""}.`;
        reminderNoticeText = `Your DomsHomeLab membership is scheduled for renewal on ${expirationDateFormatted || 'upcoming renewal'}. Renewal rate: $${baseYearlyPrice.toFixed(2)}/year (or $${monthlyRate.toFixed(2)}/month).`;
    }

    return {
        hasActiveSubscription,
        expirationDateFormatted,
        rawExpirationDate: rawExpDate,
        convertedReferralsCount,
        convertedFriends,
        baseYearlyPrice,
        annualMonthlyRate,
        monthlyRate,
        rewardDiscountAmount,
        discountedYearlyPrice,
        isFullYearFree,
        delayedMonthlyStartDate,
        delayedMonthlyMonthName,
        summaryText,
        reminderNoticeText
    };
}

/**
 * Formats the referral discount line item used in renewal reminder emails.
 */
export function formatReferralDiscountText(summary: UserRenewalReferralSummary): string {
    if (summary.convertedReferralsCount <= 0) {
        return "No active referral credits";
    }
    const friendNamesStr = summary.convertedFriends.map(f => `@${f.username}`).join(", ");
    if (friendNamesStr) {
        return `-$${summary.rewardDiscountAmount.toFixed(2)} (${summary.convertedReferralsCount} credit${summary.convertedReferralsCount > 1 ? "s" : ""}: ${friendNamesStr})`;
    }
    return `-$${summary.rewardDiscountAmount.toFixed(2)} (${summary.convertedReferralsCount} bonus referral month${summary.convertedReferralsCount > 1 ? "s" : ""})`;
}
