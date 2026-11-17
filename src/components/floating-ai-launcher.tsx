"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Bot, Sparkles, X } from "lucide-react";

export function FloatingAiLauncher() {
    const pathname = usePathname();
    const router = useRouter();
    const [dismissed, setDismissed] = useState(false);

    if (dismissed) return null;

    // Do not show on auth or pending pages
    if (pathname === "/login" || pathname === "/pending" || pathname.startsWith("/join")) {
        return null;
    }

    const handleClick = () => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("open-ai-assistant"));
        }
        if (pathname !== "/") {
            router.push("/?openAssistant=true");
        }
    };

    return (
        <div className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] right-4 sm:bottom-6 sm:right-6 z-40 flex items-center gap-1.5 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <button
                type="button"
                onClick={handleClick}
                className="group flex items-center gap-2 px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-full bg-card/95 hover:bg-accent text-foreground font-semibold text-xs sm:text-sm shadow-xl border border-amber-500/40 hover:border-amber-500/70 backdrop-blur-md transition-all duration-200 hover:scale-[1.03] active:scale-95 cursor-pointer ring-1 ring-amber-500/20 hover:ring-amber-400/40"
                title="Ask the 24/7 AI Server Assistant"
            >
                <div className="p-1 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 group-hover:rotate-12 transition-transform duration-200">
                    <Bot className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                </div>
                <span>Ask AI Assistant</span>
                <span className="flex h-2 w-2 relative shrink-0">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500 dark:bg-emerald-400" />
                </span>
            </button>

            <button
                type="button"
                onClick={() => setDismissed(true)}
                className="p-1.5 rounded-full bg-card/90 hover:bg-accent text-muted-foreground hover:text-foreground text-[10px] border border-border transition-colors cursor-pointer"
                title="Hide AI Assistant launcher"
                aria-label="Hide AI Assistant launcher"
            >
                <X className="h-3 w-3" />
            </button>
        </div>
    );
}

export default FloatingAiLauncher;
