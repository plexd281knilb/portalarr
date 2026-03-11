import { 
  fetchDashboardData, 
  fetchServiceHealth, 
  fetchMediaAppsActivity // <--- Import this
} from "@/app/data";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
    Server, Activity, Network, CheckCircle2, 
    XCircle, ArrowRight, HardDrive, Cpu 
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MonitoringLandingPage() {
  const [dashboardData, services, mediaApps] = await Promise.all([
      fetchDashboardData(),
      fetchServiceHealth(),
      fetchMediaAppsActivity() // <--- Fetch App Data
  ]);

  const hardwareNodes = dashboardData.filter((d: any) => d.type === "hardware");
  const plexNodes = dashboardData.filter((d: any) => d.type === "plex");

  return (
    <div className="flex-1 space-y-6 p-8 pt-6">
      <div className="flex items-center justify-between">
          <h2 className="text-3xl font-bold tracking-tight">Monitoring Overview</h2>
      </div>

      {/* 1. SERVERS GRID */}
      <h3 className="text-lg font-medium text-muted-foreground mt-4 flex items-center gap-2">
          <Server className="h-4 w-4" /> Servers ({hardwareNodes.length})
      </h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {hardwareNodes.length === 0 ? (
            <div className="col-span-full p-8 border border-dashed rounded-lg text-center text-muted-foreground">
                No servers configured.
            </div>
        ) : (
            hardwareNodes.map((node: any) => (
                <Link key={node.id} href={`/monitoring/${node.id}`} className="group block">
                    <Card className="transition-all hover:border-primary">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-base font-medium flex items-center gap-2">
                                {node.name}
                            </CardTitle>
                            {node.online ? (
                                <Badge variant="outline" className="text-green-600 bg-green-50 border-green-200">
                                    Online
                                </Badge>
                            ) : (
                                <Badge variant="destructive">Offline</Badge>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-4 pt-4">
                             {node.online ? (
                                <>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><Cpu className="h-3 w-3"/> CPU</span>
                                            <span className={node.cpu > 80 ? "text-red-500 font-bold" : ""}>{node.cpu.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                            <div className={`h-full ${node.cpu > 80 ? "bg-red-500" : "bg-blue-500"}`} style={{ width: `${node.cpu}%` }} />
                                        </div>
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex justify-between text-xs text-muted-foreground">
                                            <span className="flex items-center gap-1"><Activity className="h-3 w-3"/> RAM</span>
                                            <span className={node.mem > 90 ? "text-red-500 font-bold" : ""}>{node.mem.toFixed(1)}%</span>
                                        </div>
                                        <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                                            <div className={`h-full ${node.mem > 90 ? "bg-red-500" : "bg-purple-500"}`} style={{ width: `${node.mem}%` }} />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-end mt-2">
                                        <span className="text-xs text-muted-foreground flex items-center group-hover:text-primary transition-colors">
                                            View Details <ArrowRight className="ml-1 h-3 w-3" />
                                        </span>
                                    </div>
                                </>
                             ) : (
                                <div className="text-sm text-muted-foreground italic py-4 text-center">
                                    Connection lost. Check server logs.
                                </div>
                             )}
                        </CardContent>
                    </Card>
                </Link>
            ))
        )}
      </div>

      {/* 2. SERVICES & PLEX ROW */}
      <div className="grid gap-6 md:grid-cols-2">
          
          {/* Service Health List (Includes Apps + Pings) */}
          <Card>
              <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                      <Network className="h-5 w-5" /> Service Status
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="space-y-4">
                      {/* 1. MEDIA APPS SECTION */}
                      {mediaApps.map((app: any) => (
                          <div key={app.id} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                              <div>
                                  <div className="font-medium">{app.name}</div>
                                  <div className="text-xs text-muted-foreground capitalize">{app.type}</div>
                              </div>
                              {app.online ? (
                                  <div className="flex items-center text-xs text-green-600 font-medium">
                                      <CheckCircle2 className="mr-1 h-4 w-4" /> Running
                                  </div>
                              ) : (
                                  <div className="flex items-center text-xs text-red-600 font-medium">
                                      <XCircle className="mr-1 h-4 w-4" /> Down
                                  </div>
                              )}
                          </div>
                      ))}

                      {/* 2. MANUAL PINGS SECTION */}
                      {services.map((svc: any) => (
                          <div key={svc.id} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                              <div className="font-medium">{svc.name}</div>
                              {svc.online ? (
                                  <div className="flex items-center text-xs text-green-600 font-medium">
                                      <CheckCircle2 className="mr-1 h-4 w-4" /> Reachable
                                  </div>
                              ) : (
                                  <div className="flex items-center text-xs text-red-600 font-medium">
                                      <XCircle className="mr-1 h-4 w-4" /> Offline
                                  </div>
                              )}
                          </div>
                      ))}

                      {/* Empty State */}
                      {mediaApps.length === 0 && services.length === 0 && (
                          <div className="text-center text-muted-foreground text-sm py-4">
                              No services or apps monitored.
                          </div>
                      )}
                  </div>
              </CardContent>
          </Card>

          {/* Plex Instances */}
          <Card>
              <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="h-5 w-5" /> Plex Nodes
                  </CardTitle>
              </CardHeader>
              <CardContent>
                  <div className="space-y-4">
                      {plexNodes.length === 0 ? (
                          <div className="text-center text-muted-foreground text-sm py-4">
                              No Tautulli instances connected.
                          </div>
                      ) : (
                          plexNodes.map((plex: any) => (
                              <div key={plex.name} className="flex items-center justify-between border-b last:border-0 pb-3 last:pb-0">
                                  <div>
                                      <div className="font-medium">{plex.name}</div>
                                      <div className="text-xs text-muted-foreground">
                                          {plex.online ? `${plex.streamCount} active streams` : "Unreachable"}
                                      </div>
                                  </div>
                                  {plex.online ? (
                                      <Badge variant="outline" className="text-blue-600 bg-blue-50 border-blue-200">
                                          Connected
                                      </Badge>
                                  ) : (
                                      <Badge variant="destructive">Error</Badge>
                                  )}
                              </div>
                          ))
                      )}
                  </div>
              </CardContent>
          </Card>
      </div>
    </div>
  );
}