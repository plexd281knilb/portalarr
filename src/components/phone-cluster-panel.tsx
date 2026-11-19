"use client";

import { useEffect, useRef, useState } from "react";
import { fetchJsonWithTimeout, isStaleDeploymentError, triggerDeploymentRecoveryReload } from "@/lib/client-recovery";
import type { PhoneClusterResponse, PhoneClusterSummary, PhoneTelemetrySnapshot } from "@/lib/monitoring/phone-cluster";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Activity,
    AlertTriangle,
    Battery,
    BatteryCharging,
    BatteryWarning,
    Cpu,
    MemoryStick,
    RefreshCw,
    Smartphone,
    Thermometer,
} from "lucide-react";

const EMPTY_SUMMARY: PhoneClusterSummary = {
    totalPhones: 0,
    onlineCount: 0,
    offlineCount: 0,
    avgCpuPercent: 0,
    avgMemoryPercent: 0,
    totalMemoryMb: 0,
    usedMemoryMb: 0,
    batteryReportedCount: 0,
    avgBatteryPercent: null,
    chargingCount: 0,
};

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

function getBatteryColor(percent: number): string {
    if (percent <= 20) return "text-rose-700 dark:text-rose-400";
    if (percent <= 40) return "text-amber-700 dark:text-amber-400";
    return "text-emerald-700 dark:text-emerald-400";
}

export default function PhoneClusterPanel({ compact = false }: { compact?: boolean }) {
    const [nodes, setNodes] = useState<PhoneTelemetrySnapshot[]>([]);
    const [summary, setSummary] = useState<PhoneClusterSummary>(EMPTY_SUMMARY);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const inFlightRef = useRef(false);

    const loadPhones = async (isManual = false) => {
        if (!isManual && inFlightRef.current) return;
        inFlightRef.current = true;
        if (isManual) setRefreshing(true);
        try {
            const res = await fetchJsonWithTimeout<PhoneClusterResponse>("/api/admin/phone-cluster", {}, 10000);
            if (res && res.success) {
                setNodes(res.nodes || []);
                setSummary(res.summary || EMPTY_SUMMARY);
                setError(null);
            } else {
                setError("Unable to load phone cluster telemetry.");
            }
        } catch (err: any) {
            if (isStaleDeploymentError(err)) {
                triggerDeploymentRecoveryReload();
                return;
            }
            setError(err?.message || "Failed to reach phone cluster API.");
        } finally {
            inFlightRef.current = false;
            setLoading(false);
            setRefreshing(false);
        }
    };

    useEffect(() => {
        loadPhones();
        const interval = setInterval(() => {
            if (typeof document !== "undefined" && document.hidden) return;
            loadPhones();
        }, 15000);
        return () => clearInterval(interval);
    }, []);

    return (
        <Card className="border border-border/70 dark:border-white/[0.08] bg-card/95 dark:bg-[#121218]/90 backdrop-blur-xl shadow-xl rounded-2xl overflow-hidden">
            <CardHeader className="p-4 sm:p-5 border-b border-border/70 dark:border-white/[0.06] space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                        <div className="p-2 rounded-xl bg-sky-500/10 text-sky-700 dark:text-sky-400 border border-sky-500/20 shrink-0">
                            <Smartphone className="h-5 w-5" />
                        </div>
                        <div className="space-y-0.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <CardTitle className="text-base font-bold text-foreground">
                                    Android K3s Phone Cluster
                                </CardTitle>
                                <Badge
                                    variant="outline"
                                    className={`text-[10px] font-semibold tabular-nums ${
                                        summary.offlineCount === 0 && summary.onlineCount > 0
                                            ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                                            : summary.onlineCount > 0
                                                ? "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30"
                                                : "bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/30"
                                    }`}
                                >
                                    {summary.onlineCount}/{summary.totalPhones || 3} Online
                                </Badge>
                            </div>
                            <CardDescription className="text-xs text-muted-foreground">
                                Live Termux hardware telemetry across the 3-node Galaxy S22 &amp; S9 LAN Kubernetes cluster (port 9100).
                            </CardDescription>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto shrink-0">
                        {!compact && summary.totalPhones > 0 && (
                            <div className="hidden xl:flex items-center gap-3 px-3 py-1.5 rounded-xl bg-muted/50 dark:bg-white/[0.03] border border-border/70 dark:border-white/[0.06] text-xs text-muted-foreground tabular-nums">
                                <span>
                                    Avg CPU <strong className="text-foreground">{summary.avgCpuPercent}%</strong>
                                </span>
                                <span aria-hidden="true">&middot;</span>
                                <span>
                                    RAM <strong className="text-foreground">{formatMbToGb(summary.usedMemoryMb)}</strong> / {formatMbToGb(summary.totalMemoryMb)}
                                </span>
                                {summary.avgBatteryPercent !== null && (
                                    <>
                                        <span aria-hidden="true">&middot;</span>
                                        <span>
                                            Avg Bat <strong className="text-foreground">{summary.avgBatteryPercent}%</strong>
                                        </span>
                                    </>
                                )}
                            </div>
                        )}
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => loadPhones(true)}
                            disabled={refreshing}
                            className="h-8 px-2.5 text-xs gap-1.5 border-border/60 hover:bg-accent dark:hover:bg-white/[0.04]"
                        >
                            <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin text-primary" : ""}`} />
                            <span>Refresh</span>
                        </Button>
                    </div>
                </div>
            </CardHeader>

            <CardContent className="p-4 sm:p-5">
                {error && nodes.length === 0 ? (
                    <div className="py-8 flex flex-col items-center justify-center gap-2 text-center">
                        <AlertTriangle className="h-5 w-5 text-amber-700 dark:text-amber-400" />
                        <p className="text-xs text-muted-foreground">{error}</p>
                    </div>
                ) : loading && nodes.length === 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        {[0, 1, 2].map(idx => (
                            <div
                                key={idx}
                                className="h-44 rounded-xl border border-border/70 dark:border-white/[0.06] bg-muted/40 dark:bg-white/[0.02] animate-pulse"
                            />
                        ))}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                        {nodes.map(node => {
                            const isOnline = node.status === "ONLINE";
                            const cpuPct = node.cpu?.percent ?? 0;
                            const memPct = node.memory?.percent ?? 0;
                            const bat = node.battery;
                            const isCharging =
                                bat.status.toUpperCase() === "CHARGING" ||
                                bat.status.toUpperCase() === "FULL" ||
                                (bat.plugged !== "UNPLUGGED" && bat.plugged !== "UNKNOWN");

                            return (
                                <div
                                    key={node.id}
                                    className={`p-3.5 rounded-xl border transition-all space-y-3 ${
                                        isOnline
                                            ? "bg-muted/50 dark:bg-white/[0.02] border-border/70 dark:border-white/[0.06]"
                                            : "bg-rose-500/10 dark:bg-rose-950/20 border-rose-500/40"
                                    }`}
                                >
                                    {/* HEADER */}
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-xs font-bold text-foreground truncate" title={node.name}>
                                                    {node.name}
                                                </h4>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[9px] font-semibold px-1.5 py-0 uppercase ${
                                                        node.role === "master"
                                                            ? "bg-sky-500/10 text-sky-700 dark:text-sky-400 border-sky-500/30"
                                                            : "bg-muted/60 text-muted-foreground border-border/70 dark:border-white/10"
                                                    }`}
                                                >
                                                    {node.role}
                                                </Badge>
                                            </div>
                                            <p className="text-[11px] text-muted-foreground truncate pt-0.5">
                                                {node.device
                                                    ? `${node.device.manufacturer} ${node.device.model} (Android ${node.device.androidVersion || "?"})`
                                                    : node.label}
                                            </p>
                                            <p className="text-[10px] font-mono text-muted-foreground/80 tabular-nums">
                                                {node.lanIp}:9100
                                            </p>
                                        </div>

                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                            <span
                                                className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider ${
                                                    isOnline
                                                        ? "text-emerald-700 dark:text-emerald-400"
                                                        : "text-rose-700 dark:text-rose-400"
                                                }`}
                                            >
                                                <span
                                                    className={`w-2 h-2 rounded-full ${
                                                        isOnline ? "bg-emerald-500" : "bg-rose-500 animate-pulse"
                                                    }`}
                                                />
                                                {node.status}
                                            </span>
                                            {isOnline && node.latencyMs !== undefined && (
                                                <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                                                    {node.latencyMs}ms
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {!isOnline ? (
                                        <div className="p-2.5 rounded-lg bg-background/60 dark:bg-black/30 border border-rose-500/30 text-[11px] text-rose-700 dark:text-rose-300">
                                            Telemetry agent unreachable ({node.error || "offline"}). Start{" "}
                                            <code className="font-mono">phone-telemetry-agent.py</code> in Termux.
                                        </div>
                                    ) : (
                                        <div className="space-y-2.5">
                                            {/* BATTERY */}
                                            <div className="p-2 rounded-lg bg-muted/60 dark:bg-black/30 border border-border/70 dark:border-white/[0.05] space-y-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                                                        {bat.available ? (
                                                            isCharging ? (
                                                                <BatteryCharging className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                                                            ) : (
                                                                <Battery className={`h-3.5 w-3.5 ${getBatteryColor(bat.percentage ?? 100)}`} />
                                                            )
                                                        ) : (
                                                            <BatteryWarning className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                                                        )}
                                                        Battery
                                                    </span>
                                                    {bat.available && bat.percentage !== null ? (
                                                        <span className={`font-bold tabular-nums ${getBatteryColor(bat.percentage)}`}>
                                                            {bat.percentage}% &middot; {isCharging ? "Charging" : bat.status}
                                                        </span>
                                                    ) : (
                                                        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">
                                                            Termux:API app required
                                                        </span>
                                                    )}
                                                </div>
                                                {bat.available && bat.percentage !== null && (
                                                    <div className="h-1.5 w-full rounded-full bg-background/80 dark:bg-white/10 overflow-hidden">
                                                        <div
                                                            className={`h-full rounded-full transition-all ${
                                                                bat.percentage <= 20
                                                                    ? "bg-rose-500"
                                                                    : bat.percentage <= 40
                                                                        ? "bg-amber-500"
                                                                        : "bg-emerald-500"
                                                            }`}
                                                            style={{ width: `${Math.min(100, Math.max(0, bat.percentage))}%` }}
                                                        />
                                                    </div>
                                                )}
                                            </div>

                                            {/* CPU */}
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                                                        <Cpu className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400" />
                                                        CPU ({node.cpu?.cores || 8} cores)
                                                    </span>
                                                    <span className="font-mono font-bold text-foreground tabular-nums">
                                                        {cpuPct}%
                                                        <span className="font-normal text-muted-foreground">
                                                            {" "}
                                                            &middot; load {node.cpu?.load1?.toFixed(2) ?? "0.00"}
                                                        </span>
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full rounded-full bg-background/80 dark:bg-white/10 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${getMeterColor(cpuPct)}`}
                                                        style={{ width: `${Math.min(100, Math.max(0, cpuPct))}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* MEMORY */}
                                            <div className="space-y-1">
                                                <div className="flex items-center justify-between text-[11px]">
                                                    <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
                                                        <MemoryStick className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                                                        Memory
                                                    </span>
                                                    <span className="font-mono font-bold text-foreground tabular-nums">
                                                        {memPct}%
                                                        <span className="font-normal text-muted-foreground">
                                                            {" "}
                                                            &middot; {formatMbToGb(node.memory?.usedMb || 0)} / {formatMbToGb(node.memory?.totalMb || 0)}
                                                        </span>
                                                    </span>
                                                </div>
                                                <div className="h-1.5 w-full rounded-full bg-background/80 dark:bg-white/10 overflow-hidden">
                                                    <div
                                                        className={`h-full rounded-full transition-all ${getMeterColor(memPct)}`}
                                                        style={{ width: `${Math.min(100, Math.max(0, memPct))}%` }}
                                                    />
                                                </div>
                                            </div>

                                            {/* FOOTER METADATA */}
                                            <div className="flex flex-wrap items-center justify-between gap-2 pt-1.5 border-t border-border/70 dark:border-white/[0.04] text-[10px] text-muted-foreground tabular-nums">
                                                <span className="flex items-center gap-1">
                                                    <Thermometer className="h-3 w-3 text-amber-700 dark:text-amber-400" />
                                                    {node.thermal?.socTempC !== null && node.thermal?.socTempC !== undefined
                                                        ? `${node.thermal.socTempC}°C SoC`
                                                        : "Temp N/A"}
                                                </span>
                                                <span className="flex items-center gap-1 font-mono">
                                                    <Activity className="h-3 w-3 text-sky-700 dark:text-sky-400" />
                                                    {node.qemu?.running
                                                        ? `QEMU ${node.qemu.cpuset || "active"}`
                                                        : "QEMU stopped"}
                                                </span>
                                            </div>
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
