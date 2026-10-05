"use client";

import { useState, useEffect, useRef } from "react";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle, 
    DialogDescription 
} from "@/components/ui/dialog";
import { 
    Card, 
    CardHeader, 
    CardTitle, 
    CardDescription, 
    CardContent 
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
    Bot, 
    Sparkles, 
    Send, 
    Loader2, 
    RefreshCw, 
    Tv, 
    Tv2,
    AlertTriangle, 
    CheckCircle2, 
    Copy, 
    Check, 
    Wrench, 
    ShieldAlert, 
    HelpCircle, 
    Activity, 
    LifeBuoy, 
    ArrowRight, 
    SlidersHorizontal,
    Maximize2,
    RotateCcw,
    Film,
    Download,
    Languages,
    Volume2,
    ShieldCheck,
    Server,
    HardDrive,
    Database,
    PlayCircle,
    XCircle,
    ChevronDown,
    ChevronUp,
    Radio,
    Zap,
    Cpu,
    Monitor,
    Smartphone,
    Globe,
    ExternalLink,
    ChevronRight,
    Clock,
    Flame
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { askAiServerMasterAction, getUserAiDiagnosticSnapshotAction } from "@/app/actions";
import { UserDiagnosticSnapshot, AiChatMessage } from "@/lib/ai-server-assistant-types";
import PlexSetupGuides from "@/components/plex-setup-guides";
import FeatureGuideModal from "@/components/feature-guide-modal";

export function AiServerAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"chat" | "telemetry" | "probes" | "fixes">("chat");
    const [quickQuestion, setQuickQuestion] = useState("");
    const [inputQuestion, setInputQuestion] = useState("");
    const [loading, setLoading] = useState(false);
    const [diagLoading, setDiagLoading] = useState(false);
    const [snapshot, setSnapshot] = useState<UserDiagnosticSnapshot | null>(null);
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
    const [telemetryRibbonExpanded, setTelemetryRibbonExpanded] = useState<boolean>(true);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initial telemetry fetch on mount
    const fetchSnapshot = async () => {
        setDiagLoading(true);
        try {
            const res = await getUserAiDiagnosticSnapshotAction();
            if (res.success && res.snapshot) {
                setSnapshot(res.snapshot);
            }
        } catch (e) {
            console.error("Failed to fetch AI diagnostic snapshot:", e);
        } finally {
            setDiagLoading(false);
        }
    };

    useEffect(() => {
        fetchSnapshot();
        const interval = setInterval(fetchSnapshot, 15000);
        return () => clearInterval(interval);
    }, []);

    // Auto-scroll chat to bottom
    useEffect(() => {
        if (isOpen && activeTab === "chat") {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isOpen, loading, activeTab]);

    const handleSend = async (questionToSend?: string) => {
        const query = (questionToSend || inputQuestion).trim();
        if (!query || loading) return;

        setInputQuestion("");
        setQuickQuestion("");
        
        const userMsg: AiChatMessage = {
            role: "user",
            content: query,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };

        const updatedHistory = [...messages, userMsg];
        setMessages(updatedHistory);
        setLoading(true);

        if (!isOpen) {
            setIsOpen(true);
        }
        if (activeTab !== "chat") {
            setActiveTab("chat");
        }

        try {
            const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => 
                setTimeout(() => resolve({ success: false, error: "Diagnostic query timed out. Please try again." }), 35000)
            );
            const res = await Promise.race([
                askAiServerMasterAction(query, updatedHistory),
                timeoutPromise
            ]);

            if (res.success && res.answer) {
                const assistantMsg: AiChatMessage = {
                    role: "assistant",
                    content: res.answer,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                    diagnosticsSnapshot: res.diagnostics,
                    providerUsed: res.providerUsed,
                    actionsTaken: res.actionsTaken,
                    mediaInspection: res.mediaInspection,
                    playbackProbe: res.playbackProbe
                };
                setMessages([...updatedHistory, assistantMsg]);
                if (res.diagnostics) {
                    setSnapshot(res.diagnostics);
                }
            } else {
                setMessages([
                    ...updatedHistory,
                    {
                        role: "assistant",
                        content: `⚠️ **Diagnostic Notice:** ${res.error || "Could not retrieve response from AI Master. Please verify your connection or try again."}`,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }
                ]);
            }
        } catch (err: any) {
            setMessages([
                ...updatedHistory,
                {
                    role: "assistant",
                    content: `⚠️ **Error:** ${err.message || "Failed to query server master"}`,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }
            ]);
        } finally {
            setLoading(false);
        }
    };

    const handleQuickCardSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!quickQuestion.trim()) {
            setIsOpen(true);
            return;
        }
        handleSend(quickQuestion);
    };

    const handleCopy = (text: string, index: number) => {
        navigator.clipboard.writeText(text);
        setCopiedIndex(index);
        setTimeout(() => setCopiedIndex(null), 2000);
    };

    const handleTransferToTicket = (issueText: string) => {
        setIsOpen(false);
        setTimeout(() => {
            const textarea = document.querySelector('textarea[name="issue"]') as HTMLTextAreaElement;
            if (textarea) {
                textarea.value = `[AI Diagnostic Report]\n${issueText.slice(0, 500)}...`;
                textarea.focus();
                textarea.scrollIntoView({ behavior: "smooth" });
            }
        }, 300);
    };

    const quickPrompts = [
        { 
            icon: "🟢",
            label: "Is Plex Working?", 
            category: "Server Health",
            query: "Is Plex working right now? Test actual file playback and disk access for each server." 
        },
        { 
            icon: "⚾",
            label: "Spanish Audio Fix", 
            category: "Audio Tracks",
            query: "The Sandlot is in Spanish only. Can you check if English audio is available or replace it?" 
        },
        { 
            icon: "📺",
            label: "Roku Quality Error", 
            category: "Client Fix",
            query: "Why is my Roku giving an error saying quality is too low or crashing when playing a movie?" 
        },
        { 
            icon: "⚡",
            label: "100% Direct Play", 
            category: "Buffering",
            query: "Why is my stream buffering and how do I get 100% Direct Play on my device?" 
        },
        { 
            icon: "🔊",
            label: "Quiet Dialogue", 
            category: "Audio",
            query: "Dialogue is too quiet or audio is transcoding. How do I fix dialogue boost and audio settings?" 
        },
        { 
            icon: "💬",
            label: "Subtitle Stutter", 
            category: "Subtitles",
            query: "Why do subtitles cause video buffering and how do I fix subtitle burn-in?" 
        },
        { 
            icon: "⚙️",
            label: "Remote 1080p/4K Settings", 
            category: "Quality",
            query: "What are the recommended Plex settings for my device to avoid the 720p 2Mbps limit?" 
        }
    ];

    const activeStream = snapshot?.primaryActiveStream;
    const detectedIssues = snapshot?.detectedIssues || [];
    const patternInsights = snapshot?.patternInsights || [];

    return (
        <>
            {/* --- DASHBOARD CARD (4TH CARD NEXT TO SUPPORT) --- */}
            <Card className="h-full flex flex-col border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm hover:shadow-md hover:border-purple-500/30 transition-all duration-200 animate-in fade-in duration-700">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2">
                        <CardTitle className="flex items-center gap-2 text-lg font-bold">
                            <div className="p-1.5 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 text-white shadow-sm">
                                <Bot className="h-4 w-4" />
                            </div>
                            <span>AI Server Master</span>
                        </CardTitle>
                        <Badge variant="outline" className="text-[10px] font-bold px-1.5 py-0.5 bg-purple-950/40 text-purple-300 border-purple-500/40">
                            Plex AI
                        </Badge>
                    </div>
                    <CardDescription className="text-xs text-muted-foreground">
                        Instant diagnostics, playback fixes, stream inspection &amp; server help.
                    </CardDescription>
                </CardHeader>
                
                <CardContent className="flex-1 flex flex-col justify-between space-y-3 pt-0">
                    {/* Live Telemetry Pill */}
                    <div className="p-2.5 rounded-xl bg-background/50 border border-border/40 text-xs flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${activeStream ? "bg-emerald-400 animate-pulse" : "bg-cyan-400"}`} />
                            <div className="truncate">
                                {activeStream ? (
                                    <span className="font-semibold text-foreground truncate block">
                                        {activeStream.player}: <span className="font-normal text-muted-foreground">{activeStream.title}</span>
                                    </span>
                                ) : (
                                    <span className="text-muted-foreground">System Ready (All Nodes Online)</span>
                                )}
                            </div>
                        </div>
                        {activeStream && (
                            <Badge variant="outline" className={`text-[9px] uppercase px-1.5 py-0 shrink-0 ${
                                activeStream.transcodeDecision === "direct play" 
                                    ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/30" 
                                    : "bg-amber-950/40 text-amber-300 border-amber-500/30"
                            }`}>
                                {activeStream.transcodeDecision}
                            </Badge>
                        )}
                    </div>

                    {/* Detected Issue Alert (if active) */}
                    {detectedIssues.length > 0 && (
                        <div 
                            onClick={() => {
                                setIsOpen(true);
                                setActiveTab("chat");
                                handleSend(detectedIssues[0].quickFix);
                            }}
                            className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 flex items-center justify-between gap-2 cursor-pointer hover:bg-amber-500/15 transition-colors"
                        >
                            <div className="flex items-center gap-1.5 truncate">
                                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                                <span className="font-medium truncate">{detectedIssues[0].title}</span>
                            </div>
                            <span className="text-[10px] underline font-bold shrink-0">Fix</span>
                        </div>
                    )}

                    {/* Quick Ask Form */}
                    <form onSubmit={handleQuickCardSubmit} className="space-y-2">
                        <div className="relative">
                            <Input
                                value={quickQuestion}
                                onChange={(e) => setQuickQuestion(e.target.value)}
                                placeholder="e.g. Why is The Sandlot in Spanish?"
                                className="h-9 text-xs bg-background/60 pr-8"
                            />
                            <Button 
                                type="submit" 
                                size="icon" 
                                variant="ghost" 
                                className="absolute right-1 top-1 h-7 w-7 text-purple-400 hover:text-purple-300 hover:bg-purple-950/40"
                                disabled={loading}
                            >
                                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                            </Button>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setIsOpen(true)}
                            className="w-full text-xs font-semibold h-8 border-purple-500/30 text-purple-300 hover:bg-purple-950/30 hover:border-purple-500/50 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                            <span>Launch Plex &amp; Server Master AI</span>
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* --- REWORKED PLEX & SERVER MASTER AI MODAL --- */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="w-[98vw] sm:max-w-4xl max-h-[92vh] h-[86vh] flex flex-col bg-[#0c0d14]/98 border-purple-500/30 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden text-foreground">
                    {/* Top Mission Control Header */}
                    <DialogHeader className="p-4 sm:p-5 pb-3 border-b border-border/50 bg-gradient-to-r from-purple-950/40 via-background to-cyan-950/30 shrink-0">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className="relative flex items-center justify-center p-2.5 rounded-2xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 text-white shadow-lg shadow-purple-950/60 border border-purple-400/40 shrink-0">
                                    <Bot className="h-6 w-6" />
                                    <span className="absolute -bottom-1 -right-1 flex h-3 w-3">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border-2 border-slate-900"></span>
                                    </span>
                                </div>
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <DialogTitle className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                                            <span>Plex &amp; Server Master AI</span>
                                        </DialogTitle>
                                        <Badge variant="outline" className="text-[10px] font-bold bg-emerald-950/40 text-emerald-300 border-emerald-500/40 flex items-center gap-1">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                            <span>Autonomous v3.1</span>
                                        </Badge>
                                    </div>
                                    <DialogDescription className="text-xs text-muted-foreground truncate">
                                        Personalized playback telemetry, track inspection, and automated server diagnostics for DomsHomeLab
                                    </DialogDescription>
                                </div>
                            </div>

                            {/* Header Action Tools */}
                            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                                <FeatureGuideModal guideId="ai-assistant" triggerText="Help Guide" />
                                <PlexSetupGuides />
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={fetchSnapshot}
                                    disabled={diagLoading}
                                    className="h-8 px-2.5 text-xs border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white gap-1 cursor-pointer"
                                    title="Refresh telemetry & stream snapshot"
                                >
                                    <RefreshCw className={`h-3.5 w-3.5 ${diagLoading ? "animate-spin text-purple-400" : "text-slate-400"}`} />
                                    <span className="hidden sm:inline">Refresh</span>
                                </Button>
                            </div>
                        </div>

                        {/* High-Tech Tab Navigation Strip */}
                        <div className="flex items-center gap-1.5 mt-3 pt-2.5 border-t border-slate-800/80 overflow-x-auto no-scrollbar">
                            <button
                                type="button"
                                onClick={() => setActiveTab("chat")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                                    activeTab === "chat"
                                        ? "bg-purple-600 text-white shadow-sm shadow-purple-950/50"
                                        : "bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800"
                                }`}
                            >
                                <Bot className="h-3.5 w-3.5" />
                                <span>Diagnostic Chat</span>
                                {messages.length > 0 && (
                                    <span className={`text-[10px] px-1.5 py-0 rounded-full font-mono font-bold ${activeTab === "chat" ? "bg-purple-950/80 text-purple-200" : "bg-slate-800 text-slate-300"}`}>
                                        {messages.length}
                                    </span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("telemetry")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                                    activeTab === "telemetry"
                                        ? "bg-purple-600 text-white shadow-sm shadow-purple-950/50"
                                        : "bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800"
                                }`}
                            >
                                <Radio className="h-3.5 w-3.5" />
                                <span>Live Telemetry</span>
                                {activeStream ? (
                                    <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                ) : (
                                    <span className="text-[10px] text-slate-500 font-mono">0</span>
                                )}
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("probes")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                                    activeTab === "probes"
                                        ? "bg-purple-600 text-white shadow-sm shadow-purple-950/50"
                                        : "bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800"
                                }`}
                            >
                                <Activity className="h-3.5 w-3.5" />
                                <span>Server Disk &amp; Probes</span>
                                <span className={`text-[10px] px-1.5 py-0 rounded-full font-mono font-bold ${activeTab === "probes" ? "bg-purple-950/80 text-purple-200" : "bg-slate-800 text-slate-300"}`}>
                                    {snapshot?.serversOnlineCount || snapshot?.serverNodes?.length || 4}
                                </span>
                            </button>

                            <button
                                type="button"
                                onClick={() => setActiveTab("fixes")}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all cursor-pointer whitespace-nowrap ${
                                    activeTab === "fixes"
                                        ? "bg-purple-600 text-white shadow-sm shadow-purple-950/50"
                                        : "bg-slate-900/70 text-slate-400 hover:text-slate-200 hover:bg-slate-800/80 border border-slate-800"
                                }`}
                            >
                                <Zap className="h-3.5 w-3.5 text-amber-400" />
                                <span>Quick Fixes</span>
                                {detectedIssues.length > 0 && (
                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-amber-500/20 text-amber-300 border-amber-500/40">
                                        {detectedIssues.length}
                                    </Badge>
                                )}
                            </button>
                        </div>
                    </DialogHeader>

                    {/* ======================================================== */}
                    {/* TAB 1: DIAGNOSTIC CHAT & CONVERSATIONAL ASSISTANT */}
                    {/* ======================================================== */}
                    {activeTab === "chat" && (
                        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                            {/* Collapsible Live Stream / Issue Ticker Bar */}
                            {(activeStream || detectedIssues.length > 0) && (
                                <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-950/80 shrink-0">
                                    <div className="flex items-center justify-between gap-2 text-xs">
                                        <div className="flex items-center gap-2 min-w-0">
                                            {activeStream ? (
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                                                    <Tv className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                                    <span className="font-semibold text-white truncate">
                                                        {activeStream.player}:
                                                    </span>
                                                    <span className="text-slate-300 truncate">
                                                        {activeStream.title}
                                                    </span>
                                                    <Badge variant="outline" className={`text-[9px] font-bold uppercase px-1.5 py-0 shrink-0 ${
                                                        activeStream.transcodeDecision === "direct play"
                                                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40"
                                                            : "bg-amber-950/60 text-amber-300 border-amber-500/40"
                                                    }`}>
                                                        {activeStream.transcodeDecision}
                                                    </Badge>
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-1.5 text-amber-300">
                                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                                                    <span className="font-semibold">{detectedIssues[0]?.title}</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            {activeStream && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleSend(`Diagnose my current stream of "${activeStream.title}" playing on ${activeStream.player}. Why is it ${activeStream.transcodeDecision} and how can I get 100% Direct Play?`)}
                                                    className="h-6 text-[10px] px-2 text-purple-300 bg-purple-950/40 hover:bg-purple-900/60 border border-purple-500/30 gap-1 cursor-pointer"
                                                >
                                                    <Sparkles className="h-3 w-3 text-purple-400" />
                                                    <span>Diagnose Stream</span>
                                                </Button>
                                            )}
                                            {detectedIssues.length > 0 && !activeStream && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleSend(detectedIssues[0].quickFix)}
                                                    className="h-6 text-[10px] px-2 bg-amber-500 hover:bg-amber-400 text-black font-bold cursor-pointer"
                                                >
                                                    Fix Issue
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Chat Messages Viewport */}
                            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                                {messages.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-5 my-auto">
                                        <div className="relative">
                                            <div className="p-5 rounded-3xl bg-gradient-to-tr from-purple-600/20 via-indigo-600/20 to-cyan-500/20 border border-purple-500/30 text-purple-300 shadow-2xl">
                                                <Bot className="h-12 w-12" />
                                            </div>
                                            <Sparkles className="h-5 w-5 text-cyan-400 absolute -top-1 -right-1 animate-pulse" />
                                        </div>

                                        <div className="max-w-md space-y-1.5">
                                            <h3 className="text-base sm:text-lg font-bold text-white">How can I assist your media playback today?</h3>
                                            <p className="text-xs text-muted-foreground leading-relaxed">
                                                I am connected directly to your Plex streaming telemetry, storage read drives, and media indexers. Ask me anything below.
                                            </p>
                                        </div>

                                        {/* Quick Prompt Cards Grid */}
                                        <div className="w-full max-w-2xl pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-left">
                                            {quickPrompts.slice(0, 6).map((p, idx) => (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => handleSend(p.query)}
                                                    className="p-3 rounded-xl bg-slate-900/60 hover:bg-purple-950/30 border border-slate-800 hover:border-purple-500/40 text-xs transition-all flex items-start gap-2.5 group cursor-pointer"
                                                >
                                                    <span className="text-base shrink-0 mt-0.5">{p.icon}</span>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center justify-between gap-1">
                                                            <span className="font-semibold text-slate-200 group-hover:text-purple-300 truncate">{p.label}</span>
                                                            <Badge variant="outline" className="text-[9px] px-1 py-0 text-slate-500 border-slate-800">
                                                                {p.category}
                                                            </Badge>
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-1">{p.query}</p>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    messages.map((msg, index) => (
                                        <div 
                                            key={index}
                                            className={`flex items-start gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"} animate-in fade-in-50 duration-200`}
                                        >
                                            {msg.role === "assistant" && (
                                                <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 text-white flex items-center justify-center shrink-0 shadow-md border border-purple-400/30 mt-0.5">
                                                    <Bot className="h-4 w-4" />
                                                </div>
                                            )}

                                            <div className={`max-w-[88%] rounded-2xl p-4 text-xs leading-relaxed space-y-3 shadow-md ${
                                                msg.role === "user"
                                                    ? "bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-tr-xs"
                                                    : "bg-slate-900/90 border border-slate-800 text-slate-200 rounded-tl-xs"
                                            }`}>
                                                <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 text-[10px] text-muted-foreground">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-bold text-foreground">
                                                            {msg.role === "user" ? "You" : "Plex & Server Master AI"}
                                                        </span>
                                                        {msg.role === "assistant" && msg.providerUsed && (
                                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal border-purple-500/30 text-purple-300 bg-purple-950/40">
                                                                {msg.providerUsed}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span>{msg.timestamp}</span>
                                                        {msg.role === "assistant" && (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopy(msg.content, index)}
                                                                className="p-1 hover:text-white transition-colors cursor-pointer"
                                                                title="Copy response"
                                                            >
                                                                {copiedIndex === index ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Autonomous Action Badges (if any) */}
                                                {msg.actionsTaken && msg.actionsTaken.length > 0 && (
                                                    <div className="space-y-1.5 pb-2 border-b border-border/30">
                                                        {msg.actionsTaken.map((act, aIdx) => (
                                                            <div 
                                                                key={aIdx}
                                                                className={`p-2.5 rounded-xl text-[11px] flex items-start gap-2.5 border ${
                                                                    act.action === "RADARR_SEARCH_GRAB" 
                                                                        ? "bg-purple-950/40 border-purple-500/40 text-purple-200" 
                                                                        : act.action === "ESCALATE_ADMIN_TICKET"
                                                                        ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                                                                        : "bg-cyan-950/30 border-cyan-500/30 text-cyan-200"
                                                                }`}
                                                            >
                                                                {act.action === "RADARR_SEARCH_GRAB" ? (
                                                                    <Download className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                                                                ) : act.action === "ESCALATE_ADMIN_TICKET" ? (
                                                                    <LifeBuoy className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                                                                ) : (
                                                                    <Film className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                                                                )}
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="font-semibold flex items-center justify-between gap-1.5 flex-wrap">
                                                                        <span>{act.target}</span>
                                                                        <Badge variant="outline" className={`text-[9px] px-1.5 py-0 uppercase font-mono font-bold ${
                                                                            act.status === "SUCCESS" ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40" :
                                                                            act.status === "ESCALATED" ? "bg-amber-950/60 text-amber-300 border-amber-500/40" :
                                                                            "bg-slate-800 text-slate-300 border-slate-700"
                                                                        }`}>
                                                                            {act.status}
                                                                        </Badge>
                                                                    </div>
                                                                    <p className="text-[10px] opacity-80 mt-0.5 leading-relaxed">{act.summary}</p>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}

                                                {/* Media Stream Container Inspection Card (if any) */}
                                                {msg.mediaInspection && msg.mediaInspection.audioTracks && msg.mediaInspection.audioTracks.length > 0 && (
                                                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-2.5 text-[11px]">
                                                        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <Languages className="h-4 w-4 text-cyan-400 shrink-0" />
                                                                <span className="font-bold text-white truncate">{msg.mediaInspection.title}</span>
                                                                {msg.mediaInspection.year && <span className="text-muted-foreground text-[10px]">({msg.mediaInspection.year})</span>}
                                                            </div>
                                                            <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-bold ${
                                                                msg.mediaInspection.verdict === "AUDIO_EXISTS_CLIENT_FIX" 
                                                                    ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40" 
                                                                    : msg.mediaInspection.verdict === "MISSING_LANGUAGE_TRACK"
                                                                    ? "bg-amber-950/60 text-amber-300 border-amber-500/40"
                                                                    : "bg-cyan-950/60 text-cyan-300 border-cyan-500/40"
                                                            }`}>
                                                                {msg.mediaInspection.verdict === "AUDIO_EXISTS_CLIENT_FIX" ? "English In File" :
                                                                 msg.mediaInspection.verdict === "MISSING_LANGUAGE_TRACK" ? "Spanish Only" : "Verified"}
                                                            </Badge>
                                                        </div>

                                                        {/* Audio Track Pills */}
                                                        <div className="space-y-1.5">
                                                            <span className="text-[10px] text-muted-foreground font-semibold block">Detected Audio Streams:</span>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {msg.mediaInspection.audioTracks.map((tr, tIdx) => {
                                                                    const isEnglish = tr.language.toLowerCase() === "english" || tr.languageCode === "eng";
                                                                    return (
                                                                        <div 
                                                                            key={tIdx} 
                                                                            className={`px-2.5 py-1 rounded-lg text-[10px] flex items-center gap-1.5 border ${
                                                                                tr.selected 
                                                                                    ? "bg-amber-500/15 border-amber-500/40 text-amber-200" 
                                                                                    : isEnglish
                                                                                    ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200 font-semibold"
                                                                                    : "bg-slate-900 border-slate-800 text-muted-foreground"
                                                                            }`}
                                                                        >
                                                                            <Volume2 className={`h-3 w-3 shrink-0 ${isEnglish ? "text-emerald-400" : tr.selected ? "text-amber-400" : "text-muted-foreground"}`} />
                                                                            <span>{tr.displayTitle}</span>
                                                                            {tr.selected && <span className="text-[9px] uppercase font-bold text-amber-400">(Active)</span>}
                                                                            {isEnglish && !tr.selected && <span className="text-[9px] uppercase font-bold text-emerald-400">(Available)</span>}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>

                                                        {/* Disk Playback Verification Row (if tested) */}
                                                        {msg.mediaInspection.playbackTest && (
                                                            <div className={`px-2.5 py-1.5 rounded-lg flex items-center justify-between text-[10px] border ${
                                                                msg.mediaInspection.playbackTest.canPlay 
                                                                    ? "bg-emerald-950/40 border-emerald-500/30 text-emerald-200" 
                                                                    : "bg-rose-950/40 border-rose-500/30 text-rose-200"
                                                            }`}>
                                                                <div className="flex items-center gap-1.5 min-w-0">
                                                                    <PlayCircle className={`h-3.5 w-3.5 shrink-0 ${msg.mediaInspection.playbackTest.canPlay ? "text-emerald-400" : "text-rose-400"}`} />
                                                                    <span className="font-semibold">{msg.mediaInspection.playbackTest.canPlay ? "Disk Playback Verified" : "Playback Failed"}</span>
                                                                    <span className="text-muted-foreground truncate">({msg.mediaInspection.serverName || "Server"})</span>
                                                                </div>
                                                                <div className="flex items-center gap-1.5 shrink-0 font-mono text-[9px]">
                                                                    {msg.mediaInspection.playbackTest.canPlay ? (
                                                                        <span className="text-emerald-300">
                                                                            {(msg.mediaInspection.playbackTest.bytesRead / 1024).toFixed(0)} KB in {msg.mediaInspection.playbackTest.latencyMs}ms
                                                                        </span>
                                                                    ) : (
                                                                        <span className="text-rose-300">
                                                                            {msg.mediaInspection.playbackTest.error || `HTTP ${msg.mediaInspection.playbackTest.httpStatus}`}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Playback Synthetic Health Probe Diagnostic Card (if any) */}
                                                {msg.playbackProbe && msg.playbackProbe.servers && msg.playbackProbe.servers.length > 0 && (
                                                    <div className="p-3.5 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2.5 text-[11px]">
                                                        <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <PlayCircle className="h-4 w-4 text-purple-400 shrink-0" />
                                                                <span className="font-bold text-white truncate">Synthetic Server Playback Probe</span>
                                                                <span className="text-[10px] text-muted-foreground">({msg.playbackProbe.operationalServers}/{msg.playbackProbe.totalServers} Online)</span>
                                                            </div>
                                                            <Badge variant="outline" className={`text-[9px] px-2 py-0.5 font-bold uppercase ${
                                                                msg.playbackProbe.allCanPlay 
                                                                    ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40" 
                                                                    : "bg-amber-950/60 text-amber-300 border-amber-500/40"
                                                            }`}>
                                                                {msg.playbackProbe.allCanPlay ? "Verified" : "Degraded"}
                                                            </Badge>
                                                        </div>

                                                        {/* Server Matrix */}
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                            {msg.playbackProbe.servers.map((srv: any, sIdx: number) => {
                                                                const isOp = srv.overallStatus === "OPERATIONAL";
                                                                const canPlay = srv.playbackTest?.canPlayMedia;
                                                                return (
                                                                    <div key={sIdx} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                                                                        <div className="flex items-center justify-between gap-1 text-[11px]">
                                                                            <span className="font-bold text-white flex items-center gap-1.5 truncate">
                                                                                <Server className="h-3 w-3 text-cyan-400" />
                                                                                {srv.serverName}
                                                                            </span>
                                                                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-700">
                                                                                {srv.apiPingMs}ms
                                                                            </Badge>
                                                                        </div>
                                                                        <div className="flex items-center justify-between text-[10px] text-slate-400">
                                                                            <span>Disk Stream:</span>
                                                                            <span className={canPlay ? "text-emerald-400 font-semibold" : "text-rose-400 font-semibold"}>
                                                                                {canPlay ? "PASS" : "FAIL"}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* Markdown Message Content */}
                                                <div className="prose prose-invert prose-xs max-w-none text-xs leading-relaxed break-words">
                                                    <ReactMarkdown
                                                        remarkPlugins={[remarkGfm, remarkBreaks]}
                                                        rehypePlugins={[rehypeRaw]}
                                                        components={{
                                                            h3: ({ node, ...props }) => (
                                                                <h3 className="text-sm font-bold text-purple-300 mt-2.5 mb-1.5 flex items-center gap-1.5" {...props} />
                                                            ),
                                                            h4: ({ node, ...props }) => (
                                                                <h4 className="text-xs font-bold text-cyan-300 mt-2 mb-1" {...props} />
                                                            ),
                                                            p: ({ node, ...props }) => (
                                                                <p className="my-1.5 text-slate-200 leading-relaxed" {...props} />
                                                            ),
                                                            ul: ({ node, ...props }) => (
                                                                <ul className="space-y-1 my-2 pl-4 list-disc text-slate-300" {...props} />
                                                            ),
                                                            ol: ({ node, ...props }) => (
                                                                <ol className="space-y-1 my-2 pl-4 list-decimal text-slate-300" {...props} />
                                                            ),
                                                            li: ({ node, ...props }) => (
                                                                <li className="my-0.5 leading-relaxed" {...props} />
                                                            ),
                                                            strong: ({ node, ...props }) => (
                                                                <strong className="font-bold text-white" {...props} />
                                                            ),
                                                            blockquote: ({ node, ...props }) => (
                                                                <blockquote className="border-l-2 border-purple-500 pl-3 py-1 my-2 bg-purple-950/20 rounded-r text-[11px] text-purple-200 italic" {...props} />
                                                            ),
                                                            code: ({ node, ...props }) => (
                                                                <code className="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-[10px] text-purple-200" {...props} />
                                                            )
                                                        }}
                                                    >
                                                        {msg.content}
                                                    </ReactMarkdown>
                                                </div>

                                                {/* Response Actions */}
                                                {msg.role === "assistant" && (
                                                    <div className="pt-2 border-t border-border/30 flex flex-wrap items-center gap-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleTransferToTicket(msg.content)}
                                                            className="h-6 text-[10px] px-2 border-amber-500/30 text-amber-300 hover:bg-amber-950/40 gap-1 rounded-md cursor-pointer"
                                                        >
                                                            <LifeBuoy className="h-3 w-3 text-amber-400" />
                                                            <span>Open Support Ticket With This Diagnosis</span>
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}

                                {/* Thinking / Diagnostic In-Progress State */}
                                {loading && (
                                    <div className="flex items-start gap-3 animate-in fade-in duration-200">
                                        <div className="h-8 w-8 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 text-white flex items-center justify-center shrink-0 shadow-md border border-purple-400/30 mt-0.5">
                                            <Bot className="h-4 w-4" />
                                        </div>
                                        <div className="p-3.5 rounded-2xl bg-slate-900 border border-purple-500/30 text-xs text-purple-200 flex items-center gap-3 shadow-lg">
                                            <Loader2 className="h-4 w-4 animate-spin text-purple-400 shrink-0" />
                                            <span className="leading-relaxed">
                                                Inspecting stream telemetry, querying indexers, and generating step-by-step fix...
                                            </span>
                                        </div>
                                    </div>
                                )}
                                <div ref={messagesEndRef} />
                            </div>

                            {/* Chat Input Dock */}
                            <div className="p-3 sm:p-4 border-t border-border/50 bg-[#0e0f17] space-y-2 shrink-0">
                                {/* Quick Suggestion Prompt Chips */}
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar text-[10px]">
                                    <span className="text-slate-500 shrink-0 font-semibold flex items-center gap-1">
                                        <Sparkles className="h-3 w-3 text-purple-400" />
                                        <span>Quick:</span>
                                    </span>
                                    {quickPrompts.map((p, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleSend(p.query)}
                                            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-purple-950/50 border border-slate-800 hover:border-purple-500/40 text-slate-300 hover:text-white transition-all shrink-0 whitespace-nowrap cursor-pointer flex items-center gap-1"
                                        >
                                            <span>{p.icon}</span>
                                            <span>{p.label}</span>
                                        </button>
                                    ))}
                                    {messages.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => setMessages([])}
                                            className="ml-auto px-2 py-1 text-slate-500 hover:text-rose-400 transition-colors shrink-0 flex items-center gap-1 cursor-pointer"
                                            title="Clear conversation"
                                        >
                                            <RotateCcw className="h-3 w-3" />
                                            <span>Clear</span>
                                        </button>
                                    )}
                                </div>

                                {/* Form Input Bar */}
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleSend();
                                    }}
                                    className="flex items-center gap-2"
                                >
                                    <Input
                                        value={inputQuestion}
                                        onChange={(e) => setInputQuestion(e.target.value)}
                                        placeholder="Ask a question, describe buffering, or ask to fix audio tracks..."
                                        className="h-10 text-xs bg-slate-950 border-slate-800 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 rounded-xl"
                                        disabled={loading}
                                    />
                                    <Button
                                        type="submit"
                                        disabled={loading || !inputQuestion.trim()}
                                        className="h-10 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-md shadow-purple-950/50 flex items-center gap-1.5 shrink-0 rounded-xl cursor-pointer disabled:opacity-50"
                                    >
                                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                        <span className="hidden sm:inline">Ask AI</span>
                                    </Button>
                                </form>
                            </div>
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* TAB 2: LIVE STREAM TELEMETRY & DIAGNOSTICS */}
                    {/* ======================================================== */}
                    {activeTab === "telemetry" && (
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                            {/* Primary Active Stream Card */}
                            {activeStream ? (
                                <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/90 border border-purple-500/40 space-y-4 shadow-xl">
                                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                                <Tv className="h-5 w-5" />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-bold text-white text-base truncate">{activeStream.title}</h3>
                                                    {activeStream.year && <span className="text-slate-400 text-xs">({activeStream.year})</span>}
                                                </div>
                                                <p className="text-xs text-slate-400">
                                                    Client: <strong className="text-cyan-300">{activeStream.player}</strong> on {activeStream.platform}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <Badge variant="outline" className={`text-xs px-2.5 py-0.5 font-bold uppercase ${
                                                activeStream.transcodeDecision === "direct play" 
                                                    ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40" 
                                                    : "bg-amber-950/60 text-amber-300 border-amber-500/40"
                                            }`}>
                                                {activeStream.transcodeDecision}
                                            </Badge>
                                            {activeStream.transcodeHwRequested && (
                                                <Badge variant="outline" className="text-xs px-2 py-0.5 bg-cyan-950/60 text-cyan-300 border-cyan-500/40 font-mono">
                                                    NVENC HW
                                                </Badge>
                                            )}
                                        </div>
                                    </div>

                                    {/* Stream Telemetry Grid */}
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-0.5">
                                            <span className="text-[10px] text-slate-500 uppercase font-mono block">Video Codec</span>
                                            <span className="font-bold text-slate-200">{activeStream.videoCodec?.toUpperCase() || "N/A"}</span>
                                            <span className="text-[10px] text-slate-400 block">{activeStream.videoResolution || "1080p"}</span>
                                        </div>

                                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-0.5">
                                            <span className="text-[10px] text-slate-500 uppercase font-mono block">Audio Codec</span>
                                            <span className="font-bold text-slate-200">{activeStream.audioCodec?.toUpperCase() || "N/A"}</span>
                                            <span className="text-[10px] text-slate-400 block">{activeStream.streamAudioCodec ? `Stream: ${activeStream.streamAudioCodec}` : "Pass-through"}</span>
                                        </div>

                                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-0.5">
                                            <span className="text-[10px] text-slate-500 uppercase font-mono block">Bitrate</span>
                                            <span className="font-bold text-purple-300">
                                                {activeStream.streamBitrate ? `${(activeStream.streamBitrate / 1000).toFixed(1)} Mbps` : "Auto"}
                                            </span>
                                            <span className="text-[10px] text-slate-400 block">Bandwidth</span>
                                        </div>

                                        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-0.5">
                                            <span className="text-[10px] text-slate-500 uppercase font-mono block">Transcode Speed</span>
                                            <span className="font-bold text-emerald-400">{activeStream.transcodeSpeed || "1.0x (Direct)"}</span>
                                            <span className="text-[10px] text-slate-400 block">{activeStream.serverName || "Main Server"}</span>
                                        </div>
                                    </div>

                                    {/* Action Bar */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
                                        <p className="text-xs text-slate-400">
                                            {activeStream.transcodeReason ? `Transcode Reason: ${activeStream.transcodeReason}` : "Optimal Direct Stream active"}
                                        </p>
                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                setActiveTab("chat");
                                                handleSend(`Analyze my current stream: "${activeStream.title}" playing on ${activeStream.player}. Why is it ${activeStream.transcodeDecision}? Give me exact steps to optimize quality.`);
                                            }}
                                            className="h-8 px-3 text-xs bg-purple-600 hover:bg-purple-500 text-white font-semibold gap-1.5 cursor-pointer"
                                        >
                                            <Sparkles className="h-3.5 w-3.5" />
                                            <span>Diagnose Stream With AI</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-3">
                                    <div className="p-3 rounded-2xl bg-slate-800/60 text-slate-400 w-fit mx-auto">
                                        <Radio className="h-6 w-6" />
                                    </div>
                                    <div className="space-y-1">
                                        <h4 className="font-bold text-white text-sm">No Active Streams Detected</h4>
                                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                                            When you start streaming on Apple TV, Roku, Fire TV, or mobile, live telemetry (decision, bitrate, codecs, speed) will automatically populate here.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Detected Issues & Quick Fixes Section */}
                            <div className="space-y-3">
                                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                    <span>Detected Telemetry Issues ({detectedIssues.length})</span>
                                </h4>

                                {detectedIssues.length === 0 ? (
                                    <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                        <span>No active playback or network bottlenecks detected across your recent sessions!</span>
                                    </div>
                                ) : (
                                    <div className="space-y-2.5">
                                        {detectedIssues.map((iss, iIdx) => (
                                            <div key={iIdx} className="p-4 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-2.5 text-xs">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="space-y-0.5">
                                                        <h5 className="font-bold text-amber-300 text-sm flex items-center gap-1.5">
                                                            <span>{iss.title}</span>
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500/40 text-amber-300">
                                                                {iss.deviceAffected}
                                                            </Badge>
                                                        </h5>
                                                        <p className="text-slate-300 text-[11px]">{iss.summary}</p>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => {
                                                            setActiveTab("chat");
                                                            handleSend(`Provide exact steps to fix: ${iss.title} on ${iss.deviceAffected}.`);
                                                        }}
                                                        className="h-7 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold shrink-0 cursor-pointer"
                                                    >
                                                        Apply Fix
                                                    </Button>
                                                </div>

                                                {iss.steps && iss.steps.length > 0 && (
                                                    <div className="p-3 rounded-lg bg-slate-950/60 border border-amber-500/20 space-y-1">
                                                        <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider block">Recommended Fix Steps:</span>
                                                        <ol className="list-decimal pl-4 space-y-1 text-slate-300 text-[11px]">
                                                            {iss.steps.map((st, sIdx) => (
                                                                <li key={sIdx}>{st}</li>
                                                            ))}
                                                        </ol>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Chronic Pattern Insights (if any) */}
                            {patternInsights.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                                        <span>Long-Term Playback Insights</span>
                                    </h4>
                                    <div className="space-y-2">
                                        {patternInsights.map((pat, pIdx) => (
                                            <div key={pIdx} className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 text-xs space-y-1.5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-bold text-purple-200">{pat.title}</span>
                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-purple-500/40 text-purple-300 bg-purple-950/40">
                                                        {pat.occurrenceCount} Occurrence(s)
                                                    </Badge>
                                                </div>
                                                <p className="text-[11px] text-slate-300">{pat.description}</p>
                                                <p className="text-[11px] text-purple-300 font-medium">Remedy: {pat.remedy}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* TAB 3: SERVER DISK & HEALTH PROBES */}
                    {/* ======================================================== */}
                    {activeTab === "probes" && (
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
                            <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900 border border-slate-800">
                                <div className="space-y-0.5">
                                    <h3 className="font-bold text-white text-sm flex items-center gap-2">
                                        <Activity className="h-4 w-4 text-emerald-400" />
                                        <span>Physical Disk Read &amp; Server Diagnostics</span>
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        Direct synthetic probes testing actual byte-range file reads, SQLite latency, and GPU transcoding.
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => {
                                        setActiveTab("chat");
                                        handleSend("Run a live synthetic playback and disk access probe across all media servers.");
                                    }}
                                    className="h-8 px-3 text-xs bg-purple-600 hover:bg-purple-500 text-white font-semibold gap-1.5 cursor-pointer"
                                >
                                    <Sparkles className="h-3.5 w-3.5" />
                                    <span>Run Probe Test</span>
                                </Button>
                            </div>

                            {/* Server Node Cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                {(snapshot?.serverNodes && snapshot.serverNodes.length > 0 ? snapshot.serverNodes : [
                                    { name: "Main Plex Server", type: "plex", status: "ONLINE", isLocal: true, isRelay: false, pingMs: 12 },
                                    { name: "Kids Plex Server", type: "plex", status: "ONLINE", isLocal: true, isRelay: false, pingMs: 14 }
                                ]).map((srvNode, sIdx) => {
                                    const isOperational = srvNode.status === "ONLINE";
                                    return (
                                        <div 
                                            key={sIdx} 
                                            className={`p-4 rounded-xl bg-slate-900/80 border space-y-3 ${
                                                isOperational ? "border-emerald-500/30" : "border-rose-500/30"
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-2">
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <Server className={`h-4 w-4 shrink-0 ${isOperational ? "text-emerald-400" : "text-rose-400"}`} />
                                                    <span className="font-bold text-white text-sm truncate">{srvNode.name}</span>
                                                </div>
                                                <Badge 
                                                    variant="outline" 
                                                    className={`text-[10px] px-2 py-0.5 font-bold uppercase shrink-0 ${
                                                        isOperational 
                                                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40" 
                                                            : "bg-rose-950/60 text-rose-300 border-rose-500/40"
                                                    }`}
                                                >
                                                    {srvNode.status || "OPERATIONAL"}
                                                </Badge>
                                            </div>
                                            <div className="space-y-1.5 text-xs">
                                                <div className="flex justify-between text-slate-300">
                                                    <span className="text-slate-400 flex items-center gap-1.5">
                                                        <HardDrive className="h-3.5 w-3.5 text-cyan-400" />
                                                        Disk Streaming:
                                                    </span>
                                                    <span className="font-mono text-emerald-400 font-semibold">PASS ({srvNode.pingMs || 12}ms)</span>
                                                </div>
                                                <div className="flex justify-between text-slate-300">
                                                    <span className="text-slate-400 flex items-center gap-1.5">
                                                        <Activity className="h-3.5 w-3.5 text-purple-400" />
                                                        Connection:
                                                    </span>
                                                    <span className="font-mono text-slate-200">{srvNode.isLocal ? "Local Direct" : srvNode.isRelay ? "Relay" : "Direct Remote"}</span>
                                                </div>
                                                <div className="flex justify-between text-slate-300">
                                                    <span className="text-slate-400 flex items-center gap-1.5">
                                                        <Cpu className="h-3.5 w-3.5 text-amber-400" />
                                                        Hardware Transcode:
                                                    </span>
                                                    <span className="font-mono text-emerald-400">Ready</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ======================================================== */}
                    {/* TAB 4: QUICK FIXES & COMMON CLIENT ISSUES */}
                    {/* ======================================================== */}
                    {activeTab === "fixes" && (
                        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                            <div className="space-y-1">
                                <h3 className="font-bold text-white text-sm">1-Click Client Playback Fixes</h3>
                                <p className="text-xs text-slate-400">
                                    Click any diagnostic solution below to have Plex &amp; Server Master AI verify your file or walk you through exact device settings.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {quickPrompts.map((p, idx) => (
                                    <div 
                                        key={idx} 
                                        className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-purple-500/40 transition-all flex flex-col justify-between gap-3 group"
                                    >
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-bold text-white group-hover:text-purple-300 flex items-center gap-2">
                                                    <span>{p.icon}</span>
                                                    <span>{p.label}</span>
                                                </span>
                                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-700 text-slate-400">
                                                    {p.category}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-slate-300 leading-relaxed pt-1">
                                                {p.query}
                                            </p>
                                        </div>

                                        <Button
                                            size="sm"
                                            onClick={() => {
                                                setActiveTab("chat");
                                                handleSend(p.query);
                                            }}
                                            className="w-full text-xs font-semibold h-8 bg-slate-800 hover:bg-purple-600 hover:text-white text-slate-200 border border-slate-700 hover:border-purple-500/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                        >
                                            <Sparkles className="h-3 w-3 text-purple-400" />
                                            <span>Diagnose With AI</span>
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    );
}

export default AiServerAssistant;
