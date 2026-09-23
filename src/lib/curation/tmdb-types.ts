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
 * Rating & Content Evaluation Helpers (Pure client & server safe)
 */
export function isNc17OrDisallowedRating(rating?: string | null): boolean {
    if (!rating) return false;
    const clean = rating.trim().toUpperCase().replace(/^US[:\/]/, "").replace(/[^A-Z0-9\-\+]/g, "");
    return clean === "NC-17" || clean === "NC17" || clean.includes("NC-17") || clean === "X" || clean === "XXX" || clean === "AO" || clean === "ADULT";
}

export function isAdultOrMatureRating(rating?: string | null): boolean {
    if (!rating) return false;
    const clean = rating.trim().toUpperCase().replace(/^US[:\/]/, "").trim();
    return clean === "R" || clean === "NC-17" || clean === "NC17" || clean === "TV-MA" || clean === "TV-14" || clean === "X" || clean === "18+" || clean === "16+" || clean.startsWith("R/") || clean.startsWith("TV-MA") || clean.startsWith("TV-14");
}

export function isKidsSafeRating(rating?: string | null): boolean {
    if (!rating) return false;
    const clean = rating.trim().toUpperCase().replace(/^US[:\/]/, "").trim();
    return clean === "G" || clean === "PG" || clean === "TV-Y" || clean === "TV-Y7" || clean === "TV-G" || clean === "TV-PG" || clean === "ALL" || clean === "EC" || clean === "E";
}

const ADULT_KEYWORDS_REGEX = /\b(sex|sexy|sexual\w*|erotic\w*|porn\w*|nude|nudity|naked|intercourse|fetish\w*|bdsm|hentai|orgasm\w*|masturbat\w*|escort\w*|hooker\w*|brothel\w*|stripper\w*|gangbang|hardcore|incest\w*|voyeur\w*|lust\w*|penis|vagina|boobs|tits|blowjob\w*|anal|milf|dildo|ejaculat\w*|swinger\w*|prostitut\w*|whore\w*|slasher|torture|bloodbath|massacre|serial killer|cocaine|heroin|meth\b|cartel)\b/i;

export function containsAdultWords(text?: string | null): boolean {
    if (!text) return false;
    return ADULT_KEYWORDS_REGEX.test(text);
}

export function isMediaAllowedGlobally(item: TmdbMediaItem): boolean {
    if (!item) return false;
    if (isNc17OrDisallowedRating(item.certification)) return false;
    return true;
}

export function filterAllowedMedia(items: TmdbMediaItem[]): TmdbMediaItem[] {
    return items.filter(isMediaAllowedGlobally);
}

export function isKidsSectionEligible(item: TmdbMediaItem): boolean {
    if (!item) return false;
    
    // 1. Strictly exclude NC-17, Adult, X-rated globally
    if (isNc17OrDisallowedRating(item.certification)) return false;
    
    // 2. Strictly exclude R, TV-MA, TV-14, 18+, 16+ from Kids section
    if (isAdultOrMatureRating(item.certification)) return false;

    // 3. Reject explicit adult / sexual / violence keywords in title, original title, or overview
    if (containsAdultWords(item.title) || containsAdultWords(item.originalTitle) || containsAdultWords(item.overview)) {
        return false;
    }

    const genreIds = item.genreIds || [];

    // 4. Strictly exclude Horror (27)
    if (genreIds.includes(27)) {
        return false;
    }

    // 5. If certification is known and is kids-safe (G, PG, TV-Y, TV-Y7, TV-G, TV-PG) -> Allowed!
    if (isKidsSafeRating(item.certification)) {
        return true;
    }

    // 6. If certification is PG-13, NR, Unrated -> Allowed in Kids section (requires admin review)
    if (item.certification) {
        const cleanCert = item.certification.toUpperCase().replace(/^US[:\/]/, "").trim();
        if (cleanCert === "PG-13" || cleanCert === "NR" || cleanCert === "UNRATED" || cleanCert === "NOT RATED") {
            return true;
        }
    }

    // 7. If no certification was found on TMDb, allow standard non-mature genres (Family, Kids, Animation, Adventure, Sci-Fi, Comedy, Fantasy)
    // Exclude Crime (80) or Soap (10766) unless paired with Family/Kids
    if (genreIds.includes(80) || genreIds.includes(10766)) {
        const hasKidsTag = genreIds.includes(10751) || genreIds.includes(10762) || genreIds.includes(16);
        if (!hasKidsTag) return false;
    }

    return true;
}

export function filterKidsSafeMedia(items: TmdbMediaItem[]): TmdbMediaItem[] {
    return items.filter(isKidsSectionEligible);
}
