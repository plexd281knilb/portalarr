"use client";

import { useState, useEffect, useRef } from "react";
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
    Terminal, 
    Play, 
    Square, 
    Copy, 
    Check, 
    Download, 
    Trash2, 
    AlertTriangle, 
    Loader2, 
    CheckCircle2, 
    XCircle,
    ArrowDown
} from "lucide-react";
import { UserScript, ScriptStatus } from "@/lib/scripts/types";

interface ScriptTerminalModalProps {
    isOpen: boolean;
    onClose: () => void;
    script: UserScript | null;
    customCode?: string;
    onFinished?: () => void;
}

export function ScriptTerminalModal({
    isOpen,
    onClose,
    script,
    customCode,
    onFinished
}: ScriptTerminalModalProps) {
    const [logs, setLogs] = useState<string[]>([]);
    const [status, setStatus] = useState<ScriptStatus>("RUNNING");
    const [exitCode, setExitCode] = useState<number | null>(null);
    const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
    const [autoScroll, setAutoScroll] = useState<boolean>(true);
    const [copied, setCopied] = useState<boolean>(false);
    
    const abortControllerRef = useRef<AbortController | null>(null);
    const terminalEndRef = useRef<HTMLDivElement | null>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Start execution when modal opens with a valid script
    useEffect(() => {
        if (!isOpen || !script) {
            return;
        }

        setLogs([]);
        setStatus("RUNNING");
        setExitCode(null);
        setElapsedSeconds(0);

        const controller = new AbortController();
        abortControllerRef.current = controller;

        const startTime = Date.now();
        timerRef.current = setInterval(() => {
            setElapsedSeconds(Math.floor((Date.now() - startTime) / 1000));
        }, 1000);

        async function startStreaming() {
            try {
                const response = await fetch("/api/admin/scripts/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        scriptId: script?.id,
                        customCode: customCode || undefined
                    }),
                    signal: controller.signal
                });

                if (!response.ok || !response.body) {
                    const errText = await response.text().catch(() => "Stream connection failed");
                    setLogs(prev => [...prev, `[ERROR] Connection failed (${response.status}): ${errText}`]);
                    setStatus("FAILED");
                    setExitCode(1);
                    return;
                }

                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split("\n");
                    buffer = lines.pop() || "";

                    if (lines.length > 0) {
                        setLogs(prev => [...prev, ...lines]);
                    }
                }

                if (buffer.trim()) {
                    setLogs(prev => [...prev, buffer]);
                }

                // If not marked aborted or failed by logs, check final status
                setStatus(prev => {
                    if (prev === "ABORTED" || prev === "FAILED") return prev;
                    return "SUCCESS";
                });
                setExitCode(0);
            } catch (err: any) {
                if (err.name === "AbortError") {
                    setLogs(prev => [...prev, "[ABORTED] Script execution was aborted by user."]);
                    setStatus("ABORTED");
                    setExitCode(130);
                } else {
                    setLogs(prev => [...prev, `[ERROR] Execution stream interrupted: ${err.message}`]);
                    setStatus("FAILED");
                    setExitCode(1);
                }
            } finally {
                if (timerRef.current) clearInterval(timerRef.current);
                if (onFinished) onFinished();
            }
        }

        startStreaming();

        return () => {
            if (abortControllerRef.current) {
                abortControllerRef.current.abort();
            }
            if (timerRef.current) {
                clearInterval(timerRef.current);
            }
        };
    }, [isOpen, script, customCode]);

    // Auto-scroll terminal
    useEffect(() => {
        if (autoScroll && terminalEndRef.current) {
            terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, autoScroll]);

    const handleAbort = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const handleCopy = () => {
        navigator.clipboard.writeText(logs.join("\n"));
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownload = () => {
        const blob = new Blob([logs.join("\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${script?.filename || "script"}_output_${Date.now()}.log`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleClear = () => {
        setLogs([]);
    };

    const formatTimer = (totalSeconds: number) => {
        const mins = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
        const secs = (totalSeconds % 60).toString().padStart(2, "0");
        return `${mins}:${secs}`;
    };

    // Color-code log line
    const renderFormattedLine = (line: string, index: number) => {
        if (!line) return null;

        // The top abort notice line
        if (line.includes("Note that closing this window will abort the execution of this script")) {
            return (
                <div key={index} className="text-amber-300 font-semibold bg-amber-950/40 border border-amber-500/30 px-2 py-1 rounded my-1 flex items-center gap-1.5 select-none">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                    <span>{line}</span>
                </div>
            );
        }

        let textColor = "text-zinc-300";
        if (line.includes("[OK]") || line.includes("SUCCESS")) {
            textColor = "text-emerald-400";
        } else if (line.includes("[FAIL]") || line.includes("[ERROR]") || line.includes("[FATAL]")) {
            textColor = "text-rose-400 font-semibold";
        } else if (line.includes("[WARN]")) {
            textColor = "text-amber-400";
        } else if (line.includes("--- Checking") || line.includes("--- Optimizing") || line.includes("---")) {
            textColor = "text-indigo-300 font-medium";
        } else if (line.includes("[ABORTED]")) {
            textColor = "text-orange-400 font-semibold";
        }

        // Highlight timestamp [YYYY-MM-DD HH:MM:SS]
        const match = line.match(/^(\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\])\s*(.*)$/);
        if (match) {
            const [, timestamp, rest] = match;
            return (
                <div key={index} className={`font-mono leading-relaxed whitespace-pre-wrap ${textColor}`}>
                    <span className="text-sky-400/70 select-none mr-2">{timestamp}</span>
                    <span>{rest}</span>
                </div>
            );
        }

        return (
            <div key={index} className={`font-mono leading-relaxed whitespace-pre-wrap ${textColor}`}>
                {line}
            </div>
        );
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => {
            if (!open) {
                // If closing while running, abort execution
                if (status === "RUNNING") {
                    handleAbort();
                }
                onClose();
            }
        }}>
            <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] flex flex-col bg-[#0b0c10] border-zinc-800 p-0 overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-zinc-800/80 bg-zinc-950/70">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                            <Terminal className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                                <span>{script?.name || "Terminal Output"}</span>
                                <Badge variant="outline" className="text-[10px] font-mono bg-zinc-900 border-zinc-700 text-zinc-300">
                                    {script?.filename}
                                </Badge>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                                Live Interactive Script Execution
                            </DialogDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                        {status === "RUNNING" && (
                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1.5 animate-pulse text-xs">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                <span>RUNNING ({formatTimer(elapsedSeconds)})</span>
                            </Badge>
                        )}
                        {status === "SUCCESS" && (
                            <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1.5 text-xs">
                                <CheckCircle2 className="h-3 w-3" />
                                <span>COMPLETED (Exit 0 • {formatTimer(elapsedSeconds)})</span>
                            </Badge>
                        )}
                        {status === "FAILED" && (
                            <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 text-xs">
                                <XCircle className="h-3 w-3" />
                                <span>FAILED (Exit {exitCode ?? 1})</span>
                            </Badge>
                        )}
                        {status === "ABORTED" && (
                            <Badge className="bg-orange-500/20 text-orange-300 border border-orange-500/40 flex items-center gap-1.5 text-xs">
                                <Square className="h-3 w-3" />
                                <span>ABORTED</span>
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Prominent Unraid-Style Notice Banner */}
                <div className="px-4 sm:px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/20 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-amber-200">
                    <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                        <span>Note that closing this window will abort the execution of this script</span>
                    </div>
                    {status === "RUNNING" && (
                        <Button 
                            variant="destructive" 
                            size="sm" 
                            onClick={handleAbort}
                            className="h-6 text-xs px-2.5 bg-rose-600 hover:bg-rose-700 text-white self-start sm:self-auto"
                        >
                            <Square className="h-3 w-3 mr-1" />
                            Abort Script
                        </Button>
                    )}
                </div>

                {/* Monospace Terminal Body */}
                <div className="flex-1 p-4 bg-[#07080b] font-mono text-xs overflow-y-auto max-h-[56vh] min-h-[350px] space-y-1 select-text scrollbar-thin scrollbar-thumb-zinc-800">
                    {logs.length === 0 ? (
                        <div className="text-zinc-500 flex items-center gap-2 italic py-4">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>Initializing process environment...</span>
                        </div>
                    ) : (
                        logs.map((line, idx) => renderFormattedLine(line, idx))
                    )}
                    <div ref={terminalEndRef} />
                </div>

                {/* Footer Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 px-4 sm:px-5 py-3 border-t border-zinc-800 bg-zinc-950/80">
                    <div className="flex items-center justify-between sm:justify-start gap-2">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setAutoScroll(!autoScroll)}
                            className={`h-8 text-xs ${autoScroll ? "text-emerald-400 bg-emerald-500/10" : "text-zinc-400"}`}
                        >
                            <ArrowDown className="h-3.5 w-3.5 mr-1" />
                            Auto-scroll: {autoScroll ? "ON" : "OFF"}
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={handleClear}
                            className="h-8 text-xs text-zinc-400 hover:text-zinc-200"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Clear
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 justify-end flex-wrap sm:flex-nowrap">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleCopy}
                            className="h-8 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-200 flex-1 sm:flex-initial"
                            disabled={logs.length === 0}
                        >
                            {copied ? <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                            <span>{copied ? "Copied" : "Copy"}</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownload}
                            className="h-8 text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-200 flex-1 sm:flex-initial"
                            disabled={logs.length === 0}
                        >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            <span>Download</span>
                        </Button>
                        <Button
                            variant="default"
                            size="sm"
                            onClick={() => {
                                if (status === "RUNNING") handleAbort();
                                onClose();
                            }}
                            className="h-8 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-100 flex-1 sm:flex-initial"
                        >
                            Close
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
