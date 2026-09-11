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
    reorderPlexCollectionsAction,
    syncSeasonalAndScheduledCollectionsAction,
    syncLeavingSoonCollectionHubAction,
    getCustomBadgesAction,
    saveCustomBadgeAction,
    deleteCustomBadgeAction,
    deleteMultipleCustomBadgesAction,
    toggleCustomBadgeAction,
    toggleMultipleCustomBadgesAction,
    getOverlayRulesAction, 
    saveOverlayRuleAction, 
    applyOverlaysToLibraryAction, 
    revertLibraryOverlaysAction,
    getLeavingSoonItemsAction, 
    markItemLeavingSoonAction, 
    unmarkItemLeavingSoonAction,
    getUserContentPreferencesAction, 
    saveUserContentPreferencesAction,
    testCurationApiKeysAction,
    runPruneSimulationAction,
    executePruneAction,
    clearAllLeavingSoonFlagsAction,
    saveComingSoonSharesAction,
    saveServerStorageConfigAction,
    validateDirectoryPathAction,
    getArtBackupAndBadgeStatsAction,
    searchPlexLibraryItemsAction,
    inspectPlexMediaItemAction,
    applyOverlayToSingleItemAction,
    restoreSingleItemPosterAction,
    runFullCurationSyncAction,
    applyParentalTagsToLibraryAction,
    clearParentalTagsFromLibraryAction,
    inspectItemParentalAdvisoryAction,
    saveItemParentalAdvisoryAction,
    fetchGitHubBadgeRepoAction,
    importGitHubBadgesAction,
    getPresetBadgePacksAction,
    previewCollectionMatchingAction
} from "@/app/curation-actions";
import { 
    COLLECTION_PRESETS, 
    CollectionPreset,
    PRESET_BADGE_PACKS,
    BadgePresetPack,
    DiscoveredBadgeItem
} from "@/lib/curation/presets";
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
    FolderHeart, Undo2, HardDrive, PlaySquare, Filter, ShieldAlert, HeartOff,
    Server, Power, Ban, Archive, TestTube, Settings2, FolderCheck,
    Upload, Image as ImageIcon, MoveUp, MoveDown, CalendarClock,
    Palette, ChevronUp, ChevronDown, Tag, Compass, Home, Clock3,
    Search, FileText, Info, Play, CheckCheck, Globe, Download, DownloadCloud, Package, Maximize2,
    RotateCcw, Edit2
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

    // Collections & Ordering
    const [collections, setCollections] = useState<any[]>([]);
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
    const [seasonalModalOpen, setSeasonalModalOpen] = useState(false);
    const [editingColl, setEditingColl] = useState<any | null>(null);

    // Preset Blueprint Inspection & Edit States
    const [inspectModalOpen, setInspectModalOpen] = useState(false);
    const [inspectingPreset, setInspectingPreset] = useState<CollectionPreset | null>(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewData, setPreviewData] = useState<{ totalEvaluated: number; matchCount: number; executionMethod: string; sampleMatches: any[] } | null>(null);
    const [editPresetModalOpen, setEditPresetModalOpen] = useState(false);
    const [editingPresetData, setEditingPresetData] = useState<any | null>(null);
    const [savingPresetEdit, setSavingPresetEdit] = useState(false);
    const [resetDefaultSuccess, setResetDefaultSuccess] = useState(false);

    // Custom Badges & Overlays
    const [customBadges, setCustomBadges] = useState<any[]>([]);
    const [uploadModalOpen, setUploadModalOpen] = useState(false);
    const [badgeFile, setBadgeFile] = useState<File | null>(null);
    const [badgeName, setBadgeName] = useState("");
    const [badgeCategory, setBadgeCategory] = useState("edition");
    const [badgePosition, setBadgePosition] = useState("top-right");
    const [badgeWidth, setBadgeWidth] = useState(120);
    const [badgeHeight, setBadgeHeight] = useState(40);
    const [badgeOpacity, setBadgeOpacity] = useState(1.0);
    const [badgeMatchRule, setBadgeMatchRule] = useState("");
    const [uploadingBadge, setUploadingBadge] = useState(false);
    const [badgeUploadError, setBadgeUploadError] = useState<string | null>(null);

    // Custom Badges Multi-Selection & Filter States
    const [selectedCustomBadgeIds, setSelectedCustomBadgeIds] = useState<string[]>([]);
    const [customBadgeFilter, setCustomBadgeFilter] = useState<string>("all");
    const [customBadgeSearch, setCustomBadgeSearch] = useState<string>("");
    const [deletingCustomBadges, setDeletingCustomBadges] = useState(false);

    // GitHub Badge Hub & Downloader States
    const [githubModalOpen, setGithubModalOpen] = useState(false);
    const [githubRepoInput, setGithubRepoInput] = useState("https://github.com/jmxd/Kometa/tree/main/overlays/images");
    const [scanningRepo, setScanningRepo] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [discoveredBadges, setDiscoveredBadges] = useState<DiscoveredBadgeItem[]>([]);
    const [selectedBadgeIds, setSelectedBadgeIds] = useState<string[]>([]);
    const [activeRepoInfo, setActiveRepoInfo] = useState<any | null>(null);
    const [badgeSearchQuery, setBadgeSearchQuery] = useState("");
    const [badgeCategoryFilter, setBadgeCategoryFilter] = useState("all");
    const [importingBadges, setImportingBadges] = useState(false);
    const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
    const [presetPacks] = useState<BadgePresetPack[]>(PRESET_BADGE_PACKS);

    // Overlay Rules & Simulator
    const [overlayRules, setOverlayRules] = useState<any[]>([]);
    const [backupsCount, setBackupsCount] = useState(0);
    const [applyingOverlays, setApplyingOverlays] = useState(false);
    const [revertingOverlays, setRevertingOverlays] = useState(false);
    const [overlayMessage, setOverlayMessage] = useState<{ success: boolean; text: string } | null>(null);

    // Live Overlay Simulator States
    const [simShowResolution, setSimShowResolution] = useState(true);
    const [simShowHdr, setSimShowHdr] = useState(true);
    const [simShowAudio, setSimShowAudio] = useState(true);
    const [simShowChannels, setSimShowChannels] = useState(false);
    const [simShowCodec, setSimShowCodec] = useState(false);
    const [simShowEdition, setSimShowEdition] = useState(false);
    const [simShowStudio, setSimShowStudio] = useState(false);
    const [simShowRating, setSimShowRating] = useState(false);
    const [simRatings, setSimRatings] = useState(false);
    const [simLeavingSoon, setSimLeavingSoon] = useState(false);
    const [simBadgeScale, setSimBadgeScale] = useState<number>(1.0);
    const [simTheme, setSimTheme] = useState<"glass" | "gold" | "classic" | "minimal">("glass");
    const [simPosition, setSimPosition] = useState<"top-right" | "top-left" | "bottom-right">("top-right");
    const [simVideoPosition, setSimVideoPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("top-right");
    const [simResolutionPosition, setSimResolutionPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("top-right");
    const [simHdrPosition, setSimHdrPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("top-right");
    const [simCodecPosition, setSimCodecPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("top-right");
    const [simAudioPosition, setSimAudioPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("top-left");
    const [simChannelsPosition, setSimChannelsPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("top-left");
    const [simEditionPosition, setSimEditionPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("bottom-right");
    const [simStudioPosition, setSimStudioPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("bottom-left");
    const [simRatingPosition, setSimRatingPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("bottom-left");
    const [simRatingsPosition, setSimRatingsPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center">("bottom-left");
    const [simShowRibbon, setSimShowRibbon] = useState(false);
    const [simRibbonPosition, setSimRibbonPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left">("top-right");
    const [simRibbonTheme, setSimRibbonTheme] = useState<"purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange">("purple");
    const [simRibbonType, setSimRibbonType] = useState<"auto_quality" | "auto_edition" | "leaving_soon" | "custom">("auto_quality");
    const [simRibbonText, setSimRibbonText] = useState("");
    const [simCustomBadgeId, setSimCustomBadgeId] = useState<string>("none");

    const getEffectiveRibbonText = () => {
        if (simRibbonType === "custom") return (simRibbonText.trim() || "FEATURED").toUpperCase();
        if (simRibbonType === "leaving_soon") return "LEAVING SOON";
        if (simRibbonType === "auto_edition") return "SPECIAL EDITION";
        // auto_quality
        if (simShowHdr) return "DOLBY VISION";
        if (simShowResolution) return "4K ULTRA HD";
        return "4K ULTRA HD";
    };

    // Upcoming Releases Calendar & Coming Soon Shares
    const [releasesLoading, setReleasesLoading] = useState(false);
    const [releasesData, setReleasesData] = useState<{ digitalStreaming: any[]; theatricalUpcoming: any[]; nowPlaying: any[] }>({
        digitalStreaming: [],
        theatricalUpcoming: [],
        nowPlaying: []
    });
    const [releaseFilter, setReleaseFilter] = useState<"all" | "digital" | "theatrical">("all");
    const [comingSoonShares, setComingSoonShares] = useState<Record<string, string>>({});
    const [savingShares, setSavingShares] = useState(false);
    const [sharesSavedMsg, setSharesSavedMsg] = useState(false);

    // Server Storage & Mount Paths
    const [serverStorageConfig, setServerStorageConfig] = useState<Record<string, string>>({});
    const [savingStorageConfig, setSavingStorageConfig] = useState(false);
    const [storageConfigSavedMsg, setStorageConfigSavedMsg] = useState(false);

    // Path Validation States & Vault Info
    const [pathCheckResults, setPathCheckResults] = useState<Record<string, { checking: boolean; success?: boolean; msg?: string }>>({});
    const [vaultStats, setVaultStats] = useState<{ backupCount: number; backupBytes: number; badgeCount: number; badgeBytes: number; backupDir: string; badgeDir: string } | null>(null);

    // Agregarr Placeholder Overlays Simulator & Timings
    const [placeholderSimState, setPlaceholderSimState] = useState<"theatrical" | "countdown" | "now_streaming" | "custom">("countdown");
    const [savingPlaceholders, setSavingPlaceholders] = useState(false);
    const [placeholderSavedMsg, setPlaceholderSavedMsg] = useState(false);

    // Leaving Soon Pruning & Safety Sandbox
    const [leavingSoonItems, setLeavingSoonItems] = useState<any[]>([]);
    const [copiedWebhook, setCopiedWebhook] = useState(false);
    const [syncingLeavingSoonHub, setSyncingLeavingSoonHub] = useState(false);
    const [leavingSoonHubMsg, setLeavingSoonHubMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Automated Curation Timer Job States
    const [runningFullSync, setRunningFullSync] = useState(false);
    const [fullSyncResult, setFullSyncResult] = useState<{ success: boolean; text: string; details?: string[] } | null>(null);
    const [savingTimerSettings, setSavingTimerSettings] = useState(false);
    const [timerSavedMsg, setTimerSavedMsg] = useState(false);

    // Media Inspector & Live Preview States
    const [inspectorSearchQuery, setInspectorSearchQuery] = useState("");
    const [searchingPlex, setSearchingPlex] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [inspectingItem, setInspectingItem] = useState<any | null>(null);
    const [loadingInspection, setLoadingInspection] = useState(false);
    const [applyingSingleOverlay, setApplyingSingleOverlay] = useState(false);
    const [revertingSingleOverlay, setRevertingSingleOverlay] = useState(false);
    const [singleItemMsg, setSingleItemMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Prune Simulation & Testing States
    const [simulatingPrune, setSimulatingPrune] = useState(false);
    const [pruneSimResults, setPruneSimResults] = useState<{
        candidates: any[];
        totalRecoverableGb: number;
        evaluatedCount: number;
        serversEvaluated: any[];
    } | null>(null);
    const [executingPrune, setExecutingPrune] = useState(false);
    const [pruneExecMessage, setPruneExecMessage] = useState<{ success: boolean; text: string } | null>(null);
    const [clearingFlags, setClearingFlags] = useState(false);
    const [clearFlagsMsg, setClearFlagsMsg] = useState<string | null>(null);

    // Server Target Matrix State
    const [savingServerTargets, setSavingServerTargets] = useState(false);
    const [serverTargetsSavedMsg, setServerTargetsSavedMsg] = useState(false);

    // IMDb Parental Rating & Tagging States
    const [parentalTaggingEnabled, setParentalTaggingEnabled] = useState(true);
    const [parentalTagFormat, setParentalTagFormat] = useState("prefix_category_severity");
    const [parentalTagPrefix, setParentalTagPrefix] = useState("IMDb");
    const [parentalTagTarget, setParentalTagTarget] = useState("labels");
    const [parentalMinSeverity, setParentalMinSeverity] = useState("Mild");
    const [parentalCategories, setParentalCategories] = useState<string[]>(["nudity", "violence", "profanity", "alcohol", "frightening"]);
    const [savingParentalSettings, setSavingParentalSettings] = useState(false);
    const [parentalTagsSavedMsg, setParentalTagsSavedMsg] = useState(false);
    const [applyingParentalTags, setApplyingParentalTags] = useState(false);
    const [clearingParentalTags, setClearingParentalTags] = useState(false);
    const [parentalTagMsg, setParentalTagMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Inspected Item Parental Advisory State
    const [inspectedAdvisory, setInspectedAdvisory] = useState<any | null>(null);
    const [loadingAdvisory, setLoadingAdvisory] = useState(false);
    const [taggingSingleItem, setTaggingSingleItem] = useState(false);
    const [singleItemTagMsg, setSingleItemTagMsg] = useState<{ success: boolean; text: string } | null>(null);

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
            const [settRes, srvRes, collRes, ruleRes, leaveRes, prefRes, badgesRes, vaultRes] = await Promise.all([
                getCurationSettingsAction().catch(() => ({ success: false })),
                getPlexServersAndSectionsAction().catch(() => ({ success: false })),
                getMediaCollectionsAction().catch(() => ({ success: false, collections: [] })),
                getOverlayRulesAction().catch(() => ({ success: false, rules: [], backupsCount: 0 })),
                getLeavingSoonItemsAction().catch(() => ({ success: false, items: [] })),
                getUserContentPreferencesAction().catch(() => ({ success: false })),
                getCustomBadgesAction().catch(() => ({ success: false, badges: [] })),
                getArtBackupAndBadgeStatsAction().catch(() => ({ success: false }))
            ]);

            const srvData = srvRes as any;
            const prefData = prefRes as any;
            const collData = collRes as any;
            const ruleData = ruleRes as any;
            const leaveData = leaveRes as any;
            const badgeData = badgesRes as any;
            const vaultData = vaultRes as any;

            if ((settRes as any).success) {
                setSettings(settRes);
                if ((settRes as any).comingSoonShares) {
                    setComingSoonShares((settRes as any).comingSoonShares);
                }
                if ((settRes as any).serverStorageConfig) {
                    setServerStorageConfig((settRes as any).serverStorageConfig);
                }
                if ((settRes as any).parentalTaggingEnabled !== undefined) setParentalTaggingEnabled((settRes as any).parentalTaggingEnabled);
                if ((settRes as any).parentalTagFormat) setParentalTagFormat((settRes as any).parentalTagFormat);
                if ((settRes as any).parentalTagPrefix) setParentalTagPrefix((settRes as any).parentalTagPrefix);
                if ((settRes as any).parentalTagTarget) setParentalTagTarget((settRes as any).parentalTagTarget);
                if ((settRes as any).parentalMinSeverity) setParentalMinSeverity((settRes as any).parentalMinSeverity);
                if ((settRes as any).parentalCategories) setParentalCategories((settRes as any).parentalCategories);
            }
            if (vaultData?.success) {
                setVaultStats(vaultData);
            }
            if (srvData?.success && Array.isArray(srvData.servers) && srvData.servers.length > 0) {
                setServers(srvData.servers);
                if (!selectedServerId) {
                    setSelectedServerId(srvData.servers[0].serverId);
                    if (srvData.servers[0].sections?.length > 0) {
                        setSelectedSectionKey(String(srvData.servers[0].sections[0].key));
                    }
                }
            }
            if (collData?.success) {
                const sorted = [...(collData.collections || [])].sort((a, b) => (a.orderIndex ?? 99) - (b.orderIndex ?? 99));
                setCollections(sorted);
            }
            if (ruleData?.success) {
                setOverlayRules(ruleData.rules || []);
                setBackupsCount(ruleData.backupsCount || 0);
            }
            if (badgeData?.success) {
                setCustomBadges(badgeData.badges || []);
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

    // Auto-sync overlay rule settings when selected server / section changes
    useEffect(() => {
        if (!selectedServerId || !selectedSectionKey || overlayRules.length === 0) return;
        const rule = overlayRules.find(r => r.serverId === selectedServerId && r.sectionKey === selectedSectionKey);
        if (rule) {
            if (rule.showResolution !== undefined && rule.showResolution !== null) setSimShowResolution(Boolean(rule.showResolution));
            if (rule.showHdr !== undefined && rule.showHdr !== null) setSimShowHdr(Boolean(rule.showHdr));
            if (rule.showAudio !== undefined && rule.showAudio !== null) setSimShowAudio(Boolean(rule.showAudio));
            if (rule.showAudioChannels !== undefined && rule.showAudioChannels !== null) setSimShowChannels(Boolean(rule.showAudioChannels));
            if (rule.showCodec !== undefined && rule.showCodec !== null) setSimShowCodec(Boolean(rule.showCodec));
            if (rule.showEdition !== undefined && rule.showEdition !== null) setSimShowEdition(Boolean(rule.showEdition));
            if (rule.showStudio !== undefined && rule.showStudio !== null) setSimShowStudio(Boolean(rule.showStudio));
            if (rule.showContentRating !== undefined && rule.showContentRating !== null) setSimShowRating(Boolean(rule.showContentRating));
            if (rule.showRatings !== undefined && rule.showRatings !== null) setSimRatings(Boolean(rule.showRatings));
            if (rule.showLeavingSoon !== undefined && rule.showLeavingSoon !== null) setSimLeavingSoon(Boolean(rule.showLeavingSoon));
            if (rule.badgeScale !== undefined && rule.badgeScale !== null) setSimBadgeScale(Number(rule.badgeScale));
            if (rule.theme) setSimTheme(rule.theme);
            if (rule.resolutionPosition) setSimResolutionPosition(rule.resolutionPosition);
            if (rule.hdrPosition) setSimHdrPosition(rule.hdrPosition);
            if (rule.codecPosition) setSimCodecPosition(rule.codecPosition);
            if (rule.audioPosition) setSimAudioPosition(rule.audioPosition);
            if (rule.channelsPosition) setSimChannelsPosition(rule.channelsPosition);
            if (rule.editionPosition) setSimEditionPosition(rule.editionPosition);
            if (rule.studioPosition) setSimStudioPosition(rule.studioPosition);
            if (rule.contentRatingPosition || rule.ratingPosition) setSimRatingPosition(rule.contentRatingPosition || rule.ratingPosition);
            if (rule.ratingsPosition) setSimRatingsPosition(rule.ratingsPosition);
            if (rule.showRibbon !== undefined && rule.showRibbon !== null) setSimShowRibbon(Boolean(rule.showRibbon));
            if (rule.ribbonPosition) setSimRibbonPosition(rule.ribbonPosition);
            if (rule.ribbonTheme) setSimRibbonTheme(rule.ribbonTheme);
            if (rule.ribbonType) setSimRibbonType(rule.ribbonType);
            if (rule.ribbonText) setSimRibbonText(rule.ribbonText);
        }
    }, [selectedServerId, selectedSectionKey, overlayRules]);

    // Handle Preset 1-Click Sync
    const handleSyncPreset = async (preset: CollectionPreset) => {
        if (!selectedServerId || !selectedSectionKey) {
            alert("Please select a Plex Server and Library Section above first.");
            return;
        }

        setSyncingCollId(preset.id);
        setSyncMessage(null);

        try {
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
                orderIndex: preset.defaultHomeOrder ?? collections.length,
                sortPrefix: preset.defaultSortPrefix ?? `!${String(preset.defaultHomeOrder ?? collections.length).padStart(2, '0')}_`,
                promotedToHome: true,
                promotedToRecommended: true,
                promotedToSharedHome: true,
                isSeasonal: preset.isSeasonal ?? false,
                scheduleStartMonth: preset.scheduleStartMonth,
                scheduleStartDay: preset.scheduleStartDay,
                scheduleEndMonth: preset.scheduleEndMonth,
                scheduleEndDay: preset.scheduleEndDay,
                seasonalAction: preset.seasonalAction ?? "promote_hide",
                autoSync: true
            });

            if (saveRes.success && saveRes.collection) {
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

    // Handle Inspect Blueprint
    const handleInspectPreset = async (preset: CollectionPreset) => {
        if (!selectedServerId || !selectedSectionKey) {
            alert("Please select a Plex Server and Library Section above first.");
            return;
        }
        setInspectingPreset(preset);
        setInspectModalOpen(true);
        setPreviewLoading(true);
        setPreviewData(null);
        try {
            const res = await previewCollectionMatchingAction(selectedServerId, selectedSectionKey, {
                sourceType: preset.sourceType,
                sourceQuery: preset.sourceQuery,
                mediaType: preset.mediaType,
                title: preset.title,
                type: preset.type
            });
            if (res.success) {
                setPreviewData(res as any);
            } else {
                setPreviewData({
                    totalEvaluated: 0,
                    matchCount: 0,
                    executionMethod: res.error || "Failed to preview collection.",
                    sampleMatches: []
                });
            }
        } catch (err: any) {
            setPreviewData({
                totalEvaluated: 0,
                matchCount: 0,
                executionMethod: err.message || "Failed to preview collection.",
                sampleMatches: []
            });
        } finally {
            setPreviewLoading(false);
        }
    };

    // Handle Open Edit Preset
    const handleOpenEditPreset = (preset: CollectionPreset) => {
        const existing = collections.find(c => c.title.toLowerCase() === preset.title.toLowerCase() || (c.sourceQuery && c.sourceQuery === preset.sourceQuery));
        setEditingPresetData({
            presetId: preset.id,
            id: existing?.id,
            title: existing?.title || preset.title,
            summary: existing?.summary || preset.description,
            sourceType: existing?.sourceType || preset.sourceType,
            sourceQuery: existing?.sourceQuery || preset.sourceQuery,
            posterUrl: existing?.posterUrl || preset.defaultPosterUrl || "",
            defaultHomeOrder: existing?.orderIndex ?? preset.defaultHomeOrder ?? 1,
            sortPrefix: existing?.sortPrefix || preset.defaultSortPrefix || "",
            isSeasonal: existing?.isSeasonal ?? preset.isSeasonal ?? false,
            scheduleStartMonth: existing?.scheduleStartMonth ?? preset.scheduleStartMonth ?? 10,
            scheduleStartDay: existing?.scheduleStartDay ?? preset.scheduleStartDay ?? 1,
            scheduleEndMonth: existing?.scheduleEndMonth ?? preset.scheduleEndMonth ?? 11,
            scheduleEndDay: existing?.scheduleEndDay ?? preset.scheduleEndDay ?? 5,
            seasonalAction: existing?.seasonalAction || preset.seasonalAction || "promote_hide",
            category: preset.category,
            type: preset.type
        });
        setResetDefaultSuccess(false);
        setEditPresetModalOpen(true);
    };

    // Handle Reset Preset to Pristine Default
    const handleResetPresetToDefault = () => {
        if (!editingPresetData?.presetId) return;
        const defaultPreset = COLLECTION_PRESETS.find(p => p.id === editingPresetData.presetId);
        if (!defaultPreset) return;
        setEditingPresetData((prev: any) => ({
            ...prev,
            title: defaultPreset.title,
            summary: defaultPreset.description,
            sourceType: defaultPreset.sourceType,
            sourceQuery: defaultPreset.sourceQuery,
            posterUrl: defaultPreset.defaultPosterUrl || "",
            defaultHomeOrder: defaultPreset.defaultHomeOrder ?? 1,
            sortPrefix: defaultPreset.defaultSortPrefix || "",
            isSeasonal: defaultPreset.isSeasonal ?? false,
            scheduleStartMonth: defaultPreset.scheduleStartMonth ?? 10,
            scheduleStartDay: defaultPreset.scheduleStartDay ?? 1,
            scheduleEndMonth: defaultPreset.scheduleEndMonth ?? 11,
            scheduleEndDay: defaultPreset.scheduleEndDay ?? 5,
            seasonalAction: defaultPreset.seasonalAction ?? "promote_hide",
        }));
        setResetDefaultSuccess(true);
        setTimeout(() => setResetDefaultSuccess(false), 3000);
    };

    // Handle Save Edited Preset
    const handleSaveEditedPreset = async () => {
        if (!editingPresetData || !selectedServerId || !selectedSectionKey) {
            alert("Please select a Plex server and library first.");
            return;
        }
        setSavingPresetEdit(true);
        try {
            const res = await saveMediaCollectionAction({
                id: editingPresetData.id,
                title: editingPresetData.title,
                summary: editingPresetData.summary,
                type: editingPresetData.type || "smart",
                category: editingPresetData.category || "General",
                serverId: selectedServerId,
                sectionKey: selectedSectionKey,
                sourceType: editingPresetData.sourceType,
                sourceQuery: editingPresetData.sourceQuery,
                posterUrl: editingPresetData.posterUrl,
                orderIndex: editingPresetData.defaultHomeOrder,
                sortPrefix: editingPresetData.sortPrefix,
                promotedToHome: true,
                promotedToRecommended: true,
                promotedToSharedHome: true,
                isSeasonal: editingPresetData.isSeasonal,
                scheduleStartMonth: editingPresetData.scheduleStartMonth,
                scheduleStartDay: editingPresetData.scheduleStartDay,
                scheduleEndMonth: editingPresetData.scheduleEndMonth,
                scheduleEndDay: editingPresetData.scheduleEndDay,
                seasonalAction: editingPresetData.seasonalAction,
                autoSync: true
            });
            if (res.success) {
                setEditPresetModalOpen(false);
                await loadData();
            } else {
                alert(res.error || "Failed to save collection.");
            }
        } catch (e: any) {
            alert(e.message || "Failed to save collection.");
        } finally {
            setSavingPresetEdit(false);
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
            orderIndex: collections.length,
            sortPrefix: `!${String(collections.length).padStart(2, '0')}_`,
            promotedToHome: true,
            promotedToRecommended: true,
            promotedToSharedHome: true,
            isSeasonal: newCollIsSeasonal,
            scheduleStartMonth: newCollIsSeasonal ? newCollStartMonth : null,
            scheduleStartDay: newCollIsSeasonal ? newCollStartDay : null,
            scheduleEndMonth: newCollIsSeasonal ? newCollEndMonth : null,
            scheduleEndDay: newCollIsSeasonal ? newCollEndDay : null,
            seasonalAction: "promote_hide",
            autoSync: true
        });

        if (saveRes.success && saveRes.collection) {
            await syncCollectionToPlexAction(saveRes.collection.id);
            await loadData();
        }
        setNewCollTitle("");
        setNewCollSummary("");
        setNewCollSourceQuery("");
        setNewCollPosterUrl("");
        setNewCollIsSeasonal(false);
    };

    // Collection Reordering (Move Up / Down)
    const handleMoveCollection = (index: number, direction: "up" | "down") => {
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= collections.length) return;

        const updated = [...collections];
        const temp = updated[index];
        updated[index] = updated[targetIndex];
        updated[targetIndex] = temp;

        const reindexed = updated.map((c, i) => ({
            ...c,
            orderIndex: i,
            sortPrefix: `!${String(i).padStart(2, '0')}_`
        }));

        setCollections(reindexed);
    };

    // Save Collections Order & Push to Plex
    const handleSaveCollectionsOrder = async () => {
        if (!selectedServerId || !selectedSectionKey) {
            alert("Please select a Plex Server and Library Section.");
            return;
        }

        setSavingOrder(true);
        setOrderSavedMsg(null);
        try {
            const payload = collections.map((c, i) => ({
                id: c.id,
                ratingKey: c.ratingKey,
                orderIndex: i,
                sortPrefix: `!${String(i).padStart(2, '0')}_`,
                promotedToHome: c.promotedToHome ?? true,
                promotedToRecommended: c.promotedToRecommended ?? true,
                promotedToSharedHome: c.promotedToSharedHome ?? true
            }));

            const res = await reorderPlexCollectionsAction(selectedServerId, selectedSectionKey, payload);
            if (res.success) {
                setOrderSavedMsg("✓ Plex Home Screen collection ordering saved and synced!");
                setTimeout(() => setOrderSavedMsg(null), 4000);
            } else {
                alert(res.error || "Failed saving order.");
            }
        } catch (e: any) {
            alert(e.message || "Failed saving order.");
        } finally {
            setSavingOrder(false);
        }
    };

    // Run Seasonal Collections Schedule Sync
    const handleSyncSeasonalSchedules = async () => {
        setSyncingSeasonal(true);
        setSeasonalSyncMsg(null);
        try {
            const res = await syncSeasonalAndScheduledCollectionsAction(selectedServerId, selectedSectionKey);
            setSeasonalSyncMsg({
                success: res.success,
                text: res.message || `Seasonal sync complete! Evaluated ${res.evaluatedCount || 0} collections.`
            });
            await loadData();
            setTimeout(() => setSeasonalSyncMsg(null), 5000);
        } catch (e: any) {
            setSeasonalSyncMsg({ success: false, text: e.message || "Failed seasonal sync." });
        } finally {
            setSyncingSeasonal(false);
        }
    };

    // Save Seasonal Collection Schedule Edit
    const handleSaveSeasonalSchedule = async () => {
        if (!editingColl) return;
        setSeasonalModalOpen(false);
        try {
            await saveMediaCollectionAction({
                id: editingColl.id,
                title: editingColl.title,
                summary: editingColl.summary,
                type: editingColl.type,
                category: editingColl.category,
                serverId: editingColl.serverId,
                sectionKey: editingColl.sectionKey,
                sourceType: editingColl.sourceType,
                sourceQuery: editingColl.sourceQuery,
                posterUrl: editingColl.posterUrl,
                isSeasonal: editingColl.isSeasonal,
                scheduleStartMonth: editingColl.scheduleStartMonth,
                scheduleStartDay: editingColl.scheduleStartDay,
                scheduleEndMonth: editingColl.scheduleEndMonth,
                scheduleEndDay: editingColl.scheduleEndDay,
                seasonalAction: editingColl.seasonalAction || "promote_hide",
                orderIndex: editingColl.orderIndex,
                promotedToHome: editingColl.promotedToHome,
                promotedToRecommended: editingColl.promotedToRecommended,
                promotedToSharedHome: editingColl.promotedToSharedHome
            });
            await loadData();
        } catch (e: any) {
            alert(e.message || "Failed updating collection schedule.");
        }
    };

    // Handle Custom Badge File Upload
    const handleUploadCustomBadge = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!badgeFile) {
            setBadgeUploadError("Please select a badge image file (.png, .svg, .webp, .jpg).");
            return;
        }

        setUploadingBadge(true);
        setBadgeUploadError(null);

        try {
            const formData = new FormData();
            formData.append("file", badgeFile);
            formData.append("name", badgeName || badgeFile.name.replace(/\.[^/.]+$/, ""));
            formData.append("category", badgeCategory);
            formData.append("position", badgePosition);
            formData.append("width", String(badgeWidth));
            formData.append("height", String(badgeHeight));
            formData.append("opacity", String(badgeOpacity));
            if (badgeMatchRule) formData.append("matchRule", badgeMatchRule);

            const res = await fetch("/api/curation/badges/upload", {
                method: "POST",
                body: formData
            });

            const data = await res.json();
            if (res.ok && data.success) {
                setUploadModalOpen(false);
                setBadgeFile(null);
                setBadgeName("");
                setBadgeMatchRule("");
                await loadData();
            } else {
                setBadgeUploadError(data.error || "Failed to upload custom badge.");
            }
        } catch (err: any) {
            setBadgeUploadError(err.message || "Network error uploading badge.");
        } finally {
            setUploadingBadge(false);
        }
    };

    // Handle Custom Badge Toggle
    const handleToggleCustomBadge = async (badgeId: string, enabled: boolean) => {
        try {
            await toggleCustomBadgeAction(badgeId, enabled);
            setCustomBadges(customBadges.map(b => b.id === badgeId ? { ...b, enabled } : b));
        } catch (e) {
            console.error("Failed toggling badge:", e);
        }
    };

    // Handle Delete Custom Badge (Single)
    const handleDeleteCustomBadge = async (badgeId: string) => {
        if (!confirm("Are you sure you want to delete this custom badge?")) return;
        try {
            await deleteCustomBadgeAction(badgeId);
            setCustomBadges(customBadges.filter(b => b.id !== badgeId));
            setSelectedCustomBadgeIds(prev => prev.filter(id => id !== badgeId));
        } catch (e) {
            console.error("Failed deleting badge:", e);
        }
    };

    // Filter Custom Badges
    const getFilteredCustomBadges = () => {
        return customBadges.filter(badge => {
            const matchesCategory = customBadgeFilter === "all" || badge.category.toLowerCase() === customBadgeFilter.toLowerCase();
            const matchesSearch = !customBadgeSearch.trim() || 
                badge.name.toLowerCase().includes(customBadgeSearch.toLowerCase()) ||
                badge.category.toLowerCase().includes(customBadgeSearch.toLowerCase()) ||
                (badge.matchRule && badge.matchRule.toLowerCase().includes(customBadgeSearch.toLowerCase())) ||
                badge.position.toLowerCase().includes(customBadgeSearch.toLowerCase());
            return matchesCategory && matchesSearch;
        });
    };

    // Toggle Selection of Single Custom Badge
    const handleToggleSelectCustomBadge = (badgeId: string) => {
        setSelectedCustomBadgeIds(prev => 
            prev.includes(badgeId) ? prev.filter(id => id !== badgeId) : [...prev, badgeId]
        );
    };

    // Select All Filtered Custom Badges
    const handleSelectAllCustomBadges = () => {
        const filtered = getFilteredCustomBadges();
        setSelectedCustomBadgeIds(filtered.map(b => b.id));
    };

    // Deselect All (Select None) Custom Badges
    const handleSelectNoneCustomBadges = () => {
        setSelectedCustomBadgeIds([]);
    };

    // Batch Delete Selected Custom Badges
    const handleDeleteSelectedCustomBadges = async () => {
        if (selectedCustomBadgeIds.length === 0) return;
        const count = selectedCustomBadgeIds.length;
        if (!confirm(`Are you sure you want to permanently delete ${count} custom badge(s)? This will also remove the image files from disk.`)) return;

        setDeletingCustomBadges(true);
        try {
            const res = await deleteMultipleCustomBadgesAction(selectedCustomBadgeIds);
            if (res.success) {
                setCustomBadges(prev => prev.filter(b => !selectedCustomBadgeIds.includes(b.id)));
                setSelectedCustomBadgeIds([]);
            }
        } catch (e) {
            console.error("Failed batch deleting badges:", e);
        } finally {
            setDeletingCustomBadges(false);
        }
    };

    // Batch Toggle Enable/Disable on Selected Custom Badges
    const handleToggleSelectedCustomBadges = async (enabled: boolean) => {
        if (selectedCustomBadgeIds.length === 0) return;
        try {
            await toggleMultipleCustomBadgesAction(selectedCustomBadgeIds, enabled);
            setCustomBadges(prev => prev.map(b => selectedCustomBadgeIds.includes(b.id) ? { ...b, enabled } : b));
        } catch (e) {
            console.error("Failed batch toggling badges:", e);
        }
    };

    // Scan GitHub repository for badge images
    const handleScanGitHubRepo = async (overrideUrl?: string) => {
        const urlToScan = (overrideUrl || githubRepoInput).trim();
        if (!urlToScan) return;
        setScanningRepo(true);
        setScanError(null);
        setImportSuccessMsg(null);
        try {
            const res = await fetchGitHubBadgeRepoAction(urlToScan);
            if (res.success && res.badges) {
                setDiscoveredBadges(res.badges);
                setActiveRepoInfo(res.repoInfo);
                // Preselect all non-2x items by default, or all items
                setSelectedBadgeIds(res.badges.map(b => b.id));
                if (overrideUrl) setGithubRepoInput(overrideUrl);
            } else {
                setScanError(res.error || "No overlay badges found in repository.");
            }
        } catch (e: any) {
            setScanError(e.message || "Failed scanning GitHub repository.");
        } finally {
            setScanningRepo(false);
        }
    };

    // Download and import selected badges
    const handleImportSelectedBadges = async (forceAll = false) => {
        const toImport = forceAll 
            ? discoveredBadges 
            : discoveredBadges.filter(b => selectedBadgeIds.includes(b.id));

        if (toImport.length === 0) {
            alert("Please select at least one badge to download.");
            return;
        }

        setImportingBadges(true);
        setImportSuccessMsg(null);
        setScanError(null);

        try {
            const payload = toImport.map(b => ({
                name: b.name,
                downloadUrl: b.downloadUrl,
                filename: b.filename,
                category: b.category,
                position: b.suggestedPosition,
                matchRule: b.suggestedMatchRule,
                width: b.width,
                height: b.height
            }));

            const res = await importGitHubBadgesAction(payload);
            if (res.success) {
                setImportSuccessMsg(`✓ Successfully downloaded and installed ${res.importedCount} badges from GitHub!`);
                await loadData();
                setTimeout(() => setImportSuccessMsg(null), 5000);
            } else {
                setScanError(res.error || "Failed to download badges.");
            }
        } catch (e: any) {
            setScanError(e.message || "Network error importing badges.");
        } finally {
            setImportingBadges(false);
        }
    };

    // Toggle individual badge selection
    const handleToggleSelectBadge = (badgeId: string) => {
        setSelectedBadgeIds(prev => 
            prev.includes(badgeId) ? prev.filter(id => id !== badgeId) : [...prev, badgeId]
        );
    };

    // Toggle select all
    const handleToggleSelectAll = () => {
        const filtered = getFilteredDiscoveredBadges();
        const allFilteredSelected = filtered.every(b => selectedBadgeIds.includes(b.id));
        if (allFilteredSelected) {
            const filteredIds = new Set(filtered.map(b => b.id));
            setSelectedBadgeIds(prev => prev.filter(id => !filteredIds.has(id)));
        } else {
            const newIds = new Set([...selectedBadgeIds, ...filtered.map(b => b.id)]);
            setSelectedBadgeIds(Array.from(newIds));
        }
    };

    // Filter discovered badges by search and category
    const getFilteredDiscoveredBadges = () => {
        return discoveredBadges.filter(b => {
            const matchesCat = badgeCategoryFilter === "all" || b.category === badgeCategoryFilter;
            const matchesSearch = !badgeSearchQuery.trim() || 
                b.name.toLowerCase().includes(badgeSearchQuery.toLowerCase()) || 
                b.filename.toLowerCase().includes(badgeSearchQuery.toLowerCase()) ||
                b.category.toLowerCase().includes(badgeSearchQuery.toLowerCase());
            return matchesCat && matchesSearch;
        });
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
            const enabledBadgeIds = customBadges.filter(b => b.enabled).map(b => b.id);

            const saveRuleRes = await saveOverlayRuleAction({
                name: "Library Quality Overlays",
                serverId: selectedServerId,
                sectionKey: selectedSectionKey,
                overlayType: "combined",
                position: simPosition,
                videoPosition: simVideoPosition,
                resolutionPosition: simResolutionPosition,
                hdrPosition: simHdrPosition,
                codecPosition: simCodecPosition,
                audioPosition: simAudioPosition,
                channelsPosition: simChannelsPosition,
                editionPosition: simEditionPosition,
                studioPosition: simStudioPosition,
                ratingPosition: simRatingPosition,
                contentRatingPosition: simRatingPosition,
                ratingsPosition: simRatingsPosition,
                showRibbon: simShowRibbon,
                ribbonPosition: simRibbonPosition,
                ribbonTheme: simRibbonTheme,
                ribbonText: simRibbonText || undefined,
                ribbonType: simRibbonType,
                theme: simTheme,
                badgeScale: simBadgeScale,
                showResolution: simShowResolution,
                showHdr: simShowHdr,
                showAudio: simShowAudio,
                showAudioChannels: simShowChannels,
                showCodec: simShowCodec,
                showEdition: simShowEdition,
                showStudio: simShowStudio,
                showContentRating: simShowRating,
                showRatings: simRatings,
                showLeavingSoon: simLeavingSoon,
                customBadgeIds: enabledBadgeIds,
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

    // Handle Save Agregarr Placeholder Timings Settings
    const handleSavePlaceholderSettings = async () => {
        setSavingPlaceholders(true);
        setPlaceholderSavedMsg(false);
        try {
            await saveCurationSettingsAction({
                placeholderEnabled: settings.placeholderEnabled ?? true,
                placeholderTheatricalNoticeDays: settings.placeholderTheatricalNoticeDays ?? 60,
                placeholderDigitalCountdownDays: settings.placeholderDigitalCountdownDays ?? 30,
                placeholderNowStreamingGraceDays: settings.placeholderNowStreamingGraceDays ?? 7,
                placeholderAutoPruneDays: settings.placeholderAutoPruneDays ?? 14,
                placeholderBannerPosition: settings.placeholderBannerPosition ?? "top_banner",
                placeholderBannerTheme: settings.placeholderBannerTheme ?? "cyberpunk_purple",
                placeholderCustomText: settings.placeholderCustomText || ""
            });
            setPlaceholderSavedMsg(true);
            setTimeout(() => setPlaceholderSavedMsg(false), 3500);
        } catch (e: any) {
            alert(e.message || "Failed saving placeholder settings.");
        } finally {
            setSavingPlaceholders(false);
        }
    };

    // Handle Save Automated Timer Settings
    const handleSaveTimerSettings = async () => {
        setSavingTimerSettings(true);
        setTimerSavedMsg(false);
        try {
            await saveCurationSettingsAction({
                curationSyncEnabled: settings.curationSyncEnabled ?? true,
                curationSyncSchedule: settings.curationSyncSchedule || "every_6_hours",
                curationSyncCron: settings.curationSyncCron || null,
                curationSyncOverlays: settings.curationSyncOverlays ?? true,
                curationSyncCollections: settings.curationSyncCollections ?? true,
                curationSyncReleases: settings.curationSyncReleases ?? true,
                curationSyncPruning: settings.curationSyncPruning ?? true
            });
            setTimerSavedMsg(true);
            setTimeout(() => setTimerSavedMsg(false), 3500);
        } catch (e: any) {
            alert(e.message || "Failed saving timer settings.");
        } finally {
            setSavingTimerSettings(false);
        }
    };

    // Handle Run Full Curation Sync Now (Manual On-Demand Execution)
    const handleRunFullCurationSync = async () => {
        setRunningFullSync(true);
        setFullSyncResult(null);
        try {
            const res = await runFullCurationSyncAction();
            setFullSyncResult({
                success: res.success,
                text: res.success ? `Automated Curation Sync Job Finished! Applied ${res.overlaysAppliedCount} overlays, evaluated ${res.seasonalCount} seasonal schedules.` : "Curation sync encountered errors.",
                details: res.details
            });
            await loadData();
        } catch (e: any) {
            setFullSyncResult({ success: false, text: e.message || "Full curation sync failed." });
        } finally {
            setRunningFullSync(false);
        }
    };

    // Handle Search Plex Items in Media Inspector
    const handleSearchPlex = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inspectorSearchQuery.trim()) return;

        setSearchingPlex(true);
        try {
            const res = await searchPlexLibraryItemsAction(
                selectedServerId,
                inspectorSearchQuery.trim(),
                selectedSectionKey || undefined
            );
            setSearchResults(res.items || []);
        } catch (err: any) {
            console.error("Search error:", err);
        } finally {
            setSearchingPlex(false);
        }
    };

    // Handle Select Item for Deep Inspection
    const handleInspectItem = async (ratingKey: string) => {
        setLoadingInspection(true);
        setSingleItemMsg(null);
        setSingleItemTagMsg(null);
        setInspectedAdvisory(null);
        try {
            const res: any = await inspectPlexMediaItemAction(selectedServerId, ratingKey);
            if (res.success && res.item) {
                setInspectingItem(res);
                // Fetch IMDb parental advisory in parallel
                try {
                    const advRes = await inspectItemParentalAdvisoryAction(ratingKey, selectedServerId, {
                        title: res.item.title,
                        year: res.item.year,
                        type: res.item.type,
                        imdbId: res.item.guids?.imdb,
                        contentRating: res.item.contentRating
                    });
                    if (advRes.success && advRes.advisory) {
                        setInspectedAdvisory(advRes.advisory);
                    }
                } catch (aErr) {
                    console.warn("Failed fetching parental advisory for item:", aErr);
                }
            } else {
                alert(res.error || "Inspection failed.");
            }
        } catch (err: any) {
            alert(err.message || "Error inspecting media item.");
        } finally {
            setLoadingInspection(false);
        }
    };

    // Handle Save IMDb Parental Settings
    const handleSaveParentalSettings = async () => {
        setSavingParentalSettings(true);
        setParentalTagsSavedMsg(false);
        try {
            await saveCurationSettingsAction({
                parentalTaggingEnabled,
                parentalTagFormat,
                parentalTagPrefix,
                parentalTagTarget,
                parentalMinSeverity,
                parentalCategories,
                curationSyncParentalTags: settings.curationSyncParentalTags ?? true
            });
            setParentalTagsSavedMsg(true);
            setTimeout(() => setParentalTagsSavedMsg(false), 3500);
        } catch (e: any) {
            alert(e.message || "Failed saving parental tagging settings.");
        } finally {
            setSavingParentalSettings(false);
        }
    };

    // Handle Apply Parental Tags to Selected Library Section
    const handleApplyParentalTags = async () => {
        if (!selectedServerId || !selectedSectionKey) {
            alert("Please select a Plex Server and Library Section above.");
            return;
        }
        setApplyingParentalTags(true);
        setParentalTagMsg(null);
        try {
            const res = await applyParentalTagsToLibraryAction(
                selectedServerId,
                selectedSectionKey,
                {
                    format: parentalTagFormat as any,
                    prefix: parentalTagPrefix,
                    target: parentalTagTarget as any,
                    minSeverity: parentalMinSeverity as any,
                    categories: parentalCategories as any
                }
            );
            setParentalTagMsg({
                success: res.success,
                text: res.success 
                    ? `Tagged ${res.taggedCount} items in library (${res.skippedCount} skipped/none).` 
                    : (res.error || "Failed applying parental tags.")
            });
            await loadData();
        } catch (err: any) {
            setParentalTagMsg({ success: false, text: err.message || "Error applying parental tags." });
        } finally {
            setApplyingParentalTags(false);
        }
    };

    // Handle Clear All Parental Tags from Selected Library Section
    const handleClearParentalTags = async () => {
        if (!selectedServerId || !selectedSectionKey) {
            alert("Please select a Plex Server and Library Section above.");
            return;
        }
        if (!confirm(`Are you sure you want to clear all '${parentalTagPrefix}' parental tags from this Plex library?`)) {
            return;
        }
        setClearingParentalTags(true);
        setParentalTagMsg(null);
        try {
            const res = await clearParentalTagsFromLibraryAction(selectedServerId, selectedSectionKey, parentalTagPrefix);
            setParentalTagMsg({
                success: res.success,
                text: res.success 
                    ? `Cleared parental tags from ${res.clearedCount} items!` 
                    : (res.error || "Failed clearing parental tags.")
            });
        } catch (err: any) {
            setParentalTagMsg({ success: false, text: err.message || "Error clearing parental tags." });
        } finally {
            setClearingParentalTags(false);
        }
    };

    // Handle Apply Parental Tags to Inspected Single Item
    const handleApplySingleParentalTag = async () => {
        if (!inspectingItem || !inspectedAdvisory || !selectedServerId || !selectedSectionKey) return;
        setTaggingSingleItem(true);
        setSingleItemTagMsg(null);
        try {
            const res = await applyParentalTagsToLibraryAction(
                selectedServerId,
                selectedSectionKey,
                {
                    format: parentalTagFormat as any,
                    prefix: parentalTagPrefix,
                    target: parentalTagTarget as any,
                    minSeverity: parentalMinSeverity as any,
                    categories: parentalCategories as any
                }
            );
            setSingleItemTagMsg({ success: true, text: "Parental tags updated for item!" });
            await handleInspectItem(inspectingItem.item.ratingKey);
        } catch (err: any) {
            setSingleItemTagMsg({ success: false, text: err.message });
        } finally {
            setTaggingSingleItem(false);
        }
    };

    // Handle Apply Single Item Overlay
    const handleApplySingleOverlay = async () => {
        if (!inspectingItem || !selectedServerId || !selectedSectionKey) return;
        setApplyingSingleOverlay(true);
        setSingleItemMsg(null);
        try {
            const enabledBadgeIds = customBadges.filter(b => b.enabled).map(b => b.id);
            const res = await applyOverlayToSingleItemAction(
                selectedServerId,
                selectedSectionKey,
                inspectingItem.item.ratingKey,
                {
                    position: simPosition,
                    videoPosition: simVideoPosition,
                    resolutionPosition: simResolutionPosition,
                    hdrPosition: simHdrPosition,
                    codecPosition: simCodecPosition,
                    audioPosition: simAudioPosition,
                    channelsPosition: simChannelsPosition,
                    editionPosition: simEditionPosition,
                    studioPosition: simStudioPosition,
                    ratingPosition: simRatingPosition,
                    contentRatingPosition: simRatingPosition,
                    ratingsPosition: simRatingsPosition,
                    showRibbon: simShowRibbon,
                    ribbonPosition: simRibbonPosition,
                    ribbonTheme: simRibbonTheme,
                    ribbonText: simRibbonText || undefined,
                    ribbonType: simRibbonType,
                    theme: simTheme,
                    badgeScale: simBadgeScale,
                    showResolution: simShowResolution,
                    showHdr: simShowHdr,
                    showAudio: simShowAudio,
                    showAudioChannels: simShowChannels,
                    showCodec: simShowCodec,
                    showEdition: simShowEdition,
                    showStudio: simShowStudio,
                    showContentRating: simShowRating,
                    showRatings: simRatings,
                    showLeavingSoon: simLeavingSoon,
                    customBadgeIds: enabledBadgeIds
                }
            );
            setSingleItemMsg({ success: res.success, text: res.message || "Overlay applied!" });
            if (res.success) {
                await handleInspectItem(inspectingItem.item.ratingKey);
            }
        } catch (err: any) {
            setSingleItemMsg({ success: false, text: err.message });
        } finally {
            setApplyingSingleOverlay(false);
        }
    };

    // Handle Restore Single Item Poster
    const handleRestoreSinglePoster = async () => {
        if (!inspectingItem || !selectedServerId) return;
        setRevertingSingleOverlay(true);
        setSingleItemMsg(null);
        try {
            const res = await restoreSingleItemPosterAction(selectedServerId, inspectingItem.item.ratingKey);
            setSingleItemMsg({ success: res.success, text: res.message || "Restored original poster!" });
            if (res.success) {
                await handleInspectItem(inspectingItem.item.ratingKey);
            }
        } catch (err: any) {
            setSingleItemMsg({ success: false, text: err.message });
        } finally {
            setRevertingSingleOverlay(false);
        }
    };

    // Handle Sync Leaving Soon Home Hub
    const handleSyncLeavingSoonHub = async () => {
        setSyncingLeavingSoonHub(true);
        setLeavingSoonHubMsg(null);
        try {
            await saveCurationSettingsAction({
                leavingSoonPromotedToHome: settings.leavingSoonPromotedToHome ?? true,
                leavingSoonPromotedToRecommended: settings.leavingSoonPromotedToRecommended ?? true,
                leavingSoonPromotedToSharedHome: settings.leavingSoonPromotedToSharedHome ?? true,
                leavingSoonHomeOrder: settings.leavingSoonHomeOrder ?? 0,
                leavingSoonAutoThresholdDays: settings.leavingSoonAutoThresholdDays ?? 14,
                leavingSoonAutoHideEmpty: settings.leavingSoonAutoHideEmpty ?? true
            });

            const res = await syncLeavingSoonCollectionHubAction(selectedServerId, selectedSectionKey);
            setLeavingSoonHubMsg({
                success: res.success,
                text: res.message || "Leaving Soon hub synced to Plex successfully!"
            });
            await loadData();
            setTimeout(() => setLeavingSoonHubMsg(null), 4000);
        } catch (e: any) {
            setLeavingSoonHubMsg({ success: false, text: e.message || "Failed syncing Leaving Soon hub." });
        } finally {
            setSyncingLeavingSoonHub(false);
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

    // Handle Run Prune Simulation (Dry Run)
    const handleRunPruneSimulation = async (targetSrvId?: string) => {
        setSimulatingPrune(true);
        setPruneExecMessage(null);
        try {
            const res = await runPruneSimulationAction(targetSrvId);
            if (res.success) {
                setPruneSimResults({
                    candidates: res.candidates || [],
                    totalRecoverableGb: res.totalRecoverableGb || 0,
                    evaluatedCount: res.evaluatedCount || 0,
                    serversEvaluated: res.serversEvaluated || []
                });
            } else {
                alert(res.error || "Simulation failed.");
            }
        } catch (e: any) {
            alert(e.message || "Failed running prune simulation.");
        } finally {
            setSimulatingPrune(false);
        }
    };

    // Handle Execute Prune (Staged Notice or Force Live Delete)
    const handleExecutePrune = async (items: any[], forceLiveDelete = false) => {
        if (forceLiveDelete) {
            if (!confirm(`⚠️ ARE YOU SURE? You are about to LIVE DELETE ${items.length} media items from disk and your Plex library! This cannot be undone.`)) {
                return;
            }
        }
        setExecutingPrune(true);
        setPruneExecMessage(null);
        try {
            const payload = items.map(it => ({
                ratingKey: it.ratingKey,
                serverId: it.serverId,
                sectionKey: it.sectionKey,
                title: it.title
            }));
            const res = await executePruneAction(payload, { forceLiveDelete });
            if (res.success) {
                setPruneExecMessage({
                    success: true,
                    text: forceLiveDelete 
                        ? `Live deleted ${res.processedCount} items from Plex & disk.` 
                        : `Staged ${res.processedCount} items in Leaving Soon queue with warning notice.`
                });
                await loadData();
                await handleRunPruneSimulation(selectedServerId);
            } else {
                setPruneExecMessage({ success: false, text: res.error || "Execution failed." });
            }
        } catch (e: any) {
            setPruneExecMessage({ success: false, text: e.message });
        } finally {
            setExecutingPrune(false);
        }
    };

    // Handle Clear All Leaving Soon Flags & Restore Posters
    const handleClearAllLeavingSoon = async (srvId?: string) => {
        if (!confirm("Restore all pristine poster artwork and clear all leaving soon advisory flags on this server?")) return;
        setClearingFlags(true);
        setClearFlagsMsg(null);
        try {
            const res = await clearAllLeavingSoonFlagsAction(srvId);
            if (res.success) {
                setClearFlagsMsg(res.message || "Cleared flags and restored artwork.");
                await loadData();
                setTimeout(() => setClearFlagsMsg(null), 4000);
            }
        } catch (e: any) {
            alert(e.message || "Failed clearing flags.");
        } finally {
            setClearingFlags(false);
        }
    };

    // Handle Toggle Server Target
    const handleToggleServerTarget = async (srvId: string, feature: "overlays" | "collections" | "pruning", checked: boolean) => {
        const currentOverlays = settings.enabledServersForOverlays ?? servers.map(s => s.serverId);
        const currentCollections = settings.enabledServersForCollections ?? servers.map(s => s.serverId);
        const currentPruning = settings.enabledServersForPruning ?? servers.map(s => s.serverId);

        let newOverlays = [...currentOverlays];
        let newCollections = [...currentCollections];
        let newPruning = [...currentPruning];

        if (feature === "overlays") {
            newOverlays = checked ? Array.from(new Set([...newOverlays, srvId])) : newOverlays.filter(id => id !== srvId);
        } else if (feature === "collections") {
            newCollections = checked ? Array.from(new Set([...newCollections, srvId])) : newCollections.filter(id => id !== srvId);
        } else if (feature === "pruning") {
            newPruning = checked ? Array.from(new Set([...newPruning, srvId])) : newPruning.filter(id => id !== srvId);
        }

        const updated = {
            ...settings,
            enabledServersForOverlays: newOverlays,
            enabledServersForCollections: newCollections,
            enabledServersForPruning: newPruning
        };
        setSettings(updated);

        try {
            await saveCurationSettingsAction({
                enabledServersForOverlays: newOverlays,
                enabledServersForCollections: newCollections,
                enabledServersForPruning: newPruning
            });
        } catch (e) {
            console.error("Failed saving server targets:", e);
        }
    };

    // Handle Save Coming Soon Shares
    const handleSaveShares = async () => {
        setSavingShares(true);
        setSharesSavedMsg(false);
        try {
            await saveComingSoonSharesAction(comingSoonShares);
            setSharesSavedMsg(true);
            setTimeout(() => setSharesSavedMsg(false), 3000);
        } catch (e) {
            console.error("Failed saving coming soon shares:", e);
        } finally {
            setSavingShares(false);
        }
    };

    // Handle Save Server Storage Config
    const handleSaveStorageConfig = async () => {
        setSavingStorageConfig(true);
        setStorageConfigSavedMsg(false);
        try {
            await saveServerStorageConfigAction(serverStorageConfig);
            setStorageConfigSavedMsg(true);
            setTimeout(() => setStorageConfigSavedMsg(false), 3000);
        } catch (e: any) {
            alert("Failed saving server storage config: " + e.message);
        } finally {
            setSavingStorageConfig(false);
        }
    };

    // Handle Path Validation
    const handleCheckPath = async (key: string, pathStr: string) => {
        if (!pathStr || !pathStr.trim()) return;
        setPathCheckResults(prev => ({ ...prev, [key]: { checking: true } }));
        try {
            const res = await validateDirectoryPathAction(pathStr);
            setPathCheckResults(prev => ({
                ...prev,
                [key]: {
                    checking: false,
                    success: res.success,
                    msg: res.success ? res.message : res.error
                }
            }));
        } catch (e: any) {
            setPathCheckResults(prev => ({
                ...prev,
                [key]: { checking: false, success: false, msg: e.message || "Failed to validate path" }
            }));
        }
    };

    // Current Server Selection
    const currentServer = servers.find(s => s.serverId === selectedServerId) || servers[0];
    const currentSections = currentServer?.sections || [];

    // Helper: Check if seasonal collection is currently in season
    const isCurrentlyInSeason = (coll: any) => {
        if (!coll.isSeasonal) return false;
        const now = new Date();
        const curMonth = now.getMonth() + 1;
        const curDay = now.getDate();
        const curVal = curMonth * 100 + curDay;

        const startM = coll.scheduleStartMonth || 1;
        const startD = coll.scheduleStartDay || 1;
        const endM = coll.scheduleEndMonth || 12;
        const endD = coll.scheduleEndDay || 31;

        const startVal = startM * 100 + startD;
        const endVal = endM * 100 + endD;

        if (startVal <= endVal) {
            return curVal >= startVal && curVal <= endVal;
        } else {
            return curVal >= startVal || curVal <= endVal;
        }
    };

    // Helper to test if a custom badge matches detected media properties
    const doesCustomBadgeMatchDetected = (
        cb: { category?: string; matchRule?: string | null; name?: string; filePath?: string },
        detected: { resolution?: string; hdr?: string; audio?: string; audioChannels?: string; codec?: string; edition?: string; studio?: string; contentRating?: string }
    ): boolean => {
        const rawRule = (cb.matchRule || "").toLowerCase().trim();
        const rawCategory = (cb.category || "").toLowerCase().trim();
        const rawName = (cb.name || "").toLowerCase();
        const combined = `${rawRule} ${rawCategory} ${rawName}`;

        // Wildcard or ribbon/banner without rule
        if (rawRule === "all" || rawRule === "*" || (rawCategory === "ribbon" && !rawRule) || (rawCategory === "banner" && !rawRule)) {
            return true;
        }

        // 1. Resolution
        if (rawCategory === "resolution" || /4k|uhd|2160|1080|fhd|720|hd|sd|480|576/.test(rawRule) || /ultra-hd|1080p|720p/.test(rawName)) {
            const itemRes = detected.resolution;
            if (!itemRes) return false;
            if (/4k|uhd|2160|ultra-hd/i.test(combined)) return itemRes === "4K";
            if (/1080|fhd/i.test(combined)) return itemRes === "1080p";
            if (/720|hd/i.test(combined) && !/1080|4k|fhd|uhd/i.test(combined)) return itemRes === "720p";
            if (/sd|480|576/i.test(combined)) return itemRes === "SD";
        }

        // 2. HDR
        if (rawCategory === "hdr" || /dv|dolby.*vision|hdr10\+|hdr10|hdr/i.test(combined)) {
            const itemHdr = detected.hdr;
            if (!itemHdr) return false;
            if (/dv|dolby.*vision/i.test(combined)) return itemHdr === "DV";
            if (/hdr10\+/i.test(combined)) return itemHdr === "HDR10+";
            if (/hdr10/i.test(combined)) return itemHdr === "HDR10" || itemHdr === "HDR10+";
            if (/hdr/i.test(combined)) return !!itemHdr;
        }

        // 3. Audio & Channels
        if (rawCategory === "audio" || /atmos|truehd|dts|flac|aac|eac3|ac3|5\.1|7\.1/i.test(combined)) {
            const itemAudio = (detected.audio || "").toLowerCase();
            const itemChannels = detected.audioChannels;
            if (/atmos/i.test(combined)) return itemAudio.includes("atmos");
            if (/truehd/i.test(combined)) return itemAudio.includes("truehd");
            if (/dts[-:_]?x/i.test(combined)) return itemAudio.includes("dts:x") || itemAudio.includes("dts-x");
            if (/dts[-:_]?hd|dtshd|dts[-:_]?ma/i.test(combined)) return itemAudio.includes("dts-hd") || itemAudio.includes("ma");
            if (/dts/i.test(combined) && !/dts[-:_]?x|dts[-:_]?hd/i.test(combined)) return itemAudio.includes("dts");
            if (/7\.1/i.test(combined)) return itemChannels === "7.1";
            if (/5\.1/i.test(combined)) return itemChannels === "5.1";
        }

        // 4. Video Codecs
        if (rawCategory === "codec" || /hevc|h265|x265|av1|prores|h264|x264|avc/i.test(combined)) {
            const itemCodec = detected.codec;
            if (!itemCodec) return false;
            if (/hevc|h265|x265/i.test(combined)) return itemCodec === "HEVC";
            if (/av1/i.test(combined)) return itemCodec === "AV1";
            if (/prores/i.test(combined)) return itemCodec === "ProRes";
            if (/h264|x264|avc/i.test(combined)) return itemCodec === "AVC";
        }

        // 5. Editions
        if (rawCategory === "edition" || /imax|criterion|director|extended|remaster|remux/i.test(combined)) {
            const itemEdition = (detected.edition || "").toLowerCase();
            if (!itemEdition) return false;
            if (/imax/i.test(combined)) return itemEdition.includes("imax");
            if (/criterion/i.test(combined)) return itemEdition.includes("criterion");
            if (/director/i.test(combined)) return itemEdition.includes("director");
            if (/extended/i.test(combined)) return itemEdition.includes("extended");
            if (/remaster/i.test(combined)) return itemEdition.includes("remaster");
            if (/remux/i.test(combined)) return itemEdition.includes("remux");
        }

        // 6. Studios
        if (rawCategory === "studio" || /netflix|disney|hbo|apple|prime|paramount|marvel|dc|a24/i.test(combined)) {
            const itemStudio = (detected.studio || "").toLowerCase();
            if (!itemStudio) return false;
            if (/netflix/i.test(combined)) return itemStudio.includes("netflix");
            if (/disney/i.test(combined)) return itemStudio.includes("disney");
            if (/hbo/i.test(combined)) return itemStudio.includes("hbo") || itemStudio.includes("max");
            if (/apple/i.test(combined)) return itemStudio.includes("apple");
            if (/prime|amazon/i.test(combined)) return itemStudio.includes("prime") || itemStudio.includes("amazon");
            if (/paramount/i.test(combined)) return itemStudio.includes("paramount");
            if (/marvel/i.test(combined)) return itemStudio.includes("marvel");
            if (/dc/i.test(combined)) return itemStudio.includes("dc");
            if (/a24/i.test(combined)) return itemStudio.includes("a24");
        }

        // 7. Content Ratings
        if (rawCategory === "ratings" || /pg-13|tv-14|pg|tv-pg|nc-17|tv-ma|\br\b|\bg\b/i.test(combined)) {
            const itemRating = (detected.contentRating || "").toUpperCase();
            if (!itemRating) return false;
            if (/pg-13|tv-14/i.test(combined)) return itemRating === "PG-13";
            if (/nc-17/i.test(combined)) return itemRating === "NC-17";
            if (/\br\b|tv-ma/i.test(combined)) return itemRating === "R";
            if (/pg\b|tv-pg/i.test(combined)) return itemRating === "PG";
            if (/\bg\b|tv-g|tv-y/i.test(combined)) return itemRating === "G";
        }

        return rawCategory === "custom" || rawCategory === "";
    };

    // Helper to get which human category an active custom badge overrides
    const getCustomBadgeOverriddenCategory = (cb: any): string => {
        const cat = (cb.category || "").toLowerCase();
        const rule = (cb.matchRule || "").toLowerCase();
        const name = (cb.name || "").toLowerCase();
        const combined = `${cat} ${rule} ${name}`;

        if (cat === "resolution" || /4k|1080|720|sd|uhd|fhd/i.test(combined)) return "Resolution (4K / 1080p)";
        if (cat === "hdr" || /dv|hdr|dolby.*vision/i.test(combined)) return "Dynamic Range (DV / HDR)";
        if (cat === "codec" || /hevc|av1|prores|avc/i.test(combined)) return "Video Codec";
        if (cat === "audio" || /atmos|truehd|dts/i.test(combined)) return "Audio Format";
        if (/7\.1|5\.1|2\.0|channels|surround/i.test(combined)) return "Audio Channels";
        if (cat === "edition" || /imax|criterion|director|extended|remux/i.test(combined)) return "Edition / Cut";
        if (cat === "studio" || /netflix|disney|hbo|apple|prime|paramount|marvel|dc|a24/i.test(combined)) return "Studio / Network";
        if (cat === "ratings" || /pg-13|nc-17|tv-ma|rated/i.test(combined)) return "Age Rating";
        if (cat === "ribbon") return "Corner Ribbon";
        return "Custom Overlay";
    };

    // Helper to query all active custom badges overriding a given layer category
    const getMatchingActiveCustomBadgesForCategory = (category: string) => {
        return customBadges.filter(cb => {
            if (!cb.enabled) return false;
            const cat = (cb.category || "").toLowerCase();
            const rule = (cb.matchRule || "").toLowerCase();
            const name = (cb.name || "").toLowerCase();
            const combined = `${cat} ${rule} ${name}`;
            if (category === "resolution") return cat === "resolution" || /4k|1080|720|sd|uhd|fhd/i.test(combined);
            if (category === "hdr") return cat === "hdr" || /dv|hdr|dolby.*vision/i.test(combined);
            if (category === "codec") return cat === "codec" || /hevc|av1|prores|avc/i.test(combined);
            if (category === "audio") return cat === "audio" || /atmos|truehd|dts/i.test(combined);
            if (category === "channels") return /7\.1|5\.1|2\.0|channels|surround/i.test(combined);
            if (category === "edition") return cat === "edition" || /imax|criterion|director|extended|remux/i.test(combined);
            if (category === "studio") return cat === "studio" || /netflix|disney|hbo|apple|prime|paramount|marvel|dc|a24/i.test(combined);
            if (category === "ratings") return cat === "ratings" || /pg-13|nc-17|tv-ma|rated/i.test(combined);
            return false;
        });
    };

    // Helper to render badges into assigned positions in the simulator
    const renderBadgesForPosition = (pos: string) => {
        const badges: React.ReactNode[] = [];
        const simDetected = {
            resolution: simShowResolution ? "4K" : undefined,
            hdr: simShowHdr ? "DV" : undefined,
            codec: simShowCodec ? "HEVC" : undefined,
            audio: simShowAudio ? "ATMOS" : undefined,
            audioChannels: simShowChannels ? "7.1" : undefined,
            edition: simShowEdition ? "IMAX" : undefined,
            studio: simShowStudio ? "HBO" : undefined,
            contentRating: simShowRating ? "PG-13" : undefined
        };

        let hasCustomRes = false;
        let hasCustomHdr = false;
        let hasCustomCodec = false;
        let hasCustomAudio = false;
        let hasCustomEdition = false;
        let hasCustomStudio = false;
        let hasCustomRating = false;

        // 1. Check matching active custom badges for this position (Priority 1)
        const activeMatchedCustom = customBadges.filter(cb => cb.enabled && doesCustomBadgeMatchDetected(cb, simDetected));
        for (const cb of activeMatchedCustom) {
            const cbPos = cb.position || "top-right";
            if (cbPos === pos) {
                const overriddenCat = getCustomBadgeOverriddenCategory(cb);
                if (overriddenCat.includes("Resolution")) hasCustomRes = true;
                if (overriddenCat.includes("Dynamic Range")) hasCustomHdr = true;
                if (overriddenCat.includes("Video Codec")) hasCustomCodec = true;
                if (overriddenCat.includes("Audio Format")) hasCustomAudio = true;
                if (overriddenCat.includes("Edition")) hasCustomEdition = true;
                if (overriddenCat.includes("Studio")) hasCustomStudio = true;
                if (overriddenCat.includes("Age Rating")) hasCustomRating = true;

                badges.push(
                    <div key={`custom-${cb.id}`} className="relative rounded overflow-hidden shadow-lg transition-transform hover:scale-105" style={{ opacity: cb.opacity ?? 1.0 }} title={`Priority 1 Override: ${cb.name}`}>
                        <img 
                            src={`/api/curation/badges/${cb.id}`} 
                            alt={cb.name}
                            style={{ width: Math.min(cb.width || 120, 140), height: Math.min(cb.height || 40, 46) }} 
                            className="object-contain drop-shadow"
                        />
                    </div>
                );
            }
        }

        // 2. Built-in Fallbacks (Priority 2) - only added if not overridden by a custom badge
        // Resolution (4K UHD)
        if (simResolutionPosition === pos && simShowResolution && !hasCustomRes) {
            badges.push(
                <div key="res" className={`relative px-2 py-0.5 rounded-md border text-[10px] font-black tracking-wider flex items-center gap-1 shadow-lg overflow-hidden backdrop-blur-md ${
                    simTheme === "gold" 
                        ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-black border-yellow-200' 
                        : 'bg-slate-950/90 text-white border-amber-400/80'
                }`}>
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    <span>4K</span>
                    <span className="text-[8px] opacity-75 border-l border-current pl-1 ml-0.5 tracking-widest text-amber-300">UHD</span>
                </div>
            );
        }

        // HDR / Dolby Vision
        if (simHdrPosition === pos && simShowHdr && !hasCustomHdr) {
            badges.push(
                <div key="hdr" className="relative px-2 py-0.5 rounded-md border border-purple-400/80 bg-slate-950/90 text-purple-200 text-[9px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md flex items-center gap-1">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    <span className="w-1.5 h-2.5 bg-purple-400 rounded-sm inline-block mr-0.5" />
                    <span>DOLBY VISION</span>
                </div>
            );
        }

        // Video Codec (HEVC)
        if (simCodecPosition === pos && simShowCodec && !hasCustomCodec) {
            badges.push(
                <div key="codec" className="relative px-1.5 py-0.5 rounded-md border border-indigo-400/70 bg-slate-950/90 text-indigo-200 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    HEVC • 10b
                </div>
            );
        }

        // Audio format (Dolby Atmos)
        if (simAudioPosition === pos && simShowAudio && !hasCustomAudio) {
            badges.push(
                <div key="audio" className="relative px-2 py-0.5 rounded-md border border-sky-400/80 bg-slate-950/90 text-sky-200 text-[9px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    DOLBY ATMOS
                </div>
            );
        }

        // Audio Surround Channels (7.1)
        if (simChannelsPosition === pos && simShowChannels) {
            badges.push(
                <div key="channels" className="relative px-1.5 py-0.5 rounded-md border border-cyan-400/70 bg-slate-950/90 text-cyan-300 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    7.1 SURROUND
                </div>
            );
        }

        // Edition Cuts (IMAX Enhanced)
        if (simEditionPosition === pos && simShowEdition && !hasCustomEdition) {
            badges.push(
                <div key="edition" className="relative px-2 py-0.5 rounded-md border border-sky-400 bg-slate-950/95 text-sky-300 text-[8px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    IMAX ENHANCED
                </div>
            );
        }

        // Studio / Network Logos (HBO Max)
        if (simStudioPosition === pos && simShowStudio && !hasCustomStudio) {
            badges.push(
                <div key="studio" className="relative px-2 py-0.5 rounded-md border border-purple-500 text-purple-300 bg-slate-950/95 text-[8px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    HBO MAX
                </div>
            );
        }

        // Content Rating (PG-13)
        if (simRatingPosition === pos && simShowRating && !hasCustomRating) {
            badges.push(
                <div key="rating" className="relative px-1.5 py-0.5 rounded border border-amber-500 text-amber-300 bg-slate-950/90 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-0.5 right-0.5 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    PG-13
                </div>
            );
        }

        // Community Ratings (IMDb, Rotten Tomatoes, Metacritic)
        if (simRatingsPosition === pos && simRatings) {
            badges.push(
                <div key="ratings" className="relative flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/95 border border-white/20 shadow-lg text-[10px] overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    <div className="bg-yellow-400 text-black font-black px-1 rounded text-[8.5px] leading-tight">IMDb</div>
                    <span className="font-bold text-white text-[10px]">8.6</span>
                    <span className="text-[10px]">🍅</span>
                    <span className="font-bold text-white text-[10px]">94%</span>
                    <span className="text-[10px]">🍿</span>
                    <span className="font-bold text-white text-[10px]">92%</span>
                </div>
            );
        }

        // Explicitly Selected Custom Badge
        if (simCustomBadgeId !== "none") {
            const cb = customBadges.find(b => b.id === simCustomBadgeId);
            if (cb && (cb.position || "top-right") === pos && !activeMatchedCustom.some(m => m.id === cb.id)) {
                badges.push(
                    <div key={`sim-custom-${cb.id}`} className="relative rounded overflow-hidden shadow-lg" style={{ opacity: cb.opacity ?? 1.0 }}>
                        <img 
                            src={`/api/curation/badges/${cb.id}`} 
                            alt={cb.name}
                            style={{ width: Math.min(cb.width || 120, 140), height: Math.min(cb.height || 40, 46) }} 
                            className="object-contain drop-shadow"
                        />
                    </div>
                );
            }
        }

        return badges;
    };

    // Helper for inspector simulated item badges
    const renderInspectedBadgesForPosition = (item: any, pos: string) => {
        const badges: React.ReactNode[] = [];
        const detected = item?.detectedBadges || {};

        let hasCustomRes = false;
        let hasCustomHdr = false;
        let hasCustomCodec = false;
        let hasCustomAudio = false;
        let hasCustomEdition = false;
        let hasCustomStudio = false;
        let hasCustomRating = false;

        // 1. Check matching active custom badges for this position
        const activeMatchedCustom = customBadges.filter(cb => cb.enabled && doesCustomBadgeMatchDetected(cb, detected));
        for (const cb of activeMatchedCustom) {
            const cbPos = cb.position || "top-right";
            if (cbPos === pos) {
                const overriddenCat = getCustomBadgeOverriddenCategory(cb);
                if (overriddenCat.includes("Resolution")) hasCustomRes = true;
                if (overriddenCat.includes("Dynamic Range")) hasCustomHdr = true;
                if (overriddenCat.includes("Video Codec")) hasCustomCodec = true;
                if (overriddenCat.includes("Audio Format")) hasCustomAudio = true;
                if (overriddenCat.includes("Edition")) hasCustomEdition = true;
                if (overriddenCat.includes("Studio")) hasCustomStudio = true;
                if (overriddenCat.includes("Age Rating")) hasCustomRating = true;

                badges.push(
                    <div key={`inspect-custom-${cb.id}`} className="relative rounded overflow-hidden shadow-lg transition-transform hover:scale-105" style={{ opacity: cb.opacity ?? 1.0 }} title={`Priority 1 Override: ${cb.name}`}>
                        <img 
                            src={`/api/curation/badges/${cb.id}`} 
                            alt={cb.name}
                            style={{ width: Math.min(cb.width || 120, 140), height: Math.min(cb.height || 40, 46) }} 
                            className="object-contain drop-shadow"
                        />
                    </div>
                );
            }
        }

        // 2. Built-in Fallbacks (Priority 2)
        if (detected.resolution && simShowResolution && simResolutionPosition === pos && !hasCustomRes) {
            badges.push(
                <div key="res" className={`relative px-2 py-0.5 rounded-md border text-[10px] font-black tracking-wider flex items-center gap-1 shadow-lg overflow-hidden backdrop-blur-md ${
                    simTheme === "gold" 
                        ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-black border-yellow-200' 
                        : 'bg-slate-950/90 text-white border-amber-400/80'
                }`}>
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    <span>{detected.resolution}</span>
                    {detected.resolution === "4K" && <span className="text-[8px] opacity-75 border-l border-current pl-1 ml-0.5 tracking-widest text-amber-300">UHD</span>}
                    {detected.resolution === "1080p" && <span className="text-[8px] opacity-75 border-l border-current pl-1 ml-0.5 tracking-widest text-sky-300">FHD</span>}
                </div>
            );
        }

        if (detected.hdr && simShowHdr && simHdrPosition === pos && !hasCustomHdr) {
            badges.push(
                <div key="hdr" className="relative px-2 py-0.5 rounded-md border border-purple-400/80 bg-slate-950/90 text-purple-200 text-[9px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md flex items-center gap-1">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    {detected.hdr === "DV" ? (
                        <>
                            <span className="w-1.5 h-2.5 bg-purple-400 rounded-sm inline-block mr-0.5" />
                            <span>DOLBY VISION</span>
                        </>
                    ) : (
                        <span>{detected.hdr}</span>
                    )}
                </div>
            );
        }

        if (detected.codec && simShowCodec && simCodecPosition === pos && !hasCustomCodec) {
            badges.push(
                <div key="codec" className="relative px-1.5 py-0.5 rounded-md border border-indigo-400/70 bg-slate-950/90 text-indigo-200 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    {detected.codec}
                </div>
            );
        }

        if (detected.audio && simShowAudio && simAudioPosition === pos && !hasCustomAudio) {
            badges.push(
                <div key="audio" className="relative px-2 py-0.5 rounded-md border border-sky-400/80 bg-slate-950/90 text-sky-200 text-[9px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    {detected.audio === "ATMOS" ? "DOLBY ATMOS" : detected.audio}
                </div>
            );
        }

        if (detected.audioChannels && simShowChannels && simChannelsPosition === pos) {
            badges.push(
                <div key="channels" className="relative px-1.5 py-0.5 rounded-md border border-cyan-400/70 bg-slate-950/90 text-cyan-300 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    {detected.audioChannels} SURROUND
                </div>
            );
        }

        if (detected.edition && simShowEdition && simEditionPosition === pos && !hasCustomEdition) {
            badges.push(
                <div key="edition" className="relative px-2 py-0.5 rounded-md border border-amber-400/80 bg-slate-950/95 text-amber-300 text-[8px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    {detected.edition}
                </div>
            );
        }

        if (detected.studio && simShowStudio && simStudioPosition === pos && !hasCustomStudio) {
            badges.push(
                <div key="studio" className="relative px-2 py-0.5 rounded-md border border-indigo-400/80 bg-slate-950/95 text-indigo-200 text-[8px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    {detected.studio}
                </div>
            );
        }

        if (detected.contentRating && simShowRating && simRatingPosition === pos && !hasCustomRating) {
            badges.push(
                <div key="rating" className="relative px-1.5 py-0.5 rounded border border-slate-400 bg-slate-950/90 text-slate-200 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                    <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                    {detected.contentRating}
                </div>
            );
        }

        return badges;
    };

    // Helper for rendering clean source provider badges (TMDb, IMDb, Trakt, Plex Smart)
    const getSourceBadge = (sourceType?: string, title?: string, query?: string) => {
        const s = (sourceType || "").toLowerCase();
        const q = (query || title || "").toLowerCase();
        if (s === "mdblist") {
            if (q.includes("imdb") || q.includes("top-250") || q.includes("top_250")) {
                return (
                    <Badge variant="secondary" className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 gap-1">
                        <span>⭐</span> IMDb
                    </Badge>
                );
            }
            if (q.includes("oscar") || q.includes("academy")) {
                return (
                    <Badge variant="secondary" className="text-[10px] font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 gap-1">
                        <span>🏆</span> TMDb / IMDb
                    </Badge>
                );
            }
            return (
                <Badge variant="secondary" className="text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 gap-1">
                    <span>⭐</span> IMDb / TMDb
                </Badge>
            );
        }
        if (s === "tmdb") {
            return (
                <Badge variant="secondary" className="text-[10px] font-bold bg-sky-500/20 text-sky-300 border border-sky-500/40 gap-1">
                    <span>🎬</span> TMDb
                </Badge>
            );
        }
        if (s === "trakt") {
            return (
                <Badge variant="secondary" className="text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 gap-1">
                    <span>🔥</span> Trakt
                </Badge>
            );
        }
        if (s === "plex_query") {
            return (
                <Badge variant="secondary" className="text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 gap-1">
                    <span>⚡</span> Plex Smart
                </Badge>
            );
        }
        return (
            <Badge variant="secondary" className="text-[10px] font-semibold bg-slate-800 text-slate-300">
                {sourceType?.toUpperCase() || "MANUAL"}
            </Badge>
        );
    };

    // Helper to calculate active overlays & priority breakdown for the simulator
    const getSimulatedLayersBreakdown = () => {
        const layers: Array<{
            category: string;
            value: string;
            sourceType: "custom" | "builtin";
            sourceName: string;
            position: string;
        }> = [];

        const simDetected = {
            resolution: simShowResolution ? "4K" : undefined,
            hdr: simShowHdr ? "DV" : undefined,
            codec: simShowCodec ? "HEVC" : undefined,
            audio: simShowAudio ? "ATMOS" : undefined,
            audioChannels: simShowChannels ? "7.1" : undefined,
            edition: simShowEdition ? "IMAX" : undefined,
            studio: simShowStudio ? "HBO" : undefined,
            contentRating: simShowRating ? "PG-13" : undefined
        };

        // Resolution
        if (simShowResolution) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Resolution") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Resolution", value: "4K UHD", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simResolutionPosition });
            } else {
                layers.push({ category: "Resolution", value: "4K UHD", sourceType: "builtin", sourceName: `Kometa SVG (${simTheme === "gold" ? "Gold" : "Obsidian"})`, position: simResolutionPosition });
            }
        }

        // HDR
        if (simShowHdr) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Dynamic Range") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "HDR / DV", value: "Dolby Vision", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simHdrPosition });
            } else {
                layers.push({ category: "HDR / DV", value: "Dolby Vision", sourceType: "builtin", sourceName: "Kometa SVG", position: simHdrPosition });
            }
        }

        // Video Codec
        if (simShowCodec) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Video Codec") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Video Codec", value: "HEVC (H.265)", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simCodecPosition });
            } else {
                layers.push({ category: "Video Codec", value: "HEVC (H.265)", sourceType: "builtin", sourceName: "Kometa SVG", position: simCodecPosition });
            }
        }

        // Audio Codec
        if (simShowAudio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Audio Format") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Audio Format", value: "Dolby Atmos", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simAudioPosition });
            } else {
                layers.push({ category: "Audio Format", value: "Dolby Atmos", sourceType: "builtin", sourceName: "Kometa SVG", position: simAudioPosition });
            }
        }

        // Audio Channels
        if (simShowChannels) {
            layers.push({ category: "Audio Channels", value: "7.1 Surround", sourceType: "builtin", sourceName: "Kometa SVG", position: simChannelsPosition });
        }

        // Edition
        if (simShowEdition) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Edition") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Edition / Cut", value: "IMAX Enhanced", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simEditionPosition });
            } else {
                layers.push({ category: "Edition / Cut", value: "IMAX Enhanced", sourceType: "builtin", sourceName: "Kometa SVG", position: simEditionPosition });
            }
        }

        // Studio
        if (simShowStudio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Studio") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Studio / Network", value: "HBO Max", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simStudioPosition });
            } else {
                layers.push({ category: "Studio / Network", value: "HBO Max", sourceType: "builtin", sourceName: "Kometa SVG", position: simStudioPosition });
            }
        }

        // Content Rating
        if (simShowRating) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Age Rating") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Age Rating", value: "PG-13", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simRatingPosition });
            } else {
                layers.push({ category: "Age Rating", value: "PG-13", sourceType: "builtin", sourceName: "Kometa SVG", position: simRatingPosition });
            }
        }

        // Community Ratings Bar
        if (simRatings) {
            layers.push({ category: "Community Ratings", value: "IMDb 8.6 • RT 94%", sourceType: "builtin", sourceName: "IMDb / Rotten Tomatoes", position: simRatingsPosition });
        }

        // Corner Ribbon
        if (simShowRibbon) {
            layers.push({ category: "Corner Ribbon", value: getEffectiveRibbonText(), sourceType: "builtin", sourceName: `Gloss Ribbon (${simRibbonTheme})`, position: simRibbonPosition });
        }

        return layers;
    };

    // Helper to calculate decision matrix for inspected Plex media item
    const getInspectedItemDecisionMatrix = (item: any) => {
        const detected = item?.detectedBadges || {};
        const decisions: Array<{
            property: string;
            detectedValue: string;
            priority: "Priority 1 (Custom Override)" | "Priority 2 (Built-in SVG)";
            badgeName: string;
            position: string;
            isCustom: boolean;
        }> = [];

        if (detected.resolution) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Resolution") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Resolution",
                detectedValue: detected.resolution,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.resolution} SVG`,
                position: matchingCustom?.position || simResolutionPosition,
                isCustom: !!matchingCustom
            });
        }

        if (detected.hdr) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Dynamic Range") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Dynamic Range / HDR",
                detectedValue: detected.hdr === "DV" ? "Dolby Vision" : detected.hdr,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.hdr} SVG`,
                position: matchingCustom?.position || simHdrPosition,
                isCustom: !!matchingCustom
            });
        }

        if (detected.audio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Audio Format") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Audio Format",
                detectedValue: detected.audio,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.audio} SVG`,
                position: matchingCustom?.position || simAudioPosition,
                isCustom: !!matchingCustom
            });
        }

        if (detected.audioChannels) {
            decisions.push({
                property: "Audio Channels",
                detectedValue: `${detected.audioChannels} Channels`,
                priority: "Priority 2 (Built-in SVG)",
                badgeName: `Built-in ${detected.audioChannels} CH SVG`,
                position: simChannelsPosition,
                isCustom: false
            });
        }

        if (detected.codec) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Video Codec") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Video Codec",
                detectedValue: detected.codec,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.codec} SVG`,
                position: matchingCustom?.position || simCodecPosition,
                isCustom: !!matchingCustom
            });
        }

        if (detected.edition) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Edition") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Edition / Cut",
                detectedValue: detected.edition,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.edition} SVG`,
                position: matchingCustom?.position || simEditionPosition,
                isCustom: !!matchingCustom
            });
        }

        if (detected.studio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Studio") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Studio / Network",
                detectedValue: detected.studio,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.studio} SVG`,
                position: matchingCustom?.position || simStudioPosition,
                isCustom: !!matchingCustom
            });
        }

        if (detected.contentRating) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeOverriddenCategory(cb).includes("Age Rating") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Age Rating",
                detectedValue: detected.contentRating,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.contentRating} SVG`,
                position: matchingCustom?.position || simRatingPosition,
                isCustom: !!matchingCustom
            });
        }

        return decisions;
    };

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
                        Unified automated collections with Plex Home Screen ordering, custom badge uploads, 4K/HDR/Audio poster overlays, Agregarr-style placeholder timings, and disk capacity prune management.
                    </p>
                </div>

                {/* Interactive Preview & Library Scope Bar */}
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2.5 bg-slate-900/90 p-2.5 px-3 border border-slate-800 rounded-2xl shadow-inner w-full sm:w-auto">
                    <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold pr-1 sm:border-r border-slate-800">
                        <Eye className="h-3.5 w-3.5 text-purple-400" />
                        <span className="text-slate-300">Preview & Manual Target:</span>
                    </div>
                    <div className="flex items-center gap-2 w-full sm:w-auto">
                        <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
                            <Tv className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                            <Select value={selectedServerId} onValueChange={(val) => {
                                setSelectedServerId(val);
                                const srv = servers.find(s => s.serverId === val);
                                if (srv?.sections?.length > 0) setSelectedSectionKey(String(srv.sections[0].key));
                            }}>
                                <SelectTrigger className="h-8 min-w-[135px] text-xs bg-slate-800/90 border-slate-700">
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

                        <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
                            <Film className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                            <Select value={selectedSectionKey} onValueChange={setSelectedSectionKey}>
                                <SelectTrigger className="h-8 min-w-[135px] text-xs bg-slate-800/90 border-slate-700">
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
            </div>

            {/* Automated Periodic Timer Job & Full Sync Banner */}
            <Card className="bg-slate-900/80 border-slate-800 shadow-xl overflow-hidden">
                <CardContent className="p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-purple-400" />
                            <span className="font-bold text-white text-sm">Automated Periodic Timer Job & Sync Runner</span>
                            <Badge variant="outline" className="border-purple-500/40 text-purple-300 bg-purple-950/30 text-[10px] font-semibold">
                                {settings.curationSyncEnabled ? `Active (${settings.curationSyncSchedule?.replace(/_/g, ' ') || 'every 6 hours'})` : 'Paused'}
                            </Badge>
                        </div>
                        <p className="text-[11px] text-slate-400">
                            Automatically checks for newly added movies/shows on a timer schedule to apply posters/overlays, evaluates seasonal collection calendars, refreshes digital release stubs, and checks Leaving Soon disk space triggers on your enabled servers.
                        </p>
                        {settings.curationLastRunAt && (
                            <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Clock3 className="h-3 w-3 text-purple-400" />
                                Last automated run: <span className="text-slate-300 font-mono">{new Date(settings.curationLastRunAt).toLocaleString()}</span>
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
                            <span className="text-[11px] font-bold text-slate-200">Timer</span>
                            <Switch 
                                checked={settings.curationSyncEnabled ?? true}
                                onCheckedChange={checked => setSettings({ ...settings, curationSyncEnabled: checked })}
                            />
                        </div>

                        <div className="space-y-0.5">
                            <Select 
                                value={settings.curationSyncSchedule || "every_6_hours"} 
                                onValueChange={val => setSettings({ ...settings, curationSyncSchedule: val })}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-8 w-[150px]">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="every_hour">⚡ Every 1 Hour</SelectItem>
                                    <SelectItem value="every_3_hours">⏱️ Every 3 Hours</SelectItem>
                                    <SelectItem value="every_6_hours">🔄 Every 6 Hours</SelectItem>
                                    <SelectItem value="every_12_hours">⏳ Every 12 Hours</SelectItem>
                                    <SelectItem value="daily_3am">🌙 Daily at 3:00 AM</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button 
                            size="sm"
                            onClick={handleSaveTimerSettings}
                            disabled={savingTimerSettings}
                            variant="outline"
                            className="border-slate-700 text-slate-300 hover:text-white text-xs h-8 px-3"
                        >
                            {savingTimerSettings ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                            Save Schedule
                        </Button>

                        <Button 
                            size="sm"
                            onClick={handleRunFullCurationSync}
                            disabled={runningFullSync}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-purple-950/40"
                        >
                            {runningFullSync ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            <span>Run Full Sync Now</span>
                        </Button>
                    </div>
                </CardContent>

                {fullSyncResult && (
                    <div className={`p-3 text-xs border-t ${fullSyncResult.success ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'} flex items-start gap-2`}>
                        {fullSyncResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                        <div className="space-y-0.5">
                            <span className="font-bold">{fullSyncResult.text}</span>
                            {fullSyncResult.details && (
                                <p className="text-[11px] opacity-80">{fullSyncResult.details.join(" • ")}</p>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {/* Studio Navigation Tabs */}
            <Tabs value={subTab} onValueChange={setSubTab} className="space-y-6">
                <TabsList className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 w-full h-auto p-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl gap-1.5 shadow-xl backdrop-blur-md">
                    <TabsTrigger value="collections" className="py-2.5 px-2 flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl transition-all duration-200 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-slate-800/80 whitespace-nowrap">
                        <Trophy className="h-4 w-4 text-amber-400 shrink-0" />
                        <span>Collections</span>
                    </TabsTrigger>
                    <TabsTrigger value="overlays" className="py-2.5 px-2 flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl transition-all duration-200 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-slate-800/80 whitespace-nowrap">
                        <Layers className="h-4 w-4 text-sky-400 shrink-0" />
                        <span>Overlays & Badges</span>
                    </TabsTrigger>
                    <TabsTrigger value="inspector" className="py-2.5 px-2 flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl transition-all duration-200 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-slate-800/80 whitespace-nowrap">
                        <Search className="h-4 w-4 text-cyan-400 shrink-0" />
                        <span>Media Inspector</span>
                    </TabsTrigger>
                    <TabsTrigger value="releases" className="py-2.5 px-2 flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl transition-all duration-200 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-slate-800/80 whitespace-nowrap">
                        <Calendar className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>Digital Releases</span>
                    </TabsTrigger>
                    <TabsTrigger value="pruning" className="py-2.5 px-2 flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl transition-all duration-200 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-slate-800/80 whitespace-nowrap">
                        <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
                        <span>Leaving Soon</span>
                    </TabsTrigger>
                    <TabsTrigger value="preferences" className="py-2.5 px-2 flex items-center justify-center gap-1.5 text-xs font-bold rounded-xl transition-all duration-200 data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-md hover:bg-slate-800/80 whitespace-nowrap">
                        <Filter className="h-4 w-4 text-indigo-400 shrink-0" />
                        <span>Content Filters</span>
                    </TabsTrigger>
                </TabsList>

                {/* ========================================================================= */}
                {/* TAB 1: CURATED COLLECTIONS & HOME SCREEN HUB ORDERING */}
                {/* ========================================================================= */}
                <TabsContent value="collections" className="space-y-6">
                    {/* Plex Home Screen Hub Order & Priority Manager */}
                    <Card className="bg-slate-900/80 border-slate-800 shadow-xl overflow-hidden">
                        <CardHeader className="p-5 pb-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-amber-500/20 text-amber-400 rounded-xl border border-amber-500/30">
                                            <Home className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                                Plex Home Screen Hub Ordering & Seasonal Scheduling
                                            </CardTitle>
                                            <CardDescription className="text-xs text-slate-400">
                                                Order collections exactly as they appear on your Plex Home Screen and configure automated seasonal date schedules.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2">
                                    <Button 
                                        size="sm"
                                        onClick={handleSyncSeasonalSchedules}
                                        disabled={syncingSeasonal}
                                        variant="outline"
                                        className="border-amber-500/40 text-amber-300 hover:bg-amber-950/40 text-xs h-8 px-3 gap-1.5"
                                    >
                                        {syncingSeasonal ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
                                        <span>Evaluate Seasonal Schedules</span>
                                    </Button>

                                    <Button 
                                        size="sm"
                                        onClick={handleSaveCollectionsOrder}
                                        disabled={savingOrder || collections.length === 0}
                                        className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-amber-950/40"
                                    >
                                        {savingOrder ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                        <span>Save & Apply Order to Plex</span>
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-4 space-y-4">
                            {orderSavedMsg && (
                                <div className="p-2.5 bg-emerald-950/70 border border-emerald-800 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{orderSavedMsg}</span>
                                </div>
                            )}

                            {seasonalSyncMsg && (
                                <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${seasonalSyncMsg.success ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300' : 'bg-rose-950/70 border border-rose-800 text-rose-300'}`}>
                                    {seasonalSyncMsg.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                    <span>{seasonalSyncMsg.text}</span>
                                </div>
                            )}

                            {/* Multi-Server Collections Target Routing */}
                            {servers.length > 1 && (
                                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5 font-bold text-amber-300">
                                            <Server className="h-3.5 w-3.5" />
                                            <span>Automated Collections Server Targets</span>
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                            Select which Plex servers receive automated collection syncing & home screen ordering during scheduled runs:
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {servers.map(srv => {
                                            const isEnabled = (settings.enabledServersForCollections ?? servers.map(s => s.serverId)).includes(srv.serverId);
                                            return (
                                                <button
                                                    key={srv.serverId}
                                                    type="button"
                                                    onClick={() => handleToggleServerTarget(srv.serverId, "collections", !isEnabled)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                                        isEnabled 
                                                            ? 'bg-amber-950/50 border-amber-500/50 text-amber-200 shadow-sm'
                                                            : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                                    }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-amber-400 shadow-sm shadow-amber-400/50' : 'bg-slate-600'}`} />
                                                    <span>{srv.serverName}</span>
                                                    <span className="text-[10px] opacity-75 font-normal">
                                                        {isEnabled ? '✓ Sync Active' : '✕ Skipped'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {collections.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 text-xs">
                                    No active collections found. Sync presets below or create a custom collection to arrange on your Plex Home screen.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] font-bold text-slate-400 px-3 py-1.5 uppercase tracking-wider border-b border-slate-800">
                                        <div className="col-span-1">Priority</div>
                                        <div className="col-span-4">Collection Title</div>
                                        <div className="col-span-2">Schedule / Season</div>
                                        <div className="col-span-3 text-center">Home Screen Hub Visibility</div>
                                        <div className="col-span-2 text-right">Actions</div>
                                    </div>

                                    {collections.map((coll, idx) => {
                                        const inSeason = isCurrentlyInSeason(coll);

                                        return (
                                            <div 
                                                key={coll.id} 
                                                className="grid grid-cols-1 sm:grid-cols-12 gap-3 sm:gap-2 items-center p-3 bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 rounded-xl transition-colors text-xs"
                                            >
                                                {/* Priority Reorder Controls */}
                                                <div className="sm:col-span-1 flex items-center gap-1.5">
                                                    <Badge className="bg-purple-900/60 text-purple-300 border-purple-700 font-mono font-bold text-[11px] px-2 py-0.5">
                                                        #{idx}
                                                    </Badge>
                                                    <div className="flex flex-col">
                                                        <button 
                                                            disabled={idx === 0} 
                                                            onClick={() => handleMoveCollection(idx, "up")}
                                                            className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                                                        >
                                                            <ChevronUp className="h-3.5 w-3.5" />
                                                        </button>
                                                        <button 
                                                            disabled={idx === collections.length - 1} 
                                                            onClick={() => handleMoveCollection(idx, "down")}
                                                            className="p-0.5 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
                                                        >
                                                            <ChevronDown className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Title & Category */}
                                                <div className="sm:col-span-4 space-y-0.5">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-white text-sm">{coll.title}</span>
                                                        <Badge variant="outline" className="text-[9px] uppercase px-1.5 py-0 border-slate-700 text-slate-300">
                                                            {coll.category}
                                                        </Badge>
                                                        {getSourceBadge(coll.sourceType, coll.title, coll.sourceQuery)}
                                                    </div>
                                                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                                                        <span>{coll.itemCount || 0} items</span>
                                                        <span>•</span>
                                                        <span className="font-mono text-purple-400 text-[10px]">Prefix: {coll.sortPrefix || `!${String(idx).padStart(2, '0')}_`}</span>
                                                    </div>
                                                </div>

                                                {/* Seasonal Schedule Pill */}
                                                <div className="sm:col-span-2">
                                                    {coll.isSeasonal ? (
                                                        <div 
                                                            onClick={() => {
                                                                setEditingColl(coll);
                                                                setSeasonalModalOpen(true);
                                                            }}
                                                            className="cursor-pointer group flex flex-col gap-0.5 p-1.5 bg-slate-900/80 rounded-lg border border-slate-800 hover:border-amber-500/50 transition-all"
                                                        >
                                                            <div className="flex items-center gap-1 text-[10px] font-bold">
                                                                {inSeason ? (
                                                                    <span className="text-emerald-400 flex items-center gap-1">
                                                                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Active Now
                                                                    </span>
                                                                ) : (
                                                                    <span className="text-amber-400/80 flex items-center gap-1">
                                                                        <Clock3 className="h-3 w-3" /> Scheduled
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <span className="text-[10px] text-slate-400 group-hover:text-slate-200">
                                                                {coll.scheduleStartMonth}/{coll.scheduleStartDay} – {coll.scheduleEndMonth}/{coll.scheduleEndDay}
                                                            </span>
                                                        </div>
                                                    ) : (
                                                        <button 
                                                            onClick={() => {
                                                                setEditingColl({
                                                                    ...coll,
                                                                    isSeasonal: true,
                                                                    scheduleStartMonth: 10,
                                                                    scheduleStartDay: 1,
                                                                    scheduleEndMonth: 11,
                                                                    scheduleEndDay: 5,
                                                                    seasonalAction: "promote_hide"
                                                                });
                                                                setSeasonalModalOpen(true);
                                                            }}
                                                            className="text-[10px] text-slate-400 hover:text-amber-300 flex items-center gap-1 py-1 px-2 bg-slate-900/60 rounded border border-slate-800"
                                                        >
                                                            <CalendarClock className="h-3 w-3" /> Add Schedule
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Visibility Switches: Home, Rec, Shared */}
                                                <div className="sm:col-span-3 flex items-center justify-center gap-3 bg-slate-900/70 p-1.5 rounded-xl border border-slate-800/80">
                                                    <label className="flex items-center gap-1 cursor-pointer" title="Promote to Home Screen">
                                                        <input 
                                                            type="checkbox"
                                                            checked={coll.promotedToHome ?? true}
                                                            onChange={e => {
                                                                const updated = [...collections];
                                                                updated[idx].promotedToHome = e.target.checked;
                                                                setCollections(updated);
                                                            }}
                                                            className="rounded border-slate-700 text-purple-600 focus:ring-0 h-3.5 w-3.5"
                                                        />
                                                        <span className="text-[10px] font-semibold text-slate-300">Home</span>
                                                    </label>

                                                    <label className="flex items-center gap-1 cursor-pointer" title="Promote to Library Recommended">
                                                        <input 
                                                            type="checkbox"
                                                            checked={coll.promotedToRecommended ?? true}
                                                            onChange={e => {
                                                                const updated = [...collections];
                                                                updated[idx].promotedToRecommended = e.target.checked;
                                                                setCollections(updated);
                                                            }}
                                                            className="rounded border-slate-700 text-purple-600 focus:ring-0 h-3.5 w-3.5"
                                                        />
                                                        <span className="text-[10px] font-semibold text-slate-300">Rec</span>
                                                    </label>

                                                    <label className="flex items-center gap-1 cursor-pointer" title="Promote to Shared Users Home">
                                                        <input 
                                                            type="checkbox"
                                                            checked={coll.promotedToSharedHome ?? true}
                                                            onChange={e => {
                                                                const updated = [...collections];
                                                                updated[idx].promotedToSharedHome = e.target.checked;
                                                                setCollections(updated);
                                                            }}
                                                            className="rounded border-slate-700 text-purple-600 focus:ring-0 h-3.5 w-3.5"
                                                        />
                                                        <span className="text-[10px] font-semibold text-slate-300">Shared</span>
                                                    </label>
                                                </div>

                                                {/* Action Buttons */}
                                                <div className="sm:col-span-2 flex items-center justify-end gap-1.5">
                                                    <Button 
                                                        size="sm" 
                                                        variant="outline"
                                                        onClick={() => {
                                                            setEditingColl(coll);
                                                            setSeasonalModalOpen(true);
                                                        }}
                                                        className="h-7 px-2 text-[10px] border-slate-700 text-slate-300 hover:text-white"
                                                    >
                                                        <Settings2 className="h-3.5 w-3.5" />
                                                    </Button>

                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost"
                                                        onClick={async () => {
                                                            if (!confirm(`Delete collection "${coll.title}"?`)) return;
                                                            await deleteMediaCollectionAction(coll.id);
                                                            await loadData();
                                                        }}
                                                        className="h-7 px-2 text-[10px] text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
                                                    >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Presets Catalog & Create Custom Collection Header */}
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
                                                        <SelectItem value="tmdb">🎬 TMDb (Franchise / Studio / Network)</SelectItem>
                                                        <SelectItem value="trakt">🔥 Trakt (Trending / Popular Lists)</SelectItem>
                                                        <SelectItem value="mdblist">⭐ IMDb Top 250 & Curated Charts</SelectItem>
                                                        <SelectItem value="plex_query">⚡ Plex Smart Query (HDR / Audio / Year)</SelectItem>
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

                                        {/* Seasonal Switch on Creation */}
                                        <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 space-y-2">
                                            <div className="flex items-center justify-between">
                                                <Label className="font-semibold text-white flex items-center gap-1.5">
                                                    <CalendarClock className="h-4 w-4 text-amber-400" /> Seasonal Schedule
                                                </Label>
                                                <Switch 
                                                    checked={newCollIsSeasonal}
                                                    onCheckedChange={setNewCollIsSeasonal}
                                                />
                                            </div>
                                            {newCollIsSeasonal && (
                                                <div className="grid grid-cols-2 gap-2 pt-1">
                                                    <div className="space-y-1">
                                                        <span className="text-[10px] text-slate-400">Start Date (MM / DD)</span>
                                                        <div className="flex items-center gap-1">
                                                            <Input 
                                                                type="number" min={1} max={12} 
                                                                value={newCollStartMonth} 
                                                                onChange={e => setNewCollStartMonth(parseInt(e.target.value, 10) || 1)}
                                                                className="bg-slate-800 border-slate-700 text-xs h-7" 
                                                            />
                                                            <Input 
                                                                type="number" min={1} max={31} 
                                                                value={newCollStartDay} 
                                                                onChange={e => setNewCollStartDay(parseInt(e.target.value, 10) || 1)}
                                                                className="bg-slate-800 border-slate-700 text-xs h-7" 
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <span className="text-[10px] text-slate-400">End Date (MM / DD)</span>
                                                        <div className="flex items-center gap-1">
                                                            <Input 
                                                                type="number" min={1} max={12} 
                                                                value={newCollEndMonth} 
                                                                onChange={e => setNewCollEndMonth(parseInt(e.target.value, 10) || 12)}
                                                                className="bg-slate-800 border-slate-700 text-xs h-7" 
                                                            />
                                                            <Input 
                                                                type="number" min={1} max={31} 
                                                                value={newCollEndDay} 
                                                                onChange={e => setNewCollEndDay(parseInt(e.target.value, 10) || 31)}
                                                                className="bg-slate-800 border-slate-700 text-xs h-7" 
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
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
                                            <div className="flex items-center gap-1">
                                                {preset.isSeasonal && (
                                                    <Badge className="text-[9px] font-semibold bg-amber-950/60 text-amber-300 border border-amber-800">
                                                        🗓️ Seasonal
                                                    </Badge>
                                                )}
                                                {getSourceBadge(preset.sourceType, preset.title, preset.sourceQuery)}
                                            </div>
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

                                        <div className="grid grid-cols-2 gap-2 w-full">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleInspectPreset(preset)}
                                                className="w-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700 text-xs font-semibold gap-1.5 h-8"
                                            >
                                                <Search className="h-3.5 w-3.5 text-cyan-400" />
                                                <span>Blueprint</span>
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleOpenEditPreset(preset)}
                                                className="w-full bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border-slate-700 text-xs font-semibold gap-1.5 h-8"
                                            >
                                                <Edit2 className="h-3.5 w-3.5 text-amber-400" />
                                                <span>Customize</span>
                                            </Button>
                                        </div>

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
                {/* TAB 2: POSTER OVERLAYS & CUSTOM BADGE UPLOAD STUDIO */}
                {/* ========================================================================= */}
                <TabsContent value="overlays" className="space-y-6">
                    {/* Overlay Engine Priority & Resolution Hierarchy Banner */}
                    <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-950/40 via-slate-900/90 to-slate-900/70 border border-purple-500/30 shadow-xl space-y-3">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div className="flex items-center gap-2.5">
                                <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                                    <Layers className="h-5 w-5" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                        Overlay Engine Priority & Multi-Layer Hierarchy
                                        <Badge className="bg-purple-500/20 text-purple-300 border-purple-500/30 text-[10px]">Active Engine</Badge>
                                    </h3>
                                    <p className="text-xs text-slate-400">
                                        How Portalarr automatically scans media, prioritizes custom uploads, and composites badges onto Plex posters.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                            {/* Step 1: Scan & Detect */}
                            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1.5">
                                <div className="flex items-center gap-2 text-xs font-bold text-sky-400">
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-sky-500/20 text-[11px] font-mono">1</span>
                                    <span>Stream Telemetry Scan</span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    Plex files are scanned for exact video resolution (4K/1080p), HDR (Dolby Vision/HDR10+), Audio (Atmos/TrueHD/DTS), Codec, Studio, and Edition.
                                </p>
                            </div>

                            {/* Step 2: Priority 1 Custom Badges */}
                            <div className="p-3 rounded-xl bg-slate-950/70 border border-purple-800/40 space-y-1.5">
                                <div className="flex items-center gap-2 text-xs font-bold text-purple-400">
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-500/20 text-[11px] font-mono">2</span>
                                    <span>Priority 1: Custom Badges (Override)</span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    Active custom image badges (from GitHub or uploads) matching the stream <strong className="text-purple-300">take top priority</strong> and directly suppress the default SVG for that layer.
                                </p>
                            </div>

                            {/* Step 3: Priority 2 Built-in SVGs */}
                            <div className="p-3 rounded-xl bg-slate-950/70 border border-amber-800/40 space-y-1.5">
                                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-amber-500/20 text-[11px] font-mono">3</span>
                                    <span>Priority 2: Built-in Kometa SVGs</span>
                                </div>
                                <p className="text-[11px] text-slate-400 leading-relaxed">
                                    If no custom badge matches a detected layer, high-gloss Obsidian Glass or Amber Gold metallic SVGs render dynamically in your configured corner.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Multi-Server Automated Overlay Target Routing & Protection */}
                    {servers.length > 1 && (
                        <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-0.5">
                                <div className="flex items-center gap-1.5 font-bold text-purple-300">
                                    <Server className="h-3.5 w-3.5" />
                                    <span>Automated Overlay Server Targets & Protection</span>
                                </div>
                                <p className="text-[11px] text-slate-400">
                                    Toggle which servers receive automated poster overlays during scheduled syncs. Unchecked servers are protected and remain vanilla:
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {servers.map(srv => {
                                    const isEnabled = (settings.enabledServersForOverlays ?? servers.map(s => s.serverId)).includes(srv.serverId);
                                    return (
                                        <button
                                            key={srv.serverId}
                                            type="button"
                                            onClick={() => handleToggleServerTarget(srv.serverId, "overlays", !isEnabled)}
                                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                                isEnabled 
                                                    ? 'bg-purple-950/60 border-purple-500/50 text-purple-200 shadow-sm'
                                                    : 'bg-slate-950/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-purple-400 shadow-sm shadow-purple-400/50' : 'bg-slate-600'}`} />
                                            <span>{srv.serverName}</span>
                                            <span className="text-[10px] opacity-75 font-normal">
                                                {isEnabled ? '✓ Overlays Enabled' : '🛡️ Vanilla Protected'}
                                            </span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Interactive Poster Preview Simulator */}
                        <div className="lg:col-span-5 flex flex-col items-center justify-center p-6 bg-slate-900/70 border border-slate-800 rounded-2xl shadow-xl space-y-4">
                            <div className="text-center space-y-1">
                                <h3 className="text-sm font-bold text-white flex items-center justify-center gap-1.5">
                                    <Eye className="h-4 w-4 text-purple-400" /> Live Multi-Badge Poster Simulator
                                </h3>
                                <p className="text-[11px] text-slate-400">
                                    Real-time preview of built-in quality badges and custom uploads.
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
                                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-red-700 via-red-600 to-red-700 py-1 px-2 text-center text-[10px] font-black tracking-widest text-white shadow-lg border-b border-red-400 flex items-center justify-center gap-1 z-20">
                                        <AlertTriangle className="h-3 w-3" /> LEAVING SOON • 5 DAYS
                                    </div>
                                )}

                                {/* Corner Ribbon Overlay Simulation */}
                                {simShowRibbon && (
                                    <div className={`absolute pointer-events-none z-20 ${
                                        simRibbonPosition === 'top-right' ? 'top-0 right-0' :
                                        simRibbonPosition === 'top-left' ? 'top-0 left-0' :
                                        simRibbonPosition === 'bottom-right' ? 'bottom-0 right-0' :
                                        'bottom-0 left-0'
                                    }`}>
                                        <svg width="105" height="105" viewBox="0 0 105 105" className="overflow-visible">
                                            <defs>
                                                <linearGradient id={`sim-ribbon-grad-${simRibbonTheme}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                                    {simRibbonTheme === 'crimson' && <><stop offset="0%" stopColor="#ef4444"/><stop offset="100%" stopColor="#991b1b"/></>}
                                                    {simRibbonTheme === 'emerald' && <><stop offset="0%" stopColor="#10b981"/><stop offset="100%" stopColor="#065f46"/></>}
                                                    {simRibbonTheme === 'purple' && <><stop offset="0%" stopColor="#a855f7"/><stop offset="100%" stopColor="#6b21a8"/></>}
                                                    {simRibbonTheme === 'gold' && <><stop offset="0%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#b45309"/></>}
                                                    {simRibbonTheme === 'cyan' && <><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#0e7490"/></>}
                                                    {simRibbonTheme === 'pink' && <><stop offset="0%" stopColor="#ec4899"/><stop offset="100%" stopColor="#9d174d"/></>}
                                                    {simRibbonTheme === 'glass' && <><stop offset="0%" stopColor="#334155"/><stop offset="100%" stopColor="#0f172a"/></>}
                                                    {simRibbonTheme === 'orange' && <><stop offset="0%" stopColor="#f97316"/><stop offset="100%" stopColor="#c2410c"/></>}
                                                </linearGradient>
                                                <filter id="sim-ribbon-shadow" x="-20%" y="-20%" width="140%" height="140%">
                                                    <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.8"/>
                                                </filter>
                                             </defs>
                                            <g filter="url(#sim-ribbon-shadow)">
                                                {simRibbonPosition === 'top-right' && (
                                                    <g transform="translate(52.5, 52.5) rotate(45) translate(-52.5, -52.5)">
                                                        <rect x="-30" y="40" width="165" height="25" fill={`url(#sim-ribbon-grad-${simRibbonTheme})`} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                                                        <text x="52.5" y="56" fill="#ffffff" fontSize="8.5" fontWeight="900" textAnchor="middle" letterSpacing="0.8" fontFamily="sans-serif">
                                                            {getEffectiveRibbonText()}
                                                        </text>
                                                    </g>
                                                )}
                                                {simRibbonPosition === 'top-left' && (
                                                    <g transform="translate(52.5, 52.5) rotate(-45) translate(-52.5, -52.5)">
                                                        <rect x="-30" y="40" width="165" height="25" fill={`url(#sim-ribbon-grad-${simRibbonTheme})`} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                                                        <text x="52.5" y="56" fill="#ffffff" fontSize="8.5" fontWeight="900" textAnchor="middle" letterSpacing="0.8" fontFamily="sans-serif">
                                                            {getEffectiveRibbonText()}
                                                        </text>
                                                    </g>
                                                )}
                                                {simRibbonPosition === 'bottom-right' && (
                                                    <g transform="translate(52.5, 52.5) rotate(-45) translate(-52.5, -52.5)">
                                                        <rect x="-30" y="40" width="165" height="25" fill={`url(#sim-ribbon-grad-${simRibbonTheme})`} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                                                        <text x="52.5" y="56" fill="#ffffff" fontSize="8.5" fontWeight="900" textAnchor="middle" letterSpacing="0.8" fontFamily="sans-serif">
                                                            {getEffectiveRibbonText()}
                                                        </text>
                                                    </g>
                                                )}
                                                {simRibbonPosition === 'bottom-left' && (
                                                    <g transform="translate(52.5, 52.5) rotate(45) translate(-52.5, -52.5)">
                                                        <rect x="-30" y="40" width="165" height="25" fill={`url(#sim-ribbon-grad-${simRibbonTheme})`} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                                                        <text x="52.5" y="56" fill="#ffffff" fontSize="8.5" fontWeight="900" textAnchor="middle" letterSpacing="0.8" fontFamily="sans-serif">
                                                            {getEffectiveRibbonText()}
                                                        </text>
                                                    </g>
                                                )}
                                            </g>
                                        </svg>
                                    </div>
                                )}

                                {/* Top-Left Bucket */}
                                {renderBadgesForPosition("top-left").length > 0 && (
                                    <div 
                                        className={`absolute ${simLeavingSoon ? 'top-8' : 'top-2.5'} left-2.5 flex flex-col gap-1.5 items-start z-10`}
                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'top left' }}
                                    >
                                        {renderBadgesForPosition("top-left")}
                                    </div>
                                )}

                                {/* Top-Right Bucket */}
                                {renderBadgesForPosition("top-right").length > 0 && (
                                    <div 
                                        className={`absolute ${simLeavingSoon ? 'top-8' : 'top-2.5'} right-2.5 flex flex-col gap-1.5 items-end z-10`}
                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'top right' }}
                                    >
                                        {renderBadgesForPosition("top-right")}
                                    </div>
                                )}

                                {/* Top-Center Bucket */}
                                {renderBadgesForPosition("top-center").length > 0 && (
                                    <div 
                                        className={`absolute ${simLeavingSoon ? 'top-8' : 'top-2.5'} left-1/2 -translate-x-1/2 flex flex-row flex-wrap gap-1.5 justify-center items-center z-10 max-w-[85%]`}
                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'top center' }}
                                    >
                                        {renderBadgesForPosition("top-center")}
                                    </div>
                                )}

                                {/* Bottom-Left Bucket */}
                                {renderBadgesForPosition("bottom-left").length > 0 && (
                                    <div 
                                        className="absolute bottom-2.5 left-2.5 flex flex-col gap-1.5 items-start z-10"
                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'bottom left' }}
                                    >
                                        {renderBadgesForPosition("bottom-left")}
                                    </div>
                                )}

                                {/* Bottom-Right Bucket */}
                                {renderBadgesForPosition("bottom-right").length > 0 && (
                                    <div 
                                        className="absolute bottom-2.5 right-2.5 flex flex-col gap-1.5 items-end z-10"
                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'bottom right' }}
                                    >
                                        {renderBadgesForPosition("bottom-right")}
                                    </div>
                                )}

                                {/* Bottom-Center Bucket */}
                                {renderBadgesForPosition("bottom-center").length > 0 && (
                                    <div 
                                        className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex flex-row flex-wrap gap-1.5 justify-center items-center z-10 max-w-[85%]"
                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'bottom center' }}
                                    >
                                        {renderBadgesForPosition("bottom-center")}
                                    </div>
                                )}
                            </div>

                            {/* Backup Vault Status Pill */}
                            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-800/80 px-3 py-1.5 rounded-full border border-slate-700">
                                <Shield className="h-3.5 w-3.5 text-emerald-400" />
                                <span>Pristine Original Backups: <strong className="text-white">{backupsCount}</strong> in vault</span>
                            </div>

                            {/* Applied Overlays & Priority Breakdown Card */}
                            <div className="w-full p-3 bg-slate-950/90 border border-slate-800 rounded-xl space-y-2 text-xs">
                                <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
                                    <span className="font-bold text-white text-[11px] flex items-center gap-1.5">
                                        <Layers className="h-3.5 w-3.5 text-purple-400" /> Applied Overlays Breakdown
                                    </span>
                                    <span className="text-[10px] text-slate-400">{getSimulatedLayersBreakdown().length} Active</span>
                                </div>

                                {getSimulatedLayersBreakdown().length === 0 ? (
                                    <p className="text-[11px] text-slate-500 py-1 text-center">No overlay layers enabled.</p>
                                ) : (
                                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                                        {getSimulatedLayersBreakdown().map((ly, idx) => (
                                            <div key={idx} className="flex items-center justify-between p-1.5 rounded-lg bg-slate-900/80 border border-slate-800/80 text-[10px]">
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="font-semibold text-white">{ly.category}:</span>
                                                        <span className="text-slate-300 font-bold">{ly.value}</span>
                                                    </div>
                                                    <p className="text-[9px] text-slate-400">Position: <strong className="text-slate-300">{ly.position}</strong></p>
                                                </div>
                                                <Badge className={`text-[9px] px-1.5 py-0 gap-1 ${
                                                    ly.sourceType === "custom" 
                                                        ? "bg-purple-950 text-purple-300 border-purple-500/40" 
                                                        : "bg-slate-800 text-slate-300 border-slate-700"
                                                }`}>
                                                    {ly.sourceType === "custom" && <Zap className="h-2.5 w-2.5 text-amber-400" />}
                                                    <span>{ly.sourceType === "custom" ? "⚡ Priority 1 (Custom)" : "✓ Priority 2 (SVG)"}</span>
                                                </Badge>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Controls & Batch Execution */}
                        <div className="lg:col-span-7 space-y-4">
                            <Card className="bg-slate-900/60 border-slate-800">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                        <Sliders className="h-4 w-4 text-purple-400" /> Comprehensive Poster Badge Layers
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Select and customize format, audio channels, video codecs, edition cuts, and studio badges.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 space-y-3.5 text-xs">
                                    {/* Global Style Theme & Badge Scale Bar */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        {/* Style Theme Selector */}
                                        <div className="flex flex-col justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                                            <div className="space-y-0.5">
                                                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                                                    <Palette className="h-3.5 w-3.5 text-purple-400" /> Style Theme
                                                </span>
                                                <p className="text-[11px] text-slate-400">Backdrop style, specular highlights, and border luminance</p>
                                            </div>
                                            <Select value={simTheme} onValueChange={(val: any) => setSimTheme(val)}>
                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7.5 w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="glass">✨ Obsidian Glass (Kometa)</SelectItem>
                                                    <SelectItem value="gold">💛 Amber Gold Metallic</SelectItem>
                                                    <SelectItem value="classic">🛡️ Classic Solid Dark</SelectItem>
                                                    <SelectItem value="minimal">🔲 Minimalist Framed</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Badge Scale / Resizing Slider */}
                                        <div className="flex flex-col justify-between gap-2 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                                            <div className="flex items-center justify-between">
                                                <div className="space-y-0.5">
                                                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                                                        <Maximize2 className="h-3.5 w-3.5 text-cyan-400" /> Badge Size / Scale
                                                    </span>
                                                    <p className="text-[11px] text-slate-400">Resize all poster badges uniformly</p>
                                                </div>
                                                <Badge variant="outline" className="text-[11px] font-mono font-bold bg-slate-900 border-slate-700 text-cyan-300 px-2 py-0.5">
                                                    {Math.round(simBadgeScale * 100)}%
                                                </Badge>
                                            </div>
                                            <div className="space-y-2">
                                                <input 
                                                    type="range" 
                                                    min="0.70" 
                                                    max="1.40" 
                                                    step="0.05"
                                                    value={simBadgeScale}
                                                    onChange={(e) => setSimBadgeScale(parseFloat(e.target.value))}
                                                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                />
                                                <div className="flex items-center justify-between gap-1">
                                                    {[
                                                        { label: "80%", val: 0.8 },
                                                        { label: "100%", val: 1.0 },
                                                        { label: "115%", val: 1.15 },
                                                        { label: "130%", val: 1.3 }
                                                    ].map((p) => (
                                                        <button
                                                            key={p.label}
                                                            type="button"
                                                            onClick={() => setSimBadgeScale(p.val)}
                                                            className={`text-[10px] px-2 py-0.5 rounded transition-colors font-semibold ${
                                                                Math.abs(simBadgeScale - p.val) < 0.02
                                                                    ? "bg-purple-600 text-white shadow-sm"
                                                                    : "bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700"
                                                            }`}
                                                        >
                                                            {p.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Badge Layers & Independent Positions Matrix */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between px-1 text-[11px] text-slate-400 font-medium">
                                            <span>Layer & Priority</span>
                                            <span className="hidden sm:inline">Active</span>
                                            <span>Poster Position</span>
                                        </div>

                                        {/* Resolution / 4K UHD */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-amber-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">Resolution (4K UHD / 1080p FHD)</span>
                                                </div>
                                                {(() => {
                                                    const matches = getMatchingActiveCustomBadgesForCategory("resolution");
                                                    if (matches.length > 0) {
                                                        return (
                                                            <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[9px] px-1.5 py-0 gap-1" title={matches.map(m => m.name).join(", ")}>
                                                                <Zap className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>⚡ Priority 1 ({matches.length})</span>
                                                            </Badge>
                                                        );
                                                    }
                                                    return (
                                                        <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                            ✓ Priority 2 SVG
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simShowResolution}
                                                    onCheckedChange={setSimShowResolution}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simResolutionPosition} onValueChange={(val: any) => setSimResolutionPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* HDR / Dolby Vision */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-purple-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">Dynamic Range (DV / HDR10+)</span>
                                                </div>
                                                {(() => {
                                                    const matches = getMatchingActiveCustomBadgesForCategory("hdr");
                                                    if (matches.length > 0) {
                                                        return (
                                                            <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[9px] px-1.5 py-0 gap-1" title={matches.map(m => m.name).join(", ")}>
                                                                <Zap className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>⚡ Priority 1 ({matches.length})</span>
                                                            </Badge>
                                                        );
                                                    }
                                                    return (
                                                        <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                            ✓ Priority 2 SVG
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simShowHdr}
                                                    onCheckedChange={setSimShowHdr}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simHdrPosition} onValueChange={(val: any) => setSimHdrPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Video Codec */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-indigo-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">Video Codec (HEVC / AV1 / AVC)</span>
                                                </div>
                                                {(() => {
                                                    const matches = getMatchingActiveCustomBadgesForCategory("codec");
                                                    if (matches.length > 0) {
                                                        return (
                                                            <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[9px] px-1.5 py-0 gap-1" title={matches.map(m => m.name).join(", ")}>
                                                                <Zap className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>⚡ Priority 1 ({matches.length})</span>
                                                            </Badge>
                                                        );
                                                    }
                                                    return (
                                                        <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                            ✓ Priority 2 SVG
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simShowCodec}
                                                    onCheckedChange={setSimShowCodec}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simCodecPosition} onValueChange={(val: any) => setSimCodecPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Audio Codec */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-sky-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">Audio Format (Dolby Atmos / TrueHD / DTS)</span>
                                                </div>
                                                {(() => {
                                                    const matches = getMatchingActiveCustomBadgesForCategory("audio");
                                                    if (matches.length > 0) {
                                                        return (
                                                            <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[9px] px-1.5 py-0 gap-1" title={matches.map(m => m.name).join(", ")}>
                                                                <Zap className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>⚡ Priority 1 ({matches.length})</span>
                                                            </Badge>
                                                        );
                                                    }
                                                    return (
                                                        <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                            ✓ Priority 2 SVG
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simShowAudio}
                                                    onCheckedChange={setSimShowAudio}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simAudioPosition} onValueChange={(val: any) => setSimAudioPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Audio Channels */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">Audio Channels (7.1 / 5.1 Surround)</span>
                                                </div>
                                                {(() => {
                                                    const matches = getMatchingActiveCustomBadgesForCategory("channels");
                                                    if (matches.length > 0) {
                                                        return (
                                                            <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[9px] px-1.5 py-0 gap-1" title={matches.map(m => m.name).join(", ")}>
                                                                <Zap className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>⚡ Priority 1 ({matches.length})</span>
                                                            </Badge>
                                                        );
                                                    }
                                                    return (
                                                        <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                            ✓ Priority 2 SVG
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simShowChannels}
                                                    onCheckedChange={setSimShowChannels}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simChannelsPosition} onValueChange={(val: any) => setSimChannelsPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Edition / Cut */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">Edition / Cut (IMAX / Remux / Criterion)</span>
                                                </div>
                                                {(() => {
                                                    const matches = getMatchingActiveCustomBadgesForCategory("edition");
                                                    if (matches.length > 0) {
                                                        return (
                                                            <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[9px] px-1.5 py-0 gap-1" title={matches.map(m => m.name).join(", ")}>
                                                                <Zap className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>⚡ Priority 1 ({matches.length})</span>
                                                            </Badge>
                                                        );
                                                    }
                                                    return (
                                                        <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                            ✓ Priority 2 SVG
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simShowEdition}
                                                    onCheckedChange={setSimShowEdition}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simEditionPosition} onValueChange={(val: any) => setSimEditionPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Studio / Network */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-pink-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">Studio / Network (HBO / Netflix / Disney+)</span>
                                                </div>
                                                {(() => {
                                                    const matches = getMatchingActiveCustomBadgesForCategory("studio");
                                                    if (matches.length > 0) {
                                                        return (
                                                            <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[9px] px-1.5 py-0 gap-1" title={matches.map(m => m.name).join(", ")}>
                                                                <Zap className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>⚡ Priority 1 ({matches.length})</span>
                                                            </Badge>
                                                        );
                                                    }
                                                    return (
                                                        <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                            ✓ Priority 2 SVG
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simShowStudio}
                                                    onCheckedChange={setSimShowStudio}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simStudioPosition} onValueChange={(val: any) => setSimStudioPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Content Rating */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">Age Rating (PG-13 / R / TV-MA)</span>
                                                </div>
                                                {(() => {
                                                    const matches = getMatchingActiveCustomBadgesForCategory("ratings");
                                                    if (matches.length > 0) {
                                                        return (
                                                            <Badge className="bg-purple-950 text-purple-300 border-purple-500/40 text-[9px] px-1.5 py-0 gap-1" title={matches.map(m => m.name).join(", ")}>
                                                                <Zap className="h-2.5 w-2.5 text-amber-400" />
                                                                <span>⚡ Priority 1 ({matches.length})</span>
                                                            </Badge>
                                                        );
                                                    }
                                                    return (
                                                        <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                            ✓ Priority 2 SVG
                                                        </Badge>
                                                    );
                                                })()}
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simShowRating}
                                                    onCheckedChange={setSimShowRating}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simRatingPosition} onValueChange={(val: any) => setSimRatingPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Community Ratings Bar */}
                                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 items-center">
                                            <div className="sm:col-span-7 flex items-center justify-between sm:justify-start gap-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                                                    <span className="font-semibold text-white text-[11px]">IMDb / RT Community Ratings</span>
                                                </div>
                                                <Badge variant="outline" className="border-slate-800 text-slate-400 text-[9px] px-1.5 py-0">
                                                    IMDb 8.6 • 🍅 94%
                                                </Badge>
                                            </div>
                                            <div className="sm:col-span-2 flex justify-start sm:justify-center">
                                                <Switch 
                                                    checked={simRatings}
                                                    onCheckedChange={setSimRatings}
                                                />
                                            </div>
                                            <div className="sm:col-span-3">
                                                <Select value={simRatingsPosition} onValueChange={(val: any) => setSimRatingsPosition(val)}>
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-7">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>

                                        {/* Leaving Soon Header Banner */}
                                        <div className="p-2.5 bg-slate-950/40 rounded-xl border border-slate-800/80 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
                                                <span className="font-semibold text-white text-[11px]">Leaving Soon Top Banner</span>
                                            </div>
                                            <Switch 
                                                checked={simLeavingSoon}
                                                onCheckedChange={setSimLeavingSoon}
                                            />
                                        </div>
                                    </div>

                                    {/* Corner Ribbon Overlays Configuration */}
                                    <div className="p-3.5 bg-gradient-to-r from-purple-950/40 via-slate-950/60 to-slate-950/70 rounded-xl border border-purple-800/40 space-y-3">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <Sparkles className="h-4 w-4 text-purple-400" />
                                                <span className="font-bold text-white text-xs">Corner Ribbon Overlays</span>
                                            </div>
                                            <Switch 
                                                checked={simShowRibbon}
                                                onCheckedChange={setSimShowRibbon}
                                            />
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                            Diagonal corner ribbons with high-gloss gradients, drop shadows, and automatic or custom text.
                                        </p>

                                        {simShowRibbon && (
                                            <div className="space-y-3 pt-1 animate-in fade-in-50 duration-200">
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                                                    <div className="space-y-1">
                                                        <Label className="text-[11px] text-slate-300">Ribbon Content</Label>
                                                        <Select value={simRibbonType} onValueChange={(val: any) => setSimRibbonType(val)}>
                                                            <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-8">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="auto_quality">Auto Quality (4K / DV)</SelectItem>
                                                                <SelectItem value="auto_edition">Auto Edition (IMAX / Cut)</SelectItem>
                                                                <SelectItem value="leaving_soon">Leaving Soon</SelectItem>
                                                                <SelectItem value="custom">Custom Text Banner</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-[11px] text-slate-300">Corner Placement</Label>
                                                        <Select value={simRibbonPosition} onValueChange={(val: any) => setSimRibbonPosition(val)}>
                                                            <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-8">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="top-right">Top-Right Corner</SelectItem>
                                                                <SelectItem value="top-left">Top-Left Corner</SelectItem>
                                                                <SelectItem value="bottom-right">Bottom-Right Corner</SelectItem>
                                                                <SelectItem value="bottom-left">Bottom-Left Corner</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label className="text-[11px] text-slate-300">Color Gradient</Label>
                                                        <Select value={simRibbonTheme} onValueChange={(val: any) => setSimRibbonTheme(val)}>
                                                            <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-8">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                <SelectItem value="purple">💜 Royal Purple</SelectItem>
                                                                <SelectItem value="emerald">💚 Emerald Green</SelectItem>
                                                                <SelectItem value="crimson">❤️ Crimson Red</SelectItem>
                                                                <SelectItem value="gold">💛 Amber Gold</SelectItem>
                                                                <SelectItem value="cyan">🩵 Electric Cyan</SelectItem>
                                                                <SelectItem value="pink">💖 Neon Pink</SelectItem>
                                                                <SelectItem value="glass">🖤 Dark Glass</SelectItem>
                                                                <SelectItem value="orange">🧡 Warning Orange</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                </div>

                                                {simRibbonType === "custom" && (
                                                    <div className="space-y-1">
                                                        <Label className="text-[11px] text-slate-300">Custom Ribbon Text</Label>
                                                        <Input 
                                                            value={simRibbonText}
                                                            onChange={e => setSimRibbonText(e.target.value)}
                                                            placeholder="e.g. EXCLUSIVE REMUX, DIRECTOR'S CUT, STAFF PICK..."
                                                            className="bg-slate-800 border-slate-700 text-xs h-8"
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        )}
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

                    {/* Custom Badges & Overlays Upload Studio Deck */}
                    <Card className="bg-slate-900/80 border-slate-800 shadow-xl overflow-hidden">
                        <CardHeader className="p-5 pb-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/30">
                                            <Palette className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                                Custom Badges & Overlays Manager
                                            </CardTitle>
                                            <CardDescription className="text-xs text-slate-400">
                                                Upload your own vector SVG or high-res PNG badges and define dynamic auto-matching rules.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    {/* GitHub Badge Hub & Downloader Modal */}
                                    <Dialog open={githubModalOpen} onOpenChange={open => {
                                        setGithubModalOpen(open);
                                        if (open && discoveredBadges.length === 0) {
                                            handleScanGitHubRepo("https://github.com/jmxd/Kometa/tree/main/overlays/images");
                                        }
                                    }}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" className="bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-purple-950/40 border border-purple-400/30">
                                                <Globe className="h-3.5 w-3.5 text-purple-200" /> GitHub Badge Hub & Presets
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-4xl max-h-[90vh] flex flex-col p-0 overflow-hidden shadow-2xl">
                                            {/* Modal Header */}
                                            <div className="p-4 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 flex items-center justify-between">
                                                <div className="flex items-center gap-2.5">
                                                    <div className="p-2 bg-purple-500/20 text-purple-400 rounded-xl border border-purple-500/30">
                                                        <Globe className="h-5 w-5" />
                                                    </div>
                                                    <div>
                                                        <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                                                            GitHub Overlay Badges Downloader & Repo Hub
                                                        </DialogTitle>
                                                        <DialogDescription className="text-xs text-slate-400">
                                                            Browse, preview, and 1-click install custom overlay badge packs directly from GitHub repositories (jmxd, Kometa Defaults, custom repos).
                                                        </DialogDescription>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
                                                {/* Quick Curated Preset Packs */}
                                                <div className="space-y-2">
                                                    <Label className="text-[11px] font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Sparkles className="h-3.5 w-3.5" /> Curated Popular Repositories & Packs
                                                    </Label>
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                                                        {presetPacks.map(pack => (
                                                            <button
                                                                key={pack.id}
                                                                type="button"
                                                                onClick={() => handleScanGitHubRepo(pack.repoUrl)}
                                                                className={`text-left p-2.5 rounded-xl border transition-all flex flex-col justify-between gap-1.5 ${
                                                                    githubRepoInput === pack.repoUrl
                                                                        ? 'bg-purple-950/60 border-purple-500 shadow-md shadow-purple-950/30 ring-1 ring-purple-400'
                                                                        : 'bg-slate-950/60 border-slate-800 hover:border-purple-500/50 hover:bg-slate-800/60'
                                                                }`}
                                                            >
                                                                <div className="flex items-center justify-between">
                                                                    <span className="text-base">{pack.icon}</span>
                                                                    <Badge variant="outline" className="text-[9px] uppercase tracking-wider font-semibold border-slate-700 text-slate-300">
                                                                        {pack.author}
                                                                    </Badge>
                                                                </div>
                                                                <div>
                                                                    <h4 className="font-bold text-white text-xs line-clamp-1">{pack.title}</h4>
                                                                    <p className="text-[10px] text-slate-400 line-clamp-2 mt-0.5">{pack.description}</p>
                                                                </div>
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {/* Custom Repository URL Input Bar */}
                                                <div className="p-3 bg-slate-950/70 rounded-xl border border-slate-800 space-y-2">
                                                    <Label className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                                                        <Search className="h-3.5 w-3.5 text-purple-400" /> GitHub Repository URL or Tree Path
                                                    </Label>
                                                    <div className="flex flex-col sm:flex-row gap-2">
                                                        <Input
                                                            value={githubRepoInput}
                                                            onChange={e => setGithubRepoInput(e.target.value)}
                                                            placeholder="https://github.com/jmxd/Kometa/tree/main/overlays or owner/repo"
                                                            className="bg-slate-900 border-slate-700 text-xs h-8 flex-1 font-mono text-[11px]"
                                                        />
                                                        <Button
                                                            disabled={scanningRepo}
                                                            onClick={() => handleScanGitHubRepo()}
                                                            className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8 px-4 gap-1.5 shrink-0"
                                                        >
                                                            {scanningRepo ? (
                                                                <>
                                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    <span>Scanning Repo...</span>
                                                                </>
                                                            ) : (
                                                                <>
                                                                    <Search className="h-3.5 w-3.5" />
                                                                    <span>Scan & Discover Badges</span>
                                                                </>
                                                            )}
                                                        </Button>
                                                    </div>
                                                </div>

                                                {/* Scan Error Alert */}
                                                {scanError && (
                                                    <div className="p-3 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-xl text-xs flex items-center gap-2">
                                                        <XCircle className="h-4 w-4 shrink-0" />
                                                        <span>{scanError}</span>
                                                    </div>
                                                )}

                                                {/* Import Success Alert */}
                                                {importSuccessMsg && (
                                                    <div className="p-3 bg-emerald-950/80 border border-emerald-800 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                        <span>{importSuccessMsg}</span>
                                                    </div>
                                                )}

                                                {/* Discovered Badges Area */}
                                                {discoveredBadges.length > 0 && (
                                                    <div className="space-y-3">
                                                        {/* Filter Bar & Controls */}
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                                                            <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="font-bold text-white text-xs">
                                                                    Discovered Badges ({getFilteredDiscoveredBadges().length} of {discoveredBadges.length}):
                                                                </span>
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={handleToggleSelectAll}
                                                                    className="h-6 text-[10px] px-2 border-slate-700 text-slate-300 hover:text-white"
                                                                >
                                                                    {getFilteredDiscoveredBadges().every(b => selectedBadgeIds.includes(b.id)) ? "Deselect All" : "Select All"}
                                                                </Button>
                                                            </div>

                                                            <div className="flex items-center gap-2">
                                                                <Input
                                                                    value={badgeSearchQuery}
                                                                    onChange={e => setBadgeSearchQuery(e.target.value)}
                                                                    placeholder="Filter badges (e.g. atmos, 4k, imax)..."
                                                                    className="bg-slate-900 border-slate-700 text-xs h-7 w-48"
                                                                />
                                                                <Select value={badgeCategoryFilter} onValueChange={setBadgeCategoryFilter}>
                                                                    <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-7 w-32">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="all">All Categories</SelectItem>
                                                                        <SelectItem value="resolution">Resolution</SelectItem>
                                                                        <SelectItem value="hdr">Dynamic Range</SelectItem>
                                                                        <SelectItem value="codec">Video Codec</SelectItem>
                                                                        <SelectItem value="audio">Audio Codec</SelectItem>
                                                                        <SelectItem value="edition">Editions & Cuts</SelectItem>
                                                                        <SelectItem value="ratings">Ratings & Scores</SelectItem>
                                                                        <SelectItem value="studio">Studios</SelectItem>
                                                                        <SelectItem value="ribbon">Ribbons</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </div>

                                                        {/* Badges Grid */}
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[380px] overflow-y-auto p-1">
                                                            {getFilteredDiscoveredBadges().map(badge => {
                                                                const isSelected = selectedBadgeIds.includes(badge.id);
                                                                return (
                                                                    <div
                                                                        key={badge.id}
                                                                        onClick={() => handleToggleSelectBadge(badge.id)}
                                                                        className={`relative p-2 rounded-xl border transition-all cursor-pointer flex flex-col items-center text-center gap-1.5 group select-none ${
                                                                            isSelected
                                                                                ? 'bg-purple-950/50 border-purple-500 ring-1 ring-purple-400 shadow-md shadow-purple-950/40'
                                                                                : 'bg-slate-950/70 border-slate-800 hover:border-slate-700'
                                                                        }`}
                                                                    >
                                                                        {/* Selection Checkbox */}
                                                                        <div className={`absolute top-1.5 right-1.5 w-4 h-4 rounded flex items-center justify-center text-[10px] ${
                                                                            isSelected ? 'bg-purple-500 text-white font-bold' : 'border border-slate-700 bg-slate-900'
                                                                        }`}>
                                                                            {isSelected && <Check className="h-3 w-3" />}
                                                                        </div>

                                                                        {/* Category Badge */}
                                                                        <div className="w-full flex justify-start">
                                                                            <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-900 text-purple-300 border border-purple-500/30">
                                                                                {badge.category}
                                                                            </span>
                                                                        </div>

                                                                        {/* Image Preview */}
                                                                        <div className="h-14 w-full flex items-center justify-center p-1 bg-slate-900/90 rounded-lg border border-slate-800/80 group-hover:border-purple-500/40 transition-colors overflow-hidden">
                                                                            <img
                                                                                src={badge.previewUrl}
                                                                                alt={badge.name}
                                                                                className="max-h-full max-w-full object-contain filter drop-shadow-md"
                                                                                loading="lazy"
                                                                            />
                                                                        </div>

                                                                        {/* Badge Name & Placement */}
                                                                        <div className="w-full">
                                                                            <h5 className="font-bold text-white text-[11px] truncate" title={badge.name}>
                                                                                {badge.name}
                                                                            </h5>
                                                                            <span className="text-[9px] text-slate-400 truncate block mt-0.5">
                                                                                {badge.filename}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Modal Footer with Batch Actions */}
                                            <div className="p-4 border-t border-slate-800/80 bg-slate-950 flex flex-col sm:flex-row items-center justify-between gap-3">
                                                <div className="text-xs text-slate-400 flex items-center gap-1.5">
                                                    <Shield className="h-3.5 w-3.5 text-purple-400" />
                                                    <span>Selected <strong>{selectedBadgeIds.length}</strong> of <strong>{discoveredBadges.length}</strong> badges</span>
                                                </div>

                                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => setGithubModalOpen(false)}
                                                        className="border-slate-700 text-slate-300 hover:text-white"
                                                    >
                                                        Close
                                                    </Button>

                                                    <Button
                                                        disabled={importingBadges || discoveredBadges.length === 0}
                                                        onClick={() => handleImportSelectedBadges(true)}
                                                        variant="secondary"
                                                        size="sm"
                                                        className="bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs h-8 px-3 gap-1.5 border border-slate-700"
                                                    >
                                                        {importingBadges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-purple-400" />}
                                                        <span>Install Entire Pack ({discoveredBadges.length})</span>
                                                    </Button>

                                                    <Button
                                                        disabled={importingBadges || selectedBadgeIds.length === 0}
                                                        onClick={() => handleImportSelectedBadges(false)}
                                                        size="sm"
                                                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8 px-4 gap-1.5 shadow-lg shadow-purple-950/40"
                                                    >
                                                        {importingBadges ? (
                                                            <>
                                                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                <span>Downloading Badges...</span>
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Download className="h-3.5 w-3.5" />
                                                                <span>Download Selected ({selectedBadgeIds.length})</span>
                                                            </>
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </DialogContent>
                                    </Dialog>

                                    <Dialog open={uploadModalOpen} onOpenChange={setUploadModalOpen}>
                                        <DialogTrigger asChild>
                                            <Button size="sm" className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-purple-950/40">
                                                <Upload className="h-3.5 w-3.5" /> Upload Custom Badge
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
                                            <form onSubmit={handleUploadCustomBadge} className="space-y-4">
                                                <DialogHeader>
                                                    <DialogTitle className="flex items-center gap-2">
                                                        <Upload className="h-5 w-5 text-purple-400" /> Upload Custom Badge / Overlay
                                                    </DialogTitle>
                                                    <DialogDescription className="text-slate-400 text-xs">
                                                        Accepts .png, .svg, .webp, or .jpg. Scaled and overlaid seamlessly on poster artwork.
                                                    </DialogDescription>
                                                </DialogHeader>

                                                {badgeUploadError && (
                                                    <div className="p-2.5 bg-rose-950/80 border border-rose-800 text-rose-300 rounded-lg text-xs flex items-center gap-2">
                                                        <XCircle className="h-4 w-4 shrink-0" />
                                                        <span>{badgeUploadError}</span>
                                                    </div>
                                                )}

                                                <div className="space-y-3 text-xs">
                                                    <div className="space-y-1">
                                                        <Label>Badge File (.svg, .png, .webp, .jpg)</Label>
                                                        <Input 
                                                            type="file" 
                                                            accept=".svg,.png,.webp,.jpg,.jpeg" 
                                                            onChange={e => {
                                                                const f = e.target.files?.[0] || null;
                                                                setBadgeFile(f);
                                                                if (f && !badgeName) {
                                                                    setBadgeName(f.name.replace(/\.[^/.]+$/, ""));
                                                                }
                                                            }}
                                                            className="bg-slate-800 border-slate-700 text-xs" 
                                                        />
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label>Badge Display Name</Label>
                                                        <Input 
                                                            value={badgeName} 
                                                            onChange={e => setBadgeName(e.target.value)} 
                                                            placeholder="e.g. IMAX Enhanced Custom"
                                                            className="bg-slate-800 border-slate-700 text-xs" 
                                                        />
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <div className="space-y-1">
                                                            <Label>Category</Label>
                                                            <Select value={badgeCategory} onValueChange={setBadgeCategory}>
                                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="edition">Edition / Cut</SelectItem>
                                                                    <SelectItem value="format">Format / Tech</SelectItem>
                                                                    <SelectItem value="audio">Audio</SelectItem>
                                                                    <SelectItem value="video">Video Codec</SelectItem>
                                                                    <SelectItem value="studio">Studio Logo</SelectItem>
                                                                    <SelectItem value="custom">General Custom</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>

                                                        <div className="space-y-1">
                                                            <Label>Overlay Position</Label>
                                                            <Select value={badgePosition} onValueChange={setBadgePosition}>
                                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="top-right">Top Right</SelectItem>
                                                                    <SelectItem value="top-left">Top Left</SelectItem>
                                                                    <SelectItem value="bottom-right">Bottom Right</SelectItem>
                                                                    <SelectItem value="bottom-left">Bottom Left</SelectItem>
                                                                    <SelectItem value="top-banner">Top Full Banner</SelectItem>
                                                                    <SelectItem value="bottom-banner">Bottom Full Banner</SelectItem>
                                                                    <SelectItem value="center">Center</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>

                                                    <div className="grid grid-cols-3 gap-2">
                                                        <div className="space-y-1">
                                                            <Label>Width (px)</Label>
                                                            <Input 
                                                                type="number" min={20} max={600} 
                                                                value={badgeWidth} 
                                                                onChange={e => setBadgeWidth(parseInt(e.target.value, 10) || 120)}
                                                                className="bg-slate-800 border-slate-700 text-xs" 
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label>Height (px)</Label>
                                                            <Input 
                                                                type="number" min={10} max={600} 
                                                                value={badgeHeight} 
                                                                onChange={e => setBadgeHeight(parseInt(e.target.value, 10) || 40)}
                                                                className="bg-slate-800 border-slate-700 text-xs" 
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <Label>Opacity (0.1 - 1.0)</Label>
                                                            <Input 
                                                                type="number" step="0.1" min={0.1} max={1.0} 
                                                                value={badgeOpacity} 
                                                                onChange={e => setBadgeOpacity(parseFloat(e.target.value) || 1.0)}
                                                                className="bg-slate-800 border-slate-700 text-xs" 
                                                            />
                                                        </div>
                                                    </div>

                                                    <div className="space-y-1">
                                                        <Label>Auto-Match Rule (Regex / Keywords)</Label>
                                                        <Input 
                                                            value={badgeMatchRule} 
                                                            onChange={e => setBadgeMatchRule(e.target.value)} 
                                                            placeholder="e.g. imax|criterion|remastered"
                                                            className="bg-slate-800 border-slate-700 text-xs font-mono" 
                                                        />
                                                        <p className="text-[10px] text-slate-500">
                                                            Matches filename, edition tag, or studio name in Plex media stream info.
                                                        </p>
                                                    </div>
                                                </div>

                                                <DialogFooter>
                                                    <Button type="button" variant="outline" size="sm" onClick={() => setUploadModalOpen(false)}>Cancel</Button>
                                                    <Button type="submit" size="sm" disabled={uploadingBadge} className="bg-purple-600 hover:bg-purple-500 text-white">
                                                        {uploadingBadge ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                                                        Upload & Save
                                                    </Button>
                                                </DialogFooter>
                                            </form>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-4 space-y-4">
                            {/* Persistent Storage Vault & Backup Status */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-xs">
                                <div className="flex items-center justify-between p-2 bg-slate-900/60 rounded-lg border border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Palette className="h-4 w-4 text-purple-400" />
                                        <div>
                                            <p className="font-semibold text-white text-xs">Custom Badges Storage</p>
                                            <p className="text-[10px] text-slate-400 font-mono">data/custom_badges</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="border-purple-500/40 text-purple-300 bg-purple-950/30 text-[10px]">
                                        {vaultStats?.badgeCount ?? customBadges.length} Badges {vaultStats?.badgeBytes ? `(${((vaultStats.badgeBytes) / 1024).toFixed(1)} KB)` : ''}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between p-2 bg-slate-900/60 rounded-lg border border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <Archive className="h-4 w-4 text-emerald-400" />
                                        <div>
                                            <p className="font-semibold text-white text-xs">Original Artwork Backup Vault</p>
                                            <p className="text-[10px] text-slate-400 font-mono">data/art_backups</p>
                                        </div>
                                    </div>
                                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 bg-emerald-950/30 text-[10px]">
                                        {vaultStats?.backupCount ?? backupsCount} Backups {vaultStats?.backupBytes ? `(${((vaultStats.backupBytes) / (1024 * 1024)).toFixed(1)} MB)` : ''}
                                    </Badge>
                                </div>
                            </div>

                            {/* Batch Selection & Filter Toolbar */}
                            {customBadges.length > 0 && (
                                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        {/* Search & Category Filter */}
                                        <div className="flex flex-1 items-center gap-2">
                                            <div className="relative flex-1 max-w-sm">
                                                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-500" />
                                                <Input 
                                                    placeholder="Filter badges by name, match rule, or format..." 
                                                    value={customBadgeSearch}
                                                    onChange={e => setCustomBadgeSearch(e.target.value)}
                                                    className="h-8 pl-8 text-xs bg-slate-900/90 border-slate-800 text-white"
                                                />
                                            </div>
                                            <Select value={customBadgeFilter} onValueChange={setCustomBadgeFilter}>
                                                <SelectTrigger className="h-8 w-[160px] text-xs bg-slate-900/90 border-slate-800 text-slate-300">
                                                    <SelectValue placeholder="Category" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                                    <SelectItem value="all">All Categories ({customBadges.length})</SelectItem>
                                                    <SelectItem value="resolution">Resolutions (4K / 1080p)</SelectItem>
                                                    <SelectItem value="hdr">HDR & Dolby Vision</SelectItem>
                                                    <SelectItem value="audio">Audio Codecs</SelectItem>
                                                    <SelectItem value="codec">Video Codecs</SelectItem>
                                                    <SelectItem value="edition">Editions & Cuts</SelectItem>
                                                    <SelectItem value="studio">Streaming & Studios</SelectItem>
                                                    <SelectItem value="ratings">Ratings</SelectItem>
                                                    <SelectItem value="ribbon">Ribbons & Gradients</SelectItem>
                                                    <SelectItem value="custom">Custom</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Selection Buttons & Action Controls */}
                                        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                            <Button 
                                                size="sm" 
                                                variant="outline" 
                                                onClick={handleSelectAllCustomBadges}
                                                className="h-8 px-2.5 text-xs border-slate-700 bg-slate-900 text-slate-300 hover:text-white"
                                            >
                                                <CheckCheck className="h-3.5 w-3.5 mr-1 text-purple-400" />
                                                Select All ({getFilteredCustomBadges().length})
                                            </Button>
                                            {selectedCustomBadgeIds.length > 0 && (
                                                <Button 
                                                    size="sm" 
                                                    variant="ghost" 
                                                    onClick={handleSelectNoneCustomBadges}
                                                    className="h-8 px-2.5 text-xs text-slate-400 hover:text-white hover:bg-slate-900"
                                                >
                                                    Select None
                                                </Button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Batch Actions Bar (when 1+ badges selected) */}
                                    {selectedCustomBadgeIds.length > 0 && (
                                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80 bg-purple-950/20 -mx-3 -mb-3 p-3 rounded-b-xl">
                                            <div className="flex items-center gap-2">
                                                <Badge className="bg-purple-600 text-white text-xs font-semibold px-2 py-0.5">
                                                    {selectedCustomBadgeIds.length} Selected
                                                </Badge>
                                                <span className="text-xs text-slate-400">
                                                    out of {customBadges.length} total badges
                                                </span>
                                            </div>

                                            <div className="flex items-center gap-2">
                                                <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    onClick={() => handleToggleSelectedCustomBadges(true)}
                                                    className="h-7 px-2 text-xs border-slate-700 bg-slate-900 text-slate-200 hover:text-emerald-400"
                                                >
                                                    Enable Selected
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    variant="outline"
                                                    onClick={() => handleToggleSelectedCustomBadges(false)}
                                                    className="h-7 px-2 text-xs border-slate-700 bg-slate-900 text-slate-200 hover:text-amber-400"
                                                >
                                                    Disable Selected
                                                </Button>
                                                <Button 
                                                    size="sm" 
                                                    disabled={deletingCustomBadges}
                                                    onClick={handleDeleteSelectedCustomBadges}
                                                    className="h-7 px-3 text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-md shadow-rose-950/50"
                                                >
                                                    {deletingCustomBadges ? (
                                                        <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                                                    ) : (
                                                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                                                    )}
                                                    Delete Selected ({selectedCustomBadgeIds.length})
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {customBadges.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 text-xs space-y-2">
                                    <Palette className="h-8 w-8 mx-auto text-slate-600" />
                                    <p>No custom badges uploaded yet. Click &quot;Upload Custom Badge&quot; or &quot;GitHub Badge Hub&quot; above to add overlay packs!</p>
                                </div>
                            ) : getFilteredCustomBadges().length === 0 ? (
                                <div className="text-center py-10 text-slate-500 text-xs space-y-2">
                                    <Filter className="h-8 w-8 mx-auto text-slate-600" />
                                    <p>No custom badges match your filter or search query.</p>
                                    <Button 
                                        size="sm" 
                                        variant="outline" 
                                        onClick={() => { setCustomBadgeFilter("all"); setCustomBadgeSearch(""); }}
                                        className="h-7 text-xs border-slate-700"
                                    >
                                        Clear Filters
                                    </Button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {getFilteredCustomBadges().map(badge => {
                                        const isSelected = selectedCustomBadgeIds.includes(badge.id);
                                        return (
                                            <div 
                                                key={badge.id}
                                                onClick={() => handleToggleSelectCustomBadge(badge.id)}
                                                className={`p-3 rounded-xl flex flex-col justify-between space-y-3 cursor-pointer transition-all ${
                                                    isSelected 
                                                        ? "bg-purple-950/30 border-2 border-purple-500 shadow-lg shadow-purple-950/30 ring-1 ring-purple-500/40" 
                                                        : "bg-slate-950/60 border border-slate-800 hover:border-purple-500/40"
                                                }`}
                                            >
                                                <div className="space-y-2">
                                                    {/* Header: Checkbox + Category Pill + Switch */}
                                                    <div className="flex items-center justify-between" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center gap-2">
                                                            <input 
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => handleToggleSelectCustomBadge(badge.id)}
                                                                className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 focus:ring-offset-0 cursor-pointer"
                                                            />
                                                            <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-slate-700 text-purple-300">
                                                                {badge.category}
                                                            </Badge>
                                                        </div>
                                                        <Switch 
                                                            checked={badge.enabled} 
                                                            onCheckedChange={checked => handleToggleCustomBadge(badge.id, checked)}
                                                        />
                                                    </div>

                                                    {/* Image Preview Box */}
                                                    <div className="h-20 bg-slate-900/90 border border-slate-800/80 rounded-lg flex items-center justify-center p-2 relative overflow-hidden group-hover:border-slate-700 transition-colors">
                                                        <img 
                                                            src={`/api/curation/badges/${badge.id}`} 
                                                            alt={badge.name}
                                                            className="max-h-full max-w-full object-contain"
                                                            style={{ opacity: badge.opacity ?? 1.0 }}
                                                        />
                                                    </div>

                                                    {/* Title & Details */}
                                                    <div className="space-y-1">
                                                        <h4 className="font-bold text-white text-xs truncate">{badge.name}</h4>
                                                        <p className="text-[10px] text-slate-400">
                                                            Pos: {badge.position} • {badge.width}x{badge.height}px
                                                        </p>
                                                        {badge.matchRule && (
                                                            <p className="text-[10px] text-purple-400 font-mono truncate">
                                                                Match: {badge.matchRule}
                                                            </p>
                                                        )}
                                                        <div className="pt-0.5">
                                                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-purple-950/70 text-purple-300 border border-purple-500/40 flex items-center gap-1 w-fit">
                                                                <Zap className="h-2.5 w-2.5 text-purple-400 shrink-0" /> Overrides: {getCustomBadgeOverriddenCategory(badge)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Action Bar */}
                                                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs" onClick={e => e.stopPropagation()}>
                                                    <span className="text-[9px] text-slate-500 uppercase">{badge.fileType}</span>
                                                    <Button 
                                                        size="sm" 
                                                        variant="ghost" 
                                                        onClick={() => handleDeleteCustomBadge(badge.id)}
                                                        className="h-6 px-2 text-[10px] text-rose-400 hover:bg-rose-950/40 hover:text-rose-300"
                                                    >
                                                        <Trash2 className="h-3 w-3 mr-1" /> Remove
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

                {/* ========================================================================= */}
                {/* TAB 3: AGREGARR MEDIA INSPECTOR & LIVE SINGLE-ITEM SIMULATOR */}
                {/* ========================================================================= */}
                <TabsContent value="inspector" className="space-y-6">
                    {/* Search & Inspector Bar */}
                    <Card className="bg-slate-900/80 border-slate-800 shadow-xl overflow-hidden">
                        <CardHeader className="p-5 pb-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-cyan-500/20 text-cyan-400 rounded-xl border border-cyan-500/30">
                                            <Search className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                                Agregarr Media Inspector & Live Stream Previewer
                                            </CardTitle>
                                            <CardDescription className="text-xs text-slate-400">
                                                Search any Movie or TV Show in your Plex library to inspect its complete audio/video stream technical telemetry and test how custom overlays render on it in real-time.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-5 space-y-4 text-xs">
                            {/* Search Form */}
                            <form onSubmit={handleSearchPlex} className="flex gap-2">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
                                    <Input 
                                        value={inspectorSearchQuery}
                                        onChange={e => setInspectorSearchQuery(e.target.value)}
                                        placeholder="Search movie or TV show title (e.g. Oppenheimer, Dune, Blade Runner)..."
                                        className="bg-slate-950 border-slate-800 pl-9 text-xs h-9"
                                    />
                                </div>
                                <Button 
                                    type="submit" 
                                    disabled={searchingPlex || !inspectorSearchQuery.trim()}
                                    className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs h-9 px-4 gap-1.5"
                                >
                                    {searchingPlex ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                                    <span>Search Plex</span>
                                </Button>
                            </form>

                            {/* Search Suggestions & Results Bar */}
                            {searchResults.length > 0 && !inspectingItem && (
                                <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-2">
                                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                        Search Results ({searchResults.length}) — Select an item to inspect:
                                    </span>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                                        {searchResults.map((it: any) => (
                                            <button 
                                                key={it.ratingKey}
                                                onClick={() => handleInspectItem(it.ratingKey)}
                                                className="flex items-center gap-3 p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/50 rounded-lg text-left transition-all group"
                                            >
                                                <div className="w-10 h-14 bg-slate-950 rounded overflow-hidden shrink-0 border border-slate-700">
                                                    {it.thumb ? (
                                                        <img src={`/api/media/image?url=${encodeURIComponent(it.thumb)}`} alt={it.title} className="w-full h-full object-cover" />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center text-slate-600"><Film className="h-4 w-4" /></div>
                                                    )}
                                                </div>
                                                <div className="space-y-0.5 truncate flex-1">
                                                    <span className="font-bold text-white text-xs group-hover:text-cyan-300 transition-colors truncate block">
                                                        {it.title} {it.year && <span className="text-slate-500 font-normal">({it.year})</span>}
                                                    </span>
                                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-700 text-slate-300">
                                                            {it.detectedBadges?.resolution || "HD"}
                                                        </Badge>
                                                        {it.detectedBadges?.hdr && <span className="text-purple-400 font-semibold">{it.detectedBadges.hdr}</span>}
                                                        {it.detectedBadges?.audio && <span className="text-sky-400">{it.detectedBadges.audio}</span>}
                                                    </div>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {loadingInspection && (
                                <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
                                    <Loader2 className="h-6 w-6 animate-spin text-cyan-400" />
                                    <span>Fetching full technical stream analysis from Plex...</span>
                                </div>
                            )}

                            {/* Deep Inspection Panel & Live Single Item Overlay Preview */}
                            {inspectingItem && (
                                <div className="space-y-6 pt-2">
                                    {/* Action message pill */}
                                    {singleItemMsg && (
                                        <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${singleItemMsg.success ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300' : 'bg-rose-950/70 border border-rose-800 text-rose-300'}`}>
                                            {singleItemMsg.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                            <span>{singleItemMsg.text}</span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                        {/* Left Column: Side-by-Side Poster Preview & Instant Testing Actions */}
                                        <div className="lg:col-span-5 flex flex-col items-center p-5 bg-slate-950/80 border border-slate-800 rounded-2xl space-y-4">
                                            <div className="text-center space-y-0.5">
                                                <span className="text-xs font-bold text-white flex items-center justify-center gap-1.5">
                                                    <Eye className="h-4 w-4 text-cyan-400" /> Live Overlay Simulator on This Item
                                                </span>
                                                <p className="text-[10px] text-slate-400">Exact rendering of badges for &quot;{inspectingItem.item.title}&quot;</p>
                                            </div>

                                            {/* Poster Simulated Box */}
                                            <div className="relative w-[230px] h-[345px] rounded-xl overflow-hidden shadow-2xl border-2 border-slate-700 bg-slate-950 group">
                                                {/* Poster Image */}
                                                {inspectingItem.item.thumb ? (
                                                    <img 
                                                        src={`/api/media/image?url=${encodeURIComponent(inspectingItem.item.thumb)}`} 
                                                        alt={inspectingItem.item.title} 
                                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center text-slate-600"><Film className="h-10 w-10" /></div>
                                                )}

                                                {/* Top Leaving Soon Banner if active */}
                                                {inspectingItem.isLeavingSoon && (
                                                    <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-red-700 via-red-600 to-red-700 py-1 px-2 text-center text-[10px] font-black tracking-widest text-white shadow-lg border-b border-red-400 flex items-center justify-center gap-1 z-20">
                                                        <AlertTriangle className="h-3 w-3" /> LEAVING SOON
                                                    </div>
                                                )}

                                                {/* Corner Ribbon Overlay on Inspected Item */}
                                                {simShowRibbon && (
                                                    <div className={`absolute pointer-events-none z-20 ${
                                                        simRibbonPosition === 'top-right' ? 'top-0 right-0' :
                                                        simRibbonPosition === 'top-left' ? 'top-0 left-0' :
                                                        simRibbonPosition === 'bottom-right' ? 'bottom-0 right-0' :
                                                        'bottom-0 left-0'
                                                    }`}>
                                                        <svg width="100" height="100" viewBox="0 0 100 100" className="overflow-visible">
                                                            <defs>
                                                                <linearGradient id={`inspect-ribbon-grad-${simRibbonTheme}`} x1="0%" y1="0%" x2="100%" y2="100%">
                                                                    {simRibbonTheme === 'crimson' && <><stop offset="0%" stopColor="#ef4444"/><stop offset="100%" stopColor="#991b1b"/></>}
                                                                    {simRibbonTheme === 'emerald' && <><stop offset="0%" stopColor="#10b981"/><stop offset="100%" stopColor="#065f46"/></>}
                                                                    {simRibbonTheme === 'purple' && <><stop offset="0%" stopColor="#a855f7"/><stop offset="100%" stopColor="#6b21a8"/></>}
                                                                    {simRibbonTheme === 'gold' && <><stop offset="0%" stopColor="#fbbf24"/><stop offset="100%" stopColor="#b45309"/></>}
                                                                    {simRibbonTheme === 'cyan' && <><stop offset="0%" stopColor="#06b6d4"/><stop offset="100%" stopColor="#0e7490"/></>}
                                                                    {simRibbonTheme === 'pink' && <><stop offset="0%" stopColor="#ec4899"/><stop offset="100%" stopColor="#9d174d"/></>}
                                                                    {simRibbonTheme === 'glass' && <><stop offset="0%" stopColor="#334155"/><stop offset="100%" stopColor="#0f172a"/></>}
                                                                    {simRibbonTheme === 'orange' && <><stop offset="0%" stopColor="#f97316"/><stop offset="100%" stopColor="#c2410c"/></>}
                                                                </linearGradient>
                                                                <filter id="inspect-ribbon-shadow" x="-20%" y="-20%" width="140%" height="140%">
                                                                    <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.8"/>
                                                                </filter>
                                                            </defs>
                                                            <g filter="url(#inspect-ribbon-shadow)">
                                                                {simRibbonPosition === 'top-right' && (
                                                                    <g transform="translate(50, 50) rotate(45) translate(-50, -50)">
                                                                        <rect x="-30" y="38" width="160" height="24" fill={`url(#inspect-ribbon-grad-${simRibbonTheme})`} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                                                                        <text x="50" y="53" fill="#ffffff" fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="0.8" fontFamily="sans-serif">
                                                                            {getEffectiveRibbonText()}
                                                                        </text>
                                                                    </g>
                                                                )}
                                                                {simRibbonPosition === 'top-left' && (
                                                                    <g transform="translate(50, 50) rotate(-45) translate(-50, -50)">
                                                                        <rect x="-30" y="38" width="160" height="24" fill={`url(#inspect-ribbon-grad-${simRibbonTheme})`} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                                                                        <text x="50" y="53" fill="#ffffff" fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="0.8" fontFamily="sans-serif">
                                                                            {getEffectiveRibbonText()}
                                                                        </text>
                                                                    </g>
                                                                )}
                                                                {simRibbonPosition === 'bottom-right' && (
                                                                    <g transform="translate(50, 50) rotate(-45) translate(-50, -50)">
                                                                        <rect x="-30" y="38" width="160" height="24" fill={`url(#inspect-ribbon-grad-${simRibbonTheme})`} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                                                                        <text x="50" y="53" fill="#ffffff" fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="0.8" fontFamily="sans-serif">
                                                                            {getEffectiveRibbonText()}
                                                                        </text>
                                                                    </g>
                                                                )}
                                                                {simRibbonPosition === 'bottom-left' && (
                                                                    <g transform="translate(50, 50) rotate(45) translate(-50, -50)">
                                                                        <rect x="-30" y="38" width="160" height="24" fill={`url(#inspect-ribbon-grad-${simRibbonTheme})`} stroke="rgba(255,255,255,0.4)" strokeWidth="0.8"/>
                                                                        <text x="50" y="53" fill="#ffffff" fontSize="8" fontWeight="900" textAnchor="middle" letterSpacing="0.8" fontFamily="sans-serif">
                                                                            {getEffectiveRibbonText()}
                                                                        </text>
                                                                    </g>
                                                                )}
                                                            </g>
                                                        </svg>
                                                    </div>
                                                )}

                                                {/* Top-Left Inspected Badges */}
                                                {renderInspectedBadgesForPosition(inspectingItem.item, "top-left").length > 0 && (
                                                    <div 
                                                        className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 items-start z-10"
                                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'top left' }}
                                                    >
                                                        {renderInspectedBadgesForPosition(inspectingItem.item, "top-left")}
                                                    </div>
                                                )}

                                                {/* Top-Right Inspected Badges */}
                                                {renderInspectedBadgesForPosition(inspectingItem.item, "top-right").length > 0 && (
                                                    <div 
                                                        className="absolute top-2.5 right-2.5 flex flex-col gap-1.5 items-end z-10"
                                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'top right' }}
                                                    >
                                                        {renderInspectedBadgesForPosition(inspectingItem.item, "top-right")}
                                                    </div>
                                                )}

                                                {/* Top-Center Inspected Badges */}
                                                {renderInspectedBadgesForPosition(inspectingItem.item, "top-center").length > 0 && (
                                                    <div 
                                                        className="absolute top-2.5 left-1/2 -translate-x-1/2 flex flex-row flex-wrap gap-1.5 justify-center items-center z-10 max-w-[85%]"
                                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'top center' }}
                                                    >
                                                        {renderInspectedBadgesForPosition(inspectingItem.item, "top-center")}
                                                    </div>
                                                )}

                                                {/* Bottom-Left Inspected Badges */}
                                                {renderInspectedBadgesForPosition(inspectingItem.item, "bottom-left").length > 0 && (
                                                    <div 
                                                        className="absolute bottom-2.5 left-2.5 flex flex-col gap-1.5 items-start z-10"
                                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'bottom left' }}
                                                    >
                                                        {renderInspectedBadgesForPosition(inspectingItem.item, "bottom-left")}
                                                    </div>
                                                )}

                                                {/* Bottom-Right Inspected Badges */}
                                                {renderInspectedBadgesForPosition(inspectingItem.item, "bottom-right").length > 0 && (
                                                    <div 
                                                        className="absolute bottom-2.5 right-2.5 flex flex-col gap-1.5 items-end z-10"
                                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'bottom right' }}
                                                    >
                                                        {renderInspectedBadgesForPosition(inspectingItem.item, "bottom-right")}
                                                    </div>
                                                )}

                                                {/* Bottom-Center Inspected Badges */}
                                                {renderInspectedBadgesForPosition(inspectingItem.item, "bottom-center").length > 0 && (
                                                    <div 
                                                        className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex flex-row flex-wrap gap-1.5 justify-center items-center z-10 max-w-[85%]"
                                                        style={{ transform: `scale(${simBadgeScale})`, transformOrigin: 'bottom center' }}
                                                    >
                                                        {renderInspectedBadgesForPosition(inspectingItem.item, "bottom-center")}
                                                    </div>
                                                )}
                                            </div>

                                            {/* Backup Pill & Single Item Action Buttons */}
                                            <div className="w-full space-y-2 pt-1">
                                                <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 rounded-lg border border-slate-800 text-[11px]">
                                                    <span className="text-slate-400 flex items-center gap-1.5">
                                                        <Shield className="h-3.5 w-3.5 text-emerald-400" /> Vault Backup:
                                                    </span>
                                                    <span className={inspectingItem.hasBackup ? "text-emerald-400 font-bold" : "text-slate-500"}>
                                                        {inspectingItem.hasBackup ? "Backed Up in Vault" : "Pristine Original"}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2">
                                                    <Button 
                                                        size="sm"
                                                        onClick={handleApplySingleOverlay}
                                                        disabled={applyingSingleOverlay}
                                                        className="flex-1 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8 gap-1.5"
                                                    >
                                                        {applyingSingleOverlay ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                                        <span>Apply Overlay to Item</span>
                                                    </Button>

                                                    <Button 
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={handleRestoreSinglePoster}
                                                        disabled={revertingSingleOverlay || !inspectingItem.hasBackup}
                                                        className="border-slate-700 text-slate-300 hover:text-white text-xs h-8 gap-1"
                                                    >
                                                        {revertingSingleOverlay ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Undo2 className="h-3.5 w-3.5 text-emerald-400" />}
                                                        <span>Restore Original</span>
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Right Column: Deep Technical Telemetry Breakdown Cards */}
                                        <div className="lg:col-span-7 space-y-4">
                                            {/* Item Meta Summary */}
                                            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <h3 className="text-base font-black text-white">
                                                        {inspectingItem.item.title} {inspectingItem.item.year && <span className="text-slate-400 font-normal">({inspectingItem.item.year})</span>}
                                                    </h3>
                                                    <Badge variant="outline" className="border-cyan-500/40 text-cyan-300 bg-cyan-950/30 text-[10px]">
                                                        RatingKey: {inspectingItem.item.ratingKey}
                                                    </Badge>
                                                </div>
                                                {inspectingItem.item.summary && (
                                                    <p className="text-xs text-slate-400 line-clamp-2">{inspectingItem.item.summary}</p>
                                                )}
                                                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-300">
                                                    {inspectingItem.item.studio && <span className="px-2 py-0.5 bg-slate-900 rounded border border-slate-800">🏛️ {inspectingItem.item.studio}</span>}
                                                    {inspectingItem.item.contentRating && <span className="px-2 py-0.5 bg-slate-900 rounded border border-slate-800">🔞 {inspectingItem.item.contentRating}</span>}
                                                    {inspectingItem.parts?.[0]?.sizeGb && <span className="px-2 py-0.5 bg-slate-900 rounded border border-slate-800 font-mono text-amber-300 font-bold">💾 {inspectingItem.parts[0].sizeGb} GB</span>}
                                                </div>
                                            </div>

                                            {/* Overlay Decision Matrix & Priority Engine Table */}
                                            {getInspectedItemDecisionMatrix(inspectingItem.item).length > 0 && (
                                                <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-3">
                                                    <div className="flex items-center justify-between">
                                                        <div className="flex items-center gap-2">
                                                            <Layers className="h-4 w-4 text-purple-400" />
                                                            <span className="text-xs font-bold text-white uppercase tracking-wider">
                                                                Overlay Decision Matrix & Priority Engine
                                                            </span>
                                                        </div>
                                                        <Badge variant="outline" className="border-purple-500/40 text-purple-300 bg-purple-950/30 text-[10px]">
                                                            {getInspectedItemDecisionMatrix(inspectingItem.item).filter(d => d.isCustom).length} Custom (P1) • {getInspectedItemDecisionMatrix(inspectingItem.item).filter(d => !d.isCustom).length} SVG (P2)
                                                        </Badge>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400">
                                                        Exact decision trail showing which badge is selected for each detected media stream property and why.
                                                    </p>

                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-[11px] border-collapse">
                                                            <thead>
                                                                <tr className="border-b border-slate-800 text-slate-400 text-left">
                                                                    <th className="py-1.5 px-2 font-semibold">Media Property</th>
                                                                    <th className="py-1.5 px-2 font-semibold">Detected Value</th>
                                                                    <th className="py-1.5 px-2 font-semibold">Chosen Priority</th>
                                                                    <th className="py-1.5 px-2 font-semibold">Rendered Badge</th>
                                                                    <th className="py-1.5 px-2 font-semibold text-right">Position</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-slate-800/60">
                                                                {getInspectedItemDecisionMatrix(inspectingItem.item).map((row, idx) => (
                                                                    <tr key={idx} className="hover:bg-slate-900/50 transition-colors">
                                                                        <td className="py-2 px-2 font-medium text-slate-200">{row.property}</td>
                                                                        <td className="py-2 px-2 font-mono text-cyan-300 font-semibold">{row.detectedValue}</td>
                                                                        <td className="py-2 px-2">
                                                                            {row.isCustom ? (
                                                                                <Badge className="bg-purple-950/80 text-purple-300 border border-purple-600/60 text-[9px] font-bold">
                                                                                    ⚡ Priority 1 (Custom)
                                                                                </Badge>
                                                                            ) : (
                                                                                <Badge variant="outline" className="text-slate-300 border-slate-700 bg-slate-900 text-[9px]">
                                                                                    ✓ Priority 2 (SVG)
                                                                                </Badge>
                                                                            )}
                                                                        </td>
                                                                        <td className="py-2 px-2 text-white font-semibold">
                                                                            {row.isCustom ? (
                                                                                <span className="text-purple-300 flex items-center gap-1">
                                                                                    <Sparkles className="h-3 w-3 text-purple-400 shrink-0" /> {row.badgeName}
                                                                                </span>
                                                                            ) : (
                                                                                <span className="text-slate-300">{row.badgeName}</span>
                                                                            )}
                                                                        </td>
                                                                        <td className="py-2 px-2 text-right text-slate-400 font-mono text-[10px]">{row.position}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Video Streams Breakdown */}
                                            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                                                <span className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Film className="h-4 w-4 text-purple-400" /> Video Stream Specs & HDR Profile
                                                </span>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 text-xs">
                                                    {inspectingItem.rawStreams?.video?.map((vs: any, idx: number) => (
                                                        <div key={idx} className="p-2.5 bg-slate-900/90 rounded-lg border border-slate-800 space-y-1 col-span-2 sm:col-span-3">
                                                            <div className="flex items-center justify-between">
                                                                <span className="font-bold text-white text-xs">{vs.displayTitle}</span>
                                                                <Badge className="bg-purple-950 text-purple-200 border-purple-800 text-[10px]">{vs.dovTitle}</Badge>
                                                            </div>
                                                            <p className="text-[11px] text-slate-400">
                                                                {vs.width}x{vs.height} • {vs.bitDepth} • {vs.frameRate} • Color: {vs.colorPrimaries || "SDR"}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Audio Streams Breakdown */}
                                            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                                                <span className="text-xs font-bold text-sky-300 uppercase tracking-wider flex items-center gap-1.5">
                                                    <Volume2 className="h-4 w-4 text-sky-400" /> Audio Streams & Surround Channels
                                                </span>
                                                <div className="space-y-1.5 pt-1">
                                                    {inspectingItem.rawStreams?.audio?.map((as: any, idx: number) => (
                                                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-900/90 rounded-lg border border-slate-800 text-xs">
                                                            <div className="space-y-0.5">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-white">{as.title || `${as.codec?.toUpperCase()} ${as.channels}ch`}</span>
                                                                    {as.selected && <Badge className="bg-emerald-900/60 text-emerald-300 text-[9px] px-1 py-0">Default</Badge>}
                                                                </div>
                                                                <p className="text-[10px] text-slate-400">
                                                                    {as.language} ({as.languageCode || "und"}) • Layout: {as.audioChannelLayout || as.channelLayout || `${as.channels} channels`}
                                                                </p>
                                                            </div>
                                                            <Badge variant="outline" className="text-[10px] border-slate-700 text-sky-300 uppercase">
                                                                {as.codec}
                                                            </Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Physical Files on Disk */}
                                            {inspectingItem.parts?.length > 0 && (
                                                <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                                                    <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                                                        <HardDrive className="h-4 w-4 text-amber-400" /> Physical File on Disk
                                                    </span>
                                                    <div className="p-2 bg-slate-900 rounded font-mono text-[11px] text-slate-300 break-all border border-slate-800">
                                                        {inspectingItem.parts[0].file}
                                                    </div>
                                                </div>
                                            )}

                                            {/* IMDb Parents Guide / Parental Advisory Card */}
                                            <div className="p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-xs font-bold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                                                        <Shield className="h-4 w-4 text-amber-400" /> IMDb Parents Guide & Severity Ratings
                                                    </span>
                                                    {inspectedAdvisory && (
                                                        <Badge variant="outline" className="text-[9px] border-amber-500/40 text-amber-300 bg-amber-950/30">
                                                            Source: {inspectedAdvisory.source?.toUpperCase() || "AI"}
                                                        </Badge>
                                                    )}
                                                </div>

                                                {inspectedAdvisory ? (
                                                    <div className="space-y-3">
                                                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                                                            {[
                                                                { label: "Sex & Nudity", val: inspectedAdvisory.nudity, icon: "🔞" },
                                                                { label: "Violence & Gore", val: inspectedAdvisory.violence, icon: "🩸" },
                                                                { label: "Profanity", val: inspectedAdvisory.profanity, icon: "🤬" },
                                                                { label: "Alcohol & Drugs", val: inspectedAdvisory.alcohol, icon: "🍷" },
                                                                { label: "Frightening Scenes", val: inspectedAdvisory.frightening, icon: "😱" }
                                                            ].map(cat => {
                                                                const s = cat.val || "None";
                                                                let badgeStyle = "bg-slate-900 border-slate-800 text-slate-400";
                                                                if (s === "Severe") badgeStyle = "bg-rose-950/80 border-rose-700 text-rose-300 font-bold";
                                                                else if (s === "Moderate") badgeStyle = "bg-amber-950/80 border-amber-700 text-amber-300 font-semibold";
                                                                else if (s === "Mild") badgeStyle = "bg-sky-950/80 border-sky-700 text-sky-300";

                                                                return (
                                                                    <div key={cat.label} className="p-2 bg-slate-900/90 rounded-lg border border-slate-800 flex items-center justify-between">
                                                                        <span className="text-[11px] text-slate-300 flex items-center gap-1">
                                                                            <span>{cat.icon}</span> {cat.label}
                                                                        </span>
                                                                        <Badge className={`text-[9px] px-1.5 py-0.5 border ${badgeStyle}`}>
                                                                            {s}
                                                                        </Badge>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {inspectedAdvisory.certificate && (
                                                            <p className="text-[11px] text-slate-300 bg-slate-900/80 p-2 rounded border border-slate-800">
                                                                <strong className="text-amber-400">Certification:</strong> {inspectedAdvisory.certificate}
                                                                {inspectedAdvisory.summary ? ` — ${inspectedAdvisory.summary}` : ""}
                                                            </p>
                                                        )}

                                                        <div className="flex items-center justify-between pt-1">
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {parentalCategories.map(catKey => {
                                                                    const sev = (inspectedAdvisory as any)[catKey] || "None";
                                                                    if (sev === "None" && parentalMinSeverity !== "None") return null;
                                                                    let formatted = `${parentalTagPrefix}-${catKey.charAt(0).toUpperCase() + catKey.slice(1)}: ${sev}`;
                                                                    if (parentalTagFormat === "severity_category") formatted = `${sev} ${catKey.charAt(0).toUpperCase() + catKey.slice(1)}`;
                                                                    if (parentalTagFormat === "category_severity_paren") formatted = `${catKey.charAt(0).toUpperCase() + catKey.slice(1)} (${sev})`;
                                                                    return (
                                                                        <Badge key={catKey} variant="secondary" className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                                                            {formatted}
                                                                        </Badge>
                                                                    );
                                                                })}
                                                            </div>

                                                            <Button 
                                                                size="sm"
                                                                onClick={handleApplySingleParentalTag}
                                                                disabled={taggingSingleItem}
                                                                className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-7 px-2.5 gap-1"
                                                            >
                                                                {taggingSingleItem ? <Loader2 className="h-3 w-3 animate-spin" /> : <Tag className="h-3 w-3" />}
                                                                <span>Sync Tags to Item</span>
                                                            </Button>
                                                        </div>

                                                        {singleItemTagMsg && (
                                                            <p className={`text-[10px] ${singleItemTagMsg.success ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                {singleItemTagMsg.text}
                                                            </p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <div className="py-3 text-center text-slate-500 text-xs">
                                                        Fetching consensus IMDb parental guide severity...
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ========================================================================= */}
                {/* TAB 4: UPCOMING DIGITAL RELEASES & AGREGARR PLACEHOLDER TIMINGS */}
                {/* ========================================================================= */}
                <TabsContent value="releases" className="space-y-6">
                    {/* Agregarr Placeholder Overlays & Timings Deck */}
                    <Card className="bg-slate-900/80 border-slate-800 shadow-xl overflow-hidden">
                        <CardHeader className="p-5 pb-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                                            <Clock className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                                Agregarr Placeholder Overlays & Automated Timings
                                            </CardTitle>
                                            <CardDescription className="text-xs text-slate-400">
                                                Configure theatrical notice ribbons, dynamic countdown timers, grace periods, and isolated coming soon shares.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700">
                                        <span className="text-xs font-semibold text-slate-200">Placeholder Overlays</span>
                                        <Switch 
                                            checked={settings.placeholderEnabled ?? true}
                                            onCheckedChange={checked => setSettings({ ...settings, placeholderEnabled: checked })}
                                        />
                                    </div>

                                    <Button 
                                        size="sm"
                                        onClick={handleSavePlaceholderSettings}
                                        disabled={savingPlaceholders}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-emerald-950/40"
                                    >
                                        {savingPlaceholders ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                        <span>Save Placeholder Settings</span>
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-5 space-y-6">
                            {placeholderSavedMsg && (
                                <div className="p-2.5 bg-emerald-950/70 border border-emerald-800 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>✓ Agregarr placeholder overlay settings and timing windows saved!</span>
                                </div>
                            )}

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                {/* Interactive Placeholder Ribbon Simulator */}
                                <div className="lg:col-span-4 flex flex-col items-center justify-center p-4 bg-slate-950/60 border border-slate-800 rounded-xl space-y-3">
                                    <div className="text-center space-y-0.5">
                                        <span className="text-xs font-bold text-slate-200 flex items-center justify-center gap-1.5">
                                            <Eye className="h-3.5 w-3.5 text-emerald-400" /> Placeholder Ribbon Simulator
                                        </span>
                                        <p className="text-[10px] text-slate-500">Live preview of the banner overlay</p>
                                    </div>

                                    {/* Preview Card */}
                                    <div className="relative w-[180px] h-[270px] rounded-lg overflow-hidden shadow-2xl border border-slate-700 bg-slate-950 group">
                                        <img 
                                            src="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=500&auto=format&fit=crop&q=80" 
                                            alt="Simulated Placeholder"
                                            className="w-full h-full object-cover"
                                        />

                                        {/* Dynamic Ribbon Banner based on Theme and Position */}
                                        {settings.placeholderEnabled !== false && (
                                            <div className={`absolute ${
                                                settings.placeholderBannerPosition === "bottom_banner" ? "bottom-0 left-0 right-0 py-1" :
                                                settings.placeholderBannerPosition === "top_left_ribbon" ? "top-2 left-2 px-2 py-0.5 rounded-md" :
                                                settings.placeholderBannerPosition === "top_right_ribbon" ? "top-2 right-2 px-2 py-0.5 rounded-md" :
                                                settings.placeholderBannerPosition === "center_badge" ? "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-lg" :
                                                "top-0 left-0 right-0 py-1"
                                            } text-center font-black tracking-wider text-white shadow-xl flex items-center justify-center gap-1 ${
                                                settings.placeholderBannerTheme === "netflix_red" ? "bg-gradient-to-r from-red-700 via-red-600 to-red-700 border-b border-red-400" :
                                                settings.placeholderBannerTheme === "emerald_green" ? "bg-gradient-to-r from-emerald-700 via-emerald-600 to-emerald-700 border-b border-emerald-400" :
                                                settings.placeholderBannerTheme === "golden_amber" ? "bg-gradient-to-r from-amber-600 via-yellow-500 to-amber-600 text-black border-b border-yellow-300" :
                                                settings.placeholderBannerTheme === "slate_frosted" ? "bg-slate-950/90 border border-slate-600" :
                                                settings.placeholderBannerTheme === "midnight_blue" ? "bg-gradient-to-r from-blue-700 via-indigo-600 to-blue-700 border-b border-blue-400" :
                                                "bg-gradient-to-r from-purple-700 via-purple-600 to-indigo-700 border-b border-purple-400"
                                            } text-[9px]`}>
                                                {placeholderSimState === "theatrical" && "🎬 IN THEATERS • STREAMING SOON"}
                                                {placeholderSimState === "countdown" && "⏳ STREAMING IN 14 DAYS • NOV 28"}
                                                {placeholderSimState === "now_streaming" && "✨ NOW STREAMING • WATCH NOW"}
                                                {placeholderSimState === "custom" && (settings.placeholderCustomText || "EXCLUSIVE PREMIERE")}
                                            </div>
                                        )}
                                    </div>

                                    {/* Preview State Switcher Buttons */}
                                    <div className="flex flex-wrap items-center justify-center gap-1 pt-1">
                                        <button 
                                            onClick={() => setPlaceholderSimState("theatrical")}
                                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${placeholderSimState === "theatrical" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`}
                                        >
                                            Theatrical
                                        </button>
                                        <button 
                                            onClick={() => setPlaceholderSimState("countdown")}
                                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${placeholderSimState === "countdown" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`}
                                        >
                                            Countdown
                                        </button>
                                        <button 
                                            onClick={() => setPlaceholderSimState("now_streaming")}
                                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${placeholderSimState === "now_streaming" ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400"}`}
                                        >
                                            Now Streaming
                                        </button>
                                    </div>
                                </div>

                                {/* Placeholder Timing Controls Matrix */}
                                <div className="lg:col-span-8 space-y-4 text-xs">
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                                            <Label className="font-semibold text-slate-200">Theatrical Notice Window</Label>
                                            <div className="flex items-center gap-2">
                                                <Input 
                                                    type="number" min={1} max={180}
                                                    value={settings.placeholderTheatricalNoticeDays ?? 60}
                                                    onChange={e => setSettings({ ...settings, placeholderTheatricalNoticeDays: parseInt(e.target.value, 10) || 60 })}
                                                    className="bg-slate-800 border-slate-700 text-xs h-8 w-20"
                                                />
                                                <span className="text-slate-400">days before digital release</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500">Displays &quot;In Theaters • Streaming Soon&quot; banner</p>
                                        </div>

                                        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                                            <Label className="font-semibold text-slate-200">Digital Countdown Window</Label>
                                            <div className="flex items-center gap-2">
                                                <Input 
                                                    type="number" min={1} max={90}
                                                    value={settings.placeholderDigitalCountdownDays ?? 30}
                                                    onChange={e => setSettings({ ...settings, placeholderDigitalCountdownDays: parseInt(e.target.value, 10) || 30 })}
                                                    className="bg-slate-800 border-slate-700 text-xs h-8 w-20"
                                                />
                                                <span className="text-slate-400">days countdown</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500">Shows &quot;Streaming in X Days&quot; live countdown</p>
                                        </div>

                                        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                                            <Label className="font-semibold text-slate-200">Now Streaming Grace Period</Label>
                                            <div className="flex items-center gap-2">
                                                <Input 
                                                    type="number" min={0} max={30}
                                                    value={settings.placeholderNowStreamingGraceDays ?? 7}
                                                    onChange={e => setSettings({ ...settings, placeholderNowStreamingGraceDays: parseInt(e.target.value, 10) || 7 })}
                                                    className="bg-slate-800 border-slate-700 text-xs h-8 w-20"
                                                />
                                                <span className="text-slate-400">days grace</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500">Keeps banner active after digital streaming launch</p>
                                        </div>

                                        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1.5">
                                            <Label className="font-semibold text-slate-200">Placeholder Auto-Prune Grace</Label>
                                            <div className="flex items-center gap-2">
                                                <Input 
                                                    type="number" min={1} max={60}
                                                    value={settings.placeholderAutoPruneDays ?? 14}
                                                    onChange={e => setSettings({ ...settings, placeholderAutoPruneDays: parseInt(e.target.value, 10) || 14 })}
                                                    className="bg-slate-800 border-slate-700 text-xs h-8 w-20"
                                                />
                                                <span className="text-slate-400">days after import</span>
                                            </div>
                                            <p className="text-[10px] text-slate-500">Auto-cleans dummy stubs once real video file is imported</p>
                                        </div>
                                    </div>

                                    {/* Style & Position Selectors */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                                        <div className="space-y-1.5">
                                            <Label className="text-slate-300">Banner Theme</Label>
                                            <Select 
                                                value={settings.placeholderBannerTheme ?? "cyberpunk_purple"} 
                                                onValueChange={val => setSettings({ ...settings, placeholderBannerTheme: val })}
                                            >
                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="cyberpunk_purple">Cyberpunk Purple Gradient</SelectItem>
                                                    <SelectItem value="netflix_red">Netflix Crimson Red</SelectItem>
                                                    <SelectItem value="emerald_green">Emerald Forest Green</SelectItem>
                                                    <SelectItem value="golden_amber">Golden Amber Glow</SelectItem>
                                                    <SelectItem value="midnight_blue">Midnight Sapphire Blue</SelectItem>
                                                    <SelectItem value="slate_frosted">Slate Frosted Glass</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-slate-300">Banner Placement</Label>
                                            <Select 
                                                value={settings.placeholderBannerPosition ?? "top_banner"} 
                                                onValueChange={val => setSettings({ ...settings, placeholderBannerPosition: val })}
                                            >
                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="top_banner">Top Banner Full-Width</SelectItem>
                                                    <SelectItem value="bottom_banner">Bottom Banner Full-Width</SelectItem>
                                                    <SelectItem value="top_left_ribbon">Top-Left Angle Ribbon</SelectItem>
                                                    <SelectItem value="top_right_ribbon">Top-Right Angle Ribbon</SelectItem>
                                                    <SelectItem value="center_badge">Centered Floating Badge</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Isolated Coming Soon Pre-Release Shares */}
                    {servers.length > 0 && (
                        <Card className="bg-slate-900/80 border-slate-800 shadow-xl overflow-hidden">
                            <CardHeader className="p-4 pb-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-emerald-500/20 text-emerald-400 rounded-xl border border-emerald-500/30">
                                            <FolderCheck className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                                Dedicated Coming Soon Shares (Agregarr Storage Separation)
                                            </CardTitle>
                                            <CardDescription className="text-xs text-slate-400">
                                                Configure isolated storage share paths per server (e.g. Unraid <code className="text-purple-300">/mnt/user/coming_soon_main</code>) to keep pre-release dummy placeholders separated from real media libraries.
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button 
                                            size="sm"
                                            onClick={handleSaveShares}
                                            disabled={savingShares}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-emerald-950/40"
                                        >
                                            {savingShares ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                            <span>Save Share Paths</span>
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {servers.map(srv => {
                                        const shareKey = `share_${srv.serverId}`;
                                        const pathStatus = pathCheckResults[shareKey];
                                        return (
                                            <div key={srv.serverId} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                                                        <Server className="h-3.5 w-3.5 text-indigo-400" />
                                                        <span>{srv.serverName || "Plex Server"}</span>
                                                    </Label>
                                                    {srv.serverId === selectedServerId && (
                                                        <Badge className="text-[9px] bg-purple-600/80 px-1.5 py-0">Studio Selected</Badge>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <Input 
                                                            value={comingSoonShares[srv.serverId] || ""}
                                                            onChange={e => setComingSoonShares({ ...comingSoonShares, [srv.serverId]: e.target.value })}
                                                            placeholder={`e.g. /mnt/user/coming_soon_${(srv.serverName || "main").toLowerCase().replace(/\s+/g, "_")}`}
                                                            className="bg-slate-800/80 border-slate-700 text-xs h-8 font-mono flex-1"
                                                        />
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleCheckPath(shareKey, comingSoonShares[srv.serverId] || "")}
                                                            disabled={pathStatus?.checking || !comingSoonShares[srv.serverId]}
                                                            className="h-8 px-2 text-[11px] border-slate-700 hover:border-purple-500 shrink-0 gap-1"
                                                        >
                                                            {pathStatus?.checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderCheck className="h-3 w-3 text-purple-400" />}
                                                            <span>Test</span>
                                                        </Button>
                                                    </div>
                                                    {pathStatus && (
                                                        <div className={`text-[10px] p-1.5 rounded-md flex items-center gap-1.5 ${pathStatus.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50' : 'bg-rose-950/60 text-rose-300 border border-rose-800/50'}`}>
                                                            {pathStatus.success ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                                                            <span className="truncate">{pathStatus.msg}</span>
                                                        </div>
                                                    )}
                                                    <p className="text-[10px] text-slate-500">
                                                        Share path for <span className="text-slate-400">{srv.serverName}</span> dummy stubs
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-800/60">
                                    <div className="flex items-center gap-1.5">
                                        <HardDrive className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                                        <span>Multi-server remote Unraid arrays maintain completely isolated placeholder shares with 0% risk to production movie files.</span>
                                    </div>
                                    {sharesSavedMsg && (
                                        <span className="text-emerald-400 font-semibold animate-pulse">✓ Share paths saved successfully!</span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Theatrical vs Digital Releases Calendar */}
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
                {/* TAB 5: LEAVING SOON & PLEX HOME HUB PRUNING MANAGER */}
                {/* ========================================================================= */}
                <TabsContent value="pruning" className="space-y-6">
                    {/* Plex Home Screen Leaving Soon Priority Hub Deck */}
                    <Card className="bg-slate-900/80 border-slate-800 shadow-xl overflow-hidden">
                        <CardHeader className="p-5 pb-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
                                            <Home className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                                Plex Home Screen & Leaving Soon Priority Hub
                                            </CardTitle>
                                            <CardDescription className="text-xs text-slate-400">
                                                Automatically position the &quot;⚠️ Leaving Soon&quot; collection at the top of your users&apos; Plex Home Screen to maximize viewer awareness before pruning.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button 
                                        size="sm"
                                        onClick={handleSyncLeavingSoonHub}
                                        disabled={syncingLeavingSoonHub}
                                        className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-rose-950/40"
                                    >
                                        {syncingLeavingSoonHub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                        <span>Sync Leaving Soon Hub to Plex</span>
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-5 space-y-4 text-xs">
                            {leavingSoonHubMsg && (
                                <div className={`p-2.5 rounded-xl text-xs flex items-center gap-2 ${leavingSoonHubMsg.success ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300' : 'bg-rose-950/70 border border-rose-800 text-rose-300'}`}>
                                    {leavingSoonHubMsg.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                    <span>{leavingSoonHubMsg.text}</span>
                                </div>
                            )}

                            {/* Multi-Server Pruning Target Routing */}
                            {servers.length > 1 && (
                                <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
                                    <div className="space-y-0.5">
                                        <div className="flex items-center gap-1.5 font-bold text-rose-300">
                                            <Server className="h-3.5 w-3.5" />
                                            <span>Automated Pruning Server Targets</span>
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                            Select which Plex servers participate in automated capacity evaluation & Leaving Soon disk pruning:
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {servers.map(srv => {
                                            const isEnabled = (settings.enabledServersForPruning ?? servers.map(s => s.serverId)).includes(srv.serverId);
                                            return (
                                                <button
                                                    key={srv.serverId}
                                                    type="button"
                                                    onClick={() => handleToggleServerTarget(srv.serverId, "pruning", !isEnabled)}
                                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                                                        isEnabled 
                                                            ? 'bg-rose-950/50 border-rose-500/50 text-rose-200 shadow-sm'
                                                            : 'bg-slate-900/60 border-slate-800 text-slate-500 hover:text-slate-400'
                                                    }`}
                                                >
                                                    <span className={`w-2 h-2 rounded-full ${isEnabled ? 'bg-rose-400 shadow-sm shadow-rose-400/50' : 'bg-slate-600'}`} />
                                                    <span>{srv.serverName}</span>
                                                    <span className="text-[10px] opacity-75 font-normal">
                                                        {isEnabled ? '✓ Pruning Enabled' : '🛡️ Protected'}
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white">Promote to Home Screen</Label>
                                        <p className="text-[10px] text-slate-400">Show Leaving Soon on user home</p>
                                    </div>
                                    <Switch 
                                        checked={settings.leavingSoonPromotedToHome ?? true}
                                        onCheckedChange={checked => setSettings({ ...settings, leavingSoonPromotedToHome: checked })}
                                    />
                                </div>

                                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white">Promote to Shared Home</Label>
                                        <p className="text-[10px] text-slate-400">Display on friend/family home</p>
                                    </div>
                                    <Switch 
                                        checked={settings.leavingSoonPromotedToSharedHome ?? true}
                                        onCheckedChange={checked => setSettings({ ...settings, leavingSoonPromotedToSharedHome: checked })}
                                    />
                                </div>

                                <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white">Auto-Hide When Empty</Label>
                                        <p className="text-[10px] text-slate-400">Hide hub when 0 items leaving</p>
                                    </div>
                                    <Switch 
                                        checked={settings.leavingSoonAutoHideEmpty ?? true}
                                        onCheckedChange={checked => setSettings({ ...settings, leavingSoonAutoHideEmpty: checked })}
                                    />
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Server Storage Mount & Physical Disk Paths Configuration */}
                    {servers.length > 0 && (
                        <Card className="bg-slate-900/70 border-slate-800 shadow-md">
                            <CardHeader className="p-4 pb-2">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-indigo-400">
                                            <HardDrive className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                                Server Storage Mount & Disk Paths
                                            </CardTitle>
                                            <CardDescription className="text-xs text-slate-400">
                                                Configure physical media disk mount paths (e.g. <code className="text-indigo-300">/mnt/user/data/media</code> or <code className="text-indigo-300">D:\PlexMedia</code>) per server for physical array capacity analysis.
                                            </CardDescription>
                                        </div>
                                    </div>
                                    <Button 
                                        size="sm"
                                        onClick={handleSaveStorageConfig}
                                        disabled={savingStorageConfig}
                                        className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-indigo-950/40"
                                    >
                                        {savingStorageConfig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                        <span>Save Storage Paths</span>
                                    </Button>
                                </div>
                            </CardHeader>
                            <CardContent className="p-4 space-y-3 text-xs">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {servers.map(srv => {
                                        const storageKey = `storage_${srv.serverId}`;
                                        const pathStatus = pathCheckResults[storageKey];
                                        return (
                                            <div key={srv.serverId} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <Label className="font-bold text-slate-200 text-xs flex items-center gap-1.5">
                                                        <Server className="h-3.5 w-3.5 text-indigo-400" />
                                                        <span>{srv.serverName || "Plex Server"}</span>
                                                    </Label>
                                                    {srv.serverId === selectedServerId && (
                                                        <Badge className="text-[9px] bg-purple-600/80 px-1.5 py-0">Studio Selected</Badge>
                                                    )}
                                                </div>
                                                <div className="space-y-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <Input 
                                                            value={serverStorageConfig[srv.serverId] || ""}
                                                            onChange={e => setServerStorageConfig({ ...serverStorageConfig, [srv.serverId]: e.target.value })}
                                                            placeholder={`e.g. /mnt/user/media_${(srv.serverName || "main").toLowerCase().replace(/\s+/g, "_")}`}
                                                            className="bg-slate-800/80 border-slate-700 text-xs h-8 font-mono flex-1"
                                                        />
                                                        <Button
                                                            type="button"
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleCheckPath(storageKey, serverStorageConfig[srv.serverId] || "")}
                                                            disabled={pathStatus?.checking || !serverStorageConfig[srv.serverId]}
                                                            className="h-8 px-2 text-[11px] border-slate-700 hover:border-indigo-500 shrink-0 gap-1"
                                                        >
                                                            {pathStatus?.checking ? <Loader2 className="h-3 w-3 animate-spin" /> : <FolderCheck className="h-3 w-3 text-indigo-400" />}
                                                            <span>Test</span>
                                                        </Button>
                                                    </div>
                                                    {pathStatus && (
                                                        <div className={`text-[10px] p-1.5 rounded-md flex items-center gap-1.5 ${pathStatus.success ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/50' : 'bg-rose-950/60 text-rose-300 border border-rose-800/50'}`}>
                                                            {pathStatus.success ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <XCircle className="h-3 w-3 shrink-0" />}
                                                            <span className="truncate">{pathStatus.msg}</span>
                                                        </div>
                                                    )}
                                                    <p className="text-[10px] text-slate-500">
                                                        Physical storage directory for <span className="text-slate-400">{srv.serverName}</span>
                                                    </p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                {storageConfigSavedMsg && (
                                    <div className="text-emerald-400 text-xs font-semibold animate-pulse pt-1 border-t border-slate-800/60">
                                        ✓ Server storage mount paths saved successfully!
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Master Safety Switch & Control Deck */}
                    <Card className="bg-slate-900/80 border-slate-800 shadow-xl overflow-hidden">
                        <CardHeader className="p-5 pb-3 border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5">
                                        <div className="p-2 bg-rose-500/20 text-rose-400 rounded-xl border border-rose-500/30">
                                            <HardDrive className="h-5 w-5" />
                                        </div>
                                        <div>
                                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                                Multi-Library Array Capacity & Oldest Media Pruner
                                            </CardTitle>
                                            <CardDescription className="text-xs text-slate-400">
                                                Intelligent automated discovery of oldest and unwatched media across multiple servers with dry-run safety locks.
                                            </CardDescription>
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3 bg-slate-800/80 px-3 py-2 rounded-xl border border-slate-700">
                                    <div className="text-right">
                                        <div className="text-xs font-bold text-white flex items-center gap-1.5 justify-end">
                                            <Power className="h-3.5 w-3.5 text-rose-400" />
                                            <span>Pruning Master Switch</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400">
                                            {settings.enableAutoPruneDeletion ? "🔴 Auto-Prune Active" : "🟢 Safety Protected (OFF)"}
                                        </p>
                                    </div>
                                    <Switch 
                                        checked={Boolean(settings.enableAutoPruneDeletion)}
                                        onCheckedChange={checked => setSettings({ ...settings, enableAutoPruneDeletion: checked })}
                                    />
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-5 space-y-6 text-xs">
                            {/* Granular Action Switches & Pruning Mode */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white flex items-center gap-1.5">
                                            <TestTube className="h-3.5 w-3.5 text-sky-400" /> Dry-Run Simulation
                                        </Label>
                                        <p className="text-[10px] text-slate-400">Stage & preview without deleting</p>
                                    </div>
                                    <Switch 
                                        checked={settings.pruneDryRun ?? true}
                                        onCheckedChange={checked => setSettings({ ...settings, pruneDryRun: checked })}
                                    />
                                </div>

                                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white flex items-center gap-1.5">
                                            <Layers className="h-3.5 w-3.5 text-amber-400" /> Plex Collection Tag
                                        </Label>
                                        <p className="text-[10px] text-slate-400">Add to &quot;⚠️ Leaving Soon&quot; collection</p>
                                    </div>
                                    <Switch 
                                        checked={settings.pruneTagCollection ?? true}
                                        onCheckedChange={checked => setSettings({ ...settings, pruneTagCollection: checked })}
                                    />
                                </div>

                                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white flex items-center gap-1.5">
                                            <Sparkles className="h-3.5 w-3.5 text-purple-400" /> Warning Overlays
                                        </Label>
                                        <p className="text-[10px] text-slate-400">Apply Leaving Soon poster ribbons</p>
                                    </div>
                                    <Switch 
                                        checked={settings.pruneApplyOverlays ?? true}
                                        onCheckedChange={checked => setSettings({ ...settings, pruneApplyOverlays: checked })}
                                    />
                                </div>

                                <div className="p-3 bg-slate-800/60 rounded-xl border border-slate-700/60 flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white flex items-center gap-1.5">
                                            <Trash2 className="h-3.5 w-3.5 text-rose-400" /> Radarr / Sonarr / Disk
                                        </Label>
                                        <p className="text-[10px] text-slate-400">Unmonitor & delete physical files</p>
                                    </div>
                                    <Switch 
                                        checked={Boolean(settings.pruneDeleteFromArr || settings.pruneDeleteFromDisk)}
                                        onCheckedChange={checked => setSettings({ 
                                            ...settings, 
                                            pruneDeleteFromArr: checked,
                                            pruneDeleteFromDisk: checked
                                        })}
                                    />
                                </div>
                            </div>

                            {/* Pruning Criteria Parameters */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-slate-950/60 border border-slate-800 rounded-xl">
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300">Free Space Trigger Threshold</Label>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            type="number" 
                                            value={settings.leavingSoonDiskThreshold ?? 15} 
                                            onChange={e => setSettings({ ...settings, leavingSoonDiskThreshold: parseInt(e.target.value, 10) || 15 })}
                                            className="bg-slate-800 border-slate-700 text-xs h-8 w-20" 
                                        />
                                        <span className="text-slate-400">% free space</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-slate-300">Advance Notice Grace Period</Label>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            type="number" 
                                            value={settings.pruneDaysNotice ?? 14} 
                                            onChange={e => setSettings({ ...settings, pruneDaysNotice: parseInt(e.target.value, 10) || 14 })}
                                            className="bg-slate-800 border-slate-700 text-xs h-8 w-20" 
                                        />
                                        <span className="text-slate-400">days notice</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-slate-300">Minimum Age in Library</Label>
                                    <div className="flex items-center gap-2">
                                        <Input 
                                            type="number" 
                                            value={settings.pruneMinAgeDays ?? 90} 
                                            onChange={e => setSettings({ ...settings, pruneMinAgeDays: parseInt(e.target.value, 10) || 90 })}
                                            className="bg-slate-800 border-slate-700 text-xs h-8 w-20" 
                                        />
                                        <span className="text-slate-400">days minimum</span>
                                    </div>
                                </div>

                                <div className="space-y-1.5 flex flex-col justify-center">
                                    <Label className="text-slate-300">Unwatched / Stale Only</Label>
                                    <div className="flex items-center gap-2 pt-1">
                                        <Switch 
                                            checked={settings.pruneUnwatchedOnly ?? true}
                                            onCheckedChange={checked => setSettings({ ...settings, pruneUnwatchedOnly: checked })}
                                        />
                                        <span className="text-slate-400">{settings.pruneUnwatchedOnly ? "0 plays or >180d unwatched" : "All media"}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Action Buttons: Run Simulation & Save */}
                            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button 
                                        onClick={() => handleRunPruneSimulation(selectedServerId)}
                                        disabled={simulatingPrune}
                                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-9 px-4 gap-2 shadow-lg shadow-purple-950/40"
                                    >
                                        {simulatingPrune ? <Loader2 className="h-4 w-4 animate-spin" /> : <TestTube className="h-4 w-4" />}
                                        <span>🧪 Run Prune Simulation (Dry Run)</span>
                                    </Button>

                                    <Button 
                                        variant="outline"
                                        onClick={() => handleClearAllLeavingSoon(selectedServerId)}
                                        disabled={clearingFlags}
                                        className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold text-xs h-9 gap-1.5"
                                    >
                                        {clearingFlags ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4 text-emerald-400" />}
                                        <span>🧹 Clear All Flags & Restore Posters</span>
                                    </Button>
                                </div>

                                <Button 
                                    onClick={async () => {
                                        await saveCurationSettingsAction(settings);
                                        alert("Pruning configuration saved successfully!");
                                    }}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-9 px-4 gap-1.5"
                                >
                                    <Check className="h-4 w-4" /> Save Pruning Settings
                                </Button>
                            </div>

                            {clearFlagsMsg && (
                                <div className="p-3 bg-emerald-950/60 border border-emerald-800 text-emerald-300 rounded-xl text-xs flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                                    <span>{clearFlagsMsg}</span>
                                </div>
                            )}

                            {pruneExecMessage && (
                                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${pruneExecMessage.success ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border border-rose-800 text-rose-300'}`}>
                                    {pruneExecMessage.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                    <span>{pruneExecMessage.text}</span>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Interactive Simulation Results & Candidate Sandbox */}
                    {pruneSimResults && (
                        <Card className="bg-slate-900/70 border-slate-800 shadow-xl">
                            <CardHeader className="p-4 pb-2 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div>
                                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                        <TestTube className="h-4 w-4 text-purple-400" /> Simulation Preview — {pruneSimResults.candidates.length} Prune Candidates
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Evaluated {pruneSimResults.evaluatedCount} items across {pruneSimResults.serversEvaluated?.length || 1} servers. Total Recoverable Capacity: <strong className="text-emerald-400">{pruneSimResults.totalRecoverableGb} GB</strong>
                                    </CardDescription>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Button 
                                        size="sm" 
                                        disabled={executingPrune || pruneSimResults.candidates.length === 0}
                                        onClick={() => handleExecutePrune(pruneSimResults.candidates, false)}
                                        className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-8 px-3 gap-1.5"
                                    >
                                        {executingPrune ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                                        <span>Stage All ({settings.pruneDaysNotice || 14}-Day Notice)</span>
                                    </Button>

                                    {settings.enableAutoPruneDeletion && (
                                        <Button 
                                            size="sm" 
                                            disabled={executingPrune || pruneSimResults.candidates.length === 0}
                                            onClick={() => handleExecutePrune(pruneSimResults.candidates, true)}
                                            className="bg-rose-700 hover:bg-rose-600 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-lg shadow-rose-950/40"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                            <span>⚡ Force Live Delete ({pruneSimResults.candidates.length})</span>
                                        </Button>
                                    )}
                                </div>
                            </CardHeader>

                            <CardContent className="p-4">
                                {pruneSimResults.candidates.length === 0 ? (
                                    <div className="text-center py-10 text-slate-400 text-xs">
                                        🎉 No candidates found matching pruning criteria! Your library is active and storage is healthy.
                                    </div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-xs text-left">
                                            <thead>
                                                <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                                                    <th className="py-2.5 px-3">Title & Year</th>
                                                    <th className="py-2.5 px-3">Server</th>
                                                    <th className="py-2.5 px-3">Library</th>
                                                    <th className="py-2.5 px-3 text-right">Size (GB)</th>
                                                    <th className="py-2.5 px-3">Age in Library</th>
                                                    <th className="py-2.5 px-3">View History</th>
                                                    <th className="py-2.5 px-3 text-right">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/60">
                                                {pruneSimResults.candidates.map((cand: any) => (
                                                    <tr key={`${cand.serverId}-${cand.ratingKey}`} className="hover:bg-slate-800/40 transition-colors">
                                                        <td className="py-2 px-3 font-semibold text-white">
                                                            <div className="flex items-center gap-2">
                                                                <Film className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                                                                <span className="truncate max-w-[220px]">{cand.title}</span>
                                                                {cand.year && <span className="text-slate-500 text-[11px]">({cand.year})</span>}
                                                            </div>
                                                        </td>
                                                        <td className="py-2 px-3">
                                                            <Badge variant="outline" className="text-[10px] border-slate-700 text-slate-300">
                                                                {cand.serverName || "Server"}
                                                            </Badge>
                                                        </td>
                                                        <td className="py-2 px-3 text-slate-400 text-[11px]">{cand.sectionTitle || cand.sectionKey}</td>
                                                        <td className="py-2 px-3 text-right font-mono font-bold text-amber-300">{cand.fileSizeGb.toFixed(1)} GB</td>
                                                        <td className="py-2 px-3 text-slate-400 text-[11px]">{cand.daysOld} days ago</td>
                                                        <td className="py-2 px-3 text-slate-400 text-[11px]">{cand.reason}</td>
                                                        <td className="py-2 px-3 text-right">
                                                            <div className="flex items-center justify-end gap-1.5">
                                                                <Button 
                                                                    size="sm" 
                                                                    variant="outline"
                                                                    onClick={() => handleExecutePrune([cand], false)}
                                                                    className="h-6 px-2 text-[10px] border-amber-500/40 text-amber-300 hover:bg-amber-950/40"
                                                                >
                                                                    Stage Notice
                                                                </Button>
                                                                {settings.enableAutoPruneDeletion && (
                                                                    <Button 
                                                                        size="sm" 
                                                                        variant="ghost"
                                                                        onClick={() => handleExecutePrune([cand], true)}
                                                                        className="h-6 px-2 text-[10px] text-rose-400 hover:bg-rose-950/50 hover:text-rose-300"
                                                                    >
                                                                        Delete
                                                                    </Button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}

                    {/* Active Leaving Soon Scheduled Queue */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Webhook & Remote Integration Card */}
                        <div className="lg:col-span-5 space-y-4">
                            <Card className="bg-slate-900/60 border-slate-800">
                                <CardHeader className="p-4 pb-2">
                                    <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                                        <HardDrive className="h-4 w-4 text-rose-400" /> Pruning Webhook & Remote Scripts
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Integrate Maintainerr, bash cron scripts, or remote Unraid array cleanup hooks.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 space-y-3 text-xs">
                                    <div className="space-y-1">
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
                                            Send POST JSON with <code>{`{ "ratingKey": "1234", "daysRemaining": 14, "reason": "Low storage" }`}</code>
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
                                            <AlertTriangle className="h-4 w-4 text-amber-400" /> Currently Scheduled for Removal ({leavingSoonItems.length})
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
                {/* TAB 6: PERSONAL CONTENT FILTERS & PARENTAL CONTROLS */}
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

                    {/* IMDb Parental Guide Ratings Tagging Engine */}
                    <Card className="bg-slate-900/60 border-slate-800 shadow-xl overflow-hidden">
                        <CardHeader className="p-6 pb-2">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                        <Shield className="h-5 w-5 text-amber-400" /> IMDb Parental Ratings Tagging Engine
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400 max-w-2xl">
                                        Scan your Plex movies and TV shows to automatically apply consensus IMDb Parents Guide severity ratings (Severe, Moderate, Mild, None). Use Plex Labels to seamlessly restrict mature or violent content for Kids & Family managed accounts.
                                    </CardDescription>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Switch 
                                        checked={parentalTaggingEnabled}
                                        onCheckedChange={setParentalTaggingEnabled}
                                    />
                                    <span className="text-xs font-semibold text-slate-300">
                                        {parentalTaggingEnabled ? "Enabled" : "Disabled"}
                                    </span>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-6 space-y-6 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                                {/* Format Template */}
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 font-semibold">Tag Format Style</Label>
                                    <Select 
                                        value={parentalTagFormat} 
                                        onValueChange={setParentalTagFormat}
                                    >
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="prefix_category_severity">Prefix-Category: Severity (IMDb-Violence: Severe)</SelectItem>
                                            <SelectItem value="severity_category">Severity Category (Severe Violence)</SelectItem>
                                            <SelectItem value="category_severity_paren">Category (Severity) (Violence (Severe))</SelectItem>
                                            <SelectItem value="custom">Prefix: Category - Severity (IMDb: Violence - Severe)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Custom Prefix */}
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 font-semibold">Tag Prefix</Label>
                                    <Input 
                                        value={parentalTagPrefix}
                                        onChange={e => setParentalTagPrefix(e.target.value)}
                                        placeholder="IMDb"
                                        className="bg-slate-800 border-slate-700 text-xs"
                                    />
                                    <p className="text-[10px] text-slate-500">Used to identify & clear tags cleanly</p>
                                </div>

                                {/* Target Field in Plex */}
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 font-semibold">Plex Target Field</Label>
                                    <Select 
                                        value={parentalTagTarget} 
                                        onValueChange={setParentalTagTarget}
                                    >
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="labels">🏷️ Plex Labels (Best for Kids / Sharing Restrictions)</SelectItem>
                                            <SelectItem value="genres">🎭 Plex Genres</SelectItem>
                                            <SelectItem value="both">🏷️🎭 Both Labels & Genres</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Minimum Severity Threshold */}
                                <div className="space-y-1.5">
                                    <Label className="text-slate-300 font-semibold">Minimum Severity to Tag</Label>
                                    <Select 
                                        value={parentalMinSeverity} 
                                        onValueChange={setParentalMinSeverity}
                                    >
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Severe">🔴 Severe Only (Extreme Content)</SelectItem>
                                            <SelectItem value="Moderate">🟠 Moderate & Severe</SelectItem>
                                            <SelectItem value="Mild">🟡 Mild, Moderate & Severe</SelectItem>
                                            <SelectItem value="None">⚪ All Levels (Including None)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {/* Categories Selector */}
                            <div className="space-y-2">
                                <Label className="text-slate-300 font-semibold block">Advisory Categories to Evaluate & Tag</Label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                                    {[
                                        { key: "nudity", label: "Sex & Nudity", icon: "🔞", desc: "Sexual scenes, nudity" },
                                        { key: "violence", label: "Violence & Gore", icon: "🩸", desc: "Physical violence, gore" },
                                        { key: "profanity", label: "Profanity", icon: "🤬", desc: "Strong language, slurs" },
                                        { key: "alcohol", label: "Alcohol & Drugs", icon: "🍷", desc: "Substance & drug use" },
                                        { key: "frightening", label: "Frightening", icon: "😱", desc: "Horror, intense scenes" }
                                    ].map(cat => {
                                        const isChecked = parentalCategories.includes(cat.key);
                                        return (
                                            <div 
                                                key={cat.key}
                                                onClick={() => {
                                                    if (isChecked) {
                                                        setParentalCategories(parentalCategories.filter(k => k !== cat.key));
                                                    } else {
                                                        setParentalCategories([...parentalCategories, cat.key]);
                                                    }
                                                }}
                                                className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start justify-between ${
                                                    isChecked 
                                                        ? 'bg-amber-950/40 border-amber-500/50 text-white' 
                                                        : 'bg-slate-800/40 border-slate-800 text-slate-400 hover:border-slate-700'
                                                }`}
                                            >
                                                <div className="space-y-0.5">
                                                    <span className="font-bold text-xs flex items-center gap-1.5">
                                                        <span>{cat.icon}</span> {cat.label}
                                                    </span>
                                                    <p className="text-[10px] opacity-70">{cat.desc}</p>
                                                </div>
                                                <input 
                                                    type="checkbox" 
                                                    checked={isChecked} 
                                                    readOnly 
                                                    className="rounded border-slate-700 text-amber-500 focus:ring-0 h-4 w-4 mt-0.5" 
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Tag Preview Box */}
                            <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                    Sample Generated Tag Output Preview:
                                </span>
                                <div className="flex flex-wrap gap-2">
                                    {parentalCategories.map(cat => {
                                        let sample = `${parentalTagPrefix}-${cat.charAt(0).toUpperCase() + cat.slice(1)}: Severe`;
                                        if (parentalTagFormat === "severity_category") sample = `Severe ${cat.charAt(0).toUpperCase() + cat.slice(1)}`;
                                        if (parentalTagFormat === "category_severity_paren") sample = `${cat.charAt(0).toUpperCase() + cat.slice(1)} (Severe)`;
                                        if (parentalTagFormat === "custom") sample = `${parentalTagPrefix}: ${cat.charAt(0).toUpperCase() + cat.slice(1)} - Severe`;
                                        return (
                                            <Badge key={cat} variant="secondary" className="bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono text-[11px] px-2 py-0.5">
                                                {sample}
                                            </Badge>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Status and Action Buttons */}
                            {parentalTagMsg && (
                                <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                                    parentalTagMsg.success 
                                        ? 'bg-emerald-950/70 border border-emerald-800 text-emerald-300' 
                                        : 'bg-rose-950/70 border border-rose-800 text-rose-300'
                                }`}>
                                    {parentalTagMsg.success ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <XCircle className="h-4 w-4 shrink-0" />}
                                    <span>{parentalTagMsg.text}</span>
                                </div>
                            )}

                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button 
                                        onClick={handleApplyParentalTags}
                                        disabled={applyingParentalTags}
                                        className="bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs h-9 px-4 gap-2 shadow-lg shadow-amber-950/40"
                                    >
                                        {applyingParentalTags ? <Loader2 className="h-4 w-4 animate-spin" /> : <Tag className="h-4 w-4" />}
                                        <span>🏷️ Scan & Apply Tags to Library</span>
                                    </Button>

                                    <Button 
                                        variant="outline"
                                        onClick={handleClearParentalTags}
                                        disabled={clearingParentalTags}
                                        className="border-slate-700 text-slate-300 hover:text-white hover:bg-slate-800 font-semibold text-xs h-9 gap-1.5"
                                    >
                                        {clearingParentalTags ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4 text-rose-400" />}
                                        <span>🧹 Clear Parental Tags from Library</span>
                                    </Button>
                                </div>

                                <Button 
                                    onClick={handleSaveParentalSettings}
                                    disabled={savingParentalSettings}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-9 px-4 gap-1.5"
                                >
                                    {savingParentalSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                    <span>Save Parental Settings</span>
                                </Button>
                            </div>

                            {parentalTagsSavedMsg && (
                                <div className="text-xs text-emerald-400 flex items-center gap-1.5 justify-end">
                                    <CheckCircle2 className="h-4 w-4" /> Parental tagging settings saved successfully!
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Seasonal Collection Schedule Modal */}
            <Dialog open={seasonalModalOpen} onOpenChange={setSeasonalModalOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-md">
                    {editingColl && (
                        <div className="space-y-4">
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <CalendarClock className="h-5 w-5 text-amber-400" /> Seasonal Schedule: {editingColl.title}
                                </DialogTitle>
                                <DialogDescription className="text-slate-400 text-xs">
                                    Set annual active date range for automated promotion on Plex Home.
                                </DialogDescription>
                            </DialogHeader>

                            <div className="space-y-3 py-2 text-xs">
                                <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                    <div className="space-y-0.5">
                                        <Label className="font-semibold text-white">Enable Seasonal Schedule</Label>
                                        <p className="text-[10px] text-slate-400">Auto promote/demote on dates</p>
                                    </div>
                                    <Switch 
                                        checked={editingColl.isSeasonal}
                                        onCheckedChange={checked => setEditingColl({ ...editingColl, isSeasonal: checked })}
                                    />
                                </div>

                                {editingColl.isSeasonal && (
                                    <>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label>Start Date (MM / DD)</Label>
                                                <div className="flex items-center gap-1">
                                                    <Input 
                                                        type="number" min={1} max={12} 
                                                        value={editingColl.scheduleStartMonth || 10} 
                                                        onChange={e => setEditingColl({ ...editingColl, scheduleStartMonth: parseInt(e.target.value, 10) || 1 })}
                                                        className="bg-slate-800 border-slate-700 text-xs" 
                                                        placeholder="Month"
                                                    />
                                                    <Input 
                                                        type="number" min={1} max={31} 
                                                        value={editingColl.scheduleStartDay || 1} 
                                                        onChange={e => setEditingColl({ ...editingColl, scheduleStartDay: parseInt(e.target.value, 10) || 1 })}
                                                        className="bg-slate-800 border-slate-700 text-xs" 
                                                        placeholder="Day"
                                                    />
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <Label>End Date (MM / DD)</Label>
                                                <div className="flex items-center gap-1">
                                                    <Input 
                                                        type="number" min={1} max={12} 
                                                        value={editingColl.scheduleEndMonth || 11} 
                                                        onChange={e => setEditingColl({ ...editingColl, scheduleEndMonth: parseInt(e.target.value, 10) || 12 })}
                                                        className="bg-slate-800 border-slate-700 text-xs" 
                                                        placeholder="Month"
                                                    />
                                                    <Input 
                                                        type="number" min={1} max={31} 
                                                        value={editingColl.scheduleEndDay || 5} 
                                                        onChange={e => setEditingColl({ ...editingColl, scheduleEndDay: parseInt(e.target.value, 10) || 31 })}
                                                        className="bg-slate-800 border-slate-700 text-xs" 
                                                        placeholder="Day"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-1">
                                            <Label>Action When Inactive / Out of Season</Label>
                                            <Select 
                                                value={editingColl.seasonalAction || "promote_hide"} 
                                                onValueChange={val => setEditingColl({ ...editingColl, seasonalAction: val })}
                                            >
                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="promote_hide">Hide from Plex Home & Recommended</SelectItem>
                                                    <SelectItem value="demote_only">Demote from Home (Keep in Library)</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </>
                                )}
                            </div>

                            <DialogFooter>
                                <Button type="button" variant="outline" size="sm" onClick={() => setSeasonalModalOpen(false)}>Cancel</Button>
                                <Button type="button" size="sm" onClick={handleSaveSeasonalSchedule} className="bg-amber-600 hover:bg-amber-500 text-white">Save Schedule</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Preset Blueprint & Media Inspection Modal */}
            <Dialog open={inspectModalOpen} onOpenChange={setInspectModalOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-3xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
                    {inspectingPreset && (
                        <div className="flex flex-col space-y-4 h-full overflow-hidden">
                            <DialogHeader className="pb-2 border-b border-slate-800">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="space-y-1">
                                        <DialogTitle className="flex items-center gap-2 text-lg text-white">
                                            <Search className="h-5 w-5 text-cyan-400" />
                                            <span>Blueprint: {inspectingPreset.title}</span>
                                        </DialogTitle>
                                        <DialogDescription className="text-slate-400 text-xs">
                                            {inspectingPreset.description}
                                        </DialogDescription>
                                    </div>
                                    <Badge variant="outline" className="bg-slate-800/80 text-cyan-300 border-cyan-500/30 text-xs">
                                        {inspectingPreset.category}
                                    </Badge>
                                </div>
                            </DialogHeader>

                            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                                {/* Query Execution Blueprint Card */}
                                <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <FileText className="h-4 w-4 text-purple-400" />
                                            <span className="font-semibold text-slate-200">How This Collection Operates</span>
                                        </div>
                                        {getSourceBadge(inspectingPreset.sourceType, inspectingPreset.title, inspectingPreset.sourceQuery)}
                                    </div>
                                    
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
                                        <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                                            <div className="text-slate-400 text-[10px]">Source Provider</div>
                                            <div className="font-mono text-cyan-300 font-semibold uppercase">{inspectingPreset.sourceType}</div>
                                        </div>
                                        <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                                            <div className="text-slate-400 text-[10px]">Query / Parameter</div>
                                            <div className="font-mono text-purple-300 font-semibold truncate" title={inspectingPreset.sourceQuery}>{inspectingPreset.sourceQuery || "Smart Default"}</div>
                                        </div>
                                        <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                                            <div className="text-slate-400 text-[10px]">Home Slot Order</div>
                                            <div className="text-amber-300 font-semibold font-mono">Slot #{inspectingPreset.defaultHomeOrder ?? 1}</div>
                                        </div>
                                        <div className="bg-slate-900/90 p-2 rounded-lg border border-slate-800">
                                            <div className="text-slate-400 text-[10px]">Seasonal Routine</div>
                                            <div className="text-emerald-300 font-semibold">{inspectingPreset.isSeasonal ? `${inspectingPreset.scheduleStartMonth}/${inspectingPreset.scheduleStartDay} → ${inspectingPreset.scheduleEndMonth}/${inspectingPreset.scheduleEndDay}` : "Year-Round"}</div>
                                        </div>
                                    </div>

                                    {previewData?.executionMethod && (
                                        <div className="p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-800/40 text-cyan-200 text-[11px] leading-relaxed flex items-start gap-2">
                                            <Info className="h-4 w-4 text-cyan-400 shrink-0 mt-0.5" />
                                            <div>
                                                <span className="font-semibold text-cyan-300">Live Matching Logic: </span>
                                                {previewData.executionMethod}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Live Library Matching Preview */}
                                <div className="space-y-2.5">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Film className="h-4 w-4 text-amber-400" />
                                            <span className="font-semibold text-slate-200">Matching Items in Current Library</span>
                                            {previewLoading ? (
                                                <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" />
                                            ) : previewData ? (
                                                <Badge className="bg-emerald-950/60 text-emerald-300 border border-emerald-800 text-[10px]">
                                                    {previewData.matchCount} matched of {previewData.totalEvaluated} scanned
                                                </Badge>
                                            ) : null}
                                        </div>
                                    </div>

                                    {previewLoading ? (
                                        <div className="flex flex-col items-center justify-center p-8 bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-2">
                                            <Loader2 className="h-6 w-6 animate-spin text-purple-400" />
                                            <p className="text-xs text-slate-400">Inspecting Plex media library items & querying sources...</p>
                                        </div>
                                    ) : previewData?.sampleMatches && previewData.sampleMatches.length > 0 ? (
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                                            {previewData.sampleMatches.map((item: any, idx: number) => (
                                                <div key={item.ratingKey || idx} className="group relative bg-slate-950 rounded-lg border border-slate-800 overflow-hidden flex flex-col">
                                                    <div className="aspect-[2/3] w-full bg-slate-900 relative overflow-hidden flex items-center justify-center">
                                                        {item.thumb ? (
                                                            <img 
                                                                src={`/api/media/image?serverId=${selectedServerId}&thumb=${encodeURIComponent(item.thumb)}`} 
                                                                alt={item.title} 
                                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform" 
                                                                loading="lazy" 
                                                            />
                                                        ) : (
                                                            <Film className="h-8 w-8 text-slate-700" />
                                                        )}
                                                        {item.rating && (
                                                            <div className="absolute top-1 right-1 bg-black/80 backdrop-blur-md px-1 py-0.5 rounded text-[9px] font-bold text-amber-300 flex items-center gap-0.5 border border-amber-500/20">
                                                                <Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />
                                                                {item.rating.toFixed(1)}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <div className="p-1.5 flex flex-col justify-between flex-1 bg-slate-900/90">
                                                        <span className="font-semibold text-[11px] text-white line-clamp-1 group-hover:text-purple-300 transition-colors" title={item.title}>
                                                            {item.title}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400">
                                                            {item.year || "Unknown"}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="p-6 text-center bg-slate-950/40 border border-slate-800/80 rounded-xl space-y-1">
                                            <p className="text-slate-300 text-xs font-semibold">No matching media in the currently selected library section.</p>
                                            <p className="text-[11px] text-slate-500">Ensure this library section matches the content type (e.g. Movies for movie presets, TV for TV presets).</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <DialogFooter className="pt-2 border-t border-slate-800 flex items-center justify-between sm:justify-between w-full">
                                <Button 
                                    type="button"
                                    variant="outline" 
                                    size="sm" 
                                    onClick={() => {
                                        setInspectModalOpen(false);
                                        handleOpenEditPreset(inspectingPreset);
                                    }}
                                    className="bg-slate-800 hover:bg-slate-700 text-amber-300 border-amber-600/30 text-xs gap-1.5"
                                >
                                    <Edit2 className="h-3.5 w-3.5" />
                                    <span>Customize Blueprint</span>
                                </Button>
                                <div className="flex items-center gap-2">
                                    <Button type="button" variant="outline" size="sm" onClick={() => setInspectModalOpen(false)}>Close</Button>
                                    <Button 
                                        type="button"
                                        size="sm" 
                                        onClick={() => {
                                            setInspectModalOpen(false);
                                            handleSyncPreset(inspectingPreset);
                                        }}
                                        className="bg-purple-600 hover:bg-purple-500 text-white text-xs gap-1.5"
                                    >
                                        <Sparkles className="h-3.5 w-3.5" />
                                        <span>Sync to Plex</span>
                                    </Button>
                                </div>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Edit / Customize Collection Modal with Reset to Default */}
            <Dialog open={editPresetModalOpen} onOpenChange={setEditPresetModalOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-xl max-h-[85vh] flex flex-col p-6 overflow-hidden">
                    {editingPresetData && (
                        <div className="flex flex-col space-y-4 h-full overflow-hidden">
                            <DialogHeader className="pb-2 border-b border-slate-800">
                                <div className="flex items-center justify-between">
                                    <DialogTitle className="flex items-center gap-2 text-lg text-white">
                                        <Edit2 className="h-5 w-5 text-amber-400" />
                                        <span>Customize Collection: {editingPresetData.title}</span>
                                    </DialogTitle>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={handleResetPresetToDefault}
                                        className="bg-slate-800 hover:bg-rose-950/50 text-rose-300 hover:text-rose-200 border-rose-800/40 text-xs gap-1.5 h-7"
                                        title="Reset all settings to official preset defaults"
                                    >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                        <span>Reset to Default</span>
                                    </Button>
                                </div>
                                <DialogDescription className="text-slate-400 text-xs">
                                    Adjust query criteria, sort priority, home slot, and seasonal automation rules.
                                </DialogDescription>
                            </DialogHeader>

                            {resetDefaultSuccess && (
                                <div className="p-2.5 rounded-lg bg-emerald-950/60 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                    <span>Successfully restored all fields to preset factory default configuration.</span>
                                </div>
                            )}

                            <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs">
                                <div className="space-y-1.5">
                                    <Label className="font-semibold text-slate-200">Collection Title</Label>
                                    <Input 
                                        value={editingPresetData.title} 
                                        onChange={e => setEditingPresetData({ ...editingPresetData, title: e.target.value })}
                                        className="bg-slate-800 border-slate-700 text-xs" 
                                        placeholder="e.g. IMDb Top 250 Movies"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="font-semibold text-slate-200">Description / Summary</Label>
                                    <Textarea 
                                        rows={2}
                                        value={editingPresetData.summary} 
                                        onChange={e => setEditingPresetData({ ...editingPresetData, summary: e.target.value })}
                                        className="bg-slate-800 border-slate-700 text-xs resize-none" 
                                        placeholder="Collection summary displayed on Plex..."
                                    />
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="font-semibold text-slate-200">Source Provider</Label>
                                        <Select 
                                            value={editingPresetData.sourceType} 
                                            onValueChange={val => setEditingPresetData({ ...editingPresetData, sourceType: val })}
                                        >
                                            <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="mdblist">MDBList (Curated Top Lists)</SelectItem>
                                                <SelectItem value="tmdb">TMDb (Franchise Collection/Studio)</SelectItem>
                                                <SelectItem value="trakt">Trakt (Trending/Popular Lists)</SelectItem>
                                                <SelectItem value="plex_query">Plex Filter (Smart Search/Tag)</SelectItem>
                                                <SelectItem value="manual">Manual (Static Item Pinning)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="font-semibold text-slate-200">Source Query / Parameter</Label>
                                        <Input 
                                            value={editingPresetData.sourceQuery || ""} 
                                            onChange={e => setEditingPresetData({ ...editingPresetData, sourceQuery: e.target.value })}
                                            className="bg-slate-800 border-slate-700 text-xs font-mono" 
                                            placeholder="e.g. top-imdb-250, collection:86311"
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                        <Label className="font-semibold text-slate-200">Home Order Rank Slot</Label>
                                        <Input 
                                            type="number"
                                            min={1}
                                            max={99}
                                            value={editingPresetData.defaultHomeOrder ?? 1} 
                                            onChange={e => setEditingPresetData({ ...editingPresetData, defaultHomeOrder: parseInt(e.target.value, 10) || 1 })}
                                            className="bg-slate-800 border-slate-700 text-xs font-mono" 
                                            placeholder="1-99"
                                        />
                                    </div>

                                    <div className="space-y-1.5">
                                        <Label className="font-semibold text-slate-200">Sort Prefix Override</Label>
                                        <Input 
                                            value={editingPresetData.sortPrefix || ""} 
                                            onChange={e => setEditingPresetData({ ...editingPresetData, sortPrefix: e.target.value })}
                                            className="bg-slate-800 border-slate-700 text-xs font-mono" 
                                            placeholder="e.g. !01_, !02_"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="font-semibold text-slate-200">Custom Poster URL (Optional)</Label>
                                    <Input 
                                        value={editingPresetData.posterUrl || ""} 
                                        onChange={e => setEditingPresetData({ ...editingPresetData, posterUrl: e.target.value })}
                                        className="bg-slate-800 border-slate-700 text-xs" 
                                        placeholder="https://image.tmdb.org/... or direct image link"
                                    />
                                </div>

                                {/* Seasonal Rules */}
                                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <div className="space-y-0.5">
                                            <Label className="font-semibold text-slate-200">Seasonal Schedule</Label>
                                            <p className="text-[10px] text-slate-400">Automate promotion during specific times of the year</p>
                                        </div>
                                        <Switch 
                                            checked={editingPresetData.isSeasonal}
                                            onCheckedChange={checked => setEditingPresetData({ ...editingPresetData, isSeasonal: checked })}
                                        />
                                    </div>

                                    {editingPresetData.isSeasonal && (
                                        <div className="space-y-3 pt-2 border-t border-slate-800/80">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-slate-400">Start Date (MM / DD)</Label>
                                                    <div className="flex items-center gap-1">
                                                        <Input 
                                                            type="number" min={1} max={12} 
                                                            value={editingPresetData.scheduleStartMonth || 10} 
                                                            onChange={e => setEditingPresetData({ ...editingPresetData, scheduleStartMonth: parseInt(e.target.value, 10) || 1 })}
                                                            className="bg-slate-800 border-slate-700 text-xs" 
                                                            placeholder="M"
                                                        />
                                                        <Input 
                                                            type="number" min={1} max={31} 
                                                            value={editingPresetData.scheduleStartDay || 1} 
                                                            onChange={e => setEditingPresetData({ ...editingPresetData, scheduleStartDay: parseInt(e.target.value, 10) || 1 })}
                                                            className="bg-slate-800 border-slate-700 text-xs" 
                                                            placeholder="D"
                                                        />
                                                    </div>
                                                </div>

                                                <div className="space-y-1">
                                                    <Label className="text-[10px] text-slate-400">End Date (MM / DD)</Label>
                                                    <div className="flex items-center gap-1">
                                                        <Input 
                                                            type="number" min={1} max={12} 
                                                            value={editingPresetData.scheduleEndMonth || 11} 
                                                            onChange={e => setEditingPresetData({ ...editingPresetData, scheduleEndMonth: parseInt(e.target.value, 10) || 12 })}
                                                            className="bg-slate-800 border-slate-700 text-xs" 
                                                            placeholder="M"
                                                        />
                                                        <Input 
                                                            type="number" min={1} max={31} 
                                                            value={editingPresetData.scheduleEndDay || 5} 
                                                            onChange={e => setEditingPresetData({ ...editingPresetData, scheduleEndDay: parseInt(e.target.value, 10) || 31 })}
                                                            className="bg-slate-800 border-slate-700 text-xs" 
                                                            placeholder="D"
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <Label className="text-[10px] text-slate-400">Action Out of Season</Label>
                                                <Select 
                                                    value={editingPresetData.seasonalAction || "promote_hide"} 
                                                    onValueChange={val => setEditingPresetData({ ...editingPresetData, seasonalAction: val })}
                                                >
                                                    <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="promote_hide">Hide from Plex Home & Recommended</SelectItem>
                                                        <SelectItem value="demote_only">Demote from Home (Keep in Library)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <DialogFooter className="pt-2 border-t border-slate-800 flex items-center justify-between sm:justify-between w-full">
                                <Button type="button" variant="outline" size="sm" onClick={() => setEditPresetModalOpen(false)}>Cancel</Button>
                                <Button 
                                    type="button"
                                    size="sm" 
                                    disabled={savingPresetEdit}
                                    onClick={handleSaveEditedPreset} 
                                    className="bg-purple-600 hover:bg-purple-500 text-white text-xs gap-1.5"
                                >
                                    {savingPresetEdit ? (
                                        <>
                                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                            <span>Saving & Syncing...</span>
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="h-3.5 w-3.5" />
                                            <span>Save & Sync Collection</span>
                                        </>
                                    )}
                                </Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
