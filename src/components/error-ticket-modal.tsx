"use client";

import React, { useState } from "react";
import { 
    AlertTriangle, 
    X, 
    Copy, 
    Check, 
    LifeBuoy, 
    Loader2, 
    CheckCircle2, 
    MessageSquarePlus, 
    ChevronDown, 
    ChevronUp 
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { submitAutoErrorTicketAction } from "@/app/actions";

interface ErrorTicketModalProps {
    open: boolean;
    title?: string;
    message: string;
    context?: string;
    onClose: () => void;
}

export default function ErrorTicketModal({
    open,
    title = "System Error Notice",
    message,
    context,
    onClose,
}: ErrorTicketModalProps) {
    const [copied, setCopied] = useState(false);
    const [submittingTicket, setSubmittingTicket] = useState(false);
    const [ticketSubmitted, setTicketSubmitted] = useState(false);
    const [ticketError, setTicketError] = useState<string | null>(null);
    const [showNoteInput, setShowNoteInput] = useState(false);
    const [userNote, setUserNote] = useState("");

    if (!open) return null;

    const handleCopy = () => {
        try {
            navigator.clipboard.writeText(message);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (e) {
            console.error("Failed to copy to clipboard:", e);
        }
    };

    const handleSubmitTicket = async () => {
        if (ticketSubmitted || submittingTicket) return;
        setSubmittingTicket(true);
        setTicketError(null);

        try {
            const pageUrl = typeof window !== "undefined" ? window.location.pathname + window.location.search : "/";
            const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : undefined;

            const res = await submitAutoErrorTicketAction({
                errorMessage: message,
                errorTitle: context ? `${title} (${context})` : title,
                pageUrl,
                userAgent,
                customNote: userNote.trim() || undefined
            });

            if (res && res.success) {
                setTicketSubmitted(true);
            } else {
                setTicketError(res?.error || "Failed to submit ticket.");
            }
        } catch (e: any) {
            setTicketError(e.message || "An unexpected error occurred while sending the ticket.");
        } finally {
            setSubmittingTicket(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
            <Card className="w-full max-w-lg border-red-500/40 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden relative rounded-2xl">
                <CardHeader className="border-b border-red-900/40 bg-red-950/30 pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-base font-bold text-red-400 flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                            <span>{title}</span>
                        </CardTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/60"
                            onClick={onClose}
                        >
                            <X className="h-5 w-5" />
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-4 space-y-3">
                    <p className="text-xs text-slate-300">
                        An error occurred while processing your request. You can copy the error details below or submit an instant support ticket to the administrator.
                    </p>

                    <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 relative group">
                        <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap break-all max-h-48 overflow-y-auto select-all p-1">
                            {message || "No error details available."}
                        </pre>
                    </div>

                    {/* Collapsible User Note */}
                    <div className="pt-1">
                        {!ticketSubmitted && (
                            <button
                                type="button"
                                onClick={() => setShowNoteInput(!showNoteInput)}
                                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                            >
                                <MessageSquarePlus className="h-3.5 w-3.5 text-primary" />
                                <span>{showNoteInput ? "Hide note" : "Add note for administrator (optional)"}</span>
                                {showNoteInput ? <ChevronUp className="h-3 w-3 ml-0.5" /> : <ChevronDown className="h-3 w-3 ml-0.5" />}
                            </button>
                        )}

                        {showNoteInput && !ticketSubmitted && (
                            <div className="mt-2 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
                                <Textarea
                                    value={userNote}
                                    onChange={(e) => setUserNote(e.target.value)}
                                    placeholder="Optional: What were you doing when this happened? (e.g. Trying to download book X)"
                                    rows={2}
                                    className="text-xs bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-500 resize-none"
                                />
                            </div>
                        )}
                    </div>

                    {/* Status / Feedback messages */}
                    {ticketSubmitted && (
                        <div className="p-3 bg-emerald-950/40 border border-emerald-500/40 rounded-lg flex items-center gap-2.5 text-xs text-emerald-300 animate-in fade-in duration-300">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            <div>
                                <p className="font-semibold">Support ticket created successfully!</p>
                                <p className="text-emerald-400/80 text-[11px]">The administrator has been notified with the full error trace.</p>
                            </div>
                        </div>
                    )}

                    {ticketError && (
                        <div className="p-2.5 bg-red-950/50 border border-red-500/50 rounded-lg text-xs text-red-300 flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                            <span>{ticketError}</span>
                        </div>
                    )}
                </CardContent>

                <CardFooter className="border-t border-slate-900 p-3 bg-slate-950/60 flex flex-wrap items-center justify-between gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
                        onClick={onClose}
                    >
                        Close
                    </Button>

                    <div className="flex items-center gap-2 ml-auto">
                        <Button
                            size="sm"
                            variant="secondary"
                            className="h-8 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 gap-1.5"
                            onClick={handleCopy}
                        >
                            {copied ? (
                                <>
                                    <Check className="h-3.5 w-3.5 text-emerald-300" /> Copied!
                                </>
                            ) : (
                                <>
                                    <Copy className="h-3.5 w-3.5" /> Copy Error
                                </>
                            )}
                        </Button>

                        <Button
                            size="sm"
                            disabled={submittingTicket || ticketSubmitted}
                            onClick={handleSubmitTicket}
                            className={`h-8 text-xs font-bold gap-1.5 shadow transition-all duration-200 ${
                                ticketSubmitted
                                    ? "bg-emerald-600 hover:bg-emerald-600 text-white cursor-default"
                                    : "bg-red-600 hover:bg-red-500 text-white hover:ring-2 hover:ring-red-400/50 active:scale-95"
                            }`}
                        >
                            {submittingTicket ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Submitting...
                                </>
                            ) : ticketSubmitted ? (
                                <>
                                    <CheckCircle2 className="h-3.5 w-3.5 text-white" /> Ticket Submitted
                                </>
                            ) : (
                                <>
                                    <LifeBuoy className="h-3.5 w-3.5" /> 🎫 Submit Support Ticket
                                </>
                            )}
                        </Button>
                    </div>
                </CardFooter>
            </Card>
        </div>
    );
}
