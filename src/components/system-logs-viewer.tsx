"use client";

import { useState, useEffect, useRef } from "react";
import { getSystemLogsAction, clearSystemLogsAction, dumpEntireDatabaseAction } from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
    Terminal, RefreshCw, Trash2, Search, CheckCircle2, 
    AlertTriangle, XCircle, Info, Copy, Check, Pause, Play, Database
} from "lucide-react";

import { SystemLogEntry } from "@/lib/logger";

export default function SystemLogsViewer() {
    const [logs, setLogs] = useState<SystemLogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [levelFilter, setLevelFilter] = useState<string>("ALL");
    const [categoryFilter, setCategoryFilter] = useState<string>("ALL");
    const [copied, setCopied] = useState(false);
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

    const handleDumpDatabase = async () => {
        try {
            await dumpEntireDatabaseAction();
            fetchLogs();
        } catch (e) {
            console.error("Failed to dump database:", e);
        }
    };

    const filteredLogs = logs.filter(log => {
        if (levelFilter !== "ALL" && log.level !== levelFilter) return false;
        if (categoryFilter !== "ALL" && log.category !== categoryFilter) return false;
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return (
                log.message.toLowerCase().includes(q) ||
                log.category.toLowerCase().includes(q) ||
                (log.details && log.details.toLowerCase().includes(q))
            );
        }
        return true;
    });

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
        const colors: Record<string, string> = {
            SCANNER: "bg-purple-500/20 text-purple-300 border-purple-500/30",
            API: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
            COVER: "bg-pink-500/20 text-pink-300 border-pink-500/30",
            DOWNLOAD: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
            KINDLE: "bg-orange-500/20 text-orange-300 border-orange-500/30",
            DATABASE: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
            SYSTEM: "bg-slate-500/20 text-slate-300 border-slate-500/30"
        };
        return <Badge className={`${colors[category] || colors.SYSTEM} font-mono text-[10px]`}>{category}</Badge>;
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
                            Real-time streaming audit log for library scanners, cover engine, API requests, database queries, and download ingestion.
                        </CardDescription>
                    </div>

                    <div className="flex items-center gap-3">
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
                            onClick={handleDumpDatabase}
                            className="border-cyan-700 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-200"
                        >
                            <Database className="h-3.5 w-3.5 mr-1.5 text-cyan-400" />
                            Dump Database
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
                <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-slate-800/60">
                    <div className="relative flex-1 min-w-[220px]">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Filter logs by keyword, book title, library ID..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="pl-9 bg-slate-900/90 border-slate-800 text-xs text-slate-200 placeholder:text-slate-500"
                        />
                    </div>

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

                    <div className="flex items-center gap-1 bg-slate-900/80 p-1 rounded-lg border border-slate-800 text-xs">
                        {["ALL", "SCANNER", "API", "COVER", "DOWNLOAD", "DATABASE"].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setCategoryFilter(cat)}
                                className={`px-2 py-1 rounded text-[11px] font-mono transition-colors ${
                                    categoryFilter === cat
                                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                        : "text-slate-400 hover:text-slate-200"
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
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
                            <p className="text-xs text-slate-600 mt-1">Logs update automatically when system tasks or library scans run.</p>
                        </div>
                    ) : (
                        filteredLogs.map(log => (
                            <div key={log.id} className="pt-2 first:pt-0 flex flex-wrap items-start justify-between gap-2 hover:bg-slate-900/40 p-1.5 rounded transition-colors">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                    <span className="text-slate-500 text-[11px] select-none whitespace-nowrap">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                    {getCategoryBadge(log.category)}
                                    {getLevelBadge(log.level)}
                                    <span className="text-slate-200 break-words flex-1 font-sans text-xs">
                                        {log.message}
                                    </span>
                                </div>
                                {log.details && (
                                    <div className="w-full pl-28 text-[11px] text-slate-400 bg-slate-900/60 p-2 rounded border border-slate-800/80 mt-1">
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
