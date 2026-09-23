"use client";

import { useState } from "react";
import Image from "next/image";
import { TmdbMediaItem } from "@/lib/curation/tmdb-types";
import { MediaAvailabilityStatus } from "@/lib/seerr/availability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Film, Tv, Star, CheckCircle2, Clock, Download, Plus, Info, AlertCircle } from "lucide-react";

interface MediaCardProps {
    item: TmdbMediaItem;
    availability?: MediaAvailabilityStatus;
    onSelect: (item: TmdbMediaItem) => void;
    onRequest?: (item: TmdbMediaItem) => void;
    compact?: boolean;
}

export function MediaCard({ item, availability, onSelect, onRequest, compact = false }: MediaCardProps) {
    const [imageError, setImageError] = useState(false);
    const releaseYear = item.releaseDate ? item.releaseDate.split("-")[0] : "";
    const isTv = item.mediaType === "tv";
    const rating = item.voteAverage ? item.voteAverage.toFixed(1) : null;

    const inLibrary = availability?.inLibrary;
    const isRequested = availability?.isRequested;
    const requestStatus = availability?.requestStatus;
    const downloadProgress = availability?.downloadProgress;
    const has4k = availability?.has4k;

    const renderAvailabilityBadge = () => {
        if (inLibrary) {
            return (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold backdrop-blur-md shadow-sm">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span>In Library</span>
                </div>
            );
        }
        if (isRequested) {
            if (requestStatus === "PROCESSING" || requestStatus === "DOWNLOADING") {
                return (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold backdrop-blur-md shadow-sm animate-pulse">
                        <Download className="h-3 w-3 shrink-0" />
                        <span>{downloadProgress ? `Downloading ${downloadProgress}%` : "Processing"}</span>
                    </div>
                );
            }
            if (requestStatus === "APPROVED") {
                return (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40 text-[10px] font-bold backdrop-blur-md shadow-sm">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>Approved</span>
                    </div>
                );
            }
            if (requestStatus === "PENDING") {
                return (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold backdrop-blur-md shadow-sm">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>Requested</span>
                    </div>
                );
            }
            if (requestStatus === "FAILED" || requestStatus === "DECLINED") {
                return (
                    <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px] font-bold backdrop-blur-md shadow-sm">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        <span>{requestStatus === "DECLINED" ? "Declined" : "Failed"}</span>
                    </div>
                );
            }
        }
        return null;
    };

    return (
        <div 
            onClick={() => onSelect(item)}
            className="group relative cursor-pointer flex flex-col rounded-xl overflow-hidden bg-[#14141c] border border-border/40 hover:border-primary/60 transition-all duration-300 hover:shadow-xl hover:shadow-primary/10 hover:-translate-y-1 select-none"
        >
            {/* 2:3 Vertical Poster Container */}
            <div className="relative aspect-[2/3] w-full bg-[#101018] overflow-hidden">
                {item.posterPath && !imageError ? (
                    <img
                        src={item.posterPath}
                        alt={item.title}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                        onError={() => setImageError(true)}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gradient-to-br from-muted/20 via-background to-muted/10 text-muted-foreground">
                        {isTv ? <Tv className="h-10 w-10 mb-2 opacity-40" /> : <Film className="h-10 w-10 mb-2 opacity-40" />}
                        <span className="text-xs font-semibold line-clamp-2">{item.title}</span>
                    </div>
                )}

                {/* Top Corner Badges Overlay */}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 z-10 pointer-events-none">
                    <Badge 
                        variant="outline" 
                        className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-md backdrop-blur-md border shadow-sm ${
                            isTv 
                                ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" 
                                : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                        }`}
                    >
                        {isTv ? "TV" : "Movie"}
                    </Badge>

                    <div className="flex items-center gap-1">
                        {has4k && (
                            <Badge variant="outline" className="text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/25 text-purple-300 border-purple-500/40 backdrop-blur-md">
                                4K
                            </Badge>
                        )}
                        {rating && Number(rating) > 0 && (
                            <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-black/60 backdrop-blur-md border border-amber-500/30 text-amber-300 text-[10px] font-bold shadow-sm">
                                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                <span>{rating}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Status Badge in Bottom Left of Poster */}
                <div className="absolute bottom-2 left-2 z-10 pointer-events-none">
                    {renderAvailabilityBadge()}
                </div>

                {/* Dark Gradient Overlay for Typography */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#14141c] via-[#14141c]/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* Quick Action Overlay on Hover */}
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 bg-black/60 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-all duration-200">
                    <Button 
                        size="sm" 
                        className="w-full h-8 text-xs font-semibold rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                        onClick={(e) => {
                            e.stopPropagation();
                            onSelect(item);
                        }}
                    >
                        <Info className="h-3.5 w-3.5" />
                        <span>View Details</span>
                    </Button>
                    {!inLibrary && !isRequested && onRequest && (
                        <Button 
                            size="sm" 
                            variant="secondary"
                            className="w-full h-8 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 shadow-md transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRequest(item);
                            }}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Quick Request</span>
                        </Button>
                    )}
                </div>
            </div>

            {/* Bottom Meta Info */}
            <div className="p-3 flex-1 flex flex-col justify-between space-y-1 bg-[#14141c]">
                <h3 className="text-xs sm:text-sm font-bold text-foreground line-clamp-1 group-hover:text-primary transition-colors">
                    {item.title}
                </h3>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span>{releaseYear || "TBA"}</span>
                    {item.certification && (
                        <span className="px-1 py-0.2 rounded bg-muted/40 border border-border/40 text-[9px] font-semibold text-muted-foreground uppercase">
                            {item.certification}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}
