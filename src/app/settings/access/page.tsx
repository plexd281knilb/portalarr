"use client";

import { useState, useEffect } from "react";
import { getAppUsers, createAppUser, deleteAppUser, approveAppUser, rejectAppUser, syncPlexFriendsAction } from "@/app/actions";
import { changeUserPassword } from "@/app/auth-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Trash2, UserPlus, Shield, User, Mail, CheckCircle2, XCircle, Clock, Play, RefreshCw, Loader2, KeyRound } from "lucide-react";
import { format } from "date-fns";

export default function AccessSettingsPage() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingPlex, setSyncingPlex] = useState(false);
    const [syncMessage, setSyncMessage] = useState("");

    // Change Password state
    const [passCurrent, setPassCurrent] = useState("");
    const [passNew, setPassNew] = useState("");
    const [passMsg, setPassMsg] = useState("");
    const [passErr, setPassErr] = useState("");
    const [passLoading, setPassLoading] = useState(false);

    const loadUsers = async () => {
        setLoading(true);
        const data = await getAppUsers();
        setUsers(data);
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

    return (
        <div className="space-y-6 max-w-4xl">
            <div>
                <h3 className="text-lg font-medium">Access Management</h3>
                <p className="text-sm text-muted-foreground">
                    Create accounts, manage user access requests, and sync accounts from your Plex Friends list.
                </p>
            </div>

            {/* PLEX AUTO-SYNC CARD */}
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
                        className="border-[#e5a00d]/40 text-[#e5a00d] hover:bg-[#e5a00d]/10 shrink-0 gap-2 h-10"
                        onClick={handleSyncPlex}
                        disabled={syncingPlex}
                    >
                        {syncingPlex ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Sync Plex Friends Now
                    </Button>
                </CardContent>
            </Card>

            <div className="grid gap-8 md:grid-cols-2">
                {/* CREATE USER FORM */}
                <Card>
                    <CardHeader>
                        <CardTitle>Create Account</CardTitle>
                        <CardDescription>Add a new administrator or pre-approved standard user.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div className="space-y-2">
                                <Label>Username</Label>
                                <Input name="username" placeholder="e.g. admin" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Email Address</Label>
                                <Input name="email" type="email" placeholder="admin@example.com" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Password</Label>
                                <Input name="password" type="password" required />
                            </div>
                            <div className="space-y-2">
                                <Label>Role</Label>
                                <Select name="role" defaultValue="USER">
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ADMIN">Admin (Full Access)</SelectItem>
                                        <SelectItem value="USER">User (Standard Access)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button type="submit" className="w-full">
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
                        <CardDescription>Update your personal account password.</CardDescription>
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
                                    placeholder="Enter current or temporary password"
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
                            <Button type="submit" disabled={passLoading} className="w-full">
                                {passLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <KeyRound className="h-4 w-4 mr-2" />}
                                Update Password
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>

            {/* USER LIST */}
            <Card>
                <CardHeader>
                    <CardTitle>Existing Users & Requests</CardTitle>
                    <CardDescription>Review pending requests and manage current access.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {loading ? (
                            <div className="text-sm text-muted-foreground">Loading users...</div>
                        ) : users.length === 0 ? (
                            <div className="text-sm text-muted-foreground italic">No users created yet.</div>
                        ) : (
                            users.map((user) => (
                                <div key={user.id} className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 border rounded-xl gap-3 ${user.status === "PENDING" ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/20"}`}>
                                    <div className="flex items-start sm:items-center gap-3">
                                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                                            {user.role === "ADMIN" ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}
                                        </div>
                                        <div className="space-y-0.5">
                                            <div className="font-medium flex items-center gap-2">
                                                <span>{user.username}</span>
                                                {user.status === "PENDING" && (
                                                    <Badge variant="outline" className="bg-amber-500/20 text-amber-500 border-amber-500/30 text-[10px] gap-1">
                                                        <Clock className="h-3 w-3" /> Pending Approval
                                                    </Badge>
                                                )}
                                                {user.status === "REJECTED" && (
                                                    <Badge variant="outline" className="bg-red-500/20 text-red-400 border-red-500/30 text-[10px]">
                                                        Rejected
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="text-xs text-muted-foreground flex items-center gap-1">
                                                <Mail className="h-3 w-3" /> {user.email || "No Email"}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                                Registered {format(new Date(user.createdAt), "MMM d, yyyy")}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1.5 self-end sm:self-center">
                                        {user.status === "PENDING" ? (
                                            <>
                                                <Button size="sm" variant="default" className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={() => handleApprove(user.id)}>
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                                </Button>
                                                <Button size="sm" variant="outline" className="h-8 px-2.5 text-red-400 border-red-800/40 hover:bg-red-950/40 gap-1" onClick={() => handleReject(user.id)}>
                                                    <XCircle className="h-3.5 w-3.5" /> Reject
                                                </Button>
                                            </>
                                        ) : user.status === "REJECTED" ? (
                                            <Button size="sm" variant="outline" className="h-8 px-2.5 text-emerald-400 border-emerald-800/40 hover:bg-emerald-950/40 gap-1" onClick={() => handleApprove(user.id)}>
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                                            </Button>
                                        ) : (
                                            <Badge variant={user.role === "ADMIN" ? "default" : "secondary"}>{user.role}</Badge>
                                        )}

                                        <Button size="icon" variant="ghost" className="h-8 w-8 text-red-400 hover:text-red-300 hover:bg-red-950/40" onClick={() => handleDelete(user.id)} title="Delete User">
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

