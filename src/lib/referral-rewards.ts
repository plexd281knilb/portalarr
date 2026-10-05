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
    // The standalone monthly alternative rate (e.g. $17.50/mo)
    const monthlyRate = typeof options.monthlyPrice === "number" && options.monthlyPrice > 0 
        ? options.monthlyPrice 
        : annualMonthlyRate;

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
        const cycleStartMonth = (expMonth === 11 && expDay >= 30) ? 0 : (expDay === 1 ? expMonth : expMonth);
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
            : `for ${convertedReferralsCount} converted referral(s)`;

        summaryText = `Referral Reward Applied: ${convertedReferralsCount} free month(s) earned ($${rewardDiscountAmount.toFixed(2)} total discount ${friendCreditNote}). Next annual renewal is $${discountedYearlyPrice.toFixed(2)}${delayedMonthlyStartDate ? `, or monthly billing delayed until ${delayedMonthlyStartDate}` : ""}.`;

        reminderNoticeText = isFullYearFree
            ? `🎁 Referral Rewards Applied: You referred ${convertedReferralsCount} friends (${friendNamesStr}) who became full members! Your upcoming year is 100% FREE ($0.00 due).`
            : `🎁 Referral Rewards Applied: You referred ${convertedReferralsCount} friend(s) (${friendNamesStr}) who joined as full members! You get ${monthWord} off ($${rewardDiscountAmount.toFixed(2)} discount). Your annual renewal is discounted to $${discountedYearlyPrice.toFixed(2)} (was $${baseYearlyPrice.toFixed(2)})${delayedMonthlyStartDate ? `, or if you prefer monthly ($${monthlyRate.toFixed(2)}/mo), your payments are delayed until ${delayedMonthlyStartDate}` : ""}.`;
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
