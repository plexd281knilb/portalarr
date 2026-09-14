"use client";

import React, { useState, useEffect, useMemo } from "react";
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Search,
    Loader2,
    Film,
    Tv,
    Sparkles,
    Check,
    HardDrive,
    Layers,
    Filter,
    ArrowUpDown,
    X,
    Disc,
    Tag,
    Volume2,
    ShieldCheck,
    ShieldAlert,
    Lock,
    Eye,
    EyeOff
} from "lucide-react";
import {
    searchPlexLibraryItemsAction,
    getPlexRecentLibraryItemsAction
} from "@/app/curation-actions";
import { PlexMediaStreamInfo } from "@/lib/curation/plex-analyzer";
import { ServerGuardRailConfig } from "@/lib/curation/parental-guide-types";

export interface PlexServerOption {
    serverId: string;
    serverName: string;
    sections?: Array<{
        key: string | number;
        title: string;
        type: string;
    }>;
}

interface PlexPosterPickerModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    serverId: string;
    sectionKey?: string;
    serverName?: string;
    servers?: PlexServerOption[];
    onSelect: (item: PlexMediaStreamInfo, posterUrl: string) => void;
}

export function PlexPosterPickerModal({
    open,
    onOpenChange,
    serverId: initialServerId,
    sectionKey: initialSectionKey,
    serverName: initialServerName = "Plex Server",
    servers = [],
    onSelect
}: PlexPosterPickerModalProps) {
    const [currentServerId, setCurrentServerId] = useState<string>(initialServerId || "");
    const [currentSectionKey, setCurrentSectionKey] = useState<string>(initialSectionKey || "");
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSort, setSelectedSort] = useState<string>("addedAt:desc");
    const [qualityFilter, setQualityFilter] = useState<"all" | "4k" | "1080p" | "hdr" | "editions">("all");
    const [loading, setLoading] = useState(false);
    const [items, setItems] = useState<PlexMediaStreamInfo[]>([]);
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [guardRail, setGuardRail] = useState<ServerGuardRailConfig | null>(null);
    const [blockedCount, setBlockedCount] = useState<number>(0);
    const [showBlockedPreview, setShowBlockedPreview] = useState<boolean>(false);

    // Sync initial props when opened
    useEffect(() => {
        if (open) {
            if (initialServerId && initialServerId !== currentServerId) {
                setCurrentServerId(initialServerId);
            }
            if (initialSectionKey && initialSectionKey !== currentSectionKey) {
                setCurrentSectionKey(initialSectionKey);
            }
        }
    }, [open, initialServerId, initialSectionKey]);

    const activeServer = useMemo(() => {
        return servers.find(s => s.serverId === currentServerId) || {
            serverId: currentServerId,
            serverName: initialServerName,
            sections: []
        };
    }, [servers, currentServerId, initialServerName]);

    const availableSections = useMemo(() => {
        return activeServer.sections || [];
    }, [activeServer]);

    const activeSection = useMemo(() => {
        return availableSections.find(s => String(s.key) === currentSectionKey);
    }, [availableSections, currentSectionKey]);

    // Fetch recent items from the library when server, section, sort, showBlockedPreview, or open changes
    useEffect(() => {
        if (!open || !currentServerId) return;
        if (searchQuery.trim().length > 0) return; // let search effect handle it

        let isMounted = true;
        const fetchItems = async () => {
            setLoading(true);
            try {
                const res = await getPlexRecentLibraryItemsAction(
                    currentServerId,
                    currentSectionKey || undefined,
                    60,
                    selectedSort,
                    showBlockedPreview
                );
                if (isMounted && res.success && res.items) {
                    setItems(res.items);
                    if (res.guardRail) {
                        setGuardRail(res.guardRail);
                    }
                    if (typeof res.blockedCount === "number") {
                        setBlockedCount(res.blockedCount);
                    }
                }
            } catch (err) {
                console.error("Failed loading Plex library items:", err);
            } finally {
                if (isMounted) setLoading(false);
            }
        };

        fetchItems();

        return () => {
            isMounted = false;
        };
    }, [open, currentServerId, currentSectionKey, selectedSort, searchQuery, showBlockedPreview]);

    // Handle Search with debounce
    useEffect(() => {
        if (!open || !currentServerId) return;
        if (!searchQuery.trim()) return;

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const res = await searchPlexLibraryItemsAction(
                    currentServerId,
                    searchQuery.trim(),
                    currentSectionKey || undefined,
                    showBlockedPreview
                );
                if (res.success && res.items) {
                    setItems(res.items);
                    if (res.guardRail) {
                        setGuardRail(res.guardRail);
                    }
                    if (typeof res.blockedCount === "number") {
                        setBlockedCount(res.blockedCount);
                    }
                }
            } catch (e) {
                console.error("Failed searching Plex:", e);
            } finally {
                setLoading(false);
            }
        }, 350);

        return () => clearTimeout(timer);
    }, [searchQuery, open, currentServerId, currentSectionKey, showBlockedPreview]);

    const handleServerChange = (newSrvId: string) => {
        setCurrentServerId(newSrvId);
        const srv = servers.find(s => s.serverId === newSrvId);
        if (srv && srv.sections && srv.sections.length > 0) {
            setCurrentSectionKey(String(srv.sections[0].key));
        } else {
            setCurrentSectionKey("");
        }
        setSearchQuery("");
    };

    const handleSectionChange = (newSecKey: string) => {
        setCurrentSectionKey(newSecKey);
        setSearchQuery("");
    };

    const handleItemClick = (item: PlexMediaStreamInfo) => {
        setSelectedKey(item.ratingKey);
        const posterUrl = item.thumb
            ? `/api/media/image?serverId=${encodeURIComponent(currentServerId)}&thumb=${encodeURIComponent(item.thumb)}&title=${encodeURIComponent(item.title)}&year=${item.year || ''}`
            : `/api/media/image?serverId=${encodeURIComponent(currentServerId)}&title=${encodeURIComponent(item.title)}&year=${item.year || ''}`;

        onSelect(item, posterUrl);
        onOpenChange(false);
    };

    // Filter items client-side
    const filteredItems = useMemo(() => {
        if (qualityFilter === "all") return items;

        return items.filter(it => {
            const res = it.detectedBadges?.resolution || it.media?.[0]?.videoResolution;
            const is4K = res?.includes("4K") || res?.includes("2160") || res?.toLowerCase() === "4k";
            const is1080 = res?.includes("1080") || res?.toLowerCase() === "1080p";
            const isHdr = Boolean(it.detectedBadges?.hdr) || (it.media?.[0]?.hdrFormat && it.media[0].hdrFormat !== "SDR");
            const hasEdition = Boolean(it.editionTitle || it.detectedBadges?.edition);

            if (qualityFilter === "4k") return is4K;
            if (qualityFilter === "1080p") return is1080;
            if (qualityFilter === "hdr") return isHdr;
            if (qualityFilter === "editions") return hasEdition;
            return true;
        });
    }, [items, qualityFilter]);

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-5xl max-h-[90vh] bg-slate-950 border-slate-800 text-white flex flex-col p-6 overflow-hidden shadow-2xl shadow-purple-950/40">
                {/* Header */}
                <DialogHeader className="pb-3 border-b border-slate-800/80">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <DialogTitle className="text-lg font-black flex items-center gap-2 text-white">
                                <Sparkles className="h-5 w-5 text-purple-400" />
                                <span>Pull Real Poster &amp; Telemetry from Plex</span>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>Select any title to simulate overlays, ribbons, and banners using its actual poster &amp; audio/video telemetry.</span>
                            </DialogDescription>
                        </div>

                        {/* Server & Section Selectors */}
                        {servers.length > 0 && (
                            <div className="flex items-center gap-2">
                                {servers.length > 1 && (
                                    <Select value={currentServerId} onValueChange={handleServerChange}>
                                        <SelectTrigger className="h-8 bg-slate-900 border-slate-800 text-xs w-[160px] text-slate-200">
                                            <HardDrive className="h-3.5 w-3.5 text-purple-400 mr-1 shrink-0" />
                                            <SelectValue placeholder="Select Server" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                            {servers.map(s => (
                                                <SelectItem key={s.serverId} value={s.serverId} className="text-xs">
                                                    {s.serverName}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}

                                {availableSections.length > 0 && (
                                    <Select value={currentSectionKey} onValueChange={handleSectionChange}>
                                        <SelectTrigger className="h-8 bg-slate-900 border-slate-800 text-xs w-[150px] text-slate-200">
                                            {activeSection?.type === "show" ? (
                                                <Tv className="h-3.5 w-3.5 text-cyan-400 mr-1 shrink-0" />
                                            ) : (
                                                <Film className="h-3.5 w-3.5 text-amber-400 mr-1 shrink-0" />
                                            )}
                                            <SelectValue placeholder="Select Section" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                            {availableSections.map(sec => (
                                                <SelectItem key={String(sec.key)} value={String(sec.key)} className="text-xs">
                                                    {sec.title}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        )}
                    </div>
                </DialogHeader>

                {/* Server Guard Rail Status Banner */}
                {guardRail?.enabled && (
                    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-purple-950/40 border border-purple-500/30 text-xs my-1 shrink-0">
                        <div className="flex items-center gap-2">
                            <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span className="font-bold text-white">
                                {guardRail.customBadgeLabel || `🛡️ Guard Rails Active: Max ${guardRail.maxRating}`}
                            </span>
                            <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-300 bg-emerald-950/60 font-bold px-1.5 py-0">
                                {guardRail.preset === 'kid_safe' ? '👶 Kid-Safe' : guardRail.preset === 'family' ? '👨‍👩‍👧‍👦 Family-Safe' : guardRail.preset === 'teen' ? '🧑‍🎤 Teen' : 'Strict Policy'}
                            </Badge>
                        </div>
                        {blockedCount > 0 && (
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] text-slate-400">
                                    Filtered <strong className="text-rose-300">{blockedCount}</strong> adult/inappropriate {blockedCount === 1 ? 'title' : 'titles'}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setShowBlockedPreview(!showBlockedPreview)}
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all flex items-center gap-1 ${
                                        showBlockedPreview
                                            ? "bg-rose-950 text-rose-300 border-rose-500 shadow-sm"
                                            : "bg-slate-900 text-slate-300 border-slate-700 hover:text-white"
                                    }`}
                                >
                                    {showBlockedPreview ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                    <span>{showBlockedPreview ? "Hide Blocked" : "Preview Blocked"}</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

                {/* Search & Filter Toolbar */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 my-3">
                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <Input
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={`Search ${activeSection?.title || 'titles'} (e.g. Lord of the Rings, Dune, Inception)...`}
                            className="bg-slate-900 border-slate-800 pl-10 pr-9 text-xs text-slate-100 placeholder:text-slate-500 rounded-xl h-9 focus-visible:ring-purple-500"
                        />
                        {searchQuery && (
                            <button
                                type="button"
                                onClick={() => setSearchQuery("")}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                            >
                                <X className="h-3.5 w-3.5" />
                            </button>
                        )}
                    </div>

                    {/* Quality Filter Chips */}
                    <div className="flex items-center gap-1 overflow-x-auto py-0.5 shrink-0">
                        <button
                            type="button"
                            onClick={() => setQualityFilter("all")}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border ${
                                qualityFilter === "all"
                                    ? "bg-purple-600 text-white border-purple-500 shadow-sm"
                                    : "bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200"
                            }`}
                        >
                            All ({items.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setQualityFilter("4k")}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 ${
                                qualityFilter === "4k"
                                    ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm"
                                    : "bg-slate-900 text-amber-400 border-slate-800 hover:bg-slate-800"
                            }`}
                        >
                            <span>4K UHD</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setQualityFilter("hdr")}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 ${
                                qualityFilter === "hdr"
                                    ? "bg-purple-900/90 text-purple-200 border-purple-500 shadow-sm"
                                    : "bg-slate-900 text-purple-300 border-slate-800 hover:bg-slate-800"
                            }`}
                        >
                            <span>DV / HDR</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setQualityFilter("editions")}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all border flex items-center gap-1 ${
                                qualityFilter === "editions"
                                    ? "bg-emerald-900/90 text-emerald-200 border-emerald-500 shadow-sm"
                                    : "bg-slate-900 text-emerald-400 border-slate-800 hover:bg-slate-800"
                            }`}
                        >
                            <Disc className="h-3 w-3" />
                            <span>Editions</span>
                        </button>
                    </div>

                    {/* Sort Selector */}
                    {!searchQuery && (
                        <div className="shrink-0">
                            <Select value={selectedSort} onValueChange={setSelectedSort}>
                                <SelectTrigger className="h-9 bg-slate-900 border-slate-800 text-xs w-[145px] text-slate-300">
                                    <ArrowUpDown className="h-3 w-3 text-slate-400 mr-1 shrink-0" />
                                    <SelectValue placeholder="Sort By" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                    <SelectItem value="addedAt:desc" className="text-xs">Recently Added</SelectItem>
                                    <SelectItem value="titleSort:asc" className="text-xs">Title (A-Z)</SelectItem>
                                    <SelectItem value="originallyAvailableAt:desc" className="text-xs">Release Year</SelectItem>
                                    <SelectItem value="rating:desc" className="text-xs">Top Rated</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </div>

                {/* Media Cards Grid */}
                <div className="flex-1 overflow-y-auto pr-1 -mr-1 min-h-[340px] max-h-[58vh]">
                    {loading && items.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-56 gap-2 text-slate-400">
                            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            <p className="text-xs">Fetching library items and stream telemetry from Plex...</p>
                        </div>
                    ) : filteredItems.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-56 gap-2 text-slate-500 text-xs">
                            <Film className="h-9 w-9 text-slate-600" />
                            <p>No matching titles found with the active search or filters.</p>
                            {(searchQuery || qualityFilter !== "all") && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                        setSearchQuery("");
                                        setQualityFilter("all");
                                    }}
                                    className="mt-2 h-7 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                                >
                                    Reset Filters
                                </Button>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5 pb-2">
                            {filteredItems.map((it) => {
                                const isSelected = it.ratingKey === selectedKey;
                                const res = it.detectedBadges?.resolution || it.media?.[0]?.videoResolution || "1080p";
                                const is4K = res?.includes("4K") || res?.includes("2160") || res?.toLowerCase() === "4k";
                                const is1080 = res?.includes("1080") || res?.toLowerCase() === "1080p";
                                const hasDv = it.detectedBadges?.hdr === "DV" || it.media?.[0]?.hdrFormat === "Dolby Vision";
                                const hasHdr = hasDv || Boolean(it.detectedBadges?.hdr) || (it.media?.[0]?.hdrFormat && it.media[0].hdrFormat !== "SDR");
                                const edition = it.editionTitle || it.detectedBadges?.edition;
                                
                                // Clean formatted audio & channel badges
                                const rawAudio = (it.detectedBadges?.audio || it.media?.[0]?.audioProfile || it.media?.[0]?.audioCodec || "").toLowerCase();
                                const audio = rawAudio.includes("atmos") ? "ATMOS"
                                    : rawAudio.includes("truehd") ? "TRUEHD"
                                    : rawAudio.includes("dts:x") || rawAudio.includes("dts-x") ? "DTS:X"
                                    : rawAudio.includes("dts-hd") || rawAudio.includes("master audio") ? "DTS-HD"
                                    : rawAudio.includes("dts") ? "DTS"
                                    : rawAudio.includes("eac3") || rawAudio.includes("digital+") ? "E-AC3"
                                    : rawAudio.includes("ac3") || rawAudio.includes("dolby digital") ? "AC3"
                                    : rawAudio.includes("flac") ? "FLAC"
                                    : rawAudio.includes("aac") ? "AAC"
                                    : rawAudio ? (rawAudio.length <= 8 ? rawAudio.toUpperCase() : "AUDIO") : undefined;

                                const rawChannels = it.detectedBadges?.audioChannels || (it.media?.[0]?.audioChannels ? (it.media[0].audioChannels >= 8 ? "7.1" : it.media[0].audioChannels >= 6 ? "5.1" : it.media[0].audioChannels === 2 ? "2.0" : `${it.media[0].audioChannels}`) : undefined);
                                const channels = rawChannels;
                                const contentRating = it.detectedBadges?.contentRating || it.contentRating;
                                const codec = it.detectedBadges?.codec || it.media?.[0]?.videoCodec;

                                const posterSrc = it.thumb 
                                    ? `/api/media/image?serverId=${encodeURIComponent(currentServerId)}&thumb=${encodeURIComponent(it.thumb)}&title=${encodeURIComponent(it.title)}&year=${it.year || ''}`
                                    : `/api/media/image?serverId=${encodeURIComponent(currentServerId)}&title=${encodeURIComponent(it.title)}&year=${it.year || ''}`;

                                return (
                                    <div
                                        key={it.ratingKey}
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => {
                                            if (!it.isBlockedByGuardRail) {
                                                handleItemClick(it);
                                            }
                                        }}
                                        className={`group relative flex flex-col rounded-xl overflow-hidden border transition-all text-left ${
                                            it.isBlockedByGuardRail
                                                ? 'border-rose-900/60 bg-slate-950/80 opacity-70 cursor-not-allowed'
                                                : isSelected 
                                                    ? 'border-purple-500 ring-2 ring-purple-500/60 shadow-xl shadow-purple-950/70 cursor-pointer bg-slate-900/90' 
                                                    : 'border-slate-800/90 hover:border-purple-500/50 hover:shadow-lg hover:shadow-black/50 cursor-pointer bg-slate-900/90 hover:bg-slate-800/90'
                                        }`}
                                    >
                                        {/* Poster Container */}
                                        <div className="relative aspect-[2/3] w-full bg-slate-950 overflow-hidden">
                                            <img
                                                src={posterSrc}
                                                alt={it.title}
                                                className={`w-full h-full object-cover transition-transform duration-300 ${it.isBlockedByGuardRail ? 'grayscale' : 'group-hover:scale-105'}`}
                                                loading="lazy"
                                            />

                                            {/* Gradient shading for badge legibility */}
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/60 pointer-events-none" />

                                            {/* Guard Rail Block Overlay */}
                                            {it.isBlockedByGuardRail && (
                                                <div className="absolute inset-0 bg-black/75 backdrop-blur-[2px] flex flex-col items-center justify-center p-2 text-center z-20 pointer-events-none">
                                                    <div className="p-1.5 rounded-full bg-rose-600/30 text-rose-400 border border-rose-500/50 mb-1">
                                                        <Lock className="h-4 w-4" />
                                                    </div>
                                                    <span className="text-[10px] font-black text-rose-300 uppercase tracking-wider">
                                                        Guard Rail Blocked
                                                    </span>
                                                    <span className="text-[9px] text-slate-300 line-clamp-2 mt-0.5 font-medium">
                                                        {it.guardRailBlockReason || `Rated ${it.contentRating || 'R'}`}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Top-Left: Edition Badge */}
                                            {edition && (
                                                <div className="absolute top-1.5 left-1.5 max-w-[70%]">
                                                    <span className="bg-emerald-950/95 text-emerald-300 border border-emerald-500/70 text-[8px] font-black tracking-wider px-1.5 py-0.5 rounded shadow-md truncate block uppercase">
                                                        {edition}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Top-Right: Resolution & HDR Badges */}
                                            <div className="absolute top-1.5 right-1.5 flex flex-col items-end gap-1">
                                                {is4K ? (
                                                    <span className="bg-amber-500 text-slate-950 text-[9px] font-black px-1.5 py-0.5 rounded shadow-md tracking-wider">
                                                        4K UHD
                                                    </span>
                                                ) : is1080 ? (
                                                    <span className="bg-slate-900/90 text-slate-300 border border-slate-700 text-[8px] font-bold px-1 py-0.2 rounded shadow">
                                                        1080p
                                                    </span>
                                                ) : null}

                                                {hasDv ? (
                                                    <span className="bg-purple-950/95 text-purple-300 border border-purple-500/70 text-[8px] font-black px-1.5 py-0.2 rounded shadow-md tracking-wider">
                                                        DOLBY VISION
                                                    </span>
                                                ) : hasHdr ? (
                                                    <span className="bg-sky-950/95 text-sky-300 border border-sky-500/70 text-[8px] font-black px-1.5 py-0.2 rounded shadow-md tracking-wider">
                                                        HDR
                                                    </span>
                                                ) : null}
                                            </div>

                                            {/* Bottom-Left: Content Rating */}
                                            {contentRating && (
                                                <div className="absolute bottom-1.5 left-1.5">
                                                    <span className={`text-[8px] font-black px-1 py-0.2 rounded shadow border ${
                                                        contentRating.includes("R") || contentRating.includes("TV-MA") || contentRating.includes("NC-17")
                                                            ? "bg-red-950/90 text-red-300 border-red-500/60"
                                                            : contentRating.includes("PG-13") || contentRating.includes("TV-14")
                                                            ? "bg-amber-950/90 text-amber-300 border-amber-500/60"
                                                            : "bg-cyan-950/90 text-cyan-300 border-cyan-500/60"
                                                    }`}>
                                                        {contentRating}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Bottom-Right: Audio Format */}
                                            {audio && (
                                                <div className="absolute bottom-1.5 right-1.5">
                                                    <span className="bg-slate-950/90 text-slate-300 border border-slate-700 text-[7.5px] font-bold px-1 py-0.2 rounded shadow flex items-center gap-0.5">
                                                        <Volume2 className="h-2 w-2 text-indigo-400" />
                                                        <span>{audio}</span>
                                                    </span>
                                                </div>
                                            )}

                                            {/* Hover Selection Overlay */}
                                            <div className="absolute inset-0 bg-purple-950/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2 text-center pointer-events-none">
                                                <span className="bg-purple-600 text-white text-[11px] font-bold px-3 py-1.5 rounded-lg shadow-lg flex items-center gap-1.5">
                                                    <Check className="h-3.5 w-3.5" /> Select Poster
                                                </span>
                                            </div>
                                        </div>

                                        {/* Card Body / Metadata Footer */}
                                        <div className="p-2.5 flex flex-col justify-between flex-1 gap-1">
                                            <div>
                                                <p className="text-xs font-bold text-slate-100 line-clamp-2 min-h-[32px] group-hover:text-purple-300 transition-colors leading-tight">
                                                    {it.title}
                                                </p>
                                                {edition && (
                                                    <p className="text-[10px] font-bold text-emerald-400 truncate mt-0.5">
                                                        {edition}
                                                    </p>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between text-[10px] text-slate-400 font-medium pt-1 border-t border-slate-800/60 mt-0.5">
                                                <span>{it.year || "—"}</span>
                                                <div className="flex items-center gap-1 text-[9px] text-slate-400 font-mono">
                                                    {codec && <span>{codec.toUpperCase()}</span>}
                                                    {channels && <span>• {channels}</span>}
                                                </div>
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

export default PlexPosterPickerModal;
