"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { getPublicJoinConfig, registerTrialUserFromInvite, getPlexSetupGuides } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
    Sparkles, Gift, CheckCircle2, ChevronRight, ChevronLeft, Tv, Tv2, 
    Flame, Monitor, Smartphone, Globe, Shield, User, Mail, Lock, 
    Loader2, AlertCircle, CreditCard, DollarSign, ArrowRight, Play, ExternalLink, Check, Copy, Calendar
} from "lucide-react";

function JoinWizardContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const refParam = searchParams.get("ref") || "";

    const [step, setStep] = useState(1);
    const [loadingConfig, setLoadingConfig] = useState(true);
    const [config, setConfig] = useState<any>(null);
    const [copiedHandle, setCopiedHandle] = useState<string | null>(null);

    const handleCopy = (text: string, key: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedHandle(key);
        setTimeout(() => setCopiedHandle(null), 2000);
    };

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
        }

        getPublicJoinConfig(refParam).then((res) => {
            if (res.success && res.config) {
                setConfig(res.config);
            }
            setLoadingConfig(false);
        }).catch(() => setLoadingConfig(false));

        getPlexSetupGuides().then((g) => {
            if (Array.isArray(g)) setGuides(g);
        }).catch(() => {});
    }, [refParam]);

    const handleRegister = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        setRegisterError("");

        const res = await registerTrialUserFromInvite({
            username,
            email,
            password,
            plexEmailOrUser: plexEmail || email,
            referralCode: referralCode || undefined
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
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a0f] via-[#12121c] to-[#0a0a0f] p-4 sm:p-6">
            <div className="w-full max-w-2xl space-y-6">
                
                {/* STEP INDICATOR */}
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

                {/* ========================================================================= */}
                {/* STEP 1: WELCOME & INVITATION INTRO */}
                {/* ========================================================================= */}
                {step === 1 && (
                    <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-xl shadow-2xl relative overflow-hidden animate-in fade-in-50 duration-300">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />
                        
                        <CardHeader className="text-center space-y-4 pt-8 pb-4">
                            <div className="mx-auto bg-purple-500/15 border border-purple-500/30 p-4 rounded-3xl w-fit shadow-lg text-purple-400">
                                <Gift className="h-10 w-10" />
                            </div>

                            {config?.referrerName ? (
                                <Badge variant="outline" className="mx-auto bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs px-3 py-1 gap-1.5 font-bold">
                                    <Sparkles className="h-3.5 w-3.5" /> Invited by @{config.referrerName}
                                </Badge>
                            ) : (
                                <Badge variant="outline" className="mx-auto bg-primary/20 text-primary border-primary/40 text-xs px-3 py-1 gap-1.5 font-bold">
                                    <Sparkles className="h-3.5 w-3.5" /> VIP Media Server Invitation
                                </Badge>
                            )}

                            <CardTitle className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
                                Welcome to the Media Server
                            </CardTitle>
                            <CardDescription className="text-sm text-muted-foreground max-w-md mx-auto leading-relaxed">
                                You’ve received a free <strong>{trialDays}-Day All-Access Pass</strong> to stream thousands of movies, TV shows, audiobooks, and requested media.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                                    <div className="p-2 bg-emerald-500/15 text-emerald-400 rounded-xl shrink-0 mt-0.5">
                                        <Play className="h-4 w-4 fill-current" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="text-xs font-bold text-foreground">Original Studio Quality</h4>
                                        <p className="text-[11px] text-muted-foreground">4K HDR, Dolby Vision, and immersive Dolby Atmos audio without compression.</p>
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                                    <div className="p-2 bg-blue-500/15 text-blue-400 rounded-xl shrink-0 mt-0.5">
                                        <Tv className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="text-xs font-bold text-foreground">All Your Devices</h4>
                                        <p className="text-[11px] text-muted-foreground">Apple TV, Roku, Fire TV, Smart TVs, iPhone, Android, and Web Browser.</p>
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                                    <div className="p-2 bg-purple-500/15 text-purple-400 rounded-xl shrink-0 mt-0.5">
                                        <Sparkles className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="text-xs font-bold text-foreground">Instant Media Requests</h4>
                                        <p className="text-[11px] text-muted-foreground">Request any book, audiobook, movie, or series directly from your portal.</p>
                                    </div>
                                </div>

                                <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                                    <div className="p-2 bg-amber-500/15 text-amber-400 rounded-xl shrink-0 mt-0.5">
                                        <CheckCircle2 className="h-4 w-4" />
                                    </div>
                                    <div className="space-y-0.5">
                                        <h4 className="text-xs font-bold text-foreground">{trialDays}-Day Free Pass</h4>
                                        <p className="text-[11px] text-muted-foreground">Zero credit card required upfront. Stream completely free during your trial.</p>
                                    </div>
                                </div>
                            </div>

                            {/* TRANSPARENT PRORATED PRICING BANNER */}
                            {config?.proratedBilling && (
                                <div className="p-3.5 rounded-2xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-between gap-3 text-xs">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 bg-purple-500/20 text-purple-300 rounded-lg shrink-0">
                                            <Calendar className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <p className="font-bold text-purple-200">Prorated Annual Plan</p>
                                            <p className="text-[11px] text-muted-foreground">
                                                Only pay for remaining months ({config.proratedBilling.remainingMonthsText}): <strong className="text-foreground">{config.proratedBilling.amountDueText}</strong>
                                            </p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs shrink-0 font-bold">
                                        ${config.proratedBilling.yearlyRate}/yr (Jan 1)
                                    </Badge>
                                </div>
                            )}
                        </CardContent>

                        <CardFooter className="pt-2 pb-6 flex justify-center">
                            <Button 
                                type="button" 
                                size="lg"
                                className="w-full max-w-sm h-12 font-bold text-sm bg-primary hover:bg-primary/90 text-primary-foreground gap-2 shadow-lg shadow-primary/20 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all"
                                onClick={() => setStep(2)}
                            >
                                Claim Your Free Pass <ArrowRight className="h-4 w-4" />
                            </Button>
                        </CardFooter>
                    </Card>
                )}

                {/* ========================================================================= */}
                {/* STEP 2: ACCOUNT CREATION */}
                {/* ========================================================================= */}
                {step === 2 && (
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
                                    <CardDescription className="text-xs">Set up your credentials to manage requests and access Plex libraries.</CardDescription>
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
                                    <Label className="text-xs font-semibold">Invite / Referral Code</Label>
                                    <Input 
                                        placeholder="Optional referral code"
                                        value={referralCode}
                                        onChange={(e) => setReferralCode(e.target.value)}
                                        className="bg-background/60 font-mono text-xs"
                                        disabled={Boolean(refParam && config?.validReferral)}
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
                                            Activate {trialDays}-Day Free Pass
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
                {step === 3 && (
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
                {step === 4 && (
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
                {step === 5 && (
                    <Card className="border-border/50 bg-[#121218]/90 backdrop-blur-xl shadow-2xl animate-in fade-in-50 duration-300">
                        <CardHeader className="text-center space-y-3 pt-8 pb-4">
                            <div className="mx-auto bg-emerald-500/15 border border-emerald-500/30 p-4 rounded-3xl w-fit shadow-lg text-emerald-400">
                                <Sparkles className="h-10 w-10" />
                            </div>
                            <CardTitle className="text-2xl font-black text-foreground">
                                Enjoy Your {trialDays}-Day Free Pass!
                            </CardTitle>
                            <CardDescription className="text-xs text-muted-foreground max-w-md mx-auto">
                                You're completely ready to explore, stream, and submit media requests.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="space-y-4">
                            {/* PRORATED SUBSCRIPTION BREAKDOWN */}
                            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-3 text-xs">
                                <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
                                    <div className="flex items-center gap-2 font-bold text-foreground">
                                        <CreditCard className="h-4 w-4 text-emerald-400" />
                                        <span>Annual Subscription & Prorated Billing</span>
                                    </div>
                                    <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-bold">
                                        ${config?.yearlyPrice ?? 180} / year
                                    </Badge>
                                </div>

                                {config?.proratedBilling ? (
                                    <div className="space-y-3">
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
                                <div className="space-y-2 pt-2 border-t border-border/40">
                                    <p className="font-bold text-foreground text-xs flex items-center gap-1.5">
                                        <DollarSign className="h-3.5 w-3.5 text-primary" /> Supported Payment Methods
                                    </p>
                                    
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-mono text-xs">
                                        {config?.paymentPaypal && (
                                            <div className="p-2.5 rounded-xl bg-background/70 border border-border/40 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">PayPal</span>
                                                    <span className="font-bold text-foreground truncate block">{config.paymentPaypal}</span>
                                                </div>
                                                <Button 
                                                    type="button" 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                                                    onClick={() => handleCopy(config.paymentPaypal, "paypal")}
                                                >
                                                    {copiedHandle === "paypal" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        )}
                                        {config?.paymentVenmo && (
                                            <div className="p-2.5 rounded-xl bg-background/70 border border-border/40 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Venmo</span>
                                                    <span className="font-bold text-foreground truncate block">{config.paymentVenmo}</span>
                                                </div>
                                                <Button 
                                                    type="button" 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                                                    onClick={() => handleCopy(config.paymentVenmo, "venmo")}
                                                >
                                                    {copiedHandle === "venmo" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        )}
                                        {config?.paymentCashApp && (
                                            <div className="p-2.5 rounded-xl bg-background/70 border border-border/40 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Cash App</span>
                                                    <span className="font-bold text-foreground truncate block">{config.paymentCashApp}</span>
                                                </div>
                                                <Button 
                                                    type="button" 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                                                    onClick={() => handleCopy(config.paymentCashApp, "cashapp")}
                                                >
                                                    {copiedHandle === "cashapp" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        )}
                                        {config?.paymentZelle && (
                                            <div className="p-2.5 rounded-xl bg-background/70 border border-border/40 flex items-center justify-between gap-2">
                                                <div className="min-w-0">
                                                    <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Zelle</span>
                                                    <span className="font-bold text-foreground truncate block">{config.paymentZelle}</span>
                                                </div>
                                                <Button 
                                                    type="button" 
                                                    variant="ghost" 
                                                    size="sm" 
                                                    className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                                                    onClick={() => handleCopy(config.paymentZelle, "zelle")}
                                                >
                                                    {copiedHandle === "zelle" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {config?.paymentInstructions && (
                                    <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[11px] text-muted-foreground/90 whitespace-pre-wrap">
                                        {config.paymentInstructions}
                                    </div>
                                )}

                                <p className="text-[11px] text-muted-foreground italic pt-1">
                                    💡 When submitting payment, please include your username <strong className="text-foreground">({username || "your account name"})</strong> in the note or memo.
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
                                Launch Portalarr Dashboard
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
