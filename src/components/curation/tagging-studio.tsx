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
    Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CurationNavHeader } from "./curation-nav-header";
import {
    getPlexServersAndSectionsAction,
    getPlexServerSectionsAction,
    applyParentalTagsToLibraryAction,
    clearParentalTagsFromLibraryAction,
    getStoredParentalAdvisoriesForLibraryAction,
    applyCustomTagRuleAction,
    clearCustomTagFromLibraryAction,
    getPlexLibraryTagsAuditAction
} from "@/app/curation-actions";
import {
    ParentalCategoryKey,
    ParentalSeverity,
    ParentalTaggingOptions,
    PARENTAL_CATEGORY_INFO,
    SEVERITY_LEVELS,
    CustomTagRule
} from "@/lib/curation/parental-guide-types";

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

    // Initial Load: Fetch Plex Servers and Sections
    useEffect(() => {
        loadServers();
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

    async function loadServers() {
        setLoading(true);
        try {
            const res = await getPlexServersAndSectionsAction();
            if (res.success && res.servers && res.servers.length > 0) {
                setServers(res.servers);
                const firstServer = res.servers[0];
                setSelectedServerId(firstServer.serverId);
                if (firstServer.sections.length > 0) {
                    setSelectedSectionKey(String(firstServer.sections[0].key));
                }
            }
        } catch (e) {
            console.error("Failed loading servers:", e);
        } finally {
            setLoading(false);
        }
    }

    async function handleServerChange(newServerId: string) {
        setSelectedServerId(newServerId);
        setServerSectionsLoading(true);
        try {
            const res = await getPlexServerSectionsAction(newServerId);
            if (res.success && res.sections && res.sections.length > 0) {
                setSelectedSectionKey(String(res.sections[0].key));
            } else {
                setSelectedSectionKey("");
            }
        } catch (e) {
            console.error("Failed loading sections for server:", e);
        } finally {
            setServerSectionsLoading(false);
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
    const filteredAdvisories = advisoryItems.filter(item => 
        item.title.toLowerCase().includes(searchQuery.toLowerCase())
    );

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

            {/* Server & Library Selection Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 bg-slate-900/80 border border-slate-800 rounded-2xl shadow-md">
                <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
                    {/* Server Select */}
                    <div className="flex items-center gap-2">
                        <Label className="text-xs font-semibold text-slate-400">Server:</Label>
                        <Select
                            value={selectedServerId}
                            onValueChange={handleServerChange}
                            disabled={loading || servers.length === 0}
                        >
                            <SelectTrigger className="w-[180px] sm:w-[220px] bg-slate-950/80 border-slate-700 text-xs font-bold text-slate-200">
                                <SelectValue placeholder="Select Server" />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-950 border-slate-800 text-slate-200">
                                {servers.map(srv => (
                                    <SelectItem key={srv.serverId} value={srv.serverId} className="text-xs font-medium cursor-pointer">
                                        {srv.serverName}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Library Section Select */}
                    <div className="flex items-center gap-2">
                        <Label className="text-xs font-semibold text-slate-400">Library:</Label>
                        <Select
                            value={selectedSectionKey}
                            onValueChange={setSelectedSectionKey}
                            disabled={serverSectionsLoading || !currentServer || currentServer.sections.length === 0}
                        >
                            <SelectTrigger className="w-[180px] sm:w-[220px] bg-slate-950/80 border-slate-700 text-xs font-bold text-slate-200">
                                <SelectValue placeholder={serverSectionsLoading ? "Loading..." : "Select Library"} />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-950 border-slate-800 text-slate-200">
                                {currentServer?.sections.map(sec => (
                                    <SelectItem key={sec.key} value={String(sec.key)} className="text-xs font-medium cursor-pointer">
                                        {sec.type === "movie" ? "🎬 " : "📺 "} {sec.title}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                {/* Sub-Tabs Selector */}
                <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-slate-800/80 self-stretch md:self-auto overflow-x-auto">
                    <button
                        type="button"
                        onClick={() => setSubTab("parental")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subTab === "parental"
                                ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                    >
                        <Shield className="h-3.5 w-3.5 text-emerald-300" />
                        <span>IMDb Parental Guide</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setSubTab("custom_rules")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subTab === "custom_rules"
                                ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                    >
                        <Sliders className="h-3.5 w-3.5 text-emerald-300" />
                        <span>Custom Tag Rules</span>
                    </button>

                    <button
                        type="button"
                        onClick={() => setSubTab("audit")}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            subTab === "audit"
                                ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/40"
                                : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                        }`}
                    >
                        <Tag className="h-3.5 w-3.5 text-emerald-300" />
                        <span>Tag Audit &amp; Cleanup</span>
                    </button>
                </div>
            </div>

            {/* TAB 1: IMDb Parental Guide */}
            {subTab === "parental" && (
                <div className="space-y-6">
                    {/* Action & Configuration Card */}
                    <Card className="bg-slate-900/90 border-slate-800 shadow-xl">
                        <CardHeader className="pb-4 border-b border-slate-800/80">
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                                            <Shield className="h-5 w-5" />
                                        </div>
                                        <CardTitle className="text-lg font-bold text-white">
                                            IMDb Content Advisory &amp; Parental Tagging
                                        </CardTitle>
                                    </div>
                                    <CardDescription className="text-xs text-slate-400">
                                        Scan media items, query IMDb parental ratings via AI/TMDb, and tag items with standardized content advisory labels.
                                    </CardDescription>
                                </div>

                                <div className="flex items-center gap-2.5">
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
                                            <SelectValue />
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
                                            <SelectValue />
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
                                            <SelectValue />
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
                                            {advisoryItems.length} Items Loaded
                                        </Badge>
                                    </CardTitle>
                                    <CardDescription className="text-xs text-slate-400">
                                        Items cached with IMDb / TMDb parental guide severity ratings.
                                    </CardDescription>
                                </div>

                                <div className="flex items-center gap-2 w-full sm:w-auto">
                                    <div className="relative w-full sm:w-[220px]">
                                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                                        <Input
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search items..."
                                            className="h-8 pl-8 bg-slate-950 border-slate-700 text-xs text-slate-200"
                                        />
                                    </div>
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
                                    <p className="text-xs">No media advisories found. Click &quot;Tag Library&quot; to scan items.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
                                    {filteredAdvisories.slice(0, 100).map((item) => (
                                        <div key={item.ratingKey} className="p-3.5 hover:bg-slate-800/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-xs text-white">{item.title}</span>
                                                    {item.year && (
                                                        <span className="text-[10px] text-slate-400">({item.year})</span>
                                                    )}
                                                    {item.contentRating && (
                                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-700 text-slate-300 bg-slate-950">
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
        </div>
    );
}
