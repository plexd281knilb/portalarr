"use client";

import { useState, useEffect } from "react";
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, CheckCircle2, Rocket, Wrench, Shield } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import Link from "next/link";
import { BuildBadge } from "@/components/build-badge";

export interface WhatsNewModalProps {
    roadmapText: string;
    devRoadmapText?: string;
    triggerButton?: boolean;
    buttonClassName?: string;
    userRole?: "ADMIN" | "SUPER_USER" | "USER" | "TRIAL";
    initialTab?: "user" | "dev";
    triggerVariant?: "default" | "dev";
}

// Simple deterministic hash function for strings
function simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash.toString();
}

export function filterRoadmapByRole(markdown: string, role?: string): string {
    if (!markdown) return "";
    const effectiveRole = role || "USER";
    const isAdmin = effectiveRole === "ADMIN";
    const isSuperUser = effectiveRole === "SUPER_USER";
    const isTrial = effectiveRole === "TRIAL";

    // Administrators have full visibility into all releases and operational tools
    if (isAdmin) {
        return markdown;
    }

    // Technical / Admin-only jargon and administrative sections regular members should never see
    const adminOnlyPatterns = [
        /\(admin\)/i,
        /admin only/i,
        /action approval queue/i,
        /email audit log/i,
        /outbound communications ledger/i,
        /admin telemetry/i,
        /telemetry gating/i,
        /dry architecture/i,
        /commit inspection/i,
        /schema migration/i,
        /cloudflare zero trust/i,
        /cloudflare security/i,
        /admin edge proxy/i,
        /payment scraping/i,
        /imap payment/i,
        /database fallback/i,
        /sqlite lock/i,
        /patch highlights/i,
        /v1\.0\.1 patch/i,
        /backend api/i,
    ];

    const superUserOnlyPatterns = [
        /\(super users?\)/i,
        /super user access/i,
        /radarr/i,
        /sonarr/i,
    ];

    const trialExcludedPatterns = [
        /ebooks? & send-to-kindle/i,
        /ebooks? & audiobooks? subsystem/i,
        /in-browser reader/i,
        /send-to-kindle/i,
        /audiobook/i,
        /jellyfin/i,
        /emby/i,
        /multi-platform media servers/i,
        /family sub-profile/i,
        /enhanced curation & poster badge/i,
        /leaving soon/i,
        /referral rewards/i,
        /member referral rewards/i,
        /live tv/i,
        /channel activation/i,
        /cross-device watchlist & reading sync/i,
        /payment formula/i,
    ];

    const lines = markdown.split("\n");
    const filtered: string[] = [];
    let skippingParentLevel = -1;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();
        const lower = trimmed.toLowerCase();

        // Calculate leading whitespace indentation for nested bullet hierarchy
        const indentMatch = line.match(/^(\s*)/);
        const indentLength = indentMatch ? indentMatch[1].length : 0;

        // Reset child skipping if we return to or above the parent's indentation level
        if (skippingParentLevel !== -1) {
            if (trimmed === "" || indentLength > skippingParentLevel) {
                continue; // Skip nested child lines under an excluded parent
            } else {
                skippingParentLevel = -1; // Reset skipping
            }
        }

        // 1. Admin Gating (Strict 100% removal for non-admins)
        if (adminOnlyPatterns.some((pattern) => pattern.test(line))) {
            if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
                skippingParentLevel = indentLength;
            }
            continue;
        }

        // 2. Super User Gating
        if (!isSuperUser && superUserOnlyPatterns.some((pattern) => pattern.test(line))) {
            if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
                skippingParentLevel = indentLength;
            }
            continue;
        }

        // 3. Trial Gating
        if (isTrial) {
            // For Unified Media Requests, smoothly adapt bullet so trial users see Movies & TV Shows
            if (lower.includes("unified media requests") && (lower.includes("books") || lower.includes("audiobook"))) {
                line = line
                    .replace(/\(movies, tv shows & books\)/i, "(Movies & TV Shows)")
                    .replace(/\(movies, tv shows, ebooks & audiobooks\)/i, "(Movies & TV Shows)");
            } else if (trialExcludedPatterns.some((pattern) => pattern.test(line))) {
                if (trimmed.startsWith("-") || trimmed.startsWith("*")) {
                    skippingParentLevel = indentLength;
                }
                continue;
            }
        }

        // 4. Jargon Sanitation Pass for all member views
        line = line
            .replace(/\bDirect Play\b/gi, "Original Quality")
            .replace(/\bplayback telemetry\b/gi, "stream health stats")
            .replace(/\btelemetry\b/gi, "stream diagnostics")
            .replace(/\bQuality Doctor\b/gi, "Stream Diagnostics")
            .replace(/\bhomelab streaming\b/gi, "media streaming")
            .replace(/\bcentral homelab\b/gi, "central media and entertainment hub")
            .replace(/\bDispatcharr\b/gi, "Live TV")
            .replace(/\bdormancy cleanup\b/gi, "inactive channel cleanup");

        filtered.push(line);
    }

    const result = filtered.join("\n").replace(/\n{3,}/g, "\n\n").trim();
    return result || "> 🚀 **Welcome to DomsHomeLab!** Check out our latest media discovery and high-performance streaming features.";
}

export default function WhatsNewModal({ 
    roadmapText, 
    devRoadmapText = "",
    triggerButton = true,
    buttonClassName,
    userRole,
    initialTab = "user",
    triggerVariant = "default"
}: WhatsNewModalProps) {
    const isAdmin = userRole === "ADMIN";
    const [open, setOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<"user" | "dev">(initialTab || "user");
    const [hasUnseenUpdate, setHasUnseenUpdate] = useState(false);
    const effectiveText = filterRoadmapByRole(roadmapText, userRole);

    useEffect(() => {
        if (initialTab) {
            setActiveTab(initialTab);
        }
    }, [initialTab]);

    useEffect(() => {
        if (!effectiveText || effectiveText.trim() === "") return;

        try {
            const currentHash = simpleHash(effectiveText.trim());
            const storedHash = localStorage.getItem(`portalarr_last_seen_roadmap_${userRole || "all"}`);

            if (storedHash !== currentHash) {
                setHasUnseenUpdate(true);
            }
        } catch (e) {
            console.warn("Could not access localStorage for update check:", e);
        }
    }, [effectiveText, userRole]);

    const handleDismiss = () => {
        setOpen(false);
        try {
            if (effectiveText) {
                const currentHash = simpleHash(effectiveText.trim());
                localStorage.setItem(`portalarr_last_seen_roadmap_${userRole || "all"}`, currentHash);
                setHasUnseenUpdate(false);
            }
        } catch (e) {}
    };

    return (
        <>
            {triggerButton && (
                triggerVariant === "dev" ? (
                    <Button
                        onClick={() => {
                            setActiveTab("dev");
                            setOpen(true);
                        }}
                        variant="outline"
                        size="sm"
                        className={buttonClassName || "h-8 px-3 text-xs font-semibold gap-1.5 rounded-full border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 hover:text-amber-200 hover:ring-2 hover:ring-amber-400/50 active:scale-95 transition-all shadow-sm"}
                    >
                        <Wrench className="h-3.5 w-3.5 text-amber-400" />
                        <span>Dev Roadmap</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 uppercase font-bold bg-amber-500/20 text-amber-300 border-amber-500/40 ml-0.5">
                            Admin
                        </Badge>
                    </Button>
                ) : (
                    <Button
                        onClick={() => {
                            setActiveTab("user");
                            setOpen(true);
                        }}
                        variant="outline"
                        size="sm"
                        className={buttonClassName || "h-8 px-3 text-xs font-semibold gap-1.5 rounded-full border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 hover:ring-2 hover:ring-purple-400/50 active:scale-95 transition-all shadow-sm"}
                    >
                        <Sparkles className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
                        <span>What&apos;s New</span>
                        {hasUnseenUpdate && (
                            <span className="relative flex h-2 w-2 ml-0.5">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                            </span>
                        )}
                    </Button>
                )
            )}

            <Dialog open={open} onOpenChange={(val) => {
                if (!val) handleDismiss();
                else setOpen(true);
            }}>
                <DialogContent className="sm:max-w-3xl max-h-[85vh] flex flex-col bg-[#121218]/95 border-purple-500/30 backdrop-blur-xl shadow-2xl p-0 overflow-hidden">
                    {/* Header */}
                    <div className={`p-5 sm:p-6 border-b border-border/40 transition-colors ${
                        activeTab === "dev" 
                            ? "bg-gradient-to-r from-amber-950/40 via-background to-cyan-950/30 border-amber-500/30" 
                            : "bg-gradient-to-r from-purple-950/40 via-background to-blue-950/30"
                    }`}>
                        <DialogHeader className="text-left space-y-2">
                            <div className="flex items-center gap-2 flex-wrap">
                                {activeTab === "dev" ? (
                                    <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[10px] font-bold uppercase tracking-wider py-0.5">
                                        <Wrench className="h-3 w-3 mr-1 text-amber-400" /> Developer Backlog
                                    </Badge>
                                ) : (
                                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px] font-bold uppercase tracking-wider py-0.5">
                                        <Rocket className="h-3 w-3 mr-1" /> Latest Updates
                                    </Badge>
                                )}
                                <BuildBadge variant="compact" showModalOnClick={false} isAdmin={isAdmin} />
                                <span className="text-xs text-muted-foreground">DomsHomeLab (d281knilb)</span>
                            </div>
                            <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2 text-foreground">
                                {activeTab === "dev" ? (
                                    <>
                                        <Wrench className="h-5 w-5 text-amber-400" />
                                        <span>Developer Roadmap & Maintenance Backlog</span>
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="h-5 w-5 text-purple-400" />
                                        <span>What&apos;s New in DomsHomeLab</span>
                                    </>
                                )}
                            </DialogTitle>
                            <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                                {activeTab === "dev" 
                                    ? "Prioritized backend fixes, background scheduler alignment, and maintenance tasks."
                                    : "Discover the latest features, system improvements, and upcoming roadmap milestones."}
                            </DialogDescription>

                            {/* DUAL ROADMAP TAB SWITCHER (STRICTLY FOR ADMINS) */}
                            {isAdmin && (
                                <div className="flex items-center gap-1.5 p-1 bg-black/50 rounded-xl border border-white/[0.08] w-fit pt-1 mt-2 shadow-inner">
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("user")}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                            activeTab === "user"
                                                ? "bg-purple-500/25 text-purple-200 border border-purple-500/40 shadow-xs"
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                                        <span>User Roadmap</span>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setActiveTab("dev")}
                                        className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                            activeTab === "dev"
                                                ? "bg-amber-500/25 text-amber-200 border border-amber-500/40 shadow-xs"
                                                : "text-muted-foreground hover:text-foreground hover:bg-white/[0.04]"
                                        }`}
                                    >
                                        <Wrench className="h-3.5 w-3.5 text-amber-400" />
                                        <span>Developer Roadmap</span>
                                        <span className="text-[9px] px-1 py-0 rounded bg-amber-500/30 text-amber-300 border border-amber-500/40 font-mono font-bold">
                                            ADMIN
                                        </span>
                                    </button>
                                </div>
                            )}
                        </DialogHeader>
                    </div>

                    {/* Scrollable Markdown Content */}
                    <div className="flex-1 overflow-y-auto p-5 sm:p-6 text-sm leading-relaxed space-y-4">
                        {activeTab === "dev" ? (
                            devRoadmapText ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkBreaks]}
                                    rehypePlugins={[rehypeRaw]}
                                    components={{
                                        h1: ({ node, ...props }) => (
                                            <h1 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight mt-4 mb-2 border-b border-border/40 pb-2 flex items-center gap-2 text-amber-300" {...props} />
                                        ),
                                        h2: ({ node, ...props }) => (
                                            <h2 className="text-base sm:text-lg font-bold text-amber-400 mt-5 mb-2.5 border-b border-amber-500/20 pb-1.5 flex items-center gap-2" {...props} />
                                        ),
                                        h3: ({ node, ...props }) => (
                                            <h3 className="text-sm sm:text-base font-bold text-foreground mt-4 mb-1.5 flex items-center gap-2 text-amber-300/95" {...props} />
                                        ),
                                        h4: ({ node, ...props }) => (
                                            <h4 className="text-xs sm:text-sm font-bold text-muted-foreground uppercase tracking-wider mt-3 mb-1" {...props} />
                                        ),
                                        p: ({ node, ...props }) => (
                                            <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground/95 my-2" {...props} />
                                        ),
                                        ul: ({ node, ...props }) => (
                                            <ul className="space-y-1.5 my-2.5 pl-4 list-disc text-xs sm:text-sm text-muted-foreground/95" {...props} />
                                        ),
                                        ol: ({ node, ...props }) => (
                                            <ol className="space-y-1.5 my-2.5 pl-4 list-decimal text-xs sm:text-sm text-muted-foreground/95" {...props} />
                                        ),
                                        li: ({ node, ...props }) => (
                                            <li className="text-xs leading-relaxed text-muted-foreground/95" {...props} />
                                        ),
                                        strong: ({ node, ...props }) => (
                                            <strong className="font-semibold text-foreground" {...props} />
                                        ),
                                        blockquote: ({ node, ...props }) => (
                                            <blockquote className="border-l-2 border-amber-500/70 pl-3 py-1.5 my-2 bg-amber-500/5 rounded-r text-xs text-foreground/90 italic" {...props} />
                                        ),
                                        a: ({ node, ...props }) => (
                                            <a className="text-cyan-400 underline hover:text-cyan-300 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
                                        ),
                                        pre: ({ node, ...props }) => (
                                            <pre className="p-3 my-2.5 rounded-xl bg-black/60 border border-white/[0.08] overflow-x-auto text-xs font-mono text-cyan-300 shadow-inner" {...props} />
                                        ),
                                        code: ({ node, inline, ...props }: any) => (
                                            inline 
                                                ? <code className="px-1.5 py-0.5 rounded bg-black/40 border border-white/[0.08] font-mono text-[11px] text-amber-300" {...props} />
                                                : <code className="font-mono text-xs" {...props} />
                                        ),
                                    }}
                                >
                                    {devRoadmapText}
                                </ReactMarkdown>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    No developer maintenance backlog items recorded yet.
                                </div>
                            )
                        ) : (
                            effectiveText ? (
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm, remarkBreaks]}
                                    rehypePlugins={[rehypeRaw]}
                                    components={{
                                        h1: ({ node, ...props }) => (
                                            <h1 className="text-lg sm:text-xl font-extrabold text-foreground tracking-tight mt-4 mb-2 border-b border-border/40 pb-2 flex items-center gap-2" {...props} />
                                        ),
                                        h2: ({ node, ...props }) => (
                                            <h2 className="text-base sm:text-lg font-bold text-purple-300 mt-4 mb-2 border-b border-purple-500/20 pb-1.5 flex items-center gap-2" {...props} />
                                        ),
                                        h3: ({ node, ...props }) => (
                                            <h3 className="text-sm sm:text-base font-bold text-foreground mt-3 mb-1.5 flex items-center gap-2 text-primary/95" {...props} />
                                        ),
                                        p: ({ node, ...props }) => (
                                            <p className="text-xs sm:text-sm leading-relaxed text-muted-foreground/95 my-2" {...props} />
                                        ),
                                        ul: ({ node, ...props }) => (
                                            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-2.5 pl-0 list-none" {...props} />
                                        ),
                                        ol: ({ node, ...props }) => (
                                            <ol className="space-y-1.5 my-2 pl-4 list-decimal text-xs sm:text-sm text-muted-foreground/95" {...props} />
                                        ),
                                        li: ({ node, ...props }) => (
                                            <li className="text-xs leading-relaxed text-muted-foreground/95 p-2.5 rounded-lg bg-white/[0.02] border border-border/40 hover:border-purple-500/30 transition-all block" {...props} />
                                        ),
                                        strong: ({ node, ...props }) => (
                                            <strong className="font-semibold text-foreground" {...props} />
                                        ),
                                        blockquote: ({ node, ...props }) => (
                                            <blockquote className="border-l-2 border-purple-500/70 pl-3 py-1.5 my-2 bg-purple-500/5 rounded-r text-xs text-foreground/90 italic" {...props} />
                                        ),
                                        a: ({ node, ...props }) => (
                                            <a className="text-purple-400 underline hover:text-purple-300 transition-colors" target="_blank" rel="noopener noreferrer" {...props} />
                                        ),
                                    }}
                                >
                                    {effectiveText}
                                </ReactMarkdown>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground text-sm">
                                    All systems up to date. Check back soon for new release highlights!
                                </div>
                            )
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 sm:p-5 border-t border-border/40 bg-muted/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                        {activeTab === "dev" ? (
                            <Button asChild variant="ghost" size="sm" className="text-xs text-amber-400 hover:text-amber-300 gap-1.5 order-2 sm:order-1">
                                <Link href="/settings?tab=announcements">
                                    <Wrench className="h-3.5 w-3.5" />
                                    <span>Edit Roadmaps in Settings</span>
                                </Link>
                            </Button>
                        ) : (
                            <Button asChild variant="ghost" size="sm" className="text-xs text-sky-400 hover:text-sky-300 gap-1.5 order-2 sm:order-1">
                                <Link href="/guides">
                                    <span>View Device Setup Guides</span>
                                    <ArrowRight className="h-3.5 w-3.5" />
                                </Link>
                            </Button>
                        )}
                        <Button 
                            onClick={handleDismiss} 
                            size="sm"
                            className={activeTab === "dev"
                                ? "bg-amber-600 hover:bg-amber-500 text-white font-semibold px-5 gap-1.5 order-1 sm:order-2 w-full sm:w-auto shadow-md"
                                : "bg-purple-600 hover:bg-purple-500 text-white font-semibold px-5 gap-1.5 order-1 sm:order-2 w-full sm:w-auto shadow-md"
                            }
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>{activeTab === "dev" ? "Close" : "Got It"}</span>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}

export function DevRoadmapModal({ 
    devRoadmapText,
    roadmapText = "",
    triggerButton = true,
    buttonClassName 
}: { 
    devRoadmapText: string;
    roadmapText?: string;
    triggerButton?: boolean;
    buttonClassName?: string;
}) {
    return (
        <WhatsNewModal 
            roadmapText={roadmapText}
            devRoadmapText={devRoadmapText}
            userRole="ADMIN"
            initialTab="dev"
            triggerButton={triggerButton}
            buttonClassName={buttonClassName}
            triggerVariant="dev"
        />
    );
}
