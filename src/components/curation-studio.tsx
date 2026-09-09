"use client";

import { useState, useEffect, useTransition } from "react";
import { 
    getCurationSettingsAction, 
    saveCurationSettingsAction, 
    getPlexServersAndSectionsAction,
    getMediaCollectionsAction, 
    saveMediaCollectionAction, 
    syncCollectionToPlexAction, 
    deleteMediaCollectionAction,
    getOverlayRulesAction, 
    saveOverlayRuleAction, 
    applyOverlaysToLibraryAction, 
    revertLibraryOverlaysAction,
    getLeavingSoonItemsAction, 
    markItemLeavingSoonAction, 
    unmarkItemLeavingSoonAction,
    getUserContentPreferencesAction, 
    saveUserContentPreferencesAction,
    testCurationApiKeysAction
} from "@/app/curation-actions";
import { COLLECTION_PRESETS, CollectionPreset } from "@/lib/curation/presets";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { 
    Sparkles, Film, Tv, Trophy, Star, Shield, Zap, Flame, Monitor, 
    Disc, Radio, Ghost, Gift, Eye, Volume2, TrendingUp, AlertTriangle, 
    Layers, RefreshCw, CheckCircle2, XCircle, Loader2, ArrowRight, 
    Sliders, Copy, Check, Trash2, Plus, Calendar, Clock, Lock, Key, 
    FolderHeart, Undo2, HardDrive, PlaySquare, Filter, ShieldAlert, HeartOff
} from "lucide-react";

export default function CurationStudio() {
    const [subTab, setSubTab] = useState("collections");
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    // Settings & Servers
    const [settings, setSettings] = useState<any>({});
    const [servers, setServers] = useState<any[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>("");
    const [selectedSectionKey, setSelectedSectionKey] = useState<string>("");

    // Collections
    const [collections, setCollections] = useState<any[]>([]);
    const [syncingCollId, setSyncingCollId] = useState<string | null>(null);
    const [syncMessage, setSyncMessage] = useState<{ id: string; success: boolean; text: string } | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [newCollTitle, setNewCollTitle] = useState("");
    const [newCollSummary, setNewCollSummary] = useState("");
    const [newCollSourceType, setNewCollSourceType] = useState("tmdb");
    const [newCollSourceQuery, setNewCollSourceQuery] = useState("");
    const [newCollPosterUrl, setNewCollPosterUrl] = useState("");

    // Overlay Rules & Simulator
    const [overlayRules, setOverlayRules] = useState<any[]>([]);
    const [backupsCount, setBackupsCount] = useState(0);
    const [applyingOverlays, setApplyingOverlays] = useState(false);
    const [revertingOverlays, setRevertingOverlays] = useState(false);
    const [overlayMessage, setOverlayMessage] = useState<{ success: boolean; text: string } | null>(null);

    // Live Overlay Simulator States
    const [simResolution, setSimResolution] = useState<"4K" | "1080p" | "none">("4K");
    const [simHdr, setSimHdr] = useState<"DV" | "HDR10+" | "HDR" | "none">("DV");
    const [simAudio, setSimAudio] = useState<"ATMOS" | "TRUEHD" | "DTS:X" | "5.1" | "none">("ATMOS");
    const [simRatings, setSimRatings] = useState(true);
    const [simLeavingSoon, setSimLeavingSoon] = useState(false);
    const [simTheme, setSimTheme] = useState<"glass" | "gold" | "classic" | "minimal">("glass");
    const [simPosition, setSimPosition] = useState<"top-right" | "top-left" | "bottom-right">("top-right");

    // Upcoming Releases Calendar
    const [releasesLoading, setReleasesLoading] = useState(false);
    const [releasesData, setReleasesData] = useState<{ digitalStreaming: any[]; theatricalUpcoming: any[]; nowPlaying: any[] }>({
        digitalStreaming: [],
        theatricalUpcoming: [],
        nowPlaying: []
    });
    const [releaseFilter, setReleaseFilter] = useState<"all" | "digital" | "theatrical">("all");

    // Leaving Soon Pruning
    const [leavingSoonItems, setLeavingSoonItems] = useState<any[]>([]);
    const [copiedWebhook, setCopiedWebhook] = useState(false);
    const [manualLeavingTitle, setManualLeavingTitle] = useState("");
    const [manualLeavingDays, setManualLeavingDays] = useState(7);
    const [manualLeavingReason, setManualLeavingReason] = useState("Storage capacity cleanup");
    const [manualLeavingModalOpen, setManualLeavingModalOpen] = useState(false);

    // User Content Preferences
    const [userPrefs, setUserPrefs] = useState<any>({
        excludedGenres: [],
        excludedTags: [],
        maxContentRating: "ALL",
        hideLeavingSoon: false,
        hideHorror: false,
        hideNsfw: false,
        hideGore: false
    });
    const [savingPrefs, setSavingPrefs] = useState(false);
    const [prefsSavedMsg, setPrefsSavedMsg] = useState(false);

    // API Key Testing
    const [testingKeys, setTestingKeys] = useState(false);
    const [testKeyResults, setTestKeyResults] = useState<{ tmdb?: boolean; trakt?: boolean; mdblist?: boolean; errors: string[] } | null>(null);

    // Load initial data
    const loadData = async () => {
        setLoading(true);
        try {
            const [settRes, srvRes, collRes, ruleRes, leaveRes, prefRes] = await Promise.all([
                getCurationSettingsAction().catch(() => ({ success: false })),
                getPlexServersAndSectionsAction().catch(() => ({ success: false })),
                getMediaCollectionsAction().catch(() => ({ success: false, collections: [] })),
                getOverlayRulesAction().catch(() => ({ success: false, rules: [], backupsCount: 0 })),
                getLeavingSoonItemsAction().catch(() => ({ success: false, items: [] })),
                getUserContentPreferencesAction().catch(() => ({ success: false }))
            ]);

            const srvData = srvRes as any;
            const prefData = prefRes as any;
            const collData = collRes as any;
            const ruleData = ruleRes as any;
            const leaveData = leaveRes as any;

            if ((settRes as any).success) setSettings(settRes);
            if (srvData?.success && Array.isArray(srvData.servers) && srvData.servers.length > 0) {
                setServers(srvData.servers);
                setSelectedServerId(srvData.servers[0].serverId);
                if (srvData.servers[0].sections?.length > 0) {
                    setSelectedSectionKey(String(srvData.servers[0].sections[0].key));
                }
            }
            if (collData?.success) setCollections(collData.collections || []);
            if (ruleData?.success) {
                setOverlayRules(ruleData.rules || []);
                setBackupsCount(ruleData.backupsCount || 0);
            }
            if (leaveData?.success) setLeavingSoonItems(leaveData.items || []);
            if (prefData?.success && prefData.preference) {
                const p = prefData.preference;
                setUserPrefs({
                    excludedGenres: typeof p.excludedGenres === "string" ? JSON.parse(p.excludedGenres || "[]") : (p.excludedGenres || []),
                    excludedTags: typeof p.excludedTags === "string" ? JSON.parse(p.excludedTags || "[]") : (p.excludedTags || []),
                    maxContentRating: p.maxContentRating || "ALL",
                    hideLeavingSoon: p.hideLeavingSoon || false,
                    hideHorror: p.hideHorror || false,
                    hideNsfw: p.hideNsfw || false,
                    hideGore: p.hideGore || false
                });
            }
        } catch (e) {
            console.error("Failed loading curation studio data:", e);
        } finally {
            setLoading(false);
        }
    };

    const loadReleases = async () => {
        setReleasesLoading(true);
        try {
            const res = await fetch("/api/curation/releases");
            if (res.ok) {
                const data = await res.json();
                setReleasesData({
                    digitalStreaming: data.digitalStreaming || [],
                    theatricalUpcoming: data.theatricalUpcoming || [],
                    nowPlaying: data.nowPlaying || []
                });
            }
        } catch (e) {
            console.error("Failed loading releases:", e);
        } finally {
            setReleasesLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    useEffect(() => {
        if (subTab === "releases") {
            loadReleases();
        }
    }, [subTab]);

    // Handle Preset 1-Click Sync
    const handleSyncPreset = async (preset: CollectionPreset) => {
        if (!selectedServerId || !selectedSectionKey) {
            alert("Please select a Plex Server and Library Section above first.");
            return;
        }

        setSyncingCollId(preset.id);
        setSyncMessage(null);

        try {
            // Save or find collection record
            const saveRes = await saveMediaCollectionAction({
                title: preset.title,
                summary: preset.description,
                type: preset.type,
                category: preset.category,
                serverId: selectedServerId,
                sectionKey: selectedSectionKey,
                sourceType: preset.sourceType,
                sourceQuery: preset.sourceQuery,
                posterUrl: preset.defaultPosterUrl,
                autoSync: true
            });

            if (saveRes.success && saveRes.collection) {
                // Trigger live sync to Plex
                const syncRes = await syncCollectionToPlexAction(saveRes.collection.id);
                setSyncMessage({
                    id: preset.id,
                    success: syncRes.success,
                    text: syncRes.message || (syncRes.success ? "Synced to Plex successfully!" : "Sync failed.")
                });
                await loadData();
            } else {
                setSyncMessage({ id: preset.id, success: false, text: saveRes.error || "Failed to create collection." });
            }
        } catch (err: any) {
            setSyncMessage({ id: preset.id, success: false, text: err.message || "Error syncing preset." });
        } finally {
            setSyncingCollId(null);
        }
    };

    // Handle Custom Collection Create
    const handleCreateCustomCollection = async () => {
        if (!newCollTitle) return;
        setCreateModalOpen(false);

        const saveRes = await saveMediaCollectionAction({
            title: newCollTitle,
            summary: newCollSummary,
            type: "custom",
            serverId: selectedServerId,
            sectionKey: selectedSectionKey,
            sourceType: newCollSourceType,
            sourceQuery: newCollSourceQuery,
            posterUrl: newCollPosterUrl,
            autoSync: true
        });

        if (saveRes.success && saveRes.collection) {
            await syncCollectionToPlexAction(saveRes.collection.id);
            await loadData();
        }
        setNewCollTitle("");
        setNewCollSummary("");
        setNewCollSourceQuery("");
    };

    // Handle Apply Overlays to Library
    const handleApplyOverlays = async () => {
        if (!selectedServerId || !selectedSectionKey) {
            alert("Please select a Plex Server and Library Section above.");
            return;
        }

        setApplyingOverlays(true);
        setOverlayMessage(null);

        try {
            // Save or update active rule with simulator settings
            const saveRuleRes = await saveOverlayRuleAction({
                name: "Library Quality Overlays",
                serverId: selectedServerId,
                sectionKey: selectedSectionKey,
                overlayType: "combined",
                position: simPosition,
                theme: simTheme,
                showResolution: simResolution !== "none",
                showHdr: simHdr !== "none",
                showAudio: simAudio !== "none",
                showRatings: simRatings,
                showLeavingSoon: simLeavingSoon,
                enabled: true
            });

            const res = await applyOverlaysToLibraryAction(
                selectedServerId,
                selectedSectionKey,
                saveRuleRes.rule?.id
            );

            setOverlayMessage({
                success: res.success,
                text: res.message || `Applied overlays to ${res.appliedCount || 0} items.`
            });
            await loadData();
        } catch (err: any) {
            setOverlayMessage({ success: false, text: err.message || "Failed to apply overlays." });
        } finally {
            setApplyingOverlays(false);
        }
    };

    // Handle Revert Overlays
    const handleRevertOverlays = async () => {
        if (!confirm("Are you sure you want to restore all pristine original posters from the backup vault? This will revert all modified posters back to their original artwork.")) {
            return;
        }

        setRevertingOverlays(true);
        setOverlayMessage(null);

        try {
            const res: any = await revertLibraryOverlaysAction(selectedServerId);
            setOverlayMessage({
                success: Boolean(res?.success),
                text: res?.message || res?.error || `Restored original posters!`
            });
            await loadData();
        } catch (err: any) {
            setOverlayMessage({ success: false, text: err.message || "Failed to restore original artwork." });
        } finally {
            setRevertingOverlays(false);
        }
    };

    // Handle Save User Preferences
    const handleSaveUserPrefs = async () => {
        setSavingPrefs(true);
        setPrefsSavedMsg(false);
        try {
            await saveUserContentPreferencesAction(userPrefs);
            setPrefsSavedMsg(true);
            setTimeout(() => setPrefsSavedMsg(false), 3000);
        } catch (e) {
            console.error("Failed to save content preferences:", e);
        } finally {
            setSavingPrefs(false);
        }
    };

    // Handle Test API Keys
    const handleTestKeys = async () => {
        setTestingKeys(true);
        setTestKeyResults(null);
        try {
            const res = await testCurationApiKeysAction(
                settings.tmdbApiKey,
                settings.traktClientId,
                settings.mdblistApiKey
            );
            setTestKeyResults(res.results || { errors: [] });
        } catch (e) {
            console.error("Failed testing API keys:", e);
        } finally {
            setTestingKeys(false);
        }
    };

    const currentServer = servers.find(s => s.serverId === selectedServerId) || servers[0];
    const currentSections = currentServer?.sections || [];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm font-medium">Loading Curation Studio & Plex Integrations...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Banner */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 bg-gradient-to-br from-[#13111c] via-[#1a1429] to-[#0f172a] border border-purple-500/20 rounded-2xl shadow-xl">
                <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 bg-purple-500/20 rounded-xl text-purple-400 border border-purple-500/30">
                            <Sparkles className="h-6 w-6" />
                        </div>
                        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
                            Curation & Poster Studio
                        </h1>
                        <Badge variant="outline" className="border-purple-500/40 text-purple-300 bg-purple-950/40 text-xs font-semibold px-2 py-0.5">
                            Agregarr & Kometa Replacement
                        </Badge>
                    </div>
                    <p className="text-sm text-slate-400 max-w-2xl">
                        Unified automated collections, 4K/HDR/Atmos poster overlays with 1-click non-destructive restore, upcoming digital streaming calendar, and disk space prune management.
                    </p>
                </div>

                {/* Server & Section Selector Bar */}
                <div className="flex flex-wrap items-center gap-2 bg-slate-900/90 p-2 border border-slate-800 rounded-xl shadow-inner w-full sm:w-auto">
                    <div className="flex items-center gap-1.5">
                        <Tv className="h-4 w-4 text-purple-400 shrink-0 ml-1" />
                        <Select value={selectedServerId} onValueChange={(val) => {
                            setSelectedServerId(val);
                            const srv = servers.find(s => s.serverId === val);
                            if (srv?.sections?.length > 0) setSelectedSectionKey(String(srv.sections[0].key));
                        }}>
                            <SelectTrigger className="h-8 w-[140px] text-xs bg-slate-800/80 border-slate-700">
                                <SelectValue placeholder="Select Server" />
                            </SelectTrigger>
                            <SelectContent>
                                {servers.map(s => (
                                    <SelectItem key={s.serverId} value={s.serverId} className="text-xs">
                                        {s.serverName || "Plex Server"}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex items-center gap-1.5">
                        <Film className="h-4 w-4 text-sky-400 shrink-0 ml-1" />
                        <Select value={selectedSectionKey} onValueChange={setSelectedSectionKey}>
                            <SelectTrigger className="h-8 w-[140px] text-xs bg-slate-800/80 border-slate-700">
                                <SelectValue placeholder="Select Library" />
                            </SelectTrigger>
                            <SelectContent>
                                {currentSections.map((sec: any) => (
                                    <SelectItem key={sec.key} value={String(sec.key)} className="text-xs">
                                        {sec.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>
            </div>

            {/* Studio Navigation Tabs */}
            <Tabs value={subTab} onValueChange={setSubTab} className="space-y-6">
                <TabsList className="grid grid-cols-2 sm:grid-cols-5 w-full h-auto p-1.5 bg-slate-900/60 border border-slate-800 rounded-xl gap-1.5 shadow-md">
                    <TabsTrigger value="collections" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <Trophy className="h-4 w-4 text-amber-400" />
                        <span>Curated Collections</span>
                    </TabsTrigger>
                    <TabsTrigger value="overlays" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <Layers className="h-4 w-4 text-sky-400" />
                        <span>Poster Overlays</span>
                    </TabsTrigger>
                    <TabsTrigger value="releases" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <Calendar className="h-4 w-4 text-emerald-400" />
                        <span>Digital Releases</span>
                    </TabsTrigger>
                    <TabsTrigger value="pruning" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <AlertTriangle className="h-4 w-4 text-rose-400" />
                        <span>Leaving Soon</span>
                    </TabsTrigger>
                    <TabsTrigger value="preferences" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white col-span-2 sm:col-span-1">
                        <Filter className="h-4 w-4 text-indigo-400" />
                        <span>Content Filters</span>
                    </TabsTrigger>
                </TabsList>

                {/* ========================================================================= */}
                {/* TAB 1: CURATED COLLECTIONS & PLAYLISTS (KOMETA REPLACEMENT) */}
                {/* ========================================================================= */}
                <TabsContent value="collections" className="space-y-6">
                    {/* Active Collections Summary & Create Action */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                        <div>
                            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
                                <Trophy className="h-4 w-4 text-amber-400" /> 1-Click Curated Collections Catalog
                            </h3>
                            <p className="text-xs text-slate-400">
                                Click &quot;Sync to Plex&quot; on any preset to automatically query matching media from your library and create organized Plex collections.
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
                                <DialogTrigger asChild>
                                    <Button size="sm" className="bg-purple-600 hover:bg-purple-500 text-white gap-1.5 text-xs font-semibold">
                                        <Plus className="h-3.5 w-3.5" /> Create Custom Collection
                                    </Button>
                                </DialogTrigger>
                                <DialogContent className="bg-slate-900 border-slate-800 text-slate-100">
                                    <DialogHeader>
                                        <DialogTitle className="flex items-center gap-2">
                                            <Sparkles className="h-5 w-5 text-purple-400" /> Create Custom Plex Collection
                                        </DialogTitle>
                                        <DialogDescription className="text-slate-400 text-xs">
                                            Build a custom collection powered by TMDb, Trakt, MDBList, or media tech query.
                                        </DialogDescription>
                                    </DialogHeader>
                                    <div className="space-y-3 py-2 text-xs">
                                        <div className="space-y-1">
                                            <Label>Collection Title</Label>
                                            <Input 
                                                value={newCollTitle} 
                                                onChange={e => setNewCollTitle(e.target.value)} 
                                                placeholder="e.g. Christopher Nolan Masterpieces"
                                                className="bg-slate-800/80 border-slate-700" 
                                            />
                                        </div>
                                        <div className="space-y-1">
                                            <Label>Description / Summary</Label>
                                            <Textarea 
                                                value={newCollSummary} 
                                                onChange={e => setNewCollSummary(e.target.value)} 
                                                placeholder="Summary shown on the Plex collection card..."
                                                className="bg-slate-800/80 border-slate-700 text-xs h-16" 
                                            />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="space-y-1">
                                                <Label>Source Provider</Label>
                                                <Select value={newCollSourceType} onValueChange={setNewCollSourceType}>
                                                    <SelectTrigger className="bg-slate-800/80 border-slate-700 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="tmdb">TMDb (Franchise/Studio)</SelectItem>
                                                        <SelectItem value="trakt">Trakt (Trending/List)</SelectItem>
                                                        <SelectItem value="mdblist">MDBList Curated</SelectItem>
                                                        <SelectItem value="plex_query">Plex Media Query</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label>Query / Parameter</Label>
                                                <Input 
                                                    value={newCollSourceQuery} 
                                                    onChange={e => setNewCollSourceQuery(e.target.value)} 
                                                    placeholder="e.g. collection:86311"
                                                    className="bg-slate-800/80 border-slate-700 text-xs" 
                                                />
                                            </div>
                                        </div>
                                        <div className="space-y-1">
                                            <Label>Custom Poster Artwork URL (Optional)</Label>
                                            <Input 
                                                value={newCollPosterUrl} 
                                                onChange={e => setNewCollPosterUrl(e.target.value)} 
                                                placeholder="https://..."
                                                className="bg-slate-800/80 border-slate-700 text-xs" 
                                            />
                                        </div>
                                    </div>
                                    <DialogFooter>
                                        <Button variant="outline" size="sm" onClick={() => setCreateModalOpen(false)}>Cancel</Button>
                                        <Button size="sm" onClick={handleCreateCustomCollection} className="bg-purple-600 hover:bg-purple-500 text-white">Create & Sync</Button>
                                    </DialogFooter>
                                </DialogContent>
                            </Dialog>
                        </div>
                    </div>

                    {/* Presets Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {COLLECTION_PRESETS.map((preset) => {
                            const isSyncing = syncingCollId === preset.id;
                            const isMessage = syncMessage?.id === preset.id;

                            return (
                                <Card key={preset.id} className="bg-slate-900/60 border-slate-800/80 hover:border-purple-500/40 transition-all flex flex-col justify-between overflow-hidden shadow-lg group">
                                    <CardHeader className="p-4 pb-2 space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <Badge variant="outline" className="text-[10px] font-bold uppercase tracking-wider bg-slate-800/80 text-purple-300 border-purple-500/30">
                                                {preset.category}
                                            </Badge>
                                            <Badge variant="secondary" className="text-[10px] font-semibold bg-slate-800 text-slate-300">
                                                {preset.sourceType.toUpperCase()}
                                            </Badge>
                                        </div>
                                        <CardTitle className="text-sm font-bold text-white group-hover:text-purple-300 transition-colors">
                                            {preset.title}
                                        </CardTitle>
                                        <CardDescription className="text-xs text-slate-400 line-clamp-2">
                                            {preset.description}
                                        </CardDescription>
                                    </CardHeader>

                                    <CardFooter className="p-4 pt-2 flex flex-col gap-2">
                                        {isMessage && (
                                            <div className={`w-full text-[11px] p-2 rounded-lg flex items-center gap-1.5 ${syncMessage.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800' : 'bg-rose-950/60 text-rose-300 border border-rose-800'}`}>
                                                {syncMessage.success ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 shrink-0" />}
                                                <span className="truncate">{syncMessage.text}</span>
                                            </div>
                                        )}

                                        <Button 
                                            size="sm" 
                                            disabled={isSyncing}
                                            onClick={() => handleSyncPreset(preset)}
                                            className="w-full bg-slate-800 hover:bg-purple-600 text-slate-100 hover:text-white transition-all text-xs font-semibold gap-1.5 h-8 border border-slate-700 hover:border-purple-500 shadow-sm"
                                        >
                                            {isSyncing ? (
                                                <>
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-300" />
                                                    <span>Syncing to Plex...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                                                    <span>Sync Collection to Plex</span>
                                                </>
                                            )}
                                        </Button>
                                    </CardFooter>
                                </Card>
                            );
                        })}
                    </div>
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 2: POSTER OVERLAYS & BADGES (KOMETA REPLACEMENT) */}
                {/* ========================================================================= */}
                <TabsContent value="overlays" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Interactive Poster Preview Simulator */}
                        <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-900/70 border border-slate-800 rounded-2xl shadow-xl space-y-4">
                            <div className="text-center space-y-1">
                                <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                                    <Eye className="h-4 w-4 text-purple-400" /> Live Poster Preview Simulator
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                    Real-time vector badge preview as you customize styles below.
                                </p>
                            </div>

                            {/* Simulated Poster Card */}
                            <div className="relative w-[240px] h-[360px] rounded-xl overflow-hidden shadow-2xl border-2 border-slate-700/80 bg-slate-950 group">
                                {/* Sample Backdrop Image */}
                                <img 
                                    src="https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80" 
                                    alt="Poster Preview" 
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                />

                                {/* Simulated Leaving Soon Banner */}
                                {simLeavingSoon && (
                                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-red-700 via-red-600 to-red-700 py-1 px-2 text-center text-[10px] font-black tracking-widest text-white shadow-lg border-b border-red-400 flex items-center justify-center gap-1">
                                        <AlertTriangle className="h-3 w-3" /> LEAVING SOON • 5 DAYS
                                    </div>
                                )}

                                {/* Simulated Badges Container */}
                                <div className={`absolute ${simLeavingSoon ? 'top-8' : 'top-2.5'} ${simPosition.includes('left') ? 'left-2.5' : 'right-2.5'} flex flex-col gap-1.5 items-${simPosition.includes('left') ? 'start' : 'end'}`}>
                                    {/* Resolution Badge */}
                                    {simResolution !== "none" && (
                                        <div className={`px-2 py-0.5 rounded-md border text-[10px] font-black tracking-wider flex items-center gap-1 shadow-md ${
                                            simTheme === "gold" 
                                                ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-black border-yellow-200' 
                                                : 'bg-slate-950/90 text-white border-amber-400/80'
                                        }`}>
                                            <span>4K</span>
                                            <span className="text-[8px] opacity-70 border-l border-current pl-1 ml-0.5">UHD</span>
                                        </div>
                                    )}

                                    {/* HDR Badge */}
                                    {simHdr !== "none" && (
                                        <div className="px-2 py-0.5 rounded-md border border-purple-400/80 bg-slate-950/90 text-purple-200 text-[9px] font-black tracking-widest shadow-md">
                                            DOLBY VISION
                                        </div>
                                    )}

                                    {/* Audio Badge */}
                                    {simAudio !== "none" && (
                                        <div className="px-2 py-0.5 rounded-md border border-sky-400/80 bg-slate-950/90 text-sky-200 text-[9px] font-black tracking-widest shadow-md">
                                            DOLBY ATMOS
                                        </div>
                                    )}
                                </div>

                                {/* Simulated Ratings Badge */}
                                {simRatings && (
                                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-950/90 border border-slate-600/80 shadow-lg text-[10px]">
                                        <div className="bg-yellow-400 text-black font-black px-1 rounded text-[9px]">IMDb</div>
                                        <span className="font-bold text-white">8.6</span>
                                        <span className="text-xs">🍅</span>
                                        <span className="font-bold text-white">94%</span>
                                    </div>
                                )}
                            </div>

                            {/* Backup Vault Status Pill */}
                            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
                                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Pristine Original Backups: <strong className="text-white">{backupsCount}</strong> in vault</span>
                            </div>
                        </div>

                        {/* Controls & Batch Execution */}
                        <div className="lg:col-span-7 space-y-4">
                            <Card className="bg-slate-900/60 border-slate-800">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                        <Sliders className="h-4 w-4 text-purple-400" /> Overlay Badges & Positioning
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Toggle badge layers on/off and choose placement style.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 space-y-4 text-xs">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">4K UHD Resolution</Label>
                                                <p className="text-[10px] text-slate-400">Auto-detects 2160p / 4K stream</p>
                                            </div>
                                            <Switch 
                                                checked={simResolution !== "none"} 
                                                onCheckedChange={checked => setSimResolution(checked ? "4K" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Dolby Vision & HDR</Label>
                                                <p className="text-[10px] text-slate-400">Auto-detects dynamic color profile</p>
                                            </div>
                                            <Switch 
                                                checked={simHdr !== "none"} 
                                                onCheckedChange={checked => setSimHdr(checked ? "DV" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Dolby Atmos & TrueHD</Label>
                                                <p className="text-[10px] text-slate-400">Auto-detects object spatial audio</p>
                                            </div>
                                            <Switch 
                                                checked={simAudio !== "none"} 
                                                onCheckedChange={checked => setSimAudio(checked ? "ATMOS" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">IMDb & RT Ratings</Label>
                                                <p className="text-[10px] text-slate-400">Displays critic & audience scores</p>
                                            </div>
                                            <Switch 
                                                checked={simRatings} 
                                                onCheckedChange={setSimRatings} 
                                            />
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3 pt-2">
                                        <div className="space-y-1">
                                            <Label className="text-slate-300">Badge Theme</Label>
                                            <Select value={simTheme} onValueChange={(val: any) => setSimTheme(val)}>
                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="glass">Dark Glass Minimal</SelectItem>
                                                    <SelectItem value="gold">Metallic Gold 4K</SelectItem>
                                                    <SelectItem value="classic">Classic Solid Slate</SelectItem>
                                                    <SelectItem value="minimal">Ultra Minimal</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-slate-300">Badge Position</Label>
                                            <Select value={simPosition} onValueChange={(val: any) => setSimPosition(val)}>
                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="top-right">Top Right Corner</SelectItem>
                                                    <SelectItem value="top-left">Top Left Corner</SelectItem>
                                                    <SelectItem value="bottom-right">Bottom Right Corner</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="p-4 pt-0 flex flex-col gap-2">
                                    {overlayMessage && (
                                        <div className={`w-full text-xs p-2.5 rounded-lg flex items-center gap-2 ${overlayMessage.success ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-800' : 'bg-rose-950/70 text-rose-300 border border-rose-800'}`}>
                                            {overlayMessage.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                            <span>{overlayMessage.text}</span>
                                        </div>
                                    )}

                                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full">
                                        <Button 
                                            disabled={applyingOverlays} 
                                            onClick={handleApplyOverlays}
                                            className="w-full sm:flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-9 gap-1.5 shadow-lg shadow-purple-950/30"
                                        >
                                            {applyingOverlays ? (
                                                <>
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                    <span>Applying Overlays to Plex...</span>
                                                </>
                                            ) : (
                                                <>
                                                    <Sparkles className="h-4 w-4" />
                                                    <span>Apply Overlays to Library</span>
                                                </>
                                            )}
                                        </Button>

                                        <Button 
                                            variant="outline" 
                                            disabled={revertingOverlays || backupsCount === 0} 
                                            onClick={handleRevertOverlays}
                                            className="w-full sm:w-auto border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold text-xs h-9 gap-1.5"
                                        >
                                            {revertingOverlays ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Undo2 className="h-4 w-4 text-emerald-400" />
                                            )}
                                            <span>Restore Originals ({backupsCount})</span>
                                        </Button>
                                    </div>
                                </CardFooter>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 3: UPCOMING & DIGITAL RELEASES (AGREGARR REPLACEMENT) */}
                {/* ========================================================================= */}
                <TabsContent value="releases" className="space-y-6">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/50 border border-slate-800 rounded-xl">
                        <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-emerald-400" /> Theatrical vs. Digital Streaming Release Calendar
                            </h3>
                            <p className="text-xs text-slate-400">
                                Know the exact date movies transition from cinema screens to home digital streaming platforms.
                            </p>
                        </div>
                        <div className="flex items-center gap-1.5 bg-slate-800/80 p-1 rounded-lg border border-slate-700 text-xs">
                            <Button 
                                size="sm" 
                                variant={releaseFilter === "all" ? "default" : "ghost"} 
                                onClick={() => setReleaseFilter("all")}
                                className="h-7 text-xs px-2.5"
                            >
                                All Releases
                            </Button>
                            <Button 
                                size="sm" 
                                variant={releaseFilter === "digital" ? "default" : "ghost"} 
                                onClick={() => setReleaseFilter("digital")}
                                className="h-7 text-xs px-2.5 text-purple-300"
                            >
                                ✨ Digital Streaming
                            </Button>
                            <Button 
                                size="sm" 
                                variant={releaseFilter === "theatrical" ? "default" : "ghost"} 
                                onClick={() => setReleaseFilter("theatrical")}
                                className="h-7 text-xs px-2.5 text-sky-300"
                            >
                                🎬 Theatrical
                            </Button>
                        </div>
                    </div>

                    {releasesLoading ? (
                        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
                            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            <p className="text-xs font-medium">Fetching TMDb & Trakt release schedules...</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                            {(releaseFilter === "digital" 
                                ? releasesData.digitalStreaming 
                                : releaseFilter === "theatrical" 
                                    ? releasesData.theatricalUpcoming 
                                    : [...releasesData.digitalStreaming, ...releasesData.theatricalUpcoming]
                            ).map((movie: any, idx: number) => {
                                const isDigital = Boolean(movie.digitalReleaseDate);
                                return (
                                    <div key={idx} className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-lg flex flex-col justify-between group hover:border-purple-500/40 transition-all">
                                        <div className="relative aspect-[2/3] bg-slate-950 overflow-hidden">
                                            {movie.posterPath ? (
                                                <img 
                                                    src={`https://image.tmdb.org/t/p/w500${movie.posterPath}`} 
                                                    alt={movie.title} 
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                            ) : (
                                                <div className="w-full h-full flex items-center justify-center text-slate-600">
                                                    <Film className="h-8 w-8" />
                                                </div>
                                            )}

                                            {/* Status Badge Ribbon */}
                                            {isDigital ? (
                                                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-indigo-600 via-purple-600 to-indigo-600 py-0.5 px-1.5 text-center text-[9px] font-black text-white uppercase tracking-wider">
                                                    ✨ DIGITAL STREAMING
                                                </div>
                                            ) : (
                                                <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-sky-700 via-blue-600 to-sky-700 py-0.5 px-1.5 text-center text-[9px] font-black text-white uppercase tracking-wider">
                                                    🎬 THEATRICAL
                                                </div>
                                            )}
                                        </div>

                                        <div className="p-2.5 space-y-1">
                                            <h4 className="text-xs font-bold text-white line-clamp-1 group-hover:text-purple-300 transition-colors">
                                                {movie.title}
                                            </h4>
                                            <div className="text-[10px] text-slate-400 flex items-center justify-between">
                                                <span>{movie.digitalReleaseDate || movie.theatricalReleaseDate || "Coming Soon"}</span>
                                                {movie.voteAverage && (
                                                    <span className="text-amber-400 font-bold flex items-center gap-0.5">
                                                        ★ {movie.voteAverage.toFixed(1)}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 4: LEAVING SOON & DISK PRUNING MANAGER (AGREGARR REPLACEMENT) */}
                {/* ========================================================================= */}
                <TabsContent value="pruning" className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Storage Threshold & Webhook Guide */}
                        <div className="lg:col-span-5 space-y-4">
                            <Card className="bg-slate-900/60 border-slate-800">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                        <HardDrive className="h-4 w-4 text-rose-400" /> Array Pruning & Webhook
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Integrate Maintainerr, bash cron jobs, or Radarr/Sonarr unmonitor scripts.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 space-y-3 text-xs">
                                    <div className="space-y-1">
                                        <Label className="text-slate-300">Storage Warning Free Space Threshold</Label>
                                        <div className="flex items-center gap-2">
                                            <Input 
                                                type="number" 
                                                value={settings.leavingSoonDiskThreshold || 15} 
                                                onChange={e => setSettings({ ...settings, leavingSoonDiskThreshold: parseInt(e.target.value, 10) })}
                                                className="bg-slate-800 border-slate-700 text-xs h-8 w-24" 
                                            />
                                            <span className="text-slate-400">% free space remaining</span>
                                        </div>
                                    </div>

                                    <div className="space-y-1 pt-2">
                                        <Label className="text-slate-300">Leaving Soon Webhook Endpoint</Label>
                                        <div className="flex items-center gap-1.5">
                                            <Input 
                                                readOnly 
                                                value={typeof window !== "undefined" ? `${window.location.origin}/api/curation/leaving-soon` : "/api/curation/leaving-soon"}
                                                className="bg-slate-950 border-slate-800 text-[11px] font-mono text-slate-300 h-8"
                                            />
                                            <Button 
                                                size="sm" 
                                                variant="outline" 
                                                onClick={() => {
                                                    navigator.clipboard.writeText(`${window.location.origin}/api/curation/leaving-soon`);
                                                    setCopiedWebhook(true);
                                                    setTimeout(() => setCopiedWebhook(false), 2500);
                                                }}
                                                className="h-8 px-2 border-slate-700"
                                            >
                                                {copiedWebhook ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                            </Button>
                                        </div>
                                        <p className="text-[10px] text-slate-500">
                                            Send POST JSON with <code>{`{ "ratingKey": "1234", "daysRemaining": 7, "reason": "Low disk space" }`}</code>
                                        </p>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>

                        {/* Active Leaving Soon Queue */}
                        <div className="lg:col-span-7 space-y-4">
                            <Card className="bg-slate-900/60 border-slate-800">
                                <CardHeader className="p-4 pb-2 flex flex-row items-center justify-between">
                                    <div>
                                        <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                            <AlertTriangle className="h-4 w-4 text-amber-400" /> Scheduled for Removal ({leavingSoonItems.length})
                                        </CardTitle>
                                        <CardDescription className="text-xs text-slate-400">
                                            Items tagged with warning ribbons and auto-added to the Leaving Soon Plex collection.
                                        </CardDescription>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-4 space-y-2 text-xs">
                                    {leavingSoonItems.length === 0 ? (
                                        <div className="text-center py-8 text-slate-500 text-xs">
                                            No media items currently marked as leaving soon.
                                        </div>
                                    ) : (
                                        <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
                                            {leavingSoonItems.map((item) => (
                                                <div key={item.id} className="flex items-center justify-between p-2.5 bg-slate-800/60 border border-slate-700/60 rounded-lg">
                                                    <div className="space-y-0.5">
                                                        <h4 className="font-bold text-white text-xs">{item.title || item.ratingKey}</h4>
                                                        <p className="text-[10px] text-slate-400">
                                                            {item.leavingReason || "Disk pruning"} • Scheduled: {new Date(item.leavingSoonDate).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={async () => {
                                                            await unmarkItemLeavingSoonAction(item.ratingKey, item.serverId);
                                                            await loadData();
                                                        }}
                                                        className="text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 text-xs h-7 px-2"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Unmark
                                                    </Button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 5: PERSONAL CONTENT FILTERS & PARENTAL CONTROLS */}
                {/* ========================================================================= */}
                <TabsContent value="preferences" className="space-y-6">
                    <Card className="bg-slate-900/60 border-slate-800">
                        <CardHeader className="p-6 pb-2">
                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Filter className="h-5 w-5 text-indigo-400" /> Personalized Movie & TV Content Filters
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Customize your personal dashboard and Plex view by filtering out unwanted genres, extreme content advisories, or leaving soon items.
                            </CardDescription>
                        </CardHeader>

                        <CardContent className="p-6 space-y-6 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white flex items-center gap-1.5">
                                            <Ghost className="h-3.5 w-3.5 text-purple-400" /> Hide Horror
                                        </Label>
                                        <p className="text-[10px] text-slate-400">Filter out horror movies</p>
                                    </div>
                                    <Switch 
                                        checked={userPrefs.hideHorror} 
                                        onCheckedChange={checked => setUserPrefs({ ...userPrefs, hideHorror: checked })} 
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white flex items-center gap-1.5">
                                            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" /> Hide Extreme Gore
                                        </Label>
                                        <p className="text-[10px] text-slate-400">Filter out violent/gore tags</p>
                                    </div>
                                    <Switch 
                                        checked={userPrefs.hideGore} 
                                        onCheckedChange={checked => setUserPrefs({ ...userPrefs, hideGore: checked })} 
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white flex items-center gap-1.5">
                                            <HeartOff className="h-3.5 w-3.5 text-pink-400" /> Hide NSFW / Nudity
                                        </Label>
                                        <p className="text-[10px] text-slate-400">Filter out explicit advisories</p>
                                    </div>
                                    <Switch 
                                        checked={userPrefs.hideNsfw} 
                                        onCheckedChange={checked => setUserPrefs({ ...userPrefs, hideNsfw: checked })} 
                                    />
                                </div>

                                <div className="flex items-center justify-between p-3 bg-slate-800/60 rounded-xl border border-slate-700/60">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white flex items-center gap-1.5">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" /> Hide Leaving Soon
                                        </Label>
                                        <p className="text-[10px] text-slate-400">Omit prune queue cards</p>
                                    </div>
                                    <Switch 
                                        checked={userPrefs.hideLeavingSoon} 
                                        onCheckedChange={checked => setUserPrefs({ ...userPrefs, hideLeavingSoon: checked })} 
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 font-semibold">Maximum Content Rating Allowed</Label>
                                    <Select 
                                        value={userPrefs.maxContentRating} 
                                        onValueChange={val => setUserPrefs({ ...userPrefs, maxContentRating: val })}
                                    >
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="ALL">All Ratings (Unrestricted)</SelectItem>
                                            <SelectItem value="PG-13">PG-13 / TV-14 and under</SelectItem>
                                            <SelectItem value="PG">PG / TV-PG and under</SelectItem>
                                            <SelectItem value="G">G / TV-G Only (Family Safe)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardContent>

                        <CardFooter className="p-6 pt-0 flex items-center justify-between">
                            {prefsSavedMsg && (
                                <div className="text-xs text-emerald-400 flex items-center gap-1.5">
                                    <CheckCircle2 className="h-4 w-4" /> Preferences saved successfully!
                                </div>
                            )}
                            <div className="ml-auto">
                                <Button 
                                    disabled={savingPrefs} 
                                    onClick={handleSaveUserPrefs}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-9 px-4 gap-1.5"
                                >
                                    {savingPrefs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    <span>Save Content Filters</span>
                                </Button>
                            </div>
                        </CardFooter>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
