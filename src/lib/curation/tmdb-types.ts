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
    adult?: boolean;
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
    
    // Explicit global adult / extreme ratings (US and International)
    if (clean === "NC-17" || clean === "NC17" || clean.includes("NC-17") || 
        clean === "X" || clean === "XXX" || clean === "AO" || clean === "ADULT" || 
        clean === "PORNO" || clean === "PORN" ||
        clean === "18" || clean === "18+" || clean === "18A" || clean === "18R" ||
        clean === "19" || clean === "19+" || 
        clean === "R18" || clean === "R18+" || clean === "R-18" || clean === "R-19" ||
        clean === "CATIII" || clean === "CATEGORYIII" || clean === "III") {
        return true;
    }

    // Pattern match for numeric adult ratings (e.g. 18, 18+, 19, 19+, R18+, Cat III)
    return /\b(18\+|19\+|r18\+|r-18|cat\s*iii|xxx|nc-17)\b/i.test(rating);
}

export function isAdultOrMatureRating(rating?: string | null): boolean {
    if (!rating) return false;
    const clean = rating.trim().toUpperCase().replace(/^US[:\/]/, "").trim();
    
    // Check globally disallowed ratings first
    if (isNc17OrDisallowedRating(rating)) return true;

    // Check mature ratings to strictly exclude from Kids mode (16, 16+, 18, 18+, 19, 19+, R, TV-MA, TV-14, NR, Unrated)
    if (clean === "R" || clean.startsWith("R/") || clean === "R15" || clean === "R-15" || clean === "R15+" ||
        clean === "TV-MA" || clean.startsWith("TV-MA") || clean === "TV-14" || clean.startsWith("TV-14") ||
        clean === "16" || clean === "16+" || clean === "16A" || clean === "R-16" ||
        clean === "15" || clean === "15+" || clean === "MA15+" || clean === "MA 15+" ||
        clean === "M" || clean.startsWith("M/") ||
        clean === "NR" || clean === "UR" || clean === "UNRATED" || clean === "NOT RATED" || clean === "NOT-RATED") {
        return true;
    }

    return /\b(16\+|18\+|19\+|15\+|r15|ma15|tv-ma|tv-14)\b/i.test(rating);
}

export function isKidsSafeRating(rating?: string | null): boolean {
    if (!rating) return false;
    const clean = rating.trim().toUpperCase().replace(/^US[:\/]/, "").trim();
    return clean === "G" || clean === "PG" || clean === "TV-Y" || clean === "TV-Y7" || clean === "TV-G" || clean === "TV-PG" || clean === "ALL" || clean === "EC" || clean === "E";
}

const ADULT_KEYWORDS_REGEX = /\b(sex|sexy|sexual\w*|erotic\w*|erotica|porn\w*|porno\w*|nude|nudity|naked|intercourse|fetish\w*|bdsm|hentai|orgasm\w*|masturbat\w*|escort\w*|hooker\w*|brothel\w*|stripper\w*|gangbang|hardcore|softcore|incest\w*|voyeur\w*|voyeurism|lust\w*|penis|vagina|boobs|tits|blowjob\w*|anal|milf|dildo|ejaculat\w*|swinger\w*|prostitut\w*|whore\w*|slasher|torture|bloodbath|massacre|serial killer|cocaine|heroin|meth\b|cartel|obscene|affair\w*|mistress\w*|sensual\w*|adultery|bed scene|seduction|steamy|taboo|cuckold|pink film|roman porno|jav\b|av idol|nympho\w*|sugar daddy|sugar baby|massage parlor|sex film|peeping tom|sensual massage)\b/i;

const EROTIC_VOD_TITLE_REGEX = /\b(obscene|erotic|sensual affair|secret bed|young mother \d|boarding house \d|neighbor'?s wife|unfaithful wife|female host \d|private tutor \d|dangerous affair|tasty sister|delicious sex|erotic island)\b/i;

export function containsAdultWords(text?: string | null): boolean {
    if (!text) return false;
    return ADULT_KEYWORDS_REGEX.test(text);
}

export function containsEroticVodPatterns(text?: string | null): boolean {
    if (!text) return false;
    return EROTIC_VOD_TITLE_REGEX.test(text);
}

export function isMediaAllowedGlobally(item: TmdbMediaItem): boolean {
    if (!item) return false;
    
    // 1. Explicit TMDb adult flag
    if (item.adult === true || (item as any).is_adult === true) {
        return false;
    }

    // 2. Reject NC-17, 18, 18+, 19, 19+, Cat III, X, XXX, Porno, Adult ratings
    if (isNc17OrDisallowedRating(item.certification)) {
        return false;
    }

    // 3. Reject explicit adult keywords in title or original title
    if (containsAdultWords(item.title) || containsAdultWords(item.originalTitle)) {
        return false;
    }

    // 4. Reject suspicious erotic VOD / softcore patterns
    if (containsEroticVodPatterns(item.title) || containsEroticVodPatterns(item.originalTitle)) {
        return false;
    }

    // 5. Reject adult keywords in overview for low-popularity/obscure items (under 100 votes)
    if ((item.voteCount < 100 || item.popularity < 10) && containsAdultWords(item.overview)) {
        return false;
    }

    // 6. Reject genre list containing "Erotic" or "Adult"
    if (item.genres && item.genres.some(g => /erotic|adult|porn/i.test(g))) {
        return false;
    }

    return true;
}

export function filterAllowedMedia(items: TmdbMediaItem[]): TmdbMediaItem[] {
    return items.filter(isMediaAllowedGlobally);
}

export function isKidsSectionEligible(item: TmdbMediaItem): boolean {
    if (!item) return false;
    
    // 1. Must pass global media allowance (no adult films, no 18/19 ratings, no obscene keywords)
    if (!isMediaAllowedGlobally(item)) {
        return false;
    }
    
    // 2. Strictly exclude mature ratings: 16, 16+, 18, 18+, 19, 19+, R, TV-MA, TV-14, NR, Unrated, etc.
    if (isAdultOrMatureRating(item.certification)) {
        return false;
    }

    // 3. Reject explicit adult / sexual / violence keywords anywhere in item
    if (containsAdultWords(item.title) || containsAdultWords(item.originalTitle) || containsAdultWords(item.overview)) {
        return false;
    }

    const genreIds = item.genreIds || [];

    // 4. Strictly exclude Horror (27)
    if (genreIds.includes(27)) {
        return false;
    }

    // 5. Exclude Crime (80), Soap (10766), Romance (10749), or Drama (18) unless explicitly paired with Family (10751), Kids (10762), or Animation (16)
    if (genreIds.includes(80) || genreIds.includes(10766) || genreIds.includes(10749) || genreIds.includes(18)) {
        const hasKidsTag = genreIds.includes(10751) || genreIds.includes(10762) || genreIds.includes(16);
        if (!hasKidsTag) return false;
    }

    // 6. If certification is known and is kids-safe (G, PG, TV-Y, TV-Y7, TV-G, TV-PG) -> Allowed!
    if (isKidsSafeRating(item.certification)) {
        return true;
    }

    // 7. If no certification was found on TMDb, only allow if explicitly tagged with Family, Kids, or Animation
    const hasFamilyOrKidsGenre = genreIds.includes(10751) || genreIds.includes(10762) || genreIds.includes(16);
    if (hasFamilyOrKidsGenre) {
        return true;
    }

    return false;
}

export function filterKidsSafeMedia(items: TmdbMediaItem[]): TmdbMediaItem[] {
    return items.filter(isKidsSectionEligible);
}
