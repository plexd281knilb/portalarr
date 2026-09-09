export interface ProratedBillingResult {
    trialDays: number;
    trialStartDate: string;
    trialEndDate: string;
    trialEndMonthName: string;
    trialEndYear: number;
    remainingMonthsCount: number;
    remainingMonthsNames: string[];
    remainingMonthsText: string;
    monthlyRate: number;
    yearlyRate: number;
    amountDueNow: number;
    amountDueText: string;
    nextRenewalDate: string;
    nextRenewalAmount: number;
    nextRenewalText: string;
    breakdownSummary: string;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/**
 * Calculates prorated annual subscription billing based on trial start/end dates.
 * By default, annual renewal is on January 1st. 
 * If a trial completes in Month M (e.g. September), the subscriber pays for the remaining
 * months of that calendar year (e.g. October, November, December = 3 months * monthlyRate),
 * followed by the full annual amount on January 1st.
 */
export function calculateProratedBilling(options: {
    startDate?: Date | string;
    trialDays?: number;
    yearlyPrice?: number;
    monthlyPrice?: number;
    renewalMonth?: number; // 1-indexed (1 = January)
    renewalDay?: number;   // 1 = 1st
}): ProratedBillingResult {
    const trialDays = options.trialDays && options.trialDays > 0 ? options.trialDays : 14;
    const yearlyRate = typeof options.yearlyPrice === "number" && options.yearlyPrice >= 0 ? options.yearlyPrice : 180;
    const monthlyRate = typeof options.monthlyPrice === "number" && options.monthlyPrice > 0 
        ? options.monthlyPrice 
        : (yearlyRate > 0 ? Math.round((yearlyRate / 12) * 100) / 100 : 15);

    const start = options.startDate ? new Date(options.startDate) : new Date();
    const end = new Date(start.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const endYear = end.getFullYear();
    const endMonthIdx = end.getMonth(); // 0 = Jan, 8 = Sep, 11 = Dec
    const trialEndMonthName = MONTH_NAMES[endMonthIdx];

    const renewalMonth = options.renewalMonth || 1;
    const renewalDay = options.renewalDay || 1;

    // Determine remaining calendar months in current year after the month trial ends
    const remainingMonthsIndices: number[] = [];
    for (let m = endMonthIdx + 1; m < 12; m++) {
        remainingMonthsIndices.push(m);
    }

    const remainingMonthsCount = remainingMonthsIndices.length;
    const remainingMonthsNames = remainingMonthsIndices.map(i => MONTH_NAMES[i]);

    let amountDueNow = 0;
    let amountDueText = "";
    let nextRenewalYear = endYear + 1;
    let nextRenewalDate = `${MONTH_NAMES[renewalMonth - 1]} ${renewalDay}, ${nextRenewalYear}`;
    let remainingMonthsText = "";
    let breakdownSummary = "";

    if (remainingMonthsCount > 0) {
        amountDueNow = Math.round(remainingMonthsCount * monthlyRate * 100) / 100;
        const firstMonth = remainingMonthsNames[0];
        const lastMonth = remainingMonthsNames[remainingMonthsNames.length - 1];
        remainingMonthsText = remainingMonthsCount === 1 
            ? `${firstMonth} ${endYear} (1 month)` 
            : `${firstMonth} – ${lastMonth} ${endYear} (${remainingMonthsCount} months)`;

        amountDueText = `$${amountDueNow} for rest of ${endYear}`;
        breakdownSummary = `$${amountDueNow} for the remainder of ${endYear} (${remainingMonthsText} @ $${monthlyRate}/mo), then $${yearlyRate}/year renewing on ${nextRenewalDate}.`;
    } else {
        // Trial ends in December -> amount due now covers upcoming full year
        amountDueNow = yearlyRate;
        remainingMonthsText = `Full upcoming year (${nextRenewalYear})`;
        amountDueText = `$${yearlyRate} for ${nextRenewalYear}`;
        nextRenewalDate = `${MONTH_NAMES[renewalMonth - 1]} ${renewalDay}, ${nextRenewalYear + 1}`;
        breakdownSummary = `$${yearlyRate} for the full ${nextRenewalYear} calendar year starting ${MONTH_NAMES[renewalMonth - 1]} ${renewalDay}, ${nextRenewalYear}.`;
    }

    return {
        trialDays,
        trialStartDate: start.toISOString(),
        trialEndDate: end.toISOString(),
        trialEndMonthName,
        trialEndYear: endYear,
        remainingMonthsCount,
        remainingMonthsNames,
        remainingMonthsText,
        monthlyRate,
        yearlyRate,
        amountDueNow,
        amountDueText,
        nextRenewalDate,
        nextRenewalAmount: yearlyRate,
        nextRenewalText: `$${yearlyRate} on ${nextRenewalDate}`,
        breakdownSummary
    };
}
