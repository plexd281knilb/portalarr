"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  autoGrabBestGameReleaseAction,
  deleteGameRequestAction,
  downloadGameReleaseAction,
  getGameVaultOverviewAction,
  searchGameReleasesAction,
  searchPlatformGamesAction,
  syncGameDownloadsAction,
  triggerOwnfoilRefreshAction,
  updateGameVaultSettingsAction,
} from "@/app/game-actions";
import type { EvaluatedGameRelease, GameCatalogEntry } from "@/lib/games/platforms";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  AlertCircle,
  ArrowDownCircle,
  CheckCircle2,
  Download,
  ExternalLink,
  Gamepad2,
  HardDrive,
  Loader2,
  Radio,
  RefreshCw,
  Search,
  Settings,
  Trash2,
  Zap,
} from "lucide-react";

interface PlatformSummary {
  slug: string;
  name: string;
  shortName: string;
  manufacturer: string;
  defaultSabCategory: string;
}

interface GameRequestRow {
  id: string;
  title: string;
  platform: string;
  platformSlug: string;
  coverUrl?: string | null;
  releaseTitle?: string | null;
  indexer?: string | null;
  sizeBytes?: number | null;
  sabCategory?: string | null;
  status: string;
  downloadProgress?: number | null;
  ownfoilRefreshed: boolean;
  ownfoilRefreshedAt?: string | Date | null;
  errorMessage?: string | null;
  requestedBy: string;
  createdAt: string | Date;
}

interface SabCategoryOption {
  name: string;
  dir: string;
}

interface OverviewPayload {
  success: boolean;
  error?: string;
  integrations?: {
    prowlarrConfigured: boolean;
    prowlarrOnline?: boolean;
    prowlarrName: string | null;
    prowlarrIndexerCount?: number;
    prowlarrError?: string | null;

    sabnzbdConfigured: boolean;
    sabnzbdOnline?: boolean;
    sabnzbdName: string | null;
    sabCategories?: SabCategoryOption[];
    sabCategoryExists?: boolean;
    sabnzbdError?: string | null;

    ownfoilConfigured: boolean;
    ownfoilOnline?: boolean;
    ownfoilName: string | null;
    ownfoilUrl: string | null;
    ownfoilConnected: boolean;
    ownfoilTitleCount: number;
    ownfoilLibraryPaths?: string[];
    ownfoilError?: string | null;

    hasRawgKey: boolean;
  };
  pathChecks?: {
    portalarrDownloadsPath: string;
    portalarrDownloadsExists: boolean;
    sabCompleteDir: string | null;
    sabCompleteDirExistsInPortalarr: boolean;
    sabCategoryDir: string | null;
    sabCategoryFullPath: string | null;
    portalarrGamesPath: string | null;
    portalarrGamesExists: boolean;
    ownfoilLibraryPaths: Array<{ path: string; existsInPortalarr: boolean }>;
    ownfoilPrimaryPath: string | null;
  };
  settings?: {
    gamesSabCategory: string;
    gamesLibraryPath?: string;
    ownfoilScanOnDownload: boolean;
  };
  ownedTitlesNormalized?: string[];
  requests?: GameRequestRow[];
  platforms?: PlatformSummary[];
}

function normalizeMatchKey(title: string): string {
  return (title || "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function formatSize(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let val = bytes;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i++;
  }
  return `${val >= 10 || i <= 1 ? val.toFixed(0) : val.toFixed(2)} ${units[i]}`;
}

export default function GamesVaultClient({
  initialOverview,
  isAdmin,
}: {
  initialOverview: OverviewPayload;
  isAdmin: boolean;
}) {
  const [overview, setOverview] = useState<OverviewPayload>(initialOverview);
  const platforms = overview.platforms || [
    { slug: "nintendo-switch", name: "Nintendo Switch", shortName: "Switch", manufacturer: "Nintendo", defaultSabCategory: "games" },
  ];

  const [selectedPlatform, setSelectedPlatform] = useState<string>("nintendo-switch");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [catalogGames, setCatalogGames] = useState<GameCatalogEntry[]>([]);
  const [catalogTotal, setCatalogTotal] = useState<number>(0);
  const [catalogSource, setCatalogSource] = useState<string>("");
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(true);
  const [catalogError, setCatalogError] = useState<string>("");

  const [requests, setRequests] = useState<GameRequestRow[]>(overview.requests || []);
  const [statusNotice, setStatusNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [refreshingOwnfoil, setRefreshingOwnfoil] = useState<boolean>(false);
  const [syncingDownloads, setSyncingDownloads] = useState<boolean>(false);
  const [autoGrabbingId, setAutoGrabbingId] = useState<string | null>(null);

  // Release Search Modal State
  const [releaseModalGame, setReleaseModalGame] = useState<GameCatalogEntry | null>(null);
  const [searchingReleases, setSearchingReleases] = useState<boolean>(false);
  const [releases, setReleases] = useState<EvaluatedGameRelease[]>([]);
  const [releasesError, setReleasesError] = useState<string>("");
  const [queueingGuid, setQueueingGuid] = useState<string | null>(null);
  const [sabCategoryOverride, setSabCategoryOverride] = useState<string>(
    overview.settings?.gamesSabCategory || "games"
  );

  // Vault Settings State
  const [settingsModalOpen, setSettingsModalOpen] = useState<boolean>(false);
  const [cfgSabCategory, setCfgSabCategory] = useState<string>(overview.settings?.gamesSabCategory || "games");
  const [cfgGamesLibraryPath, setCfgGamesLibraryPath] = useState<string>(overview.settings?.gamesLibraryPath || "");
  const [cfgOwnfoilAutoScan, setCfgOwnfoilAutoScan] = useState<boolean>(
    overview.settings?.ownfoilScanOnDownload !== false
  );
  const [cfgRawgKey, setCfgRawgKey] = useState<string>("");
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [recheckingHealth, setRecheckingHealth] = useState<boolean>(false);

  const ownedSet = useMemo(
    () => new Set(overview.ownedTitlesNormalized || []),
    [overview.ownedTitlesNormalized]
  );

  const activeDownloadsCount = useMemo(
    () => requests.filter((r) => r.status === "Downloading" || r.status === "Completed").length,
    [requests]
  );

  async function loadCatalog(platSlug: string, q: string, pageNum: number) {
    setLoadingCatalog(true);
    setCatalogError("");
    try {
      const res = await searchPlatformGamesAction(platSlug, q, pageNum);
      if (res.success && Array.isArray(res.items)) {
        setCatalogGames(res.items);
        setCatalogTotal(res.total || res.items.length);
        setCatalogSource(res.sourceLabel || "");
      } else {
        setCatalogError(res.error || "Failed loading platform catalog.");
        setCatalogGames([]);
      }
    } catch (e: any) {
      setCatalogError(e?.message || "Catalog request failed.");
      setCatalogGames([]);
    } finally {
      setLoadingCatalog(false);
    }
  }

  useEffect(() => {
    loadCatalog(selectedPlatform, searchQuery, page);
  }, [selectedPlatform, page]);

  // Poll active SABnzbd downloads and automatically mark Ownfoil refresh when completed
  useEffect(() => {
    if (activeDownloadsCount === 0) return;
    const timer = setInterval(async () => {
      try {
        const res = await syncGameDownloadsAction();
        if (res.success && Array.isArray(res.requests)) {
          setRequests(res.requests as GameRequestRow[]);
          if (res.ownfoilTriggered) {
            setStatusNotice({
              type: "success",
              text: "Download completed in SABnzbd and Ownfoil library scan was triggered automatically.",
            });
          }
        }
      } catch {
        // Ignore transient polling failures
      }
    }, 8000);
    return () => clearInterval(timer);
  }, [activeDownloadsCount]);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    loadCatalog(selectedPlatform, searchQuery, 1);
  }

  function handlePlatformChange(slug: string) {
    setSelectedPlatform(slug);
    setPage(1);
  }

  async function handleOpenReleaseSearch(game: GameCatalogEntry) {
    setReleaseModalGame(game);
    setSearchingReleases(true);
    setReleases([]);
    setReleasesError("");
    setSabCategoryOverride(cfgSabCategory || "games");
    try {
      const res = await searchGameReleasesAction(game.title, game.platformSlug);
      if (res.success) {
        setReleases(res.releases || []);
      } else {
        setReleasesError(res.error || "Failed searching Prowlarr.");
      }
    } catch (e: any) {
      setReleasesError(e?.message || "Failed searching Prowlarr.");
    } finally {
      setSearchingReleases(false);
    }
  }

  async function handleSendReleaseToSab(release: EvaluatedGameRelease) {
    if (!releaseModalGame) return;
    setQueueingGuid(release.guid);
    try {
      const res = await downloadGameReleaseAction({
        title: releaseModalGame.title,
        platformSlug: releaseModalGame.platformSlug,
        externalId: releaseModalGame.id,
        coverUrl: releaseModalGame.coverUrl,
        releaseDate: releaseModalGame.releaseDate,
        publisher: releaseModalGame.publisher,
        summary: releaseModalGame.summary,
        releaseTitle: release.title,
        downloadUrl: release.downloadUrl,
        indexer: release.indexer,
        sizeBytes: release.size,
        sabCategory: sabCategoryOverride,
      });
      if (res.success && res.request) {
        setRequests((prev) => [res.request as GameRequestRow, ...prev]);
        setStatusNotice({
          type: "success",
          text: `Queued "${release.title}" to SABnzbd (${sabCategoryOverride}). Ownfoil will refresh automatically on completion.`,
        });
        setReleaseModalGame(null);
      } else {
        setReleasesError(res.error || "SABnzbd rejected download.");
      }
    } finally {
      setQueueingGuid(null);
    }
  }

  async function handleAutoGrab(game: GameCatalogEntry) {
    setAutoGrabbingId(game.id);
    setStatusNotice(null);
    try {
      const res = await autoGrabBestGameReleaseAction({
        title: game.title,
        platformSlug: game.platformSlug,
        externalId: game.id,
        coverUrl: game.coverUrl,
        releaseDate: game.releaseDate,
        publisher: game.publisher,
        summary: game.summary,
      });
      if (res.success && res.request) {
        setRequests((prev) => [res.request as GameRequestRow, ...prev]);
        setStatusNotice({
          type: "success",
          text: `Auto-grabbed "${res.request.releaseTitle || game.title}" to SABnzbd.`,
        });
      } else {
        setStatusNotice({
          type: "error",
          text: res.error || "No matching release found — try Inspect Releases to pick manually.",
        });
      }
    } finally {
      setAutoGrabbingId(null);
    }
  }

  async function handleManualOwnfoilRefresh() {
    setRefreshingOwnfoil(true);
    setStatusNotice(null);
    try {
      const res = await triggerOwnfoilRefreshAction();
      setStatusNotice({
        type: res.success ? "success" : "error",
        text: res.message,
      });
      if (res.success) {
        const refreshedOverview = await getGameVaultOverviewAction();
        if (refreshedOverview.success) {
          setOverview(refreshedOverview as OverviewPayload);
          if (refreshedOverview.requests) {
            setRequests(refreshedOverview.requests as GameRequestRow[]);
          }
        }
      }
    } finally {
      setRefreshingOwnfoil(false);
    }
  }

  async function handleSyncDownloads() {
    setSyncingDownloads(true);
    try {
      const res = await syncGameDownloadsAction();
      if (res.success && Array.isArray(res.requests)) {
        setRequests(res.requests as GameRequestRow[]);
        setStatusNotice({
          type: "success",
          text: res.ownfoilTriggered
            ? "SABnzbd queue synced and Ownfoil library scan triggered."
            : "SABnzbd queue status synchronized.",
        });
      } else {
        setStatusNotice({ type: "error", text: res.error || "Sync failed." });
      }
    } finally {
      setSyncingDownloads(false);
    }
  }

  async function handleDeleteRequest(id: string) {
    const res = await deleteGameRequestAction(id);
    if (res.success) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    }
  }

  async function refreshOverviewHealth() {
    setRecheckingHealth(true);
    try {
      const refreshed = await getGameVaultOverviewAction();
      if (refreshed.success) {
        setOverview(refreshed as OverviewPayload);
        if (refreshed.requests) setRequests(refreshed.requests as GameRequestRow[]);
      }
    } finally {
      setRecheckingHealth(false);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const res = await updateGameVaultSettingsAction({
        gamesSabCategory: cfgSabCategory,
        gamesLibraryPath: cfgGamesLibraryPath,
        ownfoilScanOnDownload: cfgOwnfoilAutoScan,
        ...(cfgRawgKey.trim() ? { rawgApiKey: cfgRawgKey.trim() } : {}),
      });
      if (res.success) {
        setSabCategoryOverride(cfgSabCategory);
        setSettingsModalOpen(false);
        await refreshOverviewHealth();
        setStatusNotice({ type: "success", text: "Game Vault settings saved and integration paths re-checked." });
      } else {
        setStatusNotice({ type: "error", text: res.error || "Failed saving settings." });
      }
    } finally {
      setSavingSettings(false);
    }
  }

  const integrations = overview.integrations;
  const pathChecks = overview.pathChecks;
  const sabCategories = integrations?.sabCategories || [];
  const sabCategoryMissing = Boolean(integrations?.sabnzbdOnline && integrations?.sabCategoryExists === false);
  const activePlatformObj = platforms.find((p) => p.slug === selectedPlatform) || platforms[0];
  const quickPlatformSlugs = ["nintendo-switch", "nintendo-switch-2", "nintendo-3ds", "wii-u", "gamecube", "n64", "ps5", "ps4", "pc"];

  return (
    <div className="space-y-6 max-w-7xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight flex items-center gap-2.5 text-foreground">
            <Gamepad2 className="h-7 w-7 text-rose-500 shrink-0" />
            <span>Game Vault</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Platform-strict game discovery, Prowlarr NZB indexing, SABnzbd downloading, and automatic Ownfoil library refresh.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleManualOwnfoilRefresh}
            disabled={refreshingOwnfoil}
            className="gap-1.5"
          >
            <RefreshCw className={`h-4 w-4 ${refreshingOwnfoil ? "animate-spin" : ""}`} />
            <span>Refresh Ownfoil</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSettingsModalOpen(true)}
            className="gap-1.5"
          >
            <Settings className="h-4 w-4" />
            <span>Vault Settings</span>
          </Button>
          {isAdmin && (
            <Button asChild variant="outline" size="sm" className="gap-1.5">
              <Link href="/settings?tab=integrations&subtab=servarr">
                <Radio className="h-4 w-4 text-emerald-400" />
                <span>Configure Apps</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Live Integration Health Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="bg-card/90 border-border/60 rounded-lg">
          <CardContent className="p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <Radio className="h-4 w-4 text-rose-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">
                  {integrations?.prowlarrName || "Prowlarr Indexer"}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums truncate" title={integrations?.prowlarrError || undefined}>
                  {integrations?.prowlarrOnline
                    ? `${integrations.prowlarrIndexerCount ?? 0} active indexer(s)`
                    : integrations?.prowlarrConfigured
                      ? integrations.prowlarrError || "Live probe failed"
                      : "NZB & Release Search"}
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                integrations?.prowlarrOnline
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : integrations?.prowlarrConfigured
                    ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                    : "border-amber-500/40 bg-amber-500/10 text-amber-400"
              }
            >
              {integrations?.prowlarrOnline
                ? "Online"
                : integrations?.prowlarrConfigured
                  ? "Offline"
                  : "Not Added"}
            </Badge>
          </CardContent>
        </Card>

        <Card className={`bg-card/90 rounded-lg ${sabCategoryMissing ? "border-amber-500/60" : "border-border/60"}`}>
          <CardContent className="p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <ArrowDownCircle className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">
                  {integrations?.sabnzbdName || "SABnzbd Client"}
                </div>
                <div
                  className="text-[11px] text-muted-foreground font-mono truncate"
                  title={integrations?.sabnzbdError || pathChecks?.sabCompleteDir || undefined}
                >
                  {sabCategoryMissing
                    ? `cat "${cfgSabCategory}" missing`
                    : pathChecks?.sabCategoryFullPath
                      ? `${cfgSabCategory} -> ${pathChecks.sabCategoryFullPath}`
                      : `cat: ${cfgSabCategory}`}
                </div>
              </div>
            </div>
            <Badge
              variant="outline"
              className={
                integrations?.sabnzbdOnline && !sabCategoryMissing
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                  : sabCategoryMissing
                    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                    : integrations?.sabnzbdConfigured
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400"
              }
            >
              {integrations?.sabnzbdOnline && !sabCategoryMissing
                ? "Online"
                : sabCategoryMissing
                  ? "Missing Cat"
                  : integrations?.sabnzbdConfigured
                    ? "Offline"
                    : "Not Added"}
            </Badge>
          </CardContent>
        </Card>

        <Card className="bg-card/90 border-border/60 rounded-lg">
          <CardContent className="p-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <HardDrive className="h-4 w-4 text-sky-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground truncate">
                  {integrations?.ownfoilName || "Ownfoil Switch Shop"}
                </div>
                <div className="text-[11px] text-muted-foreground tabular-nums truncate" title={integrations?.ownfoilError || integrations?.ownfoilLibraryPaths?.join(", ") || undefined}>
                  {integrations?.ownfoilOnline
                    ? `${integrations.ownfoilTitleCount} titles • ${(integrations.ownfoilLibraryPaths || []).length} path(s)`
                    : integrations?.ownfoilConfigured
                      ? integrations.ownfoilError || "Live probe failed"
                      : cfgOwnfoilAutoScan
                        ? "Auto-scan on finish"
                        : "Manual scan mode"}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              {integrations?.ownfoilUrl && (
                <a
                  href={integrations.ownfoilUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-foreground p-1"
                  aria-label="Open Ownfoil"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
              <Badge
                variant="outline"
                className={
                  integrations?.ownfoilOnline
                    ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                    : integrations?.ownfoilConfigured
                      ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                      : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                }
              >
                {integrations?.ownfoilOnline
                  ? "Online"
                  : integrations?.ownfoilConfigured
                    ? "Offline"
                    : "Not Added"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {sabCategoryMissing && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs sm:text-sm text-amber-200">
          <div className="flex items-start sm:items-center gap-2.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5 sm:mt-0" />
            <span>
              Category <strong className="font-mono">{cfgSabCategory}</strong> was not found in SABnzbd.{" "}
              {sabCategories.length > 0
                ? `Configured SABnzbd categories: ${sabCategories.map((c) => c.name).join(", ")}.`
                : "No custom categories found in SABnzbd."}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setSettingsModalOpen(true)}
            className="shrink-0 h-8 text-xs border-amber-500/40"
          >
            Choose Category
          </Button>
        </div>
      )}

      {statusNotice && (
        <div
          className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 text-sm ${
            statusNotice.type === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
              : "border-rose-500/40 bg-rose-500/10 text-rose-300"
          }`}
        >
          {statusNotice.type === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
          )}
          <span>{statusNotice.text}</span>
        </div>
      )}

      <Tabs defaultValue="browse" className="space-y-4">
        <TabsList className="grid w-full sm:w-auto sm:inline-grid grid-cols-2">
          <TabsTrigger value="browse" className="gap-1.5">
            <Search className="h-4 w-4" />
            <span>Browse Platform</span>
          </TabsTrigger>
          <TabsTrigger value="downloads" className="gap-1.5 tabular-nums">
            <Download className="h-4 w-4" />
            <span>Downloads &amp; Ownfoil ({requests.length})</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="browse" className="space-y-4">
          {/* Platform Picker + Strict Search Bar */}
          <Card className="bg-card/90 border-border/60 rounded-lg">
            <CardContent className="p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {quickPlatformSlugs.map((slug) => {
                  const p = platforms.find((item) => item.slug === slug);
                  if (!p) return null;
                  const active = selectedPlatform === p.slug;
                  return (
                    <Button
                      key={p.slug}
                      type="button"
                      size="sm"
                      variant={active ? "default" : "outline"}
                      onClick={() => handlePlatformChange(p.slug)}
                      className="h-8 text-xs font-medium"
                    >
                      {p.shortName}
                    </Button>
                  );
                })}
              </div>

              <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 md:grid-cols-[240px_1fr_auto] gap-2.5">
                <Select value={selectedPlatform} onValueChange={handlePlatformChange}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select Platform" />
                  </SelectTrigger>
                  <SelectContent>
                    {platforms.map((p) => (
                      <SelectItem key={p.slug} value={p.slug}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <div className="relative">
                  <Search className="h-4 w-4 text-muted-foreground absolute left-3 top-3" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={`Search strictly within ${activePlatformObj?.name || "Platform"} games...`}
                    className="h-10 pl-9"
                  />
                </div>

                <Button type="submit" disabled={loadingCatalog} className="h-10 gap-1.5">
                  {loadingCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  <span>Search {activePlatformObj?.shortName}</span>
                </Button>
              </form>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">
                  Platform filter: <strong className="text-foreground">{activePlatformObj?.name}</strong>
                  {catalogTotal > 0 ? ` • ${catalogTotal.toLocaleString()} matching titles` : ""}
                  {catalogSource ? ` • Source: ${catalogSource}` : ""}
                </span>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || loadingCatalog}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    className="h-7 text-xs"
                  >
                    Previous
                  </Button>
                  <span className="text-xs font-medium tabular-nums px-2">Page {page}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={catalogGames.length < 24 || loadingCatalog}
                    onClick={() => setPage((p) => p + 1)}
                    className="h-7 text-xs"
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Catalog Grid */}
          {loadingCatalog ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i} className="h-72 rounded-lg border border-border/50 bg-card/50 animate-pulse" />
              ))}
            </div>
          ) : catalogError ? (
            <EmptyState
              icon={AlertCircle}
              title="Could Not Load Platform Catalog"
              description={catalogError}
              actionLabel="Retry Search"
              onAction={() => loadCatalog(selectedPlatform, searchQuery, page)}
            />
          ) : catalogGames.length === 0 ? (
            <EmptyState
              icon={Gamepad2}
              title={`No ${activePlatformObj?.name || ""} Games Found`}
              description="Try a shorter title or clear the search input to browse the platform catalog."
              actionLabel="Clear Search"
              onAction={() => {
                setSearchQuery("");
                setPage(1);
                loadCatalog(selectedPlatform, "", 1);
              }}
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
              {catalogGames.map((game) => {
                const isOwned = ownedSet.has(normalizeMatchKey(game.title));
                const isDownloading = requests.some(
                  (r) =>
                    normalizeMatchKey(r.title) === normalizeMatchKey(game.title) &&
                    r.platformSlug === game.platformSlug &&
                    r.status === "Downloading"
                );
                return (
                  <Card
                    key={game.id}
                    className="bg-card/90 border-border/60 rounded-lg overflow-hidden flex flex-col justify-between hover:border-amber-500/50 transition-colors"
                  >
                    <div>
                      <div className="relative aspect-square bg-slate-950 flex items-center justify-center overflow-hidden border-b border-border/50">
                        {game.coverUrl ? (
                          <img
                            src={game.coverUrl}
                            alt={game.title}
                            className="h-full w-full object-cover"
                            loading="lazy"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        ) : (
                          <Gamepad2 className="h-10 w-10 text-muted-foreground" />
                        )}
                        <Badge className="absolute top-2 left-2 text-[10px] bg-slate-950/85 text-slate-100 border border-white/15">
                          {activePlatformObj?.shortName}
                        </Badge>
                        {isOwned && (
                          <Badge className="absolute top-2 right-2 text-[10px] bg-emerald-600 text-white">
                            In Ownfoil
                          </Badge>
                        )}
                      </div>
                      <div className="p-3 space-y-1">
                        <h3 className="text-sm font-semibold leading-snug text-foreground line-clamp-2" title={game.title}>
                          {game.title}
                        </h3>
                        <div className="text-[11px] text-muted-foreground tabular-nums truncate">
                          {game.releaseDate || game.publisher || game.platform}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 pt-0 grid grid-cols-1 gap-1.5">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleOpenReleaseSearch(game)}
                        className="w-full h-8 text-xs gap-1.5"
                      >
                        <Search className="h-3.5 w-3.5" />
                        <span>Search Prowlarr</span>
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={autoGrabbingId === game.id || isDownloading}
                        onClick={() => handleAutoGrab(game)}
                        className="w-full h-7 text-[11px] gap-1"
                      >
                        {autoGrabbingId === game.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Zap className="h-3 w-3 text-amber-400" />
                        )}
                        <span>{isDownloading ? "Downloading..." : "Auto-Grab Best"}</span>
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="downloads" className="space-y-4">
          {/* Live Path & Folder Diagnostics */}
          <Card className="bg-card/90 border-border/60 rounded-lg">
            <CardHeader className="py-3.5 px-4 flex flex-row items-center justify-between gap-2">
              <div>
                <CardTitle className="text-sm font-semibold">Folder Paths &amp; Category Alignment</CardTitle>
                <CardDescription className="text-xs">
                  Verifies live SABnzbd download directories, categories, and Ownfoil game library paths.
                </CardDescription>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={refreshOverviewHealth}
                disabled={recheckingHealth}
                className="h-8 text-xs gap-1.5"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${recheckingHealth ? "animate-spin" : ""}`} />
                <span>Re-check Live</span>
              </Button>
            </CardHeader>
            <CardContent className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="rounded-md border border-border/60 bg-slate-950/60 p-3 space-y-1.5">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>SABnzbd Completed Downloads Dir</span>
                  <Badge variant="outline" className={pathChecks?.sabCompleteDirExistsInPortalarr ? "text-emerald-400 border-emerald-500/40" : "text-muted-foreground"}>
                    {pathChecks?.sabCompleteDirExistsInPortalarr ? "Mounted in Portalarr" : "SABnzbd Internal"}
                  </Badge>
                </div>
                <div className="font-mono text-muted-foreground break-all">
                  {pathChecks?.sabCompleteDir || "Unavailable (check SABnzbd connection)"}
                </div>
                {pathChecks?.sabCategoryFullPath && (
                  <div className="text-[11px] text-muted-foreground font-mono break-all">
                    Category target: {pathChecks.sabCategoryFullPath}
                  </div>
                )}
              </div>

              <div className="rounded-md border border-border/60 bg-slate-950/60 p-3 space-y-1.5">
                <div className="font-semibold text-foreground flex items-center justify-between">
                  <span>Ownfoil &amp; Games Folder Paths</span>
                  <Badge variant="outline" className={(pathChecks?.portalarrGamesExists || (pathChecks?.ownfoilLibraryPaths || []).length > 0) ? "text-emerald-400 border-emerald-500/40" : "text-amber-400 border-amber-500/40"}>
                    {(pathChecks?.ownfoilLibraryPaths || []).length > 0 ? "Ownfoil Paths Loaded" : "No Ownfoil Path Found"}
                  </Badge>
                </div>
                {(pathChecks?.ownfoilLibraryPaths || []).length > 0 ? (
                  pathChecks!.ownfoilLibraryPaths.map((lp) => (
                    <div key={lp.path} className="font-mono text-muted-foreground flex items-center justify-between gap-2">
                      <span className="break-all">{lp.path}</span>
                      <span className="text-[10px] shrink-0">{lp.existsInPortalarr ? "Mounted" : "Remote"}</span>
                    </div>
                  ))
                ) : (
                  <div className="font-mono text-muted-foreground">Ownfoil reported no paths via /api/library/paths</div>
                )}
                {pathChecks?.portalarrGamesPath && (
                  <div className="text-[11px] font-mono text-muted-foreground flex items-center justify-between gap-2">
                    <span>Portalarr staging folder: {pathChecks.portalarrGamesPath}</span>
                    <span>{pathChecks.portalarrGamesExists ? "Mounted" : "Not found"}</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">
              Queued SABnzbd downloads automatically trigger an Ownfoil library scan as soon as unpacking finishes.
            </p>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleSyncDownloads}
              disabled={syncingDownloads}
              className="gap-1.5"
            >
              <RefreshCw className={`h-4 w-4 ${syncingDownloads ? "animate-spin" : ""}`} />
              <span>Sync SABnzbd Queue</span>
            </Button>
          </div>

          {requests.length === 0 ? (
            <EmptyState
              icon={Download}
              title="No Game Downloads Yet"
              description="Search for a Nintendo Switch or retro title and send an NZB release to SABnzbd."
            />
          ) : (
            <div className="space-y-2.5">
              {requests.map((req) => (
                <Card key={req.id} className="bg-card/90 border-border/60 rounded-lg">
                  <CardContent className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{req.title}</span>
                        <Badge variant="outline" className="text-[11px]">
                          {req.platform}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={
                            req.status === "Ownfoil Refreshed"
                              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                              : req.status === "Failed"
                                ? "border-rose-500/40 bg-rose-500/10 text-rose-400"
                                : "border-amber-500/40 bg-amber-500/10 text-amber-400"
                          }
                        >
                          {req.status}
                          {req.status === "Downloading" && typeof req.downloadProgress === "number"
                            ? ` (${req.downloadProgress}%)`
                            : ""}
                        </Badge>
                      </div>
                      <div className="text-xs font-mono text-muted-foreground truncate">
                        {req.releaseTitle || "Release"} • {formatSize(req.sizeBytes)} • {req.indexer || "Prowlarr"}
                      </div>
                      {req.errorMessage && (
                        <div className="text-xs text-rose-400">{req.errorMessage}</div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {!req.ownfoilRefreshed && (req.status === "Completed" || req.status === "Downloading") && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={handleManualOwnfoilRefresh}
                          disabled={refreshingOwnfoil}
                          className="h-8 text-xs gap-1"
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                          <span>Refresh Ownfoil</span>
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() => handleDeleteRequest(req.id)}
                        className="h-8 w-8 text-rose-400 hover:text-rose-300"
                        aria-label="Remove download log"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Prowlarr Release Inspector Modal */}
      <Dialog open={Boolean(releaseModalGame)} onOpenChange={(open) => !open && setReleaseModalGame(null)}>
        <DialogContent className="sm:max-w-3xl lg:max-w-4xl max-h-[85vh] flex flex-col overflow-x-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Radio className="h-5 w-5 text-rose-400 shrink-0" />
              <span className="truncate">Prowlarr Releases: {releaseModalGame?.title}</span>
            </DialogTitle>
            <DialogDescription>
              Platform target: {releaseModalGame?.platform}. Pick a release below to send directly to SABnzbd.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-3 py-2 border-y border-border/50">
            <Label htmlFor="sab-cat-override" className="text-xs font-medium text-muted-foreground">
              SABnzbd Category
            </Label>
            {sabCategories.length > 0 ? (
              <Select value={sabCategoryOverride} onValueChange={setSabCategoryOverride}>
                <SelectTrigger id="sab-cat-override" className="h-8 w-52 font-mono text-xs">
                  <SelectValue placeholder="Choose SAB category" />
                </SelectTrigger>
                <SelectContent>
                  {!sabCategories.some((c) => c.name === sabCategoryOverride) && (
                    <SelectItem value={sabCategoryOverride}>{sabCategoryOverride} (missing in SABnzbd)</SelectItem>
                  )}
                  {sabCategories.map((cat) => (
                    <SelectItem key={cat.name} value={cat.name}>
                      {cat.name}{cat.dir ? ` (${cat.dir})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="sab-cat-override"
                value={sabCategoryOverride}
                onChange={(e) => setSabCategoryOverride(e.target.value)}
                className="h-8 w-44 font-mono text-xs"
              />
            )}
            <span className="text-xs text-muted-foreground ml-auto tabular-nums">
              {searchingReleases ? "Searching indexers..." : `${releases.length} release(s)`}
            </span>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {searchingReleases ? (
              <div className="flex items-center justify-center py-12 gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                <span>Searching Prowlarr indexers...</span>
              </div>
            ) : releasesError ? (
              <EmptyState
                icon={AlertCircle}
                title="Prowlarr Search Failed"
                description={releasesError}
              />
            ) : releases.length === 0 ? (
              <EmptyState
                icon={Search}
                title="No NZB Releases Found"
                description={`No Prowlarr results matched "${releaseModalGame?.title}" for ${releaseModalGame?.platform}.`}
              />
            ) : (
              releases.map((rel) => (
                <div
                  key={rel.guid}
                  className="rounded-lg border border-border/60 bg-slate-950/60 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="text-sm font-medium text-foreground break-words">{rel.title}</div>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <Badge
                        variant="outline"
                        className={
                          rel.matchQuality === "match"
                            ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                            : rel.matchQuality === "partial"
                              ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
                              : "border-rose-500/40 bg-rose-500/10 text-rose-400"
                        }
                      >
                        {rel.formatTag}
                      </Badge>
                      <span className="text-muted-foreground tabular-nums">{rel.sizeLabel}</span>
                      <span className="text-muted-foreground">• {rel.indexer}</span>
                      {rel.ageDays !== null && (
                        <span className="text-muted-foreground tabular-nums">• {rel.ageDays}d old</span>
                      )}
                      <span className="text-muted-foreground">• {rel.matchReason}</span>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    disabled={queueingGuid === rel.guid}
                    onClick={() => handleSendReleaseToSab(rel)}
                    className="shrink-0 gap-1.5"
                  >
                    {queueingGuid === rel.guid ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                    <span>Send to SABnzbd</span>
                  </Button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Vault Settings Modal */}
      <Dialog open={settingsModalOpen} onOpenChange={setSettingsModalOpen}>
        <DialogContent className="sm:max-w-lg overflow-x-hidden">
          <DialogHeader>
            <DialogTitle>Game Vault &amp; Ownfoil Settings</DialogTitle>
            <DialogDescription>
              Configure default SABnzbd category, automatic Ownfoil scans, and optional RAWG metadata key.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="cfg-sab-cat">Default SABnzbd Games Category</Label>
              {sabCategories.length > 0 && (
                <Select value={sabCategories.some((c) => c.name === cfgSabCategory) ? cfgSabCategory : "__custom__"} onValueChange={(v) => { if (v !== "__custom__") setCfgSabCategory(v); }}>
                  <SelectTrigger className="h-9 font-mono text-xs">
                    <SelectValue placeholder="Select category from SABnzbd" />
                  </SelectTrigger>
                  <SelectContent>
                    {sabCategories.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}{c.dir ? ` -> ${c.dir}` : ""}
                      </SelectItem>
                    ))}
                    <SelectItem value="__custom__">Custom category name...</SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Input
                id="cfg-sab-cat"
                value={cfgSabCategory}
                onChange={(e) => setCfgSabCategory(e.target.value)}
                placeholder="e.g. switch or games"
                className="font-mono text-sm"
              />
              {sabCategories.length > 0 && !sabCategories.some((c) => c.name.toLowerCase() === cfgSabCategory.trim().toLowerCase()) && (
                <p className="text-[11px] text-amber-400">
                  Category &quot;{cfgSabCategory}&quot; was not returned by SABnzbd. Pick one from the dropdown above or create it in SABnzbd.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-games-path">Optional Portalarr Games Folder Path (Auto-Copy / Mount Check)</Label>
              <Input
                id="cfg-games-path"
                value={cfgGamesLibraryPath}
                onChange={(e) => setCfgGamesLibraryPath(e.target.value)}
                placeholder="/games (optional if SABnzbd downloads directly into Ownfoil folder)"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-muted-foreground">
                Downloads folder: <span className="font-mono">{pathChecks?.portalarrDownloadsPath || "/downloads"}</span>{" "}
                ({pathChecks?.portalarrDownloadsExists ? "mounted" : "not mounted"})
                {pathChecks?.sabCompleteDir ? ` • SABnzbd complete_dir: ${pathChecks.sabCompleteDir}` : ""}
              </p>
            </div>

            <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="cfg-ownfoil-auto">Auto-Refresh Ownfoil on Download</Label>
                <p className="text-xs text-muted-foreground">
                  Automatically trigger Ownfoil POST /api/library/scan when SABnzbd finishes a download.
                </p>
              </div>
              <Switch
                id="cfg-ownfoil-auto"
                checked={cfgOwnfoilAutoScan}
                onCheckedChange={setCfgOwnfoilAutoScan}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cfg-rawg-key">Optional RAWG API Key (PS5 / Xbox / Non-Nintendo Enrichment)</Label>
              <Input
                id="cfg-rawg-key"
                type="password"
                value={cfgRawgKey}
                onChange={(e) => setCfgRawgKey(e.target.value)}
                placeholder={integrations?.hasRawgKey ? "Saved key configured (leave blank to keep)" : "Optional RAWG key"}
                className="font-mono text-sm"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setSettingsModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={savingSettings}>
                {savingSettings ? "Saving..." : "Save Settings"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
