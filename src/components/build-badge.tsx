"use client";

import { useState, useEffect } from "react";
import { getBuildTelemetry, VersionInfo } from "@/lib/version";
import { getSession } from "@/app/auth-actions";
import { Badge } from "@/components/ui/badge";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { 
    GitBranch, 
    GitCommit, 
    ExternalLink, 
    Check, 
    Copy, 
    Calendar, 
    Container, 
    Workflow,
    ShieldCheck,
    FlaskConical
} from "lucide-react";

interface BuildBadgeProps {
    variant?: "compact" | "full" | "subtle";
    className?: string;
    showModalOnClick?: boolean;
    isAdmin?: boolean;
}

export function BuildBadge({ 
    variant = "compact", 
    className = "", 
    showModalOnClick = true,
    isAdmin = false
}: BuildBadgeProps) {
    const [open, setOpen] = useState(false);
    const [copied, setCopied] = useState(false);
    const [adminAccess, setAdminAccess] = useState<boolean>(isAdmin ?? false);
    const telemetry: VersionInfo = getBuildTelemetry();

    useEffect(() => {
        if (isAdmin !== undefined) {
            setAdminAccess(isAdmin);
        } else {
            getSession()
                .then((session) => {
                    setAdminAccess(session?.role === "ADMIN");
                })
                .catch(() => {
                    setAdminAccess(false);
                });
        }
    }, [isAdmin]);

    const handleCopySha = () => {
        if (telemetry.commitSha) {
            navigator.clipboard.writeText(telemetry.commitSha);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const isBeta = telemetry.isBeta;
    const isStable = telemetry.isStable;
    const canInteract = adminAccess && showModalOnClick;

    const formattedDate = telemetry.buildTimestamp 
        ? (() => {
            try {
                return new Date(telemetry.buildTimestamp).toLocaleString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit"
                });
            } catch {
                return telemetry.buildTimestamp;
            }
        })()
        : "Development Build";

    // Non-admin static presentation: clean indicator with zero click interactivity
    if (!canInteract) {
        if (variant === "compact") {
            return (
                <div
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] uppercase font-bold tracking-wider select-none cursor-default ${
                        isBeta 
                            ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 shadow-[0_0_8px_rgba(168,85,247,0.15)]" 
                            : isStable 
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shadow-[0_0_8px_rgba(52,211,153,0.15)]"
                            : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                    } ${className}`}
                >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        isBeta ? "bg-purple-400 animate-pulse" : isStable ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                    }`} />
                    <span>{telemetry.displayBadge}</span>
                </div>
            );
        }

        if (variant === "full") {
            return (
                <div
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold border select-none cursor-default ${
                        isBeta
                            ? "bg-purple-500/10 text-purple-300 border-purple-500/30"
                            : isStable
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                    } ${className}`}
                >
                    {isBeta ? (
                        <FlaskConical className="h-3.5 w-3.5 text-purple-400 shrink-0 animate-pulse" />
                    ) : isStable ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                        <Workflow className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    )}
                    <span className="font-bold tracking-tight">
                        {isBeta ? "Beta Preview" : isStable ? "Production" : "Development"}
                    </span>
                    <span className="opacity-40">•</span>
                    <span className="font-mono text-[11px]">v{telemetry.version}</span>
                </div>
            );
        }

        // variant === "subtle"
        return (
            <div 
                className={`text-[11px] font-mono text-muted-foreground/75 flex items-center gap-1.5 select-none cursor-default ${className}`}
            >
                <span className={`h-1.5 w-1.5 rounded-full ${isBeta ? "bg-purple-400" : isStable ? "bg-emerald-400" : "bg-amber-400"}`} />
                <span>{telemetry.branch}</span>
                {telemetry.buildNumber && <span>• #{telemetry.buildNumber}</span>}
                {telemetry.commitShortSha && <span>• {telemetry.commitShortSha}</span>}
            </div>
        );
    }

    // Administrator interactive presentation: full diagnostics modal access
    return (
        <>
            {variant === "compact" && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-mono text-[10px] uppercase font-bold tracking-wider transition-all duration-200 cursor-pointer ${
                        isBeta 
                            ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 hover:bg-purple-500/25 hover:border-purple-500/50 shadow-[0_0_8px_rgba(168,85,247,0.2)]" 
                            : isStable 
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 hover:border-emerald-500/50 shadow-[0_0_8px_rgba(52,211,153,0.2)]"
                            : "bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 hover:border-amber-500/50"
                    } ${className}`}
                    title="Click to view build & workflow details (Admin Only)"
                >
                    <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                        isBeta ? "bg-purple-400 animate-pulse" : isStable ? "bg-emerald-400" : "bg-amber-400 animate-pulse"
                    }`} />
                    <span>{telemetry.displayBadge}</span>
                </button>
            )}

            {variant === "full" && (
                <button
                    type="button"
                    onClick={() => setOpen(true)}
                    className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-lg text-xs font-semibold border transition-all duration-200 cursor-pointer ${
                        isBeta
                            ? "bg-purple-500/10 text-purple-300 border-purple-500/30 hover:bg-purple-500/20 hover:border-purple-500/50 shadow-sm"
                            : isStable
                            ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20 hover:border-emerald-500/50 shadow-sm"
                            : "bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 hover:border-amber-500/50 shadow-sm"
                    } ${className}`}
                    title="Click for full build & workflow details (Admin Only)"
                >
                    {isBeta ? (
                        <FlaskConical className="h-3.5 w-3.5 text-purple-400 shrink-0 animate-pulse" />
                    ) : isStable ? (
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                    ) : (
                        <Workflow className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                    )}
                    <span className="font-bold tracking-tight">
                        {isBeta ? "BETA (main)" : isStable ? "PROD (stable)" : "DEV"}
                    </span>
                    <span className="opacity-40">•</span>
                    <span className="font-mono text-[11px]">v{telemetry.version}</span>
                    {telemetry.commitShortSha && telemetry.commitShortSha !== "dev" && telemetry.commitShortSha !== "latest" && (
                        <>
                            <span className="opacity-40">•</span>
                            <span className="font-mono text-[11px] opacity-75">[{telemetry.commitShortSha}]</span>
                        </>
                    )}
                    {telemetry.buildNumber && (
                        <Badge variant="outline" className="text-[10px] h-4.5 px-1.5 font-mono bg-white/5 border-white/20">
                            build #{telemetry.buildNumber}
                        </Badge>
                    )}
                </button>
            )}

            {variant === "subtle" && (
                <div 
                    onClick={() => setOpen(true)}
                    className={`text-[11px] font-mono text-muted-foreground/75 hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5 ${className}`}
                    title="Click to view build details (Admin Only)"
                >
                    <span className={`h-1.5 w-1.5 rounded-full ${isBeta ? "bg-purple-400" : isStable ? "bg-emerald-400" : "bg-amber-400"}`} />
                    <span>{telemetry.branch}</span>
                    {telemetry.buildNumber && <span>• #{telemetry.buildNumber}</span>}
                    {telemetry.commitShortSha && <span>• {telemetry.commitShortSha}</span>}
                </div>
            )}

            {/* Build & Workflow Diagnostics Modal (Admin Only) */}
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-md bg-[#101014] border-border/50 text-foreground p-6 shadow-2xl rounded-2xl max-h-[90vh] overflow-y-auto scrollbar-thin">
                    <DialogHeader className="space-y-1">
                        <div className="flex items-center gap-2">
                            <div className={`p-2 rounded-xl ${
                                isBeta ? "bg-purple-500/15 text-purple-400" : isStable ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
                            }`}>
                                {isBeta ? <FlaskConical className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
                            </div>
                            <div>
                                <DialogTitle className="text-base font-extrabold flex items-center gap-2">
                                    <span>{isBeta ? "Beta Preview Environment" : isStable ? "Production Release Environment" : "Development Environment"}</span>
                                </DialogTitle>
                                <DialogDescription className="text-xs text-muted-foreground">
                                    Active Docker container build &amp; workflow telemetry
                                </DialogDescription>
                            </div>
                        </div>
                    </DialogHeader>

                    <div className="space-y-3 pt-3">
                        {/* Status banner */}
                        <div className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
                            isBeta 
                                ? "bg-purple-500/10 border-purple-500/30 text-purple-300"
                                : isStable
                                ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                : "bg-amber-500/10 border-amber-500/30 text-amber-300"
                        }`}>
                            <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${isBeta ? "bg-purple-400 animate-pulse" : "bg-emerald-400"}`} />
                                <span>Running {isBeta ? "Beta (main branch)" : isStable ? "Production (stable branch)" : "Local Development"}</span>
                            </div>
                            <span className="font-mono text-[11px] font-bold">v{telemetry.version}</span>
                        </div>

                        {/* Telemetry specs grid */}
                        <div className="space-y-2 text-xs divide-y divide-border/20">
                            <div className="flex items-center justify-between py-1.5">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
                                    Git Branch
                                </span>
                                <Badge variant="outline" className="font-mono text-[11px] bg-white/[0.03]">
                                    {telemetry.branch}
                                </Badge>
                            </div>

                            <div className="flex items-center justify-between py-1.5">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <GitCommit className="h-3.5 w-3.5 text-muted-foreground" />
                                    Commit SHA
                                </span>
                                <div className="flex items-center gap-1.5">
                                    <span className="font-mono text-[11px] text-foreground font-semibold">
                                        {telemetry.commitShortSha}
                                    </span>
                                    {telemetry.commitSha && telemetry.commitSha !== "dev" && (
                                        <button
                                            type="button"
                                            onClick={handleCopySha}
                                            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                            title="Copy full SHA"
                                        >
                                            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {telemetry.buildNumber && (
                                <div className="flex items-center justify-between py-1.5">
                                    <span className="text-muted-foreground flex items-center gap-2">
                                        <Workflow className="h-3.5 w-3.5 text-muted-foreground" />
                                        Workflow Build Run
                                    </span>
                                    <span className="font-mono text-[11px] font-bold text-foreground">
                                        #{telemetry.buildNumber}
                                    </span>
                                </div>
                            )}

                            <div className="flex items-center justify-between py-1.5">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    Built At
                                </span>
                                <span className="text-[11px] text-foreground">
                                    {formattedDate}
                                </span>
                            </div>

                            <div className="flex items-center justify-between py-1.5">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Container className="h-3.5 w-3.5 text-muted-foreground" />
                                    Docker Image Target
                                </span>
                                <span className="font-mono text-[10px] text-muted-foreground truncate max-w-[210px]" title={telemetry.dockerImageTag}>
                                    {telemetry.dockerImageTag.replace("ghcr.io/plexd281knilb/", "")}
                                </span>
                            </div>
                        </div>

                        {/* Branch info summary */}
                        <div className="p-3 rounded-xl bg-white/[0.02] border border-border/30 text-[11px] text-muted-foreground space-y-1">
                            <p className="font-semibold text-foreground">
                                {isBeta ? "🧪 Beta Channel (Main Branch)" : "🛡️ Production Channel (Stable Branch)"}
                            </p>
                            <p>
                                {isBeta 
                                    ? "Receives rolling feature updates, new diagnostics, and experimental curation tools directly from active commits."
                                    : "Locked to verified production releases. Fully tested for rock-solid stability in daily homelab operation."}
                            </p>
                        </div>

                        {telemetry.workflowUrl && (
                            <Button asChild size="sm" variant="outline" className="w-full text-xs h-9 border-border/40 hover:bg-white/5 cursor-pointer">
                                <a href={telemetry.workflowUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5">
                                    <ExternalLink className="h-3.5 w-3.5" /> View GitHub Actions Workflow Runs
                                </a>
                            </Button>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
