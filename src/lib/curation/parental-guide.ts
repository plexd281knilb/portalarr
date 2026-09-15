import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { getPlexServers, getPlexCloudServersMap, resolveWorkingPlexServerConnection } from "@/lib/plex";
import { getPlexLibraryMediaItems, expandCandidateUrls, PlexMediaStreamInfo } from "@/lib/curation/plex-analyzer";

export * from "./parental-guide-types";
import {
    ParentalCategoryKey,
    ParentalSeverity,
    ImdbParentalAdvisory,
    ParentalTaggingOptions,
    PARENTAL_CATEGORY_INFO,
    SEVERITY_LEVELS,
    meetsSeverityThreshold,
    formatParentalTag,
    isParentalTag,
    GuardRailPresetKey,
    ServerGuardRailConfig,
    KID_SAFE_GUARD_RAIL_PRESET,
    FAMILY_GUARD_RAIL_PRESET,
    TEEN_GUARD_RAIL_PRESET,
    UNRESTRICTED_GUARD_RAIL_PRESET,
    normalizeContentRating,
    getContentRatingRank,
    isRatingAllowedByGuardRail,
    isMediaAllowedByServerGuardRail,
    CustomTagRule
} from "./parental-guide-types";

/**
 * Retrieves the full map of Server Guard Rail configurations from SQLite.
 */
export async function getServerGuardRailsMap(): Promise<Record<string, ServerGuardRailConfig>> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (settings?.serverGuardRails) {
            const parsed = JSON.parse(settings.serverGuardRails);
            if (typeof parsed === "object" && parsed !== null) {
                return parsed;
            }
        }
    } catch (e) {}
    return {};
}

/**
 * Retrieves the Server Guard Rail configuration for a specific Plex Server.
 * Automatically defaults Kids-themed servers (e.g. 'KidsPlexServer', 'Kids') to Kid-Safe preset if unconfigured.
 */
export async function getServerGuardRailConfig(serverId: string, fallbackServerName?: string): Promise<ServerGuardRailConfig> {
    const map = await getServerGuardRailsMap();
    if (map[serverId]) {
        return map[serverId];
    }

    const srvNameLower = (fallbackServerName || "").toLowerCase();
    const isKidsServer = serverId.toLowerCase().includes("kid") || srvNameLower.includes("kid");

    if (isKidsServer) {
        return {
            ...KID_SAFE_GUARD_RAIL_PRESET,
            serverId,
            serverName: fallbackServerName || "Kids Plex Server"
        };
    }

    return {
        ...UNRESTRICTED_GUARD_RAIL_PRESET,
        serverId,
        serverName: fallbackServerName || "Plex Server"
    };
}

/**
 * Persists a Server Guard Rail configuration for a specific Plex Server.
 */
export async function saveServerGuardRailConfig(config: ServerGuardRailConfig): Promise<{ success: boolean; error?: string }> {
    try {
        const map = await getServerGuardRailsMap();
        map[config.serverId] = config;

        await prisma.settings.upsert({
            where: { id: "global" },
            update: { serverGuardRails: JSON.stringify(map) },
            create: { id: "global", serverGuardRails: JSON.stringify(map) }
        });

        logger.addLog("INFO", "CURATION", `Updated Server Guard Rails for "${config.serverName || config.serverId}": ${config.enabled ? `ENABLED (${config.maxRating})` : 'DISABLED'}`);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Persists multiple Server Guard Rail configurations at once.
 */
export async function saveAllServerGuardRails(configs: Record<string, ServerGuardRailConfig>): Promise<{ success: boolean; error?: string }> {
    try {
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { serverGuardRails: JSON.stringify(configs) },
            create: { id: "global", serverGuardRails: JSON.stringify(configs) }
        });

        logger.addLog("INFO", "CURATION", `Saved Server Guard Rails configurations across ${Object.keys(configs).length} server(s).`);
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Retrieve cached parental advisory from SQLite database.
 */
export async function getStoredParentalAdvisory(ratingKey: string, serverId?: string): Promise<ImdbParentalAdvisory | null> {
    try {
        const stored = await prisma.mediaContentAdvisory.findFirst({
            where: {
                ratingKey,
                ...(serverId ? { serverId } : {})
            }
        });

        if (stored && (stored.nudityLevel || stored.violenceLevel || stored.profanityLevel || stored.alcoholLevel || stored.frighteningLevel)) {
            return {
                nudity: (stored.nudityLevel as ParentalSeverity) || "None",
                violence: (stored.violenceLevel as ParentalSeverity) || "None",
                profanity: (stored.profanityLevel as ParentalSeverity) || "None",
                alcohol: (stored.alcoholLevel as ParentalSeverity) || "None",
                frightening: (stored.frighteningLevel as ParentalSeverity) || "None",
                certificate: stored.mpaaRating || undefined,
                summary: stored.leavingReason || undefined,
                source: "cache"
            };
        }
    } catch (e) {}
    return null;
}

/**
 * Save resolved parental advisory to SQLite database.
 */
export async function saveParentalAdvisory(
    ratingKey: string,
    serverId: string,
    title: string,
    advisory: ImdbParentalAdvisory,
    meta?: { imdbId?: string; tmdbId?: string; mpaaRating?: string }
): Promise<void> {
    try {
        await prisma.mediaContentAdvisory.upsert({
            where: {
                ratingKey_serverId: {
                    ratingKey,
                    serverId
                }
            },
            update: {
                title,
                imdbId: meta?.imdbId,
                tmdbId: meta?.tmdbId,
                mpaaRating: advisory.certificate || meta?.mpaaRating,
                nudityLevel: advisory.nudity,
                violenceLevel: advisory.violence,
                profanityLevel: advisory.profanity,
                alcoholLevel: advisory.alcohol,
                frighteningLevel: advisory.frightening,
                leavingReason: advisory.summary
            },
            create: {
                ratingKey,
                serverId,
                title,
                imdbId: meta?.imdbId,
                tmdbId: meta?.tmdbId,
                mpaaRating: advisory.certificate || meta?.mpaaRating,
                nudityLevel: advisory.nudity,
                violenceLevel: advisory.violence,
                profanityLevel: advisory.profanity,
                alcoholLevel: advisory.alcohol,
                frighteningLevel: advisory.frightening,
                leavingReason: advisory.summary
            }
        });
    } catch (e: any) {
        console.warn(`[PARENTAL-GUIDE] Failed to save advisory for "${title}":`, e.message);
    }
}

/**
 * Heuristic fallback resolver based on MPAA / TV certificate rating and title genre keywords.
 */
export function resolveParentalAdvisoryFallback(metadata: {
    title: string;
    year?: number;
    contentRating?: string;
    type?: string;
}): ImdbParentalAdvisory {
    const rating = (metadata.contentRating || "").toUpperCase().replace("US:", "").trim();
    let nudity: ParentalSeverity = "None";
    let violence: ParentalSeverity = "None";
    let profanity: ParentalSeverity = "None";
    let alcohol: ParentalSeverity = "None";
    let frightening: ParentalSeverity = "None";

    if (rating === "R" || rating === "TV-MA" || rating === "NC-17" || rating === "18" || rating === "X") {
        nudity = "Moderate";
        violence = "Severe";
        profanity = "Severe";
        alcohol = "Moderate";
        frightening = "Moderate";
    } else if (rating === "PG-13" || rating === "TV-14" || rating === "15" || rating === "12A") {
        nudity = "Mild";
        violence = "Moderate";
        profanity = "Moderate";
        alcohol = "Mild";
        frightening = "Moderate";
    } else if (rating === "PG" || rating === "TV-PG" || rating === "12") {
        nudity = "None";
        violence = "Mild";
        profanity = "Mild";
        alcohol = "Mild";
        frightening = "Mild";
    } else if (rating === "G" || rating === "TV-G" || rating === "TV-Y" || rating === "TV-Y7") {
        nudity = "None";
        violence = "None";
        profanity = "None";
        alcohol = "None";
        frightening = "None";
    } else {
        // Unknown rating - default mild baseline
        nudity = "None";
        violence = "Mild";
        profanity = "Mild";
        alcohol = "None";
        frightening = "None";
    }

    return {
        nudity,
        violence,
        profanity,
        alcohol,
        frightening,
        certificate: rating || undefined,
        source: "tmdb"
    };
}

/**
 * AI-powered batch resolver for IMDb Parental Guide ratings.
 * Resolves up to 30 titles in a single LLM prompt.
 */
export async function resolveParentalAdvisoryBatchAI(
    items: {
        ratingKey: string;
        title: string;
        year?: number;
        type: string;
        imdbId?: string;
        mpaaRating?: string;
    }[]
): Promise<Record<string, ImdbParentalAdvisory>> {
    if (items.length === 0) return {};

    const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
    const provider = settings?.aiProvider || "default";
    const rawKey = settings?.aiApiKey ? decryptData(settings.aiApiKey) : "";
    const modelName = settings?.aiModel || "gemini-2.5-flash";

    // If no AI key configured, use heuristic fallbacks
    if (!rawKey && (provider === "gemini" || provider === "google" || provider === "openai" || provider === "anthropic")) {
        const fallbacks: Record<string, ImdbParentalAdvisory> = {};
        for (const it of items) {
            fallbacks[it.ratingKey] = resolveParentalAdvisoryFallback(it);
        }
        return fallbacks;
    }

    const payload = items.map(it => ({
        id: it.ratingKey,
        title: it.title,
        year: it.year,
        type: it.type,
        imdbId: it.imdbId,
        mpaaRating: it.mpaaRating
    }));

    const systemPrompt = `You are an expert film database metadata AI agent specializing in IMDb Parents Guide (Parental Advisory) data.
For each movie or TV show provided in the list, provide the official consensus IMDb Parents Guide severity ratings for the 5 standard categories:
1. "nudity": ("None" | "Mild" | "Moderate" | "Severe")
2. "violence": ("None" | "Mild" | "Moderate" | "Severe")
3. "profanity": ("None" | "Mild" | "Moderate" | "Severe")
4. "alcohol": ("None" | "Mild" | "Moderate" | "Severe")
5. "frightening": ("None" | "Mild" | "Moderate" | "Severe")

Return ONLY a valid, raw JSON object mapping each item's "id" to its advisory ratings object.

Example output:
{
  "12345": {
    "nudity": "Mild",
    "violence": "Severe",
    "profanity": "Severe",
    "alcohol": "Moderate",
    "frightening": "Moderate",
    "certificate": "R",
    "summary": "Rated R for pervasive strong violence and language throughout"
  }
}`;

    try {
        let rawText = "";

        if (provider === "gemini" || provider === "google" || (!provider || provider === "default")) {
            const keyToUse = rawKey || process.env.GEMINI_API_KEY || "";
            if (keyToUse) {
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName || "gemini-2.5-flash"}:generateContent?key=${encodeURIComponent(keyToUse)}`;
                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ parts: [{ text: JSON.stringify(payload) }] }],
                        generationConfig: { response_mime_type: "application/json", temperature: 0.1 }
                    })
                });
                if (res.ok) {
                    const data = await res.json();
                    rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
                }
            }
        } else if (provider === "openai" && rawKey) {
            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${rawKey}`
                },
                body: JSON.stringify({
                    model: modelName || "gpt-4o-mini",
                    messages: [
                        { role: "system", content: systemPrompt },
                        { role: "user", content: JSON.stringify(payload) }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.1
                })
            });
            if (res.ok) {
                const data = await res.json();
                rawText = data.choices?.[0]?.message?.content || "";
            }
        }

        if (rawText) {
            const cleanJson = rawText.replace(/```json/gi, "").replace(/```/g, "").trim();
            const parsed = JSON.parse(cleanJson);
            const results: Record<string, ImdbParentalAdvisory> = {};

            for (const it of items) {
                const adv = parsed[it.ratingKey];
                if (adv && adv.violence) {
                    results[it.ratingKey] = {
                        nudity: normalizeSeverity(adv.nudity),
                        violence: normalizeSeverity(adv.violence),
                        profanity: normalizeSeverity(adv.profanity),
                        alcohol: normalizeSeverity(adv.alcohol),
                        frightening: normalizeSeverity(adv.frightening),
                        certificate: adv.certificate || it.mpaaRating,
                        summary: adv.summary,
                        source: "ai"
                    };
                } else {
                    results[it.ratingKey] = resolveParentalAdvisoryFallback(it);
                }
            }
            return results;
        }
    } catch (e: any) {
        logger.addLog("WARN", "CURATION", `AI Parental Guide batch resolution failed: ${e.message}. Using fallback heuristics.`);
    }

    // Fallback for all
    const fallbacks: Record<string, ImdbParentalAdvisory> = {};
    for (const it of items) {
        fallbacks[it.ratingKey] = resolveParentalAdvisoryFallback(it);
    }
    return fallbacks;
}

function normalizeSeverity(val: any): ParentalSeverity {
    if (!val) return "None";
    const s = String(val).trim().toLowerCase();
    if (s.includes("severe") || s === "high") return "Severe";
    if (s.includes("moderate") || s === "medium") return "Moderate";
    if (s.includes("mild") || s === "low") return "Mild";
    return "None";
}

/**
 * Resolves parental advisory for a single media item (Cache -> AI -> Fallback).
 */
export async function resolveParentalAdvisory(
    item: {
        ratingKey: string;
        title: string;
        year?: number;
        type?: string;
        imdbId?: string;
        contentRating?: string;
    },
    serverId: string = "main"
): Promise<ImdbParentalAdvisory> {
    // 1. Check SQLite Cache
    const cached = await getStoredParentalAdvisory(item.ratingKey, serverId);
    if (cached) return cached;

    // 2. Query AI batch with single item
    const resolvedMap = await resolveParentalAdvisoryBatchAI([{
        ratingKey: item.ratingKey,
        title: item.title,
        year: item.year,
        type: item.type || "movie",
        imdbId: item.imdbId,
        mpaaRating: item.contentRating
    }]);

    const advisory = resolvedMap[item.ratingKey] || resolveParentalAdvisoryFallback(item);

    // 3. Persist to DB cache
    await saveParentalAdvisory(item.ratingKey, serverId, item.title, advisory, {
        imdbId: item.imdbId,
        mpaaRating: item.contentRating
    });

    return advisory;
}

/**
 * Apply formatted parental tags to a specific Plex media item.
 */
export async function applyParentalTagsToPlexItem(
    serverUrlOrCandidates: string | string[],
    token: string,
    sectionKey: string | number,
    item: {
        ratingKey: string;
        title: string;
        type?: string;
    },
    advisory: ImdbParentalAdvisory,
    options: ParentalTaggingOptions
): Promise<{ success: boolean; appliedTags: string[]; error?: string }> {
    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);
    const mediaType = item.type === "show" ? "show" : "movie";
    const typeId = mediaType === "show" ? 2 : 1;

    const minSeverity = options.minSeverity || "Mild";
    const format = options.format || "prefix_category_severity";
    const prefix = options.prefix || "IMDb";
    const target = options.target || "labels";
    const enabledCategories = options.categories || (["nudity", "violence", "profanity", "alcohol", "frightening"] as ParentalCategoryKey[]);

    // 1. Compute which tags to apply
    const tagsToApply: string[] = [];
    const categoryKeys: ParentalCategoryKey[] = ["nudity", "violence", "profanity", "alcohol", "frightening"];

    for (const cat of categoryKeys) {
        if (!enabledCategories.includes(cat)) continue;
        const sev = advisory[cat];
        if (meetsSeverityThreshold(sev, minSeverity)) {
            const formatted = formatParentalTag(cat, sev, format, prefix);
            tagsToApply.push(formatted);
        }
    }

    if (options.dryRun) {
        return { success: true, appliedTags: tagsToApply };
    }

    let lastError: any = null;

    for (const cleanBase of urlsToTry) {
        try {
            // 2. Query current item metadata to preserve non-parental labels/genres
            const metaRes = await fetch(`${cleanBase}/library/metadata/${encodeURIComponent(item.ratingKey)}?includeGuids=1&X-Plex-Token=${encodeURIComponent(token)}`, {
                headers: { "Accept": "application/json", "X-Plex-Token": token }
            });

            let existingLabels: string[] = [];
            let existingGenres: string[] = [];

            if (metaRes.ok) {
                const metaData = await metaRes.json();
                const meta = metaData.MediaContainer?.Metadata?.[0];
                if (meta?.Label) {
                    existingLabels = meta.Label.map((l: any) => l.tag).filter((t: string) => !isParentalTag(t, prefix));
                }
                if (meta?.Genre) {
                    existingGenres = meta.Genre.map((g: any) => g.tag).filter((t: string) => !isParentalTag(t, prefix));
                }
            }

            // 3. Formulate update parameters
            const params = new URLSearchParams();
            params.set("type", String(typeId));
            params.set("id", String(item.ratingKey));

            if (target === "labels" || target === "both") {
                const mergedLabels = Array.from(new Set([...existingLabels, ...tagsToApply]));
                mergedLabels.forEach((lbl, idx) => {
                    params.set(`label[${idx}].tag.tag`, lbl);
                });
                params.set("label.locked", "1");
            }

            if (target === "genres" || target === "both") {
                const mergedGenres = Array.from(new Set([...existingGenres, ...tagsToApply]));
                mergedGenres.forEach((g, idx) => {
                    params.set(`genre[${idx}].tag.tag`, g);
                });
                params.set("genre.locked", "1");
            }

            // 4. Send PUT request to Plex
            const url = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?${params.toString()}&X-Plex-Token=${encodeURIComponent(token)}`;
            const res = await fetch(url, {
                method: "PUT",
                headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
            });

            if (!res.ok) {
                // Fallback to /library/metadata/{ratingKey}
                const fallbackUrl = `${cleanBase}/library/metadata/${encodeURIComponent(item.ratingKey)}?${params.toString()}&X-Plex-Token=${encodeURIComponent(token)}`;
                await fetch(fallbackUrl, {
                    method: "PUT",
                    headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                });
            }

            return { success: true, appliedTags: tagsToApply };
        } catch (e: any) {
            lastError = e;
        }
    }

    return { success: false, appliedTags: [], error: lastError?.message || "Failed to apply parental tags" };
}

/**
 * Strips all parental rating tags from a Plex media item.
 */
export async function clearParentalTagsFromPlexItem(
    serverUrlOrCandidates: string | string[],
    token: string,
    sectionKey: string | number,
    item: {
        ratingKey: string;
        type?: string;
    },
    prefix = "IMDb"
): Promise<{ success: boolean; error?: string }> {
    const urlsToTry = expandCandidateUrls(serverUrlOrCandidates);
    const mediaType = item.type === "show" ? "show" : "movie";
    const typeId = mediaType === "show" ? 2 : 1;

    let lastError: any = null;

    for (const cleanBase of urlsToTry) {
        try {
            const metaRes = await fetch(`${cleanBase}/library/metadata/${encodeURIComponent(item.ratingKey)}?includeGuids=1&X-Plex-Token=${encodeURIComponent(token)}`, {
                headers: { "Accept": "application/json", "X-Plex-Token": token }
            });

            if (!metaRes.ok) {
                lastError = new Error(`HTTP ${metaRes.status}`);
                continue;
            }
            const metaData = await metaRes.json();
            const meta = metaData.MediaContainer?.Metadata?.[0];

            const remainingLabels: string[] = (meta?.Label || [])
                .map((l: any) => l.tag)
                .filter((t: string) => !isParentalTag(t, prefix));

            const remainingGenres: string[] = (meta?.Genre || [])
                .map((g: any) => g.tag)
                .filter((t: string) => !isParentalTag(t, prefix));

            const params = new URLSearchParams();
            params.set("type", String(typeId));
            params.set("id", String(item.ratingKey));

            // Clear or reset labels
            if (remainingLabels.length > 0) {
                remainingLabels.forEach((lbl, idx) => params.set(`label[${idx}].tag.tag`, lbl));
            } else {
                params.set("label[0].tag.tag", ""); // Empty tag clears in Plex
            }

            // Clear or reset genres
            if (remainingGenres.length > 0) {
                remainingGenres.forEach((g, idx) => params.set(`genre[${idx}].tag.tag`, g));
            }

            const url = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?${params.toString()}&X-Plex-Token=${encodeURIComponent(token)}`;
            await fetch(url, {
                method: "PUT",
                headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
            });

            return { success: true };
        } catch (e: any) {
            lastError = e;
        }
    }

    return { success: false, error: lastError?.message || "Failed to clear parental tags" };
}

/**
 * Scans an entire Plex Library Section and applies parental tags to all movies or TV shows.
 */
export async function applyParentalTagsToLibrary(
    serverId: string,
    sectionKey: string | number,
    options: ParentalTaggingOptions = {}
): Promise<{
    success: boolean;
    totalEvaluated: number;
    taggedCount: number;
    skippedCount: number;
    appliedTagsSummary: Record<string, number>;
    error?: string;
}> {
    const resolved = await resolveWorkingPlexServerConnection(serverId);
    if (!resolved || !resolved.serverUrl) {
        return { success: false, totalEvaluated: 0, taggedCount: 0, skippedCount: 0, appliedTagsSummary: {}, error: "Plex server unreachable or token not configured." };
    }

    const serverToken = resolved.token;
    const serverUrl = resolved.serverUrl;
    const serverName = resolved.serverName;

    logger.addLog("INFO", "CURATION", `Starting IMDb Parental Rating Tagging for library section ${sectionKey} on "${serverName}"...`);

    const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];
    const items: PlexMediaStreamInfo[] = await getPlexLibraryMediaItems(urlsToTry, serverToken, sectionKey, 1000);
    if (items.length === 0) {
        return { success: true, totalEvaluated: 0, taggedCount: 0, skippedCount: 0, appliedTagsSummary: {} };
    }

    const appliedTagsSummary: Record<string, number> = {};
    let taggedCount = 0;
    let skippedCount = 0;

    // Process in batches of 25 items for fast AI resolution
    const BATCH_SIZE = 25;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);

        // 1. Identify which items need AI resolution vs cached
        const needsAi: any[] = [];
        const batchAdvisories: Record<string, ImdbParentalAdvisory> = {};

        for (const it of batch) {
            const cached = await getStoredParentalAdvisory(it.ratingKey, resolved.serverId);
            if (cached) {
                batchAdvisories[it.ratingKey] = cached;
            } else {
                needsAi.push({
                    ratingKey: it.ratingKey,
                    title: it.title,
                    year: it.year,
                    type: it.type || "movie",
                    imdbId: it.guids?.imdb,
                    mpaaRating: it.contentRating
                });
            }
        }

        // 2. Resolve AI batch if needed
        if (needsAi.length > 0) {
            const aiResults = await resolveParentalAdvisoryBatchAI(needsAi);
            for (const it of needsAi) {
                const adv = aiResults[it.ratingKey] || resolveParentalAdvisoryFallback(it);
                batchAdvisories[it.ratingKey] = adv;
                // Save to DB cache
                await saveParentalAdvisory(it.ratingKey, resolved.serverId, it.title, adv, {
                    imdbId: it.imdbId,
                    mpaaRating: it.mpaaRating
                });
            }
        }

        // 3. Apply tags to Plex items
        for (const it of batch) {
            const adv = batchAdvisories[it.ratingKey];
            if (!adv) {
                skippedCount++;
                continue;
            }

            const res = await applyParentalTagsToPlexItem(urlsToTry, serverToken, sectionKey, it, adv, options);
            if (res.success && res.appliedTags.length > 0) {
                taggedCount++;
                for (const t of res.appliedTags) {
                    appliedTagsSummary[t] = (appliedTagsSummary[t] || 0) + 1;
                }
            } else {
                skippedCount++;
            }
        }
    }

    logger.addLog("SUCCESS", "CURATION", `Completed IMDb Parental Tagging for "${serverName}": Tagged ${taggedCount} items (${skippedCount} skipped/none).`);

    return {
        success: true,
        totalEvaluated: items.length,
        taggedCount,
        skippedCount,
        appliedTagsSummary
    };
}

/**
 * Clears all parental tags from an entire Plex library section.
 */
export async function clearParentalTagsFromLibrary(
    serverId: string,
    sectionKey: string | number,
    prefix = "IMDb"
): Promise<{ success: boolean; clearedCount: number; error?: string }> {
    const resolved = await resolveWorkingPlexServerConnection(serverId);
    if (!resolved || !resolved.serverUrl) {
        return { success: false, clearedCount: 0, error: "Plex server unreachable or token not configured." };
    }

    const serverToken = resolved.token;
    const serverUrl = resolved.serverUrl;
    const serverName = resolved.serverName;

    logger.addLog("INFO", "CURATION", `Clearing all IMDb Parental Tags from library section ${sectionKey} on "${serverName}"...`);

    const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];
    const items: PlexMediaStreamInfo[] = await getPlexLibraryMediaItems(urlsToTry, serverToken, sectionKey, 1000);
    let clearedCount = 0;

    for (const it of items) {
        const res = await clearParentalTagsFromPlexItem(urlsToTry, serverToken, sectionKey, it, prefix);
        if (res.success) clearedCount++;
    }

    logger.addLog("SUCCESS", "CURATION", `Cleared parental tags from ${clearedCount} items on "${serverName}".`);

    return { success: true, clearedCount };
}

/**
 * Retrieves cached parental advisories for all items in a library section.
 */
export async function getStoredParentalAdvisoriesForLibrary(
    serverId: string,
    sectionKey: string | number
): Promise<{
    items: Array<{
        ratingKey: string;
        title: string;
        year?: number;
        contentRating?: string;
        advisory: ImdbParentalAdvisory | null;
        appliedTags?: string[];
    }>;
}> {
    try {
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { items: [] };

        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
        const mediaItems = await getPlexLibraryMediaItems(urlsToTry, resolved.token, sectionKey, 500);

        const ratingKeys = mediaItems.map(m => m.ratingKey);
        const advisories = await prisma.mediaContentAdvisory.findMany({
            where: {
                ratingKey: { in: ratingKeys },
                serverId: resolved.serverId
            }
        });

        const advMap = new Map<string, ImdbParentalAdvisory>();
        for (const adv of advisories) {
            advMap.set(adv.ratingKey, {
                nudity: (adv.nudityLevel as ParentalSeverity) || "None",
                violence: (adv.violenceLevel as ParentalSeverity) || "None",
                profanity: (adv.profanityLevel as ParentalSeverity) || "None",
                alcohol: (adv.alcoholLevel as ParentalSeverity) || "None",
                frightening: (adv.frighteningLevel as ParentalSeverity) || "None",
                certificate: adv.mpaaRating || undefined,
                summary: adv.leavingReason || undefined,
                source: "cache"
            });
        }

        return {
            items: mediaItems.map(m => ({
                ratingKey: m.ratingKey,
                title: m.title,
                year: m.year,
                contentRating: m.contentRating,
                advisory: advMap.get(m.ratingKey) || null
            }))
        };
    } catch (e) {
        return { items: [] };
    }
}

/**
 * Applies a custom tag (Label, Genre, or Collection) to media matching a rule.
 */
export async function applyCustomTagRuleToLibrary(
    serverId: string,
    sectionKey: string | number,
    rule: CustomTagRule
): Promise<{
    success: boolean;
    totalEvaluated: number;
    taggedCount: number;
    skippedCount: number;
    error?: string;
}> {
    const resolved = await resolveWorkingPlexServerConnection(serverId);
    if (!resolved || !resolved.serverUrl) {
        return { success: false, totalEvaluated: 0, taggedCount: 0, skippedCount: 0, error: "Plex server unreachable or token not configured." };
    }

    const serverToken = resolved.token;
    const serverUrl = resolved.serverUrl;
    const serverName = resolved.serverName;
    const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];

    logger.addLog("INFO", "CURATION", `Applying custom tag "${rule.tagName}" (${rule.field}) on section ${sectionKey} on "${serverName}"...`);

    const items: PlexMediaStreamInfo[] = await getPlexLibraryMediaItems(urlsToTry, serverToken, sectionKey, 1500);
    let taggedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
        let matches = false;

        const itemRes = (item.detectedBadges?.resolution || item.media?.[0]?.videoResolution || "").toLowerCase();
        const itemHdr = (item.detectedBadges?.hdr || item.media?.[0]?.hdrFormat || "").toLowerCase();
        const itemAudio = (item.detectedBadges?.audio || item.media?.[0]?.audioCodec || "").toLowerCase();

        switch (rule.filterType) {
            case "all":
                matches = true;
                break;
            case "resolution":
                matches = Boolean(itemRes && itemRes.includes((rule.filterValue || "").toLowerCase()));
                break;
            case "hdr":
                matches = Boolean(itemHdr && itemHdr.includes((rule.filterValue || "").toLowerCase()));
                break;
            case "audio":
                matches = Boolean(itemAudio && itemAudio.includes((rule.filterValue || "").toLowerCase()));
                break;
            case "studio":
                matches = Boolean(item.studio && item.studio.toLowerCase().includes((rule.filterValue || "").toLowerCase()));
                break;
            case "decade":
                if (item.year && rule.filterValue) {
                    const startYear = parseInt(rule.filterValue, 10);
                    matches = item.year >= startYear && item.year < startYear + 10;
                }
                break;
            case "contentRating":
                matches = Boolean(item.contentRating && item.contentRating.toLowerCase() === (rule.filterValue || "").toLowerCase());
                break;
            case "rating_above":
                matches = Boolean(item.rating && item.rating >= parseFloat(rule.filterValue || "7.0"));
                break;
            case "rating_below":
                matches = Boolean(item.rating && item.rating < parseFloat(rule.filterValue || "5.0"));
                break;
            default:
                matches = true;
        }

        if (!matches) {
            skippedCount++;
            continue;
        }

        // Apply tag to Plex Item
        const mediaType = item.type === "show" ? "show" : "movie";
        const typeId = mediaType === "show" ? 2 : 1;

        for (const cleanBase of urlsToTry) {
            try {
                const metaRes = await fetch(`${cleanBase}/library/metadata/${encodeURIComponent(item.ratingKey)}?X-Plex-Token=${encodeURIComponent(serverToken)}`, {
                    headers: { "Accept": "application/json", "X-Plex-Token": serverToken }
                });

                let existingTags: string[] = [];
                if (metaRes.ok) {
                    const metaData = await metaRes.json();
                    const meta = metaData.MediaContainer?.Metadata?.[0];
                    if (rule.field === "label" && meta?.Label) {
                        existingTags = meta.Label.map((l: any) => l.tag);
                    } else if (rule.field === "genre" && meta?.Genre) {
                        existingTags = meta.Genre.map((g: any) => g.tag);
                    } else if (rule.field === "collection" && meta?.Collection) {
                        existingTags = meta.Collection.map((c: any) => c.tag);
                    }
                }

                if (existingTags.includes(rule.tagName)) {
                    // Already has tag
                    taggedCount++;
                    break;
                }

                const merged = Array.from(new Set([...existingTags, rule.tagName]));
                const params = new URLSearchParams();
                params.set("type", String(typeId));
                params.set("id", String(item.ratingKey));

                merged.forEach((t, idx) => {
                    params.set(`${rule.field}[${idx}].tag.tag`, t);
                });
                params.set(`${rule.field}.locked`, "1");

                const url = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?${params.toString()}&X-Plex-Token=${encodeURIComponent(serverToken)}`;
                const putRes = await fetch(url, {
                    method: "PUT",
                    headers: { "X-Plex-Token": serverToken, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                });

                if (putRes.ok) {
                    taggedCount++;
                    break;
                }
            } catch (e) {}
        }
    }

    logger.addLog("SUCCESS", "CURATION", `Applied custom tag "${rule.tagName}" to ${taggedCount} items (${skippedCount} skipped).`);

    return {
        success: true,
        totalEvaluated: items.length,
        taggedCount,
        skippedCount
    };
}

/**
 * Removes a specific custom tag from all items in a library section.
 */
export async function clearCustomTagFromLibrary(
    serverId: string,
    sectionKey: string | number,
    tagName: string,
    field: "label" | "genre" | "collection" = "label"
): Promise<{ success: boolean; clearedCount: number; error?: string }> {
    const resolved = await resolveWorkingPlexServerConnection(serverId);
    if (!resolved || !resolved.serverUrl) {
        return { success: false, clearedCount: 0, error: "Plex server unreachable or token not configured." };
    }

    const serverToken = resolved.token;
    const serverUrl = resolved.serverUrl;
    const serverName = resolved.serverName;
    const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];

    logger.addLog("INFO", "CURATION", `Removing custom tag "${tagName}" (${field}) from section ${sectionKey} on "${serverName}"...`);

    const items: PlexMediaStreamInfo[] = await getPlexLibraryMediaItems(urlsToTry, serverToken, sectionKey, 1500);
    let clearedCount = 0;

    for (const item of items) {
        const mediaType = item.type === "show" ? "show" : "movie";
        const typeId = mediaType === "show" ? 2 : 1;

        for (const cleanBase of urlsToTry) {
            try {
                const metaRes = await fetch(`${cleanBase}/library/metadata/${encodeURIComponent(item.ratingKey)}?X-Plex-Token=${encodeURIComponent(serverToken)}`, {
                    headers: { "Accept": "application/json", "X-Plex-Token": serverToken }
                });

                if (!metaRes.ok) continue;
                const metaData = await metaRes.json();
                const meta = metaData.MediaContainer?.Metadata?.[0];

                let existingTags: string[] = [];
                if (field === "label" && meta?.Label) existingTags = meta.Label.map((l: any) => l.tag);
                else if (field === "genre" && meta?.Genre) existingTags = meta.Genre.map((g: any) => g.tag);
                else if (field === "collection" && meta?.Collection) existingTags = meta.Collection.map((c: any) => c.tag);

                if (!existingTags.includes(tagName)) break;

                const remaining = existingTags.filter(t => t !== tagName);
                const params = new URLSearchParams();
                params.set("type", String(typeId));
                params.set("id", String(item.ratingKey));

                if (remaining.length > 0) {
                    remaining.forEach((t, idx) => {
                        params.set(`${field}[${idx}].tag.tag`, t);
                    });
                } else {
                    params.set(`${field}[0].tag.tag`, "");
                }

                const url = `${cleanBase}/library/sections/${encodeURIComponent(String(sectionKey))}/all?${params.toString()}&X-Plex-Token=${encodeURIComponent(serverToken)}`;
                const putRes = await fetch(url, {
                    method: "PUT",
                    headers: { "X-Plex-Token": serverToken, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                });

                if (putRes.ok) {
                    clearedCount++;
                    break;
                }
            } catch (e) {}
        }
    }

    logger.addLog("SUCCESS", "CURATION", `Removed custom tag "${tagName}" from ${clearedCount} items.`);

    return { success: true, clearedCount };
}

/**
 * Scans a Plex library section and returns an audit of all active Labels, Genres, and Collections with counts.
 */
export async function getPlexLibraryTagsAudit(
    serverId: string,
    sectionKey: string | number
): Promise<{
    labels: Array<{ tag: string; count: number; isParental: boolean }>;
    genres: Array<{ tag: string; count: number; isParental: boolean }>;
    collections: Array<{ tag: string; count: number }>;
    totalItems: number;
}> {
    try {
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { labels: [], genres: [], collections: [], totalItems: 0 };

        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
        const items = await getPlexLibraryMediaItems(urlsToTry, resolved.token, sectionKey, 1000);

        const labelCounts: Record<string, number> = {};
        const genreCounts: Record<string, number> = {};
        const collectionCounts: Record<string, number> = {};

        // In a single pass, fetch metadata or summarize tags
        for (const item of items) {
            // Note: getPlexLibraryMediaItems gets summary. To get deep tags for each item:
            // if available on item
            if ((item as any).labels) {
                for (const l of (item as any).labels) {
                    labelCounts[l] = (labelCounts[l] || 0) + 1;
                }
            }
            if ((item as any).genres) {
                for (const g of (item as any).genres) {
                    genreCounts[g] = (genreCounts[g] || 0) + 1;
                }
            }
        }

        const labels = Object.entries(labelCounts).map(([tag, count]) => ({
            tag,
            count,
            isParental: isParentalTag(tag)
        })).sort((a, b) => b.count - a.count);

        const genres = Object.entries(genreCounts).map(([tag, count]) => ({
            tag,
            count,
            isParental: isParentalTag(tag)
        })).sort((a, b) => b.count - a.count);

        const collections = Object.entries(collectionCounts).map(([tag, count]) => ({
            tag,
            count
        })).sort((a, b) => b.count - a.count);

        return {
            labels,
            genres,
            collections,
            totalItems: items.length
        };
    } catch (e) {
        return { labels: [], genres: [], collections: [], totalItems: 0 };
    }
}
