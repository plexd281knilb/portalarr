"use client";

import { useState, useEffect, useTransition } from "react";
import { 
    getStreamIntelligenceDataAction, 
    backfillTautulliHistoryAction, 
    toggleStreamMonitorModeAction,
    killUserStream,
    clearWatchHistoryAction
} from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription
} from "@/components/ui/dialog";
import { 
    Activity, Tv, Film, Monitor, Cpu, HardDrive, RefreshCw, 
    Play, Pause, XCircle, Zap, Shield, Sparkles, Loader2, Server,
    Layers, Trophy, Flame, Filter, BarChart3, CheckCircle2,
    ShieldAlert, History, Users, Search, Trash2, Clock, Globe,
    Radio, AlertTriangle, Copy, Check, Download, ExternalLink,
    Stethoscope, Info
} from "lucide-react";

export default function StreamIntelligencePage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedTab, setSelectedTab] = useState<string>("activity");
    const [serverFilter, setServerFilter] = useState<string | null>(null);
    const [historySearch, setHistorySearch] = useState<string>("");
    const [historyFilter, setHistoryFilter] = useState<string>("all");
    const [killingSessionKey, setKillingSessionKey] = useState<string | null>(null);

    // Device diagnosis modal state
    const [activeDiagnosis, setActiveDiagnosis] = useState<any | null>(null);
    const [copiedNotice, setCopiedNotice] = useState<boolean>(false);

    // Backfill state
    const [backfillLimit, setBackfillLimit] = useState<number>(500);
    const [isBackfilling, setIsBackfilling] = useState(false);
    const [backfillResult, setBackfillResult] = useState<any | null>(null);

    // Takeover toggle transition
    const [isPending, startTransition] = useTransition();

    const loadData = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await getStreamIntelligenceDataAction({
                search: historySearch || undefined,
                serverFilter: serverFilter || undefined
            });
            if (res.success) {
                setData(res);
            }
        } catch (e) {
            console.error("Failed to load stream intelligence data:", e);
        } finally {
            setLoading(false);
            if (isManual) setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
        const interval = setInterval(() => {
            loadData();
        }, 5000);
        return () => clearInterval(interval);
    }, [historySearch, serverFilter]);

    const handleKillStream = async (session: any) => {
        if (!confirm(`Are you sure you want to stop the stream of "${session.title}" for user "${session.user}"?`)) return;
        setKillingSessionKey(session.sessionKey || session.sessionId);
        try {
            const instanceId = session.instanceId || session.serverId || session.serverName || "plex";
            const sessionKey = session.sessionKey || session.sessionId || "";
            await killUserStream(instanceId, sessionKey);
            await loadData();
        } catch (e) {
            console.error("Failed to kill stream:", e);
        } finally {
            setKillingSessionKey(null);
        }
    };

    const handleToggleTakeover = (checked: boolean) => {
        startTransition(async () => {
            try {
                await toggleStreamMonitorModeAction(checked);
                await loadData(true);
            } catch (e) {
                console.error("Failed toggling stream monitor mode:", e);
            }
        });
    };

    const handleRunBackfill = async () => {
        setIsBackfilling(true);
        setBackfillResult(null);
        try {
            const res = await backfillTautulliHistoryAction({ limit: backfillLimit });
            setBackfillResult(res);
            await loadData(true);
        } catch (e: any) {
            setBackfillResult({ success: false, message: e.message || "Failed running backfill" });
        } finally {
            setIsBackfilling(false);
        }
    };

    const handleCopyNotice = (text: string) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopiedNotice(true);
        setTimeout(() => setCopiedNotice(false), 2000);
    };

    const allSessions = data?.activeStreams || [];
    const filteredSessions = serverFilter
        ? allSessions.filter((s: any) => s.serverName?.toLowerCase().trim() === serverFilter.toLowerCase().trim())
        : allSessions;

    const monitoredServers = data?.serversUsage || [];
    const userProfiles = data?.userProfiles || [];
    const analytics = data?.analytics || {};
    const historyItems = (data?.history?.items || []).filter((h: any) => {
        if (historyFilter === "movies") return h.mediaType === "movie";
        if (historyFilter === "episodes") return h.mediaType === "episode";
        if (historyFilter === "alerts") return h.isSharingAlert === true;
        return true;
    });
    const deviceAudit = data?.deviceAudit || [];
    const tautulliInstances = data?.tautulliInstances || [];
    const useBuiltIn = data?.useBuiltInStreamMonitor ?? true;

    return (
        <div className="space-y-6 max-w-7xl mx-auto pb-12 select-none">
            {/* --- TOP HEADER & TAKEOVER CONTROL BAR --- */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-slate-900/90 via-[#0c0c14]/90 to-slate-900/90 border border-slate-800 shadow-xl backdrop-blur-md">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                            <Radio className="h-6 w-6 animate-pulse" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                                Stream Intelligence
                                <Badge variant="outline" className="text-[10px] uppercase font-bold tracking-widest bg-cyan-500/10 text-cyan-400 border-cyan-500/30">
                                    Multi-Server Cockpit
                                </Badge>
                            </h1>
                            <p className="text-xs text-muted-foreground">
                                Unified watch telemetry, stream diagnostics, and device settings audit across all monitored Plex Media Servers.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    {/* Standalone Takeover Mode Toggle */}
                    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800">
                        <div className="flex flex-col text-right">
                            <span className="text-[11px] font-bold text-white flex items-center gap-1.5 justify-end">
                                <span className={`w-2 h-2 rounded-full ${useBuiltIn ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" : "bg-purple-400"}`} />
                                {useBuiltIn ? "Native Cluster Monitor" : "External Tautulli Monitor"}
                            </span>
                            <span className="text-[9px] text-muted-foreground">
                                {useBuiltIn ? "Standalone apps paused from tracking" : "Standalone app tracking active"}
                            </span>
                        </div>
                        <Switch
                            checked={useBuiltIn}
                            onCheckedChange={handleToggleTakeover}
                            disabled={isPending}
                            className="data-[state=checked]:bg-cyan-500"
                        />
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        className="h-9 px-3 rounded-xl border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-xs text-muted-foreground hover:text-white transition-all shadow-sm"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin text-cyan-400" : ""}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* --- METRIC SUMMARY CARDS --- */}
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Active Streams</p>
                            <h3 className="text-2xl font-black text-cyan-400 mt-0.5">{allSessions.length}</h3>
                            <p className="text-[10px] text-muted-foreground mt-0.5">Across {monitoredServers.length} monitored servers</p>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                            <Activity className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Direct Play Rate</p>
                            <h3 className="text-2xl font-black text-emerald-400 mt-0.5">{analytics.directPlayRatio ?? 100}%</h3>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{analytics.directPlayCount || 0} Direct / {analytics.transcodeCount || 0} Transcode</p>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                            <Zap className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Hours Streamed</p>
                            <h3 className="text-2xl font-black text-purple-400 mt-0.5">{analytics.totalWatchHours || 0} hrs</h3>
                            <p className="text-[10px] text-muted-foreground mt-0.5">{analytics.totalSessions || 0} total sessions logged</p>
                        </div>
                        <div className="h-10 w-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                            <Clock className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                    <CardContent className="p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Device Settings Audit</p>
                            <h3 className={`text-2xl font-black mt-0.5 ${deviceAudit.length > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                                {deviceAudit.length} Issues
                            </h3>
                            <p className="text-[10px] text-muted-foreground mt-0.5">
                                {deviceAudit.length > 0 ? "Suboptimal client settings detected" : "All clients optimal"}
                            </p>
                        </div>
                        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${deviceAudit.length > 0 ? "bg-amber-500/15 border border-amber-500/30 text-amber-400" : "bg-emerald-500/15 border border-emerald-500/30 text-emerald-400"}`}>
                            <Stethoscope className="h-5 w-5" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* --- MAIN TABS NAVIGATION --- */}
            <Tabs value={selectedTab} onValueChange={setSelectedTab} className="space-y-4">
                <TabsList className="bg-slate-900/90 border border-slate-800 p-1 rounded-xl w-full sm:w-auto flex flex-wrap h-auto gap-1">
                    <TabsTrigger 
                        value="activity" 
                        className="text-xs font-bold data-[state=active]:bg-cyan-500/20 data-[state=active]:text-cyan-300 data-[state=active]:border-cyan-500/40 rounded-lg flex items-center gap-1.5"
                    >
                        <Activity className="h-3.5 w-3.5" />
                        Live Activity
                        {allSessions.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-cyan-500/30 text-cyan-200">
                                {allSessions.length}
                            </span>
                        )}
                    </TabsTrigger>

                    <TabsTrigger 
                        value="history" 
                        className="text-xs font-bold data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300 data-[state=active]:border-emerald-500/40 rounded-lg flex items-center gap-1.5"
                    >
                        <History className="h-3.5 w-3.5" />
                        Watch History
                    </TabsTrigger>

                    <TabsTrigger 
                        value="users" 
                        className="text-xs font-bold data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300 data-[state=active]:border-blue-500/40 rounded-lg flex items-center gap-1.5"
                    >
                        <Users className="h-3.5 w-3.5" />
                        User Telemetry
                    </TabsTrigger>

                    <TabsTrigger 
                        value="audit" 
                        className="text-xs font-bold data-[state=active]:bg-amber-500/20 data-[state=active]:text-amber-300 data-[state=active]:border-amber-500/40 rounded-lg flex items-center gap-1.5"
                    >
                        <Stethoscope className="h-3.5 w-3.5" />
                        Device Doctor
                        {deviceAudit.length > 0 && (
                            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/30 text-amber-200">
                                {deviceAudit.length}
                            </span>
                        )}
                    </TabsTrigger>

                    <TabsTrigger 
                        value="analytics" 
                        className="text-xs font-bold data-[state=active]:bg-purple-500/20 data-[state=active]:text-purple-300 data-[state=active]:border-purple-500/40 rounded-lg flex items-center gap-1.5"
                    >
                        <BarChart3 className="h-3.5 w-3.5" />
                        Libraries & Analytics
                    </TabsTrigger>

                    <TabsTrigger 
                        value="backfill" 
                        className="text-xs font-bold data-[state=active]:bg-indigo-500/20 data-[state=active]:text-indigo-300 data-[state=active]:border-indigo-500/40 rounded-lg flex items-center gap-1.5"
                    >
                        <Download className="h-3.5 w-3.5" />
                        Tautulli Sync & Backfill
                    </TabsTrigger>
                </TabsList>

                {/* ========================================================================= */}
                {/* --- TAB 1: LIVE ACTIVITY --- */}
                {/* ========================================================================= */}
                <TabsContent value="activity" className="space-y-4">
                    {/* Server Filter Pills */}
                    {monitoredServers.length > 1 && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 pb-2">
                            <span className="text-xs font-semibold text-muted-foreground mr-1 flex items-center gap-1">
                                <Filter className="h-3.5 w-3.5" /> Server:
                            </span>
                            <Button
                                size="sm"
                                variant={serverFilter === null ? "secondary" : "outline"}
                                onClick={() => setServerFilter(null)}
                                className={`h-7 px-3 text-xs rounded-full ${serverFilter === null ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold" : "border-slate-800 text-muted-foreground"}`}
                            >
                                All Servers ({allSessions.length})
                            </Button>
                            {monitoredServers.map((s: any) => (
                                <Button
                                    key={s.name}
                                    size="sm"
                                    variant={serverFilter === s.name ? "secondary" : "outline"}
                                    onClick={() => setServerFilter(serverFilter === s.name ? null : s.name)}
                                    className={`h-7 px-3 text-xs rounded-full ${serverFilter === s.name ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 font-bold" : "border-slate-800 text-muted-foreground"}`}
                                >
                                    {s.name} ({s.streamCount})
                                </Button>
                            ))}
                        </div>
                    )}

                    {/* Active Sessions Grid */}
                    {loading ? (
                        <div className="p-12 text-center text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-cyan-400 mb-2" />
                            <p className="text-xs">Polling active stream telemetry across servers...</p>
                        </div>
                    ) : filteredSessions.length === 0 ? (
                        <Card className="bg-slate-900/60 border-slate-800 p-12 text-center">
                            <Monitor className="h-12 w-12 text-slate-700 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-white">No Active Streams</h3>
                            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                                There are no active playback sessions currently running on {serverFilter || "any monitored Plex Media Server"}.
                            </p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {filteredSessions.map((session: any) => {
                                const isTranscode = session.videoDecision === "transcode";
                                const diagnosis = session.deviceDiagnosis;

                                return (
                                    <Card key={session.sessionKey} className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
                                        <div>
                                            {/* Poster & Header */}
                                            <div className="p-4 flex gap-3.5">
                                                {session.thumb ? (
                                                    <img 
                                                        src={session.thumb} 
                                                        alt={session.title} 
                                                        className="w-16 h-24 object-cover rounded-lg border border-slate-800 shrink-0 shadow-md" 
                                                    />
                                                ) : (
                                                    <div className="w-16 h-24 rounded-lg bg-slate-950 border border-slate-800 shrink-0 flex items-center justify-center text-slate-600">
                                                        {session.mediaType === "episode" ? <Tv className="h-6 w-6" /> : <Film className="h-6 w-6" />}
                                                    </div>
                                                )}

                                                <div className="flex-1 min-w-0 space-y-1">
                                                    <div className="flex items-center justify-between gap-1.5">
                                                        <Badge variant="outline" className="text-[10px] font-bold bg-cyan-500/10 text-cyan-300 border-cyan-500/30 truncate max-w-[140px]">
                                                            {session.serverName}
                                                        </Badge>
                                                        {session.seasonEpisodeTag && (
                                                            <Badge className="text-[10px] font-mono bg-purple-500/20 text-purple-300 border-purple-500/30">
                                                                {session.seasonEpisodeTag}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <h4 className="text-sm font-bold text-white truncate leading-tight" title={session.title}>
                                                        {session.grandparentTitle || session.title}
                                                    </h4>
                                                    {session.grandparentTitle && (
                                                        <p className="text-xs text-muted-foreground truncate leading-tight">
                                                            {session.episodeTitle || session.title}
                                                        </p>
                                                    )}

                                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5">
                                                        <Users className="h-3 w-3 text-cyan-400" />
                                                        <span className="font-semibold text-slate-200 truncate">{session.user}</span>
                                                    </div>

                                                    <div className="text-[10px] text-muted-foreground truncate">
                                                        {session.player} • {session.device}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Transcode & Telemetry Badges */}
                                            <div className="px-4 py-2 bg-slate-950/60 border-y border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-[10px]">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`px-2 py-0.5 rounded font-bold ${isTranscode ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"}`}>
                                                        {isTranscode ? "Transcode" : "Direct Play"}
                                                    </span>
                                                    {session.transcodeHwRequested && (
                                                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[9px] font-mono">
                                                            NVENC HW
                                                        </Badge>
                                                    )}
                                                </div>

                                                <span className="font-mono text-muted-foreground">
                                                    {session.videoCodec} • {session.streamBitrate ? `${(session.streamBitrate / 1000).toFixed(1)} Mbps` : "Auto"}
                                                </span>
                                            </div>

                                            {/* Suboptimal Device Warning Alert */}
                                            {diagnosis?.hasIssue && (
                                                <div className="m-3 p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 space-y-1.5">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-1.5 text-amber-300 font-bold text-xs">
                                                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                                                            <span className="truncate">{diagnosis.title}</span>
                                                        </div>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => setActiveDiagnosis({ session, diagnosis })}
                                                            className="h-5 px-1.5 text-[10px] text-amber-300 hover:bg-amber-500/20 font-bold shrink-0"
                                                        >
                                                            Fix Steps ➔
                                                        </Button>
                                                    </div>
                                                    <p className="text-[10px] text-amber-200/80 leading-snug line-clamp-2">
                                                        {diagnosis.description}
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Progress Bar & Footer Actions */}
                                        <div className="p-4 pt-2 space-y-2.5">
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                                                    <span>{session.progressPercent || 0}%</span>
                                                    <span className="capitalize">{session.state || "playing"}</span>
                                                </div>
                                                <Progress value={session.progressPercent || 0} className="h-1.5 bg-slate-800" />
                                            </div>

                                            <div className="flex items-center justify-between pt-1">
                                                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[140px]">
                                                    IP: {session.ipAddress || "Unknown"} ({session.location || "LAN"})
                                                </span>

                                                <Button
                                                    size="sm"
                                                    variant="destructive"
                                                    onClick={() => handleKillStream(session)}
                                                    disabled={killingSessionKey === session.sessionKey}
                                                    className="h-7 px-2.5 text-xs rounded-lg font-semibold shadow-sm"
                                                >
                                                    {killingSessionKey === session.sessionKey ? (
                                                        <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <XCircle className="h-3 w-3 mr-1" />
                                                            Stop Stream
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* ========================================================================= */}
                {/* --- TAB 2: WATCH HISTORY --- */}
                {/* ========================================================================= */}
                <TabsContent value="history" className="space-y-4">
                    <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                        <CardHeader className="p-4 pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div>
                                <CardTitle className="text-base font-bold text-white">Cluster Watch History</CardTitle>
                                <CardDescription className="text-xs">
                                    All past completed and in-progress playback sessions recorded across all servers.
                                </CardDescription>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative w-48">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        placeholder="Search user, title, IP..."
                                        value={historySearch}
                                        onChange={(e) => setHistorySearch(e.target.value)}
                                        className="h-8 pl-8 text-xs bg-slate-950 border-slate-800 rounded-lg"
                                    />
                                </div>

                                <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                                    <button
                                        onClick={() => setHistoryFilter("all")}
                                        className={`px-2.5 py-1 rounded-md font-medium ${historyFilter === "all" ? "bg-slate-800 text-white font-bold" : "text-muted-foreground"}`}
                                    >
                                        All ({historyItems.length})
                                    </button>
                                    <button
                                        onClick={() => setHistoryFilter("movies")}
                                        className={`px-2.5 py-1 rounded-md font-medium ${historyFilter === "movies" ? "bg-slate-800 text-white font-bold" : "text-muted-foreground"}`}
                                    >
                                        Movies
                                    </button>
                                    <button
                                        onClick={() => setHistoryFilter("episodes")}
                                        className={`px-2.5 py-1 rounded-md font-medium ${historyFilter === "episodes" ? "bg-slate-800 text-white font-bold" : "text-muted-foreground"}`}
                                    >
                                        Episodes
                                    </button>
                                    <button
                                        onClick={() => setHistoryFilter("alerts")}
                                        className={`px-2.5 py-1 rounded-md font-medium ${historyFilter === "alerts" ? "bg-red-500/20 text-red-300 font-bold" : "text-muted-foreground"}`}
                                    >
                                        🚨 Sharing Alerts
                                    </button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            {historyItems.length === 0 ? (
                                <div className="p-12 text-center text-muted-foreground text-xs">
                                    No historical sessions match your criteria.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
                                    {historyItems.map((item: any) => (
                                        <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition-all text-xs">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="w-8 h-8 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                                                    {item.mediaType === "episode" ? <Tv className="h-4 w-4" /> : <Film className="h-4 w-4" />}
                                                </div>

                                                <div className="min-w-0 space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white truncate">
                                                            {item.grandparentTitle ? `${item.grandparentTitle} - ${item.title}` : item.title}
                                                        </span>
                                                        <Badge variant="outline" className="text-[9px] py-0 font-mono bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                                                            {item.serverName}
                                                        </Badge>
                                                        {item.isSharingAlert && (
                                                            <Badge className="text-[9px] py-0 bg-red-500/20 text-red-300 border-red-500/40">
                                                                🚨 Sharing Alert
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                        <span className="font-semibold text-slate-300">{item.user}</span>
                                                        <span>•</span>
                                                        <span>{item.player || item.device || "Client"}</span>
                                                        <span>•</span>
                                                        <span className="font-mono">{item.ipAddress || "Unknown IP"}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 shrink-0 text-right">
                                                <div className="space-y-0.5">
                                                    <Badge className={`text-[10px] font-semibold ${item.videoDecision === "transcode" ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"}`}>
                                                        {item.videoDecision === "transcode" ? "Transcode" : "Direct Play"}
                                                    </Badge>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {new Date(item.watchedAt).toLocaleDateString()} {new Date(item.watchedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================================= */}
                {/* --- TAB 3: USER TELEMETRY --- */}
                {/* ========================================================================= */}
                <TabsContent value="users" className="space-y-4">
                    <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="text-base font-bold text-white">User Playback Directory</CardTitle>
                            <CardDescription className="text-xs">
                                All members ranked by activity, streaming hours, and Direct Play quality ratio across the cluster.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {userProfiles.length === 0 ? (
                                <div className="p-12 text-center text-muted-foreground text-xs">
                                    No user stream profiles logged yet.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
                                    {userProfiles.map((user: any) => (
                                        <div key={user.user} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/30 transition-all text-xs">
                                            <div className="space-y-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-sm font-bold text-white">{user.user}</span>
                                                    {user.frequentTranscoder && (
                                                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                                                            ⚠️ {user.transcodeRate}% Transcoding
                                                        </Badge>
                                                    )}
                                                    {user.sharingAlerts > 0 && (
                                                        <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[10px]">
                                                            🚨 {user.sharingAlerts} Sharing Alerts
                                                        </Badge>
                                                    )}
                                                </div>

                                                <p className="text-[11px] text-muted-foreground">
                                                    Last watched: <span className="text-slate-300 font-semibold">{user.lastWatchedTitle}</span> on {user.lastPlatform}
                                                </p>

                                                <div className="flex flex-wrap items-center gap-2 pt-1 text-[10px] text-muted-foreground">
                                                    <span>Servers: {user.servers.join(", ") || "None"}</span>
                                                    <span>•</span>
                                                    <span>IP: {user.lastIp || "Unknown"}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-6 justify-between md:justify-end shrink-0">
                                                <div className="text-right space-y-0.5">
                                                    <div className="text-xs font-bold text-cyan-400">
                                                        {user.totalPlays} Plays ({user.totalWatchHours} hrs)
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {user.directPlayCount} Direct Play / {user.transcodeCount} Transcode
                                                    </div>
                                                </div>

                                                {user.frequentTranscoder && (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => {
                                                            const notice = `Hey @${user.user}! We noticed that ${user.transcodeRate}% of your recent streams are downscaling to 720p. To unlock full 1080p/4K Direct Play without server buffering, open Plex on your ${user.lastPlatform || "device"} → Settings (⚙️) → Video, and set Remote Streaming Quality to Maximum/Original!`;
                                                            handleCopyNotice(notice);
                                                        }}
                                                        className="h-8 px-2.5 text-xs rounded-lg border-amber-500/40 text-amber-300 hover:bg-amber-500/20"
                                                    >
                                                        <Copy className="h-3 w-3 mr-1" />
                                                        Copy Fix Guide
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================================= */}
                {/* --- TAB 4: DEVICE DOCTOR & SETTINGS AUDIT --- */}
                {/* ========================================================================= */}
                <TabsContent value="audit" className="space-y-4">
                    <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                        <CardHeader className="p-4 pb-3">
                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Stethoscope className="h-5 w-5 text-amber-400" />
                                Device Quality Doctor & Client Settings Audit
                            </CardTitle>
                            <CardDescription className="text-xs">
                                Identify users whose client devices have incorrect settings (720p Roku auto-adjust, 2 Mbps remote cap, subtitle burn-in) and copy 1-click tailored fix instructions.
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {deviceAudit.length === 0 ? (
                                <div className="p-12 text-center text-muted-foreground text-xs">
                                    <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-2" />
                                    <h4 className="font-bold text-white">All Client Devices Configured Correctly!</h4>
                                    <p className="max-w-md mx-auto mt-1">
                                        No active or chronic client setting issues detected. Streams are Direct Playing without artificial bitrate or resolution caps.
                                    </p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
                                    {deviceAudit.map((audit: any, idx: number) => {
                                        const diag = audit.diagnosis;
                                        return (
                                            <div key={idx} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/30 transition-all text-xs">
                                                <div className="space-y-1.5 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/30 text-[10px]">
                                                            {diag.deviceCategory}
                                                        </Badge>
                                                        <span className="font-bold text-white text-sm">{audit.user}</span>
                                                        {audit.isActiveNow && (
                                                            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[9px] animate-pulse">
                                                                Streaming Now
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <h5 className="font-bold text-amber-300 text-xs flex items-center gap-1.5">
                                                        <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                                        {diag.title}
                                                    </h5>

                                                    <p className="text-[11px] text-muted-foreground max-w-2xl leading-relaxed">
                                                        {diag.description}
                                                    </p>

                                                    <div className="text-[10px] text-slate-300 font-semibold pt-0.5">
                                                        Quick Fix: {diag.quickFix}
                                                    </div>
                                                </div>

                                                <div className="flex items-center gap-2 shrink-0">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setActiveDiagnosis({ session: audit, diagnosis: diag })}
                                                        className="h-8 px-3 rounded-lg border-slate-700 bg-slate-900 text-xs text-white hover:bg-slate-800"
                                                    >
                                                        <Info className="h-3.5 w-3.5 mr-1 text-cyan-400" />
                                                        View Steps
                                                    </Button>

                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleCopyNotice(diag.copyableNotice)}
                                                        className="h-8 px-3 rounded-lg bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold"
                                                    >
                                                        <Copy className="h-3.5 w-3.5 mr-1" />
                                                        Copy Notice
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================================= */}
                {/* --- TAB 5: LIBRARIES & ANALYTICS --- */}
                {/* ========================================================================= */}
                <TabsContent value="analytics" className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Top Movies */}
                        <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                    <Film className="h-4 w-4 text-cyan-400" />
                                    Top 10 Most Watched Movies
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {(!analytics.topMovies || analytics.topMovies.length === 0) ? (
                                    <div className="p-6 text-center text-xs text-muted-foreground">No movie plays recorded yet.</div>
                                ) : (
                                    <div className="divide-y divide-slate-800/60">
                                        {analytics.topMovies.map((m: any, idx: number) => (
                                            <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-800/20">
                                                <div className="flex items-center gap-2.5 truncate">
                                                    <span className="font-mono font-bold text-slate-500 w-4">{idx + 1}.</span>
                                                    <span className="font-semibold text-white truncate">{m.title}</span>
                                                </div>
                                                <Badge variant="outline" className="text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                                                    {m.plays} Plays
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>

                        {/* Top TV Shows */}
                        <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                            <CardHeader className="p-4 pb-2">
                                <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                    <Tv className="h-4 w-4 text-purple-400" />
                                    Top 10 Most Watched TV Series
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-0">
                                {(!analytics.topShows || analytics.topShows.length === 0) ? (
                                    <div className="p-6 text-center text-xs text-muted-foreground">No series plays recorded yet.</div>
                                ) : (
                                    <div className="divide-y divide-slate-800/60">
                                        {analytics.topShows.map((s: any, idx: number) => (
                                            <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-800/20">
                                                <div className="flex items-center gap-2.5 truncate">
                                                    <span className="font-mono font-bold text-slate-500 w-4">{idx + 1}.</span>
                                                    <span className="font-semibold text-white truncate">{s.title}</span>
                                                </div>
                                                <Badge variant="outline" className="text-[10px] font-mono bg-purple-500/10 text-purple-300 border-purple-500/30">
                                                    {s.plays} Plays
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                {/* ========================================================================= */}
                {/* --- TAB 6: TAUTULLI SYNC & BACKFILL --- */}
                {/* ========================================================================= */}
                <TabsContent value="backfill" className="space-y-4">
                    <Card className="bg-slate-900/80 border-slate-800 backdrop-blur-md">
                        <CardHeader className="p-5 pb-3">
                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Download className="h-5 w-5 text-indigo-400" />
                                Tautulli Historical Backfill & Standalone Control
                            </CardTitle>
                            <CardDescription className="text-xs max-w-2xl">
                                Import past playback logs from your standalone Tautulli instances into Portalarr's native SQLite database. Once imported, all statistics, users, and watch history across all servers are permanently accessible directly within DomsHomeLab.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-5 space-y-6">
                            {/* Standalone Instances Status */}
                            <div className="space-y-2.5">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Configured External Tautulli Instances</h4>
                                {tautulliInstances.length === 0 ? (
                                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-muted-foreground">
                                        No external Tautulli instances currently configured in Settings → General.
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        {tautulliInstances.map((t: any) => (
                                            <div key={t.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                                                <div>
                                                    <div className="font-bold text-white text-xs">{t.name}</div>
                                                    <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[200px]">{t.url}</div>
                                                </div>
                                                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">
                                                    {useBuiltIn ? "Backfill Source" : "Active Tracking"}
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Backfill Controls */}
                            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-4">
                                <div className="space-y-1">
                                    <h4 className="text-xs font-bold text-white">Import Historical Sessions from Tautulli</h4>
                                    <p className="text-[11px] text-muted-foreground">
                                        Pulls past play history, maps all users and media records, and skips any duplicate rows that are already recorded in SQLite.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs text-muted-foreground font-medium">Batch Limit:</span>
                                        <select
                                            value={backfillLimit}
                                            onChange={(e) => setBackfillLimit(Number(e.target.value))}
                                            className="h-8 px-2 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white"
                                        >
                                            <option value={100}>100 records</option>
                                            <option value={500}>500 records</option>
                                            <option value={1000}>1,000 records</option>
                                            <option value={5000}>5,000 records (Deep backfill)</option>
                                        </select>
                                    </div>

                                    <Button
                                        onClick={handleRunBackfill}
                                        disabled={isBackfilling || tautulliInstances.length === 0}
                                        className="h-8 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs"
                                    >
                                        {isBackfilling ? (
                                            <>
                                                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                                                Importing Sessions...
                                            </>
                                        ) : (
                                            <>
                                                <Download className="h-3.5 w-3.5 mr-1.5" />
                                                Start History Backfill
                                            </>
                                        )}
                                    </Button>

                                    {data?.tautulliBackfillLastRun && (
                                        <span className="text-[10px] text-muted-foreground font-mono">
                                            Last run: {new Date(data.tautulliBackfillLastRun).toLocaleString()}
                                        </span>
                                    )}
                                </div>

                                {backfillResult && (
                                    <div className={`p-3 rounded-xl text-xs font-medium ${backfillResult.success ? "bg-emerald-950/40 border border-emerald-500/40 text-emerald-300" : "bg-red-950/40 border border-red-500/40 text-red-300"}`}>
                                        {backfillResult.message}
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* --- DEVICE DIAGNOSIS & FIX MODAL --- */}
            {activeDiagnosis && (
                <Dialog open={!!activeDiagnosis} onOpenChange={(open) => !open && setActiveDiagnosis(null)}>
                    <DialogContent className="max-w-md bg-[#0c0c14] border-slate-800 text-white rounded-2xl p-6">
                        <DialogHeader>
                            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-400" />
                                {activeDiagnosis.diagnosis.title}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">
                                Step-by-step fix steps for <strong className="text-white">{activeDiagnosis.diagnosis.deviceCategory}</strong> used by user <strong className="text-cyan-400">{activeDiagnosis.session?.user}</strong>.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 pt-2">
                            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-xs text-amber-200 leading-relaxed">
                                {activeDiagnosis.diagnosis.description}
                            </div>

                            <div className="space-y-2">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Client Fix Instructions:</h4>
                                <ol className="space-y-2 text-xs text-slate-300 list-decimal list-inside bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                                    {activeDiagnosis.diagnosis.stepByStepGuide.map((step: string, i: number) => (
                                        <li key={i} className="leading-snug">{step}</li>
                                    ))}
                                </ol>
                            </div>

                            <div className="pt-2 flex items-center justify-between gap-3">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleCopyNotice(activeDiagnosis.diagnosis.copyableNotice)}
                                    className="h-9 flex-1 rounded-xl border-slate-800 bg-slate-900 text-xs text-white hover:bg-slate-800"
                                >
                                    {copiedNotice ? <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                                    {copiedNotice ? "Copied to Clipboard!" : "Copy Notice for User"}
                                </Button>

                                <Button
                                    size="sm"
                                    onClick={() => setActiveDiagnosis(null)}
                                    className="h-9 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white"
                                >
                                    Close
                                </Button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
