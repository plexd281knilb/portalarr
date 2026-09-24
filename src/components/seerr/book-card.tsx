"use client";

import { useState } from "react";
import { BookDiscoveryItem } from "@/lib/books/book-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
    BookOpen, 
    Headphones, 
    Star, 
    CheckCircle2, 
    Clock, 
    Download, 
    Plus, 
    Info, 
    Bookmark 
} from "lucide-react";

interface BookCardProps {
    item: BookDiscoveryItem;
    availability?: {
        status: "AVAILABLE" | "REQUESTED" | "DOWNLOADING" | "NOT_AVAILABLE";
        bookId?: string;
        requestId?: string;
        libraryName?: string;
        libraryId?: string;
        filePath?: string;
        fileType?: string;
    };
    onSelect: (item: BookDiscoveryItem) => void;
    onRequest?: (item: BookDiscoveryItem) => void;
    compact?: boolean;
}

export function BookCard({ item, availability, onSelect, onRequest, compact = false }: BookCardProps) {
    const [imageError, setImageError] = useState(false);
    const isAudiobook = item.mediaType === "audiobook";
    const status = availability?.status || item.availability?.status || "NOT_AVAILABLE";

    const renderAvailabilityBadge = () => {
        if (status === "AVAILABLE") {
            return (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold backdrop-blur-md shadow-sm">
                    <CheckCircle2 className="h-3 w-3 shrink-0" />
                    <span>In Library</span>
                </div>
            );
        }
        if (status === "DOWNLOADING") {
            return (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-[10px] font-bold backdrop-blur-md shadow-sm animate-pulse">
                    <Download className="h-3 w-3 shrink-0" />
                    <span>Downloading</span>
                </div>
            );
        }
        if (status === "REQUESTED") {
            return (
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold backdrop-blur-md shadow-sm">
                    <Clock className="h-3 w-3 shrink-0" />
                    <span>Requested</span>
                </div>
            );
        }
        return null;
    };

    return (
        <div 
            onClick={() => onSelect(item)}
            className="group relative flex flex-col rounded-xl overflow-hidden bg-card/60 border border-border/50 hover:border-primary/50 transition-all duration-300 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1 cursor-pointer select-none"
        >
            {/* Poster Container - 2:3 Vertical Aspect Ratio */}
            <div className="relative aspect-[2/3] w-full overflow-hidden bg-muted/40">
                {item.coverUrl && !imageError ? (
                    <img
                        src={item.coverUrl}
                        alt={item.title}
                        className="w-full h-full object-cover object-center transition-transform duration-500 group-hover:scale-105"
                        onError={() => setImageError(true)}
                        loading="lazy"
                    />
                ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center gap-2 p-4 text-center bg-gradient-to-b from-muted/30 to-muted/80 text-muted-foreground/60">
                        {isAudiobook ? (
                            <Headphones className="h-10 w-10 text-amber-500/40" />
                        ) : (
                            <BookOpen className="h-10 w-10 text-purple-500/40" />
                        )}
                        <span className="text-xs font-medium line-clamp-2 px-2 text-foreground/70">{item.title}</span>
                    </div>
                )}

                {/* Gradient Shadow Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-black/30 opacity-70 group-hover:opacity-90 transition-opacity" />

                {/* Top Badges (Format + Series Vol) */}
                <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 pointer-events-none">
                    <Badge 
                        variant="secondary" 
                        className={`text-[10px] font-bold tracking-wider px-2 py-0.5 border shadow-sm backdrop-blur-md ${
                            isAudiobook 
                                ? "bg-amber-500/25 text-amber-300 border-amber-500/40" 
                                : "bg-purple-500/25 text-purple-300 border-purple-500/40"
                        }`}
                    >
                        {isAudiobook ? "🎧 AUDIOBOOK" : "📖 EBOOK"}
                    </Badge>

                    {item.volumeNumber && (
                        <Badge 
                            variant="secondary" 
                            className="bg-black/60 text-foreground/90 border border-white/10 text-[10px] font-bold px-1.5 py-0.5 backdrop-blur-md shadow-sm"
                        >
                            #{item.volumeNumber}
                        </Badge>
                    )}
                </div>

                {/* Availability State Pill (Top-Right / Lower) */}
                <div className="absolute bottom-2 left-2 pointer-events-none">
                    {renderAvailabilityBadge()}
                </div>

                {/* Rating Badge (if available) */}
                {item.rating && item.rating > 0 && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-black/70 border border-white/10 text-amber-300 text-[10px] font-bold backdrop-blur-md shadow-sm">
                        <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                        <span>{item.rating.toFixed(1)}</span>
                    </div>
                )}

                {/* Hover Quick Action Button */}
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center justify-center p-3">
                    <Button 
                        size="sm" 
                        className="rounded-full shadow-lg font-semibold gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs h-8 px-3"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (onRequest) {
                                onRequest(item);
                            } else {
                                onSelect(item);
                            }
                        }}
                    >
                        {status === "AVAILABLE" ? (
                            <>
                                <BookOpen className="h-3.5 w-3.5" />
                                <span>View Book</span>
                            </>
                        ) : status === "NOT_AVAILABLE" ? (
                            <>
                                <Plus className="h-3.5 w-3.5" />
                                <span>Request</span>
                            </>
                        ) : (
                            <>
                                <Info className="h-3.5 w-3.5" />
                                <span>Details</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>

            {/* Bottom Content Metadata */}
            <div className="p-2.5 flex flex-col flex-1 justify-between gap-1">
                <div className="space-y-0.5">
                    <h3 className="font-semibold text-xs text-foreground/90 line-clamp-2 leading-tight group-hover:text-primary transition-colors">
                        {item.title}
                    </h3>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 font-medium">
                        {item.author || "Unknown Author"}
                    </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-muted-foreground/70 pt-1 border-t border-border/30">
                    <span className="line-clamp-1 max-w-[70%]">
                        {item.series ? item.series : (item.publishYear || "")}
                    </span>
                    {item.publishYear && item.series && (
                        <span>{item.publishYear}</span>
                    )}
                </div>
            </div>
        </div>
    );
}
