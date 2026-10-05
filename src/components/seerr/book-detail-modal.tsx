"use client";

import { useState, useEffect, useRef } from "react";
import { BookDiscoveryItem } from "@/lib/books/book-types";
import { 
    submitBookOrAudiobookRequestAction, 
    getAccessibleBookLibrariesAction,
    getSimilarBooksAction
} from "@/app/book-actions";
import { 
    Dialog, 
    DialogContent, 
    DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
    BookOpen, 
    Headphones, 
    Star, 
    CheckCircle2, 
    Clock, 
    Download, 
    Send, 
    Layers, 
    User, 
    Loader2, 
    Sparkles, 
    AlertCircle, 
    ExternalLink,
    ArrowLeft,
    ChevronLeft,
    ChevronRight
} from "lucide-react";
import Link from "next/link";

interface BookDetailModalProps {
    item: BookDiscoveryItem | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectAuthor?: (authorName: string) => void;
    onSelectSeries?: (seriesTitle: string, authorName?: string) => void;
    onRequestSuccess?: () => void;
    isKids?: boolean;
}

export function BookDetailModal({
    item,
    open,
    onOpenChange,
    onSelectAuthor,
    onSelectSeries,
    onRequestSuccess,
    isKids = false
}: BookDetailModalProps) {
    const [activeBook, setActiveBook] = useState<BookDiscoveryItem | null>(item);
    const [history, setHistory] = useState<BookDiscoveryItem[]>([]);
    const [libraries, setLibraries] = useState<{ id: string; name: string; mediaType: string }[]>([]);
    const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");
    const [sendToKindle, setSendToKindle] = useState<boolean>(true);
    const [requesting, setRequesting] = useState<boolean>(false);
    const [requestMessage, setRequestMessage] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<string | null>(null);

    // Similar Books State
    const [similarBooks, setSimilarBooks] = useState<BookDiscoveryItem[]>([]);
    const [loadingSimilar, setLoadingSimilar] = useState(false);
    const similarCarouselRef = useRef<HTMLDivElement>(null);

    const scrollSimilar = (direction: "left" | "right") => {
        if (similarCarouselRef.current) {
            const offset = direction === "left" ? -240 : 240;
            similarCarouselRef.current.scrollBy({ left: offset, behavior: "smooth" });
        }
    };

    useEffect(() => {
        if (open && item) {
            setActiveBook(item);
            setHistory([]);
            setRequestMessage(null);
            setRequestError(null);
            loadLibraries(item.mediaType);
            loadSimilar(item);
        }
    }, [open, item]);

    const loadLibraries = async (mediaType: "ebook" | "audiobook") => {
        try {
            const res = await getAccessibleBookLibrariesAction(mediaType);
            if (res.success && res.libraries) {
                setLibraries(res.libraries);
                if (res.libraries.length > 0) {
                    setSelectedLibraryId(res.libraries[0].id);
                }
            }
        } catch (e) {}
    };

    const loadSimilar = async (book: BookDiscoveryItem) => {
        if (!book) return;
        setLoadingSimilar(true);
        try {
            const res = await getSimilarBooksAction({
                title: book.title,
                author: book.author,
                series: book.series,
                mediaType: book.mediaType
            });
            if (res.success && res.items) {
                setSimilarBooks(res.items);
            } else {
                setSimilarBooks([]);
            }
        } catch (e) {
            setSimilarBooks([]);
        } finally {
            setLoadingSimilar(false);
        }
    };

    const handleSelectSimilarBook = (sim: BookDiscoveryItem) => {
        if (!activeBook) return;
        setHistory(prev => [...prev, activeBook]);
        setActiveBook(sim);
        setRequestMessage(null);
        setRequestError(null);
        loadLibraries(sim.mediaType);
        loadSimilar(sim);
    };

    const handleGoBack = () => {
        if (history.length === 0) return;
        const prev = history[history.length - 1];
        setHistory(h => h.slice(0, -1));
        setActiveBook(prev);
        setRequestMessage(null);
        setRequestError(null);
        loadLibraries(prev.mediaType);
        loadSimilar(prev);
    };

    const handleRequest = async () => {
        if (!activeBook) return;
        setRequesting(true);
        setRequestError(null);
        setRequestMessage(null);

        try {
            const res = await submitBookOrAudiobookRequestAction({
                title: activeBook.title,
                author: activeBook.author,
                series: activeBook.series,
                volumeNumber: activeBook.volumeNumber,
                coverUrl: activeBook.coverUrl,
                publishYear: activeBook.publishYear,
                maturityRating: activeBook.maturityRating,
                ageRating: activeBook.ageRating,
                mediaType: activeBook.mediaType,
                libraryId: selectedLibraryId || undefined,
                sendToKindle: activeBook.mediaType !== "audiobook" && sendToKindle
            }, Boolean(isKids));

            if (res.success) {
                setRequestMessage(res.message || "Request submitted successfully!");
                setActiveBook(prev => prev ? {
                    ...prev,
                    availability: {
                        status: "REQUESTED",
                        requestId: res.requestId
                    }
                } : null);
                if (onRequestSuccess) onRequestSuccess();
            } else {
                setRequestError(res.error || "Failed to submit request.");
            }
        } catch (e: any) {
            setRequestError(e.message || "An unexpected error occurred.");
        } finally {
            setRequesting(false);
        }
    };

    if (!activeBook) return null;

    const isAudiobook = activeBook.mediaType === "audiobook";
    const status = activeBook.availability?.status || "NOT_AVAILABLE";

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[95vw] sm:w-[92vw] md:w-[90vw] max-w-3xl lg:max-w-4xl max-h-[90vh] sm:max-h-[92vh] bg-[#0c0c12] border border-border/60 shadow-2xl p-0 overflow-y-auto overflow-x-hidden sm:rounded-2xl scrollbar-thin text-foreground">
                <div className="flex flex-col min-h-0 min-w-0 w-full overflow-x-hidden">
                    {/* Header Background Banner */}
                    <div className="relative h-28 sm:h-36 w-full bg-gradient-to-r from-purple-950/60 via-indigo-950/40 to-background flex items-end p-4 sm:p-6 overflow-hidden border-b border-border/40 shrink-0">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />
                        
                        <div className="relative z-10 flex items-center justify-between w-full">
                            <div className="flex items-center gap-2">
                                {history.length > 0 && (
                                    <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={handleGoBack}
                                        className="h-7 px-2.5 text-xs font-semibold rounded-lg bg-black/40 border-white/20 text-foreground hover:bg-black/60 gap-1 backdrop-blur-md"
                                    >
                                        <ArrowLeft className="h-3 w-3" />
                                        <span>Back</span>
                                    </Button>
                                )}
                                <Badge 
                                    className={`text-xs font-bold px-3 py-1 border shadow-md backdrop-blur-md ${
                                        isAudiobook 
                                            ? "bg-amber-500/25 text-amber-300 border-amber-500/40" 
                                            : "bg-purple-500/25 text-purple-300 border-purple-500/40"
                                    }`}
                                >
                                    {isAudiobook ? "🎧 AUDIOBOOK" : "📖 EBOOK"}
                                </Badge>
                            </div>

                            {activeBook.publishYear && (
                                <span className="text-xs font-semibold text-muted-foreground bg-black/40 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md">
                                    {activeBook.publishYear}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Main Body */}
                    <div className="p-4 sm:p-6 space-y-5 -mt-12 relative z-20 min-w-0 w-full overflow-x-hidden">
                        <div className="flex flex-col sm:flex-row gap-5">
                            {/* 2:3 Vertical Cover Artwork */}
                        <div className="shrink-0 w-32 sm:w-40 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/15 bg-muted/60 relative mx-auto sm:mx-0">
                            {activeBook.coverUrl ? (
                                <img
                                    src={activeBook.coverUrl}
                                    alt={activeBook.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-muted/80 text-muted-foreground/60">
                                    {isAudiobook ? <Headphones className="h-10 w-10 text-amber-400/40" /> : <BookOpen className="h-10 w-10 text-purple-400/40" />}
                                    <span className="text-[10px] mt-2 font-medium line-clamp-2">{activeBook.title}</span>
                                </div>
                            )}
                        </div>

                        {/* Metadata Details */}
                        <div className="flex-1 space-y-2 text-center sm:text-left">
                            <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground leading-snug">
                                {activeBook.title}
                            </DialogTitle>

                            {/* Author Row */}
                            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-muted-foreground">
                                <span>by</span>
                                <button
                                    onClick={() => {
                                        if (onSelectAuthor && activeBook.author) {
                                            onOpenChange(false);
                                            onSelectAuthor(activeBook.author);
                                        }
                                    }}
                                    className="font-semibold text-foreground/90 hover:text-primary transition-colors inline-flex items-center gap-1 group"
                                >
                                    <span>{activeBook.author || "Unknown Author"}</span>
                                    <User className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                                </button>
                            </div>

                            {/* Series Tag */}
                            {activeBook.series && (
                                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                                    <button
                                        onClick={() => {
                                            if (onSelectSeries && activeBook.series) {
                                                onOpenChange(false);
                                                onSelectSeries(activeBook.series, activeBook.author);
                                            }
                                        }}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold transition-all group"
                                    >
                                        <Layers className="h-3.5 w-3.5" />
                                        <span>Series: {activeBook.series}</span>
                                        {activeBook.volumeNumber && (
                                            <Badge variant="secondary" className="bg-primary/20 text-[10px] px-1 py-0 font-bold ml-1">
                                                #{activeBook.volumeNumber}
                                            </Badge>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Badges Row: Format, Age Rating, Star Rating */}
                            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                                <Badge 
                                    variant="secondary" 
                                    className={`text-[10px] font-bold tracking-wider px-2 py-0.5 border shadow-sm ${
                                        isAudiobook 
                                            ? "bg-amber-500/25 text-amber-300 border-amber-500/40" 
                                            : "bg-purple-500/25 text-purple-300 border-purple-500/40"
                                    }`}
                                >
                                    {isAudiobook ? "🎧 AUDIOBOOK" : "📖 EBOOK"}
                                </Badge>

                                {activeBook.ageRating && (
                                    <Badge
                                        variant="outline"
                                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md border shadow-xs ${
                                            activeBook.ageRating === "Kids"
                                                ? "bg-emerald-500/25 text-emerald-300 border-emerald-500/40"
                                                : activeBook.ageRating === "YA (12+)"
                                                ? "bg-sky-500/25 text-sky-300 border-sky-500/40"
                                                : activeBook.ageRating === "18+ Mature"
                                                ? "bg-rose-500/25 text-rose-300 border-rose-500/40"
                                                : "bg-slate-900/80 text-slate-300 border-slate-700/60"
                                        }`}
                                    >
                                        {activeBook.ageRating}
                                    </Badge>
                                )}

                                {activeBook.rating && activeBook.rating > 0 && (
                                    <div className="flex items-center gap-1 text-amber-400 text-xs font-bold px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                                        <Star className="h-3.5 w-3.5 fill-amber-400" />
                                        <span>{activeBook.rating.toFixed(1)} / 5</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Overview / Description */}
                    {activeBook.overview && (
                        <div className="space-y-1 bg-muted/20 p-3.5 rounded-xl border border-border/30 text-xs sm:text-sm text-muted-foreground max-h-36 overflow-y-auto leading-relaxed min-w-0">
                            <p>{activeBook.overview}</p>
                        </div>
                    )}

                    {/* Kids Mode Warning for Mature Titles */}
                    {isKids && (activeBook.maturityRating === "MATURE" || activeBook.ageRating === "18+ Mature") && (
                        <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2.5">
                            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
                            <span>This title contains mature content and cannot be requested in Kids & Family mode.</span>
                        </div>
                    )}

                    {/* Request Options & Destination Selector */}
                    {status === "NOT_AVAILABLE" && !requestMessage && (
                        <div className="space-y-3 p-3.5 bg-muted/30 rounded-xl border border-border/50 min-w-0">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                                {/* Destination Library */}
                                <div className="space-y-1.5 min-w-0">
                                    <Label className="text-xs font-medium text-muted-foreground">Target Library Shelf</Label>
                                    <Select value={selectedLibraryId} onValueChange={setSelectedLibraryId}>
                                        <SelectTrigger className="h-9 text-xs bg-background/60 w-full min-w-0">
                                            <SelectValue placeholder="Select library shelf..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {libraries.map(lib => (
                                                <SelectItem key={lib.id} value={lib.id} className="text-xs">
                                                    {lib.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Send-to-Kindle Toggle (for Ebooks) */}
                                {!isAudiobook && (
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/40 min-w-0">
                                        <div className="space-y-0.5 min-w-0 pr-2">
                                            <Label htmlFor="send-kindle" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                                <Send className="h-3 w-3 text-purple-400 shrink-0" />
                                                <span className="truncate">Auto-Send to Kindle</span>
                                            </Label>
                                            <p className="text-[10px] text-muted-foreground truncate">Mails EPUB to your Kindle when ready</p>
                                        </div>
                                        <Switch 
                                            id="send-kindle"
                                            checked={sendToKindle}
                                            onCheckedChange={setSendToKindle}
                                            className="shrink-0"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Status Messages */}
                    {requestMessage && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium min-w-0">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{requestMessage}</span>
                        </div>
                    )}
                    {requestError && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-medium min-w-0">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{requestError}</span>
                        </div>
                    )}

                    {/* Action Buttons Row (Primary Action First on Left) */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-border/40 min-w-0">
                        <div className="flex items-center gap-2">
                            {status === "AVAILABLE" ? (
                                <Button asChild size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-md h-9 px-4">
                                    <Link href={activeBook?.mediaType === "audiobook" ? "/library?tab=audiobooks" : "/library?tab=ebooks"}>
                                        <BookOpen className="h-3.5 w-3.5" />
                                        <span>Open in Bookshelf</span>
                                        <ExternalLink className="h-3 w-3 opacity-60 ml-0.5" />
                                    </Link>
                                </Button>
                            ) : (status === "DOWNLOADING" || (requestMessage && status === "REQUESTED")) ? (
                                <Button size="sm" disabled className="bg-cyan-600/50 text-white text-xs gap-1.5 font-semibold h-9 px-4">
                                    <Download className="h-3.5 w-3.5 animate-pulse" />
                                    <span>Searching / Downloading Release...</span>
                                </Button>
                            ) : status === "REQUESTED" ? (
                                <Button size="sm" disabled className="bg-amber-600/50 text-white text-xs gap-1.5 font-semibold h-9 px-4">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>Request Pending</span>
                                </Button>
                            ) : isKids && (activeBook?.maturityRating === "MATURE" || activeBook?.ageRating === "18+ Mature") ? (
                                <Button size="sm" disabled className="bg-rose-950/40 text-rose-400 border border-rose-500/30 text-xs gap-1.5 font-semibold h-9 px-4 cursor-not-allowed">
                                    <AlertCircle className="h-3.5 w-3.5 text-rose-400" />
                                    <span>Mature Title (Restricted)</span>
                                </Button>
                            ) : (
                                <Button 
                                    size="sm" 
                                    onClick={handleRequest}
                                    disabled={requesting}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 shadow-lg shadow-primary/20 px-5 h-9 active:scale-95 transition-all"
                                >
                                    {requesting ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            <span>Submitting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-3.5 w-3.5" />
                                            <span>Request {isAudiobook ? "Audiobook" : "Ebook"}</span>
                                        </>
                                    )}
                                </Button>
                            )}
                        </div>

                        <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            className="text-xs text-muted-foreground hover:text-foreground h-9 px-3"
                        >
                            Close
                        </Button>
                    </div>

                    {/* SIMILAR BOOKS & RECOMMENDATIONS CAROUSEL */}
                    <div className="pt-4 border-t border-border/40 space-y-3 min-w-0 w-full overflow-hidden">
                        <div className="flex items-center justify-between gap-2 min-w-0">
                            <div className="flex items-center gap-2 min-w-0">
                                <Sparkles className="h-4 w-4 text-purple-400 shrink-0" />
                                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground truncate">
                                    Similar Books & Recommendations
                                </h4>
                                {similarBooks.length > 0 && (
                                    <Badge variant="outline" className="text-[10px] font-semibold text-muted-foreground border-white/10 shrink-0">
                                        {similarBooks.length} titles
                                    </Badge>
                                )}
                            </div>

                            {/* Carousel Navigation Buttons */}
                            {similarBooks.length > 0 && (
                                <div className="flex items-center gap-1 shrink-0">
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-6 w-6 rounded-lg bg-white/[0.04] border-border/40 text-muted-foreground hover:text-foreground"
                                        onClick={() => scrollSimilar("left")}
                                        title="Scroll left"
                                    >
                                        <ChevronLeft className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-6 w-6 rounded-lg bg-white/[0.04] border-border/40 text-muted-foreground hover:text-foreground"
                                        onClick={() => scrollSimilar("right")}
                                        title="Scroll right"
                                    >
                                        <ChevronRight className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            )}
                        </div>

                        {loadingSimilar ? (
                            <div className="flex gap-3 overflow-hidden py-1 w-full min-w-0">
                                {[...Array(5)].map((_, i) => (
                                    <div key={i} className="w-24 sm:w-28 shrink-0 space-y-2 animate-pulse min-w-0">
                                        <div className="aspect-[2/3] w-full rounded-xl bg-muted/40 border border-white/5" />
                                        <div className="h-3 w-3/4 bg-muted/40 rounded" />
                                        <div className="h-2.5 w-1/2 bg-muted/30 rounded" />
                                    </div>
                                ))}
                            </div>
                        ) : similarBooks.length === 0 ? (
                            <p className="text-xs text-muted-foreground/60 italic py-2">
                                No additional recommendations found for this title.
                            </p>
                        ) : (
                            <div 
                                ref={similarCarouselRef}
                                className="flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin scrollbar-thumb-muted-foreground/20 scrollbar-track-transparent scroll-smooth w-full min-w-0"
                            >
                                {similarBooks.map((sim, idx) => {
                                    const simIsAudio = sim.mediaType === "audiobook";
                                    const simStatus = sim.availability?.status;
                                    return (
                                        <div
                                            key={idx}
                                            onClick={() => handleSelectSimilarBook(sim)}
                                            className="w-24 sm:w-28 shrink-0 group cursor-pointer rounded-xl bg-[#121218] border border-border/40 hover:border-primary/60 transition-all hover:scale-[1.03] shadow-md p-1.5 flex flex-col justify-between min-w-0"
                                        >
                                            <div className="aspect-[2/3] w-full rounded-lg overflow-hidden bg-muted/30 relative border border-white/5">
                                                {sim.coverUrl ? (
                                                    <img
                                                        src={sim.coverUrl}
                                                        alt={sim.title}
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center text-muted-foreground">
                                                        {simIsAudio ? <Headphones className="h-5 w-5 text-amber-400/40" /> : <BookOpen className="h-5 w-5 text-purple-400/40" />}
                                                    </div>
                                                )}
                                                {sim.rating && sim.rating > 0 ? (
                                                    <div className="absolute top-1 right-1 px-1 py-0.5 rounded bg-black/75 backdrop-blur-md text-amber-300 text-[9px] font-bold flex items-center gap-0.5 border border-white/10">
                                                        <Star className="h-2 w-2 fill-amber-400 text-amber-400" />
                                                        <span>{sim.rating.toFixed(1)}</span>
                                                    </div>
                                                ) : null}
                                                {simStatus === "AVAILABLE" && (
                                                    <div className="absolute bottom-1 left-1 right-1 px-1 py-0.5 rounded bg-emerald-950/80 backdrop-blur-md text-emerald-300 text-[8px] font-bold text-center border border-emerald-500/30 flex items-center justify-center gap-0.5">
                                                        <CheckCircle2 className="h-2 w-2" /> Owned
                                                    </div>
                                                )}
                                                {simStatus === "DOWNLOADING" && (
                                                    <div className="absolute bottom-1 left-1 right-1 px-1 py-0.5 rounded bg-cyan-950/80 backdrop-blur-md text-cyan-300 text-[8px] font-bold text-center border border-cyan-500/30 flex items-center justify-center gap-0.5">
                                                        <Download className="h-2 w-2 animate-pulse" /> In Queue
                                                    </div>
                                                )}
                                                {simStatus === "REQUESTED" && (
                                                    <div className="absolute bottom-1 left-1 right-1 px-1 py-0.5 rounded bg-amber-950/80 backdrop-blur-md text-amber-300 text-[8px] font-bold text-center border border-amber-500/30 flex items-center justify-center gap-0.5">
                                                        <Clock className="h-2 w-2" /> Requested
                                                    </div>
                                                )}
                                            </div>
                                            <div className="pt-1.5 space-y-0.5 min-w-0">
                                                <h5 className="text-[11px] font-bold text-foreground line-clamp-2 group-hover:text-primary transition-colors leading-tight">
                                                    {sim.title}
                                                </h5>
                                                <p className="text-[9px] text-muted-foreground line-clamp-1">
                                                    {sim.author}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </DialogContent>
        </Dialog>
    );
}
