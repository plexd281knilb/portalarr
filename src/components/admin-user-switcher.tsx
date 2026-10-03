"use client";

import { useState, useEffect } from "react";
import { getImpersonationUserListAction, impersonateUserAction, stopImpersonationAction } from "@/app/auth-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eye, Loader2, Undo2, UserCheck, Shield } from "lucide-react";

interface AdminUserSwitcherProps {
    initialUsers?: any[];
    currentUserId?: string;
    currentUsername?: string;
    isImpersonating?: boolean;
}

export default function AdminUserSwitcher({
    initialUsers,
    currentUserId,
    currentUsername,
    isImpersonating = false
}: AdminUserSwitcherProps) {
    const [users, setUsers] = useState<any[]>(initialUsers || []);
    const [loading, setLoading] = useState(!initialUsers || initialUsers.length === 0);
    const [switching, setSwitching] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string>(currentUserId || "");

    useEffect(() => {
        if (initialUsers && initialUsers.length > 0) {
            setUsers(initialUsers);
            setLoading(false);
            return;
        }

        let mounted = true;
        async function loadUsers() {
            try {
                const list = await getImpersonationUserListAction();
                if (mounted && Array.isArray(list)) {
                    setUsers(list);
                }
            } catch (err) {
                console.error("Failed to fetch users for impersonation switcher:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        }
        loadUsers();
        return () => { mounted = false; };
    }, [initialUsers]);

    const handleSelectUser = async (userId: string) => {
        if (!userId || userId === "none") return;
        setSelectedUser(userId);
        setSwitching(true);

        try {
            if (userId === "admin") {
                const res = await stopImpersonationAction();
                if (res && res.error) {
                    alert(`Failed to restore admin: ${res.error}`);
                    setSwitching(false);
                    return;
                }
                window.location.assign("/");
                return;
            }

            const res = await impersonateUserAction(userId);
            if (res && res.error) {
                alert(`Impersonation failed: ${res.error}`);
                setSwitching(false);
            } else {
                // Instantly navigate to root dashboard as the selected user
                window.location.assign("/");
            }
        } catch (err: any) {
            alert(`Error: ${err.message || "Failed to switch user"}`);
            setSwitching(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-[#121218]/60 border border-border/40 px-3 py-2 rounded-xl">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Loading user accounts for switcher...</span>
            </div>
        );
    }

    const containerGradient = isImpersonating
        ? "bg-gradient-to-r from-amber-950/40 via-[#181410] to-[#12100d] border-amber-500/40 shadow-amber-950/20"
        : "bg-gradient-to-r from-purple-950/20 via-[#14141c] to-[#101017] border-purple-500/30";

    return (
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 border rounded-2xl shadow-sm transition-all ${containerGradient}`}>
            <div className="flex items-center gap-2.5">
                <div className={`p-1.5 rounded-lg ${isImpersonating ? "bg-amber-500/20 text-amber-400" : "bg-purple-500/10 text-purple-400"}`}>
                    <Eye className={`h-4 w-4 ${isImpersonating ? "animate-pulse" : ""}`} />
                </div>
                <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-2">
                        <span>
                            {isImpersonating 
                                ? `Viewing Site as: ${currentUsername || "User"}` 
                                : "Admin Impersonation & Dashboard Preview"}
                        </span>
                        <Badge 
                            variant="outline" 
                            className={`text-[9px] ${
                                isImpersonating 
                                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 font-bold" 
                                    : "bg-purple-500/10 text-purple-300 border-purple-500/30"
                            }`}
                        >
                            {isImpersonating ? "Preview Active" : "Admin Tool"}
                        </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        {isImpersonating
                            ? "Experiencing the dashboard exactly as this member sees it. Switch between accounts or exit back to Admin anytime."
                            : "Preview the dashboard exactly as a specific user sees it based on their account type (Trial, Full, or Super User)."}
                    </p>
                </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
                <div className="w-full sm:w-72 shrink-0">
                    <Select value={selectedUser} onValueChange={handleSelectUser} disabled={switching}>
                        <SelectTrigger className={`h-9 text-xs bg-background/80 ${isImpersonating ? "border-amber-500/40 text-amber-200" : "border-purple-500/30"}`}>
                            {switching ? (
                                <span className="flex items-center gap-1.5 text-purple-300">
                                    <Loader2 className="h-3 w-3 animate-spin" /> Switching view...
                                </span>
                            ) : (
                                <SelectValue placeholder={isImpersonating ? `👁️ ${currentUsername || "Switch User..."}` : "👁️ View Dashboard as User..."} />
                            )}
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                            {isImpersonating && (
                                <SelectItem value="admin" className="text-xs py-2 font-bold text-amber-400 border-b border-border/40">
                                    <span className="flex items-center gap-1.5">
                                        <Undo2 className="h-3.5 w-3.5 text-amber-400" />
                                        <span>⬅️ Return to Admin Mission Control</span>
                                    </span>
                                </SelectItem>
                            )}
                            {users.map((u) => {
                                const isTrial = (u.status === "TRIAL" || u.membershipTier === "TRIAL") && u.status !== "APPROVED" && u.role !== "ADMIN";
                                const isSuper = u.role === "SUPER_USER";
                                const isAdmin = u.role === "ADMIN";
                                const isCurrent = u.id === currentUserId;

                                return (
                                    <SelectItem key={u.id} value={u.id} className="text-xs py-2">
                                        <div className="flex items-center justify-between gap-2 w-full">
                                            <span className={`font-semibold ${isCurrent ? "text-amber-400 underline decoration-amber-400/50" : "text-foreground"}`}>
                                                {u.username} {isCurrent && "(Active)"}
                                            </span>
                                            <div className="flex items-center gap-1 shrink-0">
                                                {isTrial ? (
                                                    <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-400 border-amber-500/30">
                                                        Trial
                                                    </Badge>
                                                ) : isSuper ? (
                                                    <Badge variant="outline" className="text-[9px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                                                        Super User
                                                    </Badge>
                                                ) : isAdmin ? (
                                                    <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-300 border-purple-500/30">
                                                        Admin
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                                        Full User
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </SelectItem>
                                );
                            })}
                        </SelectContent>
                    </Select>
                </div>

                {isImpersonating && (
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleSelectUser("admin")}
                        disabled={switching}
                        className="h-9 px-3 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/40 text-xs font-bold gap-1.5 shrink-0 active:scale-95 transition-all"
                    >
                        {switching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5" />}
                        <span className="hidden md:inline">Return to Admin</span>
                        <span className="md:hidden">Admin</span>
                    </Button>
                )}
            </div>
        </div>
    );
}
