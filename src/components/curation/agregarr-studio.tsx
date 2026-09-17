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
    Play,
    Filter,
    Clapperboard,
    ListFilter
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
    getCollectionMediaPreviewAction,
    getPlaceholderPreviewDataUrlAction,
    createPlaceholderItemAction,
    getTmdbTrailerAction,
    saveComingSoonSharesAction,
    saveServerStorageConfigAction,
    validateDirectoryPathAction,
    cleanupAvailablePlaceholdersAction,
    fixPlaceholderPermissionsAction,
    getCurationSettingsAction,
    saveCurationSettingsAction,
    toggleCurationLibrarySectionAction,
    toggleAllCurationServerSectionsAction,
    runFullCurationSyncAction,
    getArrInstancesListAction,
    deployFilteredRecentlyAddedHubAction,
    tagAllPlaceholdersInPlexAction
} from "@/app/curation-actions";
import {
    COLLECTION_PRESETS,
    CollectionPreset
} from "@/lib/curation/presets";

export const AGREGARR_BANNER_PRESETS = [
    { id: "downloading_soon", label: "⏳ Downloading Soon", defaultText: "DOWNLOADING SOON", theme: "emerald-green", pos: "bottom" as const },
    { id: "coming_soon_monitored", label: "⏳ Coming Soon Monitored", defaultText: "COMING SOON MONITORED", theme: "amber-gold", pos: "bottom" as const },
    { id: "not_requested_yet", label: "🔥 Not Requested Yet", defaultText: "NOT REQUESTED YET", theme: "crimson-red", pos: "bottom" as const },
    { id: "digital_release", label: "⚡ Digital Release on {date}", defaultText: "DIGITAL RELEASE ON {date}", theme: "cinematic-blue", pos: "bottom" as const },
    { id: "countdown", label: "⏳ Streaming in {days} Days", defaultText: "STREAMING IN {days} DAYS", theme: "indigo-purple", pos: "bottom" as const },
    { id: "streaming_on", label: "✨ Popular on {source}", defaultText: "POPULAR ON {source}", theme: "indigo-purple", pos: "bottom" as const },
    { id: "quality_edition", label: "💎 {quality} • {edition}", defaultText: "{quality} • {edition}", theme: "cyber-neon", pos: "bottom" as const },
    { id: "custom", label: "⚙️ Custom Template", defaultText: "{title} ({year}) • {status}", theme: "cyber-neon", pos: "bottom" as const }
];

interface PlexServerItem {
    serverId: string;
    serverName: string;
    sections?: Array<{ key: string | number; title: string; type: string }>;
}

export function AgregarrStudio() {
    const [subTab, setSubTab] = useState<"collections" | "presets" | "coming_soon">("collections");
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
    const [collectionsFilter, setCollectionsFilter] = useState<"all" | "home" | "recommended" | "library">("all");
    const [collectionSearchQuery, setCollectionSearchQuery] = useState("");
    const [syncingCollId, setSyncingCollId] = useState<string | null>(null);
    const [syncMessage, setSyncMessage] = useState<{ id: string; success: boolean; text: string } | null>(null);
    
    // Create Custom Collection Modal States
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
    const [newCollPromotedHome, setNewCollPromotedHome] = useState(true);
    const [newCollPromotedShared, setNewCollPromotedShared] = useState(true);
    const [newCollPromotedRecommended, setNewCollPromotedRecommended] = useState(true);
    const [newCollMode, setNewCollMode] = useState<string>("default");
    const [newCollActiveDays, setNewCollActiveDays] = useState<string>("all");
    const [newCollActiveTimeRange, setNewCollActiveTimeRange] = useState<string>("all_day");
    const [newCollMaxItems, setNewCollMaxItems] = useState<number>(0);
    const [newCollExcludedLabels, setNewCollExcludedLabels] = useState<string>("");
    const [newCollIncludePlaceholders, setNewCollIncludePlaceholders] = useState<boolean>(false);
    const [creatingCollection, setCreatingCollection] = useState(false);

    // Collection Ordering & Seasonal Sync States
    const [savingOrder, setSavingOrder] = useState(false);
    const [orderSavedMsg, setOrderSavedMsg] = useState<string | null>(null);
    const [syncingSeasonal, setSyncingSeasonal] = useState(false);
    const [seasonalSyncMsg, setSeasonalSyncMsg] = useState<{ success: boolean; text: string } | null>(null);
    const [importingPlexCollections, setImportingPlexCollections] = useState(false);
    const [plexImportMsg, setPlexImportMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Collection Media Inspector Modal States
    const [mediaInspectorModalOpen, setMediaInspectorModalOpen] = useState(false);
    const [inspectingCollection, setInspectingCollection] = useState<any | null>(null);
    const [collectionMediaLoading, setCollectionMediaLoading] = useState(false);
    const [collectionMediaData, setCollectionMediaData] = useState<{ totalCount: number; inLibraryCount: number; missingCount: number; items: any[] } | null>(null);
    const [collectionMediaSearch, setCollectionMediaSearch] = useState("");
    const [collectionMediaFilter, setCollectionMediaFilter] = useState<"all" | "in_library" | "missing" | "coming_soon" | "not_requested">("all");

    // Presets Library Search & Filter States
    const [presetsCategoryFilter, setPresetsCategoryFilter] = useState<string>("all");
    const [presetsMediaTypeFilter, setPresetsMediaTypeFilter] = useState<"auto" | "all" | "movie" | "show">("auto");
    const [presetsSearchQuery, setPresetsSearchQuery] = useState("");

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

    // Comprehensive Placement & Visibility Modal States
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

    // YouTube Trailer Player Modal States
    const [trailerModalOpen, setTrailerModalOpen] = useState(false);
    const [trailerLoading, setTrailerLoading] = useState(false);
    const [activeTrailer, setActiveTrailer] = useState<any | null>(null);
    const [activeTrailerTitle, setActiveTrailerTitle] = useState<string>("");

    // Placeholder Creator Modal States
    const [placeholderModalOpen, setPlaceholderModalOpen] = useState(false);
    const [selectedPlaceholderItem, setSelectedPlaceholderItem] = useState<any | null>(null);
    const [placeholderModalBannerType, setPlaceholderModalBannerType] = useState<string>("not_requested_yet");
    const [placeholderModalBannerText, setPlaceholderModalBannerText] = useState("NOT REQUESTED YET");
    const [placeholderModalBannerTheme, setPlaceholderModalBannerTheme] = useState<string>("crimson-red");
    const [placeholderModalBannerPosition, setPlaceholderModalBannerPosition] = useState<"bottom" | "top" | "corner">("bottom");
    const [placeholderModalBannerFontSize, setPlaceholderModalBannerFontSize] = useState<number>(44);
    const [placeholderDaysThreshold, setPlaceholderDaysThreshold] = useState<number>(90);
    const [bannerTemplates, setBannerTemplates] = useState<Record<string, { text?: string; theme?: string; pos?: "bottom" | "top" | "corner"; fontSize?: number }>>({});
    const [generatingPlaceholder, setGeneratingPlaceholder] = useState(false);
    const [placeholderPreviewDataUrl, setPlaceholderPreviewDataUrl] = useState<string | null>(null);
    const [placeholderPreviewLoading, setPlaceholderPreviewLoading] = useState<boolean>(false);
    const [placeholderSuccessMsg, setPlaceholderSuccessMsg] = useState<string | null>(null);

    // Live Simulator & Template Variable States
    const [posterPickerModalOpen, setPosterPickerModalOpen] = useState(false);
    const [simSelectedRealItem, setSimSelectedRealItem] = useState<PlexMediaStreamInfo | null>(null);
    const [simPosterUrl, setSimPosterUrl] = useState<string>("https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80");
    const [templateVarTitle, setTemplateVarTitle] = useState<string>("Sample Media");
    const [templateVarYear, setTemplateVarYear] = useState<string>("2026");
    const [templateVarDate, setTemplateVarDate] = useState<string>("10/31/2026");
    const [templateVarDays, setTemplateVarDays] = useState<number>(7);
    const [templateVarSource, setTemplateVarSource] = useState<string>("Netflix");
    const [templateVarNetwork, setTemplateVarNetwork] = useState<string>("HBO");
    const [templateVarStatus, setTemplateVarStatus] = useState<string>("Downloading Soon");
    const [templateVarReason, setTemplateVarReason] = useState<string>("Trending Release");
    const [templateVarQuality, setTemplateVarQuality] = useState<string>("4K UHD");
    const [templateVarEdition, setTemplateVarEdition] = useState<string>("Director's Cut");
    const [templateVarGenre, setTemplateVarGenre] = useState<string>("Sci-Fi");
    const [savingBannerDefault, setSavingBannerDefault] = useState<boolean>(false);
    const [bannerDefaultSavedMsg, setBannerDefaultSavedMsg] = useState<string | null>(null);

    // Filtered Recently Added Smart Collection Hub Deployer
    const [deployingRecentlyAdded, setDeployingRecentlyAdded] = useState<boolean>(false);
    const [taggingPlaceholders, setTaggingPlaceholders] = useState<boolean>(false);
    const [recentlyAddedDeployMsg, setRecentlyAddedDeployMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Multi-Instance Radarr & Sonarr Mapping
    const [arrInstances, setArrInstances] = useState<{
        radarr: Array<{ id: string; name: string; type?: string; url?: string; externalUrl?: string }>;
        sonarr: Array<{ id: string; name: string; type?: string; url?: string; externalUrl?: string }>;
    }>({ radarr: [], sonarr: [] });
    const [serverStorageConfig, setServerStorageConfig] = useState<Record<string, { sharePath?: string; movieSharePath?: string; tvSharePath?: string; radarrId?: string; sonarrId?: string }>>({});

    // Coming Soon Shares & Disk Settings
    const [comingSoonShares, setComingSoonShares] = useState<Record<string, string>>({});
    const [savingShares, setSavingShares] = useState(false);
    const [sharesSavedMsg, setSharesSavedMsg] = useState(false);
    const [pathCheckResults, setPathCheckResults] = useState<Record<string, { checking: boolean; success?: boolean; msg?: string }>>({});
    const [cleaningPlaceholders, setCleaningPlaceholders] = useState(false);
    const [fixingPermissions, setFixingPermissions] = useState(false);
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

    // Toggle ALL sections on the selected server for Agregarr
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

    const handleFixPermissions = async () => {
        setFixingPermissions(true);
        setCleanupResultMsg(null);
        try {
            const res = await fixPlaceholderPermissionsAction();
            setCleanupResultMsg({
                success: res.success,
                text: res.message || "Permissions updated."
            });
            setTimeout(() => setCleanupResultMsg(null), 6000);
        } catch (err: any) {
            setCleanupResultMsg({
                success: false,
                text: err.message || "Failed fixing placeholder permissions."
            });
        } finally {
            setFixingPermissions(false);
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
                    if (settingsRes.serverStorageConfig) setServerStorageConfig(settingsRes.serverStorageConfig);
                    if (settingsRes.placeholderBannerFontSize) setPlaceholderModalBannerFontSize(settingsRes.placeholderBannerFontSize);
                    if (settingsRes.placeholderBannerPosition) setPlaceholderModalBannerPosition(settingsRes.placeholderBannerPosition as any);
                    if (settingsRes.placeholderBannerTheme) setPlaceholderModalBannerTheme(settingsRes.placeholderBannerTheme);
                    if (settingsRes.placeholderCustomText) setPlaceholderModalBannerText(settingsRes.placeholderCustomText);
                    if (settingsRes.placeholderDaysThreshold !== undefined) setPlaceholderDaysThreshold(settingsRes.placeholderDaysThreshold);
                    if (settingsRes.placeholderBannerTemplates) {
                        try {
                            const parsed = typeof settingsRes.placeholderBannerTemplates === "string"
                                ? JSON.parse(settingsRes.placeholderBannerTemplates)
                                : settingsRes.placeholderBannerTemplates;
                            if (parsed && typeof parsed === "object") {
                                setBannerTemplates(parsed);
                                const currentTpl = parsed[placeholderModalBannerType] || parsed["not_requested_yet"] || parsed["downloading_soon"];
                                if (currentTpl) {
                                    if (currentTpl.text !== undefined) setPlaceholderModalBannerText(currentTpl.text);
                                    if (currentTpl.theme) setPlaceholderModalBannerTheme(currentTpl.theme);
                                    if (currentTpl.pos) setPlaceholderModalBannerPosition(currentTpl.pos as any);
                                    if (currentTpl.fontSize) setPlaceholderModalBannerFontSize(currentTpl.fontSize);
                                }
                            }
                        } catch (e) {
                            console.warn("Failed parsing banner templates:", e);
                        }
                    }
                    setCurationSyncCollections(settingsRes.curationSyncCollections ?? true);
                    setCurationSyncSchedule(settingsRes.curationSyncSchedule || "every_6_hours");
                    setCurationLastRunAt(settingsRes.curationLastRunAt || null);
                    setCurationLastRunStatus(settingsRes.curationLastRunStatus || null);
                    if (settingsRes.enabledServersForCollections) {
                        setEnabledServersForCollections(settingsRes.enabledServersForCollections);
                    }
                }

                const arrRes = await getArrInstancesListAction();
                if (arrRes.success) {
                    setArrInstances({
                        radarr: (arrRes.radarr as any) || [],
                        sonarr: (arrRes.sonarr as any) || []
                    });
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

    // Reorder Collections Handlers
    const handleMoveCollection = (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= collections.length) return;

        const copy = [...collections];
        const temp = copy[index];
        copy[index] = copy[targetIndex];
        copy[targetIndex] = temp;

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
                if (mediaInspectorModalOpen && inspectingCollection?.id === collId) {
                    handleInspectCollectionMedia(inspectingCollection);
                }
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

    // Create Custom Collection Handler
    const handleCreateCustomCollection = async () => {
        if (!newCollTitle.trim()) return;
        setCreatingCollection(true);
        try {
            const maxOrder = collections.reduce((max, c) => Math.max(max, c.orderIndex || 0), 0);
            const nextOrder = maxOrder + 1;
            const sortPrefix = `!${String(nextOrder).padStart(2, '0')}_`;

            const res = await saveMediaCollectionAction({
                title: newCollTitle.trim(),
                summary: newCollSummary.trim(),
                type: "movie",
                category: "custom",
                serverId: selectedServerId,
                sectionKey: selectedSectionKey,
                sourceType: newCollSourceType,
                sourceQuery: newCollSourceQuery.trim(),
                posterUrl: newCollPosterUrl.trim() || undefined,
                orderIndex: nextOrder,
                sortPrefix,
                promotedToHome: newCollPromotedHome,
                promotedToRecommended: newCollPromotedRecommended,
                promotedToSharedHome: newCollPromotedShared,
                collectionMode: newCollMode,
                activeDays: newCollActiveDays,
                activeTimeRange: newCollActiveTimeRange,
                isSeasonal: newCollIsSeasonal,
                scheduleStartMonth: newCollIsSeasonal ? Number(newCollStartMonth) : null,
                scheduleStartDay: newCollIsSeasonal ? Number(newCollStartDay) : null,
                scheduleEndMonth: newCollIsSeasonal ? Number(newCollEndMonth) : null,
                scheduleEndDay: newCollIsSeasonal ? Number(newCollEndDay) : null,
                maxItems: Number(newCollMaxItems),
                excludedLabels: newCollExcludedLabels.trim(),
                includePlaceholders: newCollIncludePlaceholders
            });

            if (res.success && res.collection) {
                await syncCollectionToPlexAction(res.collection.id);
                loadCollections();
                setCreateModalOpen(false);
                setNewCollTitle("");
                setNewCollSummary("");
                setNewCollSourceQuery("");
                setNewCollPosterUrl("");
            }
        } catch (e) {
            console.error("Failed creating collection:", e);
        } finally {
            setCreatingCollection(false);
        }
    };

    // Inspect Collection Media Action (Collection Media Inspector Modal)
    const handleInspectCollectionMedia = async (coll: any) => {
        setInspectingCollection(coll);
        setCollectionMediaLoading(true);
        setCollectionMediaData(null);
        setCollectionMediaSearch("");
        setCollectionMediaFilter("all");
        setMediaInspectorModalOpen(true);
        try {
            const res = await getCollectionMediaPreviewAction(coll.id);
            if (res.success) {
                setCollectionMediaData(res as any);
            } else {
                setCollectionMediaData({ totalCount: 0, inLibraryCount: 0, missingCount: 0, items: [] });
            }
        } catch (e) {
            console.error("Failed inspecting collection media:", e);
            setCollectionMediaData({ totalCount: 0, inLibraryCount: 0, missingCount: 0, items: [] });
        } finally {
            setCollectionMediaLoading(false);
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

    // Effective Banner Config Resolver for any Preset ID
    const getEffectiveBannerConfig = (presetId: string, customTemplates = bannerTemplates) => {
        const preset = AGREGARR_BANNER_PRESETS.find(p => p.id === presetId);
        const custom = customTemplates[presetId] || {};
        return {
            text: custom.text !== undefined ? custom.text : (preset?.defaultText || "NOT REQUESTED YET"),
            theme: custom.theme || preset?.theme || "indigo-purple",
            pos: (custom.pos || preset?.pos || "bottom") as "bottom" | "top" | "corner",
            fontSize: custom.fontSize || (preset as any)?.fontSize || 44
        };
    };

    // Preset Selection Handler
    const handleSelectBannerPreset = (val: string) => {
        setPlaceholderModalBannerType(val);
        const config = getEffectiveBannerConfig(val);
        setPlaceholderModalBannerText(config.text);
        setPlaceholderModalBannerTheme(config.theme);
        setPlaceholderModalBannerPosition(config.pos);
        setPlaceholderModalBannerFontSize(config.fontSize);

        generatePlaceholderPreview(
            selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
            selectedPlaceholderItem?.title || simSelectedRealItem?.title || templateVarTitle || "Sample Media",
            val,
            config.text,
            config.theme,
            config.pos,
            config.fontSize,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason,
            templateVarYear,
            templateVarEdition,
            templateVarGenre,
            templateVarQuality,
            templateVarNetwork
        );
    };

    // Text Change Handler (updates active preset in bannerTemplates)
    const handleBannerTextChange = (text: string) => {
        setPlaceholderModalBannerText(text);
        setBannerTemplates(prev => ({
            ...prev,
            [placeholderModalBannerType]: {
                ...(prev[placeholderModalBannerType] || {}),
                text,
                theme: placeholderModalBannerTheme,
                pos: placeholderModalBannerPosition,
                fontSize: placeholderModalBannerFontSize
            }
        }));
        generatePlaceholderPreview(
            selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
            selectedPlaceholderItem?.title || simSelectedRealItem?.title || templateVarTitle || "Sample Media",
            placeholderModalBannerType,
            text,
            placeholderModalBannerTheme,
            placeholderModalBannerPosition,
            placeholderModalBannerFontSize,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason,
            templateVarYear,
            templateVarEdition,
            templateVarGenre,
            templateVarQuality,
            templateVarNetwork
        );
    };

    // Theme Change Handler (updates active preset in bannerTemplates)
    const handleBannerThemeChange = (theme: string) => {
        setPlaceholderModalBannerTheme(theme);
        setBannerTemplates(prev => ({
            ...prev,
            [placeholderModalBannerType]: {
                ...(prev[placeholderModalBannerType] || {}),
                text: placeholderModalBannerText,
                theme,
                pos: placeholderModalBannerPosition,
                fontSize: placeholderModalBannerFontSize
            }
        }));
        generatePlaceholderPreview(
            selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
            selectedPlaceholderItem?.title || simSelectedRealItem?.title || templateVarTitle || "Sample Media",
            placeholderModalBannerType,
            placeholderModalBannerText,
            theme,
            placeholderModalBannerPosition,
            placeholderModalBannerFontSize,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason,
            templateVarYear,
            templateVarEdition,
            templateVarGenre,
            templateVarQuality,
            templateVarNetwork
        );
    };

    // Position Change Handler (updates active preset in bannerTemplates)
    const handleBannerPositionChange = (pos: "bottom" | "top" | "corner") => {
        setPlaceholderModalBannerPosition(pos);
        setBannerTemplates(prev => ({
            ...prev,
            [placeholderModalBannerType]: {
                ...(prev[placeholderModalBannerType] || {}),
                text: placeholderModalBannerText,
                theme: placeholderModalBannerTheme,
                pos,
                fontSize: placeholderModalBannerFontSize
            }
        }));
        generatePlaceholderPreview(
            selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
            selectedPlaceholderItem?.title || simSelectedRealItem?.title || templateVarTitle || "Sample Media",
            placeholderModalBannerType,
            placeholderModalBannerText,
            placeholderModalBannerTheme,
            pos,
            placeholderModalBannerFontSize,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason,
            templateVarYear,
            templateVarEdition,
            templateVarGenre,
            templateVarQuality,
            templateVarNetwork
        );
    };

    // Font Size Change Handler (updates active preset in bannerTemplates)
    const handleBannerFontSizeChange = (fontSize: number) => {
        setPlaceholderModalBannerFontSize(fontSize);
        setBannerTemplates(prev => ({
            ...prev,
            [placeholderModalBannerType]: {
                ...(prev[placeholderModalBannerType] || {}),
                text: placeholderModalBannerText,
                theme: placeholderModalBannerTheme,
                pos: placeholderModalBannerPosition,
                fontSize
            }
        }));
        generatePlaceholderPreview(
            selectedPlaceholderItem?.posterPath || (simSelectedRealItem ? simPosterUrl : null),
            selectedPlaceholderItem?.title || simSelectedRealItem?.title || templateVarTitle || "Sample Media",
            placeholderModalBannerType,
            placeholderModalBannerText,
            placeholderModalBannerTheme,
            placeholderModalBannerPosition,
            fontSize,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason,
            templateVarYear,
            templateVarEdition,
            templateVarGenre,
            templateVarQuality,
            templateVarNetwork
        );
    };

    // Open Placeholder Creation Modal
    const handleOpenPlaceholderModal = async (item: any) => {
        setSelectedPlaceholderItem(item);
        setPlaceholderSuccessMsg(null);
        setPlaceholderModalOpen(true);

        const bannerType = item.suggestedBannerType || (!item.isMonitored ? "not_requested_yet" : item.isReleased ? "downloading_soon" : "coming_soon_monitored");
        const config = getEffectiveBannerConfig(bannerType);
        const bannerText = item.suggestedBannerText || config.text;
        const bannerTheme = item.suggestedBannerTheme || config.theme;
        const bannerPos = config.pos;
        const bannerFontSize = config.fontSize;

        setPlaceholderModalBannerText(bannerText);
        setPlaceholderModalBannerType(bannerType);
        setPlaceholderModalBannerTheme(bannerTheme);
        setPlaceholderModalBannerPosition(bannerPos);
        setPlaceholderModalBannerFontSize(bannerFontSize);
        generatePlaceholderPreview(item.posterPath, item.title, bannerType, bannerText, bannerTheme, bannerPos, bannerFontSize);
    };

    const generatePlaceholderPreview = async (
        posterPath: string | null,
        title: string,
        type = placeholderModalBannerType,
        text = placeholderModalBannerText,
        theme = placeholderModalBannerTheme,
        position = placeholderModalBannerPosition,
        fontSize = placeholderModalBannerFontSize,
        date = templateVarDate,
        days = templateVarDays,
        source = templateVarSource,
        status = templateVarStatus,
        reason = templateVarReason,
        year = templateVarYear,
        edition = templateVarEdition,
        genre = templateVarGenre,
        quality = templateVarQuality,
        network = templateVarNetwork
    ) => {
        setPlaceholderPreviewLoading(true);
        try {
            const res = await getPlaceholderPreviewDataUrlAction(posterPath, title, {
                bannerType: type,
                bannerText: text,
                bannerTheme: theme,
                bannerPosition: position,
                bannerFontSize: fontSize,
                fontSize,
                date,
                formattedDate: date,
                daysRemaining: days,
                source,
                status,
                reason,
                year,
                edition,
                genre,
                quality,
                network
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
        setTemplateVarTitle(item.title || "Sample Media");
        if (item.year) setTemplateVarYear(String(item.year));
        if (item.detectedBadges?.resolution || item.media?.[0]?.videoResolution) {
            setTemplateVarQuality(item.detectedBadges?.resolution || item.media?.[0]?.videoResolution || "4K UHD");
        }
        if (item.detectedBadges?.edition) {
            setTemplateVarEdition(item.detectedBadges.edition);
        }
        if (item.genre) {
            setTemplateVarGenre(Array.isArray(item.genre) ? item.genre.join(", ") : String(item.genre));
        }
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
            placeholderModalBannerFontSize,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason,
            item.year ? String(item.year) : templateVarYear,
            item.detectedBadges?.edition || templateVarEdition,
            Array.isArray(item.genre) ? item.genre.join(", ") : (item.genre || templateVarGenre),
            item.detectedBadges?.resolution || item.media?.[0]?.videoResolution || templateVarQuality,
            templateVarNetwork
        );
    };

    const handleInsertToken = (token: string) => {
        const next = placeholderModalBannerText ? `${placeholderModalBannerText} ${token}` : token;
        handleBannerTextChange(next);
    };

    const handleCreatePlaceholder = async () => {
        if (!selectedPlaceholderItem) return;
        setGeneratingPlaceholder(true);
        setPlaceholderSuccessMsg(null);
        try {
            const res = await createPlaceholderItemAction(selectedServerId, selectedSectionKey, {
                tmdbId: selectedPlaceholderItem.id,
                title: selectedPlaceholderItem.title,
                year: selectedPlaceholderItem.year || (templateVarYear ? parseInt(templateVarYear, 10) : undefined),
                mediaType: selectedPlaceholderItem.mediaType || "movie",
                posterPath: selectedPlaceholderItem.posterPath,
                overview: selectedPlaceholderItem.overview,
                bannerType: placeholderModalBannerType,
                bannerText: placeholderModalBannerText,
                bannerTheme: placeholderModalBannerTheme,
                bannerPosition: placeholderModalBannerPosition,
                bannerFontSize: placeholderModalBannerFontSize,
                fontSize: placeholderModalBannerFontSize,
                date: templateVarDate,
                formattedDate: templateVarDate,
                daysRemaining: templateVarDays,
                source: templateVarSource,
                status: templateVarStatus,
                reason: templateVarReason,
                edition: templateVarEdition,
                genre: templateVarGenre,
                quality: templateVarQuality
            });

            if (res.success) {
                setPlaceholderSuccessMsg(res.message || `Created placeholder for "${selectedPlaceholderItem.title}"!`);
                setTimeout(() => {
                    setPlaceholderModalOpen(false);
                    if (mediaInspectorModalOpen && inspectingCollection) {
                        handleInspectCollectionMedia(inspectingCollection);
                    }
                }, 1500);
            }
        } catch (e: any) {
            console.error("Failed creating placeholder:", e);
        } finally {
            setGeneratingPlaceholder(false);
        }
    };

    // Save Current Banner Template Preset
    const handleSaveDefaultBannerTemplate = async () => {
        setSavingBannerDefault(true);
        setBannerDefaultSavedMsg(null);
        try {
            const updatedTemplates = {
                ...bannerTemplates,
                [placeholderModalBannerType]: {
                    text: placeholderModalBannerText,
                    theme: placeholderModalBannerTheme,
                    pos: placeholderModalBannerPosition,
                    fontSize: placeholderModalBannerFontSize
                }
            };
            setBannerTemplates(updatedTemplates);

            const res = await saveCurationSettingsAction({
                placeholderBannerPosition: placeholderModalBannerPosition,
                placeholderBannerTheme: placeholderModalBannerTheme,
                placeholderBannerFontSize: placeholderModalBannerFontSize,
                placeholderCustomText: placeholderModalBannerText,
                placeholderBannerTemplates: JSON.stringify(updatedTemplates)
            });
            if (res.success) {
                const currentPreset = AGREGARR_BANNER_PRESETS.find(p => p.id === placeholderModalBannerType);
                setBannerDefaultSavedMsg(`✓ Saved Template for "${currentPreset?.label || placeholderModalBannerType}"!`);
                setTimeout(() => setBannerDefaultSavedMsg(null), 3500);
            }
        } catch (e) {
            console.error("Failed saving default banner template:", e);
        } finally {
            setSavingBannerDefault(false);
        }
    };

    // Reset Active Preset to Default
    const handleResetCurrentBannerTemplate = async () => {
        const preset = AGREGARR_BANNER_PRESETS.find(p => p.id === placeholderModalBannerType);
        const defaultText = preset?.defaultText || "NOT REQUESTED YET";
        const defaultTheme = preset?.theme || "indigo-purple";
        const defaultPos = (preset?.pos || "bottom") as "bottom" | "top" | "corner";
        const defaultFontSize = 44;

        const updatedTemplates = { ...bannerTemplates };
        delete updatedTemplates[placeholderModalBannerType];
        setBannerTemplates(updatedTemplates);

        setPlaceholderModalBannerText(defaultText);
        setPlaceholderModalBannerTheme(defaultTheme);
        setPlaceholderModalBannerPosition(defaultPos);
        setPlaceholderModalBannerFontSize(defaultFontSize);

        try {
            await saveCurationSettingsAction({
                placeholderBannerTemplates: JSON.stringify(updatedTemplates)
            });
            setBannerDefaultSavedMsg(`✓ Reset "${preset?.label || placeholderModalBannerType}" to preset default!`);
            setTimeout(() => setBannerDefaultSavedMsg(null), 3500);
        } catch (e) {
            console.error("Failed resetting template:", e);
        }

        generatePlaceholderPreview(
            simSelectedRealItem ? simPosterUrl : (selectedPlaceholderItem?.posterPath || null),
            selectedPlaceholderItem?.title || simSelectedRealItem?.title || templateVarTitle || "Sample Media",
            placeholderModalBannerType,
            defaultText,
            defaultTheme,
            defaultPos,
            defaultFontSize,
            templateVarDate,
            templateVarDays,
            templateVarSource,
            templateVarStatus,
            templateVarReason,
            templateVarYear,
            templateVarEdition,
            templateVarGenre,
            templateVarQuality,
            templateVarNetwork
        );
    };

    // Save Server Mappings & Shares
    const handleSaveServerMappingsAndShares = async () => {
        setSavingShares(true);
        setSharesSavedMsg(false);
        try {
            await saveComingSoonSharesAction(comingSoonShares);
            await saveCurationSettingsAction({
                placeholderDaysThreshold: Number(placeholderDaysThreshold)
            });
            const updatedConfig: Record<string, any> = { ...serverStorageConfig };
            for (const srv of servers) {
                if (!updatedConfig[srv.serverId]) updatedConfig[srv.serverId] = {};
                if (!updatedConfig[srv.serverId].movieSharePath && comingSoonShares[srv.serverId]) {
                    updatedConfig[srv.serverId].movieSharePath = comingSoonShares[srv.serverId];
                }
                if (!updatedConfig[srv.serverId].sharePath && comingSoonShares[srv.serverId]) {
                    updatedConfig[srv.serverId].sharePath = comingSoonShares[srv.serverId];
                }
            }
            await saveServerStorageConfigAction(updatedConfig);
            setServerStorageConfig(updatedConfig);
            setSharesSavedMsg(true);
            setTimeout(() => setSharesSavedMsg(false), 3500);
        } catch (e) {
            console.error("Failed saving server mappings:", e);
        } finally {
            setSavingShares(false);
        }
    };

    // Deploy Filtered Recently Added Hub (Smart Collection excluding placeholders)
    const handleDeployFilteredRecentlyAddedHub = async () => {
        if (!selectedServerId || !selectedSectionKey) return;
        setDeployingRecentlyAdded(true);
        setRecentlyAddedDeployMsg(null);
        try {
            const res = await deployFilteredRecentlyAddedHubAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setRecentlyAddedDeployMsg({
                    success: true,
                    text: res.message || "✓ Successfully deployed Filtered Recently Added Hub! Placeholders excluded from Home Screen."
                });
                loadCollections();
                setTimeout(() => setRecentlyAddedDeployMsg(null), 5000);
            } else {
                setRecentlyAddedDeployMsg({
                    success: false,
                    text: res.message || "Failed deploying Filtered Recently Added Hub."
                });
            }
        } catch (err: any) {
            setRecentlyAddedDeployMsg({
                success: false,
                text: err.message || "Error deploying Filtered Recently Added Hub."
            });
        } finally {
            setDeployingRecentlyAdded(false);
        }
    };

    // Tag all placeholder trailers in Plex with trailer-placeholder label
    const handleTagAllPlaceholders = async () => {
        if (!selectedServerId) return;
        setTaggingPlaceholders(true);
        setRecentlyAddedDeployMsg(null);
        try {
            const res = await tagAllPlaceholdersInPlexAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setRecentlyAddedDeployMsg({
                    success: true,
                    text: res.message || "✓ Successfully scanned and labeled all placeholder trailers in Plex!"
                });
                setTimeout(() => setRecentlyAddedDeployMsg(null), 6000);
            } else {
                setRecentlyAddedDeployMsg({
                    success: false,
                    text: res.message || "Failed labeling placeholders in Plex."
                });
            }
        } catch (err: any) {
            setRecentlyAddedDeployMsg({
                success: false,
                text: err.message || "Error labeling placeholders in Plex."
            });
        } finally {
            setTaggingPlaceholders(false);
        }
    };

    const currentServer = servers.find(s => s.serverId === selectedServerId) || servers[0];
    const currentSections = currentServer?.sections || [];
    const currentSection = currentSections.find((s: any) => String(s.key) === selectedSectionKey);
    const isTvSection = currentSection?.type === "show" || currentSection?.type === "tv" || currentSection?.title?.toLowerCase().includes("show") || currentSection?.title?.toLowerCase().includes("tv");
    const isMovieSection = currentSection?.type === "movie" || (!isTvSection && currentSection?.title?.toLowerCase().includes("movie"));

    // Filter Collections by Destination & Search
    const filteredCollections = collections.filter(coll => {
        if (collectionsFilter === "home" && !(coll.promotedToHome || coll.promotedToSharedHome)) return false;
        if (collectionsFilter === "recommended" && !coll.promotedToRecommended) return false;
        if (collectionsFilter === "library" && coll.collectionMode === "hide") return false;
        if (collectionSearchQuery.trim()) {
            const q = collectionSearchQuery.toLowerCase().trim();
            const matchTitle = coll.title?.toLowerCase().includes(q);
            const matchSummary = coll.summary?.toLowerCase().includes(q);
            const matchCat = coll.category?.toLowerCase().includes(q) || coll.sourceType?.toLowerCase().includes(q);
            if (!matchTitle && !matchSummary && !matchCat) return false;
        }
        return true;
    });

    // Preset Blueprints Filtering
    const presetCategories = [
        { id: "all", label: "🌟 All Presets" },
        { id: "awards", label: "🏆 Awards & Charts" },
        { id: "dynamic", label: "🔥 Trending & Streaming" },
        { id: "studio", label: "🏰 Networks & Studios" },
        { id: "franchise", label: "🎬 Franchises & Sagas" },
        { id: "decade", label: "⏳ Decades & Eras" },
        { id: "holiday", label: "🎃 Seasonal & Holidays" }
    ];

    const filteredPresets = COLLECTION_PRESETS.filter(preset => {
        if (presetsCategoryFilter !== "all" && preset.category !== presetsCategoryFilter) return false;

        let effectiveMediaTypeFilter = presetsMediaTypeFilter;
        if (effectiveMediaTypeFilter === "auto") {
            if (isTvSection) effectiveMediaTypeFilter = "show";
            else if (isMovieSection) effectiveMediaTypeFilter = "movie";
            else effectiveMediaTypeFilter = "all";
        }

        if (effectiveMediaTypeFilter === "movie") {
            if (preset.mediaType !== "movie" && preset.mediaType !== "both") return false;
        } else if (effectiveMediaTypeFilter === "show") {
            if (preset.mediaType !== "show" && preset.mediaType !== "both") return false;
        }

        if (presetsSearchQuery.trim()) {
            const q = presetsSearchQuery.toLowerCase().trim();
            const matchTitle = preset.title.toLowerCase().includes(q);
            const matchDesc = preset.description.toLowerCase().includes(q);
            const matchCat = preset.category.toLowerCase().includes(q);
            if (!matchTitle && !matchDesc && !matchCat) return false;
        }
        return true;
    });

    // Collection Media Inspector Filtered Items
    const filteredCollectionItems = (collectionMediaData?.items || []).filter(item => {
        if (collectionMediaFilter === "in_library" && !item.inLibrary) return false;
        if (collectionMediaFilter === "missing" && item.inLibrary) return false;
        if (collectionMediaFilter === "coming_soon" && (item.inLibrary || !item.isMonitored)) return false;
        if (collectionMediaFilter === "not_requested" && (item.inLibrary || item.isMonitored)) return false;
        if (collectionMediaSearch.trim()) {
            const q = collectionMediaSearch.toLowerCase().trim();
            const matchTitle = item.title?.toLowerCase().includes(q);
            const matchYear = String(item.year || "").includes(q);
            if (!matchTitle && !matchYear) return false;
        }
        return true;
    });

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
                description="Automated TMDb/Trakt/MDBList collections, Plex Home screen ranking (#1-#99), seasonal schedules, and Coming Soon trailer placeholders."
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

            {/* Agregarr Top Navigation Sub-Tabs */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md backdrop-blur-md">
                <button
                    type="button"
                    onClick={() => setSubTab("collections")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "collections"
                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Trophy className="h-4 w-4 shrink-0" />
                    <span>Collections &amp; Hubs</span>
                    <Badge variant="outline" className={`hidden sm:inline-flex text-[10px] px-1.5 py-0 shrink-0 ${subTab === "collections" ? "border-amber-900 text-slate-950 bg-amber-400" : "border-slate-700 text-slate-400"}`}>
                        {collections.length}
                    </Badge>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("presets")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "presets"
                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Sparkles className="h-4 w-4 shrink-0" />
                    <span>Curated Presets</span>
                    <Badge variant="outline" className={`hidden sm:inline-flex text-[10px] px-1.5 py-0 shrink-0 ${subTab === "presets" ? "border-amber-900 text-slate-950 bg-amber-400" : "border-slate-700 text-slate-400"}`}>
                        {COLLECTION_PRESETS.length}
                    </Badge>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("coming_soon")}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "coming_soon"
                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Settings2 className="h-4 w-4 shrink-0" />
                    <span>Coming Soon &amp; Settings</span>
                </button>
            </div>

            {/* ========================================================================= */}
            {/* SUB-TAB 1: COLLECTIONS & HUBS (Plex Home Hubs, Library Tabs, Matrix) */}
            {/* ========================================================================= */}
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
                                Reorder collection ranking (#1-#99), inspect collection media, toggle Home/Shared visibility, and sync hubs directly to Plex.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => setCreateModalOpen(true)}
                                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-8 px-3 gap-1.5 cursor-pointer shadow-md"
                            >
                                <Plus className="h-3.5 w-3.5" />
                                <span>Custom Collection</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={deployingRecentlyAdded}
                                onClick={handleDeployFilteredRecentlyAddedHub}
                                className="border-cyan-500/40 hover:bg-cyan-950/40 text-cyan-200 text-xs h-8 px-3 gap-1.5 cursor-pointer"
                                title="Creates a Smart Recently Added Collection in Plex with 'label!=trailer-placeholder', promoted to Plex Home #1 rank to keep placeholder stubs out of user carousels"
                            >
                                {deployingRecentlyAdded ? <Loader2 className="h-3.5 w-3.5 animate-spin text-cyan-400" /> : <Clapperboard className="h-3.5 w-3.5 text-cyan-400" />}
                                <span>Filtered Recently Added Hub</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={taggingPlaceholders}
                                onClick={handleTagAllPlaceholders}
                                className="border-emerald-500/40 hover:bg-emerald-950/40 text-emerald-200 text-xs h-8 px-3 gap-1.5 cursor-pointer"
                                title="Scans Plex library sections, detects placeholder files & trailers, and applies the 'trailer-placeholder' label so they never pollute Recently Added carousels"
                            >
                                {taggingPlaceholders ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /> : <Tag className="h-3.5 w-3.5 text-emerald-400" />}
                                <span>Tag Placeholders</span>
                            </Button>
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

                    {recentlyAddedDeployMsg && (
                        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in-50 ${
                            recentlyAddedDeployMsg.success ? "bg-cyan-950/80 border-cyan-800 text-cyan-300" : "bg-rose-950/80 border-rose-800 text-rose-300"
                        }`}>
                            {recentlyAddedDeployMsg.success ? <CheckCircle2 className="h-4 w-4 text-cyan-400 shrink-0" /> : <XCircle className="h-4 w-4 text-rose-400 shrink-0" />}
                            <span>{recentlyAddedDeployMsg.text}</span>
                        </div>
                    )}

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

                    {/* Filter & Search Bar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setCollectionsFilter("all")}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                    collectionsFilter === "all"
                                        ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                        : "bg-slate-800 text-slate-300 hover:text-white"
                                }`}
                            >
                                All Collections ({collections.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setCollectionsFilter("home")}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                    collectionsFilter === "home"
                                        ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                        : "bg-slate-800 text-slate-300 hover:text-white"
                                }`}
                            >
                                <Home className="h-3.5 w-3.5" />
                                <span>Home Hubs ({collections.filter(c => c.promotedToHome || c.promotedToSharedHome).length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCollectionsFilter("recommended")}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                    collectionsFilter === "recommended"
                                        ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                        : "bg-slate-800 text-slate-300 hover:text-white"
                                }`}
                            >
                                <Star className="h-3.5 w-3.5" />
                                <span>Recommended Hubs ({collections.filter(c => c.promotedToRecommended).length})</span>
                            </button>
                            <button
                                type="button"
                                onClick={() => setCollectionsFilter("library")}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                    collectionsFilter === "library"
                                        ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                        : "bg-slate-800 text-slate-300 hover:text-white"
                                }`}
                            >
                                <Layers className="h-3.5 w-3.5" />
                                <span>Library Tab ({collections.filter(c => c.collectionMode !== "hide").length})</span>
                            </button>
                        </div>

                        <div className="relative w-full sm:w-64">
                            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <Input
                                placeholder="Filter collections..."
                                value={collectionSearchQuery}
                                onChange={(e) => setCollectionSearchQuery(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-800 pl-8 w-full"
                            />
                        </div>
                    </div>

                    {/* Active Collections List */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                        <CardHeader className="p-4 border-b border-slate-800/80">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                    <Layers className="h-4 w-4 text-amber-400" />
                                    <span>Active Collections ({filteredCollections.length})</span>
                                </CardTitle>
                                <span className="text-xs text-slate-400">
                                    Click <span className="text-amber-300 font-bold">Inspect Media</span> (👁️) to preview live items, release dates, and trailer stubs
                                </span>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2.5">
                            {filteredCollections.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 space-y-3">
                                    <Trophy className="h-10 w-10 mx-auto text-slate-700" />
                                    <p className="text-xs font-bold text-slate-400">No collections found matching your current filter.</p>
                                    <div className="flex items-center justify-center gap-2 pt-1">
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={() => setSubTab("presets")}
                                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs h-7 gap-1"
                                        >
                                            <Sparkles className="h-3 w-3" />
                                            <span>Explore Curated Presets</span>
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={handleImportPlexCollections}
                                            className="border-slate-700 text-xs h-7 gap-1"
                                        >
                                            <RefreshCw className="h-3 w-3" />
                                            <span>Import from Plex</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                filteredCollections.map((coll, idx) => {
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
                                            <div className="flex items-center gap-3 min-w-0 flex-1">
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
                                                        disabled={idx === filteredCollections.length - 1}
                                                        onClick={() => handleMoveCollection(idx, "down")}
                                                        className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                                        title="Move Down on Home Screen"
                                                    >
                                                        <ChevronDown className="h-3.5 w-3.5" />
                                                    </button>
                                                </div>

                                                {/* Position Ranking Pill */}
                                                <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-xs font-mono font-bold px-2 py-0.5 shrink-0">
                                                    #{coll.orderIndex || idx + 1}
                                                </Badge>

                                                {/* Collection Details */}
                                                <div className="space-y-1 min-w-0 flex-1">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <span className="font-bold text-white text-xs truncate max-w-[200px] xs:max-w-[280px] sm:max-w-[380px]" title={coll.title}>
                                                            {coll.title}
                                                        </span>
                                                        <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-slate-700 text-slate-400 shrink-0 capitalize">
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
                                                        {coll.includePlaceholders && (
                                                            <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-amber-500/60 bg-amber-950/40 text-amber-300 gap-1 font-mono shrink-0" title="Coming Soon placeholders and trailer stubs enabled">
                                                                <Sparkles className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>Placeholders: ON</span>
                                                            </Badge>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-slate-400 truncate max-w-[240px] xs:max-w-[360px] sm:max-w-[500px]">
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

                                            {/* Action Bar & Visibility Controls */}
                                            <div className="flex flex-wrap items-center gap-2 self-start sm:self-end lg:self-center w-full sm:w-auto justify-between sm:justify-end shrink-0">
                                                {/* 1-Click Inspect Media Button */}
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    onClick={() => handleInspectCollectionMedia(coll)}
                                                    className="h-8 px-3 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 gap-1.5 shadow-sm cursor-pointer shrink-0"
                                                    title="Inspect Collection Media, TMDb items, release dates, and missing stubs"
                                                >
                                                    <Eye className="h-3.5 w-3.5 text-slate-950" />
                                                    <span>Inspect Media</span>
                                                </Button>

                                                {/* Screen Visibility Targets */}
                                                <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-lg border border-slate-800">
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
                </div>
            )}

            {/* ========================================================================= */}
            {/* SUB-TAB 2: CURATED PRESETS (Oscars, IMDb, Netflix, Disney+, Franchises) */}
            {/* ========================================================================= */}
            {subTab === "presets" && (
                <div className="space-y-6">
                    {/* Header & Description */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl">
                        <div className="space-y-0.5">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <Sparkles className="h-4 w-4 text-amber-400" />
                                <span>Curated Agregarr Preset Blueprints ({filteredPresets.length})</span>
                            </h2>
                            <p className="text-xs text-slate-400">
                                Ready-to-install smart collections for trending streaming drops, top-rated award winners, studio hubs, decades, and seasonal calendars.
                            </p>
                        </div>
                    </div>

                    {/* Presets Filter & Search Toolbar */}
                    <div className="flex flex-col gap-3 p-3 bg-slate-900/90 rounded-2xl border border-slate-800">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                            {/* Media Type Scope Buttons */}
                            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-slate-950/80 rounded-xl border border-slate-800">
                                <button
                                    type="button"
                                    onClick={() => setPresetsMediaTypeFilter("auto")}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                        presetsMediaTypeFilter === "auto"
                                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    <Filter className="h-3 w-3" />
                                    <span>🎯 Target Library ({isTvSection ? "TV Shows" : "Movies"})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPresetsMediaTypeFilter("movie")}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                        presetsMediaTypeFilter === "movie"
                                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    <Film className="h-3 w-3 text-amber-400" />
                                    <span>Movies</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPresetsMediaTypeFilter("show")}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                        presetsMediaTypeFilter === "show"
                                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    <Tv className="h-3 w-3 text-sky-400" />
                                    <span>TV Shows</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setPresetsMediaTypeFilter("all")}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                                        presetsMediaTypeFilter === "all"
                                            ? "bg-amber-500 text-slate-950 shadow-md font-black"
                                            : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    <Layers className="h-3 w-3" />
                                    <span>All Media</span>
                                </button>
                            </div>

                            <div className="relative w-full sm:w-64">
                                <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                <Input
                                    placeholder="Search presets..."
                                    value={presetsSearchQuery}
                                    onChange={(e) => setPresetsSearchQuery(e.target.value)}
                                    className="h-8 text-xs bg-slate-950 border-slate-800 pl-8 w-full"
                                />
                            </div>
                        </div>

                        {/* Category Filter Chips */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-slate-800/60">
                            {presetCategories.map(cat => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setPresetsCategoryFilter(cat.id)}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                        presetsCategoryFilter === cat.id
                                            ? "bg-slate-700 text-amber-300 shadow-sm font-black border border-amber-500/40"
                                            : "bg-slate-950/60 text-slate-400 hover:text-white border border-slate-800"
                                    }`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Presets Card Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {filteredPresets.map(preset => {
                            return (
                                <div
                                    key={preset.id}
                                    onClick={() => handleInspectPreset(preset)}
                                    className="p-4 bg-slate-900/90 hover:bg-slate-800/90 rounded-2xl border border-slate-800 hover:border-amber-500/50 transition-all cursor-pointer space-y-3 group shadow-xl flex flex-col justify-between"
                                >
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                                    <Trophy className="h-4 w-4" />
                                                </div>
                                                <span className="font-bold text-white text-xs group-hover:text-amber-300 transition-colors">
                                                    {preset.title}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 border-slate-700 font-mono ${
                                                    preset.mediaType === "show" ? "text-sky-300 border-sky-800/60 bg-sky-950/40" :
                                                    preset.mediaType === "movie" ? "text-amber-300 border-amber-800/60 bg-amber-950/40" :
                                                    "text-purple-300 border-purple-800/60 bg-purple-950/40"
                                                }`}>
                                                    {preset.mediaType === "show" ? "📺 TV" : preset.mediaType === "movie" ? "🎬 MOVIES" : "✨ BOTH"}
                                                </Badge>
                                                <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400 capitalize">
                                                    {preset.category}
                                                </Badge>
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-slate-400 line-clamp-2 leading-relaxed">
                                            {preset.description}
                                        </p>
                                    </div>

                                    <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-mono bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800 text-slate-400">
                                                {preset.sourceType.toUpperCase()}
                                            </span>
                                            {preset.isSeasonal && (
                                                <span className="text-amber-400 flex items-center gap-0.5">
                                                    <Calendar className="h-2.5 w-2.5" /> Seasonal
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-amber-400 font-bold group-hover:translate-x-0.5 transition-transform flex items-center gap-1">
                                            Inspect &amp; Install →
                                        </span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* SUB-TAB 3: COMING SOON & SETTINGS (Schedule, Shares, Live Simulator) */}
            {/* ========================================================================= */}
            {subTab === "coming_soon" && (
                <div className="space-y-6">
                    {/* Automated Collections & Hubs Schedule Card */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                        <CardContent className="p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs">
                            <div className="space-y-1 max-w-xl">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Clock className="h-4 w-4 text-amber-400" />
                                    <span className="font-bold text-white text-sm">Collections &amp; Hubs Schedule &amp; Automation</span>
                                    <Badge variant="outline" className={`text-[10px] font-semibold ${curationSyncCollections ? 'border-amber-500/40 text-amber-300 bg-amber-950/30' : 'border-slate-700 text-slate-400 bg-slate-800/40'}`}>
                                        {curationSyncCollections ? `Active (${curationSyncSchedule.replace(/_/g, ' ')})` : 'Paused'}
                                    </Badge>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                    Automatically updates dynamic smart collections, evaluates seasonal schedules, and updates Home screen rankings on Plex across enabled libraries.
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

                    {/* Coming Soon Shares Setup & Simulator */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Server Shares & Arr Instances Mapping Setup */}
                        <div className="lg:col-span-5 space-y-4 p-5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl">
                            <div className="space-y-1 border-b border-slate-800/80 pb-3">
                                <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <HardDrive className="h-4 w-4 text-cyan-400" /> Server Storage &amp; Arr Instance Mapping
                                </h4>
                                <p className="text-[11px] text-slate-400">
                                    Map each Plex server (e.g. Kids Plex vs Main Plex) to its designated Radarr and Sonarr instances, and configure Coming Soon share folders.
                                </p>
                            </div>

                            {servers.map(srv => {
                                const srvConfig = serverStorageConfig[srv.serverId] || {};
                                const moviePath = srvConfig.movieSharePath || comingSoonShares[srv.serverId] || srvConfig.sharePath || "";
                                const tvPath = srvConfig.tvSharePath || "";
                                const checkMovieStatus = pathCheckResults[`${srv.serverId}_movie`];
                                const checkTvStatus = pathCheckResults[`${srv.serverId}_tv`];
                                const currentRadarrId = srvConfig.radarrId || "auto";
                                const currentSonarrId = srvConfig.sonarrId || "auto";

                                return (
                                    <div key={srv.serverId} className="p-3.5 bg-slate-950/80 rounded-xl border border-slate-800 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5">
                                                <Tv className="h-3.5 w-3.5 text-amber-400" />
                                                <span className="font-bold text-xs text-white">{srv.serverName}</span>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-400">
                                                {srv.sections?.length || 0} libraries
                                            </Badge>
                                        </div>

                                        {/* Movie Placeholder Share Path */}
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
                                                <Film className="h-3 w-3 text-amber-400" /> Movie Placeholder Share Folder:
                                            </Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="/mnt/user/media/coming_soon_movies"
                                                    value={moviePath}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setComingSoonShares(prev => ({ ...prev, [srv.serverId]: val }));
                                                        setServerStorageConfig(prev => ({
                                                            ...prev,
                                                            [srv.serverId]: { ...(prev[srv.serverId] || {}), movieSharePath: val, sharePath: val }
                                                        }));
                                                    }}
                                                    className="text-xs bg-slate-900 border-slate-800 font-mono"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        setPathCheckResults(prev => ({ ...prev, [`${srv.serverId}_movie`]: { checking: true } }));
                                                        const res = await validateDirectoryPathAction(moviePath);
                                                        setPathCheckResults(prev => ({ ...prev, [`${srv.serverId}_movie`]: { checking: false, success: res.success, msg: res.message || res.error } }));
                                                    }}
                                                    className="border-slate-700 text-xs shrink-0"
                                                >
                                                    Validate
                                                </Button>
                                            </div>
                                            {checkMovieStatus && !checkMovieStatus.checking && (
                                                <p className={`text-[10px] ${checkMovieStatus.success ? "text-emerald-400" : "text-rose-400"}`}>
                                                    {checkMovieStatus.msg}
                                                </p>
                                            )}
                                        </div>

                                        {/* TV Show Placeholder Share Path */}
                                        <div className="space-y-1">
                                            <Label className="text-[11px] text-slate-300 font-semibold flex items-center gap-1">
                                                <Tv className="h-3 w-3 text-sky-400" /> TV Show Placeholder Share Folder:
                                            </Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    placeholder="/mnt/user/media/coming_soon_tv"
                                                    value={tvPath}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setServerStorageConfig(prev => ({
                                                            ...prev,
                                                            [srv.serverId]: { ...(prev[srv.serverId] || {}), tvSharePath: val }
                                                        }));
                                                    }}
                                                    className="text-xs bg-slate-900 border-slate-800 font-mono"
                                                />
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={async () => {
                                                        setPathCheckResults(prev => ({ ...prev, [`${srv.serverId}_tv`]: { checking: true } }));
                                                        const res = await validateDirectoryPathAction(tvPath);
                                                        setPathCheckResults(prev => ({ ...prev, [`${srv.serverId}_tv`]: { checking: false, success: res.success, msg: res.message || res.error } }));
                                                    }}
                                                    className="border-slate-700 text-xs shrink-0"
                                                >
                                                    Validate
                                                </Button>
                                            </div>
                                            {checkTvStatus && !checkTvStatus.checking && (
                                                <p className={`text-[10px] ${checkTvStatus.success ? "text-emerald-400" : "text-rose-400"}`}>
                                                    {checkTvStatus.msg}
                                                </p>
                                            )}
                                        </div>

                                        {/* Radarr and Sonarr Instance Dropdowns */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/60 text-xs">
                                            {/* Radarr Instance */}
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                                                    <Film className="h-3 w-3 text-amber-400" /> Mapped Radarr (Movies):
                                                </Label>
                                                <Select
                                                    value={currentRadarrId}
                                                    onValueChange={(val) => {
                                                        setServerStorageConfig(prev => ({
                                                            ...prev,
                                                            [srv.serverId]: { ...(prev[srv.serverId] || {}), radarrId: val }
                                                        }));
                                                    }}
                                                >
                                                    <SelectTrigger className="bg-slate-900 border-slate-800 text-[11px] h-7">
                                                        <SelectValue placeholder="Select Radarr..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="auto">⚡ Auto (All Radarr)</SelectItem>
                                                        {arrInstances.radarr.map(r => (
                                                            <SelectItem key={r.id} value={r.id}>
                                                                🎬 {r.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {/* Sonarr Instance */}
                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-400 font-semibold flex items-center gap-1">
                                                    <Tv className="h-3 w-3 text-sky-400" /> Mapped Sonarr (TV Shows):
                                                </Label>
                                                <Select
                                                    value={currentSonarrId}
                                                    onValueChange={(val) => {
                                                        setServerStorageConfig(prev => ({
                                                            ...prev,
                                                            [srv.serverId]: { ...(prev[srv.serverId] || {}), sonarrId: val }
                                                        }));
                                                    }}
                                                >
                                                    <SelectTrigger className="bg-slate-900 border-slate-800 text-[11px] h-7">
                                                        <SelectValue placeholder="Select Sonarr..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="auto">⚡ Auto (All Sonarr)</SelectItem>
                                                        {arrInstances.sonarr.map(s => (
                                                            <SelectItem key={s.id} value={s.id}>
                                                                📺 {s.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}

                            {/* Coming Soon Future Days Threshold */}
                            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800/80 space-y-2.5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                                    <Label className="text-xs text-slate-200 font-semibold flex items-center gap-1.5">
                                        <Clock className="h-3.5 w-3.5 text-amber-400" /> Coming Soon Future Window Threshold
                                    </Label>
                                    <span className="text-[11px] font-mono font-bold text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800/50">
                                        {placeholderDaysThreshold === 0 ? "Unlimited (All Future)" : `${placeholderDaysThreshold} Days Max`}
                                    </span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    Specify how far into the future unreleased titles can be before generating placeholder stubs and posters on disk. Titles releasing beyond this window are skipped until they enter the timeframe.
                                </p>
                                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                    {[
                                        { label: "30 Days", val: 30 },
                                        { label: "60 Days", val: 60 },
                                        { label: "90 Days (Default)", val: 90 },
                                        { label: "180 Days (6 Mo)", val: 180 },
                                        { label: "365 Days (1 Yr)", val: 365 },
                                        { label: "Unlimited", val: 0 },
                                    ].map((opt) => (
                                        <Button
                                            key={opt.val}
                                            type="button"
                                            size="sm"
                                            variant={placeholderDaysThreshold === opt.val ? "default" : "outline"}
                                            onClick={() => setPlaceholderDaysThreshold(opt.val)}
                                            className={`h-6 text-[10px] px-2.5 rounded-lg font-medium cursor-pointer transition-colors ${
                                                placeholderDaysThreshold === opt.val
                                                    ? "bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold"
                                                    : "border-slate-800 bg-slate-900/60 hover:bg-slate-800 text-slate-300"
                                            }`}
                                        >
                                            {opt.label}
                                        </Button>
                                    ))}
                                    <div className="flex items-center gap-1 ml-auto">
                                        <Input
                                            type="number"
                                            min="0"
                                            max="1825"
                                            value={placeholderDaysThreshold}
                                            onChange={(e) => setPlaceholderDaysThreshold(Math.max(0, parseInt(e.target.value) || 0))}
                                            className="w-16 h-6 text-[10px] bg-slate-900 border-slate-800 text-center font-mono"
                                        />
                                        <span className="text-[10px] text-slate-500 font-mono">days</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={savingShares}
                                    onClick={handleSaveServerMappingsAndShares}
                                    className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 cursor-pointer shadow-md"
                                >
                                    {savingShares ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                    <span>Save Mappings &amp; Shares</span>
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={cleaningPlaceholders}
                                    onClick={handleCleanupPlaceholders}
                                    className="border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs gap-1.5 cursor-pointer"
                                    title="Scans Coming Soon shares and automatically removes placeholder folders for items now acquired in Plex"
                                >
                                    {cleaningPlaceholders ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-400" /> : <RotateCcw className="h-3.5 w-3.5 text-amber-400" />}
                                    <span>Clean Acquired Placeholders</span>
                                </Button>

                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={fixingPermissions}
                                    onClick={handleFixPermissions}
                                    className="border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white font-bold text-xs gap-1.5 cursor-pointer"
                                    title="Recursively unlocks all Coming Soon placeholder folders on disk with 0777 (drwxrwxrwx) permissions"
                                >
                                    {fixingPermissions ? <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" /> : <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
                                    <span>Fix Share Permissions</span>
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

                        {/* Agregarr Banner & Poster Live Simulator Studio */}
                        <div className="lg:col-span-7 space-y-4 p-5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                                <div>
                                    <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Sparkles className="h-4 w-4 text-amber-400" /> Agregarr Banner &amp; Poster Live Simulator
                                    </h4>
                                    <p className="text-[11px] text-slate-400">
                                        Variable-driven dynamic banner renderer with TrueType vector glyph bezier typography.
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setPosterPickerModalOpen(true)}
                                        className="h-7 text-[11px] gap-1.5 border-amber-500/40 hover:bg-amber-950/40 text-amber-200 hover:text-amber-100 shrink-0 cursor-pointer"
                                    >
                                        <ImageIcon className="h-3.5 w-3.5 text-amber-400" /> Pull Poster from Plex
                                    </Button>
                                </div>
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
                                            setTemplateVarTitle("Sample Media");
                                            generatePlaceholderPreview(
                                                "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
                                                "Sample Media",
                                                placeholderModalBannerType,
                                                placeholderModalBannerText,
                                                placeholderModalBannerTheme,
                                                placeholderModalBannerPosition,
                                                placeholderModalBannerFontSize,
                                                templateVarDate,
                                                templateVarDays,
                                                templateVarSource,
                                                templateVarStatus,
                                                templateVarReason,
                                                "2026",
                                                templateVarEdition,
                                                templateVarGenre,
                                                templateVarQuality,
                                                templateVarNetwork
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
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[11px] text-slate-300 font-semibold">Agregarr Banner Preset:</Label>
                                            {bannerTemplates[placeholderModalBannerType] && (
                                                <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-800/60 flex items-center gap-1">
                                                    ✨ Custom Template Saved
                                                </span>
                                            )}
                                        </div>
                                        <Select
                                            value={placeholderModalBannerType}
                                            onValueChange={handleSelectBannerPreset}
                                        >
                                            <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-64">
                                                {AGREGARR_BANNER_PRESETS.map(p => {
                                                    const isCustom = Boolean(bannerTemplates[p.id]);
                                                    return (
                                                        <SelectItem key={p.id} value={p.id}>
                                                            <div className="flex items-center justify-between w-full gap-2">
                                                                <span>{p.label}</span>
                                                                {isCustom && (
                                                                    <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 px-1 py-0.2 rounded border border-amber-800/40">
                                                                        Custom
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </SelectItem>
                                                    );
                                                })}
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
                                            onChange={(e) => handleBannerTextChange(e.target.value)}
                                            className="h-8 text-xs bg-slate-950 border-slate-800 font-mono text-white"
                                            placeholder="e.g. DIGITAL RELEASE ON {date}"
                                        />

                                        {/* Agregarr Variable Insertion Chips */}
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {[
                                                { token: "{title}", label: "+ {title}" },
                                                { token: "{year}", label: "+ {year}" },
                                                { token: "{date}", label: "+ {date}" },
                                                { token: "{days}", label: "+ {days}" },
                                                { token: "{days_until}", label: "+ {days_until}" },
                                                { token: "{source}", label: "+ {source}" },
                                                { token: "{network}", label: "+ {network}" },
                                                { token: "{status}", label: "+ {status}" },
                                                { token: "{reason}", label: "+ {reason}" },
                                                { token: "{quality}", label: "+ {quality}" },
                                                { token: "{edition}", label: "+ {edition}" },
                                                { token: "{genre}", label: "+ {genre}" }
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
                                                onValueChange={handleBannerThemeChange}
                                            >
                                                <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-7">
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
                                                onValueChange={(val: any) => handleBannerPositionChange(val)}
                                            >
                                                <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-7">
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

                                    {/* Font Size Slider & Presets */}
                                    <div className="space-y-1.5 p-2.5 bg-slate-950/80 rounded-xl border border-slate-800/80">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[10px] text-slate-300 font-semibold">Banner Font Size:</Label>
                                            <span className="text-[10px] font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                                {placeholderModalBannerFontSize}px
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] text-slate-500 font-mono">18px</span>
                                            <input
                                                type="range"
                                                min="18"
                                                max="72"
                                                step="2"
                                                value={placeholderModalBannerFontSize}
                                                onChange={(e) => handleBannerFontSizeChange(parseInt(e.target.value, 10))}
                                                className="w-full accent-amber-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
                                            />
                                            <span className="text-[9px] text-slate-500 font-mono">72px</span>
                                        </div>
                                        <div className="flex items-center justify-between pt-1 gap-1">
                                            {[
                                                { label: "Compact 28px", size: 28 },
                                                { label: "Standard 44px", size: 44 },
                                                { label: "Bold 54px", size: 54 },
                                                { label: "Max 68px", size: 68 }
                                            ].map((preset) => (
                                                <button
                                                    key={preset.size}
                                                    type="button"
                                                    onClick={() => handleBannerFontSizeChange(preset.size)}
                                                    className={`flex-1 py-0.5 text-[9px] font-mono rounded border transition-all cursor-pointer ${
                                                        placeholderModalBannerFontSize === preset.size
                                                            ? "bg-amber-600 text-slate-950 border-amber-500 font-bold"
                                                            : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white hover:bg-slate-800"
                                                    }`}
                                                >
                                                    {preset.label}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Live Variable Test Values */}
                                    <div className="p-2.5 bg-slate-950/90 rounded-xl border border-slate-800/80 space-y-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                            Live Test Variables (Tokens):
                                        </span>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px]">
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Title {'{title}'}:</Label>
                                                <Input
                                                    value={templateVarTitle}
                                                    onChange={(e) => {
                                                        setTemplateVarTitle(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            e.target.value,
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            templateVarSource,
                                                            templateVarStatus,
                                                            templateVarReason,
                                                            templateVarYear,
                                                            templateVarEdition,
                                                            templateVarGenre,
                                                            templateVarQuality,
                                                            templateVarNetwork
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Year {'{year}'}:</Label>
                                                <Input
                                                    value={templateVarYear}
                                                    onChange={(e) => {
                                                        setTemplateVarYear(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || templateVarTitle || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            templateVarSource,
                                                            templateVarStatus,
                                                            templateVarReason,
                                                            e.target.value,
                                                            templateVarEdition,
                                                            templateVarGenre,
                                                            templateVarQuality,
                                                            templateVarNetwork
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Date {'{date}'}:</Label>
                                                <Input
                                                    value={templateVarDate}
                                                    onChange={(e) => {
                                                        setTemplateVarDate(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || templateVarTitle || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            e.target.value,
                                                            templateVarDays,
                                                            templateVarSource,
                                                            templateVarStatus,
                                                            templateVarReason,
                                                            templateVarYear,
                                                            templateVarEdition,
                                                            templateVarGenre,
                                                            templateVarQuality,
                                                            templateVarNetwork
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
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
                                                            simSelectedRealItem?.title || templateVarTitle || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            templateVarDate,
                                                            num,
                                                            templateVarSource,
                                                            templateVarStatus,
                                                            templateVarReason,
                                                            templateVarYear,
                                                            templateVarEdition,
                                                            templateVarGenre,
                                                            templateVarQuality,
                                                            templateVarNetwork
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
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
                                                            simSelectedRealItem?.title || templateVarTitle || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            e.target.value,
                                                            templateVarStatus,
                                                            templateVarReason,
                                                            templateVarYear,
                                                            templateVarEdition,
                                                            templateVarGenre,
                                                            templateVarQuality,
                                                            templateVarNetwork
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Network {'{network}'}:</Label>
                                                <Input
                                                    value={templateVarNetwork}
                                                    onChange={(e) => {
                                                        setTemplateVarNetwork(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || templateVarTitle || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            templateVarSource,
                                                            templateVarStatus,
                                                            templateVarReason,
                                                            templateVarYear,
                                                            templateVarEdition,
                                                            templateVarGenre,
                                                            templateVarQuality,
                                                            e.target.value
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
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
                                                            simSelectedRealItem?.title || templateVarTitle || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            templateVarSource,
                                                            e.target.value,
                                                            templateVarReason,
                                                            templateVarYear,
                                                            templateVarEdition,
                                                            templateVarGenre,
                                                            templateVarQuality,
                                                            templateVarNetwork
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Quality {'{quality}'}:</Label>
                                                <Input
                                                    value={templateVarQuality}
                                                    onChange={(e) => {
                                                        setTemplateVarQuality(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || templateVarTitle || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            templateVarSource,
                                                            templateVarStatus,
                                                            templateVarReason,
                                                            templateVarYear,
                                                            templateVarEdition,
                                                            templateVarGenre,
                                                            e.target.value,
                                                            templateVarNetwork
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Edition {'{edition}'}:</Label>
                                                <Input
                                                    value={templateVarEdition}
                                                    onChange={(e) => {
                                                        setTemplateVarEdition(e.target.value);
                                                        generatePlaceholderPreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || templateVarTitle || "Sample Media",
                                                            placeholderModalBannerType,
                                                            placeholderModalBannerText,
                                                            placeholderModalBannerTheme,
                                                            placeholderModalBannerPosition,
                                                            placeholderModalBannerFontSize,
                                                            templateVarDate,
                                                            templateVarDays,
                                                            templateVarSource,
                                                            templateVarStatus,
                                                            templateVarReason,
                                                            templateVarYear,
                                                            e.target.value,
                                                            templateVarGenre,
                                                            templateVarQuality,
                                                            templateVarNetwork
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-700 font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={savingBannerDefault}
                                                onClick={handleSaveDefaultBannerTemplate}
                                                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 cursor-pointer shadow-md"
                                            >
                                                {savingBannerDefault ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                                <span>Save Banner Template</span>
                                            </Button>

                                            {bannerTemplates[placeholderModalBannerType] && (
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={handleResetCurrentBannerTemplate}
                                                    className="border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white text-xs gap-1.5 cursor-pointer"
                                                    title="Reset this preset to its default text, color theme, and position"
                                                >
                                                    <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
                                                    <span>Reset to Preset Default</span>
                                                </Button>
                                            )}
                                        </div>

                                        {bannerDefaultSavedMsg && (
                                            <span className="text-xs text-emerald-400 font-bold animate-in fade-in-50">
                                                {bannerDefaultSavedMsg}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ========================================================================= */}
            {/* MODAL 1: COLLECTION MEDIA INSPECTOR MODAL (Live items, dates, stubs) */}
            {/* ========================================================================= */}
            <Dialog open={mediaInspectorModalOpen} onOpenChange={setMediaInspectorModalOpen}>
                <DialogContent className="max-w-5xl bg-slate-900 border-slate-800 text-slate-100 max-h-[90vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="pb-3 border-b border-slate-800 flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                                <Eye className="h-5 w-5 text-amber-400" />
                                <span>Collection Media Inspector: {inspectingCollection?.title}</span>
                            </DialogTitle>
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className="border-amber-500/40 text-amber-300 bg-amber-950/40 text-xs uppercase font-mono">
                                    {inspectingCollection?.sourceType || "TMDB"}
                                </Badge>
                                <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs font-mono">
                                    Rank #{inspectingCollection?.orderIndex || 1}
                                </Badge>
                            </div>
                        </div>
                        <DialogDescription className="text-xs text-slate-400">
                            {inspectingCollection?.summary || inspectingCollection?.sourceQuery || "Live media items evaluated for this collection query."}
                        </DialogDescription>
                    </DialogHeader>

                    {/* Stats & Filter Bar */}
                    <div className="space-y-3 pt-2">
                        {/* Stats Pills */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                            <div className="p-2.5 bg-slate-950/90 rounded-xl border border-slate-800 flex items-center justify-between">
                                <span className="text-slate-400 font-medium">Total Items:</span>
                                <span className="font-bold font-mono text-white text-sm">{collectionMediaData?.totalCount || 0}</span>
                            </div>
                            <div className="p-2.5 bg-emerald-950/30 rounded-xl border border-emerald-800/40 flex items-center justify-between">
                                <span className="text-emerald-300 font-medium">In Library:</span>
                                <span className="font-bold font-mono text-emerald-400 text-sm">{collectionMediaData?.inLibraryCount || 0}</span>
                            </div>
                            <div className="p-2.5 bg-rose-950/30 rounded-xl border border-rose-800/40 flex items-center justify-between">
                                <span className="text-rose-300 font-medium">Missing / Unacquired:</span>
                                <span className="font-bold font-mono text-rose-400 text-sm">{collectionMediaData?.missingCount || 0}</span>
                            </div>
                            <div className="p-2.5 bg-amber-950/30 rounded-xl border border-amber-800/40 flex items-center justify-between">
                                <span className="text-amber-300 font-medium">Coming Soon (Arr):</span>
                                <span className="font-bold font-mono text-amber-400 text-sm">
                                    {(collectionMediaData?.items || []).filter(i => !i.inLibrary && i.isMonitored).length}
                                </span>
                            </div>
                        </div>

                        {/* Search & Filter Buttons */}
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2.5 p-2 bg-slate-950/80 rounded-xl border border-slate-800">
                            <div className="flex flex-wrap items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setCollectionMediaFilter("all")}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                                        collectionMediaFilter === "all" ? "bg-amber-500 text-slate-950 font-black" : "text-slate-400 hover:text-white"
                                    }`}
                                >
                                    All ({collectionMediaData?.items?.length || 0})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCollectionMediaFilter("in_library")}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                        collectionMediaFilter === "in_library" ? "bg-emerald-600 text-white font-black" : "text-slate-400 hover:text-emerald-300"
                                    }`}
                                >
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span>In Library ({collectionMediaData?.inLibraryCount || 0})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCollectionMediaFilter("missing")}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                        collectionMediaFilter === "missing" ? "bg-rose-600 text-white font-black" : "text-slate-400 hover:text-rose-300"
                                    }`}
                                >
                                    <XCircle className="h-3 w-3" />
                                    <span>Missing ({collectionMediaData?.missingCount || 0})</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCollectionMediaFilter("coming_soon")}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                        collectionMediaFilter === "coming_soon" ? "bg-amber-500 text-slate-950 font-black" : "text-slate-400 hover:text-amber-300"
                                    }`}
                                >
                                    <Clock className="h-3 w-3" />
                                    <span>Coming Soon</span>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCollectionMediaFilter("not_requested")}
                                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                        collectionMediaFilter === "not_requested" ? "bg-rose-900 text-rose-200 font-black" : "text-slate-400 hover:text-rose-300"
                                    }`}
                                >
                                    <Flame className="h-3 w-3" />
                                    <span>Not Requested</span>
                                </button>
                            </div>

                            <div className="relative w-full sm:w-56">
                                <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                                <Input
                                    placeholder="Search items..."
                                    value={collectionMediaSearch}
                                    onChange={(e) => setCollectionMediaSearch(e.target.value)}
                                    className="h-7 text-xs bg-slate-900 border-slate-800 pl-7 w-full"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Media Items Grid */}
                    <div className="flex-1 overflow-y-auto py-3 text-xs pr-1">
                        {collectionMediaLoading ? (
                            <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3">
                                <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
                                <p className="text-xs font-bold">Querying and evaluating collection items from {inspectingCollection?.sourceType?.toUpperCase()}...</p>
                            </div>
                        ) : filteredCollectionItems.length === 0 ? (
                            <div className="text-center py-16 text-slate-500 space-y-2">
                                <Film className="h-10 w-10 mx-auto text-slate-700" />
                                <p className="text-xs font-bold text-slate-400">No media items found matching this filter.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3.5">
                                {filteredCollectionItems.map(item => {
                                    return (
                                        <div
                                            key={item.id}
                                            className="group relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 hover:border-amber-500/50 transition-all flex flex-col shadow-lg"
                                        >
                                            {/* Poster Image & Smart Status Badge */}
                                            <div className="relative aspect-[2/3] overflow-hidden bg-slate-900">
                                                <img
                                                    src={item.posterPath ? `https://image.tmdb.org/t/p/w500${item.posterPath}` : "/placeholder-poster.png"}
                                                    alt={item.title}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                />
                                                <div className="absolute top-2 left-2 z-10">
                                                    <Badge className={`${
                                                        item.arrStatus === "IN_LIBRARY" ? "bg-emerald-600" :
                                                        item.arrStatus === "COMING_SOON" ? "bg-amber-600" :
                                                        item.arrStatus === "MONITORED_RELEASED" ? "bg-cyan-600" :
                                                        "bg-rose-600"
                                                    }/95 text-white text-[9px] font-black px-1.5 py-0.5 border-none shadow-md gap-1 flex items-center`}>
                                                        {item.arrStatus === "COMING_SOON" && <Clock className="h-2.5 w-2.5" />}
                                                        {item.arrStatus === "MONITORED_RELEASED" && <Zap className="h-2.5 w-2.5" />}
                                                        {item.arrStatus === "NOT_REQUESTED" && <Flame className="h-2.5 w-2.5" />}
                                                        <span>{item.statusBadgeText || (item.inLibrary ? "✓ IN LIBRARY" : "NOT REQUESTED")}</span>
                                                    </Badge>
                                                </div>
                                            </div>

                                            {/* Media Info & Action Buttons */}
                                            <div className="p-2.5 space-y-1.5 flex-1 flex flex-col justify-between">
                                                <div>
                                                    <h4 className="font-bold text-white text-xs truncate" title={item.title}>
                                                        {item.title}
                                                    </h4>
                                                    <p className="text-[10px] text-slate-400">
                                                        {item.year || item.releaseDate?.split("-")[0] || "Upcoming"}
                                                    </p>
                                                    {item.digitalReleaseDate && (
                                                        <p className="text-[9px] text-cyan-300 font-mono truncate mt-0.5" title={`Digital: ${item.digitalReleaseDate}`}>
                                                            ⚡ Dig: {item.digitalReleaseDate}
                                                        </p>
                                                    )}
                                                </div>

                                                <div className="flex gap-1.5 pt-1">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => handleWatchTrailer(item.id, item.mediaType || "movie", item.title)}
                                                        className="h-7 px-2 text-[10px] font-bold bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 gap-1 cursor-pointer shrink-0"
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

                    <DialogFooter className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2">
                        <Button
                            type="button"
                            size="sm"
                            disabled={!inspectingCollection || generatingCollPlaceholdersId === inspectingCollection?.id}
                            onClick={() => inspectingCollection && handleGenerateCollectionPlaceholders(inspectingCollection.id)}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs gap-1.5 shadow-md cursor-pointer w-full sm:w-auto"
                        >
                            {generatingCollPlaceholdersId === inspectingCollection?.id ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-950" /> : <Tag className="h-3.5 w-3.5" />}
                            <span>Generate Missing Placeholders in Share Folder</span>
                        </Button>

                        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={!inspectingCollection || syncingCollId === inspectingCollection?.id}
                                onClick={() => inspectingCollection && handleSyncCollection(inspectingCollection.id)}
                                className="border-slate-700 text-slate-200 text-xs h-8 gap-1"
                            >
                                <RefreshCw className="h-3.5 w-3.5 text-amber-400" />
                                <span>Sync to Plex</span>
                            </Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => setMediaInspectorModalOpen(false)}>
                                Close
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 2: CREATE CUSTOM COLLECTION MODAL */}
            {/* ========================================================================= */}
            <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
                <DialogContent className="max-w-2xl bg-slate-900 border-slate-800 text-slate-100 max-h-[90vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="pb-3 border-b border-slate-800">
                        <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                            <Plus className="h-5 w-5 text-amber-400" />
                            <span>Create Custom Collection</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-400">
                            Build a custom smart collection rule connected to TMDb, Trakt, or MDBList queries.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 py-3 text-xs pr-1">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <Label className="text-xs text-slate-300">Collection Title:</Label>
                                <Input
                                    value={newCollTitle}
                                    onChange={(e) => setNewCollTitle(e.target.value)}
                                    placeholder="e.g. Netflix Trending Movies"
                                    className="bg-slate-950 border-slate-800 text-xs text-white"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-slate-300">Source Provider:</Label>
                                <Select value={newCollSourceType} onValueChange={setNewCollSourceType}>
                                    <SelectTrigger className="bg-slate-950 border-slate-800 text-xs">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="tmdb">TMDb (The Movie Database)</SelectItem>
                                        <SelectItem value="trakt">Trakt.tv</SelectItem>
                                        <SelectItem value="mdblist">MDBList</SelectItem>
                                        <SelectItem value="plex_query">Plex Smart Query</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Source Query / Identifier:</Label>
                            <Input
                                value={newCollSourceQuery}
                                onChange={(e) => setNewCollSourceQuery(e.target.value)}
                                placeholder="e.g. provider:8 (Netflix), provider:337 (Disney+), trending, or collection:86311"
                                className="bg-slate-950 border-slate-800 text-xs font-mono text-amber-300"
                            />
                            <p className="text-[10px] text-slate-500">
                                Supports provider:8 (Netflix), provider:337 (Disney+), provider:350 (Apple TV+), network:213, or MDBList list slugs.
                            </p>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Description / Summary:</Label>
                            <Textarea
                                value={newCollSummary}
                                onChange={(e) => setNewCollSummary(e.target.value)}
                                placeholder="Summary displayed inside Plex..."
                                className="bg-slate-950 border-slate-800 text-xs resize-none h-16 text-slate-300"
                            />
                        </div>

                        {/* Screen Visibility Targets */}
                        <div className="space-y-2 p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <span className="font-bold text-white text-xs block">Where It Shows Up (Plex Hubs):</span>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                                    <span className="text-xs text-slate-200">Owner Home</span>
                                    <Switch checked={newCollPromotedHome} onCheckedChange={setNewCollPromotedHome} />
                                </div>
                                <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                                    <span className="text-xs text-slate-200">Shared Home</span>
                                    <Switch checked={newCollPromotedShared} onCheckedChange={setNewCollPromotedShared} />
                                </div>
                                <div className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800">
                                    <span className="text-xs text-slate-200">Library Recs</span>
                                    <Switch checked={newCollPromotedRecommended} onCheckedChange={setNewCollPromotedRecommended} />
                                </div>
                            </div>
                        </div>

                        {/* Placeholders Toggle */}
                        <div className="flex items-center justify-between p-3 bg-slate-950 rounded-xl border border-slate-800">
                            <div>
                                <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Coming Soon Placeholders &amp; Trailer Stubs
                                </Label>
                                <p className="text-[10px] text-slate-400">
                                    Automatically generate lightweight trailer stubs and banners in Coming Soon share for missing unacquired titles.
                                </p>
                            </div>
                            <Switch checked={newCollIncludePlaceholders} onCheckedChange={setNewCollIncludePlaceholders} />
                        </div>
                    </div>

                    <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-between">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setCreateModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={!newCollTitle.trim() || creatingCollection}
                            onClick={handleCreateCustomCollection}
                            className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs gap-1.5 shadow-md cursor-pointer"
                        >
                            {creatingCollection ? <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-950" /> : <Plus className="h-3.5 w-3.5" />}
                            <span>Create &amp; Sync Collection</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ========================================================================= */}
            {/* MODAL 3: INSPECT PRESET BLUEPRINT MODAL */}
            {/* ========================================================================= */}
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
                                Control how many items appear in this collection. 0 means unlimited.
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
                        </div>

                        {/* Coming Soon Placeholders & Trailer Stubs */}
                        <div className="space-y-2 p-3.5 bg-slate-950 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Coming Soon Placeholders &amp; Trailer Stubs
                                    </Label>
                                    <p className="text-[10px] text-slate-400">
                                        Automatically generate lightweight trailer stubs and composite banners in your Coming Soon share for missing unacquired titles.
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

            {/* ========================================================================= */}
            {/* MODAL 4: AGREGARR COLLECTION PLACEMENT & VISIBILITY MODAL */}
            {/* ========================================================================= */}
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

                        {/* Section 3: Day of the Week Scheduling */}
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

                        {/* Section 4: Time of Day Scheduling */}
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
                                    <p className="text-[10px] text-slate-400">Enable automatic promotion only during specific months of the year.</p>
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
                                Control how many items appear in this collection. 0 means unlimited.
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
                                Exclude media items tagged with these Plex labels (e.g. placeholder trailers, leaving soon, extras).
                            </p>
                            <Input
                                value={placementExcludedLabels}
                                onChange={(e) => setPlacementExcludedLabels(e.target.value)}
                                placeholder="e.g. trailers, coming_soon, leaving_soon, extras"
                                className="h-8 text-xs bg-slate-900 border-slate-700 font-mono text-rose-300 placeholder:text-slate-600"
                            />
                        </div>

                        {/* Section 8: Coming Soon Placeholders & Trailer Stubs */}
                        <div className="space-y-2 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
                            <div className="flex items-center justify-between">
                                <div>
                                    <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Coming Soon Placeholders &amp; Trailer Stubs
                                    </Label>
                                    <p className="text-[10px] text-slate-400">
                                        When enabled, items in this collection missing from your library will automatically generate trailer stubs (.strm) and banner posters in your Coming Soon share.
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

            {/* ========================================================================= */}
            {/* MODAL 5: PLACEHOLDER / BANNER CREATION MODAL */}
            {/* ========================================================================= */}
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
                                    <div className="flex items-center justify-between">
                                        <Label className="text-xs text-slate-300">Banner Preset:</Label>
                                        {bannerTemplates[placeholderModalBannerType] && (
                                            <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 px-1.5 py-0.2 rounded border border-amber-800/60">
                                                ✨ Custom Template
                                            </span>
                                        )}
                                    </div>
                                    <Select
                                        value={placeholderModalBannerType}
                                        onValueChange={handleSelectBannerPreset}
                                    >
                                        <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-64">
                                            {AGREGARR_BANNER_PRESETS.map(p => {
                                                const isCustom = Boolean(bannerTemplates[p.id]);
                                                return (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        <div className="flex items-center justify-between w-full gap-2">
                                                            <span>{p.label}</span>
                                                            {isCustom && (
                                                                <span className="text-[9px] font-mono text-amber-400 bg-amber-950/80 px-1 py-0.2 rounded border border-amber-800/40">
                                                                    Custom
                                                                </span>
                                                            )}
                                                        </div>
                                                    </SelectItem>
                                                );
                                            })}
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
                                        onChange={(e) => handleBannerTextChange(e.target.value)}
                                        className="h-8 text-xs bg-slate-950 border-slate-800 font-mono text-white"
                                        placeholder="e.g. DIGITAL RELEASE ON {date}"
                                    />

                                    {/* Variable Insertion Chips */}
                                    <div className="flex flex-wrap gap-1 pt-1">
                                        {[
                                            { token: "{title}", label: "+ {title}" },
                                            { token: "{year}", label: "+ {year}" },
                                            { token: "{date}", label: "+ {date}" },
                                            { token: "{days}", label: "+ {days}" },
                                            { token: "{days_until}", label: "+ {days_until}" },
                                            { token: "{source}", label: "+ {source}" },
                                            { token: "{network}", label: "+ {network}" },
                                            { token: "{status}", label: "+ {status}" },
                                            { token: "{reason}", label: "+ {reason}" },
                                            { token: "{quality}", label: "+ {quality}" },
                                            { token: "{edition}", label: "+ {edition}" },
                                            { token: "{genre}", label: "+ {genre}" }
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
                                            onValueChange={handleBannerThemeChange}
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
                                            onValueChange={(val: any) => handleBannerPositionChange(val)}
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

            {/* ========================================================================= */}
            {/* MODAL 6: YOUTUBE TRAILER PLAYER MODAL */}
            {/* ========================================================================= */}
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

            {/* ========================================================================= */}
            {/* MODAL 7: PLEX REAL MEDIA POSTER PICKER MODAL */}
            {/* ========================================================================= */}
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
