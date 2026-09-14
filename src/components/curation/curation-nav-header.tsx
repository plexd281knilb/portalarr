"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, Film, Trash2, ShieldCheck, ShieldAlert, Sliders } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ServerGuardRailsModal } from "@/components/curation/server-guard-rails-modal";
import { getServerGuardRailsAction } from "@/app/curation-actions";
import { ServerGuardRailConfig } from "@/lib/curation/parental-guide-types";

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
    const [guardRailsModalOpen, setGuardRailsModalOpen] = useState(false);
    const [guardRailsMap, setGuardRailsMap] = useState<Record<string, ServerGuardRailConfig>>({});

    const isKometa = pathname === "/curation" || pathname.startsWith("/curation/kometa");
    const isAgregarr = pathname.startsWith("/curation/agregarr");
    const isPrune = pathname.startsWith("/curation/prune");

    useEffect(() => {
        getServerGuardRailsAction().then(res => {
            if (res.success && res.guardRails) {
                setGuardRailsMap(res.guardRails);
            }
        }).catch(() => {});
    }, [guardRailsModalOpen]);

    const guardedServersCount = Object.values(guardRailsMap).filter(g => g.enabled).length;

    return (
        <div className="space-y-4">
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-gradient-to-br from-[#13111c] via-[#1a1429] to-[#0f172a] border border-purple-500/20 rounded-2xl shadow-xl">
                <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                        <div className={`p-2 rounded-xl border ${
                            isKometa 
                                ? "bg-purple-500/20 text-purple-400 border-purple-500/30"
                                : isAgregarr
                                    ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                                    : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                        }`}>
                            {isKometa && <Sparkles className="h-6 w-6" />}
                            {isAgregarr && <Film className="h-6 w-6" />}
                            {isPrune && <Trash2 className="h-6 w-6" />}
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                            {title || (isKometa ? "Kometa Overlays & Badge Studio" : isAgregarr ? "Agregarr Collections & Coming Soon Hub" : "Maintainerr Storage & Auto-Prune Studio")}
                        </h1>
                        <Badge variant="outline" className={`text-xs font-semibold px-2 py-0.5 ${
                            isKometa 
                                ? "border-purple-500/40 text-purple-300 bg-purple-950/40"
                                : isAgregarr
                                    ? "border-amber-500/40 text-amber-300 bg-amber-950/40"
                                    : "border-rose-500/40 text-rose-300 bg-rose-950/40"
                        }`}>
                            {isKometa ? "Kometa / PMM Engine" : isAgregarr ? "Agregarr Engine" : "Maintainerr / Cleanarr"}
                        </Badge>
                    </div>
                    <p className="text-sm text-slate-400 max-w-2xl">
                        {description || (
                            isKometa 
                                ? "4K UHD, HDR, Dolby Vision, Audio codecs, US age ratings, network logos, tiered gloss ribbons, and YAML config migration."
                                : isAgregarr
                                    ? "Automated TMDb/Trakt/MDBList collections, Plex Home screen ranking (#1-#99), seasonal schedules, upcoming releases, and coming soon banners."
                                    : "Storage mount thresholds, rule-based media pruning (unwatched, low rating, ended series), pinned 'Leaving Soon' Plex collection, and safe file cleanup."
                        )}
                    </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {/* Guard Rails Quick Access Action */}
                    <Button
                        type="button"
                        onClick={() => setGuardRailsModalOpen(true)}
                        className={`h-9 text-xs font-bold px-3 rounded-xl border shadow-lg transition-all flex items-center gap-2 ${
                            guardedServersCount > 0
                                ? "bg-emerald-950/80 text-emerald-200 border-emerald-500/50 hover:bg-emerald-900 shadow-emerald-950/40"
                                : "bg-slate-900/90 text-purple-300 border-purple-500/40 hover:bg-purple-950/50 shadow-purple-950/40"
                        }`}
                    >
                        <ShieldCheck className={`h-4 w-4 ${guardedServersCount > 0 ? "text-emerald-400" : "text-purple-400"}`} />
                        <span>Server Guard Rails</span>
                        {guardedServersCount > 0 ? (
                            <Badge className="bg-emerald-600 text-white font-black text-[10px] px-1.5 py-0 rounded-full">
                                {guardedServersCount} Guarded
                            </Badge>
                        ) : (
                            <Badge variant="outline" className="border-purple-500/40 text-purple-300 text-[10px] px-1.5 py-0">
                                Configure
                            </Badge>
                        )}
                    </Button>

                    <Badge variant="outline" className="bg-slate-900/80 border-slate-800 text-slate-300 px-3 py-2 text-xs font-semibold flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span>{serversCount} Connected {serversCount === 1 ? 'Server' : 'Servers'}</span>
                    </Badge>
                </div>
            </div>

            {/* Server Guard Rails Modal */}
            <ServerGuardRailsModal
                open={guardRailsModalOpen}
                onOpenChange={setGuardRailsModalOpen}
                servers={servers}
                initialServerId={selectedServerId}
                onSaved={() => {
                    getServerGuardRailsAction().then(res => {
                        if (res.success && res.guardRails) setGuardRailsMap(res.guardRails);
                    }).catch(() => {});
                }}
            />

            {/* 3-Way Mode Switcher Navigation Tabs */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-lg backdrop-blur-md overflow-x-auto">
                <Link href="/curation" className="flex-1 min-w-[200px]">
                    <button
                        type="button"
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isKometa
                                ? "bg-purple-600 text-white shadow-lg shadow-purple-950/60 border border-purple-400/50 ring-1 ring-purple-400/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        }`}
                    >
                        <Sparkles className={`h-4 w-4 ${isKometa ? "text-white" : "text-purple-400"}`} />
                        <span>🎨 Kometa Overlays</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isKometa ? "border-purple-300 text-purple-100 bg-purple-700/60" : "border-slate-700 text-slate-400"}`}>
                            Badges &amp; Ribbons
                        </Badge>
                    </button>
                </Link>

                <Link href="/curation/agregarr" className="flex-1 min-w-[200px]">
                    <button
                        type="button"
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isAgregarr
                                ? "bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/60 border border-amber-300/50 ring-1 ring-amber-300/40 font-black"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        }`}
                    >
                        <Film className={`h-4 w-4 ${isAgregarr ? "text-slate-950" : "text-amber-400"}`} />
                        <span>🎬 Agregarr Hubs</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isAgregarr ? "border-amber-900/60 text-slate-950 bg-amber-400" : "border-slate-700 text-slate-400"}`}>
                            Coming Soon &amp; Hubs
                        </Badge>
                    </button>
                </Link>

                <Link href="/curation/prune" className="flex-1 min-w-[200px]">
                    <button
                        type="button"
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                            isPrune
                                ? "bg-rose-600 text-white shadow-lg shadow-rose-950/60 border border-rose-400/50 ring-1 ring-rose-400/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                        }`}
                    >
                        <Trash2 className={`h-4 w-4 ${isPrune ? "text-white" : "text-rose-400"}`} />
                        <span>🧹 Maintainerr Prune</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isPrune ? "border-rose-300 text-rose-100 bg-rose-700/60" : "border-slate-700 text-slate-400"}`}>
                            Leaving Soon &amp; Clean
                        </Badge>
                    </button>
                </Link>
            </div>
        </div>
    );
}
