"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
    getMediaDetailsAction, 
    getTvSeasonEpisodesAction, 
    getUserRequestQuotaAction, 
    submitMediaRequestAction,
    getArrMonitoringDetailsAction,
    requestTvEpisodesAction
} from "@/app/seerr-actions";
import { 
    TmdbMediaDetail, 
    TmdbMediaItem, 
    TmdbEpisodeInfo, 
    isAdultOrMatureRating, 
    isKidsSafeRating, 
    isNc17OrDisallowedRating 
} from "@/lib/curation/tmdb-types";
import { MediaAvailabilityStatus } from "@/lib/seerr/availability";
import { 
    Play, 
    CheckCircle2, 
    Clock, 
    Download, 
    Plus, 
    Star, 
    Tv, 
    Film, 
    Calendar, 
    Clock3, 
    Sparkles, 
    Layers, 
    AlertCircle, 
    User as UserIcon,
    ShieldAlert,
    ShieldCheck,
    X,
    ExternalLink,
    Info,
    Tv2,
    Users,
    Clapperboard,
    Check,
    CheckCheck,
    Filter,
    RefreshCw
} from "lucide-react";

interface MediaDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    tmdbId: number | null;
    mediaType: "movie" | "tv";
    isKids?: boolean;
    initialAvailability?: MediaAvailabilityStatus;
    onRequestSubmitted?: () => void;
}

export function MediaDetailModal({
    isOpen,
    onClose,
    tmdbId,
    mediaType,
    isKids = false,
    initialAvailability,
    onRequestSubmitted
}: MediaDetailModalProps) {
    const [loading, setLoading] = useState(false);
    const [currentId, setCurrentId] = useState<number | null>(tmdbId);
    const [currentType, setCurrentType] = useState<"movie" | "tv">(mediaType);
    const [details, setDetails] = useState<TmdbMediaDetail | null>(null);
    const [availability, setAvailability] = useState<MediaAvailabilityStatus | undefined>(initialAvailability);
    const [quotaData, setQuotaData] = useState<any>(null);
    
    // Active navigation tab
    const [activeTab, setActiveTab] = useState<"request" | "episodes" | "cast" | "providers" | "recommendations">("request");

    // Inline Trailer Player State
    const [isPlayingTrailer, setIsPlayingTrailer] = useState(false);
    const [activeTrailerIndex, setActiveTrailerIndex] = useState(0);

    // Request Form States
    const [is4k, setIs4k] = useState(false);
    const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
    const [selectAllSeasons, setSelectAllSeasons] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [requestSuccessMsg, setRequestSuccessMsg] = useState<string | null>(null);
    const [requestErrorMsg, setRequestErrorMsg] = useState<string | null>(null);

    // TV Episodes Guide State & Multi-Episode Selection
    const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(1);
    const [seasonEpisodes, setSeasonEpisodes] = useState<Record<number, TmdbEpisodeInfo[]>>({});
    const [loadingEpisodes, setLoadingEpisodes] = useState(false);
    const [selectedEpisodeKeys, setSelectedEpisodeKeys] = useState<string[]>([]);
    const [submittingEpisodes, setSubmittingEpisodes] = useState(false);
    const [episodeSuccessMsg, setEpisodeSuccessMsg] = useState<string | null>(null);
    const [episodeErrorMsg, setEpisodeErrorMsg] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && tmdbId) {
            setCurrentId(tmdbId);
            setCurrentType(mediaType);
            setIsPlayingTrailer(false);
            setActiveTrailerIndex(0);
            setActiveTab("request");
            setSelectedEpisodeKeys([]);
            setEpisodeSuccessMsg(null);
            setEpisodeErrorMsg(null);
            loadMediaData(tmdbId, mediaType);
            loadQuota();
        } else {
            setDetails(null);
            setIsPlayingTrailer(false);
            setActiveTrailerIndex(0);
            setRequestSuccessMsg(null);
            setRequestErrorMsg(null);
            setSelectedSeasons([]);
            setSelectAllSeasons(true);
            setSeasonEpisodes({});
            setSelectedSeasonNumber(1);
            setSelectedEpisodeKeys([]);
            setEpisodeSuccessMsg(null);
            setEpisodeErrorMsg(null);
        }
    }, [isOpen, tmdbId, mediaType, isKids]);

    const loadMediaData = async (id: number, type: "movie" | "tv") => {
        setLoading(true);
        setRequestSuccessMsg(null);
        setRequestErrorMsg(null);
        try {
            const res = await getMediaDetailsAction(id, type, Boolean(isKids));
            if (res.success && res.details) {
                setDetails(res.details);
                setAvailability(res.availability);
                if (type === "tv" && res.details.seasons) {
                    const validSeasons = res.details.seasons.filter(s => s.seasonNumber > 0).map(s => s.seasonNumber);
                    setSelectedSeasons(validSeasons);
                    setSelectAllSeasons(true);
                    if (validSeasons.length > 0) {
                        setSelectedSeasonNumber(validSeasons[0]);
                        loadEpisodesForSeason(id, validSeasons[0]);
                    }
                }
            }
        } catch (e) {} finally {
            setLoading(false);
        }
    };

    const loadQuota = async () => {
        try {
            const res = await getUserRequestQuotaAction();
            if (res.success && res.data) {
                setQuotaData(res.data);
            }
        } catch (e) {}
    };

    const loadEpisodesForSeason = async (mediaId: number, seasonNumber: number) => {
        if (seasonEpisodes[seasonNumber]) return;
        setLoadingEpisodes(true);
        try {
            const res = await getTvSeasonEpisodesAction(mediaId, seasonNumber);
            if (res.success && res.episodes) {
                setSeasonEpisodes(prev => ({ ...prev, [seasonNumber]: res.episodes }));
            }
        } catch (e) {} finally {
            setLoadingEpisodes(false);
        }
    };

    const handleSelectRecommendation = (rec: TmdbMediaItem) => {
        setCurrentId(rec.id);
        setCurrentType(rec.mediaType);
        setIsPlayingTrailer(false);
        setActiveTrailerIndex(0);
        setActiveTab("request");
        setSelectedEpisodeKeys([]);
        setEpisodeSuccessMsg(null);
        setEpisodeErrorMsg(null);
        loadMediaData(rec.id, rec.mediaType);
    };

    const handleSeasonTabChange = (seasonNum: number) => {
        setSelectedSeasonNumber(seasonNum);
        if (currentId) {
            loadEpisodesForSeason(currentId, seasonNum);
        }
    };

    const handleToggleSeasonSelect = (seasonNumber: number) => {
        if (selectedSeasons.includes(seasonNumber)) {
            const updated = selectedSeasons.filter(s => s !== seasonNumber);
            setSelectedSeasons(updated);
            setSelectAllSeasons(false);
        } else {
            const updated = [...selectedSeasons, seasonNumber];
            setSelectedSeasons(updated);
            if (details?.seasons && updated.length === details.seasons.filter(s => s.seasonNumber > 0).length) {
                setSelectAllSeasons(true);
            }
        }
    };

    const handleToggleAllSeasons = (checked: boolean) => {
        setSelectAllSeasons(checked);
        if (checked && details?.seasons) {
            setSelectedSeasons(details.seasons.filter(s => s.seasonNumber > 0).map(s => s.seasonNumber));
        } else {
            setSelectedSeasons([]);
        }
    };

    const handleSelectUnmonitoredSeasons = () => {
        if (!details?.seasons) return;
        const targetSeasons = is4k ? availability?.arrMonitoring?.seasons4k : availability?.arrMonitoring?.seasons1080p;
        const validSeasons = details.seasons.filter(s => s.seasonNumber > 0);
        
        const unmonitored = validSeasons
            .filter(s => {
                const mon = targetSeasons?.[s.seasonNumber];
                return !mon || !mon.isFullyMonitored;
            })
            .map(s => s.seasonNumber);

        setSelectedSeasons(unmonitored);
        setSelectAllSeasons(unmonitored.length === validSeasons.length);
    };

    // Episode Selection in Episode Guide
    const handleToggleEpisodeKey = (key: string) => {
        if (selectedEpisodeKeys.includes(key)) {
            setSelectedEpisodeKeys(prev => prev.filter(k => k !== key));
        } else {
            setSelectedEpisodeKeys(prev => [...prev, key]);
        }
    };

    const handleSelectAllUnmonitoredEpisodesInSeason = (seasonNum: number) => {
        const episodes = seasonEpisodes[seasonNum] || [];
        const epMonMap = is4k ? availability?.arrMonitoring?.episodes4k : availability?.arrMonitoring?.episodes1080p;
        
        const unmonitoredKeys: string[] = [];
        for (const ep of episodes) {
            const key = `s${seasonNum}e${ep.episodeNumber}`;
            const isMon = epMonMap?.[key]?.monitored;
            if (!isMon) {
                unmonitoredKeys.push(key);
            }
        }

        setSelectedEpisodeKeys(prev => {
            const set = new Set([...prev, ...unmonitoredKeys]);
            return Array.from(set);
        });
    };

    const handleClearEpisodeSelection = () => {
        setSelectedEpisodeKeys([]);
        setEpisodeSuccessMsg(null);
        setEpisodeErrorMsg(null);
    };

    const handleRequestSelectedEpisodes = async () => {
        if (!details || !currentId || selectedEpisodeKeys.length === 0) return;
        setSubmittingEpisodes(true);
        setEpisodeSuccessMsg(null);
        setEpisodeErrorMsg(null);

        try {
            const episodeObjects = selectedEpisodeKeys.map(k => {
                const match = k.match(/^s(\d+)e(\d+)$/);
                const sNum = match ? parseInt(match[1], 10) : 1;
                const eNum = match ? parseInt(match[2], 10) : 1;
                return {
                    seasonNumber: sNum,
                    episodeNumber: eNum
                };
            });

            const res = await requestTvEpisodesAction({
                tmdbId: currentId,
                tvdbId: details.tvdbId,
                imdbId: details.imdbId,
                title: details.title,
                releaseYear: details.releaseDate ? details.releaseDate.split("-")[0] : undefined,
                posterPath: details.posterPath || undefined,
                backdropPath: details.backdropPath || undefined,
                overview: details.overview,
                is4k,
                isKids: Boolean(isKids),
                contentRating: details.certification,
                episodes: episodeObjects
            });

            if (res.success) {
                setEpisodeSuccessMsg(res.message || `Requested ${selectedEpisodeKeys.length} episode(s)!`);
                setSelectedEpisodeKeys([]);
                if (res.arrMonitoring) {
                    setAvailability(prev => prev ? {
                        ...prev,
                        isRequested: true,
                        isMonitored: true,
                        isMonitored1080p: res.arrMonitoring?.isMonitored1080p,
                        isMonitored4k: res.arrMonitoring?.isMonitored4k,
                        hasFile1080p: res.arrMonitoring?.hasFile1080p,
                        hasFile4k: res.arrMonitoring?.hasFile4k,
                        arrMonitoring: res.arrMonitoring
                    } : prev);
                }
                loadQuota();
                if (onRequestSubmitted) onRequestSubmitted();
            } else {
                setEpisodeErrorMsg(res.error || "Failed to request episodes.");
            }
        } catch (e: any) {
            setEpisodeErrorMsg(e.message || "An unexpected error occurred.");
        } finally {
            setSubmittingEpisodes(false);
        }
    };

    const handleRequestSingleEpisode = async (seasonNum: number, episodeNum: number) => {
        if (!details || !currentId) return;
        setSubmittingEpisodes(true);
        setEpisodeSuccessMsg(null);
        setEpisodeErrorMsg(null);

        try {
            const res = await requestTvEpisodesAction({
                tmdbId: currentId,
                tvdbId: details.tvdbId,
                imdbId: details.imdbId,
                title: details.title,
                releaseYear: details.releaseDate ? details.releaseDate.split("-")[0] : undefined,
                posterPath: details.posterPath || undefined,
                backdropPath: details.backdropPath || undefined,
                overview: details.overview,
                is4k,
                isKids: Boolean(isKids),
                contentRating: details.certification,
                episodes: [{ seasonNumber: seasonNum, episodeNumber: episodeNum }]
            });

            if (res.success) {
                setEpisodeSuccessMsg(`Episode S${seasonNum}E${episodeNum} requested in Sonarr!`);
                if (res.arrMonitoring) {
                    setAvailability(prev => prev ? {
                        ...prev,
                        isRequested: true,
                        isMonitored: true,
                        isMonitored1080p: res.arrMonitoring?.isMonitored1080p,
                        isMonitored4k: res.arrMonitoring?.isMonitored4k,
                        hasFile1080p: res.arrMonitoring?.hasFile1080p,
                        hasFile4k: res.arrMonitoring?.hasFile4k,
                        arrMonitoring: res.arrMonitoring
                    } : prev);
                }
                loadQuota();
                if (onRequestSubmitted) onRequestSubmitted();
            } else {
                setEpisodeErrorMsg(res.error || "Failed to request episode.");
            }
        } catch (e: any) {
            setEpisodeErrorMsg(e.message || "An unexpected error occurred.");
        } finally {
            setSubmittingEpisodes(false);
        }
    };

    const handleSubmitRequest = async () => {
        if (!details || !currentId) return;
        if (isNc17OrDisallowedRating(details.certification)) {
            setRequestErrorMsg("NC-17 and adult-rated titles cannot be requested.");
            return;
        }
        setSubmitting(true);
        setRequestSuccessMsg(null);
        setRequestErrorMsg(null);

        try {
            const res = await submitMediaRequestAction({
                mediaType: currentType,
                tmdbId: currentId,
                tvdbId: details.tvdbId,
                imdbId: details.imdbId,
                title: details.title,
                releaseYear: details.releaseDate ? details.releaseDate.split("-")[0] : undefined,
                posterPath: details.posterPath || undefined,
                backdropPath: details.backdropPath || undefined,
                overview: details.overview,
                is4k,
                isKids: Boolean(isKids),
                contentRating: details.certification,
                seasons: currentType === "tv" ? (selectAllSeasons ? "all" : selectedSeasons) : undefined
            });

            if (res.success) {
                setRequestSuccessMsg(res.message || "Request submitted successfully!");
                setAvailability(prev => ({
                    inLibrary: prev?.inLibrary || false,
                    inMainLibraryOnly: false,
                    isRequested: true,
                    isMonitored: true,
                    requestStatus: res.request?.status || "APPROVED",
                    requestedBy: res.request?.requestedByUsername,
                    isMonitored1080p: is4k ? prev?.isMonitored1080p : true,
                    isMonitored4k: is4k ? true : prev?.isMonitored4k,
                    arrMonitoring: prev?.arrMonitoring
                }));
                loadQuota();
                if (onRequestSubmitted) onRequestSubmitted();
            } else {
                setRequestErrorMsg(res.error || "Failed to submit request.");
            }
        } catch (e: any) {
            setRequestErrorMsg(e.message || "An unexpected error occurred.");
        } finally {
            setSubmitting(false);
        }
    };

    if (!isOpen) return null;

    const releaseYear = details?.releaseDate ? details.releaseDate.split("-")[0] : "";
    const isTv = currentType === "tv";
    const rating = details?.voteAverage ? details.voteAverage.toFixed(1) : null;
    const trailers = details?.videos || [];

    const inLibrary = availability?.inLibrary;
    const inMainOnly = availability?.inMainLibraryOnly;
    const isRequested = availability?.isRequested;
    const quotaInfo = isTv ? quotaData?.tv : quotaData?.movies;

    const isDisallowed = Boolean(isNc17OrDisallowedRating(details?.certification));
    const isMatureInKids = Boolean(isKids && isAdultOrMatureRating(details?.certification));
    const isPgSafe = Boolean(isKids && isKidsSafeRating(details?.certification));
    const isPg13OrUnrated = Boolean(isKids && !isMatureInKids && !isPgSafe);

    // Arr monitoring breakdown
    const arrDetails = availability?.arrMonitoring;
    const is1080pMonitored = Boolean(availability?.isMonitored1080p || arrDetails?.isMonitored1080p);
    const is4kMonitored = Boolean(availability?.isMonitored4k || arrDetails?.isMonitored4k);
    const isCurrentQualityMonitored = is4k ? is4kMonitored : is1080pMonitored;
    const activeSeasonsMap = is4k ? arrDetails?.seasons4k : arrDetails?.seasons1080p;
    const activeEpisodesMap = is4k ? arrDetails?.episodes4k : arrDetails?.episodes1080p;

    // Check if all selected seasons are already monitored in active resolution
    const validSeasons = details?.seasons?.filter(s => s.seasonNumber > 0) || [];
    const allSelectedSeasonsMonitored = isTv && selectedSeasons.length > 0 && selectedSeasons.every(sNum => {
        const mon = activeSeasonsMap?.[sNum];
        return mon && mon.isFullyMonitored;
    });

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="w-[96vw] sm:w-[94vw] md:w-[92vw] max-w-6xl max-h-[94vh] bg-[#0c0c12] border-border/60 p-0 overflow-y-auto shadow-2xl rounded-2xl sm:rounded-3xl scrollbar-thin text-foreground">
                {loading || !details ? (
                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm font-semibold text-muted-foreground animate-pulse">
                            Loading metadata & Radarr/Sonarr monitoring status...
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col min-h-0">
                        {/* ========================================================================= */}
                        {/* HERO SECTION (Compact 2-Column or Seamless Inline Trailer Player)         */}
                        {/* ========================================================================= */}
                        {isPlayingTrailer && trailers.length > 0 ? (
                            /* INLINE TRAILER PLAYER VIEW */
                            <div className="relative w-full bg-black p-4 sm:p-5 border-b border-border/40 space-y-2.5">
                                <div className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        <div className="h-7 w-7 rounded-lg bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-500 shrink-0">
                                            <Play className="h-3.5 w-3.5 fill-current" />
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-sm font-bold text-white truncate">
                                                {trailers[activeTrailerIndex]?.name || "Official Trailer"}
                                            </div>
                                            <p className="text-[11px] text-muted-foreground truncate">
                                                {details.title} • YouTube HD
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setIsPlayingTrailer(false)}
                                        className="h-8 px-3 rounded-lg text-xs font-semibold bg-white/10 hover:bg-white/20 text-white border-white/20 flex items-center gap-1.5 shrink-0 transition-all active:scale-95"
                                    >
                                        <X className="h-4 w-4" />
                                        <span>Close Trailer</span>
                                    </Button>
                                </div>

                                {/* 16:9 Video Box */}
                                <div className="relative w-full aspect-video max-h-[55vh] rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10 mx-auto">
                                    <iframe
                                        key={trailers[activeTrailerIndex]?.key || activeTrailerIndex}
                                        src={`${trailers[activeTrailerIndex]?.embedUrl}?autoplay=1&rel=0&modestbranding=1`}
                                        title={trailers[activeTrailerIndex]?.name || "Trailer"}
                                        className="w-full h-full border-0"
                                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                        allowFullScreen
                                    />
                                </div>

                                {/* Trailer selector pills if multiple exist */}
                                {trailers.length > 1 && (
                                    <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-1 scrollbar-thin">
                                        <span className="text-[11px] font-semibold text-muted-foreground whitespace-nowrap mr-1">
                                            Trailers & Clips ({trailers.length}):
                                        </span>
                                        {trailers.map((vid, idx) => (
                                            <Button
                                                key={vid.id || idx}
                                                size="sm"
                                                variant={activeTrailerIndex === idx ? "default" : "outline"}
                                                className={`h-7 px-3 text-xs font-medium rounded-full shrink-0 transition-all ${
                                                    activeTrailerIndex === idx
                                                        ? "bg-red-600 hover:bg-red-500 text-white shadow-sm"
                                                        : "bg-white/[0.04] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground border-border/40"
                                                }`}
                                                onClick={() => setActiveTrailerIndex(idx)}
                                            >
                                                <Play className="h-2.5 w-2.5 mr-1 fill-current" />
                                                <span className="truncate max-w-[160px]">{vid.name}</span>
                                            </Button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* COMPACT 2-COLUMN HERO HEADER */
                            <div className="relative w-full bg-[#0e0e16] p-4 sm:p-5 md:p-6 border-b border-border/40 overflow-hidden">
                                {/* Ambient Blurred Backdrop Layer */}
                                {details.backdropPath && (
                                    <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                        <img
                                            src={details.backdropPath}
                                            alt=""
                                            className="w-full h-full object-cover object-center filter blur-xl scale-110 opacity-25"
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e16] via-[#0e0e16]/80 to-transparent" />
                                        <div className="absolute inset-0 bg-gradient-to-r from-[#0e0e16] via-[#0e0e16]/85 to-transparent" />
                                    </div>
                                )}

                                <div className="relative z-10 flex flex-col sm:flex-row gap-4 sm:gap-5 md:gap-6 items-start">
                                    {/* Left Column: 2:3 Vertical Poster Card */}
                                    <div className="w-28 sm:w-36 md:w-44 aspect-[2/3] rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl shrink-0 bg-[#14141c] mx-auto sm:mx-0 relative group">
                                        {details.posterPath ? (
                                            <img
                                                src={details.posterPath}
                                                alt={details.title}
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-muted/20">
                                                {isTv ? <Tv className="h-10 w-10 opacity-40" /> : <Film className="h-10 w-10 opacity-40" />}
                                            </div>
                                        )}
                                        {trailers.length > 0 && (
                                            <button
                                                onClick={() => setIsPlayingTrailer(true)}
                                                className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 text-white backdrop-blur-[2px]"
                                            >
                                                <div className="w-9 h-9 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                                                    <Play className="h-4 w-4 fill-current ml-0.5" />
                                                </div>
                                                <span className="text-[11px] font-bold">Watch Trailer</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Right Column: Title, Metadata, Actions, Synopsis */}
                                    <div className="space-y-2 flex-1 min-w-0">
                                        {/* Row 1: Badges & Arr Monitored Tags */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full backdrop-blur-md ${
                                                isTv ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                            }`}>
                                                {isTv ? "TV Series" : "Movie"}
                                            </Badge>

                                            {/* Monitoring Badges */}
                                            {is1080pMonitored && (
                                                <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border-blue-500/40 backdrop-blur-md flex items-center gap-1">
                                                    <Check className="h-3 w-3" />
                                                    <span>1080p Monitored</span>
                                                </Badge>
                                            )}

                                            {is4kMonitored && (
                                                <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/25 text-purple-300 border-purple-500/50 backdrop-blur-md flex items-center gap-1">
                                                    <Check className="h-3 w-3" />
                                                    <span>4K UHD Monitored</span>
                                                </Badge>
                                            )}

                                            {rating && Number(rating) > 0 && (
                                                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-bold backdrop-blur-md">
                                                    <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
                                                    <span>{rating}</span>
                                                </div>
                                            )}

                                            {details.certification && (
                                                <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase backdrop-blur-md border ${
                                                    isAdultOrMatureRating(details.certification)
                                                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                                        : isKidsSafeRating(details.certification)
                                                        ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                                        : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                                                }`}>
                                                    {details.certification}
                                                </span>
                                            )}

                                            {releaseYear && (
                                                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {releaseYear}
                                                </span>
                                            )}

                                            {details.runtime ? (
                                                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                                    <Clock3 className="h-3 w-3" />
                                                    {Math.floor(details.runtime / 60)}h {details.runtime % 60}m
                                                </span>
                                            ) : isTv && details.numberOfSeasons ? (
                                                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                                    <Layers className="h-3 w-3" />
                                                    {details.numberOfSeasons} Season{details.numberOfSeasons > 1 ? "s" : ""}
                                                </span>
                                            ) : null}
                                        </div>

                                        {/* Row 2: Title & Tagline */}
                                        <div>
                                            <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-tight">
                                                {details.title}
                                            </DialogTitle>
                                            {details.tagline && (
                                                <p className="text-xs sm:text-sm text-gray-400 italic mt-0.5">
                                                    "{details.tagline}"
                                                </p>
                                            )}
                                        </div>

                                        {/* Row 3: Genres */}
                                        {details.genres && details.genres.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5">
                                                {details.genres.map(g => (
                                                    <span key={g} className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[11px] font-medium text-gray-300">
                                                        {g}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Row 4: Action Buttons */}
                                        <div className="flex flex-wrap items-center gap-2 pt-1">
                                            {trailers.length > 0 && (
                                                <Button
                                                    size="sm"
                                                    className="h-8 sm:h-9 px-3.5 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 active:scale-95 transition-all flex items-center gap-1.5 text-xs"
                                                    onClick={() => setIsPlayingTrailer(true)}
                                                >
                                                    <Play className="h-3.5 w-3.5 fill-current" />
                                                    <span>Watch Trailer</span>
                                                </Button>
                                            )}

                                            {inLibrary ? (
                                                <div className="h-8 sm:h-9 px-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-1.5 text-xs font-bold">
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                                    <span>In {isKids ? "Kids " : ""}Library ({availability?.quality || "1080p"})</span>
                                                </div>
                                            ) : is1080pMonitored && is4kMonitored ? (
                                                <div className="h-8 sm:h-9 px-3 rounded-xl bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 flex items-center gap-1.5 text-xs font-bold">
                                                    <CheckCheck className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                                                    <span>Monitored (1080p & 4K UHD)</span>
                                                </div>
                                            ) : is1080pMonitored && !is4kMonitored ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="h-8 sm:h-9 px-3 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-300 flex items-center gap-1.5 text-xs font-bold">
                                                        <Clock className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                                                        <span>1080p Monitored</span>
                                                    </div>
                                                    {quotaData?.canRequest4k && (
                                                        <Button
                                                            size="sm"
                                                            className="h-8 sm:h-9 px-3.5 rounded-xl font-bold bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/20 active:scale-95 transition-all flex items-center gap-1.5 text-xs"
                                                            onClick={() => {
                                                                setIs4k(true);
                                                                setActiveTab("request");
                                                            }}
                                                        >
                                                            <Plus className="h-3.5 w-3.5" />
                                                            <span>Request 4K UHD</span>
                                                        </Button>
                                                    )}
                                                </div>
                                            ) : is4kMonitored && !is1080pMonitored ? (
                                                <div className="flex items-center gap-2">
                                                    <div className="h-8 sm:h-9 px-3 rounded-xl bg-purple-500/15 border border-purple-500/40 text-purple-300 flex items-center gap-1.5 text-xs font-bold">
                                                        <Clock className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                                                        <span>4K UHD Monitored</span>
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        className="h-8 sm:h-9 px-3.5 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 active:scale-95 transition-all flex items-center gap-1.5 text-xs"
                                                        onClick={() => {
                                                            setIs4k(false);
                                                            setActiveTab("request");
                                                        }}
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                        <span>Request 1080p</span>
                                                    </Button>
                                                </div>
                                            ) : inMainOnly ? (
                                                <div className="h-8 sm:h-9 px-3 rounded-xl bg-indigo-500/15 border border-indigo-500/40 text-indigo-300 flex items-center gap-1.5 text-xs font-bold">
                                                    <Info className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                                                    <span>In Main Library Only ({availability?.quality || "1080p"})</span>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="h-8 sm:h-9 px-4 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 active:scale-95 transition-all flex items-center gap-1.5 text-xs"
                                                    disabled={submitting}
                                                    onClick={() => {
                                                        if (isTv) {
                                                            setActiveTab("request");
                                                        } else {
                                                            handleSubmitRequest();
                                                        }
                                                    }}
                                                >
                                                    {submitting ? (
                                                        <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Plus className="h-3.5 w-3.5" />
                                                            <span>{isTv ? "Configure & Request" : "Request Movie"}</span>
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                        </div>

                                        {/* Row 5: Overview Synopsis */}
                                        <div className="pt-0.5">
                                            <p className="text-xs sm:text-sm text-gray-300 leading-relaxed line-clamp-3 md:line-clamp-4">
                                                {details.overview || "No overview available for this title."}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ========================================================================= */}
                        {/* NAVIGATION TABS BAR                                                      */}
                        {/* ========================================================================= */}
                        <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2 border-b border-border/40 overflow-x-auto bg-[#0d0d14] sticky top-0 z-20 scrollbar-none">
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setActiveTab("request")}
                                className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                                    activeTab === "request"
                                        ? "bg-primary text-primary-foreground shadow-sm"
                                        : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                                }`}
                            >
                                <Info className="h-3.5 w-3.5 mr-1.5" />
                                {isTv ? "Request & Seasons" : "Request & Details"}
                            </Button>

                            {isTv && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setActiveTab("episodes")}
                                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                                        activeTab === "episodes"
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                                    }`}
                                >
                                    <Tv2 className="h-3.5 w-3.5 mr-1.5" />
                                    Episode Guide & Monitoring
                                </Button>
                            )}

                            {details.cast && details.cast.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setActiveTab("cast")}
                                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                                        activeTab === "cast"
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                                    }`}
                                >
                                    <Users className="h-3.5 w-3.5 mr-1.5" />
                                    Cast & Crew ({details.cast.length})
                                </Button>
                            )}

                            {details.watchProviders?.stream && details.watchProviders.stream.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setActiveTab("providers")}
                                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                                        activeTab === "providers"
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                                    }`}
                                >
                                    <Clapperboard className="h-3.5 w-3.5 mr-1.5" />
                                    Where to Watch
                                </Button>
                            )}

                            {details.recommendations && details.recommendations.length > 0 && (
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setActiveTab("recommendations")}
                                    className={`h-8 px-3 rounded-lg text-xs font-semibold transition-all ${
                                        activeTab === "recommendations"
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                                    }`}
                                >
                                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                                    Similar Titles ({details.recommendations.length})
                                </Button>
                            )}
                        </div>

                        {/* ========================================================================= */}
                        {/* TAB BODY CONTENTS                                                         */}
                        {/* ========================================================================= */}
                        <div className="p-4 sm:p-5 md:p-6 space-y-4 flex-1">
                            {/* TAB 1: REQUEST & SEASONS */}
                            {activeTab === "request" && (
                                <div className="space-y-4">
                                    {/* Monitored Status Banners */}
                                    {is1080pMonitored && is4kMonitored ? (
                                        <div className="p-3.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-between gap-3 text-cyan-300">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 shrink-0">
                                                    <CheckCheck className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <h4 className="text-xs sm:text-sm font-bold text-cyan-200">
                                                        Fully Monitored in 1080p & 4K UHD
                                                    </h4>
                                                    <p className="text-[11px] text-cyan-300/80">
                                                        Actively monitored across {arrDetails?.app1080pName || "Radarr/Sonarr"} and {arrDetails?.app4kName || "4K Instance"}.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : is1080pMonitored && !is4kMonitored ? (
                                        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3 text-blue-300">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-300 shrink-0">
                                                    <Check className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <h4 className="text-xs sm:text-sm font-bold text-blue-200">
                                                        Monitored in 1080p ({arrDetails?.app1080pName || "Standard Instance"})
                                                    </h4>
                                                    <p className="text-[11px] text-blue-300/80">
                                                        This title is already monitored for 1080p. You can still request a dedicated 4K UHD version below!
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : is4kMonitored && !is1080pMonitored ? (
                                        <div className="p-3.5 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-between gap-3 text-purple-300">
                                            <div className="flex items-center gap-3">
                                                <div className="h-8 w-8 rounded-lg bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
                                                    <Check className="h-4 w-4" />
                                                </div>
                                                <div>
                                                    <h4 className="text-xs sm:text-sm font-bold text-purple-200">
                                                        Monitored in 4K UHD ({arrDetails?.app4kName || "4K Instance"})
                                                    </h4>
                                                    <p className="text-[11px] text-purple-300/80">
                                                        This title is already monitored for 4K. You can request a companion 1080p standard version below!
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ) : null}

                                    {/* Request Submission Card */}
                                    <div className="p-4 sm:p-5 rounded-2xl bg-[#121218] border border-border/60 space-y-3.5">
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                                <Plus className="h-4 w-4 text-primary" />
                                                {inMainOnly ? "Add to Kids Library" : "Configure Request & Quality"}
                                            </h4>
                                            
                                            {/* Account Tier & Quota Label */}
                                            <div className="flex items-center gap-2">
                                                {quotaData?.accountTier === "TRIAL" ? (
                                                    <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-amber-500/15 text-amber-300 border-amber-500/30">
                                                        Trial Account
                                                    </Badge>
                                                ) : quotaData?.accountTier === "FULL" ? (
                                                    <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-emerald-500/15 text-emerald-300 border-emerald-500/30">
                                                        Full Account
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="text-[10px] font-bold px-2 py-0.5 bg-blue-500/15 text-blue-300 border-blue-500/30">
                                                        Admin
                                                    </Badge>
                                                )}

                                                {quotaInfo && (
                                                    <span className="text-xs text-muted-foreground font-medium">
                                                        Quota: <strong className="text-foreground">{quotaInfo.remaining}</strong> of {quotaInfo.limit === 0 ? "Unlimited" : quotaInfo.limit}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* 4K UHD Quality Selection Toggle */}
                                        {quotaData?.canRequest4k && !isMatureInKids && !isDisallowed && (
                                            <div className="flex items-center justify-between p-2.5 rounded-xl bg-purple-500/10 border border-purple-500/30">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 border-purple-500/50">
                                                        4K UHD
                                                    </Badge>
                                                    <div>
                                                        <h5 className="text-xs font-bold text-foreground">
                                                            {is4kMonitored ? "4K UHD Version (Already Monitored in 4K Arr)" : "Request 4K Ultra HD Quality"}
                                                        </h5>
                                                        <p className="text-[11px] text-muted-foreground">
                                                            {is4k ? "Targeting 4K instance" : "Targeting 1080p standard instance"}
                                                        </p>
                                                    </div>
                                                </div>
                                                <Checkbox
                                                    checked={is4k}
                                                    onCheckedChange={(c) => setIs4k(Boolean(c))}
                                                />
                                            </div>
                                        )}

                                        {/* TV Show Season Selection Checklist */}
                                        {isTv && details.seasons && details.seasons.length > 0 && !isMatureInKids && !isDisallowed && (
                                            <div className="space-y-2.5 border-t border-border/40 pt-2.5">
                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                    <span className="text-xs font-semibold text-muted-foreground">
                                                        Select Seasons to Request ({is4k ? "4K UHD" : "1080p"}):
                                                    </span>
                                                    <div className="flex items-center gap-2">
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            className="h-6 px-2 text-[11px] rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground border-border/40"
                                                            onClick={handleSelectUnmonitoredSeasons}
                                                        >
                                                            <Filter className="h-3 w-3 mr-1" />
                                                            Select Unmonitored
                                                        </Button>
                                                        <div className="flex items-center gap-1.5">
                                                            <Checkbox
                                                                id="modal-select-all-seasons"
                                                                checked={selectAllSeasons}
                                                                onCheckedChange={(c) => handleToggleAllSeasons(Boolean(c))}
                                                            />
                                                            <label htmlFor="modal-select-all-seasons" className="text-xs font-medium cursor-pointer">
                                                                All Seasons
                                                            </label>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                                    {details.seasons.filter(s => s.seasonNumber > 0).map(s => {
                                                        const sNum = s.seasonNumber;
                                                        const seasonMon1080 = arrDetails?.seasons1080p?.[sNum];
                                                        const seasonMon4k = arrDetails?.seasons4k?.[sNum];
                                                        const activeMon = is4k ? seasonMon4k : seasonMon1080;
                                                        const isFullyMon = activeMon?.isFullyMonitored;
                                                        const isPartiallyMon = activeMon?.isPartiallyMonitored;
                                                        const isSelected = selectedSeasons.includes(sNum);

                                                        return (
                                                            <div
                                                                key={s.id}
                                                                onClick={() => handleToggleSeasonSelect(sNum)}
                                                                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-1.5 ${
                                                                    isSelected
                                                                        ? "bg-primary/15 border-primary/50 text-foreground shadow-sm"
                                                                        : isFullyMon
                                                                        ? "bg-emerald-500/10 border-emerald-500/30 text-foreground"
                                                                        : "bg-muted/10 border-border/40 text-muted-foreground hover:bg-muted/20"
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <Checkbox
                                                                            checked={isSelected}
                                                                            onCheckedChange={() => handleToggleSeasonSelect(sNum)}
                                                                        />
                                                                        <span className="text-xs font-bold text-white">{s.name}</span>
                                                                    </div>
                                                                    <span className="text-[10px] text-muted-foreground">{s.episodeCount} eps</span>
                                                                </div>

                                                                {/* Status indicators */}
                                                                <div className="flex flex-wrap items-center gap-1 pt-0.5">
                                                                    {isFullyMon ? (
                                                                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[9px] font-bold border border-emerald-500/40 flex items-center gap-0.5">
                                                                            <Check className="h-2.5 w-2.5" />
                                                                            {is4k ? "4K Monitored" : "1080p Monitored"}
                                                                        </span>
                                                                    ) : isPartiallyMon ? (
                                                                        <span className="px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold border border-amber-500/40">
                                                                            {activeMon.monitoredEpisodeCount}/{activeMon.episodeCount} eps
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-1.5 py-0.2 rounded bg-white/[0.05] text-gray-400 text-[9px] font-medium border border-white/10">
                                                                            Unmonitored
                                                                        </span>
                                                                    )}

                                                                    {!is4k && seasonMon4k?.isFullyMonitored && (
                                                                        <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[9px] font-bold border border-purple-500/40">
                                                                            4K
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {/* Feedback Messages */}
                                        {requestSuccessMsg && (
                                            <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                <span>{requestSuccessMsg}</span>
                                            </div>
                                        )}
                                        {requestErrorMsg && (
                                            <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-2">
                                                <AlertCircle className="h-4 w-4 shrink-0" />
                                                <span>{requestErrorMsg}</span>
                                            </div>
                                        )}

                                        {/* Primary Submit Button */}
                                        <Button
                                            size="lg"
                                            className="w-full h-10 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-95 flex items-center justify-center gap-2"
                                            disabled={submitting || isDisallowed || isMatureInKids || (isTv && selectedSeasons.length === 0)}
                                            onClick={handleSubmitRequest}
                                        >
                                            {submitting ? (
                                                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : isDisallowed ? (
                                                <>
                                                    <ShieldAlert className="h-4 w-4" />
                                                    <span>Restricted (NC-17 / Adult)</span>
                                                </>
                                            ) : isMatureInKids ? (
                                                <>
                                                    <ShieldAlert className="h-4 w-4" />
                                                    <span>Unavailable in Kids Mode</span>
                                                </>
                                            ) : !isTv && isCurrentQualityMonitored ? (
                                                <>
                                                    <RefreshCw className="h-4 w-4" />
                                                    <span>Re-Search {is4k ? "4K UHD" : "1080p"} Movie in Radarr</span>
                                                </>
                                            ) : isTv && allSelectedSeasonsMonitored ? (
                                                <>
                                                    <RefreshCw className="h-4 w-4" />
                                                    <span>Re-Search {selectedSeasons.length} Monitored Season(s) in Sonarr</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Plus className="h-4 w-4" />
                                                    <span>
                                                        Request {isTv ? `${selectedSeasons.length} Season(s)` : "Movie"} ({is4k ? "4K UHD" : "1080p"})
                                                    </span>
                                                </>
                                            )}
                                        </Button>
                                    </div>

                                    {/* Production Info & External Links */}
                                    <div className="p-3.5 rounded-xl bg-muted/20 border border-border/40 space-y-2.5">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Metadata & External Links
                                        </h4>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                                            <div>
                                                <div className="text-muted-foreground text-[11px]">Original Language</div>
                                                <div className="font-semibold text-foreground">English (US)</div>
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground text-[11px]">Status</div>
                                                <div className="font-semibold text-foreground">{details.status || "Released"}</div>
                                            </div>
                                            <div>
                                                <div className="text-muted-foreground text-[11px]">Release Date</div>
                                                <div className="font-semibold text-foreground">{details.releaseDate || "Unknown"}</div>
                                            </div>
                                            {details.imdbId && (
                                                <div>
                                                    <div className="text-muted-foreground text-[11px]">IMDb</div>
                                                    <a
                                                        href={`https://www.imdb.com/title/${details.imdbId}`}
                                                        target="_blank"
                                                        rel="noreferrer"
                                                        className="font-semibold text-primary hover:underline flex items-center gap-1"
                                                    >
                                                        {details.imdbId}
                                                        <ExternalLink className="h-3 w-3" />
                                                    </a>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* TAB 2: TV EPISODE GUIDE & PER-EPISODE MONITORING */}
                            {activeTab === "episodes" && isTv && details.seasons && (
                                <div className="space-y-3.5">
                                    {/* Season Selector Tabs with Monitored Status Dots */}
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
                                        {details.seasons.filter(s => s.seasonNumber > 0).map(s => {
                                            const mon = activeSeasonsMap?.[s.seasonNumber];
                                            const isFully = mon?.isFullyMonitored;
                                            const isPart = mon?.isPartiallyMonitored;

                                            return (
                                                <Button
                                                    key={s.id}
                                                    size="sm"
                                                    variant={selectedSeasonNumber === s.seasonNumber ? "default" : "outline"}
                                                    onClick={() => handleSeasonTabChange(s.seasonNumber)}
                                                    className={`h-8 px-3 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-1.5 ${
                                                        selectedSeasonNumber === s.seasonNumber
                                                            ? "bg-primary text-primary-foreground"
                                                            : "bg-muted/20 border-border/50 text-muted-foreground hover:text-foreground"
                                                    }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${
                                                        isFully ? "bg-emerald-400" : isPart ? "bg-amber-400" : "bg-gray-500"
                                                    }`} />
                                                    <span>{s.name} ({s.episodeCount} eps)</span>
                                                </Button>
                                            );
                                        })}
                                    </div>

                                    {/* Toolbar for Season: Quick Selection & Action Bar */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-[#121218] border border-border/40">
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs font-semibold text-muted-foreground">
                                                Season {selectedSeasonNumber} Episodes:
                                            </span>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 px-2.5 text-xs font-semibold rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-muted-foreground hover:text-foreground border-border/40"
                                                onClick={() => handleSelectAllUnmonitoredEpisodesInSeason(selectedSeasonNumber)}
                                            >
                                                <Filter className="h-3 w-3 mr-1" />
                                                Select Unmonitored
                                            </Button>
                                            {selectedEpisodeKeys.length > 0 && (
                                                <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    className="h-7 px-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
                                                    onClick={handleClearEpisodeSelection}
                                                >
                                                    Clear ({selectedEpisodeKeys.length})
                                                </Button>
                                            )}
                                        </div>

                                        {/* 4K vs 1080p target indicator */}
                                        <div className="flex items-center gap-2">
                                            {quotaData?.canRequest4k && (
                                                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-white/[0.04] border border-border/40 text-[11px]">
                                                    <span className="text-muted-foreground">Target:</span>
                                                    <span className={`font-bold ${is4k ? "text-purple-300" : "text-blue-300"}`}>
                                                        {is4k ? "4K UHD" : "1080p"}
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Multi-Episode Request Banner if items selected */}
                                    {selectedEpisodeKeys.length > 0 && (
                                        <div className="p-3 rounded-xl bg-primary/15 border border-primary/40 flex items-center justify-between gap-3 text-foreground animate-fadeIn">
                                            <div className="text-xs font-semibold">
                                                <strong className="text-primary-foreground">{selectedEpisodeKeys.length}</strong> episode(s) selected for {is4k ? "4K UHD" : "1080p"} download
                                            </div>
                                            <Button
                                                size="sm"
                                                className="h-8 px-4 font-bold bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg shadow-md"
                                                disabled={submittingEpisodes}
                                                onClick={handleRequestSelectedEpisodes}
                                            >
                                                {submittingEpisodes ? (
                                                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                                        <span>Request Selected Episodes</span>
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}

                                    {/* Episode Feedback */}
                                    {episodeSuccessMsg && (
                                        <div className="p-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2">
                                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                                            <span>{episodeSuccessMsg}</span>
                                        </div>
                                    )}
                                    {episodeErrorMsg && (
                                        <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-2">
                                            <AlertCircle className="h-4 w-4 shrink-0" />
                                            <span>{episodeErrorMsg}</span>
                                        </div>
                                    )}

                                    {/* Episodes List */}
                                    {loadingEpisodes ? (
                                        <div className="p-10 text-center space-y-2">
                                            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                                            <p className="text-xs text-muted-foreground animate-pulse">Loading Season {selectedSeasonNumber} episodes...</p>
                                        </div>
                                    ) : seasonEpisodes[selectedSeasonNumber] && seasonEpisodes[selectedSeasonNumber].length > 0 ? (
                                        <div className="space-y-2">
                                            {seasonEpisodes[selectedSeasonNumber].map(ep => {
                                                const key = `s${selectedSeasonNumber}e${ep.episodeNumber}`;
                                                const mon1080 = arrDetails?.episodes1080p?.[key];
                                                const mon4k = arrDetails?.episodes4k?.[key];
                                                const isSelected = selectedEpisodeKeys.includes(key);

                                                return (
                                                    <div
                                                        key={ep.id}
                                                        className={`p-2.5 rounded-xl border transition-colors flex flex-col sm:flex-row gap-3 items-start ${
                                                            isSelected
                                                                ? "bg-primary/10 border-primary/50"
                                                                : "bg-[#121218] border-border/40 hover:bg-muted/15"
                                                        }`}
                                                    >
                                                        {/* Checkbox for episode */}
                                                        <div className="pt-1">
                                                            <Checkbox
                                                                checked={isSelected}
                                                                onCheckedChange={() => handleToggleEpisodeKey(key)}
                                                            />
                                                        </div>

                                                        {ep.stillPath && (
                                                            <img
                                                                src={ep.stillPath}
                                                                alt={ep.name}
                                                                className="w-full sm:w-32 aspect-video rounded-lg object-cover shrink-0 bg-muted/20 border border-white/5"
                                                            />
                                                        )}

                                                        <div className="space-y-1 flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <div className="text-xs font-bold text-foreground">
                                                                    <span>{ep.episodeNumber}. {ep.name}</span>
                                                                    {ep.airDate && (
                                                                        <span className="text-[10px] text-muted-foreground ml-2 font-normal">
                                                                            ({ep.airDate})
                                                                        </span>
                                                                    )}
                                                                </div>

                                                                {/* Monitored Status Badges */}
                                                                <div className="flex items-center gap-1.5">
                                                                    {mon1080?.hasFile ? (
                                                                        <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 flex items-center gap-1">
                                                                            <CheckCircle2 className="h-3 w-3" />
                                                                            1080p Downloaded
                                                                        </span>
                                                                    ) : mon1080?.monitored ? (
                                                                        <span className="px-1.5 py-0.2 rounded bg-blue-500/20 text-blue-300 text-[10px] font-bold border border-blue-500/40 flex items-center gap-1">
                                                                            <Clock className="h-3 w-3" />
                                                                            1080p Monitored
                                                                        </span>
                                                                    ) : (
                                                                        <span className="px-1.5 py-0.2 rounded bg-white/[0.05] text-muted-foreground text-[10px] font-medium border border-white/10">
                                                                            1080p Unmonitored
                                                                        </span>
                                                                    )}

                                                                    {arrDetails?.isConfigured4k && (
                                                                        mon4k?.hasFile ? (
                                                                            <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/40 flex items-center gap-1">
                                                                                <CheckCircle2 className="h-3 w-3" />
                                                                                4K Downloaded
                                                                            </span>
                                                                        ) : mon4k?.monitored ? (
                                                                            <span className="px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold border border-purple-500/40 flex items-center gap-1">
                                                                                <Clock className="h-3 w-3" />
                                                                                4K Monitored
                                                                            </span>
                                                                        ) : (
                                                                            <span className="px-1.5 py-0.2 rounded bg-white/[0.05] text-muted-foreground text-[10px] font-medium border border-white/10">
                                                                                4K Unmonitored
                                                                            </span>
                                                                        )
                                                                    )}

                                                                    {/* 1-click Request Button for single episode */}
                                                                    {!(is4k ? mon4k?.monitored : mon1080?.monitored) && (
                                                                        <Button
                                                                            size="sm"
                                                                            variant="outline"
                                                                            className="h-6 px-2 text-[10px] font-bold rounded-md bg-primary/20 hover:bg-primary text-primary hover:text-primary-foreground border-primary/40 ml-1"
                                                                            disabled={submittingEpisodes}
                                                                            onClick={() => handleRequestSingleEpisode(selectedSeasonNumber, ep.episodeNumber)}
                                                                        >
                                                                            <Plus className="h-2.5 w-2.5 mr-0.5" />
                                                                            Request
                                                                        </Button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                                                                {ep.overview || "No episode description available."}
                                                            </p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="p-6 text-center text-xs text-muted-foreground">
                                            No episode details available for this season.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: CAST & CREW */}
                            {activeTab === "cast" && details.cast && (
                                <div className="space-y-3.5">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Top Cast Members
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                                        {details.cast.map(c => (
                                            <div key={c.id} className="p-2.5 rounded-xl bg-[#121218] border border-border/40 space-y-1.5 text-center">
                                                <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto rounded-full overflow-hidden border border-border/50 bg-muted/20 shadow-md">
                                                    {c.profilePath ? (
                                                        <img src={c.profilePath} alt={c.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                                            <UserIcon className="h-5 w-5 opacity-40" />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-xs font-bold text-foreground line-clamp-1">{c.name}</div>
                                                    {c.character && (
                                                        <div className="text-[10px] text-muted-foreground line-clamp-1">{c.character}</div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* TAB 4: WHERE TO WATCH */}
                            {activeTab === "providers" && details.watchProviders && (
                                <div className="space-y-4">
                                    {details.watchProviders.stream && details.watchProviders.stream.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                Subscription Streaming (US)
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {details.watchProviders.stream.map(p => (
                                                    <div key={p.providerId} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#121218] border border-border/40">
                                                        {p.logoPath && <img src={p.logoPath} alt={p.providerName} className="w-5 h-5 rounded-lg shadow" />}
                                                        <span className="text-xs font-semibold text-foreground">{p.providerName}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {details.watchProviders.rent && details.watchProviders.rent.length > 0 && (
                                        <div className="space-y-2">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                Digital Rental Options
                                            </h4>
                                            <div className="flex flex-wrap gap-2">
                                                {details.watchProviders.rent.map(p => (
                                                    <div key={p.providerId} className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#121218] border border-border/40">
                                                        {p.logoPath && <img src={p.logoPath} alt={p.providerName} className="w-5 h-5 rounded-lg shadow" />}
                                                        <span className="text-xs font-semibold text-foreground">{p.providerName}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 5: SIMILAR TITLES & RECOMMENDATIONS */}
                            {activeTab === "recommendations" && details.recommendations && (
                                <div className="space-y-3.5">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Titles You May Also Like
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                                        {details.recommendations.map(rec => (
                                            <div
                                                key={rec.id}
                                                onClick={() => handleSelectRecommendation(rec)}
                                                className="group cursor-pointer rounded-xl overflow-hidden bg-[#121218] border border-border/40 hover:border-primary/50 transition-all hover:scale-[1.02] shadow-lg"
                                            >
                                                <div className="aspect-[2/3] w-full bg-muted/20 overflow-hidden relative">
                                                    {rec.posterPath ? (
                                                        <img src={rec.posterPath} alt={rec.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                                            {rec.mediaType === "tv" ? <Tv className="h-8 w-8 opacity-40" /> : <Film className="h-8 w-8 opacity-40" />}
                                                        </div>
                                                    )}
                                                    {rec.voteAverage > 0 && (
                                                        <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-md bg-black/70 backdrop-blur-md text-amber-300 text-[10px] font-bold flex items-center gap-1 border border-white/10">
                                                            <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                                            <span>{rec.voteAverage.toFixed(1)}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="p-2 space-y-0.5">
                                                    <div className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                                                        {rec.title}
                                                    </div>
                                                    <div className="text-[10px] text-muted-foreground">
                                                        {rec.releaseDate ? rec.releaseDate.split("-")[0] : ""} • {rec.mediaType === "tv" ? "TV" : "Movie"}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
