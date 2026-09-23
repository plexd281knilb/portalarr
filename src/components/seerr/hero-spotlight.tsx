"use client";

import { useState } from "react";
import { TmdbMediaItem } from "@/lib/curation/tmdb";
import { MediaAvailabilityStatus } from "@/lib/seerr/availability";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Info, CheckCircle2, Clock, Download, Plus, Star, Sparkles } from "lucide-react";

interface HeroSpotlightProps {
    item: TmdbMediaItem;
    availability?: MediaAvailabilityStatus;
    onSelect: (item: TmdbMediaItem) => void;
    onRequest?: (item: TmdbMediaItem) => void;
    onPlayTrailer?: (item: TmdbMediaItem) => void;
}

export function HeroSpotlight({
    item,
    availability,
    onSelect,
    onRequest,
    onPlayTrailer
}: HeroSpotlightProps) {
    const [backdropError, setBackdropError] = useState(false);

    if (!item) return null;

    const releaseYear = item.releaseDate ? item.releaseDate.split("-")[0] : "";
    const isTv = item.mediaType === "tv";
    const rating = item.voteAverage ? item.voteAverage.toFixed(1) : null;
    const inLibrary = availability?.inLibrary;
    const isRequested = availability?.isRequested;

    return (
        <div className="relative w-full rounded-2xl sm:rounded-3xl overflow-hidden bg-[#101018] border border-border/50 shadow-2xl min-h-[360px] sm:min-h-[440px] md:min-h-[500px] flex items-end">
            {/* Backdrop Image */}
            {item.backdropPath && !backdropError ? (
                <img
                    src={item.backdropPath}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover object-center scale-100 sm:scale-105 filter brightness-75 transition-all duration-700"
                    onError={() => setBackdropError(true)}
                />
            ) : item.posterPath ? (
                <img
                    src={item.posterPath}
                    alt={item.title}
                    className="absolute inset-0 w-full h-full object-cover object-center filter blur-lg brightness-50"
                />
            ) : null}

            {/* Cinematic Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c12] via-[#0c0c12]/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-[#0c0c12] via-[#0c0c12]/80 to-transparent" />

            {/* Content Container */}
            <div className="relative z-10 p-5 sm:p-8 md:p-10 max-w-3xl space-y-3 sm:space-y-4">
                {/* Format Badges & Rating */}
                <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="text-xs uppercase font-extrabold px-2.5 py-0.5 rounded-full bg-primary/20 text-primary border-primary/40 backdrop-blur-md">
                        <Sparkles className="h-3 w-3 mr-1" />
                        Featured Spotlight
                    </Badge>
                    <Badge variant="outline" className={`text-xs uppercase font-bold px-2 py-0.5 rounded-full backdrop-blur-md ${
                        isTv ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                    }`}>
                        {isTv ? "TV Series" : "Feature Film"}
                    </Badge>
                    {rating && Number(rating) > 0 && (
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold backdrop-blur-md">
                            <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                            <span>{rating}</span>
                        </div>
                    )}
                    {item.certification && (
                        <span className="px-1.5 py-0.5 rounded bg-muted/60 border border-border/50 text-[10px] font-semibold text-muted-foreground uppercase backdrop-blur-md">
                            {item.certification}
                        </span>
                    )}
                    {releaseYear && (
                        <span className="text-xs font-semibold text-muted-foreground">{releaseYear}</span>
                    )}
                </div>

                {/* Title */}
                <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold text-white tracking-tight leading-tight line-clamp-2 drop-shadow-md">
                    {item.title}
                </h1>

                {/* Overview */}
                <p className="text-xs sm:text-sm md:text-base text-gray-300 line-clamp-3 leading-relaxed max-w-2xl drop-shadow">
                    {item.overview}
                </p>

                {/* Action Buttons */}
                <div className="flex flex-wrap items-center gap-2.5 pt-2">
                    {onPlayTrailer && (
                        <Button
                            size="lg"
                            className="h-10 sm:h-11 px-5 rounded-xl font-semibold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 transition-all active:scale-95 flex items-center gap-2"
                            onClick={() => onPlayTrailer(item)}
                        >
                            <Play className="h-4 w-4 fill-current" />
                            <span>Play Trailer</span>
                        </Button>
                    )}

                    {!inLibrary && !isRequested && onRequest && (
                        <Button
                            size="lg"
                            className="h-10 sm:h-11 px-5 rounded-xl font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center gap-2"
                            onClick={() => onRequest(item)}
                        >
                            <Plus className="h-4 w-4" />
                            <span>Request Content</span>
                        </Button>
                    )}

                    {inLibrary && (
                        <Button
                            size="lg"
                            variant="secondary"
                            className="h-10 sm:h-11 px-5 rounded-xl font-semibold bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30 transition-all flex items-center gap-2 cursor-default"
                        >
                            <CheckCircle2 className="h-4 w-4" />
                            <span>Available in Library</span>
                        </Button>
                    )}

                    {isRequested && !inLibrary && (
                        <Button
                            size="lg"
                            variant="secondary"
                            className="h-10 sm:h-11 px-5 rounded-xl font-semibold bg-blue-600/20 text-blue-300 border border-blue-500/40 hover:bg-blue-600/30 transition-all flex items-center gap-2 cursor-default"
                        >
                            <Clock className="h-4 w-4" />
                            <span>Requested</span>
                        </Button>
                    )}

                    <Button
                        size="lg"
                        variant="outline"
                        className="h-10 sm:h-11 px-5 rounded-xl font-semibold bg-white/10 hover:bg-white/20 text-white border-white/20 backdrop-blur-md transition-all active:scale-95 flex items-center gap-2"
                        onClick={() => onSelect(item)}
                    >
                        <Info className="h-4 w-4" />
                        <span>More Info</span>
                    </Button>
                </div>
            </div>
        </div>
    );
}
