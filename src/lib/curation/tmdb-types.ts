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
    tvdbId?: number;
    nudityLevel?: string;
    violenceLevel?: string;
    profanityLevel?: string;
    alcoholLevel?: string;
    frighteningLevel?: string;
}

export interface TmdbCastMember {
    id: number;
    name: string;
    character?: string;
    profilePath: string | null;
    order: number;
}

export interface TmdbSeasonInfo {
    id: number;
    seasonNumber: number;
    name: string;
    episodeCount: number;
    airDate?: string;
    posterPath: string | null;
    overview: string;
}

export interface TmdbEpisodeInfo {
    id: number;
    episodeNumber: number;
    seasonNumber: number;
    name: string;
    overview: string;
    airDate?: string;
    stillPath: string | null;
    voteAverage: number;
    runtime?: number;
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

export interface TmdbMediaDetail extends TmdbMediaItem {
    tagline?: string;
    runtime?: number; // Minutes
    status?: string; // Released, Returning Series, Ended, In Production
    networks?: { id: number; name: string; logoPath: string | null }[];
    productionCompanies?: { id: number; name: string; logoPath: string | null }[];
    numberOfSeasons?: number;
    numberOfEpisodes?: number;
    seasons?: TmdbSeasonInfo[];
    cast?: TmdbCastMember[];
    videos?: TmdbVideoItem[];
    recommendations?: TmdbMediaItem[];
    watchProviders?: {
        stream?: { providerId: number; providerName: string; logoPath: string }[];
        rent?: { providerId: number; providerName: string; logoPath: string }[];
        buy?: { providerId: number; providerName: string; logoPath: string }[];
    };
}

export interface TmdbCollectionInfo {
    id: number;
    name: string;
    overview: string;
    posterPath: string | null;
    backdropPath: string | null;
    parts: TmdbMediaItem[];
}

/**
 * Rating Evaluation Helpers (Pure client & server safe)
 */
export function isAdultOrMatureRating(rating?: string | null): boolean {
    if (!rating) return false;
    const clean = rating.trim().toUpperCase();
    return clean === "R" || clean === "NC-17" || clean === "TV-MA" || clean === "TV-14" || clean === "X" || clean === "18+" || clean === "16+";
}

export function isKidsSafeRating(rating?: string | null): boolean {
    if (!rating) return false;
    const clean = rating.trim().toUpperCase();
    return clean === "G" || clean === "PG" || clean === "TV-Y" || clean === "TV-Y7" || clean === "TV-G" || clean === "TV-PG" || clean === "ALL" || clean === "EC" || clean === "E";
}

export function isKidsSectionEligible(item: TmdbMediaItem): boolean {
    if (isAdultOrMatureRating(item.certification)) return false;
    // Exclude Horror (27)
    if (item.genreIds?.includes(27)) return false;
    return true;
}

export function filterKidsSafeMedia(items: TmdbMediaItem[]): TmdbMediaItem[] {
    return items.filter(isKidsSectionEligible);
}
