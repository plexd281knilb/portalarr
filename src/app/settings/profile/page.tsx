"use client";

import { useState, useEffect } from "react";
import { getCurrentUser, changeUserPassword } from "@/app/auth-actions";
import { getUserReferralInfo } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
    User, Mail, KeyRound, CheckCircle2, XCircle, Loader2, ShieldCheck, 
    MailCheck, Zap, BookOpen, Gift, Copy, Check, Timer, DollarSign, Users, Sparkles, ExternalLink
} from "lucide-react";
import ServerSpeedTest from "@/components/server-speed-test";
import PlexSetupGuides from "@/components/plex-setup-guides";
import { format, differenceInDays } from "date-fns";

export default function UserProfilePage() {
    const [user, setUser] = useState<any>(null);
    const [referralInfo, setReferralInfo] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    // Change Password State
    const [passCurrent, setPassCurrent] = useState("");
    const [passNew, setPassNew] = useState("");
    const [passMsg, setPassMsg] = useState("");
    const [passErr, setPassErr] = useState("");
    const [passLoading, setPassLoading] = useState(false);

    useEffect(() => {
        async function fetchProfile() {
            setLoading(true);
            try {
                const u = await getCurrentUser();
                setUser(u);
                const ref = await getUserReferralInfo();
                if (ref?.success) {
                    setReferralInfo(ref);
                }
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        }
        fetchProfile();
    }, []);

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

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                        <User className="h-6 w-6 text-primary" /> Account Profile & Settings
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Manage your account credentials, Send-to-Kindle settings, and invite friends with your personal link.
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
                                Give your friends a free 14-day pass to try out the media server. Track their trial progress and subscription rewards below.
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
                            <div className="text-sm font-medium flex items-center gap-2 text-foreground">
                                <MailCheck className="h-4 w-4 text-primary" />
                                <span>{user?.kindleEmail || "Not Configured (Set up under Book Library)"}</span>
                            </div>
                        </div>

                        <div className="space-y-1 pt-2 border-t border-border/40">
                            <Label className="text-xs text-muted-foreground font-semibold">Account Access Status</Label>
                            <div className="flex items-center gap-2 pt-0.5">
                                {isTrial ? (
                                    <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/40 gap-1.5 text-xs font-bold">
                                        <Timer className="h-3.5 w-3.5" /> 14-Day Free Trial ({daysLeft} days remaining)
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
