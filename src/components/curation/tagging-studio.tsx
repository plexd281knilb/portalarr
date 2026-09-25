"use client";

import React, { useState, useEffect } from "react";
import {
    Tag,
    Shield,
    ShieldAlert,
    ShieldCheck,
    AlertTriangle,
    Sliders,
    Search,
    RefreshCw,
    Play,
    Trash2,
    CheckCircle2,
    XCircle,
    Info,
    Sparkles,
    Film,
    Tv,
    Layers,
    Filter,
    Flame,
    Zap,
    Check,
    X,
    Loader2,
    Clock,
    Clock3,
    Calendar,
    CalendarClock,
    SlidersHorizontal,
    Settings2,
    Save,
    RotateCcw,
    HardDrive
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
import {
    getPlexServersAndSectionsAction,
    getPlexServerSectionsAction,
    applyParentalTagsToLibraryAction,
    clearParentalTagsFromLibraryAction,
    getStoredParentalAdvisoriesForLibraryAction,
    applyCustomTagRuleAction,
    clearCustomTagFromLibraryAction,
    getPlexLibraryTagsAuditAction,
    getCurationSettingsAction,
    saveCurationSettingsAction,
    toggleCurationLibrarySectionAction,
    toggleAllCurationServerSectionsAction,
    runParentalTagsSyncAction
} from "@/app/curation-actions";
import {
    ParentalCategoryKey,
    ParentalSeverity,
    ParentalTaggingOptions,
    PARENTAL_CATEGORY_INFO,
    SEVERITY_LEVELS,
    CustomTagRule
} from "@/lib/curation/parental-guide-types";
import {
    SCHEDULE_OPTIONS,
    formatScheduleLabel,
    calculateNextRunTime,
    formatLastRunDisplay
} from "@/lib/curation/schedule-helper";

interface PlexServerItem {
    serverId: string;
    serverName: string;
    sections: Array<{ key: string | number; title: string; type: string }>;
}

export function TaggingStudio() {
    const [subTab, setSubTab] = useState<"parental" | "custom_rules" | "audit">("parental");
    const [loading, setLoading] = useState(true);

    // Server & Section Navigation
    const [servers, setServers] = useState<PlexServerItem[]>([]);
    const [selectedServerId, setSelectedServerId] = useState<string>("");
    const [selectedSectionKey, setSelectedSectionKey] = useState<string>("");
    const [serverSectionsLoading, setServerSectionsLoading] = useState(false);

    // Automated Schedule & Enabled Library States
    const [curationSyncParentalTags, setCurationSyncParentalTags] = useState<boolean>(true);
    const [curationSyncSchedule, setCurationSyncSchedule] = useState<string>("every_6_hours");
    const [curationLastRunAt, setCurationLastRunAt] = useState<string | null>(null);
    const [curationLastRunStatus, setCurationLastRunStatus] = useState<any | null>(null);
    const [enabledServersForTagging, setEnabledServersForTagging] = useState<string[]>([]);
    const [taggingBatchSize, setTaggingBatchSize] = useState<number>(200);
    const [taggingBatchMode, setTaggingBatchMode] = useState<string>("incremental");
    const [savingSchedule, setSavingSchedule] = useState(false);
    const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);
    const [runningTaggingSync, setRunningTaggingSync] = useState(false);
    const [taggingSyncResult, setTaggingSyncResult] = useState<{ success: boolean; text: string; details?: string[] } | null>(null);

    // Parental Tagging State
    const [parentalOptions, setParentalOptions] = useState<ParentalTaggingOptions>({
        minSeverity: "Mild",
        format: "prefix_category_severity",
        prefix: "IMDb",
        target: "labels",
        categories: ["nudity", "violence", "profanity", "alcohol", "frightening"]
    });
    const [parentalActionLoading, setParentalActionLoading] = useState(false);
    const [parentalResult, setParentalResult] = useState<{
        success?: boolean;
        message?: string;
        totalEvaluated?: number;
        taggedCount?: number;
        skippedCount?: number;
        appliedTagsSummary?: Record<string, number>;
        clearedCount?: number;
    } | null>(null);

    // Baseline Snapshot for Tracking Unsaved Changes
    const [baselineSettings, setBaselineSettings] = useState<{
        curationSyncParentalTags: boolean;
        curationSyncSchedule: string;
        parentalOptions: ParentalTaggingOptions;
    } | null>(null);
    const [isSavingAll, setIsSavingAll] = useState(false);

    const isScheduleDirty = Boolean(
        baselineSettings && (
            curationSyncParentalTags !== baselineSettings.curationSyncParentalTags ||
            curationSyncSchedule !== baselineSettings.curationSyncSchedule
        )
    );

    const isParentalConfigDirty = Boolean(
        baselineSettings && (
            parentalOptions.minSeverity !== baselineSettings.parentalOptions.minSeverity ||
            parentalOptions.format !== baselineSettings.parentalOptions.format ||
            parentalOptions.prefix !== baselineSettings.parentalOptions.prefix ||
            parentalOptions.target !== baselineSettings.parentalOptions.target ||
            JSON.stringify(parentalOptions.categories?.slice().sort()) !== JSON.stringify(baselineSettings.parentalOptions.categories?.slice().sort())
        )
    );

    const unsavedSections: string[] = [];
    if (isScheduleDirty) unsavedSections.push("Automated Tagging Schedule");
    if (isParentalConfigDirty) unsavedSections.push("IMDb Parental Advisory Rules");
    const hasUnsavedChanges = unsavedSections.length > 0;

    // Library Advisory Items
    const [advisoryItems, setAdvisoryItems] = useState<Array<{
        ratingKey: string;
        title: string;
        year?: number;
        contentRating?: string;
        advisory: any;
    }>>([]);
    const [advisoryLoading, setAdvisoryLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [displayLimit, setDisplayLimit] = useState<number>(50);

    // Custom Tagging State
    const [customRule, setCustomRule] = useState<CustomTagRule>({
        tagName: "",
        field: "label",
        filterType: "all",
        filterValue: ""
    });
    const [customActionLoading, setCustomActionLoading] = useState(false);
    const [customResult, setCustomResult] = useState<{
        success?: boolean;
        message?: string;
        taggedCount?: number;
        clearedCount?: number;
    } | null>(null);

    // Tag Audit State
    const [auditData, setAuditData] = useState<{
        labels: Array<{ tag: string; count: number; isParental: boolean }>;
        genres: Array<{ tag: string; count: number; isParental: boolean }>;
        collections: Array<{ tag: string; count: number }>;
        totalItems: number;
    }>({ labels: [], genres: [], collections: [], totalItems: 0 });
    const [auditLoading, setAuditLoading] = useState(false);
    const [manageLibrariesModalOpen, setManageLibrariesModalOpen] = useState(false);

    // Check if a section is enabled for tagging
    const isSectionEnabled = (srvId: string, secKey: string): boolean => {
        if (!enabledServersForTagging || enabledServersForTagging.length === 0) return true;
        if (enabledServersForTagging.includes(`disabled:${srvId}`) || enabledServersForTagging.includes(`${srvId}:none`)) return false;
        if (enabledServersForTagging.includes(`disabled:${srvId}:${secKey}`)) return false;
        const compoundKey = `${srvId}:${secKey}`;
        if (enabledServersForTagging.includes(compoundKey)) return true;
        const hasServerEntries = enabledServersForTagging.some(k => k === srvId || k.startsWith(`${srvId}:`) || k.startsWith(`disabled:${srvId}`));
        if (hasServerEntries) {
            if (enabledServersForTagging.includes(srvId) && !enabledServersForTagging.some(k => k.startsWith(`${srvId}:`))) return true;
            return false;
        }
        return true;
    };

    // Toggle a specific section enabled/disabled on any server
    const handleToggleSpecificSection = async (srvId: string, secKey: string) => {
        const currentlyEnabled = isSectionEnabled(srvId, secKey);
        const nextEnabled = !currentlyEnabled;
        const currentSections = servers.find(s => s.serverId === srvId)?.sections || [];
        const allSecKeys = currentSections.map(s => String(s.key));

        try {
            const res = await toggleCurationLibrarySectionAction("tagging", srvId, secKey, nextEnabled, allSecKeys);
            if (res.success && res.enabledList) {
                setEnabledServersForTagging(res.enabledList);
            }
        } catch (e) {
            console.error("Failed toggling section tagging state:", e);
        }
    };

    // Toggle ALL sections on a specific server for Tagging (Enable All / Disable All)
    const handleToggleAllSectionsForSpecificServer = async (srvId: string, enableAll: boolean) => {
        const currentSections = servers.find(s => s.serverId === srvId)?.sections || [];
        const allSecKeys = currentSections.map(s => String(s.key));
        try {
            const res = await toggleAllCurationServerSectionsAction("tagging", srvId, enableAll, allSecKeys);
            if (res.success && res.enabledList) {
                setEnabledServersForTagging(res.enabledList);
            }
        } catch (e) {
            console.error("Failed toggling all server sections for tagging:", e);
        }
    };

    // Toggle a section enabled/disabled for tagging on selected server
    const handleToggleSection = async (secKey: string) => {
        return handleToggleSpecificSection(selectedServerId, secKey);
    };

    // Toggle ALL sections on the selected server for Tagging (Enable All / Disable All)
    const handleToggleAllSectionsOnServer = async (enableAll: boolean) => {
        return handleToggleAllSectionsForSpecificServer(selectedServerId, enableAll);
    };

    // Save schedule settings
    const handleSaveSchedule = async () => {
        setSavingSchedule(true);
        setScheduleSavedMsg(false);
        try {
            const res = await saveCurationSettingsAction({
                curationSyncParentalTags,
                curationSyncSchedule,
                taggingSyncEnabled: curationSyncParentalTags,
                taggingSyncSchedule: curationSyncSchedule
            });
            if (res.success) {
                setBaselineSettings(prev => prev ? ({
                    ...prev,
                    curationSyncParentalTags,
                    curationSyncSchedule
                }) : null);
                setScheduleSavedMsg(true);
                setTimeout(() => setScheduleSavedMsg(false), 3000);
            }
        } catch (e) {
            console.error("Failed saving tagging schedule:", e);
        } finally {
            setSavingSchedule(false);
        }
    };

    // Save all unsaved changes across tagging settings
    const handleSaveAllDirty = async () => {
        setIsSavingAll(true);
        try {
            const res = await saveCurationSettingsAction({
                curationSyncParentalTags,
                curationSyncSchedule,
                taggingSyncEnabled: curationSyncParentalTags,
                taggingSyncSchedule: curationSyncSchedule,
                parentalTaggingEnabled: curationSyncParentalTags,
                parentalTagFormat: parentalOptions.format,
                parentalTagPrefix: parentalOptions.prefix,
                parentalTagTarget: parentalOptions.target,
                parentalMinSeverity: parentalOptions.minSeverity,
                parentalCategories: parentalOptions.categories
            });
            if (res.success) {
                setBaselineSettings({
                    curationSyncParentalTags,
                    curationSyncSchedule,
                    parentalOptions: { ...parentalOptions }
                });
                setScheduleSavedMsg(true);
                setTimeout(() => setScheduleSavedMsg(false), 3000);
            }
        } catch (e) {
            console.error("Failed saving tagging settings:", e);
        } finally {
            setIsSavingAll(false);
        }
    };

    // Discard all unsaved changes
    const handleDiscardAllDirty = () => {
        if (!baselineSettings) return;
        setCurationSyncParentalTags(baselineSettings.curationSyncParentalTags);
        setCurationSyncSchedule(baselineSettings.curationSyncSchedule);
        setParentalOptions({ ...baselineSettings.parentalOptions });
    };

    // Run Tagging Sync Now
    const handleRunTaggingSync = async (srvId?: string, secKey?: string) => {
        setRunningTaggingSync(true);
        setTaggingSyncResult(null);
        try {
            const res = await runParentalTagsSyncAction(srvId || selectedServerId, secKey || selectedSectionKey);
            if (res.success) {
                setTaggingSyncResult({
                    success: true,
                    text: `Tagging Sync Completed: ${res.totalTagged ?? 0} items tagged (${res.totalEvaluated ?? 0} evaluated).`,
                    details: res.details
                });
                setCurationLastRunAt(new Date().toISOString());
                if (selectedServerId && selectedSectionKey) {
                    loadAdvisoryItems();
                    loadAuditData();
                }
            } else {
                setTaggingSyncResult({
                    success: false,
                    text: res.error || "Failed running tagging sync."
                });
            }
        } catch (e: any) {
            setTaggingSyncResult({
                success: false,
                text: e.message || "An error occurred during tagging sync."
            });
        } finally {
            setRunningTaggingSync(false);
        }
    };

    // Initial Load: Fetch Plex Servers, Sections, and Curation Settings
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
                    const loadedSyncTags = settingsRes.taggingSyncEnabled ?? settingsRes.curationSyncParentalTags ?? settingsRes.parentalTaggingEnabled ?? true;
                    const loadedSchedule = settingsRes.taggingSyncSchedule || settingsRes.curationSyncSchedule || "daily_3am";
                    const loadedParentalOpts: ParentalTaggingOptions = {
                        minSeverity: (settingsRes.parentalMinSeverity as any) || "Mild",
                        format: (settingsRes.parentalTagFormat as any) || "prefix_category_severity",
                        prefix: settingsRes.parentalTagPrefix || (settingsRes as any).parentalPrefix || "IMDb",
                        target: (settingsRes.parentalTagTarget as any) || "labels",
                        categories: settingsRes.parentalCategories || ["nudity", "violence", "profanity", "alcohol", "frightening"]
                    };

                    setCurationSyncParentalTags(loadedSyncTags);
                    setCurationSyncSchedule(loadedSchedule);
                    setParentalOptions(loadedParentalOpts);
                    setBaselineSettings({
                        curationSyncParentalTags: loadedSyncTags,
                        curationSyncSchedule: loadedSchedule,
                        parentalOptions: loadedParentalOpts
                    });

                    setCurationLastRunAt(settingsRes.taggingLastRunAt || settingsRes.curationLastRunAt || null);
                    setCurationLastRunStatus(settingsRes.taggingLastRunStatus || settingsRes.curationLastRunStatus || null);
                    if (settingsRes.enabledServersForTagging) {
                        setEnabledServersForTagging(settingsRes.enabledServersForTagging);
                    }
                }
            } catch (err) {
                console.error("Failed loading tagging studio data:", err);
            } finally {
                setLoading(false);
            }
        };

        loadInitialData();
    }, []);

    // When Server or Section changes, load relevant data
    useEffect(() => {
        if (selectedServerId && selectedSectionKey) {
            if (subTab === "parental") {
                loadAdvisoryItems();
            } else if (subTab === "audit") {
                loadAuditData();
            }
        }
    }, [selectedServerId, selectedSectionKey, subTab]);

    async function handleServerChange(newServerId: string) {
        setSelectedServerId(newServerId);
        const srv = servers.find(s => s.serverId === newServerId);
        let srvSections = srv?.sections || [];

        if (srvSections.length === 0) {
            setServerSectionsLoading(true);
            try {
                const res = await getPlexServerSectionsAction(newServerId);
                if (res.success && res.sections && res.sections.length > 0) {
                    srvSections = res.sections as any;
                    setServers(prev => prev.map(s => s.serverId === newServerId ? { ...s, sections: (res.sections as any) || [] } : s));
                }
            } catch (e) {
                console.error("Failed loading sections for server:", e);
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
    }

    async function loadAdvisoryItems() {
        if (!selectedServerId || !selectedSectionKey) return;
        setAdvisoryLoading(true);
        try {
            const res = await getStoredParentalAdvisoriesForLibraryAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setAdvisoryItems(res.items || []);
            }
        } catch (e) {
            console.error("Failed fetching library advisories:", e);
        } finally {
            setAdvisoryLoading(false);
        }
    }

    async function loadAuditData() {
        if (!selectedServerId || !selectedSectionKey) return;
        setAuditLoading(true);
        try {
            const res = await getPlexLibraryTagsAuditAction(selectedServerId, selectedSectionKey);
            if (res.success) {
                setAuditData({
                    labels: res.labels || [],
                    genres: res.genres || [],
                    collections: res.collections || [],
                    totalItems: res.totalItems || 0
                });
            }
        } catch (e) {
            console.error("Failed loading tag audit:", e);
        } finally {
            setAuditLoading(false);
        }
    }

    // Parental Tag Execution
    async function handleApplyParentalTags() {
        if (!selectedServerId || !selectedSectionKey) return;
        setParentalActionLoading(true);
        setParentalResult(null);
        try {
            const res = await applyParentalTagsToLibraryAction(selectedServerId, selectedSectionKey, parentalOptions);
            if (res.success) {
                setParentalResult({
                    success: true,
                    message: `Successfully applied IMDb Parental Guide tags to ${res.taggedCount} media item(s) (${res.skippedCount} skipped/none).`,
                    totalEvaluated: res.totalEvaluated,
                    taggedCount: res.taggedCount,
                    skippedCount: res.skippedCount,
                    appliedTagsSummary: res.appliedTagsSummary
                });
                await loadAdvisoryItems();
                await loadAuditData();
            } else {
                setParentalResult({
                    success: false,
                    message: res.error || "Failed applying parental tags."
                });
            }
        } catch (e: any) {
            setParentalResult({
                success: false,
                message: e.message || "Failed applying parental tags."
            });
        } finally {
            setParentalActionLoading(false);
        }
    }

    async function handleClearParentalTags() {
        if (!selectedServerId || !selectedSectionKey) return;
        setParentalActionLoading(true);
        setParentalResult(null);
        try {
            const res = await clearParentalTagsFromLibraryAction(selectedServerId, selectedSectionKey, parentalOptions.prefix);
            if (res.success) {
                setParentalResult({
                    success: true,
                    message: `Cleared parental advisory tags from ${res.clearedCount} media items.`,
                    clearedCount: res.clearedCount
                });
                await loadAdvisoryItems();
                await loadAuditData();
            } else {
                setParentalResult({
                    success: false,
                    message: res.error || "Failed clearing parental tags."
                });
            }
        } catch (e: any) {
            setParentalResult({
                success: false,
                message: e.message || "Failed clearing parental tags."
            });
        } finally {
            setParentalActionLoading(false);
        }
    }

    // Custom Tag Execution
    async function handleApplyCustomRule() {
        if (!selectedServerId || !selectedSectionKey || !customRule.tagName.trim()) return;
        setCustomActionLoading(true);
        setCustomResult(null);
        try {
            const res = await applyCustomTagRuleAction(selectedServerId, selectedSectionKey, customRule);
            if (res.success) {
                setCustomResult({
                    success: true,
                    message: `Applied "${customRule.tagName}" (${customRule.field}) to ${res.taggedCount} items (${res.skippedCount} skipped).`,
                    taggedCount: res.taggedCount
                });
                await loadAuditData();
            } else {
                setCustomResult({
                    success: false,
                    message: res.error || "Failed applying custom tag rule."
                });
            }
        } catch (e: any) {
            setCustomResult({
                success: false,
                message: e.message || "Failed applying custom tag rule."
            });
        } finally {
            setCustomActionLoading(false);
        }
    }

    async function handleClearCustomTag(tagName: string, field: "label" | "genre" | "collection" = "label") {
        if (!selectedServerId || !selectedSectionKey || !tagName) return;
        setCustomActionLoading(true);
        setCustomResult(null);
        try {
            const res = await clearCustomTagFromLibraryAction(selectedServerId, selectedSectionKey, tagName, field);
            if (res.success) {
                setCustomResult({
                    success: true,
                    message: `Removed "${tagName}" from ${res.clearedCount} items.`,
                    clearedCount: res.clearedCount
                });
                await loadAuditData();
            } else {
                setCustomResult({
                    success: false,
                    message: res.error || "Failed removing tag."
                });
            }
        } catch (e: any) {
            setCustomResult({
                success: false,
                message: e.message || "Failed removing tag."
            });
        } finally {
            setCustomActionLoading(false);
        }
    }

    const currentServer = servers.find(s => s.serverId === selectedServerId);
    const currentSections = currentServer?.sections || [];
    const filteredAdvisories = advisoryItems.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Target Library Section Computations
    const allServerSectionsList = servers.flatMap(srv => 
        (srv.sections || []).map(sec => ({
            serverId: srv.serverId,
            serverName: srv.serverName,
            sectionKey: String(sec.key),
            title: sec.title,
            type: sec.type,
            isEnabled: isSectionEnabled(srv.serverId, String(sec.key))
        }))
    );

    const activeEnabledSections = allServerSectionsList.filter(s => s.isEnabled);
    const excludedSections = allServerSectionsList.filter(s => !s.isEnabled);

    return (
        <div className="space-y-6">
            {/* Nav Header */}
            <CurationNavHeader
                serversCount={servers.length}
                servers={servers.map(s => ({ serverId: s.serverId, serverName: s.serverName }))}
                selectedServerId={selectedServerId}
                title="Plex Media Tagging & Content Advisory Studio"
                description="Apply automated IMDb Parental Guide tags (Nudity, Violence, Profanity, Alcohol/Drugs, Frightening) for restricted Plex Home profiles, and build custom rule-based auto-taggers."
            />

            {/* Static Server & Library Section Navigator */}
            {servers.length > 0 && (
                <Card className="bg-slate-900/90 border-slate-800 shadow-xl overflow-hidden backdrop-blur-md">
                    <div className="p-4 space-y-3.5">
                        {/* Plex Servers Static Tabs */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
                            <div className="flex items-center gap-2 text-xs font-bold text-slate-300 shrink-0">
                                <Tv className="h-4 w-4 text-emerald-400" />
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
                                            onClick={() => handleServerChange(s.serverId)}
                                            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                isSelected
                                                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/60 border border-emerald-400/50 ring-1 ring-emerald-400/40 font-black'
                                                    : 'bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/60'
                                            }`}
                                        >
                                            <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-white shadow-sm' : 'bg-emerald-400'}`} />
                                            <span>{s.serverName || "Plex Server"}</span>
                                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${isSelected ? 'border-emerald-800 text-white bg-emerald-700' : 'border-slate-700 text-slate-400'}`}>
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
                                <Film className="h-4 w-4 text-emerald-400" />
                                <span>Library Sections:</span>
                                {serverSectionsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />}
                            </div>
                            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
                                {serverSectionsLoading ? (
                                    <div className="flex items-center gap-2 text-xs text-emerald-400 py-1 font-medium">
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
                                                        ? 'bg-emerald-600/20 border-emerald-400/60 ring-1 ring-emerald-400/40'
                                                        : 'bg-slate-800/80 border-slate-700/70 hover:border-slate-600'
                                                }`}
                                            >
                                                {/* Library Tab Selector Button */}
                                                <button
                                                    type="button"
                                                    onClick={() => setSelectedSectionKey(String(sec.key))}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-l-xl transition-all cursor-pointer ${
                                                        isSelected
                                                            ? 'text-emerald-200'
                                                            : 'text-slate-300 hover:text-white'
                                                    }`}
                                                >
                                                    {isMovie && <Film className="h-3.5 w-3.5 text-amber-300 shrink-0" />}
                                                    {isShow && <Tv className="h-3.5 w-3.5 text-cyan-300 shrink-0" />}
                                                    {!isMovie && !isShow && <Layers className="h-3.5 w-3.5 text-slate-300 shrink-0" />}
                                                    <span>{sec.title}</span>
                                                    <span className={`text-[10px] font-mono px-1 py-0.2 rounded ${isSelected ? 'bg-emerald-500/30 text-emerald-100' : 'bg-slate-900 text-slate-400'}`}>
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
                                                    title={isSecEnabled ? `Tagging ACTIVE on "${sec.title}" (Click to exclude)` : `Tagging EXCLUDED on "${sec.title}" (Click to enable)`}
                                                    className={`px-2 py-1 text-[10px] font-extrabold transition-all border-l flex items-center gap-1 rounded-r-xl cursor-pointer ${
                                                        isSecEnabled 
                                                            ? isSelected
                                                                ? 'bg-emerald-500/30 text-emerald-200 border-emerald-400/40 hover:bg-emerald-500/40'
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
                                                {isSectionEnabled(selectedServerId, selectedSectionKey) ? '🟢 TAGGING ACTIVE' : '⚪ EXCLUDED / DISABLED'}
                                            </Badge>
                                        </div>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            {isSectionEnabled(selectedServerId, selectedSectionKey)
                                                ? 'This library section will automatically receive IMDb parental guide tags and custom tag rules.'
                                                : 'This library section is excluded and will be skipped during automated tagging sync.'}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 flex-wrap shrink-0 w-full md:w-auto justify-end">
                                    {/* Primary Switch */}
                                    <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800">
                                        <Label htmlFor="sec-master-toggle-tagging" className="text-xs font-bold text-slate-300 cursor-pointer">
                                            {isSectionEnabled(selectedServerId, selectedSectionKey) ? 'Enabled' : 'Disabled'}
                                        </Label>
                                        <Switch
                                            id="sec-master-toggle-tagging"
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
                                        disabled={runningTaggingSync}
                                        onClick={() => handleRunTaggingSync(selectedServerId, selectedSectionKey)}
                                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-950/40 cursor-pointer"
                                    >
                                        {runningTaggingSync ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Zap className="h-3.5 w-3.5 mr-1.5 text-white" />}
                                        <span>Tag Library #{selectedSectionKey}</span>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                </Card>
            )}

            {/* Automated Tagging & Parental Guides Schedule & Automation Card */}
            {(() => {
                const nextRunInfo = calculateNextRunTime(curationSyncSchedule, curationLastRunAt);
                return (
                    <Card className={`bg-slate-900/90 shadow-xl overflow-hidden backdrop-blur-md transition-all duration-300 ${isScheduleDirty ? 'border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'border-slate-800'}`}>
                        <CardHeader className="p-5 pb-3 border-b border-slate-800/80">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2.5 flex-wrap">
                                        <Clock className="h-5 w-5 text-emerald-400" />
                                        <CardTitle className="text-base sm:text-lg font-bold text-white">IMDb Parental Advisory &amp; Rating Tagging Schedule</CardTitle>
                                        <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0.5 ${curationSyncParentalTags ? 'border-emerald-500/40 text-emerald-300 bg-emerald-950/30' : 'border-slate-700 text-slate-400 bg-slate-800/40'}`}>
                                            {curationSyncParentalTags ? `Active (${formatScheduleLabel(curationSyncSchedule)})` : 'Paused'}
                                        </Badge>
                                        {curationSyncParentalTags && (
                                            <Badge className={`text-[10px] font-semibold px-2 py-0.5 ${nextRunInfo.isDue ? "bg-amber-500/20 text-amber-300 border border-amber-500/40" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"}`}>
                                                ⏱️ Next: {nextRunInfo.relativeText}
                                            </Badge>
                                        )}
                                        <Badge className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-[10px] font-semibold px-2 py-0.5">
                                            Target: {parentalOptions.target === "labels" ? "Plex Sharing Labels" : "Plex Genres"}
                                        </Badge>
                                        {isScheduleDirty && (
                                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[10px] font-bold animate-pulse">
                                                ● Unsaved Changes
                                            </Badge>
                                        )}
                                    </div>
                                    <CardDescription className="text-xs text-slate-400">
                                        Automatically fetches IMDb parental guide advisories and synchronizes content rating labels, genres, and custom tags across enabled Plex libraries on a recurring schedule.
                                    </CardDescription>
                                </div>
                                <Button 
                                    size="sm"
                                    onClick={handleSaveSchedule}
                                    disabled={savingSchedule}
                                    className={`font-bold text-xs h-8 px-3.5 gap-1.5 shadow-md cursor-pointer shrink-0 transition-all ${
                                        isScheduleDirty 
                                            ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20 animate-pulse" 
                                            : "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/40"
                                    }`}
                                >
                                    {savingSchedule ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                                    {scheduleSavedMsg ? "Saved Schedule!" : isScheduleDirty ? "Save Schedule (Unsaved)" : "Save Schedule"}
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="p-5 space-y-4">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                {/* Pillar 1: IMDb Parental Advisory Synchronization */}
                                <div className="bg-slate-950/60 border border-emerald-500/20 rounded-xl p-4 flex flex-col justify-between space-y-3.5">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                                                <span className="font-bold text-slate-100 text-sm">🛡️ IMDb Parental Advisory Sync</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="outline" className={`text-[10px] font-semibold px-2 py-0.5 ${curationSyncParentalTags ? 'border-emerald-500/40 text-emerald-300 bg-emerald-950/30' : 'border-slate-700 text-slate-500 bg-slate-900/40'}`}>
                                                    {curationSyncParentalTags ? formatScheduleLabel(curationSyncSchedule) : 'Disabled'}
                                                </Badge>
                                                <Switch 
                                                    checked={curationSyncParentalTags}
                                                    onCheckedChange={checked => setCurationSyncParentalTags(checked)}
                                                />
                                            </div>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Scans items in enabled libraries, queries IMDb parental content advisories (Nudity, Violence, Profanity, Alcohol, Frightening), and filters by minimum severity rating.
                                        </p>
                                    </div>

                                    <div className="space-y-3 pt-1">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-medium text-slate-400">Sync Frequency</label>
                                            <Select 
                                                value={curationSyncSchedule || "daily_3am"} 
                                                onValueChange={val => setCurationSyncSchedule(val)}
                                                disabled={!curationSyncParentalTags}
                                            >
                                                <SelectTrigger className="bg-slate-900 border-slate-700 text-xs h-8 text-slate-200">
                                                    <SelectValue placeholder="Select Frequency" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                                    {SCHEDULE_OPTIONS.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>
                                                            {opt.label}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        {/* Target Libraries Banner */}
                                        <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                                            <div className="flex items-center justify-between">
                                                <label className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
                                                    <Layers className="h-3 w-3 text-emerald-400" />
                                                    <span>Target Libraries ({activeEnabledSections.length} of {allServerSectionsList.length || 0} Active):</span>
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => setManageLibrariesModalOpen(true)}
                                                    className="text-[10px] text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer"
                                                >
                                                    Manage All &rarr;
                                                </button>
                                            </div>
                                            <div className="min-h-[32px] p-1.5 bg-slate-900/90 border border-slate-700/80 rounded-lg flex items-center gap-1 flex-wrap">
                                                {activeEnabledSections.length > 0 ? (
                                                    activeEnabledSections.map(sec => (
                                                        <Badge 
                                                            key={`${sec.serverId}-${sec.sectionKey}`}
                                                            className="bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 text-[10px] font-bold px-2 py-0.5 flex items-center gap-1 cursor-pointer hover:bg-emerald-900/80 transition-colors shadow-sm"
                                                            onClick={() => handleToggleSpecificSection(sec.serverId, sec.sectionKey)}
                                                            title={`Click to disable/exclude "${sec.title}" from tagging`}
                                                        >
                                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shrink-0" />
                                                            {sec.type === "movie" ? <Film className="h-2.5 w-2.5 opacity-70" /> : <Tv className="h-2.5 w-2.5 opacity-70" />}
                                                            <span>{sec.title}</span>
                                                            {servers.length > 1 && <span className="text-[9px] text-slate-400 font-normal">({sec.serverName})</span>}
                                                        </Badge>
                                                    ))
                                                ) : (
                                                    <span className="text-[11px] text-slate-400 italic px-1">No libraries active (Tagging paused)</span>
                                                )}
                                                {excludedSections.length > 0 && (
                                                    <Badge
                                                        variant="outline"
                                                        onClick={() => setManageLibrariesModalOpen(true)}
                                                        className="border-slate-700/80 bg-slate-950/80 text-slate-400 hover:text-slate-200 text-[9px] font-mono px-1.5 py-0 cursor-pointer hover:border-slate-600"
                                                    >
                                                        +{excludedSections.length} excluded
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-2 border-t border-slate-800/80">
                                        <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                                            <Clock3 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                            <span>Last run: <strong className="text-slate-200">{formatLastRunDisplay(curationLastRunAt)}</strong></span>
                                        </div>
                                        <Button 
                                            size="sm"
                                            onClick={() => handleRunTaggingSync()}
                                            disabled={runningTaggingSync}
                                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs h-8 px-3 gap-1.5 shadow-md shadow-emerald-950/40 cursor-pointer shrink-0"
                                        >
                                            {runningTaggingSync ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
                                            <span>Run Batch Tagging Now</span>
                                        </Button>
                                    </div>
                                </div>

                                {/* Pillar 2: Plex Target Destination & Sharing Labels */}
                                <div className="bg-slate-950/60 border border-cyan-500/20 rounded-xl p-4 flex flex-col justify-between space-y-3.5">
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <Tag className="h-4 w-4 text-cyan-400 shrink-0" />
                                                <span className="font-bold text-slate-100 text-sm">🏷️ Plex Target &amp; Sharing Access</span>
                                            </div>
                                            <Badge variant="outline" className="text-[10px] font-semibold px-2 py-0.5 border-cyan-500/40 text-cyan-300 bg-cyan-950/30">
                                                {parentalOptions.format === "prefix_category_severity" ? "Prefix: IMDb" : "Formatted"}
                                            </Badge>
                                        </div>
                                        <p className="text-xs text-slate-400 leading-relaxed">
                                            Applies structured tags directly into Plex sharing labels or genre metadata, enabling parental pin restrictions and granular shared-user account controls.
                                        </p>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-center">
                                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                                            <span className="text-[10px] text-slate-400 block">Min Severity</span>
                                            <span className="text-xs font-bold text-amber-300">{parentalOptions.minSeverity || "Mild"}+</span>
                                        </div>
                                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                                            <span className="text-[10px] text-slate-400 block">Destination</span>
                                            <span className="text-xs font-bold text-cyan-300 capitalize">{parentalOptions.target || "Labels"}</span>
                                        </div>
                                        <div className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                                            <span className="text-[10px] text-slate-400 block">Categories</span>
                                            <span className="text-xs font-bold text-emerald-300">5 Monitored</span>
                                        </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                                            <span>Nudity • Violence • Profanity • Alcohol • Frightening</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setSubTab("parental")}
                                            className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors cursor-pointer"
                                        >
                                            Configure Rules &rarr;
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>

                        {taggingSyncResult && (
                            <div className={`p-3 text-xs border-t ${taggingSyncResult.success ? 'bg-emerald-950/60 border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border-rose-800 text-rose-300'} flex items-start gap-2`}>
                                {taggingSyncResult.success ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                                <div className="space-y-0.5">
                                    <span className="font-bold">{taggingSyncResult.text}</span>
                                    {taggingSyncResult.details && taggingSyncResult.details.length > 0 && (
                                        <p className="text-[11px] opacity-80">{taggingSyncResult.details.join(" • ")}</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </Card>
                );
            })()}

            {/* Sub-Tabs Selector */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-1.5 bg-slate-900/90 rounded-2xl border border-slate-800 shadow-md backdrop-blur-md">
                <button
                    type="button"
                    onClick={() => setSubTab("parental")}
                    className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "parental"
                            ? "bg-emerald-600 text-white shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Shield className="h-4 w-4 shrink-0" />
                    <span className="truncate">IMDb Parental Guide</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("custom_rules")}
                    className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "custom_rules"
                            ? "bg-emerald-600 text-white shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Sliders className="h-4 w-4 shrink-0" />
                    <span className="truncate">Custom Tag Rules</span>
                </button>

                <button
                    type="button"
                    onClick={() => setSubTab("audit")}
                    className={`w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        subTab === "audit"
                            ? "bg-emerald-600 text-white shadow-md font-black"
                            : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/60"
                    }`}
                >
                    <Tag className="h-4 w-4 shrink-0" />
                    <span className="truncate">Tag Audit &amp; Cleanup</span>
                </button>
            </div>

            {/* TAB 1: IMDb Parental Guide */}
            {subTab === "parental" && (
                <div className="space-y-6">
                    {/* Action & Configuration Card */}
                    <Card className={`bg-slate-900/90 shadow-xl transition-all duration-300 ${isParentalConfigDirty ? 'border-2 border-amber-500/70 shadow-[0_0_20px_rgba(245,158,11,0.2)]' : 'border-slate-800'}`}>
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            <Shield className="h-5 w-5" />
                                        </div>
                                        <CardTitle className="text-lg font-bold text-white">
                                            IMDb Content Advisory &amp; Parental Tagging
                                        </CardTitle>
                                        {isParentalConfigDirty && (
                                            <Badge className="bg-amber-500/20 text-amber-300 border border-amber-500/50 text-[10px] font-bold animate-pulse">
                                                ● Unsaved Changes
                                            </Badge>
                                        )}
                                    </div>
                                    <CardDescription className="text-xs text-slate-400">
                                        Scan media items, query IMDb parental ratings via AI/TMDb, and tag items with standardized content advisory labels.
                                    </CardDescription>
                                </div>

                                <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto justify-start sm:justify-end">
                                    {isParentalConfigDirty && (
                                        <Button
                                            type="button"
                                            size="sm"
                                            onClick={handleSaveAllDirty}
                                            disabled={isSavingAll}
                                            className="h-9 text-xs bg-amber-500 hover:bg-amber-400 text-black font-bold shadow-md shadow-amber-500/20 animate-pulse cursor-pointer"
                                        >
                                            {isSavingAll ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Save className="mr-1.5 h-3.5 w-3.5" />}
                                            Save Settings
                                        </Button>
                                    )}

                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={handleClearParentalTags}
                                        disabled={parentalActionLoading || !selectedSectionKey}
                                        className="h-9 text-xs border-rose-500/40 text-rose-300 bg-rose-950/20 hover:bg-rose-900/40 font-bold"
                                    >
                                        <Trash2 className="mr-1.5 h-3.5 w-3.5 text-rose-400" />
                                        Clear Tags
                                    </Button>

                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleApplyParentalTags}
                                        disabled={parentalActionLoading || !selectedSectionKey}
                                        className="h-9 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-950/40"
                                    >
                                        {parentalActionLoading ? (
                                            <>
                                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                Tagging Library...
                                            </>
                                        ) : (
                                            <>
                                                <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                                                Tag Library
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-6 space-y-6">
                            {/* Controls Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {/* Minimum Severity */}
                                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                                    <Label className="text-xs font-bold text-slate-300">Minimum Severity Threshold</Label>
                                    <Select
                                        value={parentalOptions.minSeverity || "Mild"}
                                        onValueChange={(val: any) => setParentalOptions(prev => ({ ...prev, minSeverity: val }))}
                                    >
                                        <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-xs font-semibold text-slate-200">
                                            <SelectValue placeholder="Select Severity" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-950 border-slate-800 text-slate-200">
                                            <SelectItem value="Mild" className="text-xs">Mild+ (Mild, Moderate, Severe)</SelectItem>
                                            <SelectItem value="Moderate" className="text-xs">Moderate+ (Moderate, Severe)</SelectItem>
                                            <SelectItem value="Severe" className="text-xs">Severe Only</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-slate-500">Only categories meeting this severity will be tagged.</p>
                                </div>

                                {/* Target Tag Type */}
                                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                                    <Label className="text-xs font-bold text-slate-300">Plex Tag Destination</Label>
                                    <Select
                                        value={parentalOptions.target || "labels"}
                                        onValueChange={(val: any) => setParentalOptions(prev => ({ ...prev, target: val }))}
                                    >
                                        <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-xs font-semibold text-slate-200">
                                            <SelectValue placeholder="Select Destination" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-950 border-slate-800 text-slate-200">
                                            <SelectItem value="labels" className="text-xs">Plex Labels (For Account Restrictions)</SelectItem>
                                            <SelectItem value="genres" className="text-xs">Plex Genres (Visual Filtering)</SelectItem>
                                            <SelectItem value="both" className="text-xs">Both (Labels + Genres)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-slate-500">Labels allow restricting Kid/Managed accounts.</p>
                                </div>

                                {/* Tag Format */}
                                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                                    <Label className="text-xs font-bold text-slate-300">Tag Text Format</Label>
                                    <Select
                                        value={parentalOptions.format || "prefix_category_severity"}
                                        onValueChange={(val: any) => setParentalOptions(prev => ({ ...prev, format: val }))}
                                    >
                                        <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-xs font-semibold text-slate-200">
                                            <SelectValue placeholder="Select Format" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-950 border-slate-800 text-slate-200">
                                            <SelectItem value="prefix_category_severity" className="text-xs">IMDb: Nudity [Severe]</SelectItem>
                                            <SelectItem value="prefix_severity" className="text-xs">IMDb: Severe</SelectItem>
                                            <SelectItem value="category_severity" className="text-xs">Nudity [Severe]</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-[11px] text-slate-500">The string syntax applied to Plex metadata.</p>
                                </div>

                                {/* Tag Prefix */}
                                <div className="p-3.5 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2">
                                    <Label className="text-xs font-bold text-slate-300">Tag Prefix</Label>
                                    <Input
                                        value={parentalOptions.prefix || "IMDb"}
                                        onChange={(e) => setParentalOptions(prev => ({ ...prev, prefix: e.target.value }))}
                                        placeholder="e.g. IMDb, PG, Advisory"
                                        className="h-9 bg-slate-900 border-slate-700 text-xs font-semibold text-slate-200"
                                    />
                                    <p className="text-[11px] text-slate-500">Prefix used for identification and cleanup.</p>
                                </div>
                            </div>

                            {/* Advisory Categories Toggle Grid */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-300">Monitored Advisory Categories</Label>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                    {(["nudity", "violence", "profanity", "alcohol", "frightening"] as ParentalCategoryKey[]).map((cat) => {
                                        const info = PARENTAL_CATEGORY_INFO[cat];
                                        const enabled = parentalOptions.categories?.includes(cat);
                                        return (
                                            <div
                                                key={cat}
                                                onClick={() => {
                                                    setParentalOptions(prev => {
                                                        const current = prev.categories || [];
                                                        const next = current.includes(cat)
                                                            ? current.filter(c => c !== cat)
                                                            : [...current, cat];
                                                        return { ...prev, categories: next };
                                                    });
                                                }}
                                                className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between gap-2 ${
                                                    enabled
                                                        ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200 shadow-sm shadow-emerald-950/30"
                                                        : "bg-slate-950/50 border-slate-800/80 text-slate-400 hover:border-slate-700"
                                                }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <span className="text-base">{info.icon}</span>
                                                    <Switch
                                                        checked={enabled}
                                                        onCheckedChange={() => {}}
                                                        className="data-[state=checked]:bg-emerald-600"
                                                    />
                                                </div>
                                                <div>
                                                    <p className="text-xs font-bold text-slate-200">{info.label}</p>
                                                    <p className="text-[10px] text-slate-500 line-clamp-1">{info.description}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Status or Result Message */}
                            {parentalResult && (
                                <div className={`p-4 rounded-xl border flex items-start gap-3 ${
                                    parentalResult.success 
                                        ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200" 
                                        : "bg-rose-950/40 border-rose-500/40 text-rose-200"
                                }`}>
                                    {parentalResult.success ? (
                                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                                    )}
                                    <div className="space-y-1 text-xs">
                                        <p className="font-bold">{parentalResult.message}</p>
                                        {parentalResult.appliedTagsSummary && Object.keys(parentalResult.appliedTagsSummary).length > 0 && (
                                            <div className="flex flex-wrap gap-1.5 pt-1">
                                                {Object.entries(parentalResult.appliedTagsSummary).map(([tag, count]) => (
                                                    <Badge key={tag} variant="outline" className="text-[10px] bg-slate-900/80 border-emerald-500/40 text-emerald-300">
                                                        {tag}: {count}
                                                    </Badge>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Library Items Content Advisory Browser */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl">
                        <CardHeader className="pb-3 border-b border-slate-800/80">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                                        <span>Detected Content Advisories</span>
                                        <Badge variant="outline" className="border-slate-700 text-slate-400 text-xs">
                                            Showing {Math.min(filteredAdvisories.length, displayLimit)} of {advisoryItems.length} Items
                                        </Badge>
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Items cached with IMDb / TMDb parental guide severity ratings.
                                    </CardDescription>
                                </div>

                                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                    <div className="relative w-full sm:w-[200px]">
                                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                        <Input
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search items..."
                                            className="h-8 pl-8 bg-slate-950 border-slate-700 text-xs text-slate-200"
                                        />
                                    </div>
                                    <Select value={String(displayLimit)} onValueChange={(v) => setDisplayLimit(Number(v))}>
                                        <SelectTrigger className="h-8 bg-slate-950 border-slate-700 text-xs w-[105px] text-slate-300">
                                            <SelectValue placeholder="Show" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-slate-950 border-slate-800 text-white text-xs">
                                            <SelectItem value="10" className="text-xs">10 Items</SelectItem>
                                            <SelectItem value="50" className="text-xs">50 Items</SelectItem>
                                            <SelectItem value="100" className="text-xs">100 Items</SelectItem>
                                            <SelectItem value="200" className="text-xs">200 Items</SelectItem>
                                            <SelectItem value="1000" className="text-xs">All Items</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={loadAdvisoryItems}
                                        disabled={advisoryLoading}
                                        className="h-8 px-2.5 border-slate-700 bg-slate-950 text-slate-300 text-xs"
                                    >
                                        <RefreshCw className={`h-3.5 w-3.5 ${advisoryLoading ? "animate-spin" : ""}`} />
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>

                        <CardContent className="p-0">
                            {advisoryLoading ? (
                                <div className="p-12 text-center space-y-2">
                                    <Loader2 className="h-6 w-6 animate-spin text-emerald-400 mx-auto" />
                                    <p className="text-xs text-slate-400">Fetching library media content advisories...</p>
                                </div>
                            ) : filteredAdvisories.length === 0 ? (
                                <div className="p-12 text-center space-y-2 text-slate-500">
                                    <Shield className="h-8 w-8 mx-auto text-slate-600" />
                                    {searchQuery ? (
                                        <p className="text-xs">No media items matching &quot;{searchQuery}&quot; found in loaded library.</p>
                                    ) : (
                                        <p className="text-xs">No media advisories found. Click &quot;Tag Library&quot; to scan items.</p>
                                    )}
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
                                    {filteredAdvisories.slice(0, displayLimit).map((item) => (
                                        <div key={item.ratingKey} className="p-3.5 hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                            <div className="space-y-1 min-w-0 max-w-full">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-xs text-white truncate max-w-[200px] xs:max-w-[300px] sm:max-w-[420px]" title={item.title}>{item.title}</span>
                                                    {item.year && (
                                                        <span className="text-[10px] text-slate-400">({item.year})</span>
                                                    )}
                                                    {item.contentRating && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-700 text-slate-300 bg-slate-950 shrink-0">
                                                            {item.contentRating}
                                                        </Badge>
                                                    )}
                                                </div>
                                                {item.advisory?.summary && (
                                                    <p className="text-[11px] text-slate-400 line-clamp-1 italic">
                                                        &quot;{item.advisory.summary}&quot;
                                                    </p>
                                                )}
                                            </div>

                                            {/* Severity Badges */}
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {item.advisory ? (
                                                    (["nudity", "violence", "profanity", "alcohol", "frightening"] as ParentalCategoryKey[]).map((cat) => {
                                                        const sev = item.advisory[cat];
                                                        if (!sev || sev === "None") return null;
                                                        const isSevere = sev === "Severe";
                                                        const isMod = sev === "Moderate";
                                                        return (
                                                            <Badge
                                                                key={cat}
                                                                variant="outline"
                                                                className={`text-[10px] px-1.5 py-0 flex items-center gap-1 ${
                                                                    isSevere
                                                                        ? "border-rose-500/50 text-rose-300 bg-rose-950/40"
                                                                        : isMod
                                                                            ? "border-amber-500/50 text-amber-300 bg-amber-950/40"
                                                                            : "border-slate-700 text-slate-300 bg-slate-950"
                                                                }`}
                                                            >
                                                                <span>{PARENTAL_CATEGORY_INFO[cat].icon}</span>
                                                                <span className="capitalize">{cat}:</span>
                                                                <span className="font-bold">{sev}</span>
                                                            </Badge>
                                                        );
                                                    })
                                                ) : (
                                                    <span className="text-[11px] text-slate-500 italic">No advisory cached</span>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* TAB 2: Custom Tag Rules */}
            {subTab === "custom_rules" && (
                <div className="space-y-6">
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                        <Sliders className="h-5 w-5" />
                                    </div>
                                    <CardTitle className="text-lg font-bold text-white">
                                        Rule-Based Custom Media Auto-Tagger
                                    </CardTitle>
                                </div>
                                <CardDescription className="text-xs text-slate-400">
                                    Create rule-based tag filters (by Video Resolution, HDR, Audio Codecs, Studio, Decades, or Ratings) and apply them to Plex Labels, Genres, or Collections.
                                </CardDescription>
                            </div>
                        </CardHeader>

                        <CardContent className="p-6 space-y-6">
                            {/* Preset Quick-Rules */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-300">Quick-Fill Rule Presets</Label>
                                <div className="flex flex-wrap gap-2">
                                    {[
                                        { label: "4K UHD Media", tag: "4K UHD", field: "label" as const, filterType: "resolution" as const, filterValue: "4k" },
                                        { label: "Dolby Vision", tag: "Dolby Vision", field: "label" as const, filterType: "hdr" as const, filterValue: "DV" },
                                        { label: "Dolby Atmos Audio", tag: "Dolby Atmos", field: "label" as const, filterType: "audio" as const, filterValue: "atmos" },
                                        { label: "A24 Studio", tag: "A24", field: "collection" as const, filterType: "studio" as const, filterValue: "A24" },
                                        { label: "80s Cinema", tag: "80s Cinema", field: "genre" as const, filterType: "decade" as const, filterValue: "1980" },
                                        { label: "90s Cinema", tag: "90s Cinema", field: "genre" as const, filterType: "decade" as const, filterValue: "1990" },
                                        { label: "Top Rated (8.0+)", tag: "Top Rated", field: "collection" as const, filterType: "rating_above" as const, filterValue: "8.0" }
                                    ].map((preset) => (
                                        <Button
                                            key={preset.label}
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => {
                                                setCustomRule({
                                                    tagName: preset.tag,
                                                    field: preset.field,
                                                    filterType: preset.filterType,
                                                    filterValue: preset.filterValue
                                                });
                                            }}
                                            className="h-7 text-xs border-slate-700 bg-slate-950 text-slate-300 hover:text-emerald-300 hover:border-emerald-500/40"
                                        >
                                            <Sparkles className="mr-1.5 h-3 w-3 text-emerald-400" />
                                            {preset.label}
                                        </Button>
                                    ))}
                                </div>
                            </div>

                            {/* Rule Builder Form */}
                            <div className="p-4 bg-slate-950/70 border border-slate-800 rounded-xl space-y-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                    {/* Tag Name */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-slate-300">Tag Name to Apply</Label>
                                        <Input
                                            value={customRule.tagName}
                                            onChange={(e) => setCustomRule(prev => ({ ...prev, tagName: e.target.value }))}
                                            placeholder="e.g. 4K HDR, A24, Family Night"
                                            className="h-9 bg-slate-900 border-slate-700 text-xs font-semibold text-slate-200"
                                        />
                                    </div>

                                    {/* Target Field */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-slate-300">Plex Target Field</Label>
                                        <Select
                                            value={customRule.field}
                                            onValueChange={(val: any) => setCustomRule(prev => ({ ...prev, field: val }))}
                                        >
                                            <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-xs font-semibold text-slate-200">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-950 border-slate-800 text-slate-200">
                                                <SelectItem value="label" className="text-xs">Label (Plex Account Restriction)</SelectItem>
                                                <SelectItem value="genre" className="text-xs">Genre (Plex Client Category)</SelectItem>
                                                <SelectItem value="collection" className="text-xs">Collection (Plex Collection Tag)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Match Filter Condition */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-slate-300">Match Condition</Label>
                                        <Select
                                            value={customRule.filterType}
                                            onValueChange={(val: any) => setCustomRule(prev => ({ ...prev, filterType: val }))}
                                        >
                                            <SelectTrigger className="w-full bg-slate-900 border-slate-700 text-xs font-semibold text-slate-200">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-950 border-slate-800 text-slate-200">
                                                <SelectItem value="all" className="text-xs">All Items in Library</SelectItem>
                                                <SelectItem value="resolution" className="text-xs">Video Resolution (4k, 1080p, 720p)</SelectItem>
                                                <SelectItem value="hdr" className="text-xs">HDR / Dynamic Range (DV, HDR10+, HDR)</SelectItem>
                                                <SelectItem value="audio" className="text-xs">Audio Codec (atmos, truehd, dts)</SelectItem>
                                                <SelectItem value="studio" className="text-xs">Studio Name</SelectItem>
                                                <SelectItem value="decade" className="text-xs">Decade (1980, 1990, 2000, 2010)</SelectItem>
                                                <SelectItem value="contentRating" className="text-xs">Content Rating (G, PG, PG-13, R)</SelectItem>
                                                <SelectItem value="rating_above" className="text-xs">Rating Above (&gt;= X)</SelectItem>
                                                <SelectItem value="rating_below" className="text-xs">Rating Below (&lt; X)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Filter Value */}
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-bold text-slate-300">Match Value</Label>
                                        <Input
                                            value={customRule.filterValue || ""}
                                            onChange={(e) => setCustomRule(prev => ({ ...prev, filterValue: e.target.value }))}
                                            disabled={customRule.filterType === "all"}
                                            placeholder={
                                                customRule.filterType === "resolution" ? "e.g. 4k" :
                                                customRule.filterType === "hdr" ? "e.g. DV or HDR" :
                                                customRule.filterType === "audio" ? "e.g. atmos" :
                                                customRule.filterType === "studio" ? "e.g. Warner Bros" :
                                                customRule.filterType === "decade" ? "e.g. 1980" : "Value"
                                            }
                                            className="h-9 bg-slate-900 border-slate-700 text-xs font-semibold text-slate-200"
                                        />
                                    </div>
                                </div>

                                <div className="flex items-center justify-end gap-2.5 pt-2">
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleClearCustomTag(customRule.tagName, customRule.field)}
                                        disabled={customActionLoading || !customRule.tagName.trim() || !selectedSectionKey}
                                        className="h-9 text-xs border-rose-500/40 text-rose-300 bg-rose-950/20 hover:bg-rose-900/40 font-bold"
                                    >
                                        <Trash2 className="mr-1.5 h-3.5 w-3.5 text-rose-400" />
                                        Remove Tag
                                    </Button>

                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={handleApplyCustomRule}
                                        disabled={customActionLoading || !customRule.tagName.trim() || !selectedSectionKey}
                                        className="h-9 text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-lg shadow-emerald-950/40"
                                    >
                                        {customActionLoading ? (
                                            <>
                                                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                                                Applying Rule...
                                            </>
                                        ) : (
                                            <>
                                                <Play className="mr-1.5 h-3.5 w-3.5 fill-current" />
                                                Execute Tag Rule
                                            </>
                                        )}
                                    </Button>
                                </div>
                            </div>

                            {/* Result Message */}
                            {customResult && (
                                <div className={`p-4 rounded-xl border flex items-center gap-3 ${
                                    customResult.success 
                                        ? "bg-emerald-950/40 border-emerald-500/40 text-emerald-200" 
                                        : "bg-rose-950/40 border-rose-500/40 text-rose-200"
                                }`}>
                                    {customResult.success ? (
                                        <CheckCircle2 className="h-5 w-5 text-emerald-400 shrink-0" />
                                    ) : (
                                        <XCircle className="h-5 w-5 text-rose-400 shrink-0" />
                                    )}
                                    <p className="text-xs font-bold">{customResult.message}</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* TAB 3: Tag Audit & Cleanup */}
            {subTab === "audit" && (
                <div className="space-y-6">
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            <Tag className="h-5 w-5" />
                                        </div>
                                        <CardTitle className="text-lg font-bold text-white">
                                            Library Tag Audit &amp; Cleanup
                                        </CardTitle>
                                    </div>
                                    <CardDescription className="text-xs text-slate-400">
                                        Inspect all active Labels, Genres, and Collections applied on this Plex library. 1-click prune unwanted tags.
                                    </CardDescription>
                                </div>

                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={loadAuditData}
                                    disabled={auditLoading || !selectedSectionKey}
                                    className="h-8 border-slate-700 bg-slate-950 text-slate-200 text-xs font-bold"
                                >
                                    <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${auditLoading ? "animate-spin" : ""}`} />
                                    Refresh Audit
                                </Button>
                            </div>
                        </CardHeader>

                        <CardContent className="p-6">
                            {auditLoading ? (
                                <div className="p-12 text-center space-y-2">
                                    <Loader2 className="h-6 w-6 animate-spin text-emerald-400 mx-auto" />
                                    <p className="text-xs text-slate-400">Scanning library metadata tags...</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    {/* Labels Column */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                                                🏷️ Plex Labels ({auditData.labels.length})
                                            </h3>
                                        </div>
                                        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 max-h-[400px] overflow-y-auto">
                                            {auditData.labels.length === 0 ? (
                                                <p className="text-xs text-slate-500 italic p-4 text-center">No active labels found</p>
                                            ) : (
                                                auditData.labels.map(l => (
                                                    <div key={l.tag} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-slate-200">{l.tag}</span>
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-700 text-slate-400">
                                                                {l.count}
                                                            </Badge>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleClearCustomTag(l.tag, "label")}
                                                            className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                                            title="Remove label from library"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Genres Column */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">
                                                🎭 Plex Genres ({auditData.genres.length})
                                            </h3>
                                        </div>
                                        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 max-h-[400px] overflow-y-auto">
                                            {auditData.genres.length === 0 ? (
                                                <p className="text-xs text-slate-500 italic p-4 text-center">No active genres found</p>
                                            ) : (
                                                auditData.genres.map(g => (
                                                    <div key={g.tag} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-slate-200">{g.tag}</span>
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-700 text-slate-400">
                                                                {g.count}
                                                            </Badge>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleClearCustomTag(g.tag, "genre")}
                                                            className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                                            title="Remove genre from library"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>

                                    {/* Collections Column */}
                                    <div className="space-y-3">
                                        <div className="flex items-center justify-between">
                                            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400">
                                                📦 Collections ({auditData.collections.length})
                                            </h3>
                                        </div>
                                        <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-xl space-y-2 max-h-[400px] overflow-y-auto">
                                            {auditData.collections.length === 0 ? (
                                                <p className="text-xs text-slate-500 italic p-4 text-center">No collections found</p>
                                            ) : (
                                                auditData.collections.map(c => (
                                                    <div key={c.tag} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/60 hover:bg-slate-900 border border-slate-800/80 text-xs">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="font-semibold text-slate-200">{c.tag}</span>
                                                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-700 text-slate-400">
                                                                {c.count}
                                                            </Badge>
                                                        </div>
                                                        <button
                                                            type="button"
                                                            onClick={() => handleClearCustomTag(c.tag, "collection")}
                                                            className="text-slate-500 hover:text-rose-400 p-1 transition-colors"
                                                            title="Remove collection tag"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Manage Target Library Sections Modal */}
            <Dialog open={manageLibrariesModalOpen} onOpenChange={setManageLibrariesModalOpen}>
                <DialogContent className="max-w-lg bg-slate-900 border-slate-800 text-slate-100 p-6 space-y-4">
                    <DialogHeader className="pb-2 border-b border-slate-800">
                        <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                            <Layers className="h-5 w-5 text-emerald-400" />
                            <span>Configure Target Tagging Libraries</span>
                        </DialogTitle>
                        <DialogDescription className="text-xs text-slate-400">
                            Select which Plex library sections should receive automated content advisory labels, parental guide tags, and custom tag rules. Excluded sections are completely protected and will be skipped.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
                        {servers.map(srv => {
                            const srvSections = srv.sections || [];
                            return (
                                <div key={srv.serverId} className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-3">
                                    <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                                        <div className="flex items-center gap-2">
                                            <HardDrive className="h-4 w-4 text-cyan-400" />
                                            <span className="text-xs font-bold text-white">{srv.serverName}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleToggleAllSectionsForSpecificServer(srv.serverId, true)}
                                                className="h-6 text-[10px] px-2 text-emerald-400 hover:text-emerald-300 hover:bg-emerald-950/40"
                                            >
                                                Enable All
                                            </Button>
                                            <span className="text-slate-600">•</span>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => handleToggleAllSectionsForSpecificServer(srv.serverId, false)}
                                                className="h-6 text-[10px] px-2 text-rose-400 hover:text-rose-300 hover:bg-rose-950/40"
                                            >
                                                Disable All
                                            </Button>
                                        </div>
                                    </div>

                                    {srvSections.length > 0 ? (
                                        <div className="space-y-2">
                                            {srvSections.map(sec => {
                                                const enabled = isSectionEnabled(srv.serverId, String(sec.key));
                                                return (
                                                    <div
                                                        key={String(sec.key)}
                                                        className={`p-2.5 rounded-lg border flex items-center justify-between transition-all ${
                                                            enabled
                                                                ? "bg-emerald-950/20 border-emerald-600/40 text-emerald-200"
                                                                : "bg-slate-900/60 border-slate-800 text-slate-400"
                                                        }`}
                                                    >
                                                        <div className="flex items-center gap-2.5 min-w-0">
                                                            {sec.type === "movie" ? (
                                                                <Film className={`h-4 w-4 shrink-0 ${enabled ? "text-emerald-400" : "text-slate-500"}`} />
                                                            ) : (
                                                                <Tv className={`h-4 w-4 shrink-0 ${enabled ? "text-emerald-400" : "text-slate-500"}`} />
                                                            )}
                                                            <div className="min-w-0">
                                                                <span className="text-xs font-bold text-white block truncate">{sec.title}</span>
                                                                <span className="text-[10px] text-slate-400 font-mono">
                                                                    Section #{sec.key} • {sec.type === "movie" ? "Movies" : "TV Shows"}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <Badge className={`text-[10px] font-bold ${
                                                                enabled ? "bg-emerald-600 text-white" : "bg-slate-800 text-slate-400 border border-slate-700"
                                                            }`}>
                                                                {enabled ? "🟢 ACTIVE" : "⚪ EXCLUDED"}
                                                            </Badge>
                                                            <Switch
                                                                checked={enabled}
                                                                onCheckedChange={() => handleToggleSpecificSection(srv.serverId, String(sec.key))}
                                                            />
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <p className="text-xs text-slate-500 italic py-1">No library sections loaded for this server.</p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <DialogFooter className="pt-2 border-t border-slate-800">
                        <Button
                            type="button"
                            size="sm"
                            onClick={() => setManageLibrariesModalOpen(false)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
                        >
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* FLOATING UNSAVED CHANGES BAR */}
            {hasUnsavedChanges && (
                <div className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className="flex flex-col sm:flex-row items-center gap-3 bg-[#13131a]/95 backdrop-blur-xl border-2 border-amber-500/70 p-3.5 sm:px-5 sm:py-3.5 rounded-2xl shadow-[0_10px_35px_rgba(245,158,11,0.25)] text-foreground">
                        <div className="flex items-center gap-2.5">
                            <span className="relative flex h-3 w-3">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-amber-500"></span>
                            </span>
                            <div className="text-xs">
                                <span className="font-bold text-amber-400">Unsaved Settings ({unsavedSections.length})</span>
                                <p className="text-[10px] text-muted-foreground hidden sm:block max-w-[220px] truncate">
                                    {unsavedSections.join(", ")}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2 w-full sm:w-auto">
                            <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm" 
                                onClick={handleDiscardAllDirty}
                                disabled={isSavingAll}
                                className="h-8 text-xs text-muted-foreground hover:text-foreground hover:bg-white/5 cursor-pointer"
                            >
                                <RotateCcw className="h-3.5 w-3.5 mr-1" /> Discard
                            </Button>
                            <Button 
                                type="button" 
                                size="sm" 
                                onClick={handleSaveAllDirty}
                                disabled={isSavingAll}
                                className="h-8 text-xs font-bold bg-amber-500 hover:bg-amber-400 text-black shadow-md shadow-amber-500/20 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                            >
                                {isSavingAll ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                                Save All Changes
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
