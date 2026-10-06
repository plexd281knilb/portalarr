export * from "./tmdb-types";
import type {
    TmdbMediaItem,
    TmdbCastMember,
    TmdbSeasonInfo,
    TmdbEpisodeInfo,
    TmdbVideoItem,
    TmdbMediaDetail,
    TmdbCollectionInfo
} from "./tmdb-types";
import { filterKidsSafeMedia, filterAllowedMedia, isMediaAllowedGlobally } from "./tmdb-types";

// Built-in public TMDb read-access token & fallback keys
const DEFAULT_TMDB_API_KEY = "431a8708161bcd1f1fbe7536137e61ed";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";

let cachedApiKey: { key: string; timestamp: number } | null = null;
const API_KEY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getTmdbApiKey(): Promise<string> {
    const now = Date.now();
    if (cachedApiKey && (now - cachedApiKey.timestamp < API_KEY_CACHE_TTL)) {
        return cachedApiKey.key;
    }
    let key = process.env.TMDB_API_KEY || DEFAULT_TMDB_API_KEY;
    try {
        const { prisma } = await import("@/lib/prisma");
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (settings?.tmdbApiKey && settings.tmdbApiKey.trim()) {
            key = settings.tmdbApiKey.trim();
        }
    } catch (e) {}
    cachedApiKey = { key, timestamp: now };
    return key;
}

async function tmdbFetch(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
    const apiKey = await getTmdbApiKey();
    if (!apiKey || apiKey.trim().length < 8) return null;

    const query = new URLSearchParams({
        api_key: apiKey.trim(),
        language: "en-US",
        region: "US",
        include_adult: "false",
        ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    });

    const url = `${TMDB_BASE_URL}${endpoint}?${query.toString()}`;
    try {
        const res = await fetch(url, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(7000), // 7-second network timeout to prevent hanging
            next: { revalidate: 3600 } // Cache for 1 hour
        });

        if (!res.ok) {
            return null;
        }

        return await res.json();
    } catch (e: any) {
        return null;
    }
}

/**
 * Format raw TMDb movie object into uniform TmdbMediaItem
 */
function mapTmdbMovie(m: any): TmdbMediaItem {
    let theatricalDate: string | undefined = m.release_date;
    let digitalDate: string | undefined;
    let inTheaters = false;
    let certification: string | undefined;

    // Parse release dates and certifications if available
    if (m.release_dates?.results && Array.isArray(m.release_dates.results)) {
        // First check US release
        const usReleases = m.release_dates.results.find((r: any) => r.iso_3166_1 === "US") || m.release_dates.results[0];
        if (usReleases?.release_dates) {
            for (const rel of usReleases.release_dates) {
                if (rel.certification && typeof rel.certification === "string" && rel.certification.trim() && !certification) {
                    certification = rel.certification.trim();
                }
                // Type 3 = Theatrical, Type 4 = Digital, Type 5 = Physical
                if (rel.type === 3 && !theatricalDate) {
                    theatricalDate = rel.release_date ? rel.release_date.split("T")[0] : undefined;
                }
                if (rel.type === 4 && !digitalDate) {
                    digitalDate = rel.release_date ? rel.release_date.split("T")[0] : undefined;
                }
            }
        }

        // Also check international releases to catch numeric/foreign adult ratings (18, 19, R18+, Cat III, etc.)
        for (const countryRel of m.release_dates.results) {
            if (countryRel?.release_dates) {
                for (const rel of countryRel.release_dates) {
                    const c = (rel.certification || "").trim();
                    if (c) {
                        if (!certification) {
                            certification = c;
                        } else if (/\b(18\+|19\+|18|19|r18|cat\s*iii|xxx)\b/i.test(c)) {
                            // Elevate to adult rating if any regional board flagged it as 18/19/adult
                            certification = c;
                        }
                    }
                }
            }
        }
    }

    // Check if in theaters currently (theatrical within last 90 days and digital not yet released)
    if (theatricalDate) {
        const tDate = new Date(theatricalDate);
        const now = new Date();
        const diffDays = (now.getTime() - tDate.getTime()) / (1000 * 3600 * 24);
        if (diffDays >= -14 && diffDays <= 90 && (!digitalDate || new Date(digitalDate) > now)) {
            inTheaters = true;
        }
    }

    return {
        id: m.id,
        title: m.title || m.name,
        originalTitle: m.original_title || m.original_name,
        overview: m.overview || "",
        posterPath: m.poster_path ? `${TMDB_IMAGE_BASE}${m.poster_path}` : null,
        backdropPath: m.backdrop_path ? `${TMDB_IMAGE_BASE}${m.backdrop_path}` : null,
        mediaType: "movie",
        releaseDate: m.release_date,
        theatricalReleaseDate: theatricalDate,
        digitalReleaseDate: digitalDate,
        inTheaters,
        voteAverage: m.vote_average || 0,
        voteCount: m.vote_count || 0,
        popularity: m.popularity || 0,
        genreIds: m.genre_ids || (m.genres?.map((g: any) => g.id) || []),
        genres: m.genres?.map((g: any) => g.name),
        certification,
        adult: Boolean(m.adult),
        originalLanguage: m.original_language,
        originCountry: m.origin_country || (m.production_countries?.map((c: any) => c.iso_3166_1) || []),
        imdbId: m.imdb_id || m.external_ids?.imdb_id
    };
}

/**
 * Format raw TMDb TV show object into uniform TmdbMediaItem
 */
function mapTmdbTv(t: any): TmdbMediaItem {
    let certification: string | undefined;
    if (t.content_ratings?.results && Array.isArray(t.content_ratings.results)) {
        const usRating = t.content_ratings.results.find((r: any) => r.iso_3166_1 === "US");
        if (usRating?.rating) {
            certification = usRating.rating.trim();
        }
        for (const cr of t.content_ratings.results) {
            const r = (cr.rating || "").trim();
            if (r) {
                if (!certification) {
                    certification = r;
                } else if (/\b(18\+|19\+|18|19|r18|tv-ma)\b/i.test(r)) {
                    certification = r;
                }
            }
        }
    }

    return {
        id: t.id,
        title: t.name || t.title,
        originalTitle: t.original_name || t.original_title,
        overview: t.overview || "",
        posterPath: t.poster_path ? `${TMDB_IMAGE_BASE}${t.poster_path}` : null,
        backdropPath: t.backdrop_path ? `${TMDB_IMAGE_BASE}${t.backdrop_path}` : null,
        mediaType: "tv",
        releaseDate: t.first_air_date,
        voteAverage: t.vote_average || 0,
        voteCount: t.vote_count || 0,
        popularity: t.popularity || 0,
        genreIds: t.genre_ids || (t.genres?.map((g: any) => g.id) || []),
        genres: t.genres?.map((g: any) => g.name),
        certification,
        adult: Boolean(t.adult),
        originalLanguage: t.original_language,
        originCountry: t.origin_country || [],
        imdbId: t.external_ids?.imdb_id
    };
}

/**
 * Get Trending Movies or TV Shows (Day or Week)
 */
export async function getTmdbTrending(mediaType: "movie" | "tv" | "all" = "all", timeWindow: "day" | "week" = "week", page = 1): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch(`/trending/${mediaType}/${timeWindow}`, { page });
        if (!data?.results) return [];
        return filterAllowedMedia(data.results.map((item: any) => 
            item.media_type === "tv" ? mapTmdbTv(item) : mapTmdbMovie(item)
        ));
    } catch {
        return [];
    }
}

/**
 * Get Upcoming / On The Air TV Shows
 */
export async function getTmdbUpcomingTv(page = 1): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/tv/on_the_air", { page });
        return filterAllowedMedia((data?.results || []).map(mapTmdbTv));
    } catch {
        return [];
    }
}

/**
 * Get Popular Movies
 */
export async function getTmdbPopularMovies(page = 1): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/movie/popular", { page });
        return filterAllowedMedia((data?.results || []).map(mapTmdbMovie));
    } catch {
        return [];
    }
}

/**
 * Get Top Rated Movies
 */
export async function getTmdbTopRatedMovies(page = 1): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/movie/top_rated", { page });
        return filterAllowedMedia((data?.results || []).map(mapTmdbMovie));
    } catch {
        return [];
    }
}

/**
 * Get Movies In Theaters (Now Playing)
 */
export async function getTmdbNowPlayingMovies(): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/movie/now_playing", { region: "US" });
        return filterAllowedMedia((data?.results || []).map(mapTmdbMovie));
    } catch {
        return [];
    }
}

/**
 * Get Upcoming Theatrical & Digital Releases
 */
export async function getTmdbUpcomingMovies(): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/movie/upcoming", { region: "US" });
        return filterAllowedMedia((data?.results || []).map(mapTmdbMovie));
    } catch {
        return [];
    }
}

/**
 * Discover Movies by Franchise Collection (e.g. Marvel MCU, Star Wars, Harry Potter)
 */
export async function getTmdbCollection(collectionId: number): Promise<TmdbCollectionInfo | null> {
    try {
        const data = await tmdbFetch(`/collection/${collectionId}`);
        if (!data) return null;
        return {
            id: data.id,
            name: data.name,
            overview: data.overview || "",
            posterPath: data.poster_path ? `${TMDB_IMAGE_BASE}${data.poster_path}` : null,
            backdropPath: data.backdrop_path ? `${TMDB_IMAGE_BASE}${data.backdrop_path}` : null,
            parts: filterAllowedMedia((data.parts || []).map(mapTmdbMovie)).sort((a: any, b: any) => 
                (a.releaseDate || "").localeCompare(b.releaseDate || "")
            )
        };
    } catch {
        return null;
    }
}

/**
 * Discover Media by Studio / Production Company (e.g. Pixar = 3, Disney = 2, Marvel Studios = 420, HBO = 3268, A24 = 41077)
 */
export async function getTmdbStudioMovies(companyId: number, minVotes = 50): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/discover/movie", {
            with_companies: companyId,
            sort_by: "popularity.desc",
            "vote_count.gte": minVotes
        });
        return filterAllowedMedia((data?.results || []).map(mapTmdbMovie));
    } catch {
        return [];
    }
}

/**
 * Discover TV Shows by Network (e.g. HBO = 49, Netflix = 213, Apple TV+ = 2552, Disney+ = 2739)
 */
export async function getTmdbNetworkShows(networkId: number, minVotes = 20): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/discover/tv", {
            with_networks: networkId,
            sort_by: "popularity.desc",
            "vote_count.gte": minVotes
        });
        return filterAllowedMedia((data?.results || []).map(mapTmdbTv));
    } catch {
        return [];
    }
}

/**
 * Get detailed movie information including external IDs and release date timeline
 */
export async function getTmdbMovieDetails(tmdbId: number): Promise<TmdbMediaItem | null> {
    try {
        const data = await tmdbFetch(`/movie/${tmdbId}`, {
            append_to_response: "release_dates,external_ids,keywords"
        });
        if (!data) return null;
        return mapTmdbMovie(data);
    } catch {
        return null;
    }
}

// In-memory certification cache (TTL: 24 hours) to avoid repetitive external TMDb requests
const certificationCache = new Map<string, { cert?: string; timestamp: number }>();
const CERT_CACHE_TTL = 24 * 60 * 60 * 1000;

/**
 * Fetch detailed certification for a Movie or TV show directly from TMDb
 */
export async function fetchMediaCertification(id: number, mediaType: "movie" | "tv"): Promise<string | undefined> {
    const cacheKey = `${mediaType}:${id}`;
    const cached = certificationCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CERT_CACHE_TTL)) {
        return cached.cert;
    }

    try {
        const endpoint = mediaType === "movie" ? `/movie/${id}/release_dates` : `/tv/${id}/content_ratings`;
        const data = await tmdbFetch(endpoint);
        if (!data?.results || !Array.isArray(data.results)) {
            certificationCache.set(cacheKey, { cert: undefined, timestamp: Date.now() });
            return undefined;
        }

        if (mediaType === "movie") {
            let foundCert: string | undefined;
            const usRelease = data.results.find((r: any) => r.iso_3166_1 === "US");
            if (usRelease?.release_dates && Array.isArray(usRelease.release_dates)) {
                for (const rel of usRelease.release_dates) {
                    if (rel.certification && typeof rel.certification === "string" && rel.certification.trim()) {
                        foundCert = rel.certification.trim();
                        break;
                    }
                }
            }

            // If no US rating found, fall back to other countries
            if (!foundCert) {
                for (const countryRel of data.results) {
                    if (countryRel?.release_dates && Array.isArray(countryRel.release_dates)) {
                        for (const rel of countryRel.release_dates) {
                            const c = (rel.certification || "").trim();
                            if (c) {
                                foundCert = c;
                                break;
                            }
                        }
                    }
                    if (foundCert) break;
                }
            }
            certificationCache.set(cacheKey, { cert: foundCert, timestamp: Date.now() });
            return foundCert;
        } else {
            let foundRating: string | undefined;
            const usRating = data.results.find((r: any) => r.iso_3166_1 === "US");
            if (usRating?.rating && typeof usRating.rating === "string" && usRating.rating.trim()) {
                foundRating = usRating.rating.trim();
            }
            if (!foundRating) {
                for (const cr of data.results) {
                    const r = (cr.rating || "").trim();
                    if (r) {
                        foundRating = r;
                        break;
                    }
                }
            }
            certificationCache.set(cacheKey, { cert: foundRating, timestamp: Date.now() });
            return foundRating;
        }
    } catch {
        return undefined;
    }
}

/**
 * Enriches a list of media items with US content certification ratings in parallel
 */
export async function enrichItemsWithCertifications(items: TmdbMediaItem[]): Promise<TmdbMediaItem[]> {
    if (!items || items.length === 0) return [];
    try {
        const enriched = await Promise.all(items.map(async (item) => {
            if (item.certification && item.certification.trim()) return item;
            const cert = await fetchMediaCertification(item.id, item.mediaType);
            if (cert) {
                return { ...item, certification: cert };
            }
            return item;
        }));
        return enriched;
    } catch {
        return items;
    }
}

/**
 * Search TMDb by title and release year for movie matching
 */
export async function searchTmdbMovie(title: string, year?: number): Promise<TmdbMediaItem[]> {
    try {
        const params: Record<string, string | number> = { query: title };
        if (year) params.primary_release_year = year;
        const data = await tmdbFetch("/search/movie", params);
        const mapped = (data?.results || []).map(mapTmdbMovie);
        const enriched = await enrichItemsWithCertifications(mapped);
        const allowed = filterAllowedMedia(enriched);
        return rankMediaByDownloadLikelihood(allowed, title);
    } catch {
        return [];
    }
}

/**
 * Search TMDb for TV show matching
 */
export async function searchTmdbTv(title: string, year?: number): Promise<TmdbMediaItem[]> {
    try {
        const params: Record<string, string | number> = { query: title };
        if (year) params.first_air_date_year = year;
        const data = await tmdbFetch("/search/tv", params);
        const mapped = (data?.results || []).map(mapTmdbTv);
        const enriched = await enrichItemsWithCertifications(mapped);
        const allowed = filterAllowedMedia(enriched);
        return rankMediaByDownloadLikelihood(allowed, title);
    } catch {
        return [];
    }
}

/**
 * Discover Trending & Popular Media by Streaming Provider (e.g. Disney+ = 337, Netflix = 8, Apple TV+ = 350, Amazon = 9, Max = 384)
 * Supports Family & Kids filtering (G, PG, Animation, Family).
 */
export async function getTmdbStreamingProviderMedia(
    providerId: number,
    options: {
        isKids?: boolean;
        mediaType?: "movie" | "tv" | "both";
        page?: number;
        maxPages?: number;
        minVotes?: number;
    } = {}
): Promise<TmdbMediaItem[]> {
    const { isKids = false, mediaType = "both", page = 1, maxPages = 3, minVotes = 10 } = options;
    const items: TmdbMediaItem[] = [];

    try {
        const pagesToFetch = maxPages > 1 ? Array.from({ length: maxPages }, (_, i) => page + i) : [page];

        // Fetch Movies
        if (mediaType === "movie" || mediaType === "both") {
            const moviePromises = pagesToFetch.map(p => {
                const movieParams: Record<string, string | number> = {
                    with_watch_providers: providerId,
                    watch_region: "US",
                    sort_by: "popularity.desc",
                    "vote_count.gte": minVotes,
                    page: p
                };

                if (isKids) {
                    movieParams.with_genres = "10751|16"; // Family OR Animation
                    movieParams.without_genres = "27,53,80,18,10749"; // Exclude Horror, Thriller, Crime, Drama, Romance
                    movieParams.certification_country = "US";
                    movieParams["certification.lte"] = "PG";
                }
                return tmdbFetch("/discover/movie", movieParams);
            });

            const movieResults = await Promise.all(moviePromises);
            for (const movieData of movieResults) {
                if (movieData?.results) {
                    items.push(...movieData.results.map(mapTmdbMovie));
                }
            }
        }

        // Fetch TV Shows
        if (mediaType === "tv" || mediaType === "both") {
            const tvPromises = pagesToFetch.map(p => {
                const tvParams: Record<string, string | number> = {
                    with_watch_providers: providerId,
                    watch_region: "US",
                    sort_by: "popularity.desc",
                    "vote_count.gte": Math.max(5, Math.floor(minVotes / 2)),
                    page: p
                };

                if (isKids) {
                    // Strictly require Kids (10762) or Family (10751) - avoids pulling adult animation like BoJack Horseman or South Park
                    tvParams.with_genres = "10762|10751";
                    tvParams.without_genres = "27,53,80,18,10768,10767"; // Exclude Horror, Thriller, Crime, Drama, War/Politics, Soap/Talk
                }
                return tmdbFetch("/discover/tv", tvParams);
            });

            const tvResults = await Promise.all(tvPromises);
            for (const tvData of tvResults) {
                if (tvData?.results) {
                    items.push(...tvData.results.map(mapTmdbTv));
                }
            }
        }

        // Deduplicate items by ID and apply strict kids content rating verification
        const seenIds = new Set<number>();
        const uniqueItems = items.filter(item => {
            if (seenIds.has(item.id)) return false;
            seenIds.add(item.id);

            // Filter out NC-17 or disallowed ratings globally
            if (!isMediaAllowedGlobally(item)) {
                return false;
            }

            if (isKids) {
                const cert = (item.certification || "").toUpperCase().replace(/^US[:\/]/, "").trim();
                // Explicit rejection of mature or teen certifications
                if (cert.includes("PG-13") || cert.includes("TV-14") || cert.includes("TV-MA") || cert.includes("NC-17") || cert === "R" || cert.startsWith("R/")) {
                    return false;
                }
                const gIds = item.genreIds || [];
                const isExplicitKidsGenre = gIds.includes(10751) || gIds.includes(10762);
                if (!isExplicitKidsGenre && gIds.includes(16)) {
                    // Animation without explicit family/kids genre: must have strict kids certification
                    const validKidsCerts = ["G", "PG", "TV-Y", "TV-Y7", "TV-G", "TV-PG"];
                    if (!validKidsCerts.some(c => cert === c || cert.endsWith(`/${c}`))) {
                        return false;
                    }
                }
            }

            return true;
        });

        // Sort combined list by popularity descending
        uniqueItems.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        return filterAllowedMedia(uniqueItems);
    } catch {
        return filterAllowedMedia(items);
    }
}

/**
 * Get Popular TV Shows
 */
export async function getTmdbPopularTv(page = 1): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/tv/popular", { page });
        return filterAllowedMedia((data?.results || []).map(mapTmdbTv));
    } catch {
        return [];
    }
}

/**
 * Get Top Rated TV Shows
 */
export async function getTmdbTopRatedTv(page = 1): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/tv/top_rated", { page });
        return filterAllowedMedia((data?.results || []).map(mapTmdbTv));
    } catch {
        return [];
    }
}

/**
 * Get Disney+ Trending (All or Kids, Movies or TV)
 */
export async function getDisneyTrending(isKids = false, page = 1, mediaType: "movie" | "tv" | "both" = "both"): Promise<TmdbMediaItem[]> {
    return await getTmdbStreamingProviderMedia(337, { isKids, mediaType, page, minVotes: 10 });
}

/**
 * Get Netflix Trending (All or Kids, Movies or TV)
 */
export async function getNetflixTrending(isKids = false, page = 1, mediaType: "movie" | "tv" | "both" = "both"): Promise<TmdbMediaItem[]> {
    return await getTmdbStreamingProviderMedia(8, { isKids, mediaType, page, minVotes: 10 });
}

/**
 * Get Crunchyroll Trending Anime (Simulcasts, Series, and Movies)
 */
export async function getCrunchyrollTrending(page = 1, mediaType: "movie" | "tv" | "both" = "both"): Promise<TmdbMediaItem[]> {
    return await getTmdbStreamingProviderMedia(283, { isKids: false, mediaType, page, minVotes: 5 });
}


/**
 * Get YouTube trailer and teaser videos for a movie or TV show
 */
export async function getTmdbVideos(tmdbId: number, mediaType: "movie" | "tv" = "movie"): Promise<TmdbVideoItem[]> {
    try {
        const endpoint = mediaType === "tv" ? `/tv/${tmdbId}/videos` : `/movie/${tmdbId}/videos`;
        const data = await tmdbFetch(endpoint);
        if (!data?.results || !Array.isArray(data.results)) return [];

        const youtubeVideos = data.results
            .filter((v: any) => v.site === "YouTube" && v.key)
            .map((v: any) => ({
                id: v.id,
                key: v.key,
                name: v.name || "Trailer",
                site: v.site,
                type: v.type || "Trailer",
                official: Boolean(v.official),
                url: `https://www.youtube.com/watch?v=${v.key}`,
                embedUrl: `https://www.youtube.com/embed/${v.key}`
            }));

        // Sort: Official Trailers first -> Trailers -> Teasers/Clips -> others
        return youtubeVideos.sort((a: any, b: any) => {
            const isTrailerA = a.type.toLowerCase().includes("trailer");
            const isTrailerB = b.type.toLowerCase().includes("trailer");
            if (isTrailerA && !isTrailerB) return -1;
            if (!isTrailerA && isTrailerB) return 1;
            if (a.official && !b.official) return -1;
            if (!a.official && b.official) return 1;
            return 0;
        });
    } catch {
        return [];
    }
}

function cleanSuggestion(s: string): string {
    return s.replace(/\s+(cast|streaming|movie|film|trailer|episodes|season\s*\d+|book|quotes|ending|release date|full movie|soundtrack|where to watch|imdb|review|ratings?)\b.*$/i, '').trim();
}

export function levenshteinDistance(a: string, b: string): number {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1;
            dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
        }
    }
    return dp[m][n];
}

export function stringSimilarityRatio(s1: string, s2: string): number {
    const longer = s1.length < s2.length ? s2 : s1;
    const shorter = s1.length < s2.length ? s1 : s2;
    if (longer.length === 0) return 1.0;
    return (longer.length - levenshteinDistance(s1, s2)) / longer.length;
}

export async function getSpellingSuggestion(query: string): Promise<string | null> {
    if (!query || query.trim().length < 3) return null;
    try {
        const cleanQ = query.trim();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 1800);
        const url = `https://suggestqueries.google.com/complete/search?client=chrome&hl=en&gl=us&q=${encodeURIComponent(cleanQ)}`;
        const res = await fetch(url, {
            signal: controller.signal,
            headers: { "Accept": "application/json" }
        });
        clearTimeout(timeout);
        if (!res.ok) return null;
        const data = await res.json();
        const rawSuggestions: string[] = (data[1] || []).map(cleanSuggestion).filter(Boolean);
        const unique = [...new Set(rawSuggestions)];
        if (unique.length === 0) return null;

        // Sort by edit distance to query
        unique.sort((a, b) => levenshteinDistance(cleanQ.toLowerCase(), a.toLowerCase()) - levenshteinDistance(cleanQ.toLowerCase(), b.toLowerCase()));
        const best = unique[0];
        if (best && best.toLowerCase() !== cleanQ.toLowerCase()) {
            const isAutocomplete = best.toLowerCase().startsWith(cleanQ.toLowerCase()) && best.length > cleanQ.length;
            const dist = levenshteinDistance(cleanQ.toLowerCase(), best.toLowerCase());
            // Valid typo fix: not just auto-appending to a valid root word, within reasonable typo edit distance
            if (!isAutocomplete && dist <= Math.max(3, Math.floor(cleanQ.length * 0.4))) {
                return best;
            }
        }
        return null;
    } catch {
        return null;
    }
}

/**
 * Ranks search results by likelihood of being wanted/downloaded:
 * Combines US domestic priority, English language preference, typo/fuzzy similarity matching,
 * exact query relevance, release year matching, vote count weight, and TMDb popularity score.
 */
export function rankMediaByDownloadLikelihood(items: TmdbMediaItem[], query: string, spellingSuggestion?: string | null): TmdbMediaItem[] {
    if (!items || items.length <= 1) return items;

    const rawQuery = (query || "").trim().toLowerCase();
    const cleanQuery = rawQuery.replace(/[^a-z0-9]/g, "");
    const queryWithoutArticles = rawQuery.replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "");
    const queryWords = rawQuery.split(/[\s\-_.:,]+/).filter(w => w.length > 0);

    const rawSuggestion = (spellingSuggestion || "").trim().toLowerCase();
    const cleanSuggestion = rawSuggestion.replace(/[^a-z0-9]/g, "");
    const suggestionWithoutArticles = rawSuggestion.replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "");
    const suggestionWords = rawSuggestion.split(/[\s\-_.:,]+/).filter(w => w.length > 0);
    
    // Check if query explicitly contains a 4-digit release year (e.g. "ps i love you 1981")
    const yearMatch = rawQuery.match(/\b(19\d\d|20\d\d)\b/);
    const targetYear = yearMatch ? yearMatch[1] : null;

    const scored = items.map(item => {
        let score = 0;

        const title = (item.title || "").trim().toLowerCase();
        const origTitle = (item.originalTitle || "").trim().toLowerCase();
        const cleanTitle = title.replace(/[^a-z0-9]/g, "");
        const cleanOrig = origTitle.replace(/[^a-z0-9]/g, "");
        const titleWithoutArticles = title.replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "");
        const origWithoutArticles = origTitle.replace(/^(the|a|an)\s+/, "").replace(/[^a-z0-9]/g, "");
        const itemYear = item.releaseDate ? item.releaseDate.split("-")[0] : "";

        // 1. Explicit Year Matching (if user explicitly included a year in search query)
        if (targetYear && itemYear === targetYear) {
            score += 1500;
        }

        // 2. Title Matching (Exact, Prefix, Substring, Fuzzy & Spell-Correction)
        const isExactMatch = cleanTitle === cleanQuery || cleanOrig === cleanQuery ||
                             (titleWithoutArticles && queryWithoutArticles && titleWithoutArticles === queryWithoutArticles) ||
                             (origWithoutArticles && queryWithoutArticles && origWithoutArticles === queryWithoutArticles);
        const isSuggestionExact = Boolean(cleanSuggestion && (
            cleanTitle === cleanSuggestion || cleanOrig === cleanSuggestion ||
            (titleWithoutArticles && suggestionWithoutArticles && titleWithoutArticles === suggestionWithoutArticles) ||
            (origWithoutArticles && suggestionWithoutArticles && origWithoutArticles === suggestionWithoutArticles)
        ));

        // Fuzzy similarities
        const simDirect = Math.max(
            stringSimilarityRatio(cleanQuery, cleanTitle),
            stringSimilarityRatio(cleanQuery, cleanOrig),
            queryWithoutArticles && titleWithoutArticles ? stringSimilarityRatio(queryWithoutArticles, titleWithoutArticles) : 0,
            queryWithoutArticles && origWithoutArticles ? stringSimilarityRatio(queryWithoutArticles, origWithoutArticles) : 0
        );
        const simSuggestion = cleanSuggestion ? Math.max(
            stringSimilarityRatio(cleanSuggestion, cleanTitle),
            stringSimilarityRatio(cleanSuggestion, cleanOrig),
            suggestionWithoutArticles && titleWithoutArticles ? stringSimilarityRatio(suggestionWithoutArticles, titleWithoutArticles) : 0,
            suggestionWithoutArticles && origWithoutArticles ? stringSimilarityRatio(suggestionWithoutArticles, origWithoutArticles) : 0
        ) : 0;
        const bestSimilarity = Math.max(simDirect, simSuggestion);

        if (isExactMatch) {
            score += 1200;
        } else if (isSuggestionExact) {
            score += 1100;
        } else if (cleanTitle.startsWith(cleanQuery) || cleanOrig.startsWith(cleanQuery) ||
                   (cleanSuggestion && (cleanTitle.startsWith(cleanSuggestion) || cleanOrig.startsWith(cleanSuggestion)))) {
            score += 500;
        } else if (bestSimilarity >= 0.90) {
            score += 850; // Near-perfect typo match (e.g. 1 transposed char or missing letter)
        } else if (bestSimilarity >= 0.80) {
            score += 600; // Close typo match (e.g. gladiater -> gladiator, interstelar -> interstellar)
        } else if (bestSimilarity >= 0.70) {
            score += 350; // Moderate typo match
        } else if (cleanTitle.includes(cleanQuery) || cleanOrig.includes(cleanQuery) ||
                   (cleanSuggestion && (cleanTitle.includes(cleanSuggestion) || cleanOrig.includes(cleanSuggestion)))) {
            score += 250;
        }

        // 3. Query word coverage in title (with fuzzy word matching)
        const activeWords = suggestionWords.length > 0 ? suggestionWords : queryWords;
        if (activeWords.length > 0) {
            const titleWords = title.split(/[\s\-_.:,]+/).filter(w => w.length > 0);
            const matchedCount = activeWords.filter(qw => 
                titleWords.some(tw => tw === qw || stringSimilarityRatio(qw, tw) >= 0.75)
            ).length;
            const coverage = matchedCount / activeWords.length;
            if (coverage === 1.0) {
                score += 400;
            } else if (coverage >= 0.5) {
                score += coverage * 250;
            }
        }

        // 4. US Domestic Origin & English Language Priority
        // Prioritize US domestic content and English language releases for US audiences
        const isEnglish = item.originalLanguage === "en";
        const isUSCountry = Boolean(item.originCountry && item.originCountry.includes("US"));
        const isUSDomestic = isUSCountry || (isEnglish && (!item.originCountry || item.originCountry.length === 0));

        if (isUSDomestic) {
            score += 300; // Strong US domestic priority
        }
        if (isEnglish) {
            score += 200; // English language priority
        }

        // US Content Certification rating bonus
        if (item.certification && /^(G|PG|PG-13|R|NC-17|TV-Y|TV-Y7|TV-G|TV-PG|TV-14|TV-MA)$/i.test(item.certification)) {
            score += 50;
        }

        // Foreign language deprioritization (unless high global acclaim)
        if (!isEnglish && !isUSCountry) {
            const votes = Math.max(0, Number(item.voteCount) || 0);
            if (votes < 1000) {
                score -= 300; // Obscure foreign releases heavily deprioritized
            } else if (votes < 5000) {
                score -= 150;
            }
        }

        // 5. Popularity & Vote Count Weight (Exponential separation for iconic blockbusters)
        const voteCount = Math.max(0, Number(item.voteCount) || 0);
        const voteScore = Math.log10(voteCount + 1) * 35;

        // TMDb popularity scaled (0 to ~200)
        const pop = Math.max(0, Number(item.popularity) || 0);
        const popScore = Math.min(200, pop * 2);

        score += voteScore + popScore;

        // 6. Quality & Completeness Adjustments
        // Missing poster penalty (obscure/unreleased database entries)
        if (!item.posterPath) {
            score -= 250;
        }
        // Zero votes penalty
        if (voteCount === 0) {
            score -= 100;
        }
        // Missing release date penalty
        if (!item.releaseDate) {
            score -= 50;
        }

        return { item, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.item);
}

/**
 * Multi-Search across Movies, TV Shows, and People with US Priority & Spell-Correction
 */
export async function searchTmdbMulti(query: string, page = 1): Promise<TmdbMediaItem[]> {
    if (!query || !query.trim()) return [];
    try {
        const cleanQuery = query.trim();

        // 1. Fetch spelling correction in parallel (fast US-biased spellcheck)
        const spellPromise = page === 1 ? getSpellingSuggestion(cleanQuery) : Promise.resolve(null);

        // 2. Fetch primary search on TMDb (multi + movie + tv)
        const [multiData, movieData, tvData, spellingSuggestion] = await Promise.all([
            tmdbFetch("/search/multi", {
                query: cleanQuery,
                page,
                include_adult: "false"
            }),
            page === 1 ? tmdbFetch("/search/movie", {
                query: cleanQuery,
                page: 1,
                include_adult: "false"
            }) : Promise.resolve(null),
            page === 1 ? tmdbFetch("/search/tv", {
                query: cleanQuery,
                page: 1,
                include_adult: "false"
            }) : Promise.resolve(null),
            spellPromise
        ]);

        const items: TmdbMediaItem[] = [];
        const seenKeys = new Set<string>();

        const addItem = (it: TmdbMediaItem) => {
            const key = `${it.mediaType}-${it.id}`;
            if (!seenKeys.has(key)) {
                seenKeys.add(key);
                items.push(it);
            }
        };

        // Add movie-specific direct search results first to ensure blockbuster accuracy
        if (movieData?.results && Array.isArray(movieData.results)) {
            for (const m of movieData.results) {
                addItem(mapTmdbMovie(m));
            }
        }

        // Add tv-specific direct search results
        if (tvData?.results && Array.isArray(tvData.results)) {
            for (const t of tvData.results) {
                addItem(mapTmdbTv(t));
            }
        }

        // Add multi-search results (movies, tv, and notable works)
        if (multiData?.results && Array.isArray(multiData.results)) {
            for (const item of multiData.results) {
                if (item.media_type === "movie") {
                    addItem(mapTmdbMovie(item));
                } else if (item.media_type === "tv") {
                    addItem(mapTmdbTv(item));
                } else if (item.media_type === "person" && Array.isArray(item.known_for)) {
                    // Flatten notable items for person searches
                    for (const kf of item.known_for) {
                        if (kf.media_type === "movie") addItem(mapTmdbMovie(kf));
                        else if (kf.media_type === "tv") addItem(mapTmdbTv(kf));
                    }
                }
            }
        }

        // 3. If spelling suggestion exists and differs from query, search suggested term to catch misspelled titles
        if (spellingSuggestion && spellingSuggestion.toLowerCase() !== cleanQuery.toLowerCase()) {
            try {
                const [sMulti, sMovie, sTv] = await Promise.all([
                    tmdbFetch("/search/multi", {
                        query: spellingSuggestion,
                        page: 1,
                        include_adult: "false"
                    }),
                    tmdbFetch("/search/movie", {
                        query: spellingSuggestion,
                        page: 1,
                        include_adult: "false"
                    }),
                    tmdbFetch("/search/tv", {
                        query: spellingSuggestion,
                        page: 1,
                        include_adult: "false"
                    })
                ]);

                if (sMovie?.results && Array.isArray(sMovie.results)) {
                    for (const m of sMovie.results) addItem(mapTmdbMovie(m));
                }
                if (sTv?.results && Array.isArray(sTv.results)) {
                    for (const t of sTv.results) addItem(mapTmdbTv(t));
                }
                if (sMulti?.results && Array.isArray(sMulti.results)) {
                    for (const item of sMulti.results) {
                        if (item.media_type === "movie") addItem(mapTmdbMovie(item));
                        else if (item.media_type === "tv") addItem(mapTmdbTv(item));
                    }
                }
            } catch {}
        }

        // Enrich search items with certification ratings in parallel
        const enriched = await enrichItemsWithCertifications(items);
        const allowed = filterAllowedMedia(enriched);
        return rankMediaByDownloadLikelihood(allowed, query, spellingSuggestion);
    } catch {
        return [];
    }
}

/**
 * Get comprehensive Movie details including cast, recommendations, videos, release dates & watch providers
 */
export async function getTmdbMovieDetailsFull(tmdbId: number): Promise<TmdbMediaDetail | null> {
    try {
        const data = await tmdbFetch(`/movie/${tmdbId}`, {
            append_to_response: "credits,recommendations,similar,videos,release_dates,external_ids,keywords,watch/providers"
        });
        if (!data) return null;

        const base = mapTmdbMovie(data);

        // Cast
        const cast: TmdbCastMember[] = (data.credits?.cast || []).slice(0, 20).map((c: any) => ({
            id: c.id,
            name: c.name,
            character: c.character,
            profilePath: c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : null,
            order: c.order ?? 0
        }));

        // Videos / Trailers
        const videos: TmdbVideoItem[] = (data.videos?.results || [])
            .filter((v: any) => v.site === "YouTube" && v.key)
            .map((v: any) => ({
                id: v.id,
                key: v.key,
                name: v.name || "Trailer",
                site: v.site,
                type: v.type || "Trailer",
                official: Boolean(v.official),
                url: `https://www.youtube.com/watch?v=${v.key}`,
                embedUrl: `https://www.youtube.com/embed/${v.key}`
            }))
            .sort((a: any, b: any) => {
                const isTrailerA = a.type.toLowerCase().includes("trailer");
                const isTrailerB = b.type.toLowerCase().includes("trailer");
                if (isTrailerA && !isTrailerB) return -1;
                if (!isTrailerA && isTrailerB) return 1;
                if (a.official && !b.official) return -1;
                if (!a.official && b.official) return 1;
                return 0;
            });

        // Recommendations
        const recommendations: TmdbMediaItem[] = filterAllowedMedia((data.recommendations?.results || data.similar?.results || [])
            .slice(0, 15)
            .map(mapTmdbMovie));

        // Watch Providers (US)
        const usProviders = data["watch/providers"]?.results?.US;
        const watchProviders = usProviders ? {
            stream: usProviders.flatrate?.map((p: any) => ({ providerId: p.provider_id, providerName: p.provider_name, logoPath: `${TMDB_IMAGE_BASE}${p.logo_path}` })),
            rent: usProviders.rent?.map((p: any) => ({ providerId: p.provider_id, providerName: p.provider_name, logoPath: `${TMDB_IMAGE_BASE}${p.logo_path}` })),
            buy: usProviders.buy?.map((p: any) => ({ providerId: p.provider_id, providerName: p.provider_name, logoPath: `${TMDB_IMAGE_BASE}${p.logo_path}` }))
        } : undefined;

        return {
            ...base,
            tagline: data.tagline || undefined,
            runtime: data.runtime || undefined,
            status: data.status || undefined,
            productionCompanies: (data.production_companies || []).map((pc: any) => ({
                id: pc.id,
                name: pc.name,
                logoPath: pc.logo_path ? `${TMDB_IMAGE_BASE}${pc.logo_path}` : null
            })),
            cast,
            videos,
            recommendations,
            watchProviders
        };
    } catch {
        return null;
    }
}

/**
 * Get comprehensive TV Show details including seasons, episodes count, cast, recommendations, videos & watch providers
 */
export async function getTmdbTvDetailsFull(tvId: number): Promise<TmdbMediaDetail | null> {
    try {
        const data = await tmdbFetch(`/tv/${tvId}`, {
            append_to_response: "credits,recommendations,similar,videos,content_ratings,external_ids,keywords,watch/providers"
        });
        if (!data) return null;

        const base = mapTmdbTv(data);

        // Cast
        const cast: TmdbCastMember[] = (data.credits?.cast || []).slice(0, 20).map((c: any) => ({
            id: c.id,
            name: c.name,
            character: c.character,
            profilePath: c.profile_path ? `${TMDB_IMAGE_BASE}${c.profile_path}` : null,
            order: c.order ?? 0
        }));

        // Seasons
        const seasons: TmdbSeasonInfo[] = (data.seasons || [])
            .filter((s: any) => s.season_number > 0) // Filter out Specials (Season 0) by default or keep as option
            .map((s: any) => ({
                id: s.id,
                seasonNumber: s.season_number,
                name: s.name || `Season ${s.season_number}`,
                episodeCount: s.episode_count || 0,
                airDate: s.air_date,
                posterPath: s.poster_path ? `${TMDB_IMAGE_BASE}${s.poster_path}` : null,
                overview: s.overview || ""
            }));

        // Include Season 0 (Specials) if it exists at the end
        const specials = (data.seasons || []).find((s: any) => s.season_number === 0);
        if (specials && specials.episode_count > 0) {
            seasons.push({
                id: specials.id,
                seasonNumber: 0,
                name: specials.name || "Specials",
                episodeCount: specials.episode_count,
                airDate: specials.air_date,
                posterPath: specials.poster_path ? `${TMDB_IMAGE_BASE}${specials.poster_path}` : null,
                overview: specials.overview || ""
            });
        }

        // Videos / Trailers
        const videos: TmdbVideoItem[] = (data.videos?.results || [])
            .filter((v: any) => v.site === "YouTube" && v.key)
            .map((v: any) => ({
                id: v.id,
                key: v.key,
                name: v.name || "Trailer",
                site: v.site,
                type: v.type || "Trailer",
                official: Boolean(v.official),
                url: `https://www.youtube.com/watch?v=${v.key}`,
                embedUrl: `https://www.youtube.com/embed/${v.key}`
            }))
            .sort((a: any, b: any) => {
                const isTrailerA = a.type.toLowerCase().includes("trailer");
                const isTrailerB = b.type.toLowerCase().includes("trailer");
                if (isTrailerA && !isTrailerB) return -1;
                if (!isTrailerA && isTrailerB) return 1;
                if (a.official && !b.official) return -1;
                if (!a.official && b.official) return 1;
                return 0;
            });

        // Recommendations
        const recommendations: TmdbMediaItem[] = filterAllowedMedia((data.recommendations?.results || data.similar?.results || [])
            .slice(0, 15)
            .map(mapTmdbTv));

        // Networks
        const networks = (data.networks || []).map((n: any) => ({
            id: n.id,
            name: n.name,
            logoPath: n.logo_path ? `${TMDB_IMAGE_BASE}${n.logo_path}` : null
        }));

        // Watch Providers (US)
        const usProviders = data["watch/providers"]?.results?.US;
        const watchProviders = usProviders ? {
            stream: usProviders.flatrate?.map((p: any) => ({ providerId: p.provider_id, providerName: p.provider_name, logoPath: `${TMDB_IMAGE_BASE}${p.logo_path}` })),
            rent: usProviders.rent?.map((p: any) => ({ providerId: p.provider_id, providerName: p.provider_name, logoPath: `${TMDB_IMAGE_BASE}${p.logo_path}` })),
            buy: usProviders.buy?.map((p: any) => ({ providerId: p.provider_id, providerName: p.provider_name, logoPath: `${TMDB_IMAGE_BASE}${p.logo_path}` }))
        } : undefined;

        return {
            ...base,
            tvdbId: data.external_ids?.tvdb_id ? parseInt(data.external_ids.tvdb_id, 10) : undefined,
            tagline: data.tagline || undefined,
            status: data.status || undefined,
            numberOfSeasons: data.number_of_seasons || seasons.length,
            numberOfEpisodes: data.number_of_episodes || undefined,
            networks,
            seasons,
            cast,
            videos,
            recommendations,
            watchProviders
        };
    } catch {
        return null;
    }
}

/**
 * Get detailed episodes list for a specific TV Season
 */
export async function getTmdbTvSeasonDetails(tvId: number, seasonNumber: number): Promise<TmdbEpisodeInfo[]> {
    try {
        const data = await tmdbFetch(`/tv/${tvId}/season/${seasonNumber}`);
        if (!data?.episodes || !Array.isArray(data.episodes)) return [];

        return data.episodes.map((ep: any) => ({
            id: ep.id,
            episodeNumber: ep.episode_number,
            seasonNumber: ep.season_number,
            name: ep.name || `Episode ${ep.episode_number}`,
            overview: ep.overview || "",
            airDate: ep.air_date,
            stillPath: ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : null,
            voteAverage: ep.vote_average || 0,
            runtime: ep.runtime || undefined
        }));
    } catch {
        return [];
    }
}


/**
 * Get Kids & Family Trending Movies or TV Shows
 */
export async function getTmdbKidsTrending(mediaType: "movie" | "tv" | "all" = "all", page = 1): Promise<TmdbMediaItem[]> {
    try {
        if (mediaType === "movie") {
            const data = await tmdbFetch("/discover/movie", {
                page,
                with_genres: "10751,16", // Family, Animation
                certification_country: "US",
                "certification.lte": "PG",
                sort_by: "popularity.desc"
            });
            const mapped = (data?.results || []).map(mapTmdbMovie);
            const enriched = await enrichItemsWithCertifications(mapped);
            return filterKidsSafeMedia(enriched);
        } else if (mediaType === "tv") {
            const data = await tmdbFetch("/discover/tv", {
                page,
                with_genres: "10762,16,10751", // Kids, Animation, Family
                certification_country: "US",
                "certification.lte": "TV-PG",
                sort_by: "popularity.desc"
            });
            const mapped = (data?.results || []).map(mapTmdbTv);
            const enriched = await enrichItemsWithCertifications(mapped);
            return filterKidsSafeMedia(enriched);
        } else {
            const [movies, tv] = await Promise.all([
                getTmdbKidsTrending("movie", page),
                getTmdbKidsTrending("tv", page)
            ]);
            return [...movies, ...tv].sort((a, b) => b.popularity - a.popularity);
        }
    } catch {
        return [];
    }
}

/**
 * Get Kids Popular Movies or TV Series
 */
export async function getTmdbKidsPopular(mediaType: "movie" | "tv" = "movie", page = 1): Promise<TmdbMediaItem[]> {
    try {
        if (mediaType === "movie") {
            const data = await tmdbFetch("/discover/movie", {
                page,
                with_genres: "10751", // Family
                certification_country: "US",
                "certification.lte": "PG",
                sort_by: "popularity.desc"
            });
            const mapped = (data?.results || []).map(mapTmdbMovie);
            const enriched = await enrichItemsWithCertifications(mapped);
            return filterKidsSafeMedia(enriched);
        } else {
            const data = await tmdbFetch("/discover/tv", {
                page,
                with_genres: "10762,10751", // Kids, Family
                certification_country: "US",
                "certification.lte": "TV-PG",
                sort_by: "popularity.desc"
            });
            const mapped = (data?.results || []).map(mapTmdbTv);
            const enriched = await enrichItemsWithCertifications(mapped);
            return filterKidsSafeMedia(enriched);
        }
    } catch {
        return [];
    }
}

/**
 * Get Disney & Pixar Hits
 */
export async function getTmdbDisneyPixar(page = 1): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/discover/movie", {
            page,
            with_companies: "2|3|6125", // Disney, Pixar, Disney Animation
            certification_country: "US",
            "certification.lte": "PG",
            sort_by: "popularity.desc"
        });
        const mapped = (data?.results || []).map(mapTmdbMovie);
        const enriched = await enrichItemsWithCertifications(mapped);
        return filterKidsSafeMedia(enriched);
    } catch {
        return [];
    }
}

/**
 * Get Top Rated Family Movies
 */
export async function getTmdbKidsTopRated(mediaType: "movie" | "tv" = "movie", page = 1): Promise<TmdbMediaItem[]> {
    try {
        if (mediaType === "movie") {
            const data = await tmdbFetch("/discover/movie", {
                page,
                with_genres: "10751,16",
                "vote_count.gte": 100,
                certification_country: "US",
                "certification.lte": "PG",
                sort_by: "vote_average.desc"
            });
            const mapped = (data?.results || []).map(mapTmdbMovie);
            const enriched = await enrichItemsWithCertifications(mapped);
            return filterKidsSafeMedia(enriched);
        } else {
            const data = await tmdbFetch("/discover/tv", {
                page,
                with_genres: "10762,10751",
                "vote_count.gte": 50,
                certification_country: "US",
                "certification.lte": "TV-PG",
                sort_by: "vote_average.desc"
            });
            const mapped = (data?.results || []).map(mapTmdbTv);
            const enriched = await enrichItemsWithCertifications(mapped);
            return filterKidsSafeMedia(enriched);
        }
    } catch {
        return [];
    }
}


