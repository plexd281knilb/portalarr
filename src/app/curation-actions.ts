"use server";

import fs from "fs";
import path from "path";
import sharp from "sharp";
import prisma from "@/lib/prisma";
import { decryptData, encryptData } from "@/lib/encryption";
import { getCurrentUser } from "@/app/auth-actions";
import { logger } from "@/lib/logger";
import { getPlexServerLibrarySections, getPlexServers } from "@/lib/plex";
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
    OverlayOptions 
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
    searchTmdbTv 
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
    resolveParentalAdvisory,
    saveParentalAdvisory,
    ParentalTaggingOptions,
    ParentalCategoryKey,
    ParentalSeverity
} from "@/lib/curation/parental-guide";

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
        curationSyncParentalTags: settings?.curationSyncParentalTags ?? true
    };
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

export async function getPlexServersAndSectionsAction() {
    await verifyAdmin();
    const settings = await prisma.settings.findFirst({ where: { id: "global" } });
    const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
    if (!token) return { success: false, error: "Plex token not configured." };

    const serversWithSections = await getPlexServerLibrarySections(token);
    return {
        success: true,
        servers: serversWithSections
    };
}

export async function getMediaCollectionsAction(serverId?: string, sectionKey?: string) {
    await verifyAdmin();
    try {
        const collections = await prisma.mediaCollection.findMany({
            where: {
                ...(serverId ? { serverId } : {}),
                ...(sectionKey ? { sectionKey } : {})
            },
            orderBy: [
                { orderIndex: "asc" },
                { createdAt: "desc" }
            ]
        });

        return { success: true, collections, presets: COLLECTION_PRESETS };
    } catch (e: any) {
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
    sortPrefix?: string;
    isSeasonal?: boolean;
    scheduleStartMonth?: number | null;
    scheduleStartDay?: number | null;
    scheduleEndMonth?: number | null;
    scheduleEndDay?: number | null;
    seasonalAction?: string | null;
}) {
    await verifyAdmin();
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
            sortPrefix: data.sortPrefix || "!00_",
            isSeasonal: data.isSeasonal ?? false,
            scheduleStartMonth: data.scheduleStartMonth,
            scheduleStartDay: data.scheduleStartDay,
            scheduleEndMonth: data.scheduleEndMonth,
            scheduleEndDay: data.scheduleEndDay,
            seasonalAction: data.seasonalAction || "promote_hide"
        };

        let collection;
        if (data.id) {
            collection = await prisma.mediaCollection.update({
                where: { id: data.id },
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
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const server = servers.find(s => s.clientIdentifier === collection.serverId) || servers[0];
        const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";

        if (!serverUrl) return { success: false, error: "Plex server connection URL not found." };

        // 1. Fetch library media items
        const libraryItems = await getPlexLibraryMediaItems(serverUrl, token, collection.sectionKey || "", 1000);

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
                const imdbIds = items.map((t: any) => t.imdbId).filter(Boolean);
                const titles = items.map((t: any) => t.title?.toLowerCase()).filter(Boolean);

                matchingRatingKeys.push(...libraryItems.filter(it => 
                    (it.guids.imdb && imdbIds.includes(it.guids.imdb)) ||
                    (it.title && titles.includes(it.title.toLowerCase()))
                ).map(it => it.ratingKey));
            }
        }

        if (matchingRatingKeys.length === 0) {
            return {
                success: false,
                message: `No matching library media found for collection criteria (${libraryItems.length} items evaluated).`
            };
        }

        // 3. Sync to Plex with Sort Prefix and Home Promotion
        const sortPrefix = collection.sortPrefix || `!${String(collection.orderIndex || 0).padStart(2, '0')}_`;
        const effectiveSortTitle = `${sortPrefix}${collection.sortTitle || collection.title}`;

        const syncResult = await syncPlexCollection(
            serverUrl,
            token,
            collection.sectionKey || "",
            collection.title,
            matchingRatingKeys,
            {
                summary: collection.summary || undefined,
                sortTitle: effectiveSortTitle,
                posterUrl: collection.posterUrl || undefined,
                promotedToHome: collection.promotedToHome,
                promotedToRecommended: collection.promotedToRecommended,
                promotedToSharedHome: collection.promotedToSharedHome,
                orderIndex: collection.orderIndex
            }
        );

        // 4. Update DB record
        await prisma.mediaCollection.update({
            where: { id: collection.id },
            data: {
                itemCount: matchingRatingKeys.length,
                lastSyncedAt: new Date(),
                ratingKey: syncResult.collectionRatingKey || undefined
            }
        });

        return {
            success: true,
            syncedCount: matchingRatingKeys.length,
            collectionRatingKey: syncResult.collectionRatingKey,
            message: `Synced "${collection.title}" with ${matchingRatingKeys.length} items to Plex!`
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
    }>
) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const server = servers.find(s => s.clientIdentifier === serverId) || servers[0];
        const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";

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
                    promotedToSharedHome: item.promotedToSharedHome ?? true
                }
            });

            if (serverUrl && updated.ratingKey) {
                const effectiveSortTitle = `${prefix}${updated.sortTitle || updated.title}`;
                await updatePlexCollectionPromotionAndOrder(
                    serverUrl,
                    token,
                    sectionKey,
                    updated.ratingKey,
                    {
                        sortTitle: effectiveSortTitle,
                        promotedToHome: item.promotedToHome ?? true,
                        promotedToRecommended: item.promotedToRecommended ?? true,
                        promotedToSharedHome: item.promotedToSharedHome ?? true
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

export async function syncSeasonalAndScheduledCollectionsAction(serverId?: string, sectionKey?: string) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const server = servers.find(s => (serverId ? s.clientIdentifier === serverId : true)) || servers[0];
        const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";

        const seasonalCollections = await prisma.mediaCollection.findMany({
            where: {
                isSeasonal: true,
                ...(serverId ? { serverId } : {}),
                ...(sectionKey ? { sectionKey } : {})
            }
        });

        const now = new Date();
        const curMonth = now.getMonth() + 1; // 1-12
        const curDay = now.getDate();        // 1-31
        const curVal = curMonth * 100 + curDay;

        const results: Array<{ title: string; active: boolean; action: string }> = [];

        for (const coll of seasonalCollections) {
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

            if (isInSeason) {
                // Promote active seasonal collection
                await prisma.mediaCollection.update({
                    where: { id: coll.id },
                    data: { promotedToHome: true, promotedToRecommended: true }
                });

                if (serverUrl && coll.ratingKey && coll.sectionKey) {
                    const prefix = coll.sortPrefix || `!02_Seasonal_`;
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
                            promotedToSharedHome: coll.promotedToSharedHome
                        }
                    );
                } else if (!coll.ratingKey) {
                    // Auto-sync collection if not yet created on Plex
                    await syncCollectionToPlexAction(coll.id).catch(() => {});
                }

                results.push({ title: coll.title, active: true, action: "Promoted to Plex Home & Recommended" });
            } else {
                // Demote / hide inactive seasonal collection
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
                            promotedToRecommended: !shouldHide
                        }
                    );
                }

                results.push({ title: coll.title, active: false, action: shouldHide ? "Hidden from Plex Home (Out of season)" : "Demoted" });
            }
        }

        logger.addLog("INFO", "CURATION", `Evaluated ${seasonalCollections.length} seasonal collections schedules.`);
        return {
            success: true,
            evaluatedCount: seasonalCollections.length,
            results,
            message: `Evaluated ${seasonalCollections.length} seasonal collection schedules.`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function syncLeavingSoonCollectionHubAction(serverId?: string, sectionKey?: string) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const server = servers.find(s => (serverId ? s.clientIdentifier === serverId : true)) || servers[0];
        const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";

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

export async function deleteMediaCollectionAction(collectionId: string, deleteFromPlex = true) {
    await verifyAdmin();
    try {
        const collection = await prisma.mediaCollection.findUnique({
            where: { id: collectionId }
        });

        if (!collection) return { success: false, error: "Collection not found." };

        if (deleteFromPlex && collection.ratingKey) {
            const settings = await prisma.settings.findFirst({ where: { id: "global" } });
            const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
            const serverUrl = settings?.mainPlexUrl || "";

            if (token && serverUrl) {
                await deletePlexCollection(serverUrl, token, collection.ratingKey);
            }
        }

        await prisma.mediaCollection.delete({ where: { id: collectionId } });

        return { success: true, message: `Deleted collection "${collection.title}".` };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getCustomBadgesAction() {
    await verifyAdmin();
    try {
        const badges = await prisma.customBadge.findMany({
            orderBy: { createdAt: "desc" }
        });
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
                const fs = require("fs");
                if (fs.existsSync(badge.filePath)) fs.unlinkSync(badge.filePath);
            } catch (err) {}
            await prisma.customBadge.delete({ where: { id } });
        }
        return { success: true, message: "Custom badge removed." };
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
    ribbonPosition?: string;
    ribbonTheme?: string;
    ribbonText?: string;
    ribbonType?: string;
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
    customBadgeIds?: string[];
    enabled?: boolean;
}) {
    await verifyAdmin();
    try {
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
            customBadgeIds: data.customBadgeIds ? JSON.stringify(data.customBadgeIds) : null,
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

export async function applyOverlaysToLibraryAction(serverId: string, sectionKey: string, ruleId?: string) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const server = servers.find(s => s.clientIdentifier === serverId) || servers[0];
        const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";

        if (!serverUrl) return { success: false, error: "Plex server connection URL not found." };

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
                    ribbonPosition: (rule.ribbonPosition as any) || "top-right",
                    ribbonTheme: (rule.ribbonTheme as any) || "purple",
                    ribbonText: rule.ribbonText || undefined,
                    ribbonType: (rule.ribbonType as any) || "auto_quality",
                    theme: (rule.theme as any) || "glass",
                    customBadges: activeCustomBadges.map(cb => ({
                        id: cb.id,
                        name: cb.name,
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
        const items = await getPlexLibraryMediaItems(serverUrl, token, sectionKey, 200);

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

export async function revertLibraryOverlaysAction(serverId: string) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        const serverUrl = settings?.mainPlexUrl || "";

        if (!token || !serverUrl) return { success: false, error: "Plex connection credentials not found." };

        const result = await restoreAllOriginalArtworks(serverUrl, token, serverId);
        return result;
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function getLeavingSoonItemsAction() {
    await verifyAdmin();
    try {
        const items = await prisma.mediaContentAdvisory.findMany({
            where: { isLeavingSoon: true },
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
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        const serverUrl = settings?.mainPlexUrl || "";

        if (token && serverUrl) {
            await restoreItemOriginalArtwork(serverUrl, token, serverId, ratingKey);
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

export async function runPruneSimulationAction(targetServerId?: string, criteria?: {
    minAgeDays?: number;
    unwatchedOnly?: boolean;
    maxCandidates?: number;
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

        // If targetServerId specified, evaluate only that server; otherwise evaluate enabled servers or all servers
        const targetServers = targetServerId 
            ? servers.filter(s => s.clientIdentifier === targetServerId)
            : enabledPruneServers.length > 0
                ? servers.filter(s => enabledPruneServers.includes(s.clientIdentifier))
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
            const serverUrl = s.connections[0]?.uri || settings?.mainPlexUrl || "";
            if (!serverUrl) continue;

            const res = await evaluatePruneCandidatesForServer(serverUrl, token, s.clientIdentifier, s.name, {
                minAgeDays: criteria?.minAgeDays ?? settings?.pruneMinAgeDays ?? 90,
                unwatchedOnly: criteria?.unwatchedOnly ?? settings?.pruneUnwatchedOnly ?? true,
                maxCandidates: criteria?.maxCandidates ?? 50
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
            const server = servers.find(s => s.clientIdentifier === it.serverId) || servers[0];
            const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";
            const serverName = server?.name || it.serverId;

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
                        token,
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
                    const mediaItems = await getPlexLibraryMediaItems(serverUrl, token, it.sectionKey, 50);
                    const matched = mediaItems.find(m => m.ratingKey === it.ratingKey);
                    if (matched) {
                        await backupAndApplyOverlay(
                            serverUrl,
                            token,
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
                    const plexDelRes = await deleteMediaFromPlexServer(serverUrl, token, it.ratingKey);
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
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        const serverUrl = settings?.mainPlexUrl || "";

        const whereClause = serverId ? { serverId } : {};

        // Find all leaving soon items to restore posters
        const advisories = await prisma.mediaContentAdvisory.findMany({
            where: { ...whereClause, isLeavingSoon: true }
        });

        if (token && serverUrl) {
            for (const adv of advisories) {
                if (adv.serverId && adv.ratingKey) {
                    await restoreItemOriginalArtwork(serverUrl, token, adv.serverId, adv.ratingKey).catch(() => {});
                }
            }
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
 * Searches Plex library items across hubs or a specific library section.
 */
export async function searchPlexLibraryItemsAction(serverId: string, query: string, sectionKey?: string) {
    await verifyAdmin();
    try {
        if (!query || query.trim().length === 0) return { success: true, items: [] };

        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const server = servers.find(s => s.clientIdentifier === serverId) || servers[0];
        const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";
        if (!serverUrl) return { success: false, error: "Plex server unreachable." };

        const items = await searchPlexLibraryItems(serverUrl, token, query.trim(), sectionKey);
        return { success: true, items };
    } catch (e: any) {
        return { success: false, error: e.message, items: [] };
    }
}

/**
 * Deep inspection of a single Plex media item (full video/audio telemetry, streams, parts, and overlays).
 */
export async function inspectPlexMediaItemAction(serverId: string, ratingKey: string) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const server = servers.find(s => s.clientIdentifier === serverId) || servers[0];
        const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";
        if (!serverUrl) return { success: false, error: "Plex server unreachable." };

        const inspection = await inspectPlexMediaItemFull(serverUrl, token, ratingKey, serverId);
        if (!inspection) return { success: false, error: "Media item not found on Plex." };

        const customBadges = await prisma.customBadge.findMany({ where: { enabled: true } });

        return {
            success: true,
            serverName: server?.name || "Plex Server",
            serverUrl,
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
        ribbonPosition?: string;
        ribbonTheme?: string;
        ribbonText?: string;
        ribbonType?: string;
        theme?: string;
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
        customBadgeIds?: string[];
    }
) {
    await verifyAdmin();
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) return { success: false, error: "Plex token not configured." };

        const servers = await getPlexServers(token);
        const server = servers.find(s => s.clientIdentifier === serverId) || servers[0];
        const serverUrl = server?.connections[0]?.uri || settings?.mainPlexUrl || "";

        const inspection = await inspectPlexMediaItemFull(serverUrl, token, ratingKey, serverId);
        if (!inspection) return { success: false, error: "Media item not found on Plex." };

        const customBadges = await prisma.customBadge.findMany({ where: { enabled: true } });

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
                ribbonPosition: (options?.ribbonPosition as any) || "top-right",
                ribbonTheme: (options?.ribbonTheme as any) || "purple",
                ribbonText: options?.ribbonText || undefined,
                ribbonType: (options?.ribbonType as any) || "auto_quality",
                theme: (options?.theme as any) || "glass",
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
                customBadges
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
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        const serverUrl = settings?.mainPlexUrl || "";

        if (!token || !serverUrl) return { success: false, error: "Plex server connection missing." };

        const res = await restoreItemOriginalArtwork(serverUrl, token, serverId, ratingKey);
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
    timestamp: Date;
    details: string[];
}> {
    const details: string[] = [];
    let seasonalCount = 0;
    let overlaysAppliedCount = 0;
    let leavingSoonCount = 0;

    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (!settings) return { success: false, seasonalCount: 0, overlaysAppliedCount: 0, leavingSoonCount: 0, timestamp: new Date(), details: ["No global settings"] };

        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        if (!token) {
            return { success: false, seasonalCount: 0, overlaysAppliedCount: 0, leavingSoonCount: 0, timestamp: new Date(), details: ["No Plex token configured"] };
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
                const seasonalRes = await syncSeasonalAndScheduledCollectionsAction();
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

                const customBadges = await prisma.customBadge.findMany({ where: { enabled: true } });

                for (const srv of overlayServers) {
                    const serverUrl = srv.connections[0]?.uri || settings.mainPlexUrl || "";
                    if (!serverUrl) continue;

                    const sectionsRes = await getPlexServerLibrarySections(token);
                    const srvSections = sectionsRes.find(s => s.serverId === srv.clientIdentifier)?.sections || [];

                    for (const sec of srvSections) {
                        try {
                            const res = await applyOverlaysToLibraryAction(srv.clientIdentifier, String(sec.key));
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
                const leaveRes = await syncLeavingSoonCollectionHubAction();
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
                for (const srv of servers) {
                    const sectionsRes = await getPlexServerLibrarySections(token);
                    const srvSections = sectionsRes.find(s => s.serverId === srv.clientIdentifier)?.sections || [];
                    for (const sec of srvSections) {
                        try {
                            const pRes = await applyParentalTagsToLibraryAction(srv.clientIdentifier, String(sec.key));
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
            timestamp: new Date(),
            details
        };
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Automated Curation Sync Job failed: ${e.message}`);
        return {
            success: false,
            seasonalCount,
            overlaysAppliedCount,
            leavingSoonCount,
            timestamp: new Date(),
            details: [e.message]
        };
    }
}

/**
 * Server action to trigger full curation sync on-demand.
 */
export async function runFullCurationSyncAction() {
    await verifyAdmin();
    return await runFullCurationSyncInternal();
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
    const lower = `${filePath}/${filename}`.toLowerCase();

    // 1. Resolution
    if (lower.includes("resolution") || /4k|1080p|720p|ultra-hd|uhd|fhd/i.test(lower)) {
        const is4k = /4k|ultra-hd|uhd/i.test(lower);
        return {
            category: "resolution",
            suggestedPosition: "top-right",
            suggestedMatchRule: is4k ? "4k" : "1080p"
        };
    }

    // 2. Audio & Surround Channels
    if (lower.includes("audio") || /atmos|truehd|dts|flac|aac|eac3|ac3|5\.1|7\.1/i.test(lower)) {
        let rule = "atmos";
        if (lower.includes("truehd")) rule = "truehd";
        else if (lower.includes("dts-x") || lower.includes("dts:x")) rule = "dts_x";
        else if (lower.includes("dts")) rule = "dts";
        else if (lower.includes("7.1")) rule = "7.1";
        else if (lower.includes("5.1")) rule = "5.1";
        return {
            category: "audio",
            suggestedPosition: "top-left",
            suggestedMatchRule: rule
        };
    }

    // 3. HDR & Dynamic Range
    if (/dolby vision|dv-|dv\.|hdr10|hdr\+|hdr\./i.test(lower)) {
        return {
            category: "hdr",
            suggestedPosition: "top-right",
            suggestedMatchRule: lower.includes("dv") || lower.includes("dolby") ? "dv" : "hdr"
        };
    }

    // 4. Video Codecs
    if (lower.includes("codec") || /hevc|av1|avc|prores|h264|h265|x264|x265|vc1|vp9/i.test(lower)) {
        return {
            category: "codec",
            suggestedPosition: "top-right",
            suggestedMatchRule: lower.includes("av1") ? "av1" : lower.includes("hevc") || lower.includes("h265") ? "hevc" : "avc"
        };
    }

    // 5. Editions & Cuts
    if (lower.includes("edition") || /imax|criterion|remux|director|extended|theatrical|uncut|unrated|remastered|restored|special/i.test(lower)) {
        let rule = "special";
        if (lower.includes("imax")) rule = "imax";
        else if (lower.includes("criterion")) rule = "criterion";
        else if (lower.includes("remux")) rule = "remux";
        else if (lower.includes("director")) rule = "directors_cut";
        else if (lower.includes("extended")) rule = "extended";
        else if (lower.includes("theatrical")) rule = "theatrical";
        return {
            category: "edition",
            suggestedPosition: "bottom-right",
            suggestedMatchRule: rule
        };
    }

    // 6. Audience Scores & Ratings
    if (lower.includes("rating") || lower.includes("audience") || /score|tomato|rotten|imdb|metacritic|tmdb/i.test(lower)) {
        return {
            category: "ratings",
            suggestedPosition: "bottom-left",
            suggestedMatchRule: lower.includes("tomato") || lower.includes("rotten") ? "rt" : "imdb"
        };
    }

    // 7. Streaming & Studios
    if (lower.includes("streaming") || lower.includes("studio") || lower.includes("network") || /netflix|disney|hbo|apple|prime|paramount|hulu|peacock|marvel|dc|a24/i.test(lower)) {
        let rule = "netflix";
        if (lower.includes("hbo")) rule = "hbo";
        else if (lower.includes("disney")) rule = "disney";
        else if (lower.includes("apple")) rule = "apple_tv";
        else if (lower.includes("prime")) rule = "amazon";
        else if (lower.includes("paramount")) rule = "paramount";
        else if (lower.includes("marvel")) rule = "marvel";
        else if (lower.includes("a24")) rule = "a24";
        return {
            category: "studio",
            suggestedPosition: "bottom-left",
            suggestedMatchRule: rule
        };
    }

    // 8. Gradients & Ribbons
    if (lower.includes("gradient") || lower.includes("ribbon") || lower.includes("banner")) {
        return {
            category: "ribbon",
            suggestedPosition: "top-right",
            suggestedMatchRule: "featured"
        };
    }

    return {
        category: "custom",
        suggestedPosition: "top-right",
        suggestedMatchRule: filename.replace(/\.[^/.]+$/, "").toLowerCase()
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



