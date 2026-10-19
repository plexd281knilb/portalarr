"use client";

import { useState, useEffect, useTransition } from "react";
import { 
    getScriptsAction, 
    saveScriptAction, 
    deleteScriptAction, 
    runScriptBackgroundAction 
} from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Terminal, 
    Play, 
    Plus, 
    RefreshCw, 
    History, 
    Edit3, 
    Trash2, 
    Clock, 
    Search, 
    CheckCircle2, 
    XCircle, 
    Square, 
    Zap, 
    Layers, 
    Loader2, 
    Server, 
    Code2, 
    FileCode, 
    Database, 
    Container, 
    HardDrive,
    AlertCircle
} from "lucide-react";
import { UserScript, ScriptRunRecord } from "@/lib/scripts/types";
import { ScriptTerminalModal } from "@/components/scripts/script-terminal-modal";
import { ScriptEditorModal } from "@/components/scripts/script-editor-modal";
import { ScriptHistoryModal } from "@/components/scripts/script-history-modal";

export default function AdminScriptsPage() {
    const [scripts, setScripts] = useState<UserScript[]>([]);
    const [recentRuns, setRecentRuns] = useState<ScriptRunRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");
    const [isPending, startTransition] = useTransition();

    // Modals state
    const [runningScript, setRunningScript] = useState<UserScript | null>(null);
    const [isTerminalOpen, setIsTerminalOpen] = useState(false);

    const [editingScript, setEditingScript] = useState<UserScript | null>(null);
    const [isEditorOpen, setIsEditorOpen] = useState(false);

    const [historyScript, setHistoryScript] = useState<UserScript | null>(null);
    const [isHistoryOpen, setIsHistoryOpen] = useState(false);

    // Toast-like notification banner
    const [bannerMessage, setBannerMessage] = useState<string | null>(null);

    const loadScripts = async (isManualRefresh: boolean = false) => {
        if (isManualRefresh) setRefreshing(true);
        try {
            const data = await getScriptsAction();
            if (data?.scripts) {
                setScripts(data.scripts);
            }
            if (data?.recentRuns) {
                setRecentRuns(data.recentRuns);
            }
        } catch (e) {
            console.error("Failed to load scripts:", e);
        } finally {
            setLoading(false);
            if (isManualRefresh) setRefreshing(false);
        }
    };

    useEffect(() => {
        loadScripts();
    }, []);

    const showBanner = (msg: string) => {
        setBannerMessage(msg);
        setTimeout(() => setBannerMessage(null), 4000);
    };

    // Run script interactively in live terminal modal
    const handleRunInteractive = (script: UserScript) => {
        setRunningScript(script);
        setIsTerminalOpen(true);
    };

    // Run script in background without opening terminal
    const handleRunBackground = async (script: UserScript) => {
        try {
            await runScriptBackgroundAction(script.id);
            showBanner(`⚡ "${script.name}" started in background. Logs will be recorded.`);
            setTimeout(() => loadScripts(), 2000);
        } catch (err: any) {
            showBanner(`Failed to start script: ${err.message}`);
        }
    };

    // Open editor to edit existing script
    const handleEditScript = (script: UserScript) => {
        setEditingScript(script);
        setIsEditorOpen(true);
    };

    // Open editor to create new script
    const handleCreateScript = () => {
        setEditingScript(null);
        setIsEditorOpen(true);
    };

    // Open history modal
    const handleViewHistory = (script: UserScript) => {
        setHistoryScript(script);
        setIsHistoryOpen(true);
    };

    // Save script
    const handleSaveScript = async (scriptData: Partial<UserScript> & { name: string }) => {
        await saveScriptAction(scriptData);
        showBanner(`✅ Script "${scriptData.name}" saved successfully.`);
        await loadScripts();
    };

    // Delete script
    const handleDeleteScript = async (script: UserScript) => {
        if (!confirm(`Are you sure you want to delete script "${script.name}"?`)) return;
        try {
            await deleteScriptAction(script.id);
            showBanner(`🗑️ Deleted script "${script.name}".`);
            await loadScripts();
        } catch (err: any) {
            showBanner(`Failed to delete script: ${err.message}`);
        }
    };

    // Filter scripts
    const filteredScripts = scripts.filter((s) => {
        const matchesCategory = selectedCategory === "all" || s.category === selectedCategory;
        const matchesSearch = 
            searchQuery.trim() === "" ||
            s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.filename.toLowerCase().includes(searchQuery.toLowerCase()) ||
            s.description.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    // Compute stats
    const totalScripts = scripts.length;
    const scheduledScripts = scripts.filter(s => s.schedule && s.schedule !== "manual").length;
    const successfulRuns = recentRuns.filter(r => r.status === "SUCCESS").length;

    // Helper: format relative time
    const formatTimeAgo = (iso?: string) => {
        if (!iso) return "Never";
        const diffMs = Date.now() - new Date(iso).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) return "Just now";
        if (diffMins < 60) return `${diffMins}m ago`;
        const diffHours = Math.floor(diffMins / 60);
        if (diffHours < 24) return `${diffHours}h ago`;
        return `${Math.floor(diffHours / 24)}d ago`;
    };

    // Category icon helper
    const getCategoryIcon = (cat: string) => {
        switch (cat) {
            case "Plex & Media": return <Server className="h-3.5 w-3.5 text-amber-400" />;
            case "Database": return <Database className="h-3.5 w-3.5 text-cyan-400" />;
            case "Docker": return <Container className="h-3.5 w-3.5 text-sky-400" />;
            case "System & Backup": return <HardDrive className="h-3.5 w-3.5 text-emerald-400" />;
            default: return <FileCode className="h-3.5 w-3.5 text-purple-400" />;
        }
    };

    return (
        <div className="w-full max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] mx-auto space-y-4 sm:space-y-6 min-w-0">
            {/* Notification Banner */}
            {bannerMessage && (
                <div className="p-3 bg-zinc-900 border border-emerald-500/30 text-emerald-300 rounded-lg text-xs font-medium flex items-center justify-between shadow-lg animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>{bannerMessage}</span>
                    </div>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setBannerMessage(null)}
                        className="h-6 w-6 p-0 text-zinc-400 hover:text-white"
                    >
                        ×
                    </Button>
                </div>
            )}

            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                            <Terminal className="h-6 w-6" />
                        </div>
                        <div>
                            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground flex items-center gap-2 flex-wrap">
                                <span>User Scripts & Automation</span>
                                <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                                    Admin Mission Control
                                </Badge>
                            </h1>
                            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                                Unraid-style shell automation, scheduled maintenance, and interactive live terminal script execution.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => loadScripts(true)}
                        disabled={refreshing}
                        className="h-9 border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-xs text-zinc-200 flex-1 sm:flex-initial"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${refreshing ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>

                    <Button
                        variant="default"
                        size="sm"
                        onClick={handleCreateScript}
                        className="h-9 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium flex-1 sm:flex-initial"
                    >
                        <Plus className="h-4 w-4 mr-1.5" />
                        New Script
                    </Button>
                </div>
            </div>

            {/* Stats Dashboard */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <Card className="bg-[#12131a]/80 border-zinc-800/80 p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Total Scripts</span>
                        <FileCode className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="text-xl font-bold text-zinc-100 mt-2">{totalScripts}</div>
                </Card>

                <Card className="bg-[#12131a]/80 border-zinc-800/80 p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Scheduled Tasks</span>
                        <Clock className="h-4 w-4 text-cyan-400" />
                    </div>
                    <div className="text-xl font-bold text-zinc-100 mt-2">{scheduledScripts}</div>
                </Card>

                <Card className="bg-[#12131a]/80 border-zinc-800/80 p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Recent Runs</span>
                        <History className="h-4 w-4 text-purple-400" />
                    </div>
                    <div className="text-xl font-bold text-zinc-100 mt-2">{recentRuns.length}</div>
                </Card>

                <Card className="bg-[#12131a]/80 border-zinc-800/80 p-3.5 flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">Successful Runs</span>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    </div>
                    <div className="text-xl font-bold text-zinc-100 mt-2">{successfulRuns}</div>
                </Card>
            </div>

            {/* Filter Pills & Search */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                    {["all", "Plex & Media", "Database", "Docker", "System & Backup", "Custom"].map((cat) => (
                        <Button
                            key={cat}
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedCategory(cat)}
                            className={`h-8 text-xs rounded-full px-3 transition-all shrink-0 ${
                                selectedCategory === cat
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold"
                                    : "text-muted-foreground hover:text-foreground hover:bg-zinc-800/60"
                            }`}
                        >
                            {cat === "all" ? "All Scripts" : cat}
                        </Button>
                    ))}
                </div>

                <div className="relative w-full sm:w-72">
                    <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search scripts, files, commands..."
                        className="h-9 pl-9 text-xs bg-[#12131a]/80 border-zinc-800 text-zinc-200"
                    />
                </div>
            </div>

            {/* Script Cards Grid */}
            {loading ? (
                <div className="p-12 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
                    <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
                    <span>Loading scripts repository...</span>
                </div>
            ) : filteredScripts.length === 0 ? (
                <Card className="bg-[#12131a]/60 border-zinc-800 p-8 text-center space-y-3">
                    <FileCode className="h-8 w-8 text-zinc-600 mx-auto" />
                    <div className="text-sm font-semibold text-zinc-300">No scripts found</div>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        {searchQuery ? "No scripts match your search criteria." : "Create your first script to automate tasks."}
                    </p>
                    <Button 
                        size="sm" 
                        onClick={handleCreateScript}
                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                    >
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        Create Script
                    </Button>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredScripts.map((script) => {
                        const isNever = !script.lastStatus || script.lastStatus === "NEVER";
                        const isSuccess = script.lastStatus === "SUCCESS";
                        const isFailed = script.lastStatus === "FAILED";
                        const isAborted = script.lastStatus === "ABORTED";

                        return (
                            <Card 
                                key={script.id} 
                                className="bg-[#12131a]/80 border-zinc-800/80 hover:border-zinc-700/80 transition-all duration-200 flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md"
                            >
                                <CardHeader className="pb-3 space-y-2">
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="space-y-1">
                                            <div className="flex items-center gap-2">
                                                <CardTitle className="text-base font-semibold text-zinc-100">
                                                    {script.name}
                                                </CardTitle>
                                            </div>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                <Badge variant="outline" className="text-[10px] font-mono bg-zinc-900 border-zinc-700/80 text-zinc-300">
                                                    {script.filename}
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px] bg-zinc-900/60 border-zinc-800 text-zinc-400 flex items-center gap-1">
                                                    {getCategoryIcon(script.category)}
                                                    <span>{script.category}</span>
                                                </Badge>
                                                <Badge variant="outline" className="text-[10px] font-mono uppercase bg-indigo-500/10 border-indigo-500/30 text-indigo-300">
                                                    {script.interpreter}
                                                </Badge>
                                            </div>
                                        </div>

                                        {/* Status badge */}
                                        <div>
                                            {isNever ? (
                                                <Badge variant="outline" className="text-[10px] bg-zinc-900 border-zinc-800 text-zinc-500">
                                                    Never Run
                                                </Badge>
                                            ) : isSuccess ? (
                                                <Badge className="text-[10px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                                    <CheckCircle2 className="h-3 w-3" />
                                                    <span>Exit 0</span>
                                                </Badge>
                                            ) : isAborted ? (
                                                <Badge className="text-[10px] bg-orange-500/15 text-orange-300 border border-orange-500/30 flex items-center gap-1">
                                                    <Square className="h-3 w-3" />
                                                    <span>Aborted</span>
                                                </Badge>
                                            ) : (
                                                <Badge className="text-[10px] bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                                                    <XCircle className="h-3 w-3" />
                                                    <span>Exit {script.lastExitCode ?? 1}</span>
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    <CardDescription className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                                        {script.description || "No description provided."}
                                    </CardDescription>
                                </CardHeader>

                                <CardContent className="pt-0 space-y-3">
                                    {/* Telemetry info row */}
                                    <div className="p-2 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-between text-[11px] text-zinc-400">
                                        <div className="flex items-center gap-1.5">
                                            <Clock className="h-3.5 w-3.5 text-zinc-500" />
                                            <span>
                                                {script.schedule === "manual" ? "Manual (On Demand)" : `Schedule: ${script.schedule}`}
                                            </span>
                                        </div>
                                        <div>
                                            <span>Last run: </span>
                                            <span className="text-zinc-300 font-medium">{formatTimeAgo(script.lastRunAt)}</span>
                                            {script.lastDurationMs ? (
                                                <span className="text-zinc-500"> ({((script.lastDurationMs) / 1000).toFixed(1)}s)</span>
                                            ) : null}
                                        </div>
                                    </div>

                                    {/* Action buttons */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/60">
                                        <div className="flex items-center gap-1.5 flex-1 min-w-[200px]">
                                            <Button
                                                variant="default"
                                                size="sm"
                                                onClick={() => handleRunInteractive(script)}
                                                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium flex-1 sm:flex-initial"
                                                title="Run script interactively with live streaming terminal output"
                                            >
                                                <Play className="h-3.5 w-3.5 mr-1 fill-white shrink-0" />
                                                <span>Run Script</span>
                                            </Button>

                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRunBackground(script)}
                                                className="h-8 text-xs border-zinc-700 bg-zinc-900/60 hover:bg-zinc-800 text-zinc-300 flex-1 sm:flex-initial"
                                                title="Run silently in background"
                                            >
                                                <Zap className="h-3.5 w-3.5 mr-1 text-amber-400 shrink-0" />
                                                <span>Background</span>
                                            </Button>
                                        </div>

                                        <div className="flex items-center gap-1">
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleViewHistory(script)}
                                                className="h-8 text-xs text-zinc-400 hover:text-zinc-200 px-2 sm:px-2.5"
                                                title="View previous execution runs and logs"
                                            >
                                                <History className="h-3.5 w-3.5 mr-1" />
                                                Logs
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleEditScript(script)}
                                                className="h-8 text-xs text-zinc-400 hover:text-zinc-200 px-2 sm:px-2.5"
                                                title="Edit script code and settings"
                                            >
                                                <Edit3 className="h-3.5 w-3.5 mr-1" />
                                                Edit
                                            </Button>

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleDeleteScript(script)}
                                                className="h-8 text-xs text-zinc-400 hover:text-rose-400 px-2"
                                                title="Delete script"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {/* Modals */}
            <ScriptTerminalModal
                isOpen={isTerminalOpen}
                onClose={() => setIsTerminalOpen(false)}
                script={runningScript}
                onFinished={() => loadScripts()}
            />

            <ScriptEditorModal
                isOpen={isEditorOpen}
                onClose={() => setIsEditorOpen(false)}
                script={editingScript}
                onSave={handleSaveScript}
            />

            <ScriptHistoryModal
                isOpen={isHistoryOpen}
                onClose={() => setIsHistoryOpen(false)}
                script={historyScript}
            />
        </div>
    );
}
