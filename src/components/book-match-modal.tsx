"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Search,
  Sparkles,
  Link2,
  CheckCircle2,
  BookOpen,
  Headphones,
  Folder,
  FileText,
  Loader2,
  ExternalLink,
  ArrowRight,
  Database,
  Globe,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter
} from "@/components/ui/card";
import {
  previewBookMatchSuggestionsAction,
  searchBooksUnifiedAction,
  matchAndLinkBookAction,
  BookMatchSuggestion
} from "@/app/book-actions";

export interface BookMatchModalProps {
  book: {
    id: string;
    title: string;
    author?: string | null;
    series?: string | null;
    volumeNumber?: string | null;
    coverUrl?: string | null;
    filePath?: string;
    fileSize?: number | null;
    fileType?: string | null;
    mediaType?: string;
    library?: { name: string; path: string } | null;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onMatched?: (updatedBook: any) => void;
}

export function BookMatchModal({
  book,
  isOpen,
  onClose,
  onMatched
}: BookMatchModalProps) {
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [suggestions, setSuggestions] = useState<BookMatchSuggestion[]>([]);
  const [selectedSuggestionId, setSelectedSuggestionId] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [series, setSeries] = useState("");
  const [volumeNumber, setVolumeNumber] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [organizeDisk, setOrganizeDisk] = useState(true);

  // Registry Search
  const [searchQuery, setSearchQuery] = useState("");
  const [searchingRegistry, setSearchingRegistry] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (isOpen && book) {
      setTitle(book.title || "");
      setAuthor(book.author && book.author !== "Unknown Author" ? book.author : "");
      setSeries(book.series || "");
      setVolumeNumber(book.volumeNumber || "");
      setCoverUrl(book.coverUrl || "");
      setSearchQuery(book.title || "");
      setOrganizeDisk(true);
      setErrorMessage("");
      setSuccessMessage("");
      setSelectedSuggestionId(null);

      // Fetch automated suggestions from Database, OpenLibrary, and AI
      setLoadingSuggestions(true);
      previewBookMatchSuggestionsAction(book.id)
        .then((res) => {
          if (res.success && res.suggestions) {
            setSuggestions(res.suggestions);
            if (res.suggestions.length > 0) {
              const bestMatch = res.suggestions[0];
              setSelectedSuggestionId(bestMatch.id);
              applySuggestion(bestMatch);
            }
          }
        })
        .catch((err) => {
          console.error("Failed to load match suggestions:", err);
        })
        .finally(() => {
          setLoadingSuggestions(false);
        });
    } else {
      setSuggestions([]);
      setSelectedSuggestionId(null);
    }
  }, [isOpen, book]);

  function applySuggestion(s: BookMatchSuggestion) {
    setSelectedSuggestionId(s.id);
    if (s.title) setTitle(s.title);
    if (s.author && s.author !== "Unknown Author") setAuthor(s.author);
    if (s.series) setSeries(s.series);
    if (s.volumeNumber) setVolumeNumber(s.volumeNumber);
    if (s.coverUrl) setCoverUrl(s.coverUrl);
    setErrorMessage("");
  }

  async function handleRegistrySearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setSearchingRegistry(true);
    setErrorMessage("");
    try {
      const mediaType = book?.mediaType === "audiobook" ? "audiobook" : "ebook";
      const res = await searchBooksUnifiedAction(searchQuery.trim(), mediaType);
      if (res.success && res.results) {
        const newSuggs: BookMatchSuggestion[] = res.results.map((item, idx) => ({
          id: `search-${idx}-${Date.now()}`,
          title: item.title,
          author: item.author,
          series: item.series || null,
          volumeNumber: item.volumeNumber || null,
          coverUrl: item.coverUrl || null,
          overview: item.overview || null,
          publishYear: item.publishYear || null,
          confidence: "medium",
          source: item.mediaType === "audiobook" ? "audible" : "openlibrary",
          reason: `Found for search query "${searchQuery}"`
        }));

        setSuggestions((prev) => {
          const existingTitles = new Set(prev.map((p) => (p.title + p.author).toLowerCase()));
          const filtered = newSuggs.filter(
            (n) => !existingTitles.has((n.title + n.author).toLowerCase())
          );
          return [...filtered, ...prev];
        });

        if (newSuggs.length > 0) {
          applySuggestion(newSuggs[0]);
        }
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Failed to search book registries");
    } finally {
      setSearchingRegistry(false);
    }
  }

  async function handleSaveMatch() {
    if (!book) return;
    if (!title.trim()) {
      setErrorMessage("Title is required.");
      return;
    }

    setIsSubmitting(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const res = await matchAndLinkBookAction(book.id, {
        title: title.trim(),
        author: author.trim() || "Unknown Author",
        series: series.trim() || null,
        volumeNumber: volumeNumber.trim() || null,
        coverUrl: coverUrl.trim() || null,
        organizeDisk
      });

      if (res.success) {
        setSuccessMessage(res.message || "Book matched and linked successfully!");
        if (onMatched) {
          onMatched({
            ...book,
            title: title.trim(),
            author: author.trim() || "Unknown Author",
            series: series.trim() || null,
            volumeNumber: volumeNumber.trim() || null,
            coverUrl: coverUrl.trim() || null
          });
        }
        setTimeout(() => {
          onClose();
        }, 600);
      } else {
        setErrorMessage(res.error || "Failed to link book.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen || !book) return null;

  const isAudiobook = book.mediaType === "audiobook";

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-center justify-center p-3 sm:p-5 animate-in fade-in duration-200">
      <Card className="w-full max-w-3xl border-zinc-800 bg-[#121318]/95 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <CardHeader className="pb-3 border-b border-zinc-800/80 bg-zinc-900/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-primary/10 border border-primary/20 text-primary">
                <Link2 className="h-5 w-5" />
              </div>
              <div>
                <CardTitle className="text-base font-bold text-foreground flex items-center gap-2">
                  Match & Link Book Metadata
                  <Badge variant="outline" className="text-[10px] font-mono border-primary/30 text-primary uppercase">
                    {isAudiobook ? "🎧 Audiobook" : "📖 Ebook"}
                  </Badge>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Interactively map unlinked or uploaded media to canonical Author, Series, and Volume in SQLite.
                </CardDescription>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 rounded-full hover:bg-zinc-800 text-muted-foreground hover:text-foreground"
              onClick={onClose}
              disabled={isSubmitting}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        {/* Modal Scrollable Body */}
        <div className="overflow-y-auto flex-1 p-4 sm:p-5 space-y-5 custom-scrollbar">
          {/* File Inspector Header Bar */}
          <div className="p-3 rounded-lg bg-zinc-900/80 border border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 text-zinc-300 font-medium truncate">
                <FileText className="h-4 w-4 text-zinc-400 flex-shrink-0" />
                <span className="truncate">{book.filePath ? book.filePath.split(/[/\\]/).pop() : book.title}</span>
              </div>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500 font-mono">
                <span>Format: {book.fileType?.toUpperCase() || (isAudiobook ? "FOLDER" : "EPUB")}</span>
                {book.fileSize ? (
                  <span>Size: {(book.fileSize / 1024 / 1024).toFixed(1)} MB</span>
                ) : null}
                {book.library?.name && <span>Library: {book.library.name}</span>}
              </div>
            </div>
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-500/10 border-amber-500/30 text-amber-400 flex-shrink-0 self-start sm:self-center"
            >
              <AlertCircle className="h-3 w-3 mr-1" />
              {book.series ? "Manual Remap" : "Unlinked File"}
            </Badge>
          </div>

          {/* Feedback Messages */}
          {errorMessage && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-xs font-medium flex items-center gap-2">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}
          {successMessage && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-xs font-medium flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Interactive Registry Search Bar */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Search className="h-3.5 w-3.5 text-primary" />
                Search Book Registry (OpenLibrary / Audible / Google Books)
              </Label>
              <span className="text-[10px] text-zinc-500">Press enter to query online index</span>
            </div>
            <form onSubmit={handleRegistrySearch} className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="e.g. Harry Potter and the Chamber of Secrets J.K. Rowling..."
                  className="bg-zinc-950/60 border-zinc-800 text-xs h-9 pl-3 pr-8 focus-visible:ring-primary/50"
                />
              </div>
              <Button
                type="submit"
                size="sm"
                variant="outline"
                className="h-9 px-3 text-xs border-zinc-700 bg-zinc-800/80 hover:bg-zinc-800 font-medium"
                disabled={searchingRegistry || !searchQuery.trim()}
              >
                {searchingRegistry ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <>
                    <Search className="h-3.5 w-3.5 mr-1.5" />
                    Search
                  </>
                )}
              </Button>
            </form>
          </div>

          {/* Suggested Matches Carousel / List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-amber-400" />
                Detected Metadata Suggestions
              </Label>
              {loadingSuggestions && (
                <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Scanning registries...
                </span>
              )}
            </div>

            {suggestions.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-48 overflow-y-auto custom-scrollbar pr-1">
                {suggestions.map((sug) => {
                  const isSelected = selectedSuggestionId === sug.id;
                  return (
                    <div
                      key={sug.id}
                      onClick={() => applySuggestion(sug)}
                      className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-start gap-3 relative ${
                        isSelected
                          ? "bg-primary/10 border-primary/60 shadow-sm"
                          : "bg-zinc-900/50 border-zinc-800/80 hover:bg-zinc-800/50 hover:border-zinc-700"
                      }`}
                    >
                      {/* Cover Thumbnail */}
                      <div className="w-10 h-14 bg-zinc-950 rounded border border-zinc-800/60 overflow-hidden flex-shrink-0 flex items-center justify-center">
                        {sug.coverUrl ? (
                          <img
                            src={sug.coverUrl}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLElement).style.display = "none";
                            }}
                          />
                        ) : isAudiobook ? (
                          <Headphones className="h-5 w-5 text-zinc-600" />
                        ) : (
                          <BookOpen className="h-5 w-5 text-zinc-600" />
                        )}
                      </div>

                      {/* Metadata Info */}
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center justify-between gap-1">
                          <p className="text-xs font-bold text-foreground truncate">{sug.title}</p>
                          {isSelected && (
                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-400 truncate">{sug.author}</p>
                        {sug.series && (
                          <p className="text-[10px] text-primary font-medium truncate">
                            {sug.series} {sug.volumeNumber ? `(Vol. ${sug.volumeNumber})` : ""}
                          </p>
                        )}
                        <div className="flex items-center gap-1.5 pt-0.5">
                          <Badge
                            variant="outline"
                            className={`text-[9px] px-1 py-0 h-4 uppercase ${
                              sug.source === "database"
                                ? "border-purple-500/30 text-purple-400 bg-purple-500/10"
                                : sug.source === "ai"
                                ? "border-amber-500/30 text-amber-400 bg-amber-500/10"
                                : "border-blue-500/30 text-blue-400 bg-blue-500/10"
                            }`}
                          >
                            {sug.source}
                          </Badge>
                          <span className="text-[9px] text-zinc-500 truncate">{sug.reason}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : !loadingSuggestions ? (
              <div className="p-4 rounded-lg bg-zinc-950/40 border border-zinc-800/60 text-center text-xs text-zinc-500">
                No automatic matches detected. Use the search bar above or enter canonical details below.
              </div>
            ) : null}
          </div>

          {/* Form Editing Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-zinc-800/60">
            {/* Live Artwork Card */}
            <div className="sm:col-span-1 flex flex-col items-center space-y-2">
              <Label className="text-xs font-semibold text-zinc-300 self-start">Cover Artwork</Label>
              <div className="w-32 h-48 rounded-lg bg-zinc-950 border border-zinc-800 overflow-hidden shadow-md relative flex items-center justify-center">
                {coverUrl ? (
                  <img
                    src={coverUrl}
                    alt={title}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                ) : isAudiobook ? (
                  <Headphones className="h-10 w-10 text-zinc-700" />
                ) : (
                  <BookOpen className="h-10 w-10 text-zinc-700" />
                )}
              </div>
              <p className="text-[10px] text-zinc-500 text-center">
                Standard 2:3 vertical poster format
              </p>
            </div>

            {/* Metadata Fields */}
            <div className="sm:col-span-2 space-y-3">
              <div className="space-y-1">
                <Label htmlFor="matchTitle" className="text-xs font-semibold text-zinc-300">
                  Canonical Book Title *
                </Label>
                <Input
                  id="matchTitle"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Harry Potter and the Sorcerer's Stone"
                  className="bg-zinc-950/60 border-zinc-800 text-xs h-9"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="matchAuthor" className="text-xs font-semibold text-zinc-300">
                  Author Name *
                </Label>
                <Input
                  id="matchAuthor"
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="e.g. J.K. Rowling"
                  className="bg-zinc-950/60 border-zinc-800 text-xs h-9"
                  required
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="matchSeries" className="text-xs font-semibold text-zinc-300">
                    Series Name (Optional)
                  </Label>
                  <Input
                    id="matchSeries"
                    value={series}
                    onChange={(e) => setSeries(e.target.value)}
                    placeholder="e.g. Harry Potter"
                    className="bg-zinc-950/60 border-zinc-800 text-xs h-9"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="matchVolume" className="text-xs font-semibold text-zinc-300">
                    Volume #
                  </Label>
                  <Input
                    id="matchVolume"
                    value={volumeNumber}
                    onChange={(e) => setVolumeNumber(e.target.value)}
                    placeholder="e.g. 1"
                    className="bg-zinc-950/60 border-zinc-800 text-xs h-9"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="matchCoverUrl" className="text-xs font-semibold text-zinc-300">
                  Cover Artwork URL
                </Label>
                <Input
                  id="matchCoverUrl"
                  value={coverUrl}
                  onChange={(e) => setCoverUrl(e.target.value)}
                  placeholder="https://..."
                  className="bg-zinc-950/60 border-zinc-800 text-xs h-9"
                />
              </div>
            </div>
          </div>

          {/* Radarr/Sonarr Style Disk Organization Option */}
          <div className="p-3 rounded-lg bg-zinc-900/60 border border-zinc-800 flex items-start space-x-3">
            <Checkbox
              id="organizeDisk"
              checked={organizeDisk}
              onCheckedChange={(c) => setOrganizeDisk(Boolean(c))}
              className="mt-0.5"
            />
            <div className="space-y-0.5">
              <label
                htmlFor="organizeDisk"
                className="text-xs font-semibold text-zinc-200 cursor-pointer flex items-center gap-1.5"
              >
                <Folder className="h-3.5 w-3.5 text-primary" />
                Organize and Rename File on Disk
              </label>
              <p className="text-[11px] text-zinc-400">
                Safely migrates media into standard structure:{" "}
                <code className="text-primary font-mono text-[10px]">
                  Library / {author || "Author"} / {series ? `[${series} ${volumeNumber || "01"}] ` : ""}
                  {title || "Title"}
                </code>
              </p>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <CardFooter className="pt-3 pb-3 border-t border-zinc-800/80 bg-zinc-900/50 flex justify-between items-center flex-shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs text-zinc-400 hover:text-foreground h-9"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              className="h-9 px-4 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow"
              onClick={handleSaveMatch}
              disabled={isSubmitting || !title.trim()}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                  Linking & Organizing...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  Match & Link Book
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
