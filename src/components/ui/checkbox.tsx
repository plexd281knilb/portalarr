"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "onChange"> {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
    ({ className, checked = false, onCheckedChange, disabled, id, ...props }, ref) => {
        return (
            <label
                htmlFor={id}
                className={cn(
                    "relative inline-flex items-center justify-center h-4 w-4 shrink-0 rounded border cursor-pointer transition-all duration-200 select-none",
                    checked
                        ? "bg-primary border-primary text-primary-foreground shadow-xs shadow-primary/30"
                        : "bg-background/80 border-border/60 hover:border-primary/50",
                    disabled && "opacity-50 cursor-not-allowed",
                    className
                )}
            >
                <input
                    type="checkbox"
                    id={id}
                    ref={ref}
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) => onCheckedChange && onCheckedChange(e.target.checked)}
                    className="sr-only"
                    {...props}
                />
                {checked && (
                    <Check className="h-3 w-3 text-primary-foreground stroke-[3]" />
                )}
            </label>
        );
    }
);

Checkbox.displayName = "Checkbox";
