"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    Search,
    Loader2,
    Film,
    Tv,
    Sparkles,
    Check,
    HardDrive,
    Layers
} from "lucide-react";
import {
    searchPlexLibraryItemsAction,
    getPlexRecentLibraryItemsAction
} from "@/app/curation-actions";
import { PlexMediaStreamInfo } from "@/lib/curation/plex-analyzer";

interface PlexPosterPickerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    serverId: string;
    sectionKey?: string;
    serverName?: string;
    onSelect: (item: PlexMediaStreamInfo, posterUrl: string) => void;
}

export function PlexPosterPickerModal({
    open,
    onOpenChange,
    serverId,
    sectionKey,
    serverName = "Plex Server",
    onSelect
}: PlexPosterPickerModalProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<PlexMediaStreamInfo[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    // Fetch recent items from the library when opened
    useEffect(() => {
        if (!open || !serverId) return;

        let isMounted = true;
        const fetchRecent = async () => {
            setLoading(true);
            try {
                const res = await getPlexRecentLibraryItemsAction(serverId, sectionKey, 40);
                if (isMounted && res.success && res.items) {
                    setItems(res.items);
                }
            } catch (err) {
                console.error("Failed loading recent Plex items:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchRecent();

        return () => {
            isMounted = false;
        };
    }, [open, serverId, sectionKey]);

    // Handle Search with debounce
    useEffect(() => {
        if (!open || !serverId) return;
        if (!searchQuery.trim()) return;

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await searchPlexLibraryItemsAction(serverId, searchQuery.trim(), sectionKey);
                if (res.success && res.items) {
                    setItems(res.items);
                }
            } catch (e) {
                console.error("Failed searching Plex:", e);
            } finally {
                setLoading(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [searchQuery, open, serverId, sectionKey]);

    const handleItemClick = (item: PlexMediaStreamInfo) => {
        setSelectedKey(item.ratingKey);
        const posterUrl = item.thumb
            ? `/api/media/image?serverId=${encodeURIComponent(serverId)}&thumb=${encodeURIComponent(item.thumb)}&title=${encodeURIComponent(item.title)}&year=${item.year || ''}`
            : `/api/media/image?serverId=${encodeURIComponent(serverId)}&title=${encodeURIComponent(item.title)}&year=${item.year || ''}`;

        onSelect(item, posterUrl);
        onOpenChange(false);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[88vh] bg-slate-950 border-slate-800 text-white flex flex-col p-6 overflow-hidden">
                <DialogHeader className="pb-3 border-b border-slate-800/80">
                    <DialogTitle className="text-lg font-black flex items-center gap-2 text-white">
                        <Sparkles className="h-5 w-5 text-purple-400" />
                        <span>Pull Real Poster &amp; Telemetry from Plex</span>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-400 flex items-center gap-2">
                        <span>Select any title from <strong>{serverName}</strong> to simulate overlays and banners on its actual poster and telemetry.</span>
                    </DialogDescription>
                </DialogHeader>

                {/* Search Bar */}
                <div className="relative my-3">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search movies or TV shows by title (e.g. Dune, Breaking Bad, Inception)..."
                        className="bg-slate-900 border-slate-800 pl-10 text-xs text-slate-100 placeholder:text-slate-500 rounded-xl h-10 focus-visible:ring-purple-500"
                    />
                    {loading && (
                        <div className="absolute right-3.5 top-1/2 -translate-y-1/2">
                            <Loader2 className="h-4 w-4 animate-spin text-purple-400" />
                        </div>
                    )}
                </div>

                {/* Media Cards Grid */}
                <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-4 min-h-[300px] max-h-[55vh]">
                    {loading && items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-400">
                            <Loader2 className="h-7 w-7 animate-spin text-purple-400" />
                            <p className="text-xs">Fetching Plex library posters...</p>
                        </div>
                    ) : items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-48 gap-2 text-slate-500 text-xs">
                            <Film className="h-8 w-8 text-slate-600" />
                            <p>No matching titles found in this library section.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {items.map((it) => {
                                const isSelected = it.ratingKey === selectedKey;
                                const res = it.detectedBadges?.resolution || it.media?.[0]?.videoResolution;
                                const is4K = res?.includes("4K") || res?.includes("2160") || res?.toLowerCase() === "4k";
                                const hasDv = it.detectedBadges?.hdr === "DV" || it.media?.[0]?.hdrFormat === "Dolby Vision";
                                const hasHdr = hasDv || Boolean(it.detectedBadges?.hdr) || (it.media?.[0]?.hdrFormat && it.media[0].hdrFormat !== "SDR");
                                const posterSrc = it.thumb 
                                    ? `/api/media/image?serverId=${encodeURIComponent(serverId)}&thumb=${encodeURIComponent(it.thumb)}&title=${encodeURIComponent(it.title)}&year=${it.year || ''}`
                                    : `/api/media/image?serverId=${encodeURIComponent(serverId)}&title=${encodeURIComponent(it.title)}&year=${it.year || ''}`;

                                return (
                                    <div
                                        key={it.ratingKey}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => handleItemClick(it)}
                                        className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all cursor-pointer bg-slate-900/80 hover:bg-slate-800 ${
                                            isSelected 
                                                ? 'border-purple-500 ring-2 ring-purple-500/50 shadow-lg shadow-purple-950/60' 
                                                : 'border-slate-800 hover:border-slate-700'
                                        }`}
                                    >
                                        {/* Poster Image */}
                                        <div className="relative aspect-[2/3] w-full bg-slate-950 overflow-hidden">
                                            <img
                                                src={posterSrc}
                                                alt={it.title}
                                                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                                                loading="lazy"
                                            />
                                            {/* Top badges preview */}
                                            <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
                                                {is4K && (
                                                    <span className="bg-amber-500/90 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded shadow">
                                                        4K
                                                    </span>
                                                )}
                                                {hasDv ? (
                                                    <span className="bg-purple-950/90 text-purple-300 border border-purple-500/50 text-[8px] font-black px-1 py-0.2 rounded shadow">
                                                        DV
                                                    </span>
                                                ) : hasHdr ? (
                                                    <span className="bg-sky-950/90 text-sky-300 border border-sky-500/50 text-[8px] font-black px-1 py-0.2 rounded shadow">
                                                        HDR
                                                    </span>
                                                ) : null}
                                            </div>

                                            {/* Hover overlay button */}
                                            <div className="absolute inset-0 bg-purple-950/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center">
                                                <span className="bg-purple-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg shadow-md flex items-center gap-1">
                                                    <Check className="h-3 w-3" /> Select Poster
                                                </span>
                                            </div>
                                        </div>

                                        {/* Title & Info */}
                                        <div className="p-2 space-y-1">
                                            <p className="text-xs font-bold text-slate-200 line-clamp-1 group-hover:text-purple-300 transition-colors">
                                                {it.title}
                                            </p>
                                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium">
                                                <span>{it.year || "—"}</span>
                                                <span className="font-mono text-[9px] text-slate-500">{it.detectedBadges?.resolution || it.media?.[0]?.videoResolution || "1080p"}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
