import prisma from "@/lib/prisma";
import { 
    BookDiscoveryItem, 
    MediaType, 
    AuthorInfo, 
    BookSeriesDetail, 
    SeriesVolumeItem, 
    SeriesSummary,
    BookAvailabilityStatus
} from "./book-types";
import { logger } from "@/lib/logger";

async function fetchWithTimeout(url: string, options: any = {}, timeoutMs = 7000): Promise<Response | null> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        if (!options.headers) options.headers = {};
        if (!options.headers["User-Agent"]) {
            options.headers["User-Agent"] = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
        }
        const res = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return res;
    } catch (e) {
        return null;
    }
}

/**
 * Normalizes text for comparison (removes punctuation, lowercases)
 */
function normalizeKey(str: string): string {
    return (str || "").toLowerCase().replace(/[^a-z0-9]/g, "").trim();
}

/**
 * Checks library access control against allowedUsers and restrictedUsers
 */
export function isUserAllowedForLibrary(
    library: { allowedUsers?: string | null; restrictedUsers?: string | null }, 
    username?: string, 
    email?: string
): boolean {
    if (!username && !email) return true; // System/admin bypass
    const userLower = (username || "").toLowerCase().trim();
    const emailLower = (email || "").toLowerCase().trim();

    // 1. Explicit Exclusions
    if (library.restrictedUsers) {
        const restricted = library.restrictedUsers.split(",").map(u => u.trim().toLowerCase()).filter(Boolean);
        if (restricted.includes(userLower) || (emailLower && restricted.includes(emailLower))) {
            return false;
        }
    }

    // 2. Explicit Inclusions
    if (!library.allowedUsers || library.allowedUsers.trim() === "" || library.allowedUsers.trim() === "*") {
        return true; // Public shelf
    }

    const allowed = library.allowedUsers.split(",").map(u => u.trim().toLowerCase()).filter(Boolean);
    return allowed.includes(userLower) || Boolean(emailLower && allowed.includes(emailLower));
}

/**
 * Gets accessible libraries for a user
 */
export async function getAccessibleLibrariesForUser(username?: string, email?: string, mediaType?: MediaType) {
    const allLibs = await prisma.library.findMany({
        where: mediaType ? { mediaType } : undefined,
        orderBy: { name: "asc" }
    });

    return allLibs.filter(lib => isUserAllowedForLibrary(lib, username, email));
}

/**
 * Cross-checks a list of book items against the database and user accessible libraries
 */
export async function batchCheckBookAvailability(
    items: BookDiscoveryItem[],
    username?: string,
    email?: string
): Promise<Record<string, { status: BookAvailabilityStatus; bookId?: string; requestId?: string; libraryName?: string; libraryId?: string; filePath?: string; fileType?: string }>> {
    const resultMap: Record<string, any> = {};
    if (!items || items.length === 0) return resultMap;

    try {
        const accessibleLibs = await getAccessibleLibrariesForUser(username, email);
        const accessibleLibIds = new Set(accessibleLibs.map(l => l.id));
        const libNameMap = new Map(accessibleLibs.map(l => [l.id, l.name]));

        // Fetch existing books in accessible libraries
        const dbBooks = await prisma.book.findMany({
            where: {
                libraryId: { in: Array.from(accessibleLibIds) },
                fileType: { not: "missing" }
            },
            select: {
                id: true,
                title: true,
                author: true,
                filePath: true,
                fileType: true,
                mediaType: true,
                libraryId: true
            }
        });

        // Fetch active requests
        const [bookReqs, mediaReqs] = await Promise.all([
            prisma.bookRequest.findMany({
                where: { status: { notIn: ["Downloaded", "Rejected"] } },
                select: { id: true, title: true, author: true, status: true, mediaType: true, libraryId: true }
            }),
            prisma.mediaRequest.findMany({
                where: { 
                    mediaType: { in: ["book", "audiobook"] },
                    status: { notIn: ["AVAILABLE", "DECLINED"] }
                },
                select: { id: true, title: true, bookAuthor: true, status: true, mediaType: true, bookLibraryId: true }
            })
        ]);

        // Build index maps
        const bookIndex = new Map<string, typeof dbBooks[0]>();
        for (const b of dbBooks) {
            const normTitle = normalizeKey(b.title);
            const normAuthor = normalizeKey(b.author || "");
            const mType = b.mediaType || "ebook";
            bookIndex.set(`${mType}:${normTitle}:${normAuthor}`, b);
            bookIndex.set(`${mType}:${normTitle}`, b); // Fallback title match
        }

        const reqIndex = new Map<string, { id: string; status: string; libraryId?: string | null }>();
        for (const r of bookReqs) {
            const normTitle = normalizeKey(r.title);
            const mType = r.mediaType || "ebook";
            reqIndex.set(`${mType}:${normTitle}`, { id: r.id, status: r.status, libraryId: r.libraryId });
        }
        for (const r of mediaReqs) {
            const normTitle = normalizeKey(r.title);
            const mType = r.mediaType === "audiobook" ? "audiobook" : "ebook";
            if (!reqIndex.has(`${mType}:${normTitle}`)) {
                reqIndex.set(`${mType}:${normTitle}`, { id: r.id, status: r.status, libraryId: r.bookLibraryId });
            }
        }

        for (const item of items) {
            const itemKey = `${item.title}:${item.author}`;
            const normTitle = normalizeKey(item.title);
            const normAuthor = normalizeKey(item.author || "");
            const mType = item.mediaType;

            // 1. Check Library Availability
            const matchedBook = bookIndex.get(`${mType}:${normTitle}:${normAuthor}`) || bookIndex.get(`${mType}:${normTitle}`);
            if (matchedBook) {
                resultMap[itemKey] = {
                    status: "AVAILABLE",
                    bookId: matchedBook.id,
                    libraryName: libNameMap.get(matchedBook.libraryId) || "Library",
                    libraryId: matchedBook.libraryId,
                    filePath: matchedBook.filePath,
                    fileType: matchedBook.fileType
                };
                continue;
            }

            // 2. Check Active Requests
            const matchedReq = reqIndex.get(`${mType}:${normTitle}`);
            if (matchedReq) {
                const isDownloading = matchedReq.status.toLowerCase().includes("download") || matchedReq.status.toLowerCase().includes("search");
                resultMap[itemKey] = {
                    status: isDownloading ? "DOWNLOADING" : "REQUESTED",
                    requestId: matchedReq.id,
                    libraryName: matchedReq.libraryId ? libNameMap.get(matchedReq.libraryId) : undefined,
                    libraryId: matchedReq.libraryId || undefined
                };
                continue;
            }

            // 3. Not in library or queue
            resultMap[itemKey] = {
                status: "NOT_AVAILABLE"
            };
        }
    } catch (err: any) {
        logger.addLog("WARN", "BOOK_ENGINE", `Error batch checking book availability: ${err.message}`);
    }

    return resultMap;
}

/**
 * Fetches Trending / Bestselling Ebooks from OpenLibrary & Google Books
 */
export async function fetchTrendingEbooks(): Promise<BookDiscoveryItem[]> {
    const results: BookDiscoveryItem[] = [];
    const seen = new Set<string>();

    try {
        // 1. OpenLibrary Trending Works / Subject: Fiction & Bestsellers
        const olUrl = "https://openlibrary.org/trending/daily.json?limit=24";
        const olRes = await fetchWithTimeout(olUrl, { headers: { Accept: "application/json" } }, 6000);
        if (olRes && olRes.ok) {
            const olData = await olRes.json();
            if (olData && olData.works) {
                for (const work of olData.works) {
                    if (!work.title) continue;
                    const authorName = Array.isArray(work.author_name) ? work.author_name[0] : (work.author_name || "Unknown Author");
                    const key = normalizeKey(work.title + authorName);
                    if (seen.has(key)) continue;
                    seen.add(key);

                    const coverUrl = work.cover_i 
                        ? `https://covers.openlibrary.org/b/id/${work.cover_i}-L.jpg`
                        : (work.cover_id ? `https://covers.openlibrary.org/b/id/${work.cover_id}-L.jpg` : undefined);

                    results.push({
                        title: work.title,
                        author: authorName,
                        coverUrl,
                        publishYear: work.first_publish_year ? String(work.first_publish_year) : undefined,
                        mediaType: "ebook"
                    });
                }
            }
        }
    } catch (e) {}

    // 2. Google Books Bestsellers Fallback / Enrichment
    if (results.length < 15) {
        try {
            const gUrl = "https://www.googleapis.com/books/v1/volumes?q=subject:fiction+bestseller&orderBy=relevance&maxResults=20";
            const gRes = await fetchWithTimeout(gUrl, { headers: { Accept: "application/json" } }, 6000);
            if (gRes && gRes.ok) {
                const gData = await gRes.json();
                if (gData && gData.items) {
                    for (const item of gData.items) {
                        const vol = item.volumeInfo;
                        if (!vol || !vol.title) continue;
                        const authorName = Array.isArray(vol.authors) ? vol.authors[0] : "Unknown Author";
                        const key = normalizeKey(vol.title + authorName);
                        if (seen.has(key)) continue;
                        seen.add(key);

                        const cover = vol.imageLinks?.thumbnail 
                            ? vol.imageLinks.thumbnail.replace("http:", "https:").replace("&edge=curl", "").replace("&zoom=1", "&zoom=0") 
                            : undefined;

                        results.push({
                            title: vol.title,
                            author: authorName,
                            coverUrl: cover,
                            publishYear: vol.publishedDate ? vol.publishedDate.substring(0, 4) : undefined,
                            overview: vol.description,
                            mediaType: "ebook",
                            isbn: vol.industryIdentifiers?.[0]?.identifier
                        });
                    }
                }
            }
        } catch (e) {}
    }

    return results;
}

/**
 * Fetches Popular / Trending Audiobooks from Audible & iTunes
 */
export async function fetchTrendingAudiobooks(): Promise<BookDiscoveryItem[]> {
    const results: BookDiscoveryItem[] = [];
    const seen = new Set<string>();

    try {
        // 1. Audible Catalog Popular Hits
        const audUrl = "https://api.audible.com/1.0/catalog/products?num_results=24&products_sort_by=BestSellers&response_groups=product_attrs,contributors,product_desc";
        const audRes = await fetchWithTimeout(audUrl, { headers: { Accept: "application/json" } }, 6000);
        if (audRes && audRes.ok) {
            const audData = await audRes.json();
            if (audData && audData.products) {
                for (const prod of audData.products) {
                    if (!prod.title) continue;
                    let authorName = "Unknown Author";
                    if (prod.authors && prod.authors.length > 0) {
                        authorName = prod.authors[0].name || "Unknown Author";
                    }

                    const key = normalizeKey(prod.title + authorName);
                    if (seen.has(key)) continue;
                    seen.add(key);

                    let coverUrl = "";
                    if (prod.product_images) {
                        coverUrl = prod.product_images["1024"] || prod.product_images["800"] || prod.product_images["500"] || "";
                    }

                    let seriesName: string | undefined;
                    let volumeNumber: string | undefined;
                    if (prod.series && prod.series.length > 0) {
                        seriesName = prod.series[0].title;
                        volumeNumber = prod.series[0].sequence;
                    }

                    results.push({
                        title: prod.title,
                        author: authorName,
                        series: seriesName,
                        volumeNumber,
                        coverUrl: coverUrl || undefined,
                        publishYear: prod.release_date ? prod.release_date.substring(0, 4) : undefined,
                        overview: prod.publisher_summary || prod.merchandising_summary,
                        mediaType: "audiobook",
                        asin: prod.asin,
                        rating: prod.rating?.overall_distribution?.average_rating,
                        ratingCount: prod.rating?.overall_distribution?.num_ratings
                    });
                }
            }
        }
    } catch (e) {}

    // 2. iTunes Audiobook Top Charts Fallback
    if (results.length < 10) {
        try {
            const itunesUrl = "https://itunes.apple.com/search?term=bestseller&entity=audiobook&limit=20";
            const itunesRes = await fetchWithTimeout(itunesUrl, { headers: { Accept: "application/json" } }, 6000);
            if (itunesRes && itunesRes.ok) {
                const itunesData = await itunesRes.json();
                if (itunesData && itunesData.results) {
                    for (const item of itunesData.results) {
                        if (!item.collectionName && !item.trackName) continue;
                        const title = item.collectionName || item.trackName;
                        const author = item.artistName || "Unknown Author";
                        const key = normalizeKey(title + author);
                        if (seen.has(key)) continue;
                        seen.add(key);

                        const cover = item.artworkUrl100 ? item.artworkUrl100.replace("100x100bb", "600x600bb") : undefined;

                        results.push({
                            title,
                            author,
                            coverUrl: cover,
                            publishYear: item.releaseDate ? item.releaseDate.substring(0, 4) : undefined,
                            overview: item.description,
                            mediaType: "audiobook"
                        });
                    }
                }
            }
        } catch (e) {}
    }

    return results;
}

/**
 * Searches books & audiobooks across OpenLibrary, Google Books, Audible, and iTunes
 */
export async function searchBooksUnified(query: string, mediaType: "all" | MediaType = "all"): Promise<BookDiscoveryItem[]> {
    if (!query || query.trim().length < 2) return [];
    const cleanQuery = query.trim();
    const results: BookDiscoveryItem[] = [];
    const seen = new Set<string>();

    const shouldSearchEbooks = mediaType === "all" || mediaType === "ebook";
    const shouldSearchAudiobooks = mediaType === "all" || mediaType === "audiobook";

    const fetchTasks: Promise<void>[] = [];

    // 1. Audible (Audiobooks)
    if (shouldSearchAudiobooks) {
        fetchTasks.push((async () => {
            try {
                const audUrl = `https://api.audible.com/1.0/catalog/products?keywords=${encodeURIComponent(cleanQuery)}&response_groups=product_attrs,contributors,product_desc&num_results=12`;
                const audRes = await fetchWithTimeout(audUrl, { headers: { Accept: "application/json" } }, 5000);
                if (audRes && audRes.ok) {
                    const data = await audRes.json();
                    if (data && data.products) {
                        for (const prod of data.products) {
                            if (!prod.title) continue;
                            const author = prod.authors?.[0]?.name || "Unknown Author";
                            const key = `audiobook:${normalizeKey(prod.title + author)}`;
                            if (seen.has(key)) continue;
                            seen.add(key);

                            const cover = prod.product_images?.["800"] || prod.product_images?.["500"] || "";
                            results.push({
                                title: prod.title,
                                author,
                                series: prod.series?.[0]?.title,
                                volumeNumber: prod.series?.[0]?.sequence,
                                coverUrl: cover || undefined,
                                publishYear: prod.release_date ? prod.release_date.substring(0, 4) : undefined,
                                overview: prod.publisher_summary,
                                mediaType: "audiobook",
                                asin: prod.asin,
                                rating: prod.rating?.overall_distribution?.average_rating
                            });
                        }
                    }
                }
            } catch (e) {}
        })());
    }

    // 2. OpenLibrary (Ebooks & General)
    if (shouldSearchEbooks) {
        fetchTasks.push((async () => {
            try {
                const olUrl = `https://openlibrary.org/search.json?q=${encodeURIComponent(cleanQuery)}&limit=15&fields=key,title,author_name,cover_i,first_publish_year,first_sentence`;
                const olRes = await fetchWithTimeout(olUrl, { headers: { Accept: "application/json" } }, 5000);
                if (olRes && olRes.ok) {
                    const data = await olRes.json();
                    if (data && data.docs) {
                        for (const doc of data.docs) {
                            if (!doc.title) continue;
                            const author = doc.author_name?.[0] || "Unknown Author";
                            const key = `ebook:${normalizeKey(doc.title + author)}`;
                            if (seen.has(key)) continue;
                            seen.add(key);

                            const cover = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : undefined;
                            results.push({
                                title: doc.title,
                                author,
                                coverUrl: cover,
                                publishYear: doc.first_publish_year ? String(doc.first_publish_year) : undefined,
                                overview: doc.first_sentence ? (Array.isArray(doc.first_sentence) ? doc.first_sentence[0] : doc.first_sentence) : undefined,
                                mediaType: "ebook"
                            });
                        }
                    }
                }
            } catch (e) {}
        })());
    }

    // 3. Google Books (Ebooks)
    if (shouldSearchEbooks) {
        fetchTasks.push((async () => {
            try {
                const gUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(cleanQuery)}&maxResults=15`;
                const gRes = await fetchWithTimeout(gUrl, { headers: { Accept: "application/json" } }, 5000);
                if (gRes && gRes.ok) {
                    const data = await gRes.json();
                    if (data && data.items) {
                        for (const item of data.items) {
                            const vol = item.volumeInfo;
                            if (!vol || !vol.title) continue;
                            const author = vol.authors?.[0] || "Unknown Author";
                            const key = `ebook:${normalizeKey(vol.title + author)}`;
                            if (seen.has(key)) continue;
                            seen.add(key);

                            const cover = vol.imageLinks?.thumbnail 
                                ? vol.imageLinks.thumbnail.replace("http:", "https:").replace("&edge=curl", "").replace("&zoom=1", "&zoom=0") 
                                : undefined;

                            results.push({
                                title: vol.title,
                                author,
                                coverUrl: cover,
                                publishYear: vol.publishedDate ? vol.publishedDate.substring(0, 4) : undefined,
                                overview: vol.description,
                                mediaType: "ebook",
                                isbn: vol.industryIdentifiers?.[0]?.identifier,
                                rating: vol.averageRating
                            });
                        }
                    }
                }
            } catch (e) {}
        })());
    }

    // 4. iTunes Search (Audiobooks Fallback)
    if (shouldSearchAudiobooks) {
        fetchTasks.push((async () => {
            try {
                const itUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(cleanQuery)}&entity=audiobook&limit=10`;
                const itRes = await fetchWithTimeout(itUrl, { headers: { Accept: "application/json" } }, 5000);
                if (itRes && itRes.ok) {
                    const data = await itRes.json();
                    if (data && data.results) {
                        for (const item of data.results) {
                            const title = item.collectionName || item.trackName;
                            if (!title) continue;
                            const author = item.artistName || "Unknown Author";
                            const key = `audiobook:${normalizeKey(title + author)}`;
                            if (seen.has(key)) continue;
                            seen.add(key);

                            const cover = item.artworkUrl100 ? item.artworkUrl100.replace("100x100bb", "600x600bb") : undefined;
                            results.push({
                                title,
                                author,
                                coverUrl: cover,
                                publishYear: item.releaseDate ? item.releaseDate.substring(0, 4) : undefined,
                                overview: item.description,
                                mediaType: "audiobook"
                            });
                        }
                    }
                }
            } catch (e) {}
        })());
    }

    await Promise.all(fetchTasks);

    // Relevance scoring
    const queryTokens = cleanQuery.toLowerCase().split(/\s+/).filter(t => t.length > 1);
    results.sort((a, b) => {
        const aTitleLower = a.title.toLowerCase();
        const aAuthorLower = a.author.toLowerCase();
        const bTitleLower = b.title.toLowerCase();
        const bAuthorLower = b.author.toLowerCase();

        let aScore = 0;
        let bScore = 0;

        for (const token of queryTokens) {
            if (aTitleLower.includes(token)) aScore += 20;
            if (aAuthorLower.includes(token)) aScore += 15;
            if (bTitleLower.includes(token)) bScore += 20;
            if (bAuthorLower.includes(token)) bScore += 15;
        }

        if (a.coverUrl) aScore += 10;
        if (b.coverUrl) bScore += 10;

        return bScore - aScore;
    });

    return results.slice(0, 40);
}

/**
 * Resolves or links an Author and BookSeries in the relational schema
 */
export async function resolveOrLinkAuthorAndSeries(
    authorName?: string | null,
    seriesTitle?: string | null,
    volumeNumber?: string | null
): Promise<{ authorId?: string; seriesId?: string }> {
    let authorId: string | undefined;
    let seriesId: string | undefined;

    // 1. Author Resolution & Upsert
    if (authorName && authorName.trim().length > 1 && authorName !== "Unknown Author") {
        const cleanName = authorName.trim();
        try {
            const existingAuthor = await prisma.author.findFirst({
                where: { name: cleanName }
            });

            if (existingAuthor) {
                authorId = existingAuthor.id;
            } else {
                const newAuthor = await prisma.author.create({
                    data: {
                        name: cleanName,
                        cleanName: normalizeKey(cleanName),
                        monitored: false
                    }
                });
                authorId = newAuthor.id;

                // Enrich author photo/bio asynchronously
                enrichAuthorMetadataInBackground(newAuthor.id, cleanName).catch(() => {});
            }
        } catch (e) {}
    }

    // 2. Series Resolution & Upsert
    if (seriesTitle && seriesTitle.trim().length > 1) {
        const cleanSeriesTitle = seriesTitle.trim();
        const cleanAuthor = authorName && authorName !== "Unknown Author" ? authorName.trim() : null;
        try {
            const existingSeries = await prisma.bookSeries.findFirst({
                where: {
                    title: cleanSeriesTitle,
                    ...(cleanAuthor ? { authorName: cleanAuthor } : {})
                }
            });

            if (existingSeries) {
                seriesId = existingSeries.id;
                if (!existingSeries.authorId && authorId) {
                    await prisma.bookSeries.update({
                        where: { id: existingSeries.id },
                        data: { authorId }
                    }).catch(() => {});
                }
            } else {
                const newSeries = await prisma.bookSeries.create({
                    data: {
                        title: cleanSeriesTitle,
                        cleanTitle: normalizeKey(cleanSeriesTitle),
                        authorId: authorId || null,
                        authorName: cleanAuthor,
                        monitored: false
                    }
                });
                seriesId = newSeries.id;
            }
        } catch (e) {}
    }

    return { authorId, seriesId };
}

/**
 * Asynchronously enriches author biography and photo from OpenLibrary & Wikipedia
 */
async function enrichAuthorMetadataInBackground(authorId: string, authorName: string) {
    try {
        const olSearchUrl = `https://openlibrary.org/search/authors.json?q=${encodeURIComponent(authorName)}&limit=1`;
        const res = await fetchWithTimeout(olSearchUrl, { headers: { Accept: "application/json" } }, 5000);
        if (res && res.ok) {
            const data = await res.json();
            if (data && data.docs && data.docs.length > 0) {
                const doc = data.docs[0];
                const foreignAuthorId = doc.key; // e.g. OL23919A
                const birthDate = doc.birth_date;
                const deathDate = doc.death_date;
                let photoUrl: string | undefined;

                if (foreignAuthorId) {
                    photoUrl = `https://covers.openlibrary.org/a/olid/${foreignAuthorId}-L.jpg`;
                }

                // Fetch detailed author bio
                let biography: string | undefined;
                if (foreignAuthorId) {
                    const bioRes = await fetchWithTimeout(`https://openlibrary.org/authors/${foreignAuthorId}.json`, { headers: { Accept: "application/json" } }, 5000);
                    if (bioRes && bioRes.ok) {
                        const bioData = await bioRes.json();
                        if (bioData.bio) {
                            biography = typeof bioData.bio === "string" ? bioData.bio : bioData.bio.value;
                        }
                    }
                }

                await prisma.author.update({
                    where: { id: authorId },
                    data: {
                        foreignAuthorId,
                        photoUrl,
                        birthDate,
                        deathDate,
                        biography: biography ? biography.substring(0, 3000) : undefined
                    }
                });
            }
        }
    } catch (e) {}
}

/**
 * Gets deep Author Profile with bibliography, series listings, and library presence
 */
export async function getAuthorProfile(authorNameOrId: string, username?: string, email?: string): Promise<AuthorInfo | null> {
    if (!authorNameOrId || authorNameOrId.trim().length === 0) return null;

    try {
        let author = await prisma.author.findFirst({
            where: {
                OR: [
                    { id: authorNameOrId },
                    { name: authorNameOrId.trim() },
                    { cleanName: normalizeKey(authorNameOrId) }
                ]
            },
            include: {
                books: {
                    include: { library: true }
                },
                series: {
                    include: { books: true }
                }
            }
        });

        const cleanName = author ? author.name : authorNameOrId.trim();

        // If author not in DB yet, create stub
        if (!author) {
            author = await prisma.author.create({
                data: {
                    name: cleanName,
                    cleanName: normalizeKey(cleanName)
                },
                include: {
                    books: { include: { library: true } },
                    series: { include: { books: true } }
                }
            });
            enrichAuthorMetadataInBackground(author.id, cleanName).catch(() => {});
        }

        // Fetch user accessible libraries
        const accessibleLibs = await getAccessibleLibrariesForUser(username, email);
        const accessibleLibIds = new Set(accessibleLibs.map(l => l.id));

        // Get local owned books by this author
        const ownedBooks = (author.books || []).filter(b => accessibleLibIds.has(b.libraryId));

        // Discover external works via OpenLibrary & Google Books
        const externalWorks = await searchBooksUnified(cleanName, "all");

        // Format discovery list
        const booksList: BookDiscoveryItem[] = [];
        const seenTitles = new Set<string>();

        // Add owned books first
        for (const ob of ownedBooks) {
            const key = normalizeKey(ob.title);
            seenTitles.add(key);
            booksList.push({
                id: ob.id,
                title: ob.title,
                author: ob.author || cleanName,
                series: ob.series || undefined,
                volumeNumber: ob.volumeNumber || undefined,
                coverUrl: ob.coverUrl || undefined,
                mediaType: ob.mediaType as MediaType,
                availability: {
                    status: "AVAILABLE",
                    bookId: ob.id,
                    libraryName: ob.library?.name,
                    libraryId: ob.libraryId,
                    filePath: ob.filePath,
                    fileType: ob.fileType
                }
            });
        }

        // Append external works
        for (const ew of externalWorks) {
            const key = normalizeKey(ew.title);
            if (seenTitles.has(key)) continue;
            seenTitles.add(key);
            booksList.push(ew);
        }

        // Format series list
        const seriesSummaryList: SeriesSummary[] = [];
        for (const s of author.series || []) {
            const ownedInSeries = s.books.filter(b => accessibleLibIds.has(b.libraryId)).length;
            seriesSummaryList.push({
                id: s.id,
                title: s.title,
                cleanTitle: s.cleanTitle || undefined,
                authorName: s.authorName || cleanName,
                coverUrl: s.coverUrl || undefined,
                totalVolumes: s.totalVolumes || undefined,
                ownedVolumes: ownedInSeries,
                monitored: s.monitored
            });
        }

        return {
            id: author.id,
            name: author.name,
            cleanName: author.cleanName || undefined,
            foreignAuthorId: author.foreignAuthorId || undefined,
            biography: author.biography || undefined,
            photoUrl: author.photoUrl || undefined,
            birthDate: author.birthDate || undefined,
            deathDate: author.deathDate || undefined,
            monitored: author.monitored,
            booksCount: booksList.length,
            seriesCount: seriesSummaryList.length,
            books: booksList,
            series: seriesSummaryList
        };
    } catch (e: any) {
        logger.addLog("ERROR", "BOOK_ENGINE", `Failed to get author profile for "${authorNameOrId}": ${e.message}`);
        return null;
    }
}

/**
 * Gets deep Series Profile with ordered volumes and missing volume detection
 */
export async function getBookSeriesProfile(
    seriesTitle: string,
    authorName?: string,
    username?: string,
    email?: string
): Promise<BookSeriesDetail | null> {
    if (!seriesTitle || seriesTitle.trim().length < 2) return null;
    const cleanTitle = seriesTitle.trim();
    const cleanAuthor = authorName ? authorName.trim() : "";

    try {
        const series = await prisma.bookSeries.findFirst({
            where: {
                title: cleanTitle,
                ...(cleanAuthor ? { authorName: cleanAuthor } : {})
            },
            include: {
                books: {
                    include: { library: true }
                }
            }
        });

        const accessibleLibs = await getAccessibleLibrariesForUser(username, email);
        const accessibleLibIds = new Set(accessibleLibs.map(l => l.id));

        // Map owned books by volume number or title
        const ownedVolumeMap = new Map<string, any>();
        if (series && series.books) {
            for (const b of series.books) {
                if (accessibleLibIds.has(b.libraryId)) {
                    if (b.volumeNumber) ownedVolumeMap.set(b.volumeNumber.replace(/^0+/, ""), b);
                    ownedVolumeMap.set(normalizeKey(b.title), b);
                }
            }
        }

        // Fetch full series bibliography from OpenLibrary / Google Books
        const searchTerms = `${cleanTitle} ${cleanAuthor}`.trim();
        const searchResults = await searchBooksUnified(searchTerms, "all");

        const volumes: SeriesVolumeItem[] = [];
        const seenVolumeKeys = new Set<string>();

        // Check active requests for this series
        const activeReqs = await prisma.bookRequest.findMany({
            where: {
                OR: [
                    { series: { contains: cleanTitle } },
                    { title: { contains: cleanTitle } }
                ],
                status: { notIn: ["Downloaded", "Rejected"] }
            }
        });

        const reqVolumeMap = new Map<string, typeof activeReqs[0]>();
        for (const req of activeReqs) {
            if (req.volumeNumber) reqVolumeMap.set(req.volumeNumber.replace(/^0+/, ""), req);
            reqVolumeMap.set(normalizeKey(req.title), req);
        }

        // Sequence items
        for (const item of searchResults) {
            const volNum = item.volumeNumber ? item.volumeNumber.replace(/^0+/, "") : String(volumes.length + 1);
            const titleNorm = normalizeKey(item.title);
            if (seenVolumeKeys.has(titleNorm)) continue;
            seenVolumeKeys.add(titleNorm);

            const owned = ownedVolumeMap.get(volNum) || ownedVolumeMap.get(titleNorm);
            const activeReq = reqVolumeMap.get(volNum) || reqVolumeMap.get(titleNorm);

            let status: "AVAILABLE" | "REQUESTED" | "DOWNLOADING" | "MISSING" = "MISSING";
            let bookId: string | undefined;
            let requestId: string | undefined;
            let libraryId: string | undefined;

            if (owned) {
                status = "AVAILABLE";
                bookId = owned.id;
                libraryId = owned.libraryId;
            } else if (activeReq) {
                status = activeReq.status.toLowerCase().includes("download") ? "DOWNLOADING" : "REQUESTED";
                requestId = activeReq.id;
                libraryId = activeReq.libraryId || undefined;
            }

            volumes.push({
                volumeNumber: volNum,
                title: item.title,
                author: item.author || cleanAuthor,
                coverUrl: item.coverUrl,
                publishYear: item.publishYear,
                overview: item.overview,
                mediaType: item.mediaType,
                status,
                bookId,
                requestId,
                libraryId
            });
        }

        // Sort volumes numerically
        volumes.sort((a, b) => {
            const numA = parseFloat(a.volumeNumber) || 999;
            const numB = parseFloat(b.volumeNumber) || 999;
            return numA - numB;
        });

        return {
            id: series?.id,
            title: cleanTitle,
            cleanTitle: series?.cleanTitle || normalizeKey(cleanTitle),
            authorName: cleanAuthor || series?.authorName || undefined,
            authorId: series?.authorId || undefined,
            description: series?.description || undefined,
            coverUrl: series?.coverUrl || volumes[0]?.coverUrl,
            totalVolumes: volumes.length,
            monitored: series?.monitored ?? false,
            volumes
        };
    } catch (e: any) {
        logger.addLog("ERROR", "BOOK_ENGINE", `Failed to get book series profile for "${seriesTitle}": ${e.message}`);
        return null;
    }
}

/**
 * Fetches similar books by author, series, or subject/category
 */
export async function getSimilarBooks(params: {
    title: string;
    author?: string;
    series?: string;
    mediaType?: "all" | MediaType;
    username?: string;
    email?: string;
}): Promise<BookDiscoveryItem[]> {
    const { title, author, series, mediaType = "all", username, email } = params;
    const cleanTitle = (title || "").trim();
    const cleanAuthor = (author || "").trim();
    const cleanSeries = (series || "").trim();

    const results: BookDiscoveryItem[] = [];
    const seen = new Set<string>();

    // Helper to add unique book
    const currentNorm = normalizeKey(cleanTitle);
    const addCandidate = (item: BookDiscoveryItem) => {
        if (!item.title) return;
        const itemNorm = normalizeKey(item.title);
        // Exclude the current book itself
        if (itemNorm === currentNorm || itemNorm.includes(currentNorm) || currentNorm.includes(itemNorm)) return;
        const key = `${item.mediaType || "ebook"}:${itemNorm}:${normalizeKey(item.author || "")}`;
        if (seen.has(key)) return;
        seen.add(key);
        results.push(item);
    };

    const tasks: Promise<void>[] = [];

    // 1. If part of a series, fetch other books from that series first
    if (cleanSeries && cleanSeries.length > 2) {
        tasks.push((async () => {
            try {
                const seriesProfile = await getBookSeriesProfile(cleanSeries, cleanAuthor, username, email);
                if (seriesProfile && seriesProfile.volumes) {
                    for (const vol of seriesProfile.volumes) {
                        addCandidate({
                            title: vol.title,
                            author: vol.author || cleanAuthor,
                            series: cleanSeries,
                            volumeNumber: vol.volumeNumber,
                            coverUrl: vol.coverUrl,
                            publishYear: vol.publishYear,
                            overview: vol.overview,
                            mediaType: vol.mediaType
                        });
                    }
                }
            } catch (e) {}
        })());
    }

    // 2. Fetch other books by the same author (from local DB and search)
    if (cleanAuthor && cleanAuthor.length > 2 && cleanAuthor !== "Unknown Author") {
        tasks.push((async () => {
            try {
                // Local DB books by this author
                const dbBooks = await prisma.book.findMany({
                    where: {
                        author: { contains: cleanAuthor },
                        fileType: { not: "missing" }
                    },
                    take: 12
                });
                for (const dbB of dbBooks) {
                    addCandidate({
                        id: dbB.id,
                        title: dbB.title,
                        author: dbB.author || cleanAuthor,
                        series: dbB.series || undefined,
                        volumeNumber: dbB.volumeNumber || undefined,
                        coverUrl: dbB.coverUrl || undefined,
                        mediaType: (dbB.mediaType as MediaType) || "ebook"
                    });
                }

                // External search for author's top works
                const authorWorks = await searchBooksUnified(cleanAuthor, mediaType);
                for (const w of authorWorks) {
                    addCandidate(w);
                }
            } catch (e) {}
        })());
    }

    // 3. Search related titles or subject keywords
    if (cleanTitle && cleanTitle.length > 3) {
        tasks.push((async () => {
            try {
                // Extract keywords from title (excluding common stop words)
                const stopWords = new Set(["the", "a", "an", "and", "or", "of", "in", "to", "for", "with", "on", "at", "by", "from", "volume", "vol", "book", "part"]);
                const keywords = cleanTitle
                    .replace(/[^a-zA-Z0-9\s]/g, "")
                    .split(/\s+/)
                    .filter(w => w.length > 3 && !stopWords.has(w.toLowerCase()))
                    .slice(0, 3)
                    .join(" ");

                if (keywords) {
                    const searchRes = await searchBooksUnified(keywords, mediaType);
                    for (const item of searchRes) {
                        addCandidate(item);
                    }
                }
            } catch (e) {}
        })());
    }

    await Promise.all(tasks);

    // Batch check availability
    const availMap = await batchCheckBookAvailability(results, username, email);
    for (const item of results) {
        const itemKey = `${item.title}:${item.author}`;
        if (availMap[itemKey]) {
            item.availability = availMap[itemKey];
        }
    }

    // Prioritize results with cover artwork and ratings
    results.sort((a, b) => {
        let aScore = 0;
        let bScore = 0;
        if (a.series === cleanSeries && cleanSeries) aScore += 50;
        if (b.series === cleanSeries && cleanSeries) bScore += 50;
        if (normalizeKey(a.author || "") === normalizeKey(cleanAuthor) && cleanAuthor) aScore += 30;
        if (normalizeKey(b.author || "") === normalizeKey(cleanAuthor) && cleanAuthor) bScore += 30;
        if (a.coverUrl) aScore += 10;
        if (b.coverUrl) bScore += 10;
        if (a.rating) aScore += a.rating;
        if (b.rating) bScore += b.rating;
        return bScore - aScore;
    });

    return results.slice(0, 24);
}

