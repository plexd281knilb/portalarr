import { logger } from "@/lib/logger";

export interface RateLimitCheckResult {
    allowed: boolean;
    remaining: number;
    resetInMinutes?: number;
    reason?: string;
}

export interface ReleaseValidationResult {
    ok: boolean;
    reason?: string;
    score: number;
}

// In-memory rate limiting store for automated grabs (sliding 24-hour window)
interface UserActionTimestamp {
    timestamp: number;
    actionType: string;
    targetTitle: string;
}

const userActionHistory = new Map<string, UserActionTimestamp[]>();

const MAX_AUTOMATED_GRABS_PER_24H = 3;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Checks if a user is within their automated redownload / grab quota.
 * Prevents malicious or infinite loop download flooding.
 */
export function checkAgentRateLimit(userIdentifier: string): RateLimitCheckResult {
    const safeId = (userIdentifier || "anonymous").toLowerCase().trim();
    const now = Date.now();
    const history = userActionHistory.get(safeId) || [];

    // Filter out actions older than 24 hours
    const activeHistory = history.filter(item => (now - item.timestamp) < TWENTY_FOUR_HOURS_MS);
    userActionHistory.set(safeId, activeHistory);

    if (activeHistory.length >= MAX_AUTOMATED_GRABS_PER_24H) {
        const oldest = activeHistory[0];
        const resetMs = (oldest.timestamp + TWENTY_FOUR_HOURS_MS) - now;
        const resetInMinutes = Math.max(1, Math.ceil(resetMs / (60 * 1000)));

        return {
            allowed: false,
            remaining: 0,
            resetInMinutes,
            reason: `Automated replacement rate limit reached (${MAX_AUTOMATED_GRABS_PER_24H} grabs in 24 hours). Please wait ${resetInMinutes} minutes or contact your server administrator.`
        };
    }

    return {
        allowed: true,
        remaining: MAX_AUTOMATED_GRABS_PER_24H - activeHistory.length
    };
}

/**
 * Records an automated grab action for rate limiting and auditing.
 */
export function recordAgentGrabAction(userIdentifier: string, actionType: string, targetTitle: string): void {
    const safeId = (userIdentifier || "anonymous").toLowerCase().trim();
    const now = Date.now();
    const history = userActionHistory.get(safeId) || [];

    history.push({
        timestamp: now,
        actionType,
        targetTitle
    });

    userActionHistory.set(safeId, history);

    logger.addLog(
        "INFO",
        "AI_AGENT",
        `[Guardrail] Recorded autonomous action "${actionType}" for media "${targetTitle}" by user "${safeId}". (Used: ${history.length}/${MAX_AUTOMATED_GRABS_PER_24H} in 24h)`
    );
}

/**
 * Validates a Radarr or Sonarr release candidate against strict quality, language, and safety guardrails.
 */
export function validateMediaReleaseCandidate(
    release: any,
    targetType: "movie" | "episode" = "movie",
    requestedLanguage: string = "English"
): ReleaseValidationResult {
    const title = String(release?.title || release?.releaseTitle || "").trim();
    if (!title) {
        return { ok: false, score: -100, reason: "Missing release title" };
    }

    const lowerTitle = title.toLowerCase();

    // 1. Hard rejection of low-quality / bootleg / cam formats
    const lowQualityTerms = [
        "cam", "telesync", "hdcam", "hd-ts", "hdts", "tc", "telecine", 
        "screener", "scr", "dvdscr", "workprint", "wp", "r5"
    ];
    for (const term of lowQualityTerms) {
        const regex = new RegExp(`\\b${term}\\b`, "i");
        if (regex.test(lowerTitle)) {
            return { ok: false, score: -100, reason: `Rejected low-quality source format (${term.toUpperCase()})` };
        }
    }

    // 2. Reject foreign-only releases when English is required
    if (requestedLanguage.toLowerCase() === "english") {
        const foreignOnlyTerms = [
            "spanish.only", "castellano.only", "french.only", "vostfr", "truefrench",
            "german.only", "italian.only", "ita.sub", "rus.sub", "hindi.only", "dublado"
        ];
        for (const foreign of foreignOnlyTerms) {
            if (lowerTitle.includes(foreign)) {
                return { ok: false, score: -100, reason: `Rejected foreign-only release indicator (${foreign})` };
            }
        }

        // Check release languages array from Radarr/Sonarr
        const languages = Array.isArray(release.languages) ? release.languages : [];
        const hasExplicitEnglish = languages.some((l: any) => 
            l.name?.toLowerCase().includes("english") || l.id === 1
        );

        const hasEnglishTitleTags = /\b(eng|english|multi|dual|dl|multi-audio|dual-audio)\b/i.test(lowerTitle);

        // If languages array is populated and explicitly lacks English, reject
        if (languages.length > 0 && !hasExplicitEnglish && !hasEnglishTitleTags) {
            const langNames = languages.map((l: any) => l.name || l.id).join(", ");
            return { ok: false, score: -50, reason: `Release languages (${langNames}) do not include English` };
        }
    }

    // 3. Seeders & Protocol verification for torrents
    const protocol = String(release.protocol || "").toLowerCase();
    const seeders = typeof release.seeders === "number" ? release.seeders : undefined;

    if (protocol === "torrent" || protocol === "usenet") {
        if (protocol === "torrent" && seeders !== undefined && seeders < 1) {
            return { ok: false, score: -50, reason: "Zero seeders available on indexer" };
        }
    }

    // 4. Size bounds checking (avoid stubs or gigantic corrupted archives)
    const sizeBytes = Number(release.size || 0);
    const sizeMb = sizeBytes / (1024 * 1024);

    if (targetType === "movie") {
        if (sizeMb < 400) {
            return { ok: false, score: -50, reason: `File size too small for movie (${Math.round(sizeMb)} MB)` };
        }
        if (sizeMb > 95 * 1024) {
            return { ok: false, score: -50, reason: `File size exceeds safety cap (${Math.round(sizeMb / 1024)} GB)` };
        }
    } else {
        // Episode
        if (sizeMb < 80) {
            return { ok: false, score: -50, reason: `File size too small for episode (${Math.round(sizeMb)} MB)` };
        }
        if (sizeMb > 35 * 1024) {
            return { ok: false, score: -50, reason: `File size exceeds safety cap for episode (${Math.round(sizeMb / 1024)} GB)` };
        }
    }

    // 5. Score calculation for ranking
    let score = 100;

    // Prefer 1080p / 2160p high definition
    if (/\b(1080p|bluray|remux)\b/i.test(lowerTitle)) score += 30;
    else if (/\b(web-dl|webrip|web)\b/i.test(lowerTitle)) score += 20;
    else if (/\b(720p)\b/i.test(lowerTitle)) score += 5;

    // Prefer explicit English audio tags
    if (/\b(dual|multi|dual-audio)\b/i.test(lowerTitle)) score += 15;
    if (/\b(dts-hd|truehd|atmos|ddp5\.1|ac3)\b/i.test(lowerTitle)) score += 10;

    // Reward healthy seed counts
    if (seeders && seeders > 10) score += Math.min(25, seeders);

    return {
        ok: true,
        score,
        reason: "Release passed all safety and language criteria"
    };
}

/**
 * Centralized audit logger for AI Assistant autonomous events.
 */
export function logAgentEvent(
    level: "INFO" | "WARN" | "ERROR",
    summary: string,
    details?: any
): void {
    const detailStr = details ? ` | Details: ${JSON.stringify(details)}` : "";
    logger.addLog(level, "AI_AGENT", `🤖 ${summary}${detailStr}`);
}
