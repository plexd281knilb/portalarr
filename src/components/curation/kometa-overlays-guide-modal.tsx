"use client";

import React, { useState } from "react";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    BookOpen,
    Sparkles,
    Layers,
    FileCode,
    Code2,
    Check,
    Copy,
    ExternalLink,
    Zap,
    FolderCheck,
    Palette,
    Info,
    Tv,
    Film,
    Sliders,
    HelpCircle,
    ArrowRight,
    FolderOpen,
    RefreshCw,
    ClipboardList,
    Lightbulb,
    MapPin,
    Merge
} from "lucide-react";

interface KometaOverlaysGuideModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function KometaOverlaysGuideModal({ open, onOpenChange }: KometaOverlaysGuideModalProps) {
    const [activeTab, setActiveTab] = useState<"stock" | "adding" | "rules" | "positions" | "yaml">("stock");
    const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);

    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedSnippet(id);
        setTimeout(() => setCopiedSnippet(null), 2000);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[calc(100vw-2rem)] sm:max-w-4xl max-h-[88vh] flex flex-col bg-popover dark:bg-slate-950 border-border dark:border-slate-800 text-foreground dark:text-slate-100 p-0 shadow-2xl overflow-hidden overflow-x-hidden">
                {/* Header */}
                <DialogHeader className="p-6 pb-4 bg-card/95 dark:bg-slate-900/90 border-b border-border dark:border-slate-800 shrink-0">
                    <div className="flex items-center justify-between gap-4">
                        <div className="space-y-1">
                            <DialogTitle className="text-xl font-black text-foreground dark:text-white flex items-center gap-2.5">
                                <BookOpen className="h-5 w-5 text-amber-700 dark:text-amber-400" />
                                <span>Kometa Overlays &amp; Custom Badges Documentation</span>
                            </DialogTitle>
                            <DialogDescription className="text-xs text-slate-600 dark:text-slate-400">
                                Complete reference for official stock assets, custom badge ingestion, condition logic, and overlay rendering.
                            </DialogDescription>
                        </div>
                        <Badge variant="outline" className="border-amber-500/40 text-amber-800 dark:text-amber-300 bg-amber-500/10 dark:bg-amber-950/40 text-xs px-2.5 py-1">
                            Stock Assets &bull; 2,350+ Files
                        </Badge>
                    </div>

                    {/* Navigation Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-4">
                        {[
                            { id: "stock", label: "Stock Kometa Assets", icon: Palette },
                            { id: "adding", label: "Adding Custom Badges", icon: Zap },
                            { id: "rules", label: "Match Rules & Logic", icon: Code2 },
                            { id: "positions", label: "Positioning & Stacking", icon: Layers },
                            { id: "yaml", label: "Kometa YAML Mapping", icon: FileCode }
                        ].map(t => {
                            const Icon = t.icon;
                            const isSelected = activeTab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setActiveTab(t.id as any)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                        isSelected
                                            ? "bg-primary text-primary-foreground shadow-sm"
                                            : "bg-muted/80 dark:bg-slate-800/80 hover:bg-slate-700/80 text-slate-600 dark:text-slate-400 hover:text-foreground dark:hover:text-white"
                                    }`}
                                >
                                    <Icon className="h-3.5 w-3.5" />
                                    <span>{t.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </DialogHeader>

                {/* Body Content */}
                <div className="p-6 overflow-y-auto space-y-6 text-xs text-slate-700 dark:text-slate-300">
                    {/* TAB 1: Stock Kometa Assets */}
                    {activeTab === "stock" && (
                        <div className="space-y-5">
                            <div className="p-4 rounded-xl bg-amber-500/10 dark:bg-amber-950/25 border border-amber-500/35 space-y-2">
                                <h3 className="font-bold text-sm text-amber-900 dark:text-amber-200 flex items-center gap-2">
                                    <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                                    Why do stock Kometa overlays look distinct from generic SVGs?
                                </h3>
                                <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                                    Official Kometa overlays are <strong>pre-rendered high-definition raster PNG assets</strong> with authentic laurels (Oscars, BAFTA, Cannes), textured metallic ribbons, official Dolby/IMAX branding, and custom-styled dovetail resolution flags.
                                </p>
                                <p className="leading-relaxed text-slate-700 dark:text-slate-300">
                                    DomsHomeLab ships with <strong>2,350+ official stock assets</strong> pulled directly from the <code className="bg-card/95 dark:bg-slate-900 text-amber-800 dark:text-amber-300 px-1 py-0.5 rounded font-mono">Kometa-Team/Kometa</code> repository. The Sharp compositing engine automatically layers these authentic raster graphics at pixel-perfect 1000&times;1500 resolution.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-2">
                                    <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                        <FolderOpen className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                        <span>Asset Directory Tree</span>
                                    </span>
                                    <p className="text-slate-600 dark:text-slate-400 text-[11px]">All default assets live in <code className="text-amber-800 dark:text-amber-300 font-mono">public/kometa_stock/</code>:</p>
                                    <ul className="space-y-1 font-mono text-[11px] text-slate-700 dark:text-slate-300 bg-muted dark:bg-slate-950 p-2.5 rounded-lg border border-border dark:border-slate-800/80">
                                        <li>├── <span className="text-amber-700 dark:text-amber-400">ribbon/</span> (Gold, Red, Blue, Cannes, Oscar, Emmy...)</li>
                                        <li>├── <span className="text-sky-700 dark:text-sky-400">resolution/</span> (4K UHD, 1080p, 720p, 480p...)</li>
                                        <li>├── <span className="text-cyan-700 dark:text-cyan-400">audio_codec/</span> (Atmos, TrueHD, DTS:X, FLAC...)</li>
                                        <li>├── <span className="text-emerald-700 dark:text-emerald-400">edition/</span> (Director&apos;s Cut, IMAX, Unrated...)</li>
                                        <li>├── <span className="text-rose-700 dark:text-rose-400">streaming/</span> (Netflix, Disney+, Apple TV+, Max...)</li>
                                        <li>├── <span className="text-orange-700 dark:text-orange-400">studio/</span> (A24, Universal, Warner Bros, Sony...)</li>
                                        <li>└── <span className="text-yellow-700 dark:text-yellow-400">rating/</span> (IMDb, Rotten Tomatoes, Metacritic...)</li>
                                    </ul>
                                </div>

                                <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-2">
                                    <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                        <RefreshCw className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                                        <span>Dynamic Corner Transformation</span>
                                    </span>
                                    <p className="text-slate-600 dark:text-slate-400 text-[11px]">
                                        Stock ribbons are authored for the top-right corner. When you select a different corner in the UI or config:
                                    </p>
                                    <ul className="space-y-1.5 text-[11px] text-slate-700 dark:text-slate-300">
                                        <li className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                                            <span><strong>Top-Right:</strong> Native asset coordinates without transformation.</span>
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                                            <span><strong>Top-Left:</strong> Automatic horizontal mirror (<code className="font-mono text-amber-800 dark:text-amber-300">.flop()</code>).</span>
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                                            <span><strong>Bottom-Right:</strong> Automatic vertical flip (<code className="font-mono text-amber-800 dark:text-amber-300">.flip()</code>).</span>
                                        </li>
                                        <li className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full bg-amber-400" />
                                            <span><strong>Bottom-Left:</strong> Combined flip + flop for bottom-left orientation.</span>
                                        </li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: Adding Custom Badges */}
                    {activeTab === "adding" && (
                        <div className="space-y-5">
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                You can add custom badges to DomsHomeLab using three different workflows: direct UI upload, 1-click GitHub repository import, or by placing image files directly onto the server disk.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-2">
                                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 dark:bg-emerald-950 border border-emerald-500/80 dark:border-emerald-800/80 flex items-center justify-center text-emerald-800 dark:text-emerald-300 font-bold tabular-nums">
                                        1
                                    </div>
                                    <h4 className="font-bold text-foreground dark:text-white text-xs">Direct UI Upload</h4>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                        Click <strong>&quot;Upload Custom Badge&quot;</strong> in the Custom Badges Vault. Select your SVG or PNG file, assign a category, set the target corner position, and define an optional match rule.
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-2">
                                    <div className="w-7 h-7 rounded-lg bg-amber-500/15 dark:bg-amber-950 border border-amber-500/80 dark:border-amber-800/80 flex items-center justify-center text-amber-800 dark:text-amber-300 font-bold tabular-nums">
                                        2
                                    </div>
                                    <h4 className="font-bold text-foreground dark:text-white text-xs">GitHub Repo Import</h4>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                        Click <strong>&quot;Import from GitHub Repo&quot;</strong>. Paste any public GitHub repository or directory URL (e.g., custom community badge packs). DomsHomeLab scans and imports all discovered images automatically.
                                    </p>
                                </div>

                                <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-2">
                                    <div className="w-7 h-7 rounded-lg bg-sky-500/15 dark:bg-sky-950 border border-sky-500/80 dark:border-sky-800/80 flex items-center justify-center text-sky-800 dark:text-sky-300 font-bold tabular-nums">
                                        3
                                    </div>
                                    <h4 className="font-bold text-foreground dark:text-white text-xs">Filesystem Placement</h4>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                        Drop image files directly into <code className="font-mono text-amber-800 dark:text-amber-300">public/custom_overlays/</code>. Any badge in this folder can be called directly by filename or registered in custom badge rules.
                                    </p>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900/90 border border-border dark:border-slate-800 space-y-3">
                                <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                    <Palette className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                    <span>Recommended Artwork Specifications for Custom Badges</span>
                                </span>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
                                    <div className="p-2.5 rounded-lg bg-muted dark:bg-slate-950 border border-border dark:border-slate-800">
                                        <div className="text-slate-600 dark:text-slate-400">File Format</div>
                                        <div className="font-bold text-foreground dark:text-white mt-0.5">PNG (Transparent) or SVG</div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-muted dark:bg-slate-950 border border-border dark:border-slate-800">
                                        <div className="text-slate-600 dark:text-slate-400">Resolution Reference</div>
                                        <div className="font-bold text-foreground dark:text-white mt-0.5">1000 &times; 1500 px Canvas</div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-muted dark:bg-slate-950 border border-border dark:border-slate-800">
                                        <div className="text-slate-600 dark:text-slate-400">Corner Badges</div>
                                        <div className="font-bold text-foreground dark:text-white mt-0.5">~180–300px Wide</div>
                                    </div>
                                    <div className="p-2.5 rounded-lg bg-muted dark:bg-slate-950 border border-border dark:border-slate-800">
                                        <div className="text-slate-600 dark:text-slate-400">Corner Ribbons</div>
                                        <div className="font-bold text-foreground dark:text-white mt-0.5">450 &times; 450 px (Square)</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 3: Match Rules & Condition Logic */}
                    {activeTab === "rules" && (
                        <div className="space-y-5">
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                Match rules allow you to control exactly when a custom badge or ribbon is applied based on real Plex media telemetry and metadata.
                            </p>

                            <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-3">
                                <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                    <ClipboardList className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                    <span>Available Telemetry Variables</span>
                                </span>
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-[11px]">
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">resolution</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">&quot;4K&quot;, &quot;1080p&quot;, &quot;720p&quot;, &quot;480p&quot;</p>
                                    </div>
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">hdr</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">&quot;DV&quot; (Dolby Vision), &quot;HDR10+&quot;, &quot;HDR&quot;</p>
                                    </div>
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">audio</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">&quot;Atmos&quot;, &quot;TrueHD&quot;, &quot;DTS:X&quot;, &quot;FLAC&quot;</p>
                                    </div>
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">audioChannels</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">&quot;7.1&quot;, &quot;5.1&quot;, &quot;2.0&quot;</p>
                                    </div>
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">codec</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">&quot;HEVC&quot;, &quot;AV1&quot;, &quot;H.264&quot;, &quot;VC-1&quot;</p>
                                    </div>
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">edition</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">&quot;Director&apos;s Cut&quot;, &quot;IMAX&quot;, &quot;Extended&quot;</p>
                                    </div>
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">studio</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">&quot;A24&quot;, &quot;HBO&quot;, &quot;Netflix&quot;, &quot;Disney+&quot;</p>
                                    </div>
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">contentRating</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">&quot;R&quot;, &quot;PG-13&quot;, &quot;TV-MA&quot;, &quot;G&quot;</p>
                                    </div>
                                    <div className="p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                        <span className="font-mono text-amber-800 dark:text-amber-300 font-bold">rating</span>
                                        <p className="text-slate-600 dark:text-slate-400 text-[10px]">IMDb or Plex rating score (e.g. 8.5)</p>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                    <Lightbulb className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                    <span>Practical Match Rule Examples</span>
                                </span>

                                {[
                                    {
                                        title: "4K Dolby Vision Criterion / Remux",
                                        rule: "resolution == '4K' && hdr.includes('DV')",
                                        desc: "Matches any item that is 4K resolution with Dolby Vision dynamic range."
                                    },
                                    {
                                        title: "Dolby Atmos with 7.1 Surround",
                                        rule: "audio.includes('Atmos') || (audio == 'TrueHD' && audioChannels == '7.1')",
                                        desc: "Matches Dolby Atmos or uncompressed TrueHD 7.1 channel audio."
                                    },
                                    {
                                        title: "A24 Studio Productions",
                                        rule: "studio.toLowerCase().includes('a24')",
                                        desc: "Applies the A24 studio logo to all films produced or distributed by A24."
                                    },
                                    {
                                        title: "Director's or Extended Edition",
                                        rule: "edition && (edition.toLowerCase().includes('director') || edition.toLowerCase().includes('extended'))",
                                        desc: "Applies a special edition badge to extended cuts."
                                    },
                                    {
                                        title: "High-Rated Masterpieces (Score ≥ 8.0)",
                                        rule: "rating >= 8.0",
                                        desc: "Matches critically acclaimed titles for gold laurels or ribbon awards."
                                    }
                                ].map((ex, idx) => (
                                    <div key={idx} className="p-3 bg-card/95 dark:bg-slate-900 rounded-xl border border-border dark:border-slate-800 flex items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="font-bold text-foreground dark:text-white text-xs">{ex.title}</div>
                                            <code className="text-sky-800 dark:text-sky-300 bg-muted dark:bg-slate-950 px-2 py-0.5 rounded font-mono text-[11px] block w-fit border border-border dark:border-slate-800">
                                                {ex.rule}
                                            </code>
                                            <p className="text-slate-600 dark:text-slate-400 text-[11px]">{ex.desc}</p>
                                        </div>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleCopy(ex.rule, `rule-${idx}`)}
                                            className="h-7 px-2 text-slate-600 dark:text-slate-400 hover:text-foreground dark:hover:text-white shrink-0"
                                        >
                                            {copiedSnippet === `rule-${idx}` ? <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* TAB 4: Positioning & Stacking */}
                    {activeTab === "positions" && (
                        <div className="space-y-5">
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                DomsHomeLab supports 6 badge anchors, 4 corner ribbons, and configurable layer priority order to prevent overlapping when multiple badges share the same position.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-3">
                                    <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                        <MapPin className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                                        <span>Coordinate Positions</span>
                                    </span>
                                    <div className="space-y-2 text-[11px]">
                                        <div className="flex items-center justify-between p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                            <span className="font-bold text-foreground dark:text-slate-200">top-right / top-left</span>
                                            <span className="text-slate-600 dark:text-slate-400">30px margin from top &amp; side edges</span>
                                        </div>
                                        <div className="flex items-center justify-between p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                            <span className="font-bold text-foreground dark:text-slate-200">bottom-right / bottom-left</span>
                                            <span className="text-slate-600 dark:text-slate-400">35px margin from bottom &amp; side edges</span>
                                        </div>
                                        <div className="flex items-center justify-between p-2 bg-muted dark:bg-slate-950 rounded border border-border dark:border-slate-800">
                                            <span className="font-bold text-foreground dark:text-slate-200">top-center / bottom-center</span>
                                            <span className="text-slate-600 dark:text-slate-400">Horizontally centered banner positioning</span>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-3">
                                    <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                        <Merge className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400 shrink-0" />
                                        <span>Dovetailed Resolution + HDR</span>
                                    </span>
                                    <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                        When both <strong>Resolution</strong> and <strong>HDR</strong> are assigned to the same corner (e.g. Top-Right) and no single custom override badge matches, DomsHomeLab automatically merges them into a single seamless dovetailed pill badge:
                                    </p>
                                    <div className="p-2.5 bg-muted dark:bg-slate-950 rounded-lg border border-border dark:border-slate-800 font-mono text-[11px] text-center text-amber-800 dark:text-amber-300 font-bold">
                                        4K UHD &bull; DOLBY VISION
                                    </div>
                                </div>
                            </div>

                            <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-3">
                                <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                    <Layers className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400 shrink-0" />
                                    <span>Layer Priority Hierarchy</span>
                                </span>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                    When multiple enabled badges share an anchor, DomsHomeLab stacks them in the order specified in the <strong>Layer Priority Order</strong> list in the Live Simulator. The default stack order is:
                                </p>
                                <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                                    {["1. Ribbon", "2. Resolution", "3. HDR", "4. Video Codec", "5. Audio Codec", "6. Channels", "7. Edition", "8. Studio", "9. Ratings"].map((st, i) => (
                                        <Badge key={i} variant="outline" className="border-border dark:border-slate-700 bg-muted dark:bg-slate-950 text-slate-700 dark:text-slate-300">
                                            {st}
                                        </Badge>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 5: Kometa YAML Mapping */}
                    {activeTab === "yaml" && (
                        <div className="space-y-5">
                            <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                                If you are migrating from or integrating with an existing <code className="font-mono text-amber-800 dark:text-amber-300">config.yml</code> from Kometa, DomsHomeLab translates standard Kometa overlay declarations directly into native rules.
                            </p>

                            <div className="p-4 rounded-xl bg-card/95 dark:bg-slate-900 border border-border dark:border-slate-800 space-y-3">
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-foreground dark:text-white flex items-center gap-1.5 text-xs">
                                        <FileCode className="h-3.5 w-3.5 text-sky-700 dark:text-sky-400 shrink-0" />
                                        <span>Standard Kometa YAML Example</span>
                                    </span>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => handleCopy(`libraries:
  Movies:
    overlay_path:
      - remove_overlays: false
      - pmm: resolution
        template_variables:
          use_4k: true
          use_1080p: true
          horizontal_align: right
          vertical_align: top
      - pmm: audio_codec
        template_variables:
          use_atmos: true
          use_dts: true
          horizontal_align: left
          vertical_align: top
      - pmm: ribbon
        template_variables:
          ribbon: true
          ribbon_type: imdb_top_250`, "yaml-snippet")}
                                        className="h-7 px-2 text-slate-600 dark:text-slate-400 hover:text-foreground dark:hover:text-white"
                                    >
                                        {copiedSnippet === "yaml-snippet" ? <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                                    </Button>
                                </div>

                                <pre className="p-3 bg-muted dark:bg-slate-950 rounded-lg border border-border dark:border-slate-800 font-mono text-[11px] text-sky-800 dark:text-sky-300 overflow-x-auto">
{`libraries:
  Movies:
    overlay_path:
      - remove_overlays: false
      - pmm: resolution
        template_variables:
          use_4k: true
          use_1080p: true
          horizontal_align: right
          vertical_align: top
      - pmm: audio_codec
        template_variables:
          use_atmos: true
          use_dts: true
          horizontal_align: left
          vertical_align: top
      - pmm: ribbon
        template_variables:
          ribbon: true
          ribbon_type: imdb_top_250`}
                                </pre>
                            </div>

                            <div className="p-4 rounded-xl bg-amber-500/10 dark:bg-amber-950/25 border border-amber-500/35 flex items-start gap-3">
                                <Info className="h-5 w-5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                                <div className="space-y-1">
                                    <h4 className="font-bold text-foreground dark:text-white text-xs">1-Click Config Ingestion</h4>
                                    <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed">
                                        You can click <strong>&quot;Load Kometa Config&quot;</strong> in the Studio header to paste your YAML or auto-load <code className="font-mono text-amber-800 dark:text-amber-300">kometaconfig.yml</code> directly from your server root.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 bg-card/95 dark:bg-slate-900/90 border-t border-border dark:border-slate-800 flex items-center justify-between shrink-0">
                    <span className="text-[11px] text-slate-600 dark:text-slate-400">
                        DomsHomeLab Curation Studio &bull; Step 1: Kometa &amp; Agregarr Replacement
                    </span>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => onOpenChange(false)}
                        className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs h-8 px-4"
                    >
                        Close Guide
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
