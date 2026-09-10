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
        defaultHomeOrder: 15,
        defaultSortPrefix: "!15_"
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
