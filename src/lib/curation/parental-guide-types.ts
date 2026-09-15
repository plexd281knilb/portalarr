export type ParentalCategoryKey = "nudity" | "violence" | "profanity" | "alcohol" | "frightening";
export type ParentalSeverity = "None" | "Mild" | "Moderate" | "Severe";

export interface ImdbParentalAdvisory {
    nudity: ParentalSeverity;
    violence: ParentalSeverity;
    profanity: ParentalSeverity;
    alcohol: ParentalSeverity;
    frightening: ParentalSeverity;
    certificate?: string;
    summary?: string;
    source: "ai" | "tmdb" | "cache" | "manual";
}

export interface ParentalTaggingOptions {
    enabled?: boolean;
    format?: "prefix_category_severity" | "severity_category" | "category_severity_paren" | "custom";
    prefix?: string; // e.g. "IMDb"
    target?: "labels" | "genres" | "both"; // Plex Labels (for sharing restrictions), Plex Genres, or both
    minSeverity?: ParentalSeverity; // "Severe", "Moderate", "Mild", "None"
    categories?: ParentalCategoryKey[]; // Which categories to tag
    dryRun?: boolean;
}

export interface CustomTagRule {
    tagName: string;
    field: "label" | "genre" | "collection";
    filterType: "all" | "resolution" | "hdr" | "audio" | "studio" | "decade" | "contentRating" | "rating_above" | "rating_below";
    filterValue?: string;
}

export const PARENTAL_CATEGORY_INFO: Record<ParentalCategoryKey, { label: string; short: string; icon: string; description: string }> = {
    nudity: { label: "Sex & Nudity", short: "Nudity", icon: "🔞", description: "Sexual content, nudity, and suggestive scenes" },
    violence: { label: "Violence & Gore", short: "Violence", icon: "🩸", description: "Graphic combat, bloodshed, injuries, and weapons" },
    profanity: { label: "Profanity", short: "Profanity", icon: "🤬", description: "Strong explicit language, slurs, and swearing" },
    alcohol: { label: "Alcohol, Drugs & Smoking", short: "Alcohol", icon: "🍷", description: "Substance usage, intoxication, and narcotics" },
    frightening: { label: "Frightening & Intense Scenes", short: "Frightening", icon: "😱", description: "Jumpscares, terror, psychological horror, and suspense" }
};

export const SEVERITY_LEVELS: Record<ParentalSeverity, number> = {
    None: 0,
    Mild: 1,
    Moderate: 2,
    Severe: 3
};

/**
 * Checks if a given severity meets or exceeds the minimum severity threshold.
 */
export function meetsSeverityThreshold(severity: ParentalSeverity, minThreshold: ParentalSeverity = "Mild"): boolean {
    const sVal = SEVERITY_LEVELS[severity] ?? 0;
    const tVal = SEVERITY_LEVELS[minThreshold] ?? 1;
    return sVal >= tVal;
}

/**
 * Formats a tag string according to the configured format template.
 */
export function formatParentalTag(
    categoryKey: ParentalCategoryKey, 
    severity: ParentalSeverity, 
    format: string = "prefix_category_severity", 
    prefix: string = "IMDb"
): string {
    const shortName = PARENTAL_CATEGORY_INFO[categoryKey]?.short || categoryKey;
    const cleanPrefix = (prefix || "IMDb").trim();

    switch (format) {
        case "severity_category":
            return `${severity} ${shortName}`;
        case "category_severity_paren":
            return `${shortName} (${severity})`;
        case "custom":
            return `${cleanPrefix}: ${shortName} - ${severity}`;
        case "prefix_category_severity":
        default:
            return `${cleanPrefix}-${shortName}: ${severity}`;
    }
}

/**
 * Parses whether a tag string is an existing parental rating tag created by Portalarr.
 */
export function isParentalTag(tag: string, prefix = "IMDb"): boolean {
    if (!tag) return false;
    const cleanPrefix = (prefix || "IMDb").trim().toLowerCase();
    const tLower = tag.toLowerCase();

    if (tLower.startsWith(`${cleanPrefix}-`) || tLower.startsWith(`${cleanPrefix}:`)) return true;

    const categories = ["nudity", "violence", "profanity", "alcohol", "frightening", "sex & nudity", "violence & gore", "drugs"];
    const severities = ["none", "mild", "moderate", "severe"];

    for (const sev of severities) {
        for (const cat of categories) {
            if (tLower === `${sev} ${cat}` || tLower === `${cat} (${sev})` || tLower === `${cat}: ${sev}`) {
                return true;
            }
        }
    }

    return false;
}

export type GuardRailPresetKey = "custom" | "kid_safe" | "family" | "teen" | "unrestricted";

export interface ServerGuardRailConfig {
    enabled: boolean;
    serverId: string;
    serverName?: string;
    preset?: GuardRailPresetKey;
    maxRating: string; // "G" | "PG" | "PG-13" | "R" | "NC-17" | "TV-Y" | "TV-Y7" | "TV-G" | "TV-PG" | "TV-14" | "TV-MA" | "UNRESTRICTED"
    blockedRatings: string[]; // e.g. ["R", "NC-17", "TV-MA", "NR", "UR", "X"]
    blockUnrated: boolean;
    maxParentalSeverity: {
        nudity: ParentalSeverity;
        violence: ParentalSeverity;
        profanity: ParentalSeverity;
        alcohol: ParentalSeverity;
        frightening: ParentalSeverity;
    };
    blockedGenres: string[];
    blockedKeywords: string[];
    enforceInSearch: boolean;
    enforceInCuration: boolean;
    enforceInPruning: boolean;
    customBadgeLabel?: string;
}

export const KID_SAFE_GUARD_RAIL_PRESET: Omit<ServerGuardRailConfig, "serverId"> = {
    enabled: true,
    preset: "kid_safe",
    maxRating: "G",
    blockedRatings: ["PG", "PG-13", "R", "NC-17", "TV-PG", "TV-14", "TV-MA", "NR", "UR", "X", "UNRATED", "15", "18"],
    blockUnrated: true,
    maxParentalSeverity: {
        nudity: "None",
        violence: "None",
        profanity: "None",
        alcohol: "None",
        frightening: "None"
    },
    blockedGenres: ["Horror", "Erotica", "Thriller", "War", "Crime"],
    blockedKeywords: [],
    enforceInSearch: true,
    enforceInCuration: true,
    enforceInPruning: true,
    customBadgeLabel: "🛡️ Kid-Safe (G / TV-Y7)"
};

export const FAMILY_GUARD_RAIL_PRESET: Omit<ServerGuardRailConfig, "serverId"> = {
    enabled: true,
    preset: "family",
    maxRating: "PG",
    blockedRatings: ["PG-13", "R", "NC-17", "TV-14", "TV-MA", "NR", "UR", "X", "15", "18"],
    blockUnrated: true,
    maxParentalSeverity: {
        nudity: "None",
        violence: "Mild",
        profanity: "Mild",
        alcohol: "None",
        frightening: "Mild"
    },
    blockedGenres: ["Horror", "Erotica"],
    blockedKeywords: [],
    enforceInSearch: true,
    enforceInCuration: true,
    enforceInPruning: true,
    customBadgeLabel: "🛡️ Family-Safe (PG / TV-PG)"
};

export const TEEN_GUARD_RAIL_PRESET: Omit<ServerGuardRailConfig, "serverId"> = {
    enabled: true,
    preset: "teen",
    maxRating: "PG-13",
    blockedRatings: ["R", "NC-17", "TV-MA", "X", "18"],
    blockUnrated: false,
    maxParentalSeverity: {
        nudity: "Mild",
        violence: "Moderate",
        profanity: "Moderate",
        alcohol: "Mild",
        frightening: "Moderate"
    },
    blockedGenres: ["Erotica"],
    blockedKeywords: [],
    enforceInSearch: true,
    enforceInCuration: true,
    enforceInPruning: true,
    customBadgeLabel: "🛡️ Teen-Friendly (PG-13 / TV-14)"
};

export const UNRESTRICTED_GUARD_RAIL_PRESET: Omit<ServerGuardRailConfig, "serverId"> = {
    enabled: false,
    preset: "unrestricted",
    maxRating: "UNRESTRICTED",
    blockedRatings: [],
    blockUnrated: false,
    maxParentalSeverity: {
        nudity: "Severe",
        violence: "Severe",
        profanity: "Severe",
        alcohol: "Severe",
        frightening: "Severe"
    },
    blockedGenres: [],
    blockedKeywords: [],
    enforceInSearch: false,
    enforceInCuration: false,
    enforceInPruning: false,
    customBadgeLabel: "Unrestricted"
};

/**
 * Normalizes content rating strings by stripping country prefixes (US:, GB:, etc.) and trimming.
 */
export function normalizeContentRating(raw?: string): string {
    if (!raw) return "";
    let clean = String(raw).trim();
    clean = clean.replace(/^[A-Z]{2,3}:/i, "").trim().toUpperCase();
    return clean;
}

/**
 * Returns integer ranking for standard MPAA / TV / International content ratings.
 */
export function getContentRatingRank(raw?: string): number {
    const r = normalizeContentRating(raw);
    if (!r) return 99;

    // Rank 1: G, TV-Y, TV-Y7, TV-G, U, FSK-0, 0, 0+, ALL
    if (/^(G|TV-Y|TV-Y7|TV-Y7-FV|TV-G|TVY|TVY7|TVG|U|FSK-0|FSK0|0|0\+|ALL|EVERYONE|EC|E)$/i.test(r)) {
        return 1;
    }

    // Rank 2: PG, TV-PG, FSK-6, 6, 7, 8, 9, 10, E10+
    if (/^(PG|TV-PG|TVPG|FSK-6|FSK6|6|6\+|7|7\+|8|8\+|9|9\+|10|10\+|E10\+|E10)$/i.test(r)) {
        return 2;
    }

    // Rank 3: PG-13, TV-14, 12, 12A, 13, 14, 14A, FSK-12, T
    if (/^(PG-13|PG13|TV-14|TV14|12|12A|12\+|13|13\+|14|14\+|14A|FSK-12|FSK12|T)$/i.test(r)) {
        return 3;
    }

    // Rank 4: R, TV-MA, 15, 16, 17, 18A, M, MA15+, FSK-16
    if (/^(R|TV-MA|TVMA|15|15\+|16|16\+|17|17\+|18A|M|MA15\+|MA 15\+|MA|FSK-16|FSK16|M18)$/i.test(r)) {
        return 4;
    }

    // Rank 5: NC-17, 18, 18+, R18+, X, XXX, ADULT, FSK-18, R21, AO
    if (/^(NC-17|NC17|18|18\+|R18\+|R 18\+|X18\+|X|XXX|ADULT|FSK-18|FSK18|R21|AO)$/i.test(r)) {
        return 5;
    }

    return 99;
}

/**
 * Checks whether a given content rating string satisfies the guard rail rating policy.
 */
export function isRatingAllowedByGuardRail(
    rating: string | undefined,
    maxRating: string = "UNRESTRICTED",
    blockedRatings: string[] = [],
    blockUnrated: boolean = false
): { allowed: boolean; reason?: string } {
    const norm = normalizeContentRating(rating);
    const normMax = normalizeContentRating(maxRating);

    // If unrestricted and no blocklists
    if ((!maxRating || normMax === "UNRESTRICTED") && blockedRatings.length === 0 && !blockUnrated) {
        return { allowed: true };
    }

    // Unrated / Empty Check
    if (!norm || norm === "NR" || norm === "UR" || norm === "UNRATED" || norm === "NOT RATED" || norm === "UNKNOWN") {
        if (blockUnrated) {
            return { allowed: false, reason: "Unrated (NR / UR) content is blocked by server guard rails" };
        }
        if (blockedRatings.some(b => {
            const nb = normalizeContentRating(b);
            return nb === "NR" || nb === "UR" || nb === "UNRATED";
        })) {
            return { allowed: false, reason: "Unrated content is in the server rating blocklist" };
        }
        return { allowed: true };
    }

    // Blocked Ratings List Check
    if (blockedRatings.length > 0) {
        const isBlocked = blockedRatings.some(b => {
            const normB = normalizeContentRating(b);
            return normB === norm || norm.startsWith(normB) || (normB === "R" && norm === "TV-MA") || (normB === "TV-MA" && norm === "R");
        });
        if (isBlocked) {
            return { allowed: false, reason: `Rating "${norm}" is explicitly blocked by server guard rails` };
        }
    }

    // Ceiling Check
    if (maxRating && normMax !== "UNRESTRICTED") {
        const itemRank = getContentRatingRank(norm);
        const maxRank = getContentRatingRank(normMax);

        if (itemRank !== 99 && maxRank !== 99 && itemRank > maxRank) {
            return { allowed: false, reason: `Rating "${norm}" exceeds server maximum allowed ceiling of "${maxRating}"` };
        }
    }

    return { allowed: true };
}

/**
 * Evaluates a complete media item against a server's guard rail configuration.
 */
export function isMediaAllowedByServerGuardRail(
    item: {
        contentRating?: string;
        title?: string;
        genres?: string[] | string;
        genre?: string[] | string;
        advisory?: ImdbParentalAdvisory;
    },
    config?: ServerGuardRailConfig | null
): { allowed: boolean; reason?: string } {
    if (!config || !config.enabled) {
        return { allowed: true };
    }

    // 1. Content Rating Check
    const ratingRes = isRatingAllowedByGuardRail(
        item.contentRating,
        config.maxRating,
        config.blockedRatings,
        config.blockUnrated
    );
    if (!ratingRes.allowed) {
        return ratingRes;
    }

    // 2. Blocked Genres Check
    if (config.blockedGenres && config.blockedGenres.length > 0) {
        const rawGenres: string[] = [];
        if (Array.isArray(item.genres)) rawGenres.push(...item.genres);
        else if (typeof item.genres === "string") rawGenres.push(...item.genres.split(/[,/|]/));
        if (Array.isArray(item.genre)) rawGenres.push(...item.genre);
        else if (typeof item.genre === "string") rawGenres.push(...item.genre.split(/[,/|]/));

        const cleanGenres = rawGenres.map(g => g.trim().toLowerCase()).filter(Boolean);
        for (const blocked of config.blockedGenres) {
            const bClean = blocked.trim().toLowerCase();
            if (cleanGenres.some(g => g.includes(bClean) || bClean.includes(g))) {
                return { allowed: false, reason: `Genre "${blocked}" is blocked by server guard rails` };
            }
        }
    }

    // 3. Blocked Keywords Check
    if (config.blockedKeywords && config.blockedKeywords.length > 0 && item.title) {
        const tLower = item.title.toLowerCase();
        for (const kw of config.blockedKeywords) {
            const kClean = kw.trim().toLowerCase();
            if (kClean && tLower.includes(kClean)) {
                return { allowed: false, reason: `Title matches blocked keyword "${kw}"` };
            }
        }
    }

    // 4. IMDb Parental Advisory Severities Check
    if (item.advisory && config.maxParentalSeverity) {
        const catKeys: ParentalCategoryKey[] = ["nudity", "violence", "profanity", "alcohol", "frightening"];
        for (const cat of catKeys) {
            const itemSev = item.advisory[cat];
            const maxSev = config.maxParentalSeverity[cat];
            if (itemSev && maxSev) {
                const itemVal = SEVERITY_LEVELS[itemSev] ?? 0;
                const maxVal = SEVERITY_LEVELS[maxSev] ?? 3;
                if (itemVal > maxVal) {
                    const info = PARENTAL_CATEGORY_INFO[cat]?.short || cat;
                    return {
                        allowed: false,
                        reason: `${info} advisory "${itemSev}" exceeds server limit of "${maxSev}"`
                    };
                }
            }
        }
    }

    return { allowed: true };
}
