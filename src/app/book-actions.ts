"use server";

import prisma, { ensureSchemaColumns } from "@/lib/prisma";
import { getSession } from "@/app/auth-actions";
import { 
    BookRequestInput, 
    MediaType,
    BookDiscoveryItem
} from "@/lib/books/book-types";
import { 
    fetchTrendingEbooks, 
    fetchTrendingAudiobooks, 
    searchBooksUnified, 
    batchCheckBookAvailability,
    getAuthorProfile,
    getBookSeriesProfile,
    getAccessibleLibrariesForUser,
    resolveOrLinkAuthorAndSeries,
    isUserAllowedForLibrary
} from "@/lib/books/book-service";
import { autoDownloadBookRequest } from "@/app/actions";
import { logger } from "@/lib/logger";

interface AuthSession {
    userId: string;
    username: string;
    role: string;
    status: string;
    email?: string;
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
        status: String(session.status || "APPROVED"),
        email: session.email ? String(session.email) : undefined
    };
}

/**
 * Loads Discovery Home for Ebooks and Audiobooks with hero spotlights and carousels
 */
export async function getDiscoverBooksHomeAction(mediaType: "all" | MediaType = "all") {
    try {
        const session = await verifyAuth();

        const [trendingEbooks, trendingAudiobooks] = await Promise.all([
            (mediaType === "all" || mediaType === "ebook") ? fetchTrendingEbooks().catch(() => []) : [],
            (mediaType === "all" || mediaType === "audiobook") ? fetchTrendingAudiobooks().catch(() => []) : []
        ]);

        const allItems: BookDiscoveryItem[] = [...trendingEbooks, ...trendingAudiobooks];

        // Pick top hero item with artwork & overview
        const heroCandidates = allItems.filter(i => Boolean(i.coverUrl && (i.overview || i.rating)));
        const heroItem = heroCandidates.length > 0 ? heroCandidates[0] : (allItems[0] || null);

        // Batch check library and request availability
        const availabilityMap = await batchCheckBookAvailability(allItems, session.username, session.email);

        const sections: any[] = [];
        if (trendingEbooks.length > 0) {
            sections.push({
                id: "trending-ebooks",
                title: "Trending & Bestselling Ebooks",
                icon: "BookOpen",
                mediaType: "ebook",
                items: trendingEbooks
            });
        }
        if (trendingAudiobooks.length > 0) {
            sections.push({
                id: "trending-audiobooks",
                title: "Popular & Acclaimed Audiobooks",
                icon: "Headphones",
                mediaType: "audiobook",
                items: trendingAudiobooks
            });
        }

        return {
            success: true,
            heroItem,
            sections,
            availabilityMap
        };
    } catch (e: any) {
        logger.addLog("ERROR", "BOOK_ENGINE", `Failed to load discover books home: ${e.message}`);
        return { success: false, error: e.message || "Failed to load discover books" };
    }
}

/**
 * Searches books & audiobooks with unified multi-provider failover
 */
export async function searchBooksAction(query: string, mediaType: "all" | MediaType = "all") {
    try {
        const session = await verifyAuth();
        if (!query || query.trim().length < 2) {
            return { success: true, items: [], availabilityMap: {} };
        }

        const items = await searchBooksUnified(query, mediaType);
        const availabilityMap = await batchCheckBookAvailability(items, session.username, session.email);

        return {
            success: true,
            items,
            availabilityMap
        };
    } catch (e: any) {
        logger.addLog("ERROR", "BOOK_ENGINE", `Search books failed: ${e.message}`);
        return { success: false, error: e.message || "Search failed" };
    }
}

/**
 * Gets detailed Author Profile (photo, bio, series list, bibliography, local library presence)
 */
export async function getAuthorDetailsAction(authorIdOrName: string) {
    try {
        const session = await verifyAuth();
        const author = await getAuthorProfile(authorIdOrName, session.username, session.email);
        if (!author) {
            return { success: false, error: "Author not found" };
        }
        return { success: true, author };
    } catch (e: any) {
        logger.addLog("ERROR", "BOOK_ENGINE", `Failed to get author details: ${e.message}`);
        return { success: false, error: e.message || "Failed to get author details" };
    }
}

/**
 * Gets detailed Book Series Profile (volumes sequence, owned vs missing status, 1-click grab)
 */
export async function getBookSeriesDetailsAction(seriesTitle: string, authorName?: string) {
    try {
        const session = await verifyAuth();
        const series = await getBookSeriesProfile(seriesTitle, authorName, session.username, session.email);
        if (!series) {
            return { success: false, error: "Series not found" };
        }
        return { success: true, series };
    } catch (e: any) {
        logger.addLog("ERROR", "BOOK_ENGINE", `Failed to get series details: ${e.message}`);
        return { success: false, error: e.message || "Failed to get series details" };
    }
}

/**
 * Submits a new book or audiobook request with user logging & Send-to-Kindle options
 */
export async function submitBookOrAudiobookRequestAction(input: BookRequestInput) {
    try {
        const session = await verifyAuth();
        const user = await prisma.user.findUnique({
            where: { username: session.username }
        });

        if (!user) {
            return { success: false, error: "User account not found." };
        }

        if (user.canRequest === false) {
            return { success: false, error: "Your account does not have permission to submit media requests." };
        }

        const title = (input.title || "").trim();
        const author = (input.author || "Unknown Author").trim();
        const mediaType = input.mediaType || "ebook";

        if (!title) {
            return { success: false, error: "Title is required for a book request." };
        }

        // 1. Resolve Target Library
        let targetLibId = input.libraryId;
        const accessibleLibs = await getAccessibleLibrariesForUser(session.username, user.email, mediaType);
        
        if (targetLibId) {
            const chosenLib = accessibleLibs.find(l => l.id === targetLibId);
            if (!chosenLib) {
                return { success: false, error: "You do not have access to the selected library." };
            }
        } else {
            // Auto-select first accessible library matching mediaType
            if (accessibleLibs.length > 0) {
                targetLibId = accessibleLibs[0].id;
            } else {
                return { success: false, error: `No accessible ${mediaType} library found for your account.` };
            }
        }

        // 2. Resolve or Link Relational Author and Series
        const { authorId, seriesId } = await resolveOrLinkAuthorAndSeries(
            author,
            input.series,
            input.volumeNumber
        );

        // 3. Create BookRequest (Primary legacy & bookshelf sync)
        const bookRequest = await prisma.bookRequest.create({
            data: {
                title,
                author,
                series: input.series || null,
                volumeNumber: input.volumeNumber || null,
                coverUrl: input.coverUrl || null,
                publishYear: input.publishYear || null,
                requestedBy: session.username,
                requestedByUserId: user.id,
                userEmail: user.email,
                kindleEmail: user.kindleEmail || null,
                sendToKindle: Boolean(input.sendToKindle && mediaType === "ebook"),
                mediaType,
                libraryId: targetLibId,
                status: "Pending",
                type: input.series ? "series" : "book"
            }
        });

        // 4. Also mirror to MediaRequest for unified /requests table
        const settings = await prisma.settings.findUnique({ where: { id: "global" } });
        const autoApprove = settings?.seerrAutoApproveAll !== false;

        let mediaReq: any = null;
        try {
            await ensureSchemaColumns();
            mediaReq = await prisma.mediaRequest.create({
                data: {
                    mediaType,
                    title,
                    requestedByUsername: session.username,
                    requestedByUserId: user.id,
                    userEmail: user.email,
                    kindleEmail: user.kindleEmail || null,
                    bookAuthor: author,
                    bookSeries: input.series || null,
                    bookVolume: input.volumeNumber || null,
                    bookLibraryId: targetLibId,
                    sendToKindle: Boolean(input.sendToKindle && mediaType === "ebook"),
                    posterPath: input.coverUrl || null,
                    releaseYear: input.publishYear || null,
                    status: autoApprove ? "APPROVED" : "PENDING"
                }
            });
        } catch (mErr: any) {
            console.warn("[BOOK-REQUEST] MediaRequest mirror notice:", mErr?.message || mErr);
        }

        logger.addLog("SUCCESS", "SEERR", `User ${session.username} submitted ${mediaType.toUpperCase()} request: "${title}" by ${author}`);

        // 5. If auto-approved, trigger Prowlarr search & grab
        if (autoApprove) {
            console.log(`[BOOK-REQUEST] Auto-approving request ${bookRequest.id} for "${title}"...`);
            await prisma.bookRequest.update({
                where: { id: bookRequest.id },
                data: { status: "Searching" }
            });
            if (mediaReq?.id) {
                await prisma.mediaRequest.update({
                    where: { id: mediaReq.id },
                    data: { status: "SEARCHING" }
                }).catch(() => {});
            }

            autoDownloadBookRequest(bookRequest.id, title, author).catch(err => {
                console.error(`[BOOK-REQUEST] Auto-download failed for ${bookRequest.id}:`, err.message);
            });
        }

        return {
            success: true,
            message: autoApprove ? `Request submitted and auto-approved! Searching indexers...` : `Request submitted for admin review.`,
            requestId: bookRequest.id,
            mediaRequestId: mediaReq?.id || null
        };
    } catch (e: any) {
        logger.addLog("ERROR", "BOOK_ENGINE", `Submit book request failed: ${e.message}`);
        return { success: false, error: e.message || "Failed to submit request" };
    }
}

/**
 * Batch requests all missing volumes for a series in 1 click
 */
export async function requestCompleteSeriesAction(
    seriesTitle: string,
    author: string,
    mediaType: MediaType = "ebook",
    libraryId?: string
) {
    try {
        const session = await verifyAuth();
        const series = await getBookSeriesProfile(seriesTitle, author, session.username, session.email);
        if (!series || !series.volumes || series.volumes.length === 0) {
            return { success: false, error: "No series volumes found to request." };
        }

        const missingVolumes = series.volumes.filter(v => v.status === "MISSING");
        if (missingVolumes.length === 0) {
            return { success: false, error: "All volumes in this series are already owned or requested!" };
        }

        let requestedCount = 0;
        for (const vol of missingVolumes) {
            const res = await submitBookOrAudiobookRequestAction({
                title: vol.title,
                author: vol.author || author,
                series: seriesTitle,
                volumeNumber: vol.volumeNumber,
                coverUrl: vol.coverUrl,
                publishYear: vol.publishYear,
                mediaType,
                libraryId
            });
            if (res.success) requestedCount++;
        }

        return {
            success: true,
            requestedCount,
            message: `Successfully requested ${requestedCount} missing volumes for series "${seriesTitle}"!`
        };
    } catch (e: any) {
        logger.addLog("ERROR", "BOOK_ENGINE", `Batch request series failed: ${e.message}`);
        return { success: false, error: e.message || "Failed to batch request series" };
    }
}

/**
 * Gets list of libraries accessible to the current user
 */
export async function getAccessibleBookLibrariesAction(mediaType?: MediaType) {
    try {
        const session = await verifyAuth();
        const libs = await getAccessibleLibrariesForUser(session.username, session.email, mediaType);
        return {
            success: true,
            libraries: libs.map(l => ({
                id: l.id,
                name: l.name,
                description: l.description,
                mediaType: l.mediaType
            }))
        };
    } catch (e: any) {
        return { success: false, error: e.message || "Failed to get libraries", libraries: [] };
    }
}

/**
 * Toggles monitored state for an Author
 */
export async function toggleMonitorAuthorAction(authorId: string, monitored: boolean) {
    try {
        await verifyAuth();
        await prisma.author.update({
            where: { id: authorId },
            data: { monitored }
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Toggles monitored state for a BookSeries
 */
export async function toggleMonitorBookSeriesAction(seriesId: string, monitored: boolean) {
    try {
        await verifyAuth();
        await prisma.bookSeries.update({
            where: { id: seriesId },
            data: { monitored }
        });
        return { success: true };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}
