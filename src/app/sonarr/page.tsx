"use client";

import { useState, useEffect } from "react";
import {
  getEnabledArrInstances,
  getArrProfilesAndFolders,
  searchSonarrSeries,
  addSonarrSeries,
  getSonarrQueue,
  forceImportSonarrQueueItem,
  getSonarrLibrary,
  updateSonarrSeries,
  triggerSonarrSearch,
  getSonarrReleases,
  downloadSonarrRelease,
  getSonarrEpisodes,
  updateSonarrEpisodeMonitor,
} from "@/app/arr-actions";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import {
  Loader2,
  Search,
  Plus,
  Download,
  AlertCircle,
  RefreshCw,
  XCircle,
  CheckCircle2,
} from "lucide-react";

import ErrorTicketModal from "@/components/error-ticket-modal";

export function formatBytes(bytes: number, decimals = 2) {
  if (!+bytes) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export default function SonarrPage() {
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [loading, setLoading] = useState(true);

  // Error Ticket Modal State
  const [errorModal, setErrorModal] = useState<{
    open: boolean;
    title: string;
    message: string;
    context?: string;
  }>({
    open: false,
    title: "",
    message: "",
  });

  const showErrorModal = (message: string, title = "Sonarr Error", context?: string) => {
    setErrorModal({ open: true, title, message, context });
  };

  // Profiles and Folders
  const [profiles, setProfiles] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);

  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Add state
  const [addingSeriesId, setAddingSeriesId] = useState<number | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");

  // Queue state
  const [queue, setQueue] = useState<any[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueSearch, setQueueSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);

  // Library state
  const [library, setLibrary] = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [librarySearch, setLibrarySearch] = useState("");
  const [modifyingId, setModifyingId] = useState<number | null>(null);
  const [libSort, setLibSort] = useState<
    "addedDesc" | "addedAsc" | "titleAsc" | "titleDesc"
  >("addedDesc");
  const [libFilterStatus, setLibFilterStatus] = useState<
    "all" | "monitored" | "unmonitored" | "missing" | "downloaded"
  >("all");

  // Interactive Release Modal
  const [releasesModalOpen, setReleasesModalOpen] = useState(false);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releases, setReleases] = useState<any[]>([]);
  const [activeSeries, setActiveSeries] = useState<any>(null);
  const [activeSeasonNumber, setActiveSeasonNumber] = useState<
    number | undefined
  >(undefined);
  const [activeEpisodeId, setActiveEpisodeId] = useState<number | undefined>(
    undefined,
  );
  const [downloadingRelease, setDownloadingRelease] = useState<string | null>(
    null,
  );

  // Manage Seasons Modal
  const [seasonsModalOpen, setSeasonsModalOpen] = useState(false);
  const [activeSeasons, setActiveSeasons] = useState<any[]>([]);
  const [activeSeasonsSeries, setActiveSeasonsSeries] = useState<any>(null);
  const [savingSeasons, setSavingSeasons] = useState(false);

  // Manage Episodes Modal
  const [episodesModalOpen, setEpisodesModalOpen] = useState(false);
  const [episodesLoading, setEpisodesLoading] = useState(false);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const [activeSeasonNumberForEpisodes, setActiveSeasonNumberForEpisodes] =
    useState<number | undefined>(undefined);

  const handleOpenEpisodes = async (seasonNumber: number) => {
    if (!selectedAppId || !activeSeasonsSeries) return;
    setActiveSeasonNumberForEpisodes(seasonNumber);
    setEpisodesModalOpen(true);
    setEpisodesLoading(true);
    setEpisodes([]);

    const res = await getSonarrEpisodes(
      selectedAppId,
      activeSeasonsSeries.id,
      seasonNumber,
    );
    if (res.success) {
      setEpisodes(res.data);
    } else {
      showErrorModal(res.error || "Failed to load episodes from Sonarr", "Episode Load Error");
    }
    setEpisodesLoading(false);
  };

  const handleToggleEpisodeMonitor = async (
    episodeId: number,
    currentMonitored: boolean,
  ) => {
    if (!selectedAppId) return;
    const res = await updateSonarrEpisodeMonitor(
      selectedAppId,
      [episodeId],
      !currentMonitored,
    );
    if (res.success) {
      setEpisodes((prev) =>
        prev.map((e) =>
          e.id === episodeId ? { ...e, monitored: !currentMonitored } : e,
        ),
      );
    } else {
      showErrorModal(res.error || "Failed to toggle episode monitoring", "Episode Monitor Error");
    }
  };

  const handleOpenSeasons = (series: any) => {
    setActiveSeasonsSeries(series);
    const isNew = !series.id || series.id === 0;
    
    // Clone seasons, sort by season number descending
    const seasons = JSON.parse(JSON.stringify(series.seasons || [])).sort(
      (a: any, b: any) => b.seasonNumber - a.seasonNumber,
    );

    if (isNew) {
        // Default all seasons to monitored for new requests
        seasons.forEach((s: any) => {
            s.monitored = true;
        });
    }

    setActiveSeasons(seasons);
    setSeasonsModalOpen(true);
  };

  const handleSaveSeasons = async () => {
    if (!activeSeasonsSeries || !selectedAppId) return;
    setSavingSeasons(true);

    // Auto-monitor the series if at least one season is monitored
    const anyMonitored = activeSeasons.some((s: any) => s.monitored);
    const updatedSeries = {
      ...activeSeasonsSeries,
      seasons: activeSeasons,
      monitored: anyMonitored ? true : activeSeasonsSeries.monitored,
    };

    if (!activeSeasonsSeries.id || activeSeasonsSeries.id === 0) {
      if (!selectedProfileId || !selectedFolderId) {
        showErrorModal("Please select a quality profile and root folder first before adding the series.", "Selection Required", activeSeasonsSeries.title);
        setSavingSeasons(false);
        return;
      }
      setAddingSeriesId(activeSeasonsSeries.tvdbId);
      try {
        const res = await addSonarrSeries(
          selectedAppId,
          updatedSeries,
          parseInt(selectedProfileId),
          selectedFolderId,
        );
        if (res.success) {
          alert("Show added and search started!");
          setSeasonsModalOpen(false);
          fetchLibrary();
        } else {
          showErrorModal(res.error || "Failed to add show to Sonarr", "Add Show Error", activeSeasonsSeries.title);
        }
      } catch (e: any) {
        console.error(e);
        showErrorModal(e.message || "Failed to add show.", "Add Show Error", activeSeasonsSeries.title);
      }
      setAddingSeriesId(null);
    } else {
      const res = await updateSonarrSeries(selectedAppId, updatedSeries);
      if (res.success) {
        setSeasonsModalOpen(false);
        fetchLibrary();
      } else {
        showErrorModal(res.error || "Failed to update seasons", "Season Update Error", activeSeasonsSeries.title);
      }
    }
    setSavingSeasons(false);
  };

  const handleSearchRelease = async (
    series: any,
    seasonNumber?: number,
    episodeId?: number,
  ) => {
    if (!selectedAppId) return;
    setActiveSeries(series);
    setActiveSeasonNumber(seasonNumber);
    setActiveEpisodeId(episodeId);
    setReleasesModalOpen(true);
    setReleasesLoading(true);
    setReleases([]);

    const res = await getSonarrReleases(
      selectedAppId,
      series.id,
      seasonNumber,
      episodeId,
    );
    if (res.success) {
      setReleases(
        res.data.sort(
          (a: any, b: any) =>
            (b.customFormatScore || 0) - (a.customFormatScore || 0),
        ),
      );
    } else {
      showErrorModal(res.error || "Failed to fetch releases from Sonarr", "Release Search Error", series.title);
      setReleasesModalOpen(false);
    }
    setReleasesLoading(false);
  };

  const handleDownloadRelease = async (release: any) => {
    if (!selectedAppId || !activeSeries) return;
    setDownloadingRelease(release.guid);
    try {
      const res = await downloadSonarrRelease(
        selectedAppId,
        release.guid,
        release.indexerId,
      );
      if (res.success) {
        alert("Download started!");
        setReleasesModalOpen(false);
        setTimeout(fetchQueue, 2000);
      } else {
        showErrorModal(res.error || "Failed to send release to download client", "Download Client Error", activeSeries.title);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to download release.", "Download Client Error", activeSeries.title);
    }
    setDownloadingRelease(null);
  };

  const fetchLibrary = async () => {
    if (!selectedAppId) return;
    setLibraryLoading(true);
    try {
      const res = await getSonarrLibrary(selectedAppId);
      if (res.success && res.data) {
        setLibrary(res.data);
      } else {
        console.error(res.error);
      }
    } catch (e) {
      console.error("Library fetch error", e);
    }
    setLibraryLoading(false);
  };

  useEffect(() => {
    getEnabledArrInstances("sonarr")
      .then((res) => {
        if (res.success && res.data) {
          setInstances(res.data);
          if (res.data.length > 0) {
            setSelectedAppId(res.data[0].id);
          }
        } else {
          console.error(res.error);
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (selectedAppId) {
      getArrProfilesAndFolders(selectedAppId, "sonarr")
        .then((res) => {
          if (res.success && res.data) {
            setProfiles(res.data.profiles);
            setFolders(res.data.folders);
            if (res.data.profiles.length > 0)
              setSelectedProfileId(res.data.profiles[0].id.toString());
            if (res.data.folders.length > 0)
              setSelectedFolderId(res.data.folders[0].path);
          } else {
            console.error(res.error);
          }
        })
        .catch(console.error);

      fetchQueue();
      fetchLibrary();
    }
  }, [selectedAppId]);

  const fetchQueue = async () => {
    if (!selectedAppId) return;
    setQueueLoading(true);
    try {
      const res = await getSonarrQueue(selectedAppId);
      if (res.success && res.data) {
        setQueue(res.data.records || []);
      } else {
        console.error(res.error);
      }
    } catch (e) {
      console.error("Queue fetch error", e);
    }
    setQueueLoading(false);
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim() || !selectedAppId) return;

    setSearching(true);
    try {
      const res = await searchSonarrSeries(selectedAppId, searchTerm);
      if (res.success && res.data) {
        setSearchResults(res.data);
      } else {
        showErrorModal(res.error || "Sonarr series search failed", "Search Error", searchTerm);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Search failed with an unexpected error.", "Search Error", searchTerm);
    }
    setSearching(false);
  };

  const handleToggleMonitor = async (series: any) => {
    if (!selectedAppId) return;
    setModifyingId(series.id);
    try {
      const updatedSeries = { ...series, monitored: !series.monitored };
      const res = await updateSonarrSeries(selectedAppId, updatedSeries);
      if (res.success && res.data) {
        setLibrary((prev) =>
          prev.map((s) => (s.id === series.id ? res.data : s)),
        );
        setSearchResults((prev) =>
          prev.map((s) => (s.id === series.id ? res.data : s)),
        );
      } else {
        showErrorModal(res.error || "Failed to update monitored state", "Monitor Error", series.title);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to update monitored state.", "Monitor Error", series.title);
    }
    setModifyingId(null);
  };

  const handleTriggerSearch = async (series: any) => {
    if (!selectedAppId) return;
    setModifyingId(series.id);
    try {
      const res = await triggerSonarrSearch(selectedAppId, series.id);
      if (res.success) {
        alert(`Search command sent for: ${series.title}`);
      } else {
        showErrorModal(res.error || "Failed to trigger search", "Search Trigger Error", series.title);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to trigger search.", "Search Trigger Error", series.title);
    }
    setModifyingId(null);
  };

  const handleForceImport = async (downloadId: string) => {
    if (!selectedAppId) return;
    setImportingId(downloadId);
    try {
      const res = await forceImportSonarrQueueItem(selectedAppId, downloadId);
      if (res.success) {
        alert("Import command sent!");
        setTimeout(fetchQueue, 2000);
      } else {
        showErrorModal(res.error || "Failed to force import queue item", "Import Error", `Queue ID: ${downloadId}`);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to force import queue item.", "Import Error", `Queue ID: ${downloadId}`);
    }
    setImportingId(null);
  };

  if (loading)
    return (
      <div className="p-8 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );

  if (instances.length === 0)
    return (
      <div className="p-8 max-w-3xl mx-auto text-center space-y-4">
        <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
        <h2 className="text-xl font-bold">No Sonarr Instances Available</h2>
        <p className="text-muted-foreground">
          Admins must configure and enable a Sonarr instance for Super Users in
          Settings.
        </p>
      </div>
    );

  const filteredQueue = queue.filter((q) =>
    q.title.toLowerCase().includes(queueSearch.toLowerCase()),
  );
  let filteredLibrary = library.filter((s) =>
    s.title.toLowerCase().includes(librarySearch.toLowerCase()),
  );

  if (libFilterStatus !== "all") {
    filteredLibrary = filteredLibrary.filter((s) => {
      const hasFiles = (s.statistics?.episodeFileCount || 0) > 0;
      if (libFilterStatus === "monitored") return s.monitored;
      if (libFilterStatus === "unmonitored") return !s.monitored;
      if (libFilterStatus === "missing") return s.monitored && !hasFiles;
      if (libFilterStatus === "downloaded") return hasFiles;
      return true;
    });
  }

  filteredLibrary.sort((a, b) => {
    if (libSort === "titleAsc")
      return (a.title || "").localeCompare(b.title || "");
    if (libSort === "titleDesc")
      return (b.title || "").localeCompare(a.title || "");
    if (libSort === "addedDesc")
      return (
        new Date(b.added || 0).getTime() - new Date(a.added || 0).getTime()
      );
    if (libSort === "addedAsc")
      return (
        new Date(a.added || 0).getTime() - new Date(b.added || 0).getTime()
      );
    return 0;
  });

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-cyan-400">
            Sonarr (TV Shows)
          </h3>
          <p className="text-sm text-muted-foreground">
            Self-serve TV show downloads and library management.
          </p>
        </div>
        {instances.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Instance:</span>
            <Select value={selectedAppId} onValueChange={setSelectedAppId}>
              <SelectTrigger className="w-48 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {instances.map((app) => (
                  <SelectItem key={app.id} value={app.id}>
                    {app.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Tabs defaultValue="search" className="w-full">
        <TabsList className="grid grid-cols-1 sm:grid-cols-3 w-full h-auto p-1.5 bg-muted/40 border border-muted/60 rounded-xl gap-1.5 shadow-md">
          <TabsTrigger value="search" className="group py-2 sm:py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer rounded-lg transition-all duration-200 hover:ring-2 hover:ring-cyan-500/80 hover:ring-offset-1 hover:ring-offset-background hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] hover:bg-muted/80 min-w-0">
            <Search className="h-4 w-4 text-cyan-400 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <span className="truncate">Search TVDB</span>
          </TabsTrigger>
          <TabsTrigger value="library" className="group py-2 sm:py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer rounded-lg transition-all duration-200 hover:ring-2 hover:ring-cyan-500/80 hover:ring-offset-1 hover:ring-offset-background hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] hover:bg-muted/80 min-w-0">
            <span className="truncate">Library ({libraryLoading ? "..." : library.length})</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="group py-2 sm:py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer rounded-lg transition-all duration-200 hover:ring-2 hover:ring-cyan-500/80 hover:ring-offset-1 hover:ring-offset-background hover:shadow-[0_0_12px_rgba(6,182,212,0.25)] hover:bg-muted/80 min-w-0">
            <Download className="h-4 w-4 text-cyan-400 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <span className="truncate">Activity / Queue</span>
          </TabsTrigger>
        </TabsList>

        {/* SEARCH TAB */}
        <TabsContent value="search" className="space-y-4 mt-4">
          <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Search New TV Shows</CardTitle>
              <CardDescription>
                Search TVDB and add shows to your requested quality profile.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for a TV show..."
                    className="pl-9 bg-background/60"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={searching} className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all duration-200 hover:ring-2 hover:ring-cyan-400/50 active:scale-95">
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Search"
                  )}
                </Button>
              </form>

              {/* Default Profiles */}
              <div className="grid sm:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border border-border/40">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Quality Profile
                  </label>
                  <Select
                    value={selectedProfileId}
                    onValueChange={setSelectedProfileId}
                  >
                    <SelectTrigger className="bg-background/80">
                      <SelectValue placeholder="Select Profile" />
                    </SelectTrigger>
                    <SelectContent>
                      {profiles.map((p) => (
                        <SelectItem key={p.id} value={p.id.toString()}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase text-muted-foreground">
                    Root Folder
                  </label>
                  <Select
                    value={selectedFolderId}
                    onValueChange={setSelectedFolderId}
                  >
                    <SelectTrigger className="bg-background/80">
                      <SelectValue placeholder="Select Folder" />
                    </SelectTrigger>
                    <SelectContent>
                      {folders.map((f) => (
                        <SelectItem key={f.id} value={f.path}>
                          {f.path}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Search Results */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                {searchResults.map((series: any) => {
                  const coverImg =
                    series.images?.find((i: any) => i.coverType === "poster")
                      ?.remoteUrl || series.images?.[0]?.remoteUrl;
                  return (
                    <div
                      key={series.tvdbId}
                      className={`flex gap-3.5 p-3.5 rounded-xl border border-border/50 bg-[#101014]/90 backdrop-blur-md hover:border-cyan-500/40 hover:ring-2 hover:ring-cyan-500/20 hover:shadow-lg transition-all duration-200 relative overflow-hidden ${
                        series.id && series.id > 0
                          ? "ring-1 ring-cyan-500/30"
                          : ""
                      }`}
                    >
                      <div className="w-16 sm:w-20 h-24 sm:h-28 shrink-0 bg-muted/30 border border-border/40 rounded-lg overflow-hidden relative shadow-sm">
                        {coverImg ? (
                          <img
                            src={coverImg}
                            alt="cover"
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center">
                            No Cover
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col flex-1 min-w-0 py-0.5">
                        <h4 className="font-semibold text-sm truncate">
                          {series.title} ({series.year})
                        </h4>
                        {(series.firstAired || series.network) && (
                          <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-wider flex gap-3 flex-wrap">
                            {series.firstAired && (
                              <span>
                                Premiered:{" "}
                                {new Date(
                                  series.firstAired,
                                ).toLocaleDateString()}
                              </span>
                            )}
                            {series.network && (
                              <span>Network: {series.network}</span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1 mb-auto">
                          {series.overview}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-cyan-400">
                            {series.status}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (series.id && series.id > 0)
                                handleToggleMonitor(series);
                              else handleOpenSeasons(series);
                            }}
                            disabled={
                              addingSeriesId === series.tvdbId ||
                              modifyingId === series.id ||
                              (series.id && series.id > 0 && series.monitored)
                            }
                            variant={
                              series.id && series.id > 0
                                ? series.monitored
                                  ? "secondary"
                                  : "default"
                                : "default"
                            }
                            className={`h-7 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                              series.id && series.id > 0 && !series.monitored
                                ? "bg-cyan-600 hover:bg-cyan-500 text-white hover:ring-2 hover:ring-cyan-400/40"
                                : !series.id
                                  ? "bg-cyan-600 hover:bg-cyan-500 text-white hover:ring-2 hover:ring-cyan-400/40"
                                  : ""
                            }`}
                          >
                            {addingSeriesId === series.tvdbId ||
                            modifyingId === series.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : series.id && series.id > 0 ? (
                              series.monitored ? (
                                "Already Added"
                              ) : (
                                "Monitor"
                              )
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1" /> Add Show
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* LIBRARY TAB */}
        <TabsContent value="library" className="space-y-4 mt-4">
          <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Library Management</CardTitle>
              <CardDescription>
                View, monitor, and search for new copies of existing TV shows.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {libraryLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-cyan-400" />
                  <p className="text-xs text-muted-foreground mt-2">Loading TV show library...</p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col md:flex-row gap-2 mb-4">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search library..."
                        className="pl-9 bg-background/60"
                        value={librarySearch}
                        onChange={(e) => setLibrarySearch(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-2 flex-wrap sm:flex-nowrap">
                      <Select
                        value={libFilterStatus}
                        onValueChange={(val: any) => setLibFilterStatus(val)}
                      >
                        <SelectTrigger className="flex-1 sm:w-[140px] min-w-[120px] bg-background/80">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status</SelectItem>
                          <SelectItem value="downloaded">Downloaded</SelectItem>
                          <SelectItem value="missing">Missing</SelectItem>
                          <SelectItem value="monitored">Monitored</SelectItem>
                          <SelectItem value="unmonitored">
                            Unmonitored
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        value={libSort}
                        onValueChange={(val: any) => setLibSort(val)}
                      >
                        <SelectTrigger className="flex-1 sm:w-[160px] min-w-[140px] bg-background/80">
                          <SelectValue placeholder="Sort" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="addedDesc">
                            Date Added (New)
                          </SelectItem>
                          <SelectItem value="addedAsc">
                            Date Added (Old)
                          </SelectItem>
                          <SelectItem value="titleAsc">Title (A-Z)</SelectItem>
                          <SelectItem value="titleDesc">Title (Z-A)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={fetchLibrary}
                        disabled={libraryLoading}
                        title="Refresh Library"
                        className="shrink-0 transition-all duration-200 hover:ring-2 hover:ring-cyan-500/40"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${libraryLoading ? "animate-spin" : ""}`}
                        />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredLibrary.map((series: any) => {
                      const coverImg =
                        series.images?.find(
                          (i: any) => i.coverType === "poster",
                        )?.remoteUrl || series.images?.[0]?.remoteUrl;
                      const monitoredSeasons =
                        series.seasons?.filter(
                          (s: any) => s.seasonNumber > 0 && s.monitored,
                        ).length || 0;
                      const totalSeasons =
                        series.seasons?.filter((s: any) => s.seasonNumber > 0)
                          .length || 0;
                      const isEffectivelyMonitored =
                        series.monitored && monitoredSeasons > 0;

                      return (
                        <div
                          key={series.id}
                          className="flex gap-4 border border-border/50 rounded-xl p-3.5 bg-[#101014]/90 backdrop-blur-md hover:border-cyan-500/40 hover:ring-2 hover:ring-cyan-500/20 hover:shadow-lg transition-all duration-200 relative"
                        >
                          <div className="w-16 sm:w-20 h-24 sm:h-28 shrink-0 bg-muted/30 border border-border/40 rounded-lg overflow-hidden relative shadow-sm">
                            {coverImg ? (
                              <img
                                src={coverImg}
                                alt="cover"
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center">
                                No Cover
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col flex-1 min-w-0 py-0.5">
                            <h4 className="font-semibold text-sm truncate pr-6">
                              {series.title} ({series.year})
                            </h4>
                            {(series.firstAired || series.network) && (
                              <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-wider flex gap-3 flex-wrap">
                                {series.firstAired && (
                                  <span>
                                    Premiered:{" "}
                                    {new Date(
                                      series.firstAired,
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                                {series.network && (
                                  <span>Network: {series.network}</span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <Badge
                                variant={
                                  series.statistics?.percentOfEpisodes === 100
                                    ? "default"
                                    : isEffectivelyMonitored
                                      ? "destructive"
                                      : "secondary"
                                }
                                className="text-[10px] uppercase font-bold"
                              >
                                {series.statistics?.percentOfEpisodes === 100
                                  ? "Downloaded"
                                  : isEffectivelyMonitored
                                    ? `${series.statistics?.episodeFileCount || 0} / ${series.statistics?.episodeCount || 0} EPs`
                                    : "Not Monitored"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase text-muted-foreground border-border/60"
                              >
                                {series.qualityProfileId
                                  ? profiles.find(
                                      (p) => p.id === series.qualityProfileId,
                                    )?.name || series.qualityProfileId
                                  : "Unknown Profile"}
                              </Badge>
                            </div>
                            <div className="mt-auto flex items-center gap-2 pt-2">
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 text-xs flex-1 bg-cyan-600 hover:bg-cyan-500 text-white transition-all duration-200 hover:ring-2 hover:ring-cyan-400/40 active:scale-95 font-semibold"
                                disabled={modifyingId === series.id}
                                onClick={() => handleOpenSeasons(series)}
                              >
                                Manage Seasons
                              </Button>
                            </div>
                          </div>
                          <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                            {series.monitored && (
                              <Badge
                                variant="secondary"
                                className={`text-[9px] px-1.5 ${monitoredSeasons > 0 ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" : "bg-amber-500/20 text-amber-500 border-amber-500/30"}`}
                              >
                                {monitoredSeasons > 0
                                  ? "MONITORED"
                                  : "NO SEASONS MONITORED"}
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredLibrary.length === 0 && (
                      <p className="text-sm text-muted-foreground italic col-span-full text-center py-8 border border-dashed border-border/40 rounded-xl">
                        No TV shows found in library.
                      </p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* QUEUE TAB */}
        <TabsContent value="queue" className="space-y-4 mt-4">
          <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
            <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0 pb-4 border-b border-border/40">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold">Activity / Queue</CardTitle>
                <CardDescription>
                  Monitor active TV downloads and force imports.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchQueue}
                disabled={queueLoading}
                className="transition-all duration-200 hover:ring-2 hover:ring-cyan-500/40"
              >
                <RefreshCw
                  className={`h-4 w-4 mr-2 ${queueLoading ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Filter queue by release name..."
                  className="pl-9 bg-background/60"
                  value={queueSearch}
                  onChange={(e) => setQueueSearch(e.target.value)}
                />
              </div>

              {queueLoading && queue.length === 0 ? (
                <div className="py-8 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredQueue.length === 0 ? (
                <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border/40 rounded-xl bg-muted/10">
                  Queue is empty or no items match your search.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {filteredQueue.map((item: any) => (
                    <div
                      key={item.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 border border-border/40 rounded-xl bg-[#101014]/90 backdrop-blur-md hover:border-cyan-500/30 transition-all duration-200"
                    >
                      <div className="flex-1 min-w-0">
                        <div
                          className="font-medium text-sm truncate text-foreground"
                          title={item.series?.title || item.title}
                        >
                          {item.series?.title || item.title}{" "}
                          {item.episode
                            ? `- S${String(item.episode.seasonNumber).padStart(2, "0")}E${String(item.episode.episodeNumber).padStart(2, "0")}`
                            : ""}
                        </div>
                        {item.series?.title && (
                          <div
                            className="text-xs text-muted-foreground truncate mt-0.5"
                            title={item.title}
                          >
                            {item.title}
                          </div>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          <span className="text-cyan-400 font-medium">{item.status}</span>
                          {item.sizeleft > 0 && item.size > 0 && (
                            <span>
                              {Math.round(
                                (1 - item.sizeleft / item.size) * 100,
                              )}
                              %
                            </span>
                          )}
                          {item.timeleft && <span>ETA: {item.timeleft}</span>}
                        </div>
                        {item.errorMessage && (
                          <div
                            className="text-[10px] text-amber-500 mt-1 line-clamp-1"
                            title={item.errorMessage}
                          >
                            ⚠️ {item.errorMessage}
                          </div>
                        )}
                        {item.statusMessages &&
                          item.statusMessages.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {item.statusMessages.map(
                                (msg: any, i: number) => (
                                  <div
                                    key={i}
                                    className="text-xs text-amber-500 flex flex-col bg-amber-500/10 p-2 rounded-lg border border-amber-500/20"
                                  >
                                    {msg.title && msg.title !== item.title && (
                                      <span className="font-semibold flex items-center gap-1">
                                        <AlertCircle className="h-3 w-3" />{" "}
                                        {msg.title}
                                      </span>
                                    )}
                                    {msg.messages &&
                                      msg.messages.map(
                                        (m: string, j: number) => (
                                          <span
                                            key={j}
                                            className="text-[10px] text-amber-500/80 ml-4 flex items-center gap-1"
                                          >
                                            {(!msg.title ||
                                              msg.title === item.title) &&
                                              j === 0 && (
                                                <AlertCircle className="h-3 w-3 shrink-0" />
                                              )}{" "}
                                            {m}
                                          </span>
                                        ),
                                      )}
                                  </div>
                                ),
                              )}
                            </div>
                          )}
                      </div>
                      <div className="shrink-0 flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs font-semibold transition-all duration-200 hover:ring-2 hover:ring-cyan-500/40 active:scale-95"
                          onClick={() => handleForceImport(item.downloadId)}
                          disabled={importingId === item.downloadId}
                        >
                          {importingId === item.downloadId ? (
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                          ) : (
                            <Download className="h-3 w-3 mr-1" />
                          )}
                          Force Import
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* INTERACTIVE RELEASE MODAL */}
      <Dialog open={releasesModalOpen} onOpenChange={setReleasesModalOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0 bg-[#121218] border-border/60">
          <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
            <DialogTitle className="text-lg font-bold text-cyan-400">
              Releases - {activeSeries?.title}{" "}
              {activeSeasonNumber !== undefined
                ? `- Season ${activeSeasonNumber}`
                : ""}
            </DialogTitle>
            <DialogDescription>
              {activeSeries?.title} ({activeSeries?.year})
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-[50vh] p-6">
            {releasesLoading ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-cyan-400" />
                <p className="text-sm">Searching indexers for TV releases...</p>
              </div>
            ) : (
              <>
                {releases.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                    <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <p className="text-sm">No releases found.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {releases.map((release: any, idx: number) => {
                      const isDownloading = downloadingRelease === release.guid;
                      const benignPhrases = [
                        "Existing file",
                        "equal or higher",
                        "Already in",
                        "Custom Format score",
                      ];
                      const activeRejections =
                        release.rejections?.filter(
                          (r: string) =>
                            !benignPhrases.some((phrase) =>
                              r.toLowerCase().includes(phrase.toLowerCase()),
                            ),
                        ) || [];
                      const rejected =
                        release.rejected && activeRejections.length > 0;

                      return (
                        <div
                          key={release.guid || idx}
                          className={`border rounded-xl p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center transition-all duration-200 ${
                            rejected
                              ? "opacity-60 bg-muted/20 border-border/30"
                              : "bg-[#101014]/90 border-border/50 hover:border-cyan-500/40 hover:ring-2 hover:ring-cyan-500/20"
                          }`}
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <h5 className="font-medium text-sm break-all text-foreground">
                                {release.title}
                              </h5>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-2">
                              <Badge variant="outline" className="text-[10px] border-border/60">
                                {release.quality?.quality?.name || "Unknown"}
                              </Badge>
                              <span className="flex items-center">
                                <Download className="h-3 w-3 mr-1" />{" "}
                                {formatBytes(release.size)}
                              </span>
                              <span className="capitalize">
                                {release.protocol}
                              </span>
                              <span className="bg-muted/40 px-2 py-0.5 rounded text-foreground border border-border/30">
                                {release.indexer}
                              </span>
                              <span className="text-emerald-400 font-medium">
                                {release.seeders} S
                              </span>
                              <span className="text-red-400 font-medium">
                                {release.leechers} L
                              </span>
                            </div>
                            {release.rejected &&
                              release.rejections?.length > 0 && (
                                <div
                                  className={`mt-2 text-xs flex items-start gap-1 ${rejected ? "text-red-400" : "text-amber-500"}`}
                                >
                                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                  <span>{release.rejections[0]}</span>
                                </div>
                              )}
                          </div>

                          <Button
                            onClick={() => handleDownloadRelease(release)}
                            disabled={
                              isDownloading || !!downloadingRelease || rejected
                            }
                            variant={rejected ? "secondary" : "default"}
                            className={`shrink-0 w-full sm:w-auto font-semibold transition-all duration-200 active:scale-95 ${
                              !rejected
                                ? "bg-cyan-600 hover:bg-cyan-500 text-white hover:ring-2 hover:ring-cyan-400/40 hover:shadow-md"
                                : ""
                            }`}
                          >
                            {isDownloading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <Download className="h-4 w-4 mr-2" />
                            )}
                            Download
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* MANAGE SEASONS MODAL */}
      <Dialog open={seasonsModalOpen} onOpenChange={setSeasonsModalOpen}>
        <DialogContent className="max-w-md bg-[#121218] border-border/60">
          <DialogHeader>
            <DialogTitle className="text-cyan-400 font-bold">Manage Seasons</DialogTitle>
            <DialogDescription>
              {activeSeasonsSeries?.title} ({activeSeasonsSeries?.year})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-2">
            {activeSeasons
              .filter((s: any) => s.seasonNumber > 0)
              .map((season: any) => (
                <div
                  key={season.seasonNumber}
                  className="flex items-center justify-between border-b border-border/30 pb-3 last:border-0 last:pb-0"
                >
                  <div className="space-y-0.5">
                    <div className="text-sm font-semibold text-foreground">
                      Season {season.seasonNumber}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono">
                      {season.statistics?.episodeFileCount || 0} /{" "}
                      {season.statistics?.totalEpisodeCount ||
                        season.statistics?.episodeCount ||
                        0}{" "}
                      Episodes
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs transition-all duration-200 hover:ring-2 hover:ring-cyan-500/40 active:scale-95"
                      onClick={() => handleOpenEpisodes(season.seasonNumber)}
                      title={`View episodes for Season ${season.seasonNumber}`}
                    >
                      Episodes
                    </Button>
                    <Switch
                      checked={season.monitored}
                      onCheckedChange={(checked) => {
                        setActiveSeasons((prev) =>
                          prev.map((s) =>
                            s.seasonNumber === season.seasonNumber
                              ? { ...s, monitored: checked }
                              : s,
                          ),
                        );
                      }}
                    />
                  </div>
                </div>
              ))}
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-border/40">
            <Button
              variant="outline"
              onClick={() => setSeasonsModalOpen(false)}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleSaveSeasons} 
              disabled={savingSeasons}
              className="bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition-all duration-200 hover:ring-2 hover:ring-cyan-400/40 active:scale-95"
            >
              {savingSeasons ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              {(!activeSeasonsSeries?.id || activeSeasonsSeries?.id === 0) ? "Add Series" : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MANAGE EPISODES MODAL */}
      <Dialog open={episodesModalOpen} onOpenChange={setEpisodesModalOpen}>
        <DialogContent className="max-w-xl max-h-[80vh] flex flex-col p-0 bg-[#121218] border-border/60">
          <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
            <DialogTitle className="text-cyan-400 font-bold">
              Season {activeSeasonNumberForEpisodes} Episodes
            </DialogTitle>
            <DialogDescription>{activeSeasonsSeries?.title}</DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {episodesLoading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
              </div>
            ) : episodes.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground border border-dashed border-border/40 rounded-xl">
                No episodes found.
              </div>
            ) : (
              <div className="space-y-2.5">
                {episodes.map((ep: any) => (
                  <div
                    key={ep.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border border-border/40 rounded-xl bg-[#101014]/90 backdrop-blur-md hover:border-cyan-500/30 transition-all duration-200 gap-3"
                  >
                    <div className="flex flex-col min-w-0 flex-1 pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs text-cyan-400 whitespace-nowrap bg-cyan-500/10 px-1.5 py-0.5 rounded border border-cyan-500/20">
                          EP {ep.episodeNumber}
                        </span>
                        <span className="text-sm font-medium truncate text-foreground">
                          {ep.title}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <Badge
                          variant={
                            ep.hasFile
                              ? "default"
                              : ep.monitored
                                ? "destructive"
                                : "secondary"
                          }
                          className="text-[10px] uppercase font-bold"
                        >
                          {ep.hasFile
                            ? "Downloaded"
                            : ep.monitored
                              ? "Missing"
                              : "Not Monitored"}
                        </Badge>
                        {ep.airDate && (
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                            Air Date:{" "}
                            {new Date(ep.airDate).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs transition-all duration-200 hover:ring-2 hover:ring-cyan-500/40 active:scale-95"
                        onClick={() =>
                          handleSearchRelease(
                            activeSeasonsSeries,
                            activeSeasonNumberForEpisodes,
                            ep.id,
                          )
                        }
                      >
                        <Search className="h-3 w-3 mr-1" /> Search
                      </Button>
                      <Switch
                        checked={ep.monitored}
                        onCheckedChange={() =>
                          handleToggleEpisodeMonitor(ep.id, ep.monitored)
                        }
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* AUTOMATED ERROR TICKET MODAL */}
      <ErrorTicketModal
        open={errorModal.open}
        title={errorModal.title}
        message={errorModal.message}
        context={errorModal.context}
        onClose={() => setErrorModal({ open: false, title: "", message: "" })}
      />
    </div>
  );
}
