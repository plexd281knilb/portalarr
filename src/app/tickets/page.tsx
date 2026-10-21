"use client";

import { useEffect, useState } from "react";
import { getTicketsDashboardAction, updateTicketStatus, deleteSupportTicket, submitSupportTicket } from "@/app/actions";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { 
    Mail, 
    LifeBuoy, 
    Send, 
    Trash2, 
    Loader2, 
    UserCog, 
    Film, 
    Tv, 
    BookOpen, 
    AlertCircle, 
    PlusCircle, 
    CheckCircle2, 
    Search,
    Shield,
    MessageSquare,
    Clock,
    Bot,
    Sparkles,
    ExternalLink,
    Copy,
    Check,
    Wrench
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

export default function TicketsPage() {
    const [tickets, setTickets] = useState<any[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [currentUser, setCurrentUser] = useState<{ username: string; email: string; role: string } | null>(null);
    const [loading, setLoading] = useState(true);
    const [ticketToDelete, setTicketToDelete] = useState<any | null>(null);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

    const handleCopyPrompt = async (ticketId: string, promptText: string) => {
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(promptText);
            } else {
                const textArea = document.createElement("textarea");
                textArea.value = promptText;
                textArea.style.position = "fixed";
                textArea.style.left = "-999999px";
                document.body.appendChild(textArea);
                textArea.focus();
                textArea.select();
                document.execCommand("copy");
                textArea.remove();
            }
            setCopiedPromptId(ticketId);
            setTimeout(() => setCopiedPromptId(null), 2500);
        } catch (e) {
            console.error("Failed to copy AI prompt:", e);
        }
    };

    // Filter & Search states (Admin view)
    const [statusFilter, setStatusFilter] = useState<"ALL" | "Pending" | "Acknowledged" | "Completed">("ALL");
    const [searchQuery, setSearchQuery] = useState("");

    // Create New Ticket Dialog state
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [createLoading, setCreateLoading] = useState(false);
    const [createSuccess, setCreateSuccess] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [prefilledIssue, setPrefilledIssue] = useState("");

    const loadDashboard = async () => {
        setLoading(true);
        try {
            const data = await getTicketsDashboardAction();
            setIsAdmin(data.isAdmin);
            setCurrentUser(data.currentUser);
            setTickets(data.tickets);
        } catch (e: any) {
            setErrorMessage(e?.message || "Failed to load support tickets.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadDashboard();

        if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const prefill = params.get("prefill");
            if (prefill) {
                setPrefilledIssue(prefill);
                setIsCreateOpen(true);
            }
        }
    }, []);

    const handleUpdate = async (e: React.FormEvent, id: string) => {
        e.preventDefault();
        const formData = new FormData(e.target as HTMLFormElement);
        const newStatus = formData.get("status") as string;
        const comment = formData.get("adminComment") as string;

        setTickets(prev => prev.map(t => t.id === id ? { ...t, status: newStatus, adminComment: comment } : t));
        await updateTicketStatus(id, newStatus, comment);
    };

    const confirmDelete = async () => {
        if (!ticketToDelete) return;
        const id = ticketToDelete.id;
        setDeleteLoading(true);
        setErrorMessage(null);

        // Optimistic UI update
        setTickets(prev => prev.filter(t => t.id !== id));
        const result = await deleteSupportTicket(id);

        setDeleteLoading(false);
        setTicketToDelete(null);

        if (result.error) {
            setErrorMessage(result.error);
            loadDashboard(); // Refresh if delete fails
        }
    };

    const handleCreateTicket = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setCreateLoading(true);
        setCreateError(null);

        const formData = new FormData(e.currentTarget);
        const res = await submitSupportTicket(formData);
        setCreateLoading(false);

        if (res && res.error) {
            setCreateError(res.error);
        } else {
            setCreateSuccess(true);
            setTimeout(() => {
                setCreateSuccess(false);
                setIsCreateOpen(false);
                loadDashboard();
            }, 1500);
        }
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case "Completed":
                return (
                    <Badge className="bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 text-xs px-2.5 py-0.5">
                        <CheckCircle2 className="h-3 w-3 mr-1 text-emerald-400" /> Completed
                    </Badge>
                );
            case "Acknowledged":
                return (
                    <Badge className="bg-blue-500/15 text-blue-300 border border-blue-500/30 text-xs px-2.5 py-0.5">
                        <Clock className="h-3 w-3 mr-1 text-blue-400" /> Acknowledged
                    </Badge>
                );
            default:
                return (
                    <Badge className="bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs px-2.5 py-0.5">
                        <AlertCircle className="h-3 w-3 mr-1 text-amber-400" /> Pending
                    </Badge>
                );
        }
    };

    // Filter tickets for Admin view
    const filteredTickets = tickets.filter(t => {
        if (statusFilter !== "ALL" && t.status !== statusFilter) return false;
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const matchName = (t.name || "").toLowerCase().includes(q);
            const matchEmail = (t.email || "").toLowerCase().includes(q);
            const matchIssue = (t.issue || "").toLowerCase().includes(q);
            const matchComment = (t.adminComment || "").toLowerCase().includes(q);
            if (!matchName && !matchEmail && !matchIssue && !matchComment) return false;
        }
        return true;
    });

    const pendingCount = tickets.filter(t => t.status === "Pending").length;
    const acknowledgedCount = tickets.filter(t => t.status === "Acknowledged").length;
    const completedCount = tickets.filter(t => t.status === "Completed").length;

    return (
        <div className="flex-1 space-y-4 sm:space-y-6 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] 4xl:max-w-[2560px] mx-auto w-full min-w-0 animate-in fade-in duration-500">
            {/* TOP HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 text-foreground">
                            <LifeBuoy className="h-7 w-7 text-amber-400" /> Support Tickets
                        </h2>
                        {isAdmin && (
                            <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30 gap-1">
                                <Shield className="h-3 w-3 text-amber-400" /> Admin Command
                            </Badge>
                        )}
                    </div>
                    <p className="text-muted-foreground text-xs sm:text-sm mt-1">
                        {isAdmin 
                            ? "Review, update, and resolve user-submitted issues across DomsHomeLab."
                            : "Track your support requests, view administrator replies, or open a new issue."}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <Button 
                        onClick={() => setIsCreateOpen(true)}
                        size="sm"
                        className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs gap-1.5 h-9 transition-all shadow-md active:scale-95"
                    >
                        <PlusCircle className="h-4 w-4" /> Open New Ticket
                    </Button>
                    <Button 
                        onClick={loadDashboard} 
                        variant="outline" 
                        size="sm" 
                        disabled={loading}
                        className="w-fit transition-all duration-200 hover:ring-2 hover:ring-primary/40 active:scale-95 text-xs h-9"
                    >
                        <Loader2 className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* AI ASSISTANT FAST-FIX CALLOUT BANNER */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-[#121218] to-cyan-950/30 border border-purple-500/40 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs sm:text-sm">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2.5 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 text-white shrink-0 shadow-md">
                        <Bot className="h-5 w-5" />
                    </div>
                    <div>
                        <div className="font-bold text-foreground flex items-center gap-2 flex-wrap">
                            <span>Fix Playback or Media Issues in 30 Seconds</span>
                            <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-300 border-purple-500/40 font-semibold">
                                24/7 AI Master
                            </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            The AI Server Assistant automatically diagnoses stream buffering, quiet audio, subtitle desync, and player quality limits.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    <Button 
                        asChild
                        size="sm"
                        className="bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 text-white font-bold text-xs h-9 px-4 rounded-xl shadow-md transition-all active:scale-95"
                    >
                        <Link 
                            href="/?openAssistant=true"
                            onClick={() => {
                                if (typeof window !== "undefined") {
                                    window.dispatchEvent(new CustomEvent("open-ai-assistant"));
                                }
                            }}
                        >
                            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Ask AI Assistant First ➔
                        </Link>
                    </Button>
                </div>
            </div>

            {/* ERROR BANNER */}
            {errorMessage && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-3 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                        <span>{errorMessage}</span>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setErrorMessage(null)} className="h-6 text-[10px] text-rose-400 hover:text-rose-200 cursor-pointer">
                        Dismiss
                    </Button>
                </div>
            )}

            {/* ========================================================================= */}
            {/* VIEW 1: ADMIN MANAGEMENT DASHBOARD */}
            {/* ========================================================================= */}
            {isAdmin ? (
                <div className="space-y-4 sm:space-y-6">
                    {/* FILTER & SEARCH CONTROLS */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 rounded-xl bg-[#121218]/60 border border-border/50">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <Button
                                variant={statusFilter === "ALL" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setStatusFilter("ALL")}
                                className="h-8 text-xs font-semibold"
                            >
                                All ({tickets.length})
                            </Button>
                            <Button
                                variant={statusFilter === "Pending" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setStatusFilter("Pending")}
                                className="h-8 text-xs font-semibold text-amber-400"
                            >
                                Pending ({pendingCount})
                            </Button>
                            <Button
                                variant={statusFilter === "Acknowledged" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setStatusFilter("Acknowledged")}
                                className="h-8 text-xs font-semibold text-blue-400"
                            >
                                Acknowledged ({acknowledgedCount})
                            </Button>
                            <Button
                                variant={statusFilter === "Completed" ? "secondary" : "ghost"}
                                size="sm"
                                onClick={() => setStatusFilter("Completed")}
                                className="h-8 text-xs font-semibold text-emerald-400"
                            >
                                Completed ({completedCount})
                            </Button>
                        </div>

                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search tickets..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="h-8 pl-8 text-xs bg-background/60"
                            />
                        </div>
                    </div>

                    {/* ADMIN TICKET CARDS */}
                    <div className="grid gap-4 sm:gap-6">
                        {filteredTickets.length === 0 && !loading && (
                            <Card className="border-dashed border-border/50 bg-[#121218]/50 rounded-2xl">
                                <CardContent className="p-12 text-center text-muted-foreground italic">
                                    {searchQuery || statusFilter !== "ALL" 
                                        ? "No support tickets match the selected filter." 
                                        : "No support tickets found. All systems operational!"}
                                </CardContent>
                            </Card>
                        )}

                        {filteredTickets.map((ticket) => {
                            const isPageFix = ticket.issue.includes("[PAGE FIX") || ticket.issue.includes("🛠️ [PAGE FIX");
                            const matchPage = ticket.issue.match(/Reported Page:\s*([^\r\n]+)/i) || ticket.issue.match(/Target Page URL:\*\*\s*`([^`]+)`/i);
                            const reportedPage = matchPage ? matchPage[1].trim() : null;
                            const aiPromptMatch = ticket.issue.match(/--- READY-TO-USE ANTIGRAVITY AI PROMPT ---\s*([\s\S]+)$/i);
                            const aiPrompt = aiPromptMatch ? aiPromptMatch[1].trim() : ticket.issue;
                            return (
                            <Card key={ticket.id} className="overflow-hidden border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200 rounded-2xl">
                                <CardHeader className="bg-muted/20 pb-4 border-b border-border/40">
                                    <div className="flex flex-col sm:flex-row justify-between sm:items-start w-full gap-3 sm:gap-4">
                                        <div className="space-y-1 min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <CardTitle className="text-base sm:text-lg font-bold truncate text-foreground">
                                                    {ticket.name}
                                                </CardTitle>
                                                <Badge variant="secondary" className="font-mono text-[10px] px-2 py-0.5 h-5 bg-muted/40 border border-border/40 truncate max-w-full">
                                                    <Mail className="h-3 w-3 mr-1 text-primary shrink-0"/> <span className="truncate">{ticket.email}</span>
                                                </Badge>
                                                {isPageFix && (
                                                    <Badge variant="outline" className="font-semibold text-[10px] px-2 py-0.5 h-5 bg-amber-500/15 text-amber-300 border-amber-500/30 gap-1">
                                                        <Wrench className="h-2.5 w-2.5 text-amber-400" />
                                                        <span>🛠️ Page Fix Request</span>
                                                    </Badge>
                                                )}
                                            </div>
                                            <CardDescription className="text-xs">
                                                Submitted {formatDistanceToNow(new Date(ticket.createdAt))} ago
                                            </CardDescription>
                                        </div>
                                        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                                            {getStatusBadge(ticket.status)}
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-950/40 transition-all duration-200 hover:ring-2 hover:ring-red-500/40 active:scale-95 cursor-pointer"
                                                onClick={() => setTicketToDelete(ticket)}
                                                title="Delete Ticket"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-5 sm:pt-6 space-y-5 sm:space-y-6">
                                    <div className="bg-background/60 border border-border/40 rounded-xl p-4 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap shadow-inner text-foreground">
                                        {ticket.issue}
                                    </div>
                                    
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {isPageFix && (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => handleCopyPrompt(ticket.id, aiPrompt)}
                                                    className={`h-8 text-xs font-semibold active:scale-95 transition-all duration-200 cursor-pointer ${
                                                        copiedPromptId === ticket.id
                                                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/50 ring-2 ring-emerald-500/40"
                                                            : "border-purple-500/40 text-purple-300 hover:bg-purple-500/10 hover:ring-2 hover:ring-purple-500/40"
                                                    }`}
                                                >
                                                    {copiedPromptId === ticket.id ? (
                                                        <>
                                                            <Check className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
                                                            <span>Copied Prompt for AI!</span>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Copy className="h-3.5 w-3.5 mr-1.5 text-purple-400" />
                                                            <span>📋 Copy Prompt for AI</span>
                                                        </>
                                                    )}
                                                </Button>

                                                {reportedPage && (
                                                    <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold border-amber-500/40 text-amber-300 hover:bg-amber-500/10 hover:ring-2 hover:ring-amber-500/40 active:scale-95 transition-all duration-200">
                                                        <Link href={reportedPage}>
                                                            <ExternalLink className="h-3.5 w-3.5 mr-1.5 text-amber-400" /> Open Reported Page
                                                        </Link>
                                                    </Button>
                                                )}
                                            </>
                                        )}
                                        <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 hover:ring-2 hover:ring-emerald-500/40 active:scale-95 transition-all duration-200">
                                            <Link href={`/settings/access?search=${encodeURIComponent(ticket.email)}`}>
                                                <UserCog className="h-3.5 w-3.5 mr-1.5 text-emerald-400" /> Manage User
                                            </Link>
                                        </Button>
                                        <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold border-blue-500/30 text-blue-400 hover:bg-blue-500/10 hover:ring-2 hover:ring-blue-500/40 active:scale-95 transition-all duration-200">
                                            <Link href="/radarr">
                                                <Film className="h-3.5 w-3.5 mr-1.5 text-blue-400" /> Radarr (Movies)
                                            </Link>
                                        </Button>
                                        <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:ring-2 hover:ring-cyan-500/40 active:scale-95 transition-all duration-200">
                                            <Link href="/sonarr">
                                                <Tv className="h-3.5 w-3.5 mr-1.5 text-cyan-400" /> Sonarr (TV)
                                            </Link>
                                        </Button>
                                        <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold border-purple-500/30 text-purple-400 hover:bg-purple-500/10 hover:ring-2 hover:ring-purple-500/40 active:scale-95 transition-all duration-200">
                                            <Link href="/library">
                                                <BookOpen className="h-3.5 w-3.5 mr-1.5 text-purple-400" /> Book Library
                                            </Link>
                                        </Button>
                                    </div>

                                    <form onSubmit={(e) => handleUpdate(e, ticket.id)} className="space-y-4 pt-4 border-t border-border/40 border-dashed">
                                        <div className="space-y-2">
                                            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                                <Send className="h-3.5 w-3.5 text-primary" /> Admin Response
                                            </Label>
                                            <Textarea 
                                                name="adminComment" 
                                                defaultValue={ticket.adminComment || ""} 
                                                placeholder="Type your reply message to the user..." 
                                                className="min-h-[90px] bg-background/60 border-border/40 focus-visible:ring-primary/40 text-xs sm:text-sm"
                                            />
                                            <p className="text-[10px] text-muted-foreground italic">
                                                This response will be saved and automatically emailed to the member.
                                            </p>
                                        </div>
                                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
                                            <div className="flex items-center gap-2 justify-between sm:justify-start">
                                                <Label className="text-xs font-semibold whitespace-nowrap">Set Status:</Label>
                                                <Select name="status" defaultValue={ticket.status}>
                                                    <SelectTrigger className="w-[160px] h-9 bg-background/80 border-border/60 text-xs font-semibold">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Pending">Pending</SelectItem>
                                                        <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                                                        <SelectItem value="Completed">Completed</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <Button type="submit" className="gap-2 h-9 font-semibold transition-all duration-200 hover:ring-2 hover:ring-primary/50 hover:shadow-md active:scale-98 w-full sm:w-auto" size="sm">
                                                <Send className="h-4 w-4" /> Save & Notify Member
                                            </Button>
                                        </div>
                                    </form>
                                </CardContent>
                            </Card>
                        );
                        })}
                    </div>
                </div>
            ) : (
                /* ========================================================================= */
                /* VIEW 2: MEMBER SELF-SERVICE TICKET VIEW */
                /* ========================================================================= */
                <div className="space-y-6">
                    {tickets.length === 0 && !loading ? (
                        <Card className="border-border/50 bg-[#121218]/60 backdrop-blur-md rounded-2xl text-center py-12 px-4 shadow-sm">
                            <CardContent className="space-y-4 max-w-md mx-auto">
                                <div className="h-16 w-16 mx-auto rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                                    <LifeBuoy className="h-8 w-8 text-amber-400" />
                                </div>
                                <div className="space-y-1">
                                    <h3 className="text-lg font-bold text-foreground">No Support Tickets Found</h3>
                                    <p className="text-xs text-muted-foreground leading-relaxed">
                                        Need help with streaming issues, missing episodes, or library access? Open a ticket below and the server admin will assist you.
                                    </p>
                                </div>
                                <Button 
                                    onClick={() => setIsCreateOpen(true)}
                                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs gap-2 shadow-md active:scale-95"
                                >
                                    <PlusCircle className="h-4 w-4" /> Open Your First Ticket
                                </Button>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-4 sm:gap-6">
                            {tickets.map((ticket) => {
                                const isPageFix = ticket.issue.includes("[PAGE FIX") || ticket.issue.includes("🛠️ [PAGE FIX");
                                const matchPage = ticket.issue.match(/Reported Page:\s*([^\r\n]+)/i) || ticket.issue.match(/Target Page URL:\*\*\s*`([^`]+)`/i);
                                const reportedPage = matchPage ? matchPage[1].trim() : null;
                                return (
                                <Card key={ticket.id} className="overflow-hidden border-border/50 bg-[#121218]/80 backdrop-blur-md shadow-sm rounded-2xl">
                                    <CardHeader className="bg-muted/20 pb-4 border-b border-border/40">
                                        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <CardTitle className="text-base font-bold text-foreground">
                                                        {isPageFix ? "Page Fix Suggestion" : "Support Request"}
                                                    </CardTitle>
                                                    {isPageFix && (
                                                        <Badge variant="outline" className="font-semibold text-[10px] px-2 py-0.5 h-5 bg-amber-500/15 text-amber-300 border-amber-500/30 gap-1">
                                                            <Wrench className="h-2.5 w-2.5 text-amber-400" />
                                                            <span>🛠️ Page Fix Request</span>
                                                        </Badge>
                                                    )}
                                                    {getStatusBadge(ticket.status)}
                                                </div>
                                                <CardDescription className="text-xs">
                                                    Opened {formatDistanceToNow(new Date(ticket.createdAt))} ago
                                                </CardDescription>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="pt-5 space-y-4">
                                        <div className="space-y-1.5">
                                            <Label className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                                                Your Issue Description
                                            </Label>
                                            <div className="bg-background/60 border border-border/40 rounded-xl p-4 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                                                {ticket.issue}
                                            </div>
                                        </div>

                                        {ticket.adminComment ? (
                                            <div className="space-y-1.5 pt-2">
                                                <Label className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                                                    <MessageSquare className="h-3.5 w-3.5" /> Administrator Response
                                                </Label>
                                                <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap text-emerald-100">
                                                    {ticket.adminComment}
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-[11px] text-amber-300 flex items-center gap-2">
                                                <Clock className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                                                <span>Awaiting review by the server administrator. You will receive an email as soon as an update is posted.</span>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* CREATE TICKET MODAL */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent className="sm:max-w-md w-[95vw] bg-[#121218] border border-border/60 shadow-2xl text-foreground">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-base font-bold text-foreground">
                            <LifeBuoy className="h-5 w-5 text-amber-400" />
                            Submit Server Support Ticket
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Send a direct issue report or question to the server administrator.
                        </DialogDescription>
                    </DialogHeader>

                    {createSuccess ? (
                        <div className="py-8 text-center space-y-2">
                            <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto animate-bounce" />
                            <h4 className="text-sm font-bold text-foreground">Ticket Submitted Successfully</h4>
                            <p className="text-xs text-muted-foreground">The administrator has been notified via email.</p>
                        </div>
                    ) : (
                        <form onSubmit={handleCreateTicket} className="space-y-3.5 pt-2">
                            {createError && (
                                <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                                    <span>{createError}</span>
                                </div>
                            )}

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Your Name or Username</Label>
                                <Input
                                    name="name"
                                    required
                                    defaultValue={currentUser?.username || ""}
                                    placeholder="Your Name"
                                    className="h-9 text-xs bg-background/60"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Your Email</Label>
                                <Input
                                    name="email"
                                    type="email"
                                    required
                                    defaultValue={currentUser?.email || ""}
                                    placeholder="email@example.com"
                                    className="h-9 text-xs bg-background/60"
                                />
                            </div>

                            <div className="space-y-1">
                                <Label className="text-xs font-semibold">Describe the Issue</Label>
                                <Textarea
                                    name="issue"
                                    required
                                    defaultValue={prefilledIssue}
                                    placeholder="Explain the problem (e.g. playback error on Apple TV, missing subtitles, audio desync)..."
                                    rows={4}
                                    className="text-xs bg-background/60 resize-none"
                                />
                            </div>

                            <DialogFooter className="gap-2 sm:gap-0 pt-2">
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsCreateOpen(false)}
                                    disabled={createLoading}
                                    className="text-xs"
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    size="sm"
                                    disabled={createLoading}
                                    className="bg-amber-500 hover:bg-amber-600 text-black font-semibold text-xs gap-1.5"
                                >
                                    {createLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                                    Submit Ticket
                                </Button>
                            </DialogFooter>
                        </form>
                    )}
                </DialogContent>
            </Dialog>

            {/* PERMANENT DELETE CONFIRMATION DIALOG */}
            <Dialog open={!!ticketToDelete} onOpenChange={(open) => !open && setTicketToDelete(null)}>
                <DialogContent className="sm:max-w-md w-[95vw] bg-[#121218] border-border/60 text-foreground">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-rose-400">
                            <Trash2 className="h-5 w-5" /> Permanently Delete Ticket?
                        </DialogTitle>
                        <DialogDescription className="text-muted-foreground text-xs leading-relaxed pt-1">
                            Are you sure you want to permanently delete ticket <strong>#{ticketToDelete?.id}</strong> from <strong>{ticketToDelete?.name}</strong>? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0 mt-4">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setTicketToDelete(null)}
                            disabled={deleteLoading}
                            className="cursor-pointer"
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={confirmDelete}
                            disabled={deleteLoading}
                            className="bg-rose-600 hover:bg-rose-500 text-white font-semibold cursor-pointer gap-1.5"
                        >
                            {deleteLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                            Delete Ticket
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
