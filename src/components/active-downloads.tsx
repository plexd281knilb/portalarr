"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2 } from "lucide-react";

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

        // Auto-refresh every 10 seconds
        const interval = setInterval(fetchDownloads, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading) {
        return (
            <Card className="w-full flex items-center justify-center p-12 min-h-[150px]">
                <Loader2 className="h-6 w-6 animate-spin text-primary mr-3" />
                <span className="text-muted-foreground">Checking active downloads...</span>
            </Card>
        );
    }

    // Flatten all queues from all download apps into a single array
    const allQueueItems = downloads.flatMap(app => app.queue || []);

    return (
        <Card className="w-full">
            <CardHeader>
                <div className="flex justify-between items-center">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Download className="h-5 w-5 text-primary"/> Active Downloads
                        </CardTitle>
                        <CardDescription>Currently downloading to the server.</CardDescription>
                    </div>
                    <Badge variant={allQueueItems.length > 0 ? "default" : "secondary"}>
                        {allQueueItems.length} in Queue
                    </Badge>
                </div>
            </CardHeader>
            <CardContent>
                {allQueueItems.length === 0 ? (
                    <div className="text-center text-muted-foreground italic py-8 border border-dashed rounded-lg">
                        No active downloads at the moment.
                    </div>
                ) : (
                    <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
                        {allQueueItems.map((item: any, idx: number) => {
                            // Normalize data between SABnzbd/NZBGet and Arr apps if necessary
                            const title = item.filename || item.title || "Unknown Download";
                            const mbleft = item.mbleft || 0;
                            const mb = item.mb || 0;
                            const percent = item.percentage ? parseFloat(item.percentage) : (mb > 0 ? ((mb - mbleft) / mb) * 100 : 0);
                            const timeleft = item.timeleft || "Unknown Time";
                            
                            return (
                                <div key={idx} className="space-y-2 border-b last:border-0 pb-4 last:pb-0">
                                    <div className="flex justify-between items-start gap-4">
                                        <div className="font-medium text-sm truncate" title={title}>
                                            {title}
                                        </div>
                                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                                            {timeleft}
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-[10px] text-muted-foreground">
                                            <span>Downloading</span>
                                            <span>{percent.toFixed(1)}%</span>
                                        </div>
                                        <Progress value={percent} className="h-1.5" />
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