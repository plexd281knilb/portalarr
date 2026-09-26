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
    XCircle
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { askAiServerMasterAction, getUserAiDiagnosticSnapshotAction } from "@/app/actions";
import { UserDiagnosticSnapshot, AiChatMessage } from "@/lib/ai-server-assistant-types";
import PlexSetupGuides from "@/components/plex-setup-guides";

export function AiServerAssistant() {
    const [isOpen, setIsOpen] = useState(false);
    const [quickQuestion, setQuickQuestion] = useState("");
    const [inputQuestion, setInputQuestion] = useState("");
    const [loading, setLoading] = useState(false);
    const [diagLoading, setDiagLoading] = useState(false);
    const [snapshot, setSnapshot] = useState<UserDiagnosticSnapshot | null>(null);
    const [messages, setMessages] = useState<AiChatMessage[]>([]);
    const [copiedIndex, setCopiedIndex] = useState<number | null>(null);
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
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, isOpen, loading]);

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

        try {
            const timeoutPromise = new Promise<{ success: false; error: string }>((resolve) => 
                setTimeout(() => resolve({ success: false, error: "Request timed out. Please try again." }), 30000)
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
        { label: "🟢 Is Plex Working? (Playback Test)", query: "Is Plex working right now? Test actual file playback and disk access for each server." },
        { label: "⚾ The Sandlot (Spanish Audio Check)", query: "The Sandlot is in Spanish only. Can you check if English audio is available or replace it?" },
        { label: "📺 Roku 'Quality Too Low' Fix", query: "Why is my Roku giving an error saying quality is too low or crashing when playing a movie?" },
        { label: "⚡ Why is my stream buffering?", query: "Why is my stream buffering and how do I get 100% Direct Play?" },
        { label: "🔊 Audio & Dialogue Optimization", query: "Dialogue is too quiet or audio is transcoding. How do I fix it?" },
        { label: "💬 Subtitles causing stutter", query: "Why do subtitles cause video buffering and how do I fix subtitle burn-in?" },
        { label: "⚙️ Best Remote Quality Settings", query: "What are the recommended Plex settings for my device to avoid 720p 2Mbps limit?" }
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
                            className="w-full text-xs font-semibold h-8 border-purple-500/30 text-purple-300 hover:bg-purple-950/30 hover:border-purple-500/50 transition-all flex items-center justify-center gap-1.5"
                        >
                            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                            <span>Open Diagnostic Assistant</span>
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* --- FULL INTERACTIVE AI MASTER MODAL --- */}
            <Dialog open={isOpen} onOpenChange={setIsOpen}>
                <DialogContent className="max-w-3xl max-h-[90vh] h-[780px] flex flex-col bg-[#101015]/95 border-purple-500/30 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden text-foreground">
                    {/* Header */}
                    <DialogHeader className="p-5 pb-3.5 border-b border-border/40 bg-gradient-to-r from-purple-950/30 via-background to-cyan-950/20">
                        <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-cyan-500 text-white shadow-lg shadow-purple-950/50 border border-purple-400/30">
                                    <Bot className="h-5 w-5" />
                                </div>
                                <div>
                                    <DialogTitle className="text-lg font-bold flex items-center gap-2">
                                        <span>Plex &amp; Server Master AI</span>
                                        <Badge variant="outline" className="text-[10px] font-bold bg-purple-950/60 text-purple-300 border-purple-500/50">
                                            v3.1 Autonomous
                                        </Badge>
                                    </DialogTitle>
                                    <DialogDescription className="text-xs text-muted-foreground">
                                        Personalized stream health diagnostics, stream track inspection, Radarr auto-repair &amp; live assistance.
                                    </DialogDescription>
                                </div>
                            </div>

                            <div className="flex items-center gap-2">
                                <PlexSetupGuides />
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={fetchSnapshot}
                                    disabled={diagLoading}
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                    title="Refresh diagnostics"
                                >
                                    <RefreshCw className={`h-4 w-4 ${diagLoading ? "animate-spin text-purple-400" : ""}`} />
                                </Button>
                            </div>
                        </div>

                        {/* Live Telemetry Health Bar */}
                        <div className="mt-3 p-3 rounded-xl bg-[#14141d] border border-border/40 flex flex-wrap items-center justify-between gap-2.5 text-xs">
                            <div className="flex items-center gap-2">
                                <span className={`h-2.5 w-2.5 rounded-full ${activeStream ? "bg-emerald-400 animate-pulse" : "bg-slate-400"}`} />
                                <span className="font-semibold text-slate-200">
                                    {activeStream ? (
                                        <>Active Stream: <strong className="text-white">{activeStream.title}</strong> on <span className="text-purple-300">{activeStream.player}</span></>
                                    ) : (
                                        <>No active stream detected (Telemetry standby)</>
                                    )}
                                </span>
                            </div>

                            <div className="flex items-center gap-2">
                                {activeStream && (
                                    <>
                                        <Badge variant="outline" className={`text-[10px] ${
                                            activeStream.transcodeDecision === "direct play" 
                                                ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40 font-bold"
                                                : "bg-amber-950/60 text-amber-300 border-amber-500/40 font-bold"
                                        }`}>
                                            {activeStream.transcodeDecision.toUpperCase()}
                                        </Badge>
                                        {activeStream.streamBitrate && (
                                            <span className="text-[11px] text-muted-foreground">
                                                {(activeStream.streamBitrate / 1000).toFixed(1)} Mbps
                                            </span>
                                        )}
                                    </>
                                )}
                                <span className="text-[11px] text-slate-400">User: <strong className="text-slate-200">{snapshot?.username || "Guest"}</strong></span>
                            </div>
                        </div>

                        {/* Detected Critical Alert Banner */}
                        {detectedIssues.length > 0 && (
                            <div className="mt-2 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start justify-between gap-3 text-xs text-amber-200">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-amber-300">{detectedIssues[0].title}</h4>
                                        <p className="text-[11px] text-amber-200/80">{detectedIssues[0].summary}</p>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    onClick={() => handleSend(`How do I fix: ${detectedIssues[0].title}? Provide exact steps for ${detectedIssues[0].deviceAffected}.`)}
                                    className="h-7 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shrink-0"
                                >
                                    Get Device Fix
                                </Button>
                            </div>
                        )}

                        {/* Chronic Pattern Insights Banner (if detected) */}
                        {patternInsights.length > 0 && (
                            <div className="mt-2 p-2.5 rounded-xl bg-purple-950/30 border border-purple-500/30 flex items-start justify-between gap-3 text-xs text-purple-200">
                                <div className="flex items-start gap-2">
                                    <Sparkles className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
                                    <div>
                                        <h4 className="font-bold text-purple-300 text-[11px] flex items-center gap-1.5">
                                            <span>Stream Insight: {patternInsights[0].title}</span>
                                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-purple-500/40 text-purple-300 bg-purple-950/40">
                                                {patternInsights[0].occurrenceCount} Session(s)
                                            </Badge>
                                        </h4>
                                        <p className="text-[10px] text-purple-200/80 leading-relaxed">{patternInsights[0].description}</p>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleSend(`How do I permanently fix: ${patternInsights[0].title}? Provide exact device settings for ${patternInsights[0].affectedDevices.join(", ")}.`)}
                                    className="h-6 text-[10px] border-purple-500/40 text-purple-300 hover:bg-purple-950/40 shrink-0 font-semibold"
                                >
                                    Optimize
                                </Button>
                            </div>
                        )}
                    </DialogHeader>

                    {/* Chat Messages Feed */}
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
                        {messages.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                                <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 shadow-inner">
                                    <Bot className="h-10 w-10 animate-bounce" />
                                </div>
                                <div className="max-w-md space-y-1.5">
                                    <h3 className="text-base font-bold text-foreground">How can I help with your media playback today?</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Ask me any question about playback errors, buffering, Roku/FireTV/AppleTV quality settings, language audio tracks, or movie redownloads.
                                    </p>
                                </div>

                                {/* Quick Prompt Suggestions */}
                                <div className="w-full max-w-lg pt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {quickPrompts.map((p, idx) => (
                                        <button
                                            key={idx}
                                            type="button"
                                            onClick={() => handleSend(p.query)}
                                            className="p-2.5 text-left rounded-xl bg-background/60 hover:bg-purple-950/30 border border-border/40 hover:border-purple-500/40 text-xs text-muted-foreground hover:text-foreground transition-all flex items-center justify-between gap-2 group cursor-pointer"
                                        >
                                            <span className="font-medium text-[11px] group-hover:text-purple-300">{p.label}</span>
                                            <ArrowRight className="h-3 w-3 opacity-40 group-hover:opacity-100 group-hover:text-purple-400 shrink-0" />
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
                                        <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 text-white flex items-center justify-center shrink-0 shadow-md">
                                            <Bot className="h-4 w-4" />
                                        </div>
                                    )}

                                    <div className={`max-w-[85%] rounded-2xl p-4 text-xs leading-relaxed space-y-2.5 shadow-md ${
                                        msg.role === "user"
                                            ? "bg-purple-600 text-white rounded-tr-xs"
                                            : "bg-[#161622] border border-border/50 text-slate-200 rounded-tl-xs"
                                    }`}>
                                        <div className="flex items-center justify-between gap-2 border-b border-white/10 pb-1.5 mb-1.5 text-[10px] text-muted-foreground">
                                            <div className="flex items-center gap-1.5">
                                                <span className="font-bold text-foreground">
                                                    {msg.role === "user" ? "You" : "Plex & Server Master"}
                                                </span>
                                                {msg.role === "assistant" && msg.providerUsed && (
                                                    <Badge variant="outline" className="text-[9px] px-1.5 py-0 font-normal border-purple-500/30 text-purple-300 bg-purple-950/30">
                                                        {msg.providerUsed}
                                                    </Badge>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1.5">
                                                <span>{msg.timestamp}</span>
                                                {msg.role === "assistant" && (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleCopy(msg.content, index)}
                                                        className="p-1 hover:text-white transition-colors"
                                                        title="Copy text"
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
                                                        className={`p-2 rounded-xl text-[11px] flex items-start gap-2 border ${
                                                            act.action === "RADARR_SEARCH_GRAB" 
                                                                ? "bg-purple-950/40 border-purple-500/40 text-purple-200" 
                                                                : act.action === "ESCALATE_ADMIN_TICKET"
                                                                ? "bg-amber-950/40 border-amber-500/40 text-amber-200"
                                                                : "bg-cyan-950/30 border-cyan-500/30 text-cyan-200"
                                                        }`}
                                                    >
                                                        {act.action === "RADARR_SEARCH_GRAB" ? (
                                                            <Download className="h-3.5 w-3.5 text-purple-400 shrink-0 mt-0.5" />
                                                        ) : act.action === "ESCALATE_ADMIN_TICKET" ? (
                                                            <LifeBuoy className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                                                        ) : (
                                                            <Film className="h-3.5 w-3.5 text-cyan-400 shrink-0 mt-0.5" />
                                                        )}
                                                        <div className="min-w-0">
                                                            <div className="font-semibold flex items-center gap-1.5 flex-wrap">
                                                                <span>{act.target}</span>
                                                                <Badge variant="outline" className={`text-[9px] px-1 py-0 uppercase ${
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
                                            <div className="p-3 rounded-xl bg-[#12121c] border border-cyan-500/30 space-y-2 text-[11px]">
                                                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-1.5">
                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                        <Languages className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                                        <span className="font-bold text-white truncate">{msg.mediaInspection.title}</span>
                                                        {msg.mediaInspection.year && <span className="text-muted-foreground text-[10px]">({msg.mediaInspection.year})</span>}
                                                    </div>
                                                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${
                                                        msg.mediaInspection.verdict === "AUDIO_EXISTS_CLIENT_FIX" 
                                                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40 font-bold"
                                                            : msg.mediaInspection.verdict === "MISSING_LANGUAGE_TRACK"
                                                            ? "bg-amber-950/60 text-amber-300 border-amber-500/40 font-bold"
                                                            : "bg-cyan-950/60 text-cyan-300 border-cyan-500/40 font-bold"
                                                    }`}>
                                                        {msg.mediaInspection.verdict === "AUDIO_EXISTS_CLIENT_FIX" ? "English In File" :
                                                         msg.mediaInspection.verdict === "MISSING_LANGUAGE_TRACK" ? "Spanish Only" : "Verified"}
                                                    </Badge>
                                                </div>

                                                {/* Audio Track Pills */}
                                                <div className="space-y-1">
                                                    <span className="text-[10px] text-muted-foreground font-semibold block">Detected Audio Streams:</span>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {msg.mediaInspection.audioTracks.map((tr, tIdx) => {
                                                            const isEnglish = tr.language.toLowerCase() === "english" || tr.languageCode === "eng";
                                                            return (
                                                                <div 
                                                                    key={tIdx} 
                                                                    className={`px-2 py-1 rounded-md text-[10px] flex items-center gap-1.5 border ${
                                                                        tr.selected 
                                                                            ? "bg-amber-500/15 border-amber-500/40 text-amber-200" 
                                                                            : isEnglish
                                                                            ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-200 font-semibold"
                                                                            : "bg-background/60 border-border/40 text-muted-foreground"
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
                                            </div>
                                        )}

                                        {/* Playback Synthetic Health Probe Diagnostic Card (if any) */}
                                        {msg.playbackProbe && msg.playbackProbe.servers && msg.playbackProbe.servers.length > 0 && (
                                            <div className="p-3 rounded-xl bg-[#12121c] border border-purple-500/30 space-y-2.5 text-[11px]">
                                                <div className="flex items-center justify-between gap-2 border-b border-border/40 pb-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <PlayCircle className="h-4 w-4 text-purple-400 shrink-0" />
                                                        <span className="font-bold text-white truncate">Synthetic Playback Probe</span>
                                                        <span className="text-[10px] text-muted-foreground">({msg.playbackProbe.operationalServers}/{msg.playbackProbe.totalServers} Operational)</span>
                                                    </div>
                                                    <Badge variant="outline" className={`text-[9px] px-2 py-0.5 font-bold uppercase ${
                                                        msg.playbackProbe.allCanPlay 
                                                            ? "bg-emerald-950/60 text-emerald-300 border-emerald-500/40" 
                                                            : msg.playbackProbe.operationalServers > 0
                                                            ? "bg-amber-950/60 text-amber-300 border-amber-500/40"
                                                            : "bg-rose-950/60 text-rose-300 border-rose-500/40"
                                                    }`}>
                                                        {msg.playbackProbe.allCanPlay ? "Stream Verified" : "Storage Degraded"}
                                                    </Badge>
                                                </div>

                                                {/* Server Cards */}
                                                <div className="space-y-2">
                                                    {msg.playbackProbe.servers.map((srv: any, sIdx: number) => {
                                                        const isOp = srv.overallStatus === "OPERATIONAL";
                                                        const canPlay = srv.playbackTest?.canPlayMedia;
                                                        return (
                                                            <div 
                                                                key={sIdx}
                                                                className={`p-2.5 rounded-lg border text-[11px] space-y-1.5 ${
                                                                    isOp 
                                                                        ? "bg-emerald-950/15 border-emerald-500/30" 
                                                                        : srv.apiStatus !== "DOWN" 
                                                                        ? "bg-amber-950/20 border-amber-500/40" 
                                                                        : "bg-rose-950/20 border-rose-500/40"
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between gap-2">
                                                                    <div className="flex items-center gap-1.5 min-w-0">
                                                                        <Server className={`h-3.5 w-3.5 shrink-0 ${isOp ? "text-emerald-400" : "text-amber-400"}`} />
                                                                        <span className="font-bold text-white truncate">{srv.serverName}</span>
                                                                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-border/50 text-muted-foreground">
                                                                            {srv.apiPingMs}ms
                                                                        </Badge>
                                                                        {srv.isLocal && (
                                                                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-cyan-500/40 text-cyan-300 bg-cyan-950/30">
                                                                                LAN
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                    <Badge variant="outline" className={`text-[9px] px-1.5 py-0 font-semibold uppercase ${
                                                                        isOp ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40" :
                                                                        srv.apiStatus !== "DOWN" ? "bg-amber-950/40 text-amber-300 border-amber-500/40" :
                                                                        "bg-rose-950/40 text-rose-300 border-rose-500/40"
                                                                    }`}>
                                                                        {isOp ? "Operational" : srv.apiStatus !== "DOWN" ? "Disk / DB Alert" : "Offline"}
                                                                    </Badge>
                                                                </div>

                                                                {/* Test Matrix */}
                                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-1.5 pt-1 text-[10px]">
                                                                    {/* Disk Streaming Probe */}
                                                                    <div className={`p-1.5 rounded flex items-center gap-1.5 border ${
                                                                        canPlay ? "bg-emerald-950/30 border-emerald-500/30 text-emerald-200" : "bg-rose-950/40 border-rose-500/40 text-rose-200 font-semibold"
                                                                    }`}>
                                                                        <HardDrive className="h-3 w-3 shrink-0" />
                                                                        <div className="truncate">
                                                                            <span className="block font-semibold">Disk Stream: {canPlay ? "PASS" : "FAIL"}</span>
                                                                            <span className="text-[9px] opacity-80 truncate block">
                                                                                {canPlay ? `${srv.playbackTest.bytesRead}B in ${srv.playbackTest.readLatencyMs}ms` : (srv.playbackTest.error || "Storage unmounted")}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* SQLite DB Probe */}
                                                                    <div className={`p-1.5 rounded flex items-center gap-1.5 border ${
                                                                        srv.databaseStatus === "OK" ? "bg-background/50 border-border/40 text-slate-300" : "bg-amber-950/40 border-amber-500/40 text-amber-200 font-semibold"
                                                                    }`}>
                                                                        <Database className="h-3 w-3 shrink-0 text-purple-400" />
                                                                        <div className="truncate">
                                                                            <span className="block font-semibold">DB: {srv.databaseStatus}</span>
                                                                            <span className="text-[9px] opacity-80 truncate block">
                                                                                {srv.databaseLatencyMs ? `${srv.databaseLatencyMs}ms (${srv.sectionsCount} libs)` : "Locked / Timeout"}
                                                                            </span>
                                                                        </div>
                                                                    </div>

                                                                    {/* Transcode Engine */}
                                                                    <div className={`p-1.5 rounded flex items-center gap-1.5 border ${
                                                                        srv.transcodeTest?.ready ? "bg-background/50 border-border/40 text-slate-300" : "bg-amber-950/40 border-amber-500/40 text-amber-200"
                                                                    }`}>
                                                                        <Activity className="h-3 w-3 shrink-0 text-cyan-400" />
                                                                        <div className="truncate">
                                                                            <span className="block font-semibold">Transcoder: {srv.transcodeTest?.ready ? "Ready" : "Degraded"}</span>
                                                                            <span className="text-[9px] opacity-80 truncate block">
                                                                                {srv.transcodeTest?.ready ? `${srv.transcodeTest.latencyMs}ms latency` : (srv.transcodeTest?.error || "Offline")}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {srv.playbackTest?.testedTitle && (
                                                                    <div className="text-[10px] text-muted-foreground flex items-center gap-1 pt-0.5">
                                                                        <Film className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                                                                        <span className="truncate">Streamed live chunk from: <strong className="text-slate-300 font-medium">{srv.playbackTest.testedTitle}</strong></span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        <div className="prose prose-invert prose-xs max-w-none text-xs leading-relaxed break-words">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm, remarkBreaks]}
                                                rehypePlugins={[rehypeRaw]}
                                                components={{
                                                    h3: ({ node, ...props }) => (
                                                        <h3 className="text-sm font-bold text-purple-300 mt-2 mb-1.5 flex items-center gap-1.5" {...props} />
                                                    ),
                                                    h4: ({ node, ...props }) => (
                                                        <h4 className="text-xs font-bold text-cyan-300 mt-2 mb-1" {...props} />
                                                    ),
                                                    p: ({ node, ...props }) => (
                                                        <p className="my-1 text-slate-300 leading-relaxed" {...props} />
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
                                                        <blockquote className="border-l-2 border-purple-500 pl-2.5 py-1 my-1.5 bg-purple-950/20 rounded-r text-[11px] text-purple-200 italic" {...props} />
                                                    ),
                                                    code: ({ node, ...props }) => (
                                                        <code className="px-1 py-0.5 rounded bg-muted/40 font-mono text-[10px] text-purple-200" {...props} />
                                                    )
                                                }}
                                            >
                                                {msg.content}
                                            </ReactMarkdown>
                                        </div>

                                        {/* Action Bar for AI Response */}
                                        {msg.role === "assistant" && (
                                            <div className="pt-2 border-t border-border/30 flex flex-wrap items-center gap-2">
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleTransferToTicket(msg.content)}
                                                    className="h-6 text-[10px] px-2 border-amber-500/30 text-amber-300 hover:bg-amber-950/40 gap-1 rounded-md"
                                                >
                                                    <LifeBuoy className="h-3 w-3 text-amber-400" />
                                                    <span>Open Ticket With This Diagnosis</span>
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))
                        )}

                        {loading && (
                            <div className="flex items-start gap-3 animate-in fade-in duration-200">
                                <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-purple-600 to-cyan-500 text-white flex items-center justify-center shrink-0 shadow-md">
                                    <Bot className="h-4 w-4" />
                                </div>
                                <div className="p-3.5 rounded-2xl bg-[#161622] border border-border/50 text-xs text-muted-foreground flex items-center gap-2.5 shadow-md">
                                    <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                                    <span>Inspecting streams, evaluating indexers &amp; generating step-by-step fix...</span>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Quick Suggestion Chips (when chatting) */}
                    {messages.length > 0 && (
                        <div className="px-4 py-1.5 border-t border-border/30 bg-[#12121a] flex items-center gap-1.5 overflow-x-auto text-[10px]">
                            <span className="text-muted-foreground shrink-0 font-semibold">Quick Ask:</span>
                            {quickPrompts.slice(0, 4).map((p, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => handleSend(p.query)}
                                    className="px-2 py-1 rounded-lg bg-background/50 hover:bg-purple-950/40 border border-border/40 text-muted-foreground hover:text-purple-300 transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                                >
                                    {p.label}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={() => setMessages([])}
                                className="ml-auto px-2 py-1 text-muted-foreground hover:text-rose-400 transition-colors shrink-0 flex items-center gap-1"
                                title="Clear conversation"
                            >
                                <RotateCcw className="h-2.5 w-2.5" />
                                <span>Reset</span>
                            </button>
                        </div>
                    )}

                    {/* Input Bar */}
                    <div className="p-4 border-t border-border/40 bg-[#14141d]/90">
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
                                placeholder="Describe your issue (e.g. The Sandlot is in Spanish, Roku quality error, buffering)..."
                                className="h-10 text-xs bg-background/80 border-border/60 focus:border-purple-500"
                                disabled={loading}
                            />
                            <Button
                                type="submit"
                                disabled={loading || !inputQuestion.trim()}
                                className="h-10 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold transition-all shadow-md shadow-purple-950/50 flex items-center gap-1.5 shrink-0"
                            >
                                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                <span className="hidden sm:inline">Ask AI</span>
                            </Button>
                        </form>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export default AiServerAssistant;
