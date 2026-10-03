"use client";

import { useState, useEffect } from "react";
import {
  getEnabledArrInstances,
  getArrProfilesAndFolders,
  searchRadarrMovies,
  addRadarrMovie,
  getRadarrQueue,
  deleteRadarrQueueItem,
  forceImportRadarrQueueItem,
  getRadarrLibrary,
  updateRadarrMovie,
  deleteRadarrMovie,
  triggerRadarrSearch,
  getRadarrReleases,
  downloadRadarrRelease,
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
import {
  Loader2,
  Search,
  Plus,
  Download,
  AlertCircle,
  RefreshCw,
  XCircle,
  CheckCircle2,
  Trash2,
  Sparkles,
  Film,
  Clock,
  Eye,
  EyeOff,
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

export default function RadarrPage() {
  const [instances, setInstances] = useState<any[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>("search");

  // Floating Toast Notification
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error" | "info";
  } | null>(null);

  const showToast = (
    message: string,
    type: "success" | "error" | "info" = "success"
  ) => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  };

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

  const showErrorModal = (message: string, title = "Radarr Error", context?: string) => {
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
  const [addingMovieId, setAddingMovieId] = useState<number | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [selectedFolderId, setSelectedFolderId] = useState<string>("");

  // Queue state
  const [queue, setQueue] = useState<any[]>([]);
  const [queueLoading, setQueueLoading] = useState(true);
  const [queueSearch, setQueueSearch] = useState("");
  const [importingId, setImportingId] = useState<string | null>(null);
  const [deletingQueueId, setDeletingQueueId] = useState<number | null>(null);

  // Library state
  const [library, setLibrary] = useState<any[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [librarySearch, setLibrarySearch] = useState("");
  const [modifyingId, setModifyingId] = useState<number | null>(null);
  const [libSort, setLibSort] = useState<
    "addedDesc" | "addedAsc" | "titleAsc" | "titleDesc" | "downloadedDesc"
  >("addedDesc");
  const [libFilterStatus, setLibFilterStatus] = useState<
    "all" | "monitored" | "unmonitored" | "missing" | "downloaded"
  >("all");

  // Movie Delete Dialog state
  const [deleteMovieDialog, setDeleteMovieDialog] = useState<{
    open: boolean;
    movie: any | null;
    deleteFiles: boolean;
    loading: boolean;
  }>({
    open: false,
    movie: null,
    deleteFiles: false,
    loading: false,
  });

  // Interactive Release Modal
  const [releasesModalOpen, setReleasesModalOpen] = useState(false);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releases, setReleases] = useState<any[]>([]);
  const [activeMovie, setActiveMovie] = useState<any>(null);
  const [downloadingRelease, setDownloadingRelease] = useState<string | null>(
    null,
  );

  const handleSearchRelease = async (movie: any) => {
    if (!selectedAppId) return;
    setActiveMovie(movie);
    setReleasesModalOpen(true);
    setReleasesLoading(true);
    setReleases([]);

    try {
      const res = await getRadarrReleases(selectedAppId, movie.id);
      if (res.success && res.data) {
        setReleases(
          res.data.sort(
            (a: any, b: any) => (b.customFormatScore || 0) - (a.customFormatScore || 0),
          ),
        );
      } else {
        showErrorModal(res.error || "Failed to fetch releases from Radarr", "Release Search Error", movie.title);
        setReleasesModalOpen(false);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to fetch releases.", "Release Search Error", movie.title);
      setReleasesModalOpen(false);
    }
    setReleasesLoading(false);
  };

  const handleDownloadRelease = async (release: any) => {
    if (!selectedAppId || !activeMovie) return;
    setDownloadingRelease(release.guid);
    try {
      const res = await downloadRadarrRelease(
        selectedAppId,
        release.guid,
        release.indexerId,
      );
      if (res.success) {
        showToast(`Download started for "${activeMovie?.title || release.title}"!`);
        setReleasesModalOpen(false);
        setTimeout(() => fetchQueue(true), 1500);
      } else {
        showErrorModal(res.error || "Failed to send release to download client.", "Download Client Error", activeMovie.title);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to download release.", "Download Client Error", activeMovie.title);
    }
    setDownloadingRelease(null);
  };

  const fetchLibrary = async () => {
    if (!selectedAppId) return;
    setLibraryLoading(true);
    try {
      const res = await getRadarrLibrary(selectedAppId);
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

  const fetchQueue = async (silent = false) => {
    if (!selectedAppId) return;
    if (!silent) setQueueLoading(true);
    try {
      const res = await getRadarrQueue(selectedAppId);
      if (res.success && res.data) {
        setQueue(res.data.records || []);
      } else {
        console.error(res.error);
      }
    } catch (e) {
      console.error("Queue fetch error", e);
    }
    if (!silent) setQueueLoading(false);
  };

  useEffect(() => {
    getEnabledArrInstances("radarr")
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
      getArrProfilesAndFolders(selectedAppId, "radarr")
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

  // Auto-poll queue every 5 seconds when queue tab is open
  useEffect(() => {
    if (activeTab === "queue" && selectedAppId) {
      fetchQueue(true);
      const timer = setInterval(() => {
        fetchQueue(true);
      }, 5000);
      return () => clearInterval(timer);
    }
  }, [activeTab, selectedAppId]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim() || !selectedAppId) return;

    setSearching(true);
    try {
      const res = await searchRadarrMovies(selectedAppId, searchTerm);
      if (res.success && res.data) {
        setSearchResults(res.data);
      } else {
        showErrorModal(res.error || "Radarr movie search failed", "Search Error", searchTerm);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Search failed with an unexpected error.", "Search Error", searchTerm);
    }
    setSearching(false);
  };

  const handleAdd = async (movie: any) => {
    if (!selectedAppId) {
      showErrorModal("Please select a Radarr instance above.", "Missing Instance");
      return;
    }
    if (!selectedProfileId) {
      showErrorModal("Please select a Quality Profile above before adding movies.", "Missing Profile");
      return;
    }
    if (!selectedFolderId) {
      showErrorModal("Please select a Root Folder above before adding movies.", "Missing Root Folder");
      return;
    }

    setAddingMovieId(movie.tmdbId);
    try {
      const res = await addRadarrMovie(
        selectedAppId,
        movie,
        parseInt(selectedProfileId),
        selectedFolderId,
      );
      if (res.success) {
        showToast(`Added "${movie.title}" and started search!`);
        // Immediately reflect added state on this search card
        setSearchResults((prev) =>
          prev.map((m) =>
            m.tmdbId === movie.tmdbId
              ? { ...m, id: res.data?.id || 1, monitored: true }
              : m
          )
        );
        fetchLibrary();
      } else {
        showErrorModal(res.error || "Failed to add movie to Radarr", "Add Movie Error", movie.title);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to add movie.", "Add Movie Error", movie.title);
    }
    setAddingMovieId(null);
  };

  const handleToggleMonitor = async (movie: any) => {
    if (!selectedAppId) return;
    setModifyingId(movie.id);
    try {
      const updatedMovie = { ...movie, monitored: !movie.monitored };
      const res = await updateRadarrMovie(selectedAppId, updatedMovie);
      if (res.success && res.data) {
        setLibrary((prev) =>
          prev.map((m) => (m.id === movie.id ? res.data : m)),
        );
        setSearchResults((prev) =>
          prev.map((m) => (m.id === movie.id ? res.data : m)),
        );
        showToast(
          updatedMovie.monitored
            ? `Now monitoring "${movie.title}"`
            : `Unmonitored "${movie.title}"`
        );
      } else {
        showErrorModal(res.error || "Failed to update monitored state", "Monitor Error", movie.title);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to update monitored state.", "Monitor Error", movie.title);
    }
    setModifyingId(null);
  };

  const handleTriggerSearch = async (movie: any) => {
    if (!selectedAppId) return;
    setModifyingId(movie.id);
    try {
      const res = await triggerRadarrSearch(selectedAppId, movie.id);
      if (res.success) {
        showToast(`Automatic search command sent for "${movie.title}"`);
      } else {
        showErrorModal(res.error || "Failed to trigger movie search", "Search Trigger Error", movie.title);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to trigger search.", "Search Trigger Error", movie.title);
    }
    setModifyingId(null);
  };

  const handleForceImport = async (downloadId: string) => {
    if (!selectedAppId) return;
    setImportingId(downloadId);
    try {
      const res = await forceImportRadarrQueueItem(selectedAppId, downloadId);
      if (res.success) {
        showToast("Import command sent to Radarr!");
        setTimeout(() => fetchQueue(true), 2000);
      } else {
        showErrorModal(res.error || "Failed to force import queue item", "Import Error", `Queue ID: ${downloadId}`);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to force import queue item.", "Import Error", `Queue ID: ${downloadId}`);
    }
    setImportingId(null);
  };

  const handleDeleteQueueItem = async (item: any) => {
    if (!selectedAppId) return;
    if (
      !window.confirm(
        `Are you sure you want to cancel and remove "${item.movie?.title || item.title}" from the queue?`
      )
    ) {
      return;
    }

    setDeletingQueueId(item.id);
    try {
      const res = await deleteRadarrQueueItem(selectedAppId, item.id, true, false);
      if (res.success) {
        showToast(`Removed "${item.movie?.title || item.title}" from queue`);
        setQueue((prev) => prev.filter((q) => q.id !== item.id));
      } else {
        showErrorModal(res.error || "Failed to remove download from queue", "Queue Error", item.title);
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to remove download from queue.", "Queue Error", item.title);
    }
    setDeletingQueueId(null);
  };

  const openDeleteMovieDialog = (movie: any) => {
    setDeleteMovieDialog({
      open: true,
      movie,
      deleteFiles: false,
      loading: false,
    });
  };

  const handleConfirmDeleteMovie = async () => {
    if (!selectedAppId || !deleteMovieDialog.movie) return;
    setDeleteMovieDialog((prev) => ({ ...prev, loading: true }));
    try {
      const movie = deleteMovieDialog.movie;
      const res = await deleteRadarrMovie(
        selectedAppId,
        movie.id,
        deleteMovieDialog.deleteFiles,
        false
      );
      if (res.success) {
        showToast(`Deleted "${movie.title}" from Radarr`);
        setLibrary((prev) => prev.filter((m) => m.id !== movie.id));
        setSearchResults((prev) =>
          prev.map((m) =>
            m.id === movie.id ? { ...m, id: undefined, monitored: false } : m
          )
        );
        setDeleteMovieDialog({
          open: false,
          movie: null,
          deleteFiles: false,
          loading: false,
        });
      } else {
        showErrorModal(res.error || "Failed to delete movie", "Delete Movie Error", movie.title);
        setDeleteMovieDialog((prev) => ({ ...prev, loading: false }));
      }
    } catch (e: any) {
      console.error(e);
      showErrorModal(e.message || "Failed to delete movie.", "Delete Movie Error", deleteMovieDialog.movie?.title);
      setDeleteMovieDialog((prev) => ({ ...prev, loading: false }));
    }
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
        <h2 className="text-xl font-bold">No Radarr Instances Available</h2>
        <p className="text-muted-foreground">
          Admins must configure and enable a Radarr instance for Super Users in
          Settings.
        </p>
      </div>
    );

  const filteredQueue = queue.filter((q) =>
    q.title.toLowerCase().includes(queueSearch.toLowerCase()),
  );
  let filteredLibrary = library.filter((m) =>
    m.title.toLowerCase().includes(librarySearch.toLowerCase()),
  );

  if (libFilterStatus !== "all") {
    filteredLibrary = filteredLibrary.filter((m) => {
      if (libFilterStatus === "monitored") return m.monitored;
      if (libFilterStatus === "unmonitored") return !m.monitored;
      if (libFilterStatus === "missing") return m.monitored && !m.hasFile;
      if (libFilterStatus === "downloaded") return m.hasFile;
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
    if (libSort === "downloadedDesc") {
      const dateA = a.movieFile?.dateAdded
        ? new Date(a.movieFile.dateAdded).getTime()
        : 0;
      const dateB = b.movieFile?.dateAdded
        ? new Date(b.movieFile.dateAdded).getTime()
        : 0;
      return dateB - dateA;
    }
    return 0;
  });

  const downloadedCount = library.filter((m) => m.hasFile).length;
  const missingCount = library.filter((m) => m.monitored && !m.hasFile).length;
  const monitoredCount = library.filter((m) => m.monitored).length;
  const unmonitoredCount = library.filter((m) => !m.monitored).length;

  return (
    <div className="space-y-4 sm:space-y-6 max-w-7xl 2xl:max-w-[1600px] 3xl:max-w-[2200px] 4xl:max-w-[2560px] mx-auto pb-12 w-full min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-blue-400">Radarr (Movies)</h3>
          <p className="text-sm text-muted-foreground">
            Self-serve movie downloads, library management, and active queue telemetry.
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

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-1 sm:grid-cols-3 w-full h-auto p-1.5 bg-muted/40 border border-muted/60 rounded-xl gap-1.5 shadow-md">
          <TabsTrigger value="search" className="group py-2 sm:py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer rounded-lg transition-all duration-200 hover:ring-2 hover:ring-blue-500/80 hover:ring-offset-1 hover:ring-offset-background hover:shadow-[0_0_12px_rgba(59,130,246,0.25)] hover:bg-muted/80 min-w-0">
            <Search className="h-4 w-4 text-blue-400 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <span className="truncate">Search TMDB</span>
          </TabsTrigger>
          <TabsTrigger value="library" className="group py-2 sm:py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer rounded-lg transition-all duration-200 hover:ring-2 hover:ring-blue-500/80 hover:ring-offset-1 hover:ring-offset-background hover:shadow-[0_0_12px_rgba(59,130,246,0.25)] hover:bg-muted/80 min-w-0">
            <Film className="h-4 w-4 text-blue-400 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <span className="truncate">Library ({libraryLoading ? "..." : library.length})</span>
          </TabsTrigger>
          <TabsTrigger value="queue" className="group py-2 sm:py-2.5 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer rounded-lg transition-all duration-200 hover:ring-2 hover:ring-blue-500/80 hover:ring-offset-1 hover:ring-offset-background hover:shadow-[0_0_12px_rgba(59,130,246,0.25)] hover:bg-muted/80 min-w-0">
            <Download className="h-4 w-4 text-blue-400 shrink-0 transition-transform duration-200 group-hover:scale-110" />
            <span className="truncate">Activity / Queue {queue.length > 0 ? `(${queue.length})` : ""}</span>
          </TabsTrigger>
        </TabsList>

        {/* SEARCH TAB */}
        <TabsContent value="search" className="space-y-4 mt-4">
          <Card className="border-border/50 bg-[#121218]/80 backdrop-blur-md">
            <CardHeader>
              <CardTitle className="text-xl font-bold">Search New Movies</CardTitle>
              <CardDescription>
                Search TMDB and add movies to your requested quality profile and folder.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search for a movie..."
                    className="pl-9 bg-background/60"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
                <Button type="submit" disabled={searching} className="bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-200 hover:ring-2 hover:ring-blue-400/50 active:scale-95">
                  {searching ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Search"
                  )}
                </Button>
              </form>

              {/* Default Profiles (applied to all searches) */}
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
                          {f.path} {f.freeSpaceFormatted ? `(${f.freeSpaceFormatted})` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Search Results */}
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 gap-4 lg:gap-5 pt-4">
                {searchResults.map((movie: any) => {
                  const coverImg =
                    movie.images?.find((i: any) => i.coverType === "poster")
                      ?.remoteUrl || movie.images?.[0]?.remoteUrl;
                  return (
                    <div
                      key={movie.tmdbId}
                      className={`flex flex-row gap-3 p-3.5 rounded-xl border border-border/50 bg-[#101014]/90 backdrop-blur-md hover:border-blue-500/40 hover:ring-2 hover:ring-blue-500/20 hover:shadow-lg transition-all duration-200 relative overflow-hidden ${
                        movie.id && movie.id > 0
                          ? "ring-1 ring-blue-500/30"
                          : ""
                      }`}
                    >
                      <div className="w-20 sm:w-[90px] h-32 sm:h-[135px] shrink-0 bg-muted/30 border border-border/40 rounded-lg overflow-hidden relative shadow-sm">
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
                      <div className="flex flex-col flex-1 min-w-0 py-1">
                        <h4 className="font-semibold text-sm truncate">
                          {movie.title} ({movie.year})
                        </h4>
                        {(movie.inCinemas ||
                          movie.digitalRelease ||
                          movie.physicalRelease) && (
                          <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-wider flex gap-3 flex-wrap">
                            {movie.inCinemas && (
                              <span>
                                Air Date (Cinemas):{" "}
                                {new Date(movie.inCinemas).toLocaleDateString()}
                              </span>
                            )}
                            {(movie.digitalRelease ||
                              movie.physicalRelease) && (
                              <span>
                                Air Date (Release):{" "}
                                {new Date(
                                  movie.digitalRelease || movie.physicalRelease,
                                ).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1 mb-auto">
                          {movie.overview}
                        </p>
                        <div className="mt-2 flex items-center justify-between">
                          <span className="text-[10px] uppercase font-bold text-blue-400">
                            {movie.status}
                          </span>
                          <Button
                            size="sm"
                            onClick={() => {
                              if (movie.id && movie.id > 0)
                                handleToggleMonitor(movie);
                              else handleAdd(movie);
                            }}
                            disabled={
                              addingMovieId === movie.tmdbId ||
                              modifyingId === movie.id ||
                              (movie.id && movie.id > 0 && movie.monitored)
                            }
                            variant={
                              movie.id && movie.id > 0
                                ? movie.monitored
                                  ? "secondary"
                                  : "default"
                                : "default"
                            }
                            className={`h-7 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                              movie.id && movie.id > 0 && !movie.monitored
                                ? "bg-blue-600 hover:bg-blue-500 text-white hover:ring-2 hover:ring-blue-400/40"
                                : !movie.id
                                  ? "bg-blue-600 hover:bg-blue-500 text-white hover:ring-2 hover:ring-blue-400/40"
                                  : ""
                            }`}
                          >
                            {addingMovieId === movie.tmdbId ||
                            modifyingId === movie.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : movie.id && movie.id > 0 ? (
                              movie.monitored ? (
                                "Already Added"
                              ) : (
                                "Monitor"
                              )
                            ) : (
                              <>
                                <Plus className="h-3 w-3 mr-1" /> Add Movie
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
                View, monitor, auto-search, inspect releases, and manage existing movies.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {libraryLoading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-400" />
                  <p className="text-xs text-muted-foreground mt-2">Loading movie library...</p>
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
                        <SelectTrigger className="flex-1 sm:w-[160px] min-w-[130px] bg-background/80">
                          <SelectValue placeholder="Status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Status ({library.length})</SelectItem>
                          <SelectItem value="downloaded">Downloaded ({downloadedCount})</SelectItem>
                          <SelectItem value="missing">Missing ({missingCount})</SelectItem>
                          <SelectItem value="monitored">Monitored ({monitoredCount})</SelectItem>
                          <SelectItem value="unmonitored">Unmonitored ({unmonitoredCount})</SelectItem>
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
                          <SelectItem value="downloadedDesc">
                            Download Date
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
                        className="shrink-0 transition-all duration-200 hover:ring-2 hover:ring-blue-500/40"
                      >
                        <RefreshCw
                          className={`h-4 w-4 ${libraryLoading ? "animate-spin" : ""}`}
                        />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 3xl:grid-cols-4 gap-4">
                    {filteredLibrary.map((movie: any) => {
                      const coverImg =
                        movie.images?.find((i: any) => i.coverType === "poster")
                          ?.remoteUrl || movie.images?.[0]?.remoteUrl;
                      return (
                        <div
                          key={movie.id}
                          className="flex gap-4 border border-border/50 rounded-xl p-3.5 bg-[#101014]/90 backdrop-blur-md hover:border-blue-500/40 hover:ring-2 hover:ring-blue-500/20 hover:shadow-lg transition-all duration-200 relative"
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
                            <h4 className="font-semibold text-sm truncate pr-6" title={`${movie.title} (${movie.year})`}>
                              {movie.title} ({movie.year})
                            </h4>
                            {(movie.inCinemas ||
                              movie.digitalRelease ||
                              movie.physicalRelease) && (
                              <div className="text-[10px] text-muted-foreground mt-1 font-semibold uppercase tracking-wider flex gap-3 flex-wrap">
                                {movie.inCinemas && (
                                  <span>
                                    Air Date (Cinemas):{" "}
                                    {new Date(
                                      movie.inCinemas,
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                                {(movie.digitalRelease ||
                                  movie.physicalRelease) && (
                                  <span>
                                    Air Date (Release):{" "}
                                    {new Date(
                                      movie.digitalRelease ||
                                        movie.physicalRelease,
                                    ).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            )}
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                              <Badge
                                variant={
                                  movie.hasFile
                                    ? "default"
                                    : movie.monitored
                                      ? "destructive"
                                      : "secondary"
                                }
                                className="text-[10px] uppercase font-bold"
                              >
                                {movie.hasFile
                                  ? "Downloaded"
                                  : movie.monitored
                                    ? "Missing"
                                    : "Not Monitored"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className="text-[10px] uppercase text-muted-foreground border-border/60"
                              >
                                {movie.qualityProfileId
                                  ? profiles.find(
                                      (p) => p.id === movie.qualityProfileId,
                                    )?.name || movie.qualityProfileId
                                  : "Unknown Profile"}
                              </Badge>
                            </div>
                            <div className="mt-auto flex items-center gap-1.5 pt-2 flex-wrap sm:flex-nowrap">
                              <Button
                                size="sm"
                                variant={
                                  movie.monitored ? "secondary" : "default"
                                }
                                className={`h-7 px-2 text-xs flex-1 transition-all duration-200 active:scale-95 ${
                                  !movie.monitored
                                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                                    : "hover:bg-muted/80"
                                }`}
                                disabled={modifyingId === movie.id}
                                onClick={() => {
                                  if (movie.monitored) {
                                    if (
                                      !window.confirm(
                                        `Are you sure you want to unmonitor "${movie.title}"?\n\nRadarr will no longer automatically search for or download new releases, upgrades, or missing files for this title.`,
                                      )
                                    )
                                      return;
                                  }
                                  handleToggleMonitor(movie);
                                }}
                                title={movie.monitored ? "Click to unmonitor" : "Click to monitor"}
                              >
                                {modifyingId === movie.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : movie.monitored ? (
                                  <>
                                    <EyeOff className="h-3 w-3 mr-1 shrink-0" /> Unmonitor
                                  </>
                                ) : (
                                  <>
                                    <Eye className="h-3 w-3 mr-1 shrink-0" /> Monitor
                                  </>
                                )}
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs transition-all duration-200 hover:ring-2 hover:ring-blue-500/40 active:scale-95 border-border/60"
                                disabled={modifyingId === movie.id}
                                onClick={() => handleTriggerSearch(movie)}
                                title={`Trigger automatic search in Radarr for "${movie.title}"`}
                              >
                                {modifyingId === movie.id ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3 sm:mr-1 shrink-0 text-amber-400" />
                                    <span className="hidden sm:inline">Auto</span>
                                  </>
                                )}
                              </Button>

                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 px-2 text-xs flex-1 bg-blue-600 hover:bg-blue-500 text-white transition-all duration-200 hover:ring-2 hover:ring-blue-400/40 active:scale-95 font-semibold"
                                disabled={modifyingId === movie.id}
                                onClick={() => handleSearchRelease(movie)}
                                title="Search for a new release interactively"
                              >
                                <Search className="h-3 w-3 mr-1 shrink-0" /> Releases
                              </Button>

                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 shrink-0 transition-all duration-200"
                                onClick={() => openDeleteMovieDialog(movie)}
                                title={`Delete "${movie.title}" from Radarr`}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                          <div className="absolute top-2 right-2 flex items-center">
                            {movie.monitored && (
                              <Badge
                                variant="secondary"
                                className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 border-emerald-500/30"
                              >
                                MONITORED
                              </Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {filteredLibrary.length === 0 && (
                      <p className="text-sm text-muted-foreground italic col-span-full text-center py-8 border border-dashed border-border/40 rounded-xl">
                        No movies found in library.
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
                  Live movie downloads with automatic 5-second telemetry polling and progress tracking.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchQueue(false)}
                disabled={queueLoading}
                className="transition-all duration-200 hover:ring-2 hover:ring-blue-500/40"
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
                  {filteredQueue.map((item: any) => {
                    const percent =
                      item.size > 0 && item.sizeleft !== undefined
                        ? Math.max(0, Math.min(100, Math.round((1 - item.sizeleft / item.size) * 100)))
                        : 0;
                    return (
                      <div
                        key={item.id}
                        className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3.5 border border-border/40 rounded-xl bg-[#101014]/90 backdrop-blur-md hover:border-blue-500/30 transition-all duration-200"
                      >
                        <div className="flex-1 min-w-0">
                          <div
                            className="font-medium text-sm truncate text-foreground"
                            title={item.movie?.title || item.title}
                          >
                            {item.movie?.title || item.title}
                          </div>
                          {item.movie?.title && (
                            <div
                              className="text-xs text-muted-foreground truncate mt-0.5"
                              title={item.title}
                            >
                              {item.title}
                            </div>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span className="text-blue-400 font-medium">{item.status}</span>
                            {item.size > 0 && (
                              <span>
                                {formatBytes(item.size - (item.sizeleft || 0))} of {formatBytes(item.size)} ({percent}%)
                              </span>
                            )}
                            {item.timeleft && <span>ETA: {item.timeleft}</span>}
                          </div>

                          {/* Visual Progress Bar */}
                          {item.size > 0 && (
                            <div className="w-full bg-muted/40 h-1.5 rounded-full overflow-hidden mt-2 border border-border/30">
                              <div
                                className="bg-blue-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                          )}

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
                            className="h-8 text-xs font-semibold transition-all duration-200 hover:ring-2 hover:ring-blue-500/40 active:scale-95"
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
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 shrink-0 transition-all duration-200"
                            onClick={() => handleDeleteQueueItem(item)}
                            disabled={deletingQueueId === item.id}
                            title="Cancel and remove from queue"
                          >
                            {deletingQueueId === item.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* INTERACTIVE RELEASE MODAL */}
      <Dialog open={releasesModalOpen} onOpenChange={setReleasesModalOpen}>
        <DialogContent className="w-[96vw] sm:max-w-4xl max-h-[85vh] flex flex-col p-0 bg-[#121218] border-border/60 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b border-border/40 shrink-0">
            <DialogTitle className="text-lg font-bold text-blue-400">Interactive Search</DialogTitle>
            <DialogDescription>
              {activeMovie?.title} ({activeMovie?.year})
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto min-h-[50vh] p-4 sm:p-6">
            {releasesLoading ? (
              <div className="h-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin mb-4 text-blue-400" />
                <p className="text-sm">Searching indexers for movie releases...</p>
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
                              : "bg-[#101014]/90 border-border/50 hover:border-blue-500/40 hover:ring-2 hover:ring-blue-500/20"
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

                              {/* Custom Format Score Badge */}
                              {release.customFormatScore !== undefined && (
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] font-mono border-border/60 ${
                                    release.customFormatScore > 0
                                      ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10 font-bold"
                                      : release.customFormatScore < 0
                                        ? "text-rose-400 border-rose-500/40 bg-rose-500/10"
                                        : "text-muted-foreground"
                                  }`}
                                >
                                  CF: {release.customFormatScore > 0 ? `+${release.customFormatScore}` : release.customFormatScore}
                                </Badge>
                              )}

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

                              {/* Release Age Indicator */}
                              {release.age !== undefined && (
                                <span className="flex items-center text-muted-foreground text-[11px]">
                                  <Clock className="h-3 w-3 mr-1 shrink-0" />
                                  {release.age === 0 ? "Today" : `${release.age}d ago`}
                                </span>
                              )}
                            </div>

                            {/* Active Rejections */}
                            {release.rejected &&
                              release.rejections?.length > 0 && (
                                <div
                                  className={`mt-2 text-xs flex flex-col gap-1 ${rejected ? "text-red-400" : "text-amber-500"}`}
                                >
                                  {release.rejections.map((rej: string, rIdx: number) => (
                                    <div key={rIdx} className="flex items-start gap-1">
                                      <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                      <span>{rej}</span>
                                    </div>
                                  ))}
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
                                ? "bg-blue-600 hover:bg-blue-500 text-white hover:ring-2 hover:ring-blue-400/40 hover:shadow-md"
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

      {/* DELETE MOVIE CONFIRMATION DIALOG */}
      <Dialog
        open={deleteMovieDialog.open}
        onOpenChange={(open) =>
          !deleteMovieDialog.loading &&
          setDeleteMovieDialog((prev) => ({ ...prev, open }))
        }
      >
        <DialogContent className="max-w-md bg-[#121218] border-border/60 text-foreground">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-red-400 flex items-center gap-2">
              <Trash2 className="h-5 w-5" /> Delete Movie from Radarr
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground pt-1">
              Are you sure you want to remove{" "}
              <strong className="text-foreground">
                {deleteMovieDialog.movie?.title} ({deleteMovieDialog.movie?.year})
              </strong>{" "}
              from Radarr?
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-3">
            <label className="flex items-center gap-2.5 p-3 rounded-lg border border-red-500/20 bg-red-500/5 cursor-pointer hover:bg-red-500/10 transition-colors">
              <input
                type="checkbox"
                checked={deleteMovieDialog.deleteFiles}
                onChange={(e) =>
                  setDeleteMovieDialog((prev) => ({
                    ...prev,
                    deleteFiles: e.target.checked,
                  }))
                }
                className="rounded border-border text-red-500 focus:ring-red-500/40 h-4 w-4"
              />
              <div className="text-xs">
                <p className="font-semibold text-foreground">
                  Delete Movie Files From Disk
                </p>
                <p className="text-muted-foreground text-[11px]">
                  Also permanently delete the video and audio files from your media storage folder.
                </p>
              </div>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
            <Button
              variant="outline"
              size="sm"
              disabled={deleteMovieDialog.loading}
              onClick={() =>
                setDeleteMovieDialog({
                  open: false,
                  movie: null,
                  deleteFiles: false,
                  loading: false,
                })
              }
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={deleteMovieDialog.loading}
              onClick={handleConfirmDeleteMovie}
              className="bg-red-600 hover:bg-red-500 text-white font-semibold"
            >
              {deleteMovieDialog.loading ? (
                <Loader2 className="h-4 w-4 animate-spin mr-1.5" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete Movie
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* FLOATING TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl border shadow-2xl backdrop-blur-xl bg-[#121218]/95 border-border/80 text-foreground animate-in fade-in slide-in-from-bottom-5 duration-200">
          {toast.type === "success" && (
            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
          )}
          {toast.type === "error" && (
            <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
          )}
          {toast.type === "info" && (
            <AlertCircle className="h-4 w-4 text-blue-400 shrink-0" />
          )}
          <span className="text-xs font-semibold">{toast.message}</span>
        </div>
      )}

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
