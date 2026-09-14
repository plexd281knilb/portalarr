"use client";

import React, { useState, useEffect } from "react";
import {
    Trash2,
    HardDrive,
    AlertTriangle,
    Shield,
    ShieldAlert,
    Clock,
    Clock3,
    Calendar,
    Zap,
    Play,
    Check,
    X,
    FolderOpen,
    Loader2,
    CheckCircle2,
    XCircle,
    RotateCcw,
    Film,
    Tv,
    Layers,
    Save,
    RefreshCw,
    Sliders,
    Search,
    ChevronUp,
    ChevronDown,
    Filter,
    FolderCheck,
    Archive,
    Power,
    Flame,
    ImageIcon,
    Sparkles,
    Eye,
    Tag
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { CurationNavHeader } from "./curation-nav-header";
import { PlexPosterPickerModal } from "./plex-poster-picker-modal";
import { PlexMediaStreamInfo } from "@/lib/curation/plex-analyzer";
import {
    getPlexServersAndSectionsAction,
    getPlexServerSectionsAction,
    getCurationSettingsAction,
    saveCurationSettingsAction,
    toggleCurationLibrarySectionAction,
    runFullCurationSyncAction,
    getLeavingSoonItemsAction,
    markItemLeavingSoonAction,
    unmarkItemLeavingSoonAction,
    clearAllLeavingSoonFlagsAction,
    syncLeavingSoonCollectionHubAction,
    runPruneSimulationAction,
    executePruneAction,
    saveServerStorageConfigAction,
    validateDirectoryPathAction,
    getArtBackupAndBadgeStatsAction,
    getPlaceholderPreviewDataUrlAction
} from "@/app/curation-actions";

export const PRUNE_BANNER_PRESETS = [
    { id: "leaving_date", label: "⚠️ Leaving on {date}", defaultText: "LEAVING ON {date}", theme: "crimson-red", pos: "bottom" as const },
    { id: "leaving_days", label: "⏳ Leaving in {days} Days", defaultText: "LEAVING IN {days} DAYS", theme: "crimson-red", pos: "bottom" as const },
    { id: "leaving_soon", label: "⚠️ Leaving Soon (Plex Collection)", defaultText: "LEAVING SOON", theme: "crimson-red", pos: "corner" as const },
    { id: "auto_prune", label: "⏳ Auto-Pruning on {date}", defaultText: "AUTO-PRUNE ON {date}", theme: "amber-gold", pos: "bottom" as const },
    { id: "storage_cleanup", label: "📦 Storage Reclaim: {reason}", defaultText: "STORAGE CLEANUP: {reason}", theme: "indigo-purple", pos: "bottom" as const },
    { id: "unwatched_warning", label: "👀 Unwatched Grace Period ({days} Days)", defaultText: "UNWATCHED • {days} DAYS LEFT", theme: "amber-gold", pos: "bottom" as const },
    { id: "custom", label: "⚙️ Custom Template", defaultText: "{title} • {status}", theme: "cyber-neon", pos: "bottom" as const }
];

interface PlexServerItem {
    serverId: string;
    serverName: string;
    sections: Array<{ key: string | number; title: string; type: string }>;
}

export function PruneStudio() {
    const [subTab, setSubTab] = useState<"leaving_soon" | "simulation" | "execution" | "storage">("leaving_soon");
    const [loading, setLoading] = useState(true);

    // Server & Section Navigation
    const [servers, setServers] = useState<PlexServerItem[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>("");
    const [selectedSectionKey, setSelectedSectionKey] = useState<string>("");
    const [serverSectionsLoading, setServerSectionsLoading] = useState(false);

    // Global Settings
    const [settings, setSettings] = useState<any>({});
    const [savingSettings, setSavingSettings] = useState(false);
    const [settingsSavedMsg, setSettingsSavedMsg] = useState(false);

    // Automated Schedule & Enabled Library States
    const [curationSyncPruning, setCurationSyncPruning] = useState<boolean>(true);
    const [curationSyncSchedule, setCurationSyncSchedule] = useState<string>("daily_5am");
    const [pruneDryRun, setPruneDryRun] = useState<boolean>(true);
    const [enableAutoPruneDeletion, setEnableAutoPruneDeletion] = useState<boolean>(false);
    const [curationLastRunAt, setCurationLastRunAt] = useState<string | null>(null);
    const [curationLastRunStatus, setCurationLastRunStatus] = useState<any | null>(null);
    const [enabledServersForPruning, setEnabledServersForPruning] = useState<string[]>([]);
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
    const [runningPruneSync, setRunningPruneSync] = useState(false);
    const [pruneSyncResult, setPruneSyncResult] = useState<{ success: boolean; text: string; details?: string[] } | null>(null);

    // Check if a section is enabled for pruning
    const isSectionEnabled = (srvId: string, secKey: string): boolean => {
        if (!enabledServersForPruning || enabledServersForPruning.length === 0) return true;
        const compoundKey = `${srvId}:${secKey}`;
        if (enabledServersForPruning.includes(compoundKey)) return true;
        const hasCompoundForServer = enabledServersForPruning.some(k => k.startsWith(`${srvId}:`));
        if (!hasCompoundForServer && enabledServersForPruning.includes(srvId)) return true;
        return false;
    };

    // Toggle a section enabled/disabled for pruning
    const handleToggleSection = async (secKey: string) => {
        const currentlyEnabled = isSectionEnabled(selectedServerId, secKey);
        const nextEnabled = !currentlyEnabled;
        const currentSections = servers.find(s => s.serverId === selectedServerId)?.sections || [];
        const allSecKeys = currentSections.map(s => String(s.key));

        // Optimistic UI update
        const compoundKey = `${selectedServerId}:${secKey}`;
        let nextList = [...enabledServersForPruning];
        if (nextList.length === 0 && !nextEnabled) {
            nextList = allSecKeys.filter(k => k !== secKey).map(k => `${selectedServerId}:${k}`);
        } else if (nextEnabled) {
            if (!nextList.includes(compoundKey)) nextList.push(compoundKey);
        } else {
            nextList = nextList.filter(k => k !== compoundKey && k !== selectedServerId);
        }
        setEnabledServersForPruning(nextList);

        try {
            const res = await toggleCurationLibrarySectionAction("prune", selectedServerId, secKey, nextEnabled, allSecKeys);
            if (res.success && res.enabledList) {
                setEnabledServersForPruning(res.enabledList);
            }
        } catch (e) {
            console.error("Failed toggling section prune state:", e);
        }
    };

    // Save schedule settings
    const handleSaveSchedule = async () => {
        setSavingSchedule(true);
        setScheduleSavedMsg(false);
        try {
            const res = await saveCurationSettingsAction({
                curationSyncPruning,
                curationSyncSchedule,
                pruneDryRun,
                enableAutoPruneDeletion
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

    // Run prune evaluation job now
    const handleRunPruneSync = async () => {
        setRunningPruneSync(true);
        setPruneSyncResult(null);
        try {
            const res = await syncLeavingSoonCollectionHubAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setPruneSyncResult({
                    success: true,
                    text: res.message || "Prune evaluation and Leaving Soon hub sync completed."
                });
                loadLeavingSoonItems();
            } else {
                setPruneSyncResult({
                    success: false,
                    text: res.error || "Failed running prune evaluation."
                });
            }
        } catch (e: any) {
            setPruneSyncResult({
                success: false,
                text: e.message || "An error occurred during prune sync."
            });
        } finally {
            setRunningPruneSync(false);
        }
    };

    // Server / Section Switch
    const handleSelectServer = async (srvId: string) => {
        setSelectedServerId(srvId);
        loadLeavingSoonItems(srvId);
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
        } else {
            setSelectedSectionKey("");
        }
    };

    const handleSelectSection = (secKey: string) => {
        setSelectedSectionKey(secKey);
    };

    // Leaving Soon Hub States
    const [leavingSoonItems, setLeavingSoonItems] = useState<any[]>([]);
    const [leavingSoonLoading, setLeavingSoonLoading] = useState(false);
    const [syncingLeavingSoonHub, setSyncingLeavingSoonHub] = useState(false);
    const [leavingSoonHubMsg, setLeavingSoonHubMsg] = useState<{ success: boolean; text: string } | null>(null);
    const [clearingFlags, setClearingFlags] = useState(false);
    const [clearFlagsMsg, setClearFlagsMsg] = useState<string | null>(null);

    // Manual Leaving Soon Modal
    const [manualFlagModalOpen, setManualFlagModalOpen] = useState(false);
    const [manualRatingKey, setManualRatingKey] = useState("");
    const [manualTitle, setManualTitle] = useState("");
    const [manualDaysRemaining, setManualDaysRemaining] = useState(14);
    const [manualReason, setManualReason] = useState("Storage capacity threshold optimization");
    const [flaggingItem, setFlaggingItem] = useState(false);

    // Simulation States
    const [simMinAgeDays, setSimMinAgeDays] = useState(90);
    const [simUnwatchedOnly, setSimUnwatchedOnly] = useState(true);
    const [simMaxCandidates, setSimMaxCandidates] = useState(50);
    const [simulatingPrune, setSimulatingPrune] = useState(false);
    const [pruneSimResults, setPruneSimResults] = useState<{
        candidates: any[];
        totalRecoverableGb: number;
        evaluatedCount: number;
        serversEvaluated: any[];
    } | null>(null);

    // Execution States
    const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<string[]>([]);
    const [executingPrune, setExecutingPrune] = useState(false);
    const [pruneExecMessage, setPruneExecMessage] = useState<{ success: boolean; text: string; details?: any[] } | null>(null);

    // Storage Mount Config & Stats
    const [serverStorageConfig, setServerStorageConfig] = useState<Record<string, string>>({});
    const [savingStorageConfig, setSavingStorageConfig] = useState(false);
    const [storageConfigSavedMsg, setStorageConfigSavedMsg] = useState(false);
    const [pathCheckResults, setPathCheckResults] = useState<Record<string, { checking: boolean; success?: boolean; msg?: string }>>({});
    const [vaultStats, setVaultStats] = useState<{ backupCount: number; backupBytes: number; badgeCount: number; badgeBytes: number; backupDir: string; badgeDir: string } | null>(null);

    // Live Leaving Soon Banner Simulator States
    const [posterPickerModalOpen, setPosterPickerModalOpen] = useState(false);
    const [simSelectedRealItem, setSimSelectedRealItem] = useState<PlexMediaStreamInfo | null>(null);
    const [simPosterUrl, setSimPosterUrl] = useState<string>("https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80");
    const [simBannerType, setSimBannerType] = useState<string>("leaving_date");
    const [simBannerText, setSimBannerText] = useState<string>("LEAVING ON {date}");
    const [simBannerTheme, setSimBannerTheme] = useState<string>("crimson-red");
    const [simBannerPosition, setSimBannerPosition] = useState<"bottom" | "top" | "corner">("bottom");
    const [simTemplateDate, setSimTemplateDate] = useState<string>("10/31/2026");
    const [simTemplateDays, setSimTemplateDays] = useState<number>(14);
    const [simTemplateReason, setSimTemplateReason] = useState<string>("Unwatched for 180+ Days");
    const [simTemplateStatus, setSimTemplateStatus] = useState<string>("Leaving Soon");
    const [simPreviewDataUrl, setSimPreviewDataUrl] = useState<string | null>(null);

    const generatePrunePreview = async (
        posterUrl: string | null,
        title: string,
        type = simBannerType,
        text = simBannerText,
        theme = simBannerTheme,
        position = simBannerPosition,
        date = simTemplateDate,
        days = simTemplateDays,
        reason = simTemplateReason,
        status = simTemplateStatus
    ) => {
        try {
            const res = await getPlaceholderPreviewDataUrlAction(posterUrl, title, {
                bannerType: type,
                bannerText: text,
                bannerTheme: theme,
                bannerPosition: position,
                date,
                formattedDate: date,
                daysRemaining: days,
                reason,
                status
            });
            if (res.success && res.dataUrl) {
                setSimPreviewDataUrl(res.dataUrl);
            }
        } catch (e) {
            console.error("Failed generating prune preview:", e);
        }
    };

    const handleSelectRealPoster = (item: PlexMediaStreamInfo, posterUrl: string) => {
        setSimSelectedRealItem(item);
        setSimPosterUrl(posterUrl);
        generatePrunePreview(
            posterUrl,
            item.title,
            simBannerType,
            simBannerText,
            simBannerTheme,
            simBannerPosition,
            simTemplateDate,
            simTemplateDays,
            simTemplateReason,
            simTemplateStatus
        );
    };

    const handleInsertToken = (token: string) => {
        const next = simBannerText ? `${simBannerText} ${token}` : token;
        setSimBannerText(next);
        generatePrunePreview(
            simSelectedRealItem ? simPosterUrl : null,
            simSelectedRealItem?.title || "Sample Media",
            simBannerType,
            next,
            simBannerTheme,
            simBannerPosition,
            simTemplateDate,
            simTemplateDays,
            simTemplateReason,
            simTemplateStatus
        );
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
                    }
                }

                const settingsRes = await getCurationSettingsAction();
                if (settingsRes.success) {
                    setSettings(settingsRes);
                    if (settingsRes.serverStorageConfig) setServerStorageConfig(settingsRes.serverStorageConfig);
                    setCurationSyncPruning(settingsRes.curationSyncPruning ?? true);
                    setCurationSyncSchedule(settingsRes.curationSyncSchedule || "daily_5am");
                    setPruneDryRun(settingsRes.pruneDryRun ?? true);
                    setEnableAutoPruneDeletion(settingsRes.enableAutoPruneDeletion ?? false);
                    setCurationLastRunAt(settingsRes.curationLastRunAt || null);
                    setCurationLastRunStatus(settingsRes.curationLastRunStatus || null);
                    if (settingsRes.enabledServersForPruning) {
                        setEnabledServersForPruning(settingsRes.enabledServersForPruning);
                    }
                }

                const vaultRes = await getArtBackupAndBadgeStatsAction();
                if (vaultRes.success) {
                    setVaultStats(vaultRes as any);
                }

                await loadLeavingSoonItems();
            } catch (err) {
                console.error("Failed loading Maintainerr Prune studio data:", err);
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, []);

    const loadLeavingSoonItems = async (srvId = selectedServerId) => {
        setLeavingSoonLoading(true);
        try {
            const res = await getLeavingSoonItemsAction(srvId || undefined);
            if (res.success && res.items) {
                setLeavingSoonItems(res.items);
            }
        } catch (e) {
            console.error("Failed loading leaving soon items:", e);
        } finally {
            setLeavingSoonLoading(false);
        }
    };

    // Sync Leaving Soon Collection Hub
    const handleSyncLeavingSoonHub = async () => {
        setSyncingLeavingSoonHub(true);
        setLeavingSoonHubMsg(null);
        try {
            const res = await syncLeavingSoonCollectionHubAction(selectedServerId);
            if (res.success) {
                setLeavingSoonHubMsg({ success: true, text: res.message || "Synced Leaving Soon hub to Plex!" });
                loadLeavingSoonItems();
                setTimeout(() => setLeavingSoonHubMsg(null), 4000);
            } else {
                setLeavingSoonHubMsg({ success: false, text: res.error || "Failed syncing Leaving Soon hub." });
            }
        } catch (e: any) {
            setLeavingSoonHubMsg({ success: false, text: e.message || "Failed syncing hub." });
        } finally {
            setSyncingLeavingSoonHub(false);
        }
    };

    // Clear All Flags
    const handleClearAllFlags = async () => {
        if (!confirm("Are you sure you want to remove ALL Leaving Soon flags and restore original artwork?")) return;
        setClearingFlags(true);
        setClearFlagsMsg(null);
        try {
            const res = await clearAllLeavingSoonFlagsAction(selectedServerId);
            if (res.success) {
                setClearFlagsMsg(res.message || "Cleared all flags!");
                loadLeavingSoonItems();
                setTimeout(() => setClearFlagsMsg(null), 4000);
            }
        } catch (e: any) {
            console.error("Failed clearing flags:", e);
        } finally {
            setClearingFlags(false);
        }
    };

    // Run Prune Simulation Sandbox
    const handleRunSimulation = async () => {
        setSimulatingPrune(true);
        setPruneSimResults(null);
        setSelectedCandidateKeys([]);
        try {
            const res = await runPruneSimulationAction(selectedServerId, {
                minAgeDays: simMinAgeDays,
                unwatchedOnly: simUnwatchedOnly,
                maxCandidates: simMaxCandidates
            });

            if (res.success) {
                setPruneSimResults(res as any);
                if (res.candidates && res.candidates.length > 0) {
                    setSelectedCandidateKeys(res.candidates.map((c: any) => c.ratingKey));
                }
            }
        } catch (e) {
            console.error("Simulation failed:", e);
        } finally {
            setSimulatingPrune(false);
        }
    };

    // Execute Safe Prune / Stage Action
    const handleExecutePrune = async (forceLiveDelete = false) => {
        if (!pruneSimResults || selectedCandidateKeys.length === 0) return;

        const targetItems = pruneSimResults.candidates
            .filter(c => selectedCandidateKeys.includes(c.ratingKey))
            .map(c => ({
                ratingKey: c.ratingKey,
                serverId: c.serverId || selectedServerId,
                sectionKey: c.sectionKey,
                title: c.title
            }));

        const isMasterEnabled = settings.enableAutoPruneDeletion ?? false;
        if (forceLiveDelete && isMasterEnabled) {
            if (!confirm(`⚠️ PERMANENT DELETION WARNING:\n\nYou are about to PERMANENTLY DELETE ${targetItems.length} media files from disk.\n\nThis cannot be undone. Proceed?`)) {
                return;
            }
        }

        setExecutingPrune(true);
        setPruneExecMessage(null);
        try {
            const res = await executePruneAction(targetItems, {
                forceLiveDelete,
                applyOverlay: true,
                tagCollection: true,
                daysNotice: settings.pruneDaysNotice || 14
            });

            if (res.success) {
                setPruneExecMessage({
                    success: true,
                    text: forceLiveDelete && isMasterEnabled
                        ? `Permanently deleted ${res.processedCount} media files from disk & Plex.`
                        : `Staged ${res.processedCount} items with ${settings.pruneDaysNotice || 14}-day Leaving Soon warning & overlays.`,
                    details: res.results
                });
                loadLeavingSoonItems();
            } else {
                setPruneExecMessage({ success: false, text: res.error || "Failed executing prune pipeline." });
            }
        } catch (e: any) {
            setPruneExecMessage({ success: false, text: e.message || "Failed executing prune." });
        } finally {
            setExecutingPrune(false);
        }
    };

    // Manual Flag Submit
    const handleManualFlag = async () => {
        if (!manualRatingKey.trim() || !manualTitle.trim()) return;
        setFlaggingItem(true);
        try {
            const res = await markItemLeavingSoonAction({
                ratingKey: manualRatingKey.trim(),
                serverId: selectedServerId,
                title: manualTitle.trim(),
                daysRemaining: manualDaysRemaining,
                reason: manualReason
            });

            if (res.success) {
                setManualFlagModalOpen(false);
                setManualRatingKey("");
                setManualTitle("");
                loadLeavingSoonItems();
            }
        } catch (e) {
            console.error("Failed manual flag:", e);
        } finally {
            setFlaggingItem(false);
        }
    };

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-rose-400" />
                <p className="text-sm font-medium">Loading Maintainerr Storage &amp; Prune Studio...</p>
            </div>
        );
    }

    const currentServer = servers.find(s => s.serverId === selectedServerId) || servers[0];
    const currentSections = currentServer?.sections || [];

    return (
        <div className="space-y-6">
            <CurationNavHeader 
                serversCount={servers.length}
                title="Maintainerr Storage & Auto-Prune Studio"
                description="Storage mount thresholds, rule-based media pruning (unwatched, low rating, ended series), pinned 'Leaving Soon' Plex collection, and safe file cleanup."
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
                                <HardDrive className="h-4 w-4 text-rose-400" />
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
                                                    ? 'bg-rose-600 text-white shadow-lg shadow-rose-950/60 border border-rose-400/50 ring-1 ring-rose-400/40 font-black'
                                                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white shadow-sm' : 'bg-emerald-400'}`} />
                                            <span>{s.serverName || "Plex Server"}</span>
                                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isSelected ? 'border-rose-300 text-rose-100 bg-rose-700/60' : 'border-slate-700 text-slate-400'}`}>
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
                                            <button
                                                key={sec.key}
                                                type="button"
                                                onClick={() => handleSelectSection(String(sec.key))}
                                                className={`group flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
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

                                                {/* Interactive On/Off Switch Badge */}
                                                <div
                                                    role="button"
                                                    tabIndex={0}
                                                    title={isSecEnabled ? "Prune evaluation ON for this library (Click to disable)" : "Prune evaluation OFF for this library (Click to enable)"}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleToggleSection(String(sec.key));
                                                    }}
                                                    className={`ml-1 flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold transition-all cursor-pointer ${
                                                        isSecEnabled 
                                                            ? isSelected 
                                                                ? 'bg-emerald-400 text-emerald-950 shadow-sm' 
                                                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                                                            : 'bg-slate-900/80 text-slate-500 border border-slate-700 hover:text-slate-300'
                                                    }`}
                                                >
                                                    <span className={`w-1.5 h-1.5 rounded-full ${isSecEnabled ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                                                    <span>{isSecEnabled ? 'ON' : 'OFF'}</span>
                                                </div>
                                            </button>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>
                </Card>
            )}

            {/* Automated Prune & Leaving Soon Schedule & Automation Card */}
            <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                <CardContent className="p-4 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-xs">
                    <div className="space-y-1 max-w-xl">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Clock className="h-4 w-4 text-rose-400" />
                            <span className="font-bold text-white text-sm">Prune &amp; Leaving Soon Schedule &amp; Automation</span>
                            <Badge variant="outline" className={`text-[10px] font-semibold ${curationSyncPruning ? 'border-rose-500/40 text-rose-300 bg-rose-950/30' : 'border-slate-700 text-slate-400 bg-slate-800/40'}`}>
                                {curationSyncPruning ? `Active (${curationSyncSchedule.replace(/_/g, ' ')})` : 'Paused'}
                            </Badge>
                            {pruneDryRun ? (
                                <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px]">
                                    🛡️ Dry-Run Safe
                                </Badge>
                            ) : (
                                <Badge className="bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[10px]">
                                    ⚠️ Live Deletion Mode
                                </Badge>
                            )}
                        </div>
                        <p className="text-[11px] text-slate-400">
                            Evaluates media pruning rules, tags the '⚠️ Leaving Soon' Plex collection and banner overlays, and cleans up unwatched content across enabled libraries.
                        </p>
                        {curationLastRunAt && (
                            <p className="text-[10px] text-slate-500 flex items-center gap-1">
                                <Clock3 className="h-3 w-3 text-rose-400" />
                                Last automated run: <span className="text-slate-300 font-mono">{new Date(curationLastRunAt).toLocaleString()}</span>
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                        <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
                            <span className="text-[11px] font-bold text-slate-200">Timer</span>
                            <Switch 
                                checked={curationSyncPruning}
                                onCheckedChange={checked => setCurationSyncPruning(checked)}
                            />
                        </div>

                        <div className="flex items-center gap-2 bg-slate-800/90 px-3 py-1.5 rounded-xl border border-slate-700">
                            <span className="text-[11px] font-bold text-slate-200">Dry-Run</span>
                            <Switch 
                                checked={pruneDryRun}
                                onCheckedChange={checked => setPruneDryRun(checked)}
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
                                    <SelectItem value="every_6_hours">🔄 Every 6 Hours</SelectItem>
                                    <SelectItem value="every_12_hours">⏳ Every 12 Hours</SelectItem>
                                    <SelectItem value="daily_5am">🌙 Daily at 5:00 AM</SelectItem>
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
                            onClick={handleRunPruneSync}
                            disabled={runningPruneSync}
                            className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-rose-950/40 cursor-pointer"
                        >
                            {runningPruneSync ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                            <span>Run Prune Evaluation Now</span>
                        </Button>
                    </div>
                </CardContent>

                {pruneSyncResult && (
                    <div className={`p-3 text-xs border-t ${pruneSyncResult.success ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'} flex items-start gap-2`}>
                        {pruneSyncResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                        <div className="space-y-0.5">
                            <span className="font-bold">{pruneSyncResult.text}</span>
                            {pruneSyncResult.details && pruneSyncResult.details.length > 0 && (
                                <p className="text-[11px] opacity-80">{pruneSyncResult.details.join(" • ")}</p>
                            )}
                        </div>
                    </div>
                )}
            </Card>

            {/* Sub-Navigation Tabs */}
            <div className="flex items-center gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md backdrop-blur-md overflow-x-auto">
                <button
                    type="button"
                    onClick={() => setSubTab("leaving_soon")}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "leaving_soon"
                            ? "bg-rose-600 text-white shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <AlertTriangle className="h-4 w-4" />
                    <span>Leaving Soon Hub</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${subTab === "leaving_soon" ? "border-rose-300 text-rose-100 bg-rose-700/60" : "border-slate-700 text-slate-400"}`}>
                        {leavingSoonItems.length}
                    </Badge>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("simulation")}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "simulation"
                            ? "bg-rose-600 text-white shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Play className="h-4 w-4" />
                    <span>Prune Sandbox</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("execution")}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "execution"
                            ? "bg-rose-600 text-white shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Trash2 className="h-4 w-4" />
                    <span>Safe Deletion Engine</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("storage")}
                    className={`flex-1 min-w-[160px] flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "storage"
                            ? "bg-rose-600 text-white shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <HardDrive className="h-4 w-4" />
                    <span>Mounts &amp; Vault</span>
                </button>
            </div>

            {/* TAB 1: LEAVING SOON HUB & GRACE PERIOD */}
            {subTab === "leaving_soon" && (
                <div className="space-y-6">
                    {/* Header Bar */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl">
                        <div className="space-y-0.5">
                            <h2 className="text-sm font-bold text-white flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-rose-400" />
                                <span>Pinned "Leaving Soon" Plex Collection Hub</span>
                            </h2>
                            <p className="text-xs text-slate-400">
                                Give household members a 7-14 day grace period warning before media files are pruned.
                            </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => setManualFlagModalOpen(true)}
                                className="border-slate-700 hover:bg-slate-800 text-slate-200 text-xs h-8 px-3 gap-1.5"
                            >
                                <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                <span>Manual Flag Item</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={clearingFlags}
                                onClick={handleClearAllFlags}
                                className="border-slate-700 hover:bg-slate-800 text-slate-200 text-xs h-8 px-3 gap-1.5"
                            >
                                {clearingFlags ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                                <span>Clear All Flags</span>
                            </Button>
                            <Button
                                type="button"
                                size="sm"
                                disabled={syncingLeavingSoonHub}
                                onClick={handleSyncLeavingSoonHub}
                                className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs h-8 px-3.5 gap-1.5 shadow-md cursor-pointer"
                            >
                                {syncingLeavingSoonHub ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                                <span>Sync Leaving Soon Hub</span>
                            </Button>
                        </div>
                    </div>

                    {leavingSoonHubMsg && (
                        <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 animate-in fade-in-50 ${
                            leavingSoonHubMsg.success ? "bg-emerald-950/80 border-emerald-800 text-emerald-300" : "bg-rose-950/80 border-rose-800 text-rose-300"
                        }`}>
                            {leavingSoonHubMsg.success ? <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" /> : <XCircle className="h-4 w-4 text-rose-400 shrink-0" />}
                            <span>{leavingSoonHubMsg.text}</span>
                        </div>
                    )}

                    {clearFlagsMsg && (
                        <div className="p-3 rounded-xl bg-sky-950/80 border border-sky-800 text-xs text-sky-300 flex items-center gap-2 animate-in fade-in-50">
                            <RotateCcw className="h-4 w-4 text-sky-400 shrink-0" />
                            <span>{clearFlagsMsg}</span>
                        </div>
                    )}

                    {/* Active Items Card */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                        <CardHeader className="p-4 border-b border-slate-800/80">
                            <div className="flex items-center justify-between">
                                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-rose-400" />
                                    <span>Active Staged Media Items ({leavingSoonItems.length})</span>
                                </CardTitle>
                                <span className="text-xs text-slate-400">Scheduled for pruning after grace period</span>
                            </div>
                        </CardHeader>
                        <CardContent className="p-4 space-y-2.5">
                            {leavingSoonItems.length === 0 ? (
                                <div className="text-center py-12 text-slate-500 space-y-2">
                                    <Shield className="h-10 w-10 mx-auto text-emerald-500/50" />
                                    <p className="text-xs font-semibold text-slate-300">All Plex libraries healthy — No media currently marked for removal.</p>
                                    <p className="text-[11px] text-slate-500">Run the Prune Sandbox simulator to identify unwatched or low-rated candidates.</p>
                                </div>
                            ) : (
                                leavingSoonItems.map(item => {
                                    const leaveDate = item.leavingSoonDate ? new Date(item.leavingSoonDate) : null;
                                    const daysRemaining = leaveDate ? Math.max(0, Math.ceil((leaveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;

                                    return (
                                        <div
                                            key={item.id || item.ratingKey}
                                            className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-slate-700 transition-colors"
                                        >
                                            <div className="space-y-0.5">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-white text-xs">{item.title}</span>
                                                    <Badge className="bg-rose-950 text-rose-300 border-rose-500/40 text-[9px] font-mono">
                                                        {daysRemaining} DAYS LEFT
                                                    </Badge>
                                                </div>
                                                <p className="text-[11px] text-slate-400">
                                                    Reason: {item.leavingReason || "Storage threshold optimization"}
                                                </p>
                                            </div>

                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="outline"
                                                onClick={async () => {
                                                    await unmarkItemLeavingSoonAction(item.ratingKey, item.serverId || selectedServerId);
                                                    loadLeavingSoonItems();
                                                }}
                                                className="text-[11px] h-7 px-2.5 border-slate-700 hover:bg-slate-800 text-slate-300 hover:text-white"
                                            >
                                                Cancel Removal
                                            </Button>
                                        </div>
                                    );
                                })
                            )}
                        </CardContent>
                    </Card>

                    {/* Leaving Soon Banner & Poster Live Simulator */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                        <CardHeader className="p-4 border-b border-slate-800/80">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                                <div className="space-y-0.5">
                                    <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                        <Sparkles className="h-4 w-4 text-rose-400" />
                                        <span>Leaving Soon Banner &amp; Poster Live Simulator</span>
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Customize overlay ribbons and banners applied to items in the Leaving Soon collection, test dynamic template variables, or test on real media from your Plex libraries.
                                    </CardDescription>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setPosterPickerModalOpen(true)}
                                    className="h-7 text-[11px] gap-1.5 border-rose-500/40 hover:bg-rose-950/40 text-rose-200 hover:text-rose-100 shrink-0"
                                >
                                    <ImageIcon className="h-3.5 w-3.5 text-rose-400" /> Pull Poster from Plex
                                </Button>
                            </div>

                            {/* Real Item Telemetry Banner if selected */}
                            {simSelectedRealItem && (
                                <div className="mt-3 p-2.5 bg-rose-950/30 border border-rose-800/50 rounded-xl text-xs flex items-center justify-between gap-2">
                                    <div className="space-y-0.5 min-w-0">
                                        <div className="flex items-center gap-1.5">
                                            <span className="font-bold text-white truncate">{simSelectedRealItem.title}</span>
                                            {simSelectedRealItem.year && (
                                                <span className="text-[10px] text-rose-300 font-mono">({simSelectedRealItem.year})</span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-rose-200/80">
                                            {(simSelectedRealItem.detectedBadges?.resolution || simSelectedRealItem.media?.[0]?.videoResolution) && (
                                                <span className="px-1.5 py-0.2 bg-rose-900/40 rounded text-rose-300 font-mono">
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
                                            generatePrunePreview(
                                                "https://images.unsplash.com/photo-1534447677768-be436bb09401?w=600&auto=format&fit=crop&q=80",
                                                "Sample Media",
                                                simBannerType,
                                                simBannerText,
                                                simBannerTheme,
                                                simBannerPosition
                                            );
                                        }}
                                        className="h-6 px-2 text-[10px] text-slate-400 hover:text-white shrink-0"
                                    >
                                        Reset Sample
                                    </Button>
                                </div>
                            )}
                        </CardHeader>

                        <CardContent className="p-5">
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                                {/* Left: Composite Poster Preview */}
                                <div className="lg:col-span-5 flex flex-col items-center space-y-2">
                                    <div className="relative aspect-[2/3] w-full max-w-[220px] rounded-2xl overflow-hidden bg-slate-950 border-2 border-slate-700/80 shadow-2xl">
                                        {simPreviewDataUrl ? (
                                            <img src={simPreviewDataUrl} alt="Leaving Soon Preview" className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="flex items-center justify-center h-full text-slate-500 text-xs gap-1.5">
                                                <Loader2 className="h-4 w-4 animate-spin text-rose-400" />
                                                <span>Rendering banner preview...</span>
                                            </div>
                                        )}
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-mono">Live Composite Preview</span>
                                </div>

                                {/* Right: Banner Controls & Variable Chips */}
                                <div className="lg:col-span-7 space-y-3.5 text-xs">
                                    {/* Template Presets Selector */}
                                    <div className="space-y-1.5">
                                        <Label className="text-[11px] text-slate-300 font-semibold">Banner Style Preset:</Label>
                                        <Select
                                            value={simBannerType}
                                            onValueChange={(val) => {
                                                const found = PRUNE_BANNER_PRESETS.find(p => p.id === val);
                                                setSimBannerType(val);
                                                const nextText = found?.defaultText || "LEAVING ON {date}";
                                                setSimBannerText(nextText);
                                                if (found?.theme) setSimBannerTheme(found.theme);
                                                if (found?.pos) setSimBannerPosition(found.pos);
                                                generatePrunePreview(
                                                    simSelectedRealItem ? simPosterUrl : null,
                                                    simSelectedRealItem?.title || "Sample Media",
                                                    val,
                                                    nextText,
                                                    found?.theme || simBannerTheme,
                                                    found?.pos || simBannerPosition
                                                );
                                            }}
                                        >
                                            <SelectTrigger className="bg-slate-950 border-slate-800 text-xs h-8">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="max-h-64">
                                                {PRUNE_BANNER_PRESETS.map(p => (
                                                    <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Banner Text Template with Variable Insertion Chips */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-[11px] text-slate-300 font-semibold">Banner Text Template:</Label>
                                            <span className="text-[10px] text-rose-400 font-mono">Click chips to insert:</span>
                                        </div>
                                        <Input
                                            value={simBannerText}
                                            onChange={(e) => {
                                                setSimBannerText(e.target.value);
                                                generatePrunePreview(
                                                    simSelectedRealItem ? simPosterUrl : null,
                                                    simSelectedRealItem?.title || "Sample Media",
                                                    simBannerType,
                                                    e.target.value
                                                );
                                            }}
                                            className="h-8 text-xs bg-slate-950 border-slate-800 font-mono text-white"
                                            placeholder="e.g. LEAVING ON {date}"
                                        />

                                        {/* Variable Insertion Chips */}
                                        <div className="flex flex-wrap gap-1 pt-1">
                                            {[
                                                { token: "{date}", label: "+ {date}" },
                                                { token: "{days}", label: "+ {days}" },
                                                { token: "{title}", label: "+ {title}" },
                                                { token: "{reason}", label: "+ {reason}" },
                                                { token: "{status}", label: "+ {status}" },
                                                { token: "{quality}", label: "+ {quality}" }
                                            ].map(chip => (
                                                <button
                                                    key={chip.token}
                                                    type="button"
                                                    onClick={() => handleInsertToken(chip.token)}
                                                    className="px-2 py-0.5 rounded-md bg-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-300 border border-rose-500/30 text-[10px] font-mono font-bold transition-all cursor-pointer"
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
                                                value={simBannerTheme}
                                                onValueChange={(val) => {
                                                    setSimBannerTheme(val);
                                                    generatePrunePreview(
                                                        simSelectedRealItem ? simPosterUrl : null,
                                                        simSelectedRealItem?.title || "Sample Media",
                                                        simBannerType,
                                                        simBannerText,
                                                        val
                                                    );
                                                }}
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
                                                    <SelectItem value="slate-frosted">🛡️ Slate Frosted</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1">
                                            <Label className="text-[10px] text-slate-400">Position:</Label>
                                            <Select
                                                value={simBannerPosition}
                                                onValueChange={(val: any) => {
                                                    setSimBannerPosition(val);
                                                    generatePrunePreview(
                                                        simSelectedRealItem ? simPosterUrl : null,
                                                        simSelectedRealItem?.title || "Sample Media",
                                                        simBannerType,
                                                        simBannerText,
                                                        simBannerTheme,
                                                        val
                                                    );
                                                }}
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

                                    {/* Live Variable Test Values */}
                                    <div className="p-2.5 bg-slate-950/90 rounded-xl border border-slate-800/80 space-y-2">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                                            Live Test Variables:
                                        </span>
                                        <div className="grid grid-cols-2 gap-2 text-[10px]">
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Date {'{date}'}:</Label>
                                                <Input
                                                    value={simTemplateDate}
                                                    onChange={(e) => {
                                                        setSimTemplateDate(e.target.value);
                                                        generatePrunePreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || "Sample Media",
                                                            simBannerType,
                                                            simBannerText,
                                                            simBannerTheme,
                                                            simBannerPosition,
                                                            e.target.value
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-800 font-mono"
                                                />
                                            </div>
                                            <div>
                                                <Label className="text-[9px] text-slate-500">Days {'{days}'}:</Label>
                                                <Input
                                                    type="number"
                                                    value={simTemplateDays}
                                                    onChange={(e) => {
                                                        const num = parseInt(e.target.value, 10) || 0;
                                                        setSimTemplateDays(num);
                                                        generatePrunePreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || "Sample Media",
                                                            simBannerType,
                                                            simBannerText,
                                                            simBannerTheme,
                                                            simBannerPosition,
                                                            simTemplateDate,
                                                            num
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-800 font-mono"
                                                />
                                            </div>
                                            <div className="col-span-2">
                                                <Label className="text-[9px] text-slate-500">Reason {'{reason}'}:</Label>
                                                <Input
                                                    value={simTemplateReason}
                                                    onChange={(e) => {
                                                        setSimTemplateReason(e.target.value);
                                                        generatePrunePreview(
                                                            simSelectedRealItem ? simPosterUrl : null,
                                                            simSelectedRealItem?.title || "Sample Media",
                                                            simBannerType,
                                                            simBannerText,
                                                            simBannerTheme,
                                                            simBannerPosition,
                                                            simTemplateDate,
                                                            simTemplateDays,
                                                            e.target.value
                                                        );
                                                    }}
                                                    className="h-6 text-[10px] bg-slate-900 border-slate-800 font-mono"
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* TAB 2: PRUNE SANDBOX SIMULATOR */}
            {subTab === "simulation" && (
                <div className="space-y-6">
                    {/* Sandbox Criteria Controls */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl p-6 space-y-4">
                        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                            <div className="space-y-0.5">
                                <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                    <Sliders className="h-5 w-5 text-rose-400" />
                                    <span>Maintainerr Rule Builder &amp; Simulation Sandbox</span>
                                </CardTitle>
                                <CardDescription className="text-xs text-slate-400">
                                    Evaluate libraries in safe dry-run mode to simulate disk capacity recovery without modifying files.
                                </CardDescription>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                disabled={simulatingPrune}
                                onClick={handleRunSimulation}
                                className="bg-rose-600 hover:bg-rose-500 text-white font-black text-xs h-9 px-4 gap-2 shadow-lg cursor-pointer"
                            >
                                {simulatingPrune ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                                <span>Run Prune Simulation</span>
                            </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                            <div className="space-y-1.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                                <Label className="text-xs text-slate-300 font-semibold">Minimum Age in Library:</Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        type="number"
                                        min="1"
                                        value={simMinAgeDays}
                                        onChange={(e) => setSimMinAgeDays(parseInt(e.target.value, 10) || 30)}
                                        className="bg-slate-900 border-slate-700 h-8 text-xs font-mono"
                                    />
                                    <span className="text-slate-400 text-xs">days</span>
                                </div>
                            </div>

                            <div className="space-y-1.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-slate-300 font-semibold">Unwatched Items Only:</Label>
                                    <Switch checked={simUnwatchedOnly} onCheckedChange={setSimUnwatchedOnly} />
                                </div>
                                <p className="text-[10px] text-slate-400">Exclude items watched by any Plex user</p>
                            </div>

                            <div className="space-y-1.5 p-3 bg-slate-950/60 rounded-xl border border-slate-800">
                                <Label className="text-xs text-slate-300 font-semibold">Max Candidate Limit:</Label>
                                <Input
                                    type="number"
                                    min="5"
                                    max="200"
                                    value={simMaxCandidates}
                                    onChange={(e) => setSimMaxCandidates(parseInt(e.target.value, 10) || 50)}
                                    className="bg-slate-900 border-slate-700 h-8 text-xs font-mono"
                                />
                            </div>
                        </div>
                    </Card>

                    {/* Simulation Results Card */}
                    {pruneSimResults && (
                        <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                            <CardHeader className="p-4 border-b border-slate-800/80 bg-slate-950/40">
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                    <div className="space-y-0.5">
                                        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                            <Archive className="h-4 w-4 text-emerald-400" />
                                            <span>Simulation Results: {pruneSimResults.candidates.length} Candidates Identified</span>
                                        </CardTitle>
                                        <p className="text-xs text-slate-400">Evaluated {pruneSimResults.evaluatedCount} media items</p>
                                    </div>
                                    <Badge className="bg-emerald-950 text-emerald-300 border-emerald-500/40 text-sm font-mono font-bold px-3 py-1">
                                        Recoverable Space: {pruneSimResults.totalRecoverableGb} GB
                                    </Badge>
                                </div>
                            </CardHeader>

                            <CardContent className="p-4 space-y-2.5">
                                {pruneSimResults.candidates.length === 0 ? (
                                    <p className="text-xs text-slate-500 text-center py-6">No candidates met the prune criteria.</p>
                                ) : (
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs text-slate-400">
                                            <span>Select candidates to stage or delete:</span>
                                            <div className="flex gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedCandidateKeys(pruneSimResults.candidates.map(c => c.ratingKey))}
                                                    className="text-[11px] text-purple-400 hover:underline"
                                                >
                                                    Select All
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedCandidateKeys([])}
                                                    className="text-[11px] text-slate-500 hover:underline"
                                                >
                                                    Clear Selection
                                                </button>
                                            </div>
                                        </div>

                                        {pruneSimResults.candidates.map((c: any) => {
                                            const isSelected = selectedCandidateKeys.includes(c.ratingKey);
                                            return (
                                                <div
                                                    key={c.ratingKey}
                                                    onClick={() => {
                                                        setSelectedCandidateKeys(prev =>
                                                            isSelected ? prev.filter(k => k !== c.ratingKey) : [...prev, c.ratingKey]
                                                        );
                                                    }}
                                                    className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer ${
                                                        isSelected
                                                            ? "bg-rose-950/30 border-rose-500/50"
                                                            : "bg-slate-950/80 border-slate-800 hover:border-slate-700"
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isSelected}
                                                            onChange={() => {}}
                                                            className="rounded border-slate-700 accent-rose-500"
                                                        />
                                                        <div className="space-y-0.5">
                                                            <span className="font-bold text-white text-xs">{c.title} ({c.year || "Unknown"})</span>
                                                            <p className="text-[10px] text-slate-400">
                                                                Age: {c.ageDays} days in library • {c.viewCount === 0 ? "Never watched" : `Watched ${c.viewCount}x`}
                                                            </p>
                                                        </div>
                                                    </div>

                                                    <Badge variant="outline" className="text-xs font-mono border-slate-700 text-slate-300">
                                                        {c.sizeGb ? `${c.sizeGb} GB` : "Size N/A"}
                                                    </Badge>
                                                </div>
                                            );
                                        })}

                                        <div className="pt-3 flex justify-end gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                disabled={executingPrune || selectedCandidateKeys.length === 0}
                                                onClick={() => handleExecutePrune(false)}
                                                className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs gap-1.5 cursor-pointer"
                                            >
                                                <AlertTriangle className="h-3.5 w-3.5" />
                                                <span>Stage {selectedCandidateKeys.length} Items (14-Day Notice)</span>
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </CardContent>
                        </Card>
                    )}
                </div>
            )}

            {/* TAB 3: SAFE DELETION EXECUTION ENGINE */}
            {subTab === "execution" && (
                <Card className="bg-slate-900/90 border-slate-800 shadow-xl p-6 space-y-6">
                    <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                        <div className="space-y-0.5">
                            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                <ShieldAlert className="h-5 w-5 text-rose-400" />
                                <span>Maintainerr Safe Deletion Execution Engine</span>
                            </CardTitle>
                            <CardDescription className="text-xs text-slate-400">
                                Multi-layered safety guards preventing accidental data loss during media prunes.
                            </CardDescription>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        {/* Master Deletion Switch */}
                        <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-white text-xs flex items-center gap-2">
                                    <Power className="h-4 w-4 text-rose-400" /> Master Deletion Switch
                                </span>
                                <Switch
                                    checked={settings.enableAutoPruneDeletion ?? false}
                                    onCheckedChange={async (checked) => {
                                        setSettings((prev: any) => ({ ...prev, enableAutoPruneDeletion: checked }));
                                        await saveCurationSettingsAction({ enableAutoPruneDeletion: checked });
                                    }}
                                />
                            </div>
                            <p className="text-[11px] text-slate-400">
                                When disabled, all prunes are strictly dry-run simulations or stage items into the Leaving Soon hub.
                            </p>
                        </div>

                        {/* Dry Run Mode */}
                        <div className="p-4 bg-slate-950/80 rounded-xl border border-slate-800 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="font-bold text-white text-xs flex items-center gap-2">
                                    <Shield className="h-4 w-4 text-emerald-400" /> Dry Run Safety Mode
                                </span>
                                <Switch
                                    checked={settings.pruneDryRun ?? true}
                                    onCheckedChange={async (checked) => {
                                        setSettings((prev: any) => ({ ...prev, pruneDryRun: checked }));
                                        await saveCurationSettingsAction({ pruneDryRun: checked });
                                    }}
                                />
                            </div>
                            <p className="text-[11px] text-slate-400">
                                Dry run mode simulates file cleanup without physically touching media on disk.
                            </p>
                        </div>
                    </div>

                    {pruneExecMessage && (
                        <div className={`p-4 rounded-xl border text-xs space-y-2 ${
                            pruneExecMessage.success ? "bg-emerald-950/80 border-emerald-800 text-emerald-300" : "bg-rose-950/80 border-rose-800 text-rose-300"
                        }`}>
                            <div className="flex items-center gap-2 font-bold">
                                {pruneExecMessage.success ? <CheckCircle2 className="h-4 w-4 text-emerald-400" /> : <XCircle className="h-4 w-4 text-rose-400" />}
                                <span>{pruneExecMessage.text}</span>
                            </div>
                        </div>
                    )}
                </Card>
            )}

            {/* TAB 4: MOUNTS & BACKUP VAULT */}
            {subTab === "storage" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Storage Mounts Configuration */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl p-6 space-y-4">
                        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                            <HardDrive className="h-5 w-5 text-cyan-400" />
                            <span>Storage Mounts Configuration</span>
                        </CardTitle>
                        <p className="text-xs text-slate-400">
                            Configure physical disk mount paths for storage capacity monitoring and free space warning calculations.
                        </p>

                        <div className="space-y-3">
                            {servers.map(srv => {
                                const currentPath = serverStorageConfig[srv.serverId] || "";
                                const checkStatus = pathCheckResults[srv.serverId];

                                return (
                                    <div key={srv.serverId} className="space-y-1.5">
                                        <Label className="text-xs text-slate-300 font-semibold">{srv.serverName} Mount Path:</Label>
                                        <div className="flex gap-2">
                                            <Input
                                                placeholder="/mnt/user/data/media"
                                                value={currentPath}
                                                onChange={(e) => {
                                                    const updated = { ...serverStorageConfig, [srv.serverId]: e.target.value };
                                                    setServerStorageConfig(updated);
                                                }}
                                                className="text-xs bg-slate-950 border-slate-800 font-mono"
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

                            <Button
                                type="button"
                                size="sm"
                                disabled={savingStorageConfig}
                                onClick={async () => {
                                    setSavingStorageConfig(true);
                                    await saveServerStorageConfigAction(serverStorageConfig);
                                    setSavingStorageConfig(false);
                                    setStorageConfigSavedMsg(true);
                                    setTimeout(() => setStorageConfigSavedMsg(false), 3000);
                                }}
                                className="bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs gap-1.5"
                            >
                                <Save className="h-3.5 w-3.5" />
                                <span>Save Storage Config</span>
                            </Button>
                            {storageConfigSavedMsg && <span className="text-xs text-emerald-400 font-bold ml-2">✓ Saved!</span>}
                        </div>
                    </Card>

                    {/* Artwork Backup Vault Stats */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl p-6 space-y-4">
                        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                            <Archive className="h-5 w-5 text-purple-400" />
                            <span>Artwork Backup Vault Health</span>
                        </CardTitle>
                        <p className="text-xs text-slate-400">
                            Portalarr automatically archives pristine original poster artworks before applying overlays, allowing 0-loss rollback anytime.
                        </p>

                        <div className="space-y-3 font-mono text-xs">
                            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Original Posters Backed Up:</span>
                                    <strong className="text-purple-300">{vaultStats?.backupCount || 0} files</strong>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Vault Disk Usage:</span>
                                    <strong className="text-purple-300">
                                        {vaultStats?.backupBytes ? `${(vaultStats.backupBytes / (1024 * 1024)).toFixed(1)} MB` : "0 MB"}
                                    </strong>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-400">Custom Badges Vault:</span>
                                    <strong className="text-purple-300">{vaultStats?.badgeCount || 0} badges</strong>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>
            )}

            {/* Manual Flag Modal */}
            <Dialog open={manualFlagModalOpen} onOpenChange={setManualFlagModalOpen}>
                <DialogContent className="max-w-md bg-slate-900 border-slate-800 text-slate-100 p-6">
                    <DialogHeader className="pb-2 border-b border-slate-800">
                        <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5 text-amber-400" />
                            <span>Manually Flag Media as Leaving Soon</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-400">
                            Add an item directly to the Leaving Soon collection hub with a custom notice period.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-3 text-xs">
                        <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Item Title:</Label>
                            <Input
                                placeholder="e.g. Inception (2010)"
                                value={manualTitle}
                                onChange={(e) => setManualTitle(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-800"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Plex Rating Key:</Label>
                            <Input
                                placeholder="e.g. 12345"
                                value={manualRatingKey}
                                onChange={(e) => setManualRatingKey(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-800 font-mono"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Days Notice Remaining:</Label>
                            <Input
                                type="number"
                                min="1"
                                max="90"
                                value={manualDaysRemaining}
                                onChange={(e) => setManualDaysRemaining(parseInt(e.target.value, 10) || 14)}
                                className="h-8 text-xs bg-slate-950 border-slate-800 font-mono"
                            />
                        </div>

                        <div className="space-y-1">
                            <Label className="text-xs text-slate-300">Reason:</Label>
                            <Input
                                value={manualReason}
                                onChange={(e) => setManualReason(e.target.value)}
                                className="h-8 text-xs bg-slate-950 border-slate-800"
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-3 border-t border-slate-800 flex items-center justify-between">
                        <Button type="button" variant="ghost" size="sm" onClick={() => setManualFlagModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            disabled={flaggingItem || !manualTitle.trim() || !manualRatingKey.trim()}
                            onClick={handleManualFlag}
                            className="bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs gap-1.5"
                        >
                            {flaggingItem ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                            <span>Stage Item</span>
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

export default PruneStudio;
