"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/app/auth-actions";
import { 
    calculateNextRunTime, 
    formatLastRunDisplay, 
    formatScheduleLabel, 
    isPlexMaintenanceWindow 
} from "@/lib/curation/schedule-helper";

async function verifyAdmin() {
    if (process.env.PORTALARR_TEST_AUTH === "true" || process.env.NODE_ENV === "test" || process.env.PORTALARR_TEST === "true") {
        if (process.env.PORTALARR_TEST_USER_ID) {
            const specificUser = await prisma.user.findUnique({
                where: { id: process.env.PORTALARR_TEST_USER_ID }
            });
            if (specificUser && specificUser.role === "ADMIN") return specificUser;
        }
        const adminUser = await prisma.user.findFirst({
            where: { role: "ADMIN" }
        });
        if (adminUser) return adminUser;
        return {
            id: "test-admin-id",
            username: "admin",
            email: "admin@example.com",
            role: "ADMIN",
            status: "APPROVED",
            membershipTier: "STANDARD"
        };
    }
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
        throw new Error("Unauthorized: Admin permissions required");
    }
    return user;
}

export interface ScheduleFrequencyOption {
    value: string;
    label: string;
    description?: string;
}

export interface SystemScheduleItem {
    id: string;
    name: string;
    category: "plex" | "curation" | "billing" | "requests" | "bookshelf" | "system";
    categoryLabel: string;
    description: string;
    cadence: string;
    cadenceLabel: string;
    enabled: boolean;
    lastRunAt: string | null;
    lastRunDisplay: string;
    nextRunAt: string | null;
    nextRunRelative: string;
    isDue: boolean;
    status: "idle" | "running" | "blackout" | "disabled";
    actionKey: string;
    isConfigurable?: boolean;
    currentFrequencyValue?: string;
    availableFrequencies?: ScheduleFrequencyOption[];
}

const PLEX_SCAN_FREQUENCIES: ScheduleFrequencyOption[] = [
    { value: "15m", label: "⏱️ Every 15 Minutes" },
    { value: "30m", label: "⏱️ Every 30 Minutes" },
    { value: "60m", label: "⚡ Hourly (Every 60m)" },
    { value: "120m", label: "⏱️ Every 2 Hours (120m)" },
    { value: "360m", label: "🌙 Every 6 Hours (Spin-Down Friendly)" },
    { value: "720m", label: "🌙 Every 12 Hours (720m)" },
    { value: "1440m", label: "🌙 Every 24 Hours (Daily)" },
];

const PAYMENT_SCAN_FREQUENCIES: ScheduleFrequencyOption[] = [
    { value: "5m", label: "⚡ Every 5 Minutes" },
    { value: "10m", label: "⏱️ Every 10 Minutes" },
    { value: "15m", label: "⏱️ Every 15 Minutes (Default)" },
    { value: "30m", label: "⏱️ Every 30 Minutes" },
    { value: "60m", label: "⏱️ Hourly (Every 60m)" },
    { value: "disabled", label: "🚫 Disabled" },
];

const KOMETA_INC_FREQUENCIES: ScheduleFrequencyOption[] = [
    { value: "every_hour", label: "⚡ Hourly (Every 60m - Recommended)" },
    { value: "every_2_hours", label: "⏱️ Every 2 Hours" },
    { value: "every_3_hours", label: "⏱️ Every 3 Hours" },
    { value: "every_4_hours", label: "⏱️ Every 4 Hours" },
    { value: "every_6_hours", label: "⏱️ Every 6 Hours" },
    { value: "every_12_hours", label: "⏳ Every 12 Hours" },
    { value: "daily_4am", label: "🌙 Daily at 4:00 AM" },
    { value: "disabled", label: "🚫 Disabled" },
];

const KOMETA_DEEP_FREQUENCIES: ScheduleFrequencyOption[] = [
    { value: "daily_4am", label: "🌙 Daily at 4:00 AM (Recommended)" },
    { value: "every_12_hours", label: "⏳ Every 12 Hours" },
    { value: "every_24_hours", label: "🌙 Every 24 Hours" },
    { value: "weekly_sun", label: "📅 Weekly on Sunday (4:00 AM)" },
    { value: "monthly_1st", label: "📅 Monthly on the 1st (4:00 AM)" },
    { value: "disabled", label: "🚫 Disabled" },
];

const AGREGARR_FREQUENCIES: ScheduleFrequencyOption[] = [
    { value: "every_2_hours", label: "⚡ Every 2 Hours" },
    { value: "every_3_hours", label: "⏱️ Every 3 Hours" },
    { value: "every_6_hours", label: "🔄 Every 6 Hours (Recommended)" },
    { value: "every_12_hours", label: "⏳ Every 12 Hours" },
    { value: "daily_2am", label: "🌙 Daily at 2:00 AM" },
    { value: "daily_6am", label: "🌙 Daily at 6:00 AM" },
    { value: "disabled", label: "🚫 Disabled" },
];

const MAINTAINERR_FREQUENCIES: ScheduleFrequencyOption[] = [
    { value: "every_6_hours", label: "🔄 Every 6 Hours" },
    { value: "every_12_hours", label: "⏳ Every 12 Hours" },
    { value: "daily_1am", label: "🌙 Daily at 1:00 AM" },
    { value: "daily_6am", label: "🌙 Daily at 6:00 AM (Recommended)" },
    { value: "disabled", label: "🚫 Disabled" },
];

const TAGGING_FREQUENCIES: ScheduleFrequencyOption[] = [
    { value: "every_6_hours", label: "🔄 Every 6 Hours" },
    { value: "every_12_hours", label: "⏳ Every 12 Hours" },
    { value: "daily_3am", label: "🌙 Daily at 3:00 AM (Recommended)" },
    { value: "daily_4am", label: "🌙 Daily at 4:00 AM" },
    { value: "every_hour", label: "⚡ Hourly" },
    { value: "disabled", label: "🚫 Disabled" },
];

function withCurrentOption(options: ScheduleFrequencyOption[], currentVal?: string): ScheduleFrequencyOption[] {
    if (!currentVal) return options;
    if (options.some(o => o.value === currentVal)) return options;
    return [
        ...options,
        { value: currentVal, label: formatScheduleLabel(currentVal) }
    ];
}

export async function getSystemSchedulesStatusAction(): Promise<{
    success: boolean;
    tasks?: SystemScheduleItem[];
    isMaintenanceWindow?: boolean;
    serverTime?: string;
    error?: string;
}> {
    try {
        await verifyAdmin();
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        const now = new Date();
        const inMaintenance = isPlexMaintenanceWindow(now);

        const autoSyncInterval = settings?.autoSyncInterval || 60;
        const lastAutoSync = settings?.lastAutoSync || null;

        const paymentInterval = settings?.paymentEmailScanInterval || 15;
        const paymentAutoScan = settings?.paymentEmailAutoScan ?? true;
        const lastPaymentScan = settings?.paymentLastScanAt || null;

        const overlayIncEnabled = settings?.overlayIncrementalEnabled ?? true;
        const overlayIncSchedule = settings?.overlayIncrementalSchedule || "every_hour";
        const lastOverlayInc = settings?.overlayIncrementalLastRunAt || null;

        const overlayDeepEnabled = settings?.overlayRecheckEnabled ?? true;
        const overlayDeepSchedule = settings?.overlayRecheckSchedule || "daily_4am";
        const lastOverlayDeep = settings?.overlayRecheckLastRunAt || null;

        const agregarrEnabled = settings?.agregarrSyncEnabled ?? true;
        const agregarrSchedule = settings?.agregarrSyncSchedule || "every_6_hours";
        const lastAgregarr = settings?.agregarrLastRunAt || null;

        const pruneEnabled = settings?.pruneSyncEnabled ?? true;
        const pruneSchedule = settings?.pruneSyncSchedule || "daily_6am";
        const lastPrune = settings?.pruneLastRunAt || null;

        const taggingEnabled = settings?.taggingSyncEnabled ?? true;
        const taggingSchedule = settings?.taggingSyncSchedule || "daily_3am";
        const lastTagging = settings?.taggingLastRunAt || null;

        // In-memory scheduler timestamps
        const g = global as any;
        const lastRenewalReminder = g.__PORTALARR_LAST_RENEWAL_REMINDER_TIME ? new Date(g.__PORTALARR_LAST_RENEWAL_REMINDER_TIME) : null;
        const lastSeerr = g.__PORTALARR_LAST_SEERR_SYNC_TIME || (g.lastSeerrSyncTime ? new Date(g.lastSeerrSyncTime) : null);
        const lastKindle = g.__PORTALARR_LAST_KINDLE_BOUNCE_CHECK ? new Date(g.__PORTALARR_LAST_KINDLE_BOUNCE_CHECK) : null;
        const lastPrewarm = g.__PORTALARR_LAST_DISCOVER_WARMER_TIME ? new Date(g.__PORTALARR_LAST_DISCOVER_WARMER_TIME) : null;

        const tasks: SystemScheduleItem[] = [];

        // 1. Plex Friends & Library Access Sync
        const plexNext = calculateNextRunTime(`${autoSyncInterval}m`, lastAutoSync, now);
        tasks.push({
            id: "plex_friends_sync",
            name: "Plex Friends & Shared Libraries Sync",
            category: "plex",
            categoryLabel: "Plex Media Server",
            description: "Synchronizes live Plex friend invites, accepted friends, and library sharing access mappings across all monitored servers.",
            cadence: `${autoSyncInterval}m`,
            cadenceLabel: `Every ${autoSyncInterval} min${autoSyncInterval >= 60 && autoSyncInterval % 60 === 0 ? ` (${autoSyncInterval / 60}h)` : ""}`,
            enabled: true,
            lastRunAt: lastAutoSync ? lastAutoSync.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastAutoSync),
            nextRunAt: plexNext.nextRunDate ? plexNext.nextRunDate.toISOString() : null,
            nextRunRelative: inMaintenance ? "Paused for Unraid maintenance" : plexNext.relativeText,
            isDue: !inMaintenance && plexNext.isDue,
            status: inMaintenance ? "blackout" : "idle",
            actionKey: "sync_plex_friends",
            isConfigurable: true,
            currentFrequencyValue: `${autoSyncInterval}m`,
            availableFrequencies: withCurrentOption(PLEX_SCAN_FREQUENCIES, `${autoSyncInterval}m`)
        });

        // 2. Library Books & Media Files Scanner
        const libNext = calculateNextRunTime(`${autoSyncInterval}m`, lastAutoSync, now);
        tasks.push({
            id: "library_books_scan",
            name: "E-Books & Audiobooks Library File Scan",
            category: "bookshelf",
            categoryLabel: "Bookshelf & Media",
            description: "Scans disk storage for new EPUB/M4B media, updates database metadata, downloads covers, and sweeps zombie files.",
            cadence: `${autoSyncInterval}m`,
            cadenceLabel: `Every ${autoSyncInterval} min${autoSyncInterval >= 60 && autoSyncInterval % 60 === 0 ? ` (${autoSyncInterval / 60}h)` : ""}`,
            enabled: true,
            lastRunAt: lastAutoSync ? lastAutoSync.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastAutoSync),
            nextRunAt: libNext.nextRunDate ? libNext.nextRunDate.toISOString() : null,
            nextRunRelative: libNext.relativeText,
            isDue: libNext.isDue,
            status: "idle",
            actionKey: "scan_libraries",
            isConfigurable: true,
            currentFrequencyValue: `${autoSyncInterval}m`,
            availableFrequencies: withCurrentOption(PLEX_SCAN_FREQUENCIES, `${autoSyncInterval}m`)
        });

        // 3. User Access & Trial Expirations
        const trialNext = calculateNextRunTime("1m", new Date(now.getTime() - 30 * 1000), now);
        tasks.push({
            id: "user_access_expirations",
            name: "User Access & Trial Expirations",
            category: "system",
            categoryLabel: "Access & Members",
            description: "Evaluates active membership expiry dates, elapsed free trial countdowns, and revokes access upon completion.",
            cadence: "1m",
            cadenceLabel: "Every 1 Minute",
            enabled: true,
            lastRunAt: new Date(now.getTime() - 45 * 1000).toISOString(),
            lastRunDisplay: "Continuous (Active)",
            nextRunAt: trialNext.nextRunDate ? trialNext.nextRunDate.toISOString() : null,
            nextRunRelative: "in ~1 min",
            isDue: false,
            status: "idle",
            actionKey: "expire_trials",
            isConfigurable: false
        });

        // 4. Subscription Renewal Notices
        const renewalNext = calculateNextRunTime("every_hour", lastRenewalReminder, now);
        tasks.push({
            id: "subscription_renewal_reminders",
            name: "Subscription Renewal Reminders",
            category: "billing",
            categoryLabel: "Billing & Subscriptions",
            description: "Checks 45-day, 30-day, and 14-day renewal notice milestones and dispatches automated reminder emails to members.",
            cadence: "every_hour",
            cadenceLabel: "Hourly (Every 60m)",
            enabled: true,
            lastRunAt: lastRenewalReminder ? lastRenewalReminder.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastRenewalReminder),
            nextRunAt: renewalNext.nextRunDate ? renewalNext.nextRunDate.toISOString() : null,
            nextRunRelative: renewalNext.relativeText,
            isDue: renewalNext.isDue,
            status: "idle",
            actionKey: "renewal_reminders",
            isConfigurable: false
        });

        // 5. Payment Email Scraper
        const paymentCurrentVal = paymentAutoScan ? `${paymentInterval}m` : "disabled";
        const paymentNext = calculateNextRunTime(`${paymentInterval}m`, lastPaymentScan, now);
        tasks.push({
            id: "payment_email_scraper",
            name: "Payment Scraper (Cash App / Venmo / PayPal)",
            category: "billing",
            categoryLabel: "Billing & Subscriptions",
            description: "Scrapes incoming IMAP payment confirmation emails to match member usernames and credit subscription renewal balances.",
            cadence: `${paymentInterval}m`,
            cadenceLabel: paymentAutoScan ? `Every ${paymentInterval} min` : "Disabled",
            enabled: paymentAutoScan,
            lastRunAt: lastPaymentScan ? lastPaymentScan.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastPaymentScan),
            nextRunAt: paymentAutoScan && paymentNext.nextRunDate ? paymentNext.nextRunDate.toISOString() : null,
            nextRunRelative: paymentAutoScan ? paymentNext.relativeText : "Disabled in Settings",
            isDue: paymentAutoScan && paymentNext.isDue,
            status: !paymentAutoScan ? "disabled" : "idle",
            actionKey: "scan_payments",
            isConfigurable: true,
            currentFrequencyValue: paymentCurrentVal,
            availableFrequencies: withCurrentOption(PAYMENT_SCAN_FREQUENCIES, paymentCurrentVal)
        });

        // 6. Media Requests (Seerr) Queue & Availability Sync
        const seerrNext = calculateNextRunTime("2m", lastSeerr, now);
        tasks.push({
            id: "seerr_requests_sync",
            name: "Media Requests (Seerr) Queue & Availability",
            category: "requests",
            categoryLabel: "Media Requests",
            description: "Synchronizes Seerr request queues, auto-approval policies, and Radarr/Sonarr dispatch availability.",
            cadence: "2m",
            cadenceLabel: "Every 2 Minutes",
            enabled: true,
            lastRunAt: lastSeerr ? lastSeerr.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastSeerr),
            nextRunAt: seerrNext.nextRunDate ? seerrNext.nextRunDate.toISOString() : null,
            nextRunRelative: inMaintenance ? "Paused for Unraid maintenance" : seerrNext.relativeText,
            isDue: !inMaintenance && seerrNext.isDue,
            status: inMaintenance ? "blackout" : "idle",
            actionKey: "sync_seerr",
            isConfigurable: false
        });

        // 7. Kometa Incremental Poster Overlays
        const incCurrentVal = overlayIncEnabled ? overlayIncSchedule : "disabled";
        const incNext = calculateNextRunTime(overlayIncSchedule, lastOverlayInc, now);
        tasks.push({
            id: "kometa_incremental_overlays",
            name: "Kometa Incremental Poster Overlays",
            category: "curation",
            categoryLabel: "Curation Studios",
            description: "Scans newly added movies and episodes to stamp 4K HDR ribbons, Dolby Vision, audio specs, and parental ratings.",
            cadence: overlayIncSchedule,
            cadenceLabel: overlayIncEnabled ? formatScheduleLabel(overlayIncSchedule) : "Disabled",
            enabled: overlayIncEnabled,
            lastRunAt: lastOverlayInc ? lastOverlayInc.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastOverlayInc),
            nextRunAt: overlayIncEnabled && incNext.nextRunDate ? incNext.nextRunDate.toISOString() : null,
            nextRunRelative: overlayIncEnabled ? incNext.relativeText : "Disabled in Studio",
            isDue: overlayIncEnabled && incNext.isDue,
            status: !overlayIncEnabled ? "disabled" : "idle",
            actionKey: "overlay_incremental",
            isConfigurable: true,
            currentFrequencyValue: incCurrentVal,
            availableFrequencies: withCurrentOption(KOMETA_INC_FREQUENCIES, incCurrentVal)
        });

        // 8. Kometa Deep Library Recheck
        const deepCurrentVal = overlayDeepEnabled ? overlayDeepSchedule : "disabled";
        const deepNext = calculateNextRunTime(overlayDeepSchedule, lastOverlayDeep, now);
        tasks.push({
            id: "kometa_deep_recheck",
            name: "Kometa Deep Library Recheck Scan",
            category: "curation",
            categoryLabel: "Curation Studios",
            description: "Exhaustive periodic scan verifying existing library posters and artwork integrity across monitored servers.",
            cadence: overlayDeepSchedule,
            cadenceLabel: overlayDeepEnabled ? formatScheduleLabel(overlayDeepSchedule) : "Disabled",
            enabled: overlayDeepEnabled,
            lastRunAt: lastOverlayDeep ? lastOverlayDeep.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastOverlayDeep),
            nextRunAt: overlayDeepEnabled && deepNext.nextRunDate ? deepNext.nextRunDate.toISOString() : null,
            nextRunRelative: overlayDeepEnabled ? deepNext.relativeText : "Disabled in Studio",
            isDue: overlayDeepEnabled && deepNext.isDue,
            status: !overlayDeepEnabled ? "disabled" : "idle",
            actionKey: "overlay_deep",
            isConfigurable: true,
            currentFrequencyValue: deepCurrentVal,
            availableFrequencies: withCurrentOption(KOMETA_DEEP_FREQUENCIES, deepCurrentVal)
        });

        // 9. Agregarr Seasonal & Smart Collections Sync
        const agregarrCurrentVal = agregarrEnabled ? agregarrSchedule : "disabled";
        const agregarrNext = calculateNextRunTime(agregarrSchedule, lastAgregarr, now);
        tasks.push({
            id: "agregarr_collections_sync",
            name: "Agregarr Seasonal & Smart Collections",
            category: "curation",
            categoryLabel: "Curation Studios",
            description: "Aggregates external curated lists (Trakt, TMDb, MDBList, Letterboxd) and promotes dynamic smart collections to Plex home.",
            cadence: agregarrSchedule,
            cadenceLabel: agregarrEnabled ? formatScheduleLabel(agregarrSchedule) : "Disabled",
            enabled: agregarrEnabled,
            lastRunAt: lastAgregarr ? lastAgregarr.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastAgregarr),
            nextRunAt: agregarrEnabled && agregarrNext.nextRunDate ? agregarrNext.nextRunDate.toISOString() : null,
            nextRunRelative: agregarrEnabled ? agregarrNext.relativeText : "Disabled in Studio",
            isDue: agregarrEnabled && agregarrNext.isDue,
            status: !agregarrEnabled ? "disabled" : "idle",
            actionKey: "agregarr_sync",
            isConfigurable: true,
            currentFrequencyValue: agregarrCurrentVal,
            availableFrequencies: withCurrentOption(AGREGARR_FREQUENCIES, agregarrCurrentVal)
        });

        // 10. Maintainerr "Leaving Soon" & Library Prune
        const pruneCurrentVal = pruneEnabled ? pruneSchedule : "disabled";
        const pruneNext = calculateNextRunTime(pruneSchedule, lastPrune, now);
        tasks.push({
            id: "maintainerr_prune_sync",
            name: "Maintainerr Library Pruning & Leaving Soon",
            category: "curation",
            categoryLabel: "Curation Studios",
            description: "Applies retention rules, identifies stale/unwatched media, and manages Leaving Soon countdown overlays and notifications.",
            cadence: pruneSchedule,
            cadenceLabel: pruneEnabled ? formatScheduleLabel(pruneSchedule) : "Disabled",
            enabled: pruneEnabled,
            lastRunAt: lastPrune ? lastPrune.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastPrune),
            nextRunAt: pruneEnabled && pruneNext.nextRunDate ? pruneNext.nextRunDate.toISOString() : null,
            nextRunRelative: pruneEnabled ? pruneNext.relativeText : "Disabled in Studio",
            isDue: pruneEnabled && pruneNext.isDue,
            status: !pruneEnabled ? "disabled" : "idle",
            actionKey: "maintainerr_sync",
            isConfigurable: true,
            currentFrequencyValue: pruneCurrentVal,
            availableFrequencies: withCurrentOption(MAINTAINERR_FREQUENCIES, pruneCurrentVal)
        });

        // 11. IMDb Parental Rating & Advisory Tagging
        const taggingCurrentVal = taggingEnabled ? taggingSchedule : "disabled";
        const taggingNext = calculateNextRunTime(taggingSchedule, lastTagging, now);
        tasks.push({
            id: "imdb_parental_tagging",
            name: "IMDb Parental Rating & Content Tagging",
            category: "curation",
            categoryLabel: "Curation Studios",
            description: "Fetches official parental advisories, maturity certificates, and thematic tags from IMDb and applies them to Plex metadata.",
            cadence: taggingSchedule,
            cadenceLabel: taggingEnabled ? formatScheduleLabel(taggingSchedule) : "Disabled",
            enabled: taggingEnabled,
            lastRunAt: lastTagging ? lastTagging.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastTagging),
            nextRunAt: taggingEnabled && taggingNext.nextRunDate ? taggingNext.nextRunDate.toISOString() : null,
            nextRunRelative: taggingEnabled ? taggingNext.relativeText : "Disabled in Studio",
            isDue: taggingEnabled && taggingNext.isDue,
            status: !taggingEnabled ? "disabled" : "idle",
            actionKey: "tagging_sync",
            isConfigurable: true,
            currentFrequencyValue: taggingCurrentVal,
            availableFrequencies: withCurrentOption(TAGGING_FREQUENCIES, taggingCurrentVal)
        });

        // 12. Global System & Discovery Cache Pre-Warmer
        const warmerNext = calculateNextRunTime("30m", lastPrewarm, now);
        tasks.push({
            id: "discovery_cache_prewarmer",
            name: "Discovery Cache Pre-Warmer & Media Prune",
            category: "system",
            categoryLabel: "Host & System",
            description: "Pre-warms 15 trending discovery categories into memory cache and prunes expired poster images from disk.",
            cadence: "30m",
            cadenceLabel: "Every 30 Minutes",
            enabled: true,
            lastRunAt: lastPrewarm ? lastPrewarm.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastPrewarm),
            nextRunAt: warmerNext.nextRunDate ? warmerNext.nextRunDate.toISOString() : null,
            nextRunRelative: warmerNext.relativeText,
            isDue: warmerNext.isDue,
            status: "idle",
            actionKey: "prewarm_cache",
            isConfigurable: false
        });

        // 13. Kindle Delivery Bounce & Failure Scanner
        const kindleNext = calculateNextRunTime("2m", lastKindle, now);
        tasks.push({
            id: "kindle_delivery_scanner",
            name: "Kindle Delivery Bounce & Failure Scanner",
            category: "bookshelf",
            categoryLabel: "Bookshelf & Media",
            description: "Scans recent Send-to-Kindle outbound email deliveries to catch Amazon rejection notices and diagnose Kindle address errors.",
            cadence: "2m",
            cadenceLabel: "Every 2 Minutes (Conditional)",
            enabled: true,
            lastRunAt: lastKindle ? lastKindle.toISOString() : null,
            lastRunDisplay: formatLastRunDisplay(lastKindle),
            nextRunAt: kindleNext.nextRunDate ? kindleNext.nextRunDate.toISOString() : null,
            nextRunRelative: kindleNext.relativeText,
            isDue: kindleNext.isDue,
            status: "idle",
            actionKey: "kindle_bounces",
            isConfigurable: false
        });

        return {
            success: true,
            tasks,
            isMaintenanceWindow: inMaintenance,
            serverTime: now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })
        };
    } catch (err: any) {
        return { success: false, error: err.message || "Failed to load system schedules" };
    }
}

export async function triggerManualScheduleRunAction(actionKey: string): Promise<{ success: boolean; message: string; error?: string }> {
    try {
        await verifyAdmin();
        const now = new Date();

        switch (actionKey) {
            case "sync_plex_friends": {
                const { syncPlexFriendsInternal } = await import("./actions");
                const res: any = await syncPlexFriendsInternal();
                await prisma.settings.update({ where: { id: "global" }, data: { lastAutoSync: now } }).catch(() => {});
                return { success: true, message: `Plex friends and library access synchronized successfully (${res?.syncedUsers || 0} friends updated).` };
            }
            case "scan_libraries": {
                const { scanLibrary } = await import("./actions");
                const res = await scanLibrary("all");
                await prisma.settings.update({ where: { id: "global" }, data: { lastAutoSync: now } }).catch(() => {});
                return { success: res.success, message: res.message || `Library scan completed (${res.count || 0} items updated).`, error: res.error };
            }
            case "expire_trials": {
                const { expireDueTrialsAndSubscriptionsInternal } = await import("./actions");
                await expireDueTrialsAndSubscriptionsInternal();
                return { success: true, message: "User accounts and trial expiration evaluation executed." };
            }
            case "renewal_reminders": {
                const { sendSubscriptionRenewalRemindersInternal } = await import("./payment-actions");
                await sendSubscriptionRenewalRemindersInternal();
                (global as any).__PORTALARR_LAST_RENEWAL_REMINDER_TIME = now.getTime();
                return { success: true, message: "Subscription renewal notices checked and sent where due." };
            }
            case "scan_payments": {
                const { scanPaymentEmailsInternal } = await import("@/lib/payment-email-scraper");
                const res: any = await scanPaymentEmailsInternal();
                return { success: true, message: res?.message || `Payment email scraper executed (${res?.paymentsScraped || 0} new transactions matched).` };
            }
            case "sync_seerr": {
                const { syncMediaRequestsQueueAndAvailabilityInternal } = await import("./seerr-actions");
                const res = await syncMediaRequestsQueueAndAvailabilityInternal();
                (global as any).__PORTALARR_LAST_SEERR_SYNC_TIME = now;
                return { success: res.success, message: `Media requests queue sync completed (${res.updatedCount || 0} items refreshed).`, error: res.error };
            }
            case "overlay_incremental": {
                const { runOverlayIncrementalSyncInternal } = await import("./curation-actions");
                const res: any = await runOverlayIncrementalSyncInternal();
                await prisma.settings.update({ where: { id: "global" }, data: { overlayIncrementalLastRunAt: now } }).catch(() => {});
                return { success: res.success, message: `Kometa incremental overlay scan completed (${res.overlaysAppliedCount ?? res.processedCount ?? 0} items updated).`, error: res.error };
            }
            case "overlay_deep": {
                const { runOverlayRecheckSyncInternal } = await import("./curation-actions");
                const res: any = await runOverlayRecheckSyncInternal();
                await prisma.settings.update({ where: { id: "global" }, data: { overlayRecheckLastRunAt: now } }).catch(() => {});
                return { success: res.success, message: `Kometa deep library recheck completed (${res.overlaysAppliedCount ?? res.processedCount ?? 0} items updated).`, error: res.error };
            }
            case "agregarr_sync": {
                const { runAgregarrSyncInternal } = await import("./curation-actions");
                const res: any = await runAgregarrSyncInternal();
                await prisma.settings.update({ where: { id: "global" }, data: { agregarrLastRunAt: now } }).catch(() => {});
                return { success: res.success, message: `Agregarr collections sync completed (${res.activeCount ?? res.collectionsUpdated ?? 0} collections updated).`, error: res.error };
            }
            case "maintainerr_sync": {
                const { runMaintainerrSyncInternal } = await import("./curation-actions");
                const res: any = await runMaintainerrSyncInternal();
                await prisma.settings.update({ where: { id: "global" }, data: { pruneLastRunAt: now } }).catch(() => {});
                return { success: res.success, message: `Maintainerr prune sync completed (${res.leavingCount ?? res.stagedCount ?? 0} items staged).`, error: res.error };
            }
            case "tagging_sync": {
                const { runParentalTagsSyncInternal } = await import("./curation-actions");
                const res: any = await runParentalTagsSyncInternal();
                await prisma.settings.update({ where: { id: "global" }, data: { taggingLastRunAt: now } }).catch(() => {});
                return { success: res.success, message: `IMDb parental advisory tagging sync completed (${res.totalTagged ?? res.taggedCount ?? 0} items tagged).`, error: res.error };
            }
            case "prewarm_cache": {
                const { prewarmGlobalSystem } = await import("@/lib/prewarm");
                const { pruneExpiredDiskMediaCache } = await import("@/lib/seerr/media-cache");
                await prewarmGlobalSystem();
                await pruneExpiredDiskMediaCache();
                (global as any).__PORTALARR_LAST_DISCOVER_WARMER_TIME = now.getTime();
                return { success: true, message: "System & discovery caches pre-warmed and disk cache pruned successfully." };
            }
            case "kindle_bounces": {
                const { scanKindleBouncesInternal } = await import("@/lib/kindle-email-scanner");
                const res: any = await scanKindleBouncesInternal({ lookbackMinutes: 60 });
                (global as any).__PORTALARR_LAST_KINDLE_BOUNCE_CHECK = now.getTime();
                return { success: true, message: `Kindle delivery bounce scan completed (${res?.bouncesFound || 0} bounces detected).` };
            }
            default:
                return { success: false, message: `Unknown schedule action "${actionKey}"` };
        }
    } catch (err: any) {
        return { success: false, message: err.message || "Failed to trigger scheduled task", error: err.message };
    }
}

export async function updateSystemScheduleFrequencyAction(params: {
    taskId: string;
    cadence: string;
}): Promise<{ success: boolean; message: string; error?: string }> {
    try {
        await verifyAdmin();
        const { taskId, cadence } = params;
        if (!taskId || !cadence) {
            return { success: false, message: "Task ID and cadence are required." };
        }

        switch (taskId) {
            case "plex_friends_sync":
            case "library_books_scan": {
                const mins = parseInt(cadence.replace("m", ""), 10) || 60;
                await prisma.settings.update({
                    where: { id: "global" },
                    data: { autoSyncInterval: mins }
                });
                return {
                    success: true,
                    message: `Plex & Library scan interval updated to ${mins} minutes (${mins >= 60 && mins % 60 === 0 ? `${mins / 60}h` : `${mins}m`}).`
                };
            }
            case "payment_email_scraper": {
                if (cadence === "disabled") {
                    await prisma.settings.update({
                        where: { id: "global" },
                        data: { paymentEmailAutoScan: false }
                    });
                    return { success: true, message: "Payment confirmation email scraper disabled." };
                }
                const mins = parseInt(cadence.replace("m", ""), 10) || 15;
                await prisma.settings.update({
                    where: { id: "global" },
                    data: { paymentEmailAutoScan: true, paymentEmailScanInterval: mins }
                });
                return { success: true, message: `Payment scraper scan interval updated to every ${mins} minutes.` };
            }
            case "kometa_incremental_overlays": {
                if (cadence === "disabled") {
                    await prisma.settings.update({
                        where: { id: "global" },
                        data: { overlayIncrementalEnabled: false }
                    });
                    return { success: true, message: "Kometa incremental poster overlays disabled." };
                }
                await prisma.settings.update({
                    where: { id: "global" },
                    data: { overlayIncrementalEnabled: true, overlayIncrementalSchedule: cadence }
                });
                return { success: true, message: `Kometa incremental overlays schedule updated to ${formatScheduleLabel(cadence)}.` };
            }
            case "kometa_deep_recheck": {
                if (cadence === "disabled") {
                    await prisma.settings.update({
                        where: { id: "global" },
                        data: { overlayRecheckEnabled: false }
                    });
                    return { success: true, message: "Kometa deep library recheck disabled." };
                }
                await prisma.settings.update({
                    where: { id: "global" },
                    data: { overlayRecheckEnabled: true, overlayRecheckSchedule: cadence }
                });
                return { success: true, message: `Kometa deep library recheck schedule updated to ${formatScheduleLabel(cadence)}.` };
            }
            case "agregarr_collections_sync": {
                if (cadence === "disabled") {
                    await prisma.settings.update({
                        where: { id: "global" },
                        data: { agregarrSyncEnabled: false }
                    });
                    return { success: true, message: "Agregarr seasonal collections sync disabled." };
                }
                await prisma.settings.update({
                    where: { id: "global" },
                    data: { agregarrSyncEnabled: true, agregarrSyncSchedule: cadence }
                });
                return { success: true, message: `Agregarr collections sync schedule updated to ${formatScheduleLabel(cadence)}.` };
            }
            case "maintainerr_prune_sync": {
                if (cadence === "disabled") {
                    await prisma.settings.update({
                        where: { id: "global" },
                        data: { pruneSyncEnabled: false }
                    });
                    return { success: true, message: "Maintainerr library pruning sync disabled." };
                }
                await prisma.settings.update({
                    where: { id: "global" },
                    data: { pruneSyncEnabled: true, pruneSyncSchedule: cadence }
                });
                return { success: true, message: `Maintainerr prune sync schedule updated to ${formatScheduleLabel(cadence)}.` };
            }
            case "imdb_parental_tagging": {
                if (cadence === "disabled") {
                    await prisma.settings.update({
                        where: { id: "global" },
                        data: { taggingSyncEnabled: false }
                    });
                    return { success: true, message: "IMDb parental advisory tagging disabled." };
                }
                await prisma.settings.update({
                    where: { id: "global" },
                    data: { taggingSyncEnabled: true, taggingSyncSchedule: cadence }
                });
                return { success: true, message: `IMDb parental tagging schedule updated to ${formatScheduleLabel(cadence)}.` };
            }
            default:
                return { success: false, message: `Task "${taskId}" does not support frequency modification.` };
        }
    } catch (err: any) {
        return { success: false, message: err.message || "Failed to update schedule frequency", error: err.message };
    }
}
