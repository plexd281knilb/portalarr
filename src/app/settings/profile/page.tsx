"use client";

import { useState, useEffect } from "react";
import { getCurrentUser, changeUserPassword } from "@/app/auth-actions";
import { getUserReferralInfo, getPublicJoinConfig, updateCurrentUserKindleEmail } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
    User, Mail, KeyRound, CheckCircle2, XCircle, Loader2, ShieldCheck, 
    MailCheck, Zap, BookOpen, Gift, Copy, Check, Timer, DollarSign, Users, Sparkles, ExternalLink,
    CreditCard, Calendar, AlertCircle, Trash2
} from "lucide-react";
import ServerSpeedTest from "@/components/server-speed-test";
import PlexSetupGuides from "@/components/plex-setup-guides";
import { format, differenceInDays } from "date-fns";

export default function UserProfilePage() {
    const [user, setUser] = useState<any>(null);
    const [referralInfo, setReferralInfo] = useState<any>(null);
    const [paymentConfig, setPaymentConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [copiedHandle, setCopiedHandle] = useState<string | null>(null);

    const handleCopy = (text: string, key: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedHandle(key);
        setTimeout(() => setCopiedHandle(null), 2000);
    };

    // Change Password State
    const [passCurrent, setPassCurrent] = useState("");
    const [passNew, setPassNew] = useState("");
    const [passMsg, setPassMsg] = useState("");
    const [passErr, setPassErr] = useState("");
    const [passLoading, setPassLoading] = useState(false);

    // Send-to-Kindle State
    const [kindleEmail, setKindleEmail] = useState("");
    const [kindleSaving, setKindleSaving] = useState(false);
    const [kindleMsg, setKindleMsg] = useState("");
    const [kindleErr, setKindleErr] = useState("");

    useEffect(() => {
        async function fetchProfile() {
            setLoading(true);
            try {
                const u = await getCurrentUser();
                setUser(u);
                if (u?.kindleEmail) {
                    setKindleEmail(u.kindleEmail);
                }
                const ref = await getUserReferralInfo();
                if (ref?.success) {
                    setReferralInfo(ref);
                }
                const pConfig = await getPublicJoinConfig();
                if (pConfig?.success && pConfig.config) {
                    setPaymentConfig(pConfig.config);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        fetchProfile();
    }, []);

    const handleUpdateKindleEmail = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setKindleSaving(true);
        setKindleMsg("");
        setKindleErr("");

        const res = await updateCurrentUserKindleEmail(kindleEmail);
        setKindleSaving(false);

        if (res?.error) {
            setKindleErr(res.error);
        } else if (res?.success) {
            setKindleMsg(res.message || "Your Send-to-Kindle email address has been updated successfully!");
            setUser((prev: any) => ({ ...prev, kindleEmail: res.kindleEmail }));
            setKindleEmail(res.kindleEmail || "");
        }
    };

    const handleClearKindleEmail = async () => {
        setKindleSaving(true);
        setKindleMsg("");
        setKindleErr("");

        const res = await updateCurrentUserKindleEmail("");
        setKindleSaving(false);

        if (res?.error) {
            setKindleErr(res.error);
        } else if (res?.success) {
            setKindleMsg(res.message || "Your Send-to-Kindle email address has been cleared.");
            setUser((prev: any) => ({ ...prev, kindleEmail: "" }));
            setKindleEmail("");
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setPassLoading(true);
        setPassMsg("");
        setPassErr("");

        const formData = new FormData();
        formData.append("currentPassword", passCurrent);
        formData.append("newPassword", passNew);

        const res = await changeUserPassword(formData);
        setPassLoading(false);

        if (res?.error) {
            setPassErr(res.error);
        } else if (res?.success) {
            setPassMsg(res.message || "Your password has been updated successfully!");
            setPassCurrent("");
            setPassNew("");
        }
    };

    const handleCopyInviteLink = () => {
        if (!referralInfo?.referralCode) return;
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const url = `${origin}/join?ref=${referralInfo.referralCode}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="p-6 flex items-center justify-center min-h-[400px]">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const isTrial = user?.status === "TRIAL";
    const daysLeft = isTrial && user?.trialEndsAt ? Math.max(0, differenceInDays(new Date(user.trialEndsAt), new Date())) : null;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const inviteUrl = referralInfo?.referralCode ? `${origin}/join?ref=${referralInfo.referralCode}` : "";

    const cleanKindleInput = kindleEmail.trim().toLowerCase();
    const isKindleDomain = cleanKindleInput.endsWith("@kindle.com") || cleanKindleInput.endsWith("@free.kindle.com");
    const hasAtSymbol = cleanKindleInput.includes("@");
    const hasChangedKindle = (user?.kindleEmail || "").trim().toLowerCase() !== cleanKindleInput;

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                        <User className="h-6 w-6 text-primary" /> Account Profile & Settings
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Manage your account credentials, Send-to-Kindle delivery address, and invite friends with your personal link.
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    <ServerSpeedTest />
                    <PlexSetupGuides />
                </div>
            </div>

            {/* REFERRAL & INVITE LINK CARD */}
            <Card className="border-purple-500/30 bg-purple-950/10 backdrop-blur-md shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Gift className="h-5 w-5 text-purple-400" /> Invite Friends & Share Media
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Give your friends a free {paymentConfig?.defaultTrialDays || 14}-day pass to try out the media server. Track their trial progress and subscription rewards below.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs w-fit">
                            Code: {referralInfo?.referralCode || user?.username}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {/* INVITE URL COPY BOX */}
                    <div className="flex flex-col sm:flex-row items-center gap-2">
                        <div className="relative w-full">
                            <Input 
                                readOnly 
                                value={inviteUrl} 
                                className="bg-background/80 font-mono text-xs pr-10 text-foreground border-purple-500/30"
                            />
                        </div>
                        <Button 
                            type="button" 
                            onClick={handleCopyInviteLink}
                            className="w-full sm:w-auto font-bold shrink-0 bg-purple-600 hover:bg-purple-500 text-white gap-2 text-xs h-10 transition-all hover:ring-2 hover:ring-purple-400/40 active:scale-95"
                        >
                            {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
                            {copied ? "Copied Invite Link!" : "Copy Invite Link"}
                        </Button>
                    </div>

                    {/* REFERRAL METRICS PILLS */}
                    <div className="grid grid-cols-3 gap-3 pt-2 border-t border-purple-500/20 text-center">
                        <div className="p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-0.5">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Friends Invited</p>
                            <p className="text-xl font-black text-foreground">{referralInfo?.totalReferrals ?? 0}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-0.5">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Active Trials</p>
                            <p className="text-xl font-black text-blue-400">{referralInfo?.activeTrials ?? 0}</p>
                        </div>
                        <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-0.5">
                            <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Subscribed</p>
                            <p className="text-xl font-black text-emerald-400">{referralInfo?.conversions ?? 0}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* SUBSCRIPTION & RENEWAL CARD */}
            <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <CreditCard className="h-5 w-5 text-emerald-400" /> Subscription & Prorated Billing
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Transparent annual billing renewing on January 1st with prorated first-year rates.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs font-bold w-fit">
                            ${paymentConfig?.yearlyPrice ?? 180} / year
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {isTrial && paymentConfig?.proratedBilling ? (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Trial Status</span>
                                    <p className="font-bold text-blue-400 text-sm">{daysLeft} Days Left</p>
                                    <p className="text-[10px] text-muted-foreground">Ends {user?.trialEndsAt ? format(new Date(user.trialEndsAt), "MMM d, yyyy") : ""}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">1st Year Prorated</span>
                                    <p className="font-bold text-emerald-400 text-sm">{paymentConfig.proratedBilling.amountDueText}</p>
                                    <p className="text-[10px] text-muted-foreground">{paymentConfig.proratedBilling.remainingMonthsText}</p>
                                </div>
                                <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 space-y-1">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Annual Renewal</span>
                                    <p className="font-bold text-purple-300 text-sm">${paymentConfig.proratedBilling.yearlyRate} / yr</p>
                                    <p className="text-[10px] text-muted-foreground">Renews {paymentConfig.proratedBilling.nextRenewalDate}</p>
                                </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground leading-relaxed">
                                {paymentConfig.proratedBilling.breakdownSummary}
                            </p>
                        </div>
                    ) : user?.status === "APPROVED" && user?.subscriptionEndsAt ? (
                        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-1 text-xs">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Active Annual Subscription</span>
                            <p className="font-bold text-emerald-400 text-sm">
                                Valid until {format(new Date(user.subscriptionEndsAt), "MMMM d, yyyy")}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Renews at ${paymentConfig?.yearlyPrice ?? 180}/year for the following calendar year.
                            </p>
                        </div>
                    ) : (
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Access Level</span>
                            <p className="font-bold text-foreground">
                                {user?.role === "ADMIN" ? "Server Administrator" : "Permanent Access"}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                Unrestricted lifetime access with full library and request privileges.
                            </p>
                        </div>
                    )}

                    {/* PAYMENT HANDLES */}
                    <div className="space-y-2 pt-2 border-t border-border/40">
                        <p className="font-bold text-foreground text-xs flex items-center gap-1.5">
                            <DollarSign className="h-3.5 w-3.5 text-primary" /> Supported Payment Methods
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono">
                            {paymentConfig?.paymentPaypal && (
                                <div className="p-2.5 rounded-xl bg-background/80 border border-border/40 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">PayPal</span>
                                        <span className="font-bold text-foreground truncate block">{paymentConfig.paymentPaypal}</span>
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                                        onClick={() => handleCopy(paymentConfig.paymentPaypal, "paypal")}
                                    >
                                        {copiedHandle === "paypal" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            )}
                            {paymentConfig?.paymentVenmo && (
                                <div className="p-2.5 rounded-xl bg-background/80 border border-border/40 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Venmo</span>
                                        <span className="font-bold text-foreground truncate block">{paymentConfig.paymentVenmo}</span>
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                                        onClick={() => handleCopy(paymentConfig.paymentVenmo, "venmo")}
                                    >
                                        {copiedHandle === "venmo" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            )}
                            {paymentConfig?.paymentCashApp && (
                                <div className="p-2.5 rounded-xl bg-background/80 border border-border/40 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Cash App</span>
                                        <span className="font-bold text-foreground truncate block">{paymentConfig.paymentCashApp}</span>
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                                        onClick={() => handleCopy(paymentConfig.paymentCashApp, "cashapp")}
                                    >
                                        {copiedHandle === "cashapp" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            )}
                            {paymentConfig?.paymentZelle && (
                                <div className="p-2.5 rounded-xl bg-background/80 border border-border/40 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <span className="text-muted-foreground font-sans text-[10px] uppercase font-bold tracking-wider block">Zelle</span>
                                        <span className="font-bold text-foreground truncate block">{paymentConfig.paymentZelle}</span>
                                    </div>
                                    <Button 
                                        type="button" 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-7 px-2 text-[11px] font-sans shrink-0 hover:bg-white/10"
                                        onClick={() => handleCopy(paymentConfig.paymentZelle, "zelle")}
                                    >
                                        {copiedHandle === "zelle" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            )}
                        </div>
                    </div>

                    {paymentConfig?.paymentInstructions && (
                        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.05] text-[11px] text-muted-foreground/90 whitespace-pre-wrap">
                            {paymentConfig.paymentInstructions}
                        </div>
                    )}

                    <p className="text-[11px] text-muted-foreground italic pt-1">
                        💡 When making a payment, remember to include your username <strong className="text-foreground">({user?.username})</strong> in the payment memo.
                    </p>
                </CardContent>
            </Card>

            {/* SEND-TO-KINDLE DELIVERY CARD */}
            <Card className="border-amber-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <BookOpen className="h-5 w-5 text-amber-400" /> Send-to-Kindle Delivery
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Configure your Kindle email address to receive ebooks directly on your Amazon Kindle device or app.
                            </CardDescription>
                        </div>
                        {user?.kindleEmail ? (
                            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-semibold w-fit flex items-center gap-1">
                                <CheckCircle2 className="h-3.5 w-3.5" /> Configured
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs font-semibold w-fit flex items-center gap-1">
                                <AlertCircle className="h-3.5 w-3.5" /> Not Configured
                            </Badge>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <form onSubmit={handleUpdateKindleEmail} className="space-y-4" autoComplete="off">
                        {kindleMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{kindleMsg}</span>
                            </div>
                        )}
                        {kindleErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{kindleErr}</span>
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="kindleEmailInput" className="text-xs font-semibold text-foreground">
                                    Send-to-Kindle Email Address
                                </Label>
                                {cleanKindleInput && (
                                    isKindleDomain ? (
                                        <span className="text-[11px] text-emerald-400 flex items-center gap-1 font-medium">
                                            <CheckCircle2 className="h-3 w-3" /> Kindle domain recognized
                                        </span>
                                    ) : hasAtSymbol ? (
                                        <span className="text-[11px] text-amber-400 flex items-center gap-1 font-medium">
                                            <AlertCircle className="h-3 w-3" /> Kindle addresses typically end with @kindle.com
                                        </span>
                                    ) : null
                                )}
                            </div>
                            <div className="relative">
                                <Input
                                    id="kindleEmailInput"
                                    type="email"
                                    value={kindleEmail}
                                    onChange={(e) => {
                                        setKindleEmail(e.target.value);
                                        if (kindleMsg) setKindleMsg("");
                                        if (kindleErr) setKindleErr("");
                                    }}
                                    placeholder="e.g. yourusername@kindle.com"
                                    className="bg-background/80 font-mono text-xs pr-10 border-border/60"
                                    autoComplete="email"
                                />
                                <MailCheck className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Find your Kindle email on your device under <strong className="text-foreground">Settings &gt; Your Account &gt; Send-to-Kindle Email</strong>, or on Amazon under <strong className="text-foreground">Manage Your Content and Devices &gt; Preferences</strong>.
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                            <Button
                                type="submit"
                                disabled={kindleSaving || (!hasChangedKindle && Boolean(user?.kindleEmail))}
                                className="w-full sm:w-auto font-semibold gap-2 transition-all hover:ring-2 hover:ring-primary/50 text-xs h-9"
                            >
                                {kindleSaving ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin" /> Saving...
                                    </>
                                ) : (
                                    <>
                                        <BookOpen className="h-4 w-4" /> {user?.kindleEmail ? "Update Kindle Email" : "Save Kindle Email"}
                                    </>
                                )}
                            </Button>
                            {user?.kindleEmail && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={kindleSaving}
                                    onClick={handleClearKindleEmail}
                                    className="w-full sm:w-auto text-xs h-9 text-muted-foreground hover:text-red-400 hover:border-red-500/40 gap-1.5"
                                >
                                    <Trash2 className="h-3.5 w-3.5" /> Remove Address
                                </Button>
                            )}
                        </div>
                    </form>

                    {/* AMAZON WHITELIST & SETUP INSTRUCTIONS */}
                    <div className="p-3.5 rounded-xl bg-purple-500/5 border border-purple-500/20 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-foreground flex items-center gap-1.5 text-xs">
                                <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Amazon Approved Sender Whitelist
                            </span>
                            <a
                                href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-purple-400 hover:text-purple-300 flex items-center gap-1 underline underline-offset-2 shrink-0 font-medium"
                            >
                                Amazon Settings <ExternalLink className="h-3 w-3" />
                            </a>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                            Amazon requires that you authorize our outbound server email address in your Amazon account. Add the address below to your <strong className="text-foreground">Approved Personal Document E-mail List</strong>:
                        </p>
                        
                        {paymentConfig?.smtpFrom ? (
                            <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                                <div className="p-2 rounded-lg bg-background/80 border border-purple-500/30 font-mono text-xs text-foreground flex-1 w-full truncate">
                                    {paymentConfig.smtpFrom}
                                </div>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopy(paymentConfig.smtpFrom, "smtpFrom")}
                                    className="w-full sm:w-auto font-sans text-xs gap-1.5 shrink-0 border-purple-500/30 hover:bg-purple-500/10"
                                >
                                    {copiedHandle === "smtpFrom" ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-purple-400" />}
                                    {copiedHandle === "smtpFrom" ? "Copied Sender!" : "Copy Sender Email"}
                                </Button>
                            </div>
                        ) : (
                            <p className="text-[11px] text-amber-400/90 italic">
                                Note: Inbound server SMTP address will appear once configured by the administrator.
                            </p>
                        )}
                    </div>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                {/* ACCOUNT INFORMATION CARD */}
                <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <ShieldCheck className="h-5 w-5 text-primary" /> Account Details
                        </CardTitle>
                        <CardDescription>Your registered profile and access status.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground font-semibold">Username</Label>
                            <div className="font-semibold text-base flex items-center gap-2 text-foreground">
                                <span>{user?.username || "Unknown"}</span>
                                <Badge variant={user?.role === "ADMIN" ? "default" : "secondary"} className="text-[10px] font-bold">
                                    {user?.role || "USER"}
                                </Badge>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-border/40">
                            <Label className="text-xs text-muted-foreground font-semibold">Email Address</Label>
                            <div className="text-sm font-medium flex items-center gap-2 text-foreground">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{user?.email || "No Email Associated"}</span>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-border/40">
                            <Label className="text-xs text-muted-foreground font-semibold">Send-to-Kindle Email</Label>
                            <div className="text-sm font-medium flex items-center justify-between gap-2 text-foreground">
                                <div className="flex items-center gap-2 truncate">
                                    <MailCheck className="h-4 w-4 text-primary shrink-0" />
                                    <span className="truncate">{user?.kindleEmail || "Not Configured"}</span>
                                </div>
                                {user?.kindleEmail ? (
                                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] shrink-0 font-medium">
                                        Active
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-muted/40 text-muted-foreground border-border text-[10px] shrink-0">
                                        Disabled
                                    </Badge>
                                )}
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-border/40">
                            <Label className="text-xs text-muted-foreground font-semibold">Account Access Status</Label>
                            <div className="flex items-center gap-2 pt-0.5">
                                {isTrial ? (
                                    <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/40 gap-1.5 text-xs font-bold">
                                        <Timer className="h-3.5 w-3.5" /> {paymentConfig?.defaultTrialDays || 14}-Day Free Trial ({daysLeft} days remaining)
                                    </Badge>
                                ) : user?.status === "APPROVED" && user?.subscriptionEndsAt ? (
                                    <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5 text-xs font-semibold">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Subscribed (Expires {format(new Date(user.subscriptionEndsAt), "MMM d, yyyy")})
                                    </Badge>
                                ) : user?.status === "APPROVED" ? (
                                    <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5 text-xs font-semibold">
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Permanent Access
                                    </Badge>
                                ) : (
                                    <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1.5 text-xs font-semibold">
                                        {user?.status || "Pending"}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* CHANGE PASSWORD CARD */}
                <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
                    <CardHeader>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-primary" /> Change Password
                        </CardTitle>
                        <CardDescription>Update your login password for Portalarr.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleChangePassword} className="space-y-4" autoComplete="off">
                            {passMsg && (
                                <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{passMsg}</span>
                                </div>
                            )}
                            {passErr && (
                                <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    <span>{passErr}</span>
                                </div>
                            )}
                            
                            <div className="space-y-1.5">
                                <Label htmlFor="currentPassword" className="text-xs font-semibold">Current or Temporary Password</Label>
                                <Input 
                                    id="currentPassword"
                                    type="password" 
                                    required 
                                    value={passCurrent} 
                                    onChange={(e) => setPassCurrent(e.target.value)} 
                                    placeholder="Enter current or temp password"
                                    className="bg-background/60"
                                    autoComplete="current-password"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="newPassword" className="text-xs font-semibold">New Password</Label>
                                <Input 
                                    id="newPassword"
                                    type="password" 
                                    required 
                                    value={passNew} 
                                    onChange={(e) => setPassNew(e.target.value)} 
                                    placeholder="Minimum 6 characters"
                                    className="bg-background/60"
                                    autoComplete="new-password"
                                />
                            </div>

                            <Button type="submit" disabled={passLoading} className="w-full font-semibold transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:shadow-md active:scale-98">
                                {passLoading ? (
                                    <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Updating Password...
                                    </>
                                ) : (
                                    <>
                                        <KeyRound className="h-4 w-4 mr-2" /> Update Password
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
