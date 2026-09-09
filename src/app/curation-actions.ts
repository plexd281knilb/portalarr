"use server";

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
    evaluatePruneCandidatesForServer,
    deleteMediaFromPlexServer,
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
import { COLLECTION_PRESETS } from "@/lib/curation/presets";

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
        serverStorageConfig: settings?.serverStorageConfig ? JSON.parse(settings.serverStorageConfig) : {}
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

        await prisma.settings.upsert({
            where: { id: "global" },
            update: updatePayload,
            create: {
                id: "global",
                ...updatePayload
            }
        });

        logger.addLog("SUCCESS", "SETTINGS", "Updated Curation, Kometa & Agregarr Settings.");
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
            orderBy: { createdAt: "desc" }
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
}) {
    await verifyAdmin();
    try {
        let collection;
        if (data.id) {
            collection = await prisma.mediaCollection.update({
                where: { id: data.id },
                data: {
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
                    syncInterval: data.syncInterval || "daily"
                }
            });
        } else {
            collection = await prisma.mediaCollection.create({
                data: {
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
                    syncInterval: data.syncInterval || "daily"
                }
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

        // 3. Sync to Plex
        const syncResult = await syncPlexCollection(
            serverUrl,
            token,
            collection.sectionKey || "",
            collection.title,
            matchingRatingKeys,
            {
                summary: collection.summary || undefined,
                sortTitle: collection.sortTitle || undefined,
                posterUrl: collection.posterUrl || undefined
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

        return { success: true, rules, backupsCount };
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
    theme?: string;
    badgeStyle?: string;
    showResolution?: boolean;
    showHdr?: boolean;
    showAudio?: boolean;
    showRatings?: boolean;
    showLeavingSoon?: boolean;
    enabled?: boolean;
}) {
    await verifyAdmin();
    try {
        let rule;
        if (data.id) {
            rule = await prisma.mediaOverlayRule.update({
                where: { id: data.id },
                data: {
                    name: data.name,
                    serverId: data.serverId,
                    sectionKey: data.sectionKey,
                    overlayType: data.overlayType,
                    position: data.position || "top-right",
                    theme: data.theme || "glass",
                    badgeStyle: data.badgeStyle || "pill",
                    showResolution: data.showResolution ?? true,
                    showHdr: data.showHdr ?? true,
                    showAudio: data.showAudio ?? true,
                    showRatings: data.showRatings ?? false,
                    showLeavingSoon: data.showLeavingSoon ?? true,
                    enabled: data.enabled ?? true
                }
            });
        } else {
            rule = await prisma.mediaOverlayRule.create({
                data: {
                    name: data.name,
                    serverId: data.serverId,
                    sectionKey: data.sectionKey,
                    overlayType: data.overlayType,
                    position: data.position || "top-right",
                    theme: data.theme || "glass",
                    badgeStyle: data.badgeStyle || "pill",
                    showResolution: data.showResolution ?? true,
                    showHdr: data.showHdr ?? true,
                    showAudio: data.showAudio ?? true,
                    showRatings: data.showRatings ?? false,
                    showLeavingSoon: data.showLeavingSoon ?? true,
                    enabled: data.enabled ?? true
                }
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

        // Fetch rule options
        let overlayOpts: OverlayOptions = {
            showResolution: true,
            showHdr: true,
            showAudio: true,
            showRatings: false,
            position: "top-right",
            theme: "glass"
        };

        if (ruleId) {
            const rule = await prisma.mediaOverlayRule.findUnique({ where: { id: ruleId } });
            if (rule) {
                overlayOpts = {
                    showResolution: rule.showResolution,
                    showHdr: rule.showHdr,
                    showAudio: rule.showAudio,
                    showRatings: rule.showRatings,
                    showLeavingSoon: rule.showLeavingSoon,
                    position: (rule.position as any) || "top-right",
                    theme: (rule.theme as any) || "glass"
                };
            }
        }

        // Fetch library media items
        const items = await getPlexLibraryMediaItems(serverUrl, token, sectionKey, 200);

        let successCount = 0;
        for (const it of items) {
            // Only apply if item has quality badges or is leaving soon
            if (it.detectedBadges.resolution || it.detectedBadges.hdr || it.detectedBadges.audio) {
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
            message: `Applied poster overlays to ${successCount} items on Plex.`
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

