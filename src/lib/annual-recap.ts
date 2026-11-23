import prisma from "@/lib/prisma";
import { getAppUrl } from "@/lib/app-url";
import { decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { isPlexMaintenanceWindow } from "@/lib/curation/schedule-helper";
import { getNonProdAutomaticEmailBlockReason } from "@/lib/version";

const MONTH_NAMES = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
];

/**
 * Returns US Thanksgiving Day (the 4th Thursday of November) in local time for a given year.
 */
export function getThanksgivingDate(year: number): Date {
    const nov1 = new Date(year, 10, 1); // Month is 0-indexed (10 = November)
    const nov1Day = nov1.getDay(); // 0 = Sun .. 4 = Thu .. 6 = Sat
    const offsetToFirstThursday = (4 - nov1Day + 7) % 7;
    const fourthThursdayDay = 1 + offsetToFirstThursday + 21;
    return new Date(year, 10, fourthThursdayDay, 0, 0, 0, 0);
}

/**
 * Returns the Saturday immediately before US Thanksgiving (always 5 days prior, Nov 17–23).
 */
export function getSaturdayBeforeThanksgiving(year: number): Date {
    const thanksgiving = getThanksgivingDate(year);
    return new Date(year, 10, thanksgiving.getDate() - 5, 9, 0, 0, 0);
}

/**
 * Returns true if `now` falls within the automated dispatch window for the Saturday before Thanksgiving.
 * Window starts at 9:00 AM local time on that Saturday and extends through Sunday 11:59 PM
 * so a brief Saturday restart never skips the annual broadcast. Year-level deduplication
 * (`lastAnnualRecapYear`) ensures it fires at most once per calendar year.
 */
export function isAnnualRecapWindow(now: Date = new Date()): boolean {
    const year = now.getFullYear();
    const saturdayStart = getSaturdayBeforeThanksgiving(year);
    const windowEnd = new Date(
        year,
        saturdayStart.getMonth(),
        saturdayStart.getDate() + 1,
        23,
        59,
        59,
        999
    );
    return now.getTime() >= saturdayStart.getTime() && now.getTime() <= windowEnd.getTime();
}

/**
 * Computes the next upcoming Saturday-before-Thanksgiving date (or this year's if not yet completed).
 */
export function getNextAnnualRecapDate(now: Date = new Date(), lastSentYear?: number | null): Date {
    const year = now.getFullYear();
    const thisYearsSaturday = getSaturdayBeforeThanksgiving(year);
    const windowEnd = new Date(
        year,
        thisYearsSaturday.getMonth(),
        thisYearsSaturday.getDate() + 1,
        23,
        59,
        59,
        999
    );

    if (lastSentYear === year || now.getTime() > windowEnd.getTime()) {
        return getSaturdayBeforeThanksgiving(year + 1);
    }
    return thisYearsSaturday;
}

export interface ServerMediaCountsResult {
    movieCount: number;
    showCount: number;
    movieCountText: string;
    showCountText: string;
    source: "plex" | "snapshot" | "fallback";
}

/**
 * Fetches live movie and TV show counts from configured Plex servers (fast size=0 container queries)
 * with graceful SQLite snapshot and text fallbacks so emails never render "0 movies".
 */
export async function getServerMediaCounts(): Promise<ServerMediaCountsResult> {
    const formatCount = (n: number, fallbackWord: string) =>
        n > 0 ? n.toLocaleString("en-US") : fallbackWord;

    if (process.env.NODE_ENV === "test" || process.env.PORTALARR_TEST === "true") {
        return {
            movieCount: 0,
            showCount: 0,
            movieCountText: "thousands of",
            showCountText: "hundreds of",
            source: "fallback"
        };
    }

    if (!isPlexMaintenanceWindow()) {
        try {
            const settings = await prisma.settings.findFirst({ where: { id: "global" } });
            const mainToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
            const plexServers = await prisma.plexServer.findMany({
                where: { monitored: true },
                orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
            }).catch(() => []);

            const seenSectionKeys = new Set<string>();
            let movieCount = 0;
            let showCount = 0;

            for (const srv of plexServers) {
                const rawToken = srv.token ? decryptData(srv.token) : mainToken;
                const base = (srv.url || "").trim().replace(/\/+$/, "");
                if (!base || !rawToken) continue;

                try {
                    const secRes = await fetch(`${base}/library/sections?X-Plex-Token=${encodeURIComponent(rawToken)}`, {
                        headers: { Accept: "application/json" },
                        signal: AbortSignal.timeout(4000),
                        cache: "no-store"
                    });
                    if (!secRes.ok) continue;

                    const secJson = await secRes.json();
                    const dirs = secJson?.MediaContainer?.Directory || [];

                    for (const dir of dirs) {
                        const type = String(dir.type || "").toLowerCase();
                        if (type !== "movie" && type !== "show") continue;
                        const dedupKey = `${srv.clientIdentifier || srv.id}:${dir.key}:${type}`;
                        if (seenSectionKeys.has(dedupKey)) continue;
                        seenSectionKeys.add(dedupKey);

                        try {
                            const countRes = await fetch(
                                `${base}/library/sections/${encodeURIComponent(String(dir.key))}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=0&X-Plex-Token=${encodeURIComponent(rawToken)}`,
                                {
                                    headers: { Accept: "application/json" },
                                    signal: AbortSignal.timeout(4000),
                                    cache: "no-store"
                                }
                            );
                            if (!countRes.ok) continue;
                            const countJson = await countRes.json();
                            const totalSize = Number(countJson?.MediaContainer?.totalSize ?? countJson?.MediaContainer?.size ?? 0);
                            if (!isNaN(totalSize) && totalSize > 0) {
                                if (type === "movie") movieCount += totalSize;
                                else if (type === "show") showCount += totalSize;
                            }
                        } catch {
                            // Ignore individual section timeouts
                        }
                    }

                    if (movieCount > 0 || showCount > 0) {
                        return {
                            movieCount,
                            showCount,
                            movieCountText: formatCount(movieCount, "thousands of"),
                            showCountText: formatCount(showCount, "hundreds of"),
                            source: "plex"
                        };
                    }
                } catch {
                    // Try next server or snapshot fallback
                }
            }
        } catch {
            // Fall through to snapshot fallback
        }
    }

    // Fallback: inspect local Plex SQLite snapshot if configured
    try {
        const srvWithDb = await prisma.plexServer.findFirst({
            where: { databasePath: { not: null } },
            orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }]
        });
        if (srvWithDb?.databasePath) {
            const { resolvePlexDatabaseFilePath, inspectPlexDatabase } = await import("@/lib/curation/plex-snapshot-engine");
            const resolved = resolvePlexDatabaseFilePath(srvWithDb.databasePath);
            if (resolved) {
                const info = inspectPlexDatabase(resolved);
                if (info.success && (info.movieCount > 0 || info.showCount > 0)) {
                    return {
                        movieCount: info.movieCount,
                        showCount: info.showCount,
                        movieCountText: formatCount(info.movieCount, "thousands of"),
                        showCountText: formatCount(info.showCount, "hundreds of"),
                        source: "snapshot"
                    };
                }
            }
        }
    } catch {
        // Fall through to text fallback
    }

    return {
        movieCount: 0,
        showCount: 0,
        movieCountText: "thousands of",
        showCountText: "hundreds of",
        source: "fallback"
    };
}

/**
 * Formats configured payment providers into a clean human-readable list (e.g. "Venmo, PayPal, or Zelle").
 */
export function buildPaymentMethodsSummary(settings: {
    paymentVenmo?: string | null;
    paymentPaypal?: string | null;
    paymentZelle?: string | null;
    paymentCashApp?: string | null;
} | null | undefined): string {
    const methods: string[] = [];
    if (settings?.paymentVenmo?.trim()) methods.push(`Venmo (${settings.paymentVenmo.trim()})`);
    if (settings?.paymentPaypal?.trim()) methods.push(`PayPal (${settings.paymentPaypal.trim()})`);
    if (settings?.paymentZelle?.trim()) methods.push(`Zelle (${settings.paymentZelle.trim()})`);
    if (settings?.paymentCashApp?.trim()) methods.push(`Cash App (${settings.paymentCashApp.trim()})`);

    if (methods.length === 0) {
        return "Venmo, PayPal, or Zelle";
    }
    if (methods.length === 1) return methods[0];
    if (methods.length === 2) return `${methods[0]} or ${methods[1]}`;
    return `${methods.slice(0, -1).join(", ")}, or ${methods[methods.length - 1]}`;
}

/**
 * Builds the full variable map for rendering or previewing the Annual Thanksgiving Recap broadcast.
 */
export async function buildAnnualRecapTemplateVars(options?: {
    username?: string;
    email?: string;
    kindleEmail?: string;
    role?: string;
    status?: string;
    settings?: any;
    appUrl?: string;
    now?: Date;
    counts?: ServerMediaCountsResult;
}): Promise<Record<string, string>> {
    const now = options?.now || new Date();
    const currentYear = now.getFullYear();
    const nextYear = currentYear + 1;

    const settings = options?.settings ?? (await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null));
    const appUrl = options?.appUrl || (await getAppUrl());
    const counts = options?.counts || (await getServerMediaCounts());

    const yearlyNum = typeof settings?.yearlyPrice === "number" && settings.yearlyPrice > 0 ? settings.yearlyPrice : 180;
    const monthlyNum = typeof settings?.monthlyPrice === "number" && settings.monthlyPrice > 0 ? settings.monthlyPrice : 17.50;
    const annualMonthlyNum = Math.round((yearlyNum / 12) * 100) / 100;
    const annualSavingsNum = Math.max(0, Math.round((monthlyNum * 12 - yearlyNum) * 100) / 100);

    const renewalMonth = typeof settings?.renewalMonth === "number" && settings.renewalMonth >= 1 && settings.renewalMonth <= 12
        ? settings.renewalMonth
        : 1;
    const renewalDay = typeof settings?.renewalDay === "number" && settings.renewalDay >= 1 && settings.renewalDay <= 31
        ? settings.renewalDay
        : 1;
    const renewalMonthName = MONTH_NAMES[renewalMonth - 1] || "January";
    const renewalDate = `${renewalMonthName} ${renewalDay}, ${nextYear}`;

    const username = options?.username || "member";
    return {
        username,
        email: options?.email || "",
        kindleEmail: options?.kindleEmail || "",
        role: options?.role || "USER",
        status: options?.status || "APPROVED",
        portalName: "DomsHomeLab",
        appUrl,
        loginUrl: `${appUrl}/login`,
        billingUrl: `${appUrl}/profile`,
        currentYear: String(currentYear),
        nextYear: String(nextYear),
        renewalDate,
        yearlyPrice: `$${yearlyNum % 1 === 0 ? yearlyNum.toFixed(0) : yearlyNum.toFixed(2)}`,
        monthlyPrice: `$${monthlyNum.toFixed(2)}`,
        annualMonthlyRate: `$${annualMonthlyNum % 1 === 0 ? annualMonthlyNum.toFixed(0) : annualMonthlyNum.toFixed(2)}`,
        annualSavings: `$${annualSavingsNum % 1 === 0 ? annualSavingsNum.toFixed(0) : annualSavingsNum.toFixed(2)}`,
        movieCount: counts.movieCountText,
        showCount: counts.showCountText,
        paymentMethodsText: buildPaymentMethodsSummary(settings),
        paymentMemo: username
    };
}

/**
 * Dispatches (or stages for Admin Approval) the Annual Thanksgiving Recap broadcast
 * to all approved members with valid email addresses, deduplicated once per year.
 */
export async function sendAnnualThanksgivingRecapInternal(options?: {
    force?: boolean;
    now?: Date;
}): Promise<{
    success: boolean;
    skipped?: boolean;
    reason?: string;
    total: number;
    sent: number;
    queued: number;
    failed: number;
}> {
    const now = options?.now || new Date();
    const currentYear = now.getFullYear();
    const force = Boolean(options?.force);

    const settings = await prisma.settings.findUnique({ where: { id: "global" } });
    if (!settings) {
        return { success: false, skipped: true, reason: "Settings not initialized.", total: 0, sent: 0, queued: 0, failed: 0 };
    }

    if (!force) {
        const nonProdBlock = getNonProdAutomaticEmailBlockReason();
        if (nonProdBlock) {
            logger.addLog("INFO", "EMAIL", `[NON-PROD-EMAIL-GUARD] ${nonProdBlock} — skipped automatic Annual Thanksgiving Recap sweep.`);
            return { success: true, skipped: true, reason: nonProdBlock, total: 0, sent: 0, queued: 0, failed: 0 };
        }
        if (!settings.emailNotificationsEnabled || settings.notifyAnnualThanksgivingRecap === false) {
            return { success: true, skipped: true, reason: "Annual Thanksgiving Recap email automation is disabled.", total: 0, sent: 0, queued: 0, failed: 0 };
        }
        if (settings.lastAnnualRecapYear === currentYear) {
            return { success: true, skipped: true, reason: `Annual recap already processed for ${currentYear}.`, total: 0, sent: 0, queued: 0, failed: 0 };
        }
        if (!isAnnualRecapWindow(now)) {
            return { success: true, skipped: true, reason: "Outside the Saturday-before-Thanksgiving dispatch window.", total: 0, sent: 0, queued: 0, failed: 0 };
        }
    }

    const users = await prisma.user.findMany({
        where: { status: "APPROVED" },
        include: { notificationPreference: true }
    });

    const eligibleUsers = users.filter((u) => u.email && u.email.includes("@"));
    if (eligibleUsers.length === 0) {
        return { success: true, skipped: true, reason: "No approved members with valid email addresses found.", total: 0, sent: 0, queued: 0, failed: 0 };
    }

    const { renderEmailTemplate } = await import("@/lib/email-templates");
    const { sendOrQueueEmail } = await import("@/lib/email-dispatcher");

    const appUrl = await getAppUrl();
    const counts = await getServerMediaCounts();

    let sent = 0;
    let queued = 0;
    let failed = 0;

    for (const user of eligibleUsers) {
        if (user.notificationPreference && user.notificationPreference.emailAnnouncements === false) {
            continue;
        }

        try {
            const vars = await buildAnnualRecapTemplateVars({
                username: user.username,
                email: user.email || "",
                kindleEmail: user.kindleEmail || "",
                role: user.role,
                status: user.status,
                settings,
                appUrl,
                now,
                counts
            });

            const { subject, html } = await renderEmailTemplate("annual_thanksgiving_recap", vars);

            const res = await sendOrQueueEmail({
                to: user.email!,
                subject,
                html,
                templateId: "annual_thanksgiving_recap",
                targetUser: user.username,
                userId: user.id,
                skipAdminAlert: true
            });

            if (res.success) {
                if (res.queued) queued++;
                else if (res.sent) sent++;
            } else {
                failed++;
            }
        } catch {
            failed++;
        }
    }

    if (sent > 0 || queued > 0) {
        await prisma.settings.update({
            where: { id: "global" },
            data: { lastAnnualRecapYear: currentYear }
        }).catch(() => {});
    }

    logger.addLog(
        failed === 0 ? "SUCCESS" : "WARN",
        "EMAIL",
        `[ANNUAL-RECAP] ${currentYear} Thanksgiving Recap processed: ${queued} queued for approval, ${sent} sent, ${failed} failed.`
    );

    return {
        success: true,
        total: eligibleUsers.length,
        sent,
        queued,
        failed
    };
}
