"use client";

import { useState, useEffect } from "react";
import { getAdminDetailedStreamsAction, killUserStream } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
    Activity, Tv, Film, Monitor, Cpu, HardDrive, RefreshCw, 
    Play, Pause, XCircle, Zap, Shield, Sparkles, Loader2, Server,
    Layers, Trophy, Flame, Filter, BarChart3, CheckCircle2
} from "lucide-react";

export default function AdminDetailedStreams() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [killingSessionKey, setKillingSessionKey] = useState<string | null>(null);
    const [selectedServerFilter, setSelectedServerFilter] = useState<string | null>(null);

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

                    <div className="flex items-center gap-2">
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
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Direct Play / Transcode</span>
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
                                    Streams Per Plex Server
                                </span>
                            </div>
                            <Badge variant="outline" className="text-[10px] font-semibold bg-sky-500/10 text-sky-400 border-sky-500/30">
                                {serversUsage.length} Monitored {serversUsage.length === 1 ? "Server" : "Servers"} • Ranked
                            </Badge>
                        </div>

                        {serversUsage.length === 0 ? (
                            <div className="text-xs text-muted-foreground py-4 text-center">
                                No monitored Plex servers active. Turn on monitoring in Settings &gt; Monitoring.
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
                {/* ACTIVE STREAMS SECTION HEADER & SERVER FILTER PILLS */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-3">
                    <div className="flex items-center gap-2">
                        <Tv className="h-4 w-4 text-primary" />
                        <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
                            Active Playback Sessions
                        </h3>
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            {filteredSessions.length} {filteredSessions.length === 1 ? "stream" : "streams"}
                        </Badge>
                    </div>

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
                </div>

                {filteredSessions.length === 0 ? (
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
                        {filteredSessions.map((stream: any, idx: number) => {
                            const isTranscoding = stream.videoDecision === "transcode";
                            const isAudioTranscoding = stream.audioDecision === "transcode";
                            const isHw = isTranscoding && (stream.transcodeHwRequested || stream.transcodeHwEncoding || stream.transcodeHwDecoding);

                            // Season & Episode tag detection (from field or fallback title regex)
                            const titleMatch = stream.title ? stream.title.match(/S(\d+)\s*E(\d+)/i) : null;
                            const seasonEpBadge = stream.seasonEpisodeTag || (titleMatch ? titleMatch[0].toUpperCase() : null);

                            return (
                                <div 
                                    key={stream.sessionKey || idx}
                                    className="p-3.5 rounded-xl bg-[#14141c]/90 border border-white/[0.08] hover:border-primary/40 transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-4"
                                >
                                    {/* Left: Poster + User & Media Info */}
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className="relative w-12 h-16 sm:w-14 sm:h-20 rounded-lg overflow-hidden shrink-0 bg-muted/30 border border-white/10 flex items-center justify-center">
                                            <div className="absolute inset-0 flex items-center justify-center bg-muted/20">
                                                <Film className="h-5 w-5 text-muted-foreground/30" />
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
                                                <Badge className="text-[10px] font-bold bg-primary/20 text-primary border-primary/30">
                                                    👤 {stream.user}
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                    🖥️ {stream.serverName}
                                                </Badge>
                                                {stream.ipAddress && (
                                                    <span className="text-[10px] font-mono text-muted-foreground/80">
                                                        ({stream.ipAddress})
                                                    </span>
                                                )}
                                                {/* STREAM PLAYBACK MODE: only show TRANSCODING if it's using video transcoding power */}
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
                                                <span>•</span>
                                                <span className="font-mono">{stream.streamBitrate ? (stream.streamBitrate >= 1000 ? `${(stream.streamBitrate / 1000).toFixed(1)} Mbps` : `${stream.streamBitrate} kbps`) : ""}</span>
                                            </div>

                                            {/* Progress */}
                                            <div className="space-y-0.5 pt-1 max-w-sm">
                                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                                    <span>Progress</span>
                                                    <span>{stream.progressPercent || 0}%</span>
                                                </div>
                                                <Progress value={stream.progressPercent || 0} className="h-1 bg-muted/40" />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Middle: Transcode Specs */}
                                    <div className="flex flex-wrap md:flex-col items-start md:items-end gap-1.5 text-xs shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border/30 w-full md:w-auto">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-muted-foreground">Video:</span>
                                            <Badge 
                                                variant="outline" 
                                                className={`text-[10px] font-semibold ${
                                                    isTranscoding 
                                                        ? "bg-amber-500/15 text-amber-300 border-amber-500/40 font-bold" 
                                                        : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                }`}
                                            >
                                                {isTranscoding ? "TRANSCODE" : "DIRECT PLAY"} ({stream.videoCodec || "RAW"})
                                            </Badge>
                                        </div>

                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] text-muted-foreground">Audio:</span>
                                            <Badge 
                                                variant="outline" 
                                                className={`text-[10px] font-semibold ${
                                                    isAudioTranscoding 
                                                        ? "bg-sky-500/10 text-sky-300 border-sky-500/20" 
                                                        : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                                                }`}
                                                title={isAudioTranscoding ? "Audio conversion (Direct Stream - minimal CPU, no transcoding power)" : "Direct Play audio"}
                                            >
                                                {isAudioTranscoding ? "CONVERT" : "DIRECT PLAY"} ({stream.audioCodec || "RAW"})
                                            </Badge>
                                        </div>

                                        {isHw && (
                                            <Badge variant="outline" className="text-[9px] bg-cyan-500/20 text-cyan-300 border-cyan-500/40 gap-1 font-mono">
                                                <Zap className="h-2.5 w-2.5" />
                                                HW: {stream.transcodeHwDecoding ? `${stream.transcodeHwDecoding} -> ` : ""}{stream.transcodeHwEncoding || "NVENC"}
                                            </Badge>
                                        )}

                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            disabled={killingSessionKey === stream.sessionKey}
                                            onClick={() => handleKill(stream.instanceId, stream.sessionKey)}
                                            className="h-7 px-2 text-[11px] text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 gap-1 mt-1 cursor-pointer"
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
        </Card>
    );
}
