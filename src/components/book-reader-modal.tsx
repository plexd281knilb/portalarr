"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  X,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  BookOpen,
  Sun,
  Moon,
  Type,
  List,
  Columns,
  Square,
  ScrollText,
  Download,
  Loader2,
  Clock,
  Settings2,
  Sliders,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import JSZip from "jszip";

if (typeof window !== "undefined" && !(window as any).JSZip) {
  (window as any).JSZip = JSZip;
}

interface BookReaderModalProps {
  book: {
    id: string;
    title: string;
    author?: string | null;
    fileType?: string | null;
    filePath?: string;
  } | null;
  onClose: () => void;
}

type KindleFooterMode = "time_book" | "time_chapter" | "page" | "loc" | "percentage";

export function BookReaderModal({ book, onClose }: BookReaderModalProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine reader format
  const fileExt = book?.filePath
    ? book.filePath.split(".").pop()?.toLowerCase() || ""
    : "";
  const format = (book?.fileType || fileExt || "epub").toLowerCase();
  const isComic = format === "cbr" || format === "cbz";
  const isPdf = format === "pdf";
  const isEpub = !isComic && !isPdf;

  // Immersive controls toggle (like Kindle tap center)
  const [showControls, setShowControls] = useState(true);
  const [showTypographyMenu, setShowTypographyMenu] = useState(false);

  // EPUB States
  const epubViewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const bookRef = useRef<any>(null);
  const [epubLoading, setEpubLoading] = useState(true);
  const [epubError, setEpubError] = useState<string | null>(null);
  const [epubTheme, setEpubTheme] = useState<"dark" | "light" | "sepia">("dark");
  const [epubFontSize, setEpubFontSize] = useState(100);
  const [fontFamily, setFontFamily] = useState<"bookerly" | "sans" | "mono">("bookerly");
  const [lineHeight, setLineHeight] = useState<number>(1.6);
  const [marginWidth, setMarginWidth] = useState<"narrow" | "normal" | "wide">("normal");
  const [epubToc, setEpubToc] = useState<any[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [epubLocation, setEpubLocation] = useState<string>("");
  const [epubProgress, setEpubProgress] = useState<number>(0);

  // Kindle Metrics States
  const [totalEstimatedWords, setTotalEstimatedWords] = useState<number>(75000);
  const [wordsPerMinute, setWordsPerMinute] = useState<number>(220);
  const [timeLeftBookMins, setTimeLeftBookMins] = useState<number>(0);
  const [timeLeftChapterMins, setTimeLeftChapterMins] = useState<number>(0);
  const [currentChapterName, setCurrentChapterName] = useState<string>("");
  const [pageNumberInfo, setPageNumberInfo] = useState<{ current: number; total: number }>({ current: 1, total: 1 });
  const [footerMode, setFooterMode] = useState<KindleFooterMode>("time_book");

  // Comic States
  const [comicLoading, setComicLoading] = useState(true);
  const [comicError, setComicError] = useState<string | null>(null);
  const [comicTotalPages, setComicTotalPages] = useState<number>(0);
  const [comicCurrentPage, setComicCurrentPage] = useState<number>(1);
  const [comicMode, setComicMode] = useState<"single" | "spread" | "webtoon">("single");
  const [comicFit, setComicFit] = useState<"height" | "width">("height");

  // Load saved preferences
  useEffect(() => {
    const savedTheme = localStorage.getItem("portalarr-reader-theme");
    if (savedTheme === "light" || savedTheme === "dark" || savedTheme === "sepia") {
      setEpubTheme(savedTheme);
    }
    const savedFont = localStorage.getItem("portalarr-reader-font");
    if (savedFont === "bookerly" || savedFont === "sans" || savedFont === "mono") {
      setFontFamily(savedFont);
    }
    const savedFontSize = localStorage.getItem("portalarr-reader-fontsize");
    if (savedFontSize) {
      const parsed = parseInt(savedFontSize, 10);
      if (parsed >= 60 && parsed <= 200) setEpubFontSize(parsed);
    }
    const savedFooterMode = localStorage.getItem("portalarr-kindle-footer-mode") as KindleFooterMode;
    if (savedFooterMode) {
      setFooterMode(savedFooterMode);
    }
  }, []);

  // Format minutes into Kindle "X hrs Y mins" or "Z mins"
  const formatKindleTime = (minutes: number): string => {
    if (minutes <= 0) return "1 min";
    if (minutes < 60) return `${minutes} min${minutes === 1 ? "" : "s"}`;
    const hrs = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (mins === 0) return `${hrs} hr${hrs === 1 ? "" : "s"}`;
    return `${hrs} hr${hrs === 1 ? "" : "s"} ${mins} min${mins === 1 ? "" : "s"}`;
  };

  // Cycle through Kindle footer modes on click
  const cycleFooterMode = () => {
    const modes: KindleFooterMode[] = ["time_book", "time_chapter", "page", "loc", "percentage"];
    const nextIndex = (modes.indexOf(footerMode) + 1) % modes.length;
    const nextMode = modes[nextIndex];
    setFooterMode(nextMode);
    localStorage.setItem("portalarr-kindle-footer-mode", nextMode);
  };

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (showTypographyMenu) {
          setShowTypographyMenu(false);
        } else if (showToc) {
          setShowToc(false);
        } else if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === "ArrowRight" || e.key === "PageDown" || e.key === " ") {
        if (isEpub && renditionRef.current) {
          renditionRef.current.next();
        } else if (isComic && comicCurrentPage < comicTotalPages) {
          setComicCurrentPage((prev) => Math.min(prev + (comicMode === "spread" ? 2 : 1), comicTotalPages));
        }
      } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
        if (isEpub && renditionRef.current) {
          renditionRef.current.prev();
        } else if (isComic && comicCurrentPage > 1) {
          setComicCurrentPage((prev) => Math.max(prev - (comicMode === "spread" ? 2 : 1), 1));
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEpub, isComic, comicCurrentPage, comicTotalPages, comicMode, showTypographyMenu, showToc, onClose]);

  // -------------------------------------------------------------
  // Theme & Typography Rules Generation
  // -------------------------------------------------------------
  const getFontFamilyCss = useCallback((font: "bookerly" | "sans" | "mono") => {
    if (font === "sans") {
      return '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", sans-serif';
    }
    if (font === "mono") {
      return '"SF Mono", "Fira Code", "Courier New", Courier, monospace';
    }
    return '"Bookerly", "Georgia", "Palatino Linotype", "Times New Roman", serif';
  }, []);

  const getPaddingCss = useCallback((margin: "narrow" | "normal" | "wide") => {
    if (margin === "narrow") return "16px 20px !important";
    if (margin === "wide") return "32px 80px !important";
    return "24px 44px !important";
  }, []);

  const applyRenditionStyles = useCallback((rendition: any, theme: string, font: "bookerly" | "sans" | "mono", size: number, lh: number, margin: "narrow" | "normal" | "wide") => {
    if (!rendition) return;

    const fontCss = getFontFamilyCss(font);
    const paddingCss = getPaddingCss(margin);

    rendition.themes.register("dark", {
      body: {
        background: "#090d16 !important",
        color: "#e2e8f0 !important",
        "font-family": `${fontCss} !important`,
        "line-height": `${lh} !important`,
        padding: paddingCss,
      },
      "p, div, span, h1, h2, h3, h4, h5, h6, a, li": {
        color: "#e2e8f0 !important",
        "font-family": `${fontCss} !important`,
        "line-height": `${lh} !important`,
      },
    });

    rendition.themes.register("light", {
      body: {
        background: "#ffffff !important",
        color: "#1e293b !important",
        "font-family": `${fontCss} !important`,
        "line-height": `${lh} !important`,
        padding: paddingCss,
      },
      "p, div, span, h1, h2, h3, h4, h5, h6, a, li": {
        color: "#1e293b !important",
        "font-family": `${fontCss} !important`,
        "line-height": `${lh} !important`,
      },
    });

    rendition.themes.register("sepia", {
      body: {
        background: "#f8f1e5 !important",
        color: "#5c4033 !important",
        "font-family": `${fontCss} !important`,
        "line-height": `${lh} !important`,
        padding: paddingCss,
      },
      "p, div, span, h1, h2, h3, h4, h5, h6, a, li": {
        color: "#5c4033 !important",
        "font-family": `${fontCss} !important`,
        "line-height": `${lh} !important`,
      },
    });

    rendition.themes.select(theme);
    rendition.themes.fontSize(`${size}%`);
  }, [getFontFamilyCss, getPaddingCss]);

  // -------------------------------------------------------------
  // EPUB Reader Initialization
  // -------------------------------------------------------------
  useEffect(() => {
    if (!book || !isEpub) return;

    let isMounted = true;
    setEpubLoading(true);
    setEpubError(null);

    async function initEpub() {
      try {
        const ePubModule = await import("epubjs");
        const ePub = (ePubModule as any).default || ePubModule;

        if (!epubViewerRef.current) return;
        epubViewerRef.current.innerHTML = "";

        // CacheStorage for instant 0ms offline reopening
        const cacheUrl = `/api/books/${book!.id}`;
        let arrayBuffer: ArrayBuffer | null = null;

        if (typeof window !== "undefined" && "caches" in window) {
          try {
            const cache = await caches.open("portalarr-books-v1");
            const cachedRes = await cache.match(cacheUrl);
            if (cachedRes) {
              arrayBuffer = await cachedRes.arrayBuffer();
            } else {
              const netRes = await fetch(cacheUrl);
              if (!netRes.ok) throw new Error(`HTTP ${netRes.status}: ${netRes.statusText}`);
              await cache.put(cacheUrl, netRes.clone());
              arrayBuffer = await netRes.arrayBuffer();
            }
          } catch (cErr) {
            console.warn("CacheStorage fallback:", cErr);
          }
        }

        if (!arrayBuffer) {
          const res = await fetch(cacheUrl);
          if (!res.ok) {
            throw new Error(`Failed to load ebook file (HTTP ${res.status}: ${res.statusText})`);
          }
          arrayBuffer = await res.arrayBuffer();
        }

        if (!isMounted) return;

        const bookInstance = ePub(arrayBuffer);
        bookRef.current = bookInstance;

        const rendition = bookInstance.renderTo(epubViewerRef.current, {
          width: "100%",
          height: "100%",
          flow: "paginated",
          spread: "none",
        });
        renditionRef.current = rendition;

        applyRenditionStyles(rendition, epubTheme, fontFamily, epubFontSize, lineHeight, marginWidth);

        // Dismiss spinner as soon as rendered
        rendition.on("rendered", () => {
          if (isMounted) setEpubLoading(false);
        });

        // Fast & Accurate Kindle Progress Calculator
        const computeKindleMetrics = (loc: any) => {
          if (!loc?.start) return;
          const cfi = loc.start.cfi;

          let calculatedPercentage = 0;

          // 1. Check generated CFI locations (high precision)
          if (bookInstance.locations && typeof bookInstance.locations.length === "function" && bookInstance.locations.length() > 0) {
            try {
              const perc = bookInstance.locations.percentageFromCfi(cfi);
              if (typeof perc === "number" && !isNaN(perc) && perc >= 0) {
                calculatedPercentage = Math.max(1, Math.min(100, Math.round(perc * 100)));
              }
            } catch (e) {}
          }

          // 2. Spine sections fallback
          const spineItems = bookInstance.spine?.spineItems || bookInstance.spine || [];
          const totalSpine = Array.isArray(spineItems) ? spineItems.length : ((bookInstance.spine as any)?.length || 1);
          const spineIndex = typeof loc.start.index === "number" ? loc.start.index : 0;
          
          if (!calculatedPercentage && totalSpine > 0) {
            const raw = Math.round(((spineIndex + 1) / totalSpine) * 100);
            calculatedPercentage = Math.max(1, Math.min(100, raw));
          }

          if (!calculatedPercentage) calculatedPercentage = 1;

          // 3. Compute Estimated Time Remaining
          const estimatedWordsTotal = totalSpine * 2800; // ~2.8k words per chapter average
          setTotalEstimatedWords(estimatedWordsTotal);

          const wordsRemainingInBook = Math.max(0, Math.round(estimatedWordsTotal * (1 - (calculatedPercentage / 100))));
          const minsLeftBook = Math.max(1, Math.round(wordsRemainingInBook / wordsPerMinute));
          setTimeLeftBookMins(minsLeftBook);

          // Chapter estimates
          const displayedPage = loc.start.displayed?.page || 1;
          const totalDisplayed = loc.start.displayed?.total || 10;
          setPageNumberInfo({ current: displayedPage, total: totalDisplayed });

          const chapterFractionRemaining = Math.max(0, 1 - (displayedPage / totalDisplayed));
          const chapterWordsRemaining = Math.round(2800 * chapterFractionRemaining);
          const minsLeftChapter = Math.max(1, Math.round(chapterWordsRemaining / wordsPerMinute));
          setTimeLeftChapterMins(minsLeftChapter);

          setEpubProgress(calculatedPercentage);

          // Save Unified Progress Payload
          const progressPayload = {
            bookId: book!.id,
            format: "epub",
            cfi,
            percentage: calculatedPercentage,
            updatedAt: Date.now(),
          };
          localStorage.setItem(`portalarr-reading-progress-${book!.id}`, JSON.stringify(progressPayload));
          localStorage.setItem(`portalarr-epub-loc-${book!.id}`, cfi);
          window.dispatchEvent(new CustomEvent("portalarr-progress-updated", { detail: progressPayload }));
        };

        // Restore saved progress (CFI location & percentage)
        let savedCfi: string | null = null;
        try {
          const rawProgress = localStorage.getItem(`portalarr-reading-progress-${book!.id}`);
          if (rawProgress) {
            const parsed = JSON.parse(rawProgress);
            if (parsed && parsed.cfi) savedCfi = parsed.cfi;
          }
        } catch (e) {}

        if (!savedCfi) {
          savedCfi = localStorage.getItem(`portalarr-epub-loc-${book!.id}`);
        }

        try {
          if (savedCfi) {
            await rendition.display(savedCfi);
          } else {
            await rendition.display();
          }
        } catch (dispErr) {
          console.warn("Could not display saved location, falling back to start:", dispErr);
          await rendition.display();
        }

        if (isMounted) {
          setEpubLoading(false);
        }

        // Extract TOC
        bookInstance.loaded.navigation.then((nav: any) => {
          if (isMounted) {
            setEpubToc(nav.toc || []);
          }
        }).catch((e: any) => console.warn("TOC extraction warning:", e));

        // Generate Locations in background for fine-grained accuracy
        bookInstance.ready.then(() => {
          return bookInstance.locations.generate(1000);
        }).then(() => {
          if (isMounted && rendition.location) {
            const loc = rendition.currentLocation();
            if (loc) computeKindleMetrics(loc);
          }
        }).catch((e: any) => console.warn("Locations generation warning:", e));

        // Track Location Changes & Update Kindle metrics
        rendition.on("relocated", (location: any) => {
          if (!isMounted) return;
          if (location && location.start) {
            setEpubLocation(location.start.cfi);
            computeKindleMetrics(location);
          }
        });
      } catch (err: any) {
        console.error("EPUB init error:", err);
        if (isMounted) {
          setEpubError(err.message || "Failed to parse EPUB file.");
          setEpubLoading(false);
        }
      }
    }

    initEpub();

    // Window resize handler
    const handleResize = () => {
      if (renditionRef.current && epubViewerRef.current) {
        renditionRef.current.resize();
      }
    };
    window.addEventListener("resize", handleResize);

    return () => {
      isMounted = false;
      window.removeEventListener("resize", handleResize);
      if (bookRef.current) {
        bookRef.current.destroy();
      }
    };
  }, [book?.id, isEpub]);

  // Update styles whenever typography settings change
  useEffect(() => {
    if (renditionRef.current) {
      applyRenditionStyles(renditionRef.current, epubTheme, fontFamily, epubFontSize, lineHeight, marginWidth);
    }
  }, [epubTheme, fontFamily, epubFontSize, lineHeight, marginWidth, applyRenditionStyles]);

  // -------------------------------------------------------------
  // Comic (CBR / CBZ) Reader Initialization
  // -------------------------------------------------------------
  useEffect(() => {
    if (!book || !isComic) return;

    let isMounted = true;
    setComicLoading(true);
    setComicError(null);

    async function loadComicInfo() {
      try {
        const res = await fetch(`/api/books/${book!.id}/comic`);
        const data = await res.json();

        if (!data.success) {
          throw new Error(data.error || "Failed to load comic archive");
        }

        if (isMounted) {
          setComicTotalPages(data.totalPages || 0);

          // Restore saved page
          let savedPage = 1;
          try {
            const rawProgress = localStorage.getItem(`portalarr-reading-progress-${book!.id}`);
            if (rawProgress) {
              const parsed = JSON.parse(rawProgress);
              if (parsed && typeof parsed.page === "number") savedPage = parsed.page;
            }
          } catch (e) {}

          if (savedPage === 1) {
            const oldSaved = localStorage.getItem(`portalarr-comic-page-${book!.id}`);
            if (oldSaved) savedPage = parseInt(oldSaved, 10) || 1;
          }

          if (savedPage >= 1 && savedPage <= data.totalPages) {
            setComicCurrentPage(savedPage);
          } else {
            setComicCurrentPage(1);
          }
          setComicLoading(false);
        }
      } catch (err: any) {
        console.error("Comic fetch error:", err);
        if (isMounted) {
          setComicError(err.message || "Failed to read comic archive.");
          setComicLoading(false);
        }
      }
    }

    loadComicInfo();

    return () => {
      isMounted = false;
    };
  }, [book?.id, isComic]);

  // Save comic progress & preload next pages
  useEffect(() => {
    if (!book || !isComic || comicTotalPages === 0) return;

    const percentage = Math.max(1, Math.round((comicCurrentPage / comicTotalPages) * 100));
    const progressPayload = {
      bookId: book.id,
      format: "comic",
      page: comicCurrentPage,
      totalPages: comicTotalPages,
      percentage,
      updatedAt: Date.now(),
    };

    localStorage.setItem(`portalarr-reading-progress-${book.id}`, JSON.stringify(progressPayload));
    localStorage.setItem(`portalarr-comic-page-${book.id}`, String(comicCurrentPage));
    window.dispatchEvent(new CustomEvent("portalarr-progress-updated", { detail: progressPayload }));

    // Preload next 2 pages in memory
    if (comicCurrentPage < comicTotalPages) {
      const nextImg = new Image();
      nextImg.src = `/api/books/${book.id}/comic?page=${comicCurrentPage + 1}`;
    }
    if (comicCurrentPage + 1 < comicTotalPages) {
      const nextImg2 = new Image();
      nextImg2.src = `/api/books/${book.id}/comic?page=${comicCurrentPage + 2}`;
    }
  }, [book?.id, isComic, comicCurrentPage, comicTotalPages]);

  if (!book) return null;

  return (
    <div
      ref={containerRef}
      className={`fixed inset-0 z-[120] flex flex-col select-none transition-colors duration-200 ${
        epubTheme === "light" && isEpub
          ? "bg-[#fafafa] text-[#1e293b]"
          : epubTheme === "sepia" && isEpub
          ? "bg-[#f8f1e5] text-[#5c4033]"
          : "bg-[#090d16] text-[#e2e8f0]"
      }`}
    >
      {/* Top Kindle Navigation Bar (Auto-Hides in Immersive Mode) */}
      <div
        className={`h-14 px-4 flex items-center justify-between border-b shrink-0 z-40 transition-all duration-300 ${
          showControls ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"
        } ${
          epubTheme === "light" && isEpub
            ? "border-slate-200 bg-white/95 backdrop-blur text-slate-900 shadow-sm"
            : epubTheme === "sepia" && isEpub
            ? "border-[#e6d8c3] bg-[#f2e7d5]/95 backdrop-blur text-[#5c4033] shadow-sm"
            : "border-slate-800/80 bg-[#0c121e]/95 backdrop-blur text-slate-100 shadow-lg"
        }`}
      >
        <div className="flex items-center gap-3 truncate max-w-[45%]">
          <Badge className="bg-primary/20 text-primary border-primary/30 uppercase text-[10px] font-bold tracking-wider">
            {format.toUpperCase()}
          </Badge>
          <div className="truncate">
            <h2 className="text-sm font-bold truncate leading-tight">{book.title}</h2>
            {book.author && (
              <p className="text-[11px] opacity-70 truncate">{book.author}</p>
            )}
          </div>
        </div>

        {/* Reader Action Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* EPUB Controls */}
          {isEpub && (
            <>
              {/* Table of Contents */}
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-2.5 text-xs gap-1.5 font-semibold"
                title="Chapters / Table of Contents"
                onClick={() => {
                  setShowToc(!showToc);
                  setShowTypographyMenu(false);
                }}
              >
                <List className="h-4 w-4" />
                <span className="hidden md:inline">Chapters</span>
              </Button>

              {/* Kindle Aa Typography Menu Button */}
              <Button
                variant={showTypographyMenu ? "secondary" : "ghost"}
                size="sm"
                className="h-8 px-2.5 text-xs font-bold gap-1 tracking-tight"
                title="Kindle Typography & Layout (Aa)"
                onClick={() => {
                  setShowTypographyMenu(!showTypographyMenu);
                  setShowToc(false);
                }}
              >
                <span className="font-serif text-base leading-none">Aa</span>
              </Button>
            </>
          )}

          {/* Comic Controls */}
          {isComic && !comicLoading && !comicError && (
            <>
              <div className="flex items-center rounded-lg border border-slate-700/60 p-0.5 bg-slate-950/40">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${comicMode === "single" ? "bg-primary text-black font-bold" : "text-slate-400"}`}
                  title="Single Page Mode"
                  onClick={() => setComicMode("single")}
                >
                  <Square className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${comicMode === "spread" ? "bg-primary text-black font-bold" : "text-slate-400"}`}
                  title="Double Page Spread Mode"
                  onClick={() => setComicMode("spread")}
                >
                  <Columns className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${comicMode === "webtoon" ? "bg-primary text-black font-bold" : "text-slate-400"}`}
                  title="Vertical Webtoon Mode"
                  onClick={() => setComicMode("webtoon")}
                >
                  <ScrollText className="h-3 w-3" />
                </Button>
              </div>

              {comicMode !== "webtoon" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs border border-slate-700/60"
                  onClick={() => setComicFit(comicFit === "height" ? "width" : "height")}
                >
                  {comicFit === "height" ? "Fit Height" : "Fit Width"}
                </Button>
              )}
            </>
          )}

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
            onClick={toggleFullscreen}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>

          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-slate-400 hover:text-white"
            title="Close Reader"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Main Reader Canvas */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Table of Contents Drawer */}
        {isEpub && showToc && (
          <div className="absolute top-0 bottom-0 left-0 w-80 z-50 bg-slate-950/95 backdrop-blur-md border-r border-slate-800 p-4 overflow-y-auto shadow-2xl animate-in slide-in-from-left duration-200 text-slate-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <List className="h-4 w-4 text-primary" /> Table of Contents
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowToc(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {epubToc.length === 0 ? (
              <p className="text-xs text-slate-500 italic p-2">No chapters found.</p>
            ) : (
              <ul className="space-y-1">
                {epubToc.map((chapter, idx) => (
                  <li key={idx}>
                    <button
                      className="w-full text-left text-xs py-2 px-2.5 rounded hover:bg-slate-800 text-slate-300 hover:text-primary transition-colors truncate font-medium"
                      onClick={() => {
                        if (renditionRef.current && chapter.href) {
                          renditionRef.current.display(chapter.href);
                          setShowToc(false);
                        }
                      }}
                    >
                      {chapter.label?.trim() || `Chapter ${idx + 1}`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Kindle Aa Typography Settings Popover Modal */}
        {isEpub && showTypographyMenu && (
          <div className="absolute top-2 right-4 w-80 z-50 bg-slate-900/95 backdrop-blur-md border border-slate-800 rounded-xl p-4 shadow-2xl animate-in fade-in zoom-in-95 duration-150 text-slate-100 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <Settings2 className="h-4 w-4 text-primary" /> Kindle Display Settings
              </span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowTypographyMenu(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Theme / Backdrop Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400">Backdrop Theme</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  className={`h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    epubTheme === "dark" ? "bg-slate-950 text-white border-primary ring-1 ring-primary" : "bg-slate-950 text-slate-400 border-slate-800"
                  }`}
                  onClick={() => {
                    setEpubTheme("dark");
                    localStorage.setItem("portalarr-reader-theme", "dark");
                  }}
                >
                  <Moon className="h-3.5 w-3.5" /> Dark
                </button>
                <button
                  className={`h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    epubTheme === "sepia" ? "bg-[#f4ecd8] text-[#5c4033] border-amber-600 ring-1 ring-amber-600" : "bg-[#f4ecd8] text-[#7a5843] border-[#e2d4bc]"
                  }`}
                  onClick={() => {
                    setEpubTheme("sepia");
                    localStorage.setItem("portalarr-reader-theme", "sepia");
                  }}
                >
                  <ScrollText className="h-3.5 w-3.5" /> Sepia
                </button>
                <button
                  className={`h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    epubTheme === "light" ? "bg-white text-slate-900 border-slate-300 ring-1 ring-slate-400" : "bg-white text-slate-700 border-slate-300"
                  }`}
                  onClick={() => {
                    setEpubTheme("light");
                    localStorage.setItem("portalarr-reader-theme", "light");
                  }}
                >
                  <Sun className="h-3.5 w-3.5" /> Light
                </button>
              </div>
            </div>

            {/* Font Family Selector */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400">Typeface</label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  className={`h-8 rounded-lg border text-xs transition-all font-serif ${
                    fontFamily === "bookerly" ? "bg-primary text-black font-bold border-primary" : "bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800"
                  }`}
                  onClick={() => {
                    setFontFamily("bookerly");
                    localStorage.setItem("portalarr-reader-font", "bookerly");
                  }}
                >
                  Bookerly
                </button>
                <button
                  className={`h-8 rounded-lg border text-xs transition-all font-sans ${
                    fontFamily === "sans" ? "bg-primary text-black font-bold border-primary" : "bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800"
                  }`}
                  onClick={() => {
                    setFontFamily("sans");
                    localStorage.setItem("portalarr-reader-font", "sans");
                  }}
                >
                  Ember
                </button>
                <button
                  className={`h-8 rounded-lg border text-xs transition-all font-mono ${
                    fontFamily === "mono" ? "bg-primary text-black font-bold border-primary" : "bg-slate-950/60 text-slate-300 border-slate-800 hover:bg-slate-800"
                  }`}
                  onClick={() => {
                    setFontFamily("mono");
                    localStorage.setItem("portalarr-reader-font", "mono");
                  }}
                >
                  Mono
                </button>
              </div>
            </div>

            {/* Font Size Scaling */}
            <div className="space-y-1.5">
              <div className="flex justify-between items-center text-[11px] font-semibold text-slate-400">
                <span>Font Size</span>
                <span className="font-mono text-primary font-bold">{epubFontSize}%</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 border-slate-700 text-xs font-bold"
                  onClick={() => {
                    const newSize = Math.max(epubFontSize - 10, 60);
                    setEpubFontSize(newSize);
                    localStorage.setItem("portalarr-reader-fontsize", String(newSize));
                  }}
                >
                  A- Smaller
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 flex-1 border-slate-700 text-xs font-bold"
                  onClick={() => {
                    const newSize = Math.min(epubFontSize + 10, 180);
                    setEpubFontSize(newSize);
                    localStorage.setItem("portalarr-reader-fontsize", String(newSize));
                  }}
                >
                  A+ Larger
                </Button>
              </div>
            </div>

            {/* Margins */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400">Margins</label>
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  className={`h-7 rounded border text-[11px] ${marginWidth === "narrow" ? "bg-primary text-black font-bold" : "bg-slate-950 border-slate-800 text-slate-300"}`}
                  onClick={() => setMarginWidth("narrow")}
                >
                  Narrow
                </button>
                <button
                  className={`h-7 rounded border text-[11px] ${marginWidth === "normal" ? "bg-primary text-black font-bold" : "bg-slate-950 border-slate-800 text-slate-300"}`}
                  onClick={() => setMarginWidth("normal")}
                >
                  Normal
                </button>
                <button
                  className={`h-7 rounded border text-[11px] ${marginWidth === "wide" ? "bg-primary text-black font-bold" : "bg-slate-950 border-slate-800 text-slate-300"}`}
                  onClick={() => setMarginWidth("wide")}
                >
                  Wide
                </button>
              </div>
            </div>
          </div>
        )}

        {/* EPUB Viewer Container */}
        {isEpub && (
          <div className="relative flex-1 h-full w-full flex items-center justify-center overflow-hidden">
            {epubLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 z-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-slate-400 font-medium">Opening Kindle Reader...</p>
              </div>
            )}

            {epubError ? (
              <div className="p-6 max-w-md text-center space-y-3 bg-slate-900 border border-red-500/30 rounded-xl z-20">
                <p className="text-sm font-semibold text-red-400">Could not render EPUB in browser</p>
                <p className="text-xs text-slate-400">{epubError}</p>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/books/${book.id}?download=true`} download>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download File Directly
                  </a>
                </Button>
              </div>
            ) : (
              <>
                <div ref={epubViewerRef} className="w-full h-full max-w-5xl mx-auto" />

                {/* Kindle Center Screen Click Zone to Toggle Immersive Toolbars */}
                <div
                  className="absolute inset-x-1/4 inset-y-16 cursor-default select-none z-10"
                  onClick={() => setShowControls(!showControls)}
                  title="Tap to toggle reading toolbars"
                />

                {/* Left Click Page Turning Zone */}
                <button
                  className="absolute left-0 top-0 bottom-0 w-1/4 group flex items-center justify-start pl-3 bg-gradient-to-r from-black/10 to-transparent hover:from-black/30 transition-all opacity-0 hover:opacity-100 select-none cursor-pointer z-20"
                  onClick={() => renditionRef.current?.prev()}
                  title="Previous Page"
                >
                  <ChevronLeft className="h-8 w-8 text-white/70 group-hover:scale-110 transition-transform" />
                </button>

                {/* Right Click Page Turning Zone */}
                <button
                  className="absolute right-0 top-0 bottom-0 w-1/4 group flex items-center justify-end pr-3 bg-gradient-to-l from-black/10 to-transparent hover:from-black/30 transition-all opacity-0 hover:opacity-100 select-none cursor-pointer z-20"
                  onClick={() => renditionRef.current?.next()}
                  title="Next Page"
                >
                  <ChevronRight className="h-8 w-8 text-white/70 group-hover:scale-110 transition-transform" />
                </button>
              </>
            )}
          </div>
        )}

        {/* Comic (CBR / CBZ) Viewer Container */}
        {isComic && (
          <div className="relative flex-1 h-full w-full flex flex-col items-center justify-center overflow-hidden">
            {comicLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 z-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-slate-400 font-medium">Extracting Comic Pages...</p>
              </div>
            )}

            {comicError ? (
              <div className="p-6 max-w-md text-center space-y-3 bg-slate-900 border border-red-500/30 rounded-xl z-20">
                <p className="text-sm font-semibold text-red-400">Could not extract comic archive</p>
                <p className="text-xs text-slate-400">{comicError}</p>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/books/${book.id}?download=true`} download>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download File Directly
                  </a>
                </Button>
              </div>
            ) : comicTotalPages > 0 ? (
              comicMode === "webtoon" ? (
                <div className="w-full h-full overflow-y-auto flex flex-col items-center p-4 space-y-2 bg-black">
                  {Array.from({ length: comicTotalPages }, (_, i) => i + 1).map((pageNum) => (
                    <img
                      key={pageNum}
                      src={`/api/books/${book.id}/comic?page=${pageNum}`}
                      alt={`Page ${pageNum}`}
                      loading="lazy"
                      className="max-w-3xl w-full object-contain shadow-2xl rounded"
                    />
                  ))}
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center bg-black select-none">
                  <div className="flex items-center justify-center h-full w-full max-h-full max-w-full p-2 gap-2">
                    {comicMode === "spread" && comicCurrentPage > 1 && (
                      <img
                        src={`/api/books/${book.id}/comic?page=${comicCurrentPage - 1}`}
                        alt={`Page ${comicCurrentPage - 1}`}
                        className={`object-contain rounded ${
                          comicFit === "height" ? "h-full w-auto max-w-[50%]" : "w-[48%] h-auto"
                        }`}
                      />
                    )}
                    <img
                      src={`/api/books/${book.id}/comic?page=${comicCurrentPage}`}
                      alt={`Page ${comicCurrentPage}`}
                      className={`object-contain rounded ${
                        comicMode === "spread"
                          ? comicFit === "height" ? "h-full w-auto max-w-[50%]" : "w-[48%] h-auto"
                          : comicFit === "height" ? "h-full w-auto max-w-full" : "w-full h-auto max-h-full"
                      }`}
                    />
                  </div>

                  {/* Center Tap to Toggle Controls */}
                  <div
                    className="absolute inset-x-1/4 inset-y-16 cursor-default select-none z-10"
                    onClick={() => setShowControls(!showControls)}
                  />

                  {/* Left Click Zone */}
                  <button
                    className="absolute left-0 top-0 bottom-0 w-1/4 flex items-center justify-start pl-4 bg-gradient-to-r from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity cursor-pointer select-none group z-20"
                    onClick={() => setComicCurrentPage((prev) => Math.max(prev - (comicMode === "spread" ? 2 : 1), 1))}
                    title="Previous Page"
                  >
                    <ChevronLeft className="h-10 w-10 text-white/80 group-hover:scale-120 transition-transform" />
                  </button>

                  {/* Right Click Zone */}
                  <button
                    className="absolute right-0 top-0 bottom-0 w-1/4 flex items-center justify-end pr-4 bg-gradient-to-l from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity cursor-pointer select-none group z-20"
                    onClick={() => setComicCurrentPage((prev) => Math.min(prev + (comicMode === "spread" ? 2 : 1), comicTotalPages))}
                    title="Next Page"
                  >
                    <ChevronRight className="h-10 w-10 text-white/80 group-hover:scale-120 transition-transform" />
                  </button>
                </div>
              )
            ) : null}
          </div>
        )}

        {/* PDF Embedded Viewer Container */}
        {isPdf && (
          <div className="relative flex-1 h-full w-full bg-slate-900">
            <iframe
              src={`/api/books/${book.id}#toolbar=1`}
              title={book.title}
              className="w-full h-full border-none"
            />
          </div>
        )}
      </div>

      {/* Bottom Kindle Status & Scrub Bar */}
      <div
        className={`h-11 px-4 flex items-center justify-between border-t text-xs shrink-0 select-none z-40 transition-all duration-300 ${
          showControls ? "translate-y-0 opacity-100" : "translate-y-full opacity-0 pointer-events-none"
        } ${
          epubTheme === "light" && isEpub
            ? "border-slate-200 bg-white/95 backdrop-blur text-slate-700 shadow-sm"
            : epubTheme === "sepia" && isEpub
            ? "border-[#e6d8c3] bg-[#f2e7d5]/95 backdrop-blur text-[#5c4033] shadow-sm"
            : "border-slate-800/80 bg-[#0c121e]/95 backdrop-blur text-slate-400 shadow-lg"
        }`}
      >
        {/* EPUB Navigation & Kindle Metrics */}
        {isEpub && (
          <>
            {/* Tappable Kindle Status Area (Cycles time left, pages, locations) */}
            <button
              onClick={cycleFooterMode}
              className="flex items-center gap-1.5 font-medium hover:text-primary transition-colors cursor-pointer py-1 px-2 rounded hover:bg-slate-800/40 text-left truncate max-w-[40%]"
              title="Click to cycle: Time Left in Book, Time Left in Chapter, Page in Book, Location"
            >
              <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate">
                {footerMode === "time_book" && `${formatKindleTime(timeLeftBookMins)} left in book`}
                {footerMode === "time_chapter" && `${formatKindleTime(timeLeftChapterMins)} left in chapter`}
                {footerMode === "page" && `Page ${pageNumberInfo.current} of ${pageNumberInfo.total}`}
                {footerMode === "loc" && `Loc ${Math.round(epubProgress * 30 + 1)} (${epubProgress}%)`}
                {footerMode === "percentage" && `${epubProgress}% read`}
              </span>
            </button>

            {/* Center Kindle Progress Bar */}
            <div className="flex-1 max-w-sm mx-4 flex items-center gap-2.5">
              <div className="w-full bg-slate-800/80 h-1.5 rounded-full overflow-hidden relative">
                <div
                  className="bg-primary h-full transition-all duration-300 rounded-full"
                  style={{ width: `${Math.min(epubProgress, 100)}%` }}
                />
              </div>
              <span className="font-mono text-[11px] font-bold text-primary shrink-0 min-w-[36px] text-right">
                {epubProgress}%
              </span>
            </div>

            {/* Quick Page Turning Buttons */}
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-0.5"
                onClick={() => renditionRef.current?.prev()}
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-0.5"
                onClick={() => renditionRef.current?.next()}
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}

        {/* Comic Navigation Bar */}
        {isComic && comicTotalPages > 0 && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              disabled={comicCurrentPage <= 1}
              onClick={() => setComicCurrentPage((prev) => Math.max(prev - (comicMode === "spread" ? 2 : 1), 1))}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev
            </Button>

            <div className="flex-1 max-w-xs mx-4 flex items-center gap-3">
              <input
                type="range"
                min={1}
                max={comicTotalPages}
                value={comicCurrentPage}
                onChange={(e) => setComicCurrentPage(parseInt(e.target.value, 10))}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-primary"
              />
              <span className="font-mono text-[11px] whitespace-nowrap">
                {comicCurrentPage} / {comicTotalPages} ({Math.round((comicCurrentPage / comicTotalPages) * 100)}%)
              </span>
            </div>

            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              disabled={comicCurrentPage >= comicTotalPages}
              onClick={() => setComicCurrentPage((prev) => Math.min(prev + (comicMode === "spread" ? 2 : 1), comicTotalPages))}
            >
              Next <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </>
        )}

        {/* PDF Status Bar */}
        {isPdf && (
          <div className="w-full flex items-center justify-between">
            <span className="font-medium">PDF Document Reader</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <a href={`/api/books/${book.id}?download=true`} download>
                <Download className="h-3 w-3 mr-1" /> Download
              </a>
            </Button>
          </div>
        )}
      </div>

      {/* Subtle Immersive Corner Info Indicator when Toolbars are Hidden */}
      {!showControls && isEpub && (
        <div
          className="fixed bottom-2 left-4 z-30 opacity-60 hover:opacity-100 transition-opacity text-[11px] font-mono cursor-pointer flex items-center gap-1.5 bg-black/40 backdrop-blur px-2.5 py-1 rounded-full border border-white/10"
          onClick={() => setShowControls(true)}
          title="Click to show toolbars"
        >
          <Clock className="h-3 w-3 text-primary" />
          <span>
            {footerMode === "time_book" && `${formatKindleTime(timeLeftBookMins)} left in book`}
            {footerMode === "time_chapter" && `${formatKindleTime(timeLeftChapterMins)} left in chapter`}
            {footerMode === "page" && `Page ${pageNumberInfo.current} of ${pageNumberInfo.total}`}
            {footerMode === "loc" && `Loc ${Math.round(epubProgress * 30 + 1)}`}
            {footerMode === "percentage" && `${epubProgress}%`}
          </span>
          <span className="opacity-40">•</span>
          <span className="text-primary font-bold">{epubProgress}%</span>
        </div>
      )}
    </div>
  );
}
