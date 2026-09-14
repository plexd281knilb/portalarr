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
    Trash2,
    ExternalLink
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
    downloadAllKometaPacksAction,
    readLocalKometaConfigAction,
    inspectKometaConfigFileAction,
    importKometaConfigAction,
    searchPlexLibraryItemsAction,
    inspectPlexMediaItemAction,
    applyOverlayToSingleItemAction,
    restoreSingleItemPosterAction,
    fetchGitHubBadgeRepoAction,
    importGitHubBadgesAction
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
    const [simTheme, setSimTheme] = useState<"glass" | "gold" | "classic" | "minimal">("glass");
    const [simDovetailResolutionHdr, setSimDovetailResolutionHdr] = useState<boolean>(true);
    const [simPosterImage, setSimPosterImage] = useState<string>("https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80");
    const [simActivePreset, setSimActivePreset] = useState<string>("4k_dv_atmos");
    
    // Positions
    const [simResolutionPosition, setSimResolutionPosition] = useState<string>("top-right");
    const [simHdrPosition, setSimHdrPosition] = useState<string>("top-right");
    const [simCodecPosition, setSimCodecPosition] = useState<string>("top-right");
    const [simAudioPosition, setSimAudioPosition] = useState<string>("top-left");
    const [simChannelsPosition, setSimChannelsPosition] = useState<string>("top-left");
    const [simEditionPosition, setSimEditionPosition] = useState<string>("bottom-right");
    const [simStudioPosition, setSimStudioPosition] = useState<string>("bottom-left");
    const [simRatingPosition, setSimRatingPosition] = useState<string>("bottom-left");
    const [simRatingsPosition, setSimRatingsPosition] = useState<string>("bottom-left");

    // Ribbons
    const [simShowRibbon, setSimShowRibbon] = useState(false);
    const [simRibbonPosition, setSimRibbonPosition] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left">("top-right");
    const [simRibbonTheme, setSimRibbonTheme] = useState<"purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange">("purple");
    const [simRibbonType, setSimRibbonType] = useState<string>("auto_quality");
    const [simRibbonText, setSimRibbonText] = useState("");
    const [simRibbonMode, setSimRibbonMode] = useState<"single" | "tiered" | "auto_stack">("tiered");
    const [simMaxRibbonTiers, setSimMaxRibbonTiers] = useState<number>(3);
    const [simTieredRibbons, setSimTieredRibbons] = useState<Array<{
        id: string;
        type: string;
        text: string;
        theme: "purple" | "emerald" | "crimson" | "gold" | "cyan" | "pink" | "glass" | "orange";
        enabled: boolean;
    }>>([
        { id: "tier-1", type: "imdb_top_250", text: "IMDb TOP 250", theme: "gold", enabled: true },
        { id: "tier-2", type: "certified_fresh", text: "CERTIFIED FRESH", theme: "crimson", enabled: true },
        { id: "tier-3", type: "oscar_winner", text: "OSCAR WINNER", theme: "gold", enabled: false }
    ]);

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
    const [badgePosition, setBadgePosition] = useState("top-right");
    const [badgeMatchRule, setBadgeMatchRule] = useState("");
    const [uploadingBadge, setUploadingBadge] = useState(false);
    const [badgeUploadError, setBadgeUploadError] = useState<string | null>(null);
    const [selectedCustomBadgeIds, setSelectedCustomBadgeIds] = useState<string[]>([]);
    const [customBadgeFilter, setCustomBadgeFilter] = useState<string>("all");
    const [customBadgeSearch, setCustomBadgeSearch] = useState<string>("");
    const [deletingCustomBadges, setDeletingCustomBadges] = useState(false);

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
                    }
                }

                const badgeRes = await getCustomBadgesAction();
                if (badgeRes?.success && badgeRes.badges) {
                    setCustomBadges(badgeRes.badges);
                }

                const rulesRes = await getOverlayRulesAction();
                if (rulesRes.success && rulesRes.rules) {
                    setOverlayRules(rulesRes.rules);
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

    const loadRulesForSection = async (srvId?: string, secKey?: string) => {
        setServerSectionsLoading(true);
        try {
            const res = await getOverlayRulesAction(srvId || selectedServerId, secKey || selectedSectionKey);
            if (res.success && res.rules) {
                setOverlayRules(res.rules);
            }
        } catch (e) {
            console.error("Failed loading rules:", e);
        } finally {
            setServerSectionsLoading(false);
        }
    };

    // Helper functions for Ribbons
    const getEffectiveRibbonText = (item?: any) => {
        if (simRibbonText && simRibbonText.trim()) return simRibbonText.trim().toUpperCase();
        if (simRibbonType === "imdb_top_250") return "IMDb TOP 250";
        if (simRibbonType === "imdb_top_250_tv") return "IMDb TOP TV";
        if (simRibbonType === "certified_fresh") return "CERTIFIED FRESH";
        if (simRibbonType === "rt_fresh") return "RT FRESH";
        if (simRibbonType === "oscar_winner") return "OSCAR WINNER";
        if (simRibbonType === "academy_award") return "BEST PICTURE";
        if (simRibbonType === "emmy_winner") return "EMMY WINNER";
        if (simRibbonType === "golden_globe") return "GOLDEN GLOBE";
        if (simRibbonType === "critics_choice") return "CRITICS' CHOICE";
        if (simRibbonType === "bafta_winner") return "BAFTA WINNER";
        if (simRibbonType === "cannes_winner") return "PALME D'OR";
        if (simRibbonType === "metacritic_must_see") return "MUST-SEE";
        if (simRibbonType === "leaving_soon") return "LEAVING SOON";
        if (simRibbonType === "auto_edition") {
            if (item?.detectedBadges?.edition) return item.detectedBadges.edition.toUpperCase();
            return "IMAX ENHANCED";
        }
        if (simRibbonType === "auto_quality") {
            if (item?.detectedBadges?.resolution === "4K" || (!item && simShowResolution)) return "4K UHD";
            if (item?.detectedBadges?.hdr || (!item && simShowHdr)) return (item?.detectedBadges?.hdr || "DOLBY VISION").toUpperCase();
            return "4K UHD";
        }
        return (simRibbonText.trim() || "FEATURED").toUpperCase();
    };

    const getActiveSimulatorRibbons = (): Array<{ text: string; theme: string }> => {
        if (simRibbonMode === "single") {
            return [{ text: getEffectiveRibbonText(), theme: simRibbonTheme }];
        }
        if (simRibbonMode === "auto_stack") {
            return [
                { text: "IMDb TOP 250", theme: "gold" },
                { text: "CERTIFIED FRESH", theme: "crimson" },
                { text: "4K UHD", theme: "purple" }
            ].slice(0, simMaxRibbonTiers);
        }
        const active = simTieredRibbons
            .filter(t => t.enabled && t.text && t.text.trim())
            .slice(0, simMaxRibbonTiers)
            .map(t => ({ text: t.text.trim().toUpperCase(), theme: t.theme }));
        return active.length > 0 ? active : [{ text: "IMDb TOP 250", theme: "gold" }];
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
        if (c === "directors_cut" || c === "director") return (detected.edition || "").toLowerCase().includes("director");
        if (c === "extended") return (detected.edition || "").toLowerCase().includes("extended");
        if (c === "theatrical") return (detected.edition || "").toLowerCase().includes("theatrical");
        if (c === "remastered" || c === "remaster") return (detected.edition || "").toLowerCase().includes("remaster");

        if (c === "netflix") return (detected.studio || "").toLowerCase().includes("netflix");
        if (c === "disney") return (detected.studio || "").toLowerCase().includes("disney");
        if (c === "hbo" || c === "max") return (detected.studio || "").toLowerCase().includes("hbo") || (detected.studio || "").toLowerCase().includes("max");
        if (c === "apple" || c === "apple_tv") return (detected.studio || "").toLowerCase().includes("apple");
        if (c === "amazon" || c === "prime") return (detected.studio || "").toLowerCase().includes("amazon") || (detected.studio || "").toLowerCase().includes("prime");
        if (c === "paramount") return (detected.studio || "").toLowerCase().includes("paramount");
        if (c === "marvel") return (detected.studio || "").toLowerCase().includes("marvel");
        if (c === "dc") return (detected.studio || "").toLowerCase().includes("dc");
        if (c === "a24") return (detected.studio || "").toLowerCase().includes("a24");

        const cr = (detected.contentRating || "").toUpperCase();
        if (c === "pg-13") return cr === "PG-13" || cr === "US:PG-13";
        if (c === "nc-17") return cr === "NC-17" || cr === "US:NC-17";
        if (c === "r") return cr === "R" || cr === "US:R";
        if (c === "pg") return cr === "PG" || cr === "US:PG";
        if (c === "g") return cr === "G" || cr === "US:G";
        if (c === "tv-ma" || c === "tvma") return cr === "TV-MA" || cr === "US:TV-MA";
        if (c === "tv-14" || c === "tv14") return cr === "TV-14" || cr === "US:TV-14";
        if (c === "tv-pg" || c === "tvpg") return cr === "TV-PG" || cr === "US:TV-PG";
        if (c === "tv-g" || c === "tvg") return cr === "TV-G" || cr === "US:TV-G";
        if (c === "tv-y" || c === "tvy") return cr === "TV-Y" || cr === "US:TV-Y";
        if (c === "tv-y7" || c === "tvy7") return cr === "TV-Y7" || cr === "US:TV-Y7";

        return false;
    };

    const doesCustomBadgeMatchDetected = (
        cb: { category?: string; matchRule?: string | null; name?: string; filePath?: string },
        detected: { resolution?: string; hdr?: string; audio?: string; audioChannels?: string; codec?: string; edition?: string; studio?: string; contentRating?: string }
    ): boolean => {
        const rawRule = (cb.matchRule || "").trim().toLowerCase();
        const rawCategory = (cb.category || "").trim().toLowerCase();
        const rawName = (cb.name || "").toLowerCase();
        const rawFile = (cb.filePath || "").split("/").pop()?.toLowerCase() || "";

        if (rawRule === "all" || rawRule === "*" || (rawCategory === "ribbon" && !rawRule) || (rawCategory === "banner" && !rawRule)) {
            return true;
        }

        let tokens: string[] = [];
        if (rawRule.includes("+") || rawRule.includes(",") || rawRule.includes("&")) {
            tokens = rawRule.split(/[+,&]/).map(t => t.trim()).filter(Boolean);
        } else if (rawRule) {
            tokens = [rawRule];
        } else {
            const baseName = rawName || rawFile.replace(/\.[^/.]+$/, "");
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

            tokens = inferredTokens;
        }

        if (tokens.length === 0) return false;
        return tokens.every(tok => evaluateBadgeConditionClient(tok, detected));
    };

    const getCustomBadgeCategoriesClient = (cb: any): string[] => {
        const cat = (cb.category || "").toLowerCase();
        const rule = (cb.matchRule || "").toLowerCase();
        const name = (cb.name || "").toLowerCase();
        const fName = (cb.filePath || "").split("/").pop()?.toLowerCase() || "";
        const combined = `${cat} ${rule} ${name} ${fName}`;

        const categories: string[] = [];
        if (cat === "resolution" || /4k|2160|1080|720|480|576|sd|uhd|fhd/i.test(combined)) categories.push("resolution");
        if (cat === "hdr" || /dv|hdr|dolby.*vision|plus/i.test(combined)) categories.push("hdr");
        if (cat === "codec" || /hevc|av1|prores|avc|h264|h265|x264|x265/i.test(combined)) categories.push("codec");
        if (cat === "audio" || /atmos|truehd|dts|flac|aac|eac3|ac3/i.test(combined)) categories.push("audio");
        if (/7\.1|5\.1|2\.0|channels|surround/i.test(combined)) categories.push("channels");
        if (cat === "edition" || /imax|criterion|director|extended|remux|theatrical|remaster/i.test(combined)) categories.push("edition");
        if (cat === "studio" || /netflix|disney|hbo|apple|prime|paramount|marvel|dc|a24/i.test(combined)) categories.push("studio");
        if (cat === "ratings" || /pg-13|nc-17|tv-ma|rated|pg|r|g/i.test(combined)) categories.push("contentRating");
        if (cat === "ribbon") categories.push("ribbon");

        if (categories.length === 0 && cat && cat !== "custom") categories.push(cat);
        return categories;
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
                sourceName: `Kometa Dovetail SVG (${simTheme === "gold" ? "Gold" : "Obsidian"})`,
                position: simResolutionPosition
            });
        } else {
            if (simShowResolution) {
                if (matchingResCustom) {
                    layers.push({ category: "Resolution", value: "4K UHD", sourceType: "custom", sourceName: matchingResCustom.name, position: matchingResCustom.position || simResolutionPosition });
                } else {
                    layers.push({ category: "Resolution", value: "4K UHD", sourceType: "builtin", sourceName: `Kometa SVG (${simTheme === "gold" ? "Gold" : "Obsidian"})`, position: simResolutionPosition });
                }
            }

            if (simShowHdr) {
                if (matchingHdrCustom) {
                    layers.push({ category: "HDR / DV", value: "Dolby Vision", sourceType: "custom", sourceName: matchingHdrCustom.name, position: matchingHdrCustom.position || simHdrPosition });
                } else {
                    layers.push({ category: "HDR / DV", value: "Dolby Vision", sourceType: "builtin", sourceName: "Kometa SVG", position: simHdrPosition });
                }
            }
        }

        if (simShowCodec) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("codec") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Video Codec", value: "HEVC (H.265)", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simCodecPosition });
            } else {
                layers.push({ category: "Video Codec", value: "HEVC (H.265)", sourceType: "builtin", sourceName: "Kometa SVG", position: simCodecPosition });
            }
        }

        if (simShowAudio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("audio") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Audio Format", value: "Dolby Atmos", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simAudioPosition });
            } else {
                layers.push({ category: "Audio Format", value: "Dolby Atmos", sourceType: "builtin", sourceName: "Kometa SVG", position: simAudioPosition });
            }
        }

        if (simShowChannels) {
            layers.push({ category: "Audio Channels", value: "7.1 Surround", sourceType: "builtin", sourceName: "Kometa SVG", position: simChannelsPosition });
        }

        if (simShowEdition) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("edition") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Edition / Cut", value: "IMAX Enhanced", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simEditionPosition });
            } else {
                layers.push({ category: "Edition / Cut", value: "IMAX Enhanced", sourceType: "builtin", sourceName: "Kometa SVG", position: simEditionPosition });
            }
        }

        if (simShowStudio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("studio") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Studio / Network", value: "HBO Max", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simStudioPosition });
            } else {
                layers.push({ category: "Studio / Network", value: "HBO Max", sourceType: "builtin", sourceName: "Kometa SVG", position: simStudioPosition });
            }
        }

        if (simShowRating) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("contentRating") && doesCustomBadgeMatchDetected(cb, simDetected));
            if (matchingCustom) {
                layers.push({ category: "Age Rating", value: "PG-13", sourceType: "custom", sourceName: matchingCustom.name, position: matchingCustom.position || simRatingPosition });
            } else {
                layers.push({ category: "Age Rating", value: "PG-13", sourceType: "builtin", sourceName: "Kometa SVG", position: simRatingPosition });
            }
        }

        if (simRatings) {
            layers.push({ category: "Community Ratings", value: "IMDb 8.6 • RT 94%", sourceType: "builtin", sourceName: "IMDb / Rotten Tomatoes", position: simRatingsPosition });
        }

        if (simShowRibbon) {
            const activeRibbons = getActiveSimulatorRibbons();
            const ribbonText = activeRibbons.map(r => r.text).join(" • ");
            const isMultiTier = activeRibbons.length > 1;
            layers.push({ 
                category: "Corner Ribbon", 
                value: ribbonText || getEffectiveRibbonText(), 
                sourceType: "builtin", 
                sourceName: `Gloss Ribbon (${simRibbonTheme}${isMultiTier ? ` • ${activeRibbons.length} Tiers` : ""})`, 
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
                    position: matchingRes?.position || simResolutionPosition,
                    isCustom: !matchingRes
                });
            }

            if (detected.hdr) {
                decisions.push({
                    property: "Dynamic Range / HDR",
                    detectedValue: detected.hdr === "DV" ? "Dolby Vision" : detected.hdr,
                    priority: matchingHdr ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                    badgeName: matchingHdr ? matchingHdr.name : `Built-in ${detected.hdr} SVG`,
                    position: matchingHdr?.position || simHdrPosition,
                    isCustom: !matchingHdr
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
                position: matchingCustom?.position || simAudioPosition,
                isCustom: !matchingCustom
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
                position: matchingCustom?.position || simCodecPosition,
                isCustom: !matchingCustom
            });
        }

        if (detected.edition) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("edition") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Edition / Cut",
                detectedValue: detected.edition,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.edition} SVG`,
                position: matchingCustom?.position || simEditionPosition,
                isCustom: !matchingCustom
            });
        }

        if (detected.studio) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("studio") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Studio / Network",
                detectedValue: detected.studio,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.studio} SVG`,
                position: matchingCustom?.position || simStudioPosition,
                isCustom: !matchingCustom
            });
        }

        if (detected.contentRating) {
            const matchingCustom = customBadges.find(cb => cb.enabled && getCustomBadgeCategoriesClient(cb).includes("contentRating") && doesCustomBadgeMatchDetected(cb, detected));
            decisions.push({
                property: "Age Rating",
                detectedValue: detected.contentRating,
                priority: matchingCustom ? "Priority 1 (Custom Override)" : "Priority 2 (Built-in SVG)",
                badgeName: matchingCustom ? matchingCustom.name : `Built-in ${detected.contentRating} SVG`,
                position: matchingCustom?.position || simRatingPosition,
                isCustom: !matchingCustom
            });
        }

        return decisions;
    };

    // Save Overlay Settings
    const handleSaveOverlaySettings = async () => {
        setSavingOverlaySettings(true);
        setOverlayMessage(null);
        try {
            const payload = {
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
                layerPriorityOrder: layerPriorityOrder
            };

            const res = await saveOverlayRuleAction(payload);
            if (res.success) {
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
            const res = await applyOverlaysToLibraryAction(selectedServerId, selectedSectionKey);
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
        setSimActivePreset("my_kometa_config");

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
            setSimCodecPosition(converted.codecPosition || "bottom-right");
            setSimShowEdition(Boolean(converted.showEdition));
            setSimEditionPosition(converted.editionPosition || "top-right");
            setSimShowStudio(Boolean(converted.showStudio));
            setSimStudioPosition(converted.studioPosition || "top-left");
            setSimShowRating(Boolean(converted.showContentRating));
            setSimRatingPosition(converted.contentRatingPosition || "bottom-left");
            setSimRatings(Boolean(converted.showRatings));
            setSimShowRibbon(Boolean(converted.showRibbon));
            setSimRibbonPosition(converted.ribbonPosition || "top-right");
            setSimRibbonMode(converted.ribbonMode || "tiered");
            setSimRibbonTheme(converted.ribbonTheme || "gold");
            setSimMaxRibbonTiers(converted.maxRibbonTiers || 3);
            if (Array.isArray(converted.tieredRibbons)) {
                setSimTieredRibbons(converted.tieredRibbons);
            }
        }
    };

    const currentServer = servers.find(s => s.serverId === selectedServerId) || servers[0];
    const currentSections = currentServer?.sections || [];

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                <p className="text-sm font-medium">Loading Kometa Overlays Studio...</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <CurationNavHeader 
                serversCount={servers.length}
                title="Kometa Overlays & Badge Studio"
                description="4K UHD, HDR, Dolby Vision dovetailing, studio audio codecs, US age ratings, network logos, and tiered gloss ribbons."
            />

            {/* Static Server & Library Section Navigator */}
            {servers.length > 0 && (
                <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                    <div className="p-4 space-y-3.5">
                        {/* Plex Servers Static Tabs */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 shrink-0">
                                <Tv className="h-4 w-4 text-purple-400" />
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
                                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/60 border border-purple-400/50 ring-1 ring-purple-400/40'
                                                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white shadow-sm' : 'bg-emerald-400'}`} />
                                            <span>{s.serverName || "Plex Server"}</span>
                                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isSelected ? 'border-purple-300 text-purple-100 bg-purple-700/60' : 'border-slate-700 text-slate-400'}`}>
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
                                <span>Library Section:</span>
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

                                        return (
                                            <button
                                                key={sec.key}
                                                type="button"
                                                onClick={() => handleSelectSection(String(sec.key))}
                                                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                    isSelected
                                                        ? 'bg-sky-600 text-white shadow-md shadow-sky-950/60 border border-sky-400/50 ring-1 ring-sky-400/40'
                                                        : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
                                                }`}
                                            >
                                                {isMovie && <Film className="h-3.5 w-3.5 text-amber-300 shrink-0" />}
                                                {isShow && <Tv className="h-3.5 w-3.5 text-cyan-300 shrink-0" />}
                                                {!isMovie && !isShow && <Layers className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                                                <span>{sec.title}</span>
                                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-sky-700/80 text-sky-100' : 'bg-slate-900 text-slate-400'}`}>
                                                    Key: {sec.key}
                                                </span>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </Card>
            )}

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
                            <Button
                                type="button"
                                size="sm"
                                disabled={applyingOverlays}
                                onClick={handleApplyOverlays}
                                className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs h-8 px-3 gap-1.5 shadow-md cursor-pointer"
                            >
                                {applyingOverlays ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                <span>✨ Apply Overlays to Library</span>
                            </Button>
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
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                    <Eye className="h-4 w-4 text-purple-400" /> Live Poster Simulator
                                </span>
                                <Badge variant="outline" className="text-[10px] border-purple-500/30 text-purple-300 bg-purple-950/30">
                                    Interactive Preview
                                </Badge>
                            </div>

                            {/* Simulated Poster Card */}
                            <div className="relative aspect-[2/3] max-w-[320px] mx-auto rounded-2xl overflow-hidden border-2 border-slate-700/80 shadow-2xl group bg-slate-950">
                                <img 
                                    src={simPosterImage} 
                                    alt="Live Simulator" 
                                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
                                />

                                {/* Top-Right Position */}
                                <div className="absolute top-2.5 right-2.5 flex flex-col items-end gap-1.5 z-20 pointer-events-none">
                                    {simDovetailResolutionHdr && simShowResolution && simShowHdr && simResolutionPosition === "top-right" && (
                                        <div className={`relative px-2 py-0.5 rounded-md border text-[9px] font-black tracking-wider flex items-center gap-1.5 shadow-lg overflow-hidden backdrop-blur-md ${
                                            simTheme === "gold"
                                                ? "bg-gradient-to-r from-amber-950/90 via-slate-950/95 to-slate-950/95 text-white border-amber-400/80"
                                                : "bg-slate-950/95 text-white border-purple-400/80"
                                        }`}>
                                            <div className="absolute top-0 left-1 right-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
                                            <span className="text-amber-300 font-black">4K</span>
                                            <span className="text-[7.5px] opacity-75 font-bold tracking-widest text-amber-200/80">UHD</span>
                                            <div className="h-2.5 w-[1px] bg-white/30 mx-0.5 relative flex items-center justify-center">
                                                <div className="w-1 h-1 rounded-full bg-white/50" />
                                            </div>
                                            <span className="w-1.5 h-2.5 bg-purple-400 rounded-sm inline-block shrink-0" />
                                            <span className="text-[8px] text-purple-200 tracking-widest font-black">DOLBY VISION</span>
                                        </div>
                                    )}

                                    {(!simDovetailResolutionHdr || simResolutionPosition !== simHdrPosition) && simShowResolution && simResolutionPosition === "top-right" && (
                                        <div className={`relative px-2 py-0.5 rounded-md border text-[10px] font-black tracking-wider flex items-center gap-1 shadow-lg overflow-hidden backdrop-blur-md ${
                                            simTheme === "gold" ? 'bg-gradient-to-r from-yellow-300 via-amber-400 to-yellow-500 text-black border-yellow-200' : 'bg-slate-950/90 text-white border-amber-400/80'
                                        }`}>
                                            <span>4K</span>
                                            <span className="text-[8px] opacity-75 border-l border-current pl-1 ml-0.5 tracking-widest text-amber-300">UHD</span>
                                        </div>
                                    )}

                                    {(!simDovetailResolutionHdr || simResolutionPosition !== simHdrPosition) && simShowHdr && simHdrPosition === "top-right" && (
                                        <div className="relative px-2 py-0.5 rounded-md border border-purple-400/80 bg-slate-950/90 text-purple-200 text-[9px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md flex items-center gap-1">
                                            <span className="w-1.5 h-2.5 bg-purple-400 rounded-sm inline-block mr-0.5" />
                                            <span>DOLBY VISION</span>
                                        </div>
                                    )}

                                    {simShowCodec && simCodecPosition === "top-right" && (
                                        <div className="relative px-1.5 py-0.5 rounded-md border border-indigo-400/70 bg-slate-950/90 text-indigo-200 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                                            HEVC • 10b
                                        </div>
                                    )}

                                    {simShowRibbon && simRibbonPosition === "top-right" && (
                                        <div className="flex flex-col items-end gap-1">
                                            {getActiveSimulatorRibbons().map((ribbon, rIdx) => (
                                                <div 
                                                    key={rIdx}
                                                    className={`px-2 py-0.5 rounded text-[8px] font-black tracking-widest shadow-lg border ${
                                                        ribbon.theme === "gold" ? "bg-amber-500 text-slate-950 border-amber-300" :
                                                        ribbon.theme === "crimson" ? "bg-rose-600 text-white border-rose-400" :
                                                        ribbon.theme === "emerald" ? "bg-emerald-600 text-white border-emerald-400" :
                                                        "bg-purple-600 text-white border-purple-400"
                                                    }`}
                                                >
                                                    {ribbon.text}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Top-Left Position */}
                                <div className="absolute top-2.5 left-2.5 flex flex-col items-start gap-1.5 z-20 pointer-events-none">
                                    {simShowAudio && simAudioPosition === "top-left" && (
                                        <div className="relative px-2 py-0.5 rounded-md border border-sky-400/80 bg-slate-950/90 text-sky-200 text-[9px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                                            DOLBY ATMOS
                                        </div>
                                    )}
                                    {simShowChannels && simChannelsPosition === "top-left" && (
                                        <div className="relative px-1.5 py-0.5 rounded-md border border-cyan-400/70 bg-slate-950/90 text-cyan-300 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                                            7.1 SURROUND
                                        </div>
                                    )}
                                </div>

                                {/* Bottom-Left Position */}
                                <div className="absolute bottom-2.5 left-2.5 flex flex-col items-start gap-1.5 z-20 pointer-events-none">
                                    {simShowStudio && simStudioPosition === "bottom-left" && (
                                        <div className="relative px-2 py-0.5 rounded-md border border-purple-500 text-purple-300 bg-slate-950/95 text-[8px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                                            HBO MAX
                                        </div>
                                    )}
                                    {simShowRating && simRatingPosition === "bottom-left" && (
                                        <div className="relative px-1.5 py-0.5 rounded border border-amber-500 text-amber-300 bg-slate-950/90 text-[8px] font-black tracking-wider shadow-lg overflow-hidden backdrop-blur-md">
                                            PG-13
                                        </div>
                                    )}
                                    {simRatings && (
                                        <div className="relative flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-950/95 border border-white/20 shadow-lg text-[10px] overflow-hidden backdrop-blur-md">
                                            <div className="bg-yellow-400 text-black font-black px-1 rounded text-[8.5px] leading-tight">IMDb</div>
                                            <span className="font-bold text-white text-[10px]">8.6</span>
                                            <span className="text-[10px]">🍅</span>
                                            <span className="font-bold text-white text-[10px]">94%</span>
                                        </div>
                                    )}
                                </div>

                                {/* Bottom-Right Position */}
                                <div className="absolute bottom-2.5 right-2.5 flex flex-col items-end gap-1.5 z-20 pointer-events-none">
                                    {simShowEdition && simEditionPosition === "bottom-right" && (
                                        <div className="relative px-2 py-0.5 rounded-md border border-sky-400 bg-slate-950/95 text-sky-300 text-[8px] font-black tracking-widest shadow-lg overflow-hidden backdrop-blur-md">
                                            IMAX ENHANCED
                                        </div>
                                    )}
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

                            {/* Badge Toggles List */}
                            <div className="space-y-2.5 p-3.5 bg-slate-950/40 rounded-xl border border-slate-800">
                                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                    <span className="text-xs font-bold text-white flex items-center gap-1.5">
                                        <Sliders className="h-4 w-4 text-purple-400" /> Comprehensive Poster Badge Toggles
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                                    {/* Resolution */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                        <span className="font-medium text-slate-200">Resolution (4K / 1080p)</span>
                                        <Switch checked={simShowResolution} onCheckedChange={setSimShowResolution} />
                                    </div>

                                    {/* HDR */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                        <span className="font-medium text-slate-200">HDR / Dolby Vision</span>
                                        <Switch checked={simShowHdr} onCheckedChange={setSimShowHdr} />
                                    </div>

                                    {/* Audio Codec */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                        <span className="font-medium text-slate-200">Audio Codec (Dolby Atmos / DTS:X)</span>
                                        <Switch checked={simShowAudio} onCheckedChange={setSimShowAudio} />
                                    </div>

                                    {/* Audio Channels */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                        <span className="font-medium text-slate-200">Surround Channels (7.1 / 5.1)</span>
                                        <Switch checked={simShowChannels} onCheckedChange={setSimShowChannels} />
                                    </div>

                                    {/* Video Codec */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                        <span className="font-medium text-slate-200">Video Codec (HEVC / AV1)</span>
                                        <Switch checked={simShowCodec} onCheckedChange={setSimShowCodec} />
                                    </div>

                                    {/* Edition Cuts */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                        <span className="font-medium text-slate-200">Edition Cuts (IMAX Enhanced)</span>
                                        <Switch checked={simShowEdition} onCheckedChange={setSimShowEdition} />
                                    </div>

                                    {/* Studio Logos */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                        <span className="font-medium text-slate-200">Studio / Network Logos (HBO / Netflix)</span>
                                        <Switch checked={simShowStudio} onCheckedChange={setSimShowStudio} />
                                    </div>

                                    {/* US Age Ratings */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800">
                                        <span className="font-medium text-slate-200">Age Ratings (PG-13 / R / TV-MA)</span>
                                        <Switch checked={simShowRating} onCheckedChange={setSimShowRating} />
                                    </div>

                                    {/* Corner Ribbons */}
                                    <div className="flex items-center justify-between p-2.5 bg-slate-900/80 rounded-xl border border-slate-800 sm:col-span-2">
                                        <div className="space-y-0.5">
                                            <span className="font-medium text-slate-200">Tiered Corner Ribbons (Top 250 / Awards / Fresh)</span>
                                            <p className="text-[10px] text-slate-400">Gloss ribbons with multi-tier stacking</p>
                                        </div>
                                        <Switch checked={simShowRibbon} onCheckedChange={setSimShowRibbon} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </CardContent>
            </Card>

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
        </div>
    );
}

export default KometaStudio;
