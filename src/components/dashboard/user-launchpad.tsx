"use client";

import Link from "next/link";
import { 
    Compass, BookOpen, Activity, Zap, Tv2, LifeBuoy, Film, Tv, ArrowRight, Server 
} from "lucide-react";
import ServerSpeedTest from "@/components/server-speed-test";
import PlexSetupGuides from "@/components/plex-setup-guides";
import SupportTicketModal from "@/components/support-ticket-modal";

export interface UserLaunchpadProps {
    isSuperUser?: boolean;
}

export function UserLaunchpad({ isSuperUser = false }: UserLaunchpadProps) {
    return (
        <section aria-label="Quick Access Launchpad" className="w-full">
            <div className={`grid grid-cols-2 gap-2.5 sm:gap-3.5 ${
                isSuperUser 
                    ? "sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9" 
                    : "sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7"
            }`}>
                {/* 1. Browse & Request */}
                <Link href="/discover" className="block group h-full">
                    <div className="h-full flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-rose-500/10 border-rose-500/30 text-rose-400 hover:border-rose-500/60 hover:bg-rose-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md">
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                            <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                <Compass className="h-5 w-5 text-rose-400" />
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-rose-500/15 text-rose-300 border-rose-500/30">
                                Requests
                            </span>
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-rose-300 transition-colors flex items-center justify-between">
                                <span>Browse &amp; Request</span>
                                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                            </h3>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                Trending movies, shows &amp; trailers
                            </p>
                        </div>
                    </div>
                </Link>

                {/* 2. SuperUser Only: Radarr Movies */}
                {isSuperUser && (
                    <Link href="/radarr" className="block group h-full">
                        <div className="h-full flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md">
                            <div className="flex items-center justify-between gap-1.5 mb-2">
                                <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                    <Film className="h-5 w-5 text-amber-400" />
                                </div>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-amber-500/15 text-amber-300 border-amber-500/30">
                                    Movies
                                </span>
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-amber-300 transition-colors flex items-center justify-between">
                                    <span>Radarr Movies</span>
                                    <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                </h3>
                                <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                    Movie library, indexers &amp; quality
                                </p>
                            </div>
                        </div>
                    </Link>
                )}

                {/* 3. SuperUser Only: Sonarr TV Shows */}
                {isSuperUser && (
                    <Link href="/sonarr" className="block group h-full">
                        <div className="h-full flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-sky-500/10 border-sky-500/30 text-sky-400 hover:border-sky-500/60 hover:bg-sky-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md">
                            <div className="flex items-center justify-between gap-1.5 mb-2">
                                <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                    <Tv className="h-5 w-5 text-sky-400" />
                                </div>
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-sky-500/15 text-sky-300 border-sky-500/30">
                                    TV Shows
                                </span>
                            </div>
                            <div className="space-y-0.5">
                                <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-sky-300 transition-colors flex items-center justify-between">
                                    <span>Sonarr TV</span>
                                    <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                </h3>
                                <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                    Manage series, seasons &amp; missing episodes
                                </p>
                            </div>
                        </div>
                    </Link>
                )}

                {/* 4. Books & Audio */}
                <Link href="/library" className="block group h-full">
                    <div className="h-full flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:border-emerald-500/60 hover:bg-emerald-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md">
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                            <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                <BookOpen className="h-5 w-5 text-emerald-400" />
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                Books
                            </span>
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-emerald-300 transition-colors flex items-center justify-between">
                                <span>Books &amp; Audio</span>
                                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                            </h3>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                Read ebooks &amp; stream audiobooks
                            </p>
                        </div>
                    </div>
                </Link>

                {/* Servers, Libraries & Add-ons */}
                <Link href="/profile" className="block group h-full">
                    <div className="h-full flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-blue-500/10 border-blue-500/30 text-blue-400 hover:border-blue-500/60 hover:bg-blue-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md">
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                            <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                <Server className="h-5 w-5 text-blue-400" />
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-blue-500/15 text-blue-300 border-blue-500/30">
                                Access
                            </span>
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-blue-300 transition-colors flex items-center justify-between">
                                <span>Servers &amp; Libraries</span>
                                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                            </h3>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                Servers, libraries &amp; free add-ons
                            </p>
                        </div>
                    </div>
                </Link>

                {/* 5. My Streams */}
                <a href="#my-plex-hub" className="block group h-full">
                    <div className="h-full flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-cyan-500/10 border-cyan-500/30 text-cyan-400 hover:border-cyan-500/60 hover:bg-cyan-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md">
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                            <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                <Activity className="h-5 w-5 text-cyan-400" />
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-cyan-500/15 text-cyan-300 border-cyan-500/30">
                                Activity
                            </span>
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-cyan-300 transition-colors flex items-center justify-between">
                                <span>My Streams</span>
                                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                            </h3>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                Live playback stats &amp; watch history
                            </p>
                        </div>
                    </div>
                </a>

                {/* 6. Speed Test Modal */}
                <div className="h-full">
                    <ServerSpeedTest 
                        trigger={
                            <button type="button" className="w-full h-full text-left flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-sky-500/10 border-sky-500/30 text-sky-400 hover:border-sky-500/60 hover:bg-sky-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md cursor-pointer group">
                                <div className="flex items-center justify-between gap-1.5 mb-2 w-full">
                                    <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                        <Zap className="h-5 w-5 text-sky-400" />
                                    </div>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-sky-500/15 text-sky-300 border-sky-500/30">
                                        Bandwidth
                                    </span>
                                </div>
                                <div className="space-y-0.5 w-full">
                                    <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-sky-300 transition-colors flex items-center justify-between">
                                        <span>Speed Test</span>
                                        <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                        Direct play &amp; connection test
                                    </p>
                                </div>
                            </button>
                        }
                    />
                </div>

                {/* 7. Plex Setup Modal */}
                <div className="h-full">
                    <PlexSetupGuides 
                        trigger={
                            <button type="button" className="w-full h-full text-left flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-400 hover:border-amber-500/60 hover:bg-amber-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md cursor-pointer group">
                                <div className="flex items-center justify-between gap-1.5 mb-2 w-full">
                                    <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                        <Tv2 className="h-5 w-5 text-amber-400" />
                                    </div>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-amber-500/15 text-amber-300 border-amber-500/30">
                                        Guides
                                    </span>
                                </div>
                                <div className="space-y-0.5 w-full">
                                    <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-amber-300 transition-colors flex items-center justify-between">
                                        <span>Plex Setup</span>
                                        <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                                    </h3>
                                    <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                        100% Direct Play setup guides
                                    </p>
                                </div>
                            </button>
                        }
                    />
                </div>

                {/* 8. Support */}
                <Link href="/tickets" className="block group h-full">
                    <div className="h-full flex flex-col justify-between p-3 sm:p-3.5 rounded-xl border bg-purple-500/10 border-purple-500/30 text-purple-400 hover:border-purple-500/60 hover:bg-purple-500/15 transition-all duration-200 active:scale-98 shadow-sm hover:shadow-md">
                        <div className="flex items-center justify-between gap-1.5 mb-2">
                            <div className="p-2 rounded-lg bg-background/50 border border-border/40 shadow-xs">
                                <LifeBuoy className="h-5 w-5 text-purple-400" />
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md border tracking-wide uppercase bg-purple-500/15 text-purple-300 border-purple-500/30">
                                Help
                            </span>
                        </div>
                        <div className="space-y-0.5">
                            <h3 className="text-xs sm:text-sm font-bold text-foreground group-hover:text-purple-300 transition-colors flex items-center justify-between">
                                <span>Support</span>
                                <ArrowRight className="h-3.5 w-3.5 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
                            </h3>
                            <p className="text-[11px] text-muted-foreground line-clamp-1 sm:line-clamp-2 leading-tight">
                                Help desk &amp; support tickets
                            </p>
                        </div>
                    </div>
                </Link>
            </div>
        </section>
    );
}

export default UserLaunchpad;
