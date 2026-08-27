"use client";

import { useState, useEffect, useCallback, Suspense, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  getLibraries,
  getLibraryBooks,
  deleteBook,
  updateBook,
  createLibrary,
  updateLibrary,
  deleteLibrary,
  getBookRequests,
  createBookRequest,
  updateBookRequestStatus,
  scanLibrary,
  searchProwlarrIndexers,
  sendReleaseToDownloadClient,
  saveUserKindleSettings,
  sendBookToKindle,
  sendBookToPersonalEmail,
  getPublicSmtpFromEmail,
  getAppUsers,
  searchOpenLibrary,
  deleteBookRequest,
  getSeriesBooksList,
  createMultipleBookRequests,
  deleteMultipleBookRequests,
  submitSupportTicket,
  retryBookRequest,
  refreshBookCover,
  findMissingBooksInSeries,
  seedDefaultLibraries,
  importCompletedDownload,
  getAudiobookChapters,
  reorderAudiobookChapters,
  analyzeAudiobookChaptersAction,
  resolveBookWithAI,
  runAiLibraryScanAction,
} from "@/app/actions";
import { getSession, getCurrentUser } from "@/app/auth-actions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  Edit3,
  Edit2,
  Save,
  ArrowUp,
  ArrowDown,
  UploadCloud,
  Check,
  X,
  FileText,
  Download,
  Copy,
  LifeBuoy,
  Shield,
  Loader2,
  Sparkles,
  Mail,
  Send,
  AlertTriangle,
  ArrowRight,
  Info,
  Headphones,
  Volume2,
  Play,
  Pause,
  Disc,
  Image as ImageIcon,
  RefreshCw,
  UserX,
  Bot,
  Wand2,
  Library,
} from "lucide-react";

function isServerActionMismatch(err: any): boolean {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    msg.includes("was not found on the server") ||
    msg.includes("failed to find server action") ||
    msg.includes("older or newer deployment")
  );
}

function getAccessBadge(lib: any) {
  if (lib.allowedUsers === "*") {
    return {
      label: "Public",
      color: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    };
  }
  return {
    label: "Private",
    color: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  };
}

function matchesSeriesFuzzy(
  titleLower: string,
  seriesNameLower: string,
): boolean {
  const seriesWords = seriesNameLower.split(/\s+/).filter((w) => w.length > 2); // match words > 2 chars
  if (seriesWords.length === 0) return false;

  let lastIdx = -1;
  for (const word of seriesWords) {
    const idx = titleLower.indexOf(word, lastIdx + 1);
    if (idx === -1) {
      return false;
    }
    lastIdx = idx;
  }
  return true;
}

function extractSeriesInfo(
  title: string,
  filePath: string,
  knownSeries: string[] = [],
): { seriesName: string | null; volume: string | null; bookTitle: string } {
  const fileName = filePath ? filePath.split(/[/\\]/).pop() || "" : "";
  const cleanFileBase = fileName.replace(/\.[^/.]+$/, "").trim();
  const fileLower = cleanFileBase.toLowerCase();
  const titleLower = title.toLowerCase();

  // Check against known series list from requests or dynamically discovered list
  for (const series of knownSeries) {
    if (series && series.length > 3) {
      if (
        matchesSeriesFuzzy(fileLower, series) ||
        matchesSeriesFuzzy(titleLower, series)
      ) {
        // Try to find volume number in filename first, then in title
        const volRegex = /(?:#|v|vol|vol\.|book|part|no|no\.)\.?\s*(\d+)/i;
        let volMatch = cleanFileBase.match(volRegex) || title.match(volRegex);
        let volume: string | null = null;
        if (volMatch) {
          volume = volMatch[1];
        } else {
          const digitsMatch =
            cleanFileBase.match(/\b(\d+)\b/g) || title.match(/\b(\d+)\b/g);
          if (digitsMatch) {
            for (const digit of digitsMatch) {
              const val = parseInt(digit);
              if (
                val > 0 &&
                val < 100 &&
                digit !== "2015" &&
                digit !== "2016" &&
                digit !== "2018" &&
                digit !== "2020" &&
                digit !== "2021" &&
                digit !== "2022" &&
                digit !== "2023" &&
                digit !== "2024" &&
                digit !== "2025" &&
                digit !== "2026"
              ) {
                volume = digit;
                break;
              }
            }
          }
        }

        // Clean the title
        let cleanBookTitle = title
          .replace(new RegExp(series, "gi"), "")
          .replace(/(?:#|v|vol|vol\.|book|part|no|no\.)\.?\s*\d+/gi, "")
          .replace(/\(\s*\)/g, "")
          .replace(/\[\s*\]/g, "")
          .replace(/[:\-\s,#]+$/, "")
          .replace(/^[:\-\s,#]+/, "")
          .trim();

        if (!cleanBookTitle || /^(and|or|the|of|in|to|a|an)\s+/i.test(cleanBookTitle)) {
          cleanBookTitle = title
            .replace(/(?:#|v|vol|vol\.|book|part|no|no\.)\.?\s*\d+/gi, "")
            .replace(/\(\s*\)/g, "")
            .replace(/\[\s*\]/g, "")
            .replace(/[:\-\s,#]+$/, "")
            .replace(/^[:\-\s,#]+/, "")
            .trim();
        }

        return {
          seriesName: series,
          volume,
          bookTitle: cleanBookTitle,
        };
      }
    }
  }

  // Heuristics fallback using filename
  const parenRegex =
    /^(.*?)\s+\((.*?)\s*(?:#|v|vol|vol\.|book|part|no|no\.)\.?\s*(\d+)\)/i;
  let match = cleanFileBase.match(parenRegex);
  if (match) {
    return {
      seriesName: match[2].trim(),
      volume: match[3].trim(),
      bookTitle: match[1].trim(),
    };
  }

  const prefixRegex =
    /^(.*?)\s+(?:#|v|vol|vol\.|book|part|no|no\.)\.?\s*(\d+)\s*[:-]\s*(.*)$/i;
  match = cleanFileBase.match(prefixRegex);
  if (match) {
    return {
      seriesName: match[1].trim(),
      volume: match[2].trim(),
      bookTitle: match[3].trim(),
    };
  }

  const prefixDigitRegex = /^(.*?)\s+(\d+)\s*[:-]\s*(.*)$/i;
  match = cleanFileBase.match(prefixDigitRegex);
  if (match) {
    return {
      seriesName: match[1].trim(),
      volume: match[2].trim(),
      bookTitle: match[3].trim(),
    };
  }

  const endHashRegex =
    /^(.*?)\s+(?:#|v|vol|vol\.|book|part|no|no\.)\.?\s*(\d+)$/i;
  match = cleanFileBase.match(endHashRegex);
  if (match) {
    return {
      seriesName: match[1].trim(),
      volume: match[2].trim(),
      bookTitle: match[1].trim(),
    };
  }

  return { seriesName: null, volume: null, bookTitle: title };
}

export default function BookLibraryPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <BookLibraryPageContent />
    </Suspense>
  );
}

function BookLibraryPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState("libs");

  const [user, setUser] = useState<any>(null);
  const [fullUser, setFullUser] = useState<any>(null);
  const isAdmin = user?.role === "ADMIN" || fullUser?.role === "ADMIN";

  useEffect(() => {
    const handleGlobalError = (event: PromiseRejectionEvent | ErrorEvent) => {
      const reason =
        (event as PromiseRejectionEvent).reason ||
        (event as ErrorEvent).error ||
        (event as ErrorEvent).message;
      if (isServerActionMismatch(reason)) {
        console.warn(
          "[PORTALARR] Stale build session detected (Server Action hash mismatch). Auto-refreshing tab to sync client bundle...",
        );
        window.location.reload();
      }
    };

    window.addEventListener("unhandledrejection", handleGlobalError);
    window.addEventListener("error", handleGlobalError);

    const savedTab =
      typeof window !== "undefined"
        ? localStorage.getItem("book-library-active-tab")
        : null;
    let targetTab = activeTabParam || savedTab || "libs";
    if (targetTab === "manage" && user && !isAdmin) {
      targetTab = "libs";
    }
    setActiveTab(targetTab);

    return () => {
      window.removeEventListener("unhandledrejection", handleGlobalError);
      window.removeEventListener("error", handleGlobalError);
    };
  }, [activeTabParam, isAdmin, user]);

  const handleTabChange = (val: string) => {
    setActiveTab(val);
    localStorage.setItem("book-library-active-tab", val);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", val);
    router.push(`${pathname}?${params.toString()}`);

    if (val === "libs") {
      const topEbook = libraries.find(
        (l: any) => (l.mediaType || "ebook") === "ebook",
      );
      if (topEbook) setSelectedLibrary(topEbook);
      setReqMediaType("ebook");
    } else if (val === "audiobooks") {
      const topAudio = libraries.find(
        (l: any) =>
          l.mediaType === "audiobook" ||
          l.name.toLowerCase().includes("audio") ||
          l.downloadCategory === "audiobooks",
      );
      if (topAudio) setSelectedLibrary(topAudio);
      setReqMediaType("audiobook");
    }
  };

  const [libraries, setLibraries] = useState<any[]>([]);
  const [selectedLibrary, setSelectedLibrary] = useState<any>(null);
  const [books, setBooks] = useState<any[]>([]);
  const [missingBooksMap, setMissingBooksMap] = useState<Record<string, any[]>>(
    {},
  );
  const [loadingMissingSeries, setLoadingMissingSeries] = useState<
    Record<string, boolean>
  >({});
  const [requests, setRequests] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [booksLoading, setBooksLoading] = useState(false);

  // Form states
  const [libName, setLibName] = useState("");
  const [libDesc, setLibDesc] = useState("");
  const [libPath, setLibPath] = useState("");
  const [libAllowedUsers, setLibAllowedUsers] = useState("");
  const [libRestrictedUsers, setLibRestrictedUsers] = useState("");
  const [libDownloadCategory, setLibDownloadCategory] = useState("books");
  const [libMediaType, setLibMediaType] = useState("ebook"); // "ebook" or "audiobook"
  const [editingLibId, setEditingLibId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [resolvingAiId, setResolvingAiId] = useState<string | null>(null);
  const [activeAudiobook, setActiveAudiobook] = useState<any>(null);
  const [chaptersModalBook, setChaptersModalBook] = useState<any>(null);
  const [chaptersList, setChaptersList] = useState<any[]>([]);
  const [loadingChapters, setLoadingChapters] = useState(false);
  const [isEditingChapters, setIsEditingChapters] = useState(false);
  const [savingChapters, setSavingChapters] = useState(false);
  const [analyzingAiChapters, setAnalyzingAiChapters] = useState(false);
  const [activePlayingTrack, setActivePlayingTrack] = useState<{
    bookId: string;
    bookTitle: string;
    bookAuthor?: string;
    coverUrl?: string;
    chapters: any[];
    currentChapterIndex: number;
  } | null>(null);
  const [reqMediaType, setReqMediaType] = useState<"ebook" | "audiobook">(
    "ebook",
  );
  const [reqLogFilter, setReqLogFilter] = useState<
    "all" | "ebook" | "audiobook"
  >("all");

  // Prowlarr Search states
  const [prowlarrResults, setProwlarrResults] = useState<any[]>([]);
  const [searchingProwlarr, setSearchingProwlarr] = useState(false);
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);
  const [activeRequestForSearch, setActiveRequestForSearch] =
    useState<any>(null);
  const [customSearchQuery, setCustomSearchQuery] = useState("");
  const [searchProwlarrError, setSearchProwlarrError] = useState("");
  const [pushingReleaseId, setPushingReleaseId] = useState<string | null>(null);

  // Copyable Error Modal State
  const [errorModal, setErrorModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    copied?: boolean;
  }>({
    open: false,
    title: "",
    message: "",
  });

  const showErrorModal = (message: string, title = "System Error Notice") => {
    setErrorModal({ open: true, title, message, copied: false });
  };

  const handleCopyErrorToClipboard = (text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setErrorModal((prev) => ({ ...prev, copied: true }));
      setTimeout(() => {
        setErrorModal((prev) => ({ ...prev, copied: false }));
      }, 2000);
    } catch (e) {}
  };

  // Kindle states
  const [userEmail, setUserEmail] = useState("");
  const [userKindleEmail, setUserKindleEmail] = useState("");
  const [skippedKindleGate, setSkippedKindleGate] = useState(false);
  const [serverSmtpFrom, setServerSmtpFrom] = useState("");
  const [sendingToKindleId, setSendingToKindleId] = useState<string | null>(
    null,
  );
  const [sendingToPersonalEmailId, setSendingToPersonalEmailId] = useState<
    string | null
  >(null);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [requestedFor, setRequestedFor] = useState("");
  const [visibleCount, setVisibleCount] = useState(48);

  // Open Library Autocomplete states
  const [openLibrarySuggestions, setOpenLibrarySuggestions] = useState<any[]>(
    [],
  );
  const [searchingRegistry, setSearchingRegistry] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [reqType, setReqType] = useState("book"); // "book" or "series"
  const [reqCoverUrl, setReqCoverUrl] = useState("");
  const [reqPublishYear, setReqPublishYear] = useState("");
  const [seriesBooksChecklist, setSeriesBooksChecklist] = useState<any[]>([]);
  const [selectedRequestIds, setSelectedRequestIds] = useState<string[]>([]);

  // Report Issue states
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportName, setReportName] = useState("");
  const [reportEmail, setReportEmail] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  // Edit Book states
  const [isEditBookModalOpen, setIsEditBookModalOpen] = useState(false);
  const [editBookId, setEditBookId] = useState("");
  const [editBookTitle, setEditBookTitle] = useState("");
  const [editBookAuthor, setEditBookAuthor] = useState("");
  const [editBookCoverUrl, setEditBookCoverUrl] = useState("");
  const [updatingBook, setUpdatingBook] = useState(false);
  const [refreshingCoverId, setRefreshingCoverId] = useState<string | null>(
    null,
  );

  const handleRefreshCover = async (bookId: string) => {
    setRefreshingCoverId(bookId);
    try {
      const res = await refreshBookCover(bookId);
      if (res.success) {
        if (selectedLibrary?.id) {
          const freshBooks = await getLibraryBooks(selectedLibrary.id);
          setBooks(freshBooks || []);
        }
      } else {
        alert(res.error || "Could not fetch cover artwork.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to refresh cover.");
    } finally {
      setRefreshingCoverId(null);
    }
  };

  // Sort states
  const [sortBy, setSortBy] = useState("recent");
  const [groupBySeries, setGroupBySeries] = useState(false);

  useEffect(() => {
    const savedSort = localStorage.getItem("book-library-sort");
    if (savedSort) {
      setSortBy(savedSort);
    }
    const savedGroup = localStorage.getItem("book-library-group-series");
    if (savedGroup === "true") {
      setGroupBySeries(true);
    }
    const savedSkip =
      localStorage.getItem("portalarr-skip-kindle-gate") === "true";
    if (savedSkip) {
      setSkippedKindleGate(true);
    }
  }, []);

  const handleSortChange = (value: string) => {
    setSortBy(value);
    localStorage.setItem("book-library-sort", value);
  };

  const handleGroupToggle = (checked: boolean) => {
    setGroupBySeries(checked);
    localStorage.setItem("book-library-group-series", String(checked));
  };

  function normalizeBookCardMetadata(book: any) {
    let rawTitle = (book.title || "").trim();
    let rawAuthor = (book.author || "Unknown Author").trim();

    const isDiscTitle = /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(rawTitle);
    const isDiscAuthor = /^(?:Disc|CD|Part|Vol|Volume)\s*\d+$/i.test(rawAuthor);

    let displayTitle = rawTitle;
    let displayAuthor = rawAuthor;

    if (isDiscTitle && !isDiscAuthor && rawAuthor !== "Unknown Author") {
      displayTitle = rawAuthor;
      displayAuthor = "Unknown Author";
    } else if (isDiscAuthor) {
      displayAuthor = "Unknown Author";
    }

    // Clean scene noise (e.g. "(Rob Inglis)-PoF", "-PoF", "03 - The Two Towers", trailing dashes)
    displayTitle = displayTitle
      .replace(/\s*-\s*-\s*$/, "")
      .replace(/\s*-\s*$/, "")
      .replace(/\s*-\s*[A-Za-z0-9]+$/i, "")
      .replace(/\s*\([^)]*PoF[^)]*\)/gi, "")
      .replace(/\s*\(Rob Inglis\)/gi, "")
      .replace(/\bRob Inglis\b/gi, "")
      .replace(/\bJim Dale\b/gi, "")
      .replace(/\bStephen Fry\b/gi, "")
      .replace(/\s*\(Unabridged\)/gi, "")
      .replace(/\s*\(Narrated by [^)]+\)/gi, "")
      .replace(/^[0-9]{2}\s*-\s*/, "")
      .trim();

    // Lord of the Rings & Tolkien Master Rules
    const lowerTitle = displayTitle.toLowerCase();
    if (
      lowerTitle.includes("fellowship of the ring") ||
      lowerTitle.includes("two towers") ||
      lowerTitle.includes("return of the king") ||
      lowerTitle.includes("lord of the rings") ||
      lowerTitle.includes("hobbit")
    ) {
      displayAuthor = "J. R. R. Tolkien";
      if (lowerTitle.includes("fellowship of the ring"))
        displayTitle = "The Fellowship of the Ring";
      else if (lowerTitle.includes("two towers"))
        displayTitle = "The Two Towers";
      else if (lowerTitle.includes("return of the king"))
        displayTitle = "The Return of the King";
      else if (lowerTitle.includes("hobbit")) displayTitle = "The Hobbit";
    }

    // Harry Potter & Rowling Master Rules
    if (
      lowerTitle.includes("harry potter") ||
      lowerTitle.includes("chamber of secrets") ||
      lowerTitle.includes("prisoner of azkaban") ||
      lowerTitle.includes("goblet of fire") ||
      lowerTitle.includes("order of the phoenix") ||
      lowerTitle.includes("half-blood prince") ||
      lowerTitle.includes("deathly hallows") ||
      lowerTitle.includes("philosopher") ||
      lowerTitle.includes("sorcerer")
    ) {
      displayAuthor = "J. K. Rowling";
      if (lowerTitle.includes("philosopher") || lowerTitle.includes("sorcerer"))
        displayTitle = "Harry Potter and the Sorcerer's Stone";
      else if (lowerTitle.includes("chamber of secrets"))
        displayTitle = "Harry Potter and the Chamber of Secrets";
      else if (lowerTitle.includes("prisoner of azkaban"))
        displayTitle = "Harry Potter and the Prisoner of Azkaban";
      else if (lowerTitle.includes("goblet of fire"))
        displayTitle = "Harry Potter and the Goblet of Fire";
      else if (lowerTitle.includes("order of the phoenix"))
        displayTitle = "Harry Potter and the Order of the Phoenix";
      else if (lowerTitle.includes("half-blood prince"))
        displayTitle = "Harry Potter and the Half-Blood Prince";
      else if (lowerTitle.includes("deathly hallows"))
        displayTitle = "Harry Potter and the Deathly Hallows";
    }

    // Project Hail Mary & Andy Weir Master Rules
    if (
      lowerTitle.includes("project hail mary") ||
      lowerTitle.includes("hail mary") ||
      lowerTitle.includes("martian")
    ) {
      displayAuthor = "Andy Weir";
      if (
        lowerTitle.includes("project hail mary") ||
        lowerTitle.includes("hail mary")
      )
        displayTitle = "Project Hail Mary";
      else if (lowerTitle.includes("martian")) displayTitle = "The Martian";
    }

    // Handle title === author duplication
    const cleanAuthNorm = displayAuthor.toLowerCase().replace(/[^a-z0-9]/g, "");
    const cleanTitleNorm = displayTitle.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (
      cleanAuthNorm === cleanTitleNorm ||
      (cleanTitleNorm.includes(cleanAuthNorm) &&
        cleanAuthNorm.length > 5 &&
        !cleanAuthNorm.includes("tolkien") &&
        !cleanAuthNorm.includes("rowling") &&
        !cleanAuthNorm.includes("weir"))
    ) {
      if (
        lowerTitle.includes("fellowship of the ring") ||
        lowerTitle.includes("two towers") ||
        lowerTitle.includes("return of the king") ||
        lowerTitle.includes("hobbit")
      ) {
        displayAuthor = "J. R. R. Tolkien";
      } else if (lowerTitle.includes("harry potter")) {
        displayAuthor = "J. K. Rowling";
      } else if (lowerTitle.includes("project hail mary")) {
        displayAuthor = "Andy Weir";
      } else {
        displayAuthor = "Unknown Author";
      }
    }

    return { displayTitle, displayAuthor };
  }

  const renderBookCard = (book: any) => {
    let { displayTitle, displayAuthor } = normalizeBookCardMetadata(book);
    if (groupBySeries && book.cleanSeriesTitle) {
      displayTitle = book.cleanSeriesTitle;
    }

    const volumeBadge =
      book.series ||
      book.volumeNumber ||
      (groupBySeries && book.seriesVolume) ? (
        <Badge className="bg-primary/90 text-black border border-primary/40 text-[9px] font-extrabold uppercase shadow-sm">
          {book.series
            ? `${book.series}${book.volumeNumber ? ` #${book.volumeNumber}` : ""}`
            : `Vol. ${book.seriesVolume || book.volumeNumber}`}
        </Badge>
      ) : null;

    return (
      <Card
        key={book.id}
        className="relative flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border-muted/60 group"
      >
        {book.coverUrl ? (
          <div className="relative aspect-[2/3] w-full bg-muted overflow-hidden flex items-center justify-center border-b border-muted/40">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={book.coverUrl}
              alt={book.title}
              className={`object-cover w-full h-full transition-transform duration-300 group-hover:scale-105 ${book.fileType === "missing" ? "opacity-40 grayscale" : ""}`}
            />
            <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
              <Badge className="bg-background/80 backdrop-blur text-foreground border border-muted/50 text-[10px] uppercase font-bold tracking-wider">
                {book.fileType?.toUpperCase()}
              </Badge>
              {volumeBadge}
            </div>
          </div>
        ) : (
          <div className="relative aspect-[2/3] w-full bg-gradient-to-br from-indigo-950 via-slate-900 to-purple-950 overflow-hidden flex flex-col justify-between p-4 border-b border-muted/40 text-center select-none group-hover:from-indigo-900 group-hover:to-purple-900 transition-all duration-300">
            <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
              <Badge className="bg-background/80 backdrop-blur text-foreground border border-muted/50 text-[10px] uppercase font-bold tracking-wider">
                {book.fileType?.toUpperCase()}
              </Badge>
              {volumeBadge}
            </div>
            <div className="flex-1 flex flex-col justify-center items-center">
              <BookOpen className="h-10 w-10 text-primary/40 mb-3" />
              <div className="font-serif text-sm font-bold text-slate-100 line-clamp-3 px-2 leading-tight">
                {displayTitle}
              </div>
            </div>
            <div className="text-[10px] text-slate-400 font-semibold truncate w-full">
              {displayAuthor !== "Unknown Author" ? displayAuthor : ""}
            </div>
          </div>
        )}

        <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h3 className="font-bold text-sm leading-snug group-hover:text-primary transition-colors line-clamp-3 h-[60px]">
              {displayTitle}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {displayAuthor}
            </p>
          </div>
          <div className="text-[10px] text-muted-foreground flex justify-between items-center bg-muted/30 p-2 rounded">
            <span>
              Size:{" "}
              {book.fileSize ? (book.fileSize / (1024 * 1024)).toFixed(1) : "0"}{" "}
              MB
            </span>
            <span>Added: {new Date(book.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
        <CardFooter className="p-3 bg-muted/20 border-t border-muted/50 flex flex-col gap-2">
          <div className="flex gap-2 w-full">
            <Button
              variant="default"
              size="sm"
              className="flex-1 text-xs font-semibold text-black"
              onClick={() => setActiveBook(book)}
            >
              <BookOpen className="h-3 w-3 mr-1" /> Read
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 text-xs border-primary/20 text-primary hover:bg-primary/10 font-semibold"
              title="Send to Kindle"
              disabled={sendingToKindleId !== null}
              onClick={() => handleSendToKindle(book.id)}
            >
              {sendingToKindleId === book.id ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Send className="h-3 w-3 mr-1" />
              )}
              Kindle
            </Button>
          </div>
          {user?.role === "ADMIN" && allUsers.length > 0 && (
            <div className="w-full flex gap-1 items-center mt-1">
              <select
                id={`send-to-user-${book.id}`}
                className="flex-1 h-7 text-[10px] rounded border border-[#2d2d34] bg-[#111115] px-2 py-0.5 text-muted-foreground focus:outline-none cursor-pointer"
                defaultValue=""
                onChange={async (e) => {
                  const targetUsername = e.target.value;
                  if (!targetUsername) return;

                  const confirmSend = window.confirm(
                    `Are you sure you want to send this book to ${targetUsername}'s Kindle?`,
                  );
                  if (!confirmSend) {
                    e.target.value = "";
                    return;
                  }

                  // Reset value of select
                  e.target.value = "";

                  setSendingToKindleId(book.id);
                  try {
                    const res = await sendBookToKindle(book.id, targetUsername);
                    if (res && !res.success) {
                      alert(
                        res.error ||
                          `Delivery to ${targetUsername}'s Kindle failed.`,
                      );
                    } else {
                      alert(
                        `Ebook successfully sent to ${targetUsername}'s Kindle!`,
                      );
                    }
                  } catch (err: any) {
                    alert(err.message || `Delivery failed.`);
                  } finally {
                    setSendingToKindleId(null);
                  }
                }}
              >
                <option value="">Send to User's Kindle...</option>
                {allUsers
                  .filter((u) => u.kindleEmail)
                  .map((u) => (
                    <option key={u.id} value={u.username}>
                      {u.username} ({u.kindleEmail})
                    </option>
                  ))}
              </select>
            </div>
          )}
          <div className="flex flex-wrap gap-2 justify-center w-full border-t border-muted/40 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 text-muted-foreground hover:text-foreground"
              asChild
              title="Download File directly to your device"
            >
              <a href={`/api/books/${book.id}`} download>
                <Download className="h-3.5 w-3.5" />
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10"
              title="Email File to Personal Inbox"
              disabled={sendingToPersonalEmailId === book.id}
              onClick={() => handleSendToPersonalEmail(book.id)}
            >
              {sendingToPersonalEmailId === book.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
              title="Report an Issue"
              onClick={() =>
                handleOpenReportIssueModal({
                  type: "book",
                  title: book.title,
                  id: book.id,
                })
              }
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 font-semibold"
              title="Search & Re-Grab Release"
              onClick={() => handleSearchAndReplaceRelease(book)}
            >
              <Search className="h-3.5 w-3.5 mr-1" /> Re-Grab Release
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
              title="Fetch Cover Artwork (iTunes, Open Library, Google Books)"
              disabled={refreshingCoverId === book.id}
              onClick={() => handleRefreshCover(book.id)}
            >
              {refreshingCoverId === book.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
            </Button>
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2 border-purple-500/40 text-purple-300 hover:bg-purple-500/20"
                title="Run AI Metadata Agent (Extract Official Title, Author & HD Cover)"
                disabled={resolvingAiId === book.id}
                onClick={async () => {
                  setResolvingAiId(book.id);
                  const res = await resolveBookWithAI(book.id);
                  setResolvingAiId(null);
                  if (res.success) {
                    handleScanLibrary(book.libraryId || selectedLibrary?.id);
                  } else {
                    alert(res.error || "Failed to resolve with AI Agent");
                  }
                }}
              >
                {resolvingAiId === book.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                ) : (
                  <Bot className="h-3.5 w-3.5 text-purple-400" />
                )}
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2 border-blue-500/20 text-blue-500 hover:bg-blue-500/10"
                title="Edit Book"
                onClick={() => handleOpenEditBookModal(book)}
              >
                <Edit3 className="h-3.5 w-3.5" />
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => handleDeleteBook(book.id)}
                className="text-xs h-7 px-2"
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    );
  };

  const renderAudiobookCard = (book: any) => {
    const { displayTitle, displayAuthor } = normalizeBookCardMetadata(book);
    const ext = book.fileType ? book.fileType.toUpperCase() : "AUDIO";

    return (
      <Card
        key={book.id}
        className="relative flex flex-col justify-between overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border-muted/60 group bg-card/95"
      >
        <div className="relative aspect-[1/1] w-full bg-gradient-to-br from-slate-900 via-slate-800 to-black overflow-hidden flex items-center justify-center border-b border-muted/40">
          {book.coverUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={book.coverUrl}
              alt={book.title}
              className={`object-cover w-full h-full transition-transform duration-300 group-hover:scale-105 ${book.fileType === "missing" ? "opacity-40 grayscale" : ""}`}
            />
          ) : (
            <div className="flex flex-col items-center justify-center p-4 text-center space-y-2">
              <Headphones className="h-14 w-14 text-amber-400/80 animate-pulse" />
              <span className="text-xs font-bold text-slate-300 line-clamp-2">
                {displayTitle}
              </span>
            </div>
          )}
          <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
            <Badge className="bg-amber-500/90 text-black border border-amber-400/50 text-[10px] uppercase font-extrabold tracking-wider shadow">
              🎧 {ext}
            </Badge>
          </div>
        </div>

        <div className="p-4 flex-1 flex flex-col justify-between space-y-4">
          <div className="space-y-1">
            <h3 className="font-bold text-sm leading-snug group-hover:text-amber-400 transition-colors line-clamp-3 h-[60px]">
              {displayTitle}
            </h3>
            <p className="text-xs text-muted-foreground truncate">
              {displayAuthor}
            </p>
          </div>
          <div className="text-[10px] text-muted-foreground flex justify-between items-center bg-muted/30 p-2 rounded">
            <span>
              Size:{" "}
              {book.fileSize
                ? book.fileSize >= 1024 * 1024 * 1024
                  ? `${(book.fileSize / (1024 * 1024 * 1024)).toFixed(2)} GB`
                  : `${(book.fileSize / (1024 * 1024)).toFixed(1)} MB`
                : "0 MB"}
            </span>
            <span>Added: {new Date(book.createdAt).toLocaleDateString()}</span>
          </div>
        </div>

        <CardFooter className="p-3 bg-muted/20 border-t border-muted/50 flex flex-col gap-2 relative z-20">
          <Button
            variant="default"
            size="sm"
            className="w-full text-xs font-extrabold text-black bg-amber-400 hover:bg-amber-300 gap-1.5 shadow cursor-pointer relative z-30 py-2"
            onClick={(e) => {
              e.stopPropagation();
              handleOpenChaptersModal(book);
            }}
          >
            <Play className="h-4 w-4 fill-black" /> Listen &amp; Chapters
          </Button>

          <div className="flex flex-wrap gap-1.5 justify-center w-full border-t border-muted/40 pt-2">
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2.5 border-amber-500/40 text-amber-400 hover:bg-amber-500/10 font-bold gap-1 cursor-pointer relative z-30"
              asChild
              title="Download Audiobook"
            >
              <a href={`/api/books/${book.id}`} download>
                <Download className="h-3.5 w-3.5" /> Download
              </a>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 font-semibold gap-1"
              title="Search & Re-Grab Release"
              onClick={() => handleSearchAndReplaceRelease(book)}
            >
              <Search className="h-3.5 w-3.5" /> Re-Grab
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 gap-1"
              title="Email Audio File to Personal Inbox"
              disabled={sendingToPersonalEmailId === book.id}
              onClick={() => handleSendToPersonalEmail(book.id)}
            >
              {sendingToPersonalEmailId === book.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Mail className="h-3.5 w-3.5" />
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
              title="Report an Issue"
              onClick={() =>
                handleOpenReportIssueModal({
                  type: "audiobook",
                  title: book.title,
                  id: book.id,
                })
              }
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 border-purple-500/30 text-purple-400 hover:bg-purple-500/10"
              title="Fetch Cover Artwork (iTunes, Open Library, Google Books)"
              disabled={refreshingCoverId === book.id}
              onClick={() => handleRefreshCover(book.id)}
            >
              {refreshingCoverId === book.id ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ImageIcon className="h-3.5 w-3.5" />
              )}
            </Button>
            {isAdmin && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-2 border-blue-500/20 text-blue-500 hover:bg-blue-500/10"
                  title="Edit Audiobook"
                  onClick={() => handleOpenEditBookModal(book)}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleDeleteBook(book.id)}
                  className="text-xs h-7 px-2"
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
          </div>
        </CardFooter>
      </Card>
    );
  };

  const [editBookError, setEditBookError] = useState("");

  // Book Upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadAuthor, setUploadAuthor] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  // Request Form states
  const [reqTitle, setReqTitle] = useState("");
  const [reqAuthor, setReqAuthor] = useState("");

  // Reader state
  const [activeBook, setActiveBook] = useState<any>(null);

  useEffect(() => {
    async function loadInitData() {
      try {
        const session = await getSession();
        setUser(session);

        const profile = await getCurrentUser();
        setFullUser(profile);
        if (profile) {
          setUserEmail(profile.email || "");
          setUserKindleEmail(profile.kindleEmail || "");
        }

        const smtpFromEmail = await getPublicSmtpFromEmail();
        setServerSmtpFrom(smtpFromEmail || "");

        let libs = await getLibraries().catch(() => []);
        if (!libs || libs.length === 0) {
          try {
            const res = await fetch("/api/libraries");
            if (res.ok) {
              const data = await res.json();
              if (data.libraries && data.libraries.length > 0) {
                libs = data.libraries;
              }
            }
          } catch (e) {}
        }
        setLibraries(libs || []);
        if (libs && libs.length > 0) {
          const savedTab =
            typeof window !== "undefined"
              ? localStorage.getItem("book-library-active-tab")
              : null;
          const initialTab = activeTabParam || savedTab || "libs";
          if (initialTab === "audiobooks") {
            const topAudio =
              libs.find(
                (l: any) =>
                  l.mediaType === "audiobook" ||
                  l.name.toLowerCase().includes("audio") ||
                  l.downloadCategory === "audiobooks",
              ) || libs[0];
            setSelectedLibrary(topAudio);
          } else {
            const topEbook =
              libs.find((l: any) => (l.mediaType || "ebook") === "ebook") ||
              libs[0];
            setSelectedLibrary(topEbook);
          }
        }

        let reqs = await getBookRequests().catch(() => []);
        if (!reqs || reqs.length === 0) {
          try {
            const res = await fetch("/api/requests");
            if (res.ok) {
              const data = await res.json();
              if (data.requests && data.requests.length > 0) {
                reqs = data.requests;
              }
            }
          } catch (e) {}
        }
        setRequests(reqs || []);

        let ulist = await getAppUsers().catch(() => []);
        if (!ulist || ulist.length === 0) {
          try {
            const res = await fetch("/api/users");
            if (res.ok) {
              const data = await res.json();
              if (data.users && data.users.length > 0) {
                ulist = data.users;
              }
            }
          } catch (e) {}
        }
        setAllUsers(ulist || []);
      } catch (e) {
        console.error("Failed to load initial library data:", e);
      } finally {
        setLoading(false);
      }
    }
    loadInitData();
  }, []);

  useEffect(() => {
    if (!libraries || libraries.length === 0) return;

    if (activeTab === "libs") {
      if (!selectedLibrary || selectedLibrary.mediaType === "audiobook") {
        const topEbook = libraries.find(
          (l: any) => (l.mediaType || "ebook") === "ebook",
        );
        if (topEbook) setSelectedLibrary(topEbook);
      }
    } else if (activeTab === "audiobooks") {
      if (
        !selectedLibrary ||
        (selectedLibrary.mediaType || "ebook") === "ebook"
      ) {
        const topAudio = libraries.find(
          (l: any) =>
            l.mediaType === "audiobook" ||
            l.name.toLowerCase().includes("audio") ||
            l.downloadCategory === "audiobooks",
        );
        if (topAudio) setSelectedLibrary(topAudio);
      }
    }
  }, [activeTab, libraries]);

  const refreshRequests = useCallback(async () => {
    try {
      let freshReqs = null;
      try {
        const res = await fetch("/api/requests");
        if (res.ok) {
          const data = await res.json();
          freshReqs = data.requests || [];
        }
      } catch (e) {}

      if (freshReqs) {
        setRequests(freshReqs);
      }

      if (selectedLibrary?.id) {
        try {
          const res = await fetch(
            `/api/books?libraryId=${encodeURIComponent(selectedLibrary.id)}`,
          );
          if (res.ok) {
            const data = await res.json();
            if (data.success && data.books) {
              setBooks(data.books);
            }
          }
        } catch (e) {}
      }
    } catch (e: any) {
      console.error("Auto-refresh requests failed:", e);
    }
  }, [selectedLibrary?.id]);

  useEffect(() => {
    const hasActiveRequests = requests.some(
      (r: any) =>
        r.status === "Pending" ||
        r.status === "Searching" ||
        (r.status && r.status.startsWith("Downloading")),
    );

    const intervalMs = hasActiveRequests
      ? 5000
      : activeTab === "requests"
        ? 10000
        : 15000;

    const timer = setInterval(() => {
      refreshRequests();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [requests, activeTab, refreshRequests]);

  useEffect(() => {
    if (!reqTitle || reqTitle.trim().length < 2) {
      setOpenLibrarySuggestions([]);
      return;
    }

    const delayDebounceFn = setTimeout(async () => {
      setSearchingRegistry(true);
      try {
        const results = await searchOpenLibrary(reqTitle, reqMediaType);
        setOpenLibrarySuggestions(results || []);
      } catch (e) {
        console.error("Autocomplete search error:", e);
      } finally {
        setSearchingRegistry(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [reqTitle, reqMediaType]);

  useEffect(() => {
    if (selectedLibrary) {
      loadBooks(selectedLibrary.id);
    } else if (activeTab === "audiobooks") {
      loadBooks("audiobooks");
    } else if (activeTab === "libs") {
      loadBooks("ebooks");
    } else {
      setBooks([]);
    }
  }, [selectedLibrary, activeTab]);

  useEffect(() => {
    setVisibleCount(48);
  }, [searchQuery, sortBy, groupBySeries, activeTab, selectedLibrary]);

  async function loadBooks(libId: string) {
    setBooksLoading(true);
    try {
      const res = await fetch(
        `/api/books?libraryId=${encodeURIComponent(libId)}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.books) {
          setBooks(data.books);
          return;
        }
      }
      const bList = await getLibraryBooks(libId);
      setBooks(bList || []);
    } catch (e: any) {
      if (
        e?.message?.includes("Failed to find Server Action") ||
        String(e).includes("older or newer deployment")
      ) {
        window.location.reload();
      } else {
        console.error("Failed to load books:", e);
      }
    } finally {
      setBooksLoading(false);
    }
  }

  async function handleCreateOrUpdateLibrary(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.append("name", libName);
    formData.append("description", libDesc);
    formData.append("path", libPath);
    formData.append("allowedUsers", libAllowedUsers);
    formData.append("restrictedUsers", libRestrictedUsers);
    formData.append("downloadCategory", libDownloadCategory);
    formData.append("mediaType", libMediaType);

    try {
      let res: any;
      if (editingLibId) {
        formData.append("id", editingLibId);
        res = await updateLibrary(formData);
      } else {
        res = await createLibrary(formData);
      }

      if (res && res.error) {
        alert(res.error);
        return;
      }

      setLibName("");
      setLibDesc("");
      setLibPath("");
      setLibAllowedUsers("");
      setLibRestrictedUsers("");
      setLibDownloadCategory("books");
      setLibMediaType("ebook");
      setEditingLibId(null);

      let libs = await getLibraries().catch(() => []);
      if (!libs || libs.length === 0) {
        try {
          const apiRes = await fetch("/api/libraries");
          if (apiRes.ok) {
            const data = await apiRes.json();
            libs = data.libraries || [];
          }
        } catch (e) {}
      }
      setLibraries(libs || []);
    } catch (e: any) {
      console.error("Failed to save library:", e);
      alert(e.message || "Failed to save library.");
    }
  }

  async function handleDeleteLibrary(id: string) {
    if (
      !confirm(
        "Are you sure you want to delete this library and all its books? This cannot be undone.",
      )
    )
      return;
    try {
      const res = await deleteLibrary(id);
      if (res && res.error) {
        alert(res.error);
        return;
      }
      let libs = await getLibraries().catch(() => []);
      if (!libs || libs.length === 0) {
        try {
          const apiRes = await fetch("/api/libraries");
          if (apiRes.ok) {
            const data = await apiRes.json();
            libs = data.libraries || [];
          }
        } catch (e) {}
      }
      setLibraries(libs || []);
      if (selectedLibrary?.id === id) {
        setSelectedLibrary(libs && libs.length > 0 ? libs[0] : null);
      }
    } catch (e: any) {
      console.error("Failed to delete library:", e);
      alert(e.message || "Failed to delete library.");
    }
  }

  async function handleSeedLibraries() {
    try {
      const res = await seedDefaultLibraries();
      if (res && res.error) {
        alert(res.error);
      }
      let libs = await getLibraries().catch(() => []);
      if (!libs || libs.length === 0) {
        try {
          const apiRes = await fetch("/api/libraries");
          if (apiRes.ok) {
            const data = await apiRes.json();
            libs = data.libraries || [];
          }
        } catch (e) {}
      }
      setLibraries(libs || []);
      if (libs && libs.length > 0) {
        setSelectedLibrary(libs[0]);
      }
    } catch (e: any) {
      console.error("Failed to seed default libraries:", e);
      alert(e.message || "Failed to seed default libraries.");
    }
  }

  function startEditLibrary(lib: any) {
    setEditingLibId(lib.id);
    setLibName(lib.name);
    setLibDesc(lib.description || "");
    setLibPath(lib.path || "");
    setLibAllowedUsers(lib.allowedUsers || "*");
    setLibRestrictedUsers(lib.restrictedUsers || "");
    setLibDownloadCategory(
      lib.downloadCategory ||
        (lib.mediaType === "audiobook" ? "audiobooks" : "books"),
    );
    setLibMediaType(lib.mediaType || "ebook");
  }

  async function handleUploadBook(e: React.FormEvent) {
    e.preventDefault();
    if (!uploadFile || !uploadTitle || !selectedLibrary) return;

    setUploading(true);
    setUploadProgress(0);
    setUploadError("");

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("title", uploadTitle);
    formData.append("author", uploadAuthor);
    formData.append("libraryId", selectedLibrary.id);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/books/upload");

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = async () => {
      setUploading(false);
      if (xhr.status === 200) {
        setUploadFile(null);
        setUploadTitle("");
        setUploadAuthor("");
        loadBooks(selectedLibrary.id);
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setUploadError(res.error || "Upload failed");
        } catch (e) {
          setUploadError("Upload failed with server error");
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadError("Network error occurred during upload");
    };

    xhr.send(formData);
  }

  async function handleDeleteBook(id: string) {
    if (!confirm("Delete this book?")) return;
    try {
      await deleteBook(id);
      if (selectedLibrary) {
        loadBooks(selectedLibrary.id);
      }
    } catch (e) {
      console.error("Failed to delete book:", e);
    }
  }

  const [aiScanning, setAiScanning] = useState(false);

  async function handleScanLibrary(libId: string) {
    setScanning(true);
    try {
      const res = await scanLibrary(libId);
      if (res && !res.success && res.error) {
        alert(res.error);
      }
      await loadBooks(libId);
    } catch (e: any) {
      if (isServerActionMismatch(e)) {
        window.location.reload();
        return;
      }
      alert(e.message || "Failed to scan library folder");
    } finally {
      setScanning(false);
    }
  }

  async function handleAiScanLibrary(libId: string) {
    setAiScanning(true);
    try {
      const res = await runAiLibraryScanAction(libId);
      if (res && res.error) {
        alert(res.error);
      } else if (res && res.message) {
        alert(res.message);
      }
      await loadBooks(libId);
    } catch (e: any) {
      if (isServerActionMismatch(e)) {
        window.location.reload();
        return;
      }
      alert(e.message || "Failed AI library scan");
    } finally {
      setAiScanning(false);
    }
  }

  async function handleSaveKindleConfig(e: React.FormEvent) {
    e.preventDefault();
    const formData = new FormData();
    formData.append("email", userEmail);
    formData.append("kindleEmail", userKindleEmail);

    try {
      await saveUserKindleSettings(formData);
      const profile = await getCurrentUser();
      setFullUser(profile);
      alert("Settings updated successfully!");
    } catch (e: any) {
      alert(e.message || "Failed to update profile settings.");
    }
  }

  async function handleSendToKindle(bookId: string) {
    setSendingToKindleId(bookId);
    try {
      const res = await sendBookToKindle(bookId);
      if (res && !res.success) {
        alert(
          res.error ||
            "Delivery failed. Check your personal email inbox for instructions.",
        );
      } else {
        alert("Ebook successfully queued and delivered to your Kindle device!");
      }
    } catch (e: any) {
      alert(
        e.message ||
          "Delivery failed. Check your personal email inbox for instructions.",
      );
    } finally {
      setSendingToKindleId(null);
    }
  }

  async function handleSendToPersonalEmail(bookId: string) {
    setSendingToPersonalEmailId(bookId);
    try {
      const res = await sendBookToPersonalEmail(bookId);
      if (res && !res.success) {
        alert(res.error || "Failed to deliver email to personal inbox.");
      } else {
        alert("File successfully emailed to your personal inbox!");
      }
    } catch (e: any) {
      alert(e.message || "Failed to deliver email to personal inbox.");
    } finally {
      setSendingToPersonalEmailId(null);
    }
  }

  async function handleOpenChaptersModal(book: any) {
    setChaptersModalBook(book);
    setLoadingChapters(true);
    setChaptersList([]);
    setIsEditingChapters(false);
    try {
      const res = await getAudiobookChapters(book.id);
      if (res && res.success && res.chapters) {
        setChaptersList(res.chapters);
      } else if (res && !res.success) {
        alert(res.error || "Failed to load audiobook chapters.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to load audiobook chapters.");
    } finally {
      setLoadingChapters(false);
    }
  }

  async function handleSaveChapterOrder() {
    if (!chaptersModalBook || chaptersList.length === 0) return;
    setSavingChapters(true);
    try {
      const updated = chaptersList.map((ch, idx) => ({
        relativePath: ch.relativePath,
        newTrackNumber: Number(ch.trackNumber) || idx + 1,
      }));
      const res = await reorderAudiobookChapters(chaptersModalBook.id, updated);
      if (res && res.success) {
        const refreshed = await getAudiobookChapters(chaptersModalBook.id);
        if (refreshed && refreshed.success && refreshed.chapters) {
          setChaptersList(refreshed.chapters);
        }
        setIsEditingChapters(false);
        alert(res.message || "Chapters reordered and renamed successfully!");
      } else if (res && !res.success) {
        alert(res.error || "Failed to reorder chapters");
      }
    } catch (e: any) {
      alert(e.message || "Failed to save chapter order");
    } finally {
      setSavingChapters(false);
    }
  }

  async function handleAnalyzeChaptersWithAI() {
    if (!chaptersModalBook) return;
    setAnalyzingAiChapters(true);
    try {
      const res = await analyzeAudiobookChaptersAction(chaptersModalBook.id);
      if (res && res.success) {
        const refreshed = await getAudiobookChapters(chaptersModalBook.id);
        if (refreshed && refreshed.success && refreshed.chapters) {
          setChaptersList(refreshed.chapters);
        }
        alert(
          `✨ AI Agent successfully analyzed audio tracks and resolved official chapters for "${chaptersModalBook.title}"!`,
        );
      } else if (res && !res.success) {
        alert(res.error || "Failed to analyze audiobook chapters with AI.");
      }
    } catch (e: any) {
      alert(e.message || "Failed to analyze audiobook chapters with AI.");
    } finally {
      setAnalyzingAiChapters(false);
    }
  }

  function moveChapterTrack(index: number, direction: "up" | "down") {
    const newList = [...chaptersList];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newList.length) return;

    const temp = newList[index];
    newList[index] = newList[targetIndex];
    newList[targetIndex] = temp;

    newList.forEach((c, idx) => {
      c.trackNumber = idx + 1;
    });
    setChaptersList(newList);
  }

  function updateTrackNumber(index: number, val: string) {
    const num = parseInt(val, 10);
    const newList = [...chaptersList];
    newList[index].trackNumber = isNaN(num) ? "" : num;
    setChaptersList(newList);
  }

  function handlePlayChapter(book: any, chapters: any[], chapterIndex: number) {
    setActivePlayingTrack({
      bookId: book.id,
      bookTitle: book.title,
      bookAuthor: book.author,
      coverUrl: book.coverUrl,
      chapters: chapters,
      currentChapterIndex: chapterIndex,
    });
  }

  function handleNextChapter() {
    if (!activePlayingTrack) return;
    if (
      activePlayingTrack.currentChapterIndex <
      activePlayingTrack.chapters.length - 1
    ) {
      setActivePlayingTrack({
        ...activePlayingTrack,
        currentChapterIndex: activePlayingTrack.currentChapterIndex + 1,
      });
    }
  }

  function handlePrevChapter() {
    if (!activePlayingTrack) return;
    if (activePlayingTrack.currentChapterIndex > 0) {
      setActivePlayingTrack({
        ...activePlayingTrack,
        currentChapterIndex: activePlayingTrack.currentChapterIndex - 1,
      });
    }
  }

  async function triggerProwlarrSearch(req: any, overrideMediaType?: string, customQuery?: string) {
    const targetMediaType =
      overrideMediaType ||
      req.mediaType ||
      (activeTab === "audiobooks" ? "audiobook" : "ebook");
    const updatedReq = { ...req, mediaType: targetMediaType };
    setActiveRequestForSearch(updatedReq);
    setSearchingProwlarr(true);
    setProwlarrResults([]);
    setSearchProwlarrError("");

    // Clean the title by removing text inside parentheses (like "Enhanced Edition")
    const cleanTitle = (req.title || "").replace(/\s*\([^)]+\)\s*/g, " ").trim();
    
    // Set the initial custom query if not already typing (Title-only is best for Torznab)
    if (!customQuery && !customSearchQuery) {
        setCustomSearchQuery(cleanTitle);
    }
    
    try {
      const queryText = customQuery || customSearchQuery || cleanTitle;
      const res = await searchProwlarrIndexers(queryText, targetMediaType);
      setProwlarrResults(res || []);
    } catch (e: any) {
      setSearchProwlarrError(e.message || "Failed to search indexers.");
    } finally {
      setSearchingProwlarr(false);
    }
  }

  async function handleSendRelease(release: any) {
    if (!activeRequestForSearch) return;
    setPushingReleaseId(release.downloadUrl);
    try {
      await sendReleaseToDownloadClient(
        activeRequestForSearch.id,
        release.downloadUrl,
        release.title,
        release.protocol,
      );
      const reqs = await getBookRequests();
      setRequests(reqs || []);
      setActiveRequestForSearch(null);
      setCustomSearchQuery("");
      alert("Release successfully pushed to download client!");
    } catch (e: any) {
      showErrorModal(
        e.message || "Failed to send release to client.",
        "Download Client Error",
      );
    } finally {
      setPushingReleaseId(null);
    }
  }

  async function handleFetchMissingBooks(
    seriesName: string,
    author: string,
  ) {
    setLoadingMissingSeries((prev) => ({ ...prev, [seriesName]: true }));
    try {
      const res = await findMissingBooksInSeries(
        seriesName,
        author,
      );
      if (res.success && res.data) {
        setMissingBooksMap((prev) => ({ ...prev, [seriesName]: res.data }));
      } else {
        console.warn("Failed to fetch missing books: " + res.error);
      }
    } catch (e: any) {
      console.error("Error fetching missing books:", e.message);
    } finally {
      setLoadingMissingSeries((prev) => ({ ...prev, [seriesName]: false }));
    }
  }

  async function handleSearchAndReplaceRelease(book: any) {
    try {
      const detectedMediaType =
        activeTab === "audiobooks" ||
        book.mediaType === "audiobook" ||
        book.library?.mediaType === "audiobook"
          ? "audiobook"
          : "ebook";
      let req = requests.find(
        (r: any) =>
          (r.title.toLowerCase().includes(book.title.toLowerCase()) ||
            book.title.toLowerCase().includes(r.title.toLowerCase())) &&
          r.mediaType === detectedMediaType,
      );

      if (!req) {
          req = {
            id: "temp-" + Date.now(),
            title: book.title,
            author: book.author,
            mediaType: detectedMediaType,
            requestedBy: "system",
            status: "Approved",
          };
          // Open the modal instantly with a temporary request to prevent UI freezing
          setActiveRequestForSearch({ ...req });
          setSearchingProwlarr(true);

          const fd = new FormData();
          fd.append("title", book.title);
          fd.append("author", book.author || "");
          if (book.publishYear) fd.append("publishYear", String(book.publishYear));
          if (book.coverUrl) fd.append("coverUrl", book.coverUrl);
          fd.append("mediaType", detectedMediaType);
          fd.append("type", "single");
          if (selectedLibrary?.id) fd.append("libraryId", selectedLibrary.id);
          fd.append("disableAutoDownload", "true");

          createBookRequest(fd).then((res) => {
             if (res && res.error) {
                 showErrorModal(res.error, "Failed to prep request");
                 setActiveRequestForSearch(null);
                 return;
             }
             getBookRequests().then((reqs) => {
                 setRequests(reqs || []);
                 if (reqs) {
                     const realReq = reqs.find((r: any) => 
                         (r.title.toLowerCase().includes(book.title.toLowerCase()) || book.title.toLowerCase().includes(r.title.toLowerCase())) && 
                         r.mediaType === detectedMediaType
                     );
                     if (realReq) {
                         setActiveRequestForSearch((prev: any) => prev && prev.id && prev.id.startsWith("temp-") ? { ...prev, id: realReq.id } : prev);
                     }
                 }
             });
          }).catch(err => {
              showErrorModal(err.message, "Failed to prep request");
              setActiveRequestForSearch(null);
          });
        }

      if (!req) {
        req = {
          id: "temp-" + Date.now(),
          title: book.title,
          author: book.author,
          mediaType: detectedMediaType,
          requestedBy: user?.username || "system",
          status: "Approved",
        };
      }

      await triggerProwlarrSearch(req, detectedMediaType);
    } catch (err: any) {
      alert(err.message || "Failed to initiate release search.");
    }
  }

  async function handleAutoDownloadMissingBook(book: any) {
    try {
      const detectedMediaType =
        activeTab === "audiobooks" ||
        book.mediaType === "audiobook" ||
        book.library?.mediaType === "audiobook"
          ? "audiobook"
          : "ebook";

      const fd = new FormData();
      fd.append("title", book.title);
      fd.append("author", book.author || "");
      if (book.publishYear) fd.append("publishYear", String(book.publishYear));
      if (book.coverUrl) fd.append("coverUrl", book.coverUrl);
      fd.append("mediaType", detectedMediaType);
      fd.append("type", "single");
      if (selectedLibrary?.id) fd.append("libraryId", selectedLibrary.id);

      createBookRequest(fd).then((res) => {
             if (res && res.error) {
                 showErrorModal(res.error, "Failed to prep request");
                 setActiveRequestForSearch(null);
                 return;
             }
             getBookRequests().then((reqs) => {
                 setRequests(reqs || []);
                 if (reqs) {
                     const realReq = reqs.find((r: any) => 
                         (r.title.toLowerCase().includes(book.title.toLowerCase()) || book.title.toLowerCase().includes(r.title.toLowerCase())) && 
                         r.mediaType === detectedMediaType
                     );
                     if (realReq) {
                         setActiveRequestForSearch((prev: any) => prev && prev.id && prev.id.startsWith("temp-") ? { ...prev, id: realReq.id } : prev);
                     }
                 }
             });
          }).catch(err => {
              showErrorModal(err.message, "Failed to prep request");
              setActiveRequestForSearch(null);
          });
        
        alert(`Auto-download triggered for ${book.title}! Check the active queue in a moment.`);
    } catch (err: any) {
      alert(err.message || "Failed to trigger auto-download.");
    }
  }

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!reqTitle || !reqTitle.trim()) {
      showErrorModal(
        "Please enter a title for your book or audiobook request.",
        "Form Validation Error",
      );
      return;
    }

    setIsSubmittingRequest(true);
    try {
      let res: any;
      if (reqType === "series" && seriesBooksChecklist.length > 0) {
        const checkedBooks = seriesBooksChecklist.filter((b) => b.checked);
        if (checkedBooks.length === 0) {
          showErrorModal(
            "Please select at least one book in the series to request.",
            "Form Validation Error",
          );
          setIsSubmittingRequest(false);
          return;
        }
        res = await createMultipleBookRequests(
          checkedBooks,
          requestedFor,
          reqMediaType,
          selectedLibrary?.id,
        );
      } else {
        const formData = new FormData();
        formData.append("title", reqTitle.trim());
        formData.append("author", reqAuthor.trim());
        formData.append("type", reqType);
        formData.append("mediaType", reqMediaType);
        formData.append("coverUrl", reqCoverUrl);
        formData.append("publishYear", reqPublishYear);
        if (requestedFor) {
          formData.append("requestedFor", requestedFor);
        }
        if (selectedLibrary?.id) {
          formData.append("libraryId", selectedLibrary.id);
        }
        res = await createBookRequest(formData);
      }

      if (res && res.error) {
        showErrorModal(res.error, "Request Submission Error");
        return;
      }

      setReqTitle("");
      setReqAuthor("");
      setReqCoverUrl("");
      setReqPublishYear("");
      setReqType("book");
      setReqMediaType(activeTab === "audiobooks" ? "audiobook" : "ebook");
      setRequestedFor("");
      setSeriesBooksChecklist([]);
      const reqs = await getBookRequests();
      setRequests(reqs || []);
    } catch (e: any) {
      console.error("Failed to submit request:", e);
      showErrorModal(e.message || "Failed to submit request.", "Request Error");
    } finally {
      setIsSubmittingRequest(false);
    }
  }

  function toggleChecklistItem(index: number) {
    setSeriesBooksChecklist((prev) =>
      prev.map((item, idx) =>
        idx === index ? { ...item, checked: !item.checked } : item,
      ),
    );
  }

  function selectAllChecklist(checked: boolean) {
    setSeriesBooksChecklist((prev) =>
      prev.map((item) => ({ ...item, checked })),
    );
  }

  async function handleBulkDeleteRequests() {
    if (selectedRequestIds.length === 0) return;
    if (
      !confirm(
        `Are you sure you want to delete ${selectedRequestIds.length} selected requests?`,
      )
    )
      return;
    try {
      await deleteMultipleBookRequests(selectedRequestIds);
      setSelectedRequestIds([]);
      const reqs = await getBookRequests();
      setRequests(reqs || []);
    } catch (e: any) {
      alert(e.message || "Failed to delete selected requests.");
    }
  }

  function toggleSelectRequest(id: string) {
    setSelectedRequestIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  }

  function toggleSelectAllRequests() {
    const deletableRequests = requests.filter(
      (req) => isAdmin || req.requestedBy === user?.username,
    );
    const deletableIds = deletableRequests.map((r) => r.id);

    const allAlreadySelected = deletableIds.every((id) =>
      selectedRequestIds.includes(id),
    );
    if (allAlreadySelected) {
      setSelectedRequestIds((prev) =>
        prev.filter((id) => !deletableIds.includes(id)),
      );
    } else {
      setSelectedRequestIds((prev) => {
        const newIds = [...prev];
        deletableIds.forEach((id) => {
          if (!newIds.includes(id)) newIds.push(id);
        });
        return newIds;
      });
    }
  }

  function handleOpenReportIssueModal(item: {
    type: "book" | "audiobook" | "request";
    title: string;
    id: string;
    status?: string;
  }) {
    setReportName(user?.username || "");
    setReportEmail(user?.email || "");

    let prefilledIssue = "";
    if (item.type === "book") {
      prefilledIssue = `Issue with library book: "${item.title}" (ID: ${item.id})\n\nDescribe the issue: `;
    } else {
      prefilledIssue = `Issue with book request: "${item.title}" (ID: ${item.id}, Status: ${item.status || "Pending"})\n\nDescribe the issue: `;
    }

    setReportDescription(prefilledIssue);
    setIsReportModalOpen(true);
  }

  async function handleSendReport() {
    if (!reportName || !reportEmail || !reportDescription) {
      alert("All fields are required.");
      return;
    }
    setSubmittingReport(true);
    try {
      const formData = new FormData();
      formData.append("name", reportName);
      formData.append("email", reportEmail);
      formData.append("issue", reportDescription);
      const res = await submitSupportTicket(formData);
      if (res && res.error) {
        alert(res.error);
      } else {
        alert(
          "Support ticket submitted successfully! The administrator has been notified.",
        );
        setIsReportModalOpen(false);
        setReportDescription("");
      }
    } catch (e: any) {
      alert("Failed to submit support ticket.");
    } finally {
      setSubmittingReport(false);
    }
  }

  const handleOpenEditBookModal = (book: any) => {
    setEditBookId(book.id);
    setEditBookTitle(book.title);
    setEditBookAuthor(book.author || "");
    setEditBookCoverUrl(book.coverUrl || "");
    setEditBookError("");
    setIsEditBookModalOpen(true);
  };

  const handleSaveBookEdit = async () => {
    setUpdatingBook(true);
    setEditBookError("");
    try {
      await updateBook(
        editBookId,
        editBookTitle,
        editBookAuthor,
        editBookCoverUrl,
      );
      setIsEditBookModalOpen(false);
      if (selectedLibrary) {
        const books = await getLibraryBooks(selectedLibrary.id);
        setBooks(books);
      }
    } catch (err: any) {
      setEditBookError(err.message || "Failed to update book.");
    } finally {
      setUpdatingBook(false);
    }
  };

  async function handleUpdateRequestStatus(id: string, status: string) {
    try {
      await updateBookRequestStatus(id, status);
      const reqs = await getBookRequests();
      setRequests(reqs || []);
    } catch (e) {
      console.error("Failed to update request:", e);
    }
  }

  async function handleDeleteRequest(id: string) {
    if (!confirm("Are you sure you want to delete this request?")) return;
    try {
      await deleteBookRequest(id);
      const reqs = await getBookRequests();
      setRequests(reqs || []);
    } catch (e: any) {
      alert(e.message || "Failed to delete request.");
    }
  }

  const { sortedBooks, seriesGroups, standaloneBooks } = useMemo(() => {
    const sorted = [...books]
      .filter(
        (book) =>
          book.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (book.author &&
            book.author.toLowerCase().includes(searchQuery.toLowerCase())),
      )
      .sort((a, b) => {
        if (sortBy === "title-asc") {
          return a.title.localeCompare(b.title);
        }
        if (sortBy === "title-desc") {
          return b.title.localeCompare(a.title);
        }
        if (sortBy === "author-asc") {
          return (a.author || "").localeCompare(b.author || "");
        }
        if (sortBy === "author-desc") {
          return (b.author || "").localeCompare(a.author || "");
        }
        const dateA = new Date(a.createdAt || 0).getTime();
        const dateB = new Date(b.createdAt || 0).getTime();
        return dateB - dateA;
      });

    const sGroups: { [key: string]: typeof books } = {};
    const stBooks: typeof books = [];

    const reqSeries = (requests || [])
      .filter((r) => r && r.type === "series" && typeof r.title === "string")
      .map((r) => r.title.toLowerCase().trim());

    const dynamicSeriesSet = new Set<string>();
    for (const book of sorted) {
      if (book.series) {
        dynamicSeriesSet.add(book.series.toLowerCase().trim());
      } else {
        const info = extractSeriesInfo(book.title, book.filePath, []);
        if (info.seriesName) {
          dynamicSeriesSet.add(info.seriesName.toLowerCase().trim());
        }
      }
    }

    const combinedSeries = Array.from(
      new Set([...reqSeries, ...dynamicSeriesSet]),
    );

    if (groupBySeries) {
      for (const book of sorted) {
        const info = extractSeriesInfo(
          book.title,
          book.filePath,
          combinedSeries,
        );
        const seriesNameCandidate = book.series || info.seriesName;
        if (seriesNameCandidate) {
          let sName = seriesNameCandidate;
          if (book.author && book.author !== "Unknown Author") {
            sName = sName
              .replace(new RegExp("^" + book.author + "[:\\-\\s]+", "i"), "")
              .trim();
          }
          const formattedSeriesName = sName
            .split(" ")
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(" ");

          if (!sGroups[formattedSeriesName]) {
            sGroups[formattedSeriesName] = [];
          }
          const volumeNum =
            parseFloat(book.volumeNumber || info.volume || "0") || 0;
          (book as any).seriesVolume = volumeNum;
          (book as any).cleanSeriesTitle = info.bookTitle || book.title;
          sGroups[formattedSeriesName].push(book);
        } else {
          stBooks.push(book);
        }
      }

      for (const seriesName in sGroups) {
        sGroups[seriesName].sort(
          (a, b) =>
            ((a as any).seriesVolume || 0) - ((b as any).seriesVolume || 0),
        );
      }
    } else {
      stBooks.push(...sorted);
    }

    return {
      sortedBooks: sorted,
      seriesGroups: sGroups,
      standaloneBooks: stBooks,
    };
  }, [books, searchQuery, sortBy, requests, groupBySeries]);



  const eligibleRequestUsers = allUsers.filter((u) => {
    // 1. Has Kindle email configured
    if (u.kindleEmail) return true;

    // 2. Is admin
    if (u.role === "ADMIN") return true;

    // 3. Has access to at least one library
    const hasLibraryAccess = libraries.some((lib) => {
      const restrictedStr = lib.restrictedUsers || "";
      if (
        restrictedStr &&
        restrictedStr
          .split(",")
          .map((usr: string) => usr.trim().toLowerCase())
          .includes(u.username.toLowerCase())
      ) {
        return false;
      }
      const allowedStr = lib.allowedUsers || "";
      if (allowedStr === "*") return true;
      const allowedList = allowedStr
        .split(",")
        .map((usr: string) => usr.trim().toLowerCase());
      return allowedList.includes(u.username.toLowerCase());
    });

    return hasLibraryAccess;
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const isKindleConfigured =
    (!!userKindleEmail && userKindleEmail.trim() !== "") || skippedKindleGate;

  if (!isKindleConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background via-muted/50 to-background px-4 py-12">
        <Card className="w-full max-w-lg border-primary/30 shadow-2xl bg-card/95 backdrop-blur-sm">
          <CardHeader className="text-center space-y-3 pb-4">
            <div className="mx-auto bg-primary/10 border border-primary/20 p-4 rounded-2xl w-fit">
              <Mail className="h-10 w-10 text-primary" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Send-to-Kindle Setup
            </CardTitle>
            <CardDescription className="text-sm text-muted-foreground leading-relaxed max-w-md mx-auto">
              Configure your Send-to-Kindle email for 1-click automatic ebook
              delivery directly to your e-reader, or skip to browse and download
              manually.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleSaveKindleConfig} className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="gate-kindle-email"
                  className="text-xs font-semibold"
                >
                  Send-to-Kindle Email Address
                </Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="gate-kindle-email"
                    type="email"
                    className="pl-9"
                    placeholder="username_123@kindle.com"
                    value={userKindleEmail}
                    onChange={(e) => setUserKindleEmail(e.target.value)}
                  />
                </div>
                {userKindleEmail.trim() &&
                  !userKindleEmail.toLowerCase().endsWith("@kindle.com") &&
                  !userKindleEmail
                    .toLowerCase()
                    .endsWith("@free.kindle.com") && (
                    <div className="flex items-start gap-2 mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <p>
                        <strong>Warning:</strong> Send-to-Kindle emails
                        typically end in @kindle.com. Please make sure you are
                        not entering your personal Amazon login email.
                      </p>
                    </div>
                  )}
                <p className="text-[11px] text-muted-foreground leading-snug pt-1">
                  Find your Kindle email under your Amazon Account &gt;{" "}
                  <em>Content &amp; Devices</em> &gt; <em>Preferences</em> &gt;{" "}
                  <em>Personal Document Settings</em>.
                </p>
              </div>

              <div className="space-y-2">
                <Label
                  htmlFor="gate-personal-email"
                  className="text-xs font-semibold"
                >
                  Personal Contact Email
                </Label>
                <Input
                  id="gate-personal-email"
                  type="email"
                  placeholder="you@example.com"
                  value={userEmail}
                  onChange={(e) => setUserEmail(e.target.value)}
                />
              </div>

              <div className="space-y-3 pt-2">
                <div className="p-3.5 bg-red-500/15 border border-red-500/40 rounded-xl space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                    <AlertTriangle className="h-5 w-5" />
                    CRITICAL: Amazon Approved Senders
                  </div>
                  <p className="text-xs text-red-200 leading-relaxed">
                    Amazon will silently delete your books unless you whitelist
                    our server. You <strong>MUST</strong> add the Portalarr
                    server email address to your Amazon "Approved Personal
                    Document E-mail List" before saving.
                  </p>
                  <div className="bg-red-950/40 p-2 rounded text-[11px] font-mono text-red-300 border border-red-500/20 text-center select-all">
                    {serverSmtpFrom || "Loading server email..."}
                  </div>
                  <p className="text-[10px] text-red-300/80 mt-1">
                    Go to: Amazon.com &gt; Account &gt; Content &amp; Devices
                    &gt; Preferences &gt; Personal Document Settings &gt; Add a
                    new approved e-mail address.
                  </p>
                </div>

                <Button
                  type="submit"
                  className="w-full h-11 font-semibold text-black gap-2"
                >
                  <Sparkles className="h-4 w-4" /> Save Email &amp; Unlock
                  Automatic Delivery
                </Button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-muted/50"></div>
                  <span className="flex-shrink mx-3 text-[10px] text-muted-foreground uppercase font-semibold">
                    or
                  </span>
                  <div className="flex-grow border-t border-muted/50"></div>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  className="w-full h-10 border-muted-foreground/30 hover:bg-muted/40 text-xs font-medium gap-2"
                  onClick={() => {
                    setSkippedKindleGate(true);
                    localStorage.setItem("portalarr-skip-kindle-gate", "true");
                  }}
                >
                  <ArrowRight className="h-3.5 w-3.5" /> Skip for Now &amp;
                  Browse Library
                </Button>

                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-xl text-xs text-amber-300/90 leading-relaxed flex items-start gap-2.5">
                  <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <strong>Note:</strong> If you skip, ebooks cannot be
                    automatically sent to your e-reader. You will need to
                    download and add book files to your device manually, or
                    configure your Kindle email later under Kindle Settings in
                    the header.
                  </div>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  const audiobookLibraries = libraries.filter(
    (l) =>
      l.mediaType === "audiobook" ||
      l.name.toLowerCase().includes("audio") ||
      l.downloadCategory === "audiobooks",
  );
  const ebookLibraries = libraries.filter(
    (l) => !audiobookLibraries.some((a) => a.id === l.id),
  );

  return (
    <div className="min-h-screen bg-background flex flex-col p-4 sm:p-6 animate-in fade-in duration-500 max-w-7xl mx-auto w-full space-y-6">
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-4 border-b border-muted/50 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
            <BookOpen className="h-8 w-8 text-primary" /> Book &amp; Audiobook
            Library
          </h1>
          <p className="text-muted-foreground text-sm">
            A unified portal for ebooks, audiobooks, and media requests.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
            onClick={() => handleTabChange("kindle")}
            title="Configure Send-to-Kindle Settings"
          >
            <Mail className="h-3.5 w-3.5 text-primary" />
            <span>Kindle: {userKindleEmail || "Not Configured"}</span>
          </Button>
          {isAdmin && (
            <Badge
              variant="outline"
              className="flex items-center gap-1 border-primary/30 text-primary w-fit"
            >
              <Shield className="h-3 w-3" /> Admin Dashboard Mode
            </Badge>
          )}
        </div>
      </header>

      <Tabs
        value={activeTab}
        onValueChange={handleTabChange}
        className="w-full space-y-6"
      >
        <TabsList className="flex flex-wrap sm:flex-nowrap w-full max-w-3xl h-auto p-1.5 bg-slate-900/90 border border-slate-800/80 rounded-xl gap-1.5 shadow-md">
          <TabsTrigger
            value="libs"
            className="py-2 px-3 sm:px-4 flex-1 flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-slate-950 data-[state=active]:font-bold data-[state=active]:shadow-md"
          >
            <BookOpen className="h-4 w-4 shrink-0" /> <span>Ebooks</span>
          </TabsTrigger>
          <TabsTrigger
            value="audiobooks"
            className="py-2 px-3 sm:px-4 flex-1 flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-slate-950 data-[state=active]:font-bold data-[state=active]:shadow-md"
          >
            <Headphones className="h-4 w-4 shrink-0" /> <span>Audiobooks</span>
          </TabsTrigger>
          <TabsTrigger
            value="requests"
            className="py-2 px-3 sm:px-4 flex-1 flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-slate-950 data-[state=active]:font-bold data-[state=active]:shadow-md"
          >
            <Send className="h-4 w-4 shrink-0" /> <span>Requests</span>
          </TabsTrigger>
          {isAdmin && (
            <TabsTrigger
              value="manage"
              className="py-2 px-3 sm:px-4 flex-1 flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-slate-950 data-[state=active]:font-bold data-[state=active]:shadow-md"
            >
              <Plus className="h-4 w-4 shrink-0" /> <span>Manage</span>
            </TabsTrigger>
          )}
          <TabsTrigger
            value="kindle"
            className="py-2 px-3 sm:px-4 flex-1 flex items-center justify-center gap-2 rounded-lg text-xs sm:text-sm font-semibold transition-all data-[state=active]:bg-primary data-[state=active]:text-slate-950 data-[state=active]:font-bold data-[state=active]:shadow-md"
          >
            <Mail className="h-4 w-4 text-primary data-[state=active]:text-slate-950 shrink-0" />{" "}
            <span>Kindle</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="libs" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card className="border-muted/60 bg-muted/10">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-primary" /> Ebook
                    Libraries
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-1">
                  {ebookLibraries.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground italic">
                      No ebook libraries available.
                    </div>
                  ) : (
                    ebookLibraries.map((lib) => {
                      const isSelected = selectedLibrary?.id === lib.id;
                      const accessInfo = getAccessBadge(lib);
                      return (
                        <button
                          key={lib.id}
                          onClick={() => setSelectedLibrary(lib)}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-between gap-2 border ${
                            isSelected
                              ? "bg-slate-900 border-primary/80 shadow-md ring-1 ring-primary/30 text-primary"
                              : "bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-900/60 hover:text-white"
                          }`}
                        >
                          <span className="font-bold text-sm truncate">
                            {lib.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-2 py-0.5 font-bold shrink-0 ${
                              isSelected
                                ? "bg-primary text-black border-primary font-extrabold"
                                : accessInfo.color
                            }`}
                          >
                            {accessInfo.label}
                          </Badge>
                        </button>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-6">
              {selectedLibrary ? (
                <>
                  <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-col sm:flex-row gap-3 items-center w-full lg:max-w-3xl">
                      <div className="relative w-full sm:flex-1">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search books by title or author..."
                          className="pl-9 bg-muted/20"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 items-center w-full sm:w-auto shrink-0 justify-between sm:justify-start">
                        <select
                          value={sortBy}
                          onChange={(e) => handleSortChange(e.target.value)}
                          className="flex h-10 w-auto min-w-[170px] px-3.5 items-center justify-between rounded-md border border-slate-800 bg-slate-900 text-slate-100 hover:bg-slate-800/80 text-sm focus:outline-none font-medium cursor-pointer transition-all shadow-sm"
                        >
                          <option
                            value="recent"
                            className="bg-slate-955 text-slate-100"
                          >
                            Recently Added
                          </option>
                          <option
                            value="title-asc"
                            className="bg-slate-955 text-slate-100"
                          >
                            Title (A-Z)
                          </option>
                          <option
                            value="title-desc"
                            className="bg-slate-955 text-slate-100"
                          >
                            Title (Z-A)
                          </option>
                          <option
                            value="author-asc"
                            className="bg-slate-955 text-slate-100"
                          >
                            Author (A-Z)
                          </option>
                          <option
                            value="author-desc"
                            className="bg-slate-955 text-slate-100"
                          >
                            Author (Z-A)
                          </option>
                        </select>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-200 cursor-pointer select-none bg-slate-900 border border-slate-800 px-3 h-10 rounded-md hover:bg-slate-800/80 transition-all shrink-0">
                          <input
                            type="checkbox"
                            checked={groupBySeries}
                            onChange={(e) =>
                              handleGroupToggle(e.target.checked)
                            }
                            className="rounded border-slate-700 bg-slate-955 text-primary focus:ring-0 focus:ring-offset-0 h-4 w-4 cursor-pointer accent-primary"
                          />
                          <span>Group Series</span>
                        </label>
                      </div>
                    </div>
                    {selectedLibrary.path && (
                      <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                        <Button
                          variant="outline"
                          onClick={() => handleScanLibrary(selectedLibrary.id)}
                          disabled={scanning || aiScanning}
                          className="w-full sm:w-auto font-semibold border-primary/20 text-primary hover:bg-primary/5 shrink-0"
                        >
                          {scanning ? (
                            <>
                              <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" />{" "}
                              Scanning...
                            </>
                          ) : (
                            <>
                              <UploadCloud className="mr-2 h-4.5 w-4.5" /> Scan
                              Share Folder
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            handleAiScanLibrary(selectedLibrary.id)
                          }
                          disabled={scanning || aiScanning}
                          className="w-full sm:w-auto font-semibold border-amber-500/40 text-amber-300 hover:bg-amber-500/10 shrink-0 gap-1.5"
                          title="Run AI Metadata Resolution & HD Cover Art Fetching on this library"
                        >
                          {aiScanning ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />{" "}
                              Resolving AI...
                            </>
                          ) : (
                            <>
                              <Wand2 className="h-4 w-4 text-amber-400" /> AI
                              Resolve Library
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {isAdmin && (
                    <Card className="border-dashed border-primary/20 bg-primary/5">
                      <CardHeader className="py-4">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <UploadCloud className="h-4 w-4 text-primary" />{" "}
                          Upload Book to "{selectedLibrary.name}"
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pb-4">
                        <form
                          onSubmit={handleUploadBook}
                          className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
                        >
                          <div className="space-y-1.5 md:col-span-1">
                            <Label htmlFor="uploadFile" className="text-xs">
                              Book File (PDF/EPUB)
                            </Label>
                            <Input
                              id="uploadFile"
                              type="file"
                              accept=".pdf,.epub"
                              className="bg-background cursor-pointer text-xs"
                              onChange={(e) => {
                                const file = e.target.files?.[0] || null;
                                setUploadFile(file);
                                if (file && !uploadTitle) {
                                  const nameWithoutExt =
                                    file.name.substring(
                                      0,
                                      file.name.lastIndexOf("."),
                                    ) || file.name;
                                  setUploadTitle(
                                    nameWithoutExt.replace(/[_-]/g, " "),
                                  );
                                }
                              }}
                              required
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-1">
                            <Label htmlFor="uploadTitle" className="text-xs">
                              Title
                            </Label>
                            <Input
                              id="uploadTitle"
                              type="text"
                              placeholder="e.g. Dune"
                              className="bg-background text-xs"
                              value={uploadTitle}
                              onChange={(e) => setUploadTitle(e.target.value)}
                              required
                            />
                          </div>
                          <div className="space-y-1.5 md:col-span-1">
                            <Label htmlFor="uploadAuthor" className="text-xs">
                              Author
                            </Label>
                            <Input
                              id="uploadAuthor"
                              type="text"
                              placeholder="e.g. Frank Herbert"
                              className="bg-background text-xs"
                              value={uploadAuthor}
                              onChange={(e) => setUploadAuthor(e.target.value)}
                            />
                          </div>
                          <Button
                            type="submit"
                            disabled={uploading || !uploadFile}
                            className="w-full md:col-span-1 font-semibold text-black"
                          >
                            {uploading ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />{" "}
                                {uploadProgress}%
                              </>
                            ) : (
                              "Upload"
                            )}
                          </Button>
                        </form>

                        {uploading && (
                          <div className="mt-4 space-y-1.5">
                            <Progress
                              value={uploadProgress}
                              className="h-1.5"
                            />
                            <p className="text-[10px] text-muted-foreground text-right font-medium">
                              Uploading file...
                            </p>
                          </div>
                        )}
                        {uploadError && (
                          <div className="mt-2 text-xs text-red-500 font-medium">
                            {uploadError}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {booksLoading ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-8">
                      {[1, 2, 3, 4].map((n) => (
                        <div
                          key={n}
                          className="h-56 bg-muted/20 animate-pulse rounded-lg border border-muted/50"
                        />
                      ))}
                    </div>
                  ) : sortedBooks.length === 0 ? (
                    <div className="text-center p-16 text-muted-foreground border border-dashed rounded-lg bg-muted/5">
                      <Sparkles className="h-8 w-8 text-primary/30 mx-auto mb-2" />
                      <p className="text-sm font-medium">
                        No books in this library shelf.
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Upload some books or request one in the Request tab.
                      </p>
                    </div>
                  ) : groupBySeries ? (
                    <div className="space-y-8">
                      {Object.entries(seriesGroups)
                        .slice(0, visibleCount)
                        .map(([seriesName, seriesBooks]) => {
                          const actualMissing = (
                            missingBooksMap[seriesName] || []
                          ).filter((mBook: any) => {
                            const mTitle = mBook.title.toLowerCase();
                            return !seriesBooks.some((b: any) => {
                              if (b.fileType === "missing") return false;
                              const bTitle = (
                                b.cleanSeriesTitle || b.title
                              ).toLowerCase();
                              return (
                                bTitle.includes(mTitle) ||
                                mTitle.includes(bTitle)
                              );
                            });
                          });

                          return (
                            <div
                              key={seriesName}
                              className="space-y-4 border border-slate-800/80 p-4 rounded-xl bg-slate-900/10 animate-in fade-in duration-300"
                            >
                              <h3 className="text-sm font-extrabold text-primary flex items-center gap-2 border-b border-slate-800 pb-2">
                                📚 {seriesName}
                                <Badge
                                  variant="outline"
                                  className="text-[10px] py-0 border-primary/40 text-primary font-bold bg-primary/5"
                                >
                                  {seriesBooks.length}{" "}
                                  {seriesBooks.length === 1 ? "Book" : "Books"}
                                </Badge>
                                {loadingMissingSeries[seriesName] && (
                                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground ml-2" />
                                )}
                                {!missingBooksMap[seriesName] && !loadingMissingSeries[seriesName] && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 px-2 text-[10px] ml-auto hover:bg-primary/20 hover:text-primary"
                                    onClick={() => handleFetchMissingBooks(seriesName, seriesBooks[0].author || "Unknown")}
                                  >
                                    <Search className="h-3 w-3 mr-1" />
                                    Show Missing Books
                                  </Button>
                                )}
                              </h3>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                                {seriesBooks.map((book) =>
                                  renderBookCard(book),
                                )}
                              </div>

                              {actualMissing.length > 0 && (
                                <div className="mt-6 pt-4 border-t border-slate-800/50 border-dashed">
                                  <h4 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider flex items-center gap-2">
                                    <Library className="h-3 w-3" /> Missing from
                                    Series
                                  </h4>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6 opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
                                    {actualMissing.map(
                                      (book: any, i: number) => {
                                        const extMissing = extractSeriesInfo(book.title, "", [seriesName]);
                                        return (
                                        <div
                                          key={i}
                                          className="flex gap-4 border rounded-xl p-3 bg-card border-dashed"
                                        >
                                          <div className="w-16 h-24 shrink-0 bg-muted rounded overflow-hidden shadow-sm relative group">
                                            {book.coverUrl ? (
                                              <img
                                                src={book.coverUrl}
                                                alt="cover"
                                                className="w-full h-full object-cover"
                                              />
                                            ) : (
                                              <div className="w-full h-full flex flex-col items-center justify-center text-xs text-muted-foreground text-center bg-slate-900/50 p-1">
                                                <BookOpen className="h-6 w-6 mb-1 opacity-20" />
                                                No Cover
                                              </div>
                                            )}
                                          </div>
                                          <div className="flex flex-col flex-1 min-w-0 py-1">
                                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                                              <h4
                                                className="font-bold text-sm truncate pr-2 text-primary"
                                                title={book.title}
                                              >
                                                {extMissing.bookTitle}
                                              </h4>
                                              {(book.volumeNumber || extMissing.volume) && (
                                                <Badge variant="outline" className="text-[9px] h-4 px-1 py-0 bg-primary/10 text-primary border-primary/20">
                                                  Vol {book.volumeNumber || extMissing.volume}
                                                </Badge>
                                              )}
                                            </div>
                                            <p
                                              className="text-xs text-muted-foreground truncate mb-1"
                                              title={book.author}
                                            >
                                              {book.author}
                                            </p>
                                            <div className="mt-auto pt-2 flex flex-col gap-1">
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="w-full h-7 text-[10px] bg-slate-900 border-slate-700 hover:bg-primary/20 hover:text-primary hover:border-primary/50 transition-all"
                                                onClick={() =>
                                                  handleAutoDownloadMissingBook(
                                                    {
                                                      ...book,
                                                      mediaType:
                                                        activeTab ===
                                                        "audiobooks"
                                                          ? "audiobook"
                                                          : "ebook",
                                                    },
                                                  )
                                                }
                                              >
                                                <Download className="h-3 w-3 mr-1" />{" "}
                                                Auto Grab
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="outline"
                                                className="w-full h-7 text-[10px] bg-slate-900 border-slate-700 hover:bg-primary/20 hover:text-primary hover:border-primary/50 transition-all"
                                                onClick={() =>
                                                  handleSearchAndReplaceRelease(
                                                    {
                                                      ...book,
                                                      mediaType:
                                                        activeTab ===
                                                        "audiobooks"
                                                          ? "audiobook"
                                                          : "ebook",
                                                    },
                                                  )
                                                }
                                              >
                                                <Search className="h-3 w-3 mr-1" />{" "}
                                                Search
                                              </Button>
                                            </div>
                                          </div>
                                        </div>
                                      );
                                      },
                                    )}
                                  </div>
                                </div>
                              )}
                              {missingBooksMap[seriesName] !== undefined &&
                                actualMissing.length === 0 && (
                                  <div className="mt-4 text-xs text-muted-foreground italic">
                                    No missing books found for this series.
                                  </div>
                                )}
                            </div>
                          );
                        })}
                      {standaloneBooks.slice(
                        0,
                        Math.max(
                          0,
                          visibleCount - Object.keys(seriesGroups).length,
                        ),
                      ).length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-slate-800">
                          <h3 className="text-sm font-extrabold text-slate-300 flex items-center gap-2 border-b border-slate-800 pb-2">
                            📖 Standalone & Uncategorized Books
                            <Badge
                              variant="outline"
                              className="text-[10px] py-0 border-slate-700 text-slate-300 font-bold bg-slate-900/45"
                            >
                              {standaloneBooks.length}{" "}
                              {standaloneBooks.length === 1 ? "Book" : "Books"}
                            </Badge>
                          </h3>
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                            {standaloneBooks
                              .slice(
                                0,
                                Math.max(
                                  0,
                                  visibleCount -
                                    Object.keys(seriesGroups).length,
                                ),
                              )
                              .map((book) => renderBookCard(book))}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                      {sortedBooks
                        .slice(0, visibleCount)
                        .map((book) => renderBookCard(book))}
                    </div>
                  )}
                  {visibleCount <
                    (groupBySeries
                      ? Object.keys(seriesGroups).length +
                        standaloneBooks.length
                      : sortedBooks.length) && (
                    <div className="flex justify-center pt-8">
                      <Button
                        variant="outline"
                        onClick={() => setVisibleCount((v) => v + 48)}
                      >
                        Load More Books
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-16 text-muted-foreground border border-dashed rounded-lg bg-muted/5">
                  <p className="text-sm font-semibold">
                    Select a library from the panel to view its books.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="audiobooks" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            <div className="lg:col-span-1 space-y-4">
              <Card className="border-muted/60 bg-muted/10 overflow-hidden">
                <CardHeader className="py-4">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                    <Headphones className="h-4 w-4 text-primary" /> Audiobook
                    Libraries
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-1">
                  {audiobookLibraries.length === 0 ? (
                    <div className="p-4 text-center text-xs text-muted-foreground italic space-y-3">
                      <p>No audiobook libraries configured yet.</p>
                      {isAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs text-foreground border-muted hover:bg-muted/20 mt-1"
                          onClick={() => {
                            setLibName("Audiobooks");
                            setLibMediaType("audiobook");
                            setLibDownloadCategory("audiobooks");
                            setLibPath("/audiobooks");
                            handleTabChange("manage");
                          }}
                        >
                          <Plus className="h-3 w-3 mr-1" /> Add Audiobook
                          Library
                        </Button>
                      )}
                    </div>
                  ) : (
                    audiobookLibraries.map((lib) => {
                      const isSelected = selectedLibrary?.id === lib.id;
                      const accessInfo = getAccessBadge(lib);
                      return (
                        <button
                          key={lib.id}
                          onClick={() => setSelectedLibrary(lib)}
                          className={`w-full text-left px-3.5 py-2.5 rounded-xl transition-all duration-200 flex items-center justify-between gap-2 border ${
                            isSelected
                              ? "bg-slate-900 border-primary/80 shadow-md ring-1 ring-primary/30 text-primary font-bold"
                              : "bg-slate-950/40 border-slate-800 text-slate-300 hover:bg-slate-900/60 hover:text-white"
                          }`}
                        >
                          <span className="font-bold text-sm truncate">
                            {lib.name}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-2 py-0.5 font-bold shrink-0 ${
                              isSelected
                                ? "bg-primary text-black border-primary font-extrabold"
                                : accessInfo.color
                            }`}
                          >
                            {accessInfo.label}
                          </Badge>
                        </button>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-3 space-y-6">
              {selectedLibrary && selectedLibrary.mediaType === "audiobook" ? (
                <>
                  <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                    <div className="flex flex-col sm:flex-row gap-3 items-center w-full lg:max-w-3xl">
                      <div className="relative w-full sm:flex-1">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                          type="search"
                          placeholder="Search audiobooks by title or author..."
                          className="pl-9 bg-muted/20"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                        />
                      </div>
                      <div className="flex gap-2 items-center w-full sm:w-auto shrink-0 justify-between sm:justify-start">
                        <select
                          value={sortBy}
                          onChange={(e) => handleSortChange(e.target.value)}
                          className="flex h-10 w-auto min-w-[170px] px-3.5 items-center justify-between rounded-md border border-muted/60 bg-muted/20 text-foreground hover:bg-muted/30 text-sm focus:outline-none font-medium cursor-pointer transition-all shadow-sm"
                        >
                          <option
                            value="recent"
                            className="bg-slate-955 text-slate-100"
                          >
                            Recently Added
                          </option>
                          <option
                            value="title-asc"
                            className="bg-slate-955 text-slate-100"
                          >
                            Title (A-Z)
                          </option>
                          <option
                            value="title-desc"
                            className="bg-slate-955 text-slate-100"
                          >
                            Title (Z-A)
                          </option>
                          <option
                            value="author-asc"
                            className="bg-slate-955 text-slate-100"
                          >
                            Author (A-Z)
                          </option>
                          <option
                            value="author-desc"
                            className="bg-slate-955 text-slate-100"
                          >
                            Author (Z-A)
                          </option>
                        </select>
                      </div>
                    </div>
                    {selectedLibrary.path && (
                      <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-auto">
                        <Button
                          variant="outline"
                          onClick={() => handleScanLibrary(selectedLibrary.id)}
                          disabled={scanning || aiScanning}
                          className="w-full sm:w-auto font-semibold border-muted/60 text-foreground hover:bg-muted/30 shrink-0"
                        >
                          {scanning ? (
                            <>
                              <Loader2 className="mr-2 h-4.5 w-4.5 animate-spin" />{" "}
                              Scanning...
                            </>
                          ) : (
                            <>
                              <UploadCloud className="mr-2 h-4.5 w-4.5" /> Scan
                              Audio Folder
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() =>
                            handleAiScanLibrary(selectedLibrary.id)
                          }
                          disabled={scanning || aiScanning}
                          className="w-full sm:w-auto font-semibold border-amber-500/40 text-amber-300 hover:bg-amber-500/10 shrink-0 gap-1.5"
                          title="Run AI Metadata Resolution & HD Cover Art Fetching on this library"
                        >
                          {aiScanning ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin text-amber-400" />{" "}
                              Resolving AI...
                            </>
                          ) : (
                            <>
                              <Wand2 className="h-4 w-4 text-amber-400" /> AI
                              Resolve Library
                            </>
                          )}
                        </Button>
                      </div>
                    )}
                  </div>

                  {booksLoading ? (
                    <div className="p-12 text-center text-muted-foreground flex justify-center items-center">
                      <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                    </div>
                  ) : sortedBooks.length === 0 ? (
                    <div className="text-center p-12 text-muted-foreground border border-dashed rounded-lg bg-muted/5 space-y-2">
                      <Headphones className="h-10 w-10 mx-auto text-muted-foreground/40" />
                      <p className="text-sm font-semibold">
                        No audiobooks found in this library.
                      </p>
                      <p className="text-xs">
                        Scan the library share folder above or submit an
                        Audiobook request.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6">
                      {sortedBooks
                        .slice(0, visibleCount)
                        .map((book) => renderAudiobookCard(book))}
                    </div>
                  )}
                  {visibleCount < sortedBooks.length && (
                    <div className="flex justify-center pt-8">
                      <Button
                        variant="outline"
                        onClick={() => setVisibleCount((v) => v + 48)}
                      >
                        Load More Audiobooks
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center p-16 text-muted-foreground border border-dashed rounded-lg bg-muted/5 space-y-3">
                  <Headphones className="h-12 w-12 mx-auto text-amber-400/60" />
                  <p className="text-sm font-semibold">
                    Select an audiobook library from the left panel to listen
                    and browse files.
                  </p>
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="requests" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card className="border-muted/60 bg-muted/10 sticky top-6">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    {reqMediaType === "audiobook" ? (
                      <>
                        <Headphones className="h-5 w-5 text-amber-400" />{" "}
                        Request an Audiobook
                      </>
                    ) : (
                      <>
                        <BookOpen className="h-5 w-5 text-primary" /> Request an
                        Ebook
                      </>
                    )}
                  </CardTitle>
                  <CardDescription>
                    {reqMediaType === "audiobook"
                      ? "Can't find an audiobook in the library? Request to download it."
                      : "Can't find an ebook in the library? Request to download it."}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCreateRequest} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-medium">
                        Format / Media Type
                      </Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant={
                            reqMediaType === "ebook" ? "default" : "outline"
                          }
                          className={`h-9 text-xs font-semibold gap-1.5 ${reqMediaType === "ebook" ? "text-black bg-primary" : ""}`}
                          onClick={() => setReqMediaType("ebook")}
                        >
                          <BookOpen className="h-3.5 w-3.5" /> Ebook
                        </Button>
                        <Button
                          type="button"
                          variant={
                            reqMediaType === "audiobook" ? "default" : "outline"
                          }
                          className={`h-9 text-xs font-semibold gap-1.5 ${reqMediaType === "audiobook" ? "text-black bg-amber-400 hover:bg-amber-300" : ""}`}
                          onClick={() => setReqMediaType("audiobook")}
                        >
                          <Headphones className="h-3.5 w-3.5" /> Audiobook
                        </Button>
                      </div>
                    </div>
                    {/* Single Book request only */}

                    <div className="space-y-1.5 relative">
                      <Label htmlFor="reqTitle" className="text-xs font-medium">
                        {reqType === "series"
                          ? "Series Title"
                          : reqMediaType === "audiobook"
                            ? "Audiobook Title"
                            : "Book Title"}
                      </Label>
                      <Input
                        id="reqTitle"
                        type="text"
                        placeholder="e.g. Project Hail Mary"
                        value={reqTitle}
                        onChange={(e) => {
                          setReqTitle(e.target.value);
                          setShowSuggestions(true);
                        }}
                        onFocus={() => setShowSuggestions(true)}
                        required
                        autoComplete="off"
                      />

                      {showSuggestions && (
                        <div
                          className="fixed inset-0 z-40 bg-transparent"
                          onClick={() => setShowSuggestions(false)}
                        />
                      )}

                      {showSuggestions && reqTitle.trim().length >= 2 && (
                        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-[#1e1e24] text-foreground border border-muted/80 rounded-md shadow-xl max-h-60 overflow-y-auto divide-y divide-muted/50">
                          {searchingRegistry ? (
                            <div className="p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                              Searching book registry...
                            </div>
                          ) : openLibrarySuggestions.length === 0 ? (
                            <div className="p-3 text-center text-xs text-muted-foreground italic">
                              No matches found in registry.
                            </div>
                          ) : (
                            openLibrarySuggestions.map((book, idx) => (
                              <div
                                key={idx}
                                className="p-2 flex gap-3 hover:bg-muted/40 cursor-pointer items-start transition-colors z-50 relative"
                                onMouseDown={async () => {
                                  setReqTitle(book.title);
                                  setReqAuthor(book.author);
                                  setReqCoverUrl(book.coverUrl || "");
                                  setReqPublishYear(
                                    book.year ? String(book.year) : "",
                                  );
                                  setShowSuggestions(false);

                                  if (reqType === "series") {
                                    setSearchingRegistry(true);
                                    try {
                                      const list = await getSeriesBooksList(
                                        book.title,
                                        book.author,
                                      );
                                      setSeriesBooksChecklist(
                                        list.map((b) => ({
                                          ...b,
                                          checked: true,
                                        })),
                                      );
                                    } catch (err) {
                                      console.error(
                                        "Failed to load series books list:",
                                        err,
                                      );
                                    } finally {
                                      setSearchingRegistry(false);
                                    }
                                  }
                                }}
                              >
                                {book.coverUrl ? (
                                  <img
                                    src={book.coverUrl}
                                    alt={book.title}
                                    className="w-8 h-10 object-cover rounded bg-muted/20 shrink-0 border border-muted"
                                  />
                                ) : (
                                  <div className="w-8 h-10 rounded bg-muted flex items-center justify-center text-[8px] text-muted-foreground shrink-0 border border-muted">
                                    NO COVER
                                  </div>
                                )}
                                <div className="min-w-0 flex-1">
                                  <h5
                                    className="text-xs font-semibold text-foreground leading-snug truncate"
                                    title={book.title}
                                  >
                                    {book.title}
                                  </h5>
                                  <p className="text-[10px] text-muted-foreground truncate">
                                    {book.author} • {book.year}
                                  </p>
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <Label
                        htmlFor="reqAuthor"
                        className="text-xs font-medium"
                      >
                        Author (Optional)
                      </Label>
                      <Input
                        id="reqAuthor"
                        type="text"
                        placeholder="e.g. Andy Weir"
                        value={reqAuthor}
                        onChange={(e) => setReqAuthor(e.target.value)}
                      />
                    </div>

                    {reqType === "series" && (
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full text-xs border-primary/20 text-primary hover:bg-primary/10 font-semibold h-9"
                        disabled={searchingRegistry || !reqTitle}
                        onClick={async () => {
                          setSearchingRegistry(true);
                          try {
                            const list = await getSeriesBooksList(
                              reqTitle,
                              reqAuthor,
                            );
                            if (list.length === 0) {
                              alert(
                                "No books found matching this series title and author in the registry.",
                              );
                            }
                            setSeriesBooksChecklist(
                              list.map((b) => ({ ...b, checked: true })),
                            );
                          } catch (err) {
                            console.error(err);
                            alert("Failed to lookup series books.");
                          } finally {
                            setSearchingRegistry(false);
                          }
                        }}
                      >
                        {searchingRegistry ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                            Searching Book Registry...
                          </>
                        ) : (
                          <>
                            <Search className="h-3.5 w-3.5 mr-1.5" />
                            Lookup Series Books List
                          </>
                        )}
                      </Button>
                    )}

                    {reqType === "series" &&
                      seriesBooksChecklist.length > 0 && (
                        <div className="space-y-2 border border-muted/80 rounded p-2 bg-[#1e1e24]/40 max-h-52 overflow-y-auto">
                          <div className="flex justify-between items-center text-[10px] font-bold text-muted-foreground mb-1 pb-1 border-b border-muted/30">
                            <span>
                              Select Books (
                              {
                                seriesBooksChecklist.filter((b) => b.checked)
                                  .length
                              }{" "}
                              selected)
                            </span>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                className="text-primary hover:underline text-[9px]"
                                onClick={() => selectAllChecklist(true)}
                              >
                                All
                              </button>
                              <button
                                type="button"
                                className="text-primary hover:underline text-[9px]"
                                onClick={() => selectAllChecklist(false)}
                              >
                                None
                              </button>
                            </div>
                          </div>
                          <div className="space-y-1">
                            {seriesBooksChecklist.map((book, idx) => (
                              <label
                                key={idx}
                                className="flex gap-2 items-start text-[11px] cursor-pointer hover:bg-muted/20 p-1 rounded transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={book.checked}
                                  onChange={() => toggleChecklistItem(idx)}
                                  className="mt-0.5 h-3.5 w-3.5 rounded border-muted/80 bg-muted/20 text-primary focus:ring-0 focus:ring-offset-0"
                                />
                                <div className="min-w-0 flex-1">
                                  <span
                                    className="font-semibold text-foreground block truncate"
                                    title={book.title}
                                  >
                                    {book.title}
                                  </span>
                                  <span className="text-[9px] text-muted-foreground block truncate">
                                    {book.author}{" "}
                                    {book.publishYear
                                      ? `(${book.publishYear})`
                                      : ""}
                                  </span>
                                </div>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}

                    {isAdmin && eligibleRequestUsers.length > 0 && (
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="requestedFor"
                          className="text-xs font-medium"
                        >
                          Request For (Admin Only)
                        </Label>
                        <select
                          id="requestedFor"
                          className="flex h-9 w-full rounded-md border border-[#2d2d34] bg-[#111115] px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50 text-foreground"
                          value={requestedFor}
                          onChange={(e) => setRequestedFor(e.target.value)}
                        >
                          <option value="">
                            Myself ({fullUser?.username || "Admin"})
                          </option>
                          {eligibleRequestUsers.map((u) => (
                            <option key={u.id} value={u.username}>
                              {u.username} (
                              {u.kindleEmail || "No Kindle configured"})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    <Button
                      type="submit"
                      disabled={isSubmittingRequest || !reqTitle.trim()}
                      className={`w-full font-semibold text-black gap-2 ${reqMediaType === "audiobook" ? "bg-amber-400 hover:bg-amber-300" : "bg-primary hover:bg-primary/90"}`}
                    >
                      {isSubmittingRequest ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin text-black" />
                          Submitting Request...
                        </>
                      ) : reqMediaType === "audiobook" ? (
                        "Submit Audiobook Request"
                      ) : (
                        "Submit Ebook Request"
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="border-muted/60">
                <CardHeader className="py-3.5 border-b border-muted/50 flex flex-row justify-between items-center flex-wrap gap-2">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    <LifeBuoy className="h-4.5 w-4.5 text-primary" /> Active
                    Requests Log
                  </CardTitle>
                  {requests.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-1 bg-muted/20 p-1 rounded-lg border border-muted/50">
                        <Button
                          size="sm"
                          type="button"
                          variant={reqLogFilter === "all" ? "default" : "ghost"}
                          className={`h-7 text-[11px] px-2.5 font-medium ${reqLogFilter === "all" ? "bg-primary text-black font-semibold" : "text-muted-foreground"}`}
                          onClick={() => setReqLogFilter("all")}
                        >
                          All ({requests.length})
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant={
                            reqLogFilter === "ebook" ? "default" : "ghost"
                          }
                          className={`h-7 text-[11px] px-2.5 font-medium ${reqLogFilter === "ebook" ? "bg-blue-600 text-white font-semibold" : "text-muted-foreground"}`}
                          onClick={() => setReqLogFilter("ebook")}
                        >
                          <BookOpen className="h-3 w-3 mr-1" /> Ebooks (
                          {
                            requests.filter((r) => r.mediaType !== "audiobook")
                              .length
                          }
                          )
                        </Button>
                        <Button
                          size="sm"
                          type="button"
                          variant={
                            reqLogFilter === "audiobook" ? "default" : "ghost"
                          }
                          className={`h-7 text-[11px] px-2.5 font-medium ${reqLogFilter === "audiobook" ? "bg-amber-400 text-black font-semibold" : "text-muted-foreground"}`}
                          onClick={() => setReqLogFilter("audiobook")}
                        >
                          <Headphones className="h-3 w-3 mr-1" /> Audiobooks (
                          {
                            requests.filter((r) => r.mediaType === "audiobook")
                              .length
                          }
                          )
                        </Button>
                      </div>
                      {selectedRequestIds.length > 0 && (
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-7 text-xs font-semibold px-3"
                          onClick={handleBulkDeleteRequests}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                          Selected ({selectedRequestIds.length})
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-muted/80 text-muted-foreground hover:text-foreground font-semibold px-3"
                        onClick={toggleSelectAllRequests}
                      >
                        Select All / None
                      </Button>
                    </div>
                  )}
                </CardHeader>
                <CardContent className="p-0">
                  {requests.length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground italic">
                      No book requests found.
                    </div>
                  ) : requests.filter((r) => {
                      if (reqLogFilter === "audiobook")
                        return r.mediaType === "audiobook";
                      if (reqLogFilter === "ebook")
                        return r.mediaType !== "audiobook";
                      return true;
                    }).length === 0 ? (
                    <div className="p-8 text-center text-sm text-muted-foreground italic">
                      No {reqLogFilter === "audiobook" ? "audiobook" : "ebook"}{" "}
                      requests found.
                    </div>
                  ) : (
                    <div className="divide-y divide-muted/50">
                      {requests
                        .filter((r) => {
                          if (reqLogFilter === "audiobook")
                            return r.mediaType === "audiobook";
                          if (reqLogFilter === "ebook")
                            return r.mediaType !== "audiobook";
                          return true;
                        })
                        .map((req) => {
                          const canDelete =
                            isAdmin || req.requestedBy === user?.username;
                          return (
                            <div
                              key={req.id}
                              className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                            >
                              <div className="flex gap-3 items-start min-w-0 w-full sm:w-auto flex-1">
                                {canDelete && (
                                  <input
                                    type="checkbox"
                                    checked={selectedRequestIds.includes(
                                      req.id,
                                    )}
                                    onChange={() => toggleSelectRequest(req.id)}
                                    className="mt-1 h-4 w-4 rounded border-muted/80 bg-muted/20 text-primary focus:ring-0 focus:ring-offset-0 shrink-0 cursor-pointer"
                                  />
                                )}
                                {req.coverUrl &&
                                req.coverUrl.length > 3 ? (
                                  <img
                                    src={req.coverUrl}
                                    alt={req.title}
                                    className="w-10 h-14 object-cover rounded bg-muted/20 border border-muted/50 shrink-0"
                                  />
                                ) : (
                                  <div className="w-10 h-14 rounded bg-muted/30 border border-muted/50 flex items-center justify-center text-[7px] text-muted-foreground shrink-0 font-bold uppercase text-center p-0.5">
                                    No Cover
                                  </div>
                                )}
                                <div className="space-y-1 min-w-0 flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <h4
                                      className="font-semibold text-sm truncate"
                                      title={req.title}
                                    >
                                      {req.title}
                                    </h4>
                                    {req.mediaType === "audiobook" ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-1 border-amber-500/40 text-amber-400 bg-amber-500/10 font-bold flex items-center gap-1"
                                      >
                                        <Headphones className="h-3 w-3" />{" "}
                                        AUDIOBOOK
                                      </Badge>
                                    ) : req.type === "series" ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-1 border-purple-500/30 text-purple-400 bg-purple-500/5 font-semibold"
                                      >
                                        SERIES
                                      </Badge>
                                    ) : (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-1 border-blue-500/30 text-blue-400 bg-blue-500/5 font-semibold"
                                      >
                                        EBOOK
                                      </Badge>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground truncate font-medium">
                                    {req.author
                                      ? `by ${req.author}`
                                      : "Unknown Author"}{" "}
                                    {req.publishYear
                                      ? `(${req.publishYear})`
                                      : ""}
                                  </p>
                                  <p className="text-[10px] text-muted-foreground">
                                    Requested by{" "}
                                    <span className="font-semibold text-foreground">
                                      {req.requestedBy}
                                    </span>{" "}
                                    •{" "}
                                    {new Date(
                                      req.createdAt,
                                    ).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:justify-end border-t sm:border-t-0 pt-3 sm:pt-0 mt-1 sm:mt-0">
                                <Badge
                                  className={`text-xs ${
                                    req.status === "Pending"
                                      ? "bg-yellow-500/20 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30"
                                      : req.status === "Approved"
                                        ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                                        : req.status === "Downloaded"
                                          ? "bg-green-500/20 text-green-600 dark:text-green-400 border border-green-500/30"
                                          : "bg-red-500/20 text-red-600 dark:text-red-400 border border-red-500/30"
                                  }`}
                                >
                                  {req.status}
                                </Badge>
                                {req.status.startsWith("Failed") && (
                                  <div className="flex gap-1.5 items-center">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs border-amber-500/30 text-amber-500 hover:bg-amber-500/10 bg-amber-500/5 font-semibold"
                                      onClick={async () => {
                                        try {
                                          await retryBookRequest(req.id);
                                          alert(
                                            "Auto-retry search successfully queued in the background!",
                                          );
                                          const reqs = await getBookRequests();
                                          setRequests(reqs || []);
                                        } catch (err: any) {
                                          alert(
                                            err.message ||
                                              "Failed to retry request.",
                                          );
                                        }
                                      }}
                                    >
                                      Auto-Retry
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-[10px]"
                                      onClick={() => triggerProwlarrSearch(req)}
                                    >
                                      <Search className="h-3 w-3 mr-1" /> Search
                                      Release
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 w-7 p-0 border-red-500/40 text-red-400 hover:bg-red-950/60 shrink-0"
                                      title="Copy Full Error Message"
                                      onClick={() =>
                                        showErrorModal(
                                          req.status,
                                          "Request Error Details",
                                        )
                                      }
                                    >
                                      <Copy className="h-3 w-3" />
                                    </Button>
                                  </div>
                                )}
                                {(isAdmin ||
                                  req.requestedBy === user?.username) && (
                                  <div className="flex gap-1 items-center">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="p-1 h-7 w-7 text-amber-500 hover:text-amber-600 border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 shrink-0"
                                      title="Report Request Issue"
                                      onClick={() =>
                                        handleOpenReportIssueModal({
                                          type: "request",
                                          title: req.title,
                                          id: req.id,
                                          status: req.status,
                                        })
                                      }
                                    >
                                      <AlertTriangle className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="p-1 h-7 w-7 text-red-500 hover:text-red-600 border-red-500/30 bg-red-500/5 hover:bg-red-500/10 shrink-0"
                                      title="Delete Request"
                                      onClick={() =>
                                        handleDeleteRequest(req.id)
                                      }
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                                {req.status === "Pending" && (
                                  <div className="flex gap-1.5 items-center">
                                    {(isAdmin ||
                                      req.requestedBy === user?.username) && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="h-7 text-xs border-primary/20 text-primary hover:bg-primary/5 font-semibold"
                                        onClick={() =>
                                          triggerProwlarrSearch(req)
                                        }
                                      >
                                        <Search className="h-3 w-3 mr-1" />{" "}
                                        Search Release
                                      </Button>
                                    )}
                                    {isAdmin && (
                                      <>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="p-1 h-7 w-7 text-green-500 hover:text-green-600 border-green-500/30 bg-green-500/5 hover:bg-green-500/10"
                                          onClick={() =>
                                            handleUpdateRequestStatus(
                                              req.id,
                                              "Approved",
                                            )
                                          }
                                        >
                                          <Check className="h-4 w-4" />
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          className="p-1 h-7 w-7 text-red-500 hover:text-red-600 border-red-500/30 bg-red-500/5 hover:bg-red-500/10"
                                          onClick={() =>
                                            handleUpdateRequestStatus(
                                              req.id,
                                              "Rejected",
                                            )
                                          }
                                        >
                                          <X className="h-4 w-4" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                )}{" "}
                                {(isAdmin ||
                                  req.requestedBy === user?.username) &&
                                  (req.status === "Downloaded" ||
                                    req.status === "Downloading") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 bg-cyan-500/5 font-semibold mr-1"
                                      onClick={() => triggerProwlarrSearch(req)}
                                    >
                                      <Search className="h-3 w-3 mr-1" /> Search
                                      Release
                                    </Button>
                                  )}
                                {(isAdmin ||
                                  req.requestedBy === user?.username) &&
                                  (req.status === "Approved" ||
                                    req.status === "Downloading") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs border-blue-500/30 text-blue-400 hover:bg-blue-500/10 bg-blue-500/5 font-semibold mr-1"
                                      onClick={async () => {
                                        try {
                                          const res =
                                            await importCompletedDownload(
                                              req.id,
                                            );
                                          if (res.success) {
                                            alert(
                                              res.message ||
                                                "Imported completed download to library!",
                                            );
                                          } else {
                                            showErrorModal(
                                              res.error ||
                                                "Failed to locate completed download.",
                                              "Import Download Error",
                                            );
                                          }
                                          const reqs = await getBookRequests();
                                          setRequests(reqs || []);
                                        } catch (err: any) {
                                          showErrorModal(
                                            err.message ||
                                              "Failed to import download.",
                                            "Import Download Error",
                                          );
                                        }
                                      }}
                                    >
                                      <Download className="h-3 w-3 mr-1" />{" "}
                                      Import Download
                                    </Button>
                                  )}
                                {isAdmin &&
                                  (req.status === "Approved" ||
                                    req.status === "Downloading") && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="h-7 text-xs border-green-500/30 text-green-500 hover:bg-green-500/10 bg-green-500/5"
                                      onClick={() =>
                                        handleUpdateRequestStatus(
                                          req.id,
                                          "Downloaded",
                                        )
                                      }
                                    >
                                      Mark Downloaded
                                    </Button>
                                  )}

                              </div>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="manage" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-1">
                <Card className="border-muted/60 bg-muted/10 sticky top-6">
                  <CardHeader>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      {editingLibId ? (
                        <Edit3 className="h-5 w-5 text-primary" />
                      ) : (
                        <Plus className="h-5 w-5 text-primary" />
                      )}
                      {editingLibId ? "Edit Library" : "Create Library"}
                    </CardTitle>
                    <CardDescription>
                      Configure a distinct library shelf and restrict access to
                      specific users.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <form
                      onSubmit={handleCreateOrUpdateLibrary}
                      className="space-y-4"
                    >
                      <div className="space-y-1.5">
                        <Label htmlFor="libName" className="text-xs">
                          Library Name
                        </Label>
                        <Input
                          id="libName"
                          type="text"
                          placeholder="e.g. Wife's Library"
                          value={libName}
                          onChange={(e) => setLibName(e.target.value)}
                          required
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="libDesc" className="text-xs">
                          Description
                        </Label>
                        <Input
                          id="libDesc"
                          type="text"
                          placeholder="e.g. Books chosen specifically for my wife."
                          value={libDesc}
                          onChange={(e) => setLibDesc(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="libPath" className="text-xs">
                          Folder Path (Unraid Share)
                        </Label>
                        <Input
                          id="libPath"
                          type="text"
                          placeholder="e.g. /books/wife"
                          value={libPath}
                          onChange={(e) => setLibPath(e.target.value)}
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Folder directory inside Portalarr Docker mapped to
                          your Unraid share.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="libMediaType"
                          className="text-xs font-semibold"
                        >
                          Library Media Type
                        </Label>
                        <select
                          id="libMediaType"
                          value={libMediaType}
                          onChange={(e) => {
                            const selected = e.target.value;
                            setLibMediaType(selected);
                            if (
                              selected === "audiobook" &&
                              (!libDownloadCategory ||
                                libDownloadCategory === "books")
                            ) {
                              setLibDownloadCategory("audiobooks");
                            } else if (
                              selected === "ebook" &&
                              (!libDownloadCategory ||
                                libDownloadCategory === "audiobooks")
                            ) {
                              setLibDownloadCategory("books");
                            }
                          }}
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none"
                        >
                          <option value="ebook">
                            📖 Ebook Library (EPUB, PDF, MOBI)
                          </option>
                          <option value="audiobook">
                            🎧 Audiobook Library (M4B, MP3, FLAC)
                          </option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <Label
                          htmlFor="libDownloadCategory"
                          className="text-xs"
                        >
                          Download Client Category (SABnzbd / Torrent)
                        </Label>
                        <Input
                          id="libDownloadCategory"
                          type="text"
                          placeholder="e.g. wife-books"
                          value={libDownloadCategory}
                          onChange={(e) =>
                            setLibDownloadCategory(e.target.value)
                          }
                        />
                        <p className="text-[10px] text-muted-foreground">
                          Custom SABnzbd NZB / Torrent category name to assign
                          when grabbing requests.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="libAllowedUsers" className="text-xs">
                          Allowed Users (Comma separated)
                        </Label>
                        <Input
                          id="libAllowedUsers"
                          type="text"
                          placeholder="e.g. wife,admin (use * for everyone)"
                          value={libAllowedUsers}
                          onChange={(e) => setLibAllowedUsers(e.target.value)}
                          required
                        />
                      </div>

                      <div className="space-y-2 border border-muted/80 p-3 rounded-md bg-muted/20">
                        <Label className="text-xs font-semibold block border-b border-muted pb-1 mb-1 text-primary">
                          Allowed Users Quick Toggle List
                        </Label>
                        {libAllowedUsers === "*" ? (
                          <div className="text-[10px] text-muted-foreground flex justify-between items-center">
                            <span>
                              Everyone has access (<code>*</code>)
                            </span>
                            <Button
                              type="button"
                              variant="outline"
                              className="h-5 text-[9px] px-2 py-0 border-primary/20 text-primary hover:bg-primary/10"
                              onClick={() => setLibAllowedUsers("")}
                            >
                              Restrict Access
                            </Button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-0.5">
                              {allUsers.length === 0 ? (
                                <span className="text-[10px] text-muted-foreground italic">
                                  No users found.
                                </span>
                              ) : (
                                allUsers.map((u) => {
                                  const allowedList = libAllowedUsers
                                    .split(",")
                                    .map((item) => item.trim())
                                    .filter(Boolean);
                                  const isAllowed = allowedList.includes(
                                    u.username,
                                  );
                                  return (
                                    <Badge
                                      key={u.id}
                                      variant={
                                        isAllowed ? "default" : "outline"
                                      }
                                      className={`cursor-pointer transition-colors text-[9px] px-2 py-0.5 ${
                                        isAllowed
                                          ? "bg-primary text-black hover:bg-primary/80 font-bold border-primary"
                                          : "hover:bg-muted/30 border-muted-foreground/30 text-muted-foreground"
                                      }`}
                                      onClick={() => {
                                        let newList;
                                        if (isAllowed) {
                                          newList = allowedList.filter(
                                            (item) => item !== u.username,
                                          );
                                        } else {
                                          newList = [
                                            ...allowedList,
                                            u.username,
                                          ];
                                        }
                                        setLibAllowedUsers(newList.join(", "));
                                      }}
                                    >
                                      {u.username}
                                    </Badge>
                                  );
                                })
                              )}
                            </div>
                            <div className="flex justify-between items-center text-[9px]">
                              <span className="text-muted-foreground">
                                Click badges to grant or revoke library access.
                              </span>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-4 text-[9px] p-0 text-primary hover:underline hover:bg-transparent font-semibold"
                                onClick={() => setLibAllowedUsers("*")}
                              >
                                Grant to Everyone (*)
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="space-y-1">
                        <Label
                          htmlFor="libRestrictedUsers"
                          className="text-xs font-semibold text-red-400 flex items-center gap-1.5"
                        >
                          <UserX className="h-3.5 w-3.5" /> Restricted / Blocked
                          Users (Explicit Exclusions)
                        </Label>
                        <Input
                          id="libRestrictedUsers"
                          type="text"
                          placeholder="e.g. kid1, kid2 (usernames to block even if Allowed Users is *)"
                          value={libRestrictedUsers}
                          onChange={(e) =>
                            setLibRestrictedUsers(e.target.value)
                          }
                        />
                      </div>

                      <div className="space-y-2 border border-red-500/20 p-3 rounded-md bg-red-950/10">
                        <Label className="text-xs font-semibold block border-b border-red-500/20 pb-1 mb-1 text-red-400 flex items-center gap-1.5">
                          <UserX className="h-3.5 w-3.5" /> Restricted Users
                          Quick Block List
                        </Label>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto p-0.5">
                            {allUsers.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground italic">
                                No users found.
                              </span>
                            ) : (
                              allUsers.map((u) => {
                                const restrictedList = libRestrictedUsers
                                  .split(",")
                                  .map((item) => item.trim())
                                  .filter(Boolean);
                                const isRestricted = restrictedList.includes(
                                  u.username,
                                );
                                return (
                                  <Badge
                                    key={u.id}
                                    variant={
                                      isRestricted ? "destructive" : "outline"
                                    }
                                    className={`cursor-pointer transition-colors text-[9px] px-2 py-0.5 ${
                                      isRestricted
                                        ? "bg-red-600 text-white hover:bg-red-700 font-bold border-red-500"
                                        : "hover:bg-muted/30 border-muted-foreground/30 text-muted-foreground"
                                    }`}
                                    onClick={() => {
                                      let newList;
                                      if (isRestricted) {
                                        newList = restrictedList.filter(
                                          (item) => item !== u.username,
                                        );
                                      } else {
                                        newList = [
                                          ...restrictedList,
                                          u.username,
                                        ];
                                      }
                                      setLibRestrictedUsers(newList.join(", "));
                                    }}
                                  >
                                    {u.username}
                                  </Badge>
                                );
                              })
                            )}
                          </div>
                          <div className="flex justify-between items-center text-[9px]">
                            <span className="text-muted-foreground">
                              Click badges to block/unblock users from this
                              library shelf.
                            </span>
                            {libRestrictedUsers && (
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-4 text-[9px] p-0 text-red-400 hover:underline hover:bg-transparent font-semibold"
                                onClick={() => setLibRestrictedUsers("")}
                              >
                                Clear Blocked List
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="submit"
                          className="flex-1 font-semibold text-black"
                        >
                          {editingLibId ? "Update Library" : "Create Library"}
                        </Button>
                        {editingLibId && (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => {
                              setEditingLibId(null);
                              setLibName("");
                              setLibDesc("");
                              setLibAllowedUsers("");
                              setLibRestrictedUsers("");
                            }}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </form>
                  </CardContent>
                </Card>
              </div>

              <div className="lg:col-span-2">
                <Card className="border-muted/60">
                  <CardHeader className="py-4 border-b border-muted/50">
                    <CardTitle className="text-base font-bold flex items-center gap-2">
                      <Shield className="h-4.5 w-4.5 text-primary" /> Active
                      Libraries Dashboard
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    {libraries.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center justify-center gap-3">
                        <p className="italic">
                          No libraries configured yet. Fill out the form on the
                          left or seed standard default libraries to get started
                          instantly!
                        </p>
                        {isAdmin && (
                          <Button
                            type="button"
                            onClick={handleSeedLibraries}
                            className="bg-primary hover:bg-primary/80 text-black font-semibold text-xs flex items-center gap-2 px-4 py-2 mt-1"
                          >
                            <Sparkles className="h-4 w-4 text-black" /> Seed
                            Default Libraries (Ebooks & Audiobooks)
                          </Button>
                        )}
                      </div>
                    ) : (
                      <div className="divide-y divide-muted/50">
                        {libraries.map((lib) => (
                          <div
                            key={lib.id}
                            className="p-4 flex items-center justify-between gap-4"
                          >
                            <div className="space-y-1">
                              <h4 className="font-semibold text-sm">
                                {lib.name}
                              </h4>
                              <p className="text-xs text-muted-foreground">
                                {lib.description || "No description."}
                              </p>
                              <div className="flex items-center gap-2 pt-1 flex-wrap">
                                <Badge className="bg-slate-900 border border-slate-800 text-slate-200 text-[10px]">
                                  Access:{" "}
                                  {lib.allowedUsers === "*"
                                    ? "Public"
                                    : lib.allowedUsers || "Private"}
                                </Badge>
                                {lib.restrictedUsers && (
                                  <Badge
                                    variant="destructive"
                                    className="bg-red-950/80 text-red-300 border border-red-800 text-[10px] flex items-center gap-1"
                                  >
                                    <UserX className="h-3 w-3" /> Excluded:{" "}
                                    {lib.restrictedUsers}
                                  </Badge>
                                )}
                                {lib.path && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] border-primary/20 text-primary bg-primary/5"
                                  >
                                    Path: {lib.path}
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-1"
                                onClick={() => startEditLibrary(lib)}
                              >
                                <Edit3 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-8 w-8 p-1"
                                onClick={() => handleDeleteLibrary(lib.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>
        )}

        <TabsContent value="kindle" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <Card className="border-muted/60 bg-muted/10">
                <CardHeader>
                  <CardTitle className="text-lg font-bold flex items-center gap-2">
                    <Mail className="h-5 w-5 text-primary" /> Delivery
                    Configuration
                  </CardTitle>
                  <CardDescription>
                    Configure your Kindle recipient address and personal alert
                    details.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleSaveKindleConfig} className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="userEmail" className="text-xs">
                        Your Personal E-mail
                      </Label>
                      <Input
                        id="userEmail"
                        type="email"
                        placeholder="e.g. you@domain.com"
                        value={userEmail}
                        onChange={(e) => setUserEmail(e.target.value)}
                        required
                      />
                      <p className="text-[10px] text-muted-foreground">
                        Used to send you delivery logs or instructions in case
                        of Kindle rejection errors.
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="userKindleEmail" className="text-xs">
                        Send-to-Kindle E-mail
                      </Label>
                      <Input
                        id="userKindleEmail"
                        type="email"
                        placeholder="e.g. name@kindle.com"
                        value={userKindleEmail}
                        onChange={(e) => setUserKindleEmail(e.target.value)}
                        required
                      />
                      {userKindleEmail.trim() &&
                        !userKindleEmail
                          .toLowerCase()
                          .endsWith("@kindle.com") &&
                        !userKindleEmail
                          .toLowerCase()
                          .endsWith("@free.kindle.com") && (
                          <div className="flex items-start gap-2 mt-2 p-2 bg-amber-500/10 border border-amber-500/30 rounded text-xs text-amber-400">
                            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                            <p>
                              <strong>Warning:</strong> Send-to-Kindle emails
                              typically end in @kindle.com. Please make sure you
                              are not entering your personal Amazon login email.
                            </p>
                          </div>
                        )}
                      <p className="text-[10px] text-muted-foreground">
                        Your dedicated Kindle email address found in your Amazon
                        devices list.
                      </p>
                    </div>
                    <Button
                      type="submit"
                      className="w-full font-bold text-black"
                    >
                      Save Settings
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="border-muted/60">
                <CardHeader className="py-4 border-b border-muted/50">
                  <CardTitle className="text-base font-bold flex items-center gap-2">
                    📖 Amazon Approved Senders Guide
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 space-y-4 text-sm leading-relaxed">
                  <p>
                    Amazon requires all Send-to-Kindle documents to originate
                    from an **Approved E-mail address**. If our server's address
                    is not authorized on your Amazon account, Amazon will
                    silently discard your books.
                  </p>

                  <div className="bg-primary/5 border border-primary/20 p-4 rounded-lg space-y-2">
                    <span className="font-semibold text-primary block text-xs uppercase tracking-wider">
                      Your Server's Sending Address:
                    </span>
                    {serverSmtpFrom ? (
                      <code className="text-sm font-mono font-bold bg-muted/60 px-2 py-1 rounded select-all text-foreground border border-muted">
                        {serverSmtpFrom}
                      </code>
                    ) : (
                      <span className="text-xs text-yellow-500 font-medium">
                        ⚠️ Server SMTP is not configured yet. Ask the
                        administrator to add SMTP settings.
                      </span>
                    )}
                  </div>

                  <h4 className="font-bold text-foreground">
                    How to Authorize this Address:
                  </h4>
                  <ol className="list-decimal list-inside space-y-2 pl-2">
                    <li>Log into your Amazon Account on a web browser.</li>
                    <li>
                      Navigate to Amazon's **[Manage Your Content and
                      Devices](https://www.amazon.com/hz/mycd/myx#/home/settings/payment)**
                      page.
                    </li>
                    <li>Go to the **Preferences** tab at the top.</li>
                    <li>
                      Scroll down and expand the **Personal Document Settings**
                      accordion.
                    </li>
                    <li>
                      Scroll down to the **Approved Personal Document E-mail
                      List** section.
                    </li>
                    <li>
                      Click **Add a new approved e-mail address**, paste the
                      server address shown above, and click **Add Address**.
                    </li>
                  </ol>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {activeBook && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col animate-in fade-in duration-300">
          <div className="flex items-center justify-between px-6 py-3 bg-muted border-b border-primary/20">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <div>
                <h2 className="text-sm font-bold text-foreground leading-snug">
                  {activeBook.title}
                </h2>
                <p className="text-[10px] text-muted-foreground">
                  {activeBook.author || "Unknown Author"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-foreground"
                asChild
              >
                <a href={`/api/books/${activeBook.id}`} download>
                  <Download className="h-4 w-4 mr-1.5" /> Download
                </a>
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700"
                onClick={() => setActiveBook(null)}
              >
                Close Reader
              </Button>
            </div>
          </div>
          <div className="flex-1 w-full h-full bg-[#1b1b1b]">
            {activeBook.fileType === "pdf" ? (
              <iframe
                src={`/api/books/${activeBook.id}`}
                className="w-full h-full border-none"
                title={activeBook.title}
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-center p-8 space-y-4">
                <Sparkles className="h-12 w-12 text-primary animate-bounce" />
                <h3 className="text-lg font-bold">Reading non-PDF ebooks</h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  We detected this is an **{activeBook.fileType?.toUpperCase()}
                  ** file. The built-in web reader currently displays **PDFs**
                  natively. Please click the download button below to load this
                  book in your preferred external reader (e.g. Calibre, Books,
                  Kindle).
                </p>
                <Button size="lg" className="text-black font-bold" asChild>
                  <a href={`/api/books/${activeBook.id}`} download>
                    <Download className="h-5 w-5 mr-2" /> Download "
                    {activeBook.title}"
                  </a>
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- PROWLARR SEARCH RESULTS MODAL --- */}
      {activeRequestForSearch && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-3xl max-h-[85vh] flex flex-col border-muted shadow-2xl">
            <CardHeader className="border-b border-muted/50 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" /> Search Releases
                  for "{activeRequestForSearch.title}"
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => { setActiveRequestForSearch(null); setCustomSearchQuery(""); }}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <CardDescription className="flex flex-col gap-3 mt-2">
                <div className="flex items-center gap-2">
                  <Input
                    type="text"
                    placeholder="Refine search query (e.g. Add 'Full-Cast')"
                    value={customSearchQuery}
                    onChange={(e) => setCustomSearchQuery(e.target.value)}
                    className="flex-1 h-8 text-xs"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        triggerProwlarrSearch(activeRequestForSearch, activeRequestForSearch.mediaType, customSearchQuery);
                      }
                    }}
                  />
                  <Button
                    size="sm"
                    className="h-8 text-xs px-3"
                    onClick={() => triggerProwlarrSearch(activeRequestForSearch, activeRequestForSearch.mediaType, customSearchQuery)}
                    disabled={searchingProwlarr}
                  >
                    <Search className="h-3 w-3 mr-1" /> Search
                  </Button>
                </div>
                
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span>
                    Prowlarr Indexers query status:{" "}
                    {searchingProwlarr
                      ? "Searching indexers..."
                      : `${prowlarrResults.length} releases found.`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground font-medium">
                      Format:
                    </span>
                    <Button
                      size="sm"
                      variant={
                        activeRequestForSearch.mediaType === "ebook"
                          ? "default"
                          : "outline"
                      }
                      className="h-6 text-xs px-2.5 font-semibold"
                      onClick={() =>
                        triggerProwlarrSearch(activeRequestForSearch, "ebook", customSearchQuery)
                      }
                    >
                      📖 Ebook
                    </Button>
                    <Button
                      size="sm"
                      variant={
                        activeRequestForSearch.mediaType === "audiobook"
                          ? "default"
                          : "outline"
                      }
                      className="h-6 text-xs px-2.5 font-semibold"
                      onClick={() =>
                        triggerProwlarrSearch(activeRequestForSearch, "audiobook", customSearchQuery)
                      }
                    >
                      🎧 Audiobook
                    </Button>
                  </div>
                </div>
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1 overflow-y-auto p-0 min-h-[250px] max-h-[50vh]">
              {searchingProwlarr ? (
                <div className="flex flex-col items-center justify-center p-12 space-y-4">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">
                    Searching Usenet and Torrent indexers via Prowlarr...
                  </p>
                </div>
              ) : searchProwlarrError ? (
                <div className="p-6 text-center space-y-3">
                  <p className="text-xs text-red-400 font-mono select-all bg-red-950/20 border border-red-500/30 p-3 rounded-lg break-all">
                    {searchProwlarrError}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-red-500/30 text-red-400 hover:bg-red-950/40 gap-1 mx-auto"
                    onClick={() =>
                      showErrorModal(
                        searchProwlarrError,
                        "Indexer Search Error",
                      )
                    }
                  >
                    <Copy className="h-3 w-3" /> 📋 Copy Error Message
                  </Button>
                </div>
              ) : prowlarrResults.length === 0 ? (
                <div className="p-12 text-center text-sm text-muted-foreground italic">
                  No matching releases found on your indexers.
                </div>
              ) : (
                <div className="divide-y divide-muted/50">
                  {prowlarrResults.map((release, i) => (
                    <div
                      key={i}
                      className="p-4 flex items-center justify-between gap-4 hover:bg-muted/10 transition-colors"
                    >
                      <div className="space-y-1 flex-1 min-w-0">
                        <h4
                          className="font-semibold text-xs leading-snug text-foreground break-words truncate"
                          title={release.title}
                        >
                          {release.title}
                        </h4>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 border-muted uppercase"
                          >
                            {release.protocol}
                          </Badge>
                          <span className="font-medium text-foreground">
                            {(release.size / (1024 * 1024)).toFixed(1)} MB
                          </span>
                          <span>Indexer: {release.indexer}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        disabled={pushingReleaseId === release.downloadUrl || activeRequestForSearch?.id?.startsWith("temp-")}
                          onClick={() => handleSendRelease(release)}
                          className="text-xs font-bold text-black shrink-0"
                        >
                          {pushingReleaseId === release.downloadUrl || activeRequestForSearch?.id?.startsWith("temp-") ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <>
                            <Download className="h-3 w-3 mr-1" /> Grab
                          </>
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
            <CardFooter className="border-t border-muted/50 pt-4 bg-muted/10 flex justify-end">
              <Button
                variant="outline"
                onClick={() => { setActiveRequestForSearch(null); setCustomSearchQuery(""); }}
              >
                Close
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {isReportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-muted/85 bg-[#141419]/90 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <CardHeader className="pb-3 border-b border-muted/30">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-500">
                  <AlertTriangle className="h-5 w-5" /> Report an Issue
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 border-muted hover:bg-muted/20"
                  onClick={() => setIsReportModalOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                This will submit a support ticket to the server administrator.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="space-y-1.5">
                <Label
                  htmlFor="reportName"
                  className="text-xs font-semibold text-foreground"
                >
                  Your Name
                </Label>
                <Input
                  id="reportName"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder="Your username"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="reportEmail"
                  className="text-xs font-semibold text-foreground"
                >
                  Your Email Address
                </Label>
                <Input
                  id="reportEmail"
                  type="email"
                  value={reportEmail}
                  onChange={(e) => setReportEmail(e.target.value)}
                  placeholder="For administrator replies..."
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="reportDesc"
                  className="text-xs font-semibold text-foreground"
                >
                  Describe the Problem
                </Label>
                <textarea
                  id="reportDesc"
                  rows={6}
                  className="flex w-full rounded-md border border-muted/80 bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50"
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  required
                />
              </div>
            </CardContent>
            <CardFooter className="pt-2 border-t border-muted/30 flex justify-end gap-2">
              <Button
                variant="outline"
                className="h-9 font-semibold text-xs border-muted/80 text-muted-foreground hover:text-foreground"
                onClick={() => setIsReportModalOpen(false)}
                disabled={submittingReport}
              >
                Cancel
              </Button>
              <Button
                className="h-9 font-semibold text-xs text-black"
                onClick={handleSendReport}
                disabled={submittingReport}
              >
                {submittingReport ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Submitting...
                  </>
                ) : (
                  "Submit Report"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {isEditBookModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md border-muted/85 bg-[#141419]/90 shadow-2xl relative animate-in zoom-in-95 duration-200">
            <CardHeader className="pb-3 border-b border-muted/30">
              <div className="flex justify-between items-center">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-primary">
                  <Edit3 className="h-5 w-5" /> Edit Book Details
                </CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 w-7 p-0 border-muted hover:bg-muted/20"
                  onClick={() => setIsEditBookModalOpen(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <CardDescription>
                Modify book details or correct the cover art link.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              {editBookError && (
                <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded text-red-500 text-xs font-semibold">
                  {editBookError}
                </div>
              )}
              <div className="space-y-1.5">
                <Label
                  htmlFor="editTitle"
                  className="text-xs font-semibold text-foreground"
                >
                  Title
                </Label>
                <Input
                  id="editTitle"
                  value={editBookTitle}
                  onChange={(e) => setEditBookTitle(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="editAuthor"
                  className="text-xs font-semibold text-foreground"
                >
                  Author
                </Label>
                <Input
                  id="editAuthor"
                  value={editBookAuthor}
                  onChange={(e) => setEditBookAuthor(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="editCoverUrl"
                  className="text-xs font-semibold text-foreground"
                >
                  Cover Image URL
                </Label>
                <Input
                  id="editCoverUrl"
                  value={editBookCoverUrl}
                  onChange={(e) => setEditBookCoverUrl(e.target.value)}
                  placeholder="https://example.com/cover.jpg"
                />
                <p className="text-[10px] text-muted-foreground">
                  Provide a direct URL to an image or leave blank for a text
                  cover placeholder.
                </p>
              </div>
            </CardContent>
            <CardFooter className="pt-2 border-t border-muted/30 flex justify-end gap-2">
              <Button
                variant="outline"
                className="h-9 font-semibold text-xs border-muted/80 text-muted-foreground hover:text-foreground"
                onClick={() => setIsEditBookModalOpen(false)}
                disabled={updatingBook}
              >
                Cancel
              </Button>
              <Button
                className="h-9 font-semibold text-xs text-black"
                onClick={handleSaveBookEdit}
                disabled={updatingBook}
              >
                {updatingBook ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                    Saving...
                  </>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      {chaptersModalBook && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200 cursor-pointer"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setChaptersModalBook(null);
            }
          }}
        >
          <Card
            className="w-full max-w-2xl max-h-[88vh] flex flex-col border-amber-500/30 bg-slate-955 text-slate-100 shadow-2xl overflow-hidden cursor-default"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b border-slate-800 pb-4 bg-slate-900/60">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="h-16 w-16 rounded-lg bg-slate-900 border border-slate-800 shrink-0 overflow-hidden flex items-center justify-center">
                    {chaptersModalBook.coverUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={chaptersModalBook.coverUrl}
                        alt={chaptersModalBook.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <Headphones className="h-8 w-8 text-amber-400" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <CardTitle className="text-lg font-bold line-clamp-1">
                      {chaptersModalBook.title}
                    </CardTitle>
                    <CardDescription className="text-xs text-slate-400 line-clamp-1">
                      {chaptersModalBook.author || "Unknown Author"} •{" "}
                      {chaptersList.length} Chapters Found
                    </CardDescription>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {chaptersList.length > 0 && !isEditingChapters && (
                        <Button
                          size="sm"
                          className="h-7 text-xs font-bold bg-amber-400 text-black hover:bg-amber-300 gap-1.5"
                          onClick={() => {
                            handlePlayChapter(
                              chaptersModalBook,
                              chaptersList,
                              0,
                            );
                            setChaptersModalBook(null);
                          }}
                        >
                          <Play className="h-3.5 w-3.5 fill-black" /> Play All
                        </Button>
                      )}
                      {chaptersList.length > 0 && (
                        <Button
                          size="sm"
                          variant={isEditingChapters ? "secondary" : "outline"}
                          className="h-7 text-xs font-semibold border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-1.5"
                          onClick={() =>
                            setIsEditingChapters(!isEditingChapters)
                          }
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                          {isEditingChapters
                            ? "Cancel Editing"
                            : "✏️ Reorder Chapters"}
                        </Button>
                      )}
                      {chaptersList.length > 0 && (
                        <Button
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs font-extrabold bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 gap-1.5"
                          disabled={analyzingAiChapters}
                          onClick={handleAnalyzeChaptersWithAI}
                          title="AI Auto-Detect & Name Chapters"
                        >
                          {analyzingAiChapters ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5 text-purple-300" />
                          )}
                          🪄 AI Name Chapters
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs font-bold border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white shrink-0 gap-1"
                  onClick={() => setChaptersModalBook(null)}
                  title="Close Popout"
                >
                  <X className="h-4 w-4" /> Close
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-2 overflow-y-auto max-h-[50vh]">
              {loadingChapters ? (
                <div className="p-8 text-center text-xs text-slate-400 flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                  <span>Scanning track audio metadata...</span>
                </div>
              ) : chaptersList.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 space-y-1">
                  <p>No audio chapter files detected on disk.</p>
                  <p className="text-[10px] text-slate-500">
                    Ensure `.mp3` or `.m4b` files exist in this book's folder.
                  </p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {chaptersList.map((ch, idx) => {
                    const isCurrentlyPlaying =
                      activePlayingTrack?.bookId === chaptersModalBook.id &&
                      activePlayingTrack?.currentChapterIndex === idx;
                    return (
                      <div
                        key={idx}
                        className={`p-3 flex items-center justify-between gap-3 hover:bg-slate-900/80 rounded-lg transition-colors ${isCurrentlyPlaying ? "bg-amber-500/10 border border-amber-500/30" : ""}`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {isEditingChapters ? (
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Input
                                type="number"
                                min="1"
                                max="99"
                                value={ch.trackNumber}
                                onChange={(e) =>
                                  updateTrackNumber(idx, e.target.value)
                                }
                                className="w-14 h-8 text-center text-xs font-bold border-amber-500/50 bg-slate-900 text-amber-300"
                              />
                              <div className="flex flex-col gap-0.5">
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-4 w-5 p-0 text-slate-400 hover:text-amber-300"
                                  disabled={idx === 0}
                                  onClick={() => moveChapterTrack(idx, "up")}
                                >
                                  <ArrowUp className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-4 w-5 p-0 text-slate-400 hover:text-amber-300"
                                  disabled={idx === chaptersList.length - 1}
                                  onClick={() => moveChapterTrack(idx, "down")}
                                >
                                  <ArrowDown className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`h-6 min-w-[32px] justify-center text-xs font-bold shrink-0 ${isCurrentlyPlaying ? "border-amber-400 text-amber-400 bg-amber-400/10" : "border-slate-800 text-slate-400"}`}
                            >
                              {ch.trackNumber}
                            </Badge>
                          )}
                          <div className="truncate flex-1">
                            <p
                              className={`text-xs font-semibold truncate ${isCurrentlyPlaying ? "text-amber-400 font-bold" : "text-slate-200"}`}
                            >
                              {ch.title}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {ch.relativePath} •{" "}
                              {(ch.size / (1024 * 1024)).toFixed(1)} MB
                            </p>
                          </div>
                        </div>
                        {!isEditingChapters && (
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs font-semibold px-2.5 border-slate-700 text-slate-300 hover:bg-slate-800 gap-1"
                              title={`Download ${ch.fileName}`}
                              asChild
                            >
                              <a
                                href={`/api/books/${chaptersModalBook.id}/stream?file=${encodeURIComponent(ch.relativePath)}&download=1`}
                                download={ch.fileName}
                              >
                                <Download className="h-3 w-3" /> Download
                              </a>
                            </Button>
                            <Button
                              size="sm"
                              variant={
                                isCurrentlyPlaying ? "default" : "outline"
                              }
                              className={`h-7 text-xs font-semibold px-3 ${isCurrentlyPlaying ? "bg-amber-400 text-black hover:bg-amber-300 font-bold" : "border-slate-700 text-slate-200 hover:bg-slate-800"}`}
                              onClick={() => {
                                handlePlayChapter(
                                  chaptersModalBook,
                                  chaptersList,
                                  idx,
                                );
                                setChaptersModalBook(null);
                              }}
                            >
                              {isCurrentlyPlaying ? (
                                <>
                                  <Volume2 className="h-3.5 w-3.5 mr-1 animate-pulse text-black" />{" "}
                                  Playing
                                </>
                              ) : (
                                <>
                                  <Play className="h-3 w-3 mr-1 fill-current" />{" "}
                                  Play
                                </>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>

            <CardFooter className="border-t border-slate-800 p-3 bg-slate-900/60 flex items-center justify-between">
              {isEditingChapters ? (
                <>
                  <span className="text-xs text-slate-400">
                    Total {chaptersList.length} tracks
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-slate-400 hover:text-white"
                      onClick={() => setIsEditingChapters(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs font-bold bg-emerald-500 text-black hover:bg-emerald-400 gap-1.5 shadow"
                      onClick={handleSaveChapterOrder}
                      disabled={savingChapters}
                    >
                      {savingChapters ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save Chapter Order &amp; Rename Files
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <span className="text-xs text-slate-400 font-medium">
                    Total {chaptersList.length} Chapters
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 px-4 text-xs font-bold border-slate-700 text-slate-200 hover:bg-slate-800 gap-1.5 shadow-sm"
                    onClick={() => setChaptersModalBook(null)}
                  >
                    <X className="h-3.5 w-3.5 text-slate-400" /> Close / Back to
                    Library
                  </Button>
                </>
              )}
            </CardFooter>
          </Card>
        </div>
      )}

      {activePlayingTrack && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-xl px-4 animate-in slide-in-from-bottom duration-300">
          <div className="bg-slate-950/95 border border-amber-500/40 shadow-2xl backdrop-blur-md p-4 rounded-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 truncate min-w-0">
                <div className="p-2 bg-amber-500/20 rounded-xl text-amber-400 shrink-0">
                  <Headphones className="h-5 w-5" />
                </div>
                <div className="truncate">
                  <p className="text-xs font-extrabold text-amber-400 uppercase tracking-wider">
                    Chapter {activePlayingTrack.currentChapterIndex + 1} of{" "}
                    {activePlayingTrack.chapters.length}
                  </p>
                  <p className="text-sm font-bold truncate text-white">
                    {activePlayingTrack.chapters[
                      activePlayingTrack.currentChapterIndex
                    ]?.title || activePlayingTrack.bookTitle}
                  </p>
                  <p className="text-xs text-slate-400 truncate">
                    {activePlayingTrack.bookTitle} •{" "}
                    {activePlayingTrack.bookAuthor || "Unknown Author"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {activePlayingTrack.chapters.length > 1 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs font-semibold text-slate-300 hover:text-white"
                    onClick={() =>
                      handleOpenChaptersModal({
                        id: activePlayingTrack.bookId,
                        title: activePlayingTrack.bookTitle,
                        author: activePlayingTrack.bookAuthor,
                        coverUrl: activePlayingTrack.coverUrl,
                      })
                    }
                  >
                    Chapters
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white"
                  onClick={() => setActivePlayingTrack(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <audio
              controls
              autoPlay
              key={`${activePlayingTrack.bookId}-${activePlayingTrack.currentChapterIndex}`}
              src={`/api/books/${activePlayingTrack.bookId}/stream?file=${encodeURIComponent(activePlayingTrack.chapters[activePlayingTrack.currentChapterIndex]?.relativePath || "")}`}
              onEnded={handleNextChapter}
              className="w-full h-10 rounded-lg accent-amber-400"
            />

            {activePlayingTrack.chapters.length > 1 && (
              <div className="flex items-center justify-between text-xs text-slate-400 pt-1 border-t border-slate-800/60">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-300 hover:text-white disabled:opacity-40"
                  disabled={activePlayingTrack.currentChapterIndex === 0}
                  onClick={handlePrevChapter}
                >
                  ⏮ Prev Chapter
                </Button>
                <span className="text-[11px] font-semibold text-slate-400">
                  Autoplay On Next
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-slate-300 hover:text-white disabled:opacity-40"
                  disabled={
                    activePlayingTrack.currentChapterIndex ===
                    activePlayingTrack.chapters.length - 1
                  }
                  onClick={handleNextChapter}
                >
                  Next Chapter ⏭
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {errorModal.open && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <Card className="w-full max-w-lg border-red-500/40 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden relative">
            <CardHeader className="border-b border-red-900/40 bg-red-950/30 pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold text-red-400 flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-red-400 shrink-0" />
                  {errorModal.title}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-slate-400 hover:text-white"
                  onClick={() =>
                    setErrorModal({ open: false, title: "", message: "" })
                  }
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <p className="text-xs text-slate-300">
                An issue occurred. You can highlight or click the button below
                to copy the error:
              </p>
              <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 relative group">
                <pre className="text-xs font-mono text-red-300 whitespace-pre-wrap break-all max-h-48 overflow-y-auto select-all p-1">
                  {errorModal.message}
                </pre>
              </div>
            </CardContent>
            <CardFooter className="border-t border-slate-900 p-3 bg-slate-950/60 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs border-slate-700 text-slate-300 hover:bg-slate-800 gap-1.5"
                onClick={() =>
                  setErrorModal({ open: false, title: "", message: "" })
                }
              >
                Close
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs font-bold bg-red-600 text-white hover:bg-red-500 gap-1.5 shadow"
                onClick={() => handleCopyErrorToClipboard(errorModal.message)}
              >
                {errorModal.copied ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-300" /> Copied to
                    Clipboard!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> 📋 Copy Error
                  </>
                )}
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}
    </div>
  );
}






