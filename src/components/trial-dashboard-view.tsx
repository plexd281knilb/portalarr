"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import Link from "next/link";
import { 
    Compass, Clock, Calendar, DollarSign, 
    KeyRound, Tv, Film, Tv2, Zap, CreditCard, Sparkles, ArrowRight
} from "lucide-react";
import MyPlexHub from "@/components/my-plex-hub";
import { AiServerAssistant } from "@/components/ai-server-assistant";
import PlexSetupGuides from "@/components/plex-setup-guides";
import ServerSpeedTest from "@/components/server-speed-test";
import { format, differenceInDays } from "date-fns";

interface TrialDashboardViewProps {
    user: any;
    quota: any;
    billing: any;
}

export default function TrialDashboardView({ user, quota, billing }: TrialDashboardViewProps) {
    const trialEndsAt = user?.trialEndsAt ? new Date(user.trialEndsAt) : null;
    const now = new Date();
    const daysRemaining = trialEndsAt ? Math.max(0, differenceInDays(trialEndsAt, now)) : 14;

    const movieQuota = quota?.movies || { remaining: 3, limit: 3, used: 0 };
    const tvQuota = quota?.tv || { remaining: 3, limit: 3, used: 0 };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* --- COMPACT TRIAL STATUS & LAUNCHPAD --- */}
            <div className="space-y-3">
                {/* Status Bar Header: Glowing Countdown Pill */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 sm:px-4 sm:py-2.5 rounded-2xl bg-[#121218]/90 border border-amber-500/30 backdrop-blur-md shadow-sm">
                    <div className="flex items-center gap-2.5">
                        <span className="relative flex h-3 w-3 shrink-0">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500" />
                        </span>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/40 text-xs sm:text-sm font-bold px-2.5 py-0.5 shadow-xs">
                                ⏳ Free Trial: {daysRemaining} {daysRemaining === 1 ? "Day" : "Days"} Remaining
                            </Badge>
                            {trialEndsAt && (
                                <span className="text-xs text-muted-foreground hidden sm:inline">
                                    Expires on <strong className="text-foreground">{format(trialEndsAt, "MMMM d, yyyy")}</strong>
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Link href="/profile#password" className="hover:text-primary transition-colors flex items-center gap-1">
                            <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>Account &amp; Password</span>
                        </Link>
                    </div>
                </div>

                {/* 4-Button Launchpad (2x2 on mobile, 4 columns on desktop) */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
                    {/* 1. Request Media */}
                    <Link href="/discover" className="block group h-full">
                        <div className="h-full flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-400 hover:border-rose-500/60 hover:bg-rose-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md">
                            <div className="flex items-center justify-between gap-1.5 mb-2">
                                <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                    <Compass className="h-5 w-5 text-rose-400" />
                                </div>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-rose-500/15 text-rose-300 border-rose-500/30 line-clamp-1">
                                    {movieQuota.remaining ?? 0} Movies • {tvQuota.remaining ?? 0} TV Left
                                </span>
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-rose-300 transition-colors flex items-center justify-between">
                                    <span>Request Media</span>
                                    <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                </h3>
                                <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                    Browse trending releases &amp; trailers
                                </p>
                            </div>
                        </div>
                    </Link>

                    {/* 2. Plex Setup Guides */}
                    <div className="h-full">
                        <PlexSetupGuides 
                            trigger={
                                <button type="button" className="w-full h-full text-left flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md cursor-pointer group">
                                    <div className="flex items-center justify-between gap-1.5 mb-2 w-full">
                                        <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                            <Tv2 className="h-5 w-5 text-amber-400" />
                                        </div>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-amber-500/15 text-amber-300 border-amber-500/30">
                                            Setup
                                        </span>
                                    </div>
                                    <div className="space-y-0.5 w-full">
                                        <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-amber-300 transition-colors flex items-center justify-between">
                                            <span>Plex Setup Guides</span>
                                            <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                            100% Direct Play configuration
                                        </p>
                                    </div>
                                </button>
                            }
                        />
                    </div>

                    {/* 3. Server Speed Test */}
                    <div className="h-full">
                        <ServerSpeedTest 
                            trigger={
                                <button type="button" className="w-full h-full text-left flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-sky-500/10 border-sky-500/30 text-sky-400 hover:border-sky-500/60 hover:bg-sky-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md cursor-pointer group">
                                    <div className="flex items-center justify-between gap-1.5 mb-2 w-full">
                                        <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                            <Zap className="h-5 w-5 text-sky-400" />
                                        </div>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-sky-500/15 text-sky-300 border-sky-500/30">
                                            Bandwidth
                                        </span>
                                    </div>
                                    <div className="space-y-0.5 w-full">
                                        <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-sky-300 transition-colors flex items-center justify-between">
                                            <span>Server Speed Test</span>
                                            <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                            Verify bandwidth &amp; direct play
                                        </p>
                                    </div>
                                </button>
                            }
                        />
                    </div>

                    {/* 4. Membership Pricing (Modal) */}
                    <div className="h-full">
                        <Dialog>
                            <DialogTrigger asChild>
                                <button type="button" className="w-full h-full text-left flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md cursor-pointer group">
                                    <div className="flex items-center justify-between gap-1.5 mb-2 w-full">
                                        <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                            <CreditCard className="h-5 w-5 text-emerald-400" />
                                        </div>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                            Pricing
                                        </span>
                                    </div>
                                    <div className="space-y-0.5 w-full">
                                        <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-emerald-300 transition-colors flex items-center justify-between">
                                            <span>Membership Pricing</span>
                                            <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                            Prorated monthly &amp; annual options
                                        </p>
                                    </div>
                                </button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-lg bg-[#121218]/95 border-border/60 backdrop-blur-xl shadow-2xl p-4 sm:p-6 max-h-[85vh] overflow-y-auto">
                                <DialogHeader className="pb-3 border-b border-border/40">
                                    <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                                        <CreditCard className="h-5 w-5 text-emerald-400" />
                                        Membership Plans &amp; Activation
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-muted-foreground">
                                        Select a plan below to activate your account upon trial completion.
                                    </DialogDescription>
                                </DialogHeader>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 py-3">
                                    {/* Monthly */}
                                    <div className="p-4 rounded-xl bg-white/[0.03] border border-amber-500/25 space-y-2 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5 text-amber-400" /> Monthly Plan
                                                </span>
                                                <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30">
                                                    Flexible
                                                </Badge>
                                            </div>
                                            <div className="text-2xl font-black text-foreground pt-1">
                                                {billing?.monthlyAmountDueText || "$17.50/mo"}
                                            </div>
                                            <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
                                                {billing?.monthlyBreakdownSummary || "Prorated for remaining days in current month, then $17.50/month."}
                                            </p>
                                        </div>
                                        <div className="pt-2">
                                            <Button asChild size="sm" variant="outline" className="w-full text-xs font-semibold border-amber-500/30 hover:bg-amber-500/10 text-amber-300">
                                                <Link href="/profile">
                                                    Payment Instructions
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Annual Prorated */}
                                    <div className="p-4 rounded-xl bg-white/[0.03] border border-emerald-500/25 space-y-2 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Rest of Year
                                                </span>
                                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                                    Best Value
                                                </Badge>
                                            </div>
                                            <div className="text-2xl font-black text-emerald-400 pt-1">
                                                {billing?.amountDueText || "$180/year"}
                                            </div>
                                            <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
                                                {billing?.yearlyBreakdownText || "Prorated through remainder of the calendar year."}
                                            </p>
                                        </div>
                                        <div className="pt-2">
                                            <Button asChild size="sm" className="w-full text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-black">
                                                <Link href="/profile">
                                                    Activate Full Year
                                                </Link>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>
            </div>

            {/* --- PROMINENT 24/7 AI SERVER ASSISTANT --- */}
            <div id="ai-assistant" className="w-full scroll-mt-6">
                <AiServerAssistant />
            </div>

            {/* --- MY PLEX HUB --- */}
            <div id="my-plex-hub" className="w-full scroll-mt-6">
                <MyPlexHub />
            </div>
        </div>
    );
}
