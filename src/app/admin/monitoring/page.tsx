"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import Link from "next/link";
import { 
    getFleetMonitoringDataAction, 
    restartDockerContainerAction, 
    stopDockerContainerAction, 
    startDockerContainerAction,
    getMonitoringConfigAction,
    saveMonitoringConfigAction,
    sendTestOutageAlertAction,
    clearResolvedIncidentsAction
} from "@/app/actions";
import type { 
    DockerContainerItem, 
    DockerFleetSummary, 
    IncidentRecord, 
    MonitoringConfig, 
    ServiceUptimeSummary 
} from "@/lib/monitoring/types";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
    Activity, Server, Cpu, RefreshCw, Layers, ShieldCheck, 
    AlertTriangle, CheckCircle2, PauseCircle, ExternalLink, 
    Search, Terminal, Play, Square, Bell, Settings, ArrowDownCircle,
    Check, X, HardDrive, Clock, Flame, Radio, Zap,
    Tv, Film, Image, FileText, BarChart2, Database, Shield, Box, Home, ArrowUpDown
} from "lucide-react";

interface AppBranding {
    icon: any;
    color: string;
    bg: string;
    border: string;
}

function getContainerAppBranding(name: string, image: string): AppBranding {
    const combined = `${name || ""} ${image || ""}`.toLowerCase();

    if (combined.includes("plex")) {
        return { icon: Film, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" };
    }
    if (combined.includes("sonarr")) {
        return { icon: Tv, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30" };
    }
    if (combined.includes("radarr")) {
        return { icon: Film, color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/30" };
    }
    if (combined.includes("sabnzbd")) {
        return { icon: ArrowDownCircle, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" };
    }
    if (combined.includes("qbit") || combined.includes("torrent")) {
        return { icon: ArrowDownCircle, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" };
    }
    if (combined.includes("nzbget")) {
        return { icon: ArrowDownCircle, color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/30" };
    }
    if (combined.includes("bazarr")) {
        return { icon: FileText, color: "text-teal-400", bg: "bg-teal-500/10", border: "border-teal-500/30" };
    }
    if (combined.includes("prowlarr")) {
        return { icon: Radio, color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/30" };
    }
    if (combined.includes("tautulli")) {
        return { icon: Activity, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" };
    }
    if (combined.includes("immich") || combined.includes("photo")) {
        return { icon: Image, color: "text-purple-400", bg: "bg-purple-500/10", border: "border-purple-500/30" };
    }
    if (combined.includes("grafana")) {
        return { icon: BarChart2, color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30" };
    }
    if (combined.includes("teslamate")) {
        return { icon: Zap, color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30" };
    }
    if (combined.includes("glances")) {
        return { icon: Cpu, color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/30" };
    }
    if (combined.includes("diskspeed") || combined.includes("disk")) {
        return { icon: HardDrive, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" };
    }
    if (combined.includes("overseerr") || combined.includes("seerr") || combined.includes("jellyseerr")) {
        return { icon: Layers, color: "text-indigo-400", bg: "bg-indigo-500/10", border: "border-indigo-500/30" };
    }
    if (combined.includes("pihole") || combined.includes("adguard") || combined.includes("vaultwarden")) {
        return { icon: Shield, color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30" };
    }
    if (combined.includes("homeassistant") || combined.includes("hass")) {
        return { icon: Home, color: "text-sky-400", bg: "bg-sky-500/10", border: "border-sky-500/30" };
    }
    if (combined.includes("postgres") || combined.includes("redis") || combined.includes("mariadb") || combined.includes("mysql") || combined.includes("mongo")) {
        return { icon: Database, color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30" };
    }
    return { icon: Box, color: "text-slate-400", bg: "bg-slate-500/10", border: "border-slate-500/30" };
}

export default function AdminFleetMonitoringPage() {
    const [activeTab, setActiveTab] = useState<"systems" | "containers" | "incidents">("systems");
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [isPending, startTransition] = useTransition();

    // Data state
    const [services, setServices] = useState<ServiceUptimeSummary[]>([]);
    const [containers, setContainers] = useState<DockerContainerItem[]>([]);
    const [fleetSummary, setFleetSummary] = useState<DockerFleetSummary>({
        totalContainers: 0,
        runningCount: 0,
        stoppedCount: 0,
        unhealthyCount: 0,
        restartingCount: 0,
        source: "Connecting...",
        serverTime: new Date().toISOString()
    });
    const [incidents, setIncidents] = useState<IncidentRecord[]>([]);
    const [activeIncidentsCount, setActiveIncidentsCount] = useState(0);
    const [overall24h, setOverall24h] = useState(100);
    const [overall7d, setOverall7d] = useState(100);
    const [lastProbeTime, setLastProbeTime] = useState<string>("");

    // Action feedback states
    const [containerActionLoading, setContainerActionLoading] = useState<Record<string, boolean>>({});
    const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    // Filter states: Systems
    const [systemStatusFilter, setSystemStatusFilter] = useState<"ALL" | "ONLINE" | "OFFLINE" | "PAUSED">("ALL");
    const [systemCategoryFilter, setSystemCategoryFilter] = useState("ALL");
    const [systemSearch, setSystemSearch] = useState("");

    // Filter states: Containers
    const [containerStateFilter, setContainerStateFilter] = useState<"ALL" | "running" | "exited" | "unhealthy">("ALL");
    const [containerSearch, setContainerSearch] = useState("");
    const [containerSort, setContainerSort] = useState<"name_asc" | "cpu_desc" | "mem_desc">("name_asc");

    // Alert config states
    const [config, setConfig] = useState<MonitoringConfig | null>(null);
    const [webhookUrlInput, setWebhookUrlInput] = useState("");
    const [savingConfig, setSavingConfig] = useState(false);
    const [testingAlert, setTestingAlert] = useState(false);

    const showToast = (text: string, type: "success" | "error" = "success") => {
        setToastMessage({ text, type });
        setTimeout(() => setToastMessage(null), 4000);
    };

    const loadData = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await getFleetMonitoringDataAction();
            if (res && res.success) {
                setServices(res.services);
                setContainers(res.containers);
                setFleetSummary(res.fleetSummary);
                setIncidents(res.incidents);
                setActiveIncidentsCount(res.activeIncidentsCount);
                setOverall24h(res.overallUptime24h);
                setOverall7d(res.overallUptime7d);
                setLastProbeTime(res.lastProbeTime);
            }
        } catch (err) {
            console.error("Failed to load fleet monitoring telemetry:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const loadConfig = async () => {
        try {
            const cfg = await getMonitoringConfigAction();
            if (cfg) {
                setConfig(cfg);
                setWebhookUrlInput(cfg.discordWebhookUrl || "");
            }
        } catch (_) {}
    };

    useEffect(() => {
        loadData();
        loadConfig();
        const interval = setInterval(() => loadData(), 20000);
        return () => clearInterval(interval);
    }, []);

    // Container Actions
    const handleRestartContainer = async (c: DockerContainerItem) => {
        setContainerActionLoading(prev => ({ ...prev, [c.id]: true }));
        try {
            const res = await restartDockerContainerAction(c.fullId || c.id || c.name);
            if (res.success) {
                showToast(`Container "${c.name}" restarted successfully!`, "success");
                await loadData();
            } else {
                showToast(res.message || `Failed to restart container "${c.name}"`, "error");
            }
        } catch (err: any) {
            showToast(err.message || "Failed to restart container", "error");
        } finally {
            setContainerActionLoading(prev => ({ ...prev, [c.id]: false }));
        }
    };

    const handleStopContainer = async (c: DockerContainerItem) => {
        setContainerActionLoading(prev => ({ ...prev, [c.id]: true }));
        try {
            const res = await stopDockerContainerAction(c.fullId || c.id || c.name);
            if (res.success) {
                showToast(`Container "${c.name}" stopped.`, "success");
                await loadData();
            } else {
                showToast(res.message || "Failed to stop container", "error");
            }
        } catch (err: any) {
            showToast(err.message || "Failed to stop container", "error");
        } finally {
            setContainerActionLoading(prev => ({ ...prev, [c.id]: false }));
        }
    };

    const handleStartContainer = async (c: DockerContainerItem) => {
        setContainerActionLoading(prev => ({ ...prev, [c.id]: true }));
        try {
            const res = await startDockerContainerAction(c.fullId || c.id || c.name);
            if (res.success) {
                showToast(`Container "${c.name}" started.`, "success");
                await loadData();
            } else {
                showToast(res.message || "Failed to start container", "error");
            }
        } catch (err: any) {
            showToast(err.message || "Failed to start container", "error");
        } finally {
            setContainerActionLoading(prev => ({ ...prev, [c.id]: false }));
        }
    };

    // Alert Config Actions
    const handleSaveConfig = async () => {
        setSavingConfig(true);
        try {
            const res = await saveMonitoringConfigAction({
                discordWebhookUrl: webhookUrlInput.trim(),
                notifyDiscord: !!webhookUrlInput.trim() || !!config?.notifyDiscord
            });
            if (res.success) {
                setConfig(res.config);
                showToast("Monitoring notification configuration saved!", "success");
            }
        } catch (e: any) {
            showToast(e.message || "Failed saving configuration", "error");
        } finally {
            setSavingConfig(false);
        }
    };

    const handleTestAlert = async () => {
        setTestingAlert(true);
        try {
            const res = await sendTestOutageAlertAction();
            if (res.success) {
                showToast(res.message || "Test alert sent to Discord channel!", "success");
            } else {
                showToast(res.error || "Failed sending test alert", "error");
            }
        } catch (e: any) {
            showToast(e.message || "Failed sending test alert", "error");
        } finally {
            setTestingAlert(false);
        }
    };

    const handleClearIncidents = async () => {
        try {
            await clearResolvedIncidentsAction();
            showToast("Resolved incidents cleared.", "success");
            await loadData();
        } catch (e: any) {
            showToast(e.message || "Failed clearing incidents", "error");
        }
    };

    // Filtered services
    const filteredServices = useMemo(() => {
        return services.filter(srv => {
            if (systemStatusFilter === "ONLINE" && srv.status !== "ONLINE") return false;
            if (systemStatusFilter === "OFFLINE" && srv.status !== "OFFLINE") return false;
            if (systemStatusFilter === "PAUSED" && srv.status !== "PAUSED") return false;

            if (systemCategoryFilter !== "ALL" && srv.category !== systemCategoryFilter) return false;

            if (systemSearch.trim()) {
                const q = systemSearch.toLowerCase().trim();
                const mName = (srv.name || "").toLowerCase().includes(q);
                const mType = (srv.type || "").toLowerCase().includes(q);
                const mUrl = (srv.url || "").toLowerCase().includes(q);
                if (!mName && !mType && !mUrl) return false;
            }
            return true;
        });
    }, [services, systemStatusFilter, systemCategoryFilter, systemSearch]);

    // Filtered containers
    const filteredContainers = useMemo(() => {
        const list = containers.filter(c => {
            if (containerStateFilter === "running" && c.state !== "running") return false;
            if (containerStateFilter === "exited" && c.state !== "exited" && c.state !== "dead") return false;
            if (containerStateFilter === "unhealthy" && c.state !== "unhealthy") return false;

            if (containerSearch.trim()) {
                const q = containerSearch.toLowerCase().trim();
                const mName = (c.name || "").toLowerCase().includes(q);
                const mImage = (c.image || "").toLowerCase().includes(q);
                const mId = (c.id || "").toLowerCase().includes(q);
                if (!mName && !mImage && !mId) return false;
            }
            return true;
        });

        list.sort((a, b) => {
            if (containerSort === "cpu_desc") {
                return (b.cpuPercent || 0) - (a.cpuPercent || 0);
            }
            if (containerSort === "mem_desc") {
                return (b.memoryUsage || 0) - (a.memoryUsage || 0);
            }
            return (a.name || "").localeCompare(b.name || "");
        });

        return list;
    }, [containers, containerStateFilter, containerSearch, containerSort]);

    const formatBytes = (bytes: number): string => {
        if (!bytes || bytes === 0) return "0 MB";
        const mb = bytes / (1024 * 1024);
        if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
        return `${Math.round(mb)} MB`;
    };

    return (
        <div className="p-3 sm:p-6 lg:p-8 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] mx-auto w-full space-y-6 min-w-0">
            {/* FLOATING TOAST NOTIFICATION */}
            {toastMessage && (
                <div className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-xl shadow-2xl backdrop-blur-xl border text-xs font-semibold flex items-center gap-2 animate-in fade-in slide-in-from-top-2 duration-200 ${
                    toastMessage.type === "success" 
                        ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/40" 
                        : "bg-rose-950/90 text-rose-300 border-rose-500/40"
                }`}>
                    {toastMessage.type === "success" ? <Check className="h-4 w-4 text-emerald-400" /> : <X className="h-4 w-4 text-rose-400" />}
                    <span>{toastMessage.text}</span>
                </div>
            )}

            {/* DASHBOARD HERO HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-white/[0.08]">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                            <Layers className="h-6 w-6 text-emerald-400 animate-pulse" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-foreground via-foreground/90 to-muted-foreground bg-clip-text text-transparent flex items-center gap-2.5">
                                System & Docker Fleet Monitoring
                            </h1>
                            <p className="text-muted-foreground text-xs sm:text-sm">
                                Real-time uptime telemetry, Docker container lifecycle controls, and automated outage alert dispatches.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2.5 self-start md:self-auto shrink-0">
                    <Link href="/settings?tab=monitoring">
                        <Button variant="outline" size="sm" className="h-9 px-3 text-xs gap-1.5 border-border/60 hover:bg-white/[0.04]">
                            <Settings className="h-4 w-4 text-muted-foreground" />
                            <span>Monitoring Settings</span>
                        </Button>
                    </Link>
                    <Button
                        variant="default"
                        size="sm"
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        className="h-9 px-3.5 text-xs font-bold gap-1.5 shadow-md bg-primary hover:bg-primary/90 text-primary-foreground"
                    >
                        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                        <span>Refresh Telemetry</span>
                    </Button>
                </div>
            </div>

            {/* TOP STATS SCORECARD ROW */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {/* CARD 1: FLEET 24H UPTIME */}
                <div className="p-3.5 rounded-2xl bg-[#121218]/90 border border-white/[0.08] backdrop-blur-md shadow-md space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Fleet 24h Uptime</span>
                        <ShieldCheck className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${overall24h >= 99 ? "text-emerald-400" : overall24h >= 95 ? "text-amber-400" : "text-rose-400"}`}>
                            {overall24h}%
                        </span>
                        <span className="text-[10px] text-muted-foreground">7d: {overall7d}%</span>
                    </div>
                </div>

                {/* CARD 2: DOCKER FLEET RUNNING */}
                <div className="p-3.5 rounded-2xl bg-[#121218]/90 border border-white/[0.08] backdrop-blur-md shadow-md space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Docker Containers</span>
                        <Cpu className="h-4 w-4 text-sky-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-foreground">
                            {fleetSummary.runningCount}
                            <span className="text-xs font-semibold text-muted-foreground">/{fleetSummary.totalContainers}</span>
                        </span>
                        <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                            {fleetSummary.stoppedCount} stopped
                        </Badge>
                    </div>
                </div>

                {/* CARD 3: MONITORED SYSTEMS */}
                <div className="p-3.5 rounded-2xl bg-[#121218]/90 border border-white/[0.08] backdrop-blur-md shadow-md space-y-1">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Systems & Services</span>
                        <Server className="h-4 w-4 text-purple-400" />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-black text-foreground">
                            {services.filter(s => s.status === "ONLINE").length}
                            <span className="text-xs font-semibold text-muted-foreground">/{services.length}</span>
                        </span>
                        <Badge variant="outline" className="text-[9px] bg-sky-500/10 text-sky-400 border-sky-500/30">
                            {services.filter(s => s.status === "OFFLINE").length} down
                        </Badge>
                    </div>
                </div>

                {/* CARD 4: ACTIVE OUTAGES */}
                <div className={`p-3.5 rounded-2xl border backdrop-blur-md shadow-md space-y-1 ${
                    activeIncidentsCount > 0 
                        ? "bg-rose-950/20 border-rose-500/40" 
                        : "bg-[#121218]/90 border-white/[0.08]"
                }`}>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Active Incidents</span>
                        <AlertTriangle className={`h-4 w-4 ${activeIncidentsCount > 0 ? "text-rose-400 animate-pulse" : "text-muted-foreground/40"}`} />
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-black ${activeIncidentsCount > 0 ? "text-rose-400" : "text-emerald-400"}`}>
                            {activeIncidentsCount}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                            {activeIncidentsCount === 0 ? "All operational" : "Needs attention"}
                        </span>
                    </div>
                </div>
            </div>

            {/* TABBED MONITORING COCKPIT */}
            <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="w-full space-y-5">
                {/* HIGH-CONTRAST TAB SWITCHER */}
                <TabsList className="bg-[#121218] border border-white/[0.08] p-1 rounded-xl w-full sm:w-auto grid grid-cols-3 gap-1 h-auto">
                    {/* TAB 1: SYSTEMS */}
                    <TabsTrigger
                        value="systems"
                        className="text-xs font-bold py-2 px-4 rounded-lg transition-all gap-2 text-sky-400/80 hover:text-sky-300 data-[state=active]:text-sky-400 data-[state=active]:bg-sky-500/15 data-[state=active]:border data-[state=active]:border-sky-500/40 data-[state=active]:shadow-sm"
                    >
                        <Server className="h-4 w-4 text-sky-400" />
                        <span>Systems & Services ({services.length})</span>
                    </TabsTrigger>

                    {/* TAB 2: DOCKER CONTAINERS */}
                    <TabsTrigger
                        value="containers"
                        className="text-xs font-bold py-2 px-4 rounded-lg transition-all gap-2 text-emerald-400/80 hover:text-emerald-300 data-[state=active]:text-emerald-400 data-[state=active]:bg-emerald-500/15 data-[state=active]:border data-[state=active]:border-emerald-500/40 data-[state=active]:shadow-sm"
                    >
                        <Cpu className="h-4 w-4 text-emerald-400" />
                        <span>Docker Fleet ({fleetSummary.totalContainers})</span>
                    </TabsTrigger>

                    {/* TAB 3: INCIDENTS & ALERTS */}
                    <TabsTrigger
                        value="incidents"
                        className="text-xs font-bold py-2 px-4 rounded-lg transition-all gap-2 text-amber-400/80 hover:text-amber-300 data-[state=active]:text-amber-400 data-[state=active]:bg-amber-500/15 data-[state=active]:border data-[state=active]:border-amber-500/40 data-[state=active]:shadow-sm"
                    >
                        <Bell className="h-4 w-4 text-amber-400" />
                        <span>Outages & Alerts {activeIncidentsCount > 0 ? `(${activeIncidentsCount})` : ""}</span>
                    </TabsTrigger>
                </TabsList>

                {/* ========================================================================= */}
                {/* TAB 1 CONTENT: SYSTEMS & SERVICES HEALTH */}
                {/* ========================================================================= */}
                <TabsContent value="systems" className="space-y-4 focus-visible:outline-hidden">
                    <Card className="border border-white/[0.08] bg-[#121218]/90 backdrop-blur-xl shadow-xl rounded-2xl">
                        <CardHeader className="p-4 sm:p-5 border-b border-white/[0.06] space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                                        <Server className="h-4 w-4 text-sky-400" />
                                        Infrastructure Reachability & Uptime Telemetry
                                    </CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground">
                                        Probed every 20 seconds. Rolling 24-hour, 7-day, and 30-day uptime calculations with latency sparklines.
                                    </CardDescription>
                                </div>
                            </div>

                            {/* FILTER BAR */}
                            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                                    <button
                                        onClick={() => setSystemStatusFilter("ALL")}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            systemStatusFilter === "ALL" 
                                                ? "bg-white/10 text-foreground border border-white/20 shadow-xs" 
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        All ({services.length})
                                    </button>
                                    <button
                                        onClick={() => setSystemStatusFilter("ONLINE")}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            systemStatusFilter === "ONLINE" 
                                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs" 
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        Online ({services.filter(s => s.status === "ONLINE").length})
                                    </button>
                                    <button
                                        onClick={() => setSystemStatusFilter("OFFLINE")}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            systemStatusFilter === "OFFLINE" 
                                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs" 
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        Down ({services.filter(s => s.status === "OFFLINE").length})
                                    </button>
                                    <button
                                        onClick={() => setSystemStatusFilter("PAUSED")}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            systemStatusFilter === "PAUSED" 
                                                ? "bg-slate-500/20 text-slate-300 border border-slate-500/40 shadow-xs" 
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        Paused ({services.filter(s => s.status === "PAUSED").length})
                                    </button>
                                </div>

                                <div className="flex items-center gap-2">
                                    <select
                                        value={systemCategoryFilter}
                                        onChange={(e) => setSystemCategoryFilter(e.target.value)}
                                        aria-label="Filter by category"
                                        className="bg-black/40 border border-white/10 rounded-lg text-xs text-foreground px-2 py-1.5 h-8 focus:outline-hidden focus:border-primary/50"
                                    >
                                        <option value="ALL">All Categories</option>
                                        <option value="plex">Plex Media Servers</option>
                                        <option value="glances">Host Hardware (Glances)</option>
                                        <option value="tautulli">Stream Monitors (Tautulli)</option>
                                        <option value="apps">Servarr & Request Apps</option>
                                        <option value="downloaders">Download Clients</option>
                                    </select>

                                    <div className="relative flex-1 sm:w-44">
                                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Search systems..."
                                            value={systemSearch}
                                            onChange={(e) => setSystemSearch(e.target.value)}
                                            className="h-8 pl-8 pr-2.5 text-xs bg-black/40 border-white/10"
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-4 sm:p-5">
                            {filteredServices.length === 0 ? (
                                <div className="py-12 text-center text-xs text-muted-foreground">
                                    No services match the selected filter.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                    {filteredServices.map(srv => {
                                        const isOnline = srv.status === "ONLINE";
                                        const isOffline = srv.status === "OFFLINE";
                                        const isPaused = srv.status === "PAUSED";

                                        return (
                                            <div
                                                key={srv.id}
                                                className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                                                    isOnline 
                                                        ? "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.15]" 
                                                        : isOffline 
                                                            ? "bg-rose-950/20 border-rose-500/40 shadow-xs" 
                                                            : "bg-white/[0.01] border-dashed border-white/[0.06] opacity-75"
                                                }`}
                                            >
                                                {/* ROW 1: HEADER & BADGES */}
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <h4 className="text-xs font-bold text-foreground truncate" title={srv.name}>
                                                                {srv.name}
                                                            </h4>
                                                            <Badge variant="outline" className="text-[9px] font-semibold px-1.5 py-0 bg-white/[0.04] border-white/10 text-muted-foreground">
                                                                {srv.type}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground/70 truncate pt-0.5 font-mono">
                                                            {srv.url?.replace(/^https?:\/\//, "") || "local-instance"}
                                                        </p>
                                                    </div>

                                                    {srv.url && (
                                                        <a
                                                            href={srv.url.startsWith("http") ? srv.url : `http://${srv.url}`}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/[0.06] shrink-0"
                                                        >
                                                            <ExternalLink className="h-3.5 w-3.5" />
                                                        </a>
                                                    )}
                                                </div>

                                                {/* ROW 2: STATUS & LATENCY */}
                                                <div className="flex items-center justify-between gap-2 pt-1 border-t border-white/[0.04]">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className={`w-2 h-2 rounded-full ${isOnline ? "bg-emerald-400" : isOffline ? "bg-rose-500 animate-pulse" : "bg-slate-500"}`} />
                                                        <span className={`text-[11px] font-bold uppercase tracking-wider ${isOnline ? "text-emerald-400" : isOffline ? "text-rose-400" : "text-slate-400"}`}>
                                                            {srv.status}
                                                        </span>
                                                        <span className="text-[10px] text-muted-foreground/80">&middot; {srv.currentStreak}</span>
                                                    </div>

                                                    {isOnline && srv.latencyMs !== undefined && (
                                                        <span className="font-mono text-[10px] text-muted-foreground bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                                                            {srv.latencyMs}ms
                                                        </span>
                                                    )}
                                                </div>

                                                {/* ROW 3: UPTIME PERCENTAGE SCORECARD */}
                                                <div className="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-black/40 border border-white/[0.04] text-center">
                                                    <div>
                                                        <span className="text-[9px] text-muted-foreground block uppercase">24h Uptime</span>
                                                        <span className={`text-xs font-extrabold ${srv.uptimePercentage24h >= 99 ? "text-emerald-400" : srv.uptimePercentage24h >= 95 ? "text-amber-400" : "text-rose-400"}`}>
                                                            {srv.uptimePercentage24h}%
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] text-muted-foreground block uppercase">7d Uptime</span>
                                                        <span className={`text-xs font-extrabold ${srv.uptimePercentage7d >= 99 ? "text-emerald-400" : srv.uptimePercentage7d >= 95 ? "text-amber-400" : "text-rose-400"}`}>
                                                            {srv.uptimePercentage7d}%
                                                        </span>
                                                    </div>
                                                    <div>
                                                        <span className="text-[9px] text-muted-foreground block uppercase">30d Uptime</span>
                                                        <span className={`text-xs font-extrabold ${srv.uptimePercentage30d >= 99 ? "text-emerald-400" : srv.uptimePercentage30d >= 95 ? "text-amber-400" : "text-rose-400"}`}>
                                                            {srv.uptimePercentage30d}%
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* ROW 4: RECENT PINGS SPARKLINE */}
                                                <div className="flex items-center justify-between gap-1 pt-0.5">
                                                    <span className="text-[9px] text-muted-foreground/60">Recent Probes:</span>
                                                    <div className="flex items-center gap-1">
                                                        {srv.pingHistory.map((ping, idx) => (
                                                            <span
                                                                key={idx}
                                                                title={ping !== null ? `${ping}ms` : "Failed probe"}
                                                                className={`w-1.5 h-3.5 rounded-xs ${
                                                                    ping !== null ? "bg-emerald-500/80" : "bg-rose-500"
                                                                }`}
                                                            />
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 2 CONTENT: DOCKER CONTAINER FLEET */}
                {/* ========================================================================= */}
                <TabsContent value="containers" className="space-y-4 focus-visible:outline-hidden">
                    <Card className="border border-white/[0.08] bg-[#121218]/90 backdrop-blur-xl shadow-xl rounded-2xl">
                        <CardHeader className="p-4 sm:p-5 border-b border-white/[0.06] space-y-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="space-y-0.5">
                                    <div className="flex items-center gap-2">
                                        <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-emerald-400" />
                                            Docker Container Fleet Manager
                                        </CardTitle>
                                        <Badge variant="outline" className="text-[9px] font-semibold bg-emerald-500/10 text-emerald-400 border-emerald-500/30">
                                            {fleetSummary.source}
                                        </Badge>
                                    </div>
                                    <CardDescription className="text-xs text-muted-foreground">
                                        Inspect container health, CPU & memory utilization, port mappings, and execute 1-click container restarts.
                                    </CardDescription>
                                </div>
                            </div>

                            {/* FILTER BAR */}
                            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
                                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                                    <button
                                        onClick={() => setContainerStateFilter("ALL")}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            containerStateFilter === "ALL" 
                                                ? "bg-white/10 text-foreground border border-white/20 shadow-xs" 
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        All ({containers.length})
                                    </button>
                                    <button
                                        onClick={() => setContainerStateFilter("running")}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            containerStateFilter === "running" 
                                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs" 
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        Running ({fleetSummary.runningCount})
                                    </button>
                                    <button
                                        onClick={() => setContainerStateFilter("exited")}
                                        className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                            containerStateFilter === "exited" 
                                                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs" 
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        Stopped ({fleetSummary.stoppedCount})
                                    </button>
                                    {fleetSummary.unhealthyCount > 0 && (
                                        <button
                                            onClick={() => setContainerStateFilter("unhealthy")}
                                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                                containerStateFilter === "unhealthy" 
                                                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40 shadow-xs" 
                                                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                            }`}
                                        >
                                            Unhealthy ({fleetSummary.unhealthyCount})
                                        </button>
                                    )}
                                </div>

                                <div className="flex items-center gap-2">
                                    <div className="flex items-center bg-black/40 border border-white/10 rounded-lg p-0.5 h-8 shrink-0">
                                        <button
                                            onClick={() => setContainerSort("name_asc")}
                                            title="Sort A-Z"
                                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                                                containerSort === "name_asc" 
                                                    ? "bg-white/15 text-foreground shadow-xs" 
                                                    : "text-muted-foreground hover:text-foreground"
                                            }`}
                                        >
                                            A-Z
                                        </button>
                                        <button
                                            onClick={() => setContainerSort("cpu_desc")}
                                            title="Sort by Highest CPU load"
                                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                                                containerSort === "cpu_desc" 
                                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs" 
                                                    : "text-muted-foreground hover:text-amber-400"
                                            }`}
                                        >
                                            🔥 CPU
                                        </button>
                                        <button
                                            onClick={() => setContainerSort("mem_desc")}
                                            title="Sort by Highest RAM usage"
                                            className={`px-2 py-1 text-[11px] font-semibold rounded-md transition-all cursor-pointer ${
                                                containerSort === "mem_desc" 
                                                    ? "bg-sky-500/20 text-sky-300 border border-sky-500/40 shadow-xs" 
                                                    : "text-muted-foreground hover:text-sky-400"
                                            }`}
                                        >
                                            💾 RAM
                                        </button>
                                    </div>

                                    <div className="relative flex-1 sm:w-56">
                                        <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                                        <Input
                                            placeholder="Search container or image..."
                                            value={containerSearch}
                                            onChange={(e) => setContainerSearch(e.target.value)}
                                            className="h-8 pl-8 pr-2.5 text-xs bg-black/40 border-white/10"
                                        />
                                    </div>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-4 sm:p-5">
                            {filteredContainers.length === 0 ? (
                                <div className="py-12 text-center text-xs text-muted-foreground">
                                    No Docker containers match your search criteria.
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                                    {filteredContainers.map(c => {
                                        const isRunning = c.state === "running";
                                        const isExited = c.state === "exited" || c.state === "dead";
                                        const isUnhealthy = c.state === "unhealthy";
                                        const isRestarting = c.state === "restarting";
                                        const isBusy = containerActionLoading[c.id];

                                        const branding = getContainerAppBranding(c.name, c.image);
                                        const AppIcon = branding.icon;
                                        const isHighCpu = c.cpuPercent >= 100;
                                        const isMediumCpu = c.cpuPercent >= 50 && c.cpuPercent < 100;
                                        const displayImage = c.image.replace(/^(lscr\.io|ghcr\.io|docker\.io)\//, "");
                                        const cleanStatus = (c.status || "").toLowerCase().includes("glances") 
                                            ? (isRunning ? "Running" : "Stopped") 
                                            : (c.status || (isRunning ? "Running" : "Stopped"));

                                        return (
                                            <div
                                                key={c.id}
                                                className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                                                    isRunning 
                                                        ? "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.15]" 
                                                        : isUnhealthy 
                                                            ? "bg-amber-950/20 border-amber-500/40" 
                                                            : isExited 
                                                                ? "bg-rose-950/20 border-rose-500/40" 
                                                                : "bg-white/[0.01] border-white/[0.06]"
                                                }`}
                                            >
                                                {/* ROW 1: BRANDED APP ICON + NAME + STATE + SHORT ID */}
                                                <div className="flex items-start justify-between gap-2.5">
                                                    <div className="flex items-start gap-2.5 min-w-0">
                                                        <div className={`p-2 rounded-xl shrink-0 border ${branding.bg} ${branding.border} ${branding.color}`}>
                                                            <AppIcon className="h-4 w-4" />
                                                        </div>
                                                        <div className="min-w-0">
                                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                                <h4 className="text-xs font-bold text-foreground truncate" title={c.name}>
                                                                    {c.name}
                                                                </h4>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={`text-[9px] font-semibold px-1.5 py-0 ${
                                                                        isRunning 
                                                                            ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" 
                                                                            : isUnhealthy 
                                                                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30" 
                                                                                : isExited 
                                                                                    ? "bg-rose-500/10 text-rose-400 border-rose-500/30" 
                                                                                    : "bg-slate-500/10 text-slate-400 border-slate-500/30"
                                                                    }`}
                                                                >
                                                                    {c.state}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-[10px] text-muted-foreground/70 truncate pt-0.5 font-mono" title={c.image}>
                                                                {displayImage}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <span className="font-mono text-[9px] text-muted-foreground/60 bg-black/40 px-1.5 py-0.5 rounded border border-white/5 shrink-0">
                                                        #{c.id}
                                                    </span>
                                                </div>

                                                {/* ROW 2: UPTIME / STATUS TEXT & HOST SOURCE */}
                                                <div className="flex items-center justify-between text-[11px] text-muted-foreground border-t border-white/[0.04] pt-1">
                                                    <span className="flex items-center gap-1.5 truncate">
                                                        <Clock className="h-3.5 w-3.5 text-muted-foreground/60 shrink-0" />
                                                        <span className="truncate">{cleanStatus}</span>
                                                    </span>

                                                    {c.hostName && (
                                                        <span className="text-[9px] font-medium text-muted-foreground/80 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06] flex items-center gap-1 shrink-0">
                                                            <Server className="h-2.5 w-2.5 text-muted-foreground/50" />
                                                            <span>{c.hostName}</span>
                                                        </span>
                                                    )}
                                                </div>

                                                {/* ROW 3: RESOURCE USAGE BARS (WITH MULTI-CORE HOT ENGINE) */}
                                                {(c.cpuPercent > 0 || c.memoryUsage > 0) && (
                                                    <div className="space-y-2 p-2.5 rounded-lg bg-black/40 border border-white/[0.04] text-[10px]">
                                                        {/* CPU ROW */}
                                                        <div className="space-y-1">
                                                            <div className="flex items-center justify-between text-muted-foreground">
                                                                <span className={`flex items-center gap-1 font-semibold ${isHighCpu ? "text-rose-400" : isMediumCpu ? "text-amber-400" : "text-muted-foreground"}`}>
                                                                    {isHighCpu ? (
                                                                        <Flame className="h-3 w-3 text-rose-400 animate-pulse" />
                                                                    ) : (
                                                                        <Cpu className={`h-3 w-3 ${isMediumCpu ? "text-amber-400" : "text-emerald-400"}`} />
                                                                    )}
                                                                    <span>CPU</span>
                                                                </span>
                                                                <span className="font-mono font-bold flex items-center gap-1.5">
                                                                    <span className={isHighCpu ? "text-rose-400 font-black" : isMediumCpu ? "text-amber-400" : "text-foreground"}>
                                                                        {isHighCpu && "🔥 "}{c.cpuPercent}%
                                                                    </span>
                                                                    {isHighCpu && (
                                                                        <span className="text-[9px] text-rose-400/80 font-normal">
                                                                            (~{(c.cpuPercent / 100).toFixed(1)} cores)
                                                                        </span>
                                                                    )}
                                                                </span>
                                                            </div>
                                                            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full transition-all ${
                                                                        isHighCpu 
                                                                            ? "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500" 
                                                                            : isMediumCpu 
                                                                                ? "bg-amber-400" 
                                                                                : "bg-emerald-400"
                                                                    }`} 
                                                                    style={{ width: `${Math.max(2, Math.min(100, c.cpuPercent))}%` }} 
                                                                />
                                                            </div>
                                                        </div>

                                                        {/* RAM ROW */}
                                                        <div className="space-y-1 pt-0.5">
                                                            <div className="flex items-center justify-between text-muted-foreground">
                                                                <span className={`flex items-center gap-1 font-semibold ${c.memoryPercent >= 85 ? "text-rose-400" : c.memoryPercent >= 70 ? "text-amber-400" : "text-muted-foreground"}`}>
                                                                    <HardDrive className={`h-3 w-3 ${c.memoryPercent >= 85 ? "text-rose-400" : c.memoryPercent >= 70 ? "text-amber-400" : "text-sky-400"}`} />
                                                                    <span>RAM</span>
                                                                </span>
                                                                <span className={`font-mono font-bold ${c.memoryPercent >= 85 ? "text-rose-400" : c.memoryPercent >= 70 ? "text-amber-400" : "text-foreground"}`}>
                                                                    {formatBytes(c.memoryUsage)} ({c.memoryPercent}%)
                                                                </span>
                                                            </div>
                                                            <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                                                                <div 
                                                                    className={`h-full rounded-full transition-all ${
                                                                        c.memoryPercent >= 85 
                                                                            ? "bg-rose-500" 
                                                                            : c.memoryPercent >= 70 
                                                                                ? "bg-amber-400" 
                                                                                : "bg-sky-400"
                                                                    }`} 
                                                                    style={{ width: `${Math.max(2, Math.min(100, c.memoryPercent))}%` }} 
                                                                />
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ROW 4: PORT BINDINGS */}
                                                {c.ports && c.ports.length > 0 && (
                                                    <div className="flex flex-wrap gap-1 pt-0.5">
                                                        {c.ports.slice(0, 3).map((p, idx) => (
                                                            <span key={idx} className="font-mono text-[9px] bg-white/[0.03] text-muted-foreground px-1.5 py-0.5 rounded border border-white/5">
                                                                {p.publicPort ? `${p.publicPort}:${p.privatePort}` : `${p.privatePort}/${p.type}`}
                                                            </span>
                                                        ))}
                                                        {c.ports.length > 3 && (
                                                            <span className="text-[9px] text-muted-foreground/60 self-center">
                                                                +{c.ports.length - 3} more
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ROW 5: ACTION BUTTONS (RESTART, STOP, START) */}
                                                <div className="flex items-center gap-2 pt-1 border-t border-white/[0.04]">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => handleRestartContainer(c)}
                                                        disabled={isBusy}
                                                        className="flex-1 h-8 text-xs font-bold gap-1.5 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-300"
                                                    >
                                                        <RefreshCw className={`h-3.5 w-3.5 ${isBusy ? "animate-spin text-emerald-400" : ""}`} />
                                                        <span>{isBusy ? "Restarting..." : "Restart"}</span>
                                                    </Button>

                                                    {isRunning ? (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleStopContainer(c)}
                                                            disabled={isBusy}
                                                            className="h-8 px-2.5 text-xs gap-1 border-border/50 text-muted-foreground hover:text-rose-400 hover:border-rose-500/30"
                                                            title="Stop container"
                                                        >
                                                            <Square className="h-3.5 w-3.5" />
                                                            <span>Stop</span>
                                                        </Button>
                                                    ) : (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => handleStartContainer(c)}
                                                            disabled={isBusy}
                                                            className="h-8 px-2.5 text-xs gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10"
                                                            title="Start container"
                                                        >
                                                            <Play className="h-3.5 w-3.5" />
                                                            <span>Start</span>
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 3 CONTENT: OUTAGES, ALERTS & INCIDENTS */}
                {/* ========================================================================= */}
                <TabsContent value="incidents" className="space-y-4 focus-visible:outline-hidden">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        {/* LEFT COLUMN: ALERT DISPATCH CONFIGURATION */}
                        <Card className="border border-white/[0.08] bg-[#121218]/90 backdrop-blur-xl shadow-xl rounded-2xl lg:col-span-1">
                            <CardHeader className="p-4 sm:p-5 border-b border-white/[0.06]">
                                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                                    <Bell className="h-4 w-4 text-amber-400" />
                                    Outage Alert Settings
                                </CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    Automatically notify administrators on Discord when any system or container goes down.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-4 sm:p-5 space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-xs font-semibold text-foreground">
                                        Discord Webhook URL
                                    </label>
                                    <Input
                                        placeholder="https://discord.com/api/webhooks/..."
                                        value={webhookUrlInput}
                                        onChange={(e) => setWebhookUrlInput(e.target.value)}
                                        className="h-8 text-xs bg-black/40 border-white/10"
                                    />
                                    <p className="text-[11px] text-muted-foreground">
                                        Leave empty to use built-in Discord Bot with #system-status channel.
                                    </p>
                                </div>

                                <div className="pt-2 flex flex-col gap-2">
                                    <Button
                                        onClick={handleSaveConfig}
                                        disabled={savingConfig}
                                        className="w-full h-8 text-xs font-bold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground"
                                    >
                                        <Check className="h-3.5 w-3.5" />
                                        <span>{savingConfig ? "Saving..." : "Save Notification Settings"}</span>
                                    </Button>

                                    <Button
                                        variant="outline"
                                        onClick={handleTestAlert}
                                        disabled={testingAlert}
                                        className="w-full h-8 text-xs font-semibold gap-1.5 border-border/60 hover:bg-white/[0.04]"
                                    >
                                        <Radio className={`h-3.5 w-3.5 ${testingAlert ? "animate-spin text-amber-400" : "text-muted-foreground"}`} />
                                        <span>{testingAlert ? "Sending..." : "Send Test Discord Alert"}</span>
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>

                        {/* RIGHT COLUMN: INCIDENT HISTORY LOG */}
                        <Card className="border border-white/[0.08] bg-[#121218]/90 backdrop-blur-xl shadow-xl rounded-2xl lg:col-span-2">
                            <CardHeader className="p-4 sm:p-5 border-b border-white/[0.06] flex flex-row items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                                        <AlertTriangle className="h-4 w-4 text-rose-400" />
                                        Outage & Incident History
                                    </CardTitle>
                                    <CardDescription className="text-xs text-muted-foreground">
                                        Chronological record of downtime incidents, failure causes, and recovery times.
                                    </CardDescription>
                                </div>

                                {incidents.filter(i => i.status === "RESOLVED").length > 0 && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleClearIncidents}
                                        className="h-7 text-[11px] text-muted-foreground hover:text-foreground"
                                    >
                                        Clear Resolved
                                    </Button>
                                )}
                            </CardHeader>

                            <CardContent className="p-4 sm:p-5">
                                {incidents.length === 0 ? (
                                    <div className="py-12 text-center space-y-2">
                                        <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 inline-block">
                                            <CheckCircle2 className="h-6 w-6" />
                                        </div>
                                        <h4 className="text-sm font-bold text-foreground">Zero Outage Incidents!</h4>
                                        <p className="text-xs text-muted-foreground">
                                            All systems and containers are operating cleanly with zero detected downtime.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {incidents.map(inc => {
                                            const isActive = inc.status === "ACTIVE";

                                            return (
                                                <div
                                                    key={inc.id}
                                                    className={`p-3.5 rounded-xl border space-y-2 ${
                                                        isActive 
                                                            ? "bg-rose-950/20 border-rose-500/40" 
                                                            : "bg-white/[0.02] border-white/[0.06]"
                                                    }`}
                                                >
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="space-y-0.5">
                                                            <div className="flex items-center gap-2">
                                                                <h4 className="text-xs font-bold text-foreground">
                                                                    {inc.targetName}
                                                                </h4>
                                                                <Badge
                                                                    variant="outline"
                                                                    className={`text-[9px] font-semibold ${
                                                                        isActive 
                                                                            ? "bg-rose-500/15 text-rose-400 border-rose-500/30" 
                                                                            : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                                                                    }`}
                                                                >
                                                                    {inc.status}
                                                                </Badge>
                                                            </div>
                                                            <p className="text-[11px] text-muted-foreground">
                                                                {inc.message}
                                                            </p>
                                                        </div>

                                                        {inc.durationMinutes !== undefined && (
                                                            <Badge variant="outline" className="text-[10px] bg-white/[0.04] text-muted-foreground border-white/10 shrink-0">
                                                                Down for {inc.durationMinutes}m
                                                            </Badge>
                                                        )}
                                                    </div>

                                                    <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 border-t border-white/[0.04] pt-1">
                                                        <span>Started: {new Date(inc.startedAt).toLocaleString()}</span>
                                                        {inc.resolvedAt && (
                                                            <span>Resolved: {new Date(inc.resolvedAt).toLocaleString()}</span>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
