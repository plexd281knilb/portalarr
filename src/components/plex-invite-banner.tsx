"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
    Gift, Copy, Check, Share2, Sparkles, Users, 
    ArrowRight, CheckCircle2, ChevronDown, ChevronUp,
    Tv, Clock, ShieldCheck, HeartHandshake
} from "lucide-react";
import Link from "next/link";

interface PlexInviteBannerProps {
    referralCode?: string;
    trialDays?: number;
    username?: string;
    totalReferrals?: number;
    activeTrials?: number;
    conversions?: number;
}

export default function PlexInviteBanner({
    referralCode,
    trialDays = 14,
    username,
    totalReferrals = 0,
    activeTrials = 0,
    conversions = 0
}: PlexInviteBannerProps) {
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState("");
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        if (typeof window !== "undefined") {
            setOrigin(window.location.origin);
            setCanShare(!!navigator.share);
            
            const savedState = localStorage.getItem("portalarr_invite_banner_collapsed");
            if (savedState === "true") {
                setIsCollapsed(true);
            }
        }
    }, []);

    const toggleCollapse = () => {
        const nextState = !isCollapsed;
        setIsCollapsed(nextState);
        if (typeof window !== "undefined") {
            localStorage.setItem("portalarr_invite_banner_collapsed", String(nextState));
        }
    };

    const effectiveCode = referralCode || username || "invite";
    const inviteUrl = origin ? `${origin}/join?ref=${encodeURIComponent(effectiveCode)}` : `/join?ref=${encodeURIComponent(effectiveCode)}`;

    const handleCopy = () => {
        if (!inviteUrl) return;
        navigator.clipboard.writeText(inviteUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    const handleShare = async () => {
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `Join my Plex Media Server (${trialDays}-Day Free Trial)`,
                    text: `Here is your personal invite for a ${trialDays}-Day Free Trial with full access to our Plex Media Server & libraries!`,
                    url: inviteUrl
                });
            } catch (err) {
                // Ignore share cancellation
            }
        } else {
            handleCopy();
        }
    };

    return (
        <Card className="w-full border-purple-500/30 bg-gradient-to-br from-purple-950/30 via-[#13121d] to-[#0f0e17] backdrop-blur-md shadow-lg relative overflow-hidden transition-all duration-300 hover:border-purple-500/50">
            {/* Ambient Background Glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -z-10 pointer-events-none" />
            
            {/* Top Accent Strip */}
            <div className="h-1 w-full bg-gradient-to-r from-purple-500 via-pink-500 to-primary" />

            <CardContent className="p-4 sm:p-6 space-y-4">
                {/* Header Row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                <Gift className="h-4 w-4" />
                            </span>
                            <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground flex items-center gap-2">
                                Invite Friends & Family to Plex
                            </h2>
                            <Badge className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white border-0 text-xs font-bold px-2.5 py-0.5 shadow-sm animate-pulse">
                                {trialDays}-Day Free Trial
                            </Badge>
                        </div>
                        <p className="text-xs sm:text-sm text-muted-foreground">
                            Share your personal invite link so your friends get an instant <strong className="text-purple-300">{trialDays}-day full access trial</strong> to movies, TV shows, and libraries.
                        </p>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                        {totalReferrals > 0 && (
                            <Badge variant="outline" className="text-xs bg-purple-500/15 text-purple-300 border-purple-500/30 gap-1.5 py-1 px-2.5">
                                <Users className="h-3.5 w-3.5" />
                                <span>{totalReferrals} Invited</span>
                            </Badge>
                        )}
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={toggleCollapse}
                            className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-lg transition-all"
                            title={isCollapsed ? "Expand invitation guide" : "Collapse invitation guide"}
                        >
                            {isCollapsed ? (
                                <span className="flex items-center gap-1">
                                    <span>Show Guide</span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </span>
                            ) : (
                                <span className="flex items-center gap-1">
                                    <span>Hide Guide</span>
                                    <ChevronUp className="h-3.5 w-3.5" />
                                </span>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Personal Invite Link Box */}
                <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                    <div className="relative w-full">
                        <Input 
                            readOnly 
                            value={inviteUrl} 
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                            className="bg-background/90 font-mono text-xs sm:text-sm pr-10 text-foreground border-purple-500/40 focus-visible:ring-purple-400/50 shadow-inner h-11"
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] uppercase font-bold text-purple-400/80 tracking-wider hidden sm:block pointer-events-none">
                            Your Link
                        </div>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                        <Button 
                            type="button" 
                            onClick={handleCopy}
                            className="flex-1 sm:flex-none font-bold bg-purple-600 hover:bg-purple-500 text-white gap-2 text-xs sm:text-sm h-11 px-4 shadow-md transition-all duration-200 hover:ring-2 hover:ring-purple-400/50 hover:shadow-purple-500/25 active:scale-95 cursor-pointer"
                        >
                            {copied ? (
                                <>
                                    <Check className="h-4 w-4 text-emerald-300 animate-bounce" />
                                    <span>Copied to Clipboard!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="h-4 w-4" />
                                    <span>Copy Invite Link</span>
                                </>
                            )}
                        </Button>

                        {canShare && (
                            <Button 
                                type="button" 
                                variant="outline"
                                onClick={handleShare}
                                className="border-purple-500/40 hover:bg-purple-500/15 text-purple-300 text-xs sm:text-sm h-11 px-3.5 transition-all active:scale-95"
                                title="Share via messaging or apps"
                            >
                                <Share2 className="h-4 w-4" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* 3-Step Guide (Expandable / Collapsible) */}
                {!isCollapsed && (
                    <div className="pt-3 border-t border-purple-500/20 space-y-3 animate-in fade-in-50 slide-in-from-top-2 duration-300">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-foreground/90 uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="h-3.5 w-3.5 text-purple-400" /> How Inviting Friends Works
                            </span>
                            <Link 
                                href="/settings/profile#referral" 
                                className="text-xs text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 hover:underline"
                            >
                                Referral Stats <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            {/* Step 1 */}
                            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/20 space-y-1.5 relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 px-2 py-0.5 rounded-md bg-purple-500/20 border border-purple-500/30">
                                        Step 1
                                    </span>
                                    <Share2 className="h-4 w-4 text-purple-400/80" />
                                </div>
                                <h3 className="text-xs font-bold text-foreground">Share Your Personal Link</h3>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Send your unique link via text, email, or social chat. No manual codes needed.
                                </p>
                            </div>

                            {/* Step 2 */}
                            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/20 space-y-1.5 relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-pink-400 px-2 py-0.5 rounded-md bg-pink-500/20 border border-pink-500/30">
                                        Step 2
                                    </span>
                                    <Clock className="h-4 w-4 text-pink-400/80" />
                                </div>
                                <h3 className="text-xs font-bold text-foreground">{trialDays}-Day Instant Free Trial</h3>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Your friend signs up in seconds without paying anything upfront or waiting for manual approval.
                                </p>
                            </div>

                            {/* Step 3 */}
                            <div className="p-3.5 rounded-xl bg-purple-950/30 border border-purple-500/20 space-y-1.5 relative overflow-hidden">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30">
                                        Step 3
                                    </span>
                                    <Tv className="h-4 w-4 text-emerald-400/80" />
                                </div>
                                <h3 className="text-xs font-bold text-foreground">Instant Plex Server Access</h3>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Their Plex account is immediately invited and given streaming access across all devices!
                                </p>
                            </div>
                        </div>

                        {/* Referral Summary Bar */}
                        {(totalReferrals > 0 || activeTrials > 0 || conversions > 0) && (
                            <div className="grid grid-cols-3 gap-2 text-center pt-1 text-xs">
                                <div className="p-2 rounded-lg bg-black/30 border border-purple-500/20">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Total Invited</span>
                                    <span className="font-extrabold text-foreground text-sm">{totalReferrals}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-black/30 border border-blue-500/20">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Active Trials</span>
                                    <span className="font-extrabold text-blue-400 text-sm">{activeTrials}</span>
                                </div>
                                <div className="p-2 rounded-lg bg-black/30 border border-emerald-500/20">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold block">Converted Members</span>
                                    <span className="font-extrabold text-emerald-400 text-sm">{conversions}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
