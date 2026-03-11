"use client"

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { getGlancesNodeDetails } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    Activity, HardDrive, Thermometer, Clock, Cpu, 
    AlertTriangle, Network, RefreshCw, ArrowLeft, Container 
} from "lucide-react";

export default function ServerDetailView({ data: initialData }: { data: any }) {
  const [data, setData] = useState(initialData);
  const [isOffline, setIsOffline] = useState(!initialData.online);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
        try {
            const freshData = await getGlancesNodeDetails(data.id);
            if (freshData) {
                setData(freshData);
                setIsOffline(!freshData.online);
            } else {
                setIsOffline(true);
            }
        } catch (error) { console.error(error); }
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [data.id]);

  const formatSpeed = (val: any) => {
      if (val === undefined || val === null || isNaN(val)) return "0.0";
      return (val / 1048576).toFixed(1); // MB/s
  };

  const interfaces = Array.isArray(data.network)
    ? data.network.filter((n: any) => {
        const name = n.interface_name;
        return (
            name !== "lo" && 
            name !== "tunl0" && 
            name !== "docker0" &&
            !name.startsWith("veth") && 
            !name.startsWith("br") &&    
            !name.startsWith("bond")     
        );
    })
    : [];

  const tempSensors = Array.isArray(data.sensors) ? data.sensors : [];
  
  const fileSystems = Array.isArray(data.fs) ? data.fs.filter((f: any) => {
      const p = f.mnt_point;
      if (p.includes("/docker/")) return false;
      if (p.includes("/containers/")) return false;
      if (p.startsWith("/boot")) return false;
      if (p.startsWith("/efi")) return false;
      if (p.startsWith("/proc")) return false;
      if (p.startsWith("/sys")) return false;
      if (p.startsWith("/run")) return false;
      if (p.startsWith("/dev")) return false;
      if (p.startsWith("/etc")) return false;
      return true; 
  }).sort((a: any, b: any) => {
      if (a.mnt_point === "/mnt/user") return -1;
      if (b.mnt_point === "/mnt/user") return 1;
      return 0;
  }) : [];

  const getDiskLabel = (path: string) => {
      if (path === "/") return "System Drive";
      if (path === "/mnt/user") return "Unraid Array";
      if (path.startsWith("/mnt/cache")) return "Cache Drive";
      return path.replace("/rootfs", "") || path;
  };

  if (isOffline) {
      return (
          <Card className="border-red-200 bg-red-50 mt-4">
              <CardContent className="pt-6 text-center text-red-600">
                  <AlertTriangle className="h-10 w-10 mx-auto mb-2" />
                  <p>System is unreachable at <strong>{data.url}</strong></p>
              </CardContent>
          </Card>
      );
  }

  // --- SMART DOCKER PARSER ---
  const containers = Array.isArray(data.docker) ? data.docker.map((c: any) => {
      // 1. Name: Try 'name' string, then 'names' array
      let name = c.name;
      if (!name && Array.isArray(c.names) && c.names.length > 0) name = c.names[0];
      if (!name) name = "Unknown";

      // 2. Status: Try 'Status', 'status', 'State', 'state'
      const rawStatus = c.Status || c.status || c.State || c.state || "Unknown";
      
      // 3. Image: Try 'Image', 'image'
      const image = c.Image || c.image || "Unknown";

      // 4. Memory: If percent is 0, try to calculate from usage/limit if available
      let mem = c.memory_percent || 0;
      if (mem === 0 && c.memory?.usage && c.memory?.limit) {
          mem = (c.memory.usage / c.memory.limit) * 100;
      }

      return { ...c, name, status: rawStatus, image, calculated_mem: mem };
  }) : [];

  return (
    <div className="space-y-6 relative mt-2">
      <div className="absolute top-[-3rem] right-0 flex items-center text-xs text-muted-foreground animate-pulse">
          <RefreshCw className="h-3 w-3 mr-1" /> Live Updates (1s)
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">CPU</CardTitle><Cpu className="h-4 w-4 text-muted-foreground"/></CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{data.cpu?.total || 0}%</div>
                <Progress value={data.cpu?.total || 0} className="h-2 mt-2" />
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">RAM</CardTitle><Activity className="h-4 w-4 text-muted-foreground"/></CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{data.mem?.percent || 0}%</div>
                <Progress value={data.mem?.percent || 0} className="h-2 mt-2" />
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Load</CardTitle><Activity className="h-4 w-4 text-muted-foreground"/></CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{data.load?.min1?.toFixed(2) || 0}</div>
                <div className="text-xs text-muted-foreground mt-2">1 min avg</div>
            </CardContent>
        </Card>
        <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Uptime</CardTitle><Clock className="h-4 w-4 text-muted-foreground"/></CardHeader>
            <CardContent><div className="text-xl font-bold truncate">{data.uptime}</div></CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="docker">Docker</TabsTrigger>
            <TabsTrigger value="processes">Processes</TabsTrigger>
            <TabsTrigger value="disks">S.M.A.R.T.</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader><CardTitle className="flex gap-2"><HardDrive className="h-4 w-4"/> Storage</CardTitle></CardHeader>
                    <CardContent className="space-y-4 max-h-[350px] overflow-y-auto">
                        {fileSystems.length === 0 ? (
                            <div className="text-sm text-muted-foreground italic">No disks found.</div>
                        ) : (
                            fileSystems.map((d: any) => (
                                <div key={d.mnt_point} className="space-y-1">
                                    <div className="flex justify-between text-sm">
                                        <span className="truncate max-w-[150px] font-medium" title={d.mnt_point}>
                                            {getDiskLabel(d.mnt_point)}
                                        </span>
                                        <span>{d.percent}%</span>
                                    </div>
                                    <Progress value={d.percent} className="h-2" />
                                    <div className="text-[10px] text-muted-foreground text-right">
                                        {(d.free / 1024 / 1024 / 1024).toFixed(0)} GB Free
                                    </div>
                                </div>
                            ))
                        )}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex gap-2"><Network className="h-4 w-4"/> Network</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                        {interfaces.map((net: any) => {
                            const dl = net.bytes_recv_rate_per_sec || net.rx || 0;
                            const ul = net.bytes_sent_rate_per_sec || net.tx || 0;
                            return (
                                <div key={net.interface_name} className="flex justify-between border-b pb-2 last:border-0">
                                    <div>
                                        <div className="font-medium text-sm">{net.interface_name}</div>
                                        <div className="text-[10px] text-muted-foreground">{net.ip || net.address || "Virtual"}</div>
                                    </div>
                                    <div className="text-right text-xs">
                                        <div className="text-green-600">↓ {formatSpeed(dl)} MB/s</div>
                                        <div className="text-blue-600">↑ {formatSpeed(ul)} MB/s</div>
                                    </div>
                                </div>
                            );
                        })}
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="flex gap-2"><Thermometer className="h-4 w-4"/> Temps</CardTitle></CardHeader>
                    <CardContent className="space-y-2 max-h-[350px] overflow-y-auto">
                        {tempSensors.map((s: any, i: number) => (
                            <div key={i} className="flex justify-between text-sm border-b pb-1 last:border-0">
                                <span className="truncate max-w-[150px]">{s.label}</span>
                                <span className={s.value > 80 ? "text-red-500 font-bold" : "text-green-600"}>{s.value}°C</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            </div>
        </TabsContent>

        <TabsContent value="docker">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Container className="h-4 w-4"/> Docker Containers
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {containers.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No container data available. (Check API: /api/4/containers)
                        </div>
                    ) : (
                        <div className="relative overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs uppercase bg-muted/50">
                                    <tr>
                                        <th className="px-4 py-2">Name</th>
                                        <th className="px-4 py-2">Image</th>
                                        <th className="px-4 py-2">Status</th>
                                        <th className="px-4 py-2 text-right">CPU%</th>
                                        <th className="px-4 py-2 text-right">Mem%</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {containers.map((c: any, i: number) => (
                                        <tr key={i} className="border-b last:border-0 hover:bg-muted/50 transition-colors">
                                            <td className="px-4 py-2 font-medium truncate max-w-[200px]" title={c.name}>{c.name}</td>
                                            <td className="px-4 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{c.image}</td>
                                            <td className="px-4 py-2">
                                                <Badge variant="outline" className={String(c.status).toLowerCase().includes('running') || String(c.status).toLowerCase().includes('up') ? 'text-green-600 bg-green-50 border-green-200' : 'text-red-500 border-red-200'}>
                                                    {c.status}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-2 text-right font-mono">{c.cpu_percent?.toFixed(1) || 0}%</td>
                                            <td className="px-4 py-2 text-right font-mono">{c.calculated_mem?.toFixed(1) || 0}%</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </TabsContent>

        <TabsContent value="processes">
            <Card>
                <CardHeader><CardTitle>Top Processes</CardTitle></CardHeader>
                <CardContent>
                    <div className="relative overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs uppercase bg-muted/50">
                                <tr><th className="px-4 py-2">PID</th><th className="px-4 py-2">Name</th><th className="px-4 py-2 text-right">CPU%</th></tr>
                            </thead>
                            <tbody>
                                {data.processes?.map((p: any) => (
                                    <tr key={p.pid} className="border-b last:border-0">
                                        <td className="px-4 py-2 font-mono">{p.pid}</td>
                                        <td className="px-4 py-2 truncate max-w-[200px]">{p.name}</td>
                                        <td className="px-4 py-2 text-right">{p.cpu_percent.toFixed(1)}%</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
        
        <TabsContent value="disks">
            <Card>
                <CardHeader><CardTitle>Drive Health</CardTitle></CardHeader>
                <CardContent>
                    <div className="grid gap-4 sm:grid-cols-2">
                        {data.smart?.map((d: any, i: number) => (
                            <div key={i} className="border p-3 rounded flex justify-between items-center">
                                <div>
                                    <div className="font-mono text-xs">{d.device}</div>
                                    <div className="text-sm font-medium">{d.model}</div>
                                </div>
                                <Badge variant={d.passed ? "outline" : "destructive"}>{d.passed ? "OK" : "FAIL"}</Badge>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}