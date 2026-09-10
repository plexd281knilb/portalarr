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
    toggleCustomBadgeAction,
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
    runFullCurationSyncAction
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
    FolderHeart, Undo2, HardDrive, PlaySquare, Filter, ShieldAlert, HeartOff,
    Server, Power, Ban, Archive, TestTube, Settings2, FolderCheck,
    Upload, Image as ImageIcon, MoveUp, MoveDown, CalendarClock,
    Palette, ChevronUp, ChevronDown, Tag, Compass, Home, Clock3,
    Search, FileText, Info, Play, CheckCheck
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
    const [simChannels, setSimChannels] = useState<"7.1" | "5.1" | "2.0" | "none">("7.1");
    const [simCodec, setSimCodec] = useState<"HEVC" | "AVC" | "AV1" | "ProRes" | "none">("HEVC");
    const [simEdition, setSimEdition] = useState<"IMAX" | "CRITERION" | "DIRECTOR'S CUT" | "EXTENDED" | "REMUX" | "none">("IMAX");
    const [simStudio, setSimStudio] = useState<"HBO" | "NETFLIX" | "DISNEY+" | "APPLE TV+" | "PRIME" | "MARVEL" | "DC" | "A24" | "PARAMOUNT+" | "none">("HBO");
    const [simRating, setSimRating] = useState<"G" | "PG" | "PG-13" | "R" | "NC-17" | "TV-MA" | "none">("PG-13");
    const [simRatings, setSimRatings] = useState(true);
    const [simLeavingSoon, setSimLeavingSoon] = useState(false);
    const [simTheme, setSimTheme] = useState<"glass" | "gold" | "classic" | "minimal">("glass");
    const [simPosition, setSimPosition] = useState<"top-right" | "top-left" | "bottom-right">("top-right");
    const [simCustomBadgeId, setSimCustomBadgeId] = useState<string>("none");

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

    // Handle Delete Custom Badge
    const handleDeleteCustomBadge = async (badgeId: string) => {
        if (!confirm("Are you sure you want to delete this custom badge?")) return;
        try {
            await deleteCustomBadgeAction(badgeId);
            setCustomBadges(customBadges.filter(b => b.id !== badgeId));
        } catch (e) {
            console.error("Failed deleting badge:", e);
        }
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
                theme: simTheme,
                showResolution: simResolution !== "none",
                showHdr: simHdr !== "none",
                showAudio: simAudio !== "none",
                showAudioChannels: simChannels !== "none",
                showCodec: simCodec !== "none",
                showEdition: simEdition !== "none",
                showStudio: simStudio !== "none",
                showContentRating: simRating !== "none",
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
        try {
            const res = await inspectPlexMediaItemAction(selectedServerId, ratingKey);
            if (res.success) {
                setInspectingItem(res);
            } else {
                alert(res.error || "Inspection failed.");
            }
        } catch (err: any) {
            alert(err.message || "Error inspecting media item.");
        } finally {
            setLoadingInspection(false);
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
                    theme: simTheme,
                    showResolution: simResolution !== "none",
                    showHdr: simHdr !== "none",
                    showAudio: simAudio !== "none",
                    showAudioChannels: simChannels !== "none",
                    showCodec: simCodec !== "none",
                    showEdition: simEdition !== "none",
                    showStudio: simStudio !== "none",
                    showContentRating: simRating !== "none",
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

    // Handle Save Server Targets Matrix
    const handleSaveServerTargets = async () => {
        setSavingServerTargets(true);
        setServerTargetsSavedMsg(false);
        try {
            await saveCurationSettingsAction({
                enabledServersForOverlays: settings.enabledServersForOverlays || [],
                enabledServersForCollections: settings.enabledServersForCollections || [],
                enabledServersForPruning: settings.enabledServersForPruning || []
            });
            setServerTargetsSavedMsg(true);
            setTimeout(() => setServerTargetsSavedMsg(false), 3000);
        } catch (e) {
            console.error("Failed saving server targets:", e);
        } finally {
            setSavingServerTargets(false);
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
                            Automatically checks for newly added movies/shows on a timer schedule to apply posters/overlays, evaluates seasonal collection calendars, refreshes digital release stubs, and checks Leaving Soon disk space triggers.
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

            {/* Server Target Matrix & Vanilla Protection Guard */}
            {servers.length > 0 && (
                <Card className="bg-slate-900/60 border-slate-800/80 shadow-md">
                    <CardContent className="p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs">
                        <div className="space-y-1 max-w-xl">
                            <div className="flex items-center gap-2">
                                <Server className="h-4 w-4 text-indigo-400" />
                                <span className="font-bold text-white text-sm">Server Targeting & Vanilla Guard</span>
                                <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-950/30 text-[10px] font-semibold">
                                    Protection Active
                                </Badge>
                            </div>
                            <p className="text-[11px] text-slate-400">
                                Select which Plex servers receive Collections, Overlays, and Capacity Pruning. Unchecked servers (e.g. your Backup server) stay 100% vanilla and unmodified.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                            {servers.map(srv => {
                                const isOverlayEnabled = (settings.enabledServersForOverlays || []).includes(srv.serverId);
                                const isCollEnabled = (settings.enabledServersForCollections || []).includes(srv.serverId);
                                const isPruneEnabled = (settings.enabledServersForPruning || []).includes(srv.serverId);

                                return (
                                    <div key={srv.serverId} className="p-2.5 bg-slate-800/80 border border-slate-700/60 rounded-xl space-y-1.5 min-w-[170px] flex-1 sm:flex-initial">
                                        <div className="flex items-center justify-between font-bold text-slate-200 text-xs">
                                            <span className="truncate">{srv.serverName || "Server"}</span>
                                            {srv.serverId === selectedServerId && <Badge className="text-[9px] bg-purple-600/80 px-1.5 py-0">Selected</Badge>}
                                        </div>
                                        <div className="space-y-1 text-[11px] text-slate-300">
                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={isOverlayEnabled}
                                                    onChange={e => {
                                                        const curr = settings.enabledServersForOverlays || [];
                                                        const updated = e.target.checked 
                                                            ? [...curr, srv.serverId]
                                                            : curr.filter((id: string) => id !== srv.serverId);
                                                        setSettings({ ...settings, enabledServersForOverlays: updated });
                                                    }}
                                                    className="rounded border-slate-700 text-purple-600 focus:ring-0"
                                                />
                                                <span>🎨 Overlays</span>
                                            </label>
                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={isCollEnabled}
                                                    onChange={e => {
                                                        const curr = settings.enabledServersForCollections || [];
                                                        const updated = e.target.checked 
                                                            ? [...curr, srv.serverId]
                                                            : curr.filter((id: string) => id !== srv.serverId);
                                                        setSettings({ ...settings, enabledServersForCollections: updated });
                                                    }}
                                                    className="rounded border-slate-700 text-purple-600 focus:ring-0"
                                                />
                                                <span>📚 Collections</span>
                                            </label>
                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                <input 
                                                    type="checkbox"
                                                    checked={isPruneEnabled}
                                                    onChange={e => {
                                                        const curr = settings.enabledServersForPruning || [];
                                                        const updated = e.target.checked 
                                                            ? [...curr, srv.serverId]
                                                            : curr.filter((id: string) => id !== srv.serverId);
                                                        setSettings({ ...settings, enabledServersForPruning: updated });
                                                    }}
                                                    className="rounded border-slate-700 text-purple-600 focus:ring-0"
                                                />
                                                <span>🗑️ Pruning</span>
                                            </label>
                                        </div>
                                    </div>
                                );
                            })}

                            <div className="flex flex-col gap-1">
                                <Button 
                                    size="sm" 
                                    onClick={handleSaveServerTargets}
                                    disabled={savingServerTargets}
                                    className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs h-8 px-3"
                                >
                                    {savingServerTargets ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Check className="h-3.5 w-3.5 mr-1" />}
                                    Save Targets
                                </Button>
                                {serverTargetsSavedMsg && (
                                    <span className="text-[10px] text-emerald-400 font-semibold text-center">✓ Saved!</span>
                                )}
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Studio Navigation Tabs */}
            <Tabs value={subTab} onValueChange={setSubTab} className="space-y-6">
                <TabsList className="grid grid-cols-2 sm:grid-cols-6 w-full h-auto p-1.5 bg-slate-900/60 border border-slate-800 rounded-xl gap-1.5 shadow-md">
                    <TabsTrigger value="collections" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <Trophy className="h-4 w-4 text-amber-400" />
                        <span>Curated Collections</span>
                    </TabsTrigger>
                    <TabsTrigger value="overlays" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <Layers className="h-4 w-4 text-sky-400" />
                        <span>Poster Overlays & Badges</span>
                    </TabsTrigger>
                    <TabsTrigger value="inspector" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <Search className="h-4 w-4 text-cyan-400" />
                        <span>Media Inspector & Simulator</span>
                    </TabsTrigger>
                    <TabsTrigger value="releases" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <Calendar className="h-4 w-4 text-emerald-400" />
                        <span>Digital Releases & Timings</span>
                    </TabsTrigger>
                    <TabsTrigger value="pruning" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <AlertTriangle className="h-4 w-4 text-rose-400" />
                        <span>Leaving Soon & Hub</span>
                    </TabsTrigger>
                    <TabsTrigger value="preferences" className="py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white">
                        <Filter className="h-4 w-4 text-indigo-400" />
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
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-white text-sm">{coll.title}</span>
                                                        <Badge variant="outline" className="text-[9px] uppercase px-1.5 py-0 border-slate-700 text-slate-300">
                                                            {coll.category}
                                                        </Badge>
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
                                                <Badge variant="secondary" className="text-[10px] font-semibold bg-slate-800 text-slate-300">
                                                    {preset.sourceType.toUpperCase()}
                                                </Badge>
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

                                {/* Top Left Badges (Edition, Studio, Rating) */}
                                <div className={`absolute ${simLeavingSoon ? 'top-8' : 'top-2.5'} left-2.5 flex flex-col gap-1.5 items-start z-10`}>
                                    {/* Edition Badge */}
                                    {simEdition !== "none" && (
                                        <div className="px-2 py-0.5 rounded-md border border-amber-400/80 bg-slate-950/95 text-amber-300 text-[8px] font-black tracking-widest shadow-md">
                                            {simEdition}
                                        </div>
                                    )}

                                    {/* Studio Logo Badge */}
                                    {simStudio !== "none" && (
                                        <div className="px-2 py-0.5 rounded-md border border-indigo-400/80 bg-slate-950/95 text-indigo-200 text-[8px] font-black tracking-widest shadow-md">
                                            {simStudio}
                                        </div>
                                    )}

                                    {/* Content Rating Badge */}
                                    {simRating !== "none" && (
                                        <div className="px-1.5 py-0.5 rounded border border-slate-400 bg-slate-950/90 text-slate-200 text-[8px] font-black tracking-wider">
                                            {simRating}
                                        </div>
                                    )}
                                </div>

                                {/* Top Right Badges (4K, HDR, Audio, Channels, Codec) */}
                                <div className={`absolute ${simLeavingSoon ? 'top-8' : 'top-2.5'} right-2.5 flex flex-col gap-1.5 items-end z-10`}>
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
                                            {simHdr === "DV" ? "DOLBY VISION" : simHdr}
                                        </div>
                                    )}

                                    {/* Audio Badge */}
                                    {simAudio !== "none" && (
                                        <div className="px-2 py-0.5 rounded-md border border-sky-400/80 bg-slate-950/90 text-sky-200 text-[9px] font-black tracking-widest shadow-md">
                                            {simAudio === "ATMOS" ? "DOLBY ATMOS" : simAudio}
                                        </div>
                                    )}

                                    {/* Audio Channels Badge */}
                                    {simChannels !== "none" && (
                                        <div className="px-1.5 py-0.5 rounded-md border border-cyan-400/70 bg-slate-950/90 text-cyan-300 text-[8px] font-black tracking-wider shadow-md">
                                            {simChannels} SURROUND
                                        </div>
                                    )}

                                    {/* Video Codec Badge */}
                                    {simCodec !== "none" && (
                                        <div className="px-1.5 py-0.5 rounded-md border border-emerald-400/70 bg-slate-950/90 text-emerald-300 text-[8px] font-black tracking-wider shadow-md">
                                            {simCodec}
                                        </div>
                                    )}

                                    {/* Selected Custom Badge Preview */}
                                    {simCustomBadgeId !== "none" && (
                                        <div className="px-2 py-1 rounded bg-purple-950/90 border border-purple-400 text-[9px] font-bold text-purple-200 shadow-lg">
                                            ✨ {customBadges.find(b => b.id === simCustomBadgeId)?.name || "Custom Badge"}
                                        </div>
                                    )}
                                </div>

                                {/* Simulated Ratings Badge */}
                                {simRatings && (
                                    <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-950/90 border border-slate-600/80 shadow-lg text-[10px] z-10">
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
                                        <Sliders className="h-4 w-4 text-purple-400" /> Comprehensive Poster Badge Layers
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Select and customize format, audio channels, video codecs, edition cuts, and studio badges.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="p-4 space-y-4 text-xs">
                                    {/* Grid of Toggle Switches */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">4K UHD Resolution</Label>
                                                <p className="text-[10px] text-slate-400">Auto-detects 2160p stream</p>
                                            </div>
                                            <Switch 
                                                checked={simResolution !== "none"} 
                                                onCheckedChange={checked => setSimResolution(checked ? "4K" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Dolby Vision & HDR</Label>
                                                <p className="text-[10px] text-slate-400">Auto-detects dynamic color</p>
                                            </div>
                                            <Switch 
                                                checked={simHdr !== "none"} 
                                                onCheckedChange={checked => setSimHdr(checked ? "DV" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Dolby Atmos & Spatial</Label>
                                                <p className="text-[10px] text-slate-400">Auto-detects 3D audio</p>
                                            </div>
                                            <Switch 
                                                checked={simAudio !== "none"} 
                                                onCheckedChange={checked => setSimAudio(checked ? "ATMOS" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Audio Channels (7.1 / 5.1)</Label>
                                                <p className="text-[10px] text-slate-400">Surround channel layout</p>
                                            </div>
                                            <Switch 
                                                checked={simChannels !== "none"} 
                                                onCheckedChange={checked => setSimChannels(checked ? "7.1" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Video Codec (HEVC/AV1)</Label>
                                                <p className="text-[10px] text-slate-400">H.265 / AV1 / ProRes</p>
                                            </div>
                                            <Switch 
                                                checked={simCodec !== "none"} 
                                                onCheckedChange={checked => setSimCodec(checked ? "HEVC" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Edition Cut (IMAX / Criterion)</Label>
                                                <p className="text-[10px] text-slate-400">Director&apos;s Cut / Extended</p>
                                            </div>
                                            <Switch 
                                                checked={simEdition !== "none"} 
                                                onCheckedChange={checked => setSimEdition(checked ? "IMAX" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Studio Logos (HBO/Disney+)</Label>
                                                <p className="text-[10px] text-slate-400">Network & production logos</p>
                                            </div>
                                            <Switch 
                                                checked={simStudio !== "none"} 
                                                onCheckedChange={checked => setSimStudio(checked ? "HBO" : "none")} 
                                            />
                                        </div>

                                        <div className="flex items-center justify-between p-2.5 bg-slate-800/60 rounded-lg border border-slate-700/60">
                                            <div className="space-y-0.5">
                                                <Label className="font-semibold text-white">Content Rating (PG-13 / R)</Label>
                                                <p className="text-[10px] text-slate-400">Age advisory badge</p>
                                            </div>
                                            <Switch 
                                                checked={simRating !== "none"} 
                                                onCheckedChange={checked => setSimRating(checked ? "PG-13" : "none")} 
                                            />
                                        </div>
                                    </div>

                                    {/* Positioning & Style Selectors */}
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
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
                                                    <SelectItem value="bottom-left">Bottom Left Corner</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1 col-span-2 sm:col-span-1">
                                            <Label className="text-slate-300">Simulator Custom Badge</Label>
                                            <Select value={simCustomBadgeId} onValueChange={setSimCustomBadgeId}>
                                                <SelectTrigger className="bg-slate-800 border-slate-700 text-xs">
                                                    <SelectValue placeholder="None" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="none">None</SelectItem>
                                                    {customBadges.map(b => (
                                                        <SelectItem key={b.id} value={b.id}>
                                                            {b.name}
                                                        </SelectItem>
                                                    ))}
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

                            {customBadges.length === 0 ? (
                                <div className="text-center py-10 text-slate-500 text-xs space-y-2">
                                    <Palette className="h-8 w-8 mx-auto text-slate-600" />
                                    <p>No custom badges uploaded yet. Click &quot;Upload Custom Badge&quot; above to add your own overlays!</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                    {customBadges.map(badge => (
                                        <div 
                                            key={badge.id}
                                            className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl flex flex-col justify-between space-y-3 group hover:border-purple-500/40 transition-all"
                                        >
                                            <div className="space-y-2">
                                                {/* Header Pill */}
                                                <div className="flex items-center justify-between">
                                                    <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-slate-700 text-purple-300">
                                                        {badge.category}
                                                    </Badge>
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
                                                <div>
                                                    <h4 className="font-bold text-white text-xs truncate">{badge.name}</h4>
                                                    <p className="text-[10px] text-slate-400">
                                                        Pos: {badge.position} • {badge.width}x{badge.height}px
                                                    </p>
                                                    {badge.matchRule && (
                                                        <p className="text-[10px] text-purple-400 font-mono truncate mt-0.5">
                                                            Match: {badge.matchRule}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action Bar */}
                                            <div className="flex items-center justify-between pt-1 border-t border-slate-800/60 text-xs">
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
                                    ))}
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

                                                {/* Detected Top-Left Badges (Edition, Studio, Rating) */}
                                                <div className="absolute top-2.5 left-2.5 flex flex-col gap-1.5 items-start z-10">
                                                    {inspectingItem.item.detectedBadges?.edition && (
                                                        <div className="px-2 py-0.5 rounded-md border border-amber-400/80 bg-slate-950/95 text-amber-300 text-[8px] font-black tracking-widest shadow-md">
                                                            {inspectingItem.item.detectedBadges.edition}
                                                        </div>
                                                    )}
                                                    {inspectingItem.item.detectedBadges?.studio && (
                                                        <div className="px-2 py-0.5 rounded-md border border-indigo-400/80 bg-slate-950/95 text-indigo-200 text-[8px] font-black tracking-widest shadow-md">
                                                            {inspectingItem.item.detectedBadges.studio}
                                                        </div>
                                                    )}
                                                    {inspectingItem.item.detectedBadges?.contentRating && (
                                                        <div className="px-1.5 py-0.5 rounded border border-slate-400 bg-slate-950/90 text-slate-200 text-[8px] font-black tracking-wider">
                                                            {inspectingItem.item.detectedBadges.contentRating}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Detected Top-Right Badges (Resolution, HDR, Audio, Channels, Codec) */}
                                                <div className="absolute top-2.5 right-2.5 flex flex-col gap-1.5 items-end z-10">
                                                    {inspectingItem.item.detectedBadges?.resolution && (
                                                        <div className="px-2 py-0.5 rounded-md border border-amber-400/80 bg-slate-950/90 text-white text-[10px] font-black tracking-wider flex items-center gap-1 shadow-md">
                                                            <span>{inspectingItem.item.detectedBadges.resolution}</span>
                                                            <span className="text-[8px] opacity-70 border-l border-current pl-1 ml-0.5">UHD</span>
                                                        </div>
                                                    )}
                                                    {inspectingItem.item.detectedBadges?.hdr && (
                                                        <div className="px-2 py-0.5 rounded-md border border-purple-400/80 bg-slate-950/90 text-purple-200 text-[9px] font-black tracking-widest shadow-md">
                                                            {inspectingItem.item.detectedBadges.hdr === "DV" ? "DOLBY VISION" : inspectingItem.item.detectedBadges.hdr}
                                                        </div>
                                                    )}
                                                    {inspectingItem.item.detectedBadges?.audio && (
                                                        <div className="px-2 py-0.5 rounded-md border border-sky-400/80 bg-slate-950/90 text-sky-200 text-[9px] font-black tracking-widest shadow-md">
                                                            {inspectingItem.item.detectedBadges.audio}
                                                        </div>
                                                    )}
                                                    {inspectingItem.item.detectedBadges?.audioChannels && (
                                                        <div className="px-1.5 py-0.5 rounded-md border border-cyan-400/70 bg-slate-950/90 text-cyan-300 text-[8px] font-black tracking-wider shadow-md">
                                                            {inspectingItem.item.detectedBadges.audioChannels}
                                                        </div>
                                                    )}
                                                    {inspectingItem.item.detectedBadges?.codec && (
                                                        <div className="px-1.5 py-0.5 rounded-md border border-emerald-400/70 bg-slate-950/90 text-emerald-300 text-[8px] font-black tracking-wider shadow-md">
                                                            {inspectingItem.item.detectedBadges.codec}
                                                        </div>
                                                    )}
                                                </div>
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
                                                        <Badge className="text-[9px] bg-purple-600/80 px-1.5 py-0">Active</Badge>
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
                                                        <Badge className="text-[9px] bg-purple-600/80 px-1.5 py-0">Active</Badge>
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
                                <Button variant="outline" size="sm" onClick={() => setSeasonalModalOpen(false)}>Cancel</Button>
                                <Button size="sm" onClick={handleSaveSeasonalSchedule} className="bg-amber-600 hover:bg-amber-500 text-white">Save Schedule</Button>
                            </DialogFooter>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
