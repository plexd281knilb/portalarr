/**
 * Portalarr Curation & Automation Schedule Helper
 * Provides human-friendly labels, duration calculations, and next run estimations
 * across Kometa, Agregarr, Maintainerr (Prune), and Tagging Studio.
 */

export interface ScheduleOption {
    value: string;
    label: string;
    description: string;
    recommendedFor?: string;
}

export const SCHEDULE_OPTIONS: ScheduleOption[] = [
    { value: "every_hour", label: "⚡ Hourly (Every 60 minutes)", description: "Runs once every hour", recommendedFor: "Fast incremental overlay scan" },
    { value: "every_2_hours", label: "⏱️ Every 2 Hours", description: "Runs every 2 hours" },
    { value: "every_3_hours", label: "⏱️ Every 3 Hours", description: "Runs every 3 hours" },
    { value: "every_4_hours", label: "⏱️ Every 4 Hours", description: "Runs every 4 hours" },
    { value: "every_6_hours", label: "🔄 Every 6 Hours (Recommended for Agregarr)", description: "Runs 4 times a day", recommendedFor: "Agregarr seasonal collections" },
    { value: "every_12_hours", label: "⏳ Every 12 Hours (Twice Daily)", description: "Runs every 12 hours" },
    { value: "every_24_hours", label: "🌙 Every 24 Hours", description: "Runs once every 24 hours" },
    { value: "daily_1am", label: "🌙 Daily at 1:00 AM", description: "Runs every night at 1:00 AM" },
    { value: "daily_2am", label: "🌙 Daily at 2:00 AM", description: "Runs every night at 2:00 AM" },
    { value: "daily_3am", label: "🌙 Daily at 3:00 AM (Recommended for Tagging)", description: "Runs every night at 3:00 AM", recommendedFor: "IMDb parental tagging" },
    { value: "daily_4am", label: "🌙 Daily at 4:00 AM (Recommended for Deep Overlays)", description: "Runs every night at 4:00 AM", recommendedFor: "Kometa deep library recheck" },
    { value: "daily_5am", label: "🌙 Daily at 5:00 AM (Recommended for Maintainerr)", description: "Runs every night at 5:00 AM", recommendedFor: "Maintainerr Leaving Soon sync" },
    { value: "daily_6am", label: "🌙 Daily at 6:00 AM", description: "Runs every morning at 6:00 AM" },
    { value: "weekly_sun", label: "📅 Weekly on Sunday (at 4:00 AM)", description: "Runs every Sunday morning at 4:00 AM" },
    { value: "monthly_1st", label: "📅 Monthly on the 1st (at 4:00 AM)", description: "Runs on the 1st of every month at 4:00 AM" }
];

export function formatScheduleLabel(scheduleKey: string): string {
    const match = SCHEDULE_OPTIONS.find(o => o.value === scheduleKey);
    if (match) return match.label;
    if (!scheduleKey) return "Every 6 Hours";
    return scheduleKey
        .replace(/every_/g, "Every ")
        .replace(/daily_/g, "Daily at ")
        .replace(/_/g, " ");
}

export function calculateNextRunTime(
    scheduleKey: string,
    lastRunIsoOrDate?: string | Date | null
): { nextRunDate: Date | null; relativeText: string; isDue: boolean } {
    const now = new Date();
    const lastRun = lastRunIsoOrDate ? new Date(lastRunIsoOrDate) : null;
    const s = (scheduleKey || "every_6_hours").toLowerCase().trim();

    // 1. Hourly interval options
    const intervalMap: Record<string, number> = {
        "every_hour": 1,
        "hourly": 1,
        "1h": 1,
        "every_2_hours": 2,
        "2h": 2,
        "every_3_hours": 3,
        "3h": 3,
        "every_4_hours": 4,
        "4h": 4,
        "every_6_hours": 6,
        "6h": 6,
        "every_12_hours": 12,
        "12h": 12,
        "every_24_hours": 24,
        "24h": 24
    };

    if (intervalMap[s]) {
        const hours = intervalMap[s];
        const nextDate = lastRun 
            ? new Date(lastRun.getTime() + hours * 60 * 60 * 1000)
            : new Date(now.getTime() + 60 * 1000); // If never run, due shortly

        const diffMs = nextDate.getTime() - now.getTime();
        if (diffMs <= 0) {
            return { nextRunDate: nextDate, relativeText: "Due on next scheduler tick", isDue: true };
        }
        const diffMins = Math.round(diffMs / (60 * 1000));
        const diffHrs = Math.floor(diffMins / 60);
        const remMins = diffMins % 60;
        const relText = diffHrs > 0 ? `in ${diffHrs}h ${remMins}m` : `in ${diffMins} mins`;
        return { nextRunDate: nextDate, relativeText: relText, isDue: false };
    }

    // 2. Daily fixed hour options (daily_3am, daily_4am, daily_5am, etc.)
    let targetHour: number | null = null;
    if (s === "daily_1am") targetHour = 1;
    else if (s === "daily_2am") targetHour = 2;
    else if (s === "daily_3am" || s === "3am") targetHour = 3;
    else if (s === "daily_4am" || s === "4am") targetHour = 4;
    else if (s === "daily_5am" || s === "5am") targetHour = 5;
    else if (s === "daily_6am" || s === "6am") targetHour = 6;
    else if (s.startsWith("daily_")) {
        const match = s.match(/daily_(\d+)(am|pm)?/);
        if (match) {
            let h = parseInt(match[1], 10);
            if (match[2] === "pm" && h < 12) h += 12;
            if (match[2] === "am" && h === 12) h = 0;
            targetHour = h;
        }
    }

    if (targetHour !== null) {
        const nextDate = new Date(now);
        nextDate.setHours(targetHour, 0, 0, 0);

        // If target hour has passed today or already ran today during that hour, schedule for tomorrow
        if (now.getHours() >= targetHour || (lastRun && lastRun.toDateString() === now.toDateString())) {
            nextDate.setDate(nextDate.getDate() + 1);
        }

        const diffMs = nextDate.getTime() - now.getTime();
        const diffHours = Math.round(diffMs / (60 * 60 * 1000));
        return {
            nextRunDate: nextDate,
            relativeText: `in ~${diffHours} hrs (${nextDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })})`,
            isDue: diffMs <= 0
        };
    }

    // 3. Weekly Sunday at 4:00 AM
    if (s === "weekly_sun" || s === "weekly") {
        const nextDate = new Date(now);
        const dayOfWeek = nextDate.getDay(); // 0 = Sunday
        const daysUntilSunday = (7 - dayOfWeek) % 7 || 7;
        nextDate.setDate(nextDate.getDate() + daysUntilSunday);
        nextDate.setHours(4, 0, 0, 0);

        const diffMs = nextDate.getTime() - now.getTime();
        const diffDays = Math.ceil(diffMs / (24 * 60 * 60 * 1000));
        return {
            nextRunDate: nextDate,
            relativeText: `in ${diffDays} day${diffDays === 1 ? '' : 's'} (Sunday 4:00 AM)`,
            isDue: diffMs <= 0
        };
    }

    return { nextRunDate: null, relativeText: "Scheduled according to settings", isDue: false };
}

export function formatLastRunDisplay(lastRunIsoOrDate?: string | Date | null): string {
    if (!lastRunIsoOrDate) return "Never executed yet";
    const date = new Date(lastRunIsoOrDate);
    if (isNaN(date.getTime())) return "Never executed yet";

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (60 * 1000));
    const diffHrs = Math.floor(diffMins / 60);

    const timeStr = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (diffMins < 5) return "Just now";
    if (diffMins < 60) return `${diffMins} minutes ago (${timeStr})`;
    if (isToday) return `Today at ${timeStr} (${diffHrs}h ago)`;
    if (isYesterday) return `Yesterday at ${timeStr}`;
    return `${date.toLocaleDateString()} at ${timeStr}`;
}
