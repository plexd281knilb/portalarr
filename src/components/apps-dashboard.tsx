"use client"

import { useState, useEffect, useRef } from "react";
import { getMediaAppsActivity } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { 
    Download, Film, Tv, Users, Wrench, 
    Pause, Play, HardDrive, ExternalLink 
} from "lucide-react";

// --- HELPER COMPONENT: THE OPEN BUTTON ---
function OpenButton({ app }: { app: any }) {
    const linkUrl = app.externalUrl || app.url || "";
    
    if (!linkUrl) {
        return (
            <Button size="sm" variant="outline" disabled className="gap-2 h-7 text-[10px] px-2 opacity-50">
                Open <ExternalLink className="h-3 w-3" />
            </Button>
        );
    }

    return (
        <Link href={linkUrl} target="_blank">
            <Button size="sm" variant="outline" className="gap-2 h-7 text-[10px] px-2">
                Open <ExternalLink className="h-3 w-3" />
            </Button>
        </Link>
    );
}

export default function AppsDashboard({ initialData }: { initialData: any[] }) {
  const [apps, setApps] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    intervalRef.current = setInterval(async () => {
        try {
            setLoading(true);
            const fresh = await getMediaAppsActivity();
            if (fresh) setApps(fresh);
        } catch(e) { console.error(e); } 
        finally { setLoading(false); }
    }, 2000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const formatMb = (input: any) => {
      const num = typeof input === "string" ? parseFloat(input) : input;
      if (typeof num !== "number" || isNaN(num)) return "0 MB";
      if (num > 1000000) return `${(num / 1000000).toFixed(2)} TB`;
      if (num > 1000) return `${(num / 1000).toFixed(2)} GB`;
      return `${num.toFixed(0)} MB`;
  };

  const getPosterUrl = (posterPath: string) => {
      if (!posterPath) return null;
      if (posterPath.startsWith("http")) return posterPath;
      return `https://image.tmdb.org/t/p/w200${posterPath}`;
  };

  // Groupings
  const downloaders = apps.filter(a => ["sabnzbd", "nzbget"].includes(a.type));
  const movies = apps.filter(a => a.type === "radarr");
  const tv = apps.filter(a => a.type === "sonarr");
  const requests = apps.filter(a => ["overseerr", "jellyseerr", "ombi"].includes(a.type));
  const maintenance = apps.filter(a => ["bazarr", "prowlarr", "readarr", "lidarr", "maintainerr"].includes(a.type));

  return (
    <div className="space-y-6">
       <div className="flex justify-end h-4">
           {loading && <Badge variant="outline" className="text-[10px] border-transparent text-muted-foreground animate-pulse">Updating...</Badge>}
       </div>

       <Tabs defaultValue="downloads" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3 lg:grid-cols-5 h-auto p-1 gap-1">
                <TabsTrigger value="downloads" className="text-xs px-1 py-2"><Download className="h-3 w-3 mr-1.5"/> Downloads</TabsTrigger>
                <TabsTrigger value="movies" className="text-xs px-1 py-2"><Film className="h-3 w-3 mr-1.5"/> Movies</TabsTrigger>
                <TabsTrigger value="tv" className="text-xs px-1 py-2"><Tv className="h-3 w-3 mr-1.5"/> TV</TabsTrigger>
                <TabsTrigger value="requests" className="text-xs px-1 py-2"><Users className="h-3 w-3 mr-1.5"/> Requests</TabsTrigger>
                <TabsTrigger value="maintenance" className="text-xs px-1 py-2"><Wrench className="h-3 w-3 mr-1.5"/> Utility</TabsTrigger>
            </TabsList>

            {/* 1. DOWNLOADS */}
            <TabsContent value="downloads" className="space-y-6">
                {downloaders.length === 0 && <div className="text-muted-foreground p-4 text-sm text-center">No download clients configured.</div>}
                {downloaders.map(app => (
                    <Card key={app.id}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                                {app.name}
                                {app.online ? <span className="h-2 w-2 rounded-full bg-green-500"/> : <span className="h-2 w-2 rounded-full bg-red-500"/>}
                            </CardTitle>
                            <div className="flex items-center gap-3">
                                {app.online && (
                                    <div className="text-right hidden sm:block">
                                        <div className="text-lg font-bold leading-none">{app.stats.speed}</div>
                                        <div className="text-[10px] text-muted-foreground">{app.stats.timeleft}</div>
                                    </div>
                                )}
                                <OpenButton app={app} />
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {!app.online ? <div className="text-sm text-red-500">Connection Failed</div> : (
                                <div className="space-y-4">
                                    <div className="flex justify-between text-xs text-muted-foreground border-b pb-2">
                                        <span className="flex items-center"><HardDrive className="h-3 w-3 mr-1"/> {formatMb(app.stats.mbleft)}</span>
                                        <span className="flex items-center">
                                            {app.stats.paused ? <Pause className="h-3 w-3 mr-1 text-yellow-500"/> : <Play className="h-3 w-3 mr-1 text-green-500"/>}
                                            {app.stats.paused ? "Paused" : "Active"}
                                        </span>
                                        <span className="sm:hidden font-mono text-foreground">{app.stats.speed}</span>
                                    </div>
                                    <div className="space-y-3">
                                        {app.queue.length === 0 ? <div className="text-xs italic text-muted-foreground text-center py-2">Queue is empty.</div> : app.queue.map((item: any, i: number) => (
                                            <div key={item.nzo_id || i} className="space-y-1">
                                                <div className="flex justify-between text-xs font-medium">
                                                    <span className="truncate max-w-[70%]">{item.filename}</span>
                                                    <span>{item.percentage}%</span>
                                                </div>
                                                <Progress value={Number(item.percentage)} className="h-1.5" />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </TabsContent>

            {/* 2. MOVIES */}
            <TabsContent value="movies" className="grid gap-4 md:grid-cols-2">
                {movies.map(app => (
                    <Card key={app.id}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
                            <CardTitle className="text-base">{app.name}</CardTitle>
                            <OpenButton app={app} />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {!app.online ? <div className="text-red-500 text-xs">Offline</div> : (
                                <div className="space-y-3">
                                    {app.queue.length === 0 ? <div className="text-xs text-muted-foreground italic text-center py-2">No active downloads.</div> : 
                                        app.queue.map((item: any) => (
                                            <div key={item.id} className="border-b last:border-0 pb-2">
                                                <div className="text-xs font-medium truncate">{item.title}</div>
                                                <Progress value={100 - (item.sizeleft / item.size * 100)} className="h-1 mt-1.5" />
                                            </div>
                                        ))
                                    }
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </TabsContent>

            {/* 3. TV */}
            <TabsContent value="tv" className="grid gap-4 md:grid-cols-2">
                {tv.map(app => (
                    <Card key={app.id}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
                            <CardTitle className="text-base">{app.name}</CardTitle>
                            <OpenButton app={app} />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                             {!app.online ? <div className="text-red-500 text-xs">Offline</div> : (
                                <div className="space-y-3">
                                    {app.queue.length === 0 ? <div className="text-xs text-muted-foreground italic text-center py-2">No active downloads.</div> : 
                                        app.queue.map((item: any) => (
                                            <div key={item.id} className="border-b last:border-0 pb-2">
                                                <div className="text-xs font-medium truncate">{item.title}</div>
                                                <div className="text-[10px] text-muted-foreground truncate">{item.episode?.title}</div>
                                            </div>
                                        ))
                                    }
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </TabsContent>

            {/* 4. REQUESTS - UPDATED FOR TEXT WRAPPING */}
            <TabsContent value="requests" className="space-y-6">
                {requests.map(app => (
                    <Card key={app.id}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
                            <CardTitle className="text-base">{app.name}</CardTitle>
                            <OpenButton app={app} />
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {!app.online ? <div className="text-red-500 text-xs">Offline</div> : (
                                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                    {(!app.requests || app.requests.length === 0) ? (
                                        <div className="text-xs italic text-muted-foreground p-2 text-center">No active requests found.</div>
                                    ) : (
                                        app.requests.map((req: any) => (
                                            <div key={req.id} className="flex items-start space-x-3 border p-2 rounded bg-muted/20">
                                                {/* IMAGE RENDERING */}
                                                <div className="flex-shrink-0">
                                                    {req.media?.posterPath ? (
                                                        <img 
                                                            src={getPosterUrl(req.media.posterPath)!} 
                                                            className="w-8 h-12 object-cover rounded shadow"
                                                            alt="poster"
                                                        />
                                                    ) : (
                                                        <div className="w-8 h-12 bg-gray-200 rounded flex items-center justify-center text-[10px] text-gray-400">?</div>
                                                    )}
                                                </div>
                                                
                                                {/* CONTENT - Allow Wrapping */}
                                                <div className="flex-1 min-w-0">
                                                    {/* Removed truncate, added leading-tight */}
                                                    <div className="text-sm font-semibold leading-tight mb-0.5">
                                                        {req.media?.title || "Unknown"}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground truncate">
                                                        {req.requestedBy?.displayName}
                                                    </div>
                                                    <Badge variant={req.status === 2 ? "secondary" : "outline"} className={`mt-1.5 text-[9px] px-1.5 py-0 h-4 ${req.status === 2 ? "bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400" : ""}`}>
                                                        {req.status === 2 ? "Approved" : "Pending"}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </TabsContent>

            {/* 5. UTILITY */}
            <TabsContent value="maintenance" className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {maintenance.length === 0 && <div className="col-span-full text-muted-foreground p-4 text-center text-sm">No utility apps configured.</div>}
                {maintenance.map(app => (
                    <Card key={app.id}>
                        <CardHeader className="flex flex-row items-center justify-between pb-2 p-4">
                            <CardTitle className="text-sm font-semibold">{app.name}</CardTitle>
                            <div className="flex items-center gap-2">
                                {app.online ? <span className="h-2 w-2 rounded-full bg-green-500"/> : <span className="h-2 w-2 rounded-full bg-red-500"/>}
                                <OpenButton app={app} />
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-0">
                            {app.type === "prowlarr" && (
                                <div className="text-center py-1">
                                    <div className="text-xl font-bold">{app.stats?.total || 0}</div>
                                    <div className="text-[10px] text-muted-foreground uppercase">Indexers</div>
                                    {app.stats?.failed > 0 && <div className="text-[10px] text-red-500 mt-1">{app.stats.failed} Failed</div>}
                                </div>
                            )}
                            {app.type === "bazarr" && (
                                <div className="text-center py-1">
                                    <div className="text-xs font-medium">Subtitles Service</div>
                                    <div className="text-[10px] text-muted-foreground">v{app.stats?.version || "?"}</div>
                                </div>
                            )}
                             {!["prowlarr", "bazarr"].includes(app.type) && (
                                <div className="text-center py-1 text-xs text-muted-foreground">
                                    {app.online ? "Monitoring active" : "Check Config"}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                ))}
            </TabsContent>
       </Tabs>
    </div>
  );
}