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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Mail,
    Copy,
    Check,
    ExternalLink,
    Send,
    CheckCircle2,
    BookOpen,
    AlertTriangle,
    Loader2,
    Sparkles
} from "lucide-react";
import { updateCurrentUserKindleEmail } from "@/app/actions";

export interface KindleSetupGuideModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    senderEmail?: string;
    onConfigured?: (kindleEmail: string) => void;
    onDismiss?: () => void;
}

export function KindleSetupGuideModal({
    open,
    onOpenChange,
    senderEmail = "kindle@domshomelab.com",
    onConfigured,
    onDismiss
}: KindleSetupGuideModalProps) {
    const [kindleEmail, setKindleEmail] = useState("");
    const [copied, setCopied] = useState(false);
    const [saving, setSaving] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");
    const [successMsg, setSuccessMsg] = useState("");

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

    const handleDismissModal = () => {
        try {
            sessionStorage.setItem("portalarr_kindle_setup_dismissed_session", "true");
        } catch {}
        onOpenChange(false);
        if (onDismiss) {
            onDismiss();
        }
    };

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const clean = kindleEmail.trim().toLowerCase();
        if (!clean) {
            setErrorMsg("Please enter your Send-to-Kindle email address.");
            return;
        }

        if (!clean.includes("@")) {
            setErrorMsg("Please enter a valid email address (e.g. yourname_123@kindle.com).");
            return;
        }

        setSaving(true);
        setErrorMsg("");
        setSuccessMsg("");

        try {
            const res = await updateCurrentUserKindleEmail(clean);
            if (res.error) {
                setErrorMsg(res.error);
            } else {
                setSuccessMsg("Send-to-Kindle configured successfully! Wireless deliveries are now active.");
                try {
                    localStorage.setItem("portalarr_user_kindle_email", clean);
                    sessionStorage.setItem("portalarr_kindle_setup_dismissed_session", "true");
                } catch {}
                if (onConfigured) {
                    onConfigured(clean);
                }
                setTimeout(() => {
                    onOpenChange(false);
                }, 1200);
            }
        } catch (err: any) {
            setErrorMsg(err?.message || "Failed to save Send-to-Kindle email.");
        } finally {
            setSaving(false);
        }
    };

    const isNonKindleWarning =
        kindleEmail.trim().length > 0 &&
        kindleEmail.includes("@") &&
        !kindleEmail.toLowerCase().endsWith("@kindle.com") &&
        !kindleEmail.toLowerCase().endsWith("@free.kindle.com");

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-[#0e0e15]/95 backdrop-blur-xl border border-purple-500/30 shadow-2xl p-0 text-foreground scrollbar-thin">
                {/* Glowing Top Banner */}
                <div className="bg-gradient-to-r from-purple-950/80 via-indigo-950/60 to-purple-950/80 border-b border-purple-500/20 p-5 pb-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5">
                            <Send className="h-3 w-3 mr-1 inline" /> Send-to-Kindle Setup
                        </Badge>
                        <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-300 bg-emerald-500/10">
                            Wireless Delivery
                        </Badge>
                    </div>
                    <DialogTitle className="text-lg sm:text-xl font-extrabold tracking-tight text-white flex items-center gap-2">
                        <span>⚡ Set Up 1-Click Send-to-Kindle Delivery</span>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                        Request or download any ebook and have it fly wirelessly to your Kindle device or Kindle app automatically. Follow the 3 quick steps below to activate delivery.
                    </DialogDescription>
                </div>

                <div className="p-5 space-y-4 text-xs leading-relaxed">
                    {/* Status Feedback */}
                    {errorMsg && (
                        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                            <span>{errorMsg}</span>
                        </div>
                    )}
                    {successMsg && (
                        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                            <span>{successMsg}</span>
                        </div>
                    )}

                    {/* Step 1: Find Kindle Email */}
                    <div className="p-3.5 rounded-xl bg-muted/20 border border-border/30 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-mono font-bold">1</span>
                                Find Your Send-to-Kindle Address on Amazon:
                            </span>
                        </div>
                        <p className="text-muted-foreground text-[11px] pl-6.5 leading-relaxed">
                            Open Amazon&apos;s Personal Document Settings:{" "}
                            <a
                                href="https://www.amazon.com/hz/mycd/myx#/home/settings/payment"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-400 hover:text-purple-300 underline font-semibold break-all inline-flex items-center gap-1"
                            >
                                <span>https://www.amazon.com/hz/mycd/myx#/home/settings/payment</span>
                                <ExternalLink className="h-3 w-3 shrink-0" />
                            </a>
                        </p>
                        <p className="text-muted-foreground text-[11px] pl-6.5 leading-relaxed">
                            Under <strong className="text-foreground">&quot;Send-to-Kindle E-Mail Settings&quot;</strong>, copy your device email (usually ends in <code className="bg-black/40 text-purple-300 px-1.5 py-0.5 rounded font-mono font-semibold">@kindle.com</code>).
                        </p>
                    </div>

                    {/* Step 2: Authorize Sender on Amazon */}
                    <div className="p-3.5 rounded-xl bg-purple-500/[0.08] border border-purple-500/30 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-bold text-purple-300 text-xs flex items-center gap-1.5">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/30 text-purple-200 text-[11px] font-mono font-bold">2</span>
                                Authorize Server Sender Address on Amazon:
                            </span>
                            <span className="text-[10px] text-muted-foreground">Required by Amazon</span>
                        </div>
                        <p className="text-muted-foreground text-[11px] pl-6.5 leading-relaxed">
                            In Amazon Personal Document Settings, scroll to the <strong className="text-foreground">Approved Personal Document E-mail List</strong>, click <strong className="text-foreground">&quot;Add a new approved e-mail address&quot;</strong>, and add our outbound sender:
                        </p>
                        <div className="flex items-center gap-2 pl-6.5">
                            <div className="flex-1 p-2 rounded-lg bg-black/60 border border-purple-500/30 font-mono text-xs sm:text-sm font-bold text-white select-all truncate">
                                {senderEmail}
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                onClick={handleCopy}
                                className="h-9 px-3 gap-1.5 bg-purple-600 hover:bg-purple-700 text-white font-semibold shrink-0 shadow-md shadow-purple-900/30 cursor-pointer"
                            >
                                {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Copy className="h-3.5 w-3.5" />}
                                <span>{copied ? "Copied!" : "Copy Email"}</span>
                            </Button>
                        </div>
                    </div>

                    {/* Step 3: Enter Your Kindle Email */}
                    <form onSubmit={handleSave} className="p-3.5 rounded-xl bg-muted/20 border border-border/30 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <Label htmlFor="kindleEmailInput" className="font-bold text-foreground text-xs flex items-center gap-1.5 cursor-pointer">
                                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-purple-500/20 text-purple-300 text-[11px] font-mono font-bold">3</span>
                                Enter Your Kindle Email Address:
                            </Label>
                        </div>
                        <div className="relative pl-6.5">
                            <Mail className="absolute left-9 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                id="kindleEmailInput"
                                type="email"
                                placeholder="yourname_123@kindle.com"
                                value={kindleEmail}
                                onChange={(e) => {
                                    setKindleEmail(e.target.value);
                                    if (errorMsg) setErrorMsg("");
                                }}
                                className="pl-9 h-9 text-xs bg-black/50 border-purple-500/30 font-mono text-white placeholder:text-muted-foreground/60"
                                required
                            />
                        </div>

                        {isNonKindleWarning && (
                            <div className="ml-6.5 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300 leading-normal flex items-start gap-1.5">
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                                <span>
                                    <strong>Tip:</strong> Send-to-Kindle emails typically end in <strong className="text-amber-200">@kindle.com</strong>. Make sure you are not entering your personal Amazon login email.
                                </span>
                            </div>
                        )}
                    </form>

                    <p className="text-[11px] text-muted-foreground/90 italic">
                        💡 Once authorized on Amazon, any requested or downloaded ebook will download and fly wirelessly to your Kindle without any delivery rejections or bounces.
                    </p>
                </div>

                <DialogFooter className="p-4 bg-muted/10 border-t border-border/30 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleDismissModal}
                        className="text-xs text-muted-foreground hover:text-foreground w-full sm:w-auto cursor-pointer"
                    >
                        Remind Me Later
                    </Button>

                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            asChild
                            className="text-xs gap-1 border-purple-500/30 text-purple-300 hover:bg-purple-500/10 w-full sm:w-auto shrink-0 whitespace-nowrap"
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
                            onClick={() => handleSave()}
                            disabled={saving || !kindleEmail.trim()}
                            className="bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs gap-1.5 shadow-lg shadow-purple-900/30 w-full sm:w-auto shrink-0 whitespace-nowrap cursor-pointer"
                        >
                            {saving ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                            ) : (
                                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="whitespace-nowrap">{saving ? "Saving..." : "Save & Activate Kindle"}</span>
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default KindleSetupGuideModal;
