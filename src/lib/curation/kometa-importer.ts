import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { TieredRibbonItem } from "./overlay-engine";

export interface ParsedKometaOverlayFile {
    defaultName: string;
    filters?: Record<string, any>;
    templateVariables?: Record<string, any>;
}

export interface ParsedKometaLibrary {
    name: string;
    removeOverlays?: boolean;
    reapplyOverlays?: boolean;
    overlayFiles: ParsedKometaOverlayFile[];
    assetDirectories?: string[];
}

export interface ParsedKometaConfig {
    libraries: Record<string, ParsedKometaLibrary>;
    plex?: {
        url?: string;
        token?: string;
        timeout?: number;
    };
    tmdb?: {
        apikey?: string;
        language?: string;
    };
    assetDirectories?: string[];
}

/**
 * Lightweight & robust YAML parser specialized for Kometa configuration files.
 */
export function parseKometaYamlString(yamlText: string): ParsedKometaConfig {
    const config: ParsedKometaConfig = {
        libraries: {}
    };

    const lines = yamlText.split(/\r?\n/);
    let currentRootSection: string | null = null;
    let currentLibraryName: string | null = null;
    let currentOverlayIndex: number = -1;
    let currentSubSection: string | null = null;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        // Strip comments if line is purely comment
        const trimmed = rawLine.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;

        const indent = rawLine.search(/\S/);

        // Top level root keys (indent 0)
        if (indent === 0 && trimmed.endsWith(":")) {
            const rootKey = trimmed.slice(0, -1).trim().toLowerCase();
            currentRootSection = rootKey;
            currentLibraryName = null;
            currentOverlayIndex = -1;
            currentSubSection = null;
            continue;
        }

        if (currentRootSection === "plex") {
            const [k, ...vParts] = trimmed.split(":");
            const val = vParts.join(":").trim();
            if (k && val) {
                if (!config.plex) config.plex = {};
                const key = k.trim().toLowerCase();
                if (key === "url") config.plex.url = val;
                if (key === "token") config.plex.token = val;
                if (key === "timeout") config.plex.timeout = parseInt(val, 10) || 60;
            }
            continue;
        }

        if (currentRootSection === "tmdb") {
            const [k, ...vParts] = trimmed.split(":");
            const val = vParts.join(":").trim();
            if (k && val) {
                if (!config.tmdb) config.tmdb = {};
                const key = k.trim().toLowerCase();
                if (key === "apikey" || key === "api_key") config.tmdb.apikey = val;
                if (key === "language") config.tmdb.language = val;
            }
            continue;
        }

        if (currentRootSection === "libraries") {
            // Library Name (indent 2)
            if (indent === 2 && trimmed.endsWith(":")) {
                const libName = trimmed.slice(0, -1).trim();
                currentLibraryName = libName;
                config.libraries[libName] = {
                    name: libName,
                    overlayFiles: [],
                    assetDirectories: []
                };
                currentOverlayIndex = -1;
                currentSubSection = null;
                continue;
            }

            if (!currentLibraryName) continue;
            const currentLib = config.libraries[currentLibraryName];

            // Sub-sections inside library
            if (trimmed === "overlay_files:") {
                currentSubSection = "overlay_files";
                continue;
            } else if (trimmed === "asset_directory:" || trimmed === "settings:") {
                currentSubSection = trimmed.replace(":", "");
                continue;
            }

            if (currentSubSection === "overlay_files") {
                if (trimmed.startsWith("- default:")) {
                    const defVal = trimmed.replace("- default:", "").trim();
                    currentLib.overlayFiles.push({
                        defaultName: defVal,
                        templateVariables: {},
                        filters: {}
                    });
                    currentOverlayIndex = currentLib.overlayFiles.length - 1;
                    continue;
                }

                if (currentOverlayIndex >= 0) {
                    const activeOverlay = currentLib.overlayFiles[currentOverlayIndex];
                    if (trimmed.startsWith("default:")) {
                        activeOverlay.defaultName = trimmed.replace("default:", "").trim();
                    } else if (trimmed.includes(":")) {
                        const [tvKey, ...tvValParts] = trimmed.replace(/^[-\s]+/, "").split(":");
                        const tvVal = tvValParts.join(":").trim();
                        if (tvKey && activeOverlay.templateVariables) {
                            let parsedVal: any = tvVal;
                            if (tvVal === "true") parsedVal = true;
                            else if (tvVal === "false") parsedVal = false;
                            else if (!isNaN(Number(tvVal)) && tvVal !== "") parsedVal = Number(tvVal);
                            activeOverlay.templateVariables[tvKey.trim()] = parsedVal;
                        }
                    }
                }
            }

            if (currentSubSection === "asset_directory" || (currentSubSection === "settings" && trimmed.startsWith("- config/assets"))) {
                if (trimmed.startsWith("-")) {
                    const dirPath = trimmed.replace(/^[-\s]+/, "").trim();
                    if (dirPath && currentLib.assetDirectories) {
                        currentLib.assetDirectories.push(dirPath);
                    }
                }
            }
        }
    }

    return config;
}

/**
 * Maps parsed Kometa Library configuration into Portalarr OverlayRule payload.
 */
export function convertKometaLibraryToPortalarrOverlay(
    kometaLib: ParsedKometaLibrary,
    serverId: string,
    sectionKey: string
) {
    let showResolution = false;
    let showHdr = false;
    let dovetailResolutionHdr = true;
    let resolutionPosition = "top-right";
    let hdrPosition = "top-right";
    let videoPosition = "top-right";

    let showRibbon = false;
    let ribbonMode: "single" | "tiered" | "auto_stack" = "tiered";
    let ribbonPosition = "top-right";
    let ribbonTheme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" = "gold";
    let tieredRibbons: TieredRibbonItem[] = [];

    let showContentRating = false;
    let contentRatingPosition = "bottom-left";

    let showStudio = false;
    let studioPosition = "top-left";

    let showAudio = true;
    let audioPosition = "top-left";

    for (const ov of kometaLib.overlayFiles) {
        const def = (ov.defaultName || "").toLowerCase();
        const vars = ov.templateVariables || {};

        // 1. Resolution Overlay
        if (def.includes("resolution") || vars.use_resolution === true) {
            showResolution = true;
            showHdr = true;
            dovetailResolutionHdr = true;
            resolutionPosition = "top-right";
            hdrPosition = "top-right";
        }

        // 2. Diagonal Ribbons & Weighted Multi-Tier Awards
        if (def.includes("ribbon")) {
            showRibbon = true;
            ribbonMode = "tiered";
            ribbonPosition = "top-right";

            // Style mapping (yellow in kometa -> gold in portalarr)
            if (vars.style === "yellow" || vars.style === "gold") {
                ribbonTheme = "gold";
            } else if (vars.style === "crimson" || vars.style === "red") {
                ribbonTheme = "crimson";
            } else if (vars.style === "emerald" || vars.style === "green") {
                ribbonTheme = "emerald";
            }

            // Extract weighted tiers
            const candidates: Array<{ id: string; type: any; text: string; theme: any; weight: number; enabled: boolean }> = [];

            if (vars.weight_imdb !== undefined && vars.weight_imdb > 0) {
                const isTv = kometaLib.name.toLowerCase().includes("tv") || kometaLib.name.toLowerCase().includes("show");
                candidates.push({
                    id: isTv ? "imdb_top_250_tv" : "imdb_top_250",
                    type: isTv ? "imdb_top_250_tv" : "imdb_top_250",
                    text: isTv ? "IMDb TOP TV" : "IMDb TOP 250",
                    theme: ribbonTheme,
                    weight: Number(vars.weight_imdb) || 300,
                    enabled: true
                });
            }

            if (vars.weight_rottenverified !== undefined && vars.weight_rottenverified > 0 && vars.use_rottenverified !== false) {
                candidates.push({
                    id: "certified_fresh",
                    type: "certified_fresh",
                    text: "CERTIFIED FRESH",
                    theme: ribbonTheme,
                    weight: Number(vars.weight_rottenverified) || 198,
                    enabled: true
                });
            }

            if (vars.weight_rotten !== undefined && vars.weight_rotten > 0 && vars.use_rotten !== false) {
                candidates.push({
                    id: "rt_fresh",
                    type: "rt_fresh",
                    text: "RT FRESH",
                    theme: ribbonTheme,
                    weight: Number(vars.weight_rotten) || 197,
                    enabled: true
                });
            }

            if (vars.weight_metacritic !== undefined && vars.weight_metacritic > 0 && vars.use_metacritic !== false) {
                candidates.push({
                    id: "metacritic_must_see",
                    type: "metacritic_must_see",
                    text: "MUST-SEE",
                    theme: ribbonTheme,
                    weight: Number(vars.weight_metacritic) || 196,
                    enabled: true
                });
            }

            // Sort by weight descending
            candidates.sort((a, b) => b.weight - a.weight);
            tieredRibbons = candidates.map(c => ({
                id: c.id,
                type: c.type,
                text: c.text,
                theme: c.theme,
                enabled: c.enabled
            }));

            if (tieredRibbons.length === 0) {
                tieredRibbons = [
                    { id: "imdb_top_250", type: "imdb_top_250", text: "IMDb TOP 250", theme: "gold", enabled: true },
                    { id: "certified_fresh", type: "certified_fresh", text: "CERTIFIED FRESH", theme: "gold", enabled: true }
                ];
            }
        }

        // 3. Content Ratings (US Movies & TV)
        if (def.includes("content_rating")) {
            showContentRating = true;
            const hPos = vars.horizontal_position || "left";
            const vPos = vars.vertical_position || "bottom";
            contentRatingPosition = `${vPos}-${hPos}`;
        }

        // 4. TV Network Logos
        if (def.includes("network") || def.includes("studio")) {
            showStudio = true;
            studioPosition = "top-left";
        }
    }

    return {
        name: `Kometa - ${kometaLib.name}`,
        serverId,
        sectionKey,
        overlayType: "kometa_migrated",
        position: "top-right",
        videoPosition,
        resolutionPosition,
        hdrPosition,
        showResolution,
        showHdr,
        dovetailResolutionHdr,
        showAudio,
        audioPosition,
        showStudio,
        studioPosition,
        showContentRating,
        contentRatingPosition,
        showRibbon,
        ribbonMode,
        ribbonPosition,
        ribbonTheme,
        tieredRibbons,
        maxRibbonTiers: 3,
        theme: "glass" as const,
        badgeStyle: "pill",
        showLeavingSoon: true,
        enabled: true
    };
}
