"use client";

import { useState, useTransition, useMemo } from "react";
import Link from "next/link";
import {
    Tv,
    Trophy,
    Newspaper,
    Film,
    Baby,
    Radio,
    Layers,
    Search,
    Plus,
    Key,
    Copy,
    Check,
    ExternalLink,
    ShieldCheck,
    Clock,
    Sparkles,
    CheckCircle2,
    Lock,
    RefreshCw,
    MapPin,
    Crosshair,
    Flame,
    GraduationCap,
    Star,
    ChevronDown,
    ChevronUp,
    Wand2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
    requestIptvAccessAction,
    requestIptvChannelAction,
    generateUserIptvTokenAction,
    revokeUserIptvTokenAction,
    syncDispatcharrLineupAction,
    getIptvCatalogAction,
    setUserPreferredMarketAction,
    detectUserMarketAction,
    provisionMissingDispatcharrChannelsAction
} from "@/app/iptv-actions";
import {
    ORDERED_MARKETS,
    MEDIA_MARKETS,
    getDallasAnchorChannels,
    getMarketChannels,
    getNflChannels,
    getNcaaChannels
} from "@/lib/iptv/market-locator";

interface ChannelsClientProps {
    initialData: {
        userAccess: {
            canAccessIptv: boolean;
            maxConcurrentStreams: number;
            hasPendingAccessRequest: boolean;
            isAdmin: boolean;
            preferredMediaMarket?: string;
            detectedMediaMarket?: string;
        };
        availableMarkets?: any[];
        profiles: any[];
        channels: any[];
        requests: any[];
        tokens: any[];
    };
}

const genreIcons: Record<string, any> = {
    Sports: Trophy,
    News: Newspaper,
    Kids: Baby,
    Entertainment: Film,
    Local: Tv,
    Movies: Film
};

interface ChannelCardProps {
    ch: any;
    specialBadge?: string;
    badgeColor?: "teal" | "amber" | "emerald" | "purple" | "rose" | "blue";
}

function ChannelCard({ ch, specialBadge, badgeColor = "teal" }: ChannelCardProps) {
    const [imgError, setImgError] = useState(false);
    const GenreIcon = genreIcons[ch.genre] || Tv;

    const logoSrc = useMemo(() => {
        if (!ch.logoUrl) return null;
        const match = ch.logoUrl.match(/\/api\/channels\/logos\/(\d+)/);
        if (match) {
            return `/api/iptv/logo/${match[1]}`;
        }
        return ch.logoUrl;
    }, [ch.logoUrl]);

    const badgeClasses = {
        teal: "bg-teal-500/10 border-teal-500/30 text-teal-300",
        amber: "bg-amber-500/10 border-amber-500/30 text-amber-300",
        emerald: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
        purple: "bg-purple-500/10 border-purple-500/30 text-purple-300",
        rose: "bg-rose-500/10 border-rose-500/30 text-rose-300",
        blue: "bg-sky-500/10 border-sky-500/30 text-sky-300"
    }[badgeColor];

    return (
        <div className="group p-4 rounded-2xl border border-border/50 bg-card/60 hover:bg-card hover:border-teal-500/40 transition-all duration-200 flex flex-col justify-between shadow-sm hover:shadow-md">
            <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400 group-hover:scale-105 transition-transform overflow-hidden shrink-0">
                            {logoSrc && !imgError ? (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img
                                    src={logoSrc}
                                    alt={ch.name}
                                    className="h-7 w-7 object-contain"
                                    onError={() => setImgError(true)}
                                    loading="lazy"
                                />
                            ) : (
                                <GenreIcon className="h-4 w-4" />
                            )}
                        </div>
                        <div>
                            <div className="flex items-center gap-1.5">
                                {ch.channelNumber && (
                                    <span className="text-[11px] font-mono font-extrabold px-1.5 py-0.5 rounded-md bg-muted text-muted-foreground">
                                        Ch {ch.channelNumber}
                                    </span>
                                )}
                                {ch.callsign && (
                                    <span className="text-xs font-bold text-teal-300">
                                        {ch.callsign}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    {specialBadge ? (
                        <Badge variant="outline" className={`text-[10px] font-bold ${badgeClasses}`}>
                            {specialBadge}
                        </Badge>
                    ) : (
                        <Badge variant="outline" className="text-[10px] font-medium border-border/50 bg-muted/20">
                            {ch.genre || "TV"}
                        </Badge>
                    )}
                </div>

                <div>
                    <h4 className="text-sm font-bold text-foreground group-hover:text-teal-200 transition-colors line-clamp-1">
                        {ch.name}
                    </h4>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />
                        {ch.epgName || "Live Stream Active"}
                    </p>
                </div>
            </div>

            <div className="pt-3 mt-3 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>1080p 60fps</span>
                <span className="text-teal-400/80 font-medium">Original Quality</span>
            </div>
        </div>
    );
}

export function ChannelsClient({ initialData }: ChannelsClientProps) {
    const [selectedProfile, setSelectedProfile] = useState<string>("all");
    const [selectedGenre, setSelectedGenre] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [visibleCount, setVisibleCount] = useState<number>(64);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);

    // Location & Media Market State
    const [selectedMarket, setSelectedMarket] = useState<string>(
        initialData.userAccess.preferredMediaMarket || "dallas"
    );
    const [marketDetectMsg, setMarketDetectMsg] = useState<string>("");
    const [showDallasAnchor, setShowDallasAnchor] = useState<boolean>(true);
    const [activeShelf, setActiveShelf] = useState<"all" | "dallas" | "local" | "nfl" | "ncaa">("all");

    // Live catalog state
    const [channelsList, setChannelsList] = useState(initialData.channels || []);
    const [profilesList, setProfilesList] = useState(initialData.profiles || []);
    const [syncMsg, setSyncMsg] = useState("");

    // Modal state
    const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
    const [channelNameInput, setChannelNameInput] = useState("");
    const [channelGenreInput, setChannelGenreInput] = useState("Sports");
    const [channelReasonInput, setChannelReasonInput] = useState("");
    const [requestSuccessMsg, setRequestSuccessMsg] = useState("");

    // Access request state
    const [hasPendingRequest, setHasPendingRequest] = useState(
        initialData.userAccess.hasPendingAccessRequest
    );
    const [accessRequestMsg, setAccessRequestMsg] = useState("");

    // Token creation state
    const [tokenLabelInput, setTokenLabelInput] = useState("");
    const [tokensList, setTokensList] = useState(initialData.tokens || []);
    const [isPending, startTransition] = useTransition();

    const canAccess = initialData.userAccess.canAccessIptv;

    // Computed Shelves
    const dallasChannels = useMemo(() => getDallasAnchorChannels(channelsList), [channelsList]);
    const localMarketChannels = useMemo(() => getMarketChannels(channelsList, selectedMarket), [channelsList, selectedMarket]);
    const nflChannels = useMemo(() => getNflChannels(channelsList), [channelsList]);
    const ncaaChannels = useMemo(() => getNcaaChannels(channelsList), [channelsList]);

    // Synchronize Lineup from live Dispatcharr
    const handleSyncLineup = () => {
        startTransition(async () => {
            const res = await syncDispatcharrLineupAction();
            if (res.success) {
                const catRes = await getIptvCatalogAction();
                if (catRes.success && catRes.data) {
                    setChannelsList(catRes.data.channels);
                    setProfilesList(catRes.data.profiles);
                }
                setSyncMsg(res.data?.message || "Synced channels from Dispatcharr!");
                setTimeout(() => setSyncMsg(""), 5000);
            } else {
                setSyncMsg(res.error || "Failed to sync Dispatcharr");
                setTimeout(() => setSyncMsg(""), 5000);
            }
        });
    };

    // Auto-provision missing channels from unmapped streams in Dispatcharr
    const handleProvisionMissingChannels = () => {
        startTransition(async () => {
            const res = await provisionMissingDispatcharrChannelsAction();
            if (res.success) {
                const catRes = await getIptvCatalogAction();
                if (catRes.success && catRes.data) {
                    setChannelsList(catRes.data.channels);
                    setProfilesList(catRes.data.profiles);
                }
                setSyncMsg(res.message);
                setTimeout(() => setSyncMsg(""), 6000);
            } else {
                setSyncMsg(res.message || "Failed to auto-provision channels");
                setTimeout(() => setSyncMsg(""), 6000);
            }
        });
    };

    // Auto-detect user's market from edge IP headers
    const handleAutoDetectMarket = () => {
        startTransition(async () => {
            const res = await detectUserMarketAction();
            if (res.success && res.marketSlug) {
                setSelectedMarket(res.marketSlug);
                await setUserPreferredMarketAction(res.marketSlug);
                setMarketDetectMsg(`Auto-detected: ${res.market?.name || res.marketSlug}`);
                setTimeout(() => setMarketDetectMsg(""), 4500);
            }
        });
    };

    // Save preferred market change
    const handleMarketChange = (newMarket: string) => {
        setSelectedMarket(newMarket);
        startTransition(async () => {
            await setUserPreferredMarketAction(newMarket);
        });
    };

    // Filter channels by selected profile, genre, shelf and search query
    const filteredChannels = useMemo(() => {
        let base = channelsList;

        if (activeShelf === "dallas") {
            base = dallasChannels;
        } else if (activeShelf === "local") {
            base = localMarketChannels;
        } else if (activeShelf === "nfl") {
            base = nflChannels;
        } else if (activeShelf === "ncaa") {
            base = ncaaChannels;
        }

        return base.filter((c) => {
            const matchesProfile =
                selectedProfile === "all" ||
                activeShelf !== "all" ||
                (c.profileSlugs && c.profileSlugs.includes(selectedProfile));
            const matchesGenre = selectedGenre === "all" || c.genre?.toLowerCase() === selectedGenre.toLowerCase();
            const search = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !search ||
                c.name.toLowerCase().includes(search) ||
                (c.callsign && c.callsign.toLowerCase().includes(search)) ||
                (c.genre && c.genre.toLowerCase().includes(search)) ||
                String(c.channelNumber || "").includes(search);
            return matchesProfile && matchesGenre && matchesSearch;
        });
    }, [channelsList, activeShelf, dallasChannels, localMarketChannels, nflChannels, ncaaChannels, selectedProfile, selectedGenre, searchQuery]);

    const displayedChannels = filteredChannels.slice(0, visibleCount);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedToken(id);
        setTimeout(() => setCopiedToken(null), 2000);
    };

    const handleRequestAccess = () => {
        startTransition(async () => {
            const res = await requestIptvAccessAction({
                reason: "Requested from Live TV Hub"
            });
            if (res.success) {
                setHasPendingRequest(true);
                setAccessRequestMsg("Your request for Live TV access was sent to Dom for approval!");
            }
        });
    };

    const handleSubmitChannelRequest = (e: React.FormEvent) => {
        e.preventDefault();
        if (!channelNameInput.trim()) return;

        startTransition(async () => {
            const res = await requestIptvChannelAction({
                channelName: channelNameInput.trim(),
                genre: channelGenreInput,
                reason: channelReasonInput.trim() || undefined
            });
            if (res.success) {
                setRequestSuccessMsg(`Requested "${channelNameInput}"! Dom and the AI assistant will review it.`);
                setChannelNameInput("");
                setChannelReasonInput("");
                setTimeout(() => {
                    setRequestSuccessMsg("");
                    setIsRequestModalOpen(false);
                }, 2500);
            }
        });
    };

    const handleGenerateToken = (e: React.FormEvent) => {
        e.preventDefault();
        if (!tokenLabelInput.trim()) return;

        startTransition(async () => {
            const res = await generateUserIptvTokenAction(tokenLabelInput.trim());
            if (res.success && res.data) {
                setTokensList([res.data, ...tokensList]);
                setTokenLabelInput("");
            }
        });
    };

    const handleRevokeToken = (tokenId: string) => {
        startTransition(async () => {
            const res = await revokeUserIptvTokenAction(tokenId);
            if (res.success) {
                setTokensList(tokensList.filter((t) => t.id !== tokenId));
            }
        });
    };

    const currentMarket = MEDIA_MARKETS[selectedMarket] || MEDIA_MARKETS.dallas;

    return (
        <div className="container max-w-7xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-300">
            {/* Header Lockup */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/40 pb-6">
                <div>
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400 shadow-sm">
                            <Tv className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-2xl md:text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2.5">
                                Live TV & Channels
                                <Badge variant="outline" className="text-xs font-semibold bg-teal-500/10 border-teal-500/30 text-teal-300">
                                    v1.4 Feature
                                </Badge>
                            </h1>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                Live sports, national broadcast news, entertainment and cable lineups across Plex, Jellyfin and standalone players.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                    {initialData.userAccess.isAdmin && (
                        <>
                            <Button
                                onClick={handleSyncLineup}
                                disabled={isPending}
                                variant="outline"
                                className="border-teal-500/40 text-teal-300 hover:bg-teal-500/10 text-xs font-bold gap-1.5 shadow-sm"
                            >
                                <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                                Sync Lineup ({channelsList.length})
                            </Button>
                            <Button
                                onClick={handleProvisionMissingChannels}
                                disabled={isPending}
                                variant="outline"
                                className="border-sky-500/40 text-sky-300 hover:bg-sky-500/10 text-xs font-bold gap-1.5 shadow-sm"
                            >
                                <Wand2 className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                                Auto-Provision Streams
                            </Button>
                            <Link href="/admin/iptv">
                                <Button variant="outline" className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10 text-xs font-bold gap-2">
                                    <ShieldCheck className="h-4 w-4" />
                                    Admin IPTV Control
                                </Button>
                            </Link>
                        </>
                    )}

                    <Button
                        onClick={() => setIsRequestModalOpen(true)}
                        className="bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs gap-2 shadow-sm"
                    >
                        <Plus className="h-4 w-4" />
                        Request Channel
                    </Button>

                    <Link href="/guides">
                        <Button variant="ghost" className="text-xs text-muted-foreground hover:text-foreground gap-1.5">
                            <ExternalLink className="h-3.5 w-3.5" />
                            Player Setup Guides
                        </Button>
                    </Link>
                </div>
            </div>

            {/* Sync Status Banner */}
            {syncMsg && (
                <div className="p-3.5 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-200 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
                    <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                        {syncMsg}
                    </span>
                    <button onClick={() => setSyncMsg("")} className="text-teal-400 hover:text-teal-200 text-xs font-bold">✕</button>
                </div>
            )}

            {/* Access Gating Notice (For Users/Trials without Live TV unlocked) */}
            {!canAccess && (
                <div className="p-6 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent text-amber-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                    <div className="flex items-start gap-3.5">
                        <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 shrink-0">
                            <Lock className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-base text-amber-100">Live TV Access is Available Upon Request</h3>
                            <p className="text-xs text-amber-300/80 mt-1 max-w-2xl">
                                To protect upstream provider bandwidth and guarantee smooth streaming, Live TV access is allocated individually. You can preview the channel catalog below and request activation with 1 click.
                            </p>
                            {accessRequestMsg && (
                                <p className="text-xs font-semibold text-emerald-400 mt-2 flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4" />
                                    {accessRequestMsg}
                                </p>
                            )}
                        </div>
                    </div>
                    <div>
                        {hasPendingRequest ? (
                            <Badge className="bg-amber-500/20 border-amber-500/40 text-amber-200 px-3 py-1.5 text-xs font-bold flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 animate-spin" />
                                Access Request Pending Review
                            </Badge>
                        ) : (
                            <Button
                                onClick={handleRequestAccess}
                                disabled={isPending}
                                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-md whitespace-nowrap"
                            >
                                Request Live TV Access
                            </Button>
                        )}
                    </div>
                </div>
            )}

            {/* User Location & Media Market Customization Bar */}
            <div className="p-4 md:p-5 rounded-2xl border border-teal-500/30 bg-gradient-to-r from-teal-950/40 via-card/60 to-card/40 space-y-3.5 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="h-9 w-9 rounded-xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center text-teal-300 shrink-0">
                            <MapPin className="h-4.5 w-4.5" />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-sm font-bold text-foreground">
                                    Local News, Affiliates & Regional Sports
                                </h3>
                                <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-300 border-emerald-500/30">
                                    Dallas Host Server Anchored
                                </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Server is hosted in Dallas, TX (DFW broadcast feeds are always active below). Choose your location to watch in-market broadcast feeds and regional NFL games:
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex items-center gap-1.5 bg-background/80 border border-border/80 rounded-xl px-2.5 py-1">
                            <span className="text-xs text-muted-foreground font-semibold">Location:</span>
                            <select
                                value={selectedMarket}
                                onChange={(e) => handleMarketChange(e.target.value)}
                                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer pr-1"
                            >
                                {ORDERED_MARKETS.map((m) => (
                                    <option key={m.slug} value={m.slug} className="bg-card text-foreground">
                                        {m.name} {m.isHostServer ? "⭐️" : ""}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <Button
                            onClick={handleAutoDetectMarket}
                            disabled={isPending}
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs font-bold gap-1.5 border-teal-500/40 text-teal-300 hover:bg-teal-500/10 rounded-xl"
                        >
                            <Crosshair className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
                            Auto-Detect from IP
                        </Button>
                    </div>
                </div>

                {marketDetectMsg && (
                    <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 animate-in fade-in duration-200">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {marketDetectMsg}
                    </div>
                )}

                {/* Quick Shelf Filter Pills */}
                <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/30">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        Featured Hubs:
                    </span>
                    <button
                        onClick={() => setActiveShelf("all")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                            activeShelf === "all"
                                ? "bg-teal-500/20 text-teal-200 border border-teal-500/40"
                                : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                        }`}
                    >
                        All Lineup Channels ({channelsList.length})
                    </button>
                    <button
                        onClick={() => setActiveShelf("dallas")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                            activeShelf === "dallas"
                                ? "bg-amber-500/20 text-amber-200 border border-amber-500/40"
                                : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                        }`}
                    >
                        <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
                        Dallas Hub ({dallasChannels.length})
                    </button>
                    {selectedMarket !== "dallas" && (
                        <button
                            onClick={() => setActiveShelf("local")}
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                                activeShelf === "local"
                                    ? "bg-sky-500/20 text-sky-200 border border-sky-500/40"
                                    : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                            }`}
                        >
                            <MapPin className="h-3 w-3 text-sky-400" />
                            {currentMarket.shortName} Locals ({localMarketChannels.length})
                        </button>
                    )}
                    <button
                        onClick={() => setActiveShelf("nfl")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                            activeShelf === "nfl"
                                ? "bg-rose-500/20 text-rose-200 border border-rose-500/40"
                                : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                        }`}
                    >
                        <Flame className="h-3 w-3 text-rose-400" />
                        NFL & Pro Football ({nflChannels.length})
                    </button>
                    <button
                        onClick={() => setActiveShelf("ncaa")}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1 ${
                            activeShelf === "ncaa"
                                ? "bg-purple-500/20 text-purple-200 border border-purple-500/40"
                                : "text-muted-foreground hover:text-foreground hover:bg-card/60"
                        }`}
                    >
                        <GraduationCap className="h-3 w-3 text-purple-400" />
                        NCAA Football ({ncaaChannels.length})
                    </button>
                </div>
            </div>

            {/* ⭐️ Dallas Host Server Hub (Always Anchored & Prominent) */}
            {dallasChannels.length > 0 && activeShelf === "all" && (
                <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/20 via-card/50 to-card/30 p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                                <Star className="h-4 w-4 fill-amber-400" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                                    Dallas / Fort Worth Host Feeds (DFW)
                                    <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30">
                                        Server Anchor • 11 Feeds
                                    </Badge>
                                </h3>
                                <p className="text-[11px] text-muted-foreground">
                                    Direct in-market Dallas broadcast stations (KXAS NBC 5, KDFW FOX 4, KTVT CBS 11, WFAA ABC 8, KTXA 21, KDFI 27)
                                </p>
                            </div>
                        </div>

                        <button
                            onClick={() => setShowDallasAnchor(!showDallasAnchor)}
                            className="text-xs text-muted-foreground hover:text-foreground font-semibold flex items-center gap-1 px-2.5 py-1 rounded-lg hover:bg-card"
                        >
                            {showDallasAnchor ? (
                                <>
                                    <span>Collapse</span>
                                    <ChevronUp className="h-3.5 w-3.5" />
                                </>
                            ) : (
                                <>
                                    <span>Expand ({dallasChannels.length})</span>
                                    <ChevronDown className="h-3.5 w-3.5" />
                                </>
                            )}
                        </button>
                    </div>

                    {showDallasAnchor && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5 animate-in fade-in duration-200">
                            {dallasChannels.slice(0, 8).map((ch) => (
                                <ChannelCard
                                    key={ch.id}
                                    ch={ch}
                                    specialBadge="⭐️ Dallas Anchor"
                                    badgeColor="amber"
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* 📍 Selected User Media Market Shelf (when market != dallas) */}
            {selectedMarket !== "dallas" && localMarketChannels.length > 0 && activeShelf === "all" && (
                <div className="rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-950/20 via-card/50 to-card/30 p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300">
                                <MapPin className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                                    Your Local Market Feeds: {currentMarket.name}
                                    <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-300 border-sky-500/30">
                                        {localMarketChannels.length} Channels Matched
                                    </Badge>
                                </h3>
                                <p className="text-[11px] text-muted-foreground">
                                    In-market broadcast affiliates and regional sports covering {currentMarket.nflTeams.join(", ")}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                        {localMarketChannels.slice(0, 8).map((ch) => (
                            <ChannelCard
                                key={ch.id}
                                ch={ch}
                                specialBadge={`📍 ${currentMarket.shortName}`}
                                badgeColor="blue"
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 🏈 NFL & Pro Football Quick Shelf */}
            {nflChannels.length > 0 && activeShelf === "all" && (
                <div className="rounded-2xl border border-rose-500/30 bg-gradient-to-r from-rose-950/20 via-card/50 to-card/30 p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-rose-300">
                                <Flame className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                                    NFL & Sunday Football Command Center
                                    <Badge variant="outline" className="text-[10px] bg-rose-500/10 text-rose-300 border-rose-500/30">
                                        RedZone • NFL Network • Sunday Games
                                    </Badge>
                                </h3>
                                <p className="text-[11px] text-muted-foreground">
                                    Commercial-free NFL RedZone 1080p 60fps, 24/7 NFL Network, and Sunday NFL national broadcast feeds
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                        {nflChannels.slice(0, 4).map((ch) => (
                            <ChannelCard
                                key={ch.id}
                                ch={ch}
                                specialBadge="🏈 NFL Live"
                                badgeColor="rose"
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* 🎓 NCAA College Football & Sports Hub Quick Shelf */}
            {ncaaChannels.length > 0 && activeShelf === "all" && (
                <div className="rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-950/20 via-card/50 to-card/30 p-5 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <div className="h-8 w-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300">
                                <GraduationCap className="h-4 w-4" />
                            </div>
                            <div>
                                <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                                    NCAA College Football & Campus Sports
                                    <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30">
                                        SEC • Big Ten • ACC • ESPNU • CBSSN
                                    </Badge>
                                </h3>
                                <p className="text-[11px] text-muted-foreground">
                                    Saturday college football game day coverage across SEC Network, Big Ten Network, ACC Network, and ESPNU
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                        {ncaaChannels.slice(0, 4).map((ch) => (
                            <ChannelCard
                                key={ch.id}
                                ch={ch}
                                specialBadge="🎓 NCAA Sports"
                                badgeColor="purple"
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Profile Lineup Selector Pills */}
            <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80">
                        {activeShelf === "all" ? "Channel Lineup Profiles" : `Filtered by: ${activeShelf.toUpperCase()}`}
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {filteredChannels.length} channel{filteredChannels.length === 1 ? "" : "s"} shown
                        {selectedProfile !== "all" && (
                            <span className="ml-1 text-teal-400 font-semibold">
                                ({profilesList.find((p) => p.slug === selectedProfile)?.name || selectedProfile})
                            </span>
                        )}
                    </span>
                </div>

                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => {
                            setSelectedProfile("all");
                            setVisibleCount(64);
                        }}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border ${
                            selectedProfile === "all"
                                ? "bg-teal-500/20 border-teal-500/50 text-teal-200 shadow-sm"
                                : "bg-card/60 border-border/40 text-muted-foreground hover:text-foreground hover:bg-card"
                        }`}
                    >
                        <Layers className="h-3.5 w-3.5 inline mr-1.5" />
                        All Lineups
                    </button>

                    {profilesList.map((p) => {
                        const IconComponent = p.slug.includes("sport")
                            ? Trophy
                            : p.slug.includes("kid")
                            ? Baby
                            : p.slug.includes("news")
                            ? Newspaper
                            : p.slug.includes("fios") || p.slug.includes("spectrum")
                            ? Radio
                            : Film;

                        return (
                            <button
                                key={p.id}
                                onClick={() => {
                                    setSelectedProfile(p.slug);
                                    setVisibleCount(64);
                                }}
                                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                                    selectedProfile === p.slug
                                        ? "bg-teal-500/20 border-teal-500/50 text-teal-200 shadow-sm"
                                        : "bg-card/60 border-border/40 text-muted-foreground hover:text-foreground hover:bg-card"
                                }`}
                            >
                                <IconComponent className="h-3.5 w-3.5" />
                                {p.name}
                                <span className="text-[10px] opacity-60">({p.channelCount})</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Search & Genre Filters */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card/40 p-3 rounded-2xl border border-border/40">
                <div className="relative w-full sm:w-80">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                        placeholder="Search by channel, callsign, or #..."
                        value={searchQuery}
                        onChange={(e) => {
                            setSearchQuery(e.target.value);
                            setVisibleCount(64);
                        }}
                        className="pl-9 h-9 text-xs bg-background/60 border-border/60 rounded-xl"
                    />
                </div>

                <div className="flex flex-wrap items-center gap-1.5 w-full sm:w-auto">
                    {["all", "Sports", "News", "Entertainment", "Kids", "Local", "Movies"].map((genre) => (
                        <button
                            key={genre}
                            onClick={() => {
                                setSelectedGenre(genre);
                                setVisibleCount(64);
                            }}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors ${
                                selectedGenre === genre
                                    ? "bg-primary text-primary-foreground font-bold"
                                    : "bg-muted/40 text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {genre === "all" ? "All Genres" : genre}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Channel Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {displayedChannels.map((ch) => (
                    <ChannelCard key={ch.id} ch={ch} />
                ))}
            </div>

            {/* Pagination / Load More */}
            {filteredChannels.length > visibleCount && (
                <div className="flex flex-col sm:flex-row items-center justify-center pt-4 pb-2 gap-3">
                    <Button
                        onClick={() => setVisibleCount((prev) => prev + 64)}
                        variant="outline"
                        className="border-teal-500/30 text-teal-300 hover:bg-teal-500/10 text-xs font-bold gap-2 px-5 py-2 rounded-xl"
                    >
                        Load Next 64 Channels (Showing {displayedChannels.length} of {filteredChannels.length})
                    </Button>
                    <Button
                        onClick={() => setVisibleCount(filteredChannels.length)}
                        variant="ghost"
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        Show All {filteredChannels.length}
                    </Button>
                </div>
            )}

            {filteredChannels.length === 0 && (
                <div className="text-center py-12 border border-dashed border-border/60 rounded-2xl bg-card/20 space-y-3">
                    <Tv className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
                    <p className="text-sm font-semibold text-muted-foreground">
                        No channels matched your search or filters.
                    </p>
                    <Button
                        onClick={() => {
                            setSelectedGenre("all");
                            setSelectedProfile("all");
                            setActiveShelf("all");
                            setSearchQuery("");
                            setVisibleCount(64);
                        }}
                        variant="outline"
                        className="text-xs"
                    >
                        Reset Filters
                    </Button>
                </div>
            )}

            {/* Standalone Player Tokens (TiviMate, IPTV Smarters) */}
            {canAccess && (
                <div className="mt-12 p-6 rounded-2xl border border-border/50 bg-card/40 space-y-4">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-400">
                                <Key className="h-5 w-5" />
                            </div>
                            <div>
                                <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                                    Standalone IPTV Apps & Player Tokens
                                    <Badge variant="outline" className="text-[10px] bg-purple-500/10 text-purple-300 border-purple-500/30">
                                        TiviMate & Smarters
                                    </Badge>
                                </h3>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Generate private proxy M3U & XMLTV links to stream in dedicated IPTV apps without exposing homelab passwords.
                                </p>
                            </div>
                        </div>

                        <form onSubmit={handleGenerateToken} className="flex items-center gap-2">
                            <Input
                                placeholder="Device name (e.g. Living Room TV)..."
                                value={tokenLabelInput}
                                onChange={(e) => setTokenLabelInput(e.target.value)}
                                className="h-9 text-xs bg-background/60 border-border/60 w-56 rounded-xl"
                            />
                            <Button
                                type="submit"
                                disabled={isPending || !tokenLabelInput.trim()}
                                className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold h-9 rounded-xl shadow-sm whitespace-nowrap"
                            >
                                Generate Token
                            </Button>
                        </form>
                    </div>

                    {tokensList.length > 0 && (
                        <div className="space-y-2.5 pt-2">
                            {tokensList.map((tok) => {
                                const fullM3uUrl = typeof window !== "undefined"
                                    ? `${window.location.origin}${tok.m3uPath}`
                                    : tok.m3uPath;
                                const fullEpgUrl = typeof window !== "undefined"
                                    ? `${window.location.origin}${tok.epgPath}`
                                    : tok.epgPath;

                                return (
                                    <div
                                        key={tok.id}
                                        className="p-3.5 rounded-xl border border-border/40 bg-background/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs"
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-foreground">{tok.label}</span>
                                                <Badge variant="outline" className="text-[10px] font-mono">
                                                    Max {tok.maxStreams} stream{tok.maxStreams === 1 ? "" : "s"}
                                                </Badge>
                                            </div>
                                            <div className="text-[11px] text-muted-foreground mt-1 space-x-3">
                                                <span>Profile: <b className="text-purple-300">{tok.profileName || "All Allowed"}</b></span>
                                                <span className="font-mono text-muted-foreground/60">Token: {tok.token.slice(0, 10)}...</span>
                                            </div>
                                        </div>

                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleCopy(fullM3uUrl, `m3u-${tok.id}`)}
                                                className="h-8 text-xs gap-1.5"
                                            >
                                                {copiedToken === `m3u-${tok.id}` ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                Copy M3U
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleCopy(fullEpgUrl, `epg-${tok.id}`)}
                                                className="h-8 text-xs gap-1.5"
                                            >
                                                {copiedToken === `epg-${tok.id}` ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                                Copy EPG
                                            </Button>

                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleRevokeToken(tok.id)}
                                                className="h-8 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                            >
                                                Revoke
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Request Channel Modal */}
            {isRequestModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                                <Sparkles className="h-5 w-5 text-teal-400" />
                                Request a Live TV Channel
                            </h3>
                            <button
                                onClick={() => setIsRequestModalOpen(false)}
                                className="text-muted-foreground hover:text-foreground text-sm font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <p className="text-xs text-muted-foreground">
                            Let Dom and the homelab know which live network, sports channel, or local feed you want activated.
                        </p>

                        {requestSuccessMsg ? (
                            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                {requestSuccessMsg}
                            </div>
                        ) : (
                            <form onSubmit={handleSubmitChannelRequest} className="space-y-3.5">
                                <div>
                                    <label className="text-xs font-bold text-muted-foreground block mb-1">
                                        Channel Name or Network *
                                    </label>
                                    <Input
                                        placeholder="e.g. YES Network, Willow Cricket, Tennis Channel"
                                        value={channelNameInput}
                                        onChange={(e) => setChannelNameInput(e.target.value)}
                                        required
                                        className="text-xs rounded-xl"
                                    />
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-muted-foreground block mb-1">
                                        Category / Genre
                                    </label>
                                    <select
                                        value={channelGenreInput}
                                        onChange={(e) => setChannelGenreInput(e.target.value)}
                                        className="w-full h-9 px-3 rounded-xl bg-background border border-border text-xs text-foreground"
                                    >
                                        <option value="Sports">Sports</option>
                                        <option value="News">News</option>
                                        <option value="Entertainment">Entertainment</option>
                                        <option value="Kids">Kids</option>
                                        <option value="Movies">Movies</option>
                                        <option value="Local">Local</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-xs font-bold text-muted-foreground block mb-1">
                                        Reason or Sporting Event (Optional)
                                    </label>
                                    <Input
                                        placeholder="e.g. Want to watch regional soccer or local news"
                                        value={channelReasonInput}
                                        onChange={(e) => setChannelReasonInput(e.target.value)}
                                        className="text-xs rounded-xl"
                                    />
                                </div>

                                <div className="flex items-center justify-end gap-2 pt-2">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => setIsRequestModalOpen(false)}
                                        className="text-xs"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isPending || !channelNameInput.trim()}
                                        className="bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs shadow-sm"
                                    >
                                        Submit Channel Request
                                    </Button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
