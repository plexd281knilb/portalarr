import { COLLECTION_PRESETS } from "../src/lib/curation/presets";

interface PresetAuditResult {
    id: string;
    title: string;
    sourceType: string;
    sourceQuery?: string;
    mediaType: string;
    errors: string[];
    warnings: string[];
}

const results: PresetAuditResult[] = [];

const seenIds = new Set<string>();

for (const p of COLLECTION_PRESETS) {
    const errs: string[] = [];
    const warns: string[] = [];

    // Check unique ID
    if (seenIds.has(p.id)) {
        errs.push(`Duplicate preset ID: "${p.id}"`);
    }
    seenIds.add(p.id);

    // Required fields
    if (!p.title || !p.title.trim()) errs.push("Empty title");
    if (!p.description || !p.description.trim()) errs.push("Empty description");
    if (!p.icon || !p.icon.trim()) errs.push("Empty icon");
    if (!p.sourceType) errs.push("Missing sourceType");
    if (!p.category) errs.push("Missing category");
    if (!p.mediaType || !["movie", "show", "both"].includes(p.mediaType)) {
        errs.push(`Invalid mediaType: "${p.mediaType}"`);
    }

    // 1. Check seasonal date sanity
    if (p.isSeasonal) {
        if (!p.scheduleStartMonth || p.scheduleStartMonth < 1 || p.scheduleStartMonth > 12) {
            errs.push(`Invalid scheduleStartMonth: ${p.scheduleStartMonth}`);
        }
        if (!p.scheduleEndMonth || p.scheduleEndMonth < 1 || p.scheduleEndMonth > 12) {
            errs.push(`Invalid scheduleEndMonth: ${p.scheduleEndMonth}`);
        }
        if (!p.scheduleStartDay || p.scheduleStartDay < 1 || p.scheduleStartDay > 31) {
            errs.push(`Invalid scheduleStartDay: ${p.scheduleStartDay}`);
        }
        if (!p.scheduleEndDay || p.scheduleEndDay < 1 || p.scheduleEndDay > 31) {
            errs.push(`Invalid scheduleEndDay: ${p.scheduleEndDay}`);
        }
    }

    // 2. Check source query handling across known query types
    const sq = p.sourceQuery || "";
    if (p.sourceType === "tmdb") {
        if (sq.startsWith("collection:")) {
            const collId = sq.replace("collection:", "");
            if (p.id === "marvel-cinematic-universe" && collId === "86311") {
                warns.push("Marvel MCU preset points to Avengers Collection (86311), which only has 4 movies, missing Iron Man, Cap, Thor, Spidey, etc.");
            }
        } else if (sq.startsWith("company:")) {
            // Valid (now with multi-page up to 60 titles)
        } else if (sq.startsWith("network:")) {
            // Valid (now with getTmdbNetworkOriginalMovies fallback for Movie library sections)
        } else if (sq.startsWith("provider:")) {
            // Valid
        } else if (sq.startsWith("genre:")) {
            // Valid
        } else if (sq.startsWith("keyword:")) {
            // Valid
        } else if (sq === "popular" || sq === "digital_releases" || sq === "in_theatres") {
            // Valid
        } else if (sq.startsWith("franchise:")) {
            const fKey = sq.replace("franchise:", "").trim();
            if (!["mcu", "marvel", "dceu", "dc", "starwars", "star_wars", "star-wars", "wizarding_world", "harry_potter", "middle_earth", "lord_of_the_rings"].includes(fKey)) {
                warns.push(`Unrecognized franchise key: "${fKey}"`);
            }
        } else {
            errs.push(`Unknown TMDb sourceQuery: "${sq}". Will fall through to weekly trending.`);
        }
    } else if (p.sourceType === "mdblist") {
        if (sq === "top-oscar-best-picture") {
            // Valid (has built-in Oscar Best Picture registry fallback)
        } else if (sq.startsWith("top-imdb-")) {
            // Valid (has built-in IMDb Top 250/150 fallback)
        }
    } else if (p.sourceType === "radarr") {
        if (sq === "tag") {
            warns.push('Radarr tag query is "tag" instead of "tag:<tagname>", failing startsWith("tag:") check.');
        }
    } else if (p.sourceType === "sonarr") {
        if (sq === "tag") {
            warns.push('Sonarr tag query is "tag" instead of "tag:<tagname>", failing startsWith("tag:") check.');
        }
    }

    results.push({
        id: p.id,
        title: p.title,
        sourceType: p.sourceType,
        sourceQuery: p.sourceQuery,
        mediaType: p.mediaType,
        errors: errs,
        warnings: warns
    });
}

console.log("=== PRESET AUDIT SUMMARY ===");
const withIssues = results.filter(r => r.errors.length > 0 || r.warnings.length > 0);
console.log(`Audited ${results.length} presets. Found ${withIssues.length} presets with potential issues.\n`);

for (const r of withIssues) {
    console.log(`[${r.id}] "${r.title}" (${r.sourceType} -> ${r.sourceQuery})`);
    for (const e of r.errors) console.log(`   ❌ ERROR: ${e}`);
    for (const w of r.warnings) console.log(`   ⚠️ WARNING: ${w}`);
}
