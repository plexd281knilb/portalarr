"use client";

import { useState, useEffect } from "react";
import { getCurrentUser, changeUserPassword } from "@/app/auth-actions";
import { 
    getUserReferralInfo, 
    getPublicJoinConfig, 
    updateCurrentUserKindleEmail,
    getUserNotificationPreferencesAction,
    updateUserNotificationPreferencesAction,
    getUserContentPreferencesAction,
    updateUserContentPreferencesAction,
    requestTierUpgradeAction,
    getUserAllowedPlexLibrariesAction,
    updateUserSelectedPlexLibrariesAction,
    getUserSubAccountsAction,
    createOrUpdateSubAccountAction,
    deleteSubAccountAction,
    getAvailableAddonsAction,
    toggleFreeAddonAction
} from "@/app/actions";
import { recheckUserAccessAndPaymentAction } from "@/app/payment-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
    User, Mail, KeyRound, CheckCircle2, XCircle, Loader2, ShieldCheck, 
    MailCheck, Zap, BookOpen, Gift, Copy, Check, Timer, DollarSign, Users, Sparkles, ExternalLink,
    CreditCard, Calendar, AlertCircle, Trash2, RefreshCw, Bell, Shield, Crown, Tv, Film,
    Flame, MessageSquare, Send, CheckCheck, Sliders, Volume2, Lock, Baby, Monitor, FolderCheck,
    CheckSquare, Square, Plus, Edit2, AlertTriangle, Music
} from "lucide-react";
import ServerSpeedTest from "@/components/server-speed-test";
import PlexSetupGuides from "@/components/plex-setup-guides";
import { PaymentMethodsGrid } from "@/components/payment-methods-grid";
import { format, differenceInDays } from "date-fns";

export default function UserProfilePage() {
    const [user, setUser] = useState<any>(null);
    const [referralInfo, setReferralInfo] = useState<any>(null);
    const [paymentConfig, setPaymentConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);
    const [copiedHandle, setCopiedHandle] = useState<string | null>(null);

    // Check Access & Payment Status State
    const [checkingStatus, setCheckingStatus] = useState(false);
    const [statusSyncMsg, setStatusSyncMsg] = useState("");
    const [statusSyncErr, setStatusSyncErr] = useState("");

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

    // Notification Preferences State
    const [notifPrefs, setNotifPrefs] = useState({
        emailMediaReady: true,
        emailNewContent: true,
        emailAnnouncements: true,
        emailSupportTickets: true,
        emailSubscriptionReminders: true,
        emailReferralRewards: true,
        discordMediaReady: false,
        discordAnnouncements: false,
        discordWebhookUrl: ""
    });
    const [savingNotif, setSavingNotif] = useState(false);
    const [notifMsg, setNotifMsg] = useState("");
    const [notifErr, setNotifErr] = useState("");

    // Content Safety Preferences State
    const [contentPrefs, setContentPrefs] = useState({
        maxContentRating: "ALL",
        hideLeavingSoon: false,
        hideHorror: false,
        hideNsfw: false,
        hideGore: false,
        excludedGenresList: [] as string[],
        excludedTagsList: [] as string[]
    });
    const [savingContent, setSavingContent] = useState(false);
    const [contentMsg, setContentMsg] = useState("");
    const [contentErr, setContentErr] = useState("");

    // Membership Upgrade Modal State
    const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
    const [targetTier, setTargetTier] = useState("PREMIUM_4K");
    const [upgradeNote, setUpgradeNote] = useState("");
    const [submittingUpgrade, setSubmittingUpgrade] = useState(false);
    const [upgradeSuccessMsg, setUpgradeSuccessMsg] = useState("");
    const [upgradeErrMsg, setUpgradeErrMsg] = useState("");

    // Shared Plex Libraries State
    const [allowedLibraries, setAllowedLibraries] = useState<string[]>([]);
    const [selectedLibraries, setSelectedLibraries] = useState<string[]>([]);
    const [serverLibraries, setServerLibraries] = useState<any[]>([]);
    const [savingLibraries, setSavingLibraries] = useState(false);
    const [libMsg, setLibMsg] = useState("");
    const [libErr, setLibErr] = useState("");

    // Household Sub-Accounts State
    const [subAccounts, setSubAccounts] = useState<any[]>([]);
    const [subLimits, setSubLimits] = useState({ includedLivingRooms: 1, includedKids: 1, totalActive: 0 });
    const [subModalOpen, setSubModalOpen] = useState(false);
    const [subEditingId, setSubEditingId] = useState<string | null>(null);
    const [subType, setSubType] = useState<"LIVING_ROOM" | "KID">("LIVING_ROOM");
    const [subLabel, setSubLabel] = useState("");
    const [subPlexHandle, setSubPlexHandle] = useState("");
    const [savingSub, setSavingSub] = useState(false);
    const [subModalMsg, setSubModalMsg] = useState("");
    const [subModalErr, setSubModalErr] = useState("");
    const [deleteSubConfirmId, setDeleteSubConfirmId] = useState<string | null>(null);
    const [deletingSub, setDeletingSub] = useState(false);

    // Account Add-Ons State
    const [addonsCatalog, setAddonsCatalog] = useState<any[]>([]);
    const [userEnabledAddons, setUserEnabledAddons] = useState<string[]>([]);
    const [togglingAddonId, setTogglingAddonId] = useState<string | null>(null);
    const [addonMsg, setAddonMsg] = useState("");
    const [addonErr, setAddonErr] = useState("");

    const handleCopy = (text: string, key: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedHandle(key);
        setTimeout(() => setCopiedHandle(null), 2000);
    };

    const handleRecheckStatus = async () => {
        setCheckingStatus(true);
        setStatusSyncMsg("");
        setStatusSyncErr("");
        try {
            const res = await recheckUserAccessAndPaymentAction();
            if (res.success) {
                if (res.user) setUser(res.user);
                setStatusSyncMsg(res.message || "Payment status and access verification complete!");
                const ref = await getUserReferralInfo();
                if (ref?.success) setReferralInfo(ref);
                setTimeout(() => setStatusSyncMsg(""), 6000);
            } else {
                setStatusSyncErr(res.error || "Failed to sync payment status.");
            }
        } catch (err: any) {
            setStatusSyncErr(err.message || "Error checking access status");
        } finally {
            setCheckingStatus(false);
        }
    };

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

                // Load Notification Preferences
                const notifRes = await getUserNotificationPreferencesAction();
                if (notifRes?.success && notifRes.preferences) {
                    setNotifPrefs({
                        emailMediaReady: Boolean(notifRes.preferences.emailMediaReady),
                        emailNewContent: Boolean(notifRes.preferences.emailNewContent),
                        emailAnnouncements: Boolean(notifRes.preferences.emailAnnouncements),
                        emailSupportTickets: Boolean(notifRes.preferences.emailSupportTickets),
                        emailSubscriptionReminders: Boolean(notifRes.preferences.emailSubscriptionReminders),
                        emailReferralRewards: Boolean(notifRes.preferences.emailReferralRewards),
                        discordMediaReady: Boolean(notifRes.preferences.discordMediaReady),
                        discordAnnouncements: Boolean(notifRes.preferences.discordAnnouncements),
                        discordWebhookUrl: notifRes.preferences.discordWebhookUrl || ""
                    });
                }

                // Load Content Preferences
                const contentRes = await getUserContentPreferencesAction();
                if (contentRes?.success && contentRes.preferences) {
                    setContentPrefs({
                        maxContentRating: contentRes.preferences.maxContentRating || "ALL",
                        hideLeavingSoon: Boolean(contentRes.preferences.hideLeavingSoon),
                        hideHorror: Boolean(contentRes.preferences.hideHorror),
                        hideNsfw: Boolean(contentRes.preferences.hideNsfw),
                        hideGore: Boolean(contentRes.preferences.hideGore),
                        excludedGenresList: contentRes.preferences.excludedGenresList || [],
                        excludedTagsList: contentRes.preferences.excludedTagsList || []
                    });
                }

                // Load Shared Plex Libraries
                const libRes = await getUserAllowedPlexLibrariesAction();
                if (libRes?.success) {
                    setAllowedLibraries(libRes.allowedKeys || []);
                    setSelectedLibraries(libRes.selectedKeys || []);
                    setServerLibraries(libRes.servers || []);
                }

                // Load Household Sub-Accounts
                const subRes = await getUserSubAccountsAction();
                if (subRes?.success) {
                    setSubAccounts(subRes.subAccounts || []);
                    if (subRes.limits) setSubLimits(subRes.limits);
                }

                // Load Add-ons Catalog
                const addRes = await getAvailableAddonsAction();
                if (addRes?.success) {
                    setAddonsCatalog(addRes.catalog || []);
                    setUserEnabledAddons(addRes.userEnabledAddons || []);
                }
            } catch (e) {
                console.error("fetchProfile error:", e);
            } finally {
                setLoading(false);
            }
        }
        fetchProfile();
    }, []);

    // --- LIBRARY PREFERENCE HANDLERS ---
    const isSectionAllowed = (uniqueKey: string, id: number | string) => {
        if (!allowedLibraries || allowedLibraries.length === 0) return true;
        const idStr = String(id);
        return (
            allowedLibraries.includes(uniqueKey) ||
            allowedLibraries.includes(idStr) ||
            allowedLibraries.some(ak => ak.endsWith(`:${idStr}`))
        );
    };

    const isSectionSelected = (uniqueKey: string, id: number | string) => {
        const idStr = String(id);
        return (
            selectedLibraries.includes(uniqueKey) ||
            selectedLibraries.includes(idStr) ||
            selectedLibraries.some(sk => sk.endsWith(`:${idStr}`))
        );
    };

    const handleToggleLibrary = (uniqueKey: string, id: number | string) => {
        const isSelected = isSectionSelected(uniqueKey, id);
        const idStr = String(id);
        if (isSelected) {
            setSelectedLibraries(prev => prev.filter(k => k !== uniqueKey && k !== idStr && !k.endsWith(`:${idStr}`)));
        } else {
            setSelectedLibraries(prev => Array.from(new Set([...prev, uniqueKey])));
        }
    };

    const handleSelectAllLibraries = () => {
        const allKeys: string[] = [];
        for (const srv of serverLibraries) {
            for (const sec of srv.sections || []) {
                if (isSectionAllowed(sec.uniqueKey, sec.id)) {
                    allKeys.push(sec.uniqueKey);
                }
            }
        }
        setSelectedLibraries(allKeys);
    };

    const handleDeselectAllLibraries = () => {
        setSelectedLibraries([]);
    };

    const handleSaveLibraries = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingLibraries(true);
        setLibMsg("");
        setLibErr("");
        try {
            const res = await updateUserSelectedPlexLibrariesAction(selectedLibraries);
            if (res.success) {
                setLibMsg(res.message || "Your shared Plex library preferences have been saved and synced to Plex!");
                if (res.selectedKeys) setSelectedLibraries(res.selectedKeys);
                setTimeout(() => setLibMsg(""), 5000);
            } else {
                setLibErr(res.error || "Failed to save library preferences.");
            }
        } catch (err: any) {
            setLibErr(err.message || "Error saving library preferences");
        } finally {
            setSavingLibraries(false);
        }
    };

    // --- SUB-ACCOUNT HANDLERS ---
    const handleOpenAddSubAccount = (type: "LIVING_ROOM" | "KID") => {
        setSubEditingId(null);
        setSubType(type);
        setSubLabel(type === "KID" ? "Kids Account" : "Living Room TV");
        setSubPlexHandle("");
        setSubModalMsg("");
        setSubModalErr("");
        setSubModalOpen(true);
    };

    const handleOpenEditSubAccount = (sub: any) => {
        setSubEditingId(sub.id);
        setSubType(sub.accountType === "KID" ? "KID" : "LIVING_ROOM");
        setSubLabel(sub.subAccountLabel || "");
        setSubPlexHandle(sub.plexUsername || sub.plexEmail || "");
        setSubModalMsg("");
        setSubModalErr("");
        setSubModalOpen(true);
    };

    const handleSaveSubAccount = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingSub(true);
        setSubModalMsg("");
        setSubModalErr("");
        try {
            const res = await createOrUpdateSubAccountAction({
                id: subEditingId || undefined,
                type: subType,
                label: subLabel,
                plexUsernameOrEmail: subPlexHandle
            });
            if (res.success) {
                setSubModalMsg(res.message || "Sub-account saved successfully!");
                const subRes = await getUserSubAccountsAction();
                if (subRes?.success) {
                    setSubAccounts(subRes.subAccounts || []);
                    if (subRes.limits) setSubLimits(subRes.limits);
                }
                setTimeout(() => {
                    setSubModalOpen(false);
                    setSubModalMsg("");
                }, 1500);
            } else {
                setSubModalErr(res.error || "Failed to save sub-account");
            }
        } catch (err: any) {
            setSubModalErr(err.message || "Error saving sub-account");
        } finally {
            setSavingSub(false);
        }
    };

    const handleDeleteSubAccount = async (id: string) => {
        setDeletingSub(true);
        try {
            const res = await deleteSubAccountAction(id);
            if (res.success) {
                const subRes = await getUserSubAccountsAction();
                if (subRes?.success) {
                    setSubAccounts(subRes.subAccounts || []);
                    if (subRes.limits) setSubLimits(subRes.limits);
                }
                setDeleteSubConfirmId(null);
            }
        } catch (err) {
            console.error("Failed to delete sub-account:", err);
        } finally {
            setDeletingSub(false);
        }
    };

    // --- ADD-ON HANDLER ---
    const handleToggleFreeAddon = async (addonId: string, enabled: boolean) => {
        setTogglingAddonId(addonId);
        setAddonMsg("");
        setAddonErr("");
        try {
            const res = await toggleFreeAddonAction(addonId, enabled);
            if (res.success) {
                setUserEnabledAddons(res.enabledAddons || []);
                setAddonMsg(res.message || "Add-on preference updated!");
                const subRes = await getUserSubAccountsAction();
                if (subRes?.success && subRes.limits) {
                    setSubLimits(subRes.limits);
                }
                setTimeout(() => setAddonMsg(""), 4000);
            } else {
                setAddonErr(res.error || "Failed to update add-on");
                setTimeout(() => setAddonErr(""), 5000);
            }
        } catch (err: any) {
            setAddonErr(err.message || "Error updating add-on");
            setTimeout(() => setAddonErr(""), 5000);
        } finally {
            setTogglingAddonId(null);
        }
    };

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

    const handleSaveNotifications = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingNotif(true);
        setNotifMsg("");
        setNotifErr("");
        try {
            const res = await updateUserNotificationPreferencesAction(notifPrefs);
            if (res.success) {
                setNotifMsg(res.message || "Notification preferences saved!");
                setTimeout(() => setNotifMsg(""), 4000);
            } else {
                setNotifErr(res.error || "Failed to save preferences");
            }
        } catch (err: any) {
            setNotifErr(err.message || "Error saving preferences");
        } finally {
            setSavingNotif(false);
        }
    };

    const handleSaveContentSafety = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingContent(true);
        setContentMsg("");
        setContentErr("");
        try {
            const res = await updateUserContentPreferencesAction({
                maxContentRating: contentPrefs.maxContentRating,
                hideLeavingSoon: contentPrefs.hideLeavingSoon,
                hideHorror: contentPrefs.hideHorror,
                hideNsfw: contentPrefs.hideNsfw,
                hideGore: contentPrefs.hideGore,
                excludedGenres: contentPrefs.excludedGenresList,
                excludedTags: contentPrefs.excludedTagsList
            });
            if (res.success) {
                setContentMsg(res.message || "Content safety preferences saved!");
                setTimeout(() => setContentMsg(""), 4000);
            } else {
                setContentErr(res.error || "Failed to save preferences");
            }
        } catch (err: any) {
            setContentErr(err.message || "Error saving preferences");
        } finally {
            setSavingContent(false);
        }
    };

    const handleSubmitUpgrade = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmittingUpgrade(true);
        setUpgradeSuccessMsg("");
        setUpgradeErrMsg("");
        try {
            const res = await requestTierUpgradeAction(targetTier, upgradeNote);
            if (res.success) {
                setUpgradeSuccessMsg(res.message || "Upgrade request submitted successfully!");
                setTimeout(() => {
                    setUpgradeModalOpen(false);
                    setUpgradeSuccessMsg("");
                    setUpgradeNote("");
                }, 2000);
            } else {
                setUpgradeErrMsg(res.error || "Failed to submit upgrade request");
            }
        } catch (err: any) {
            setUpgradeErrMsg(err.message || "Error submitting request");
        } finally {
            setSubmittingUpgrade(false);
        }
    };

    const handleCopyInviteLink = () => {
        if (!referralInfo?.referralCode) return;
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        const url = referralInfo?.inviteUrl || (paymentConfig?.appUrl ? `${paymentConfig.appUrl}/join?ref=${referralInfo.referralCode}` : `${origin}/join?ref=${referralInfo.referralCode}`);
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
    const inviteUrl = referralInfo?.inviteUrl || (referralInfo?.referralCode ? (paymentConfig?.appUrl ? `${paymentConfig.appUrl}/join?ref=${referralInfo.referralCode}` : `${origin}/join?ref=${referralInfo.referralCode}`) : "");

    const cleanKindleInput = kindleEmail.trim().toLowerCase();
    const isKindleDomain = cleanKindleInput.endsWith("@kindle.com") || cleanKindleInput.endsWith("@free.kindle.com");
    const hasAtSymbol = cleanKindleInput.includes("@");
    const hasChangedKindle = (user?.kindleEmail || "").trim().toLowerCase() !== cleanKindleInput;

    const currentTier = user?.membershipTier || "STANDARD";
    const currentAccountType = user?.accountType || "STANDARD";
    const isTier2 = currentTier === "TIER_2_VIP";
    const effectiveYearlyPrice = isTier2 
        ? (paymentConfig?.tier2YearlyPrice ?? 240) 
        : (paymentConfig?.yearlyPrice ?? 180);
    const effectiveMonthlyPrice = isTier2
        ? (paymentConfig?.tier2MonthlyPrice ?? 25)
        : (paymentConfig?.monthlyPrice ?? 15);

    return (
        <div className="space-y-6 max-w-4xl mx-auto p-4 sm:p-6 animate-in fade-in duration-500">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2">
                        <User className="h-6 w-6 text-primary" /> Account Profile & Settings
                    </h1>
                    <p className="text-muted-foreground text-sm">
                        Manage your account credentials, notifications, membership tier, content safety, and Send-to-Kindle delivery.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRecheckStatus}
                        disabled={checkingStatus}
                        className="h-9 px-3 text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1.5 transition-all active:scale-95 cursor-pointer shadow-xs"
                        title="Ping payment email inboxes to verify new Venmo/PayPal/Zelle payments and refresh access"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${checkingStatus ? "animate-spin text-emerald-400" : ""}`} />
                        {checkingStatus ? "Checking Payment Emails..." : "Check Access & Payment Status"}
                    </Button>
                    <ServerSpeedTest />
                    <PlexSetupGuides />
                </div>
            </div>

            {/* STATUS SYNC ALERT FEEDBACK */}
            {statusSyncMsg && (
                <div className="p-3.5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{statusSyncMsg}</span>
                </div>
            )}
            {statusSyncErr && (
                <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2.5 animate-in fade-in duration-200">
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{statusSyncErr}</span>
                </div>
            )}

            {/* REFERRAL & INVITE LINK CARD */}
            <Card id="referral" className="border-purple-500/30 bg-purple-950/10 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
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

            {/* MEMBERSHIP TIER & PERKS CARD */}
            <Card className="border-indigo-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Crown className="h-5 w-5 text-indigo-400" /> Membership Tier & Service Access
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Your current plan tier determines 4K stream transcoding access, IPTV channels, and profile features.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs font-bold ${
                                currentTier === "VIP_ALL_ACCESS" 
                                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40" 
                                    : currentTier === "PREMIUM_4K"
                                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40"
                                    : currentTier === "FAMILY"
                                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                    : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            }`}>
                                {currentTier === "VIP_ALL_ACCESS" ? "👑 VIP All-Access" : currentTier === "PREMIUM_4K" ? "💎 4K UHD Dedicated" : currentTier === "FAMILY" ? "👨‍👩‍👧‍👦 Family Tier" : "⭐ Standard Access"}
                            </Badge>
                            {currentAccountType !== "STANDARD" && (
                                <Badge variant="outline" className="text-xs font-medium bg-muted/40 border-border">
                                    {currentAccountType === "KID" ? "👶 Kid Account" : "📺 Living Room"}
                                </Badge>
                            )}
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Video Quality</span>
                            <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                <Tv className="h-4 w-4 text-cyan-400" />
                                {currentTier === "PREMIUM_4K" || currentTier === "VIP_ALL_ACCESS" || user?.canRequest4k ? "4K UHD + 1080p" : "1080p Full HD"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Dedicated NVENC hardware streams.</p>
                        </div>

                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Media Quotas</span>
                            <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                <Sparkles className="h-4 w-4 text-amber-400" />
                                {currentTier === "VIP_ALL_ACCESS" ? "Unlimited Requests" : "Standard Weekly Quotas"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Movie, TV show & book requests.</p>
                        </div>

                        <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-1">
                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Profile Safety</span>
                            <p className="font-bold text-foreground text-sm flex items-center gap-1.5">
                                <ShieldCheck className="h-4 w-4 text-emerald-400" />
                                {currentAccountType === "KID" ? "Child Protection Active" : "Full Library Access"}
                            </p>
                            <p className="text-[10px] text-muted-foreground">Parental rating & genre filters.</p>
                        </div>
                    </div>

                    <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/40">
                        <p className="text-xs text-muted-foreground">
                            Want to unlock 4K UHD downloads, dedicated transcode capacity, or extra family profiles?
                        </p>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => {
                                setUpgradeModalOpen(true);
                                setUpgradeSuccessMsg("");
                                setUpgradeErrMsg("");
                            }}
                            className="w-full sm:w-auto text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/30 gap-1.5 shrink-0 transition-all hover:ring-2 hover:ring-indigo-400/40 active:scale-95"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-indigo-400" /> Request Tier Upgrade
                        </Button>
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
                            ${effectiveYearlyPrice} / year
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
                                    <p className="font-bold text-purple-300 text-sm">${effectiveYearlyPrice} / yr</p>
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
                                Renews at ${effectiveYearlyPrice}/year for the following calendar year.
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

                    {/* PAYMENT HANDLES & MODAL */}
                    <div className="pt-2 border-t border-border/40">
                        <PaymentMethodsGrid config={paymentConfig} username={user?.username} />
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

            {/* MY SHARED PLEX LIBRARIES CARD */}
            <Card id="libraries" className="border-cyan-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <FolderCheck className="h-5 w-5 text-cyan-400" /> My Shared Plex Libraries
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Choose which libraries from your allowed membership access appear on your Plex home screen and apps.
                            </CardDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-xs w-fit">
                                {selectedLibraries.length} Libraries Selected
                            </Badge>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveLibraries} className="space-y-4">
                        {libMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{libMsg}</span>
                            </div>
                        )}
                        {libErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{libErr}</span>
                            </div>
                        )}

                        {serverLibraries.length === 0 ? (
                            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] text-center text-xs text-muted-foreground">
                                No Plex server libraries found. Your shared libraries will appear here once configured by the administrator.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                                    <span className="text-xs text-muted-foreground">
                                        Toggle individual libraries on or off to tailor your Plex home screen:
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={handleSelectAllLibraries}
                                            className="h-7 px-2.5 text-[11px] text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/10 cursor-pointer"
                                        >
                                            <CheckSquare className="h-3 w-3 mr-1" /> Select All
                                        </Button>
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="sm" 
                                            onClick={handleDeselectAllLibraries}
                                            className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-foreground cursor-pointer"
                                        >
                                            <Square className="h-3 w-3 mr-1" /> Deselect All
                                        </Button>
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    {serverLibraries.map((server) => {
                                        const allowedSections = (server.sections || []).filter((sec: any) => isSectionAllowed(sec.uniqueKey, sec.id));
                                        if (allowedSections.length === 0) return null;

                                        return (
                                            <div key={server.serverId} className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                                                <div className="flex items-center justify-between border-b border-border/30 pb-2">
                                                    <span className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                                        <Tv className="h-3.5 w-3.5 text-primary" /> {server.serverName || "Plex Server"}
                                                    </span>
                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                        {allowedSections.length} Available
                                                    </Badge>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                                                    {allowedSections.map((sec: any) => {
                                                        const isSelected = isSectionSelected(sec.uniqueKey, sec.id);
                                                        return (
                                                            <button
                                                                key={sec.uniqueKey || sec.id}
                                                                type="button"
                                                                onClick={() => handleToggleLibrary(sec.uniqueKey, sec.id)}
                                                                className={`p-2.5 rounded-lg border text-left flex items-center justify-between gap-2 transition-all cursor-pointer ${
                                                                    isSelected
                                                                        ? "bg-cyan-500/10 border-cyan-500/40 text-cyan-200 shadow-xs"
                                                                        : "bg-background/50 border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2 min-w-0">
                                                                    {sec.type === "movie" ? (
                                                                        <Film className={`h-4 w-4 shrink-0 ${isSelected ? "text-cyan-400" : "text-muted-foreground"}`} />
                                                                    ) : sec.type === "show" ? (
                                                                        <Tv className={`h-4 w-4 shrink-0 ${isSelected ? "text-purple-400" : "text-muted-foreground"}`} />
                                                                    ) : sec.type === "artist" || sec.type === "music" ? (
                                                                        <Music className={`h-4 w-4 shrink-0 ${isSelected ? "text-emerald-400" : "text-muted-foreground"}`} />
                                                                    ) : (
                                                                        <FolderCheck className={`h-4 w-4 shrink-0 ${isSelected ? "text-amber-400" : "text-muted-foreground"}`} />
                                                                    )}
                                                                    <span className="text-xs font-semibold truncate">{sec.title}</span>
                                                                </div>
                                                                <div className={`h-4 w-4 rounded shrink-0 flex items-center justify-center border transition-all ${
                                                                    isSelected ? "bg-cyan-500 border-cyan-400 text-slate-950" : "border-muted-foreground/40 bg-transparent"
                                                                }`}>
                                                                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-border/30">
                            <p className="text-[11px] text-muted-foreground italic">
                                💡 Library changes push directly to your Plex account immediately upon saving.
                            </p>
                            <Button
                                type="submit"
                                disabled={savingLibraries}
                                className="w-full sm:w-auto font-bold text-xs h-9 bg-cyan-600 hover:bg-cyan-500 text-white gap-2 transition-all hover:ring-2 hover:ring-cyan-400/40 active:scale-95 cursor-pointer"
                            >
                                {savingLibraries ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                                Save Library Preferences
                            </Button>
                        </div>
                    </form>
                </CardContent>
            </Card>

            {/* HOUSEHOLD SUB-ACCOUNTS CARD */}
            <Card id="subaccounts" className="border-purple-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-purple-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Users className="h-5 w-5 text-purple-400" /> Household Sub-Accounts & Profiles
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Create secondary Plex profiles for your Living Room TV or Kids' tablets. Sub-accounts are nested under your membership with zero extra billing.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-xs w-fit">
                            {subAccounts.length} / {subLimits.includedLivingRooms + subLimits.includedKids} Profiles Configured
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* LIVING ROOM PROFILES COLUMN */}
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                        <Monitor className="h-4 w-4 text-indigo-400" /> Living Room TV
                                    </span>
                                    <Badge variant="outline" className="text-[10px] text-indigo-300 border-indigo-500/30 bg-indigo-500/10">
                                        Nudity Filtered
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Shares the same libraries as your main account, but automatically filters out content with IMDb Severe Nudity tags for family room viewing.
                                </p>

                                {/* EXISTING LIVING ROOM SUBS */}
                                <div className="space-y-2">
                                    {subAccounts.filter(s => s.accountType === "LIVING_ROOM").map(sub => (
                                        <div key={sub.id} className="p-2.5 rounded-lg bg-indigo-950/20 border border-indigo-500/30 flex items-center justify-between gap-2">
                                            <div className="space-y-0.5 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-bold text-foreground truncate">{sub.subAccountLabel || "Living Room TV"}</span>
                                                    <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Active</Badge>
                                                </div>
                                                <p className="text-[11px] font-mono text-muted-foreground truncate">{sub.plexUsername || sub.plexEmail}</p>
                                                <span className="inline-flex items-center text-[10px] text-indigo-300/90 font-medium">
                                                    🚫 Severe Nudity Excluded
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleOpenEditSubAccount(sub)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                                                    title="Edit Profile"
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDeleteSubConfirmId(sub.id)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 cursor-pointer"
                                                    title="Remove Sub-Account"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-2">
                                {subAccounts.filter(s => s.accountType === "LIVING_ROOM").length < subLimits.includedLivingRooms ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenAddSubAccount("LIVING_ROOM")}
                                        className="w-full text-xs font-semibold bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border-indigo-500/30 gap-1.5 h-8 transition-all active:scale-95 cursor-pointer"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add Living Room TV Profile
                                    </Button>
                                ) : (
                                    <div className="text-[10px] text-muted-foreground italic text-center">
                                        Included slot in use. Enable extra living room add-on for more.
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* KIDS PROFILES COLUMN */}
                        <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-xs text-foreground uppercase tracking-wider flex items-center gap-1.5">
                                        <Baby className="h-4 w-4 text-purple-400" /> Kids Account
                                    </span>
                                    <Badge variant="outline" className="text-[10px] text-purple-300 border-purple-500/30 bg-purple-500/10">
                                        PG Safe • Curated
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-muted-foreground leading-relaxed">
                                    Automatically limited to Kids-only server libraries, enforcing a strict PG rating ceiling with adult, horror, and violent content hidden.
                                </p>

                                {/* EXISTING KIDS SUBS */}
                                <div className="space-y-2">
                                    {subAccounts.filter(s => s.accountType === "KID").map(sub => (
                                        <div key={sub.id} className="p-2.5 rounded-lg bg-purple-950/20 border border-purple-500/30 flex items-center justify-between gap-2">
                                            <div className="space-y-0.5 min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-xs font-bold text-foreground truncate">{sub.subAccountLabel || "Kids Account"}</span>
                                                    <Badge variant="outline" className="text-[9px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Active</Badge>
                                                </div>
                                                <p className="text-[11px] font-mono text-muted-foreground truncate">{sub.plexUsername || sub.plexEmail}</p>
                                                <span className="inline-flex items-center text-[10px] text-purple-300/90 font-medium">
                                                    👶 PG Safe • Kids Only Server
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 shrink-0">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleOpenEditSubAccount(sub)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground cursor-pointer"
                                                    title="Edit Profile"
                                                >
                                                    <Edit2 className="h-3.5 w-3.5" />
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setDeleteSubConfirmId(sub.id)}
                                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 cursor-pointer"
                                                    title="Remove Sub-Account"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="pt-2">
                                {subAccounts.filter(s => s.accountType === "KID").length < subLimits.includedKids ? (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleOpenAddSubAccount("KID")}
                                        className="w-full text-xs font-semibold bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border-purple-500/30 gap-1.5 h-8 transition-all active:scale-95 cursor-pointer"
                                    >
                                        <Plus className="h-3.5 w-3.5" /> Add Kids Profile
                                    </Button>
                                ) : (
                                    <div className="text-[10px] text-muted-foreground italic text-center">
                                        Included slot in use. Enable extra kids profile add-on for more.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ACCOUNT ADD-ONS & FEATURES CARD */}
            <Card id="addons" className="border-amber-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Zap className="h-5 w-5 text-amber-400" /> Account Add-Ons & Features
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Enable optional features, live streaming channels, and extra household profile slots.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs w-fit">
                            {userEnabledAddons.length} Enabled
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="space-y-4">
                    {addonMsg && (
                        <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{addonMsg}</span>
                        </div>
                    )}
                    {addonErr && (
                        <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                            <XCircle className="h-4 w-4 shrink-0" />
                            <span>{addonErr}</span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {addonsCatalog.map((addon) => {
                            const isEnabled = userEnabledAddons.includes(addon.id);
                            const isToggling = togglingAddonId === addon.id;
                            const isFree = addon.isFree || addon.price === 0;

                            return (
                                <div 
                                    key={addon.id}
                                    className={`p-3.5 rounded-xl border flex flex-col justify-between gap-3 transition-all ${
                                        isEnabled 
                                            ? "bg-amber-500/[0.06] border-amber-500/40" 
                                            : "bg-white/[0.02] border-white/[0.06]"
                                    }`}
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                {addon.icon === "tv" ? (
                                                    <Tv className="h-4 w-4 text-cyan-400" />
                                                ) : addon.icon === "baby" ? (
                                                    <Baby className="h-4 w-4 text-purple-400" />
                                                ) : addon.icon === "monitor" ? (
                                                    <Monitor className="h-4 w-4 text-indigo-400" />
                                                ) : addon.icon === "sparkles" ? (
                                                    <Sparkles className="h-4 w-4 text-amber-400" />
                                                ) : (
                                                    <Zap className="h-4 w-4 text-primary" />
                                                )}
                                                <span className="font-bold text-xs text-foreground">{addon.name}</span>
                                            </div>
                                            {isFree ? (
                                                <Badge variant="outline" className="text-[10px] bg-emerald-500/15 text-emerald-400 border-emerald-500/30 font-semibold shrink-0">
                                                    ✨ Free
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-400 border-amber-500/30 font-semibold shrink-0">
                                                    ${addon.price}/mo
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                                            {addon.description}
                                        </p>
                                    </div>

                                    <div className="pt-2 flex items-center justify-between border-t border-border/30">
                                        <span className="text-[11px] font-medium text-muted-foreground">
                                            {isEnabled ? (
                                                <span className="text-emerald-400 flex items-center gap-1">
                                                    <Check className="h-3 w-3" /> Active
                                                </span>
                                            ) : (
                                                <span>Inactive</span>
                                            )}
                                        </span>
                                        {isFree ? (
                                            <div className="flex items-center gap-2">
                                                {isToggling && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" />}
                                                <Switch
                                                    checked={isEnabled}
                                                    disabled={isToggling}
                                                    onCheckedChange={(checked) => handleToggleFreeAddon(addon.id, checked)}
                                                />
                                            </div>
                                        ) : (
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setUpgradeModalOpen(true);
                                                    setTargetTier(addon.id);
                                                    setUpgradeNote(`Interested in activating add-on: ${addon.name}`);
                                                }}
                                                className="text-xs h-7 px-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30 cursor-pointer"
                                            >
                                                Request Add-On
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* NOTIFICATION PREFERENCES CARD */}
            <Card id="notifications" className="border-cyan-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Bell className="h-5 w-5 text-cyan-400" /> Notification & Email Preferences
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Choose which updates you want to receive via Email and Discord webhook alerts.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-xs w-fit">
                            Live Alerts
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveNotifications} className="space-y-4">
                        {notifMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{notifMsg}</span>
                            </div>
                        )}
                        {notifErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{notifErr}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* EMAIL PREFERENCES */}
                            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                                <div className="flex items-center gap-2 font-bold text-xs text-foreground uppercase tracking-wider">
                                    <Mail className="h-4 w-4 text-primary" />
                                    <span>Email Notifications</span>
                                </div>

                                <div className="space-y-2.5 text-xs">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="notif-media-ready" className="text-xs cursor-pointer">
                                            <span>Media Ready & Downloaded</span>
                                            <p className="text-[10px] text-muted-foreground">When your movie/show/book request is ready</p>
                                        </Label>
                                        <Switch 
                                            id="notif-media-ready"
                                            checked={notifPrefs.emailMediaReady} 
                                            onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailMediaReady: val })} 
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                        <Label htmlFor="notif-new-content" className="text-xs cursor-pointer">
                                            <span>New Library Content</span>
                                            <p className="text-[10px] text-muted-foreground">Weekly digests of newly added movies & shows</p>
                                        </Label>
                                        <Switch 
                                            id="notif-new-content"
                                            checked={notifPrefs.emailNewContent} 
                                            onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailNewContent: val })} 
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                        <Label htmlFor="notif-announcements" className="text-xs cursor-pointer">
                                            <span>Server Announcements</span>
                                            <p className="text-[10px] text-muted-foreground">Maintenance notices and feature releases</p>
                                        </Label>
                                        <Switch 
                                            id="notif-announcements"
                                            checked={notifPrefs.emailAnnouncements} 
                                            onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailAnnouncements: val })} 
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                        <Label htmlFor="notif-sub-reminders" className="text-xs cursor-pointer">
                                            <span>Subscription Reminders</span>
                                            <p className="text-[10px] text-muted-foreground">Annual renewal & expiration notices</p>
                                        </Label>
                                        <Switch 
                                            id="notif-sub-reminders"
                                            checked={notifPrefs.emailSubscriptionReminders} 
                                            onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailSubscriptionReminders: val })} 
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                        <Label htmlFor="notif-referral" className="text-xs cursor-pointer">
                                            <span>Referral Rewards</span>
                                            <p className="text-[10px] text-muted-foreground">Alerts when invited friends join or subscribe</p>
                                        </Label>
                                        <Switch 
                                            id="notif-referral"
                                            checked={notifPrefs.emailReferralRewards} 
                                            onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, emailReferralRewards: val })} 
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* DISCORD WEBHOOK ALERTS */}
                            <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 flex flex-col justify-between">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 font-bold text-xs text-foreground uppercase tracking-wider">
                                        <MessageSquare className="h-4 w-4 text-indigo-400" />
                                        <span>Discord Webhook Alerts</span>
                                    </div>

                                    <div className="space-y-2.5 text-xs">
                                        <div className="flex items-center justify-between">
                                            <Label htmlFor="notif-discord-ready" className="text-xs cursor-pointer">
                                                <span>Discord Media Ready Alerts</span>
                                                <p className="text-[10px] text-muted-foreground">Send to your personal Discord channel</p>
                                            </Label>
                                            <Switch 
                                                id="notif-discord-ready"
                                                checked={notifPrefs.discordMediaReady} 
                                                onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, discordMediaReady: val })} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                            <Label htmlFor="notif-discord-announcements" className="text-xs cursor-pointer">
                                                <span>Discord Server News</span>
                                                <p className="text-[10px] text-muted-foreground">Channel alerts for major server updates</p>
                                            </Label>
                                            <Switch 
                                                id="notif-discord-announcements"
                                                checked={notifPrefs.discordAnnouncements} 
                                                onCheckedChange={(val) => setNotifPrefs({ ...notifPrefs, discordAnnouncements: val })} 
                                            />
                                        </div>

                                        <div className="space-y-1.5 pt-1 border-t border-border/30">
                                            <Label htmlFor="notif-webhook-url" className="text-xs font-semibold">Discord Webhook URL (Optional)</Label>
                                            <Input 
                                                id="notif-webhook-url"
                                                type="url"
                                                placeholder="https://discord.com/api/webhooks/..." 
                                                value={notifPrefs.discordWebhookUrl}
                                                onChange={(e) => setNotifPrefs({ ...notifPrefs, discordWebhookUrl: e.target.value })}
                                                className="bg-background/80 text-xs font-mono"
                                            />
                                        </div>
                                    </div>
                                </div>

                                <p className="text-[10px] text-muted-foreground italic pt-2">
                                    Create a webhook in Discord: Server Settings &gt; Integrations &gt; Webhooks.
                                </p>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={savingNotif}
                            className="w-full sm:w-auto font-bold text-xs h-9 bg-cyan-600 hover:bg-cyan-500 text-white gap-2 transition-all hover:ring-2 hover:ring-cyan-400/40 active:scale-95"
                        >
                            {savingNotif ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                            Save Notification Preferences
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* CONTENT SAFETY & FAMILY PROFILE CARD */}
            <Card id="safety" className="border-amber-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-3xl -z-10 pointer-events-none" />
                <CardHeader className="pb-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                            <CardTitle className="text-lg font-bold flex items-center gap-2 text-foreground">
                                <Shield className="h-5 w-5 text-amber-400" /> Content Safety & Family Profile
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Configure parental rating ceilings, genre exclusions, and child-safe viewing filters.
                            </CardDescription>
                        </div>
                        <Badge variant="outline" className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs w-fit">
                            Parental Control
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveContentSafety} className="space-y-4">
                        {contentMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{contentMsg}</span>
                            </div>
                        )}
                        {contentErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2 animate-in fade-in">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{contentErr}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <Label className="text-xs font-semibold">Maximum Content Rating Ceiling</Label>
                                <Select 
                                    value={contentPrefs.maxContentRating} 
                                    onValueChange={(val) => setContentPrefs({ ...contentPrefs, maxContentRating: val })}
                                >
                                    <SelectTrigger className="bg-background/80 text-xs">
                                        <SelectValue placeholder="Rating limit" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">ALL (No Content Rating Filter)</SelectItem>
                                        <SelectItem value="G">G / TV-Y / TV-G (Young Children)</SelectItem>
                                        <SelectItem value="PG">PG / TV-PG (Parental Guidance)</SelectItem>
                                        <SelectItem value="PG-13">PG-13 / TV-14 (Teens 13+)</SelectItem>
                                        <SelectItem value="R">R / TV-MA (Mature 17+)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <p className="text-[11px] text-muted-foreground">Titles exceeding this rating are hidden from discovery and search.</p>
                            </div>

                            <div className="space-y-2 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider block">Explicit Content Filters</span>
                                
                                <div className="space-y-2 text-xs">
                                    <div className="flex items-center justify-between">
                                        <Label htmlFor="safety-hide-horror" className="text-xs cursor-pointer">
                                            <span>Hide Horror Genre</span>
                                        </Label>
                                        <Switch 
                                            id="safety-hide-horror"
                                            checked={contentPrefs.hideHorror} 
                                            onCheckedChange={(val) => setContentPrefs({ ...contentPrefs, hideHorror: val })} 
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                        <Label htmlFor="safety-hide-nsfw" className="text-xs cursor-pointer">
                                            <span>Hide Adult / NSFW Content</span>
                                        </Label>
                                        <Switch 
                                            id="safety-hide-nsfw"
                                            checked={contentPrefs.hideNsfw} 
                                            onCheckedChange={(val) => setContentPrefs({ ...contentPrefs, hideNsfw: val })} 
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                        <Label htmlFor="safety-hide-gore" className="text-xs cursor-pointer">
                                            <span>Hide Extreme Gore / Violence</span>
                                        </Label>
                                        <Switch 
                                            id="safety-hide-gore"
                                            checked={contentPrefs.hideGore} 
                                            onCheckedChange={(val) => setContentPrefs({ ...contentPrefs, hideGore: val })} 
                                        />
                                    </div>

                                    <div className="flex items-center justify-between pt-1 border-t border-border/30">
                                        <Label htmlFor="safety-hide-leaving" className="text-xs cursor-pointer">
                                            <span>Hide Leaving Soon Badges</span>
                                        </Label>
                                        <Switch 
                                            id="safety-hide-leaving"
                                            checked={contentPrefs.hideLeavingSoon} 
                                            onCheckedChange={(val) => setContentPrefs({ ...contentPrefs, hideLeavingSoon: val })} 
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={savingContent}
                            className="w-full sm:w-auto font-bold text-xs h-9 bg-amber-600 hover:bg-amber-500 text-white gap-2 transition-all hover:ring-2 hover:ring-amber-400/40 active:scale-95"
                        >
                            {savingContent ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                            Save Content Safety Settings
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* SEND-TO-KINDLE DELIVERY CARD */}
            <Card id="kindle" className="border-amber-500/30 bg-[#121218]/80 backdrop-blur-md shadow-sm relative overflow-hidden scroll-mt-6">
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
                <Card id="details" className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm scroll-mt-6">
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
                <Card id="password" className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm scroll-mt-6">
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

            {/* MEMBERSHIP TIER UPGRADE REQUEST MODAL */}
            <Dialog open={upgradeModalOpen} onOpenChange={setUpgradeModalOpen}>
                <DialogContent className="sm:max-w-md bg-slate-950 border border-slate-800 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                            <Sparkles className="h-5 w-5 text-indigo-400" /> Request Membership Tier Upgrade
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Select the target membership tier you would like to upgrade to. An administrator will review your account and confirm activation.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSubmitUpgrade} className="space-y-4 py-2">
                        {upgradeSuccessMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{upgradeSuccessMsg}</span>
                            </div>
                        )}
                        {upgradeErrMsg && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{upgradeErrMsg}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Desired Membership Tier</Label>
                            <Select value={targetTier} onValueChange={setTargetTier}>
                                <SelectTrigger className="bg-background/80 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="PREMIUM_4K">💎 4K UHD Dedicated Streams & Transcoding</SelectItem>
                                    <SelectItem value="VIP_ALL_ACCESS">👑 VIP All-Access (4K + Live TV / IPTV + Unlimited)</SelectItem>
                                    <SelectItem value="FAMILY">👨‍👩‍👧‍👦 Family Tier (Multi-Profile + Kid Locks)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Note / Special Requests (Optional)</Label>
                            <Textarea 
                                rows={3}
                                placeholder="e.g. Looking for Apple TV 4K HDR playback and Live TV access."
                                value={upgradeNote}
                                onChange={(e) => setUpgradeNote(e.target.value)}
                                className="bg-background/80 text-xs"
                            />
                        </div>

                        <DialogFooter className="pt-2 flex sm:justify-between gap-2">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setUpgradeModalOpen(false)}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                size="sm" 
                                disabled={submittingUpgrade}
                                className="font-bold text-xs bg-indigo-600 hover:bg-indigo-500 text-white gap-1.5"
                            >
                                {submittingUpgrade ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                Submit Upgrade Request
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* SUB-ACCOUNT ADD / EDIT MODAL */}
            <Dialog open={subModalOpen} onOpenChange={setSubModalOpen}>
                <DialogContent className="sm:max-w-md bg-slate-950 border border-slate-800 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                            <Users className="h-5 w-5 text-purple-400" />
                            {subEditingId ? "Edit Household Sub-Account" : "Add Household Sub-Account"}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Set up a nested profile for family members or shared living room devices.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleSaveSubAccount} className="space-y-4 py-2">
                        {subModalMsg && (
                            <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                <span>{subModalMsg}</span>
                            </div>
                        )}
                        {subModalErr && (
                            <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                <XCircle className="h-4 w-4 shrink-0" />
                                <span>{subModalErr}</span>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Profile Type & Content Policy</Label>
                            <Select value={subType} onValueChange={(val: any) => setSubType(val)}>
                                <SelectTrigger className="bg-background/80 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="LIVING_ROOM">📺 Living Room TV (Severe Nudity Excluded)</SelectItem>
                                    <SelectItem value="KID">👶 Kids Account (Kids-Only Server & PG Ceiling)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Profile Name / Device Label</Label>
                            <Input
                                required
                                placeholder={subType === "KID" ? "e.g. Timmy's Tablet" : "e.g. Living Room Apple TV"}
                                value={subLabel}
                                onChange={(e) => setSubLabel(e.target.value)}
                                className="bg-background/80 text-xs"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Plex Username or Plex Email</Label>
                            <Input
                                required
                                placeholder="e.g. user@gmail.com or PlexUsername"
                                value={subPlexHandle}
                                onChange={(e) => setSubPlexHandle(e.target.value)}
                                className="bg-background/80 text-xs font-mono"
                            />
                            <p className="text-[10px] text-muted-foreground">
                                An automated Plex friend invite with curated libraries will be dispatched to this Plex user.
                            </p>
                        </div>

                        <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-muted-foreground space-y-1">
                            <span className="font-bold text-foreground text-xs block">
                                {subType === "KID" ? "🧸 Kids Protection Policy" : "📺 Living Room Policy"}
                            </span>
                            <p>
                                {subType === "KID"
                                    ? "Restricted to the dedicated Kids library pool with maximum PG rating ceiling and horror/NSFW/gore content automatically hidden."
                                    : "Shares your default library sections with IMDb Severe Nudity tags filtered out by default."
                                }
                            </p>
                        </div>

                        <DialogFooter className="pt-2 flex sm:justify-between gap-2">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setSubModalOpen(false)}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button 
                                type="submit" 
                                size="sm" 
                                disabled={savingSub}
                                className="font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white gap-1.5 cursor-pointer"
                            >
                                {savingSub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                {subEditingId ? "Update Sub-Account" : "Create Sub-Account"}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* DELETE SUB-ACCOUNT CONFIRM DIALOG */}
            <Dialog open={Boolean(deleteSubConfirmId)} onOpenChange={(open) => !open && setDeleteSubConfirmId(null)}>
                <DialogContent className="sm:max-w-md bg-slate-950 border border-slate-800 shadow-2xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                            <AlertTriangle className="h-5 w-5 text-red-400" /> Remove Household Sub-Account?
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Are you sure you want to remove this sub-account? This will immediately revoke their Plex server access and delete the sub-profile.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="pt-2 flex sm:justify-between gap-2">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => setDeleteSubConfirmId(null)}
                            className="text-xs"
                        >
                            Cancel
                        </Button>
                        <Button 
                            type="button" 
                            size="sm" 
                            variant="destructive"
                            disabled={deletingSub}
                            onClick={() => deleteSubConfirmId && handleDeleteSubAccount(deleteSubConfirmId)}
                            className="font-bold text-xs gap-1.5 cursor-pointer"
                        >
                            {deletingSub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Confirm Removal
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
