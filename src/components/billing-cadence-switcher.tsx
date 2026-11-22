"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Calendar, CheckCircle2, DollarSign, Loader2 } from "lucide-react";
import { format, isValid } from "date-fns";
import { updateCurrentUserBillingCadenceAction } from "@/app/actions";
import { calculateProratedBilling } from "@/lib/prorated-billing";
import { Badge } from "@/components/ui/badge";

export interface BillingPricingConfig {
    yearlyPrice?: number | null;
    monthlyPrice?: number | null;
    tier2YearlyPrice?: number | null;
    tier2MonthlyPrice?: number | null;
    renewalMonth?: number | null;
    renewalDay?: number | null;
}

export interface BillingCadenceSwitcherProps {
    user: {
        id?: string;
        role?: string;
        status?: string;
        membershipTier?: string | null;
        subscriptionCadence?: string | null;
        subscriptionEndsAt?: Date | string | null;
        trialEndsAt?: Date | string | null;
        createdAt?: Date | string | null;
        accountCredit?: number | null;
    } | null | undefined;
    pricing?: BillingPricingConfig | null;
    referralInfo?: any;
    variant?: "dashboard" | "settings";
    onCadenceChanged?: (cadence: "MONTHLY" | "YEARLY") => void;
    className?: string;
}

function formatMoney(amount: number): string {
    const clean = Math.max(0, Math.round(amount * 100) / 100);
    return clean % 1 === 0 ? `$${clean.toFixed(0)}` : `$${clean.toFixed(2)}`;
}

export function BillingCadenceSwitcher({
    user,
    pricing,
    referralInfo,
    variant = "settings",
    onCadenceChanged,
    className = ""
}: BillingCadenceSwitcherProps) {
    const router = useRouter();
    const initialCadence: "MONTHLY" | "YEARLY" =
        user?.subscriptionCadence === "MONTHLY" ? "MONTHLY" : "YEARLY";
    const [selectedCadence, setSelectedCadence] = useState<"MONTHLY" | "YEARLY">(initialCadence);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        if (user?.subscriptionCadence === "MONTHLY" || user?.subscriptionCadence === "YEARLY") {
            setSelectedCadence(user.subscriptionCadence);
        }
    }, [user?.subscriptionCadence]);

    if (!user) return null;

    const isTrial =
        (user.status === "TRIAL" || user.membershipTier === "TRIAL") &&
        user.status !== "APPROVED" &&
        user.role !== "ADMIN";

    const isPermanent =
        user.role === "ADMIN" ||
        user.subscriptionCadence === "PERMANENT" ||
        user.membershipTier === "PERMANENT" ||
        (!user.subscriptionEndsAt && !isTrial && user.status === "APPROVED");

    if (isPermanent) return null;

    const isTier2 = user.membershipTier === "TIER_2_VIP";
    const yearlyRate = isTier2
        ? (pricing?.tier2YearlyPrice ?? 240)
        : (pricing?.yearlyPrice ?? 180);
    const monthlyRate = isTier2
        ? (pricing?.tier2MonthlyPrice ?? 25)
        : (pricing?.monthlyPrice ?? 17.5);
    const renewalMonth = pricing?.renewalMonth ?? 1;
    const renewalDay = pricing?.renewalDay ?? 1;
    const creditBalance = Math.max(0, Number(user.accountCredit || 0));

    let annualDueAmount = yearlyRate;
    let monthlyDueAmount = monthlyRate;
    let annualDueDateLabel = "";
    let monthlyDueDateLabel = "";

    if (isTrial) {
        const prorated = calculateProratedBilling({
            startDate: user.createdAt || new Date(),
            trialEndDate: user.trialEndsAt || null,
            yearlyPrice: yearlyRate,
            monthlyPrice: monthlyRate,
            renewalMonth,
            renewalDay
        });
        annualDueAmount = Math.max(0, Math.round((prorated.amountDueNow - creditBalance) * 100) / 100);
        monthlyDueAmount = Math.max(0, Math.round((prorated.monthlyAmountDueNow - creditBalance) * 100) / 100);
        const trialEnd = user.trialEndsAt ? new Date(user.trialEndsAt) : null;
        const trialEndStr = trialEnd && isValid(trialEnd) ? format(trialEnd, "MMM d, yyyy") : "when trial ends";
        annualDueDateLabel = `Due ${trialEndStr} (covers through ${prorated.nextRenewalDate})`;
        monthlyDueDateLabel = `Due ${trialEndStr} (then ${formatMoney(monthlyRate)}/mo on ${prorated.nextMonthlyRenewalDate})`;
    } else {
        const subEnd = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
        const hasValidEnd = subEnd !== null && isValid(subEnd);
        const now = new Date();
        const isPastDue = hasValidEnd && subEnd.getTime() < now.getTime();
        const expStr = hasValidEnd ? format(subEnd, "MMMM d, yyyy") : "upcoming renewal";
        const discountedYearly = referralInfo?.renewalSummary?.discountedYearlyPrice ?? yearlyRate;

        annualDueAmount = Math.max(0, Math.round((discountedYearly - creditBalance) * 100) / 100);
        monthlyDueAmount = Math.max(0, Math.round((monthlyRate - creditBalance) * 100) / 100);

        const delayedMonthlyStart = referralInfo?.renewalSummary?.delayedMonthlyStartDate;
        annualDueDateLabel = isPastDue ? `Due now (expired ${expStr})` : `Due ${expStr}`;
        monthlyDueDateLabel = isPastDue
            ? `Due now (expired ${expStr})`
            : delayedMonthlyStart
            ? `Due ${delayedMonthlyStart} (after referral credits)`
            : `Due ${expStr} (then monthly)`;
    }

    const annualMonthlyEquivalent = Math.round((yearlyRate / 12) * 100) / 100;
    const annualSavings = Math.max(0, Math.round((monthlyRate * 12 - yearlyRate) * 100) / 100);

    const activeAmountDue = selectedCadence === "MONTHLY" ? monthlyDueAmount : annualDueAmount;
    const activeDueLabel = selectedCadence === "MONTHLY" ? monthlyDueDateLabel : annualDueDateLabel;

    const handleSwitch = async (nextCadence: "MONTHLY" | "YEARLY") => {
        if (nextCadence === selectedCadence || saving) return;
        const prevCadence = selectedCadence;
        setSelectedCadence(nextCadence);
        setSaving(true);
        setFeedback(null);
        try {
            const res = await updateCurrentUserBillingCadenceAction(nextCadence);
            if (!res.success) {
                setSelectedCadence(prevCadence);
                setFeedback({ type: "error", text: res.error || "Could not update billing plan." });
                return;
            }
            onCadenceChanged?.(nextCadence);
            if (variant === "settings") {
                setFeedback({
                    type: "success",
                    text: nextCadence === "MONTHLY"
                        ? "Plan set to Monthly. Payment details updated below."
                        : "Plan set to Annual. Payment details updated below."
                });
                setTimeout(() => setFeedback(null), 4500);
            }
            router.refresh();
        } catch (err: any) {
            setSelectedCadence(prevCadence);
            setFeedback({ type: "error", text: err?.message || "Failed to save preference." });
        } finally {
            setSaving(false);
        }
    };

    if (variant === "dashboard") {
        return (
            <div className={`flex flex-wrap items-center gap-2 min-w-0 ${className}`}>
                {/* Segmented Toggle */}
                <div
                    role="group"
                    aria-label="Billing plan frequency"
                    className="inline-flex items-center rounded-lg bg-background/80 dark:bg-black/40 border border-border/70 p-0.5 shadow-2xs shrink-0"
                >
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSwitch("MONTHLY")}
                        aria-pressed={selectedCadence === "MONTHLY"}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer tabular-nums ${
                            selectedCadence === "MONTHLY"
                                ? "bg-amber-500 text-slate-950 shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Monthly ({formatMoney(monthlyRate)})
                    </button>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSwitch("YEARLY")}
                        aria-pressed={selectedCadence === "YEARLY"}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer tabular-nums ${
                            selectedCadence === "YEARLY"
                                ? "bg-emerald-500 text-slate-950 shadow-xs"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Annual ({formatMoney(yearlyRate)})
                    </button>
                </div>

                {/* Live Amount Due + Due Date */}
                <Badge
                    variant="outline"
                    className="bg-background/70 dark:bg-white/[0.04] text-foreground border-border/70 text-[11px] font-semibold px-2.5 py-1 gap-1.5 tabular-nums whitespace-normal text-left max-w-full"
                >
                    {saving ? (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />
                    ) : (
                        <DollarSign className="h-3 w-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    )}
                    <span>
                        <strong className="font-extrabold text-emerald-700 dark:text-emerald-400">{formatMoney(activeAmountDue)}</strong>{" "}
                        <span className="text-muted-foreground font-medium">{activeDueLabel}</span>
                    </span>
                </Badge>

                {feedback?.type === "error" && (
                    <span className="text-[11px] text-rose-600 dark:text-rose-400 font-medium">{feedback.text}</span>
                )}
            </div>
        );
    }

    return (
        <div className={`p-3.5 sm:p-4 rounded-xl bg-muted/50 dark:bg-white/[0.03] border border-border/70 dark:border-white/[0.07] space-y-3 ${className}`}>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="space-y-0.5 min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground block">
                        Choose Your Billing Plan
                    </span>
                    <p className="text-xs text-muted-foreground">
                        Switch between Monthly or Annual anytime — updates your amount due and payment links below.
                    </p>
                </div>

                <div
                    role="group"
                    aria-label="Billing plan frequency"
                    className="inline-flex flex-wrap items-center rounded-xl bg-background/90 dark:bg-black/50 border border-border p-1 shrink-0 self-start sm:self-auto max-w-full gap-1"
                >
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSwitch("MONTHLY")}
                        aria-pressed={selectedCadence === "MONTHLY"}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer tabular-nums ${
                            selectedCadence === "MONTHLY"
                                ? "bg-amber-500 text-slate-950 shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        Monthly ({formatMoney(monthlyRate)}/mo)
                    </button>
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleSwitch("YEARLY")}
                        aria-pressed={selectedCadence === "YEARLY"}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer tabular-nums flex items-center gap-1.5 ${
                            selectedCadence === "YEARLY"
                                ? "bg-emerald-500 text-slate-950 shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                        }`}
                    >
                        <span>Annual ({formatMoney(yearlyRate)}/yr)</span>
                        {annualSavings > 0 && (
                            <span className={`text-[10px] px-1.5 py-0.2 rounded font-extrabold hidden sm:inline ${
                                selectedCadence === "YEARLY"
                                    ? "bg-slate-950/15 text-slate-950"
                                    : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                            }`}>
                                Save {formatMoney(annualSavings)}
                            </span>
                        )}
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-lg bg-background/70 dark:bg-black/30 border border-border/60 flex items-center justify-between gap-2 min-w-0">
                    <div className="space-y-0.5 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            Amount Due ({selectedCadence === "MONTHLY" ? "Monthly Plan" : "Annual Pass"})
                        </span>
                        <div className="text-lg font-black text-emerald-700 dark:text-emerald-400 tabular-nums">
                            {formatMoney(activeAmountDue)}
                            {selectedCadence === "YEARLY" && !isTrial && (
                                <span className="text-[11px] font-semibold text-muted-foreground ml-1.5">
                                    ({formatMoney(annualMonthlyEquivalent)}/mo equiv.)
                                </span>
                            )}
                        </div>
                    </div>
                    <DollarSign className="h-5 w-5 text-emerald-600/70 dark:text-emerald-400/70 shrink-0" />
                </div>

                <div className="p-3 rounded-lg bg-background/70 dark:bg-black/30 border border-border/60 flex items-center justify-between gap-2 min-w-0">
                    <div className="space-y-0.5 min-w-0">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block">
                            When It&apos;s Due
                        </span>
                        <div className="text-xs font-bold text-foreground leading-snug">
                            {activeDueLabel}
                        </div>
                    </div>
                    <Calendar className="h-5 w-5 text-amber-600/70 dark:text-amber-400/70 shrink-0" />
                </div>
            </div>

            {feedback && (
                <div className={`text-xs flex items-center gap-1.5 font-medium ${
                    feedback.type === "success"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-rose-700 dark:text-rose-400"
                }`}>
                    {feedback.type === "success" && <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                    <span>{feedback.text}</span>
                </div>
            )}
        </div>
    );
}
