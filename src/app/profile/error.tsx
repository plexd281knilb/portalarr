"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { AlertCircle, LifeBuoy, RefreshCw } from "lucide-react";
import { getFriendlyErrorDisplay } from "@/lib/ui-errors";

export default function ProfileError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("[PROFILE] Error rendering profile page:", error);
    }, [error]);

    const display = getFriendlyErrorDisplay(error, "profile");

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 space-y-4 text-center">
            <div className="p-3.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
                <h2 className="text-xl font-bold tracking-tight">{display.title}</h2>
                <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    {display.description}
                </p>
                {display.digest && (
                    <p className="font-mono text-xs text-muted-foreground/80">
                        Reference ID: {display.digest}
                    </p>
                )}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Button
                    onClick={() => reset()}
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Try Again
                </Button>
                <Button asChild variant="outline" className="text-xs gap-1.5">
                    <Link href="/tickets">
                        <LifeBuoy className="h-3.5 w-3.5" /> Support
                    </Link>
                </Button>
                <Button
                    variant="ghost"
                    onClick={() => (window.location.href = "/")}
                    className="text-xs"
                >
                    Return to Dashboard
                </Button>
            </div>
        </div>
    );
}
