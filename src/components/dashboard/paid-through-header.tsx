"use client";

import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { Calendar, CreditCard, ArrowRight, Gift, AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PaidThroughHeaderProps {
    user: {
        id?: string;
        username?: string;
        role?: string;
        status?: string;
        membershipTier?: string | null;
        subscriptionCadence?: string | null;
        subscriptionEndsAt?: Date | string | null;
        trialEndsAt?: Date | string | null;
        accountCredit?: number | null;
    } | null | undefined;
    referralInfo?: any;
    className?: string;
}

export function PaidThroughHeader({ user, referralInfo, className = "" }: PaidThroughHeaderProps) {
    if (!user) return null;

    const subscriptionEndsAt = user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt) : null;
    const isValidDate = subscriptionEndsAt && !isNaN(subscriptionEndsAt.getTime());

    const isPermanent = 
        user.subscriptionCadence === "PERMANENT" || 
        user.membershipTier === "PERMANENT" || 
        (!subscriptionEndsAt && (user.role === "ADMIN" || user.status === "APPROVED"));

    const now = new Date();
    const daysRemaining = isValidDate ? differenceInDays(subscriptionEndsAt, now) : 0;
    const isExpiringSoon = isValidDate && daysRemaining <= 7 && daysRemaining >= 0;
    const isExpired = isValidDate && daysRemaining < 0;

    const cadenceLabel = 
        user.subscriptionCadence === "MONTHLY" 
            ? "Monthly Plan" 
            : user.subscriptionCadence === "YEARLY" 
            ? "Annual Plan" 
            : isPermanent 
            ? "Lifetime Pass" 
            : "Active Membership";

    const formattedDate = isValidDate 
        ? format(subscriptionEndsAt, "MMMM d, yyyy") 
        : isPermanent 
        ? "Permanent Lifetime Access" 
        : "Active";

    const accountCredit = Number(user.accountCredit || 0);

    return (
        <div 
            className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:px-4 sm:py-2.5 rounded-2xl border backdrop-blur-md shadow-xs transition-all ${
                isExpiringSoon
                    ? "bg-amber-500/[0.08] dark:bg-[#151310]/90 border-amber-500/40 text-amber-300"
                    : isExpired
                    ? "bg-rose-500/[0.08] dark:bg-[#181113]/90 border-rose-500/40 text-rose-300"
                    : "bg-emerald-500/[0.06] dark:bg-[#101714]/90 border-emerald-500/30 text-emerald-300"
            } ${className}`}
        >
            {/* Left: Glowing Indicator & Paid Through Info */}
            <div className="flex items-center gap-2.5 min-w-0">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    {isExpiringSoon ? (
                        <>
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
                        </>
                    ) : isPermanent || !isExpired ? (
                        <>
                            <span className="animate-pulse absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
                            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                        </>
                    ) : (
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
                    )}
                </span>

                <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 min-w-0">
                    {/* Primary Paid Through Badge */}
                    <Badge 
                        variant="outline" 
                        className={`text-xs sm:text-sm font-bold px-2.5 py-0.5 gap-1.5 shadow-xs ${
                            isExpiringSoon
                                ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/40"
                                : isExpired
                                ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40"
                                : "bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border-emerald-500/40"
                        }`}
                    >
                        {isPermanent ? (
                            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        ) : (
                            <Calendar className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                        )}
                        <span>
                            Paid Through: <strong className="text-foreground font-extrabold">{formattedDate}</strong>
                        </span>
                    </Badge>

                    {/* Cadence Pill */}
                    <Badge 
                        variant="outline" 
                        className="bg-background/60 text-muted-foreground border-border/60 text-[11px] font-semibold hidden sm:inline-flex"
                    >
                        {cadenceLabel}
                    </Badge>

                    {/* Expiration or Countdown Notice */}
                    {isExpiringSoon ? (
                        <Badge 
                            variant="outline" 
                            className="bg-amber-500/20 text-amber-800 dark:text-amber-300 border-amber-500/40 text-[11px] font-bold gap-1 animate-pulse"
                        >
                            <AlertCircle className="h-3 w-3" />
                            <span>Renews in {daysRemaining} {daysRemaining === 1 ? "day" : "days"}</span>
                        </Badge>
                    ) : isValidDate && daysRemaining > 0 ? (
                        <span className="text-[11px] text-muted-foreground hidden md:inline">
                            ({daysRemaining} days remaining)
                        </span>
                    ) : null}

                    {/* Credit or Referral Badge */}
                    {accountCredit > 0 && (
                        <Badge 
                            variant="outline" 
                            className="bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30 text-[11px] font-semibold gap-1 hidden lg:inline-flex"
                        >
                            <Gift className="h-3 w-3 text-purple-600 dark:text-purple-400" />
                            <span>${accountCredit.toFixed(2)} Balance Credit</span>
                        </Badge>
                    )}
                </div>
            </div>

            {/* Right: Quick 1-Click Link to Profile & Billing */}
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto pt-1 sm:pt-0">
                <Link 
                    href="/profile" 
                    className="group inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors"
                >
                    <CreditCard className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
                    <span>Manage / Renewal</span>
                    <ArrowRight className="h-3 w-3 group-hover:translate-x-0.5 transition-transform" />
                </Link>
            </div>
        </div>
    );
}
