"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { getSystemLogsAction, clearSystemLogsAction, dumpEntireDatabaseAction, runPlexDiagnosticsAction } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
    Terminal, RefreshCw, Trash2, Search, CheckCircle2, 
    AlertTriangle, XCircle, Info, Copy, Check, Pause, Database,
    Download, Tv
} from "lucide-react";

import { SystemLogEntry, LogCategory } from "@/lib/logger";

interface LogCategoryMeta {
    id: string;
    label: string;
    icon: string;
    badgeStyle: string;
    activeStyle: string;
}

const LOG_CATEGORIES: LogCategoryMeta[] = [
    { id: "ALL", label: "ALL", icon: "📋", badgeStyle: "bg-slate-500/20 text-slate-300 border-slate-500/30", activeStyle: "bg-slate-700 text-white border-slate-500 font-bold" },
    { id: "PLEX", label: "PLEX", icon: "📺", badgeStyle: "bg-amber-500/20 text-amber-300 border-amber-500/30", activeStyle: "bg-amber-500/25 text-amber-300 border-amber-500/60 font-bold ring-1 ring-amber-500/30" },
    { id: "TAUTULLI", label: "TAUTULLI", icon: "📊", badgeStyle: "bg-teal-500/20 text-teal-300 border-teal-500/30", activeStyle: "bg-teal-500/25 text-teal-300 border-teal-500/60 font-bold ring-1 ring-teal-500/30" },
    { id: "SCANNER", label: "SCANNER", icon: "📚", badgeStyle: "bg-purple-500/20 text-purple-300 border-purple-500/30", activeStyle: "bg-purple-500/25 text-purple-300 border-purple-500/60 font-bold ring-1 ring-purple-500/30" },
    { id: "DOWNLOAD", label: "DOWNLOAD", icon: "📥", badgeStyle: "bg-blue-500/20 text-blue-300 border-blue-500/30", activeStyle: "bg-blue-500/25 text-blue-300 border-blue-500/60 font-bold ring-1 ring-blue-500/30" },
    { id: "AI_AGENT", label: "AI AGENT", icon: "🤖", badgeStyle: "bg-violet-500/20 text-violet-300 border-violet-500/30", activeStyle: "bg-violet-500/25 text-violet-300 border-violet-500/60 font-bold ring-1 ring-violet-500/30" },
    { id: "COVER", label: "COVER", icon: "🖼️", badgeStyle: "bg-pink-500/20 text-pink-300 border-pink-500/30", activeStyle: "bg-pink-500/25 text-pink-300 border-pink-500/60 font-bold ring-1 ring-pink-500/30" },
    { id: "AUTH", label: "AUTH", icon: "🔐", badgeStyle: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", activeStyle: "bg-emerald-500/25 text-emerald-300 border-emerald-500/60 font-bold ring-1 ring-emerald-500/30" },
    { id: "KINDLE", label: "KINDLE", icon: "📖", badgeStyle: "bg-orange-500/20 text-orange-300 border-orange-500/30", activeStyle: "bg-orange-500/25 text-orange-300 border-orange-500/60 font-bold ring-1 ring-orange-500/30" },
    { id: "EMAIL", label: "EMAIL", icon: "✉️", badgeStyle: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30", activeStyle: "bg-indigo-500/25 text-indigo-300 border-indigo-500/60 font-bold ring-1 ring-indigo-500/30" },
    { id: "APPS", label: "APPS", icon: "⚡", badgeStyle: "bg-sky-500/20 text-sky-300 border-sky-500/30", activeStyle: "bg-sky-500/25 text-sky-300 border-sky-500/60 font-bold ring-1 ring-sky-500/30" },
    { id: "DATABASE", label: "DATABASE", icon: "💾", badgeStyle: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30", activeStyle: "bg-yellow-500/25 text-yellow-300 border-yellow-500/60 font-bold ring-1 ring-yellow-500/30" },
    { id: "API", label: "API", icon: "🌐", badgeStyle: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30", activeStyle: "bg-cyan-500/25 text-cyan-300 border-cyan-500/60 font-bold ring-1 ring-cyan-500/30" },
    { id: "SYSTEM", label: "SYSTEM", icon: "⚙️", badgeStyle: "bg-slate-500/20 text-slate-300 border-slate-500/30", activeStyle: "bg-slate-500/25 text-slate-300 border-slate-500/60 font-bold ring-1 ring-slate-500/30" },
];

export default function SystemLogsViewer() {
    const [logs, setLogs] = useState<SystemLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [levelFilter, setLevelFilter] = useState<string>("ALL");
    const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
    const [copied, setCopied] = useState(false);
    const [dumping, setDumping] = useState(false);
    const [runningPlexDiag, setRunningPlexDiag] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const fetchLogs = async () => {
        try {
            const data = await getSystemLogsAction();
            setLogs(data || []);
        } catch (e) {
            console.error("Failed to fetch system logs:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLogs();
    }, []);

    useEffect(() => {
        if (!autoRefresh) return;
        const interval = setInterval(fetchLogs, 2000);
        return () => clearInterval(interval);
    }, [autoRefresh]);

    const handleClear = async () => {
        if (!confirm("Are you sure you want to clear system logs?")) return;
        await clearSystemLogsAction();
        fetchLogs();
    };

    const handleCopy = () => {
        const text = filteredLogs
            .map(l => `[${l.timestamp}] [${l.category}] [${l.level}] ${l.message} ${l.details || ""}`)
            .join("\n");
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const text = logs
            .map(l => `[${l.timestamp}] [${l.category}] [${l.level}] ${l.message}${l.details ? ` | ${l.details}` : ""}`)
            .join("\n");
        const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `portalarr_system_logs_${new Date().toISOString().replace(/[:.]/g, "-")}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleRunPlexDiagnostics = async () => {
        setRunningPlexDiag(true);
        try {
            const res = await runPlexDiagnosticsAction();
            if (res && !res.success && res.error) {
                console.error("Failed to run Plex diagnostics:", res.error);
            }
            setCategoryFilter("PLEX");
            await fetchLogs();
        } catch (e) {
            console.error("Failed to run Plex diagnostics:", e);
        } finally {
            setRunningPlexDiag(false);
        }
    };

    const handleDumpDatabase = async () => {
        setDumping(true);
        try {
            const res = await dumpEntireDatabaseAction();
            if (res && !res.success && res.error) {
                console.error("Failed to dump database:", res.error);
            }
            setCategoryFilter("DATABASE");
            await fetchLogs();
        } catch (e) {
            console.error("Failed to dump database:", e);
        } finally {
            setDumping(false);
        }
    };

    // Calculate dynamic category counts
    const categoryCounts = useMemo(() => {
        const counts: Record<string, number> = { ALL: logs.length };
        for (const l of logs) {
            const cat = l.category === "PLEX_HUB" ? "PLEX" : l.category;
            counts[cat] = (counts[cat] || 0) + 1;
        }
        return counts;
    }, [logs]);

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const cat = log.category === "PLEX_HUB" ? "PLEX" : log.category;
            if (levelFilter !== "ALL" && log.level !== levelFilter) return false;
            if (categoryFilter !== "ALL" && cat !== categoryFilter) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                return (
                    log.message.toLowerCase().includes(q) ||
                    cat.toLowerCase().includes(q) ||
                    (log.details && log.details.toLowerCase().includes(q))
                );
            }
            return true;
        });
    }, [logs, levelFilter, categoryFilter, searchQuery]);

    const getLevelBadge = (level: string) => {
        switch (level) {
            case "SUCCESS":
                return <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 gap-1"><CheckCircle2 className="h-3 w-3" /> SUCCESS</Badge>;
            case "WARN":
                return <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1"><AlertTriangle className="h-3 w-3" /> WARN</Badge>;
            case "ERROR":
                return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 gap-1"><XCircle className="h-3 w-3" /> ERROR</Badge>;
            default:
                return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 gap-1"><Info className="h-3 w-3" /> INFO</Badge>;
        }
    };

    const getCategoryBadge = (category: string) => {
        const cat = category === "PLEX_HUB" ? "PLEX" : category;
        const meta = LOG_CATEGORIES.find(c => c.id === cat) || {
            id: cat,
            label: cat,
            icon: "⚙️",
            badgeStyle: "bg-slate-500/20 text-slate-300 border-slate-500/30",
            activeStyle: ""
        };
        return (
            <Badge className={`${meta.badgeStyle} font-mono text-[10px] gap-1 shrink-0 border`}>
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
            </Badge>
        );
    };

    return (
        <Card className="border-slate-800 bg-slate-950/80 backdrop-blur shadow-2xl">
            <CardHeader className="border-b border-slate-800/80 pb-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <CardTitle className="text-xl font-bold flex items-center gap-2 text-slate-100">
                            <Terminal className="h-5 w-5 text-emerald-400" />
                            Live System & Diagnostic Activity Stream
                        </CardTitle>
                        <CardDescription className="text-slate-400 text-xs mt-1">
                            Real-time streaming audit log for Plex, Tautulli, download indexers, library scanners, AI agents, and system health.
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-2.5 flex-wrap">
                        <div className="flex items-center gap-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
                            <Switch
                                id="auto-refresh"
                                checked={autoRefresh}
                                onCheckedChange={setAutoRefresh}
                            />
                            <Label htmlFor="auto-refresh" className="cursor-pointer text-slate-300 font-medium flex items-center gap-1.5">
                                {autoRefresh ? (
                                    <>
                                        <RefreshCw className="h-3.5 w-3.5 text-emerald-400 animate-spin" /> Live Polling
                                    </>
                                ) : (
                                    <>
                                        <Pause className="h-3.5 w-3.5 text-slate-400" /> Paused
                                    </>
                                )}
                            </Label>
                        </div>

                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={fetchLogs} 
                            disabled={loading}
                            className="border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>

                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleCopy}
                            className="border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
                        >
                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400 mr-1.5" /> : <Copy className="h-3.5 w-3.5 mr-1.5" />}
                            {copied ? "Copied" : "Copy"}
                        </Button>

                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleDownload}
                            className="border-slate-700 bg-slate-900 hover:bg-slate-800 text-slate-200"
                            title="Download complete system log file as a text document"
                        >
                            <Download className="h-3.5 w-3.5 mr-1.5 text-blue-400" />
                            Download
                        </Button>

                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleRunPlexDiagnostics}
                            disabled={runningPlexDiag}
                            className="border-amber-700 bg-amber-950/80 hover:bg-amber-900 text-amber-200 font-medium"
                            title="Run a deep audit of your Plex Token, Server connections, library sections, and user shares"
                        >
                            <Tv className={`h-3.5 w-3.5 mr-1.5 text-amber-400 ${runningPlexDiag ? "animate-spin" : ""}`} />
                            {runningPlexDiag ? "Auditing Plex..." : "Plex Diagnostics"}
                        </Button>

                        <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handleDumpDatabase}
                            disabled={dumping}
                            className="border-cyan-700 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200"
                        >
                            <Database className={`h-3.5 w-3.5 mr-1.5 text-cyan-400 ${dumping ? "animate-spin" : ""}`} />
                            {dumping ? "Dumping..." : "Dump Database"}
                        </Button>

                        <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={handleClear}
                            className="bg-red-950/80 hover:bg-red-900 border border-red-800/80 text-red-200"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                            Clear
                        </Button>
                    </div>
                </div>

                {/* Filter Controls Bar */}
                <div className="space-y-3 mt-4 pt-3 border-t border-slate-800/60">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="relative flex-1 min-w-[240px]">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                            <Input
                                placeholder="Filter logs by keyword, Plex user, book title, error message..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="pl-9 bg-slate-900/90 border-slate-800 text-xs text-slate-200 placeholder:text-slate-500"
                            />
                        </div>

                        {/* Level Filters */}
                        <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs">
                            {["ALL", "INFO", "SUCCESS", "WARN", "ERROR"].map(lvl => (
                                <button
                                    key={lvl}
                                    onClick={() => setLevelFilter(lvl)}
                                    className={`px-2.5 py-1 rounded font-medium transition-colors ${
                                        levelFilter === lvl
                                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                            : "text-slate-400 hover:text-slate-200"
                                    }`}
                                >
                                    {lvl}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Dedicated Category Buttons with Counts & Icons */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-900/80 p-1.5 rounded-xl border border-slate-800 text-xs">
                        {LOG_CATEGORIES.map(cat => {
                            const isSelected = categoryFilter === cat.id;
                            const count = categoryCounts[cat.id] || 0;
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => setCategoryFilter(cat.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-mono transition-all flex items-center gap-1.5 border ${
                                        isSelected
                                            ? cat.activeStyle
                                            : count > 0 
                                            ? "border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800/60" 
                                            : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/30"
                                    }`}
                                >
                                    <span>{cat.icon}</span>
                                    <span>{cat.label}</span>
                                    {count > 0 && (
                                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-black/30 font-bold' : 'bg-slate-800/80 text-slate-400'}`}>
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-0">
                <div 
                    ref={scrollRef} 
                    className="max-h-[550px] min-h-[350px] overflow-y-auto font-mono text-xs p-4 space-y-2 bg-slate-950 divide-y divide-slate-900/50"
                >
                    {filteredLogs.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
                            <Terminal className="h-10 w-10 mb-2 opacity-30 text-emerald-400" />
                            <p className="font-semibold text-slate-400">No diagnostic logs found</p>
                            <p className="text-xs text-slate-600 mt-1">Logs update automatically when system tasks, Plex calls, or library scans run.</p>
                        </div>
                    ) : (
                        filteredLogs.map(log => (
                            <div key={log.id} className="pt-2 first:pt-0 flex flex-wrap items-start justify-between gap-2 hover:bg-slate-900/40 p-2 rounded-lg transition-colors">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    <span className="text-slate-500 text-[11px] select-none whitespace-nowrap pt-0.5">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                    {getCategoryBadge(log.category)}
                                    {getLevelBadge(log.level)}
                                    <span className="text-slate-200 break-words flex-1 font-sans text-xs pt-0.5">
                                        {log.message}
                                    </span>
                                </div>
                                {log.details && (
                                    <div className="w-full pl-6 md:pl-16 text-[11px] text-slate-300 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800/90 mt-1 font-mono whitespace-pre-wrap break-all shadow-inner">
                                        {log.details}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </CardContent>
        </Card>
    );
}
