"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Zap, Activity, Gauge, CheckCircle2, AlertTriangle, RefreshCw, Wifi, ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ServerSpeedTest() {
    const [isOpen, setIsOpen] = useState(false);
    const [testing, setTesting] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState<string>("Ready to test connection");
    
    const [pingMs, setPingMs] = useState<number | null>(null);
    const [downloadMbps, setDownloadMbps] = useState<number | null>(null);
    const [uploadMbps, setUploadMbps] = useState<number | null>(null);

    const runSpeedTest = async () => {
        setTesting(true);
        setProgress(5);
        setPingMs(null);
        setDownloadMbps(null);
        setUploadMbps(null);
        setStatusMessage("Measuring server latency (ping)...");

        try {
            // 1. Measure Latency (Ping)
            const pingSamples: number[] = [];
            for (let i = 0; i < 3; i++) {
                const t0 = performance.now();
                await fetch("/api/speedtest?size=1", { method: "HEAD", cache: "no-store" });
                const t1 = performance.now();
                pingSamples.push(t1 - t0);
                setProgress(10 + (i * 10));
            }
            const avgPing = Math.round(pingSamples.reduce((a, b) => a + b, 0) / pingSamples.length);
            setPingMs(avgPing);

            // 2. Measure Download Throughput (15MB test)
            setStatusMessage("Testing download bandwidth from media server...");
            setProgress(45);

            const testSizeMb = 12;
            const startTime = performance.now();
            const res = await fetch(`/api/speedtest?size=${testSizeMb}&_t=${Date.now()}`, { cache: "no-store" });
            if (!res.ok) throw new Error("Server test endpoint unavailable");

            const reader = res.body?.getReader();
            let receivedBytes = 0;
            const totalBytes = testSizeMb * 1024 * 1024;

            if (reader) {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    receivedBytes += value.length;
                    const percent = Math.min(85, Math.round(45 + (receivedBytes / totalBytes) * 40));
                    setProgress(percent);
                }
            } else {
                const blob = await res.blob();
                receivedBytes = blob.size;
            }

            const endTime = performance.now();
            const durationSeconds = (endTime - startTime) / 1000;
            const bitsLoaded = receivedBytes * 8;
            const speedBps = bitsLoaded / durationSeconds;
            const speedMbps = Math.round((speedBps / (1024 * 1024)) * 10) / 10;

            setDownloadMbps(speedMbps);
            setProgress(90);

            // 3. Measure Upload Latency
            setStatusMessage("Testing upload acknowledgment...");
            const sampleBlob = new Blob([new Uint8Array(2 * 1024 * 1024)]); // 2MB upload
            const upStart = performance.now();
            const upRes = await fetch("/api/speedtest", {
                method: "POST",
                body: sampleBlob,
                cache: "no-store"
            });
            const upEnd = performance.now();
            if (upRes.ok) {
                const upDuration = (upEnd - upStart) / 1000;
                const upMbps = Math.round(((sampleBlob.size * 8) / upDuration / (1024 * 1024)) * 10) / 10;
                setUploadMbps(upMbps);
            }

            setProgress(100);
            setStatusMessage("Test completed successfully!");
        } catch (e: any) {
            setStatusMessage("Test error: " + (e.message || "Failed to reach server"));
        } finally {
            setTesting(false);
        }
    };

    const getPlaybackTier = (mbps: number) => {
        if (mbps >= 50) {
            return {
                title: "4K HDR Remux Ready",
                color: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
                badge: "Excellent",
                badgeColor: "bg-emerald-600 text-white",
                desc: "Your connection can smoothly Direct Play uncompressed 4K HDR / Dolby Vision remuxes without buffering."
            };
        }
        if (mbps >= 20) {
            return {
                title: "1080p High Bitrate Ready",
                color: "text-cyan-400 border-cyan-500/40 bg-cyan-500/10",
                badge: "Great",
                badgeColor: "bg-cyan-600 text-white",
                desc: "Your connection can Direct Play 1080p Blu-ray quality and compressed 4K streams."
            };
        }
        if (mbps >= 8) {
            return {
                title: "Standard 1080p / 720p",
                color: "text-amber-400 border-amber-500/40 bg-amber-500/10",
                badge: "Moderate",
                badgeColor: "bg-amber-600 text-white",
                desc: "Adequate for 1080p standard and 720p HD streaming. High bitrate 4K may require video transcoding."
            };
        }
        return {
            title: "Transcoding Recommended",
            color: "text-rose-400 border-rose-500/40 bg-rose-500/10",
            badge: "Low Speed",
            badgeColor: "bg-rose-600 text-white",
            desc: "Connection is constrained. Set Plex playback quality to 4 Mbps (720p) or 2 Mbps to avoid buffering."
        };
    };

    return (
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
            <DialogTrigger asChild>
                <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-8 text-xs font-semibold gap-1.5 border-primary/30 hover:border-primary hover:bg-primary/10 transition-all active:scale-95 shadow-sm"
                >
                    <Zap className="h-3.5 w-3.5 text-amber-400" />
                    Speed Test
                </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg bg-[#121218]/95 border-border/60 backdrop-blur-xl shadow-2xl">
                <DialogHeader className="pb-3 border-b border-border/40">
                    <DialogTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                        <Gauge className="h-5 w-5 text-primary" />
                        Server Bandwidth & Direct Play Test
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Test your device's connection directly to this media server to verify playback quality limits.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-3">
                    {/* Live Speedometer / Metrics Grid */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center space-y-1">
                            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase">
                                <Activity className="h-3 w-3 text-cyan-400" /> Ping
                            </div>
                            <div className="text-xl font-bold tracking-tight text-foreground">
                                {pingMs !== null ? `${pingMs} ms` : testing ? <Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /> : "--"}
                            </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center space-y-1">
                            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase">
                                <ArrowDown className="h-3 w-3 text-emerald-400" /> Download
                            </div>
                            <div className="text-xl font-bold tracking-tight text-emerald-400">
                                {downloadMbps !== null ? `${downloadMbps} Mbps` : testing ? <Loader2 className="h-5 w-5 animate-spin mx-auto text-emerald-400" /> : "--"}
                            </div>
                        </div>

                        <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-center space-y-1">
                            <div className="flex items-center justify-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase">
                                <ArrowUp className="h-3 w-3 text-blue-400" /> Upload
                            </div>
                            <div className="text-xl font-bold tracking-tight text-blue-400">
                                {uploadMbps !== null ? `${uploadMbps} Mbps` : testing ? <Loader2 className="h-5 w-5 animate-spin mx-auto text-blue-400" /> : "--"}
                            </div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {testing && (
                        <div className="space-y-1.5">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>{statusMessage}</span>
                                <span>{progress}%</span>
                            </div>
                            <Progress value={progress} className="h-2 bg-muted/30" />
                        </div>
                    )}

                    {/* Playback Capability Rating */}
                    {downloadMbps !== null && (
                        (() => {
                            const tier = getPlaybackTier(downloadMbps);
                            return (
                                <div className={`p-4 rounded-xl border ${tier.color} space-y-2 animate-in fade-in zoom-in-95 duration-300`}>
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2 font-bold text-sm">
                                            <CheckCircle2 className="h-4 w-4" />
                                            {tier.title}
                                        </div>
                                        <Badge className={`text-[10px] font-semibold ${tier.badgeColor}`}>
                                            {tier.badge}
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        {tier.desc}
                                    </p>
                                </div>
                            );
                        })()
                    )}

                    {/* Guidance / Action */}
                    <div className="pt-2 flex items-center justify-between border-t border-border/40">
                        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Wifi className="h-3.5 w-3.5 text-primary" /> Direct server-to-browser socket
                        </div>
                        <Button 
                            onClick={runSpeedTest} 
                            disabled={testing}
                            className="font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground h-9 px-4 hover:ring-2 hover:ring-primary/40 active:scale-95 transition-all"
                        >
                            {testing ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Testing...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="h-3.5 w-3.5" />
                                    {downloadMbps !== null ? "Retest Speed" : "Start Speed Test"}
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
