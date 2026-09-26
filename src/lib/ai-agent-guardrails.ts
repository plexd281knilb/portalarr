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

export interface PrivacyGuardrailCheckResult {
    allowed: boolean;
    violationType?: "CROSS_USER_RECONNAISSANCE" | "CROSS_USER_STREAM_TERMINATION" | "UNAUTHORIZED_ACCESS_MODIFICATION" | "CROSS_USER_INFO_DISCLOSURE";
    targetAttempted?: string;
    reason?: string;
    safeResponse?: string;
}

/**
 * Strict privacy and authorization guardrail for the AI Server Master.
 * Ensures:
 * 1. No user can view or ask about another user's active streams or watch history.
 * 2. No user can terminate another user's stream or shut off another user's access.
 * 3. Users can ONLY ask questions about their own account and directly linked sub-accounts (e.g. kids, living room).
 * 4. Only ADMINS have server-wide oversight permissions.
 */
export function validateUserCrossBoundaryQuery(
    question: string,
    currentUser: any,
    linkedSubAccounts: Array<{ id: string; username: string; email?: string; plexUsername?: string | null; subAccountLabel?: string | null; accountType?: string }> = []
): PrivacyGuardrailCheckResult {
    const q = (question || "").toLowerCase().trim();
    if (!q) return { allowed: true };

    const isAdmin = currentUser?.role === "ADMIN";
    // Admins have full server management rights
    if (isAdmin) {
        return { allowed: true };
    }

    const callerUsername = (currentUser?.username || "").toLowerCase().trim();
    const callerEmail = (currentUser?.email || "").toLowerCase().trim();

    // Build the set of allowed identity tokens for this caller
    const allowedTokens = new Set<string>();
    if (callerUsername) allowedTokens.add(callerUsername);
    if (callerEmail) allowedTokens.add(callerEmail);
    allowedTokens.add("me");
    allowedTokens.add("my");
    allowedTokens.add("mine");
    allowedTokens.add("myself");
    allowedTokens.add("i");
    allowedTokens.add("our");
    allowedTokens.add("us");
    allowedTokens.add("self");

    // Add all linked sub-account identifiers (e.g. kids, living room)
    for (const sub of linkedSubAccounts) {
        if (sub.username) allowedTokens.add(sub.username.toLowerCase().trim());
        if (sub.email) allowedTokens.add(sub.email.toLowerCase().trim());
        if (sub.plexUsername) allowedTokens.add(sub.plexUsername.toLowerCase().trim());
        if (sub.subAccountLabel) {
            const labelNorm = sub.subAccountLabel.toLowerCase().trim();
            allowedTokens.add(labelNorm);
            for (const word of labelNorm.split(/\s+/)) {
                if (word.length > 2) allowedTokens.add(word);
            }
        }
        if (sub.accountType) {
            allowedTokens.add(sub.accountType.toLowerCase().trim());
            if (sub.accountType === "KID") {
                allowedTokens.add("kid");
                allowedTokens.add("kids");
                allowedTokens.add("child");
                allowedTokens.add("children");
            }
            if (sub.accountType === "LIVING_ROOM") {
                allowedTokens.add("living room");
                allowedTokens.add("livingroom");
                allowedTokens.add("tv");
            }
        }
    }

    // Helper: Checks if a target name is allowed
    const isTargetAllowed = (target: string): boolean => {
        const cleaned = target.toLowerCase().replace(/['"’]/g, "").trim();
        if (!cleaned) return true;
        if (allowedTokens.has(cleaned)) return true;
        // Check if any allowed token contains this target or vice versa
        for (const token of allowedTokens) {
            if (token && token.length > 2 && (cleaned.includes(token) || token.includes(cleaned))) {
                return true;
            }
        }
        return false;
    };

    // 1. UNAUTHORIZED ACCESS MODIFICATION (Shut off / disable / ban / revoke access)
    // Non-admin users are strictly forbidden from modifying any user's server access.
    const accessModRegex = /\b(?:shut\s*off|turn\s*off|disable|revoke|remove|delete|ban|kick|suspend|cut\s*off|lock\s*out)\s+(?:access|account|membership|profile|privileges)?\s*(?:for|to|of)?\s*([a-zA-Z0-9_\-\.@]+)?/i;
    if (accessModRegex.test(q) && (q.includes("access") || q.includes("account") || q.includes("user") || q.includes("privilege"))) {
        const accessMatches = q.match(accessModRegex);
        const target = (accessMatches?.[1] || "").trim();
        return {
            allowed: false,
            violationType: "UNAUTHORIZED_ACCESS_MODIFICATION",
            targetAttempted: target || "another user",
            reason: "Non-admin users cannot shut off or modify account access for any user.",
            safeResponse: `🔒 **Administrative Privilege Required:** Modifying server access, revoking accounts, or shutting off user privileges requires Administrator permissions. You do not have permission to alter access for **${target || "other users"}**.`
        };
    }

    // 2. CROSS-USER STREAM TERMINATION (Stop streams for other users / stop stream for x user)
    // "stop streams for x user", "kill x's stream", "pause stream for x", "stop streams for other users"
    const streamKillPatterns = [
        /\b(?:stop|kill|terminate|end|pause|abort|drop)\s+(?:the\s+)?(?:active\s+)?(?:streams?|playback|sessions?|watching)\s+(?:for|of|on)\s+([a-zA-Z0-9_\-\.@\s]+)/i,
        /\b(?:stop|kill|terminate|end|pause)\s+([a-zA-Z0-9_\-\.@]+)(?:'s|\s+user)\s+(?:streams?|playback|sessions?)/i,
        /\b(?:stop|kill|terminate|end|pause)\s+(?:streams?\s+for\s+)?(other\s+users?|all\s+users?|everyone|everybody|someone\s+else)\b/i
    ];

    for (const pattern of streamKillPatterns) {
        const match = q.match(pattern);
        if (match) {
            const rawTarget = (match[1] || "").trim();
            // Check if target is a broad other-users group
            if (/\b(other\s+users?|all\s+users?|everyone|everybody|someone\s+else)\b/i.test(rawTarget)) {
                return {
                    allowed: false,
                    violationType: "CROSS_USER_STREAM_TERMINATION",
                    targetAttempted: rawTarget,
                    reason: "Users cannot terminate streams for other users or all users.",
                    safeResponse: `🔒 **Access Control Enforcement:** You cannot terminate streams belonging to other users. You only have permission to stop active streams on your own account and your directly linked family sub-accounts.`
                };
            }

            // Check if specific target is NOT self and NOT in linked sub-accounts
            if (rawTarget && !isTargetAllowed(rawTarget)) {
                return {
                    allowed: false,
                    violationType: "CROSS_USER_STREAM_TERMINATION",
                    targetAttempted: rawTarget,
                    reason: `User "${rawTarget}" is not the caller or an authorized linked sub-account.`,
                    safeResponse: `🔒 **Access Control Enforcement:** You cannot terminate playback sessions for user **${rawTarget}**. You only have permission to control playback on your own account and your directly linked family sub-accounts (such as Kids or Living Room devices).`
                };
            }
        }
    }

    // 3. CROSS-USER RECONNAISSANCE / INFORMATION DISCLOSURE (Show active streams for other users)
    // "show me active streams for other users", "who else is streaming", "what is user x watching", "show other users' streams"
    const crossReconPatterns = [
        /\b(?:show|list|get|tell|see|view|check)\s+(?:me\s+)?(?:the\s+)?(?:active\s+)?streams?\s+(?:for|of|by|from)\s+(?:the\s+)?(other\s+users?|all\s+users?|everyone|everybody|someone\s+else)\b/i,
        /\b(?:who\s+else|what\s+other\s+users?|which\s+other\s+users?)\s+(?:is|are)\s+(?:streaming|watching|playing|online|active)\b/i,
        /\b(?:who\s+is|who's)\s+(?:watching|streaming|playing|on\s+plex|on\s+the\s+server)\b/i,
        /\b(?:show|list|view|see)\s+(?:me\s+)?(?:all\s+)?(?:the\s+)?other\s+users?\b/i,
        /\b(?:what\s+is|what's|show|check|view)\s+([a-zA-Z0-9_\-\.@]+)(?:'s|\s+user)?\s+(?:streams?|playback|watching|history|activity)\b/i,
        /\b(?:show|list|get|see)\s+(?:me\s+)?(?:active\s+)?streams?\s+(?:for|of|by)\s+([a-zA-Z0-9_\-\.@]+)/i
    ];

    for (const pattern of crossReconPatterns) {
        const match = q.match(pattern);
        if (match) {
            const rawTarget = (match[1] || "").trim();
            // Check broad "other users" phrase
            if (!rawTarget || /\b(other\s+users?|all\s+users?|everyone|everybody|someone\s+else)\b/i.test(rawTarget) || q.includes("who else") || q.includes("who is watching") || q.includes("who is on plex")) {
                return {
                    allowed: false,
                    violationType: "CROSS_USER_RECONNAISSANCE",
                    targetAttempted: rawTarget || "other users",
                    reason: "Users cannot query active streams or watch activity for other users.",
                    safeResponse: `🔒 **Privacy Boundary Enforcement:** You do not have permission to view active streams, playback sessions, or watch activity for other users. In Portalarr, users are strictly isolated to their own accounts and directly linked family profiles (such as Kids or Living Room devices).`
                };
            }

            // Check if specific target is NOT self and NOT in linked sub-accounts
            if (rawTarget && !isTargetAllowed(rawTarget)) {
                // If it's a media search or server test, don't confuse a movie title with a username
                const mediaTokens = ["plex", "server", "movie", "show", "film", "episode", "music", "audiobook", "book"];
                if (mediaTokens.includes(rawTarget.toLowerCase())) {
                    continue;
                }

                return {
                    allowed: false,
                    violationType: "CROSS_USER_INFO_DISCLOSURE",
                    targetAttempted: rawTarget,
                    reason: `User "${rawTarget}" is outside the caller's authorized account boundary.`,
                    safeResponse: `🔒 **Privacy Boundary Enforcement:** You do not have permission to inspect playback sessions, watch history, or account details for user **${rawTarget}**. You can only view stream health for your own account and your directly linked family profiles.`
                };
            }
        }
    }

    return { allowed: true };
}
