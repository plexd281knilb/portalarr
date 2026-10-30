"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Tv,
    Mail,
    Users,
    Lock,
    Bookmark,
    CheckCircle2,
    Copy,
    Sparkles,
    Shield,
    ExternalLink
} from "lucide-react";

export const PLEX_HOME_GUIDE_TEXT = `### 📺 Plex Home Member Setup & Login Guide

Welcome to Plex Home! Here is how to complete your setup, switch to your profile, and start watching Live TV:

1. ACCEPT YOUR INVITATION EMAIL
- Check your email inbox (and spam folder) for an invitation from Plex: "You've been invited to join the Plex Home of [Owner]".
- Click "Accept Invitation" and log into your existing Plex account.
- (Or visit https://app.plex.tv/desktop/#!/settings/account -> Plex Home to accept the pending banner).

2. FAST USER SWITCHING ("WHO'S WATCHING?")
- Next time you launch Plex on Apple TV, Roku, Fire TV, or Smart TV, Plex will now show the Home Profile Picker screen with user avatars.
- Always click YOUR OWN profile avatar so your continue-watching, watch history, and recommendations stay completely private.

3. LOCK YOUR PROFILE WITH A 4-DIGIT PIN (RECOMMENDED)
- To prevent other household members from accidentally switching into your profile, set a PIN:
- In Plex Web or Mobile: Settings -> Account -> Plex Home -> Click your name -> Require PIN -> Set a 4-digit PIN.

4. PIN "LIVE TV & DVR" TO YOUR SIDEBAR
- In your Plex app, scroll to the bottom of the left navigation sidebar and click "More".
- Locate our server, hover or click the three dots (...) next to "Live TV & DVR", and select "Pin to Sidebar".
- Live TV will now appear permanently right next to Movies and TV Shows.

5. BROWSE GUIDE & TUNE CHANNELS
- Click "Live TV & DVR" to open the interactive program guide (EPG). Browse by channel or genre (Sports, News, Entertainment), and start watching with zero lag!`;

interface PlexHomeGuideModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isAdminView?: boolean;
}

export function PlexHomeGuideModal({ open, onOpenChange, isAdminView }: PlexHomeGuideModalProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(PLEX_HOME_GUIDE_TEXT);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-slate-950/95 border-amber-500/30 text-foreground backdrop-blur-xl max-h-[90vh] overflow-y-auto">
                <DialogHeader className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] uppercase font-bold tracking-wider">
                            Plex Home Member Onboarding
                        </Badge>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground border-border/40">
                            Fast User Switching & Live TV
                        </Badge>
                    </div>
                    <DialogTitle className="text-xl font-black text-foreground flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                            <Tv className="h-4.5 w-4.5" />
                        </div>
                        Plex Home Setup &amp; Login Guide
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground leading-relaxed">
                        Moving to Plex Home gives you shared tuner privileges for Live TV &amp; DVR. Follow these 5 steps to accept your invitation, switch profiles on your TV, and pin live channels.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3.5 my-2">
                    {/* Step 1: Accept Email */}
                    <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                        <div className="flex items-center gap-2.5 font-bold text-sm text-amber-300">
                            <div className="h-7 w-7 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
                                <Mail className="h-4 w-4" />
                            </div>
                            <span>1. Accept Your Plex Home Invitation</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-9.5">
                            Check your email for an invitation sent directly from Plex (*&ldquo;You&apos;ve been invited to join the Plex Home of [Server Owner]&rdquo;*). Click <b className="text-foreground">Accept Invitation</b> and sign in. You can also accept immediately at{" "}
                            <a
                                href="https://app.plex.tv/desktop/#!/settings/account"
                                target="_blank"
                                rel="noreferrer"
                                className="text-amber-300 underline font-semibold inline-flex items-center gap-1 hover:text-amber-200"
                            >
                                plex.tv/desktop <ExternalLink className="h-3 w-3" />
                            </a>{" "}
                            under <b className="text-foreground">Account &gt; Plex Home</b>.
                        </p>
                    </div>

                    {/* Step 2: Fast User Switching */}
                    <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-2">
                        <div className="flex items-center gap-2.5 font-bold text-sm text-sky-300">
                            <div className="h-7 w-7 rounded-lg bg-sky-500/20 flex items-center justify-center shrink-0">
                                <Users className="h-4 w-4" />
                            </div>
                            <span>2. Fast User Switching (&ldquo;Who&apos;s Watching?&rdquo;)</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-9.5">
                            Next time you launch Plex on Apple TV, Roku, Fire TV, or Smart TV, Plex will now show the <b className="text-foreground">Home Profile Picker</b> screen with user avatars. Always click <b className="text-foreground">your own profile avatar</b> so your Continue Watching queue, watch history, and recommendations stay completely private.
                        </p>
                    </div>

                    {/* Step 3: PIN Protection */}
                    <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
                        <div className="flex items-center gap-2.5 font-bold text-sm text-emerald-300">
                            <div className="h-7 w-7 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                                <Lock className="h-4 w-4" />
                            </div>
                            <span>3. Lock Your Profile with a 4-Digit PIN (Recommended)</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-9.5">
                            Because all Plex Home members appear on shared living room TVs, set a 4-digit PIN so other household members cannot accidentally switch into your account. In Plex Web or Mobile: <b className="text-foreground">Settings &gt; Account &gt; Plex Home &gt; Click your user &gt; Require PIN</b>.
                        </p>
                    </div>

                    {/* Step 4: Pin Live TV */}
                    <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-2">
                        <div className="flex items-center gap-2.5 font-bold text-sm text-purple-300">
                            <div className="h-7 w-7 rounded-lg bg-purple-500/20 flex items-center justify-center shrink-0">
                                <Bookmark className="h-4 w-4" />
                            </div>
                            <span>4. Pin &ldquo;Live TV &amp; DVR&rdquo; to Your Sidebar</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-9.5">
                            In your Plex app, scroll to the bottom of the left navigation sidebar and click <b className="text-foreground">More</b>. Locate our server, hover or click the three dots (<b className="text-foreground">&hellip;</b>) next to <b className="text-foreground">Live TV &amp; DVR</b>, and select <b className="text-foreground">Pin to Sidebar</b>. Live TV will now appear right alongside your Movies and TV Shows.
                        </p>
                    </div>

                    {/* Step 5: Browse & DVR */}
                    <div className="p-4 rounded-xl border border-teal-500/20 bg-teal-500/5 space-y-2">
                        <div className="flex items-center gap-2.5 font-bold text-sm text-teal-300">
                            <div className="h-7 w-7 rounded-lg bg-teal-500/20 flex items-center justify-center shrink-0">
                                <Sparkles className="h-4 w-4" />
                            </div>
                            <span>5. Browse Guide &amp; Schedule Recordings</span>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed pl-9.5">
                            Click <b className="text-foreground">Live TV &amp; DVR</b> to open the full interactive electronic program guide (EPG). Browse by channel or genre (Sports, News, Entertainment), watch live with Direct Play quality, and if DVR access is enabled on your profile, schedule single airings or full season series passes!
                        </p>
                    </div>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border/40 gap-3">
                    <p className="text-[11px] text-muted-foreground">
                        {isAdminView ? "Admins can copy these instructions to send to members." : "Need help? Ask our AI Server Assistant anytime."}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={handleCopy}
                            className="h-8 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-bold gap-1.5"
                        >
                            {copied ? (
                                <>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                    <span>✓ Copied!</span>
                                </>
                            ) : (
                                <>
                                    <Copy className="h-3.5 w-3.5" />
                                    <span>Copy Instructions</span>
                                </>
                            )}
                        </Button>
                        <Button
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                        >
                            Got It
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
