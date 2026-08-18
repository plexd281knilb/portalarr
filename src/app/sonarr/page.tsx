"use client"

import { useState, useEffect } from "react"
import { getEnabledArrInstances, getArrProfilesAndFolders, searchSonarrSeries, addSonarrSeries, getSonarrQueue, forceImportSonarrQueueItem } from "@/app/arr-actions"
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2, Search, Plus, Download, AlertCircle, RefreshCw } from "lucide-react"

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
            } else {
                alert("Failed to add show: " + res.error)
            }
        } catch (e: any) {
            console.error(e)
            alert("Failed to add show: " + e.message)
        }
        setAddingSeriesId(null)
    }

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

    return (
        <div className="space-y-6 max-w-6xl mx-auto pb-12">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h3 className="text-2xl font-bold text-cyan-400">Sonarr (TV Shows)</h3>
                    <p className="text-sm text-muted-foreground">Self-serve TV show downloads and queue management.</p>
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
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="search">Search & Add</TabsTrigger>
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
                                {searchResults.map((series: any) => (
                                    <div key={series.tvdbId} className="flex gap-4 border rounded-xl p-3 bg-card hover:bg-muted/10 transition-colors">
                                        <div className="w-16 h-24 shrink-0 bg-muted rounded overflow-hidden">
                                            {series.images && series.images.length > 0 ? (
                                                <img src={series.images[0].url} alt="cover" className="w-full h-full object-cover" />
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
                                ))}
                            </div>
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
