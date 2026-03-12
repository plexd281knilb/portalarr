"use client";

import { useState, useEffect } from "react";
import { getLandingStats } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, WifiOff, Cpu, HardDrive, PlaySquare } from "lucide-react";

export default function SystemStatus({ initialData }: { initialData: any }) {
    const [stats, setStats] = useState(initialData);

    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const fresh = await getLandingStats();
                if (fresh) setStats(fresh);
            } catch (e) {
                console.error("Failed to auto-refresh stats", e);
            }
        }, 10000); // 10 Seconds

        return () => clearInterval(interval);
    }, []);

    // Calculate total streams from the array we created in actions.ts
    const totalStreams = stats.streamStats?.reduce((acc: number, server: any) => acc + server.count, 0) || 0;

    return (
        <Card className="h-full">
            <CardHeader>
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-primary"/> System Status
                        </CardTitle>
                        <CardDescription>Live server performance.</CardDescription>
                    </div>
                    <div className="flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-2 w-2 rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                    </div>
                </div>
            </CardHeader>
            <CardContent className="space-y-6">
                
                {/* General Health */}
                <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
                    <span className="font-medium">Overall Health</span>
                    {stats.downApps.length > 0 ? (
                        <Badge variant="destructive" className="gap-1">
                            <WifiOff className="h-3 w-3"/> Issues Detected
                        </Badge>
                    ) : (
                        <Badge className="bg-green-500 hover:bg-green-600 gap-1">
                            <Activity className="h-3 w-3"/> All Systems Operational
                        </Badge>
                    )}
                </div>
                
                {stats.downApps.length > 0 && (
                    <div className="text-sm text-red-500 bg-red-50 p-3 rounded border border-red-100">
                        <strong>Down:</strong> {stats.downApps.join(", ")}
                    </div>
                )}

                {/* Stream Count Section */}
                <div className="py-2 border-y">
                    <div className="text-center mb-3">
                        <div className="text-3xl font-bold text-primary transition-all duration-500">
                            {totalStreams}
                        </div>
                        <div className="text-xs text-muted-foreground uppercase tracking-wide">Total Active Streams</div>
                    </div>
                    
                    {/* Individual Server Breakdown */}
                    {stats.streamStats && stats.streamStats.length > 0 && (
                        <div className="space-y-2 mt-4 pt-4 border-t border-dashed">
                            {stats.streamStats.map((server: any, idx: number) => (
                                <div key={idx} className="flex items-center justify-between text-sm">
                                    <div className="flex items-center gap-2 text-muted-foreground">
                                        <PlaySquare className="h-4 w-4" />
                                        <span>{server.name}</span>
                                    </div>
                                    <Badge variant={server.count > 0 ? "default" : "secondary"}>
                                        {server.count}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Hardware Server Stats (CPU/RAM) */}
                <div className="space-y-3">
                    {stats.serverStats.map((server: any) => (
                        <div key={server.name} className="space-y-1">
                            <div className="flex justify-between text-xs font-semibold text-muted-foreground">
                                <span>{server.name}</span>
                                <span className={server.online ? "text-green-500" : "text-red-500"}>
                                    {server.online ? "ONLINE" : "OFFLINE"}
                                </span>
                            </div>
                            {server.online && (
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="flex items-center gap-1 bg-muted p-1.5 rounded">
                                        <Cpu className="h-3 w-3"/> {server.cpu.toFixed(1)}% CPU
                                    </div>
                                    <div className="flex items-center gap-1 bg-muted p-1.5 rounded">
                                        <HardDrive className="h-3 w-3"/> {server.ram.toFixed(1)}% RAM
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </CardContent>
        </Card>
    );
}