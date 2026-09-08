"use client";

import { useState, useEffect, useTransition } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
    Tv, Play, Pause, Activity, Film, BookOpen, Clock, AlertTriangle, 
    CheckCircle2, RefreshCw, Smartphone, Monitor, ShieldAlert, Sparkles, 
    Info, Flame, XCircle, Stethoscope, Loader2, ExternalLink, Server, ChevronDown
} from "lucide-react";
import { getUserPlexHubData, killUserStream, StreamDiagnosis } from "@/app/actions";
import ServerSpeedTest from "@/components/server-speed-test";
import PlexSetupGuides from "@/components/plex-setup-guides";

export default function MyPlexHub() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [selectedStreamForDiagnosis, setSelectedStreamForDiagnosis] = useState<any>(null);
    const [streamToKill, setStreamToKill] = useState<any>(null);
    const [killingStream, setKillingStream] = useState(false);
    const [killMessage, setKillMessage] = useState<string | null>(null);
    const [serversModalOpen, setServersModalOpen] = useState(false);
    const [isPending, startTransition] = useTransition();

    const loadData = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await getUserPlexHubData();
            if (res && res.success) {
                setData(res);
            }
        } catch (e) {
            console.error("Failed to load user Plex hub data:", e);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadData();
        // Polling interval: every 10 seconds for real-time active stream updates
        const interval = setInterval(() => {
            loadData();
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleKillStream = async () => {
        if (!streamToKill) return;
        setKillingStream(true);
        setKillMessage(null);
        try {
            const res = await killUserStream(streamToKill.instanceId, streamToKill.sessionKey);
            if (res.success) {
                setKillMessage("Stream terminated successfully.");
                setTimeout(() => {
                    setStreamToKill(null);
                    setKillMessage(null);
                    loadData(true);
                }, 1200);
            } else {
                setKillMessage("Error: " + (res.error || "Failed to stop stream"));
            }
        } catch (e: any) {
            setKillMessage("Error: " + (e.message || "Failed to stop stream"));
        } finally {
            setKillingStream(false);
        }
    };

    if (loading && !data) {
        return (
            <Card className="w-full bg-[#121218]/80 border-primary/20 backdrop-blur-md shadow-sm">
                <CardContent className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                    <Loader2 className="h-7 w-7 animate-spin text-primary" />
                    <p className="text-xs font-medium">Loading My Plex Hub...</p>
                </CardContent>
            </Card>
        );
    }

    const safeData = data || {
        user: { username: "Plex User" },
        serversCount: 0,
        servers: [],
        activeStreams: [],
        watchHistory: [],
        watchStats: { totalWatchTimeHours: 0, moviesWatched: 0, episodesWatched: 0, musicTracksPlayed: 0 },
        readingStats: { totalBooksAvailable: 0, totalRequests: 0, completedRequests: 0, kindleDeliveries: 0 }
    };

    const activeStreams = safeData.activeStreams || [];
    const watchHistory = safeData.watchHistory || [];
    const stats = safeData.watchStats || {};
    const reading = safeData.readingStats || {};

    return (
        <div className="w-full space-y-4">
            {/* Header with Tools */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#121218]/80 border border-border/50 rounded-2xl p-4 backdrop-blur-md shadow-sm">
                <div className="space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg sm:text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                            <Tv className="h-5 w-5 text-primary" />
                            My Plex Hub
                        </h2>
                        <Badge variant="outline" className="text-[10px] font-semibold bg-primary/10 text-primary border-primary/30">
                            {safeData.user?.username}
                        </Badge>
                        {safeData.serversCount > 0 && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setServersModalOpen(true)}
                                className="h-5 px-2 text-[10px] font-semibold bg-white/[0.04] hover:bg-white/[0.08] border-border/60 text-muted-foreground hover:text-foreground gap-1.5 transition-all rounded-full cursor-pointer shadow-xs"
                                title="Click to view connected servers"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                {safeData.serversCount} {safeData.serversCount === 1 ? "Server" : "Servers"} Connected
                                <ChevronDown className="h-3 w-3 opacity-60" />
                            </Button>
                        )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                        Your personalized stream monitor, playback diagnostics, and watch history.
                    </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <ServerSpeedTest />
                    <PlexSetupGuides />
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted/40 active:scale-95 transition-all"
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        title="Refresh stream status"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin text-primary" : ""}`} />
                    </Button>
                </div>
            </div>

            {/* --- ACTIVE STREAMS & TRANSCODE DOCTOR --- */}
            {activeStreams.length > 0 ? (
                <div className="space-y-3">
                    {activeStreams.map((stream: any, idx: number) => {
                        const diagnosis: StreamDiagnosis = stream.diagnosis;
                        const isTranscoding = stream.videoDecision === "transcode";
                        const isAudioOnly = stream.audioDecision === "transcode" && !isTranscoding;

                        return (
                            <Card 
                                key={stream.sessionKey || idx} 
                                className="relative overflow-hidden bg-gradient-to-br from-[#14141c] via-[#101017] to-[#0d0d12] border-primary/30 backdrop-blur-md shadow-md hover:border-primary/50 transition-all"
                            >
                                <div className="absolute top-0 left-0 h-1 bg-gradient-to-r from-primary via-emerald-400 to-cyan-400 w-full" />
                                <CardContent className="p-4 sm:p-5">
                                    <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                                        {/* Left: Poster & Info */}
                                        <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
                                            {stream.thumb ? (
                                                <div className="relative w-14 h-20 sm:w-16 sm:h-24 rounded-lg overflow-hidden shrink-0 border border-white/10 shadow-md bg-muted/30">
                                                    <img 
                                                        src={stream.thumb} 
                                                        alt={stream.title} 
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => {
                                                            (e.target as HTMLElement).style.display = "none";
                                                        }}
                                                    />
                                                    <div className="absolute bottom-1 right-1 p-1 rounded-full bg-black/70 backdrop-blur-xs">
                                                        {stream.state === "playing" ? (
                                                            <Play className="h-3 w-3 text-emerald-400 fill-emerald-400" />
                                                        ) : (
                                                            <Pause className="h-3 w-3 text-amber-400 fill-amber-400" />
                                                        )}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="w-14 h-20 sm:w-16 sm:h-24 rounded-lg bg-muted/20 border border-border/40 shrink-0 flex items-center justify-center text-muted-foreground">
                                                    <Film className="h-6 w-6 text-muted-foreground/60" />
                                                </div>
                                            )}

                                            <div className="space-y-1.5 min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <Badge className="text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                                                        <Activity className="h-3 w-3 mr-1 animate-pulse" /> LIVE NOW
                                                    </Badge>
                                                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                        {stream.instanceName}
                                                    </Badge>
                                                    <Badge 
                                                        variant="outline" 
                                                        className={`text-[10px] font-semibold ${
                                                            diagnosis.badgeColor === "emerald" ? "bg-emerald-950/40 text-emerald-400 border-emerald-500/40" :
                                                            diagnosis.badgeColor === "blue" ? "bg-blue-950/40 text-blue-400 border-blue-500/40" :
                                                            diagnosis.badgeColor === "amber" ? "bg-amber-950/40 text-amber-400 border-amber-500/40" :
                                                            "bg-rose-950/40 text-rose-400 border-rose-500/40"
                                                        }`}
                                                    >
                                                        {diagnosis.badgeText}
                                                    </Badge>
                                                </div>

                                                <h3 className="text-sm sm:text-base font-bold text-foreground truncate" title={stream.fullTitle}>
                                                    {stream.fullTitle}
                                                </h3>

                                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1">
                                                        <Monitor className="h-3.5 w-3.5 text-primary" />
                                                        {stream.player} {stream.platform ? `(${stream.platform})` : ""}
                                                    </span>
                                                    <span>•</span>
                                                    <span>{stream.streamVideoResolution} ({stream.videoCodec.toUpperCase()})</span>
                                                    <span>•</span>
                                                    <span>{stream.streamBitrateMbps} Mbps</span>
                                                </div>

                                                {/* Progress Bar */}
                                                <div className="space-y-1 pt-1 max-w-md">
                                                    <div className="flex justify-between text-[11px] text-muted-foreground">
                                                        <span>{stream.viewOffsetMinutes} min</span>
                                                        <span>{stream.progressPercent}% ({stream.durationMinutes} min total)</span>
                                                    </div>
                                                    <Progress value={stream.progressPercent} className="h-1.5 bg-muted/30" />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right: Actions */}
                                        <div className="flex sm:flex-col items-center sm:items-end gap-2 shrink-0 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-border/40">
                                            <Button 
                                                size="sm"
                                                variant="outline"
                                                className="flex-1 sm:flex-none text-xs font-semibold gap-1.5 border-primary/30 hover:bg-primary/10 hover:border-primary active:scale-95 transition-all"
                                                onClick={() => setSelectedStreamForDiagnosis(stream)}
                                            >
                                                <Stethoscope className="h-3.5 w-3.5 text-primary" />
                                                Diagnose Stream
                                            </Button>

                                            <Button 
                                                size="sm"
                                                variant="ghost"
                                                className="text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 active:scale-95 transition-all gap-1.5"
                                                onClick={() => setStreamToKill(stream)}
                                            >
                                                <XCircle className="h-3.5 w-3.5 text-rose-500" />
                                                Stop Stream
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            ) : (
                <div className="p-4 rounded-xl bg-[#121218]/60 border border-border/40 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                            <Tv className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5">
                            <div className="text-xs sm:text-sm font-semibold text-foreground">No active streams playing</div>
                            <div className="text-[11px] text-muted-foreground">Your devices are ready. Launch Plex on any TV or phone to start watching.</div>
                        </div>
                    </div>
                    <Button asChild size="sm" variant="outline" className="text-xs gap-1.5 font-semibold shrink-0">
                        <a href="https://app.plex.tv" target="_blank" rel="noopener noreferrer">
                            Open Plex <ExternalLink className="h-3 w-3" />
                        </a>
                    </Button>
                </div>
            )}

            {/* --- PERSONAL STATS BAR --- */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3.5 rounded-xl bg-[#121218]/80 border border-border/40 backdrop-blur-md space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <Clock className="h-3.5 w-3.5 text-primary" /> Hours Streamed
                    </div>
                    <div className="text-xl font-bold tracking-tight text-foreground">
                        {stats.totalWatchTimeHours || 0} <span className="text-xs font-normal text-muted-foreground">hrs</span>
                    </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121218]/80 border border-border/40 backdrop-blur-md space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <Film className="h-3.5 w-3.5 text-cyan-400" /> Movies Finished
                    </div>
                    <div className="text-xl font-bold tracking-tight text-cyan-400">
                        {stats.moviesWatched || 0}
                    </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121218]/80 border border-border/40 backdrop-blur-md space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <Tv className="h-3.5 w-3.5 text-purple-400" /> Episodes Watched
                    </div>
                    <div className="text-xl font-bold tracking-tight text-purple-400">
                        {stats.episodesWatched || 0}
                    </div>
                </div>

                <div className="p-3.5 rounded-xl bg-[#121218]/80 border border-border/40 backdrop-blur-md space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                        <BookOpen className="h-3.5 w-3.5 text-emerald-400" /> Books Available
                    </div>
                    <div className="text-xl font-bold tracking-tight text-emerald-400">
                        {reading.totalBooksAvailable || 0}
                    </div>
                </div>
            </div>

            {/* --- RECENTLY WATCHED CAROUSEL / GRID --- */}
            {watchHistory.length > 0 && (
                <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-primary" /> Recently Watched on Server
                        </h3>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                        {watchHistory.map((item: any) => (
                            <div 
                                key={item.id} 
                                className="group relative rounded-xl bg-[#121218]/70 border border-border/40 overflow-hidden hover:border-primary/40 hover:shadow-md transition-all flex flex-col"
                            >
                                <div className="relative aspect-video sm:aspect-[16/10] bg-muted/20 overflow-hidden">
                                    {item.thumb ? (
                                        <img 
                                            src={item.thumb} 
                                            alt={item.fullTitle} 
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                            onError={(e) => {
                                                (e.target as HTMLElement).style.display = "none";
                                            }}
                                        />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                            <Film className="h-6 w-6" />
                                        </div>
                                    )}
                                    <div className="absolute top-1.5 right-1.5">
                                        <Badge variant="secondary" className="text-[9px] py-0 px-1.5 bg-black/70 backdrop-blur-xs font-semibold text-white/90 max-w-[110px] truncate" title={item.instanceName}>
                                            {item.instanceName}
                                        </Badge>
                                    </div>
                                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/40">
                                        <div 
                                            className="h-full bg-primary" 
                                            style={{ width: `${item.percentComplete}%` }} 
                                        />
                                    </div>
                                </div>

                                <div className="p-2.5 flex-1 flex flex-col justify-between space-y-1">
                                    <div className="text-xs font-semibold text-foreground line-clamp-1 group-hover:text-primary transition-colors" title={item.fullTitle}>
                                        {item.fullTitle}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground flex items-center justify-between">
                                        <span>{item.player}</span>
                                        <span>{item.durationMinutes}m</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* --- TRANSCODE DOCTOR MODAL --- */}
            {selectedStreamForDiagnosis && (
                <Dialog open={!!selectedStreamForDiagnosis} onOpenChange={(open) => !open && setSelectedStreamForDiagnosis(null)}>
                    <DialogContent className="max-w-xl bg-[#121218]/95 border-border/60 backdrop-blur-xl shadow-2xl">
                        <DialogHeader className="pb-3 border-b border-border/40">
                            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                                <Stethoscope className="h-5 w-5 text-primary" />
                                Stream Health & Transcode Doctor
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">
                                Detailed technical breakdown and optimization advice for your active playback session.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="space-y-4 py-2">
                            {/* Diagnosis Status Card */}
                            <div className={`p-4 rounded-xl border ${
                                selectedStreamForDiagnosis.diagnosis.badgeColor === "emerald" ? "bg-emerald-500/10 border-emerald-500/30" :
                                selectedStreamForDiagnosis.diagnosis.badgeColor === "blue" ? "bg-blue-500/10 border-blue-500/30" :
                                selectedStreamForDiagnosis.diagnosis.badgeColor === "amber" ? "bg-amber-500/10 border-amber-500/30" :
                                "bg-rose-500/10 border-rose-500/30"
                            } space-y-2`}>
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 font-bold text-sm text-foreground">
                                        {selectedStreamForDiagnosis.diagnosis.badgeColor === "emerald" ? (
                                            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                                        ) : (
                                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                                        )}
                                        {selectedStreamForDiagnosis.diagnosis.title}
                                    </div>
                                    <Badge className="text-[10px] uppercase font-bold">
                                        {selectedStreamForDiagnosis.diagnosis.badgeText}
                                    </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground leading-relaxed">
                                    {selectedStreamForDiagnosis.diagnosis.explanation}
                                </p>
                            </div>

                            {/* Technical Metrics Grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Video Stream</div>
                                    <div className="font-bold text-foreground capitalize">
                                        {selectedStreamForDiagnosis.videoDecision}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {selectedStreamForDiagnosis.streamVideoResolution}
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Audio Stream</div>
                                    <div className="font-bold text-foreground capitalize">
                                        {selectedStreamForDiagnosis.audioDecision}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        {selectedStreamForDiagnosis.streamAudioCodec?.toUpperCase() || selectedStreamForDiagnosis.audioCodec?.toUpperCase() || "AAC"}
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Bitrate</div>
                                    <div className="font-bold text-foreground">
                                        {selectedStreamForDiagnosis.streamBitrateMbps} Mbps
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        Bandwidth: {selectedStreamForDiagnosis.bandwidthMbps}M
                                    </div>
                                </div>

                                <div className="p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.05] space-y-0.5">
                                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Hardware Accel</div>
                                    <div className="font-bold text-foreground">
                                        {selectedStreamForDiagnosis.transcodeHwEncoding ? "Active (NVENC)" : "None"}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground">
                                        Speed: {selectedStreamForDiagnosis.transcodeSpeed}x
                                    </div>
                                </div>
                            </div>

                            {/* Step-by-Step Fix Recommendation */}
                            <div className="space-y-2 pt-1">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-primary" /> Step-by-Step Device Optimization:
                                </h4>
                                <div className="space-y-1.5">
                                    {selectedStreamForDiagnosis.diagnosis.steps.map((step: string, sIdx: number) => (
                                        <div key={sIdx} className="p-2.5 rounded-lg bg-muted/20 border border-border/40 text-xs text-muted-foreground/95">
                                            {step}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="border-t border-border/40 pt-3">
                            <Button size="sm" onClick={() => setSelectedStreamForDiagnosis(null)} className="font-semibold text-xs">
                                Close Doctor
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* --- KILL STREAM CONFIRMATION MODAL --- */}
            {streamToKill && (
                <Dialog open={!!streamToKill} onOpenChange={(open) => !open && setStreamToKill(null)}>
                    <DialogContent className="max-w-md bg-[#121218]/95 border-rose-500/30 backdrop-blur-xl shadow-2xl">
                        <DialogHeader className="pb-3 border-b border-border/40">
                            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-rose-400">
                                <ShieldAlert className="h-5 w-5 text-rose-500" />
                                Terminate Stuck Playback Session?
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground">
                                This will stop the active stream for <strong className="text-foreground">{streamToKill.fullTitle}</strong> on <strong className="text-foreground">{streamToKill.player}</strong>.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-3 space-y-3">
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Use this action if your TV app crashed or left a ghost session holding server bandwidth. You can freely restart playback on your device anytime after stopping it.
                            </p>

                            {killMessage && (
                                <div className={`p-2.5 rounded-lg text-xs font-semibold ${killMessage.startsWith("Error") ? "bg-rose-500/10 text-rose-400 border border-rose-500/30" : "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"}`}>
                                    {killMessage}
                                </div>
                            )}
                        </div>

                        <DialogFooter className="border-t border-border/40 pt-3 flex items-center justify-between">
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setStreamToKill(null)}
                                disabled={killingStream}
                                className="text-xs"
                            >
                                Cancel
                            </Button>
                            <Button 
                                variant="destructive" 
                                size="sm" 
                                onClick={handleKillStream}
                                disabled={killingStream}
                                className="text-xs font-semibold gap-1.5"
                            >
                                {killingStream ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5" />}
                                Stop Stream Now
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
            )}

            {/* --- CONNECTED SERVERS MODAL --- */}
            <Dialog open={serversModalOpen} onOpenChange={setServersModalOpen}>
                <DialogContent className="max-w-md bg-[#121218]/95 border-border/60 backdrop-blur-xl shadow-2xl">
                    <DialogHeader className="pb-3 border-b border-border/40">
                        <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                            <Server className="h-5 w-5 text-primary" />
                            Connected Media Servers
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            All active Plex Media Servers and Tautulli monitors linked to your portal.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="py-2 space-y-2.5 max-h-[60vh] overflow-y-auto">
                        {safeData.servers && safeData.servers.length > 0 ? (
                            safeData.servers.map((srv: any, idx: number) => (
                                <div 
                                    key={srv.id || idx}
                                    className="p-3 rounded-xl bg-white/[0.02] border border-border/50 hover:border-border transition-all space-y-1.5"
                                >
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
                                                <Server className="h-4 w-4" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-xs sm:text-sm font-bold text-foreground truncate" title={srv.name}>
                                                    {srv.name}
                                                </div>
                                                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    Online & Active
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                            {srv.directPms && (
                                                <Badge variant="outline" className="text-[9px] font-semibold bg-primary/10 text-primary border-primary/30">
                                                    Direct PMS
                                                </Badge>
                                            )}
                                            {srv.tautulli && (
                                                <Badge variant="outline" className="text-[9px] font-semibold bg-purple-500/10 text-purple-400 border-purple-500/30">
                                                    Tautulli
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <p className="text-[11px] text-muted-foreground/80 leading-normal pl-9">
                                        {srv.directPms && srv.tautulli 
                                            ? "Direct playback control, transcode diagnostics, and continuous watch history tracking."
                                            : srv.directPms 
                                                ? "Direct playback control, stream health diagnostics, and session management."
                                                : "Telemetry monitor, watch history aggregation, and playback analytics."
                                        }
                                    </p>
                                </div>
                            ))
                        ) : (
                            <div className="py-6 text-center text-xs text-muted-foreground">
                                No connected servers detected.
                            </div>
                        )}
                    </div>

                    <DialogFooter className="border-t border-border/40 pt-3">
                        <Button size="sm" onClick={() => setServersModalOpen(false)} className="font-semibold text-xs">
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
