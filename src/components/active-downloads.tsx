"use client";

import { useState, useEffect } from "react";
import { getActiveDownloads } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Download, Loader2 } from "lucide-react";

export default function ActiveDownloads({ initialData }: { initialData: any[] }) {
    const [downloads, setDownloads] = useState<any[]>(initialData);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const fresh = await getActiveDownloads();
                if (fresh) setDownloads(fresh);
            } catch (e) {
                console.error("Failed to auto-refresh downloads", e);
            }
        }, 10000); // 10 Seconds

        return () => clearInterval(interval);
    }, []);

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