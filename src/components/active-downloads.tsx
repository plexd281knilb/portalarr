"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function ActiveDownloads() {
    const [downloads, setDownloads] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchDownloads = async () => {
            try {
                const res = await fetch("/api/downloads");
                if (!res.ok) throw new Error("Failed to fetch");
                const fresh = await res.json();
                if (fresh) setDownloads(fresh);
            } catch (e) {
                console.error("Failed to fetch downloads", e);
            } finally {
                setLoading(false);
            }
        };

        // Initial fetch
        fetchDownloads();

        // Auto-refresh every 5 seconds
        const interval = setInterval(fetchDownloads, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <Card className="w-full flex flex-col">
                <CardHeader>
                    <Skeleton className="h-6 w-1/4 mb-2" />
                    <Skeleton className="h-4 w-1/3" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                </CardContent>
            </Card>
        );
    }

    // Flatten all queues from all download apps and deduplicate by filename/title
    const rawQueueItems = downloads.flatMap(app => app.queue || []);
    const seenTitles = new Set<string>();
    const allQueueItems = rawQueueItems.filter((item: any) => {
        const title = (item.filename || item.title || "").trim().toLowerCase();
        if (!title) return true;
        if (seenTitles.has(title)) return false;
        seenTitles.add(title);
        return true;
    });

    return (
        <Card className="w-full border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200 animate-in fade-in duration-700">
            <CardHeader className="pb-3">
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-bold">
                            <Download className="h-5 w-5 text-primary"/> Active Downloads
                        </CardTitle>
                        <CardDescription>Real-time torrent and Usenet download queue.</CardDescription>
                    </div>
                    <Badge variant={allQueueItems.length > 0 ? "default" : "secondary"} className="text-xs px-2.5 py-0.5">
                        {allQueueItems.length} in Queue
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                {allQueueItems.length === 0 ? (
                    <div className="text-center text-muted-foreground text-sm italic py-8 border border-dashed border-border/50 rounded-xl bg-muted/10">
                        No active downloads at the moment. All queues are idle.
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                        {allQueueItems.map((item: any, idx: number) => {
                            // Normalize data between SABnzbd/NZBGet and Arr apps if necessary
                            const title = item.filename || item.title || "Unknown Download";
                            const mbleft = item.mbleft || 0;
                            const mb = item.mb || 0;
                            const percentRaw = item.percentage !== undefined ? parseFloat(item.percentage) : (mb > 0 ? ((mb - mbleft) / mb) * 100 : 0);
                            const percent = isNaN(percentRaw) ? 0 : Math.max(0, Math.min(100, percentRaw));
                            const timeleft = item.timeleft || "";
                            const speed = item.speed || "";
                            
                            return (
                                <div key={idx} className="p-3 rounded-xl bg-muted/20 border border-border/40 hover:bg-muted/30 transition-all duration-200 space-y-2">
                                    <div className="flex justify-between items-start gap-3">
                                        <div className="font-semibold text-sm truncate flex-1 min-w-0" title={title}>
                                            {title}
                                        </div>
                                        <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0 font-mono">
                                            {speed && (
                                                <span className="text-emerald-400 font-semibold">{speed}</span>
                                            )}
                                            {timeleft && <span>ETA: {timeleft}</span>}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[11px] text-muted-foreground font-medium">
                                            <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
                                                <span className="inline-block w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                                                Downloading
                                            </span>
                                            <span className="font-mono text-foreground font-semibold">{percent.toFixed(1)}%</span>
                                        </div>
                                        <Progress value={percent} className="h-2 bg-muted/50 rounded-full" />
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