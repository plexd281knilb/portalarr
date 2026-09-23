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
    submitMediaRequestAction 
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
    ChevronDown,
    ChevronUp,
    ShieldAlert,
    ShieldCheck,
    X,
    ExternalLink,
    Info,
    Tv2,
    Users,
    Clapperboard
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

    // TV Episodes Guide State
    const [selectedSeasonNumber, setSelectedSeasonNumber] = useState<number>(1);
    const [seasonEpisodes, setSeasonEpisodes] = useState<Record<number, TmdbEpisodeInfo[]>>({});
    const [loadingEpisodes, setLoadingEpisodes] = useState(false);

    useEffect(() => {
        if (isOpen && tmdbId) {
            setCurrentId(tmdbId);
            setCurrentType(mediaType);
            setIsPlayingTrailer(false);
            setActiveTrailerIndex(0);
            setActiveTab("request");
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
        }
    }, [isOpen, tmdbId, mediaType]);

    const loadMediaData = async (id: number, type: "movie" | "tv") => {
        setLoading(true);
        setRequestSuccessMsg(null);
        setRequestErrorMsg(null);
        try {
            const res = await getMediaDetailsAction(id, type);
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
                setAvailability({
                    inLibrary: false,
                    isRequested: true,
                    requestStatus: res.request?.status || "APPROVED",
                    requestedBy: res.request?.requestedByUsername
                });
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
    const isRequested = availability?.isRequested;
    const quotaInfo = isTv ? quotaData?.tv : quotaData?.movies;

    const isDisallowed = Boolean(isNc17OrDisallowedRating(details?.certification));
    const isMatureInKids = Boolean(isKids && isAdultOrMatureRating(details?.certification));
    const isPgSafe = Boolean(isKids && isKidsSafeRating(details?.certification));
    const isPg13OrUnrated = Boolean(isKids && !isMatureInKids && !isPgSafe);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
            <DialogContent className="w-[95vw] sm:w-[92vw] max-w-5xl max-h-[92vh] bg-[#0c0c12] border-border/60 p-0 overflow-y-auto shadow-2xl rounded-2xl sm:rounded-3xl scrollbar-thin text-foreground">
                {loading || !details ? (
                    <div className="flex flex-col items-center justify-center p-20 space-y-4">
                        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                        <p className="text-sm font-semibold text-muted-foreground animate-pulse">
                            Loading metadata & library availability...
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col min-h-0">
                        {/* ========================================================================= */}
                        {/* HERO SECTION (Compact 2-Column or Seamless Inline Trailer Player)         */}
                        {/* ========================================================================= */}
                        {isPlayingTrailer && trailers.length > 0 ? (
                            /* INLINE TRAILER PLAYER VIEW */
                            <div className="relative w-full bg-black p-4 sm:p-6 border-b border-border/40 space-y-3">
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
                                                {details.title} • YouTube
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
                                <div className="relative w-full aspect-video rounded-xl sm:rounded-2xl overflow-hidden shadow-2xl bg-black border border-white/10">
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
                            /* COMPACT 2-COLUMN HERO HEADER (Zero Wasted Space) */
                            <div className="relative w-full bg-[#0e0e16] p-4 sm:p-6 md:p-7 border-b border-border/40 overflow-hidden">
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

                                <div className="relative z-10 flex flex-col sm:flex-row gap-5 md:gap-6 items-start">
                                    {/* Left Column: 2:3 Vertical Poster Card */}
                                    <div className="w-32 sm:w-40 md:w-48 aspect-[2/3] rounded-2xl overflow-hidden border-2 border-white/10 shadow-2xl shrink-0 bg-[#14141c] mx-auto sm:mx-0 relative group">
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
                                                <div className="w-10 h-10 rounded-full bg-red-600 flex items-center justify-center shadow-lg">
                                                    <Play className="h-5 w-5 fill-current ml-0.5" />
                                                </div>
                                                <span className="text-[11px] font-bold">Watch Trailer</span>
                                            </button>
                                        )}
                                    </div>

                                    {/* Right Column: Title, Metadata, Actions, Synopsis */}
                                    <div className="space-y-2.5 flex-1 min-w-0">
                                        {/* Row 1: Badges */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline" className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full backdrop-blur-md ${
                                                isTv ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40" : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                                            }`}>
                                                {isTv ? "TV Series" : "Movie"}
                                            </Badge>

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

                                            {details.status && (
                                                <Badge variant="outline" className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] text-muted-foreground border-border/40">
                                                    {details.status}
                                                </Badge>
                                            )}
                                        </div>

                                        {/* Row 2: Title */}
                                        <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-tight">
                                            {details.title}
                                        </DialogTitle>

                                        {/* Row 3: Tagline */}
                                        {details.tagline && (
                                            <p className="text-xs sm:text-sm text-gray-400 italic">
                                                "{details.tagline}"
                                            </p>
                                        )}

                                        {/* Row 4: Genres */}
                                        {details.genres && details.genres.length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-0.5">
                                                {details.genres.map(g => (
                                                    <span key={g} className="px-2 py-0.5 rounded-md bg-white/[0.05] border border-white/10 text-[11px] font-medium text-gray-300">
                                                        {g}
                                                    </span>
                                                ))}
                                            </div>
                                        )}

                                        {/* Row 5: Action Buttons */}
                                        <div className="flex flex-wrap items-center gap-2.5 pt-1.5">
                                            {trailers.length > 0 && (
                                                <Button
                                                    size="sm"
                                                    className="h-9 px-4 rounded-xl font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 active:scale-95 transition-all flex items-center gap-2"
                                                    onClick={() => setIsPlayingTrailer(true)}
                                                >
                                                    <Play className="h-3.5 w-3.5 fill-current" />
                                                    <span>Watch Trailer</span>
                                                </Button>
                                            )}

                                            {inLibrary ? (
                                                <div className="h-9 px-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-2 text-xs font-bold">
                                                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                                    <span>In Library ({availability?.quality || "1080p"})</span>
                                                </div>
                                            ) : isRequested ? (
                                                <div className="h-9 px-3.5 rounded-xl bg-blue-500/15 border border-blue-500/40 text-blue-300 flex items-center gap-2 text-xs font-bold">
                                                    <Clock className="h-4 w-4 text-blue-400 shrink-0" />
                                                    <span>{availability?.requestStatus === "PROCESSING" ? "Downloading" : "Requested"}</span>
                                                </div>
                                            ) : isDisallowed ? (
                                                <div className="h-9 px-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center gap-2 text-xs font-bold">
                                                    <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
                                                    <span>Restricted (NC-17)</span>
                                                </div>
                                            ) : isMatureInKids ? (
                                                <div className="h-9 px-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-center gap-2 text-xs font-bold">
                                                    <ShieldAlert className="h-4 w-4 text-rose-400 shrink-0" />
                                                    <span>Unavailable in Kids Mode</span>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    className="h-9 px-4 rounded-xl font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 active:scale-95 transition-all flex items-center gap-2"
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
                                                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                    ) : (
                                                        <>
                                                            <Plus className="h-4 w-4" />
                                                            <span>{isTv ? "Request Series" : "Request Movie"}</span>
                                                        </>
                                                    )}
                                                </Button>
                                            )}
                                        </div>

                                        {/* Row 6: Overview Synopsis */}
                                        <div className="pt-1">
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
                        <div className="flex items-center gap-1.5 px-4 sm:px-6 py-2.5 border-b border-border/40 overflow-x-auto bg-[#0d0d14] sticky top-0 z-20 scrollbar-none">
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
                                    Episode Guide
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
                        <div className="p-4 sm:p-6 space-y-6 flex-1">
                            {/* TAB 1: REQUEST & DETAILS */}
                            {activeTab === "request" && (
                                <div className="space-y-5">
                                    {/* Availability Status Banners */}
                                    {inLibrary && (
                                        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-emerald-400">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
                                                    <CheckCircle2 className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-emerald-300">Available in Plex Library</h4>
                                                    <p className="text-xs text-emerald-400/80">
                                                        Server: {availability?.plexServerName || "Plex Server"} • Quality: {availability?.quality || "1080p"}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {isRequested && !inLibrary && (
                                        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-between gap-3 text-blue-300">
                                            <div className="flex items-center gap-3">
                                                <div className="h-9 w-9 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
                                                    <Clock className="h-5 w-5" />
                                                </div>
                                                <div>
                                                    <h4 className="text-sm font-bold text-blue-200">
                                                        {availability?.requestStatus === "PROCESSING" ? "Downloading to Library" : "Request Approved"}
                                                    </h4>
                                                    <p className="text-xs text-blue-300/80">
                                                        Requested by: {availability?.requestedBy || "You"}
                                                        {availability?.downloadProgress ? ` • Progress: ${availability.downloadProgress}%` : ""}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Request Submission Form (If not in library & not requested) */}
                                    {!inLibrary && !isRequested && (
                                        <div className="p-4 sm:p-5 rounded-2xl bg-[#121218] border border-border/60 space-y-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                                    <Plus className="h-4 w-4 text-primary" />
                                                    Submit Media Request
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

                                            {/* Approval Status Callout */}
                                            {isDisallowed ? (
                                                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-start gap-2.5 text-xs">
                                                    <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                                                    <div>
                                                        <strong className="text-rose-200">Restricted Title:</strong> NC-17 and adult-rated titles cannot be requested.
                                                    </div>
                                                </div>
                                            ) : isMatureInKids ? (
                                                <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 flex items-start gap-2.5 text-xs">
                                                    <ShieldAlert className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
                                                    <div>
                                                        <strong className="text-rose-200">Blocked in Kids Mode:</strong> Rated {details.certification || "Mature"} — Contains mature themes. Switch to Main Discovery to request.
                                                    </div>
                                                </div>
                                            ) : isPgSafe ? (
                                                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 flex items-center gap-2 text-xs">
                                                    <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-400" />
                                                    <span><strong>Kids Auto-Approval:</strong> Rated {details.certification || "PG"} — Instant auto-approval into library download queue.</span>
                                                </div>
                                            ) : isPg13OrUnrated ? (
                                                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center gap-2 text-xs">
                                                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-400" />
                                                    <span><strong>Requires Admin Review:</strong> Rated {details.certification || "PG-13 / Unrated"} — Submitted for administrator approval before downloading.</span>
                                                </div>
                                            ) : quotaData?.accountTier === "TRIAL" ? (
                                                <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/40 text-amber-300 flex items-center gap-2 text-xs">
                                                    <Clock className="h-4 w-4 shrink-0 text-amber-400" />
                                                    <span><strong>Trial Account:</strong> Requests require administrator review before downloading.</span>
                                                </div>
                                            ) : (
                                                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 flex items-center gap-2 text-xs">
                                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                                    <span><strong>Instant Auto-Approval:</strong> Full Account requests are immediately dispatched to download clients.</span>
                                                </div>
                                            )}

                                            {/* TV Show Season Selection Checklist */}
                                            {isTv && details.seasons && details.seasons.length > 0 && !isMatureInKids && !isDisallowed && (
                                                <div className="space-y-3 border-t border-border/40 pt-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs font-semibold text-muted-foreground">Select Seasons to Download:</span>
                                                        <div className="flex items-center gap-2">
                                                            <Checkbox
                                                                id="modal-select-all-seasons"
                                                                checked={selectAllSeasons}
                                                                onCheckedChange={(c) => handleToggleAllSeasons(Boolean(c))}
                                                            />
                                                            <label htmlFor="modal-select-all-seasons" className="text-xs font-medium cursor-pointer">
                                                                All Seasons ({details.seasons.filter(s => s.seasonNumber > 0).length})
                                                            </label>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                                                        {details.seasons.filter(s => s.seasonNumber > 0).map(s => (
                                                            <div
                                                                key={s.id}
                                                                onClick={() => handleToggleSeasonSelect(s.seasonNumber)}
                                                                className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                                                    selectedSeasons.includes(s.seasonNumber)
                                                                        ? "bg-primary/15 border-primary/50 text-foreground shadow-sm"
                                                                        : "bg-muted/10 border-border/40 text-muted-foreground hover:bg-muted/20"
                                                                }`}
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <Checkbox
                                                                        checked={selectedSeasons.includes(s.seasonNumber)}
                                                                        onCheckedChange={() => handleToggleSeasonSelect(s.seasonNumber)}
                                                                    />
                                                                    <div>
                                                                        <div className="text-xs font-bold">{s.name}</div>
                                                                        <div className="text-[10px] text-muted-foreground">{s.episodeCount} eps</div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 4K UHD Quality Toggle Option */}
                                            {quotaData?.canRequest4k && !isMatureInKids && !isDisallowed && (
                                                <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 border-purple-500/50">
                                                            4K UHD
                                                        </Badge>
                                                        <div>
                                                            <h5 className="text-xs font-bold text-foreground">Request 4K Ultra HD Quality</h5>
                                                            <p className="text-[11px] text-muted-foreground">Dispatches to 4K quality profile instance</p>
                                                        </div>
                                                    </div>
                                                    <Checkbox
                                                        checked={is4k}
                                                        onCheckedChange={(c) => setIs4k(Boolean(c))}
                                                    />
                                                </div>
                                            )}

                                            {/* Feedback Messages */}
                                            {requestSuccessMsg && (
                                                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs font-medium flex items-center gap-2">
                                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                    <span>{requestSuccessMsg}</span>
                                                </div>
                                            )}
                                            {requestErrorMsg && (
                                                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 text-xs font-medium flex items-center gap-2">
                                                    <AlertCircle className="h-4 w-4 shrink-0" />
                                                    <span>{requestErrorMsg}</span>
                                                </div>
                                            )}

                                            {/* Primary Submit Button */}
                                            <Button
                                                size="lg"
                                                className="w-full h-11 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 transition-all active:scale-95 flex items-center justify-center gap-2"
                                                disabled={submitting || isDisallowed || isMatureInKids || (isTv && selectedSeasons.length === 0)}
                                                onClick={handleSubmitRequest}
                                            >
                                                {submitting ? (
                                                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
                                                ) : (
                                                    <>
                                                        <Plus className="h-4 w-4" />
                                                        <span>Request {isTv ? `${selectedSeasons.length} Season(s)` : "Movie"}</span>
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    )}

                                    {/* Production Info & External Links */}
                                    <div className="p-4 rounded-xl bg-muted/20 border border-border/40 space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Metadata & External Links
                                        </h4>
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
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

                            {/* TAB 2: TV EPISODE GUIDE */}
                            {activeTab === "episodes" && isTv && details.seasons && (
                                <div className="space-y-4">
                                    {/* Season Selector Tabs */}
                                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                        {details.seasons.filter(s => s.seasonNumber > 0).map(s => (
                                            <Button
                                                key={s.id}
                                                size="sm"
                                                variant={selectedSeasonNumber === s.seasonNumber ? "default" : "outline"}
                                                onClick={() => handleSeasonTabChange(s.seasonNumber)}
                                                className={`h-8 px-3 rounded-xl text-xs font-bold shrink-0 transition-all ${
                                                    selectedSeasonNumber === s.seasonNumber
                                                        ? "bg-primary text-primary-foreground"
                                                        : "bg-muted/20 border-border/50 text-muted-foreground hover:text-foreground"
                                                }`}
                                            >
                                                {s.name} ({s.episodeCount} eps)
                                            </Button>
                                        ))}
                                    </div>

                                    {/* Episodes List */}
                                    {loadingEpisodes ? (
                                        <div className="p-12 text-center space-y-2">
                                            <div className="w-7 h-7 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                                            <p className="text-xs text-muted-foreground animate-pulse">Loading Season {selectedSeasonNumber} episodes...</p>
                                        </div>
                                    ) : seasonEpisodes[selectedSeasonNumber] && seasonEpisodes[selectedSeasonNumber].length > 0 ? (
                                        <div className="space-y-2.5">
                                            {seasonEpisodes[selectedSeasonNumber].map(ep => (
                                                <div key={ep.id} className="p-3 rounded-xl border border-border/40 bg-[#121218] flex flex-col sm:flex-row gap-3 items-start hover:bg-muted/15 transition-colors">
                                                    {ep.stillPath && (
                                                        <img
                                                            src={ep.stillPath}
                                                            alt={ep.name}
                                                            className="w-full sm:w-36 aspect-video rounded-lg object-cover shrink-0 bg-muted/20 border border-white/5"
                                                        />
                                                    )}
                                                    <div className="space-y-1 flex-1 min-w-0">
                                                        <div className="flex items-center justify-between text-xs font-bold text-foreground">
                                                            <span className="line-clamp-1">{ep.episodeNumber}. {ep.name}</span>
                                                            {ep.airDate && <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{ep.airDate}</span>}
                                                        </div>
                                                        <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                                                            {ep.overview || "No episode description available."}
                                                        </p>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-8 text-center text-xs text-muted-foreground">
                                            No episode details available for this season.
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* TAB 3: CAST & CREW */}
                            {activeTab === "cast" && details.cast && (
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Top Cast Members
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                                        {details.cast.map(c => (
                                            <div key={c.id} className="p-3 rounded-xl bg-[#121218] border border-border/40 space-y-2 text-center">
                                                <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-full overflow-hidden border border-border/50 bg-muted/20 shadow-md">
                                                    {c.profilePath ? (
                                                        <img src={c.profilePath} alt={c.name} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                                            <UserIcon className="h-6 w-6 opacity-40" />
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
                                <div className="space-y-5">
                                    {details.watchProviders.stream && details.watchProviders.stream.length > 0 && (
                                        <div className="space-y-2.5">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                Subscription Streaming (US)
                                            </h4>
                                            <div className="flex flex-wrap gap-2.5">
                                                {details.watchProviders.stream.map(p => (
                                                    <div key={p.providerId} className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#121218] border border-border/40">
                                                        {p.logoPath && <img src={p.logoPath} alt={p.providerName} className="w-6 h-6 rounded-lg shadow" />}
                                                        <span className="text-xs font-semibold text-foreground">{p.providerName}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {details.watchProviders.rent && details.watchProviders.rent.length > 0 && (
                                        <div className="space-y-2.5">
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                                Digital Rental Options
                                            </h4>
                                            <div className="flex flex-wrap gap-2.5">
                                                {details.watchProviders.rent.map(p => (
                                                    <div key={p.providerId} className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#121218] border border-border/40">
                                                        {p.logoPath && <img src={p.logoPath} alt={p.providerName} className="w-6 h-6 rounded-lg shadow" />}
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
                                <div className="space-y-4">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                        Titles You May Also Like
                                    </h4>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
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
                                                        {rec.releaseDate ? rec.releaseDate.split("-")[0] : ""} • {rec.mediaType === "tv" ? "TV Series" : "Movie"}
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
