"use client";

import { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, AlertTriangle, ShieldCheck, RefreshCw, Activity } from "lucide-react";

export default function SimpleSystemHealth() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let mounted = true;
        const fetchStats = async () => {
            try {
                const res = await fetch("/api/stats");
                if (res.ok) {
                    const data = await res.json();
                    if (mounted) setStats(data);
                }
            } catch (err) {
                console.error("Failed to load simple system health:", err);
            } finally {
                if (mounted) setLoading(false);
            }
        };

        fetchStats();
        const interval = setInterval(fetchStats, 10000);
        return () => {
            mounted = false;
            clearInterval(interval);
        };
    }, []);

    const downApps = stats?.downApps || [];
    const isAllGood = downApps.length === 0;

    return (
        <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm">
            <CardContent className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3.5">
                    <div className={`p-2.5 rounded-xl ${isAllGood ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"} shrink-0`}>
                        {isAllGood ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6 animate-pulse" />}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm sm:text-base font-bold text-foreground">
                                {isAllGood ? "All Systems Operational" : "Service Disruption Detected"}
                            </h3>
                            <Badge 
                                variant="outline" 
                                className={`text-[10px] font-semibold ${
                                    isAllGood 
                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                                        : "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                }`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full mr-1 ${isAllGood ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                                {isAllGood ? "Healthy" : `${downApps.length} Down`}
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground pt-0.5">
                            {isAllGood 
                                ? "Plex streaming servers, download engines, and request services are running smoothly." 
                                : `The following services are currently unreachable: ${downApps.join(", ")}`}
                        </p>
                    </div>
                </div>

                <div className="text-xs text-muted-foreground shrink-0 hidden md:block">
                    <span className="flex items-center gap-1.5 font-medium">
                        <Activity className="h-3.5 w-3.5 text-primary" /> Live 24/7 Monitoring
                    </span>
                </div>
            </CardContent>
        </Card>
    );
}
