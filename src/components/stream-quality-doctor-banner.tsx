"use client";

import React, { useState, useEffect } from "react";
import { 
    AlertTriangle, 
    Stethoscope, 
    CheckCircle2, 
    Wrench, 
    X, 
    Copy, 
    Check, 
    Sparkles, 
    Tv, 
    Smartphone, 
    Monitor, 
    Info, 
    ExternalLink,
    ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog";
import { getUserTranscodeAlertAction } from "@/app/actions";
import type { UserTranscodeAlertResult } from "@/lib/telemetry/device-diagnostics";

interface StreamQualityDoctorBannerProps {
    initialAlert?: UserTranscodeAlertResult | null;
}

export default function StreamQualityDoctorBanner({ initialAlert }: StreamQualityDoctorBannerProps) {
    const [alert, setAlert] = useState<UserTranscodeAlertResult | null>(initialAlert || null);
    const [isDismissed, setIsDismissed] = useState(false);
    const [showGuideModal, setShowGuideModal] = useState(false);
    const [copied, setCopied] = useState(false);
    const [loading, setLoading] = useState(!initialAlert);

    useEffect(() => {
        if (!initialAlert) {
            getUserTranscodeAlertAction()
                .then((res) => {
                    if (res && res.hasAlert) {
                        setAlert(res as UserTranscodeAlertResult);
                    }
                })
                .catch(() => {})
                .finally(() => setLoading(false));
        }
    }, [initialAlert]);

    useEffect(() => {
        if (alert?.diagnosis?.title) {
            const dismissKey = `portalarr_dismiss_transcode_${alert.diagnosis.deviceCategory}_${alert.diagnosis.title}`;
            if (sessionStorage.getItem(dismissKey)) {
                setIsDismissed(true);
            }
        }
    }, [alert]);

    const handleDismiss = () => {
        if (alert?.diagnosis?.title) {
            const dismissKey = `portalarr_dismiss_transcode_${alert.diagnosis.deviceCategory}_${alert.diagnosis.title}`;
            sessionStorage.setItem(dismissKey, "true");
        }
        setIsDismissed(true);
    };

    const handleCopy = () => {
        if (alert?.diagnosis?.copyableNotice) {
            navigator.clipboard.writeText(alert.diagnosis.copyableNotice);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    if (loading || !alert || !alert.hasAlert || isDismissed || !alert.diagnosis) {
        return null;
    }

    const diag = alert.diagnosis;
    const isError = diag.severity === "error";

    const getDeviceIcon = () => {
        const cat = diag.deviceCategory.toLowerCase();
        if (cat.includes("tv") || cat.includes("roku") || cat.includes("fire") || cat.includes("apple")) {
            return <Tv className="h-4 w-4 text-amber-400 shrink-0" />;
        }
        if (cat.includes("browser") || cat.includes("web")) {
            return <Monitor className="h-4 w-4 text-cyan-400 shrink-0" />;
        }
        return <Smartphone className="h-4 w-4 text-indigo-400 shrink-0" />;
    };

    return (
        <>
            <div className={`relative overflow-hidden rounded-2xl border transition-all duration-300 shadow-lg backdrop-blur-md ${
                isError 
                    ? "bg-gradient-to-r from-red-950/60 via-slate-900/90 to-red-950/40 border-red-500/40" 
                    : "bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-indigo-950/50 border-amber-500/40"
            }`}>
                <div className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-3.5 min-w-0">
                        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 shrink-0 mt-0.5 shadow-inner">
                            <Stethoscope className="h-5 w-5 animate-pulse" />
                        </div>

                        <div className="space-y-1.5 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                    <Sparkles className="h-3 w-3" /> Stream Quality Doctor
                                </Badge>
                                
                                <Badge variant="outline" className="text-[10px] bg-slate-950/60 border-slate-700 text-slate-300 flex items-center gap-1">
                                    {getDeviceIcon()}
                                    <span>{alert.device || diag.deviceCategory}</span>
                                </Badge>

                                {alert.isActiveNow && (
                                    <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[9px] font-semibold animate-pulse">
                                        Streaming Now
                                    </Badge>
                                )}
                            </div>

                            <h3 className="text-sm sm:text-base font-extrabold text-white tracking-tight leading-snug">
                                {diag.title}
                            </h3>

                            <p className="text-xs text-slate-300/90 leading-relaxed max-w-3xl">
                                {alert.mediaTitle ? (
                                    <>We noticed your stream of <strong className="text-white">"{alert.mediaTitle}"</strong> was downscaled by your device settings. </>
                                ) : null}
                                {diag.description}
                            </p>

                            <div className="flex items-center gap-2 text-[11px] text-amber-300 font-medium pt-0.5">
                                <span className="font-bold uppercase tracking-wide text-amber-400">⚡ Quick Fix:</span>
                                <span className="truncate">{diag.quickFix}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0 self-end md:self-center pt-2 md:pt-0">
                        <Button
                            size="sm"
                            onClick={() => setShowGuideModal(true)}
                            className="h-9 px-3.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                        >
                            <Wrench className="h-3.5 w-3.5" />
                            <span>Fix in 30 Seconds</span>
                            <ChevronRight className="h-3.5 w-3.5 opacity-70" />
                        </Button>

                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={handleDismiss}
                            className="h-9 w-9 p-0 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 shrink-0"
                            title="Dismiss for this session"
                        >
                            <X className="h-4 w-4" />
                        </Button>
                    </div>
                </div>
            </div>

            {/* --- STEP-BY-STEP FIX GUIDE MODAL --- */}
            <Dialog open={showGuideModal} onOpenChange={setShowGuideModal}>
                <DialogContent className="sm:max-w-xl bg-slate-950 border-slate-800 text-white shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-5 pb-3 border-b border-slate-800 bg-slate-900/80">
                        <div className="flex items-center gap-2 mb-1">
                            <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-bold uppercase tracking-wider flex items-center gap-1">
                                <Stethoscope className="h-3 w-3" /> Transcode Doctor Guide
                            </Badge>
                            <Badge variant="outline" className="text-[10px] bg-slate-950 border-slate-700 text-cyan-300">
                                {diag.deviceCategory}
                            </Badge>
                        </div>
                        <DialogTitle className="text-base sm:text-lg font-bold text-white">
                            {diag.title}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-muted-foreground">
                            Follow these simple steps in your Plex app to unlock original 1080p/4K Direct Play without server buffering.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto text-xs">
                        {/* Summary Box */}
                        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1.5">
                            <div className="font-bold text-amber-300 flex items-center gap-1.5">
                                <AlertTriangle className="h-4 w-4 text-amber-400" />
                                Why is this happening?
                            </div>
                            <p className="text-slate-300 leading-relaxed">
                                {diag.description}
                            </p>
                        </div>

                        {/* Step By Step Checklist */}
                        <div className="space-y-2.5">
                            <h4 className="font-bold text-slate-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                                <Wrench className="h-3.5 w-3.5 text-cyan-400" />
                                Step-by-Step Fix Instructions:
                            </h4>

                            <div className="space-y-2">
                                {diag.stepByStepGuide.map((step, idx) => (
                                    <div 
                                        key={idx}
                                        className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3 hover:bg-slate-900 transition-colors"
                                    >
                                        <div className="w-6 h-6 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-mono font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                                            {idx + 1}
                                        </div>
                                        <div className="space-y-0.5">
                                            <p className="text-slate-200 font-medium leading-relaxed">
                                                {step}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Copyable Quick Notice */}
                        <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                                <span>Copy instructions for family or another screen:</span>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={handleCopy}
                                    className="h-7 px-2 text-[11px] text-cyan-300 hover:bg-cyan-500/10 font-semibold"
                                >
                                    {copied ? (
                                        <>
                                            <Check className="h-3.5 w-3.5 mr-1 text-emerald-400" />
                                            Copied!
                                        </>
                                    ) : (
                                        <>
                                            <Copy className="h-3.5 w-3.5 mr-1" />
                                            Copy Steps
                                        </>
                                    )}
                                </Button>
                            </div>
                            <div className="p-2.5 rounded-lg bg-slate-950 font-mono text-[10px] text-slate-400 whitespace-pre-wrap leading-relaxed select-all">
                                {diag.copyableNotice}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="p-4 border-t border-slate-800 bg-slate-900/60 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowGuideModal(false)}
                            className="text-xs text-slate-400 hover:text-white w-full sm:w-auto"
                        >
                            Close
                        </Button>

                        <Button
                            size="sm"
                            onClick={() => {
                                setShowGuideModal(false);
                                handleDismiss();
                            }}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-1.5 shadow-md w-full sm:w-auto shrink-0 whitespace-nowrap"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>I've Updated My Settings</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
