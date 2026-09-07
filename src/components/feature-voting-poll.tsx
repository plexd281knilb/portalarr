"use client";

import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    CheckSquare,
    Square,
    Vote,
    PlusCircle,
    Flame,
    Sparkles,
    Search,
    Tv,
    Headphones,
    Sliders,
    BellRing,
    BarChart3,
    BookOpen,
    Tag,
    Trash2,
    Loader2,
    CheckCircle2
} from "lucide-react";
import { getFeatureSuggestions, toggleFeatureVote, createFeatureSuggestion, deleteFeatureSuggestion } from "@/app/actions";

interface Suggestion {
    id: string;
    title: string;
    description: string | null;
    category: string;
    createdBy: string;
    votesCount: number;
    hasVoted: boolean;
    createdAt: string | Date;
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
    "Live TV": <Tv className="h-3.5 w-3.5 text-amber-400" />,
    "Audiobooks": <Headphones className="h-3.5 w-3.5 text-cyan-400" />,
    "Plex": <Sliders className="h-3.5 w-3.5 text-orange-400" />,
    "Notifications": <BellRing className="h-3.5 w-3.5 text-blue-400" />,
    "Stats": <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />,
    "Ebooks": <BookOpen className="h-3.5 w-3.5 text-purple-400" />,
};

export default function FeatureVotingPoll({ isAdmin = false }: { isAdmin?: boolean }) {
    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(true);
    const [sortBy, setSortBy] = useState<"votes" | "recent">("votes");
    const [activeCategory, setActiveCategory] = useState<string>("All");
    const [searchQuery, setSearchQuery] = useState("");
    
    // Modal state
    const [isSuggestOpen, setIsSuggestOpen] = useState(false);
    const [newTitle, setNewTitle] = useState("");
    const [newDesc, setNewDesc] = useState("");
    const [newCategory, setNewCategory] = useState("General");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState("");
    const [formSuccess, setFormSuccess] = useState(false);

    // Vote pending tracking
    const [votingId, setVotingId] = useState<string | null>(null);

    const loadSuggestions = async () => {
        try {
            const res = await getFeatureSuggestions();
            if (res.success && res.suggestions) {
                setSuggestions(res.suggestions as Suggestion[]);
            }
        } catch (e) {
            console.error("Failed to load suggestions:", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadSuggestions();
    }, []);

    const handleToggleVote = async (suggestionId: string) => {
        // Optimistic UI update
        const prevSuggestions = [...suggestions];
        setSuggestions(prev =>
            prev.map(s => {
                if (s.id === suggestionId) {
                    const nextHasVoted = !s.hasVoted;
                    return {
                        ...s,
                        hasVoted: nextHasVoted,
                        votesCount: nextHasVoted ? s.votesCount + 1 : Math.max(0, s.votesCount - 1)
                    };
                }
                return s;
            })
        );

        setVotingId(suggestionId);
        try {
            const res = await toggleFeatureVote(suggestionId);
            if (!res.success) {
                // Rollback on error
                setSuggestions(prevSuggestions);
                alert(res.error || "Failed to submit vote");
            } else if (res.votesCount !== undefined && res.hasVoted !== undefined) {
                // Sync with server authoritative count
                setSuggestions(prev =>
                    prev.map(s => {
                        if (s.id === suggestionId) {
                            return {
                                ...s,
                                hasVoted: res.hasVoted ?? s.hasVoted,
                                votesCount: res.votesCount ?? s.votesCount
                            };
                        }
                        return s;
                    })
                );
            }
        } catch (e) {
            setSuggestions(prevSuggestions);
            console.error("Vote toggle error:", e);
        } finally {
            setVotingId(null);
        }
    };

    const handleCreateSuggestion = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError("");
        if (!newTitle.trim() || newTitle.trim().length < 3) {
            setFormError("Please enter a feature title (at least 3 characters).");
            return;
        }

        setIsSubmitting(true);
        try {
            const res = await createFeatureSuggestion(newTitle, newDesc, newCategory);
            if (res.success && res.suggestion) {
                setSuggestions(prev => [res.suggestion as Suggestion, ...prev]);
                setFormSuccess(true);
                setTimeout(() => {
                    setIsSuggestOpen(false);
                    setNewTitle("");
                    setNewDesc("");
                    setNewCategory("General");
                    setFormSuccess(false);
                }, 800);
            } else {
                setFormError(res.error || "Failed to create suggestion");
            }
        } catch (err: any) {
            setFormError(err.message || "An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = async (suggestionId: string) => {
        if (!confirm("Are you sure you want to delete this feature suggestion?")) return;
        try {
            const res = await deleteFeatureSuggestion(suggestionId);
            if (res.success) {
                setSuggestions(prev => prev.filter(s => s.id !== suggestionId));
            } else {
                alert(res.error || "Failed to delete suggestion");
            }
        } catch (e) {
            console.error("Delete error:", e);
        }
    };

    // Filter categories list
    const categories = ["All", ...Array.from(new Set(suggestions.map(s => s.category).filter(Boolean)))];

    // Filter and Sort
    const filteredSuggestions = suggestions
        .filter(s => {
            const matchesCategory = activeCategory === "All" || s.category.toLowerCase() === activeCategory.toLowerCase();
            const matchesSearch =
                !searchQuery.trim() ||
                s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (s.description && s.description.toLowerCase().includes(searchQuery.toLowerCase())) ||
                s.category.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesCategory && matchesSearch;
        })
        .sort((a, b) => {
            if (sortBy === "votes") {
                if (b.votesCount !== a.votesCount) return b.votesCount - a.votesCount;
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            } else {
                return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
            }
        });

    return (
        <Card className="w-full bg-[#121218]/80 border-cyan-500/20 backdrop-blur-md shadow-sm hover:shadow-md transition-all duration-200">
            <CardHeader className="pb-4 border-b border-border/40">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                        <CardTitle className="text-xl sm:text-2xl font-bold flex items-center gap-2.5 text-cyan-400">
                            <Vote className="h-6 w-6 text-cyan-400 shrink-0" />
                            <span>Community Feature Suggestions & Voting</span>
                        </CardTitle>
                        <CardDescription className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
                            Vote for the features you would love to see next! You can vote for multiple ideas and change your choices anytime.
                        </CardDescription>
                    </div>

                    {/* Suggest Feature Trigger Modal */}
                    <Dialog open={isSuggestOpen} onOpenChange={setIsSuggestOpen}>
                        <DialogTrigger asChild>
                            <Button
                                size="lg"
                                className="font-semibold bg-cyan-600 hover:bg-cyan-500 text-white transition-all duration-200 hover:ring-2 hover:ring-cyan-400/50 hover:shadow-lg active:scale-98 shrink-0 flex items-center gap-2 h-11"
                            >
                                <PlusCircle className="h-5 w-5" />
                                <span>Suggest Feature</span>
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-lg bg-[#14141d] border-cyan-500/30 text-foreground">
                            <DialogHeader>
                                <DialogTitle className="text-xl font-bold flex items-center gap-2 text-cyan-400">
                                    💡 Suggest a New Feature
                                </DialogTitle>
                                <DialogDescription className="text-muted-foreground text-sm">
                                    Describe your idea or enhancement. Once submitted, other users can vote on it!
                                </DialogDescription>
                            </DialogHeader>

                            <form onSubmit={handleCreateSuggestion} className="space-y-4 py-2">
                                {formError && (
                                    <div className="p-3 bg-red-500/15 border border-red-500/40 rounded-lg text-red-400 text-sm">
                                        {formError}
                                    </div>
                                )}
                                {formSuccess && (
                                    <div className="p-3 bg-emerald-500/15 border border-emerald-500/40 rounded-lg text-emerald-400 text-sm flex items-center gap-2 font-medium">
                                        <CheckCircle2 className="h-4 w-4" /> Feature suggested successfully!
                                    </div>
                                )}

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-foreground">Feature Title *</label>
                                    <Input
                                        value={newTitle}
                                        onChange={e => setNewTitle(e.target.value)}
                                        placeholder="e.g. Discord Notifications for New Downloads"
                                        className="bg-zinc-900/80 border-border/60 focus-visible:ring-cyan-400"
                                        required
                                        maxLength={100}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-foreground">Category</label>
                                    <div className="grid grid-cols-3 gap-2">
                                        {["Live TV", "Audiobooks", "Plex", "Notifications", "Stats", "Ebooks", "General"].map(cat => (
                                            <button
                                                key={cat}
                                                type="button"
                                                onClick={() => setNewCategory(cat)}
                                                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all text-center ${
                                                    newCategory === cat
                                                        ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 ring-1 ring-cyan-400/50 font-semibold"
                                                        : "bg-zinc-900/50 border-border/50 text-muted-foreground hover:bg-zinc-800"
                                                }`}
                                            >
                                                {cat}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <label className="text-sm font-semibold text-foreground">Description (Optional)</label>
                                    <Textarea
                                        value={newDesc}
                                        onChange={e => setNewDesc(e.target.value)}
                                        placeholder="Explain what this feature would do and how it helps you..."
                                        rows={3}
                                        className="bg-zinc-900/80 border-border/60 focus-visible:ring-cyan-400 resize-none text-sm"
                                        maxLength={500}
                                    />
                                </div>

                                <DialogFooter className="pt-2 flex flex-col sm:flex-row gap-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => setIsSuggestOpen(false)}
                                        disabled={isSubmitting}
                                        className="w-full sm:w-auto"
                                    >
                                        Cancel
                                    </Button>
                                    <Button
                                        type="submit"
                                        disabled={isSubmitting || formSuccess}
                                        className="w-full sm:w-auto font-semibold bg-cyan-600 hover:bg-cyan-500 text-white"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                                            </>
                                        ) : (
                                            "Submit Suggestion"
                                        )}
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                {/* Filter and Search Controls */}
                <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <Button
                            variant={sortBy === "votes" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSortBy("votes")}
                            className={`h-8 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                                sortBy === "votes"
                                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                                    : "border-border/60 hover:bg-zinc-800 text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Flame className="h-3.5 w-3.5 text-amber-400" />
                            Most Voted
                        </Button>
                        <Button
                            variant={sortBy === "recent" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setSortBy("recent")}
                            className={`h-8 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-all ${
                                sortBy === "recent"
                                    ? "bg-cyan-600 hover:bg-cyan-500 text-white"
                                    : "border-border/60 hover:bg-zinc-800 text-muted-foreground hover:text-foreground"
                            }`}
                        >
                            <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                            Newest
                        </Button>

                        <span className="hidden sm:inline-block w-px h-4 bg-border/60 mx-1" />

                        {/* Category filter pills */}
                        <div className="flex flex-wrap gap-1">
                            {categories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setActiveCategory(cat)}
                                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                                        activeCategory === cat
                                            ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                                            : "bg-zinc-900/40 text-muted-foreground border border-border/30 hover:text-foreground hover:bg-zinc-800/60"
                                    }`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full sm:w-60 shrink-0">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="Search ideas..."
                            className="h-8 pl-8 text-xs bg-zinc-900/60 border-border/50 focus-visible:ring-cyan-400 rounded-lg"
                        />
                    </div>
                </div>
            </CardHeader>

            <CardContent className="pt-5 pb-6">
                {loading ? (
                    <div className="space-y-3">
                        {[1, 2, 3, 4].map(n => (
                            <div key={n} className="h-20 bg-zinc-900/40 border border-border/40 rounded-xl animate-pulse" />
                        ))}
                    </div>
                ) : filteredSuggestions.length === 0 ? (
                    <div className="text-center py-10 px-4 border border-dashed border-border/50 rounded-xl bg-zinc-900/20">
                        <Vote className="h-10 w-10 text-muted-foreground mx-auto mb-2 opacity-50" />
                        <h4 className="text-base font-semibold text-foreground">No feature suggestions found</h4>
                        <p className="text-xs sm:text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
                            {searchQuery ? "Try refining your search term or category." : "Be the first to suggest a great new feature for Portalarr!"}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredSuggestions.map(s => {
                            const isVoted = s.hasVoted;
                            const isPending = votingId === s.id;

                            return (
                                <div
                                    key={s.id}
                                    className={`group relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border transition-all duration-200 ${
                                        isVoted
                                            ? "bg-cyan-950/20 border-cyan-500/40 shadow-sm ring-1 ring-cyan-500/30"
                                            : "bg-[#161622]/60 border-border/50 hover:border-cyan-500/30 hover:bg-[#161622]/90 hover:shadow-md"
                                    }`}
                                >
                                    {/* Left: Checkbox / Vote Toggle & Content */}
                                    <div className="flex items-start gap-3.5 flex-1 min-w-0">
                                        {/* Multi-vote Checkbox Button */}
                                        <button
                                            onClick={() => handleToggleVote(s.id)}
                                            disabled={isPending}
                                            title={isVoted ? "Click to remove your vote" : "Click to vote for this feature"}
                                            className={`mt-0.5 shrink-0 flex flex-col items-center justify-center min-w-[56px] px-2 py-1.5 rounded-lg border transition-all duration-200 active:scale-95 ${
                                                isVoted
                                                    ? "bg-cyan-500 text-white border-cyan-400 shadow-md shadow-cyan-500/20 hover:bg-cyan-600"
                                                    : "bg-zinc-900/70 border-border/60 text-muted-foreground hover:border-cyan-400/60 hover:text-cyan-300 hover:bg-zinc-800"
                                            }`}
                                        >
                                            <div className="flex items-center gap-1">
                                                {isPending ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : isVoted ? (
                                                    <CheckSquare className="h-4 w-4 text-white" />
                                                ) : (
                                                    <Square className="h-4 w-4 text-muted-foreground group-hover:text-cyan-400" />
                                                )}
                                                <span className="text-sm font-bold leading-none">
                                                    {s.votesCount}
                                                </span>
                                            </div>
                                            <span className="text-[10px] font-semibold mt-0.5 uppercase tracking-wider opacity-90">
                                                {isVoted ? "Voted" : "Vote"}
                                            </span>
                                        </button>

                                        {/* Text Info */}
                                        <div className="flex-1 min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4 className="text-base font-semibold text-foreground group-hover:text-cyan-300 transition-colors">
                                                    {s.title}
                                                </h4>
                                                {s.category && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-zinc-800/80 text-zinc-300 border border-border/50">
                                                        {CATEGORY_ICONS[s.category] || <Tag className="h-3 w-3 text-muted-foreground" />}
                                                        {s.category}
                                                    </span>
                                                )}
                                                {isVoted && (
                                                    <Badge className="bg-cyan-500/20 text-cyan-300 border-cyan-500/40 text-[10px] py-0 px-1.5 h-4 font-semibold">
                                                        ✓ You Voted
                                                    </Badge>
                                                )}
                                            </div>

                                            {s.description && (
                                                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                                                    {s.description}
                                                </p>
                                            )}

                                            <div className="flex items-center gap-3 pt-0.5 text-[11px] text-muted-foreground/70">
                                                <span>Suggested by {s.createdBy}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Admin Delete Action */}
                                    {isAdmin && (
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            onClick={() => handleDelete(s.id)}
                                            className="h-8 w-8 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 shrink-0 self-end sm:self-center"
                                            title="Delete suggestion (Admin)"
                                        >
                                            <Trash2 className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
