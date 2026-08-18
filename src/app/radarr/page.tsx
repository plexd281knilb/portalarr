"use client"

import { useState, useEffect } from "react"
import { getEnabledArrInstances, getArrProfilesAndFolders, searchRadarrMovies, addRadarrMovie, getRadarrQueue, forceImportRadarrQueueItem, getRadarrLibrary, updateRadarrMovie, triggerRadarrSearch } from "@/app/arr-actions"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Loader2, Search, Plus, Download, AlertCircle, RefreshCw } from "lucide-react"

export default function RadarrPage() {
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
    const [addingMovieId, setAddingMovieId] = useState<number | null>(null)
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

    useEffect(() => {
        getEnabledArrInstances("radarr").then(res => {
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
            getArrProfilesAndFolders(selectedAppId, "radarr").then(res => {
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
            const res = await getRadarrQueue(selectedAppId);
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
            const res = await searchRadarrMovies(selectedAppId, searchTerm)
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

    const handleAdd = async (movie: any) => {
        if (!selectedAppId || !selectedProfileId || !selectedFolderId) return
        
        setAddingMovieId(movie.tmdbId)
        try {
            const res = await addRadarrMovie(selectedAppId, movie, parseInt(selectedProfileId), selectedFolderId)
            if (res.success) {
                alert("Movie added and download started!")
                fetchLibrary()
            } else {
                alert("Failed to add movie: " + res.error)
            }
        } catch (e: any) {
            console.error(e)
            alert("Failed to add movie: " + e.message)
        }
        setAddingMovieId(null)
    }

    const handleToggleMonitor = async (movie: any) => {
        if (!selectedAppId) return;
        setModifyingId(movie.id);
        try {
            const updatedMovie = { ...movie, monitored: !movie.monitored };
            const res = await updateRadarrMovie(selectedAppId, updatedMovie);
            if (res.success && res.data) {
                setLibrary(prev => prev.map(m => m.id === movie.id ? res.data : m));
            } else {
                alert("Failed to update monitored state: " + res.error);
            }
        } catch (e: any) {
            console.error(e);
            alert("Failed to update monitored state: " + e.message);
        }
        setModifyingId(null);
    };

    const handleTriggerSearch = async (movie: any) => {
        if (!selectedAppId) return;
        setModifyingId(movie.id);
        try {
            const res = await triggerRadarrSearch(selectedAppId, movie.id);
            if (res.success) {
                alert(`Search command sent for: ${movie.title}`);
            } else {
                alert("Failed to trigger search: " + res.error);
            }
        } catch (e: any) {
            console.error(e);
            alert("Failed to trigger search: " + e.message);
        }
        setModifyingId(null);
    };

    const handleForceImport = async (downloadId: string) => {
        if (!selectedAppId) return;
        setImportingId(downloadId);
        try {
            const res = await forceImportRadarrQueueItem(selectedAppId, downloadId);
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
            <h2 className="text-xl font-bold">No Radarr Instances Available</h2>
            <p className="text-muted-foreground">Admins must configure and enable a Radarr instance for Super Users in Settings.</p>
        </div>
    )

    const filteredQueue = queue.filter(q => q.title.toLowerCase().includes(queueSearch.toLowerCase()));
    const filteredLibrary = library.filter(m => m.title.toLowerCase().includes(librarySearch.toLowerCase()));

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-2xl font-bold text-blue-400">Radarr (Movies)</h3>
                    <p className="text-sm text-muted-foreground">Self-serve movie downloads and library management.</p>
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
                    <TabsTrigger value="search">Search TMDB</TabsTrigger>
                    <TabsTrigger value="library">Library ({library.length})</TabsTrigger>
                    <TabsTrigger value="queue">Activity / Queue</TabsTrigger>
                </TabsList>
                
                {/* SEARCH TAB */}
                <TabsContent value="search" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Search New Movies</CardTitle>
                            <CardDescription>Search TMDB and add movies to your requested quality profile.</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            <form onSubmit={handleSearch} className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                    <Input 
                                        placeholder="Search for a movie..." 
                                        className="pl-9"
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                    />
                                </div>
                                <Button type="submit" disabled={searching}>
                                    {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Search"}
                                </Button>
                            </form>

                            {/* Default Profiles (applied to all searches) */}
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
                                {searchResults.map((movie: any) => (
                                    <div key={movie.tmdbId} className="flex gap-4 border rounded-xl p-3 bg-card hover:bg-muted/10 transition-colors">
                                        <div className="w-16 h-24 shrink-0 bg-muted rounded overflow-hidden">
                                            {movie.images && movie.images.length > 0 ? (
                                                <img src={movie.images[0].url} alt="cover" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center">No Cover</div>
                                            )}
                                        </div>
                                        <div className="flex flex-col flex-1 min-w-0 py-1">
                                            <h4 className="font-semibold text-sm truncate">{movie.title} ({movie.year})</h4>
                                            <p className="text-xs text-muted-foreground line-clamp-2 mt-1 mb-auto">{movie.overview}</p>
                                            <div className="mt-2 flex items-center justify-between">
                                                <span className="text-[10px] uppercase font-bold text-blue-400/80">{movie.status}</span>
                                                <Button 
                                                    size="sm" 
                                                    onClick={() => handleAdd(movie)}
                                                    disabled={addingMovieId === movie.tmdbId || (movie.id && movie.id > 0) || (movie.added && movie.added !== "0001-01-01T00:00:00Z")}
                                                    variant={(movie.id && movie.id > 0) || (movie.added && movie.added !== "0001-01-01T00:00:00Z") ? "secondary" : "default"}
                                                    className="h-7 text-xs"
                                                >
                                                    {addingMovieId === movie.tmdbId ? <Loader2 className="h-3 w-3 animate-spin" /> : ((movie.id && movie.id > 0) || (movie.added && movie.added !== "0001-01-01T00:00:00Z")) ? "Already Added" : <><Plus className="h-3 w-3 mr-1" /> Add Movie</>}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* LIBRARY TAB */}
                <TabsContent value="library" className="space-y-4 mt-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Library Management</CardTitle>
                            <CardDescription>View, monitor, and search for new copies of existing movies.</CardDescription>
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
                                        {filteredLibrary.map((movie: any) => (
                                            <div key={movie.id} className="flex gap-4 border rounded-xl p-3 bg-card hover:bg-muted/10 transition-colors relative">
                                                <div className="w-16 h-24 shrink-0 bg-muted rounded overflow-hidden">
                                                    {movie.images && movie.images.length > 0 ? (
                                                        <img src={movie.images[0].url} alt="cover" className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-xs text-muted-foreground text-center">No Cover</div>
                                                    )}
                                                </div>
                                                <div className="flex flex-col flex-1 min-w-0 py-1">
                                                    <h4 className="font-semibold text-sm truncate pr-6">{movie.title} ({movie.year})</h4>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <Badge variant={movie.hasFile ? "default" : "destructive"} className="text-[10px] uppercase">
                                                            {movie.hasFile ? "Downloaded" : "Missing"}
                                                        </Badge>
                                                        <Badge variant="outline" className="text-[10px] uppercase text-muted-foreground">
                                                            {movie.qualityProfileId ? profiles.find(p => p.id === movie.qualityProfileId)?.name || movie.qualityProfileId : "Unknown Profile"}
                                                        </Badge>
                                                    </div>
                                                    <div className="mt-auto flex items-center gap-2 pt-2">
                                                        <Button 
                                                            size="sm" 
                                                            variant={movie.monitored ? "secondary" : "outline"}
                                                            className="h-7 text-xs flex-1"
                                                            disabled={modifyingId === movie.id}
                                                            onClick={() => handleToggleMonitor(movie)}
                                                        >
                                                            {modifyingId === movie.id ? <Loader2 className="h-3 w-3 animate-spin" /> : movie.monitored ? "Unmonitor" : "Monitor"}
                                                        </Button>
                                                        <Button 
                                                            size="sm" 
                                                            variant="default"
                                                            className="h-7 text-xs flex-1"
                                                            disabled={modifyingId === movie.id}
                                                            onClick={() => handleTriggerSearch(movie)}
                                                            title="Search for a new release"
                                                        >
                                                            {modifyingId === movie.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Search className="h-3 w-3 mr-1" /> Search Release</>}
                                                        </Button>
                                                    </div>
                                                </div>
                                                <div className="absolute top-2 right-2 flex items-center">
                                                    {movie.monitored && <Badge variant="secondary" className="bg-emerald-500/20 text-emerald-400 text-[9px] px-1.5 border-emerald-500/30">MONITORED</Badge>}
                                                </div>
                                            </div>
                                        ))}
                                        {filteredLibrary.length === 0 && <p className="text-sm text-muted-foreground italic col-span-full">No movies found in library.</p>}
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
                                                <div className="font-medium text-sm truncate" title={item.title}>{item.title}</div>
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
        </div>
    )
}
