"use client";

import React, { useState, useEffect, useTransition } from "react";
import {
    Film,
    Tv,
    Trophy,
    Star,
    Zap,
    Sparkles,
    Calendar,
    Clock,
    Clock3,
    Power,
    Plus,
    Trash2,
    RefreshCw,
    Sliders,
    Eye,
    Save,
    Check,
    X,
    FolderOpen,
    Loader2,
    CheckCircle2,
    XCircle,
    HardDrive,
    TrendingUp,
    Flame,
    Layers,
    MoveUp,
    MoveDown,
    Search,
    ChevronUp,
    ChevronDown,
    CalendarClock,
    FolderCheck,
    Image as ImageIcon,
    Tag,
    Edit2,
    Compass,
    Info,
    RotateCcw,
    Home,
    Users,
    Settings2,
    SlidersHorizontal,
    SunMedium,
    MoonStar,
    CheckSquare,
    Square,
    Bookmark,
    Monitor,
    Shield,
    ShieldCheck,
    ShieldAlert,
    Play
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CurationNavHeader } from "./curation-nav-header";
import { PlexPosterPickerModal } from "./plex-poster-picker-modal";
import { PlexMediaStreamInfo } from "@/lib/curation/plex-analyzer";
import {
    getPlexServersAndSectionsAction,
    getPlexServerSectionsAction,
    getMediaCollectionsAction,
    importPlexLibraryCollectionsAction,
    saveMediaCollectionAction,
    syncCollectionToPlexAction,
    deleteMediaCollectionAction,
    reorderPlexCollectionsAction,
    toggleCollectionVisibilityAction,
    toggleCollectionPlaceholdersAction,
    generateCollectionPlaceholdersAction,
    updateCollectionPlacementAction,
    syncSeasonalAndScheduledCollectionsAction,
    previewCollectionMatchingAction,
    getTrendingAndPlaceholderMediaAction,
    getPlaceholderPreviewDataUrlAction,
    createPlaceholderItemAction,
    getTmdbTrailerAction,
    saveComingSoonSharesAction,
    validateDirectoryPathAction,
    cleanupAvailablePlaceholdersAction,
    getCurationSettingsAction,
    saveCurationSettingsAction,
    toggleCurationLibrarySectionAction,
    toggleAllCurationServerSectionsAction,
    runFullCurationSyncAction
} from "@/app/curation-actions";
import {
    COLLECTION_PRESETS,
    CollectionPreset
} from "@/lib/curation/presets";

export const AGREGARR_BANNER_PRESETS = [
    { id: "downloading_soon", label: "⏳ Downloading Soon", defaultText: "DOWNLOADING SOON", theme: "amber-gold", pos: "bottom" as const },
    { id: "in_radarr", label: "🎬 Monitored in Radarr", defaultText: "MONITORED IN RADARR", theme: "amber-gold", pos: "bottom" as const },
    { id: "in_sonarr", label: "📺 Monitored in Sonarr", defaultText: "MONITORED IN SONARR", theme: "cinematic-blue", pos: "bottom" as const },
    { id: "digital_release", label: "⚡ Digital Release on {date}", defaultText: "DIGITAL RELEASE ON {date}", theme: "cinematic-blue", pos: "bottom" as const },
    { id: "countdown", label: "⏳ Streaming in {days} Days", defaultText: "STREAMING IN {days} DAYS", theme: "indigo-purple", pos: "bottom" as const },
    { id: "in_theaters", label: "🍿 In Theaters", defaultText: "IN THEATERS", theme: "amber-gold", pos: "bottom" as const },
    { id: "leaving_date", label: "⚠️ Leaving on {date}", defaultText: "LEAVING ON {date}", theme: "crimson-red", pos: "bottom" as const },
    { id: "leaving_days", label: "⚠️ Leaving in {days} Days", defaultText: "LEAVING IN {days} DAYS", theme: "crimson-red", pos: "bottom" as const },
    { id: "trending_not_requested", label: "🔥 Trending • Not Requested", defaultText: "TRENDING • NOT REQUESTED", theme: "crimson-red", pos: "bottom" as const },
    { id: "popular_streaming", label: "✨ Popular on {source}", defaultText: "POPULAR ON {source}", theme: "indigo-purple", pos: "bottom" as const },
    { id: "missing_library", label: "❌ Missing from Library", defaultText: "MISSING FROM LIBRARY", theme: "crimson-red", pos: "bottom" as const },
    { id: "custom", label: "⚙️ Custom Template", defaultText: "{title} • {status}", theme: "cyber-neon", pos: "bottom" as const }
];

interface PlexServerItem {
    serverId: string;
    serverName: string;
    sections?: Array<{ key: string | number; title: string; type: string }>;
}

export function AgregarrStudio() {
    const [subTab, setSubTab] = useState<"collections" | "trending" | "releases" | "placeholders">("collections");
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();

    // Server & Section Navigation
    const [servers, setServers] = useState<PlexServerItem[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>("");
    const [selectedSectionKey, setSelectedSectionKey] = useState<string>("");
    const [serverSectionsLoading, setServerSectionsLoading] = useState(false);

    // Collections & Ordering
    const [collections, setCollections] = useState<any[]>([]);
    const [collectionsLoading, setCollectionsLoading] = useState(false);
    const [syncingCollId, setSyncingCollId] = useState<string | null>(null);
    const [syncMessage, setSyncMessage] = useState<{ id: string; success: boolean; text: string } | null>(null);
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [newCollTitle, setNewCollTitle] = useState("");
    const [newCollSummary, setNewCollSummary] = useState("");
    const [newCollSourceType, setNewCollSourceType] = useState("tmdb");
    const [newCollSourceQuery, setNewCollSourceQuery] = useState("");
    const [newCollPosterUrl, setNewCollPosterUrl] = useState("");
    const [newCollIsSeasonal, setNewCollIsSeasonal] = useState(false);
    const [newCollStartMonth, setNewCollStartMonth] = useState(10);
    const [newCollStartDay, setNewCollStartDay] = useState(1);
    const [newCollEndMonth, setNewCollEndMonth] = useState(11);
    const [newCollEndDay, setNewCollEndDay] = useState(5);

    // Collection Ordering & Seasonal Sync States
    const [savingOrder, setSavingOrder] = useState(false);
    const [orderSavedMsg, setOrderSavedMsg] = useState<string | null>(null);
    const [syncingSeasonal, setSyncingSeasonal] = useState(false);
    const [seasonalSyncMsg, setSeasonalSyncMsg] = useState<{ success: boolean; text: string } | null>(null);
    const [importingPlexCollections, setImportingPlexCollections] = useState(false);
    const [plexImportMsg, setPlexImportMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Preset Blueprint Inspection & Live Preview States
    const [inspectModalOpen, setInspectModalOpen] = useState(false);
    const [inspectingPreset, setInspectingPreset] = useState<CollectionPreset | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewData, setPreviewData] = useState<{ totalEvaluated: number; matchCount: number; executionMethod: string; sampleMatches: any[] } | null>(null);
    const [inspectHome, setInspectHome] = useState(true);
    const [inspectShared, setInspectShared] = useState(true);
    const [inspectRecommended, setInspectRecommended] = useState(true);
    const [inspectMode, setInspectMode] = useState<string>("default");
    const [inspectMaxItems, setInspectMaxItems] = useState<number>(0);
    const [inspectExcludedLabels, setInspectExcludedLabels] = useState<string>("");
    const [inspectIncludePlaceholders, setInspectIncludePlaceholders] = useState<boolean>(false);

    // Comprehensive Placement & Visibility Modal States (Where collections show up in Plex)
    const [placementModalOpen, setPlacementModalOpen] = useState(false);
    const [editingCollection, setEditingCollection] = useState<any | null>(null);
    const [placementHome, setPlacementHome] = useState(true);
    const [placementShared, setPlacementShared] = useState(true);
    const [placementRecommended, setPlacementRecommended] = useState(true);
    const [placementMode, setPlacementMode] = useState<string>("default");
    const [placementOrderIndex, setPlacementOrderIndex] = useState<number>(1);
    const [placementSortPrefix, setPlacementSortPrefix] = useState<string>("!01_");
    const [placementActiveDays, setPlacementActiveDays] = useState<string>("all");
    const [placementActiveTimeRange, setPlacementActiveTimeRange] = useState<string>("all_day");
    const [placementIsSeasonal, setPlacementIsSeasonal] = useState(false);
    const [placementStartMonth, setPlacementStartMonth] = useState(10);
    const [placementStartDay, setPlacementStartDay] = useState(1);
    const [placementEndMonth, setPlacementEndMonth] = useState(11);
    const [placementEndDay, setPlacementEndDay] = useState(5);
    const [placementSeasonalAction, setPlacementSeasonalAction] = useState<string>("promote_hide");
    const [placementMaxItems, setPlacementMaxItems] = useState<number>(0);
    const [placementExcludedLabels, setPlacementExcludedLabels] = useState<string>("");
    const [placementIncludePlaceholders, setPlacementIncludePlaceholders] = useState<boolean>(false);
    const [savingPlacement, setSavingPlacement] = useState(false);
    const [placementSavedMsg, setPlacementSavedMsg] = useState<string | null>(null);

    // Collection Level Direct Placeholder Generation Loading States
    const [generatingCollPlaceholdersId, setGeneratingCollPlaceholdersId] = useState<string | null>(null);
    const [collPlaceholderMsg, setCollPlaceholderMsg] = useState<{ id: string; success: boolean; text: string } | null>(null);

    // Create Modal Placement Controls
    const [newCollPromotedHome, setNewCollPromotedHome] = useState(true);
    const [newCollPromotedShared, setNewCollPromotedShared] = useState(true);
    const [newCollPromotedRecommended, setNewCollPromotedRecommended] = useState(true);
    const [newCollMode, setNewCollMode] = useState<string>("default");
    const [newCollActiveDays, setNewCollActiveDays] = useState<string>("all");
    const [newCollActiveTimeRange, setNewCollActiveTimeRange] = useState<string>("all_day");
    const [newCollMaxItems, setNewCollMaxItems] = useState<number>(0);
    const [newCollExcludedLabels, setNewCollExcludedLabels] = useState<string>("");
    const [newCollIncludePlaceholders, setNewCollIncludePlaceholders] = useState<boolean>(false);

    // YouTube Trailer Player Modal States
    const [trailerModalOpen, setTrailerModalOpen] = useState(false);
    const [trailerLoading, setTrailerLoading] = useState(false);
    const [activeTrailer, setActiveTrailer] = useState<any | null>(null);
    const [activeTrailerTitle, setActiveTrailerTitle] = useState<string>("");

    // Trending Media & Placeholder Hub States
    const [trendingCategory, setTrendingCategory] = useState<"all" | "disney" | "disney_kids" | "netflix" | "netflix_kids" | "digital" | "theatrical">("all");
    const [trendingMedia, setTrendingMedia] = useState<any[]>([]);
    const [trendingLoading, setTrendingLoading] = useState(false);
    const [trendingSearchQuery, setTrendingSearchQuery] = useState("");
    const [trendingLibraryFilter, setTrendingLibraryFilter] = useState<"all" | "in_library" | "missing">("all");
    const [placeholderModalOpen, setPlaceholderModalOpen] = useState(false);
    const [selectedPlaceholderItem, setSelectedPlaceholderItem] = useState<any | null>(null);
    const [placeholderModalBannerType, setPlaceholderModalBannerType] = useState<string>("not_requested");
    const [placeholderModalBannerText, setPlaceholderModalBannerText] = useState("NOT REQUESTED");
    const [placeholderModalBannerTheme, setPlaceholderModalBannerTheme] = useState<string>("crimson-red");
    const [placeholderModalBannerPosition, setPlaceholderModalBannerPosition] = useState<"bottom" | "top" | "corner">("bottom");
    const [generatingPlaceholder, setGeneratingPlaceholder] = useState(false);
    const [placeholderPreviewDataUrl, setPlaceholderPreviewDataUrl] = useState<string | null>(null);
    const [placeholderPreviewLoading, setPlaceholderPreviewLoading] = useState<boolean>(false);
    const [placeholderSuccessMsg, setPlaceholderSuccessMsg] = useState<string | null>(null);

    // Live Simulator & Template Variable States
    const [posterPickerModalOpen, setPosterPickerModalOpen] = useState(false);
    const [simSelectedRealItem, setSimSelectedRealItem] = useState<PlexMediaStreamInfo | null>(null);
    const [simPosterUrl, setSimPosterUrl] = useState<string>("https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80");
    const [templateVarDate, setTemplateVarDate] = useState<string>("6/1/2026");
    const [templateVarDays, setTemplateVarDays] = useState<number>(7);
    const [templateVarSource, setTemplateVarSource] = useState<string>("Netflix");
    const [templateVarStatus, setTemplateVarStatus] = useState<string>("Downloading Soon");
    const [templateVarReason, setTemplateVarReason] = useState<string>("Storage Optimization");

    // Coming Soon Shares & Disk Settings
    const [comingSoonShares, setComingSoonShares] = useState<Record<string, string>>({});
    const [savingShares, setSavingShares] = useState(false);
    const [sharesSavedMsg, setSharesSavedMsg] = useState(false);
    const [pathCheckResults, setPathCheckResults] = useState<Record<string, { checking: boolean; success?: boolean; msg?: string }>>({});
    const [cleaningPlaceholders, setCleaningPlaceholders] = useState(false);
    const [cleanupResultMsg, setCleanupResultMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Automated Schedule & Enabled Library States
    const [curationSyncCollections, setCurationSyncCollections] = useState<boolean>(true);
    const [curationSyncSchedule, setCurationSyncSchedule] = useState<string>("every_6_hours");
    const [curationLastRunAt, setCurationLastRunAt] = useState<string | null>(null);
    const [curationLastRunStatus, setCurationLastRunStatus] = useState<any | null>(null);
    const [enabledServersForCollections, setEnabledServersForCollections] = useState<string[]>([]);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
    const [runningCollectionSync, setRunningCollectionSync] = useState(false);
    const [collectionSyncResult, setCollectionSyncResult] = useState<{ success: boolean; text: string; details?: string[] } | null>(null);

    // Check if a section is enabled for collections
    const isSectionEnabled = (srvId: string, secKey: string): boolean => {
        if (!enabledServersForCollections || enabledServersForCollections.length === 0) return true;
        if (enabledServersForCollections.includes(`disabled:${srvId}`) || enabledServersForCollections.includes(`${srvId}:none`)) return false;
        if (enabledServersForCollections.includes(`disabled:${srvId}:${secKey}`)) return false;
        const compoundKey = `${srvId}:${secKey}`;
        if (enabledServersForCollections.includes(compoundKey)) return true;
        const hasServerEntries = enabledServersForCollections.some(k => k === srvId || k.startsWith(`${srvId}:`) || k.startsWith(`disabled:${srvId}`));
        if (hasServerEntries) {
            if (enabledServersForCollections.includes(srvId) && !enabledServersForCollections.some(k => k.startsWith(`${srvId}:`))) return true;
            return false;
        }
        return true;
    };

    // Toggle a section enabled/disabled for collections
    const handleToggleSection = async (secKey: string) => {
        const currentlyEnabled = isSectionEnabled(selectedServerId, secKey);
        const nextEnabled = !currentlyEnabled;
        const currentSections = servers.find(s => s.serverId === selectedServerId)?.sections || [];
        const allSecKeys = currentSections.map(s => String(s.key));

        try {
            const res = await toggleCurationLibrarySectionAction("agregarr", selectedServerId, secKey, nextEnabled, allSecKeys);
            if (res.success && res.enabledList) {
                setEnabledServersForCollections(res.enabledList);
            }
        } catch (e) {
            console.error("Failed toggling section collection state:", e);
        }
    };

    // Toggle ALL sections on the selected server for Agregarr (Enable All / Disable All)
    const handleToggleAllSectionsOnServer = async (enableAll: boolean) => {
        const currentSections = servers.find(s => s.serverId === selectedServerId)?.sections || [];
        const allSecKeys = currentSections.map(s => String(s.key));
        try {
            const res = await toggleAllCurationServerSectionsAction("agregarr", selectedServerId, enableAll, allSecKeys);
            if (res.success && res.enabledList) {
                setEnabledServersForCollections(res.enabledList);
            }
        } catch (e) {
            console.error("Failed toggling all server sections for collections:", e);
        }
    };

    // Save schedule settings
    const handleSaveSchedule = async () => {
        setSavingSchedule(true);
        setScheduleSavedMsg(false);
        try {
            const res = await saveCurationSettingsAction({
                curationSyncCollections,
                curationSyncSchedule
            });
            if (res.success) {
                setScheduleSavedMsg(true);
                setTimeout(() => setScheduleSavedMsg(false), 3000);
            }
        } catch (e) {
            console.error("Failed saving schedule:", e);
        } finally {
            setSavingSchedule(false);
        }
    };

    // Run collection sync job now
    const handleRunCollectionSync = async () => {
        setRunningCollectionSync(true);
        setCollectionSyncResult(null);
        try {
            const res = await syncSeasonalAndScheduledCollectionsAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setCollectionSyncResult({
                    success: true,
                    text: `Synced Collections & Hubs successfully: ${res.evaluatedCount ?? 0} rules evaluated.`
                });
                loadCollections();
            } else {
                setCollectionSyncResult({
                    success: false,
                    text: res.error || "Failed running collection sync."
                });
            }
        } catch (e: any) {
            setCollectionSyncResult({
                success: false,
                text: e.message || "An error occurred during sync."
            });
        } finally {
            setRunningCollectionSync(false);
        }
    };

    // Manual Trigger: Cleanup Acquired Placeholders from Coming Soon Shares
    const handleCleanupPlaceholders = async () => {
        setCleaningPlaceholders(true);
        setCleanupResultMsg(null);
        try {
            const res = await cleanupAvailablePlaceholdersAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setCleanupResultMsg({
                    success: true,
                    text: res.message || `Cleaned up ${res.removedCount} acquired placeholder(s)!`
                });
            } else {
                setCleanupResultMsg({
                    success: false,
                    text: res.message || "Failed cleaning placeholders."
                });
            }
            setTimeout(() => setCleanupResultMsg(null), 6000);
        } catch (err: any) {
            setCleanupResultMsg({
                success: false,
                text: err.message || "Failed cleaning placeholders."
            });
        } finally {
            setCleaningPlaceholders(false);
        }
    };

    // Initial Data Fetch
    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            try {
                const srvRes = await getPlexServersAndSectionsAction();
                if (srvRes.success && srvRes.servers && srvRes.servers.length > 0) {
                    setServers(srvRes.servers);
                    const firstServer = srvRes.servers[0];
                    setSelectedServerId(firstServer.serverId);
                    if (firstServer.sections && firstServer.sections.length > 0) {
                        setSelectedSectionKey(String(firstServer.sections[0].key));
                        loadCollections(firstServer.serverId, String(firstServer.sections[0].key));
                    }
                }

                const settingsRes = await getCurationSettingsAction();
                if (settingsRes.success) {
                    if (settingsRes.comingSoonShares) setComingSoonShares(settingsRes.comingSoonShares);
                    setCurationSyncCollections(settingsRes.curationSyncCollections ?? true);
                    setCurationSyncSchedule(settingsRes.curationSyncSchedule || "every_6_hours");
                    setCurationLastRunAt(settingsRes.curationLastRunAt || null);
                    setCurationLastRunStatus(settingsRes.curationLastRunStatus || null);
                    if (settingsRes.enabledServersForCollections) {
                        setEnabledServersForCollections(settingsRes.enabledServersForCollections);
                    }
                }
            } catch (err) {
                console.error("Failed loading Agregarr studio data:", err);
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, []);

    // Load Collections for Server & Section
    const loadCollections = async (srvId?: string, secKey?: string) => {
        setCollectionsLoading(true);
        try {
            const res = await getMediaCollectionsAction(srvId || selectedServerId, secKey || selectedSectionKey);
            if (res.success && res.collections) {
                setCollections(res.collections);
            }
        } catch (e) {
            console.error("Failed loading collections:", e);
        } finally {
            setCollectionsLoading(false);
        }
    };

    // Server / Section Switch
    const handleSelectServer = async (srvId: string) => {
        setSelectedServerId(srvId);
        const srv = servers.find(s => s.serverId === srvId);
        let srvSections = srv?.sections || [];

        if (srvSections.length === 0) {
            setServerSectionsLoading(true);
            try {
                const secRes = await getPlexServerSectionsAction(srvId);
                if (secRes?.success && Array.isArray(secRes.sections) && secRes.sections.length > 0) {
                    srvSections = secRes.sections as any;
                    setServers(prev => prev.map(s => s.serverId === srvId ? { ...s, sections: (secRes.sections as any) || [] } : s));
                }
            } catch (e) {
                console.error("Failed loading server sections:", e);
            } finally {
                setServerSectionsLoading(false);
            }
        }

        if (srvSections.length > 0) {
            const hasExisting = srvSections.some((sec: any) => String(sec.key) === selectedSectionKey);
            const nextSecKey = hasExisting ? selectedSectionKey : String(srvSections[0].key);
            setSelectedSectionKey(nextSecKey);
            loadCollections(srvId, nextSecKey);
        } else {
            setSelectedSectionKey("");
            setCollections([]);
        }
    };

    const handleSelectSection = async (secKey: string) => {
        setSelectedSectionKey(secKey);
        loadCollections(selectedServerId, secKey);
    };

    // Load Trending Media when Tab Changes
    useEffect(() => {
        if (subTab === "trending" || subTab === "releases" || subTab === "placeholders") {
            loadTrendingMedia(trendingCategory);
        }
    }, [subTab, trendingCategory, selectedServerId, selectedSectionKey]);

    const loadTrendingMedia = async (cat = trendingCategory) => {
        setTrendingLoading(true);
        try {
            const res = await getTrendingAndPlaceholderMediaAction(selectedServerId, selectedSectionKey, cat);
            if (res.success && res.items) {
                setTrendingMedia(res.items);
            }
        } catch (e) {
            console.error("Failed loading trending media:", e);
        } finally {
            setTrendingLoading(false);
        }
    };

    // Reorder Collections Handlers
    const handleMoveCollection = (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= collections.length) return;

        const copy = [...collections];
        const temp = copy[index];
        copy[index] = copy[targetIndex];
        copy[targetIndex] = temp;

        // Re-assign order indices
        const reordered = copy.map((c, i) => ({
            ...c,
            orderIndex: i + 1,
            sortPrefix: `!${String(i + 1).padStart(2, '0')}_`
        }));

        setCollections(reordered);
    };

    const handleSaveCollectionOrder = async () => {
        setSavingOrder(true);
        setOrderSavedMsg(null);
        try {
            const orderedPayload = collections.map((c, i) => ({
                id: c.id,
                ratingKey: c.ratingKey,
                orderIndex: i + 1,
                sortPrefix: `!${String(i + 1).padStart(2, '0')}_`,
                promotedToHome: c.promotedToHome ?? true,
                promotedToRecommended: c.promotedToRecommended ?? true,
                promotedToSharedHome: c.promotedToSharedHome ?? true,
                collectionMode: c.collectionMode || "default"
            }));

            const res = await reorderPlexCollectionsAction(selectedServerId, selectedSectionKey, orderedPayload);
            if (res.success) {
                setOrderSavedMsg("✓ Plex Home Screen Hub ordering updated successfully!");
                setTimeout(() => setOrderSavedMsg(null), 4000);
            } else {
                setOrderSavedMsg(res.error || "Failed saving order.");
            }
        } catch (e: any) {
            setOrderSavedMsg(e.message || "Failed saving order.");
        } finally {
            setSavingOrder(false);
        }
    };

    // 1-Click Visibility Toggle for Table Rows (Home / Shared / Recommended)
    const handleToggleVisibility = async (collId: string, target: "home" | "shared" | "recommended", currentVal: boolean) => {
        setCollections(prev => prev.map(c => {
            if (c.id !== collId) return c;
            if (target === "home") return { ...c, promotedToHome: !currentVal };
            if (target === "shared") return { ...c, promotedToSharedHome: !currentVal };
            if (target === "recommended") return { ...c, promotedToRecommended: !currentVal };
            return c;
        }));

        try {
            await toggleCollectionVisibilityAction(collId, target, !currentVal);
        } catch (err) {
            console.error("Failed toggling visibility:", err);
            loadCollections();
        }
    };

    // 1-Click Collection Mode Dropdown update (Library Tab Display)
    const handleUpdateCollectionMode = async (collId: string, mode: string) => {
        setCollections(prev => prev.map(c => c.id === collId ? { ...c, collectionMode: mode } : c));
        try {
            await toggleCollectionVisibilityAction(collId, "mode", mode);
        } catch (err) {
            console.error("Failed updating collection mode:", err);
            loadCollections();
        }
    };

    // Open Comprehensive Placement Modal
    const handleOpenPlacementModal = (coll: any) => {
        setEditingCollection(coll);
        setPlacementHome(coll.promotedToHome ?? true);
        setPlacementShared(coll.promotedToSharedHome ?? true);
        setPlacementRecommended(coll.promotedToRecommended ?? true);
        setPlacementMode(coll.collectionMode || "default");
        setPlacementOrderIndex(coll.orderIndex ?? 1);
        setPlacementSortPrefix(coll.sortPrefix || `!${String(coll.orderIndex || 1).padStart(2, '0')}_`);
        setPlacementActiveDays(coll.activeDays || "all");
        setPlacementActiveTimeRange(coll.activeTimeRange || "all_day");
        setPlacementIsSeasonal(coll.isSeasonal ?? false);
        setPlacementStartMonth(coll.scheduleStartMonth || 10);
        setPlacementStartDay(coll.scheduleStartDay || 1);
        setPlacementEndMonth(coll.scheduleEndMonth || 11);
        setPlacementEndDay(coll.scheduleEndDay || 5);
        setPlacementSeasonalAction(coll.seasonalAction || "promote_hide");
        setPlacementMaxItems(coll.maxItems || 0);
        setPlacementExcludedLabels(coll.excludedLabels || "");
        setPlacementIncludePlaceholders(Boolean(coll.includePlaceholders));
        setPlacementSavedMsg(null);
        setPlacementModalOpen(true);
    };

    // Save Placement Modal Settings
    const handleSavePlacement = async () => {
        if (!editingCollection) return;
        setSavingPlacement(true);
        setPlacementSavedMsg(null);
        try {
            const res = await updateCollectionPlacementAction({
                id: editingCollection.id,
                promotedToHome: placementHome,
                promotedToSharedHome: placementShared,
                promotedToRecommended: placementRecommended,
                collectionMode: placementMode,
                orderIndex: Number(placementOrderIndex),
                sortPrefix: placementSortPrefix,
                activeDays: placementActiveDays,
                activeTimeRange: placementActiveTimeRange,
                isSeasonal: placementIsSeasonal,
                scheduleStartMonth: placementIsSeasonal ? Number(placementStartMonth) : null,
                scheduleStartDay: placementIsSeasonal ? Number(placementStartDay) : null,
                scheduleEndMonth: placementIsSeasonal ? Number(placementEndMonth) : null,
                scheduleEndDay: placementIsSeasonal ? Number(placementEndDay) : null,
                seasonalAction: placementSeasonalAction,
                maxItems: Number(placementMaxItems),
                excludedLabels: placementExcludedLabels,
                includePlaceholders: placementIncludePlaceholders
            });

            if (res.success) {
                setPlacementSavedMsg("✓ Placement & Visibility updated and synced to Plex!");
                setTimeout(() => {
                    setPlacementModalOpen(false);
                    loadCollections();
                }, 1000);
            }
        } catch (err: any) {
            console.error("Failed saving placement:", err);
        } finally {
            setSavingPlacement(false);
        }
    };

    // 1-Click Toggle for Collection Placeholders
    const handleTogglePlaceholders = async (collId: string, currentState: boolean) => {
        const nextState = !currentState;
        setCollections(prev => prev.map(c => c.id === collId ? { ...c, includePlaceholders: nextState } : c));
        try {
            await toggleCollectionPlaceholdersAction(collId, nextState);
        } catch (err) {
            console.error("Failed toggling placeholders:", err);
            loadCollections();
        }
    };

    // 1-Click Manual Trigger for Collection Coming Soon Placeholders
    const handleGenerateCollectionPlaceholders = async (collId: string) => {
        setGeneratingCollPlaceholdersId(collId);
        setCollPlaceholderMsg(null);
        try {
            const res: any = await generateCollectionPlaceholdersAction(collId);
            if (res.success) {
                setCollPlaceholderMsg({ id: collId, success: true, text: res.message || "Generated Coming Soon placeholders in share folder!" });
                setTimeout(() => setCollPlaceholderMsg(null), 6000);
            } else {
                setCollPlaceholderMsg({ id: collId, success: false, text: res.error || res.message || "Failed generating placeholders." });
            }
        } catch (err: any) {
            setCollPlaceholderMsg({ id: collId, success: false, text: err.message || "Failed generating placeholders." });
        } finally {
            setGeneratingCollPlaceholdersId(null);
        }
    };

    // Toggle specific day in activeDays list
    const handleToggleDay = (dayCode: string) => {
        let currentDays = placementActiveDays === "all" ? ["mon","tue","wed","thu","fri","sat","sun"] : placementActiveDays.split(",").map(d => d.trim());
        if (currentDays.includes(dayCode)) {
            currentDays = currentDays.filter(d => d !== dayCode);
        } else {
            currentDays.push(dayCode);
        }
        if (currentDays.length === 7 || currentDays.length === 0) {
            setPlacementActiveDays("all");
        } else {
            setPlacementActiveDays(currentDays.join(","));
        }
    };

    // Sync Single Collection to Plex
    const handleSyncCollection = async (collId: string) => {
        setSyncingCollId(collId);
        setSyncMessage(null);
        try {
            const res = await syncCollectionToPlexAction(collId);
            if (res.success) {
                setSyncMessage({ id: collId, success: true, text: res.message || "Synced to Plex successfully!" });
                loadCollections();
            } else {
                setSyncMessage({ id: collId, success: false, text: res.error || "Failed syncing collection." });
            }
        } catch (e: any) {
            setSyncMessage({ id: collId, success: false, text: e.message || "Failed syncing collection." });
        } finally {
            setSyncingCollId(null);
        }
    };

    // Import Plex Collections & Hubs
    const handleImportPlexCollections = async () => {
        setImportingPlexCollections(true);
        setPlexImportMsg(null);
        try {
            const res = await importPlexLibraryCollectionsAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setPlexImportMsg({ success: true, text: res.message || `Imported ${res.importedCount} collections!` });
                loadCollections();
                setTimeout(() => setPlexImportMsg(null), 5000);
            } else {
                setPlexImportMsg({ success: false, text: res.error || "Failed importing from Plex." });
            }
        } catch (e: any) {
            setPlexImportMsg({ success: false, text: e.message || "Failed importing." });
        } finally {
            setImportingPlexCollections(false);
        }
    };

    // Sync Seasonal Schedules
    const handleSyncSeasonal = async () => {
        setSyncingSeasonal(true);
        setSeasonalSyncMsg(null);
        try {
            const res = await syncSeasonalAndScheduledCollectionsAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setSeasonalSyncMsg({ success: true, text: res.message || "Seasonal schedules evaluated!" });
                loadCollections();
                setTimeout(() => setSeasonalSyncMsg(null), 4000);
            } else {
                setSeasonalSyncMsg({ success: false, text: res.error || "Failed seasonal sync." });
            }
        } catch (e: any) {
            setSeasonalSyncMsg({ success: false, text: e.message || "Failed seasonal sync." });
        } finally {
            setSyncingSeasonal(false);
        }
    };

    // Inspect Preset Blueprint & Matcher
    const handleInspectPreset = async (preset: CollectionPreset) => {
        setInspectingPreset(preset);
        setInspectHome(true);
        setInspectShared(true);
        setInspectRecommended(true);
        setInspectMode(preset.defaultCollectionMode || "default");
        setInspectMaxItems(preset.defaultMaxItems || 0);
        setInspectExcludedLabels(preset.defaultExcludedLabels || "trailers, coming_soon");
        setInspectIncludePlaceholders(Boolean(preset.defaultIncludePlaceholders));
        setInspectModalOpen(true);
        setPreviewLoading(true);
        setPreviewData(null);
        try {
            const res = await previewCollectionMatchingAction(selectedServerId, selectedSectionKey, {
                sourceType: preset.sourceType,
                sourceQuery: preset.sourceQuery,
                mediaType: preset.mediaType,
                title: preset.title,
                type: preset.type,
                maxItems: preset.defaultMaxItems || 0,
                excludedLabels: preset.defaultExcludedLabels || "trailers, coming_soon"
            });
            if (res.success) {
                setPreviewData(res as any);
            }
        } catch (e) {
            console.error("Failed previewing preset:", e);
        } finally {
            setPreviewLoading(false);
        }
    };

    // Install Preset Collection
    const handleInstallPreset = async (preset: CollectionPreset) => {
        try {
            const maxOrder = collections.reduce((max, c) => Math.max(max, c.orderIndex || 0), 0);
            const nextOrder = maxOrder + 1;
            const sortPrefix = `!${String(nextOrder).padStart(2, '0')}_`;

            const res = await saveMediaCollectionAction({
                title: preset.title,
                summary: preset.description,
                type: preset.mediaType === "show" ? "show" : "movie",
                category: preset.category,
                serverId: selectedServerId,
                sectionKey: selectedSectionKey,
                sourceType: preset.sourceType,
                sourceQuery: preset.sourceQuery,
                posterUrl: preset.defaultPosterUrl,
                orderIndex: nextOrder,
                sortPrefix,
                promotedToHome: inspectHome,
                promotedToRecommended: inspectRecommended,
                promotedToSharedHome: inspectShared,
                collectionMode: inspectMode,
                activeDays: preset.defaultActiveDays || "all",
                activeTimeRange: preset.defaultActiveTimeRange || "all_day",
                isSeasonal: preset.isSeasonal,
                scheduleStartMonth: preset.scheduleStartMonth,
                scheduleStartDay: preset.scheduleStartDay,
                scheduleEndMonth: preset.scheduleEndMonth,
                scheduleEndDay: preset.scheduleEndDay,
                seasonalAction: preset.seasonalAction,
                maxItems: Number(inspectMaxItems),
                excludedLabels: inspectExcludedLabels,
                includePlaceholders: inspectIncludePlaceholders
            });

            if (res.success && res.collection) {
                await syncCollectionToPlexAction(res.collection.id);
                loadCollections();
                setInspectModalOpen(false);
            }
        } catch (e) {
            console.error("Failed installing preset:", e);
        }
    };

    // YouTube Trailer Watcher
    const handleWatchTrailer = async (tmdbId: number, mediaType: "movie" | "tv" = "movie", title: string) => {
        setActiveTrailerTitle(title);
        setTrailerLoading(true);
        setActiveTrailer(null);
        setTrailerModalOpen(true);
        try {
            const res = await getTmdbTrailerAction(tmdbId, mediaType);
            if (res.success && res.trailer) {
                setActiveTrailer(res.trailer);
            } else {
                setActiveTrailer(null);
            }
        } catch (e) {
            console.error("Failed fetching trailer:", e);
        } finally {
            setTrailerLoading(false);
        }
    };

    // Open Placeholder Creation Modal
    const handleOpenPlaceholderModal = async (item: any) => {
        setSelectedPlaceholderItem(item);
        setPlaceholderSuccessMsg(null);
        setPlaceholderModalOpen(true);

        const bannerText = item.suggestedBannerText || (item.inTheaters ? "IN THEATERS" : item.digitalReleaseDate ? "NOW STREAMING" : "NOT REQUESTED");
        const bannerType = item.suggestedBannerType || (item.inTheaters ? "in_theaters" : item.digitalReleaseDate ? "now_streaming" : "not_requested");
        const bannerTheme = item.suggestedBannerTheme || (item.arrStatus === "COMING_SOON" ? "amber-gold" : item.arrStatus === "NOT_REQUESTED" ? "crimson-red" : "indigo-purple");

        setPlaceholderModalBannerText(bannerText);
        setPlaceholderModalBannerType(bannerType);
        setPlaceholderModalBannerTheme(bannerTheme);
        generatePlaceholderPreview(item.posterPath, item.title, bannerType, bannerText, bannerTheme, placeholderModalBannerPosition);
    };

    const generatePlaceholderPreview = async (
        posterPath: string | null,
        title: string,
        type = placeholderModalBannerType,
        text = placeholderModalBannerText,
        theme = placeholderModalBannerTheme,
        position = placeholderModalBannerPosition,
        date = templateVarDate,
        days = templateVarDays,
        source = templateVarSource,
        status = templateVarStatus,
        reason = templateVarReason
    ) => {
        setPlaceholderPreviewLoading(true);
        try {
            const res = await getPlaceholderPreviewDataUrlAction(posterPath, title, {
                bannerType: type,
                bannerText: text,
                bannerTheme: theme,
                bannerPosition: position,
                date,
                formattedDate: date,
                daysRemaining: days,
                source,
                status,
                reason
            });
            if (res.success && res.dataUrl) {
                setPlaceholderPreviewDataUrl(res.dataUrl);
            }
        } catch (e) {
            console.error("Failed generating preview:", e);
        } finally {
            setPlaceholderPreviewLoading(false);
        }
    };

    const handleSelectRealPoster = (item: PlexMediaStreamInfo, posterUrl: string) => {
        setSimSelectedRealItem(item);
        setSimPosterUrl(posterUrl);
        if (selectedPlaceholderItem) {
            setSelectedPlaceholderItem((prev: any) => ({ ...prev, title: item.title, posterPath: posterUrl }));
        }
        generatePlaceholderPreview(
            posterUrl,
            item.title,
            placeholderModalBannerType,
            placeholderModalBannerText,
            placeholderModalBannerTheme,
            placeholderModalBannerPosition,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason
        );
    };

    const handleInsertToken = (token: string) => {
        const next = placeholderModalBannerText ? `${placeholderModalBannerText} ${token}` : token;
        setPlaceholderModalBannerText(next);
        generatePlaceholderPreview(
            selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
            selectedPlaceholderItem?.title || simSelectedRealItem?.title || "Sample Media",
            placeholderModalBannerType,
            next,
            placeholderModalBannerTheme,
            placeholderModalBannerPosition,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason
        );
    };

    const handleCreatePlaceholder = async () => {
        if (!selectedPlaceholderItem) return;
        setGeneratingPlaceholder(true);
        setPlaceholderSuccessMsg(null);
        try {
            const res = await createPlaceholderItemAction(selectedServerId, selectedSectionKey, {
                tmdbId: selectedPlaceholderItem.id,
                title: selectedPlaceholderItem.title,
                year: selectedPlaceholderItem.year,
                mediaType: selectedPlaceholderItem.mediaType || "movie",
                posterPath: selectedPlaceholderItem.posterPath,
                overview: selectedPlaceholderItem.overview,
                bannerType: placeholderModalBannerType,
                bannerText: placeholderModalBannerText,
                bannerTheme: placeholderModalBannerTheme,
                bannerPosition: placeholderModalBannerPosition,
                date: templateVarDate,
                formattedDate: templateVarDate,
                daysRemaining: templateVarDays,
                source: templateVarSource,
                status: templateVarStatus,
                reason: templateVarReason
            });

            if (res.success) {
                setPlaceholderSuccessMsg(res.message || `Created placeholder for "${selectedPlaceholderItem.title}"!`);
                setTimeout(() => {
                    setPlaceholderModalOpen(false);
                    loadTrendingMedia();
                }, 1500);
            }
        } catch (e: any) {
            console.error("Failed creating placeholder:", e);
        } finally {
            setGeneratingPlaceholder(false);
        }
    };

    const currentServer = servers.find(s => s.serverId === selectedServerId) || servers[0];
    const currentSections = currentServer?.sections || [];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                <p className="text-sm font-medium">Loading Agregarr Collections &amp; Hubs Studio...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <CurationNavHeader 
                serversCount={servers.length}
                title="Agregarr Collections & Coming Soon Hub"
                description="Automated TMDb/Trakt/MDBList collections, Plex Home screen ranking (#1-#99), seasonal schedules, upcoming releases, and coming soon banners."
                servers={servers}
                selectedServerId={selectedServerId}
            />

            {/* Static Server & Library Section Navigator */}
            {servers.length > 0 && (
                <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                    <div className="p-4 space-y-3.5">
                        {/* Plex Servers Static Tabs */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 shrink-0">
                                <Tv className="h-4 w-4 text-amber-400" />
                                <span>Plex Server:</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                {servers.map(s => {
                                    const isSelected = s.serverId === selectedServerId;
                                    const secCount = s.sections?.length || 0;
                                    return (
                                        <button
                                            key={s.serverId}
                                            type="button"
                                            onClick={() => handleSelectServer(s.serverId)}
                                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                isSelected
                                                    ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-950/60 border border-amber-300/50 ring-1 ring-amber-300/40 font-black'
                                                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-slate-950 shadow-sm' : 'bg-emerald-400'}`} />
                                            <span>{s.serverName || "Plex Server"}</span>
                                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isSelected ? 'border-amber-900/60 text-slate-950 bg-amber-400' : 'border-slate-700 text-slate-400'}`}>
                                                {secCount} {secCount === 1 ? 'lib' : 'libs'}
                                            </Badge>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Library Sections Static Tabs */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 shrink-0">
                                <Film className="h-4 w-4 text-sky-400" />
                                <span>Library Sections:</span>
                                {serverSectionsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                {serverSectionsLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-sky-400 py-1 font-medium">
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                        <span>Querying library sections for {currentServer?.serverName || "server"}...</span>
                                    </div>
                                ) : currentSections.length === 0 ? (
                                    <span className="text-xs text-slate-500 italic py-1">No library sections found on this server.</span>
                                ) : (
                                    currentSections.map((sec: any) => {
                                        const isSelected = String(sec.key) === selectedSectionKey;
                                        const isMovie = sec.type === "movie" || sec.title?.toLowerCase().includes("movie");
                                        const isShow = sec.type === "show" || sec.title?.toLowerCase().includes("show") || sec.title?.toLowerCase().includes("tv");
                                        const isSecEnabled = isSectionEnabled(selectedServerId, String(sec.key));

                                        return (
                                            <div
                                                key={sec.key}
                                                className={`flex items-center rounded-xl transition-all border shadow-sm ${
                                                    isSelected
                                                        ? 'bg-sky-600/20 border-sky-400/60 ring-1 ring-sky-400/40'
                                                        : 'bg-slate-800/80 border-slate-700/70 hover:border-slate-600'
                                                }`}
                                            >
                                                {/* Library Tab Selector Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => handleSelectSection(String(sec.key))}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-l-xl transition-all cursor-pointer ${
                                                        isSelected
                                                            ? 'text-sky-200'
                                                            : 'text-slate-300 hover:text-white'
                                                    }`}
                                                >
                                                    {isMovie && <Film className="h-3.5 w-3.5 text-amber-300 shrink-0" />}
                                                    {isShow && <Tv className="h-3.5 w-3.5 text-cyan-300 shrink-0" />}
                                                    {!isMovie && !isShow && <Layers className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                                                    <span>{sec.title}</span>
                                                    <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${isSelected ? 'bg-sky-500/30 text-sky-100' : 'bg-slate-900 text-slate-400'}`}>
                                                        #{sec.key}
                                                    </span>
                                                </button>

                                                {/* Independent ON / OFF Toggle Button */}
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleSection(String(sec.key));
                                                    }}
                                                    title={isSecEnabled ? `Collections ACTIVE on "${sec.title}" (Click to exclude)` : `Collections EXCLUDED on "${sec.title}" (Click to enable)`}
                                                    className={`px-2 py-1 text-[10px] font-extrabold transition-all border-l flex items-center gap-1 rounded-r-xl cursor-pointer ${
                                                        isSecEnabled 
                                                            ? isSelected
                                                                ? 'bg-emerald-500/30 text-emerald-200 border-sky-400/40 hover:bg-emerald-500/40'
                                                                : 'bg-emerald-500/20 text-emerald-300 border-slate-700 hover:bg-emerald-500/30'
                                                            : 'bg-slate-900/90 text-slate-500 border-slate-700 hover:text-slate-300 hover:bg-slate-800'
                                                    }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isSecEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                                    <span>{isSecEnabled ? 'ON' : 'OFF'}</span>
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>

                        {/* Active Library Control Bar */}
                        {currentSections.length > 0 && selectedSectionKey && (
                            <div className="mt-2 pt-3 border-t border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 bg-slate-950/70 p-3 rounded-xl border border-slate-800/90">
                                <div className="flex items-center gap-3">
                                    <div className={`p-2 rounded-lg border shrink-0 ${
                                        isSectionEnabled(selectedServerId, selectedSectionKey)
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}>
                                        {isSectionEnabled(selectedServerId, selectedSectionKey) ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-black text-white">
                                                {currentServer?.serverName} &rarr; {currentSections.find(s => String(s.key) === selectedSectionKey)?.title || `Library #${selectedSectionKey}`}
                                            </span>
                                            <Badge className={`text-[10px] font-bold ${
                                                isSectionEnabled(selectedServerId, selectedSectionKey)
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                            }`}>
                                                {isSectionEnabled(selectedServerId, selectedSectionKey) ? '🟢 COLLECTIONS ACTIVE' : '⚪ EXCLUDED / DISABLED'}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            {isSectionEnabled(selectedServerId, selectedSectionKey)
                                                ? 'This library section will automatically sync collections & Coming Soon hubs to Plex Home.'
                                                : 'This library section is excluded and will be skipped during all collection sync operations.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap shrink-0 w-full md:w-auto justify-end">
                                    {/* Primary Switch */}
                                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                                        <Label htmlFor="sec-master-toggle-agregarr" className="text-xs font-bold text-slate-300 cursor-pointer">
                                            {isSectionEnabled(selectedServerId, selectedSectionKey) ? 'Enabled' : 'Disabled'}
                                        </Label>
                                        <Switch
                                            id="sec-master-toggle-agregarr"
                                            checked={isSectionEnabled(selectedServerId, selectedSectionKey)}
                                            onCheckedChange={() => handleToggleSection(selectedSectionKey)}
                                        />
                                    </div>

                                    {/* Batch Server Controls */}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleToggleAllSectionsOnServer(true)}
                                        className="h-8 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                                    >
                                        Enable All
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleToggleAllSectionsOnServer(false)}
                                        className="h-8 text-xs border-slate-800 bg-slate-900 text-slate-400 hover:text-rose-300"
                                    >
                                        Disable All
                                    </Button>

                                    {/* Scoped Runner for Selected Library */}
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={runningCollectionSync}
                                        onClick={handleRunCollectionSync}
                                        className="h-8 text-xs bg-amber-500 hover:bg-amber-400 text-slate-950 font-black shadow-md shadow-amber-950/40"
                                    >
                                        {runningCollectionSync ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Zap className="h-3.5 w-3.5 mr-1.5 text-slate-950" />}
                                        <span>Sync Library #{selectedSectionKey}</span>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Automated Collections & Hubs Schedule & Automation Card */}
            <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                <CardContent className="p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="h-4 w-4 text-amber-400" />
                            <span className="font-bold text-white text-sm">Collections &amp; Hubs Schedule &amp; Automation</span>
                            <Badge variant="outline" className={`text-[10px] font-semibold ${curationSyncCollections ? 'border-amber-500/40 text-amber-300 bg-amber-950/30' : 'border-slate-700 text-slate-400 bg-slate-800/40'}`}>
                                {curationSyncCollections ? `Active (${curationSyncSchedule.replace(/_/g, ' ')})` : 'Paused'}
                            </Badge>
                        </div>
                        <p className="text-[11px] text-slate-400">
                            Automatically updates TMDb &amp; Trakt dynamic smart collections, promotes seasonal hubs based on active calendar rules, and ranks items on Plex Home across enabled libraries.
                        </p>
                        {curationLastRunAt && (
                            <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Clock3 className="h-3 w-3 text-amber-400" />
                                Last automated run: <span className="text-slate-300 font-mono">{new Date(curationLastRunAt).toLocaleString()}</span>
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
                            <span className="text-[11px] font-bold text-slate-200">Timer</span>
                            <Switch 
                                checked={curationSyncCollections}
                                onCheckedChange={checked => setCurationSyncCollections(checked)}
                            />
                        </div>

                        <div className="space-y-0.5">
                            <Select 
                                value={curationSyncSchedule} 
                                onValueChange={val => setCurationSyncSchedule(val)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-8 w-[155px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="every_hour">⚡ Every 1 Hour</SelectItem>
                                    <SelectItem value="every_3_hours">⏱️ Every 3 Hours</SelectItem>
                                    <SelectItem value="every_6_hours">🔄 Every 6 Hours</SelectItem>
                                    <SelectItem value="every_12_hours">⏳ Every 12 Hours</SelectItem>
                                    <SelectItem value="daily_4am">🌙 Daily at 4:00 AM</SelectItem>
                                    <SelectItem value="weekly_sun">📅 Weekly on Sunday</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button 
                            size="sm"
                            onClick={handleSaveSchedule}
                            disabled={savingSchedule}
                            variant="outline"
                            className="border-slate-700 text-slate-300 hover:text-white text-xs h-8 px-3 cursor-pointer"
                        >
                            {savingSchedule ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                            {scheduleSavedMsg ? "Saved!" : "Save Schedule"}
                        </Button>

                        <Button 
                            size="sm"
                            onClick={handleRunCollectionSync}
                            disabled={runningCollectionSync}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-amber-950/40 cursor-pointer"
                        >
                            {runningCollectionSync ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            <span>Sync Collections Now</span>
                        </Button>
                    </div>
                </CardContent>

                {collectionSyncResult && (
                    <div className={`p-3 text-xs border-t ${collectionSyncResult.success ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'} flex items-start gap-2`}>
                        {collectionSyncResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                        <div className="space-y-0.5">
                            <span className="font-bold">{collectionSyncResult.text}</span>
                            {collectionSyncResult.details && collectionSyncResult.details.length > 0 && (
                                <p className="text-[11px] opacity-80">{collectionSyncResult.details.join(" • ")}</p>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {/* Agregarr Sub-Navigation Tabs */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md backdrop-blur-md overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setSubTab("collections")}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "collections"
                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Trophy className="h-4 w-4" />
                    <span>Collections &amp; Hubs</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${subTab === "collections" ? "border-amber-900 text-slate-950 bg-amber-400" : "border-slate-700 text-slate-400"}`}>
                        {collections.length}
                    </Badge>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("trending")}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "trending"
                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Flame className="h-4 w-4" />
                    <span>Trending Discovery</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("releases")}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "releases"
                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <CalendarClock className="h-4 w-4" />
                    <span>Upcoming Releases</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("placeholders")}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "placeholders"
                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Tag className="h-4 w-4" />
                    <span>Coming Soon Banners</span>
                </button>
            </div>

            {/* TAB 1: COLLECTIONS & HOME SCREEN HUBS */}
            {subTab === "collections" && (
                <div className="space-y-6">
                    {/* Actions Bar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl">
                        <div className="space-y-0.5">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <Trophy className="h-4 w-4 text-amber-400" />
                                <span>Plex Home Screen Collections &amp; Hubs Manager</span>
                            </h2>
                            <p className="text-xs text-slate-400">
                                Reorder collection ranking (#1-#99), configure seasonal schedules, and sync smart hubs directly to your Plex client home screens.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={importingPlexCollections}
                                onClick={handleImportPlexCollections}
                                className="border-slate-700 hover:bg-slate-800 text-slate-200 text-xs h-8 px-3 gap-1.5"
                            >
                                {importingPlexCollections ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" /> : <RefreshCw className="h-3.5 w-3.5 text-sky-400" />}
                                <span>Import from Plex</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={syncingSeasonal}
                                onClick={handleSyncSeasonal}
                                className="border-slate-700 hover:bg-slate-800 text-slate-200 text-xs h-8 px-3 gap-1.5"
                            >
                                {syncingSeasonal ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> : <Calendar className="h-3.5 w-3.5 text-amber-400" />}
                                <span>Evaluate Seasonal</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={savingOrder}
                                onClick={handleSaveCollectionOrder}
                                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs h-8 px-3.5 gap-1.5 shadow-md cursor-pointer"
                            >
                                {savingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                <span>Save Hub Ordering</span>
                            </Button>
                        </div>
                    </div>

                    {orderSavedMsg && (
                        <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in-50">
                            <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                            <span>{orderSavedMsg}</span>
                        </div>
                    )}

                    {plexImportMsg && (
                        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in-50 ${
                            plexImportMsg.success ? "bg-sky-950/80 border-sky-800 text-sky-300" : "bg-rose-950/80 border-rose-800 text-rose-300"
                        }`}>
                            {plexImportMsg.success ? <CheckCircle2 className="h-4 w-4 text-sky-400 shrink-0" /> : <XCircle className="h-4 w-4 text-rose-400 shrink-0" />}
                            <span>{plexImportMsg.text}</span>
                        </div>
                    )}

                    {seasonalSyncMsg && (
                        <div className="p-3 rounded-xl bg-amber-950/80 border border-amber-800 text-xs text-amber-300 flex items-center gap-2 animate-in fade-in-50">
                            <Calendar className="h-4 w-4 text-amber-400 shrink-0" />
                            <span>{seasonalSyncMsg.text}</span>
                        </div>
                    )}

                    {/* Active Collections List */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                        <CardHeader className="p-4 border-b border-slate-800/80">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-amber-400" />
                                    <span>Active Library Collections ({collections.length})</span>
                                </CardTitle>
                                <span className="text-xs text-slate-400">Use Up/Down arrows to position on Plex Home Screen</span>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2.5">
                            {collections.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 space-y-2">
                                    <Trophy className="h-10 w-10 mx-auto text-slate-700" />
                                    <p className="text-xs">No collections configured for this library section yet.</p>
                                    <p className="text-[11px]">Click "Import from Plex" or install one of the curated presets below.</p>
                                </div>
                            ) : (
                                collections.map((coll, idx) => {
                                    const isSyncing = syncingCollId === coll.id;
                                    const isHomeActive = coll.promotedToHome ?? true;
                                    const isSharedActive = coll.promotedToSharedHome ?? true;
                                    const isRecsActive = coll.promotedToRecommended ?? true;
                                    const currentMode = coll.collectionMode || "default";

                                    return (
                                        <div
                                            key={coll.id}
                                            className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors shadow-sm"
                                        >
                                            <div className="flex items-center gap-3 min-w-0">
                                                {/* Reorder Buttons */}
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={() => handleMoveCollection(idx, "up")}
                                                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                                        title="Move Up on Home Screen"
                                                    >
                                                        <ChevronUp className="h-3.5 w-3.5" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === collections.length - 1}
                                                        onClick={() => handleMoveCollection(idx, "down")}
                                                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                                        title="Move Down on Home Screen"
                                                    >
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>

                                                {/* Position Ranking Pill */}
                                                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-mono font-bold px-2 py-0.5 shrink-0">
                                                    #{idx + 1}
                                                </Badge>

                                                {/* Collection Details */}
                                                <div className="space-y-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-bold text-white text-xs truncate max-w-[280px]" title={coll.title}>
                                                            {coll.title}
                                                        </span>
                                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-700 text-slate-400 shrink-0">
                                                            {coll.category || coll.sourceType || "Curated"}
                                                        </Badge>
                                                        {coll.isSeasonal && (
                                                            <Badge className="text-[9px] px-1.5 py-0 bg-amber-950 text-amber-300 border-amber-500/40 gap-1 shrink-0">
                                                                <Calendar className="h-2.5 w-2.5" />
                                                                <span>Seasonal ({coll.scheduleStartMonth || 10}/{coll.scheduleStartDay || 1} - {coll.scheduleEndMonth || 11}/{coll.scheduleEndDay || 5})</span>
                                                            </Badge>
                                                        )}
                                                        {coll.activeDays && coll.activeDays !== "all" && (
                                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-900/60 bg-amber-950/40 text-amber-300 gap-1 font-mono shrink-0">
                                                                <CalendarClock className="h-2.5 w-2.5" />
                                                                <span>{coll.activeDays.toUpperCase()}</span>
                                                            </Badge>
                                                        )}
                                                        {coll.activeTimeRange && coll.activeTimeRange !== "all_day" && (
                                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-indigo-900/60 bg-indigo-950/40 text-indigo-300 gap-1 font-mono shrink-0">
                                                                <Clock className="h-2.5 w-2.5" />
                                                                <span className="capitalize">{coll.activeTimeRange.replace("_", " ")}</span>
                                                            </Badge>
                                                        )}
                                                        {coll.maxItems && coll.maxItems > 0 && (
                                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-900/60 bg-amber-950/40 text-amber-300 gap-1 font-mono shrink-0">
                                                                <span>Limit: {coll.maxItems}</span>
                                                            </Badge>
                                                        )}
                                                        {coll.excludedLabels && (
                                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-rose-900/60 bg-rose-950/30 text-rose-300 gap-1 font-mono shrink-0" title={`Excludes: ${coll.excludedLabels}`}>
                                                                <span>Excludes: {coll.excludedLabels.split(",").slice(0, 2).join(", ")}{coll.excludedLabels.split(",").length > 2 ? "..." : ""}</span>
                                                            </Badge>
                                                        )}
                                                        {coll.includePlaceholders && (
                                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/60 bg-amber-950/40 text-amber-300 gap-1 font-mono shrink-0" title="Coming Soon placeholders and trailer stubs enabled">
                                                                <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>Placeholders: ON</span>
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 truncate max-w-[420px]">
                                                        {coll.summary || coll.sourceQuery || "No summary configured."}
                                                    </p>
                                                    {collPlaceholderMsg && collPlaceholderMsg.id === coll.id && (
                                                        <div className={`mt-1 p-1.5 rounded-md text-[10px] font-semibold flex items-center gap-1.5 ${
                                                            collPlaceholderMsg.success ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/60" : "bg-rose-950/60 text-rose-300 border border-rose-800/60"
                                                        }`}>
                                                            {collPlaceholderMsg.success ? <CheckCircle2 className="h-3 w-3 text-emerald-400 shrink-0" /> : <XCircle className="h-3 w-3 text-rose-400 shrink-0" />}
                                                            <span className="truncate">{collPlaceholderMsg.text}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Agregarr Placement & Visibility Matrix */}
                                            <div className="flex flex-wrap items-center gap-2 self-end lg:self-center shrink-0">
                                                {/* Screen Visibility Targets */}
                                                <div className="flex items-center gap-1.5 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
                                                    {/* Home Screen Toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleVisibility(coll.id, "home", isHomeActive)}
                                                        title={isHomeActive ? "Visible on Server Owner's Home Screen (Click to hide)" : "Hidden from Server Owner's Home Screen (Click to show)"}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                                                            isHomeActive
                                                                ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm"
                                                                : "bg-slate-950/60 text-slate-500 border-slate-800 opacity-50 hover:opacity-100 hover:text-slate-300"
                                                        }`}
                                                    >
                                                        <Home className="h-3 w-3" />
                                                        <span>Home</span>
                                                    </button>

                                                    {/* Shared Users' Home Toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleVisibility(coll.id, "shared", isSharedActive)}
                                                        title={isSharedActive ? "Visible on Shared Friends & Users' Home Screens (Click to hide)" : "Hidden from Shared Users' Home Screens (Click to show)"}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                                                            isSharedActive
                                                                ? "bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-sm"
                                                                : "bg-slate-950/60 text-slate-500 border-slate-800 opacity-50 hover:opacity-100 hover:text-slate-300"
                                                        }`}
                                                    >
                                                        <Users className="h-3 w-3" />
                                                        <span>Shared</span>
                                                    </button>

                                                    {/* Library Recommended Toggle */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleToggleVisibility(coll.id, "recommended", isRecsActive)}
                                                        title={isRecsActive ? "Visible on Library Recommended Page (Click to hide)" : "Hidden from Library Recommended Page (Click to show)"}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                                                            isRecsActive
                                                                ? "bg-sky-500/20 text-sky-300 border-sky-500/50 shadow-sm"
                                                                : "bg-slate-950/60 text-slate-500 border-slate-800 opacity-50 hover:opacity-100 hover:text-slate-300"
                                                        }`}
                                                    >
                                                        <Star className="h-3 w-3" />
                                                        <span>Recs</span>
                                                    </button>

                                                    {/* 1-Click Placeholders Toggle Button */}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleTogglePlaceholders(coll.id, Boolean(coll.includePlaceholders))}
                                                        title={coll.includePlaceholders 
                                                            ? "Coming Soon Placeholders: ENABLED (Click to disable). Missing items will generate trailer stubs & banners in your Coming Soon share." 
                                                            : "Coming Soon Placeholders: DISABLED (Click to enable). When enabled, missing items generate trailer stubs & banners in your Coming Soon share."}
                                                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold border transition-all cursor-pointer ${
                                                            coll.includePlaceholders
                                                                ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-sm"
                                                                : "bg-slate-950/60 text-slate-500 border-slate-800 opacity-50 hover:opacity-100 hover:text-slate-300"
                                                        }`}
                                                    >
                                                        <Sparkles className="h-3 w-3 text-amber-400" />
                                                        <span>{coll.includePlaceholders ? "Placeholders" : "No Stubs"}</span>
                                                    </button>

                                                    {/* Library Browsing Mode Selector */}
                                                    <div className="flex items-center gap-1 pl-1 border-l border-slate-800" title="Library Tab Display Mode">
                                                        <span className="text-[10px] text-slate-400 font-semibold px-1">Lib:</span>
                                                        <Select
                                                            value={currentMode}
                                                            onValueChange={(val) => handleUpdateCollectionMode(coll.id, val)}
                                                        >
                                                            <SelectTrigger className="h-6 text-[10px] font-medium bg-slate-950 border-slate-800 px-2 py-0 w-24 text-slate-200">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="default">Default</SelectItem>
                                                                <SelectItem value="hide">Hide Coll</SelectItem>
                                                                <SelectItem value="hideItems">Hide Items</SelectItem>
                                                                <SelectItem value="showItems">Show Both</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {/* Generate Stubs Action (if placeholders active) */}
                                                {coll.includePlaceholders && (
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="outline"
                                                        disabled={generatingCollPlaceholdersId === coll.id}
                                                        onClick={() => handleGenerateCollectionPlaceholders(coll.id)}
                                                        className="text-[11px] h-8 px-2.5 gap-1 border-amber-500/40 bg-amber-950/20 hover:bg-amber-900/40 text-amber-300"
                                                        title="Generate / update Coming Soon placeholder trailers and banners in share folder now"
                                                    >
                                                        {generatingCollPlaceholdersId === coll.id ? (
                                                            <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                                                        ) : (
                                                            <Tag className="h-3 w-3 text-amber-400" />
                                                        )}
                                                        <span className="hidden sm:inline">Gen Stubs</span>
                                                    </Button>
                                                )}

                                                {/* Placement Details & Actions */}
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => handleOpenPlacementModal(coll)}
                                                    className="text-[11px] h-8 px-2.5 gap-1 border-slate-700 hover:bg-slate-800 text-amber-300 hover:text-amber-200"
                                                    title="Configure full placement, day schedule, and time rules"
                                                >
                                                    <Settings2 className="h-3.5 w-3.5 text-amber-400" />
                                                    <span>Placement</span>
                                                </Button>

                                                <Badge variant="outline" className="text-[10px] font-mono border-slate-800 text-slate-400 h-8 px-2 flex items-center">
                                                    {coll.itemCount || 0} items
                                                </Badge>

                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={isSyncing}
                                                    onClick={() => handleSyncCollection(coll.id)}
                                                    className="text-[11px] h-8 px-2.5 gap-1 border-slate-700 hover:bg-slate-800 text-slate-200"
                                                >
                                                    {isSyncing ? <Loader2 className="h-3 w-3 animate-spin text-amber-400" /> : <RefreshCw className="h-3 w-3 text-amber-400" />}
                                                    <span>Sync</span>
                                                </Button>

                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={async () => {
                                                        if (confirm(`Delete collection "${coll.title}"?`)) {
                                                            await deleteMediaCollectionAction(coll.id, true);
                                                            loadCollections();
                                                        }
                                                    }}
                                                    className="text-slate-500 hover:text-rose-400 h-8 w-8 p-0 cursor-pointer"
                                                    title="Delete Collection"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>

                    {/* Curated Preset Blueprints Library */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                <Sparkles className="h-4 w-4 text-amber-400" /> Curated Agregarr Preset Blueprints ({COLLECTION_PRESETS.length})
                            </h3>
                            <span className="text-[11px] text-slate-400">Click any preset to inspect rules and preview library matches</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {COLLECTION_PRESETS.map(preset => {
                                return (
                                    <div
                                        key={preset.id}
                                        onClick={() => handleInspectPreset(preset)}
                                        className="p-3.5 bg-slate-900/90 hover:bg-slate-800/90 rounded-xl border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer space-y-2 group shadow-lg"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                    <Trophy className="h-3.5 w-3.5" />
                                                </div>
                                                <span className="font-bold text-white text-xs group-hover:text-amber-300 transition-colors">{preset.title}</span>
                                            </div>
                                            <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400 capitalize">
                                                {preset.category}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-slate-400 line-clamp-2">
                                            {preset.description}
                                        </p>
                                        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80 text-[10px] text-slate-500">
                                            <span className="font-mono">Source: {preset.sourceType.toUpperCase()}</span>
                                            <span className="text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                                                Inspect &amp; Install →
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: TRENDING MEDIA HUB */}
            {subTab === "trending" && (
                <div className="space-y-4">
                    {/* Category Filter Bar */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
                        <div className="flex flex-wrap items-center gap-1.5">
                            {[
                                { id: "all", label: "🔥 All Trending" },
                                { id: "disney", label: "🏰 Disney+" },
                                { id: "disney_kids", label: "👶 Disney Kids" },
                                { id: "netflix", label: "🔴 Netflix" },
                                { id: "netflix_kids", label: "🧸 Netflix Kids" },
                                { id: "digital", label: "⚡ Digital Streaming" },
                                { id: "theatrical", label: "🍿 In Theaters" }
                            ].map(cat => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => {
                                        setTrendingCategory(cat.id as any);
                                        loadTrendingMedia(cat.id as any);
                                    }}
                                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        trendingCategory === cat.id
                                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                            : "bg-slate-800 text-slate-300 hover:text-white"
                                    }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>

                        <div className="flex items-center gap-2">
                            <Input
                                placeholder="Search trending..."
                                value={trendingSearchQuery}
                                onChange={(e) => setTrendingSearchQuery(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-800 w-44"
                            />
                        </div>
                    </div>

                    {/* Media Grid */}
                    {trendingLoading ? (
                        <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                            <Loader2 className="h-6 w-6 animate-spin text-amber-400" />
                            <span className="text-xs">Loading trending media from TMDb...</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
                            {trendingMedia
                                .filter(m => !trendingSearchQuery || m.title?.toLowerCase().includes(trendingSearchQuery.toLowerCase()))
                                .map(item => {
                                    return (
                                        <div
                                            key={item.id}
                                            className="group relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 hover:border-amber-500/50 transition-all flex flex-col shadow-lg"
                                        >
                                            {/* Poster */}
                                            <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
                                                <img
                                                    src={item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : "/placeholder-poster.png"}
                                                    alt={item.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                                {/* Smart Status Badge */}
                                                <div className="absolute top-2 left-2 z-10">
                                                    <Badge className={`${item.statusBadgeColor || (item.inLibrary ? "bg-emerald-600" : "bg-rose-600")}/95 text-white text-[9px] font-black px-1.5 py-0.5 border-none shadow-md gap-1 flex items-center`}>
                                                        {item.arrStatus === "COMING_SOON" && <Clock className="h-2.5 w-2.5" />}
                                                        {item.arrStatus === "MONITORED_RELEASED" && <Zap className="h-2.5 w-2.5" />}
                                                        {item.arrStatus === "NOT_REQUESTED" && <Flame className="h-2.5 w-2.5" />}
                                                        <span>{item.statusBadgeText || (item.inLibrary ? "✓ IN LIBRARY" : "NOT REQUESTED")}</span>
                                                    </Badge>
                                                </div>
                                            </div>

                                            {/* Info & Action */}
                                            <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                                                <div>
                                                    <h4 className="font-bold text-white text-xs truncate" title={item.title}>
                                                        {item.title}
                                                    </h4>
                                                    <p className="text-[10px] text-slate-400">
                                                        {item.year || item.releaseDate?.split("-")[0] || "Unknown"}
                                                    </p>
                                                </div>

                                                <div className="flex gap-1.5 pt-1">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => handleWatchTrailer(item.id, item.mediaType || "movie", item.title)}
                                                        className="h-7 px-2 text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 gap-1 cursor-pointer shrink-0"
                                                        title="Watch Official YouTube Trailer"
                                                    >
                                                        <Play className="h-3 w-3 text-rose-500 fill-rose-500" />
                                                        <span className="hidden sm:inline">Trailer</span>
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => handleOpenPlaceholderModal(item)}
                                                        className="flex-1 h-7 text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/40 gap-1 cursor-pointer"
                                                    >
                                                        <Tag className="h-3 w-3" />
                                                        <span>{item.inLibrary ? "Overlay" : "Placeholder"}</span>
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: UPCOMING RELEASES CALENDAR */}
            {subTab === "releases" && (
                <Card className="bg-slate-900/90 border-slate-800 shadow-xl p-6 space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="space-y-0.5">
                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                <CalendarClock className="h-5 w-5 text-amber-400" />
                                <span>Upcoming Theatrical &amp; Digital Streaming Releases</span>
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Real-time release calendar tracking upcoming box office debuts and VOD/SVOD drops.
                            </CardDescription>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {trendingMedia.filter(m => m.releaseDate || m.digitalReleaseDate).slice(0, 18).map(item => {
                            return (
                                <div key={item.id} className="flex gap-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800">
                                    <div className="relative shrink-0">
                                        <img
                                            src={item.posterPath ? `https://image.tmdb.org/t/p/w200${item.posterPath}` : "/placeholder-poster.png"}
                                            alt={item.title}
                                            className="w-16 h-24 object-cover rounded-lg shadow-md"
                                        />
                                        <div className="absolute top-1 left-1">
                                            <Badge className={`${item.statusBadgeColor || (item.inLibrary ? "bg-emerald-600" : "bg-rose-600")}/95 text-white text-[8px] font-bold px-1 py-0 border-none shadow-sm`}>
                                                {item.statusBadgeText || (item.inLibrary ? "IN LIBRARY" : "UPCOMING")}
                                            </Badge>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5 flex-1 overflow-hidden flex flex-col justify-between">
                                        <div>
                                            <h4 className="font-bold text-white text-xs truncate" title={item.title}>{item.title}</h4>
                                            <div className="flex flex-col gap-1 text-[10px] mt-1">
                                                {item.releaseDate && (
                                                    <span className="text-amber-300 flex items-center gap-1 font-mono">
                                                        🍿 Theatrical: {item.releaseDate}
                                                    </span>
                                                )}
                                                {item.digitalReleaseDate && (
                                                    <span className="text-cyan-300 flex items-center gap-1 font-mono">
                                                        ⚡ Digital: {item.digitalReleaseDate}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 pt-1">
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => handleWatchTrailer(item.id, item.mediaType || "movie", item.title)}
                                                className="h-6 text-[10px] bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-bold px-2 gap-1 cursor-pointer"
                                                title="Watch YouTube Trailer"
                                            >
                                                <Play className="h-2.5 w-2.5 text-rose-500 fill-rose-500" />
                                                <span>Trailer</span>
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => handleOpenPlaceholderModal(item)}
                                                className="h-6 text-[10px] bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-200 font-bold px-2 gap-1 cursor-pointer flex-1"
                                            >
                                                <Tag className="h-2.5 w-2.5" />
                                                <span>Deploy Card</span>
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {/* TAB 4: COMING SOON BANNERS & PLACEHOLDERS */}
            {subTab === "placeholders" && (
                <Card className="bg-slate-900/90 border-slate-800 shadow-xl p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="space-y-0.5">
                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Tag className="h-5 w-5 text-amber-400" />
                                <span>Coming Soon Banners &amp; Placeholder Share Folders</span>
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Configure dedicated Coming Soon share folders mapped into your Plex libraries for unreleased media placeholders.
                            </CardDescription>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Server Shares Setup */}
                        <div className="space-y-4 p-4 bg-slate-950/60 rounded-xl border border-slate-800">
                            <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                <HardDrive className="h-4 w-4 text-cyan-400" /> Coming Soon Shares Configuration
                            </h4>
                            <p className="text-[11px] text-slate-400">
                                Specify the disk folder where lightweight placeholder stubs and composite banner posters are generated.
                            </p>

                            {servers.map(srv => {
                                const currentPath = comingSoonShares[srv.serverId] || "";
                                const checkStatus = pathCheckResults[srv.serverId];

                                return (
                                    <div key={srv.serverId} className="space-y-1.5">
                                        <Label className="text-xs text-slate-300 font-semibold">{srv.serverName} Share Path:</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="/mnt/user/media/coming_soon"
                                                value={currentPath}
                                                onChange={(e) => {
                                                    const updated = { ...comingSoonShares, [srv.serverId]: e.target.value };
                                                    setComingSoonShares(updated);
                                                }}
                                                className="text-xs bg-slate-900 border-slate-700 font-mono"
                                            />
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={async () => {
                                                    setPathCheckResults(prev => ({ ...prev, [srv.serverId]: { checking: true } }));
                                                    const res = await validateDirectoryPathAction(currentPath);
                                                    setPathCheckResults(prev => ({ ...prev, [srv.serverId]: { checking: false, success: res.success, msg: res.message || res.error } }));
                                                }}
                                                className="border-slate-700 text-xs shrink-0"
                                            >
                                                Validate
                                            </Button>
                                        </div>
                                        {checkStatus && !checkStatus.checking && (
                                            <p className={`text-[10px] ${checkStatus.success ? "text-emerald-400" : "text-rose-400"}`}>
                                                {checkStatus.msg}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={savingShares}
                                    onClick={async () => {
                                        setSavingShares(true);
                                        await saveComingSoonSharesAction(comingSoonShares);
                                        setSavingShares(false);
                                        setSharesSavedMsg(true);
                                        setTimeout(() => setSharesSavedMsg(false), 3000);
                                    }}
                                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 cursor-pointer"
                                >
                                    <Save className="h-3.5 w-3.5" />
                                    <span>Save Share Paths</span>
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={cleaningPlaceholders}
                                    onClick={handleCleanupPlaceholders}
                                    className="border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs gap-1.5 cursor-pointer"
                                    title="Scans Coming Soon shares and automatically removes placeholder folders for movies & shows that are now downloaded/in your Plex library"
                                >
                                    {cleaningPlaceholders ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> : <RotateCcw className="h-3.5 w-3.5 text-amber-400" />}
                                    <span>Clean Acquired Placeholders</span>
                                </Button>

                                {sharesSavedMsg && <span className="text-xs text-emerald-400 font-bold ml-1">✓ Saved!</span>}
                            </div>

                            {cleanupResultMsg && (
                                <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${
                                    cleanupResultMsg.success 
                                        ? "bg-emerald-950/80 border border-emerald-800 text-emerald-300" 
                                        : "bg-rose-950/80 border border-rose-800 text-rose-300"
                                }`}>
                                    {cleanupResultMsg.success ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <XCircle className="h-4 w-4 text-rose-400 shrink-0" />}
                                    <span>{cleanupResultMsg.text}</span>
                                </div>
                            )}
                        </div>

                        {/* Agregarr Banner & Poster Simulator Studio */}
                        <div className="space-y-4 p-5 bg-slate-950/80 rounded-2xl border border-slate-800 shadow-xl">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                <div>
                                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Sparkles className="h-4 w-4 text-amber-400" /> Agregarr Banner &amp; Poster Live Simulator
                                    </h4>
                                    <p className="text-[11px] text-slate-400">
                                        Preview dynamic composite banners, template variables, and pull real posters from your Plex library.
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPosterPickerModalOpen(true)}
                                    className="h-7 text-[11px] gap-1.5 border-amber-500/40 hover:bg-amber-950/40 text-amber-200 hover:text-amber-100 shrink-0"
                                >
                                    <ImageIcon className="h-3.5 w-3.5 text-amber-400" /> Pull Poster from Plex
                                </Button>
                            </div>

                            {/* Real Media Item Telemetry Badge */}
                            {simSelectedRealItem && (
                                <div className="p-2.5 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs flex items-center justify-between gap-2">
                                    <div className="space-y-0.5 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-white truncate">{simSelectedRealItem.title}</span>
                                            {simSelectedRealItem.year && (
                                                <span className="text-[10px] text-amber-300 font-mono">({simSelectedRealItem.year})</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-amber-200/80">
                                            {(simSelectedRealItem.detectedBadges?.resolution || simSelectedRealItem.media?.[0]?.videoResolution) && (
                                                <span className="px-1.5 py-0.2 bg-amber-900/40 rounded text-amber-300 font-mono">
                                                    {simSelectedRealItem.detectedBadges?.resolution || simSelectedRealItem.media?.[0]?.videoResolution}
                                                </span>
                                            )}
                                            {(simSelectedRealItem.detectedBadges?.audio || simSelectedRealItem.media?.[0]?.audioCodec) && (
                                                <span className="px-1.5 py-0.2 bg-slate-800 rounded text-slate-300 uppercase">
                                                    {simSelectedRealItem.detectedBadges?.audio || simSelectedRealItem.media?.[0]?.audioCodec}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => {
                                            setSimSelectedRealItem(null);
                                            setSimPosterUrl("https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80");
                                            generatePlaceholderPreview(
                                                "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
                                                "Sample Media",
                                                placeholderModalBannerType,
                                                placeholderModalBannerText,
                                                placeholderModalBannerTheme,
                                                placeholderModalBannerPosition
                                            );
                                        }}
                                        className="h-6 px-2 text-[10px] text-slate-400 hover:text-white shrink-0"
                                    >
                                        Reset Sample
                                    </Button>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-5 items-start">
                                {/* Left: Composite Poster Preview */}
                                <div className="sm:col-span-5 flex flex-col items-center space-y-2">
                                    <div className="relative aspect-[2/3] w-full max-w-[200px] rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-700/80 shadow-2xl">
                                        {placeholderPreviewDataUrl ? (
                                            <img src={placeholderPreviewDataUrl} alt="Composite Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-500 text-xs gap-1.5">
                                                <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                                                <span>Rendering...</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">Live Composite Preview</span>
                                </div>

                                {/* Right: Banner Controls & Variable Chips */}
                                <div className="sm:col-span-7 space-y-3 text-xs">
                                    {/* Template Presets Selector */}
                                    <div className="space-y-1.5">
                                        <Label className="text-[11px] text-slate-300 font-semibold">Agregarr Banner Preset:</Label>
                                        <Select
                                            value={placeholderModalBannerType}
                                            onValueChange={(val) => {
                                                const found = AGREGARR_BANNER_PRESETS.find(p => p.id === val);
                                                setPlaceholderModalBannerType(val);
                                                const nextText = found?.defaultText || "NOT REQUESTED";
                                                setPlaceholderModalBannerText(nextText);
                                                if (found?.theme) setPlaceholderModalBannerTheme(found.theme);
                                                if (found?.pos) setPlaceholderModalBannerPosition(found.pos);
                                                generatePlaceholderPreview(
                                                    simSelectedRealItem ? simPosterUrl : null,
                                                    simSelectedRealItem?.title || "Sample Media",
                                                    val,
                                                    nextText,
                                                    found?.theme || placeholderModalBannerTheme,
                                                    found?.pos || placeholderModalBannerPosition
                                                );
                                            }}
                                        >
                                            <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-64">
                                                {AGREGARR_BANNER_PRESETS.map(p => (
                                                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Banner Text Template with Variable Insertion Chips */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[11px] text-slate-300 font-semibold">Banner Text Template:</Label>
                                            <span className="text-[10px] text-amber-400 font-mono">Click chips to insert:</span>
                                        </div>
                                        <Input
                                            value={placeholderModalBannerText}
                                            onChange={(e) => {
                                                setPlaceholderModalBannerText(e.target.value);
                                                generatePlaceholderPreview(
                                                    simSelectedRealItem ? simPosterUrl : null,
                                                    simSelectedRealItem?.title || "Sample Media",
                                                    placeholderModalBannerType,
                                                    e.target.value
                                                );
                                            }}
                                            className="h-8 text-xs bg-slate-900 border-slate-700 font-mono text-white"
                                            placeholder="e.g. DIGITAL RELEASE ON {date}"
                                        />

                                        {/* Agregarr Variable Insertion Chips */}
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {[
                                                { token: "{date}", label: "+ {date}" },
                                                { token: "{days}", label: "+ {days}" },
                                                { token: "{title}", label: "+ {title}" },
                                                { token: "{source}", label: "+ {source}" },
                                                { token: "{status}", label: "+ {status}" },
                                                { token: "{reason}", label: "+ {reason}" },
                                                { token: "{quality}", label: "+ {quality}" }
                                            ].map(chip => (
                                                <button
                                                    key={chip.token}
                                                    type="button"
                                                    onClick={() => handleInsertToken(chip.token)}
                                                    className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold transition-all cursor-pointer"
                                                >
                                                    {chip.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Color Theme & Position Controls */}
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-slate-400">Color Theme:</Label>
                                            <Select
                                                value={placeholderModalBannerTheme}
                                                onValueChange={(val) => {
                                                    setPlaceholderModalBannerTheme(val);
                                                    generatePlaceholderPreview(
                                                        simSelectedRealItem ? simPosterUrl : null,
                                                        simSelectedRealItem?.title || "Sample Media",
                                                        placeholderModalBannerType,
                                                        placeholderModalBannerText,
                                                        val
                                                    );
                                                }}
                                            >
                                                <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-7">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="crimson-red">🔴 Crimson Red</SelectItem>
                                                    <SelectItem value="amber-gold">💛 Amber Gold</SelectItem>
                                                    <SelectItem value="indigo-purple">🟣 Indigo Purple</SelectItem>
                                                    <SelectItem value="emerald-green">🟢 Emerald Green</SelectItem>
                                                    <SelectItem value="cinematic-blue">🔵 Cinematic Blue</SelectItem>
                                                    <SelectItem value="cyber-neon">⚡ Cyber Neon</SelectItem>
                                                    <SelectItem value="glass">✨ Obsidian Glass</SelectItem>
                                                    <SelectItem value="netflix-red">🟥 Netflix Red</SelectItem>
                                                    <SelectItem value="slate-frosted">🛡️ Slate Frosted</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-slate-400">Position:</Label>
                                            <Select
                                                value={placeholderModalBannerPosition}
                                                onValueChange={(val: any) => {
                                                    setPlaceholderModalBannerPosition(val);
                                                    generatePlaceholderPreview(
                                                        simSelectedRealItem ? simPosterUrl : null,
                                                        simSelectedRealItem?.title || "Sample Media",
                                                        placeholderModalBannerType,
                                                        placeholderModalBannerText,
                                                        placeholderModalBannerTheme,
                                                        val
                                                    );
                                                }}
                                            >
                                                <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-7">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="bottom">Bottom Overlay</SelectItem>
                                                    <SelectItem value="top">Top Overlay</SelectItem>
                                                    <SelectItem value="corner">45° Corner Ribbon</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>

                                    {/* Live Variable Test Values */}
                                    <div className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-800/80 space-y-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                            Live Test Variables:
                                        </span>
                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Date {'{date}'}:</Label>
                                                <Input
                                                    value={templateVarDate}
                                                    onChange={(e) => {
                                                        setTemplateVarDate(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            e.target.value
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-950 border-slate-800 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Days {'{days}'}:</Label>
                                                <Input
                                                    type="number"
                                                    value={templateVarDays}
                                                    onChange={(e) => {
                                                        const num = parseInt(e.target.value, 10) || 0;
                                                        setTemplateVarDays(num);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            templateVarDate,
                                                            num
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-950 border-slate-800 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Source {'{source}'}:</Label>
                                                <Input
                                                    value={templateVarSource}
                                                    onChange={(e) => {
                                                        setTemplateVarSource(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            e.target.value
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-950 border-slate-800 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Status {'{status}'}:</Label>
                                                <Input
                                                    value={templateVarStatus}
                                                    onChange={(e) => {
                                                        setTemplateVarStatus(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            templateVarSource,
                                                            e.target.value
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-950 border-slate-800 font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Inspect Preset Blueprint Modal */}
            <Dialog open={inspectModalOpen} onOpenChange={setInspectModalOpen}>
                <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100 max-h-[90vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="pb-2 border-b border-slate-800">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Trophy className="h-5 w-5 text-amber-400" />
                                <span>{inspectingPreset?.title}</span>
                            </DialogTitle>
                            <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-950/40 text-xs">
                                {inspectingPreset?.category?.toUpperCase()}
                            </Badge>
                        </div>
                        <DialogDescription className="text-xs text-slate-400">
                            {inspectingPreset?.description}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 py-3 text-xs pr-1">
                        {/* Blueprint Telemetry */}
                        <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1.5 font-mono text-[11px]">
                            <div className="flex justify-between text-slate-300">
                                <span>Source Provider:</span>
                                <strong className="text-amber-300">{inspectingPreset?.sourceType.toUpperCase()}</strong>
                            </div>
                            <div className="flex justify-between text-slate-300">
                                <span>Query Rule:</span>
                                <span className="text-slate-400">{inspectingPreset?.sourceQuery || "Library Smart Query"}</span>
                            </div>
                            <div className="flex justify-between text-slate-300">
                                <span>Target Server:</span>
                                <span className="text-sky-300">{currentServer?.serverName} (Section {selectedSectionKey})</span>
                            </div>
                        </div>

                        {/* Live Library Matching Preview */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-white flex items-center gap-1.5">
                                    <Eye className="h-4 w-4 text-purple-400" /> Live Library Match Evaluation
                                </span>
                                {previewData && (
                                    <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[10px] font-mono">
                                        {previewData.matchCount} / {previewData.totalEvaluated} Matches Found
                                    </Badge>
                                )}
                            </div>

                            {previewLoading ? (
                                <div className="flex items-center justify-center py-8 text-slate-400 gap-2">
                                    <Loader2 className="h-5 w-5 animate-spin text-purple-400" />
                                    <span>Scanning Plex library for matching items...</span>
                                </div>
                            ) : previewData?.sampleMatches && previewData.sampleMatches.length > 0 ? (
                                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                                    {previewData.sampleMatches.map((m, idx) => (
                                        <div key={idx} className="space-y-1 text-center">
                                            <div className="aspect-[2/3] rounded-lg overflow-hidden bg-slate-950 border border-slate-800">
                                                <img
                                                    src={m.thumb || "/placeholder-poster.png"}
                                                    alt={m.title}
                                                    className="w-full h-full object-cover"
                                                />
                                            </div>
                                            <p className="text-[10px] font-medium text-slate-300 truncate" title={m.title}>{m.title}</p>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-xs text-slate-500 italic">No media items in this library matched the preset criteria.</p>
                            )}
                        </div>

                        {/* Where It Shows Up: Preset Placement Configuration */}
                        <div className="space-y-3 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                                    <Monitor className="h-4 w-4 text-amber-400" /> Choose Where It Shows Up (Plex Hubs)
                                </span>
                                <span className="text-[10px] text-slate-400">Target Screens</span>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                                    <div className="flex items-center gap-1.5">
                                        <Home className="h-3.5 w-3.5 text-amber-400" />
                                        <span className="text-xs text-slate-200">Owner Home</span>
                                    </div>
                                    <Switch checked={inspectHome} onCheckedChange={setInspectHome} />
                                </div>
                                <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                                    <div className="flex items-center gap-1.5">
                                        <Users className="h-3.5 w-3.5 text-purple-400" />
                                        <span className="text-xs text-slate-200">Shared Home</span>
                                    </div>
                                    <Switch checked={inspectShared} onCheckedChange={setInspectShared} />
                                </div>
                                <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                                    <div className="flex items-center gap-1.5">
                                        <Star className="h-3.5 w-3.5 text-sky-400" />
                                        <span className="text-xs text-slate-200">Library Recs</span>
                                    </div>
                                    <Switch checked={inspectRecommended} onCheckedChange={setInspectRecommended} />
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-1">
                                <span className="text-xs text-slate-400">Library Browsing Tab Display:</span>
                                <Select value={inspectMode} onValueChange={setInspectMode}>
                                    <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-7 w-48">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">📂 Library Default</SelectItem>
                                        <SelectItem value="hide">🚫 Hide Collection</SelectItem>
                                        <SelectItem value="hideItems">📁 Hide Items in Collection</SelectItem>
                                        <SelectItem value="showItems">🗂️ Show Collection &amp; Items</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        {/* Item Count Limit (maxItems) */}
                        <div className="space-y-2 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Sliders className="h-3.5 w-3.5 text-amber-400" /> Collection Item Limit (Max Items)
                                </Label>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    {inspectMaxItems > 0 ? `${inspectMaxItems} items maximum` : "Unlimited items"}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                                Control how many items appear in this collection (e.g. top 5, 10, or 20 trending items). 0 means unlimited.
                            </p>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={0}
                                    max={500}
                                    value={inspectMaxItems}
                                    onChange={(e) => setInspectMaxItems(parseInt(e.target.value, 10) || 0)}
                                    className="h-8 text-xs bg-slate-900 border-slate-700 w-24 font-bold font-mono text-white"
                                />
                                <div className="flex flex-wrap items-center gap-1">
                                    {[
                                        { label: "5", val: 5 },
                                        { label: "10", val: 10 },
                                        { label: "15", val: 15 },
                                        { label: "20", val: 20 },
                                        { label: "25", val: 25 },
                                        { label: "50", val: 50 },
                                        { label: "Unlimited", val: 0 }
                                    ].map(preset => (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => setInspectMaxItems(preset.val)}
                                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                                inspectMaxItems === preset.val
                                                    ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm"
                                                    : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Excluded Labels */}
                        <div className="space-y-2 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Tag className="h-3.5 w-3.5 text-rose-400" /> Excluded Plex Labels
                                </Label>
                                <span className="text-[10px] text-slate-400 font-mono">Ignore matching media</span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                                Exclude media items tagged with these Plex labels (e.g. placeholder trailers, leaving soon, extras).
                            </p>
                            <Input
                                value={inspectExcludedLabels}
                                onChange={(e) => setInspectExcludedLabels(e.target.value)}
                                placeholder="e.g. trailers, coming_soon, leaving_soon, extras"
                                className="h-8 text-xs bg-slate-900 border-slate-700 font-mono text-rose-300 placeholder:text-slate-600"
                            />
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[10px] text-slate-500">Quick chips:</span>
                                {["trailers", "coming_soon", "leaving_soon", "extras", "sample", "archive"].map(tag => {
                                    const isSelected = inspectExcludedLabels.toLowerCase().includes(tag);
                                    return (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => {
                                                const list = inspectExcludedLabels ? inspectExcludedLabels.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : [];
                                                if (list.includes(tag)) {
                                                    setInspectExcludedLabels(list.filter(s => s !== tag).join(", "));
                                                } else {
                                                    setInspectExcludedLabels([...list, tag].join(", "));
                                                }
                                            }}
                                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                                                isSelected
                                                    ? "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm"
                                                    : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700"
                                            }`}
                                        >
                                            {isSelected ? "✓ " : "+ "}{tag}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Coming Soon Placeholders & Trailer Stubs */}
                        <div className="space-y-2 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Coming Soon Placeholders &amp; Trailer Stubs
                                    </Label>
                                    <p className="text-[10px] text-slate-400">
                                        Automatically generate lightweight trailer stubs and composite banners in your Coming Soon share for missing unacquired titles in this collection.
                                    </p>
                                </div>
                                <Switch
                                    checked={inspectIncludePlaceholders}
                                    onCheckedChange={setInspectIncludePlaceholders}
                                />
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-between">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setInspectModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => inspectingPreset && handleInstallPreset(inspectingPreset)}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs gap-1.5 shadow-md cursor-pointer"
                        >
                            <Trophy className="h-3.5 w-3.5" />
                            <span>Install &amp; Sync Collection to Plex</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Agregarr Collection Placement & Visibility Modal */}
            <Dialog open={placementModalOpen} onOpenChange={setPlacementModalOpen}>
                <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100 max-h-[90vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="pb-3 border-b border-slate-800">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Settings2 className="h-5 w-5 text-amber-400" />
                                <span>Plex Placement &amp; Visibility: {editingCollection?.title}</span>
                            </DialogTitle>
                            <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-950/40 text-xs">
                                Rank #{placementOrderIndex}
                            </Badge>
                        </div>
                        <DialogDescription className="text-xs text-slate-400">
                            Configure where and when this collection appears across your Plex Media Server clients.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 py-3 text-xs pr-1">
                        {/* Section 1: Plex Screen Visibility Targets */}
                        <div className="space-y-3 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                                    <Monitor className="h-4 w-4 text-amber-400" /> Plex Client Screen Targets
                                </span>
                                <span className="text-[10px] text-slate-400">Where will this collection show up?</span>
                            </div>

                            <div className="space-y-2.5 pt-1">
                                {/* Owner Home Screen */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 rounded-md bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                            <Home className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-xs">Server Owner Home Screen</h4>
                                            <p className="text-[10px] text-slate-400">Display collection as a dedicated carousel row on your primary Plex Home screen.</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={placementHome}
                                        onCheckedChange={setPlacementHome}
                                    />
                                </div>

                                {/* Shared Users' Home */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 rounded-md bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                            <Users className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-xs">Shared Friends &amp; Managed Users' Home</h4>
                                            <p className="text-[10px] text-slate-400">Promote on the Home screen for everyone with shared access to this library.</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={placementShared}
                                        onCheckedChange={setPlacementShared}
                                    />
                                </div>

                                {/* Library Recommended */}
                                <div className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-1.5 rounded-md bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                            <Star className="h-4 w-4" />
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-white text-xs">Library Recommended Tab</h4>
                                            <p className="text-[10px] text-slate-400">Display collection row inside the Recommended tab of this specific library.</p>
                                        </div>
                                    </div>
                                    <Switch
                                        checked={placementRecommended}
                                        onCheckedChange={setPlacementRecommended}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 2: Library Browsing Mode & Home Screen Ranking */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {/* Library Browsing Display Mode */}
                            <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2">
                                <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Layers className="h-3.5 w-3.5 text-sky-400" /> Library Browsing Display Mode
                                </Label>
                                <p className="text-[10px] text-slate-400">
                                    Controls how this collection appears inline in the main Library grid.
                                </p>
                                <Select
                                    value={placementMode}
                                    onValueChange={setPlacementMode}
                                >
                                    <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-8">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="default">📂 Library Default (Inherit)</SelectItem>
                                        <SelectItem value="hide">🚫 Hide Collection (Show items only)</SelectItem>
                                        <SelectItem value="hideItems">📁 Hide Items in Collection (Collapse)</SelectItem>
                                        <SelectItem value="showItems">🗂️ Show Collection &amp; Items</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Home Screen Ranking Position */}
                            <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-2">
                                <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Trophy className="h-3.5 w-3.5 text-amber-400" /> Home Screen Ranking (#1 - #99)
                                </Label>
                                <p className="text-[10px] text-slate-400">
                                    Numerical position of this row on the Plex Home &amp; Recommended hubs.
                                </p>
                                <div className="flex gap-2">
                                    <Input
                                        type="number"
                                        min={1}
                                        max={99}
                                        value={placementOrderIndex}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value, 10) || 1;
                                            setPlacementOrderIndex(val);
                                            setPlacementSortPrefix(`!${String(val).padStart(2, '0')}_`);
                                        }}
                                        className="h-8 text-xs bg-slate-900 border-slate-700 w-20 font-bold font-mono"
                                    />
                                    <Input
                                        value={placementSortPrefix}
                                        onChange={(e) => setPlacementSortPrefix(e.target.value)}
                                        placeholder="!01_"
                                        className="h-8 text-xs bg-slate-900 border-slate-700 flex-1 font-mono text-slate-300"
                                        title="Plex Sort Prefix"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Section 3: Day of the Week Scheduling (Agregarr Day Rules) */}
                        <div className="space-y-2.5 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Calendar className="h-3.5 w-3.5 text-amber-400" /> Day of Week Visibility
                                </Label>
                                <div className="flex items-center gap-1.5">
                                    <button
                                        type="button"
                                        onClick={() => setPlacementActiveDays("all")}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                            placementActiveDays === "all" ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:text-white"
                                        }`}
                                    >
                                        Every Day
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPlacementActiveDays("sat,sun")}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                            placementActiveDays === "sat,sun" ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:text-white"
                                        }`}
                                    >
                                        Weekends
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPlacementActiveDays("mon,tue,wed,thu,fri")}
                                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                                            placementActiveDays === "mon,tue,wed,thu,fri" ? "bg-amber-500 text-slate-950" : "bg-slate-800 text-slate-300 hover:text-white"
                                        }`}
                                    >
                                        Weekdays
                                    </button>
                                </div>
                            </div>

                            <p className="text-[10px] text-slate-400">
                                Limit collection promotion on Home/Recommended to specific days of the week:
                            </p>

                            <div className="grid grid-cols-7 gap-1.5 pt-1">
                                {[
                                    { code: "mon", label: "Mon" },
                                    { code: "tue", label: "Tue" },
                                    { code: "wed", label: "Wed" },
                                    { code: "thu", label: "Thu" },
                                    { code: "fri", label: "Fri" },
                                    { code: "sat", label: "Sat" },
                                    { code: "sun", label: "Sun" }
                                ].map(day => {
                                    const isSelected = placementActiveDays === "all" || placementActiveDays.toLowerCase().includes(day.code);
                                    return (
                                        <button
                                            key={day.code}
                                            type="button"
                                            onClick={() => handleToggleDay(day.code)}
                                            className={`py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                                                isSelected
                                                    ? "bg-amber-500 text-slate-950 border-amber-400 shadow-sm"
                                                    : "bg-slate-900 text-slate-500 border-slate-800 hover:border-slate-700"
                                            }`}
                                        >
                                            {day.label}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 4: Time of Day Scheduling (Agregarr Time Rules) */}
                        <div className="space-y-2 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
                            <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                <Clock className="h-3.5 w-3.5 text-indigo-400" /> Time of Day Scheduling
                            </Label>
                            <p className="text-[10px] text-slate-400">
                                Automatically rotate collection visibility on Home based on the hour of the day:
                            </p>
                            <Select
                                value={placementActiveTimeRange}
                                onValueChange={setPlacementActiveTimeRange}
                            >
                                <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-8">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all_day">🕒 All Day (24/7 Always Active)</SelectItem>
                                    <SelectItem value="evening">🌙 Prime Time / Evening (6:00 PM – 11:59 PM)</SelectItem>
                                    <SelectItem value="late_night">🦉 Late Night (11:00 PM – 4:00 AM)</SelectItem>
                                    <SelectItem value="daytime">☀️ Daytime (8:00 AM – 5:00 PM)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Section 5: Seasonal Calendar Scheduling */}
                        <div className="space-y-3 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
                                        <CalendarClock className="h-3.5 w-3.5 text-amber-400" /> Seasonal Date Window
                                    </h4>
                                    <p className="text-[10px] text-slate-400">Enable automatic promotion only during specific months of the year (e.g. Halloween or Holiday seasons).</p>
                                </div>
                                <Switch
                                    checked={placementIsSeasonal}
                                    onCheckedChange={setPlacementIsSeasonal}
                                />
                            </div>

                            {placementIsSeasonal && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80">
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-slate-400">Start Month:</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={12}
                                            value={placementStartMonth}
                                            onChange={(e) => setPlacementStartMonth(parseInt(e.target.value, 10) || 1)}
                                            className="h-8 text-xs bg-slate-900 border-slate-700"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-slate-400">Start Day:</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={31}
                                            value={placementStartDay}
                                            onChange={(e) => setPlacementStartDay(parseInt(e.target.value, 10) || 1)}
                                            className="h-8 text-xs bg-slate-900 border-slate-700"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-slate-400">End Month:</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={12}
                                            value={placementEndMonth}
                                            onChange={(e) => setPlacementEndMonth(parseInt(e.target.value, 10) || 12)}
                                            className="h-8 text-xs bg-slate-900 border-slate-700"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-[10px] text-slate-400">End Day:</Label>
                                        <Input
                                            type="number"
                                            min={1}
                                            max={31}
                                            value={placementEndDay}
                                            onChange={(e) => setPlacementEndDay(parseInt(e.target.value, 10) || 31)}
                                            className="h-8 text-xs bg-slate-900 border-slate-700"
                                        />
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Section 6: Collection Item Limit (maxItems) */}
                        <div className="space-y-2 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Sliders className="h-3.5 w-3.5 text-amber-400" /> Collection Item Limit (Max Items)
                                </Label>
                                <span className="text-[10px] text-slate-400 font-mono">
                                    {placementMaxItems > 0 ? `${placementMaxItems} items maximum` : "Unlimited items"}
                                </span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                                Control how many items appear in this collection (e.g. top 5, 10, or 20 trending items). 0 means unlimited.
                            </p>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number"
                                    min={0}
                                    max={500}
                                    value={placementMaxItems}
                                    onChange={(e) => setPlacementMaxItems(parseInt(e.target.value, 10) || 0)}
                                    className="h-8 text-xs bg-slate-900 border-slate-700 w-24 font-bold font-mono text-white"
                                />
                                <div className="flex flex-wrap items-center gap-1">
                                    {[
                                        { label: "5", val: 5 },
                                        { label: "10", val: 10 },
                                        { label: "15", val: 15 },
                                        { label: "20", val: 20 },
                                        { label: "25", val: 25 },
                                        { label: "50", val: 50 },
                                        { label: "Unlimited", val: 0 }
                                    ].map(preset => (
                                        <button
                                            key={preset.label}
                                            type="button"
                                            onClick={() => setPlacementMaxItems(preset.val)}
                                            className={`px-2 py-1 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                                placementMaxItems === preset.val
                                                    ? "bg-amber-500 text-slate-950 border-amber-400 font-black shadow-sm"
                                                    : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                                            }`}
                                        >
                                            {preset.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Section 7: Excluded Plex Labels */}
                        <div className="space-y-2 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Tag className="h-3.5 w-3.5 text-rose-400" /> Excluded Plex Labels
                                </Label>
                                <span className="text-[10px] text-slate-400 font-mono">Ignore matching media</span>
                            </div>
                            <p className="text-[10px] text-slate-400">
                                Exclude media items tagged with these Plex labels (e.g. placeholder trailers, leaving soon, extras). Items with these labels will never be added to this collection.
                            </p>
                            <Input
                                value={placementExcludedLabels}
                                onChange={(e) => setPlacementExcludedLabels(e.target.value)}
                                placeholder="e.g. trailers, coming_soon, leaving_soon, extras"
                                className="h-8 text-xs bg-slate-900 border-slate-700 font-mono text-rose-300 placeholder:text-slate-600"
                            />
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span className="text-[10px] text-slate-500">Quick chips:</span>
                                {["trailers", "coming_soon", "leaving_soon", "extras", "sample", "archive"].map(tag => {
                                    const isSelected = placementExcludedLabels.toLowerCase().includes(tag);
                                    return (
                                        <button
                                            key={tag}
                                            type="button"
                                            onClick={() => {
                                                const list = placementExcludedLabels ? placementExcludedLabels.split(",").map(s => s.trim().toLowerCase()).filter(Boolean) : [];
                                                if (list.includes(tag)) {
                                                    setPlacementExcludedLabels(list.filter(s => s !== tag).join(", "));
                                                } else {
                                                    setPlacementExcludedLabels([...list, tag].join(", "));
                                                }
                                            }}
                                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border transition-all cursor-pointer ${
                                                isSelected
                                                    ? "bg-rose-500/20 text-rose-300 border-rose-500/50 shadow-sm"
                                                    : "bg-slate-900 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700"
                                            }`}
                                        >
                                            {isSelected ? "✓ " : "+ "}{tag}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Section 8: Coming Soon Placeholders & Trailer Stubs */}
                        <div className="space-y-2 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Coming Soon Placeholders &amp; Trailer Stubs
                                    </Label>
                                    <p className="text-[10px] text-slate-400">
                                        When enabled, items in this collection missing from your library will automatically generate trailer stubs (.strm), poster banners, and metadata in your Coming Soon share.
                                    </p>
                                </div>
                                <Switch
                                    checked={placementIncludePlaceholders}
                                    onCheckedChange={setPlacementIncludePlaceholders}
                                />
                            </div>
                        </div>

                        {placementSavedMsg && (
                            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in-50">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                <span>{placementSavedMsg}</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-between">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPlacementModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={savingPlacement}
                            onClick={handleSavePlacement}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs gap-1.5 shadow-md cursor-pointer"
                        >
                            {savingPlacement ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            <span>Save &amp; Sync Placement to Plex</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Placeholder Creation Modal */}
            <Dialog open={placeholderModalOpen} onOpenChange={setPlaceholderModalOpen}>
                <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100 max-h-[90vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="pb-2 border-b border-slate-800 flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Tag className="h-5 w-5 text-amber-400" />
                                <span>Create Coming Soon Placeholder</span>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-400 truncate">
                                {selectedPlaceholderItem?.title} ({selectedPlaceholderItem?.year || "Upcoming"})
                            </DialogDescription>
                        </div>
                        <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setPosterPickerModalOpen(true)}
                            className="h-7 text-[11px] gap-1.5 border-amber-500/40 hover:bg-amber-950/40 text-amber-200 hover:text-amber-100 shrink-0"
                        >
                            <ImageIcon className="h-3.5 w-3.5 text-amber-400" /> Pull Poster from Plex
                        </Button>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 py-3 text-xs pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                            {/* Preview Poster */}
                            <div className="sm:col-span-5 flex flex-col items-center justify-center space-y-2">
                                <div className="relative aspect-[2/3] w-36 rounded-xl overflow-hidden bg-slate-950 border-2 border-slate-700 shadow-xl select-none">
                                    {placeholderPreviewDataUrl ? (
                                        <img src={placeholderPreviewDataUrl} alt="Preview" className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="relative w-full h-full flex flex-col justify-between p-2.5 bg-gradient-to-b from-slate-900 via-slate-950 to-black text-slate-100">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xl">🎬</span>
                                                {placeholderPreviewLoading && <Loader2 className="h-3 w-3 animate-spin text-amber-400" />}
                                            </div>
                                            <div className="text-center space-y-0.5">
                                                <p className="text-[11px] font-black truncate text-white">{selectedPlaceholderItem?.title || "Upcoming Media"}</p>
                                                <p className="text-[9px] text-slate-400">Coming Soon</p>
                                            </div>
                                            <div className="py-1 px-1.5 rounded text-[9px] font-black text-center tracking-wider text-white shadow-md bg-amber-500 text-slate-950">
                                                {placeholderModalBannerText}
                                            </div>
                                        </div>
                                    )}
                                    {placeholderPreviewLoading && placeholderPreviewDataUrl && (
                                        <div className="absolute top-1.5 right-1.5 p-1 rounded-full bg-slate-950/80 border border-slate-800 backdrop-blur-md">
                                            <Loader2 className="h-3 w-3 animate-spin text-amber-400" />
                                        </div>
                                    )}
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">Live Composite Preview</span>
                            </div>

                            {/* Controls */}
                            <div className="sm:col-span-7 space-y-3">
                                <div className="space-y-1">
                                    <Label className="text-xs text-slate-300">Banner Preset:</Label>
                                    <Select
                                        value={placeholderModalBannerType}
                                        onValueChange={(val: any) => {
                                            const found = AGREGARR_BANNER_PRESETS.find(p => p.id === val);
                                            setPlaceholderModalBannerType(val);
                                            const defaultText = found?.defaultText || "NOT REQUESTED";
                                            setPlaceholderModalBannerText(defaultText);
                                            if (found?.theme) setPlaceholderModalBannerTheme(found.theme);
                                            if (found?.pos) setPlaceholderModalBannerPosition(found.pos);
                                            generatePlaceholderPreview(
                                                selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
                                                selectedPlaceholderItem?.title || simSelectedRealItem?.title || "Sample Media",
                                                val,
                                                defaultText,
                                                found?.theme || placeholderModalBannerTheme,
                                                found?.pos || placeholderModalBannerPosition
                                            );
                                        }}
                                    >
                                        <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-64">
                                            {AGREGARR_BANNER_PRESETS.map(p => (
                                                <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-slate-300">Banner Text Template:</Label>
                                        <span className="text-[10px] text-amber-400 font-mono">Click chips to insert:</span>
                                    </div>
                                    <Input
                                        value={placeholderModalBannerText}
                                        onChange={(e) => {
                                            setPlaceholderModalBannerText(e.target.value);
                                            generatePlaceholderPreview(
                                                selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
                                                selectedPlaceholderItem?.title || simSelectedRealItem?.title || "Sample Media",
                                                placeholderModalBannerType,
                                                e.target.value
                                            );
                                        }}
                                        className="h-8 text-xs bg-slate-950 border-slate-800 font-mono text-white"
                                        placeholder="e.g. DIGITAL RELEASE ON {date}"
                                    />

                                    {/* Variable Insertion Chips */}
                                    <div className="flex flex-wrap gap-1 pt-1">
                                        {[
                                            { token: "{date}", label: "+ {date}" },
                                            { token: "{days}", label: "+ {days}" },
                                            { token: "{title}", label: "+ {title}" },
                                            { token: "{source}", label: "+ {source}" },
                                            { token: "{status}", label: "+ {status}" },
                                            { token: "{reason}", label: "+ {reason}" },
                                            { token: "{quality}", label: "+ {quality}" }
                                        ].map(chip => (
                                            <button
                                                key={chip.token}
                                                type="button"
                                                onClick={() => handleInsertToken(chip.token)}
                                                className="px-2 py-0.5 rounded-md bg-amber-500/20 hover:bg-amber-500 hover:text-slate-950 text-amber-300 border border-amber-500/30 text-[10px] font-mono font-bold transition-all cursor-pointer"
                                            >
                                                {chip.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-slate-300">Color Theme:</Label>
                                        <Select
                                            value={placeholderModalBannerTheme}
                                            onValueChange={(val: any) => {
                                                setPlaceholderModalBannerTheme(val);
                                                generatePlaceholderPreview(
                                                    selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
                                                    selectedPlaceholderItem?.title || simSelectedRealItem?.title || "Sample Media",
                                                    placeholderModalBannerType,
                                                    placeholderModalBannerText,
                                                    val
                                                );
                                            }}
                                        >
                                            <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="crimson-red">🔴 Crimson Red</SelectItem>
                                                <SelectItem value="amber-gold">💛 Amber Gold</SelectItem>
                                                <SelectItem value="indigo-purple">🟣 Indigo Purple</SelectItem>
                                                <SelectItem value="emerald-green">🟢 Emerald Green</SelectItem>
                                                <SelectItem value="cinematic-blue">🔵 Cinematic Blue</SelectItem>
                                                <SelectItem value="cyber-neon">⚡ Cyber Neon</SelectItem>
                                                <SelectItem value="glass">✨ Obsidian Glass</SelectItem>
                                                <SelectItem value="netflix-red">🟥 Netflix Red</SelectItem>
                                                <SelectItem value="slate-frosted">🛡️ Slate Frosted</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1">
                                        <Label className="text-xs text-slate-300">Position:</Label>
                                        <Select
                                            value={placeholderModalBannerPosition}
                                            onValueChange={(val: any) => {
                                                setPlaceholderModalBannerPosition(val);
                                                generatePlaceholderPreview(
                                                    selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
                                                    selectedPlaceholderItem?.title || simSelectedRealItem?.title || "Sample Media",
                                                    placeholderModalBannerType,
                                                    placeholderModalBannerText,
                                                    placeholderModalBannerTheme,
                                                    val
                                                );
                                            }}
                                        >
                                            <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="bottom">Bottom Overlay</SelectItem>
                                                <SelectItem value="top">Top Overlay</SelectItem>
                                                <SelectItem value="corner">45° Corner Ribbon</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {placeholderSuccessMsg && (
                            <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-800 text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in-50">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                <span>{placeholderSuccessMsg}</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-between">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setPlaceholderModalOpen(false)}>
                            Close
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={generatingPlaceholder}
                            onClick={handleCreatePlaceholder}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs gap-1.5 shadow-md cursor-pointer"
                        >
                            {generatingPlaceholder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Tag className="h-3.5 w-3.5" />}
                            <span>Create &amp; Deploy Card</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* YouTube Trailer Player Modal */}
            <Dialog open={trailerModalOpen} onOpenChange={setTrailerModalOpen}>
                <DialogContent className="max-w-4xl bg-slate-950 border-slate-800 text-slate-100 p-6 overflow-hidden">
                    <DialogHeader className="pb-3 border-b border-slate-800 flex flex-row items-center justify-between">
                        <div className="space-y-0.5">
                            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Play className="h-4 w-4 text-rose-500 fill-rose-500" />
                                <span>{activeTrailerTitle || "Official Trailer"}</span>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-400">
                                {activeTrailer?.name || "Official YouTube Trailer / Teaser Preview"}
                            </DialogDescription>
                        </div>
                        {activeTrailer?.type && (
                            <Badge className="bg-rose-950 text-rose-300 border border-rose-800 text-xs font-mono">
                                {activeTrailer.type.toUpperCase()}
                            </Badge>
                        )}
                    </DialogHeader>

                    <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-slate-800 shadow-2xl my-2">
                        {trailerLoading ? (
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
                                <Loader2 className="h-8 w-8 animate-spin text-rose-500" />
                                <span className="text-xs font-medium">Fetching official trailer from TMDb &amp; YouTube...</span>
                            </div>
                        ) : activeTrailer?.key ? (
                            <iframe
                                className="w-full h-full border-0"
                                src={`https://www.youtube-nocookie.com/embed/${activeTrailer.key}?autoplay=1&rel=0&modestbranding=1`}
                                title={activeTrailerTitle}
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center text-slate-400">
                                <div className="p-3 rounded-full bg-slate-900 border border-slate-800 text-rose-400">
                                    <Play className="h-8 w-8" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-bold text-white">No Official Trailer Found</p>
                                    <p className="text-xs text-slate-400 max-w-sm">
                                        TMDb does not have an official trailer registered for "{activeTrailerTitle}".
                                    </p>
                                </div>
                                <a
                                    href={`https://www.youtube.com/results?search_query=${encodeURIComponent(activeTrailerTitle + " official trailer")}`}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-all shadow-md"
                                >
                                    <Play className="h-3.5 w-3.5 fill-white" /> Search on YouTube
                                </a>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-2 border-t border-slate-800 flex justify-end">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setTrailerModalOpen(false)}
                            className="border-slate-800 text-slate-300 hover:text-white"
                        >
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Plex Real Media Poster Picker Modal */}
            <PlexPosterPickerModal
                open={posterPickerModalOpen}
                onOpenChange={setPosterPickerModalOpen}
                serverId={selectedServerId}
                sectionKey={selectedSectionKey}
                serverName={currentServer?.serverName}
                servers={servers}
                onSelect={handleSelectRealPoster}
            />
        </div>
    );
}

export default AgregarrStudio;
