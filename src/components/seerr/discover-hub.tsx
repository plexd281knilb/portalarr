"use client";

import { useState, useEffect } from "react";
import { 
    getDiscoverHomeAction, 
    getDiscoverMediaAction, 
    searchMediaAction,
    submitMediaRequestAction 
} from "@/app/seerr-actions";
import { TmdbMediaItem } from "@/lib/curation/tmdb";
import { MediaAvailabilityStatus } from "@/lib/seerr/availability";
import { HeroSpotlight } from "@/components/seerr/hero-spotlight";
import { MediaCarousel } from "@/components/seerr/media-carousel";
import { MediaCard } from "@/components/seerr/media-card";
import { MediaDetailModal } from "@/components/seerr/media-detail-modal";
import { TrailerModal } from "@/components/seerr/trailer-modal";
import { RequestManager } from "@/components/seerr/request-manager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
    Compass, 
    Film, 
    Tv, 
    Sparkles, 
    Search, 
    Inbox, 
    Layers, 
    Flame, 
    Calendar, 
    Star, 
    Play, 
    TrendingUp,
    CheckCircle2,
    Clock,
    Download,
    Smile,
    ShieldCheck,
    Clapperboard
} from "lucide-react";

interface DiscoverHubProps {
    isAdmin: boolean;
    initialTab?: "discover" | "movies" | "tv" | "requests";
}

export function DiscoverHub({ isAdmin, initialTab = "discover" }: DiscoverHubProps) {
    // Section Mode: Main (General/Adult) vs Kids (Family/Child-Friendly)
    const [section, setSection] = useState<"main" | "kids">("main");
    const [activeTab, setActiveTab] = useState<"discover" | "movies" | "tv" | "requests">(initialTab);
    const [loading, setLoading] = useState(true);
    
    // Home data
    const [heroItem, setHeroItem] = useState<TmdbMediaItem | null>(null);
    const [sections, setSections] = useState<any[]>([]);
    const [availabilityMap, setAvailabilityMap] = useState<Record<number, MediaAvailabilityStatus>>({});

    // Grid data (for Movies / TV tab)
    const [gridItems, setGridItems] = useState<TmdbMediaItem[]>([]);
    const [gridCategory, setGridCategory] = useState<"trending" | "popular" | "upcoming" | "top_rated">("popular");
    const [gridPage, setGridPage] = useState(1);
    const [loadingGrid, setLoadingGrid] = useState(false);

    // Search state
    const [searchQuery, setSearchQuery] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const [searchResults, setSearchResults] = useState<TmdbMediaItem[]>([]);
    const [searchAvailabilityMap, setSearchAvailabilityMap] = useState<Record<number, MediaAvailabilityStatus>>({});

    // Selected item for Detail Modal
    const [selectedMedia, setSelectedMedia] = useState<{ id: number; type: "movie" | "tv"; certification?: string } | null>(null);

    // Selected trailer for Trailer Modal
    const [trailerMedia, setTrailerMedia] = useState<{ title: string; videos: any[] } | null>(null);

    useEffect(() => {
        if (activeTab === "discover") {
            loadHomeData(section);
        } else if (activeTab === "movies" || activeTab === "tv") {
            loadGridData(activeTab === "movies" ? "movie" : "tv", gridCategory, 1, section === "kids");
        }
    }, [activeTab, section]);

    const loadHomeData = async (targetSection: "main" | "kids") => {
        setLoading(true);
        try {
            const res = await getDiscoverHomeAction(targetSection);
            if (res.success) {
                setHeroItem(res.heroItem || null);
                setSections(res.sections || []);
                setAvailabilityMap(res.availabilityMap || {});
            }
        } catch (e) {} finally {
            setLoading(false);
        }
    };

    const loadGridData = async (type: "movie" | "tv", category: "trending" | "popular" | "upcoming" | "top_rated", page: number, isKidsMode: boolean) => {
        setLoadingGrid(true);
        try {
            const res = await getDiscoverMediaAction(category, type, page, isKidsMode);
            if (res.success && res.items) {
                setGridItems(res.items);
                setGridPage(page);
                setAvailabilityMap(prev => ({ ...prev, ...(res.availabilityMap || {}) }));
            }
        } catch (e) {} finally {
            setLoadingGrid(false);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const res = await searchMediaAction(query.trim(), 1, section === "kids");
            if (res.success && res.items) {
                setSearchResults(res.items);
                setSearchAvailabilityMap(res.availabilityMap || {});
            }
        } catch (e) {} finally {
            setIsSearching(false);
        }
    };

    const handleQuickRequest = async (item: TmdbMediaItem) => {
        try {
            const res = await submitMediaRequestAction({
                mediaType: item.mediaType,
                tmdbId: item.id,
                title: item.title,
                releaseYear: item.releaseDate ? item.releaseDate.split("-")[0] : undefined,
                posterPath: item.posterPath || undefined,
                backdropPath: item.backdropPath || undefined,
                overview: item.overview,
                isKids: section === "kids",
                contentRating: item.certification,
                seasons: item.mediaType === "tv" ? "all" : undefined
            });
            if (res.success) {
                // Update availability in local map
                setAvailabilityMap(prev => ({
                    ...prev,
                    [item.id]: {
                        inLibrary: false,
                        isRequested: true,
                        requestStatus: res.request?.status || "APPROVED"
                    }
                }));
            }
        } catch (e) {}
    };

    const handlePlayTrailerFromHero = (item: TmdbMediaItem) => {
        setSelectedMedia({ id: item.id, type: item.mediaType, certification: item.certification });
    };

    return (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            {/* Top Section Switcher: Main Discovery vs Kids & Family */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-2 sm:p-2.5 rounded-2xl bg-[#0e0e14] border border-border/60 shadow-lg">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => { setSection("main"); setSearchQuery(""); }}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 ${
                            section === "main"
                                ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 border border-blue-400/30 scale-[1.02]"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                    >
                        <Clapperboard className="h-4 w-4" />
                        <span>🎬 Main Discovery</span>
                    </button>

                    <button
                        onClick={() => { setSection("kids"); setSearchQuery(""); }}
                        className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all duration-300 ${
                            section === "kids"
                                ? "bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white shadow-lg shadow-amber-500/25 border border-amber-300/40 scale-[1.02]"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                        }`}
                    >
                        <Smile className="h-4 w-4" />
                        <span>🧸 Kids & Family</span>
                        <Badge variant="outline" className="text-[10px] font-extrabold px-1.5 py-0 rounded bg-white/20 text-white border-white/40 hidden sm:inline-flex">
                            PG Safe
                        </Badge>
                    </button>
                </div>

                {/* Section Mode Indicator Badge */}
                <div className="hidden md:flex items-center gap-2 pr-3">
                    {section === "kids" ? (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/30 px-3 py-1 rounded-full">
                            <ShieldCheck className="h-3.5 w-3.5 text-amber-400" />
                            <span>Kids Mode: PG & Below Auto-Approved • R/TV-MA Filtered</span>
                        </div>
                    ) : (
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-300 bg-blue-500/15 border border-blue-500/30 px-3 py-1 rounded-full">
                            <Sparkles className="h-3.5 w-3.5 text-blue-400" />
                            <span>Standard Library & Adult Discovery</span>
                        </div>
                    )}
                </div>
            </div>

            {/* Kids Mode Friendly Notice Banner */}
            {section === "kids" && (
                <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-rose-500/15 border border-amber-500/30 flex items-center justify-between gap-3 text-amber-200 shadow-sm animate-in fade-in slide-in-from-top-2 duration-300">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0 shadow-sm">
                            <Smile className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="text-xs sm:text-sm font-bold text-amber-100 flex items-center gap-1.5">
                                Kids & Family Hub Active
                                <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 bg-amber-400/20 text-amber-200 border-amber-400/40">
                                    Child Friendly
                                </Badge>
                            </h4>
                            <p className="text-[11px] sm:text-xs text-amber-200/80">
                                All titles are filtered for family safety. PG and below auto-approve; PG-13 requires approval; mature ratings (R, TV-MA, TV-14) are hidden.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Navigation & Search Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-[#101016] border border-border/50 backdrop-blur-md shadow-sm">
                {/* Navigation Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                        size="sm"
                        variant={activeTab === "discover" ? "default" : "ghost"}
                        className={`h-9 px-3.5 text-xs font-bold rounded-xl transition-all ${
                            activeTab === "discover" 
                                ? (section === "kids" ? "bg-amber-600 hover:bg-amber-500 text-white shadow-md shadow-amber-600/20" : "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20")
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                        onClick={() => { setActiveTab("discover"); setSearchQuery(""); }}
                    >
                        <Compass className="h-4 w-4 mr-1.5" />
                        Discover
                    </Button>

                    <Button
                        size="sm"
                        variant={activeTab === "movies" ? "default" : "ghost"}
                        className={`h-9 px-3.5 text-xs font-bold rounded-xl transition-all ${
                            activeTab === "movies" 
                                ? "bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/20" 
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                        onClick={() => { setActiveTab("movies"); setSearchQuery(""); }}
                    >
                        <Film className="h-4 w-4 mr-1.5 text-blue-400" />
                        {section === "kids" ? "Family Movies" : "Movies"}
                    </Button>

                    <Button
                        size="sm"
                        variant={activeTab === "tv" ? "default" : "ghost"}
                        className={`h-9 px-3.5 text-xs font-bold rounded-xl transition-all ${
                            activeTab === "tv" 
                                ? "bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-600/20" 
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                        onClick={() => { setActiveTab("tv"); setSearchQuery(""); }}
                    >
                        <Tv className="h-4 w-4 mr-1.5 text-cyan-400" />
                        {section === "kids" ? "Kids Shows" : "TV Shows"}
                    </Button>

                    <Button
                        size="sm"
                        variant={activeTab === "requests" ? "default" : "ghost"}
                        className={`h-9 px-3.5 text-xs font-bold rounded-xl transition-all ${
                            activeTab === "requests" 
                                ? "bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20" 
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                        }`}
                        onClick={() => { setActiveTab("requests"); setSearchQuery(""); }}
                    >
                        <Inbox className="h-4 w-4 mr-1.5 text-purple-400" />
                        Requests
                    </Button>
                </div>

                {/* Instant Search Bar */}
                <div className="relative flex-1 md:max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder={section === "kids" ? "Search kid-safe movies, series, animation..." : "Search movies, TV shows, actors..."}
                        value={searchQuery}
                        onChange={(e) => handleSearch(e.target.value)}
                        className="h-9 pl-9 pr-4 text-xs bg-background/60 rounded-xl border-border/60 focus:ring-1 focus:ring-primary shadow-sm"
                    />
                    {isSearching && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                    )}
                </div>
            </div>

            {/* SEARCH RESULTS VIEW (When query entered) */}
            {searchQuery.trim().length > 0 ? (
                <div className="space-y-4">
                    <div className="flex items-center justify-between px-1">
                        <h2 className="text-base sm:text-lg font-bold text-foreground">
                            {section === "kids" ? "🧸 Kids Search Results" : "Search Results"} for "{searchQuery}" ({searchResults.length})
                        </h2>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSearchQuery("")}
                            className="h-8 text-xs text-muted-foreground hover:text-foreground"
                        >
                            Clear Search
                        </Button>
                    </div>

                    {isSearching ? (
                        <div className="p-16 text-center space-y-3">
                            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                            <p className="text-xs text-muted-foreground animate-pulse">Searching {section === "kids" ? "kid-safe catalog" : "media catalog"}...</p>
                        </div>
                    ) : searchResults.length === 0 ? (
                        <div className="p-12 text-center rounded-2xl bg-[#121218]/60 border border-dashed border-border/50 space-y-2">
                            <Search className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                            <h3 className="text-sm font-bold text-foreground">No Titles Found</h3>
                            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                {section === "kids" 
                                    ? `We couldn't find any family-safe movies or TV series matching "${searchQuery}". Mature titles are excluded.`
                                    : `We couldn't find any movies or TV series matching "${searchQuery}". Try a different spelling or keyword.`}
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                            {searchResults.map((item) => (
                                <MediaCard
                                    key={`${item.mediaType}-${item.id}`}
                                    item={item}
                                    availability={searchAvailabilityMap[item.id]}
                                    onSelect={(selected) => setSelectedMedia({ id: selected.id, type: selected.mediaType, certification: selected.certification })}
                                    onRequest={handleQuickRequest}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : activeTab === "discover" ? (
                /* DISCOVER TAB: Hero + Curated Carousels */
                <div className="space-y-6 sm:space-y-8">
                    {heroItem && (
                        <HeroSpotlight
                            item={heroItem}
                            availability={availabilityMap[heroItem.id]}
                            onSelect={(selected) => setSelectedMedia({ id: selected.id, type: selected.mediaType, certification: selected.certification })}
                            onRequest={handleQuickRequest}
                            onPlayTrailer={handlePlayTrailerFromHero}
                        />
                    )}

                    {loading ? (
                        <div className="p-16 text-center space-y-3">
                            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                            <p className="text-xs text-muted-foreground animate-pulse">Loading {section === "kids" ? "kids & family" : "discovery"} categories...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 sm:space-y-6">
                            {sections.map((sec) => (
                                <MediaCarousel
                                    key={sec.id}
                                    title={sec.title}
                                    iconName={sec.icon}
                                    items={sec.items}
                                    availabilityMap={availabilityMap}
                                    onSelect={(selected) => setSelectedMedia({ id: selected.id, type: selected.mediaType, certification: selected.certification })}
                                    onRequest={handleQuickRequest}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : activeTab === "movies" || activeTab === "tv" ? (
                /* MOVIES OR TV TAB: Category Grid */
                <div className="space-y-4">
                    {/* Category Filter Pills */}
                    <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#121218] border border-border/40 w-fit">
                        <Button
                            size="sm"
                            variant={gridCategory === "popular" ? "secondary" : "ghost"}
                            className="h-7 text-xs font-semibold rounded-lg"
                            onClick={() => { setGridCategory("popular"); loadGridData(activeTab === "movies" ? "movie" : "tv", "popular", 1, section === "kids"); }}
                        >
                            Popular
                        </Button>
                        <Button
                            size="sm"
                            variant={gridCategory === "trending" ? "secondary" : "ghost"}
                            className="h-7 text-xs font-semibold rounded-lg"
                            onClick={() => { setGridCategory("trending"); loadGridData(activeTab === "movies" ? "movie" : "tv", "trending", 1, section === "kids"); }}
                        >
                            Trending
                        </Button>
                        <Button
                            size="sm"
                            variant={gridCategory === "upcoming" ? "secondary" : "ghost"}
                            className="h-7 text-xs font-semibold rounded-lg"
                            onClick={() => { setGridCategory("upcoming"); loadGridData(activeTab === "movies" ? "movie" : "tv", "upcoming", 1, section === "kids"); }}
                        >
                            {section === "kids" ? "Disney & Pixar" : "Upcoming"}
                        </Button>
                        <Button
                            size="sm"
                            variant={gridCategory === "top_rated" ? "secondary" : "ghost"}
                            className="h-7 text-xs font-semibold rounded-lg"
                            onClick={() => { setGridCategory("top_rated"); loadGridData(activeTab === "movies" ? "movie" : "tv", "top_rated", 1, section === "kids"); }}
                        >
                            Top Rated
                        </Button>
                    </div>

                    {loadingGrid ? (
                        <div className="p-16 text-center space-y-3">
                            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                            <p className="text-xs text-muted-foreground animate-pulse">Loading {activeTab === "movies" ? (section === "kids" ? "family movies" : "movies") : (section === "kids" ? "kids shows" : "TV series")}...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                            {gridItems.map((item) => (
                                <MediaCard
                                    key={`${item.mediaType}-${item.id}`}
                                    item={item}
                                    availability={availabilityMap[item.id]}
                                    onSelect={(selected) => setSelectedMedia({ id: selected.id, type: selected.mediaType, certification: selected.certification })}
                                    onRequest={handleQuickRequest}
                                />
                            ))}
                        </div>
                    )}
                </div>
            ) : (
                /* REQUESTS TAB */
                <RequestManager
                    isAdmin={isAdmin}
                    onSelectMedia={(tmdbId, mediaType) => setSelectedMedia({ id: tmdbId, type: mediaType })}
                />
            )}

            {/* Media Detail Modal */}
            {selectedMedia && (
                <MediaDetailModal
                    isOpen={Boolean(selectedMedia)}
                    onClose={() => setSelectedMedia(null)}
                    tmdbId={selectedMedia.id}
                    mediaType={selectedMedia.type}
                    isKids={section === "kids"}
                    initialAvailability={availabilityMap[selectedMedia.id]}
                    onRequestSubmitted={() => {
                        if (activeTab === "discover") loadHomeData(section);
                    }}
                />
            )}
        </div>
    );
}
