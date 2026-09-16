"use client";

import React, { useState, useEffect } from "react";
import {
    Sparkles,
    Film,
    Tv,
    UploadCloud,
    DownloadCloud,
    Sliders,
    Eye,
    Save,
    RotateCcw,
    Check,
    X,
    FolderOpen,
    Loader2,
    Layers,
    Palette,
    Zap,
    Maximize2,
    CheckCircle2,
    XCircle,
    HardDrive,
    FileCode,
    RefreshCw,
    FolderCheck,
    Plus,
    Search,
    ChevronUp,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Trash2,
    ExternalLink,
    Clock,
    Clock3,
    Calendar,
    Power,
    ImageIcon,
    Shield,
    ShieldCheck,
    ShieldAlert,
    CheckSquare,
    Square,
    CheckCheck,
    AlertTriangle,
    BookOpen,
    HelpCircle
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
import { KometaOverlaysGuideModal } from "./kometa-overlays-guide-modal";
import { PlexMediaStreamInfo } from "@/lib/curation/plex-analyzer";
import {
    getPlexServersAndSectionsAction,
    getPlexServerSectionsAction,
    getOverlayRulesAction,
    saveOverlayRuleAction,
    applyOverlaysToLibraryAction,
    revertLibraryOverlaysAction,
    getCustomBadgesAction,
    saveCustomBadgeAction,
    deleteCustomBadgeAction,
    deleteMultipleCustomBadgesAction,
    deleteAllCustomBadgesAction,
    toggleMultipleCustomBadgesAction,
    toggleCustomBadgeAction,
    seedDefaultCustomBadgesAction,
    syncOfficialKometaBadgesAction,
    uploadCustomBadgeAction,
    downloadAllKometaPacksAction,
    readLocalKometaConfigAction,
    inspectKometaConfigFileAction,
    importKometaConfigAction,
    searchPlexLibraryItemsAction,
    inspectPlexMediaItemAction,
    applyOverlayToSingleItemAction,
    restoreSingleItemPosterAction,
    fetchGitHubBadgeRepoAction,
    importGitHubBadgesAction,
    getCurationSettingsAction,
    saveCurationSettingsAction,
    toggleCurationLibrarySectionAction,
    toggleAllCurationServerSectionsAction,
    runFullCurationSyncAction,
    runServerCurationSyncAction
} from "@/app/curation-actions";

interface PlexServerItem {
    serverId: string;
    serverName: string;
    sections?: Array<{ key: string | number; title: string; type: string }>;
}

interface CustomBadgeItem {
    id: string;
    name: string;
    category?: string;
    matchRule?: string | null;
    filePath?: string;
    fileType?: string;
    mimeType?: string;
    position?: string;
    width?: number;
    height?: number;
    opacity?: number;
    enabled?: boolean;
}

interface DiscoveredBadgeItem {
    id: string;
    name: string;
    category: string;
    downloadUrl: string;
    previewUrl: string;
    path: string;
    recommendedPosition?: string;
    inferredRule?: string;
}

interface BadgePresetPack {
    id: string;
    title: string;
    author: string;
    description: string;
    repoUrl: string;
    badgeCountEstimate: number;
    tags: string[];
    sampleBadges: string[];
}

const PRESET_BADGE_PACKS: BadgePresetPack[] = [
    {
        id: "kometa-default",
        title: "Kometa Community Default Pack",
        author: "jmxd / Kometa Community",
        description: "Official high-definition resolution pills, HDR10+, Dolby Vision icons, Dolby Atmos, IMAX, and streaming network logos.",
        repoUrl: "https://github.com/jmxd/Kometa/tree/main/overlays/images",
        badgeCountEstimate: 142,
        tags: ["Official", "4K", "HDR", "Audio", "Studios"],
        sampleBadges: ["4K UHD", "Dolby Vision", "Dolby Atmos", "IMAX Enhanced", "HBO Max", "Netflix"]
    },
    {
        id: "dovetail-glass",
        title: "Obsidian Dovetailed Resolution & HDR Pack",
        author: "Portalarr Studio",
        description: "Modern interlocking dovetailed badge series combining 4K UHD, 1080p FHD, Dolby Vision, and HDR10+ with frosted glass reflections.",
        repoUrl: "builtin://dovetail-glass",
        badgeCountEstimate: 36,
        tags: ["Dovetail", "Glass", "Obsidian", "4K", "HDR"],
        sampleBadges: ["4K • DOLBY VISION", "1080p • HDR10+", "4K UHD • HDR"]
    },
    {
        id: "streaming-studios",
        title: "Streaming Networks & Studio Logos",
        author: "Kometa Community",
        description: "Transparent high-resolution monochrome and color logos for Netflix, Disney+, Apple TV+, HBO Max, Prime Video, Hulu, Paramount+, and Peacock.",
        repoUrl: "https://github.com/jmxd/Kometa/tree/main/overlays/images/streaming",
        badgeCountEstimate: 48,
        tags: ["Studios", "Streaming", "Logos"],
        sampleBadges: ["Netflix", "Disney+", "Apple TV+", "HBO Max", "Prime Video"]
    },
    {
        id: "audio-codecs-surround",
        title: "Audiophile Codecs & Multi-Channel Surround",
        author: "Kometa Community",
        description: "Crisp studio audio overlays including Dolby Atmos, TrueHD, DTS:X, DTS-HD Master Audio, FLAC, 7.1 and 5.1 Surround channel badges.",
        repoUrl: "https://github.com/jmxd/Kometa/tree/main/overlays/images/audio",
        badgeCountEstimate: 32,
        tags: ["Audio", "Atmos", "DTS", "TrueHD", "Surround"],
        sampleBadges: ["Dolby Atmos", "DTS:X", "TrueHD 7.1", "DTS-HD MA 5.1"]
    }
];

export function KometaStudio() {
    // Server & Section Navigation
    const [servers, setServers] = useState<PlexServerItem[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>("");
    const [selectedSectionKey, setSelectedSectionKey] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [serverSectionsLoading, setServerSectionsLoading] = useState(false);

    // Overlay Rules & Custom Badges
    const [overlayRules, setOverlayRules] = useState<any[]>([]);
    const [customBadges, setCustomBadges] = useState<CustomBadgeItem[]>([]);
    const [savingOverlaySettings, setSavingOverlaySettings] = useState(false);
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
    const [simBadgeScale, setSimBadgeScale] = useState<number>(1.0);
    const DEFAULT_CATEGORY_SCALES: Record<string, number> = {
        resolution: 1.0,
        hdr: 1.0,
        codec: 1.0,
        audio: 1.0,
        channels: 1.0,
        edition: 1.0,
        studio: 1.0,
        contentRating: 1.0,
        ratings: 1.0,
        ribbon: 1.0
    };
    const [simCategoryScales, setSimCategoryScales] = useState<Record<string, number>>(DEFAULT_CATEGORY_SCALES);
    const setSimCategoryScale = (category: string, scale: number) => {
        setSimCategoryScales(prev => ({
            ...prev,
            [category]: Math.max(0.4, Math.min(2.0, Number(scale.toFixed(2))))
        }));
    };
    const [simTheme, setSimTheme] = useState<"glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson">("glass");
    const [seedingBadges, setSeedingBadges] = useState(false);
    const [syncingOfficialBadges, setSyncingOfficialBadges] = useState(false);
    const [simDovetailResolutionHdr, setSimDovetailResolutionHdr] = useState<boolean>(true);
    const [simPosterImage, setSimPosterImage] = useState<string>("https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80");
    const [posterPickerModalOpen, setPosterPickerModalOpen] = useState(false);
    const [simSelectedRealItem, setSimSelectedRealItem] = useState<PlexMediaStreamInfo | null>(null);

    // Batch Processing & Recheck Cadence States
    const [overlayBatchSize, setOverlayBatchSize] = useState<number>(200);
    const [overlayBatchMode, setOverlayBatchMode] = useState<"incremental" | "daily_recheck" | "weekly_recheck" | "monthly_recheck" | "force_all">("incremental");
    const [inspectorLimit, setInspectorLimit] = useState<number>(50);

    const handleSelectRealPoster = (item: PlexMediaStreamInfo, posterUrl: string) => {
        setSimPosterImage(posterUrl);
        setSimSelectedRealItem(item);

        const res = item.detectedBadges?.resolution || item.media?.[0]?.videoResolution;
        const isDv = item.detectedBadges?.hdr === "DV" || item.media?.[0]?.hdrFormat === "Dolby Vision";
        const isHdr = isDv || item.detectedBadges?.hdr !== undefined || (item.media?.[0]?.hdrFormat && item.media[0].hdrFormat !== "SDR");
        const audio = item.detectedBadges?.audio || item.media?.[0]?.audioCodec;
        const channels = item.detectedBadges?.audioChannels || item.media?.[0]?.audioChannels;
        const codec = item.detectedBadges?.codec || item.media?.[0]?.videoCodec;
        const studio = item.detectedBadges?.studio || item.studio;
        const rating = item.detectedBadges?.contentRating || item.contentRating;
        const edition = item.detectedBadges?.edition;

        // Synchronize simulator badges to match real media telemetry
        if (res) {
            setSimShowResolution(true);
        }
        if (isDv || isHdr) {
            setSimShowHdr(true);
            setSimDovetailResolutionHdr(true);
        }
        if (audio) {
            setSimShowAudio(true);
        }
        if (channels) {
            setSimShowChannels(true);
        }
        if (codec) {
            setSimShowCodec(true);
        }
        if (studio) {
            setSimShowStudio(true);
        }
        if (rating) {
            setSimShowRating(true);
        }
        if (edition) {
            setSimShowEdition(true);
        }
    };
    
    // Positions
    const [simResolutionPosition, setSimResolutionPosition] = useState<string>("top-right");
    const [simHdrPosition, setSimHdrPosition] = useState<string>("top-right");
    const [simCodecPosition, setSimCodecPosition] = useState<string>("top-right");
    const [simAudioPosition, setSimAudioPosition] = useState<string>("top-left");
    const [simChannelsPosition, setSimChannelsPosition] = useState<string>("top-left");
    const [simEditionPosition, setSimEditionPosition] = useState<string>("top-left");
    const [simStudioPosition, setSimStudioPosition] = useState<string>("bottom-left");
    const [simRatingPosition, setSimRatingPosition] = useState<string>("bottom-left");
    const [simRatingsPosition, setSimRatingsPosition] = useState<string>("bottom-right");

    // Ribbons (Authentic Kometa Waterfall Priority)
    const [simShowRibbon, setSimShowRibbon] = useState(false);
    const [simRibbonPosition, setSimRibbonPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left">("bottom-right");
    const [simRibbonTheme, setSimRibbonTheme] = useState<"purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange">("gold");
    const [simRibbonType, setSimRibbonType] = useState<string>("imdb_top_250");
    const [simRibbonText, setSimRibbonText] = useState("");
    const [simRibbonMode, setSimRibbonMode] = useState<"single" | "tiered" | "auto_stack" | "waterfall">("waterfall");
    const [simMaxRibbonTiers, setSimMaxRibbonTiers] = useState<number>(1);
    
    const DEFAULT_KOMETA_WATERFALL_RIBBONS: Array<{
        id: string;
        type: string;
        text: string;
        theme: "purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange";
        enabled: boolean;
        matchRule?: string;
    }> = [
        { id: "tier-1", type: "imdb_top_250", text: "IMDb TOP 250", theme: "gold", enabled: true },
        { id: "tier-2", type: "certified_fresh", text: "CERTIFIED FRESH", theme: "crimson", enabled: true },
        { id: "tier-3", type: "oscar_winner", text: "OSCAR WINNER", theme: "gold", enabled: true },
        { id: "tier-4", type: "auto_quality", text: "4K UHD", theme: "purple", enabled: true },
        { id: "tier-5", type: "auto_edition", text: "SPECIAL EDITION", theme: "cyan", enabled: true }
    ];

    const [simTieredRibbons, setSimTieredRibbons] = useState<Array<{
        id: string;
        type: string;
        text: string;
        theme: "purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange";
        enabled: boolean;
        matchRule?: string;
    }>>(DEFAULT_KOMETA_WATERFALL_RIBBONS);

    // Layer Priority Order
    const DEFAULT_LAYER_PRIORITY_ORDER = [
        "ribbon",
        "resolution",
        "hdr",
        "codec",
        "audio",
        "channels",
        "edition",
        "studio",
        "ratings",
        "contentRating"
    ];
    const [layerPriorityOrder, setLayerPriorityOrder] = useState<string[]>(DEFAULT_LAYER_PRIORITY_ORDER);

    // Custom Badges Hub & Downloader
    const [badgeUploadModalOpen, setBadgeUploadModalOpen] = useState(false);
    const [badgeUploadFile, setBadgeUploadFile] = useState<File | null>(null);
    const [badgeName, setBadgeName] = useState("");
    const [badgeCategory, setBadgeCategory] = useState("resolution");
    const [badgeMatchRule, setBadgeMatchRule] = useState("");
    const [uploadingBadge, setUploadingBadge] = useState(false);
    const [badgeUploadError, setBadgeUploadError] = useState<string | null>(null);
    const [selectedCustomBadgeIds, setSelectedCustomBadgeIds] = useState<string[]>([]);
    const [customBadgeFilter, setCustomBadgeFilter] = useState<string>("all");
    const [customBadgeSearch, setCustomBadgeSearch] = useState<string>("");
    const [deletingCustomBadges, setDeletingCustomBadges] = useState(false);
    const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
    const [purgingBadges, setPurgingBadges] = useState(false);
    const [badgePage, setBadgePage] = useState(1);
    const BADGES_PER_PAGE = 48;

    // GitHub Badge Hub
    const [githubModalOpen, setGithubModalOpen] = useState(false);
    const [githubRepoInput, setGithubRepoInput] = useState("https://github.com/jmxd/Kometa/tree/main/overlays/images");
    const [scanningRepo, setScanningRepo] = useState(false);
    const [scanError, setScanError] = useState<string | null>(null);
    const [discoveredBadges, setDiscoveredBadges] = useState<DiscoveredBadgeItem[]>([]);
    const [selectedBadgeIds, setSelectedBadgeIds] = useState<string[]>([]);
    const [importingBadges, setImportingBadges] = useState(false);
    const [importSuccessMsg, setImportSuccessMsg] = useState<string | null>(null);
    const [bulkDownloading, setBulkDownloading] = useState(false);
    const [bulkDownloadMsg, setBulkDownloadMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Kometa Config YAML Importer States
    const [kometaModalOpen, setKometaModalOpen] = useState(false);
    const [guideModalOpen, setGuideModalOpen] = useState(false);
    const [kometaInspecting, setKometaInspecting] = useState(false);
    const [kometaImporting, setKometaImporting] = useState(false);
    const [kometaLoadingDisk, setKometaLoadingDisk] = useState(false);
    const [kometaInspectionResult, setKometaInspectionResult] = useState<any | null>(null);
    const [kometaYamlInput, setKometaYamlInput] = useState<string>("");
    const [kometaCustomPathInput, setKometaCustomPathInput] = useState<string>("");
    const [kometaLoadedFileName, setKometaLoadedFileName] = useState<string | null>(null);
    const [kometaLoadedFileSize, setKometaLoadedFileSize] = useState<string | null>(null);
    const [kometaUploadingFile, setKometaUploadingFile] = useState<boolean>(false);
    const [kometaIsDragging, setKometaIsDragging] = useState<boolean>(false);
    const [kometaImportSuccessMsg, setKometaImportSuccessMsg] = useState<string | null>(null);
    const [kometaImportErrorMsg, setKometaImportErrorMsg] = useState<string | null>(null);
    const [kometaImportTmdb, setKometaImportTmdb] = useState<boolean>(true);
    const [kometaActiveViewTab, setKometaActiveViewTab] = useState<"overview" | "mapping" | "editor">("overview");
    const [kometaLibMappings, setKometaLibMappings] = useState<Array<{
        kometaLibName: string;
        serverId: string;
        sectionKey: string;
        enabled: boolean;
    }>>([]);

    // Media Inspector States
    const [inspectorSearchQuery, setInspectorSearchQuery] = useState("");
    const [searchingPlex, setSearchingPlex] = useState(false);
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [inspectingItem, setInspectingItem] = useState<any | null>(null);
    const [loadingInspection, setLoadingInspection] = useState(false);
    const [applyingSingleOverlay, setApplyingSingleOverlay] = useState(false);
    const [revertingSingleOverlay, setRevertingSingleOverlay] = useState(false);
    const [singleItemMsg, setSingleItemMsg] = useState<{ success: boolean; text: string } | null>(null);

    // Automated Schedule & Enabled Library States
    const [curationSyncOverlays, setCurationSyncOverlays] = useState<boolean>(true);
    const [curationSyncSchedule, setCurationSyncSchedule] = useState<string>("every_6_hours");
    const [curationLastRunAt, setCurationLastRunAt] = useState<string | null>(null);
    const [curationLastRunStatus, setCurationLastRunStatus] = useState<any | null>(null);
    const [enabledServersForOverlays, setEnabledServersForOverlays] = useState<string[]>([]);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
    const [runningOverlaySync, setRunningOverlaySync] = useState(false);
    const [overlaySyncResult, setOverlaySyncResult] = useState<{ success: boolean; text: string; details?: string[] } | null>(null);

    // Check if a section is enabled for overlays
    const isSectionEnabled = (srvId: string, secKey: string): boolean => {
        if (!enabledServersForOverlays || enabledServersForOverlays.length === 0) return true;
        if (enabledServersForOverlays.includes(`disabled:${srvId}`) || enabledServersForOverlays.includes(`${srvId}:none`)) return false;
        if (enabledServersForOverlays.includes(`disabled:${srvId}:${secKey}`)) return false;
        const compoundKey = `${srvId}:${secKey}`;
        if (enabledServersForOverlays.includes(compoundKey)) return true;
        const hasServerEntries = enabledServersForOverlays.some(k => k === srvId || k.startsWith(`${srvId}:`) || k.startsWith(`disabled:${srvId}`));
        if (hasServerEntries) {
            if (enabledServersForOverlays.includes(srvId) && !enabledServersForOverlays.some(k => k.startsWith(`${srvId}:`))) return true;
            return false;
        }
        return true;
    };

    // Toggle a section enabled/disabled for overlays
    const handleToggleSection = async (secKey: string) => {
        const currentlyEnabled = isSectionEnabled(selectedServerId, secKey);
        const nextEnabled = !currentlyEnabled;
        const currentSections = servers.find(s => s.serverId === selectedServerId)?.sections || [];
        const allSecKeys = currentSections.map(s => String(s.key));

        try {
            const res = await toggleCurationLibrarySectionAction("kometa", selectedServerId, secKey, nextEnabled, allSecKeys);
            if (res.success && res.enabledList) {
                setEnabledServersForOverlays(res.enabledList);
            }
        } catch (e) {
            console.error("Failed toggling section overlay state:", e);
        }
    };

    // Toggle ALL sections on the selected server (Enable All / Disable All)
    const handleToggleAllSectionsOnServer = async (enableAll: boolean) => {
        const currentSections = servers.find(s => s.serverId === selectedServerId)?.sections || [];
        const allSecKeys = currentSections.map(s => String(s.key));
        try {
            const res = await toggleAllCurationServerSectionsAction("kometa", selectedServerId, enableAll, allSecKeys);
            if (res.success && res.enabledList) {
                setEnabledServersForOverlays(res.enabledList);
            }
        } catch (e) {
            console.error("Failed toggling all server sections:", e);
        }
    };

    // Save schedule settings
    const handleSaveSchedule = async () => {
        setSavingSchedule(true);
        setScheduleSavedMsg(false);
        try {
            const res = await saveCurationSettingsAction({
                curationSyncOverlays,
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

    // Run overlay sync job now (strictly scoped to selected server)
    const handleRunOverlaySync = async () => {
        setRunningOverlaySync(true);
        setOverlaySyncResult(null);
        try {
            let res: any;
            if (selectedServerId && selectedSectionKey) {
                res = await applyOverlaysToLibraryAction(selectedServerId, selectedSectionKey, undefined, {
                    batchSize: overlayBatchSize,
                    mode: overlayBatchMode
                });
                if (res.success) {
                    setOverlaySyncResult({
                        success: true,
                        text: `Successfully processed library: ${res.appliedCount ?? 0} posters updated (${res.upgradedCount ?? 0} upgraded, ${res.skippedCount ?? 0} up-to-date skipped).`,
                        details: res.message ? [res.message] : []
                    });
                } else {
                    setOverlaySyncResult({
                        success: false,
                        text: res.error || "Failed running overlay sync."
                    });
                }
            } else if (selectedServerId) {
                res = await runServerCurationSyncAction(selectedServerId);
                if (res.success) {
                    setOverlaySyncResult({
                        success: true,
                        text: `Server Sync Completed (${res.serverName || selectedServerId}): ${res.overlaysAppliedCount ?? 0} posters updated.`,
                        details: res.details
                    });
                } else {
                    setOverlaySyncResult({
                        success: false,
                        text: res.details?.[0] || res.error || "Failed running server overlay sync."
                    });
                }
            } else {
                res = await runFullCurationSyncAction();
                if (res.success) {
                    setOverlaySyncResult({
                        success: true,
                        text: `Full Overlay Sync Completed: ${res.overlaysAppliedCount ?? 0} posters updated.`,
                        details: res.details
                    });
                } else {
                    setOverlaySyncResult({
                        success: false,
                        text: res.details?.[0] || "Failed running overlay sync."
                    });
                }
            }
        } catch (e: any) {
            setOverlaySyncResult({
                success: false,
                text: e.message || "An error occurred during sync."
            });
        } finally {
            setRunningOverlaySync(false);
        }
    };

    // Initial Data Fetch
    useEffect(() => {
        const loadInitialData = async () => {
            setLoading(true);
            try {
                let initialServerId = "";
                let initialSectionKey = "";

                const srvRes = await getPlexServersAndSectionsAction();
                if (srvRes.success && srvRes.servers && srvRes.servers.length > 0) {
                    setServers(srvRes.servers);
                    const firstServer = srvRes.servers[0];
                    initialServerId = firstServer.serverId;
                    setSelectedServerId(initialServerId);
                    if (firstServer.sections && firstServer.sections.length > 0) {
                        initialSectionKey = String(firstServer.sections[0].key);
                        setSelectedSectionKey(initialSectionKey);
                    }
                }

                const badgeRes = await getCustomBadgesAction();
                if (badgeRes?.success && badgeRes.badges) {
                    setCustomBadges(badgeRes.badges);
                }

                const rulesRes = await getOverlayRulesAction(initialServerId || undefined, initialSectionKey || undefined);
                if (rulesRes.success && rulesRes.rules) {
                    setOverlayRules(rulesRes.rules);
                    if (rulesRes.rules.length > 0) {
                        applyRuleToSimulator(rulesRes.rules[0]);
                    }
                }

                const settingsRes = await getCurationSettingsAction();
                if (settingsRes.success) {
                    setCurationSyncOverlays(settingsRes.curationSyncOverlays ?? true);
                    setCurationSyncSchedule(settingsRes.curationSyncSchedule || "every_6_hours");
                    setCurationLastRunAt(settingsRes.curationLastRunAt || null);
                    setCurationLastRunStatus(settingsRes.curationLastRunStatus || null);
                    if (settingsRes.enabledServersForOverlays) {
                        setEnabledServersForOverlays(settingsRes.enabledServersForOverlays);
                    }
                }
            } catch (err) {
                console.error("Failed loading Kometa studio data:", err);
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, []);

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
            loadRulesForSection(srvId, nextSecKey);
        } else {
            setSelectedSectionKey("");
            setOverlayRules([]);
        }
    };

    const handleSelectSection = async (secKey: string) => {
        setSelectedSectionKey(secKey);
        loadRulesForSection(selectedServerId, secKey);
    };

    const applyRuleToSimulator = (targetRule: any) => {
        if (!targetRule) return;
        if (targetRule.showResolution !== undefined) setSimShowResolution(Boolean(targetRule.showResolution));
        if (targetRule.showHdr !== undefined) setSimShowHdr(Boolean(targetRule.showHdr));
        if (targetRule.showAudio !== undefined) setSimShowAudio(Boolean(targetRule.showAudio));
        if (targetRule.showAudioChannels !== undefined) setSimShowChannels(Boolean(targetRule.showAudioChannels));
        if (targetRule.showCodec !== undefined) setSimShowCodec(Boolean(targetRule.showCodec));
        if (targetRule.showEdition !== undefined) setSimShowEdition(Boolean(targetRule.showEdition));
        if (targetRule.showStudio !== undefined) setSimShowStudio(Boolean(targetRule.showStudio));
        if (targetRule.showContentRating !== undefined) setSimShowRating(Boolean(targetRule.showContentRating));
        if (targetRule.showRatings !== undefined) setSimRatings(Boolean(targetRule.showRatings));
        if (targetRule.theme) setSimTheme(targetRule.theme as any);
        if (targetRule.badgeScale !== undefined && targetRule.badgeScale !== null) setSimBadgeScale(targetRule.badgeScale);
        if (targetRule.resolutionPosition) setSimResolutionPosition(targetRule.resolutionPosition);
        if (targetRule.hdrPosition) setSimHdrPosition(targetRule.hdrPosition);
        if (targetRule.audioPosition) setSimAudioPosition(targetRule.audioPosition);
        if (targetRule.channelsPosition) setSimChannelsPosition(targetRule.channelsPosition);
        if (targetRule.codecPosition) setSimCodecPosition(targetRule.codecPosition);
        if (targetRule.editionPosition) setSimEditionPosition(targetRule.editionPosition);
        if (targetRule.studioPosition) setSimStudioPosition(targetRule.studioPosition);
        if (targetRule.contentRatingPosition || targetRule.ratingPosition) setSimRatingPosition(targetRule.contentRatingPosition || targetRule.ratingPosition);
        if (targetRule.ratingsPosition) setSimRatingsPosition(targetRule.ratingsPosition);
        if (targetRule.showRibbon !== undefined) setSimShowRibbon(Boolean(targetRule.showRibbon));
        if (targetRule.ribbonPosition) setSimRibbonPosition(targetRule.ribbonPosition as any);
        if (targetRule.ribbonTheme) setSimRibbonTheme(targetRule.ribbonTheme as any);
        if (targetRule.ribbonType) setSimRibbonType(targetRule.ribbonType);
        if (targetRule.ribbonText !== undefined && targetRule.ribbonText !== null) setSimRibbonText(targetRule.ribbonText);
        if (targetRule.ribbonMode) setSimRibbonMode(targetRule.ribbonMode as any);
        if (targetRule.dovetailResolutionHdr !== undefined) setSimDovetailResolutionHdr(Boolean(targetRule.dovetailResolutionHdr));

        if (targetRule.categoryScales) {
            try {
                const parsed = typeof targetRule.categoryScales === "string"
                    ? JSON.parse(targetRule.categoryScales)
                    : targetRule.categoryScales;
                if (parsed && typeof parsed === "object") {
                    setSimCategoryScales({ ...DEFAULT_CATEGORY_SCALES, ...parsed });
                }
            } catch (e) {}
        } else {
            setSimCategoryScales(DEFAULT_CATEGORY_SCALES);
        }

        if (targetRule.layerPriorityOrder) {
            try {
                const parsed = typeof targetRule.layerPriorityOrder === "string"
                    ? JSON.parse(targetRule.layerPriorityOrder)
                    : targetRule.layerPriorityOrder;
                if (parsed && typeof parsed === "object") {
                    if (Array.isArray(parsed)) {
                        setLayerPriorityOrder(parsed);
                    } else {
                        if (parsed.ribbonMode) setSimRibbonMode(parsed.ribbonMode);
                        if (Array.isArray(parsed.tieredRibbons)) setSimTieredRibbons(parsed.tieredRibbons);
                        if (parsed.maxRibbonTiers) setSimMaxRibbonTiers(parsed.maxRibbonTiers);
                        if (parsed.dovetailResolutionHdr !== undefined) setSimDovetailResolutionHdr(Boolean(parsed.dovetailResolutionHdr));
                        if (Array.isArray(parsed.order)) setLayerPriorityOrder(parsed.order);
                        else if (Array.isArray(parsed.layerOrder)) setLayerPriorityOrder(parsed.layerOrder);
                    }
                }
            } catch (e) {}
        }
    };

    const loadRulesForSection = async (srvId?: string, secKey?: string) => {
        setServerSectionsLoading(true);
        try {
            const res = await getOverlayRulesAction(srvId || selectedServerId, secKey || selectedSectionKey);
            if (res.success && res.rules) {
                setOverlayRules(res.rules);
                if (res.rules.length > 0) {
                    applyRuleToSimulator(res.rules[0]);
                }
            }
        } catch (e) {
            console.error("Failed loading rules:", e);
        } finally {
            setServerSectionsLoading(false);
        }
    };

    // Authentic Kometa Waterfall Ribbon Evaluation Engine
    const WATERFALL_PRESET_OPTIONS = [
        { value: "imdb_top_250", label: "🏆 IMDb Top 250 (Score ≥ 8.0)", defaultText: "IMDb TOP 250", defaultTheme: "gold" as const },
        { value: "imdb_top_250_tv", label: "📺 IMDb Top TV Shows (Score ≥ 8.0)", defaultText: "IMDb TOP TV", defaultTheme: "gold" as const },
        { value: "certified_fresh", label: "🍅 RT: Certified Fresh (≥ 75%)", defaultText: "CERTIFIED FRESH", defaultTheme: "crimson" as const },
        { value: "rt_fresh", label: "🍅 RT: Fresh (≥ 60%)", defaultText: "RT FRESH", defaultTheme: "crimson" as const },
        { value: "metacritic_must_see", label: "Ⓜ️ Metacritic: Must-See (≥ 81)", defaultText: "MUST-SEE", defaultTheme: "emerald" as const },
        { value: "oscar_winner", label: "🥇 Academy Award / Oscar Winner", defaultText: "OSCAR WINNER", defaultTheme: "gold" as const },
        { value: "academy_award", label: "🎬 Best Picture Winner", defaultText: "BEST PICTURE", defaultTheme: "gold" as const },
        { value: "emmy_winner", label: "📺 Primetime Emmy Winner", defaultText: "EMMY WINNER", defaultTheme: "gold" as const },
        { value: "golden_globe", label: "🏆 Golden Globe Winner", defaultText: "GOLDEN GLOBE", defaultTheme: "gold" as const },
        { value: "critics_choice", label: "🎖️ Critics' Choice Award", defaultText: "CRITICS' CHOICE", defaultTheme: "cyan" as const },
        { value: "bafta_winner", label: "🇬🇧 BAFTA Award Winner", defaultText: "BAFTA WINNER", defaultTheme: "gold" as const },
        { value: "cannes_winner", label: "🌿 Cannes Palme d'Or Winner", defaultText: "PALME D'OR", defaultTheme: "gold" as const },
        { value: "auto_quality", label: "📺 4K UHD / Dolby Vision Quality", defaultText: "4K UHD", defaultTheme: "purple" as const },
        { value: "auto_edition", label: "🏷️ Special / IMAX Edition", defaultText: "SPECIAL EDITION", defaultTheme: "cyan" as const },
        { value: "leaving_soon", label: "⚠️ Leaving Soon (Plex Collection / Staged)", defaultText: "LEAVING SOON", defaultTheme: "crimson" as const },
        { value: "custom", label: "⚙️ Custom Rule / Condition", defaultText: "FEATURED", defaultTheme: "glass" as const }
    ];

    const getEffectiveRibbonText = (item?: any) => {
        if (simRibbonText && simRibbonText.trim()) return simRibbonText.trim().toUpperCase();
        const found = WATERFALL_PRESET_OPTIONS.find(p => p.value === simRibbonType);
        if (found) {
            if (simRibbonType === "auto_edition") {
                if (item?.detectedBadges?.edition) return item.detectedBadges.edition.toUpperCase();
                return "IMAX ENHANCED";
            }
            if (simRibbonType === "auto_quality") {
                if (item?.detectedBadges?.hdr === "DV" || (!item && simShowHdr)) return "DOLBY VISION";
                return "4K UHD";
            }
            return found.defaultText;
        }
        return (simRibbonText.trim() || "FEATURED").toUpperCase();
    };

    const evaluateWaterfallRibbonClient = (
        item: PlexMediaStreamInfo | null,
        tieredRibbons: Array<{
            id: string;
            type: string;
            text: string;
            theme: "purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange";
            enabled: boolean;
            matchRule?: string;
        }>,
        simFallback: {
            resolution?: string;
            hdr?: string;
            edition?: string;
            ratings?: boolean;
        }
    ): { text: string; theme: "purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange"; matchedTierId?: string; matchedType?: string; priority: number; ruleLabel: string } | null => {
        if (!tieredRibbons || tieredRibbons.length === 0) return null;

        let priorityIdx = 1;
        for (const tier of tieredRibbons) {
            if (tier.enabled === false) {
                priorityIdx++;
                continue;
            }

            const type = (tier.type || "").toLowerCase();
            let isMatch = false;
            let ruleLabel = tier.text || type;

            if (type === "imdb_top_250") {
                ruleLabel = "IMDb Top 250 (Score ≥ 8.3)";
                if (item) {
                    const hasTop250Collection = item.collections?.some(c => /top[\s_-]?250/i.test(c)) || item.labels?.some(l => /top[\s_-]?250/i.test(l));
                    const score = item.imdbRating ?? item.rating;
                    if (hasTop250Collection) isMatch = true;
                    else if (item.type !== "show" && score && score >= 8.3) isMatch = true;
                } else if (simFallback.ratings) {
                    isMatch = true;
                }
            } else if (type === "imdb_top_250_tv") {
                ruleLabel = "IMDb Top TV (Score ≥ 8.5)";
                if (item) {
                    const hasTop250Collection = item.collections?.some(c => /top[\s_-]?250|top[\s_-]?tv/i.test(c)) || item.labels?.some(l => /top[\s_-]?250|top[\s_-]?tv/i.test(l));
                    const score = item.imdbRating ?? item.rating;
                    if (hasTop250Collection) isMatch = true;
                    else if (item.type === "show" && score && score >= 8.5) isMatch = true;
                }
            } else if (type === "certified_fresh") {
                ruleLabel = "RT Certified Fresh (≥ 75%)";
                if (item) {
                    const rtCrit = item.rtCriticsRating;
                    const rtAud = item.rtAudienceRating;
                    if ((rtCrit && rtCrit >= 75) || (rtAud && rtAud >= 80)) isMatch = true;
                } else if (simFallback.ratings) {
                    isMatch = true;
                }
            } else if (type === "rt_fresh") {
                ruleLabel = "RT Fresh (≥ 60%)";
                if (item) {
                    const rtCrit = item.rtCriticsRating;
                    if (rtCrit && rtCrit >= 60) isMatch = true;
                }
            } else if (type === "metacritic_must_see") {
                ruleLabel = "Metacritic Must-See (≥ 81)";
                if (item) {
                    const fullStr = `${item.title} ${item.genre || ""}`.toLowerCase();
                    if (fullStr.includes("must-see") || (item.rating && item.rating >= 8.5)) isMatch = true;
                }
            } else if (type === "oscar_winner" || type === "academy_award") {
                ruleLabel = "Academy Award / Oscar Winner";
                if (item) {
                    const hasOscar = item.collections?.some(c => /oscar|academy[\s_-]?award|best[\s_-]?picture/i.test(c)) || item.labels?.some(l => /oscar|academy[\s_-]?award/i.test(l));
                    const fullStr = `${item.title} ${item.editionTitle || ""}`.toLowerCase();
                    if (hasOscar || fullStr.includes("oscar") || fullStr.includes("academy award") || fullStr.includes("best picture") || fullStr.includes("lord of the rings") || fullStr.includes("godfather") || fullStr.includes("parasite") || fullStr.includes("oppenheimer") || fullStr.includes("everything everywhere") || fullStr.includes("gladiator") || fullStr.includes("titanic") || fullStr.includes("braveheart") || fullStr.includes("forrest gump")) isMatch = true;
                }
            } else if (type === "emmy_winner") {
                ruleLabel = "Emmy Winner";
                if (item) {
                    const hasEmmy = item.collections?.some(c => /emmy/i.test(c)) || item.labels?.some(l => /emmy/i.test(l));
                    const fullStr = `${item.title} ${item.genre || ""}`.toLowerCase();
                    if (hasEmmy || fullStr.includes("emmy") || fullStr.includes("breaking bad") || fullStr.includes("succession") || fullStr.includes("game of thrones") || fullStr.includes("the bear") || fullStr.includes("sopranos") || fullStr.includes("the wire")) isMatch = true;
                }
            } else if (type === "golden_globe") {
                ruleLabel = "Golden Globe Winner";
                if (item) {
                    const hasGlobe = item.collections?.some(c => /golden[\s_-]?globe/i.test(c)) || item.labels?.some(l => /golden[\s_-]?globe/i.test(l));
                    const fullStr = `${item.title} ${item.genre || ""}`.toLowerCase();
                    if (hasGlobe || fullStr.includes("golden globe")) isMatch = true;
                }
            } else if (type === "cannes_winner") {
                ruleLabel = "Cannes Palme d'Or Winner";
                if (item) {
                    const hasCannes = item.collections?.some(c => /cannes|palme[\s_-]?d['’]?or/i.test(c)) || item.labels?.some(l => /cannes|palme[\s_-]?d['’]?or/i.test(l));
                    const fullStr = `${item.title} ${item.genre || ""}`.toLowerCase();
                    if (hasCannes || fullStr.includes("cannes") || fullStr.includes("palme d'or")) isMatch = true;
                }
            } else if (type === "bafta_winner") {
                ruleLabel = "BAFTA Winner";
                if (item) {
                    const hasBafta = item.collections?.some(c => /bafta/i.test(c)) || item.labels?.some(l => /bafta/i.test(l));
                    const fullStr = `${item.title} ${item.genre || ""}`.toLowerCase();
                    if (hasBafta || fullStr.includes("bafta")) isMatch = true;
                }
            } else if (type === "critics_choice") {
                ruleLabel = "Critics' Choice Award";
                if (item) {
                    const hasCc = item.collections?.some(c => /critics[\s_-]?choice/i.test(c)) || item.labels?.some(l => /critics[\s_-]?choice/i.test(l));
                    const fullStr = `${item.title} ${item.genre || ""}`.toLowerCase();
                    if (hasCc || fullStr.includes("critics' choice") || fullStr.includes("critics choice")) isMatch = true;
                }
            } else if (type === "auto_quality" || type === "4k_uhd") {
                ruleLabel = "4K UHD / Dolby Vision";
                if (item) {
                    if (item.detectedBadges?.resolution === "4K" || item.detectedBadges?.hdr === "DV" || Boolean(item.detectedBadges?.hdr)) {
                        isMatch = true;
                    }
                } else if (simFallback.resolution === "4K" || Boolean(simFallback.hdr)) {
                    isMatch = true;
                }
            } else if (type === "auto_edition") {
                ruleLabel = "Special / IMAX Edition";
                if (item) {
                    if (Boolean(item.detectedBadges?.edition || item.editionTitle)) isMatch = true;
                } else if (Boolean(simFallback.edition)) {
                    isMatch = true;
                }
            } else if (type === "leaving_soon") {
                ruleLabel = "Leaving Soon Advisory";
                if (item) {
                    const isLeaving = Boolean(
                        item.isLeavingSoon ||
                        item.collections?.some((c: string) => /leaving[\s_-]?soon/i.test(c)) ||
                        item.labels?.some((l: string) => /leaving[\s_-]?soon/i.test(l))
                    );
                    if (isLeaving) isMatch = true;
                } else {
                    isMatch = true;
                }
            } else if (type === "custom" || tier.matchRule) {
                ruleLabel = tier.text || "Custom Condition";
                if (tier.matchRule && item) {
                    isMatch = evaluateBadgeConditionClient(tier.matchRule, item.detectedBadges || {});
                } else {
                    isMatch = true;
                }
            }

            if (isMatch) {
                let text = tier.text;
                let theme = tier.theme || "purple";

                if (!text && type) {
                    const preset = WATERFALL_PRESET_OPTIONS.find(p => p.value === type);
                    if (preset) {
                        text = preset.defaultText;
                        if (!tier.theme) theme = preset.defaultTheme;
                    }
                    if (type === "auto_edition") {
                        text = item?.detectedBadges?.edition?.toUpperCase() || (simFallback.edition ? simFallback.edition.toUpperCase() : "IMAX ENHANCED");
                    } else if (type === "auto_quality") {
                        if (item?.detectedBadges?.hdr === "DV" || simFallback.hdr === "DV") text = "DOLBY VISION";
                        else text = "4K UHD";
                    }
                }

                if (text && text.trim()) {
                    return {
                        text: text.trim().toUpperCase(),
                        theme,
                        matchedTierId: tier.id,
                        matchedType: type,
                        priority: priorityIdx,
                        ruleLabel
                    };
                }
            }

            priorityIdx++;
        }

        return null;
    };

    const getActiveSimulatorRibbon = (): { text: string; theme: "purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange"; priority: number; ruleLabel: string; matchedType?: string } | null => {
        if (!simShowRibbon) return null;

        if (simRibbonMode === "single") {
            const text = simRibbonText && simRibbonText.trim() ? simRibbonText.trim().toUpperCase() : getEffectiveRibbonText();
            return {
                text: text || "FEATURED",
                theme: simRibbonTheme,
                priority: 1,
                ruleLabel: "Manual Custom Text",
                matchedType: "featured"
            };
        }

        // Waterfall Mode (First Matching Priority Tier Wins)
        const matched = evaluateWaterfallRibbonClient(
            simSelectedRealItem,
            simTieredRibbons,
            {
                resolution: simShowResolution ? "4K" : undefined,
                hdr: simShowHdr ? "DV" : undefined,
                edition: simShowEdition ? "IMAX" : undefined,
                ratings: simRatings
            }
        );

        return matched;
    };

    const getActiveSimulatorRibbons = (): Array<{ text: string; theme: "purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange" }> => {
        const win = getActiveSimulatorRibbon();
        return win ? [{ text: win.text, theme: win.theme }] : [];
    };

    // Client Matchers
    const evaluateBadgeConditionClient = (
        condition: string,
        detected: {
            resolution?: string | null;
            hdr?: string | null;
            audio?: string | null;
            audioChannels?: string | null;
            codec?: string | null;
            edition?: string | null;
            studio?: string | null;
            contentRating?: string | null;
        }
    ): boolean => {
        const c = condition.trim().toLowerCase();
        if (!c || c === "all" || c === "*") return true;

        if (c === "4k" || c === "2160p" || c === "uhd" || c === "ultra-hd" || c === "ultra hd") return detected.resolution === "4K";
        if (c === "1080p" || c === "1080" || c === "fhd") return detected.resolution === "1080p";
        if (c === "720p" || c === "720" || c === "hd") return detected.resolution === "720p";
        if (c === "480p" || c === "480" || c === "576p" || c === "576" || c === "sd") return detected.resolution === "SD";

        if (c === "dv" || c === "dolby vision" || c === "dovi") return detected.hdr === "DV";
        if (c === "hdr10+" || c === "hdr+" || c === "hdrplus" || c === "plus") return detected.hdr === "HDR10+";
        if (c === "hdr10") return detected.hdr === "HDR10" || detected.hdr === "HDR10+";
        if (c === "hdr") return Boolean(detected.hdr);
        if (c === "sdr") return !detected.hdr;

        if (c === "atmos") return (detected.audio || "").toLowerCase().includes("atmos");
        if (c === "truehd") return (detected.audio || "").toLowerCase().includes("truehd");
        if (c === "dts:x" || c === "dts-x" || c === "dts_x") return (detected.audio || "").toLowerCase().includes("dts:x") || (detected.audio || "").toLowerCase().includes("dts-x");
        if (c === "dts-hd" || c === "dtshd" || c === "dts-ma" || c === "ma") return (detected.audio || "").toLowerCase().includes("dts-hd") || (detected.audio || "").toLowerCase().includes("ma");
        if (c === "dts") return (detected.audio || "").toLowerCase().includes("dts");
        if (c === "flac") return (detected.audio || "").toLowerCase() === "flac";
        if (c === "eac3" || c === "digital+") return (detected.audio || "").toLowerCase() === "eac3";
        if (c === "ac3") return (detected.audio || "").toLowerCase() === "ac3";
        if (c === "aac") return (detected.audio || "").toLowerCase() === "aac";

        if (c === "7.1" || c === "7_1") return detected.audioChannels === "7.1";
        if (c === "5.1" || c === "5_1") return detected.audioChannels === "5.1";
        if (c === "2.0" || c === "2_0") return detected.audioChannels === "2.0";

        if (c === "hevc" || c === "h265" || c === "x265") return detected.codec === "HEVC";
        if (c === "av1") return detected.codec === "AV1";
        if (c === "prores") return detected.codec === "ProRes";
        if (c === "avc" || c === "h264" || c === "x264") return detected.codec === "AVC";

        if (c === "imax") return (detected.edition || "").toLowerCase().includes("imax");
        if (c === "criterion") return (detected.edition || "").toLowerCase().includes("criterion");
        if (c === "remux") return (detected.edition || "").toLowerCase().includes("remux");
        if (c === "directors_cut" || c === "director" || c === "directors") return (detected.edition || "").toLowerCase().includes("director");
        if (c === "extended") return (detected.edition || "").toLowerCase().includes("extended");
        if (c === "theatrical") return (detected.edition || "").toLowerCase().includes("theatrical");
        if (c === "remastered" || c === "remaster") return (detected.edition || "").toLowerCase().includes("remaster");
        if (c === "unrated") return (detected.edition || "").toLowerCase().includes("unrated");
        if (c === "uncut") return (detected.edition || "").toLowerCase().includes("uncut");
        if (c === "special") return (detected.edition || "").toLowerCase().includes("special") || (detected.edition || "").toLowerCase().includes("collector") || (detected.edition || "").toLowerCase().includes("ultimate") || (detected.edition || "").toLowerCase().includes("anniversary") || (detected.edition || "").toLowerCase().includes("definitive");

        if (c === "netflix") return (detected.studio || "").toLowerCase().includes("netflix");
        if (c === "disney") return (detected.studio || "").toLowerCase().includes("disney");
        if (c === "hbo" || c === "max") return (detected.studio || "").toLowerCase().includes("hbo") || /\bmax\b/i.test(detected.studio || "");
        if (c === "apple" || c === "apple_tv") return (detected.studio || "").toLowerCase().includes("apple");
        if (c === "amazon" || c === "prime") return (detected.studio || "").toLowerCase().includes("amazon") || (detected.studio || "").toLowerCase().includes("prime");
        if (c === "paramount") return (detected.studio || "").toLowerCase().includes("paramount");
        if (c === "peacock") return (detected.studio || "").toLowerCase().includes("peacock");
        if (c === "hulu") return (detected.studio || "").toLowerCase().includes("hulu");
        if (c === "crunchyroll") return (detected.studio || "").toLowerCase().includes("crunchyroll");
        if (c === "amc") return (detected.studio || "").toLowerCase().includes("amc");
        if (c === "marvel") return (detected.studio || "").toLowerCase().includes("marvel");
        if (c === "dc") return (detected.studio || "").toLowerCase().includes("dc");
        if (c === "a24") return (detected.studio || "").toLowerCase().includes("a24");

        // Content / Age Ratings
        const rawCr = (detected.contentRating || "").trim();
        const crClean = rawCr.toUpperCase().replace(/^(US|GB|UK|DE|CA|AU|FR|ES|IT|NZ)[:\-_/]?/i, "").replace(/^RATED[\s\-_]*/i, "").replace(/[^A-Z0-9]/g, "");
        const condClean = c.replace(/^(US|GB|UK|DE|CA|AU|FR|ES|IT|NZ)[:\-_/]?/i, "").replace(/^RATED[\s\-_]*/i, "").replace(/[^a-z0-9]/g, "");

        if (condClean === "pg13" || condClean === "13+" || condClean === "12a" || condClean === "12" || condClean === "pg13c") {
            return crClean === "PG13" || crClean === "13+" || crClean === "12A" || crClean === "12" || rawCr.includes("PG-13") || rawCr.includes("13");
        }
        if (condClean === "nc17" || condClean === "18+" || condClean === "r18+" || condClean === "nc17c") {
            return crClean === "NC17" || crClean === "18+" || crClean === "R18" || rawCr.includes("NC-17") || rawCr.includes("18");
        }
        if (condClean === "r" || condClean === "rc" || condClean === "restricted" || condClean === "15" || condClean === "16") {
            return crClean === "R" || crClean === "15" || crClean === "16" || rawCr === "R" || rawCr === "US:R";
        }
        if (condClean === "pg" || condClean === "pgc" || condClean === "6") {
            return crClean === "PG" || crClean === "6" || rawCr === "PG" || rawCr === "US:PG";
        }
        if (condClean === "g" || condClean === "gc" || condClean === "u" || condClean === "0") {
            return crClean === "G" || crClean === "U" || crClean === "0" || rawCr === "G" || rawCr === "US:G";
        }
        if (condClean === "tvma" || condClean === "tvmac") {
            return crClean === "TVMA" || rawCr === "TV-MA" || rawCr.includes("TV-MA") || rawCr.includes("MA");
        }
        if (condClean === "tv14" || condClean === "tv14c") {
            return crClean === "TV14" || rawCr === "TV-14" || rawCr.includes("TV-14") || rawCr.includes("14");
        }
        if (condClean === "tvpg" || condClean === "tvpgc") {
            return crClean === "TVPG" || rawCr === "TV-PG" || rawCr.includes("TV-PG");
        }
        if (condClean === "tvg" || condClean === "tvgc") {
            return crClean === "TVG" || rawCr === "TV-G" || rawCr.includes("TV-G");
        }
        if (condClean === "tvy" || condClean === "tvyc") {
            return crClean === "TVY" || rawCr === "TV-Y" || rawCr.includes("TV-Y");
        }
        if (condClean === "tvy7" || condClean === "tvy7c") {
            return crClean === "TVY7" || rawCr === "TV-Y7" || rawCr.includes("TV-Y7");
        }
        if (condClean === "nr" || condClean === "nrc" || condClean === "unrated" || condClean === "notrated") {
            return crClean === "NR" || crClean === "UNRATED" || crClean === "NOTRATED" || /NOT RATED|UNRATED|NR/i.test(rawCr);
        }
        if (condClean && crClean && condClean === crClean) {
            return true;
        }

        if (c === "imdb_top_250" || c === "imdb" || c === "imdbtop250") return true;
        if (c === "rt_fresh" || c === "criticfresh" || c === "audiencefresh") return true;
        if (c === "metacritic_must_see" || c === "metacritic" || c === "metacritictop") return true;
        if (c === "tmdb" || c === "trakt") return true;

        return false;
    };

    const doesCustomBadgeMatchDetected = (
        cb: { category?: string; matchRule?: string | null; name?: string; filePath?: string },
        detected: { resolution?: string; hdr?: string; audio?: string; audioChannels?: string; codec?: string; edition?: string; studio?: string; contentRating?: string }
    ): boolean => {
        const rawRule = (cb.matchRule || "").trim().toLowerCase();
        const rawCategory = (cb.category || "").trim().toLowerCase();
        const rawName = (cb.name || "").toLowerCase();
        const rawFile = (cb.filePath || "").split(/[\/\\]/).pop()?.toLowerCase() || "";

        if (rawRule === "all" || rawRule === "*" || (rawCategory === "ribbon" && !rawRule) || (rawCategory === "banner" && !rawRule)) {
            return true;
        }

        let tokens: string[] = [];
        if (rawRule.includes("+") || rawRule.includes(",") || rawRule.includes("&")) {
            tokens = rawRule.split(/[+,&]/).map(t => t.trim()).filter(Boolean);
        } else if (rawRule) {
            tokens = [rawRule];
        } else {
            const baseName = `${rawName} ${rawFile.replace(/\.[^/.]+$/, "")}`.toLowerCase();
            const inferredTokens: string[] = [];
            if (/4k|2160/i.test(baseName)) inferredTokens.push("4k");
            else if (/1080/i.test(baseName)) inferredTokens.push("1080p");
            else if (/720/i.test(baseName)) inferredTokens.push("720p");
            else if (/480|576|sd/i.test(baseName)) inferredTokens.push("480p");

            if (/dv|dolby.*vision/i.test(baseName)) inferredTokens.push("dv");
            if (/hdr10\+|hdr\+|hdrplus|plus/i.test(baseName) && !/disney/i.test(baseName)) inferredTokens.push("hdr10+");
            else if (/hdr10/i.test(baseName)) inferredTokens.push("hdr10");
            else if (/hdr/i.test(baseName)) inferredTokens.push("hdr");

            if (/atmos/i.test(baseName)) inferredTokens.push("atmos");
            if (/truehd/i.test(baseName)) inferredTokens.push("truehd");
            if (/7\.1/i.test(baseName)) inferredTokens.push("7.1");
            else if (/5\.1/i.test(baseName)) inferredTokens.push("5.1");

            // Infer Content / Age Ratings
            if (/uspg-13|uspg13|pg-13|pg13/i.test(baseName)) inferredTokens.push("pg-13");
            else if (/ustv-ma|ustvma|tv-ma|tvma/i.test(baseName)) inferredTokens.push("tv-ma");
            else if (/ustv-14|ustv14|tv-14|tv14/i.test(baseName)) inferredTokens.push("tv-14");
            else if (/ustv-pg|ustvpg|tv-pg|tvpg/i.test(baseName)) inferredTokens.push("tv-pg");
            else if (/ustv-g|ustvg|tv-g|tvg/i.test(baseName)) inferredTokens.push("tv-g");
            else if (/ustv-y7|ustvy7|tv-y7|tvy7/i.test(baseName)) inferredTokens.push("tv-y7");
            else if (/ustv-y|ustvy|tv-y|tvy/i.test(baseName)) inferredTokens.push("tv-y");
            else if (/usnc-17|usnc17|nc-17|nc17/i.test(baseName)) inferredTokens.push("nc-17");
            else if (/usr|\brated[\s_-]?r\b|\br\.png\b/i.test(baseName)) inferredTokens.push("r");
            else if (/uspg|\brated[\s_-]?pg\b|\bpg\.png\b/i.test(baseName)) inferredTokens.push("pg");
            else if (/usg|\brated[\s_-]?g\b|\bg\.png\b/i.test(baseName)) inferredTokens.push("g");
            else if (/usnr|unrated|not[\s_-]?rated/i.test(baseName)) inferredTokens.push("nr");

            tokens = inferredTokens;
        }

        if (tokens.length === 0) return false;
        return tokens.every(tok => evaluateBadgeConditionClient(tok, detected));
    };

    const getCustomBadgeCategoriesClient = (cb: any): string[] => {
        const cat = (cb.category || "").toLowerCase().trim();
        const rule = (cb.matchRule || "").toLowerCase().trim();
        const name = (cb.name || "").toLowerCase().trim();
        const fName = (cb.filePath || "").split(/[\/\\]/).pop()?.toLowerCase() || "";
        const combined = `${cat} ${rule} ${name} ${fName}`;

        const categories = new Set<string>();

        if (cat === "resolution") categories.add("resolution");
        if (cat === "hdr") categories.add("hdr");
        if (cat === "codec") categories.add("codec");
        if (cat === "audio") categories.add("audio");
        if (cat === "channels") categories.add("channels");
        if (cat === "edition") categories.add("edition");
        if (cat === "studio") categories.add("studio");
        if (cat === "contentrating" || cat === "content_rating" || cat === "cr" || cat === "age_rating" || cat === "agerating" || cat === "mpaa") categories.add("contentRating");
        if (cat === "ratings" || cat === "rating" || cat === "audience") categories.add("ratings");
        if (cat === "ribbon" || cat === "banner") categories.add("ribbon");

        if (fName.includes("_resolution_") || /\b(4k|2160p?|1080p?|720p?|480p?|576p?|sd|uhd|fhd)\b/i.test(rule) || /\b(4k|2160p?|1080p?|720p?|480p?|576p?|sd|uhd|fhd)\b/i.test(name)) {
            categories.add("resolution");
        }
        if (fName.includes("_hdr_") || /\b(dv|dolby\s*vision|hdr10\+|hdr10|hdr|hlg|sdr)\b/i.test(rule) || /\b(dv|dolby\s*vision|hdr10\+|hdr10|hdr|hlg|sdr)\b/i.test(name)) {
            categories.add("hdr");
        }
        if (fName.includes("_codec_") || /\b(hevc|h265|x265|av1|prores|avc|h264|x264|vc1|mpeg2)\b/i.test(combined)) {
            categories.add("codec");
        }
        if (fName.includes("_audio_codec_") || /\b(atmos|truehd|dts:x|dts-x|dts-hd|dtshd|dts-ma|dts|flac|aac|eac3|ac3|pcm|opus|mp3)\b/i.test(combined)) {
            categories.add("audio");
        }
        if (/\b(7\.1|5\.1|2\.0|channels|surround)\b/i.test(combined)) {
            categories.add("channels");
        }
        if (fName.includes("_edition_") || /\b(imax|criterion|director|directors|extended|theatrical|remux|remaster|uncut|unrated|collector|definitive|anniversary)\b/i.test(combined)) {
            categories.add("edition");
        }
        if ((fName.includes("_streaming_") || fName.includes("_studio_") || /\b(netflix|disney|hbo|max|apple|prime|amazon|paramount|peacock|hulu|crunchyroll|amc|discovery|hayu|tubi|filmin|crave|itvx|a24|marvel|dc)\b/i.test(combined)) && !categories.has("edition")) {
            categories.add("studio");
        }
        if (fName.includes("_cr_") || /\b(usg|uspg|uspg-13|uspg13|usr|usnc-17|usnc17|usnr|ustv-ma|ustvma|ustv-14|ustv14|ustv-pg|ustvpg|pg-13|pg13|nc-17|nc17|tv-ma|tvma|tv-14|tv14|tv-pg|tvpg|tv-y7|tv-y|tv-g|rated\s+[a-z0-9-]+)\b/i.test(combined)) {
            categories.add("contentRating");
        }
        if (fName.includes("_rating_") || /\b(imdb|criticfresh|audiencefresh|criticrotten|audiencerotten|metacritic|tmdb|trakt|letterboxd|mdblist|anidb|mal)\b/i.test(combined)) {
            categories.add("ratings");
        }
        if (fName.includes("_ribbon_") || /\b(oscar|cannes|golden|emmy|bafta|sundance|berlinale|venice|spirit|rottenverified)\b/i.test(combined)) {
            categories.add("ribbon");
        }

        if (categories.size === 0 && cat && cat !== "custom") {
            categories.add(cat);
        }

        return Array.from(categories);
    };

    // Dynamic Theme Styling Helper for all 6 Themes
    const getThemeBadgeStyle = (theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson", category: string, isDovetail = false) => {
        if (theme === "gold") {
            return {
                container: "bg-gradient-to-r from-amber-950/95 via-yellow-950/90 to-slate-950/95 text-amber-200 border-amber-400/90 shadow-lg shadow-amber-950/80 ring-1 ring-amber-500/30",
                highlight: "bg-yellow-300/40",
                textPrimary: "text-amber-300 font-black",
                textSecondary: "text-amber-200/80 font-bold",
                accent: "bg-amber-400"
            };
        }
        if (theme === "classic") {
            return {
                container: "bg-slate-900/98 text-slate-100 border-slate-600 shadow-md shadow-black/80",
                highlight: "bg-white/20",
                textPrimary: "text-white font-black",
                textSecondary: "text-slate-300 font-bold",
                accent: "bg-slate-400"
            };
        }
        if (theme === "minimal") {
            return {
                container: "bg-black/90 text-white border-white/30 shadow-sm",
                highlight: "hidden",
                textPrimary: "text-white font-bold",
                textSecondary: "text-white/70 font-medium",
                accent: "bg-white"
            };
        }
        if (theme === "cyber") {
            return {
                container: "bg-slate-950/95 text-cyan-200 border-cyan-400 shadow-lg shadow-cyan-950/80 ring-1 ring-fuchsia-500/40",
                highlight: "bg-cyan-300/50",
                textPrimary: "text-cyan-300 font-black",
                textSecondary: "text-fuchsia-300 font-bold",
                accent: "bg-cyan-400"
            };
        }
        if (theme === "crimson") {
            return {
                container: "bg-gradient-to-r from-rose-950/95 via-red-950/90 to-slate-950/95 text-rose-100 border-rose-500 shadow-lg shadow-rose-950/80 ring-1 ring-rose-500/30",
                highlight: "bg-rose-300/40",
                textPrimary: "text-rose-300 font-black",
                textSecondary: "text-rose-200/80 font-bold",
                accent: "bg-rose-500"
            };
        }
        // Default Obsidian Glass
        if (category === "resolution") {
            return {
                container: "bg-slate-950/95 text-white border-amber-400/80 shadow-lg shadow-black/60",
                highlight: "bg-white/40",
                textPrimary: "text-amber-300 font-black",
                textSecondary: "text-amber-200/80 font-bold",
                accent: "bg-amber-400"
            };
        }
        if (category === "hdr" || isDovetail) {
            return {
                container: "bg-slate-950/95 text-purple-200 border-purple-400/80 shadow-lg shadow-black/60",
                highlight: "bg-white/40",
                textPrimary: "text-purple-300 font-black",
                textSecondary: "text-purple-200/80 font-bold",
                accent: "bg-purple-400"
            };
        }
        if (category === "audio") {
            return {
                container: "bg-slate-950/95 text-sky-200 border-sky-400/80 shadow-lg shadow-black/60",
                highlight: "bg-white/40",
                textPrimary: "text-sky-300 font-black",
                textSecondary: "text-sky-200/80 font-bold",
                accent: "bg-sky-400"
            };
        }
        if (category === "codec") {
            return {
                container: "bg-slate-950/95 text-indigo-200 border-indigo-400/70 shadow-lg shadow-black/60",
                highlight: "bg-white/40",
                textPrimary: "text-indigo-300 font-black",
                textSecondary: "text-indigo-200/80 font-bold",
                accent: "bg-indigo-400"
            };
        }
        if (category === "edition") {
            return {
                container: "bg-slate-950/95 text-sky-300 border-sky-400/80 shadow-lg shadow-black/60",
                highlight: "bg-white/40",
                textPrimary: "text-sky-300 font-black",
                textSecondary: "text-sky-200/80 font-bold",
                accent: "bg-sky-400"
            };
        }
        if (category === "studio") {
            return {
                container: "bg-slate-950/95 text-purple-300 border-purple-500/80 shadow-lg shadow-black/60",
                highlight: "bg-white/40",
                textPrimary: "text-purple-300 font-black",
                textSecondary: "text-purple-200/80 font-bold",
                accent: "bg-purple-500"
            };
        }
        if (category === "ratings" || category === "contentRating") {
            return {
                container: "bg-slate-950/95 text-amber-300 border-amber-500/80 shadow-lg shadow-black/60",
                highlight: "bg-white/40",
                textPrimary: "text-amber-300 font-black",
                textSecondary: "text-amber-200/80 font-bold",
                accent: "bg-amber-400"
            };
        }
        return {
            container: "bg-slate-950/95 text-white border-purple-400/80 shadow-lg shadow-black/60",
            highlight: "bg-white/40",
            textPrimary: "text-white font-black",
            textSecondary: "text-slate-300 font-bold",
            accent: "bg-purple-400"
        };
    };

    // Computes badges positioned in a specific bucket, sorted by layerPriorityOrder
    const getActiveBadgesForPosition = (pos: string) => {
        const items: Array<{
            key: string;
            category: string;
            jsx: React.ReactNode;
        }> = [];

        const realRes = simSelectedRealItem?.detectedBadges?.resolution || simSelectedRealItem?.media?.[0]?.videoResolution;
        const realHdr = simSelectedRealItem?.detectedBadges?.hdr || (simSelectedRealItem?.media?.[0]?.hdrFormat !== "SDR" ? simSelectedRealItem?.media?.[0]?.hdrFormat : undefined);
        const realCodec = simSelectedRealItem?.detectedBadges?.codec || simSelectedRealItem?.media?.[0]?.videoCodec;
        const realAudio = simSelectedRealItem?.detectedBadges?.audio || simSelectedRealItem?.media?.[0]?.audioProfile || simSelectedRealItem?.media?.[0]?.audioCodec;
        const realChannels = simSelectedRealItem?.detectedBadges?.audioChannels || (simSelectedRealItem?.media?.[0]?.audioChannels ? `${simSelectedRealItem.media[0].audioChannels}` : undefined);
        const realEdition = simSelectedRealItem?.editionTitle || simSelectedRealItem?.detectedBadges?.edition;
        const realStudio = simSelectedRealItem?.detectedBadges?.studio || simSelectedRealItem?.studio;
        const realRating = simSelectedRealItem?.detectedBadges?.contentRating || simSelectedRealItem?.contentRating;

        const simDetected = {
            resolution: simShowResolution ? (realRes || "4K") : undefined,
            hdr: simShowHdr ? (realHdr || "DV") : undefined,
            codec: simShowCodec ? (realCodec || "HEVC") : undefined,
            audio: simShowAudio ? (realAudio || "ATMOS") : undefined,
            audioChannels: simShowChannels ? (realChannels || "7.1") : undefined,
            edition: simShowEdition ? (realEdition || "IMAX") : undefined,
            studio: simShowStudio ? (realStudio || "HBO") : undefined,
            contentRating: simShowRating ? (realRating || "PG-13") : undefined
        };

        const renderCustomOrVectorBadge = (badge: any, vectorFallbackJsx: React.ReactNode, category: string) => {
            const catScale = simCategoryScales[category] ?? 1.0;
            const effectiveScale = (simBadgeScale || 1.0) * catScale;
            const origin = pos.includes("left") ? "left center" : pos.includes("right") ? "right center" : "center";

            if (badge) {
                return (
                    <div 
                        key={`custom-badge-${badge.id}`} 
                        className="transition-all duration-200 drop-shadow-2xl flex items-center justify-center pointer-events-auto"
                        style={{ 
                            transform: `scale(${effectiveScale})`, 
                            transformOrigin: origin 
                        }}
                    >
                        <img 
                            src={`/api/curation/badges/${encodeURIComponent(badge.id)}`}
                            alt={badge.name}
                            className="max-h-7 max-w-[125px] object-contain drop-shadow-md"
                            onError={(e) => {
                                const el = e.currentTarget;
                                el.style.display = "none";
                                if (el.nextElementSibling) {
                                    (el.nextElementSibling as HTMLElement).style.display = "flex";
                                }
                            }}
                        />
                        <div style={{ display: "none" }}>
                            {vectorFallbackJsx}
                        </div>
                    </div>
                );
            }

            return (
                <div 
                    key={`vector-badge-${category}-${pos}`}
                    className="transition-all duration-200 drop-shadow-2xl flex items-center justify-center pointer-events-auto"
                    style={{ 
                        transform: `scale(${effectiveScale})`, 
                        transformOrigin: origin 
                    }}
                >
                    {vectorFallbackJsx}
                </div>
            );
        };

        const isDovetailed = simDovetailResolutionHdr && 
            simShowResolution && 
            simShowHdr && 
            Boolean(simDetected.hdr) &&
            simResolutionPosition === simHdrPosition &&
            simResolutionPosition === pos;

        // Check for official composite dovetail custom badge (e.g. 4k + dv, 4k + hdr, 1080p + hdr)
        const matchingDovetailCustom = isDovetailed ? customBadges.find(cb => 
            cb.enabled && 
            (getCustomBadgeCategoriesClient(cb).includes("resolution") || getCustomBadgeCategoriesClient(cb).includes("hdr")) && 
            doesCustomBadgeMatchDetected(cb, simDetected) &&
            (cb.matchRule?.includes("+") || cb.id.includes("dv") || cb.id.includes("hdr"))
        ) : undefined;

        const matchingResCustom = customBadges.find(cb => 
            cb.enabled && 
            getCustomBadgeCategoriesClient(cb).includes("resolution") && 
            doesCustomBadgeMatchDetected(cb, simDetected) &&
            !cb.matchRule?.includes("+")
        );
        const matchingHdrCustom = customBadges.find(cb => 
            cb.enabled && 
            getCustomBadgeCategoriesClient(cb).includes("hdr") && 
            doesCustomBadgeMatchDetected(cb, simDetected) &&
            !cb.matchRule?.includes("+")
        );

        // 1. Dovetailed Resolution + HDR
        if (isDovetailed) {
            const st = getThemeBadgeStyle(simTheme, "hdr", true);
            const resText = (simDetected.resolution || "4K").toUpperCase();
            const hdrText = (simDetected.hdr || "DOLBY VISION").toUpperCase();
            const dovetailVectorJsx = (
                <div key="dovetail" className={`relative px-2 py-0.5 rounded-md border text-[9px] font-black tracking-wider flex items-center gap-1.5 shadow-lg overflow-hidden backdrop-blur-md ${st.container}`}>
                    <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                    <span className={st.textPrimary}>{resText}</span>
                    <span className={`text-[7.5px] tracking-widest ${st.textSecondary}`}>{resText.includes("4K") ? "UHD" : "FHD"}</span>
                    <div className="h-2.5 w-[1px] bg-white/30 mx-0.5 relative flex items-center justify-center">
                        <div className="w-1 h-1 rounded-full bg-white/50" />
                    </div>
                    <span className={`w-1.5 h-2.5 rounded-sm inline-block shrink-0 ${st.accent}`} />
                    <span className={`text-[8px] tracking-widest font-black ${st.textSecondary}`}>{hdrText}</span>
                </div>
            );

            items.push({
                key: "resolution",
                category: "resolution",
                jsx: renderCustomOrVectorBadge(matchingDovetailCustom, dovetailVectorJsx, "resolution")
            });
        } else {
            // Independent Resolution
            if (simShowResolution && simResolutionPosition === pos) {
                const st = getThemeBadgeStyle(simTheme, "resolution");
                const resText = (simDetected.resolution || "4K").toUpperCase();
                const resVectorJsx = (
                    <div key="res" className={`relative px-2 py-0.5 rounded-md border text-[10px] font-black tracking-wider flex items-center gap-1 shadow-lg overflow-hidden backdrop-blur-md ${st.container}`}>
                        <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                        <span className={st.textPrimary}>{resText}</span>
                        <span className={`text-[8px] border-l border-current pl-1 ml-0.5 tracking-widest ${st.textSecondary}`}>{resText.includes("4K") ? "UHD" : "FHD"}</span>
                    </div>
                );
                items.push({
                    key: "resolution",
                    category: "resolution",
                    jsx: renderCustomOrVectorBadge(matchingResCustom, resVectorJsx, "resolution")
                });
            }
            // Independent HDR
            if (simShowHdr && simHdrPosition === pos) {
                const st = getThemeBadgeStyle(simTheme, "hdr");
                const hdrText = (simDetected.hdr || "DOLBY VISION").toUpperCase();
                const hdrVectorJsx = (
                    <div key="hdr" className={`relative px-2 py-0.5 rounded-md border text-[9px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md flex items-center gap-1 ${st.container}`}>
                        <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                        <span className={`w-1.5 h-2.5 rounded-sm inline-block mr-0.5 ${st.accent}`} />
                        <span className={st.textPrimary}>{hdrText}</span>
                    </div>
                );
                items.push({
                    key: "hdr",
                    category: "hdr",
                    jsx: renderCustomOrVectorBadge(matchingHdrCustom, hdrVectorJsx, "hdr")
                });
            }
        }

        // Video Codec
        if (simShowCodec && simCodecPosition === pos) {
            const matchingCodecCustom = customBadges.find(cb => 
                cb.enabled && 
                getCustomBadgeCategoriesClient(cb).includes("codec") && 
                doesCustomBadgeMatchDetected(cb, simDetected)
            );
            const st = getThemeBadgeStyle(simTheme, "codec");
            const codecText = (simDetected.codec || "HEVC").toUpperCase();
            const codecVectorJsx = (
                <div key="codec" className={`relative px-1.5 py-0.5 rounded-md border text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md ${st.container}`}>
                    <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                    <span className={st.textPrimary}>{codecText}</span>
                </div>
            );
            items.push({
                key: "codec",
                category: "codec",
                jsx: renderCustomOrVectorBadge(matchingCodecCustom, codecVectorJsx, "codec")
            });
        }

        // Audio Codec
        if (simShowAudio && simAudioPosition === pos) {
            const matchingAudioCustom = customBadges.find(cb => 
                cb.enabled && 
                getCustomBadgeCategoriesClient(cb).includes("audio") && 
                doesCustomBadgeMatchDetected(cb, simDetected)
            );
            const st = getThemeBadgeStyle(simTheme, "audio");
            const audioText = (simDetected.audio || "DOLBY ATMOS").toUpperCase();
            const audioVectorJsx = (
                <div key="audio" className={`relative px-2 py-0.5 rounded-md border text-[9px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md ${st.container}`}>
                    <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                    <span className={st.textPrimary}>{audioText}</span>
                </div>
            );
            items.push({
                key: "audio",
                category: "audio",
                jsx: renderCustomOrVectorBadge(matchingAudioCustom, audioVectorJsx, "audio")
            });
        }

        // Audio Channels
        if (simShowChannels && simChannelsPosition === pos) {
            const matchingChannelsCustom = customBadges.find(cb => 
                cb.enabled && 
                getCustomBadgeCategoriesClient(cb).includes("channels") && 
                doesCustomBadgeMatchDetected(cb, simDetected)
            );
            const st = getThemeBadgeStyle(simTheme, "audio");
            const channelsText = simDetected.audioChannels ? `${simDetected.audioChannels} SURROUND` : "7.1 SURROUND";
            const channelsVectorJsx = (
                <div key="channels" className={`relative px-1.5 py-0.5 rounded-md border text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md ${st.container}`}>
                    <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                    <span className={st.textPrimary}>{channelsText}</span>
                </div>
            );
            items.push({
                key: "channels",
                category: "channels",
                jsx: renderCustomOrVectorBadge(matchingChannelsCustom, channelsVectorJsx, "channels")
            });
        }

        // Edition / Cut
        if (simShowEdition && simEditionPosition === pos) {
            const matchingEditionCustom = customBadges.find(cb => 
                cb.enabled && 
                getCustomBadgeCategoriesClient(cb).includes("edition") && 
                doesCustomBadgeMatchDetected(cb, simDetected)
            );
            const st = getThemeBadgeStyle(simTheme, "edition");
            const editionText = (simDetected.edition || "IMAX ENHANCED").toUpperCase();
            const editionVectorJsx = (
                <div key="edition" className={`relative px-2 py-0.5 rounded-md border text-[8px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md ${st.container}`}>
                    <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                    <span className={st.textPrimary}>{editionText}</span>
                </div>
            );
            items.push({
                key: "edition",
                category: "edition",
                jsx: renderCustomOrVectorBadge(matchingEditionCustom, editionVectorJsx, "edition")
            });
        }

        // Studio / Network
        if (simShowStudio && simStudioPosition === pos) {
            const matchingStudioCustom = customBadges.find(cb => 
                cb.enabled && 
                getCustomBadgeCategoriesClient(cb).includes("studio") && 
                doesCustomBadgeMatchDetected(cb, simDetected)
            );
            const st = getThemeBadgeStyle(simTheme, "studio");
            const studioText = (simDetected.studio || "HBO MAX").toUpperCase();
            const studioVectorJsx = (
                <div key="studio" className={`relative px-2 py-0.5 rounded-md border text-[8px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md ${st.container}`}>
                    <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                    <span className={st.textPrimary}>{studioText}</span>
                </div>
            );
            items.push({
                key: "studio",
                category: "studio",
                jsx: renderCustomOrVectorBadge(matchingStudioCustom, studioVectorJsx, "studio")
            });
        }

        // Age Rating
        if (simShowRating && simRatingPosition === pos) {
            const matchingRatingCustom = customBadges.find(cb => 
                cb.enabled && 
                getCustomBadgeCategoriesClient(cb).includes("contentRating") && 
                doesCustomBadgeMatchDetected(cb, simDetected)
            );
            const st = getThemeBadgeStyle(simTheme, "contentRating");
            const ratingText = (simDetected.contentRating || "PG-13").toUpperCase();
            const ratingVectorJsx = (
                <div key="rating" className={`relative px-1.5 py-0.5 rounded border text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md ${st.container}`}>
                    <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                    <span className={st.textPrimary}>{ratingText}</span>
                </div>
            );
            items.push({
                key: "contentRating",
                category: "contentRating",
                jsx: renderCustomOrVectorBadge(matchingRatingCustom, ratingVectorJsx, "contentRating")
            });
        }

        // Community Ratings
        if (simRatings && simRatingsPosition === pos) {
            const matchingRatingsCustom = customBadges.find(cb => 
                cb.enabled && 
                getCustomBadgeCategoriesClient(cb).includes("ratings") && 
                doesCustomBadgeMatchDetected(cb, simDetected)
            );
            const st = getThemeBadgeStyle(simTheme, "ratings");
            const ratingsVectorJsx = (
                <div key="ratings" className={`relative flex items-center gap-1.5 px-2 py-0.5 rounded-md border shadow-lg text-[10px] overflow-hidden backdrop-blur-md ${st.container}`}>
                    <div className={`absolute top-0 left-1 right-1 h-[1px] rounded-full pointer-events-none ${st.highlight}`} />
                    <div className="bg-yellow-400 text-black font-black px-1 rounded text-[8.5px] leading-tight">IMDb</div>
                    <span className="font-bold text-white text-[10px]">8.6</span>
                    <span className="text-[10px]">🍅</span>
                    <span className="font-bold text-white text-[10px]">94%</span>
                </div>
            );
            items.push({
                key: "ratings",
                category: "ratings",
                jsx: renderCustomOrVectorBadge(matchingRatingsCustom, ratingsVectorJsx, "ratings")
            });
        }

        // Sort items according to user-configured layer priority
        items.sort((a, b) => {
            const idxA = layerPriorityOrder.indexOf(a.key);
            const idxB = layerPriorityOrder.indexOf(b.key);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

        return items.map(it => it.jsx);
    };

    // Authentic 45-Degree Corner Ribbon Simulator (Single Waterfall Winning Ribbon)
    const renderSimulatorCornerRibbon = () => {
        if (!simShowRibbon) return null;
        const winningRibbon = getActiveSimulatorRibbon();
        if (!winningRibbon || !winningRibbon.text) return null;

        const isTop = simRibbonPosition.startsWith("top");
        const isRight = simRibbonPosition.endsWith("right");

        const positionClasses: Record<string, string> = {
            "top-right": "top-0 right-0",
            "top-left": "top-0 left-0",
            "bottom-right": "bottom-0 right-0",
            "bottom-left": "bottom-0 left-0"
        };

        const matchingRibbonCustom = customBadges.find(cb => 
            cb.enabled && 
            getCustomBadgeCategoriesClient(cb).includes("ribbon") && 
            (
                cb.matchRule === winningRibbon.matchedType ||
                cb.name.toLowerCase().includes(winningRibbon.text.toLowerCase()) ||
                winningRibbon.text.toLowerCase().includes(cb.name.toLowerCase())
            )
        );

        const ribbonCatScale = simCategoryScales.ribbon ?? 1.0;
        const effectiveRibbonScale = (simBadgeScale || 1.0) * ribbonCatScale;
        const ribbonOrigin = isTop 
            ? (isRight ? "top right" : "top left")
            : (isRight ? "bottom right" : "bottom left");

        if (matchingRibbonCustom) {
            return (
                <div 
                    className={`absolute ${positionClasses[simRibbonPosition] || "top-0 right-0"} w-28 h-28 overflow-hidden pointer-events-none z-30 drop-shadow-2xl transition-all duration-200`}
                    style={{ transform: `scale(${effectiveRibbonScale})`, transformOrigin: ribbonOrigin }}
                >
                    <img 
                        src={`/api/curation/badges/${encodeURIComponent(matchingRibbonCustom.id)}`}
                        alt={matchingRibbonCustom.name}
                        className="w-full h-full object-contain drop-shadow-xl"
                    />
                </div>
            );
        }

        const theme = winningRibbon.theme || "purple";
        const cleanText = winningRibbon.text.trim().toUpperCase();

        const isOscar = cleanText.includes("OSCAR") || cleanText.includes("ACADEMY");
        const isTop250 = cleanText.includes("250") || cleanText.includes("IMDB");
        const isCannes = cleanText.includes("CANNES") || cleanText.includes("PALME");
        const isCriterion = cleanText.includes("CRITERION");
        const isLeaving = cleanText.includes("LEAVING");

        const subLabel = isOscar 
            ? "- ACADEMY AWARDS -" 
            : isTop250 
                ? "- ALL-TIME BEST -" 
                : isCannes 
                    ? "- CANNES WINNER -" 
                    : isCriterion 
                        ? "- SPECIAL EDITION -" 
                        : isLeaving 
                            ? "- SOON -" 
                            : "- OFFICIAL SELECTION -";

        const gradientThemeMap: Record<string, { start: string; mid: string; end: string; border: string; highlight: string; text: string; subText: string }> = {
            gold: { start: "#fef08a", mid: "#f59e0b", end: "#b45309", border: "#fef9c3", highlight: "rgba(255,255,255,0.9)", text: "#000000", subText: "#1c1917" },
            crimson: { start: "#fb7185", mid: "#e11d48", end: "#881337", border: "#fda4af", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#ffe4e6" },
            emerald: { start: "#6ee7b7", mid: "#059669", end: "#064e3b", border: "#a7f3d0", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#d1fae5" },
            purple: { start: "#c7d2fe", mid: "#6366f1", end: "#3730a3", border: "#e0e7ff", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#e0e7ff" },
            cyan: { start: "#7dd3fc", mid: "#0284c7", end: "#075985", border: "#bae6fd", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#e0f2fe" },
            pink: { start: "#fbcfe8", mid: "#db2777", end: "#831843", border: "#fce7f3", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#fdf2f8" },
            glass: { start: "#94a3b8", mid: "#1e293b", end: "#020617", border: "#cbd5e1", highlight: "rgba(255,255,255,0.7)", text: "#f8fafc", subText: "#cbd5e1" },
            orange: { start: "#fed7aa", mid: "#ea580c", end: "#9a3412", border: "#ffedd5", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#ffedd5" }
        };

        const g = gradientThemeMap[theme] || gradientThemeMap.purple;
        const isTopRight = isTop && isRight;
        const isTopLeft = isTop && !isRight;
        const isBottomRight = !isTop && isRight;
        const isBottomLeft = !isTop && !isRight;

        // Position polygon vertices and text angles (180x180 viewBox)
        let polygonPoints = "52,0 125,0 180,55 180,128";
        let highlightLine = { x1: "52", y1: "0", x2: "180", y2: "128" };
        let shadowLine = { x1: "125", y1: "0", x2: "180", y2: "55" };
        let textTransform = "translate(134.5, 45.5) rotate(45)";

        if (isTopLeft) {
            polygonPoints = "55,0 128,0 0,128 0,55";
            highlightLine = { x1: "128", y1: "0", x2: "0", y2: "128" };
            shadowLine = { x1: "55", y1: "0", x2: "0", y2: "55" };
            textTransform = "translate(45.5, 45.5) rotate(-45)";
        } else if (isBottomRight) {
            polygonPoints = "180,52 180,125 125,180 52,180";
            highlightLine = { x1: "180", y1: "52", x2: "52", y2: "180" };
            shadowLine = { x1: "180", y1: "125", x2: "125", y2: "180" };
            textTransform = "translate(134.5, 134.5) rotate(-45)";
        } else if (isBottomLeft) {
            polygonPoints = "0,52 0,125 55,180 128,180";
            highlightLine = { x1: "0", y1: "52", x2: "128", y2: "180" };
            shadowLine = { x1: "0", y1: "125", x2: "55", y2: "180" };
            textTransform = "translate(45.5, 134.5) rotate(45)";
        }

        return (
            <div 
                className={`absolute ${positionClasses[simRibbonPosition] || "top-0 right-0"} w-28 h-28 overflow-hidden pointer-events-none z-30 drop-shadow-2xl transition-all duration-200`}
                style={{ transform: `scale(${effectiveRibbonScale})`, transformOrigin: ribbonOrigin }}
            >
                <svg width="112" height="112" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
                    <defs>
                        <linearGradient id={`simRibbonGrad_${theme}`} x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={g.start} />
                            <stop offset="45%" stopColor={g.mid} />
                            <stop offset="100%" stopColor={g.end} />
                        </linearGradient>
                        <filter id="simRibbonShadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="5" stdDeviation="6" floodColor="#000" floodOpacity="0.9" />
                        </filter>
                    </defs>
                    <g filter="url(#simRibbonShadow)">
                        <polygon points={polygonPoints} fill={`url(#simRibbonGrad_${theme})`} />
                        <line x1={highlightLine.x1} y1={highlightLine.y1} x2={highlightLine.x2} y2={highlightLine.y2} stroke={g.highlight} strokeWidth="1.5" />
                        <line x1={shadowLine.x1} y1={shadowLine.y1} x2={shadowLine.x2} y2={shadowLine.y2} stroke="rgba(0,0,0,0.5)" strokeWidth="2" />
                        <g transform={textTransform}>
                            <text x="0" y="0" fontFamily="Arial, Helvetica, 'DejaVu Sans', sans-serif" fontWeight="900" fontSize="11" fill={g.text} textAnchor="middle">
                                {cleanText.length > 16 ? cleanText.slice(0, 15) + "…" : cleanText}
                            </text>
                            <text x="0" y="11" fontFamily="Arial, Helvetica, 'DejaVu Sans', sans-serif" fontWeight="800" fontSize="7" fill={g.subText} textAnchor="middle">
                                {subLabel}
                            </text>
                        </g>
                    </g>
                </svg>
            </div>
        );
    };

    const isSimulatorRibbonInCorner = (corner: string) => {
        if (!simShowRibbon) return false;
        const win = getActiveSimulatorRibbon();
        return Boolean(win && win.text && simRibbonPosition === corner);
    };

    // Calculate active overlays breakdown for the Live Simulator
    const getSimulatedLayersBreakdown = () => {
        const layers: Array<{
            category: string;
            value: string;
            sourceType: "custom" | "builtin";
            sourceName: string;
            position: string;
        }> = [];

        const realRes = simSelectedRealItem?.detectedBadges?.resolution || simSelectedRealItem?.media?.[0]?.videoResolution;
        const realHdr = simSelectedRealItem?.detectedBadges?.hdr || (simSelectedRealItem?.media?.[0]?.hdrFormat !== "SDR" ? simSelectedRealItem?.media?.[0]?.hdrFormat : undefined);
        const realCodec = simSelectedRealItem?.detectedBadges?.codec || simSelectedRealItem?.media?.[0]?.videoCodec;
        const realAudio = simSelectedRealItem?.detectedBadges?.audio || simSelectedRealItem?.media?.[0]?.audioProfile || simSelectedRealItem?.media?.[0]?.audioCodec;
        const realChannels = simSelectedRealItem?.detectedBadges?.audioChannels || (simSelectedRealItem?.media?.[0]?.audioChannels ? `${simSelectedRealItem.media[0].audioChannels}` : undefined);
        const realEdition = simSelectedRealItem?.editionTitle || simSelectedRealItem?.detectedBadges?.edition;
        const realStudio = simSelectedRealItem?.detectedBadges?.studio || simSelectedRealItem?.studio;
        const realRating = simSelectedRealItem?.detectedBadges?.contentRating || simSelectedRealItem?.contentRating;

        const simDetected = {
            resolution: simShowResolution ? (realRes || "4K") : undefined,
            hdr: simShowHdr ? (realHdr || "DV") : undefined,
            codec: simShowCodec ? (realCodec || "HEVC") : undefined,
            audio: simShowAudio ? (realAudio || "ATMOS") : undefined,
            audioChannels: simShowChannels ? (realChannels || "7.1") : undefined,
            edition: simShowEdition ? (realEdition || "IMAX") : undefined,
            studio: simShowStudio ? (realStudio || "HBO") : undefined,
            contentRating: simShowRating ? (realRating || "PG-13") : undefined
        };

        const isDovetailed = simDovetailResolutionHdr && 
            simShowResolution && 
            simShowHdr && 
            (simResolutionPosition || "top-right") === (simHdrPosition || "top-right");

        const matchingResCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("resolution") && doesCustomBadgeMatchDetected(cb, simDetected));
        const matchingHdrCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("hdr") && doesCustomBadgeMatchDetected(cb, simDetected));

        if (isDovetailed && !matchingResCustom && !matchingHdrCustom) {
            layers.push({
                category: "Resolution + HDR (Dovetailed)",
                value: "4K UHD • DOLBY VISION",
                sourceType: "builtin",
                sourceName: `Kometa Dovetail SVG (${simTheme === "gold" ? "Gold" : simTheme === "cyber" ? "Cyber" : simTheme === "crimson" ? "Crimson" : "Obsidian"})`,
                position: simResolutionPosition
            });
        } else {
            if (simShowResolution) {
                const resVal = simDetected.resolution === "4K" ? "4K UHD" : (simDetected.resolution || "4K UHD");
                if (matchingResCustom) {
                    layers.push({ category: "Resolution", value: resVal, sourceType: "custom", sourceName: matchingResCustom.name, position: simResolutionPosition });
                } else {
                    layers.push({ category: "Resolution", value: resVal, sourceType: "builtin", sourceName: `Kometa SVG (${simTheme})`, position: simResolutionPosition });
                }
            }

            if (simShowHdr) {
                const hdrVal = simDetected.hdr === "DV" ? "Dolby Vision" : (simDetected.hdr || "Dolby Vision");
                if (matchingHdrCustom) {
                    layers.push({ category: "HDR / DV", value: hdrVal, sourceType: "custom", sourceName: matchingHdrCustom.name, position: simHdrPosition });
                } else {
                    layers.push({ category: "HDR / DV", value: hdrVal, sourceType: "builtin", sourceName: `Kometa SVG (${simTheme})`, position: simHdrPosition });
                }
            }
        }

        if (simShowCodec) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("codec") && doesCustomBadgeMatchDetected(cb, simDetected));
            const codecVal = simDetected.codec ? `${simDetected.codec}` : "HEVC (H.265)";
            if (matchingCustom) {
                layers.push({ category: "Video Codec", value: codecVal, sourceType: "custom", sourceName: matchingCustom.name, position: simCodecPosition });
            } else {
                layers.push({ category: "Video Codec", value: codecVal, sourceType: "builtin", sourceName: "Kometa SVG", position: simCodecPosition });
            }
        }

        if (simShowAudio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("audio") && doesCustomBadgeMatchDetected(cb, simDetected));
            const audioVal = simDetected.audio ? `${simDetected.audio}` : "Dolby Atmos";
            if (matchingCustom) {
                layers.push({ category: "Audio Format", value: audioVal, sourceType: "custom", sourceName: matchingCustom.name, position: simAudioPosition });
            } else {
                layers.push({ category: "Audio Format", value: audioVal, sourceType: "builtin", sourceName: "Kometa SVG", position: simAudioPosition });
            }
        }

        if (simShowChannels) {
            layers.push({ category: "Audio Channels", value: simDetected.audioChannels ? `${simDetected.audioChannels} Surround` : "7.1 Surround", sourceType: "builtin", sourceName: "Kometa SVG", position: simChannelsPosition });
        }

        if (simShowEdition) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("edition") && doesCustomBadgeMatchDetected(cb, simDetected));
            const editionVal = simDetected.edition || "IMAX Enhanced";
            if (matchingCustom) {
                layers.push({ category: "Edition / Cut", value: editionVal, sourceType: "custom", sourceName: matchingCustom.name, position: simEditionPosition });
            } else {
                layers.push({ category: "Edition / Cut", value: editionVal, sourceType: "builtin", sourceName: "Kometa SVG", position: simEditionPosition });
            }
        }

        if (simShowStudio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("studio") && doesCustomBadgeMatchDetected(cb, simDetected));
            const studioVal = simDetected.studio || "HBO Max";
            if (matchingCustom) {
                layers.push({ category: "Studio / Network", value: studioVal, sourceType: "custom", sourceName: matchingCustom.name, position: simStudioPosition });
            } else {
                layers.push({ category: "Studio / Network", value: studioVal, sourceType: "builtin", sourceName: "Kometa SVG", position: simStudioPosition });
            }
        }

        if (simShowRating) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("contentRating") && doesCustomBadgeMatchDetected(cb, simDetected));
            const ratingVal = simDetected.contentRating || "PG-13";
            if (matchingCustom) {
                layers.push({ category: "Age Rating", value: ratingVal, sourceType: "custom", sourceName: matchingCustom.name, position: simRatingPosition });
            } else {
                layers.push({ category: "Age Rating", value: ratingVal, sourceType: "builtin", sourceName: "Kometa SVG", position: simRatingPosition });
            }
        }

        if (simRatings) {
            layers.push({ category: "Community Ratings", value: "IMDb 8.6 • RT 94%", sourceType: "builtin", sourceName: "IMDb / Rotten Tomatoes", position: simRatingsPosition });
        }

        if (simShowRibbon) {
            const win = getActiveSimulatorRibbon();
            layers.push({ 
                category: "Corner Ribbon", 
                value: win ? `${win.text} (Priority #${win.priority})` : "None Matched", 
                sourceType: "builtin", 
                sourceName: win ? `Waterfall Ribbon (${win.theme})` : "Waterfall Ribbon (No Match)", 
                position: simRibbonPosition 
            });
        }

        return layers;
    };

    // Calculate decision matrix for media inspector
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

        const matchingRes = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("resolution") && doesCustomBadgeMatchDetected(cb, detected));
        const matchingHdr = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("hdr") && doesCustomBadgeMatchDetected(cb, detected));

        const isDovetailedInspect = simDovetailResolutionHdr &&
            Boolean(detected.resolution) &&
            Boolean(detected.hdr) &&
            (simResolutionPosition || "top-right") === (simHdrPosition || "top-right") &&
            !matchingRes &&
            !matchingHdr;

        if (isDovetailedInspect) {
            decisions.push({
                property: "Resolution + HDR (Dovetailed)",
                detectedValue: `${detected.resolution} + ${detected.hdr === "DV" ? "Dolby Vision" : detected.hdr}`,
                priority: "Priority 2 (Built-in SVG)",
                badgeName: `Dovetailed ${detected.resolution} • ${detected.hdr} SVG`,
                position: simResolutionPosition,
                isCustom: false
            });
        } else {
            if (detected.resolution) {
                decisions.push({
                    property: "Resolution",
                    detectedValue: detected.resolution,
                    priority: matchingRes ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                    badgeName: matchingRes ? matchingRes.name : `Built-in ${detected.resolution} SVG`,
                    position: simResolutionPosition,
                    isCustom: Boolean(matchingRes)
                });
            }

            if (detected.hdr) {
                decisions.push({
                    property: "Dynamic Range / HDR",
                    detectedValue: detected.hdr === "DV" ? "Dolby Vision" : detected.hdr,
                    priority: matchingHdr ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                    badgeName: matchingHdr ? matchingHdr.name : `Built-in ${detected.hdr} SVG`,
                    position: simHdrPosition,
                    isCustom: Boolean(matchingHdr)
                });
            }
        }

        if (detected.audio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("audio") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Audio Format",
                detectedValue: detected.audio,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.audio} SVG`,
                position: simAudioPosition,
                isCustom: Boolean(matchingCustom)
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
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("codec") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Video Codec",
                detectedValue: detected.codec,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.codec} SVG`,
                position: simCodecPosition,
                isCustom: Boolean(matchingCustom)
            });
        }

        if (detected.edition) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("edition") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Edition / Cut",
                detectedValue: detected.edition,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.edition} SVG`,
                position: simEditionPosition,
                isCustom: Boolean(matchingCustom)
            });
        }

        if (detected.studio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("studio") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Studio / Network",
                detectedValue: detected.studio,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.studio} SVG`,
                position: simStudioPosition,
                isCustom: Boolean(matchingCustom)
            });
        }

        if (detected.contentRating) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("contentRating") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Age Rating",
                detectedValue: detected.contentRating,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.contentRating} SVG`,
                position: simRatingPosition,
                isCustom: Boolean(matchingCustom)
            });
        }

        if (simShowRibbon) {
            const win = evaluateWaterfallRibbonClient(item, simTieredRibbons, {});
            decisions.push({
                property: "Corner Ribbon (Waterfall)",
                detectedValue: win ? `${win.text} (Priority #${win.priority})` : "No qualifying tier",
                priority: "Priority 2 (Built-in SVG)",
                badgeName: win ? `Waterfall Ribbon (${win.theme})` : "None",
                position: simRibbonPosition,
                isCustom: false
            });
        }

        return decisions;
    };

    // Save Overlay Settings
    const handleSaveOverlaySettings = async () => {
        setSavingOverlaySettings(true);
        setOverlayMessage(null);
        try {
            const existingId = overlayRules?.[0]?.id;
            const payload = {
                id: existingId,
                name: "Kometa Library Overlay",
                serverId: selectedServerId || "main",
                sectionKey: selectedSectionKey || "1",
                overlayType: "quality_badges",
                showResolution: simShowResolution,
                showHdr: simShowHdr,
                showAudio: simShowAudio,
                showAudioChannels: simShowChannels,
                showCodec: simShowCodec,
                showEdition: simShowEdition,
                showStudio: simShowStudio,
                showContentRating: simShowRating,
                showRatings: simRatings,
                badgeScale: simBadgeScale,
                theme: simTheme,
                dovetailResolutionHdr: simDovetailResolutionHdr,
                resolutionPosition: simResolutionPosition,
                hdrPosition: simHdrPosition,
                audioPosition: simAudioPosition,
                channelsPosition: simChannelsPosition,
                codecPosition: simCodecPosition,
                editionPosition: simEditionPosition,
                studioPosition: simStudioPosition,
                contentRatingPosition: simRatingPosition,
                ratingsPosition: simRatingsPosition,
                showRibbon: simShowRibbon,
                ribbonMode: simRibbonMode,
                ribbonPosition: simRibbonPosition,
                ribbonTheme: simRibbonTheme,
                ribbonType: simRibbonType,
                ribbonText: simRibbonText,
                tieredRibbons: simTieredRibbons,
                maxRibbonTiers: simMaxRibbonTiers,
                categoryScales: simCategoryScales,
                layerPriorityOrder: layerPriorityOrder
            };

            const res = await saveOverlayRuleAction(payload);
            if (res.success) {
                if (res.rule) {
                    setOverlayRules([res.rule]);
                }
                setOverlayMessage({ success: true, text: "Overlay settings saved successfully!" });
                setTimeout(() => setOverlayMessage(null), 5000);
            } else {
                setOverlayMessage({ success: false, text: res.error || "Failed saving overlay settings." });
            }
        } catch (e: any) {
            setOverlayMessage({ success: false, text: e.message || "Failed saving overlay settings." });
        } finally {
            setSavingOverlaySettings(false);
        }
    };

    // Apply Overlays to Entire Library
    const handleApplyOverlays = async () => {
        setApplyingOverlays(true);
        setOverlayMessage(null);
        try {
            const existingId = overlayRules?.[0]?.id;
            // Auto-save active studio options to rule first
            const payload: any = {
                id: existingId,
                name: "Kometa Library Overlay",
                serverId: selectedServerId,
                sectionKey: selectedSectionKey,
                overlayType: "combined",
                theme: simTheme,
                showResolution: simShowResolution,
                showHdr: simShowHdr,
                showAudio: simShowAudio,
                showAudioChannels: simShowChannels,
                showCodec: simShowCodec,
                showEdition: simShowEdition,
                showStudio: simShowStudio,
                showContentRating: simShowRating,
                showRatings: simRatings,
                dovetailResolutionHdr: simDovetailResolutionHdr,
                badgeScale: simBadgeScale,
                position: simResolutionPosition,
                videoPosition: simResolutionPosition,
                audioPosition: simAudioPosition,
                editionPosition: simEditionPosition,
                ratingPosition: simRatingPosition,
                resolutionPosition: simResolutionPosition,
                hdrPosition: simHdrPosition,
                channelsPosition: simChannelsPosition,
                codecPosition: simCodecPosition,
                studioPosition: simStudioPosition,
                contentRatingPosition: simRatingPosition,
                ratingsPosition: simRatingsPosition,
                showRibbon: simShowRibbon,
                ribbonMode: simRibbonMode,
                ribbonPosition: simRibbonPosition,
                ribbonTheme: simRibbonTheme,
                ribbonType: simRibbonType,
                ribbonText: simRibbonText,
                tieredRibbons: simTieredRibbons,
                maxRibbonTiers: simMaxRibbonTiers,
                categoryScales: simCategoryScales,
                layerPriorityOrder: layerPriorityOrder
            };

            const saveRes = await saveOverlayRuleAction(payload);
            if (saveRes.rule) {
                setOverlayRules([saveRes.rule]);
            }
            const savedRuleId = saveRes.rule?.id || existingId;

            const res = await applyOverlaysToLibraryAction(selectedServerId, selectedSectionKey, savedRuleId, {
                batchSize: overlayBatchSize,
                mode: overlayBatchMode
            });
            if (res.success) {
                setOverlayMessage({ success: true, text: res.message || "Overlays applied to library successfully!" });
            } else {
                setOverlayMessage({ success: false, text: res.error || "Failed applying overlays." });
            }
        } catch (e: any) {
            setOverlayMessage({ success: false, text: e.message || "Failed applying overlays." });
        } finally {
            setApplyingOverlays(false);
        }
    };

    // Restore Original Posters
    const handleRevertOverlays = async () => {
        setRevertingOverlays(true);
        setOverlayMessage(null);
        try {
            const res: any = await revertLibraryOverlaysAction(selectedServerId);
            if (res.success) {
                setOverlayMessage({ success: true, text: res.message || "Original artwork restored from backup vault!" });
            } else {
                setOverlayMessage({ success: false, text: res.error || "Failed restoring original artwork." });
            }
        } catch (e: any) {
            setOverlayMessage({ success: false, text: e.message || "Failed restoring original artwork." });
        } finally {
            setRevertingOverlays(false);
        }
    };

    // Kometa YAML Importer Handlers
    const processKometaFile = (file: File) => {
        setKometaUploadingFile(true);
        setKometaInspecting(true);
        setKometaLoadedFileName(file.name);
        setKometaLoadedFileSize(`${(file.size / 1024).toFixed(1)} KB`);
        setKometaImportSuccessMsg(`Ingesting "${file.name}"...`);
        setKometaImportErrorMsg(null);

        const reader = new FileReader();
        reader.onload = async (event) => {
            const text = event.target?.result as string;
            if (text) {
                setKometaYamlInput(text);
                try {
                    const inspectRes = await inspectKometaConfigFileAction(text);
                    if (inspectRes.success) {
                        setKometaInspectionResult(inspectRes);
                        if (inspectRes.parsed?.libraries) {
                            setKometaLibMappings(initKometaLibraryMappings(inspectRes.parsed.libraries, selectedServerId));
                        }
                        setKometaImportSuccessMsg(`✓ Successfully ingested "${file.name}" (${(file.size / 1024).toFixed(1)} KB) with ${inspectRes.libraryCount || 0} libraries!`);
                    } else {
                        setKometaImportErrorMsg(inspectRes.error || "Failed parsing YAML syntax.");
                    }
                } catch (err: any) {
                    setKometaImportErrorMsg(err.message || "Failed parsing uploaded YAML.");
                } finally {
                    setKometaInspecting(false);
                    setKometaUploadingFile(false);
                }
            } else {
                setKometaInspecting(false);
                setKometaUploadingFile(false);
                setKometaImportErrorMsg("Uploaded file is empty.");
            }
        };
        reader.onerror = () => {
            setKometaInspecting(false);
            setKometaUploadingFile(false);
            setKometaImportErrorMsg("Error reading file from disk.");
        };
        reader.readAsText(file);
    };

    const handleFileUploadKometa = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        processKometaFile(file);
        e.target.value = "";
    };

    const handleDropKometaFile = (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setKometaIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
            processKometaFile(file);
        }
    };

    const handleLoadDiskKometaConfig = async (customPath?: string) => {
        const pathName = customPath || "kometaconfig.yml";
        setKometaLoadingDisk(true);
        setKometaInspecting(true);
        setKometaLoadedFileName(pathName);
        setKometaImportSuccessMsg(`Loading "${pathName}" from server disk...`);
        setKometaImportErrorMsg(null);
        try {
            const diskRes = await readLocalKometaConfigAction(customPath);
            if (diskRes.success && diskRes.content) {
                setKometaYamlInput(diskRes.content);
                setKometaLoadedFileName(diskRes.fileName || pathName);
                setKometaLoadedFileSize(`${((diskRes.content.length) / 1024).toFixed(1)} KB`);
                const inspectRes = await inspectKometaConfigFileAction(diskRes.content, customPath);
                if (inspectRes.success) {
                    setKometaInspectionResult(inspectRes);
                    if (inspectRes.parsed?.libraries) {
                        setKometaLibMappings(initKometaLibraryMappings(inspectRes.parsed.libraries, selectedServerId));
                    }
                    setKometaImportSuccessMsg(`✓ Loaded "${diskRes.fileName}" (${diskRes.lineCount} lines, ${inspectRes.libraryCount || 0} libraries detected)!`);
                } else {
                    setKometaImportErrorMsg(inspectRes.error || "Failed inspecting file.");
                }
            } else {
                setKometaLoadedFileName(null);
                setKometaLoadedFileSize(null);
                setKometaImportErrorMsg(diskRes.error || `File "${pathName}" not found on server disk.`);
            }
        } catch (e: any) {
            setKometaLoadedFileName(null);
            setKometaLoadedFileSize(null);
            setKometaImportErrorMsg(e.message || "Failed loading file.");
        } finally {
            setKometaLoadingDisk(false);
            setKometaInspecting(false);
        }
    };

    const handleClearKometaConfig = () => {
        setKometaYamlInput("");
        setKometaLoadedFileName(null);
        setKometaLoadedFileSize(null);
        setKometaInspectionResult(null);
        setKometaLibMappings([]);
        setKometaImportSuccessMsg(null);
        setKometaImportErrorMsg(null);
    };

    const initKometaLibraryMappings = (parsedLibraries: Record<string, any>, defaultSrvId?: string) => {
        if (!parsedLibraries) return [];
        const targetSrv = servers.find(s => s.serverId === defaultSrvId) || servers[0];
        const srvSections = targetSrv?.sections || [];

        return Object.keys(parsedLibraries).map(libName => {
            const cleanName = libName.toLowerCase().trim();
            const matched = srvSections.find((s: any) => 
                s.title?.toLowerCase().trim() === cleanName ||
                (cleanName.includes("movie") && s.type === "movie") ||
                ((cleanName.includes("tv") || cleanName.includes("show")) && s.type === "show")
            );
            return {
                kometaLibName: libName,
                serverId: targetSrv?.serverId || defaultSrvId || "main",
                sectionKey: matched ? String(matched.key) : (srvSections[0] ? String(srvSections[0].key) : "1"),
                enabled: true
            };
        });
    };

    const handleApplyKometaToSimulator = async (overrideLibName?: string) => {
        let converted: any = null;
        if (kometaInspectionResult?.convertedLibraries) {
            const keys = Object.keys(kometaInspectionResult.convertedLibraries);
            const targetKey = overrideLibName || keys.find(k => k.toLowerCase().includes("movie")) || keys[0];
            converted = kometaInspectionResult.convertedLibraries[targetKey];
        }

        if (!converted) {
            try {
                const inspectRes = await inspectKometaConfigFileAction();
                if (inspectRes.success && inspectRes.convertedLibraries) {
                    setKometaInspectionResult(inspectRes);
                    const keys = Object.keys(inspectRes.convertedLibraries);
                    const targetKey = overrideLibName || keys.find(k => k.toLowerCase().includes("movie")) || keys[0];
                    converted = inspectRes.convertedLibraries[targetKey];
                }
            } catch (e) {}
        }

        if (converted) {
            setSimShowResolution(Boolean(converted.showResolution));
            setSimShowHdr(Boolean(converted.showHdr));
            setSimResolutionPosition(converted.resolutionPosition || "top-right");
            setSimHdrPosition(converted.hdrPosition || "top-right");
            setSimDovetailResolutionHdr(converted.dovetailResolutionHdr ?? true);
            setSimShowAudio(Boolean(converted.showAudio));
            setSimAudioPosition(converted.audioPosition || "top-left");
            setSimShowChannels(Boolean(converted.showAudioChannels));
            setSimChannelsPosition(converted.channelsPosition || "top-left");
            setSimShowCodec(Boolean(converted.showCodec));
            setSimCodecPosition(converted.codecPosition || "top-right");
            setSimShowEdition(Boolean(converted.showEdition));
            setSimEditionPosition(converted.editionPosition || "top-left");
            setSimShowStudio(Boolean(converted.showStudio));
            setSimStudioPosition(converted.studioPosition || "bottom-left");
            setSimShowRating(Boolean(converted.showContentRating));
            setSimRatingPosition(converted.contentRatingPosition || "bottom-left");
            setSimRatings(Boolean(converted.showRatings));
            setSimRatingsPosition(converted.ratingsPosition || "bottom-right");
            setSimShowRibbon(Boolean(converted.showRibbon));
            setSimRibbonPosition(converted.ribbonPosition || "bottom-right");
            setSimRibbonMode(converted.ribbonMode || "waterfall");
            setSimRibbonTheme(converted.ribbonTheme || "gold");
            setSimMaxRibbonTiers(converted.maxRibbonTiers || 3);
            if (Array.isArray(converted.tieredRibbons)) {
                setSimTieredRibbons(converted.tieredRibbons);
            }
        }
    };

    // Custom Badge Handlers
    const handleSyncOfficialKometaBadges = async () => {
        setSyncingOfficialBadges(true);
        try {
            const res = await syncOfficialKometaBadgesAction();
            if (res.success && res.badges) {
                setCustomBadges(res.badges);
                setOverlayMessage({ success: true, text: res.message || "Synced official Kometa overlays!" });
            } else {
                setOverlayMessage({ success: false, text: res.error || "Failed syncing official Kometa overlays." });
            }
        } catch (e: any) {
            setOverlayMessage({ success: false, text: e.message || "Failed syncing official Kometa overlays." });
        } finally {
            setSyncingOfficialBadges(false);
        }
    };

    const handleSeedDefaultBadges = async () => {
        setSeedingBadges(true);
        try {
            const res = await seedDefaultCustomBadgesAction();
            if (res.success && res.badges) {
                setCustomBadges(res.badges);
                setOverlayMessage({ success: true, text: res.message || "Installed default badges!" });
            } else {
                setOverlayMessage({ success: false, text: res.error || "Failed installing default badges." });
            }
        } catch (e: any) {
            setOverlayMessage({ success: false, text: e.message || "Failed installing default badges." });
        } finally {
            setSeedingBadges(false);
        }
    };

    const handleUploadCustomBadge = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!badgeUploadFile) {
            setBadgeUploadError("Please select an SVG, PNG, or WebP file to upload.");
            return;
        }
        setUploadingBadge(true);
        setBadgeUploadError(null);
        try {
            const formData = new FormData();
            formData.append("file", badgeUploadFile);
            formData.append("name", badgeName || badgeUploadFile.name.replace(/\.[^/.]+$/, ""));
            formData.append("category", badgeCategory);
            if (badgeMatchRule) formData.append("matchRule", badgeMatchRule);

            const res = await uploadCustomBadgeAction(formData);
            if (res.success && res.badge) {
                setCustomBadges(prev => [res.badge, ...prev]);
                setBadgeUploadModalOpen(false);
                setBadgeUploadFile(null);
                setBadgeName("");
                setBadgeMatchRule("");
                setOverlayMessage({ success: true, text: res.message || "Custom badge uploaded successfully!" });
            } else {
                setBadgeUploadError(res.error || "Failed uploading badge.");
            }
        } catch (e: any) {
            setBadgeUploadError(e.message || "Failed uploading badge.");
        } finally {
            setUploadingBadge(false);
        }
    };

    const handleToggleCustomBadge = async (id: string, currentEnabled: boolean) => {
        const nextVal = !currentEnabled;
        setCustomBadges(prev => prev.map(b => b.id === id ? { ...b, enabled: nextVal } : b));
        try {
            await toggleCustomBadgeAction(id, nextVal);
        } catch (e) {
            setCustomBadges(prev => prev.map(b => b.id === id ? { ...b, enabled: currentEnabled } : b));
        }
    };

    const handleDeleteCustomBadge = async (id: string) => {
        setCustomBadges(prev => prev.filter(b => b.id !== id));
        try {
            await deleteCustomBadgeAction(id);
        } catch (e) {
            const res = await getCustomBadgesAction();
            if (res.success && res.badges) setCustomBadges(res.badges);
        }
    };

    const handleToggleSelectCustomBadge = (id: string) => {
        setSelectedCustomBadgeIds(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleSelectAllFilteredBadges = () => {
        if (selectedCustomBadgeIds.length === filteredCustomBadges.length && filteredCustomBadges.length > 0) {
            setSelectedCustomBadgeIds([]);
        } else {
            setSelectedCustomBadgeIds(filteredCustomBadges.map(b => b.id));
        }
    };

    const handleSelectCurrentPageBadges = (pageIds: string[]) => {
        const allPageSelected = pageIds.length > 0 && pageIds.every(id => selectedCustomBadgeIds.includes(id));
        if (allPageSelected) {
            setSelectedCustomBadgeIds(prev => prev.filter(id => !pageIds.includes(id)));
        } else {
            setSelectedCustomBadgeIds(prev => Array.from(new Set([...prev, ...pageIds])));
        }
    };

    const handleSelectNoneBadges = () => {
        setSelectedCustomBadgeIds([]);
    };

    const handleBulkToggleBadges = async (enabled: boolean) => {
        const ids = selectedCustomBadgeIds.length > 0 ? selectedCustomBadgeIds : customBadges.map(b => b.id);
        if (ids.length === 0) return;
        setCustomBadges(prev => prev.map(b => ids.includes(b.id) ? { ...b, enabled } : b));
        try {
            await toggleMultipleCustomBadgesAction(ids, enabled);
        } catch (e) {}
    };

    const handleDeleteSelectedBadges = async () => {
        if (selectedCustomBadgeIds.length === 0) return;
        const count = selectedCustomBadgeIds.length;
        if (!confirm(`Are you sure you want to permanently delete ${count} custom badge(s)? This will also purge the image files from disk.`)) return;
        setDeletingCustomBadges(true);
        const idsToDelete = [...selectedCustomBadgeIds];
        setCustomBadges(prev => prev.filter(b => !idsToDelete.includes(b.id)));
        setSelectedCustomBadgeIds([]);
        try {
            const res = await deleteMultipleCustomBadgesAction(idsToDelete);
            if (res.success) {
                const refreshed = await getCustomBadgesAction();
                if (refreshed.success && refreshed.badges) setCustomBadges(refreshed.badges);
            }
        } catch (e) {
            const res = await getCustomBadgesAction();
            if (res.success && res.badges) setCustomBadges(res.badges);
        } finally {
            setDeletingCustomBadges(false);
        }
    };

    const handleBulkPurgeBadges = async (keepEssential: boolean) => {
        setPurgingBadges(true);
        try {
            const res = await deleteAllCustomBadgesAction({ keepEssential });
            if (res.success) {
                if (res.badges) setCustomBadges(res.badges);
                setSelectedCustomBadgeIds([]);
                setBulkDeleteModalOpen(false);
                setBadgePage(1);
            }
        } catch (e) {
            console.error("Failed purging badges:", e);
        } finally {
            setPurgingBadges(false);
        }
    };

    // GitHub Repo Scan & Import Handlers
    const handleScanGitHubRepo = async () => {
        setScanningRepo(true);
        setScanError(null);
        setDiscoveredBadges([]);
        try {
            const res = await fetchGitHubBadgeRepoAction(githubRepoInput);
            if (res.success && res.badges) {
                setDiscoveredBadges(res.badges);
                setSelectedBadgeIds(res.badges.map(b => b.id));
            } else {
                setScanError(res.error || "Failed scanning GitHub repository.");
            }
        } catch (e: any) {
            setScanError(e.message || "Failed scanning repository.");
        } finally {
            setScanningRepo(false);
        }
    };

    const handleImportGitHubBadges = async () => {
        if (selectedBadgeIds.length === 0) return;
        setImportingBadges(true);
        setImportSuccessMsg(null);
        try {
            const toImport = discoveredBadges
                .filter(b => selectedBadgeIds.includes(b.id))
                .map(b => ({
                    name: b.name,
                    downloadUrl: b.downloadUrl,
                    filename: b.path ? b.path.split("/").pop() || `${b.name}.svg` : `${b.name}.svg`,
                    category: b.category,
                    position: b.recommendedPosition,
                    matchRule: b.inferredRule
                }));
            const res = await importGitHubBadgesAction(toImport);
            if (res.success) {
                setImportSuccessMsg(res.message || `Imported ${res.importedCount || 0} badges!`);
                const badgeRes = await getCustomBadgesAction();
                if (badgeRes.success && badgeRes.badges) {
                    setCustomBadges(badgeRes.badges);
                }
                setTimeout(() => {
                    setGithubModalOpen(false);
                    setImportSuccessMsg(null);
                }, 1500);
            } else {
                setScanError(res.error || "Failed importing badges.");
            }
        } catch (e: any) {
            setScanError(e.message || "Failed importing badges.");
        } finally {
            setImportingBadges(false);
        }
    };

    // Media Inspector Handlers
    const handleSearchInspector = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!inspectorSearchQuery.trim()) return;
        setSearchingPlex(true);
        setSingleItemMsg(null);
        try {
            const targetServerId = selectedServerId || (servers.length > 0 ? servers[0].serverId : "");
            const res = await searchPlexLibraryItemsAction(
                targetServerId, 
                inspectorSearchQuery.trim(), 
                selectedSectionKey || undefined,
                false,
                inspectorLimit
            );
            if (res.success && res.items) {
                setSearchResults(res.items);
                if (res.items.length > 0) {
                    handleInspectItem(res.items[0].ratingKey, targetServerId);
                } else {
                    setSingleItemMsg({ success: false, text: `No media found matching "${inspectorSearchQuery}".` });
                }
            } else if (!res.success && res.error) {
                setSingleItemMsg({ success: false, text: res.error });
            }
        } catch (e: any) {
            console.error("Failed searching plex library:", e);
            setSingleItemMsg({ success: false, text: e.message || "Failed searching Plex library." });
        } finally {
            setSearchingPlex(false);
        }
    };

    const handleInspectItem = async (ratingKey: string, srvId?: string) => {
        setLoadingInspection(true);
        setSingleItemMsg(null);
        try {
            const targetServerId = srvId || selectedServerId || (servers.length > 0 ? servers[0].serverId : "");
            const res = await inspectPlexMediaItemAction(targetServerId, ratingKey);
            if (res.success && res.item) {
                setInspectingItem({
                    ...res.item,
                    rawStreams: res.rawStreams,
                    parts: res.parts,
                    hasBackup: res.hasBackup,
                    isLeavingSoon: res.isLeavingSoon,
                    leavingSoonDate: res.leavingSoonDate,
                    leavingReason: res.leavingReason,
                    serverName: res.serverName,
                    serverUrl: res.serverUrl
                });
            } else if (!res.success && res.error) {
                setSingleItemMsg({ success: false, text: res.error });
            }
        } catch (e: any) {
            console.error("Failed inspecting item:", e);
            setSingleItemMsg({ success: false, text: e.message || "Failed inspecting item." });
        } finally {
            setLoadingInspection(false);
        }
    };

    const handleApplySingleItemOverlay = async (ratingKey: string) => {
        setApplyingSingleOverlay(true);
        setSingleItemMsg(null);
        try {
            const res = await applyOverlayToSingleItemAction(selectedServerId, selectedSectionKey, ratingKey, {
                theme: simTheme,
                showResolution: simShowResolution,
                showHdr: simShowHdr,
                showAudio: simShowAudio,
                showAudioChannels: simShowChannels,
                showCodec: simShowCodec,
                showEdition: simShowEdition,
                showStudio: simShowStudio,
                showContentRating: simShowRating,
                showRatings: simRatings,
                dovetailResolutionHdr: simDovetailResolutionHdr,
                badgeScale: simBadgeScale,
                resolutionPosition: simResolutionPosition,
                hdrPosition: simHdrPosition,
                audioPosition: simAudioPosition,
                channelsPosition: simChannelsPosition,
                codecPosition: simCodecPosition,
                editionPosition: simEditionPosition,
                studioPosition: simStudioPosition,
                contentRatingPosition: simRatingPosition,
                ratingsPosition: simRatingsPosition,
                showRibbon: simShowRibbon,
                ribbonMode: simRibbonMode,
                ribbonPosition: simRibbonPosition,
                ribbonTheme: simRibbonTheme,
                ribbonType: simRibbonType,
                ribbonText: simRibbonText,
                tieredRibbons: simTieredRibbons,
                maxRibbonTiers: simMaxRibbonTiers,
                layerPriorityOrder: layerPriorityOrder
            });
            if (res.success) {
                setSingleItemMsg({ success: true, text: res.message || "Overlay applied to item successfully!" });
                handleInspectItem(ratingKey);
            } else {
                setSingleItemMsg({ success: false, text: res.error || "Failed applying overlay." });
            }
        } catch (e: any) {
            setSingleItemMsg({ success: false, text: e.message || "Failed applying overlay." });
        } finally {
            setApplyingSingleOverlay(false);
        }
    };

    const handleRestoreSingleItemPoster = async (ratingKey: string) => {
        setRevertingSingleOverlay(true);
        setSingleItemMsg(null);
        try {
            const res = await restoreSingleItemPosterAction(selectedServerId, ratingKey);
            if (res.success) {
                setSingleItemMsg({ success: true, text: res.message || "Original artwork restored!" });
                handleInspectItem(ratingKey);
            } else {
                setSingleItemMsg({ success: false, text: res.error || "Failed restoring artwork." });
            }
        } catch (e: any) {
            setSingleItemMsg({ success: false, text: e.message || "Failed restoring artwork." });
        } finally {
            setRevertingSingleOverlay(false);
        }
    };

    const currentServer = servers.find(s => s.serverId === selectedServerId) || servers[0];
    const currentSections = currentServer?.sections || [];

    const filteredCustomBadges = customBadges.filter(b => {
        const matchesSearch = !customBadgeSearch.trim() || 
            b.name.toLowerCase().includes(customBadgeSearch.toLowerCase()) || 
            (b.matchRule && b.matchRule.toLowerCase().includes(customBadgeSearch.toLowerCase())) ||
            (b.category && b.category.toLowerCase().includes(customBadgeSearch.toLowerCase()));
        
        if (!matchesSearch) return false;
        if (customBadgeFilter === "all") return true;

        const cats = getCustomBadgeCategoriesClient(b);
        return cats.includes(customBadgeFilter) || b.category === customBadgeFilter;
    });

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                <p className="text-sm font-medium">Loading Kometa Overlays Studio...</p>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <CurationNavHeader 
                serversCount={servers.length}
                title="Kometa Overlays & Badge Studio"
                description="4K UHD, HDR, Dolby Vision dovetailing, studio audio codecs, US age ratings, network logos, and tiered gloss ribbons."
                servers={servers}
                selectedServerId={selectedServerId}
            />

            {/* Static Server & Library Section Navigator */}
            {servers.length > 0 && (
                <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                    <div className="p-5 sm:p-6 space-y-5">
                        {/* Plex Servers Static Tabs */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-800/80 pb-4">
                            <div className="flex items-center gap-2.5 text-xs font-bold text-slate-300 shrink-0">
                                <Tv className="h-4 w-4 text-purple-400" />
                                <span>Plex Server:</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
                                {servers.map(s => {
                                    const isSelected = s.serverId === selectedServerId;
                                    const secCount = s.sections?.length || 0;
                                    return (
                                        <button
                                            key={s.serverId}
                                            type="button"
                                            onClick={() => handleSelectServer(s.serverId)}
                                            className={`flex items-center gap-2.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                isSelected
                                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/60 border border-purple-400/50 ring-1 ring-purple-400/40'
                                                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white shadow-sm' : 'bg-emerald-400'}`} />
                                            <span>{s.serverName || "Plex Server"}</span>
                                            <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${isSelected ? 'border-purple-300 text-purple-100 bg-purple-700/60' : 'border-slate-700 text-slate-400'}`}>
                                                {secCount} {secCount === 1 ? 'lib' : 'libs'}
                                            </Badge>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Library Sections Static Tabs */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                            <div className="flex items-center gap-2.5 text-xs font-bold text-slate-300 shrink-0">
                                <Film className="h-4 w-4 text-sky-400" />
                                <span>Library Sections:</span>
                                {serverSectionsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />}
                            </div>
                            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
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
                                                    className={`flex items-center gap-2 px-3.5 py-2 text-xs font-bold rounded-l-xl transition-all cursor-pointer ${
                                                        isSelected
                                                            ? 'text-sky-200'
                                                            : 'text-slate-300 hover:text-white'
                                                    }`}
                                                >
                                                    {isMovie && <Film className="h-3.5 w-3.5 text-amber-300 shrink-0" />}
                                                    {isShow && <Tv className="h-3.5 w-3.5 text-cyan-300 shrink-0" />}
                                                    {!isMovie && !isShow && <Layers className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                                                    <span>{sec.title}</span>
                                                    <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-sky-500/30 text-sky-100' : 'bg-slate-900 text-slate-400'}`}>
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
                                                    title={isSecEnabled ? `Overlays ACTIVE on "${sec.title}" (Click to exclude)` : `Overlays EXCLUDED on "${sec.title}" (Click to enable)`}
                                                    className={`px-3 py-2 text-[10px] font-extrabold transition-all border-l flex items-center gap-1.5 rounded-r-xl cursor-pointer ${
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
                            <div className="mt-2 pt-4 border-t border-slate-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-950/70 p-4 rounded-2xl border border-slate-800/90">
                                <div className="flex items-center gap-3.5">
                                    <div className={`p-2.5 rounded-xl border shrink-0 ${
                                        isSectionEnabled(selectedServerId, selectedSectionKey)
                                            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                            : 'bg-slate-800 border-slate-700 text-slate-400'
                                    }`}>
                                        {isSectionEnabled(selectedServerId, selectedSectionKey) ? <ShieldCheck className="h-4.5 w-4.5" /> : <ShieldAlert className="h-4.5 w-4.5" />}
                                    </div>
                                    <div className="space-y-1">
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <span className="text-xs font-black text-white">
                                                {currentServer?.serverName} &rarr; {currentSections.find(s => String(s.key) === selectedSectionKey)?.title || `Library #${selectedSectionKey}`}
                                            </span>
                                            <Badge className={`text-[10px] font-bold px-2 py-0.5 ${
                                                isSectionEnabled(selectedServerId, selectedSectionKey)
                                                    ? 'bg-emerald-600 text-white'
                                                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                                            }`}>
                                                {isSectionEnabled(selectedServerId, selectedSectionKey) ? '🟢 OVERLAYS ACTIVE' : '⚪ EXCLUDED / DISABLED'}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                            {isSectionEnabled(selectedServerId, selectedSectionKey)
                                                ? 'This library section will receive automated badge & overlay updates during sync.'
                                                : 'This library section is excluded and will be skipped during all overlay sync operations.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full md:w-auto justify-end">
                                    {/* Primary Switch */}
                                    <div className="flex items-center gap-2.5 bg-slate-900 px-3.5 py-2 rounded-xl border border-slate-800">
                                        <Label htmlFor="sec-master-toggle-kometa" className="text-xs font-bold text-slate-300 cursor-pointer">
                                            {isSectionEnabled(selectedServerId, selectedSectionKey) ? 'Enabled' : 'Disabled'}
                                        </Label>
                                        <Switch
                                            id="sec-master-toggle-kometa"
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
                                        className="h-9 px-3 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                                    >
                                        Enable All
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleToggleAllSectionsOnServer(false)}
                                        className="h-9 px-3 text-xs border-slate-800 bg-slate-900 text-slate-400 hover:text-rose-300"
                                    >
                                        Disable All
                                    </Button>

                                    {/* Scoped Runner for Selected Library */}
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={applyingOverlays || runningOverlaySync}
                                        onClick={handleRunOverlaySync}
                                        className="h-9 px-3.5 text-xs bg-sky-600 hover:bg-sky-500 text-white font-bold shadow-md shadow-sky-950/40 cursor-pointer"
                                    >
                                        {runningOverlaySync ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Zap className="h-3.5 w-3.5 mr-1.5" />}
                                        <span>Run on Library #{selectedSectionKey}</span>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Automated Periodic Timer Job & Sync Runner */}
            <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                <CardContent className="p-5 sm:p-6 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5 text-xs">
                    <div className="space-y-1.5 max-w-xl">
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <Clock className="h-4.5 w-4.5 text-purple-400" />
                            <span className="font-bold text-white text-sm sm:text-base">Poster Overlays Schedule &amp; Automation</span>
                            <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0.5 ${curationSyncOverlays ? 'border-purple-500/40 text-purple-300 bg-purple-950/30' : 'border-slate-700 text-slate-400 bg-slate-800/40'}`}>
                                {curationSyncOverlays ? `Active (${curationSyncSchedule.replace(/_/g, ' ')})` : 'Paused'}
                            </Badge>
                        </div>
                        <p className="text-xs text-slate-400 leading-relaxed">
                            Automatically scans for new and updated library items on a recurring schedule to apply 4K UHD, HDR, Dolby Vision, audio codecs, and custom badges across enabled libraries.
                        </p>
                        {curationLastRunAt && (
                            <p className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-0.5">
                                <Clock3 className="h-3.5 w-3.5 text-purple-400" />
                                Last automated run: <span className="text-slate-300 font-mono">{new Date(curationLastRunAt).toLocaleString()}</span>
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2.5 w-full lg:w-auto">
                        <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
                            <span className="text-xs font-bold text-slate-200">Timer</span>
                            <Switch 
                                checked={curationSyncOverlays}
                                onCheckedChange={checked => setCurationSyncOverlays(checked)}
                            />
                        </div>

                        {/* Frequency Schedule */}
                        <div className="space-y-0.5">
                            <Select 
                                value={curationSyncSchedule} 
                                onValueChange={val => setCurationSyncSchedule(val)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-9 w-[155px]" title="Timer Trigger Frequency">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="every_hour">⚡ Every 1 Hour</SelectItem>
                                    <SelectItem value="every_3_hours">⏱️ Every 3 Hours</SelectItem>
                                    <SelectItem value="every_6_hours">🔄 Every 6 Hours</SelectItem>
                                    <SelectItem value="every_12_hours">⏳ Every 12 Hours</SelectItem>
                                    <SelectItem value="daily_3am">🌙 Daily at 3:00 AM</SelectItem>
                                    <SelectItem value="weekly_sun">📅 Weekly on Sunday</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Batch Size Selector */}
                        <div className="space-y-0.5">
                            <Select 
                                value={String(overlayBatchSize)} 
                                onValueChange={val => setOverlayBatchSize(Number(val))}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-9 w-[120px] text-purple-300 font-semibold" title="Batch Size Limit">
                                    <SelectValue placeholder="Batch Size" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="10">📦 10 Items</SelectItem>
                                    <SelectItem value="50">📦 50 Items</SelectItem>
                                    <SelectItem value="100">📦 100 Items</SelectItem>
                                    <SelectItem value="200">📦 200 Items</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Cadence Mode Selector */}
                        <div className="space-y-0.5">
                            <Select 
                                value={overlayBatchMode} 
                                onValueChange={(val: any) => setOverlayBatchMode(val)}
                            >
                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-9 w-[185px] text-slate-200" title="Scan Scope & Recheck Policy">
                                    <SelectValue placeholder="Scan Mode" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="incremental">⚡ Incremental (New &amp; Upgrades)</SelectItem>
                                    <SelectItem value="daily_recheck">🌙 Daily Recheck (&gt;24h Old)</SelectItem>
                                    <SelectItem value="weekly_recheck">📅 Weekly Recheck (&gt;7d Old)</SelectItem>
                                    <SelectItem value="monthly_recheck">🗓️ Monthly Recheck (&gt;30d Old)</SelectItem>
                                    <SelectItem value="force_all">🔄 Force Recheck (All Items)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <Button 
                            size="sm"
                            onClick={handleSaveSchedule}
                            disabled={savingSchedule}
                            variant="outline"
                            className="border-slate-700 text-slate-300 hover:text-white text-xs h-9 px-3 cursor-pointer"
                        >
                            {savingSchedule ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                            {scheduleSavedMsg ? "Saved!" : "Save Schedule"}
                        </Button>

                        <Button 
                            size="sm"
                            onClick={handleRunOverlaySync}
                            disabled={runningOverlaySync}
                            className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-9 px-3.5 gap-1.5 shadow-md shadow-purple-950/40 cursor-pointer"
                        >
                            {runningOverlaySync ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            <span>Run Batch Sync Now</span>
                        </Button>
                    </div>
                </CardContent>

                {overlaySyncResult && (
                    <div className={`p-3.5 text-xs border-t ${overlaySyncResult.success ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'} flex items-start gap-2.5`}>
                        {overlaySyncResult.success ? <CheckCircle2 className="h-4.5 w-4.5 shrink-0 mt-0.5" /> : <XCircle className="h-4.5 w-4.5 shrink-0 mt-0.5" />}
                        <div className="space-y-0.5">
                            <span className="font-bold">{overlaySyncResult.text}</span>
                            {overlaySyncResult.details && overlaySyncResult.details.length > 0 && (
                                <p className="text-[11px] opacity-80">{overlaySyncResult.details.join(" • ")}</p>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {/* Main Overlays & Simulator Card */}
            <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                <CardHeader className="p-6 pb-4 border-b border-slate-800/80">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-black text-white flex items-center gap-2.5">
                                <Sparkles className="h-5 w-5 text-purple-400" />
                                <span>Poster Overlays &amp; Live Simulator</span>
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Configure 4K UHD, HDR, Dolby Vision dovetailing, studio audio codecs, US age ratings, network logos, and tiered gloss ribbons.
                            </CardDescription>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setGuideModalOpen(true)}
                                className="border-purple-500/40 text-purple-300 hover:text-white hover:bg-purple-950/40 text-xs h-8 px-3 gap-1.5 cursor-pointer shadow-sm"
                            >
                                <BookOpen className="h-3.5 w-3.5 text-purple-400" />
                                <span>📖 Overlays &amp; Badges Guide</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                onClick={() => setKometaModalOpen(true)}
                                className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs h-8 px-3 gap-1.5 shadow-md cursor-pointer"
                            >
                                <Zap className="h-3.5 w-3.5 fill-slate-950" />
                                <span>📥 Load Kometa Config</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={savingOverlaySettings}
                                onClick={handleSaveOverlaySettings}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md cursor-pointer"
                            >
                                {savingOverlaySettings ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                <span>🔖 Save Overlay Settings</span>
                            </Button>
                            <div className="flex items-center gap-1.5 bg-slate-950/80 p-0.5 rounded-xl border border-slate-800">
                                <Select value={String(overlayBatchSize)} onValueChange={val => setOverlayBatchSize(Number(val))}>
                                    <SelectTrigger className="h-8 bg-transparent border-0 text-xs w-[95px] text-purple-300 font-bold focus:ring-0">
                                        <SelectValue placeholder="Size" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                        <SelectItem value="10">10 Items</SelectItem>
                                        <SelectItem value="50">50 Items</SelectItem>
                                        <SelectItem value="100">100 Items</SelectItem>
                                        <SelectItem value="200">200 Items</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Select value={overlayBatchMode} onValueChange={(val: any) => setOverlayBatchMode(val)}>
                                    <SelectTrigger className="h-8 bg-transparent border-0 text-xs w-[145px] text-slate-300 font-medium focus:ring-0" title="Scan Mode & Recheck Scope">
                                        <SelectValue placeholder="Mode" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                        <SelectItem value="incremental">⚡ Incremental (New &amp; Upgrades)</SelectItem>
                                        <SelectItem value="daily_recheck">🌙 Daily Recheck (&gt;24h Old)</SelectItem>
                                        <SelectItem value="weekly_recheck">📅 Weekly Recheck (&gt;7d Old)</SelectItem>
                                        <SelectItem value="monthly_recheck">🗓️ Monthly Recheck (&gt;30d Old)</SelectItem>
                                        <SelectItem value="force_all">🔄 Force Recheck (All)</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={applyingOverlays}
                                    onClick={handleApplyOverlays}
                                    className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs h-7.5 px-3 gap-1.5 shadow-md cursor-pointer rounded-lg"
                                >
                                    {applyingOverlays ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                    <span>✨ Apply ({overlayBatchSize})</span>
                                </Button>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={revertingOverlays}
                                onClick={handleRevertOverlays}
                                className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-8 px-2.5 gap-1.5"
                                title="Restore original artwork from Portalarr backup vault"
                            >
                                {revertingOverlays ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                <span>↺ Restore Originals</span>
                            </Button>
                        </div>
                    </div>

                    {overlayMessage && (
                        <div className={`mt-3 p-3 rounded-xl border text-xs flex items-center justify-between gap-2 animate-in fade-in-50 duration-200 ${
                            overlayMessage.success 
                                ? "bg-emerald-950/80 border-emerald-800 text-emerald-300" 
                                : "bg-rose-950/80 border-rose-800 text-rose-300"
                        }`}>
                            <div className="flex items-center gap-2">
                                {overlayMessage.success ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" /> : <XCircle className="h-4 w-4 shrink-0 text-rose-400" />}
                                <span>{overlayMessage.text}</span>
                            </div>
                            <button type="button" onClick={() => setOverlayMessage(null)} className="opacity-70 hover:opacity-100 text-slate-300">
                                <X className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </CardHeader>

                <CardContent className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Live Simulator Poster View (5 Cols) */}
                        <div className="lg:col-span-5 space-y-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                    <Eye className="h-4 w-4 text-purple-400" /> Live Poster Simulator
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setPosterPickerModalOpen(true)}
                                        className="h-7 text-[11px] gap-1.5 border-purple-500/40 hover:bg-purple-950/40 text-purple-200 hover:text-purple-100"
                                    >
                                        <ImageIcon className="h-3.5 w-3.5 text-purple-400" /> Pull Poster from Plex
                                    </Button>
                                    <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300 bg-purple-950/30">
                                        Interactive Preview
                                    </Badge>
                                </div>
                            </div>

                            {/* Real Item Telemetry Banner if selected */}
                            {simSelectedRealItem && (
                                <div className="p-2.5 bg-purple-950/40 border border-purple-800/60 rounded-xl text-xs flex items-center justify-between gap-2 animate-in fade-in-50">
                                    <div className="space-y-0.5 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-white truncate">{simSelectedRealItem.title}</span>
                                            {simSelectedRealItem.year && (
                                                <span className="text-[10px] text-purple-300 font-mono">({simSelectedRealItem.year})</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-purple-200/80">
                                            {(simSelectedRealItem.detectedBadges?.resolution || simSelectedRealItem.media?.[0]?.videoResolution) && (
                                                <span className="px-1.5 py-0.2 bg-purple-900/60 rounded text-purple-300 font-mono">
                                                    {simSelectedRealItem.detectedBadges?.resolution || simSelectedRealItem.media?.[0]?.videoResolution}
                                                </span>
                                            )}
                                            {(simSelectedRealItem.detectedBadges?.hdr === "DV" || simSelectedRealItem.media?.[0]?.hdrFormat === "Dolby Vision") && (
                                                <span className="px-1.5 py-0.2 bg-amber-900/60 rounded text-amber-300 font-bold">DV</span>
                                            )}
                                            {(simSelectedRealItem.detectedBadges?.hdr && simSelectedRealItem.detectedBadges.hdr !== "DV") && (
                                                <span className="px-1.5 py-0.2 bg-blue-900/60 rounded text-blue-300 font-bold">
                                                    {simSelectedRealItem.detectedBadges.hdr}
                                                </span>
                                            )}
                                            {(simSelectedRealItem.detectedBadges?.audio || simSelectedRealItem.media?.[0]?.audioCodec) && (
                                                <span className="px-1.5 py-0.2 bg-slate-800 rounded text-slate-300 uppercase">
                                                    {simSelectedRealItem.detectedBadges?.audio || simSelectedRealItem.media?.[0]?.audioCodec}
                                                </span>
                                            )}
                                            {(simSelectedRealItem.detectedBadges?.audioChannels || simSelectedRealItem.media?.[0]?.audioChannels) && (
                                                <span className="px-1.5 py-0.2 bg-slate-800 rounded text-slate-300">
                                                    {simSelectedRealItem.detectedBadges?.audioChannels || `${simSelectedRealItem.media?.[0]?.audioChannels}ch`}
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
                                            setSimPosterImage("https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80");
                                        }}
                                        className="h-6 px-2 text-[10px] text-slate-400 hover:text-white shrink-0"
                                    >
                                        Reset Sample
                                    </Button>
                                </div>
                            )}

                            {/* Simulated Poster Card */}
                            <div className="relative aspect-[2/3] max-w-[320px] mx-auto rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl group bg-slate-950">
                                <img 
                                    src={simPosterImage} 
                                    alt="Live Simulator" 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                />

                                {/* Authentic 45-degree Corner Ribbon */}
                                {renderSimulatorCornerRibbon()}

                                {/* Top-Right Position */}
                                <div className={`absolute ${isSimulatorRibbonInCorner("top-right") ? "top-[88px]" : "top-2.5"} right-2.5 flex flex-col items-end gap-1.5 z-20 pointer-events-none transition-all duration-300`}>
                                    {getActiveBadgesForPosition("top-right")}
                                </div>

                                {/* Top-Left Position */}
                                <div className={`absolute ${isSimulatorRibbonInCorner("top-left") ? "top-[88px]" : "top-2.5"} left-2.5 flex flex-col items-start gap-1.5 z-20 pointer-events-none transition-all duration-300`}>
                                    {getActiveBadgesForPosition("top-left")}
                                </div>

                                {/* Top-Center Position */}
                                <div className="absolute top-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-20 pointer-events-none">
                                    {getActiveBadgesForPosition("top-center")}
                                </div>

                                {/* Bottom-Left Position */}
                                <div className={`absolute ${isSimulatorRibbonInCorner("bottom-left") ? "bottom-[88px]" : "bottom-2.5"} left-2.5 flex flex-col items-start gap-1.5 z-20 pointer-events-none transition-all duration-300`}>
                                    {getActiveBadgesForPosition("bottom-left")}
                                </div>

                                {/* Bottom-Right Position */}
                                <div className={`absolute ${isSimulatorRibbonInCorner("bottom-right") ? "bottom-[88px]" : "bottom-2.5"} right-2.5 flex flex-col items-end gap-1.5 z-20 pointer-events-none transition-all duration-300`}>
                                    {getActiveBadgesForPosition("bottom-right")}
                                </div>

                                {/* Bottom-Center Position */}
                                <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 z-20 pointer-events-none">
                                    {getActiveBadgesForPosition("bottom-center")}
                                </div>
                            </div>

                            {/* Applied Overlays Breakdown Box */}
                            <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Layers className="h-3.5 w-3.5 text-purple-400" /> Applied Overlays Breakdown
                                    </span>
                                    <Badge variant="outline" className="text-[10px] font-mono border-purple-500/30 text-purple-300">
                                        {getSimulatedLayersBreakdown().length} Active
                                    </Badge>
                                </div>
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
                            </div>
                        </div>

                        {/* Controls & Badge Layers Manager (7 Cols) */}
                        <div className="lg:col-span-7 space-y-4">
                            {/* Global Theme & Dovetail Settings */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                                    <span className="font-bold text-white text-xs flex items-center gap-1.5">
                                        <Palette className="h-3.5 w-3.5 text-purple-400" /> Style Theme
                                    </span>
                                    <Select value={simTheme} onValueChange={(val: any) => setSimTheme(val)}>
                                        <SelectTrigger className="bg-slate-800 border-slate-700 text-xs h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="glass">✨ Obsidian Glass</SelectItem>
                                            <SelectItem value="gold">💛 Amber Gold</SelectItem>
                                            <SelectItem value="cyber">⚡ Cyberpunk Neon</SelectItem>
                                            <SelectItem value="crimson">🔴 Crimson Edge</SelectItem>
                                            <SelectItem value="classic">🛡️ Classic Solid Dark</SelectItem>
                                            <SelectItem value="minimal">🔲 Minimalist Framed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-white text-xs flex items-center gap-1.5">
                                            <Maximize2 className="h-3.5 w-3.5 text-cyan-400" /> Scale Size
                                        </span>
                                        <span className="text-[11px] font-mono text-cyan-300">{Math.round(simBadgeScale * 100)}%</span>
                                    </div>
                                    <input 
                                        type="range" 
                                        min="0.70" 
                                        max="1.40" 
                                        step="0.05"
                                        value={simBadgeScale}
                                        onChange={(e) => setSimBadgeScale(parseFloat(e.target.value))}
                                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                    />
                                </div>

                                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-white text-xs flex items-center gap-1.5">
                                            <Zap className="h-3.5 w-3.5 text-amber-400" /> Dovetail 4K+DV
                                        </span>
                                        <Switch checked={simDovetailResolutionHdr} onCheckedChange={setSimDovetailResolutionHdr} />
                                    </div>
                                    <p className="text-[10px] text-purple-300 font-mono">
                                        {simDovetailResolutionHdr ? "4K • DOLBY VISION" : "Independent Badges"}
                                    </p>
                                </div>
                            </div>

                            {/* Comprehensive Poster Badge Toggles with Positions */}
                            <div className="space-y-3.5 p-5 bg-slate-950/60 rounded-2xl border border-slate-800 shadow-inner">
                                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                                    <span className="text-xs font-bold text-white flex items-center gap-2">
                                        <Sliders className="h-4 w-4 text-purple-400" /> Comprehensive Poster Badge Toggles &amp; Positions
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                                    {/* Resolution */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">📺 Resolution (4K / 1080p)</span>
                                            <Switch checked={simShowResolution} onCheckedChange={setSimShowResolution} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simResolutionPosition} onValueChange={setSimResolutionPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.resolution ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("resolution", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.resolution ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* HDR */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">✨ HDR / Dolby Vision</span>
                                            <Switch checked={simShowHdr} onCheckedChange={setSimShowHdr} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simHdrPosition} onValueChange={setSimHdrPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.hdr ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("hdr", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.hdr ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Video Codec */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">🎞️ Video Codec (HEVC / AV1)</span>
                                            <Switch checked={simShowCodec} onCheckedChange={setSimShowCodec} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simCodecPosition} onValueChange={setSimCodecPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.codec ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("codec", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.codec ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Audio Codec */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">🔊 Audio Codec (Atmos / DTS)</span>
                                            <Switch checked={simShowAudio} onCheckedChange={setSimShowAudio} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simAudioPosition} onValueChange={setSimAudioPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.audio ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("audio", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.audio ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Audio Channels */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">🎛️ Surround Channels (7.1)</span>
                                            <Switch checked={simShowChannels} onCheckedChange={setSimShowChannels} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simChannelsPosition} onValueChange={setSimChannelsPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.channels ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("channels", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.channels ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Edition Cuts */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">🏷️ Edition Cuts (IMAX Enhanced)</span>
                                            <Switch checked={simShowEdition} onCheckedChange={setSimShowEdition} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simEditionPosition} onValueChange={setSimEditionPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.edition ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("edition", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.edition ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Studio Logos */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">🏢 Studio / Network (HBO)</span>
                                            <Switch checked={simShowStudio} onCheckedChange={setSimShowStudio} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simStudioPosition} onValueChange={setSimStudioPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.studio ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("studio", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.studio ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Age Ratings */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">🔞 Age Ratings (PG-13 / R)</span>
                                            <Switch checked={simShowRating} onCheckedChange={setSimShowRating} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simRatingPosition} onValueChange={setSimRatingPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.contentRating ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("contentRating", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.contentRating ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Community Ratings */}
                                    <div className="p-3.5 bg-slate-900/90 rounded-2xl border border-slate-800/90 space-y-2.5 sm:col-span-2 shadow-sm hover:border-slate-750 transition-all">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-slate-200">⭐ Community Ratings (IMDb / Rotten Tomatoes)</span>
                                            <Switch checked={simRatings} onCheckedChange={setSimRatings} />
                                        </div>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/70">
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Position:</span>
                                                <Select value={simRatingsPosition} onValueChange={setSimRatingsPosition}>
                                                    <SelectTrigger className="h-7 w-28 bg-slate-950 border-slate-750 text-xs font-medium">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right</SelectItem>
                                                        <SelectItem value="top-left">Top-Left</SelectItem>
                                                        <SelectItem value="top-center">Top-Center</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left</SelectItem>
                                                        <SelectItem value="bottom-center">Bottom-Center</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="flex items-center justify-between gap-1.5">
                                                <span className="text-[11px] text-slate-400 font-medium">Size:</span>
                                                <div className="flex items-center gap-1.5 flex-1 justify-end">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.ratings ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("ratings", parseFloat(e.target.value))}
                                                        className="w-16 sm:w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                    />
                                                    <span className="text-[11px] font-mono font-bold text-purple-300 w-9 text-right">
                                                        {Math.round((simCategoryScales.ratings ?? 1.0) * 100)}%
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Authentic Kometa Waterfall Ribbons Studio */}
                            <div className="space-y-4 p-5 bg-slate-950/60 rounded-2xl border border-slate-800 shadow-inner">
                                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                                    <div className="space-y-0.5">
                                        <span className="text-xs font-bold text-white flex items-center gap-2">
                                            <Sparkles className="h-4 w-4 text-amber-400" /> Authentic Kometa Waterfall Ribbons Studio
                                        </span>
                                        <p className="text-xs text-slate-400">Cascading priority evaluation: the highest qualifying tier awards a single high-gloss 45° corner ribbon.</p>
                                    </div>
                                    <Switch checked={simShowRibbon} onCheckedChange={setSimShowRibbon} />
                                </div>

                                {simShowRibbon && (
                                    <div className="space-y-4 pt-1">
                                        {/* Top Config Row */}
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                                            <div className="space-y-1.5 min-w-0">
                                                <label className="text-xs font-bold text-slate-300 block truncate">Ribbon Evaluation Mode</label>
                                                <Select value={simRibbonMode} onValueChange={(val: any) => setSimRibbonMode(val)}>
                                                    <SelectTrigger className="h-9 w-full bg-slate-900 border-slate-700 text-xs truncate [&>span]:truncate [&>span]:block">
                                                        <SelectValue placeholder="Select mode..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="waterfall">🌊 Waterfall Priority (1st Match Wins)</SelectItem>
                                                        <SelectItem value="single">🏷️ Single Custom Text (Manual Fixed Ribbon)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1.5 min-w-0">
                                                <label className="text-xs font-bold text-slate-300 block truncate">Ribbon Placement Corner</label>
                                                <Select value={simRibbonPosition} onValueChange={(val: any) => setSimRibbonPosition(val)}>
                                                    <SelectTrigger className="h-9 w-full bg-slate-900 border-slate-700 text-xs truncate [&>span]:truncate [&>span]:block">
                                                        <SelectValue placeholder="Select corner..." />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="top-right">Top-Right (45° Diagonal)</SelectItem>
                                                        <SelectItem value="top-left">Top-Left (-45° Diagonal)</SelectItem>
                                                        <SelectItem value="bottom-right">Bottom-Right (-45° Diagonal)</SelectItem>
                                                        <SelectItem value="bottom-left">Bottom-Left (45° Diagonal)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            <div className="space-y-1.5 min-w-0">
                                                <div className="flex items-center justify-between">
                                                    <label className="text-xs font-bold text-slate-300 block truncate">Ribbon Scale Size</label>
                                                    <span className="text-[11px] font-mono font-bold text-amber-300">{Math.round((simCategoryScales.ribbon ?? 1.0) * 100)}%</span>
                                                </div>
                                                <div className="flex items-center gap-2 h-9">
                                                    <input
                                                        type="range"
                                                        min="0.5"
                                                        max="1.5"
                                                        step="0.05"
                                                        value={simCategoryScales.ribbon ?? 1.0}
                                                        onChange={(e) => setSimCategoryScale("ribbon", parseFloat(e.target.value))}
                                                        className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Single Custom Mode Controls */}
                                        {simRibbonMode === "single" && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 p-3.5 bg-slate-900/70 rounded-xl border border-slate-800">
                                                <div className="space-y-1.5 min-w-0">
                                                    <label className="text-xs font-bold text-slate-300">Custom Ribbon Text</label>
                                                    <Input 
                                                        value={simRibbonText} 
                                                        onChange={e => setSimRibbonText(e.target.value)} 
                                                        placeholder="e.g. IMDb TOP 250, CRITERION COLLECTION" 
                                                        className="h-8.5 bg-slate-950 border-slate-700 text-xs text-slate-100"
                                                    />
                                                </div>
                                                <div className="space-y-1.5 min-w-0">
                                                    <label className="text-xs font-bold text-slate-300">Ribbon Theme</label>
                                                    <Select value={simRibbonTheme} onValueChange={(val: any) => setSimRibbonTheme(val)}>
                                                        <SelectTrigger className="h-8.5 bg-slate-950 border-slate-700 text-xs">
                                                            <SelectValue />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            <SelectItem value="gold">💛 Amber Gold</SelectItem>
                                                            <SelectItem value="crimson">🔴 Crimson Red</SelectItem>
                                                            <SelectItem value="emerald">🟢 Emerald Green</SelectItem>
                                                            <SelectItem value="purple">🟣 Royal Purple</SelectItem>
                                                            <SelectItem value="cyan">🔵 Cyan Electric</SelectItem>
                                                            <SelectItem value="pink">🌸 Neon Pink</SelectItem>
                                                            <SelectItem value="glass">✨ Dark Obsidian</SelectItem>
                                                            <SelectItem value="orange">🟠 Sunset Orange</SelectItem>
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        )}

                                        {/* Waterfall Mode: Live Evaluation Diagnostics */}
                                        {simRibbonMode !== "single" && (
                                            <>
                                                {(() => {
                                                    const win = getActiveSimulatorRibbon();
                                                    const themeBadgeClasses: Record<string, string> = {
                                                        gold: "bg-amber-500/20 text-amber-300 border-amber-500/50",
                                                        crimson: "bg-rose-500/20 text-rose-300 border-rose-500/50",
                                                        emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/50",
                                                        purple: "bg-purple-500/20 text-purple-300 border-purple-500/50",
                                                        cyan: "bg-sky-500/20 text-sky-300 border-sky-500/50",
                                                        pink: "bg-pink-500/20 text-pink-300 border-pink-500/50",
                                                        glass: "bg-slate-800 text-slate-300 border-slate-600",
                                                        orange: "bg-orange-500/20 text-orange-300 border-orange-500/50"
                                                    };

                                                    return (
                                                        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                                                            <div className="flex items-center justify-between gap-2.5 flex-wrap">
                                                                <div className="flex items-center gap-2 flex-wrap min-w-0">
                                                                    <div className="h-6 w-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-black shrink-0">
                                                                        🎯
                                                                    </div>
                                                                    <span className="text-xs font-bold text-white whitespace-nowrap">Waterfall Result:</span>
                                                                    {win ? (
                                                                        <Badge variant="outline" className={`text-xs px-2.5 py-0.5 font-black uppercase tracking-wider ${themeBadgeClasses[win.theme] || themeBadgeClasses.purple}`}>
                                                                            Priority #{win.priority}: "{win.text}"
                                                                        </Badge>
                                                                    ) : (
                                                                        <Badge variant="outline" className="text-xs px-2 py-0.5 font-bold border border-slate-700 text-slate-400 bg-slate-800">
                                                                            No Qualified Tier (No Ribbon)
                                                                        </Badge>
                                                                    )}
                                                                </div>
                                                                {simSelectedRealItem && (
                                                                    <span className="text-[10px] font-mono text-purple-300 bg-purple-950/50 px-2 py-0.5 rounded-lg border border-purple-800/40 truncate max-w-[200px]" title={simSelectedRealItem.title}>
                                                                        Telemetry: {simSelectedRealItem.title}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-xs text-slate-400">
                                                                {win 
                                                                    ? `Cascade evaluated top-to-bottom and matched Priority #${win.priority} (${win.ruleLabel}). Lower-ranked tiers are bypassed.`
                                                                    : "The simulated poster does not meet any enabled criteria in the priority list."}
                                                            </p>
                                                        </div>
                                                    );
                                                })()}

                                                {/* Waterfall Priority Tiers Reordering & Configuration */}
                                                <div className="space-y-3 pt-1">
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <div className="space-y-0.5 min-w-0">
                                                            <span className="text-xs font-bold text-slate-200">Waterfall Priority Cascading List</span>
                                                            <p className="text-xs text-slate-400">Tiers are evaluated from top to bottom. The first qualifying tier awards the single corner ribbon.</p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => {
                                                                    const newId = `tier-${Date.now()}`;
                                                                    setSimTieredRibbons(prev => [
                                                                        ...prev,
                                                                        { id: newId, type: "auto_quality", text: "4K UHD", theme: "purple", enabled: true }
                                                                    ]);
                                                                }}
                                                                className="h-7.5 px-2.5 text-xs bg-slate-900 border-slate-700 text-purple-300 hover:text-white"
                                                            >
                                                                <Plus className="h-3.5 w-3.5 mr-1" /> Add Tier
                                                            </Button>
                                                            <Button
                                                                type="button"
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => setSimTieredRibbons(DEFAULT_KOMETA_WATERFALL_RIBBONS)}
                                                                className="h-7.5 px-2.5 text-xs text-slate-400 hover:text-white"
                                                            >
                                                                ↺ Reset Defaults
                                                            </Button>
                                                        </div>
                                                    </div>

                                                    <div className="space-y-3 max-h-96 overflow-y-auto pr-1 scrollbar-thin">
                                                        {simTieredRibbons.map((tier, idx) => {
                                                            const isFirst = idx === 0;
                                                            const isLast = idx === simTieredRibbons.length - 1;

                                                            return (
                                                                <div
                                                                    key={tier.id || idx}
                                                                    className={`p-3.5 rounded-xl border text-xs transition-all space-y-3 ${
                                                                        tier.enabled 
                                                                            ? "bg-slate-900/90 border-slate-800 shadow-sm hover:border-slate-700" 
                                                                            : "bg-slate-950/60 border-slate-800/40 opacity-60"
                                                                    }`}
                                                                >
                                                                    {/* Header Row: Priority Badge + Up/Down + Toggle + Delete */}
                                                                    <div className="flex items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                                                                        <div className="flex items-center gap-2">
                                                                            <Badge
                                                                                variant="outline"
                                                                                className={`text-xs font-mono font-black px-2 py-0.5 ${
                                                                                    isFirst 
                                                                                        ? "border-amber-500/60 text-amber-300 bg-amber-950/30" 
                                                                                        : "border-slate-700 text-slate-300 bg-slate-800"
                                                                                }`}
                                                                            >
                                                                                #{idx + 1} {isFirst ? "(Top Priority)" : ""}
                                                                            </Badge>
                                                                            <div className="flex items-center gap-0.5">
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={isFirst}
                                                                                    onClick={() => {
                                                                                        const next = [...simTieredRibbons];
                                                                                        const tmp = next[idx];
                                                                                        next[idx] = next[idx - 1];
                                                                                        next[idx - 1] = tmp;
                                                                                        setSimTieredRibbons(next);
                                                                                    }}
                                                                                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                                                                    title="Move Priority Up"
                                                                                >
                                                                                    <ChevronUp className="h-4 w-4" />
                                                                                </button>
                                                                                <button
                                                                                    type="button"
                                                                                    disabled={isLast}
                                                                                    onClick={() => {
                                                                                        const next = [...simTieredRibbons];
                                                                                        const tmp = next[idx];
                                                                                        next[idx] = next[idx + 1];
                                                                                        next[idx + 1] = tmp;
                                                                                        setSimTieredRibbons(next);
                                                                                    }}
                                                                                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                                                                    title="Move Priority Down"
                                                                                >
                                                                                    <ChevronDown className="h-4 w-4" />
                                                                                </button>
                                                                            </div>
                                                                            <span className={`text-[10px] font-bold ${tier.enabled ? "text-emerald-400" : "text-slate-500"}`}>
                                                                                {tier.enabled ? "Active" : "Disabled"}
                                                                            </span>
                                                                        </div>

                                                                        <div className="flex items-center gap-2">
                                                                            <Switch
                                                                                checked={tier.enabled !== false}
                                                                                onCheckedChange={checked => {
                                                                                    const next = [...simTieredRibbons];
                                                                                    next[idx] = { ...next[idx], enabled: checked };
                                                                                    setSimTieredRibbons(next);
                                                                                }}
                                                                            />
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => {
                                                                                    setSimTieredRibbons(prev => prev.filter((_, i) => i !== idx));
                                                                                }}
                                                                                className="p-1.5 rounded-lg hover:bg-rose-950/60 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer"
                                                                                title="Delete Tier"
                                                                            >
                                                                                <Trash2 className="h-4 w-4" />
                                                                            </button>
                                                                        </div>
                                                                    </div>

                                                                    {/* Preset Selector Row */}
                                                                    <div className="space-y-1">
                                                                        <label className="text-[11px] font-medium text-slate-400">Trigger Condition / Award Preset:</label>
                                                                        <Select
                                                                            value={tier.type || "custom"}
                                                                            onValueChange={(val: any) => {
                                                                                const preset = WATERFALL_PRESET_OPTIONS.find(p => p.value === val);
                                                                                const next = [...simTieredRibbons];
                                                                                next[idx] = {
                                                                                    ...next[idx],
                                                                                    type: val,
                                                                                    text: preset ? preset.defaultText : next[idx].text,
                                                                                    theme: preset ? preset.defaultTheme : next[idx].theme
                                                                                };
                                                                                setSimTieredRibbons(next);
                                                                            }}
                                                                        >
                                                                            <SelectTrigger className="h-8 w-full bg-slate-950 border-slate-700 text-xs">
                                                                                <SelectValue />
                                                                            </SelectTrigger>
                                                                            <SelectContent>
                                                                                {WATERFALL_PRESET_OPTIONS.map(preset => (
                                                                                    <SelectItem key={preset.value} value={preset.value} className="text-xs">
                                                                                        {preset.label}
                                                                                    </SelectItem>
                                                                                ))}
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>

                                                                    {/* Customization Row: Theme Selector + Custom Ribbon Text */}
                                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                                                                        <div className="space-y-1 min-w-0">
                                                                            <label className="text-[11px] font-medium text-slate-400">Ribbon Theme:</label>
                                                                            <Select
                                                                                value={tier.theme || "purple"}
                                                                                onValueChange={(val: any) => {
                                                                                    const next = [...simTieredRibbons];
                                                                                    next[idx] = { ...next[idx], theme: val };
                                                                                    setSimTieredRibbons(next);
                                                                                }}
                                                                            >
                                                                                <SelectTrigger className="h-8 w-full bg-slate-950 border-slate-700 text-xs">
                                                                                    <SelectValue />
                                                                                </SelectTrigger>
                                                                                <SelectContent>
                                                                                    <SelectItem value="gold">💛 Amber Gold</SelectItem>
                                                                                    <SelectItem value="crimson">🔴 Crimson Red</SelectItem>
                                                                                    <SelectItem value="emerald">🟢 Emerald</SelectItem>
                                                                                    <SelectItem value="purple">🟣 Royal Purple</SelectItem>
                                                                                    <SelectItem value="cyan">🔵 Cyan Electric</SelectItem>
                                                                                    <SelectItem value="pink">🌸 Neon Pink</SelectItem>
                                                                                    <SelectItem value="glass">✨ Dark Obsidian</SelectItem>
                                                                                    <SelectItem value="orange">🟠 Sunset Orange</SelectItem>
                                                                                </SelectContent>
                                                                            </Select>
                                                                        </div>

                                                                        <div className="space-y-1 min-w-0">
                                                                            <label className="text-[11px] font-medium text-slate-400">Ribbon Text:</label>
                                                                            <Input
                                                                                value={tier.text || ""}
                                                                                onChange={e => {
                                                                                    const next = [...simTieredRibbons];
                                                                                    next[idx] = { ...next[idx], text: e.target.value };
                                                                                    setSimTieredRibbons(next);
                                                                                }}
                                                                                placeholder="e.g. IMDb TOP 250"
                                                                                className="h-8 w-full bg-slate-950 border-slate-700 text-xs px-2.5"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {/* Layer Priority & Rendering Order List */}
                            <div className="space-y-3.5 p-5 bg-slate-950/60 rounded-2xl border border-slate-800 shadow-inner">
                                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                                    <div className="space-y-0.5">
                                        <span className="text-xs font-bold text-white flex items-center gap-2">
                                            <Layers className="h-4 w-4 text-purple-400" /> Layer Priority &amp; Rendering Order
                                        </span>
                                        <p className="text-xs text-slate-400">Order determines which badges render on top when sharing corners</p>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setLayerPriorityOrder(DEFAULT_LAYER_PRIORITY_ORDER)}
                                        className="text-xs text-purple-300 hover:text-purple-200 h-7 px-2.5"
                                    >
                                        ↺ Reset Order
                                    </Button>
                                </div>

                                <div className="space-y-2 max-h-64 overflow-y-auto pr-1.5 scrollbar-thin">
                                    {layerPriorityOrder.map((layerKey, idx) => {
                                        const labels: Record<string, { name: string; icon: string }> = {
                                            ribbon: { name: "Corner Gloss Ribbon", icon: "🎗️" },
                                            resolution: { name: "Resolution (4K / 1080p)", icon: "📺" },
                                            hdr: { name: "HDR / Dolby Vision", icon: "✨" },
                                            codec: { name: "Video Codec (HEVC / AV1)", icon: "🎞️" },
                                            audio: { name: "Audio Codec (Atmos / DTS)", icon: "🔊" },
                                            channels: { name: "Surround Channels (7.1)", icon: "🎛️" },
                                            edition: { name: "Edition Cut (IMAX)", icon: "🏷️" },
                                            studio: { name: "Studio Logo (HBO)", icon: "🏢" },
                                            ratings: { name: "Community Ratings (IMDb / RT)", icon: "⭐" },
                                            contentRating: { name: "Age Rating (PG-13 / R)", icon: "🔞" }
                                        };
                                        const meta = labels[layerKey] || { name: layerKey, icon: "🏷️" };

                                        return (
                                            <div 
                                                key={layerKey}
                                                className="flex items-center justify-between p-3 rounded-xl bg-slate-900/90 border border-slate-800/90 text-xs shadow-sm hover:border-slate-750 transition-all"
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <span className="text-xs font-mono text-purple-400 font-black w-5 text-center">#{idx + 1}</span>
                                                    <span className="text-sm">{meta.icon}</span>
                                                    <span className="font-semibold text-slate-200">{meta.name}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        type="button"
                                                        disabled={idx === 0}
                                                        onClick={() => {
                                                            const next = [...layerPriorityOrder];
                                                            const tmp = next[idx];
                                                            next[idx] = next[idx - 1];
                                                            next[idx - 1] = tmp;
                                                            setLayerPriorityOrder(next);
                                                        }}
                                                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                                        title="Move Priority Up"
                                                    >
                                                        <ChevronUp className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        disabled={idx === layerPriorityOrder.length - 1}
                                                        onClick={() => {
                                                            const next = [...layerPriorityOrder];
                                                            const tmp = next[idx];
                                                            next[idx] = next[idx + 1];
                                                            next[idx + 1] = tmp;
                                                            setLayerPriorityOrder(next);
                                                        }}
                                                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-20 cursor-pointer"
                                                        title="Move Priority Down"
                                                    >
                                                        <ChevronDown className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Custom Badges Vault & Repository Card */}
            {(() => {
                const totalBadgePages = Math.max(1, Math.ceil(filteredCustomBadges.length / BADGES_PER_PAGE));
                const currentBadgePage = Math.min(badgePage, totalBadgePages);
                const displayedBadges = filteredCustomBadges.slice((currentBadgePage - 1) * BADGES_PER_PAGE, currentBadgePage * BADGES_PER_PAGE);

                return (
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                        <CardHeader className="p-6 pb-4 border-b border-slate-800/80">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <CardTitle className="text-xl font-black text-white flex items-center gap-2.5">
                                        <Zap className="h-5 w-5 text-amber-400 fill-amber-400/20" />
                                        <span>Custom Badges Vault &amp; Overrides Repository</span>
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Upload high-DPI SVGs or PNG graphics to override default Kometa badges. Custom badges automatically take Priority 1 over built-in SVGs.
                                    </CardDescription>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setGuideModalOpen(true)}
                                        className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-8 px-2.5 gap-1.5 cursor-pointer"
                                    >
                                        <HelpCircle className="h-3.5 w-3.5 text-purple-400" />
                                        <span>📖 Guide &amp; Rules</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={syncingOfficialBadges}
                                        onClick={handleSyncOfficialKometaBadges}
                                        className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs h-8 px-3.5 gap-1.5 shadow-md cursor-pointer"
                                        title="Sync 190+ authentic official transparent PNG badges directly from the Kometa GitHub repository (Resolutions, HDR, Dolby Atmos, IMAX, Criterion, Streaming, Ribbons, Ratings)"
                                    >
                                        {syncingOfficialBadges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 fill-slate-950" />}
                                        <span>✨ Sync Official Kometa Overlays (190+ PNGs)</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => setBadgeUploadModalOpen(true)}
                                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md cursor-pointer"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                        <span>📤 Upload Custom Badge</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() => setGithubModalOpen(true)}
                                        className="border-slate-700 hover:bg-slate-800 text-slate-300 text-xs h-8 px-2.5 gap-1.5"
                                    >
                                        <DownloadCloud className="h-3.5 w-3.5" />
                                        <span>📥 Import from GitHub Repo</span>
                                    </Button>
                                    {customBadges.length > 0 && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            onClick={() => setBulkDeleteModalOpen(true)}
                                            className="border-rose-800/60 bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-white text-xs h-8 px-2.5 gap-1.5 shadow-sm cursor-pointer"
                                            title="Bulk delete or purge downloaded custom badges from database & disk"
                                        >
                                            <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                                            <span>🗑️ Bulk Delete</span>
                                        </Button>
                                    )}
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-6 space-y-4">
                            {/* Search & Category Filter Pills */}
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                                <div className="flex flex-wrap items-center gap-2">
                                    {[
                                        { id: "all", label: "All Badges" },
                                        { id: "resolution", label: "Resolution" },
                                        { id: "hdr", label: "HDR / DV" },
                                        { id: "audio", label: "Audio" },
                                        { id: "codec", label: "Video Codec" },
                                        { id: "channels", label: "Surround" },
                                        { id: "edition", label: "Editions" },
                                        { id: "studio", label: "Studios" },
                                        { id: "contentRating", label: "Age Ratings" },
                                        { id: "ratings", label: "Critic & Scores" },
                                        { id: "ribbon", label: "Ribbons" }
                                    ].map(tab => (
                                        <button
                                            key={tab.id}
                                            type="button"
                                            onClick={() => {
                                                setCustomBadgeFilter(tab.id);
                                                setBadgePage(1);
                                            }}
                                            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                customBadgeFilter === tab.id
                                                    ? "bg-purple-600 text-white shadow-md shadow-purple-950/60"
                                                    : "bg-slate-800/80 hover:bg-slate-700/80 text-slate-400 hover:text-white"
                                            }`}
                                        >
                                            {tab.label}
                                        </button>
                                    ))}
                                </div>

                                <div className="relative w-full sm:w-72">
                                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                    <Input
                                        value={customBadgeSearch}
                                        onChange={e => {
                                            setCustomBadgeSearch(e.target.value);
                                            setBadgePage(1);
                                        }}
                                        placeholder="Search badges by name or rule..."
                                        className="pl-8.5 h-8.5 bg-slate-950/80 border-slate-800 text-xs text-slate-100 rounded-xl"
                                    />
                                </div>
                            </div>

                            {/* Bulk Action Controls */}
                            {customBadges.length > 0 && (
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-slate-950/80 rounded-2xl border border-slate-800 text-xs text-slate-400">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={handleSelectAllFilteredBadges}
                                            className="h-7.5 px-3 text-xs border-slate-700 bg-slate-900 text-slate-300 hover:text-white rounded-lg"
                                        >
                                            <CheckCheck className="h-3.5 w-3.5 mr-1.5 text-purple-400" />
                                            {selectedCustomBadgeIds.length === filteredCustomBadges.length && filteredCustomBadges.length > 0
                                                ? "Deselect All"
                                                : `Select All (${filteredCustomBadges.length})`}
                                        </Button>
                                        {totalBadgePages > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={() => handleSelectCurrentPageBadges(displayedBadges.map(b => b.id))}
                                                className="h-7.5 px-2.5 text-xs text-slate-400 hover:text-white rounded-lg"
                                            >
                                                Select Page ({displayedBadges.length})
                                            </Button>
                                        )}
                                        {selectedCustomBadgeIds.length > 0 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleSelectNoneBadges}
                                                className="h-7.5 px-2.5 text-xs text-slate-400 hover:text-white rounded-lg"
                                            >
                                                Clear Selection
                                            </Button>
                                        )}
                                        <Badge variant="outline" className="text-xs font-mono border-purple-500/30 text-purple-300 ml-1 px-2 py-0.5">
                                            {filteredCustomBadges.length} of {customBadges.length} Badges
                                        </Badge>
                                        <span className="text-xs text-slate-500">•</span>
                                        <span className="text-xs">
                                            {customBadges.filter(b => b.enabled !== false).length} Active Overrides
                                        </span>
                                    </div>

                                    <div className="flex flex-wrap items-center gap-2 justify-end">
                                        {selectedCustomBadgeIds.length > 0 ? (
                                            <>
                                                <Badge className="bg-purple-600 text-white text-xs font-mono px-2.5 py-0.5 mr-1">
                                                    {selectedCustomBadgeIds.length} Selected
                                                </Badge>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleBulkToggleBadges(true)}
                                                    className="h-7.5 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/30 rounded-lg"
                                                >
                                                    Enable Selected
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleBulkToggleBadges(false)}
                                                    className="h-7.5 px-2.5 text-xs text-slate-400 hover:text-slate-300 hover:bg-slate-900 rounded-lg"
                                                >
                                                    Disable Selected
                                                </Button>
                                                <Button
                                                    type="button"
                                                    size="sm"
                                                    disabled={deletingCustomBadges}
                                                    onClick={handleDeleteSelectedBadges}
                                                    className="h-7.5 px-3 text-xs bg-rose-600 hover:bg-rose-500 text-white font-semibold shadow-sm gap-1.5 rounded-lg cursor-pointer"
                                                >
                                                    {deletingCustomBadges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                                                    <span>Delete Selected ({selectedCustomBadgeIds.length})</span>
                                                </Button>
                                            </>
                                        ) : (
                                            <>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleBulkToggleBadges(true)}
                                                    className="h-7.5 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 rounded-lg"
                                                >
                                                    Enable All
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleBulkToggleBadges(false)}
                                                    className="h-7.5 px-2.5 text-xs text-slate-400 hover:text-slate-300 rounded-lg"
                                                >
                                                    Disable All
                                                </Button>
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => setBulkDeleteModalOpen(true)}
                                                    className="h-7.5 px-3 text-xs text-rose-400 hover:text-rose-200 hover:bg-rose-950/40 gap-1.5 font-semibold rounded-lg cursor-pointer"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5 text-rose-400" />
                                                    <span>Purge / Delete All ({customBadges.length})</span>
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Custom Badges Grid */}
                            {filteredCustomBadges.length === 0 ? (
                                <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-slate-800 space-y-3">
                                    <Sparkles className="h-8 w-8 text-amber-400/80 mx-auto animate-pulse" />
                                    <p className="text-xs text-slate-400">No custom badges found in vault.</p>
                                    <div className="flex items-center justify-center gap-2 flex-wrap">
                                        <Button
                                            type="button"
                                            size="sm"
                                            disabled={syncingOfficialBadges}
                                            onClick={handleSyncOfficialKometaBadges}
                                            className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs h-8 px-3.5 gap-1.5 shadow-md cursor-pointer"
                                        >
                                            {syncingOfficialBadges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 fill-slate-950" />}
                                            <span>✨ Sync Official Kometa Overlays (190+ PNGs)</span>
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                                        {displayedBadges.map(badge => {
                                            const isEnabled = badge.enabled !== false;
                                            const isSelected = selectedCustomBadgeIds.includes(badge.id);
                                            return (
                                                <div
                                                    key={badge.id}
                                                    onClick={() => handleToggleSelectCustomBadge(badge.id)}
                                                    className={`p-4 rounded-2xl border transition-all flex flex-col justify-between gap-3.5 cursor-pointer group/card ${
                                                        isSelected
                                                            ? "bg-purple-950/40 border-2 border-purple-500 shadow-xl shadow-purple-950/50 ring-1 ring-purple-500/40"
                                                            : isEnabled
                                                                ? "bg-slate-950/90 border-slate-800/90 hover:border-purple-500/60 shadow-lg hover:shadow-purple-950/20"
                                                                : "bg-slate-950/40 border-slate-900 opacity-60 hover:opacity-100"
                                                    }`}
                                                >
                                                    {/* Card Header */}
                                                    <div className="flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleToggleSelectCustomBadge(badge.id)}
                                                                className="text-slate-400 hover:text-white shrink-0 p-0.5"
                                                                title={isSelected ? "Deselect" : "Select"}
                                                            >
                                                                {isSelected ? (
                                                                    <CheckSquare className="h-4 w-4 text-purple-400" />
                                                                ) : (
                                                                    <Square className="h-4 w-4 text-slate-600 group-hover/card:text-slate-400" />
                                                                )}
                                                            </button>
                                                            <div className="space-y-0.5 overflow-hidden">
                                                                <span className="font-black text-white text-xs block truncate tracking-tight" title={badge.name}>
                                                                    {badge.name}
                                                                </span>
                                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono capitalize border-slate-700 text-slate-300 bg-slate-900">
                                                                        {badge.category || "custom"}
                                                                    </Badge>
                                                                    {badge.matchRule && (
                                                                        <span className="text-[10px] font-mono text-amber-300 font-bold bg-amber-950/50 border border-amber-500/30 px-1.5 py-0 rounded truncate max-w-[110px]" title={`Rule: ${badge.matchRule}`}>
                                                                            {badge.matchRule}
                                                                        </span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <Switch
                                                            checked={isEnabled}
                                                            onCheckedChange={() => handleToggleCustomBadge(badge.id, isEnabled)}
                                                        />
                                                    </div>

                                                    {/* High-DPI Visual Badge Preview Showcase */}
                                                    <div className="h-24 w-full rounded-xl bg-gradient-to-b from-slate-900/90 to-slate-950/90 border border-slate-800/80 flex items-center justify-center p-3.5 relative overflow-hidden bg-[radial-gradient(#334155_1px,transparent_1px)] [background-size:10px_10px] shadow-inner group/badge transition-all group-hover/card:border-purple-500/30">
                                                        <img 
                                                            src={`/api/curation/badges/${encodeURIComponent(badge.id)}?t=${Date.now()}`} 
                                                            alt={badge.name} 
                                                            className="max-h-16 max-w-[88%] object-contain drop-shadow-lg transition-transform duration-200 group-hover/badge:scale-105"
                                                            onError={(e) => {
                                                                const target = e.target as HTMLElement;
                                                                target.style.display = "none";
                                                                const fallback = target.parentElement?.querySelector(".badge-fallback-mockup") as HTMLElement;
                                                                if (fallback) fallback.style.display = "flex";
                                                            }}
                                                        />
                                                        <div 
                                                            style={{ display: "none" }}
                                                            className="badge-fallback-mockup flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-purple-500/40 bg-purple-950/60 text-purple-200 text-xs font-black tracking-wider uppercase shadow-md"
                                                        >
                                                            <Sparkles className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                                                            <span className="truncate">{badge.name}</span>
                                                        </div>
                                                    </div>

                                                    {/* Card Footer Controls */}
                                                    <div className="flex items-center justify-between gap-2.5 pt-2.5 border-t border-slate-900 text-xs" onClick={e => e.stopPropagation()}>
                                                        <div className="flex items-center gap-1.5">
                                                            <Badge variant="outline" className="text-[10px] px-2 py-0.5 border-slate-800 text-slate-400 font-mono bg-slate-900">
                                                                {badge.fileType ? badge.fileType.toUpperCase() : "SVG"}
                                                            </Badge>
                                                            {badge.width && badge.height && (
                                                                <span className="text-[10px] font-mono text-slate-500">
                                                                    {badge.width}&times;{badge.height}
                                                                </span>
                                                            )}
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <span className={`text-[10px] font-bold ${isEnabled ? "text-emerald-400" : "text-slate-500"}`}>
                                                                {isEnabled ? "Active" : "Disabled"}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleDeleteCustomBadge(badge.id)}
                                                                className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition-colors cursor-pointer"
                                                                title="Delete Custom Badge"
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Pagination Controls */}
                                    {totalBadgePages > 1 && (
                                        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
                                            <div className="flex items-center gap-2">
                                                <span>
                                                    Showing <strong className="text-white">{(currentBadgePage - 1) * BADGES_PER_PAGE + 1}</strong> to <strong className="text-white">{Math.min(currentBadgePage * BADGES_PER_PAGE, filteredCustomBadges.length)}</strong> of <strong className="text-white">{filteredCustomBadges.length}</strong> badges
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={currentBadgePage === 1}
                                                    onClick={() => setBadgePage(prev => Math.max(1, prev - 1))}
                                                    className="h-8 px-2.5 text-xs border-slate-700 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-30 rounded-lg"
                                                >
                                                    <ChevronLeft className="h-4 w-4 mr-0.5" />
                                                    Previous
                                                </Button>
                                                <div className="px-3 py-1.5 text-xs font-mono font-bold bg-slate-950 rounded-lg border border-slate-800 text-purple-300">
                                                    Page {currentBadgePage} of {totalBadgePages}
                                                </div>
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={currentBadgePage === totalBadgePages}
                                                    onClick={() => setBadgePage(prev => Math.min(totalBadgePages, prev + 1))}
                                                    className="h-8 px-2.5 text-xs border-slate-700 bg-slate-900 text-slate-300 hover:text-white disabled:opacity-30 rounded-lg"
                                                >
                                                    Next
                                                    <ChevronRight className="h-4 w-4 ml-0.5" />
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </CardContent>
                    </Card>
                );
            })()}

            {/* Media Inspector & Stream Telemetry Diagnostics Card */}
            <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                <CardHeader className="p-6 pb-4 border-b border-slate-800/80">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                            <CardTitle className="text-xl font-black text-white flex items-center gap-2.5">
                                <Film className="h-5 w-5 text-sky-400" />
                                <span>Media Inspector &amp; Stream Telemetry</span>
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Test overlay generation and inspect detected video/audio codecs, HDR decisions, and custom priority overrides on actual Plex media items.
                            </CardDescription>
                        </div>
                        <form onSubmit={handleSearchInspector} className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                            <div className="relative w-full sm:w-64">
                                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
                                <Input
                                    value={inspectorSearchQuery}
                                    onChange={e => setInspectorSearchQuery(e.target.value)}
                                    placeholder="Search movie or show title..."
                                    className="pl-8.5 h-8.5 bg-slate-950/80 border-slate-800 text-xs text-slate-100 rounded-xl"
                                />
                            </div>
                            <Select value={String(inspectorLimit)} onValueChange={(val) => setInspectorLimit(Number(val))}>
                                <SelectTrigger className="h-8.5 bg-slate-950/80 border-slate-800 text-xs w-[110px] text-slate-300 rounded-xl">
                                    <SelectValue placeholder="Limit" />
                                </SelectTrigger>
                                <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                    <SelectItem value="10" className="text-xs">10 Items</SelectItem>
                                    <SelectItem value="50" className="text-xs">50 Items</SelectItem>
                                    <SelectItem value="100" className="text-xs">100 Items</SelectItem>
                                    <SelectItem value="200" className="text-xs">200 Items</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button 
                                type="submit" 
                                size="sm" 
                                disabled={searchingPlex || !inspectorSearchQuery.trim()}
                                className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs h-8.5 px-3.5 gap-1.5 rounded-xl cursor-pointer"
                            >
                                {searchingPlex ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                <span>Search</span>
                            </Button>
                        </form>
                    </div>

                    {singleItemMsg && (
                        <div className={`mt-3 p-3.5 rounded-xl border text-xs flex items-center justify-between gap-2.5 animate-in fade-in-50 duration-200 ${
                            singleItemMsg.success 
                                ? "bg-emerald-950/80 border-emerald-800 text-emerald-300" 
                                : "bg-rose-950/80 border-rose-800 text-rose-300"
                        }`}>
                            <div className="flex items-center gap-2">
                                {singleItemMsg.success ? <CheckCircle2 className="h-4.5 w-4.5 shrink-0 text-emerald-400" /> : <XCircle className="h-4.5 w-4.5 shrink-0 text-rose-400" />}
                                <span>{singleItemMsg.text}</span>
                            </div>
                            <button type="button" onClick={() => setSingleItemMsg(null)} className="opacity-70 hover:opacity-100 text-slate-300 cursor-pointer">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    )}
                </CardHeader>

                <CardContent className="p-6">
                    {/* Search Results Quick Chooser */}
                    {searchResults.length > 0 && (
                        <div className="mb-6 space-y-2.5">
                            <span className="text-xs font-bold text-slate-300">Select Media Item to Inspect:</span>
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                {searchResults.map(item => {
                                    const isSelected = inspectingItem?.ratingKey === item.ratingKey;
                                    return (
                                        <button
                                            key={item.ratingKey}
                                            type="button"
                                            onClick={() => handleInspectItem(item.ratingKey)}
                                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl border text-xs font-bold shrink-0 transition-all cursor-pointer ${
                                                isSelected
                                                    ? "bg-sky-600 text-white border-sky-400 shadow-md shadow-sky-950/60"
                                                    : "bg-slate-950/80 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700"
                                            }`}
                                        >
                                            <span>{item.title}</span>
                                            {item.year && <span className="text-xs opacity-75">({item.year})</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {loadingInspection ? (
                        <div className="flex flex-col items-center justify-center p-12 gap-3 text-slate-400">
                            <Loader2 className="h-6 w-6 animate-spin text-sky-400" />
                            <p className="text-xs font-medium">Extracting stream telemetry and evaluating overlay rules...</p>
                        </div>
                    ) : inspectingItem ? (
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                            {/* Poster Preview (4 Cols) */}
                            <div className="lg:col-span-4 space-y-3.5">
                                <div className="relative aspect-[2/3] max-w-[280px] mx-auto rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl bg-slate-950">
                                    <img 
                                        src={inspectingItem.thumb ? `/api/media/image?url=${encodeURIComponent(inspectingItem.thumb)}` : simPosterImage} 
                                        alt={inspectingItem.title} 
                                        className="w-full h-full object-cover" 
                                    />
                                </div>
                                <div className="flex items-center justify-center gap-2.5">
                                    <Button
                                        type="button"
                                        size="sm"
                                        disabled={applyingSingleOverlay}
                                        onClick={() => handleApplySingleItemOverlay(inspectingItem.ratingKey)}
                                        className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8.5 px-3.5 gap-1.5 rounded-xl cursor-pointer"
                                    >
                                        {applyingSingleOverlay ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                        <span>Apply Overlay</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        disabled={revertingSingleOverlay}
                                        onClick={() => handleRestoreSingleItemPoster(inspectingItem.ratingKey)}
                                        className="border-slate-700 text-slate-300 text-xs h-8.5 px-3 gap-1.5 rounded-xl cursor-pointer"
                                    >
                                        {revertingSingleOverlay ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                        <span>Restore</span>
                                    </Button>
                                </div>
                            </div>

                            {/* Telemetry & Decision Matrix (8 Cols) */}
                            <div className="lg:col-span-8 space-y-4">
                                <div>
                                    <h3 className="text-lg font-black text-white">{inspectingItem.title}</h3>
                                    <p className="text-xs text-slate-400">
                                        {inspectingItem.year || "Unknown Year"} • {inspectingItem.type === "movie" ? "Feature Film" : "TV Series"} • RatingKey: <code className="font-mono text-purple-300">{inspectingItem.ratingKey}</code>
                                    </p>
                                </div>

                                {/* Stream Telemetry Tags */}
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Detected Stream Telemetry:</span>
                                    <div className="flex flex-wrap gap-2 text-xs">
                                        {inspectingItem.detectedBadges?.resolution && (
                                            <Badge className="bg-amber-950/80 text-amber-300 border-amber-500/40 font-bold px-2.5 py-1">
                                                📺 {inspectingItem.detectedBadges.resolution}
                                            </Badge>
                                        )}
                                        {inspectingItem.detectedBadges?.hdr && (
                                            <Badge className="bg-purple-950/80 text-purple-300 border-purple-500/40 font-bold px-2.5 py-1">
                                                ✨ {inspectingItem.detectedBadges.hdr}
                                            </Badge>
                                        )}
                                        {inspectingItem.detectedBadges?.codec && (
                                            <Badge className="bg-indigo-950/80 text-indigo-300 border-indigo-500/40 font-mono px-2.5 py-1">
                                                🎞️ {inspectingItem.detectedBadges.codec}
                                            </Badge>
                                        )}
                                        {inspectingItem.detectedBadges?.audio && (
                                            <Badge className="bg-sky-950/80 text-sky-300 border-sky-500/40 font-bold px-2.5 py-1">
                                                🔊 {inspectingItem.detectedBadges.audio} {inspectingItem.detectedBadges?.audioChannels ? `(${inspectingItem.detectedBadges.audioChannels} CH)` : ""}
                                            </Badge>
                                        )}
                                        {inspectingItem.detectedBadges?.edition && (
                                            <Badge className="bg-cyan-950/80 text-cyan-300 border-cyan-500/40 font-bold px-2.5 py-1">
                                                🏷️ {inspectingItem.detectedBadges.edition}
                                            </Badge>
                                        )}
                                        {inspectingItem.detectedBadges?.studio && (
                                            <Badge className="bg-purple-950/80 text-purple-300 border-purple-500/40 font-bold px-2.5 py-1">
                                                🏢 {inspectingItem.detectedBadges.studio}
                                            </Badge>
                                        )}
                                        {inspectingItem.detectedBadges?.contentRating && (
                                            <Badge className="bg-amber-950/80 text-amber-300 border-amber-500/40 font-bold px-2.5 py-1">
                                                🔞 {inspectingItem.detectedBadges.contentRating}
                                            </Badge>
                                        )}
                                    </div>
                                </div>

                                {/* Decision Matrix Table */}
                                <div className="space-y-2">
                                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Overlay Decision Matrix:</span>
                                    <div className="rounded-2xl border border-slate-800 bg-slate-950/80 overflow-hidden divide-y divide-slate-800/80">
                                        {getInspectedItemDecisionMatrix(inspectingItem).map((dec, idx) => (
                                            <div key={idx} className="p-3 flex items-center justify-between gap-3.5 text-xs">
                                                <div className="space-y-0.5">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white">{dec.property}:</span>
                                                        <span className="text-slate-300 font-mono">{dec.detectedValue}</span>
                                                    </div>
                                                    <p className="text-[11px] text-slate-400">Position: <strong className="text-slate-300">{dec.position}</strong></p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-xs text-purple-300">{dec.badgeName}</span>
                                                    <Badge className={`text-xs px-2 py-0.5 ${
                                                        dec.isCustom 
                                                            ? "bg-purple-950 text-purple-300 border-purple-500/40" 
                                                            : "bg-slate-800 text-slate-300 border-slate-700"
                                                    }`}>
                                                        {dec.priority}
                                                    </Badge>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : (
                        <div className="p-8 text-center bg-slate-950/40 rounded-2xl border border-slate-800 space-y-2">
                            <Film className="h-8 w-8 text-slate-600 mx-auto" />
                            <p className="text-xs text-slate-400">Search for a movie or TV show above to inspect its audio/video streams and test overlay application.</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Upload Custom Badge Modal */}
            <Dialog open={badgeUploadModalOpen} onOpenChange={setBadgeUploadModalOpen}>
                <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100">
                    <DialogHeader>
                        <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                            <Plus className="h-5 w-5 text-purple-400" />
                            <span>Upload Custom Badge Graphic</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-400">
                            Upload an SVG, PNG, or WebP graphic to override default Kometa badges.
                        </DialogDescription>
                    </DialogHeader>

                    <form onSubmit={handleUploadCustomBadge} className="space-y-3.5 text-xs py-2">
                        <div className="space-y-1">
                            <Label className="text-xs text-slate-200">Badge File (.svg, .png, .webp)</Label>
                            <Input
                                type="file"
                                accept=".svg,.png,.webp,.jpg,.jpeg"
                                onChange={e => {
                                    const f = e.target.files?.[0];
                                    if (f) {
                                        setBadgeUploadFile(f);
                                        if (!badgeName) setBadgeName(f.name.replace(/\.[^/.]+$/, ""));
                                    }
                                }}
                                className="bg-slate-950 border-slate-800 text-xs cursor-pointer"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-slate-200">Badge Display Name</Label>
                            <Input
                                value={badgeName}
                                onChange={e => setBadgeName(e.target.value)}
                                placeholder="e.g. 4K UHD Special Edition"
                                className="bg-slate-950 border-slate-800 text-xs text-slate-100"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-slate-200">Category</Label>
                            <Select value={badgeCategory} onValueChange={setBadgeCategory}>
                                <SelectTrigger className="bg-slate-950 border-slate-800 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="resolution">Resolution</SelectItem>
                                    <SelectItem value="hdr">HDR / Dolby Vision</SelectItem>
                                    <SelectItem value="audio">Audio Codec</SelectItem>
                                    <SelectItem value="channels">Surround Channels</SelectItem>
                                    <SelectItem value="codec">Video Codec</SelectItem>
                                    <SelectItem value="edition">Edition Cut</SelectItem>
                                    <SelectItem value="studio">Studio Logo</SelectItem>
                                    <SelectItem value="contentRating">Age Rating</SelectItem>
                                    <SelectItem value="ratings">Critic &amp; Scores</SelectItem>
                                    <SelectItem value="ribbon">Ribbon Banner</SelectItem>
                                    <SelectItem value="custom">General Custom</SelectItem>
                                </SelectContent>
                            </Select>
                            <p className="text-[10px] text-slate-500">Badge position is governed per category in the "Comprehensive Poster Badge Toggles &amp; Positions" section.</p>
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-slate-200">Match Rule (Comma-separated)</Label>
                            <Input
                                value={badgeMatchRule}
                                onChange={e => setBadgeMatchRule(e.target.value)}
                                placeholder="e.g. 4k, dv, atmos, imax"
                                className="bg-slate-950 border-slate-800 text-xs text-slate-100 font-mono"
                            />
                            <p className="text-[10px] text-slate-400">Match criteria in media stream tags to trigger this badge override.</p>
                        </div>

                        {badgeUploadError && (
                            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                                {badgeUploadError}
                            </div>
                        )}

                        <DialogFooter className="pt-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setBadgeUploadModalOpen(false)}>Cancel</Button>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={uploadingBadge || !badgeUploadFile}
                                className="bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs"
                            >
                                {uploadingBadge ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                                <span>Upload &amp; Install Badge</span>
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Import GitHub Badge Packs Modal */}
            <Dialog open={githubModalOpen} onOpenChange={setGithubModalOpen}>
                <DialogContent className="max-w-xl bg-slate-900 border-slate-800 text-slate-100 max-h-[85vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="pb-2 border-b border-slate-800">
                        <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                            <DownloadCloud className="h-5 w-5 text-sky-400" />
                            <span>Import Badge Packs from GitHub</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-400">
                            Scan any GitHub repository or folder containing Kometa / PMM badges and batch import them directly into your vault.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3.5 flex-1 overflow-y-auto pr-1 py-2 text-xs">
                        <div className="space-y-1">
                            <Label className="text-xs text-slate-200">GitHub Repository Folder URL</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    value={githubRepoInput}
                                    onChange={e => setGithubRepoInput(e.target.value)}
                                    placeholder="https://github.com/jmxd/Kometa/tree/main/overlays/images"
                                    className="bg-slate-950 border-slate-800 text-xs text-slate-100 font-mono"
                                />
                                <Button
                                    type="button"
                                    size="sm"
                                    disabled={scanningRepo || !githubRepoInput.trim()}
                                    onClick={handleScanGitHubRepo}
                                    className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs h-8 px-3 shrink-0"
                                >
                                    {scanningRepo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                                    <span>Scan Repo</span>
                                </Button>
                            </div>
                        </div>

                        {scanError && (
                            <div className="p-2.5 rounded-lg bg-rose-950/80 border border-rose-800 text-rose-300 text-xs">
                                {scanError}
                            </div>
                        )}

                        {importSuccessMsg && (
                            <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                <span>{importSuccessMsg}</span>
                            </div>
                        )}

                        {discoveredBadges.length > 0 && (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                                    <span>Discovered Badges ({discoveredBadges.length}):</span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedBadgeIds(discoveredBadges.map(b => b.id))}
                                            className="text-[10px] text-sky-400 hover:underline"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setSelectedBadgeIds([])}
                                            className="text-[10px] text-slate-400 hover:underline"
                                        >
                                            Deselect All
                                        </button>
                                    </div>
                                </div>

                                <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                                    {discoveredBadges.map(b => {
                                        const isSelected = selectedBadgeIds.includes(b.id);
                                        return (
                                            <div
                                                key={b.id}
                                                onClick={() => {
                                                    setSelectedBadgeIds(prev => 
                                                        isSelected ? prev.filter(id => id !== b.id) : [...prev, b.id]
                                                    );
                                                }}
                                                className={`p-2 rounded-lg border flex items-center justify-between gap-2 cursor-pointer transition-all ${
                                                    isSelected
                                                        ? "bg-sky-950/40 border-sky-500/60 text-white"
                                                        : "bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white"
                                                }`}
                                            >
                                                <div className="flex items-center gap-2 truncate">
                                                    <input
                                                        type="checkbox"
                                                        checked={isSelected}
                                                        onChange={() => {}}
                                                        className="rounded accent-sky-500"
                                                    />
                                                    <span className="font-semibold text-xs truncate">{b.name}</span>
                                                    <Badge variant="outline" className="text-[9px] px-1 py-0 border-slate-700 capitalize">
                                                        {b.category}
                                                    </Badge>
                                                </div>
                                                <span className="text-[9px] font-mono text-slate-500 shrink-0">
                                                    {b.inferredRule || "auto"}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-between">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setGithubModalOpen(false)}>Close</Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={importingBadges || selectedBadgeIds.length === 0}
                            onClick={handleImportGitHubBadges}
                            className="bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs gap-1.5"
                        >
                            {importingBadges ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DownloadCloud className="h-3.5 w-3.5" />}
                            <span>Import {selectedBadgeIds.length} Selected Badges</span>
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Kometa Configuration Importer & Migration Modal */}
            <Dialog open={kometaModalOpen} onOpenChange={setKometaModalOpen}>
                <DialogContent className="max-w-3xl bg-slate-900 border-slate-800 text-slate-100 max-h-[90vh] flex flex-col p-6 overflow-hidden">
                    <DialogHeader className="pb-2 border-b border-slate-800">
                        <div className="flex items-center justify-between">
                            <DialogTitle className="text-base sm:text-lg font-bold flex items-center gap-2 text-white">
                                <Zap className="h-5 w-5 text-amber-400 fill-amber-400/30" />
                                <span>Kometa &amp; PMM Configuration Studio</span>
                            </DialogTitle>
                            <Badge variant="outline" className="bg-amber-950/40 text-amber-300 border-amber-500/40 text-xs font-semibold">
                                YAML Importer &amp; Migrator
                            </Badge>
                        </div>
                        <DialogDescription className="text-xs text-slate-400">
                            Load your existing Kometa or Plex-Meta-Manager <code className="text-amber-300 font-mono">config.yml</code> directly from your computer, server disk, or paste raw YAML. Automatically converts overlay rules, ribbons, and TMDb keys.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto space-y-4 pr-1 text-xs py-2">
                        {/* Source Loader Bar */}
                        <div className="p-3.5 bg-slate-950/90 rounded-xl border border-slate-800 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-white text-xs flex items-center gap-1.5">
                                    <FolderOpen className="h-4 w-4 text-purple-400" /> Load Configuration Source
                                </span>
                                {kometaLoadedFileName ? (
                                    <div className="flex items-center gap-2">
                                        <Badge className="bg-emerald-950 text-emerald-300 border-emerald-500/40 text-[10px] gap-1 font-mono">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                            <span>Active: {kometaLoadedFileName}</span>
                                        </Badge>
                                        <button
                                            type="button"
                                            onClick={handleClearKometaConfig}
                                            className="text-[10px] text-slate-400 hover:text-rose-300 transition-colors cursor-pointer"
                                            title="Clear loaded configuration"
                                        >
                                            Reset
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-[10px] text-slate-400">Select an import method below</span>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {/* Option 1: Browse / Upload File */}
                                <div 
                                    onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setKometaIsDragging(true); }}
                                    onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setKometaIsDragging(false); }}
                                    onDrop={handleDropKometaFile}
                                    className={`p-3 rounded-xl border transition-all flex flex-col items-center justify-center gap-1.5 text-center cursor-pointer relative group ${
                                        kometaIsDragging
                                            ? "border-amber-400 bg-amber-950/40 ring-2 ring-amber-400/40"
                                            : kometaLoadedFileName
                                                ? "border-emerald-500/60 bg-emerald-950/20 hover:border-emerald-400"
                                                : "border-dashed border-slate-700/80 hover:border-amber-500/60 bg-slate-900/90"
                                    }`}
                                >
                                    {kometaUploadingFile || (kometaInspecting && !kometaLoadingDisk) ? (
                                        <>
                                            <Loader2 className="h-5 w-5 text-amber-400 animate-spin" />
                                            <span className="font-bold text-amber-300 text-xs">Ingesting &amp; Parsing File...</span>
                                            <p className="text-[10px] text-slate-400">{kometaLoadedFileName || "Analyzing YAML structure"}</p>
                                        </>
                                    ) : kometaLoadedFileName ? (
                                        <>
                                            <div className="flex items-center gap-1.5 text-emerald-400">
                                                <CheckCircle2 className="h-5 w-5" />
                                                <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] font-bold">
                                                    ✓ Ingested
                                                </Badge>
                                            </div>
                                            <span className="font-bold text-white text-xs truncate max-w-[240px]" title={kometaLoadedFileName}>
                                                {kometaLoadedFileName}
                                            </span>
                                            <p className="text-[10px] text-emerald-300/80">
                                                {kometaLoadedFileSize ? `${kometaLoadedFileSize} • ` : ""}Click or drop to replace
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <UploadCloud className="h-5 w-5 text-amber-400 group-hover:scale-110 transition-transform" />
                                            <span className="font-bold text-slate-200 text-xs">Upload config.yml File</span>
                                            <p className="text-[10px] text-slate-400">Drag &amp; drop or click to browse (.yml, .yaml)</p>
                                        </>
                                    )}
                                    <input 
                                        type="file" 
                                        accept=".yml,.yaml,.txt" 
                                        onChange={handleFileUploadKometa}
                                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" 
                                    />
                                </div>

                                {/* Option 2: Quick Load from Server Disk */}
                                <div className="p-3 bg-slate-900/90 rounded-xl border border-slate-800 space-y-2 flex flex-col justify-between">
                                    <div>
                                        <span className="font-bold text-slate-200 text-xs flex items-center gap-1">
                                            <HardDrive className="h-3.5 w-3.5 text-cyan-400" /> Quick Server Disk
                                        </span>
                                        <p className="text-[10px] text-slate-400">Load files detected in project root</p>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={kometaLoadingDisk}
                                            onClick={() => handleLoadDiskKometaConfig("kometaconfig.yml")}
                                            className={`text-[11px] h-7 px-2 gap-1 font-mono transition-all ${
                                                kometaLoadedFileName === "kometaconfig.yml"
                                                    ? "bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold"
                                                    : "bg-slate-800 hover:bg-slate-700 text-amber-300 border-slate-700"
                                            }`}
                                        >
                                            {kometaLoadingDisk && kometaLoadedFileName === "kometaconfig.yml" ? <Loader2 className="h-3 w-3 animate-spin" /> : <FileCode className="h-3 w-3" />}
                                            kometaconfig.yml
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={kometaLoadingDisk}
                                            onClick={() => handleLoadDiskKometaConfig("config.yml")}
                                            className={`text-[11px] h-7 px-2 gap-1 font-mono transition-all ${
                                                kometaLoadedFileName === "config.yml"
                                                    ? "bg-amber-500/20 border-amber-500/60 text-amber-300 font-bold"
                                                    : "bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
                                            }`}
                                        >
                                            config.yml
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Status Messages */}
                        {kometaImportSuccessMsg && (
                            <div className="p-3 bg-emerald-950/80 border border-emerald-800 rounded-xl text-xs text-emerald-300 flex items-center gap-2 animate-in fade-in-50">
                                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                                <span>{kometaImportSuccessMsg}</span>
                            </div>
                        )}

                        {kometaImportErrorMsg && (
                            <div className="p-3 bg-rose-950/80 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2 animate-in fade-in-50">
                                <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                                <span>{kometaImportErrorMsg}</span>
                            </div>
                        )}
                    </div>

                    <DialogFooter className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                                handleApplyKometaToSimulator();
                                setKometaModalOpen(false);
                            }}
                            className="text-xs border-slate-700 hover:bg-slate-800 gap-1.5 text-slate-300"
                        >
                            <Palette className="h-3.5 w-3.5 text-purple-400" />
                            <span>Preview in Poster Simulator</span>
                        </Button>
                        <div className="flex items-center gap-2">
                            <Button type="button" variant="ghost" size="sm" onClick={() => setKometaModalOpen(false)}>Close</Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={kometaImporting || (!kometaInspectionResult && !kometaYamlInput)}
                                onClick={async () => {
                                    setKometaImporting(true);
                                    try {
                                        const res = await importKometaConfigAction({
                                            yamlContent: kometaYamlInput || undefined,
                                            targetServerId: selectedServerId || undefined,
                                            libraryMappings: kometaLibMappings.length > 0 ? kometaLibMappings : undefined,
                                            importTmdbKey: kometaImportTmdb
                                        });
                                        if (res.success) {
                                            setKometaImportSuccessMsg(res.message || "Imported Kometa config!");
                                            handleApplyKometaToSimulator();
                                            setTimeout(() => setKometaModalOpen(false), 1500);
                                        } else {
                                            setKometaImportErrorMsg(res.error || "Import failed");
                                        }
                                    } catch (e: any) {
                                        setKometaImportErrorMsg(e.message || "Failed importing.");
                                    } finally {
                                        setKometaImporting(false);
                                    }
                                }}
                                className="bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-xs gap-1.5 shadow-md cursor-pointer"
                            >
                                {kometaImporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 fill-slate-950" />}
                                <span>Import &amp; Apply to Portalarr</span>
                            </Button>
                        </div>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Plex Real Media Poster Picker Modal */}
            <PlexPosterPickerModal
                open={posterPickerModalOpen}
                onOpenChange={setPosterPickerModalOpen}
                serverId={selectedServerId}
                sectionKey={selectedSectionKey}
                serverName={servers.find(s => s.serverId === selectedServerId)?.serverName}
                servers={servers}
                onSelect={handleSelectRealPoster}
            />

            {/* Bulk Delete & Purge Custom Badges Dialog */}
            <Dialog open={bulkDeleteModalOpen} onOpenChange={setBulkDeleteModalOpen}>
                <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="text-lg font-bold flex items-center gap-2 text-rose-400">
                            <Trash2 className="h-5 w-5" />
                            <span>Bulk Delete &amp; Purge Custom Badges</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-400">
                            Manage and purge downloaded custom badges from your disk storage (<code className="text-purple-300 font-mono">data/custom_badges</code>) and database.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-1.5 text-xs">
                            <div className="flex items-center justify-between text-slate-300">
                                <span>Total Badges in Vault:</span>
                                <strong className="text-white font-mono text-sm">{customBadges.length} Badges</strong>
                            </div>
                            {selectedCustomBadgeIds.length > 0 && (
                                <div className="flex items-center justify-between text-purple-300">
                                    <span>Currently Selected:</span>
                                    <strong className="font-mono text-sm">{selectedCustomBadgeIds.length} Badges</strong>
                                </div>
                            )}
                            {filteredCustomBadges.length < customBadges.length && (
                                <div className="flex items-center justify-between text-amber-300">
                                    <span>Matching Current Filter/Search:</span>
                                    <strong className="font-mono text-sm">{filteredCustomBadges.length} Badges</strong>
                                </div>
                            )}
                        </div>

                        <div className="space-y-2.5">
                            {/* Option 1: Reset to 35 Essentials (Recommended) */}
                            <button
                                type="button"
                                disabled={purgingBadges}
                                onClick={() => handleBulkPurgeBadges(true)}
                                className="w-full text-left p-3.5 rounded-xl border border-amber-500/40 bg-amber-950/20 hover:bg-amber-950/40 transition-all flex items-start gap-3 cursor-pointer group"
                            >
                                <Zap className="h-5 w-5 text-amber-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                <div className="space-y-0.5">
                                    <p className="text-xs font-bold text-amber-300 flex items-center gap-1.5">
                                        <span>⚡ Purge All &amp; Reset to 35 Essential Badges (Recommended)</span>
                                        {purgingBadges && <Loader2 className="h-3 w-3 animate-spin text-amber-400" />}
                                    </p>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                        Deletes all {customBadges.length} downloaded/imported community badges, purges disk files, and immediately restores the clean standard 35 high-DPI SVGs (4K UHD, HDR10+, DV, Atmos, etc.).
                                    </p>
                                </div>
                            </button>

                            {/* Option 2: Delete Selected if any */}
                            {selectedCustomBadgeIds.length > 0 && (
                                <button
                                    type="button"
                                    disabled={purgingBadges || deletingCustomBadges}
                                    onClick={async () => {
                                        setBulkDeleteModalOpen(false);
                                        await handleDeleteSelectedBadges();
                                    }}
                                    className="w-full text-left p-3.5 rounded-xl border border-purple-500/40 bg-purple-950/20 hover:bg-purple-950/40 transition-all flex items-start gap-3 cursor-pointer group"
                                >
                                    <CheckCheck className="h-5 w-5 text-purple-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                    <div className="space-y-0.5">
                                        <p className="text-xs font-bold text-purple-300">
                                            🗑️ Delete Selected ({selectedCustomBadgeIds.length}) Badges Only
                                        </p>
                                        <p className="text-[11px] text-slate-400 leading-relaxed">
                                            Permanently deletes only the {selectedCustomBadgeIds.length} currently selected badge(s) and their image files.
                                        </p>
                                    </div>
                                </button>
                            )}

                            {/* Option 3: Wipe Everything (0 Badges) */}
                            <button
                                type="button"
                                disabled={purgingBadges}
                                onClick={() => handleBulkPurgeBadges(false)}
                                className="w-full text-left p-3.5 rounded-xl border border-rose-500/40 bg-rose-950/20 hover:bg-rose-950/40 transition-all flex items-start gap-3 cursor-pointer group"
                            >
                                <Trash2 className="h-5 w-5 text-rose-400 shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                                <div className="space-y-0.5">
                                    <p className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                                        <span>🗑️ Delete Everything (Wipe All {customBadges.length} Badges)</span>
                                        {purgingBadges && <Loader2 className="h-3 w-3 animate-spin text-rose-400" />}
                                    </p>
                                    <p className="text-[11px] text-slate-400 leading-relaxed">
                                        Permanently deletes every badge and image file from the custom badge vault, leaving it completely empty (0 badges).
                                    </p>
                                </div>
                            </button>
                        </div>
                    </div>

                    <DialogFooter className="pt-3 border-t border-slate-800">
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            disabled={purgingBadges}
                            onClick={() => setBulkDeleteModalOpen(false)}
                        >
                            Cancel
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Comprehensive Stock & Custom Overlays Guide Modal */}
            <KometaOverlaysGuideModal
                open={guideModalOpen}
                onOpenChange={setGuideModalOpen}
            />
        </div>
    );
}

export default KometaStudio;
