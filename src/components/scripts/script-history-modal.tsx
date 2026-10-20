"use client";

import { useState, useEffect } from "react";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
    History, 
    CheckCircle2, 
    XCircle, 
    Square, 
    Clock, 
    Copy, 
    Check, 
    Download, 
    Loader2, 
    FileText 
} from "lucide-react";
import { UserScript, ScriptRunRecord } from "@/lib/scripts/types";

interface ScriptHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    script: UserScript | null;
}

export function ScriptHistoryModal({
    isOpen,
    onClose,
    script
}: ScriptHistoryModalProps) {
    const [runs, setRuns] = useState<ScriptRunRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedRun, setSelectedRun] = useState<ScriptRunRecord | null>(null);
    const [runLog, setRunLog] = useState<string>("");
    const [loadingLog, setLoadingLog] = useState(false);
    const [copied, setCopied] = useState(false);

    const loadLog = (run: ScriptRunRecord) => {
        setSelectedRun(run);
        setLoadingLog(true);
        fetch(`/api/admin/scripts/${script?.id}?runId=${run.id}`)
            .then(res => res.json())
            .then(data => {
                setRunLog(data.content || run.logSnippet || "No log content recorded.");
            })
            .catch(() => {
                setRunLog(run.logSnippet || "Failed to load log.");
            })
            .finally(() => setLoadingLog(false));
    };

    useEffect(() => {
        if (!isOpen || !script) return;

        setLoading(true);
        setSelectedRun(null);
        setRunLog("");

        fetch(`/api/admin/scripts/${script.id}`)
            .then(res => res.json())
            .then(data => {
                if (data.runs) {
                    setRuns(data.runs);
                    if (data.runs.length > 0) {
                        loadLog(data.runs[0]);
                    }
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [isOpen, script]);

    const handleCopy = () => {
        navigator.clipboard.writeText(runLog);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([runLog], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${script?.filename || "script"}_${selectedRun?.id || "run"}.log`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const formatDuration = (ms?: number) => {
        if (!ms) return "< 1s";
        if (ms < 1000) return `${ms}ms`;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] flex flex-col bg-[#0d0e14] border-zinc-800 p-0 overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-zinc-800 bg-zinc-950/70">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 shrink-0">
                            <History className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                                <span>Execution History</span>
                                <Badge variant="outline" className="text-[10px] font-mono bg-zinc-900 border-zinc-700 text-zinc-300">
                                    {script?.filename}
                                </Badge>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                                Past execution logs and exit code outcomes.
                            </DialogDescription>
                        </div>
                    </div>
                </div>

                {/* Content Layout: Run list on left, Log viewer on right */}
                <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-3 min-h-[350px] sm:min-h-[420px]">
                    {/* Run List */}
                    <div className="border-b md:border-b-0 md:border-r border-zinc-800/80 bg-zinc-950/40 overflow-y-auto max-h-[30vh] md:max-h-[60vh] p-3 space-y-2">
                        {loading ? (
                            <div className="p-6 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                <span>Loading run records...</span>
                            </div>
                        ) : runs.length === 0 ? (
                            <div className="p-6 text-center text-xs text-zinc-500 italic">
                                No previous execution runs recorded for this script.
                            </div>
                        ) : (
                            runs.map((r) => {
                                const isSelected = selectedRun?.id === r.id;
                                return (
                                    <button
                                        key={r.id}
                                        onClick={() => loadLog(r)}
                                        className={`w-full text-left p-3 rounded-lg border transition-all duration-150 ${
                                            isSelected 
                                                ? "bg-zinc-800/90 border-zinc-600 shadow-sm" 
                                                : "bg-zinc-900/40 border-zinc-800/80 hover:bg-zinc-900/80"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between gap-1 mb-1">
                                            <div className="flex items-center gap-1.5">
                                                {r.status === "SUCCESS" ? (
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                                ) : r.status === "ABORTED" ? (
                                                    <Square className="h-3.5 w-3.5 text-orange-400 shrink-0" />
                                                ) : (
                                                    <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                                                )}
                                                <span className="text-xs font-semibold text-zinc-200">
                                                    {r.status === "SUCCESS" ? "Exit 0" : r.status === "ABORTED" ? "Aborted" : `Exit ${r.exitCode ?? 1}`}
                                                </span>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 uppercase bg-zinc-950 border-zinc-800 text-zinc-400">
                                                {r.runMode}
                                            </Badge>
                                        </div>
                                        <div className="text-[11px] text-zinc-400 flex items-center justify-between">
                                            <span>{new Date(r.startedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                                            <span className="text-zinc-500">{formatDuration(r.durationMs)}</span>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>

                    {/* Log Viewer */}
                    <div className="col-span-1 md:col-span-2 flex flex-col bg-[#07080b] overflow-hidden">
                        {/* Log actions header */}
                        <div className="px-4 py-2 border-b border-zinc-800/80 bg-zinc-950/70 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-zinc-400" />
                                <span className="text-xs font-mono text-zinc-300">
                                    {selectedRun ? `${selectedRun.id}.log` : "Select a run"}
                                </span>
                            </div>
                            {selectedRun && (
                                <div className="flex items-center gap-1.5">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleCopy}
                                        className="h-7 text-xs px-2 text-zinc-300 hover:text-white"
                                    >
                                        {copied ? <Check className="h-3 w-3 mr-1 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                                        {copied ? "Copied" : "Copy"}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={handleDownload}
                                        className="h-7 text-xs px-2 text-zinc-300 hover:text-white"
                                    >
                                        <Download className="h-3 w-3 mr-1" />
                                        Download
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Monospace log text */}
                        <div className="flex-1 p-3 sm:p-4 font-mono text-xs text-zinc-300 overflow-y-auto max-h-[38vh] md:max-h-[54vh] select-text whitespace-pre-wrap leading-relaxed">
                            {loadingLog ? (
                                <div className="p-6 text-center text-xs text-zinc-500 flex items-center justify-center gap-2">
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    <span>Reading log file...</span>
                                </div>
                            ) : runLog ? (
                                runLog
                            ) : (
                                <div className="text-zinc-500 italic">No log available.</div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="flex items-center justify-end px-4 sm:px-5 py-3 border-t border-zinc-800 bg-zinc-950/80">
                    <Button 
                        variant="default" 
                        size="sm" 
                        onClick={onClose}
                        className="h-8 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-200 w-full sm:w-auto"
                    >
                        Close
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
