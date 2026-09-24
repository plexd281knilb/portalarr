"use client";

import { useState, useEffect } from "react";
import { 
    getAllMediaRequestsAction, 
    getUserMediaRequestsAction, 
    approveMediaRequestAction, 
    declineMediaRequestAction, 
    retryMediaRequestAction, 
    deleteMediaRequestAction, 
    syncMediaRequestsQueueAndAvailabilityAction 
} from "@/app/seerr-actions";
import { BookDetailModal } from "@/components/seerr/book-detail-modal";
import { AuthorDetailModal } from "@/components/seerr/author-detail-modal";
import { SeriesDetailModal } from "@/components/seerr/series-detail-modal";
import { BookDiscoveryItem } from "@/lib/books/book-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
    Clock, 
    CheckCircle2, 
    Download, 
    AlertCircle, 
    Trash2, 
    RotateCcw, 
    Check, 
    X, 
    Search, 
    Film, 
    Tv, 
    Sparkles, 
    RefreshCw,
    Layers,
    User as UserIcon,
    BookOpen,
    Headphones,
    Send,
    ExternalLink
} from "lucide-react";

interface RequestManagerProps {
    isAdmin: boolean;
    onSelectMedia?: (tmdbId: number, mediaType: "movie" | "tv") => void;
}

export function RequestManager({ isAdmin, onSelectMedia }: RequestManagerProps) {
    const [requests, setRequests] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [mediaTypeFilter, setMediaTypeFilter] = useState("ALL");
    const [searchTerm, setSearchTerm] = useState("");
    const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

    // Book Detail Modal State
    const [selectedBook, setSelectedBook] = useState<BookDiscoveryItem | null>(null);
    const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
    const [selectedSeries, setSelectedSeries] = useState<{ title: string; author?: string } | null>(null);

    const loadRequests = async () => {
        setLoading(true);
        try {
            if (isAdmin) {
                const res = await getAllMediaRequestsAction({
                    limit: 500
                });
                if (res.success && res.data) setRequests(res.data);
            } else {
                const res = await getUserMediaRequestsAction();
                if (res.success && res.data) setRequests(res.data);
            }
        } catch (e) {} finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRequests();
    }, [isAdmin]);

    const handleSync = async () => {
        setSyncing(true);
        try {
            await syncMediaRequestsQueueAndAvailabilityAction();
            await loadRequests();
        } catch (e) {} finally {
            setSyncing(false);
        }
    };

    const handleApprove = async (id: string) => {
        setActionLoadingId(id);
        try {
            await approveMediaRequestAction(id);
            await loadRequests();
        } catch (e) {} finally {
            setActionLoadingId(null);
        }
    };

    const handleDecline = async (id: string) => {
        setActionLoadingId(id);
        try {
            await declineMediaRequestAction(id);
            await loadRequests();
        } catch (e) {} finally {
            setActionLoadingId(null);
        }
    };

    const handleRetry = async (id: string) => {
        setActionLoadingId(id);
        try {
            await retryMediaRequestAction(id);
            await loadRequests();
        } catch (e) {} finally {
            setActionLoadingId(null);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this media request?")) return;
        setActionLoadingId(id);
        try {
            await deleteMediaRequestAction(id);
            await loadRequests();
        } catch (e) {} finally {
            setActionLoadingId(null);
        }
    };

    const filteredRequests = requests.filter(req => {
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            const matchTitle = req.title?.toLowerCase().includes(term);
            const matchAuthor = req.bookAuthor?.toLowerCase().includes(term);
            const matchUser = req.requestedByUsername?.toLowerCase().includes(term);
            if (!matchTitle && !matchAuthor && !matchUser) return false;
        }
        if (mediaTypeFilter !== "ALL") {
            if (mediaTypeFilter === "movie" && req.mediaType !== "movie") return false;
            if (mediaTypeFilter === "tv" && req.mediaType !== "tv") return false;
            if (mediaTypeFilter === "book" && req.mediaType !== "book" && req.mediaType !== "ebook") return false;
            if (mediaTypeFilter === "audiobook" && req.mediaType !== "audiobook") return false;
        }
        if (statusFilter !== "ALL") {
            const s = (req.status || "").toUpperCase();
            if (statusFilter === "PROCESSING") {
                if (s !== "PROCESSING" && s !== "APPROVED" && s !== "SEARCHING" && s !== "DOWNLOADING") return false;
            } else if (statusFilter === "AVAILABLE") {
                if (s !== "AVAILABLE" && s !== "PARTIALLY_AVAILABLE" && s !== "DOWNLOADED") return false;
            } else if (statusFilter === "FAILED") {
                if (s !== "FAILED" && s !== "DECLINED" && s !== "REJECTED") return false;
            } else if (statusFilter === "PENDING") {
                if (s !== "PENDING") return false;
            } else if (s !== statusFilter.toUpperCase()) {
                return false;
            }
        }
        return true;
    });

    const counts = {
        all: requests.length,
        pending: requests.filter(r => (r.status || "").toUpperCase() === "PENDING").length,
        processing: requests.filter(r => {
            const s = (r.status || "").toUpperCase();
            return s === "PROCESSING" || s === "APPROVED" || s === "SEARCHING" || s === "DOWNLOADING";
        }).length,
        available: requests.filter(r => {
            const s = (r.status || "").toUpperCase();
            return s === "AVAILABLE" || s === "PARTIALLY_AVAILABLE" || s === "DOWNLOADED";
        }).length,
        failed: requests.filter(r => {
            const s = (r.status || "").toUpperCase();
            return s === "FAILED" || s === "DECLINED" || s === "REJECTED";
        }).length
    };

    return (
        <div className="space-y-4">
            {/* Header Controls & Filter Bar */}
            <div className="flex flex-col gap-3 p-4 rounded-2xl bg-[#121218] border border-border/50">
                {/* Media Type Tabs */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border/40">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                            size="sm"
                            variant={mediaTypeFilter === "ALL" ? "default" : "ghost"}
                            className="h-8 px-3 text-xs font-bold rounded-lg"
                            onClick={() => setMediaTypeFilter("ALL")}
                        >
                            All Media
                        </Button>
                        <Button
                            size="sm"
                            variant={mediaTypeFilter === "movie" ? "default" : "ghost"}
                            className="h-8 px-3 text-xs font-bold rounded-lg text-blue-300 hover:text-blue-200"
                            onClick={() => setMediaTypeFilter("movie")}
                        >
                            <Film className="h-3.5 w-3.5 mr-1 text-blue-400" />
                            Movies
                        </Button>
                        <Button
                            size="sm"
                            variant={mediaTypeFilter === "tv" ? "default" : "ghost"}
                            className="h-8 px-3 text-xs font-bold rounded-lg text-cyan-300 hover:text-cyan-200"
                            onClick={() => setMediaTypeFilter("tv")}
                        >
                            <Tv className="h-3.5 w-3.5 mr-1 text-cyan-400" />
                            TV Shows
                        </Button>
                        <Button
                            size="sm"
                            variant={mediaTypeFilter === "book" ? "default" : "ghost"}
                            className="h-8 px-3 text-xs font-bold rounded-lg text-purple-300 hover:text-purple-200"
                            onClick={() => setMediaTypeFilter("book")}
                        >
                            <BookOpen className="h-3.5 w-3.5 mr-1 text-purple-400" />
                            Ebooks
                        </Button>
                        <Button
                            size="sm"
                            variant={mediaTypeFilter === "audiobook" ? "default" : "ghost"}
                            className="h-8 px-3 text-xs font-bold rounded-lg text-amber-300 hover:text-amber-200"
                            onClick={() => setMediaTypeFilter("audiobook")}
                        >
                            <Headphones className="h-3.5 w-3.5 mr-1 text-amber-400" />
                            Audiobooks
                        </Button>
                    </div>

                    <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="relative flex-1 sm:w-56">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                            <Input
                                placeholder="Search requests..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="h-8 pl-8 text-xs bg-background/50 rounded-lg border-border/50"
                            />
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-8 px-2.5 text-xs font-semibold rounded-lg border-border/50 hover:bg-muted/40"
                            onClick={handleSync}
                            disabled={syncing}
                        >
                            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? "animate-spin text-primary" : ""}`} />
                            <span>Sync</span>
                        </Button>
                    </div>
                </div>

                {/* Status Filter Buttons */}
                <div className="flex flex-wrap items-center gap-1.5">
                    <Button
                        size="sm"
                        variant={statusFilter === "ALL" ? "default" : "outline"}
                        className="h-7 px-2.5 text-xs font-semibold rounded-lg"
                        onClick={() => setStatusFilter("ALL")}
                    >
                        All ({counts.all})
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === "PENDING" ? "default" : "outline"}
                        className={`h-7 px-2.5 text-xs font-semibold rounded-lg ${
                            statusFilter === "PENDING" ? "bg-amber-600 hover:bg-amber-500 text-white" : "border-amber-500/30 text-amber-300"
                        }`}
                        onClick={() => setStatusFilter("PENDING")}
                    >
                        Pending ({counts.pending})
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === "PROCESSING" ? "default" : "outline"}
                        className={`h-7 px-2.5 text-xs font-semibold rounded-lg ${
                            statusFilter === "PROCESSING" ? "bg-cyan-600 hover:bg-cyan-500 text-white" : "border-cyan-500/30 text-cyan-300"
                        }`}
                        onClick={() => setStatusFilter("PROCESSING")}
                    >
                        Processing ({counts.processing})
                    </Button>
                    <Button
                        size="sm"
                        variant={statusFilter === "AVAILABLE" ? "default" : "outline"}
                        className={`h-7 px-2.5 text-xs font-semibold rounded-lg ${
                            statusFilter === "AVAILABLE" ? "bg-emerald-600 hover:bg-emerald-500 text-white" : "border-emerald-500/30 text-emerald-300"
                        }`}
                        onClick={() => setStatusFilter("AVAILABLE")}
                    >
                        Available ({counts.available})
                    </Button>
                </div>
            </div>

            {/* Requests Grid */}
            {loading ? (
                <div className="p-16 text-center space-y-3">
                    <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-muted-foreground animate-pulse">Loading media requests...</p>
                </div>
            ) : filteredRequests.length === 0 ? (
                <div className="p-12 text-center rounded-2xl bg-[#121218]/60 border border-dashed border-border/50 space-y-2">
                    <Film className="h-8 w-8 mx-auto text-muted-foreground opacity-40" />
                    <h3 className="text-sm font-bold text-foreground">No Requests Found</h3>
                    <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                        There are currently no media requests matching your selected filters. Browse the discover catalog to request new titles!
                    </p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
                    {filteredRequests.map((req) => {
                        const isMovie = req.mediaType === "movie";
                        const isTv = req.mediaType === "tv";
                        const isBook = req.mediaType === "book" || req.mediaType === "ebook";
                        const isAudiobook = req.mediaType === "audiobook";
                        const isLoading = actionLoadingId === req.id;

                        const formatBadgeColor = isAudiobook
                            ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                            : isBook
                            ? "bg-purple-500/15 text-purple-300 border-purple-500/30"
                            : isTv
                            ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                            : "bg-blue-500/15 text-blue-300 border-blue-500/30";

                        const formatLabel = isAudiobook
                            ? "🎧 Audiobook"
                            : isBook
                            ? "📖 Ebook"
                            : isTv
                            ? "TV Series"
                            : "Movie";

                        return (
                            <div
                                key={req.id}
                                className="p-3.5 rounded-2xl bg-[#14141c] border border-border/40 hover:border-border/80 transition-all flex gap-3.5 items-start justify-between shadow-sm"
                            >
                                {/* Poster / Cover */}
                                <div 
                                    onClick={() => {
                                        if (isMovie || isTv) {
                                            if (onSelectMedia && req.tmdbId) onSelectMedia(req.tmdbId, req.mediaType);
                                        } else {
                                            setSelectedBook({
                                                title: req.title,
                                                author: req.bookAuthor || "Unknown Author",
                                                series: req.bookSeries || undefined,
                                                volumeNumber: req.bookVolume || undefined,
                                                coverUrl: req.posterPath || undefined,
                                                publishYear: req.releaseYear || undefined,
                                                mediaType: isAudiobook ? "audiobook" : "ebook",
                                                availability: {
                                                    status: req.status === "AVAILABLE" ? "AVAILABLE" : req.status === "PROCESSING" ? "DOWNLOADING" : "REQUESTED",
                                                    requestId: req.id
                                                }
                                            });
                                        }
                                    }}
                                    className="w-16 sm:w-20 aspect-[2/3] rounded-xl overflow-hidden bg-muted/20 shrink-0 border border-white/5 cursor-pointer hover:opacity-90 transition-opacity"
                                >
                                    {req.posterPath ? (
                                        <img src={req.posterPath} alt={req.title} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-muted-foreground bg-muted/40">
                                            {isAudiobook ? (
                                                <Headphones className="h-6 w-6 text-amber-400/40" />
                                            ) : isBook ? (
                                                <BookOpen className="h-6 w-6 text-purple-400/40" />
                                            ) : isTv ? (
                                                <Tv className="h-6 w-6 opacity-40" />
                                            ) : (
                                                <Film className="h-6 w-6 opacity-40" />
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Content Details */}
                                <div className="flex-1 min-w-0 space-y-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Badge variant="outline" className={`text-[9px] uppercase font-bold px-1.5 py-0.2 rounded ${formatBadgeColor}`}>
                                            {formatLabel}
                                        </Badge>
                                        {req.is4k && (
                                            <Badge variant="outline" className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300 border-purple-500/40">
                                                4K
                                            </Badge>
                                        )}
                                        {req.sendToKindle && isBook && (
                                            <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-purple-900/30 text-purple-300 border-purple-500/30 gap-1">
                                                <Send className="h-2.5 w-2.5" />
                                                <span>Kindle</span>
                                            </Badge>
                                        )}
                                        {req.releaseYear && (
                                            <span className="text-[11px] text-muted-foreground font-semibold">({req.releaseYear})</span>
                                        )}
                                    </div>

                                    {/* Title */}
                                    <h4 
                                        onClick={() => {
                                            if (isMovie || isTv) {
                                                if (onSelectMedia && req.tmdbId) onSelectMedia(req.tmdbId, req.mediaType);
                                            } else {
                                                setSelectedBook({
                                                    title: req.title,
                                                    author: req.bookAuthor || "Unknown Author",
                                                    series: req.bookSeries || undefined,
                                                    volumeNumber: req.bookVolume || undefined,
                                                    coverUrl: req.posterPath || undefined,
                                                    publishYear: req.releaseYear || undefined,
                                                    mediaType: isAudiobook ? "audiobook" : "ebook",
                                                    availability: {
                                                        status: (req.status === "AVAILABLE" || req.status === "Downloaded") ? "AVAILABLE" : (req.status === "PROCESSING" || req.status === "SEARCHING" || req.status === "DOWNLOADING") ? "DOWNLOADING" : "REQUESTED",
                                                        requestId: req.id
                                                    }
                                                });
                                            }
                                        }}
                                        className="text-sm font-bold text-foreground line-clamp-1 hover:text-primary cursor-pointer transition-colors"
                                    >
                                        {req.title}
                                    </h4>

                                    {/* Author & Series Subtitle (for books) */}
                                    {(isBook || isAudiobook) && req.bookAuthor && (
                                        <p className="text-xs text-muted-foreground line-clamp-1 font-medium">
                                            by {req.bookAuthor} {req.bookSeries ? `• Series: ${req.bookSeries}` : ""}
                                        </p>
                                    )}

                                    {/* Status Badge & Download Progress */}
                                    <div className="flex items-center gap-2">
                                        {req.status === "AVAILABLE" && (
                                            <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-400">
                                                <CheckCircle2 className="h-3.5 w-3.5" /> Available in {isBook || isAudiobook ? "Shelf" : "Plex"}
                                            </span>
                                        )}
                                        {(req.status === "PROCESSING" || req.status === "SEARCHING" || req.status === "DOWNLOADING") && (
                                            <div className="space-y-1 w-full max-w-xs">
                                                <div className="flex items-center justify-between text-[11px] font-bold text-cyan-300">
                                                    <span className="flex items-center gap-1">
                                                        <Download className="h-3.5 w-3.5 animate-pulse" /> Downloading
                                                    </span>
                                                    <span>{req.downloadProgress ? `${req.downloadProgress}%` : "Searching / Queued"}</span>
                                                </div>
                                                {req.downloadProgress ? (
                                                    <div className="w-full h-1.5 bg-muted/40 rounded-full overflow-hidden">
                                                        <div 
                                                            className="h-full bg-cyan-400 rounded-full transition-all duration-300"
                                                            style={{ width: `${req.downloadProgress}%` }}
                                                        />
                                                    </div>
                                                ) : null}
                                            </div>
                                        )}
                                        {req.status === "APPROVED" && (
                                            <span className="flex items-center gap-1 text-[11px] font-bold text-blue-400">
                                                <Clock className="h-3.5 w-3.5" /> Approved
                                            </span>
                                        )}
                                        {req.status === "PENDING" && (
                                            <span className="flex items-center gap-1 text-[11px] font-bold text-amber-400">
                                                <Clock className="h-3.5 w-3.5" /> Awaiting Approval
                                            </span>
                                        )}
                                        {(req.status === "FAILED" || req.status === "DECLINED") && (
                                            <span className="flex items-center gap-1 text-[11px] font-bold text-rose-400">
                                                <AlertCircle className="h-3.5 w-3.5" /> {req.status === "DECLINED" ? "Declined" : "Failed"}
                                            </span>
                                        )}
                                    </div>

                                    {/* Requester Attribution */}
                                    <div className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-0.5">
                                        <UserIcon className="h-3 w-3 opacity-60" />
                                        <span className="font-semibold text-foreground/80">{req.requestedByUsername}</span>
                                        {req.kindleEmail && isBook && (
                                            <span className="text-[10px] text-purple-300/80">({req.kindleEmail})</span>
                                        )}
                                        <span>•</span>
                                        <span>{new Date(req.createdAt).toLocaleDateString()}</span>
                                    </div>

                                    {req.errorMessage && (
                                        <p className="text-[10px] text-rose-400 line-clamp-1 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                                            {req.errorMessage}
                                        </p>
                                    )}
                                </div>

                                {/* Action Buttons */}
                                <div className="flex flex-col gap-1 shrink-0">
                                    {isAdmin && req.status === "PENDING" && (
                                        <>
                                            <Button
                                                size="icon"
                                                className="h-7 w-7 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm"
                                                onClick={() => handleApprove(req.id)}
                                                disabled={isLoading}
                                                title="Approve Request"
                                            >
                                                <Check className="h-3.5 w-3.5" />
                                            </Button>
                                            <Button
                                                size="icon"
                                                variant="outline"
                                                className="h-7 w-7 rounded-lg border-rose-500/40 text-rose-400 hover:bg-rose-500/20"
                                                onClick={() => handleDecline(req.id)}
                                                disabled={isLoading}
                                                title="Decline Request"
                                            >
                                                <X className="h-3.5 w-3.5" />
                                            </Button>
                                        </>
                                    )}

                                    {(req.status === "FAILED" || req.status === "DECLINED") && (
                                        <Button
                                            size="icon"
                                            variant="outline"
                                            className="h-7 w-7 rounded-lg border-cyan-500/40 text-cyan-400 hover:bg-cyan-500/20"
                                            onClick={() => handleRetry(req.id)}
                                            disabled={isLoading}
                                            title="Retry Dispatch"
                                        >
                                            <RotateCcw className="h-3.5 w-3.5" />
                                        </Button>
                                    )}

                                    {(isAdmin || req.status === "PENDING") && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-7 w-7 rounded-lg text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10"
                                            onClick={() => handleDelete(req.id)}
                                            disabled={isLoading}
                                            title="Delete Request"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Book Modals */}
            <BookDetailModal
                item={selectedBook}
                open={Boolean(selectedBook)}
                onOpenChange={(val) => { if (!val) setSelectedBook(null); }}
                onSelectAuthor={(name) => setSelectedAuthor(name)}
                onSelectSeries={(title, author) => setSelectedSeries({ title, author })}
                onRequestSuccess={loadRequests}
            />

            <AuthorDetailModal
                authorName={selectedAuthor}
                open={Boolean(selectedAuthor)}
                onOpenChange={(val) => { if (!val) setSelectedAuthor(null); }}
                onSelectBook={(b) => setSelectedBook(b)}
                onSelectSeries={(title, author) => setSelectedSeries({ title, author })}
            />

            <SeriesDetailModal
                seriesTitle={selectedSeries?.title || null}
                authorName={selectedSeries?.author}
                open={Boolean(selectedSeries)}
                onOpenChange={(val) => { if (!val) setSelectedSeries(null); }}
                onSelectVolume={(b) => setSelectedBook(b)}
                onSelectAuthor={(name) => setSelectedAuthor(name)}
            />
        </div>
    );
}
