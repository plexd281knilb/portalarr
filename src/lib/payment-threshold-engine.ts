import { calculateAlignedExpiryDate } from "./payment-email-scraper";
import { calculateProratedBilling } from "./prorated-billing";

export interface UserPaymentContext {
    id?: string;
    username?: string;
    email?: string;
    status?: string | null;
    accountCredit?: number | null;
    membershipTier?: string | null;
    subscriptionCadence?: string | null;
    subscriptionEndsAt?: Date | string | null;
    trialEndsAt?: Date | string | null;
    referralBonusMonths?: number | null;
    referrals?: Array<{
        id?: string;
        username?: string;
        status?: string | null;
        convertedAt?: Date | string | null;
    }> | null;
}

export interface PaymentDetails {
    amount: number;
    emailDate?: Date | string | null;
    provider: string;
    note?: string | null;
    externalTxId?: string | null;
}

export interface SettingsPricingContext {
    yearlyPrice?: number | null;
    monthlyPrice?: number | null;
    tier2YearlyPrice?: number | null;
    tier2MonthlyPrice?: number | null;
}

export type PaymentThresholdResult =
    | {
          action: "FULL_YEARLY";
          amountPaidNow: number;
          previousCredit: number;
          totalCredit: number;
          targetPrice: number;
          creditedAmount: number;
          newAccountCredit: number;
          periodGrantedText: string;
          newExpiryDate: Date;
          cadence: "YEARLY";
          excessCredit: number;
          yearsGranted: number;
      }
    | {
          action: "FULL_MONTHLY";
          amountPaidNow: number;
          previousCredit: number;
          totalCredit: number;
          targetPrice: number;
          creditedAmount: number;
          newAccountCredit: number;
          monthsGranted: number;
          periodGrantedText: string;
          newExpiryDate: Date;
          cadence: "MONTHLY";
          excessCredit: number;
      }
    | {
          action: "PARTIAL_YEARLY";
          amountPaidNow: number;
          previousCredit: number;
          totalCredit: number;
          targetPrice: number;
          shortfall: number;
          newAccountCredit: number;
          cadence: "YEARLY";
      }
    | {
          action: "PARTIAL_MONTHLY";
          amountPaidNow: number;
          previousCredit: number;
          totalCredit: number;
          targetMonthlyPrice: number;
          targetYearlyPrice: number;
          monthlyShortfall: number;
          yearlyShortfall: number;
          newAccountCredit: number;
          cadence: "MONTHLY";
      };

/**
 * Evaluates an incoming payment against subscription thresholds, referral discounts,
 * prorated Rest-of-Year quotes, and available account credit.
 * Determines whether to grant full yearly/monthly access or credit the user's balance and alert them of shortfall.
 */
export function evaluatePaymentThreshold(params: {
    user: UserPaymentContext;
    payment: PaymentDetails;
    settings?: SettingsPricingContext | null;
}): PaymentThresholdResult {
    const { user, payment, settings } = params;

    const isTier2 = user.membershipTier === "TIER_2_VIP";
    const yearlyPrice = isTier2 
        ? (settings?.tier2YearlyPrice || 240) 
        : (settings?.yearlyPrice || 180);
    const monthlyPrice = isTier2 
        ? (settings?.tier2MonthlyPrice || 25) 
        : (settings?.monthlyPrice || 17.50);
    const annualMonthlyBase = Math.round((yearlyPrice / 12) * 100) / 100;

    // Calculate active referral reward discount for annual renewals (+1 free month / $15 off per converted friend)
    const convertedReferralsCount = Array.isArray(user.referrals)
        ? user.referrals.filter(r => r.status === "APPROVED" || Boolean(r.convertedAt)).length
        : 0;
    const rewardMonths = Math.min(12, Math.max(convertedReferralsCount, Number(user.referralBonusMonths || 0)));
    const referralDiscount = Math.min(yearlyPrice, Math.round(rewardMonths * annualMonthlyBase * 100) / 100);
    const effectiveYearlyTarget = Math.max(annualMonthlyBase, Math.round((yearlyPrice - referralDiscount) * 100) / 100);

    const amountPaidNow = Math.round(Number(payment.amount) * 100) / 100;
    const previousCredit = Math.max(0, Math.round(Number(user.accountCredit || 0) * 100) / 100);
    const totalCredit = Math.round((previousCredit + amountPaidNow) * 100) / 100;

    const paymentDate = payment.emailDate ? new Date(payment.emailDate) : new Date();
    const payYear = paymentDate.getFullYear();
    const existingExpiry = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;

    // 1. Full Yearly Fulfillment (meets or exceeds annual subscription threshold or referral-discounted annual target)
    if (totalCredit >= yearlyPrice || (referralDiscount > 0 && totalCredit >= effectiveYearlyTarget)) {
        const isReferralDiscountFulfillment = totalCredit < yearlyPrice && totalCredit >= effectiveYearlyTarget;
        const yearsGranted = isReferralDiscountFulfillment ? 1 : Math.max(1, Math.floor(totalCredit / yearlyPrice));
        const costUsed = isReferralDiscountFulfillment ? effectiveYearlyTarget : (yearsGranted * yearlyPrice);
        const excessCredit = Math.max(0, Math.round((totalCredit - costUsed) * 100) / 100);

        const { newExpiryDate, periodGrantedText } = calculateAlignedExpiryDate({
            paymentDate,
            totalAmount: yearsGranted * yearlyPrice,
            yearlyPrice,
            monthlyPrice,
            existingExpiry
        });

        return {
            action: "FULL_YEARLY",
            amountPaidNow,
            previousCredit,
            totalCredit,
            targetPrice: isReferralDiscountFulfillment ? effectiveYearlyTarget : yearlyPrice,
            creditedAmount: costUsed,
            newAccountCredit: excessCredit,
            periodGrantedText,
            newExpiryDate,
            cadence: "YEARLY",
            excessCredit,
            yearsGranted
        };
    }

    // 1b. Rest-of-Year Prorated Annual Fulfillment
    // Checks if a new, trial, expired, or non-renewed user is paying the Rest-of-Year prorated annual quote
    const isAlreadyCoveredForUpcomingYear = existingExpiry && existingExpiry.getTime() >= new Date(payYear + 1, 0, 1).getTime();
    if (!isAlreadyCoveredForUpcomingYear) {
        const proratedNow = calculateProratedBilling({
            startDate: paymentDate,
            trialDays: 0,
            yearlyPrice,
            monthlyPrice
        });
        const proratedTrial14 = calculateProratedBilling({
            startDate: paymentDate,
            trialDays: 14,
            yearlyPrice,
            monthlyPrice
        });
        const proratedUserTrial = user.trialEndsAt
            ? calculateProratedBilling({
                  trialEndDate: user.trialEndsAt,
                  yearlyPrice,
                  monthlyPrice
              })
            : null;

        const candidateAnnualQuotes = [
            proratedNow.amountDueNow,
            proratedTrial14.amountDueNow,
            ...(proratedUserTrial ? [proratedUserTrial.amountDueNow] : [])
        ].filter(q => q > 0 && q < yearlyPrice);

        // Exact match within $1.00 tolerance of any valid prorated Rest-of-Year quote (and distinct from 1-month standard fee)
        const matchedAnnualQuote = candidateAnnualQuotes.find(
            q => Math.abs(totalCredit - q) <= 1.00 && Math.abs(totalCredit - monthlyPrice) > 0.50
        );

        // Or in Jan-Sep (Q1-Q3), if totalCredit meets or exceeds the Rest-of-Year prorated quote
        const minRestOfYearQuote = candidateAnnualQuotes.length > 0 ? Math.min(...candidateAnnualQuotes) : yearlyPrice;
        const isMidYearRestOfYearFulfillment =
            paymentDate.getMonth() < 9 &&
            totalCredit >= Math.max(monthlyPrice + 5, minRestOfYearQuote - 2);

        if (matchedAnnualQuote !== undefined || isMidYearRestOfYearFulfillment) {
            const targetUsed = matchedAnnualQuote !== undefined
                ? Math.min(totalCredit, matchedAnnualQuote)
                : Math.min(totalCredit, proratedNow.amountDueNow);
            const costUsed = Math.round(targetUsed * 100) / 100;
            const excessCredit = Math.max(0, Math.round((totalCredit - costUsed) * 100) / 100);
            const targetYear = payYear + 1;
            const newExpiryDate = new Date(targetYear, 0, 1, 23, 59, 59, 999);
            const periodGrantedText = `Remainder of ${payYear} (Active until Jan 1, ${targetYear})`;

            return {
                action: "FULL_YEARLY",
                amountPaidNow,
                previousCredit,
                totalCredit,
                targetPrice: costUsed,
                creditedAmount: costUsed,
                newAccountCredit: excessCredit,
                periodGrantedText,
                newExpiryDate,
                cadence: "YEARLY",
                excessCredit,
                yearsGranted: 1
            };
        }
    }

    // 2. Partial Yearly Payment (installment towards annual subscription)
    // Matches if amount is near effectiveYearlyTarget (shortfall <= $30), OR if user was explicitly on yearly cadence and amount >= 50% of yearly rate
    const isYearlyIntent = totalCredit < effectiveYearlyTarget && (
        (effectiveYearlyTarget - totalCredit <= 30) ||
        (user.subscriptionCadence === "YEARLY" && totalCredit >= (effectiveYearlyTarget * 0.5)) ||
        (totalCredit >= 50 && totalCredit > (monthlyPrice * 2.5))
    );

    if (isYearlyIntent) {
        const shortfall = Math.max(0, Math.round((effectiveYearlyTarget - totalCredit) * 100) / 100);
        return {
            action: "PARTIAL_YEARLY",
            amountPaidNow,
            previousCredit,
            totalCredit,
            targetPrice: effectiveYearlyTarget,
            shortfall,
            newAccountCredit: totalCredit,
            cadence: "YEARLY"
        };
    }

    // 3. Full Monthly Fulfillment (meets or exceeds monthly rate)
    if (totalCredit >= monthlyPrice) {
        const monthsGranted = Math.max(1, Math.floor(totalCredit / monthlyPrice));
        const costUsed = Math.round(monthsGranted * monthlyPrice * 100) / 100;
        const excessCredit = Math.max(0, Math.round((totalCredit - costUsed) * 100) / 100);

        const { newExpiryDate, periodGrantedText } = calculateAlignedExpiryDate({
            paymentDate,
            totalAmount: costUsed,
            yearlyPrice,
            monthlyPrice,
            existingExpiry
        });

        return {
            action: "FULL_MONTHLY",
            amountPaidNow,
            previousCredit,
            totalCredit,
            targetPrice: monthlyPrice,
            creditedAmount: costUsed,
            newAccountCredit: excessCredit,
            monthsGranted,
            periodGrantedText,
            newExpiryDate,
            cadence: "MONTHLY",
            excessCredit
        };
    }

    // 3b. Prorated First-Month Standalone Monthly Fulfillment
    // If a trial/new user pays the exact prorated remainder-of-month quote (e.g. $9.03 for 16 days left in Oct)
    const hasActiveSubscription = existingExpiry && existingExpiry.getTime() > paymentDate.getTime();
    if (!hasActiveSubscription && totalCredit >= 2) {
        const monthlyNow = calculateProratedBilling({ startDate: paymentDate, trialDays: 0, yearlyPrice, monthlyPrice }).monthlyAmountDueNow;
        const monthlyTrial14 = calculateProratedBilling({ startDate: paymentDate, trialDays: 14, yearlyPrice, monthlyPrice }).monthlyAmountDueNow;
        const monthlyUserTrial = user.trialEndsAt
            ? calculateProratedBilling({ trialEndDate: user.trialEndsAt, yearlyPrice, monthlyPrice }).monthlyAmountDueNow
            : null;

        const candidateMonthlyQuotes = [
            monthlyNow,
            monthlyTrial14,
            ...(monthlyUserTrial ? [monthlyUserTrial] : [])
        ].filter(q => q >= 2 && q < monthlyPrice);

        const matchedMonthlyQuote = candidateMonthlyQuotes.find(q => Math.abs(totalCredit - q) <= 0.50);
        if (matchedMonthlyQuote !== undefined) {
            const costUsed = Math.min(totalCredit, matchedMonthlyQuote);
            const excessCredit = Math.max(0, Math.round((totalCredit - costUsed) * 100) / 100);
            const targetMonthEnd = user.trialEndsAt ? new Date(user.trialEndsAt) : paymentDate;
            const refDate = targetMonthEnd > paymentDate ? targetMonthEnd : paymentDate;
            const newExpiryDate = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 1, 23, 59, 59, 999);
            const periodGrantedText = `Remainder of ${refDate.toLocaleDateString("en-US", { month: "long" })} (Active until ${newExpiryDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })})`;

            return {
                action: "FULL_MONTHLY",
                amountPaidNow,
                previousCredit,
                totalCredit,
                targetPrice: matchedMonthlyQuote,
                creditedAmount: costUsed,
                newAccountCredit: excessCredit,
                monthsGranted: 1,
                periodGrantedText,
                newExpiryDate,
                cadence: "MONTHLY",
                excessCredit
            };
        }
    }

    // 4. Partial Monthly Payment (underpayment below monthly threshold)
    const monthlyShortfall = Math.max(0, Math.round((monthlyPrice - totalCredit) * 100) / 100);
    const yearlyShortfall = Math.max(0, Math.round((effectiveYearlyTarget - totalCredit) * 100) / 100);

    return {
        action: "PARTIAL_MONTHLY",
        amountPaidNow,
        previousCredit,
        totalCredit,
        targetMonthlyPrice: monthlyPrice,
        targetYearlyPrice: effectiveYearlyTarget,
        monthlyShortfall,
        yearlyShortfall,
        newAccountCredit: totalCredit,
        cadence: "MONTHLY"
    };
}
