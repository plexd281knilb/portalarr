"use client";

import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { Wrench, Sparkles, X } from "lucide-react";
import { SuggestFixModal } from "@/components/suggest-fix-modal";

export interface FloatingSuggestFixLauncherProps {
    userRole?: string;
    username?: string;
}

export function FloatingSuggestFixLauncher({ userRole = "USER", username = "Member" }: FloatingSuggestFixLauncherProps) {
    const pathname = usePathname();
    const [dismissed, setDismissed] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);

    useEffect(() => {
        const handleOpenEvent = () => setModalOpen(true);
        window.addEventListener("open-suggest-fix", handleOpenEvent);
        return () => window.removeEventListener("open-suggest-fix", handleOpenEvent);
    }, []);

    if (dismissed) return null;

    // Do not show on auth or pending pages
    if (pathname === "/login" || pathname === "/pending" || pathname.startsWith("/join")) {
        return null;
    }

    return (
        <>
            <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-4 sm:bottom-20 sm:right-6 z-40 flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <button
                    type="button"
                    onClick={() => setModalOpen(true)}
                    className="group flex items-center gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-full bg-card/95 hover:bg-accent text-foreground font-semibold text-xs shadow-lg border border-amber-500/40 hover:border-amber-500/70 backdrop-blur-md transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer ring-1 ring-amber-500/20 hover:ring-amber-400/40"
                    title="Suggest a page fix or feature improvement"
                >
                    <div className="p-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-300 group-hover:rotate-12 transition-transform duration-200">
                        <Wrench className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-amber-600 dark:text-amber-200" />
                    </div>
                    <span className="whitespace-nowrap">Suggest Fix</span>

                    <Sparkles className="h-3 w-3 text-amber-600 dark:text-amber-300 shrink-0" />
                </button>

                <button
                    type="button"
                    onClick={() => setDismissed(true)}
                    className="p-1.5 rounded-full bg-card/90 hover:bg-accent text-muted-foreground hover:text-foreground text-[10px] border border-border transition-colors cursor-pointer"
                    title="Hide Suggest Fix launcher"
                    aria-label="Hide Suggest Fix launcher"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>

            <SuggestFixModal
                open={modalOpen}
                onOpenChange={setModalOpen}
                userRole={userRole}
                username={username}
            />
        </>
    );
}

export default FloatingSuggestFixLauncher;
