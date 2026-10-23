"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getAdminDetailedStreamsAction, killUserStream, getWatchHistoryAction, clearWatchHistoryAction } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
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
    ArrowUpDown, Volume2
} from "lucide-react";

export default function AdminDetailedStreams() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [killingSessionKey, setKillingSessionKey] = useState<string | null>(null);
    const [selectedServerFilter, setSelectedServerFilter] = useState<string | null>(null);

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

    // Watch History modal & filter state
    const [showHistory, setShowHistory] = useState(false);
    const [historyData, setHistoryData] = useState<any>(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [historyFilter, setHistoryFilter] = useState<string>("all");
    const [historySearch, setHistorySearch] = useState<string>("");

    const loadStreams = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await getAdminDetailedStreamsAction();
            if (res && res.success) {
                setData(res);
            }
        } catch (err) {
            console.error("Failed to load admin streams:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadStreams();
        const timer = setInterval(() => loadStreams(), 8000);
        return () => clearInterval(timer);
    }, []);

    const handleKill = async (instanceId: string, sessionKey: string) => {
        if (!confirm("Terminate this user's active stream immediately?")) return;
        setKillingSessionKey(sessionKey);
        try {
            const res = await killUserStream(instanceId, sessionKey);
            if (res.success) {
                await loadStreams(true);
            } else {
                alert(`Error stopping stream: ${res.error || "Unknown error"}`);
            }
        } catch (e: any) {
            alert(`Error: ${e.message || "Failed to stop stream"}`);
        } finally {
            setKillingSessionKey(null);
        }
    };

    const loadHistory = async (filter = historyFilter, search = historySearch) => {
        setHistoryLoading(true);
        try {
            const options: any = { limit: 50 };
            if (filter === "movies") options.mediaType = "movie";
            if (filter === "episodes") options.mediaType = "episode";
            if (filter === "sharing") options.isSharingAlert = true;
            if (search.trim()) options.search = search.trim();

            const res = await getWatchHistoryAction(options);
            if (res) {
                setHistoryData(res);
            }
        } catch (err) {
            console.error("Failed to load watch history:", err);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleClearHistory = async () => {
        if (!confirm("Are you sure you want to clear the entire watch history log?")) return;
        try {
            const res = await clearWatchHistoryAction();
            if (res.success) {
                await loadHistory();
            }
        } catch (e) {
            console.error("Error clearing watch history:", e);
        }
    };

    const sessions = data?.sessions || [];
    const totalStreams = data?.totalStreams || sessions.length;
    const glances = data?.glances || [];
    const serversUsage = data?.serversUsage || [];

    const transcodeCount = sessions.filter((s: any) => s.videoDecision === "transcode").length;
    const directPlayCount = sessions.length - transcodeCount;
    const hwCount = sessions.filter((s: any) => s.videoDecision === "transcode" && (s.transcodeHwRequested || s.transcodeHwEncoding || s.transcodeHwDecoding)).length;
    const totalBandwidthKbps = sessions.reduce((acc: number, s: any) => acc + (s.streamBitrate || 0), 0);
    const totalBandwidthMbps = (totalBandwidthKbps / 1000).toFixed(1);

    // Filter sessions by selected server if active
    const filteredSessions = selectedServerFilter 
        ? sessions.filter((s: any) => {
            const sName = (s.serverName || "").toLowerCase().trim();
            const fName = selectedServerFilter.toLowerCase().trim();
            return sName === fName || sName.includes(fName) || fName.includes(sName);
        })
        : sessions;

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

            // Stable multi-tier deterministic tiebreaker chain
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

    if (loading && !data) {
        return (
            <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
                <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                    <p className="text-xs font-medium">Loading administrative stream telemetry...</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-primary/30 bg-[#121218]/90 backdrop-blur-md shadow-md overflow-hidden">
            <CardHeader className="p-4 sm:p-5 border-b border-border/40 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                            <CardTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                                <Activity className="h-5 w-5 text-emerald-400" />
                                Admin Stream Matrix & Telemetry
                            </CardTitle>
                            <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                {totalStreams} Live {totalStreams === 1 ? "Session" : "Sessions"}
                            </Badge>
                        </div>
                        <CardDescription className="text-xs">
                            Real-time session monitoring across your {serversUsage.length} monitored Plex {serversUsage.length === 1 ? "server" : "servers"} & {glances.filter((g: any) => g.monitored !== false).length || glances.length} hardware host machines.
                        </CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 w-full sm:w-auto">
                        <Button
                            asChild
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs gap-1.5 border-emerald-500/40 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 font-semibold"
                        >
                            <Link href="/admin/tautulli">
                                <Activity className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Stream Intelligence Hub</span>
                                <span className="sm:hidden">Intelligence</span>
                            </Link>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                setShowHistory(true);
                                loadHistory();
                            }}
                            className="h-8 px-2.5 text-xs gap-1.5 border-border/60 hover:bg-white/[0.04]"
                        >
                            <History className="h-3.5 w-3.5 text-primary" />
                            <span className="hidden sm:inline">Watch History & Audit</span>
                            <span className="sm:hidden">History</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadStreams(true)}
                            disabled={refreshing}
                            className="h-8 px-2.5 text-xs gap-1.5 border-border/60 hover:bg-white/[0.04]"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
                            <span>Refresh</span>
                        </Button>
                    </div>
                </div>

                {/* 1. TOP CLUSTER TELEMETRY STATS GRID (4 STATS) */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Streams</span>
                        <div className="text-lg font-black text-foreground flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            {totalStreams}
                            <span className="text-[11px] font-normal text-muted-foreground ml-1">cluster</span>
                        </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                            <span className="hidden sm:inline">Direct Play / Transcode</span>
                            <span className="sm:hidden">DP / Transcode</span>
                        </span>
                        <div className="text-lg font-black text-foreground">
                            <span className="text-emerald-400">{directPlayCount}</span> / <span className="text-amber-400">{transcodeCount}</span>
                        </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">HW Acceleration</span>
                        <div className="text-lg font-black text-cyan-400 flex items-center gap-1">
                            <Zap className="h-4 w-4" /> {hwCount}
                        </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Stream Bandwidth</span>
                        <div className="text-lg font-black text-foreground">
                            {totalBandwidthMbps} <span className="text-xs font-normal text-muted-foreground">Mbps</span>
                        </div>
                    </div>
                </div>

                {/* 1B. CREDENTIAL SHARING & SECURITY INTELLIGENCE ALERT STRIP */}
                {data?.securityTelemetry && (data.securityTelemetry.sharingAlertsCount > 0 || data.securityTelemetry.multiIpUsersCount > 0) && (
                    <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                            <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0 animate-bounce" />
                            <div className="text-xs">
                                <span className="font-bold text-rose-300">Credential Sharing Alert: </span>
                                <span className="text-rose-200/90">
                                    {data.securityTelemetry.sharingAlertsCount} active user(s) detected streaming concurrently from multiple distinct public IP locations.
                                </span>
                            </div>
                        </div>
                        <Badge variant="outline" className="text-[10px] font-bold bg-rose-500/20 text-rose-300 border-rose-500/40 shrink-0">
                            {data.securityTelemetry.multiIpUsersCount} Multi-IP Account(s) Flagged
                        </Badge>
                    </div>
                )}

                {/* 2. DUAL TELEMETRY COMMAND CENTER (HARDWARE HOSTS VS PLEX SERVERS) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 pt-1">
                    {/* LEFT: GLANCES PHYSICAL HOST TELEMETRY */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                            <div className="flex items-center gap-2">
                                <Cpu className="h-4 w-4 text-emerald-400" />
                                <span className="text-xs font-bold text-foreground tracking-wide uppercase">
                                    Host Hardware Telemetry (Glances)
                                </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                {glances.length} Physical {glances.length === 1 ? "Host" : "Hosts"}
                            </Badge>
                        </div>

                        {glances.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-4 text-center">
                                No Glances hardware servers configured. Add hosts in Settings &gt; Monitoring.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {glances.map((g: any, i: number) => {
                                    const cpuColor = g.cpu > 80 ? "bg-rose-500" : g.cpu > 60 ? "bg-amber-400" : "bg-emerald-400";
                                    const ramColor = g.ram > 85 ? "bg-rose-500" : g.ram > 70 ? "bg-amber-400" : "bg-emerald-400";

                                    return (
                                        <div 
                                            key={i} 
                                            className="p-2.5 rounded-xl bg-black/40 border border-white/[0.06] space-y-2"
                                        >
                                            <div className="flex items-center justify-between text-xs">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <div className="p-1 rounded-md bg-emerald-500/10 text-emerald-400">
                                                        <HardDrive className="h-3.5 w-3.5" />
                                                    </div>
                                                    <span className="font-semibold text-foreground truncate max-w-[150px] sm:max-w-[200px]" title={g.name}>
                                                        {g.name}
                                                    </span>
                                                </div>

                                                {g.online ? (
                                                    <span className="font-mono text-[10px] text-emerald-400 font-bold flex items-center gap-1.5 bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/30">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                                        ONLINE
                                                    </span>
                                                ) : g.monitored === false ? (
                                                    <span className="font-mono text-[10px] text-slate-400 font-medium flex items-center gap-1.5 bg-slate-500/10 px-2 py-0.5 rounded-md border border-slate-500/30">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
                                                        PAUSED
                                                    </span>
                                                ) : (
                                                    <span className="font-mono text-[10px] text-rose-400 font-bold flex items-center gap-1.5 bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/30">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                                        OFFLINE
                                                    </span>
                                                )}
                                            </div>

                                            {g.online ? (
                                                <div className="grid grid-cols-2 gap-2 text-[11px] pt-0.5">
                                                    {/* CPU Gauge */}
                                                    <div className="space-y-1 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04]">
                                                        <div className="flex justify-between items-center text-muted-foreground font-mono">
                                                            <span className="text-[10px] uppercase font-bold tracking-wider">CPU</span>
                                                            <span className="font-bold text-foreground">{g.cpu}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full ${cpuColor} transition-all duration-500 rounded-full`}
                                                                style={{ width: `${Math.min(100, Math.max(3, g.cpu))}%` }}
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* RAM Gauge */}
                                                    <div className="space-y-1 bg-white/[0.02] p-2 rounded-lg border border-white/[0.04]">
                                                        <div className="flex justify-between items-center text-muted-foreground font-mono">
                                                            <span className="text-[10px] uppercase font-bold tracking-wider">RAM</span>
                                                            <span className="font-bold text-foreground">{g.ram}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-white/[0.08] rounded-full overflow-hidden">
                                                            <div 
                                                                className={`h-full ${ramColor} transition-all duration-500 rounded-full`}
                                                                style={{ width: `${Math.min(100, Math.max(3, g.ram))}%` }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="text-[11px] text-muted-foreground italic px-1">
                                                    {g.monitored === false 
                                                        ? "Monitoring paused in Settings" 
                                                        : "Host unreachable (verify Glances is active on port 61208)"}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* RIGHT: STREAMS PER PLEX SERVER (RANKED BY USAGE) */}
                    <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.08] space-y-3">
                        <div className="flex items-center justify-between gap-2 border-b border-white/[0.06] pb-2">
                            <div className="flex items-center gap-2">
                                <Layers className="h-4 w-4 text-sky-400" />
                                <span className="text-xs font-bold text-foreground tracking-wide uppercase">
                                    Streams Per Media Server
                                </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-semibold bg-sky-500/10 text-sky-400 border-sky-500/30">
                                {serversUsage.length} Monitored {serversUsage.length === 1 ? "Server" : "Servers"} • Ranked
                            </Badge>
                        </div>

                        {serversUsage.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-4 text-center">
                                No monitored media servers active. Turn on monitoring in Settings &gt; Media Servers or Monitoring.
                            </div>
                        ) : (
                            <div className="space-y-2.5">
                                {serversUsage.map((srv: any, idx: number) => {
                                    const isTopActive = idx === 0 && srv.streamCount > 0;
                                    const isFiltered = selectedServerFilter === srv.name;

                                    return (
                                        <div 
                                            key={srv.id || idx}
                                            onClick={() => {
                                                if (srv.streamCount > 0) {
                                                    setSelectedServerFilter(isFiltered ? null : srv.name);
                                                }
                                            }}
                                            className={`p-2.5 rounded-xl border transition-all space-y-1.5 cursor-pointer ${
                                                isFiltered
                                                    ? "bg-primary/10 border-primary shadow-sm"
                                                    : "bg-black/40 border-white/[0.06] hover:border-white/20"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between text-xs gap-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    {isTopActive ? (
                                                        <Badge className="text-[9px] font-extrabold uppercase px-1.5 py-0 bg-amber-500/20 text-amber-300 border-amber-500/40 gap-1 shrink-0">
                                                            <Flame className="h-3 w-3 text-amber-400 fill-amber-400" /> #1 HIGHEST LOAD
                                                        </Badge>
                                                    ) : srv.streamCount > 0 ? (
                                                        <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 bg-sky-500/10 text-sky-400 border-sky-500/30 shrink-0">
                                                            #{idx + 1}
                                                        </Badge>
                                                    ) : (
                                                        <Badge variant="outline" className="text-[9px] font-medium px-1.5 py-0 text-muted-foreground border-white/[0.08] shrink-0">
                                                            IDLE
                                                        </Badge>
                                                    )}

                                                    <span className="font-semibold text-foreground truncate max-w-[140px] sm:max-w-[180px]" title={srv.name}>
                                                        {srv.name}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    <span className="text-[11px] font-black text-foreground">
                                                        {srv.streamCount} {srv.streamCount === 1 ? "stream" : "streams"}
                                                    </span>
                                                    {isFiltered && (
                                                        <span className="text-[9px] font-semibold text-primary bg-primary/20 px-1 rounded">
                                                            FILTERED
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Subtitle Telemetry & Mini Load Bar */}
                                            <div className="space-y-1 pt-0.5">
                                                <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                                                    <span>
                                                        <strong className="text-emerald-400 font-bold">{srv.directPlayCount} DP</strong> / <strong className="text-amber-400 font-bold">{srv.transcodeCount} Transcode</strong>
                                                    </span>
                                                    <span className="text-foreground/90 font-bold">
                                                        {srv.bandwidthMbps} Mbps {totalStreams > 0 ? `(${srv.percentOfTotal}%)` : ""}
                                                    </span>
                                                </div>

                                                {totalStreams > 0 && (
                                                    <div className="h-1 w-full bg-white/[0.08] rounded-full overflow-hidden">
                                                        <div 
                                                            className={`h-full transition-all duration-500 rounded-full ${
                                                                isTopActive ? "bg-amber-400" : "bg-sky-400"
                                                            }`}
                                                            style={{ width: `${Math.min(100, Math.max(3, srv.percentOfTotal))}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-3">
                {/* ACTIVE STREAMS SECTION HEADER, SERVER FILTER PILLS & SORT SELECTOR */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                    <div className="flex items-center gap-2">
                        <Tv className="h-4 w-4 text-primary" />
                        <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
                            Active Playback Sessions
                        </h3>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {sortedFilteredSessions.length} {sortedFilteredSessions.length === 1 ? "stream" : "streams"}
                        </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5">
                        {serversUsage.length > 1 && totalStreams > 0 && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-[10px] text-muted-foreground uppercase font-semibold mr-1">Filter:</span>
                                <Button
                                    size="sm"
                                    variant={selectedServerFilter === null ? "default" : "outline"}
                                    className={`h-6 text-[10px] px-2 rounded-full ${selectedServerFilter === null ? "bg-primary text-primary-foreground font-bold" : "border-white/10 hover:bg-white/[0.05]"}`}
                                    onClick={() => setSelectedServerFilter(null)}
                                >
                                    All ({sessions.length})
                                </Button>
                                {serversUsage.map((srv: any) => (
                                    <Button
                                        key={srv.name}
                                        size="sm"
                                        variant={selectedServerFilter === srv.name ? "default" : "outline"}
                                        disabled={srv.streamCount === 0}
                                        className={`h-6 text-[10px] px-2 rounded-full ${
                                            selectedServerFilter === srv.name 
                                                ? "bg-primary text-primary-foreground font-bold" 
                                                : srv.streamCount === 0 
                                                    ? "opacity-40 border-white/[0.04]" 
                                                    : "border-white/10 hover:bg-white/[0.05]"
                                        }`}
                                        onClick={() => setSelectedServerFilter(selectedServerFilter === srv.name ? null : srv.name)}
                                    >
                                        {srv.name} ({srv.streamCount})
                                    </Button>
                                ))}
                            </div>
                        )}

                        {/* Persistent Stream Sorting Selector */}
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-muted-foreground uppercase font-semibold flex items-center gap-1">
                                <ArrowUpDown className="h-3 w-3 text-emerald-400" /> Sort:
                            </span>
                            <select
                                value={streamSort}
                                onChange={(e) => handleSortChange(e.target.value)}
                                className="h-6 px-2 text-[10px] rounded-lg bg-[#14141c] border border-white/10 text-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer"
                                title="Sort active streams"
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
                </div>

                {sortedFilteredSessions.length === 0 ? (
                    <div className="py-8 text-center space-y-2 text-muted-foreground">
                        <Tv className="h-8 w-8 mx-auto opacity-40 text-primary" />
                        {selectedServerFilter ? (
                            <>
                                <p className="text-sm font-semibold text-foreground">No active streams playing on "{selectedServerFilter}"</p>
                                <p className="text-xs">Select "All" or click another server to view active playback.</p>
                                <Button 
                                    size="sm" 
                                    variant="outline" 
                                    onClick={() => setSelectedServerFilter(null)}
                                    className="text-xs mt-2"
                                >
                                    Clear Filter
                                </Button>
                            </>
                        ) : (
                            <>
                                <p className="text-sm font-semibold text-foreground">No active streams playing right now</p>
                                <p className="text-xs">All media servers are idle and standing by for playback.</p>
                            </>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sortedFilteredSessions.map((stream: any, idx: number) => {
                            const isTranscoding = stream.videoDecision === "transcode";
                            const isAudioTranscoding = stream.audioDecision === "transcode";
                            const isHw = isTranscoding && (stream.transcodeHwRequested || stream.transcodeHwEncoding || stream.transcodeHwDecoding);

                            // Season & Episode tag detection (from field or fallback title regex)
                            const titleMatch = stream.title ? stream.title.match(/S(\d+)\s*E(\d+)/i) : null;
                            const seasonEpBadge = stream.seasonEpisodeTag || (titleMatch ? titleMatch[0].toUpperCase() : null);

                            return (
                                <div 
                                    key={stream.uniqueStreamKey || `${stream.serverName}_${stream.sessionKey}_${stream.user}_${idx}`}
                                    className="p-3.5 rounded-xl bg-[#14141c]/90 border border-white/[0.08] hover:border-primary/40 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                                >
                                    {/* Left: Poster + User & Media Info */}
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className="relative w-12 h-16 sm:w-14 sm:h-20 rounded-lg overflow-hidden shrink-0 bg-muted/30 border border-white/10 flex items-center justify-center">
                                            <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
                                                {stream.mediaType === "episode" ? <Tv className="h-5 w-5 text-muted-foreground/30" /> : <Film className="h-5 w-5 text-muted-foreground/30" />}
                                            </div>
                                            {stream.thumb && (
                                                <img 
                                                    src={stream.thumb} 
                                                    alt={stream.title} 
                                                    className="w-full h-full object-cover relative z-10"
                                                    onError={(e) => { (e.target as HTMLElement).style.display = "none"; }}
                                                />
                                            )}
                                            <div className="absolute bottom-1 right-1 p-0.5 rounded-full bg-black/80 z-20">
                                                {stream.state === "playing" ? (
                                                    <Play className="h-2.5 w-2.5 text-emerald-400 fill-emerald-400" />
                                                ) : (
                                                    <Pause className="h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                                                )}
                                            </div>
                                        </div>

                                        <div className="space-y-1 min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <Badge className="text-[10px] font-bold bg-primary/20 text-primary border-primary/30 flex items-center gap-1">
                                                    {stream.userThumb ? (
                                                        <img src={stream.userThumb} alt="" className="w-3.5 h-3.5 rounded-full object-cover shrink-0" onError={(e) => { (e.target as HTMLElement).style.display = "none"; }} />
                                                    ) : (
                                                        <span>👤</span>
                                                    )}
                                                    {stream.user}
                                                </Badge>
                                                {stream.householdBadge && (
                                                    <Badge 
                                                        variant="outline" 
                                                        className={`text-[9px] font-bold px-1.5 py-0 border ${stream.householdBadge.color} ${stream.isSharingAlert ? "animate-pulse" : ""}`}
                                                        title={stream.householdBadge.desc}
                                                    >
                                                        {stream.householdBadge.label}
                                                    </Badge>
                                                )}
                                                <Badge variant="outline" className={`text-[10px] max-w-[140px] sm:max-w-none truncate ${
                                                        stream.serverType === "JELLYFIN" ? "bg-purple-500/10 text-purple-400 border-purple-500/30" :
                                                        stream.serverType === "EMBY" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" :
                                                        "text-muted-foreground"
                                                    }`}>
                                                    🖥️ {stream.serverName}
                                                </Badge>
                                                <span className="text-[10px] font-mono text-muted-foreground/80 max-w-[130px] sm:max-w-none truncate">
                                                    {stream.connectionLabel || (stream.ipAddress ? `(${stream.ipAddress})` : "")}
                                                </span>
                                                {/* MULTI-IP SHARING ALERT BADGE */}
                                                {stream.isSharingAlert && (
                                                    <Badge className="text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border-rose-500/40 gap-1 animate-pulse" title={stream.sharingReason || "Multi-IP stream"}>
                                                        <ShieldAlert className="h-3 w-3 text-rose-400" />
                                                        SHARING ALERT
                                                    </Badge>
                                                )}
                                                {/* CONCURRENT STREAMS BADGE */}
                                                {stream.userActiveStreamCount > 1 && (
                                                    <Badge variant="outline" className={`text-[10px] font-semibold gap-1 ${
                                                        stream.isExcessiveConnections 
                                                            ? "bg-rose-500/10 text-rose-300 border-rose-500/30" 
                                                            : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                                    }`}>
                                                        <Layers className="h-3 w-3 text-amber-400" />
                                                        {stream.userActiveStreamCount} Concurrent
                                                    </Badge>
                                                )}
                                                {/* STREAM PLAYBACK MODE */}
                                                {isTranscoding ? (
                                                    <Badge className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border-amber-500/40 gap-1 animate-pulse">
                                                        <Zap className="h-3 w-3 text-amber-400" />
                                                        TRANSCODING
                                                    </Badge>
                                                ) : isAudioTranscoding ? (
                                                    <Badge variant="outline" className="text-[10px] font-semibold bg-sky-500/10 text-sky-300 border-sky-500/20">
                                                        DIRECT STREAM
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                                        DIRECT PLAY
                                                    </Badge>
                                                )}
                                            </div>

                                            {/* Title & Season / Episode */}
                                            {stream.grandparentTitle ? (
                                                <div className="space-y-0.5">
                                                    <h4 className="text-xs sm:text-sm font-bold text-foreground truncate" title={stream.title}>
                                                        {stream.grandparentTitle}
                                                    </h4>
                                                    <div className="flex items-center gap-1.5 flex-wrap text-xs">
                                                        {seasonEpBadge ? (
                                                            <Badge variant="outline" className="text-[10px] font-mono font-bold bg-sky-500/15 text-sky-300 border-sky-500/30 px-1.5 py-0">
                                                                {seasonEpBadge}
                                                            </Badge>
                                                        ) : (stream.seasonNum || stream.episodeNum) ? (
                                                            <Badge variant="outline" className="text-[10px] font-mono font-bold bg-sky-500/15 text-sky-300 border-sky-500/30 px-1.5 py-0">
                                                                {stream.seasonNum ? `S${String(stream.seasonNum).padStart(2, "0")}` : "S??"}{stream.episodeNum ? `E${String(stream.episodeNum).padStart(2, "0")}` : ""}
                                                            </Badge>
                                                        ) : null}
                                                        <span className="text-foreground/90 font-medium truncate text-[11px] sm:text-xs" title={stream.episodeTitle || stream.title}>
                                                            {stream.episodeTitle || (stream.parentTitle ? `${stream.parentTitle}` : stream.title)}
                                                        </span>
                                                        {stream.year && (
                                                            <span className="text-muted-foreground text-[10px]">({stream.year})</span>
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="space-y-0.5">
                                                    <h4 className="text-xs sm:text-sm font-bold text-foreground truncate" title={stream.title}>
                                                        {stream.title} {stream.year ? `(${stream.year})` : ""}
                                                    </h4>
                                                    {seasonEpBadge && (
                                                        <div className="flex items-center gap-1.5 text-xs">
                                                            <Badge variant="outline" className="text-[10px] font-mono font-bold bg-sky-500/15 text-sky-300 border-sky-500/30 px-1.5 py-0">
                                                                {seasonEpBadge}
                                                            </Badge>
                                                            {stream.episodeTitle && (
                                                                <span className="text-muted-foreground text-[11px] truncate">
                                                                    {stream.episodeTitle}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                                <span className="flex items-center gap-1 text-foreground/90">
                                                    <Monitor className="h-3 w-3 text-primary" />
                                                    {stream.player} {stream.device ? `• ${stream.device}` : ""}
                                                </span>
                                                {stream.sourceResolution && (
                                                    <span className={`px-1.5 py-0.5 rounded font-mono font-bold text-[9px] border ${
                                                        stream.sourceResolution !== stream.streamResolution && stream.streamResolution
                                                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                                            : "bg-white/[0.06] text-foreground border-white/10"
                                                    }`}>
                                                        {stream.sourceResolution !== stream.streamResolution && stream.streamResolution 
                                                            ? `📉 ${stream.sourceResolution} ➔ ${stream.streamResolution}` 
                                                            : (stream.streamResolution || stream.sourceResolution)}
                                                    </span>
                                                )}
                                                {stream.hdrFormat && (
                                                    <Badge className="text-[9px] font-bold bg-amber-500/20 text-amber-300 border-amber-500/30 font-mono py-0">
                                                        ✨ {stream.hdrFormat} {stream.isToneMapping ? "➔ SDR Tone Mapped" : ""}
                                                    </Badge>
                                                )}
                                                <span>•</span>
                                                <span className="font-mono">{stream.streamBitrate ? (stream.streamBitrate >= 1000 ? `${(stream.streamBitrate / 1000).toFixed(1)} Mbps` : `${stream.streamBitrate} kbps`) : ""}</span>
                                            </div>

                                            {/* Progress, Clock & Finish ETA */}
                                            <div className="space-y-0.5 pt-1 max-w-sm">
                                                <div className="flex justify-between items-center text-[10px] text-muted-foreground font-mono">
                                                    <span className="text-foreground/90 font-semibold">
                                                        {stream.viewOffsetFormatted || "0:00"} / {stream.durationFormatted || "0:00"} ({stream.progressPercent || 0}%)
                                                    </span>
                                                    {stream.etaTime ? (
                                                        <span className="text-primary font-medium">
                                                            Ends {stream.etaTime} {stream.remainingFormatted ? `(-${stream.remainingFormatted})` : ""}
                                                        </span>
                                                    ) : (
                                                        <span className="capitalize">{stream.state || "playing"}</span>
                                                    )}
                                                </div>
                                                <Progress value={stream.progressPercent || 0} className="h-1 bg-muted/40" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle/Right: Transcode Specs, Audio & Subtitles */}
                                    <div className="flex flex-wrap md:flex-col items-start md:items-end gap-1.5 text-xs shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/30 w-full md:w-auto min-w-0">
                                        <div className="flex items-center gap-1.5 max-w-full">
                                            <span className="text-[10px] text-muted-foreground shrink-0">Video:</span>
                                            <Badge 
                                                variant="outline" 
                                                className={`text-[10px] font-semibold max-w-full break-all sm:break-normal ${
                                                    isTranscoding 
                                                        ? "bg-amber-500/15 text-amber-300 border-amber-500/40 font-bold" 
                                                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                }`}
                                            >
                                                {isTranscoding ? (
                                                    stream.sourceResolution !== stream.streamResolution && stream.streamResolution
                                                        ? `DOWNCONVERT (${stream.sourceResolution} ➔ ${stream.streamResolution})`
                                                        : "TRANSCODE"
                                                ) : "DIRECT PLAY"} ({stream.videoCodec !== stream.streamVideoCodec && stream.streamVideoCodec ? `${stream.videoCodec} ➔ ${stream.streamVideoCodec}` : (stream.videoCodec || "RAW")})
                                            </Badge>
                                        </div>

                                        {isTranscoding && (stream.transcodeSpeed || stream.transcodeThrottled) && (
                                            <Badge variant="outline" className={`text-[9px] font-mono flex items-center gap-1 ${
                                                stream.transcodeThrottled || stream.transcodeSpeedHealthy !== false
                                                    ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                                                    : "bg-rose-500/15 text-rose-300 border-rose-500/40 animate-pulse"
                                            }`} title={
                                                stream.transcodeThrottled
                                                    ? "Plex transcoder is throttled because the buffer is ahead. Server CPU/GPU is at idle power saving."
                                                    : stream.transcodeSpeedHealthy !== false
                                                        ? "Transcode speed is faster than real-time playback"
                                                        : "Transcode speed is slower than real-time playback (buffering risk!)"
                                            }>
                                                <Clock className="h-2.5 w-2.5" />
                                                ⚡ {stream.transcodeSpeed || "0.0x"} speed {stream.transcodeThrottled ? "(Throttled • Power Saving)" : stream.transcodeSpeedHealthy !== false ? "(Real-Time OK)" : "(Slow)"}
                                            </Badge>
                                        )}

                                        <div className="flex items-center gap-1.5 max-w-full">
                                            <span className="text-[10px] text-muted-foreground shrink-0">Audio:</span>
                                            <Badge 
                                                variant="outline" 
                                                className={`text-[10px] font-semibold max-w-full break-all sm:break-normal ${
                                                    isAudioTranscoding 
                                                        ? "bg-sky-500/10 text-sky-300 border-sky-500/20" 
                                                        : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                                                }`}
                                                title={isAudioTranscoding ? "Audio conversion (Direct Stream - minimal CPU, no transcoding power)" : "Direct Play audio"}
                                            >
                                                {isAudioTranscoding ? "CONVERT" : "DIRECT PLAY"} ({stream.sourceAudioCodec || stream.audioCodec || "RAW"}{stream.sourceAudioChannels ? ` ${stream.sourceAudioChannels}` : ""}{(stream.sourceAudioCodec !== stream.streamAudioCodec && stream.streamAudioCodec) ? ` ➔ ${stream.streamAudioCodec}` : ""})
                                            </Badge>
                                        </div>

                                        {stream.hasSubtitle && (
                                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                                                <span>💬 {stream.subtitleLanguage || "Sub"} {stream.subtitleCodec ? `(${stream.subtitleCodec})` : ""}</span>
                                                {stream.isSubtitleBurnIn && (
                                                    <Badge variant="outline" className="text-[9px] font-bold bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse" title="Subtitles are being burned into video, forcing CPU/GPU transcode">
                                                        🔥 Burned In
                                                    </Badge>
                                                )}
                                            </div>
                                        )}

                                        {isTranscoding && (
                                            isHw || stream.transcodeHwRequested || stream.transcodeHwEncoding ? (
                                                <Badge variant="outline" className="text-[9px] bg-cyan-500/20 text-cyan-300 border-cyan-500/40 gap-1 font-mono flex items-center" title={stream.hwPowerBadge || "GPU Hardware Accelerated (Low CPU / Low Power)"}>
                                                    <Zap className="h-2.5 w-2.5" />
                                                    {stream.hwEngine || "GPU HW"}: {stream.transcodeHwDecoding ? `${stream.transcodeHwDecoding} ➔ ` : ""}{stream.transcodeHwEncoding || "NVENC"} (Low Power)
                                                </Badge>
                                            ) : (
                                                <Badge variant="outline" className="text-[9px] bg-rose-500/20 text-rose-300 border-rose-500/40 gap-1 font-mono flex items-center" title="Software transcoding running on CPU cores (High CPU load & power)">
                                                    <Flame className="h-2.5 w-2.5 text-rose-400" />
                                                    CPU Software (High Power)
                                                </Badge>
                                            )
                                        )}

                                        {isTranscoding && stream.transcodeBufferAheadFormatted && (
                                            <span className="text-[9px] font-mono text-cyan-400/90 font-medium">
                                                Buffer: {stream.transcodeBufferAheadFormatted}
                                            </span>
                                        )}

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={killingSessionKey === stream.sessionKey}
                                            onClick={() => handleKill(stream.instanceId, stream.sessionKey)}
                                            className="h-7 px-2 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1 mt-1 cursor-pointer w-full md:w-auto justify-center"
                                        >
                                            {killingSessionKey === stream.sessionKey ? (
                                                <Loader2 className="h-3 w-3 animate-spin" />
                                            ) : (
                                                <XCircle className="h-3 w-3" />
                                            )}
                                            Stop Stream
                                        </Button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>

            {/* WATCH HISTORY & SECURITY AUDIT MODAL */}
            <Dialog open={showHistory} onOpenChange={setShowHistory}>
                <DialogContent className="w-[95vw] sm:w-[92vw] md:w-[90vw] max-w-4xl sm:max-w-4xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-[#121218] border-border/60">
                    <DialogHeader className="p-5 pb-3 border-b border-border/40">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1">
                                <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                    <History className="h-5 w-5 text-primary" />
                                    Native Plex Watch History & Security Audit Log
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground">
                                    Comprehensive stream timeline, playback progress, and concurrent multi-IP sharing anomalies.
                                </DialogDescription>
                            </div>
                            {historyData && (
                                <div className="flex items-center gap-2 text-xs">
                                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
                                        {historyData.total || 0} Total Records
                                    </Badge>
                                    {(historyData.sharingAlertsCount || 0) > 0 && (
                                        <Badge className="bg-rose-500/20 text-rose-300 border-rose-500/30 gap-1">
                                            <ShieldAlert className="h-3 w-3" />
                                            {historyData.sharingAlertsCount} Alerts
                                        </Badge>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Search and Filter Toolbar */}
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-3">
                            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                                {[
                                    { id: "all", label: "All Activity" },
                                    { id: "movies", label: "Movies" },
                                    { id: "episodes", label: "Episodes" },
                                    { id: "sharing", label: "🚨 Sharing Alerts" },
                                ].map((tab) => (
                                    <Button
                                        key={tab.id}
                                        variant={historyFilter === tab.id ? "default" : "outline"}
                                        size="sm"
                                        onClick={() => {
                                            setHistoryFilter(tab.id);
                                            loadHistory(tab.id, historySearch);
                                        }}
                                        className="h-7 text-xs px-2.5"
                                    >
                                        {tab.label}
                                    </Button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2">
                                <div className="relative flex-1 sm:w-56">
                                    <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
                                    <Input
                                        placeholder="Search title, user, IP..."
                                        value={historySearch}
                                        onChange={(e) => setHistorySearch(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                                loadHistory(historyFilter, historySearch);
                                            }
                                        }}
                                        className="h-7 pl-8 pr-2 text-xs bg-muted/20 border-white/10"
                                    />
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => loadHistory(historyFilter, historySearch)}
                                    disabled={historyLoading}
                                    className="h-7 px-2 text-xs"
                                    title="Refresh History"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? "animate-spin" : ""}`} />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleClearHistory}
                                    className="h-7 px-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                    title="Clear All History"
                                >
                                    <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Content List Area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-2.5 min-h-[300px]">
                        {historyLoading ? (
                            <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <span className="text-xs">Querying watch records & security telemetry...</span>
                            </div>
                        ) : !historyData?.items || historyData.items.length === 0 ? (
                            <div className="py-20 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                                <History className="h-8 w-8 text-muted-foreground/30" />
                                <span className="text-xs">No stream activity records match your filter.</span>
                            </div>
                        ) : (
                            historyData.items.map((item: any) => {
                                const durationFormatted = item.durationMs 
                                    ? (item.durationMs >= 3600000 
                                        ? `${Math.floor(item.durationMs / 3600000)}h ${Math.floor((item.durationMs % 3600000) / 60000)}m`
                                        : `${Math.floor(item.durationMs / 60000)}m`)
                                    : "";
                                const dateFormatted = item.watchedAt 
                                    ? new Date(item.watchedAt).toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit"
                                    })
                                    : "";

                                return (
                                    <div
                                        key={item.id}
                                        className={`p-3 rounded-lg border transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
                                            item.isSharingAlert 
                                                ? "bg-rose-950/20 border-rose-500/40" 
                                                : "bg-white/[0.02] border-white/[0.06] hover:border-white/20"
                                        }`}
                                    >
                                        <div className="flex items-start gap-3 flex-1 min-w-0">
                                            {/* Poster Thumbnail */}
                                            <div className="relative w-10 h-14 rounded overflow-hidden shrink-0 bg-muted/30 border border-white/10 flex items-center justify-center">
                                                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground/40">
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

                                            {/* Title & Metadata */}
                                            <div className="space-y-1 min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <Badge className="text-[10px] font-bold bg-primary/20 text-primary border-primary/30">
                                                        👤 {item.user}
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                        🖥️ {item.serverName}
                                                    </Badge>
                                                    {item.isSharingAlert && (
                                                        <Badge className="text-[10px] font-extrabold bg-rose-500/20 text-rose-300 border-rose-500/40 gap-1 animate-pulse">
                                                            <ShieldAlert className="h-3 w-3" />
                                                            SHARING ALERT
                                                        </Badge>
                                                    )}
                                                    {item.completed && (
                                                        <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                                            ✓ Finished
                                                        </Badge>
                                                    )}
                                                </div>

                                                <div className="font-semibold text-xs text-foreground truncate">
                                                    {item.grandparentTitle ? (
                                                        <>
                                                            <span className="text-foreground/80">{item.grandparentTitle}</span>
                                                            <span className="mx-1 text-muted-foreground">•</span>
                                                            {item.seasonNum || item.episodeNum ? (
                                                                <span className="font-mono text-sky-400 mr-1">
                                                                    S{String(item.seasonNum || 1).padStart(2, "0")}E{String(item.episodeNum || 1).padStart(2, "0")}
                                                                </span>
                                                            ) : null}
                                                            <span>{item.title}</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <span>{item.title}</span>
                                                            {item.year && <span className="text-muted-foreground ml-1">({item.year})</span>}
                                                        </>
                                                    )}
                                                </div>

                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                                    <span>{item.player || item.platform || "Plex"}</span>
                                                    {item.ipAddress && (
                                                        <>
                                                            <span>•</span>
                                                            <span className="font-mono text-[10px]">{item.ipAddress}</span>
                                                        </>
                                                    )}
                                                    {item.videoDecision && (
                                                        <>
                                                            <span>•</span>
                                                            <span className={`text-[10px] font-medium ${item.videoDecision === "transcode" ? "text-amber-400" : "text-emerald-400"}`}>
                                                                {item.videoDecision.toUpperCase()}
                                                            </span>
                                                        </>
                                                    )}
                                                </div>

                                                {item.isSharingAlert && item.sharingAlertNote && (
                                                    <div className="text-[11px] text-rose-300/90 font-medium bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20 mt-1">
                                                        ⚠️ {item.sharingAlertNote}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Right: Progress & Timestamp */}
                                        <div className="w-full sm:w-36 shrink-0 space-y-1 sm:text-right pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                                            <div className="text-[11px] font-medium text-foreground/90">
                                                {dateFormatted}
                                            </div>
                                            <div className="text-[10px] text-muted-foreground">
                                                {durationFormatted} {item.progressPercent ? `(${item.progressPercent}%)` : ""}
                                            </div>
                                            <div className="w-full sm:w-28 sm:ml-auto">
                                                <Progress value={item.progressPercent || 0} className="h-1 bg-muted/40" />
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </Card>
    );
}
