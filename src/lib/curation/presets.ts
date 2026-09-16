export interface CollectionPreset {
    id: string;
    title: string;
    type: "curated" | "smart" | "schedule" | "dynamic" | "custom" | "seasonal";
    category: "awards" | "franchise" | "studio" | "decade" | "holiday" | "quality" | "dynamic";
    description: string;
    icon: string;
    defaultPosterUrl?: string;
    sourceType: "tmdb" | "trakt" | "mdblist" | "plex_query" | "manual";
    sourceQuery?: string;
    mediaType: "movie" | "show" | "both";
    defaultSort?: "release" | "rating" | "title" | "random" | "custom";
    defaultHomeOrder?: number;
    defaultSortPrefix?: string;
    defaultCollectionMode?: "default" | "hide" | "hideItems" | "showItems";
    defaultActiveDays?: string;
    defaultActiveTimeRange?: string;
    defaultIncludePlaceholders?: boolean;
    defaultMaxItems?: number;
    defaultExcludedLabels?: string;
    isSeasonal?: boolean;
    scheduleStartMonth?: number; // 1-12
    scheduleStartDay?: number;   // 1-31
    scheduleEndMonth?: number;   // 1-12
    scheduleEndDay?: number;     // 1-31
    seasonalAction?: "promote_hide" | "keep_demoted" | "create_delete";
}

export const COLLECTION_PRESETS: CollectionPreset[] = [
    // 🏆 AWARDS & TOP CHARTS
    {
        id: "oscars-best-picture",
        title: "Academy Award: Best Picture Winners",
        type: "curated",
        category: "awards",
        description: "All Oscar Best Picture winning films throughout cinematic history.",
        icon: "Trophy",
        sourceType: "mdblist",
        sourceQuery: "top-oscar-best-picture",
        mediaType: "movie",
        defaultSort: "release",
        defaultHomeOrder: 4,
        defaultSortPrefix: "!04_",
        defaultPosterUrl: "https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&auto=format&fit=crop&q=80"
    },
    {
        id: "imdb-top-250-movies",
        title: "IMDb Top 250 Movies",
        type: "smart",
        category: "awards",
        description: "The top 250 highest-rated movies of all time according to IMDb user ratings.",
        icon: "Star",
        sourceType: "mdblist",
        sourceQuery: "top-imdb-250",
        mediaType: "movie",
        defaultSort: "rating",
        defaultHomeOrder: 5,
        defaultSortPrefix: "!05_"
    },
    {
        id: "imdb-top-250-tv",
        title: "IMDb Top 250 TV Shows",
        type: "smart",
        category: "awards",
        description: "The top 250 highest-rated television shows according to IMDb.",
        icon: "Tv",
        sourceType: "mdblist",
        sourceQuery: "top-imdb-tv",
        mediaType: "show",
        defaultSort: "rating",
        defaultHomeOrder: 6,
        defaultSortPrefix: "!06_"
    },

    // 🦸 FRANCHISES & UNIVERSES
    {
        id: "marvel-cinematic-universe",
        title: "Marvel Cinematic Universe (MCU)",
        type: "curated",
        category: "franchise",
        description: "All Marvel Studios MCU movies and Disney+ series in chronological timeline order.",
        icon: "Zap",
        sourceType: "tmdb",
        sourceQuery: "collection:86311", // Marvel Collection
        mediaType: "both",
        defaultSort: "release",
        defaultHomeOrder: 7,
        defaultSortPrefix: "!07_"
    },
    {
        id: "star-wars-saga",
        title: "Star Wars: The Skywalker Saga & Beyond",
        type: "curated",
        category: "franchise",
        description: "A galaxy far, far away — spanning the prequels, original trilogy, sequels, and Disney+ series.",
        icon: "Sparkles",
        sourceType: "tmdb",
        sourceQuery: "collection:10",
        mediaType: "both",
        defaultSort: "release",
        defaultHomeOrder: 8,
        defaultSortPrefix: "!08_"
    },
    {
        id: "dc-extended-universe",
        title: "DC Universe & DCEU",
        type: "curated",
        category: "franchise",
        description: "Batman, Superman, Wonder Woman, and the DC Extended Universe.",
        icon: "Shield",
        sourceType: "tmdb",
        sourceQuery: "franchise:dceu",
        mediaType: "both",
        defaultSort: "release",
        defaultHomeOrder: 9,
        defaultSortPrefix: "!09_"
    },
    {
        id: "pixar-animation-studios",
        title: "Pixar Animation Studios",
        type: "curated",
        category: "studio",
        description: "From Toy Story to Inside Out — the complete Pixar animated feature collection.",
        icon: "HeartHandshake",
        sourceType: "tmdb",
        sourceQuery: "company:3", // Pixar TMDb ID
        mediaType: "movie",
        defaultSort: "release",
        defaultHomeOrder: 10,
        defaultSortPrefix: "!10_"
    },
    {
        id: "studio-ghibli-classics",
        title: "Studio Ghibli Masterpieces",
        type: "curated",
        category: "studio",
        description: "Hayao Miyazaki and Isao Takahata's legendary animated films.",
        icon: "CloudRain",
        sourceType: "tmdb",
        sourceQuery: "company:10342", // Studio Ghibli
        mediaType: "movie",
        defaultSort: "release",
        defaultHomeOrder: 11,
        defaultSortPrefix: "!11_"
    },

    // 📺 STREAMING NETWORKS & ORIGINALS
    {
        id: "hbo-originals",
        title: "HBO & Max Originals",
        type: "curated",
        category: "studio",
        description: "Critically acclaimed prestige dramas and comedies produced by HBO.",
        icon: "Flame",
        sourceType: "tmdb",
        sourceQuery: "network:49", // HBO
        mediaType: "show",
        defaultSort: "rating",
        defaultHomeOrder: 12,
        defaultSortPrefix: "!12_"
    },
    {
        id: "apple-tv-plus-originals",
        title: "Apple TV+ Originals",
        type: "curated",
        category: "studio",
        description: "High-budget original sci-fi, drama, and comedy series produced by Apple.",
        icon: "Monitor",
        sourceType: "tmdb",
        sourceQuery: "network:2552", // Apple TV+
        mediaType: "show",
        defaultSort: "rating",
        defaultHomeOrder: 13,
        defaultSortPrefix: "!13_"
    },
    {
        id: "netflix-originals",
        title: "Netflix Originals",
        type: "curated",
        category: "studio",
        description: "Global blockbuster series and feature films produced by Netflix.",
        icon: "Film",
        sourceType: "tmdb",
        sourceQuery: "network:213", // Netflix
        mediaType: "both",
        defaultSort: "rating",
        defaultHomeOrder: 14,
        defaultSortPrefix: "!14_"
    },
    {
        id: "netflix-trending",
        title: "Netflix Trending & Top Charts",
        type: "dynamic",
        category: "dynamic",
        description: "The hottest movies and binge-worthy TV series trending on Netflix right now.",
        icon: "Film",
        sourceType: "tmdb",
        sourceQuery: "provider:8", // Netflix Watch Provider
        mediaType: "both",
        defaultSort: "rating",
        defaultHomeOrder: 15,
        defaultSortPrefix: "!15_Netflix"
    },
    {
        id: "netflix-kids-trending",
        title: "Netflix Kids & Family Trending",
        type: "dynamic",
        category: "dynamic",
        description: "Top-rated animated films, cartoons, and family adventures streaming on Netflix.",
        icon: "Film",
        sourceType: "tmdb",
        sourceQuery: "provider:8:kids", // Netflix Kids
        mediaType: "both",
        defaultSort: "rating",
        defaultHomeOrder: 16,
        defaultSortPrefix: "!16_NetflixKids"
    },
    {
        id: "disney-plus-originals",
        title: "Disney+ Originals",
        type: "curated",
        category: "studio",
        description: "Star Wars, Marvel, and Disney original streaming content.",
        icon: "Sparkles",
        sourceType: "tmdb",
        sourceQuery: "network:2739", // Disney+
        mediaType: "both",
        defaultSort: "release",
        defaultHomeOrder: 17,
        defaultSortPrefix: "!17_"
    },
    {
        id: "disney-trending",
        title: "Disney+ Trending & Top Charts",
        type: "dynamic",
        category: "dynamic",
        description: "Blockbuster franchise films, Star Wars, Marvel, and popular series trending on Disney+.",
        icon: "Sparkles",
        sourceType: "tmdb",
        sourceQuery: "provider:337", // Disney+ Watch Provider
        mediaType: "both",
        defaultSort: "release",
        defaultHomeOrder: 18,
        defaultSortPrefix: "!18_Disney"
    },
    {
        id: "disney-kids-trending",
        title: "Disney+ Kids & Family Trending",
        type: "dynamic",
        category: "dynamic",
        description: "Beloved Disney animated classics, Pixar wonders, and wholesome family favorites.",
        icon: "Sparkles",
        sourceType: "tmdb",
        sourceQuery: "provider:337:kids", // Disney+ Kids
        mediaType: "both",
        defaultSort: "release",
        defaultHomeOrder: 19,
        defaultSortPrefix: "!19_DisneyKids"
    },

    // 📼 DECADES
    {
        id: "eighties-classics",
        title: "80s Rewind (1980–1989)",
        type: "smart",
        category: "decade",
        description: "Radical 1980s cinema — sci-fi, teen comedy, synth-wave action, and iconic blockbusters.",
        icon: "Radio",
        sourceType: "plex_query",
        sourceQuery: "year>=1980&year<=1989",
        mediaType: "movie",
        defaultSort: "rating",
        defaultHomeOrder: 16,
        defaultSortPrefix: "!16_"
    },
    {
        id: "nineties-classics",
        title: "90s Golden Era (1990–1999)",
        type: "smart",
        category: "decade",
        description: "The golden decade of 90s cinema — gritty thrillers, indie gems, and landmark blockbusters.",
        icon: "Disc",
        sourceType: "plex_query",
        sourceQuery: "year>=1990&year<=1999",
        mediaType: "movie",
        defaultSort: "rating",
        defaultHomeOrder: 17,
        defaultSortPrefix: "!17_"
    },

    // 🎃 SEASONAL & HOLIDAYS (DYNAMIC TIMED SCHEDULES)
    {
        id: "halloween-horror-fest",
        title: "Halloween Horror & Spooky Nights",
        type: "schedule",
        category: "holiday",
        description: "Slasher classics, psychological terror, paranormal hauntings, and family Halloween favorites.",
        icon: "Ghost",
        sourceType: "tmdb",
        sourceQuery: "genre:27", // Horror
        mediaType: "movie",
        defaultSort: "rating",
        isSeasonal: true,
        scheduleStartMonth: 10, // Oct
        scheduleStartDay: 1,
        scheduleEndMonth: 11,   // Nov
        scheduleEndDay: 3,
        seasonalAction: "promote_hide",
        defaultHomeOrder: 2,
        defaultSortPrefix: "!02_Seasonal"
    },
    {
        id: "christmas-holiday-cheer",
        title: "Holiday Cheer & Christmas Classics",
        type: "schedule",
        category: "holiday",
        description: "Warm holiday favorites, timeless Christmas classics, and festive comedies.",
        icon: "Gift",
        sourceType: "tmdb",
        sourceQuery: "keyword:christmas",
        mediaType: "movie",
        defaultSort: "rating",
        isSeasonal: true,
        scheduleStartMonth: 11, // Nov
        scheduleStartDay: 20,
        scheduleEndMonth: 1,    // Jan
        scheduleEndDay: 6,
        seasonalAction: "promote_hide",
        defaultHomeOrder: 2,
        defaultSortPrefix: "!02_Seasonal"
    },
    {
        id: "valentine-romance-date-night",
        title: "Valentine's Romance & Date Night",
        type: "schedule",
        category: "holiday",
        description: "Heartwarming rom-coms, timeless love stories, and unforgettable date night cinema.",
        icon: "Heart",
        sourceType: "tmdb",
        sourceQuery: "genre:10749", // Romance
        mediaType: "movie",
        defaultSort: "rating",
        isSeasonal: true,
        scheduleStartMonth: 2,  // Feb
        scheduleStartDay: 1,
        scheduleEndMonth: 2,
        scheduleEndDay: 16,
        seasonalAction: "promote_hide",
        defaultHomeOrder: 2,
        defaultSortPrefix: "!02_Seasonal"
    },
    {
        id: "summer-blockbusters",
        title: "Summer Blockbusters & Action Thrills",
        type: "schedule",
        category: "holiday",
        description: "High-octane explosions, superhero epics, popcorn sci-fi, and summer cinema adventures.",
        icon: "Flame",
        sourceType: "tmdb",
        sourceQuery: "genre:28", // Action
        mediaType: "movie",
        defaultSort: "rating",
        isSeasonal: true,
        scheduleStartMonth: 5,  // May
        scheduleStartDay: 15,
        scheduleEndMonth: 8,    // Aug
        scheduleEndDay: 31,
        seasonalAction: "promote_hide",
        defaultHomeOrder: 2,
        defaultSortPrefix: "!02_Seasonal"
    },
    {
        id: "thanksgiving-family-feast",
        title: "Thanksgiving & Fall Family Cinema",
        type: "schedule",
        category: "holiday",
        description: "Cozy autumn favorites, family comedies, and heartwarming holiday gatherings.",
        icon: "Sparkles",
        sourceType: "tmdb",
        sourceQuery: "genre:10751", // Family
        mediaType: "movie",
        defaultSort: "rating",
        isSeasonal: true,
        scheduleStartMonth: 11, // Nov
        scheduleStartDay: 1,
        scheduleEndMonth: 11,
        scheduleEndDay: 30,
        seasonalAction: "promote_hide",
        defaultHomeOrder: 3,
        defaultSortPrefix: "!03_Seasonal"
    },

    // 💎 QUALITY & TECH FORMAT SHOWCASE
    {
        id: "4k-dolby-vision-showcase",
        title: "4K UHD • Dolby Vision Showcase",
        type: "smart",
        category: "quality",
        description: "Plex library items featuring reference-grade 4K resolution and Dolby Vision dynamic HDR.",
        icon: "Eye",
        sourceType: "plex_query",
        sourceQuery: "hdr:DV",
        mediaType: "movie",
        defaultSort: "title",
        defaultHomeOrder: 18,
        defaultSortPrefix: "!18_"
    },
    {
        id: "dolby-atmos-audio-experience",
        title: "Dolby Atmos Immersion",
        type: "smart",
        category: "quality",
        description: "Spatial audio showcase movies and concerts with native Dolby Atmos object-based audio.",
        icon: "Volume2",
        sourceType: "plex_query",
        sourceQuery: "audio:ATMOS",
        mediaType: "movie",
        defaultSort: "title",
        defaultHomeOrder: 19,
        defaultSortPrefix: "!19_"
    },

    // ⚡ DYNAMIC AGREGARR SCHEDULES & TOP HOME ORDER
    {
        id: "leaving-soon-prune-queue",
        title: "⚠️ Leaving Soon / Deleting Soon",
        type: "dynamic",
        category: "dynamic",
        description: "Items flagged for upcoming disk pruning due to storage limits or external cleanup webhooks.",
        icon: "AlertTriangle",
        sourceType: "plex_query",
        sourceQuery: "tag:leaving-soon",
        mediaType: "both",
        defaultSort: "custom",
        defaultHomeOrder: 0, // #1 TOP PRIORITY
        defaultSortPrefix: "!00_LeavingSoon"
    },
    {
        id: "trending-this-week",
        title: "Trending Worldwide This Week",
        type: "dynamic",
        category: "dynamic",
        description: "The hottest movies and series trending globally across TMDb & Trakt right now.",
        icon: "TrendingUp",
        sourceType: "trakt",
        sourceQuery: "trending",
        mediaType: "both",
        defaultSort: "rating",
        defaultHomeOrder: 1,
        defaultSortPrefix: "!01_Trending"
    },
    {
        id: "new-digital-releases",
        title: "New on Digital & Streaming",
        type: "dynamic",
        category: "dynamic",
        description: "Movies recently released from theaters to home digital streaming.",
        icon: "Sparkles",
        sourceType: "tmdb",
        sourceQuery: "digital_releases",
        mediaType: "movie",
        defaultSort: "release",
        defaultHomeOrder: 3,
        defaultSortPrefix: "!03_NewReleases"
    }
];

export interface DiscoveredBadgeItem {
    id: string;
    name: string;
    filename: string;
    path: string;
    size: number;
    downloadUrl: string;
    previewUrl: string;
    category: "resolution" | "hdr" | "codec" | "audio" | "edition" | "ratings" | "ribbon" | "studio" | "contentRating" | "custom";
    suggestedMatchRule: string;
    suggestedPosition: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    width: number;
    height: number;
    is2x?: boolean;
}

export interface BadgePresetPack {
    id: string;
    title: string;
    author: string;
    description: string;
    repoUrl: string;
    badgeCount?: number;
    category: "minimalist" | "codecs" | "editions" | "ratings" | "official" | "streaming";
    icon: string;
    previewUrls?: string[];
}

export const PRESET_BADGE_PACKS: BadgePresetPack[] = [
    {
        id: "kometa-resolutions",
        title: "Kometa Official Resolutions & HDR (4K UHD, 1080p, DV, HDR10+)",
        author: "Kometa Team",
        description: "The authentic official Kometa resolution overlay set. Features 4K UHD, 1080p FHD, 720p, 480p, Dolby Vision, HDR10, HDR10+, HLG, and combination dovetailed badges.",
        repoUrl: "https://github.com/Kometa-Team/Kometa/tree/master/defaults/overlays/images/resolution",
        category: "official",
        icon: "📺",
        previewUrls: [
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/resolution/4k.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/resolution/4kdv.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/resolution/1080p.png"
        ]
    },
    {
        id: "kometa-codecs",
        title: "Kometa Official Audio Codecs (Dolby Atmos, TrueHD, DTS:X)",
        author: "Kometa Team",
        description: "Official Kometa audio codec badges including Dolby Atmos, TrueHD, DTS:X, DTS-HD Master Audio, FLAC, Digital Plus, and multichannel audio.",
        repoUrl: "https://github.com/Kometa-Team/Kometa/tree/master/defaults/overlays/images/audio_codec/standard",
        category: "codecs",
        icon: "🔊",
        previewUrls: [
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/audio_codec/standard/dolby_atmos.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/audio_codec/standard/truehd_atmos.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/audio_codec/standard/dtsx.png"
        ]
    },
    {
        id: "kometa-editions",
        title: "Kometa Official Special Editions & Cuts (IMAX, Criterion)",
        author: "Kometa Team",
        description: "Official IMAX Enhanced, The Criterion Collection, Director's Cut, Extended Edition, Remastered, Theatrical, and Unrated overlays.",
        repoUrl: "https://github.com/Kometa-Team/Kometa/tree/master/defaults/overlays/images/edition",
        category: "editions",
        icon: "🎞️",
        previewUrls: [
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/edition/imax.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/edition/criterion.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/edition/directors.png"
        ]
    },
    {
        id: "kometa-streaming",
        title: "Kometa Official Streaming Services (Netflix, Disney+, Max, Apple TV+)",
        author: "Kometa Team",
        description: "Official full-color streaming network logos: Netflix, HBO Max / Max, Disney+, Apple TV+, Prime Video, Paramount+, Peacock, Hulu, Crunchyroll.",
        repoUrl: "https://github.com/Kometa-Team/Kometa/tree/master/defaults/overlays/images/streaming/color",
        category: "streaming",
        icon: "🎬",
        previewUrls: [
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/streaming/color/Netflix.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/streaming/color/Disney%2B.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/streaming/color/AppleTV%2B.png"
        ]
    },
    {
        id: "kometa-ribbons",
        title: "Kometa Official Award Ribbons (Oscars, Cannes, Golden Globes)",
        author: "Kometa Team",
        description: "Official film festival and accolade diagonal ribbons: Academy Awards / Oscars, Cannes, Golden Globes, BAFTA, Sundance, Emmy, and Rotten Tomatoes.",
        repoUrl: "https://github.com/Kometa-Team/Kometa/tree/master/defaults/overlays/images/ribbon/red",
        category: "official",
        icon: "🎗️",
        previewUrls: [
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/ribbon/red/oscars.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/ribbon/red/cannes.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/ribbon/red/golden.png"
        ]
    },
    {
        id: "kometa-ratings",
        title: "Kometa Official Ratings & Accolades (IMDb, RT, Metacritic)",
        author: "Kometa Team",
        description: "Official rating badges: IMDb Top 250, Rotten Tomatoes Certified Fresh & Audience Score, Metacritic Must-See, TMDb, and Trakt.",
        repoUrl: "https://github.com/Kometa-Team/Kometa/tree/master/defaults/overlays/images/rating",
        category: "ratings",
        icon: "🍅",
        previewUrls: [
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/rating/IMDbTop250.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/rating/CriticFresh.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/rating/MetacriticTop.png"
        ]
    },
    {
        id: "kometa-content-ratings",
        title: "Kometa Official Content & Age Ratings (MPAA, TV)",
        author: "Kometa Team",
        description: "Official MPAA & TV Parental Guidelines age rating badges (G, PG, PG-13, R, NC-17, TV-MA, TV-14, TV-PG).",
        repoUrl: "https://github.com/Kometa-Team/Kometa/tree/master/defaults/overlays/images/cr/us",
        category: "ratings",
        icon: "🏷️",
        previewUrls: [
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/cr/us/R.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/cr/us/PG-13.png",
            "https://raw.githubusercontent.com/Kometa-Team/Kometa/master/defaults/overlays/images/cr/us/PG.png"
        ]
    },
    {
        id: "jmxd-all",
        title: "jmxd Minimalist Overlays (Full Collection)",
        author: "jmxd",
        description: "The popular community minimalist dark overlay set for Kometa & Plex. Includes 4K, HDR, Dolby Vision, Atmos, TrueHD, DTS:X, and special edition cuts.",
        repoUrl: "https://github.com/jmxd/Kometa/tree/main/overlays/images",
        category: "minimalist",
        icon: "💎",
        previewUrls: [
            "https://raw.githubusercontent.com/jmxd/Kometa/main/overlays/images/media_info/resolution/Ultra-HD.png",
            "https://raw.githubusercontent.com/jmxd/Kometa/main/overlays/images/media_info/codec/DV-HDR-TrueHD-Atmos.png",
            "https://raw.githubusercontent.com/jmxd/Kometa/main/overlays/images/media_info/edition/IMAX.png"
        ]
    }
];

export interface BuiltinBadgeDefinition {
    id: string;
    name: string;
    category: "resolution" | "hdr" | "codec" | "audio" | "edition" | "ratings" | "ribbon" | "studio" | "contentRating" | "custom";
    position: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    matchRule: string;
    width: number;
    height: number;
    svgContent: string;
}

// Default Built-in High-DPI SVGs for Custom Badge Vault
export const DEFAULT_BUILTIN_BADGE_DEFINITIONS: BuiltinBadgeDefinition[] = [
    // 1. Resolution
    {
        id: "builtin_badge_4k_uhd",
        name: "4K UHD",
        category: "resolution",
        position: "top-right",
        matchRule: "4k",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4k" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4k)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="48" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="94" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="rgba(255,255,255,0.75)" text-anchor="middle">UHD</text></svg>`
    },
    {
        id: "builtin_badge_1080p_fhd",
        name: "1080p FHD",
        category: "resolution",
        position: "top-right",
        matchRule: "1080p",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g1080" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g1080)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="48" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="17" fill="#38bdf8" text-anchor="middle">1080p</text><text x="98" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="rgba(255,255,255,0.75)" text-anchor="middle">FHD</text></svg>`
    },
    {
        id: "builtin_badge_720p_hd",
        name: "720p HD",
        category: "resolution",
        position: "top-right",
        matchRule: "720p",
        width: 130,
        height: 46,
        svgContent: `<svg width="130" height="46" viewBox="0 0 130 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g720" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#94a3b8"/><stop offset="100%" stop-color="#64748b"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="126" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g720)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="122" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="45" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="17" fill="#cbd5e1" text-anchor="middle">720p</text><text x="90" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="rgba(255,255,255,0.7)" text-anchor="middle">HD</text></svg>`
    },
    {
        id: "builtin_badge_sd_480p",
        name: "SD / 480p",
        category: "resolution",
        position: "top-right",
        matchRule: "480p",
        width: 115,
        height: 46,
        svgContent: `<svg width="115" height="46" viewBox="0 0 115 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="111" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#64748b" stroke-width="1.5" filter="url(#sh)"/><line x1="8" y1="5" x2="107" y2="5" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round"/><text x="57" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#94a3b8" text-anchor="middle">SD • 480p</text></svg>`
    },

    // 2. HDR & Dynamic Range
    {
        id: "builtin_badge_dolby_vision",
        name: "Dolby Vision",
        category: "hdr",
        position: "top-right",
        matchRule: "dv",
        width: 160,
        height: 46,
        svgContent: `<svg width="160" height="46" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdv" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="40%" stop-color="#c084fc"/><stop offset="100%" stop-color="#818cf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="156" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdv)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="152" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><g transform="translate(14, 15)"><rect x="0" y="0" width="3.5" height="16" rx="1" fill="#c084fc"/><path d="M 4 0 A 8 8 0 0 1 4 16 Z" fill="#c084fc"/><path d="M 16 0 A 8 8 0 0 0 16 16 Z" fill="#818cf8"/><rect x="17" y="0" width="3.5" height="16" rx="1" fill="#818cf8"/></g><text x="96" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="#f8fafc" text-anchor="middle">DOLBY VISION</text></svg>`
    },
    {
        id: "builtin_badge_hdr10_plus",
        name: "HDR10+",
        category: "hdr",
        position: "top-right",
        matchRule: "hdr10+",
        width: 145,
        height: 46,
        svgContent: `<svg width="145" height="46" viewBox="0 0 145 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gplus" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="141" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gplus)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="137" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="72" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="15" fill="#38bdf8" text-anchor="middle">HDR10+</text></svg>`
    },
    {
        id: "builtin_badge_hdr10",
        name: "HDR10",
        category: "hdr",
        position: "top-right",
        matchRule: "hdr10",
        width: 135,
        height: 46,
        svgContent: `<svg width="135" height="46" viewBox="0 0 135 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ghdr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="131" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#ghdr)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="127" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="67" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="15" fill="#38bdf8" text-anchor="middle">HDR10</text></svg>`
    },

    // 3. Compounds (Dovetailed Resolution + HDR)
    {
        id: "builtin_badge_4k_dolby_vision",
        name: "4K UHD • Dolby Vision",
        category: "resolution",
        position: "top-right",
        matchRule: "4k + dv",
        width: 245,
        height: 46,
        svgContent: `<svg width="245" height="46" viewBox="0 0 245 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4kdv" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="40%" stop-color="#c084fc"/><stop offset="100%" stop-color="#818cf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.85"/></filter></defs><rect x="2" y="2" width="241" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4kdv)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="237" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="36" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle">UHD</text><line x1="90" y1="10" x2="90" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><circle cx="90" cy="23" r="2.5" fill="rgba(255,255,255,0.4)"/><g transform="translate(104, 15)"><rect x="0" y="0" width="4" height="16" rx="1.2" fill="#c084fc"/><path d="M 5 0 A 8 8 0 0 1 5 16 Z" fill="#c084fc"/><path d="M 18 0 A 8 8 0 0 0 18 16 Z" fill="#818cf8"/><rect x="19" y="0" width="4" height="16" rx="1.2" fill="#818cf8"/></g><text x="180" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12.5" fill="#f8fafc" text-anchor="middle">DOLBY VISION</text></svg>`
    },
    {
        id: "builtin_badge_4k_hdr10_plus",
        name: "4K UHD • HDR10+",
        category: "resolution",
        position: "top-right",
        matchRule: "4k + hdr10+",
        width: 230,
        height: 46,
        svgContent: `<svg width="230" height="46" viewBox="0 0 230 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4kplus" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fbbf24"/><stop offset="50%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#06b6d4"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.85"/></filter></defs><rect x="2" y="2" width="226" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4kplus)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="222" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="36" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle">UHD</text><line x1="90" y1="10" x2="90" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><circle cx="90" cy="23" r="2.5" fill="rgba(255,255,255,0.4)"/><text x="160" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="14" fill="#38bdf8" text-anchor="middle">HDR10+</text></svg>`
    },
    {
        id: "builtin_badge_4k_hdr10",
        name: "4K UHD • HDR10",
        category: "resolution",
        position: "top-right",
        matchRule: "4k + hdr10",
        width: 220,
        height: 46,
        svgContent: `<svg width="220" height="46" viewBox="0 0 220 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4khdr10" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.85"/></filter></defs><rect x="2" y="2" width="216" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4khdr10)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="212" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="36" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle">UHD</text><line x1="90" y1="10" x2="90" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><circle cx="90" cy="23" r="2.5" fill="rgba(255,255,255,0.4)"/><text x="154" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="14.5" fill="#38bdf8" text-anchor="middle">HDR10</text></svg>`
    },
    {
        id: "builtin_badge_4k_hdr",
        name: "4K UHD • HDR",
        category: "resolution",
        position: "top-right",
        matchRule: "4k + hdr",
        width: 210,
        height: 46,
        svgContent: `<svg width="210" height="46" viewBox="0 0 210 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="g4khdr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#facc15"/><stop offset="100%" stop-color="#38bdf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.85"/></filter></defs><rect x="2" y="2" width="206" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#g4khdr)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="202" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="36" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="18.5" fill="#facc15" text-anchor="middle">4K</text><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle">UHD</text><line x1="90" y1="10" x2="90" y2="36" stroke="rgba(255,255,255,0.25)" stroke-width="1.5"/><circle cx="90" cy="23" r="2.5" fill="rgba(255,255,255,0.4)"/><text x="150" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="14.5" fill="#38bdf8" text-anchor="middle">HDR</text></svg>`
    },

    // 4. Audio Codecs & Surround
    {
        id: "builtin_badge_dolby_atmos",
        name: "Dolby Atmos",
        category: "audio",
        position: "top-left",
        matchRule: "atmos",
        width: 160,
        height: 46,
        svgContent: `<svg width="160" height="46" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gatmos" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#818cf8"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="156" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gatmos)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="152" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><g transform="translate(14, 15)"><rect x="0" y="0" width="3.5" height="16" rx="1" fill="#38bdf8"/><path d="M 4 0 A 8 8 0 0 1 4 16 Z" fill="#38bdf8"/><path d="M 16 0 A 8 8 0 0 0 16 16 Z" fill="#818cf8"/><rect x="17" y="0" width="3.5" height="16" rx="1" fill="#818cf8"/></g><text x="96" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12.5" fill="#e0e7ff" text-anchor="middle">ATMOS</text></svg>`
    },
    {
        id: "builtin_badge_dolby_truehd",
        name: "Dolby TrueHD",
        category: "audio",
        position: "top-left",
        matchRule: "truehd",
        width: 155,
        height: 46,
        svgContent: `<svg width="155" height="46" viewBox="0 0 155 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gthd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="151" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gthd)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="147" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="77" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12.5" fill="#e0e7ff" text-anchor="middle">DOLBY TRUEHD</text></svg>`
    },
    {
        id: "builtin_badge_dts_x",
        name: "DTS:X",
        category: "audio",
        position: "top-left",
        matchRule: "dts:x",
        width: 135,
        height: 46,
        svgContent: `<svg width="135" height="46" viewBox="0 0 135 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdtsx" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fb923c"/><stop offset="100%" stop-color="#ea580c"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="131" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdtsx)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="127" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="67" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="14" fill="#fed7aa" text-anchor="middle">DTS:X</text></svg>`
    },
    {
        id: "builtin_badge_dts_hd_ma",
        name: "DTS-HD Master Audio",
        category: "audio",
        position: "top-left",
        matchRule: "dts-hd",
        width: 165,
        height: 46,
        svgContent: `<svg width="165" height="46" viewBox="0 0 165 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdtshd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f97316"/><stop offset="100%" stop-color="#c2410c"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="161" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdtshd)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="157" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="82" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="#ffedd5" text-anchor="middle">DTS-HD MA</text></svg>`
    },
    {
        id: "builtin_badge_flac_lossless",
        name: "FLAC Lossless",
        category: "audio",
        position: "top-left",
        matchRule: "flac",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gflac" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gflac)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12.5" fill="#a7f3d0" text-anchor="middle">FLAC LOSSLESS</text></svg>`
    },
    {
        id: "builtin_badge_7_1_surround",
        name: "7.1 Surround",
        category: "audio",
        position: "top-left",
        matchRule: "7.1",
        width: 110,
        height: 46,
        svgContent: `<svg width="110" height="46" viewBox="0 0 110 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="106" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#38bdf8" stroke-width="1.5" filter="url(#sh)"/><line x1="8" y1="5" x2="102" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="55" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#bae6fd" text-anchor="middle">7.1 CH</text></svg>`
    },
    {
        id: "builtin_badge_5_1_surround",
        name: "5.1 Surround",
        category: "audio",
        position: "top-left",
        matchRule: "5.1",
        width: 110,
        height: 46,
        svgContent: `<svg width="110" height="46" viewBox="0 0 110 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="106" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#38bdf8" stroke-width="1.5" filter="url(#sh)"/><line x1="8" y1="5" x2="102" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="55" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#bae6fd" text-anchor="middle">5.1 CH</text></svg>`
    },

    // 5. Video Codecs
    {
        id: "builtin_badge_hevc",
        name: "HEVC / H.265",
        category: "codec",
        position: "top-right",
        matchRule: "hevc",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ghevc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#818cf8"/><stop offset="100%" stop-color="#6366f1"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#ghevc)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#c7d2fe" text-anchor="middle">HEVC • 10b</text></svg>`
    },
    {
        id: "builtin_badge_av1",
        name: "AV1 Next-Gen",
        category: "codec",
        position: "top-right",
        matchRule: "av1",
        width: 130,
        height: 46,
        svgContent: `<svg width="130" height="46" viewBox="0 0 130 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gav1" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="126" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gav1)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="122" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="65" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#a7f3d0" text-anchor="middle">AV1 CODEC</text></svg>`
    },
    {
        id: "builtin_badge_avc_h264",
        name: "AVC / H.264",
        category: "codec",
        position: "top-right",
        matchRule: "avc",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#64748b" stroke-width="1.5" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.3)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#cbd5e1" text-anchor="middle">AVC • H.264</text></svg>`
    },

    // 6. Editions & Cuts
    {
        id: "builtin_badge_imax_enhanced",
        name: "IMAX Enhanced",
        category: "edition",
        position: "top-left",
        matchRule: "imax",
        width: 165,
        height: 46,
        svgContent: `<svg width="165" height="46" viewBox="0 0 165 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gimax" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="161" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gimax)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="157" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="82" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12.5" fill="#fdf4ff" text-anchor="middle">IMAX ENHANCED</text></svg>`
    },
    {
        id: "builtin_badge_criterion",
        name: "The Criterion Collection",
        category: "edition",
        position: "top-left",
        matchRule: "criterion",
        width: 175,
        height: 46,
        svgContent: `<svg width="175" height="46" viewBox="0 0 175 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gcrit" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#d97706"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="171" height="42" rx="8" fill="rgba(20, 15, 5, 0.95)" stroke="url(#gcrit)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="167" y2="5" stroke="rgba(254,240,138,0.5)" stroke-width="1.2" stroke-linecap="round"/><text x="87" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12.5" fill="#facc15" text-anchor="middle">CRITERION</text></svg>`
    },
    {
        id: "builtin_badge_remux",
        name: "Remux Lossless",
        category: "edition",
        position: "top-left",
        matchRule: "remux",
        width: 160,
        height: 46,
        svgContent: `<svg width="160" height="46" viewBox="0 0 160 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gremux" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#34d399"/><stop offset="100%" stop-color="#059669"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="156" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gremux)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="152" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="80" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="#d1fae5" text-anchor="middle">REMUX • LOSSLESS</text></svg>`
    },
    {
        id: "builtin_badge_directors_cut",
        name: "Director's Cut",
        category: "edition",
        position: "top-left",
        matchRule: "directors_cut",
        width: 165,
        height: 46,
        svgContent: `<svg width="165" height="46" viewBox="0 0 165 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f472b6"/><stop offset="100%" stop-color="#db2777"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="161" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdc)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="157" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="82" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="#fdf2f8" text-anchor="middle">DIRECTOR'S CUT</text></svg>`
    },

    // 7. Studios & Networks
    {
        id: "builtin_badge_netflix",
        name: "Netflix",
        category: "studio",
        position: "bottom-left",
        matchRule: "netflix",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#ef4444" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle">NETFLIX</text></svg>`
    },
    {
        id: "builtin_badge_disney",
        name: "Disney+",
        category: "studio",
        position: "bottom-left",
        matchRule: "disney",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gdisney" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#0284c7"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gdisney)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle">DISNEY+</text></svg>`
    },
    {
        id: "builtin_badge_hbo_max",
        name: "HBO Max",
        category: "studio",
        position: "bottom-left",
        matchRule: "hbo",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ghbo" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#c084fc"/><stop offset="100%" stop-color="#9333ea"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#ghbo)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle">HBO MAX</text></svg>`
    },
    {
        id: "builtin_badge_apple_tv",
        name: "Apple TV+",
        category: "studio",
        position: "bottom-left",
        matchRule: "apple_tv",
        width: 140,
        height: 46,
        svgContent: `<svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="136" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#e2e8f0" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="70" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#ffffff" text-anchor="middle">APPLE TV+</text></svg>`
    },
    {
        id: "builtin_badge_prime_video",
        name: "Prime Video",
        category: "studio",
        position: "bottom-left",
        matchRule: "amazon",
        width: 145,
        height: 46,
        svgContent: `<svg width="145" height="46" viewBox="0 0 145 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="141" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#00a8e1" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="137" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="72" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12.5" fill="#38bdf8" text-anchor="middle">PRIME VIDEO</text></svg>`
    },
    {
        id: "builtin_badge_a24",
        name: "A24",
        category: "studio",
        position: "bottom-left",
        matchRule: "a24",
        width: 110,
        height: 46,
        svgContent: `<svg width="110" height="46" viewBox="0 0 110 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="106" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#f59e0b" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="102" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="55" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="14" fill="#fde68a" text-anchor="middle">A24</text></svg>`
    },
    {
        id: "builtin_badge_marvel",
        name: "Marvel Studios",
        category: "studio",
        position: "bottom-left",
        matchRule: "marvel",
        width: 145,
        height: 46,
        svgContent: `<svg width="145" height="46" viewBox="0 0 145 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="141" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#dc2626" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="137" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="72" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13" fill="#fecaca" text-anchor="middle">MARVEL</text></svg>`
    },

    // 8. Ratings & Accolades
    {
        id: "builtin_badge_certified_fresh",
        name: "Certified Fresh",
        category: "ratings",
        position: "bottom-left",
        matchRule: "rt_fresh",
        width: 155,
        height: 46,
        svgContent: `<svg width="155" height="46" viewBox="0 0 155 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gfresh" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#f43f5e"/><stop offset="100%" stop-color="#be123c"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="151" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gfresh)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="147" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><g transform="translate(14, 13)"><circle cx="8" cy="9" r="8" fill="#f93a1e"/><polygon points="5,3 8,5 11,3 9,1 7,1" fill="#15803d"/></g><text x="86" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="11.5" fill="#fda4af" text-anchor="middle">CERTIFIED FRESH</text></svg>`
    },
    {
        id: "builtin_badge_imdb_top250",
        name: "IMDb Top 250",
        category: "ratings",
        position: "bottom-left",
        matchRule: "imdb_top_250",
        width: 150,
        height: 46,
        svgContent: `<svg width="150" height="46" viewBox="0 0 150 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gtop" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="146" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gtop)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="142" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><rect x="12" y="11" width="30" height="22" rx="3.5" fill="#f5c518"/><text x="27" y="26" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="10" fill="#000" text-anchor="middle">IMDb</text><text x="92" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="#facc15" text-anchor="middle">TOP 250</text></svg>`
    },
    {
        id: "builtin_badge_metacritic_must_see",
        name: "Metacritic Must-See",
        category: "ratings",
        position: "bottom-left",
        matchRule: "metacritic_must_see",
        width: 155,
        height: 46,
        svgContent: `<svg width="155" height="46" viewBox="0 0 155 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="gmc" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#86efac"/><stop offset="100%" stop-color="#16a34a"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="151" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="url(#gmc)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="147" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><rect x="12" y="11" width="26" height="22" rx="3.5" fill="#66cc33"/><text x="25" y="26" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="10" fill="#fff" text-anchor="middle">MC</text><text x="92" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="11.5" fill="#86efac" text-anchor="middle">MUST-SEE</text></svg>`
    },
    {
        id: "builtin_badge_oscar_winner",
        name: "Oscar Winner",
        category: "ratings",
        position: "bottom-left",
        matchRule: "oscar_winner",
        width: 150,
        height: 46,
        svgContent: `<svg width="150" height="46" viewBox="0 0 150 46" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="goscar" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#ca8a04"/></linearGradient><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="146" height="42" rx="8" fill="rgba(20, 15, 5, 0.95)" stroke="url(#goscar)" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="142" y2="5" stroke="rgba(254,240,138,0.5)" stroke-width="1.2" stroke-linecap="round"/><text x="24" y="28" font-family="Arial, Helvetica, sans-serif" font-weight="900" font-size="16" fill="#facc15" text-anchor="middle">★</text><text x="86" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="12" fill="#facc15" text-anchor="middle">BEST PICTURE</text></svg>`
    },

    // 9. Authentic Kometa Diagonal Ribbons & Banners
    {
        id: "builtin_badge_ribbon_oscars",
        name: "Academy Award Winner (Ribbon)",
        category: "ribbon",
        position: "top-right",
        matchRule: "oscars",
        width: 180,
        height: 180,
        svgContent: `<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ribbonGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fef08a"/><stop offset="40%" stop-color="#f59e0b"/><stop offset="100%" stop-color="#b45309"/></linearGradient><filter id="ribbonShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity="0.9"/></filter></defs><g filter="url(#ribbonShadow)"><polygon points="45,0 180,135 180,180 0,0" fill="url(#ribbonGoldGrad)"/><polygon points="45,0 180,135 180,180 0,0" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/><line x1="50" y1="0" x2="180" y2="130" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/><line x1="10" y1="0" x2="180" y2="170" stroke="rgba(0,0,0,0.4)" stroke-width="2"/><g transform="translate(100, 75) rotate(45)"><text x="0" y="0" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="11" fill="#000000" text-anchor="middle">OSCAR WINNER</text><text x="0" y="11" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="800" font-size="7.5" fill="#1c1917" text-anchor="middle">- ACADEMY AWARDS -</text></g></g></svg>`
    },
    {
        id: "builtin_badge_ribbon_top250",
        name: "IMDb Top 250 (Ribbon)",
        category: "ribbon",
        position: "top-right",
        matchRule: "imdb_top_250",
        width: 180,
        height: 180,
        svgContent: `<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ribbonTop250Grad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fde047"/><stop offset="50%" stop-color="#eab308"/><stop offset="100%" stop-color="#a16207"/></linearGradient><filter id="ribbonShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity="0.9"/></filter></defs><g filter="url(#ribbonShadow)"><polygon points="45,0 180,135 180,180 0,0" fill="url(#ribbonTop250Grad)"/><line x1="50" y1="0" x2="180" y2="130" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/><line x1="10" y1="0" x2="180" y2="170" stroke="rgba(0,0,0,0.4)" stroke-width="2"/><g transform="translate(100, 75) rotate(45)"><text x="0" y="0" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="11" fill="#000000" text-anchor="middle">IMDb TOP 250</text><text x="0" y="11" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="800" font-size="7.5" fill="#1c1917" text-anchor="middle">- ALL-TIME BEST -</text></g></g></svg>`
    },
    {
        id: "builtin_badge_ribbon_cannes",
        name: "Cannes Film Festival (Ribbon)",
        category: "ribbon",
        position: "top-right",
        matchRule: "cannes",
        width: 180,
        height: 180,
        svgContent: `<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ribbonCannesGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#fb7185"/><stop offset="50%" stop-color="#e11d48"/><stop offset="100%" stop-color="#881337"/></linearGradient><filter id="ribbonShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity="0.9"/></filter></defs><g filter="url(#ribbonShadow)"><polygon points="45,0 180,135 180,180 0,0" fill="url(#ribbonCannesGrad)"/><line x1="50" y1="0" x2="180" y2="130" stroke="rgba(255,255,255,0.9)" stroke-width="1.5"/><line x1="10" y1="0" x2="180" y2="170" stroke="rgba(0,0,0,0.4)" stroke-width="2"/><g transform="translate(100, 75) rotate(45)"><text x="0" y="0" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="10.5" fill="#ffffff" text-anchor="middle">PALME D'OR</text><text x="0" y="11" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="800" font-size="7.5" fill="#ffe4e6" text-anchor="middle">- CANNES WINNER -</text></g></g></svg>`
    },
    {
        id: "builtin_badge_ribbon_criterion",
        name: "Criterion Collection (Ribbon)",
        category: "ribbon",
        position: "top-right",
        matchRule: "criterion",
        width: 180,
        height: 180,
        svgContent: `<svg width="180" height="180" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ribbonCritGrad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1e293b"/><stop offset="50%" stop-color="#0f172a"/><stop offset="100%" stop-color="#020617"/></linearGradient><filter id="ribbonShadow" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#000" flood-opacity="0.9"/></filter></defs><g filter="url(#ribbonShadow)"><polygon points="45,0 180,135 180,180 0,0" fill="url(#ribbonCritGrad)"/><line x1="50" y1="0" x2="180" y2="130" stroke="#facc15" stroke-width="2"/><line x1="10" y1="0" x2="180" y2="170" stroke="#facc15" stroke-width="2"/><g transform="translate(100, 75) rotate(45)"><text x="0" y="0" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="10" fill="#facc15" text-anchor="middle">CRITERION</text><text x="0" y="11" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="800" font-size="7" fill="#ffffff" text-anchor="middle">- SPECIAL EDITION -</text></g></g></svg>`
    },
    {
        id: "builtin_badge_ribbon_leaving_soon",
        name: "Leaving Soon Warning Banner",
        category: "ribbon",
        position: "top-center",
        matchRule: "leaving_soon",
        width: 600,
        height: 56,
        svgContent: `<svg width="600" height="56" viewBox="0 0 600 56" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="leaveWarnGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#991b1b"/><stop offset="50%" stop-color="#dc2626"/><stop offset="100%" stop-color="#991b1b"/></linearGradient><filter id="bannerShadow" x="-5%" y="-10%" width="110%" height="130%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.85"/></filter></defs><rect x="0" y="0" width="600" height="56" fill="url(#leaveWarnGrad)" filter="url(#bannerShadow)"/><line x1="0" y1="2" x2="600" y2="2" stroke="rgba(255,255,255,0.5)" stroke-width="1.5"/><line x1="0" y1="54" x2="600" y2="54" stroke="#fca5a5" stroke-width="2"/><text x="300" y="36" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="20" fill="#ffffff" text-anchor="middle">LEAVING SOON</text></svg>`
    },
    {
        id: "builtin_badge_ribbon_digital_release",
        name: "Digital Release / Now Streaming Banner",
        category: "ribbon",
        position: "top-center",
        matchRule: "digital_release",
        width: 600,
        height: 52,
        svgContent: `<svg width="600" height="52" viewBox="0 0 600 52" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="streamGrad" x1="0%" y1="0%" x2="100%" y2="0%"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="50%" stop-color="#4f46e5"/><stop offset="100%" stop-color="#1e1b4b"/></linearGradient><filter id="bannerShadow" x="-5%" y="-10%" width="110%" height="130%"><feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.75"/></filter></defs><rect x="0" y="0" width="600" height="52" fill="url(#streamGrad)" filter="url(#bannerShadow)"/><line x1="0" y1="2" x2="600" y2="2" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/><line x1="0" y1="50" x2="600" y2="50" stroke="#a5b4fc" stroke-width="2"/><text x="300" y="33" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="16.5" fill="#e0e7ff" text-anchor="middle">NOW STREAMING ON DIGITAL</text></svg>`
    },

    // 10. Authentic MPAA & TV Content Ratings
    {
        id: "builtin_badge_cr_us_r",
        name: "Rated R",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "r",
        width: 100,
        height: 46,
        svgContent: `<svg width="100" height="46" viewBox="0 0 100 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="96" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#ef4444" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="92" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="50" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="18" fill="#f87171" text-anchor="middle">R</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_pg13",
        name: "Rated PG-13",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "pg-13",
        width: 120,
        height: 46,
        svgContent: `<svg width="120" height="46" viewBox="0 0 120 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="116" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#f59e0b" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="112" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="60" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="14" fill="#fbbf24" text-anchor="middle">PG-13</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_pg",
        name: "Rated PG",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "pg",
        width: 100,
        height: 46,
        svgContent: `<svg width="100" height="46" viewBox="0 0 100 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="96" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#38bdf8" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="92" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="50" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="15" fill="#7dd3fc" text-anchor="middle">PG</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_g",
        name: "Rated G",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "g",
        width: 100,
        height: 46,
        svgContent: `<svg width="100" height="46" viewBox="0 0 100 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="96" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#22c55e" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="92" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="50" y="29" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="18" fill="#4ade80" text-anchor="middle">G</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_nc17",
        name: "Rated NC-17",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "nc-17",
        width: 120,
        height: 46,
        svgContent: `<svg width="120" height="46" viewBox="0 0 120 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="116" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#b91c1c" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="112" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="60" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="14" fill="#f87171" text-anchor="middle">NC-17</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_tv_ma",
        name: "TV-MA",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "tv-ma",
        width: 120,
        height: 46,
        svgContent: `<svg width="120" height="46" viewBox="0 0 120 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="116" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#dc2626" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="112" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="60" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13.5" fill="#fca5a5" text-anchor="middle">TV-MA</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_tv_14",
        name: "TV-14",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "tv-14",
        width: 120,
        height: 46,
        svgContent: `<svg width="120" height="46" viewBox="0 0 120 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="116" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#ea580c" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="112" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="60" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13.5" fill="#fdba74" text-anchor="middle">TV-14</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_tv_pg",
        name: "TV-PG",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "tv-pg",
        width: 120,
        height: 46,
        svgContent: `<svg width="120" height="46" viewBox="0 0 120 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="116" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#0284c7" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="112" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="60" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13.5" fill="#7dd3fc" text-anchor="middle">TV-PG</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_tv_g",
        name: "TV-G",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "tv-g",
        width: 110,
        height: 46,
        svgContent: `<svg width="110" height="46" viewBox="0 0 110 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="106" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#16a34a" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="102" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="55" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13.5" fill="#86efac" text-anchor="middle">TV-G</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_tv_y7",
        name: "TV-Y7",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "tv-y7",
        width: 110,
        height: 46,
        svgContent: `<svg width="110" height="46" viewBox="0 0 110 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="106" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#0d9488" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="102" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="55" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13.5" fill="#5eead4" text-anchor="middle">TV-Y7</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_tv_y",
        name: "TV-Y",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "tv-y",
        width: 100,
        height: 46,
        svgContent: `<svg width="100" height="46" viewBox="0 0 100 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="96" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#0891b2" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="92" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="50" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="13.5" fill="#67e8f9" text-anchor="middle">TV-Y</text></svg>`
    },
    {
        id: "builtin_badge_cr_us_nr",
        name: "Not Rated (NR)",
        category: "contentRating",
        position: "bottom-left",
        matchRule: "nr",
        width: 100,
        height: 46,
        svgContent: `<svg width="100" height="46" viewBox="0 0 100 46" xmlns="http://www.w3.org/2000/svg"><defs><filter id="sh" x="-15%" y="-15%" width="130%" height="130%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#000" flood-opacity="0.8"/></filter></defs><rect x="2" y="2" width="96" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="#64748b" stroke-width="1.8" filter="url(#sh)"/><line x1="8" y1="5" x2="92" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/><text x="50" y="28" font-family="Arial, Helvetica, 'DejaVu Sans', sans-serif" font-weight="900" font-size="14" fill="#cbd5e1" text-anchor="middle">NR</text></svg>`
    }
];
