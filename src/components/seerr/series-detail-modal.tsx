"use client";

import { useState, useEffect } from "react";
import { BookSeriesDetail, SeriesVolumeItem, BookDiscoveryItem } from "@/lib/books/book-types";
import { 
    getBookSeriesDetailsAction, 
    requestCompleteSeriesAction,
    toggleMonitorBookSeriesAction 
} from "@/app/book-actions";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
    DialogTitle 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { 
    Layers, 
    User, 
    BookOpen, 
    Headphones, 
    CheckCircle2, 
    Clock, 
    Download, 
    Plus, 
    Sparkles, 
    Loader2, 
    Radio,
    AlertCircle
} from "lucide-react";

interface SeriesDetailModalProps {
    seriesTitle: string | null;
    authorName?: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectVolume?: (item: BookDiscoveryItem) => void;
    onSelectAuthor?: (authorName: string) => void;
}

export function SeriesDetailModal({
    seriesTitle,
    authorName,
    open,
    onOpenChange,
    onSelectVolume,
    onSelectAuthor
}: SeriesDetailModalProps) {
    const [series, setSeries] = useState<BookSeriesDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [monitored, setMonitored] = useState(false);
    const [requestingAll, setRequestingAll] = useState(false);
    const [batchMessage, setBatchMessage] = useState<string | null>(null);
    const [batchError, setBatchError] = useState<string | null>(null);

    useEffect(() => {
        if (open && seriesTitle) {
            setBatchMessage(null);
            setBatchError(null);
            loadSeries(seriesTitle, authorName);
        }
    }, [open, seriesTitle, authorName]);

    const loadSeries = async (title: string, author?: string) => {
        setLoading(true);
        try {
            const res = await getBookSeriesDetailsAction(title, author);
            if (res.success && res.series) {
                setSeries(res.series);
                setMonitored(Boolean(res.series.monitored));
            }
        } catch (e) {} finally {
            setLoading(false);
        }
    };

    const handleToggleMonitor = async (val: boolean) => {
        if (!series?.id) return;
        setMonitored(val);
        await toggleMonitorBookSeriesAction(series.id, val);
    };

    const handleRequestAllMissing = async () => {
        if (!seriesTitle || !authorName) return;
        setRequestingAll(true);
        setBatchMessage(null);
        setBatchError(null);

        try {
            const res = await requestCompleteSeriesAction(seriesTitle, authorName, "ebook");
            if (res.success) {
                setBatchMessage(res.message || `Successfully requested missing volumes!`);
                await loadSeries(seriesTitle, authorName);
            } else {
                setBatchError(res.error || "Failed to batch request series.");
            }
        } catch (e: any) {
            setBatchError(e.message || "An error occurred.");
        } finally {
            setRequestingAll(false);
        }
    };

    if (!seriesTitle) return null;

    const ownedCount = series?.volumes?.filter(v => v.status === "AVAILABLE").length || 0;
    const missingCount = series?.volumes?.filter(v => v.status === "MISSING").length || 0;
    const totalCount = series?.volumes?.length || 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl p-0 overflow-hidden sm:rounded-2xl max-h-[90vh] flex flex-col">
                {/* Header Banner */}
                <div className="relative h-28 sm:h-36 w-full bg-gradient-to-r from-indigo-950/80 via-purple-950/60 to-background flex items-end p-4 sm:p-6 overflow-hidden border-b border-border/40 shrink-0">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-indigo-500/20 via-transparent to-transparent" />
                </div>

                {/* Series Info Bar */}
                <div className="px-4 sm:px-6 -mt-14 relative z-20 shrink-0 space-y-4">
                    <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4">
                        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-left">
                            {/* Series Cover Artwork */}
                            <div className="w-24 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border-2 border-white/20 bg-muted/80 shrink-0 relative">
                                {series?.coverUrl ? (
                                    <img
                                        src={series.coverUrl}
                                        alt={series.title}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-gradient-to-tr from-indigo-900/40 to-purple-900/40 text-indigo-300">
                                        <Layers className="h-8 w-8 opacity-60" />
                                        <span className="text-[10px] mt-1 font-semibold">{series?.title || seriesTitle}</span>
                                    </div>
                                )}
                            </div>

                            {/* Title & Author */}
                            <div className="space-y-1">
                                <DialogTitle className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                                    {series?.title || seriesTitle}
                                </DialogTitle>

                                <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-muted-foreground">
                                    <span>Series by</span>
                                    <button
                                        onClick={() => {
                                            if (onSelectAuthor && (series?.authorName || authorName)) {
                                                onOpenChange(false);
                                                onSelectAuthor(series?.authorName || authorName || "");
                                            }
                                        }}
                                        className="font-semibold text-foreground/90 hover:text-primary transition-colors inline-flex items-center gap-1 group"
                                    >
                                        <span>{series?.authorName || authorName || "Unknown Author"}</span>
                                        <User className="h-3 w-3 opacity-60 group-hover:opacity-100" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Top Controls: 1-Click Grab Missing + Monitor Toggle */}
                        <div className="flex flex-wrap items-center justify-center sm:justify-end gap-2.5">
                            {missingCount > 0 && (
                                <Button
                                    size="sm"
                                    onClick={handleRequestAllMissing}
                                    disabled={requestingAll || Boolean(batchMessage)}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs h-9 gap-1.5 shadow-md"
                                >
                                    {requestingAll ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            <span>Requesting...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-3.5 w-3.5" />
                                            <span>Grab {missingCount} Missing Books</span>
                                        </>
                                    )}
                                </Button>
                            )}

                            <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/50 text-xs shadow-sm">
                                <Radio className={`h-3.5 w-3.5 ${monitored ? "text-emerald-400 animate-pulse" : "text-muted-foreground"}`} />
                                <span className="font-medium text-foreground">Monitor Series</span>
                                <Switch
                                    checked={monitored}
                                    onCheckedChange={handleToggleMonitor}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Progress Breakdown */}
                    <div className="flex items-center justify-between p-3 rounded-xl bg-muted/30 border border-border/40 text-xs">
                        <span className="font-semibold text-muted-foreground">
                            Completion: <strong className="text-foreground">{ownedCount} of {totalCount}</strong> volumes owned
                        </span>
                        <div className="flex items-center gap-2">
                            <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px]">
                                {ownedCount} Owned
                            </Badge>
                            {missingCount > 0 && (
                                <Badge variant="secondary" className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px]">
                                    {missingCount} Missing
                                </Badge>
                            )}
                        </div>
                    </div>

                    {/* Status Messages */}
                    {batchMessage && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{batchMessage}</span>
                        </div>
                    )}
                    {batchError && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-medium">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{batchError}</span>
                        </div>
                    )}
                </div>

                {/* Volumes List */}
                <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3">
                    <h4 className="text-xs font-bold text-muted-foreground tracking-wider uppercase">
                        Series Chronology ({totalCount} Volumes)
                    </h4>

                    {loading ? (
                        <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-xs">Loading series volumes & bibliography...</span>
                        </div>
                    ) : series?.volumes && series.volumes.length > 0 ? (
                        <div className="space-y-2">
                            {series.volumes.map((vol, idx) => (
                                <div
                                    key={idx}
                                    onClick={() => {
                                        if (onSelectVolume) {
                                            onSelectVolume({
                                                title: vol.title,
                                                author: vol.author || authorName || "",
                                                series: seriesTitle,
                                                volumeNumber: vol.volumeNumber,
                                                coverUrl: vol.coverUrl,
                                                publishYear: vol.publishYear,
                                                overview: vol.overview,
                                                mediaType: vol.mediaType,
                                                availability: {
                                                    status: vol.status === "MISSING" ? "NOT_AVAILABLE" : vol.status,
                                                    bookId: vol.bookId,
                                                    requestId: vol.requestId,
                                                    libraryId: vol.libraryId
                                                }
                                            });
                                        }
                                    }}
                                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-card/60 border border-border/40 hover:border-primary/50 transition-all cursor-pointer group shadow-sm"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        {/* Volume Number Badge */}
                                        <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-xs text-primary shrink-0">
                                            #{vol.volumeNumber}
                                        </div>

                                        {/* Cover thumbnail */}
                                        <div className="h-12 w-8 rounded-md overflow-hidden bg-muted/60 border border-border/40 shrink-0">
                                            {vol.coverUrl ? (
                                                <img src={vol.coverUrl} alt={vol.title} className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center bg-muted/80 text-muted-foreground/60">
                                                    {vol.mediaType === "audiobook" ? <Headphones className="h-4 w-4" /> : <BookOpen className="h-4 w-4" />}
                                                </div>
                                            )}
                                        </div>

                                        {/* Title & Author */}
                                        <div className="space-y-0.5 min-w-0">
                                            <h5 className="font-semibold text-xs sm:text-sm text-foreground group-hover:text-primary transition-colors truncate">
                                                {vol.title}
                                            </h5>
                                            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                                                <span>{vol.author || authorName}</span>
                                                {vol.publishYear && <span>• {vol.publishYear}</span>}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Status Badge */}
                                    <div className="shrink-0 flex items-center gap-2">
                                        {vol.status === "AVAILABLE" ? (
                                            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-[10px] font-bold gap-1">
                                                <CheckCircle2 className="h-3 w-3" />
                                                <span>In Library</span>
                                            </Badge>
                                        ) : vol.status === "DOWNLOADING" ? (
                                            <Badge className="bg-cyan-500/15 text-cyan-300 border-cyan-500/30 text-[10px] font-bold gap-1 animate-pulse">
                                                <Download className="h-3 w-3" />
                                                <span>Downloading</span>
                                            </Badge>
                                        ) : vol.status === "REQUESTED" ? (
                                            <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-[10px] font-bold gap-1">
                                                <Clock className="h-3 w-3" />
                                                <span>Requested</span>
                                            </Badge>
                                        ) : (
                                            <Button size="sm" variant="ghost" className="h-7 text-[11px] text-primary hover:text-primary/90 hover:bg-primary/10 gap-1 font-bold">
                                                <Plus className="h-3 w-3" />
                                                <span>Request</span>
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="py-12 text-center text-xs text-muted-foreground">
                            No volumes discovered for this series.
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
