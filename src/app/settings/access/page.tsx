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
    updateUserPlexLibraries,
    setUserTrialOrSubscription,
    markUserConverted,
    getReferralStats,
    getPaymentAndTrialSettings,
    savePaymentAndTrialSettings
} from "@/app/actions";
import { changeUserPassword } from "@/app/auth-actions";
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
    FolderCheck, ShieldAlert, Check, Users, ArrowUpRight, Copy
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
    const [userSelectedSections, setUserSelectedSections] = useState<number[]>([]);
    const [savingUserLibs, setSavingUserLibs] = useState(false);
    const [libSuccessMsg, setLibSuccessMsg] = useState("");
    const [libErrMsg, setLibErrMsg] = useState("");

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
        paymentInstructions: "",
        subscriptionPrice: "",
        requireReferralForSignup: false
    });
    const [defaultSelectedSections, setDefaultSelectedSections] = useState<number[]>([]);
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
        const data = await getAppUsers();
        setUsers(data || []);
        setLoading(false);
    };

    const loadLibraries = async () => {
        setLoadingLibraries(true);
        const res = await fetchPlexServerLibraries();
        if (res.success && res.servers) {
            setServerLibraries(res.servers);
        }
        setLoadingLibraries(false);
    };

    const loadReferrals = async () => {
        setLoadingReferrals(true);
        const res = await getReferralStats();
        if (res.success && res.stats) {
            setReferralStats(res.stats);
        }
        setLoadingReferrals(false);
    };

    const loadPaymentSettings = async () => {
        const res = await getPaymentAndTrialSettings();
        if (res.success && res.settings) {
            setPaymentSettings(res.settings);
            if (res.settings.defaultPlexLibraries) {
                const ids = res.settings.defaultPlexLibraries
                    .split(",")
                    .map((s: string) => parseInt(s.trim(), 10))
                    .filter((n: number) => !isNaN(n));
                setDefaultSelectedSections(ids);
            }
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
    const handleOpenLibrariesModal = (user: any) => {
        setLibModalUser(user);
        setLibSuccessMsg("");
        setLibErrMsg("");
        let sections: number[] = [];
        if (user.plexLibrarySectionIds) {
            sections = user.plexLibrarySectionIds
                .split(",")
                .map((s: string) => parseInt(s.trim(), 10))
                .filter((n: number) => !isNaN(n));
        } else if (paymentSettings.defaultPlexLibraries) {
            sections = paymentSettings.defaultPlexLibraries
                .split(",")
                .map((s: string) => parseInt(s.trim(), 10))
                .filter((n: number) => !isNaN(n));
        }
        setUserSelectedSections(sections);
    };

    const handleToggleUserSection = (sectionId: number) => {
        setUserSelectedSections(prev => 
            prev.includes(sectionId) ? prev.filter(id => id !== sectionId) : [...prev, sectionId]
        );
    };

    const handleSelectAllSections = (allSectionIds: number[]) => {
        setUserSelectedSections(allSectionIds);
    };

    const handleDeselectAllSections = () => {
        setUserSelectedSections([]);
    };

    const handleSaveUserLibraries = async () => {
        if (!libModalUser) return;
        setSavingUserLibs(true);
        setLibSuccessMsg("");
        setLibErrMsg("");

        const res = await updateUserPlexLibraries(libModalUser.id, userSelectedSections);
        setSavingUserLibs(false);
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
        type: "TRIAL" | "30_DAYS" | "1_YEAR" | "PERMANENT" | "SUSPENDED" | "EXPIRED"
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
        formData.append("defaultPlexLibraries", defaultSelectedSections.join(","));
        formData.append("paymentPaypal", paymentSettings.paymentPaypal);
        formData.append("paymentVenmo", paymentSettings.paymentVenmo);
        formData.append("paymentInstructions", paymentSettings.paymentInstructions);
        formData.append("subscriptionPrice", paymentSettings.subscriptionPrice);
        formData.append("requireReferralForSignup", String(paymentSettings.requireReferralForSignup));

        const res = await savePaymentAndTrialSettings(formData);
        setSavingSettings(false);
        if (res.success) {
            setSettingsSuccessMsg(res.message || "Settings saved successfully!");
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

    // Flatten all sections across servers
    const allSections = serverLibraries.flatMap(s => s.sections || []);

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h3 className="text-xl font-bold tracking-tight text-emerald-400">Access Control & User Directory</h3>
                <p className="text-sm text-muted-foreground">
                    Provision accounts, manage Plex library access, configure trial periods & subscriptions, and track member referrals.
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
                                            : "Default";

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
                                                        Libraries ({userLibraryCount})
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
                                <Sparkles className="h-5 w-5 text-emerald-400" /> Wizarr-Style Onboarding & Payment Settings
                            </CardTitle>
                            <CardDescription>
                                Configure default trial length, pre-assigned Plex libraries for new joiners, payment gateways (PayPal / Venmo), and subscription details.
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

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Default Free Trial Duration (Days)</Label>
                                        <Input 
                                            type="number"
                                            min="1"
                                            max="365"
                                            value={paymentSettings.defaultTrialDays}
                                            onChange={(e) => setPaymentSettings({ ...paymentSettings, defaultTrialDays: parseInt(e.target.value, 10) || 14 })}
                                            className="bg-background/60"
                                            required
                                        />
                                        <p className="text-[11px] text-muted-foreground">Prospective users signing up via invite links receive this trial length automatically.</p>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Subscription Rate / Price Display</Label>
                                        <Input 
                                            placeholder="e.g. $10 / month or $100 / year"
                                            value={paymentSettings.subscriptionPrice}
                                            onChange={(e) => setPaymentSettings({ ...paymentSettings, subscriptionPrice: e.target.value })}
                                            className="bg-background/60"
                                        />
                                        <p className="text-[11px] text-muted-foreground">Displayed on the onboarding screen and expired trial paywall.</p>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-border/40">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">PayPal Username or Me Link</Label>
                                        <Input 
                                            placeholder="e.g. paypal.me/YourUsername or admin@example.com"
                                            value={paymentSettings.paymentPaypal}
                                            onChange={(e) => setPaymentSettings({ ...paymentSettings, paymentPaypal: e.target.value })}
                                            className="bg-background/60"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold">Venmo Handle</Label>
                                        <Input 
                                            placeholder="e.g. @YourVenmoHandle"
                                            value={paymentSettings.paymentVenmo}
                                            onChange={(e) => setPaymentSettings({ ...paymentSettings, paymentVenmo: e.target.value })}
                                            className="bg-background/60"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5 pt-2 border-t border-border/40">
                                    <Label className="text-xs font-semibold">Custom Payment & Subscription Instructions</Label>
                                    <Textarea 
                                        rows={3}
                                        placeholder="e.g. Send payment via Friends & Family. Please include your username in the transaction note so your subscription can be activated immediately!"
                                        value={paymentSettings.paymentInstructions}
                                        onChange={(e) => setPaymentSettings({ ...paymentSettings, paymentInstructions: e.target.value })}
                                        className="bg-background/60 text-xs"
                                    />
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

                                    {allSections.length === 0 ? (
                                        <div className="text-xs text-muted-foreground italic p-4 bg-muted/20 rounded-xl border border-border/40">
                                            No Plex libraries detected. Verify your Admin Plex token is configured in Settings.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 p-3 bg-muted/10 rounded-xl border border-border/40">
                                            {allSections.map((sec) => {
                                                const isChecked = defaultSelectedSections.includes(Number(sec.key));
                                                return (
                                                    <label 
                                                        key={sec.key} 
                                                        className={`flex items-center gap-2.5 p-2 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                                                            isChecked ? "bg-primary/15 border-primary/40 text-foreground" : "bg-background/40 border-border/30 text-muted-foreground hover:text-foreground"
                                                        }`}
                                                    >
                                                        <input 
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => {
                                                                const num = Number(sec.key);
                                                                setDefaultSelectedSections(prev => 
                                                                    prev.includes(num) ? prev.filter(x => x !== num) : [...prev, num]
                                                                );
                                                            }}
                                                            className="rounded border-border text-primary focus:ring-primary h-4 w-4"
                                                        />
                                                        <span className="truncate">{sec.title} ({sec.type})</span>
                                                    </label>
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

                            <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground font-semibold">
                                    {userSelectedSections.length} of {allSections.length} libraries selected
                                </span>
                                <div className="flex gap-2">
                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        size="sm" 
                                        className="h-7 text-xs px-2"
                                        onClick={() => handleSelectAllSections(allSections.map(s => Number(s.key)))}
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

                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                {allSections.length === 0 ? (
                                    <div className="text-xs text-muted-foreground italic p-4 text-center">
                                        No libraries found. Ensure your Admin Plex Token is connected.
                                    </div>
                                ) : (
                                    allSections.map((sec) => {
                                        const isChecked = userSelectedSections.includes(Number(sec.key));
                                        return (
                                            <div 
                                                key={sec.key} 
                                                onClick={() => handleToggleUserSection(Number(sec.key))}
                                                className={`flex items-center justify-between p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                                                    isChecked 
                                                        ? "bg-primary/10 border-primary/50 text-foreground" 
                                                        : "bg-muted/10 border-border/30 text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <input 
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => {}}
                                                        className="rounded border-border text-primary focus:ring-primary h-4 w-4 pointer-events-none"
                                                    />
                                                    <div>
                                                        <span className="font-semibold block">{sec.title}</span>
                                                        <span className="text-[10px] text-muted-foreground uppercase">{sec.type}</span>
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[10px]">
                                                    ID: {sec.key}
                                                </Badge>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="flex gap-2 justify-end pt-3 border-t border-border/40">
                                <Button type="button" variant="outline" onClick={() => setLibModalUser(null)}>
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
                                        onClick={() => handleSetTrialOrSub("TRIAL")}
                                    >
                                        <Timer className="h-3.5 w-3.5" /> Grant 14-Day Trial
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400"
                                        onClick={() => handleSetTrialOrSub("30_DAYS")}
                                    >
                                        <DollarSign className="h-3.5 w-3.5" /> Add 30 Days Sub
                                    </Button>

                                    <Button 
                                        type="button" 
                                        variant="outline" 
                                        disabled={subActionLoading}
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400"
                                        onClick={() => handleSetTrialOrSub("1_YEAR")}
                                    >
                                        <CheckCircle2 className="h-3.5 w-3.5" /> Add 1 Year Sub
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
                                        className="h-9 text-xs font-semibold justify-start gap-2 border-purple-500/30 hover:bg-purple-500/10 text-purple-400 col-span-2"
                                        onClick={handleMarkUserConverted}
                                    >
                                        <Trophy className="h-3.5 w-3.5 text-purple-400" /> Mark as Paid Conversion (Awards Referral)
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