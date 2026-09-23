"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TmdbVideoItem } from "@/lib/curation/tmdb";
import { Play, Film, X } from "lucide-react";

interface TrailerModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    videos: TmdbVideoItem[];
}

export function TrailerModal({ isOpen, onClose, title, videos }: TrailerModalProps) {
    const [selectedVideoIndex, setSelectedVideoIndex] = useState(0);

    if (!videos || videos.length === 0) return null;

    const currentVideo = videos[selectedVideoIndex] || videos[0];

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="max-w-4xl w-[95vw] bg-[#0c0c10] border-border/60 p-0 overflow-hidden shadow-2xl rounded-2xl">
                <div className="p-4 sm:p-5 flex items-center justify-between border-b border-border/40 bg-[#121218]">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400">
                            <Play className="h-4 w-4 fill-current" />
                        </div>
                        <div>
                            <DialogTitle className="text-base sm:text-lg font-bold text-foreground line-clamp-1">
                                {title}
                            </DialogTitle>
                            <p className="text-xs text-muted-foreground">{currentVideo.name} • YouTube</p>
                        </div>
                    </div>
                </div>

                {/* 16:9 Video Player Container */}
                <div className="relative w-full aspect-video bg-black">
                    <iframe
                        src={`${currentVideo.embedUrl}?autoplay=1&rel=0&modestbranding=1`}
                        title={currentVideo.name}
                        className="w-full h-full border-0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                </div>

                {/* Video Selection Tabs (if multiple trailers) */}
                {videos.length > 1 && (
                    <div className="p-3 sm:p-4 bg-[#121218] border-t border-border/40 flex items-center gap-2 overflow-x-auto">
                        <span className="text-xs font-semibold text-muted-foreground whitespace-nowrap mr-1">
                            Trailers & Clips ({videos.length}):
                        </span>
                        {videos.map((vid, idx) => (
                            <Button
                                key={vid.id || idx}
                                size="sm"
                                variant={selectedVideoIndex === idx ? "default" : "outline"}
                                className={`h-7 px-3 text-xs font-medium rounded-full shrink-0 transition-all ${
                                    selectedVideoIndex === idx
                                        ? "bg-red-600 hover:bg-red-500 text-white shadow-sm"
                                        : "bg-white/[0.03] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground border-border/50"
                                }`}
                                onClick={() => setSelectedVideoIndex(idx)}
                            >
                                <Film className="h-3 w-3 mr-1.5" />
                                {vid.name}
                            </Button>
                        ))}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
