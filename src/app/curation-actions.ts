"use server";

if (typeof process !== "undefined" && process.env) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
}

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
    getPlexLibraryCollections, 
    syncPlexCollection, 
    deletePlexCollection, 
    updatePlexCollectionPromotionAndOrder,
    evaluatePruneCandidatesForServer,
    deleteMediaFromPlexServer,
    searchPlexLibraryItems,
    inspectPlexMediaItemFull,
    PlexMediaStreamInfo,
    PruneCandidateItem
} from "@/lib/curation/plex-analyzer";
import { 
    backupAndApplyOverlay, 
    restoreItemOriginalArtwork, 
    restoreAllOriginalArtworks, 
    OverlayOptions,
    generatePlaceholderPosterBuffer,
    generatePlaceholderRibbonSvg
} from "@/lib/curation/overlay-engine";
import { 
    getTmdbTrending, 
    getTmdbPopularMovies, 
    getTmdbTopRatedMovies, 
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
    TmdbMediaItem
} from "@/lib/curation/tmdb";
import { 
    getTraktTrendingMovies, 
    getTraktPopularMovies, 
    getTraktAnticipatedMovies, 
    getTraktBoxOfficeMovies, 
    getTraktUserList 
} from "@/lib/curation/trakt";
import { 
    getMdblistRatings, 
    getMdblistItems 
} from "@/lib/curation/mdblist";
import { 
    COLLECTION_PRESETS, 
    CollectionPreset,
    BadgePresetPack,
    DiscoveredBadgeItem,
    PRESET_BADGE_PACKS 
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
import {
    parseKometaYamlString,
    convertKometaLibraryToPortalarrOverlay,
    ParsedKometaConfig
} from "@/lib/curation/kometa-importer";

// Verify admin permissions
async function verifyAdmin() {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
        throw new Error("Unauthorized: Admin permissions required.");
    }
    return user;
}

export async function getCurationSettingsAction() {
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
        enabledServersForOverlays: settings?.enabledServersForOverlays ? JSON.parse(settings.enabledServersForOverlays) : [],
        enabledServersForCollections: settings?.enabledServersForCollections ? JSON.parse(settings.enabledServersForCollections) : [],
        enabledServersForPruning: settings?.enabledServersForPruning ? JSON.parse(settings.enabledServersForPruning) : [],
        comingSoonShares: settings?.comingSoonShares ? JSON.parse(settings.comingSoonShares) : {},
        serverStorageConfig: settings?.serverStorageConfig ? JSON.parse(settings.serverStorageConfig) : {},

        // Placeholder Timing & Overlay Settings
        placeholderTheatricalNoticeDays: settings?.placeholderTheatricalNoticeDays ?? 60,
        placeholderDigitalCountdownDays: settings?.placeholderDigitalCountdownDays ?? 30,
        placeholderNowStreamingGraceDays: settings?.placeholderNowStreamingGraceDays ?? 7,
        placeholderAutoPruneDays: settings?.placeholderAutoPruneDays ?? 14,
        placeholderBannerPosition: settings?.placeholderBannerPosition || "bottom",
        placeholderBannerTheme: settings?.placeholderBannerTheme || "indigo-purple",
        placeholderCustomText: settings?.placeholderCustomText || "",
        placeholderEnabled: settings?.placeholderEnabled ?? true,

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
        parentalCategories: settings?.parentalCategories ? JSON.parse(settings.parentalCategories) : ["nudity", "violence", "profanity", "alcohol", "frightening"],
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
        curationLastRunStatus: settings?.curationLastRunStatus ? JSON.parse(settings.curationLastRunStatus) : null
    };
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
    pageType: "kometa" | "agregarr" | "prune",
    serverId: string,
    sectionKey: string,
    enabled: boolean,
    allServerSections?: string[]
) {
    await verifyAdmin();
    await ensureSchemaColumns();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const fieldName = pageType === "kometa"
            ? "enabledServersForOverlays"
            : pageType === "agregarr"
                ? "enabledServersForCollections"
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
        const allSecs = (allServerSections && allServerSections.length > 0)
            ? allServerSections.map(s => String(s))
            : [strSecKey];

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
    pageType: "kometa" | "agregarr" | "prune",
    serverId: string,
    enableAll: boolean,
    allServerSections: string[]
) {
    await verifyAdmin();
    await ensureSchemaColumns();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const fieldName = pageType === "kometa"
            ? "enabledServersForOverlays"
            : pageType === "agregarr"
                ? "enabledServersForCollections"
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
            thisServerEntries = (allServerSections && allServerSections.length > 0)
                ? allServerSections.map(s => `${serverId}:${String(s)}`)
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
    comingSoonShares?: Record<string, string>;
    serverStorageConfig?: Record<string, any>;
    placeholderTheatricalNoticeDays?: number;
    placeholderDigitalCountdownDays?: number;
    placeholderNowStreamingGraceDays?: number;
    placeholderAutoPruneDays?: number;
    placeholderBannerPosition?: string;
    placeholderBannerTheme?: string;
    placeholderCustomText?: string;
    placeholderEnabled?: boolean;
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
    await verifyAdmin();
    try {
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
        if (data.comingSoonShares !== undefined) updatePayload.comingSoonShares = JSON.stringify(data.comingSoonShares);
        if (data.serverStorageConfig !== undefined) updatePayload.serverStorageConfig = JSON.stringify(data.serverStorageConfig);

        // Placeholder & Leaving Soon Settings
        if (data.placeholderTheatricalNoticeDays !== undefined) updatePayload.placeholderTheatricalNoticeDays = data.placeholderTheatricalNoticeDays;
        if (data.placeholderDigitalCountdownDays !== undefined) updatePayload.placeholderDigitalCountdownDays = data.placeholderDigitalCountdownDays;
        if (data.placeholderNowStreamingGraceDays !== undefined) updatePayload.placeholderNowStreamingGraceDays = data.placeholderNowStreamingGraceDays;
        if (data.placeholderAutoPruneDays !== undefined) updatePayload.placeholderAutoPruneDays = data.placeholderAutoPruneDays;
        if (data.placeholderBannerPosition !== undefined) updatePayload.placeholderBannerPosition = data.placeholderBannerPosition;
        if (data.placeholderBannerTheme !== undefined) updatePayload.placeholderBannerTheme = data.placeholderBannerTheme;
        if (data.placeholderCustomText !== undefined) updatePayload.placeholderCustomText = data.placeholderCustomText;
        if (data.placeholderEnabled !== undefined) updatePayload.placeholderEnabled = data.placeholderEnabled;

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
}

export async function getPlexServerSectionsAction(serverId: string) {
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
}

export async function getMediaCollectionsAction(serverId?: string, sectionKey?: string) {
    await verifyAdmin();
    await ensureSchemaColumns();
    try {
        const rawCollections = await prisma.mediaCollection.findMany({
            where: {
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
    await verifyAdmin();
    try {
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

        // Fetch current DB collections for this server & section
        const existingDbCollections = await prisma.mediaCollection.findMany({
            where: { serverId, sectionKey: String(sectionKey) }
        });

        let maxOrderIndex = existingDbCollections.reduce((max, c) => Math.max(max, c.orderIndex ?? 0), -1);
        let importedCount = 0;
        let updatedCount = 0;

        for (const pColl of plexCollections) {
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
    await verifyAdmin();
    await ensureSchemaColumns();
    try {
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
    await verifyAdmin();
    try {
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

        if (isNativePlex || collection.ratingKey) {
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

        // 1. Fetch library media items
        const libraryItems = await getPlexLibraryMediaItems(urlsToTry, token, collection.sectionKey || "", 1000);

        // 2. Resolve matching rating keys based on collection source type
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
            const tmdbKey = settings?.tmdbApiKey || "";
            if (collection.sourceQuery?.startsWith("collection:")) {
                // Franchise collection
                const collId = collection.sourceQuery.replace("collection:", "");
                const tmdbRes = await fetch(`https://api.themoviedb.org/3/collection/${collId}?api_key=${tmdbKey}`);
                if (tmdbRes.ok) {
                    const data = await tmdbRes.json();
                    const parts: any[] = data.parts || [];
                    const titles = parts.map((p: any) => p.title.toLowerCase());
                    const tmdbIds = parts.map((p: any) => String(p.id));

                    matchingRatingKeys.push(...libraryItems.filter(it => 
                        (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                        titles.includes(it.title.toLowerCase())
                    ).map(it => it.ratingKey));
                }
            } else if (collection.sourceQuery?.startsWith("company:")) {
                const compId = collection.sourceQuery.replace("company:", "");
                const tmdbRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&with_companies=${compId}&sort_by=primary_release_date.desc&page=1`);
                if (tmdbRes.ok) {
                    const data = await tmdbRes.json();
                    const results: any[] = data.results || [];
                    const tmdbIds = results.map((r: any) => String(r.id));
                    const titles = results.map((r: any) => r.title.toLowerCase());

                    matchingRatingKeys.push(...libraryItems.filter(it => 
                        (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                        titles.includes(it.title.toLowerCase())
                    ).map(it => it.ratingKey));
                }
            } else if (collection.sourceQuery?.startsWith("network:")) {
                const netId = parseInt(collection.sourceQuery.replace("network:", ""), 10) || 213;
                const shows = await getTmdbNetworkShows(netId);
                const tmdbIds = shows.map(s => String(s.id));
                const titles = shows.map(s => s.title.toLowerCase());

                matchingRatingKeys.push(...libraryItems.filter(it => 
                    (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                ).map(it => it.ratingKey));
            } else if (collection.sourceQuery?.startsWith("provider:")) {
                const parts = collection.sourceQuery.split(":");
                const provId = parseInt(parts[1], 10) || 8;
                const isKids = parts.length > 2 && parts[2] === "kids";
                const providerMedia = await getTmdbStreamingProviderMedia(provId, { isKids, mediaType: "both" });
                const tmdbIds = providerMedia.map(m => String(m.id));
                const titles = providerMedia.map(m => m.title.toLowerCase());

                matchingRatingKeys.push(...libraryItems.filter(it => 
                    (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                ).map(it => it.ratingKey));
            } else if (collection.sourceQuery === "digital_releases") {
                const upcoming = await getTmdbUpcomingMovies();
                const tmdbIds = upcoming.map(m => String(m.id));
                const titles = upcoming.map(m => m.title.toLowerCase());

                matchingRatingKeys.push(...libraryItems.filter(it => 
                    (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                ).map(it => it.ratingKey));
            }
        } else if (collection.sourceType === "trakt") {
            if (collection.sourceQuery === "trending") {
                const trending = await getTraktTrendingMovies(50);
                const imdbIds = trending.map((t: any) => t.imdbId).filter(Boolean);
                const titles = trending.map((t: any) => t.title?.toLowerCase()).filter(Boolean);

                matchingRatingKeys.push(...libraryItems.filter(it => 
                    (it.guids.imdb && imdbIds.includes(it.guids.imdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                ).map(it => it.ratingKey));
            } else if (collection.sourceQuery) {
                const listData = await getTraktUserList(collection.sourceQuery);
                if (listData?.items) {
                    const imdbIds = listData.items.map((t: any) => t.imdbId).filter(Boolean);
                    const titles = listData.items.map((t: any) => t.title?.toLowerCase()).filter(Boolean);

                    matchingRatingKeys.push(...libraryItems.filter(it => 
                        (it.guids.imdb && imdbIds.includes(it.guids.imdb)) ||
                        (it.title && titles.includes(it.title.toLowerCase()))
                    ).map(it => it.ratingKey));
                }
            }
        } else if (collection.sourceType === "mdblist") {
            if (collection.sourceQuery) {
                const items = await getMdblistItems(collection.sourceQuery);
                if (items && items.length > 0) {
                    const imdbIds = items.map((t: any) => t.imdbId).filter(Boolean);
                    const titles = items.map((t: any) => t.title?.toLowerCase()).filter(Boolean);

                    matchingRatingKeys.push(...libraryItems.filter(it => 
                        (it.guids.imdb && imdbIds.includes(it.guids.imdb)) ||
                        (it.title && titles.includes(it.title.toLowerCase()))
                    ).map(it => it.ratingKey));
                } else if (collection.sourceQuery === "top-imdb-250" || collection.sourceQuery === "top-imdb-tv") {
                    // Smart library fallback if MDBList API key not present: items with rating >= 8.0
                    matchingRatingKeys.push(...libraryItems.filter(it => it.rating && it.rating >= 8.0).map(it => it.ratingKey));
                }
            }
        }

        if (matchingRatingKeys.length === 0) {
            logger.addLog("WARN", "PLEX", `No matching media found in section ${collection.sectionKey} for collection "${collection.title}" (${libraryItems.length} items evaluated, query: ${collection.sourceQuery || "none"}).`);
            return {
                success: false,
                message: `No matching library media found for collection criteria (${libraryItems.length} items evaluated).`
            };
        }

        // 3. Sync to Plex with Sort Prefix and Home Promotion
        const syncResult = await syncPlexCollection(
            urlsToTry,
            token,
            collection.sectionKey || "",
            collection.title,
            matchingRatingKeys,
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

        // 4. Update local DB with item count and synced time
        await prisma.mediaCollection.update({
            where: { id: collection.id },
            data: {
                itemCount: matchingRatingKeys.length,
                lastSyncedAt: new Date(),
                ratingKey: syncResult.collectionRatingKey || undefined
            }
        });

        logger.addLog("SUCCESS", "PLEX", `Successfully synced collection "${collection.title}" (${matchingRatingKeys.length} items) to Plex server "${resolved.serverName}"`);

        return {
            success: true,
            itemCount: matchingRatingKeys.length,
            collectionRatingKey: syncResult.collectionRatingKey,
            message: `Synced "${collection.title}" with ${matchingRatingKeys.length} items to Plex!`
        };
    } catch (e: any) {
        logger.addLog("ERROR", "PLEX", `Sync collection "${collectionId}" failed: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * Preview matched media items in user library for a collection rule/preset
 */
export async function previewCollectionMatchingAction(
    serverId: string,
    sectionKey: string,
    collectionConfig: {
        sourceType: string;
        sourceQuery?: string;
        mediaType?: string;
        title?: string;
        type?: string;
    }
) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;

        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];
        const libraryItems = await getPlexLibraryMediaItems(urlsToTry, token, sectionKey || "", 500);

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
            const tmdbKey = settings?.tmdbApiKey || "";
            if (sourceQuery.startsWith("collection:")) {
                const collId = sourceQuery.replace("collection:", "");
                executionMethod = `TMDb Franchise API: Querying collection ID #${collId} parts list.`;
                if (tmdbKey) {
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/collection/${collId}?api_key=${tmdbKey}`);
                    if (tmdbRes.ok) {
                        const data = await tmdbRes.json();
                        const parts: any[] = data.parts || [];
                        const titles = parts.map((p: any) => p.title.toLowerCase());
                        const tmdbIds = parts.map((p: any) => String(p.id));
                        matchedItems = libraryItems.filter(it => 
                            (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                            titles.includes(it.title.toLowerCase())
                        );
                    }
                }
            } else if (sourceQuery.startsWith("company:") || sourceQuery.startsWith("network:")) {
                const compId = sourceQuery.replace(/^(company|network):/, "");
                executionMethod = `TMDb Studio/Network API: Querying company/network ID #${compId} filmography.`;
                if (tmdbKey) {
                    const tmdbRes = await fetch(`https://api.themoviedb.org/3/discover/movie?api_key=${tmdbKey}&with_companies=${compId}&sort_by=primary_release_date.desc&page=1`);
                    if (tmdbRes.ok) {
                        const data = await tmdbRes.json();
                        const results: any[] = data.results || [];
                        const tmdbIds = results.map((r: any) => String(r.id));
                        const titles = results.map((r: any) => r.title.toLowerCase());
                        matchedItems = libraryItems.filter(it => 
                            (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                            titles.includes(it.title.toLowerCase())
                        );
                    }
                }
            } else if (sourceQuery.startsWith("provider:")) {
                const parts = sourceQuery.split(":");
                const provId = parseInt(parts[1], 10) || 8;
                const isKids = parts.length > 2 && parts[2] === "kids";
                const provName = provId === 337 ? "Disney+" : provId === 8 ? "Netflix" : `Provider #${provId}`;
                executionMethod = `TMDb Streaming Provider API: Querying ${provName} ${isKids ? "(Kids & Family)" : "Trending Top Charts"}. Matches against Plex library metadata.`;
                const providerMedia = await getTmdbStreamingProviderMedia(provId, { isKids, mediaType: "both" });
                const tmdbIds = providerMedia.map(m => String(m.id));
                const titles = providerMedia.map(m => m.title.toLowerCase());
                matchedItems = libraryItems.filter(it => 
                    (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                );
            } else if (sourceQuery === "digital_releases") {
                executionMethod = `TMDb Releases API: Querying new digital streaming releases.`;
                const upcoming = await getTmdbUpcomingMovies();
                const tmdbIds = upcoming.map(m => String(m.id));
                const titles = upcoming.map(m => m.title.toLowerCase());
                matchedItems = libraryItems.filter(it => 
                    (it.guids.tmdb && tmdbIds.includes(it.guids.tmdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                );
            } else {
                executionMethod = `TMDb Query: ${sourceQuery}`;
            }
        } else if (sourceType === "mdblist") {
            executionMethod = `MDBList API: Resolving curated chart "${sourceQuery}". Matches against Plex IMDb/TMDb metadata.`;
            const items = await getMdblistItems(sourceQuery);
            if (items && items.length > 0) {
                const imdbIds = items.map((t: any) => t.imdbId).filter(Boolean);
                const titles = items.map((t: any) => t.title?.toLowerCase()).filter(Boolean);
                matchedItems = libraryItems.filter(it => 
                    (it.guids.imdb && imdbIds.includes(it.guids.imdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                );
            } else {
                if (sourceQuery === "top-imdb-250" || sourceQuery === "top-imdb-tv") {
                    executionMethod += " (No MDBList key found — showing smart library fallback: items with Plex rating ≥ 8.0).";
                    matchedItems = libraryItems.filter(it => it.rating && it.rating >= 8.0);
                } else if (sourceQuery === "top-oscar-best-picture") {
                    executionMethod += " (MDBList key not configured; configure in settings to fetch official Oscar list).";
                }
            }
        } else if (sourceType === "trakt") {
            executionMethod = `Trakt API: Querying list "${sourceQuery}".`;
            if (sourceQuery === "trending") {
                const trending = await getTraktTrendingMovies(50);
                const imdbIds = trending.map((t: any) => t.imdbId).filter(Boolean);
                const titles = trending.map((t: any) => t.title?.toLowerCase()).filter(Boolean);
                matchedItems = libraryItems.filter(it => 
                    (it.guids.imdb && imdbIds.includes(it.guids.imdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                );
            }
        }

        return {
            success: true,
            totalEvaluated: libraryItems.length,
            matchCount: matchedItems.length,
            executionMethod,
            sampleMatches: matchedItems.slice(0, 18).map(m => ({
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
    await verifyAdmin();
    try {
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;

        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];
        let updatedCount = 0;

        for (const item of orderedCollections) {
            const prefix = item.sortPrefix || `!${String(item.orderIndex).padStart(2, '0')}_`;

            const updated = await prisma.mediaCollection.update({
                where: { id: item.id },
                data: {
                    orderIndex: item.orderIndex,
                    sortPrefix: prefix,
                    promotedToHome: item.promotedToHome ?? true,
                    promotedToRecommended: item.promotedToRecommended ?? true,
                    promotedToSharedHome: item.promotedToSharedHome ?? true,
                    collectionMode: item.collectionMode || "default"
                }
            });

            if (serverUrl && updated.ratingKey) {
                const effectiveSortTitle = `${prefix}${updated.sortTitle || updated.title}`;
                await updatePlexCollectionPromotionAndOrder(
                    urlsToTry,
                    token,
                    sectionKey,
                    updated.ratingKey,
                    {
                        sortTitle: effectiveSortTitle,
                        promotedToHome: item.promotedToHome ?? true,
                        promotedToRecommended: item.promotedToRecommended ?? true,
                        promotedToSharedHome: item.promotedToSharedHome ?? true,
                        collectionMode: item.collectionMode || "default"
                    }
                );
                updatedCount++;
            }
        }

        logger.addLog("SUCCESS", "PLEX", `Reordered ${orderedCollections.length} collections on Plex Home Screen.`);
        return {
            success: true,
            message: `Updated ordering and home visibility for ${orderedCollections.length} collections.`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
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
    await verifyAdmin();
    await ensureSchemaColumns();
    try {
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
 * Full placement, visibility & scheduling configuration update for a collection
 */
export async function updateCollectionPlacementAction(data: {
    id: string;
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
    await verifyAdmin();
    await ensureSchemaColumns();
    try {
        const collection = await prisma.mediaCollection.findUnique({ where: { id: data.id } });
        if (!collection) return { success: false, error: "Collection not found." };

        const prefix = data.sortPrefix !== undefined ? data.sortPrefix : (data.orderIndex !== undefined ? `!${String(data.orderIndex).padStart(2, '0')}_` : collection.sortPrefix);

        const updated = await prisma.mediaCollection.update({
            where: { id: data.id },
            data: {
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

        const scheduledCollections = await prisma.mediaCollection.findMany({
            where: {
                OR: [
                    { isSeasonal: true },
                    { activeDays: { not: "all" } },
                    { activeTimeRange: { not: "all_day" } }
                ],
                ...(serverId ? { serverId } : {}),
                ...(sectionKey ? { sectionKey } : {})
            }
        });

        const now = new Date();
        const curMonth = now.getMonth() + 1; // 1-12
        const curDay = now.getDate();        // 1-31
        const curVal = curMonth * 100 + curDay;
        const curHour = now.getHours();      // 0-23
        const daysMap = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        const curDayCode = daysMap[now.getDay()];

        const results: Array<{ title: string; active: boolean; action: string }> = [];

        for (const coll of scheduledCollections) {
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

                if (serverUrl && coll.ratingKey && coll.sectionKey) {
                    const prefix = coll.sortPrefix || `!02_Schedule_`;
                    const effectiveSort = `${prefix}${coll.sortTitle || coll.title}`;
                    await updatePlexCollectionPromotionAndOrder(
                        serverUrl,
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
                    );
                } else if (!coll.ratingKey) {
                    // Auto-sync collection if not yet created on Plex
                    await syncCollectionToPlexAction(coll.id).catch(() => {});
                }

                results.push({ title: coll.title, active: true, action: "Promoted to Plex Home & Recommended (Schedule Active)" });
            } else {
                // Demote / hide inactive scheduled collection
                const shouldHide = coll.seasonalAction === "promote_hide" || coll.seasonalAction === "create_delete";

                await prisma.mediaCollection.update({
                    where: { id: coll.id },
                    data: { promotedToHome: !shouldHide }
                });

                if (serverUrl && coll.ratingKey && coll.sectionKey) {
                    await updatePlexCollectionPromotionAndOrder(
                        serverUrl,
                        token,
                        coll.sectionKey,
                        coll.ratingKey,
                        {
                            promotedToHome: !shouldHide,
                            promotedToRecommended: !shouldHide,
                            collectionMode: coll.collectionMode || "default"
                        }
                    );
                }

                results.push({ title: coll.title, active: false, action: shouldHide ? "Hidden from Plex Home (Out of Schedule/Season)" : "Demoted" });
            }
        }

        logger.addLog("INFO", "CURATION", `Evaluated ${scheduledCollections.length} scheduled & seasonal collections.`);
        return {
            success: true,
            evaluatedCount: scheduledCollections.length,
            results,
            message: `Evaluated ${scheduledCollections.length} scheduled & seasonal collection schedules.`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function syncSeasonalAndScheduledCollectionsAction(serverId?: string, sectionKey?: string) {
    await verifyAdmin();
    return await syncSeasonalAndScheduledCollectionsInternal(serverId, sectionKey);
}

export async function syncLeavingSoonCollectionHubInternal(serverId?: string, sectionKey?: string) {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;

        // Query active leaving soon items
        const leavingSoonItems = await prisma.mediaContentAdvisory.findMany({
            where: {
                isLeavingSoon: true,
                ...(serverId ? { serverId } : {})
            }
        });

        const autoHideEmpty = settings?.leavingSoonAutoHideEmpty ?? true;
        const shouldPromote = leavingSoonItems.length > 0 ? (settings?.leavingSoonPromotedToHome ?? true) : !autoHideEmpty;

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
                    sectionKey,
                    sourceType: "plex_query",
                    sourceQuery: "tag:leaving-soon",
                    orderIndex: settings?.leavingSoonHomeOrder ?? 0,
                    sortPrefix: "!00_",
                    promotedToHome: shouldPromote,
                    promotedToRecommended: settings?.leavingSoonPromotedToRecommended ?? true,
                    promotedToSharedHome: settings?.leavingSoonPromotedToSharedHome ?? true
                }
            });
        }

        if (collection) {
            await prisma.mediaCollection.update({
                where: { id: collection.id },
                data: {
                    itemCount: leavingSoonItems.length,
                    promotedToHome: shouldPromote,
                    orderIndex: settings?.leavingSoonHomeOrder ?? 0,
                    sortPrefix: "!00_"
                }
            });

            if (collection.ratingKey && serverUrl && collection.sectionKey) {
                await updatePlexCollectionPromotionAndOrder(
                    serverUrl,
                    token,
                    collection.sectionKey,
                    collection.ratingKey,
                    {
                        sortTitle: "!00_LeavingSoon",
                        promotedToHome: shouldPromote,
                        promotedToRecommended: settings?.leavingSoonPromotedToRecommended ?? true,
                        promotedToSharedHome: settings?.leavingSoonPromotedToSharedHome ?? true
                    }
                );
            } else if (leavingSoonItems.length > 0 && collection.sectionKey) {
                await syncCollectionToPlexAction(collection.id).catch(() => {});
            }
        }

        return {
            success: true,
            leavingCount: leavingSoonItems.length,
            promotedToHome: shouldPromote,
            message: `Leaving Soon collection synced: ${leavingSoonItems.length} items (${shouldPromote ? "Promoted to Home #1" : "Hidden from Home"}).`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function syncLeavingSoonCollectionHubAction(serverId?: string, sectionKey?: string) {
    await verifyAdmin();
    return await syncLeavingSoonCollectionHubInternal(serverId, sectionKey);
}

export async function deleteMediaCollectionAction(collectionId: string, deleteFromPlex = true) {
    await verifyAdmin();
    try {
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

        if (collection) {
            if (deleteFromPlex && collection.ratingKey) {
                try {
                    const resolved = await resolveWorkingPlexServerConnection(collection.serverId || undefined);
                    if (resolved && resolved.serverUrl && resolved.token) {
                        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                        await deletePlexCollection(urlsToTry, resolved.token, collection.ratingKey);
                    }
                } catch (err: any) {
                    logger.addLog("WARN", "PLEX", `Could not delete collection "${collection.title}" from Plex: ${err.message}`);
                }
            }

            // Delete the canonical record AND any duplicate records matching this title / server / sectionKey
            await prisma.mediaCollection.deleteMany({
                where: {
                    OR: [
                        { id: collection.id },
                        { id: collectionId },
                        {
                            ...(collection.serverId ? { serverId: collection.serverId } : {}),
                            ...(collection.sectionKey ? { sectionKey: collection.sectionKey } : {}),
                            title: collection.title
                        }
                    ]
                }
            });
        } else {
            // Even if record wasn't found by findUnique, attempt deletion by id anyway
            await prisma.mediaCollection.deleteMany({
                where: { id: collectionId }
            }).catch(() => {});
        }

        return { success: true, message: `Deleted collection.` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

// Default Built-in High-DPI SVGs for Custom Badge Vault
const DEFAULT_BUILTIN_BADGE_DEFINITIONS: Array<{
    id: string;
    name: string;
    category: "resolution" | "hdr" | "codec" | "audio" | "edition" | "ratings" | "ribbon" | "studio" | "custom";
    position: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    matchRule: string;
    width: number;
    height: number;
    svgContent: string;
}> = [
    // 1. Resolution
    {
        id: "builtin_badge_4k_uhd",
        name: "4K UHD",
        category: "resolution",
        position: "top-right",
        matchRule: "4k",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4k" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4k)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="48" y="29" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="94" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="rgba(255,255,255,0.75)" text-anchor="middle" letter-spacing="1.5">UHD</text></svg>`
    },
    {
        id: "builtin_badge_1080p_fhd",
        name: "1080p FHD",
        category: "resolution",
        position: "top-right",
        matchRule: "1080p",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g1080" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g1080)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="48" y="29" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="17" fill="#38bdf8" text-anchor="middle">1080p</text><text x="98" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="rgba(255,255,255,0.75)" text-anchor="middle" letter-spacing="1.5">FHD</text></svg>`
    },
    {
        id: "builtin_badge_720p_hd",
        name: "720p HD",
        category: "resolution",
        position: "top-right",
        matchRule: "720p",
        width: 130,
        height: 46,
        svgContent: `<svg width="130" height="46" viewBox="0 0 130 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g720" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#64748b"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="126" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g720)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="122" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="45" y="29" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="17" fill="#cbd5e1" text-anchor="middle">720p</text><text x="90" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle" letter-spacing="1.5">HD</text></svg>`
    },
    {
        id: "builtin_badge_sd_480p",
        name: "SD / 480p",
        category: "resolution",
        position: "top-right",
        matchRule: "480p",
        width: 115,
        height: 46,
        svgContent: `<svg width="115" height="46" viewBox="0 0 115 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="111" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#64748b" stroke-width="1.5" filter="url(#sh)"/><line x1="8" y1="5" x2="107" y2="5" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round"/><text x="57" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#94a3b8" text-anchor="middle" letter-spacing="1.2">SD • 480p</text></svg>`
    },

    // 2. HDR & Dynamic Range
    {
        id: "builtin_badge_dolby_vision",
        name: "Dolby Vision",
        category: "hdr",
        position: "top-right",
        matchRule: "dv",
        width: 160,
        height: 46,
        svgContent: `<svg width="160" height="46" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdv" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="40%" stop-color="#c084fc"/><stop offset="100%" stop-color="#818cf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="156" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdv)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="152" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><g transform="translate(14, 15)"><rect x="0" y="0" width="3.5" height="16" rx="1" fill="#c084fc"/><path d="M 4 0 A 8 8 0 0 1 4 16 Z" fill="#c084fc"/><path d="M 16 0 A 8 8 0 0 0 16 16 Z" fill="#818cf8"/><rect x="17" y="0" width="3.5" height="16" rx="1" fill="#818cf8"/></g><text x="96" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="#f8fafc" text-anchor="middle" letter-spacing="1.5">DOLBY VISION</text></svg>`
    },
    {
        id: "builtin_badge_hdr10_plus",
        name: "HDR10+",
        category: "hdr",
        position: "top-right",
        matchRule: "hdr10+",
        width: 145,
        height: 46,
        svgContent: `<svg width="145" height="46" viewBox="0 0 145 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gplus" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="141" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gplus)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="137" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="72" y="29" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="15" fill="#38bdf8" text-anchor="middle" letter-spacing="1.5">HDR10+</text></svg>`
    },
    {
        id: "builtin_badge_hdr10",
        name: "HDR10",
        category: "hdr",
        position: "top-right",
        matchRule: "hdr10",
        width: 135,
        height: 46,
        svgContent: `<svg width="135" height="46" viewBox="0 0 135 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ghdr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="131" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#ghdr)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="127" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="67" y="29" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="15" fill="#38bdf8" text-anchor="middle" letter-spacing="1.5">HDR10</text></svg>`
    },

    // 3. Compounds (Dovetailed Resolution + HDR)
    {
        id: "builtin_badge_4k_dolby_vision",
        name: "4K UHD • Dolby Vision",
        category: "resolution",
        position: "top-right",
        matchRule: "4k + dv",
        width: 245,
        height: 46,
        svgContent: `<svg width="245" height="46" viewBox="0 0 245 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4kdv" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="40%" stop-color="#c084fc"/><stop offset="100%" stop-color="#818cf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.85"/></filter></defs><rect x="2" y="2" width="241" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4kdv)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="237" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="36" y="29" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle" letter-spacing="1.5">UHD</text><line x1="90" y1="10" x2="90" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><circle cx="90" cy="23" r="2.5" fill="rgba(255,255,255,0.4)"/><g transform="translate(104, 15)"><rect x="0" y="0" width="4" height="16" rx="1.2" fill="#c084fc"/><path d="M 5 0 A 8 8 0 0 1 5 16 Z" fill="#c084fc"/><path d="M 18 0 A 8 8 0 0 0 18 16 Z" fill="#818cf8"/><rect x="19" y="0" width="4" height="16" rx="1.2" fill="#818cf8"/></g><text x="180" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12.5" fill="#f8fafc" text-anchor="middle" letter-spacing="1.5">DOLBY VISION</text></svg>`
    },
    {
        id: "builtin_badge_4k_hdr10_plus",
        name: "4K UHD • HDR10+",
        category: "resolution",
        position: "top-right",
        matchRule: "4k + hdr10+",
        width: 230,
        height: 46,
        svgContent: `<svg width="230" height="46" viewBox="0 0 230 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4kplus" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.85"/></filter></defs><rect x="2" y="2" width="226" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4kplus)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="222" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="36" y="29" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle" letter-spacing="1.5">UHD</text><line x1="90" y1="10" x2="90" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><circle cx="90" cy="23" r="2.5" fill="rgba(255,255,255,0.4)"/><text x="160" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14" fill="#38bdf8" text-anchor="middle" letter-spacing="1.5">HDR10+</text></svg>`
    },
    {
        id: "builtin_badge_4k_hdr",
        name: "4K UHD • HDR",
        category: "resolution",
        position: "top-right",
        matchRule: "4k + hdr",
        width: 210,
        height: 46,
        svgContent: `<svg width="210" height="46" viewBox="0 0 210 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4khdr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.85"/></filter></defs><rect x="2" y="2" width="206" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4khdr)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="202" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="36" y="29" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle" letter-spacing="1.5">UHD</text><line x1="90" y1="10" x2="90" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><circle cx="90" cy="23" r="2.5" fill="rgba(255,255,255,0.4)"/><text x="150" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14.5" fill="#38bdf8" text-anchor="middle" letter-spacing="1.5">HDR</text></svg>`
    },

    // 4. Audio Codecs & Surround
    {
        id: "builtin_badge_dolby_atmos",
        name: "Dolby Atmos",
        category: "audio",
        position: "top-left",
        matchRule: "atmos",
        width: 160,
        height: 46,
        svgContent: `<svg width="160" height="46" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gatmos" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#818cf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="156" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gatmos)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="152" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><g transform="translate(14, 15)"><rect x="0" y="0" width="3.5" height="16" rx="1" fill="#38bdf8"/><path d="M 4 0 A 8 8 0 0 1 4 16 Z" fill="#38bdf8"/><path d="M 16 0 A 8 8 0 0 0 16 16 Z" fill="#818cf8"/><rect x="17" y="0" width="3.5" height="16" rx="1" fill="#818cf8"/></g><text x="96" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12.5" fill="#e0e7ff" text-anchor="middle" letter-spacing="1.8">ATMOS</text></svg>`
    },
    {
        id: "builtin_badge_dolby_truehd",
        name: "Dolby TrueHD",
        category: "audio",
        position: "top-left",
        matchRule: "truehd",
        width: 155,
        height: 46,
        svgContent: `<svg width="155" height="46" viewBox="0 0 155 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gthd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="151" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gthd)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="147" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="77" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12.5" fill="#e0e7ff" text-anchor="middle" letter-spacing="1.5">DOLBY TRUEHD</text></svg>`
    },
    {
        id: "builtin_badge_dts_x",
        name: "DTS:X",
        category: "audio",
        position: "top-left",
        matchRule: "dts:x",
        width: 135,
        height: 46,
        svgContent: `<svg width="135" height="46" viewBox="0 0 135 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdtsx" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fb923c"/><stop offset="100%" stop-color="#ea580c"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="131" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdtsx)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="127" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="67" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14" fill="#fed7aa" text-anchor="middle" letter-spacing="1.8">DTS:X</text></svg>`
    },
    {
        id: "builtin_badge_dts_hd_ma",
        name: "DTS-HD Master Audio",
        category: "audio",
        position: "top-left",
        matchRule: "dts-hd",
        width: 165,
        height: 46,
        svgContent: `<svg width="165" height="46" viewBox="0 0 165 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdtshd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#c2410c"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="161" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdtshd)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="157" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="82" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="#ffedd5" text-anchor="middle" letter-spacing="1.5">DTS-HD MA</text></svg>`
    },
    {
        id: "builtin_badge_flac_lossless",
        name: "FLAC Lossless",
        category: "audio",
        position: "top-left",
        matchRule: "flac",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gflac" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gflac)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12.5" fill="#a7f3d0" text-anchor="middle" letter-spacing="1.5">FLAC LOSSLESS</text></svg>`
    },
    {
        id: "builtin_badge_7_1_surround",
        name: "7.1 Surround",
        category: "audio",
        position: "top-left",
        matchRule: "7.1",
        width: 110,
        height: 46,
        svgContent: `<svg width="110" height="46" viewBox="0 0 110 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="106" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#38bdf8" stroke-width="1.5" filter="url(#sh)"/><line x1="8" y1="5" x2="102" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="55" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#bae6fd" text-anchor="middle" letter-spacing="1.5">7.1 CH</text></svg>`
    },
    {
        id: "builtin_badge_5_1_surround",
        name: "5.1 Surround",
        category: "audio",
        position: "top-left",
        matchRule: "5.1",
        width: 110,
        height: 46,
        svgContent: `<svg width="110" height="46" viewBox="0 0 110 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="106" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#38bdf8" stroke-width="1.5" filter="url(#sh)"/><line x1="8" y1="5" x2="102" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="55" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#bae6fd" text-anchor="middle" letter-spacing="1.5">5.1 CH</text></svg>`
    },

    // 5. Video Codecs
    {
        id: "builtin_badge_hevc",
        name: "HEVC / H.265",
        category: "codec",
        position: "top-right",
        matchRule: "hevc",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ghevc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#ghevc)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#c7d2fe" text-anchor="middle" letter-spacing="1.5">HEVC • 10b</text></svg>`
    },
    {
        id: "builtin_badge_av1",
        name: "AV1 Next-Gen",
        category: "codec",
        position: "top-right",
        matchRule: "av1",
        width: 130,
        height: 46,
        svgContent: `<svg width="130" height="46" viewBox="0 0 130 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gav1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="126" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gav1)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="122" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="65" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#a7f3d0" text-anchor="middle" letter-spacing="1.8">AV1 CODEC</text></svg>`
    },
    {
        id: "builtin_badge_avc_h264",
        name: "AVC / H.264",
        category: "codec",
        position: "top-right",
        matchRule: "avc",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#64748b" stroke-width="1.5" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#cbd5e1" text-anchor="middle" letter-spacing="1.5">AVC • H.264</text></svg>`
    },

    // 6. Editions & Cuts
    {
        id: "builtin_badge_imax_enhanced",
        name: "IMAX Enhanced",
        category: "edition",
        position: "bottom-right",
        matchRule: "imax",
        width: 165,
        height: 46,
        svgContent: `<svg width="165" height="46" viewBox="0 0 165 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gimax" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="161" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gimax)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="157" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="82" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12.5" fill="#fdf4ff" text-anchor="middle" letter-spacing="1.5">IMAX ENHANCED</text></svg>`
    },
    {
        id: "builtin_badge_criterion",
        name: "The Criterion Collection",
        category: "edition",
        position: "bottom-right",
        matchRule: "criterion",
        width: 175,
        height: 46,
        svgContent: `<svg width="175" height="46" viewBox="0 0 175 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcrit" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="171" height="42" rx="8" fill="rgba(20, 15, 5, 0.95)" stroke="url(#gcrit)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="167" y2="5" stroke="rgba(254,240,138,0.5)" stroke-width="1.2" stroke-linecap="round"/><text x="87" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12.5" fill="#facc15" text-anchor="middle" letter-spacing="1.8">CRITERION</text></svg>`
    },
    {
        id: "builtin_badge_remux",
        name: "Remux Lossless",
        category: "edition",
        position: "bottom-right",
        matchRule: "remux",
        width: 160,
        height: 46,
        svgContent: `<svg width="160" height="46" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gremux" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="156" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gremux)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="152" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="80" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="#d1fae5" text-anchor="middle" letter-spacing="1.5">REMUX • LOSSLESS</text></svg>`
    },
    {
        id: "builtin_badge_directors_cut",
        name: "Director's Cut",
        category: "edition",
        position: "bottom-right",
        matchRule: "directors_cut",
        width: 165,
        height: 46,
        svgContent: `<svg width="165" height="46" viewBox="0 0 165 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f472b6"/><stop offset="100%" stop-color="#db2777"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="161" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdc)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="157" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="82" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="#fdf2f8" text-anchor="middle" letter-spacing="1.5">DIRECTOR'S CUT</text></svg>`
    },

    // 7. Studios & Networks
    {
        id: "builtin_badge_netflix",
        name: "Netflix",
        category: "studio",
        position: "bottom-left",
        matchRule: "netflix",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#ef4444" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle" letter-spacing="2">NETFLIX</text></svg>`
    },
    {
        id: "builtin_badge_disney",
        name: "Disney+",
        category: "studio",
        position: "bottom-left",
        matchRule: "disney",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdisney" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdisney)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle" letter-spacing="1.8">DISNEY+</text></svg>`
    },
    {
        id: "builtin_badge_hbo_max",
        name: "HBO Max",
        category: "studio",
        position: "bottom-left",
        matchRule: "hbo",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ghbo" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#c084fc"/><stop offset="100%" stop-color="#9333ea"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#ghbo)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle" letter-spacing="1.8">HBO MAX</text></svg>`
    },
    {
        id: "builtin_badge_apple_tv",
        name: "Apple TV+",
        category: "studio",
        position: "bottom-left",
        matchRule: "apple_tv",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#e2e8f0" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">APPLE TV+</text></svg>`
    },
    {
        id: "builtin_badge_prime_video",
        name: "Prime Video",
        category: "studio",
        position: "bottom-left",
        matchRule: "amazon",
        width: 145,
        height: 46,
        svgContent: `<svg width="145" height="46" viewBox="0 0 145 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="141" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#00a8e1" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="137" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="72" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12.5" fill="#38bdf8" text-anchor="middle" letter-spacing="1.5">PRIME VIDEO</text></svg>`
    },
    {
        id: "builtin_badge_a24",
        name: "A24",
        category: "studio",
        position: "bottom-left",
        matchRule: "a24",
        width: 110,
        height: 46,
        svgContent: `<svg width="110" height="46" viewBox="0 0 110 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="106" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#f59e0b" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="102" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="55" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="14" fill="#fde68a" text-anchor="middle" letter-spacing="2.5">A24</text></svg>`
    },
    {
        id: "builtin_badge_marvel",
        name: "Marvel Studios",
        category: "studio",
        position: "bottom-left",
        matchRule: "marvel",
        width: 145,
        height: 46,
        svgContent: `<svg width="145" height="46" viewBox="0 0 145 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="141" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#dc2626" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="137" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="72" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="13" fill="#fecaca" text-anchor="middle" letter-spacing="2">MARVEL</text></svg>`
    },

    // 8. Ratings & Accolades
    {
        id: "builtin_badge_certified_fresh",
        name: "Certified Fresh",
        category: "ratings",
        position: "bottom-left",
        matchRule: "rt_fresh",
        width: 155,
        height: 46,
        svgContent: `<svg width="155" height="46" viewBox="0 0 155 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gfresh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f43f5e"/><stop offset="100%" stop-color="#be123c"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="151" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gfresh)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="147" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="24" y="28" font-size="16">🍅</text><text x="86" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11.5" fill="#fda4af" text-anchor="middle" letter-spacing="1.5">CERTIFIED FRESH</text></svg>`
    },
    {
        id: "builtin_badge_imdb_top250",
        name: "IMDb Top 250",
        category: "ratings",
        position: "bottom-left",
        matchRule: "imdb_top_250",
        width: 150,
        height: 46,
        svgContent: `<svg width="150" height="46" viewBox="0 0 150 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gtop" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="146" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gtop)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="142" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><rect x="12" y="11" width="30" height="22" rx="3.5" fill="#f5c518"/><text x="27" y="26" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="10" fill="#000" text-anchor="middle">IMDb</text><text x="92" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="#facc15" text-anchor="middle" letter-spacing="1.2">TOP 250</text></svg>`
    },
    {
        id: "builtin_badge_metacritic_must_see",
        name: "Metacritic Must-See",
        category: "ratings",
        position: "bottom-left",
        matchRule: "metacritic_must_see",
        width: 155,
        height: 46,
        svgContent: `<svg width="155" height="46" viewBox="0 0 155 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gmc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#86efac"/><stop offset="100%" stop-color="#16a34a"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="151" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gmc)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="147" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><rect x="12" y="11" width="26" height="22" rx="3.5" fill="#66cc33"/><text x="25" y="26" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="10" fill="#fff" text-anchor="middle">MC</text><text x="92" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="11.5" fill="#86efac" text-anchor="middle" letter-spacing="1.2">MUST-SEE</text></svg>`
    },
    {
        id: "builtin_badge_oscar_winner",
        name: "Oscar Winner",
        category: "ratings",
        position: "bottom-left",
        matchRule: "oscar_winner",
        width: 150,
        height: 46,
        svgContent: `<svg width="150" height="46" viewBox="0 0 150 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="goscar" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="146" height="42" rx="8" fill="rgba(20, 15, 5, 0.95)" stroke="url(#goscar)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="142" y2="5" stroke="rgba(254,240,138,0.5)" stroke-width="1.2" stroke-linecap="round"/><text x="24" y="28" font-size="15">🏆</text><text x="86" y="28" font-family="system-ui, -apple-system, sans-serif" font-weight="900" font-size="12" fill="#facc15" text-anchor="middle" letter-spacing="1.5">BEST PICTURE</text></svg>`
    }
];

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
 * Server action to install / reset all 35+ essential custom badges in bulk with 1 click.
 */
export async function seedDefaultCustomBadgesAction() {
    await verifyAdmin();
    try {
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
 * Server action to upload and install a custom badge file (SVG, PNG, WebP).
 */
export async function uploadCustomBadgeAction(formData: FormData) {
    await verifyAdmin();
    try {
        const file = formData.get("file") as File | null;
        const name = (formData.get("name") as string) || "Custom Badge";
        const category = (formData.get("category") as string) || "custom";
        const position = (formData.get("position") as string) || "top-right";
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
    await verifyAdmin();
    try {
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

        // Auto-heal any badges with outdated or truncated match rules (in memory during retrieval)
        for (const b of badges) {
            const inferred = inferBadgeCategoryAndRule(b.filePath || "", b.name || "");
            if (inferred.suggestedMatchRule && (!b.matchRule || ((b.matchRule === "4k" || b.matchRule === "1080p") && inferred.suggestedMatchRule !== b.matchRule))) {
                b.matchRule = inferred.suggestedMatchRule;
                if (!b.category || b.category === "custom") {
                    b.category = inferred.category;
                }
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
        const rules = await prisma.mediaOverlayRule.findMany({
            where: {
                ...(serverId ? { serverId } : {}),
                ...(sectionKey ? { sectionKey } : {})
            },
            orderBy: { createdAt: "desc" }
        });

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
    name: string;
    serverId: string;
    sectionKey: string;
    overlayType: string;
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
    customBadgeIds?: string[];
    layerPriorityOrder?: string[] | string | any;
    enabled?: boolean;
}) {
    await verifyAdmin();
    try {
        let serializedLayerOrder: string | null = null;
        if (data.layerPriorityOrder || data.ribbonMode || data.tieredRibbons || data.dovetailResolutionHdr !== undefined) {
            const rawOrder = Array.isArray(data.layerPriorityOrder) 
                ? data.layerPriorityOrder 
                : (typeof data.layerPriorityOrder === "object" && data.layerPriorityOrder?.order) 
                    ? data.layerPriorityOrder.order 
                    : typeof data.layerPriorityOrder === "string" 
                        ? JSON.parse(data.layerPriorityOrder) 
                        : undefined;
            
            serializedLayerOrder = JSON.stringify({
                order: rawOrder,
                ribbonMode: data.ribbonMode || "single",
                tieredRibbons: data.tieredRibbons || null,
                maxRibbonTiers: data.maxRibbonTiers || 3,
                dovetailResolutionHdr: data.dovetailResolutionHdr ?? true
            });
        }

        const ruleData = {
            name: data.name,
            serverId: data.serverId,
            sectionKey: data.sectionKey,
            overlayType: data.overlayType,
            position: data.position || "top-right",
            videoPosition: data.videoPosition || data.position || "top-right",
            audioPosition: data.audioPosition || "top-left",
            editionPosition: data.editionPosition || "bottom-right",
            ratingPosition: data.ratingPosition || "bottom-left",
            resolutionPosition: data.resolutionPosition || data.videoPosition || data.position || "top-right",
            hdrPosition: data.hdrPosition || data.videoPosition || data.position || "top-right",
            codecPosition: data.codecPosition || data.videoPosition || data.position || "top-right",
            channelsPosition: data.channelsPosition || data.audioPosition || "top-left",
            studioPosition: data.studioPosition || data.editionPosition || "bottom-left",
            contentRatingPosition: data.contentRatingPosition || data.ratingPosition || "bottom-left",
            ratingsPosition: data.ratingsPosition || data.ratingPosition || "bottom-left",
            showRibbon: data.showRibbon ?? false,
            ribbonPosition: data.ribbonPosition || "top-right",
            ribbonTheme: data.ribbonTheme || "purple",
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
            rule = await prisma.mediaOverlayRule.create({
                data: ruleData
            });
        }

        return { success: true, rule, message: `Overlay rule "${data.name}" saved.` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function applyOverlaysToLibraryInternal(serverId: string, sectionKey: string, ruleId?: string) {
    try {
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured." };
        const serverUrl = resolved.serverUrl;
        const token = resolved.token;

        // Fetch active custom badges
        const activeCustomBadges = await prisma.customBadge.findMany({
            where: { enabled: true }
        });

        // Fetch rule options
        let overlayOpts: OverlayOptions = {
            showResolution: true,
            showHdr: true,
            showAudio: true,
            showAudioChannels: false,
            showCodec: false,
            showEdition: false,
            showStudio: false,
            showContentRating: false,
            showRatings: false,
            position: "top-right",
            resolutionPosition: "top-right",
            hdrPosition: "top-right",
            codecPosition: "top-right",
            audioPosition: "top-left",
            channelsPosition: "top-left",
            editionPosition: "bottom-right",
            studioPosition: "bottom-left",
            contentRatingPosition: "bottom-left",
            ratingsPosition: "bottom-left",
            theme: "glass",
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

        if (ruleId) {
            const rule = await prisma.mediaOverlayRule.findUnique({ where: { id: ruleId } });
            if (rule) {
                let ruleRibbonMode: "single" | "tiered" | "auto_stack" | "waterfall" = "single";
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
                    editionPosition: (rule.editionPosition as any) || "bottom-right",
                    ratingPosition: (rule.ratingPosition as any) || "bottom-left",
                    resolutionPosition: (rule.resolutionPosition as any) || (rule.videoPosition as any) || (rule.position as any) || "top-right",
                    hdrPosition: (rule.hdrPosition as any) || (rule.videoPosition as any) || (rule.position as any) || "top-right",
                    codecPosition: (rule.codecPosition as any) || (rule.videoPosition as any) || (rule.position as any) || "top-right",
                    channelsPosition: (rule.channelsPosition as any) || (rule.audioPosition as any) || "top-left",
                    studioPosition: (rule.studioPosition as any) || (rule.editionPosition as any) || "bottom-left",
                    contentRatingPosition: (rule.contentRatingPosition as any) || (rule.ratingPosition as any) || "bottom-left",
                    ratingsPosition: (rule.ratingsPosition as any) || (rule.ratingPosition as any) || "bottom-left",
                    showRibbon: rule.showRibbon ?? false,
                    ribbonMode: ruleRibbonMode,
                    tieredRibbons: ruleTieredRibbons,
                    maxRibbonTiers: ruleMaxRibbonTiers,
                    ribbonPosition: (rule.ribbonPosition as any) || "top-right",
                    ribbonTheme: (rule.ribbonTheme as any) || "purple",
                    ribbonText: rule.ribbonText || undefined,
                    ribbonType: (rule.ribbonType as any) || "auto_quality",
                    theme: (rule.theme as any) || "glass",
                    dovetailResolutionHdr: ruleDovetail,
                    badgeScale: (rule.badgeScale as number) || 1.0,
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
        }

        // Fetch library media items
        const urlsToTry = [serverUrl, ...resolved.allCandidateUrls.filter(u => u !== serverUrl)];
        const items = await getPlexLibraryMediaItems(urlsToTry, token, sectionKey, 200);

        let successCount = 0;
        for (const it of items) {
            // Apply if item has quality badges, leaving soon, or custom badges are active
            if (it.detectedBadges.resolution || it.detectedBadges.hdr || it.detectedBadges.audio || it.detectedBadges.edition || it.detectedBadges.studio || activeCustomBadges.length > 0) {
                const res = await backupAndApplyOverlay(serverUrl, token, serverId, it, overlayOpts);
                if (res.success) successCount++;
            }
        }

        if (ruleId) {
            await prisma.mediaOverlayRule.update({
                where: { id: ruleId },
                data: {
                    itemCount: successCount,
                    lastAppliedAt: new Date()
                }
            });
        }

        return {
            success: true,
            appliedCount: successCount,
            totalEvaluated: items.length,
            message: `Applied poster overlays & badges to ${successCount} items on Plex.`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function applyOverlaysToLibraryAction(serverId: string, sectionKey: string, ruleId?: string) {
    await verifyAdmin();
    return await applyOverlaysToLibraryInternal(serverId, sectionKey, ruleId);
}

export async function revertLibraryOverlaysAction(serverId: string) {
    await verifyAdmin();
    try {
        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: `Plex server "${serverId}" unreachable or token not configured.` };

        const result = await restoreAllOriginalArtworks(resolved.serverUrl, resolved.token, resolved.serverId);
        return result;
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getLeavingSoonItemsAction(serverId?: string) {
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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

        return { success: true, advisory, message: `Flagged "${data.title}" as leaving soon.` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function unmarkItemLeavingSoonAction(ratingKey: string, serverId: string) {
    await verifyAdmin();
    try {
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
}

export async function getPrunePreviewAction(options?: {
    targetServerId?: string;
    targetSectionKey?: string;
    criteria?: {
        minAgeDays?: number;
        unwatchedOnly?: boolean;
        maxCandidates?: number;
    };
}) {
    await verifyAdmin();
    try {
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
                unwatchedOnly: criteria?.unwatchedOnly ?? settings?.pruneUnwatchedOnly ?? true,
                maxCandidates: criteria?.maxCandidates ?? 50,
                sectionKeys: eligibleSectionKeys
            });

            allCandidates.push(...res.candidates);
            totalRecoverable += res.totalRecoverableGb;
            totalEvaluated += res.evaluatedCount;
        }

        allCandidates.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));

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
    } = {}
) {
    await verifyAdmin();
    try {
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

        const enabledServersForOverlays: string[] = settings?.enabledServersForOverlays 
            ? JSON.parse(settings.enabledServersForOverlays) 
            : [];
        const enabledServersForCollections: string[] = settings?.enabledServersForCollections 
            ? JSON.parse(settings.enabledServersForCollections) 
            : [];

        const results: { ratingKey: string; title: string; serverName: string; action: string; success: boolean }[] = [];

        for (const it of items) {
            const resolved = await resolveWorkingPlexServerConnection(it.serverId);
            const serverUrl = resolved?.serverUrl || "";
            const serverName = resolved?.serverName || it.serverId;
            const serverToken = resolved?.token || token;

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

                // Tag Plex collection if server enabled
                const canTagCollection = enabledServersForCollections.length === 0 || enabledServersForCollections.includes(it.serverId);
                if (shouldTagCollection && canTagCollection && serverUrl && it.sectionKey) {
                    await syncPlexCollection(
                        serverUrl,
                        serverToken,
                        it.sectionKey,
                        "⚠️ Leaving Soon",
                        [it.ratingKey],
                        {
                            summary: "These items are scheduled to be removed soon to free up disk space. Watch them while you can!",
                            sortTitle: "!000_LeavingSoon"
                        }
                    );
                }

                // Apply overlay if server enabled
                const canApplyOverlay = enabledServersForOverlays.length === 0 || enabledServersForOverlays.includes(it.serverId);
                if (shouldApplyOverlay && canApplyOverlay && serverUrl && it.sectionKey) {
                    const mediaItems = await getPlexLibraryMediaItems(serverUrl, serverToken, it.sectionKey, 50);
                    const matched = mediaItems.find(m => m.ratingKey === it.ratingKey);
                    if (matched) {
                        await backupAndApplyOverlay(
                            serverUrl,
                            serverToken,
                            it.serverId,
                            matched,
                            {
                                showLeavingSoon: true,
                                leavingSoonDays: daysNotice,
                                position: "top-right",
                                theme: "glass"
                            }
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
        await prisma.settings.upsert({
            where: { id: "global" },
            update: { serverStorageConfig: JSON.stringify(storageConfig) },
            create: { id: "global", serverStorageConfig: JSON.stringify(storageConfig) }
        });
        return { success: true, message: "Server storage mount paths saved successfully." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function validateDirectoryPathAction(pathStr: string) {
    await verifyAdmin();
    if (!pathStr || !pathStr.trim()) return { success: false, error: "Path is empty." };
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    includeBlocked = false
) {
    await verifyAdmin();
    try {
        if (!query || query.trim().length === 0) return { success: true, items: [] };

        const resolved = await resolveWorkingPlexServerConnection(serverId);
        if (!resolved || !resolved.serverUrl) return { success: false, error: "Plex server unreachable or token not configured.", items: [] };

        let rawItems: PlexMediaStreamInfo[] = [];
        const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];

        for (const url of urlsToTry) {
            try {
                rawItems = await searchPlexLibraryItems(url, resolved.token, query.trim(), sectionKey);
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
        const resolved = await resolveWorkingPlexServerConnection(serverId);
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
        customBadgeIds?: string[];
        layerPriorityOrder?: string[];
    }
) {
    await verifyAdmin();
    try {
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

        const res = await backupAndApplyOverlay(
            serverUrl,
            token,
            serverId,
            inspection.item,
            {
                position: (options?.position as any) || "top-right",
                videoPosition: (options?.videoPosition as any) || (options?.position as any) || "top-right",
                audioPosition: (options?.audioPosition as any) || "top-left",
                editionPosition: (options?.editionPosition as any) || "bottom-right",
                ratingPosition: (options?.ratingPosition as any) || "bottom-left",
                resolutionPosition: (options?.resolutionPosition as any) || (options?.videoPosition as any) || (options?.position as any) || "top-right",
                hdrPosition: (options?.hdrPosition as any) || (options?.videoPosition as any) || (options?.position as any) || "top-right",
                codecPosition: (options?.codecPosition as any) || (options?.videoPosition as any) || (options?.position as any) || "top-right",
                channelsPosition: (options?.channelsPosition as any) || (options?.audioPosition as any) || "top-left",
                studioPosition: (options?.studioPosition as any) || (options?.editionPosition as any) || "bottom-left",
                contentRatingPosition: (options?.contentRatingPosition as any) || (options?.ratingPosition as any) || "bottom-left",
                ratingsPosition: (options?.ratingsPosition as any) || (options?.ratingPosition as any) || "bottom-left",
                showRibbon: options?.showRibbon ?? false,
                ribbonMode: (options?.ribbonMode as any) || "single",
                tieredRibbons: options?.tieredRibbons,
                maxRibbonTiers: options?.maxRibbonTiers || 3,
                ribbonPosition: (options?.ribbonPosition as any) || "top-right",
                ribbonTheme: (options?.ribbonTheme as any) || "purple",
                ribbonText: options?.ribbonText || undefined,
                ribbonType: (options?.ribbonType as any) || "auto_quality",
                theme: (options?.theme as any) || "glass",
                dovetailResolutionHdr: options?.dovetailResolutionHdr ?? true,
                badgeScale: options?.badgeScale ?? 1.0,
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
    await verifyAdmin();
    try {
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

        // 1. Seasonal & Scheduled Collections Sync
        if (settings.curationSyncCollections !== false) {
            try {
                const seasonalRes = await syncSeasonalAndScheduledCollectionsInternal();
                seasonalCount = seasonalRes.evaluatedCount || 0;
                details.push(`Evaluated ${seasonalCount} seasonal collection schedules.`);
            } catch (sErr: any) {
                details.push(`Seasonal sync error: ${sErr.message}`);
            }
        }

        // 2. Poster Overlays on New Library Additions
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

        // 3. Leaving Soon Hub Sync
        if (settings.curationSyncPruning !== false) {
            try {
                const leaveRes = await syncLeavingSoonCollectionHubInternal();
                leavingSoonCount = leaveRes.leavingCount || 0;
                details.push(`Leaving Soon hub synced: ${leavingSoonCount} items scheduled.`);
            } catch (lErr: any) {
                details.push(`Leaving Soon hub sync error: ${lErr.message}`);
            }
        }

        // 4. Automated IMDb Parental Rating Tags Sync
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
}

/**
 * Server action to clear all IMDb Parental Advisory Tags from a library section.
 */
export async function clearParentalTagsFromLibraryAction(
    serverId: string,
    sectionKey: string | number,
    prefix?: string
) {
    await verifyAdmin();
    const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    const tagPrefix = prefix || settings?.parentalTagPrefix || "IMDb";
    return await clearParentalTagsFromLibrary(serverId, sectionKey, tagPrefix);
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
    await verifyAdmin();
    await saveParentalAdvisory(ratingKey, serverId, title, advisory);
    return { success: true };
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
    category: "resolution" | "hdr" | "codec" | "audio" | "edition" | "ratings" | "ribbon" | "studio" | "custom";
    suggestedPosition: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    suggestedMatchRule: string;
} {
    const rawBase = filename.replace(/\.[^/.]+$/, "");
    const baseLower = rawBase.toLowerCase();
    const fullLower = `${filePath}/${filename}`.toLowerCase();

    // 1. Dovetailed & Multi-Spec Detection for Resolution + HDR / Dynamic Range
    // e.g. 4kdvhdrplus, 4kdvplus, 4kdvhdr, 4kplus, 4khdrplus, 4khdr, 4kdv, 1080pdvhdrplus, 1080phdr, 1080pdv, 720phdr, 480phdr, 576phdr
    
    // Check for resolution component:
    let detectedRes: string | null = null;
    if (/\b4k\b|4k|2160p|uhd|ultra-hd/i.test(baseLower) || (fullLower.includes("4k") && !fullLower.includes("1080"))) {
        detectedRes = "4k";
    } else if (/\b1080p\b|1080p|1080|fhd/i.test(baseLower)) {
        detectedRes = "1080p";
    } else if (/\b720p\b|720p|720/i.test(baseLower)) {
        detectedRes = "720p";
    } else if (/\b480p\b|480p|480|\b576p\b|576p|576|\bsd\b/i.test(baseLower)) {
        detectedRes = "480p";
    }

    // Check for HDR / Dynamic Range component:
    const hdrComponents: string[] = [];
    if (/dv|dolby.*vision|dovi/i.test(baseLower)) {
        hdrComponents.push("dv");
    }
    if (/hdr10\+|hdr\+|hdrplus|\bplus\b|hdr10plus/i.test(baseLower) || (/plus/i.test(baseLower) && !/disney/i.test(baseLower))) {
        hdrComponents.push("hdr10+");
    } else if (/hdr10/i.test(baseLower)) {
        hdrComponents.push("hdr10");
    } else if (/hdr/i.test(baseLower)) {
        hdrComponents.push("hdr");
    }

    // Check for Audio / Channel combinations:
    const audioComponents: string[] = [];
    if (/atmos/i.test(baseLower)) audioComponents.push("atmos");
    if (/truehd/i.test(baseLower)) audioComponents.push("truehd");
    if (/dts[-:_]?x/i.test(baseLower)) audioComponents.push("dts:x");
    else if (/dts[-:_]?hd|dtshd|dts[-:_]?ma/i.test(baseLower)) audioComponents.push("dts-hd");
    else if (/dts/i.test(baseLower)) audioComponents.push("dts");
    if (/flac/i.test(baseLower)) audioComponents.push("flac");
    if (/eac3/i.test(baseLower)) audioComponents.push("eac3");
    if (/ac3/i.test(baseLower) && !/eac3/i.test(baseLower)) audioComponents.push("ac3");
    if (/aac/i.test(baseLower)) audioComponents.push("aac");

    if (/7\.1|7_1/i.test(baseLower)) audioComponents.push("7.1");
    else if (/5\.1|5_1/i.test(baseLower)) audioComponents.push("5.1");
    else if (/2\.0|2_0/i.test(baseLower)) audioComponents.push("2.0");

    // Check for Video Codec:
    let detectedCodec: string | null = null;
    if (/hevc|h265|x265/i.test(baseLower)) detectedCodec = "hevc";
    else if (/av1/i.test(baseLower)) detectedCodec = "av1";
    else if (/prores/i.test(baseLower)) detectedCodec = "prores";
    else if (/avc|h264|x264/i.test(baseLower)) detectedCodec = "avc";

    // Check for Edition:
    let detectedEdition: string | null = null;
    if (/imax/i.test(baseLower)) detectedEdition = "imax";
    else if (/criterion/i.test(baseLower)) detectedEdition = "criterion";
    else if (/remux/i.test(baseLower)) detectedEdition = "remux";
    else if (/director/i.test(baseLower)) detectedEdition = "directors_cut";
    else if (/extended/i.test(baseLower)) detectedEdition = "extended";
    else if (/theatrical/i.test(baseLower)) detectedEdition = "theatrical";
    else if (/remaster/i.test(baseLower)) detectedEdition = "remastered";

    // Dovetailed Resolution + HDR combo (e.g. 4kplus, 4khdr, 4kdvhdrplus, 480phdr, 1080pdv)
    if (detectedRes && hdrComponents.length > 0) {
        return {
            category: "resolution",
            suggestedPosition: "top-right",
            suggestedMatchRule: `${detectedRes} + ${hdrComponents.join(" + ")}`
        };
    }

    // Resolution-only (e.g. 4k, 1080p, 720p, 480p, 576p, sd)
    if (detectedRes) {
        return {
            category: "resolution",
            suggestedPosition: "top-right",
            suggestedMatchRule: detectedRes
        };
    }

    // HDR-only (e.g. dv, hdr, hdr10, hdr10plus)
    if (hdrComponents.length > 0 || /dolby vision|dv-|dv\.|hdr10|hdr\+|hdr\./i.test(fullLower)) {
        return {
            category: "hdr",
            suggestedPosition: "top-right",
            suggestedMatchRule: hdrComponents.length > 0 ? hdrComponents.join(" + ") : (fullLower.includes("dv") || fullLower.includes("dolby") ? "dv" : "hdr")
        };
    }

    // Audio & Surround Channels
    if (audioComponents.length > 0 || fullLower.includes("audio") || /atmos|truehd|dts|flac|aac|eac3|ac3|5\.1|7\.1/i.test(fullLower)) {
        return {
            category: "audio",
            suggestedPosition: "top-left",
            suggestedMatchRule: audioComponents.length > 0 ? audioComponents.join(" + ") : "atmos"
        };
    }

    // Video Codecs
    if (detectedCodec || fullLower.includes("codec") || /hevc|av1|avc|prores|h264|h265|x264|x265|vc1|vp9/i.test(fullLower)) {
        return {
            category: "codec",
            suggestedPosition: "top-right",
            suggestedMatchRule: detectedCodec || (fullLower.includes("av1") ? "av1" : fullLower.includes("hevc") || fullLower.includes("h265") ? "hevc" : "avc")
        };
    }

    // Editions & Cuts
    if (detectedEdition || fullLower.includes("edition") || /imax|criterion|remux|director|extended|theatrical|uncut|unrated|remastered|restored|special/i.test(fullLower)) {
        return {
            category: "edition",
            suggestedPosition: "bottom-right",
            suggestedMatchRule: detectedEdition || "special"
        };
    }

    // Ratings & Scores
    if (fullLower.includes("rating") || fullLower.includes("audience") || /score|tomato|rotten|imdb|metacritic|tmdb/i.test(fullLower)) {
        return {
            category: "ratings",
            suggestedPosition: "bottom-left",
            suggestedMatchRule: fullLower.includes("tomato") || fullLower.includes("rotten") ? "rt" : "imdb"
        };
    }

    // Studios
    if (fullLower.includes("streaming") || fullLower.includes("studio") || fullLower.includes("network") || /netflix|disney|hbo|apple|prime|paramount|hulu|peacock|marvel|dc|a24/i.test(fullLower)) {
        let rule = "netflix";
        if (fullLower.includes("hbo")) rule = "hbo";
        else if (fullLower.includes("disney")) rule = "disney";
        else if (fullLower.includes("apple")) rule = "apple_tv";
        else if (fullLower.includes("prime") || fullLower.includes("amazon")) rule = "amazon";
        else if (fullLower.includes("paramount")) rule = "paramount";
        else if (fullLower.includes("marvel")) rule = "marvel";
        else if (fullLower.includes("a24")) rule = "a24";
        return {
            category: "studio",
            suggestedPosition: "bottom-left",
            suggestedMatchRule: rule
        };
    }

    // Gradients & Ribbons
    if (fullLower.includes("gradient") || fullLower.includes("ribbon") || fullLower.includes("banner")) {
        return {
            category: "ribbon",
            suggestedPosition: "top-right",
            suggestedMatchRule: "featured"
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    if (!badges || badges.length === 0) {
        return { success: false, error: "No badges selected for download." };
    }

    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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

/**
 * Server action to fetch trending media (All, Disney, Disney Kids, Netflix, Netflix Kids, Digital, Theatrical)
 * and compare with the selected Plex library to identify "In Library" vs "Not Requested / Missing".
 */
export async function getTrendingAndPlaceholderMediaAction(
    serverId?: string,
    sectionKey?: string,
    category: "all" | "disney" | "disney_kids" | "netflix" | "netflix_kids" | "digital" | "theatrical" = "all"
) {
    await verifyAdmin();
    try {
        let trendingItems: TmdbMediaItem[] = [];

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

        // Check against Plex Library if serverId and sectionKey are provided
        let libraryItems: any[] = [];
        if (serverId && sectionKey) {
            try {
                const resolved = await resolveWorkingPlexServerConnection(serverId);
                if (resolved && resolved.serverUrl) {
                    const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];
                    libraryItems = await getPlexLibraryMediaItems(urlsToTry, resolved.token, sectionKey, 1000);
                }
            } catch (err: any) {
                console.warn("[PLACEHOLDER-ACTION] Failed fetching library items for comparison:", err.message);
            }
        }

        const libraryTmdbIds = new Set(libraryItems.map(it => it.guids?.tmdb).filter(Boolean));
        const libraryImdbIds = new Set(libraryItems.map(it => it.guids?.imdb).filter(Boolean));
        const libraryTitles = new Map(libraryItems.map(it => [it.title?.toLowerCase().trim(), it]));

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
                detectedBadges: match?.detectedBadges
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
        bannerPosition?: "top" | "bottom" | "corner";
        daysRemaining?: number | string;
        formattedDate?: string;
        date?: string;
        source?: string;
        status?: string;
        reason?: string;
    } = {}
) {
    await verifyAdmin();
    try {
        const buffer = await generatePlaceholderPosterBuffer(posterUrl, title, {
            type: options.bannerType || "not_requested",
            customText: options.bannerText || "NOT REQUESTED",
            theme: options.bannerTheme || "crimson-red",
            position: options.bannerPosition || "bottom",
            daysRemaining: options.daysRemaining,
            formattedDate: options.formattedDate,
            date: options.date,
            source: options.source,
            status: options.status,
            reason: options.reason
        });

        const dataUrl = `data:image/png;base64,${buffer.toString("base64")}`;
        return { success: true, dataUrl };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Server action to create/deploy a placeholder item for a title not currently in the Plex library.
 * Writes to the configured coming soon share folder and saves the advisory record.
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
        bannerPosition?: "top" | "bottom" | "corner";
        daysRemaining?: number | string;
        formattedDate?: string;
        date?: string;
        source?: string;
        status?: string;
        reason?: string;
    }
) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const comingSoonShares: Record<string, string> = settings?.comingSoonShares 
            ? JSON.parse(settings.comingSoonShares) 
            : {};
        
        const sharePath = comingSoonShares[serverId];
        const bannerText = itemData.bannerText?.trim() || "NOT REQUESTED";
        const bannerType = itemData.bannerType || "not_requested";
        const bannerTheme = itemData.bannerTheme || "crimson-red";
        const bannerPosition = itemData.bannerPosition || "bottom";

        // Generate high-resolution composite placeholder poster
        const posterBuffer = await generatePlaceholderPosterBuffer(itemData.posterPath, itemData.title, {
            type: bannerType,
            customText: bannerText,
            theme: bannerTheme,
            position: bannerPosition,
            daysRemaining: itemData.daysRemaining,
            formattedDate: itemData.formattedDate,
            date: itemData.date,
            source: itemData.source,
            status: itemData.status,
            reason: itemData.reason
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

            // Save poster.png
            const posterFilePath = path.join(targetDir, "poster.png");
            fs.writeFileSync(posterFilePath, posterBuffer);

            // Save lightweight stub file (.strm or .disc)
            const stubFile = path.join(targetDir, `${cleanTitle}${yearStr}.disc`);
            fs.writeFileSync(stubFile, `[Portalarr Placeholder]\nTitle: ${itemData.title}\nTMDb ID: ${itemData.tmdbId}\nBanner: ${bannerText}\nCreated: ${new Date().toISOString()}\n`);

            shareSaved = true;
            createdFolderPath = targetDir;
            logger.addLog("SUCCESS", "CURATION", `Created coming soon placeholder on disk for "${itemData.title}" at "${targetDir}"`);
        }

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
                    bannerType,
                    mediaType: itemData.mediaType,
                    year: itemData.year,
                    posterPath: itemData.posterPath,
                    sharePath: createdFolderPath || null,
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
                    bannerType,
                    mediaType: itemData.mediaType,
                    year: itemData.year,
                    posterPath: itemData.posterPath,
                    sharePath: createdFolderPath || null,
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
            message: shareSaved
                ? `Created placeholder card & deployed to Coming Soon share for "${itemData.title}"!`
                : `Created "${bannerText}" placeholder card for "${itemData.title}"!`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
/**
 * Reads a local Kometa YAML configuration file from disk.
 */
export async function readLocalKometaConfigAction(customPath?: string) {
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
    await verifyAdmin();
    try {
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
