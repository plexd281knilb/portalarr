"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
    Tag, 
    ShieldAlert, 
    Sparkles, 
    Clock, 
    Check, 
    Plus, 
    X, 
    Search, 
    Trash2, 
    RefreshCw, 
    Film, 
    AlertTriangle,
    Layers,
    Sliders
} from "lucide-react";
import { getPlexLibraryTagsAuditAction } from "@/app/curation-actions";

export interface PortalarrCurationLabelDefinition {
    id: string;
    tag: string;
    label: string;
    category: "parental" | "placeholders" | "prune" | "quality";
    categoryTitle: string;
    icon: string;
    color: "rose" | "orange" | "amber" | "sky" | "cyan" | "indigo" | "purple" | "emerald" | "slate";
    description?: string;
    aliases?: string[];
}

export const PORTALARR_CURATION_LABELS: PortalarrCurationLabelDefinition[] = [
    // 1. IMDb Parental Guide Advisories (from Tagging Studio)
    // Sex & Nudity
    { 
        id: "nudity_severe", 
        tag: "IMDb-Nudity: Severe", 
        label: "🔞 Nudity: Severe", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🔞", 
        color: "rose", 
        description: "Explicit sex, nudity, or graphic intimacy",
        aliases: ["nudity severe", "Severe Nudity", "Nudity (Severe)", "nudity: severe"]
    },
    { 
        id: "nudity_moderate", 
        tag: "IMDb-Nudity: Moderate", 
        label: "🔞 Nudity: Moderate", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🔞", 
        color: "orange", 
        description: "Brief nudity, suggestive scenes, or sexual dialogue",
        aliases: ["nudity moderate", "Moderate Nudity", "Nudity (Moderate)"]
    },
    { 
        id: "nudity_mild", 
        tag: "IMDb-Nudity: Mild", 
        label: "🔞 Nudity: Mild", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🔞", 
        color: "amber", 
        description: "Suggestive themes, swimwear, or kissing",
        aliases: ["nudity mild", "Mild Nudity", "Nudity (Mild)"]
    },

    // Violence & Gore
    { 
        id: "violence_severe", 
        tag: "IMDb-Violence: Severe", 
        label: "🩸 Violence: Severe", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🩸", 
        color: "rose", 
        description: "Graphic combat, bloodshed, gore, mutilation, and weapons",
        aliases: ["violence severe", "Severe Violence", "Violence (Severe)"]
    },
    { 
        id: "violence_moderate", 
        tag: "IMDb-Violence: Moderate", 
        label: "🩸 Violence: Moderate", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🩸", 
        color: "orange", 
        description: "Action fighting, peril, non-graphic weapons or blood",
        aliases: ["violence moderate", "Moderate Violence", "Violence (Moderate)"]
    },
    { 
        id: "violence_mild", 
        tag: "IMDb-Violence: Mild", 
        label: "🩸 Violence: Mild", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🩸", 
        color: "amber", 
        description: "Comedic slapstick, martial arts, or fantasy skirmishes",
        aliases: ["violence mild", "Mild Violence", "Violence (Mild)"]
    },

    // Profanity
    { 
        id: "profanity_severe", 
        tag: "IMDb-Profanity: Severe", 
        label: "🤬 Profanity: Severe", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🤬", 
        color: "rose", 
        description: "Frequent explicit language, severe slurs, and obscenities",
        aliases: ["profanity severe", "Severe Profanity", "Profanity (Severe)"]
    },
    { 
        id: "profanity_moderate", 
        tag: "IMDb-Profanity: Moderate", 
        label: "🤬 Profanity: Moderate", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🤬", 
        color: "orange", 
        description: "Occasional strong language or vulgar terms",
        aliases: ["profanity moderate", "Moderate Profanity", "Profanity (Moderate)"]
    },

    // Alcohol, Drugs & Smoking
    { 
        id: "alcohol_severe", 
        tag: "IMDb-Alcohol: Severe", 
        label: "🍷 Alcohol/Drugs: Severe", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🍷", 
        color: "rose", 
        description: "Heavy substance abuse, illicit narcotics, overdose, or addiction",
        aliases: ["alcohol severe", "Severe Alcohol", "Alcohol (Severe)"]
    },
    { 
        id: "alcohol_moderate", 
        tag: "IMDb-Alcohol: Moderate", 
        label: "🍷 Alcohol/Drugs: Moderate", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "🍷", 
        color: "orange", 
        description: "Social alcohol consumption, smoking, or recreational use",
        aliases: ["alcohol moderate", "Moderate Alcohol", "Alcohol (Moderate)"]
    },

    // Frightening & Intense Scenes
    { 
        id: "frightening_severe", 
        tag: "IMDb-Frightening: Severe", 
        label: "😱 Frightening: Severe", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "😱", 
        color: "rose", 
        description: "Extreme terror, intense jumpscares, claustrophobia, or horror",
        aliases: ["frightening severe", "Severe Frightening", "Frightening (Severe)"]
    },
    { 
        id: "frightening_moderate", 
        tag: "IMDb-Frightening: Moderate", 
        label: "😱 Frightening: Moderate", 
        category: "parental", 
        categoryTitle: "Parental Advisories", 
        icon: "😱", 
        color: "orange", 
        description: "Suspense, thriller scenes, or eerie atmosphere",
        aliases: ["frightening moderate", "Moderate Frightening", "Frightening (Moderate)"]
    },

    // 2. Coming Soon & Trailer Placeholders (from Agregarr Studio)
    { 
        id: "trailer_placeholder", 
        tag: "trailer-placeholder", 
        label: "🎬 Trailer Placeholder", 
        category: "placeholders", 
        categoryTitle: "Coming Soon & Placeholders", 
        icon: "🎬", 
        color: "sky", 
        description: "Default placeholder .mp4 trailer video stub for unreleased titles",
        aliases: ["trailer placeholder", "trailers-placeholder"]
    },
    { 
        id: "coming_soon_placeholder", 
        tag: "Coming Soon-placeholder", 
        label: "⏳ Coming Soon Stub", 
        category: "placeholders", 
        categoryTitle: "Coming Soon & Placeholders", 
        icon: "⏳", 
        color: "sky", 
        description: "Coming Soon directory placeholder badge" 
    },
    { 
        id: "trailers", 
        tag: "trailers", 
        label: "🎥 Trailers", 
        category: "placeholders", 
        categoryTitle: "Coming Soon & Placeholders", 
        icon: "🎥", 
        color: "cyan", 
        description: "Standard trailer clips" 
    },
    { 
        id: "coming_soon", 
        tag: "coming_soon", 
        label: "✨ Coming Soon", 
        category: "placeholders", 
        categoryTitle: "Coming Soon & Placeholders", 
        icon: "✨", 
        color: "indigo", 
        description: "Upcoming media monitored for grab",
        aliases: ["coming-soon", "coming soon"]
    },
    { 
        id: "extras", 
        tag: "extras", 
        label: "🎞️ Extras", 
        category: "placeholders", 
        categoryTitle: "Coming Soon & Placeholders", 
        icon: "🎞️", 
        color: "slate", 
        description: "Featurettes, behind-the-scenes, or commentary clips" 
    },

    // 3. Aging Media & Retention Engine (from Prune Engine / Maintainerr)
    { 
        id: "leaving_soon", 
        tag: "leaving-soon", 
        label: "⚠️ Leaving Soon", 
        category: "prune", 
        categoryTitle: "Prune & Retention Engine", 
        icon: "⚠️", 
        color: "amber", 
        description: "Titles flagged for automated pruning or expiration",
        aliases: ["leaving_soon", "leaving soon", "Leaving Soon"]
    },
    { 
        id: "prune_staged", 
        tag: "prune-staged", 
        label: "📦 Prune Staged", 
        category: "prune", 
        categoryTitle: "Prune & Retention Engine", 
        icon: "📦", 
        color: "amber", 
        description: "Staged for imminent deletion cycle" 
    },

    // 4. Quality, HDR, Audio & Smart Taggers (from Kometa & Tagging Studio)
    { 
        id: "quality_4k", 
        tag: "4K UHD", 
        label: "📺 4K UHD", 
        category: "quality", 
        categoryTitle: "Specs & Media Formats", 
        icon: "📺", 
        color: "purple", 
        description: "Ultra-High-Definition 2160p releases" 
    },
    { 
        id: "quality_dv", 
        tag: "Dolby Vision", 
        label: "✨ Dolby Vision", 
        category: "quality", 
        categoryTitle: "Specs & Media Formats", 
        icon: "✨", 
        color: "purple", 
        description: "Dynamic HDR Dolby Vision releases" 
    },
    { 
        id: "quality_atmos", 
        tag: "Dolby Atmos", 
        label: "🔊 Dolby Atmos", 
        category: "quality", 
        categoryTitle: "Specs & Media Formats", 
        icon: "🔊", 
        color: "purple", 
        description: "Spatial 3D object-based audio releases" 
    },
    { 
        id: "top_rated", 
        tag: "Top Rated", 
        label: "⭐ Top Rated (8.0+)", 
        category: "quality", 
        categoryTitle: "Specs & Media Formats", 
        icon: "⭐", 
        color: "emerald", 
        description: "High-acclaim titles tagged by rating filter" 
    },
    { 
        id: "a24_studio", 
        tag: "A24", 
        label: "🎨 A24 Studio", 
        category: "quality", 
        categoryTitle: "Specs & Media Formats", 
        icon: "🎨", 
        color: "emerald", 
        description: "A24 Studio releases" 
    },
    { 
        id: "cinema_80s", 
        tag: "80s Cinema", 
        label: "📼 80s Cinema", 
        category: "quality", 
        categoryTitle: "Specs & Media Formats", 
        icon: "📼", 
        color: "indigo", 
        description: "1980s decade releases" 
    },
    { 
        id: "cinema_90s", 
        tag: "90s Cinema", 
        label: "📼 90s Cinema", 
        category: "quality", 
        categoryTitle: "Specs & Media Formats", 
        icon: "📼", 
        color: "indigo", 
        description: "1990s decade releases" 
    }
];

export function isLabelExcluded(currentStr: string, item: PortalarrCurationLabelDefinition | string): boolean {
    if (!currentStr || !currentStr.trim()) return false;
    const tokens = currentStr.split(",").map(s => s.trim().toLowerCase().replace(/^exclude\s+/i, "")).filter(Boolean);
    const norm = (s: string) => s.toLowerCase().replace(/[-_\s:]+/g, "");

    const targetTag = typeof item === "string" ? item : item.tag;
    const targetNorm = norm(targetTag);
    if (!targetNorm) return false;

    // Check direct equality or aliases
    for (const t of tokens) {
        const tNorm = norm(t);
        if (tNorm === targetNorm || t.toLowerCase() === targetTag.toLowerCase()) return true;

        if (typeof item !== "string" && item.aliases) {
            if (item.aliases.some(a => norm(a) === tNorm || a.toLowerCase() === t.toLowerCase())) {
                return true;
            }
        }

        // Category + severity check (e.g. "nudity severe" matches "IMDb-Nudity: Severe")
        for (const cat of ["nudity", "violence", "profanity", "alcohol", "frightening"]) {
            if (targetNorm.includes(cat) && tNorm.includes(cat)) {
                for (const sev of ["severe", "moderate", "mild"]) {
                    if (targetNorm.includes(sev) && tNorm.includes(sev)) {
                        return true;
                    }
                }
            }
        }
    }

    return false;
}

export function toggleLabelInList(currentStr: string, item: PortalarrCurationLabelDefinition | string): string {
    let tokens = (currentStr || "").split(",").map(s => s.trim().replace(/^exclude\s+/i, "")).filter(Boolean);
    const norm = (s: string) => s.toLowerCase().replace(/[-_\s:]+/g, "");

    const targetTag = typeof item === "string" ? item : item.tag;
    const targetNorm = norm(targetTag);

    const existsIndex = tokens.findIndex(t => {
        const tNorm = norm(t);
        if (tNorm === targetNorm || t.toLowerCase() === targetTag.toLowerCase()) return true;

        if (typeof item !== "string" && item.aliases) {
            if (item.aliases.some(a => norm(a) === tNorm || a.toLowerCase() === t.toLowerCase())) {
                return true;
            }
        }

        for (const cat of ["nudity", "violence", "profanity", "alcohol", "frightening"]) {
            if (targetNorm.includes(cat) && tNorm.includes(cat)) {
                for (const sev of ["severe", "moderate", "mild"]) {
                    if (targetNorm.includes(sev) && tNorm.includes(sev)) {
                        return true;
                    }
                }
            }
        }
        return false;
    });

    if (existsIndex >= 0) {
        tokens.splice(existsIndex, 1);
    } else {
        tokens.push(targetTag);
    }

    return tokens.join(", ");
}

interface ExcludedLabelsSelectorProps {
    value: string;
    onChange: (newValue: string) => void;
    serverId?: string;
    sectionKey?: string | number;
    title?: string;
    description?: string;
    compact?: boolean;
}

export function ExcludedLabelsSelector({
    value,
    onChange,
    serverId,
    sectionKey,
    title = "Excluded Plex Labels",
    description = "Exclude media items tagged with these Plex labels or content advisories. Selected titles will be omitted from carousels and playlists.",
    compact = false
}: ExcludedLabelsSelectorProps) {
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [searchQuery, setSearchQuery] = useState<string>("");
    const [plexAuditLabels, setPlexAuditLabels] = useState<Array<{ tag: string; count: number; isParental: boolean }>>([]);
    const [loadingAudit, setLoadingAudit] = useState(false);

    // Fetch live Plex library labels audit if server and section are provided
    useEffect(() => {
        if (!serverId || !sectionKey) return;
        let isMounted = true;
        const fetchAudit = async () => {
            try {
                setLoadingAudit(true);
                const res = await getPlexLibraryTagsAuditAction(serverId, sectionKey);
                if (isMounted && res.success && Array.isArray(res.labels)) {
                    setPlexAuditLabels(res.labels);
                }
            } catch (err) {
                console.warn("[EXCLUDED-LABELS] Failed fetching library audit tags:", err);
            } finally {
                if (isMounted) setLoadingAudit(false);
            }
        };
        fetchAudit();
        return () => { isMounted = false; };
    }, [serverId, sectionKey]);

    // Active parsed tokens
    const activeTokens = useMemo(() => {
        return (value || "")
            .split(",")
            .map(s => s.trim().replace(/^exclude\s+/i, ""))
            .filter(Boolean);
    }, [value]);

    // Filtered static curation presets
    const filteredPresetLabels = useMemo(() => {
        return PORTALARR_CURATION_LABELS.filter(item => {
            const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
            if (!matchesCategory) return false;

            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase().trim();
            return (
                item.label.toLowerCase().includes(q) ||
                item.tag.toLowerCase().includes(q) ||
                (item.description && item.description.toLowerCase().includes(q)) ||
                (item.aliases && item.aliases.some(a => a.toLowerCase().includes(q)))
            );
        });
    }, [categoryFilter, searchQuery]);

    // Live library tags filtered
    const filteredAuditLabels = useMemo(() => {
        if (categoryFilter !== "all" && categoryFilter !== "library") return [];
        return plexAuditLabels.filter(l => {
            if (!searchQuery.trim()) return true;
            return l.tag.toLowerCase().includes(searchQuery.toLowerCase().trim());
        });
    }, [categoryFilter, plexAuditLabels, searchQuery]);

    // Macro handlers
    const handleToggleNuditySevere = () => {
        onChange(toggleLabelInList(value, "IMDb-Nudity: Severe"));
    };

    const handleToggleAllSevereAdvisories = () => {
        const severeTags = [
            "IMDb-Nudity: Severe",
            "IMDb-Violence: Severe",
            "IMDb-Profanity: Severe",
            "IMDb-Alcohol: Severe",
            "IMDb-Frightening: Severe"
        ];
        const allAlreadyExcluded = severeTags.every(t => isLabelExcluded(value, t));
        let nextValue = value;
        if (allAlreadyExcluded) {
            // Remove all severe
            for (const t of severeTags) {
                nextValue = toggleLabelInList(nextValue, t);
            }
        } else {
            // Add any missing severe
            for (const t of severeTags) {
                if (!isLabelExcluded(nextValue, t)) {
                    nextValue = toggleLabelInList(nextValue, t);
                }
            }
        }
        onChange(nextValue);
    };

    const handleToggleTrailerPlaceholders = () => {
        const trailerTags = ["trailer-placeholder", "Coming Soon-placeholder"];
        const allPresent = trailerTags.every(t => isLabelExcluded(value, t));
        let nextValue = value;
        if (allPresent) {
            for (const t of trailerTags) {
                nextValue = toggleLabelInList(nextValue, t);
            }
        } else {
            for (const t of trailerTags) {
                if (!isLabelExcluded(nextValue, t)) {
                    nextValue = toggleLabelInList(nextValue, t);
                }
            }
        }
        onChange(nextValue);
    };

    const handleToggleLeavingSoon = () => {
        onChange(toggleLabelInList(value, "leaving-soon"));
    };

    const handleClearAll = () => {
        onChange("");
    };

    const handleRemoveToken = (tokenToRemove: string) => {
        const updated = activeTokens.filter(t => t.toLowerCase() !== tokenToRemove.toLowerCase()).join(", ");
        onChange(updated);
    };

    // Color theme helper for chips
    const getChipColorClasses = (color: string, isSelected: boolean) => {
        if (isSelected) {
            return "bg-rose-950/90 text-rose-200 border-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.3)] ring-1 ring-rose-500/50 font-black";
        }
        switch (color) {
            case "rose":
                return "bg-slate-900/80 text-rose-300 border-rose-900/40 hover:border-rose-500/60 hover:bg-rose-950/30";
            case "orange":
                return "bg-slate-900/80 text-orange-300 border-orange-900/40 hover:border-orange-500/60 hover:bg-orange-950/30";
            case "amber":
                return "bg-slate-900/80 text-amber-300 border-amber-900/40 hover:border-amber-500/60 hover:bg-amber-950/30";
            case "sky":
                return "bg-slate-900/80 text-sky-300 border-sky-900/40 hover:border-sky-500/60 hover:bg-sky-950/30";
            case "cyan":
                return "bg-slate-900/80 text-cyan-300 border-cyan-900/40 hover:border-cyan-500/60 hover:bg-cyan-950/30";
            case "purple":
                return "bg-slate-900/80 text-purple-300 border-purple-900/40 hover:border-purple-500/60 hover:bg-purple-950/30";
            case "emerald":
                return "bg-slate-900/80 text-emerald-300 border-emerald-900/40 hover:border-emerald-500/60 hover:bg-emerald-950/30";
            case "indigo":
                return "bg-slate-900/80 text-indigo-300 border-indigo-900/40 hover:border-indigo-500/60 hover:bg-indigo-950/30";
            default:
                return "bg-slate-900/80 text-slate-300 border-slate-800 hover:border-slate-600 hover:bg-slate-800";
        }
    };

    return (
        <div className="space-y-3 p-3.5 bg-slate-950/90 rounded-xl border border-slate-800">
            {/* Header & Description */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <div className="space-y-0.5">
                    <Label className="text-xs font-bold text-white flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-rose-400" />
                        <span>{title}</span>
                    </Label>
                    <p className="text-[10px] text-slate-400">
                        {description}
                    </p>
                </div>
                {activeTokens.length > 0 && (
                    <div className="flex items-center gap-1.5 self-start sm:self-auto shrink-0">
                        <Badge className="bg-rose-950 text-rose-300 border-rose-800 text-[10px] font-mono px-2 py-0.5">
                            {activeTokens.length} Excluded
                        </Badge>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={handleClearAll}
                            className="h-6 px-1.5 text-[10px] text-slate-400 hover:text-rose-300 gap-1"
                            title="Clear all label exclusions"
                        >
                            <Trash2 className="h-2.5 w-2.5" />
                            <span>Clear All</span>
                        </Button>
                    </div>
                )}
            </div>

            {/* Quick Macro 1-Click Action Buttons */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mr-1">
                    Quick Exclude:
                </span>
                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleToggleNuditySevere}
                    className={`h-6 text-[10px] px-2 gap-1 border transition-all cursor-pointer ${
                        isLabelExcluded(value, "IMDb-Nudity: Severe")
                            ? "bg-rose-950 text-rose-200 border-rose-500 font-bold shadow-sm"
                            : "bg-slate-900 border-slate-800 text-slate-300 hover:border-rose-500/60 hover:text-white"
                    }`}
                    title="1-Click Exclude Severe Sex & Nudity content"
                >
                    <span>🔞 Exclude Nudity (Severe)</span>
                    {isLabelExcluded(value, "IMDb-Nudity: Severe") && <Check className="h-2.5 w-2.5 text-rose-400" />}
                </Button>

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleToggleAllSevereAdvisories}
                    className="h-6 text-[10px] px-2 gap-1 border border-rose-900/60 bg-rose-950/40 text-rose-300 hover:bg-rose-900/40 hover:text-rose-100 transition-all cursor-pointer font-bold"
                    title="Exclude all 5 severe advisory categories (Nudity, Violence, Profanity, Alcohol/Drugs, Frightening)"
                >
                    <ShieldAlert className="h-2.5 w-2.5 text-rose-400" />
                    <span>⚡ Exclude All Severe Advisories</span>
                </Button>

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleToggleTrailerPlaceholders}
                    className={`h-6 text-[10px] px-2 gap-1 border transition-all cursor-pointer ${
                        isLabelExcluded(value, "trailer-placeholder")
                            ? "bg-sky-950 text-sky-200 border-sky-500 font-bold shadow-sm"
                            : "bg-slate-900 border-slate-800 text-slate-300 hover:border-sky-500/60 hover:text-white"
                    }`}
                    title="Exclude Coming Soon trailer video stubs and markers"
                >
                    <Sparkles className="h-2.5 w-2.5 text-sky-400" />
                    <span>Exclude Trailer Stubs</span>
                    {isLabelExcluded(value, "trailer-placeholder") && <Check className="h-2.5 w-2.5 text-sky-400" />}
                </Button>

                <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={handleToggleLeavingSoon}
                    className={`h-6 text-[10px] px-2 gap-1 border transition-all cursor-pointer ${
                        isLabelExcluded(value, "leaving-soon")
                            ? "bg-amber-950 text-amber-200 border-amber-500 font-bold shadow-sm"
                            : "bg-slate-900 border-slate-800 text-slate-300 hover:border-amber-500/60 hover:text-white"
                    }`}
                    title="Exclude titles staged for deletion or flagged with leaving-soon"
                >
                    <Clock className="h-2.5 w-2.5 text-amber-400" />
                    <span>Exclude Leaving Soon</span>
                    {isLabelExcluded(value, "leaving-soon") && <Check className="h-2.5 w-2.5 text-amber-400" />}
                </Button>
            </div>

            {/* Category Filter Chips & Search Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 pt-1 border-t border-slate-800/80">
                <div className="flex flex-wrap items-center gap-1">
                    {[
                        { id: "all", label: "All Labels" },
                        { id: "parental", label: "🔞 Parental Advisories" },
                        { id: "placeholders", label: "🎬 Placeholders" },
                        { id: "prune", label: "⚠️ Retention & Prune" },
                        { id: "quality", label: "📺 Specs & Formats" },
                        ...(plexAuditLabels.length > 0 ? [{ id: "library", label: `🏷️ Plex Tags (${plexAuditLabels.length})` }] : [])
                    ].map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setCategoryFilter(tab.id)}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-all cursor-pointer ${
                                categoryFilter === tab.id
                                    ? "bg-slate-800 text-amber-300 border-amber-500/50 shadow-sm"
                                    : "bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700"
                            }`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="relative w-full sm:w-48 shrink-0">
                    <Search className="h-3 w-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
                    <Input
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search labels..."
                        className="h-6 text-[10px] pl-6 bg-slate-900 border-slate-800 text-slate-200 placeholder:text-slate-600 rounded-md"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery("")}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                        >
                            <X className="h-2.5 w-2.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Quick-Select Labels Pills Container */}
            <div className="max-h-52 overflow-y-auto pr-1 space-y-2.5 border border-slate-800/80 rounded-lg p-2.5 bg-slate-950/60">
                {/* 1. Portalarr Preset Labels */}
                <div className="flex flex-wrap items-center gap-1.5">
                    {filteredPresetLabels.map(item => {
                        const isSelected = isLabelExcluded(value, item);
                        return (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => onChange(toggleLabelInList(value, item))}
                                title={item.description || item.tag}
                                className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-all cursor-pointer text-left ${getChipColorClasses(item.color, isSelected)}`}
                            >
                                <span className="text-xs">{item.icon}</span>
                                <span className="font-semibold">{item.label}</span>
                                {isSelected ? (
                                    <Check className="h-3 w-3 text-rose-400 ml-0.5 shrink-0" />
                                ) : (
                                    <Plus className="h-2.5 w-2.5 text-slate-500 group-hover:text-slate-300 ml-0.5 shrink-0" />
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* 2. Live Plex Library Tags (Audit) */}
                {filteredAuditLabels.length > 0 && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold px-0.5">
                            <span className="flex items-center gap-1 text-slate-300">
                                <Tag className="h-3 w-3 text-sky-400" />
                                <span>Active in this Plex Library ({filteredAuditLabels.length}):</span>
                            </span>
                            <span className="text-[9px] text-slate-500 font-mono">1-click exclude any existing tag</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5">
                            {filteredAuditLabels.map(audit => {
                                const isSelected = isLabelExcluded(value, audit.tag);
                                return (
                                    <button
                                        key={audit.tag}
                                        type="button"
                                        onClick={() => onChange(toggleLabelInList(value, audit.tag))}
                                        title={`Applied on ${audit.count} items in Plex`}
                                        className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] border transition-all cursor-pointer ${
                                            isSelected
                                                ? "bg-rose-950/90 text-rose-200 border-rose-500 shadow-sm font-black ring-1 ring-rose-500/50"
                                                : "bg-slate-900/80 text-sky-300 border-sky-900/40 hover:border-sky-500/60 hover:bg-sky-950/30"
                                        }`}
                                    >
                                        <Tag className="h-2.5 w-2.5 text-sky-400" />
                                        <span>{audit.tag}</span>
                                        <span className="text-[9px] opacity-70 font-mono">({audit.count})</span>
                                        {isSelected ? (
                                            <Check className="h-3 w-3 text-rose-400 ml-0.5 shrink-0" />
                                        ) : (
                                            <Plus className="h-2.5 w-2.5 text-slate-500 ml-0.5 shrink-0" />
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {filteredPresetLabels.length === 0 && filteredAuditLabels.length === 0 && (
                    <div className="text-center py-6 text-slate-500 space-y-1">
                        <AlertTriangle className="h-5 w-5 mx-auto text-slate-600" />
                        <p className="text-[11px]">No labels found matching "{searchQuery}".</p>
                        <p className="text-[10px] text-slate-600">Type in the manual input below to exclude custom tags.</p>
                    </div>
                )}
            </div>

            {/* Active Selected Tags Display */}
            {activeTokens.length > 0 && (
                <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
                    <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                        <span>Currently Excluded ({activeTokens.length}):</span>
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {activeTokens.map(token => (
                            <span
                                key={token}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-rose-950/80 text-rose-200 border border-rose-800/80 shadow-sm"
                            >
                                <span>{token}</span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveToken(token)}
                                    className="p-0.5 hover:bg-rose-900/60 rounded text-rose-300 hover:text-white transition-colors"
                                    title={`Remove "${token}" from excluded labels`}
                                >
                                    <X className="h-2.5 w-2.5" />
                                </button>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {/* Manual Comma-Separated Input */}
            <div className="space-y-1 pt-1 border-t border-slate-800/80">
                <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-semibold text-slate-400">
                        Raw Excluded Labels (Comma-separated)
                    </Label>
                    <span className="text-[9px] text-slate-500 font-mono">
                        Direct text override
                    </span>
                </div>
                <Input
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    placeholder="e.g. IMDb-Nudity: Severe, trailer-placeholder, trailers, coming_soon, leaving-soon"
                    className="h-8 text-xs bg-slate-900 border-slate-700 font-mono text-rose-300 placeholder:text-slate-600"
                />
            </div>
        </div>
    );
}
