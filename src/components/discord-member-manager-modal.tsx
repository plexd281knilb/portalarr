"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Gamepad2,
    CheckCircle2,
    XCircle,
    RefreshCw,
    Loader2,
    Search,
    Link,
    Unlink,
    Sparkles,
    UploadCloud,
    DownloadCloud,
    Users,
    Shield,
    Clock,
    UserCheck,
    ChevronRight,
    AlertCircle
} from "lucide-react";
import {
    getDiscordMembersWithStatusAction,
    linkUserToDiscordAction,
    unlinkUserFromDiscordAction,
    syncUserRoleToDiscordAction,
    syncAllUsersRolesToDiscordAction,
    syncDiscordRolesToPortalarrAction,
    syncAllDiscordRolesToPortalarrAction,
    autoMatchDiscordUsersAction
} from "@/app/discord-actions";

interface DiscordMemberInfo {
    id: string;
    username: string;
    discriminator?: string;
    globalName?: string | null;
    nickname?: string | null;
    avatarUrl?: string;
    roles: string[];
    joinedAt?: string;
    linkedUserId?: string | null;
    linkedUsername?: string | null;
    suggestedMatch?: {
        userId: string;
        username: string;
        confidence: number;
        matchReason: string;
    } | null;
}

interface DiscordMemberManagerModalProps {
    isOpen: boolean;
    onClose: () => void;
    portalarrUsers: any[];
    onUserUpdated?: () => void;
}

export function DiscordMemberManagerModal({
    isOpen,
    onClose,
    portalarrUsers,
    onUserUpdated
}: DiscordMemberManagerModalProps) {
    const [members, setMembers] = useState<DiscordMemberInfo[]>([]);
    const [loading, setLoading] = useState(false);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterTab, setFilterTab] = useState<"all" | "unlinked" | "linked" | "suggested">("all");
    const [successMsg, setSuccessMsg] = useState("");
    const [errorMsg, setErrorMsg] = useState("");
    const [selectedUserToLink, setSelectedUserToLink] = useState<Record<string, string>>({});

    const loadMembers = async () => {
        setLoading(true);
        setErrorMsg("");
        try {
            const res = await getDiscordMembersWithStatusAction();
            if (res.success && res.members) {
                setMembers(res.members);
            } else {
                setErrorMsg(res.error || "Failed to load Discord guild members");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Network error loading Discord members");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadMembers();
            setSuccessMsg("");
            setErrorMsg("");
        }
    }, [isOpen]);

    // Available Portalarr users not yet linked to any Discord account
    const unlinkedPortalarrUsers = useMemo(() => {
        const linkedUserIds = new Set(members.filter(m => m.linkedUserId).map(m => m.linkedUserId));
        return portalarrUsers.filter(u => !linkedUserIds.has(u.id));
    }, [portalarrUsers, members]);

    // Filtered member list
    const filteredMembers = useMemo(() => {
        return members.filter(m => {
            // Tab filter
            if (filterTab === "linked" && !m.linkedUserId) return false;
            if (filterTab === "unlinked" && m.linkedUserId) return false;
            if (filterTab === "suggested" && (!m.suggestedMatch || m.linkedUserId)) return false;

            // Search filter
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            const username = m.username.toLowerCase();
            const nickname = (m.nickname || "").toLowerCase();
            const globalName = (m.globalName || "").toLowerCase();
            const linkedUser = (m.linkedUsername || "").toLowerCase();
            const suggestedUser = (m.suggestedMatch?.username || "").toLowerCase();

            return (
                username.includes(q) ||
                nickname.includes(q) ||
                globalName.includes(q) ||
                linkedUser.includes(q) ||
                suggestedUser.includes(q) ||
                m.id.includes(q)
            );
        });
    }, [members, filterTab, searchQuery]);

    // Handler: 1-click link
    const handleLinkUser = async (discordMember: DiscordMemberInfo, targetUserId: string) => {
        setActionLoading(`link-${discordMember.id}`);
        setErrorMsg("");
        setSuccessMsg("");
        try {
            const res = await linkUserToDiscordAction({
                userId: targetUserId,
                discordId: discordMember.id,
                discordUsername: discordMember.username,
                discordDiscriminator: discordMember.discriminator,
                discordAvatar: discordMember.avatarUrl
            });
            if (res.success) {
                setSuccessMsg(`Successfully linked @${discordMember.username} to account! Roles synchronized.`);
                await loadMembers();
                if (onUserUpdated) onUserUpdated();
            } else {
                setErrorMsg(res.error || "Failed to link user");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to link user");
        } finally {
            setActionLoading(null);
        }
    };

    // Handler: Unlink
    const handleUnlink = async (discordMember: DiscordMemberInfo) => {
        if (!discordMember.linkedUserId) return;
        setActionLoading(`unlink-${discordMember.id}`);
        setErrorMsg("");
        setSuccessMsg("");
        try {
            const res = await unlinkUserFromDiscordAction(discordMember.linkedUserId);
            if (res.success) {
                setSuccessMsg(`Unlinked @${discordMember.username} successfully.`);
                await loadMembers();
                if (onUserUpdated) onUserUpdated();
            } else {
                setErrorMsg(res.error || "Failed to unlink user");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to unlink user");
        } finally {
            setActionLoading(null);
        }
    };

    // Handler: Sync single user role
    const handleSyncSingle = async (discordMember: DiscordMemberInfo) => {
        if (!discordMember.linkedUserId) return;
        setActionLoading(`sync-${discordMember.id}`);
        setErrorMsg("");
        setSuccessMsg("");
        try {
            const res = await syncUserRoleToDiscordAction(discordMember.linkedUserId);
            if (res.success) {
                setSuccessMsg(`Updated role on Discord for @${discordMember.username}.`);
                await loadMembers();
            } else {
                setErrorMsg(res.error || "Failed to sync role");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Failed to sync role");
        } finally {
            setActionLoading(null);
        }
    };

    // Handler: Batch Auto-Match
    const handleBatchAutoMatch = async () => {
        setActionLoading("auto-match");
        setErrorMsg("");
        setSuccessMsg("");
        try {
            const res = await autoMatchDiscordUsersAction();
            if (res.success) {
                setSuccessMsg(`Auto-matched and linked ${res.linkedCount} Discord members!`);
                await loadMembers();
                if (onUserUpdated) onUserUpdated();
            } else {
                setErrorMsg(res.error || "Auto-match failed");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Auto-match failed");
        } finally {
            setActionLoading(null);
        }
    };

    // Handler: Batch Push Roles (Portalarr -> Discord)
    const handleBatchPushRoles = async () => {
        setActionLoading("batch-push");
        setErrorMsg("");
        setSuccessMsg("");
        try {
            const res = await syncAllUsersRolesToDiscordAction();
            if (res.success) {
                setSuccessMsg(`Synchronized roles to Discord for ${res.syncedCount} linked members!`);
                await loadMembers();
            } else {
                setErrorMsg(res.errors?.join(", ") || "Batch role push failed");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Batch role push failed");
        } finally {
            setActionLoading(null);
        }
    };

    // Handler: Batch Pull Roles (Discord -> Portalarr)
    const handleBatchPullRoles = async () => {
        setActionLoading("batch-pull");
        setErrorMsg("");
        setSuccessMsg("");
        try {
            const res = await syncAllDiscordRolesToPortalarrAction();
            if (res.success) {
                setSuccessMsg(`Pulled roles from Discord into Portalarr for ${res.syncedCount} members!`);
                await loadMembers();
                if (onUserUpdated) onUserUpdated();
            } else {
                setErrorMsg(res.errors?.join(", ") || "Batch role pull failed");
            }
        } catch (e: any) {
            setErrorMsg(e.message || "Batch role pull failed");
        } finally {
            setActionLoading(null);
        }
    };

    const linkedCount = members.filter(m => m.linkedUserId).length;
    const unlinkedCount = members.length - linkedCount;
    const suggestedCount = members.filter(m => !m.linkedUserId && m.suggestedMatch).length;

    return (
        <Dialog open={isOpen} onOpenChange={onClose}>
            <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[90vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-[#0d0e15] border border-border/60 shadow-2xl rounded-2xl">
                {/* HEADER */}
                <DialogHeader className="shrink-0 space-y-2 pb-2 border-b border-border/40">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="space-y-1">
                            <DialogTitle className="text-xl font-extrabold flex items-center gap-2 text-foreground">
                                <div className="p-1.5 rounded-lg bg-[#5865F2]/20 border border-[#5865F2]/40 text-[#5865F2]">
                                    <Gamepad2 className="h-5 w-5" />
                                </div>
                                Discord Member & Role Synchronization
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">
                                Bridges Discord accounts with Portalarr users when usernames differ. Automatically synchronizes server roles.
                            </DialogDescription>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge variant="outline" className="bg-[#5865F2]/15 text-[#5865F2] border-[#5865F2]/30 text-xs font-semibold px-2.5 py-1">
                                {linkedCount} Linked / {unlinkedCount} Unlinked
                            </Badge>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={loadMembers}
                                disabled={loading}
                                className="h-8 px-2.5 text-xs font-semibold gap-1.5 cursor-pointer hover:bg-muted"
                                title="Refresh Discord member list"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
                                <span className="hidden sm:inline">Refresh</span>
                            </Button>
                        </div>
                    </div>

                    {/* BATCH ACTION TOOLBAR */}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                        <Button
                            variant="default"
                            size="sm"
                            onClick={handleBatchAutoMatch}
                            disabled={actionLoading !== null || suggestedCount === 0}
                            className="h-8 px-3 text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white gap-1.5 shadow-xs cursor-pointer active:scale-95"
                            title="Automatically pairs unlinked Discord members whose names match Portalarr accounts"
                        >
                            {actionLoading === "auto-match" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5" />
                            )}
                            Auto-Match High Confidence ({suggestedCount})
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleBatchPushRoles}
                            disabled={actionLoading !== null || linkedCount === 0}
                            className="h-8 px-3 text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/30 gap-1.5 cursor-pointer active:scale-95"
                            title="Pushes active membership status to Discord for all linked members"
                        >
                            {actionLoading === "batch-push" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
                            ) : (
                                <UploadCloud className="h-3.5 w-3.5 text-emerald-400" />
                            )}
                            Push Roles to Discord
                        </Button>

                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleBatchPullRoles}
                            disabled={actionLoading !== null || linkedCount === 0}
                            className="h-8 px-3 text-xs font-semibold bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border-blue-500/30 gap-1.5 cursor-pointer active:scale-95"
                            title="Pulls server roles from Discord into Portalarr accounts"
                        >
                            {actionLoading === "batch-pull" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400" />
                            ) : (
                                <DownloadCloud className="h-3.5 w-3.5 text-blue-400" />
                            )}
                            Pull Roles from Discord
                        </Button>
                    </div>

                    {/* ALERTS */}
                    {successMsg && (
                        <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            <span>{successMsg}</span>
                        </div>
                    )}
                    {errorMsg && (
                        <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/40 text-red-300 text-xs flex items-center gap-2">
                            <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* SEARCH & FILTER CONTROLS */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
                        <div className="relative w-full sm:w-72">
                            <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-muted-foreground pointer-events-none" />
                            <Input
                                placeholder="Search Discord username or ID..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 pl-8 pr-3 text-xs bg-black/40 border-border/50"
                            />
                        </div>

                        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                            <Button
                                variant={filterTab === "all" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setFilterTab("all")}
                                className="h-7 text-[11px] px-2.5 font-semibold"
                            >
                                All ({members.length})
                            </Button>
                            <Button
                                variant={filterTab === "unlinked" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setFilterTab("unlinked")}
                                className="h-7 text-[11px] px-2.5 font-semibold"
                            >
                                Unlinked ({unlinkedCount})
                            </Button>
                            <Button
                                variant={filterTab === "linked" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setFilterTab("linked")}
                                className="h-7 text-[11px] px-2.5 font-semibold"
                            >
                                Linked ({linkedCount})
                            </Button>
                            <Button
                                variant={filterTab === "suggested" ? "default" : "outline"}
                                size="sm"
                                onClick={() => setFilterTab("suggested")}
                                className="h-7 text-[11px] px-2.5 font-semibold text-purple-300 border-purple-500/30"
                            >
                                Suggested ({suggestedCount})
                            </Button>
                        </div>
                    </div>
                </DialogHeader>

                {/* MEMBER LIST BODY */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-2 py-2 pr-1">
                    {loading && members.length === 0 ? (
                        <div className="p-12 flex flex-col items-center justify-center space-y-3">
                            <Loader2 className="h-8 w-8 animate-spin text-[#5865F2]" />
                            <p className="text-xs text-muted-foreground">Connecting to Discord guild and fetching members...</p>
                        </div>
                    ) : filteredMembers.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground bg-black/20 rounded-xl border border-dashed border-border/40 space-y-1">
                            <AlertCircle className="h-5 w-5 mx-auto text-muted-foreground/60 mb-2" />
                            <p className="font-semibold text-foreground">No Discord members match your filter.</p>
                            <p className="text-[11px]">Try adjusting your search query or tab selection above.</p>
                        </div>
                    ) : (
                        filteredMembers.map((m) => {
                            const isLinked = Boolean(m.linkedUserId);
                            const match = m.suggestedMatch;
                            const isProcessing = actionLoading?.includes(m.id);

                            return (
                                <div
                                    key={m.id}
                                    className={`p-3 rounded-xl border transition-all text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                                        isLinked
                                            ? "bg-emerald-950/10 border-emerald-500/25 hover:border-emerald-500/40"
                                            : match
                                                ? "bg-purple-950/15 border-purple-500/30 hover:border-purple-500/50"
                                                : "bg-black/25 border-border/40 hover:border-border/60"
                                    }`}
                                >
                                    {/* DISCORD USER INFO */}
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="relative shrink-0">
                                            {m.avatarUrl ? (
                                                <img
                                                    src={m.avatarUrl}
                                                    alt={m.username}
                                                    className="h-10 w-10 rounded-full object-cover border border-white/10"
                                                />
                                            ) : (
                                                <div className="h-10 w-10 rounded-full bg-[#5865F2]/20 border border-[#5865F2]/40 flex items-center justify-center text-[#5865F2] font-bold text-sm">
                                                    {m.username.charAt(0).toUpperCase()}
                                                </div>
                                            )}
                                        </div>

                                        <div className="space-y-0.5 min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-foreground text-sm truncate">
                                                    @{m.username}
                                                </span>
                                                {m.nickname && (
                                                    <span className="text-[11px] text-muted-foreground font-normal">
                                                        ({m.nickname})
                                                    </span>
                                                )}
                                                {m.globalName && m.globalName !== m.username && (
                                                    <Badge variant="outline" className="text-[10px] bg-white/5 border-white/10 text-muted-foreground">
                                                        {m.globalName}
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground font-mono">
                                                ID: {m.id}
                                            </p>
                                        </div>
                                    </div>

                                    {/* LINKED / MATCH STATUS & CONTROLS */}
                                    <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                                        {isLinked ? (
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-xs font-semibold gap-1.5 py-1">
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                                                    Linked: <span className="font-bold">@{m.linkedUsername}</span>
                                                </Badge>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleSyncSingle(m)}
                                                    disabled={isProcessing}
                                                    className="h-7 px-2.5 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/10 border-emerald-500/30 gap-1 cursor-pointer"
                                                    title="Re-push role to Discord"
                                                >
                                                    <RefreshCw className={`h-3 w-3 ${actionLoading === `sync-${m.id}` ? "animate-spin" : ""}`} />
                                                    Sync
                                                </Button>

                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleUnlink(m)}
                                                    disabled={isProcessing}
                                                    className="h-7 px-2 text-[11px] font-semibold text-red-400 hover:text-red-300 hover:bg-red-500/10 gap-1 cursor-pointer"
                                                    title="Unlink this Discord account"
                                                >
                                                    <Unlink className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : match ? (
                                            <div className="flex items-center gap-2">
                                                <div className="text-right">
                                                    <div className="text-[11px] text-purple-300 font-semibold flex items-center gap-1 justify-end">
                                                        <Sparkles className="h-3 w-3 text-purple-400" />
                                                        Match: <strong className="text-foreground">@{match.username}</strong> ({match.confidence}%)
                                                    </div>
                                                    <span className="text-[9px] text-muted-foreground">{match.matchReason}</span>
                                                </div>

                                                <Button
                                                    variant="default"
                                                    size="sm"
                                                    onClick={() => handleLinkUser(m, match.userId)}
                                                    disabled={isProcessing}
                                                    className="h-7 px-2.5 text-[11px] font-bold bg-purple-600 hover:bg-purple-500 text-white gap-1 shadow-xs cursor-pointer active:scale-95"
                                                >
                                                    {isProcessing ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Link className="h-3 w-3" />
                                                    )}
                                                    Link & Sync
                                                </Button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <select
                                                    className="h-7 px-2 text-[11px] rounded-lg bg-black/50 border border-border/50 text-foreground max-w-[180px] focus:outline-none focus:ring-1 focus:ring-primary"
                                                    value={selectedUserToLink[m.id] || ""}
                                                    onChange={(e) => setSelectedUserToLink({ ...selectedUserToLink, [m.id]: e.target.value })}
                                                >
                                                    <option value="">Select Portalarr User...</option>
                                                    {unlinkedPortalarrUsers.map((u) => (
                                                        <option key={u.id} value={u.id}>
                                                            {u.username} {u.plexUsername ? `(${u.plexUsername})` : ""}
                                                        </option>
                                                    ))}
                                                </select>

                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        const targetId = selectedUserToLink[m.id];
                                                        if (targetId) handleLinkUser(m, targetId);
                                                    }}
                                                    disabled={!selectedUserToLink[m.id] || isProcessing}
                                                    className="h-7 px-2.5 text-[11px] font-semibold text-primary border-primary/30 hover:bg-primary/10 gap-1 cursor-pointer disabled:opacity-50"
                                                >
                                                    {isProcessing ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <Link className="h-3 w-3" />
                                                    )}
                                                    Link
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* FOOTER */}
                <DialogFooter className="shrink-0 pt-2 border-t border-border/40 flex sm:justify-between items-center gap-2">
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-emerald-400" />
                        Role assignments strictly conceal internal tiers into a unified <strong>⭐ Member</strong> role.
                    </p>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onClose}
                        className="text-xs font-semibold cursor-pointer"
                    >
                        Done
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
