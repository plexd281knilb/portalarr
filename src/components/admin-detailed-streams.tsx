"use client";

import { useState, useEffect } from "react";
import { getAdminDetailedStreamsAction, killUserStream } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { 
    Activity, Tv, Film, Monitor, Cpu, HardDrive, RefreshCw, 
    Play, Pause, XCircle, Zap, Shield, Sparkles, Loader2, Server
} from "lucide-react";

export default function AdminDetailedStreams() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [killingSessionKey, setKillingSessionKey] = useState<string | null>(null);

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

    const transcodeCount = sessions.filter((s: any) => s.videoDecision === "transcode" || s.audioDecision === "transcode").length;
    const directPlayCount = sessions.length - transcodeCount;
    const hwCount = sessions.filter((s: any) => s.transcodeHwRequested || s.transcodeHwEncoding || s.transcodeHwDecoding).length;
    const totalBandwidthKbps = sessions.reduce((acc: number, s: any) => acc + (s.streamBitrate || 0), 0);
    const totalBandwidthMbps = (totalBandwidthKbps / 1000).toFixed(1);

    return (
        <Card className="border-primary/30 bg-[#121218]/90 backdrop-blur-md shadow-md overflow-hidden">
            <CardHeader className="p-4 sm:p-5 border-b border-border/40">
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
                            Real-time session monitoring across all Tautulli & Plex servers with full transcode specs.
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

                {/* TELEMETRY STATS GRID */}
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-4">
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Streams</span>
                        <div className="text-lg font-black text-foreground flex items-center gap-1.5">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                            </span>
                            {totalStreams}
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

                    {glances.length > 0 && (
                        <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-0.5 col-span-2 sm:col-span-4 lg:col-span-1">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Server Load</span>
                            <div className="text-xs font-medium space-y-0.5 pt-0.5">
                                {glances.map((g: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center text-[11px]">
                                        <span className="truncate max-w-[80px] text-muted-foreground">{g.name}:</span>
                                        <span className="font-mono text-foreground font-semibold">
                                            CPU {g.cpu}% • RAM {g.ram}%
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5 space-y-3">
                {sessions.length === 0 ? (
                    <div className="py-8 text-center space-y-2 text-muted-foreground">
                        <Tv className="h-8 w-8 mx-auto opacity-40 text-primary" />
                        <p className="text-sm font-semibold text-foreground">No active streams playing right now</p>
                        <p className="text-xs">All media servers are idle and standing by for playback.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {sessions.map((stream: any, idx: number) => {
                            const isTranscoding = stream.videoDecision === "transcode";
                            const isAudioTranscoding = stream.audioDecision === "transcode";
                            const isHw = stream.transcodeHwRequested || stream.transcodeHwEncoding || stream.transcodeHwDecoding;

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
                                            </div>

                                            <h4 className="text-xs sm:text-sm font-bold text-foreground truncate" title={stream.title}>
                                                {stream.title} {stream.year ? `(${stream.year})` : ""}
                                            </h4>

                                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                                                <span className="flex items-center gap-1 text-foreground/90">
                                                    <Monitor className="h-3 w-3 text-primary" />
                                                    {stream.player} {stream.device ? `• ${stream.device}` : ""}
                                                </span>
                                                <span>•</span>
                                                <span className="font-mono">{stream.streamBitrate ? `${stream.streamBitrate} kbps` : ""}</span>
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
                                                        ? "bg-amber-500/15 text-amber-300 border-amber-500/40" 
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
                                                        ? "bg-purple-500/15 text-purple-300 border-purple-500/40" 
                                                        : "bg-cyan-500/15 text-cyan-400 border-cyan-500/30"
                                                }`}
                                            >
                                                {isAudioTranscoding ? "TRANSCODE" : "DIRECT PLAY"} ({stream.audioCodec || "RAW"})
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
