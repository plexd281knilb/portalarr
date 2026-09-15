import fs from "fs";
import path from "path";
import { load as yamlLoad } from "js-yaml";
import prisma from "@/lib/prisma";
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
 * Standard, robust YAML parser for Kometa / Plex-Meta-Manager configuration files using js-yaml.
 */
export function parseKometaYamlString(yamlText: string): ParsedKometaConfig {
    const config: ParsedKometaConfig = {
        libraries: {}
    };

    if (!yamlText || !yamlText.trim()) return config;

    try {
        const rawDoc: any = yamlLoad(yamlText);
        if (!rawDoc || typeof rawDoc !== "object") return config;

        // 1. Plex Connections
        if (rawDoc.plex && typeof rawDoc.plex === "object") {
            config.plex = {
                url: rawDoc.plex.url ? String(rawDoc.plex.url) : undefined,
                token: rawDoc.plex.token ? String(rawDoc.plex.token) : undefined,
                timeout: Number(rawDoc.plex.timeout) || 60
            };
        }

        // 2. TMDb Connections
        if (rawDoc.tmdb && typeof rawDoc.tmdb === "object") {
            config.tmdb = {
                apikey: rawDoc.tmdb.apikey || rawDoc.tmdb.api_key ? String(rawDoc.tmdb.apikey || rawDoc.tmdb.api_key) : undefined,
                language: rawDoc.tmdb.language ? String(rawDoc.tmdb.language) : "en"
            };
        }

        // 3. Asset directories at root level
        if (rawDoc.settings?.asset_directory) {
            const dirs = Array.isArray(rawDoc.settings.asset_directory) 
                ? rawDoc.settings.asset_directory 
                : [rawDoc.settings.asset_directory];
            config.assetDirectories = dirs.map((d: any) => String(d));
        }

        // 4. Libraries
        if (rawDoc.libraries && typeof rawDoc.libraries === "object") {
            for (const [libName, rawLib] of Object.entries(rawDoc.libraries)) {
                if (!rawLib || typeof rawLib !== "object") continue;

                const libObj: any = rawLib;
                const parsedOverlayFiles: ParsedKometaOverlayFile[] = [];

                if (Array.isArray(libObj.overlay_files)) {
                    for (const item of libObj.overlay_files) {
                        if (!item || typeof item !== "object") continue;

                        const defaultName = item.default || item.name || item.overlay || "";
                        const filters = item.filters && typeof item.filters === "object" ? item.filters : {};
                        const templateVariables = item.template_variables && typeof item.template_variables === "object" ? item.template_variables : {};

                        parsedOverlayFiles.push({
                            defaultName: String(defaultName),
                            filters,
                            templateVariables
                        });
                    }
                }

                // Library specific asset directories
                const libAssetDirs: string[] = [];
                if (libObj.settings?.asset_directory) {
                    const dirs = Array.isArray(libObj.settings.asset_directory) 
                        ? libObj.settings.asset_directory 
                        : [libObj.settings.asset_directory];
                    libAssetDirs.push(...dirs.map((d: any) => String(d)));
                }

                config.libraries[libName] = {
                    name: libName,
                    removeOverlays: Boolean(libObj.remove_overlays),
                    reapplyOverlays: Boolean(libObj.reapply_overlays),
                    overlayFiles: parsedOverlayFiles,
                    assetDirectories: libAssetDirs
                };
            }
        }
    } catch (e: any) {
        console.error(`[Kometa YAML Parse Error] ${e.message}`);
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
    let ribbonPosition = "bottom-right";
    let ribbonTheme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" = "gold";
    let tieredRibbons: TieredRibbonItem[] = [];

    let showContentRating = false;
    let contentRatingPosition = "bottom-left";

    let showStudio = false;
    let studioPosition = "bottom-left";

    let showAudio = false;
    let audioPosition = "top-left";

    let showAudioChannels = false;
    let channelsPosition = "top-left";

    let showCodec = false;
    let codecPosition = "top-right";

    let showEdition = false;
    let editionPosition = "top-left";

    for (const ov of kometaLib.overlayFiles || []) {
        const def = (ov.defaultName || "").toLowerCase();
        const vars = ov.templateVariables || {};

        // 1. Resolution Overlay
        if (def.includes("resolution") || vars.use_resolution === true) {
            showResolution = true;
            showHdr = true;
            dovetailResolutionHdr = true;
            resolutionPosition = "top-right";
            hdrPosition = "top-right";

            if (vars.use_edition === true) {
                showEdition = true;
            } else if (vars.use_edition === false) {
                showEdition = false;
            }
        }

        // 2. Diagonal Ribbons & Weighted Multi-Tier Awards
        if (def.includes("ribbon")) {
            showRibbon = true;
            ribbonMode = "tiered";
            ribbonPosition = "top-right";

            // Style mapping (yellow in kometa -> gold in portalarr)
            const style = (vars.style || "yellow").toLowerCase();
            if (style === "yellow" || style === "gold") {
                ribbonTheme = "gold";
            } else if (style === "crimson" || style === "red") {
                ribbonTheme = "crimson";
            } else if (style === "emerald" || style === "green") {
                ribbonTheme = "emerald";
            } else if (style === "purple") {
                ribbonTheme = "purple";
            } else if (style === "glass" || style === "frosted") {
                ribbonTheme = "glass";
            } else if (style === "orange") {
                ribbonTheme = "orange";
            }

            // Extract weighted tiers
            const candidates: Array<{ id: string; type: any; text: string; theme: any; weight: number; enabled: boolean }> = [];

            if (vars.weight_imdb !== undefined && vars.weight_imdb > 0 && vars.use_imdb !== false) {
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
                    { id: "imdb_top_250", type: "imdb_top_250", text: "IMDb TOP 250", theme: ribbonTheme, enabled: true },
                    { id: "certified_fresh", type: "certified_fresh", text: "CERTIFIED FRESH", theme: ribbonTheme, enabled: true }
                ];
            }
        }

        // 3. Content Ratings (US Movies & TV)
        if (def.includes("content_rating") || def.includes("rating")) {
            showContentRating = true;
            const hPos = String(vars.horizontal_position || "left").toLowerCase();
            const vPos = String(vars.vertical_position || "bottom").toLowerCase();
            const cleanH = hPos === "right" ? "right" : hPos === "center" ? "center" : "left";
            const cleanV = vPos === "top" ? "top" : vPos === "center" ? "center" : "bottom";
            contentRatingPosition = `${cleanV}-${cleanH}`;
        }

        // 4. TV Network Logos / Studio Logos
        if (def.includes("network") || def.includes("studio")) {
            showStudio = true;
            studioPosition = "top-left";
        }

        // 5. Audio Codecs & Channels
        if (def.includes("audio")) {
            showAudio = true;
            audioPosition = "top-left";
        }
        if (def.includes("channel")) {
            showAudioChannels = true;
            channelsPosition = "top-left";
        }

        // 6. Video Codecs
        if (def.includes("codec")) {
            showCodec = true;
            codecPosition = "top-right";
        }

        // 7. Edition
        if (def.includes("edition")) {
            showEdition = true;
            editionPosition = "top-left";
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
        showAudioChannels,
        channelsPosition,
        showCodec,
        codecPosition,
        showEdition,
        editionPosition,
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
        showLeavingSoon: false,
        enabled: true
    };
}

/**
 * Reads and parses a local Kometa config.yml file from disk paths.
 */
export async function readLocalKometaConfigFile(
    customPath?: string
): Promise<{ success: boolean; content?: string; fileName?: string; error?: string }> {
    const candidatePaths = [
        customPath,
        path.join(process.cwd(), "kometaconfig.yml"),
        path.join(process.cwd(), "config.yml"),
        path.join(process.cwd(), "config", "config.yml"),
        "/config/config.yml",
        "/mnt/user/appdata/kometa/config.yml",
        "/mnt/user/appdata/plex-meta-manager/config.yml"
    ].filter(Boolean) as string[];

    for (const p of candidatePaths) {
        try {
            if (fs.existsSync(p)) {
                const stat = fs.statSync(p);
                if (stat.isFile()) {
                    const content = fs.readFileSync(p, "utf-8");
                    if (content.trim().length > 0) {
                        return {
                            success: true,
                            content,
                            fileName: path.basename(p)
                        };
                    }
                }
            }
        } catch (e: any) {
            // Continue search
        }
    }

    return {
        success: false,
        error: `No Kometa configuration file found. Checked: ${candidatePaths.slice(0, 4).join(", ")}`
    };
}
