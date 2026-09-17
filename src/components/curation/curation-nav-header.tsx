"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Film, Trash2, Tag } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CurationNavHeaderProps {
    serversCount?: number;
    title?: string;
    description?: string;
    servers?: Array<{ serverId: string; serverName: string }>;
    selectedServerId?: string;
}

export function CurationNavHeader({
    serversCount = 1,
    title,
    description,
    servers = [],
    selectedServerId
}: CurationNavHeaderProps) {
    const pathname = usePathname();

    const isKometa = pathname === "/curation" || pathname.startsWith("/curation/kometa");
    const isAgregarr = pathname.startsWith("/curation/agregarr");
    const isPrune = pathname.startsWith("/curation/prune");
    const isTagging = pathname.startsWith("/curation/tagging") || pathname.startsWith("/curation/tags");

    return (
        <div className="space-y-4">
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 sm:p-6 bg-gradient-to-br from-[#13111c] via-[#1a1429] to-[#0f172a] border border-purple-500/20 rounded-2xl shadow-xl">
                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className={`p-2 rounded-xl border ${
                            isKometa 
                                ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                                : isAgregarr
                                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                    : isTagging
                                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                                        : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                        }`}>
                            {isKometa && <Sparkles className="h-5 w-5 sm:h-6 sm:w-6" />}
                            {isAgregarr && <Film className="h-5 w-5 sm:h-6 sm:w-6" />}
                            {isTagging && <Tag className="h-5 w-5 sm:h-6 sm:w-6" />}
                            {isPrune && <Trash2 className="h-5 w-5 sm:h-6 sm:w-6" />}
                        </div>
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-black tracking-tight text-white">
                            {title || (
                                isKometa 
                                    ? "Kometa Overlays & Badge Studio" 
                                    : isAgregarr 
                                        ? "Agregarr Collections & Coming Soon Hub" 
                                        : isTagging
                                            ? "Plex Media Tagging & Content Advisory Studio"
                                            : "Maintainerr Storage & Auto-Prune Studio"
                            )}
                        </h1>
                        <Badge variant="outline" className={`text-xs font-semibold px-2 py-0.5 ${
                            isKometa 
                                ? "border-purple-500/40 text-purple-300 bg-purple-950/40"
                                : isAgregarr
                                    ? "border-amber-500/40 text-amber-300 bg-amber-950/40"
                                    : isTagging
                                        ? "border-emerald-500/40 text-emerald-300 bg-emerald-950/40"
                                        : "border-rose-500/40 text-rose-300 bg-rose-950/40"
                        }`}>
                            {isKometa ? "Kometa / PMM Engine" : isAgregarr ? "Agregarr Engine" : isTagging ? "Plex Tagging Engine" : "Maintainerr / Cleanarr"}
                        </Badge>
                    </div>
                    <p className="text-xs sm:text-sm text-slate-400 max-w-2xl">
                        {description || (
                            isKometa 
                                ? "4K UHD, HDR, Dolby Vision, Audio codecs, US age ratings, network logos, tiered gloss ribbons, and YAML config migration."
                                : isAgregarr
                                    ? "Automated TMDb/Trakt/MDBList collections, Plex Home screen ranking (#1-#99), seasonal schedules, upcoming releases, and coming soon banners."
                                    : isTagging
                                        ? "IMDb Parental Guide advisory severity tags (Nudity, Violence, Profanity, Alcohol/Drugs, Frightening), custom Plex labels/genres, and future-state rule-based auto-taggers."
                                        : "Storage mount thresholds, rule-based media pruning (unwatched, low rating, ended series), pinned 'Leaving Soon' Plex collection, and safe file cleanup."
                        )}
                    </p>
                </div>

                <Badge variant="outline" className="bg-slate-900/80 border-slate-800 text-slate-300 px-3 py-2 text-xs font-semibold flex items-center gap-2 shrink-0">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>{serversCount} Connected {serversCount === 1 ? 'Server' : 'Servers'}</span>
                </Badge>
            </div>

            {/* 4-Way Mode Switcher Navigation Tabs */}
            <div className="grid grid-cols-2 md:flex md:items-center gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-lg backdrop-blur-md">
                <Link href="/curation/kometa" className="w-full md:flex-1 md:min-w-0">
                    <button
                        type="button"
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isKometa
                                ? "bg-purple-600 text-white shadow-lg shadow-purple-950/60 border border-purple-400/50 ring-1 ring-purple-400/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        }`}
                    >
                        <Sparkles className={`h-4 w-4 shrink-0 ${isKometa ? "text-white" : "text-purple-400"}`} />
                        <span className="truncate">🎨 Kometa Overlays</span>
                        <Badge variant="outline" className={`hidden sm:inline-flex text-[10px] px-1.5 py-0 shrink-0 ${isKometa ? "border-purple-300 text-purple-100 bg-purple-700/60" : "border-slate-700 text-slate-400"}`}>
                            Badges
                        </Badge>
                    </button>
                </Link>

                <Link href="/curation/agregarr" className="w-full md:flex-1 md:min-w-0">
                    <button
                        type="button"
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isAgregarr
                                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/60 border border-amber-300/50 ring-1 ring-amber-300/40 font-black"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        }`}
                    >
                        <Film className={`h-4 w-4 shrink-0 ${isAgregarr ? "text-slate-950" : "text-amber-400"}`} />
                        <span className="truncate">🎬 Agregarr Hubs</span>
                        <Badge variant="outline" className={`hidden sm:inline-flex text-[10px] px-1.5 py-0 shrink-0 ${isAgregarr ? "border-amber-900/60 text-slate-950 bg-amber-400" : "border-slate-700 text-slate-400"}`}>
                            Collections
                        </Badge>
                    </button>
                </Link>

                <Link href="/curation/prune" className="w-full md:flex-1 md:min-w-0">
                    <button
                        type="button"
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isPrune
                                ? "bg-rose-600 text-white shadow-lg shadow-rose-950/60 border border-rose-400/50 ring-1 ring-rose-400/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        }`}
                    >
                        <Trash2 className={`h-4 w-4 shrink-0 ${isPrune ? "text-white" : "text-rose-400"}`} />
                        <span className="truncate">🧹 Maintainerr Prune</span>
                        <Badge variant="outline" className={`hidden sm:inline-flex text-[10px] px-1.5 py-0 shrink-0 ${isPrune ? "border-rose-300 text-rose-100 bg-rose-700/60" : "border-slate-700 text-slate-400"}`}>
                            Storage
                        </Badge>
                    </button>
                </Link>

                <Link href="/curation/tagging" className="w-full md:flex-1 md:min-w-0">
                    <button
                        type="button"
                        className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isTagging
                                ? "bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 border border-emerald-400/50 ring-1 ring-emerald-400/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        }`}
                    >
                        <Tag className={`h-4 w-4 shrink-0 ${isTagging ? "text-white" : "text-emerald-400"}`} />
                        <span className="truncate">🏷️ Tagging Studio</span>
                        <Badge variant="outline" className={`hidden sm:inline-flex text-[10px] px-1.5 py-0 shrink-0 ${isTagging ? "border-emerald-300 text-emerald-100 bg-emerald-700/60" : "border-slate-700 text-slate-400"}`}>
                            Parental
                        </Badge>
                    </button>
                </Link>
            </div>
        </div>
    );
}
