"use client";

import { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Mail,
    Copy,
    Check,
    ExternalLink,
    Send,
    CheckCircle2
} from "lucide-react";
import { acknowledgeKindleSenderUpdateAction } from "@/app/actions";

export interface KindleSenderUpdateModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userKindleEmail?: string | null;
    senderEmail?: string;
    onAcknowledged?: () => void;
}

export function KindleSenderUpdateModal({
    open,
    onOpenChange,
    userKindleEmail,
    senderEmail = "kindle@domshomelab.com",
    onAcknowledged
}: KindleSenderUpdateModalProps) {
    const [copied, setCopied] = useState(false);
    const [acknowledging, setAcknowledging] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(senderEmail);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            const textarea = document.createElement("textarea");
            textarea.value = senderEmail;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    const handleConfirm = async () => {
        setAcknowledging(true);
        try {
            if (typeof window !== "undefined") {
                try {
                    localStorage.setItem("portalarr_kindle_sender_updated_ack_v1316", "true");
                } catch {}
            }
            await acknowledgeKindleSenderUpdateAction();
        } catch (e) {
            console.warn("[KINDLE-UPDATE-ACK-ERROR]:", e);
        } finally {
            setAcknowledging(false);
            onOpenChange(false);
            if (onAcknowledged) {
                onAcknowledged();
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-2xl max-h-[90dvh] overflow-y-auto overflow-x-hidden bg-card/95 backdrop-blur-xl border border-amber-500/35 shadow-2xl p-0 text-foreground scrollbar-thin">
                {/* Header Banner */}
                <div className="bg-gradient-to-r from-muted/70 via-card to-muted/70 dark:from-slate-900/95 dark:via-[#141720] dark:to-slate-900/95 border-b border-border/60 p-5 pr-12 pb-4">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                        <Badge className="bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                            <Send className="h-3 w-3 mr-1 inline" /> Send-to-Kindle Notice
                        </Badge>
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                            Action Required
                        </Badge>
                    </div>
                    <DialogTitle className="text-lg sm:text-xl font-extrabold tracking-tight text-foreground flex flex-wrap items-center gap-2">
                        <span className="break-words min-w-0">Outbound Sender Updated to {senderEmail}</span>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        If you previously configured your Kindle settings with an older address, please update your Amazon Approved Personal Document E-mail List with <span className="font-mono font-bold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-1 py-0.5 rounded border border-amber-500/20 break-all">{senderEmail}</span> at{" "}
                        <a
                            href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sky-600 dark:text-sky-400 hover:text-sky-500 dark:hover:text-sky-300 underline font-semibold break-all inline"
                        >
                            <span>https://www.amazon.com/hz/mycd/myx#/home/settings/payment</span>
                            <ExternalLink className="h-3 w-3 inline ml-1 align-text-bottom" />
                        </a>{" "}
                        so your wireless Kindle deliveries continue uninterrupted.
                    </DialogDescription>
                </div>

                <div className="p-5 space-y-4 text-xs leading-relaxed">
                    {/* User Kindle Address Info Box */}
                    {userKindleEmail && (
                        <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-muted/50 dark:bg-black/40 border border-border/50 text-[11px]">
                            <span className="text-muted-foreground">Your Configured Kindle Address:</span>
                            <code className="font-mono font-semibold text-amber-700 dark:text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 break-all">
                                {userKindleEmail}
                            </code>
                        </div>
                    )}

                    {/* Sender Address Highlight Card */}
                    <div className="p-3.5 rounded-xl bg-amber-500/[0.08] border border-amber-500/30 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-amber-700 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 shrink-0" /> New Server Sending Address:
                            </span>
                            <span className="text-[10px] text-muted-foreground">Add to Amazon</span>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                            <div className="min-w-0 flex-1 p-2.5 rounded-lg bg-muted/60 dark:bg-black/60 border border-amber-500/30 font-mono text-sm font-bold text-foreground select-all break-all">
                                {senderEmail}
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleCopy}
                                className="h-9 px-3 gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground font-semibold shrink-0 shadow-md"
                            >
                                {copied ? <Check className="h-3.5 w-3.5 text-emerald-950" /> : <Copy className="h-3.5 w-3.5" />}
                                <span>{copied ? "Copied!" : "Copy Email"}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Step-by-Step Instructions */}
                    <div className="space-y-2 bg-muted/20 border border-border/30 rounded-xl p-3.5">
                        <h4 className="font-bold text-foreground text-xs flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> How to Update on Amazon in 30 Seconds:
                        </h4>
                        <ol className="list-decimal list-inside space-y-2 pl-1 text-muted-foreground text-[11px] leading-relaxed">
                            <li>
                                Open Amazon&apos;s Personal Document Settings:{" "}
                                <a
                                    href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-amber-700 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 underline font-semibold break-all inline"
                                >
                                    <span>https://www.amazon.com/hz/mycd/myx#/home/settings/payment</span>
                                    <ExternalLink className="h-3 w-3 inline ml-1 align-text-bottom" />
                                </a>
                            </li>
                            <li>
                                Scroll down to the <strong className="text-foreground">Approved Personal Document E-mail List</strong> section.
                            </li>
                            <li>
                                Click <strong className="text-foreground">"Add a new approved e-mail address"</strong>.
                            </li>
                            <li>
                                Paste <code className="bg-muted/60 dark:bg-black/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded font-mono font-bold break-all">{senderEmail}</code> and click <strong className="text-foreground">Add Address</strong>.
                            </li>
                        </ol>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                        Once authorized on Amazon, any requested ebook will download and deliver wirelessly to your Kindle without bounces.
                    </p>
                </div>

                <DialogFooter className="p-4 bg-muted/10 border-t border-border/30 flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center justify-between gap-2.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="text-xs text-muted-foreground hover:text-foreground w-full sm:w-auto order-last sm:order-first"
                    >
                        Remind Me Later
                    </Button>

                    <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                            className="text-xs gap-1 border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 w-full sm:w-auto whitespace-nowrap"
                        >
                            <a
                                href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <span>Amazon Settings</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleConfirm}
                            disabled={acknowledging}
                            className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-lg w-full sm:w-auto shrink-0 whitespace-nowrap"
                        >
                            <Check className="h-3.5 w-3.5 shrink-0" />
                            <span className="whitespace-nowrap">{acknowledging ? "Updating..." : "I've Updated on Amazon"}</span>
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default KindleSenderUpdateModal;
