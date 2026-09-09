import { prisma } from "@/lib/prisma";

const DEFAULT_TRAKT_CLIENT_ID = "61d76378e90e72dd8539223126ec034f8a84614a5dc7f694e022da34fbf1d13b";
const TRAKT_BASE_URL = "https://api.trakt.tv";

export interface TraktMediaItem {
    title: string;
    year: number;
    traktId: number;
    slug: string;
    imdbId?: string;
    tmdbId?: number;
    mediaType: "movie" | "show";
    overview?: string;
    rating?: number;
    votes?: number;
    rank?: number;
}

export async function getTraktClientId(): Promise<string> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (settings?.traktClientId && settings.traktClientId.trim()) {
            return settings.traktClientId.trim();
        }
    } catch (e) {}
    return process.env.TRAKT_CLIENT_ID || DEFAULT_TRAKT_CLIENT_ID;
}

async function traktFetch(endpoint: string, params: Record<string, string | number> = {}): Promise<any> {
    const clientId = await getTraktClientId();
    const query = new URLSearchParams(
        Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    );

    const queryString = query.toString() ? `?${query.toString()}` : "";
    const url = `${TRAKT_BASE_URL}${endpoint}${queryString}`;

    const res = await fetch(url, {
        headers: {
            "Content-Type": "application/json",
            "trakt-api-version": "2",
            "trakt-api-key": clientId
        },
        next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!res.ok) {
        throw new Error(`Trakt API error ${res.status}: ${res.statusText}`);
    }

    return res.json();
}

/**
 * Get Trakt Trending Movies
 */
export async function getTraktTrendingMovies(limit = 50): Promise<TraktMediaItem[]> {
    try {
        const data = await traktFetch("/movies/trending", { extended: "full", limit });
        return (data || []).map((item: any) => ({
            title: item.movie?.title,
            year: item.movie?.year,
            traktId: item.movie?.ids?.trakt,
            slug: item.movie?.ids?.slug,
            imdbId: item.movie?.ids?.imdb,
            tmdbId: item.movie?.ids?.tmdb,
            mediaType: "movie",
            overview: item.movie?.overview,
            rating: item.movie?.rating,
            votes: item.movie?.votes
        }));
    } catch (e: any) {
        console.error("[TRAKT] getTrendingMovies error:", e.message);
        return [];
    }
}

/**
 * Get Trakt Popular Movies
 */
export async function getTraktPopularMovies(limit = 50): Promise<TraktMediaItem[]> {
    try {
        const data = await traktFetch("/movies/popular", { extended: "full", limit });
        return (data || []).map((item: any) => ({
            title: item.title,
            year: item.year,
            traktId: item.ids?.trakt,
            slug: item.ids?.slug,
            imdbId: item.ids?.imdb,
            tmdbId: item.ids?.tmdb,
            mediaType: "movie",
            overview: item.overview,
            rating: item.rating,
            votes: item.votes
        }));
    } catch (e: any) {
        console.error("[TRAKT] getPopularMovies error:", e.message);
        return [];
    }
}

/**
 * Get Trakt Anticipated Movies (Highly awaited future releases)
 */
export async function getTraktAnticipatedMovies(limit = 50): Promise<TraktMediaItem[]> {
    try {
        const data = await traktFetch("/movies/anticipated", { extended: "full", limit });
        return (data || []).map((item: any) => ({
            title: item.movie?.title,
            year: item.movie?.year,
            traktId: item.movie?.ids?.trakt,
            slug: item.movie?.ids?.slug,
            imdbId: item.movie?.ids?.imdb,
            tmdbId: item.movie?.ids?.tmdb,
            mediaType: "movie",
            overview: item.movie?.overview,
            rating: item.movie?.rating,
            votes: item.movie?.votes
        }));
    } catch (e: any) {
        console.error("[TRAKT] getAnticipatedMovies error:", e.message);
        return [];
    }
}

/**
 * Get Trakt Box Office Movies (Top 10 weekend gross)
 */
export async function getTraktBoxOfficeMovies(): Promise<TraktMediaItem[]> {
    try {
        const data = await traktFetch("/movies/boxoffice", { extended: "full" });
        return (data || []).map((item: any, idx: number) => ({
            title: item.movie?.title,
            year: item.movie?.year,
            traktId: item.movie?.ids?.trakt,
            slug: item.movie?.ids?.slug,
            imdbId: item.movie?.ids?.imdb,
            tmdbId: item.movie?.ids?.tmdb,
            mediaType: "movie",
            overview: item.movie?.overview,
            rating: item.movie?.rating,
            rank: idx + 1
        }));
    } catch (e: any) {
        console.error("[TRAKT] getBoxOfficeMovies error:", e.message);
        return [];
    }
}

/**
 * Fetch items from a public Trakt User List
 * URL example: https://trakt.tv/users/official/lists/academy-award-best-picture-winners
 * or parameters: user = "official", listId = "academy-award-best-picture-winners"
 */
export async function getTraktUserList(userOrUrl: string, listId?: string): Promise<{
    name: string;
    description: string;
    itemCount: number;
    items: TraktMediaItem[];
} | null> {
    try {
        let user = userOrUrl;
        let slug = listId || "";

        // Parse from full URL if provided
        if (userOrUrl.includes("trakt.tv/users/")) {
            const match = userOrUrl.match(/trakt\.tv\/users\/([^/]+)\/lists\/([^/?#]+)/i);
            if (match) {
                user = match[1];
                slug = match[2];
            }
        }

        if (!user || !slug) return null;

        const listMeta = await traktFetch(`/users/${user}/lists/${slug}`);
        const listItems = await traktFetch(`/users/${user}/lists/${slug}/items`, { extended: "full" });

        const items: TraktMediaItem[] = (listItems || []).map((entry: any, index: number) => {
            const isMovie = entry.type === "movie";
            const target = isMovie ? entry.movie : entry.show;
            return {
                title: target?.title,
                year: target?.year,
                traktId: target?.ids?.trakt,
                slug: target?.ids?.slug,
                imdbId: target?.ids?.imdb,
                tmdbId: target?.ids?.tmdb,
                mediaType: isMovie ? "movie" : "show",
                overview: target?.overview,
                rating: target?.rating,
                rank: index + 1
            };
        });

        return {
            name: listMeta?.name || slug,
            description: listMeta?.description || "",
            itemCount: items.length,
            items
        };
    } catch (e: any) {
        console.error(`[TRAKT] getTraktUserList("${userOrUrl}") error:`, e.message);
        return null;
    }
}
