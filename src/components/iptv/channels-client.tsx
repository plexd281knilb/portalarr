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
    AlertCircle,
    Wand2,
    ArrowRightLeft
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
    provisionMissingDispatcharrChannelsAction,
    requestMarketLocalChannelsAction,
    activateJellyfinLiveTvAction,
    requestAddChannelToProfileAction,
    requestMoveChannelProfileAction,
    refreshPlexDvrAction
} from "@/app/iptv-actions";
import { PlexHomeGuideModal } from "@/components/iptv/plex-home-guide-modal";
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
            plexHomeTotalMembers?: number;
            plexHomeMaxSlots?: number;
            plexHomeAvailableSlots?: number;
            isPlexHomeFull?: boolean;
            hasPlexLiveTvAccess?: boolean;
            hasPlexDvrAccess?: boolean;
            isPlexHomeMember?: boolean;
            hasJellyfinLiveTvAccess?: boolean;
            jellyfinAvailable?: boolean;
            jellyfinServerUrl?: string | null;
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
    onAddToProfile?: (channel: any) => void;
}

function ChannelCard({ ch, specialBadge, badgeColor = "teal", onAddToProfile }: ChannelCardProps) {
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

    const profilesList: { name: string; slug: string }[] = useMemo(() => {
        let list: { name: string; slug: string }[] = [];
        if (Array.isArray(ch.profiles) && ch.profiles.length > 0) {
            list = ch.profiles;
        } else if (Array.isArray(ch.profileSlugs) && ch.profileSlugs.length > 0) {
            list = ch.profileSlugs.map((slug: string) => ({
                name: slug.charAt(0).toUpperCase() + slug.slice(1).replace(/_/g, " "),
                slug
            }));
        }
        return list.filter((p) => p.slug !== "all_channels" && p.name.toLowerCase() !== "all_channels");
    }, [ch.profiles, ch.profileSlugs]);

    const hasNoProfiles = profilesList.length === 0;

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
                            <div className="flex items-center gap-1.5 flex-wrap">
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
                        {ch.epgName && ch.epgName.trim().toLowerCase() !== ch.name.trim().toLowerCase() ? ch.epgName : "Live Stream Active"}
                    </p>
                </div>

                {/* Dispatcharr Profile Badges or Unmapped Indicator */}
                <div className="pt-1 flex flex-wrap items-center gap-1">
                    {hasNoProfiles ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            <AlertCircle className="h-2.5 w-2.5" />
                            Not in a Profile
                        </span>
                    ) : (
                        profilesList.slice(0, 3).map((p) => (
                            <span
                                key={p.slug}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-teal-500/10 text-teal-300 border border-teal-500/20"
                            >
                                {p.name}
                            </span>
                        ))
                    )}
                    {profilesList.length > 3 && (
                        <span className="text-[9px] text-muted-foreground font-mono">
                            +{profilesList.length - 3}
                        </span>
                    )}
                </div>
            </div>

            <div className="pt-3 mt-3 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground">
                <div className="flex items-center gap-1.5">
                    <span>1080p 60fps</span>
                </div>
                {onAddToProfile && (
                    hasNoProfiles ? (
                        <Button
                            size="sm"
                            onClick={() => onAddToProfile(ch)}
                            className="h-6 px-2.5 text-[10px] font-bold bg-teal-600 hover:bg-teal-500 text-white rounded-lg flex items-center gap-1 shadow-sm"
                        >
                            <Plus className="h-3 w-3" />
                            Add to Profile
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onAddToProfile(ch)}
                            className="h-6 px-2 text-[10px] font-semibold text-teal-400 hover:text-teal-300 hover:bg-teal-500/10 border border-teal-500/25 rounded-lg flex items-center gap-1"
                            title="Move or reassign channel to a different Dispatcharr profile"
                        >
                            <ArrowRightLeft className="h-2.5 w-2.5" />
                            Move Profile
                        </Button>
                    )
                )}
            </div>
        </div>
    );
}

export function ChannelsClient({ initialData }: ChannelsClientProps) {
    // Active Hub: "local" | "sports" | "news" | "entertainment" | "kids" | "all" | string (custom profile slug) | "unassigned"
    const [activeHub, setActiveHub] = useState<string>("local");
    const [selectedGenre, setSelectedGenre] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [visibleCount, setVisibleCount] = useState<number>(64);
    const [copiedToken, setCopiedToken] = useState<string | null>(null);
    const [marketActionMsg, setMarketActionMsg] = useState<string>("");
    const [marketActionPrompt, setMarketActionPrompt] = useState<{ marketName: string; prompt: string } | null>(null);

    // Location & Media Market State (Anchored by host, customized by user)
    const [selectedMarket, setSelectedMarket] = useState<string>(
        initialData.userAccess.preferredMediaMarket || initialData.userAccess.detectedMediaMarket || "dallas"
    );
    const [marketDetectMsg, setMarketDetectMsg] = useState<string>("");

    // Add Channel to Profile Modal State
    const [targetChannelForProfile, setTargetChannelForProfile] = useState<any | null>(null);
    const [selectedTargetProfile, setSelectedTargetProfile] = useState<string>("");
    const [profileAddReason, setProfileAddReason] = useState<string>("");
    const [profileAddLoading, setProfileAddLoading] = useState<boolean>(false);
    const [profileAddMsg, setProfileAddMsg] = useState<{ text: string; isError?: boolean } | null>(null);

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

    const [canAccessState, setCanAccessState] = useState(initialData.userAccess.canAccessIptv);
    const [hasJellyfinState, setHasJellyfinState] = useState(Boolean(initialData.userAccess.hasJellyfinLiveTvAccess));
    const [showPlexHomeGuide, setShowPlexHomeGuide] = useState(false);
    const canAccess = canAccessState;

    // Computed Shelves & Channel Subsets
    const localMarketChannels = useMemo(
        () => getMarketChannels(channelsList, selectedMarket),
        [channelsList, selectedMarket]
    );

    const unassignedChannels = useMemo(() => {
        return channelsList.filter((c) => {
            const curProfiles = Array.isArray(c.profiles) && c.profiles.length > 0
                ? c.profiles.filter((p: any) => p.slug !== "all_channels" && p.name?.toLowerCase() !== "all_channels")
                : (c.profileSlugs || []).filter((s: string) => s !== "all_channels");
            return curProfiles.length === 0;
        });
    }, [channelsList]);

    // Accurate channel counts for profile badges
    const profileMap = useMemo(() => {
        const map = new Map<string, number>();
        for (const p of profilesList) {
            map.set(p.slug, p.channelCount || 0);
        }
        return map;
    }, [profilesList]);

    const sportsCount = useMemo(() => {
        return profileMap.get("sports") ?? channelsList.filter((c) => c.profileSlugs?.includes("sports")).length;
    }, [profileMap, channelsList]);

    const newsCount = useMemo(() => {
        return profileMap.get("news") ?? channelsList.filter((c) => c.profileSlugs?.includes("news")).length;
    }, [profileMap, channelsList]);

    const entertainmentCount = useMemo(() => {
        return profileMap.get("entertainment") ?? channelsList.filter((c) => c.profileSlugs?.includes("entertainment")).length;
    }, [profileMap, channelsList]);

    const kidsCount = useMemo(() => {
        return profileMap.get("kids") ?? channelsList.filter((c) => c.profileSlugs?.includes("kids")).length;
    }, [profileMap, channelsList]);

    const primaryGenreSlugs = ["sports", "news", "entertainment", "kids"];
    const otherProfiles = useMemo(() => {
        return profilesList.filter(
            (p) => p.slug !== "all_channels" && !primaryGenreSlugs.includes(p.slug)
        );
    }, [profilesList]);

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

    // Request local market channels with AI prompt for Dispatcharr
    const handleRequestMarketChannels = (marketSlug: string) => {
        startTransition(async () => {
            setMarketActionMsg("Analyzing local affiliates & dispatching request to Dispatcharr...");
            const res = await requestMarketLocalChannelsAction({ marketSlug });
            if (res.success) {
                if (res.autoProvisioned && res.provisionCount && res.provisionCount > 0) {
                    const catRes = await getIptvCatalogAction();
                    if (catRes.success && catRes.data) {
                        setChannelsList(catRes.data.channels);
                        setProfilesList(catRes.data.profiles);
                    }
                    setMarketActionMsg(`🎉 Successfully added ${res.provisionCount} local ${res.shortName} channels to Dispatcharr and synced lineup!`);
                } else {
                    setMarketActionMsg(res.message || `Local channel request submitted for ${res.shortName || marketSlug}!`);
                    if (res.aiPrompt) {
                        setMarketActionPrompt({
                            marketName: res.marketName || marketSlug,
                            prompt: res.aiPrompt
                        });
                    }
                }
                setTimeout(() => setMarketActionMsg(""), 8000);
            } else {
                setMarketActionMsg(res.error || "Failed to submit local channel request");
                setTimeout(() => setMarketActionMsg(""), 5000);
            }
        });
    };

    // Filter channels by active hub, search query, and genre
    const activeHubChannels = useMemo(() => {
        let base = channelsList;
        if (activeHub === "local") {
            base = localMarketChannels;
        } else if (activeHub === "unassigned") {
            base = unassignedChannels;
        } else if (activeHub === "all") {
            base = channelsList;
        } else {
            // Profile slug (sports, news, entertainment, kids, or other custom profiles)
            base = channelsList.filter((c) => {
                const slugs = c.profileSlugs || (c.profiles || []).map((p: any) => p.slug);
                return slugs.includes(activeHub);
            });
        }

        return base.filter((c) => {
            const matchesGenre = selectedGenre === "all" || c.genre?.toLowerCase() === selectedGenre.toLowerCase();
            const search = searchQuery.trim().toLowerCase();
            const matchesSearch =
                !search ||
                c.name.toLowerCase().includes(search) ||
                (c.callsign && c.callsign.toLowerCase().includes(search)) ||
                (c.genre && c.genre.toLowerCase().includes(search)) ||
                String(c.channelNumber || "").includes(search);
            return matchesGenre && matchesSearch;
        });
    }, [channelsList, activeHub, localMarketChannels, unassignedChannels, selectedGenre, searchQuery]);

    const displayedChannels = activeHubChannels.slice(0, visibleCount);

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

    const handleOpenAddToProfile = (channel: any) => {
        setTargetChannelForProfile(channel);
        const existingSlugs = channel.profileSlugs || channel.profiles?.map((p: any) => p.slug) || [];
        const candidateProfile = profilesList.find((p) => p.slug !== "all_channels" && !existingSlugs.includes(p.slug));
        setSelectedTargetProfile(candidateProfile?.slug || profilesList[0]?.slug || "sports");
        setProfileAddReason("");
        setProfileAddMsg(null);
    };

    const handleConfirmAddToProfile = (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetChannelForProfile || !selectedTargetProfile) return;

        const isMove = Boolean(
            (targetChannelForProfile.profiles && targetChannelForProfile.profiles.length > 0) ||
            (targetChannelForProfile.profileSlugs && targetChannelForProfile.profileSlugs.length > 0)
        );
        const currentProfileSlug = targetChannelForProfile.profiles?.[0]?.slug || targetChannelForProfile.profileSlugs?.[0];

        setProfileAddLoading(true);
        startTransition(async () => {
            const res = isMove
                ? await requestMoveChannelProfileAction({
                      channelId: targetChannelForProfile.id,
                      targetProfileSlug: selectedTargetProfile,
                      fromProfileSlug: currentProfileSlug,
                      reason: profileAddReason.trim() || undefined
                  })
                : await requestAddChannelToProfileAction({
                      channelId: targetChannelForProfile.id,
                      profileSlug: selectedTargetProfile,
                      reason: profileAddReason.trim() || undefined
                  });

            setProfileAddLoading(false);
            if (res.success) {
                setProfileAddMsg({
                    text: res.message || `${isMove ? "Moved" : "Added"} to ${res.profileName || selectedTargetProfile}! Plex Live TV DVR lineup refreshed.`
                });

                // Update local channelsList in-place
                const targetProfileObj = profilesList.find((p) => p.slug === selectedTargetProfile);
                setChannelsList((prev) =>
                    prev.map((c) => {
                        if (c.id === targetChannelForProfile.id) {
                            if (isMove) {
                                return {
                                    ...c,
                                    profileSlugs: [selectedTargetProfile],
                                    profiles: [
                                        {
                                            id: targetProfileObj?.id || selectedTargetProfile,
                                            name: targetProfileObj?.name || selectedTargetProfile,
                                            slug: selectedTargetProfile
                                        }
                                    ]
                                };
                            } else {
                                const existingSlugs = c.profileSlugs || [];
                                const existingProfiles = c.profiles || [];
                                const newSlugs = existingSlugs.includes(selectedTargetProfile)
                                    ? existingSlugs
                                    : [...existingSlugs, selectedTargetProfile];
                                const newProfiles = existingProfiles.some((p: any) => p.slug === selectedTargetProfile)
                                    ? existingProfiles
                                    : [
                                          ...existingProfiles,
                                          {
                                              id: targetProfileObj?.id || selectedTargetProfile,
                                              name: targetProfileObj?.name || selectedTargetProfile,
                                              slug: selectedTargetProfile
                                          }
                                      ];
                                return {
                                    ...c,
                                    profileSlugs: newSlugs,
                                    profiles: newProfiles
                                };
                            }
                        }
                        return c;
                    })
                );

                // Update profile count
                setProfilesList((prev) =>
                    prev.map((p) => {
                        if (isMove && currentProfileSlug && p.slug === currentProfileSlug) {
                            return { ...p, channelCount: Math.max(0, (p.channelCount || 0) - 1) };
                        }
                        if (p.slug === selectedTargetProfile) {
                            return { ...p, channelCount: (p.channelCount || 0) + 1 };
                        }
                        return p;
                    })
                );

                // Background catalog reload
                getIptvCatalogAction().then((catRes) => {
                    if (catRes.success && catRes.data) {
                        setChannelsList(catRes.data.channels);
                        setProfilesList(catRes.data.profiles);
                    }
                });

                setTimeout(() => {
                    setTargetChannelForProfile(null);
                    setProfileAddMsg(null);
                }, 2200);
            } else {
                setProfileAddMsg({
                    text: res.error || (isMove ? "Failed to move channel profile" : "Failed to add channel to profile"),
                    isError: true
                });
            }
        });
    };

    const handleActivateJellyfin = () => {
        startTransition(async () => {
            const res = await activateJellyfinLiveTvAction();
            if (res.success) {
                setAccessRequestMsg(res.message || "Live TV activated on Jellyfin!");
                setCanAccessState(true);
                setHasJellyfinState(true);
                const catRes = await getIptvCatalogAction();
                if (catRes.success && catRes.data) {
                    setChannelsList(catRes.data.channels);
                    setProfilesList(catRes.data.profiles);
                }
            } else {
                setAccessRequestMsg(res.error || "Failed to activate Jellyfin Live TV");
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

    const currentMarket = MEDIA_MARKETS[selectedMarket] || MEDIA_MARKETS.dallas;

    return (
        <div className="container max-w-7xl mx-auto px-4 py-8 space-y-7 animate-in fade-in duration-300">
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
                                    v1.5 Feature
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
                initialData.userAccess.isPlexHomeFull && initialData.userAccess.jellyfinAvailable ? (
                    <div className="p-6 rounded-2xl border border-purple-500/30 bg-gradient-to-r from-purple-500/15 via-purple-500/5 to-transparent text-purple-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
                        <div className="flex items-start gap-3.5">
                            <div className="p-2.5 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-300 shrink-0">
                                <Layers className="h-5 w-5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-bold text-base text-purple-100">
                                        ⚡ Plex Home Slots Full ({initialData.userAccess.plexHomeTotalMembers || 14}/14) — Stream Instantly on Jellyfin!
                                    </h3>
                                    <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/40 text-[10px] font-bold">
                                        Unlimited Viewer Slots
                                    </Badge>
                                </div>
                                <p className="text-xs text-purple-300/80 mt-1 max-w-2xl leading-relaxed">
                                    Plex limits shared tuner pools to 14 members, which are currently at capacity. However, DomsHomeLab also operates Jellyfin, which has <b>unlimited simultaneous Live TV slots</b> and direct audio/video passthrough for Apple TV, Roku, Fire TV, and mobile! Activate below to start streaming immediately.
                                </p>
                                {accessRequestMsg && (
                                    <p className="text-xs font-semibold text-emerald-400 mt-2 flex items-center gap-1.5">
                                        <CheckCircle2 className="h-4 w-4" />
                                        {accessRequestMsg}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap self-start md:self-center">
                            <Button
                                onClick={handleActivateJellyfin}
                                disabled={isPending}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs shadow-md whitespace-nowrap gap-1.5"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Activate Instant Jellyfin Live TV
                            </Button>
                            {!hasPendingRequest && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleRequestAccess}
                                    disabled={isPending}
                                    className="text-xs border-purple-500/40 text-purple-300 hover:bg-purple-500/10 whitespace-nowrap"
                                >
                                    Plex Waitlist
                                </Button>
                            )}
                        </div>
                    </div>
                ) : (
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
                )
            )}

            {/* Top-Level Clickable Hubs Bar (Profiles + Local Hub + Unassigned Hub strictly last) */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-2">
                        <span>Select Channel Hub</span>
                        <span className="text-[10px] text-teal-400/80 lowercase font-medium">
                            • click any hub to explore lineup
                        </span>
                    </span>
                    <span className="text-xs text-muted-foreground">
                        {activeHubChannels.length} channel{activeHubChannels.length === 1 ? "" : "s"} in view
                    </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2.5">
                    {/* Hub 1: 📍 Local Channels Hub (Anchored by host, customized by IP or selector) */}
                    <button
                        onClick={() => {
                            setActiveHub("local");
                            setVisibleCount(64);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
                            activeHub === "local"
                                ? "bg-gradient-to-br from-sky-500/25 via-sky-950/40 to-card border-sky-500/60 shadow-md ring-1 ring-sky-500/30"
                                : "bg-card/60 hover:bg-card border-border/50 hover:border-sky-500/40"
                        }`}
                    >
                        <div className="flex items-center justify-between w-full mb-2">
                            <div className={`p-1.5 rounded-xl transition-colors ${
                                activeHub === "local"
                                    ? "bg-sky-500/30 text-sky-200"
                                    : "bg-sky-500/10 text-sky-400 group-hover:bg-sky-500/20"
                            }`}>
                                <MapPin className="h-4 w-4" />
                            </div>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                activeHub === "local"
                                    ? "bg-sky-400 text-slate-950"
                                    : "bg-sky-500/15 text-sky-300 border border-sky-500/30"
                            }`}>
                                {localMarketChannels.length}
                            </span>
                        </div>
                        <div>
                            <h4 className="text-xs font-extrabold text-foreground tracking-tight group-hover:text-sky-200 transition-colors">
                                Local Hub
                            </h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                {currentMarket.shortName}
                            </p>
                        </div>
                    </button>

                    {/* Hub 2: 🏆 Sports */}
                    <button
                        onClick={() => {
                            setActiveHub("sports");
                            setVisibleCount(64);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
                            activeHub === "sports"
                                ? "bg-gradient-to-br from-rose-500/25 via-rose-950/40 to-card border-rose-500/60 shadow-md ring-1 ring-rose-500/30"
                                : "bg-card/60 hover:bg-card border-border/50 hover:border-rose-500/40"
                        }`}
                    >
                        <div className="flex items-center justify-between w-full mb-2">
                            <div className={`p-1.5 rounded-xl transition-colors ${
                                activeHub === "sports"
                                    ? "bg-rose-500/30 text-rose-200"
                                    : "bg-rose-500/10 text-rose-400 group-hover:bg-rose-500/20"
                            }`}>
                                <Trophy className="h-4 w-4" />
                            </div>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                activeHub === "sports"
                                    ? "bg-rose-400 text-slate-950"
                                    : "bg-rose-500/15 text-rose-300 border border-rose-500/30"
                            }`}>
                                {sportsCount}
                            </span>
                        </div>
                        <div>
                            <h4 className="text-xs font-extrabold text-foreground tracking-tight group-hover:text-rose-200 transition-colors">
                                Sports
                            </h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                RedZone, ESPN & College
                            </p>
                        </div>
                    </button>

                    {/* Hub 3: 📰 News */}
                    <button
                        onClick={() => {
                            setActiveHub("news");
                            setVisibleCount(64);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
                            activeHub === "news"
                                ? "bg-gradient-to-br from-blue-500/25 via-blue-950/40 to-card border-blue-500/60 shadow-md ring-1 ring-blue-500/30"
                                : "bg-card/60 hover:bg-card border-border/50 hover:border-blue-500/40"
                        }`}
                    >
                        <div className="flex items-center justify-between w-full mb-2">
                            <div className={`p-1.5 rounded-xl transition-colors ${
                                activeHub === "news"
                                    ? "bg-blue-500/30 text-blue-200"
                                    : "bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20"
                            }`}>
                                <Newspaper className="h-4 w-4" />
                            </div>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                activeHub === "news"
                                    ? "bg-blue-400 text-slate-950"
                                    : "bg-blue-500/15 text-blue-300 border border-blue-500/30"
                            }`}>
                                {newsCount}
                            </span>
                        </div>
                        <div>
                            <h4 className="text-xs font-extrabold text-foreground tracking-tight group-hover:text-blue-200 transition-colors">
                                News
                            </h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                National & Financial
                            </p>
                        </div>
                    </button>

                    {/* Hub 4: 🎬 Entertainment */}
                    <button
                        onClick={() => {
                            setActiveHub("entertainment");
                            setVisibleCount(64);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
                            activeHub === "entertainment"
                                ? "bg-gradient-to-br from-purple-500/25 via-purple-950/40 to-card border-purple-500/60 shadow-md ring-1 ring-purple-500/30"
                                : "bg-card/60 hover:bg-card border-border/50 hover:border-purple-500/40"
                        }`}
                    >
                        <div className="flex items-center justify-between w-full mb-2">
                            <div className={`p-1.5 rounded-xl transition-colors ${
                                activeHub === "entertainment"
                                    ? "bg-purple-500/30 text-purple-200"
                                    : "bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20"
                            }`}>
                                <Film className="h-4 w-4" />
                            </div>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                activeHub === "entertainment"
                                    ? "bg-purple-400 text-slate-950"
                                    : "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                            }`}>
                                {entertainmentCount}
                            </span>
                        </div>
                        <div>
                            <h4 className="text-xs font-extrabold text-foreground tracking-tight group-hover:text-purple-200 transition-colors">
                                Entertainment
                            </h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                Series, Drama & Movies
                            </p>
                        </div>
                    </button>

                    {/* Hub 5: 👶 Kids */}
                    <button
                        onClick={() => {
                            setActiveHub("kids");
                            setVisibleCount(64);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
                            activeHub === "kids"
                                ? "bg-gradient-to-br from-emerald-500/25 via-emerald-950/40 to-card border-emerald-500/60 shadow-md ring-1 ring-emerald-500/30"
                                : "bg-card/60 hover:bg-card border-border/50 hover:border-emerald-500/40"
                        }`}
                    >
                        <div className="flex items-center justify-between w-full mb-2">
                            <div className={`p-1.5 rounded-xl transition-colors ${
                                activeHub === "kids"
                                    ? "bg-emerald-500/30 text-emerald-200"
                                    : "bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20"
                            }`}>
                                <Baby className="h-4 w-4" />
                            </div>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                activeHub === "kids"
                                    ? "bg-emerald-400 text-slate-950"
                                    : "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                            }`}>
                                {kidsCount}
                            </span>
                        </div>
                        <div>
                            <h4 className="text-xs font-extrabold text-foreground tracking-tight group-hover:text-emerald-200 transition-colors">
                                Kids & Family
                            </h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                Animation & Cartoons
                            </p>
                        </div>
                    </button>

                    {/* Hub 6: 📺 All Channels */}
                    <button
                        onClick={() => {
                            setActiveHub("all");
                            setVisibleCount(64);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
                            activeHub === "all"
                                ? "bg-gradient-to-br from-teal-500/25 via-teal-950/40 to-card border-teal-500/60 shadow-md ring-1 ring-teal-500/30"
                                : "bg-card/60 hover:bg-card border-border/50 hover:border-teal-500/40"
                        }`}
                    >
                        <div className="flex items-center justify-between w-full mb-2">
                            <div className={`p-1.5 rounded-xl transition-colors ${
                                activeHub === "all"
                                    ? "bg-teal-500/30 text-teal-200"
                                    : "bg-teal-500/10 text-teal-400 group-hover:bg-teal-500/20"
                            }`}>
                                <Layers className="h-4 w-4" />
                            </div>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                activeHub === "all"
                                    ? "bg-teal-400 text-slate-950"
                                    : "bg-teal-500/15 text-teal-300 border border-teal-500/30"
                            }`}>
                                {channelsList.length}
                            </span>
                        </div>
                        <div>
                            <h4 className="text-xs font-extrabold text-foreground tracking-tight group-hover:text-teal-200 transition-colors">
                                All Lineups
                            </h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                Master Channel Pool
                            </p>
                        </div>
                    </button>

                    {/* Hub 7: ⚠️ Not in any Profile (Strictly the LAST hub) */}
                    <button
                        onClick={() => {
                            setActiveHub("unassigned");
                            setVisibleCount(64);
                        }}
                        className={`p-3 rounded-2xl border text-left transition-all duration-200 flex flex-col justify-between group relative overflow-hidden ${
                            activeHub === "unassigned"
                                ? "bg-gradient-to-br from-amber-500/25 via-amber-950/40 to-card border-amber-500/60 shadow-md ring-1 ring-amber-500/30"
                                : unassignedChannels.length > 0
                                ? "bg-amber-500/5 hover:bg-card border-amber-500/30 hover:border-amber-500/50"
                                : "bg-card/60 hover:bg-card border-border/50 hover:border-amber-500/40"
                        }`}
                    >
                        <div className="flex items-center justify-between w-full mb-2">
                            <div className={`p-1.5 rounded-xl transition-colors ${
                                activeHub === "unassigned"
                                    ? "bg-amber-500/30 text-amber-200"
                                    : "bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20"
                            }`}>
                                <AlertCircle className="h-4 w-4" />
                            </div>
                            <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full ${
                                activeHub === "unassigned"
                                    ? "bg-amber-400 text-slate-950"
                                    : unassignedChannels.length > 0
                                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                                    : "bg-muted text-muted-foreground"
                            }`}>
                                {unassignedChannels.length}
                            </span>
                        </div>
                        <div>
                            <h4 className="text-xs font-extrabold text-foreground tracking-tight group-hover:text-amber-200 transition-colors">
                                Not in Profile
                            </h4>
                            <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">
                                Needs Profile Mapping
                            </p>
                        </div>
                    </button>
                </div>

                {/* Optional Custom Profiles (e.g. Fios, Spectrum, or other custom lineups) */}
                {otherProfiles.length > 0 && (
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                        <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                            Additional Lineups:
                        </span>
                        {otherProfiles.map((p) => (
                            <button
                                key={p.id}
                                onClick={() => {
                                    setActiveHub(p.slug);
                                    setVisibleCount(64);
                                }}
                                className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                                    activeHub === p.slug
                                        ? "bg-teal-500/20 border-teal-500/50 text-teal-200 shadow-sm"
                                        : "bg-card/40 border-border/40 text-muted-foreground hover:text-foreground hover:bg-card"
                                }`}
                            >
                                <Radio className="h-3 w-3" />
                                <span>{p.name}</span>
                                <span className="text-[10px] opacity-70 font-mono">({p.channelCount || 0})</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* CHANNELS DISPLAYED DIRECTLY UNDERNEATH ACTIVE HUB */}

            {/* Sub-Header Toolbar when "Local Hub" is active */}
            {activeHub === "local" && (
                <div className="p-4 md:p-5 rounded-2xl border border-sky-500/30 bg-gradient-to-r from-sky-950/30 via-card/60 to-card/40 space-y-3.5 shadow-sm animate-in fade-in duration-200">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <div className="h-9 w-9 rounded-xl bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300 shrink-0">
                                <MapPin className="h-4.5 w-4.5" />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="text-sm font-bold text-foreground">
                                        {currentMarket.name}
                                    </h3>
                                    {currentMarket.isHostServer ? (
                                        <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30">
                                            ⭐️ Host Server Anchored (DFW)
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-300 border-sky-500/30">
                                            📍 Selected Media Market
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Direct in-market broadcast stations (NBC, CBS, FOX, ABC, CW) and regional sports feeds for {currentMarket.shortName}.
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

                            {selectedMarket !== "dallas" && (
                                <Button
                                    onClick={() => handleRequestMarketChannels(selectedMarket)}
                                    disabled={isPending}
                                    size="sm"
                                    className="h-8 text-xs font-bold gap-1.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white rounded-xl shadow-sm whitespace-nowrap"
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-teal-200" />
                                    {localMarketChannels.length === 0 ? "Request All Local Channels" : `Request Missing ${currentMarket.shortName} Channels`}
                                </Button>
                            )}
                        </div>
                    </div>

                    {marketDetectMsg && (
                        <div className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5 animate-in fade-in duration-200">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {marketDetectMsg}
                        </div>
                    )}
                </div>
            )}

            {/* Sub-Header Banner when "Not in a Profile" Hub is active */}
            {activeHub === "unassigned" && (
                <div className="p-4 md:p-5 rounded-2xl border border-amber-500/40 bg-gradient-to-r from-amber-950/25 via-card/60 to-card/40 space-y-2 shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                            <AlertCircle className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="font-bold text-sm text-foreground flex items-center gap-2">
                                Channels Not in Any Profile ({unassignedChannels.length})
                                <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-300 border-amber-500/30">
                                    Needs Profile Mapping
                                </Badge>
                            </h3>
                            <p className="text-[11px] text-muted-foreground">
                                These channels exist in your master lineup but have not yet been assigned to any Dispatcharr profile (Sports, News, Entertainment, Kids). Click <b>+ Add to Profile</b> on any card to map it to a profile and update Plex Live TV automatically.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Sub-Header Banner when "Sports" Hub is active */}
            {activeHub === "sports" && (
                <div className="p-3.5 rounded-2xl border border-rose-500/25 bg-gradient-to-r from-rose-950/20 via-card/50 to-card/30 flex items-center justify-between shadow-sm animate-in fade-in duration-200">
                    <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center text-rose-300">
                            <Trophy className="h-3.5 w-3.5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-xs text-foreground flex items-center gap-2">
                                Sports Command Center Lineup
                                <Badge variant="outline" className="text-[9px] bg-rose-500/10 text-rose-300 border-rose-500/30">
                                    RedZone • NFL • College • ESPN
                                </Badge>
                            </h3>
                            <p className="text-[10px] text-muted-foreground">
                                Commercial-free NFL RedZone, NFL Network, Saturday college football (SEC, Big Ten, ACC, ESPNU), and major league sports feeds
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Search & Genre Filter Bar */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-card/40 p-3 rounded-2xl border border-border/40 shadow-sm">
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
                                    ? "bg-primary text-primary-foreground font-bold shadow-sm"
                                    : "bg-muted/40 text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            {genre === "all" ? "All Genres" : genre}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Channel Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                {displayedChannels.map((ch) => {
                    let specialBadge: string | undefined = undefined;
                    let badgeColor: "teal" | "amber" | "emerald" | "purple" | "rose" | "blue" = "teal";

                    if (activeHub === "local") {
                        specialBadge = currentMarket.isHostServer ? "⭐️ Dallas Anchor" : `📍 ${currentMarket.shortName}`;
                        badgeColor = currentMarket.isHostServer ? "amber" : "blue";
                    } else if (activeHub === "unassigned") {
                        specialBadge = "⚠️ Needs Profile";
                        badgeColor = "amber";
                    } else if (activeHub === "sports") {
                        const nameLower = ch.name.toLowerCase();
                        if (nameLower.includes("redzone") || nameLower.includes("nfl network")) {
                            specialBadge = "🏈 NFL Live";
                            badgeColor = "rose";
                        } else if (nameLower.includes("sec") || nameLower.includes("big ten") || nameLower.includes("acc") || nameLower.includes("espnu")) {
                            specialBadge = "🎓 NCAA Sports";
                            badgeColor = "purple";
                        }
                    }

                    return (
                        <ChannelCard
                            key={ch.id}
                            ch={ch}
                            specialBadge={specialBadge}
                            badgeColor={badgeColor}
                            onAddToProfile={handleOpenAddToProfile}
                        />
                    );
                })}
            </div>

            {/* Empty State for Active Hub */}
            {activeHubChannels.length === 0 && (
                <div className="text-center py-12 border border-dashed border-border/60 rounded-2xl bg-card/20 space-y-3">
                    {activeHub === "local" ? (
                        <>
                            <MapPin className="h-8 w-8 text-sky-400 mx-auto opacity-70" />
                            <p className="text-sm font-semibold text-foreground">
                                No local broadcast stations are currently mapped for {currentMarket.name}.
                            </p>
                            <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                Click the button below to send an AI-assisted request into Dispatcharr to search and map NBC, CBS, FOX, ABC & regional sports feeds.
                            </p>
                            <Button
                                onClick={() => handleRequestMarketChannels(selectedMarket)}
                                disabled={isPending}
                                size="sm"
                                className="bg-teal-600 hover:bg-teal-500 text-white font-bold text-xs gap-1.5 rounded-xl shadow-sm"
                            >
                                <Sparkles className="h-3.5 w-3.5" />
                                Request {currentMarket.shortName} Channels
                            </Button>
                        </>
                    ) : activeHub === "unassigned" ? (
                        <>
                            <CheckCircle2 className="h-8 w-8 text-emerald-400 mx-auto" />
                            <p className="text-sm font-semibold text-emerald-300">
                                All Channels Are Assigned!
                            </p>
                            <p className="text-xs text-muted-foreground max-w-md mx-auto">
                                Every active channel in your lineup is assigned to at least one Dispatcharr profile.
                            </p>
                        </>
                    ) : (
                        <>
                            <Tv className="h-8 w-8 text-muted-foreground mx-auto opacity-50" />
                            <p className="text-sm font-semibold text-muted-foreground">
                                No channels matched your search or filters.
                            </p>
                            <Button
                                onClick={() => {
                                    setSelectedGenre("all");
                                    setSearchQuery("");
                                    setVisibleCount(64);
                                }}
                                variant="outline"
                                className="text-xs rounded-xl"
                            >
                                Reset Filters
                            </Button>
                        </>
                    )}
                </div>
            )}

            {/* Pagination / Load More */}
            {activeHubChannels.length > visibleCount && (
                <div className="flex flex-col sm:flex-row items-center justify-center pt-2 pb-2 gap-3">
                    <Button
                        onClick={() => setVisibleCount((prev) => prev + 64)}
                        variant="outline"
                        className="border-teal-500/30 text-teal-300 hover:bg-teal-500/10 text-xs font-bold gap-2 px-5 py-2 rounded-xl"
                    >
                        Load Next 64 Channels (Showing {displayedChannels.length} of {activeHubChannels.length})
                    </Button>
                    <Button
                        onClick={() => setVisibleCount(activeHubChannels.length)}
                        variant="ghost"
                        className="text-xs text-muted-foreground hover:text-foreground"
                    >
                        Show All {activeHubChannels.length}
                    </Button>
                </div>
            )}

            {/* How to Stream on Plex & Jellyfin Guide */}
            {canAccess && (
                <div className="mt-8 p-6 rounded-2xl border border-border/50 bg-card/40 space-y-4 shadow-sm">
                    <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center text-sky-400">
                            <Tv className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-bold text-base text-foreground flex items-center gap-2">
                                How to Stream Live Channels
                                <Badge variant="outline" className="text-[10px] bg-sky-500/10 text-sky-300 border-sky-500/30">
                                    Plex & Jellyfin Verified
                                </Badge>
                            </h3>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                All requested and active Live TV channels stream directly inside your official Plex and Jellyfin apps with electronic guide listings. Standalone M3U links and Xtream codes are strictly disabled to protect stream stability.
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                        {/* Plex Guide Card */}
                        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                            <div className="flex items-center gap-2 font-bold text-sm text-amber-300">
                                <Tv className="h-4 w-4" />
                                <span>Plex Media Player & Apps</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Open Plex on your Smart TV, Apple TV, Roku, Fire TV, or mobile device. Select <b className="text-foreground">Live TV & DVR</b> in the left navigation sidebar to view program guides, browse live channels, and start playback instantly.
                            </p>
                            <div className="pt-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowPlexHomeGuide(true)}
                                    className="h-7 text-xs border-amber-500/40 text-amber-300 hover:bg-amber-500/10 font-bold gap-1.5 rounded-lg"
                                >
                                    <Tv className="h-3.5 w-3.5" />
                                    Plex Home Login & Setup Guide
                                </Button>
                            </div>
                        </div>

                        {/* Jellyfin Guide Card */}
                        <div className="p-4 rounded-xl border border-purple-500/20 bg-purple-500/5 space-y-2">
                            <div className="flex items-center gap-2 font-bold text-sm text-purple-300">
                                <Layers className="h-4 w-4" />
                                <span>Jellyfin & Swiftfin</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                                Launch Jellyfin or Swiftfin on your streaming device. Click <b className="text-foreground">Live TV</b> from the home screen dashboard to view all active tuner feeds and watch live events with direct audio/video passthrough.
                            </p>
                            <div className="pt-2 flex items-center gap-2">
                                <Badge className="bg-purple-500/15 text-purple-300 border-purple-500/30 text-[10px] font-bold">
                                    Unlimited Viewer Slots
                                </Badge>
                                {hasJellyfinState && (
                                    <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] font-bold">
                                        ✓ Live TV Active
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Market Action Feedback Banner */}
            {marketActionMsg && (
                <div className="p-3.5 rounded-xl bg-teal-500/15 border border-teal-500/40 text-teal-200 text-xs font-semibold flex items-center justify-between shadow-sm animate-in fade-in duration-200">
                    <span className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-teal-400 shrink-0" />
                        {marketActionMsg}
                    </span>
                    <div className="flex items-center gap-2">
                        {marketActionPrompt && (
                            <button
                                onClick={() => {}}
                                className="underline text-teal-300 hover:text-teal-100 text-xs font-bold"
                            >
                                AI Prompt Ready
                            </button>
                        )}
                        <button onClick={() => setMarketActionMsg("")} className="text-teal-400 hover:text-teal-200 text-xs font-bold">✕</button>
                    </div>
                </div>
            )}

            {/* AI Prompt Modal for Dispatcharr */}
            {marketActionPrompt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="w-full max-w-lg rounded-2xl border border-teal-500/40 bg-card p-6 shadow-2xl space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-teal-300 font-bold text-sm">
                                <Sparkles className="h-4 w-4" />
                                <span>AI Prompt for Dispatcharr Generated</span>
                            </div>
                            <button
                                onClick={() => setMarketActionPrompt(null)}
                                className="text-muted-foreground hover:text-foreground text-xs font-bold"
                            >
                                ✕
                            </button>
                        </div>

                        <div>
                            <h4 className="text-base font-bold text-foreground">
                                Local Channels Request: {marketActionPrompt.marketName}
                            </h4>
                            <p className="text-xs text-muted-foreground mt-0.5">
                                Your request and the structured AI prompt below have been queued for the homelab administrator. You can also copy the prompt:
                            </p>
                        </div>

                        <div className="p-3.5 rounded-xl bg-slate-950 border border-border/80 font-mono text-[11px] text-teal-200/90 whitespace-pre-wrap max-h-60 overflow-y-auto leading-relaxed select-all">
                            {marketActionPrompt.prompt}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                    navigator.clipboard.writeText(marketActionPrompt.prompt);
                                    setCopiedToken("prompt-modal");
                                    setTimeout(() => setCopiedToken(null), 2000);
                                }}
                                className="h-8 text-xs font-bold gap-1.5 rounded-xl"
                            >
                                {copiedToken === "prompt-modal" ? (
                                    <>
                                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                                        <span>Copied to Clipboard!</span>
                                    </>
                                ) : (
                                    <>
                                        <Copy className="h-3.5 w-3.5" />
                                        <span>Copy AI Prompt</span>
                                    </>
                                )}
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => setMarketActionPrompt(null)}
                                className="h-8 text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white rounded-xl"
                            >
                                Done
                            </Button>
                        </div>
                    </div>
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

            {/* Plex Home User Login & Setup Guide Modal */}
            <PlexHomeGuideModal
                open={showPlexHomeGuide}
                onOpenChange={setShowPlexHomeGuide}
            />

            {/* Add / Move Channel to Dispatcharr Profile Modal */}
            {targetChannelForProfile && (() => {
                const isMove = Boolean(
                    (targetChannelForProfile.profiles && targetChannelForProfile.profiles.length > 0) ||
                    (targetChannelForProfile.profileSlugs && targetChannelForProfile.profileSlugs.length > 0)
                );
                const currentSlugs = targetChannelForProfile.profiles?.map((p: any) => p.slug) || targetChannelForProfile.profileSlugs || [];

                return (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="w-full max-w-md rounded-2xl border border-teal-500/40 bg-card p-6 shadow-2xl space-y-4">
                            <div className="flex items-center justify-between border-b border-border/40 pb-3">
                                <div className="flex items-center gap-2.5">
                                    <div className="h-9 w-9 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center text-teal-400">
                                        {isMove ? <ArrowRightLeft className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-sm text-foreground">
                                            {isMove ? "Move Channel to Different Profile" : "Add Channel to Dispatcharr Profile"}
                                        </h3>
                                        <p className="text-[11px] text-muted-foreground">
                                            {isMove
                                                ? "Select target profile (channel will be moved and Plex Live TV & DVR lineup refreshed)"
                                                : "Select an existing profile (Plex Live TV & DVR lineup updates automatically)"}
                                        </p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => {
                                        setTargetChannelForProfile(null);
                                        setProfileAddMsg(null);
                                    }}
                                    className="text-muted-foreground hover:text-foreground text-sm font-bold"
                                >
                                    ✕
                                </button>
                            </div>

                            <div className="p-3 rounded-xl bg-background/60 border border-border/40 space-y-1.5">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-sm text-foreground">
                                        {targetChannelForProfile.name}
                                    </span>
                                    {targetChannelForProfile.channelNumber && (
                                        <Badge variant="outline" className="text-[10px] font-mono">
                                            Ch {targetChannelForProfile.channelNumber}
                                        </Badge>
                                    )}
                                </div>
                                <p className="text-[11px] text-muted-foreground">
                                    Callsign: <b className="text-teal-300">{targetChannelForProfile.callsign || "N/A"}</b> • Genre: {targetChannelForProfile.genre || "Entertainment"}
                                </p>
                                <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                                    <span className="text-[10px] text-muted-foreground">Current Profiles:</span>
                                    {targetChannelForProfile.profiles?.length ? (
                                        targetChannelForProfile.profiles.map((p: any) => (
                                            <Badge key={p.slug} variant="outline" className="text-[9px] bg-teal-500/10 text-teal-300 border-teal-500/20">
                                                {p.name}
                                            </Badge>
                                        ))
                                    ) : (
                                        <Badge variant="outline" className="text-[9px] bg-amber-500/10 text-amber-300 border-amber-500/30">
                                            None (Unassigned)
                                        </Badge>
                                    )}
                                </div>
                            </div>

                            <form onSubmit={handleConfirmAddToProfile} className="space-y-3.5 text-xs">
                                <div>
                                    <label className="font-bold text-muted-foreground block mb-1">
                                        {isMove ? "Select New Target Profile *" : "Select Target Dispatcharr Profile *"}
                                    </label>
                                    <select
                                        value={selectedTargetProfile}
                                        onChange={(e) => setSelectedTargetProfile(e.target.value)}
                                        required
                                        className="w-full h-9 px-3 rounded-xl bg-background border border-border text-foreground font-medium text-xs focus:ring-1 focus:ring-teal-500"
                                    >
                                        <option value="">-- Choose Profile --</option>
                                        {profilesList.filter((p: any) => p.slug !== "all_channels").map((p: any) => {
                                            const isCurrent = currentSlugs.includes(p.slug);
                                            return (
                                                <option key={p.id} value={p.slug} disabled={isCurrent}>
                                                    {p.name} ({p.channelCount || 0} channels){isCurrent ? " (Current)" : ""}
                                                </option>
                                            );
                                        })}
                                    </select>
                                </div>

                                <div>
                                    <label className="font-bold text-muted-foreground block mb-1">
                                        Request Reason / Device Target (Optional)
                                    </label>
                                    <Input
                                        placeholder={isMove ? "e.g. Move from News to Sports for upcoming tournaments" : "e.g. Want this in my Apple TV Sports lineup or Plex Home guide"}
                                        value={profileAddReason}
                                        onChange={(e) => setProfileAddReason(e.target.value)}
                                        className="rounded-xl h-9 text-xs"
                                    />
                                </div>

                                {profileAddMsg && (
                                    <div className={`p-2.5 rounded-xl border text-xs font-semibold flex items-center gap-2 ${
                                        profileAddMsg.isError
                                            ? "bg-rose-500/10 border-rose-500/30 text-rose-300"
                                            : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                                    }`}>
                                        {profileAddMsg.isError ? (
                                            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                                        ) : (
                                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                        )}
                                        <span>{profileAddMsg.text}</span>
                                    </div>
                                )}

                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        onClick={() => {
                                            setTargetChannelForProfile(null);
                                            setProfileAddMsg(null);
                                        }}
                                        disabled={profileAddLoading}
                                        className="h-8 text-xs"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={profileAddLoading || !selectedTargetProfile || currentSlugs.includes(selectedTargetProfile)}
                                        className="h-8 text-xs bg-teal-600 hover:bg-teal-500 text-white font-bold gap-1.5 rounded-xl shadow-sm"
                                    >
                                        {profileAddLoading ? (
                                            <>
                                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                                                {isMove ? "Moving & Updating Plex..." : "Updating Dispatcharr & Plex..."}
                                            </>
                                        ) : isMove ? (
                                            <>
                                                <ArrowRightLeft className="h-3.5 w-3.5" />
                                                Move Profile & Update Plex
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="h-3.5 w-3.5" />
                                                Add to Profile & Update Plex
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </form>
                        </div>
                    </div>
                );
            })()}

        </div>
    );
}
