import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
    icon: LucideIcon;
    title: string;
    description?: string;
    actionLabel?: string;
    onAction?: () => void;
    actionHref?: string;
    className?: string;
    compact?: boolean;
}

export function EmptyState({
    icon: Icon,
    title,
    description,
    actionLabel,
    onAction,
    actionHref,
    className,
    compact = false
}: EmptyStateProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center justify-center text-center rounded-lg border border-dashed border-border/70 bg-card/40",
                compact ? "px-4 py-6 gap-2.5" : "px-6 py-10 gap-3",
                className
            )}
        >
            <div
                className={cn(
                    "flex items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-400",
                    compact ? "h-9 w-9" : "h-11 w-11"
                )}
            >
                <Icon className={compact ? "h-4 w-4" : "h-5 w-5"} />
            </div>
            <div className="space-y-1 max-w-md">
                <p className={cn("font-semibold text-foreground", compact ? "text-xs" : "text-sm")}>
                    {title}
                </p>
                {description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        {description}
                    </p>
                )}
            </div>
            {actionLabel && onAction && (
                <Button type="button" variant="outline" size="sm" onClick={onAction} className="mt-1 text-xs">
                    {actionLabel}
                </Button>
            )}
            {actionLabel && !onAction && actionHref && (
                <Button asChild variant="outline" size="sm" className="mt-1 text-xs">
                    <Link href={actionHref}>{actionLabel}</Link>
                </Button>
            )}
        </div>
    );
}
