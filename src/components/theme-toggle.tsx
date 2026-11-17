"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
  variant?: "sidebar" | "compact";
  className?: string;
}

export function ThemeToggle({ variant = "sidebar", className }: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const current = mounted ? (theme || "dark") : "dark";

  const cycleTheme = () => {
    if (current === "dark") setTheme("light");
    else if (current === "light") setTheme("system");
    else setTheme("dark");
  };

  const label =
    current === "light"
      ? "Light Mode"
      : current === "system"
      ? "System Theme"
      : "Dark Mode";

  const Icon =
    current === "light" ? Sun : current === "system" ? Monitor : Moon;

  if (variant === "compact") {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={cycleTheme}
        className={cn(
          "h-8 sm:h-9 px-2.5 gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg cursor-pointer touch-manipulation",
          className
        )}
        title={`Theme: ${label} (click to switch)`}
        aria-label={`Switch theme (current: ${label})`}
      >
        <Icon className="h-4 w-4 shrink-0 text-amber-500 dark:text-amber-400" />
        <span className="hidden sm:inline">{current === "light" ? "Light" : current === "system" ? "Auto" : "Dark"}</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={cycleTheme}
      className={cn(
        "w-full justify-between text-xs font-semibold h-9 px-2.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors rounded-lg cursor-pointer select-none touch-manipulation",
        className
      )}
      title={`Theme: ${label} (click to cycle Dark / Light / System)`}
      aria-label={`Switch theme (current: ${label})`}
    >
      <span className="flex items-center gap-2.5 min-w-0">
        <Icon className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <span className="truncate">{label}</span>
      </span>
      <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-muted text-muted-foreground border border-border/60 shrink-0">
        {current}
      </span>
    </Button>
  );
}
