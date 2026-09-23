"use client";

import { useRef } from "react";
import { TmdbMediaItem } from "@/lib/curation/tmdb";
import { MediaAvailabilityStatus } from "@/lib/seerr/availability";
import { MediaCard } from "@/components/seerr/media-card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Flame, TrendingUp, Calendar, Tv, Star, Film } from "lucide-react";

interface MediaCarouselProps {
    title: string;
    iconName?: string;
    items: TmdbMediaItem[];
    availabilityMap: Record<number, MediaAvailabilityStatus>;
    onSelect: (item: TmdbMediaItem) => void;
    onRequest?: (item: TmdbMediaItem) => void;
    onViewAll?: () => void;
}

export function MediaCarousel({
    title,
    iconName,
    items,
    availabilityMap,
    onSelect,
    onRequest,
    onViewAll
}: MediaCarouselProps) {
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    if (!items || items.length === 0) return null;

    const scroll = (direction: "left" | "right") => {
        if (!scrollContainerRef.current) return;
        const container = scrollContainerRef.current;
        const scrollAmount = container.clientWidth * 0.75;
        container.scrollBy({
            left: direction === "left" ? -scrollAmount : scrollAmount,
            behavior: "smooth"
        });
    };

    const getIcon = () => {
        switch (iconName) {
            case "Flame": return <Flame className="h-4 w-4 text-orange-400" />;
            case "TrendingUp": return <TrendingUp className="h-4 w-4 text-emerald-400" />;
            case "Calendar": return <Calendar className="h-4 w-4 text-blue-400" />;
            case "Tv": return <Tv className="h-4 w-4 text-cyan-400" />;
            case "Star": return <Star className="h-4 w-4 text-amber-400" />;
            default: return <Film className="h-4 w-4 text-purple-400" />;
        }
    };

    return (
        <section className="space-y-3 py-2">
            {/* Header */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-muted/40 border border-border/40 flex items-center justify-center">
                        {getIcon()}
                    </div>
                    <div>
                        <h2 className="text-base sm:text-lg font-bold text-foreground tracking-tight flex items-center gap-2">
                            {title}
                            <span className="text-xs font-medium text-muted-foreground">({items.length})</span>
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {onViewAll && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={onViewAll}
                            className="h-8 text-xs font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/40 rounded-lg px-2.5"
                        >
                            View All
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => scroll("left")}
                        className="h-8 w-8 rounded-lg border-border/50 bg-background/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => scroll("right")}
                        className="h-8 w-8 rounded-lg border-border/50 bg-background/60 hover:bg-muted/40 text-muted-foreground hover:text-foreground"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Carousel Container */}
            <div
                ref={scrollContainerRef}
                className="flex items-stretch gap-3 sm:gap-4 overflow-x-auto pb-3 pt-1 scrollbar-none scroll-smooth px-1"
                style={{ scrollSnapType: "x mandatory" }}
            >
                {items.map((item) => (
                    <div
                        key={`${item.mediaType}-${item.id}`}
                        className="w-[140px] sm:w-[170px] md:w-[190px] lg:w-[210px] shrink-0"
                        style={{ scrollSnapAlign: "start" }}
                    >
                        <MediaCard
                            item={item}
                            availability={availabilityMap[item.id]}
                            onSelect={onSelect}
                            onRequest={onRequest}
                        />
                    </div>
                ))}
            </div>
        </section>
    );
}
