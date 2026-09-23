"use server";

import prisma from "@/lib/prisma";
import { getSession } from "@/app/auth-actions";
import { logger } from "@/lib/logger";
import {
    getTmdbTrending,
    getTmdbPopularMovies,
    getTmdbPopularTv,
    getTmdbUpcomingMovies,
    getTmdbUpcomingTv,
    getTmdbTopRatedMovies,
    getTmdbTopRatedTv,
    getTmdbNowPlayingMovies,
    getDisneyTrending,
    getNetflixTrending,
    searchTmdbMulti,
    getTmdbMovieDetailsFull,
    getTmdbTvDetailsFull,
    getTmdbTvSeasonDetails,
    TmdbMediaItem,
    TmdbMediaDetail,
    TmdbEpisodeInfo
} from "@/lib/curation/tmdb";
import {
    checkMediaAvailability,
    batchCheckMediaAvailability,
    MediaAvailabilityStatus,
    getPlexLibraryGuidIndex
} from "@/lib/seerr/availability";
import { dispatchMediaRequest } from "@/lib/seerr/dispatch";
import { getEnabledArrInstancesInternal, arrApiGet } from "@/app/arr-actions";

interface AuthSession {
    userId: string;
    username: string;
    role: string;
    status: string;
}

async function verifyAuth(): Promise<AuthSession> {
    const session = await getSession();
    if (!session || !session.username) {
        throw new Error("Unauthorized. Please log in.");
    }
    return {
        userId: String(session.userId || session.id || ""),
        username: String(session.username || ""),
        role: String(session.role || "USER"),
        status: String(session.status || "APPROVED")
    };
}

async function verifyAdmin(): Promise<AuthSession> {
    const session = await verifyAuth();
    if (session.role !== "ADMIN" && session.role !== "SUPER_USER") {
        throw new Error("Unauthorized. Admin privileges required.");
    }
    return session;
}

/**
 * Loads Discovery Home with Hero spotlight and multiple curated carousels
 */
export async function getDiscoverHomeAction() {
    try {
        const [
            trendingMovies,
            trendingTv,
            upcomingMovies,
            popularTv,
            topRatedMovies
        ] = await Promise.all([
            getTmdbTrending("movie", "week", 1).catch(() => []),
            getTmdbTrending("tv", "week", 1).catch(() => []),
            getTmdbUpcomingMovies().catch(() => []),
            getTmdbPopularTv(1).catch(() => []),
            getTmdbTopRatedMovies(1).catch(() => [])
        ]);

        // Select top trending movie or show for hero spotlight
        const heroCandidates = [...trendingMovies, ...trendingTv].filter(item => Boolean(item.backdropPath && item.overview));
        const heroItem = heroCandidates.length > 0 ? heroCandidates[0] : (trendingMovies[0] || null);

        // Collect all media items for batch availability check
        const allItems = [
            ...(heroItem ? [heroItem] : []),
            ...trendingMovies,
            ...trendingTv,
            ...upcomingMovies,
            ...popularTv,
            ...topRatedMovies
        ];

        const availabilityMap = await batchCheckMediaAvailability(allItems);

        return {
            success: true,
            heroItem,
            sections: [
                { id: "trending-movies", title: "Trending Movies", icon: "Flame", mediaType: "movie", items: trendingMovies },
                { id: "trending-tv", title: "Trending TV Shows", icon: "TrendingUp", mediaType: "tv", items: trendingTv },
                { id: "upcoming-movies", title: "Upcoming & In Theaters", icon: "Calendar", mediaType: "movie", items: upcomingMovies },
                { id: "popular-tv", title: "Popular Series", icon: "Tv", mediaType: "tv", items: popularTv },
                { id: "top-movies", title: "Top Rated Movies", icon: "Star", mediaType: "movie", items: topRatedMovies }
            ],
            availabilityMap
        };
    } catch (e: any) {
        logger.addLog("ERROR", "SEERR", `getDiscoverHomeAction error: ${e.message}`);
        return { success: false, error: e.message };
    }
}

/**
 * Discover by category & media type (with pagination support)
 */
export async function getDiscoverMediaAction(
    category: "trending" | "popular" | "upcoming" | "top_rated" | "in_theaters" | "disney" | "netflix",
    mediaType: "movie" | "tv" | "all" = "all",
    page = 1
) {
    try {
        let items: TmdbMediaItem[] = [];

        if (category === "trending") {
            items = await getTmdbTrending(mediaType, "week", page);
        } else if (category === "popular") {
            if (mediaType === "tv") items = await getTmdbPopularTv(page);
            else items = await getTmdbPopularMovies(page);
        } else if (category === "upcoming") {
            if (mediaType === "tv") items = await getTmdbUpcomingTv(page);
            else items = await getTmdbUpcomingMovies();
        } else if (category === "top_rated") {
            if (mediaType === "tv") items = await getTmdbTopRatedTv(page);
            else items = await getTmdbTopRatedMovies(page);
        } else if (category === "in_theaters") {
            items = await getTmdbNowPlayingMovies();
        } else if (category === "disney") {
            items = await getDisneyTrending(false, page, mediaType === "all" ? "both" : mediaType);
        } else if (category === "netflix") {
            items = await getNetflixTrending(false, page, mediaType === "all" ? "both" : mediaType);
        }

        const availabilityMap = await batchCheckMediaAvailability(items);

        return {
            success: true,
            items,
            page,
            availabilityMap
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Search across Movies & TV Shows with instant availability lookup
 */
export async function searchMediaAction(query: string, page = 1) {
    try {
        if (!query || !query.trim()) {
            return { success: true, items: [], availabilityMap: {} };
        }

        const items = await searchTmdbMulti(query.trim(), page);
        const availabilityMap = await batchCheckMediaAvailability(items);

        return {
            success: true,
            items,
            availabilityMap
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Fetch detailed metadata, cast, videos, and availability for a single Movie or TV Show
 */
export async function getMediaDetailsAction(tmdbId: number, mediaType: "movie" | "tv") {
    try {
        let details: TmdbMediaDetail | null = null;

        if (mediaType === "movie") {
            details = await getTmdbMovieDetailsFull(tmdbId);
        } else {
            details = await getTmdbTvDetailsFull(tmdbId);
        }

        if (!details) {
            return { success: false, error: "Media details not found on TMDb" };
        }

        const availability = await checkMediaAvailability(
            tmdbId,
            mediaType,
            details.imdbId,
            details.tvdbId,
            details.title,
            details.releaseDate ? details.releaseDate.split("-")[0] : undefined
        );

        // Fetch recommendations availability
        const recAvailability = details.recommendations && details.recommendations.length > 0
            ? await batchCheckMediaAvailability(details.recommendations)
            : {};

        return {
            success: true,
            details,
            availability,
            recAvailability
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Fetch episode details for a TV season
 */
export async function getTvSeasonEpisodesAction(tvId: number, seasonNumber: number) {
    try {
        const episodes = await getTmdbTvSeasonDetails(tvId, seasonNumber);
        return { success: true, episodes };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Get the current user's request quota and permissions
 */
export async function getUserRequestQuotaAction() {
    try {
        const session = await verifyAuth();
        const user = await prisma.user.findUnique({
            where: { username: session.username }
        });

        if (!user) {
            return { success: false, error: "User not found" };
        }

        const settings = await prisma.settings.findFirst({ where: { id: "global" } });

        const isAdmin = user.role === "ADMIN" || user.role === "SUPER_USER";
        const canRequest = user.canRequest ?? true;
        const canRequest4k = isAdmin || (user.canRequest4k ?? false);

        // Auto approval determination
        const autoApproveMovies = isAdmin || (settings?.seerrAutoApproveAll ?? true) || user.autoApproveMovies;
        const autoApproveTv = isAdmin || (settings?.seerrAutoApproveAll ?? true) || user.autoApproveTv;

        // Quota window (days)
        const quotaDays = user.requestLimitDays || settings?.seerrQuotaDays || 7;
        const windowStartDate = new Date(Date.now() - quotaDays * 24 * 60 * 60 * 1000);

        // Count user's requests within window
        const [recentMovieCount, recentTvCount] = await Promise.all([
            prisma.mediaRequest.count({
                where: {
                    requestedByUsername: user.username,
                    mediaType: "movie",
                    createdAt: { gte: windowStartDate }
                }
            }),
            prisma.mediaRequest.count({
                where: {
                    requestedByUsername: user.username,
                    mediaType: "tv",
                    createdAt: { gte: windowStartDate }
                }
            })
        ]);

        const movieLimit = isAdmin ? 0 : (user.requestLimitMovies ?? settings?.seerrQuotaMovies ?? 10);
        const tvLimit = isAdmin ? 0 : (user.requestLimitTv ?? settings?.seerrQuotaTv ?? 10);

        return {
            success: true,
            data: {
                canRequest,
                canRequest4k,
                autoApproveMovies,
                autoApproveTv,
                quotaDays,
                movies: {
                    used: recentMovieCount,
                    limit: movieLimit, // 0 = unlimited
                    remaining: movieLimit === 0 ? 999 : Math.max(0, movieLimit - recentMovieCount)
                },
                tv: {
                    used: recentTvCount,
                    limit: tvLimit, // 0 = unlimited
                    remaining: tvLimit === 0 ? 999 : Math.max(0, tvLimit - recentTvCount)
                }
            }
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Submit a Media Request for a Movie or TV Show
 */
export async function submitMediaRequestAction(payload: {
    mediaType: "movie" | "tv";
    tmdbId: number;
    tvdbId?: number;
    imdbId?: string;
    title: string;
    releaseYear?: string;
    posterPath?: string;
    backdropPath?: string;
    overview?: string;
    is4k?: boolean;
    seasons?: number[] | "all";
    servarrAppId?: string;
    qualityProfileId?: number;
    rootFolderPath?: string;
}) {
    try {
        const session = await verifyAuth();
        const user = await prisma.user.findUnique({
            where: { username: session.username }
        });

        if (!user) throw new Error("User record not found");

        const isAdmin = user.role === "ADMIN" || user.role === "SUPER_USER";
        if (!isAdmin && user.canRequest === false) {
            throw new Error("You do not have permission to submit media requests.");
        }

        if (payload.is4k && !isAdmin && !user.canRequest4k) {
            throw new Error("You do not have permission to request 4K UHD media.");
        }

        const settings = await prisma.settings.findFirst({ where: { id: "global" } });

        // Evaluate user quota if not admin
        if (!isAdmin) {
            const quotaDays = user.requestLimitDays || settings?.seerrQuotaDays || 7;
            const windowStartDate = new Date(Date.now() - quotaDays * 24 * 60 * 60 * 1000);

            const count = await prisma.mediaRequest.count({
                where: {
                    requestedByUsername: user.username,
                    mediaType: payload.mediaType,
                    createdAt: { gte: windowStartDate }
                }
            });

            const limit = payload.mediaType === "movie" 
                ? (user.requestLimitMovies ?? settings?.seerrQuotaMovies ?? 10)
                : (user.requestLimitTv ?? settings?.seerrQuotaTv ?? 10);

            if (limit > 0 && count >= limit) {
                throw new Error(`You have reached your limit of ${limit} ${payload.mediaType === "movie" ? "movie" : "TV show"} requests for this ${quotaDays}-day period.`);
            }
        }

        // Check if request already exists
        const existing = await prisma.mediaRequest.findFirst({
            where: {
                tmdbId: payload.tmdbId,
                mediaType: payload.mediaType
            }
        });

        if (existing && existing.status !== "DECLINED" && existing.status !== "FAILED") {
            // Already active request
            return {
                success: true,
                message: `This ${payload.mediaType === "movie" ? "movie" : "TV series"} has already been requested by ${existing.requestedByUsername}.`,
                request: existing
            };
        }

        // Determine approval status
        const autoApprove = isAdmin || (settings?.seerrAutoApproveAll ?? true) || (payload.mediaType === "movie" ? user.autoApproveMovies : user.autoApproveTv);
        const initialStatus = autoApprove ? "APPROVED" : "PENDING";

        // Create request in database
        const seasonsJson = payload.seasons 
            ? (payload.seasons === "all" ? "all" : JSON.stringify(payload.seasons)) 
            : undefined;

        const newRequest = await prisma.mediaRequest.create({
            data: {
                mediaType: payload.mediaType,
                tmdbId: payload.tmdbId,
                tvdbId: payload.tvdbId,
                imdbId: payload.imdbId,
                title: payload.title,
                releaseYear: payload.releaseYear,
                posterPath: payload.posterPath,
                backdropPath: payload.backdropPath,
                overview: payload.overview,
                status: initialStatus,
                is4k: Boolean(payload.is4k),
                requestedByUserId: user.id,
                requestedByUsername: user.username,
                seasons: seasonsJson,
                servarrAppId: payload.servarrAppId,
                qualityProfileId: payload.qualityProfileId,
                rootFolderPath: payload.rootFolderPath
            }
        });

        logger.addLog("INFO", "SEERR", `User ${user.username} submitted request for "${payload.title}" (${payload.mediaType.toUpperCase()}) - Status: ${initialStatus}`);

        // If auto-approved, trigger immediate Servarr dispatch
        if (autoApprove) {
            const dispatchRes = await dispatchMediaRequest(newRequest.id);
            if (!dispatchRes.success) {
                logger.addLog("WARN", "SEERR", `Auto-dispatch for request "${payload.title}" encountered an issue: ${dispatchRes.error}`);
            }
        }

        return {
            success: true,
            message: autoApprove ? "Request approved and sent to downloader!" : "Request submitted for administrator approval.",
            request: newRequest
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Fetch all media requests with optional filters (for Admin or Requests view)
 */
export async function getAllMediaRequestsAction(filters?: {
    status?: string;
    mediaType?: string;
    is4k?: boolean;
    requestedBy?: string;
    search?: string;
    page?: number;
    limit?: number;
}) {
    try {
        await verifyAuth();
        const page = filters?.page || 1;
        const limit = filters?.limit || 50;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (filters?.status && filters.status !== "ALL") {
            where.status = filters.status;
        }
        if (filters?.mediaType && filters.mediaType !== "ALL") {
            where.mediaType = filters.mediaType;
        }
        if (filters?.is4k !== undefined) {
            where.is4k = filters.is4k;
        }
        if (filters?.requestedBy) {
            where.requestedByUsername = filters.requestedBy;
        }
        if (filters?.search && filters.search.trim()) {
            where.title = { contains: filters.search.trim() };
        }

        const [requests, total] = await Promise.all([
            prisma.mediaRequest.findMany({
                where,
                orderBy: { createdAt: "desc" },
                skip,
                take: limit
            }),
            prisma.mediaRequest.count({ where })
        ]);

        return {
            success: true,
            data: requests,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Fetch requests submitted by the logged-in user
 */
export async function getUserMediaRequestsAction() {
    try {
        const session = await verifyAuth();
        const requests = await prisma.mediaRequest.findMany({
            where: { requestedByUsername: session.username },
            orderBy: { createdAt: "desc" }
        });
        return { success: true, data: requests };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Approve a pending media request (Admin only)
 */
export async function approveMediaRequestAction(requestId: string) {
    try {
        await verifyAdmin();
        const req = await prisma.mediaRequest.findUnique({ where: { id: requestId } });
        if (!req) throw new Error("Request not found");

        await prisma.mediaRequest.update({
            where: { id: requestId },
            data: { status: "APPROVED", errorMessage: null }
        });

        const dispatchRes = await dispatchMediaRequest(requestId);
        return {
            success: true,
            message: dispatchRes.success ? "Request approved and dispatched!" : `Approved, but dispatch failed: ${dispatchRes.error}`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Decline a media request (Admin only)
 */
export async function declineMediaRequestAction(requestId: string, reason?: string) {
    try {
        await verifyAdmin();
        await prisma.mediaRequest.update({
            where: { id: requestId },
            data: {
                status: "DECLINED",
                errorMessage: reason || "Request declined by administrator"
            }
        });
        return { success: true, message: "Request declined." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Retry a failed media request
 */
export async function retryMediaRequestAction(requestId: string) {
    try {
        const session = await verifyAuth();
        const req = await prisma.mediaRequest.findUnique({ where: { id: requestId } });
        if (!req) throw new Error("Request not found");

        const isAdmin = session.role === "ADMIN" || session.role === "SUPER_USER";
        if (!isAdmin && req.requestedByUsername !== session.username) {
            throw new Error("Unauthorized to retry this request");
        }

        await prisma.mediaRequest.update({
            where: { id: requestId },
            data: { status: "APPROVED", errorMessage: null }
        });

        const dispatchRes = await dispatchMediaRequest(requestId);
        return {
            success: dispatchRes.success,
            message: dispatchRes.success ? "Request retried successfully!" : `Retry failed: ${dispatchRes.error}`
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Delete a media request
 */
export async function deleteMediaRequestAction(requestId: string) {
    try {
        const session = await verifyAuth();
        const req = await prisma.mediaRequest.findUnique({ where: { id: requestId } });
        if (!req) throw new Error("Request not found");

        const isAdmin = session.role === "ADMIN" || session.role === "SUPER_USER";
        if (!isAdmin && req.requestedByUsername !== session.username) {
            throw new Error("Unauthorized to delete this request");
        }

        await prisma.mediaRequest.delete({ where: { id: requestId } });
        return { success: true, message: "Request deleted." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Synchronize request download progress from Radarr/Sonarr queues and reconcile Plex availability
 */
export async function syncMediaRequestsQueueAndAvailabilityAction() {
    try {
        await verifyAuth();

        const activeRequests = await prisma.mediaRequest.findMany({
            where: {
                status: { in: ["PROCESSING", "APPROVED", "PENDING"] }
            }
        });

        if (activeRequests.length === 0) {
            return { success: true, updatedCount: 0 };
        }

        const guidIndex = await getPlexLibraryGuidIndex(true);
        let updatedCount = 0;

        // 1. Reconcile with Plex library
        for (const req of activeRequests) {
            let match = guidIndex.get(`tmdb:${req.mediaType}:${req.tmdbId}`);
            if (!match && req.imdbId) match = guidIndex.get(`imdb:${req.imdbId}`);
            if (!match && req.tvdbId) match = guidIndex.get(`tvdb:${req.tvdbId}`);
            if (!match && req.title) {
                const norm = req.title.toLowerCase().replace(/[^a-z0-9]/g, "");
                match = guidIndex.get(`title:${req.mediaType}:${norm}:${req.releaseYear || ""}`);
            }

            if (match) {
                await prisma.mediaRequest.update({
                    where: { id: req.id },
                    data: {
                        status: "AVAILABLE",
                        downloadProgress: 100,
                        availableAt: new Date()
                    }
                });
                updatedCount++;
            }
        }

        // 2. Poll Radarr and Sonarr queues for remaining processing requests
        const remainingProcessing = await prisma.mediaRequest.findMany({
            where: { status: "PROCESSING" }
        });

        if (remainingProcessing.length > 0) {
            const radarrAppsRes = await getEnabledArrInstancesInternal("radarr");
            const sonarrAppsRes = await getEnabledArrInstancesInternal("sonarr");

            const radarrApps = (radarrAppsRes.success && radarrAppsRes.data) ? radarrAppsRes.data : [];
            const sonarrApps = (sonarrAppsRes.success && sonarrAppsRes.data) ? sonarrAppsRes.data : [];

            // Poll Radarr Queues
            for (const app of radarrApps) {
                const queueRes = await arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000");
                if (queueRes.success && queueRes.data?.records) {
                    for (const record of queueRes.data.records) {
                        const movieId = record.movieId;
                        const matchReq = remainingProcessing.find(r => r.mediaType === "movie" && r.servarrId === movieId);
                        if (matchReq) {
                            const sizeleft = record.sizeleft || 0;
                            const size = record.size || 1;
                            const progress = Math.min(99, Math.max(1, Math.round(((size - sizeleft) / size) * 100)));
                            await prisma.mediaRequest.update({
                                where: { id: matchReq.id },
                                data: { downloadProgress: progress }
                            });
                        }
                    }
                }
            }

            // Poll Sonarr Queues
            for (const app of sonarrApps) {
                const queueRes = await arrApiGet(app, "/api/v3/queue?page=1&pageSize=1000");
                if (queueRes.success && queueRes.data?.records) {
                    for (const record of queueRes.data.records) {
                        const seriesId = record.seriesId;
                        const matchReq = remainingProcessing.find(r => r.mediaType === "tv" && r.servarrId === seriesId);
                        if (matchReq) {
                            const sizeleft = record.sizeleft || 0;
                            const size = record.size || 1;
                            const progress = Math.min(99, Math.max(1, Math.round(((size - sizeleft) / size) * 100)));
                            await prisma.mediaRequest.update({
                                where: { id: matchReq.id },
                                data: { downloadProgress: progress }
                            });
                        }
                    }
                }
            }
        }

        return { success: true, updatedCount };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Get Seerr / Media Request settings
 */
export async function getSeerrSettingsAction() {
    try {
        await verifyAdmin();
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const radarrAppsRes = await getEnabledArrInstancesInternal("radarr");
        const sonarrAppsRes = await getEnabledArrInstancesInternal("sonarr");

        return {
            success: true,
            data: {
                seerrAutoApproveAll: settings?.seerrAutoApproveAll ?? true,
                seerrDefaultMovieProfileId: settings?.seerrDefaultMovieProfileId ?? null,
                seerrDefaultTvProfileId: settings?.seerrDefaultTvProfileId ?? null,
                seerrDefaultMovieRootFolder: settings?.seerrDefaultMovieRootFolder ?? null,
                seerrDefaultTvRootFolder: settings?.seerrDefaultTvRootFolder ?? null,
                seerrDefaultMovieAppId: settings?.seerrDefaultMovieAppId ?? null,
                seerrDefaultTvAppId: settings?.seerrDefaultTvAppId ?? null,
                seerrDefaultMovie4kAppId: settings?.seerrDefaultMovie4kAppId ?? null,
                seerrDefaultTv4kAppId: settings?.seerrDefaultTv4kAppId ?? null,
                seerrQuotaMovies: settings?.seerrQuotaMovies ?? 10,
                seerrQuotaTv: settings?.seerrQuotaTv ?? 10,
                seerrQuotaDays: settings?.seerrQuotaDays ?? 7,
                seerrNotificationOnAvailable: settings?.seerrNotificationOnAvailable ?? true,
                radarrApps: radarrAppsRes.success ? radarrAppsRes.data : [],
                sonarrApps: sonarrAppsRes.success ? sonarrAppsRes.data : []
            }
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Update Seerr / Media Request settings
 */
export async function updateSeerrSettingsAction(payload: {
    seerrAutoApproveAll?: boolean;
    seerrDefaultMovieProfileId?: number | null;
    seerrDefaultTvProfileId?: number | null;
    seerrDefaultMovieRootFolder?: string | null;
    seerrDefaultTvRootFolder?: string | null;
    seerrDefaultMovieAppId?: string | null;
    seerrDefaultTvAppId?: string | null;
    seerrDefaultMovie4kAppId?: string | null;
    seerrDefaultTv4kAppId?: string | null;
    seerrQuotaMovies?: number;
    seerrQuotaTv?: number;
    seerrQuotaDays?: number;
    seerrNotificationOnAvailable?: boolean;
}) {
    try {
        await verifyAdmin();
        await prisma.settings.upsert({
            where: { id: "global" },
            update: payload,
            create: {
                id: "global",
                ...payload
            }
        });
        return { success: true, message: "Media request settings updated successfully." };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
