"use server";

import fs from "fs";
import path from "path";
import sharp from "sharp";
import prisma, { ensureSchemaColumns } from "@/lib/prisma";
import { decryptData, encryptData } from "@/lib/encryption";
import { getCurrentUser } from "@/app/auth-actions";
import { logger } from "@/lib/logger";
import { getPlexServerLibrarySections, getPlexServerSections, getPlexServerList, getPlexServers, resolveWorkingPlexServerConnection } from "@/lib/plex";
import { 
    getPlexLibraryMediaItems, 
    getPlexSingleItemMetadata,
    getPlexLibraryCollections, 
    syncPlexCollection, 
    deletePlexCollection, 
    updatePlexCollectionPromotionAndOrder,
    movePlexHub,
    reorderPlexHubsSelective,
    getPlexHubManagement,
    evaluatePruneCandidatesForServer,
    deleteMediaFromPlexServer,
    searchPlexLibraryItems,
    inspectPlexMediaItemFull,
    addLabelToPlexItem,
    removeLabelFromPlexItem,
    updatePlexItemTitle,
    updatePlexItemEdition,
    getPlexItemChildrenMetadata,
    refreshPlexLibrarySection,
    PlexMediaStreamInfo,
    PruneCandidateItem
} from "@/lib/curation/plex-analyzer";
import { 
    backupAndApplyOverlay, 
    computeMediaOverlayHash,
    restoreItemOriginalArtwork, 
    restoreAllOriginalArtworks, 
    OverlayOptions,
    generatePlaceholderPosterBuffer,
    generatePlaceholderRibbonSvg
} from "@/lib/curation/overlay-engine";
import { 
    getTmdbApiKey,
    getTmdbTrending, 
    getTmdbPopularMovies, 
    getTmdbPopularTv,
    getTmdbTopRatedMovies, 
    getTmdbTopRatedTv,
    getTmdbNowPlayingMovies, 
    getTmdbUpcomingMovies, 
    getTmdbCollection, 
    getTmdbStudioMovies, 
    getTmdbNetworkShows, 
    searchTmdbMovie, 
    searchTmdbTv,
    getTmdbStreamingProviderMedia,
    getDisneyTrending,
    getNetflixTrending,
    getTmdbVideos,
    TmdbMediaItem,
    TmdbVideoItem
} from "@/lib/curation/tmdb";
import { 
    getTraktTrendingMovies, 
    getTraktTrendingShows,
    getTraktPopularMovies, 
    getTraktPopularShows,
    getTraktAnticipatedMovies, 
    getTraktAnticipatedShows,
    getTraktBoxOfficeMovies, 
    getTraktUserList 
} from "@/lib/curation/trakt";
import { 
    getMdblistRatings, 
    getMdblistItems 
} from "@/lib/curation/mdblist";
import { getBuiltinImdbTopList } from "@/lib/curation/imdb-top250-data";
import { 
    COLLECTION_PRESETS, 
    CollectionPreset,
    BadgePresetPack,
    DiscoveredBadgeItem,
    PRESET_BADGE_PACKS,
    DEFAULT_BUILTIN_BADGE_DEFINITIONS
} from "@/lib/curation/presets";
import {
    applyParentalTagsToLibrary,
    clearParentalTagsFromLibrary,
    getStoredParentalAdvisoriesForLibrary,
    applyCustomTagRuleToLibrary,
    clearCustomTagFromLibrary,
    getPlexLibraryTagsAudit,
    getServerGuardRailsMap,
    getServerGuardRailConfig,
    saveServerGuardRailConfig,
    saveAllServerGuardRails,
    isMediaAllowedByServerGuardRail,
    resolveParentalAdvisory,
    saveParentalAdvisory,
    getStoredParentalAdvisory,
    ServerGuardRailConfig,
    ParentalTaggingOptions,
    ParentalCategoryKey,
    ParentalSeverity,
    CustomTagRule
} from "@/lib/curation/parental-guide";
import { downloadOrCopyTrailerVideo } from "@/lib/curation/trailer-downloader";
import {
    parseKometaYamlString,
    convertKometaLibraryToPortalarrOverlay,
    ParsedKometaConfig
} from "@/lib/curation/kometa-importer";
import { getEnabledArrInstances, getEnabledArrInstancesInternal, arrApiGet } from "@/app/arr-actions";

// Verify admin permissions
async function verifyAdmin() {
    const user = await getCurrentUser();
    const role = String(user?.role || "").toUpperCase();
    const status = String(user?.status || "APPROVED").toUpperCase();
    if (!user || role !== "ADMIN" || (status !== "APPROVED" && status !== "TRIAL")) {
        throw new Error("Unauthorized: Admin permissions required.");
    }
    return user;
}

/**
 * Recursively sets Unraid/Linux/NAS filesystem permissions on directories and files.
 * Default: 0o777 for directories (rwxrwxrwx) and 0o666 for files (rw-rw-rw-).
 */
function setPermissionsRecursive(targetPath: string, dirMode = 0o777, fileMode = 0o666) {
    if (!fs.existsSync(targetPath)) return;
    try {
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            try { fs.chmodSync(targetPath, dirMode); } catch {}
            const items = fs.readdirSync(targetPath);
            for (const item of items) {
                setPermissionsRecursive(path.join(targetPath, item), dirMode, fileMode);
            }
        } else {
            try { fs.chmodSync(targetPath, fileMode); } catch {}
        }
    } catch {}
}

/**
 * Strict verification that a media item's content rating is suitable for Kids & Family.
 * Rejects PG-13, TV-14, TV-MA, R, NC-17, NR (if unrated adult), etc.
 */
function isStrictKidsRating(contentRating?: string): boolean {
    if (!contentRating) return false;
    const normalized = contentRating.toUpperCase().replace(/^US[:\/]/, "").trim();
    if (normalized.includes("PG-13") || normalized.includes("TV-14") || normalized.includes("TV-MA") || normalized.includes("NC-17") || normalized === "R" || normalized.startsWith("R/")) {
        return false;
    }
    const validKidsRatings = new Set(["G", "PG", "TV-Y", "TV-Y7", "TV-Y7-FV", "TV-G", "TV-PG", "APPROVED", "PASSED", "ALL", "U"]);
    return validKidsRatings.has(normalized);
}

/**
 * Validates whether an item qualifies as Kids & Family media based on genres and strict content ratings.
 */
function isStrictKidsMedia(item: any): boolean {
    const cRating = (item.contentRating || "").toUpperCase().replace(/^US[:\/]/, "").trim();
    if (cRating.includes("PG-13") || cRating.includes("TV-14") || cRating.includes("TV-MA") || cRating.includes("NC-17") || cRating === "R" || cRating.startsWith("R/")) {
        return false;
    }
    const gList = (item.genres || item.genre || []).map((g: string) => g.toLowerCase());
    const hasFamilyGenre = gList.some((g: string) => g.includes("family") || g.includes("children") || g.includes("kids"));
    const hasAnimationGenre = gList.some((g: string) => g.includes("animation"));
    const hasKidsRating = isStrictKidsRating(cRating);

    if (hasFamilyGenre) return true;
    if (hasAnimationGenre && hasKidsRating) return true;
    return false;
}

/**
 * Deduplicates Plex library media items by TMDb ID or title+year so multi-edition / multi-cut items only appear once in collections.
 */
function deduplicatePlexLibraryItems(items: any[]): any[] {
    const seenTmdb = new Set<string>();
    const seenTitleYear = new Set<string>();
    const result: any[] = [];

    for (const it of items) {
        const tmdb = it.guids?.tmdb ? String(it.guids.tmdb) : null;
        const titleYear = `${it.title?.toLowerCase().trim()}_${it.year || ''}`;

        if (tmdb) {
            if (seenTmdb.has(tmdb)) continue;
            seenTmdb.add(tmdb);
        } else if (it.title) {
            if (seenTitleYear.has(titleYear)) continue;
            seenTitleYear.add(titleYear);
        }
        result.push(it);
    }
    return result;
}

function safeJsonParse<T>(val: any, fallback: T): T {
    if (val === null || val === undefined || val === "") return fallback;
    if (typeof val === "object") return val as T;
    try {
        return JSON.parse(val) as T;
    } catch {
        return fallback;
    }
}

export async function getCurationSettingsAction() {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    return {
        success: true,
        tmdbApiKey: settings?.tmdbApiKey || "",
        traktClientId: settings?.traktClientId || "",
        mdblistApiKey: settings?.mdblistApiKey || "",
        autoOverlaySync: settings?.autoOverlaySync ?? true,
        autoCollectionSync: settings?.autoCollectionSync ?? true,
        leavingSoonDiskThreshold: settings?.leavingSoonDiskThreshold ?? 15,
        enableAutoPruneDeletion: settings?.enableAutoPruneDeletion ?? false,
        pruneDryRun: settings?.pruneDryRun ?? true,
        pruneTagCollection: settings?.pruneTagCollection ?? true,
        pruneApplyOverlays: settings?.pruneApplyOverlays ?? true,
        pruneDeleteFromArr: settings?.pruneDeleteFromArr ?? false,
        pruneDeleteFromDisk: settings?.pruneDeleteFromDisk ?? false,
        pruneDaysNotice: settings?.pruneDaysNotice ?? 14,
        pruneMinAgeDays: settings?.pruneMinAgeDays ?? 90,
        pruneUnwatchedOnly: settings?.pruneUnwatchedOnly ?? true,
        pruneSortStrategy: settings?.pruneSortStrategy || "combined_oldest",
        pruneOldestLimit: settings?.pruneOldestLimit ?? 50,
        pruneRulePresets: safeJsonParse(settings?.pruneRulePresets, []),
        enabledServersForOverlays: safeJsonParse(settings?.enabledServersForOverlays, []),
        enabledServersForCollections: safeJsonParse(settings?.enabledServersForCollections, []),
        enabledServersForPruning: safeJsonParse(settings?.enabledServersForPruning, []),
        enabledServersForTagging: safeJsonParse(settings?.enabledServersForTagging, []),
        comingSoonShares: safeJsonParse(settings?.comingSoonShares, {}),
        serverStorageConfig: safeJsonParse(settings?.serverStorageConfig, {}),
        selectedGlancesDiskId: safeJsonParse<any>(settings?.serverStorageConfig, {})?.selectedGlancesDiskId || "",

        // Placeholder Timing & Overlay Settings
        placeholderDaysThreshold: settings?.placeholderDaysThreshold ?? 90,
        placeholderTheatricalNoticeDays: settings?.placeholderTheatricalNoticeDays ?? 60,
        placeholderDigitalCountdownDays: settings?.placeholderDigitalCountdownDays ?? 30,
        placeholderNowStreamingGraceDays: settings?.placeholderNowStreamingGraceDays ?? 7,
        placeholderAutoPruneDays: settings?.placeholderAutoPruneDays ?? 14,
        placeholderBannerPosition: settings?.placeholderBannerPosition || "bottom",
        placeholderBannerTheme: settings?.placeholderBannerTheme || "indigo-purple",
        placeholderBannerFontSize: settings?.placeholderBannerFontSize ?? 44,
        placeholderCustomText: settings?.placeholderCustomText || "",
        placeholderBannerTemplates: safeJsonParse(settings?.placeholderBannerTemplates, {}),
        placeholderEnabled: settings?.placeholderEnabled ?? true,

        // Pruning Banner Appearance Settings
        pruneBannerPosition: settings?.pruneBannerPosition || "bottom",
        pruneBannerTheme: settings?.pruneBannerTheme || "crimson-red",
        pruneBannerText: settings?.pruneBannerText || "LEAVING ON {date}",
        pruneBannerFontSize: settings?.pruneBannerFontSize ?? 44,
        pruneBannerType: (settings as any)?.pruneBannerType || "leaving_date",
        pruneBannerTemplates: safeJsonParse((settings as any)?.pruneBannerTemplates, {}),

        // Leaving Soon Home Hub & Schedule Settings
        leavingSoonPromotedToHome: settings?.leavingSoonPromotedToHome ?? true,
        leavingSoonPromotedToRecommended: settings?.leavingSoonPromotedToRecommended ?? true,
        leavingSoonPromotedToSharedHome: settings?.leavingSoonPromotedToSharedHome ?? true,
        leavingSoonHomeOrder: settings?.leavingSoonHomeOrder ?? 0,
        leavingSoonAutoThresholdDays: settings?.leavingSoonAutoThresholdDays ?? 14,
        leavingSoonAutoHideEmpty: settings?.leavingSoonAutoHideEmpty ?? true,

        // IMDb Parental Advisory Tagging Settings
        parentalTaggingEnabled: settings?.parentalTaggingEnabled ?? true,
        parentalTagFormat: settings?.parentalTagFormat || "prefix_category_severity",
        parentalTagPrefix: settings?.parentalTagPrefix || "IMDb",
        parentalTagTarget: settings?.parentalTagTarget || "labels",
        parentalMinSeverity: settings?.parentalMinSeverity || "Mild",
        parentalCategories: safeJsonParse(settings?.parentalCategories, ["nudity", "violence", "profanity", "alcohol", "frightening"]),
        curationSyncParentalTags: settings?.curationSyncParentalTags ?? true,

        // Curation Scheduler Timer & Automation Settings
        curationSyncEnabled: settings?.curationSyncEnabled ?? true,
        curationSyncSchedule: settings?.curationSyncSchedule || "every_6_hours",
        curationSyncCron: settings?.curationSyncCron || null,
        curationSyncOverlays: settings?.curationSyncOverlays ?? true,
        curationSyncCollections: settings?.curationSyncCollections ?? true,
        curationSyncReleases: settings?.curationSyncReleases ?? true,
        curationSyncPruning: settings?.curationSyncPruning ?? true,
        curationLastRunAt: settings?.curationLastRunAt ? settings.curationLastRunAt.toISOString() : null,
        curationLastRunStatus: safeJsonParse(settings?.curationLastRunStatus, null)
    };
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Failed loading curation settings: ${e.message}`);
        return { success: false, error: e.message || "Failed loading curation settings." } as any;
    }
}

/**
 * Check if a specific library section is enabled in an enabled-list of server/section keys.
 * Uses strict per-server isolation so configuring one server NEVER breaks or disables other servers.
 */
export async function isSectionEnabledInList(list: string[] | undefined | null, serverId: string, sectionKey: string): Promise<boolean> {
    if (!list || list.length === 0) return true; // Default: all servers & sections enabled

    // 1. Explicit server-level or section-level disabled flags
    if (list.includes(`disabled:${serverId}`) || list.includes(`${serverId}:none`)) {
        return false;
    }
    if (list.includes(`disabled:${serverId}:${sectionKey}`)) {
        return false;
    }

    // 2. Check if this exact server:section is listed
    const compoundKey = `${serverId}:${sectionKey}`;
    if (list.includes(compoundKey)) {
        return true;
    }

    // 3. Check if there are any specific entries for this server in the list
    const hasServerEntries = list.some(k => 
        k === serverId || 
        k.startsWith(`${serverId}:`) || 
        k.startsWith(`disabled:${serverId}`)
    );

    // If there are explicit entries configured for this server, and compoundKey is NOT among them:
    if (hasServerEntries) {
        // If the entire server is explicitly enabled without section restrictions:
        if (list.includes(serverId) && !list.some(k => k.startsWith(`${serverId}:`))) {
            return true;
        }
        return false;
    }

    // 4. If this server has NO entries configured in the list, it defaults to ENABLED (unrestricted)
    return true;
}

/**
 * Toggle an individual library section enabled/disabled for Kometa, Agregarr, or Prune.
 * Strictly scopes modifications to the specified server without altering any other servers.
 */
export async function toggleCurationLibrarySectionAction(
    pageType: "kometa" | "agregarr" | "prune" | "tagging",
    serverId: string,
    sectionKey: string | number,
    enabled: boolean,
    allServerSections?: string[]
) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const fieldName = pageType === "kometa"
            ? "enabledServersForOverlays"
            : pageType === "agregarr"
                ? "enabledServersForCollections"
                : pageType === "tagging"
                    ? "enabledServersForTagging"
                    : "enabledServersForPruning";

        let currentList: string[] = settings?.[fieldName] ? JSON.parse(settings[fieldName] as string) : [];
        const strSecKey = String(sectionKey);

        // Keep all entries for OTHER servers intact
        const otherServerEntries = currentList.filter(k => 
            !k.startsWith(`${serverId}:`) && 
            k !== serverId && 
            !k.startsWith(`disabled:${serverId}`)
        );

        // Known sections for this server
        let allSecs = (allServerSections && allServerSections.length > 0)
            ? allServerSections.map(s => String(s))
            : [];

        if (allSecs.length === 0) {
            try {
                const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
                if (token) {
                    const secs = await getPlexServerSections(token, serverId);
                    allSecs = secs.map((s: any) => String(s.key));
                }
            } catch (err) {}
        }
        if (allSecs.length === 0) {
            allSecs = [strSecKey];
        }

        // Determine existing configured sections for this server
        const hasExistingEntries = currentList.some(k => k.startsWith(`${serverId}:`) || k === serverId || k.startsWith(`disabled:${serverId}`));
        
        let currentEnabledSections: string[];

        if (!hasExistingEntries) {
            // Server was previously unconfigured (all sections were enabled)
            if (enabled) {
                currentEnabledSections = allSecs;
            } else {
                currentEnabledSections = allSecs.filter(s => s !== strSecKey);
            }
        } else {
            const explicitSections = currentList
                .filter(k => k.startsWith(`${serverId}:`) && k !== `${serverId}:none`)
                .map(k => k.substring(`${serverId}:`.length));

            if (enabled) {
                currentEnabledSections = Array.from(new Set([...explicitSections, strSecKey]));
            } else {
                currentEnabledSections = explicitSections.filter(s => s !== strSecKey);
            }
        }

        // Build new entries for this server
        let thisServerEntries: string[];
        if (currentEnabledSections.length === 0) {
            thisServerEntries = [`${serverId}:none`];
        } else {
            thisServerEntries = currentEnabledSections.map(sec => `${serverId}:${sec}`);
        }

        const nextList = [...otherServerEntries, ...thisServerEntries];

        await prisma.settings.upsert({
            where: { id: "global" },
            update: { [fieldName]: JSON.stringify(nextList) },
            create: { id: "global", [fieldName]: JSON.stringify(nextList) }
        });

        // If Kometa, also sync rule enabled status if rule exists
        if (pageType === "kometa") {
            await prisma.mediaOverlayRule.updateMany({
                where: { serverId, sectionKey: strSecKey },
                data: { enabled }
            }).catch(() => {});
        }

        logger.addLog("INFO", "CURATION", `Toggled library section ${strSecKey} on server ${serverId} for ${pageType}: ${enabled ? 'ENABLED' : 'DISABLED'}`);
        return { success: true, enabledList: nextList };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Toggle ALL library sections for a specific server (Enable All / Disable All).
 */
export async function toggleAllCurationServerSectionsAction(
    pageType: "kometa" | "agregarr" | "prune" | "tagging",
    serverId: string,
    enableAll: boolean,
    allServerSections?: string[]
) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const fieldName = pageType === "kometa"
            ? "enabledServersForOverlays"
            : pageType === "agregarr"
                ? "enabledServersForCollections"
                : pageType === "tagging"
                    ? "enabledServersForTagging"
                    : "enabledServersForPruning";

        let currentList: string[] = settings?.[fieldName] ? JSON.parse(settings[fieldName] as string) : [];

        // Keep all entries for OTHER servers intact
        const otherServerEntries = currentList.filter(k => 
            !k.startsWith(`${serverId}:`) && 
            k !== serverId && 
            !k.startsWith(`disabled:${serverId}`)
        );

        let thisServerEntries: string[];
        if (enableAll) {
            let allSecs = (allServerSections && allServerSections.length > 0)
                ? allServerSections.map(s => String(s))
                : [];
            if (allSecs.length === 0) {
                try {
                    const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
                    if (token) {
                        const secs = await getPlexServerSections(token, serverId);
                        allSecs = secs.map((s: any) => String(s.key));
                    }
                } catch (err) {}
            }
            thisServerEntries = allSecs.length > 0
                ? allSecs.map(s => `${serverId}:${String(s)}`)
                : [`${serverId}`];
        } else {
            thisServerEntries = [`${serverId}:none`];
        }

        const nextList = [...otherServerEntries, ...thisServerEntries];

        await prisma.settings.upsert({
            where: { id: "global" },
            update: { [fieldName]: JSON.stringify(nextList) },
            create: { id: "global", [fieldName]: JSON.stringify(nextList) }
        });

        if (pageType === "kometa" && allServerSections && allServerSections.length > 0) {
            await prisma.mediaOverlayRule.updateMany({
                where: { serverId, sectionKey: { in: allServerSections.map(s => String(s)) } },
                data: { enabled: enableAll }
            }).catch(() => {});
        }

        logger.addLog("INFO", "CURATION", `${enableAll ? 'Enabled' : 'Disabled'} all library sections on server ${serverId} for ${pageType}`);
        return { success: true, enabledList: nextList };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function saveCurationSettingsAction(data: {
    tmdbApiKey?: string;
    traktClientId?: string;
    mdblistApiKey?: string;
    autoOverlaySync?: boolean;
    autoCollectionSync?: boolean;
    leavingSoonDiskThreshold?: number;
    enableAutoPruneDeletion?: boolean;
    pruneDryRun?: boolean;
    pruneTagCollection?: boolean;
    pruneApplyOverlays?: boolean;
    pruneDeleteFromArr?: boolean;
    pruneDeleteFromDisk?: boolean;
    pruneDaysNotice?: number;
    pruneMinAgeDays?: number;
    pruneUnwatchedOnly?: boolean;
    enabledServersForOverlays?: string[];
    enabledServersForCollections?: string[];
    enabledServersForPruning?: string[];
    enabledServersForTagging?: string[];
    comingSoonShares?: Record<string, string>;
    serverStorageConfig?: Record<string, any>;
    selectedGlancesDiskId?: string;
    placeholderDaysThreshold?: number;
    placeholderTheatricalNoticeDays?: number;
    placeholderDigitalCountdownDays?: number;
    placeholderNowStreamingGraceDays?: number;
    placeholderAutoPruneDays?: number;
    placeholderBannerPosition?: string;
    placeholderBannerTheme?: string;
    placeholderBannerFontSize?: number;
    placeholderCustomText?: string;
    placeholderBannerTemplates?: string | Record<string, any>;
    placeholderEnabled?: boolean;
    pruneBannerPosition?: string;
    pruneBannerTheme?: string;
    pruneBannerText?: string;
    pruneBannerFontSize?: number;
    pruneBannerType?: string;
    pruneBannerTemplates?: string | Record<string, any>;
    pruneSortStrategy?: string;
    pruneOldestLimit?: number;
    pruneRulePresets?: string | any[];
    leavingSoonPromotedToHome?: boolean;
    leavingSoonPromotedToRecommended?: boolean;
    leavingSoonPromotedToSharedHome?: boolean;
    leavingSoonHomeOrder?: number;
    leavingSoonAutoThresholdDays?: number;
    leavingSoonAutoHideEmpty?: boolean;
    curationSyncEnabled?: boolean;
    curationSyncSchedule?: string;
    curationSyncCron?: string | null;
    curationSyncOverlays?: boolean;
    curationSyncCollections?: boolean;
    curationSyncReleases?: boolean;
    curationSyncPruning?: boolean;
    curationSyncParentalTags?: boolean;
    parentalTaggingEnabled?: boolean;
    parentalTagFormat?: string;
    parentalTagPrefix?: string;
    parentalTagTarget?: string;
    parentalMinSeverity?: string;
    parentalCategories?: string[];
}) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const updatePayload: any = {};
        if (data.tmdbApiKey !== undefined) updatePayload.tmdbApiKey = data.tmdbApiKey;
        if (data.traktClientId !== undefined) updatePayload.traktClientId = data.traktClientId;
        if (data.mdblistApiKey !== undefined) updatePayload.mdblistApiKey = data.mdblistApiKey;
        if (data.autoOverlaySync !== undefined) updatePayload.autoOverlaySync = data.autoOverlaySync;
        if (data.autoCollectionSync !== undefined) updatePayload.autoCollectionSync = data.autoCollectionSync;
        if (data.leavingSoonDiskThreshold !== undefined) updatePayload.leavingSoonDiskThreshold = data.leavingSoonDiskThreshold;
        if (data.enableAutoPruneDeletion !== undefined) updatePayload.enableAutoPruneDeletion = data.enableAutoPruneDeletion;
        if (data.pruneDryRun !== undefined) updatePayload.pruneDryRun = data.pruneDryRun;
        if (data.pruneTagCollection !== undefined) updatePayload.pruneTagCollection = data.pruneTagCollection;
        if (data.pruneApplyOverlays !== undefined) updatePayload.pruneApplyOverlays = data.pruneApplyOverlays;
        if (data.pruneDeleteFromArr !== undefined) updatePayload.pruneDeleteFromArr = data.pruneDeleteFromArr;
        if (data.pruneDeleteFromDisk !== undefined) updatePayload.pruneDeleteFromDisk = data.pruneDeleteFromDisk;
        if (data.pruneDaysNotice !== undefined) updatePayload.pruneDaysNotice = data.pruneDaysNotice;
        if (data.pruneMinAgeDays !== undefined) updatePayload.pruneMinAgeDays = data.pruneMinAgeDays;
        if (data.pruneUnwatchedOnly !== undefined) updatePayload.pruneUnwatchedOnly = data.pruneUnwatchedOnly;
        if (data.enabledServersForOverlays !== undefined) updatePayload.enabledServersForOverlays = JSON.stringify(data.enabledServersForOverlays);
        if (data.enabledServersForCollections !== undefined) updatePayload.enabledServersForCollections = JSON.stringify(data.enabledServersForCollections);
        if (data.enabledServersForPruning !== undefined) updatePayload.enabledServersForPruning = JSON.stringify(data.enabledServersForPruning);
        if (data.enabledServersForTagging !== undefined) updatePayload.enabledServersForTagging = JSON.stringify(data.enabledServersForTagging);
        if (data.comingSoonShares !== undefined) updatePayload.comingSoonShares = JSON.stringify(data.comingSoonShares);
        if (data.serverStorageConfig !== undefined) {
            const config = { ...data.serverStorageConfig };
            if (data.selectedGlancesDiskId !== undefined) {
                config.selectedGlancesDiskId = data.selectedGlancesDiskId;
            }
            updatePayload.serverStorageConfig = JSON.stringify(config);
        } else if (data.selectedGlancesDiskId !== undefined) {
            const existingSettings = await prisma.settings.findFirst({ where: { id: "global" } });
            let config: Record<string, any> = {};
            if (existingSettings?.serverStorageConfig) {
                try { config = JSON.parse(existingSettings.serverStorageConfig); } catch (e) {}
            }
            config.selectedGlancesDiskId = data.selectedGlancesDiskId;
            updatePayload.serverStorageConfig = JSON.stringify(config);
        }

        // Placeholder & Leaving Soon Settings
        if (data.placeholderDaysThreshold !== undefined) updatePayload.placeholderDaysThreshold = data.placeholderDaysThreshold;
        if (data.placeholderTheatricalNoticeDays !== undefined) updatePayload.placeholderTheatricalNoticeDays = data.placeholderTheatricalNoticeDays;
        if (data.placeholderDigitalCountdownDays !== undefined) updatePayload.placeholderDigitalCountdownDays = data.placeholderDigitalCountdownDays;
        if (data.placeholderNowStreamingGraceDays !== undefined) updatePayload.placeholderNowStreamingGraceDays = data.placeholderNowStreamingGraceDays;
        if (data.placeholderAutoPruneDays !== undefined) updatePayload.placeholderAutoPruneDays = data.placeholderAutoPruneDays;
        if (data.placeholderBannerPosition !== undefined) updatePayload.placeholderBannerPosition = data.placeholderBannerPosition;
        if (data.placeholderBannerTheme !== undefined) updatePayload.placeholderBannerTheme = data.placeholderBannerTheme;
        if (data.placeholderBannerFontSize !== undefined) updatePayload.placeholderBannerFontSize = data.placeholderBannerFontSize;
        if (data.placeholderCustomText !== undefined) updatePayload.placeholderCustomText = data.placeholderCustomText;
        if (data.placeholderBannerTemplates !== undefined) {
            updatePayload.placeholderBannerTemplates = typeof data.placeholderBannerTemplates === "string"
                ? data.placeholderBannerTemplates
                : JSON.stringify(data.placeholderBannerTemplates);
        }
        if (data.placeholderEnabled !== undefined) updatePayload.placeholderEnabled = data.placeholderEnabled;

        if (data.pruneBannerPosition !== undefined) updatePayload.pruneBannerPosition = data.pruneBannerPosition;
        if (data.pruneBannerTheme !== undefined) updatePayload.pruneBannerTheme = data.pruneBannerTheme;
        if (data.pruneBannerText !== undefined) updatePayload.pruneBannerText = data.pruneBannerText;
        if (data.pruneBannerFontSize !== undefined) updatePayload.pruneBannerFontSize = data.pruneBannerFontSize;
        if (data.pruneBannerType !== undefined) updatePayload.pruneBannerType = data.pruneBannerType;
        if (data.pruneBannerTemplates !== undefined) {
            updatePayload.pruneBannerTemplates = typeof data.pruneBannerTemplates === "string"
                ? data.pruneBannerTemplates
                : JSON.stringify(data.pruneBannerTemplates);
        }
        if (data.pruneSortStrategy !== undefined) updatePayload.pruneSortStrategy = data.pruneSortStrategy;
        if (data.pruneOldestLimit !== undefined) updatePayload.pruneOldestLimit = data.pruneOldestLimit;
        if (data.pruneRulePresets !== undefined) {
            updatePayload.pruneRulePresets = typeof data.pruneRulePresets === "string"
                ? data.pruneRulePresets
                : JSON.stringify(data.pruneRulePresets);
        }

        if (data.leavingSoonPromotedToHome !== undefined) updatePayload.leavingSoonPromotedToHome = data.leavingSoonPromotedToHome;
        if (data.leavingSoonPromotedToRecommended !== undefined) updatePayload.leavingSoonPromotedToRecommended = data.leavingSoonPromotedToRecommended;
        if (data.leavingSoonPromotedToSharedHome !== undefined) updatePayload.leavingSoonPromotedToSharedHome = data.leavingSoonPromotedToSharedHome;
        if (data.leavingSoonHomeOrder !== undefined) updatePayload.leavingSoonHomeOrder = data.leavingSoonHomeOrder;
        if (data.leavingSoonAutoThresholdDays !== undefined) updatePayload.leavingSoonAutoThresholdDays = data.leavingSoonAutoThresholdDays;
        if (data.leavingSoonAutoHideEmpty !== undefined) updatePayload.leavingSoonAutoHideEmpty = data.leavingSoonAutoHideEmpty;

        // Curation Scheduler Timer Settings
        if (data.curationSyncEnabled !== undefined) updatePayload.curationSyncEnabled = data.curationSyncEnabled;
        if (data.curationSyncSchedule !== undefined) updatePayload.curationSyncSchedule = data.curationSyncSchedule;
        if (data.curationSyncCron !== undefined) updatePayload.curationSyncCron = data.curationSyncCron;
        if (data.curationSyncOverlays !== undefined) updatePayload.curationSyncOverlays = data.curationSyncOverlays;
        if (data.curationSyncCollections !== undefined) updatePayload.curationSyncCollections = data.curationSyncCollections;
        if (data.curationSyncReleases !== undefined) updatePayload.curationSyncReleases = data.curationSyncReleases;
        if (data.curationSyncPruning !== undefined) updatePayload.curationSyncPruning = data.curationSyncPruning;
        if (data.curationSyncParentalTags !== undefined) updatePayload.curationSyncParentalTags = data.curationSyncParentalTags;

        // IMDb Parental Advisory Tagging Settings
        if (data.parentalTaggingEnabled !== undefined) updatePayload.parentalTaggingEnabled = data.parentalTaggingEnabled;
        if (data.parentalTagFormat !== undefined) updatePayload.parentalTagFormat = data.parentalTagFormat;
        if (data.parentalTagPrefix !== undefined) updatePayload.parentalTagPrefix = data.parentalTagPrefix;
        if (data.parentalTagTarget !== undefined) updatePayload.parentalTagTarget = data.parentalTagTarget;
        if (data.parentalMinSeverity !== undefined) updatePayload.parentalMinSeverity = data.parentalMinSeverity;
        if (data.parentalCategories !== undefined) updatePayload.parentalCategories = JSON.stringify(data.parentalCategories);

        await prisma.settings.upsert({
            where: { id: "global" },
            update: updatePayload,
            create: {
                id: "global",
                ...updatePayload
            }
        });

        logger.addLog("SUCCESS", "SETTINGS", "Updated Curation, Kometa, Agregarr & Hub Settings.");
        return { success: true, message: "Curation settings updated successfully." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getPlexServersAndSectionsAction(targetServerId?: string) {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const serversWithSections = await getPlexServerLibrarySections(token, settings?.mainPlexUrl || undefined, targetServerId);
        return {
            success: true,
            servers: serversWithSections
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed fetching Plex servers & sections: ${e.message}`);
        return { success: false, error: e.message || "Failed fetching Plex servers & sections.", servers: [] };
    }
}

export async function getPlexServerSectionsAction(serverId: string) {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const sections = await getPlexServerSections(token, serverId);
        return {
            success: true,
            serverId,
            sections
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed fetching sections for server ${serverId}: ${e.message}`);
        return { success: false, error: e.message || "Failed fetching Plex library sections.", sections: [] };
    }
}

export interface DismissedHubItem {
    id?: string;
    ratingKey?: string;
    title: string;
    normalizedTitle: string;
    serverId?: string;
    sectionKey?: string;
    dismissedAt: string;
}

export async function getDismissedHubsInternal(): Promise<DismissedHubItem[]> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!settings?.dismissedHubs) return [];
        return JSON.parse(settings.dismissedHubs) as DismissedHubItem[];
    } catch {
        return [];
    }
}

export async function addDismissedHubInternal(item: { id?: string; ratingKey?: string; title: string; serverId?: string; sectionKey?: string }) {
    try {
        const list = await getDismissedHubsInternal();
        const norm = item.title.trim().toLowerCase();
        // Check if already in list
        const exists = list.some(d => 
            (item.ratingKey && d.ratingKey === item.ratingKey) || 
            (d.normalizedTitle === norm && (!item.serverId || !d.serverId || d.serverId === item.serverId) && (!item.sectionKey || !d.sectionKey || d.sectionKey === String(item.sectionKey)))
        );
        if (!exists) {
            list.push({
                id: item.id,
                ratingKey: item.ratingKey,
                title: item.title,
                normalizedTitle: norm,
                serverId: item.serverId,
                sectionKey: item.sectionKey ? String(item.sectionKey) : undefined,
                dismissedAt: new Date().toISOString()
            });
            await prisma.settings.update({
                where: { id: "global" },
                data: { dismissedHubs: JSON.stringify(list) }
            });
            logger.addLog("INFO", "PLEX", `Added collection/hub "${item.title}" (${item.ratingKey || 'no-key'}) to Dismissed Hubs ignore list.`);
        }
    } catch (e: any) {
        console.warn("[DISMISS-HUB] Failed adding dismissed hub:", e.message);
    }
}

export async function removeDismissedHubInternal(ratingKeyOrTitle: string, serverId?: string, sectionKey?: string) {
    try {
        const list = await getDismissedHubsInternal();
        const targetNorm = ratingKeyOrTitle.trim().toLowerCase();
        const filtered = list.filter(d => {
            if (d.ratingKey === ratingKeyOrTitle) return false;
            if (d.normalizedTitle === targetNorm || d.title.trim().toLowerCase() === targetNorm) {
                if (!serverId || !d.serverId || d.serverId === serverId) {
                    if (!sectionKey || !d.sectionKey || d.sectionKey === String(sectionKey)) return false;
                }
            }
            return true;
        });
        await prisma.settings.update({
            where: { id: "global" },
            data: { dismissedHubs: JSON.stringify(filtered) }
        });
    } catch (e: any) {
        console.warn("[DISMISS-HUB] Failed removing dismissed hub:", e.message);
    }
}

export async function getDismissedHubsAction() {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();
        const list = await getDismissedHubsInternal();
        return { success: true, dismissedHubs: list };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed fetching dismissed hubs: ${e.message}`);
        return { success: false, error: e.message || "Failed fetching dismissed hubs.", dismissedHubs: [] };
    }
}

export async function unignoreMediaCollectionAction(ratingKeyOrTitle: string, serverId?: string, sectionKey?: string) {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();
        await removeDismissedHubInternal(ratingKeyOrTitle, serverId, sectionKey);
        logger.addLog("SUCCESS", "PLEX", `Restored / un-ignored collection "${ratingKeyOrTitle}". It can now be re-imported from Plex.`);
        return { success: true, message: `Restored "${ratingKeyOrTitle}". You can now click 'Import from Plex' to re-import it.` };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed restoring dismissed collection "${ratingKeyOrTitle}": ${e.message}`);
        return { success: false, error: e.message || "Failed restoring dismissed collection." };
    }
}

export async function clearAllDismissedHubsAction(serverId?: string, sectionKey?: string) {
    try {
        await verifyAdmin();
        await ensureSchemaColumns();
        if (serverId && sectionKey) {
            const list = await getDismissedHubsInternal();
            const filtered = list.filter(d => !(d.serverId === serverId && d.sectionKey === String(sectionKey)));
            await prisma.settings.update({
                where: { id: "global" },
                data: { dismissedHubs: JSON.stringify(filtered) }
            });
        } else {
            await prisma.settings.update({
                where: { id: "global" },
                data: { dismissedHubs: JSON.stringify([]) }
            });
        }
        return { success: true, message: "Cleared all dismissed hubs." };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed clearing dismissed hubs: ${e.message}`);
        return { success: false, error: e.message || "Failed clearing dismissed hubs." };
    }
}

export async function getMediaCollectionsAction(serverId?: string, sectionKey?: string) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const rawCollections = await prisma.mediaCollection.findMany({
            where: {
                isIgnored: false,
                ...(serverId ? { serverId } : {}),
                ...(sectionKey ? { sectionKey: String(sectionKey) } : {})
            },
            orderBy: [
                { orderIndex: "asc" },
                { createdAt: "desc" }
            ]
        });

        // Deduplicate duplicate entries if any exist for the same (serverId, sectionKey, lowercased title)
        const groups = new Map<string, typeof rawCollections>();
        for (const coll of rawCollections) {
            const key = `${coll.serverId || "all"}_${coll.sectionKey || "all"}_${coll.title.trim().toLowerCase()}`;
            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key)!.push(coll);
        }

        const duplicateIdsToDelete: string[] = [];
        const dedupedCollections: typeof rawCollections = [];

        for (const [_, group] of groups.entries()) {
            if (group.length === 1) {
                dedupedCollections.push(group[0]);
            } else {
                group.sort((a, b) => {
                    if (a.ratingKey && !b.ratingKey) return -1;
                    if (!a.ratingKey && b.ratingKey) return 1;
                    if ((a.itemCount || 0) !== (b.itemCount || 0)) {
                        return (b.itemCount || 0) - (a.itemCount || 0);
                    }
                    const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
                    const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
                    return bTime - aTime;
                });

                const canonical = group[0];
                dedupedCollections.push(canonical);

                const dupeIds = group.slice(1).map(c => c.id);
                duplicateIdsToDelete.push(...dupeIds);
            }
        }

        if (duplicateIdsToDelete.length > 0) {
            logger.addLog("INFO", "PLEX", `Auto-healing ${duplicateIdsToDelete.length} duplicate collection records from database.`);
            await prisma.mediaCollection.deleteMany({
                where: {
                    id: { in: duplicateIdsToDelete }
                }
            }).catch(err => logger.addLog("WARN", "PLEX", `Failed deleting duplicate collections: ${err.message}`));
        }

        // Re-sort dedupedCollections by orderIndex
        dedupedCollections.sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0));

        return { success: true, collections: dedupedCollections, presets: COLLECTION_PRESETS };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Explicitly import / refresh all collections from a Plex library section into Portalarr
 */
export async function importPlexLibraryCollectionsAction(serverId?: string, sectionKey?: string) {
    try {

        await verifyAdmin();
        if (!serverId || !sectionKey) {
            return { success: false, error: "Please select a Plex server and library section first." };
        }

        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) {
            logger.addLog("WARN", "PLEX", `Could not resolve connection for Plex server "${serverId}". Check server URL and token.`);
            return { success: false, error: "Plex server unreachable or token not configured." };
        }

        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
        logger.addLog("INFO", "PLEX", `Importing collections/hubs for section ${sectionKey} on server "${resolved.serverName}" (trying: ${urlsToTry.join(", ")})`);

        const plexCollections = await getPlexLibraryCollections(urlsToTry, resolved.token, sectionKey);

        if (plexCollections.length === 0) {
            logger.addLog("WARN", "PLEX", `No collections or hubs returned by Plex server "${resolved.serverName}" for section ${sectionKey}. Verified URLs tried: ${urlsToTry.join(", ")}`);
            return { success: true, count: 0, message: "No existing collections or hubs found in this Plex library section." };
        }

        // Fetch current DB collections and dismissed hubs for this server & section
        const existingDbCollections = await prisma.mediaCollection.findMany({
            where: { serverId, sectionKey: String(sectionKey) }
        });
        const dismissedList = await getDismissedHubsInternal();

        let maxOrderIndex = existingDbCollections.reduce((max, c) => Math.max(max, c.orderIndex ?? 0), -1);
        let importedCount = 0;
        let updatedCount = 0;

        for (const pColl of plexCollections) {
            const pTitleNorm = pColl.title.trim().toLowerCase();

            // Check if this hub/collection has been dismissed/ignored by the user
            const isDismissed = dismissedList.some(d => {
                if (d.ratingKey && pColl.ratingKey && d.ratingKey === pColl.ratingKey) return true;
                if (d.normalizedTitle && (d.normalizedTitle === pTitleNorm || pTitleNorm.includes(d.normalizedTitle) || d.normalizedTitle.includes(pTitleNorm))) {
                    if (!d.serverId || d.serverId === serverId) {
                        if (!d.sectionKey || d.sectionKey === String(sectionKey)) return true;
                    }
                }
                return false;
            });

            if (isDismissed) {
                logger.addLog("INFO", "PLEX", `Skipping dismissed collection/hub "${pColl.title}" on section ${sectionKey} (will stay gone)`);
                continue;
            }

            const match = existingDbCollections.find(
                c => (c.ratingKey && c.ratingKey === pColl.ratingKey) ||
                     c.title.trim().toLowerCase() === pColl.title.trim().toLowerCase()
            );

            if (match) {
                await prisma.mediaCollection.update({
                    where: { id: match.id },
                    data: {
                        ratingKey: pColl.ratingKey,
                        itemCount: pColl.childCount || 0,
                        summary: match.summary || pColl.summary || undefined,
                        posterUrl: match.posterUrl || pColl.thumb || undefined,
                        promotedToHome: pColl.promotedToHome ?? match.promotedToHome,
                        promotedToRecommended: pColl.promotedToRecommended ?? match.promotedToRecommended,
                        promotedToSharedHome: pColl.promotedToSharedHome ?? match.promotedToSharedHome,
                        lastSyncedAt: new Date()
                    }
                });
                updatedCount++;
            } else {
                maxOrderIndex += 1;
                const prefix = (pColl.sortTitle && pColl.sortTitle.startsWith("!"))
                    ? pColl.sortTitle.slice(0, 5)
                    : `!${String(maxOrderIndex).padStart(2, '0')}_`;

                await prisma.mediaCollection.create({
                    data: {
                        title: pColl.title,
                        summary: pColl.summary || "",
                        sortTitle: pColl.sortTitle || "",
                        category: pColl.isHub ? "Plex Hub" : (pColl.smart ? "Plex Smart" : "Plex Library"),
                        type: "movie",
                        serverId,
                        sectionKey: String(sectionKey),
                        sourceType: pColl.isHub ? "plex_hub" : (pColl.smart ? "plex_smart" : "plex_native"),
                        sourceQuery: pColl.isHub ? `plex_hub:${pColl.ratingKey}` : `plex_collection:${pColl.ratingKey}`,
                        ratingKey: pColl.ratingKey,
                        itemCount: pColl.childCount || 0,
                        posterUrl: pColl.thumb || "",
                        promotedToHome: pColl.promotedToHome ?? true,
                        promotedToRecommended: pColl.promotedToRecommended ?? true,
                        promotedToSharedHome: pColl.promotedToSharedHome ?? true,
                        orderIndex: maxOrderIndex,
                        sortPrefix: prefix,
                        lastSyncedAt: new Date()
                    }
                });
                importedCount++;
            }
        }

        logger.addLog("SUCCESS", "PLEX", `Discovered ${plexCollections.length} collections/hubs from Plex "${resolved.serverName}" (${importedCount} new, ${updatedCount} refreshed) on section ${sectionKey}`);
        return {
            success: true,
            importedCount,
            updatedCount,
            totalPlexCollections: plexCollections.length,
            message: `Discovered and synced ${plexCollections.length} Plex collections & hubs (${importedCount} new imported, ${updatedCount} refreshed)!`
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Import collections failed for section ${sectionKey}: ${e.message}`);
        return { success: false, error: e.message };
    }
}

export async function saveMediaCollectionAction(data: {
    id?: string;
    title: string;
    summary?: string;
    sortTitle?: string;
    type: string;
    category?: string;
    serverId: string;
    sectionKey: string;
    sourceType: string;
    sourceQuery?: string;
    rules?: any;
    posterUrl?: string;
    autoSync?: boolean;
    syncInterval?: string;
    maxItems?: number;
    excludedLabels?: string;
    includePlaceholders?: boolean;
    orderIndex?: number;
    promotedToHome?: boolean;
    promotedToRecommended?: boolean;
    promotedToSharedHome?: boolean;
    collectionMode?: string;
    sortPrefix?: string;
    activeDays?: string;
    activeTimeRange?: string;
    isSeasonal?: boolean;
    scheduleStartMonth?: number | null;
    scheduleStartDay?: number | null;
    scheduleEndMonth?: number | null;
    scheduleEndDay?: number | null;
    seasonalAction?: string | null;
}) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const dataPayload = {
            title: data.title,
            summary: data.summary,
            sortTitle: data.sortTitle,
            type: data.type,
            category: data.category,
            serverId: data.serverId,
            sectionKey: data.sectionKey,
            sourceType: data.sourceType,
            sourceQuery: data.sourceQuery,
            rules: data.rules ? JSON.stringify(data.rules) : null,
            posterUrl: data.posterUrl,
            autoSync: data.autoSync ?? true,
            syncInterval: data.syncInterval || "daily",
            maxItems: data.maxItems !== undefined ? data.maxItems : 0,
            excludedLabels: data.excludedLabels !== undefined ? data.excludedLabels : "",
            includePlaceholders: data.includePlaceholders !== undefined ? data.includePlaceholders : false,
            orderIndex: data.orderIndex ?? 0,
            promotedToHome: data.promotedToHome ?? true,
            promotedToRecommended: data.promotedToRecommended ?? true,
            promotedToSharedHome: data.promotedToSharedHome ?? true,
            collectionMode: data.collectionMode || "default",
            sortPrefix: data.sortPrefix || "!00_",
            activeDays: data.activeDays || "all",
            activeTimeRange: data.activeTimeRange || "all_day",
            isSeasonal: data.isSeasonal ?? false,
            scheduleStartMonth: data.scheduleStartMonth,
            scheduleStartDay: data.scheduleStartDay,
            scheduleEndMonth: data.scheduleEndMonth,
            scheduleEndDay: data.scheduleEndDay,
            seasonalAction: data.seasonalAction || "promote_hide"
        };

        let existing = null;
        if (data.id) {
            existing = await prisma.mediaCollection.findUnique({
                where: { id: data.id }
            });
        }

        // If not found by explicit ID, look up matching collection for this server + section by title or query
        if (!existing && data.serverId && data.sectionKey) {
            const sameSectionColls = await prisma.mediaCollection.findMany({
                where: {
                    serverId: data.serverId,
                    sectionKey: data.sectionKey
                }
            });
            existing = sameSectionColls.find(c => 
                c.title.trim().toLowerCase() === data.title.trim().toLowerCase() ||
                (data.sourceQuery && c.sourceQuery && c.sourceQuery === data.sourceQuery)
            ) || null;
        }

        let collection;
        if (existing) {
            collection = await prisma.mediaCollection.update({
                where: { id: existing.id },
                data: dataPayload
            });
        } else {
            collection = await prisma.mediaCollection.create({
                data: dataPayload
            });
        }

        return { success: true, collection, message: `Collection "${data.title}" saved successfully.` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function syncCollectionToPlexAction(collectionId: string) {
    try {

        await verifyAdmin();
        const collection = await prisma.mediaCollection.findUnique({
            where: { id: collectionId }
        });

        if (!collection) return { success: false, error: "Collection record not found." };

        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const resolved = await resolveWorkingPlexServerConnection(collection.serverId || undefined);
        if (!resolved || !resolved.serverUrl) {
            logger.addLog("WARN", "PLEX", `Could not resolve connection for Plex server "${collection.serverId}". Check server URL and token.`);
            return { success: false, error: "Plex server unreachable or token not configured." };
        }
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;
        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];

        logger.addLog("INFO", "PLEX", `Syncing collection/hub "${collection.title}" (section: ${collection.sectionKey}, server: "${resolved.serverName}"). Trying endpoints: ${urlsToTry.join(", ")}`);

        // If this is an existing Plex-native collection, hub, or already has a ratingKey in PMS:
        const isNativePlex = collection.sourceType === "plex_native" || 
                             collection.sourceType === "plex_smart" || 
                             collection.sourceType === "plex_hub" || 
                             collection.category === "Plex" || 
                             collection.category === "Plex Library" || 
                             collection.category === "Plex Smart" || 
                             collection.category === "Plex Hub" ||
                             collection.ratingKey?.startsWith("hub:") ||
                             (collection.sourceType === "plex_query" && !collection.sourceQuery?.includes("hdr:") && !collection.sourceQuery?.includes("audio:") && !collection.sourceQuery?.includes("1980") && !collection.sourceQuery?.includes("1990") && !collection.sourceQuery?.includes("tag:"));

        if (isNativePlex) {
            const existingCollections = await getPlexLibraryCollections(urlsToTry, token, collection.sectionKey || "");
            const found = existingCollections.find(c => 
                (collection.ratingKey && c.ratingKey === collection.ratingKey) || 
                c.title.trim().toLowerCase() === collection.title.trim().toLowerCase()
            );

            if (found) {
                if (!found.ratingKey?.startsWith("hub:") && !found.isHub) {
                    const sortTitle = `${collection.sortPrefix || "!00_"}${collection.sortTitle || collection.title}`;
                    await updatePlexCollectionPromotionAndOrder(
                        urlsToTry,
                        token,
                        collection.sectionKey || "",
                        found.ratingKey,
                        {
                            sortTitle,
                            promotedToHome: collection.promotedToHome ?? true,
                            promotedToRecommended: collection.promotedToRecommended ?? true,
                            promotedToSharedHome: collection.promotedToSharedHome ?? true,
                            collectionMode: collection.collectionMode || "default"
                        }
                    );
                }

                await prisma.mediaCollection.update({
                    where: { id: collection.id },
                    data: {
                        ratingKey: found.ratingKey,
                        itemCount: found.childCount,
                        lastSyncedAt: new Date()
                    }
                });

                const label = found.isHub ? "Hub" : "collection";
                logger.addLog("SUCCESS", "PLEX", `Synced Plex ${label} "${collection.title}" (${found.childCount} items) on server "${resolved.serverName}" with sort prefix "${collection.sortPrefix || "!00_"}"`);
                return {
                    success: true,
                    itemCount: found.childCount,
                    collectionRatingKey: found.ratingKey,
                    message: `Synced Plex ${label} "${collection.title}" (${found.childCount} items) with prefix ${collection.sortPrefix || "!00_"}!`
                };
            }
        }

        // 1. Determine Section Media Type (Movie vs TV) to guarantee library and collection isolation
        let isTvSection = false;
        let isMovieSection = false;
        try {
            const sections = await getPlexServerSections(token, collection.serverId || "", serverUrl);
            const sec = sections.find(s => String(s.key) === String(collection.sectionKey));
            isTvSection = sec?.type === "show" || sec?.type === "tv";
            isMovieSection = sec?.type === "movie";
        } catch {}

        // Fetch library media items and filter out any excluded labels and cross-media type noise
        const rawLibraryItems = await getPlexLibraryMediaItems(urlsToTry, token, collection.sectionKey || "", 5000);
        
        const excludedList = (collection.excludedLabels || "")
            .split(",")
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);

        const libraryItems = deduplicatePlexLibraryItems(rawLibraryItems.filter(it => {
            if (isTvSection && it.type === "movie") return false;
            if (isMovieSection && (it.type === "show" || it.type === "episode")) return false;
            if (excludedList.length > 0) {
                const itLabels = (it.labels || []).map((l: string) => l.toLowerCase());
                const itCollections = (it.collections || []).map((c: string) => c.toLowerCase());
                const isExcluded = itLabels.some((l: string) => excludedList.includes(l)) || 
                                   itCollections.some((c: string) => excludedList.includes(c));
                if (isExcluded) return false;
            }
            return true;
        }));

        // 2. Resolve matching rating keys based on collection source type with strict media-type filtering
        const matchingRatingKeys: string[] = [];

        if (collection.sourceType === "plex_query") {
            const query = collection.sourceQuery || "";
            if (query.includes("hdr:DV")) {
                matchingRatingKeys.push(...libraryItems.filter(it => it.detectedBadges.hdr === "DV").map(it => it.ratingKey));
            } else if (query.includes("audio:ATMOS")) {
                matchingRatingKeys.push(...libraryItems.filter(it => it.detectedBadges.audio === "ATMOS").map(it => it.ratingKey));
            } else if (query.includes("1980") && query.includes("1989")) {
                matchingRatingKeys.push(...libraryItems.filter(it => it.year && it.year >= 1980 && it.year <= 1989).map(it => it.ratingKey));
            } else if (query.includes("1990") && query.includes("1999")) {
                matchingRatingKeys.push(...libraryItems.filter(it => it.year && it.year >= 1990 && it.year <= 1999).map(it => it.ratingKey));
            } else if (query.includes("tag:leaving-soon")) {
                const leavingSoon = await prisma.mediaContentAdvisory.findMany({ where: { isLeavingSoon: true } });
                const lKeys = leavingSoon.map(l => l.ratingKey);
                matchingRatingKeys.push(...libraryItems.filter(it => lKeys.includes(it.ratingKey)).map(it => it.ratingKey));
            }
        } else if (collection.sourceType === "tmdb") {
            const tmdbKey = await getTmdbApiKey();
            if (collection.sourceQuery?.startsWith("collection:")) {
                // Franchise collection (e.g. Marvel MCU, Star Wars)
                const collId = collection.sourceQuery.replace("collection:", "");
                if (tmdbKey) {
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/collection/${collId}?api_key=${tmdbKey}`);
                    if (tmdbRes.ok) {
                        const data = await tmdbRes.json();
                        const parts = (data.parts || []).filter((p: any) => {
                            if (isTvSection && p.media_type === "movie") return false;
                            if (isMovieSection && p.media_type === "tv") return false;
                            return true;
                        });
                        const tmdbIds = new Set(parts.map((p: any) => String(p.id)));
                        const titles = new Set(parts.map((p: any) => p.title?.toLowerCase().trim()).filter(Boolean));
                        matchingRatingKeys.push(...libraryItems.filter(it => 
                            (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                            (it.title && titles.has(it.title.toLowerCase().trim()))
                        ).map(it => it.ratingKey));
                    }
                }
            } else if (collection.sourceQuery?.startsWith("company:")) {
                const compId = collection.sourceQuery.replace("company:", "");
                if (tmdbKey && !isTvSection) {
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&with_companies=${compId}&sort_by=primary_release_date.desc&page=1`);
                    if (tmdbRes.ok) {
                        const data = await tmdbRes.json();
                        const tmdbIds = new Set((data.results || []).map((p: any) => String(p.id)));
                        const titles = new Set((data.results || []).map((p: any) => p.title?.toLowerCase().trim()).filter(Boolean));
                        matchingRatingKeys.push(...libraryItems.filter(it => 
                            (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                            (it.title && titles.has(it.title.toLowerCase().trim()))
                        ).map(it => it.ratingKey));
                    }
                }
            } else if (collection.sourceQuery?.startsWith("network:")) {
                const netId = parseInt(collection.sourceQuery.replace("network:", ""), 10) || 213;
                if (!isMovieSection) {
                    const shows = await getTmdbNetworkShows(netId);
                    const tmdbIds = new Set(shows.map(s => String(s.id)));
                    const titles = new Set(shows.map(s => s.title?.toLowerCase().trim()).filter(Boolean));
                    matchingRatingKeys.push(...libraryItems.filter(it => 
                        (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                        (it.title && titles.has(it.title.toLowerCase().trim()))
                    ).map(it => it.ratingKey));
                }
            } else if (collection.sourceQuery?.startsWith("provider:")) {
                const parts = collection.sourceQuery.split(":");
                const provId = parseInt(parts[1], 10) || 8;
                const isKids = parts.length > 2 && parts[2] === "kids";
                const providerMedia = await getTmdbStreamingProviderMedia(provId, { 
                    isKids, 
                    mediaType: isTvSection ? "tv" : isMovieSection ? "movie" : "both",
                    maxPages: 3
                });
                const tmdbIds = new Set(providerMedia.map(m => String(m.id)));
                const imdbIds = new Set(providerMedia.map(m => m.imdbId).filter(Boolean));
                const titles = new Set(providerMedia.map(m => m.title?.toLowerCase().trim()).filter(Boolean));
                const provMatches = libraryItems.filter(it => {
                    const isMatch = (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                                    (it.guids?.imdb && imdbIds.has(String(it.guids.imdb))) ||
                                    (it.title && titles.has(it.title.toLowerCase().trim()));
                    if (!isMatch) return false;
                    if (isKids && !isStrictKidsMedia(it)) return false;
                    return true;
                }).map(it => it.ratingKey);
                matchingRatingKeys.push(...provMatches);
            } else if (collection.sourceQuery === "digital_releases") {
                if (isTvSection) {
                    const tvShows = await getTmdbPopularTv(1);
                    const tmdbIds = new Set(tvShows.map(u => String(u.id)));
                    const imdbIds = new Set(tvShows.map(u => u.imdbId).filter(Boolean));
                    const titles = new Set(tvShows.map(u => u.title?.toLowerCase().trim()).filter(Boolean));
                    matchingRatingKeys.push(...libraryItems.filter(it => 
                        (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                        (it.guids?.imdb && imdbIds.has(String(it.guids.imdb))) ||
                        (it.title && titles.has(it.title.toLowerCase().trim()))
                    ).map(it => it.ratingKey));
                } else {
                    const upcoming = await getTmdbUpcomingMovies();
                    const tmdbIds = new Set(upcoming.map(u => String(u.id)));
                    const imdbIds = new Set(upcoming.map(u => u.imdbId).filter(Boolean));
                    const titles = new Set(upcoming.map(u => u.title?.toLowerCase().trim()).filter(Boolean));
                    matchingRatingKeys.push(...libraryItems.filter(it => 
                        (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                        (it.guids?.imdb && imdbIds.has(String(it.guids.imdb))) ||
                        (it.title && titles.has(it.title.toLowerCase().trim()))
                    ).map(it => it.ratingKey));
                }
            } else {
                // Trending / Popular
                const trending = await getTmdbTrending(isTvSection ? "tv" : isMovieSection ? "movie" : "all", "week");
                const tmdbIds = new Set(trending.map(t => String(t.id)));
                const imdbIds = new Set(trending.map(t => t.imdbId).filter(Boolean));
                const titles = new Set(trending.map(t => t.title?.toLowerCase().trim()).filter(Boolean));
                matchingRatingKeys.push(...libraryItems.filter(it => 
                    (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                    (it.guids?.imdb && imdbIds.has(String(it.guids.imdb))) ||
                    (it.title && titles.has(it.title.toLowerCase().trim()))
                ).map(it => it.ratingKey));
            }
        } else if (collection.sourceType === "trakt") {
            if (collection.sourceQuery === "trending") {
                const trending = isTvSection 
                    ? await getTraktTrendingShows(40)
                    : await getTraktTrendingMovies(40);
                const tmdbIds = new Set(trending.map((t: any) => String(t.tmdbId)).filter(Boolean));
                const imdbIds = new Set(trending.map((t: any) => String(t.imdbId)).filter(Boolean));
                const titles = new Set(trending.map((t: any) => t.title?.toLowerCase().trim()).filter(Boolean));
                matchingRatingKeys.push(...libraryItems.filter(it => 
                    (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                    (it.guids?.imdb && imdbIds.has(String(it.guids.imdb))) ||
                    (it.title && titles.has(it.title.toLowerCase().trim()))
                ).map(it => it.ratingKey));
            } else if (collection.sourceQuery === "anticipated") {
                const anticipated = isTvSection
                    ? await getTraktAnticipatedShows(40)
                    : await getTraktAnticipatedMovies(40);
                const tmdbIds = new Set(anticipated.map((t: any) => String(t.tmdbId)).filter(Boolean));
                const imdbIds = new Set(anticipated.map((t: any) => String(t.imdbId)).filter(Boolean));
                const titles = new Set(anticipated.map((t: any) => t.title?.toLowerCase().trim()).filter(Boolean));
                matchingRatingKeys.push(...libraryItems.filter(it => 
                    (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                    (it.guids?.imdb && imdbIds.has(String(it.guids.imdb))) ||
                    (it.title && titles.has(it.title.toLowerCase().trim()))
                ).map(it => it.ratingKey));
            } else if (collection.sourceQuery) {
                const listData = await getTraktUserList(collection.sourceQuery);
                if (listData?.items) {
                    const scopedListItems = listData.items.filter(t => {
                        if (isTvSection && t.mediaType === "movie") return false;
                        if (isMovieSection && (t.mediaType === "show" || (t as any).mediaType === "tv")) return false;
                        return true;
                    });
                    const tmdbIds = new Set(scopedListItems.map((t: any) => String(t.tmdbId)).filter(Boolean));
                    const imdbIds = new Set(scopedListItems.map((t: any) => String(t.imdbId)).filter(Boolean));
                    const titles = new Set(scopedListItems.map((t: any) => t.title?.toLowerCase().trim()).filter(Boolean));
                    matchingRatingKeys.push(...libraryItems.filter(it => 
                        (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                        (it.guids?.imdb && imdbIds.has(String(it.guids.imdb))) ||
                        (it.title && titles.has(it.title.toLowerCase().trim()))
                    ).map(it => it.ratingKey));
                }
            }
        } else if (collection.sourceType === "mdblist") {
            let matched = false;
            if (collection.sourceQuery) {
                const items = await getMdblistItems(collection.sourceQuery);
                if (items && items.length > 0) {
                    const scopedItems = items.filter(t => {
                        if (isTvSection && t.mediaType === "movie") return false;
                        if (isMovieSection && (t.mediaType === "show" || (t as any).mediaType === "tv")) return false;
                        return true;
                    });
                    const tmdbIds = new Set(scopedItems.map((t: any) => String(t.tmdbId)).filter(Boolean));
                    const imdbIds = new Set(scopedItems.map((t: any) => String(t.imdbId).toLowerCase()).filter(Boolean));
                    const titles = new Set(scopedItems.map((t: any) => t.title?.toLowerCase().trim()).filter(Boolean));
                    const res = libraryItems.filter(it => 
                        (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                        (it.guids?.imdb && imdbIds.has(String(it.guids.imdb).toLowerCase())) ||
                        (it.title && titles.has(it.title.toLowerCase().trim()))
                    ).map(it => it.ratingKey);
                    if (res.length > 0) {
                        matchingRatingKeys.push(...res);
                        matched = true;
                    }
                }
            }

            // Built-in Official IMDb Top 250 Registry & High-Rating Fallback
            if (!matched && (collection.title.toLowerCase().includes("top 250") || collection.sourceQuery?.includes("250") || collection.sourceQuery?.includes("top-imdb"))) {
                const builtinList = getBuiltinImdbTopList(isTvSection ? "show" : "movie");
                const builtinTmdbIds = new Set(builtinList.map(b => String(b.tmdbId)));
                const builtinImdbIds = new Set(builtinList.map(b => b.imdbId.toLowerCase()));
                const builtinTitles = new Set(builtinList.map(b => b.title.toLowerCase().trim()));

                const builtinMatches = libraryItems.filter(it => {
                    const mTmdb = it.guids?.tmdb && builtinTmdbIds.has(String(it.guids.tmdb));
                    const mImdb = it.guids?.imdb && builtinImdbIds.has(String(it.guids.imdb).toLowerCase());
                    const mTitle = it.title && builtinTitles.has(it.title.toLowerCase().trim());
                    return mTmdb || mImdb || mTitle;
                }).map(it => it.ratingKey);

                if (builtinMatches.length > 0) {
                    matchingRatingKeys.push(...builtinMatches);
                }
            }
        } else if (collection.sourceType === "radarr") {
            try {
                const arrRes = await getEnabledArrInstancesInternal("radarr");
                if (arrRes.success && arrRes.data && arrRes.data.length > 0) {
                    for (const app of arrRes.data) {
                        const moviesRes = await arrApiGet(app, "/api/v3/movie");
                        if (moviesRes.success && Array.isArray(moviesRes.data)) {
                            let movies = moviesRes.data;
                            if (collection.sourceQuery === "monitored_missing") {
                                movies = movies.filter((m: any) => m.monitored && !m.hasFile);
                            } else if (collection.sourceQuery?.startsWith("tag:")) {
                                const targetTag = collection.sourceQuery.replace("tag:", "").toLowerCase().trim();
                                const tagsRes = await arrApiGet(app, "/api/v3/tag");
                                const tagId = tagsRes.success ? tagsRes.data?.find((t: any) => t.label.toLowerCase() === targetTag)?.id : null;
                                if (tagId) {
                                    movies = movies.filter((m: any) => m.tags?.includes(tagId));
                                }
                            }
                            const tmdbIds = new Set(movies.map((m: any) => String(m.tmdbId)).filter(Boolean));
                            const imdbIds = new Set(movies.map((m: any) => String(m.imdbId).toLowerCase()).filter(Boolean));
                            const titles = new Set(movies.map((m: any) => m.title?.toLowerCase().trim()).filter(Boolean));
                            const matches = libraryItems.filter(it => 
                                (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                                (it.guids?.imdb && imdbIds.has(String(it.guids.imdb).toLowerCase())) ||
                                (it.title && titles.has(it.title.toLowerCase().trim()))
                            ).map(it => it.ratingKey);
                            matchingRatingKeys.push(...matches);
                        }
                    }
                }
            } catch (rErr: any) {
                console.warn("[RADARR-COLL-SYNC] Error querying Radarr:", rErr.message);
            }
        } else if (collection.sourceType === "sonarr") {
            try {
                const arrRes = await getEnabledArrInstancesInternal("sonarr");
                if (arrRes.success && arrRes.data && arrRes.data.length > 0) {
                    for (const app of arrRes.data) {
                        const seriesRes = await arrApiGet(app, "/api/v3/series");
                        if (seriesRes.success && Array.isArray(seriesRes.data)) {
                            let series = seriesRes.data;
                            if (collection.sourceQuery === "monitored_missing") {
                                series = series.filter((s: any) => s.monitored && (s.statistics?.episodeFileCount === 0 || s.statistics?.percentOfEpisodes < 100));
                            } else if (collection.sourceQuery?.startsWith("tag:")) {
                                const targetTag = collection.sourceQuery.replace("tag:", "").toLowerCase().trim();
                                const tagsRes = await arrApiGet(app, "/api/v3/tag");
                                const tagId = tagsRes.success ? tagsRes.data?.find((t: any) => t.label.toLowerCase() === targetTag)?.id : null;
                                if (tagId) {
                                    series = series.filter((s: any) => s.tags?.includes(tagId));
                                }
                            }
                            const tvdbIds = new Set(series.map((s: any) => String(s.tvdbId)).filter(Boolean));
                            const imdbIds = new Set(series.map((s: any) => String(s.imdbId).toLowerCase()).filter(Boolean));
                            const titles = new Set(series.map((s: any) => s.title?.toLowerCase().trim()).filter(Boolean));
                            const matches = libraryItems.filter(it => 
                                (it.guids?.tvdb && tvdbIds.has(String(it.guids.tvdb))) ||
                                (it.guids?.imdb && imdbIds.has(String(it.guids.imdb).toLowerCase())) ||
                                (it.title && titles.has(it.title.toLowerCase().trim()))
                            ).map(it => it.ratingKey);
                            matchingRatingKeys.push(...matches);
                        }
                    }
                }
            } catch (sErr: any) {
                console.warn("[SONARR-COLL-SYNC] Error querying Sonarr:", sErr.message);
            }
        } else if (collection.sourceType === "plex_smart") {
            const deployRes = await deployFilteredSmartHubAction(
                collection.serverId || "",
                collection.sectionKey || "",
                (collection.sourceQuery || "recently_added") as any,
                collection.title
            );
            if (deployRes.success) {
                return {
                    success: true,
                    collectionRatingKey: deployRes.collectionRatingKey,
                    message: `Synced Filtered Smart Hub "${collection.title}" to Plex!`
                };
            }
        }

        // Run Coming Soon placeholders if enabled
        let placeholdersGenerated = 0;
        if (collection.includePlaceholders) {
            try {
                const placeholderRes = await generateCollectionPlaceholdersInternal(collection);
                if (placeholderRes.success) {
                    placeholdersGenerated = placeholderRes.generatedCount;
                }
            } catch (pErr: any) {
                console.warn("[COLL-SYNC] Error running auto-placeholders:", pErr.message);
            }
        } else {
            try {
                await cleanupAvailablePlaceholdersInternal(collection.serverId || undefined, collection.sectionKey || undefined);
            } catch (pErr: any) {
                console.warn("[COLL-SYNC] Error running placeholder cleanup:", pErr.message);
            }
        }

        if (matchingRatingKeys.length === 0) {
            if (placeholdersGenerated > 0) {
                return {
                    success: true,
                    message: `Generated ${placeholdersGenerated} Coming Soon placeholder(s) in share folder! Plex library scan initiated to add stubs to collection.`
                };
            }
            if (collection.includePlaceholders) {
                return {
                    success: true,
                    message: `Collection criteria evaluated (0 items currently in library, candidates checked for Coming Soon stubs).`
                };
            }
            return {
                success: false,
                error: "No matching library media found for collection query criteria.",
                message: `No matching library media found for collection criteria (${libraryItems.length} items evaluated).`
            };
        }

        // 3. Enforce Max Item count if specified
        const finalRatingKeys = (collection.maxItems && collection.maxItems > 0)
            ? matchingRatingKeys.slice(0, collection.maxItems)
            : matchingRatingKeys;

        // 4. Sync to Plex with Sort Prefix and Home Promotion
        const syncResult = await syncPlexCollection(
            urlsToTry,
            token,
            collection.sectionKey || "",
            collection.title,
            finalRatingKeys,
            {
                summary: collection.summary || undefined,
                sortTitle: `${collection.sortPrefix || "!00_"}${collection.title}`,
                promotedToHome: collection.promotedToHome ?? true,
                promotedToRecommended: collection.promotedToRecommended ?? true,
                promotedToSharedHome: collection.promotedToSharedHome ?? true,
                collectionMode: collection.collectionMode || "default",
                posterUrl: collection.posterUrl || undefined
            }
        );

        // 5. Update local DB with item count and synced time
        await prisma.mediaCollection.update({
            where: { id: collection.id },
            data: {
                itemCount: finalRatingKeys.length,
                lastSyncedAt: new Date(),
                ratingKey: syncResult.collectionRatingKey || undefined
            }
        });

        logger.addLog("SUCCESS", "PLEX", `Successfully synced collection "${collection.title}" (${finalRatingKeys.length} items${placeholdersGenerated > 0 ? `, ${placeholdersGenerated} placeholders generated` : ""}) to Plex server "${resolved.serverName}"`);

        return {
            success: true,
            itemCount: finalRatingKeys.length,
            placeholdersGenerated,
            collectionRatingKey: syncResult.collectionRatingKey,
            message: `Synced "${collection.title}" with ${finalRatingKeys.length} items to Plex${placeholdersGenerated > 0 ? ` (+${placeholdersGenerated} Coming Soon trailers & placeholders generated)` : ""}!`
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Sync collection "${collectionId}" failed: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * Server action to preview matching library media items for a collection configuration before syncing
 */
export async function generateCollectionCandidateItemsPreviewAction(
    serverId: string,
    sectionKey: string,
    collectionConfig: {
        sourceType: string;
        sourceQuery?: string;
        excludedLabels?: string;
        maxItems?: number;
        mediaType?: string;
        title?: string;
        type?: string;
    }
) {
    try {

        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;

        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];
        // Determine Section Media Type (Movie vs TV) to guarantee preview isolation
        let isTvSection = false;
        let isMovieSection = false;
        try {
            const sections = await getPlexServerSections(token, serverId, serverUrl);
            const sec = sections.find(s => String(s.key) === String(sectionKey));
            isTvSection = sec?.type === "show" || sec?.type === "tv";
            isMovieSection = sec?.type === "movie";
        } catch {}

        const rawLibraryItems = await getPlexLibraryMediaItems(urlsToTry, token, sectionKey || "", 5000);

        const excludedList = (collectionConfig.excludedLabels || "")
            .split(",")
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);

        const libraryItems = deduplicatePlexLibraryItems(rawLibraryItems.filter(it => {
            if (isTvSection && it.type === "movie") return false;
            if (isMovieSection && (it.type === "show" || it.type === "episode")) return false;
            if (excludedList.length > 0) {
                const itLabels = (it.labels || []).map((l: string) => l.toLowerCase());
                const itCollections = (it.collections || []).map((c: string) => c.toLowerCase());
                const isExcluded = itLabels.some((l: string) => excludedList.includes(l)) || 
                                   itCollections.some((c: string) => excludedList.includes(c));
                if (isExcluded) return false;
            }
            return true;
        }));

        let matchedItems: any[] = [];
        let executionMethod = "";

        const sourceType = collectionConfig.sourceType;
        const sourceQuery = collectionConfig.sourceQuery || "";

        if (sourceType === "plex_query") {
            if (sourceQuery.includes("hdr:DV")) {
                matchedItems = libraryItems.filter(it => it.detectedBadges.hdr === "DV");
                executionMethod = "Plex Stream Telemetry: Filtering for Dolby Vision (DV) video streams.";
            } else if (sourceQuery.includes("audio:ATMOS")) {
                matchedItems = libraryItems.filter(it => it.detectedBadges.audio === "ATMOS");
                executionMethod = "Plex Audio Telemetry: Filtering for Dolby Atmos immersive audio tracks.";
            } else if (sourceQuery.includes("1980") && sourceQuery.includes("1989")) {
                matchedItems = libraryItems.filter(it => it.year && it.year >= 1980 && it.year <= 1989);
                executionMethod = "Plex Metadata Filter: Released between 1980 and 1989.";
            } else if (sourceQuery.includes("1990") && sourceQuery.includes("1999")) {
                matchedItems = libraryItems.filter(it => it.year && it.year >= 1990 && it.year <= 1999);
                executionMethod = "Plex Metadata Filter: Released between 1990 and 1999.";
            } else if (sourceQuery.includes("tag:leaving-soon")) {
                const leavingSoon = await prisma.mediaContentAdvisory.findMany({ where: { isLeavingSoon: true } });
                const lKeys = leavingSoon.map(l => l.ratingKey);
                matchedItems = libraryItems.filter(it => lKeys.includes(it.ratingKey));
                executionMethod = "Portalarr Prune Engine: Flagged as 'Leaving Soon' by storage disk policy.";
            } else if (sourceQuery.startsWith("rating>=") || sourceQuery.startsWith("rating:")) {
                const minRating = parseFloat(sourceQuery.replace(/[^0-9.]/g, "")) || 8.0;
                matchedItems = libraryItems.filter(it => it.rating && it.rating >= minRating);
                executionMethod = `Plex Metadata Filter: Audience rating >= ${minRating}.`;
            } else {
                matchedItems = libraryItems.slice(0, 50);
                executionMethod = `Plex Smart Filter: ${sourceQuery}`;
            }
        } else if (sourceType === "tmdb") {
            const tmdbKey = await getTmdbApiKey();
            if (sourceQuery.startsWith("collection:")) {
                const collId = sourceQuery.replace("collection:", "");
                executionMethod = `TMDb Franchise API: Querying collection ID #${collId} parts list.`;
                if (tmdbKey) {
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/collection/${collId}?api_key=${tmdbKey}`);
                    if (tmdbRes.ok) {
                        const data = await tmdbRes.json();
                        const parts: any[] = (data.parts || []).filter((p: any) => {
                            if (isTvSection && p.media_type === "movie") return false;
                            if (isMovieSection && p.media_type === "tv") return false;
                            return true;
                        });
                        const titles = parts.map((p: any) => p.title?.toLowerCase().trim()).filter(Boolean);
                        const tmdbIds = parts.map((p: any) => String(p.id));
                        matchedItems = libraryItems.filter(it => 
                            (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                            (it.title && titles.includes(it.title.toLowerCase().trim()))
                        );
                    }
                }
            } else if (sourceQuery.startsWith("company:")) {
                const compId = sourceQuery.replace("company:", "");
                executionMethod = `TMDb Studio API: Querying company ID #${compId} filmography.`;
                if (tmdbKey && !isTvSection) {
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&with_companies=${compId}&sort_by=primary_release_date.desc&page=1`);
                    if (tmdbRes.ok) {
                        const data = await tmdbRes.json();
                        const results: any[] = data.results || [];
                        const tmdbIds = results.map((r: any) => String(r.id));
                        const titles = results.map((r: any) => r.title?.toLowerCase().trim()).filter(Boolean);
                        matchedItems = libraryItems.filter(it => 
                            (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                            (it.title && titles.includes(it.title.toLowerCase().trim()))
                        );
                    }
                }
            } else if (sourceQuery.startsWith("network:")) {
                const netId = parseInt(sourceQuery.replace("network:", ""), 10) || 213;
                executionMethod = `TMDb TV Network API: Querying network ID #${netId} shows.`;
                if (!isMovieSection) {
                    const shows = await getTmdbNetworkShows(netId);
                    const tmdbIds = shows.map(s => String(s.id));
                    const titles = shows.map(s => s.title?.toLowerCase().trim()).filter(Boolean);
                    matchedItems = libraryItems.filter(it => 
                        (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                        (it.title && titles.includes(it.title.toLowerCase().trim()))
                    );
                }
            } else if (sourceQuery.startsWith("provider:")) {
                const parts = sourceQuery.split(":");
                const provId = parseInt(parts[1], 10) || 8;
                const isKids = parts.length > 2 && parts[2] === "kids";
                const provName = provId === 337 ? "Disney+" : provId === 8 ? "Netflix" : `Provider #${provId}`;
                executionMethod = `TMDb Streaming Provider API: Querying ${provName} ${isKids ? "(Kids & Family)" : "Trending Top Charts"}. Matches against Plex library metadata.`;
                const providerMedia = await getTmdbStreamingProviderMedia(provId, { 
                    isKids, 
                    mediaType: isTvSection ? "tv" : isMovieSection ? "movie" : "both" 
                });
                const tmdbIds = providerMedia.map(m => String(m.id));
                const imdbIds = providerMedia.map(m => m.imdbId).filter(Boolean);
                const titles = providerMedia.map(m => m.title?.toLowerCase().trim()).filter(Boolean);
                matchedItems = libraryItems.filter(it => {
                    const isMatch = (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                                    (it.guids?.imdb && imdbIds.includes(String(it.guids.imdb))) ||
                                    (it.title && titles.includes(it.title.toLowerCase().trim()));
                    if (!isMatch) return false;
                    if (isKids && !isStrictKidsMedia(it)) return false;
                    return true;
                });
            } else if (sourceQuery === "digital_releases") {
                executionMethod = isTvSection 
                    ? `TMDb Popular TV API: Querying active television shows.`
                    : `TMDb Releases API: Querying new digital streaming releases.`;
                const upcoming = isTvSection 
                    ? await getTmdbPopularTv(1)
                    : await getTmdbUpcomingMovies();
                const tmdbIds = upcoming.map(m => String(m.id));
                const imdbIds = upcoming.map(m => m.imdbId).filter(Boolean);
                const titles = upcoming.map(m => m.title?.toLowerCase().trim()).filter(Boolean);
                matchedItems = libraryItems.filter(it => 
                    (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                    (it.guids?.imdb && imdbIds.includes(String(it.guids.imdb))) ||
                    (it.title && titles.includes(it.title.toLowerCase().trim()))
                );
            } else if (sourceQuery === "in_theatres") {
                executionMethod = `TMDb Theatrical API: Querying current theatrical and now-playing releases.`;
                const inTheatres = await getTmdbNowPlayingMovies();
                const tmdbIds = inTheatres.map(m => String(m.id));
                const imdbIds = inTheatres.map(m => m.imdbId).filter(Boolean);
                const titles = inTheatres.map(m => m.title?.toLowerCase().trim()).filter(Boolean);
                matchedItems = libraryItems.filter(it => 
                    (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                    (it.guids?.imdb && imdbIds.includes(String(it.guids.imdb))) ||
                    (it.title && titles.includes(it.title.toLowerCase().trim()))
                );
            } else {
                executionMethod = `TMDb Trending (${isTvSection ? "TV" : isMovieSection ? "Movies" : "All"}): ${sourceQuery}`;
                const trending = await getTmdbTrending(isTvSection ? "tv" : isMovieSection ? "movie" : "all", "week");
                const tmdbIds = trending.map(t => String(t.id));
                const imdbIds = trending.map(t => t.imdbId).filter(Boolean);
                const titles = trending.map(t => t.title?.toLowerCase().trim()).filter(Boolean);
                matchedItems = libraryItems.filter(it => 
                    (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                    (it.guids?.imdb && imdbIds.includes(String(it.guids.imdb))) ||
                    (it.title && titles.includes(it.title.toLowerCase().trim()))
                );
            }
        } else if (sourceType === "mdblist") {
            executionMethod = `MDBList API: Resolving curated chart "${sourceQuery}". Matches against Plex IMDb/TMDb metadata.`;
            const items = await getMdblistItems(sourceQuery);
            if (items && items.length > 0) {
                const scopedItems = items.filter(t => {
                    if (isTvSection && t.mediaType === "movie") return false;
                    if (isMovieSection && (t.mediaType === "show" || (t as any).mediaType === "tv")) return false;
                    return true;
                });
                const imdbIds = scopedItems.map((t: any) => String(t.imdbId).toLowerCase()).filter(Boolean);
                const tmdbIds = scopedItems.map((t: any) => String(t.tmdbId)).filter(Boolean);
                const titles = scopedItems.map((t: any) => t.title?.toLowerCase().trim()).filter(Boolean);
                matchedItems = libraryItems.filter(it => 
                    (it.guids?.imdb && imdbIds.includes(String(it.guids.imdb).toLowerCase())) ||
                    (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                    (it.title && titles.includes(it.title.toLowerCase().trim()))
                );
            } else {
                if (sourceQuery === "top-imdb-250" || sourceQuery === "top-imdb-tv" || (collectionConfig.title && collectionConfig.title.toLowerCase().includes("top 250"))) {
                    executionMethod = "Official Built-in IMDb Top 250 Master Registry: Matching against verified IMDb & TMDb IDs and library items.";
                    const builtinList = getBuiltinImdbTopList(isTvSection ? "show" : "movie");
                    const builtinTmdbIds = new Set(builtinList.map(b => String(b.tmdbId)));
                    const builtinImdbIds = new Set(builtinList.map(b => b.imdbId.toLowerCase()));
                    const builtinTitles = new Set(builtinList.map(b => b.title.toLowerCase().trim()));

                    matchedItems = libraryItems.filter(it => {
                        const mTmdb = it.guids?.tmdb && builtinTmdbIds.has(String(it.guids.tmdb));
                        const mImdb = it.guids?.imdb && builtinImdbIds.has(String(it.guids.imdb).toLowerCase());
                        const mTitle = it.title && builtinTitles.has(it.title.toLowerCase().trim());
                        return mTmdb || mImdb || mTitle;
                    });
                } else if (sourceQuery === "top-oscar-best-picture") {
                    executionMethod += " (MDBList key not configured; configure in settings to fetch official Oscar list).";
                }
            }
        } else if (sourceType === "trakt") {
            executionMethod = `Trakt API: Querying list "${sourceQuery}".`;
            if (sourceQuery === "trending") {
                const trending = isTvSection 
                    ? await getTraktTrendingShows(50)
                    : await getTraktTrendingMovies(50);
                const imdbIds = trending.map((t: any) => t.imdbId).filter(Boolean);
                const tmdbIds = trending.map((t: any) => String(t.tmdbId)).filter(Boolean);
                const titles = trending.map((t: any) => t.title?.toLowerCase().trim()).filter(Boolean);
                matchedItems = libraryItems.filter(it => 
                    (it.guids?.imdb && imdbIds.includes(String(it.guids.imdb))) ||
                    (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                    (it.title && titles.includes(it.title.toLowerCase().trim()))
                );
            } else if (sourceQuery === "anticipated") {
                const anticipated = isTvSection
                    ? await getTraktAnticipatedShows(50)
                    : await getTraktAnticipatedMovies(50);
                const imdbIds = anticipated.map((t: any) => t.imdbId).filter(Boolean);
                const tmdbIds = anticipated.map((t: any) => String(t.tmdbId)).filter(Boolean);
                const titles = anticipated.map((t: any) => t.title?.toLowerCase().trim()).filter(Boolean);
                matchedItems = libraryItems.filter(it => 
                    (it.guids?.imdb && imdbIds.includes(String(it.guids.imdb))) ||
                    (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                    (it.title && titles.includes(it.title.toLowerCase().trim()))
                );
            } else {
                const listData = await getTraktUserList(sourceQuery);
                if (listData?.items) {
                    const scoped = listData.items.filter(t => {
                        if (isTvSection && t.mediaType === "movie") return false;
                        if (isMovieSection && (t.mediaType === "show" || (t as any).mediaType === "tv")) return false;
                        return true;
                    });
                    const imdbIds = scoped.map((t: any) => t.imdbId).filter(Boolean);
                    const tmdbIds = scoped.map((t: any) => String(t.tmdbId)).filter(Boolean);
                    const titles = scoped.map((t: any) => t.title?.toLowerCase().trim()).filter(Boolean);
                    matchedItems = libraryItems.filter(it => 
                        (it.guids?.imdb && imdbIds.includes(String(it.guids.imdb))) ||
                        (it.guids?.tmdb && tmdbIds.includes(String(it.guids.tmdb))) ||
                        (it.title && titles.includes(it.title.toLowerCase().trim()))
                    );
                }
            }
        } else if (sourceType === "radarr") {
            executionMethod = `Radarr Servarr API: Querying monitored movies (${sourceQuery}).`;
            try {
                const arrRes = await getEnabledArrInstancesInternal("radarr");
                if (arrRes.success && arrRes.data && arrRes.data.length > 0) {
                    for (const app of arrRes.data) {
                        const moviesRes = await arrApiGet(app, "/api/v3/movie");
                        if (moviesRes.success && Array.isArray(moviesRes.data)) {
                            let movies = moviesRes.data;
                            if (sourceQuery === "monitored_missing") {
                                movies = movies.filter((m: any) => m.monitored && !m.hasFile);
                            } else if (sourceQuery.startsWith("tag:")) {
                                const targetTag = sourceQuery.replace("tag:", "").toLowerCase().trim();
                                const tagsRes = await arrApiGet(app, "/api/v3/tag");
                                const tagId = tagsRes.success ? tagsRes.data?.find((t: any) => t.label.toLowerCase() === targetTag)?.id : null;
                                if (tagId) movies = movies.filter((m: any) => m.tags?.includes(tagId));
                            }
                            const tmdbIds = new Set(movies.map((m: any) => String(m.tmdbId)).filter(Boolean));
                            const imdbIds = new Set(movies.map((m: any) => String(m.imdbId).toLowerCase()).filter(Boolean));
                            const titles = new Set(movies.map((m: any) => m.title?.toLowerCase().trim()).filter(Boolean));
                            matchedItems = libraryItems.filter(it => 
                                (it.guids?.tmdb && tmdbIds.has(String(it.guids.tmdb))) ||
                                (it.guids?.imdb && imdbIds.has(String(it.guids.imdb).toLowerCase())) ||
                                (it.title && titles.has(it.title.toLowerCase().trim()))
                            );
                        }
                    }
                }
            } catch (rErr: any) {
                executionMethod += ` (Error querying Radarr: ${rErr.message})`;
            }
        } else if (sourceType === "sonarr") {
            executionMethod = `Sonarr Servarr API: Querying monitored series (${sourceQuery}).`;
            try {
                const arrRes = await getEnabledArrInstancesInternal("sonarr");
                if (arrRes.success && arrRes.data && arrRes.data.length > 0) {
                    for (const app of arrRes.data) {
                        const seriesRes = await arrApiGet(app, "/api/v3/series");
                        if (seriesRes.success && Array.isArray(seriesRes.data)) {
                            let series = seriesRes.data;
                            if (sourceQuery === "monitored_missing") {
                                series = series.filter((s: any) => s.monitored && (s.statistics?.episodeFileCount === 0 || s.statistics?.percentOfEpisodes < 100));
                            } else if (sourceQuery.startsWith("tag:")) {
                                const targetTag = sourceQuery.replace("tag:", "").toLowerCase().trim();
                                const tagsRes = await arrApiGet(app, "/api/v3/tag");
                                const tagId = tagsRes.success ? tagsRes.data?.find((t: any) => t.label.toLowerCase() === targetTag)?.id : null;
                                if (tagId) series = series.filter((s: any) => s.tags?.includes(tagId));
                            }
                            const tvdbIds = new Set(series.map((s: any) => String(s.tvdbId)).filter(Boolean));
                            const imdbIds = new Set(series.map((s: any) => String(s.imdbId).toLowerCase()).filter(Boolean));
                            const titles = new Set(series.map((s: any) => s.title?.toLowerCase().trim()).filter(Boolean));
                            matchedItems = libraryItems.filter(it => 
                                (it.guids?.tvdb && tvdbIds.has(String(it.guids.tvdb))) ||
                                (it.guids?.imdb && imdbIds.has(String(it.guids.imdb).toLowerCase())) ||
                                (it.title && titles.has(it.title.toLowerCase().trim()))
                            );
                        }
                    }
                }
            } catch (sErr: any) {
                executionMethod += ` (Error querying Sonarr: ${sErr.message})`;
            }
        } else if (sourceType === "plex_smart") {
            executionMethod = `Plex Filtered Smart Hub: Dynamic filter for ${sourceQuery} (excludes trailer-placeholder stubs).`;
            matchedItems = libraryItems.slice(0, 30);
        }

        const effectiveMatches = (collectionConfig.maxItems && collectionConfig.maxItems > 0)
            ? matchedItems.slice(0, collectionConfig.maxItems)
            : matchedItems;

        return {
            success: true,
            totalEvaluated: rawLibraryItems.length,
            matchCount: effectiveMatches.length,
            executionMethod,
            sampleMatches: effectiveMatches.slice(0, 18).map(m => ({
                ratingKey: m.ratingKey,
                title: m.title,
                year: m.year,
                rating: m.rating,
                thumb: m.thumb,
                detectedBadges: m.detectedBadges
            }))
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export const previewCollectionMatchingAction = generateCollectionCandidateItemsPreviewAction;

export async function reorderPlexCollectionsAction(
    serverId: string,
    sectionKey: string,
    orderedCollections: Array<{
        id: string;
        ratingKey?: string;
        orderIndex: number;
        sortPrefix?: string;
        promotedToHome?: boolean;
        promotedToRecommended?: boolean;
        promotedToSharedHome?: boolean;
        collectionMode?: string;
    }>
) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        if (!serverId || !sectionKey) {
            return { success: false, error: "Please select a Plex server and library section first." };
        }

        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) {
            logger.addLog("WARN", "PLEX", `Could not resolve connection for Plex server "${serverId}". Check server URL and token.`);
            return { success: false, error: "Plex server unreachable or token not configured." };
        }
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;
        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];

        logger.addLog("INFO", "PLEX", `Saving hub ordering and visibility for ${orderedCollections.length} collections/hubs on server "${resolved.serverName}" (section: ${sectionKey})...`);

        // 1. Batch parallel DB updates
        const updatedDbRecords = await Promise.all(
            orderedCollections.map(async (item) => {
                const prefix = item.sortPrefix || `!${String(item.orderIndex).padStart(2, '0')}_`;
                let existing = await prisma.mediaCollection.findUnique({
                    where: { id: item.id }
                });

                if (!existing && item.ratingKey) {
                    existing = await prisma.mediaCollection.findFirst({
                        where: {
                            ratingKey: item.ratingKey,
                            serverId,
                            sectionKey: String(sectionKey)
                        }
                    });
                }

                if (!existing) return null;

                const updated = await prisma.mediaCollection.update({
                    where: { id: existing.id },
                    data: {
                        orderIndex: item.orderIndex,
                        sortPrefix: prefix,
                        promotedToHome: item.promotedToHome ?? true,
                        promotedToRecommended: item.promotedToRecommended ?? true,
                        promotedToSharedHome: item.promotedToSharedHome ?? true,
                        collectionMode: item.collectionMode || "default"
                    }
                });
                return { item, db: updated };
            })
        );

        // 2. Parallel Plex promotion & visibility sync
        let updatedCount = 0;
        await Promise.all(
            updatedDbRecords.filter(Boolean).map(async (entry) => {
                if (!entry) return;
                const { item, db } = entry;
                const targetRatingKey = db.ratingKey || item.ratingKey;
                if (!targetRatingKey) return;

                const prefix = item.sortPrefix || `!${String(item.orderIndex).padStart(2, '0')}_`;
                const effectiveSortTitle = `${prefix}${db.sortTitle || db.title}`;

                try {
                    await updatePlexCollectionPromotionAndOrder(
                        urlsToTry,
                        token,
                        sectionKey,
                        targetRatingKey,
                        {
                            sortTitle: effectiveSortTitle,
                            promotedToHome: item.promotedToHome ?? true,
                            promotedToRecommended: item.promotedToRecommended ?? true,
                            promotedToSharedHome: item.promotedToSharedHome ?? true,
                            collectionMode: item.collectionMode || "default"
                        }
                    );
                    updatedCount++;
                } catch (plexErr: any) {
                    logger.addLog("WARN", "PLEX", `Could not update promotion for "${db.title}": ${plexErr.message}`);
                }
            })
        );

        // 3. Smart selective Plex hub reordering with anchor positioning (preserves Continue Watching & skips already-ordered hubs)
        const desiredHubKeys = orderedCollections
            .map(item => item.ratingKey || item.id)
            .filter(Boolean) as string[];

        // Determine section media type for anchor positioning
        let libraryType: "show" | "movie" = "movie";
        try {
            const sections = await getPlexServerSections(token, serverId, resolved.serverUrl);
            const section = sections.find(s => String(s.key) === String(sectionKey));
            if (section?.type === "show" || section?.type === "tv") {
                libraryType = "show";
            }
        } catch {}

        const reorderResult = await reorderPlexHubsSelective(urlsToTry, token, sectionKey, desiredHubKeys, libraryType);

        logger.addLog("SUCCESS", "PLEX", `Reordered & synced ${updatedCount} collections/hubs on Plex server "${resolved.serverName}" (section ${sectionKey}) — ${reorderResult.movesPerformed} hub moves performed.`);
        return {
            success: true,
            updatedCount,
            movesPerformed: reorderResult.movesPerformed,
            message: `Updated ordering and home visibility for ${updatedCount} collections/hubs (${reorderResult.movesPerformed} hubs adjusted).`
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed reordering collections on Plex Home Screen: ${e.message}`);
        return { success: false, error: e.message || "Failed saving hub ordering." };
    }
}

/**
 * Fast 1-click toggle for Home, Shared Home, Recommended, or Collection Mode
 */
export async function toggleCollectionVisibilityAction(
    collectionId: string,
    target: "home" | "shared" | "recommended" | "mode",
    value: boolean | string
) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const collection = await prisma.mediaCollection.findUnique({ where: { id: collectionId } });
        if (!collection) return { success: false, error: "Collection not found." };

        const updateData: any = {};
        if (target === "home") updateData.promotedToHome = Boolean(value);
        else if (target === "shared") updateData.promotedToSharedHome = Boolean(value);
        else if (target === "recommended") updateData.promotedToRecommended = Boolean(value);
        else if (target === "mode") updateData.collectionMode = String(value);

        const updated = await prisma.mediaCollection.update({
            where: { id: collectionId },
            data: updateData
        });

        // Sync change immediately to Plex server if ratingKey and server are available
        if (updated.serverId && updated.sectionKey && updated.ratingKey) {
            const resolved = await resolveWorkingPlexServerConnection(updated.serverId);
            if (resolved?.serverUrl) {
                const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                const prefix = updated.sortPrefix || `!${String(updated.orderIndex || 0).padStart(2, '0')}_`;
                const sortTitle = `${prefix}${updated.sortTitle || updated.title}`;

                await updatePlexCollectionPromotionAndOrder(
                    urlsToTry,
                    resolved.token,
                    updated.sectionKey,
                    updated.ratingKey,
                    {
                        sortTitle,
                        promotedToHome: updated.promotedToHome,
                        promotedToRecommended: updated.promotedToRecommended,
                        promotedToSharedHome: updated.promotedToSharedHome,
                        collectionMode: updated.collectionMode || "default"
                    }
                );
            }
        }

        return { success: true, collection: updated };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * 1-click toggle for collection placeholder generation
 */
export async function toggleCollectionPlaceholdersAction(collectionId: string, includePlaceholders: boolean) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const collection = await prisma.mediaCollection.findUnique({ where: { id: collectionId } });
        if (!collection) return { success: false, error: "Collection not found." };

        const updated = await prisma.mediaCollection.update({
            where: { id: collectionId },
            data: { includePlaceholders: Boolean(includePlaceholders) }
        });

        return { 
            success: true, 
            collection: updated, 
            message: `Coming soon placeholders ${includePlaceholders ? "enabled" : "disabled"} for "${updated.title}".` 
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Full placement, visibility & scheduling configuration update for a collection
 */
export async function updateCollectionPlacementAction(data: {
    id: string;
    maxItems?: number;
    excludedLabels?: string;
    includePlaceholders?: boolean;
    promotedToHome?: boolean;
    promotedToSharedHome?: boolean;
    promotedToRecommended?: boolean;
    collectionMode?: string;
    orderIndex?: number;
    sortPrefix?: string;
    activeDays?: string;
    activeTimeRange?: string;
    isSeasonal?: boolean;
    scheduleStartMonth?: number | null;
    scheduleStartDay?: number | null;
    scheduleEndMonth?: number | null;
    scheduleEndDay?: number | null;
    seasonalAction?: string | null;
}) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const collection = await prisma.mediaCollection.findUnique({ where: { id: data.id } });
        if (!collection) return { success: false, error: "Collection not found." };

        const prefix = data.sortPrefix !== undefined ? data.sortPrefix : (data.orderIndex !== undefined ? `!${String(data.orderIndex).padStart(2, '0')}_` : collection.sortPrefix);

        const updated = await prisma.mediaCollection.update({
            where: { id: data.id },
            data: {
                maxItems: data.maxItems !== undefined ? data.maxItems : collection.maxItems,
                excludedLabels: data.excludedLabels !== undefined ? data.excludedLabels : collection.excludedLabels,
                includePlaceholders: data.includePlaceholders !== undefined ? data.includePlaceholders : collection.includePlaceholders,
                promotedToHome: data.promotedToHome ?? collection.promotedToHome,
                promotedToSharedHome: data.promotedToSharedHome ?? collection.promotedToSharedHome,
                promotedToRecommended: data.promotedToRecommended ?? collection.promotedToRecommended,
                collectionMode: data.collectionMode ?? collection.collectionMode,
                orderIndex: data.orderIndex ?? collection.orderIndex,
                sortPrefix: prefix,
                activeDays: data.activeDays ?? collection.activeDays,
                activeTimeRange: data.activeTimeRange ?? collection.activeTimeRange,
                isSeasonal: data.isSeasonal ?? collection.isSeasonal,
                scheduleStartMonth: data.scheduleStartMonth !== undefined ? data.scheduleStartMonth : collection.scheduleStartMonth,
                scheduleStartDay: data.scheduleStartDay !== undefined ? data.scheduleStartDay : collection.scheduleStartDay,
                scheduleEndMonth: data.scheduleEndMonth !== undefined ? data.scheduleEndMonth : collection.scheduleEndMonth,
                scheduleEndDay: data.scheduleEndDay !== undefined ? data.scheduleEndDay : collection.scheduleEndDay,
                seasonalAction: data.seasonalAction !== undefined ? data.seasonalAction : collection.seasonalAction,
            }
        });

        // Push directly to Plex
        if (updated.serverId && updated.sectionKey && updated.ratingKey) {
            const resolved = await resolveWorkingPlexServerConnection(updated.serverId);
            if (resolved?.serverUrl) {
                const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                const sortTitle = `${prefix}${updated.sortTitle || updated.title}`;

                await updatePlexCollectionPromotionAndOrder(
                    urlsToTry,
                    resolved.token,
                    updated.sectionKey,
                    updated.ratingKey,
                    {
                        sortTitle,
                        promotedToHome: updated.promotedToHome,
                        promotedToRecommended: updated.promotedToRecommended,
                        promotedToSharedHome: updated.promotedToSharedHome,
                        collectionMode: updated.collectionMode || "default"
                    }
                );
            }
        }

        return { success: true, collection: updated, message: `Placement settings for "${updated.title}" saved and synced to Plex.` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function syncSeasonalAndScheduledCollectionsInternal(serverId?: string, sectionKey?: string) {
    try {
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;
        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];

        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const enabledServersForCollections: string[] = settings?.enabledServersForCollections
            ? JSON.parse(settings.enabledServersForCollections)
            : [];

        const serverIdCandidates = [serverId, resolved?.serverId, "main"].filter(Boolean) as string[];
        let allCollections = await prisma.mediaCollection.findMany({
            where: {
                isIgnored: false,
                ...(serverId ? { serverId: { in: serverIdCandidates } } : {}),
                ...(sectionKey ? { sectionKey: String(sectionKey) } : {})
            }
        });

        if (allCollections.length === 0 && serverId) {
            allCollections = await prisma.mediaCollection.findMany({
                where: {
                    isIgnored: false,
                    serverId: { in: serverIdCandidates }
                }
            });
        }

        logger.addLog("INFO", "CURATION", `Starting seasonal & scheduled collection sync for ${allCollections.length} collections on server "${resolved.serverName}"...`);

        const now = new Date();
        const curMonth = now.getMonth() + 1; // 1-12
        const curDay = now.getDate();        // 1-31
        const curVal = curMonth * 100 + curDay;
        const curHour = now.getHours();      // 0-23
        const daysMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const curDayCode = daysMap[now.getDay()];

        const results: Array<{ title: string; active: boolean; action: string }> = [];

        for (const coll of allCollections) {
            // Respect library section enablement whitelist
            if (coll.serverId && coll.sectionKey) {
                const isSecEnabled = await isSectionEnabledInList(enabledServersForCollections, coll.serverId, coll.sectionKey);
                if (!isSecEnabled) {
                    continue;
                }
            }

            const isScheduled = Boolean(coll.isSeasonal || (coll.activeDays && coll.activeDays !== "all") || (coll.activeTimeRange && coll.activeTimeRange !== "all_day"));

            if (isScheduled) {
                let isScheduleActive = true;

                // 1. Day of Week Check
                if (coll.activeDays && coll.activeDays !== "all") {
                    const allowedDays = coll.activeDays.toLowerCase().split(",").map(d => d.trim());
                    if (!allowedDays.includes(curDayCode)) {
                        isScheduleActive = false;
                    }
                }

                // 2. Time of Day Check
                if (isScheduleActive && coll.activeTimeRange && coll.activeTimeRange !== "all_day") {
                    if (coll.activeTimeRange === "evening") {
                        // 6:00 PM (18) to 11:59 PM (23)
                        if (curHour < 18 || curHour > 23) isScheduleActive = false;
                    } else if (coll.activeTimeRange === "late_night") {
                        // 11:00 PM (23) to 4:00 AM (4)
                        if (curHour < 23 && curHour > 4) isScheduleActive = false;
                    } else if (coll.activeTimeRange === "daytime") {
                        // 8:00 AM (8) to 5:00 PM (17)
                        if (curHour < 8 || curHour > 17) isScheduleActive = false;
                    }
                }

                // 3. Seasonal Calendar Range Check
                if (isScheduleActive && coll.isSeasonal) {
                    const startM = coll.scheduleStartMonth || 1;
                    const startD = coll.scheduleStartDay || 1;
                    const endM = coll.scheduleEndMonth || 12;
                    const endD = coll.scheduleEndDay || 31;

                    const startVal = startM * 100 + startD;
                    const endVal = endM * 100 + endD;

                    let isInSeason = false;
                    if (startVal <= endVal) {
                        isInSeason = curVal >= startVal && curVal <= endVal;
                    } else {
                        // Wrap around year end (e.g. Nov 20 to Jan 6)
                        isInSeason = curVal >= startVal || curVal <= endVal;
                    }
                    if (!isInSeason) isScheduleActive = false;
                }

                if (isScheduleActive) {
                    // Promote active scheduled collection
                    await prisma.mediaCollection.update({
                        where: { id: coll.id },
                        data: { promotedToHome: true, promotedToRecommended: true }
                    });

                    let placeholderNotes = "";
                    if (coll.includePlaceholders) {
                        try {
                            const pRes = await generateCollectionPlaceholdersInternal(coll);
                            if (pRes.success && pRes.generatedCount > 0) {
                                placeholderNotes = ` (+${pRes.generatedCount} placeholders)`;
                            }
                        } catch (pErr: any) {
                            console.warn("[CURATION-SYNC] Error generating placeholders for active schedule:", pErr.message);
                        }
                    }

                    if (coll.ratingKey && coll.sectionKey) {
                        const prefix = coll.sortPrefix || `!02_Schedule_`;
                        const effectiveSort = `${prefix}${coll.sortTitle || coll.title}`;
                        await updatePlexCollectionPromotionAndOrder(
                            urlsToTry,
                            token,
                            coll.sectionKey,
                            coll.ratingKey,
                            {
                                sortTitle: effectiveSort,
                                promotedToHome: true,
                                promotedToRecommended: true,
                                promotedToSharedHome: coll.promotedToSharedHome,
                                collectionMode: coll.collectionMode || "default"
                            }
                        ).catch(() => {});
                    } else if (!coll.ratingKey) {
                        // Auto-sync collection if not yet created on Plex
                        await syncCollectionToPlexAction(coll.id).catch(() => {});
                    }

                    results.push({ title: coll.title, active: true, action: `Promoted to Plex Home & Recommended (Schedule Active)${placeholderNotes}` });
                } else {
                    // Demote / hide inactive scheduled collection
                    const shouldHide = coll.seasonalAction === "promote_hide" || coll.seasonalAction === "create_delete";

                    await prisma.mediaCollection.update({
                        where: { id: coll.id },
                        data: { promotedToHome: !shouldHide }
                    });

                    if (coll.ratingKey && coll.sectionKey) {
                        await updatePlexCollectionPromotionAndOrder(
                            urlsToTry,
                            token,
                            coll.sectionKey,
                            coll.ratingKey,
                            {
                                promotedToHome: !shouldHide,
                                promotedToRecommended: !shouldHide,
                                collectionMode: coll.collectionMode || "default"
                            }
                        ).catch(() => {});
                    }

                    results.push({ title: coll.title, active: false, action: shouldHide ? "Hidden from Plex Home (Out of Schedule/Season)" : "Demoted" });
                }
            } else {
                // Non-scheduled active collection (e.g. dynamic or standard)
                let placeholderNotes = "";
                if (coll.includePlaceholders) {
                    try {
                        const pRes = await generateCollectionPlaceholdersInternal(coll);
                        if (pRes.success && pRes.generatedCount > 0) {
                            placeholderNotes = ` (+${pRes.generatedCount} placeholders generated)`;
                        }
                    } catch (pErr: any) {
                        console.warn("[CURATION-SYNC] Error generating placeholders for dynamic collection:", pErr.message);
                    }
                }

                if (!coll.ratingKey || coll.sourceType !== "plex_native") {
                    // Auto-sync dynamic collection to Plex to refresh contents & ordering
                    await syncCollectionToPlexAction(coll.id).catch(() => {});
                } else if (coll.ratingKey && coll.sectionKey) {
                    const sortTitle = `${coll.sortPrefix || "!00_"}${coll.sortTitle || coll.title}`;
                    await updatePlexCollectionPromotionAndOrder(
                        urlsToTry,
                        token,
                        coll.sectionKey,
                        coll.ratingKey,
                        {
                            sortTitle,
                            promotedToHome: coll.promotedToHome ?? true,
                            promotedToRecommended: coll.promotedToRecommended ?? true,
                            promotedToSharedHome: coll.promotedToSharedHome ?? true,
                            collectionMode: coll.collectionMode || "default"
                        }
                    ).catch(() => {});
                }

                results.push({
                    title: coll.title,
                    active: true,
                    action: `Collection Synced & Active${placeholderNotes}`
                });
            }
        }

        // Auto-cleanup any Coming Soon placeholders for media items that have now been acquired in Plex
        try {
            await cleanupAvailablePlaceholdersInternal(serverId, sectionKey);
        } catch (cleanErr: any) {
            console.warn("[CURATION-SYNC] Error in placeholder auto-cleanup:", cleanErr.message);
        }

        logger.addLog("SUCCESS", "CURATION", `Evaluated & synced ${allCollections.length} collections and hubs on server "${resolved.serverName}".`);
        return {
            success: true,
            evaluatedCount: allCollections.length,
            results,
            message: `Evaluated & synced ${allCollections.length} collections and hubs.`
        };
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Error syncing seasonal & scheduled collections: ${e.message}`);
        return { success: false, error: e.message };
    }
}

export async function syncSeasonalAndScheduledCollectionsAction(serverId?: string, sectionKey?: string) {
    try {
        await verifyAdmin();
        return await syncSeasonalAndScheduledCollectionsInternal(serverId, sectionKey);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Seasonal sync failed: ${e.message}`);
        return { success: false, error: e.message || "Seasonal sync failed" } as any;
    }
}

export async function syncLeavingSoonCollectionHubInternal(serverId?: string, sectionKey?: string) {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;
        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];

        // Query active leaving soon items
        const leavingSoonItems = await prisma.mediaContentAdvisory.findMany({
            where: {
                isLeavingSoon: true,
                ...(serverId ? { serverId } : {})
            }
        });

        const autoHideEmpty = settings?.leavingSoonAutoHideEmpty ?? true;
        const shouldPromote = leavingSoonItems.length > 0 ? (settings?.leavingSoonPromotedToHome ?? true) : !autoHideEmpty;
        const shouldPromoteRec = leavingSoonItems.length > 0 ? (settings?.leavingSoonPromotedToRecommended ?? true) : !autoHideEmpty;

        // Find or create Leaving Soon collection in DB
        let collection = await prisma.mediaCollection.findFirst({
            where: {
                type: "dynamic",
                sourceQuery: "tag:leaving-soon",
                ...(serverId ? { serverId } : {})
            }
        });

        if (!collection && serverId && sectionKey) {
            collection = await prisma.mediaCollection.create({
                data: {
                    title: "⚠️ Leaving Soon",
                    summary: "Items scheduled to be removed soon from storage. Watch before they are gone!",
                    sortTitle: "Leaving Soon",
                    type: "dynamic",
                    category: "dynamic",
                    serverId,
                    sectionKey: String(sectionKey),
                    sourceType: "plex_query",
                    sourceQuery: "tag:leaving-soon",
                    orderIndex: settings?.leavingSoonHomeOrder ?? 0,
                    sortPrefix: "!00_",
                    promotedToHome: shouldPromote,
                    promotedToRecommended: shouldPromoteRec,
                    promotedToSharedHome: settings?.leavingSoonPromotedToSharedHome ?? true
                }
            });
        }

        const leavingRatingKeys = leavingSoonItems.map(it => it.ratingKey);

        if (collection) {
            const secKey = sectionKey || collection.sectionKey;
            let syncResultRatingKey: string | undefined = collection.ratingKey || undefined;

            if (leavingRatingKeys.length > 0 && secKey) {
                const syncRes = await syncPlexCollection(
                    urlsToTry,
                    token,
                    secKey,
                    "⚠️ Leaving Soon",
                    leavingRatingKeys,
                    {
                        summary: "Items scheduled to be removed soon from storage. Watch before they are gone!",
                        sortTitle: "!00_LeavingSoon",
                        promotedToHome: shouldPromote,
                        promotedToRecommended: shouldPromoteRec,
                        promotedToSharedHome: settings?.leavingSoonPromotedToSharedHome ?? true,
                        collectionMode: "showItems"
                    }
                );
                if (syncRes.collectionRatingKey) {
                    syncResultRatingKey = syncRes.collectionRatingKey;
                }
            } else if (collection.ratingKey && secKey) {
                // 0 items: Update promotion and hide if configured
                await updatePlexCollectionPromotionAndOrder(
                    urlsToTry,
                    token,
                    secKey,
                    collection.ratingKey,
                    {
                        sortTitle: "!00_LeavingSoon",
                        promotedToHome: shouldPromote,
                        promotedToRecommended: shouldPromoteRec,
                        promotedToSharedHome: false,
                        collectionMode: shouldPromote ? "default" : "hide"
                    }
                );
            }

            // Apply Leaving Soon banner overlays to all active items in Plex
            if (serverUrl && token && leavingSoonItems.length > 0) {
                const targetServerId = serverId || resolved.serverId || "main";
                const bannerText = settings?.pruneBannerText || "LEAVING ON {date}";
                const bannerTheme = settings?.pruneBannerTheme || "crimson-red";
                const bannerPosition = settings?.pruneBannerPosition || "bottom";

                for (const adv of leavingSoonItems) {
                    try {
                        const matched = await getPlexSingleItemMetadata(serverUrl, token, adv.ratingKey);
                        if (matched) {
                            matched.isLeavingSoon = true;
                            const daysLeft = adv.leavingSoonDate 
                                ? Math.max(1, Math.ceil((new Date(adv.leavingSoonDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
                                : (settings?.pruneDaysNotice ?? 14);
                            const effectiveDateStr = adv.leavingSoonDate 
                                ? new Date(adv.leavingSoonDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                : new Date(Date.now() + daysLeft * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

                            const overlayOpts = await getActiveOverlayOptionsHelper(targetServerId, matched.librarySectionID ? String(matched.librarySectionID) : sectionKey, {
                                showLeavingSoon: true,
                                leavingSoonDays: daysLeft,
                                digitalReleaseDate: effectiveDateStr,
                                placeholderText: bannerText,
                                placeholderTheme: bannerTheme,
                                placeholderPosition: bannerPosition
                            });

                            await backupAndApplyOverlay(
                                serverUrl,
                                token,
                                targetServerId,
                                matched,
                                overlayOpts,
                                true
                            );
                        }
                    } catch (itemErr: any) {
                        console.warn(`[LEAVING-SOON] Failed applying banner overlay to item ${adv.ratingKey}:`, itemErr.message);
                    }
                }
            }

            await prisma.mediaCollection.update({
                where: { id: collection.id },
                data: {
                    itemCount: leavingSoonItems.length,
                    promotedToHome: shouldPromote,
                    promotedToRecommended: shouldPromoteRec,
                    orderIndex: settings?.leavingSoonHomeOrder ?? 0,
                    sortPrefix: "!00_",
                    ratingKey: syncResultRatingKey,
                    lastSyncedAt: new Date()
                }
            });
        }

        return {
            success: true,
            leavingCount: leavingSoonItems.length,
            promotedToHome: shouldPromote,
            promotedToRecommended: shouldPromoteRec,
            message: `Leaving Soon collection synced: ${leavingSoonItems.length} items (${shouldPromote ? "Promoted to Home & Recommended" : "Hidden from Home"}).`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function syncLeavingSoonCollectionHubAction(serverId?: string, sectionKey?: string) {
    try {
        await verifyAdmin();
        return await syncLeavingSoonCollectionHubInternal(serverId, sectionKey);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Leaving soon sync failed: ${e.message}`);
        return { success: false, error: e.message || "Leaving soon sync failed" } as any;
    }
}

export async function deleteMediaCollectionAction(collectionId: string, deleteFromPlex = true, ignoreReimport = true) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        let collection = await prisma.mediaCollection.findUnique({
            where: { id: collectionId }
        });

        if (!collection) {
            // Check by title or ratingKey in case collectionId was auto-healed or mismatched
            collection = await prisma.mediaCollection.findFirst({
                where: {
                    OR: [
                        { id: collectionId },
                        { title: collectionId },
                        { ratingKey: collectionId }
                    ]
                }
            });
        }

        const collTitle = collection?.title || collectionId;
        const collRatingKey = collection?.ratingKey || collectionId;
        const serverId = collection?.serverId;
        const sectionKey = collection?.sectionKey;

        // Register in Dismissed Hubs ignore list so Import from Plex will NOT bring it back
        if (ignoreReimport && (collTitle || collRatingKey)) {
            await addDismissedHubInternal({
                id: collection?.id,
                ratingKey: collRatingKey,
                title: collTitle,
                serverId: serverId || undefined,
                sectionKey: sectionKey || undefined
            });
        }

        if (deleteFromPlex) {
            try {
                const resolved = await resolveWorkingPlexServerConnection(serverId || undefined);
                if (resolved && resolved.serverUrl && resolved.token) {
                    const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                    const targetKey = (collRatingKey && collRatingKey !== collectionId) ? collRatingKey : (collTitle || collectionId);
                    await deletePlexCollection(urlsToTry, resolved.token, targetKey, sectionKey || undefined);
                }
            } catch (err: any) {
                logger.addLog("WARN", "PLEX", `Could not delete collection "${collTitle}" from Plex: ${err.message}`);
            }
        }

        // Delete the canonical record AND any duplicate records matching this title / server / sectionKey
        await prisma.mediaCollection.deleteMany({
            where: {
                OR: [
                    { id: collectionId },
                    ...(collection ? [{ id: collection.id }] : []),
                    ...(collTitle ? [{ title: collTitle }] : [])
                ]
            }
        });

        logger.addLog("SUCCESS", "PLEX", `Deleted collection "${collTitle}" from database and Plex (added to Dismissed Hubs).`);
        return { success: true, message: `Deleted "${collTitle}". It has been added to Dismissed Hubs so it will stay gone when importing from Plex.` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Server action to delete all collections and hubs in a Plex library section and wipe DB records.
 */
export async function deleteAllPlexCollectionsAction(
    serverId: string,
    sectionKey: string
): Promise<{ success: boolean; deletedCount: number; message: string }> {
    try {

        await verifyAdmin();
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl || !resolved.token) {
            return { success: false, deletedCount: 0, message: "Plex server connection unavailable." };
        }
        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
        const token = resolved.token;

        // 1. Fetch all collections in this section from Plex
        const plexCollections = await getPlexLibraryCollections(urlsToTry, token, sectionKey);
        let deletedCount = 0;

        for (const c of plexCollections) {
            try {
                const success = await deletePlexCollection(urlsToTry, token, c.ratingKey || c.title, sectionKey);
                if (success) deletedCount++;
            } catch {}
        }

        // 2. Also wipe all mediaCollection records for this server & section in DB
        const dbResult = await prisma.mediaCollection.deleteMany({
            where: {
                serverId,
                sectionKey
            }
        });

        const total = Math.max(deletedCount, dbResult.count);
        logger.addLog("SUCCESS", "PLEX", `Wiped ${total} collection(s) & hubs for section ${sectionKey} on Plex server "${resolved.serverName}"`);

        return {
            success: true,
            deletedCount: total,
            message: `Successfully deleted ${total} collection(s) from Plex section and reset Agregarr configurations.`
        };
    } catch (e: any) {
        return { success: false, deletedCount: 0, message: e.message };
    }
}

/**
 * Internal helper to write essential built-in high-DPI SVGs to data/custom_badges and upsert records into prisma.customBadge.
 */
export async function seedDefaultCustomBadgesInternal(): Promise<{ count: number }> {
    const badgeVaultDir = path.join(process.cwd(), "data", "custom_badges");
    if (!fs.existsSync(badgeVaultDir)) {
        fs.mkdirSync(badgeVaultDir, { recursive: true });
    }

    let seededCount = 0;
    for (const b of DEFAULT_BUILTIN_BADGE_DEFINITIONS) {
        try {
            const fileName = `${b.id}.svg`;
            const filePath = path.join(badgeVaultDir, fileName);
            fs.writeFileSync(filePath, b.svgContent, "utf-8");

            await prisma.customBadge.upsert({
                where: { id: b.id },
                update: {
                    name: b.name,
                    category: b.category,
                    filePath,
                    fileType: "svg",
                    mimeType: "image/svg+xml",
                    position: b.position,
                    width: b.width,
                    height: b.height,
                    opacity: 1.0,
                    matchRule: b.matchRule,
                    enabled: true
                },
                create: {
                    id: b.id,
                    name: b.name,
                    category: b.category,
                    filePath,
                    fileType: "svg",
                    mimeType: "image/svg+xml",
                    position: b.position,
                    width: b.width,
                    height: b.height,
                    opacity: 1.0,
                    matchRule: b.matchRule,
                    enabled: true
                }
            });
            seededCount++;
        } catch (err: any) {
            console.warn(`[BADGE-SEED] Failed seeding badge ${b.id}:`, err.message);
        }
    }

    return { count: seededCount };
}

/**
 * Server action to install / reset all essential custom badges in bulk with 1 click.
 */
export async function seedDefaultCustomBadgesAction() {
    try {

        await verifyAdmin();
        const res = await seedDefaultCustomBadgesInternal();
        const allBadges = await prisma.customBadge.findMany({ orderBy: { createdAt: "desc" } });
        return {
            success: true,
            seededCount: res.count,
            totalBadges: allBadges.length,
            badges: allBadges,
            message: `Successfully installed / reset ${res.count} essential high-DPI custom badges in your vault!`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed seeding default custom badges." };
    }
}

/**
 * Server action to download and sync all 190+ authentic official Kometa overlay badges
 * directly from the official Kometa repository (Kometa-Team/Kometa/defaults/overlays/images).
 */
export async function syncOfficialKometaBadgesAction() {
    try {

        await verifyAdmin();
        const badgeVaultDir = path.join(process.cwd(), "data", "custom_badges");
        if (!fs.existsSync(badgeVaultDir)) {
            fs.mkdirSync(badgeVaultDir, { recursive: true });
        }

        const headers = {
            "User-Agent": "Portalarr-Overlay-Hub/1.0",
            "Accept": "application/vnd.github.v3+json"
        };

        const corePrefixes = [
            "defaults/overlays/images/resolution",
            "defaults/overlays/images/audio_codec",
            "defaults/overlays/images/edition",
            "defaults/overlays/images/streaming",
            "defaults/overlays/images/ribbon",
            "defaults/overlays/images/rating",
            "defaults/overlays/images/cr",
            "defaults/overlays/images/content_rating",
            "defaults/overlays/images/video_codec",
            "defaults/overlays/images/status",
            "defaults/overlays/images/network"
        ];

        // 1. Fetch official Git tree from master branch
        let treeRes = await fetch("https://api.github.com/repos/Kometa-Team/Kometa/git/trees/master?recursive=1", { headers });
        if (!treeRes.ok) {
            treeRes = await fetch("https://api.github.com/repos/Kometa-Team/Kometa/git/trees/main?recursive=1", { headers });
        }

        if (!treeRes.ok) {
            // Fallback: seed built-ins if GitHub API is unreachable
            const seedRes = await seedDefaultCustomBadgesInternal();
            const allBadges = await prisma.customBadge.findMany({ orderBy: { createdAt: "desc" } });
            return {
                success: true,
                syncedCount: seedRes.count,
                totalBadges: allBadges.length,
                badges: allBadges,
                message: `GitHub API rate-limited or unavailable. Loaded ${seedRes.count} built-in high-DPI badges instead.`
            };
        }

        const treeData = await treeRes.json();
        const tree: any[] = treeData.tree || [];

        const targetFiles = tree.filter(item => {
            if (item.type !== "blob") return false;
            const p = item.path || "";
            if (!/\.(png|svg|webp|jpg|jpeg)$/i.test(p)) return false;
            return corePrefixes.some(pref => p.startsWith(pref));
        });

        if (targetFiles.length === 0) {
            const seedRes = await seedDefaultCustomBadgesInternal();
            const allBadges = await prisma.customBadge.findMany({ orderBy: { createdAt: "desc" } });
            return {
                success: true,
                syncedCount: seedRes.count,
                totalBadges: allBadges.length,
                badges: allBadges,
                message: `Seeded ${seedRes.count} built-in badges.`
            };
        }

        let syncedCount = 0;
        const concurrency = 12;

        for (let i = 0; i < targetFiles.length; i += concurrency) {
            const batch = targetFiles.slice(i, i + concurrency);
            await Promise.all(batch.map(async item => {
                try {
                    const rawPath: string = item.path;
                    const filename = rawPath.split("/").pop() || "";
                    const ext = path.extname(filename).toLowerCase() || ".png";
                    const cleanName = filename.replace(/\.[^/.]+$/, "");
                    const badgeId = `official_kometa_${rawPath.replace(/^defaults\/overlays\/images\//, "").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase()}`;

                    const rawUrl = `https://raw.githubusercontent.com/Kometa-Team/Kometa/master/${rawPath}`;
                    const imgRes = await fetch(rawUrl);
                    if (!imgRes.ok) return;

                    const arrayBuf = await imgRes.arrayBuffer();
                    const fileBuf = Buffer.from(arrayBuf);
                    const destPath = path.join(badgeVaultDir, `${badgeId}${ext}`);
                    fs.writeFileSync(destPath, fileBuf);

                    let measuredWidth = 140;
                    let measuredHeight = 46;
                    let mimeType = ext === ".svg" ? "image/svg+xml" : `image/${ext.replace(".", "")}`;

                    try {
                        const meta = await sharp(fileBuf).metadata();
                        if (meta.width) measuredWidth = meta.width;
                        if (meta.height) measuredHeight = meta.height;
                        if (meta.format) mimeType = `image/${meta.format}`;
                    } catch (_) {}

                    const { category, suggestedPosition, suggestedMatchRule } = inferBadgeCategoryAndRule(rawPath, filename);
                    let displayName = cleanName.replace(/[-_]+/g, " ").replace(/@2x/gi, "").trim();
                    if (displayName.length <= 4) displayName = displayName.toUpperCase();

                    await prisma.customBadge.upsert({
                        where: { id: badgeId },
                        update: {
                            name: displayName,
                            category,
                            filePath: destPath,
                            fileType: ext.replace(".", ""),
                            mimeType,
                            position: suggestedPosition,
                            width: measuredWidth,
                            height: measuredHeight,
                            opacity: 1.0,
                            matchRule: suggestedMatchRule,
                            enabled: true
                        },
                        create: {
                            id: badgeId,
                            name: displayName,
                            category,
                            filePath: destPath,
                            fileType: ext.replace(".", ""),
                            mimeType,
                            position: suggestedPosition,
                            width: measuredWidth,
                            height: measuredHeight,
                            opacity: 1.0,
                            matchRule: suggestedMatchRule,
                            enabled: true
                        }
                    });

                    syncedCount++;
                } catch (bErr: any) {
                    console.warn(`[KOMETA-OFFICIAL-SYNC] Error syncing ${item.path}:`, bErr.message);
                }
            }));
        }

        const allBadges = await prisma.customBadge.findMany({ orderBy: { createdAt: "desc" } });
        logger.addLog("SUCCESS", "CURATION", `Synced ${syncedCount} authentic official Kometa overlay badges.`);

        return {
            success: true,
            syncedCount,
            totalBadges: allBadges.length,
            badges: allBadges,
            message: `Successfully synced and installed ${syncedCount} official Kometa transparent PNG badges in your vault!`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed syncing official Kometa badges." };
    }
}

/**
 * Server action to upload and install a custom badge file (SVG, PNG, WebP).
 */
export async function uploadCustomBadgeAction(formData: FormData) {
    try {

        await verifyAdmin();
        const file = formData.get("file") as File | null;
        const name = (formData.get("name") as string) || "Custom Badge";
        const category = (formData.get("category") as string) || "custom";
        const defaultCategoryPos: Record<string, string> = {
            contentRating: "bottom-left",
            studio: "bottom-left",
            edition: "top-left",
            audio: "top-left",
            channels: "top-left",
            ratings: "bottom-right",
            ribbon: "top-left",
            resolution: "top-right",
            hdr: "top-right",
            codec: "top-right"
        };
        const position = (formData.get("position") as string) || defaultCategoryPos[category] || "top-right";
        const matchRule = (formData.get("matchRule") as string) || null;
        const width = parseInt(formData.get("width") as string) || 140;
        const height = parseInt(formData.get("height") as string) || 46;
        const opacity = parseFloat(formData.get("opacity") as string) || 1.0;

        if (!file) {
            return { success: false, error: "No file provided for upload." };
        }

        const badgeVaultDir = path.join(process.cwd(), "data", "custom_badges");
        if (!fs.existsSync(badgeVaultDir)) {
            fs.mkdirSync(badgeVaultDir, { recursive: true });
        }

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const ext = path.extname(file.name).toLowerCase() || ".png";
        const fileId = `custom_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const destPath = path.join(badgeVaultDir, `${fileId}${ext}`);

        fs.writeFileSync(destPath, buffer);

        let measuredWidth = width;
        let measuredHeight = height;
        let mimeType = ext === ".svg" ? "image/svg+xml" : "image/png";
        if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
        if (ext === ".webp") mimeType = "image/webp";

        try {
            const meta = await sharp(buffer).metadata();
            if (meta.width) measuredWidth = meta.width;
            if (meta.height) measuredHeight = meta.height;
            if (meta.format) mimeType = `image/${meta.format}`;
        } catch (sErr) {}

        const badge = await prisma.customBadge.create({
            data: {
                id: fileId,
                name,
                category,
                filePath: destPath,
                fileType: ext.replace(".", "").toLowerCase(),
                mimeType,
                position,
                width: measuredWidth,
                height: measuredHeight,
                opacity,
                matchRule: matchRule ? matchRule.trim() : null,
                enabled: true
            }
        });

        return { success: true, badge, message: `Uploaded and installed "${name}" successfully!` };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed uploading custom badge." };
    }
}

export async function getCustomBadgesAction() {
    try {

        await verifyAdmin();
        let badges = await prisma.customBadge.findMany({
            orderBy: { createdAt: "desc" }
        });

        // Auto-seed essential badges if vault is empty
        if (badges.length === 0) {
            await seedDefaultCustomBadgesInternal();
            badges = await prisma.customBadge.findMany({
                orderBy: { createdAt: "desc" }
            });
        }

        // Auto-heal any badges with outdated or truncated match rules & categories (and persist corrections)
        for (const b of badges) {
            const inferred = inferBadgeCategoryAndRule(b.filePath || "", b.name || "");
            let needsUpdate = false;
            let newCat = b.category;
            let newRule = b.matchRule;

            if (inferred.category && inferred.category !== "custom" && (b.category === "custom" || b.category !== inferred.category)) {
                newCat = inferred.category;
                needsUpdate = true;
            }
            if (inferred.suggestedMatchRule && (!b.matchRule || b.matchRule === "auto" || b.matchRule === "special" || (inferred.category === "contentRating" && b.matchRule !== inferred.suggestedMatchRule))) {
                newRule = inferred.suggestedMatchRule;
                needsUpdate = true;
            }

            if (needsUpdate) {
                b.category = newCat;
                b.matchRule = newRule;
                await prisma.customBadge.update({
                    where: { id: b.id },
                    data: { category: newCat, matchRule: newRule }
                }).catch(() => {});
            }
        }

        return { success: true, badges };
    } catch (e: any) {
        return { success: false, error: e.message, badges: [] };
    }
}

export async function saveCustomBadgeAction(data: {
    id: string;
    name?: string;
    category?: string;
    position?: string;
    width?: number;
    height?: number;
    opacity?: number;
    enabled?: boolean;
    matchRule?: string;
}) {
    try {

        await verifyAdmin();
        const badge = await prisma.customBadge.update({
            where: { id: data.id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.category !== undefined ? { category: data.category } : {}),
                ...(data.position !== undefined ? { position: data.position } : {}),
                ...(data.width !== undefined ? { width: data.width } : {}),
                ...(data.height !== undefined ? { height: data.height } : {}),
                ...(data.opacity !== undefined ? { opacity: data.opacity } : {}),
                ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
                ...(data.matchRule !== undefined ? { matchRule: data.matchRule } : {})
            }
        });
        return { success: true, badge, message: `Updated custom badge "${badge.name}".` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteCustomBadgeAction(id: string) {
    try {

        await verifyAdmin();
        const badge = await prisma.customBadge.findUnique({ where: { id } });
        if (badge) {
            try {
                if (fs.existsSync(badge.filePath)) fs.unlinkSync(badge.filePath);
            } catch (err) {}
            await prisma.customBadge.delete({ where: { id } });
        }
        return { success: true, message: "Custom badge removed." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function deleteMultipleCustomBadgesAction(ids: string[]) {
    try {

        await verifyAdmin();
        if (!ids || ids.length === 0) return { success: true, count: 0 };
        let deletedCount = 0;
        const CHUNK_SIZE = 400;

        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const badges = await prisma.customBadge.findMany({
                where: { id: { in: chunk } }
            });
            for (const b of badges) {
                try {
                    if (fs.existsSync(b.filePath)) fs.unlinkSync(b.filePath);
                } catch (err) {}
            }
            const delRes = await prisma.customBadge.deleteMany({
                where: { id: { in: chunk } }
            });
            deletedCount += delRes.count;
        }

        logger.addLog("INFO", "CURATION", `Deleted ${deletedCount} custom badges.`);
        return { success: true, count: deletedCount, message: `Deleted ${deletedCount} custom badge(s).` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Server action to bulk delete all custom badges and purge all badge image files from disk.
 * @param options.keepEssential - If true (default), immediately re-seeds the standard 35 essential high-DPI SVGs. If false, completely wipes all badges (0 badges).
 */
export async function deleteAllCustomBadgesAction(options?: { keepEssential?: boolean }) {
    try {

        await verifyAdmin();
        const keepEssential = options?.keepEssential ?? true;
        const badgeVaultDir = path.join(process.cwd(), "data", "custom_badges");

        // Remove all files from data/custom_badges
        if (fs.existsSync(badgeVaultDir)) {
            try {
                const files = fs.readdirSync(badgeVaultDir);
                for (const file of files) {
                    try {
                        const p = path.join(badgeVaultDir, file);
                        if (fs.statSync(p).isFile()) {
                            fs.unlinkSync(p);
                        }
                    } catch (fErr) {}
                }
            } catch (dErr) {}
        }

        // Wipe all records from the CustomBadge database table
        const delRes = await prisma.customBadge.deleteMany({});

        let seededCount = 0;
        if (keepEssential) {
            const seedRes = await seedDefaultCustomBadgesInternal();
            seededCount = seedRes.count;
        }

        const remainingBadges = await prisma.customBadge.findMany({ orderBy: { createdAt: "desc" } });

        logger.addLog("SUCCESS", "CURATION", `Bulk purged ${delRes.count} custom badges from vault. Current count: ${remainingBadges.length}`);

        return {
            success: true,
            deletedCount: delRes.count,
            totalBadges: remainingBadges.length,
            badges: remainingBadges,
            message: keepEssential
                ? `Successfully purged ${delRes.count} badges from disk & database and restored ${seededCount} clean essential high-DPI badges!`
                : `Successfully deleted all ${delRes.count} custom badges and purged files from disk.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed bulk deleting custom badges." };
    }
}

export async function toggleMultipleCustomBadgesAction(ids: string[], enabled: boolean) {
    try {

        await verifyAdmin();
        if (!ids || ids.length === 0) return { success: true, count: 0 };
        let updatedCount = 0;
        const CHUNK_SIZE = 400;

        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
            const chunk = ids.slice(i, i + CHUNK_SIZE);
            const updateRes = await prisma.customBadge.updateMany({
                where: { id: { in: chunk } },
                data: { enabled }
            });
            updatedCount += updateRes.count;
        }

        return { success: true, count: updatedCount, message: `${enabled ? "Enabled" : "Disabled"} ${updatedCount} custom badge(s).` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function toggleCustomBadgeAction(id: string, enabled: boolean) {
    try {

        await verifyAdmin();
        await prisma.customBadge.update({
            where: { id },
            data: { enabled }
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getOverlayRulesAction(serverId?: string, sectionKey?: string) {
    try {

        await verifyAdmin();
        let rules: any[] = [];
        if (serverId && sectionKey) {
            rules = await prisma.mediaOverlayRule.findMany({
                where: { serverId, sectionKey: String(sectionKey) },
                orderBy: { updatedAt: "desc" }
            });
        }
        if (rules.length === 0 && serverId) {
            rules = await prisma.mediaOverlayRule.findMany({
                where: { serverId },
                orderBy: { updatedAt: "desc" }
            });
        }
        if (rules.length === 0) {
            rules = await prisma.mediaOverlayRule.findMany({
                orderBy: { updatedAt: "desc" }
            });
        }

        const backupsCount = await prisma.mediaArtBackup.count({
            where: serverId ? { serverId } : {}
        });

        const customBadges = await prisma.customBadge.findMany({
            where: { enabled: true }
        });

        return { success: true, rules, backupsCount, customBadges };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function saveOverlayRuleAction(data: {
    id?: string;
    name?: string;
    serverId: string;
    sectionKey?: string;
    overlayType?: string;
    position?: string;
    videoPosition?: string;
    audioPosition?: string;
    editionPosition?: string;
    ratingPosition?: string;
    resolutionPosition?: string;
    hdrPosition?: string;
    codecPosition?: string;
    channelsPosition?: string;
    studioPosition?: string;
    contentRatingPosition?: string;
    ratingsPosition?: string;
    showRibbon?: boolean;
    ribbonMode?: "single" | "tiered" | "auto_stack" | string;
    ribbonPosition?: string;
    ribbonTheme?: string;
    ribbonText?: string;
    ribbonType?: string;
    dovetailResolutionHdr?: boolean;
    tieredRibbons?: any[];
    maxRibbonTiers?: number;
    theme?: string;
    badgeStyle?: string;
    showResolution?: boolean;
    showHdr?: boolean;
    showAudio?: boolean;
    showAudioChannels?: boolean;
    showCodec?: boolean;
    showEdition?: boolean;
    showStudio?: boolean;
    showContentRating?: boolean;
    showRatings?: boolean;
    showLeavingSoon?: boolean;
    badgeScale?: number;
    categoryScales?: string | Record<string, number>;
    customBadgeIds?: string[];
    layerPriorityOrder?: string[] | string | any;
    enabled?: boolean;
}) {
    try {

        await verifyAdmin();
        let serializedLayerOrder: string | null = null;
        if (data.layerPriorityOrder || data.ribbonMode || data.tieredRibbons || data.dovetailResolutionHdr !== undefined) {
            const rawOrder = Array.isArray(data.layerPriorityOrder) 
                ? data.layerPriorityOrder 
                : (typeof data.layerPriorityOrder === "object" && data.layerPriorityOrder?.order) 
                    ? data.layerPriorityOrder.order 
                    : (typeof data.layerPriorityOrder === "object" && data.layerPriorityOrder?.layerOrder)
                        ? data.layerPriorityOrder.layerOrder
                        : typeof data.layerPriorityOrder === "string" 
                            ? JSON.parse(data.layerPriorityOrder) 
                            : undefined;
            
            serializedLayerOrder = JSON.stringify({
                order: rawOrder,
                layerOrder: rawOrder,
                ribbonMode: data.ribbonMode || "single",
                tieredRibbons: data.tieredRibbons || null,
                maxRibbonTiers: data.maxRibbonTiers || 3,
                dovetailResolutionHdr: data.dovetailResolutionHdr ?? true
            });
        }

        const generatedName = (data.name && data.name.trim())
            ? data.name.trim()
            : (data.sectionKey ? `Section #${data.sectionKey} Overlay Rule` : `Server ${data.serverId} Overlay Rule`);

        const serializedCategoryScales = typeof data.categoryScales === "object" && data.categoryScales !== null
            ? JSON.stringify(data.categoryScales)
            : typeof data.categoryScales === "string"
                ? data.categoryScales
                : null;

        const ruleData = {
            name: generatedName,
            serverId: data.serverId || null,
            sectionKey: data.sectionKey ? String(data.sectionKey) : null,
            overlayType: data.overlayType || "combined",
            position: data.position || "top-right",
            videoPosition: data.videoPosition || data.position || "top-right",
            audioPosition: data.audioPosition || "top-left",
            editionPosition: data.editionPosition || "top-left",
            ratingPosition: data.ratingPosition || "bottom-left",
            resolutionPosition: data.resolutionPosition || data.videoPosition || data.position || "top-right",
            hdrPosition: data.hdrPosition || data.videoPosition || data.position || "top-right",
            codecPosition: data.codecPosition || data.videoPosition || data.position || "top-right",
            channelsPosition: data.channelsPosition || data.audioPosition || "top-left",
            studioPosition: data.studioPosition || "bottom-left",
            contentRatingPosition: data.contentRatingPosition || data.ratingPosition || "bottom-left",
            ratingsPosition: data.ratingsPosition || data.ratingPosition || "bottom-right",
            showRibbon: data.showRibbon ?? false,
            ribbonPosition: data.ribbonPosition || "bottom-right",
            ribbonTheme: data.ribbonTheme || "gold",
            ribbonText: data.ribbonText || null,
            ribbonType: data.ribbonType || "auto_quality",
            theme: data.theme || "glass",
            badgeStyle: data.badgeStyle || "pill",
            showResolution: data.showResolution ?? true,
            showHdr: data.showHdr ?? true,
            showAudio: data.showAudio ?? true,
            showAudioChannels: data.showAudioChannels ?? false,
            showCodec: data.showCodec ?? false,
            showEdition: data.showEdition ?? false,
            showStudio: data.showStudio ?? false,
            showContentRating: data.showContentRating ?? false,
            showRatings: data.showRatings ?? false,
            showLeavingSoon: data.showLeavingSoon ?? true,
            badgeScale: data.badgeScale ?? 1.0,
            categoryScales: serializedCategoryScales,
            customBadgeIds: data.customBadgeIds ? JSON.stringify(data.customBadgeIds) : null,
            layerPriorityOrder: serializedLayerOrder,
            enabled: data.enabled ?? true
        };

        let rule;
        if (data.id) {
            rule = await prisma.mediaOverlayRule.update({
                where: { id: data.id },
                data: ruleData
            });
        } else {
            let existingRule = null;
            if (data.serverId && data.sectionKey) {
                existingRule = await prisma.mediaOverlayRule.findFirst({
                    where: {
                        serverId: data.serverId,
                        sectionKey: String(data.sectionKey)
                    }
                });
            }
            if (!existingRule && data.serverId) {
                existingRule = await prisma.mediaOverlayRule.findFirst({
                    where: {
                        serverId: data.serverId
                    }
                });
            }
            if (!existingRule) {
                existingRule = await prisma.mediaOverlayRule.findFirst({
                    orderBy: { updatedAt: "desc" }
                });
            }

            if (existingRule) {
                rule = await prisma.mediaOverlayRule.update({
                    where: { id: existingRule.id },
                    data: ruleData
                });
            } else {
                rule = await prisma.mediaOverlayRule.create({
                    data: ruleData
                });
            }
        }

        return { success: true, rule, message: `Overlay rule "${generatedName}" saved.` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Loads the active overlay rules and custom badges from the database to create a complete OverlayOptions object,
 * ensuring all badges (4K, HDR, DV, Atmos, audio codecs, ribbons, custom badges) are preserved when adding Leaving Soon banners.
 */
export async function getActiveOverlayOptionsHelper(
    serverId?: string,
    sectionKey?: string,
    overrides: Partial<OverlayOptions> = {}
): Promise<OverlayOptions> {
    const activeCustomBadges = await prisma.customBadge.findMany({
        where: { enabled: true }
    }).catch(() => []);

    const rule = await prisma.mediaOverlayRule.findFirst({
        where: {
            enabled: true,
            ...(serverId ? { serverId } : {}),
            ...(sectionKey ? { sectionKey: String(sectionKey) } : {})
        }
    }) || (serverId ? await prisma.mediaOverlayRule.findFirst({ where: { enabled: true, serverId } }) : null)
       || await prisma.mediaOverlayRule.findFirst({ where: { enabled: true }, orderBy: { updatedAt: "desc" } });

    let ruleRibbonMode: "single" | "tiered" | "auto_stack" | "waterfall" = "waterfall";
    let ruleTieredRibbons: any[] | undefined;
    let ruleMaxRibbonTiers = 3;
    let ruleDovetail = true;

    if (rule?.layerPriorityOrder) {
        try {
            const parsed = JSON.parse(rule.layerPriorityOrder);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                if (parsed.ribbonMode) ruleRibbonMode = parsed.ribbonMode;
                if (parsed.tieredRibbons) ruleTieredRibbons = parsed.tieredRibbons;
                if (parsed.maxRibbonTiers) ruleMaxRibbonTiers = parsed.maxRibbonTiers;
                if (parsed.dovetailResolutionHdr !== undefined) ruleDovetail = parsed.dovetailResolutionHdr;
            }
        } catch (e) {}
    }

    let ruleCategoryScales: Record<string, number> | undefined;
    if ((rule as any)?.categoryScales) {
        try {
            ruleCategoryScales = typeof (rule as any).categoryScales === "string" ? JSON.parse((rule as any).categoryScales) : (rule as any).categoryScales;
        } catch (e) {}
    }

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);

    const defaultRibbons = [
        { id: "tier-1", type: "imdb_top_250", text: "IMDb TOP 250", theme: "gold", enabled: true },
        { id: "tier-2", type: "certified_fresh", text: "CERTIFIED FRESH", theme: "crimson", enabled: true },
        { id: "tier-3", type: "auto_quality", text: "4K UHD", theme: "purple", enabled: true },
        { id: "tier-4", type: "auto_edition", text: "SPECIAL EDITION", theme: "cyan", enabled: true }
    ];

    const baseOptions: OverlayOptions = {
        showResolution: rule?.showResolution ?? true,
        showHdr: rule?.showHdr ?? true,
        showAudio: rule?.showAudio ?? true,
        showAudioChannels: rule?.showAudioChannels ?? false,
        showCodec: rule?.showCodec ?? false,
        showEdition: rule?.showEdition ?? false,
        showStudio: rule?.showStudio ?? false,
        showContentRating: rule?.showContentRating ?? true,
        showRatings: rule?.showRatings ?? false,
        showLeavingSoon: rule?.showLeavingSoon ?? true,
        position: (rule?.position as any) || "top-right",
        videoPosition: (rule?.videoPosition as any) || (rule?.position as any) || "top-right",
        audioPosition: (rule?.audioPosition as any) || "top-left",
        editionPosition: (rule?.editionPosition as any) || "top-left",
        ratingPosition: (rule?.ratingPosition as any) || "bottom-left",
        resolutionPosition: (rule?.resolutionPosition as any) || (rule?.videoPosition as any) || (rule?.position as any) || "top-right",
        hdrPosition: (rule?.hdrPosition as any) || (rule?.videoPosition as any) || (rule?.position as any) || "top-right",
        codecPosition: (rule?.codecPosition as any) || (rule?.videoPosition as any) || (rule?.position as any) || "top-right",
        channelsPosition: (rule?.channelsPosition as any) || (rule?.audioPosition as any) || "top-left",
        studioPosition: (rule?.studioPosition as any) || "bottom-left",
        contentRatingPosition: (rule?.contentRatingPosition as any) || (rule?.ratingPosition as any) || "bottom-left",
        ratingsPosition: (rule?.ratingsPosition as any) || (rule?.ratingPosition as any) || "bottom-right",
        showRibbon: rule?.showRibbon ?? true,
        ribbonMode: ruleRibbonMode,
        tieredRibbons: ruleTieredRibbons || defaultRibbons,
        maxRibbonTiers: ruleMaxRibbonTiers,
        ribbonPosition: (rule?.ribbonPosition as any) || "bottom-right",
        ribbonTheme: (rule?.ribbonTheme as any) || "gold",
        ribbonText: rule?.ribbonText || undefined,
        ribbonType: (rule?.ribbonType as any) || "auto_quality",
        theme: (rule?.theme as any) || "glass",
        dovetailResolutionHdr: ruleDovetail,
        badgeScale: (rule?.badgeScale as number) || 1.0,
        categoryScales: ruleCategoryScales,
        customBadges: activeCustomBadges.map(cb => ({
            id: cb.id,
            name: cb.name,
            category: cb.category,
            matchRule: cb.matchRule,
            filePath: cb.filePath,
            position: cb.position,
            width: cb.width,
            height: cb.height,
            opacity: cb.opacity
        })),
        placeholderPosition: settings?.pruneBannerPosition || "bottom",
        placeholderTheme: settings?.pruneBannerTheme || "crimson-red",
        placeholderText: settings?.pruneBannerText || "LEAVING ON {date}",
        bannerFontSize: settings?.pruneBannerFontSize ?? 44,
        placeholderFontSize: settings?.pruneBannerFontSize ?? 44
    };

    return { ...baseOptions, ...overrides };
}

export async function applyOverlaysToLibraryInternal(
    serverId: string, 
    sectionKey: string, 
    ruleId?: string,
    batchOptions?: {
        batchSize?: number;
        mode?: "incremental" | "daily_recheck" | "weekly_recheck" | "monthly_recheck" | "force_all";
    }
) {
    try {
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;

        // Fetch active custom badges
        const activeCustomBadges = await prisma.customBadge.findMany({
            where: { enabled: true }
        });

        const rule = ruleId
            ? await prisma.mediaOverlayRule.findUnique({ where: { id: ruleId } })
            : await prisma.mediaOverlayRule.findFirst({
                where: {
                    serverId,
                    sectionKey: String(sectionKey)
                }
            }) || await prisma.mediaOverlayRule.findFirst({
                where: {
                    serverId
                }
            }) || await prisma.mediaOverlayRule.findFirst({
                orderBy: { updatedAt: "desc" }
            });

        // Fetch rule options
        let overlayOpts: OverlayOptions;

        if (rule) {
            let ruleRibbonMode: "single" | "tiered" | "auto_stack" | "waterfall" = "waterfall";
            let ruleTieredRibbons: any[] | undefined;
            let ruleMaxRibbonTiers = 3;
            let ruleDovetail = true;

            if (rule.layerPriorityOrder) {
                try {
                    const parsed = JSON.parse(rule.layerPriorityOrder);
                    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                        if (parsed.ribbonMode) ruleRibbonMode = parsed.ribbonMode;
                        if (parsed.tieredRibbons) ruleTieredRibbons = parsed.tieredRibbons;
                        if (parsed.maxRibbonTiers) ruleMaxRibbonTiers = parsed.maxRibbonTiers;
                        if (parsed.dovetailResolutionHdr !== undefined) ruleDovetail = parsed.dovetailResolutionHdr;
                    }
                } catch (e) {}
            }

            let ruleCategoryScales: Record<string, number> | undefined;
            if ((rule as any).categoryScales) {
                try {
                    ruleCategoryScales = typeof (rule as any).categoryScales === "string" ? JSON.parse((rule as any).categoryScales) : (rule as any).categoryScales;
                } catch (e) {}
            }

            overlayOpts = {
                showResolution: rule.showResolution,
                showHdr: rule.showHdr,
                showAudio: rule.showAudio,
                showAudioChannels: rule.showAudioChannels,
                showCodec: rule.showCodec,
                showEdition: rule.showEdition,
                showStudio: rule.showStudio,
                showContentRating: rule.showContentRating,
                showRatings: rule.showRatings,
                showLeavingSoon: rule.showLeavingSoon,
                position: (rule.position as any) || "top-right",
                videoPosition: (rule.videoPosition as any) || (rule.position as any) || "top-right",
                audioPosition: (rule.audioPosition as any) || "top-left",
                editionPosition: (rule.editionPosition as any) || "top-left",
                ratingPosition: (rule.ratingPosition as any) || "bottom-left",
                resolutionPosition: (rule.resolutionPosition as any) || (rule.videoPosition as any) || (rule.position as any) || "top-right",
                hdrPosition: (rule.hdrPosition as any) || (rule.videoPosition as any) || (rule.position as any) || "top-right",
                codecPosition: (rule.codecPosition as any) || (rule.videoPosition as any) || (rule.position as any) || "top-right",
                channelsPosition: (rule.channelsPosition as any) || (rule.audioPosition as any) || "top-left",
                studioPosition: (rule.studioPosition as any) || "bottom-left",
                contentRatingPosition: (rule.contentRatingPosition as any) || (rule.ratingPosition as any) || "bottom-left",
                ratingsPosition: (rule.ratingsPosition as any) || (rule.ratingPosition as any) || "bottom-right",
                showRibbon: rule.showRibbon ?? true,
                ribbonMode: ruleRibbonMode,
                tieredRibbons: ruleTieredRibbons || [
                    { id: "tier-1", type: "imdb_top_250", text: "IMDb TOP 250", theme: "gold", enabled: true },
                    { id: "tier-2", type: "certified_fresh", text: "CERTIFIED FRESH", theme: "crimson", enabled: true },
                    { id: "tier-3", type: "auto_quality", text: "4K UHD", theme: "purple", enabled: true },
                    { id: "tier-4", type: "auto_edition", text: "SPECIAL EDITION", theme: "cyan", enabled: true }
                ],
                maxRibbonTiers: ruleMaxRibbonTiers,
                ribbonPosition: (rule.ribbonPosition as any) || "bottom-right",
                ribbonTheme: (rule.ribbonTheme as any) || "gold",
                ribbonText: rule.ribbonText || undefined,
                ribbonType: (rule.ribbonType as any) || "auto_quality",
                theme: (rule.theme as any) || "glass",
                dovetailResolutionHdr: ruleDovetail,
                badgeScale: (rule.badgeScale as number) || 1.0,
                categoryScales: ruleCategoryScales,
                customBadges: activeCustomBadges.map(cb => ({
                    id: cb.id,
                    name: cb.name,
                    category: cb.category,
                    matchRule: cb.matchRule,
                    filePath: cb.filePath,
                    position: cb.position,
                    width: cb.width,
                    height: cb.height,
                    opacity: cb.opacity
                }))
            };
        } else {
            overlayOpts = {
                showResolution: true,
                showHdr: true,
                showAudio: true,
                showAudioChannels: false,
                showCodec: false,
                showEdition: false,
                showStudio: false,
                showContentRating: true,
                showRatings: false,
                showLeavingSoon: false,
                position: "top-right",
                resolutionPosition: "top-right",
                hdrPosition: "top-right",
                codecPosition: "top-right",
                audioPosition: "top-left",
                channelsPosition: "top-left",
                editionPosition: "top-left",
                studioPosition: "bottom-left",
                contentRatingPosition: "bottom-left",
                ratingsPosition: "bottom-right",
                showRibbon: true,
                ribbonMode: "waterfall",
                ribbonPosition: "bottom-right",
                ribbonTheme: "gold",
                ribbonType: "auto_quality",
                tieredRibbons: [
                    { id: "tier-1", type: "imdb_top_250", text: "IMDb TOP 250", theme: "gold", enabled: true },
                    { id: "tier-2", type: "certified_fresh", text: "CERTIFIED FRESH", theme: "crimson", enabled: true },
                    { id: "tier-3", type: "auto_quality", text: "4K UHD", theme: "purple", enabled: true },
                    { id: "tier-4", type: "auto_edition", text: "SPECIAL EDITION", theme: "cyan", enabled: true }
                ],
                theme: "glass",
                dovetailResolutionHdr: true,
                badgeScale: 1.0,
                customBadges: activeCustomBadges.map(cb => ({
                    id: cb.id,
                    name: cb.name,
                    category: cb.category,
                    matchRule: cb.matchRule,
                    filePath: cb.filePath,
                    position: cb.position,
                    width: cb.width,
                    height: cb.height,
                    opacity: cb.opacity
                }))
            };
        }

        // Fetch library media items across the whole library section
        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];
        const items = await getPlexLibraryMediaItems(urlsToTry, token, sectionKey, 2500);

        // Map leaving soon flags from content advisories
        const leavingSoonAdvisories = await prisma.mediaContentAdvisory.findMany({
            where: {
                serverId,
                isLeavingSoon: true
            }
        }).catch(() => []);
        const leavingSoonKeys = new Set(leavingSoonAdvisories.map(a => String(a.ratingKey)));

        // Retrieve existing artwork backups for this server to track applied hashes and timestamps
        const existingBackups = await prisma.mediaArtBackup.findMany({
            where: { serverId }
        }).catch(() => []);
        const backupMap = new Map(existingBackups.map(b => [String(b.ratingKey), b]));

        const batchSize = Math.max(10, Math.min(batchOptions?.batchSize || 200, 500));
        const mode = batchOptions?.mode || "incremental";

        // Categorize items
        interface CandidateItem {
            item: PlexMediaStreamInfo;
            isNew: boolean;
            isUpgrade: boolean;
            reason: string;
            priority: number;
        }

        const candidatesNeedingUpdate: CandidateItem[] = [];
        let alreadyUpToDateCount = 0;

        for (const it of items) {
            if (leavingSoonKeys.has(String(it.ratingKey))) {
                it.isLeavingSoon = true;
            }

            const hasOverlayOpportunity = Boolean(
                it.detectedBadges?.resolution ||
                it.detectedBadges?.hdr ||
                it.detectedBadges?.audio ||
                it.detectedBadges?.edition ||
                it.detectedBadges?.studio ||
                it.detectedBadges?.contentRating ||
                overlayOpts.showRibbon ||
                it.isLeavingSoon ||
                activeCustomBadges.length > 0
            );

            if (!hasOverlayOpportunity) {
                continue;
            }

            const currentHash = computeMediaOverlayHash(it, overlayOpts);
            const backup = backupMap.get(String(it.ratingKey));

            let needsUpdate = false;
            let reason = "";
            let priority = 3; // 1 = upgrade (e.g. 480p->1080p), 2 = new item, 3 = recheck

            if (!backup) {
                needsUpdate = true;
                reason = "new_item";
                priority = 2;
            } else if (backup.mediaHash && backup.mediaHash !== currentHash) {
                // Media attributes changed (e.g. upgraded resolution, HDR added, audio improved)
                needsUpdate = true;
                reason = "media_upgraded";
                priority = 1;
            } else if (!backup.mediaHash) {
                // Legacy backup without hash tracking
                needsUpdate = true;
                reason = "initial_hash_sync";
                priority = 2;
            } else if (mode === "force_all") {
                needsUpdate = true;
                reason = "force_recheck";
                priority = 3;
            } else if (mode === "daily_recheck") {
                const ageMs = Date.now() - new Date(backup.updatedAt).getTime();
                if (ageMs > 24 * 60 * 60 * 1000) {
                    needsUpdate = true;
                    reason = "daily_recheck";
                    priority = 3;
                }
            } else if (mode === "weekly_recheck") {
                const ageMs = Date.now() - new Date(backup.updatedAt).getTime();
                if (ageMs > 7 * 24 * 60 * 60 * 1000) {
                    needsUpdate = true;
                    reason = "weekly_recheck";
                    priority = 3;
                }
            } else if (mode === "monthly_recheck") {
                const ageMs = Date.now() - new Date(backup.updatedAt).getTime();
                if (ageMs > 30 * 24 * 60 * 60 * 1000) {
                    needsUpdate = true;
                    reason = "monthly_recheck";
                    priority = 3;
                }
            }

            if (needsUpdate) {
                candidatesNeedingUpdate.push({
                    item: it,
                    isNew: !backup,
                    isUpgrade: Boolean(backup && backup.mediaHash && backup.mediaHash !== currentHash),
                    reason,
                    priority
                });
            } else {
                alreadyUpToDateCount++;
            }
        }

        // Sort candidates: Media Upgrades first (highest priority), then New Items, then Recheck items
        candidatesNeedingUpdate.sort((a, b) => a.priority - b.priority);

        // Take only up to batchSize items for this batch execution
        const batchToProcess = candidatesNeedingUpdate.slice(0, batchSize);
        const remainingInQueue = Math.max(0, candidatesNeedingUpdate.length - batchToProcess.length);

        let successCount = 0;
        let newBadgedCount = 0;
        let upgradedCount = 0;

        for (const candidate of batchToProcess) {
            const it = candidate.item;
            const res = await backupAndApplyOverlay(serverUrl, token, serverId, it, overlayOpts, true);
            if (res.success) {
                successCount++;
                if (res.upgraded || candidate.isUpgrade) {
                    upgradedCount++;
                } else {
                    newBadgedCount++;
                }
            }
        }

        if (ruleId) {
            await prisma.mediaOverlayRule.update({
                where: { id: ruleId },
                data: {
                    itemCount: (alreadyUpToDateCount + successCount),
                    lastAppliedAt: new Date()
                }
            }).catch(() => {});
        }

        const modeLabel = mode === "incremental" 
            ? "Hourly Incremental" 
            : mode === "daily_recheck" 
                ? "Daily Recheck" 
                : mode === "weekly_recheck" 
                    ? "Weekly Recheck" 
                    : mode === "monthly_recheck"
                        ? "Monthly Recheck"
                        : "Full Library Recheck";

        const message = `[${modeLabel}] Updated ${successCount} item(s) (${newBadgedCount} new, ${upgradedCount} upgraded/swapped). ${alreadyUpToDateCount} items already up to date.${remainingInQueue > 0 ? ` ${remainingInQueue} remaining to process in next batch run.` : ""}`;

        logger.addLog("INFO", "CURATION", message);

        return {
            success: true,
            appliedCount: successCount,
            newBadgedCount,
            upgradedCount,
            skippedCount: alreadyUpToDateCount,
            totalEvaluated: items.length,
            remainingInQueue,
            batchSize,
            mode,
            message
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function applyOverlaysToLibraryAction(
    serverId: string, 
    sectionKey: string, 
    ruleId?: string,
    batchOptions?: {
        batchSize?: number;
        mode?: "incremental" | "daily_recheck" | "weekly_recheck" | "monthly_recheck" | "force_all";
    }
) {
    try {
        await verifyAdmin();
        return await applyOverlaysToLibraryInternal(serverId, sectionKey, ruleId, batchOptions);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Apply overlays failed: ${e.message}`);
        return { success: false, error: e.message || "Apply overlays failed" } as any;
    }
}

export async function revertLibraryOverlaysAction(serverId: string) {
    try {

        await verifyAdmin();
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: `Plex server "${serverId}" unreachable or token not configured.` };

        const result = await restoreAllOriginalArtworks(resolved.serverUrl, resolved.token, resolved.serverId);
        return result;
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getLeavingSoonItemsAction(serverId?: string) {
    try {

        await verifyAdmin();
        const items = await prisma.mediaContentAdvisory.findMany({
            where: {
                isLeavingSoon: true,
                ...(serverId ? { serverId } : {})
            },
            orderBy: { leavingSoonDate: "asc" }
        });
        return { success: true, items };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function markItemLeavingSoonAction(data: {
    ratingKey: string;
    serverId: string;
    title: string;
    daysRemaining?: number;
    deleteDate?: string;
    reason?: string;
}) {
    try {

        await verifyAdmin();
        const effectiveDate = data.deleteDate
            ? new Date(data.deleteDate)
            : new Date(Date.now() + (data.daysRemaining || 7) * 24 * 60 * 60 * 1000);

        const advisory = await prisma.mediaContentAdvisory.upsert({
            where: {
                ratingKey_serverId: {
                    ratingKey: data.ratingKey,
                    serverId: data.serverId
                }
            },
            update: {
                title: data.title,
                isLeavingSoon: true,
                leavingSoonDate: effectiveDate,
                leavingReason: data.reason || "Manual storage prune selection"
            },
            create: {
                ratingKey: data.ratingKey,
                serverId: data.serverId,
                title: data.title,
                isLeavingSoon: true,
                leavingSoonDate: effectiveDate,
                leavingReason: data.reason || "Manual storage prune selection"
            }
        });

        // Apply countdown banner overlay directly to Plex poster
        try {
            const resolved = await resolveWorkingPlexServerConnection(data.serverId);
            if (resolved?.serverUrl && resolved?.token) {
                const settings = await prisma.settings.findFirst({ where: { id: "global" } });
                const matched = await getPlexSingleItemMetadata(resolved.serverUrl, resolved.token, data.ratingKey);
                if (matched) {
                    matched.isLeavingSoon = true;
                    const daysLeft = data.daysRemaining || Math.max(1, Math.ceil((effectiveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                    const effectiveDateStr = effectiveDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                    const bannerText = settings?.pruneBannerText || "LEAVING ON {date}";
                    const bannerTheme = settings?.pruneBannerTheme || "crimson-red";
                    const bannerPosition = settings?.pruneBannerPosition || "bottom";

                    const overlayOpts = await getActiveOverlayOptionsHelper(data.serverId, matched.librarySectionID ? String(matched.librarySectionID) : undefined, {
                        showLeavingSoon: true,
                        leavingSoonDays: daysLeft,
                        digitalReleaseDate: effectiveDateStr,
                        placeholderText: bannerText,
                        placeholderTheme: bannerTheme,
                        placeholderPosition: bannerPosition
                    });

                    await backupAndApplyOverlay(
                        resolved.serverUrl,
                        resolved.token,
                        data.serverId,
                        matched,
                        overlayOpts,
                        true
                    );
                }
            }
        } catch (overlayErr: any) {
            console.warn(`[LEAVING-SOON] Failed applying overlay for manual flagged item ${data.ratingKey}:`, overlayErr.message);
        }

        // Sync Leaving Soon collection & home hub
        await syncLeavingSoonCollectionHubInternal(data.serverId).catch(() => {});

        return { success: true, advisory, message: `Flagged "${data.title}" as leaving soon and applied banner overlay!` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function unmarkItemLeavingSoonAction(ratingKey: string, serverId: string) {
    try {

        await verifyAdmin();
        await prisma.mediaContentAdvisory.updateMany({
            where: { ratingKey, serverId },
            data: {
                isLeavingSoon: false,
                leavingSoonDate: null,
                leavingReason: null
            }
        });

        // Revert poster art if backed up
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (resolved?.serverUrl) {
            await restoreItemOriginalArtwork(resolved.serverUrl, resolved.token, resolved.serverId, ratingKey).catch(() => {});
        }

        // Sync Leaving Soon collection & home hub
        await syncLeavingSoonCollectionHubInternal(serverId).catch(() => {});

        return { success: true, message: "Removed leaving soon flag." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getUserContentPreferencesAction(targetUserId?: string) {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    const userId = targetUserId && currentUser.role === "ADMIN" ? targetUserId : currentUser.id;

    try {
        const preference = await prisma.userContentPreference.findUnique({
            where: { userId }
        });

        return {
            success: true,
            preference: preference || {
                excludedGenres: [],
                excludedTags: [],
                maxContentRating: "ALL",
                hideLeavingSoon: false,
                hideHorror: false,
                hideNsfw: false,
                hideGore: false
            }
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function saveUserContentPreferencesAction(preferences: {
    excludedGenres?: string[];
    excludedTags?: string[];
    maxContentRating?: string;
    hideLeavingSoon?: boolean;
    hideHorror?: boolean;
    hideNsfw?: boolean;
    hideGore?: boolean;
}, targetUserId?: string) {
    const currentUser = await getCurrentUser();
    if (!currentUser) throw new Error("Unauthorized");

    const userId = targetUserId && currentUser.role === "ADMIN" ? targetUserId : currentUser.id;

    try {
        const updated = await prisma.userContentPreference.upsert({
            where: { userId },
            update: {
                excludedGenres: JSON.stringify(preferences.excludedGenres || []),
                excludedTags: JSON.stringify(preferences.excludedTags || []),
                maxContentRating: preferences.maxContentRating || "ALL",
                hideLeavingSoon: preferences.hideLeavingSoon ?? false,
                hideHorror: preferences.hideHorror ?? false,
                hideNsfw: preferences.hideNsfw ?? false,
                hideGore: preferences.hideGore ?? false
            },
            create: {
                userId,
                excludedGenres: JSON.stringify(preferences.excludedGenres || []),
                excludedTags: JSON.stringify(preferences.excludedTags || []),
                maxContentRating: preferences.maxContentRating || "ALL",
                hideLeavingSoon: preferences.hideLeavingSoon ?? false,
                hideHorror: preferences.hideHorror ?? false,
                hideNsfw: preferences.hideNsfw ?? false,
                hideGore: preferences.hideGore ?? false
            }
        });

        return { success: true, preference: updated, message: "Personal content filters updated successfully." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function testCurationApiKeysAction(tmdbKey?: string, traktKey?: string, mdblistKey?: string) {
    try {
        await verifyAdmin();
        const results: { tmdb?: boolean; trakt?: boolean; mdblist?: boolean; errors: string[] } = { errors: [] };

    if (tmdbKey) {
        try {
            const res = await fetch(`https://api.themoviedb.org/3/authentication?api_key=${tmdbKey}`);
            results.tmdb = res.ok;
            if (!res.ok) results.errors.push(`TMDb API error: HTTP ${res.status}`);
        } catch (e: any) {
            results.errors.push(`TMDb network error: ${e.message}`);
        }
    }

    if (traktKey) {
        try {
            const res = await fetch("https://api.trakt.tv/movies/trending?limit=1", {
                headers: { "Content-Type": "application/json", "trakt-api-version": "2", "trakt-api-key": traktKey }
            });
            results.trakt = res.ok;
            if (!res.ok) results.errors.push(`Trakt API error: HTTP ${res.status}`);
        } catch (e: any) {
            results.errors.push(`Trakt network error: ${e.message}`);
        }
    }

    if (mdblistKey) {
        try {
            const res = await fetch(`https://mdblist.com/api/?apikey=${mdblistKey}&i=tt0111161`);
            results.mdblist = res.ok;
            if (!res.ok) results.errors.push(`MDBList API error: HTTP ${res.status}`);
        } catch (e: any) {
            results.errors.push(`MDBList network error: ${e.message}`);
        }
    }

    return {
        success: results.errors.length === 0,
        results
    };
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Test API keys failed: ${e.message}`);
        return { success: false, results: { errors: [e.message || "Failed testing API keys."] } };
    }
}

export async function getGlancesDisksAction() {
    try {

        await verifyAdmin();
        const instances = await prisma.glancesInstance.findMany({ orderBy: { createdAt: "asc" } });
        if (!instances || instances.length === 0) {
            return { success: true, disks: [], instances: [] };
        }

        const allDisks: Array<{
            id: string;
            instanceId: string;
            instanceName: string;
            mntPoint: string;
            deviceName: string;
            fsType: string;
            sizeBytes: number;
            usedBytes: number;
            freeBytes: number;
            totalGb: number;
            usedGb: number;
            freeGb: number;
            percent: number;
            isOnline: boolean;
        }> = [];

        for (const inst of instances) {
            let clean = (inst.url?.trim() || "").replace(/\/+$/, "");
            if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
                clean = `http://${clean}`;
            }
            const baseGlances = clean.replace(/\/api(\/v?[234])?$/, "");

            const fetchGlancesMetric = async (endpoint: string) => {
                const versions = [4, 3, 2];
                for (const v of versions) {
                    try {
                        const url = `${baseGlances}/api/${v}/${endpoint}`;
                        const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
                        if (res.ok) return await res.json();
                    } catch (e) {}
                }
                try {
                    const url = `${baseGlances}/${endpoint}`;
                    const res = await fetch(url, { signal: AbortSignal.timeout(3000), cache: "no-store" });
                    if (res.ok) return await res.json();
                } catch (e) {}
                return null;
            };

            try {
                const fsData = await fetchGlancesMetric("fs");
                if (Array.isArray(fsData)) {
                    for (const disk of fsData) {
                        const mntPoint = disk.mnt_point || disk.mountpoint || disk.dir_name || disk.name || "/";
                        const deviceName = disk.device_name || disk.device || disk.fs || "disk";
                        const fsType = disk.fs_type || disk.type || "fs";
                        const sizeBytes = Number(disk.size || disk.total || 0);
                        const usedBytes = Number(disk.used || 0);
                        const freeBytes = Number(disk.free || disk.avail || Math.max(0, sizeBytes - usedBytes));
                        const percent = typeof disk.percent === "number" ? Math.round(disk.percent) : (sizeBytes > 0 ? Math.round((usedBytes / sizeBytes) * 100) : 0);

                        const totalGb = parseFloat((sizeBytes / (1024 * 1024 * 1024)).toFixed(1));
                        const usedGb = parseFloat((usedBytes / (1024 * 1024 * 1024)).toFixed(1));
                        const freeGb = parseFloat((freeBytes / (1024 * 1024 * 1024)).toFixed(1));

                        allDisks.push({
                            id: `${inst.id}:${mntPoint}`,
                            instanceId: inst.id,
                            instanceName: inst.name,
                            mntPoint,
                            deviceName,
                            fsType,
                            sizeBytes,
                            usedBytes,
                            freeBytes,
                            totalGb,
                            usedGb,
                            freeGb,
                            percent,
                            isOnline: true
                        });
                    }
                }
            } catch (e) {}
        }

        return {
            success: true,
            disks: allDisks,
            instances: instances.map(i => ({ id: i.id, name: i.name, url: i.url }))
        };
    } catch (e: any) {
        return { success: false, error: e.message, disks: [], instances: [] };
    }
}

export async function recheckLeavingSoonWatchActivityAction(targetServerId?: string) {
    try {

        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        // Fetch all items currently flagged as leaving soon in DB
        const leavingSoonRecords = await prisma.mediaContentAdvisory.findMany({
            where: {
                isLeavingSoon: true,
                ...(targetServerId ? { serverId: targetServerId } : {})
            }
        });

        if (leavingSoonRecords.length === 0) {
            return {
                success: true,
                checkedCount: 0,
                unflaggedCount: 0,
                unflaggedItems: [],
                message: "No items currently flagged as Leaving Soon."
            };
        }

        const unflaggedItems: Array<{ ratingKey: string; title: string; reason: string; lastViewedAt?: string }> = [];

        // Group by serverId
        const byServer: Record<string, typeof leavingSoonRecords> = {};
        for (const rec of leavingSoonRecords) {
            const sId = rec.serverId || "default";
            if (!byServer[sId]) byServer[sId] = [];
            byServer[sId].push(rec);
        }

        for (const [sId, records] of Object.entries(byServer)) {
            const resolved = await resolveWorkingPlexServerConnection(sId);
            if (!resolved || !resolved.serverUrl || !resolved.token) continue;

            for (const rec of records) {
                try {
                    // Query Plex item metadata directly
                    const metaUrl = `${resolved.serverUrl}/library/metadata/${encodeURIComponent(rec.ratingKey)}?X-Plex-Token=${encodeURIComponent(resolved.token)}`;
                    const res = await fetch(metaUrl, {
                        headers: { "Accept": "application/json", "X-Plex-Token": resolved.token },
                        signal: AbortSignal.timeout(4000),
                        cache: "no-store"
                    });

                    if (res.ok) {
                        const data = await res.json();
                        const itemMeta = data.MediaContainer?.Metadata?.[0];
                        if (itemMeta) {
                            const currentViewCount = parseInt(itemMeta.viewCount || "0", 10);
                            const currentLastViewedAt = itemMeta.lastViewedAt ? parseInt(itemMeta.lastViewedAt, 10) * 1000 : null;
                            const flaggedAt = rec.updatedAt ? rec.updatedAt.getTime() : rec.createdAt.getTime();

                            // Item is watched if viewCount > 0 AND (lastViewedAt > flaggedAt - 1 day OR viewCount increased)
                            const isRecentlyWatched = currentLastViewedAt && (currentLastViewedAt >= (flaggedAt - 86400000));

                            if (isRecentlyWatched || currentViewCount > 0) {
                                // Unflag in database
                                await prisma.mediaContentAdvisory.update({
                                    where: { id: rec.id },
                                    data: {
                                        isLeavingSoon: false,
                                        leavingSoonDate: null,
                                        leavingReason: `Unflagged: Watched by user on ${currentLastViewedAt ? new Date(currentLastViewedAt).toLocaleDateString() : 'recently'}`
                                    }
                                });

                                // Restore original poster artwork
                                await restoreItemOriginalArtwork(resolved.serverUrl, resolved.token, sId, rec.ratingKey);

                                unflaggedItems.push({
                                    ratingKey: rec.ratingKey,
                                    title: rec.title || itemMeta.title || rec.ratingKey,
                                    reason: `Watched (${currentViewCount} plays, last on ${currentLastViewedAt ? new Date(currentLastViewedAt).toLocaleString() : 'recently'})`,
                                    lastViewedAt: currentLastViewedAt ? new Date(currentLastViewedAt).toISOString() : undefined
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.error(`Error checking watch status for ${rec.ratingKey}:`, e);
                }
            }
        }

        if (unflaggedItems.length > 0) {
            for (const sId of Object.keys(byServer)) {
                await syncLeavingSoonCollectionHubInternal(sId).catch(() => {});
            }
            logger.addLog("SUCCESS", "CURATION", `🎉 Unflagged ${unflaggedItems.length} items from Leaving Soon due to detected watch activity!`, unflaggedItems.map(i => `${i.title} (${i.reason})`).join(" • "));
        }

        return {
            success: true,
            checkedCount: leavingSoonRecords.length,
            unflaggedCount: unflaggedItems.length,
            unflaggedItems,
            message: unflaggedItems.length > 0
                ? `Successfully verified ${leavingSoonRecords.length} items: unflagged and restored ${unflaggedItems.length} watched ${unflaggedItems.length === 1 ? 'title' : 'titles'}!`
                : `Verified ${leavingSoonRecords.length} items: no new watch activity detected.`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getPrunePreviewAction(options?: {
    targetServerId?: string;
    targetSectionKey?: string;
    criteria?: {
        minAgeDays?: number;
        unwatchedOnly?: boolean;
        maxCandidates?: number;
        sortBy?: "combined_oldest" | "combined_activity" | "oldest_added" | "oldest_watched" | "largest_size" | "least_plays" | "oldest_modified";
    };
}) {
    try {

        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const enabledPruneServers: string[] = settings?.enabledServersForPruning 
            ? JSON.parse(settings.enabledServersForPruning) 
            : [];

        const targetServerId = options?.targetServerId;
        const targetSectionKey = options?.targetSectionKey;
        const criteria = options?.criteria;

        // If targetServerId specified, evaluate only that server; otherwise evaluate enabled servers or all servers
        const targetServers = targetServerId 
            ? servers.filter(s => s.clientIdentifier === targetServerId)
            : enabledPruneServers.length > 0
                ? servers.filter(s => enabledPruneServers.includes(s.clientIdentifier) || enabledPruneServers.some(k => k.startsWith(`${s.clientIdentifier}:`)))
                : servers;

        if (targetServers.length === 0) {
            return {
                success: false,
                error: "No eligible servers configured for pruning evaluation.",
                candidates: [],
                totalRecoverableGb: 0,
                evaluatedCount: 0
            };
        }

        const allCandidates: PruneCandidateItem[] = [];
        let totalRecoverable = 0;
        let totalEvaluated = 0;

        for (const s of targetServers) {
            const resolved = await resolveWorkingPlexServerConnection(s.clientIdentifier);
            if (!resolved || !resolved.serverUrl) continue;

            // Fetch sections for this server to filter by enabled status
            const srvSections = await getPlexServerSections(resolved.token, s.clientIdentifier);
            const eligibleSectionKeys: string[] = [];

            for (const sec of srvSections) {
                if (targetSectionKey) {
                    if (String(sec.key) === String(targetSectionKey)) {
                        eligibleSectionKeys.push(String(sec.key));
                    }
                } else {
                    const isSecEnabled = await isSectionEnabledInList(enabledPruneServers, s.clientIdentifier, String(sec.key));
                    if (isSecEnabled) {
                        eligibleSectionKeys.push(String(sec.key));
                    }
                }
            }

            if (eligibleSectionKeys.length === 0) continue;

            const res = await evaluatePruneCandidatesForServer(resolved.serverUrl, resolved.token, s.clientIdentifier, s.name, {
                minAgeDays: criteria?.minAgeDays ?? settings?.pruneMinAgeDays ?? 90,
                unwatchedOnly: criteria?.unwatchedOnly ?? settings?.pruneUnwatchedOnly ?? false,
                maxCandidates: criteria?.maxCandidates ?? 50,
                sortBy: criteria?.sortBy ?? "oldest_added",
                sectionKeys: eligibleSectionKeys
            });

            allCandidates.push(...res.candidates);
            totalRecoverable += res.totalRecoverableGb;
            totalEvaluated += res.evaluatedCount;
        }

        // Sort candidates
        const sortBy = criteria?.sortBy ?? "combined_oldest";
        if (sortBy === "combined_oldest" || (sortBy as any) === "combined_activity") {
            const nowMs = Date.now();
            allCandidates.sort((a, b) => {
                const getScore = (c: any) => {
                    const added = c.addedAt || nowMs;
                    const watched = c.lastViewedAt || (c.viewCount === 0 ? 0 : added);
                    const modified = c.updatedAt || added;
                    // Weighted composite activity: older added (35%), older/unwatched (45%), older modified (20%)
                    return (added * 0.35) + (watched * 0.45) + (modified * 0.20);
                };
                return getScore(a) - getScore(b);
            });
        } else if (sortBy === "oldest_watched") {
            allCandidates.sort((a, b) => {
                if (!a.lastViewedAt && !b.lastViewedAt) return (a.addedAt || 0) - (b.addedAt || 0);
                if (!a.lastViewedAt) return -1;
                if (!b.lastViewedAt) return 1;
                return a.lastViewedAt - b.lastViewedAt;
            });
        } else if (sortBy === "largest_size") {
            allCandidates.sort((a, b) => b.fileSizeGb - a.fileSizeGb);
        } else if (sortBy === "least_plays") {
            allCandidates.sort((a, b) => a.viewCount - b.viewCount || (a.addedAt || 0) - (b.addedAt || 0));
        } else if (sortBy === "oldest_modified") {
            allCandidates.sort((a, b) => (a.updatedAt || a.addedAt || 0) - (b.updatedAt || b.addedAt || 0));
        } else {
            allCandidates.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
        }

        return {
            success: true,
            isDryRun: true,
            masterDeletionEnabled: settings?.enableAutoPruneDeletion ?? false,
            pruneDryRun: settings?.pruneDryRun ?? true,
            candidates: allCandidates,
            totalRecoverableGb: parseFloat(totalRecoverable.toFixed(2)),
            evaluatedCount: totalEvaluated,
            serversEvaluated: targetServers.map(s => ({ id: s.clientIdentifier, name: s.name }))
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function runPruneSimulationAction(
    targetServerId?: string,
    criteria?: {
        minAgeDays?: number;
        unwatchedOnly?: boolean;
        maxCandidates?: number;
        sortBy?: "combined_oldest" | "oldest_added" | "oldest_watched" | "largest_size" | "least_plays" | "oldest_modified";
    },
    targetSectionKey?: string
) {
    return await getPrunePreviewAction({
        targetServerId,
        targetSectionKey,
        criteria
    });
}

export async function executePruneAction(
    items: { ratingKey: string; serverId: string; sectionKey?: string; title?: string }[],
    options: {
        forceLiveDelete?: boolean;
        applyOverlay?: boolean;
        tagCollection?: boolean;
        daysNotice?: number;
        reason?: string;
        bannerText?: string;
        bannerTheme?: string;
        bannerPosition?: string;
    } = {}
) {
    try {

        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const isMasterEnabled = settings?.enableAutoPruneDeletion ?? false;
        const isDryRun = options.forceLiveDelete ? false : (settings?.pruneDryRun ?? true);
        const shouldTagCollection = options.tagCollection ?? settings?.pruneTagCollection ?? true;
        const shouldApplyOverlay = options.applyOverlay ?? settings?.pruneApplyOverlays ?? true;
        const daysNotice = options.daysNotice ?? settings?.pruneDaysNotice ?? 14;
        const reason = options.reason || `Storage capacity optimization (${daysNotice}-day notice)`;
        const bannerText = options.bannerText || settings?.pruneBannerText || "LEAVING ON {date}";
        const bannerTheme = options.bannerTheme || settings?.pruneBannerTheme || "crimson-red";
        const bannerPosition = options.bannerPosition || settings?.pruneBannerPosition || "bottom";

        const enabledServersForOverlays: string[] = settings?.enabledServersForOverlays 
            ? JSON.parse(settings.enabledServersForOverlays) 
            : [];
        const enabledServersForCollections: string[] = settings?.enabledServersForCollections 
            ? JSON.parse(settings.enabledServersForCollections) 
            : [];

        const results: { ratingKey: string; title: string; serverName: string; action: string; success: boolean }[] = [];
        const affectedServerSections = new Map<string, Set<string>>();

        for (const it of items) {
            const resolved = await resolveWorkingPlexServerConnection(it.serverId);
            const serverUrl = resolved?.serverUrl || "";
            const serverName = resolved?.serverName || it.serverId;
            const serverToken = resolved?.token || token;

            if (it.serverId && it.sectionKey) {
                if (!affectedServerSections.has(it.serverId)) affectedServerSections.set(it.serverId, new Set());
                affectedServerSections.get(it.serverId)!.add(String(it.sectionKey));
            }

            // 1. If dry run or deletion not explicitly armed, flag as Leaving Soon and stage
            if (isDryRun || !isMasterEnabled) {
                const effectiveDate = new Date(Date.now() + daysNotice * 24 * 60 * 60 * 1000);

                await prisma.mediaContentAdvisory.upsert({
                    where: { ratingKey_serverId: { ratingKey: it.ratingKey, serverId: it.serverId } },
                    update: {
                        title: it.title || undefined,
                        isLeavingSoon: true,
                        leavingSoonDate: effectiveDate,
                        leavingReason: reason
                    },
                    create: {
                        ratingKey: it.ratingKey,
                        serverId: it.serverId,
                        title: it.title || "Media Item",
                        isLeavingSoon: true,
                        leavingSoonDate: effectiveDate,
                        leavingReason: reason
                    }
                });

                // Apply overlay preserving all active badges (4K, HDR, DV, Atmos, Audio, Custom Badges, etc.)
                const canApplyOverlay = it.sectionKey
                    ? await isSectionEnabledInList(enabledServersForOverlays, it.serverId, String(it.sectionKey))
                    : (enabledServersForOverlays.length === 0 || !enabledServersForOverlays.includes(`disabled:${it.serverId}`));
                if (shouldApplyOverlay && canApplyOverlay && serverUrl) {
                    const matched = await getPlexSingleItemMetadata(serverUrl, serverToken, it.ratingKey);
                    if (matched) {
                        matched.isLeavingSoon = true;
                        const effectiveDateStr = effectiveDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                        const overlayOpts = await getActiveOverlayOptionsHelper(it.serverId, it.sectionKey, {
                            showLeavingSoon: true,
                            leavingSoonDays: daysNotice,
                            digitalReleaseDate: effectiveDateStr,
                            placeholderText: bannerText,
                            placeholderTheme: bannerTheme,
                            placeholderPosition: bannerPosition
                        });

                        await backupAndApplyOverlay(
                            serverUrl,
                            serverToken,
                            it.serverId,
                            matched,
                            overlayOpts,
                            true
                        );
                    }
                }

                results.push({
                    ratingKey: it.ratingKey,
                    title: it.title || it.ratingKey,
                    serverName,
                    action: `Staged with ${daysNotice}-day Leaving Soon notice (Simulation / Safe Mode)`,
                    success: true
                });
            } else {
                // 2. LIVE DELETION MODE (Master Switch ON + Dry Run OFF / Explicit Force Delete)
                let deleted = false;

                if (serverUrl) {
                    const plexDelRes = await deleteMediaFromPlexServer(serverUrl, serverToken, it.ratingKey);
                    deleted = plexDelRes.success;
                }

                await prisma.mediaContentAdvisory.deleteMany({
                    where: { ratingKey: it.ratingKey, serverId: it.serverId }
                });

                results.push({
                    ratingKey: it.ratingKey,
                    title: it.title || it.ratingKey,
                    serverName,
                    action: deleted ? "Permanently deleted from disk & Plex library" : "Failed to delete from Plex",
                    success: deleted
                });
            }
        }

        // Sync Leaving Soon collection across all affected server sections
        if (shouldTagCollection) {
            for (const [sId, secKeys] of affectedServerSections.entries()) {
                for (const secKey of secKeys) {
                    const canTagColl = await isSectionEnabledInList(enabledServersForCollections, sId, String(secKey));
                    if (canTagColl) {
                        await syncLeavingSoonCollectionHubInternal(sId, secKey).catch(() => {});
                    }
                }
            }
        }

        return {
            success: true,
            isDryRun,
            isMasterEnabled,
            processedCount: results.length,
            results
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function clearAllLeavingSoonFlagsAction(serverId?: string) {
    try {

        await verifyAdmin();
        const whereClause = serverId ? { serverId } : {};

        // Find all leaving soon items to restore posters
        const advisories = await prisma.mediaContentAdvisory.findMany({
            where: { ...whereClause, isLeavingSoon: true }
        });

        // Group by serverId and restore posters on each specific server
        const byServer = new Map<string, string[]>();
        for (const adv of advisories) {
            if (adv.serverId && adv.ratingKey) {
                const list = byServer.get(adv.serverId) || [];
                list.push(adv.ratingKey);
                byServer.set(adv.serverId, list);
            }
        }

        for (const [srvId, rKeys] of byServer.entries()) {
            try {
                const resolved = await resolveWorkingPlexServerConnection(srvId);
                if (resolved?.serverUrl) {
                    for (const rKey of rKeys) {
                        await restoreItemOriginalArtwork(resolved.serverUrl, resolved.token, resolved.serverId, rKey).catch(() => {});
                    }
                }
            } catch (err) {}
        }

        await prisma.mediaContentAdvisory.updateMany({
            where: whereClause,
            data: {
                isLeavingSoon: false,
                leavingSoonDate: null,
                leavingReason: null
            }
        });

        return {
            success: true,
            clearedCount: advisories.length,
            message: `Cleared ${advisories.length} Leaving Soon flags and restored original poster artwork.`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function saveComingSoonSharesAction(shares: Record<string, string>) {
    try {

        await verifyAdmin();
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { comingSoonShares: JSON.stringify(shares) },
            create: { id: "global", comingSoonShares: JSON.stringify(shares) }
        });
        return { success: true, message: "Coming soon placeholder shares saved successfully." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function saveServerStorageConfigAction(storageConfig: Record<string, any>) {
    try {

        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        let existingConfig: Record<string, any> = {};
        if (settings?.serverStorageConfig) {
            try { existingConfig = JSON.parse(settings.serverStorageConfig); } catch (e) {}
        }
        const mergedConfig = { ...existingConfig, ...storageConfig };
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { serverStorageConfig: JSON.stringify(mergedConfig) },
            create: { id: "global", serverStorageConfig: JSON.stringify(mergedConfig) }
        });
        return { success: true, message: "Server storage mount paths saved successfully." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function saveSelectedGlancesDiskAction(diskId: string) {
    try {

        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        let currentStorageConfig: Record<string, any> = {};
        if (settings?.serverStorageConfig) {
            try {
                currentStorageConfig = JSON.parse(settings.serverStorageConfig);
            } catch (e) {}
        }
        currentStorageConfig.selectedGlancesDiskId = diskId;
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { serverStorageConfig: JSON.stringify(currentStorageConfig) },
            create: { id: "global", serverStorageConfig: JSON.stringify(currentStorageConfig) }
        });
        return { success: true, selectedGlancesDiskId: diskId, message: "Default Glances storage array saved successfully." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function validateDirectoryPathAction(pathStr: string) {
    try {
        await verifyAdmin();
        if (!pathStr || !pathStr.trim()) return { success: false, error: "Path is empty." };
        const cleanPath = pathStr.trim();
        if (!fs.existsSync(cleanPath)) {
            return { success: false, exists: false, error: `Directory "${cleanPath}" does not exist on disk.` };
        }
        const stat = fs.statSync(cleanPath);
        if (!stat.isDirectory()) {
            return { success: false, exists: true, isDirectory: false, error: `Path "${cleanPath}" exists but is a file, not a directory.` };
        }
        const entries = fs.readdirSync(cleanPath);
        return {
            success: true,
            exists: true,
            isDirectory: true,
            count: entries.length,
            message: `Directory validated (${entries.length} items found).`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Cannot access directory." };
    }
}

export async function getArtBackupAndBadgeStatsAction() {
    try {

        await verifyAdmin();
        const backupDir = path.join(process.cwd(), "data", "art_backups");
        const badgeDir = path.join(process.cwd(), "data", "custom_badges");

        let backupCount = 0;
        let backupBytes = 0;
        if (fs.existsSync(backupDir)) {
            const files = fs.readdirSync(backupDir);
            backupCount = files.length;
            for (const f of files) {
                try {
                    backupBytes += fs.statSync(path.join(backupDir, f)).size;
                } catch (e) {}
            }
        }

        let badgeCount = 0;
        let badgeBytes = 0;
        if (fs.existsSync(badgeDir)) {
            const files = fs.readdirSync(badgeDir);
            badgeCount = files.length;
            for (const f of files) {
                try {
                    badgeBytes += fs.statSync(path.join(badgeDir, f)).size;
                } catch (e) {}
            }
        }

        const customBadgesInDb = await prisma.customBadge.count();

        return {
            success: true,
            backupDir,
            backupCount,
            backupBytes,
            badgeDir,
            badgeCount: customBadgesInDb || badgeCount,
            badgeBytes
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Fetches recent items from a Plex library section with stream metadata for live simulation.
 * Applies Server Guard Rails policy to filter disallowed/inappropriate content for the target server.
 */
export async function getPlexRecentLibraryItemsAction(
    serverId: string, 
    sectionKey?: string, 
    limit = 50, 
    sort = "addedAt:desc",
    includeBlocked = false
) {
    try {

        await verifyAdmin();
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured.", items: [] };

        const secKey = sectionKey || "1";
        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
        let rawItems: PlexMediaStreamInfo[] = [];

        for (const url of urlsToTry) {
            try {
                rawItems = await getPlexLibraryMediaItems(url, resolved.token, secKey, limit, sort);
                if (rawItems.length > 0) break;
            } catch (e) {}
        }

        // Evaluate server guard rails
        const guardRail = await getServerGuardRailConfig(resolved.serverId, resolved.serverName);

        const evaluatedItems = rawItems.map(it => {
            const check = isMediaAllowedByServerGuardRail({
                contentRating: it.contentRating || it.detectedBadges?.contentRating,
                title: it.title,
                genre: it.genre
            }, guardRail);

            return {
                ...it,
                isBlockedByGuardRail: !check.allowed,
                guardRailBlockReason: check.reason,
                serverGuardRailActive: guardRail.enabled
            };
        });

        const items = (guardRail.enabled && guardRail.enforceInSearch && !includeBlocked)
            ? evaluatedItems.filter(it => !it.isBlockedByGuardRail)
            : evaluatedItems;

        return { 
            success: true, 
            items, 
            serverId: resolved.serverId,
            serverName: resolved.serverName,
            guardRail,
            totalFound: rawItems.length,
            blockedCount: evaluatedItems.filter(it => it.isBlockedByGuardRail).length
        };
    } catch (e: any) {
        return { success: false, error: e.message, items: [] };
    }
}

/**
 * Searches Plex library items across hubs or a specific library section.
 * Applies Server Guard Rails policy to filter disallowed/inappropriate content for the target server.
 */
export async function searchPlexLibraryItemsAction(
    serverId: string, 
    query: string, 
    sectionKey?: string,
    includeBlocked = false,
    limit = 100
) {
    try {

        await verifyAdmin();
        if (!query || query.trim().length === 0) return { success: true, items: [] };

        const resolved = await resolveWorkingPlexServerConnection(serverId || undefined);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured.", items: [] };

        let rawItems: PlexMediaStreamInfo[] = [];
        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];

        for (const url of urlsToTry) {
            try {
                rawItems = await searchPlexLibraryItems(url, resolved.token, query.trim(), sectionKey, limit);
                if (rawItems.length > 0) break;
            } catch (e) {
                // try next candidate URL
            }
        }

        // Evaluate server guard rails
        const guardRail = await getServerGuardRailConfig(resolved.serverId, resolved.serverName);

        const evaluatedItems = rawItems.map(it => {
            const check = isMediaAllowedByServerGuardRail({
                contentRating: it.contentRating || it.detectedBadges?.contentRating,
                title: it.title,
                genre: it.genre
            }, guardRail);

            return {
                ...it,
                isBlockedByGuardRail: !check.allowed,
                guardRailBlockReason: check.reason,
                serverGuardRailActive: guardRail.enabled
            };
        });

        const items = (guardRail.enabled && guardRail.enforceInSearch && !includeBlocked)
            ? evaluatedItems.filter(it => !it.isBlockedByGuardRail)
            : evaluatedItems;

        return { 
            success: true, 
            items,
            serverId: resolved.serverId,
            serverName: resolved.serverName,
            guardRail,
            totalFound: rawItems.length,
            blockedCount: evaluatedItems.filter(it => it.isBlockedByGuardRail).length
        };
    } catch (e: any) {
        return { success: false, error: e.message, items: [] };
    }
}

/**
 * Retrieves all Server Guard Rail configurations.
 */
export async function getServerGuardRailsAction() {
    try {

        await verifyAdmin();
        const guardRails = await getServerGuardRailsMap();
        return { success: true, guardRails };
    } catch (e: any) {
        return { success: false, error: e.message, guardRails: {} };
    }
}

/**
 * Retrieves the Server Guard Rail configuration for a specific server.
 */
export async function getServerGuardRailConfigAction(serverId: string, fallbackServerName?: string) {
    try {

        await verifyAdmin();
        const config = await getServerGuardRailConfig(serverId, fallbackServerName);
        return { success: true, config };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Saves a Server Guard Rail configuration for a specific server.
 */
export async function saveServerGuardRailConfigAction(config: ServerGuardRailConfig) {
    try {

        await verifyAdmin();
        const res = await saveServerGuardRailConfig(config);
        return res;
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Saves all Server Guard Rail configurations across all servers.
 */
export async function saveAllServerGuardRailsAction(configs: Record<string, ServerGuardRailConfig>) {
    try {

        await verifyAdmin();
        const res = await saveAllServerGuardRails(configs);
        return res;
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Retrieves stored parental advisories for all items in a library section.
 */
export async function getStoredParentalAdvisoriesForLibraryAction(
    serverId: string,
    sectionKey: string | number
) {
    try {

        await verifyAdmin();
        const res = await getStoredParentalAdvisoriesForLibrary(serverId, sectionKey);
        return { success: true, items: res.items };
    } catch (e: any) {
        return { success: false, items: [], error: e.message };
    }
}

/**
 * Applies a custom tagging rule (Label, Genre, Collection) across a library section.
 */
export async function applyCustomTagRuleAction(
    serverId: string,
    sectionKey: string | number,
    rule: CustomTagRule
) {
    try {

        await verifyAdmin();
        const res = await applyCustomTagRuleToLibrary(serverId, sectionKey, rule);
        return res;
    } catch (e: any) {
        return { success: false, totalEvaluated: 0, taggedCount: 0, skippedCount: 0, error: e.message };
    }
}

/**
 * Clears a specific custom tag from a library section.
 */
export async function clearCustomTagFromLibraryAction(
    serverId: string,
    sectionKey: string | number,
    tagName: string,
    field: "label" | "genre" | "collection" = "label"
) {
    try {

        await verifyAdmin();
        const res = await clearCustomTagFromLibrary(serverId, sectionKey, tagName, field);
        return res;
    } catch (e: any) {
        return { success: false, clearedCount: 0, error: e.message };
    }
}

/**
 * Retrieves an audit of all active tags, genres, and collections across a library section.
 */
export async function getPlexLibraryTagsAuditAction(
    serverId: string,
    sectionKey: string | number
) {
    try {

        await verifyAdmin();
        const res = await getPlexLibraryTagsAudit(serverId, sectionKey);
        return { success: true, ...res };
    } catch (e: any) {
        return { success: false, labels: [], genres: [], collections: [], totalItems: 0, error: e.message };
    }
}

/**
 * Deep inspection of a single Plex media item (full video/audio telemetry, streams, parts, and overlays).
 */
export async function inspectPlexMediaItemAction(serverId: string, ratingKey: string) {
    try {

        await verifyAdmin();
        const resolved = await resolveWorkingPlexServerConnection(serverId || undefined);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };

        let inspection: any = null;
        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];

        for (const url of urlsToTry) {
            try {
                inspection = await inspectPlexMediaItemFull(url, resolved.token, ratingKey, resolved.serverId);
                if (inspection) break;
            } catch (e) {}
        }

        if (!inspection) return { success: false, error: "Media item not found on Plex." };

        const customBadges = await prisma.customBadge.findMany({ where: { enabled: true } });

        return {
            success: true,
            serverName: resolved.serverName,
            serverUrl: resolved.serverUrl,
            ...inspection,
            availableCustomBadges: customBadges
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Applies overlay badges to a single media item (for live testing/preview).
 */
export async function applyOverlayToSingleItemAction(
    serverId: string,
    sectionKey: string,
    ratingKey: string,
    options?: {
        position?: string;
        videoPosition?: string;
        audioPosition?: string;
        editionPosition?: string;
        ratingPosition?: string;
        resolutionPosition?: string;
        hdrPosition?: string;
        codecPosition?: string;
        channelsPosition?: string;
        studioPosition?: string;
        contentRatingPosition?: string;
        ratingsPosition?: string;
        showRibbon?: boolean;
        ribbonMode?: "single" | "tiered" | "auto_stack" | "waterfall";
        tieredRibbons?: any[];
        maxRibbonTiers?: number;
        ribbonPosition?: string;
        ribbonTheme?: string;
        ribbonText?: string;
        ribbonType?: string;
        theme?: string;
        dovetailResolutionHdr?: boolean;
        showResolution?: boolean;
        showHdr?: boolean;
        showAudio?: boolean;
        showAudioChannels?: boolean;
        showCodec?: boolean;
        showEdition?: boolean;
        showStudio?: boolean;
        showContentRating?: boolean;
        showRatings?: boolean;
        showLeavingSoon?: boolean;
        badgeScale?: number;
        categoryScales?: Record<string, number> | string;
        customBadgeIds?: string[];
        layerPriorityOrder?: string[];
    }
) {
    try {

        await verifyAdmin();
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };

        const serverUrl = resolved.serverUrl;
        const token = resolved.token;

        let inspection: any = null;
        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];
        for (const url of urlsToTry) {
            try {
                inspection = await inspectPlexMediaItemFull(url, token, ratingKey, resolved.serverId);
                if (inspection) break;
            } catch (e) {}
        }

        if (!inspection) return { success: false, error: "Media item not found on Plex." };

        const allCustomBadges = await prisma.customBadge.findMany({ where: { enabled: true } });
        const activeBadges = (options?.customBadgeIds && options.customBadgeIds.length > 0)
            ? allCustomBadges.filter(cb => options.customBadgeIds!.includes(cb.id))
            : allCustomBadges;

        const effectiveCategoryScales = typeof options?.categoryScales === "string"
            ? (() => { try { return JSON.parse(options.categoryScales as string); } catch { return undefined; } })()
            : options?.categoryScales;

        const res = await backupAndApplyOverlay(
            serverUrl,
            token,
            serverId,
            inspection.item,
            {
                position: (options?.position as any) || "top-right",
                videoPosition: (options?.videoPosition as any) || (options?.position as any) || "top-right",
                audioPosition: (options?.audioPosition as any) || "top-left",
                editionPosition: (options?.editionPosition as any) || "top-left",
                ratingPosition: (options?.ratingPosition as any) || "bottom-left",
                resolutionPosition: (options?.resolutionPosition as any) || (options?.videoPosition as any) || (options?.position as any) || "top-right",
                hdrPosition: (options?.hdrPosition as any) || (options?.videoPosition as any) || (options?.position as any) || "top-right",
                codecPosition: (options?.codecPosition as any) || (options?.videoPosition as any) || (options?.position as any) || "top-right",
                channelsPosition: (options?.channelsPosition as any) || (options?.audioPosition as any) || "top-left",
                studioPosition: (options?.studioPosition as any) || "bottom-left",
                contentRatingPosition: (options?.contentRatingPosition as any) || (options?.ratingPosition as any) || "bottom-left",
                ratingsPosition: (options?.ratingsPosition as any) || (options?.ratingPosition as any) || "bottom-right",
                showRibbon: options?.showRibbon ?? false,
                ribbonMode: (options?.ribbonMode as any) || "waterfall",
                tieredRibbons: options?.tieredRibbons,
                maxRibbonTiers: options?.maxRibbonTiers || 3,
                ribbonPosition: (options?.ribbonPosition as any) || "bottom-right",
                ribbonTheme: (options?.ribbonTheme as any) || "gold",
                ribbonText: options?.ribbonText || undefined,
                ribbonType: (options?.ribbonType as any) || "auto_quality",
                theme: (options?.theme as any) || "glass",
                dovetailResolutionHdr: options?.dovetailResolutionHdr ?? true,
                badgeScale: options?.badgeScale ?? 1.0,
                categoryScales: effectiveCategoryScales,
                showResolution: options?.showResolution ?? true,
                showHdr: options?.showHdr ?? true,
                showAudio: options?.showAudio ?? true,
                showAudioChannels: options?.showAudioChannels ?? false,
                showCodec: options?.showCodec ?? false,
                showEdition: options?.showEdition ?? false,
                showStudio: options?.showStudio ?? false,
                showContentRating: options?.showContentRating ?? false,
                showRatings: options?.showRatings ?? false,
                showLeavingSoon: options?.showLeavingSoon ?? false,
                layerPriorityOrder: options?.layerPriorityOrder,
                customBadges: activeBadges.map(cb => ({
                    id: cb.id,
                    name: cb.name,
                    category: cb.category,
                    matchRule: cb.matchRule,
                    filePath: cb.filePath,
                    position: cb.position,
                    width: cb.width,
                    height: cb.height,
                    opacity: cb.opacity
                }))
            }
        );

        return {
            success: res.success,
            message: res.success ? `Applied overlays to "${inspection.item.title}" successfully!` : res.message
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Restores original poster artwork for a single item.
 */
export async function restoreSingleItemPosterAction(serverId: string, ratingKey: string) {
    try {

        await verifyAdmin();
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: `Plex server "${serverId}" unreachable or token not configured.` };

        const res = await restoreItemOriginalArtwork(resolved.serverUrl, resolved.token, resolved.serverId, ratingKey);
        return {
            success: res.success,
            message: res.success ? "Restored original pristine poster!" : (res.message || "Artwork not found in backup vault.")
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Automated full curation sync job (Seasonal collections, Poster overlays, Release calendar & placeholders, Leaving soon).
 * Can be called on-demand or by the background cron timer.
 */
export async function runFullCurationSyncInternal(): Promise<{
    success: boolean;
    seasonalCount: number;
    overlaysAppliedCount: number;
    leavingSoonCount: number;
    parentalTaggedCount?: number;
    timestamp: string;
    details: string[];
}> {
    const details: string[] = [];
    let seasonalCount = 0;
    let overlaysAppliedCount = 0;
    let leavingSoonCount = 0;

    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!settings) return { success: false, seasonalCount: 0, overlaysAppliedCount: 0, leavingSoonCount: 0, timestamp: new Date().toISOString(), details: ["No global settings"] };

        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) {
            return { success: false, seasonalCount: 0, overlaysAppliedCount: 0, leavingSoonCount: 0, timestamp: new Date().toISOString(), details: ["No Plex token configured"] };
        }

        const servers = await getPlexServers(token);
        const enabledServersForOverlays: string[] = settings.enabledServersForOverlays 
            ? JSON.parse(settings.enabledServersForOverlays) 
            : [];
        const enabledServersForCollections: string[] = settings.enabledServersForCollections 
            ? JSON.parse(settings.enabledServersForCollections) 
            : [];

        // 1. Seasonal & Scheduled Collections Sync (Agregarr)
        if (settings.curationSyncCollections !== false) {
            try {
                const seasonalRes = await syncSeasonalAndScheduledCollectionsInternal();
                seasonalCount = seasonalRes.evaluatedCount || 0;
                details.push(`Evaluated ${seasonalCount} seasonal collection schedules.`);
            } catch (sErr: any) {
                details.push(`Seasonal sync error: ${sErr.message}`);
            }
        }

        // 2. Leaving Soon Hub Sync (Prune / Storage Management)
        if (settings.curationSyncPruning !== false) {
            try {
                const leaveRes = await syncLeavingSoonCollectionHubInternal();
                leavingSoonCount = leaveRes.leavingCount || 0;
                details.push(`Leaving Soon hub synced: ${leavingSoonCount} items scheduled.`);
            } catch (lErr: any) {
                details.push(`Leaving Soon hub sync error: ${lErr.message}`);
            }
        }

        // 3. Automated IMDb Parental Rating Tags Sync
        let parentalTaggedCount = 0;
        if (settings.curationSyncParentalTags !== false && settings.parentalTaggingEnabled !== false) {
            try {
                const tagOptions: ParentalTaggingOptions = {
                    enabled: true,
                    format: (settings?.parentalTagFormat as any) || "prefix_category_severity",
                    prefix: settings?.parentalTagPrefix || "IMDb",
                    target: (settings?.parentalTagTarget as any) || "labels",
                    minSeverity: (settings?.parentalMinSeverity as any) || "Mild",
                    categories: settings?.parentalCategories ? JSON.parse(settings.parentalCategories) : ["nudity", "violence", "profanity", "alcohol", "frightening"]
                };

                for (const srv of servers) {
                    const resolved = await resolveWorkingPlexServerConnection(srv.clientIdentifier);
                    if (!resolved || !resolved.serverUrl) continue;
                    const srvSections = await getPlexServerSections(resolved.token, srv.clientIdentifier);
                    for (const sec of srvSections) {
                        try {
                            const pRes = await applyParentalTagsToLibrary(srv.clientIdentifier, String(sec.key), tagOptions);
                            if (pRes.success && pRes.taggedCount) {
                                parentalTaggedCount += pRes.taggedCount;
                            }
                        } catch (secErr: any) {
                            console.warn(`[CURATION-SYNC] Error applying parental tags in ${sec.title}:`, secErr.message);
                        }
                    }
                }
                details.push(`Applied IMDb parental ratings tags to ${parentalTaggedCount} library items.`);
            } catch (pErr: any) {
                details.push(`Parental tagging error: ${pErr.message}`);
            }
        }

        // 4. Poster Overlays & Waterfall Ribbons Sync (Kometa)
        // Executed last so that all newly created Collections, Labels, and Leaving Soon statuses are available for matching
        if (settings.curationSyncOverlays !== false) {
            try {
                const overlayServers = enabledServersForOverlays.length > 0 
                    ? servers.filter(s => enabledServersForOverlays.includes(s.clientIdentifier))
                    : servers;

                for (const srv of overlayServers) {
                    const resolved = await resolveWorkingPlexServerConnection(srv.clientIdentifier);
                    if (!resolved || !resolved.serverUrl) continue;

                    const srvSections = await getPlexServerSections(resolved.token, srv.clientIdentifier);

                    for (const sec of srvSections) {
                        const isSecEnabled = await isSectionEnabledInList(enabledServersForOverlays, srv.clientIdentifier, String(sec.key));
                        if (!isSecEnabled) {
                            continue;
                        }
                        try {
                            const res = await applyOverlaysToLibraryInternal(srv.clientIdentifier, String(sec.key));
                            if (res.success && res.appliedCount) {
                                overlaysAppliedCount += res.appliedCount;
                            }
                        } catch (secErr: any) {
                            console.warn(`[CURATION-SYNC] Error applying overlays to ${sec.title}:`, secErr.message);
                        }
                    }
                }
                details.push(`Applied overlays to ${overlaysAppliedCount} new/updated library posters.`);
            } catch (oErr: any) {
                details.push(`Overlay sync error: ${oErr.message}`);
            }
        }

        // Save last run telemetry
        const statusSummary = {
            success: true,
            timestamp: new Date().toISOString(),
            seasonalCount,
            overlaysAppliedCount,
            leavingSoonCount,
            parentalTaggedCount,
            details
        };

        await prisma.settings.update({
            where: { id: "global" },
            data: {
                curationLastRunAt: new Date(),
                curationLastRunStatus: JSON.stringify(statusSummary)
            }
        });

        logger.addLog("SUCCESS", "CURATION", `Automated Curation Sync Job completed: ${details.join(" • ")}`);

        return {
            success: true,
            seasonalCount,
            overlaysAppliedCount,
            leavingSoonCount,
            parentalTaggedCount,
            timestamp: new Date().toISOString(),
            details
        };
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Automated Curation Sync Job failed: ${e.message}`);
        return {
            success: false,
            seasonalCount,
            overlaysAppliedCount,
            leavingSoonCount,
            timestamp: new Date().toISOString(),
            details: [e.message]
        };
    }
}

/**
 * Server action to trigger full curation sync on-demand.
 */
export async function runFullCurationSyncAction() {
    try {

        await verifyAdmin();
        return await runFullCurationSyncInternal();
    } catch (e: any) {
        return {
            success: false,
            seasonalCount: 0,
            overlaysAppliedCount: 0,
            leavingSoonCount: 0,
            timestamp: new Date().toISOString(),
            details: [e.message || "Full curation sync encountered an unexpected error."]
        };
    }
}

/**
 * Server action to trigger curation overlay sync on a SINGLE strictly isolated server.
 * Guarantees zero side effects or changes on any other Plex server.
 */
export async function runServerCurationSyncAction(serverId: string, sectionKey?: string) {
    try {

        await verifyAdmin();
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) {
            return { 
                success: false, 
                error: `Plex server "${serverId}" unreachable or token not configured.`,
                details: [`Server "${serverId}" could not be resolved.`]
            };
        }

        const details: string[] = [];
        let overlaysAppliedCount = 0;

        if (sectionKey) {
            const res = await applyOverlaysToLibraryInternal(serverId, sectionKey);
            if (res.success && res.appliedCount) {
                overlaysAppliedCount = res.appliedCount;
                details.push(`Applied overlays to ${res.appliedCount} items in library section ${sectionKey}.`);
            } else if (!res.success) {
                details.push(`Library ${sectionKey} error: ${res.error || "Failed applying overlays"}`);
            }
        } else {
            const settings = await prisma.settings.findFirst({ where: { id: "global" } });
            const enabledServersForOverlays: string[] = settings?.enabledServersForOverlays 
                ? JSON.parse(settings.enabledServersForOverlays) 
                : [];

            const sections = await getPlexServerSections(resolved.token, serverId);
            for (const sec of sections) {
                const isSecEnabled = await isSectionEnabledInList(enabledServersForOverlays, serverId, String(sec.key));
                if (!isSecEnabled) {
                    details.push(`Skipped "${sec.title}" (Section is DISABLED for overlays).`);
                    continue;
                }
                try {
                    const res = await applyOverlaysToLibraryInternal(serverId, String(sec.key));
                    if (res.success && res.appliedCount) {
                        overlaysAppliedCount += res.appliedCount;
                        details.push(`Applied overlays to ${res.appliedCount} items in "${sec.title}".`);
                    }
                } catch (e: any) {
                    details.push(`Section "${sec.title}" error: ${e.message}`);
                }
            }
        }

        return {
            success: true,
            serverName: resolved.serverName,
            serverId: resolved.serverId,
            overlaysAppliedCount,
            details,
            message: `Scoped sync on "${resolved.serverName}": ${overlaysAppliedCount} posters updated.`
        };
    } catch (e: any) {
        return { 
            success: false, 
            error: e.message, 
            details: [e.message] 
        };
    }
}

/**
 * Server action to scan library section and apply IMDb Parental Advisory Tags.
 */
export async function applyParentalTagsToLibraryAction(
    serverId: string,
    sectionKey: string | number,
    options?: {
        format?: "prefix_category_severity" | "severity_category" | "category_severity_paren" | "custom";
        prefix?: string;
        target?: "labels" | "genres" | "both";
        minSeverity?: "Severe" | "Moderate" | "Mild" | "None";
        categories?: ParentalCategoryKey[];
        dryRun?: boolean;
    }
) {
    try {
        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const mergedOptions: ParentalTaggingOptions = {
            enabled: settings?.parentalTaggingEnabled ?? true,
            format: options?.format || (settings?.parentalTagFormat as any) || "prefix_category_severity",
            prefix: options?.prefix || settings?.parentalTagPrefix || "IMDb",
            target: options?.target || (settings?.parentalTagTarget as any) || "labels",
            minSeverity: options?.minSeverity || (settings?.parentalMinSeverity as any) || "Mild",
            categories: options?.categories || (settings?.parentalCategories ? JSON.parse(settings.parentalCategories) : ["nudity", "violence", "profanity", "alcohol", "frightening"]),
            dryRun: options?.dryRun ?? false
        };

        return await applyParentalTagsToLibrary(serverId, sectionKey, mergedOptions);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Apply parental tags failed: ${e.message}`);
        return { success: false, error: e.message || "Apply parental tags failed." } as any;
    }
}

/**
 * Server action to run automated parental tagging sync across enabled sections or a single server/section.
 */
export async function runParentalTagsSyncAction(serverId?: string, sectionKey?: string) {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const enabledServersForTagging: string[] = settings?.enabledServersForTagging
            ? JSON.parse(settings.enabledServersForTagging)
            : [];

        const details: string[] = [];
        let totalTagged = 0;
        let totalEvaluated = 0;

        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const serversWithSections = await getPlexServerLibrarySections(token, settings?.mainPlexUrl || undefined, serverId);
        
        for (const srv of serversWithSections) {
            if (serverId && srv.serverId !== serverId) continue;
            for (const sec of srv.sections || []) {
                const sKey = String(sec.key);
                if (sectionKey && sKey !== String(sectionKey)) continue;

                const isSecEnabled = isSectionEnabledInList(enabledServersForTagging, srv.serverId, sKey);
                if (!isSecEnabled) {
                    details.push(`Skipped "${sec.title}" on ${srv.serverName} (Disabled for tagging).`);
                    continue;
                }

                try {
                    const res = await applyParentalTagsToLibrary(srv.serverId, sKey);
                    if (res.success) {
                        totalTagged += res.taggedCount || 0;
                        totalEvaluated += res.totalEvaluated || 0;
                        details.push(`Tagged ${res.taggedCount || 0}/${res.totalEvaluated || 0} items in "${sec.title}" (${srv.serverName}).`);
                    } else if (res.error) {
                        details.push(`Library "${sec.title}": ${res.error}`);
                    }
                } catch (err: any) {
                    details.push(`Error tagging "${sec.title}": ${err.message}`);
                }
            }
        }

        const nowIso = new Date().toISOString();
        await prisma.settings.update({
            where: { id: "global" },
            data: {
                curationLastRunAt: nowIso,
                curationLastRunStatus: JSON.stringify({
                    type: "tagging",
                    totalTagged,
                    totalEvaluated,
                    timestamp: nowIso,
                    details
                })
            }
        });

        return {
            success: true,
            totalTagged,
            totalEvaluated,
            timestamp: nowIso,
            details
        };
    } catch (e: any) {
        return {
            success: false,
            error: e.message || "Failed running parental tags sync."
        };
    }
}

/**
 * Server action to clear all IMDb Parental Advisory Tags from a library section.
 */
export async function clearParentalTagsFromLibraryAction(
    serverId: string,
    sectionKey: string | number,
    prefix?: string
) {
    try {
        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const tagPrefix = prefix || settings?.parentalTagPrefix || "IMDb";
        return await clearParentalTagsFromLibrary(serverId, sectionKey, tagPrefix);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Clear parental tags failed: ${e.message}`);
        return { success: false, error: e.message || "Clear parental tags failed." } as any;
    }
}

/**
 * Server action to inspect an individual item's IMDb Parental Advisory breakdown.
 */
export async function inspectItemParentalAdvisoryAction(
    ratingKey: string,
    serverId: string = "main",
    metadata?: {
        title: string;
        year?: number;
        type?: string;
        imdbId?: string;
        contentRating?: string;
    }
) {
    try {
        await verifyAdmin();
        if (!metadata || !metadata.title) {
            const stored = await prisma.mediaContentAdvisory.findFirst({
                where: { ratingKey, serverId }
            });
            if (stored) {
                return {
                    success: true,
                    advisory: {
                        nudity: stored.nudityLevel || "None",
                        violence: stored.violenceLevel || "None",
                        profanity: stored.profanityLevel || "None",
                        alcohol: stored.alcoholLevel || "None",
                        frightening: stored.frighteningLevel || "None",
                        certificate: stored.mpaaRating,
                        summary: stored.leavingReason,
                        source: "cache"
                    }
                };
            }
            return { success: false, error: "Item metadata required to inspect advisory." };
        }

        const advisory = await resolveParentalAdvisory({
            ratingKey,
            title: metadata.title,
            year: metadata.year,
            type: metadata.type,
            imdbId: metadata.imdbId,
            contentRating: metadata.contentRating
        }, serverId);

        return {
            success: true,
            advisory
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Inspect parental advisory failed: ${e.message}`);
        return { success: false, error: e.message || "Inspect parental advisory failed." } as any;
    }
}

/**
 * Server action to manually save / edit an individual item's parental advisory breakdown.
 */
export async function saveItemParentalAdvisoryAction(
    ratingKey: string,
    serverId: string,
    title: string,
    advisory: any
) {
    try {
        await verifyAdmin();
        await saveParentalAdvisory(ratingKey, serverId, title, advisory);
        return { success: true };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Save parental advisory failed: ${e.message}`);
        return { success: false, error: e.message || "Save parental advisory failed." };
    }
}

function parseGitHubRepoUrl(input: string): { owner: string; repo: string; branch: string; subpath: string } | null {
    if (!input || !input.trim()) return null;
    let clean = input.trim();
    clean = clean.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
    clean = clean.replace(/\.git$/i, "");
    clean = clean.replace(/\/+$/, "");

    // Pattern: owner/repo/tree/branch/subpath... or owner/repo/blob/branch/subpath...
    const treeMatch = clean.match(/^([^\/]+)\/([^\/]+)\/(tree|blob)\/([^\/]+)(\/(.*))?$/i);
    if (treeMatch) {
        return {
            owner: treeMatch[1],
            repo: treeMatch[2],
            branch: treeMatch[4],
            subpath: treeMatch[6] || ""
        };
    }

    // Pattern: owner/repo or owner/repo/subpath...
    const parts = clean.split("/").filter(Boolean);
    if (parts.length >= 2) {
        return {
            owner: parts[0],
            repo: parts[1],
            branch: "main",
            subpath: parts.slice(2).join("/")
        };
    }

    return null;
}

function inferBadgeCategoryAndRule(filePath: string, filename: string): {
    category: "resolution" | "hdr" | "codec" | "audio" | "edition" | "ratings" | "ribbon" | "studio" | "contentRating" | "custom";
    suggestedPosition: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    suggestedMatchRule: string;
} {
    const rawBase = filename.replace(/\.[^/.]+$/, "");
    const baseLower = rawBase.toLowerCase();
    const fullLower = `${filePath}/${filename}`.toLowerCase();

    // 1. Ribbons (Award Festivals & Critical Honors)
    if (fullLower.includes("ribbon") || fullLower.includes("banner")) {
        let rule = "featured";
        if (/oscar/i.test(baseLower)) rule = "oscar_winner";
        else if (/cannes/i.test(baseLower)) rule = "cannes_winner";
        else if (/golden/i.test(baseLower)) rule = "golden_globe";
        else if (/emmy/i.test(baseLower)) rule = "emmy_winner";
        else if (/bafta/i.test(baseLower)) rule = "bafta_winner";
        else if (/sundance/i.test(baseLower)) rule = "sundance_winner";
        else if (/berlinale/i.test(baseLower)) rule = "berlinale_winner";
        else if (/venice/i.test(baseLower)) rule = "venice_winner";
        else if (/spirit/i.test(baseLower)) rule = "spirit_winner";
        else if (/rotten/i.test(baseLower)) rule = "rt_fresh";
        else if (/imdb/i.test(baseLower)) rule = "imdb_top_250";
        else if (/metacritic/i.test(baseLower)) rule = "metacritic_must_see";
        else if (/netflix/i.test(baseLower)) rule = "netflix";
        else if (/recent|new/i.test(baseLower)) rule = "recently_added";
        else if (/trend/i.test(baseLower)) rule = "trending";
        else if (/pop/i.test(baseLower)) rule = "popular";
        return {
            category: "ribbon",
            suggestedPosition: "top-left",
            suggestedMatchRule: rule
        };
    }

    // 2. Content & Age Ratings (MPAA, TV Guidelines, International Ratings)
    if (
        fullLower.includes("/cr/") ||
        fullLower.includes("_cr_") ||
        fullLower.includes("content_rating") ||
        fullLower.includes("contentrating") ||
        /\b(rated|pg-13|pg13|tv-ma|tvma|tv-14|tv14|tv-pg|tvpg|tv-g|tvg|tv-y|tvy|nc-17|nc17|mpaa)\b/i.test(fullLower) ||
        /official_kometa_cr_/i.test(fullLower)
    ) {
        const cleanName = baseLower
            .replace(/^official[_-]kometa[_-]cr[_-]/i, "")
            .replace(/^kometa[_-]cr[_-]/i, "")
            .replace(/^builtin[_-]badge[_-]cr[_-]/i, "")
            .replace(/^(us|gb|uk|de|ca|au|fr|es|it|nz)[_-]?/i, "")
            .replace(/^rated[_-]?/i, "")
            .replace(/_png$/i, "")
            .trim();

        let rule = cleanName;
        if (/pg[\s_-]?13c?/i.test(cleanName)) rule = "pg-13";
        else if (/tv[\s_-]?ma[\s_-]?c?/i.test(cleanName)) rule = "tv-ma";
        else if (/tv[\s_-]?14[\s_-]?c?/i.test(cleanName)) rule = "tv-14";
        else if (/tv[\s_-]?pg[\s_-]?c?/i.test(cleanName)) rule = "tv-pg";
        else if (/tv[\s_-]?g[\s_-]?c?/i.test(cleanName)) rule = "tv-g";
        else if (/tv[\s_-]?y[\s_-]?7[\s_-]?c?/i.test(cleanName)) rule = "tv-y7";
        else if (/tv[\s_-]?y[\s_-]?c?/i.test(cleanName)) rule = "tv-y";
        else if (/nc[\s_-]?17[\s_-]?c?/i.test(cleanName)) rule = "nc-17";
        else if (/^rc?$|^rated[\s_-]?r$/i.test(cleanName)) rule = "r";
        else if (/^pgc?$|^rated[\s_-]?pg$/i.test(cleanName)) rule = "pg";
        else if (/^gc?$|^rated[\s_-]?g$/i.test(cleanName)) rule = "g";
        else if (/nrc?$|not[\s_-]?rated|unrated/i.test(cleanName)) rule = "nr";
        else rule = cleanName.replace(/c$/, "").replace(/_/g, "-");

        return {
            category: "contentRating",
            suggestedPosition: "bottom-left",
            suggestedMatchRule: rule
        };
    }

    // 3. Special Editions & Cuts (IMAX, Criterion, Extended, Director's Cut) - MUST BE BEFORE STUDIO to prevent "imax" matching "max"
    if (
        fullLower.includes("edition") ||
        /\b(imax|criterion|remux|director|directors|extended|theatrical|uncut|unrated|remastered|restored|special|anniversary|collector|ultimate|definitive|diamond|platinum|coda|blackchrome)\b/i.test(fullLower) ||
        /official_kometa_edition_/i.test(fullLower)
    ) {
        let rule = "special";
        if (/imax/i.test(baseLower)) rule = "imax";
        else if (/criterion/i.test(baseLower)) rule = "criterion";
        else if (/director/i.test(baseLower)) rule = "directors_cut";
        else if (/extended/i.test(baseLower)) rule = "extended";
        else if (/theatrical/i.test(baseLower)) rule = "theatrical";
        else if (/unrated/i.test(baseLower)) rule = "unrated";
        else if (/uncut/i.test(baseLower)) rule = "uncut";
        else if (/remaster/i.test(baseLower)) rule = "remastered";
        else if (/remux/i.test(baseLower)) rule = "remux";
        else if (/collector/i.test(baseLower)) rule = "collector";
        else if (/ultimate/i.test(baseLower)) rule = "ultimate";
        else if (/anniversary/i.test(baseLower)) rule = "anniversary";
        else if (/definitive/i.test(baseLower)) rule = "definitive";
        return {
            category: "edition",
            suggestedPosition: "bottom-right",
            suggestedMatchRule: rule
        };
    }

    // 4. Ratings & Critical Scores (IMDb, RT, Metacritic, MAL, Trakt)
    if (fullLower.includes("/rating/") || fullLower.includes("audience") || /score|tomato|rotten|imdb|metacritic|tmdb|trakt|letterboxd|anidb|omdb|mal\b/i.test(fullLower)) {
        let rule = "imdb";
        if (/imdbtop250/i.test(baseLower)) rule = "imdb_top_250";
        else if (/imdbtop1000/i.test(baseLower)) rule = "imdb_top_1000";
        else if (/imdbtop100/i.test(baseLower)) rule = "imdb_top_100";
        else if (/imdbtop/i.test(baseLower)) rule = "imdb_top";
        else if (/imdb/i.test(baseLower)) rule = "imdb";
        else if (/rt.*fresh|criticfresh|audiencefresh/i.test(baseLower)) rule = "rt_fresh";
        else if (/rt.*rotten|criticrotten|audiencerotten/i.test(baseLower)) rule = "rt_rotten";
        else if (/metacritictop/i.test(baseLower)) rule = "metacritic_must_see";
        else if (/metacritic/i.test(baseLower)) rule = "metacritic";
        else if (/trakt/i.test(baseLower)) rule = "trakt";
        else if (/tmdb/i.test(baseLower)) rule = "tmdb";
        else if (/letterboxd/i.test(baseLower)) rule = "letterboxd";
        else if (/mdblist/i.test(baseLower)) rule = "mdblist";
        else if (/mal\b/i.test(baseLower)) rule = "mal";
        else if (/anidb/i.test(baseLower)) rule = "anidb";
        return {
            category: "ratings",
            suggestedPosition: "bottom-left",
            suggestedMatchRule: rule
        };
    }

    // 5. Streaming Networks & Studios (Netflix, Disney+, Max, Apple TV+, etc.)
    if (
        fullLower.includes("streaming") ||
        fullLower.includes("studio") ||
        fullLower.includes("network") ||
        /\b(netflix|disney|hbo|max|apple|prime|amazon|paramount|hulu|peacock|crunchyroll|amc|discovery|hayu|tubi|filmin|crave|itvx|a24|marvel|dc)\b/i.test(fullLower)
    ) {
        let rule = "netflix";
        if (/netflix/i.test(baseLower)) rule = "netflix";
        else if (/disney/i.test(baseLower)) rule = "disney";
        else if (/hbo|\bmax\b/i.test(baseLower)) rule = "hbo";
        else if (/apple/i.test(baseLower)) rule = "apple_tv";
        else if (/prime|amazon/i.test(baseLower)) rule = "amazon";
        else if (/paramount/i.test(baseLower)) rule = "paramount";
        else if (/peacock/i.test(baseLower)) rule = "peacock";
        else if (/hulu/i.test(baseLower)) rule = "hulu";
        else if (/crunchyroll/i.test(baseLower)) rule = "crunchyroll";
        else if (/amc/i.test(baseLower)) rule = "amc";
        else if (/marvel/i.test(baseLower)) rule = "marvel";
        else if (/a24/i.test(baseLower)) rule = "a24";
        else rule = baseLower.replace(/[^a-z0-9]/g, "_");
        return {
            category: "studio",
            suggestedPosition: "bottom-left",
            suggestedMatchRule: rule
        };
    }

    // 6. Audio Codecs & Multichannel
    if (fullLower.includes("audio_codec") || fullLower.includes("audio") || /atmos|truehd|dts|flac|aac|eac3|ac3|pcm|opus|mp3|digital|surround/i.test(fullLower)) {
        let rule = "atmos";
        if (/truehd.*atmos/i.test(baseLower)) rule = "truehd + atmos";
        else if (/plus.*atmos/i.test(baseLower)) rule = "eac3 + atmos";
        else if (/atmos/i.test(baseLower)) rule = "atmos";
        else if (/truehd/i.test(baseLower)) rule = "truehd";
        else if (/dts[-:_]?x|dtsx/i.test(baseLower)) rule = "dts:x";
        else if (/dts[-:_]?hd|dtshd|dts[-:_]?ma|ma\b/i.test(baseLower)) rule = "dts-hd";
        else if (/dtses/i.test(baseLower)) rule = "dts-es";
        else if (/dts/i.test(baseLower)) rule = "dts";
        else if (/flac/i.test(baseLower)) rule = "flac";
        else if (/aac/i.test(baseLower)) rule = "aac";
        else if (/pcm/i.test(baseLower)) rule = "pcm";
        else if (/opus/i.test(baseLower)) rule = "opus";
        else if (/mp3/i.test(baseLower)) rule = "mp3";
        else if (/digital|plus/i.test(baseLower)) rule = "eac3";
        return {
            category: "audio",
            suggestedPosition: "top-left",
            suggestedMatchRule: rule
        };
    }

    // 7. Video Codecs
    if (fullLower.includes("codec") || /hevc|av1|avc|prores|h264|h265|x264|x265|vc1|vp9/i.test(fullLower)) {
        let rule = "hevc";
        if (/av1/i.test(baseLower)) rule = "av1";
        else if (/hevc|h265|x265/i.test(baseLower)) rule = "hevc";
        else if (/avc|h264|x264/i.test(baseLower)) rule = "avc";
        else if (/prores/i.test(baseLower)) rule = "prores";
        else if (/vc1/i.test(baseLower)) rule = "vc1";
        return {
            category: "codec",
            suggestedPosition: "top-right",
            suggestedMatchRule: rule
        };
    }

    // 8. Dovetailed Resolution + HDR (4kdvhdrplus, 4kdv, 1080phdr, etc.)
    let res: string | null = null;
    if (/\b4k\b|4k|2160p|uhd|ultra-hd/i.test(baseLower)) res = "4k";
    else if (/\b1080p\b|1080p|1080|fhd/i.test(baseLower)) res = "1080p";
    else if (/\b720p\b|720p|720/i.test(baseLower)) res = "720p";
    else if (/\b480p\b|480p|480|\b576p\b|576p|576|\bsd\b/i.test(baseLower)) res = "480p";

    const hdrs: string[] = [];
    if (/dv|dolby.*vision|dovi/i.test(baseLower)) hdrs.push("dv");
    if (/hdrplus|hdr\+|hdr10plus/i.test(baseLower) || (baseLower.endsWith("plus") && !baseLower.includes("disney"))) hdrs.push("hdr10+");
    else if (/hdr10/i.test(baseLower)) hdrs.push("hdr10");
    else if (/hdr/i.test(baseLower)) hdrs.push("hdr");
    else if (/hlg/i.test(baseLower)) hdrs.push("hlg");

    if (res && hdrs.length > 0) {
        return {
            category: "resolution",
            suggestedPosition: "top-right",
            suggestedMatchRule: `${res} + ${hdrs.join(" + ")}`
        };
    }
    if (res) {
        return {
            category: "resolution",
            suggestedPosition: "top-right",
            suggestedMatchRule: res
        };
    }
    if (hdrs.length > 0) {
        return {
            category: "hdr",
            suggestedPosition: "top-right",
            suggestedMatchRule: hdrs.join(" + ")
        };
    }

    return {
        category: "custom",
        suggestedPosition: "top-right",
        suggestedMatchRule: baseLower
    };
}

/**
 * Server action to get curated preset overlay packs.
 */
export async function getPresetBadgePacksAction() {
    return {
        success: true,
        presets: PRESET_BADGE_PACKS
    };
}

/**
 * Server action to discover and scan badge images from any GitHub repository.
 */
export async function fetchGitHubBadgeRepoAction(repoInput: string) {
    try {

        await verifyAdmin();
        const parsed = parseGitHubRepoUrl(repoInput);
        if (!parsed) {
            return {
                success: false,
                error: "Invalid GitHub repository URL. Use format: https://github.com/jmxd/Kometa/tree/main/overlays or owner/repo"
            };
        }

        const { owner, repo, subpath } = parsed;
        let branch = parsed.branch || "main";

        const headers = {
            "User-Agent": "Portalarr-Overlay-Hub/1.0",
            "Accept": "application/vnd.github.v3+json"
        };

        // 1. Try Git Trees API for recursive repository discovery
        let treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
        
        // If main branch 404s, automatically try master branch
        if (!treeRes.ok && branch === "main") {
            branch = "master";
            treeRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { headers });
        }

        const discoveredBadges: DiscoveredBadgeItem[] = [];

        if (treeRes.ok) {
            const treeData = await treeRes.json();
            const tree: any[] = treeData.tree || [];

            for (const item of tree) {
                if (item.type !== "blob") continue;
                const p: string = item.path || "";
                
                // Filter for image files
                if (!/\.(png|svg|webp|jpg|jpeg)$/i.test(p)) continue;
                
                // Filter by subpath if user specified one
                if (subpath && !p.toLowerCase().startsWith(subpath.toLowerCase().replace(/^\/+/, ""))) {
                    continue;
                }

                const filename = p.split("/").pop() || "";
                const is2x = filename.includes("@2x") || p.includes("@2x");
                let displayName = filename.replace(/\.(png|svg|webp|jpg|jpeg)$/i, "");
                displayName = displayName.replace(/@2x/gi, "").replace(/[-_]+/g, " ").trim();
                
                const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`;
                const { category, suggestedPosition, suggestedMatchRule } = inferBadgeCategoryAndRule(p, filename);

                discoveredBadges.push({
                    id: `gh_${owner}_${repo}_${p.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
                    name: displayName || filename,
                    filename,
                    path: p,
                    size: item.size || 0,
                    downloadUrl: rawUrl,
                    previewUrl: rawUrl,
                    category,
                    suggestedPosition,
                    suggestedMatchRule,
                    width: 140,
                    height: 46,
                    is2x
                });
            }
        } else {
            // Fallback: Query contents API directly
            const contentsRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${subpath}?ref=${branch}`, { headers });
            if (!contentsRes.ok) {
                return {
                    success: false,
                    error: `Failed connecting to GitHub repository "${owner}/${repo}" (${contentsRes.statusText || contentsRes.status}). Check repository URL or branch name.`
                };
            }

            const contents: any[] = await contentsRes.json();
            for (const item of contents) {
                if (item.type !== "file") continue;
                const p = item.path || item.name;
                if (!/\.(png|svg|webp|jpg|jpeg)$/i.test(p)) continue;

                const filename = item.name;
                const is2x = filename.includes("@2x");
                let displayName = filename.replace(/\.(png|svg|webp|jpg|jpeg)$/i, "").replace(/@2x/gi, "").replace(/[-_]+/g, " ").trim();
                const rawUrl = item.download_url || `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${p}`;
                const { category, suggestedPosition, suggestedMatchRule } = inferBadgeCategoryAndRule(p, filename);

                discoveredBadges.push({
                    id: `gh_${owner}_${repo}_${p.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
                    name: displayName || filename,
                    filename,
                    path: p,
                    size: item.size || 0,
                    downloadUrl: rawUrl,
                    previewUrl: rawUrl,
                    category,
                    suggestedPosition,
                    suggestedMatchRule,
                    width: 140,
                    height: 46,
                    is2x
                });
            }
        }

        const categories = Array.from(new Set(discoveredBadges.map(b => b.category)));

        return {
            success: true,
            repoInfo: {
                owner,
                repo,
                branch,
                subpath,
                title: `${owner}/${repo}${subpath ? ` (${subpath})` : ""}`,
                url: `https://github.com/${owner}/${repo}/tree/${branch}/${subpath}`
            },
            badges: discoveredBadges,
            totalCount: discoveredBadges.length,
            categories
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed discovering badges from GitHub." };
    }
}

/**
 * Server action to download and install badges from GitHub into Portalarr custom badges vault.
 */
export async function importGitHubBadgesAction(badges: Array<{
    name: string;
    downloadUrl: string;
    filename: string;
    category?: string;
    position?: string;
    matchRule?: string;
    width?: number;
    height?: number;
}>) {
    try {
        await verifyAdmin();
        if (!badges || badges.length === 0) {
            return { success: false, error: "No badges selected for download." };
        }

        const badgesDir = path.join(process.cwd(), "data", "custom_badges");
        if (!fs.existsSync(badgesDir)) {
            fs.mkdirSync(badgesDir, { recursive: true });
        }

        let importedCount = 0;
        let skippedCount = 0;
        const installedBadges: any[] = [];

        for (const it of badges) {
            try {
                const res = await fetch(it.downloadUrl);
                if (!res.ok) {
                    skippedCount++;
                    continue;
                }

                const arrayBuf = await res.arrayBuffer();
                const buffer = Buffer.from(arrayBuf);
                const ext = path.extname(it.filename || it.downloadUrl).toLowerCase() || ".png";
                const cleanName = it.name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
                const fileId = `badge_gh_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
                const fileName = `${fileId}_${cleanName}${ext}`;
                const filePath = path.join(badgesDir, fileName);

                let mimeType = ext === ".svg" ? "image/svg+xml" : "image/png";
                let measuredWidth = it.width || 140;
                let measuredHeight = it.height || 46;

                if (ext === ".svg") {
                    fs.writeFileSync(filePath, buffer);
                } else {
                    try {
                        const meta = await sharp(buffer).metadata();
                        measuredWidth = it.width || meta.width || 140;
                        measuredHeight = it.height || meta.height || 46;
                        if (meta.format) {
                            mimeType = `image/${meta.format}`;
                        }
                        fs.writeFileSync(filePath, buffer);
                    } catch (sErr) {
                        fs.writeFileSync(filePath, buffer);
                    }
                }

                const badge = await prisma.customBadge.create({
                    data: {
                        id: fileId,
                        name: it.name,
                        category: it.category || "custom",
                        filePath,
                        fileType: ext.replace(".", "").toLowerCase(),
                        mimeType,
                        position: it.position || "top-right",
                        width: isNaN(measuredWidth) ? 140 : measuredWidth,
                        height: isNaN(measuredHeight) ? 46 : measuredHeight,
                        opacity: 1.0,
                        matchRule: it.matchRule || null,
                        enabled: true
                    }
                });

                installedBadges.push(badge);
                importedCount++;
            } catch (bErr: any) {
                console.warn(`[BADGE-IMPORT] Failed downloading badge ${it.name}:`, bErr.message);
                skippedCount++;
            }
        }

        logger.addLog("SUCCESS", "CURATION", `Imported ${importedCount} overlay badges from GitHub repository.`);

        return {
            success: true,
            importedCount,
            skippedCount,
            badges: installedBadges,
            message: `Successfully downloaded and installed ${importedCount} badges into your custom vault!`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed importing badges." };
    }
}

/**
 * Server action to download and install all preset Kometa overlay packs in bulk with 1-click.
 */
export async function downloadAllKometaPacksAction() {
    try {

        await verifyAdmin();
        let totalImported = 0;
        const results: string[] = [];

        for (const pack of PRESET_BADGE_PACKS) {
            try {
                const scanRes = await fetchGitHubBadgeRepoAction(pack.repoUrl);
                if (scanRes.success && scanRes.badges && scanRes.badges.length > 0) {
                    const importRes = await importGitHubBadgesAction(scanRes.badges);
                    if (importRes.success && importRes.importedCount) {
                        totalImported += importRes.importedCount;
                        results.push(`${pack.title}: +${importRes.importedCount} badges`);
                    }
                }
            } catch (pErr: any) {
                console.warn(`[KOMETA-BULK-DOWNLOAD] Error importing pack ${pack.id}:`, pErr.message);
            }
        }

        const allCustomBadges = await prisma.customBadge.findMany({ where: { enabled: true } });

        logger.addLog("SUCCESS", "CURATION", `Bulk downloaded ${totalImported} Kometa overlays.`);

        return {
            success: true,
            totalImported,
            totalBadges: allCustomBadges.length,
            results,
            message: totalImported > 0 
                ? `Successfully downloaded and installed ${totalImported} Kometa badges and overlays!`
                : `All Kometa overlay badge sets are already up-to-date in your vault (${allCustomBadges.length} total badges).`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed bulk downloading Kometa badges." };
    }
}

/**
 * Server action to import local Kometa overlay assets (e.g. from kometa_assets folder) into the custom badge vault.
 */
export async function importLocalKometaAssetsAction(folderPath?: string) {
    try {

        await verifyAdmin();
        const targetDir = folderPath && folderPath.trim() 
            ? folderPath.trim() 
            : path.join(process.cwd(), "kometa_assets");

        if (!fs.existsSync(targetDir)) {
            return { success: false, error: `Assets folder "${targetDir}" not found on disk.` };
        }

        const badgeVaultDir = path.join(process.cwd(), "data", "custom_badges");
        if (!fs.existsSync(badgeVaultDir)) {
            fs.mkdirSync(badgeVaultDir, { recursive: true });
        }

        const files = fs.readdirSync(targetDir);
        const imageFiles = files.filter(f => /\.(png|jpe?g|webp|svg)$/i.test(f));

        if (imageFiles.length === 0) {
            return { success: false, error: "No image files (.png, .jpg, .webp, .svg) found in assets folder." };
        }

        let importedCount = 0;
        let updatedCount = 0;
        const installedBadges: any[] = [];

        for (const filename of imageFiles) {
            try {
                const srcPath = path.join(targetDir, filename);
                const fileBuffer = fs.readFileSync(srcPath);
                const ext = path.extname(filename).toLowerCase();
                const rawName = path.basename(filename, ext);
                const fileId = `local_kometa_${rawName.toLowerCase().replace(/[^a-z0-9]/g, "_")}`;
                const destPath = path.join(badgeVaultDir, `${fileId}${ext}`);

                fs.writeFileSync(destPath, fileBuffer);

                let measuredWidth = 140;
                let measuredHeight = 46;
                let mimeType = `image/${ext.replace(".", "")}`;
                if (ext === ".jpg") mimeType = "image/jpeg";
                if (ext === ".svg") mimeType = "image/svg+xml";

                try {
                    const meta = await sharp(fileBuffer).metadata();
                    if (meta.width) measuredWidth = meta.width;
                    if (meta.height) measuredHeight = meta.height;
                } catch (sErr) {}

                const inferred = inferBadgeCategoryAndRule("kometa_assets", filename);

                const existing = await prisma.customBadge.findUnique({ where: { id: fileId } });
                let badge;

                if (existing) {
                    badge = await prisma.customBadge.update({
                        where: { id: fileId },
                        data: {
                            name: rawName,
                            category: inferred.category || "resolution",
                            filePath: destPath,
                            fileType: ext.replace(".", "").toLowerCase(),
                            mimeType,
                            position: inferred.suggestedPosition || "top-right",
                            width: measuredWidth,
                            height: measuredHeight,
                            matchRule: inferred.suggestedMatchRule || null,
                            enabled: true
                        }
                    });
                    updatedCount++;
                } else {
                    badge = await prisma.customBadge.create({
                        data: {
                            id: fileId,
                            name: rawName,
                            category: inferred.category || "resolution",
                            filePath: destPath,
                            fileType: ext.replace(".", "").toLowerCase(),
                            mimeType,
                            position: inferred.suggestedPosition || "top-right",
                            width: measuredWidth,
                            height: measuredHeight,
                            opacity: 1.0,
                            matchRule: inferred.suggestedMatchRule || null,
                            enabled: true
                        }
                    });
                    importedCount++;
                }

                installedBadges.push(badge);
            } catch (err: any) {
                console.warn(`[KOMETA-ASSET-IMPORT] Failed importing ${filename}:`, err.message);
            }
        }

        logger.addLog("SUCCESS", "CURATION", `Imported ${importedCount + updatedCount} Kometa overlay badges from local folder (${targetDir}).`);

        return {
            success: true,
            importedCount,
            updatedCount,
            totalCount: installedBadges.length,
            badges: installedBadges,
            message: `Successfully imported ${installedBadges.length} Kometa overlay badges from "${path.basename(targetDir)}" into your vault!`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed importing local Kometa assets." };
    }
}

export interface ArrItemStatus {
    id: number;
    title: string;
    tmdbId?: number;
    tvdbId?: number;
    imdbId?: string;
    monitored: boolean;
    hasFile: boolean;
    status?: string;
    isReleased: boolean;
    digitalRelease?: string;
    physicalRelease?: string;
    inCinemas?: string;
    appType: "radarr" | "sonarr";
    appName: string;
}

/**
 * Server action to list all configured Radarr and Sonarr instances for Agregarr / Curation mapping.
 */
export async function getArrInstancesListAction() {
    try {

        await verifyAdmin();
        const radarrApps = await prisma.mediaApp.findMany({
            where: { type: "radarr" },
            select: { id: true, name: true, type: true, url: true, externalUrl: true }
        });
        const sonarrApps = await prisma.mediaApp.findMany({
            where: { type: "sonarr" },
            select: { id: true, name: true, type: true, url: true, externalUrl: true }
        });
        return {
            success: true,
            radarr: radarrApps,
            sonarr: sonarrApps
        };
    } catch (e: any) {
        return { success: false, error: e.message, radarr: [], sonarr: [] };
    }
}

/**
 * Fast multi-instance indexer for Radarr and Sonarr, with optional per-server instance filtering.
 */
export async function getArrMonitoredIndex(options?: {
    targetRadarrId?: string;
    targetSonarrId?: string;
    targetServerId?: string;
}): Promise<{
    moviesByTmdb: Map<string, ArrItemStatus>;
    moviesByImdb: Map<string, ArrItemStatus>;
    moviesByTitle: Map<string, ArrItemStatus>;
    seriesByTvdb: Map<string, ArrItemStatus>;
    seriesByImdb: Map<string, ArrItemStatus>;
    seriesByTitle: Map<string, ArrItemStatus>;
}> {
    const moviesByTmdb = new Map<string, ArrItemStatus>();
    const moviesByImdb = new Map<string, ArrItemStatus>();
    const moviesByTitle = new Map<string, ArrItemStatus>();
    const seriesByTvdb = new Map<string, ArrItemStatus>();
    const seriesByImdb = new Map<string, ArrItemStatus>();
    const seriesByTitle = new Map<string, ArrItemStatus>();

    const now = new Date();

    let radarrId = options?.targetRadarrId;
    let sonarrId = options?.targetSonarrId;

    if (options?.targetServerId && (!radarrId || !sonarrId)) {
        try {
            const settings = await prisma.settings.findFirst({ where: { id: "global" } });
            if (settings?.serverStorageConfig) {
                const parsed = JSON.parse(settings.serverStorageConfig);
                const srvConfig = parsed[options.targetServerId];
                if (srvConfig) {
                    if (!radarrId && srvConfig.radarrId) radarrId = srvConfig.radarrId;
                    if (!sonarrId && srvConfig.sonarrId) sonarrId = srvConfig.sonarrId;
                }
            }
        } catch {}
    }

    try {
        const radarrRes = await getEnabledArrInstancesInternal("radarr");
        if (radarrRes.success && radarrRes.data) {
            const targetApps = radarrId && radarrId !== "auto" && radarrId !== "all"
                ? radarrRes.data.filter(app => app.id === radarrId)
                : radarrRes.data;

            for (const app of targetApps) {
                try {
                    const moviesRes = await arrApiGet(app, "/api/v3/movie");
                    const movies = moviesRes?.success && Array.isArray(moviesRes.data)
                        ? moviesRes.data
                        : (Array.isArray(moviesRes) ? moviesRes : []);
                    if (movies.length > 0) {
                        for (const m of movies) {
                            const digitalDate = m.digitalRelease ? new Date(m.digitalRelease) : null;
                            const physicalDate = m.physicalRelease ? new Date(m.physicalRelease) : null;
                            const cinemasDate = m.inCinemas ? new Date(m.inCinemas) : null;

                            const isReleased = Boolean(
                                m.isAvailable ||
                                m.status === "released" ||
                                (digitalDate && digitalDate <= now) ||
                                (physicalDate && physicalDate <= now) ||
                                (cinemasDate && cinemasDate <= now) ||
                                m.hasFile
                            );

                            const statusObj: ArrItemStatus = {
                                id: m.id,
                                title: m.title,
                                tmdbId: m.tmdbId,
                                imdbId: m.imdbId,
                                monitored: Boolean(m.monitored),
                                hasFile: Boolean(m.hasFile),
                                status: m.status,
                                isReleased,
                                digitalRelease: m.digitalRelease,
                                physicalRelease: m.physicalRelease,
                                inCinemas: m.inCinemas,
                                appType: "radarr",
                                appName: app.name
                            };

                            if (m.tmdbId) moviesByTmdb.set(String(m.tmdbId), statusObj);
                            if (m.imdbId) moviesByImdb.set(m.imdbId.trim().toLowerCase(), statusObj);
                            if (m.title) moviesByTitle.set(m.title.trim().toLowerCase(), statusObj);
                        }
                    }
                } catch (appErr: any) {
                    console.warn(`[ARR-INDEX] Failed fetching movies from Radarr "${app.name}":`, appErr.message);
                }
            }
        }
    } catch (e: any) {
        console.warn("[ARR-INDEX] Failed resolving Radarr instances:", e.message);
    }

    try {
        const sonarrRes = await getEnabledArrInstancesInternal("sonarr");
        if (sonarrRes.success && sonarrRes.data) {
            const targetApps = sonarrId && sonarrId !== "auto" && sonarrId !== "all"
                ? sonarrRes.data.filter(app => app.id === sonarrId)
                : sonarrRes.data;

            for (const app of targetApps) {
                try {
                    const seriesRes = await arrApiGet(app, "/api/v3/series");
                    const series = seriesRes?.success && Array.isArray(seriesRes.data)
                        ? seriesRes.data
                        : (Array.isArray(seriesRes) ? seriesRes : []);
                    if (series.length > 0) {
                        for (const s of series) {
                            const firstAiredDate = s.firstAired ? new Date(s.firstAired) : null;
                            const hasFile = Boolean(s.statistics?.episodeFileCount && s.statistics.episodeFileCount > 0);
                            const isReleased = Boolean(
                                (firstAiredDate && firstAiredDate <= now) ||
                                s.status !== "upcoming" ||
                                hasFile
                            );

                            const statusObj: ArrItemStatus = {
                                id: s.id,
                                title: s.title,
                                tvdbId: s.tvdbId,
                                imdbId: s.imdbId,
                                monitored: Boolean(s.monitored),
                                hasFile,
                                status: s.status,
                                isReleased,
                                digitalRelease: s.firstAired || s.nextAiring || undefined,
                                appType: "sonarr",
                                appName: app.name
                            };

                            if (s.tvdbId) seriesByTvdb.set(String(s.tvdbId), statusObj);
                            if (s.imdbId) seriesByImdb.set(s.imdbId.trim().toLowerCase(), statusObj);
                            if (s.title) seriesByTitle.set(s.title.trim().toLowerCase(), statusObj);
                        }
                    }
                } catch (appErr: any) {
                    console.warn(`[ARR-INDEX] Failed fetching series from Sonarr "${app.name}":`, appErr.message);
                }
            }
        }
    } catch (e: any) {
        console.warn("[ARR-INDEX] Failed resolving Sonarr instances:", e.message);
    }

    return {
        moviesByTmdb,
        moviesByImdb,
        moviesByTitle,
        seriesByTvdb,
        seriesByImdb,
        seriesByTitle
    };
}

/**
 * Server action to fetch trending media (All, Disney, Disney Kids, Netflix, Netflix Kids, Digital, Theatrical)
 * and compare with Plex and Radarr/Sonarr to identify "In Library", "Monitored (Coming Soon)", or "Released but Not Requested".
 */
export async function getTrendingAndPlaceholderMediaAction(
    serverId?: string,
    sectionKey?: string,
    category: "all" | "disney" | "disney_kids" | "netflix" | "netflix_kids" | "digital" | "theatrical" = "all"
) {
    try {

        await verifyAdmin();
        // 1. Detect section type (Movies vs TV) if server and section are provided
        let isTvSection = false;
        let isMovieSection = false;
        let libraryItems: any[] = [];

        if (serverId && sectionKey) {
            try {
                const resolved = await resolveWorkingPlexServerConnection(serverId);
                if (resolved && resolved.serverUrl) {
                    const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                    const sections = await getPlexServerSections(resolved.token, serverId, resolved.serverUrl);
                    const sec = sections.find(s => String(s.key) === String(sectionKey));
                    isTvSection = sec?.type === "show" || sec?.type === "tv";
                    isMovieSection = sec?.type === "movie";

                    const rawLibraryItems = await getPlexLibraryMediaItems(urlsToTry, resolved.token, sectionKey, 5000);
                    libraryItems = rawLibraryItems.filter(it => {
                        if (isTvSection && it.type === "movie") return false;
                        if (isMovieSection && (it.type === "show" || it.type === "episode")) return false;
                        return true;
                    });
                }
            } catch (err: any) {
                console.warn("[PLACEHOLDER-ACTION] Failed fetching library items for comparison:", err.message);
            }
        }

        let trendingItems: TmdbMediaItem[] = [];

        if (isTvSection) {
            // Strictly fetch TV show trending and catalog for TV sections
            if (category === "disney") {
                trendingItems = await getDisneyTrending(false, 1, "tv");
            } else if (category === "disney_kids") {
                trendingItems = await getDisneyTrending(true, 1, "tv");
            } else if (category === "netflix") {
                trendingItems = await getNetflixTrending(false, 1, "tv");
            } else if (category === "netflix_kids") {
                trendingItems = await getNetflixTrending(true, 1, "tv");
            } else if (category === "digital" || category === "theatrical") {
                trendingItems = await getTmdbPopularTv(1);
            } else {
                trendingItems = await getTmdbTrending("tv", "week");
            }
        } else if (isMovieSection) {
            // Strictly fetch Movie trending and catalog for Movie sections
            if (category === "disney") {
                trendingItems = await getDisneyTrending(false, 1, "movie");
            } else if (category === "disney_kids") {
                trendingItems = await getDisneyTrending(true, 1, "movie");
            } else if (category === "netflix") {
                trendingItems = await getNetflixTrending(false, 1, "movie");
            } else if (category === "netflix_kids") {
                trendingItems = await getNetflixTrending(true, 1, "movie");
            } else if (category === "digital") {
                const upcoming = await getTmdbUpcomingMovies();
                trendingItems = upcoming.filter(it => Boolean(it.digitalReleaseDate));
            } else if (category === "theatrical") {
                trendingItems = await getTmdbNowPlayingMovies();
            } else {
                trendingItems = await getTmdbTrending("movie", "week");
            }
        } else {
            // General / Unfiltered fallback
            if (category === "disney") {
                trendingItems = await getDisneyTrending(false);
            } else if (category === "disney_kids") {
                trendingItems = await getDisneyTrending(true);
            } else if (category === "netflix") {
                trendingItems = await getNetflixTrending(false);
            } else if (category === "netflix_kids") {
                trendingItems = await getNetflixTrending(true);
            } else if (category === "digital") {
                const upcoming = await getTmdbUpcomingMovies();
                trendingItems = upcoming.filter(it => Boolean(it.digitalReleaseDate));
            } else if (category === "theatrical") {
                trendingItems = await getTmdbNowPlayingMovies();
            } else {
                trendingItems = await getTmdbTrending("all", "week");
            }
        }

        // Filter trending items strictly matching the section type
        if (isTvSection) {
            trendingItems = trendingItems.filter(it => it.mediaType === "tv");
        } else if (isMovieSection) {
            trendingItems = trendingItems.filter(it => it.mediaType === "movie");
        }

        // If no items returned (e.g. offline fallback), provide safe empty
        if (!trendingItems || trendingItems.length === 0) {
            return {
                success: true,
                category,
                totalCount: 0,
                inLibraryCount: 0,
                missingCount: 0,
                items: []
            };
        }

        const libraryTmdbIds = new Set(libraryItems.map(it => it.guids?.tmdb).filter(Boolean));
        const libraryImdbIds = new Set(libraryItems.map(it => it.guids?.imdb).filter(Boolean));
        const libraryTitles = new Map(libraryItems.map(it => [it.title?.toLowerCase().trim(), it]));

        // 2. Query Radarr and Sonarr index with server-specific mapping
        const arrIndex = await getArrMonitoredIndex({ targetServerId: serverId });
        const now = new Date();
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        let bannerTemplates: Record<string, { text?: string; theme?: string; pos?: string; fontSize?: number }> = {};
        if (settings?.placeholderBannerTemplates) {
            try { bannerTemplates = JSON.parse(settings.placeholderBannerTemplates); } catch {}
        }

        const formatNiceDate = (dStr?: string) => {
            if (!dStr) return "";
            try {
                const d = new Date(dStr);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            } catch { return dStr; }
        };

        let inLibraryCount = 0;
        const enrichedItems = trendingItems.map(item => {
            const tmdbStr = String(item.id);
            let match = null;

            if (libraryTmdbIds.has(tmdbStr)) {
                match = libraryItems.find(it => it.guids?.tmdb === tmdbStr);
            } else if (item.imdbId && libraryImdbIds.has(item.imdbId)) {
                match = libraryItems.find(it => it.guids?.imdb === item.imdbId);
            } else if (item.title) {
                const clean = item.title.toLowerCase().trim();
                if (libraryTitles.has(clean)) {
                    match = libraryTitles.get(clean);
                }
            }

            const inLibrary = Boolean(match);
            if (inLibrary) inLibraryCount++;

            // Radarr / Sonarr matching isolated by section type
            let arrItem: any = undefined;
            if (isTvSection) {
                arrItem = ((item as any).tvdbId ? arrIndex.seriesByTvdb.get(String((item as any).tvdbId)) : undefined) ||
                          (item.id ? arrIndex.seriesByTvdb.get(String(item.id)) : undefined) ||
                          (item.imdbId ? arrIndex.seriesByImdb.get(item.imdbId.toLowerCase().trim()) : undefined) ||
                          (item.title ? arrIndex.seriesByTitle.get(item.title.toLowerCase().trim()) : undefined);
            } else {
                arrItem = arrIndex.moviesByTmdb.get(tmdbStr) ||
                          (item.imdbId ? arrIndex.moviesByImdb.get(item.imdbId.toLowerCase().trim()) : undefined) ||
                          (item.title ? arrIndex.moviesByTitle.get(item.title.toLowerCase().trim()) : undefined);
            }

            const inRadarr = !isTvSection && arrItem?.appType === "radarr";
            const inSonarr = !isMovieSection && arrItem?.appType === "sonarr";
            const isMonitored = Boolean(arrItem?.monitored);
            const arrHasFile = Boolean(arrItem?.hasFile);

            // Release state
            const relDate = item.releaseDate ? new Date(item.releaseDate) : null;
            const digDate = item.digitalReleaseDate ? new Date(item.digitalReleaseDate) : null;
            const theDate = item.theatricalReleaseDate ? new Date(item.theatricalReleaseDate) : null;
            const isReleased = Boolean(item.inTheaters || (relDate && relDate <= now) || (digDate && digDate <= now) || (theDate && theDate <= now) || arrItem?.isReleased);

            // Smart Banner Suggestion Logic
            let arrStatus: "NOT_REQUESTED" | "COMING_SOON" | "MONITORED_RELEASED" | "IN_LIBRARY" | "UPCOMING_UNREQUESTED";
            let suggestedBannerType = "not_requested_yet";
            let suggestedBannerText = "NOT REQUESTED YET";
            let suggestedBannerTheme = category?.includes("netflix") ? "netflix-red" : "crimson-red";
            let statusBadgeText = "NOT REQUESTED YET";
            let statusBadgeColor = "rose";

            if (inLibrary) {
                arrStatus = "IN_LIBRARY";
                suggestedBannerType = "in_library";
                suggestedBannerText = "IN LIBRARY";
                suggestedBannerTheme = "emerald-green";
                statusBadgeText = "✓ IN LIBRARY";
                statusBadgeColor = "emerald";
            } else if (!isMonitored) {
                // Media item is NOT requested / NOT in Radarr or Sonarr
                arrStatus = "NOT_REQUESTED";
                suggestedBannerType = "not_requested_yet";
                suggestedBannerText = "NOT REQUESTED YET";
                suggestedBannerTheme = category?.includes("netflix") ? "netflix-red" : "crimson-red";
                statusBadgeText = "NOT REQUESTED YET";
                statusBadgeColor = "rose";
            } else if (!isReleased) {
                // Requested / monitored in Radarr or Sonarr, but NOT released yet -> COMING SOON MONITORED
                arrStatus = "COMING_SOON";
                const futureDateStr = item.digitalReleaseDate || arrItem?.digitalRelease || item.releaseDate || arrItem?.physicalRelease || item.theatricalReleaseDate || arrItem?.inCinemas;
                const futureDate = futureDateStr ? new Date(futureDateStr) : null;

                if (futureDate && !isNaN(futureDate.getTime()) && futureDate > now) {
                    const daysToRel = Math.ceil((futureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysToRel > 0 && daysToRel <= 30) {
                        suggestedBannerType = "countdown";
                        suggestedBannerText = `STREAMING IN ${daysToRel} ${daysToRel === 1 ? 'DAY' : 'DAYS'}`;
                        suggestedBannerTheme = "indigo-purple";
                    } else {
                        suggestedBannerType = "digital_release";
                        suggestedBannerText = `DIGITAL RELEASE ON ${formatNiceDate(futureDateStr).toUpperCase()}`;
                        suggestedBannerTheme = "cinematic-blue";
                    }
                } else {
                    suggestedBannerType = "coming_soon_monitored";
                    suggestedBannerText = "COMING SOON MONITORED";
                    suggestedBannerTheme = "amber-gold";
                }
                statusBadgeText = inRadarr ? "IN RADARR (COMING SOON)" : inSonarr ? "IN SONARR (COMING SOON)" : "COMING SOON MONITORED";
                statusBadgeColor = "amber";
            } else {
                // Requested / monitored in Radarr or Sonarr AND already released -> DOWNLOADING SOON
                arrStatus = "MONITORED_RELEASED";
                suggestedBannerType = "downloading_soon";
                suggestedBannerText = "DOWNLOADING SOON";
                suggestedBannerTheme = "emerald-green";
                statusBadgeText = "DOWNLOADING SOON";
                statusBadgeColor = "emerald";
            }

            // Apply custom template override if saved
            const customTpl = bannerTemplates[suggestedBannerType];
            if (customTpl?.text) {
                const daysToRel = item.digitalReleaseDate 
                    ? Math.ceil((new Date(item.digitalReleaseDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    : 14;
                const formattedDate = item.digitalReleaseDate ? formatNiceDate(item.digitalReleaseDate).toUpperCase() : "";
                suggestedBannerText = customTpl.text
                    .replace(/\{date\}/gi, formattedDate)
                    .replace(/\{days\}/gi, String(daysToRel))
                    .replace(/\{days_until\}/gi, String(daysToRel))
                    .replace(/\{title\}/gi, item.title)
                    .replace(/\{year\}/gi, item.releaseDate ? item.releaseDate.split("-")[0] : "")
                    .replace(/\{source\}/gi, category?.includes("netflix") ? "Netflix" : "Streaming")
                    .replace(/\{network\}/gi, category?.includes("netflix") ? "Netflix" : "Streaming")
                    .replace(/\{status\}/gi, "Coming Soon")
                    .replace(/\{reason\}/gi, "Trending Release")
                    .replace(/\{quality\}/gi, "4K UHD")
                    .replace(/\{edition\}/gi, "Director's Cut")
                    .replace(/\{genre\}/gi, (item as any).genres?.[0] || "Action");
            }
            if (customTpl?.theme) {
                suggestedBannerTheme = customTpl.theme;
            }

            const releaseYear = item.releaseDate ? parseInt(item.releaseDate.split("-")[0], 10) : undefined;

            return {
                id: item.id,
                title: item.title,
                originalTitle: item.originalTitle,
                overview: item.overview,
                posterPath: item.posterPath,
                backdropPath: item.backdropPath,
                mediaType: item.mediaType,
                releaseDate: item.releaseDate,
                year: releaseYear,
                theatricalReleaseDate: item.theatricalReleaseDate,
                digitalReleaseDate: item.digitalReleaseDate,
                inTheaters: item.inTheaters,
                voteAverage: item.voteAverage,
                popularity: item.popularity,
                certification: item.certification,
                imdbId: item.imdbId,
                inLibrary,
                libraryRatingKey: match?.ratingKey,
                detectedBadges: match?.detectedBadges,
                // Arr & Monitored Telemetry
                inRadarr,
                inSonarr,
                isMonitored,
                arrHasFile,
                arrStatus,
                isReleased,
                suggestedBannerType,
                suggestedBannerText,
                suggestedBannerTheme,
                statusBadgeText,
                statusBadgeColor
            };
        });

        return {
            success: true,
            category,
            totalCount: enrichedItems.length,
            inLibraryCount,
            missingCount: enrichedItems.length - inLibraryCount,
            items: enrichedItems
        };
    } catch (e: any) {
        return { success: false, error: e.message, items: [] };
    }
}

/**
 * Server action to generate a preview data URL (base64 PNG) of a placeholder poster with banner.
 */
export async function getPlaceholderPreviewDataUrlAction(
    posterUrl: string | null | undefined,
    title: string,
    options: {
        bannerType?: string;
        bannerText?: string;
        bannerTheme?: string;
        bannerPosition?: "top" | "bottom" | "corner" | "middle" | "lower_third" | "upper_third" | "center" | string;
        bannerFontSize?: number;
        fontSize?: number;
        daysRemaining?: number | string;
        formattedDate?: string;
        date?: string;
        source?: string;
        status?: string;
        reason?: string;
        year?: number | string;
        edition?: string;
        genre?: string;
        quality?: string;
        network?: string;
    } = {}
) {
    try {

        await verifyAdmin();
        const buffer = await generatePlaceholderPosterBuffer(posterUrl, title, {
            type: options.bannerType || "not_requested",
            customText: options.bannerText || "NOT REQUESTED",
            theme: options.bannerTheme || "crimson-red",
            position: options.bannerPosition || "bottom",
            bannerFontSize: options.bannerFontSize || options.fontSize,
            fontSize: options.fontSize || options.bannerFontSize,
            daysRemaining: options.daysRemaining ?? 14,
            formattedDate: options.formattedDate || options.date || "10/31/2026",
            date: options.date || options.formattedDate || "10/31/2026",
            source: options.source || options.network || "Plex",
            status: options.status || "Coming Soon",
            reason: options.reason || "Trending Release",
            year: options.year,
            edition: options.edition,
            genre: options.genre,
            quality: options.quality
        });

        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        return { success: true, dataUrl };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Server action to fetch YouTube trailer and video links for a TMDb media item.
 */
export async function getTmdbTrailerAction(tmdbId: number, mediaType: "movie" | "tv" = "movie") {
    try {
        const videos = await getTmdbVideos(tmdbId, mediaType);
        const trailer = videos.find(v => v.type === "Trailer") || videos[0] || null;
        return {
            success: true,
            trailer,
            videos
        };
    } catch (e: any) {
        return { success: false, error: e.message, videos: [] };
    }
}

/**
 * Internal core worker to create/deploy a placeholder item for a title not currently in the Plex library.
 * Writes to the configured coming soon share folder and saves the advisory record.
 */
export async function createPlaceholderItemInternal(
    serverId: string,
    sectionKey: string,
    itemData: {
        tmdbId: number;
        title: string;
        year?: number;
        mediaType: "movie" | "tv";
        posterPath: string | null;
        overview?: string;
        bannerType?: string;
        bannerText?: string;
        bannerTheme?: string;
        bannerPosition?: "top" | "bottom" | "corner" | "middle" | "lower_third" | "upper_third" | "center" | string;
        bannerFontSize?: number;
        fontSize?: number;
        daysRemaining?: number | string;
        formattedDate?: string;
        date?: string;
        source?: string;
        status?: string;
        reason?: string;
        edition?: string;
        genre?: string;
        quality?: string;
        network?: string;
    }
) {
    try {
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        const isTv = itemData.mediaType === "tv";
        let serverStorageConfig: Record<string, any> = {};
        if (settings?.serverStorageConfig) {
            try { serverStorageConfig = JSON.parse(settings.serverStorageConfig); } catch {}
        }
        let comingSoonShares: Record<string, string> = {};
        if (settings?.comingSoonShares) {
            try { comingSoonShares = JSON.parse(settings.comingSoonShares); } catch {}
        }
        const srvConfig = (serverId && serverStorageConfig[serverId]) ? serverStorageConfig[serverId] : null;

        let sharePath = "";
        // 1. Check server-specific TV or Movie path
        if (srvConfig) {
            if (isTv && srvConfig.tvSharePath && fs.existsSync(srvConfig.tvSharePath)) {
                sharePath = srvConfig.tvSharePath;
            } else if (!isTv && srvConfig.movieSharePath && fs.existsSync(srvConfig.movieSharePath)) {
                sharePath = srvConfig.movieSharePath;
            } else if (srvConfig.sharePath && fs.existsSync(srvConfig.sharePath)) {
                sharePath = srvConfig.sharePath;
            }
        }

        // 2. Check comingSoonShares dictionary with media suffix
        if (!sharePath && serverId) {
            const specificKey = isTv ? `${serverId}_tv` : `${serverId}_movie`;
            if (comingSoonShares[specificKey] && fs.existsSync(comingSoonShares[specificKey])) {
                sharePath = comingSoonShares[specificKey];
            } else if (comingSoonShares[serverId] && fs.existsSync(comingSoonShares[serverId])) {
                sharePath = comingSoonShares[serverId];
            }
        }

        // 3. Fallback to any valid share matching media type across all configured servers
        if (!sharePath) {
            for (const cfg of Object.values(serverStorageConfig)) {
                if (isTv && cfg.tvSharePath && fs.existsSync(cfg.tvSharePath)) {
                    sharePath = cfg.tvSharePath;
                    break;
                } else if (!isTv && cfg.movieSharePath && fs.existsSync(cfg.movieSharePath)) {
                    sharePath = cfg.movieSharePath;
                    break;
                }
            }
        }

        // 4. Fallback to generic valid shares
        if (!sharePath) {
            const valid = Object.values(comingSoonShares).find(p => p && fs.existsSync(p));
            if (valid) sharePath = valid;
        }

        // 5. Default isolated local storage
        if (!sharePath) {
            const defaultShare = isTv
                ? path.resolve("./data/coming_soon/tv")
                : path.resolve("./data/coming_soon/movies");
            if (!fs.existsSync(defaultShare)) {
                try { fs.mkdirSync(defaultShare, { recursive: true }); } catch {}
            }
            if (fs.existsSync(defaultShare)) {
                sharePath = defaultShare;
            }
        }

        const bannerText = itemData.bannerText?.trim() || "NOT REQUESTED";
        const bannerType = itemData.bannerType || "not_requested";
        const bannerTheme = itemData.bannerTheme || "crimson-red";
        const bannerPosition = itemData.bannerPosition || "bottom";
        const bannerFontSize = itemData.bannerFontSize || itemData.fontSize || settings?.placeholderBannerFontSize || 44;

        // Lookup official YouTube trailer for the title to write .strm and attach trailer metadata
        let trailerKey = "";
        let trailerUrl = "";
        try {
            const videos = await getTmdbVideos(itemData.tmdbId, itemData.mediaType);
            if (videos && videos.length > 0) {
                const primaryTrailer = videos.find(v => v.type === "Trailer") || videos[0];
                if (primaryTrailer) {
                    trailerKey = primaryTrailer.key;
                    trailerUrl = primaryTrailer.url;
                }
            }
        } catch (e) {}

        // Generate high-resolution composite placeholder poster
        const posterBuffer = await generatePlaceholderPosterBuffer(itemData.posterPath, itemData.title, {
            type: bannerType,
            customText: bannerText,
            theme: bannerTheme,
            position: bannerPosition,
            bannerFontSize,
            fontSize: bannerFontSize,
            daysRemaining: itemData.daysRemaining,
            formattedDate: itemData.formattedDate,
            date: itemData.date,
            source: itemData.source,
            status: itemData.status,
            reason: itemData.reason,
            year: itemData.year,
            edition: itemData.edition,
            genre: itemData.genre,
            quality: itemData.quality
        });

        const cleanTitle = itemData.title.replace(/[\/\\:*?"<>|]/g, "_").trim();
        const yearStr = itemData.year ? ` (${itemData.year})` : "";
        let shareSaved = false;
        let createdFolderPath = "";

        // If a coming soon share is configured, write the placeholder folder structure
        if (sharePath && fs.existsSync(sharePath)) {
            const folderName = `${cleanTitle}${yearStr}`;
            const targetDir = path.join(sharePath, folderName);
            if (!fs.existsSync(targetDir)) {
                fs.mkdirSync(targetDir, { recursive: true });
            }
            try { fs.chmodSync(targetDir, 0o777); } catch {}

            // Save poster.png
            const posterFilePath = path.join(targetDir, "poster.png");
            fs.writeFileSync(posterFilePath, posterBuffer);
            try { fs.chmodSync(posterFilePath, 0o666); } catch {}

            if (isTv) {
                // TV Shows: Create Season 00 specials folder for trailer episode
                const season00Dir = path.join(targetDir, "Season 00");
                if (!fs.existsSync(season00Dir)) {
                    fs.mkdirSync(season00Dir, { recursive: true });
                }
                try { fs.chmodSync(season00Dir, 0o777); } catch {}

                // Save Season 00 poster
                const seasonPoster = path.join(season00Dir, "poster.png");
                fs.writeFileSync(seasonPoster, posterBuffer);
                try { fs.chmodSync(seasonPoster, 0o666); } catch {}

                // Save actual playable MP4 trailer (downloaded from YouTube via yt-dlp or fallback to placeholder.mp4)
                const tvTrailerMp4 = path.join(season00Dir, "S00E00.Trailer.mp4");
                await downloadOrCopyTrailerVideo({
                    title: itemData.title,
                    year: itemData.year,
                    tmdbId: itemData.tmdbId,
                    mediaType: "tv",
                    trailerUrl,
                    destinationPath: tvTrailerMp4
                });

                // Clean up any legacy .strm or .disc files that cause Plex s1001 Network errors
                const staleTvFiles = [
                    path.join(season00Dir, "S00E00.Trailer.strm"),
                    path.join(season00Dir, `S00E00 {tmdb-${itemData.tmdbId}} {edition-Trailer}.strm`),
                    path.join(season00Dir, `S00E00 {tmdb-${itemData.tmdbId}}.disc`)
                ];
                for (const sf of staleTvFiles) {
                    if (fs.existsSync(sf)) {
                        try { fs.unlinkSync(sf); } catch {}
                    }
                }

                // Immunity markers
                const showImmunity = path.join(targetDir, ".portalarr-missing");
                fs.writeFileSync(showImmunity, "portalarr-placeholder");
                try { fs.chmodSync(showImmunity, 0o666); } catch {}

                const seasonImmunity = path.join(season00Dir, ".portalarr-missing");
                fs.writeFileSync(seasonImmunity, "portalarr-placeholder");
                try { fs.chmodSync(seasonImmunity, 0o666); } catch {}

                setPermissionsRecursive(targetDir, 0o777, 0o666);
            } else {
                // Movies: Create Movie folder with actual playable MP4 trailer
                const movieTrailerMp4 = path.join(targetDir, `${cleanTitle}${yearStr} {tmdb-${itemData.tmdbId}} {edition-Trailer}.mp4`);
                await downloadOrCopyTrailerVideo({
                    title: itemData.title,
                    year: itemData.year,
                    tmdbId: itemData.tmdbId,
                    mediaType: "movie",
                    trailerUrl,
                    destinationPath: movieTrailerMp4
                });

                // Clean up any legacy .strm or .disc files that cause Plex s1001 Network errors
                const staleMovieFiles = [
                    path.join(targetDir, `${cleanTitle}${yearStr} {tmdb-${itemData.tmdbId}} {edition-Trailer}.strm`),
                    path.join(targetDir, `${cleanTitle}${yearStr} {tmdb-${itemData.tmdbId}} {edition-Trailer}.disc`)
                ];
                for (const sf of staleMovieFiles) {
                    if (fs.existsSync(sf)) {
                        try { fs.unlinkSync(sf); } catch {}
                    }
                }

                // Immunity marker (.portalarr-missing)
                const immunityMarker = path.join(targetDir, ".portalarr-missing");
                fs.writeFileSync(immunityMarker, "portalarr-placeholder");
                try { fs.chmodSync(immunityMarker, 0o666); } catch {}

                setPermissionsRecursive(targetDir, 0o777, 0o666);
            }

            shareSaved = true;
            createdFolderPath = targetDir;
            logger.addLog("SUCCESS", "CURATION", `Created coming soon placeholder on disk for "${itemData.title}" at "${targetDir}" (playable MP4 trailer)`);
        }

        // Trigger section refresh & tag label trailer-placeholder in Plex if the item is present
        try {
            if (serverId && sectionKey) {
                const resolved = await resolveWorkingPlexServerConnection(serverId);
                if (resolved && resolved.serverUrl) {
                    const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                    await refreshPlexLibrarySection(urlsToTry, resolved.token, sectionKey);

                    const foundItems = await searchPlexLibraryItems(resolved.serverUrl, resolved.token, itemData.title, sectionKey);
                    const match = foundItems.find(it => 
                        it.guids?.tmdb === String(itemData.tmdbId) || 
                        it.title.toLowerCase().trim() === itemData.title.toLowerCase().trim()
                    );
                    if (match?.ratingKey) {
                        await addLabelToPlexItem(urlsToTry, resolved.token, match.ratingKey, "trailer-placeholder");

                        if (!isTv) {
                            await updatePlexItemEdition(urlsToTry, resolved.token, match.ratingKey, "Trailer");
                        } else {
                            const seasons = await getPlexItemChildrenMetadata(urlsToTry, resolved.token, match.ratingKey);
                            const season0 = seasons.find(s => s.index === 0 || s.title?.toLowerCase().includes("specials"));
                            if (season0?.ratingKey) {
                                await addLabelToPlexItem(urlsToTry, resolved.token, String(season0.ratingKey), "trailer-placeholder");
                                const episodes = await getPlexItemChildrenMetadata(urlsToTry, resolved.token, String(season0.ratingKey));
                                const ep0 = episodes.find(e => e.index === 0 || e.title?.toLowerCase().includes("trailer"));
                                if (ep0?.ratingKey) {
                                    if (ep0.title !== "Trailer (Placeholder)") {
                                        await updatePlexItemTitle(urlsToTry, resolved.token, String(ep0.ratingKey), "Trailer (Placeholder)");
                                    }
                                    await addLabelToPlexItem(urlsToTry, resolved.token, String(ep0.ratingKey), "trailer-placeholder");
                                }
                            }
                        }
                    }
                }
            }
        } catch {}

        // Save record into MediaContentAdvisory for tracking and display
        const placeholderKey = `placeholder_tmdb_${itemData.tmdbId}`;
        await prisma.mediaContentAdvisory.upsert({
            where: {
                ratingKey_serverId: {
                    ratingKey: placeholderKey,
                    serverId
                }
            },
            update: {
                title: itemData.title,
                tmdbId: String(itemData.tmdbId),
                leavingReason: `Placeholder: ${bannerText}`,
                customTags: JSON.stringify({
                    isPlaceholder: true,
                    bannerText,
                    bannerTheme,
                    bannerPosition,
                    bannerFontSize,
                    bannerType,
                    mediaType: itemData.mediaType,
                    year: itemData.year,
                    posterPath: itemData.posterPath,
                    sharePath: createdFolderPath || null,
                    trailerKey: trailerKey || null,
                    trailerUrl: trailerUrl || null,
                    createdAt: new Date().toISOString()
                })
            },
            create: {
                ratingKey: placeholderKey,
                serverId,
                title: itemData.title,
                tmdbId: String(itemData.tmdbId),
                leavingReason: `Placeholder: ${bannerText}`,
                customTags: JSON.stringify({
                    isPlaceholder: true,
                    bannerText,
                    bannerTheme,
                    bannerPosition,
                    bannerFontSize,
                    bannerType,
                    mediaType: itemData.mediaType,
                    year: itemData.year,
                    posterPath: itemData.posterPath,
                    sharePath: createdFolderPath || null,
                    trailerKey: trailerKey || null,
                    trailerUrl: trailerUrl || null,
                    createdAt: new Date().toISOString()
                })
            }
        });

        const dataUrl = `data:image/png;base64,${posterBuffer.toString("base64")}`;

        return {
            success: true,
            title: itemData.title,
            bannerText,
            shareSaved,
            folderPath: createdFolderPath,
            dataUrl,
            trailerUrl: trailerUrl || null,
            trailerKey: trailerKey || null,
            message: shareSaved 
                ? `Created placeholder "${itemData.title}" on disk${trailerUrl ? " with YouTube trailer" : ""}!` 
                : `Generated placeholder poster for "${itemData.title}". (Note: Configure Coming Soon Share folder to write .strm trailer files to disk).`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Server action to create/deploy a placeholder item for a title not currently in the Plex library.
 */
export async function createPlaceholderItemAction(
    serverId: string,
    sectionKey: string,
    itemData: {
        tmdbId: number;
        title: string;
        year?: number;
        mediaType: "movie" | "tv";
        posterPath: string | null;
        overview?: string;
        bannerType?: string;
        bannerText?: string;
        bannerTheme?: string;
        bannerPosition?: "top" | "bottom" | "corner" | "middle" | "lower_third" | "upper_third" | "center" | string;
        bannerFontSize?: number;
        fontSize?: number;
        daysRemaining?: number | string;
        formattedDate?: string;
        date?: string;
        source?: string;
        status?: string;
        reason?: string;
        edition?: string;
        genre?: string;
        quality?: string;
        network?: string;
    }
) {
    try {
        await verifyAdmin();
        return await createPlaceholderItemInternal(serverId, sectionKey, itemData);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Create placeholder failed: ${e.message}`);
        return { success: false, error: e.message || "Create placeholder failed" } as any;
    }
}

/**
 * Internal worker to batch-generate Coming Soon placeholder trailers & banner posters for missing items in a collection.
 */
export async function generateCollectionPlaceholdersInternal(collection: any): Promise<{ success: boolean; generatedCount: number; message: string; error?: string }> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const comingSoonShares: Record<string, string> = settings?.comingSoonShares 
            ? JSON.parse(settings.comingSoonShares) 
            : {};

        const serverId = collection.serverId || "main";
        let isTvSection = false;
        let isMovieSection = false;

        // Auto-cleanup any previously created placeholders whose full media is now available in Plex
        try {
            await cleanupAvailablePlaceholdersInternal(collection.serverId || undefined, collection.sectionKey || undefined);
        } catch (cleanErr: any) {
            console.warn("[COLL-PLACEHOLDER] Error during placeholder auto-cleanup:", cleanErr.message);
        }

        // 1. Fetch library items to know what is already present in Plex and detect Section Type
        let libraryItems: any[] = [];
        if (collection.serverId && collection.sectionKey) {
            try {
                const resolved = await resolveWorkingPlexServerConnection(collection.serverId);
                if (resolved && resolved.serverUrl) {
                    const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                    const sections = await getPlexServerSections(resolved.token, collection.serverId, resolved.serverUrl);
                    const sec = sections.find(s => String(s.key) === String(collection.sectionKey));
                    isTvSection = sec?.type === "show" || sec?.type === "tv";
                    isMovieSection = sec?.type === "movie";

                    const rawLibraryItems = await getPlexLibraryMediaItems(urlsToTry, resolved.token, collection.sectionKey, 5000, undefined, false);
                    libraryItems = rawLibraryItems.filter(it => {
                        if (isTvSection && it.type === "movie") return false;
                        if (isMovieSection && (it.type === "show" || it.type === "episode")) return false;
                        return true;
                    });
                }
            } catch (err: any) {
                console.warn("[COLL-PLACEHOLDER] Failed fetching library items:", err.message);
            }
        }

        const libraryTmdbIds = new Set(libraryItems.map(it => it.guids?.tmdb).filter(Boolean));
        const libraryImdbIds = new Set(libraryItems.map(it => it.guids?.imdb).filter(Boolean));
        const libraryTitles = new Set(libraryItems.map(it => it.title?.toLowerCase().trim()).filter(Boolean));

        // 2. Fetch candidates from Collection Source Query with strict section type isolation
        let candidateItems: any[] = [];
        const tmdbKey = await getTmdbApiKey();

        if (collection.sourceType === "tmdb") {
            if (collection.sourceQuery?.startsWith("collection:")) {
                const collId = collection.sourceQuery.replace("collection:", "");
                const tmdbRes = await fetch(`https://api.themoviedb.org/3/collection/${collId}?api_key=${tmdbKey}`);
                if (tmdbRes.ok) {
                    const data = await tmdbRes.json();
                    candidateItems = (data.parts || [])
                        .filter((p: any) => {
                            if (isTvSection && p.media_type === "movie") return false;
                            if (isMovieSection && p.media_type === "tv") return false;
                            return true;
                        })
                        .map((p: any) => ({
                            id: p.id,
                            title: p.title,
                            overview: p.overview,
                            posterPath: p.poster_path,
                            backdropPath: p.backdrop_path,
                            mediaType: (p.media_type === "tv" ? "tv" : "movie") as "movie" | "tv",
                            releaseDate: p.release_date
                        }));
                }
            } else if (collection.sourceQuery?.startsWith("company:")) {
                const compId = collection.sourceQuery.replace("company:", "");
                if (!isTvSection) {
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&with_companies=${compId}&sort_by=primary_release_date.desc&page=1`);
                    if (tmdbRes.ok) {
                        const data = await tmdbRes.json();
                        candidateItems = (data.results || []).map((p: any) => ({
                            id: p.id,
                            title: p.title,
                            overview: p.overview,
                            posterPath: p.poster_path,
                            backdropPath: p.backdrop_path,
                            mediaType: "movie" as const,
                            releaseDate: p.release_date
                        }));
                    }
                }
            } else if (collection.sourceQuery?.startsWith("network:")) {
                const netId = parseInt(collection.sourceQuery.replace("network:", ""), 10) || 213;
                if (!isMovieSection) {
                    const shows = await getTmdbNetworkShows(netId);
                    candidateItems = shows.map(s => ({
                        id: s.id,
                        title: s.title,
                        overview: s.overview,
                        posterPath: s.posterPath,
                        backdropPath: s.backdropPath,
                        mediaType: "tv" as const,
                        releaseDate: s.releaseDate
                    }));
                }
            } else if (collection.sourceQuery?.startsWith("provider:")) {
                const parts = collection.sourceQuery.split(":");
                const provId = parseInt(parts[1], 10) || 8;
                const isKids = parts.length > 2 && parts[2] === "kids";
                const providerMedia = await getTmdbStreamingProviderMedia(provId, { 
                    isKids, 
                    mediaType: isTvSection ? "tv" : isMovieSection ? "movie" : "both" 
                });
                candidateItems = providerMedia;
            } else if (collection.sourceQuery === "digital_releases") {
                candidateItems = isTvSection 
                    ? await getTmdbPopularTv(1)
                    : await getTmdbUpcomingMovies();
            } else if (collection.sourceQuery === "in_theatres") {
                const inTheatres = await getTmdbNowPlayingMovies();
                candidateItems = inTheatres.map(m => ({
                    id: m.id,
                    title: m.title,
                    overview: m.overview,
                    posterPath: m.posterPath,
                    backdropPath: m.backdropPath,
                    mediaType: "movie" as const,
                    releaseDate: m.releaseDate,
                    inTheaters: true
                }));
            } else {
                candidateItems = await getTmdbTrending(isTvSection ? "tv" : isMovieSection ? "movie" : "all", "week");
            }
        } else if (collection.sourceType === "trakt") {
            if (collection.sourceQuery === "trending") {
                const trending = isTvSection 
                    ? await getTraktTrendingShows(40)
                    : await getTraktTrendingMovies(40);
                candidateItems = trending.map((t: any) => ({
                    id: t.tmdbId || t.id,
                    title: t.title,
                    mediaType: (isTvSection ? "tv" : "movie") as "movie" | "tv",
                    releaseDate: t.year ? `${t.year}-01-01` : undefined,
                    imdbId: t.imdbId
                }));
            } else if (collection.sourceQuery === "anticipated") {
                const anticipated = isTvSection
                    ? await getTraktAnticipatedShows(40)
                    : await getTraktAnticipatedMovies(40);
                candidateItems = anticipated.map((t: any) => ({
                    id: t.tmdbId || t.id,
                    title: t.title,
                    mediaType: (isTvSection ? "tv" : "movie") as "movie" | "tv",
                    releaseDate: t.year ? `${t.year}-01-01` : undefined,
                    imdbId: t.imdbId
                }));
            } else if (collection.sourceQuery) {
                const listData = await getTraktUserList(collection.sourceQuery);
                if (listData?.items) {
                    candidateItems = listData.items
                        .filter(t => {
                            if (isTvSection && t.mediaType === "movie") return false;
                            if (isMovieSection && (t.mediaType === "show" || (t as any).mediaType === "tv")) return false;
                            return true;
                        })
                        .map((t: any) => ({
                            id: t.tmdbId || t.id,
                            title: t.title,
                            mediaType: (t.mediaType === "show" || t.mediaType === "tv" ? "tv" : "movie") as "movie" | "tv",
                            releaseDate: t.year ? `${t.year}-01-01` : undefined,
                            imdbId: t.imdbId
                        }));
                }
            }
        } else if (collection.sourceType === "radarr") {
            try {
                const arrRes = await getEnabledArrInstancesInternal("radarr");
                if (arrRes.success && arrRes.data && arrRes.data.length > 0) {
                    for (const app of arrRes.data) {
                        const moviesRes = await arrApiGet(app, "/api/v3/movie");
                        if (moviesRes.success && Array.isArray(moviesRes.data)) {
                            let movies = moviesRes.data;
                            if (collection.sourceQuery === "monitored_missing") {
                                movies = movies.filter((m: any) => m.monitored && !m.hasFile);
                            } else if (collection.sourceQuery?.startsWith("tag:")) {
                                const targetTag = collection.sourceQuery.replace("tag:", "").toLowerCase().trim();
                                const tagsRes = await arrApiGet(app, "/api/v3/tag");
                                const tagId = tagsRes.success ? tagsRes.data?.find((t: any) => t.label.toLowerCase() === targetTag)?.id : null;
                                if (tagId) movies = movies.filter((m: any) => m.tags?.includes(tagId));
                            }
                            candidateItems.push(...movies.map((m: any) => ({
                                id: m.tmdbId,
                                title: m.title,
                                overview: m.overview,
                                posterPath: m.images?.find((img: any) => img.coverType === "poster")?.remoteUrl || null,
                                mediaType: "movie" as const,
                                releaseDate: m.digitalRelease || m.physicalRelease || m.inCinemas || (m.year ? `${m.year}-01-01` : undefined),
                                digitalReleaseDate: m.digitalRelease || undefined,
                                theatricalReleaseDate: m.inCinemas || undefined,
                                imdbId: m.imdbId
                            })));
                        }
                    }
                }
            } catch (rErr: any) {
                console.warn("[RADARR-PLACEHOLDER] Error fetching movies:", rErr.message);
            }
        } else if (collection.sourceType === "sonarr") {
            try {
                const arrRes = await getEnabledArrInstancesInternal("sonarr");
                if (arrRes.success && arrRes.data && arrRes.data.length > 0) {
                    for (const app of arrRes.data) {
                        const seriesRes = await arrApiGet(app, "/api/v3/series");
                        if (seriesRes.success && Array.isArray(seriesRes.data)) {
                            let series = seriesRes.data;
                            if (collection.sourceQuery === "monitored_missing") {
                                series = series.filter((s: any) => s.monitored && (s.statistics?.episodeFileCount === 0 || s.statistics?.percentOfEpisodes < 100));
                            } else if (collection.sourceQuery?.startsWith("tag:")) {
                                const targetTag = collection.sourceQuery.replace("tag:", "").toLowerCase().trim();
                                const tagsRes = await arrApiGet(app, "/api/v3/tag");
                                const tagId = tagsRes.success ? tagsRes.data?.find((t: any) => t.label.toLowerCase() === targetTag)?.id : null;
                                if (tagId) series = series.filter((s: any) => s.tags?.includes(tagId));
                            }
                            candidateItems.push(...series.map((s: any) => ({
                                id: s.tvdbId,
                                title: s.title,
                                overview: s.overview,
                                posterPath: s.images?.find((img: any) => img.coverType === "poster")?.remoteUrl || null,
                                mediaType: "tv" as const,
                                releaseDate: s.firstAired || (s.year ? `${s.year}-01-01` : undefined),
                                digitalReleaseDate: s.firstAired || undefined,
                                imdbId: s.imdbId
                            })));
                        }
                    }
                }
            } catch (sErr: any) {
                console.warn("[SONARR-PLACEHOLDER] Error fetching series:", sErr.message);
            }
        } else if (collection.sourceType === "mdblist") {
            if (collection.sourceQuery) {
                const items = await getMdblistItems(collection.sourceQuery);
                if (items && items.length > 0) {
                    candidateItems = items
                        .filter(t => {
                            if (isTvSection && t.mediaType === "movie") return false;
                            if (isMovieSection && (t.mediaType === "show" || (t as any).mediaType === "tv")) return false;
                            return true;
                        })
                        .map((t: any) => ({
                            id: t.tmdbId || t.id,
                            title: t.title,
                            mediaType: (t.mediaType === "show" || t.mediaType === "tv" ? "tv" : "movie") as "movie" | "tv",
                            releaseDate: t.year ? `${t.year}-01-01` : undefined,
                            imdbId: t.imdbId
                        }));
                }
            }

            if (candidateItems.length === 0 && (collection.title?.toLowerCase().includes("top 250") || collection.sourceQuery?.includes("250") || collection.sourceQuery?.includes("top-imdb"))) {
                const builtinList = getBuiltinImdbTopList(isTvSection ? "show" : "movie");
                candidateItems = builtinList.map(b => ({
                    id: b.tmdbId,
                    title: b.title,
                    mediaType: (b.mediaType === "show" ? "tv" : "movie") as "movie" | "tv",
                    releaseDate: `${b.year}-01-01`,
                    imdbId: b.imdbId
                }));
            }
        }

        // Strict mediaType filter on candidate items
        if (isTvSection) {
            candidateItems = candidateItems.filter(item => item.mediaType === "tv");
        } else if (isMovieSection) {
            candidateItems = candidateItems.filter(item => item.mediaType === "movie");
        }

        // 3. Filter candidate items to only those MISSING from the library
        const missingCandidates = candidateItems.filter(item => {
            const tmdbStr = String(item.id);
            const inLib = libraryTmdbIds.has(tmdbStr) || 
                          (item.imdbId && libraryImdbIds.has(item.imdbId)) ||
                          (item.title && libraryTitles.has(item.title.toLowerCase().trim()));
            return !inLib;
        });

        // Limit count if maxItems is set
        const maxPlaceholders = collection.maxItems && collection.maxItems > 0 ? collection.maxItems : 20;
        const itemsToGenerate = missingCandidates.slice(0, maxPlaceholders);

        if (itemsToGenerate.length === 0) {
            return {
                success: true,
                generatedCount: 0,
                message: `All ${candidateItems.length} items in collection "${collection.title}" already exist in your library!`
            };
        }

        // 4. Query Radarr and Sonarr monitored index with server-specific mapping
        const arrIndex = await getArrMonitoredIndex({ targetServerId: collection.serverId });
        const now = new Date();
        const placeholderDaysThreshold = settings?.placeholderDaysThreshold ?? 90;
        let bannerTemplates: Record<string, { text?: string; theme?: string; pos?: string; fontSize?: number }> = {};
        if (settings?.placeholderBannerTemplates) {
            try { bannerTemplates = JSON.parse(settings.placeholderBannerTemplates); } catch {}
        }
        let generatedCount = 0;

        for (const item of itemsToGenerate) {
            try {
                const tmdbStr = String(item.id);
                let arrItem: ArrItemStatus | undefined;
                if (item.mediaType === "tv") {
                    arrItem = (item.id ? arrIndex.seriesByTvdb.get(String(item.id)) : undefined) ||
                              (item.imdbId ? arrIndex.seriesByImdb.get(item.imdbId.toLowerCase().trim()) : undefined) ||
                              (item.title ? arrIndex.seriesByTitle.get(item.title.toLowerCase().trim()) : undefined);
                } else {
                    arrItem = arrIndex.moviesByTmdb.get(tmdbStr) ||
                              (item.imdbId ? arrIndex.moviesByImdb.get(item.imdbId.toLowerCase().trim()) : undefined) ||
                              (item.title ? arrIndex.moviesByTitle.get(item.title.toLowerCase().trim()) : undefined);
                }

                const inRadarr = arrItem?.appType === "radarr" || collection.sourceType === "radarr";
                const inSonarr = arrItem?.appType === "sonarr" || collection.sourceType === "sonarr";
                const isMonitored = Boolean(arrItem?.monitored) || collection.sourceType === "radarr" || collection.sourceType === "sonarr";

                const relDate = item.releaseDate ? new Date(item.releaseDate) : null;
                const digDate = item.digitalReleaseDate ? new Date(item.digitalReleaseDate) : null;
                const theDate = item.theatricalReleaseDate ? new Date(item.theatricalReleaseDate) : null;

                // Threshold Check: If release date is further into the future than placeholderDaysThreshold, skip!
                const futureTargetDate = digDate || relDate || theDate;
                if (futureTargetDate && futureTargetDate > now && placeholderDaysThreshold > 0) {
                    const daysToRelease = Math.ceil((futureTargetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysToRelease > placeholderDaysThreshold) {
                        continue;
                    }
                }

                const isReleased = Boolean(item.inTheaters || (relDate && relDate <= now) || (digDate && digDate <= now) || (theDate && theDate <= now) || arrItem?.isReleased);

                let bannerText = "NOT REQUESTED YET";
                let bannerTheme = (collection.sourceQuery?.includes("netflix") || collection.title?.toLowerCase().includes("netflix")) ? "netflix-red" : "crimson-red";
                let bannerType = "not_requested_yet";

                if (!isMonitored) {
                    // Not in Radarr or Sonarr -> NOT REQUESTED YET
                    bannerText = "NOT REQUESTED YET";
                    bannerTheme = (collection.sourceQuery?.includes("netflix") || collection.title?.toLowerCase().includes("netflix")) ? "netflix-red" : "crimson-red";
                    bannerType = "not_requested_yet";
                } else if (!isReleased) {
                    // Monitored in Radarr/Sonarr, but unreleased -> COMING SOON MONITORED
                    const futureDateStr = item.digitalReleaseDate || arrItem?.digitalRelease || item.releaseDate || arrItem?.physicalRelease || item.theatricalReleaseDate || arrItem?.inCinemas;
                    const futureDate = futureDateStr ? new Date(futureDateStr) : null;

                    if (futureDate && !isNaN(futureDate.getTime()) && futureDate > now) {
                        const daysToRel = Math.ceil((futureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                        if (daysToRel > 0 && daysToRel <= 30) {
                            bannerText = `STREAMING IN ${daysToRel} ${daysToRel === 1 ? 'DAY' : 'DAYS'}`;
                            bannerTheme = "indigo-purple";
                            bannerType = "countdown";
                        } else {
                            bannerText = `DIGITAL RELEASE ON ${futureDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()}`;
                            bannerTheme = "cinematic-blue";
                            bannerType = "digital_release";
                        }
                    } else {
                        bannerText = "COMING SOON MONITORED";
                        bannerTheme = "amber-gold";
                        bannerType = "coming_soon_monitored";
                    }
                } else {
                    // Monitored in Radarr/Sonarr and already released -> DOWNLOADING SOON
                    bannerText = "DOWNLOADING SOON";
                    bannerTheme = "emerald-green";
                    bannerType = "downloading_soon";
                }

                const customTpl = bannerTemplates[bannerType];
                if (customTpl?.text) {
                    const futureDateStr = item.digitalReleaseDate || arrItem?.digitalRelease || item.releaseDate || arrItem?.physicalRelease || item.theatricalReleaseDate || arrItem?.inCinemas;
                    const futureDate = futureDateStr ? new Date(futureDateStr) : null;
                    const daysToRel = (futureDate && !isNaN(futureDate.getTime()) && futureDate > now)
                        ? Math.ceil((futureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                        : 14;
                    const dateFormatted = (futureDate && !isNaN(futureDate.getTime()))
                        ? futureDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }).toUpperCase()
                        : "";
                    bannerText = customTpl.text
                        .replace(/\{date\}/gi, dateFormatted)
                        .replace(/\{days\}/gi, String(daysToRel))
                        .replace(/\{days_until\}/gi, String(daysToRel))
                        .replace(/\{title\}/gi, item.title)
                        .replace(/\{year\}/gi, relDate ? String(relDate.getFullYear()) : "")
                        .replace(/\{source\}/gi, collection.sourceQuery?.includes("netflix") ? "Netflix" : "Streaming")
                        .replace(/\{network\}/gi, collection.sourceQuery?.includes("netflix") ? "Netflix" : "Streaming")
                        .replace(/\{status\}/gi, "Coming Soon")
                        .replace(/\{reason\}/gi, "Collection Feature")
                        .replace(/\{quality\}/gi, "4K UHD")
                        .replace(/\{edition\}/gi, "Director's Cut");
                }
                if (customTpl?.theme) {
                    bannerTheme = customTpl.theme;
                }
                const bannerPosition = (customTpl?.pos || "bottom") as "bottom" | "top" | "corner";
                const bannerFontSize = customTpl?.fontSize || settings?.placeholderBannerFontSize || 44;

                const year = item.releaseDate ? parseInt(item.releaseDate.split("-")[0], 10) : undefined;

                await createPlaceholderItemInternal(serverId, collection.sectionKey || "", {
                    tmdbId: item.id,
                    title: item.title,
                    year,
                    mediaType: item.mediaType || "movie",
                    posterPath: item.posterPath || null,
                    overview: item.overview,
                    bannerText,
                    bannerType,
                    bannerTheme,
                    bannerPosition,
                    bannerFontSize
                });

                generatedCount++;
            } catch (itemErr: any) {
                console.warn(`[COLL-PLACEHOLDER] Error generating placeholder for "${item.title}":`, itemErr.message);
            }
        }

        // Trigger Plex section refresh & run placeholder labeling sweep
        try {
            if (collection.serverId && collection.sectionKey) {
                const resolved = await resolveWorkingPlexServerConnection(collection.serverId);
                if (resolved?.serverUrl) {
                    const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                    await refreshPlexLibrarySection(urlsToTry, resolved.token, collection.sectionKey);
                }
            }
            await tagAllPlaceholdersInPlexInternal(collection.serverId, collection.sectionKey);
        } catch (sweepErr: any) {
            console.warn(`[PLACEHOLDERS] Post-generation labeling sweep error:`, sweepErr.message);
        }

        logger.addLog("SUCCESS", "CURATION", `Generated ${generatedCount} placeholders for collection "${collection.title}".`);

        return {
            success: true,
            generatedCount,
            message: `Generated ${generatedCount} placeholder trailers & banner posters for collection "${collection.title}" in your Coming Soon share!`
        };
    } catch (e: any) {
        return { success: false, generatedCount: 0, message: e.message, error: e.message };
    }
}

/**
 * Server action to manually trigger placeholder generation for a collection
 */
export async function generateCollectionPlaceholdersAction(collectionId: string) {
    try {

        await verifyAdmin();
        const collection = await prisma.mediaCollection.findUnique({ where: { id: collectionId } });
        if (!collection) return { success: false, error: "Collection not found.", message: "Collection not found." };
        return await generateCollectionPlaceholdersInternal(collection);
    } catch (e: any) {
        return { success: false, error: e.message, message: e.message };
    }
}

/**
 * Master worker to scan Plex library sections, detect all placeholder items (by file path, edition-Trailer, 
 * Coming Soon share location, or advisory placeholder records), and tag them with Plex label "trailer-placeholder".
 * Also ensures TV show placeholder episodes (S00E00) are titled "Trailer (Placeholder)" and tagged.
 */
export async function tagAllPlaceholdersInPlexInternal(
    targetServerId?: string,
    targetSectionKey?: string
): Promise<{ success: boolean; taggedCount: number; message: string }> {
    try {
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        let serverStorageConfig: Record<string, any> = {};
        if (settings?.serverStorageConfig) {
            try { serverStorageConfig = JSON.parse(settings.serverStorageConfig); } catch {}
        }
        let comingSoonShares: Record<string, string> = {};
        if (settings?.comingSoonShares) {
            try { comingSoonShares = JSON.parse(settings.comingSoonShares); } catch {}
        }

        // Collect all known placeholder advisory records from database
        const placeholderAdvisories = await prisma.mediaContentAdvisory.findMany({
            where: {
                OR: [
                    { ratingKey: { startsWith: "placeholder_tmdb_" } },
                    { leavingReason: { startsWith: "Placeholder:" } },
                    { customTags: { contains: '"isPlaceholder":true' } }
                ]
            }
        });

        const placeholderTmdbSet = new Set<string>();
        const placeholderTitleSet = new Set<string>();
        for (const adv of placeholderAdvisories) {
            if (adv.tmdbId) placeholderTmdbSet.add(String(adv.tmdbId));
            if (adv.title) placeholderTitleSet.add(adv.title.toLowerCase().trim());
        }

        // Gather all share directory paths to identify files in Coming Soon shares
        const shareDirPaths: string[] = [];
        for (const p of Object.values(comingSoonShares)) {
            if (p) shareDirPaths.push(path.normalize(p).toLowerCase());
        }
        for (const cfg of Object.values(serverStorageConfig)) {
            if (cfg.tvSharePath) shareDirPaths.push(path.normalize(cfg.tvSharePath).toLowerCase());
            if (cfg.movieSharePath) shareDirPaths.push(path.normalize(cfg.movieSharePath).toLowerCase());
            if (cfg.sharePath) shareDirPaths.push(path.normalize(cfg.sharePath).toLowerCase());
        }

        const mainToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        const plexServers = mainToken ? await getPlexServers(mainToken) : [];
        let serverIds = targetServerId ? [targetServerId] : plexServers.map(s => s.clientIdentifier);
        if (serverIds.length === 0 && targetServerId) serverIds = [targetServerId];
        if (serverIds.length === 0 && Object.keys(serverStorageConfig).length > 0) {
            serverIds = Object.keys(serverStorageConfig);
        }
        let totalTagged = 0;

        for (const srvId of serverIds) {
            const resolved = await resolveWorkingPlexServerConnection(srvId);
            if (!resolved || !resolved.serverUrl) continue;
            const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
            const token = resolved.token;

            const sections = await getPlexServerSections(token, srvId, resolved.serverUrl);
            const filteredSections = targetSectionKey 
                ? sections.filter(s => String(s.key) === String(targetSectionKey))
                : sections;

            for (const sec of filteredSections) {
                const secKey = String(sec.key);
                const isTv = sec.type === "show" || sec.type === "tv";

                // Fetch all items from the library section (do NOT exclude placeholders, as we want to find and tag them)
                const items = await getPlexLibraryMediaItems(urlsToTry, token, secKey, 10000, undefined, true, false);

                for (const item of items) {
                    const fileLower = (item.filePath || "").toLowerCase();
                    const titleLower = (item.title || "").toLowerCase().trim();
                    const tmdbIdStr = item.guids?.tmdb ? String(item.guids.tmdb) : "";

                    // Check if this item is a placeholder trailer
                    const isInComingSoonShare = shareDirPaths.some(sp => fileLower.includes(sp)) || 
                                                fileLower.includes("/coming_soon/") || 
                                                fileLower.includes("\\coming_soon\\");
                    const hasTrailerName = fileLower.includes("edition-trailer") || 
                                           fileLower.includes("edition-placeholder") || 
                                           fileLower.includes("s00e00") || 
                                           fileLower.endsWith(".disc") || 
                                           fileLower.endsWith(".strm") || 
                                           fileLower.includes(".portalarr-missing");
                    const isKnownTmdb = Boolean(tmdbIdStr && placeholderTmdbSet.has(tmdbIdStr));
                    const isKnownTitle = placeholderTitleSet.has(titleLower);
                    const isStubSize = Boolean(item.fileSize && item.fileSize > 0 && item.fileSize < 1000000);

                    const isPlaceholderItem = item.isPlaceholder || 
                                              isInComingSoonShare || 
                                              hasTrailerName || 
                                              (isKnownTmdb && (isInComingSoonShare || hasTrailerName || isStubSize)) ||
                                              (isKnownTitle && (isInComingSoonShare || hasTrailerName || isStubSize));

                    if (isPlaceholderItem) {
                        // 1. Tag item with trailer-placeholder label in Plex
                        const hasLabel = item.labels?.some(l => l.toLowerCase() === "trailer-placeholder");
                        if (!hasLabel) {
                            const success = await addLabelToPlexItem(urlsToTry, token, item.ratingKey, "trailer-placeholder");
                            if (success) totalTagged++;
                        }

                        // 2. If movie: set editionTitle to "Trailer" in Plex
                        if (!isTv && item.type !== "show") {
                            await updatePlexItemEdition(urlsToTry, token, item.ratingKey, "Trailer");
                        }

                        // 3. If TV show: inspect Season 00 / S00E00
                        if (isTv || item.type === "show") {
                            try {
                                const seasons = await getPlexItemChildrenMetadata(urlsToTry, token, item.ratingKey);
                                const season0 = seasons.find(s => s.index === 0 || s.title?.toLowerCase().includes("specials"));
                                if (season0?.ratingKey) {
                                    await addLabelToPlexItem(urlsToTry, token, String(season0.ratingKey), "trailer-placeholder");
                                    const episodes = await getPlexItemChildrenMetadata(urlsToTry, token, String(season0.ratingKey));
                                    const ep0 = episodes.find(e => e.index === 0 || e.title?.toLowerCase().includes("trailer"));
                                    if (ep0?.ratingKey) {
                                        if (ep0.title !== "Trailer (Placeholder)") {
                                            await updatePlexItemTitle(urlsToTry, token, String(ep0.ratingKey), "Trailer (Placeholder)");
                                        }
                                        await addLabelToPlexItem(urlsToTry, token, String(ep0.ratingKey), "trailer-placeholder");
                                    }
                                }
                            } catch {}
                        }
                    }
                }
            }
        }

        logger.addLog("SUCCESS", "CURATION", `Placeholder sweep completed: verified and tagged ${totalTagged} items with "trailer-placeholder" in Plex.`);
        return {
            success: true,
            taggedCount: totalTagged,
            message: `Verified and labeled ${totalTagged} placeholder trailers with "trailer-placeholder" in Plex.`
        };
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Error in tagAllPlaceholdersInPlexInternal: ${e.message}`);
        return { success: false, taggedCount: 0, message: e.message };
    }
}

/**
 * Server action to tag all placeholder items in Plex with "trailer-placeholder"
 */
export async function tagAllPlaceholdersInPlexAction(
    serverId?: string,
    sectionKey?: string
) {
    try {
        await verifyAdmin();
        return await tagAllPlaceholdersInPlexInternal(serverId, sectionKey);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Tag placeholders failed: ${e.message}`);
        return { success: false, error: e.message || "Tag placeholders failed" } as any;
    }
}

/**
 * Server action to deploy a Filtered Smart Collection (Recently Added, Recently Released, Top Unwatched)
 * to Plex for a library section and persist in Active Collections table.
 * Replaces or overrides Plex's raw un-filtered hubs so coming soon trailer placeholders never appear in carousels.
 */
export type FilteredHubSubtype = "recently_added" | "recently_released" | "recently_released_episodes" | "top_unwatched";

export async function deployFilteredSmartHubAction(
    serverId: string,
    sectionKey: string,
    subtype: FilteredHubSubtype = "recently_added",
    customTitle?: string,
    maxItems: number = 25
): Promise<{ success: boolean; message: string; error?: string; collectionRatingKey?: string }> {
    try {

        await verifyAdmin();

        await ensureSchemaColumns();
        // Step 1: Run placeholder sweep to ensure all existing placeholders on this server are tagged with trailer-placeholder label
        try {
            await tagAllPlaceholdersInPlexInternal(serverId, sectionKey);
        } catch (sweepErr: any) {
            console.warn(`[FILTERED-HUB] Pre-deploy placeholder labeling sweep error:`, sweepErr.message);
        }

        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) {
            throw new Error(`Cannot connect to Plex server ${serverId}`);
        }
        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
        const token = resolved.token;

        // Get section details to know whether it is Movies (type=1) or TV (type=2)
        const sections = await getPlexServerSections(token, serverId, resolved.serverUrl);
        const section = sections.find(s => String(s.key) === String(sectionKey));
        const isTv = section?.type === "show" || section?.type === "tv";
        const mediaTypeNum = isTv ? 2 : 1;

        // Validate subtype compatibility
        if (subtype === "recently_released_episodes" && !isTv) {
            return { success: false, message: "Recently Released Episodes hub is only supported for TV libraries." };
        }

        // Determine Default Title
        let defaultTitle = customTitle || "";
        let defaultSummary = "Filtered smart collection without trailer placeholders.";
        let sortPrefix = "!00_Recent";

        if (!defaultTitle) {
            if (subtype === "recently_added") {
                defaultTitle = isTv ? "Recently Added TV (Curated)" : "Recently Added Movies (Curated)";
                defaultSummary = "Recently added media excluding coming soon trailer placeholders.";
                sortPrefix = "!00_Recent";
            } else if (subtype === "recently_released") {
                defaultTitle = isTv ? "Recently Released TV (Curated)" : "Recently Released Movies (Curated)";
                defaultSummary = "Recently released media sorted by original release date, excluding placeholder stubs.";
                sortPrefix = "!01_Released";
            } else if (subtype === "recently_released_episodes") {
                defaultTitle = "Recently Released Episodes (Curated)";
                defaultSummary = "TV shows sorted by latest episode air date, excluding placeholder stubs.";
                sortPrefix = "!01_Released";
            } else if (subtype === "top_unwatched") {
                defaultTitle = isTv ? "Top Unwatched TV (Curated)" : "Top Unwatched Movies (Curated)";
                defaultSummary = "Top unwatched media personalized per user, excluding placeholder stubs.";
                sortPrefix = "!02_Unwatched";
            }
        }

        // Build Filter URI that excludes placeholders
        let filterUri = "";
        const trailerLabel = encodeURIComponent("trailer-placeholder");
        const trailerTitle = encodeURIComponent("Trailer (Placeholder)");
        const limitParam = (maxItems && maxItems > 0) ? `&limit=${maxItems}` : "";

        if (subtype === "recently_added") {
            if (isTv) {
                filterUri = `/library/sections/${sectionKey}/all?type=2&sort=addedAt:desc&episode.title!=${trailerTitle}&label!=${trailerLabel}${limitParam}`;
            } else {
                filterUri = `/library/sections/${sectionKey}/all?type=1&sort=addedAt:desc&label!=${trailerLabel}&editionTitle!=Trailer${limitParam}`;
            }
        } else if (subtype === "recently_released") {
            if (isTv) {
                filterUri = `/library/sections/${sectionKey}/all?type=2&sort=episode.originallyAvailableAt:desc&episode.title!=${trailerTitle}&label!=${trailerLabel}${limitParam}`;
            } else {
                filterUri = `/library/sections/${sectionKey}/all?type=1&sort=originallyAvailableAt:desc&label!=${trailerLabel}&editionTitle!=Trailer${limitParam}`;
            }
        } else if (subtype === "recently_released_episodes") {
            filterUri = `/library/sections/${sectionKey}/all?type=2&sort=episode.addedAt:desc&episode.title!=${trailerTitle}&label!=${trailerLabel}${limitParam}`;
        } else if (subtype === "top_unwatched") {
            if (isTv) {
                filterUri = `/library/sections/${sectionKey}/all?type=2&sort=originallyAvailableAt:desc&show.unwatchedLeaves=1&and=1&episode.title!=${trailerTitle}&label!=${trailerLabel}${limitParam}`;
            } else {
                filterUri = `/library/sections/${sectionKey}/all?type=1&sort=originallyAvailableAt:desc&unwatched=1&and=1&label!=${trailerLabel}&editionTitle!=Trailer${limitParam}`;
            }
        }

        // Get machineId
        let machineId = "";
        for (const cleanBase of urlsToTry) {
            if (machineId) break;
            try {
                const sRes = await fetch(`${cleanBase}/?X-Plex-Token=${encodeURIComponent(token)}`, {
                    headers: { "Accept": "application/json" },
                    cache: "no-store"
                });
                if (sRes.ok) {
                    const sData = await sRes.json();
                    machineId = sData.MediaContainer?.machineIdentifier || "";
                }
            } catch {}
        }

        const fullUri = machineId
            ? `server://${machineId}/com.plexapp.plugins.library${filterUri}`
            : filterUri;

        // Check if smart collection already exists in Plex
        const existingCollections = await getPlexLibraryCollections(urlsToTry, token, sectionKey);
        const existing = existingCollections.find(c => {
            const titleLower = c.title.toLowerCase();
            if (titleLower === defaultTitle.toLowerCase()) return true;
            if (subtype === "recently_added") {
                return (
                    titleLower === (isTv ? "recently added tv (curated)" : "recently added movies (curated)") ||
                    titleLower === (isTv ? "recently added tv (filtered)" : "recently added movies (filtered)") ||
                    titleLower === (isTv ? "recently added tv" : "recently added movies") ||
                    titleLower === "recently added" ||
                    titleLower === "filtered recently added"
                );
            }
            if (subtype === "recently_released") {
                return (
                    titleLower === (isTv ? "recently released tv (curated)" : "recently released movies (curated)") ||
                    titleLower === (isTv ? "recently released tv (filtered)" : "recently released movies (filtered)") ||
                    titleLower === (isTv ? "recently released tv" : "recently released movies") ||
                    titleLower === "recently released" ||
                    titleLower === "filtered recently released"
                );
            }
            if (subtype === "recently_released_episodes") {
                return (
                    titleLower === "recently released episodes (curated)" ||
                    titleLower === "recently released episodes (filtered)" ||
                    titleLower === "recently released episodes"
                );
            }
            if (subtype === "top_unwatched") {
                return (
                    titleLower === (isTv ? "top unwatched tv (curated)" : "top unwatched movies (curated)") ||
                    titleLower === (isTv ? "top unwatched tv (filtered)" : "top unwatched movies (filtered)") ||
                    titleLower === (isTv ? "top unwatched tv" : "top unwatched movies") ||
                    titleLower === "top unwatched"
                );
            }
            return false;
        });

        let ratingKey = existing?.ratingKey;

        if (existing && existing.smart && !existing.ratingKey.startsWith("hub:")) {
            // Update existing smart collection URI and title if needed
            for (const cleanBase of urlsToTry) {
                try {
                    const updateUrl = `${cleanBase}/library/collections/${existing.ratingKey}/items?uri=${encodeURIComponent(fullUri)}&X-Plex-Token=${encodeURIComponent(token)}`;
                    await fetch(updateUrl, {
                        method: "PUT",
                        headers: { "X-Plex-Token": token, "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app" }
                    });
                    if (existing.title !== defaultTitle) {
                        await updatePlexItemTitle(urlsToTry, token, existing.ratingKey, defaultTitle);
                    }
                    break;
                } catch {}
            }
        } else {
            // Create new smart collection in Plex
            for (const cleanBase of urlsToTry) {
                if (ratingKey && !ratingKey.startsWith("hub:")) break;
                try {
                    const createUrl = `${cleanBase}/library/collections?type=${mediaTypeNum}&title=${encodeURIComponent(defaultTitle)}&smart=1&uri=${encodeURIComponent(fullUri)}&sectionId=${encodeURIComponent(String(sectionKey))}&X-Plex-Token=${encodeURIComponent(token)}`;
                    const cRes = await fetch(createUrl, {
                        method: "POST",
                        headers: {
                            "Accept": "application/json",
                            "X-Plex-Token": token,
                            "X-Plex-Client-Identifier": "portalarr-custom-dashboard-app"
                        }
                    });
                    if (cRes.ok) {
                        const cText = await cRes.text();
                        try {
                            const cData = JSON.parse(cText);
                            const meta = cData.MediaContainer?.Metadata?.[0];
                            if (meta?.ratingKey) {
                                ratingKey = meta.ratingKey;
                            }
                        } catch {}
                    }
                } catch {}
            }
        }

        // Set user-based filtering prefs for personalized collections (like top_unwatched)
        if (ratingKey && !ratingKey.startsWith("hub:")) {
            if (subtype === "top_unwatched") {
                for (const cleanBase of urlsToTry) {
                    try {
                        await fetch(`${cleanBase}/library/metadata/${ratingKey}/prefs?collectionFilterBasedOnUser=1&X-Plex-Token=${encodeURIComponent(token)}`, {
                            method: "PUT",
                            headers: { "X-Plex-Token": token }
                        });
                        break;
                    } catch {}
                }
            }

            // Promote to Home Screen with top priority
            await updatePlexCollectionPromotionAndOrder(urlsToTry, token, sectionKey, ratingKey, {
                summary: defaultSummary,
                promotedToHome: true,
                promotedToRecommended: true,
                promotedToSharedHome: true
            });
        }

        // CRITICAL: Upsert in local database so it immediately shows up in the Active Collections table!
        const existingDb = await prisma.mediaCollection.findFirst({
            where: {
                serverId,
                sectionKey: String(sectionKey),
                OR: [
                    ...(ratingKey ? [{ ratingKey }] : []),
                    { title: defaultTitle },
                    { sourceType: "plex_smart", sourceQuery: subtype }
                ]
            }
        });

        if (existingDb) {
            await prisma.mediaCollection.update({
                where: { id: existingDb.id },
                data: {
                    title: defaultTitle,
                    summary: defaultSummary,
                    ratingKey: ratingKey || existingDb.ratingKey,
                    sourceType: "plex_smart",
                    sourceQuery: subtype,
                    category: "Plex Smart",
                    type: "smart",
                    maxItems: maxItems || 25,
                    promotedToHome: true,
                    promotedToRecommended: true,
                    promotedToSharedHome: true,
                    sortPrefix: existingDb.sortPrefix || sortPrefix,
                    excludedLabels: "trailer-placeholder",
                    isIgnored: false,
                    lastSyncedAt: new Date()
                }
            });
        } else {
            await prisma.mediaCollection.create({
                data: {
                    title: defaultTitle,
                    summary: defaultSummary,
                    sortTitle: defaultTitle,
                    type: "smart",
                    category: "Plex Smart",
                    serverId,
                    sectionKey: String(sectionKey),
                    sourceType: "plex_smart",
                    sourceQuery: subtype,
                    ratingKey: ratingKey || undefined,
                    itemCount: 0,
                    maxItems: maxItems || 25,
                    promotedToHome: true,
                    promotedToRecommended: true,
                    promotedToSharedHome: true,
                    orderIndex: 0,
                    sortPrefix,
                    excludedLabels: "trailer-placeholder",
                    isIgnored: false,
                    lastSyncedAt: new Date()
                }
            });
        }

        logger.addLog("SUCCESS", "PLEX", `Deployed Filtered Smart Collection "${defaultTitle}" (${subtype}) to section ${sectionKey} on server "${resolved.serverName}"`);

        return {
            success: true,
            collectionRatingKey: ratingKey,
            message: `Deployed "${defaultTitle}" smart collection to Plex & saved to Active Collections! Placeholders will now be cleanly excluded from user carousels.`
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Failed deploying filtered smart hub (${subtype}): ${e.message}`);
        return { success: false, error: e.message, message: e.message };
    }
}

export async function deployFilteredRecentlyAddedHubAction(
    serverId: string,
    sectionKey: string
): Promise<{ success: boolean; message: string; error?: string; collectionRatingKey?: string }> {
    return await deployFilteredSmartHubAction(serverId, sectionKey, "recently_added");
}

export async function deployAllFilteredSmartHubsAction(
    serverId: string,
    sectionKey: string
): Promise<{ success: boolean; message: string; error?: string; results: any[] }> {
    try {

        await verifyAdmin();
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) {
            return { success: false, error: "Could not connect to Plex server.", message: "Could not connect to Plex server.", results: [] };
        }
        const sections = await getPlexServerSections(resolved.token, serverId, resolved.serverUrl);
        const sec = sections.find(s => String(s.key) === String(sectionKey));
        const isTv = sec?.type === "show" || sec?.type === "tv";

        const subtypes: ("recently_added" | "recently_released" | "recently_released_episodes" | "top_unwatched")[] = isTv
            ? ["recently_added", "recently_released", "recently_released_episodes", "top_unwatched"]
            : ["recently_added", "recently_released", "top_unwatched"];

        const results: any[] = [];
        for (const st of subtypes) {
            const res = await deployFilteredSmartHubAction(serverId, sectionKey, st);
            results.push({ subtype: st, ...res });
        }

        const successCount = results.filter(r => r.success).length;
        return {
            success: successCount > 0,
            message: `Successfully deployed ${successCount}/${subtypes.length} Filtered Smart Hubs! They are now active in Plex and saved to Active Collections.`,
            results
        };
    } catch (e: any) {
        return { success: false, error: e.message, message: e.message, results: [] };
    }
}

/**
 * Server action to fetch all media items for a collection, enriched with real-time Plex library status,
 * Radarr/Sonarr monitored status, release dates, trailers, and smart banner suggestions.
 */
export async function getCollectionMediaPreviewAction(collectionId: string) {
    try {

        await verifyAdmin();
        const collection = await prisma.mediaCollection.findUnique({ where: { id: collectionId } });
        if (!collection) return { success: false, error: "Collection not found.", items: [] };

        // 1. Fetch library items to know what is already present in Plex
        let libraryItems: any[] = [];
        if (collection.serverId && collection.sectionKey) {
            try {
                const resolved = await resolveWorkingPlexServerConnection(collection.serverId);
                if (resolved && resolved.serverUrl) {
                    const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                    libraryItems = await getPlexLibraryMediaItems(urlsToTry, resolved.token, collection.sectionKey, 5000, undefined, false, true);
                }
            } catch (err: any) {
                console.warn("[COLL-PREVIEW] Failed fetching library items:", err.message);
            }
        }

        const libraryTmdbIds = new Set(libraryItems.map(it => it.guids?.tmdb).filter(Boolean));
        const libraryImdbIds = new Set(libraryItems.map(it => it.guids?.imdb).filter(Boolean));
        const libraryTitles = new Map(libraryItems.map(it => [it.title?.toLowerCase().trim(), it]));

        // 2. Fetch candidates from Collection Source Query
        let candidateItems: any[] = [];
        const tmdbKey = await getTmdbApiKey();

        if (collection.sourceType === "tmdb") {
            if (collection.sourceQuery?.startsWith("collection:")) {
                const collId = collection.sourceQuery.replace("collection:", "");
                const tmdbRes = await fetch(`https://api.themoviedb.org/3/collection/${collId}?api_key=${tmdbKey}`);
                if (tmdbRes.ok) {
                    const data = await tmdbRes.json();
                    candidateItems = (data.parts || []).map((p: any) => ({
                        id: p.id,
                        title: p.title,
                        overview: p.overview,
                        posterPath: p.poster_path,
                        backdropPath: p.backdrop_path,
                        mediaType: "movie" as const,
                        releaseDate: p.release_date
                    }));
                }
            } else if (collection.sourceQuery?.startsWith("company:")) {
                const compId = collection.sourceQuery.replace("company:", "");
                const tmdbRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&with_companies=${compId}&sort_by=primary_release_date.desc&page=1`);
                if (tmdbRes.ok) {
                    const data = await tmdbRes.json();
                    candidateItems = (data.results || []).map((p: any) => ({
                        id: p.id,
                        title: p.title,
                        overview: p.overview,
                        posterPath: p.poster_path,
                        backdropPath: p.backdrop_path,
                        mediaType: "movie" as const,
                        releaseDate: p.release_date
                    }));
                }
            } else if (collection.sourceQuery?.startsWith("network:")) {
                const netId = parseInt(collection.sourceQuery.replace("network:", ""), 10) || 213;
                const shows = await getTmdbNetworkShows(netId);
                candidateItems = shows.map(s => ({
                    id: s.id,
                    title: s.title,
                    overview: s.overview,
                    posterPath: s.posterPath,
                    backdropPath: s.backdropPath,
                    mediaType: "tv" as const,
                    releaseDate: s.releaseDate
                }));
            } else if (collection.sourceQuery?.startsWith("provider:")) {
                const parts = collection.sourceQuery.split(":");
                const provId = parseInt(parts[1], 10) || 8;
                const isKids = parts.length > 2 && parts[2] === "kids";
                candidateItems = await getTmdbStreamingProviderMedia(provId, { isKids, mediaType: "both" });
            } else if (collection.sourceQuery === "in_theatres") {
                const inTheatres = await getTmdbNowPlayingMovies();
                candidateItems = inTheatres.map(m => ({
                    id: m.id,
                    title: m.title,
                    overview: m.overview,
                    posterPath: m.posterPath,
                    backdropPath: m.backdropPath,
                    mediaType: "movie" as const,
                    releaseDate: m.releaseDate
                }));
            } else if (collection.sourceQuery === "digital_releases") {
                candidateItems = await getTmdbUpcomingMovies();
            } else {
                candidateItems = await getTmdbTrending("all", "week");
            }
        } else if (collection.sourceType === "trakt") {
            if (collection.sourceQuery === "trending") {
                const trending = await getTraktTrendingMovies(40);
                candidateItems = trending.map((t: any) => ({
                    id: t.tmdbId || t.id,
                    title: t.title,
                    mediaType: "movie" as const,
                    releaseDate: t.year ? `${t.year}-01-01` : undefined,
                    imdbId: t.imdbId
                }));
            } else if (collection.sourceQuery === "anticipated") {
                const anticipated = await getTraktAnticipatedMovies(40);
                candidateItems = anticipated.map((t: any) => ({
                    id: t.tmdbId || t.id,
                    title: t.title,
                    mediaType: "movie" as const,
                    releaseDate: t.year ? `${t.year}-01-01` : undefined,
                    imdbId: t.imdbId
                }));
            } else if (collection.sourceQuery) {
                const listData = await getTraktUserList(collection.sourceQuery);
                if (listData?.items) {
                    candidateItems = listData.items.map((t: any) => ({
                        id: t.tmdbId || t.id,
                        title: t.title,
                        mediaType: "movie" as const,
                        releaseDate: t.year ? `${t.year}-01-01` : undefined,
                        imdbId: t.imdbId
                    }));
                }
            }
        } else if (collection.sourceType === "radarr") {
            try {
                const arrRes = await getEnabledArrInstancesInternal("radarr");
                if (arrRes.success && arrRes.data && arrRes.data.length > 0) {
                    for (const app of arrRes.data) {
                        const moviesRes = await arrApiGet(app, "/api/v3/movie");
                        if (moviesRes.success && Array.isArray(moviesRes.data)) {
                            let movies = moviesRes.data;
                            if (collection.sourceQuery === "monitored_missing") {
                                movies = movies.filter((m: any) => m.monitored && !m.hasFile);
                            } else if (collection.sourceQuery?.startsWith("tag:")) {
                                const targetTag = collection.sourceQuery.replace("tag:", "").toLowerCase().trim();
                                const tagsRes = await arrApiGet(app, "/api/v3/tag");
                                const tagId = tagsRes.success ? tagsRes.data?.find((t: any) => t.label.toLowerCase() === targetTag)?.id : null;
                                if (tagId) movies = movies.filter((m: any) => m.tags?.includes(tagId));
                            }
                            candidateItems.push(...movies.map((m: any) => ({
                                id: m.tmdbId,
                                title: m.title,
                                overview: m.overview,
                                posterPath: m.images?.find((img: any) => img.coverType === "poster")?.remoteUrl || null,
                                mediaType: "movie" as const,
                                releaseDate: m.digitalRelease || m.physicalRelease || m.inCinemas || (m.year ? `${m.year}-01-01` : undefined),
                                digitalReleaseDate: m.digitalRelease || undefined,
                                theatricalReleaseDate: m.inCinemas || undefined,
                                imdbId: m.imdbId
                            })));
                        }
                    }
                }
            } catch (rErr: any) {
                console.warn("[RADARR-PREVIEW] Error querying Radarr:", rErr.message);
            }
        } else if (collection.sourceType === "sonarr") {
            try {
                const arrRes = await getEnabledArrInstancesInternal("sonarr");
                if (arrRes.success && arrRes.data && arrRes.data.length > 0) {
                    for (const app of arrRes.data) {
                        const seriesRes = await arrApiGet(app, "/api/v3/series");
                        if (seriesRes.success && Array.isArray(seriesRes.data)) {
                            let series = seriesRes.data;
                            if (collection.sourceQuery === "monitored_missing") {
                                series = series.filter((s: any) => s.monitored && (s.statistics?.episodeFileCount === 0 || s.statistics?.percentOfEpisodes < 100));
                            } else if (collection.sourceQuery?.startsWith("tag:")) {
                                const targetTag = collection.sourceQuery.replace("tag:", "").toLowerCase().trim();
                                const tagsRes = await arrApiGet(app, "/api/v3/tag");
                                const tagId = tagsRes.success ? tagsRes.data?.find((t: any) => t.label.toLowerCase() === targetTag)?.id : null;
                                if (tagId) series = series.filter((s: any) => s.tags?.includes(tagId));
                            }
                            candidateItems.push(...series.map((s: any) => ({
                                id: s.tvdbId,
                                title: s.title,
                                overview: s.overview,
                                posterPath: s.images?.find((img: any) => img.coverType === "poster")?.remoteUrl || null,
                                mediaType: "tv" as const,
                                releaseDate: s.firstAired || (s.year ? `${s.year}-01-01` : undefined),
                                digitalReleaseDate: s.firstAired || undefined,
                                imdbId: s.imdbId
                            })));
                        }
                    }
                }
            } catch (sErr: any) {
                console.warn("[SONARR-PREVIEW] Error querying Sonarr:", sErr.message);
            }
        } else if (collection.sourceType === "plex_smart") {
            candidateItems = libraryItems.slice(0, 30).map(it => ({
                id: it.ratingKey,
                title: it.title,
                overview: it.summary,
                posterPath: it.thumb,
                mediaType: it.type === "show" ? "tv" as const : "movie" as const,
                releaseDate: it.year ? `${it.year}-01-01` : undefined
            }));
        } else if (collection.sourceType === "mdblist") {
            if (collection.sourceQuery) {
                const items = await getMdblistItems(collection.sourceQuery);
                if (items && items.length > 0) {
                    candidateItems = items.map((t: any) => ({
                        id: t.tmdbId || t.id,
                        title: t.title,
                        mediaType: "movie" as const,
                        releaseDate: t.year ? `${t.year}-01-01` : undefined,
                        imdbId: t.imdbId
                    }));
                }
            }
        }

        // Limit if maxItems is set
        if (collection.maxItems && collection.maxItems > 0) {
            candidateItems = candidateItems.slice(0, collection.maxItems);
        }

        const arrIndex = await getArrMonitoredIndex();
        const now = new Date();

        const formatNiceDate = (dStr?: string) => {
            if (!dStr) return "";
            try {
                const d = new Date(dStr);
                return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            } catch { return dStr; }
        };

        const enrichedItems = candidateItems.map(item => {
            const tmdbStr = String(item.id);
            let match = null;

            if (libraryTmdbIds.has(tmdbStr)) {
                match = libraryItems.find(it => it.guids?.tmdb === tmdbStr);
            } else if (item.imdbId && libraryImdbIds.has(item.imdbId)) {
                match = libraryItems.find(it => it.guids?.imdb === item.imdbId);
            } else if (item.title) {
                const clean = item.title.toLowerCase().trim();
                if (libraryTitles.has(clean)) {
                    match = libraryTitles.get(clean);
                }
            }

            const inLibrary = Boolean(match);

            // Arr status
            let arrItem: ArrItemStatus | undefined;
            if (item.mediaType === "tv") {
                arrItem = (item.id ? arrIndex.seriesByTvdb.get(String(item.id)) : undefined) ||
                          (item.imdbId ? arrIndex.seriesByImdb.get(item.imdbId.toLowerCase().trim()) : undefined) ||
                          (item.title ? arrIndex.seriesByTitle.get(item.title.toLowerCase().trim()) : undefined);
            } else {
                arrItem = arrIndex.moviesByTmdb.get(tmdbStr) ||
                          (item.imdbId ? arrIndex.moviesByImdb.get(item.imdbId.toLowerCase().trim()) : undefined) ||
                          (item.title ? arrIndex.moviesByTitle.get(item.title.toLowerCase().trim()) : undefined);
            }

            const inRadarr = arrItem?.appType === "radarr" || collection.sourceType === "radarr";
            const inSonarr = arrItem?.appType === "sonarr" || collection.sourceType === "sonarr";
            const isMonitored = Boolean(arrItem?.monitored) || collection.sourceType === "radarr" || collection.sourceType === "sonarr";

            const relDate = item.releaseDate ? new Date(item.releaseDate) : null;
            const digDate = item.digitalReleaseDate ? new Date(item.digitalReleaseDate) : null;
            const theDate = item.theatricalReleaseDate ? new Date(item.theatricalReleaseDate) : null;
            const isReleased = Boolean(item.inTheaters || (relDate && relDate <= now) || (digDate && digDate <= now) || (theDate && theDate <= now) || arrItem?.isReleased);

            let arrStatus: "NOT_REQUESTED" | "COMING_SOON" | "MONITORED_RELEASED" | "IN_LIBRARY" | "UPCOMING_UNREQUESTED";
            let suggestedBannerType = "not_requested";
            let suggestedBannerText = "NOT REQUESTED";
            let suggestedBannerTheme = collection.sourceQuery?.includes("netflix") || collection.title?.toLowerCase().includes("netflix") ? "netflix-red" : "crimson-red";
            let statusBadgeText = "NOT REQUESTED";
            let statusBadgeColor = "rose";

            if (inLibrary) {
                arrStatus = "IN_LIBRARY";
                suggestedBannerType = "in_library";
                suggestedBannerText = "IN LIBRARY";
                suggestedBannerTheme = "emerald-green";
                statusBadgeText = "✓ IN LIBRARY";
                statusBadgeColor = "emerald";
            } else if (!isMonitored) {
                arrStatus = "NOT_REQUESTED";
                suggestedBannerType = "not_requested";
                suggestedBannerText = "NOT REQUESTED";
                suggestedBannerTheme = collection.sourceQuery?.includes("netflix") || collection.title?.toLowerCase().includes("netflix") ? "netflix-red" : "crimson-red";
                statusBadgeText = "NOT REQUESTED";
                statusBadgeColor = "rose";
            } else if (!isReleased) {
                arrStatus = "COMING_SOON";
                const futureDateStr = item.digitalReleaseDate || arrItem?.digitalRelease || item.releaseDate || arrItem?.physicalRelease || item.theatricalReleaseDate || arrItem?.inCinemas;
                const futureDate = futureDateStr ? new Date(futureDateStr) : null;

                if (futureDate && !isNaN(futureDate.getTime()) && futureDate > now) {
                    const daysToRel = Math.ceil((futureDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                    if (daysToRel > 0 && daysToRel <= 30) {
                        suggestedBannerType = "countdown";
                        suggestedBannerText = `STREAMING IN ${daysToRel} ${daysToRel === 1 ? 'DAY' : 'DAYS'}`;
                        suggestedBannerTheme = "indigo-purple";
                    } else {
                        suggestedBannerType = "digital_release";
                        suggestedBannerText = `DIGITAL RELEASE ON ${formatNiceDate(futureDateStr).toUpperCase()}`;
                        suggestedBannerTheme = "cinematic-blue";
                    }
                } else {
                    suggestedBannerType = "coming_soon_monitored";
                    suggestedBannerText = "COMING SOON MONITORED";
                    suggestedBannerTheme = "amber-gold";
                }
                statusBadgeText = inRadarr ? "IN RADARR (COMING SOON)" : inSonarr ? "IN SONARR (COMING SOON)" : "COMING SOON";
                statusBadgeColor = "amber";
            } else {
                arrStatus = "MONITORED_RELEASED";
                suggestedBannerType = "now_streaming";
                suggestedBannerText = "DOWNLOADING SOON";
                suggestedBannerTheme = "emerald-green";
                statusBadgeText = inRadarr ? "IN RADARR (DOWNLOADING)" : inSonarr ? "IN SONARR (DOWNLOADING)" : "DOWNLOADING";
                statusBadgeColor = "cyan";
            }

            const releaseYear = item.releaseDate ? parseInt(item.releaseDate.split("-")[0], 10) : undefined;

            return {
                id: item.id,
                title: item.title,
                overview: item.overview,
                posterPath: item.posterPath,
                backdropPath: item.backdropPath,
                mediaType: item.mediaType || "movie",
                releaseDate: item.releaseDate,
                year: releaseYear,
                theatricalReleaseDate: item.theatricalReleaseDate,
                digitalReleaseDate: item.digitalReleaseDate,
                inLibrary,
                libraryRatingKey: match?.ratingKey,
                inRadarr,
                inSonarr,
                isMonitored,
                arrStatus,
                isReleased,
                suggestedBannerType,
                suggestedBannerText,
                suggestedBannerTheme,
                statusBadgeText,
                statusBadgeColor
            };
        });

        return {
            success: true,
            collection,
            totalCount: enrichedItems.length,
            inLibraryCount: enrichedItems.filter(i => i.inLibrary).length,
            missingCount: enrichedItems.filter(i => !i.inLibrary).length,
            items: enrichedItems
        };
    } catch (e: any) {
        return { success: false, error: e.message, items: [] };
    }
}

/**
 * Scans Coming Soon share directories on disk, checks if any media items have now been
 * downloaded / acquired into the Plex library, and automatically purges the placeholder
 * directories (.strm, .disc, poster.png) and database tracking records.
 */
export async function cleanupAvailablePlaceholdersInternal(
    targetServerId?: string,
    sectionKey?: string
): Promise<{ success: boolean; removedCount: number; removedItems: string[]; message: string }> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const comingSoonShares: Record<string, string> = settings?.comingSoonShares 
            ? JSON.parse(settings.comingSoonShares) 
            : {};

        // Gather all existing share directories to check
        const shareDirectories = new Set<string>();
        if (targetServerId && comingSoonShares[targetServerId] && fs.existsSync(comingSoonShares[targetServerId])) {
            shareDirectories.add(comingSoonShares[targetServerId]);
        }
        for (const p of Object.values(comingSoonShares)) {
            if (p && fs.existsSync(p)) {
                shareDirectories.add(p);
            }
        }

        if (shareDirectories.size === 0) {
            return {
                success: true,
                removedCount: 0,
                removedItems: [],
                message: "No Coming Soon share directories configured or accessible on disk."
            };
        }

        // 1. Fetch real Plex library media items across servers to build the "already acquired" index
        const libraryTmdbIds = new Set<string>();
        const libraryImdbIds = new Set<string>();
        const libraryTitles = new Set<string>();
        const libraryTitleYears = new Set<string>();

        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (token) {
            try {
                const srvList = await getPlexServerList(token);
                for (const srv of srvList) {
                    if (targetServerId && srv.serverId !== targetServerId) continue;
                    try {
                        const resolved = await resolveWorkingPlexServerConnection(srv.serverId);
                        if (!resolved || !resolved.serverUrl) continue;
                        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                        const sections = await getPlexServerSections(token, srv.serverId);
                        for (const sec of sections) {
                            if (sectionKey && String(sec.key) !== String(sectionKey)) continue;
                            if (sec.type !== "movie" && sec.type !== "show") continue;
                            const items = await getPlexLibraryMediaItems(urlsToTry, resolved.token, String(sec.key), 5000, undefined, true, true);
                            for (const it of items) {
                                if (it.isPlaceholder) continue;
                                const fileLower = (it.filePath || "").toLowerCase();
                                if (fileLower.includes(".portalarr-missing") || 
                                    fileLower.includes("edition-trailer") || 
                                    fileLower.includes("edition-placeholder") || 
                                    fileLower.endsWith(".disc") || 
                                    fileLower.endsWith(".strm") ||
                                    fileLower.includes("coming_soon") ||
                                    fileLower.includes("coming soon") ||
                                    fileLower.includes("placeholders") ||
                                    fileLower.includes("test_placeholders")
                                ) {
                                    continue;
                                }
                                const isInsideShare = Array.from(shareDirectories).some(sd => fileLower.includes(sd.toLowerCase()) || fileLower.includes(path.basename(sd).toLowerCase()));
                                if (isInsideShare) continue;

                                if (it.labels?.some(l => l.toLowerCase() === "trailer-placeholder" || l.toLowerCase() === "placeholder")) {
                                    continue;
                                }

                                if (it.type === "movie" && it.fileSize && it.fileSize < 1000000) {
                                    continue;
                                }

                                if (it.guids?.tmdb) libraryTmdbIds.add(String(it.guids.tmdb));
                                if (it.guids?.imdb) libraryImdbIds.add(String(it.guids.imdb));
                                if (it.title) {
                                    const cleanT = it.title.toLowerCase().trim();
                                    libraryTitles.add(cleanT);
                                    if (it.year) {
                                        libraryTitleYears.add(`${cleanT} (${it.year})`);
                                    }
                                }
                            }
                        }
                    } catch (srvErr: any) {
                        console.warn(`[PLACEHOLDER-CLEANUP] Failed querying server ${srv.serverName || srv.serverId}:`, srvErr.message);
                    }
                }
            } catch (err: any) {
                console.warn("[PLACEHOLDER-CLEANUP] Error fetching servers for library check:", err.message);
            }
        }

        let removedCount = 0;
        const removedItems: string[] = [];

        // 2. Iterate through each share folder on disk and inspect each placeholder folder
        for (const shareDir of Array.from(shareDirectories)) {
            try {
                const entries = fs.readdirSync(shareDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    const folderPath = path.join(shareDir, entry.name);

                    // Check if it's a Portalarr placeholder directory
                    const isMissingMarker = fs.existsSync(path.join(folderPath, ".portalarr-missing"));
                    const files = fs.readdirSync(folderPath);
                    const discFile = files.find(f => f.endsWith(".disc"));
                    const strmFile = files.find(f => f.endsWith(".strm"));

                    if (!isMissingMarker && !discFile && !strmFile) {
                        // Not a placeholder created by Portalarr, do not delete
                        continue;
                    }

                    // Auto-repair permissions on any existing placeholder folder so NAS/Unraid shares can read/write/delete freely
                    setPermissionsRecursive(folderPath, 0o777, 0o666);

                    // Extract metadata from .disc file if present
                    let itemTmdbId = "";
                    let itemTitle = "";
                    let itemYear = "";

                    if (discFile) {
                        try {
                            const discContent = fs.readFileSync(path.join(folderPath, discFile), "utf-8");
                            const tmdbMatch = discContent.match(/TMDb ID:\s*(\d+)/i);
                            if (tmdbMatch) itemTmdbId = tmdbMatch[1];
                            const titleMatch = discContent.match(/Title:\s*(.+)/i);
                            if (titleMatch) itemTitle = titleMatch[1].trim();
                        } catch {}
                    }

                    // If not found in .disc, parse folder name e.g. "Dune Part Two (2024)"
                    if (!itemTitle) {
                        const yearMatch = entry.name.match(/\((\d{4})\)$/);
                        if (yearMatch) {
                            itemYear = yearMatch[1];
                            itemTitle = entry.name.replace(/\(\d{4}\)$/, "").trim();
                        } else {
                            itemTitle = entry.name.trim();
                        }
                    }

                    const cleanTitle = itemTitle.toLowerCase().trim();
                    const titleWithYear = itemYear ? `${cleanTitle} (${itemYear})` : cleanTitle;

                    // 3. Determine if media is now present in the Plex library
                    let isAvailable = false;
                    if (itemTmdbId && libraryTmdbIds.has(itemTmdbId)) {
                        isAvailable = true;
                    } else if (libraryTitleYears.has(titleWithYear)) {
                        isAvailable = true;
                    } else if (libraryTitles.has(cleanTitle) && !itemYear) {
                        isAvailable = true;
                    }

                    if (isAvailable) {
                        // Clean up placeholder directory on disk
                        try {
                            try { fs.chmodSync(folderPath, 0o777); } catch {}
                            setPermissionsRecursive(folderPath, 0o777, 0o666);
                            fs.rmSync(folderPath, { recursive: true, force: true });
                            removedCount++;
                            removedItems.push(itemTitle || entry.name);

                            // Clean up DB advisory record if present
                            if (itemTmdbId) {
                                await prisma.mediaContentAdvisory.deleteMany({
                                    where: {
                                        ratingKey: `placeholder_tmdb_${itemTmdbId}`
                                    }
                                });
                            }

                            logger.addLog("INFO", "CURATION", `[PLACEHOLDER-CLEANUP] Auto-deleted Coming Soon placeholder for "${itemTitle || entry.name}" at "${folderPath}" because full media is now available in Plex.`);
                        } catch (rmErr: any) {
                            console.error(`[PLACEHOLDER-CLEANUP] Failed removing folder "${folderPath}":`, rmErr);
                        }
                    }
                }
            } catch (dirErr: any) {
                console.warn(`[PLACEHOLDER-CLEANUP] Error scanning directory "${shareDir}":`, dirErr.message);
            }
        }

        const msg = removedCount > 0 
            ? `Cleaned up ${removedCount} acquired placeholder(s) (${removedItems.slice(0, 3).join(", ")}${removedItems.length > 3 ? "..." : ""}) from Coming Soon shares.`
            : "All Coming Soon placeholders are up to date (no acquired media placeholders to remove).";

        if (removedCount > 0) {
            logger.addLog("SUCCESS", "CURATION", msg);
        }

        return {
            success: true,
            removedCount,
            removedItems,
            message: msg
        };
    } catch (e: any) {
        return {
            success: false,
            removedCount: 0,
            removedItems: [],
            message: e.message || "Failed cleaning up placeholders."
        };
    }
}

/**
 * Server action to manually trigger cleanup of placeholders for media that is now available in the library.
 */
export async function cleanupAvailablePlaceholdersAction(serverId?: string, sectionKey?: string) {
    try {
        await verifyAdmin();
        return await cleanupAvailablePlaceholdersInternal(serverId, sectionKey);
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Cleanup placeholders failed: ${e.message}`);
        return { success: false, error: e.message || "Cleanup placeholders failed" } as any;
    }
}

/**
 * Server action to recursively fix filesystem permissions (chmod 0777/0666) across all Coming Soon placeholder share folders.
 * Also upgrades any legacy .strm/.disc placeholders to real playable MP4 trailer videos.
 */
export async function fixPlaceholderPermissionsAction() {
    try {

        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const comingSoonShares: Record<string, string> = settings?.comingSoonShares 
            ? JSON.parse(settings.comingSoonShares) 
            : {};
        let serverStorageConfig: Record<string, any> = {};
        if (settings?.serverStorageConfig) {
            try { serverStorageConfig = JSON.parse(settings.serverStorageConfig); } catch {}
        }

        const shareDirectories = new Set<string>();
        for (const p of Object.values(comingSoonShares)) {
            if (p && fs.existsSync(p)) shareDirectories.add(p);
        }
        for (const cfg of Object.values(serverStorageConfig)) {
            if (cfg.sharePath && fs.existsSync(cfg.sharePath)) shareDirectories.add(cfg.sharePath);
            if (cfg.movieSharePath && fs.existsSync(cfg.movieSharePath)) shareDirectories.add(cfg.movieSharePath);
            if (cfg.tvSharePath && fs.existsSync(cfg.tvSharePath)) shareDirectories.add(cfg.tvSharePath);
        }

        const defaultTv = path.resolve("./data/coming_soon/tv");
        if (fs.existsSync(defaultTv)) shareDirectories.add(defaultTv);
        const defaultMovies = path.resolve("./data/coming_soon/movies");
        if (fs.existsSync(defaultMovies)) shareDirectories.add(defaultMovies);

        let fixedCount = 0;
        let upgradedCount = 0;
        for (const shareDir of Array.from(shareDirectories)) {
            try {
                const entries = fs.readdirSync(shareDir, { withFileTypes: true });
                for (const entry of entries) {
                    if (!entry.isDirectory()) continue;
                    const folderPath = path.join(shareDir, entry.name);
                    const files = fs.readdirSync(folderPath);

                    const season00Dir = path.join(folderPath, "Season 00");
                    const isTv = fs.existsSync(season00Dir);

                    if (isTv) {
                        const seasonFiles = fs.readdirSync(season00Dir);
                        const hasMp4 = seasonFiles.some(f => f.endsWith(".mp4") || f.endsWith(".mkv"));
                        const hasStrmOrDisc = seasonFiles.some(f => f.endsWith(".strm") || f.endsWith(".disc"));

                        if (!hasMp4 || hasStrmOrDisc) {
                            const tvTrailerMp4 = path.join(season00Dir, "S00E00.Trailer.mp4");
                            const showTitle = entry.name.replace(/\s*\(\d{4}\)$/, "").trim();
                            const yearMatch = entry.name.match(/\((\d{4})\)$/);
                            const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

                            await downloadOrCopyTrailerVideo({
                                title: showTitle,
                                year,
                                mediaType: "tv",
                                destinationPath: tvTrailerMp4
                            });

                            for (const sf of seasonFiles) {
                                if (sf.endsWith(".strm") || sf.endsWith(".disc")) {
                                    try { fs.unlinkSync(path.join(season00Dir, sf)); } catch {}
                                }
                            }
                            upgradedCount++;
                        }
                    } else {
                        const hasMp4 = files.some(f => f.endsWith(".mp4") || f.endsWith(".mkv"));
                        const hasStrmOrDisc = files.some(f => f.endsWith(".strm") || f.endsWith(".disc"));

                        if (!hasMp4 || hasStrmOrDisc) {
                            const movieTitle = entry.name.replace(/\s*\(\d{4}\)$/, "").trim();
                            const yearMatch = entry.name.match(/\((\d{4})\)$/);
                            const year = yearMatch ? parseInt(yearMatch[1], 10) : undefined;

                            const tmdbMatch = files.join(" ").match(/\{tmdb-(\d+)\}/i);
                            const tmdbId = tmdbMatch ? parseInt(tmdbMatch[1], 10) : undefined;
                            const tmdbTag = tmdbId ? ` {tmdb-${tmdbId}}` : "";

                            const movieTrailerMp4 = path.join(folderPath, `${entry.name}${tmdbTag} {edition-Trailer}.mp4`);
                            await downloadOrCopyTrailerVideo({
                                title: movieTitle,
                                year,
                                tmdbId,
                                mediaType: "movie",
                                destinationPath: movieTrailerMp4
                            });

                            for (const sf of files) {
                                if (sf.endsWith(".strm") || sf.endsWith(".disc")) {
                                    try { fs.unlinkSync(path.join(folderPath, sf)); } catch {}
                                }
                            }
                            upgradedCount++;
                        }
                    }

                    setPermissionsRecursive(folderPath, 0o777, 0o666);
                    fixedCount++;
                }
                setPermissionsRecursive(shareDir, 0o777, 0o666);
            } catch (e: any) {
                console.warn(`[PERMISSIONS-FIX] Error fixing permissions in ${shareDir}:`, e.message);
            }
        }

        logger.addLog("SUCCESS", "CURATION", `[PERMISSIONS-FIX] Repaired permissions on ${fixedCount} placeholder items across Coming Soon shares (${upgradedCount} upgraded to MP4 trailers).`);

        return {
            success: true,
            fixedCount,
            upgradedCount,
            message: `Permissions updated to 0777 and ${upgradedCount} placeholders upgraded to playable MP4 trailers across ${fixedCount} folders!`
        };
    } catch (e: any) {
        return {
            success: false,
            message: e.message || "Failed updating placeholder permissions."
        };
    }
}

/**
 * Server action to explicitly upgrade all existing placeholder items from .strm to real MP4 video trailers.
 */
export async function upgradePlaceholderTrailersAction() {
    return await fixPlaceholderPermissionsAction();
}

/**
 * Server action to manually delete a single placeholder folder from disk and remove its advisory record.
 */
export async function deletePlaceholderFolderAction(folderPath: string, tmdbId?: string | number) {
    try {

        await verifyAdmin();
        if (!folderPath || !fs.existsSync(folderPath)) {
            if (tmdbId) {
                await prisma.mediaContentAdvisory.deleteMany({
                    where: { ratingKey: `placeholder_tmdb_${tmdbId}` }
                });
            }
            return { success: true, message: "Placeholder record cleared." };
        }

        try { fs.chmodSync(folderPath, 0o777); } catch {}
        setPermissionsRecursive(folderPath, 0o777, 0o666);
        fs.rmSync(folderPath, { recursive: true, force: true });

        if (tmdbId) {
            await prisma.mediaContentAdvisory.deleteMany({
                where: { ratingKey: `placeholder_tmdb_${tmdbId}` }
            });
        }

        logger.addLog("INFO", "CURATION", `Manually deleted placeholder folder at "${folderPath}".`);
        return { success: true, message: "Placeholder folder and advisory deleted successfully!" };
    } catch (e: any) {
        console.error("Failed deleting placeholder folder:", e);
        return { success: false, message: e.message || "Failed deleting placeholder folder." };
    }
}

/**
 * Reads a local Kometa YAML configuration file from disk.
 */
export async function readLocalKometaConfigAction(customPath?: string) {
    try {

        await verifyAdmin();
        const candidatePaths: string[] = [];
        if (customPath && customPath.trim()) {
            candidatePaths.push(customPath.trim());
            if (!path.isAbsolute(customPath.trim())) {
                candidatePaths.push(path.join(process.cwd(), customPath.trim()));
            }
        }
        candidatePaths.push(
            path.join(process.cwd(), "kometaconfig.yml"),
            path.join(process.cwd(), "config.yml"),
            path.join(process.cwd(), "config", "config.yml"),
            path.join(process.cwd(), "config", "kometaconfig.yml")
        );

        let resolvedPath: string | null = null;
        for (const p of candidatePaths) {
            if (fs.existsSync(p)) {
                resolvedPath = p;
                break;
            }
        }

        if (!resolvedPath) {
            return {
                success: false,
                error: customPath 
                    ? `No Kometa configuration file found at "${customPath}".` 
                    : "No Kometa config file (kometaconfig.yml or config.yml) found in project directory."
            };
        }

        const content = fs.readFileSync(resolvedPath, "utf-8");
        const stats = fs.statSync(resolvedPath);
        const lineCount = content.split(/\r?\n/).length;

        return {
            success: true,
            filePath: resolvedPath,
            fileName: path.basename(resolvedPath),
            content,
            fileSizeBytes: stats.size,
            lineCount,
            message: `Loaded ${path.basename(resolvedPath)} (${stats.size} bytes, ${lineCount} lines)`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed reading Kometa config file." };
    }
}

/**
 * Inspects and parses a Kometa YAML configuration file (from disk or string).
 */
export async function inspectKometaConfigFileAction(yamlContent?: string, customPath?: string) {
    try {

        await verifyAdmin();
        let content = yamlContent;
        let source = "uploaded_content";

        if (!content || !content.trim()) {
            const diskRes = await readLocalKometaConfigAction(customPath);
            if (diskRes.success && diskRes.content) {
                content = diskRes.content;
                source = diskRes.fileName || "kometaconfig.yml (disk)";
            }
        }

        if (!content || !content.trim()) {
            return { success: false, error: "No Kometa configuration YAML found to inspect." };
        }

        const parsed = parseKometaYamlString(content);
        const libraryNames = Object.keys(parsed.libraries || {});
        const convertedLibraries: Record<string, any> = {};
        for (const [name, lib] of Object.entries(parsed.libraries || {})) {
            convertedLibraries[name] = convertKometaLibraryToPortalarrOverlay(lib, "main", "1");
        }

        return {
            success: true,
            source,
            rawYaml: content,
            parsed,
            convertedLibraries,
            libraryCount: libraryNames.length,
            libraryNames,
            hasPlex: Boolean(parsed.plex?.url),
            hasTmdb: Boolean(parsed.tmdb?.apikey),
            tmdbApiKey: parsed.tmdb?.apikey || "",
            plexUrl: parsed.plex?.url || "",
            plexToken: parsed.plex?.token || ""
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed inspecting Kometa configuration." };
    }
}

export interface ImportKometaConfigOptions {
    yamlContent?: string;
    customPath?: string;
    targetServerId?: string;
    libraryMappings?: Array<{
        kometaLibName: string;
        serverId: string;
        sectionKey: string;
        enabled?: boolean;
    }>;
    importTmdbKey?: boolean;
    importPlexCredentials?: boolean;
}

/**
 * Imports a Kometa YAML configuration, creates/updates corresponding Portalarr overlay rules,
 * and configures connections (TMDb / Plex) seamlessly.
 */
export async function importKometaConfigAction(
    paramsOrYaml?: string | ImportKometaConfigOptions,
    targetServerId?: string
) {
    try {

        await verifyAdmin();
        let content: string | undefined;
        let customPath: string | undefined;
        let selectedServerId = targetServerId || "main";
        let libraryMappings: Array<{ kometaLibName: string; serverId: string; sectionKey: string; enabled?: boolean }> | undefined;
        let importTmdbKey = true;
        let source = "uploaded_content";

        if (typeof paramsOrYaml === "string") {
            content = paramsOrYaml;
        } else if (paramsOrYaml && typeof paramsOrYaml === "object") {
            content = paramsOrYaml.yamlContent;
            customPath = paramsOrYaml.customPath;
            if (paramsOrYaml.targetServerId) selectedServerId = paramsOrYaml.targetServerId;
            libraryMappings = paramsOrYaml.libraryMappings;
            if (paramsOrYaml.importTmdbKey !== undefined) importTmdbKey = paramsOrYaml.importTmdbKey;
        }

        if (!content || !content.trim()) {
            const diskRes = await readLocalKometaConfigAction(customPath);
            if (diskRes.success && diskRes.content) {
                content = diskRes.content;
                source = diskRes.fileName || "kometaconfig.yml (disk)";
            }
        }

        if (!content || !content.trim()) {
            return { success: false, error: "No Kometa configuration YAML found to import." };
        }

        const parsed = parseKometaYamlString(content);
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        let tmdbUpdated = false;

        // 1. Auto-save TMDb API Key if requested and present
        if (importTmdbKey && parsed.tmdb?.apikey) {
            if (!settings?.tmdbApiKey || settings.tmdbApiKey.trim().length === 0 || paramsOrYaml && typeof paramsOrYaml === "object" && paramsOrYaml.importTmdbKey) {
                await prisma.settings.upsert({
                    where: { id: "global" },
                    update: { tmdbApiKey: parsed.tmdb.apikey },
                    create: { id: "global", tmdbApiKey: parsed.tmdb.apikey }
                });
                tmdbUpdated = true;
            }
        }

        // 2. Resolve target server and library sections
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        let plexSections: any[] = [];
        let serverId = selectedServerId;

        if (token) {
            try {
                const servers = await getPlexServers(token);
                if (servers && servers.length > 0) {
                    if (!selectedServerId || selectedServerId === "main") {
                        serverId = servers[0].clientIdentifier;
                    }
                    const resolved = await resolveWorkingPlexServerConnection(serverId);
                    if (resolved && resolved.serverUrl) {
                        plexSections = await getPlexServerSections(resolved.token, serverId, resolved.serverUrl);
                    }
                }
            } catch (pErr) {}
        }

        const appliedRules: any[] = [];

        // 3. Map each Kometa library to Portalarr overlay rule
        for (const [libName, kometaLib] of Object.entries(parsed.libraries)) {
            // Check if user provided explicit mapping
            const explicitMapping = libraryMappings?.find(m => m.kometaLibName === libName);
            if (explicitMapping && explicitMapping.enabled === false) {
                continue; // User skipped this library
            }

            let effectiveServerId = explicitMapping?.serverId || serverId;
            let sectionKey = explicitMapping?.sectionKey || "1";

            if (!explicitMapping) {
                // Find matching Plex section key if available
                const cleanName = libName.toLowerCase().trim();
                const matchedSection = plexSections.find(s => 
                    s.title?.toLowerCase().trim() === cleanName || 
                    (cleanName.includes("movie") && s.type === "movie") ||
                    ((cleanName.includes("tv") || cleanName.includes("show")) && s.type === "show")
                );

                if (matchedSection) {
                    sectionKey = String(matchedSection.key);
                }
            }

            const rulePayload = convertKometaLibraryToPortalarrOverlay(kometaLib, effectiveServerId, sectionKey);

            // Save or update overlay rule
            const saveRes = await saveOverlayRuleAction({
                name: rulePayload.name,
                serverId: rulePayload.serverId,
                sectionKey: rulePayload.sectionKey,
                overlayType: rulePayload.overlayType,
                position: rulePayload.position,
                videoPosition: rulePayload.videoPosition,
                resolutionPosition: rulePayload.resolutionPosition,
                hdrPosition: rulePayload.hdrPosition,
                showResolution: rulePayload.showResolution,
                showHdr: rulePayload.showHdr,
                dovetailResolutionHdr: rulePayload.dovetailResolutionHdr,
                showAudio: rulePayload.showAudio,
                audioPosition: rulePayload.audioPosition,
                showStudio: rulePayload.showStudio,
                studioPosition: rulePayload.studioPosition,
                showContentRating: rulePayload.showContentRating,
                contentRatingPosition: rulePayload.contentRatingPosition,
                showRibbon: rulePayload.showRibbon,
                ribbonMode: rulePayload.ribbonMode,
                ribbonPosition: rulePayload.ribbonPosition,
                ribbonTheme: rulePayload.ribbonTheme,
                tieredRibbons: rulePayload.tieredRibbons,
                maxRibbonTiers: rulePayload.maxRibbonTiers,
                theme: rulePayload.theme,
                badgeStyle: rulePayload.badgeStyle,
                showLeavingSoon: rulePayload.showLeavingSoon,
                enabled: rulePayload.enabled
            });

            if (saveRes.success && saveRes.rule) {
                appliedRules.push({
                    library: libName,
                    serverId: effectiveServerId,
                    sectionKey,
                    ruleId: saveRes.rule.id,
                    rule: rulePayload
                });
            }
        }

        // 4. Auto-import local kometa_assets folder if present
        let localBadgesImported = 0;
        const localAssetsDir = path.join(process.cwd(), "kometa_assets");
        if (fs.existsSync(localAssetsDir)) {
            const assetRes = await importLocalKometaAssetsAction(localAssetsDir);
            if (assetRes.success) {
                localBadgesImported = assetRes.totalCount || 0;
            }
        }

        logger.addLog("SUCCESS", "CURATION", `Imported Kometa configuration (${appliedRules.length} library rules configured, ${localBadgesImported} custom badges imported, TMDb: ${tmdbUpdated ? "Saved" : "Preserved"}).`);

        return {
            success: true,
            source,
            tmdbUpdated,
            localBadgesImported,
            appliedCount: appliedRules.length,
            appliedRules,
            message: `Successfully imported Kometa configuration! Configured ${appliedRules.length} library rule(s)${localBadgesImported > 0 ? ` and ${localBadgesImported} custom badge(s) from kometa_assets` : ''}.`
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed importing Kometa configuration." };
    }
}
