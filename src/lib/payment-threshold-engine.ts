import { calculateAlignedExpiryDate } from "./payment-email-scraper";

export interface UserPaymentContext {
    id?: string;
    username?: string;
    email?: string;
    accountCredit?: number | null;
    membershipTier?: string | null;
    subscriptionCadence?: string | null;
    subscriptionEndsAt?: Date | string | null;
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
 * Evaluates an incoming payment against subscription thresholds and available account credit.
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

    const amountPaidNow = Math.round(Number(payment.amount) * 100) / 100;
    const previousCredit = Math.max(0, Math.round(Number(user.accountCredit || 0) * 100) / 100);
    const totalCredit = Math.round((previousCredit + amountPaidNow) * 100) / 100;

    const paymentDate = payment.emailDate ? new Date(payment.emailDate) : new Date();
    const existingExpiry = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;

    // 1. Full Yearly Fulfillment (meets or exceeds annual subscription threshold)
    if (totalCredit >= yearlyPrice) {
        const yearsGranted = Math.max(1, Math.floor(totalCredit / yearlyPrice));
        const costUsed = yearsGranted * yearlyPrice;
        const excessCredit = Math.max(0, Math.round((totalCredit - costUsed) * 100) / 100);

        const { newExpiryDate, periodGrantedText } = calculateAlignedExpiryDate({
            paymentDate,
            totalAmount: costUsed,
            yearlyPrice,
            monthlyPrice,
            existingExpiry
        });

        return {
            action: "FULL_YEARLY",
            amountPaidNow,
            previousCredit,
            totalCredit,
            targetPrice: yearlyPrice,
            creditedAmount: costUsed,
            newAccountCredit: excessCredit,
            periodGrantedText,
            newExpiryDate,
            cadence: "YEARLY",
            excessCredit,
            yearsGranted
        };
    }

    // 2. Partial Yearly Payment (installment towards annual subscription)
    // Matches if amount is near yearly price (shortfall <= $30), OR if user was explicitly on yearly cadence and amount >= 50% of yearly rate
    const isYearlyIntent = totalCredit < yearlyPrice && (
        (yearlyPrice - totalCredit <= 30) ||
        (user.subscriptionCadence === "YEARLY" && totalCredit >= (yearlyPrice * 0.5)) ||
        (totalCredit >= 50 && totalCredit > (monthlyPrice * 2.5))
    );

    if (isYearlyIntent) {
        const shortfall = Math.max(0, Math.round((yearlyPrice - totalCredit) * 100) / 100);
        return {
            action: "PARTIAL_YEARLY",
            amountPaidNow,
            previousCredit,
            totalCredit,
            targetPrice: yearlyPrice,
            shortfall,
            newAccountCredit: totalCredit,
            cadence: "YEARLY"
        };
    }

    // 3. Full Monthly Fulfillment (meets or exceeds monthly rate)
    if (totalCredit >= monthlyPrice) {
        const monthsGranted = Math.max(1, Math.floor(totalCredit / monthlyPrice));
        const costUsed = monthsGranted * monthlyPrice;
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

    // 4. Partial Monthly Payment (underpayment below monthly threshold)
    const monthlyShortfall = Math.max(0, Math.round((monthlyPrice - totalCredit) * 100) / 100);
    const yearlyShortfall = Math.max(0, Math.round((yearlyPrice - totalCredit) * 100) / 100);

    return {
        action: "PARTIAL_MONTHLY",
        amountPaidNow,
        previousCredit,
        totalCredit,
        targetMonthlyPrice: monthlyPrice,
        targetYearlyPrice: yearlyPrice,
        monthlyShortfall,
        yearlyShortfall,
        newAccountCredit: totalCredit,
        cadence: "MONTHLY"
    };
}
