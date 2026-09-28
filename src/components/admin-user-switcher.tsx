"use client";

import { useState, useEffect, useTransition } from "react";
import { getAppUsers } from "@/app/actions";
import { impersonateUserAction } from "@/app/auth-actions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Eye, Loader2, UserCheck, Shield } from "lucide-react";

export default function AdminUserSwitcher() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [switching, setSwitching] = useState(false);
    const [selectedUser, setSelectedUser] = useState<string>("");
    const [isPending, startTransition] = useTransition();

    useEffect(() => {
        let mounted = true;
        async function loadUsers() {
            try {
                const list = await getAppUsers();
                if (mounted && Array.isArray(list)) {
                    // Exclude current admin or sort so users are easy to find
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
    }, []);

    const handleSelectUser = async (userId: string) => {
        if (!userId || userId === "none") return;
        setSelectedUser(userId);
        setSwitching(true);
        try {
            const res = await impersonateUserAction(userId);
            if (res && res.error) {
                alert(`Impersonation failed: ${res.error}`);
                setSwitching(false);
            } else {
                // Refresh dashboard immediately as this user
                window.location.href = "/";
            }
        } catch (err: any) {
            alert(`Error: ${err.message || "Failed to switch user"}`);
            setSwitching(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-[#121218]/60 border border-border/40 px-3 py-1.5 rounded-xl">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                <span>Loading user accounts...</span>
            </div>
        );
    }

    return (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-gradient-to-r from-purple-950/20 via-[#14141c] to-[#101017] border border-purple-500/30 rounded-2xl shadow-sm">
            <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-400">
                    <Eye className="h-4 w-4" />
                </div>
                <div>
                    <div className="text-xs font-bold text-foreground flex items-center gap-2">
                        <span>Admin Impersonation & Dashboard Preview</span>
                        <Badge variant="outline" className="text-[9px] bg-purple-500/10 text-purple-300 border-purple-500/30">
                            Admin Tool
                        </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                        Preview the dashboard exactly as a specific user sees it based on their account type (Trial, Full, or Super User).
                    </p>
                </div>
            </div>

            <div className="w-full sm:w-72 shrink-0">
                <Select value={selectedUser} onValueChange={handleSelectUser} disabled={switching}>
                    <SelectTrigger className="h-9 text-xs bg-background/80 border-purple-500/30">
                        {switching ? (
                            <span className="flex items-center gap-1.5 text-purple-300">
                                <Loader2 className="h-3 w-3 animate-spin" /> Switching view...
                            </span>
                        ) : (
                            <SelectValue placeholder="👁️ View Dashboard as User..." />
                        )}
                    </SelectTrigger>
                    <SelectContent className="max-h-72">
                        {users.map((u) => {
                            const isTrial = (u.status === "TRIAL" || u.membershipTier === "TRIAL") && u.status !== "APPROVED" && u.role !== "ADMIN";
                            const isSuper = u.role === "SUPER_USER";
                            const isAdmin = u.role === "ADMIN";

                            return (
                                <SelectItem key={u.id} value={u.id} className="text-xs py-2">
                                    <div className="flex items-center justify-between gap-2 w-full">
                                        <span className="font-semibold text-foreground">{u.username}</span>
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
        </div>
    );
}
