"use client";

import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { 
    Compass, Clock, Calendar, DollarSign, ShieldAlert, 
    KeyRound, Tv, Film, BookOpen, AlertCircle, Sparkles, CheckCircle2, ArrowRight
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
            {/* --- TRIAL STATUS & MEMBERSHIP PRICING CARD --- */}
            <Card className="border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-[#14141c] to-[#101017] backdrop-blur-md shadow-lg relative overflow-hidden">
                <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2 text-foreground">
                                    <Clock className="h-5 w-5 text-amber-400" />
                                    Trial Membership Overview
                                </CardTitle>
                                <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-xs font-semibold">
                                    {daysRemaining} {daysRemaining === 1 ? "Day" : "Days"} Remaining
                                </Badge>
                            </div>
                            <CardDescription className="text-xs">
                                {trialEndsAt ? (
                                    <>Your free trial expires on <strong className="text-foreground">{format(trialEndsAt, "MMMM d, yyyy")}</strong>. Here is your membership pricing when you're ready to activate.</>
                                ) : (
                                    <>Welcome to your trial! Review your membership options below.</>
                                )}
                            </CardDescription>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <ServerSpeedTest />
                            <PlexSetupGuides />
                        </div>
                    </div>
                </CardHeader>

                <CardContent className="space-y-4">
                    {/* PRICING BREAKDOWN PILLS */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {/* MONTHLY OPTION */}
                        <div className="p-4 rounded-xl bg-white/[0.03] border border-amber-500/20 space-y-2 flex flex-col justify-between">
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
                                    {billing?.monthlyAmountDueText || "$15.00/mo"}
                                </div>
                                <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
                                    {billing?.monthlyBreakdownSummary || "Prorated for remaining days in current month, then $15/month."}
                                </p>
                            </div>
                            <div className="pt-2">
                                <Button asChild size="sm" variant="outline" className="w-full text-xs font-semibold border-amber-500/30 hover:bg-amber-500/10 text-amber-300">
                                    <Link href="/settings/profile#payment">
                                        View Payment Instructions
                                    </Link>
                                </Button>
                            </div>
                        </div>

                        {/* REST OF THE YEAR OPTION */}
                        <div className="p-4 rounded-xl bg-white/[0.03] border border-emerald-500/20 space-y-2 flex flex-col justify-between">
                            <div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Rest of Year (Annual Prorated)
                                    </span>
                                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                        Best Value
                                    </Badge>
                                </div>
                                <div className="text-2xl font-black text-emerald-400 pt-1">
                                    {billing?.amountDueText || "$180/year"}
                                </div>
                                <p className="text-xs text-muted-foreground pt-1 leading-relaxed">
                                    {billing?.yearlyBreakdownText || "Prorated through the remainder of the calendar year."}
                                </p>
                            </div>
                            <div className="pt-2">
                                <Button asChild size="sm" className="w-full text-xs font-semibold bg-emerald-500 hover:bg-emerald-600 text-black">
                                    <Link href="/settings/profile#payment">
                                        Activate Full Year
                                    </Link>
                                </Button>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
                        <span className="flex items-center gap-1.5">
                            <KeyRound className="h-3.5 w-3.5 text-primary" />
                            Need to update your password?
                        </span>
                        <Link href="/settings/profile#password" className="text-primary hover:underline font-semibold flex items-center gap-1">
                            Account Settings <ArrowRight className="h-3 w-3" />
                        </Link>
                    </div>
                </CardContent>
            </Card>

            {/* --- MEDIA REQUESTS CARD (BUILT-IN ONLY WITH QUOTA COUNTER) --- */}
            <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-0.5">
                            <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                                <Compass className="h-5 w-5 text-primary" />
                                Built-In Media Requests
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Browse trending titles, view trailers, and submit requests to be added to Plex.
                            </CardDescription>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* QUOTA COUNTER PILLS */}
                    {(movieQuota.limit > 0 || tvQuota.limit > 0) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {movieQuota.limit > 0 && (
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                            <Film className="h-3 w-3 text-cyan-400" /> Movie Requests Left
                                        </span>
                                        <div className="text-lg font-bold text-foreground">
                                            {movieQuota.remaining ?? 0} <span className="text-xs text-muted-foreground font-normal">of {movieQuota.limit} allowed</span>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-xs font-semibold bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                                        {(movieQuota.remaining ?? 0) > 0 ? "Available" : "Limit Reached"}
                                    </Badge>
                                </div>
                            )}

                            {tvQuota.limit > 0 && (
                                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <span className="text-[10px] uppercase font-bold text-muted-foreground flex items-center gap-1">
                                            <Tv className="h-3 w-3 text-purple-400" /> TV Show Requests Left
                                        </span>
                                        <div className="text-lg font-bold text-foreground">
                                            {tvQuota.remaining ?? 0} <span className="text-xs text-muted-foreground font-normal">of {tvQuota.limit} allowed</span>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="text-xs font-semibold bg-purple-500/10 text-purple-400 border-purple-500/30">
                                        {(tvQuota.remaining ?? 0) > 0 ? "Available" : "Limit Reached"}
                                    </Badge>
                                </div>
                            )}
                        </div>
                    )}

                    <Button asChild size="lg" className="w-full h-11 text-sm font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm rounded-xl">
                        <Link href="/discover" className="flex items-center justify-center gap-2">
                            <Compass className="h-4 w-4" /> Open Media Requests
                        </Link>
                    </Button>
                </CardContent>
            </Card>

            {/* --- AI ASSISTANT --- */}
            <div className="w-full">
                <AiServerAssistant />
            </div>

            {/* --- MY PLEX HUB --- */}
            <div className="w-full">
                <MyPlexHub />
            </div>
        </div>
    );
}
