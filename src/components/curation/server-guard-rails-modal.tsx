"use client";

import React, { useState, useEffect } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@/components/ui/select";
import {
    Shield,
    ShieldAlert,
    ShieldCheck,
    Lock,
    Unlock,
    HardDrive,
    Sparkles,
    Check,
    X,
    Plus,
    AlertTriangle,
    Sliders,
    Baby,
    Users,
    UserCheck,
    HelpCircle,
    Info,
    Loader2,
    Save
} from "lucide-react";
import {
    ServerGuardRailConfig,
    GuardRailPresetKey,
    ParentalSeverity,
    ParentalCategoryKey,
    PARENTAL_CATEGORY_INFO,
    KID_SAFE_GUARD_RAIL_PRESET,
    FAMILY_GUARD_RAIL_PRESET,
    TEEN_GUARD_RAIL_PRESET,
    UNRESTRICTED_GUARD_RAIL_PRESET
} from "@/lib/curation/parental-guide-types";
import {
    getServerGuardRailsAction,
    saveServerGuardRailConfigAction,
    saveAllServerGuardRailsAction
} from "@/app/curation-actions";

export interface PlexServerItem {
    serverId: string;
    serverName: string;
}

interface ServerGuardRailsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    servers: PlexServerItem[];
    initialServerId?: string;
    onSaved?: () => void;
}

const COMMON_RATINGS = [
    "G", "TV-Y", "TV-Y7", "TV-G",
    "PG", "TV-PG",
    "PG-13", "TV-14", "12", "12A",
    "R", "TV-MA", "15", "16",
    "NC-17", "18", "X", "NR", "UR"
];

const COMMON_GENRES = [
    "Horror", "Erotica", "Thriller", "War", "Crime", 
    "Mystery", "Action", "Romance", "Drama", "Animation", "Family"
];

export function ServerGuardRailsModal({
    open,
    onOpenChange,
    servers = [],
    initialServerId,
    onSaved
}: ServerGuardRailsModalProps) {
    const [selectedServerId, setSelectedServerId] = useState<string>("");
    const [guardRailsMap, setGuardRailsMap] = useState<Record<string, ServerGuardRailConfig>>({});
    const [loading, setLoading] = useState<boolean>(true);
    const [saving, setSaving] = useState<boolean>(false);
    const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);
    const [newKeyword, setNewKeyword] = useState<string>("");
    const [newGenre, setNewGenre] = useState<string>("");

    // Initialize selected server
    useEffect(() => {
        if (open) {
            const firstSrvId = initialServerId || (servers.length > 0 ? servers[0].serverId : "");
            if (firstSrvId && (!selectedServerId || !servers.some(s => s.serverId === selectedServerId))) {
                setSelectedServerId(firstSrvId);
            }
            loadGuardRails();
        }
    }, [open, initialServerId, servers]);

    const loadGuardRails = async () => {
        setLoading(true);
        try {
            const res = await getServerGuardRailsAction();
            if (res.success && res.guardRails) {
                setGuardRailsMap(res.guardRails);
            }
        } catch (e) {
            console.error("Failed loading guard rails:", e);
        } finally {
            setLoading(false);
        }
    };

    const activeServer = servers.find(s => s.serverId === selectedServerId) || {
        serverId: selectedServerId || "main",
        serverName: "Plex Server"
    };

    const activeConfig: ServerGuardRailConfig = guardRailsMap[selectedServerId] || {
        ...(selectedServerId.toLowerCase().includes("kid") || activeServer.serverName.toLowerCase().includes("kid")
            ? KID_SAFE_GUARD_RAIL_PRESET
            : UNRESTRICTED_GUARD_RAIL_PRESET),
        serverId: selectedServerId,
        serverName: activeServer.serverName
    };

    const updateActiveConfig = (updates: Partial<ServerGuardRailConfig>) => {
        if (!selectedServerId) return;
        setGuardRailsMap(prev => ({
            ...prev,
            [selectedServerId]: {
                ...activeConfig,
                ...updates,
                serverId: selectedServerId,
                serverName: activeServer.serverName
            }
        }));
    };

    const applyPreset = (presetKey: GuardRailPresetKey) => {
        let presetData: Omit<ServerGuardRailConfig, "serverId">;
        switch (presetKey) {
            case "kid_safe":
                presetData = KID_SAFE_GUARD_RAIL_PRESET;
                break;
            case "family":
                presetData = FAMILY_GUARD_RAIL_PRESET;
                break;
            case "teen":
                presetData = TEEN_GUARD_RAIL_PRESET;
                break;
            case "unrestricted":
            default:
                presetData = UNRESTRICTED_GUARD_RAIL_PRESET;
                break;
        }

        updateActiveConfig({
            ...presetData,
            preset: presetKey
        });
    };

    const toggleBlockedRating = (rating: string) => {
        const current = activeConfig.blockedRatings || [];
        const norm = rating.toUpperCase();
        let next: string[];
        if (current.some(r => r.toUpperCase() === norm)) {
            next = current.filter(r => r.toUpperCase() !== norm);
        } else {
            next = [...current, rating];
        }
        updateActiveConfig({ blockedRatings: next, preset: "custom" });
    };

    const toggleBlockedGenre = (genre: string) => {
        const current = activeConfig.blockedGenres || [];
        const norm = genre.toLowerCase();
        let next: string[];
        if (current.some(g => g.toLowerCase() === norm)) {
            next = current.filter(g => g.toLowerCase() !== norm);
        } else {
            next = [...current, genre];
        }
        updateActiveConfig({ blockedGenres: next, preset: "custom" });
    };

    const addCustomGenre = () => {
        if (!newGenre.trim()) return;
        const current = activeConfig.blockedGenres || [];
        if (!current.some(g => g.toLowerCase() === newGenre.trim().toLowerCase())) {
            updateActiveConfig({
                blockedGenres: [...current, newGenre.trim()],
                preset: "custom"
            });
        }
        setNewGenre("");
    };

    const addCustomKeyword = () => {
        if (!newKeyword.trim()) return;
        const current = activeConfig.blockedKeywords || [];
        if (!current.some(k => k.toLowerCase() === newKeyword.trim().toLowerCase())) {
            updateActiveConfig({
                blockedKeywords: [...current, newKeyword.trim()],
                preset: "custom"
            });
        }
        setNewKeyword("");
    };

    const removeKeyword = (kw: string) => {
        const current = activeConfig.blockedKeywords || [];
        updateActiveConfig({
            blockedKeywords: current.filter(k => k.toLowerCase() !== kw.toLowerCase()),
            preset: "custom"
        });
    };

    const handleSave = async () => {
        setSaving(true);
        setSaveSuccessMsg(null);
        try {
            const res = await saveServerGuardRailConfigAction({
                ...activeConfig,
                serverId: selectedServerId,
                serverName: activeServer.serverName
            });
            if (res.success) {
                setSaveSuccessMsg(`Saved strict guard rails for "${activeServer.serverName}"!`);
                setTimeout(() => setSaveSuccessMsg(null), 3500);
                if (onSaved) onSaved();
            } else {
                alert(`Failed to save: ${res.error}`);
            }
        } catch (e: any) {
            alert(`Error saving guard rails: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    const handleSaveAll = async () => {
        setSaving(true);
        setSaveSuccessMsg(null);
        try {
            const res = await saveAllServerGuardRailsAction(guardRailsMap);
            if (res.success) {
                setSaveSuccessMsg("Successfully saved guard rail policies across all servers!");
                setTimeout(() => setSaveSuccessMsg(null), 3500);
                if (onSaved) onSaved();
            } else {
                alert(`Failed saving all servers: ${res.error}`);
            }
        } catch (e: any) {
            alert(`Error: ${e.message}`);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[92vh] bg-slate-950 border-slate-800 text-white flex flex-col p-6 overflow-hidden shadow-2xl shadow-purple-950/40">
                {/* Header */}
                <DialogHeader className="pb-3 border-b border-slate-800/80 shrink-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                            <DialogTitle className="text-xl font-black flex items-center gap-2 text-white">
                                <div className="p-1.5 rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                    <ShieldCheck className="h-5 w-5" />
                                </div>
                                <span>Strict Server Guard Rails</span>
                                <Badge variant="outline" className="border-purple-500/40 text-purple-300 bg-purple-950/40 text-[10px] ml-1.5 font-bold">
                                    Per-Server Isolation
                                </Badge>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-400 flex items-center gap-1.5 mt-0.5">
                                <span>Configure strict content rating ceilings, blocked ratings, genres, and parental severity levels per Plex server.</span>
                            </DialogDescription>
                        </div>

                        {/* Server Dropdown Switcher */}
                        {servers.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Select value={selectedServerId} onValueChange={setSelectedServerId}>
                                    <SelectTrigger className="h-9 bg-slate-900 border-slate-800 text-xs w-[190px] text-slate-200">
                                        <HardDrive className="h-3.5 w-3.5 text-purple-400 mr-1.5 shrink-0" />
                                        <SelectValue placeholder="Select Server" />
                                    </SelectTrigger>
                                    <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                        {servers.map(s => {
                                            const cfg = guardRailsMap[s.serverId];
                                            const isGuarded = cfg?.enabled;
                                            return (
                                                <SelectItem key={s.serverId} value={s.serverId} className="text-xs">
                                                    <div className="flex items-center justify-between gap-2 w-full">
                                                        <span>{s.serverName}</span>
                                                        {isGuarded && (
                                                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold shrink-0">
                                                                🛡️ {cfg.maxRating}
                                                            </span>
                                                        )}
                                                    </div>
                                                </SelectItem>
                                            );
                                        })}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </DialogHeader>

                {/* Save Feedback Banner */}
                {saveSuccessMsg && (
                    <div className="p-2.5 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in shrink-0">
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span className="font-semibold">{saveSuccessMsg}</span>
                    </div>
                )}

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto pr-1 -mr-1 space-y-5 py-2">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-2 text-slate-400">
                            <Loader2 className="h-8 w-8 animate-spin text-purple-400" />
                            <p className="text-xs">Loading guard rail configurations...</p>
                        </div>
                    ) : (
                        <>
                            {/* Server Master Switch Card */}
                            <div className={`p-4 rounded-2xl border transition-all ${
                                activeConfig.enabled
                                    ? "bg-gradient-to-r from-purple-950/40 via-slate-900/90 to-slate-900/90 border-purple-500/40 shadow-lg shadow-purple-950/20"
                                    : "bg-slate-900/50 border-slate-800"
                            }`}>
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl border ${
                                            activeConfig.enabled
                                                ? "bg-purple-600/20 text-purple-400 border-purple-500/40"
                                                : "bg-slate-800 text-slate-400 border-slate-700"
                                        }`}>
                                            {activeConfig.enabled ? <ShieldCheck className="h-6 w-6" /> : <ShieldAlert className="h-6 w-6" />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h3 className="text-sm font-black text-white">
                                                    Strict Guard Rails for &ldquo;{activeServer.serverName}&rdquo;
                                                </h3>
                                                {activeConfig.enabled ? (
                                                    <Badge className="bg-emerald-600 text-white font-bold text-[10px] px-2 py-0.5">
                                                        ACTIVE &amp; ENFORCED
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline" className="border-slate-700 text-slate-400 text-[10px]">
                                                        DISABLED (UNRESTRICTED)
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-xs text-slate-400 mt-0.5">
                                                When enabled, media exceeding this server&apos;s ratings or severity limits are strictly blocked across search, simulation, and curation.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <Label htmlFor="guard-rail-toggle" className="text-xs font-bold cursor-pointer text-slate-300">
                                            {activeConfig.enabled ? "Enabled" : "Disabled"}
                                        </Label>
                                        <Switch
                                            id="guard-rail-toggle"
                                            checked={activeConfig.enabled}
                                            onCheckedChange={(val) => updateActiveConfig({ enabled: val })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* 1-Click Guard Rail Presets */}
                            <div className="space-y-2">
                                <Label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                                    <Sparkles className="h-3.5 w-3.5 text-purple-400" />
                                    <span>1-Click Guard Rail Profiles</span>
                                </Label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                                    {/* Kid Safe */}
                                    <button
                                        type="button"
                                        onClick={() => applyPreset("kid_safe")}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            activeConfig.preset === "kid_safe"
                                                ? "bg-purple-950/80 border-purple-500 ring-1 ring-purple-500/50 shadow-md shadow-purple-950/60"
                                                : "bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-lg">👶</span>
                                            {activeConfig.preset === "kid_safe" && <Check className="h-3.5 w-3.5 text-purple-400" />}
                                        </div>
                                        <div className="text-xs font-black text-white">Kid-Safe Mode</div>
                                        <div className="text-[10px] text-purple-300/80 font-bold mt-0.5">Max G / TV-Y7</div>
                                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                                            Toddlers &amp; young kids. Zero adult themes, horror, or violence.
                                        </p>
                                    </button>

                                    {/* Family Safe */}
                                    <button
                                        type="button"
                                        onClick={() => applyPreset("family")}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            activeConfig.preset === "family"
                                                ? "bg-emerald-950/80 border-emerald-500 ring-1 ring-emerald-500/50 shadow-md shadow-emerald-950/60"
                                                : "bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-lg">👨‍👩‍👧‍👦</span>
                                            {activeConfig.preset === "family" && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                                        </div>
                                        <div className="text-xs font-black text-white">Family-Safe</div>
                                        <div className="text-[10px] text-emerald-300/80 font-bold mt-0.5">Max PG / TV-PG</div>
                                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                                            Pre-teens &amp; family living room. Blocks PG-13, R, TV-MA.
                                        </p>
                                    </button>

                                    {/* Teen Friendly */}
                                    <button
                                        type="button"
                                        onClick={() => applyPreset("teen")}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            activeConfig.preset === "teen"
                                                ? "bg-amber-950/80 border-amber-500 ring-1 ring-amber-500/50 shadow-md shadow-amber-950/60"
                                                : "bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-lg">🧑‍🎤</span>
                                            {activeConfig.preset === "teen" && <Check className="h-3.5 w-3.5 text-amber-400" />}
                                        </div>
                                        <div className="text-xs font-black text-white">Teen-Friendly</div>
                                        <div className="text-[10px] text-amber-300/80 font-bold mt-0.5">Max PG-13 / TV-14</div>
                                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                                            Teens &amp; high school. Blocks Rated R, NC-17, TV-MA.
                                        </p>
                                    </button>

                                    {/* Unrestricted */}
                                    <button
                                        type="button"
                                        onClick={() => applyPreset("unrestricted")}
                                        className={`p-3 rounded-xl border text-left transition-all ${
                                            activeConfig.preset === "unrestricted" || (!activeConfig.enabled && activeConfig.maxRating === "UNRESTRICTED")
                                                ? "bg-slate-900 border-slate-600 ring-1 ring-slate-500 shadow-md"
                                                : "bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-lg">🔓</span>
                                            {(activeConfig.preset === "unrestricted" || (!activeConfig.enabled && activeConfig.maxRating === "UNRESTRICTED")) && (
                                                <Check className="h-3.5 w-3.5 text-slate-300" />
                                            )}
                                        </div>
                                        <div className="text-xs font-black text-white">Unrestricted</div>
                                        <div className="text-[10px] text-slate-400 font-bold mt-0.5">All Ratings Allowed</div>
                                        <p className="text-[10px] text-slate-400 mt-1 line-clamp-2">
                                            Full unrestricted adult access. No guard rail filters applied.
                                        </p>
                                    </button>
                                </div>
                            </div>

                            {/* Detailed Policy Controls */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Left Column: Rating Ceiling & Blocked Ratings */}
                                <div className="space-y-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                                            <span>Content Rating Ceiling (Max Allowed)</span>
                                            <Badge variant="outline" className="text-[10px] border-purple-500/40 text-purple-300">
                                                Ceiling: {activeConfig.maxRating}
                                            </Badge>
                                        </Label>
                                        <Select
                                            value={activeConfig.maxRating}
                                            onValueChange={(val) => updateActiveConfig({ maxRating: val, preset: "custom" })}
                                        >
                                            <SelectTrigger className="h-9 bg-slate-950 border-slate-800 text-xs text-slate-100">
                                                <SelectValue placeholder="Select Rating Ceiling" />
                                            </SelectTrigger>
                                            <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                                <SelectItem value="G" className="text-xs">G / TV-Y / TV-G (Toddlers &amp; All Ages)</SelectItem>
                                                <SelectItem value="PG" className="text-xs">PG / TV-PG (Children &amp; Family)</SelectItem>
                                                <SelectItem value="PG-13" className="text-xs">PG-13 / TV-14 (Teens &amp; Young Adults)</SelectItem>
                                                <SelectItem value="R" className="text-xs">R / TV-MA (Mature &amp; Adults 17+)</SelectItem>
                                                <SelectItem value="NC-17" className="text-xs">NC-17 / 18+ (Adults Only 18+)</SelectItem>
                                                <SelectItem value="UNRESTRICTED" className="text-xs">UNRESTRICTED (No Rating Ceiling)</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    {/* Block Unrated Toggle */}
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                                        <div>
                                            <div className="text-xs font-bold text-slate-200">Block Unrated &amp; NR Titles</div>
                                            <div className="text-[10px] text-slate-400">Strictly exclude items with missing rating or &ldquo;NR/UR&rdquo; tags</div>
                                        </div>
                                        <Switch
                                            checked={activeConfig.blockUnrated}
                                            onCheckedChange={(val) => updateActiveConfig({ blockUnrated: val, preset: "custom" })}
                                        />
                                    </div>

                                    {/* Blocked Ratings Tag Selector */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                                            <span>Explicitly Blocked Content Ratings</span>
                                            <span className="text-[10px] text-slate-400">Tap to toggle block</span>
                                        </Label>
                                        <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 min-h-[50px]">
                                            {COMMON_RATINGS.map(r => {
                                                const isBlocked = activeConfig.blockedRatings?.some(br => br.toUpperCase() === r.toUpperCase());
                                                return (
                                                    <button
                                                        key={r}
                                                        type="button"
                                                        onClick={() => toggleBlockedRating(r)}
                                                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all border ${
                                                            isBlocked
                                                                ? "bg-rose-950/90 text-rose-300 border-rose-500 shadow-sm"
                                                                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                                                        }`}
                                                    >
                                                        {isBlocked ? `🚫 ${r}` : r}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>

                                {/* Right Column: Parental Severities & Genres */}
                                <div className="space-y-4 p-4 rounded-2xl bg-slate-900/60 border border-slate-800">
                                    {/* IMDb Parental Advisory Maximum Severities */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                                            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
                                            <span>IMDb Parental Advisory Severity Limits</span>
                                        </Label>
                                        <div className="space-y-2 p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                                            {(["nudity", "violence", "profanity", "alcohol", "frightening"] as ParentalCategoryKey[]).map(cat => {
                                                const info = PARENTAL_CATEGORY_INFO[cat];
                                                const currentVal = activeConfig.maxParentalSeverity?.[cat] || "Severe";
                                                return (
                                                    <div key={cat} className="flex items-center justify-between gap-2 text-xs">
                                                        <span className="text-slate-300 flex items-center gap-1.5">
                                                            <span>{info.icon}</span>
                                                            <span className="font-semibold">{info.label}</span>
                                                        </span>
                                                        <Select
                                                            value={currentVal}
                                                            onValueChange={(newSev: ParentalSeverity) => {
                                                                updateActiveConfig({
                                                                    maxParentalSeverity: {
                                                                        ...activeConfig.maxParentalSeverity,
                                                                        [cat]: newSev
                                                                    },
                                                                    preset: "custom"
                                                                });
                                                            }}
                                                        >
                                                            <SelectTrigger className="h-7 bg-slate-900 border-slate-800 text-[11px] w-[110px] text-slate-200">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent className="bg-slate-900 border-slate-800 text-white text-xs">
                                                                <SelectItem value="None" className="text-xs text-emerald-400 font-bold">Max None</SelectItem>
                                                                <SelectItem value="Mild" className="text-xs text-amber-400 font-bold">Max Mild</SelectItem>
                                                                <SelectItem value="Moderate" className="text-xs text-orange-400 font-bold">Max Moderate</SelectItem>
                                                                <SelectItem value="Severe" className="text-xs text-rose-400 font-bold">Max Severe (All)</SelectItem>
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Blocked Genres */}
                                    <div className="space-y-2">
                                        <Label className="text-xs font-bold text-slate-200">
                                            Blocked Genres
                                        </Label>
                                        <div className="flex flex-wrap gap-1.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800">
                                            {COMMON_GENRES.map(g => {
                                                const isBlocked = activeConfig.blockedGenres?.some(bg => bg.toLowerCase() === g.toLowerCase());
                                                return (
                                                    <button
                                                        key={g}
                                                        type="button"
                                                        onClick={() => toggleBlockedGenre(g)}
                                                        className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all border ${
                                                            isBlocked
                                                                ? "bg-rose-950/90 text-rose-300 border-rose-500 shadow-sm"
                                                                : "bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                                                        }`}
                                                    >
                                                        {isBlocked ? `🚫 ${g}` : g}
                                                    </button>
                                                );
                                            })}
                                        </div>

                                        {/* Add Custom Genre Input */}
                                        <div className="flex items-center gap-1.5 mt-1.5">
                                            <Input
                                                value={newGenre}
                                                onChange={(e) => setNewGenre(e.target.value)}
                                                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomGenre(); } }}
                                                placeholder="Add custom blocked genre (e.g. Slasher)..."
                                                className="bg-slate-950 border-slate-800 text-xs h-7 text-slate-200 rounded-lg placeholder:text-slate-500"
                                            />
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={addCustomGenre}
                                                className="h-7 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:text-white shrink-0 px-2.5"
                                            >
                                                <Plus className="h-3.5 w-3.5 mr-1" /> Add
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Blocked Keywords & Custom Title Filter */}
                            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-2">
                                <Label className="text-xs font-bold text-slate-200 flex items-center justify-between">
                                    <span>Custom Keyword Blocklist (Title Matches)</span>
                                    <span className="text-[10px] text-slate-400">Case-insensitive substring match</span>
                                </Label>
                                <div className="flex items-center gap-2">
                                    <Input
                                        value={newKeyword}
                                        onChange={(e) => setNewKeyword(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomKeyword(); } }}
                                        placeholder="Add keyword or phrase to block (e.g. Deadpool, Saw, Fifty Shades)..."
                                        className="bg-slate-950 border-slate-800 text-xs h-8 text-slate-200 rounded-xl placeholder:text-slate-500"
                                    />
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={addCustomKeyword}
                                        className="h-8 text-xs bg-purple-600 hover:bg-purple-500 text-white shrink-0 px-3 rounded-xl font-bold"
                                    >
                                        <Plus className="h-3.5 w-3.5 mr-1" /> Add Keyword
                                    </Button>
                                </div>

                                {activeConfig.blockedKeywords && activeConfig.blockedKeywords.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                        {activeConfig.blockedKeywords.map(kw => (
                                            <span
                                                key={kw}
                                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-rose-950/80 border border-rose-500/50 text-rose-300 text-[11px] font-bold"
                                            >
                                                <span>🚫 {kw}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => removeKeyword(kw)}
                                                    className="hover:text-white"
                                                >
                                                    <X className="h-3 w-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Enforcement Scopes */}
                            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-3">
                                <Label className="text-xs font-bold text-slate-200">
                                    Enforcement Scopes &amp; Protection
                                </Label>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                                        <div>
                                            <div className="text-xs font-bold text-slate-200">Search &amp; Simulator</div>
                                            <div className="text-[10px] text-slate-400">Strictly filter poster picker</div>
                                        </div>
                                        <Switch
                                            checked={activeConfig.enforceInSearch}
                                            onCheckedChange={(val) => updateActiveConfig({ enforceInSearch: val })}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                                        <div>
                                            <div className="text-xs font-bold text-slate-200">Collections &amp; Hubs</div>
                                            <div className="text-[10px] text-slate-400">Prevent adult collection items</div>
                                        </div>
                                        <Switch
                                            checked={activeConfig.enforceInCuration}
                                            onCheckedChange={(val) => updateActiveConfig({ enforceInCuration: val })}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                                        <div>
                                            <div className="text-xs font-bold text-slate-200">Storage Prune Shield</div>
                                            <div className="text-[10px] text-slate-400">Protect kid media from cleanup</div>
                                        </div>
                                        <Switch
                                            checked={activeConfig.enforceInPruning}
                                            onCheckedChange={(val) => updateActiveConfig({ enforceInPruning: val })}
                                        />
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
                    <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                        <Info className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                        <span>Changes take effect immediately across all curation workflows for {activeServer.serverName}.</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => onOpenChange(false)}
                            className="h-9 text-xs border-slate-800 bg-slate-900 text-slate-300 hover:text-white"
                        >
                            Close
                        </Button>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleSave}
                            disabled={saving}
                            className="h-9 text-xs bg-purple-600 hover:bg-purple-500 text-white font-bold px-4 rounded-xl shadow-lg shadow-purple-950/60"
                        >
                            {saving ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                                    <span>Saving...</span>
                                </>
                            ) : (
                                <>
                                    <Save className="h-3.5 w-3.5 mr-1.5" />
                                    <span>Save &amp; Apply Guard Rails</span>
                                </>
                            )}
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
