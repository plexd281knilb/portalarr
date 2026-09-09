"use client";

import { useState, useEffect } from "react";
import { 
    getAppUsers, 
    createAppUser, 
    deleteAppUser, 
    approveAppUser, 
    rejectAppUser, 
    syncPlexFriendsAction, 
    updateAppUserRole, 
    updateAppUserKindleEmail, 
    adminResetUserPassword, 
    approveAllPendingAppUsers,
    fetchPlexServerLibraries,
    fetchUserPlexLibrariesAction,
    updateUserPlexLibraries,
    setUserTrialOrSubscription,
    markUserConverted,
    getReferralStats,
    getPaymentAndTrialSettings,
    savePaymentAndTrialSettings
} from "@/app/actions";
import { changeUserPassword } from "@/app/auth-actions";
import { calculateProratedBilling } from "@/lib/prorated-billing";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { 
    Trash2, UserPlus, Shield, User, Mail, CheckCircle2, XCircle, 
    Clock, Play, RefreshCw, Loader2, KeyRound, Search, CheckCheck, Send, Edit2,
    Layers, Timer, Gift, Trophy, DollarSign, CreditCard, Sparkles, AlertTriangle,
    FolderCheck, ShieldAlert, Check, Users, ArrowUpRight, Copy, Calculator, Calendar, Monitor, Server, PauseCircle
} from "lucide-react";
import { format, differenceInDays } from "date-fns";

export default function AccessSettingsPage() {
    const [activeTab, setActiveTab] = useState("users");
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingPlex, setSyncingPlex] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "TRIAL" | "INACTIVE">("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    // Plex Libraries & Shares state
    const [serverLibraries, setServerLibraries] = useState<any[]>([]);
    const [loadingLibraries, setLoadingLibraries] = useState(false);

    // Manage Libraries Modal state
    const [libModalUser, setLibModalUser] = useState<any | null>(null);
    const [userSelectedKeys, setUserSelectedKeys] = useState<string[]>([]);
    const [loadingUserLibs, setLoadingUserLibs] = useState(false);
    const [savingUserLibs, setSavingUserLibs] = useState(false);
    const [libSuccessMsg, setLibSuccessMsg] = useState("");
    const [libErrMsg, setLibErrMsg] = useState("");

    // Suspended User Activation Confirmation Modal state
    const [showActivationPrompt, setShowActivationPrompt] = useState(false);
    const [pendingLibSaveKeys, setPendingLibSaveKeys] = useState<string[]>([]);
    const [selectedActivationType, setSelectedActivationType] = useState<"APPROVED" | "TRIAL" | "30_DAYS" | "KEEP_SUSPENDED">("APPROVED");

    // Manage Trial / Subscription Modal state
    const [subModalUser, setSubModalUser] = useState<any | null>(null);
    const [subActionLoading, setSubActionLoading] = useState(false);
    const [subSuccessMsg, setSubSuccessMsg] = useState("");
    const [subErrMsg, setSubErrMsg] = useState("");

    // Referral Stats & Leaderboard state
    const [referralStats, setReferralStats] = useState<any>(null);
    const [loadingReferrals, setLoadingReferrals] = useState(false);

    // Payment & Onboarding Defaults state
    const [paymentSettings, setPaymentSettings] = useState({
        defaultTrialDays: 14,
        defaultPlexLibraries: "",
        paymentPaypal: "",
        paymentVenmo: "",
        paymentCashApp: "",
        paymentZelle: "",
        paymentInstructions: "",
        subscriptionPrice: "$180 / year",
        yearlyPrice: 180,
        monthlyPrice: 15,
        renewalMonth: 1,
        renewalDay: 1,
        billingType: "YEARLY_PRORATED",
        requireReferralForSignup: false
    });
    const [defaultSelectedKeys, setDefaultSelectedKeys] = useState<string[]>([]);
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsSuccessMsg, setSettingsSuccessMsg] = useState("");
    const [settingsErrMsg, setSettingsErrMsg] = useState("");

    // Change Password state
    const [passCurrent, setPassCurrent] = useState("");
    const [passNew, setPassNew] = useState("");
    const [passMsg, setPassMsg] = useState("");
    const [passErr, setPassErr] = useState("");
    const [passLoading, setPassLoading] = useState(false);

    // Admin Reset Password state for target user
    const [resetModalUserId, setResetModalUserId] = useState<string | null>(null);
    const [adminNewPass, setAdminNewPass] = useState("");
    const [adminResetMsg, setAdminResetMsg] = useState("");
    const [adminResetErr, setAdminResetErr] = useState("");
    const [adminResetLoading, setAdminResetLoading] = useState(false);

    // Inline Edit Kindle Email state
    const [editingKindleUserId, setEditingKindleUserId] = useState<string | null>(null);
    const [kindleEmailInput, setKindleEmailInput] = useState("");

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await getAppUsers();
            setUsers(data || []);
        } catch (e) {
            console.error("loadUsers error:", e);
        } finally {
            setLoading(false);
        }
    };

    const loadLibraries = async () => {
        setLoadingLibraries(true);
        try {
            const res = await fetchPlexServerLibraries();
            if (res && res.success && res.servers) {
                setServerLibraries(res.servers);
            }
        } catch (e) {
            console.error("loadLibraries error:", e);
        } finally {
            setLoadingLibraries(false);
        }
    };

    const loadReferrals = async () => {
        setLoadingReferrals(true);
        try {
            const res = await getReferralStats();
            if (res && res.success && res.stats) {
                setReferralStats(res.stats);
            }
        } catch (e) {
            console.error("loadReferrals error:", e);
        } finally {
            setLoadingReferrals(false);
        }
    };

    const loadPaymentSettings = async () => {
        try {
            const res = await getPaymentAndTrialSettings();
            if (res && res.success && res.settings) {
                setPaymentSettings(res.settings);
                if (res.settings.defaultPlexLibraries) {
                    const keys = res.settings.defaultPlexLibraries
                        .split(",")
                        .map((s: string) => s.trim())
                        .filter(Boolean);
                    setDefaultSelectedKeys(keys);
                }
            }
        } catch (e) {
            console.error("loadPaymentSettings error:", e);
        }
    };

    useEffect(() => {
        loadUsers();
        loadLibraries();
        loadReferrals();
        loadPaymentSettings();

        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const search = params.get("search");
            if (search) setSearchQuery(search);
            const tab = params.get("tab");
            if (tab && ["users", "referrals", "onboarding"].includes(tab)) {
                setActiveTab(tab);
            }
        }
    }, []);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        await createAppUser(formData);
        (e.target as HTMLFormElement).reset();
        loadUsers();
    };

    const handleSyncPlex = async () => {
        setSyncingPlex(true);
        setSyncMessage("");
        const res = await syncPlexFriendsAction();
        setSyncingPlex(false);
        if (res.success) {
            setSyncMessage(`Synced ${res.totalFriends} Plex friends (${res.addedCount} added, ${res.updatedCount} updated, ${res.revokedCount} revoked).`);
            loadUsers();
            loadLibraries();
        } else {
            setSyncMessage(res.error || "Failed to sync Plex friends.");
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
            setPassMsg(res.message || "Password updated!");
            setPassCurrent("");
            setPassNew("");
        }
    };

    const handleApprove = async (id: string) => {
        await approveAppUser(id);
        loadUsers();
    };

    const handleReject = async (id: string) => {
        await rejectAppUser(id);
        loadUsers();
    };

    const handleDelete = async (id: string) => {
        if (confirm("Delete this user? They will lose access immediately.")) {
            await deleteAppUser(id);
            loadUsers();
            loadReferrals();
        }
    };

    const handleRoleChange = async (userId: string, newRole: string) => {
        await updateAppUserRole(userId, newRole);
        loadUsers();
    };

    const handleSaveKindleEmail = async (userId: string) => {
        await updateAppUserKindleEmail(userId, kindleEmailInput);
        setEditingKindleUserId(null);
        setKindleEmailInput("");
        loadUsers();
    };

    const handleAdminResetPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!resetModalUserId) return;
        setAdminResetLoading(true);
        setAdminResetMsg("");
        setAdminResetErr("");

        const res = await adminResetUserPassword(resetModalUserId, adminNewPass);
        setAdminResetLoading(false);
        if (res.success) {
            setAdminResetMsg("User password successfully updated!");
            setAdminNewPass("");
            setTimeout(() => {
                setResetModalUserId(null);
                setAdminResetMsg("");
            }, 1500);
        } else {
            setAdminResetErr(res.error || "Failed to reset password.");
        }
    };

    const handleApproveAllPending = async () => {
        if (confirm("Approve all pending user account requests?")) {
            const res = await approveAllPendingAppUsers();
            if (res.success) {
                loadUsers();
            }
        }
    };

    // Open Manage Libraries Modal for a user
    const handleOpenLibrariesModal = async (user: any) => {
        setLibModalUser(user);
        setLibSuccessMsg("");
        setLibErrMsg("");
        setLoadingUserLibs(true);

        const normalizeKeyList = (keys: string[]) => {
            return keys.map(k => {
                if (k.includes(":")) return k;
                const matchedServer = serverLibraries.find(s => (s.sections || []).some((sec: any) => String(sec.id) === k));
                if (matchedServer) {
                    return `${matchedServer.serverId}:${k}`;
                }
                if (serverLibraries.length > 0) {
                    return `${serverLibraries[0].serverId}:${k}`;
                }
                return k;
            });
        };

        // Pre-fill initial keys from user record or onboarding default
        let initialKeys: string[] = [];
        if (user.plexLibrarySectionIds) {
            initialKeys = normalizeKeyList(user.plexLibrarySectionIds
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean));
        } else if (paymentSettings.defaultPlexLibraries) {
            initialKeys = normalizeKeyList(paymentSettings.defaultPlexLibraries
                .split(",")
                .map((s: string) => s.trim())
                .filter(Boolean));
        }
        setUserSelectedKeys(initialKeys);

        // Fetch live shared library sections directly from Plex
        try {
            const res = await fetchUserPlexLibrariesAction(user.id);
            if (res.success && Array.isArray(res.selectedKeys)) {
                if (res.hasPlexShare || initialKeys.length === 0) {
                    setUserSelectedKeys(normalizeKeyList(res.selectedKeys));
                }
            }
        } catch (e) {
            console.warn("Could not query Plex for user libraries:", e);
        } finally {
            setLoadingUserLibs(false);
        }
    };

    const isSectionSelected = (serverId: string, sectionId: number | string) => {
        const fullKey = `${serverId}:${sectionId}`;
        const rawKey = String(sectionId);
        if (userSelectedKeys.includes(fullKey)) return true;
        if (userSelectedKeys.includes(rawKey)) {
            const matches = serverLibraries.filter(s => (s.sections || []).some((sec: any) => String(sec.id) === rawKey));
            if (matches.length === 1 && matches[0].serverId === serverId) return true;
            if (matches.length > 1 && serverLibraries[0]?.serverId === serverId) return true;
        }
        return false;
    };

    const handleToggleUserSection = (serverId: string, sectionId: number | string) => {
        const fullKey = `${serverId}:${sectionId}`;
        const rawKey = String(sectionId);
        setUserSelectedKeys(prev => {
            const isCurrentlySelected = isSectionSelected(serverId, sectionId);
            if (isCurrentlySelected) {
                return prev.filter(k => k !== fullKey && k !== rawKey);
            } else {
                return [...prev.filter(k => k !== rawKey), fullKey];
            }
        });
    };

    const handleToggleAllServerSections = (serverId: string, selectAll: boolean) => {
        const server = serverLibraries.find(s => s.serverId === serverId);
        if (!server) return;
        const serverKeys = (server.sections || []).map((sec: any) => `${serverId}:${sec.id}`);
        const serverRawIds = (server.sections || []).map((sec: any) => String(sec.id));
        
        setUserSelectedKeys(prev => {
            const otherServerKeys = prev.filter(k => !k.startsWith(`${serverId}:`) && !serverRawIds.includes(k));
            return selectAll ? [...otherServerKeys, ...serverKeys] : otherServerKeys;
        });
    };

    const handleSelectAllSections = () => {
        setUserSelectedKeys(allUniqueKeys);
    };

    const handleDeselectAllSections = () => {
        setUserSelectedKeys([]);
    };

    const isDefaultSelected = (serverId: string, sectionId: number | string) => {
        const fullKey = `${serverId}:${sectionId}`;
        const rawKey = String(sectionId);
        if (defaultSelectedKeys.includes(fullKey)) return true;
        if (defaultSelectedKeys.includes(rawKey)) {
            const matches = serverLibraries.filter(s => (s.sections || []).some((sec: any) => String(sec.id) === rawKey));
            if (matches.length === 1 && matches[0].serverId === serverId) return true;
            if (matches.length > 1 && serverLibraries[0]?.serverId === serverId) return true;
        }
        return false;
    };

    const handleToggleDefaultSection = (serverId: string, sectionId: number | string) => {
        const fullKey = `${serverId}:${sectionId}`;
        const rawKey = String(sectionId);
        setDefaultSelectedKeys(prev => {
            const isCurrentlySelected = isDefaultSelected(serverId, sectionId);
            if (isCurrentlySelected) {
                return prev.filter(k => k !== fullKey && k !== rawKey);
            } else {
                return [...prev.filter(k => k !== rawKey), fullKey];
            }
        });
    };

    const handleSaveUserLibraries = async () => {
        if (!libModalUser) return;

        // Normalize keys before saving
        const normalizedKeys = userSelectedKeys.map(k => {
            if (k.includes(":")) return k;
            if (serverLibraries.length > 0) return `${serverLibraries[0].serverId}:${k}`;
            return k;
        });

        // If user is currently suspended or expired and at least 1 library is selected:
        // prompt the admin with activation options before saving and granting access.
        if ((libModalUser.status === "SUSPENDED" || libModalUser.status === "EXPIRED") && normalizedKeys.length > 0) {
            setPendingLibSaveKeys(normalizedKeys);
            setSelectedActivationType("APPROVED");
            setShowActivationPrompt(true);
            return;
        }

        await executeSaveUserLibraries(normalizedKeys);
    };

    const executeSaveUserLibraries = async (
        normalizedKeys: string[], 
        activationType?: "APPROVED" | "TRIAL" | "30_DAYS" | "KEEP_SUSPENDED"
    ) => {
        if (!libModalUser) return;
        setSavingUserLibs(true);
        setLibSuccessMsg("");
        setLibErrMsg("");

        const res = await updateUserPlexLibraries(libModalUser.id, normalizedKeys, activationType);
        setSavingUserLibs(false);
        setShowActivationPrompt(false);
        if (res.success) {
            setLibSuccessMsg(res.message || "Plex libraries updated successfully!");
            loadUsers();
            setTimeout(() => {
                setLibModalUser(null);
                setLibSuccessMsg("");
            }, 1200);
        } else {
            setLibErrMsg(res.error || "Failed to update libraries on Plex.");
        }
    };

    // Handle Trial & Subscription updates
    const handleSetTrialOrSub = async (
        type: "TRIAL" | "7_DAYS_TRIAL" | "14_DAYS_TRIAL" | "REST_OF_YEAR" | "30_DAYS" | "1_YEAR" | "PERMANENT" | "SUSPENDED" | "EXPIRED"
    ) => {
        if (!subModalUser) return;
        setSubActionLoading(true);
        setSubSuccessMsg("");
        setSubErrMsg("");

        const res = await setUserTrialOrSubscription(subModalUser.id, type);
        setSubActionLoading(false);
        if (res.success) {
            setSubSuccessMsg(res.message || "Access updated successfully!");
            loadUsers();
            loadReferrals();
            setTimeout(() => {
                setSubModalUser(null);
                setSubSuccessMsg("");
            }, 1200);
        } else {
            setSubErrMsg(res.error || "Failed to update status.");
        }
    };

    const handleMarkUserConverted = async () => {
        if (!subModalUser) return;
        setSubActionLoading(true);
        const res = await markUserConverted(subModalUser.id);
        setSubActionLoading(false);
        if (res.success) {
            setSubSuccessMsg("User marked as converted! Referral stats updated.");
            loadUsers();
            loadReferrals();
            setTimeout(() => {
                setSubModalUser(null);
                setSubSuccessMsg("");
            }, 1200);
        } else {
            setSubErrMsg(res.error || "Failed to mark converted.");
        }
    };

    // Save Payment & Onboarding Defaults
    const handleSaveOnboardingSettings = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingSettings(true);
        setSettingsSuccessMsg("");
        setSettingsErrMsg("");

        const formData = new FormData();
        formData.append("defaultTrialDays", String(paymentSettings.defaultTrialDays));
        formData.append("defaultPlexLibraries", defaultSelectedKeys.join(","));
        formData.append("paymentPaypal", paymentSettings.paymentPaypal);
        formData.append("paymentVenmo", paymentSettings.paymentVenmo);
        formData.append("paymentCashApp", paymentSettings.paymentCashApp);
        formData.append("paymentZelle", paymentSettings.paymentZelle);
        formData.append("paymentInstructions", paymentSettings.paymentInstructions);
        formData.append("subscriptionPrice", paymentSettings.subscriptionPrice);
        formData.append("yearlyPrice", String(paymentSettings.yearlyPrice));
        formData.append("monthlyPrice", String(paymentSettings.monthlyPrice));
        formData.append("renewalMonth", String(paymentSettings.renewalMonth));
        formData.append("renewalDay", String(paymentSettings.renewalDay));
        formData.append("billingType", paymentSettings.billingType);
        formData.append("requireReferralForSignup", String(paymentSettings.requireReferralForSignup));

        const res = await savePaymentAndTrialSettings(formData);
        setSavingSettings(false);
        if (res.success) {
            setSettingsSuccessMsg(res.message || "Payment & Trial settings saved successfully!");
        } else {
            setSettingsErrMsg(res.error || "Failed to save settings.");
        }
    };

    const pendingUsersCount = users.filter(u => u.status === "PENDING").length;

    // Filter users
    const filteredUsers = users.filter(u => {
        const matchStatus = 
            filterStatus === "ALL" ? true :
            filterStatus === "PENDING" ? u.status === "PENDING" :
            filterStatus === "APPROVED" ? (u.status === "APPROVED" || !u.status) :
            filterStatus === "TRIAL" ? u.status === "TRIAL" :
            filterStatus === "INACTIVE" ? (u.status === "SUSPENDED" || u.status === "EXPIRED" || u.status === "REJECTED") : true;

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q || 
            u.username.toLowerCase().includes(q) || 
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.kindleEmail && u.kindleEmail.toLowerCase().includes(q)) ||
            (u.referredBy?.username && u.referredBy.username.toLowerCase().includes(q)) ||
            u.role.toLowerCase().includes(q);

        return matchStatus && matchSearch;
    });

    // Helper to calculate trial days left
    const getDaysLeft = (endsAt: string | null) => {
        if (!endsAt) return 0;
        const diff = differenceInDays(new Date(endsAt), new Date());
        return Math.max(0, diff);
    };

    // Flatten all unique composite keys across servers
    const allUniqueKeys: string[] = serverLibraries.flatMap(srv => (srv.sections || []).map((sec: any) => `${srv.serverId}:${sec.id}`));
    const totalLibrariesCount = allUniqueKeys.length;
    const allSections = serverLibraries.flatMap(s => s.sections || []);

    // Live calculation for preview
    const liveProrated = calculateProratedBilling({
        startDate: new Date(),
        trialDays: paymentSettings.defaultTrialDays,
        yearlyPrice: paymentSettings.yearlyPrice,
        monthlyPrice: paymentSettings.monthlyPrice,
        renewalMonth: paymentSettings.renewalMonth,
        renewalDay: paymentSettings.renewalDay
    });

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h3 className="text-xl font-bold tracking-tight text-emerald-400">Access Control & User Directory</h3>
                <p className="text-sm text-muted-foreground">
                    Provision accounts, manage Plex library access, configure prorated annual subscriptions & trials, and track member referrals.
                </p>
            </div>

            {/* TOP NAVIGATION TABS */}
            <Tabs defaultValue="users" value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
                <TabsList className="grid grid-cols-3 bg-[#121218] border border-border/50 p-1 rounded-xl h-11">
                    <TabsTrigger value="users" className="gap-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Users className="h-4 w-4" /> User Directory ({users.length})
                    </TabsTrigger>
                    <TabsTrigger value="referrals" className="gap-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <Trophy className="h-4 w-4 text-amber-400" /> Referrals & Leaderboard
                    </TabsTrigger>
                    <TabsTrigger value="onboarding" className="gap-2 text-xs font-semibold data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                        <CreditCard className="h-4 w-4 text-emerald-400" /> Payment & Onboarding
                    </TabsTrigger>
                </TabsList>

                {/* ========================================================================= */}
                {/* TAB 1: USERS DIRECTORY & ACCESS CONTROL */}
                {/* ========================================================================= */}
                <TabsContent value="users" className="space-y-6 animate-in fade-in-50 duration-200">
                    {/* PLEX AUTO-SYNC BANNER */}
                    <Card className="border-[#e5a00d]/40 bg-[#e5a00d]/5 backdrop-blur-md shadow-sm hover:border-[#e5a00d]/60 hover:shadow-md transition-all duration-200">
                        <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 font-bold text-foreground">
                                    <Play className="h-4 w-4 text-[#e5a00d] fill-current" />
                                    <span>Plex Friends Auto-Sync</span>
                                </div>
                                <p className="text-xs text-muted-foreground max-w-xl">
                                    Scans your Plex server for friends and automatically provisions approved accounts for them. Updates user details when emails change, and revokes access if users are removed from your Plex server.
                                </p>
                                {syncMessage && (
                                    <div className="text-xs text-[#e5a00d] pt-1 font-medium">
                                        {syncMessage}
                                    </div>
                                )}
                            </div>
                            <Button 
                                type="button" 
                                variant="outline"
                                className="border-[#e5a00d]/40 text-[#e5a00d] hover:bg-[#e5a00d]/10 shrink-0 gap-2 h-10 font-semibold transition-all duration-200 hover:ring-2 hover:ring-[#e5a00d]/40 active:scale-95"
                                onClick={handleSyncPlex}
                                disabled={syncingPlex}
                            >
                                {syncingPlex ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                                Sync Plex Friends Now
                            </Button>
                        </CardContent>
                    </Card>

                    <div className="grid gap-6 md:grid-cols-2">
                        {/* CREATE USER FORM */}
                        <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg font-bold">
                                    <UserPlus className="h-5 w-5 text-primary" /> Create Account
                                </CardTitle>
                                <CardDescription>Add a new administrator or pre-approved user.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form 
                                    onSubmit={handleCreate} 
                                    className="space-y-4"
                                    autoComplete="off"
                                    data-1p-ignore="true"
                                    data-lpignore="true"
                                >
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Username</Label>
                                        <Input 
                                            name="username" 
                                            placeholder="e.g. jsmith" 
                                            required 
                                            className="bg-background/60" 
                                            autoComplete="off"
                                            data-1p-ignore="true"
                                            data-lpignore="true"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Email Address</Label>
                                        <Input 
                                            name="email" 
                                            type="email" 
                                            placeholder="user@example.com" 
                                            required 
                                            className="bg-background/60" 
                                            autoComplete="off"
                                            data-1p-ignore="true"
                                            data-lpignore="true"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Password</Label>
                                        <Input 
                                            name="password" 
                                            type="password" 
                                            required 
                                            placeholder="Minimum 6 characters" 
                                            className="bg-background/60" 
                                            autoComplete="new-password"
                                            data-1p-ignore="true"
                                            data-lpignore="true"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Role</Label>
                                        <Select name="role" defaultValue="USER">
                                            <SelectTrigger className="bg-background/80"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ADMIN">Admin (Full Access & Settings)</SelectItem>
                                                <SelectItem value="SUPER_USER">Super User (Radarr/Sonarr Access)</SelectItem>
                                                <SelectItem value="USER">User (Standard Access)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button type="submit" className="w-full font-semibold transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:shadow-md active:scale-98">
                                        <UserPlus className="h-4 w-4 mr-2" /> Create Approved User
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>

                        {/* CHANGE PASSWORD FORM */}
                        <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2 text-lg font-bold">
                                    <KeyRound className="h-5 w-5 text-primary" /> Change Your Password
                                </CardTitle>
                                <CardDescription>Update your logged-in administrator password.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <form 
                                    onSubmit={handleChangePassword} 
                                    className="space-y-4"
                                    autoComplete="off"
                                >
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
                                        <Label className="text-xs font-semibold">Current / Temp Password</Label>
                                        <Input 
                                            type="password" required 
                                            value={passCurrent} 
                                            onChange={(e) => setPassCurrent(e.target.value)} 
                                            placeholder="Enter current password"
                                            className="bg-background/60"
                                            autoComplete="current-password"
                                        />
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">New Password</Label>
                                        <Input 
                                            type="password" required 
                                            value={passNew} 
                                            onChange={(e) => setPassNew(e.target.value)} 
                                            placeholder="Minimum 6 characters"
                                            className="bg-background/60"
                                            autoComplete="new-password"
                                        />
                                    </div>
                                    <Button type="submit" disabled={passLoading} className="w-full font-semibold transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:shadow-md active:scale-98">
                                        {passLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                                        Update My Password
                                    </Button>
                                </form>
                            </CardContent>
                        </Card>
                    </div>

                    {/* USER DIRECTORY TABLE & CONTROLS */}
                    <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                        <CardHeader className="space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div>
                                    <CardTitle className="text-xl font-bold">Existing Users & Access Directory</CardTitle>
                                    <CardDescription>Manage user permissions, Plex library shares, trial expiration timers, and Kindle emails.</CardDescription>
                                </div>
                                {pendingUsersCount > 0 && (
                                    <Button 
                                        variant="default" 
                                        size="sm" 
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 font-semibold shrink-0 transition-all duration-200 hover:ring-2 hover:ring-emerald-400/50 hover:shadow-md active:scale-95"
                                        onClick={handleApproveAllPending}
                                    >
                                        <CheckCheck className="h-4 w-4" /> Approve All Pending ({pendingUsersCount})
                                    </Button>
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
                                {/* SEARCH INPUT */}
                                <div className="relative w-full sm:w-72">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="Search by username, email, referrer..." 
                                        className="pl-9 text-xs h-9 bg-background/60"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                    />
                                </div>

                                {/* STATUS FILTER BUTTONS */}
                                <div className="flex flex-wrap gap-1.5 bg-muted/30 p-1 rounded-xl border border-muted/50 text-xs w-full sm:w-auto">
                                    <Button 
                                        variant={filterStatus === "ALL" ? "secondary" : "ghost"} 
                                        size="sm" 
                                        className="h-7 text-xs px-2.5 transition-all duration-200 hover:ring-2 hover:ring-primary/40 active:scale-95 font-semibold"
                                        onClick={() => setFilterStatus("ALL")}
                                    >
                                        All ({users.length})
                                    </Button>
                                    <Button 
                                        variant={filterStatus === "PENDING" ? "secondary" : "ghost"} 
                                        size="sm" 
                                        className="h-7 text-xs px-2.5 text-amber-400 transition-all duration-200 hover:ring-2 hover:ring-amber-400/40 active:scale-95 font-semibold"
                                        onClick={() => setFilterStatus("PENDING")}
                                    >
                                        Pending ({users.filter(u => u.status === "PENDING").length})
                                    </Button>
                                    <Button 
                                        variant={filterStatus === "TRIAL" ? "secondary" : "ghost"} 
                                        size="sm" 
                                        className="h-7 text-xs px-2.5 text-blue-400 transition-all duration-200 hover:ring-2 hover:ring-blue-400/40 active:scale-95 font-semibold"
                                        onClick={() => setFilterStatus("TRIAL")}
                                    >
                                        Trials ({users.filter(u => u.status === "TRIAL").length})
                                    </Button>
                                    <Button 
                                        variant={filterStatus === "APPROVED" ? "secondary" : "ghost"} 
                                        size="sm" 
                                        className="h-7 text-xs px-2.5 text-emerald-400 transition-all duration-200 hover:ring-2 hover:ring-emerald-400/40 active:scale-95 font-semibold"
                                        onClick={() => setFilterStatus("APPROVED")}
                                    >
                                        Subscribed ({users.filter(u => u.status === "APPROVED" || !u.status).length})
                                    </Button>
                                    <Button 
                                        variant={filterStatus === "INACTIVE" ? "secondary" : "ghost"} 
                                        size="sm" 
                                        className="h-7 text-xs px-2.5 text-red-400 transition-all duration-200 hover:ring-2 hover:ring-red-400/40 active:scale-95 font-semibold"
                                        onClick={() => setFilterStatus("INACTIVE")}
                                    >
                                        Inactive ({users.filter(u => u.status === "SUSPENDED" || u.status === "EXPIRED" || u.status === "REJECTED").length})
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-3">
                                {loading ? (
                                    <div className="text-sm text-muted-foreground flex items-center gap-2 p-6 justify-center">
                                        <Loader2 className="h-5 w-5 animate-spin text-emerald-400" /> Loading user directory...
                                    </div>
                                ) : filteredUsers.length === 0 ? (
                                    <div className="text-sm text-muted-foreground italic p-8 text-center border border-dashed border-border/40 rounded-xl bg-muted/10">
                                        No matching users found.
                                    </div>
                                ) : (
                                    filteredUsers.map((user) => {
                                        const isTrial = user.status === "TRIAL";
                                        const isSuspended = user.status === "SUSPENDED";
                                        const isExpired = user.status === "EXPIRED";
                                        const isPending = user.status === "PENDING";
                                        const isRejected = user.status === "REJECTED";
                                        const daysLeft = isTrial ? getDaysLeft(user.trialEndsAt) : null;
                                        const userLibraryCount = user.plexLibrarySectionIds 
                                            ? user.plexLibrarySectionIds.split(",").filter(Boolean).length 
                                            : 0;

                                        return (
                                            <div 
                                                key={user.id} 
                                                className={`flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-xl gap-4 transition-all duration-200 ${
                                                    isPending 
                                                        ? "bg-amber-500/10 border-amber-500/40 hover:border-amber-500/60" 
                                                        : isSuspended || isExpired || isRejected
                                                        ? "bg-red-500/5 border-red-500/30 hover:border-red-500/50"
                                                        : "bg-[#101014]/90 border-border/40 hover:border-emerald-500/30 hover:ring-2 hover:ring-emerald-500/20"
                                                }`}
                                            >
                                                <div className="flex items-start gap-3 flex-1 min-w-0">
                                                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 border border-primary/20">
                                                        {user.role === "ADMIN" ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}
                                                    </div>
                                                    <div className="space-y-1.5 flex-1 min-w-0">
                                                        <div className="font-semibold text-sm flex flex-wrap items-center gap-2">
                                                            <span className="truncate text-foreground font-bold">{user.username}</span>
                                                            
                                                            {/* STATUS BADGES */}
                                                            {isPending && (
                                                                <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/40 text-[10px] gap-1 font-bold">
                                                                    <Clock className="h-3 w-3" /> Pending Approval
                                                                </Badge>
                                                            )}
                                                            {isTrial && (
                                                                <Badge variant="outline" className="bg-blue-500/20 text-blue-400 border-blue-500/40 text-[10px] gap-1 font-bold">
                                                                    <Timer className="h-3 w-3" /> Trial ({daysLeft} days left)
                                                                </Badge>
                                                            )}
                                                            {user.status === "APPROVED" && user.subscriptionEndsAt && (
                                                                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] gap-1 font-semibold">
                                                                    <CheckCircle2 className="h-3 w-3" /> Subscribed (Till {format(new Date(user.subscriptionEndsAt), "MMM d, yyyy")})
                                                                </Badge>
                                                            )}
                                                            {user.status === "APPROVED" && !user.subscriptionEndsAt && (
                                                                <Badge variant="outline" className="bg-emerald-500/20 text-emerald-400 border-emerald-500/40 text-[10px] gap-1 font-semibold">
                                                                    <CheckCircle2 className="h-3 w-3" /> Permanent Access
                                                                </Badge>
                                                            )}
                                                            {isSuspended && (
                                                                <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/40 text-[10px] font-bold">
                                                                    Suspended
                                                                </Badge>
                                                            )}
                                                            {isExpired && (
                                                                <Badge variant="outline" className="bg-orange-500/20 text-orange-400 border-orange-500/40 text-[10px] font-bold">
                                                                    Expired
                                                                </Badge>
                                                            )}
                                                            {isRejected && (
                                                                <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/40 text-[10px] font-bold">
                                                                    Rejected
                                                                </Badge>
                                                            )}

                                                            {/* REFERRER ATTRIBUTION */}
                                                            {user.referredBy?.username && (
                                                                <Badge variant="outline" className="bg-purple-500/15 text-purple-400 border-purple-500/40 text-[10px] gap-1 font-medium">
                                                                    <Gift className="h-3 w-3" /> Invited by @{user.referredBy.username}
                                                                </Badge>
                                                            )}

                                                            {/* KINDLE BADGE */}
                                                            {user.kindleEmail ? (
                                                                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 text-[10px] gap-1 font-semibold" title={user.kindleEmail}>
                                                                    <Send className="h-3 w-3" /> Kindle
                                                                </Badge>
                                                            ) : null}
                                                        </div>

                                                        <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1">
                                                            <span className="flex items-center gap-1">
                                                                <Mail className="h-3 w-3 text-muted-foreground" /> {user.email || "No Email"}
                                                            </span>
                                                            <span>•</span>
                                                            <span>Joined {format(new Date(user.createdAt), "MMM d, yyyy")}</span>
                                                            {user.lastLogin && (
                                                                <>
                                                                    <span>•</span>
                                                                    <span>Active {format(new Date(user.lastLogin), "MMM d, h:mm a")}</span>
                                                                </>
                                                            )}
                                                        </div>

                                                        {/* INLINE KINDLE EMAIL DISPLAY / EDIT */}
                                                        <div className="pt-1 flex items-center gap-2 text-xs">
                                                            {editingKindleUserId === user.id ? (
                                                                <div className="flex items-center gap-2 w-full max-w-sm">
                                                                    <Input 
                                                                        className="h-7 text-xs bg-background/80" 
                                                                        placeholder="e.g. user_123@kindle.com"
                                                                        value={kindleEmailInput}
                                                                        onChange={(e) => setKindleEmailInput(e.target.value)}
                                                                    />
                                                                    <Button size="sm" className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-all duration-200 hover:ring-2 hover:ring-emerald-400/40" onClick={() => handleSaveKindleEmail(user.id)}>
                                                                        Save
                                                                    </Button>
                                                                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setEditingKindleUserId(null)}>
                                                                        Cancel
                                                                    </Button>
                                                                </div>
                                                            ) : (
                                                                <div className="text-muted-foreground flex items-center gap-1.5 group/k">
                                                                    <Send className="h-3 w-3 text-amber-500/80" />
                                                                    <span>Send-to-Kindle: <strong className="text-foreground">{user.kindleEmail || "Not Configured"}</strong></span>
                                                                    <Button 
                                                                        variant="ghost" 
                                                                        size="icon" 
                                                                        className="h-5 w-5 text-muted-foreground hover:text-foreground opacity-60 group-hover/k:opacity-100 transition-all duration-200 hover:ring-1 hover:ring-primary/40"
                                                                        onClick={() => {
                                                                            setEditingKindleUserId(user.id);
                                                                            setKindleEmailInput(user.kindleEmail || "");
                                                                        }}
                                                                        title="Edit Kindle Email"
                                                                    >
                                                                        <Edit2 className="h-3 w-3" />
                                                                    </Button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* CONTROLS & ACTIONS */}
                                                <div className="flex flex-wrap items-center gap-2 shrink-0 self-end md:self-center">
                                                    {/* PLEX LIBRARIES BUTTON */}
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        className="h-8 px-2.5 text-xs font-semibold gap-1.5 border-primary/30 hover:border-primary hover:bg-primary/10 transition-all active:scale-95"
                                                        onClick={() => handleOpenLibrariesModal(user)}
                                                        title="Manage Shared Plex Libraries"
                                                    >
                                                        <Layers className="h-3.5 w-3.5 text-primary" />
                                                        Libraries ({userLibraryCount > 0 ? `${userLibraryCount} shared` : "None"})
                                                    </Button>

                                                    {/* TRIAL / SUBSCRIPTION TIMER BUTTON */}
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        className="h-8 px-2.5 text-xs font-semibold gap-1.5 border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:border-blue-500 transition-all active:scale-95"
                                                        onClick={() => {
                                                            setSubModalUser(user);
                                                            setSubSuccessMsg("");
                                                            setSubErrMsg("");
                                                        }}
                                                        title="Adjust Trial or Subscription Period"
                                                    >
                                                        <Timer className="h-3.5 w-3.5 text-blue-400" />
                                                        Access & Timer
                                                    </Button>

                                                    {/* ROLE SELECTOR */}
                                                    <Select defaultValue={user.role} onValueChange={(val) => handleRoleChange(user.id, val)}>
                                                        <SelectTrigger className="h-8 text-xs w-24 bg-background/80 border-border/60 font-semibold">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="ADMIN">Admin</SelectItem>
                                                            <SelectItem value="SUPER_USER">Super User</SelectItem>
                                                            <SelectItem value="USER">User</SelectItem>
                                                        </SelectContent>
                                                    </Select>

                                                    {/* APPROVE / REJECT */}
                                                    {isPending ? (
                                                        <>
                                                            <Button size="sm" variant="default" className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-500 text-white gap-1 text-xs font-semibold transition-all duration-200 hover:ring-2 hover:ring-emerald-400/40 active:scale-95" onClick={() => handleApprove(user.id)}>
                                                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                                            </Button>
                                                            <Button size="sm" variant="outline" className="h-8 px-2.5 text-red-400 border-red-800/40 hover:bg-red-950/40 gap-1 text-xs font-semibold transition-all duration-200 hover:ring-2 hover:ring-red-500/40 active:scale-95" onClick={() => handleReject(user.id)}>
                                                                <XCircle className="h-3.5 w-3.5" /> Reject
                                                            </Button>
                                                        </>
                                                    ) : isRejected ? (
                                                        <Button size="sm" variant="outline" className="h-8 px-2.5 text-emerald-400 border-emerald-800/40 hover:bg-emerald-950/40 gap-1 text-xs font-semibold transition-all duration-200 hover:ring-2 hover:ring-emerald-400/40 active:scale-95" onClick={() => handleApprove(user.id)}>
                                                            <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                                        </Button>
                                                    ) : null}

                                                    {/* ADMIN RESET PASSWORD BUTTON */}
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline" 
                                                        className="h-8 px-2 text-xs text-amber-500 border-amber-500/30 hover:bg-amber-500/10 gap-1 font-semibold transition-all duration-200 hover:ring-2 hover:ring-amber-500/40 active:scale-95"
                                                        onClick={() => {
                                                            setResetModalUserId(user.id);
                                                            setAdminResetMsg("");
                                                            setAdminResetErr("");
                                                        }}
                                                        title="Reset User Password"
                                                    >
                                                        <KeyRound className="h-3.5 w-3.5" />
                                                    </Button>

                                                    <Button 
                                                        size="icon" 
                                                        variant="ghost" 
                                                        className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/40 transition-all duration-200 hover:ring-2 hover:ring-red-500/40 active:scale-95" 
                                                        onClick={() => handleDelete(user.id)} 
                                                        title="Delete User"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 2: REFERRALS & LEADERBOARD */}
                {/* ========================================================================= */}
                <TabsContent value="referrals" className="space-y-6 animate-in fade-in-50 duration-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Total Referred</p>
                                        <p className="text-2xl font-black text-foreground">{referralStats?.totalReferred ?? 0}</p>
                                    </div>
                                    <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl text-purple-400">
                                        <Users className="h-6 w-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Active Trials</p>
                                        <p className="text-2xl font-black text-blue-400">{referralStats?.totalTrials ?? 0}</p>
                                    </div>
                                    <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-400">
                                        <Timer className="h-6 w-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Paid Conversions</p>
                                        <p className="text-2xl font-black text-emerald-400">{referralStats?.totalConversions ?? 0}</p>
                                    </div>
                                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400">
                                        <DollarSign className="h-6 w-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                            <CardContent className="pt-6">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-1">
                                        <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Conversion Rate</p>
                                        <p className="text-2xl font-black text-amber-400">
                                            {referralStats?.totalReferred ? `${Math.round((referralStats.totalConversions / referralStats.totalReferred) * 100)}%` : "0%"}
                                        </p>
                                    </div>
                                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-400">
                                        <Trophy className="h-6 w-6" />
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* TOP REFERRERS LEADERBOARD */}
                    <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg font-bold">
                                <Trophy className="h-5 w-5 text-amber-400" /> Member Referral Leaderboard
                            </CardTitle>
                            <CardDescription>Track which members bring the most friends and successful conversions to your server.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingReferrals ? (
                                <div className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-primary" /> Loading referral leaderboard...
                                </div>
                            ) : !referralStats?.leaderboard || referralStats.leaderboard.length === 0 ? (
                                <div className="p-8 text-center text-sm text-muted-foreground italic border border-dashed border-border/40 rounded-xl">
                                    No referrals registered yet. Share invite links from user profiles to start tracking referrals.
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs text-left">
                                        <thead className="text-[11px] text-muted-foreground uppercase border-b border-border/40 bg-muted/20">
                                            <tr>
                                                <th className="py-3 px-4">Rank</th>
                                                <th className="py-3 px-4">Member</th>
                                                <th className="py-3 px-4 text-center">Friends Invited</th>
                                                <th className="py-3 px-4 text-center">Active Trials</th>
                                                <th className="py-3 px-4 text-center">Conversions</th>
                                                <th className="py-3 px-4 text-right">Conversion Rate</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-border/20">
                                            {referralStats.leaderboard.map((ref: any, idx: number) => {
                                                const rate = ref.totalReferrals > 0 ? Math.round((ref.conversions / ref.totalReferrals) * 100) : 0;
                                                return (
                                                    <tr key={idx} className="hover:bg-white/[0.02] transition-colors">
                                                        <td className="py-3.5 px-4 font-bold">
                                                            {idx === 0 ? "🥇 #1" : idx === 1 ? "🥈 #2" : idx === 2 ? "🥉 #3" : `#${idx + 1}`}
                                                        </td>
                                                        <td className="py-3.5 px-4 font-bold text-foreground">
                                                            @{ref.username}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-center font-semibold">
                                                            {ref.totalReferrals}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-center font-semibold text-blue-400">
                                                            {ref.trials}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-center font-bold text-emerald-400">
                                                            {ref.conversions}
                                                        </td>
                                                        <td className="py-3.5 px-4 text-right font-bold text-amber-400">
                                                            {rate}%
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 3: PAYMENT & ONBOARDING SETTINGS */}
                {/* ========================================================================= */}
                <TabsContent value="onboarding" className="space-y-6 animate-in fade-in-50 duration-200">
                    <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg font-bold">
                                <Sparkles className="h-5 w-5 text-emerald-400" /> Wizarr-Style Onboarding, Trials & Prorated Yearly Billing
                            </CardTitle>
                            <CardDescription>
                                Configure custom trial days, yearly/monthly subscription pricing, annual January 1st proration, and payment gateways.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSaveOnboardingSettings} className="space-y-6">
                                {settingsSuccessMsg && (
                                    <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        <span>{settingsSuccessMsg}</span>
                                    </div>
                                )}
                                {settingsErrMsg && (
                                    <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                        <XCircle className="h-4 w-4 shrink-0" />
                                        <span>{settingsErrMsg}</span>
                                    </div>
                                )}

                                {/* PRICING & TRIAL SETTINGS */}
                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-primary">
                                        <Calculator className="h-4 w-4" />
                                        <span>Subscription & Trial Customization</span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Free Trial Duration (Days)</Label>
                                            <Input 
                                                type="number"
                                                min="1"
                                                max="365"
                                                value={paymentSettings.defaultTrialDays}
                                                onChange={(e) => setPaymentSettings({ ...paymentSettings, defaultTrialDays: parseInt(e.target.value, 10) || 14 })}
                                                className="bg-background/60 font-mono"
                                                required
                                            />
                                            <p className="text-[11px] text-muted-foreground">e.g. 7 or 14 days free pass.</p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Yearly Subscription Rate ($)</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input 
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={paymentSettings.yearlyPrice}
                                                    onChange={(e) => {
                                                        const y = parseFloat(e.target.value) || 0;
                                                        const m = y > 0 ? Math.round((y / 12) * 100) / 100 : 0;
                                                        setPaymentSettings({ ...paymentSettings, yearlyPrice: y, monthlyPrice: m, subscriptionPrice: `$${y} / year` });
                                                    }}
                                                    className="pl-9 bg-background/60 font-mono"
                                                    required
                                                />
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">Full annual payment (e.g. $180/yr).</p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Monthly Breakdown Rate ($)</Label>
                                            <div className="relative">
                                                <DollarSign className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                                <Input 
                                                    type="number"
                                                    min="0"
                                                    step="0.5"
                                                    value={paymentSettings.monthlyPrice}
                                                    onChange={(e) => setPaymentSettings({ ...paymentSettings, monthlyPrice: parseFloat(e.target.value) || 0 })}
                                                    className="pl-9 bg-background/60 font-mono"
                                                    required
                                                />
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">Calculated proration rate (e.g. $15/mo).</p>
                                        </div>
                                    </div>

                                    {/* ANNUAL RENEWAL DATE CONFIG */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/30">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Annual Billing Renewal Date</Label>
                                            <div className="grid grid-cols-2 gap-2">
                                                <Select 
                                                    value={String(paymentSettings.renewalMonth)} 
                                                    onValueChange={(val) => setPaymentSettings({ ...paymentSettings, renewalMonth: parseInt(val, 10) })}
                                                >
                                                    <SelectTrigger className="bg-background/80 text-xs"><SelectValue placeholder="Month" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">January</SelectItem>
                                                        <SelectItem value="2">February</SelectItem>
                                                        <SelectItem value="3">March</SelectItem>
                                                        <SelectItem value="4">April</SelectItem>
                                                        <SelectItem value="5">May</SelectItem>
                                                        <SelectItem value="6">June</SelectItem>
                                                        <SelectItem value="7">July</SelectItem>
                                                        <SelectItem value="8">August</SelectItem>
                                                        <SelectItem value="9">September</SelectItem>
                                                        <SelectItem value="10">October</SelectItem>
                                                        <SelectItem value="11">November</SelectItem>
                                                        <SelectItem value="12">December</SelectItem>
                                                    </SelectContent>
                                                </Select>

                                                <Select 
                                                    value={String(paymentSettings.renewalDay)} 
                                                    onValueChange={(val) => setPaymentSettings({ ...paymentSettings, renewalDay: parseInt(val, 10) })}
                                                >
                                                    <SelectTrigger className="bg-background/80 text-xs"><SelectValue placeholder="Day" /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">1st of the month</SelectItem>
                                                        <SelectItem value="15">15th of the month</SelectItem>
                                                        <SelectItem value="28">28th of the month</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground">Default: Yearly payments renew on January 1st.</p>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Subscription Display Label</Label>
                                            <Input 
                                                placeholder="e.g. $180 / year ($15/mo)"
                                                value={paymentSettings.subscriptionPrice}
                                                onChange={(e) => setPaymentSettings({ ...paymentSettings, subscriptionPrice: e.target.value })}
                                                className="bg-background/60 text-xs"
                                            />
                                            <p className="text-[11px] text-muted-foreground">Rendered on user paywalls and cards.</p>
                                        </div>
                                    </div>
                                </div>

                                {/* LIVE PRORATED CALCULATION PREVIEW BOX */}
                                <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/30 via-emerald-900/20 to-transparent border border-emerald-500/30 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-wider">
                                            <Sparkles className="h-4 w-4" />
                                            <span>Live Prorated Billing Calculation Preview</span>
                                        </div>
                                        <Badge variant="outline" className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px]">
                                            Dynamic Engine
                                        </Badge>
                                    </div>

                                    <div className="text-xs space-y-1.5 text-muted-foreground">
                                        <p>
                                            If a prospective user signs up today (<strong className="text-foreground">{format(new Date(), "MMM d, yyyy")}</strong>) with a <strong className="text-foreground">{paymentSettings.defaultTrialDays}-day trial</strong> (free through <strong className="text-foreground">{format(new Date(liveProrated.trialEndDate), "MMM d, yyyy")}</strong>):
                                        </p>
                                        
                                        <div className="p-3 rounded-xl bg-background/60 border border-border/40 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-foreground font-medium">
                                            <div>
                                                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Remaining in {liveProrated.trialEndYear}:</span>
                                                <span className="text-emerald-400 font-bold text-sm">
                                                    ${liveProrated.amountDueNow}
                                                </span>
                                                <span className="text-muted-foreground text-[11px] block">
                                                    {liveProrated.remainingMonthsText} @ ${liveProrated.monthlyRate}/mo
                                                </span>
                                            </div>
                                            <div>
                                                <span className="text-muted-foreground block text-[10px] uppercase font-bold">Next Annual Renewal:</span>
                                                <span className="text-foreground font-bold text-sm">
                                                    ${liveProrated.yearlyRate} / year
                                                </span>
                                                <span className="text-muted-foreground text-[11px] block">
                                                    Due on {liveProrated.nextRenewalDate}
                                                </span>
                                            </div>
                                        </div>

                                        <p className="text-[11px] text-muted-foreground/90 italic pt-1">
                                            Summary displayed to user: "{liveProrated.breakdownSummary}"
                                        </p>
                                    </div>
                                </div>

                                {/* PAYMENT GATEWAYS & HANDLES */}
                                <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.06] space-y-4">
                                    <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-foreground">
                                        <CreditCard className="h-4 w-4 text-emerald-400" />
                                        <span>Custom Payment Gateways & Handles</span>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">PayPal Username or Me Link</Label>
                                            <Input 
                                                placeholder="e.g. paypal.me/YourUsername or admin@example.com"
                                                value={paymentSettings.paymentPaypal}
                                                onChange={(e) => setPaymentSettings({ ...paymentSettings, paymentPaypal: e.target.value })}
                                                className="bg-background/60 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Venmo Handle</Label>
                                            <Input 
                                                placeholder="e.g. @YourVenmoHandle"
                                                value={paymentSettings.paymentVenmo}
                                                onChange={(e) => setPaymentSettings({ ...paymentSettings, paymentVenmo: e.target.value })}
                                                className="bg-background/60 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">CashApp Tag</Label>
                                            <Input 
                                                placeholder="e.g. $YourCashtag"
                                                value={paymentSettings.paymentCashApp}
                                                onChange={(e) => setPaymentSettings({ ...paymentSettings, paymentCashApp: e.target.value })}
                                                className="bg-background/60 text-xs"
                                            />
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold">Zelle Email or Phone</Label>
                                            <Input 
                                                placeholder="e.g. payments@example.com or (555) 123-4567"
                                                value={paymentSettings.paymentZelle}
                                                onChange={(e) => setPaymentSettings({ ...paymentSettings, paymentZelle: e.target.value })}
                                                className="bg-background/60 text-xs"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1.5 pt-2 border-t border-border/30">
                                        <Label className="text-xs font-semibold">Custom Payment & Subscription Instructions</Label>
                                        <Textarea 
                                            rows={3}
                                            placeholder="e.g. Send payment via Friends & Family. Please include your username in the transaction note so your subscription can be activated immediately!"
                                            value={paymentSettings.paymentInstructions}
                                            onChange={(e) => setPaymentSettings({ ...paymentSettings, paymentInstructions: e.target.value })}
                                            className="bg-background/60 text-xs"
                                        />
                                    </div>
                                </div>

                                {/* DEFAULT PLEX LIBRARIES SELECTION */}
                                <div className="space-y-3 pt-2 border-t border-border/40">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <Label className="text-xs font-bold text-foreground">Default Shared Plex Libraries for New Signups</Label>
                                            <p className="text-[11px] text-muted-foreground">Select which server libraries are automatically granted to newly registered trial users.</p>
                                        </div>
                                        <Button 
                                            type="button" 
                                            variant="ghost" 
                                            size="sm" 
                                            className="h-7 text-xs text-primary"
                                            onClick={loadLibraries}
                                            disabled={loadingLibraries}
                                        >
                                            {loadingLibraries ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1" />}
                                            Refresh Libraries
                                        </Button>
                                    </div>

                                    {serverLibraries.length === 0 ? (
                                        <div className="text-xs text-muted-foreground italic p-4 bg-muted/20 rounded-xl border border-border/40">
                                            No Plex libraries detected. Verify your Admin Plex token is configured in Settings.
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {serverLibraries.map((srv) => {
                                                const srvSections = srv.sections || [];
                                                const srvSelectedCount = srvSections.filter((sec: any) => 
                                                    isDefaultSelected(srv.serverId, sec.id)
                                                ).length;
                                                const allSrvSelected = srvSections.length > 0 && srvSelectedCount === srvSections.length;

                                                return (
                                                    <div key={srv.serverId} className="p-3 bg-muted/10 rounded-xl border border-border/40 space-y-2">
                                                        <div className="flex items-center justify-between pb-1.5 border-b border-border/30">
                                                            <div className="flex items-center gap-2">
                                                                <Server className="h-3.5 w-3.5 text-primary" />
                                                                <span className="font-bold text-xs text-foreground">{srv.serverName || "Plex Server"}</span>
                                                                <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-background/50">
                                                                    {srvSelectedCount}/{srvSections.length} Default
                                                                </Badge>
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                                                onClick={() => {
                                                                    const srvKeys = srvSections.map((sec: any) => `${srv.serverId}:${sec.id}`);
                                                                    const srvRawIds = srvSections.map((sec: any) => String(sec.id));
                                                                    setDefaultSelectedKeys(prev => {
                                                                        const otherKeys = prev.filter(k => !k.startsWith(`${srv.serverId}:`) && !srvRawIds.includes(k));
                                                                        return allSrvSelected ? otherKeys : [...otherKeys, ...srvKeys];
                                                                    });
                                                                }}
                                                            >
                                                                {allSrvSelected ? "Deselect All" : "Select All"}
                                                            </Button>
                                                        </div>

                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                            {srvSections.map((sec: any) => {
                                                                const uniqueKey = `${srv.serverId}:${sec.id}`;
                                                                const isChecked = isDefaultSelected(srv.serverId, sec.id);
                                                                return (
                                                                    <label 
                                                                        key={uniqueKey} 
                                                                        onClick={(e) => {
                                                                            e.preventDefault();
                                                                            handleToggleDefaultSection(srv.serverId, sec.id);
                                                                        }}
                                                                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                                                                            isChecked ? "bg-primary/15 border-primary/40 text-foreground font-semibold" : "bg-background/40 border-border/30 text-muted-foreground hover:text-foreground"
                                                                        }`}
                                                                    >
                                                                        <input 
                                                                            type="checkbox"
                                                                            checked={isChecked}
                                                                            onChange={() => {}}
                                                                            className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 shrink-0 pointer-events-none"
                                                                        />
                                                                        <span className="truncate">{sec.title}</span>
                                                                        <span className="text-[9px] text-muted-foreground uppercase shrink-0">({sec.type})</span>
                                                                    </label>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* REQUIRE REFERRAL SWITCH */}
                                <div className="pt-2 border-t border-border/40 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="text-xs font-bold text-foreground">Require Invite Link to Join</Label>
                                        <p className="text-[11px] text-muted-foreground">When enabled, visitors to <code className="bg-muted px-1 py-0.5 rounded">/join</code> must have a valid referral code to sign up.</p>
                                    </div>
                                    <Switch 
                                        checked={paymentSettings.requireReferralForSignup}
                                        onCheckedChange={(checked) => setPaymentSettings({ ...paymentSettings, requireReferralForSignup: checked })}
                                    />
                                </div>

                                <Button 
                                    type="submit" 
                                    disabled={savingSettings}
                                    className="w-full font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-all hover:ring-2 hover:ring-emerald-400/40 active:scale-98"
                                >
                                    {savingSettings ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Sparkles className="h-4 w-4 mr-2" />}
                                    Save Onboarding & Payment Settings
                                </Button>
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* ========================================================================= */}
            {/* MANAGE PLEX LIBRARIES MODAL */}
            {/* ========================================================================= */}
            {libModalUser && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-lg bg-[#121218] border-border/60 shadow-2xl">
                        <CardHeader className="pb-3 border-b border-border/40">
                            <CardTitle className="flex items-center gap-2 text-lg font-bold text-primary">
                                <Layers className="h-5 w-5 text-primary" /> Manage Plex Libraries
                            </CardTitle>
                            <CardDescription>
                                Select which server library sections are shared with <strong>{libModalUser.username}</strong> ({libModalUser.email}).
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            {libSuccessMsg && (
                                <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{libSuccessMsg}</span>
                                </div>
                            )}
                            {libErrMsg && (
                                <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    <span>{libErrMsg}</span>
                                </div>
                            )}

                            {loadingUserLibs && (
                                <div className="flex items-center justify-center gap-2 p-3 text-xs text-muted-foreground bg-primary/5 rounded-xl border border-primary/20 animate-pulse">
                                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                                    <span>Fetching current shared libraries from Plex...</span>
                                </div>
                            )}

                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground font-semibold">
                                    {allUniqueKeys.filter(k => {
                                        const [srvId, secId] = k.split(":");
                                        return isSectionSelected(srvId, secId);
                                    }).length} of {totalLibrariesCount} libraries selected
                                </span>
                                <div className="flex gap-2">
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-7 text-xs px-2"
                                        onClick={handleSelectAllSections}
                                    >
                                        Select All
                                    </Button>
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-7 text-xs px-2"
                                        onClick={handleDeselectAllSections}
                                    >
                                        Clear All
                                    </Button>
                                </div>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto space-y-4 pr-1">
                                {serverLibraries.length === 0 ? (
                                    <div className="text-xs text-muted-foreground italic p-6 text-center border border-dashed border-border/40 rounded-xl bg-muted/10">
                                        No Plex servers or libraries found. Ensure your Admin Plex Token is connected.
                                    </div>
                                ) : (
                                    serverLibraries.map((server) => {
                                        const serverSections = server.sections || [];
                                        const serverSelectedCount = serverSections.filter((sec: any) => 
                                            isSectionSelected(server.serverId, sec.id)
                                        ).length;
                                        const allServerSelected = serverSections.length > 0 && serverSelectedCount === serverSections.length;

                                        return (
                                            <div key={server.serverId} className="space-y-2.5 p-3.5 bg-muted/10 rounded-xl border border-border/40">
                                                <div className="flex items-center justify-between pb-2 border-b border-border/30">
                                                    <div className="flex items-center gap-2">
                                                        <Server className="h-4 w-4 text-primary shrink-0" />
                                                        <span className="font-bold text-xs text-foreground">{server.serverName || "Plex Server"}</span>
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-background/50">
                                                            {serverSelectedCount}/{serverSections.length} Shared
                                                        </Badge>
                                                    </div>
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="sm"
                                                        className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                                        onClick={() => handleToggleAllServerSections(server.serverId, !allServerSelected)}
                                                    >
                                                        {allServerSelected ? "Deselect All" : "Select All"}
                                                    </Button>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                    {serverSections.map((sec: any) => {
                                                        const uniqueKey = `${server.serverId}:${sec.id}`;
                                                        const isChecked = isSectionSelected(server.serverId, sec.id);
                                                        return (
                                                            <div 
                                                                key={uniqueKey} 
                                                                onClick={() => handleToggleUserSection(server.serverId, sec.id)}
                                                                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-all ${
                                                                    isChecked 
                                                                        ? "bg-primary/15 border-primary/50 text-foreground font-semibold shadow-sm" 
                                                                        : "bg-background/40 border-border/30 text-muted-foreground hover:text-foreground hover:bg-background/70"
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2.5 min-w-0">
                                                                    <input 
                                                                        type="checkbox"
                                                                        checked={isChecked}
                                                                        onChange={() => {}}
                                                                        className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5 pointer-events-none shrink-0"
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <span className="font-semibold block truncate">{sec.title}</span>
                                                                        <span className="text-[9px] text-muted-foreground uppercase">{sec.type}</span>
                                                                    </div>
                                                                </div>
                                                                <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 ml-1 text-muted-foreground">
                                                                    #{sec.id}
                                                                </Badge>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
                                <Button type="button" variant="outline" onClick={() => { setLibModalUser(null); setShowActivationPrompt(false); }}>
                                    Cancel
                                </Button>
                                <Button 
                                    type="button" 
                                    disabled={savingUserLibs}
                                    onClick={handleSaveUserLibraries}
                                    className="font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-all hover:ring-2 hover:ring-primary/40 active:scale-95"
                                >
                                    {savingUserLibs ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                                    Save & Sync to Plex
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ========================================================================= */}
            {/* SUSPENDED USER ACTIVATION PROMPT MODAL */}
            {/* ========================================================================= */}
            {showActivationPrompt && libModalUser && (
                <div className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-lg bg-[#121218] border-border/70 shadow-2xl overflow-hidden">
                        <CardHeader className="pb-3 border-b border-border/40 bg-muted/20">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400">
                                    <ShieldAlert className="h-5 w-5" />
                                </div>
                                <div>
                                    <CardTitle className="text-base font-bold text-foreground">
                                        Activate Suspended User?
                                    </CardTitle>
                                    <CardDescription className="text-xs mt-0.5">
                                        <strong>{libModalUser.username}</strong> is currently <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-400 uppercase font-bold">{libModalUser.status}</Badge>. Library access cannot be granted on Plex while suspended.
                                    </CardDescription>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            <p className="text-xs text-muted-foreground">
                                Please select how you would like to activate this user before submitting their granted library access:
                            </p>

                            <div className="space-y-2">
                                {/* Option 1: Full Activation (Approved) */}
                                <div 
                                    onClick={() => setSelectedActivationType("APPROVED")}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                                        selectedActivationType === "APPROVED"
                                            ? "bg-emerald-950/30 border-emerald-500/60 ring-1 ring-emerald-500/40"
                                            : "bg-background/40 border-border/40 hover:bg-background/70"
                                    }`}
                                >
                                    <input 
                                        type="radio" 
                                        name="activation_type" 
                                        checked={selectedActivationType === "APPROVED"} 
                                        onChange={() => setSelectedActivationType("APPROVED")}
                                        className="mt-0.5 text-emerald-500 focus:ring-emerald-500"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                            <span className="text-xs font-bold text-foreground">Full Activation (Approved)</span>
                                            <Badge className="bg-emerald-500/20 text-emerald-400 text-[10px] px-1.5 py-0 border border-emerald-500/30">Permanent</Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Activate account permanently with no expiration date. Immediately enables selected libraries on Plex.
                                        </p>
                                    </div>
                                </div>

                                {/* Option 2: 14-Day Free Trial */}
                                <div 
                                    onClick={() => setSelectedActivationType("TRIAL")}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                                        selectedActivationType === "TRIAL"
                                            ? "bg-blue-950/30 border-blue-500/60 ring-1 ring-blue-500/40"
                                            : "bg-background/40 border-border/40 hover:bg-background/70"
                                    }`}
                                >
                                    <input 
                                        type="radio" 
                                        name="activation_type" 
                                        checked={selectedActivationType === "TRIAL"} 
                                        onChange={() => setSelectedActivationType("TRIAL")}
                                        className="mt-0.5 text-blue-500 focus:ring-blue-500"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <Timer className="h-4 w-4 text-blue-400" />
                                            <span className="text-xs font-bold text-foreground">14-Day Free Trial</span>
                                            <Badge className="bg-blue-500/20 text-blue-400 text-[10px] px-1.5 py-0 border border-blue-500/30">Trial</Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Place user on a 14-day trial period from today. Automatically suspends when trial time runs out.
                                        </p>
                                    </div>
                                </div>

                                {/* Option 3: 30-Day Subscription */}
                                <div 
                                    onClick={() => setSelectedActivationType("30_DAYS")}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                                        selectedActivationType === "30_DAYS"
                                            ? "bg-purple-950/30 border-purple-500/60 ring-1 ring-purple-500/40"
                                            : "bg-background/40 border-border/40 hover:bg-background/70"
                                    }`}
                                >
                                    <input 
                                        type="radio" 
                                        name="activation_type" 
                                        checked={selectedActivationType === "30_DAYS"} 
                                        onChange={() => setSelectedActivationType("30_DAYS")}
                                        className="mt-0.5 text-purple-500 focus:ring-purple-500"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <Calendar className="h-4 w-4 text-purple-400" />
                                            <span className="text-xs font-bold text-foreground">30-Day Subscription</span>
                                            <Badge className="bg-purple-500/20 text-purple-400 text-[10px] px-1.5 py-0 border border-purple-500/30">Subscription</Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Grant 30 days of active subscription access from today, and enable selected libraries on Plex.
                                        </p>
                                    </div>
                                </div>

                                {/* Option 4: Keep Suspended (Save Libraries Only) */}
                                <div 
                                    onClick={() => setSelectedActivationType("KEEP_SUSPENDED")}
                                    className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                                        selectedActivationType === "KEEP_SUSPENDED"
                                            ? "bg-amber-950/30 border-amber-500/60 ring-1 ring-amber-500/40"
                                            : "bg-background/40 border-border/40 hover:bg-background/70"
                                    }`}
                                >
                                    <input 
                                        type="radio" 
                                        name="activation_type" 
                                        checked={selectedActivationType === "KEEP_SUSPENDED"} 
                                        onChange={() => setSelectedActivationType("KEEP_SUSPENDED")}
                                        className="mt-0.5 text-amber-500 focus:ring-amber-500"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                            <PauseCircle className="h-4 w-4 text-amber-400" />
                                            <span className="text-xs font-bold text-foreground">Keep Suspended (Save Libraries Only)</span>
                                            <Badge className="bg-amber-500/20 text-amber-400 text-[10px] px-1.5 py-0 border border-amber-500/30">No Access</Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Save these library preferences to the database only. Do not activate the user or grant access on Plex.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
                                <Button 
                                    type="button" 
                                    variant="outline" 
                                    disabled={savingUserLibs}
                                    onClick={() => setShowActivationPrompt(false)}
                                >
                                    Back
                                </Button>
                                <Button 
                                    type="button" 
                                    disabled={savingUserLibs}
                                    onClick={() => executeSaveUserLibraries(pendingLibSaveKeys, selectedActivationType)}
                                    className="font-bold bg-primary hover:bg-primary/90 text-primary-foreground transition-all active:scale-95"
                                >
                                    {savingUserLibs ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Check className="h-4 w-4 mr-2" />}
                                    Confirm & Proceed
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MANAGE TRIAL / SUBSCRIPTION TIMER MODAL */}
            {/* ========================================================================= */}
            {subModalUser && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md bg-[#121218] border-border/60 shadow-2xl">
                        <CardHeader className="pb-3 border-b border-border/40">
                            <CardTitle className="flex items-center gap-2 text-lg font-bold text-blue-400">
                                <Timer className="h-5 w-5 text-blue-400" /> Trial & Subscription Controls
                            </CardTitle>
                            <CardDescription>
                                Set access timers, extend subscriptions, or suspend access for <strong>{subModalUser.username}</strong>.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                            {subSuccessMsg && (
                                <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{subSuccessMsg}</span>
                                </div>
                            )}
                            {subErrMsg && (
                                <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                    <XCircle className="h-4 w-4 shrink-0" />
                                    <span>{subErrMsg}</span>
                                </div>
                            )}

                            <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1 text-xs">
                                <div className="flex justify-between">
                                    <span className="text-muted-foreground">Current Status:</span>
                                    <span className="font-bold text-foreground">{subModalUser.status}</span>
                                </div>
                                {subModalUser.trialEndsAt && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Trial Expires:</span>
                                        <span className="font-bold text-blue-400">{format(new Date(subModalUser.trialEndsAt), "MMM d, yyyy h:mm a")}</span>
                                    </div>
                                )}
                                {subModalUser.subscriptionEndsAt && (
                                    <div className="flex justify-between">
                                        <span className="text-muted-foreground">Subscription Expires:</span>
                                        <span className="font-bold text-emerald-400">{format(new Date(subModalUser.subscriptionEndsAt), "MMM d, yyyy")}</span>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Quick Actions</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-blue-500/30 hover:bg-blue-500/10 text-blue-400"
                                        onClick={() => handleSetTrialOrSub("7_DAYS_TRIAL")}
                                    >
                                        <Timer className="h-3.5 w-3.5" /> 7-Day Trial
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-blue-500/30 hover:bg-blue-500/10 text-blue-400"
                                        onClick={() => handleSetTrialOrSub("14_DAYS_TRIAL")}
                                    >
                                        <Timer className="h-3.5 w-3.5" /> 14-Day Trial
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400"
                                        onClick={() => handleSetTrialOrSub("REST_OF_YEAR")}
                                    >
                                        <Calendar className="h-3.5 w-3.5" /> Rest of {new Date().getFullYear()}
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400"
                                        onClick={() => handleSetTrialOrSub("1_YEAR")}
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Add 1 Full Year
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400"
                                        onClick={() => handleSetTrialOrSub("PERMANENT")}
                                    >
                                        <Sparkles className="h-3.5 w-3.5" /> Permanent Access
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-purple-500/30 hover:bg-purple-500/10 text-purple-400"
                                        onClick={handleMarkUserConverted}
                                    >
                                        <Trophy className="h-3.5 w-3.5 text-purple-400" /> Mark Converted
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-red-500/30 hover:bg-red-500/10 text-red-400"
                                        onClick={() => handleSetTrialOrSub("SUSPENDED")}
                                    >
                                        <ShieldAlert className="h-3.5 w-3.5" /> Suspend Access
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-orange-500/30 hover:bg-orange-500/10 text-orange-400"
                                        onClick={() => handleSetTrialOrSub("EXPIRED")}
                                    >
                                        <AlertTriangle className="h-3.5 w-3.5" /> Mark Expired
                                    </Button>
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <Button type="button" variant="outline" onClick={() => setSubModalUser(null)}>
                                    Close
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ========================================================================= */}
            {/* ADMIN RESET USER PASSWORD MODAL */}
            {/* ========================================================================= */}
            {resetModalUserId && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-md bg-[#121218] border-border/60 shadow-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg font-bold text-amber-500">
                                <KeyRound className="h-5 w-5 text-amber-500" /> Admin Reset User Password
                            </CardTitle>
                            <CardDescription>
                                Set a new password for <strong>{users.find(u => u.id === resetModalUserId)?.username}</strong>.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form 
                                onSubmit={handleAdminResetPassword} 
                                className="space-y-4"
                                autoComplete="off"
                                data-1p-ignore="true"
                                data-lpignore="true"
                            >
                                {adminResetMsg && (
                                    <div className="text-xs text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 p-3 rounded-lg flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                        <span>{adminResetMsg}</span>
                                    </div>
                                )}
                                {adminResetErr && (
                                    <div className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 p-3 rounded-lg flex items-center gap-2">
                                        <XCircle className="h-4 w-4 shrink-0" />
                                        <span>{adminResetErr}</span>
                                    </div>
                                )}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-semibold">New Password</Label>
                                    <Input 
                                        type="password" required 
                                        value={adminNewPass}
                                        onChange={(e) => setAdminNewPass(e.target.value)}
                                        placeholder="Enter new user password"
                                        className="bg-background/60"
                                        autoComplete="new-password"
                                        data-1p-ignore="true"
                                        data-lpignore="true"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end pt-2">
                                    <Button type="button" variant="outline" onClick={() => setResetModalUserId(null)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={adminResetLoading} className="bg-amber-600 hover:bg-amber-500 text-white font-semibold transition-all duration-200 hover:ring-2 hover:ring-amber-400/40 active:scale-95">
                                        {adminResetLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                        Save Password
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}
        </div>
    );
}