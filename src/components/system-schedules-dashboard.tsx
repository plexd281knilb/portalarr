"use client";

import React, { useState, useEffect, useCallback } from "react";
import { 
    CalendarClock, 
    RefreshCw, 
    Play, 
    CheckCircle2, 
    AlertTriangle, 
    Clock, 
    Server, 
    Sparkles, 
    CreditCard, 
    Film, 
    BookOpen, 
    ShieldCheck, 
    Loader2,
    Check,
    AlertCircle,
    Info
} from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    Select, 
    SelectContent, 
    SelectItem, 
    SelectTrigger, 
    SelectValue 
} from "@/components/ui/select";
import { 
    getSystemSchedulesStatusAction, 
    triggerManualScheduleRunAction, 
    updateSystemScheduleFrequencyAction,
    type SystemScheduleItem 
} from "@/app/schedule-actions";

type CategoryFilter = "all" | "plex" | "curation" | "billing" | "requests" | "bookshelf" | "system";

interface SystemSchedulesDashboardProps {
    onFrequencyUpdated?: () => void;
}

export function SystemSchedulesDashboard({ onFrequencyUpdated }: SystemSchedulesDashboardProps = {}) {
    const [tasks, setTasks] = useState<SystemScheduleItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
    const [updatingTaskId, setUpdatingTaskId] = useState<string | null>(null);
    const [actionMsg, setActionMsg] = useState<{ id: string; text: string; success: boolean } | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
    const [isMaintenanceWindow, setIsMaintenanceWindow] = useState(false);
    const [serverTime, setServerTime] = useState("");

    const loadSchedules = useCallback(async (isManualRefresh = false) => {
        if (isManualRefresh) setRefreshing(true);
        try {
            const res = await getSystemSchedulesStatusAction();
            if (res.success && res.tasks) {
                setTasks(res.tasks);
                setIsMaintenanceWindow(!!res.isMaintenanceWindow);
                setServerTime(res.serverTime || "");
            }
        } catch (e) {
            console.error("Failed to load system schedules:", e);
        } finally {
            setLoading(false);
            if (isManualRefresh) setRefreshing(false);
        }
    }, []);

    useEffect(() => {
        loadSchedules();
        const interval = setInterval(() => {
            loadSchedules();
        }, 30000); // 30s auto-refresh
        return () => clearInterval(interval);
    }, [loadSchedules]);

    const handleRunTask = async (task: SystemScheduleItem) => {
        setRunningTaskId(task.id);
        setActionMsg(null);
        try {
            const res = await triggerManualScheduleRunAction(task.actionKey);
            setActionMsg({
                id: task.id,
                text: res.message,
                success: res.success
            });
            await loadSchedules();
        } catch (err: any) {
            setActionMsg({
                id: task.id,
                text: err.message || "Failed to trigger scheduled task",
                success: false
            });
        } finally {
            setRunningTaskId(null);
            setTimeout(() => {
                setActionMsg((prev) => (prev?.id === task.id ? null : prev));
            }, 6000);
        }
    };

    const handleFrequencyChange = async (taskId: string, newCadence: string) => {
        setUpdatingTaskId(taskId);
        setActionMsg(null);
        try {
            const res = await updateSystemScheduleFrequencyAction({ taskId, cadence: newCadence });
            setActionMsg({
                id: taskId,
                text: res.message,
                success: res.success
            });
            if (res.success) {
                await loadSchedules();
                if (onFrequencyUpdated) {
                    onFrequencyUpdated();
                }
            }
        } catch (err: any) {
            setActionMsg({
                id: taskId,
                text: err.message || "Failed to update schedule frequency",
                success: false
            });
        } finally {
            setUpdatingTaskId(null);
            setTimeout(() => {
                setActionMsg((prev) => (prev?.id === taskId ? null : prev));
            }, 6000);
        }
    };

    const filteredTasks = tasks.filter((t) => {
        if (selectedCategory === "all") return true;
        return t.category === selectedCategory;
    });

    const activeCount = tasks.filter((t) => t.enabled).length;

    // Find nearest upcoming task
    const nextUpcomingTask = tasks
        .filter((t) => t.enabled && t.nextRunAt)
        .sort((a, b) => {
            const timeA = a.nextRunAt ? new Date(a.nextRunAt).getTime() : Infinity;
            const timeB = b.nextRunAt ? new Date(b.nextRunAt).getTime() : Infinity;
            return timeA - timeB;
        })[0];

    const getCategoryIcon = (category: string) => {
        switch (category) {
            case "plex":
                return <Server className="h-4 w-4 text-amber-400" />;
            case "curation":
                return <Sparkles className="h-4 w-4 text-purple-400" />;
            case "billing":
                return <CreditCard className="h-4 w-4 text-emerald-400" />;
            case "requests":
                return <Film className="h-4 w-4 text-rose-400" />;
            case "bookshelf":
                return <BookOpen className="h-4 w-4 text-sky-400" />;
            case "system":
            default:
                return <ShieldCheck className="h-4 w-4 text-cyan-400" />;
        }
    };

    const getCategoryBadgeClass = (category: string) => {
        switch (category) {
            case "plex":
                return "bg-amber-500/10 text-amber-400 border-amber-500/30";
            case "curation":
                return "bg-purple-500/10 text-purple-400 border-purple-500/30";
            case "billing":
                return "bg-emerald-500/10 text-emerald-400 border-emerald-500/30";
            case "requests":
                return "bg-rose-500/10 text-rose-400 border-rose-500/30";
            case "bookshelf":
                return "bg-sky-500/10 text-sky-400 border-sky-500/30";
            case "system":
            default:
                return "bg-cyan-500/10 text-cyan-400 border-cyan-500/30";
        }
    };

    return (
        <Card className="bg-[#121218]/80 backdrop-blur-md border-border/50 shadow-lg">
            <CardHeader className="pb-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                        <CardTitle className="flex items-center gap-2 text-lg sm:text-xl font-bold">
                            <CalendarClock className="h-5 w-5 text-indigo-400" />
                            <span>System Automation Schedules</span>
                        </CardTitle>
                        <CardDescription className="text-xs sm:text-sm mt-1">
                            Live schedule matrix across all background runners, relative countdowns, next execution timestamps, and 1-click manual triggers.
                        </CardDescription>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {serverTime && (
                            <Badge variant="outline" className="h-8 px-2.5 bg-slate-900/60 border-slate-700/60 text-slate-300 font-mono text-[11px] flex items-center gap-1.5">
                                <Clock className="h-3 w-3 text-indigo-400" />
                                <span>Host: {serverTime}</span>
                            </Badge>
                        )}
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-8 px-2.5 text-xs font-semibold gap-1.5 border-slate-700/60 hover:bg-slate-800/60"
                            disabled={refreshing || loading}
                            onClick={() => loadSchedules(true)}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 text-indigo-400 ${refreshing ? "animate-spin" : ""}`} />
                            <span>Refresh</span>
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="space-y-5">
                {/* METRICS HEADER CARDS */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                            <CalendarClock className="h-3.5 w-3.5 text-indigo-400" /> Total Background Jobs
                        </div>
                        <div className="text-xl font-black mt-1 text-foreground font-mono">
                            {tasks.length || 13}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Automated services</div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> Active & Scheduled
                        </div>
                        <div className="text-xl font-black mt-1 text-emerald-400 font-mono flex items-center gap-1.5">
                            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                            {activeCount} Active
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Operating normally</div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 text-sky-400" /> Next Upcoming Task
                        </div>
                        <div className="text-sm font-bold mt-1 text-sky-300 truncate" title={nextUpcomingTask?.name || "Evaluating"}>
                            {nextUpcomingTask ? nextUpcomingTask.nextRunRelative : "Calculating..."}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate" title={nextUpcomingTask?.name}>
                            {nextUpcomingTask?.name || "Standby"}
                        </div>
                    </div>

                    <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80">
                        <div className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5">
                            <ShieldCheck className="h-3.5 w-3.5 text-amber-400" /> Unraid Maintenance
                        </div>
                        <div className="text-sm font-bold mt-1 font-mono">
                            {isMaintenanceWindow ? (
                                <span className="text-amber-400 flex items-center gap-1">
                                    <AlertTriangle className="h-3.5 w-3.5 animate-pulse" /> Active (Paused)
                                </span>
                            ) : (
                                <span className="text-slate-300">Standby (5:00 AM)</span>
                            )}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">Daily 5:00–5:30 AM blackout</div>
                    </div>
                </div>

                {/* UNRAID MAINTENANCE WINDOW BANNER */}
                {isMaintenanceWindow ? (
                    <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        <div>
                            <span className="font-bold text-amber-300">Unraid Host Maintenance Blackout Active:</span>{" "}
                            Portalarr has safely paused all automated Plex server scans, friend syncs, and media requests until 5:30 AM to safeguard automated Unraid database integrity checks and Docker restarts.
                        </div>
                    </div>
                ) : (
                    <div className="p-3 rounded-xl bg-indigo-950/30 border border-indigo-900/40 text-slate-300 text-xs flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <Info className="h-4 w-4 text-indigo-400 shrink-0" />
                            <span>
                                <strong>Smart Host Protection:</strong> Background runners automatically pause every morning between <strong>5:00 AM – 5:30 AM</strong> to prevent spinning disk wakeups and container lockups during scheduled Unraid parity and database checks.
                            </span>
                        </div>
                    </div>
                )}

                {/* CATEGORY FILTER PILLS */}
                <div className="flex items-center gap-1.5 flex-wrap pt-1">
                    {[
                        { key: "all", label: "All Tasks", count: tasks.length },
                        { key: "plex", label: "Plex Server", count: tasks.filter(t => t.category === "plex").length },
                        { key: "curation", label: "Curation Studios", count: tasks.filter(t => t.category === "curation").length },
                        { key: "billing", label: "Billing & Subscriptions", count: tasks.filter(t => t.category === "billing").length },
                        { key: "requests", label: "Media Requests", count: tasks.filter(t => t.category === "requests").length },
                        { key: "bookshelf", label: "Bookshelf & Media", count: tasks.filter(t => t.category === "bookshelf").length },
                        { key: "system", label: "System & Access", count: tasks.filter(t => t.category === "system").length }
                    ].map((pill) => (
                        <button
                            key={pill.key}
                            type="button"
                            onClick={() => setSelectedCategory(pill.key as CategoryFilter)}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                                selectedCategory === pill.key
                                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 shadow-xs"
                                    : "text-muted-foreground hover:text-foreground bg-white/[0.03] border border-white/5 hover:bg-white/[0.06]"
                            }`}
                        >
                            <span>{pill.label}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-900/80 border border-slate-700/40 text-slate-400 font-mono">
                                {pill.count}
                            </span>
                        </button>
                    ))}
                </div>

                {/* SCHEDULES TASK LIST */}
                {loading ? (
                    <div className="py-12 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                        <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
                        <span className="text-xs">Loading system automation schedules...</span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredTasks.map((task) => {
                            const isRunning = runningTaskId === task.id;
                            const isMsgTarget = actionMsg?.id === task.id;

                            return (
                                <div
                                    key={task.id}
                                    className={`p-4 rounded-xl transition-all duration-200 border ${
                                        !task.enabled
                                            ? "bg-slate-950/40 border-slate-800/40 opacity-70"
                                            : "bg-[#161622]/90 border-slate-800/80 hover:border-slate-700/90 shadow-xs"
                                    }`}
                                >
                                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                        {/* LEFT: Task Info */}
                                        <div className="flex items-start gap-3 min-w-0 flex-1">
                                            <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 shrink-0 mt-0.5">
                                                {getCategoryIcon(task.category)}
                                            </div>
                                            <div className="space-y-1 min-w-0">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <span className="font-bold text-sm text-foreground">
                                                        {task.name}
                                                    </span>
                                                    <Badge variant="outline" className={`text-[10px] font-medium ${getCategoryBadgeClass(task.category)}`}>
                                                        {task.categoryLabel}
                                                    </Badge>
                                                    {task.isConfigurable && task.availableFrequencies ? (
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <Select
                                                                value={task.currentFrequencyValue || task.cadence}
                                                                onValueChange={(val) => handleFrequencyChange(task.id, val)}
                                                                disabled={updatingTaskId === task.id}
                                                            >
                                                                <SelectTrigger className="h-6 text-[10px] font-mono bg-slate-900/90 border-slate-700/80 text-indigo-300 hover:border-indigo-500/50 hover:bg-slate-800/80 px-2 py-0 w-auto min-w-[130px] gap-1 focus:ring-1 focus:ring-indigo-500">
                                                                    {updatingTaskId === task.id ? (
                                                                        <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                                                                    ) : (
                                                                        <Clock className="h-3 w-3 text-indigo-400 shrink-0" />
                                                                    )}
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent position="popper" className="bg-slate-950 border-slate-800 text-slate-200 z-50">
                                                                    {task.availableFrequencies.map((opt) => (
                                                                        <SelectItem key={opt.value} value={opt.value} className="text-xs font-mono py-1.5 focus:bg-indigo-600/20 focus:text-indigo-200 cursor-pointer">
                                                                            {opt.label}
                                                                        </SelectItem>
                                                                    ))}
                                                                </SelectContent>
                                                            </Select>
                                                            <Badge variant="outline" className="text-[9px] font-mono uppercase bg-indigo-500/10 text-indigo-300 border-indigo-500/30 hidden sm:inline-flex">
                                                                Editable
                                                            </Badge>
                                                        </div>
                                                    ) : (
                                                        <div className="inline-flex items-center gap-1.5">
                                                            <Badge variant="outline" className="text-[10px] font-mono bg-slate-900/60 border-slate-700/60 text-slate-300">
                                                                ⏱️ {task.cadenceLabel}
                                                            </Badge>
                                                            <Badge variant="outline" className="text-[9px] font-mono uppercase bg-slate-800/40 text-slate-400 border-slate-700/30 hidden sm:inline-flex">
                                                                Core Runner
                                                            </Badge>
                                                        </div>
                                                    )}
                                                </div>
                                                <p className="text-xs text-muted-foreground line-clamp-2">
                                                    {task.description}
                                                </p>
                                                <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-slate-400">
                                                    <div className="flex items-center gap-1 font-mono">
                                                        <span className="text-slate-500">Last run:</span>
                                                        <span className="text-slate-300">{task.lastRunDisplay}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* RIGHT: Next Run Countdown & Run Now Button */}
                                        <div className="flex flex-wrap items-center lg:flex-col lg:items-end justify-between gap-2 shrink-0 border-t lg:border-t-0 border-slate-800/60 pt-3 lg:pt-0">
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Next Run:</span>
                                                {task.status === "blackout" ? (
                                                    <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono">
                                                        ⚠️ Paused (Resumes 5:30 AM)
                                                    </Badge>
                                                ) : !task.enabled ? (
                                                    <Badge variant="outline" className="bg-slate-900/40 text-slate-400 border-slate-800 text-xs">
                                                        Disabled
                                                    </Badge>
                                                ) : task.isDue ? (
                                                    <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-mono animate-pulse">
                                                        ⚡ Due on next tick
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 text-xs font-mono">
                                                        ⏱️ {task.nextRunRelative}
                                                    </Badge>
                                                )}
                                            </div>

                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                disabled={isRunning}
                                                onClick={() => handleRunTask(task)}
                                                className="h-7 px-2.5 text-xs font-semibold gap-1.5 border-indigo-500/30 text-indigo-300 hover:bg-indigo-500/10 hover:border-indigo-500/50 active:scale-95 transition-all"
                                            >
                                                {isRunning ? (
                                                    <Loader2 className="h-3 w-3 animate-spin text-indigo-400" />
                                                ) : (
                                                    <Play className="h-3 w-3 text-indigo-400 fill-indigo-400/30" />
                                                )}
                                                <span>{isRunning ? "Executing..." : "Run Now"}</span>
                                            </Button>
                                        </div>
                                    </div>

                                    {/* Action Response Message */}
                                    {isMsgTarget && actionMsg && (
                                        <div className={`mt-3 p-2.5 rounded-lg border text-xs flex items-center gap-2 animate-in fade-in duration-200 ${
                                            actionMsg.success 
                                                ? "bg-emerald-950/40 text-emerald-300 border-emerald-800/40" 
                                                : "bg-red-950/40 text-red-300 border-red-800/40"
                                        }`}>
                                            {actionMsg.success ? (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                            ) : (
                                                <AlertCircle className="h-4 w-4 text-red-400 shrink-0" />
                                            )}
                                            <span className="font-medium">{actionMsg.text}</span>
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
