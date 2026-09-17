import { prisma } from "@/lib/prisma";

// Built-in public TMDb read-access token & fallback keys
const DEFAULT_TMDB_API_KEY = "431a8708161bcd1f1fbe7536137e61ed";
const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/original";

export interface TmdbMediaItem {
    id: number;
    title: string;
    originalTitle?: string;
    overview: string;
    posterPath: string | null;
    backdropPath: string | null;
    mediaType: "movie" | "tv";
    releaseDate?: string;
    theatricalReleaseDate?: string;
    digitalReleaseDate?: string;
    inTheaters?: boolean;
    voteAverage: number;
    voteCount: number;
    popularity: number;
    genreIds: number[];
    genres?: string[];
    certification?: string; // MPAA or TV Rating (e.g. PG-13, R, TV-MA)
    imdbId?: string;
    nudityLevel?: string;
    violenceLevel?: string;
    profanityLevel?: string;
    alcoholLevel?: string;
    frighteningLevel?: string;
}

export interface TmdbCollectionInfo {
    id: number;
    name: string;
    overview: string;
    posterPath: string | null;
    backdropPath: string | null;
    parts: TmdbMediaItem[];
}

export async function getTmdbApiKey(): Promise<string> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (settings?.tmdbApiKey && settings.tmdbApiKey.trim()) {
            return settings.tmdbApiKey.trim();
        }
    } catch (e) {}
    return process.env.TMDB_API_KEY || DEFAULT_TMDB_API_KEY;
}

async function tmdbFetch(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
    const apiKey = await getTmdbApiKey();
    if (!apiKey || apiKey.trim().length < 8) return null;

    const query = new URLSearchParams({
        api_key: apiKey.trim(),
        language: "en-US",
        ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    });

    const url = `${TMDB_BASE_URL}${endpoint}?${query.toString()}`;
    try {
        const res = await fetch(url, {
            headers: { "Accept": "application/json" },
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
    if (m.release_dates?.results) {
        const usReleases = m.release_dates.results.find((r: any) => r.iso_3166_1 === "US") || m.release_dates.results[0];
        if (usReleases?.release_dates) {
            for (const rel of usReleases.release_dates) {
                if (rel.certification && !certification) {
                    certification = rel.certification;
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
        imdbId: m.imdb_id || m.external_ids?.imdb_id
    };
}

/**
 * Format raw TMDb TV show object into uniform TmdbMediaItem
 */
function mapTmdbTv(t: any): TmdbMediaItem {
    let certification: string | undefined;
    if (t.content_ratings?.results) {
        const usRating = t.content_ratings.results.find((r: any) => r.iso_3166_1 === "US");
        if (usRating) certification = usRating.rating;
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
        imdbId: t.external_ids?.imdb_id
    };
}

/**
 * Get Trending Movies or TV Shows (Day or Week)
 */
export async function getTmdbTrending(mediaType: "movie" | "tv" | "all" = "all", timeWindow: "day" | "week" = "week"): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch(`/trending/${mediaType}/${timeWindow}`);
        if (!data?.results) return [];
        return data.results.map((item: any) => 
            item.media_type === "tv" ? mapTmdbTv(item) : mapTmdbMovie(item)
        );
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
        return (data?.results || []).map(mapTmdbMovie);
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
        return (data?.results || []).map(mapTmdbMovie);
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
        return (data?.results || []).map(mapTmdbMovie);
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
        return (data?.results || []).map(mapTmdbMovie);
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
            parts: (data.parts || []).map(mapTmdbMovie).sort((a: any, b: any) => 
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
        return (data?.results || []).map(mapTmdbMovie);
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
        return (data?.results || []).map(mapTmdbTv);
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

/**
 * Search TMDb by title and release year for movie matching
 */
export async function searchTmdbMovie(title: string, year?: number): Promise<TmdbMediaItem[]> {
    try {
        const params: Record<string, string | number> = { query: title };
        if (year) params.primary_release_year = year;
        const data = await tmdbFetch("/search/movie", params);
        return (data?.results || []).map(mapTmdbMovie);
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
        return (data?.results || []).map(mapTmdbTv);
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
                    movieParams.with_genres = "16|10751|10762"; // Animation OR Family OR Kids
                    movieParams.without_genres = "27,53,80"; // Exclude Horror, Thriller, Crime
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
                    tvParams.with_genres = "16|10751|10762"; // Animation OR Family OR Kids
                    tvParams.without_genres = "27,53,80"; // Exclude Horror, Thriller, Crime
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

        // Deduplicate items by ID
        const seenIds = new Set<number>();
        const uniqueItems = items.filter(item => {
            if (seenIds.has(item.id)) return false;
            seenIds.add(item.id);
            return true;
        });

        // Sort combined list by popularity descending
        uniqueItems.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        return uniqueItems;
    } catch {
        return items;
    }
}

/**
 * Get Popular TV Shows
 */
export async function getTmdbPopularTv(page = 1): Promise<TmdbMediaItem[]> {
    try {
        const data = await tmdbFetch("/tv/popular", { page });
        return (data?.results || []).map(mapTmdbTv);
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
        return (data?.results || []).map(mapTmdbTv);
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

export interface TmdbVideoItem {
    id: string;
    key: string;
    name: string;
    site: string;
    type: string;
    official: boolean;
    url: string;
    embedUrl: string;
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

