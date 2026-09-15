"use client";

import { useState, useEffect } from "react";
import { 
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sparkles, ArrowRight, CheckCircle2, Rocket } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import Link from "next/link";

interface WhatsNewModalProps {
    roadmapText: string;
    triggerButton?: boolean;
    buttonClassName?: string;
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

export default function WhatsNewModal({ 
    roadmapText, 
    triggerButton = true,
    buttonClassName
}: WhatsNewModalProps) {
    const [open, setOpen] = useState(false);
    const [hasUnseenUpdate, setHasUnseenUpdate] = useState(false);

    useEffect(() => {
        if (!roadmapText || roadmapText.trim() === "") return;

        try {
            const currentHash = simpleHash(roadmapText.trim());
            const storedHash = localStorage.getItem("portalarr_last_seen_roadmap");

            if (storedHash !== currentHash) {
                setHasUnseenUpdate(true);
                // Open popup automatically for the user on first visit after update
                setOpen(true);
            }
        } catch (e) {
            console.warn("Could not access localStorage for update check:", e);
        }
    }, [roadmapText]);

    const handleDismiss = () => {
        setOpen(false);
        try {
            if (roadmapText) {
                const currentHash = simpleHash(roadmapText.trim());
                localStorage.setItem("portalarr_last_seen_roadmap", currentHash);
                setHasUnseenUpdate(false);
            }
        } catch (e) {}
    };

    return (
        <>
            {triggerButton && (
                <Button
                    onClick={() => setOpen(true)}
                    variant="outline"
                    size="sm"
                    className={buttonClassName || "h-8 px-3 text-xs font-semibold gap-1.5 rounded-full border-purple-500/40 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 hover:text-purple-200 hover:ring-2 hover:ring-purple-400/50 active:scale-95 transition-all shadow-sm"}
                >
                    <Sparkles className="h-3.5 w-3.5 text-purple-400 animate-pulse" />
                    <span>What's New</span>
                    {hasUnseenUpdate && (
                        <span className="relative flex h-2 w-2 ml-0.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-purple-500"></span>
                        </span>
                    )}
                </Button>
            )}

            <Dialog open={open} onOpenChange={(val) => {
                if (!val) handleDismiss();
                else setOpen(true);
            }}>
                <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col bg-[#121218]/95 border-purple-500/30 backdrop-blur-xl shadow-2xl p-0 overflow-hidden">
                    {/* Header */}
                    <div className="p-5 sm:p-6 border-b border-border/40 bg-gradient-to-r from-purple-950/40 via-background to-blue-950/30">
                        <DialogHeader className="text-left space-y-2">
                            <div className="flex items-center gap-2">
                                <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px] font-bold uppercase tracking-wider py-0.5">
                                    <Rocket className="h-3 w-3 mr-1" /> Latest Updates
                                </Badge>
                                <span className="text-xs text-muted-foreground">Portalarr Ecosystem</span>
                            </div>
                            <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight flex items-center gap-2 text-foreground">
                                <Sparkles className="h-5 w-5 text-purple-400" /> What's New in Portalarr
                            </DialogTitle>
                            <DialogDescription className="text-xs sm:text-sm text-muted-foreground">
                                Discover the latest features, system improvements, and upcoming roadmap milestones.
                            </DialogDescription>
                        </DialogHeader>
                    </div>

                    {/* Scrollable Markdown Content */}
                    <div className="flex-1 overflow-y-auto p-5 sm:p-6 text-sm leading-relaxed space-y-4">
                        {roadmapText ? (
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
                                {roadmapText}
                            </ReactMarkdown>
                        ) : (
                            <div className="text-center py-8 text-muted-foreground text-sm">
                                All systems up to date. Check back soon for new release highlights!
                            </div>
                        )}
                    </div>

                    {/* Footer */}
                    <div className="p-4 sm:p-5 border-t border-border/40 bg-muted/10 flex flex-col sm:flex-row items-center justify-between gap-3">
                        <Button asChild variant="ghost" size="sm" className="text-xs text-purple-400 hover:text-purple-300 gap-1.5 order-2 sm:order-1">
                            <Link href="/beta">
                                <span>Explore Beta Services & Roadmap</span>
                                <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </Button>
                        <Button 
                            onClick={handleDismiss} 
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-500 text-white font-semibold px-5 gap-1.5 order-1 sm:order-2 w-full sm:w-auto shadow-md"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Got It</span>
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </>
    );
}
