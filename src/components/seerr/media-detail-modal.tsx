"use client";

import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { 
    getMediaDetailsAction, 
    getTvSeasonEpisodesAction, 
    getUserRequestQuotaAction, 
    submitMediaRequestAction 
} from "@/app/seerr-actions";
import { TmdbMediaDetail, TmdbMediaItem, TmdbEpisodeInfo } from "@/lib/curation/tmdb";
import { MediaAvailabilityStatus } from "@/lib/seerr/availability";
import { TrailerModal } from "@/components/seerr/trailer-modal";
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
    Check
} from "lucide-react";

interface MediaDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    tmdbId: number | null;
    mediaType: "movie" | "tv";
    initialAvailability?: MediaAvailabilityStatus;
    onRequestSubmitted?: () => void;
}

export function MediaDetailModal({
    isOpen,
    onClose,
    tmdbId,
    mediaType,
    initialAvailability,
    onRequestSubmitted
}: MediaDetailModalProps) {
    const [loading, setLoading] = useState(false);
    const [details, setDetails] = useState<TmdbMediaDetail | null>(null);
    const [availability, setAvailability] = useState<MediaAvailabilityStatus | undefined>(initialAvailability);
    const [quotaData, setQuotaData] = useState<any>(null);
    
    // Request Form States
    const [is4k, setIs4k] = useState(false);
    const [selectedSeasons, setSelectedSeasons] = useState<number[]>([]);
    const [selectAllSeasons, setSelectAllSeasons] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [requestSuccessMsg, setRequestSuccessMsg] = useState<string | null>(null);
    const [requestErrorMsg, setRequestErrorMsg] = useState<string | null>(null);

    // Trailer modal state
    const [showTrailerModal, setShowTrailerModal] = useState(false);

    // Episodes accordion for TV shows
    const [expandedSeason, setExpandedSeason] = useState<number | null>(null);
    const [seasonEpisodes, setSeasonEpisodes] = useState<Record<number, TmdbEpisodeInfo[]>>({});
    const [loadingSeason, setLoadingSeason] = useState<number | null>(null);

    useEffect(() => {
        if (isOpen && tmdbId) {
            loadMediaData(tmdbId, mediaType);
            loadQuota();
        } else {
            setDetails(null);
            setRequestSuccessMsg(null);
            setRequestErrorMsg(null);
            setSelectedSeasons([]);
            setSelectAllSeasons(true);
            setSeasonEpisodes({});
            setExpandedSeason(null);
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

    const loadEpisodesForSeason = async (seasonNumber: number) => {
        if (seasonEpisodes[seasonNumber] || !tmdbId) return;
        setLoadingSeason(seasonNumber);
        try {
            const res = await getTvSeasonEpisodesAction(tmdbId, seasonNumber);
            if (res.success && res.episodes) {
                setSeasonEpisodes(prev => ({ ...prev, [seasonNumber]: res.episodes }));
            }
        } catch (e) {} finally {
            setLoadingSeason(null);
        }
    };

    const handleToggleSeasonExpand = (seasonNumber: number) => {
        if (expandedSeason === seasonNumber) {
            setExpandedSeason(null);
        } else {
            setExpandedSeason(seasonNumber);
            loadEpisodesForSeason(seasonNumber);
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
        if (!details || !tmdbId) return;
        setSubmitting(true);
        setRequestSuccessMsg(null);
        setRequestErrorMsg(null);

        try {
            const res = await submitMediaRequestAction({
                mediaType,
                tmdbId,
                tvdbId: details.tvdbId,
                imdbId: details.imdbId,
                title: details.title,
                releaseYear: details.releaseDate ? details.releaseDate.split("-")[0] : undefined,
                posterPath: details.posterPath || undefined,
                backdropPath: details.backdropPath || undefined,
                overview: details.overview,
                is4k,
                seasons: mediaType === "tv" ? (selectAllSeasons ? "all" : selectedSeasons) : undefined
            });

            if (res.success) {
                setRequestSuccessMsg(res.message || "Request submitted successfully!");
                // Update local availability status
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
    const isTv = mediaType === "tv";
    const rating = details?.voteAverage ? details.voteAverage.toFixed(1) : null;
    const trailers = details?.videos || [];

    const inLibrary = availability?.inLibrary;
    const isRequested = availability?.isRequested;
    const quotaInfo = isTv ? quotaData?.tv : quotaData?.movies;

    return (
        <>
            <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
                <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] bg-[#0d0d12] border-border/60 p-0 overflow-y-auto shadow-2xl rounded-2xl sm:rounded-3xl scrollbar-thin">
                    {loading || !details ? (
                        <div className="flex flex-col items-center justify-center p-16 space-y-4">
                            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                            <p className="text-sm font-semibold text-muted-foreground animate-pulse">
                                Loading metadata & library availability...
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Hero Banner with Backdrop & Overlay */}
                            <div className="relative w-full aspect-[21/9] min-h-[220px] sm:min-h-[300px] bg-[#121218] overflow-hidden">
                                {details.backdropPath ? (
                                    <img
                                        src={details.backdropPath}
                                        alt={details.title}
                                        className="w-full h-full object-cover object-center filter brightness-80"
                                    />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-r from-[#141420] to-[#0c0c12]" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-[#0d0d12] via-[#0d0d12]/60 to-transparent" />
                                <div className="absolute inset-0 bg-gradient-to-r from-[#0d0d12] via-[#0d0d12]/40 to-transparent" />

                                {/* Watch Trailer Action Button on Banner */}
                                {trailers.length > 0 && (
                                    <div className="absolute top-4 right-4 z-10">
                                        <Button
                                            size="sm"
                                            className="h-9 px-3.5 rounded-full font-semibold bg-red-600/90 hover:bg-red-500 text-white shadow-lg backdrop-blur-md transition-all active:scale-95 flex items-center gap-1.5"
                                            onClick={() => setShowTrailerModal(true)}
                                        >
                                            <Play className="h-3.5 w-3.5 fill-current" />
                                            <span>Watch Trailer</span>
                                        </Button>
                                    </div>
                                )}

                                {/* Bottom Title & Header Info */}
                                <div className="absolute bottom-4 left-4 right-4 sm:left-6 sm:right-6 flex items-end gap-4">
                                    {/* Poster thumbnail */}
                                    <div className="hidden sm:block w-28 md:w-32 aspect-[2/3] rounded-xl overflow-hidden border-2 border-white/10 shadow-2xl shrink-0 bg-[#14141c]">
                                        {details.posterPath ? (
                                            <img src={details.posterPath} alt={details.title} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center bg-muted/20">
                                                {isTv ? <Tv className="h-8 w-8 opacity-40" /> : <Film className="h-8 w-8 opacity-40" />}
                                            </div>
                                        )}
                                    </div>

                                    <div className="space-y-1.5 flex-1">
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
                                                <span className="px-1.5 py-0.5 rounded bg-muted/60 border border-border/50 text-[10px] font-semibold text-muted-foreground uppercase backdrop-blur-md">
                                                    {details.certification}
                                                </span>
                                            )}
                                            {releaseYear && (
                                                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {releaseYear}
                                                </span>
                                            )}
                                            {details.runtime && (
                                                <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                                                    <Clock3 className="h-3 w-3" />
                                                    {Math.floor(details.runtime / 60)}h {details.runtime % 60}m
                                                </span>
                                            )}
                                        </div>

                                        <DialogTitle className="text-xl sm:text-2xl md:text-3xl font-extrabold text-white tracking-tight leading-tight line-clamp-2">
                                            {details.title}
                                        </DialogTitle>

                                        {details.tagline && (
                                            <p className="text-xs sm:text-sm text-gray-300 italic line-clamp-1">
                                                "{details.tagline}"
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Main Content Body */}
                            <div className="p-4 sm:p-6 space-y-6">
                                {/* Status Alert or Request Banner */}
                                {inLibrary && (
                                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-emerald-400">
                                        <div className="flex items-center gap-2.5">
                                            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
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
                                        <div className="flex items-center gap-2.5">
                                            <Clock className="h-5 w-5 shrink-0 text-blue-400" />
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

                                {/* Genres Pills */}
                                {details.genres && details.genres.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {details.genres.map(g => (
                                            <span key={g} className="px-2.5 py-1 rounded-lg bg-muted/40 border border-border/40 text-xs font-medium text-foreground">
                                                {g}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Overview Synopsis */}
                                <div className="space-y-1.5">
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Overview</h4>
                                    <p className="text-sm text-gray-300 leading-relaxed">
                                        {details.overview || "No overview available for this title."}
                                    </p>
                                </div>

                                {/* Request Submission Panel (If not already in library) */}
                                {!inLibrary && !isRequested && (
                                    <div className="p-4 sm:p-5 rounded-2xl bg-[#121218] border border-border/60 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                                <Plus className="h-4 w-4 text-primary" />
                                                Submit Media Request
                                            </h4>
                                            {quotaInfo && (
                                                <span className="text-xs text-muted-foreground font-medium">
                                                    Quota: <strong className="text-foreground">{quotaInfo.remaining}</strong> of {quotaInfo.limit === 0 ? "Unlimited" : quotaInfo.limit} remaining
                                                </span>
                                            )}
                                        </div>

                                        {/* TV Show Season Selection */}
                                        {isTv && details.seasons && details.seasons.length > 0 && (
                                            <div className="space-y-3 border-t border-border/40 pt-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-semibold text-muted-foreground">Seasons to Request:</span>
                                                    <div className="flex items-center gap-2">
                                                        <Checkbox
                                                            id="select-all-seasons"
                                                            checked={selectAllSeasons}
                                                            onCheckedChange={(c) => handleToggleAllSeasons(Boolean(c))}
                                                        />
                                                        <label htmlFor="select-all-seasons" className="text-xs font-medium cursor-pointer">
                                                            All Seasons ({details.seasons.filter(s => s.seasonNumber > 0).length})
                                                        </label>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                    {details.seasons.filter(s => s.seasonNumber > 0).map(s => (
                                                        <div
                                                            key={s.id}
                                                            onClick={() => handleToggleSeasonSelect(s.seasonNumber)}
                                                            className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                                                                selectedSeasons.includes(s.seasonNumber)
                                                                    ? "bg-primary/10 border-primary/50 text-foreground"
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
                                                                    <div className="text-[10px] text-muted-foreground">{s.episodeCount} episodes</div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* 4K UHD Toggle Option (if allowed) */}
                                        {quotaData?.canRequest4k && (
                                            <div className="flex items-center justify-between p-3 rounded-xl bg-purple-500/10 border border-purple-500/30">
                                                <div className="flex items-center gap-2">
                                                    <Badge variant="outline" className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 border-purple-500/50">
                                                        4K UHD
                                                    </Badge>
                                                    <div>
                                                        <h5 className="text-xs font-bold text-foreground">Request 4K UHD Quality</h5>
                                                        <p className="text-[11px] text-muted-foreground">Routes to 4K Ultra HD download profile</p>
                                                    </div>
                                                </div>
                                                <Checkbox
                                                    checked={is4k}
                                                    onCheckedChange={(c) => setIs4k(Boolean(c))}
                                                />
                                            </div>
                                        )}

                                        {/* Status Feedback Messages */}
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

                                        {/* Submit Button */}
                                        <Button
                                            size="lg"
                                            className="w-full h-11 text-sm font-bold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                                            disabled={submitting || (isTv && selectedSeasons.length === 0)}
                                            onClick={handleSubmitRequest}
                                        >
                                            {submitting ? (
                                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            ) : (
                                                <>
                                                    <Plus className="h-4 w-4" />
                                                    <span>Request {isTv ? `${selectedSeasons.length} Season(s)` : "Movie"}</span>
                                                </>
                                            )}
                                        </Button>
                                    </div>
                                )}

                                {/* TV Show Season & Episode Breakdown */}
                                {isTv && details.seasons && details.seasons.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Season & Episode Guide
                                        </h4>
                                        <div className="space-y-2">
                                            {details.seasons.filter(s => s.seasonNumber > 0).map(s => (
                                                <div key={s.id} className="rounded-xl border border-border/40 bg-[#121218] overflow-hidden">
                                                    <button
                                                        onClick={() => handleToggleSeasonExpand(s.seasonNumber)}
                                                        className="w-full p-3.5 flex items-center justify-between text-left hover:bg-muted/20 transition-colors"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className="h-7 w-7 rounded-lg bg-cyan-500/15 text-cyan-400 border border-cyan-500/30 flex items-center justify-center text-xs font-bold">
                                                                S{s.seasonNumber}
                                                            </div>
                                                            <div>
                                                                <h5 className="text-sm font-bold text-foreground">{s.name}</h5>
                                                                <p className="text-xs text-muted-foreground">
                                                                    {s.episodeCount} Episodes • Air Date: {s.airDate || "TBA"}
                                                                </p>
                                                            </div>
                                                        </div>
                                                        {expandedSeason === s.seasonNumber ? (
                                                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                                        ) : (
                                                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                                        )}
                                                    </button>

                                                    {expandedSeason === s.seasonNumber && (
                                                        <div className="border-t border-border/30 p-3 space-y-2.5 bg-black/20">
                                                            {loadingSeason === s.seasonNumber ? (
                                                                <div className="p-4 text-center text-xs text-muted-foreground animate-pulse">
                                                                    Loading episodes...
                                                                </div>
                                                            ) : seasonEpisodes[s.seasonNumber] ? (
                                                                seasonEpisodes[s.seasonNumber].map(ep => (
                                                                    <div key={ep.id} className="flex gap-3 p-2 rounded-lg hover:bg-muted/20 transition-colors">
                                                                        {ep.stillPath && (
                                                                            <img
                                                                                src={ep.stillPath}
                                                                                alt={ep.name}
                                                                                className="w-24 aspect-video rounded-md object-cover shrink-0 bg-muted/20"
                                                                            />
                                                                        )}
                                                                        <div className="space-y-0.5 flex-1 min-w-0">
                                                                            <div className="flex items-center justify-between text-xs font-bold text-foreground">
                                                                                <span className="line-clamp-1">{ep.episodeNumber}. {ep.name}</span>
                                                                                {ep.airDate && <span className="text-[10px] text-muted-foreground shrink-0 ml-2">{ep.airDate}</span>}
                                                                            </div>
                                                                            <p className="text-[11px] text-gray-400 line-clamp-2 leading-relaxed">
                                                                                {ep.overview || "No episode description available."}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                ))
                                                            ) : (
                                                                <div className="p-4 text-center text-xs text-muted-foreground">
                                                                    No episode details available.
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Cast & Crew Carousel */}
                                {details.cast && details.cast.length > 0 && (
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Top Cast & Crew
                                        </h4>
                                        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
                                            {details.cast.map(c => (
                                                <div key={c.id} className="w-24 shrink-0 space-y-1.5 text-center">
                                                    <div className="w-20 h-20 mx-auto rounded-full overflow-hidden border border-border/40 bg-muted/20">
                                                        {c.profilePath ? (
                                                            <img src={c.profilePath} alt={c.name} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                                                                <UserIcon className="h-6 w-6 opacity-40" />
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="text-[11px] font-bold text-foreground line-clamp-1">{c.name}</div>
                                                    {c.character && (
                                                        <div className="text-[10px] text-muted-foreground line-clamp-1">{c.character}</div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Streaming Providers (US JustWatch) */}
                                {details.watchProviders?.stream && details.watchProviders.stream.length > 0 && (
                                    <div className="space-y-2">
                                        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                            Streaming On (US)
                                        </h4>
                                        <div className="flex flex-wrap gap-2">
                                            {details.watchProviders.stream.map(p => (
                                                <div key={p.providerId} className="flex items-center gap-2 px-2.5 py-1 rounded-xl bg-muted/30 border border-border/40">
                                                    {p.logoPath && <img src={p.logoPath} alt={p.providerName} className="w-5 h-5 rounded-md" />}
                                                    <span className="text-xs font-medium text-foreground">{p.providerName}</span>
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

            {/* Trailer Modal Player */}
            {details && (
                <TrailerModal
                    isOpen={showTrailerModal}
                    onClose={() => setShowTrailerModal(false)}
                    title={details.title}
                    videos={trailers}
                />
            )}
        </>
    );
}
