"use client"

import { useEffect, useState, useRef } from "react";
import { getDashboardActivity, getServiceStatus } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, CheckCircle2, XCircle, Server, Zap, Info, Play } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
// Graphing Library
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function LiveDashboard({ initialData }: { initialData: any[] }) {
  const [servers, setServers] = useState(initialData || []);
  const [services, setServices] = useState<any[]>([]);
  const [history, setHistory] = useState<any[]>([]);

  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    const fetchData = async () => {
      if (!isMounted.current) return;
      
      try {
        const [serverData, serviceData] = await Promise.all([
             getDashboardActivity(),
             getServiceStatus()
        ]);

        if (isMounted.current) {
            if (serverData) setServers(serverData);
            if (serviceData) setServices(serviceData);

            // Update Graph History
            if (serverData) {
                const now = new Date();
                const timeLabel = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dataPoint: any = { time: timeLabel };
                
                serverData
                    .filter((s: any) => s.type === "hardware" && s.online)
                    .forEach((s: any) => {
                        dataPoint[s.name] = s.cpu || 0;
                    });

                setHistory(prev => {
                    const newHist = [...prev, dataPoint];
                    return newHist.slice(-20); // Keep last 20
                });
            }
        }
      } catch (error) {
        console.error("Polling error:", error);
      } finally {
        if (isMounted.current) setTimeout(fetchData, 5000);
      }
    };

    fetchData();
    return () => { isMounted.current = false; };
  }, []);

  // --- DATA PROCESSING ---
  const hardwareNodes = servers.filter((s: any) => s.type === "hardware");
  const plexNodes = servers.filter((s: any) => s.type === "plex");

  // Calculate Aggregates
  let totalStreams = 0;
  let totalBandwidth = 0;
  let allSessions: any[] = [];

  plexNodes.forEach((s: any) => {
    if (s.online) {
        totalStreams += s.streamCount || 0;
        totalBandwidth += s.wanBandwidth || 0;
        if (s.sessions) {
            const serverSessions = s.sessions.map((sess: any) => ({ 
                ...sess, 
                serverName: s.name 
            }));
            allSessions = [...allSessions, ...serverSessions];
        }
    }
  });

  return (
    <div className="space-y-8">
      
      {/* 1. HARDWARE ROW - 1 Col Mobile, 2 Col Tablet */}
      <div>
        <h2 className="text-lg font-bold tracking-tight mb-4">System Status</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {hardwareNodes.map((node: any) => (
                <Link key={node.name} href={`/monitoring/${node.id}`} className="block group">
                    <Card className="transition-all hover:shadow-md border-l-4 border-l-transparent hover:border-l-primary">
                        <CardContent className="pt-6">
                            <div className="flex justify-between items-start mb-6">
                                <div>
                                    <h3 className="font-semibold text-base flex items-center gap-2">
                                        {node.name}
                                        <span className={`h-2 w-2 rounded-full ${node.online ? "bg-green-500" : "bg-red-500"}`} />
                                    </h3>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-1">
                                        {node.online ? "Online" : "Offline"}
                                    </p>
                                </div>
                                <div className="text-right">
                                    {node.online && (
                                        <>
                                            <div className="text-2xl font-bold">{node.cpu?.toFixed(0) || 0}%</div>
                                            <div className="text-[10px] text-muted-foreground uppercase">CPU Load</div>
                                        </>
                                    )}
                                </div>
                            </div>

                            {node.online ? (
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <div className="flex justify-between text-[10px] mb-1 text-muted-foreground">
                                            <span>RAM</span>
                                            <span>{node.mem?.toFixed(0) || 0}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                            <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${node.mem || 0}%` }} />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex justify-between text-[10px] mb-1 text-muted-foreground">
                                            <span>Disk</span>
                                            <span>{node.diskPercent || 0}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                            <div className={`h-full transition-all duration-500 ${node.diskPercent > 90 ? 'bg-red-500' : 'bg-purple-500'}`} style={{ width: `${node.diskPercent || 0}%` }} />
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="h-8 flex items-center text-xs text-red-400 bg-red-50 rounded px-2">
                                    <Info className="h-3 w-3 mr-2" /> Connection Lost
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </Link>
            ))}
        </div>
      </div>

      {/* 2. MEDIA ACTIVITY ROW */}
      <div>
         <h2 className="text-lg font-bold tracking-tight mb-4 flex items-center gap-2">
            Media Activity
            {totalStreams > 0 && (
                <Badge variant="secondary" className="bg-green-100 text-green-800 hover:bg-green-200 text-xs px-2 py-0">
                    {totalStreams} Active
                </Badge>
            )}
         </h2>
         <div className="grid gap-6 md:grid-cols-3">
             {/* Stats Cards */}
             <div className="md:col-span-1 grid grid-cols-2 md:grid-cols-1 gap-4">
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Total Streams</CardTitle>
                        <Play className="h-3 w-3 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-xl font-bold">{totalStreams}</div>
                        <p className="text-[10px] text-muted-foreground">Across {plexNodes.length} servers</p>
                    </CardContent>
                 </Card>
                 <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-4">
                        <CardTitle className="text-xs font-medium text-muted-foreground">Bandwidth</CardTitle>
                        <Zap className="h-3 w-3 text-muted-foreground" />
                    </CardHeader>
                    <CardContent className="p-4 pt-0">
                        <div className="text-xl font-bold">{(totalBandwidth / 1000).toFixed(1)} Mbps</div>
                        <p className="text-[10px] text-muted-foreground">Upload Usage</p>
                    </CardContent>
                 </Card>
             </div>

             {/* Now Playing List */}
             <Card className="col-span-2 md:col-span-2">
                <CardHeader>
                    <CardTitle className="text-base">Now Playing</CardTitle>
                </CardHeader>
                <CardContent>
                    {allSessions.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground border-dashed border-2 rounded-lg text-xs">
                            No active streams right now.
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {allSessions.map((session, i) => (
                                <div key={session.session_id + i} className="flex items-center justify-between border-b pb-3 last:border-0 last:pb-0">
                                    <div className="flex items-center space-x-3">
                                        <div className="flex-shrink-0">
                                            <Avatar className="h-8 w-8">
                                                <AvatarImage src={session.user_thumb} />
                                                <AvatarFallback>{session.user ? session.user[0] : "?"}</AvatarFallback>
                                            </Avatar>
                                        </div>
                                        <div className="space-y-0.5 min-w-0">
                                            <p className="text-sm font-medium leading-none truncate max-w-[150px] sm:max-w-xs">{session.user}</p>
                                            <p className="text-xs text-muted-foreground truncate max-w-[150px] sm:max-w-xs">
                                                {session.full_title || session.title}
                                            </p>
                                            <div className="flex items-center text-[10px] text-muted-foreground space-x-2">
                                                <Badge variant="outline" className="text-[9px] h-4 px-1">{session.serverName}</Badge>
                                                <span className="hidden sm:inline">{session.quality_profile}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right text-[10px] text-muted-foreground flex-shrink-0">
                                        <div>{session.transcode_decision === "direct play" ? "Direct" : "Transcode"}</div>
                                        <div>{session.progress_percent}%</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
             </Card>
         </div>
      </div>

      {/* 3. GRAPHS & SERVICES ROW */}
      <div className="grid gap-6 md:grid-cols-3">
         
         {/* CPU Graph */}
         <div className="md:col-span-2">
            <Card className="h-full flex flex-col">
                <CardHeader>
                    <CardTitle className="text-sm font-medium">CPU Load History</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-[200px]">
                    {history.length > 2 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={history}>
                                <defs>
                                    <linearGradient id="colorCpu1" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="colorCpu2" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <XAxis dataKey="time" hide />
                                <YAxis hide domain={[0, 100]} />
                                <Tooltip 
                                    contentStyle={{ backgroundColor: "#1f2937", border: "none", borderRadius: "8px", color: "#fff" }}
                                    itemStyle={{ fontSize: "12px" }}
                                />
                                {hardwareNodes.map((node: any, index: number) => (
                                    <Area 
                                        key={node.name}
                                        type="monotone" 
                                        dataKey={node.name} 
                                        stroke={index === 0 ? "#3b82f6" : "#10b981"} 
                                        fillOpacity={1} 
                                        fill={`url(#colorCpu${index === 0 ? 1 : 2})`} 
                                        strokeWidth={2}
                                    />
                                ))}
                            </AreaChart>
                        </ResponsiveContainer>
                    ) : (
                         <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                            Gathering metrics...
                        </div>
                    )}
                </CardContent>
            </Card>
         </div>

         {/* Services List */}
         <div className="md:col-span-1">
            <Card className="h-full">
                <CardHeader>
                    <CardTitle className="text-sm font-medium">Service Health</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {services.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground text-xs">
                                <p>No services tracked.</p>
                            </div>
                        ) : (
                            services.map((svc) => (
                                <div key={svc.id} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-1.5 rounded-full ${svc.online ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"}`}>
                                            <Server className="h-3 w-3" />
                                        </div>
                                        <span className="text-xs font-medium">{svc.name}</span>
                                    </div>
                                    
                                    {svc.online ? (
                                        <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50 text-[10px] px-1.5 h-5">
                                            Online
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-red-600 border-red-200 bg-red-50 text-[10px] px-1.5 h-5">
                                            Offline
                                        </Badge>
                                    )}
                                </div>
                            ))
                        )}
                    </div>
                </CardContent>
            </Card>
         </div>
      </div>

    </div>
  );
}