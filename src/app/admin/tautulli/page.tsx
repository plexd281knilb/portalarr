"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { 
    getStreamIntelligenceDataAction, 
    backfillTautulliHistoryAction, 
    startTautulliBackfillAction,
    getTautulliBackfillStatusAction,
    stopTautulliBackfillAction,
    toggleStreamMonitorModeAction,
    killUserStream,
    clearWatchHistoryAction,
    getUserDetailedTelemetryAction
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
    Stethoscope, Info, ChevronRight, Smartphone, Laptop,
    Home, Compass, ShieldCheck, ArrowUpDown, Volume2
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

    // Live Activity sort state with localStorage persistence
    const [streamSort, setStreamSort] = useState<string>("user_asc");

    useEffect(() => {
        try {
            const savedSort = localStorage.getItem("portalarr_live_activity_sort");
            if (savedSort) {
                setStreamSort(savedSort);
            }
        } catch (e) {}
    }, []);

    const handleSortChange = (newSort: string) => {
        setStreamSort(newSort);
        try {
            localStorage.setItem("portalarr_live_activity_sort", newSort);
        } catch (e) {}
    };

    // Device diagnosis modal state
    const [activeDiagnosis, setActiveDiagnosis] = useState<any | null>(null);
    const [copiedNotice, setCopiedNotice] = useState<boolean>(false);

    // User detailed telemetry modal state
    const [selectedUser, setSelectedUser] = useState<string | null>(null);
    const [userDetails, setUserDetails] = useState<any | null>(null);
    const [loadingUserDetails, setLoadingUserDetails] = useState(false);
    const [userModalTab, setUserModalTab] = useState<string>("history");
    const [userHistorySearch, setUserHistorySearch] = useState<string>("");
    const [userHistoryFilter, setUserHistoryFilter] = useState<string>("all");

    // User directory search & sharing filters
    const [userDirectorySearch, setUserDirectorySearch] = useState<string>("");
    const [userSharingFilter, setUserSharingFilter] = useState<string>("all");

    // Backfill state
    const [backfillLimit, setBackfillLimit] = useState<number>(500);
    const [isBackfilling, setIsBackfilling] = useState(false);
    const [backfillProgress, setBackfillProgress] = useState<any | null>(null);
    const [backfillResult, setBackfillResult] = useState<any | null>(null);

    // Takeover toggle transition
    const [isPending, startTransition] = useTransition();

    const handleOpenUserModal = async (username: string) => {
        if (!username) return;
        setSelectedUser(username);
        setLoadingUserDetails(true);
        setUserModalTab("history");
        setUserHistorySearch("");
        setUserHistoryFilter("all");
        try {
            const res = await getUserDetailedTelemetryAction(username);
            setUserDetails(res);
        } catch (err) {
            console.error("Failed loading user telemetry details:", err);
        } finally {
            setLoadingUserDetails(false);
        }
    };

    const getDeviceIcon = (platform?: string, device?: string, player?: string) => {
        const str = `${platform || ""} ${device || ""} ${player || ""}`.toLowerCase();
        if (str.includes("tv") || str.includes("roku") || str.includes("fire") || str.includes("chromecast") || str.includes("shield")) {
            return <Tv className="h-4 w-4 text-cyan-400" />;
        }
        if (str.includes("phone") || str.includes("ios") || str.includes("android") || str.includes("mobile")) {
            return <Smartphone className="h-4 w-4 text-purple-400" />;
        }
        if (str.includes("web") || str.includes("chrome") || str.includes("firefox") || str.includes("safari") || str.includes("mac") || str.includes("windows")) {
            return <Laptop className="h-4 w-4 text-emerald-400" />;
        }
        return <Monitor className="h-4 w-4 text-cyan-400" />;
    };

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

    // Check on mount if a backfill is already running in background
    useEffect(() => {
        let mounted = true;
        getTautulliBackfillStatusAction()
            .then((status) => {
                if (mounted && status?.isRunning) {
                    setIsBackfilling(true);
                    setBackfillProgress(status);
                }
            })
            .catch(() => {});
        return () => {
            mounted = false;
        };
    }, []);

    // Poll status while backfill is running
    useEffect(() => {
        if (!isBackfilling) return;

        const interval = setInterval(async () => {
            try {
                const status = await getTautulliBackfillStatusAction();
                setBackfillProgress(status);

                if (!status.isRunning) {
                    setIsBackfilling(false);
                    if (status.result) {
                        setBackfillResult(status.result);
                    } else if (status.error) {
                        setBackfillResult({ success: false, message: status.error });
                    }
                    await loadData(true);
                }
            } catch (e: any) {
                console.error("Failed polling backfill status:", e);
            }
        }, 1200);

        return () => clearInterval(interval);
    }, [isBackfilling]);

    const handleRunBackfill = async () => {
        setIsBackfilling(true);
        setBackfillResult(null);
        setBackfillProgress(null);
        try {
            const res = await startTautulliBackfillAction({
                limit: backfillLimit === 0 ? undefined : backfillLimit,
                unlimited: backfillLimit === 0
            });
            if (res.progress) {
                setBackfillProgress(res.progress);
            }
        } catch (e: any) {
            setIsBackfilling(false);
            setBackfillResult({ success: false, message: e.message || "Failed starting backfill" });
        }
    };

    const handleStopBackfill = async () => {
        try {
            await stopTautulliBackfillAction();
        } catch (e: any) {
            console.error("Failed stopping backfill:", e);
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

    const sortedFilteredSessions = useMemo(() => {
        const list = filteredSessions.filter((s: any) => 
            s && (s.title || s.grandparentTitle || s.fullTitle) && s.state !== "stopped"
        );
        list.sort((a: any, b: any) => {
            let primaryDiff = 0;
            if (streamSort === "user_asc") {
                primaryDiff = (a.user || "").localeCompare(b.user || "");
            } else if (streamSort === "user_desc") {
                primaryDiff = (b.user || "").localeCompare(a.user || "");
            } else if (streamSort === "server") {
                primaryDiff = (a.serverName || "").localeCompare(b.serverName || "");
            } else if (streamSort === "bandwidth") {
                primaryDiff = (Number(b.streamBitrate) || 0) - (Number(a.streamBitrate) || 0);
            } else if (streamSort === "progress") {
                primaryDiff = (Number(b.progressPercent) || 0) - (Number(a.progressPercent) || 0);
            } else if (streamSort === "transcode_first") {
                const aTrans = a.videoDecision === "transcode" ? 1 : 0;
                const bTrans = b.videoDecision === "transcode" ? 1 : 0;
                primaryDiff = bTrans - aTrans;
            }

            if (primaryDiff !== 0) return primaryDiff;

            // Rock-solid deterministic tiebreaker chain so cards NEVER move or swap places on refresh
            const userDiff = (a.user || "").localeCompare(b.user || "");
            if (userDiff !== 0) return userDiff;

            const serverDiff = (a.serverName || "").localeCompare(b.serverName || "");
            if (serverDiff !== 0) return serverDiff;

            const titleA = String(a.grandparentTitle || a.title || "");
            const titleB = String(b.grandparentTitle || b.title || "");
            const titleDiff = titleA.localeCompare(titleB);
            if (titleDiff !== 0) return titleDiff;

            const keyA = String(a.uniqueStreamKey || a.sessionKey || a.sessionId || "");
            const keyB = String(b.uniqueStreamKey || b.sessionKey || b.sessionId || "");
            return keyA.localeCompare(keyB);
        });
        return list;
    }, [filteredSessions, streamSort]);

    const monitoredServers = data?.serversUsage || [];
    const userProfiles = data?.userProfiles || [];
    const filteredUserProfiles = userProfiles.filter((user: any) => {
        if (userSharingFilter === "sharing") {
            if (user.sharingAssessment?.risk !== "HIGH_SHARING_RISK" && user.sharingAssessment?.risk !== "MODERATE_SHARING_RISK" && (user.sharingAlerts || 0) === 0) return false;
        } else if (userSharingFilter === "travel") {
            if (user.sharingAssessment?.risk !== "SECOND_HOME" && user.sharingAssessment?.risk !== "VACATION_TRAVEL") return false;
        } else if (userSharingFilter === "roaming") {
            if (user.sharingAssessment?.risk !== "MOBILE_ROAMING") return false;
        } else if (userSharingFilter === "transcoding") {
            if (!user.frequentTranscoder) return false;
        }

        if (userDirectorySearch.trim()) {
            const q = userDirectorySearch.toLowerCase().trim();
            const u = (user.user || "").toLowerCase();
            const lastTitle = (user.lastWatchedTitle || "").toLowerCase();
            const platform = (user.lastPlatform || "").toLowerCase();
            const ip = (user.lastIp || "").toLowerCase();
            const homeIp = (user.sharingAssessment?.primaryHomeIp || "").toLowerCase();
            return u.includes(q) || lastTitle.includes(q) || platform.includes(q) || ip.includes(q) || homeIp.includes(q);
        }

        return true;
    });

    const userSharingCounts = {
        all: userProfiles.length,
        sharing: userProfiles.filter((u: any) => u.sharingAssessment?.risk === "HIGH_SHARING_RISK" || u.sharingAssessment?.risk === "MODERATE_SHARING_RISK" || (u.sharingAlerts || 0) > 0).length,
        travel: userProfiles.filter((u: any) => u.sharingAssessment?.risk === "SECOND_HOME" || u.sharingAssessment?.risk === "VACATION_TRAVEL").length,
        roaming: userProfiles.filter((u: any) => u.sharingAssessment?.risk === "MOBILE_ROAMING").length,
        transcoding: userProfiles.filter((u: any) => u.frequentTranscoder).length,
    };

    const analytics = data?.analytics || {};
    const historyItems = (data?.history?.items || []).filter((h: any) => {
        if (historyFilter === "movies") return h.mediaType === "movie";
        if (historyFilter === "episodes") return h.mediaType === "episode";
        if (historyFilter === "alerts") return h.isSharingAlert === true;
        return true;
    });

    const userModalHistoryItems = (userDetails?.history || []).filter((h: any) => {
        if (userHistoryFilter === "movies") return h.mediaType === "movie";
        if (userHistoryFilter === "episodes") return h.mediaType === "episode";
        if (userHistoryFilter === "alerts") return h.isSharingAlert === true;
        return true;
    }).filter((h: any) => {
        if (!userHistorySearch.trim()) return true;
        const q = userHistorySearch.toLowerCase().trim();
        return (
            (h.title && h.title.toLowerCase().includes(q)) ||
            (h.grandparentTitle && h.grandparentTitle.toLowerCase().includes(q)) ||
            (h.serverName && h.serverName.toLowerCase().includes(q)) ||
            (h.player && h.player.toLowerCase().includes(q)) ||
            (h.device && h.device.toLowerCase().includes(q)) ||
            (h.ipAddress && h.ipAddress.toLowerCase().includes(q))
        );
    });
    const deviceAudit = data?.deviceAudit || [];
    const tautulliInstances = data?.tautulliInstances || [];
    const useBuiltIn = data?.useBuiltInStreamMonitor ?? true;

    return (
        <div className="space-y-6 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] mx-auto w-full min-w-0 pb-12 select-none">
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

                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-between md:justify-end">
                    {/* Standalone Takeover Mode Toggle */}
                    <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 flex-1 sm:flex-initial justify-between sm:justify-end">
                        <div className="flex flex-col text-left sm:text-right">
                            <span className="text-[11px] font-bold text-white flex items-center gap-1.5 sm:justify-end">
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
                            className="data-[state=checked]:bg-cyan-500 shrink-0"
                        />
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        className="h-9 px-3 rounded-xl border-slate-800 bg-slate-900/80 hover:bg-slate-800 text-xs text-muted-foreground hover:text-white transition-all shadow-sm shrink-0"
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
                    {/* Live Activity Toolbar: Server Filter Pills & Persistent Sort Selector */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 pb-2">
                        {/* Server Filter Pills */}
                        <div className="flex flex-wrap items-center gap-2">
                            {monitoredServers.length > 1 && (
                                <>
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
                                </>
                            )}
                        </div>

                        {/* Persistent Stream Sorting Selector */}
                        <div className="flex items-center gap-2 sm:ml-auto">
                            <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                <ArrowUpDown className="h-3.5 w-3.5 text-cyan-400" /> Sort:
                            </span>
                            <select
                                value={streamSort}
                                onChange={(e) => handleSortChange(e.target.value)}
                                className="h-7 px-2.5 text-xs rounded-lg bg-slate-900 border border-slate-700/70 text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 cursor-pointer"
                                title="Sort stream cards"
                            >
                                <option value="user_asc">User (A → Z)</option>
                                <option value="user_desc">User (Z → A)</option>
                                <option value="server">Server Name</option>
                                <option value="bandwidth">Bandwidth (High → Low)</option>
                                <option value="progress">Progress (Most Watched)</option>
                                <option value="transcode_first">Transcodes First</option>
                            </select>
                        </div>
                    </div>

                    {/* Active Sessions Grid */}
                    {loading ? (
                        <div className="p-12 text-center text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin mx-auto text-cyan-400 mb-2" />
                            <p className="text-xs">Polling active stream telemetry across servers...</p>
                        </div>
                    ) : sortedFilteredSessions.length === 0 ? (
                        <Card className="bg-slate-900/60 border-slate-800 p-12 text-center">
                            <Monitor className="h-12 w-12 text-slate-700 mx-auto mb-3" />
                            <h3 className="text-base font-bold text-white">No Active Streams</h3>
                            <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                                There are no active playback sessions currently running on {serverFilter || "any monitored Plex Media Server"}.
                            </p>
                        </Card>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sortedFilteredSessions.map((session: any, idx: number) => {
                                const isTranscode = session.videoDecision === "transcode";
                                const diagnosis = session.deviceDiagnosis;

                                return (
                                    <Card key={session.uniqueStreamKey || `${session.serverName}_${session.sessionKey}_${session.user}_${idx}`} className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden flex flex-col justify-between">
                                        <div>
                                            {/* Poster & Header */}
                                            <div className="p-4 flex gap-3.5">
                                                <div className="relative w-16 h-24 rounded-lg overflow-hidden shrink-0 bg-slate-950 border border-slate-800 flex items-center justify-center shadow-md">
                                                    <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                                                        {session.mediaType === "episode" ? <Tv className="h-6 w-6" /> : <Film className="h-6 w-6" />}
                                                    </div>
                                                    {session.thumb && (
                                                        <img 
                                                            src={session.thumb} 
                                                            alt={session.title} 
                                                            className="w-full h-full object-cover relative z-10" 
                                                            onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                                                        />
                                                    )}
                                                </div>

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

                                                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-0.5 flex-wrap">
                                                        {session.userThumb ? (
                                                            <img 
                                                                src={session.userThumb} 
                                                                alt="" 
                                                                className="w-4 h-4 rounded-full object-cover shrink-0 border border-slate-700" 
                                                                onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                                                            />
                                                        ) : (
                                                            <Users className="h-3 w-3 text-cyan-400 shrink-0" />
                                                        )}
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleOpenUserModal(session.user)}
                                                            className="font-semibold text-slate-200 hover:text-cyan-300 hover:underline cursor-pointer truncate text-left transition-colors"
                                                            title={`View full telemetry for ${session.user}`}
                                                        >
                                                            {session.user}
                                                        </button>
                                                        {session.householdBadge && (
                                                            <Badge 
                                                                variant="outline" 
                                                                className={`text-[9px] font-bold px-1.5 py-0 border ${session.householdBadge.color} ${session.isSharingAlert ? "animate-pulse" : ""}`}
                                                                title={session.householdBadge.desc}
                                                            >
                                                                {session.householdBadge.label}
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground truncate pt-0.5">
                                                        <span className="truncate">{session.player} • {session.device}</span>
                                                        <span className="text-slate-600">•</span>
                                                        <span className="font-mono text-slate-400 shrink-0">
                                                            {session.connectionLabel || (session.location === "lan" ? "⚡ Direct LAN" : "🌐 Direct WAN")}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Transcode, Video & Telemetry Badges */}
                                            <div className="px-4 py-2 bg-slate-950/60 border-y border-slate-800/80 flex flex-wrap items-center justify-between gap-1.5 text-[10px]">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className={`px-2 py-0.5 rounded font-bold ${isTranscode ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"}`}>
                                                        {isTranscode ? "Transcode" : "Direct Play"}
                                                    </span>

                                                    {/* Resolution Conversion & Downscaling Badge */}
                                                    {session.sourceResolution && (
                                                        <span className={`px-2 py-0.5 rounded font-mono font-bold text-[9px] border ${
                                                            session.sourceResolution !== session.streamResolution && session.streamResolution
                                                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                                                : "bg-slate-800 text-slate-200 border-slate-700"
                                                        }`}>
                                                            {session.sourceResolution !== session.streamResolution && session.streamResolution 
                                                                ? `📉 ${session.sourceResolution} ➔ ${session.streamResolution}` 
                                                                : (session.streamResolution || session.sourceResolution)}
                                                        </span>
                                                    )}

                                                    {/* HDR & Tone Mapping */}
                                                    {session.hdrFormat && (
                                                        <Badge className="text-[9px] font-bold bg-amber-500/20 text-amber-300 border-amber-500/30 font-mono flex items-center gap-1">
                                                            ✨ {session.hdrFormat} {session.isToneMapping ? "➔ SDR Tone Mapped" : ""}
                                                        </Badge>
                                                    )}

                                                    {/* Hardware Acceleration & Power Badges */}
                                                    {isTranscode && (
                                                        session.isHw || session.transcodeHwRequested || session.transcodeHwEncoding ? (
                                                            <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[9px] font-mono flex items-center gap-1" title={session.hwPowerBadge || "GPU Hardware Accelerated (Low CPU / Low Power)"}>
                                                                <Zap className="h-2.5 w-2.5 text-cyan-400" />
                                                                {session.hwEngine || "GPU HW"}{session.transcodeHwDecoding ? ` (${session.transcodeHwDecoding} ➔ ${session.transcodeHwEncoding || session.hwEngine || "NVENC"})` : ""} • Low Power
                                                            </Badge>
                                                        ) : (
                                                            <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/40 text-[9px] font-mono flex items-center gap-1" title="Software transcoding running on CPU cores (High CPU load & power)">
                                                                <Flame className="h-2.5 w-2.5 text-rose-400" />
                                                                CPU Software • High Power
                                                            </Badge>
                                                        )
                                                    )}

                                                    {/* Transcode Speed & Real-time Playback Health */}
                                                    {isTranscode && session.transcodeSpeed && (
                                                        <Badge variant="outline" className={`text-[9px] font-mono flex items-center gap-1 ${
                                                            session.transcodeSpeedHealthy !== false
                                                                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                                                : "bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse"
                                                        }`} title={session.transcodeSpeedHealthy !== false ? "Transcode speed is faster than real-time playback" : "Transcode speed is slower than real-time playback (buffering risk!)"}>
                                                            <Clock className="h-2.5 w-2.5" />
                                                            ⚡ {session.transcodeSpeed} speed {session.transcodeSpeedHealthy !== false ? "(Real-Time OK)" : "(Slow)"}
                                                        </Badge>
                                                    )}

                                                    {/* Throttle / Power Saving State */}
                                                    {isTranscode && session.transcodeThrottled && (
                                                        <Badge variant="outline" className="text-[9px] font-mono bg-slate-800 text-slate-300 border-slate-700 flex items-center gap-1" title="Plex transcoder has paused because the buffer is ahead. Server CPU/GPU is at 0% idle power saving!">
                                                            💤 Throttled (Buffer Ahead • Power Saving)
                                                        </Badge>
                                                    )}

                                                    {/* Buffer Ahead (if available) */}
                                                    {isTranscode && session.transcodeBufferAheadFormatted && (
                                                        <span className="text-[9px] font-mono text-cyan-400/90 font-medium">
                                                            ({session.transcodeBufferAheadFormatted})
                                                        </span>
                                                    )}
                                                </div>

                                                <span className="font-mono text-muted-foreground text-[10px]">
                                                    {session.videoCodec !== session.streamVideoCodec && session.streamVideoCodec
                                                        ? `${session.videoCodec} ➔ ${session.streamVideoCodec}`
                                                        : session.videoCodec} • {session.streamBitrate ? `${(session.streamBitrate / 1000).toFixed(1)} Mbps` : "Auto"}
                                                </span>
                                            </div>

                                            {/* Audio & Subtitle Diagnostics Row */}
                                            <div className="px-4 py-1.5 bg-slate-950/40 flex flex-wrap items-center justify-between gap-2 text-[10px] border-b border-slate-800/60 font-mono">
                                                <div className="flex items-center gap-1.5 truncate text-slate-300">
                                                    <Volume2 className="h-3 w-3 text-cyan-400 shrink-0" />
                                                    <span className="truncate">
                                                        {session.sourceAudioCodec || session.audioCodec || "Audio"} {session.sourceAudioChannels ? `(${session.sourceAudioChannels})` : ""}
                                                        {(session.sourceAudioCodec !== session.streamAudioCodec && session.streamAudioCodec) || (session.sourceAudioChannels !== session.streamAudioChannels && session.streamAudioChannels)
                                                            ? ` ➔ ${session.streamAudioCodec} (${session.streamAudioChannels || "Stereo"})` 
                                                            : (session.audioDecision === "direct play" ? " (Direct)" : "")}
                                                    </span>
                                                </div>
                                                {session.hasSubtitle && (
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className="text-slate-400">💬 {session.subtitleLanguage || "Sub"} {session.subtitleCodec ? `(${session.subtitleCodec})` : ""}</span>
                                                        {session.isSubtitleBurnIn && (
                                                            <Badge variant="outline" className="text-[9px] font-bold bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse" title="Subtitles are being burned into video, forcing CPU/GPU transcode">
                                                                🔥 Burned In
                                                            </Badge>
                                                        )}
                                                    </div>
                                                )}
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
                                                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                                                    <span className="text-slate-200 font-semibold">
                                                        {session.viewOffsetFormatted || "0:00"} / {session.durationFormatted || "0:00"} ({session.progressPercent || 0}%)
                                                    </span>
                                                    {session.etaTime ? (
                                                        <span className="text-cyan-400 font-medium">
                                                            Ends at {session.etaTime} {session.remainingFormatted ? `(-${session.remainingFormatted} left)` : ""}
                                                        </span>
                                                    ) : (
                                                        <span className="capitalize">{session.state || "playing"}</span>
                                                    )}
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

                            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                <div className="relative flex-1 sm:w-56 sm:flex-initial">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        placeholder="Search user, title, IP..."
                                        value={historySearch}
                                        onChange={(e) => setHistorySearch(e.target.value)}
                                        className="h-8 pl-8 text-xs bg-slate-950 border-slate-800 rounded-lg text-white"
                                    />
                                </div>

                                <div className="flex flex-wrap items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
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
                                                <div className="relative w-9 h-13 sm:w-10 sm:h-14 rounded-md overflow-hidden shrink-0 bg-slate-950 border border-slate-800 flex items-center justify-center shadow-sm">
                                                    <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                                                        {item.mediaType === "episode" ? <Tv className="h-4 w-4" /> : <Film className="h-4 w-4" />}
                                                    </div>
                                                    {item.thumb && (
                                                        <img 
                                                            src={item.thumb} 
                                                            alt={item.title} 
                                                            className="w-full h-full object-cover relative z-10" 
                                                            onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                                                        />
                                                    )}
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
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleOpenUserModal(item.user)}
                                                            className="font-semibold text-slate-300 hover:text-cyan-300 hover:underline cursor-pointer transition-colors text-left"
                                                            title={`View full telemetry for ${item.user}`}
                                                        >
                                                            {item.user}
                                                        </button>
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
                        <CardHeader className="p-4 pb-3 space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div>
                                    <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                        <Users className="h-5 w-5 text-cyan-400" />
                                        User Playback Directory & Account Intelligence
                                    </CardTitle>
                                    <CardDescription className="text-xs">
                                        All members ranked by activity, streaming hours, Direct Play ratio, and smart multi-household sharing detection.
                                    </CardDescription>
                                </div>
                                <div className="relative w-full sm:w-64">
                                    <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        placeholder="Search user, device, IP..."
                                        value={userDirectorySearch}
                                        onChange={(e) => setUserDirectorySearch(e.target.value)}
                                        className="h-8 pl-8 text-xs bg-slate-950 border-slate-800 rounded-lg text-white"
                                    />
                                </div>
                            </div>

                            {/* Filter Pills */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                                <button
                                    onClick={() => setUserSharingFilter("all")}
                                    className={`px-3 py-1 rounded-lg font-medium transition-all ${userSharingFilter === "all" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold" : "bg-slate-950 border border-slate-800 text-muted-foreground hover:text-white"}`}
                                >
                                    All Users ({userSharingCounts.all})
                                </button>
                                <button
                                    onClick={() => setUserSharingFilter("sharing")}
                                    className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${userSharingFilter === "sharing" ? "bg-red-500/20 text-red-300 border border-red-500/40 font-bold" : "bg-slate-950 border border-slate-800 text-muted-foreground hover:text-white"}`}
                                >
                                    <span>🚨 Suspected Sharing</span>
                                    <span className="px-1.5 py-0.2 rounded-full bg-red-950/80 text-[10px] text-red-300 font-mono">{userSharingCounts.sharing}</span>
                                </button>
                                <button
                                    onClick={() => setUserSharingFilter("travel")}
                                    className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${userSharingFilter === "travel" ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold" : "bg-slate-950 border border-slate-800 text-muted-foreground hover:text-white"}`}
                                >
                                    <span>🏡 2nd Home / Vacation</span>
                                    <span className="px-1.5 py-0.2 rounded-full bg-purple-950/80 text-[10px] text-purple-300 font-mono">{userSharingCounts.travel}</span>
                                </button>
                                <button
                                    onClick={() => setUserSharingFilter("roaming")}
                                    className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${userSharingFilter === "roaming" ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold" : "bg-slate-950 border border-slate-800 text-muted-foreground hover:text-white"}`}
                                >
                                    <span>📱 Mobile Roaming</span>
                                    <span className="px-1.5 py-0.2 rounded-full bg-indigo-950/80 text-[10px] text-indigo-300 font-mono">{userSharingCounts.roaming}</span>
                                </button>
                                <button
                                    onClick={() => setUserSharingFilter("transcoding")}
                                    className={`px-3 py-1 rounded-lg font-medium transition-all flex items-center gap-1.5 ${userSharingFilter === "transcoding" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold" : "bg-slate-950 border border-slate-800 text-muted-foreground hover:text-white"}`}
                                >
                                    <span>⚠️ Transcoders</span>
                                    <span className="px-1.5 py-0.2 rounded-full bg-amber-950/80 text-[10px] text-amber-300 font-mono">{userSharingCounts.transcoding}</span>
                                </button>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {filteredUserProfiles.length === 0 ? (
                                <div className="p-12 text-center text-muted-foreground text-xs">
                                    No user stream profiles match your search or filter criteria.
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/60 max-h-[600px] overflow-y-auto">
                                    {filteredUserProfiles.map((user: any) => (
                                        <div 
                                            key={user.user} 
                                            onClick={() => handleOpenUserModal(user.user)}
                                            className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/60 hover:ring-1 hover:ring-cyan-500/40 rounded-xl cursor-pointer transition-all text-xs group"
                                        >
                                            <div className="space-y-1.5 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors flex items-center gap-1.5">
                                                        <Users className="h-4 w-4 text-cyan-400" />
                                                        {user.user}
                                                    </span>
                                                    {user.sharingAssessment && (
                                                        <Badge className={`text-[10px] font-semibold border ${user.sharingAssessment.badgeColor}`}>
                                                            {user.sharingAssessment.label || user.sharingAssessment.badgeLabel}
                                                        </Badge>
                                                    )}
                                                    {user.sharingAssessment?.fixedTvOverlapCount > 0 && (
                                                        <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px] animate-pulse">
                                                            🚨 {user.sharingAssessment.fixedTvOverlapCount} Dual TV Overlaps
                                                        </Badge>
                                                    )}
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

                                                <div className="flex flex-wrap items-center gap-2 pt-0.5 text-[10px] text-muted-foreground">
                                                    <span className="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-300 font-medium flex items-center gap-1">
                                                        <Smartphone className="h-3 w-3 text-cyan-400" />
                                                        {user.devices?.length || user.devicesCount || user.platforms?.length || 1} {((user.devices?.length || user.devicesCount || 1) === 1) ? "Device" : "Devices"}
                                                    </span>
                                                    <span className="px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-slate-300 font-medium flex items-center gap-1">
                                                        <Globe className="h-3 w-3 text-indigo-400" />
                                                        {user.ips?.length || user.ipsCount || 1} {((user.ips?.length || user.ipsCount || 1) === 1) ? "IP" : "IPs"}
                                                    </span>
                                                    {user.sharingAssessment?.primaryHomeIp && (
                                                        <span className="px-2 py-0.5 rounded-full bg-blue-950/40 border border-blue-800/40 text-blue-300 font-medium flex items-center gap-1">
                                                            <Home className="h-3 w-3 text-blue-400" />
                                                            Home: {user.sharingAssessment.primaryHomeIp}
                                                        </span>
                                                    )}
                                                    {user.sharingAssessment?.secondaryHomeIp && (
                                                        <span className="px-2 py-0.5 rounded-full bg-purple-950/40 border border-purple-800/40 text-purple-300 font-medium flex items-center gap-1">
                                                            <Compass className="h-3 w-3 text-purple-400" />
                                                            2nd Home: {user.sharingAssessment.secondaryHomeIp}
                                                        </span>
                                                    )}
                                                    <span>Servers: {user.servers.join(", ") || "None"}</span>
                                                    <span>•</span>
                                                    <span>IP: {user.lastIp || "Unknown"}</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4 justify-between md:justify-end shrink-0" onClick={(e) => e.stopPropagation()}>
                                                <div className="text-right space-y-0.5">
                                                    <div className="text-xs font-bold text-cyan-400">
                                                        {user.totalPlays} Plays ({user.totalWatchHours} hrs)
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {user.directPlayCount} Direct Play / {user.transcodeCount} Transcode
                                                    </div>
                                                </div>

                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenUserModal(user.user)}
                                                    className="h-8 px-3 text-xs rounded-lg border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/20 font-semibold gap-1.5 shrink-0"
                                                >
                                                    <History className="h-3.5 w-3.5" />
                                                    <span>Full History & Overlaps</span>
                                                    <ChevronRight className="h-3.5 w-3.5" />
                                                </Button>

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
                                            <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-800/20 transition-colors">
                                                <div className="flex items-center gap-3 min-w-0 pr-2">
                                                    <span className="font-mono font-bold text-slate-500 w-5 text-right shrink-0">{idx + 1}.</span>
                                                    <div className="relative w-9 h-13 sm:w-10 sm:h-14 rounded-md overflow-hidden shrink-0 bg-slate-950 border border-slate-800 flex items-center justify-center shadow-md">
                                                        <Film className="h-4 w-4 text-slate-600 absolute" />
                                                        <img 
                                                            src={m.thumb || `/api/media/image?title=${encodeURIComponent(m.title)}&type=movie`} 
                                                            alt={m.title} 
                                                            className="w-full h-full object-cover relative z-10" 
                                                            onError={(e) => { 
                                                                const img = e.target as HTMLImageElement;
                                                                if (!img.src.includes("&fallback=1")) {
                                                                    img.src = `/api/media/image?title=${encodeURIComponent(m.title)}&type=movie&fallback=1`;
                                                                } else {
                                                                    img.style.display = "none";
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="font-semibold text-white truncate block">{m.title}</span>
                                                        {m.year && <span className="text-[10px] text-muted-foreground font-mono">{m.year}</span>}
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border-cyan-500/30 shrink-0">
                                                    {m.plays} {m.plays === 1 ? "Play" : "Plays"}
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
                                            <div key={idx} className="p-3 flex items-center justify-between text-xs hover:bg-slate-800/20 transition-colors">
                                                <div className="flex items-center gap-3 min-w-0 pr-2">
                                                    <span className="font-mono font-bold text-slate-500 w-5 text-right shrink-0">{idx + 1}.</span>
                                                    <div className="relative w-9 h-13 sm:w-10 sm:h-14 rounded-md overflow-hidden shrink-0 bg-slate-950 border border-slate-800 flex items-center justify-center shadow-md">
                                                        <Tv className="h-4 w-4 text-slate-600 absolute" />
                                                        <img 
                                                            src={s.thumb || `/api/media/image?title=${encodeURIComponent(s.title)}&type=show`} 
                                                            alt={s.title} 
                                                            className="w-full h-full object-cover relative z-10" 
                                                            onError={(e) => { 
                                                                const img = e.target as HTMLImageElement;
                                                                if (!img.src.includes("&fallback=1")) {
                                                                    img.src = `/api/media/image?title=${encodeURIComponent(s.title)}&type=show&fallback=1`;
                                                                } else {
                                                                    img.style.display = "none";
                                                                }
                                                            }}
                                                        />
                                                    </div>
                                                    <div className="min-w-0">
                                                        <span className="font-semibold text-white truncate block">{s.title}</span>
                                                        {s.year && <span className="text-[10px] text-muted-foreground font-mono">{s.year}</span>}
                                                    </div>
                                                </div>
                                                <Badge variant="outline" className="text-[10px] font-mono bg-purple-500/10 text-purple-300 border-purple-500/30 shrink-0">
                                                    {s.plays} {s.plays === 1 ? "Play" : "Plays"}
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
                                    <div className="flex items-center gap-2">
                                        <h4 className="text-xs font-bold text-white">Import Historical Sessions from Tautulli</h4>
                                        <Badge variant="outline" className="text-[10px] bg-indigo-950/40 border-indigo-500/30 text-indigo-300">
                                            Unlimited Supported
                                        </Badge>
                                    </div>
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
                                            disabled={isBackfilling}
                                            className="h-8 px-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-white disabled:opacity-50"
                                        >
                                            <option value={100}>100 records (Quick sample)</option>
                                            <option value={500}>500 records (Standard batch)</option>
                                            <option value={1000}>1,000 records</option>
                                            <option value={5000}>5,000 records (Deep backfill)</option>
                                            <option value={10000}>10,000 records</option>
                                            <option value={25000}>25,000 records</option>
                                            <option value={0}>✨ All Records / Unlimited (Complete History)</option>
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
                                                Running Backfill...
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

                                {backfillLimit === 0 && !isBackfilling && (
                                    <div className="flex items-start gap-2 p-3 rounded-lg bg-indigo-950/30 border border-indigo-500/30 text-[11px] text-indigo-200">
                                        <Sparkles className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                                        <span>
                                            <strong>Complete Unlimited Mode:</strong> Portalarr will paginate through your entire Tautulli history without any record caps until all sessions are imported. Runs asynchronously in the background even if it takes a long time, with live progress tracking and cancellation support below.
                                        </span>
                                    </div>
                                )}

                                {/* Live Progress Cockpit */}
                                {isBackfilling && (
                                    <div className="p-4 rounded-xl bg-slate-900/90 border border-indigo-500/40 space-y-3 shadow-lg">
                                        <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Loader2 className="h-4 w-4 text-indigo-400 animate-spin" />
                                                <span className="text-xs font-semibold text-white">
                                                    {backfillProgress?.isUnlimited ? "Unlimited Complete Backfill in Progress..." : "Backfill in Progress..."}
                                                </span>
                                                {backfillProgress?.instanceName && (
                                                    <Badge variant="outline" className="text-[10px] bg-slate-950/60 border-slate-700 text-cyan-300">
                                                        {backfillProgress.instanceName}
                                                    </Badge>
                                                )}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={handleStopBackfill}
                                                className="h-7 px-3 text-[11px] rounded-lg border-red-500/40 text-red-400 hover:bg-red-950/40 hover:text-red-300"
                                            >
                                                <XCircle className="h-3 w-3 mr-1" />
                                                Cancel Backfill
                                            </Button>
                                        </div>

                                        {/* Animated Progress Bar */}
                                        <div className="space-y-1.5">
                                            <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                                                <div 
                                                    className="bg-gradient-to-r from-indigo-500 via-cyan-400 to-emerald-400 h-2.5 rounded-full transition-all duration-300"
                                                    style={{
                                                        width: `${
                                                            backfillProgress?.totalAvailable && backfillProgress.totalAvailable > 0
                                                                ? Math.min(100, Math.max(5, Math.round((backfillProgress.processedCount / (backfillProgress.isUnlimited ? backfillProgress.totalAvailable : Math.min(backfillProgress.totalAvailable, backfillProgress.limit || backfillProgress.totalAvailable))) * 100)))
                                                                : Math.min(95, Math.max(10, ((backfillProgress?.currentPage || 1) * 8) % 95))
                                                        }%`
                                                    }}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                                                <span>
                                                    {backfillProgress?.statusText || "Fetching and processing sessions from Tautulli..."}
                                                </span>
                                                <span>
                                                    {backfillProgress?.totalAvailable && backfillProgress.totalAvailable > 0
                                                        ? `${(backfillProgress.processedCount || 0).toLocaleString()} / ${backfillProgress.totalAvailable.toLocaleString()} records (${Math.min(100, Math.round(((backfillProgress.processedCount || 0) / backfillProgress.totalAvailable) * 100))}%)`
                                                        : `${(backfillProgress?.processedCount || 0).toLocaleString()} records inspected`}
                                                </span>
                                            </div>
                                        </div>

                                        {/* Live Stat Badges */}
                                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                                            <span className="px-2.5 py-1 rounded-md bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 font-medium">
                                                ✨ {(backfillProgress?.importedCount || 0).toLocaleString()} Imported
                                            </span>
                                            <span className="px-2.5 py-1 rounded-md bg-slate-950/80 border border-slate-800 text-muted-foreground font-medium">
                                                🔁 {(backfillProgress?.skippedCount || 0).toLocaleString()} Skipped Duplicates
                                            </span>
                                            {backfillProgress?.currentPage ? (
                                                <span className="px-2.5 py-1 rounded-md bg-indigo-950/40 border border-indigo-500/30 text-indigo-300 font-mono text-[10px]">
                                                    Page {backfillProgress.currentPage}{backfillProgress.totalPages ? ` of ${backfillProgress.totalPages}` : ""}
                                                </span>
                                            ) : null}
                                        </div>
                                    </div>
                                )}

                                {backfillResult && (
                                    <div className={`p-3.5 rounded-xl text-xs font-medium space-y-1 ${backfillResult.success ? "bg-emerald-950/40 border border-emerald-500/40 text-emerald-300" : "bg-red-950/40 border border-red-500/40 text-red-300"}`}>
                                        <div className="flex items-center gap-1.5 font-bold">
                                            {backfillResult.success ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <AlertTriangle className="h-4 w-4 text-red-400" />}
                                            <span>{backfillResult.message}</span>
                                        </div>
                                        {backfillResult.imported !== undefined && (
                                            <div className="text-[11px] text-muted-foreground font-mono">
                                                Total Imported: {backfillResult.imported.toLocaleString()} | Skipped: {backfillResult.skipped.toLocaleString()} | Available in Tautulli: {(backfillResult.totalAvailable || 0).toLocaleString()}
                                            </div>
                                        )}
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
                    <DialogContent className="w-[95vw] sm:w-[90vw] max-w-md sm:max-w-md bg-[#0c0c14] border-slate-800 text-white rounded-2xl p-6">
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

            {/* --- COMPREHENSIVE USER TELEMETRY & CONNECTION INTELLIGENCE MODAL --- */}
            {selectedUser && (
                <Dialog open={!!selectedUser} onOpenChange={(open) => { if (!open) { setSelectedUser(null); setUserDetails(null); } }}>
                    <DialogContent className="w-[95vw] sm:w-[92vw] md:w-[90vw] max-w-5xl sm:max-w-5xl max-h-[90vh] bg-[#0c0c14] border-slate-800 text-white rounded-2xl p-0 flex flex-col overflow-hidden shadow-2xl">
                        {/* Header */}
                        <div className="p-5 border-b border-slate-800/80 bg-slate-950/70 shrink-0 min-w-0">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 shadow-[0_0_15px_rgba(6,182,212,0.3)]">
                                        <Users className="h-6 w-6" />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <h2 className="text-xl font-black text-white">{selectedUser}</h2>
                                            {userDetails?.sharingAlerts > 0 && (
                                                <Badge className="bg-red-500/20 text-red-300 border-red-500/40 text-[10px]">
                                                    🚨 {userDetails.sharingAlerts} Sharing Alerts
                                                </Badge>
                                            )}
                                            {userDetails?.transcodeRate >= 50 && (
                                                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px]">
                                                    ⚠️ {userDetails.transcodeRate}% Transcode
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            Full connection intelligence, all registered client devices, and complete watch history.
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {userDetails?.transcodeRate >= 50 && (
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => {
                                                const notice = `Hey @${selectedUser}! We noticed that ${userDetails.transcodeRate}% of your recent streams are downscaling. To unlock full 1080p/4K Direct Play without server buffering, open Plex on your device → Settings (⚙️) → Video, and set Remote Streaming Quality to Maximum/Original!`;
                                                handleCopyNotice(notice);
                                            }}
                                            className="h-8 px-2.5 text-xs rounded-lg border-amber-500/40 text-amber-300 hover:bg-amber-500/20 font-semibold"
                                        >
                                            {copiedNotice ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                                            {copiedNotice ? "Notice Copied!" : "Copy Fix Guide"}
                                        </Button>
                                    )}
                                </div>
                            </div>

                            {/* Stat Summary Badges */}
                            <div className="flex flex-wrap items-center gap-2 pt-3">
                                <Badge variant="outline" className="text-xs bg-slate-900 border-slate-800 text-slate-200 py-1 px-2.5">
                                    <Activity className="h-3.5 w-3.5 text-cyan-400 mr-1.5" />
                                    {userDetails?.totalPlays ?? "..."} Total Plays
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-slate-900 border-slate-800 text-slate-200 py-1 px-2.5">
                                    <Clock className="h-3.5 w-3.5 text-purple-400 mr-1.5" />
                                    {userDetails?.totalWatchHours ?? "..."} Watch Hours
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-slate-900 border-slate-800 text-slate-200 py-1 px-2.5">
                                    <Zap className="h-3.5 w-3.5 text-emerald-400 mr-1.5" />
                                    {userDetails ? `${100 - userDetails.transcodeRate}% Direct Play (${userDetails.directPlayCount} Direct / ${userDetails.transcodeCount} Transcode)` : "..."}
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-slate-900 border-slate-800 text-slate-200 py-1 px-2.5">
                                    <Smartphone className="h-3.5 w-3.5 text-blue-400 mr-1.5" />
                                    {userDetails?.devices?.length ?? "..."} Devices Used
                                </Badge>
                                <Badge variant="outline" className="text-xs bg-slate-900 border-slate-800 text-slate-200 py-1 px-2.5">
                                    <Globe className="h-3.5 w-3.5 text-indigo-400 mr-1.5" />
                                    {userDetails?.ips?.length ?? "..."} IP Addresses
                                </Badge>
                                {userDetails?.sharingAssessment && (
                                    <Badge className={`text-xs py-1 px-2.5 font-bold border ${userDetails.sharingAssessment.badgeColor}`}>
                                        <ShieldAlert className="h-3.5 w-3.5 mr-1.5" />
                                        Household: {userDetails.sharingAssessment.label || userDetails.sharingAssessment.badgeLabel}
                                    </Badge>
                                )}
                                {userDetails?.sharingAssessment?.primaryHomeIp && (
                                    <Badge variant="outline" className="text-xs bg-blue-950/30 border-blue-800/50 text-blue-300 py-1 px-2.5 font-mono">
                                        <Home className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
                                        Home IP: {userDetails.sharingAssessment.primaryHomeIp}
                                    </Badge>
                                )}
                            </div>

                            {/* Inner Tab Selectors */}
                            <div className="flex flex-wrap items-center gap-2 pt-4">
                                <button
                                    onClick={() => setUserModalTab("history")}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${userModalTab === "history" ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm" : "bg-slate-900 text-muted-foreground hover:text-white border border-slate-800"}`}
                                >
                                    <History className="h-3.5 w-3.5" />
                                    Full Watch History ({userDetails?.history?.length || 0})
                                </button>
                                <button
                                    onClick={() => setUserModalTab("devices")}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${userModalTab === "devices" ? "bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm" : "bg-slate-900 text-muted-foreground hover:text-white border border-slate-800"}`}
                                >
                                    <Smartphone className="h-3.5 w-3.5" />
                                    All Devices ({userDetails?.devices?.length || 0})
                                </button>
                                <button
                                    onClick={() => setUserModalTab("ips")}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${userModalTab === "ips" ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm" : "bg-slate-900 text-muted-foreground hover:text-white border border-slate-800"}`}
                                >
                                    <Globe className="h-3.5 w-3.5" />
                                    All IP Addresses ({userDetails?.ips?.length || 0})
                                </button>
                                <button
                                    onClick={() => setUserModalTab("sharing")}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${userModalTab === "sharing" ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm" : "bg-slate-900 text-muted-foreground hover:text-white border border-slate-800"}`}
                                >
                                    <ShieldAlert className="h-3.5 w-3.5" />
                                    <span>Sharing & Overlap Intelligence</span>
                                    {(userDetails?.sharingAssessment?.risk === "HIGH_SHARING_RISK" || userDetails?.sharingAssessment?.risk === "SUSPECTED_SHARING") && (
                                        <span className="ml-1 px-1.5 py-0.2 rounded-full bg-red-500 text-white text-[9px] font-black animate-pulse">!</span>
                                    )}
                                    {userDetails?.detectedOverlaps?.length > 0 && (
                                        <Badge className="ml-1 text-[9px] py-0 px-1.5 bg-red-500/30 text-red-200 border-red-500/40">
                                            {userDetails.detectedOverlaps.length}
                                        </Badge>
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Content Body */}
                        <div className="p-5 overflow-y-auto flex-1 space-y-4 min-w-0">
                            {loadingUserDetails ? (
                                <div className="p-16 text-center text-muted-foreground space-y-3">
                                    <Loader2 className="h-8 w-8 animate-spin text-cyan-400 mx-auto" />
                                    <p className="text-xs">Aggregating full history, client devices, and connection telemetry for {selectedUser}...</p>
                                </div>
                            ) : userModalTab === "history" ? (
                                <div className="space-y-3.5">
                                    {/* Search & Filter Controls */}
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                                        <div className="relative flex-1 max-w-sm">
                                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                                            <Input
                                                placeholder="Search user's history..."
                                                value={userHistorySearch}
                                                onChange={(e) => setUserHistorySearch(e.target.value)}
                                                className="h-8 pl-8 text-xs bg-slate-950 border-slate-800 rounded-lg"
                                            />
                                        </div>

                                        <div className="flex items-center rounded-lg border border-slate-800 bg-slate-950 p-0.5 text-xs">
                                            <button
                                                onClick={() => setUserHistoryFilter("all")}
                                                className={`px-2.5 py-1 rounded-md font-medium ${userHistoryFilter === "all" ? "bg-slate-800 text-white font-bold" : "text-muted-foreground"}`}
                                            >
                                                All ({userDetails?.history?.length || 0})
                                            </button>
                                            <button
                                                onClick={() => setUserHistoryFilter("movies")}
                                                className={`px-2.5 py-1 rounded-md font-medium ${userHistoryFilter === "movies" ? "bg-slate-800 text-white font-bold" : "text-muted-foreground"}`}
                                            >
                                                Movies
                                            </button>
                                            <button
                                                onClick={() => setUserHistoryFilter("episodes")}
                                                className={`px-2.5 py-1 rounded-md font-medium ${userHistoryFilter === "episodes" ? "bg-slate-800 text-white font-bold" : "text-muted-foreground"}`}
                                            >
                                                Episodes
                                            </button>
                                            <button
                                                onClick={() => setUserHistoryFilter("alerts")}
                                                className={`px-2.5 py-1 rounded-md font-medium ${userHistoryFilter === "alerts" ? "bg-red-500/20 text-red-300 font-bold" : "text-muted-foreground"}`}
                                            >
                                                🚨 Sharing Alerts
                                            </button>
                                        </div>
                                    </div>

                                    {/* History Records List */}
                                    {userModalHistoryItems.length === 0 ? (
                                        <div className="p-12 text-center text-muted-foreground text-xs">
                                            No watch history records match your search criteria for this user.
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-800/60 rounded-xl border border-slate-800/80 bg-slate-950/40 overflow-hidden">
                                            {userModalHistoryItems.map((item: any) => (
                                                <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-800/30 transition-all text-xs">
                                                    <div className="flex items-center gap-3 min-w-0">
                                                        <div className="relative w-10 h-14 rounded-md overflow-hidden shrink-0 bg-slate-950 border border-slate-800 flex items-center justify-center shadow-sm">
                                                            <div className="absolute inset-0 flex items-center justify-center text-slate-600">
                                                                {item.mediaType === "episode" ? <Tv className="h-4 w-4" /> : <Film className="h-4 w-4" />}
                                                            </div>
                                                            {item.thumb && (
                                                                <img
                                                                    src={item.thumb}
                                                                    alt={item.title}
                                                                    className="w-full h-full object-cover relative z-10"
                                                                    onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                                                                />
                                                            )}
                                                        </div>

                                                        <div className="min-w-0 space-y-1">
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-white truncate">
                                                                    {item.grandparentTitle ? `${item.grandparentTitle} - ${item.title}` : item.title}
                                                                </span>
                                                                <Badge variant="outline" className="text-[9px] py-0 font-mono bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                                                                    {item.serverName}
                                                                </Badge>
                                                                {item.seasonNum && item.episodeNum && (
                                                                    <Badge className="text-[9px] py-0 font-mono bg-purple-500/20 text-purple-300 border-purple-500/30">
                                                                        S{String(item.seasonNum).padStart(2, "0")}E{String(item.episodeNum).padStart(2, "0")}
                                                                    </Badge>
                                                                )}
                                                                {item.isSharingAlert && (
                                                                    <Badge className="text-[9px] py-0 bg-red-500/20 text-red-300 border-red-500/40">
                                                                        🚨 Sharing Alert
                                                                    </Badge>
                                                                )}
                                                            </div>

                                                            <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                                                                <span className="flex items-center gap-1">
                                                                    {getDeviceIcon(item.platform, item.device, item.player)}
                                                                    {item.player || item.device || "Client"}
                                                                </span>
                                                                <span>•</span>
                                                                <span className="font-mono text-slate-300">{item.ipAddress || "Unknown IP"}</span>
                                                                {item.location && <span>({item.location})</span>}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center gap-3 shrink-0 text-right">
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
                                </div>
                            ) : userModalTab === "devices" ? (
                                <div className="space-y-3.5">
                                    <div className="text-xs text-muted-foreground">
                                        All hardware devices and client apps used by <strong className="text-white">{selectedUser}</strong> across all servers:
                                    </div>

                                    {(!userDetails?.devices || userDetails.devices.length === 0) ? (
                                        <div className="p-12 text-center text-muted-foreground text-xs">
                                            No device telemetry recorded for this user yet.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                            {userDetails.devices.map((dev: any, idx: number) => (
                                                <Card key={idx} className="bg-slate-950/70 border-slate-800 p-4 space-y-3 shadow-md">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                                                                {getDeviceIcon(dev.platform, dev.device, dev.player)}
                                                            </div>
                                                            <div>
                                                                <h4 className="font-bold text-sm text-white">{dev.name}</h4>
                                                                <p className="text-[10px] text-muted-foreground">
                                                                    {dev.player} • {dev.platform}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <Badge variant="outline" className="text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                                                            {dev.playCount} {dev.playCount === 1 ? "Play" : "Plays"}
                                                        </Badge>
                                                    </div>

                                                    <div className="space-y-1.5 pt-1">
                                                        <div className="flex justify-between text-[10px] font-medium text-muted-foreground">
                                                            <span>Quality: {dev.directPlayRate}% Direct Play</span>
                                                            <span>{dev.directPlayCount} Direct / {dev.transcodeCount} Transcode</span>
                                                        </div>
                                                        <Progress value={dev.directPlayRate} className="h-1.5 bg-slate-800" />
                                                    </div>

                                                    <div className="pt-1 text-[10px] text-muted-foreground space-y-1 border-t border-slate-850">
                                                        <div>Servers: <span className="text-slate-300 font-medium">{dev.servers?.join(", ") || "Plex"}</span></div>
                                                        <div className="flex items-center justify-between">
                                                            <span>First seen: {new Date(dev.firstSeen).toLocaleDateString()}</span>
                                                            <span>Last active: {new Date(dev.lastSeen).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : userModalTab === "ips" ? (
                                <div className="space-y-3.5">
                                    <div className="text-xs text-muted-foreground">
                                        All network IP addresses used by <strong className="text-white">{selectedUser}</strong> to access your media servers:
                                    </div>

                                    {(!userDetails?.ips || userDetails.ips.length === 0) ? (
                                        <div className="p-12 text-center text-muted-foreground text-xs">
                                            No IP address logs recorded for this user yet.
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                            {userDetails.ips.map((ip: any, idx: number) => (
                                                <Card key={idx} className={`p-4 space-y-3 shadow-md border ${ip.sharingAlertCount > 0 ? "bg-red-950/20 border-red-500/40" : "bg-slate-950/70 border-slate-800"}`}>
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className={`p-2 rounded-lg border ${ip.isLan ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-indigo-500/10 border-indigo-500/30 text-indigo-400"}`}>
                                                                <Globe className="h-4 w-4" />
                                                            </div>
                                                            <div>
                                                                <h4 className="font-mono font-bold text-sm text-white">{ip.ip}</h4>
                                                                <div className="flex items-center gap-1.5 mt-0.5">
                                                                    <Badge className={`text-[9px] py-0 ${ip.isLan ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40" : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"}`}>
                                                                        {ip.isLan ? "LAN / Home Network" : `Public WAN (${ip.location || "Remote"})`}
                                                                    </Badge>
                                                                    {ip.sharingAlertCount > 0 && (
                                                                        <Badge className="text-[9px] py-0 bg-red-500/20 text-red-300 border-red-500/40">
                                                                            🚨 {ip.sharingAlertCount} Sharing Alerts
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <Badge variant="outline" className="text-[10px] font-mono bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                                                            {ip.playCount} {ip.playCount === 1 ? "Play" : "Plays"}
                                                        </Badge>
                                                    </div>

                                                    <div className="space-y-1 text-[10px] text-muted-foreground pt-1 border-t border-slate-850">
                                                        <div>Devices on this IP: <span className="text-slate-300 font-medium">{ip.devices?.join(", ") || "Client"}</span></div>
                                                        <div className="flex items-center justify-between pt-0.5">
                                                            <span>First seen: {new Date(ip.firstSeen).toLocaleDateString()}</span>
                                                            <span>Last active: {new Date(ip.lastSeen).toLocaleDateString()}</span>
                                                        </div>
                                                    </div>
                                                </Card>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : userModalTab === "sharing" ? (
                                <div className="space-y-4">
                                    {/* Verdict Banner */}
                                    <Card className={`p-4 border ${userDetails?.sharingAssessment?.badgeColor || "bg-slate-900 border-slate-800"}`}>
                                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <ShieldAlert className="h-5 w-5" />
                                                    <h3 className="font-bold text-base text-white">
                                                        {userDetails?.sharingAssessment?.label || userDetails?.sharingAssessment?.verdict || "Single Household Activity"}
                                                    </h3>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    Deterministic household anchoring analysis examining fixed living room TVs (Apple TV, Roku, Smart TVs) vs mobile devices (phones, laptops) and simultaneous multi-IP streams.
                                                </p>
                                            </div>
                                            <Badge className={`text-xs py-1 px-3 font-bold border shrink-0 ${userDetails?.sharingAssessment?.badgeColor}`}>
                                                {userDetails?.sharingAssessment?.label || userDetails?.sharingAssessment?.badgeLabel || "Normal"}
                                            </Badge>
                                        </div>

                                        {userDetails?.sharingAssessment?.explanation && (
                                            <div className="mt-3.5 pt-3 border-t border-slate-800/80 space-y-1.5 text-xs">
                                                {(Array.isArray(userDetails.sharingAssessment.explanation)
                                                    ? userDetails.sharingAssessment.explanation
                                                    : [userDetails.sharingAssessment.explanation]
                                                ).map((item: string, i: number) => (
                                                    <div key={i} className="flex items-start gap-2 text-slate-300">
                                                        <span className="text-cyan-400 font-bold">•</span>
                                                        <span>{item}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </Card>

                                    {/* Intelligence Metric Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                        <Card className="bg-slate-950/70 border-slate-800 p-3.5 space-y-1.5 shadow-md">
                                            <div className="flex items-center justify-between text-muted-foreground text-xs">
                                                <span className="flex items-center gap-1.5 font-medium">
                                                    <Home className="h-4 w-4 text-blue-400" />
                                                    Primary Home IP
                                                </span>
                                            </div>
                                            <div className="font-mono font-bold text-sm text-white truncate">
                                                {userDetails?.sharingAssessment?.primaryHomeIp || "LAN / Local"}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground">
                                                Primary residential IP where fixed TV playback is anchored.
                                            </p>
                                        </Card>

                                        <Card className="bg-slate-950/70 border-slate-800 p-3.5 space-y-1.5 shadow-md">
                                            <div className="flex items-center justify-between text-muted-foreground text-xs">
                                                <span className="flex items-center gap-1.5 font-medium">
                                                    <Compass className="h-4 w-4 text-purple-400" />
                                                    Secondary Location
                                                </span>
                                            </div>
                                            <div className="font-mono font-bold text-sm text-white truncate">
                                                {userDetails?.sharingAssessment?.secondaryHomeIp || "None Detected"}
                                            </div>
                                            <p className="text-[10px] text-muted-foreground">
                                                {userDetails?.sharingAssessment?.travelSpanDays 
                                                    ? `Active across ${userDetails.sharingAssessment.travelSpanDays} days (Vacation pattern)` 
                                                    : "No secondary recurring residence detected."}
                                            </p>
                                        </Card>

                                        <Card className="bg-slate-950/70 border-slate-800 p-3.5 space-y-1.5 shadow-md">
                                            <div className="flex items-center justify-between text-muted-foreground text-xs">
                                                <span className="flex items-center gap-1.5 font-medium">
                                                    <Tv className="h-4 w-4 text-cyan-400" />
                                                    Device Typology
                                                </span>
                                            </div>
                                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                                <span className="text-cyan-300">{userDetails?.sharingAssessment?.fixedHomeDeviceCount || 0} Fixed TVs</span>
                                                <span className="text-slate-600">/</span>
                                                <span className="text-indigo-300">{userDetails?.sharingAssessment?.mobileDeviceCount || 0} Mobile</span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground">
                                                Fixed living room TVs stay anchored; mobile phones roam safely.
                                            </p>
                                        </Card>

                                        <Card className="bg-slate-950/70 border-slate-800 p-3.5 space-y-1.5 shadow-md">
                                            <div className="flex items-center justify-between text-muted-foreground text-xs">
                                                <span className="flex items-center gap-1.5 font-medium">
                                                    <ShieldAlert className="h-4 w-4 text-red-400" />
                                                    Simultaneous Overlaps
                                                </span>
                                            </div>
                                            <div className="text-sm font-bold text-white flex items-center gap-2">
                                                <span className={(userDetails?.sharingAssessment?.fixedTvOverlapCount || 0) > 0 ? "text-red-400 font-black animate-pulse" : "text-slate-300"}>
                                                    {userDetails?.sharingAssessment?.fixedTvOverlapCount || 0} Dual TVs
                                                </span>
                                                <span className="text-slate-600">/</span>
                                                <span className="text-slate-400">
                                                    {userDetails?.sharingAssessment?.concurrentOverlapCount || 0} Total
                                                </span>
                                            </div>
                                            <p className="text-[10px] text-muted-foreground">
                                                Simultaneous multi-IP streams during the same playback window.
                                            </p>
                                        </Card>
                                    </div>

                                    {/* Timeline of Detected Concurrent Overlaps */}
                                    <div className="space-y-3 pt-2">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                                <Clock className="h-3.5 w-3.5 text-cyan-400" />
                                                Detected Concurrent Overlap Incidents ({userDetails?.detectedOverlaps?.length || 0})
                                            </h4>
                                            <span className="text-[10px] text-muted-foreground">
                                                Private LAN streams are safely excluded from overlap detection
                                            </span>
                                        </div>

                                        {(!userDetails?.detectedOverlaps || userDetails.detectedOverlaps.length === 0) ? (
                                            <div className="p-8 rounded-xl bg-slate-950/60 border border-slate-800/80 text-center space-y-2">
                                                <ShieldCheck className="h-8 w-8 text-emerald-400 mx-auto" />
                                                <h5 className="font-bold text-white text-xs">Zero Concurrent Cross-IP Overlaps Detected</h5>
                                                <p className="text-[11px] text-muted-foreground max-w-md mx-auto">
                                                    This account has never had simultaneous streams playing from different public IP addresses. All activity is consistent with a single household.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                {userDetails.detectedOverlaps.map((overlap: any, idx: number) => (
                                                    <Card key={idx} className={`p-4 space-y-3 border ${overlap.isDualTv ? "bg-red-950/20 border-red-500/50 ring-1 ring-red-500/30" : "bg-slate-950/70 border-slate-800"}`}>
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800/60 text-xs">
                                                            <div className="flex items-center gap-2">
                                                                <Badge className={`text-[10px] ${overlap.isDualTv ? "bg-red-500/30 text-red-200 border-red-500/50 font-bold" : "bg-amber-500/20 text-amber-300 border-amber-500/40"}`}>
                                                                    {overlap.isDualTv ? "🚨 HIGH CONFIDENCE: DUAL FIXED TV OVERLAP" : "⚠️ Simultaneous Multi-IP Stream"}
                                                                </Badge>
                                                                <span className="text-[11px] text-muted-foreground font-mono">
                                                                    {new Date(overlap.timestamp).toLocaleString()}
                                                                </span>
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 italic">
                                                                {overlap.reason}
                                                            </span>
                                                        </div>

                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                            {/* Stream 1 */}
                                                            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-1.5 font-bold text-white truncate">
                                                                        {getDeviceIcon(overlap.session1.platform, overlap.session1.device)}
                                                                        <span>{overlap.session1.device || overlap.session1.platform || "Device 1"}</span>
                                                                    </div>
                                                                    {overlap.session1.isFixedTv && (
                                                                        <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/30 text-[9px]">
                                                                            Living Room TV
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <div className="text-slate-300 truncate font-semibold">
                                                                    "{overlap.session1.title}"
                                                                </div>
                                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1 border-t border-slate-800">
                                                                    <span>IP: {overlap.session1.ipAddress || overlap.session1.ip}</span>
                                                                    <span>{overlap.session1.platform}</span>
                                                                </div>
                                                            </div>

                                                            {/* Stream 2 */}
                                                            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-1.5 font-bold text-white truncate">
                                                                        {getDeviceIcon(overlap.session2.platform, overlap.session2.device)}
                                                                        <span>{overlap.session2.device || overlap.session2.platform || "Device 2"}</span>
                                                                    </div>
                                                                    {overlap.session2.isFixedTv && (
                                                                        <Badge className="bg-red-500/20 text-red-300 border-red-500/30 text-[9px]">
                                                                            Living Room TV
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                <div className="text-slate-300 truncate font-semibold">
                                                                    "{overlap.session2.title}"
                                                                </div>
                                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono pt-1 border-t border-slate-800">
                                                                    <span>IP: {overlap.session2.ipAddress || overlap.session2.ip}</span>
                                                                    <span>{overlap.session2.platform}</span>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </Card>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-3 px-5 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-end shrink-0">
                            <Button
                                size="sm"
                                onClick={() => { setSelectedUser(null); setUserDetails(null); }}
                                className="h-8 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs text-white"
                            >
                                Close
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            )}
        </div>
    );
}
