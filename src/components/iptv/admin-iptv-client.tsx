"use client";

import { useState, useTransition } from "react";
import {
    Tv,
    ShieldCheck,
    Radio,
    Key,
    Server,
    Activity,
    Users,
    ListPlus,
    RefreshCw,
    Plus,
    Check,
    Copy,
    Eye,
    EyeOff,
    Trash2,
    CheckCircle2,
    AlertTriangle,
    Sliders,
    Layers,
    Clock,
    Zap,
    ExternalLink
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    saveIptvSettingsAction,
    testDispatcharrConnectionAction,
    syncDispatcharrLineupAction,
    saveIptvProviderAction,
    deleteIptvProviderAction,
    revealIptvProviderCredentialsAction,
    probeIptvProviderHealthAction,
    updateUserIptvAccessAction,
    terminateIptvWatchSessionAction,
    resolveIptvChannelRequestAction
} from "@/app/iptv-actions";

interface AdminIptvClientProps {
    initialData: {
        settings: any;
        providers: any[];
        capacity: any;
        dvr: {
            dispatcharrBaseUrl: string;
            dvrNodes: any[];
            profileEndpoints: any[];
        };
        telemetry: {
            activeSessions: any[];
            recentSessions: any[];
            topChannels: any[];
        };
        users: any[];
        pendingApprovals: any[];
        channels: any[];
        requests: any[];
    };
}

export function AdminIptvClient({ initialData }: AdminIptvClientProps) {
    const [activeTab, setActiveTab] = useState<string>("providers");
    const [isPending, startTransition] = useTransition();

    // Feedback messages
    const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Providers state
    const [providersList, setProvidersList] = useState(initialData.providers || []);
    const [capacityData, setCapacityData] = useState(initialData.capacity);
    const [revealedCreds, setRevealedCreds] = useState<Record<string, any>>({});
    const [isProviderModalOpen, setIsProviderModalOpen] = useState(false);

    // Add Provider Form State
    const [pName, setPName] = useState("");
    const [pType, setPType] = useState<any>("XTREAM_CODES");
    const [pServerUrl, setPServerUrl] = useState("");
    const [pUsername, setPUsername] = useState("");
    const [pPassword, setPPassword] = useState("");
    const [pM3uUrl, setPM3uUrl] = useState("");
    const [pEpgUrl, setPEpgUrl] = useState("");
    const [pMaxCons, setPMaxCons] = useState(3);
    const [pExpires, setPExpires] = useState("");

    // Dispatcharr State
    const [dispatcharrUrl, setDispatcharrUrl] = useState(
        initialData.settings?.dispatcharrUrl || "http://192.168.1.87:9191"
    );
    const [dispatcharrApiKey, setDispatcharrApiKey] = useState("");
    const [dispatcharrTestResult, setDispatcharrTestResult] = useState<any>(null);

    // Users & Approvals State
    const [usersList, setUsersList] = useState(initialData.users || []);
    const [pendingApprovals, setPendingApprovals] = useState(initialData.pendingApprovals || []);

    // Telemetry State
    const [activeSessions, setActiveSessions] = useState(initialData.telemetry?.activeSessions || []);

    // Channel Requests State
    const [channelRequests, setChannelRequests] = useState(initialData.requests || []);

    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(id);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const showMsg = (text: string, type: "success" | "error" = "success") => {
        setStatusMsg({ type, text });
        setTimeout(() => setStatusMsg(null), 4000);
    };

    // --- Provider Actions ---
    const handleRevealCreds = async (providerId: string) => {
        if (revealedCreds[providerId]) {
            const next = { ...revealedCreds };
            delete next[providerId];
            setRevealedCreds(next);
            return;
        }

        const res = await revealIptvProviderCredentialsAction(providerId);
        if (res.success && res.data) {
            setRevealedCreds({ ...revealedCreds, [providerId]: res.data });
        } else {
            showMsg("Could not decrypt provider credentials", "error");
        }
    };

    const handleProbeHealth = (providerId: string) => {
        startTransition(async () => {
            const res = await probeIptvProviderHealthAction(providerId);
            if (res.success && res.data) {
                setProvidersList(providersList.map((p) => (p.id === providerId ? res.data : p)));
                showMsg(`Probe complete: ${res.data.status} (${res.data.lastPingMs || 0}ms)`);
            } else {
                showMsg(res.error || "Probe failed", "error");
            }
        });
    };

    const handleDeleteProvider = (providerId: string) => {
        if (!confirm("Are you sure you want to delete this provider?")) return;
        startTransition(async () => {
            const res = await deleteIptvProviderAction(providerId);
            if (res.success) {
                setProvidersList(providersList.filter((p) => p.id !== providerId));
                showMsg("Provider removed");
            }
        });
    };

    const handleSaveProvider = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await saveIptvProviderAction({
                name: pName,
                type: pType,
                serverUrl: pServerUrl || undefined,
                username: pUsername || undefined,
                password: pPassword || undefined,
                m3uUrl: pM3uUrl || undefined,
                epgUrl: pEpgUrl || undefined,
                maxConnections: Number(pMaxCons),
                accountExpiresAt: pExpires || null
            });

            if (res.success && res.data) {
                setProvidersList([res.data, ...providersList]);
                setIsProviderModalOpen(false);
                setPName("");
                setPUsername("");
                setPPassword("");
                setPServerUrl("");
                setPM3uUrl("");
                setPEpgUrl("");
                showMsg(`Added provider "${res.data.name}"`);
            } else {
                showMsg(res.error || "Failed to save provider", "error");
            }
        });
    };

    // --- Dispatcharr Actions ---
    const handleSaveDispatcharrSettings = (e: React.FormEvent) => {
        e.preventDefault();
        startTransition(async () => {
            const res = await saveIptvSettingsAction({
                dispatcharrUrl: dispatcharrUrl.trim(),
                dispatcharrApiKey: dispatcharrApiKey.trim() || undefined,
                enabled: true
            });
            if (res.success) {
                showMsg("Dispatcharr configuration updated");
            } else {
                showMsg(res.error || "Save failed", "error");
            }
        });
    };

    const handleTestDispatcharr = () => {
        startTransition(async () => {
            const res = await testDispatcharrConnectionAction(
                dispatcharrUrl.trim(),
                dispatcharrApiKey.trim() || undefined
            );
            if (res.success && res.data) {
                setDispatcharrTestResult(res.data);
                showMsg(res.data.message, res.data.reachable ? "success" : "error");
            }
        });
    };

    const handleSyncDispatcharr = () => {
        startTransition(async () => {
            const res = await syncDispatcharrLineupAction();
            if (res.success && res.data) {
                showMsg(res.data.message);
            } else {
                showMsg(res.error || "Sync failed", "error");
            }
        });
    };

    // --- User Entitlement Actions ---
    const handleToggleUserAccess = (userId: string, current: boolean) => {
        startTransition(async () => {
            const res = await updateUserIptvAccessAction({
                userId,
                canAccessIptv: !current
            });
            if (res.success) {
                setUsersList(
                    usersList.map((u) => (u.id === userId ? { ...u, canAccessIptv: !current } : u))
                );
                showMsg(`Updated IPTV access`);
            }
        });
    };

    const handleResolveApproval = (approvalId: string, userId: string, approved: boolean) => {
        startTransition(async () => {
            const res = await updateUserIptvAccessAction({
                userId,
                canAccessIptv: approved,
                approvalId
            });
            if (res.success) {
                setPendingApprovals(pendingApprovals.filter((a) => a.id !== approvalId));
                setUsersList(
                    usersList.map((u) => (u.id === userId ? { ...u, canAccessIptv: approved } : u))
                );
                showMsg(`Access request ${approved ? "Approved" : "Rejected"}`);
            }
        });
    };

    // --- Live Stream Actions ---
    const handleKillSession = (sessionId: string) => {
        startTransition(async () => {
            const res = await terminateIptvWatchSessionAction(sessionId);
            if (res.success) {
                setActiveSessions(activeSessions.filter((s) => s.id !== sessionId));
                showMsg("Live stream terminated");
            }
        });
    };

    // --- Channel Request Resolution ---
    const handleResolveChannelRequest = (
        requestId: string,
        status: "APPROVED" | "ACTIVATED" | "REJECTED"
    ) => {
        startTransition(async () => {
            const res = await resolveIptvChannelRequestAction({
                requestId,
                status
            });
            if (res.success) {
                setChannelRequests(
                    channelRequests.map((r) => (r.id === requestId ? { ...r, status } : r))
                );
                showMsg(`Channel request marked as ${status}`);
            }
        });
    };

    return (
        <div className="container max-w-7xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
            {/* Header Lockup */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-sm">
                            <ShieldCheck className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2.5">
                                Live TV & IPTV Mission Control
                                <Badge variant="outline" className="text-xs font-semibold bg-amber-500/10 border-amber-500/30 text-amber-300">
                                    Admin Only
                                </Badge>
                            </h1>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Provider credential vault, Dispatcharr lineups, Plex/Jellyfin DVR virtual tuners & live telemetry.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    <Button
                        onClick={handleSyncDispatcharr}
                        disabled={isPending}
                        variant="outline"
                        className="text-xs font-bold gap-2 border-border/60"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                        Sync Dispatcharr
                    </Button>

                    <Button
                        onClick={() => setIsProviderModalOpen(true)}
                        className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-2 shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        Add Provider
                    </Button>
                </div>
            </div>

            {/* Notification alert banner */}
            {statusMsg && (
                <div
                    className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center gap-2.5 ${
                        statusMsg.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    }`}
                >
                    {statusMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                    {statusMsg.text}
                </div>
            )}

            {/* Capacity & Saturation Cockpit Gauge */}
            {capacityData && (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="p-4 rounded-2xl border border-border/50 bg-card/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Provider Stream Capacity
                        </span>
                        <div className="text-2xl font-black text-foreground">
                            {capacityData.totalActiveStreams} / {capacityData.totalMaxConnections}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            {capacityData.saturationPercentage}% connection saturation
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl border border-border/50 bg-card/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            DVR Reserved Buffer
                        </span>
                        <div className="text-2xl font-black text-amber-300">
                            {capacityData.dvrReservedStreams} stream{capacityData.dvrReservedStreams === 1 ? "" : "s"}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Reserved for scheduled Plex recordings
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl border border-border/50 bg-card/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Open Stream Lines
                        </span>
                        <div className="text-2xl font-black text-emerald-400">
                            {capacityData.freeStreamBuffer} line{capacityData.freeStreamBuffer === 1 ? "" : "s"}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Free for casual channel surfing
                        </p>
                    </div>

                    <div className="p-4 rounded-2xl border border-border/50 bg-card/60 space-y-1">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                            Circuit Breaker Guard
                        </span>
                        <div className="text-2xl font-black">
                            {capacityData.isSaturated ? (
                                <span className="text-rose-400">LOCKED (0 Free)</span>
                            ) : capacityData.isNearLimit ? (
                                <span className="text-amber-400">NEAR CAPACITY</span>
                            ) : (
                                <span className="text-emerald-400">HEALTHY</span>
                            )}
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                            Anti-ban stream limit protection active
                        </p>
                    </div>
                </div>
            )}

            {/* Navigation Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="bg-card/60 border border-border/50 p-1 rounded-2xl flex flex-wrap gap-1">
                    <TabsTrigger value="providers" className="text-xs font-bold gap-1.5 rounded-xl">
                        <Key className="h-3.5 w-3.5 text-amber-400" />
                        Providers & Vault ({providersList.length})
                    </TabsTrigger>
                    <TabsTrigger value="dispatcharr" className="text-xs font-bold gap-1.5 rounded-xl">
                        <Radio className="h-3.5 w-3.5 text-teal-400" />
                        Dispatcharr Lineups
                    </TabsTrigger>
                    <TabsTrigger value="dvr" className="text-xs font-bold gap-1.5 rounded-xl">
                        <Server className="h-3.5 w-3.5 text-sky-400" />
                        Plex & Jellyfin DVR
                    </TabsTrigger>
                    <TabsTrigger value="telemetry" className="text-xs font-bold gap-1.5 rounded-xl">
                        <Activity className="h-3.5 w-3.5 text-orange-400" />
                        Live Streams ({activeSessions.length})
                    </TabsTrigger>
                    <TabsTrigger value="users" className="text-xs font-bold gap-1.5 rounded-xl">
                        <Users className="h-3.5 w-3.5 text-blue-400" />
                        User Access ({pendingApprovals.length > 0 ? `🚨 ${pendingApprovals.length}` : usersList.length})
                    </TabsTrigger>
                    <TabsTrigger value="catalog" className="text-xs font-bold gap-1.5 rounded-xl">
                        <ListPlus className="h-3.5 w-3.5 text-purple-400" />
                        Channel Requests ({channelRequests.filter(r => r.status === "PENDING").length})
                    </TabsTrigger>
                </TabsList>

                {/* TAB 1: PROVIDERS & CREDENTIAL VAULT */}
                <TabsContent value="providers" className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {providersList.map((p) => {
                            const isRevealed = Boolean(revealedCreds[p.id]);
                            const creds = revealedCreds[p.id] || {};

                            return (
                                <div
                                    key={p.id}
                                    className="p-5 rounded-2xl border border-border/60 bg-card/60 space-y-4 shadow-sm hover:border-amber-500/40 transition-colors"
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="font-extrabold text-foreground text-sm">{p.name}</h3>
                                                <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                                    {p.type}
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                                Max connections: <b className="text-foreground">{p.maxConnections}</b> | Priority: #{p.priorityOrder}
                                            </p>
                                        </div>

                                        <Badge
                                            className={`text-[10px] font-bold ${
                                                p.status === "ONLINE"
                                                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                                                    : p.status === "EXPIRED"
                                                    ? "bg-rose-500/15 border-rose-500/30 text-rose-300"
                                                    : "bg-amber-500/15 border-amber-500/30 text-amber-300"
                                            }`}
                                        >
                                            {p.status}
                                        </Badge>
                                    </div>

                                    {/* Credentials Card (Masked vs Revealed) */}
                                    <div className="p-3 rounded-xl bg-background/50 border border-border/40 space-y-2 text-xs">
                                        <div className="flex items-center justify-between">
                                            <span className="text-[11px] font-bold text-muted-foreground">Credentials (AES-256-GCM)</span>
                                            <button
                                                onClick={() => handleRevealCreds(p.id)}
                                                className="text-[11px] text-amber-400 hover:text-amber-300 flex items-center gap-1 font-semibold"
                                            >
                                                {isRevealed ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                                {isRevealed ? "Hide" : "Reveal Decrypted"}
                                            </button>
                                        </div>

                                        {isRevealed ? (
                                            <div className="space-y-1.5 font-mono text-[11px] break-all">
                                                {creds.serverUrl && (
                                                    <div>
                                                        <span className="text-muted-foreground">Host: </span>
                                                        <span className="text-foreground">{creds.serverUrl}</span>
                                                    </div>
                                                )}
                                                {creds.username && (
                                                    <div className="flex items-center justify-between">
                                                        <span><span className="text-muted-foreground">User: </span>{creds.username}</span>
                                                        <button onClick={() => handleCopy(creds.username, `u-${p.id}`)} className="text-muted-foreground hover:text-foreground">
                                                            {copiedKey === `u-${p.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                                        </button>
                                                    </div>
                                                )}
                                                {creds.password && (
                                                    <div className="flex items-center justify-between">
                                                        <span><span className="text-muted-foreground">Pass: </span>{creds.password}</span>
                                                        <button onClick={() => handleCopy(creds.password, `p-${p.id}`)} className="text-muted-foreground hover:text-foreground">
                                                            {copiedKey === `p-${p.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                                        </button>
                                                    </div>
                                                )}
                                                {creds.m3uUrl && (
                                                    <div className="flex items-center justify-between">
                                                        <span className="truncate max-w-[200px]"><span className="text-muted-foreground">M3U: </span>{creds.m3uUrl}</span>
                                                        <button onClick={() => handleCopy(creds.m3uUrl, `m-${p.id}`)} className="text-muted-foreground hover:text-foreground">
                                                            {copiedKey === `m-${p.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        ) : (
                                            <div className="text-[11px] text-muted-foreground space-y-1">
                                                <div>User: <span className="font-mono">{p.username || "••••••••"}</span></div>
                                                <div>Password: <span className="font-mono">••••••••••••</span></div>
                                                <div>Server: <span className="font-mono text-emerald-400/80">Encrypted in Vault</span></div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Bar */}
                                    <div className="flex items-center justify-between pt-1 text-xs">
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleProbeHealth(p.id)}
                                            disabled={isPending}
                                            className="h-8 text-[11px] gap-1.5"
                                        >
                                            <Zap className="h-3 w-3 text-amber-400" />
                                            Probe Ping {p.lastPingMs ? `(${p.lastPingMs}ms)` : ""}
                                        </Button>

                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDeleteProvider(p.id)}
                                            className="h-8 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </TabsContent>

                {/* TAB 2: DISPATCHARR INTEGRATION & PROFILES */}
                <TabsContent value="dispatcharr" className="space-y-6">
                    <div className="p-6 rounded-2xl border border-border/60 bg-card/60 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                                <Radio className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-foreground">Dispatcharr Server Connection</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Primary proxy engine coordinating channel numbers, XMLTV EPG guides, and stream failovers.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleSaveDispatcharrSettings} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <div>
                                <label className="text-xs font-bold text-muted-foreground block mb-1">Dispatcharr Host / IP</label>
                                <Input
                                    value={dispatcharrUrl}
                                    onChange={(e) => setDispatcharrUrl(e.target.value)}
                                    placeholder="http://192.168.1.87:9191"
                                    className="text-xs rounded-xl"
                                />
                            </div>

                            <div>
                                <label className="text-xs font-bold text-muted-foreground block mb-1">API Key (AES-256-GCM Encrypted)</label>
                                <Input
                                    type="password"
                                    value={dispatcharrApiKey}
                                    onChange={(e) => setDispatcharrApiKey(e.target.value)}
                                    placeholder={initialData.settings?.hasDispatcharrApiKey ? "•••••••••••••••• (Saved)" : "Enter Dispatcharr API Key"}
                                    className="text-xs rounded-xl"
                                />
                            </div>

                            <div className="flex items-end gap-2">
                                <Button type="submit" disabled={isPending} className="bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs h-9 rounded-xl">
                                    Save Settings
                                </Button>
                                <Button type="button" onClick={handleTestDispatcharr} variant="outline" className="text-xs font-bold h-9 rounded-xl">
                                    Test Connection
                                </Button>
                            </div>
                        </form>
                    </div>

                    {/* Dispatcharr Profiles Grid */}
                    <div className="space-y-3">
                        <h3 className="font-bold text-sm text-foreground">Configured Dispatcharr Channel Profiles (7 Ready)</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {initialData.dvr?.profileEndpoints?.map((p: any) => (
                                <div key={p.id} className="p-4 rounded-2xl border border-border/50 bg-card/40 space-y-3 text-xs">
                                    <div className="flex items-center justify-between">
                                        <span className="font-extrabold text-foreground text-sm flex items-center gap-2">
                                            {p.name}
                                            <Badge variant="outline" className="text-[10px]">
                                                {p.channelCount} channels
                                            </Badge>
                                        </span>
                                        <Badge variant="outline" className="text-[10px] text-teal-300 border-teal-500/30">
                                            Role: {p.minRoleRequired}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-muted-foreground line-clamp-2">{p.description}</p>

                                    <div className="pt-2 border-t border-border/30 space-y-1.5 font-mono text-[10px]">
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">HDHomeRun Tuner:</span>
                                            <button onClick={() => handleCopy(p.hdhrUrl, `hdhr-${p.id}`)} className="text-teal-400 hover:text-teal-300 flex items-center gap-1">
                                                {copiedKey === `hdhr-${p.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                                Copy Tuner URL
                                            </button>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">XMLTV EPG Feed:</span>
                                            <button onClick={() => handleCopy(p.epgUrl, `epg-${p.id}`)} className="text-teal-400 hover:text-teal-300 flex items-center gap-1">
                                                {copiedKey === `epg-${p.id}` ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                                Copy EPG URL
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                {/* TAB 3: PLEX & JELLYFIN DVR */}
                <TabsContent value="dvr" className="space-y-6">
                    <div className="p-6 rounded-2xl border border-border/60 bg-card/60 space-y-4">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                                <Server className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-foreground">Media Server DVR Connection Endpoints</h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Simulated SiliconDust HDHomeRun tuners & XMLTV guide feeds for Plex Live TV & DVR and Jellyfin/Emby M3U tuners.
                                </p>
                            </div>
                        </div>

                        <div className="space-y-3">
                            {initialData.dvr?.dvrNodes?.map((node: any) => (
                                <div key={node.id} className="p-4 rounded-xl border border-border/40 bg-background/50 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-foreground text-sm">{node.name}</span>
                                            <Badge variant="outline" className="text-[10px] text-sky-300 border-sky-500/30">
                                                {node.platform}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-1">
                                            Tuner protocol: {node.tunerProtocol}
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                                            <CheckCircle2 className="h-3.5 w-3.5" /> Monitored
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                {/* TAB 4: LIVE STREAM TELEMETRY */}
                <TabsContent value="telemetry" className="space-y-6">
                    <div className="space-y-3">
                        <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            Currently Streaming Channels ({activeSessions.length} active)
                        </h3>

                        {activeSessions.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {activeSessions.map((s) => (
                                    <div key={s.id} className="p-4 rounded-2xl border border-border/60 bg-card/60 space-y-3 text-xs shadow-sm">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <h4 className="font-bold text-foreground text-sm">{s.channelTitle}</h4>
                                                <p className="text-[11px] text-muted-foreground">{s.programTitle || "Live Broadcast"}</p>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] text-emerald-300 border-emerald-500/30">
                                                {s.platform || "Plex Live TV"}
                                            </Badge>
                                        </div>

                                        <div className="space-y-1 text-[11px] text-muted-foreground">
                                            <div>Viewer: <b className="text-foreground">{s.userName}</b></div>
                                            <div>Device: {s.device || "Smart TV"} ({s.location || "LAN"})</div>
                                            <div>Bitrate: {Math.round((s.streamBitrateKbps || 8500) / 1000)} Mbps ({s.transcodeDecision})</div>
                                        </div>

                                        <div className="pt-2 border-t border-border/30 flex items-center justify-between">
                                            <span className="text-[10px] text-muted-foreground">Playing {Math.floor((s.durationSeconds || 0) / 60)}m</span>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleKillSession(s.id)}
                                                className="h-7 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                            >
                                                Terminate Stream
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-10 rounded-2xl border border-dashed border-border/60 bg-card/20 text-xs text-muted-foreground">
                                No members are actively streaming live TV right now.
                            </div>
                        )}
                    </div>
                </TabsContent>

                {/* TAB 5: USER ACCESS & ENTITLEMENTS */}
                <TabsContent value="users" className="space-y-6">
                    {pendingApprovals.length > 0 && (
                        <div className="p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 space-y-3">
                            <h3 className="font-bold text-sm text-amber-200 flex items-center gap-2">
                                <Clock className="h-4 w-4" />
                                Pending Live TV Access Requests ({pendingApprovals.length})
                            </h3>
                            <div className="space-y-2">
                                {pendingApprovals.map((app: any) => (
                                    <div key={app.id} className="p-3 rounded-xl bg-background/60 border border-border/40 flex items-center justify-between text-xs">
                                        <div>
                                            <span className="font-bold text-foreground">{app.targetUser}</span>
                                            <p className="text-[11px] text-muted-foreground">{app.description}</p>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Button
                                                size="sm"
                                                onClick={() => handleResolveApproval(app.id, app.userId, true)}
                                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                            >
                                                Approve
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleResolveApproval(app.id, app.userId, false)}
                                                className="h-8 text-xs text-rose-400 hover:text-rose-300"
                                            >
                                                Reject
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="p-5 rounded-2xl border border-border/60 bg-card/60 space-y-3">
                        <h3 className="font-bold text-sm text-foreground">Member Live TV Access Roster</h3>
                        <div className="space-y-2">
                            {usersList.map((u) => (
                                <div key={u.id} className="p-3.5 rounded-xl border border-border/40 bg-background/40 flex items-center justify-between text-xs">
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-foreground">{u.name || u.username}</span>
                                            <Badge variant="outline" className="text-[10px]">
                                                {u.role}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-muted-foreground mt-0.5">
                                            Max concurrent streams: <b className="text-foreground">{u.maxConcurrentIptvStreams}</b>
                                        </p>
                                    </div>

                                    <div>
                                        <Button
                                            size="sm"
                                            variant={u.canAccessIptv ? "default" : "outline"}
                                            onClick={() => handleToggleUserAccess(u.id, u.canAccessIptv)}
                                            className={`h-8 text-xs font-bold ${
                                                u.canAccessIptv
                                                    ? "bg-teal-600 hover:bg-teal-500 text-white"
                                                    : "text-muted-foreground"
                                            }`}
                                        >
                                            {u.canAccessIptv ? "Access Enabled" : "Access Disabled"}
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </TabsContent>

                {/* TAB 6: CHANNEL REQUESTS */}
                <TabsContent value="catalog" className="space-y-6">
                    <div className="p-5 rounded-2xl border border-border/60 bg-card/60 space-y-3">
                        <h3 className="font-bold text-sm text-foreground">On-Demand Channel Requests Queue</h3>
                        {channelRequests.length > 0 ? (
                            <div className="space-y-2">
                                {channelRequests.map((r: any) => (
                                    <div key={r.id} className="p-3.5 rounded-xl border border-border/40 bg-background/40 flex items-center justify-between text-xs">
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-foreground text-sm">{r.channelName}</span>
                                                <Badge variant="outline" className="text-[10px]">
                                                    {r.genre || "TV"}
                                                </Badge>
                                                <Badge
                                                    className={`text-[10px] ${
                                                        r.status === "ACTIVATED"
                                                            ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                                                            : r.status === "PENDING"
                                                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                                                            : "bg-muted text-muted-foreground"
                                                    }`}
                                                >
                                                    {r.status}
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground mt-0.5">
                                                Requested by <b className="text-foreground">{r.requestedByUsername}</b>: {r.reason || "No note provided"}
                                            </p>
                                        </div>

                                        {r.status === "PENDING" && (
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleResolveChannelRequest(r.id, "ACTIVATED")}
                                                    className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                                                >
                                                    Activate Channel
                                                </Button>
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleResolveChannelRequest(r.id, "REJECTED")}
                                                    className="h-8 text-xs text-rose-400"
                                                >
                                                    Reject
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-xs text-muted-foreground">
                                No channel requests in the queue.
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>

            {/* Add Provider Modal */}
            {isProviderModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Key className="h-5 w-5 text-amber-400" />
                                Add IPTV Provider to Credential Vault
                            </h3>
                            <button onClick={() => setIsProviderModalOpen(false)} className="text-muted-foreground hover:text-foreground text-sm font-bold">
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveProvider} className="space-y-3 text-xs">
                            <div>
                                <label className="font-bold text-muted-foreground block mb-1">Provider Label / Name *</label>
                                <Input placeholder="e.g. Xtream Prime Feed, Local HDHR" value={pName} onChange={(e) => setPName(e.target.value)} required className="rounded-xl" />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="font-bold text-muted-foreground block mb-1">Provider Type</label>
                                    <select value={pType} onChange={(e) => setPType(e.target.value)} className="w-full h-9 px-3 rounded-xl bg-background border border-border text-foreground">
                                        <option value="XTREAM_CODES">Xtream Codes API</option>
                                        <option value="M3U_URL">Remote M3U URL</option>
                                        <option value="HDHOMERUN">HDHomeRun Tuner</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="font-bold text-muted-foreground block mb-1">Max Concurrent Connections</label>
                                    <Input type="number" min={1} max={20} value={pMaxCons} onChange={(e) => setPMaxCons(Number(e.target.value))} className="rounded-xl" />
                                </div>
                            </div>

                            {pType === "XTREAM_CODES" && (
                                <>
                                    <div>
                                        <label className="font-bold text-muted-foreground block mb-1">Server Host URL</label>
                                        <Input placeholder="http://stream.provider.com:8080" value={pServerUrl} onChange={(e) => setPServerUrl(e.target.value)} className="rounded-xl" />
                                    </div>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="font-bold text-muted-foreground block mb-1">Username</label>
                                            <Input placeholder="Username" value={pUsername} onChange={(e) => setPUsername(e.target.value)} className="rounded-xl" />
                                        </div>
                                        <div>
                                            <label className="font-bold text-muted-foreground block mb-1">Password</label>
                                            <Input type="password" placeholder="Password" value={pPassword} onChange={(e) => setPPassword(e.target.value)} className="rounded-xl" />
                                        </div>
                                    </div>
                                </>
                            )}

                            {pType === "M3U_URL" && (
                                <>
                                    <div>
                                        <label className="font-bold text-muted-foreground block mb-1">M3U Playlist URL</label>
                                        <Input placeholder="https://provider.com/playlist.m3u8" value={pM3uUrl} onChange={(e) => setPM3uUrl(e.target.value)} className="rounded-xl" />
                                    </div>
                                    <div>
                                        <label className="font-bold text-muted-foreground block mb-1">XMLTV Guide (EPG) URL</label>
                                        <Input placeholder="https://provider.com/epg.xml" value={pEpgUrl} onChange={(e) => setPEpgUrl(e.target.value)} className="rounded-xl" />
                                    </div>
                                </>
                            )}

                            <div>
                                <label className="font-bold text-muted-foreground block mb-1">Account Expiration Date (Optional)</label>
                                <Input type="date" value={pExpires} onChange={(e) => setPExpires(e.target.value)} className="rounded-xl" />
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-2">
                                <Button type="button" variant="ghost" onClick={() => setIsProviderModalOpen(false)}>
                                    Cancel
                                </Button>
                                <Button type="submit" disabled={isPending || !pName.trim()} className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-sm">
                                    Save to Encrypted Vault
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
