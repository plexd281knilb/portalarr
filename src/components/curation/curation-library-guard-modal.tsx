"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    AlertTriangle,
    CheckCircle2,
    Zap,
    X,
    HardDrive,
    Folder,
    Loader2,
    ArrowRight,
    ShieldAlert
} from "lucide-react";

export interface CurationLibraryGuardModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    featureName: string; // e.g. "Poster Overlays", "Collections & Playlists", "Prune Engine", "Media Tagging"
    serverName: string;
    libraryName: string;
    sectionKey?: string | number;
    actionName?: string; // e.g. "Apply Overlays", "Run Collection Sync", "Execute Prune", "Apply Parental Tags"
    onEnableAndRun: () => void | Promise<void>;
    onForceRun: () => void | Promise<void>;
    onCancel?: () => void;
}

export function CurationLibraryGuardModal({
    open,
    onOpenChange,
    featureName,
    serverName,
    libraryName,
    sectionKey,
    actionName = "Update",
    onEnableAndRun,
    onForceRun,
    onCancel
}: CurationLibraryGuardModalProps) {
    const [submittingAction, setSubmittingAction] = useState<"enable" | "force" | null>(null);

    const handleEnableAndRun = async () => {
        setSubmittingAction("enable");
        try {
            await onEnableAndRun();
            onOpenChange(false);
        } catch (err) {
            console.error("Failed running enable and run:", err);
        } finally {
            setSubmittingAction(null);
        }
    };

    const handleForceRun = async () => {
        setSubmittingAction("force");
        try {
            await onForceRun();
            onOpenChange(false);
        } catch (err) {
            console.error("Failed running force run:", err);
        } finally {
            setSubmittingAction(null);
        }
    };

    const handleCancel = () => {
        if (submittingAction) return;
        if (onCancel) {
            onCancel();
        }
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={(val) => {
            if (!val && submittingAction) return; // Prevent closing while action in flight
            if (!val && onCancel) onCancel();
            onOpenChange(val);
        }}>
            <DialogContent className="max-w-xl bg-slate-900 border-amber-500/40 text-slate-100 shadow-2xl p-6 sm:p-7">
                <DialogHeader className="space-y-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
                            <AlertTriangle className="h-6 w-6" />
                        </div>
                        <div>
                            <DialogTitle className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                                <span>Library Not Enabled on Schedule</span>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-amber-300/80 font-medium">
                                Protective Curation Guard • {featureName}
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                {/* Library Scope Information Box */}
                <div className="p-3.5 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2 mt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-xs text-slate-300">
                            <HardDrive className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                            <span className="font-semibold text-white">{serverName}</span>
                            <span className="text-slate-500">•</span>
                            <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                            <span className="text-slate-200">
                                {libraryName} {sectionKey ? <span className="text-slate-500 font-mono text-[11px]">(#{sectionKey})</span> : null}
                            </span>
                        </div>
                        <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-300 text-[10px] uppercase font-mono px-2 py-0.5">
                            ⚪ Excluded from Schedule
                        </Badge>
                    </div>
                </div>

                {/* Warning Context */}
                <div className="p-4 rounded-xl bg-amber-950/25 border border-amber-500/25 text-sm text-slate-200 space-y-2 leading-relaxed">
                    <p className="font-semibold text-amber-300 flex items-center gap-1.5 text-[13px]">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-amber-400" />
                        <span>Hey, you don't have this library turned on or enabled!</span>
                    </p>
                    <p className="text-xs text-slate-300 leading-normal">
                        You are about to run <strong>{actionName}</strong> on this library, but it is currently excluded from your automated {featureName} schedule. How would you like to proceed?
                    </p>
                </div>

                {/* 3 Numbered Action Choices */}
                <div className="space-y-2.5 pt-1">
                    {/* Option 1: Enable & Apply */}
                    <button
                        type="button"
                        disabled={submittingAction !== null}
                        onClick={handleEnableAndRun}
                        className="w-full text-left p-3.5 rounded-xl border border-emerald-500/40 bg-emerald-950/30 hover:bg-emerald-900/40 transition-all group flex items-start gap-3.5 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-400 font-bold text-sm border border-emerald-500/30 group-hover:scale-105 transition-transform">
                            {submittingAction === "enable" ? <Loader2 className="h-4 w-4 animate-spin" /> : "1"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 font-medium text-emerald-300 text-sm">
                                <span>Enable Library & {actionName}</span>
                                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/20 text-emerald-300 text-[10px] py-0 px-1.5 uppercase font-mono">
                                    Recommended
                                </Badge>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">
                                Turns this library <strong>ON</strong> permanently in your automation schedule, then executes the update immediately.
                            </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-emerald-400 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    {/* Option 2: Force Update (One-Time) */}
                    <button
                        type="button"
                        disabled={submittingAction !== null}
                        onClick={handleForceRun}
                        className="w-full text-left p-3.5 rounded-xl border border-amber-500/40 bg-amber-950/30 hover:bg-amber-900/40 transition-all group flex items-start gap-3.5 focus:outline-none focus:ring-2 focus:ring-amber-500/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-500/20 text-amber-400 font-bold text-sm border border-amber-500/30 group-hover:scale-105 transition-transform">
                            {submittingAction === "force" ? <Loader2 className="h-4 w-4 animate-spin" /> : "2"}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 font-medium text-amber-300 text-sm">
                                <span>Force Update (One-Time Override)</span>
                                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/20 text-amber-300 text-[10px] py-0 px-1.5 uppercase font-mono">
                                    One-Time
                                </Badge>
                            </div>
                            <p className="text-xs text-slate-300 mt-1">
                                Executes this update once right now, but keeps this library <strong>excluded</strong> for future automated scheduled runs.
                            </p>
                        </div>
                        <ArrowRight className="h-4 w-4 text-amber-400 shrink-0 mt-1 group-hover:translate-x-0.5 transition-transform" />
                    </button>

                    {/* Option 3: Cancel */}
                    <button
                        type="button"
                        disabled={submittingAction !== null}
                        onClick={handleCancel}
                        className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-950/60 hover:bg-slate-800/80 transition-all group flex items-start gap-3.5 focus:outline-none focus:ring-2 focus:ring-slate-500/50 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400 font-bold text-sm border border-slate-700 group-hover:scale-105 transition-transform">
                            3
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="font-medium text-slate-300 text-sm">
                                Cancel
                            </div>
                            <p className="text-xs text-slate-400 mt-1">
                                Abort this action immediately. No media will be modified.
                            </p>
                        </div>
                        <X className="h-4 w-4 text-slate-400 shrink-0 mt-1" />
                    </button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
