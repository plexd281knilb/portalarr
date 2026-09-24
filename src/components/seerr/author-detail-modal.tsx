"use client";

import { useState, useEffect } from "react";
import { AuthorInfo, BookDiscoveryItem } from "@/lib/books/book-types";
import { 
    getAuthorDetailsAction, 
    toggleMonitorAuthorAction 
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookCard } from "@/components/seerr/book-card";
import { 
    User, 
    BookOpen, 
    Layers, 
    Calendar, 
    BookmarkCheck, 
    Loader2, 
    ExternalLink, 
    Sparkles, 
    Radio 
} from "lucide-react";

interface AuthorDetailModalProps {
    authorName: string | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSelectBook?: (book: BookDiscoveryItem) => void;
    onSelectSeries?: (seriesTitle: string, authorName?: string) => void;
}

export function AuthorDetailModal({
    authorName,
    open,
    onOpenChange,
    onSelectBook,
    onSelectSeries
}: AuthorDetailModalProps) {
    const [author, setAuthor] = useState<AuthorInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [monitored, setMonitored] = useState(false);
    const [activeTab, setActiveTab] = useState<"works" | "series">("works");

    useEffect(() => {
        if (open && authorName) {
            loadAuthor(authorName);
        }
    }, [open, authorName]);

    const loadAuthor = async (name: string) => {
        setLoading(true);
        try {
            const res = await getAuthorDetailsAction(name);
            if (res.success && res.author) {
                setAuthor(res.author);
                setMonitored(Boolean(res.author.monitored));
            }
        } catch (e) {} finally {
            setLoading(false);
        }
    };

    const handleToggleMonitor = async (val: boolean) => {
        if (!author?.id) return;
        setMonitored(val);
        await toggleMonitorAuthorAction(author.id, val);
    };

    if (!authorName) return null;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl bg-card/95 backdrop-blur-xl border border-border/60 shadow-2xl p-0 overflow-hidden sm:rounded-2xl max-h-[90vh] flex flex-col">
                {/* Header Background */}
                <div className="relative h-28 sm:h-36 w-full bg-gradient-to-r from-purple-950/80 via-background/90 to-background flex items-end p-4 sm:p-6 overflow-hidden border-b border-border/40 shrink-0">
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-purple-600/20 via-transparent to-transparent" />
                </div>

                {/* Author Info Bar */}
                <div className="px-4 sm:px-6 -mt-14 relative z-20 shrink-0 space-y-4">
                    <div className="flex flex-col sm:flex-row items-center sm:items-end justify-between gap-4">
                        <div className="flex flex-col sm:flex-row items-center sm:items-end gap-4 text-center sm:text-left">
                            {/* Author Photo */}
                            <div className="h-24 w-24 sm:h-28 sm:w-28 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-muted/80 shrink-0 relative">
                                {author?.photoUrl ? (
                                    <img
                                        src={author.photoUrl}
                                        alt={author.name}
                                        className="w-full h-full object-cover"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-purple-900/40 to-indigo-900/40 text-purple-300">
                                        <User className="h-12 w-12 opacity-60" />
                                    </div>
                                )}
                            </div>

                            {/* Author Name & Dates */}
                            <div className="space-y-1">
                                <DialogTitle className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
                                    {author?.name || authorName}
                                </DialogTitle>

                                {(author?.birthDate || author?.deathDate) && (
                                    <div className="flex items-center justify-center sm:justify-start gap-1.5 text-xs text-muted-foreground">
                                        <Calendar className="h-3 w-3" />
                                        <span>
                                            {author.birthDate || "Unknown"} {author.deathDate ? `— ${author.deathDate}` : ""}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Monitor Toggle & Quick Stats */}
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-2 p-2 rounded-xl bg-background/60 border border-border/50 text-xs shadow-sm">
                                <Radio className={`h-3.5 w-3.5 ${monitored ? "text-emerald-400 animate-pulse" : "text-muted-foreground"}`} />
                                <span className="font-medium text-foreground">Monitor Author</span>
                                <Switch
                                    checked={monitored}
                                    onCheckedChange={handleToggleMonitor}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Biography (if available) */}
                    {author?.biography && (
                        <div className="bg-muted/20 p-3.5 rounded-xl border border-border/30 text-xs sm:text-sm text-muted-foreground max-h-28 overflow-y-auto leading-relaxed">
                            <p>{author.biography}</p>
                        </div>
                    )}

                    {/* Navigation Tabs */}
                    <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <div className="flex items-center gap-2">
                            <Button
                                size="sm"
                                variant={activeTab === "works" ? "default" : "ghost"}
                                onClick={() => setActiveTab("works")}
                                className="text-xs h-8 gap-1.5 font-semibold"
                            >
                                <BookOpen className="h-3.5 w-3.5" />
                                <span>Bibliography ({author?.books?.length || 0})</span>
                            </Button>

                            {author?.series && author.series.length > 0 && (
                                <Button
                                    size="sm"
                                    variant={activeTab === "series" ? "default" : "ghost"}
                                    onClick={() => setActiveTab("series")}
                                    className="text-xs h-8 gap-1.5 font-semibold"
                                >
                                    <Layers className="h-3.5 w-3.5" />
                                    <span>Series ({author.series.length})</span>
                                </Button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Tab Content / Scrollable Area */}
                <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
                    {loading ? (
                        <div className="py-16 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                            <span className="text-xs">Loading author profile & bibliography...</span>
                        </div>
                    ) : activeTab === "works" ? (
                        author?.books && author.books.length > 0 ? (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                                {author.books.map((book, idx) => (
                                    <BookCard
                                        key={idx}
                                        item={book}
                                        availability={book.availability}
                                        onSelect={() => {
                                            if (onSelectBook) onSelectBook(book);
                                        }}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 text-center text-xs text-muted-foreground">
                                No books found for this author.
                            </div>
                        )
                    ) : (
                        author?.series && author.series.length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {author.series.map((s, idx) => (
                                    <div 
                                        key={idx}
                                        onClick={() => {
                                            if (onSelectSeries) {
                                                onOpenChange(false);
                                                onSelectSeries(s.title, author.name);
                                            }
                                        }}
                                        className="p-4 rounded-xl bg-card/60 border border-border/50 hover:border-primary/50 transition-all cursor-pointer space-y-2 group shadow-sm hover:shadow-md"
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="space-y-0.5">
                                                <h4 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                                                    {s.title}
                                                </h4>
                                                <p className="text-xs text-muted-foreground font-medium">
                                                    {s.authorName || author.name}
                                                </p>
                                            </div>
                                            <Badge variant="secondary" className="text-[10px] bg-primary/10 text-primary border-primary/20 shrink-0">
                                                {s.ownedVolumes || 0} Owned
                                            </Badge>
                                        </div>

                                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/30">
                                            <span>Click to view series volumes</span>
                                            <ExternalLink className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100 transition-opacity" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="py-12 text-center text-xs text-muted-foreground">
                                No series found for this author.
                            </div>
                        )
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
