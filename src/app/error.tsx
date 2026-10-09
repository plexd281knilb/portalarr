"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle, RefreshCw } from "lucide-react";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Next.js app boundary caught error:", error);
    }, [error]);

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 space-y-4 text-center">
            <div className="p-3.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20">
                <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-1.5">
                <h2 className="text-xl font-bold tracking-tight">Something went wrong</h2>
                <p className="text-sm text-muted-foreground max-w-md leading-relaxed">
                    {error?.message || "An unexpected error occurred while rendering this view."}
                </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
                <Button
                    onClick={() => reset()}
                    className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold"
                >
                    <RefreshCw className="h-3.5 w-3.5" /> Try Again
                </Button>
                <Button
                    variant="outline"
                    onClick={() => window.location.href = "/"}
                    className="text-xs"
                >
                    Return to Dashboard
                </Button>
            </div>
        </div>
    );
}
