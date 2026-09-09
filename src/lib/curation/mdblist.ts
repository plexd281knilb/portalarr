import { prisma } from "@/lib/prisma";

const MDBLIST_BASE_URL = "https://mdblist.com/api";

export interface MdblistRatings {
    imdbRating?: number;
    imdbVotes?: number;
    tmdbRating?: number;
    traktRating?: number;
    tomatoesCritics?: number; // 0-100%
    tomatoesAudience?: number; // 0-100%
    metacriticScore?: number; // 0-100
    certification?: string;
}

export interface MdblistItem {
    id: number;
    title: string;
    year: number;
    imdbId?: string;
    tmdbId?: number;
    traktId?: number;
    mediaType: "movie" | "show";
    ratings: MdblistRatings;
}

export async function getMdblistApiKey(): Promise<string | null> {
    try {
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (settings?.mdblistApiKey && settings.mdblistApiKey.trim()) {
            return settings.mdblistApiKey.trim();
        }
    } catch (e) {}
    return process.env.MDBLIST_API_KEY || null;
}

/**
 * Fetch combined ratings for a specific movie or TV show by IMDb ID or TMDb ID
 */
export async function getMdblistRatings(imdbId?: string, tmdbId?: number, mediaType: "movie" | "show" = "movie"): Promise<MdblistRatings | null> {
    const apiKey = await getMdblistApiKey();
    if (!apiKey) return null;

    try {
        const query = new URLSearchParams({ apikey: apiKey });
        if (imdbId) query.set("i", imdbId);
        else if (tmdbId) query.set("tm", String(tmdbId));
        else return null;

        query.set("m", mediaType);

        const res = await fetch(`${MDBLIST_BASE_URL}?${query.toString()}`, {
            next: { revalidate: 86400 } // Cache for 24h
        });

        if (!res.ok) return null;
        const data = await res.json();
        if (!data || data.response === false) return null;

        const ratings: MdblistRatings = {};
        if (data.ratings) {
            for (const r of data.ratings) {
                if (r.source === "imdb") {
                    ratings.imdbRating = r.value;
                    ratings.imdbVotes = r.votes;
                } else if (r.source === "tomatoes") {
                    ratings.tomatoesCritics = r.score;
                } else if (r.source === "tomatoesaudience") {
                    ratings.tomatoesAudience = r.score;
                } else if (r.source === "metacritic") {
                    ratings.metacriticScore = r.score;
                } else if (r.source === "trakt") {
                    ratings.traktRating = r.value;
                } else if (r.source === "tmdb") {
                    ratings.tmdbRating = r.value;
                }
            }
        }
        ratings.certification = data.certification;
        return ratings;
    } catch (e: any) {
        console.error("[MDBLIST] getMdblistRatings error:", e.message);
        return null;
    }
}

/**
 * Fetch curated items from an MDBList list URL or ID
 * Example: https://mdblist.com/lists/linaspurinis/top-watched-movies-of-the-week
 */
export async function getMdblistItems(listIdOrUrl: string): Promise<MdblistItem[]> {
    const apiKey = await getMdblistApiKey();
    if (!apiKey) return [];

    try {
        let listParam = listIdOrUrl;
        if (listIdOrUrl.includes("mdblist.com/lists/")) {
            const match = listIdOrUrl.match(/mdblist\.com\/lists\/([^/?#]+)/i);
            if (match) listParam = match[1];
        }

        const query = new URLSearchParams({
            apikey: apiKey,
            l: listParam
        });

        const res = await fetch(`${MDBLIST_BASE_URL}/lists/items?${query.toString()}`, {
            next: { revalidate: 3600 }
        });

        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];

        return data.map((item: any) => ({
            id: item.id,
            title: item.title,
            year: item.year,
            imdbId: item.imdb_id,
            tmdbId: item.tmdb_id,
            traktId: item.trakt_id,
            mediaType: item.mediatype === "show" ? "show" : "movie",
            ratings: {
                imdbRating: item.imdb_rating,
                tomatoesCritics: item.tomatoes_score,
                tomatoesAudience: item.tomatoes_user_score,
                metacriticScore: item.metacritic_score
            }
        }));
    } catch (e: any) {
        console.error(`[MDBLIST] getMdblistItems("${listIdOrUrl}") error:`, e.message);
        return [];
    }
}
