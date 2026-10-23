"use client";

import { useState, useEffect } from "react";
import { 
    getAdminMediaServersAction, 
    saveMediaServerAction, 
    deleteMediaServerAction, 
    testMediaServerAction, 
    updateServerAccessRulesAction,
    provisionAllUsersToMediaServerAction,
    DiscoveredServerInfo 
} from "@/app/media-server-actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
    Server, Tv, Film, Music, Check, Plus, Trash2, RefreshCw, 
    CheckCircle2, XCircle, Loader2, Shield, FolderCheck, CheckSquare, 
    Square, Activity, ExternalLink, Settings, Sparkles, Layers, Sliders, Pencil,
    Eye, EyeOff, Copy, Users
} from "lucide-react";

export function AdminMediaServersPanel() {
    const [servers, setServers] = useState<DiscoveredServerInfo[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

    // Add / Edit Dialog state
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editingServer, setEditingServer] = useState<DiscoveredServerInfo | null>(null);
    const [formName, setFormName] = useState("");
    const [formType, setFormType] = useState<"JELLYFIN" | "EMBY">("JELLYFIN");
    const [formUrl, setFormUrl] = useState("");
    const [formApiKey, setFormApiKey] = useState("");
    const [showApiKey, setShowApiKey] = useState(false);
    const [copiedKey, setCopiedKey] = useState(false);
    const [savingServer, setSavingServer] = useState(false);
    const [dialogErr, setDialogErr] = useState("");

    // Testing state per server: serverId -> status
    const [testingMap, setTestingMap] = useState<Record<string, { testing?: boolean; result?: any }>>({});
    // Saving rules state per server: serverId -> boolean
    const [savingRulesMap, setSavingRulesMap] = useState<Record<string, boolean>>({});
    // Bulk provisioning state per server: serverId -> boolean
    const [bulkProvisioningMap, setBulkProvisioningMap] = useState<Record<string, boolean>>({});

    const loadServers = async (isManualRefresh = false) => {
        if (isManualRefresh) setRefreshing(true);
        else setLoading(true);
        setError("");
        try {
            const res = await getAdminMediaServersAction();
            if (res.success) {
                setServers(res.servers);
            } else {
                setError(res.error || "Failed to load media servers");
            }
        } catch (err: any) {
            setError(err.message || "Failed to load media servers");
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadServers();
    }, []);

    const handleOpenAdd = () => {
        setEditingServer(null);
        setFormName("");
        setFormType("JELLYFIN");
        setFormUrl("");
        setFormApiKey("");
        setShowApiKey(true);
        setCopiedKey(false);
        setDialogErr("");
        setDialogOpen(true);
    };

    const handleOpenEdit = (srv: DiscoveredServerInfo) => {
        setEditingServer(srv);
        setFormName(srv.name);
        setFormType(srv.type as "JELLYFIN" | "EMBY");
        setFormUrl(srv.url);
        setFormApiKey(srv.apiKey || "");
        setShowApiKey(false);
        setCopiedKey(false);
        setDialogErr("");
        setDialogOpen(true);
    };

    const handleSaveServer = async () => {
        setDialogErr("");
        if (!formName.trim() || !formUrl.trim() || (!editingServer && !formApiKey.trim())) {
            setDialogErr("Please provide a server name, URL, and API key");
            return;
        }

        setSavingServer(true);
        try {
            const res = await saveMediaServerAction({
                id: editingServer?.id,
                name: formName.trim(),
                type: formType,
                url: formUrl.trim(),
                apiKey: formApiKey.trim(),
                allowUserSelfSelect: editingServer ? editingServer.allowUserSelfSelect : true,
                allowTrialAccess: editingServer ? editingServer.allowTrialAccess : false,
                allowedLibraryIds: editingServer ? editingServer.allowedLibraryIds : undefined
            });

            if (res.success) {
                setDialogOpen(false);
                setSuccessMsg(`Successfully saved ${formType} server "${formName}"`);
                setTimeout(() => setSuccessMsg(""), 4000);
                await loadServers(true);
            } else {
                setDialogErr(res.error || "Failed to save server");
            }
        } catch (err: any) {
            setDialogErr(err.message || "Failed to save server");
        } finally {
            setSavingServer(false);
        }
    };

    const handleDeleteServer = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to remove media server "${name}"?`)) return;
        try {
            const res = await deleteMediaServerAction(id);
            if (res.success) {
                setSuccessMsg(`Removed server "${name}"`);
                setTimeout(() => setSuccessMsg(""), 4000);
                await loadServers(true);
            } else {
                setError(res.error || "Failed to delete server");
            }
        } catch (err: any) {
            setError(err.message || "Failed to delete server");
        }
    };

    const handleTestServer = async (srv: DiscoveredServerInfo) => {
        setTestingMap(prev => ({ ...prev, [srv.id]: { testing: true } }));
        try {
            const res = await testMediaServerAction({
                type: srv.type,
                url: srv.url,
                serverId: srv.id
            });
            setTestingMap(prev => ({ ...prev, [srv.id]: { testing: false, result: res } }));
            if (res.ok) {
                await loadServers(true);
            }
        } catch (err: any) {
            setTestingMap(prev => ({
                ...prev,
                [srv.id]: { testing: false, result: { ok: false, error: err.message || "Test failed" } }
            }));
        }
    };

    const handleToggleServerRule = (srvId: string, field: "allowUserSelfSelect" | "allowTrialAccess", val: boolean) => {
        setServers(prev => prev.map(s => s.id === srvId ? { ...s, [field]: val } : s));
    };

    const handleToggleAllowedLibrary = (srvId: string, libId: string) => {
        setServers(prev => prev.map(s => {
            if (s.id !== srvId) return s;
            const libraries = s.cachedLibraries || [];
            const isCustom = s.allowedLibraryIds && (s.allowedLibraryIds.length > 0 || s.allowedLibraryIds.includes("__none__"));
            const current = isCustom 
                ? s.allowedLibraryIds!.filter(id => id !== "__none__")
                : libraries.map(l => l.id);
            const next = current.includes(libId)
                ? current.filter(id => id !== libId)
                : [...current, libId];
            return { ...s, allowedLibraryIds: next.length === 0 ? ["__none__"] : next };
        }));
    };

    const handleSelectAllLibraries = (srvId: string) => {
        setServers(prev => prev.map(s => {
            if (s.id !== srvId) return s;
            const allIds = (s.cachedLibraries || []).map(l => l.id);
            return { ...s, allowedLibraryIds: allIds };
        }));
    };

    const handleDeselectAllLibraries = (srvId: string) => {
        setServers(prev => prev.map(s => s.id === srvId ? { ...s, allowedLibraryIds: ["__none__"] } : s));
    };

    const handleSaveRules = async (srv: DiscoveredServerInfo) => {
        setSavingRulesMap(prev => ({ ...prev, [srv.id]: true }));
        try {
            const cleanAllowed = (srv.allowedLibraryIds || []).filter(id => id !== "__none__");
            const res = await updateServerAccessRulesAction({
                serverType: srv.type,
                serverId: srv.id,
                allowUserSelfSelect: srv.allowUserSelfSelect,
                allowTrialAccess: srv.allowTrialAccess,
                allowedLibraryIds: cleanAllowed
            });

            if (res.success) {
                setSuccessMsg(`Access rules updated for ${srv.name}`);
                setTimeout(() => setSuccessMsg(""), 4000);
            } else {
                setError(res.error || "Failed to update access rules");
            }
        } catch (err: any) {
            setError(err.message || "Failed to update access rules");
        } finally {
            setSavingRulesMap(prev => ({ ...prev, [srv.id]: false }));
        }
    };

    const handleBulkProvisionUsers = async (srv: DiscoveredServerInfo) => {
        if (!confirm(`Provision and sync all approved Full Members to "${srv.name}"? This creates their accounts in ${srv.type} with blank initial passwords and assigns the configured whitelist.`)) {
            return;
        }
        setBulkProvisioningMap(prev => ({ ...prev, [srv.id]: true }));
        setError("");
        setSuccessMsg("");
        try {
            const res = await provisionAllUsersToMediaServerAction(srv.id);
            if (res.success) {
                setSuccessMsg(res.message || `Successfully provisioned ${res.count} users!`);
                setTimeout(() => setSuccessMsg(""), 6000);
            } else {
                setError(res.error || "Failed to bulk provision users.");
            }
        } catch (e: any) {
            setError(e.message || "Failed to bulk provision users.");
        } finally {
            setBulkProvisioningMap(prev => ({ ...prev, [srv.id]: false }));
        }
    };

    return (
        <div className="space-y-6">
            {/* Header & Quick Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-gradient-to-r from-purple-950/20 via-background to-blue-950/20 border border-purple-500/30">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <Layers className="h-5 w-5 text-purple-400" />
                        <h2 className="text-base sm:text-lg font-bold text-foreground">
                            Multi-Platform Media Servers &amp; Library Whitelist
                        </h2>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Configure Plex, Jellyfin, and Emby instances. Control strictly which servers and libraries your Full Members are allowed to self-select. (Trial member access is managed via the Trial Safe Pool in Access Control).
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadServers(true)}
                        disabled={refreshing || loading}
                        className="h-9 text-xs border-border/60 hover:bg-white/[0.04] gap-1.5"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
                        <span>Refresh</span>
                    </Button>
                    <Button
                        size="sm"
                        onClick={handleOpenAdd}
                        className="h-9 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5 shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        <span>Add Jellyfin / Emby</span>
                    </Button>
                </div>
            </div>

            {successMsg && (
                <div className="p-3 text-xs bg-emerald-950/40 border border-emerald-500/40 text-emerald-300 rounded-lg flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    <span>{successMsg}</span>
                </div>
            )}

            {error && (
                <div className="p-3 text-xs bg-red-950/40 border border-red-500/40 text-red-300 rounded-lg flex items-center gap-2">
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                    <span>{error}</span>
                </div>
            )}

            {loading ? (
                <div className="p-12 text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-xs text-muted-foreground">Loading media servers and discovering libraries...</p>
                </div>
            ) : servers.length === 0 ? (
                <Card className="border-border/50 bg-[#121218]/80 text-center p-8">
                    <Server className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
                    <h3 className="text-sm font-bold text-foreground">No Media Servers Configured</h3>
                    <p className="text-xs text-muted-foreground max-w-md mx-auto mt-1 mb-4">
                        Add your Plex, Jellyfin, or Emby servers above to begin managing member access and library whitelists.
                    </p>
                    <Button size="sm" onClick={handleOpenAdd} className="h-9 text-xs font-bold bg-primary">
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Add First Media Server
                    </Button>
                </Card>
            ) : (
                <div className="space-y-4">
                    {servers.map(srv => {
                        const testState = testingMap[srv.id];
                        const isSavingRules = savingRulesMap[srv.id] || false;
                        const libraries = srv.cachedLibraries || [];
                        const isPlex = srv.type === "PLEX";
                        const isJellyfin = srv.type === "JELLYFIN";
                        const isEmby = srv.type === "EMBY";

                        const badgeColor = isPlex 
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/40" 
                            : isJellyfin 
                            ? "bg-purple-500/15 text-purple-300 border-purple-500/40" 
                            : "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";

                        return (
                            <Card key={srv.id} className="border-border/60 bg-[#121218]/90 backdrop-blur-md shadow-sm overflow-hidden">
                                <CardHeader className="pb-3 border-b border-border/30">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`h-10 w-10 rounded-xl flex items-center justify-center border shrink-0 ${
                                                isPlex ? "bg-amber-500/10 border-amber-500/30 text-amber-400" :
                                                isJellyfin ? "bg-purple-500/10 border-purple-500/30 text-purple-400" :
                                                "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                                            }`}>
                                                <Server className="h-5 w-5" />
                                            </div>
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-sm text-foreground">{srv.name}</span>
                                                    <Badge variant="outline" className={`text-[10px] font-bold ${badgeColor}`}>
                                                        {srv.type}
                                                    </Badge>
                                                    {srv.isMonitored && (
                                                        <Badge variant="outline" className="text-[10px] bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                                                            Monitored
                                                        </Badge>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground font-mono truncate max-w-md">
                                                    {srv.url}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleTestServer(srv)}
                                                disabled={testState?.testing}
                                                className="h-8 text-xs border-border/60 hover:bg-white/[0.04] gap-1.5"
                                            >
                                                {testState?.testing ? (
                                                    <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                                                ) : (
                                                    <Activity className="h-3 w-3 text-cyan-400" />
                                                )}
                                                <span>Test Connection</span>
                                            </Button>

                                            {!isPlex && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleBulkProvisionUsers(srv)}
                                                    disabled={bulkProvisioningMap[srv.id]}
                                                    className="h-8 text-xs border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10 gap-1.5 cursor-pointer"
                                                    title={`Provision & sync all Full Members to ${srv.name}`}
                                                >
                                                    {bulkProvisioningMap[srv.id] ? (
                                                        <Loader2 className="h-3 w-3 animate-spin text-emerald-400" />
                                                    ) : (
                                                        <Users className="h-3.5 w-3.5 text-emerald-400" />
                                                    )}
                                                    <span>Provision Users</span>
                                                </Button>
                                            )}

                                            {!isPlex && (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleOpenEdit(srv)}
                                                    className="h-8 text-xs border-border/60 hover:bg-white/[0.04] gap-1.5 text-foreground"
                                                >
                                                    <Pencil className="h-3.5 w-3.5 text-purple-400" />
                                                    <span>Edit</span>
                                                </Button>
                                            )}

                                            {!isPlex && (
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleDeleteServer(srv.id, srv.name)}
                                                    className="h-8 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/15"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Test Result Indicator */}
                                    {testState?.result && (
                                        <div className={`mt-2 p-2 rounded-lg text-xs flex items-center justify-between gap-2 ${
                                            testState.result.ok 
                                                ? "bg-emerald-950/30 border border-emerald-500/30 text-emerald-300"
                                                : "bg-red-950/30 border border-red-500/30 text-red-300"
                                        }`}>
                                            <div className="flex items-center gap-1.5 truncate">
                                                {testState.result.ok ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                                ) : (
                                                    <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                                                )}
                                                <span className="truncate">
                                                    {testState.result.ok 
                                                        ? `Connected to ${testState.result.serverName} (v${testState.result.version || "latest"}, ${testState.result.os || "Linux"}) in ${testState.result.latencyMs}ms`
                                                        : testState.result.error || "Connection failed"}
                                                </span>
                                            </div>
                                            {testState.result.latencyMs && (
                                                <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                                                    {testState.result.latencyMs} ms
                                                </Badge>
                                            )}
                                        </div>
                                    )}
                                </CardHeader>

                                <CardContent className="pt-4 space-y-4">
                                    {/* Permission Configuration & Policies */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 rounded-xl bg-white/[0.02] border border-border/40">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="space-y-0.5">
                                                <Label className="text-xs font-semibold text-foreground">
                                                    Allow Full Members to Self-Select
                                                </Label>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Full members can choose whether this server appears on their account.
                                                </p>
                                            </div>
                                            <Switch
                                                checked={srv.allowUserSelfSelect}
                                                onCheckedChange={v => handleToggleServerRule(srv.id, "allowUserSelfSelect", v)}
                                            />
                                        </div>

                                        <div className="flex items-center justify-between gap-3 border-t sm:border-t-0 sm:border-l border-border/30 sm:pl-3 pt-2 sm:pt-0">
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-1.5">
                                                    <Shield className="h-3.5 w-3.5 text-purple-400" />
                                                    <Label className="text-xs font-semibold text-foreground">
                                                        Trial Accounts Policy
                                                    </Label>
                                                </div>
                                                <p className="text-[11px] text-muted-foreground">
                                                    Governed centrally via the <span className="text-purple-300 font-medium">Trial Safe Pool</span> in Access Control.
                                                </p>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30 shrink-0">
                                                Access Control
                                            </Badge>
                                        </div>
                                    </div>

                                    {/* Libraries Whitelist */}
                                    <div className="space-y-2">
                                        {(() => {
                                            const isNoneExplicit = srv.allowedLibraryIds?.includes("__none__");
                                            const hasCustomList = srv.allowedLibraryIds && (srv.allowedLibraryIds.length > 0 || isNoneExplicit);
                                            const allowedCount = isNoneExplicit 
                                                ? 0 
                                                : (hasCustomList ? srv.allowedLibraryIds!.length : libraries.length);

                                            return (
                                                <>
                                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                                        <div className="flex items-center gap-1.5">
                                                            <FolderCheck className="h-4 w-4 text-primary" />
                                                            <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                                                                Allowed Libraries Whitelist
                                                            </span>
                                                            <span className="text-[11px] text-muted-foreground">
                                                                ({allowedCount} / {libraries.length} allowed)
                                                            </span>
                                                        </div>

                                                        <div className="flex items-center gap-1.5">
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleSelectAllLibraries(srv.id)}
                                                                className="h-6 px-2 text-[10px] text-cyan-300 hover:text-cyan-200"
                                                            >
                                                                <CheckSquare className="h-2.5 w-2.5 mr-1" /> Select All
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleDeselectAllLibraries(srv.id)}
                                                                className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
                                                            >
                                                                <Square className="h-2.5 w-2.5 mr-1" /> Deselect All
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    {libraries.length === 0 ? (
                                                        <div className="p-3 text-xs text-muted-foreground bg-white/[0.01] border border-border/30 rounded-lg text-center">
                                                            No libraries discovered yet. Click &quot;Test Connection&quot; above to scan virtual folders from {srv.name}.
                                                        </div>
                                                    ) : (
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                                                            {libraries.map(lib => {
                                                                const isAllowed = isNoneExplicit 
                                                                    ? false 
                                                                    : (hasCustomList ? srv.allowedLibraryIds!.includes(lib.id) : true);

                                                                return (
                                                                    <button
                                                                        key={lib.id}
                                                                        type="button"
                                                                        onClick={() => handleToggleAllowedLibrary(srv.id, lib.id)}
                                                                        className={`p-2 rounded-lg border text-left flex items-center justify-between gap-1.5 transition-all cursor-pointer ${
                                                                            isAllowed
                                                                                ? "bg-primary/20 border-primary/60 text-white font-semibold shadow-xs"
                                                                                : "bg-white/[0.04] border-white/10 text-slate-200 hover:text-white hover:border-white/20 hover:bg-white/[0.08]"
                                                                        }`}
                                                                    >
                                                                        <div className="flex items-center gap-1.5 min-w-0">
                                                                            {lib.type.includes("movie") ? (
                                                                                <Film className="h-3 w-3 text-cyan-400 shrink-0" />
                                                                            ) : lib.type.includes("show") || lib.type.includes("tv") ? (
                                                                                <Tv className="h-3 w-3 text-purple-400 shrink-0" />
                                                                            ) : lib.type.includes("music") ? (
                                                                                <Music className="h-3 w-3 text-emerald-400 shrink-0" />
                                                                            ) : (
                                                                                <FolderCheck className="h-3 w-3 text-amber-400 shrink-0" />
                                                                            )}
                                                                            <span className={`text-xs truncate ${isAllowed ? "font-bold text-white" : "font-medium text-slate-200"}`}>
                                                                                {lib.title}
                                                                            </span>
                                                                        </div>
                                                                        <div className={`h-3.5 w-3.5 rounded shrink-0 flex items-center justify-center border ${
                                                                            isAllowed ? "bg-primary border-primary text-primary-foreground" : "border-slate-500/50 bg-black/20"
                                                                        }`}>
                                                                            {isAllowed && <Check className="h-2.5 w-2.5 stroke-[3]" />}
                                                                        </div>
                                                                    </button>
                                                                );
                                                            })}
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </CardContent>

                                <CardFooter className="pt-2 pb-3 px-4 bg-white/[0.01] border-t border-border/30 flex items-center justify-between">
                                    <span className="text-[11px] text-muted-foreground">
                                        Members will strictly see only the allowed libraries on this server.
                                    </span>
                                    <Button
                                        size="sm"
                                        onClick={() => handleSaveRules(srv)}
                                        disabled={isSavingRules}
                                        className="h-8 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                                    >
                                        {isSavingRules ? (
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        ) : (
                                            <Check className="h-3.5 w-3.5" />
                                        )}
                                        <span>Save Whitelist</span>
                                    </Button>
                                </CardFooter>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Add / Edit Media Server Modal */}
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md bg-[#121218] border-border/60">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                            {editingServer ? (
                                <>
                                    <Pencil className="h-4 w-4 text-primary" /> Edit {editingServer.type === "JELLYFIN" ? "Jellyfin" : "Emby"} Server
                                </>
                            ) : (
                                <>
                                    <Plus className="h-4 w-4 text-primary" /> Add Jellyfin / Emby Server
                                </>
                            )}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            {editingServer
                                ? `Update connection URL or API key credentials for "${editingServer.name}".`
                                : "Connect a Jellyfin or Emby server to Portalarr to enable multi-server library synchronization."}
                        </DialogDescription>
                    </DialogHeader>

                    {dialogErr && (
                        <div className="p-2.5 text-xs bg-red-950/40 border border-red-500/40 text-red-300 rounded-lg flex items-center gap-2">
                            <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            <span>{dialogErr}</span>
                        </div>
                    )}

                    <div className="space-y-3.5 py-2">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Server Platform</Label>
                            <Select value={formType} onValueChange={(v: any) => setFormType(v)}>
                                <SelectTrigger className="h-9 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="JELLYFIN">Jellyfin Media Server</SelectItem>
                                    <SelectItem value="EMBY">Emby Server</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Server Display Name</Label>
                            <Input
                                placeholder="e.g. Living Room Jellyfin or 4K Emby Node"
                                value={formName}
                                onChange={e => setFormName(e.target.value)}
                                className="h-9 text-xs"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label className="text-xs font-semibold">Server URL (LAN or Domain)</Label>
                            <Input
                                placeholder="http://192.168.1.100:8096 or https://jellyfin.example.com"
                                value={formUrl}
                                onChange={e => setFormUrl(e.target.value)}
                                className="h-9 text-xs"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-semibold">API Key (Administrator Token)</Label>
                                {editingServer && formApiKey ? (
                                    <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                                        <Check className="h-3 w-3" /> Saved Key Loaded
                                    </span>
                                ) : editingServer ? (
                                    <span className="text-[10px] text-muted-foreground font-medium">
                                        (Leave blank to keep existing key)
                                    </span>
                                ) : null}
                            </div>
                            <div className="relative">
                                <Input
                                    type={showApiKey ? "text" : "password"}
                                    placeholder={editingServer ? "•••••••••••••••• (Leave blank to keep existing)" : "Generate in Jellyfin/Emby -> Dashboard -> API Keys"}
                                    value={formApiKey}
                                    onChange={e => setFormApiKey(e.target.value)}
                                    className="h-9 text-xs font-mono pr-20"
                                />
                                <div className="absolute right-1 top-1 flex items-center gap-0.5">
                                    {formApiKey && (
                                        <Button
                                            type="button"
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => {
                                                if (typeof navigator !== "undefined" && navigator.clipboard) {
                                                    navigator.clipboard.writeText(formApiKey);
                                                    setCopiedKey(true);
                                                    setTimeout(() => setCopiedKey(false), 2000);
                                                }
                                            }}
                                            className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                            title="Copy API Key"
                                        >
                                            {copiedKey ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        size="icon"
                                        variant="ghost"
                                        onClick={() => setShowApiKey(!showApiKey)}
                                        className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                                        title={showApiKey ? "Hide API Key" : "Show API Key"}
                                    >
                                        {showApiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>
                            </div>
                            <p className="text-[11px] text-muted-foreground">
                                Encrypted using AES-256-GCM. Used to discover libraries and sync user account policies. Click the eye icon to view or copy.
                            </p>
                        </div>
                    </div>

                    <DialogFooter className="gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDialogOpen(false)}
                            disabled={savingServer}
                            className="h-8 text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            onClick={handleSaveServer}
                            disabled={savingServer}
                            className="h-8 text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground gap-1.5"
                        >
                            {savingServer ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            <span>{editingServer ? "Update Server" : "Save Server"}</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
