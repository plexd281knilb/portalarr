"use client"

import { useState, useEffect } from "react"
import { getEnabledArrInstances, getArrProfilesAndFolders, searchSonarrSeries, addSonarrSeries, getSonarrQueue, forceImportSonarrQueueItem, getSonarrLibrary, updateSonarrSeries, triggerSonarrSearch, getSonarrReleases, downloadSonarrRelease } from "@/app/arr-actions"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import { Loader2, Search, Plus, Download, AlertCircle, RefreshCw, XCircle, CheckCircle2 } from "lucide-react"

export function formatBytes(bytes: number, decimals = 2) {
    if (!+bytes) return '0 Bytes'
    const k = 1024
    const dm = decimals < 0 ? 0 : decimals
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export default function SonarrPage() {
    const [instances, setInstances] = useState<any[]>([])
    const [selectedAppId, setSelectedAppId] = useState<string>("")
    const [loading, setLoading] = useState(true)

    // Profiles and Folders
    const [profiles, setProfiles] = useState<any[]>([])
    const [folders, setFolders] = useState<any[]>([])

    // Search state
    const [searchTerm, setSearchTerm] = useState("")
    const [searchResults, setSearchResults] = useState<any[]>([])
    const [searching, setSearching] = useState(false)
    
    // Add state
    const [addingSeriesId, setAddingSeriesId] = useState<number | null>(null)
    const [selectedProfileId, setSelectedProfileId] = useState<string>("")
    const [selectedFolderId, setSelectedFolderId] = useState<string>("")

    // Queue state
    const [queue, setQueue] = useState<any[]>([])
    const [queueLoading, setQueueLoading] = useState(false)
    const [queueSearch, setQueueSearch] = useState("")
    const [importingId, setImportingId] = useState<string | null>(null)

    // Library state
    const [library, setLibrary] = useState<any[]>([])
    const [libraryLoading, setLibraryLoading] = useState(false)
    const [librarySearch, setLibrarySearch] = useState("")
    const [modifyingId, setModifyingId] = useState<number | null>(null)

    // Interactive Release Modal
    const [releasesModalOpen, setReleasesModalOpen] = useState(false)
    const [releasesLoading, setReleasesLoading] = useState(false)
    const [releases, setReleases] = useState<any[]>([])
    const [activeSeries, setActiveSeries] = useState<any>(null)
    const [activeSeasonNumber, setActiveSeasonNumber] = useState<number | undefined>(undefined)
    const [downloadingRelease, setDownloadingRelease] = useState<string | null>(null)

    // Manage Seasons Modal
    const [seasonsModalOpen, setSeasonsModalOpen] = useState(false)
    const [activeSeasonsSeries, setActiveSeasonsSeries] = useState<any>(null)
    const [activeSeasons, setActiveSeasons] = useState<any[]>([])
    const [savingSeasons, setSavingSeasons] = useState(false)

    const handleOpenSeasons = (series: any) => {
        setActiveSeasonsSeries(series);
        // Clone seasons, sort by season number descending
        const seasons = JSON.parse(JSON.stringify(series.seasons || []))
            .sort((a: any, b: any) => b.seasonNumber - a.seasonNumber);
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
            monitored: anyMonitored ? true : activeSeasonsSeries.monitored 
        };
        
        const res = await updateSonarrSeries(selectedAppId, updatedSeries);
        if (res.success) {
            setSeasonsModalOpen(false);
            fetchLibrary();
        } else {
            alert("Failed to update seasons: " + res.error);
        }
        setSavingSeasons(false);
    };

    const handleSearchRelease = async (series: any, seasonNumber?: number) => {
        if (!selectedAppId) return;
        setActiveSeries(series);
        setActiveSeasonNumber(seasonNumber);
        setReleasesModalOpen(true);
        setReleasesLoading(true);
        setReleases([]);
        
        const res = await getSonarrReleases(selectedAppId, series.id, seasonNumber);
        if (res.success) {
            setReleases(res.data.sort((a: any, b: any) => (b.customFormatScore || 0) - (a.customFormatScore || 0)));
        } else {
            alert("Failed to fetch releases: " + res.error);
            setReleasesModalOpen(false);
        }
        setReleasesLoading(false);
    };

    const handleDownloadRelease = async (release: any) => {
        if (!selectedAppId || !activeSeries) return;
        setDownloadingRelease(release.guid);
        try {
            const res = await downloadSonarrRelease(selectedAppId, release.guid, release.indexerId);
            if (res.success) {
                alert("Download started!");
                setReleasesModalOpen(false);
                setTimeout(fetchQueue, 2000);
            } else {
                alert("Failed to send release to download client: " + res.error);
            }
        } catch (e: any) {
            console.error(e);
            alert("Failed to download release: " + e.message);
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
        getEnabledArrInstances("sonarr").then(res => {
            if (res.success && res.data) {
                setInstances(res.data)
                if (res.data.length > 0) {
                    setSelectedAppId(res.data[0].id)
                }
            } else {
                console.error(res.error)
            }
            setLoading(false)
        }).catch(err => {
            console.error(err)
            setLoading(false)
        })
    }, [])

    useEffect(() => {
        if (selectedAppId) {
            getArrProfilesAndFolders(selectedAppId, "sonarr").then(res => {
                if (res.success && res.data) {
                    setProfiles(res.data.profiles)
                    setFolders(res.data.folders)
                    if (res.data.profiles.length > 0) setSelectedProfileId(res.data.profiles[0].id.toString())
                    if (res.data.folders.length > 0) setSelectedFolderId(res.data.folders[0].id.toString())
                } else {
                    console.error(res.error)
                }
            }).catch(console.error)
            
            fetchQueue()
            fetchLibrary()
        }
    }, [selectedAppId])

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
        e.preventDefault()
        if (!searchTerm.trim() || !selectedAppId) return
        
        setSearching(true)
        try {
            const res = await searchSonarrSeries(selectedAppId, searchTerm)
            if (res.success && res.data) {
                setSearchResults(res.data)
            } else {
                alert("Search failed: " + res.error)
            }
        } catch (e) {
            console.error(e)
            alert("Search failed. See console.")
        }
        setSearching(false)
    }

    const handleAdd = async (series: any) => {
        if (!selectedAppId || !selectedProfileId || !selectedFolderId) return
        
        setAddingSeriesId(series.tvdbId)
        try {
            const res = await addSonarrSeries(selectedAppId, series, parseInt(selectedProfileId), selectedFolderId)
            if (res.success) {
                alert("Show added and missing episodes search started!")
                fetchLibrary()
            } else {
                alert("Failed to add show: " + res.error)
            }
        } catch (e: any) {
            console.error(e)
            alert("Failed to add show: " + e.message)
        }
        setAddingSeriesId(null)
    }

    const handleToggleMonitor = async (series: any) => {
        if (!selectedAppId) return;
        setModifyingId(series.id);
        try {
            const updatedSeries = { ...series, monitored: !series.monitored };
            const res = await updateSonarrSeries(selectedAppId, updatedSeries);
            if (res.success && res.data) {
                setLibrary(prev => prev.map(s => s.id === series.id ? res.data : s));
            } else {
                alert("Failed to update monitored state: " + res.error);
            }
        } catch (e: any) {
            console.error(e)
            alert("Failed to update monitored state: " + e.message)
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
                alert("Failed to trigger search: " + res.error);
            }
        } catch (e: any) {
            console.error(e)
            alert("Failed to trigger search: " + e.message)
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
                alert("Failed to force import: " + res.error);
            }
        } catch (e: any) {
            console.error(e);
            alert("Failed to force import: " + e.message);
        }
        setImportingId(null);
    }

    if (loading) return <div className="p-8 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>

    if (instances.length === 0) return (
        <div className="p-8 max-w-3xl mx-auto text-center space-y-4">
            <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground" />
            <h2 className="text-xl font-bold">No Sonarr Instances Available</h2>
            <p className="text-muted-foreground">Admins must configure and enable a Sonarr instance for Super Users in Settings.</p>
        </div>
    )

    const filteredQueue = queue.filter(q => q.title.toLowerCase().includes(queueSearch.toLowerCase()));
    const filteredLibrary = library.filter(s => s.title.toLowerCase().includes(librarySearch.toLowerCase()));

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-2xl font-bold text-cyan-400">Sonarr (TV Shows)</h3>
                    <p className="text-sm text-muted-foreground">Self-serve TV show downloads and library management.</p>
                </div>
                {instances.length > 1 && (
                    <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">Instance:</span>
                        <Select value={selectedAppId} onValueChange={setSelectedAppId}>
                            <SelectTrigger className="w-48 bg-background"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {instances.map(app => (
                                    <SelectItem key={app.id} value={app.id}>{app.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            <Tabs defaultValue="search" className="w-full">
                <TabsList className="grid w-full max-w-xl grid-cols-3">
                    <TabsTrigger value="search">Search TVDB</TabsTrigger>
                    <TabsTrigger value="library">Library ({library.length})</TabsTrigger>
                    <TabsTrigger value="queue">Activity / Queue</TabsTrigger>
                </TabsList>
                
                {/* SEARCH TAB */}
                <TabsContent value="search" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Search New TV Shows</CardTitle>
                            <CardDescription>Search TVDB and add shows to your requested quality profile.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <form onSubmit={handleSearch} className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="Search for a TV show..." 
                                        className="pl-9"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" disabled={searching}>
                                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                                </Button>
                            </form>

                            {/* Default Profiles */}
                            <div className="grid sm:grid-cols-2 gap-4 bg-muted/20 p-4 rounded-xl border">
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Quality Profile</label>
                                    <Select value={selectedProfileId} onValueChange={setSelectedProfileId}>
                                        <SelectTrigger className="bg-background"><SelectValue placeholder="Select Profile" /></SelectTrigger>
                                        <SelectContent>
                                            {profiles.map(p => <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-semibold uppercase text-muted-foreground">Root Folder</label>
                                    <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
                                        <SelectTrigger className="bg-background"><SelectValue placeholder="Select Folder" /></SelectTrigger>
                                        <SelectContent>
                                            {folders.map(f => <SelectItem key={f.id} value={f.id.toString()}>{f.path}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Search Results */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
                                {searchResults.map((series: any) => {
                                    const coverImg = series.images?.find((i: any) => i.coverType === "poster")?.remoteUrl || series.images?.[0]?.remoteUrl;
                                    return (
                                    <div key={series.tvdbId} className="flex gap-4 border rounded-xl p-3 bg-card hover:bg-muted/10 transition-colors">
                                        <div className="w-16 h-24 shrink-0 bg-muted rounded overflow-hidden">
                                            {coverImg ? (
                                                <img src={coverImg} alt="cover" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center">No Cover</div>
                                            )}
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-0 py-1">
                                            <h4 className="font-semibold text-sm truncate">{series.title} ({series.year})</h4>
                                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1 mb-auto">{series.overview}</p>
                                            <div className="mt-2 flex items-center justify-between">
                                                <span className="text-[10px] uppercase font-bold text-cyan-400/80">{series.network}</span>
                                                <Button 
                                                    size="sm" 
                                                    onClick={() => handleAdd(series)}
                                                    disabled={addingSeriesId === series.tvdbId || (series.id && series.id > 0) || (series.added && series.added !== "0001-01-01T00:00:00Z")}
                                                    variant={(series.id && series.id > 0) || (series.added && series.added !== "0001-01-01T00:00:00Z") ? "secondary" : "default"}
                                                    className="h-7 text-xs"
                                                >
                                                    {addingSeriesId === series.tvdbId ? <Loader2 className="h-3 w-3 animate-spin" /> : ((series.id && series.id > 0) || (series.added && series.added !== "0001-01-01T00:00:00Z")) ? "Already Added" : <><Plus className="h-3 w-3 mr-1" /> Add Show</>}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                )})}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* LIBRARY TAB */}
                <TabsContent value="library" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Library Management</CardTitle>
                            <CardDescription>View, monitor, and search for new copies of existing TV shows.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {libraryLoading ? (
                                <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" /></div>
                            ) : (
                                <>
                                    <div className="relative max-w-sm mb-4">
                                        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                        <Input 
                                            placeholder="Filter library..." 
                                            className="pl-9"
                                            value={librarySearch}
                                            onChange={(e) => setLibrarySearch(e.target.value)}
                                        />
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {filteredLibrary.map((series: any) => {
                                            const coverImg = series.images?.find((i: any) => i.coverType === "poster")?.remoteUrl || series.images?.[0]?.remoteUrl;
                                            const monitoredSeasons = series.seasons?.filter((s: any) => s.seasonNumber > 0 && s.monitored).length || 0;
                                            const totalSeasons = series.seasons?.filter((s: any) => s.seasonNumber > 0).length || 0;
                                            const isEffectivelyMonitored = series.monitored && monitoredSeasons > 0;

                                            return (
                                            <div key={series.id} className="flex gap-4 border rounded-xl p-3 bg-card hover:bg-muted/10 transition-colors relative">
                                                <div className="w-16 h-24 shrink-0 bg-muted rounded overflow-hidden">
                                                    {coverImg ? (
                                                        <img src={coverImg} alt="cover" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center">No Cover</div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col flex-1 min-w-0 py-1">
                                                    <h4 className="font-semibold text-sm truncate pr-6">{series.title} ({series.year})</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant={series.statistics?.percentOfEpisodes === 100 ? "default" : isEffectivelyMonitored ? "destructive" : "secondary"} className="text-[10px] uppercase">
                                                            {series.statistics?.percentOfEpisodes === 100 ? "Downloaded" : isEffectivelyMonitored ? `${series.statistics?.episodeFileCount || 0} / ${series.statistics?.episodeCount || 0} EPs` : "Not Monitored"}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
                                                            {series.qualityProfileId ? profiles.find(p => p.id === series.qualityProfileId)?.name || series.qualityProfileId : "Unknown Profile"}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-auto flex items-center gap-2 pt-2">
                                                        <Button 
                                                            size="sm" 
                                                            variant="secondary"
                                                            className="h-7 text-xs flex-1"
                                                            disabled={modifyingId === series.id}
                                                            onClick={() => handleOpenSeasons(series)}
                                                        >
                                                            Manage Seasons
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="default"
                                                            className="h-7 text-xs flex-1"
                                                            disabled={modifyingId === series.id}
                                                            onClick={() => handleSearchRelease(series)}
                                                            title="Search for missing episodes interactively"
                                                        >
                                                            {modifyingId === series.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Search className="h-3 w-3 mr-1" /> Search Release</>}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
                                                    {series.monitored && (
                                                        <Badge variant="secondary" className={`text-[9px] px-1.5 ${monitoredSeasons > 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-500 border-amber-500/30'}`}>
                                                            {monitoredSeasons > 0 ? 'MONITORED' : 'NO SEASONS MONITORED'}
                                                        </Badge>
                                                    )}
                                                </div>
                                            </div>
                                        )})}
                                        {filteredLibrary.length === 0 && <p className="text-sm text-muted-foreground italic col-span-full">No TV shows found in library.</p>}
                                    </div>
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* QUEUE TAB */}
                <TabsContent value="queue" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b">
                            <div className="space-y-1">
                                <CardTitle>Activity / Queue</CardTitle>
                                <CardDescription>Monitor active downloads and force imports.</CardDescription>
                            </div>
                            <Button variant="outline" size="sm" onClick={fetchQueue} disabled={queueLoading}>
                                <RefreshCw className={`h-4 w-4 mr-2 ${queueLoading ? "animate-spin" : ""}`} />
                                Refresh
                            </Button>
                        </CardHeader>
                        <CardContent className="pt-6 space-y-4">
                            <div className="relative w-full max-w-sm">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <Input 
                                    placeholder="Filter queue by release name..." 
                                    className="pl-9"
                                    value={queueSearch}
                                    onChange={(e) => setQueueSearch(e.target.value)}
                                />
                            </div>

                            {queueLoading && queue.length === 0 ? (
                                <div className="py-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
                            ) : filteredQueue.length === 0 ? (
                                <div className="py-8 text-center text-sm text-muted-foreground border border-dashed rounded-xl">
                                    Queue is empty or no items match your search.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {filteredQueue.map((item: any) => (
                                        <div key={item.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 border rounded-xl bg-muted/10">
                                            <div className="flex-1 min-w-0">
                                                <div className="font-medium text-sm truncate" title={item.series?.title || item.title}>
                                                    {item.series?.title || "Unknown Series"} {item.episode ? `- S${String(item.episode.seasonNumber).padStart(2, '0')}E${String(item.episode.episodeNumber).padStart(2, '0')}` : ''}
                                                </div>
                                                <div className="text-xs text-muted-foreground truncate mt-0.5" title={item.title}>{item.title}</div>
                                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                                    <span>{item.status}</span>
                                                    {item.sizeleft > 0 && item.size > 0 && (
                                                        <span>{Math.round((1 - (item.sizeleft / item.size)) * 100)}%</span>
                                                    )}
                                                    {item.timeleft && <span>{item.timeleft}</span>}
                                                </div>
                                                {item.errorMessage && (
                                                    <div className="text-[10px] text-amber-500 mt-1 line-clamp-1" title={item.errorMessage}>
                                                        ⚠️ {item.errorMessage}
                                                    </div>
                                                )}
                                                {item.statusMessages && item.statusMessages.length > 0 && (
                                                    <div className="mt-2 space-y-1">
                                                        {item.statusMessages.map((msg: any, i: number) => (
                                                            <div key={i} className="text-xs text-amber-500 flex flex-col bg-amber-500/10 p-2 rounded">
                                                                <span className="font-semibold flex items-center gap-1"><AlertCircle className="h-3 w-3" /> {msg.title}</span>
                                                                {msg.messages && msg.messages.map((m: string, j: number) => (
                                                                    <span key={j} className="text-[10px] text-amber-500/80 ml-4">{m}</span>
                                                                ))}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="shrink-0 flex items-center gap-2">
                                                <Button 
                                                    size="sm" 
                                                    variant="outline" 
                                                    className="h-8 text-xs font-semibold"
                                                    onClick={() => handleForceImport(item.downloadId)}
                                                    disabled={importingId === item.downloadId}
                                                >
                                                    {importingId === item.downloadId ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}
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
                <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-0">
                    <DialogHeader className="px-6 py-4 border-b shrink-0">
                        <DialogTitle>Releases - {activeSeries?.title} {activeSeasonNumber !== undefined ? `- Season ${activeSeasonNumber}` : ''}</DialogTitle>
                        <DialogDescription>
                            {activeSeries?.title} ({activeSeries?.year})
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="flex-1 overflow-y-auto min-h-[50vh] p-6">
                        {releasesLoading ? (
                            <div className="h-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                                <Loader2 className="h-8 w-8 animate-spin mb-4 text-primary" />
                                <p>Searching indexers...</p>
                            </div>
                        ) : (
                            <>
                                {releases.length === 0 ? (
                                    <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                                        <XCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
                                        <p>No releases found.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {releases.map((release: any, idx: number) => {
                                            const isDownloading = downloadingRelease === release.guid;
                                            const benignPhrases = ["Existing file", "equal or higher", "Already in", "Custom Format score"];
                                            const activeRejections = release.rejections?.filter((r: string) => !benignPhrases.some(phrase => r.toLowerCase().includes(phrase.toLowerCase()))) || [];
                                            const rejected = release.rejected && activeRejections.length > 0;
                                            
                                            return (
                                                <div key={release.guid || idx} className={`border rounded-lg p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center ${rejected ? 'opacity-60 bg-muted/30' : 'bg-card'}`}>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            <h5 className="font-medium text-sm break-all">{release.title}</h5>
                                                        </div>
                                                        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap mt-2">
                                                            <Badge variant="outline" className="text-[10px]">{release.quality?.quality?.name || "Unknown"}</Badge>
                                                            <span className="flex items-center"><Download className="h-3 w-3 mr-1" /> {formatBytes(release.size)}</span>
                                                            <span className="capitalize">{release.protocol}</span>
                                                            <span className="bg-muted px-2 py-0.5 rounded text-foreground">{release.indexer}</span>
                                                            <span className="text-emerald-500 font-medium">{release.seeders} S</span>
                                                            <span className="text-red-500 font-medium">{release.leechers} L</span>
                                                        </div>
                                                        {(release.rejected && release.rejections?.length > 0) && (
                                                            <div className={`mt-2 text-xs flex items-start gap-1 ${rejected ? 'text-red-400' : 'text-amber-500'}`}>
                                                                <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                                                                <span>{release.rejections[0]}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                    
                                                    <Button 
                                                        onClick={() => handleDownloadRelease(release)}
                                                        disabled={isDownloading || !!downloadingRelease}
                                                        variant={rejected ? "secondary" : "default"}
                                                        className="shrink-0 w-full sm:w-auto"
                                                    >
                                                        {isDownloading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />}
                                                        Download
                                                    </Button>
                                                </div>
                                            )
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
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Manage Seasons</DialogTitle>
                        <DialogDescription>
                            {activeSeasonsSeries?.title} ({activeSeasonsSeries?.year})
                        </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto pr-4">
                        {activeSeasons.filter((s: any) => s.seasonNumber > 0).map((season: any) => (
                            <div key={season.seasonNumber} className="flex items-center justify-between border-b pb-4 last:border-0 last:pb-0">
                                <div className="space-y-0.5">
                                    <div className="text-base font-medium">Season {season.seasonNumber}</div>
                                    <p className="text-xs text-muted-foreground">
                                        {season.statistics?.episodeFileCount || 0} / {season.statistics?.totalEpisodeCount || season.statistics?.episodeCount || 0} Episodes
                                    </p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <Button 
                                        size="sm" 
                                        variant="outline" 
                                        className="h-7 text-xs" 
                                        onClick={() => handleSearchRelease(activeSeasonsSeries, season.seasonNumber)}
                                        title={`Search interactively for Season ${season.seasonNumber}`}
                                    >
                                        <Search className="h-3 w-3 mr-1" /> Search
                                    </Button>
                                    <Switch 
                                        checked={season.monitored}
                                        onCheckedChange={(checked) => {
                                            setActiveSeasons(prev => prev.map(s => 
                                                s.seasonNumber === season.seasonNumber ? { ...s, monitored: checked } : s
                                            ));
                                        }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="flex justify-end gap-2 pt-4 border-t">
                        <Button variant="outline" onClick={() => setSeasonsModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleSaveSeasons} disabled={savingSeasons}>
                            {savingSeasons ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                            Save Changes
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    )
}
