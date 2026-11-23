import { calculateAlignedExpiryDate } from "./payment-email-scraper";
import { calculateProratedBilling } from "./prorated-billing";
import { computeReferralYearlyTarget } from "./referral-rewards";

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
    // Calculate active referral reward discount for annual renewals (+1 free month / yearlyPrice/12 off per converted friend)
    const { referralDiscount, effectiveYearlyTarget } = computeReferralYearlyTarget({
        yearlyPrice,
        referralBonusMonths: user.referralBonusMonths,
        referrals: user.referrals
    });

    const amountPaidNow = Math.round(Number(payment.amount) * 100) / 100;
    const previousCredit = Math.max(0, Math.round(Number(user.accountCredit || 0) * 100) / 100);
    const totalCredit = Math.round((previousCredit + amountPaidNow) * 100) / 100;

    const paymentDate = payment.emailDate ? new Date(payment.emailDate) : new Date();
    const payYear = paymentDate.getFullYear();
    const existingExpiry = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
    const explicitCadence = (user.subscriptionCadence || "").toUpperCase();

    // 1. Full Yearly Fulfillment (meets or exceeds annual subscription threshold or referral-discounted annual target)
    // Year 1 applies effectiveYearlyTarget (preserving any overpayment like $180 sent on a $165 discounted renewal as accountCredit);
    // extra prepaid years use standard yearlyPrice.
    if (totalCredit >= yearlyPrice || (referralDiscount > 0 && totalCredit > 0 && totalCredit >= effectiveYearlyTarget)) {
        const remainingAfterFirstYear = Math.max(0, Math.round((totalCredit - effectiveYearlyTarget) * 100) / 100);
        const additionalYears = yearlyPrice > 0 ? Math.floor(remainingAfterFirstYear / yearlyPrice) : 0;
        const yearsGranted = 1 + additionalYears;
        const costUsed = Math.round((effectiveYearlyTarget + additionalYears * yearlyPrice) * 100) / 100;
        const excessCredit = Math.max(0, Math.round((totalCredit - costUsed) * 100) / 100);

        const { newExpiryDate, periodGrantedText } = calculateAlignedExpiryDate({
            paymentDate,
            totalAmount: yearsGranted * yearlyPrice,
            yearlyPrice,
            monthlyPrice,
            existingExpiry,
            forceCadence: "YEARLY"
        });

        return {
            action: "FULL_YEARLY",
            amountPaidNow,
            previousCredit,
            totalCredit,
            targetPrice: effectiveYearlyTarget,
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
    // Checks if a new, trial, expired, or yearly-cadence user is paying the Rest-of-Year prorated annual quote.
    // Never swallow installments from members already paid through end of year (Dec 31 / Jan 1) or active APPROVED Q4 members.
    // Explicit MONTHLY subscribers stay on monthly fulfillment unless paying full annual rate in Step 1.
    const endOfYearBoundary = new Date(payYear, 11, 31, 0, 0, 0, 0).getTime();
    const isAlreadyCoveredForUpcomingYear = Boolean(
        (existingExpiry && existingExpiry.getTime() >= endOfYearBoundary) ||
        (paymentDate.getMonth() >= 9 && user.status === "APPROVED" && existingExpiry && existingExpiry.getTime() > paymentDate.getTime())
    );
    const monthsExactCount = monthlyPrice > 0 ? Math.round(totalCredit / monthlyPrice) : 0;
    const isExactMonthlyMultiple = monthsExactCount >= 1 && Math.abs(totalCredit - (monthsExactCount * monthlyPrice)) <= 0.05;
    if (!isAlreadyCoveredForUpcomingYear && explicitCadence !== "MONTHLY") {
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

        // Or in Jan-Sep (Q1-Q3), if totalCredit meets or exceeds the Rest-of-Year prorated quote (and isn't an exact multi-month prepayment)
        const minRestOfYearQuote = candidateAnnualQuotes.length > 0 ? Math.min(...candidateAnnualQuotes) : yearlyPrice;
        const isMidYearRestOfYearFulfillment =
            !isExactMonthlyMultiple &&
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
    // Never trap explicit MONTHLY subscribers as partial yearly; for non-monthly accounts, any payment > 2 monthly payments
    // (or active YEARLY sub-monthly installment, near-yearly total, or >=50% YEARLY) accumulates toward the Annual Plan.
    const hasActiveSubOrApprovedYearly = Boolean(
        explicitCadence === "YEARLY" &&
        totalCredit < monthlyPrice &&
        (user.status === "APPROVED" || (existingExpiry && existingExpiry.getTime() > paymentDate.getTime()))
    );
    const isGreaterThanTwoMonthlyPayments = monthlyPrice > 0 && totalCredit > Math.round((monthlyPrice * 2) * 100) / 100;
    const isNearYearlyTarget = (effectiveYearlyTarget - totalCredit) <= 30;
    const isYearlyIntent = totalCredit < effectiveYearlyTarget && explicitCadence !== "MONTHLY" && (
        isNearYearlyTarget ||
        hasActiveSubOrApprovedYearly ||
        isGreaterThanTwoMonthlyPayments ||
        (explicitCadence === "YEARLY" && totalCredit >= (effectiveYearlyTarget * 0.5))
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
            existingExpiry,
            forceCadence: "MONTHLY"
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
