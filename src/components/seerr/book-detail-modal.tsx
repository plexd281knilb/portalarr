"use client";

import { useState, useEffect } from "react";
import { BookDiscoveryItem } from "@/lib/books/book-types";
import { 
    submitBookOrAudiobookRequestAction, 
    getAccessibleBookLibrariesAction 
} from "@/app/book-actions";
import { 
    Dialog, 
    DialogContent, 
    DialogHeader, 
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
    ExternalLink 
} from "lucide-react";
import Link from "next/link";

interface BookDetailModalProps {
    item: BookDiscoveryItem | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectAuthor?: (authorName: string) => void;
    onSelectSeries?: (seriesTitle: string, authorName?: string) => void;
    onRequestSuccess?: () => void;
}

export function BookDetailModal({
    item,
    open,
    onOpenChange,
    onSelectAuthor,
    onSelectSeries,
    onRequestSuccess
}: BookDetailModalProps) {
    const [libraries, setLibraries] = useState<{ id: string; name: string; mediaType: string }[]>([]);
    const [selectedLibraryId, setSelectedLibraryId] = useState<string>("");
    const [sendToKindle, setSendToKindle] = useState<boolean>(true);
    const [requesting, setRequesting] = useState<boolean>(false);
    const [requestMessage, setRequestMessage] = useState<string | null>(null);
    const [requestError, setRequestError] = useState<string | null>(null);

    const isAudiobook = item?.mediaType === "audiobook";
    const status = item?.availability?.status || "NOT_AVAILABLE";

    useEffect(() => {
        if (open && item) {
            setRequestMessage(null);
            setRequestError(null);
            loadLibraries(item.mediaType);
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

    const handleRequest = async () => {
        if (!item) return;
        setRequesting(true);
        setRequestError(null);
        setRequestMessage(null);

        try {
            const res = await submitBookOrAudiobookRequestAction({
                title: item.title,
                author: item.author,
                series: item.series,
                volumeNumber: item.volumeNumber,
                coverUrl: item.coverUrl,
                publishYear: item.publishYear,
                mediaType: item.mediaType,
                libraryId: selectedLibraryId || undefined,
                sendToKindle: !isAudiobook && sendToKindle
            });

            if (res.success) {
                setRequestMessage(res.message || "Request submitted successfully!");
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

    if (!item) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-2xl bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl p-0 overflow-hidden sm:rounded-2xl">
                {/* Header Background Banner */}
                <div className="relative h-28 sm:h-36 w-full bg-gradient-to-r from-purple-950/60 via-indigo-950/40 to-background flex items-end p-4 sm:p-6 overflow-hidden border-b border-border/40">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/15 via-transparent to-transparent" />
                    
                    <div className="relative z-10 flex items-center justify-between w-full">
                        <Badge 
                            className={`text-xs font-bold px-3 py-1 border shadow-md backdrop-blur-md ${
                                isAudiobook 
                                    ? "bg-amber-500/25 text-amber-300 border-amber-500/40" 
                                    : "bg-purple-500/25 text-purple-300 border-purple-500/40"
                            }`}
                        >
                            {isAudiobook ? "🎧 AUDIOBOOK" : "📖 EBOOK"}
                        </Badge>

                        {item.publishYear && (
                            <span className="text-xs font-semibold text-muted-foreground bg-black/40 px-2.5 py-1 rounded-full border border-white/10 backdrop-blur-md">
                                {item.publishYear}
                            </span>
                        )}
                    </div>
                </div>

                {/* Main Body */}
                <div className="p-4 sm:p-6 space-y-5 -mt-12 relative z-20">
                    <div className="flex flex-col sm:flex-row gap-5">
                        {/* 2:3 Vertical Cover Artwork */}
                        <div className="shrink-0 w-32 sm:w-40 aspect-[2/3] rounded-xl overflow-hidden shadow-2xl border border-white/15 bg-muted/60 relative mx-auto sm:mx-0">
                            {item.coverUrl ? (
                                <img
                                    src={item.coverUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-muted/80 text-muted-foreground/60">
                                    {isAudiobook ? <Headphones className="h-10 w-10 text-amber-400/40" /> : <BookOpen className="h-10 w-10 text-purple-400/40" />}
                                    <span className="text-[10px] mt-2 font-medium line-clamp-2">{item.title}</span>
                                </div>
                            )}
                        </div>

                        {/* Metadata Details */}
                        <div className="flex-1 space-y-2 text-center sm:text-left">
                            <DialogTitle className="text-xl sm:text-2xl font-extrabold tracking-tight text-foreground leading-snug">
                                {item.title}
                            </DialogTitle>

                            {/* Author Row */}
                            <div className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-muted-foreground">
                                <span>by</span>
                                <button
                                    onClick={() => {
                                        if (onSelectAuthor && item.author) {
                                            onOpenChange(false);
                                            onSelectAuthor(item.author);
                                        }
                                    }}
                                    className="font-semibold text-foreground/90 hover:text-primary transition-colors inline-flex items-center gap-1 group"
                                >
                                    <span>{item.author || "Unknown Author"}</span>
                                    <User className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
                                </button>
                            </div>

                            {/* Series Tag */}
                            {item.series && (
                                <div className="flex items-center justify-center sm:justify-start gap-2 pt-1">
                                    <button
                                        onClick={() => {
                                            if (onSelectSeries && item.series) {
                                                onOpenChange(false);
                                                onSelectSeries(item.series, item.author);
                                            }
                                        }}
                                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold transition-all group"
                                    >
                                        <Layers className="h-3.5 w-3.5" />
                                        <span>Series: {item.series}</span>
                                        {item.volumeNumber && (
                                            <Badge variant="secondary" className="bg-primary/20 text-[10px] px-1 py-0 font-bold ml-1">
                                                #{item.volumeNumber}
                                            </Badge>
                                        )}
                                    </button>
                                </div>
                            )}

                            {/* Rating */}
                            {item.rating && item.rating > 0 && (
                                <div className="flex items-center justify-center sm:justify-start gap-1.5 pt-1 text-amber-400 text-xs font-bold">
                                    <Star className="h-4 w-4 fill-amber-400" />
                                    <span>{item.rating.toFixed(1)} / 5</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Overview / Description */}
                    {item.overview && (
                        <div className="space-y-1 bg-muted/20 p-3.5 rounded-xl border border-border/30 text-xs sm:text-sm text-muted-foreground max-h-36 overflow-y-auto leading-relaxed">
                            <p>{item.overview}</p>
                        </div>
                    )}

                    {/* Request Options & Destination Selector */}
                    {status === "NOT_AVAILABLE" && (
                        <div className="space-y-3 p-3.5 bg-muted/30 rounded-xl border border-border/50">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Destination Library */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium text-muted-foreground">Target Library Shelf</Label>
                                    <Select value={selectedLibraryId} onValueChange={setSelectedLibraryId}>
                                        <SelectTrigger className="h-9 text-xs bg-background/60">
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
                                    <div className="flex items-center justify-between p-2 rounded-lg bg-background/50 border border-border/40">
                                        <div className="space-y-0.5">
                                            <Label htmlFor="send-kindle" className="text-xs font-medium text-foreground flex items-center gap-1.5">
                                                <Send className="h-3 w-3 text-purple-400" />
                                                <span>Auto-Send to Kindle</span>
                                            </Label>
                                            <p className="text-[10px] text-muted-foreground">Mails EPUB to your Kindle when ready</p>
                                        </div>
                                        <Switch 
                                            id="send-kindle"
                                            checked={sendToKindle}
                                            onCheckedChange={setSendToKindle}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Status Messages */}
                    {requestMessage && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
                            <CheckCircle2 className="h-4 w-4 shrink-0" />
                            <span>{requestMessage}</span>
                        </div>
                    )}
                    {requestError && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-400 text-xs font-medium">
                            <AlertCircle className="h-4 w-4 shrink-0" />
                            <span>{requestError}</span>
                        </div>
                    )}

                    {/* Modal Footer / Action Buttons */}
                    <div className="flex items-center justify-between gap-3 pt-2 border-t border-border/40">
                        <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            className="text-xs text-muted-foreground hover:text-foreground"
                        >
                            Close
                        </Button>

                        <div className="flex items-center gap-2">
                            {status === "AVAILABLE" ? (
                                <Link href="/library">
                                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs gap-1.5 shadow-md">
                                        <BookOpen className="h-3.5 w-3.5" />
                                        <span>Open in Bookshelf</span>
                                        <ExternalLink className="h-3 w-3 opacity-60" />
                                    </Button>
                                </Link>
                            ) : status === "DOWNLOADING" ? (
                                <Button size="sm" disabled className="bg-cyan-600/50 text-white text-xs gap-1.5">
                                    <Download className="h-3.5 w-3.5 animate-pulse" />
                                    <span>Downloading Release...</span>
                                </Button>
                            ) : status === "REQUESTED" ? (
                                <Button size="sm" disabled className="bg-amber-600/50 text-white text-xs gap-1.5">
                                    <Clock className="h-3.5 w-3.5" />
                                    <span>Request Pending</span>
                                </Button>
                            ) : (
                                <Button 
                                    size="sm" 
                                    onClick={handleRequest}
                                    disabled={requesting || Boolean(requestMessage)}
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs gap-1.5 shadow-lg shadow-primary/20 px-4 h-9"
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
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
