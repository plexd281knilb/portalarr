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
    approveAllPendingAppUsers
} from "@/app/actions";
import { changeUserPassword } from "@/app/auth-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { 
    Trash2, UserPlus, Shield, User, Mail, CheckCircle2, XCircle, 
    Clock, Play, RefreshCw, Loader2, KeyRound, Search, CheckCheck, Send, Edit2
} from "lucide-react";
import { format } from "date-fns";

export default function AccessSettingsPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingPlex, setSyncingPlex] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");
    const [filterStatus, setFilterStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");
    const [searchQuery, setSearchQuery] = useState("");

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

    useEffect(() => { loadUsers(); }, []);

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

    const pendingUsersCount = users.filter(u => u.status === "PENDING").length;

    const filteredUsers = users.filter(u => {
        const matchStatus = 
            filterStatus === "ALL" ? true :
            filterStatus === "PENDING" ? u.status === "PENDING" :
            filterStatus === "APPROVED" ? (u.status === "APPROVED" || !u.status) :
            filterStatus === "REJECTED" ? u.status === "REJECTED" : true;

        const q = searchQuery.toLowerCase().trim();
        const matchSearch = !q || 
            u.username.toLowerCase().includes(q) || 
            (u.email && u.email.toLowerCase().includes(q)) ||
            (u.kindleEmail && u.kindleEmail.toLowerCase().includes(q)) ||
            u.role.toLowerCase().includes(q);

        return matchStatus && matchSearch;
    });

    return (
        <div className="space-y-6 max-w-5xl">
            <div>
                <h3 className="text-lg font-medium">Access Control & User Management</h3>
                <p className="text-sm text-muted-foreground">
                    Provision accounts, manage user roles, process pending access requests, and sync accounts from your Plex Friends list.
                </p>
            </div>

            {/* PLEX AUTO-SYNC BANNER */}
            <Card className="border-[#e5a00d]/30 bg-[#e5a00d]/5">
                <CardContent className="pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2 font-medium text-foreground">
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
                        className="border-[#e5a00d]/40 text-[#e5a00d] hover:bg-[#e5a00d]/10 shrink-0 gap-2 h-10 font-semibold"
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
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <UserPlus className="h-5 w-5 text-primary" /> Create Account
                        </CardTitle>
                        <CardDescription>Add a new administrator or pre-approved user.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Username</Label>
                                <Input name="username" placeholder="e.g. jsmith" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input name="email" type="email" placeholder="user@example.com" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Password</Label>
                                <Input name="password" type="password" required placeholder="Minimum 6 characters" />
                            </div>
                            <div className="space-y-2">
                                <Label>Role</Label>
                                <Select name="role" defaultValue="USER">
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ADMIN">Admin (Full Access & Settings)</SelectItem>
                                        <SelectItem value="USER">User (Standard Access)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full font-semibold">
                                <UserPlus className="h-4 w-4 mr-2" /> Create Approved User
                            </Button>
                        </form>
                    </CardContent>
                </Card>

                {/* CHANGE PASSWORD FORM */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-primary" /> Change Your Password
                        </CardTitle>
                        <CardDescription>Update your logged-in administrator password.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleChangePassword} className="space-y-4">
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
                            <div className="space-y-2">
                                <Label>Current / Temp Password</Label>
                                <Input 
                                    type="password" required 
                                    value={passCurrent} 
                                    onChange={(e) => setPassCurrent(e.target.value)} 
                                    placeholder="Enter current password"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>New Password</Label>
                                <Input 
                                    type="password" required 
                                    value={passNew} 
                                    onChange={(e) => setPassNew(e.target.value)} 
                                    placeholder="Minimum 6 characters"
                                />
                            </div>
                            <Button type="submit" disabled={passLoading} className="w-full font-semibold">
                                {passLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                                Update My Password
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* ADMIN RESET USER PASSWORD MODAL */}
            {resetModalUserId && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
                    <Card className="w-full max-w-md bg-card border-muted/80 shadow-2xl">
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <KeyRound className="h-5 w-5 text-amber-500" /> Admin Reset User Password
                            </CardTitle>
                            <CardDescription>
                                Set a new password for <strong>{users.find(u => u.id === resetModalUserId)?.username}</strong>.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleAdminResetPassword} className="space-y-4">
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
                                <div className="space-y-2">
                                    <Label>New Password</Label>
                                    <Input 
                                        type="password" required 
                                        value={adminNewPass}
                                        onChange={(e) => setAdminNewPass(e.target.value)}
                                        placeholder="Enter new user password"
                                    />
                                </div>
                                <div className="flex gap-2 justify-end pt-2">
                                    <Button type="button" variant="outline" onClick={() => setResetModalUserId(null)}>
                                        Cancel
                                    </Button>
                                    <Button type="submit" disabled={adminResetLoading} className="bg-amber-600 hover:bg-amber-700 text-white font-semibold">
                                        {adminResetLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                                        Save Password
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* USER LIST & FILTERS */}
            <Card>
                <CardHeader className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <CardTitle>Existing Users & Access Directory</CardTitle>
                            <CardDescription>Manage user permissions, roles, Kindle emails, and account requests.</CardDescription>
                        </div>
                        {pendingUsersCount > 0 && (
                            <Button 
                                variant="default" 
                                size="sm" 
                                className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 font-semibold shrink-0"
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
                                placeholder="Search users..." 
                                className="pl-9 text-xs h-9"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* STATUS FILTER BUTTONS */}
                        <div className="flex flex-wrap gap-1.5 bg-muted/30 p-1 rounded-lg border border-muted/50 text-xs w-full sm:w-auto">
                            <Button 
                                variant={filterStatus === "ALL" ? "secondary" : "ghost"} 
                                size="sm" 
                                className="h-7 text-xs px-2.5"
                                onClick={() => setFilterStatus("ALL")}
                            >
                                All ({users.length})
                            </Button>
                            <Button 
                                variant={filterStatus === "PENDING" ? "secondary" : "ghost"} 
                                size="sm" 
                                className="h-7 text-xs px-2.5 text-amber-400"
                                onClick={() => setFilterStatus("PENDING")}
                            >
                                Pending ({users.filter(u => u.status === "PENDING").length})
                            </Button>
                            <Button 
                                variant={filterStatus === "APPROVED" ? "secondary" : "ghost"} 
                                size="sm" 
                                className="h-7 text-xs px-2.5 text-emerald-400"
                                onClick={() => setFilterStatus("APPROVED")}
                            >
                                Approved ({users.filter(u => u.status === "APPROVED" || !u.status).length})
                            </Button>
                            <Button 
                                variant={filterStatus === "REJECTED" ? "secondary" : "ghost"} 
                                size="sm" 
                                className="h-7 text-xs px-2.5 text-red-400"
                                onClick={() => setFilterStatus("REJECTED")}
                            >
                                Rejected ({users.filter(u => u.status === "REJECTED").length})
                            </Button>
                        </div>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="space-y-3">
                        {loading ? (
                            <div className="text-sm text-muted-foreground flex items-center gap-2 p-4">
                                <Loader2 className="h-4 w-4 animate-spin text-primary" /> Loading users directory...
                            </div>
                        ) : filteredUsers.length === 0 ? (
                            <div className="text-sm text-muted-foreground italic p-4 text-center border border-dashed rounded-xl">
                                No matching users found.
                            </div>
                        ) : (
                            filteredUsers.map((user) => (
                                <div key={user.id} className={`flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-xl gap-4 transition-all duration-200 ${user.status === "PENDING" ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/20 hover:bg-muted/30"}`}>
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                                            {user.role === "ADMIN" ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}
                                        </div>
                                        <div className="space-y-1.5 flex-1 min-w-0">
                                            <div className="font-semibold text-sm flex flex-wrap items-center gap-2">
                                                <span className="truncate">{user.username}</span>
                                                {user.status === "PENDING" && (
                                                    <Badge variant="outline" className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-[10px] gap-1">
                                                        <Clock className="h-3 w-3" /> Pending Approval
                                                    </Badge>
                                                )}
                                                {user.status === "REJECTED" && (
                                                    <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                                                        Rejected
                                                    </Badge>
                                                )}
                                                {user.kindleEmail ? (
                                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-[10px] gap-1" title={user.kindleEmail}>
                                                        <Send className="h-3 w-3" /> Kindle Ready
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-slate-500/10 text-slate-400 border-slate-700/50 text-[10px]">
                                                        No Kindle Email
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
                                                <span className="flex items-center gap-1">
                                                    <Mail className="h-3 w-3 text-muted-foreground" /> {user.email || "No Email"}
                                                </span>
                                                <span>•</span>
                                                <span>Registered {format(new Date(user.createdAt), "MMM d, yyyy")}</span>
                                            </div>

                                            {/* INLINE KINDLE EMAIL DISPLAY / EDIT */}
                                            <div className="pt-1 flex items-center gap-2 text-xs">
                                                {editingKindleUserId === user.id ? (
                                                    <div className="flex items-center gap-2 w-full max-w-sm">
                                                        <Input 
                                                            className="h-7 text-xs" 
                                                            placeholder="e.g. user_123@kindle.com"
                                                            value={kindleEmailInput}
                                                            onChange={(e) => setKindleEmailInput(e.target.value)}
                                                        />
                                                        <Button size="sm" className="h-7 px-2 text-xs" onClick={() => handleSaveKindleEmail(user.id)}>
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
                                                            className="h-5 w-5 text-muted-foreground hover:text-foreground opacity-60 group-hover/k:opacity-100"
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
                                        {/* ROLE SELECTOR */}
                                        <Select defaultValue={user.role} onValueChange={(val) => handleRoleChange(user.id, val)}>
                                            <SelectTrigger className="h-8 text-xs w-28 bg-background border-muted">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="ADMIN">Admin</SelectItem>
                                                <SelectItem value="USER">User</SelectItem>
                                            </SelectContent>
                                        </Select>

                                        {user.status === "PENDING" ? (
                                            <>
                                                <Button size="sm" variant="default" className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1 text-xs font-semibold" onClick={() => handleApprove(user.id)}>
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-8 px-2.5 text-red-400 border-red-800/40 hover:bg-red-950/40 gap-1 text-xs" onClick={() => handleReject(user.id)}>
                                                    <XCircle className="h-3.5 w-3.5" /> Reject
                                                </Button>
                                            </>
                                        ) : user.status === "REJECTED" ? (
                                            <Button size="sm" variant="outline" className="h-8 px-2.5 text-emerald-400 border-emerald-800/40 hover:bg-emerald-950/40 gap-1 text-xs" onClick={() => handleApprove(user.id)}>
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                            </Button>
                                        ) : null}

                                        {/* ADMIN RESET PASSWORD BUTTON */}
                                        <Button 
                                            size="sm" 
                                            variant="outline" 
                                            className="h-8 px-2.5 text-xs text-amber-500 border-amber-500/30 hover:bg-amber-500/10 gap-1"
                                            onClick={() => {
                                                setResetModalUserId(user.id);
                                                setAdminResetMsg("");
                                                setAdminResetErr("");
                                            }}
                                            title="Set New Password for User"
                                        >
                                            <KeyRound className="h-3.5 w-3.5" /> Reset Pass
                                        </Button>

                                        <Button 
                                            size="icon" 
                                            variant="ghost" 
                                            className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/40" 
                                            onClick={() => handleDelete(user.id)} 
                                            title="Delete User"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}