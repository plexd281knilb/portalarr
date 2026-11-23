"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJsonWithTimeout, isStaleDeploymentError, triggerDeploymentRecoveryReload } from "@/lib/client-recovery";
import type { GamingPcSnapshot } from "@/lib/monitoring/gaming-pc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Bot,
    Cpu,
    Gauge,
    MemoryStick,
    Monitor,
    RefreshCw,
    Thermometer,
    Zap,
} from "lucide-react";

function formatMbToGb(mb: number): string {
    if (!mb || mb <= 0) return "0 MB";
    if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
    return `${Math.round(mb)} MB`;
}

function getMeterColor(percent: number): string {
    if (percent >= 90) return "bg-rose-500";
    if (percent >= 75) return "bg-amber-500";
    return "bg-emerald-500";
}

export default function GamingPcPanel({ compact = false }: { compact?: boolean }) {
    const [pc, setPc] = useState<GamingPcSnapshot | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef(false);

    async function loadData(isManual = false) {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        if (isManual) setRefreshing(true);
        try {
            const json = await fetchJsonWithTimeout<{ success: boolean; gamingPc?: GamingPcSnapshot; error?: string }>(
                "/api/admin/gaming-pc",
                {},
                12000
            );
            if (json?.success && json.gamingPc) {
                setPc(json.gamingPc);
                setError(null);
            } else if (json?.error) {
                setError(json.error);
            }
        } catch (err: any) {
            if (isStaleDeploymentError(err)) {
                triggerDeploymentRecoveryReload();
                return;
            }
            setError(err?.message || "Failed to query Gaming PC telemetry");
        } finally {
            inFlightRef.current = false;
            setLoading(false);
            setRefreshing(false);
        }
    }

    useEffect(() => {
        loadData(false);
        const timer = setInterval(() => {
            if (typeof document !== "undefined" && document.hidden) return;
            loadData(false);
        }, 15000);
        return () => clearInterval(timer);
    }, []);

    const isOnline = pc?.status === "ONLINE";
    const gpuPct = pc?.gpu?.utilizationPercent ?? 0;
    const vramPct = pc?.gpu?.vramPercent ?? 0;
    const cpuPct = pc?.cpu?.percent ?? 0;
    const memPct = pc?.memory?.percent ?? 0;
    const loadedModels = pc?.ollama?.loadedModels ?? [];
    const allGpuProcesses = pc?.gpu?.processes ?? [];
    const activeGpuProcesses = allGpuProcesses.filter(
        p => (p.gpuPercent || 0) > 0 || (p.encPercent || 0) > 0 || (p.decPercent || 0) > 0 || p.vramMb > 0
    );
    const displayedGpuProcesses = (activeGpuProcesses.length > 0 ? activeGpuProcesses : allGpuProcesses).slice(
        0,
        compact ? 3 : 5
    );

    return (
        <Card className="border border-border/70 dark:border-white/[0.08] bg-card/95 dark:bg-[#121218]/90 backdrop-blur-xl shadow-xl rounded-2xl">
            <CardHeader className="p-4 sm:p-5 border-b border-border/70 dark:border-white/[0.06] space-y-2.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                        <CardTitle className="flex items-center gap-2 text-base sm:text-lg font-bold tracking-tight text-foreground">
                            <Monitor className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                            Gaming PC (RTX 3080 AI Node)
                        </CardTitle>
                        <CardDescription className="text-xs text-muted-foreground">
                            Power state, RTX 3080 VRAM &amp; compute load, active Ollama models, and host resources
                        </CardDescription>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {pc && (
                            <>
                                <Badge
                                    variant="outline"
                                    className={`text-[11px] font-semibold tabular-nums ${
                                        isOnline
                                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                                            : "bg-slate-500/10 text-muted-foreground border-border/70 dark:border-white/10"
                                    }`}
                                >
                                    {isOnline ? "Awake / Online" : "Asleep / Offline"}
                                    {isOnline && pc.latencyMs !== undefined ? ` · ${pc.latencyMs}ms` : ""}
                                </Badge>
                                {isOnline && pc.ollama.online && (
                                    <Badge
                                        variant="outline"
                                        className="text-[11px] font-semibold tabular-nums bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/30"
                                    >
                                        Ollama Ready ({loadedModels.length} loaded)
                                    </Badge>
                                )}
                            </>
                        )}

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => loadData(true)}
                            disabled={refreshing}
                            className="h-7 px-2.5 text-xs bg-muted/60 dark:bg-black/40 border-border/70 dark:border-white/10"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
                {error && (
                    <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-700 dark:text-rose-300">
                        {error}
                    </div>
                )}

                {loading && !pc ? (
                    <div className="h-28 rounded-xl border border-border/60 dark:border-white/[0.06] bg-muted/30 dark:bg-white/[0.02] animate-pulse" />
                ) : !isOnline ? (
                    <div className="p-3.5 rounded-xl border border-border/70 dark:border-white/[0.08] bg-muted/40 dark:bg-white/[0.02] flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                        <div className="space-y-0.5">
                            <p className="font-semibold text-foreground">
                                Gaming PC ({pc?.lanIp || "192.168.10.246"}) is currently offline or asleep
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                                AI workloads automatically fail over to the phone cluster or built-in engine. If awake, ensure{" "}
                                <code className="font-mono">start-rtx3080.ps1</code> is running and pfSense forwards{" "}
                                <code className="font-mono">9178</code> / <code className="font-mono">11434</code>.
                            </p>
                        </div>
                        <span className="font-mono text-[10px] text-muted-foreground shrink-0">
                            {pc?.error || "Unreachable"}
                        </span>
                    </div>
                ) : (
                    <div className="space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                            {/* RTX 3080 GPU UTILIZATION */}
                            <div className="p-3 rounded-xl border border-border/70 dark:border-white/[0.08] bg-muted/40 dark:bg-white/[0.02] space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                                        <Gauge className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                                        RTX 3080 Load
                                    </span>
                                    <span className="font-mono font-bold text-foreground tabular-nums">{gpuPct}%</span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-background/80 dark:bg-white/10 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${getMeterColor(gpuPct)}`}
                                        style={{ width: `${Math.min(100, Math.max(0, gpuPct))}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                                    <span className="flex items-center gap-1">
                                        <Thermometer className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                                        {pc.gpu?.temperatureC !== null && pc.gpu?.temperatureC !== undefined
                                            ? `${pc.gpu.temperatureC}°C`
                                            : "Temp N/A"}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Zap className="h-3 w-3 text-sky-700 dark:text-sky-400" />
                                        {pc.gpu?.powerDrawW !== null && pc.gpu?.powerDrawW !== undefined
                                            ? `${pc.gpu.powerDrawW}W / ${pc.gpu.powerLimitW || 368}W`
                                            : "Power N/A"}
                                    </span>
                                </div>
                            </div>

                            {/* RTX 3080 VRAM */}
                            <div className="p-3 rounded-xl border border-border/70 dark:border-white/[0.08] bg-muted/40 dark:bg-white/[0.02] space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                                        <MemoryStick className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                        GPU VRAM
                                    </span>
                                    <span className="font-mono font-bold text-foreground tabular-nums">
                                        {vramPct}%
                                        <span className="font-normal text-muted-foreground">
                                            {" "}
                                            &middot; {formatMbToGb(pc.gpu?.vramUsedMb || 0)} / {formatMbToGb(pc.gpu?.vramTotalMb || 10240)}
                                        </span>
                                    </span>
                                </div>
                                <div className="h-1.5 w-full rounded-full bg-background/80 dark:bg-white/10 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full transition-all ${getMeterColor(vramPct)}`}
                                        style={{ width: `${Math.min(100, Math.max(0, vramPct))}%` }}
                                    />
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                                    <span>{pc.gpu?.name || "NVIDIA GeForce RTX 3080"}</span>
                                    {pc.gpu?.fanPercent !== null && pc.gpu?.fanPercent !== undefined && (
                                        <span>Fan {pc.gpu.fanPercent}%</span>
                                    )}
                                </div>
                            </div>

                            {/* HOST CPU & RAM */}
                            <div className="p-3 rounded-xl border border-border/70 dark:border-white/[0.08] bg-muted/40 dark:bg-white/[0.02] space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                                        <Cpu className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                                        Host CPU &amp; RAM
                                    </span>
                                    <span className="font-mono font-bold text-foreground tabular-nums">
                                        {pc.cpu ? `${cpuPct}%` : "Ollama Only"}
                                    </span>
                                </div>
                                {pc.memory ? (
                                    <>
                                        <div className="h-1.5 w-full rounded-full bg-background/80 dark:bg-white/10 overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all ${getMeterColor(memPct)}`}
                                                style={{ width: `${Math.min(100, Math.max(0, memPct))}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
                                            <span>{pc.cpu?.cores || 0} cores &middot; {pc.hostname}</span>
                                            <span>
                                                {formatMbToGb(pc.memory.usedMb)} / {formatMbToGb(pc.memory.totalMb)}
                                            </span>
                                        </div>
                                    </>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground">
                                        Start <code className="font-mono">gaming-pc-agent.py</code> (:9101) for full CPU/RAM &amp; temps.
                                    </p>
                                )}
                            </div>

                            {/* WHAT IS USING THE 3080 */}
                            <div className="p-3 rounded-xl border border-border/70 dark:border-white/[0.08] bg-muted/40 dark:bg-white/[0.02] space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                                        <Bot className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                        What&apos;s Using the 3080
                                    </span>
                                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                                        {pc.lanIp} &middot; {pc.telemetrySource === "agent" ? "Agent" : "Ollama"}
                                    </span>
                                </div>
                                {loadedModels.length > 0 || displayedGpuProcesses.length > 0 ? (
                                    <div className="space-y-1">
                                        {loadedModels.map((m, i) => (
                                            <div
                                                key={`ollama-${m.name}-${i}`}
                                                className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-md bg-background/70 dark:bg-black/30 border border-amber-500/25"
                                            >
                                                <span className="font-mono font-semibold text-foreground truncate">
                                                    Ollama: {m.name}
                                                </span>
                                                <span className="font-mono text-[10px] text-emerald-700 dark:text-emerald-400 shrink-0 tabular-nums">
                                                    {formatMbToGb(m.vramMb)} &middot; {m.gpuPercent}% GPU
                                                </span>
                                            </div>
                                        ))}
                                        {displayedGpuProcesses.map((p, i) => {
                                            const usageParts: string[] = [];
                                            if (p.vramMb > 0) usageParts.push(formatMbToGb(p.vramMb));
                                            if ((p.gpuPercent || 0) > 0) usageParts.push(`${p.gpuPercent}% GPU`);
                                            if ((p.encPercent || 0) > 0) usageParts.push(`ENC ${p.encPercent}%`);
                                            if ((p.decPercent || 0) > 0) usageParts.push(`DEC ${p.decPercent}%`);
                                            return (
                                                <div
                                                    key={`proc-${p.name}-${p.pid || i}`}
                                                    className="flex items-center justify-between gap-2 text-[11px] px-2 py-1 rounded-md bg-background/70 dark:bg-black/30 border border-border/60 dark:border-white/[0.06]"
                                                >
                                                    <span className="font-mono text-foreground truncate">{p.name}</span>
                                                    <span className="font-mono text-[10px] text-muted-foreground shrink-0 tabular-nums">
                                                        {usageParts.length > 0 ? usageParts.join(" · ") : "Attached"}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <p className="text-[11px] text-muted-foreground pt-0.5">
                                        Idle standby — {pc.ollama.availableModels.length > 0
                                            ? `${pc.ollama.availableModels.length} model(s) ready (${pc.ollama.availableModels.slice(0, 2).join(", ")})`
                                            : "no active GPU workloads"}
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
