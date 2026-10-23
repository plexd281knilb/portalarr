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
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
    FileCode, 
    Save, 
    X, 
    Sparkles, 
    Code, 
    Clock, 
    Layers, 
    Loader2 
} from "lucide-react";
import { UserScript, ScriptInterpreter, ScriptCategory } from "@/lib/scripts/types";

interface ScriptEditorModalProps {
    isOpen: boolean;
    onClose: () => void;
    script: UserScript | null;
    onSave: (scriptData: Partial<UserScript> & { name: string }) => Promise<void>;
}

export function ScriptEditorModal({
    isOpen,
    onClose,
    script,
    onSave
}: ScriptEditorModalProps) {
    const [name, setName] = useState("");
    const [filename, setFilename] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState<string>("Plex & Media");
    const [interpreter, setInterpreter] = useState<ScriptInterpreter>("bash");
    const [schedule, setSchedule] = useState<string>("manual");
    const [timeoutSeconds, setTimeoutSeconds] = useState<number>(120);
    const [content, setContent] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (script) {
            setName(script.name);
            setFilename(script.filename);
            setDescription(script.description);
            setCategory(script.category);
            setInterpreter(script.interpreter);
            setSchedule(script.schedule);
            setTimeoutSeconds(script.timeoutSeconds || 120);
            setContent(script.content);
        } else {
            setName("");
            setFilename("");
            setDescription("");
            setCategory("Custom");
            setInterpreter("bash");
            setSchedule("manual");
            setTimeoutSeconds(120);
            setContent("#!/bin/bash\n# Write custom script here\n\necho \"[$(date '+%Y-%m-%d %H:%M:%S')] Script starting...\"\n");
        }
        setError(null);
    }, [script, isOpen]);

    const handleSave = async () => {
        if (!name.trim()) {
            setError("Script name is required.");
            return;
        }

        setSaving(true);
        setError(null);
        try {
            await onSave({
                id: script?.id,
                name: name.trim(),
                filename: filename.trim() || `${name.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}.sh`,
                description: description.trim(),
                category,
                interpreter,
                schedule,
                timeoutSeconds,
                content
            });
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to save script.");
        } finally {
            setSaving(false);
        }
    };

    const handleTemplateSelect = (template: string) => {
        if (template === "empty_bash") {
            setContent("#!/bin/bash\n# Script purpose\n\necho \"[$(date '+%Y-%m-%d %H:%M:%S')] Starting task...\"\n");
        } else if (template === "empty_python") {
            setInterpreter("python3");
            setFilename(prev => prev.replace(/\.sh$/, ".py") || "script.py");
            setContent("#!/usr/bin/env python3\nimport datetime\n\nprint(f\"[{datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Python task started\")\n");
        } else if (template === "empty_node") {
            setInterpreter("node");
            setFilename(prev => prev.replace(/\.sh$/, ".js") || "script.js");
            setContent("//!/usr/bin/env node\nconsole.log(`[${new Date().toISOString()}] Node.js task executed`);\n");
        }
    };


    const isDirty = script ? (
        name !== script.name ||
        filename !== script.filename ||
        description !== script.description ||
        category !== script.category ||
        interpreter !== script.interpreter ||
        schedule !== script.schedule ||
        timeoutSeconds !== (script.timeoutSeconds || 120) ||
        content !== script.content
    ) : (
        name.trim() !== "" ||
        filename.trim() !== "" ||
        description.trim() !== "" ||
        content !== "#!/bin/bash\n# Write custom script here\n\necho \"[$(date '+%Y-%m-%d %H:%M:%S')] Script starting...\"\n"
    );

    const handleCloseAttempt = () => {
        if (isDirty) {
            if (confirm("You have unsaved changes in this script. Discard changes and close?")) {
                onClose();
            }
        } else {
            onClose();
        }
    };

    const lineCount = content.split("\n").length;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleCloseAttempt()}>
            <DialogContent onPointerDownOutside={(e) => { if (isDirty) e.preventDefault(); }} className="max-w-4xl w-[95vw] max-h-[92vh] flex flex-col bg-[#0d0e14] border-zinc-800 p-0 overflow-hidden shadow-2xl">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 sm:py-4 border-b border-zinc-800 bg-zinc-950/70">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0">
                            <FileCode className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-base font-semibold text-zinc-100 flex items-center gap-2 flex-wrap">
                                <span>{script ? "Edit Script" : "Create New Script"}</span>
                                {script && (
                                    <Badge variant="outline" className="text-[10px] font-mono bg-zinc-900 border-zinc-700 text-zinc-300">
                                        {script.filename}
                                    </Badge>
                                )}
                            </DialogTitle>
                            <DialogDescription className="text-xs text-zinc-400 mt-0.5">
                                Configure interpreter settings, scheduling cadence, and script code.
                            </DialogDescription>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto w-full sm:w-auto justify-end">
                        <Button 
                            variant="default" 
                            size="sm" 
                            onClick={handleSave}
                            disabled={saving}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex-1 sm:flex-initial"
                        >
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
                            {saving ? "Saving..." : "Save Script"}
                        </Button>
                    </div>
                </div>

                {error && (
                    <div className="px-5 py-2 bg-rose-500/10 border-b border-rose-500/20 text-rose-300 text-xs">
                        {error}
                    </div>
                )}

                {/* Form fields & Editor */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-zinc-300 mb-1 block">Script Name</label>
                            <Input 
                                value={name} 
                                onChange={(e) => {
                                    setName(e.target.value);
                                    if (!script && !filename) {
                                        setFilename(`${e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_")}.sh`);
                                    }
                                }} 
                                placeholder="e.g. Check All Plex Servers"
                                className="h-9 bg-zinc-900/80 border-zinc-700 text-xs"
                            />
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-300 mb-1 block">Filename</label>
                            <Input 
                                value={filename} 
                                onChange={(e) => setFilename(e.target.value)} 
                                placeholder="e.g. check_all_plex_servers.sh"
                                className="h-9 bg-zinc-900/80 border-zinc-700 text-xs font-mono"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-semibold text-zinc-300 mb-1 block">Description</label>
                        <Input 
                            value={description} 
                            onChange={(e) => setDescription(e.target.value)} 
                            placeholder="Brief summary of what this script accomplishes..."
                            className="h-9 bg-zinc-900/80 border-zinc-700 text-xs"
                        />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <div>
                            <label className="text-xs font-semibold text-zinc-300 mb-1 block">Category</label>
                            <select 
                                value={category} 
                                onChange={(e) => setCategory(e.target.value)}
                                className="w-full h-9 rounded-md bg-zinc-900/80 border border-zinc-700 text-xs text-zinc-200 px-3"
                            >
                                <option value="Plex & Media">Plex & Media</option>
                                <option value="Database">Database</option>
                                <option value="Docker">Docker</option>
                                <option value="System & Backup">System & Backup</option>
                                <option value="Maintenance">Maintenance</option>
                                <option value="Custom">Custom</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-300 mb-1 block">Interpreter</label>
                            <select 
                                value={interpreter} 
                                onChange={(e) => setInterpreter(e.target.value as any)}
                                className="w-full h-9 rounded-md bg-zinc-900/80 border border-zinc-700 text-xs text-zinc-200 px-3"
                            >
                                <option value="bash">Bash (/bin/bash)</option>
                                <option value="sh">Shell (/bin/sh)</option>
                                <option value="python3">Python (python3)</option>
                                <option value="node">Node.js (node)</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-300 mb-1 block">Schedule</label>
                            <select 
                                value={schedule} 
                                onChange={(e) => setSchedule(e.target.value)}
                                className="w-full h-9 rounded-md bg-zinc-900/80 border border-zinc-700 text-xs text-zinc-200 px-3"
                            >
                                <option value="manual">Manual Only (On Demand)</option>
                                <option value="hourly">Every Hour</option>
                                <option value="daily_3am">Daily at 3:00 AM (Quiet Hours)</option>
                                <option value="daily_midnight">Daily at Midnight</option>
                                <option value="weekly_sun">Weekly on Sunday</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-xs font-semibold text-zinc-300 mb-1 block">Timeout (Seconds)</label>
                            <Input 
                                type="number" 
                                value={timeoutSeconds} 
                                onChange={(e) => setTimeoutSeconds(parseInt(e.target.value, 10) || 120)}
                                className="h-9 bg-zinc-900/80 border-zinc-700 text-xs"
                            />
                        </div>
                    </div>

                    {/* Code Editor Header */}
                    <div className="flex items-center justify-between pt-2">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-zinc-200">Script Code</span>
                            <Badge variant="outline" className="text-[10px] text-zinc-400 bg-zinc-900 border-zinc-800">
                                {lineCount} {lineCount === 1 ? "line" : "lines"}
                            </Badge>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className="text-[11px] text-zinc-500">Insert Template:</span>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleTemplateSelect("empty_bash")}
                                className="h-6 text-[10px] px-2 text-zinc-400 hover:text-zinc-200"
                            >
                                Bash
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleTemplateSelect("empty_python")}
                                className="h-6 text-[10px] px-2 text-zinc-400 hover:text-zinc-200"
                            >
                                Python
                            </Button>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleTemplateSelect("empty_node")}
                                className="h-6 text-[10px] px-2 text-zinc-400 hover:text-zinc-200"
                            >
                                Node
                            </Button>
                        </div>
                    </div>

                    {/* Code Textarea */}
                    <div className="relative rounded-lg border border-zinc-800 bg-[#07080b] overflow-hidden focus-within:border-indigo-500/50">
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            rows={16}
                            spellCheck={false}
                            className="w-full p-4 font-mono text-xs text-zinc-200 bg-transparent resize-y outline-none leading-relaxed selection:bg-indigo-500/30 selection:text-white"
                            placeholder="#!/bin/bash&#10;# Write your script code here..."
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 px-4 sm:px-5 py-3 border-t border-zinc-800 bg-zinc-950/80">
                    <span className="text-[11px] text-zinc-500">
                        Saved scripts are stored persistently in <code className="text-zinc-400">data/scripts/</code>
                    </span>
                    <div className="flex items-center gap-2 justify-end">
                        <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleCloseAttempt}
                            className="h-8 text-xs text-zinc-400 hover:text-zinc-200 flex-1 sm:flex-initial"
                        >
                            Cancel
                        </Button>
                        <Button 
                            variant="default" 
                            size="sm" 
                            onClick={handleSave}
                            disabled={saving}
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex-1 sm:flex-initial"
                        >
                            {saving ? "Saving..." : "Save Script"}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
