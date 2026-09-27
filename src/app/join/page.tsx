"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { 
    getPublicJoinConfig, 
    registerTrialUserFromInvite, 
    getPlexSetupGuides,
    validateMemberReferenceAction 
} from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PaymentMethodsGrid } from "@/components/payment-methods-grid";
import { 
    Sparkles, Gift, CheckCircle2, ChevronRight, ChevronLeft, Tv, Tv2, 
    Flame, Monitor, Smartphone, Globe, Shield, ShieldCheck, User, Mail, Lock, 
    Loader2, AlertCircle, DollarSign, ArrowRight, Play, ExternalLink, Check, 
    Calendar, MessageSquare, BookOpen, Users, LockKeyhole, Crown
} from "lucide-react";

function JoinWizardContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const refParam = searchParams.get("ref") || "";

    const [step, setStep] = useState(1);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [config, setConfig] = useState<any>(null);

    // Gating / Reference verification state
    const [isInviteVerified, setIsInviteVerified] = useState(false);
    const [referenceInput, setReferenceInput] = useState(refParam);
    const [verifyingReference, setVerifyingReference] = useState(false);
    const [gateError, setGateError] = useState("");

    // Form registration state
    const [username, setUsername] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [plexEmail, setPlexEmail] = useState("");
    const [referralCode, setReferralCode] = useState(refParam);
    const [submitting, setSubmitting] = useState(false);
    const [registerError, setRegisterError] = useState("");

    // Setup Guides state
    const [guides, setGuides] = useState<any[]>([]);
    const [activeGuideTab, setActiveGuideTab] = useState("appletv");

    useEffect(() => {
        if (refParam) {
            setReferralCode(refParam);
            setReferenceInput(refParam);
        }

        getPublicJoinConfig(refParam).then((res) => {
            if (res.success && res.config) {
                setConfig(res.config);
                if (res.config.validReferral) {
                    setIsInviteVerified(true);
                    setStep(1);
                } else if (refParam) {
                    setGateError(`We couldn't find an active member matching invite "${refParam}". Please enter your referrer's name or code.`);
                }
            }
            setLoadingConfig(false);
        }).catch(() => setLoadingConfig(false));

        getPlexSetupGuides().then((g) => {
            if (Array.isArray(g)) setGuides(g);
        }).catch(() => {});
    }, [refParam]);

    const handleVerifyReference = async (e: React.FormEvent) => {
        e.preventDefault();
        const clean = referenceInput.trim();
        if (!clean) return;

        setVerifyingReference(true);
        setGateError("");

        const res = await validateMemberReferenceAction(clean);
        setVerifyingReference(false);

        if (res.success && res.valid) {
            setIsInviteVerified(true);
            setReferralCode(res.referralCode || clean);
            setConfig((prev: any) => ({
                ...(prev || {}),
                referrerName: res.referrerName,
                validReferral: true
            }));
            setStep(1);
        } else {
            setGateError(res.error || "No active member found matching that reference.");
        }
    };

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setRegisterError("");

        const res = await registerTrialUserFromInvite({
            username,
            email,
            password,
            plexEmailOrUser: plexEmail || email,
            referralCode: referralCode || referenceInput || undefined
        });

        setSubmitting(false);

        if (res.success) {
            setStep(3);
        } else {
            setRegisterError(res.error || "Failed to create account. Please check your information.");
        }
    };

    const getDeviceIcon = (id: string) => {
        switch (id) {
            case "appletv": return <Tv className="h-4 w-4 text-cyan-400" />;
            case "roku": return <Tv2 className="h-4 w-4 text-purple-400" />;
            case "firetv": return <Flame className="h-4 w-4 text-orange-400" />;
            case "smarttv": return <Monitor className="h-4 w-4 text-blue-400" />;
            case "googletv": return <Smartphone className="h-4 w-4 text-emerald-400" />;
            case "mobile": return <Smartphone className="h-4 w-4 text-pink-400" />;
            case "web": return <Globe className="h-4 w-4 text-amber-400" />;
            default: return <Tv className="h-4 w-4 text-primary" />;
        }
    };

    if (loadingConfig) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a0f] via-[#101018] to-[#0a0a0f] p-4">
                <div className="flex flex-col items-center gap-3 text-center">
                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                    <p className="text-sm font-semibold text-muted-foreground">Preparing your media server invitation...</p>
                </div>
            </div>
        );
    }

    const trialDays = config?.defaultTrialDays || 14;

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a0f] via-[#12121c] to-[#0a0a0f] p-3 sm:p-6">
            <div className="w-full max-w-2xl sm:max-w-3xl space-y-6 transition-all duration-300">
                
                {/* STEP INDICATOR - ONLY SHOWN ONCE INVITE IS VERIFIED */}
                {isInviteVerified && (
                    <div className="flex items-center justify-center gap-2 sm:gap-4 text-xs font-bold text-muted-foreground">
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                            step === 1 ? "bg-primary/20 text-primary border-primary/50 shadow-sm" : step > 1 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-muted/20 border-border/30"
                        }`}>
                            <span>1. Welcome</span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                            step === 2 ? "bg-primary/20 text-primary border-primary/50 shadow-sm" : step > 2 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-muted/20 border-border/30"
                        }`}>
                            <span>2. Account</span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                            step === 3 || step === 4 ? "bg-primary/20 text-primary border-primary/50 shadow-sm" : step > 4 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-muted/20 border-border/30"
                        }`}>
                            <span>3. Devices</span>
                        </div>
                        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50" />
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border transition-all ${
                            step === 5 ? "bg-primary/20 text-primary border-primary/50 shadow-sm" : "bg-muted/20 border-border/30"
                        }`}>
                            <span>4. Ready</span>
                        </div>
                    </div>
                )}

                {/* ========================================================================= */}
                {/* STEP 0: INVITATION / MEMBER REFERENCE GATE */}
                {/* ========================================================================= */}
                {!isInviteVerified && (
                    <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-xl shadow-2xl relative overflow-hidden animate-in fade-in-50 duration-300">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
                        
                        <CardHeader className="text-center space-y-4 pt-8 pb-4">
                            <div className="mx-auto bg-purple-500/15 border border-purple-500/30 p-4 rounded-3xl w-fit shadow-lg text-purple-400">
                                <LockKeyhole className="h-10 w-10" />
                            </div>

                            <Badge variant="outline" className="mx-auto bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs px-3 py-1 gap-1.5 font-bold">
                                <Sparkles className="h-3.5 w-3.5" /> Private Media Server
                            </Badge>

                            <CardTitle className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                                Invitation Required
                            </CardTitle>
                            <CardDescription className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                                This media server is private and invite-only. To claim a free trial pass, you must be referred by an active server member.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4 max-w-md mx-auto">
                            <form onSubmit={handleVerifyReference} className="space-y-4">
                                {gateError && (
                                    <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-xl flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>{gateError}</span>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Referral Code or Member Name / Username</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            placeholder="e.g. john_doe or referral code"
                                            value={referenceInput}
                                            onChange={(e) => setReferenceInput(e.target.value)}
                                            required
                                            className="pl-9 bg-background/60"
                                            autoFocus
                                        />
                                    </div>
                                    <p className="text-[11px] text-muted-foreground">
                                        Enter the name, username, or referral link of the friend who invited you to the server.
                                    </p>
                                </div>

                                <Button 
                                    type="submit" 
                                    disabled={verifyingReference || !referenceInput.trim()}
                                    className="w-full h-11 font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-all hover:ring-2 hover:ring-primary/40 active:scale-98"
                                >
                                    {verifyingReference ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Verifying Invitation...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            Verify Invitation & Continue
                                        </>
                                    )}
                                </Button>
                            </form>

                            <div className="pt-2 text-center">
                                <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors">
                                    Already an approved member? <strong className="text-primary">Sign In</strong>
                                </Link>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* ========================================================================= */}
                {/* STEP 1: WELCOME & PERKS COMPARISON (TRIAL VS FULL MEMBERSHIP) */}
                {/* ========================================================================= */}
                {isInviteVerified && step === 1 && (
                    <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-xl shadow-2xl relative overflow-hidden animate-in fade-in-50 duration-300">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
                        
                        <CardHeader className="text-center space-y-4 pt-8 pb-4">
                            <div className="mx-auto bg-purple-500/15 border border-purple-500/30 p-4 rounded-3xl w-fit shadow-lg text-purple-400">
                                <Gift className="h-10 w-10" />
                            </div>

                            {config?.referrerName && (
                                <Badge variant="outline" className="mx-auto bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs px-3 py-1 gap-1.5 font-bold">
                                    <Sparkles className="h-3.5 w-3.5" /> Invited by @{config.referrerName}
                                </Badge>
                            )}

                            <CardTitle className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                                Welcome to the Media Server
                            </CardTitle>
                            <CardDescription className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                                You’ve received a free <strong>{trialDays}-Day All-Access Pass</strong>. No payment up front — enjoy original studio quality streaming during your trial.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {/* TWO COLUMN COMPARISON: TRIAL VS FULL MEMBERSHIP */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                                {/* TRIAL MEMBER PERKS */}
                                <div className="p-4 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/20 space-y-3">
                                    <div className="flex items-center gap-2 border-b border-emerald-500/20 pb-2">
                                        <div className="p-1.5 bg-emerald-500/20 text-emerald-400 rounded-lg">
                                            <Play className="h-4 w-4 fill-current" />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-emerald-300 uppercase tracking-wider">Free Trial ({trialDays} Days)</h4>
                                            <p className="text-[11px] text-muted-foreground">Included with your trial pass</p>
                                        </div>
                                    </div>

                                    <ul className="space-y-2 text-xs">
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">Movies & TV Streaming:</strong> Full access to thousands of movies and TV series on Plex.</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">Original Studio Quality:</strong> 4K HDR, Dolby Vision, and immersive Dolby Atmos with 100% Direct Play.</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">All Your Devices:</strong> Apple TV, Roku, Fire TV, Smart TVs, iPhone, Android, and Web Browser.</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">Movie & TV Requests:</strong> Request any movie or series with instant auto-approval.</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">No Payment Up Front:</strong> Stream completely free during your trial without any commitment.</span>
                                        </li>
                                    </ul>
                                </div>

                                {/* FULL MEMBERSHIP UPGRADE PERKS */}
                                <div className="p-4 rounded-2xl bg-purple-500/[0.04] border border-purple-500/20 space-y-3">
                                    <div className="flex items-center gap-2 border-b border-purple-500/20 pb-2">
                                        <div className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg">
                                            <Crown className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-purple-300 uppercase tracking-wider">Upgrade to Full Membership</h4>
                                            <p className="text-[11px] text-muted-foreground">Unlock all extra server perks & features</p>
                                        </div>
                                    </div>

                                    <ul className="space-y-2 text-xs">
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <Sparkles className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">Priority Streaming:</strong> Highest server bandwidth priority & uninterrupted playback.</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <BookOpen className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">Digital Ebook & Audiobook Library:</strong> Read in-browser with Kindle Paperwhite mode, listen in audio player, or Send-to-Kindle.</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <Users className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">Dedicated Kids & Living Room Profiles:</strong> Managed sub-accounts with custom age ratings, PIN safety, and kid-safe library curation.</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <Sparkles className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">Book & Audiobook Requests:</strong> 1-click requests for bestsellers, new books, and audiobooks.</span>
                                        </li>
                                        <li className="flex items-start gap-2 text-muted-foreground">
                                            <Gift className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                                            <span><strong className="text-foreground">Discord VIP & Referral Rewards:</strong> Real-time server status alerts, direct support, and earn +1 free month per friend referred.</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>

                            {/* UPGRADE PERKS CALLOUT */}
                            <div className="p-3.5 rounded-2xl bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-purple-500/10 border border-purple-500/25 flex items-start sm:items-center gap-3 text-xs">
                                <div className="p-2 bg-purple-500/20 text-purple-300 rounded-xl shrink-0">
                                    <Crown className="h-4 w-4" />
                                </div>
                                <div className="space-y-0.5">
                                    <h4 className="font-bold text-purple-200">The Trial is Just the Preview</h4>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Your free trial gives you full access to test out our movies and TV shows streaming. When you upgrade to full membership, you unlock all the premium perks — including dedicated Kids profiles, our complete digital Ebook & Audiobook collection, and community rewards!
                                    </p>
                                </div>
                            </div>

                            {/* TRANSPARENT PRICING OPTIONS (MONTHLY & ANNUAL PRORATED) */}
                            <div className="space-y-2.5">
                                <div className="flex items-center justify-between px-1">
                                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <DollarSign className="h-3.5 w-3.5 text-primary" /> Transparent Membership Pricing (Post-Trial)
                                    </span>
                                    <Badge variant="outline" className="text-[10px] text-emerald-400 border-emerald-500/30 bg-emerald-500/10 font-bold">
                                        Zero Upfront Cost
                                    </Badge>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* MONTHLY OPTION */}
                                    <div className="p-3.5 rounded-2xl bg-amber-500/[0.04] border border-amber-500/25 flex flex-col justify-between space-y-2">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5 text-amber-400" /> Monthly Plan
                                                </span>
                                                <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30 font-semibold">
                                                    Flexible
                                                </Badge>
                                            </div>
                                            <div className="text-lg font-black text-foreground pt-1">
                                                ${config?.monthlyPrice ?? 15} <span className="text-xs font-normal text-muted-foreground">/ month</span>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground pt-0.5 leading-relaxed">
                                                Pay-as-you-go month-to-month pass. Flexible and cancelable at any time.
                                            </p>
                                        </div>
                                    </div>

                                    {/* PRORATED ANNUAL OPTION */}
                                    <div className="p-3.5 rounded-2xl bg-emerald-500/[0.04] border border-emerald-500/25 flex flex-col justify-between space-y-2">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                                                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Rest of Year (Annual Pass)
                                                </span>
                                                <Badge variant="outline" className="text-[10px] bg-emerald-500/20 text-emerald-300 border-emerald-500/40 font-semibold">
                                                    Best Value
                                                </Badge>
                                            </div>
                                            <div className="text-lg font-black text-emerald-400 pt-1">
                                                {config?.proratedBilling?.amountDueText || `$${config?.yearlyPrice ?? 180}/yr`}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground pt-0.5 leading-relaxed">
                                                Only pay for remaining months {config?.proratedBilling?.remainingMonthsText ? `(${config.proratedBilling.remainingMonthsText})` : "in the year"}. Renews Jan 1 at ${config?.yearlyPrice ?? 180}/yr.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>

                        <CardFooter className="pt-2 pb-6 flex flex-col items-center gap-3">
                            <Button 
                                type="button" 
                                size="lg"
                                className="w-full max-w-sm h-12 font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all"
                                onClick={() => setStep(2)}
                            >
                                Claim Your Free Pass <ArrowRight className="h-4 w-4" />
                            </Button>
                            <Link href="/login" className="text-xs text-muted-foreground hover:text-foreground hover:underline transition-colors">
                                Already an approved member? <strong className="text-primary">Sign In</strong>
                            </Link>
                        </CardFooter>
                    </Card>
                )}

                {/* ========================================================================= */}
                {/* STEP 2: ACCOUNT CREATION */}
                {/* ========================================================================= */}
                {isInviteVerified && step === 2 && (
                    <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-xl shadow-2xl animate-in fade-in-50 duration-300">
                        <CardHeader className="space-y-1 pb-4">
                            <div className="flex items-center gap-2">
                                <Button 
                                    type="button" 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    onClick={() => setStep(1)}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                <div>
                                    <CardTitle className="text-xl font-bold text-foreground">Create Your Account</CardTitle>
                                    <CardDescription className="text-xs">Set up your credentials to manage requests and access Plex libraries (No payment up front).</CardDescription>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent>
                            <form onSubmit={handleRegister} className="space-y-4">
                                {registerError && (
                                    <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-xl flex items-center gap-2">
                                        <AlertCircle className="h-4 w-4 shrink-0" />
                                        <span>{registerError}</span>
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Choose Username</Label>
                                    <div className="relative">
                                        <User className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            placeholder="e.g. john_doe"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                            className="pl-9 bg-background/60"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Email Address</Label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            type="email"
                                            placeholder="user@example.com"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                            className="pl-9 bg-background/60"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">Create Password</Label>
                                    <div className="relative">
                                        <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            type="password"
                                            placeholder="Minimum 6 characters"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            className="pl-9 bg-background/60"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5 pt-2 border-t border-border/40">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold">Plex Account Email or Username</Label>
                                        <a 
                                            href="https://www.plex.tv/sign-up/" 
                                            target="_blank" 
                                            rel="noopener noreferrer" 
                                            className="text-[11px] text-primary hover:underline flex items-center gap-1 font-medium"
                                        >
                                            Need a free Plex account? <ExternalLink className="h-3 w-3" />
                                        </a>
                                    </div>
                                    <Input 
                                        placeholder="Same as above or your Plex email"
                                        value={plexEmail}
                                        onChange={(e) => setPlexEmail(e.target.value)}
                                        className="bg-background/60"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        The server will automatically send a server friend invitation to this Plex account.
                                    </p>
                                </div>

                                <div className="space-y-1.5 pt-2 border-t border-border/40">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs font-semibold">Verified Referrer</Label>
                                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] gap-1 font-semibold">
                                            <CheckCircle2 className="h-3 w-3" /> Invitation Verified
                                        </Badge>
                                    </div>
                                    <Input 
                                        value={config?.referrerName ? `@${config.referrerName}` : referralCode}
                                        readOnly
                                        disabled
                                        className="bg-muted/40 font-mono text-xs text-muted-foreground cursor-not-allowed"
                                    />
                                </div>

                                <Button 
                                    type="submit" 
                                    disabled={submitting}
                                    className="w-full h-11 font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-all hover:ring-2 hover:ring-primary/40 active:scale-98"
                                >
                                    {submitting ? (
                                        <>
                                            <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                            Provisioning Account & Plex Access...
                                        </>
                                    ) : (
                                        <>
                                            <CheckCircle2 className="h-4 w-4 mr-2" />
                                            Activate {trialDays}-Day Free Pass (No Payment Up Front)
                                        </>
                                    )}
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                )}

                {/* ========================================================================= */}
                {/* STEP 3: PROVISION SUCCESS & ACCEPT PLEX INVITE */}
                {/* ========================================================================= */}
                {isInviteVerified && step === 3 && (
                    <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-xl shadow-2xl animate-in fade-in-50 duration-300">
                        <CardHeader className="text-center space-y-3 pt-8 pb-4">
                            <div className="mx-auto bg-emerald-500/15 border border-emerald-500/30 p-4 rounded-3xl w-fit shadow-lg text-emerald-400">
                                <CheckCircle2 className="h-10 w-10" />
                            </div>
                            <CardTitle className="text-2xl font-black text-foreground">
                                You're All Set!
                            </CardTitle>
                            <CardDescription className="text-xs text-muted-foreground max-w-sm mx-auto">
                                Your account is active with a <strong>{trialDays}-Day Free Pass</strong>. We’ve sent your server invitation.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3 text-xs">
                                <div className="flex items-center gap-2 font-bold text-foreground uppercase tracking-wider">
                                    <Sparkles className="h-4 w-4 text-amber-400" />
                                    <span>Accept Your Server Invitation</span>
                                </div>
                                <p className="text-muted-foreground leading-relaxed">
                                    Check your email or log into <a href="https://app.plex.tv" target="_blank" rel="noopener noreferrer" className="text-primary font-semibold underline">app.plex.tv</a> to accept the friend request / shared library invite.
                                </p>
                            </div>

                            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5 text-xs text-amber-300">
                                <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider">
                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                    <span>Crucial Step: Device Configuration</span>
                                </div>
                                <p className="text-muted-foreground leading-relaxed text-[11px]">
                                    To ensure smooth streaming with zero lag or buffering, your device needs one quick setting changed.
                                </p>
                            </div>

                            {config?.discordInviteUrl && (
                                <div className="p-4 rounded-2xl bg-indigo-500/10 border border-indigo-500/30 space-y-2.5 text-xs">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2 font-bold text-foreground">
                                            <MessageSquare className="h-4 w-4 text-indigo-400" />
                                            <span>Join Our Community Discord</span>
                                        </div>
                                        <Badge variant="outline" className="bg-indigo-500/20 text-indigo-300 border-indigo-500/40 text-[10px]">
                                            Community
                                        </Badge>
                                    </div>
                                    <p className="text-muted-foreground leading-relaxed text-[11px]">
                                        Get instant support, request new titles, receive server downtime alerts, and chat with fellow members.
                                    </p>
                                    <a 
                                        href={config.discordInviteUrl} 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center justify-center gap-1.5 w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs transition-all hover:ring-2 hover:ring-indigo-400/40 active:scale-95"
                                    >
                                        <MessageSquare className="h-3.5 w-3.5" /> Join Discord Server <ExternalLink className="h-3 w-3 ml-0.5" />
                                    </a>
                                </div>
                            )}
                        </CardContent>

                        <CardFooter className="flex gap-3 justify-between pt-2 pb-6">
                            <Button 
                                type="button" 
                                variant="outline" 
                                onClick={() => router.push("/")}
                                className="font-semibold text-xs"
                            >
                                Skip to Dashboard
                            </Button>
                            <Button 
                                type="button" 
                                className="font-bold text-xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                                onClick={() => setStep(4)}
                            >
                                View Device Setup Guides <ChevronRight className="h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {/* ========================================================================= */}
                {/* STEP 4: DEVICE SETUP GUIDES */}
                {/* ========================================================================= */}
                {isInviteVerified && step === 4 && (
                    <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-xl shadow-2xl animate-in fade-in-50 duration-300">
                        <CardHeader className="space-y-1 pb-4">
                            <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                                <Tv className="h-5 w-5 text-primary" /> Setup Your Streaming Device
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Optimize your TV, streaming stick, or phone for 100% Direct Play cinema quality.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {/* The #1 Rule */}
                            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                                <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-0.5">
                                    <h4 className="text-xs font-bold text-amber-300">The #1 Rule for Zero Buffering:</h4>
                                    <p className="text-[11px] text-muted-foreground leading-relaxed">
                                        Always change <strong className="text-foreground">Remote Video Quality</strong> in Plex Settings to <strong className="text-foreground">"Maximum / Original"</strong>. This stops the server from transcoding and delivers full studio 4K/1080p.
                                    </p>
                                </div>
                            </div>

                            {/* DEVICE TABS */}
                            {guides.length > 0 && (
                                <Tabs defaultValue={activeGuideTab} value={activeGuideTab} onValueChange={setActiveGuideTab} className="w-full space-y-4">
                                    <TabsList className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/20 border border-border/40 rounded-xl w-full h-auto">
                                        {guides.map((guide) => (
                                            <TabsTrigger 
                                                key={guide.id} 
                                                value={guide.id} 
                                                className="flex items-center gap-1.5 py-1.5 px-2.5 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all rounded-lg shrink-0"
                                            >
                                                {getDeviceIcon(guide.id)}
                                                <span>{guide.name}</span>
                                            </TabsTrigger>
                                        ))}
                                    </TabsList>

                                    {guides.map((guide) => (
                                        <TabsContent key={guide.id} value={guide.id} className="space-y-3 animate-in fade-in-50 duration-200">
                                            <div className="space-y-2">
                                                {guide.steps.map((s: any, idx: number) => (
                                                    <div key={idx} className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5 text-xs">
                                                        <div className="font-bold text-foreground flex items-center gap-2">
                                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                                            {s.title}
                                                        </div>
                                                        <p className="text-muted-foreground pl-5.5 text-[11px] leading-relaxed">
                                                            {s.desc}
                                                        </p>
                                                    </div>
                                                ))}
                                            </div>
                                        </TabsContent>
                                    ))}
                                </Tabs>
                            )}
                        </CardContent>

                        <CardFooter className="flex justify-between pt-2 pb-6 border-t border-border/40">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                onClick={() => setStep(3)}
                                className="text-xs"
                            >
                                <ChevronLeft className="h-4 w-4 mr-1" /> Back
                            </Button>
                            <Button 
                                type="button" 
                                className="font-bold text-xs bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                                onClick={() => setStep(5)}
                            >
                                Next: Subscription & Start Streaming <ChevronRight className="h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {/* ========================================================================= */}
                {/* STEP 5: SUBSCRIPTION INFO & READY TO STREAM */}
                {/* ========================================================================= */}
                {isInviteVerified && step === 5 && (
                    <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-xl shadow-2xl animate-in fade-in-50 duration-300">
                        <CardHeader className="text-center space-y-3 pt-8 pb-4">
                            <div className="mx-auto bg-emerald-500/15 border border-emerald-500/30 p-4 rounded-3xl w-fit shadow-lg text-emerald-400">
                                <Sparkles className="h-10 w-10" />
                            </div>
                            <CardTitle className="text-2xl font-black text-foreground">
                                Enjoy Your {trialDays}-Day Free Pass!
                            </CardTitle>
                            <CardDescription className="text-xs text-muted-foreground max-w-md mx-auto">
                                You're completely ready to explore, stream, and submit media requests. No payment is required up front.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {/* MEMBERSHIP PLANS & RENEWAL BREAKDOWN */}
                            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4 text-xs">
                                <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                                    <div className="flex items-center gap-2 font-bold text-foreground">
                                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                        <span>Membership Plans & Renewal Options</span>
                                    </div>
                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-300 border-emerald-500/30 text-xs font-bold">
                                        Zero Upfront Payment
                                    </Badge>
                                </div>

                                {/* TWO PLAN CARDS: MONTHLY VS ANNUAL */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {/* MONTHLY PLAN CARD */}
                                    <div className="p-3.5 rounded-xl bg-amber-500/[0.04] border border-amber-500/25 space-y-1.5 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                    <Calendar className="h-3.5 w-3.5 text-amber-400" /> Monthly Plan
                                                </span>
                                                <Badge variant="outline" className="text-[10px] text-amber-300 border-amber-500/30">
                                                    Flexible
                                                </Badge>
                                            </div>
                                            <div className="text-xl font-black text-foreground pt-1">
                                                {config?.proratedBilling?.monthlyAmountDueText || `$${config?.monthlyPrice || 15}/mo`}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground pt-0.5 leading-relaxed">
                                                {config?.proratedBilling?.monthlyBreakdownSummary || "Prorated for remaining days in current month, then $15/month."}
                                            </p>
                                        </div>
                                    </div>

                                    {/* ANNUAL REST-OF-YEAR PLAN CARD */}
                                    <div className="p-3.5 rounded-xl bg-emerald-500/[0.04] border border-emerald-500/25 space-y-1.5 flex flex-col justify-between">
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                                    <DollarSign className="h-3.5 w-3.5 text-emerald-400" /> Rest of Year (Annual Pass)
                                                </span>
                                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                                    Best Value
                                                </Badge>
                                            </div>
                                            <div className="text-xl font-black text-emerald-400 pt-1">
                                                {config?.proratedBilling?.amountDueText || `$${config?.yearlyPrice ?? 180}/yr`}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground pt-0.5 leading-relaxed">
                                                {config?.proratedBilling?.yearlyBreakdownText || "Prorated through the remainder of the calendar year."}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {config?.proratedBilling ? (
                                    <div className="space-y-3 pt-1 border-t border-border/30">
                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                            <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-1">
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Free Trial</span>
                                                <p className="font-bold text-purple-300 text-sm">{config.proratedBilling.trialDays} Days</p>
                                                <p className="text-[10px] text-muted-foreground">Ends in {config.proratedBilling.trialEndMonthName}</p>
                                            </div>
                                            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">1st Year Prorated</span>
                                                <p className="font-bold text-emerald-400 text-sm">{config.proratedBilling.amountDueText}</p>
                                                <p className="text-[10px] text-muted-foreground">{config.proratedBilling.remainingMonthsText}</p>
                                            </div>
                                            <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1">
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Annual Renewal</span>
                                                <p className="font-bold text-blue-300 text-sm">${config.proratedBilling.yearlyRate} / yr</p>
                                                <p className="text-[10px] text-muted-foreground">Renews {config.proratedBilling.nextRenewalDate}</p>
                                            </div>
                                        </div>

                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            {config.proratedBilling.breakdownSummary}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-muted-foreground leading-relaxed">
                                        When your trial completes, you can renew your full subscription to keep uninterrupted access.
                                    </p>
                                )}

                                {/* PAYMENT METHODS GRID */}
                                <div className="pt-2 border-t border-border/40">
                                    <PaymentMethodsGrid config={config} username={username} />
                                </div>

                                {config?.paymentInstructions && (
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[11px] text-muted-foreground/90 whitespace-pre-wrap">
                                        {config.paymentInstructions}
                                    </div>
                                )}

                                <p className="text-[11px] text-muted-foreground italic pt-1">
                                    💡 No payment up front for your trial. When submitting future renewal payments, please include your username <strong className="text-foreground">({username || "your account name"})</strong> in the note or memo.
                                </p>
                            </div>
                        </CardContent>

                        <CardFooter className="pt-2 pb-6 flex justify-center">
                            <Button 
                                type="button" 
                                size="lg"
                                className="w-full max-w-sm h-12 font-bold text-sm bg-emerald-600 hover:bg-emerald-500 text-white gap-2 shadow-lg shadow-emerald-600/20 hover:ring-2 hover:ring-emerald-400/40 active:scale-95 transition-all"
                                onClick={() => router.push("/")}
                            >
                                <Play className="h-4 w-4 fill-current" />
                                Launch Dashboard
                            </Button>
                        </CardFooter>
                    </Card>
                )}
            </div>
        </div>
    );
}

export default function JoinPage() {
    return (
        <Suspense fallback={
            <div className="flex min-h-screen items-center justify-center bg-[#0a0a0f] p-4">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <JoinWizardContent />
        </Suspense>
    );
}
