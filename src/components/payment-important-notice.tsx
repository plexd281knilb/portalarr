"use client";

import React, { useState } from "react";
import { AlertTriangle, Check, Copy, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PaymentImportantNoticeProps {
    username?: string | null;
    instructions?: string | null;
    trialDisclaimer?: boolean;
    className?: string;
}

/**
 * High-visibility payment rules and required username memo banner.
 * Rendered above payment method links so members send via Friends & Family,
 * never include "Plex" in transaction notes, and include their exact username.
 */
export function PaymentImportantNotice({
    username,
    instructions,
    trialDisclaimer = false,
    className = "",
}: PaymentImportantNoticeProps) {
    const [copied, setCopied] = useState(false);
    const cleanUsername = (username || "").trim();
    const trimmedInstructions = (instructions || "").trim();

    const handleCopyMemo = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!cleanUsername) return;
        navigator.clipboard.writeText(cleanUsername);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div
            role="note"
            aria-label="Important payment instructions and required memo"
            className={`rounded-xl border border-amber-500/50 bg-amber-500/10 dark:bg-amber-950/35 p-3.5 sm:p-4 space-y-3 shadow-xs ${className}`}
        >
            <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5 min-w-0 flex-1">
                    <h4 className="text-xs sm:text-sm font-extrabold tracking-tight text-amber-950 dark:text-amber-200 leading-snug">
                        Important Payment Rules &amp; Required Memo
                    </h4>

                    {trimmedInstructions ? (
                        <p className="text-xs font-medium text-foreground/95 dark:text-amber-100/95 leading-relaxed whitespace-pre-wrap">
                            {trimmedInstructions}
                        </p>
                    ) : (
                        <p className="text-xs font-medium text-foreground/95 dark:text-amber-100/95 leading-relaxed">
                            Please send payment via <strong className="font-extrabold">Friends &amp; Family</strong> and include your exact username in the transaction notes/comments for instant activation.
                        </p>
                    )}

                    <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 dark:bg-rose-950/40 px-2.5 py-2 text-[11px] sm:text-xs font-semibold text-rose-800 dark:text-rose-200 leading-snug">
                        <ShieldAlert className="h-3.5 w-3.5 text-rose-700 dark:text-rose-400 shrink-0 mt-0.5" />
                        <span>
                            <strong>Do NOT mention &ldquo;Plex&rdquo;</strong> in transaction notes or comments — doing so can suspend both accounts.
                        </span>
                    </div>
                </div>
            </div>

            <div className="rounded-lg border border-amber-500/45 bg-background/95 dark:bg-black/50 p-2.5 sm:px-3 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 space-y-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800 dark:text-amber-400 block">
                        Required Payment Note / Memo
                    </span>
                    <span className="font-mono text-sm sm:text-base font-extrabold text-foreground select-all break-all">
                        {cleanUsername || "Your exact account username"}
                    </span>
                </div>
                {cleanUsername && (
                    <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCopyMemo}
                        className="h-8 px-2.5 text-xs font-bold border-amber-500/45 bg-amber-500/15 hover:bg-amber-500/25 text-amber-950 dark:text-amber-200 gap-1.5 shrink-0 cursor-pointer"
                    >
                        {copied ? (
                            <>
                                <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" />
                                <span>Copied</span>
                            </>
                        ) : (
                            <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy Memo</span>
                            </>
                        )}
                    </Button>
                )}
            </div>

            {trialDisclaimer && (
                <p className="text-[11px] font-medium text-amber-900 dark:text-amber-200/90 leading-relaxed">
                    No payment up front during your free trial. Whenever submitting a renewal payment later, include your username above in the note.
                </p>
            )}
        </div>
    );
}
