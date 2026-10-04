"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { getAdminInfrastructureStatusAction, type InfrastructureServiceItem } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Activity, Tv, Film, HardDrive, Cpu, RefreshCw, 
    Server, Search, ExternalLink, CheckCircle2, AlertTriangle, 
    PauseCircle, ArrowDownCircle, Layers, Compass, Settings,
    Radio, ShieldCheck, Zap
} from "lucide-react";

export default function AdminSystemHealthGrid() {
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [services, setServices] = useState<InfrastructureServiceItem[]>([]);
    const [summary, setSummary] = useState({
        totalConfigured: 0,
        totalMonitored: 0,
        onlineCount: 0,
        offlineCount: 0,
        pausedCount: 0
    });
    const [statusFilter, setStatusFilter] = useState<"ALL" | "ONLINE" | "OFFLINE" | "PAUSED">("ALL");
    const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    const loadStatus = async (isManual = false) => {
        if (isManual) setRefreshing(true);
        try {
            const res = await getAdminInfrastructureStatusAction();
            if (res && res.success) {
                setServices(res.services);
                setSummary(res.summary);
            }
        } catch (err) {
            console.error("Failed to load infrastructure status:", err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadStatus();
        const interval = setInterval(() => loadStatus(), 15000);
        return () => clearInterval(interval);
    }, []);

    const filteredServices = useMemo(() => {
        return services.filter(srv => {
            // Status filter
            if (statusFilter === "ONLINE" && srv.status !== "ONLINE") return false;
            if (statusFilter === "OFFLINE" && srv.status !== "OFFLINE") return false;
            if (statusFilter === "PAUSED" && srv.status !== "PAUSED") return false;

            // Category filter
            if (categoryFilter !== "ALL" && srv.category !== categoryFilter) return false;

            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                const matchName = (srv.name || "").toLowerCase().includes(q);
                const matchType = (srv.type || "").toLowerCase().includes(q);
                const matchUrl = (srv.url || "").toLowerCase().includes(q);
                if (!matchName && !matchType && !matchUrl) return false;
            }

            return true;
        });
    }, [services, statusFilter, categoryFilter, searchQuery]);

    const getServiceIcon = (category: string, type: string) => {
        const t = (type || "").toLowerCase();
        if (category === "plex") return <Tv className="h-4 w-4 text-amber-400" />;
        if (category === "glances") return <Cpu className="h-4 w-4 text-emerald-400" />;
        if (category === "tautulli") return <Activity className="h-4 w-4 text-purple-400" />;
        if (t.includes("sonarr")) return <Tv className="h-4 w-4 text-sky-400" />;
        if (t.includes("radarr")) return <Film className="h-4 w-4 text-amber-500" />;
        if (t.includes("seerr") || t.includes("ombi")) return <Compass className="h-4 w-4 text-rose-400" />;
        if (t.includes("prowlarr")) return <Layers className="h-4 w-4 text-orange-400" />;
        if (t.includes("sabnzb") || t.includes("qbit") || t.includes("nzbget")) return <ArrowDownCircle className="h-4 w-4 text-blue-400" />;
        return <Server className="h-4 w-4 text-primary" />;
    };

    const getCategoryBadgeClass = (category: string) => {
        switch (category) {
            case "plex": return "bg-amber-500/10 text-amber-400 border-amber-500/30";
            case "glances": return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
            case "tautulli": return "bg-purple-500/10 text-purple-400 border-purple-500/30";
            case "downloaders": return "bg-blue-500/10 text-blue-400 border-blue-500/30";
            default: return "bg-sky-500/10 text-sky-400 border-sky-500/30";
        }
    };

    const getCategoryLabel = (cat: string) => {
        switch (cat) {
            case "plex": return "Plex PMS";
            case "glances": return "Host Glances";
            case "tautulli": return "Tautulli";
            case "downloaders": return "Downloader";
            case "apps": return "Media App";
            default: return cat.toUpperCase();
        }
    };

    return (
        <Card className="border border-white/[0.08] bg-[#121218]/90 backdrop-blur-xl shadow-xl overflow-hidden rounded-2xl">
            {/* CARD HEADER */}
            <CardHeader className="p-4 sm:p-6 pb-3 border-b border-white/[0.06] space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="space-y-1">
                        <div className="flex items-center gap-2.5">
                            <div className="p-2 rounded-xl bg-primary/10 text-primary border border-primary/20">
                                <Radio className="h-5 w-5 animate-pulse" />
                            </div>
                            <div>
                                <CardTitle className="text-base sm:text-lg font-bold text-foreground flex items-center gap-2">
                                    Infrastructure Health & Monitoring
                                </CardTitle>
                                <CardDescription className="text-xs text-muted-foreground">
                                    Real-time status, reachability, and response telemetry across all configured hosts, servers, and apps.
                                </CardDescription>
                            </div>
                        </div>
                    </div>

                    {/* TOP ACTION BUTTONS */}
                    <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
                        <Link href="/settings?tab=monitoring">
                            <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8 px-2.5 text-xs gap-1.5 border-border/60 hover:bg-white/[0.04]"
                            >
                                <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                                <span>Manage Apps</span>
                            </Button>
                        </Link>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadStatus(true)}
                            disabled={refreshing}
                            className="h-8 px-2.5 text-xs gap-1.5 border-border/60 hover:bg-white/[0.04]"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
                            <span>Refresh</span>
                        </Button>
                    </div>
                </div>

                {/* SUMMARY METRIC PILLS */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Services</span>
                            <span className="text-lg font-black text-foreground">{summary.totalConfigured}</span>
                        </div>
                        <Server className="h-5 w-5 text-muted-foreground/40" />
                    </div>

                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Operational</span>
                            <span className="text-lg font-black text-emerald-400 flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                {summary.onlineCount}
                            </span>
                        </div>
                        <ShieldCheck className="h-5 w-5 text-emerald-400/40" />
                    </div>

                    <div className={`p-2.5 rounded-xl border flex items-center justify-between ${summary.offlineCount > 0 ? "bg-rose-500/10 border-rose-500/30" : "bg-white/[0.02] border-white/[0.06]"}`}>
                        <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Unreachable</span>
                            <span className={`text-lg font-black flex items-center gap-1.5 ${summary.offlineCount > 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                                {summary.offlineCount > 0 && <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}
                                {summary.offlineCount}
                            </span>
                        </div>
                        <AlertTriangle className={`h-5 w-5 ${summary.offlineCount > 0 ? "text-rose-400" : "text-muted-foreground/40"}`} />
                    </div>

                    <div className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                        <div>
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Paused</span>
                            <span className="text-lg font-black text-slate-400">{summary.pausedCount}</span>
                        </div>
                        <PauseCircle className="h-5 w-5 text-slate-500/40" />
                    </div>
                </div>

                {/* FILTER CONTROLS BAR */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-1">
                    {/* STATUS FILTER BUTTONS */}
                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0 scrollbar-none">
                        <button
                            onClick={() => setStatusFilter("ALL")}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                statusFilter === "ALL" 
                                    ? "bg-white/10 text-foreground border border-white/20 shadow-xs" 
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                            }`}
                        >
                            All ({summary.totalConfigured})
                        </button>
                        <button
                            onClick={() => setStatusFilter("OFFLINE")}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                                statusFilter === "OFFLINE"
                                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 shadow-xs"
                                    : summary.offlineCount > 0 
                                        ? "text-rose-400 hover:bg-rose-500/10" 
                                        : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                            }`}
                        >
                            {summary.offlineCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />}
                            Down ({summary.offlineCount})
                        </button>
                        <button
                            onClick={() => setStatusFilter("ONLINE")}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                                statusFilter === "ONLINE"
                                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                            }`}
                        >
                            Online ({summary.onlineCount})
                        </button>
                        <button
                            onClick={() => setStatusFilter("PAUSED")}
                            className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                                statusFilter === "PAUSED"
                                    ? "bg-slate-500/20 text-slate-300 border border-slate-500/40 shadow-xs"
                                    : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                            }`}
                        >
                            Paused ({summary.pausedCount})
                        </button>
                    </div>

                    {/* SEARCH & CATEGORY SELECT */}
                    <div className="flex items-center gap-2">
                        <select
                            value={categoryFilter}
                            onChange={(e) => setCategoryFilter(e.target.value)}
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

                        <div className="relative flex-1 sm:w-48">
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                placeholder="Search services..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 pl-8 pr-2.5 text-xs bg-black/40 border-white/10 focus-visible:ring-0 focus-visible:border-primary/50"
                            />
                        </div>
                    </div>
                </div>
            </CardHeader>

            {/* CARD CONTENT: GRID OF SERVICES */}
            <CardContent className="p-4 sm:p-6">
                {loading && services.length === 0 ? (
                    <div className="flex items-center justify-center py-12 gap-2 text-xs text-muted-foreground">
                        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
                        <span>Probing infrastructure reachability...</span>
                    </div>
                ) : filteredServices.length === 0 ? (
                    <div className="py-12 text-center space-y-2">
                        {statusFilter === "OFFLINE" ? (
                            <div className="space-y-2">
                                <div className="p-3 rounded-full bg-emerald-500/10 text-emerald-400 inline-block">
                                    <CheckCircle2 className="h-6 w-6" />
                                </div>
                                <h4 className="text-sm font-bold text-foreground">Zero Services Down!</h4>
                                <p className="text-xs text-muted-foreground">
                                    All monitored Plex servers, host hardware, and media stack apps are operational.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-foreground">No services match your filters</p>
                                <p className="text-[11px] text-muted-foreground">Try clearing your search query or selecting a different status filter.</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                        {filteredServices.map((srv) => {
                            const isOnline = srv.status === "ONLINE";
                            const isPaused = srv.status === "PAUSED";
                            const isOffline = srv.status === "OFFLINE";

                            return (
                                <div
                                    key={srv.id}
                                    className={`p-3 rounded-xl border transition-all space-y-2.5 ${
                                        isOnline 
                                            ? "bg-white/[0.02] border-white/[0.06] hover:border-white/[0.15]" 
                                            : isOffline 
                                                ? "bg-rose-950/20 border-rose-500/30 shadow-xs hover:border-rose-500/50" 
                                                : "bg-white/[0.01] border-dashed border-white/[0.06] opacity-75 hover:opacity-100"
                                    }`}
                                >
                                    {/* ROW 1: ICON + NAME + BADGES */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <div className="p-1.5 rounded-lg bg-black/40 border border-white/10 shrink-0">
                                                {getServiceIcon(srv.category, srv.type)}
                                            </div>
                                            <div className="min-w-0">
                                                <h4 className="text-xs font-bold text-foreground truncate" title={srv.name}>
                                                    {srv.name}
                                                </h4>
                                                <div className="flex items-center gap-1.5 pt-0.5">
                                                    <Badge 
                                                        variant="outline" 
                                                        className={`text-[9px] font-semibold px-1.5 py-0 ${getCategoryBadgeClass(srv.category)}`}
                                                    >
                                                        {getCategoryLabel(srv.category)}
                                                    </Badge>
                                                    <span className="text-[10px] text-muted-foreground truncate" title={srv.type}>
                                                        {srv.type}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {srv.url && (
                                            <a
                                                href={srv.url.startsWith("http") ? srv.url : `http://${srv.url}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={`Open ${srv.name} in browser`}
                                                className="p-1 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-white/[0.06] shrink-0 transition-colors"
                                            >
                                                <ExternalLink className="h-3.5 w-3.5" />
                                            </a>
                                        )}
                                    </div>

                                    {/* ROW 2: STATUS PILL + TELEMETRY */}
                                    <div className="flex items-center justify-between gap-2 pt-0.5 border-t border-white/[0.04]">
                                        <div className="flex items-center gap-1.5">
                                            <span 
                                                className={`w-2 h-2 rounded-full ${
                                                    isOnline 
                                                        ? "bg-emerald-400" 
                                                        : isOffline 
                                                            ? "bg-rose-500 animate-pulse" 
                                                            : "bg-slate-500"
                                                }`} 
                                            />
                                            <span className={`text-[11px] font-bold tracking-wide uppercase ${
                                                isOnline 
                                                    ? "text-emerald-400" 
                                                    : isOffline 
                                                        ? "text-rose-400" 
                                                        : "text-slate-400"
                                            }`}>
                                                {srv.status}
                                            </span>
                                        </div>

                                        {isOnline && srv.latencyMs !== undefined && (
                                            <span className="font-mono text-[10px] text-muted-foreground bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                                                {srv.latencyMs}ms
                                            </span>
                                        )}
                                        {isPaused && (
                                            <span className="text-[10px] text-slate-400 italic">
                                                Monitoring Paused
                                            </span>
                                        )}
                                        {isOffline && (
                                            <span className="text-[10px] text-rose-400 font-medium">
                                                Unreachable
                                            </span>
                                        )}
                                    </div>

                                    {/* EXTRA HARDWARE / STREAM TELEMETRY IF AVAILABLE */}
                                    {srv.metrics && (srv.metrics.cpu !== undefined || srv.metrics.streamCount !== undefined) && (
                                        <div className="text-[10px] bg-black/30 p-1.5 rounded-lg border border-white/[0.04] flex items-center justify-between text-muted-foreground">
                                            {srv.metrics.cpu !== undefined && (
                                                <span className="flex items-center gap-1 font-mono">
                                                    <Cpu className="h-3 w-3 text-emerald-400" />
                                                    CPU {srv.metrics.cpu}% &middot; RAM {srv.metrics.ram}%
                                                </span>
                                            )}
                                            {srv.metrics.streamCount !== undefined && (
                                                <span className="flex items-center gap-1 font-mono text-purple-400">
                                                    <Activity className="h-3 w-3" />
                                                    {srv.metrics.streamCount} {srv.metrics.streamCount === 1 ? "stream" : "streams"}
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    {/* ROW 3: SANITIZED URL / PORT */}
                                    {srv.url && (
                                        <div className="text-[10px] font-mono text-muted-foreground/70 truncate" title={srv.url}>
                                            {srv.url.replace(/^https?:\/\//, "")}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
