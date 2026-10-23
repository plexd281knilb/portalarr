"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
    Gift, Copy, Check, Share2, Sparkles, Users, 
    ArrowRight, ChevronDown, ChevronUp,
    Tv, Clock
} from "lucide-react";
import Link from "next/link";

interface PlexInviteBannerProps {
    referralCode?: string;
    trialDays?: number;
    username?: string;
    totalReferrals?: number;
    activeTrials?: number;
    conversions?: number;
    appUrl?: string;
}

export default function PlexInviteBanner({
    referralCode,
    trialDays = 14,
    username,
    totalReferrals = 0,
    activeTrials = 0,
    conversions = 0,
    appUrl
}: PlexInviteBannerProps) {
    const [copied, setCopied] = useState(false);
    const [origin, setOrigin] = useState(appUrl || "");
    const [isCollapsed, setIsCollapsed] = useState(true);
    const [canShare, setCanShare] = useState(false);

    useEffect(() => {
        if (appUrl) {
            setOrigin(appUrl);
        } else if (typeof window !== "undefined") {
            setOrigin(window.location.origin);
        }
        if (typeof window !== "undefined") {
            setCanShare(!!navigator.share);
            
            const savedState = localStorage.getItem("portalarr_invite_banner_collapsed");
            if (savedState === "false") {
                setIsCollapsed(false);
            }
        }
    }, [appUrl]);

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
                    title: `Join our Media Server (${trialDays}-Day Free Trial)`,
                    text: `Here is your invite for a ${trialDays}-Day Free Trial with full access to our media library!`,
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
        <Card className="w-full border-border/40 bg-[#121218]/60 backdrop-blur-xs shadow-xs relative overflow-hidden transition-all duration-200 hover:border-purple-500/30 rounded-xl">
            <CardContent className="p-3 sm:p-4 space-y-2.5">
                {/* Header Row */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                        <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400 shrink-0">
                            <Gift className="h-4 w-4" />
                        </div>
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <h2 className="text-xs sm:text-sm font-bold text-foreground truncate">
                                Invite Friends &amp; Family
                            </h2>
                            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/20 px-1.5 py-0 font-medium">
                                {trialDays}-Day Free Trial
                            </Badge>
                            {totalReferrals > 0 && (
                                <span className="text-[10px] text-muted-foreground hidden sm:inline-flex items-center gap-1">
                                    <Users className="h-3 w-3 text-purple-400" />
                                    {totalReferrals} invited
                                </span>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={toggleCollapse}
                            className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground rounded-lg transition-all"
                            title={isCollapsed ? "Expand invitation guide" : "Collapse invitation guide"}
                        >
                            {isCollapsed ? (
                                <span className="flex items-center gap-1">
                                    <span>Guide</span>
                                    <ChevronDown className="h-3 w-3" />
                                </span>
                            ) : (
                                <span className="flex items-center gap-1">
                                    <span>Hide</span>
                                    <ChevronUp className="h-3 w-3" />
                                </span>
                            )}
                        </Button>
                    </div>
                </div>

                {/* Personal Invite Link Box */}
                <div className="flex flex-col sm:flex-row items-center gap-2">
                    <div className="relative w-full">
                        <Input 
                            readOnly 
                            value={inviteUrl} 
                            onClick={(e) => (e.target as HTMLInputElement).select()}
                            className="bg-background/60 font-mono text-xs pr-16 text-foreground border-border/50 focus-visible:ring-purple-400/40 shadow-inner h-9 rounded-lg"
                        />
                        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] uppercase font-bold text-muted-foreground tracking-wider pointer-events-none">
                            Link
                        </div>
                    </div>

                    <div className="flex items-center gap-1.5 w-full sm:w-auto shrink-0">
                        <Button 
                            type="button" 
                            size="sm"
                            onClick={handleCopy}
                            className="flex-1 sm:flex-none font-semibold bg-purple-600/90 hover:bg-purple-600 text-white gap-1.5 text-xs h-9 px-3.5 rounded-lg shadow-xs transition-all active:scale-95 cursor-pointer"
                        >
                            {copied ? (
                                <>
                                    <Check className="h-3.5 w-3.5 text-emerald-300" />
                                    <span>Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="h-3.5 w-3.5" />
                                    <span>Copy Link</span>
                                </>
                            )}
                        </Button>

                        {canShare && (
                            <Button 
                                type="button" 
                                size="sm"
                                variant="outline"
                                onClick={handleShare}
                                className="border-border/50 hover:bg-purple-500/10 text-purple-300 text-xs h-9 px-2.5 rounded-lg transition-all active:scale-95"
                                title="Share link"
                            >
                                <Share2 className="h-3.5 w-3.5" />
                            </Button>
                        )}
                    </div>
                </div>

                {/* 3-Step Guide (Expandable / Collapsible) */}
                {!isCollapsed && (
                    <div className="pt-2.5 border-t border-border/30 space-y-2.5 animate-in fade-in-50 slide-in-from-top-1 duration-200">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <Sparkles className="h-3 w-3 text-purple-400" /> How It Works
                            </span>
                            <Link 
                                href="/profile#referral" 
                                className="text-[11px] text-purple-400 hover:text-purple-300 font-semibold flex items-center gap-1 hover:underline"
                            >
                                Referral Stats <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {/* Step 1 */}
                            <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-purple-400 px-1.5 py-0.5 rounded bg-purple-500/10 border border-purple-500/20">
                                        Step 1
                                    </span>
                                    <Share2 className="h-3.5 w-3.5 text-purple-400/70" />
                                </div>
                                <h3 className="text-xs font-semibold text-foreground">Share Your Link</h3>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                    Send your link via text or chat. No codes needed.
                                </p>
                            </div>

                            {/* Step 2 */}
                            <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-pink-400 px-1.5 py-0.5 rounded bg-pink-500/10 border border-pink-500/20">
                                        Step 2
                                    </span>
                                    <Clock className="h-3.5 w-3.5 text-pink-400/70" />
                                </div>
                                <h3 className="text-xs font-semibold text-foreground">{trialDays}-Day Free Trial</h3>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                    Instant sign-up without paying anything upfront.
                                </p>
                            </div>

                            {/* Step 3 */}
                            <div className="p-2.5 rounded-lg bg-background/40 border border-border/40 space-y-1">
                                <div className="flex items-center justify-between">
                                    <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                                        Step 3
                                    </span>
                                    <Tv className="h-3.5 w-3.5 text-emerald-400/70" />
                                </div>
                                <h3 className="text-xs font-semibold text-foreground">Instant Server Access</h3>
                                <p className="text-[10px] text-muted-foreground leading-normal">
                                    Account is auto-invited with access across all devices.
                                </p>
                            </div>
                        </div>

                        {/* Referral Summary Bar */}
                        {(totalReferrals > 0 || activeTrials > 0 || conversions > 0) && (
                            <div className="grid grid-cols-3 gap-2 text-center pt-1 text-[11px]">
                                <div className="p-1.5 rounded-md bg-background/40 border border-border/30">
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold block">Total Invited</span>
                                    <span className="font-bold text-foreground text-xs">{totalReferrals}</span>
                                </div>
                                <div className="p-1.5 rounded-md bg-background/40 border border-border/30">
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold block">Active Trials</span>
                                    <span className="font-bold text-blue-400 text-xs">{activeTrials}</span>
                                </div>
                                <div className="p-1.5 rounded-md bg-background/40 border border-border/30">
                                    <span className="text-[9px] text-muted-foreground uppercase font-bold block">Conversions</span>
                                    <span className="font-bold text-emerald-400 text-xs">{conversions}</span>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
