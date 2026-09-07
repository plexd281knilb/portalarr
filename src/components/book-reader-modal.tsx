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
  ZoomIn,
  ZoomOut,
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

  // EPUB States
  const epubViewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<any>(null);
  const bookRef = useRef<any>(null);
  const [epubLoading, setEpubLoading] = useState(true);
  const [epubError, setEpubError] = useState<string | null>(null);
  const [epubTheme, setEpubTheme] = useState<"dark" | "light" | "sepia">("dark");
  const [epubFontSize, setEpubFontSize] = useState(100);
  const [epubToc, setEpubToc] = useState<any[]>([]);
  const [showToc, setShowToc] = useState(false);
  const [epubLocation, setEpubLocation] = useState<string>("");
  const [epubProgress, setEpubProgress] = useState<number>(0);

  // Comic States
  const [comicLoading, setComicLoading] = useState(true);
  const [comicError, setComicError] = useState<string | null>(null);
  const [comicTotalPages, setComicTotalPages] = useState<number>(0);
  const [comicCurrentPage, setComicCurrentPage] = useState<number>(1);
  const [comicMode, setComicMode] = useState<"single" | "spread" | "webtoon">("single");
  const [comicFit, setComicFit] = useState<"height" | "width">("height");
  const [comicZoom, setComicZoom] = useState<number>(100);

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
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        } else {
          onClose();
        }
      } else if (e.key === "ArrowRight" || e.key === "PageDown") {
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
  }, [isEpub, isComic, comicCurrentPage, comicTotalPages, comicMode, onClose]);

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

        // Fetch binary data directly to prevent URL path guessing bugs in epubjs
        const res = await fetch(`/api/books/${book!.id}`);
        if (!res.ok) {
          throw new Error(`Failed to load ebook file (HTTP ${res.status}: ${res.statusText})`);
        }
        const arrayBuffer = await res.arrayBuffer();
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

        // Register Themes
        rendition.themes.register("dark", {
          body: {
            background: "#090d16 !important",
            color: "#e2e8f0 !important",
            "font-family": "system-ui, -apple-system, sans-serif !important",
            padding: "20px 40px !important",
          },
          "p, div, span, h1, h2, h3, h4, h5, h6, a, li": {
            color: "#e2e8f0 !important",
          },
        });
        rendition.themes.register("light", {
          body: {
            background: "#ffffff !important",
            color: "#1e293b !important",
            "font-family": "system-ui, -apple-system, sans-serif !important",
            padding: "20px 40px !important",
          },
          "p, div, span, h1, h2, h3, h4, h5, h6, a, li": {
            color: "#1e293b !important",
          },
        });
        rendition.themes.register("sepia", {
          body: {
            background: "#f8f1e5 !important",
            color: "#5c4033 !important",
            "font-family": "Georgia, serif !important",
            padding: "20px 40px !important",
          },
          "p, div, span, h1, h2, h3, h4, h5, h6, a, li": {
            color: "#5c4033 !important",
          },
        });

        rendition.themes.select(epubTheme);
        rendition.themes.fontSize(`${epubFontSize}%`);

        // Dismiss spinner as soon as rendered
        rendition.on("rendered", () => {
          if (isMounted) setEpubLoading(false);
        });

        // Load saved progress or start of book
        const savedLocation = localStorage.getItem(`portalarr-epub-loc-${book!.id}`);
        try {
          if (savedLocation) {
            await rendition.display(savedLocation);
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

        // Generate Locations for Progress percentage
        bookInstance.ready.then(() => {
          return bookInstance.locations.generate(1000);
        }).then(() => {
          if (isMounted && rendition.location) {
            const loc = rendition.currentLocation();
            if (loc && loc.start) {
              const perc = bookInstance.locations.percentageFromCfi(loc.start.cfi);
              if (typeof perc === "number") {
                setEpubProgress(Math.round(perc * 100));
              }
            }
          }
        }).catch((e: any) => console.warn("Locations generation warning:", e));

        // Track Location Changes
        rendition.on("relocated", (location: any) => {
          if (!isMounted) return;
          if (location && location.start) {
            const cfi = location.start.cfi;
            setEpubLocation(cfi);
            localStorage.setItem(`portalarr-epub-loc-${book!.id}`, cfi);
            if (bookInstance.locations && bookInstance.locations.length()) {
              const perc = bookInstance.locations.percentageFromCfi(cfi);
              if (typeof perc === "number") {
                setEpubProgress(Math.round(perc * 100));
              }
            }
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

  // Update theme and font size on changes
  useEffect(() => {
    if (renditionRef.current) {
      renditionRef.current.themes.select(epubTheme);
      renditionRef.current.themes.fontSize(`${epubFontSize}%`);
    }
  }, [epubTheme, epubFontSize]);

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
          const saved = localStorage.getItem(`portalarr-comic-page-${book!.id}`);
          const parsedSaved = saved ? parseInt(saved, 10) : 1;
          if (parsedSaved >= 1 && parsedSaved <= data.totalPages) {
            setComicCurrentPage(parsedSaved);
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
    if (!book || !isComic) return;
    localStorage.setItem(`portalarr-comic-page-${book.id}`, String(comicCurrentPage));

    // Preload next 2 pages
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
      className={`fixed inset-0 z-[120] bg-slate-950 flex flex-col text-slate-100 ${
        epubTheme === "light" && isEpub ? "bg-white text-slate-900" : ""
      } ${epubTheme === "sepia" && isEpub ? "bg-[#f8f1e5] text-[#5c4033]" : ""}`}
    >
      {/* Top Navigation Bar */}
      <div className={`h-14 px-4 flex items-center justify-between border-b shrink-0 select-none ${
        epubTheme === "light" && isEpub
          ? "border-slate-200 bg-slate-100/90 text-slate-900"
          : epubTheme === "sepia" && isEpub
          ? "border-[#e6d8c3] bg-[#f0e6d2]/90 text-[#5c4033]"
          : "border-slate-800 bg-slate-900/95 text-slate-100"
      }`}>
        <div className="flex items-center gap-3 truncate max-w-[45%]">
          <Badge className="bg-primary/20 text-primary border-primary/30 uppercase text-[10px] font-bold">
            {format.toUpperCase()}
          </Badge>
          <div className="truncate">
            <h2 className="text-sm font-bold truncate leading-tight">{book.title}</h2>
            {book.author && (
              <p className="text-[11px] opacity-70 truncate">{book.author}</p>
            )}
          </div>
        </div>

        {/* Reader Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* EPUB Controls */}
          {isEpub && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0"
                title="Table of Contents"
                onClick={() => setShowToc(!showToc)}
              >
                <List className="h-4 w-4" />
              </Button>

              {/* Theme Toggle */}
              <div className="flex items-center rounded-lg border border-slate-700/60 p-0.5 bg-slate-950/40">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${epubTheme === "dark" ? "bg-primary text-black" : "text-slate-400"}`}
                  title="Dark Mode"
                  onClick={() => setEpubTheme("dark")}
                >
                  <Moon className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${epubTheme === "sepia" ? "bg-amber-600 text-white" : "text-slate-400"}`}
                  title="Sepia Mode"
                  onClick={() => setEpubTheme("sepia")}
                >
                  <ScrollText className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${epubTheme === "light" ? "bg-slate-200 text-slate-900" : "text-slate-400"}`}
                  title="Light Mode"
                  onClick={() => setEpubTheme("light")}
                >
                  <Sun className="h-3 w-3" />
                </Button>
              </div>

              {/* Font Size */}
              <div className="hidden sm:flex items-center gap-1 border border-slate-700/60 rounded-lg px-1 py-0.5 bg-slate-950/40">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-xs font-bold"
                  title="Decrease Font Size"
                  onClick={() => setEpubFontSize((prev) => Math.max(prev - 10, 70))}
                >
                  A-
                </Button>
                <span className="text-[10px] font-mono w-7 text-center">{epubFontSize}%</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-xs font-bold"
                  title="Increase Font Size"
                  onClick={() => setEpubFontSize((prev) => Math.min(prev + 10, 180))}
                >
                  A+
                </Button>
              </div>
            </>
          )}

          {/* Comic Controls */}
          {isComic && !comicLoading && !comicError && (
            <>
              {/* Mode Toggle */}
              <div className="flex items-center rounded-lg border border-slate-700/60 p-0.5 bg-slate-950/40">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${comicMode === "single" ? "bg-primary text-black" : "text-slate-400"}`}
                  title="Single Page Mode"
                  onClick={() => setComicMode("single")}
                >
                  <Square className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${comicMode === "spread" ? "bg-primary text-black" : "text-slate-400"}`}
                  title="Double Page Spread Mode"
                  onClick={() => setComicMode("spread")}
                >
                  <Columns className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`h-6 w-6 p-0 rounded ${comicMode === "webtoon" ? "bg-primary text-black" : "text-slate-400"}`}
                  title="Vertical Webtoon Mode"
                  onClick={() => setComicMode("webtoon")}
                >
                  <ScrollText className="h-3 w-3" />
                </Button>
              </div>

              {/* Fit Mode */}
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

      {/* Reader Main Content */}
      <div className="relative flex-1 flex overflow-hidden">
        {/* Table of Contents Drawer (EPUB) */}
        {isEpub && showToc && (
          <div className="absolute top-0 bottom-0 left-0 w-72 z-30 bg-slate-900/95 backdrop-blur border-r border-slate-800 p-4 overflow-y-auto shadow-2xl animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">Chapters</span>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setShowToc(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {epubToc.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No table of contents available.</p>
            ) : (
              <ul className="space-y-1">
                {epubToc.map((chapter, idx) => (
                  <li key={idx}>
                    <button
                      className="w-full text-left text-xs py-1.5 px-2 rounded hover:bg-slate-800 text-slate-300 hover:text-primary transition-colors truncate"
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

        {/* EPUB Viewer Container */}
        {isEpub && (
          <div className="relative flex-1 h-full w-full flex items-center justify-center">
            {epubLoading && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-950/80 z-20">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-xs text-slate-400 font-medium">Opening EPUB Reader...</p>
              </div>
            )}

            {epubError ? (
              <div className="p-6 max-w-md text-center space-y-3 bg-slate-900 border border-red-500/30 rounded-xl">
                <p className="text-sm font-semibold text-red-400">Could not render EPUB in browser</p>
                <p className="text-xs text-slate-400">{epubError}</p>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/books/${book.id}`} download>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download File Directly
                  </a>
                </Button>
              </div>
            ) : (
              <>
                <div ref={epubViewerRef} className="w-full h-full max-w-5xl mx-auto" />
                
                {/* Click Page Turning Zones */}
                <button
                  className="absolute left-0 top-0 bottom-0 w-16 sm:w-24 group flex items-center justify-start pl-2 bg-gradient-to-r from-black/20 to-transparent hover:from-black/40 transition-all opacity-0 hover:opacity-100 select-none cursor-pointer"
                  onClick={() => renditionRef.current?.prev()}
                  title="Previous Page"
                >
                  <ChevronLeft className="h-8 w-8 text-white/70 group-hover:scale-110 transition-transform" />
                </button>
                <button
                  className="absolute right-0 top-0 bottom-0 w-16 sm:w-24 group flex items-center justify-end pr-2 bg-gradient-to-l from-black/20 to-transparent hover:from-black/40 transition-all opacity-0 hover:opacity-100 select-none cursor-pointer"
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
              <div className="p-6 max-w-md text-center space-y-3 bg-slate-900 border border-red-500/30 rounded-xl">
                <p className="text-sm font-semibold text-red-400">Could not extract comic archive</p>
                <p className="text-xs text-slate-400">{comicError}</p>
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/books/${book.id}`} download>
                    <Download className="h-3.5 w-3.5 mr-1" /> Download File Directly
                  </a>
                </Button>
              </div>
            ) : comicTotalPages > 0 ? (
              comicMode === "webtoon" ? (
                // Vertical Webtoon Scroll View
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
                // Single or Double Page Spread View
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

                  {/* Left Click Zone (Prev) */}
                  <button
                    className="absolute left-0 top-0 bottom-0 w-1/4 flex items-center justify-start pl-4 bg-gradient-to-r from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity cursor-pointer select-none group"
                    onClick={() => setComicCurrentPage((prev) => Math.max(prev - (comicMode === "spread" ? 2 : 1), 1))}
                    title="Previous Page"
                  >
                    <ChevronLeft className="h-10 w-10 text-white/80 group-hover:scale-120 transition-transform" />
                  </button>

                  {/* Right Click Zone (Next) */}
                  <button
                    className="absolute right-0 top-0 bottom-0 w-1/4 flex items-center justify-end pr-4 bg-gradient-to-l from-black/40 to-transparent opacity-0 hover:opacity-100 transition-opacity cursor-pointer select-none group"
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

      {/* Bottom Status / Scrubber Bar */}
      <div className={`h-11 px-4 flex items-center justify-between border-t text-xs shrink-0 select-none ${
        epubTheme === "light" && isEpub
          ? "border-slate-200 bg-slate-100/90 text-slate-700"
          : epubTheme === "sepia" && isEpub
          ? "border-[#e6d8c3] bg-[#f0e6d2]/90 text-[#5c4033]"
          : "border-slate-800 bg-slate-900/95 text-slate-400"
      }`}>
        {/* EPUB Navigation Bar */}
        {isEpub && (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => renditionRef.current?.prev()}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> Prev Page
            </Button>
            <div className="flex items-center gap-2">
              <span className="font-mono text-[11px] font-semibold">{epubProgress}% read</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs gap-1"
              onClick={() => renditionRef.current?.next()}
            >
              Next Page <ChevronRight className="h-3.5 w-3.5" />
            </Button>
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

            {/* Page Scrubber Slider */}
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
                {comicCurrentPage} / {comicTotalPages}
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
            <span>PDF Viewer Mode</span>
            <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
              <a href={`/api/books/${book.id}`} download>
                <Download className="h-3 w-3 mr-1" /> Download
              </a>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
