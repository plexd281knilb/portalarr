"use client"

import { useState, useEffect, useRef } from "react";
import { getDashboardActivity, getMediaAppsActivity } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
    Activity, HardDrive, Download, Users, Play, Cpu, 
    Server, Tv, Smartphone, Monitor, CheckCircle2 
} from "lucide-react";

export default function MainDashboard({ 
    initialDashboard, 
    initialApps 
}: { 
    initialDashboard: any[], 
    initialApps: any[] 
}) {
  const [dashboard, setDashboard] = useState(initialDashboard);
  const [apps, setApps] = useState(initialApps);
  const [loading, setLoading] = useState(false);
  
  const [history, setHistory] = useState<{rx: number, tx: number, cpu: number, mem: number}[]>(
    Array(20).fill({ rx: 0, tx: 0, cpu: 0, mem: 0 }) 
  );

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
        try {
            setLoading(true);
            const [freshDash, freshApps] = await Promise.all([
                getDashboardActivity(),
                getMediaAppsActivity()
            ]);
            
            if (freshDash) setDashboard(freshDash);
            if (freshApps) setApps(freshApps);

            const hardwareNodes = freshDash.filter((d: any) => d.type === "hardware");
            const nodeCount = hardwareNodes.length || 1;
            
            const totalRx = hardwareNodes.reduce((acc: number, h: any) => acc + (h.rx || 0), 0);
            const totalTx = hardwareNodes.reduce((acc: number, h: any) => acc + (h.tx || 0), 0);
            const avgCpu = hardwareNodes.reduce((acc: number, h: any) => acc + (h.cpu || 0), 0) / nodeCount;
            const avgMem = hardwareNodes.reduce((acc: number, h: any) => acc + (h.mem || 0), 0) / nodeCount;

            setHistory(prev => {
                const newPoint = { rx: totalRx, tx: totalTx, cpu: avgCpu, mem: avgMem };
                return [...prev.slice(1), newPoint]; 
            });

        } catch(e) { console.error(e); } 
        finally { setLoading(false); }
    }, 1000); 

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // --- STATS ---
  const activeDownloads = apps.filter(a => ["sabnzbd", "nzbget"].includes(a.type))
    .reduce((acc, app) => acc + (app.queue?.length || 0), 0);
  
  const requestStats = apps.filter(a => ["overseerr", "ombi"].includes(a.type))
    .reduce((acc, app) => ({
        total: acc.total + (app.stats?.total || 0),
        pending: acc.pending + (app.stats?.pending || 0)
    }), { total: 0, pending: 0 });

  const plexServers = dashboard.filter(d => d.type === "plex");
  const activeStreams = plexServers.reduce((acc, d) => acc + (d.streamCount || 0), 0);
  
  const currentStats = history[history.length - 1];
  
  const hardwareNodes = dashboard.filter(d => d.type === "hardware");
  let primaryStorageNode = hardwareNodes.find(d => d.diskName === '/mnt/user' || d.name.toLowerCase().includes('unraid'));
  if (!primaryStorageNode && hardwareNodes.length > 0) {
      primaryStorageNode = [...hardwareNodes].sort((a, b) => b.diskPercent - a.diskPercent)[0];
  }
  const mainDiskPercent = primaryStorageNode?.diskPercent || 0;
  const mainDiskName = primaryStorageNode?.diskName === '/mnt/user' ? 'Unraid Array' : (primaryStorageNode?.diskName || 'Primary Storage');

  // --- HELPERS ---
  const formatSpeed = (bytes: number) => {
      if (bytes > 1000000) return `${(bytes / 1000000).toFixed(1)} MB/s`;
      if (bytes > 1000) return `${(bytes / 1000).toFixed(1)} KB/s`;
      return `${bytes} B/s`;
  };

  const formatTimeLeft = (ms: number) => {
      const minutes = Math.floor(ms / 60000);
      return `${minutes}m left`;
  };

  const getDeviceIcon = (platform: string) => {
      const p = platform ? platform.toLowerCase() : "unknown";
      if (p.includes("tv") || p.includes("roku") || p.includes("shield")) return <Tv className="h-4 w-4"/>;
      if (p.includes("phone") || p.includes("ios") || p.includes("android")) return <Smartphone className="h-4 w-4"/>;
      return <Monitor className="h-4 w-4"/>;
  };

  const getResolutionLabel = (res: string) => {
      if (!res) return "Direct";
      if (res.toLowerCase() === "4k") return "4K";
      return `${res}p`;
  };

  const MiniGraph = ({ data, color, max }: { data: number[], color: string, max?: number }) => {
      const peak = max || Math.max(1, ...data);
      const points = data.map((v, i) => {
          const x = (i / (data.length - 1)) * 100;
          const y = 100 - ((v / peak) * 100);
          return `${x},${y}`;
      }).join(" ");
      const firstY = 100 - ((data[0] / peak) * 100);
      return (
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d={`M0,100 ${points.split(" ").map(p => `L${p}`).join(" ")} L100,100 Z`} fill={color} fillOpacity="0.2" stroke="none"/>
            <path d={`M0,${firstY} ${points.split(" ").map(p => `L${p}`).join(" ")}`} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke"/>
        </svg>
      );
  };

  return (
    <div className="space-y-6">
        <div className="flex justify-end h-4">
           {loading && <Badge variant="outline" className="text-xs border-transparent text-muted-foreground animate-pulse">Live Updates</Badge>}
        </div>

        {/* 1. CLUSTER GRAPHS - Mobile: Stacked, Desktop: 3 Cols */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/20 px-4 py-3">
                    <CardTitle className="text-xs font-medium flex items-center gap-2"><Cpu className="h-3.5 w-3.5 text-purple-500"/> CPU Load</CardTitle>
                    <div className="text-sm font-bold">{currentStats.cpu.toFixed(0)}%</div>
                </CardHeader>
                <CardContent className="p-0 h-[60px] sm:h-[80px] bg-slate-50 dark:bg-slate-900/50">
                    <MiniGraph data={history.map(h => h.cpu)} color="#a855f7" max={100} />
                </CardContent>
            </Card>

            <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/20 px-4 py-3">
                    <CardTitle className="text-xs font-medium flex items-center gap-2"><Server className="h-3.5 w-3.5 text-orange-500"/> RAM Usage</CardTitle>
                    <div className="text-sm font-bold">{currentStats.mem.toFixed(0)}%</div>
                </CardHeader>
                <CardContent className="p-0 h-[60px] sm:h-[80px] bg-slate-50 dark:bg-slate-900/50">
                    <MiniGraph data={history.map(h => h.mem)} color="#f97316" max={100} />
                </CardContent>
            </Card>

            <Card className="overflow-hidden">
                <CardHeader className="flex flex-row items-center justify-between pb-2 bg-muted/20 px-4 py-3">
                    <CardTitle className="text-xs font-medium flex items-center gap-2"><Activity className="h-3.5 w-3.5 text-blue-500"/> Network</CardTitle>
                    <div className="flex gap-2 text-[10px] sm:text-xs font-mono">
                        <span className="text-green-600">↓ {formatSpeed(currentStats.rx)}</span>
                        <span className="text-blue-600">↑ {formatSpeed(currentStats.tx)}</span>
                    </div>
                </CardHeader>
                <CardContent className="p-0 h-[60px] sm:h-[80px] bg-slate-50 dark:bg-slate-900/50 relative">
                     <div className="absolute inset-0">
                        <MiniGraph data={history.map(h => h.rx)} color="#22c55e" />
                     </div>
                </CardContent>
            </Card>
        </div>

        {/* 2. SUMMARY ROW - Mobile: 2 Cols, Desktop: 4 Cols */}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Streams</CardTitle>
                    <Play className="h-3 w-3 text-muted-foreground"/>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{activeStreams}</div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Queue</CardTitle>
                    <Download className="h-3 w-3 text-muted-foreground"/>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{activeDownloads}</div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Requests</CardTitle>
                    <Users className="h-3 w-3 text-muted-foreground"/>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{requestStats.total}</div>
                    <div className="text-[10px] sm:text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        {requestStats.pending > 0 ? (
                            <span className="text-yellow-600 font-semibold">
                                {requestStats.pending} Pending
                            </span>
                        ) : (
                            <span className="text-green-600 flex items-center">
                                <CheckCircle2 className="h-3 w-3 mr-1" /> All Good
                            </span>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0 p-4">
                    <CardTitle className="text-xs font-medium text-muted-foreground">Storage</CardTitle>
                    <HardDrive className="h-3 w-3 text-muted-foreground"/>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                    <div className="text-xl sm:text-2xl font-bold">{mainDiskPercent}%</div>
                    <div className="h-1.5 w-full bg-secondary rounded-full mt-2 overflow-hidden">
                        <div className={`h-full ${mainDiskPercent > 90 ? "bg-red-500" : "bg-primary"}`} style={{ width: `${mainDiskPercent}%` }} />
                    </div>
                </CardContent>
            </Card>
        </div>

        {/* 3. LIVE SESSIONS */}
        <div className="space-y-6">
            <h3 className="text-lg font-semibold tracking-tight">Live Sessions</h3>
            
            {plexServers.length === 0 && <div className="text-muted-foreground italic text-sm">No Plex servers configured.</div>}
            
            <div className="grid gap-6 lg:grid-cols-2">
                {plexServers.map((server: any) => (
                    <Card key={server.name} className="h-full">
                        <CardHeader className="pb-3">
                            <div className="flex justify-between items-center">
                                <CardTitle className="flex items-center gap-2 text-base">
                                    <Server className="h-4 w-4 text-muted-foreground"/>
                                    {server.name}
                                </CardTitle>
                                <Badge variant={server.streamCount > 0 ? "default" : "secondary"}>
                                    {server.streamCount} Active
                                </Badge>
                            </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {(!server.sessions || server.sessions.length === 0) ? (
                                <div className="text-xs text-muted-foreground py-6 text-center border border-dashed rounded-lg">
                                    No active streams.
                                </div>
                            ) : (
                                server.sessions.map((session: any) => (
                                    <div key={session.session_id} className="flex gap-3 items-start border-b last:border-0 pb-4">
                                        <div className="flex-shrink-0">
                                            {session.user_thumb ? (
                                                <img src={session.user_thumb} alt="User" className="h-9 w-9 rounded-full object-cover border" />
                                            ) : (
                                                <div className="h-9 w-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                                                    {session.user ? session.user.charAt(0).toUpperCase() : "?"}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex justify-between items-start">
                                                <div className="min-w-0 pr-2">
                                                    <div className="font-semibold text-sm truncate" title={session.full_title || session.title}>
                                                        {session.grandparent_title ? `${session.grandparent_title} - ${session.title}` : session.title}
                                                    </div>
                                                    <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                                                        <Users className="h-3 w-3" /> {session.friendly_name || session.user || "Local User"}
                                                    </div>
                                                </div>
                                                <div className="text-right flex-shrink-0">
                                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 mb-1">
                                                        {getResolutionLabel(session.video_resolution)}
                                                    </Badge>
                                                </div>
                                            </div>
                                            <div className="space-y-1">
                                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                                    <span>{session.state === "playing" ? "Playing" : "Paused"}</span>
                                                    <span>{formatTimeLeft(session.duration - session.view_offset)}</span>
                                                </div>
                                                <Progress value={session.progress_percent} className="h-1" />
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>

        {/* 4. SERVER LIST - Mobile: 1 Col, Tablet: 2, Desktop: 3 */}
        <h3 className="text-lg font-semibold tracking-tight">Infrastructure</h3>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {hardwareNodes.map((node: any) => (
                <Card key={node.id} className="hover:border-primary/50 transition-colors">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                            <Server className="h-4 w-4"/> {node.name}
                        </CardTitle>
                        {node.online ? <Badge variant="outline" className="text-[10px] text-green-600 bg-green-50 px-2 py-0 h-5">Online</Badge> : <Badge variant="destructive" className="text-[10px] h-5">Offline</Badge>}
                    </CardHeader>
                    <CardContent className="space-y-3 p-4 pt-0">
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>CPU</span><span>{node.cpu?.toFixed(1)}%</span>
                            </div>
                            <Progress value={node.cpu} className="h-1.5" />
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                                <span>RAM</span><span>{node.mem?.toFixed(1)}%</span>
                            </div>
                            <Progress value={node.mem} className="h-1.5" />
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t mt-2">
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Activity className="h-3 w-3"/>
                                {formatSpeed(node.rx + node.tx)}
                            </div>
                            <div className="text-xs text-muted-foreground">{node.diskPercent}% Disk</div>
                        </div>
                    </CardContent>
                </Card>
            ))}
        </div>
    </div>
  );
}