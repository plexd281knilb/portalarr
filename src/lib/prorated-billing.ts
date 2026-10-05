export interface ProratedBillingResult {
    trialDays: number;
    trialStartDate: string;
    trialEndDate: string;
    trialEndMonthName: string;
    trialEndDay: number;
    trialEndYear: number;
    daysInTrialEndMonth: number;
    daysRemainingInMonth: number;
    dailyRate: number;
    proratedMonthAmount: number;
    proratedMonthText: string;
    remainingMonthsCount: number;
    remainingMonthsNames: string[];
    remainingMonthsText: string;
    monthlyRate: number;
    standaloneMonthlyRate: number;
    monthlyDailyRate: number;
    annualMonthlyRate: number;
    yearlyRate: number;
    amountDueNow: number;
    amountDueText: string;
    yearlyBreakdownText: string;
    monthlyAmountDueNow: number;
    monthlyAmountDueText: string;
    nextMonthlyRenewalDate: string;
    nextRenewalDate: string;
    nextRenewalAmount: number;
    nextRenewalText: string;
    breakdownSummary: string;
    monthlyBreakdownSummary: string;
}

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/**
 * Calculates fully dynamic prorated subscription billing based on trial start/end dates.
 * By default, annual renewal occurs on January 1st (Tier 1 base rates).
 * 
 * - Monthly Proration: Divides monthly rate by days remaining in the trial-end month.
 * - Yearly Proration: Combines the remaining days in the trial-end month with all remaining full months in the calendar year.
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
    
    // Annual proration strictly derives the monthly base from the annual price (e.g. $180 / 12 = $15/mo)
    const annualMonthlyRate = yearlyRate > 0 ? Math.round((yearlyRate / 12) * 100) / 100 : 15;
    
    // Standalone monthly plan rate (defaults to annualMonthlyRate if not set)
    const standaloneMonthlyRate = typeof options.monthlyPrice === "number" && options.monthlyPrice > 0 
        ? options.monthlyPrice 
        : annualMonthlyRate;

    const start = options.startDate ? new Date(options.startDate) : new Date();
    const end = new Date(start.getTime() + trialDays * 24 * 60 * 60 * 1000);

    const endYear = end.getFullYear();
    const endMonthIdx = end.getMonth(); // 0 = Jan, 9 = Oct, 11 = Dec
    const endDay = end.getDate();
    const trialEndMonthName = MONTH_NAMES[endMonthIdx];

    const renewalMonth = options.renewalMonth || 1;
    const renewalDay = options.renewalDay || 1;

    // Days in the trial-end month
    const daysInTrialEndMonth = new Date(endYear, endMonthIdx + 1, 0).getDate();
    const daysRemainingInMonth = Math.max(0, daysInTrialEndMonth - endDay);
    
    // Annual plan calculations (strictly based on annualMonthlyRate: e.g. $15/mo)
    const dailyRate = Math.round((annualMonthlyRate / daysInTrialEndMonth) * 100) / 100;
    const proratedMonthAmount = Math.round(((daysRemainingInMonth / daysInTrialEndMonth) * annualMonthlyRate) * 100) / 100;

    // Remaining full calendar months in current year after the month trial ends
    const remainingMonthsIndices: number[] = [];
    for (let m = endMonthIdx + 1; m < 12; m++) {
        remainingMonthsIndices.push(m);
    }

    const remainingMonthsCount = remainingMonthsIndices.length;
    const remainingMonthsNames = remainingMonthsIndices.map(i => MONTH_NAMES[i]);
    const fullMonthsAmount = Math.round(remainingMonthsCount * annualMonthlyRate * 100) / 100;

    // Standalone monthly plan calculation
    const monthlyDailyRate = Math.round((standaloneMonthlyRate / daysInTrialEndMonth) * 100) / 100;
    const standaloneProratedMonth = Math.round(((daysRemainingInMonth / daysInTrialEndMonth) * standaloneMonthlyRate) * 100) / 100;
    const nextMonthIdx = (endMonthIdx + 1) % 12;
    const nextMonthYear = endMonthIdx === 11 ? endYear + 1 : endYear;
    const nextMonthlyRenewalDate = `${MONTH_NAMES[nextMonthIdx]} 1, ${nextMonthYear}`;
    const monthlyAmountDueNow = daysRemainingInMonth > 0 ? standaloneProratedMonth : standaloneMonthlyRate;
    const monthlyAmountDueText = daysRemainingInMonth > 0 
        ? `$${standaloneProratedMonth.toFixed(2)} (${daysRemainingInMonth} days in ${trialEndMonthName})`
        : `$${standaloneMonthlyRate}/mo`;
    const monthlyBreakdownSummary = daysRemainingInMonth > 0
        ? `$${standaloneProratedMonth.toFixed(2)} for ${daysRemainingInMonth} days remaining in ${trialEndMonthName} ($${monthlyDailyRate.toFixed(2)}/day), then $${standaloneMonthlyRate}/month starting ${nextMonthlyRenewalDate}.`
        : `$${standaloneMonthlyRate}/month starting ${nextMonthlyRenewalDate}.`;

    // Yearly plan calculation (Days remaining in current month + Remaining full months)
    let amountDueNow = 0;
    let amountDueText = "";
    let nextRenewalYear = endYear + 1;
    let nextRenewalDate = `${MONTH_NAMES[renewalMonth - 1]} ${renewalDay}, ${nextRenewalYear}`;
    let remainingMonthsText = "";
    let yearlyBreakdownText = "";
    let breakdownSummary = "";
    const proratedMonthText = `${daysRemainingInMonth} days in ${trialEndMonthName} ($${proratedMonthAmount.toFixed(2)})`;

    if (remainingMonthsCount > 0 || daysRemainingInMonth > 0) {
        amountDueNow = Math.round((proratedMonthAmount + fullMonthsAmount) * 100) / 100;

        if (remainingMonthsCount > 0 && daysRemainingInMonth > 0) {
            const firstMonth = remainingMonthsNames[0];
            const lastMonth = remainingMonthsNames[remainingMonthsNames.length - 1];
            remainingMonthsText = remainingMonthsCount === 1 
                ? `${daysRemainingInMonth} days in ${trialEndMonthName} + ${firstMonth} ${endYear} (1 mo)` 
                : `${daysRemainingInMonth} days in ${trialEndMonthName} + ${firstMonth} – ${lastMonth} ${endYear} (${remainingMonthsCount} mos)`;
            yearlyBreakdownText = `${daysRemainingInMonth} days in ${trialEndMonthName.slice(0, 3)} ($${proratedMonthAmount.toFixed(2)}) + ${remainingMonthsCount} mos ($${fullMonthsAmount.toFixed(2)})`;
            breakdownSummary = `$${amountDueNow.toFixed(2)} for remainder of ${endYear} (${daysRemainingInMonth} days in ${trialEndMonthName} @ $${proratedMonthAmount.toFixed(2)} + ${remainingMonthsCount} full mos @ $${annualMonthlyRate.toFixed(2)}/mo), then $${yearlyRate}/year renewing on ${nextRenewalDate}.`;
        } else if (daysRemainingInMonth > 0) {
            remainingMonthsText = `${daysRemainingInMonth} days in ${trialEndMonthName} ${endYear}`;
            yearlyBreakdownText = `${daysRemainingInMonth} days in ${trialEndMonthName.slice(0, 3)} ($${proratedMonthAmount.toFixed(2)})`;
            breakdownSummary = `$${amountDueNow.toFixed(2)} for ${daysRemainingInMonth} days remaining in ${trialEndMonthName} ${endYear} ($${dailyRate.toFixed(2)}/day), then $${yearlyRate}/year renewing on ${nextRenewalDate}.`;
        } else {
            const firstMonth = remainingMonthsNames[0];
            const lastMonth = remainingMonthsNames[remainingMonthsNames.length - 1];
            remainingMonthsText = remainingMonthsCount === 1 
                ? `${firstMonth} ${endYear} (1 month)` 
                : `${firstMonth} – ${lastMonth} ${endYear} (${remainingMonthsCount} months)`;
            yearlyBreakdownText = `${remainingMonthsCount} mos (${firstMonth.slice(0, 3)}–${lastMonth.slice(0, 3)})`;
            breakdownSummary = `$${amountDueNow.toFixed(2)} for ${remainingMonthsText} @ $${annualMonthlyRate.toFixed(2)}/mo, then $${yearlyRate}/year renewing on ${nextRenewalDate}.`;
        }

        amountDueText = `$${amountDueNow.toFixed(2)} for rest of ${endYear}`;
    } else {
        // Trial ends on the very last day of December -> amount due covers upcoming full year
        amountDueNow = yearlyRate;
        remainingMonthsText = `Full upcoming year (${nextRenewalYear})`;
        yearlyBreakdownText = `Full year ${nextRenewalYear} ($${yearlyRate})`;
        amountDueText = `$${yearlyRate} for ${nextRenewalYear}`;
        nextRenewalDate = `${MONTH_NAMES[renewalMonth - 1]} ${renewalDay}, ${nextRenewalYear + 1}`;
        breakdownSummary = `$${yearlyRate} for the full ${nextRenewalYear} calendar year starting ${MONTH_NAMES[renewalMonth - 1]} ${renewalDay}, ${nextRenewalYear}.`;
    }

    return {
        trialDays,
        trialStartDate: start.toISOString(),
        trialEndDate: end.toISOString(),
        trialEndMonthName,
        trialEndDay: endDay,
        trialEndYear: endYear,
        daysInTrialEndMonth,
        daysRemainingInMonth,
        dailyRate,
        proratedMonthAmount,
        proratedMonthText,
        remainingMonthsCount,
        remainingMonthsNames,
        remainingMonthsText,
        monthlyRate: annualMonthlyRate,
        standaloneMonthlyRate,
        monthlyDailyRate,
        annualMonthlyRate,
        yearlyRate,
        amountDueNow,
        amountDueText,
        yearlyBreakdownText,
        monthlyAmountDueNow,
        monthlyAmountDueText,
        nextMonthlyRenewalDate,
        nextRenewalDate,
        nextRenewalAmount: yearlyRate,
        nextRenewalText: `$${yearlyRate} on ${nextRenewalDate}`,
        breakdownSummary,
        monthlyBreakdownSummary
    };
}
