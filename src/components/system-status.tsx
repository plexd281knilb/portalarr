"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, WifiOff, Cpu, HardDrive, PlaySquare } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function SystemStatus() {
    const [stats, setStats] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchStats = async () => {
            try {
                const res = await fetch("/api/stats");
                if (!res.ok) throw new Error("Failed to fetch");
                const fresh = await res.json();
                if (fresh) setStats(fresh);
            } catch (e) {
                console.error("Failed to fetch stats", e);
            } finally {
                setLoading(false);
            }
        };

        // Initial fetch
        fetchStats();

        // Auto-refresh every 5 seconds
        const interval = setInterval(fetchStats, 5000);
        return () => clearInterval(interval);
    }, []);

    if (loading || !stats) {
        return (
            <Card className="h-full flex flex-col">
                <CardHeader>
                    <Skeleton className="h-6 w-1/3 mb-2" />
                    <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent className="space-y-6">
                    <Skeleton className="h-12 w-full" />
                    <div className="space-y-2">
                        <Skeleton className="h-16 w-full" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-full" />
                    </div>
                </CardContent>
            </Card>
        );
    }

    // Calculate total streams from the array
    const totalStreams = stats.streamStats?.reduce((acc: number, server: any) => acc + server.count, 0) || 0;

    // --- SORTING LOGIC ---
    
    // Order for the Streams section
    const streamOrder = ["main", "kids", "backup"];
    const sortStreams = (a: any, b: any) => {
        const getIndex = (name: string) => {
            const lowerName = name.toLowerCase();
            const index = streamOrder.findIndex(keyword => lowerName.includes(keyword));
            return index === -1 ? 999 : index; 
        };
        return getIndex(a.name) - getIndex(b.name);
    };

    // Order for the Hardware Stats section
    const hardwareOrder = ["main", "backup"];
    const sortHardware = (a: any, b: any) => {
        const getIndex = (name: string) => {
            const lowerName = name.toLowerCase();
            const index = hardwareOrder.findIndex(keyword => lowerName.includes(keyword));
            return index === -1 ? 999 : index; 
        };
        return getIndex(a.name) - getIndex(b.name);
    };

    return (
        <Card className="h-full border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200 animate-in fade-in duration-700">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg font-bold">
                            <Activity className="h-5 w-5 text-primary"/> System Status
                        </CardTitle>
                        <CardDescription>Live server performance & stream metrics.</CardDescription>
                    </div>
                    <div className="flex relative h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                
                {/* General Health */}
                <div className="flex items-center justify-between p-3 bg-muted/20 border border-border/40 rounded-xl">
                    <span className="font-semibold text-sm">Overall Health</span>
                    {stats.downApps && stats.downApps.length > 0 ? (
                        <Badge variant="destructive" className="gap-1.5 shadow-sm">
                            <WifiOff className="h-3.5 w-3.5"/> Issues Detected
                        </Badge>
                    ) : (
                        <Badge className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-sm">
                            <Activity className="h-3.5 w-3.5"/> All Systems Operational
                        </Badge>
                    )}
                </div>
                
                {stats.downApps && stats.downApps.length > 0 && (
                    <div className="text-xs text-red-400 bg-red-950/40 p-3 rounded-xl border border-red-800/40">
                        <strong>Down:</strong> {stats.downApps.join(", ")}
                    </div>
                )}

                {/* Stream Count Section */}
                <div className="py-3 border-y border-border/40">
                    <div className="text-center mb-3">
                        <div className="text-3xl sm:text-4xl font-black text-primary transition-all duration-500">
                            {totalStreams}
                        </div>
                        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mt-1">Total Active Streams</div>
                    </div>
                    
                    {/* Individual Server Breakdown */}
                    {stats.streamStats && stats.streamStats.length > 0 && (
                        <div className="space-y-2 mt-4 pt-4 border-t border-dashed border-border/40">
                            {[...stats.streamStats].sort(sortStreams).map((server: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-xs p-2 rounded-lg bg-muted/10 hover:bg-muted/20 transition-colors">
                                    <div className="flex items-center gap-2 text-foreground font-medium">
                                        <PlaySquare className="h-3.5 w-3.5 text-primary" />
                                        <span>{server.name}</span>
                                    </div>
                                    <Badge variant={server.count > 0 ? "default" : "secondary"} className="text-[10px]">
                                        {server.count} {server.count === 1 ? "stream" : "streams"}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Hardware Server Stats (CPU/RAM) */}
                {stats.serverStats && stats.serverStats.length > 0 && (
                    <div className="space-y-3">
                        {[...stats.serverStats].sort(sortHardware).map((server: any) => (
                            <div key={server.name} className="space-y-1.5 p-2.5 rounded-xl bg-muted/15 border border-border/30">
                                <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                                    <span className="text-foreground">{server.name}</span>
                                    <span className={server.online ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>
                                        {server.online ? "ONLINE" : "OFFLINE"}
                                    </span>
                                </div>
                                {server.online && (
                                    <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                                        <div className="flex items-center gap-1.5 bg-background/60 border border-border/30 p-1.5 rounded-lg">
                                            <Cpu className="h-3 w-3 text-sky-400"/> {server.cpu?.toFixed(1) || 0}% CPU
                                        </div>
                                        <div className="flex items-center gap-1.5 bg-background/60 border border-border/30 p-1.5 rounded-lg">
                                            <HardDrive className="h-3 w-3 text-amber-400"/> {server.ram?.toFixed(1) || 0}% RAM
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}