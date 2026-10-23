"use client";

import { useState, useEffect } from "react";
import { 
    getSentEmailLogsAction, 
    resendSentEmailAction, 
    deleteSentEmailLogAction, 
    clearSentEmailLogsAction 
} from "@/app/actions";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
    MailCheck, Mail, RefreshCw, Trash2, Send, Eye, ShieldCheck, 
    Bot, AlertTriangle, CheckCircle2, XCircle, Search, X, Loader2,
    Clock, User, ArrowLeft, ArrowRight, ExternalLink, Sparkles, Filter
} from "lucide-react";
import { format } from "date-fns";

interface SentEmailAuditLogProps {
    onCountChange?: (count: number) => void;
}

export default function SentEmailAuditLog({ onCountChange }: SentEmailAuditLogProps) {
    const [logs, setLogs] = useState<any[]>([]);
    const [counts, setCounts] = useState({
        total: 0,
        filteredTotal: 0,
        automaticCount: 0,
        approvedCount: 0,
        failedCount: 0
    });
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState("");
    const [modeFilter, setModeFilter] = useState<"ALL" | "AUTOMATIC" | "APPROVED_AND_SENT">("ALL");
    const [statusFilter, setStatusFilter] = useState<"ALL" | "SENT" | "FAILED">("ALL");
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);

    // Modal state for viewing email content
    const [selectedEmail, setSelectedEmail] = useState<any | null>(null);
    const [modalViewTab, setModalViewTab] = useState<"preview" | "text" | "details">("preview");

    // Action feedback states
    const [resendingId, setResendingId] = useState<string | null>(null);
    const [deletingId, setDeletingId] = useState<string | null>(null);
    const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

    const loadLogs = async (pageOverride?: number) => {
        try {
            setLoading(true);
            const targetPage = pageOverride ?? currentPage;
            const res = await getSentEmailLogsAction({
                search: searchQuery,
                mode: modeFilter,
                status: statusFilter,
                page: targetPage,
                limit: 25
            });

            if (res.success) {
                setLogs(res.logs || []);
                if (res.counts) {
                    setCounts(res.counts);
                    if (onCountChange) {
                        onCountChange(res.counts.total);
                    }
                }
                if (res.pagination) {
                    setTotalPages(res.pagination.totalPages || 1);
                    setCurrentPage(res.pagination.page || 1);
                }
            } else {
                console.error("Failed to load sent email logs:", res.error);
            }
        } catch (e) {
            console.error("loadLogs error:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadLogs(1);
    }, [modeFilter, statusFilter]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        loadLogs(1);
    };

    const handleClearSearch = () => {
        setSearchQuery("");
        // Reload with empty search
        getSentEmailLogsAction({
            search: "",
            mode: modeFilter,
            status: statusFilter,
            page: 1,
            limit: 25
        }).then(res => {
            if (res.success) {
                setLogs(res.logs || []);
                if (res.counts) setCounts(res.counts);
                if (res.pagination) setTotalPages(res.pagination.totalPages || 1);
                setCurrentPage(1);
            }
        });
    };

    const handleResend = async (logId: string) => {
        try {
            setResendingId(logId);
            const res = await resendSentEmailAction(logId);
            if (res.success) {
                setActionMessage({ text: res.message || "Email re-sent successfully!", type: "success" });
                setTimeout(() => setActionMessage(null), 4000);
                loadLogs();
            } else {
                setActionMessage({ text: res.error || "Failed to resend email", type: "error" });
                setTimeout(() => setActionMessage(null), 5000);
            }
        } catch (e: any) {
            setActionMessage({ text: e.message || "Resend error", type: "error" });
            setTimeout(() => setActionMessage(null), 5000);
        } finally {
            setResendingId(null);
        }
    };

    const handleDelete = async (logId: string) => {
        if (!confirm("Are you sure you want to delete this email log entry?")) return;
        try {
            setDeletingId(logId);
            const res = await deleteSentEmailLogAction(logId);
            if (res.success) {
                loadLogs();
            } else {
                alert(`Delete failed: ${res.error}`);
            }
        } catch (e: any) {
            alert(`Delete failed: ${e.message}`);
        } finally {
            setDeletingId(null);
        }
    };

    const handleClearAll = async () => {
        if (!confirm("Are you sure you want to permanently clear ALL sent email audit logs?")) return;
        try {
            setLoading(true);
            const res = await clearSentEmailLogsAction();
            if (res.success) {
                setActionMessage({ text: "All sent email records have been cleared.", type: "success" });
                setTimeout(() => setActionMessage(null), 4000);
                loadLogs(1);
            } else {
                alert(`Clear failed: ${res.error}`);
            }
        } catch (e: any) {
            alert(`Clear failed: ${e.message}`);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* ACTION NOTIFICATION BANNER */}
            {actionMessage && (
                <div
                    className={`p-3.5 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
                        actionMessage.type === "success"
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                            : "bg-rose-500/10 border-rose-500/30 text-rose-300"
                    }`}
                >
                    <div className="flex items-center gap-2">
                        {actionMessage.type === "success" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                        )}
                        <span>{actionMessage.text}</span>
                    </div>
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 hover:bg-white/10"
                        onClick={() => setActionMessage(null)}
                    >
                        <X className="h-3.5 w-3.5" />
                    </Button>
                </div>
            )}

            {/* HEADER & CONTROLS */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h4 className="text-lg font-bold text-foreground flex items-center gap-2">
                        <MailCheck className="h-5 w-5 text-sky-400" />
                        Dispatched Email Audit Log
                    </h4>
                    <p className="text-xs text-muted-foreground">
                        Comprehensive ledger of all outgoing messages, detailing whether each was dispatched automatically by system workflows or vetted & approved by an administrator.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => loadLogs()}
                        disabled={loading}
                        className="gap-2 text-xs font-bold border-border/60 hover:bg-white/5 active:scale-95"
                    >
                        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                        Refresh
                    </Button>
                    {counts.total > 0 && (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleClearAll}
                            disabled={loading}
                            className="gap-1.5 text-xs font-bold border-rose-500/30 text-rose-400 hover:bg-rose-500/10 active:scale-95"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                            Clear History
                        </Button>
                    )}
                </div>
            </div>

            {/* STAT METRICS CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
                {/* Total Dispatches */}
                <Card className="bg-[#121218] border-sky-500/20 shadow-sm hover:border-sky-500/40 transition-all">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Total Dispatched</span>
                            <Mail className="h-4 w-4 text-sky-400" />
                        </div>
                        <div className="mt-2 text-2xl font-black text-sky-400">{counts.total}</div>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">Platform communications</p>
                    </CardContent>
                </Card>

                {/* Sent Automatically */}
                <Card className="bg-[#121218] border-purple-500/20 shadow-sm hover:border-purple-500/40 transition-all">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Sent Automatically</span>
                            <Bot className="h-4 w-4 text-purple-400" />
                        </div>
                        <div className="mt-2 text-2xl font-black text-purple-400">{counts.automaticCount}</div>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">System alerts & notifications</p>
                    </CardContent>
                </Card>

                {/* Approved & Sent */}
                <Card className="bg-[#121218] border-emerald-500/20 shadow-sm hover:border-emerald-500/40 transition-all">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Approved & Sent</span>
                            <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="mt-2 text-2xl font-black text-emerald-400">{counts.approvedCount}</div>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">Vetted via Approval Queue</p>
                    </CardContent>
                </Card>

                {/* Failed */}
                <Card className="bg-[#121218] border-rose-500/20 shadow-sm hover:border-rose-500/40 transition-all">
                    <CardContent className="pt-4 pb-4">
                        <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-muted-foreground">Delivery Failures</span>
                            <AlertTriangle className="h-4 w-4 text-rose-400" />
                        </div>
                        <div className="mt-2 text-2xl font-black text-rose-400">{counts.failedCount}</div>
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">SMTP or delivery issues</p>
                    </CardContent>
                </Card>
            </div>

            {/* SEARCH AND FILTER BAR */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-[#121218] border border-border/50 p-3 rounded-xl">
                {/* Search Form */}
                <form onSubmit={handleSearchSubmit} className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                        type="text"
                        placeholder="Search by recipient, username, subject, template ID, or approver..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 pr-9 h-9 text-xs bg-black/40 border-border/60 focus:border-sky-500"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={handleClearSearch}
                            className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </form>

                {/* Filter Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                        type="button"
                        size="sm"
                        variant={modeFilter === "ALL" && statusFilter === "ALL" ? "default" : "outline"}
                        onClick={() => {
                            setModeFilter("ALL");
                            setStatusFilter("ALL");
                        }}
                        className="h-8 px-2.5 text-xs font-bold"
                    >
                        All ({counts.total})
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={modeFilter === "AUTOMATIC" ? "default" : "outline"}
                        onClick={() => {
                            setModeFilter("AUTOMATIC");
                            setStatusFilter("ALL");
                        }}
                        className={`h-8 px-2.5 text-xs font-bold gap-1.5 ${
                            modeFilter === "AUTOMATIC" ? "bg-purple-600 hover:bg-purple-500 text-white" : "text-purple-400 border-purple-500/30 hover:bg-purple-500/10"
                        }`}
                    >
                        <Bot className="h-3.5 w-3.5" />
                        Sent Automatically ({counts.automaticCount})
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        variant={modeFilter === "APPROVED_AND_SENT" ? "default" : "outline"}
                        onClick={() => {
                            setModeFilter("APPROVED_AND_SENT");
                            setStatusFilter("ALL");
                        }}
                        className={`h-8 px-2.5 text-xs font-bold gap-1.5 ${
                            modeFilter === "APPROVED_AND_SENT" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/10"
                        }`}
                    >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        Approved & Sent ({counts.approvedCount})
                    </Button>
                    {counts.failedCount > 0 && (
                        <Button
                            type="button"
                            size="sm"
                            variant={statusFilter === "FAILED" ? "default" : "outline"}
                            onClick={() => {
                                setStatusFilter("FAILED");
                                setModeFilter("ALL");
                            }}
                            className={`h-8 px-2.5 text-xs font-bold gap-1.5 ${
                                statusFilter === "FAILED" ? "bg-rose-600 hover:bg-rose-500 text-white" : "text-rose-400 border-rose-500/30 hover:bg-rose-500/10"
                            }`}
                        >
                            <AlertTriangle className="h-3.5 w-3.5" />
                            Failures ({counts.failedCount})
                        </Button>
                    )}
                </div>
            </div>

            {/* EMAIL RECORDS LIST */}
            {loading ? (
                <div className="flex flex-col items-center justify-center p-12 space-y-3 bg-[#121218] border border-border/40 rounded-xl">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-xs text-muted-foreground font-medium">Loading sent email audit logs...</p>
                </div>
            ) : logs.length === 0 ? (
                <Card className="bg-[#121218] border-border/40 p-12 text-center">
                    <div className="flex flex-col items-center justify-center space-y-2 max-w-sm mx-auto">
                        <div className="h-12 w-12 rounded-full bg-sky-500/10 flex items-center justify-center border border-sky-500/30 text-sky-400">
                            <MailCheck className="h-6 w-6" />
                        </div>
                        <h4 className="text-sm font-bold text-foreground">No Dispatches Found</h4>
                        <p className="text-xs text-muted-foreground">
                            {searchQuery || modeFilter !== "ALL" || statusFilter !== "ALL"
                                ? "No sent emails match your current filter settings."
                                : "No outbound platform emails have been logged yet. Outgoing notifications and approved emails will automatically appear here."}
                        </p>
                        {(searchQuery || modeFilter !== "ALL" || statusFilter !== "ALL") && (
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSearchQuery("");
                                    setModeFilter("ALL");
                                    setStatusFilter("ALL");
                                }}
                                className="mt-2 text-xs"
                            >
                                Reset Filters
                            </Button>
                        )}
                    </div>
                </Card>
            ) : (
                <div className="space-y-3">
                    {logs.map((item) => {
                        const isApproved = item.sendMode === "APPROVED_AND_SENT";
                        const isFailed = item.status === "FAILED";

                        return (
                            <Card
                                key={item.id}
                                className={`transition-all duration-200 border ${
                                    isFailed
                                        ? "border-rose-500/30 bg-rose-500/5 hover:border-rose-500/50"
                                        : isApproved
                                        ? "border-emerald-500/25 bg-emerald-500/5 hover:border-emerald-500/40"
                                        : "border-purple-500/20 bg-[#121218]/90 hover:border-purple-500/35"
                                }`}
                            >
                                <CardContent className="pt-4 pb-4">
                                    <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                                        {/* Main Info */}
                                        <div className="space-y-2 flex-1 min-w-0">
                                            {/* Badges & Timestamp Row */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                {/* Dispatch Mode Pill */}
                                                {isApproved ? (
                                                    <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 gap-1.5 text-[11px] font-bold">
                                                        <ShieldCheck className="h-3.5 w-3.5" />
                                                        Approved & Sent
                                                    </Badge>
                                                ) : (
                                                    <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/40 gap-1.5 text-[11px] font-bold">
                                                        <Bot className="h-3.5 w-3.5" />
                                                        Sent Automatically
                                                    </Badge>
                                                )}

                                                {/* Delivery Status Pill */}
                                                {isFailed ? (
                                                    <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/30 gap-1 text-[11px]">
                                                        <XCircle className="h-3 w-3" /> Failed
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 gap-1 text-[11px]">
                                                        <CheckCircle2 className="h-3 w-3" /> Delivered
                                                    </Badge>
                                                )}

                                                {/* Template Badge */}
                                                {item.templateId && item.templateId !== "general" && (
                                                    <Badge variant="outline" className="bg-white/5 border-white/10 text-muted-foreground text-[10px] font-mono">
                                                        {item.templateId}
                                                    </Badge>
                                                )}

                                                {/* Timestamp */}
                                                <span className="text-[11px] text-muted-foreground flex items-center gap-1 ml-auto lg:ml-0">
                                                    <Clock className="h-3 w-3" />
                                                    {format(new Date(item.sentAt), "MMM d, yyyy h:mm a")}
                                                </span>
                                            </div>

                                            {/* Subject line */}
                                            <h5 className="text-sm font-bold text-foreground truncate">
                                                {item.subject}
                                            </h5>

                                            {/* Recipient Details & Approver Note */}
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-muted-foreground font-medium">To:</span>
                                                    <span className="font-semibold text-foreground font-mono">{item.recipient}</span>
                                                    {item.recipientName && (
                                                        <Badge variant="outline" className="bg-sky-500/10 text-sky-400 border-sky-500/30 text-[10px] py-0 px-1.5 font-sans">
                                                            {item.recipientName}
                                                        </Badge>
                                                    )}
                                                </div>

                                                {isApproved && (
                                                    <div className="flex items-center gap-1 text-[11px] text-emerald-400">
                                                        <ShieldCheck className="h-3 w-3 shrink-0" />
                                                        <span>
                                                            Approved by <strong>{item.approvedBy || "Admin"}</strong>
                                                            {item.approvedAt && ` on ${format(new Date(item.approvedAt), "MMM d, h:mm a")}`}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Error Callout if Failed */}
                                            {isFailed && item.error && (
                                                <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 font-mono">
                                                    Error: {item.error}
                                                </div>
                                            )}

                                            {/* Body preview snippet */}
                                            {item.bodyPreview && (
                                                <p className="text-xs text-muted-foreground line-clamp-1 italic">
                                                    "{item.bodyPreview}"
                                                </p>
                                            )}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className="flex items-center gap-2 self-end lg:self-center shrink-0">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => {
                                                    setSelectedEmail(item);
                                                    setModalViewTab("preview");
                                                }}
                                                className="h-8 px-3 text-xs font-semibold gap-1.5 border-border/60 hover:bg-white/10 active:scale-95"
                                            >
                                                <Eye className="h-3.5 w-3.5 text-sky-400" />
                                                View
                                            </Button>

                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleResend(item.id)}
                                                disabled={resendingId === item.id}
                                                className="h-8 px-3 text-xs font-semibold gap-1.5 border-sky-500/30 text-sky-400 hover:bg-sky-500/10 active:scale-95"
                                            >
                                                {resendingId === item.id ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <Send className="h-3.5 w-3.5" />
                                                )}
                                                Resend
                                            </Button>

                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleDelete(item.id)}
                                                disabled={deletingId === item.id}
                                                className="h-8 w-8 p-0 text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                                            >
                                                <Trash2 className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}

                    {/* PAGINATION */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between pt-4 border-t border-border/40 text-xs">
                            <span className="text-muted-foreground">
                                Showing page <strong>{currentPage}</strong> of <strong>{totalPages}</strong> ({counts.filteredTotal} entries)
                            </span>
                            <div className="flex items-center gap-1.5">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={currentPage <= 1 || loading}
                                    onClick={() => {
                                        const prev = currentPage - 1;
                                        setCurrentPage(prev);
                                        loadLogs(prev);
                                    }}
                                    className="h-8 px-2.5 text-xs font-semibold gap-1"
                                >
                                    <ArrowLeft className="h-3.5 w-3.5" /> Previous
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={currentPage >= totalPages || loading}
                                    onClick={() => {
                                        const next = currentPage + 1;
                                        setCurrentPage(next);
                                        loadLogs(next);
                                    }}
                                    className="h-8 px-2.5 text-xs font-semibold gap-1"
                                >
                                    Next <ArrowRight className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* EMAIL INSPECTION MODAL */}
            {selectedEmail && (
                <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <Card className="w-full max-w-3xl bg-[#121218] border-border/60 shadow-2xl max-h-[90vh] flex flex-col">
                        {/* Modal Header */}
                        <CardHeader className="pb-3 border-b border-border/40 shrink-0">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1 min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        {selectedEmail.sendMode === "APPROVED_AND_SENT" ? (
                                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/40 gap-1.5 text-xs font-bold">
                                                <ShieldCheck className="h-3.5 w-3.5" /> Approved & Sent
                                            </Badge>
                                        ) : (
                                            <Badge className="bg-purple-500/15 text-purple-400 border-purple-500/40 gap-1.5 text-xs font-bold">
                                                <Bot className="h-3.5 w-3.5" /> Sent Automatically
                                            </Badge>
                                        )}
                                        {selectedEmail.status === "FAILED" ? (
                                            <Badge variant="outline" className="bg-rose-500/10 text-rose-400 border-rose-500/30 text-xs">
                                                Delivery Failed
                                            </Badge>
                                        ) : (
                                            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-400 border-emerald-500/30 text-xs">
                                                Delivered
                                            </Badge>
                                        )}
                                        <span className="text-xs text-muted-foreground">
                                            {format(new Date(selectedEmail.sentAt), "MMM d, yyyy h:mm:ss a")}
                                        </span>
                                    </div>
                                    <CardTitle className="text-base font-bold text-foreground break-words pt-1">
                                        {selectedEmail.subject}
                                    </CardTitle>
                                    <CardDescription className="text-xs break-all">
                                        To: <strong>{selectedEmail.recipient}</strong>
                                        {selectedEmail.recipientName && ` (${selectedEmail.recipientName})`}
                                    </CardDescription>
                                </div>
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setSelectedEmail(null)}
                                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>

                            {/* View Switcher Tabs */}
                            <div className="flex items-center gap-1.5 pt-3">
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={modalViewTab === "preview" ? "default" : "outline"}
                                    onClick={() => setModalViewTab("preview")}
                                    className="h-7 text-xs font-bold"
                                >
                                    Rendered Preview
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={modalViewTab === "text" ? "default" : "outline"}
                                    onClick={() => setModalViewTab("text")}
                                    className="h-7 text-xs font-bold"
                                >
                                    Plaintext Body
                                </Button>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant={modalViewTab === "details" ? "default" : "outline"}
                                    onClick={() => setModalViewTab("details")}
                                    className="h-7 text-xs font-bold"
                                >
                                    Audit Details
                                </Button>
                            </div>
                        </CardHeader>

                        {/* Modal Body */}
                        <CardContent className="pt-4 pb-4 overflow-y-auto flex-1 min-h-[300px]">
                            {modalViewTab === "preview" && (
                                <div className="space-y-3">
                                    {selectedEmail.html ? (
                                        <div className="rounded-xl border border-white/10 bg-white overflow-hidden p-4 text-black shadow-inner min-h-[320px]">
                                            <div
                                                dangerouslySetInnerHTML={{ __html: selectedEmail.html }}
                                                className="prose prose-sm max-w-none text-slate-800"
                                            />
                                        </div>
                                    ) : (
                                        <div className="p-6 rounded-xl bg-black/40 border border-border/40 text-xs text-muted-foreground text-center">
                                            No HTML body stored for this message. Showing plaintext snippet below:
                                            <pre className="mt-3 p-3 rounded-lg bg-black/60 text-left text-foreground font-mono whitespace-pre-wrap">
                                                {selectedEmail.bodyPreview || "(No body available)"}
                                            </pre>
                                        </div>
                                    )}
                                </div>
                            )}

                            {modalViewTab === "text" && (
                                <div className="p-4 rounded-xl bg-black/60 border border-white/10 font-mono text-xs text-foreground whitespace-pre-wrap leading-relaxed">
                                    {selectedEmail.bodyPreview || "(No body preview available)"}
                                </div>
                            )}

                            {modalViewTab === "details" && (
                                <div className="space-y-3 text-xs">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-black/40 border border-white/10">
                                        <div>
                                            <span className="text-muted-foreground block text-[11px]">Log ID:</span>
                                            <span className="font-mono text-foreground select-all">{selectedEmail.id}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[11px]">Dispatch Mode:</span>
                                            <span className="font-bold text-foreground">{selectedEmail.sendMode}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[11px]">Delivery Status:</span>
                                            <span className="font-bold text-foreground">{selectedEmail.status}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[11px]">Template Identifier:</span>
                                            <span className="font-mono text-foreground">{selectedEmail.templateId || "general"}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[11px]">Dispatched At:</span>
                                            <span className="text-foreground">{format(new Date(selectedEmail.sentAt), "yyyy-MM-dd HH:mm:ss")}</span>
                                        </div>
                                        <div>
                                            <span className="text-muted-foreground block text-[11px]">Recipient Email:</span>
                                            <span className="font-mono text-foreground select-all">{selectedEmail.recipient}</span>
                                        </div>
                                        {selectedEmail.approvalId && (
                                            <div>
                                                <span className="text-muted-foreground block text-[11px]">Linked Approval ID:</span>
                                                <span className="font-mono text-foreground select-all">{selectedEmail.approvalId}</span>
                                            </div>
                                        )}
                                        {selectedEmail.approvedBy && (
                                            <div>
                                                <span className="text-muted-foreground block text-[11px]">Approved By:</span>
                                                <span className="font-bold text-emerald-400">{selectedEmail.approvedBy}</span>
                                            </div>
                                        )}
                                        {selectedEmail.approvedAt && (
                                            <div>
                                                <span className="text-muted-foreground block text-[11px]">Approved At:</span>
                                                <span className="text-foreground">{format(new Date(selectedEmail.approvedAt), "yyyy-MM-dd HH:mm:ss")}</span>
                                            </div>
                                        )}
                                    </div>

                                    {selectedEmail.error && (
                                        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 font-mono text-xs">
                                            <span className="font-bold block mb-1">Error Trace:</span>
                                            {selectedEmail.error}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardContent>

                        {/* Modal Footer */}
                        <CardFooter className="pt-3 pb-3 border-t border-border/40 flex items-center justify-between shrink-0">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => handleResend(selectedEmail.id)}
                                disabled={resendingId === selectedEmail.id}
                                className="gap-1.5 text-xs font-bold border-sky-500/40 text-sky-400 hover:bg-sky-500/10"
                            >
                                {resendingId === selectedEmail.id ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Send className="h-3.5 w-3.5" />
                                )}
                                Re-dispatch to {selectedEmail.recipient}
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="default"
                                onClick={() => setSelectedEmail(null)}
                                className="text-xs font-bold"
                            >
                                Close
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            )}
        </div>
    );
}
