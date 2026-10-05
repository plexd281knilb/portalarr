"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { AlertTriangle, RotateCcw, Save, Loader2 } from "lucide-react";

export interface CustomPendingNavigation {
    type: string;
    target: string;
    onDiscardAndProceed?: () => void;
    onSaveAndProceed?: () => Promise<void> | void;
}

export interface UnsavedChangesPromptProps {
    hasUnsavedChanges: boolean;
    unsavedSections: string[];
    onSave: () => Promise<boolean | void> | void;
    onDiscard: () => void;
    isSaving?: boolean;
    title?: string;
    saveLabel?: string;
    description?: string;
    customPendingNav?: CustomPendingNavigation | null;
    onCancelPendingNav?: () => void;
}

export function UnsavedChangesPrompt({
    hasUnsavedChanges,
    unsavedSections,
    onSave,
    onDiscard,
    isSaving = false,
    title = "Unsaved Settings",
    saveLabel = "Save All Changes",
    description = "You have unsaved changes. If you leave now without saving, your edits will be lost.",
    customPendingNav,
    onCancelPendingNav
}: UnsavedChangesPromptProps) {
    const router = useRouter();
    const [internalOpen, setInternalOpen] = useState(false);
    const [internalPendingUrl, setInternalPendingUrl] = useState<string | null>(null);
    const [isSavingInternal, setIsSavingInternal] = useState(false);

    // Browser-level reload/close protection
    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = "";
                return "";
            }
        };
        window.addEventListener("beforeunload", handleBeforeUnload);
        return () => window.removeEventListener("beforeunload", handleBeforeUnload);
    }, [hasUnsavedChanges]);

    // In-app navigation protection for link clicks
    useEffect(() => {
        const handleLinkClick = (e: MouseEvent) => {
            if (!hasUnsavedChanges) return;

            const target = e.target as HTMLElement;
            const anchor = target.closest("a");
            if (!anchor) return;

            const href = anchor.getAttribute("href");
            if (
                !href || 
                href.startsWith("#") || 
                href.startsWith("javascript:") || 
                href.startsWith("mailto:") || 
                href.startsWith("tel:") || 
                anchor.target === "_blank" ||
                anchor.hasAttribute("download")
            ) {
                return;
            }

            const currentUrl = window.location.pathname + window.location.search;
            if (href === currentUrl) return;

            e.preventDefault();
            e.stopPropagation();
            setInternalPendingUrl(href);
            setInternalOpen(true);
        };

        document.addEventListener("click", handleLinkClick, true);
        return () => document.removeEventListener("click", handleLinkClick, true);
    }, [hasUnsavedChanges]);

    const isModalOpen = internalOpen || !!customPendingNav;

    const handleStayOnPage = () => {
        setInternalOpen(false);
        setInternalPendingUrl(null);
        if (onCancelPendingNav) {
            onCancelPendingNav();
        }
    };

    const handleDiscardAndLeave = () => {
        onDiscard();
        setInternalOpen(false);
        const url = internalPendingUrl;
        setInternalPendingUrl(null);

        if (customPendingNav?.onDiscardAndProceed) {
            customPendingNav.onDiscardAndProceed();
        } else if (url) {
            router.push(url);
        }
    };

    const handleSaveAndContinue = async () => {
        setIsSavingInternal(true);
        try {
            await onSave();
            setInternalOpen(false);
            const url = internalPendingUrl;
            setInternalPendingUrl(null);

            if (customPendingNav?.onSaveAndProceed) {
                await customPendingNav.onSaveAndProceed();
            } else if (url) {
                router.push(url);
            }
        } finally {
            setIsSavingInternal(false);
        }
    };

    const savingActive = isSaving || isSavingInternal;

    return (
        <>
            {/* FLOATING DOCKED SAVE BAR */}
            {hasUnsavedChanges && (
                <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#13131a]/95 backdrop-blur-xl border-2 border-amber-500/70 p-3.5 sm:px-5 sm:py-3.5 rounded-2xl shadow-[0_10px_35px_rgba(245,158,11,0.25)] text-foreground">
                        <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                            </span>
                            <div className="text-xs">
                                <span className="font-bold text-amber-400">
                                    {title} ({unsavedSections.length})
                                </span>
                                <p className="text-[10px] text-muted-foreground hidden sm:block max-w-[220px] truncate">
                                    {unsavedSections.join(", ")}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={onDiscard}
                                disabled={savingActive}
                                className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 active:scale-95 transition-all"
                            >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Discard
                            </Button>
                            <Button 
                                type="button" 
                                size="sm" 
                                onClick={() => onSave()}
                                disabled={savingActive}
                                className="h-8 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5"
                            >
                                {savingActive ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                    <Save className="h-3.5 w-3.5" />
                                )}
                                {saveLabel}
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* UNSAVED CHANGES MODAL */}
            <Dialog open={isModalOpen} onOpenChange={(open) => { if (!open) handleStayOnPage(); }}>
                <DialogContent className="w-[96vw] sm:max-w-md max-h-[85vh] flex flex-col p-4 sm:p-6 overflow-hidden bg-[#13131a] border-amber-500/40 text-foreground shadow-2xl">
                    <DialogHeader className="shrink-0">
                        <div className="flex items-center gap-2 text-amber-500 mb-1">
                            <AlertTriangle className="h-5 w-5" />
                            <DialogTitle className="text-lg font-bold">Unsaved Changes</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs text-muted-foreground">
                            {description}
                        </DialogDescription>
                    </DialogHeader>

                    {unsavedSections.length > 0 && (
                        <div className="space-y-2 py-2 flex-1 overflow-y-auto min-h-0">
                            <div className="text-xs font-semibold text-slate-300">Modified Sections:</div>
                            <div className="flex flex-wrap gap-1.5">
                                {unsavedSections.map((sec) => (
                                    <Badge 
                                        key={sec} 
                                        variant="outline" 
                                        className="bg-amber-500/10 text-amber-400 border-amber-500/30 text-[11px] font-medium"
                                    >
                                        ● {sec}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                    )}

                    <DialogFooter className="flex-col sm:flex-row gap-2 pt-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleStayOnPage}
                            className="text-xs"
                        >
                            Stay on Page
                        </Button>
                        <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={handleDiscardAndLeave}
                            className="text-xs bg-red-600 hover:bg-red-500"
                        >
                            Discard & Leave
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleSaveAndContinue}
                            disabled={savingActive}
                            className="text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black gap-1"
                        >
                            {savingActive ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                                <Save className="h-3.5 w-3.5" />
                            )}
                            Save & Continue
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
