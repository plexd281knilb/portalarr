"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
    Wrench, 
    Sparkles, 
    Bug, 
    Palette, 
    Lightbulb, 
    Zap, 
    HelpCircle, 
    Send, 
    Loader2, 
    CheckCircle2, 
    AlertCircle, 
    Monitor, 
    Smartphone, 
    Globe, 
    ShieldCheck 
} from "lucide-react";
import { submitPageFixSuggestionAction } from "@/app/actions";

export interface SuggestFixModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    userRole?: string;
    username?: string;
}

const CATEGORIES = [
    { id: "Bug / Broken Feature", label: "Bug / Broken", icon: Bug, color: "text-red-400 border-red-500/30 hover:border-red-500/60 bg-red-500/10" },
    { id: "Visual / UI Glitch", label: "Visual Glitch", icon: Palette, color: "text-pink-400 border-pink-500/30 hover:border-pink-500/60 bg-pink-500/10" },
    { id: "Feature / Page Idea", label: "Feature Idea", icon: Lightbulb, color: "text-amber-400 border-amber-500/30 hover:border-amber-500/60 bg-amber-500/10" },
    { id: "Slow Performance / Buffering", label: "Slow / Buffering", icon: Zap, color: "text-yellow-400 border-yellow-500/30 hover:border-yellow-500/60 bg-yellow-500/10" },
    { id: "Other Issue", label: "Other", icon: HelpCircle, color: "text-blue-400 border-blue-500/30 hover:border-blue-500/60 bg-blue-500/10" }
];

export function getFriendlyPageInfo(pathname: string): { title: string; fileHints: string[] } {
    if (!pathname || pathname === "/") {
        return {
            title: "Home Dashboard & Active Streams (/)",
            fileHints: ["src/app/page.tsx", "src/components/my-plex-hub.tsx", "src/components/admin-detailed-streams.tsx"]
        };
    }
    if (pathname.startsWith("/library")) {
        return {
            title: "Book & Audiobook Library (/library)",
            fileHints: ["src/app/library/page.tsx", "src/components/book-card.tsx", "src/components/audiobook-card.tsx", "src/app/actions.ts"]
        };
    }
    if (pathname.startsWith("/discover")) {
        return {
            title: "Media Discovery (/discover)",
            fileHints: ["src/app/discover/page.tsx", "src/app/seerr-actions.ts", "src/components/seerr/discover-hub.tsx"]
        };
    }
    if (pathname.startsWith("/requests")) {
        return {
            title: "Media Requests Manager (/requests)",
            fileHints: ["src/app/requests/page.tsx", "src/components/request-manager.tsx", "src/app/seerr-actions.ts"]
        };
    }
    if (pathname.startsWith("/radarr")) {
        return {
            title: "Radarr Movies (/radarr)",
            fileHints: ["src/app/radarr/page.tsx", "src/components/radarr-movie-table.tsx"]
        };
    }
    if (pathname.startsWith("/sonarr")) {
        return {
            title: "Sonarr TV Shows (/sonarr)",
            fileHints: ["src/app/sonarr/page.tsx", "src/components/sonarr-series-table.tsx"]
        };
    }
    if (pathname.startsWith("/profile") || pathname.startsWith("/settings/profile")) {
        return {
            title: "Account & Profile Settings (/profile)",
            fileHints: ["src/app/profile/page.tsx", "src/app/settings/profile/page.tsx"]
        };
    }
    if (pathname.startsWith("/guides")) {
        return {
            title: "Plex Device Setup Guides (/guides)",
            fileHints: ["src/app/guides/page.tsx", "src/components/plex-setup-guides.tsx"]
        };
    }
    if (pathname.startsWith("/tickets") || pathname.startsWith("/admin/tickets")) {
        return {
            title: "Support Tickets (/tickets)",
            fileHints: ["src/app/tickets/page.tsx", "src/app/actions.ts"]
        };
    }
    if (pathname.startsWith("/beta")) {
        return {
            title: "Beta Portal (/beta)",
            fileHints: ["src/app/beta/page.tsx"]
        };
    }
    if (pathname.startsWith("/admin/monitoring")) {
        return {
            title: "Fleet & System Monitoring (/admin/monitoring)",
            fileHints: ["src/app/admin/monitoring/page.tsx", "src/components/admin-system-health-grid.tsx"]
        };
    }
    if (pathname.startsWith("/admin/scripts")) {
        return {
            title: "User Scripts & Automation (/admin/scripts)",
            fileHints: ["src/app/admin/scripts/page.tsx"]
        };
    }
    if (pathname.startsWith("/admin/tautulli") || pathname.startsWith("/admin/streams") || pathname.startsWith("/tautulli") || pathname.startsWith("/streams")) {
        return {
            title: "Stream Intelligence & History (/admin/streams)",
            fileHints: ["src/app/admin/streams/page.tsx", "src/components/admin-detailed-streams.tsx"]
        };
    }
    if (pathname.startsWith("/curation/kometa")) {
        return {
            title: "Kometa Overlays Studio (/curation/kometa)",
            fileHints: ["src/app/curation/kometa/page.tsx", "src/components/curation/kometa-studio.tsx"]
        };
    }
    if (pathname.startsWith("/curation/agregarr")) {
        return {
            title: "Agregarr Hubs Studio (/curation/agregarr)",
            fileHints: ["src/app/curation/agregarr/page.tsx", "src/components/curation/agregarr-studio.tsx"]
        };
    }
    if (pathname.startsWith("/curation/prune")) {
        return {
            title: "Maintainerr Prune Studio (/curation/prune)",
            fileHints: ["src/app/curation/prune/page.tsx", "src/components/curation/prune-studio.tsx"]
        };
    }
    if (pathname.startsWith("/curation/tagging")) {
        return {
            title: "Media Tagging Studio (/curation/tagging)",
            fileHints: ["src/app/curation/tagging/page.tsx", "src/components/curation/tagging-studio.tsx"]
        };
    }
    if (pathname.startsWith("/curation")) {
        return {
            title: "Curation Studio (/curation)",
            fileHints: ["src/app/curation/page.tsx"]
        };
    }
    if (pathname.startsWith("/settings/access")) {
        return {
            title: "Access Control Directory (/settings/access)",
            fileHints: ["src/app/settings/access/page.tsx", "src/app/actions.ts"]
        };
    }
    if (pathname.startsWith("/settings")) {
        return {
            title: "System Settings (/settings)",
            fileHints: ["src/app/settings/page.tsx", "src/components/settings/general-settings.tsx"]
        };
    }
    return {
        title: `${pathname} Page`,
        fileHints: [`src/app${pathname.replace(/\/$/, "")}/page.tsx`]
    };
}

export function SuggestFixModal({ open, onOpenChange, userRole = "USER", username = "Member" }: SuggestFixModalProps) {
    const pathname = usePathname();
    const [pageUrl, setPageUrl] = useState("");
    const [category, setCategory] = useState("Bug / Broken Feature");
    const [summary, setSummary] = useState("");
    const [description, setDescription] = useState("");
    const [stepsToReproduce, setStepsToReproduce] = useState("");
    const [errorMessage, setErrorMessage] = useState("");
    const [telemetry, setTelemetry] = useState<{
        userAgent: string;
        screenResolution: string;
        viewport: string;
        platform: string;
        language: string;
    }>({
        userAgent: "",
        screenResolution: "",
        viewport: "",
        platform: "",
        language: ""
    });

    const [submitting, setSubmitting] = useState(false);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [submittedTicketId, setSubmittedTicketId] = useState<string | null>(null);

    // Capture telemetry when modal opens
    useEffect(() => {
        if (open && typeof window !== "undefined") {
            const currentUrl = window.location.pathname + window.location.search;
            setPageUrl(currentUrl);
            setTelemetry({
                userAgent: navigator.userAgent,
                screenResolution: `${window.screen.width}x${window.screen.height}`,
                viewport: `${window.innerWidth}x${window.innerHeight}`,
                platform: navigator.platform || "Web",
                language: navigator.language || "en-US"
            });
            setSubmitError(null);
            setSubmittedTicketId(null);
        }
    }, [open, pathname]);

    const pageInfo = getFriendlyPageInfo(pathname);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!summary.trim() || !description.trim()) {
            setSubmitError("Please fill out both the summary title and description.");
            return;
        }

        setSubmitting(true);
        setSubmitError(null);

        try {
            const res = await submitPageFixSuggestionAction({
                pageUrl: pageUrl || pathname,
                category,
                summary: summary.trim(),
                description: description.trim(),
                stepsToReproduce: stepsToReproduce.trim() || undefined,
                errorMessage: errorMessage.trim() || undefined,
                telemetry
            });

            if (res.success && res.ticketId) {
                setSubmittedTicketId(res.ticketId);
                // Clear form
                setSummary("");
                setDescription("");
                setStepsToReproduce("");
                setErrorMessage("");
            } else {
                setSubmitError(res.error || "Failed to submit page fix suggestion.");
            }
        } catch (err: any) {
            setSubmitError(err?.message || "An unexpected error occurred.");
        } finally {
            setSubmitting(false);
        }
    };

    const handleClose = () => {
        if (submitting) return;
        onOpenChange(false);
        setSubmitError(null);
        setSubmittedTicketId(null);
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-xl md:max-w-2xl bg-[#0e0e14] border-border/60 text-foreground p-0 overflow-hidden shadow-2xl rounded-2xl max-h-[92vh] flex flex-col">
                <DialogHeader className="px-5 pt-5 pb-4 border-b border-border/40 bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                            <Wrench className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2">
                                <span>Suggest a Fix / Report Issue</span>
                                <Badge variant="outline" className="text-[10px] bg-purple-500/15 text-purple-300 border-purple-500/30">
                                    <Sparkles className="h-2.5 w-2.5 mr-1" /> Full Member
                                </Badge>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-muted-foreground truncate">
                                Reporting on <span className="font-semibold text-foreground">{pageInfo.title}</span>
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
                    {submittedTicketId ? (
                        <div className="py-8 px-4 text-center space-y-4 animate-in fade-in zoom-in-95 duration-200">
                            <div className="h-16 w-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
                                <CheckCircle2 className="h-8 w-8" />
                            </div>
                            <div className="space-y-1.5">
                                <h3 className="text-lg font-bold text-foreground">Suggestion Dispatched!</h3>
                                <p className="text-xs text-muted-foreground max-w-md mx-auto leading-relaxed">
                                    Thank you, <span className="font-semibold text-foreground">{username}</span>! Your suggestion has been recorded as ticket{" "}
                                    <span className="font-mono text-primary font-bold">#{submittedTicketId.slice(0, 8)}</span> and notified to the administrator with full telemetry and an AI prompt ready for execution.
                                </p>
                            </div>
                            <div className="pt-2">
                                <Button onClick={handleClose} className="px-6 h-9 font-semibold">
                                    Done
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <form id="suggest-fix-form" onSubmit={handleSubmit} className="space-y-4">
                            {/* ERROR BANNER */}
                            {submitError && (
                                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                                    <span>{submitError}</span>
                                </div>
                            )}

                            {/* CATEGORY SELECTOR */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Issue / Suggestion Category
                                </Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                    {CATEGORIES.map((cat) => {
                                        const Icon = cat.icon;
                                        const isSelected = category === cat.id;
                                        return (
                                            <button
                                                key={cat.id}
                                                type="button"
                                                onClick={() => setCategory(cat.id)}
                                                className={`flex items-center gap-2 p-2 rounded-xl text-xs font-semibold border transition-all text-left cursor-pointer ${
                                                    isSelected
                                                        ? `${cat.color} ring-2 ring-amber-500/50 shadow-sm font-bold`
                                                        : "bg-muted/20 border-border/40 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                                                }`}
                                            >
                                                <Icon className="h-3.5 w-3.5 shrink-0" />
                                                <span className="truncate">{cat.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* SUMMARY TITLE */}
                            <div className="space-y-1.5">
                                <Label htmlFor="fix-summary" className="text-xs font-semibold flex items-center justify-between">
                                    <span>Summary / Title *</span>
                                    <span className="text-[10px] text-muted-foreground">One line summary</span>
                                </Label>
                                <Input
                                    id="fix-summary"
                                    value={summary}
                                    onChange={(e) => setSummary(e.target.value)}
                                    placeholder="e.g. Book cover doesn't load on mobile, or Add filter for unread books"
                                    className="h-9 bg-background/60 border-border/50 text-xs sm:text-sm"
                                    required
                                />
                            </div>

                            {/* WHAT HAPPENED & WHAT DID YOU EXPECT */}
                            <div className="space-y-1.5">
                                <Label htmlFor="fix-desc" className="text-xs font-semibold flex items-center justify-between">
                                    <span>What happened & what did you expect? *</span>
                                    <span className="text-[10px] text-muted-foreground">Detailed description</span>
                                </Label>
                                <Textarea
                                    id="fix-desc"
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Describe the issue or proposed improvement in detail. What did you observe versus what you expected to happen?"
                                    className="min-h-[85px] bg-background/60 border-border/50 text-xs sm:text-sm leading-relaxed"
                                    required
                                />
                            </div>

                            {/* STEPS TO REPRODUCE */}
                            <div className="space-y-1.5">
                                <Label htmlFor="fix-steps" className="text-xs font-semibold flex items-center justify-between">
                                    <span>Steps to Reproduce (Optional)</span>
                                    <span className="text-[10px] text-muted-foreground">Help the admin recreate it</span>
                                </Label>
                                <Textarea
                                    id="fix-steps"
                                    value={stepsToReproduce}
                                    onChange={(e) => setStepsToReproduce(e.target.value)}
                                    placeholder="1. Go to this page&#10;2. Click on the card&#10;3. Notice the behavior"
                                    className="min-h-[60px] bg-background/60 border-border/50 text-xs sm:text-sm leading-relaxed font-mono text-[11px]"
                                />
                            </div>

                            {/* ERROR MESSAGE (OPTIONAL) */}
                            <div className="space-y-1.5">
                                <Label htmlFor="fix-error" className="text-xs font-semibold flex items-center justify-between">
                                    <span>Error Message (Optional)</span>
                                    <span className="text-[10px] text-muted-foreground">Copy/paste error text</span>
                                </Label>
                                <Input
                                    id="fix-error"
                                    value={errorMessage}
                                    onChange={(e) => setErrorMessage(e.target.value)}
                                    placeholder="e.g. Failed to fetch stream, or 404 Not Found"
                                    className="h-8 bg-background/60 border-border/50 text-xs font-mono"
                                />
                            </div>

                            {/* AUTO-CAPTURED TELEMETRY CARD */}
                            <div className="p-3 rounded-xl bg-muted/20 border border-border/40 space-y-1.5">
                                <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <Monitor className="h-3 w-3 text-primary" /> Auto-Captured Context
                                    </span>
                                    <Badge variant="outline" className="text-[9px] bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                                        Auto-Attached
                                    </Badge>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-muted-foreground font-mono">
                                    <div className="truncate">
                                        <span className="text-foreground font-semibold">Page:</span> {pageUrl || pathname}
                                    </div>
                                    <div className="truncate">
                                        <span className="text-foreground font-semibold">Role:</span> {userRole}
                                    </div>
                                    <div className="truncate">
                                        <span className="text-foreground font-semibold">Viewport:</span> {telemetry.viewport || "Detecting..."}
                                    </div>
                                    <div className="truncate">
                                        <span className="text-foreground font-semibold">Platform:</span> {telemetry.platform || "Web"}
                                    </div>
                                </div>
                            </div>
                        </form>
                    )}
                </div>

                {!submittedTicketId && (
                    <DialogFooter className="px-5 py-3 border-t border-border/40 bg-muted/10 flex flex-row items-center justify-between sm:justify-between gap-2">
                        <Button 
                            type="button" 
                            variant="ghost" 
                            size="sm" 
                            onClick={handleClose}
                            disabled={submitting}
                            className="text-xs"
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="suggest-fix-form"
                            size="sm"
                            disabled={submitting}
                            className="gap-2 bg-gradient-to-r from-amber-600 via-purple-600 to-indigo-600 hover:from-amber-500 hover:via-purple-500 hover:to-indigo-500 text-white font-semibold text-xs h-9 shadow-md shadow-amber-950/40"
                        >
                            {submitting ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    <span>Submitting...</span>
                                </>
                            ) : (
                                <>
                                    <Send className="h-3.5 w-3.5" />
                                    <span>Submit Suggestion</span>
                                </>
                            )}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
}

export default SuggestFixModal;
