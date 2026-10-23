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
    AlertTriangle,
    Send,
    CheckCircle2
} from "lucide-react";
import { acknowledgeKindleSenderUpdateAction } from "@/app/actions";

interface KindleSenderUpdateModalProps {
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
            <DialogContent className="max-w-lg bg-[#0e0e15]/95 backdrop-blur-xl border border-purple-500/30 shadow-2xl p-0 overflow-hidden text-foreground">
                {/* Glowing Top Banner */}
                <div className="bg-gradient-to-r from-purple-950/80 via-indigo-950/60 to-purple-950/80 border-b border-purple-500/20 p-5 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                            <Send className="h-3 w-3 mr-1 inline" /> Send-to-Kindle Notice
                        </Badge>
                        <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400 bg-amber-500/10">
                            Action Required
                        </Badge>
                    </div>
                    <DialogTitle className="text-lg sm:text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                        <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0" />
                        Update Your Amazon Kindle Settings
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-1 leading-relaxed">
                        Our server's outbound email address for wireless Kindle delivery has changed. Please authorize the new sender on Amazon to ensure your books deliver smoothly.
                    </DialogDescription>
                </div>

                <div className="p-5 space-y-4 text-xs leading-relaxed">
                    {/* User Kindle Address Info Box */}
                    {userKindleEmail && (
                        <div className="flex items-center justify-between p-2.5 rounded-lg bg-black/40 border border-border/40 text-[11px]">
                            <span className="text-muted-foreground">Your Configured Kindle Address:</span>
                            <code className="font-mono font-semibold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                                {userKindleEmail}
                            </code>
                        </div>
                    )}

                    {/* Sender Address Highlight Card */}
                    <div className="p-3.5 rounded-xl bg-purple-500/[0.08] border border-purple-500/30 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                                <Mail className="h-3.5 w-3.5 text-purple-400" /> New Server Sending Address:
                            </span>
                            <span className="text-[10px] text-muted-foreground">Add to Amazon</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="flex-1 p-2 rounded-lg bg-black/60 border border-purple-500/30 font-mono text-sm font-bold text-white select-all truncate">
                                {senderEmail}
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleCopy}
                                className="h-9 px-3 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold shrink-0 shadow-md shadow-purple-900/30"
                            >
                                {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                                <span>{copied ? "Copied!" : "Copy Email"}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Step-by-Step Instructions */}
                    <div className="space-y-2 bg-muted/20 border border-border/30 rounded-xl p-3.5">
                        <h4 className="font-bold text-foreground text-xs flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> How to Update on Amazon in 30 Seconds:
                        </h4>
                        <ol className="list-decimal list-inside space-y-1.5 pl-1 text-muted-foreground text-[11px] leading-relaxed">
                            <li>
                                Open Amazon's{" "}
                                <a
                                    href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-purple-400 hover:text-purple-300 underline font-semibold inline-flex items-center gap-0.5"
                                >
                                    Personal Document Settings <ExternalLink className="h-2.5 w-2.5" />
                                </a>
                            </li>
                            <li>
                                Scroll down to the <strong className="text-foreground">Approved Personal Document E-mail List</strong> section.
                            </li>
                            <li>
                                Click <strong className="text-foreground">"Add a new approved e-mail address"</strong>.
                            </li>
                            <li>
                                Paste <code className="bg-black/40 text-purple-300 px-1.5 py-0.5 rounded font-mono font-bold">{senderEmail}</code> and click <strong className="text-foreground">Add Address</strong>.
                            </li>
                        </ol>
                    </div>

                    <p className="text-[11px] text-muted-foreground/90 italic">
                        💡 Once authorized on Amazon, any requested ebook will download and fly wirelessly to your Kindle without any delivery rejections or bounces.
                    </p>
                </div>

                <DialogFooter className="p-4 bg-muted/10 border-t border-border/30 flex flex-col sm:flex-row items-center justify-between gap-2">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="text-xs text-muted-foreground hover:text-foreground w-full sm:w-auto"
                    >
                        Remind Me Later
                    </Button>

                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                            className="text-xs gap-1 border-purple-500/30 text-purple-300 hover:bg-purple-500/10 w-full sm:w-auto"
                        >
                            <a
                                href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <span>Amazon Settings</span>
                                <ExternalLink className="h-3 w-3" />
                            </a>
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleConfirm}
                            disabled={acknowledging}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 shadow-lg shadow-purple-900/30 w-full sm:w-auto"
                        >
                            <Check className="h-3.5 w-3.5" />
                            <span>{acknowledging ? "Updating..." : "I've Updated My Settings"}</span>
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
