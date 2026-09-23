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
    Download
} from "lucide-react";

interface DiscoverHubProps {
    isAdmin: boolean;
    initialTab?: "discover" | "movies" | "tv" | "requests";
}

export function DiscoverHub({ isAdmin, initialTab = "discover" }: DiscoverHubProps) {
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
    const [selectedMedia, setSelectedMedia] = useState<{ id: number; type: "movie" | "tv" } | null>(null);

    // Selected trailer for Trailer Modal
    const [trailerMedia, setTrailerMedia] = useState<{ title: string; videos: any[] } | null>(null);

    useEffect(() => {
        if (activeTab === "discover") {
            loadHomeData();
        } else if (activeTab === "movies" || activeTab === "tv") {
            loadGridData(activeTab === "movies" ? "movie" : "tv", gridCategory, 1);
        }
    }, [activeTab]);

    const loadHomeData = async () => {
        setLoading(true);
        try {
            const res = await getDiscoverHomeAction();
            if (res.success) {
                setHeroItem(res.heroItem || null);
                setSections(res.sections || []);
                setAvailabilityMap(res.availabilityMap || {});
            }
        } catch (e) {} finally {
            setLoading(false);
        }
    };

    const loadGridData = async (type: "movie" | "tv", category: "trending" | "popular" | "upcoming" | "top_rated", page: number) => {
        setLoadingGrid(true);
        try {
            const res = await getDiscoverMediaAction(category, type, page);
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
            const res = await searchMediaAction(query.trim(), 1);
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
        setSelectedMedia({ id: item.id, type: item.mediaType });
    };

    return (
        <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
            {/* Top Navigation & Search Bar */}
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4 p-3 sm:p-4 rounded-2xl bg-[#101016] border border-border/50 backdrop-blur-md shadow-sm">
                {/* Navigation Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                        size="sm"
                        variant={activeTab === "discover" ? "default" : "ghost"}
                        className={`h-9 px-3.5 text-xs font-bold rounded-xl transition-all ${
                            activeTab === "discover" 
                                ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20" 
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
                        Movies
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
                        TV Shows
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
                        placeholder="Search movies, TV shows, actors..."
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
                            Search Results for "{searchQuery}" ({searchResults.length})
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
                            <p className="text-xs text-muted-foreground animate-pulse">Searching media catalog...</p>
                        </div>
                    ) : searchResults.length === 0 ? (
                        <div className="p-12 text-center rounded-2xl bg-[#121218]/60 border border-dashed border-border/50 space-y-2">
                            <Search className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                            <h3 className="text-sm font-bold text-foreground">No Titles Found</h3>
                            <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                                We couldn't find any movies or TV series matching "{searchQuery}". Try a different spelling or keyword.
                            </p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                            {searchResults.map((item) => (
                                <MediaCard
                                    key={`${item.mediaType}-${item.id}`}
                                    item={item}
                                    availability={searchAvailabilityMap[item.id]}
                                    onSelect={(selected) => setSelectedMedia({ id: selected.id, type: selected.mediaType })}
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
                            onSelect={(selected) => setSelectedMedia({ id: selected.id, type: selected.mediaType })}
                            onRequest={handleQuickRequest}
                            onPlayTrailer={handlePlayTrailerFromHero}
                        />
                    )}

                    {loading ? (
                        <div className="p-16 text-center space-y-3">
                            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                            <p className="text-xs text-muted-foreground animate-pulse">Loading discovery categories...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 sm:space-y-6">
                            {sections.map((section) => (
                                <MediaCarousel
                                    key={section.id}
                                    title={section.title}
                                    iconName={section.icon}
                                    items={section.items}
                                    availabilityMap={availabilityMap}
                                    onSelect={(selected) => setSelectedMedia({ id: selected.id, type: selected.mediaType })}
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
                            onClick={() => { setGridCategory("popular"); loadGridData(activeTab === "movies" ? "movie" : "tv", "popular", 1); }}
                        >
                            Popular
                        </Button>
                        <Button
                            size="sm"
                            variant={gridCategory === "trending" ? "secondary" : "ghost"}
                            className="h-7 text-xs font-semibold rounded-lg"
                            onClick={() => { setGridCategory("trending"); loadGridData(activeTab === "movies" ? "movie" : "tv", "trending", 1); }}
                        >
                            Trending
                        </Button>
                        <Button
                            size="sm"
                            variant={gridCategory === "upcoming" ? "secondary" : "ghost"}
                            className="h-7 text-xs font-semibold rounded-lg"
                            onClick={() => { setGridCategory("upcoming"); loadGridData(activeTab === "movies" ? "movie" : "tv", "upcoming", 1); }}
                        >
                            Upcoming
                        </Button>
                        <Button
                            size="sm"
                            variant={gridCategory === "top_rated" ? "secondary" : "ghost"}
                            className="h-7 text-xs font-semibold rounded-lg"
                            onClick={() => { setGridCategory("top_rated"); loadGridData(activeTab === "movies" ? "movie" : "tv", "top_rated", 1); }}
                        >
                            Top Rated
                        </Button>
                    </div>

                    {loadingGrid ? (
                        <div className="p-16 text-center space-y-3">
                            <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                            <p className="text-xs text-muted-foreground animate-pulse">Loading {activeTab === "movies" ? "movies" : "TV series"}...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                            {gridItems.map((item) => (
                                <MediaCard
                                    key={`${item.mediaType}-${item.id}`}
                                    item={item}
                                    availability={availabilityMap[item.id]}
                                    onSelect={(selected) => setSelectedMedia({ id: selected.id, type: selected.mediaType })}
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
                    initialAvailability={availabilityMap[selectedMedia.id]}
                    onRequestSubmitted={() => {
                        if (activeTab === "discover") loadHomeData();
                    }}
                />
            )}
        </div>
    );
}
