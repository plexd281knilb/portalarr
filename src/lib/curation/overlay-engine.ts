import sharp from "sharp";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { fetchPlexPosterBuffer, uploadPlexItemPoster, PlexMediaStreamInfo } from "./plex-analyzer";

export interface TieredRibbonItem {
    id?: string;
    text?: string;
    theme?: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange";
    type?: "imdb_top_250" | "imdb_top_250_tv" | "certified_fresh" | "rt_fresh" | "oscar_winner" | "academy_award" | "emmy_winner" | "golden_globe" | "critics_choice" | "bafta_winner" | "cannes_winner" | "metacritic_must_see" | "auto_quality" | "auto_edition" | "leaving_soon" | "custom" | string;
    condition?: string;
    matchRule?: string;
    enabled?: boolean;
}

export interface OverlayOptions {
    showResolution?: boolean;
    showHdr?: boolean;
    showAudio?: boolean;
    showAudioChannels?: boolean;
    showCodec?: boolean;
    showEdition?: boolean;
    showStudio?: boolean;
    showContentRating?: boolean;
    showRatings?: boolean;
    showLeavingSoon?: boolean;
    leavingSoonDays?: number;
    showDigitalRelease?: boolean;
    digitalReleaseDate?: string;
    showPlaceholder?: boolean;
    placeholderType?: "in_theaters" | "countdown" | "now_streaming" | "releasing_date" | "coming_soon" | "not_requested" | "custom";
    placeholderDays?: number;
    placeholderDate?: string;
    placeholderText?: string;
    placeholderTheme?: "indigo-purple" | "crimson-red" | "emerald-green" | "amber-gold" | "cinematic-blue" | "glass";
    placeholderPosition?: "top" | "bottom" | "corner";
    position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    
    // Independent Badge Placement Positions
    videoPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    resolutionPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    hdrPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    codecPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    audioPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    channelsPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    editionPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    studioPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    contentRatingPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    ratingPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    ratingsPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    badgeScale?: number;
    
    showRibbon?: boolean;
    ribbonMode?: "single" | "tiered" | "auto_stack" | "waterfall";
    ribbonPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
    ribbonTheme?: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange";
    ribbonText?: string;
    ribbonType?: "auto_quality" | "auto_edition" | "leaving_soon" | "custom" | "imdb_top_250" | "imdb_top_250_tv" | "certified_fresh" | "rt_fresh" | "oscar_winner" | "academy_award" | "emmy_winner" | "golden_globe" | "critics_choice" | "bafta_winner" | "cannes_winner" | "metacritic_must_see";
    tieredRibbons?: TieredRibbonItem[];
    maxRibbonTiers?: number;
    theme?: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson";
    dovetailResolutionHdr?: boolean;
    ratingsSource?: {
        imdb?: number;
        rtCritics?: number;
        rtAudience?: number;
        metacritic?: number;
    };
    customBadges?: Array<{
        id: string;
        name: string;
        category?: string;
        matchRule?: string | null;
        filePath: string;
        position?: string;
        width?: number;
        height?: number;
        opacity?: number;
    }>;
    layerPriorityOrder?: string[];
}

const BACKUP_DIR = path.join(process.cwd(), "data", "art_backups");
const CUSTOM_BADGES_DIR = path.join(process.cwd(), "data", "custom_badges");
const STOCK_KOMETA_DIR = path.join(process.cwd(), "public", "kometa_stock");

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    if (!fs.existsSync(CUSTOM_BADGES_DIR)) {
        fs.mkdirSync(CUSTOM_BADGES_DIR, { recursive: true });
    }
}

/**
 * Reads an official Kometa stock asset buffer from public/kometa_stock.
 */
export function getStockKometaAssetBuffer(relativePath: string): Buffer | null {
    try {
        const fullPath = path.join(STOCK_KOMETA_DIR, relativePath);
        if (fs.existsSync(fullPath)) {
            return fs.readFileSync(fullPath);
        }
    } catch (e) {}
    return null;
}

/**
 * Resolves the matching official stock Kometa resolution/HDR dovetail PNG image.
 */
export function resolveStockResolutionBadgePath(
    resolution: string,
    hdr?: string | null
): string | null {
    const resUpper = (resolution || "").toUpperCase();
    const is4k = resUpper.includes("4K") || resUpper.includes("2160");
    const is1080 = resUpper.includes("1080");
    const is720 = resUpper.includes("720");
    const is576 = resUpper.includes("576");
    const is480 = resUpper.includes("480") || resUpper.includes("SD");

    const basePrefix = is4k ? "4k" : is1080 ? "1080p" : is720 ? "720p" : is576 ? "576p" : is480 ? "480p" : "";
    if (!basePrefix) return null;

    const hdrUpper = (hdr || "").toUpperCase();
    const isDv = hdrUpper.includes("DV") || hdrUpper.includes("DOLBY") || hdrUpper.includes("VISION");
    const isPlus = hdrUpper.includes("HDR10+") || hdrUpper.includes("PLUS");
    const isHdr = isDv || hdrUpper.includes("HDR") || hdrUpper.includes("HDR10");
    const isHlg = hdrUpper.includes("HLG");

    let candidate = "";
    if (isDv && isPlus) candidate = `resolution/${basePrefix}dvhdrplus.png`;
    else if (isDv && isHdr) candidate = `resolution/${basePrefix}dvhdr.png`;
    else if (isDv) candidate = `resolution/${basePrefix}dv.png`;
    else if (isPlus) candidate = `resolution/${basePrefix}plus.png`;
    else if (isHdr) candidate = `resolution/${basePrefix}hdr.png`;
    else if (isHlg) candidate = `resolution/${basePrefix}hlg.png`;
    else candidate = `resolution/${basePrefix}.png`;

    if (fs.existsSync(path.join(STOCK_KOMETA_DIR, candidate))) {
        return candidate;
    }
    return null;
}

/**
 * Resolves the matching official stock Kometa ribbon PNG image (with authentic laurel wreaths/logos).
 */
export function resolveStockRibbonPath(
    ribbonName: string,
    theme: string = "crimson"
): string | null {
    const color = (theme === "gold" || theme === "amber-gold") ? "yellow"
        : (theme === "glass" || theme === "minimal") ? "black"
        : (theme === "classic") ? "gray"
        : "red";

    const nameLower = ribbonName.toLowerCase().replace(/[^a-z0-9_]/g, "");

    let assetName = `blank-${color}`;
    if (nameLower.includes("oscar") || nameLower.includes("academy")) assetName = "oscars";
    else if (nameLower.includes("bafta")) assetName = "bafta";
    else if (nameLower.includes("cannes") || nameLower.includes("palme")) assetName = "cannes";
    else if (nameLower.includes("emmy")) assetName = "emmys";
    else if (nameLower.includes("golden") || nameLower.includes("globe")) assetName = "golden";
    else if (nameLower.includes("imdb") || nameLower.includes("top250") || nameLower.includes("top_250")) assetName = "imdb";
    else if (nameLower.includes("certified") || nameLower.includes("rottenverified")) assetName = "rottenverified";
    else if (nameLower.includes("rotten") || nameLower.includes("fresh")) assetName = "rotten";
    else if (nameLower.includes("meta") || nameLower.includes("mustsee")) assetName = "metacritic";
    else if (nameLower.includes("sundance")) assetName = "sundance";
    else if (nameLower.includes("venice")) assetName = "venice";
    else if (nameLower.includes("letterboxd")) assetName = "letterboxd";
    else if (nameLower.includes("choice")) assetName = "choice";
    else if (nameLower.includes("netflix")) assetName = "netflix";
    else if (nameLower.includes("razzie")) assetName = "razzie";
    else if (nameLower.includes("spirit")) assetName = "spirit";
    else if (nameLower.includes("cesar")) assetName = "cesar";
    else if (nameLower.includes("berlinale")) assetName = "berlinale";

    const candidate = `ribbon/${color}/${assetName}.png`;
    if (fs.existsSync(path.join(STOCK_KOMETA_DIR, candidate))) {
        return candidate;
    }

    const redCandidate = `ribbon/red/${assetName}.png`;
    if (fs.existsSync(path.join(STOCK_KOMETA_DIR, redCandidate))) {
        return redCandidate;
    }

    return null;
}

/**
 * Resolves stock Kometa edition badge PNG.
 */
export function resolveStockEditionBadgePath(edition: string): string | null {
    const nameLower = (edition || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const candidates = [
        `edition/${nameLower}.png`,
        `edition/${nameLower.replace(/edition$/, "")}.png`,
        `edition/${nameLower.replace(/cut$/, "")}.png`
    ];

    for (const c of candidates) {
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, c))) return c;
    }
    return null;
}

/**
 * Resolves stock Kometa audio codec badge PNG.
 */
export function resolveStockAudioCodecBadgePath(codec: string): string | null {
    const nameLower = (codec || "").toLowerCase();
    let filename = "";
    if (nameLower.includes("atmos")) filename = "atmos.png";
    else if (nameLower.includes("truehd")) filename = "truehd.png";
    else if (nameLower.includes("dts-hd") || nameLower.includes("dtshd")) filename = "dts-hd.png";
    else if (nameLower.includes("dts-x") || nameLower.includes("dtsx")) filename = "dts-x.png";
    else if (nameLower.includes("dts")) filename = "dts.png";
    else if (nameLower.includes("flac")) filename = "flac.png";
    else if (nameLower.includes("eac3") || nameLower.includes("ddp") || nameLower.includes("plus")) filename = "eac3.png";
    else if (nameLower.includes("ac3") || nameLower.includes("dolby digital")) filename = "ac3.png";
    else if (nameLower.includes("aac")) filename = "aac.png";
    else if (nameLower.includes("opus")) filename = "opus.png";

    if (filename) {
        const p = `audio_codec/standard/${filename}`;
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    return null;
}

/**
 * Creates Kometa-Style Dovetailed Composite SVG combining Resolution (4K, 1080p, 720p, SD) and HDR (Dolby Vision, HDR10+, HDR, SDR)
 * into a single interlocking horizontal pill badge.
 */
export function generateDovetailedResolutionHdrBadgeSvg(
    resolution: "4K" | "1080p" | "720p" | "SD" | string = "4K",
    hdr?: "DV" | "HDR10+" | "HDR10" | "HDR" | "SDR" | string | null,
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const is4k = resolution.toUpperCase().includes("4K") || resolution.includes("2160");
    const isFhd = resolution.toUpperCase().includes("1080");
    const isHd = resolution.toUpperCase().includes("720");
    const resText = is4k ? "4K" : isFhd ? "1080p" : isHd ? "720p" : resolution.toUpperCase();
    const resSub = is4k ? "UHD" : isFhd ? "FHD" : isHd ? "HD" : "SD";

    const hdrType = (hdr || (is4k ? "HDR" : "SDR")).toUpperCase();
    const isDv = hdrType === "DV" || hdrType.includes("DOLBY") || hdrType.includes("VISION");
    const isHdr10Plus = hdrType.includes("HDR10+") || hdrType.includes("PLUS");
    const isHdr = !isDv && (hdrType.includes("HDR") || hdrType === "HDR10");

    const width = isDv ? 245 : (isHdr10Plus ? 230 : 210);
    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" : 
                   theme === "classic" ? "rgba(15, 23, 42, 0.96)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.95)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.94)";

    let strokeGrad = "url(#dtGoldGrad)";
    if (theme === "cyber") strokeGrad = "url(#dtCyberGrad)";
    else if (theme === "crimson") strokeGrad = "url(#dtCrimsonGrad)";
    else if (theme === "classic") strokeGrad = "#94a3b8";
    else if (theme === "minimal") strokeGrad = "rgba(255,255,255,0.25)";
    else if (isDv) strokeGrad = "url(#dtDvGrad)";
    else if (isHdr10Plus) strokeGrad = "url(#dtPlusGrad)";
    else if (isHdr) strokeGrad = "url(#dtHdrGrad)";
    else if (isFhd) strokeGrad = "url(#dtFhdGrad)";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="dtGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a" />
                <stop offset="50%" stop-color="#eab308" />
                <stop offset="100%" stop-color="#ca8a04" />
            </linearGradient>
            <linearGradient id="dtDvGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fbbf24" />
                <stop offset="40%" stop-color="#c084fc" />
                <stop offset="100%" stop-color="#818cf8" />
            </linearGradient>
            <linearGradient id="dtPlusGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fbbf24" />
                <stop offset="50%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
            <linearGradient id="dtHdrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#facc15" />
                <stop offset="100%" stop-color="#38bdf8" />
            </linearGradient>
            <linearGradient id="dtFhdGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#0284c7" />
            </linearGradient>
            <linearGradient id="dtCyberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#22d3ee" />
                <stop offset="50%" stop-color="#a855f7" />
                <stop offset="100%" stop-color="#ec4899" />
            </linearGradient>
            <linearGradient id="dtCrimsonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f43f5e" />
                <stop offset="50%" stop-color="#be123c" />
                <stop offset="100%" stop-color="#881337" />
            </linearGradient>
            <filter id="dtShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.85"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#dtShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="${theme === 'gold' ? 'rgba(254,240,138,0.5)' : theme === 'crimson' ? 'rgba(253,164,175,0.6)' : theme === 'cyber' ? 'rgba(34,211,238,0.6)' : 'rgba(255,255,255,0.4)'}" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        
        <!-- Left: Resolution -->
        <text x="36" y="29" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="18.5" fill="${theme === 'gold' || is4k ? '#facc15' : theme === 'cyber' ? '#22d3ee' : theme === 'crimson' ? '#fda4af' : '#38bdf8'}" text-anchor="middle" letter-spacing="0.5">${resText}</text>
        <text x="70" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="11" fill="rgba(255,255,255,0.6)" text-anchor="middle" letter-spacing="1.5">${resSub}</text>
        
        <!-- Dovetail Interlocking Notch / Vertical Divider -->
        <line x1="90" y1="10" x2="90" y2="36" stroke="${theme === 'gold' ? 'rgba(250,204,21,0.4)' : theme === 'cyber' ? 'rgba(34,211,238,0.4)' : 'rgba(255,255,255,0.25)'}" stroke-width="1.5"/>
        <circle cx="90" cy="23" r="2.5" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#22d3ee' : 'rgba(255,255,255,0.4)'}"/>

        <!-- Right: HDR / Dolby Vision / SDR -->
        ${isDv ? `
            <!-- Dolby double-D iconic mark -->
            <g transform="translate(104, 15)">
                <rect x="0" y="0" width="4" height="16" rx="1.2" fill="${theme === 'cyber' ? '#22d3ee' : theme === 'gold' ? '#facc15' : theme === 'crimson' ? '#f43f5e' : '#c084fc'}"/>
                <path d="M 5 0 A 8 8 0 0 1 5 16 Z" fill="${theme === 'cyber' ? '#22d3ee' : theme === 'gold' ? '#facc15' : theme === 'crimson' ? '#f43f5e' : '#c084fc'}"/>
                <path d="M 18 0 A 8 8 0 0 0 18 16 Z" fill="${theme === 'cyber' ? '#a855f7' : theme === 'gold' ? '#eab308' : theme === 'crimson' ? '#be123c' : '#818cf8'}"/>
                <rect x="19" y="0" width="4" height="16" rx="1.2" fill="${theme === 'cyber' ? '#a855f7' : theme === 'gold' ? '#eab308' : theme === 'crimson' ? '#be123c' : '#818cf8'}"/>
            </g>
            <text x="180" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="12.5" fill="#f8fafc" text-anchor="middle" letter-spacing="1.5">DOLBY VISION</text>
        ` : isHdr10Plus ? `
            <text x="${90 + (width - 90) / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="14.5" fill="${theme === 'cyber' ? '#22d3ee' : theme === 'gold' ? '#facc15' : theme === 'crimson' ? '#fda4af' : '#38bdf8'}" text-anchor="middle" letter-spacing="1.5">HDR10+</text>
        ` : isHdr ? `
            <text x="${90 + (width - 90) / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="14.5" fill="${theme === 'cyber' ? '#22d3ee' : theme === 'gold' ? '#facc15' : theme === 'crimson' ? '#fda4af' : '#38bdf8'}" text-anchor="middle" letter-spacing="1.5">${hdrType === "HDR10" ? "HDR10" : "HDR"}</text>
        ` : `
            <text x="${90 + (width - 90) / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="13" fill="rgba(255,255,255,0.7)" text-anchor="middle" letter-spacing="1.5">SDR</text>
        `}
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for a resolution badge (4K UHD, 1080p FHD, 720p HD, SD).
 * Features specular top highlight, metallic border gradients, and deep obsidian glass backdrop.
 */
export function generateResolutionBadgeSvg(
    resolution: "4K" | "1080p" | "720p" | "SD",
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const is4k = resolution === "4K";
    const bgFill = theme === "gold" && is4k 
        ? "url(#goldBgGrad)" 
        : theme === "gold"
            ? "rgba(20, 15, 5, 0.95)"
            : theme === "cyber"
                ? "rgba(2, 6, 23, 0.94)"
                : theme === "crimson"
                    ? "rgba(20, 5, 10, 0.95)"
                    : theme === "classic"
                        ? "rgba(15, 23, 42, 0.94)"
                        : theme === "minimal"
                            ? "rgba(0, 0, 0, 0.85)"
                            : "rgba(8, 12, 22, 0.92)";
    
    let strokeGrad = is4k 
        ? (theme === "cyber" ? "url(#cyberStrokeGrad)" : theme === "crimson" ? "url(#crimsonStrokeGrad)" : "url(#goldStrokeGrad)")
        : resolution === "1080p"
            ? (theme === "cyber" ? "url(#cyberStrokeGrad)" : theme === "crimson" ? "url(#crimsonStrokeGrad)" : "url(#fhdStrokeGrad)")
            : "url(#hdStrokeGrad)";

    if (theme === "classic") strokeGrad = "#94a3b8";
    if (theme === "minimal") strokeGrad = "rgba(255,255,255,0.25)";

    const textColor = is4k && theme === "gold" ? "#000000" : theme === "cyber" ? "#22d3ee" : theme === "crimson" ? "#fda4af" : "#ffffff";
    const subColor = is4k && theme === "gold" ? "#1e293b" : is4k ? "#fef08a" : theme === "cyber" ? "#a855f7" : theme === "crimson" ? "#f43f5e" : "#93c5fd";
    const textLabel = is4k ? "4K" : resolution;
    const subLabel = is4k ? "UHD" : resolution === "1080p" ? "FHD" : "HD";
    const dividerColor = is4k ? (theme === "gold" ? "rgba(0,0,0,0.3)" : "rgba(234,179,8,0.5)") : "rgba(148,163,184,0.4)";

    return `
    <svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="goldStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a" />
                <stop offset="50%" stop-color="#eab308" />
                <stop offset="100%" stop-color="#ca8a04" />
            </linearGradient>
            <linearGradient id="goldBgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef9c3" />
                <stop offset="50%" stop-color="#facc15" />
                <stop offset="100%" stop-color="#eab308" />
            </linearGradient>
            <linearGradient id="fhdStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#0284c7" />
            </linearGradient>
            <linearGradient id="hdStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#94a3b8" />
                <stop offset="100%" stop-color="#64748b" />
            </linearGradient>
            <linearGradient id="cyberStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#22d3ee" />
                <stop offset="100%" stop-color="#a855f7" />
            </linearGradient>
            <linearGradient id="crimsonStrokeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f43f5e" />
                <stop offset="100%" stop-color="#be123c" />
            </linearGradient>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <!-- Outer Glassmorphism Base -->
        <rect x="2" y="2" width="136" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight (Kometa Gloss Effect) -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="132" y2="5" stroke="${theme === 'gold' && is4k ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.4)'}" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        <!-- Main Resolution Text -->
        <text x="40" y="29" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="20" fill="${textColor}" text-anchor="middle" letter-spacing="0.5">${textLabel}</text>
        <!-- Center Divider Line -->
        <line x1="72" y1="10" x2="72" y2="36" stroke="${dividerColor}" stroke-width="1.5"/>
        <!-- Sub-Label (UHD / FHD / HD) -->
        <text x="105" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="14" fill="${subColor}" text-anchor="middle" letter-spacing="2">${subLabel}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for HDR / Dolby Vision badge.
 * Features iconic Dolby double-D emblem or electric HDR glow.
 */
export function generateHdrBadgeSvg(
    hdrType: "DV" | "HDR10+" | "HDR10" | "HDR",
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const isDv = hdrType === "DV";
    const width = isDv ? 175 : 140;
    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" :
                   theme === "classic" ? "rgba(15, 23, 42, 0.94)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.94)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.92)";

    let strokeGrad = isDv ? "url(#dvGrad)" : "url(#hdrGrad)";
    if (theme === "gold") strokeGrad = "url(#hdrGoldGrad)";
    else if (theme === "cyber") strokeGrad = "url(#hdrCyberGrad)";
    else if (theme === "crimson") strokeGrad = "url(#hdrCrimsonGrad)";
    else if (theme === "classic") strokeGrad = "#94a3b8";
    else if (theme === "minimal") strokeGrad = "rgba(255,255,255,0.25)";

    if (isDv) {
        return `
        <svg width="175" height="46" viewBox="0 0 175 46" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="dvGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#c084fc" />
                    <stop offset="50%" stop-color="#818cf8" />
                    <stop offset="100%" stop-color="#6366f1" />
                </linearGradient>
                <linearGradient id="hdrGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#fef08a" /><stop offset="100%" stop-color="#eab308" />
                </linearGradient>
                <linearGradient id="hdrCyberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#22d3ee" /><stop offset="100%" stop-color="#a855f7" />
                </linearGradient>
                <linearGradient id="hdrCrimsonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#f43f5e" /><stop offset="100%" stop-color="#be123c" />
                </linearGradient>
                <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                    <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
                </filter>
            </defs>
            <rect x="2" y="2" width="171" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
            <!-- Specular Top Highlight -->
            ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="167" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
            <!-- Dolby double-D iconic mark -->
            <g transform="translate(14, 15)">
                <rect x="0" y="0" width="4.5" height="16" rx="1.5" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#22d3ee' : theme === 'crimson' ? '#f43f5e' : '#c084fc'}"/>
                <path d="M 6 0 A 8 8 0 0 1 6 16 Z" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#22d3ee' : theme === 'crimson' ? '#f43f5e' : '#c084fc'}"/>
                <path d="M 21 0 A 8 8 0 0 0 21 16 Z" fill="${theme === 'gold' ? '#eab308' : theme === 'cyber' ? '#a855f7' : theme === 'crimson' ? '#be123c' : '#818cf8'}"/>
                <rect x="22.5" y="0" width="4.5" height="16" rx="1.5" fill="${theme === 'gold' ? '#eab308' : theme === 'cyber' ? '#a855f7' : theme === 'crimson' ? '#be123c' : '#818cf8'}"/>
            </g>
            <!-- Dolby Vision Text -->
            <text x="106" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="13.5" fill="#f8fafc" text-anchor="middle" letter-spacing="1.8">DOLBY VISION</text>
        </svg>`;
    }

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="hdrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#0284c7" />
            </linearGradient>
            <linearGradient id="hdrGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a" /><stop offset="100%" stop-color="#eab308" />
            </linearGradient>
            <linearGradient id="hdrCyberGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#22d3ee" /><stop offset="100%" stop-color="#a855f7" />
            </linearGradient>
            <linearGradient id="hdrCrimsonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f43f5e" /><stop offset="100%" stop-color="#be123c" />
            </linearGradient>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        <text x="${width / 2}" y="29" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="16" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#22d3ee' : theme === 'crimson' ? '#fda4af' : '#f8fafc'}" text-anchor="middle" letter-spacing="1.8">${hdrType}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Audio codec badge (Dolby Atmos, TrueHD, DTS:X, DTS-HD MA, 5.1/7.1).
 */
export function generateAudioBadgeSvg(
    audio: "ATMOS" | "TRUEHD" | "DTS:X" | "DTS-HD" | "5.1" | "7.1" | string,
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const isAtmos = audio === "ATMOS";
    const isDts = audio.startsWith("DTS");
    const isTrueHd = audio === "TRUEHD";
    const width = isAtmos ? 170 : isDts ? 155 : isTrueHd ? 145 : 135;
    const label = isAtmos ? "DOLBY ATMOS" : isTrueHd ? "TRUEHD 7.1" : audio === "DTS:X" ? "DTS:X" : audio === "DTS-HD" ? "DTS-HD MA" : `${audio} AUDIO`;
    
    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" :
                   theme === "classic" ? "rgba(15, 23, 42, 0.94)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.94)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.92)";

    let strokeGrad = `url(#audioStroke_${audio.replace(/[^a-zA-Z0-9]/g, '')})`;
    if (theme === "gold") strokeGrad = "#eab308";
    else if (theme === "cyber") strokeGrad = "#22d3ee";
    else if (theme === "crimson") strokeGrad = "#f43f5e";
    else if (theme === "classic") strokeGrad = "#94a3b8";
    else if (theme === "minimal") strokeGrad = "rgba(255,255,255,0.25)";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="audioStroke_${audio.replace(/[^a-zA-Z0-9]/g, '')}" x1="0%" y1="0%" x2="100%" y2="100%">
                ${isAtmos ? '<stop offset="0%" stop-color="#38bdf8" /><stop offset="100%" stop-color="#0ea5e9" />' : ''}
                ${isTrueHd ? '<stop offset="0%" stop-color="#c084fc" /><stop offset="100%" stop-color="#a855f7" />' : ''}
                ${isDts ? '<stop offset="0%" stop-color="#f59e0b" /><stop offset="100%" stop-color="#ea580c" />' : ''}
                ${!isAtmos && !isTrueHd && !isDts ? '<stop offset="0%" stop-color="#38bdf8" /><stop offset="100%" stop-color="#0284c7" />' : ''}
            </linearGradient>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="13.5" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#22d3ee' : theme === 'crimson' ? '#fda4af' : '#f8fafc'}" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Audio Channels badge (7.1, 5.1, 2.0).
 */
export function generateAudioChannelBadgeSvg(
    channels: string,
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const width = 115;
    const label = `${channels} CH`;
    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" :
                   theme === "classic" ? "rgba(15, 23, 42, 0.94)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.94)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.92)";

    let strokeGrad = "url(#chGrad)";
    if (theme === "gold") strokeGrad = "#eab308";
    else if (theme === "cyber") strokeGrad = "#22d3ee";
    else if (theme === "crimson") strokeGrad = "#f43f5e";
    else if (theme === "classic") strokeGrad = "#94a3b8";
    else if (theme === "minimal") strokeGrad = "rgba(255,255,255,0.25)";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="chGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="14" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#22d3ee' : theme === 'crimson' ? '#fda4af' : '#38bdf8'}" text-anchor="middle" letter-spacing="1.8">${label}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Video Codec badge (HEVC, AVC, AV1, ProRes).
 */
export function generateCodecBadgeSvg(
    codec: string,
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const width = 125;
    const cUpper = codec.toUpperCase();
    const label = cUpper.includes("HEVC") ? "HEVC • 10b" : cUpper.includes("AV1") ? "AV1 • HDR" : cUpper.includes("AVC") ? "AVC • x264" : cUpper;
    
    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" :
                   theme === "classic" ? "rgba(15, 23, 42, 0.94)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.94)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.92)";

    let strokeGrad = "url(#codecGrad)";
    if (theme === "gold") strokeGrad = "#eab308";
    else if (theme === "cyber") strokeGrad = "#a855f7";
    else if (theme === "crimson") strokeGrad = "#f43f5e";
    else if (theme === "classic") strokeGrad = "#94a3b8";
    else if (theme === "minimal") strokeGrad = "rgba(255,255,255,0.25)";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="codecGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#818cf8" />
                <stop offset="100%" stop-color="#6366f1" />
            </linearGradient>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="13" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#c084fc' : theme === 'crimson' ? '#fda4af' : '#c7d2fe'}" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Movie Edition / Cut badge (IMAX Enhanced, Criterion, Director's Cut, Extended, Remux).
 */
export function generateEditionBadgeSvg(
    edition: string,
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const isImax = edition.toUpperCase().includes("IMAX");
    const isCriterion = edition.toUpperCase().includes("CRITERION");
    const isRemux = edition.toUpperCase().includes("REMUX");
    const width = isImax ? 165 : isCriterion ? 175 : isRemux ? 160 : 180;
    
    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" :
                   theme === "classic" ? "rgba(15, 23, 42, 0.94)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.94)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.94)";

    let strokeGrad = isImax 
        ? "url(#imaxGrad)" 
        : isCriterion 
            ? "url(#critGrad)" 
            : isRemux
                ? "url(#remuxGrad)"
                : "url(#editGrad)";

    if (theme === "gold") strokeGrad = "url(#critGrad)";
    else if (theme === "cyber") strokeGrad = "url(#imaxGrad)";
    else if (theme === "crimson") strokeGrad = "#f43f5e";
    else if (theme === "classic") strokeGrad = "#94a3b8";
    else if (theme === "minimal") strokeGrad = "rgba(255,255,255,0.25)";

    const label = isImax ? "IMAX ENHANCED" : isCriterion ? "CRITERION" : isRemux ? "REMUX • LOSSLESS" : edition.toUpperCase();

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="imaxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#0284c7" />
            </linearGradient>
            <linearGradient id="critGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a" />
                <stop offset="50%" stop-color="#f59e0b" />
                <stop offset="100%" stop-color="#d97706" />
            </linearGradient>
            <linearGradient id="remuxGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34d399" />
                <stop offset="100%" stop-color="#059669" />
            </linearGradient>
            <linearGradient id="editGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f472b6" />
                <stop offset="100%" stop-color="#db2777" />
            </linearGradient>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="12.5" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#38bdf8' : theme === 'crimson' ? '#fda4af' : '#fdf4ff'}" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Studio / Network badge (HBO, Netflix, Disney+, Apple TV+, Prime, Marvel, DC, A24, Paramount+).
 */
export function generateStudioLogoBadgeSvg(
    studio: string,
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const s = studio.toUpperCase();
    const width = 145;
    let strokeColor = "#a855f7";
    let textColor = "#ffffff";

    if (s.includes("NETFLIX")) strokeColor = "#ef4444";
    else if (s.includes("DISNEY")) strokeColor = "#38bdf8";
    else if (s.includes("APPLE")) strokeColor = "#e2e8f0";
    else if (s.includes("PRIME") || s.includes("AMAZON")) strokeColor = "#00a8e1";
    else if (s.includes("MARVEL")) strokeColor = "#dc2626";
    else if (s.includes("DC")) strokeColor = "#2563eb";
    else if (s.includes("A24")) strokeColor = "#f59e0b";
    else if (s.includes("PARAMOUNT")) strokeColor = "#0064ff";
    else if (s.includes("HBO") || s.includes("MAX")) strokeColor = "#9333ea";

    if (theme === "gold") strokeColor = "#eab308";
    else if (theme === "cyber") strokeColor = "#22d3ee";
    else if (theme === "crimson") strokeColor = "#f43f5e";
    else if (theme === "classic") strokeColor = "#94a3b8";
    else if (theme === "minimal") strokeColor = "rgba(255,255,255,0.25)";

    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" :
                   theme === "classic" ? "rgba(15, 23, 42, 0.94)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.94)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.94)";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeColor}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="13" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#22d3ee' : textColor}" text-anchor="middle" letter-spacing="1.8">${s}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Content Rating badge (G, PG, PG-13, R, NC-17, TV-MA, TV-14, TV-PG, TV-G).
 */
export function generateContentRatingBadgeSvg(
    rating: string,
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const r = rating.toUpperCase();
    const isMature = r.includes("R") || r.includes("TV-MA") || r.includes("NC-17");
    const isTeen = r.includes("PG-13") || r.includes("TV-14");
    const width = 95;
    let strokeColor = isMature ? "#f43f5e" : isTeen ? "#fb923c" : "#10b981";

    if (theme === "gold") strokeColor = "#eab308";
    else if (theme === "cyber") strokeColor = isMature ? "#f43f5e" : "#22d3ee";
    else if (theme === "crimson") strokeColor = "#f43f5e";
    else if (theme === "classic") strokeColor = "#94a3b8";
    else if (theme === "minimal") strokeColor = "rgba(255,255,255,0.25)";

    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" :
                   theme === "classic" ? "rgba(15, 23, 42, 0.94)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.94)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.92)";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeColor}" stroke-width="${theme === 'minimal' ? 1.2 : 1.8}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="14" fill="${theme === 'gold' ? '#facc15' : theme === 'cyber' ? '#22d3ee' : '#f8fafc'}" text-anchor="middle" letter-spacing="1.2">${r}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Community Ratings badge (IMDb, RT Critics, RT Audience, Metacritic).
 */
export function generateRatingsBadgeSvg(
    ratings: {
        imdb?: number;
        rtCritics?: number;
        rtAudience?: number;
        metacritic?: number;
    },
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const segments: string[] = [];
    let curX = 12;

    if (ratings.imdb) {
        segments.push(`
            <rect x="${curX}" y="8" width="32" height="24" rx="4" fill="#f5c518"/>
            <text x="${curX + 16}" y="24" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#000" text-anchor="middle">IMDb</text>
            <text x="${curX + 40}" y="25" font-family="system-ui, sans-serif" font-weight="900" font-size="15" fill="#fff">${ratings.imdb.toFixed(1)}</text>
        `);
        curX += 78;
    }

    if (ratings.rtCritics) {
        const isFresh = ratings.rtCritics >= 60;
        segments.push(`
            <text x="${curX + 8}" y="25" font-size="16">${isFresh ? "🍅" : "🟢"}</text>
            <text x="${curX + 30}" y="25" font-family="system-ui, sans-serif" font-weight="900" font-size="15" fill="#fff">${ratings.rtCritics}%</text>
        `);
        curX += 74;
    }

    if (ratings.rtAudience) {
        segments.push(`
            <text x="${curX + 8}" y="25" font-size="16">🍿</text>
            <text x="${curX + 30}" y="25" font-family="system-ui, sans-serif" font-weight="900" font-size="15" fill="#fff">${ratings.rtAudience}%</text>
        `);
        curX += 74;
    }

    if (ratings.metacritic) {
        segments.push(`
            <rect x="${curX}" y="8" width="24" height="24" rx="4" fill="#66cc33"/>
            <text x="${curX + 12}" y="24" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#fff" text-anchor="middle">MC</text>
            <text x="${curX + 32}" y="25" font-family="system-ui, sans-serif" font-weight="900" font-size="15" fill="#fff">${ratings.metacritic}</text>
        `);
        curX += 68;
    }

    if (segments.length === 0) return "";

    const totalWidth = curX + 6;
    const bgFill = theme === "gold" ? "rgba(20, 15, 5, 0.95)" :
                   theme === "classic" ? "rgba(15, 23, 42, 0.94)" :
                   theme === "minimal" ? "rgba(0, 0, 0, 0.85)" :
                   theme === "cyber" ? "rgba(2, 6, 23, 0.94)" :
                   theme === "crimson" ? "rgba(20, 5, 10, 0.95)" :
                   "rgba(8, 12, 22, 0.94)";

    const strokeColor = theme === "gold" ? "#eab308" :
                        theme === "cyber" ? "#22d3ee" :
                        theme === "crimson" ? "#f43f5e" :
                        theme === "classic" ? "#94a3b8" :
                        theme === "minimal" ? "rgba(255,255,255,0.25)" :
                        "rgba(255, 255, 255, 0.25)";

    return `
    <svg width="${totalWidth}" height="46" viewBox="0 0 ${totalWidth} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${totalWidth - 4}" height="42" rx="8" fill="${bgFill}" stroke="${strokeColor}" stroke-width="${theme === 'minimal' ? 1.2 : 1.5}" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        ${theme !== 'minimal' ? `<line x1="8" y1="5" x2="${totalWidth - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>` : ''}
        ${segments.join("")}
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for "LEAVING SOON" warning banner.
 */
export function generateLeavingSoonRibbonSvg(daysRemaining?: number): string {
    const text = daysRemaining !== undefined && daysRemaining > 0 
        ? `⚠️ LEAVING SOON • ${daysRemaining} DAYS LEFT` 
        : `⚠️ LEAVING SOON`;

    return `
    <svg width="600" height="56" viewBox="0 0 600 56" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="warnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#991b1b" />
                <stop offset="50%" stop-color="#dc2626" />
                <stop offset="100%" stop-color="#991b1b" />
            </linearGradient>
            <filter id="bannerShadow" x="-5%" y="-10%" width="110%" height="130%">
                <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="0" y="0" width="600" height="56" fill="url(#warnGrad)" filter="url(#bannerShadow)"/>
        <!-- Top Highlight Line -->
        <line x1="0" y1="2" x2="600" y2="2" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
        <!-- Bottom Neon Line -->
        <line x1="0" y1="54" x2="600" y2="54" stroke="#fca5a5" stroke-width="2"/>
        <text x="300" y="36" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="20" fill="#ffffff" text-anchor="middle" letter-spacing="2.5">${text}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Digital Release countdown ribbon.
 */
export function generateDigitalReleaseRibbonSvg(daysRemaining: number, formattedDate?: string): string {
    const text = daysRemaining === 0 
        ? `✨ NOW STREAMING ON DIGITAL` 
        : daysRemaining > 0 
            ? `STREAMING ON DIGITAL IN ${daysRemaining} DAYS${formattedDate ? ` (${formattedDate})` : ''}`
            : `AVAILABLE ON DIGITAL`;

    return `
    <svg width="600" height="52" viewBox="0 0 600 52" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="streamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#1e1b4b" />
                <stop offset="50%" stop-color="#4f46e5" />
                <stop offset="100%" stop-color="#1e1b4b" />
            </linearGradient>
            <filter id="bannerShadow" x="-5%" y="-10%" width="110%" height="130%">
                <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.75"/>
            </filter>
        </defs>
        <rect x="0" y="0" width="600" height="52" fill="url(#streamGrad)" filter="url(#bannerShadow)"/>
        <line x1="0" y1="2" x2="600" y2="2" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
        <line x1="0" y1="50" x2="600" y2="50" stroke="#a5b4fc" stroke-width="2"/>
        <text x="300" y="33" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="16.5" fill="#e0e7ff" text-anchor="middle" letter-spacing="2">${text}</text>
    </svg>`;
}

/**
 * Interpolates dynamic template variables for Agregarr/Kometa style banners:
 * {date}, {days}, {title}, {source}, {status}, {reason}, {quality}
 */
export function interpolateBannerText(
    template: string,
    variables: {
        title?: string;
        date?: string;
        formattedDate?: string;
        days?: number | string;
        daysRemaining?: number | string;
        source?: string;
        status?: string;
        reason?: string;
        quality?: string;
    } = {}
): string {
    if (!template) return "";
    let result = template;
    const dateVal = variables.formattedDate || variables.date || "";
    const daysVal = String(variables.daysRemaining ?? variables.days ?? "7");
    const titleVal = variables.title || "";
    const sourceVal = variables.source || "Radarr";
    const statusVal = variables.status || "Downloading Soon";
    const reasonVal = variables.reason || "Storage Threshold";
    const qualityVal = variables.quality || "4K UHD";

    result = result
        .replace(/\{date\}/gi, dateVal)
        .replace(/\{formattedDate\}/gi, dateVal)
        .replace(/\{days\}/gi, daysVal)
        .replace(/\{daysRemaining\}/gi, daysVal)
        .replace(/\{title\}/gi, titleVal)
        .replace(/\{source\}/gi, sourceVal)
        .replace(/\{status\}/gi, statusVal)
        .replace(/\{reason\}/gi, reasonVal)
        .replace(/\{quality\}/gi, qualityVal);

    return result;
}

/**
 * Creates Kometa/Agregarr-Style SVG for Placeholder & Status Banners with customizable themes, templates & variables.
 */
export function generatePlaceholderRibbonSvg(
    type: string,
    options: {
        daysRemaining?: number | string;
        formattedDate?: string;
        date?: string;
        customText?: string;
        title?: string;
        source?: string;
        status?: string;
        reason?: string;
        quality?: string;
        theme?: "indigo-purple" | "crimson-red" | "emerald-green" | "amber-gold" | "cinematic-blue" | "glass" | "netflix-red" | "slate-frosted" | "cyber-neon" | string;
    } = {}
): string {
    const theme = options.theme || "indigo-purple";
    const dateStr = options.formattedDate || options.date || "";
    const daysStr = String(options.daysRemaining ?? "7");

    let label = "🚀 COMING SOON";

    switch (type) {
        case "in_theaters":
            label = dateStr ? `🎬 IN THEATERS (${dateStr})` : "🎬 IN THEATERS NOW";
            break;
        case "now_streaming":
            label = "🔥 NOW STREAMING ON DIGITAL";
            break;
        case "countdown":
            label = daysStr === "0" ? "✨ STREAMING TODAY" : `✨ STREAMING IN ${daysStr} DAYS${dateStr ? ` (${dateStr})` : ''}`;
            break;
        case "releasing_date":
        case "digital_release":
            label = dateStr ? `📅 DIGITAL RELEASE ON ${dateStr}` : "📅 DIGITAL RELEASE ANNOUNCED";
            break;
        case "downloading_soon":
            label = "⬇️ DOWNLOADING SOON";
            break;
        case "in_radarr":
            label = "🎬 MONITORED IN RADARR";
            break;
        case "in_sonarr":
            label = "📺 MONITORED IN SONARR";
            break;
        case "leaving_date":
            label = dateStr ? `⚠️ LEAVING ON ${dateStr}` : "⚠️ LEAVING SOON";
            break;
        case "leaving_days":
        case "leaving_soon":
            label = daysStr && daysStr !== "0" ? `⚠️ LEAVING IN ${daysStr} DAYS` : "⚠️ LEAVING SOON";
            break;
        case "trending_not_requested":
            label = "🔥 TRENDING • NOT REQUESTED";
            break;
        case "popular_streaming":
            label = `👑 POPULAR ON ${options.source || "STREAMING"}`.toUpperCase();
            break;
        case "missing_library":
            label = "🚫 NOT IN PLEX LIBRARY";
            break;
        case "not_requested":
            label = options.customText ? options.customText.toUpperCase() : "🚫 NOT REQUESTED";
            break;
        case "custom":
        default:
            if (options.customText) {
                label = interpolateBannerText(options.customText, options).toUpperCase();
            }
            break;
    }

    // Apply template interpolation if custom text contains braces
    if (options.customText && options.customText.includes("{")) {
        label = interpolateBannerText(options.customText, options).toUpperCase();
    }

    let gradStops = `<stop offset="0%" stop-color="#1e1b4b" /><stop offset="50%" stop-color="#6366f1" /><stop offset="100%" stop-color="#1e1b4b" />`;
    let lineStroke = "#a5b4fc";

    if (theme === "crimson-red" || theme === "netflix-red") {
        gradStops = `<stop offset="0%" stop-color="#881337" /><stop offset="50%" stop-color="#e11d48" /><stop offset="100%" stop-color="#881337" />`;
        lineStroke = "#fda4af";
    } else if (theme === "emerald-green") {
        gradStops = `<stop offset="0%" stop-color="#064e3b" /><stop offset="50%" stop-color="#059669" /><stop offset="100%" stop-color="#064e3b" />`;
        lineStroke = "#6ee7b7";
    } else if (theme === "amber-gold") {
        gradStops = `<stop offset="0%" stop-color="#78350f" /><stop offset="50%" stop-color="#d97706" /><stop offset="100%" stop-color="#78350f" />`;
        lineStroke = "#fde68a";
    } else if (theme === "cinematic-blue") {
        gradStops = `<stop offset="0%" stop-color="#082f49" /><stop offset="50%" stop-color="#0284c7" /><stop offset="100%" stop-color="#082f49" />`;
        lineStroke = "#7dd3fc";
    } else if (theme === "cyber-neon") {
        gradStops = `<stop offset="0%" stop-color="#4c0519" /><stop offset="50%" stop-color="#06b6d4" /><stop offset="100%" stop-color="#4c0519" />`;
        lineStroke = "#22d3ee";
    } else if (theme === "glass" || theme === "slate-frosted") {
        gradStops = `<stop offset="0%" stop-color="rgba(8,12,22,0.94)" /><stop offset="100%" stop-color="rgba(8,12,22,0.94)" />`;
        lineStroke = "rgba(255,255,255,0.4)";
    }

    const safeLabel = (label || "COMING SOON")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

    return `
    <svg width="600" height="54" viewBox="0 0 600 54" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="phGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                ${gradStops}
            </linearGradient>
            <filter id="phShadow" x="-5%" y="-10%" width="110%" height="130%">
                <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="0" y="0" width="600" height="54" fill="url(#phGrad)" filter="url(#phShadow)"/>
        <line x1="0" y1="2" x2="600" y2="2" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
        <line x1="0" y1="52" x2="600" y2="52" stroke="${lineStroke}" stroke-width="2"/>
        <text x="300" y="34" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="16.5" fill="#ffffff" text-anchor="middle" letter-spacing="2">${safeLabel}</text>
    </svg>`;
}

async function resolvePosterBuffer(posterUrl: string | null | undefined, title?: string): Promise<Buffer | null> {
    if (!posterUrl) return null;

    // 0. Base64 Data URL
    if (posterUrl.startsWith("data:image/")) {
        try {
            const base64Data = posterUrl.split(",")[1];
            if (base64Data) {
                return Buffer.from(base64Data, "base64");
            }
        } catch (e) {}
    }

    // 1. Full HTTP URL
    if (posterUrl.startsWith("http://") || posterUrl.startsWith("https://")) {
        try {
            const res = await fetch(posterUrl, { signal: AbortSignal.timeout(3000) });
            if (res.ok) {
                const arrayBuf = await res.arrayBuffer();
                if (arrayBuf.byteLength > 200) return Buffer.from(arrayBuf);
            }
        } catch (e) {}
    }

    // 2. Relative /api/media/image URL or PMS proxy URL
    if (posterUrl.startsWith("/api/media/image") || posterUrl.includes("thumb=") || posterUrl.includes("serverId=")) {
        try {
            const dummyUrl = new URL(posterUrl, "http://localhost:3000");
            const serverId = dummyUrl.searchParams.get("serverId") || dummyUrl.searchParams.get("instanceId") || "";
            const thumb = dummyUrl.searchParams.get("thumb") || dummyUrl.searchParams.get("url") || "";

            if (serverId && thumb) {
                const { resolveWorkingPlexServerConnection } = await import("@/lib/plex");
                const resolved = await resolveWorkingPlexServerConnection(serverId);
                if (resolved && resolved.serverUrl) {
                    const candidateUrls = [resolved.serverUrl, ...resolved.allCandidateUrls];
                    for (const baseUrl of candidateUrls) {
                        const cleanBase = baseUrl.replace(/\/+$/, "");
                        const sep = thumb.includes("?") ? "&" : "?";
                        const directUrl = `${cleanBase}${thumb}${sep}X-Plex-Token=${encodeURIComponent(resolved.token)}`;
                        try {
                            const res = await fetch(directUrl, { headers: { "X-Plex-Token": resolved.token }, signal: AbortSignal.timeout(3000) });
                            if (res.ok) {
                                const arrayBuf = await res.arrayBuffer();
                                if (arrayBuf.byteLength > 200) {
                                    return Buffer.from(arrayBuf);
                                }
                            }
                        } catch (e) {}
                    }
                }
            }
        } catch (e) {}
    }

    return null;
}

/**
 * Generates a full high-resolution composited placeholder poster with custom banner / ribbon.
 */
export async function generatePlaceholderPosterBuffer(
    posterUrl: string | null | undefined,
    title: string,
    options: {
        type?: string;
        customText?: string;
        daysRemaining?: number | string;
        formattedDate?: string;
        date?: string;
        source?: string;
        status?: string;
        reason?: string;
        theme?: "indigo-purple" | "crimson-red" | "emerald-green" | "amber-gold" | "cinematic-blue" | "glass" | "netflix-red" | "slate-frosted" | "cyber-neon" | string;
        position?: "top" | "bottom" | "corner";
    } = {}
): Promise<Buffer> {
    const width = 600;
    const height = 900;
    const baseBuffer: Buffer | null = await resolvePosterBuffer(posterUrl, title);

    let pipeline: ReturnType<typeof sharp>;
    if (baseBuffer) {
        pipeline = sharp(baseBuffer).resize(width, height, { fit: "cover" });
    } else {
        // Fallback stylish dark poster
        const safeTitle = (title || "Placeholder Media").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        const fallbackSvg = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#090d16" />
                    <stop offset="50%" stop-color="#111827" />
                    <stop offset="100%" stop-color="#030712" />
                </linearGradient>
            </defs>
            <rect width="${width}" height="${height}" fill="url(#bgGrad)" />
            <circle cx="300" cy="400" r="80" fill="rgba(99,102,241,0.1)" stroke="rgba(99,102,241,0.3)" stroke-width="2"/>
            <text x="300" y="420" font-family="sans-serif" font-weight="900" font-size="48" fill="#6366f1" text-anchor="middle">🎬</text>
            <text x="300" y="540" font-family="system-ui, -apple-system, sans-serif" font-weight="800" font-size="28" fill="#f8fafc" text-anchor="middle">${safeTitle}</text>
        </svg>`;
        pipeline = sharp(Buffer.from(fallbackSvg)).png();
    }

    const type = options.type || "not_requested";
    const position = options.position || "bottom";
    const theme = (options.theme as any) || (type === "not_requested" ? "crimson-red" : "indigo-purple");

    const composites: any[] = [];

    if (position === "corner") {
        let ribbonTheme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" = "purple";
        if (theme === "crimson-red" || theme === "netflix-red") ribbonTheme = "crimson";
        else if (theme === "emerald-green") ribbonTheme = "emerald";
        else if (theme === "amber-gold") ribbonTheme = "gold";
        else if (theme === "cinematic-blue" || theme === "cyber-neon") ribbonTheme = "cyan";
        else if (theme === "glass" || theme === "slate-frosted") ribbonTheme = "glass";

        let text = options.customText || (type === "not_requested" ? "NOT REQUESTED" : type.toUpperCase().replace(/_/g, ' '));
        if (options.customText && options.customText.includes("{")) {
            text = interpolateBannerText(options.customText, { title, ...options });
        }
        const cornerSvg = generateCornerRibbonSvg(text, "top-right", ribbonTheme);
        composites.push({
            input: Buffer.from(cornerSvg),
            top: 0,
            left: width - 160
        });
    } else {
        const bannerSvg = generatePlaceholderRibbonSvg(type, {
            title,
            ...options,
            theme
        });
        const topPos = position === "top" ? 0 : height - 54;
        composites.push({
            input: Buffer.from(bannerSvg),
            top: topPos,
            left: 0
        });
    }

    return await pipeline.composite(composites).png().toBuffer();
}

/**
 * Helper to resolve text and color theme for ribbon presets.
 */
export function resolveRibbonPresetTextAndTheme(
    type: string,
    mediaInfo?: PlexMediaStreamInfo,
    leavingSoonDays?: number
): { text: string; theme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" } {
    switch (type) {
        case "imdb_top_250":
            return { text: "IMDb TOP 250", theme: "gold" };
        case "imdb_top_250_tv":
            return { text: "IMDb TOP TV", theme: "gold" };
        case "certified_fresh":
            return { text: "CERTIFIED FRESH", theme: "crimson" };
        case "rt_fresh":
            return { text: "RT FRESH", theme: "crimson" };
        case "oscar_winner":
            return { text: "OSCAR WINNER", theme: "gold" };
        case "academy_award":
            return { text: "BEST PICTURE", theme: "gold" };
        case "emmy_winner":
            return { text: "EMMY WINNER", theme: "purple" };
        case "golden_globe":
            return { text: "GOLDEN GLOBE", theme: "gold" };
        case "critics_choice":
            return { text: "CRITICS' CHOICE", theme: "cyan" };
        case "bafta_winner":
            return { text: "BAFTA WINNER", theme: "gold" };
        case "cannes_winner":
            return { text: "PALME D'OR", theme: "gold" };
        case "metacritic_must_see":
            return { text: "MUST-SEE", theme: "emerald" };
        case "auto_edition":
            return { text: mediaInfo?.detectedBadges?.edition || "SPECIAL EDITION", theme: "cyan" };
        case "leaving_soon":
            return { text: leavingSoonDays ? `LEAVING IN ${leavingSoonDays}D` : "LEAVING SOON", theme: "crimson" };
        case "auto_quality":
            if (mediaInfo?.detectedBadges?.hdr === "DV") return { text: "DOLBY VISION", theme: "purple" };
            if (mediaInfo?.detectedBadges?.resolution === "4K") return { text: "4K UHD", theme: "purple" };
            if (mediaInfo?.detectedBadges?.hdr) return { text: String(mediaInfo.detectedBadges.hdr).toUpperCase(), theme: "cyan" };
            return { text: "1080P FHD", theme: "cyan" };
        default:
            return { text: type ? type.toUpperCase() : "FEATURED", theme: "purple" };
    }
}

/**
 * Generates an authentic Kometa-Style 45-degree diagonal corner ribbon.
 * Renders a crisp single angled ribbon with rich gradients, specular highlight line, 
 * fold accent border, drop shadow, and bold typography matching Kometa's official ribbon design.
 */
export function generateKometaCornerRibbonSvg(
    text: string,
    position: "top-right" | "top-left" | "bottom-right" | "bottom-left" = "top-right",
    theme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" = "purple"
): string {
    const isTop = position.startsWith("top");
    const isRight = position.endsWith("right");
    const isTopRight = isTop && isRight;
    const isTopLeft = isTop && !isRight;
    const isBottomRight = !isTop && isRight;
    const isBottomLeft = !isTop && !isRight;

    const cleanText = (text || "FEATURED").trim().toUpperCase().slice(0, 30);
    const isOscar = cleanText.includes("OSCAR") || cleanText.includes("ACADEMY");
    const isTop250 = cleanText.includes("250") || cleanText.includes("IMDB");
    const isCannes = cleanText.includes("CANNES") || cleanText.includes("PALME");
    const isCriterion = cleanText.includes("CRITERION");
    const isLeaving = cleanText.includes("LEAVING");

    const subLabel = isOscar 
        ? "🌿 ACADEMY AWARDS 🌿" 
        : isTop250 
            ? "⭐ ALL-TIME BEST ⭐" 
            : isCannes 
                ? "🌿 CANNES WINNER 🌿" 
                : isCriterion 
                    ? "SPECIAL EDITION" 
                    : isLeaving 
                        ? "⚠️ SOON" 
                        : "★ OFFICIAL SELECTION ★";

    const gradientThemeMap: Record<string, { start: string; mid: string; end: string; border: string; highlight: string; text: string; subText: string; shadow: string }> = {
        gold: { start: "#fef08a", mid: "#f59e0b", end: "#b45309", border: "#fef9c3", highlight: "rgba(255,255,255,0.9)", text: "#0f172a", subText: "#1e293b", shadow: "rgba(0,0,0,0.5)" },
        crimson: { start: "#fb7185", mid: "#e11d48", end: "#881337", border: "#fda4af", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#ffe4e6", shadow: "rgba(0,0,0,0.5)" },
        emerald: { start: "#6ee7b7", mid: "#059669", end: "#064e3b", border: "#a7f3d0", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#d1fae5", shadow: "rgba(0,0,0,0.5)" },
        purple: { start: "#c7d2fe", mid: "#6366f1", end: "#3730a3", border: "#e0e7ff", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#e0e7ff", shadow: "rgba(0,0,0,0.5)" },
        cyan: { start: "#7dd3fc", mid: "#0284c7", end: "#075985", border: "#bae6fd", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#e0f2fe", shadow: "rgba(0,0,0,0.5)" },
        pink: { start: "#fbcfe8", mid: "#db2777", end: "#831843", border: "#fce7f3", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#fdf2f8", shadow: "rgba(0,0,0,0.5)" },
        glass: { start: "#94a3b8", mid: "#1e293b", end: "#020617", border: "#cbd5e1", highlight: "rgba(255,255,255,0.7)", text: "#f8fafc", subText: "#94a3b8", shadow: "rgba(0,0,0,0.6)" },
        orange: { start: "#fed7aa", mid: "#ea580c", end: "#9a3412", border: "#ffedd5", highlight: "rgba(255,255,255,0.8)", text: "#ffffff", subText: "#ffedd5", shadow: "rgba(0,0,0,0.5)" }
    };

    const g = gradientThemeMap[theme] || gradientThemeMap.purple;
    const gradId = `kometaRibbonGrad_${theme}_${position}`;

    let polygonPoints = "45,0 180,135 180,180 0,0";
    let highlightLine = { x1: "50", y1: "0", x2: "180", y2: "130" };
    let shadowLine = { x1: "10", y1: "0", x2: "180", y2: "170" };
    let textTransform = "translate(100, 75) rotate(45)";

    if (isTopLeft) {
        polygonPoints = "135,0 0,135 0,180 180,0";
        highlightLine = { x1: "130", y1: "0", x2: "0", y2: "130" };
        shadowLine = { x1: "170", y1: "0", x2: "0", y2: "170" };
        textTransform = "translate(80, 75) rotate(-45)";
    } else if (isBottomRight) {
        polygonPoints = "0,180 180,0 180,45 45,180";
        highlightLine = { x1: "0", y1: "170", x2: "180", y2: "10" };
        shadowLine = { x1: "0", y1: "130", x2: "180", y2: "50" };
        textTransform = "translate(100, 105) rotate(-45)";
    } else if (isBottomLeft) {
        polygonPoints = "0,135 135,180 180,180 0,0";
        highlightLine = { x1: "0", y1: "130", x2: "130", y2: "180" };
        shadowLine = { x1: "0", y1: "170", x2: "170", y2: "180" };
        textTransform = "translate(80, 105) rotate(45)";
    }

    const fontSize = cleanText.length > 20 ? 9.5 : cleanText.length > 14 ? 10.5 : 12;

    return `
    <svg width="280" height="280" viewBox="0 0 180 180" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${g.start}" />
                <stop offset="45%" stop-color="${g.mid}" />
                <stop offset="100%" stop-color="${g.end}" />
            </linearGradient>
            <filter id="ribbonDropShadow_${position}" x="-25%" y="-25%" width="150%" height="150%">
                <feDropShadow dx="0" dy="4" stdDeviation="5" flood-color="#000000" flood-opacity="0.85"/>
            </filter>
        </defs>
        <g filter="url(#ribbonDropShadow_${position})">
            <!-- Ribbon Solid Body -->
            <polygon points="${polygonPoints}" fill="url(#${gradId})" />
            <!-- Top Specular Highlight Line -->
            <line x1="${highlightLine.x1}" y1="${highlightLine.y1}" x2="${highlightLine.x2}" y2="${highlightLine.y2}" stroke="${g.highlight}" stroke-width="1.8" />
            <!-- Bottom Fold Shadow Line -->
            <line x1="${shadowLine.x1}" y1="${shadowLine.y1}" x2="${shadowLine.x2}" y2="${shadowLine.y2}" stroke="${g.shadow}" stroke-width="2.2" />
            
            <!-- Crisp Typography -->
            <g transform="${textTransform}">
                <text x="0" y="0" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="${fontSize}" fill="${g.text}" text-anchor="middle" letter-spacing="2.2">${cleanText}</text>
                <text x="0" y="11" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="7.5" fill="${g.subText}" text-anchor="middle" letter-spacing="1">${subLabel}</text>
            </g>
        </g>
    </svg>`;
}

/**
 * Generates Kometa-Style 45-degree single diagonal corner ribbon.
 */
export function generateCornerRibbonSvg(
    text: string,
    position: "top-right" | "top-left" | "bottom-right" | "bottom-left" = "top-right",
    theme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" = "purple"
): string {
    return generateKometaCornerRibbonSvg(text, position, theme);
}

/**
 * Generates Kometa-Style diagonal corner ribbon. In Waterfall mode, evaluates list and outputs winning single ribbon.
 */
export function generateTieredCornerRibbonSvg(
    ribbons: Array<{ text: string; theme?: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" }>,
    position: "top-right" | "top-left" | "bottom-right" | "bottom-left" = "top-right"
): string {
    const first = ribbons && ribbons.length > 0 ? ribbons[0] : { text: "FEATURED", theme: "purple" as const };
    return generateKometaCornerRibbonSvg(first.text, position, first.theme || "purple");
}

/**
 * Helper to evaluate an individual condition token in a badge matchRule or ribbon criteria
 */
export function evaluateBadgeCondition(
    condition: string,
    detected?: {
        resolution?: string | null;
        hdr?: string | null;
        audio?: string | null;
        audioChannels?: string | null;
        codec?: string | null;
        edition?: string | null;
        studio?: string | null;
        contentRating?: string | null;
    } | null,
    audioFullStr: string = ""
): boolean {
    const c = (condition || "").trim().toLowerCase();
    if (!c || c === "all" || c === "*") return true;
    if (!detected) return false;

    // 1. Resolution
    if (c === "4k" || c === "2160p" || c === "2160" || c === "uhd" || c === "ultra-hd" || c === "ultra hd") {
        return detected.resolution === "4K";
    }
    if (c === "1080p" || c === "1080" || c === "fhd") {
        return detected.resolution === "1080p";
    }
    if (c === "720p" || c === "720" || c === "hd") {
        return detected.resolution === "720p";
    }
    if (c === "480p" || c === "480" || c === "576p" || c === "576" || c === "sd") {
        return detected.resolution === "SD";
    }

    // 2. Dynamic Range / HDR
    if (c === "dv" || c === "dolby vision" || c === "dovi") {
        return detected.hdr === "DV";
    }
    if (c === "hdr10+" || c === "hdr+" || c === "hdrplus" || c === "plus") {
        return detected.hdr === "HDR10+";
    }
    if (c === "hdr10") {
        return detected.hdr === "HDR10" || detected.hdr === "HDR10+";
    }
    if (c === "hdr") {
        return Boolean(detected.hdr);
    }
    if (c === "sdr") {
        return !detected.hdr;
    }

    // 3. Audio & Channels
    if (c === "atmos") {
        return detected.audio === "ATMOS" || audioFullStr.includes("atmos");
    }
    if (c === "truehd") {
        return detected.audio === "TRUEHD" || audioFullStr.includes("truehd");
    }
    if (c === "dts:x" || c === "dts-x" || c === "dts_x") {
        return detected.audio === "DTS:X" || audioFullStr.includes("dts:x") || audioFullStr.includes("dts-x");
    }
    if (c === "dts-hd" || c === "dtshd" || c === "dts-ma" || c === "ma") {
        return detected.audio === "DTS-HD" || audioFullStr.includes("dts-hd") || audioFullStr.includes("ma");
    }
    if (c === "dts") {
        return (detected.audio || "").toUpperCase().startsWith("DTS") || audioFullStr.includes("dts");
    }
    if (c === "flac") return (detected.audio || "").toUpperCase() === "FLAC" || audioFullStr.includes("flac");
    if (c === "eac3" || c === "digital+") return (detected.audio || "").toUpperCase() === "EAC3" || audioFullStr.includes("eac3");
    if (c === "ac3") return (detected.audio || "").toUpperCase() === "AC3" || audioFullStr.includes("ac3");
    if (c === "aac") return (detected.audio || "").toUpperCase() === "AAC" || audioFullStr.includes("aac");

    if (c === "7.1" || c === "7_1") return detected.audioChannels === "7.1";
    if (c === "5.1" || c === "5_1") return detected.audioChannels === "5.1";
    if (c === "2.0" || c === "2_0") return detected.audioChannels === "2.0";

    // 4. Video Codecs
    if (c === "hevc" || c === "h265" || c === "x265") return detected.codec === "HEVC";
    if (c === "av1") return detected.codec === "AV1";
    if (c === "prores") return detected.codec === "ProRes";
    if (c === "avc" || c === "h264" || c === "x264") return detected.codec === "AVC";

    // 5. Editions
    if (c === "imax") return (detected.edition || "").toLowerCase().includes("imax");
    if (c === "criterion") return (detected.edition || "").toLowerCase().includes("criterion");
    if (c === "remux") return (detected.edition || "").toLowerCase().includes("remux");
    if (c === "directors_cut" || c === "director") return (detected.edition || "").toLowerCase().includes("director");
    if (c === "extended") return (detected.edition || "").toLowerCase().includes("extended");
    if (c === "theatrical") return (detected.edition || "").toLowerCase().includes("theatrical");
    if (c === "remastered" || c === "remaster") return (detected.edition || "").toLowerCase().includes("remaster");

    // 6. Studios
    if (c === "netflix") return (detected.studio || "").toLowerCase().includes("netflix");
    if (c === "disney") return (detected.studio || "").toLowerCase().includes("disney");
    if (c === "hbo" || c === "max") return (detected.studio || "").toLowerCase().includes("hbo") || (detected.studio || "").toLowerCase().includes("max");
    if (c === "apple" || c === "apple_tv") return (detected.studio || "").toLowerCase().includes("apple");
    if (c === "amazon" || c === "prime") return (detected.studio || "").toLowerCase().includes("amazon") || (detected.studio || "").toLowerCase().includes("prime");
    if (c === "paramount") return (detected.studio || "").toLowerCase().includes("paramount");
    if (c === "marvel") return (detected.studio || "").toLowerCase().includes("marvel");
    if (c === "dc") return (detected.studio || "").toLowerCase().includes("dc");
    if (c === "a24") return (detected.studio || "").toLowerCase().includes("a24");

    // 7. Ratings / Content Ratings
    const cr = (detected.contentRating || "").toUpperCase();
    if (c === "pg-13" || c === "pg13" || c === "12a" || c === "12" || c === "13+") return cr === "PG-13" || cr.includes("PG-13") || cr === "US:PG-13";
    if (c === "nc-17" || c === "nc17" || c === "18" || c === "18+") return cr === "NC-17" || cr.includes("NC-17") || cr === "US:NC-17";
    if (c === "r" || c === "restricted" || c === "15" || c === "16") return cr === "R" || cr === "US:R" || cr === "TV-MA";
    if (c === "pg" || c === "tv-pg" || c === "6") return cr === "PG" || cr === "US:PG" || cr === "TV-PG";
    if (c === "g" || c === "tv-g" || c === "u" || c === "0") return cr === "G" || cr === "US:G" || cr === "TV-G" || cr === "TV-Y";
    if (c === "tv-ma" || c === "tvma") return cr === "TV-MA" || cr === "US:TV-MA" || cr === "R";
    if (c === "tv-14" || c === "tv14") return cr === "TV-14" || cr === "US:TV-14" || cr === "PG-13";
    if (c === "tv-pg" || c === "tvpg") return cr === "TV-PG" || cr === "US:TV-PG" || cr === "PG";
    if (c === "tv-g" || c === "tvg") return cr === "TV-G" || cr === "US:TV-G" || cr === "G";
    if (c === "tv-y" || c === "tvy") return cr === "TV-Y" || cr === "US:TV-Y" || cr === "G";
    if (c === "tv-y7" || c === "tvy7") return cr === "TV-Y7" || cr === "US:TV-Y7" || cr === "PG";

    return false;
}

/**
 * Evaluates Waterfall Ribbon priority against media telemetry and returns the SINGLE winning ribbon.
 * In Kometa, a waterfall cascades top-to-bottom through priority tiers. The FIRST matching tier wins.
 */
export function evaluateWaterfallRibbon(
    mediaInfo: PlexMediaStreamInfo,
    tieredRibbons?: TieredRibbonItem[],
    options: {
        leavingSoonDays?: number;
        ratingsSource?: { rtCritics?: number; rtAudience?: number; metacritic?: number };
    } = {}
): { text: string; theme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange"; matchedTierId?: string; matchedType?: string; priority: number } | null {
    if (!tieredRibbons || tieredRibbons.length === 0) return null;

    let priorityIdx = 1;
    for (const tier of tieredRibbons) {
        if (tier.enabled === false) {
            priorityIdx++;
            continue;
        }

        const type = (tier.type || "").toLowerCase();
        let isMatch = false;

        // 1. IMDb Top 250 (movies or TV)
        if (type === "imdb_top_250") {
            const hasTop250Collection = mediaInfo.collections?.some(c => /top[\s_-]?250/i.test(c)) || mediaInfo.labels?.some(l => /top[\s_-]?250/i.test(l));
            const score = mediaInfo.imdbRating ?? mediaInfo.rating;
            if (hasTop250Collection) {
                isMatch = true;
            } else if (mediaInfo.type !== "show" && score && score >= 8.3) {
                isMatch = true;
            }
        } else if (type === "imdb_top_250_tv") {
            const hasTop250Collection = mediaInfo.collections?.some(c => /top[\s_-]?250|top[\s_-]?tv/i.test(c)) || mediaInfo.labels?.some(l => /top[\s_-]?250|top[\s_-]?tv/i.test(l));
            const score = mediaInfo.imdbRating ?? mediaInfo.rating;
            if (hasTop250Collection) {
                isMatch = true;
            } else if (mediaInfo.type === "show" && score && score >= 8.5) {
                isMatch = true;
            }
        }
        // 2. Rotten Tomatoes Certified Fresh / RT Fresh
        else if (type === "certified_fresh") {
            const rtCrit = mediaInfo.rtCriticsRating ?? options.ratingsSource?.rtCritics;
            const rtAud = mediaInfo.rtAudienceRating ?? options.ratingsSource?.rtAudience;
            if ((rtCrit && rtCrit >= 75) || (rtAud && rtAud >= 80)) isMatch = true;
        } else if (type === "rt_fresh") {
            const rtCrit = mediaInfo.rtCriticsRating ?? options.ratingsSource?.rtCritics;
            if (rtCrit && rtCrit >= 60) isMatch = true;
        }
        // 3. Metacritic Must-See
        else if (type === "metacritic_must_see") {
            const meta = options.ratingsSource?.metacritic;
            if (meta && meta >= 81) isMatch = true;
        }
        // 4. Awards (Oscar / Academy Award / Emmy / Golden Globe / Cannes / BAFTA / Critics Choice)
        else if (type === "oscar_winner" || type === "academy_award") {
            const hasOscar = mediaInfo.collections?.some(c => /oscar|academy[\s_-]?award|best[\s_-]?picture/i.test(c)) || mediaInfo.labels?.some(l => /oscar|academy[\s_-]?award/i.test(l));
            const fullStr = `${mediaInfo.title} ${mediaInfo.editionTitle || ""}`.toLowerCase();
            if (hasOscar || fullStr.includes("oscar") || fullStr.includes("academy award") || fullStr.includes("best picture")) isMatch = true;
        } else if (type === "emmy_winner") {
            const hasEmmy = mediaInfo.collections?.some(c => /emmy/i.test(c)) || mediaInfo.labels?.some(l => /emmy/i.test(l));
            if (hasEmmy || mediaInfo.title.toLowerCase().includes("emmy")) isMatch = true;
        } else if (type === "golden_globe") {
            const hasGlobe = mediaInfo.collections?.some(c => /golden[\s_-]?globe/i.test(c)) || mediaInfo.labels?.some(l => /golden[\s_-]?globe/i.test(l));
            if (hasGlobe || mediaInfo.title.toLowerCase().includes("golden globe")) isMatch = true;
        } else if (type === "cannes_winner") {
            const hasCannes = mediaInfo.collections?.some(c => /cannes|palme[\s_-]?d['’]?or/i.test(c)) || mediaInfo.labels?.some(l => /cannes|palme[\s_-]?d['’]?or/i.test(l));
            if (hasCannes || mediaInfo.title.toLowerCase().includes("cannes")) isMatch = true;
        } else if (type === "bafta_winner") {
            const hasBafta = mediaInfo.collections?.some(c => /bafta/i.test(c)) || mediaInfo.labels?.some(l => /bafta/i.test(l));
            if (hasBafta || mediaInfo.title.toLowerCase().includes("bafta")) isMatch = true;
        } else if (type === "critics_choice") {
            const hasCc = mediaInfo.collections?.some(c => /critics[\s_-]?choice/i.test(c)) || mediaInfo.labels?.some(l => /critics[\s_-]?choice/i.test(l));
            if (hasCc || mediaInfo.title.toLowerCase().includes("critics choice") || mediaInfo.title.toLowerCase().includes("critics' choice")) isMatch = true;
        }
        // 5. Quality (4K UHD / Dolby Vision)
        else if (type === "auto_quality" || type === "4k_uhd") {
            if (mediaInfo.detectedBadges?.resolution === "4K" || mediaInfo.detectedBadges?.hdr === "DV" || Boolean(mediaInfo.detectedBadges?.hdr)) {
                isMatch = true;
            }
        }
        // 6. Special Edition
        else if (type === "auto_edition") {
            if (Boolean(mediaInfo.detectedBadges?.edition)) isMatch = true;
        }
        // 7. Leaving Soon
        else if (type === "leaving_soon") {
            if (Boolean(mediaInfo.isLeavingSoon)) isMatch = true;
        }
        // 8. Custom rule
        else if (type === "custom" || tier.matchRule) {
            if (tier.matchRule) {
                isMatch = evaluateBadgeCondition(tier.matchRule, mediaInfo.detectedBadges);
            } else {
                isMatch = true;
            }
        }

        if (isMatch) {
            let text = tier.text;
            let theme = tier.theme || "purple";

            if (!text && type) {
                const mapped = resolveRibbonPresetTextAndTheme(type, mediaInfo, options.leavingSoonDays);
                text = mapped.text;
                if (!tier.theme) theme = mapped.theme;
            }

            if (text && text.trim()) {
                return {
                    text: text.trim().toUpperCase(),
                    theme,
                    matchedTierId: tier.id,
                    matchedType: type,
                    priority: priorityIdx
                };
            }
        }

        priorityIdx++;
    }

    return null;
}

/**
 * Applies overlay SVG badges & custom uploaded badges onto a poster image buffer using Sharp.
 * Supports independent positioning for every individual badge type.
 */
export async function applyOverlaysToPoster(
    originalBuffer: Buffer,
    mediaInfo: PlexMediaStreamInfo,
    options: OverlayOptions = {}
): Promise<Buffer> {
    ensureBackupDir();

    // Standardize base image size to 1000x1500 (standard high-DPI 2:3 vertical poster)
    const baseImage = sharp(originalBuffer).resize(1000, 1500, { fit: "cover" });
    const overlays: { input: Buffer | string; top?: number; left?: number }[] = [];

    // 1. Leaving Soon Banner (Takes precedence at the very top)
    if (options.showLeavingSoon && Boolean(mediaInfo.isLeavingSoon)) {
        const leavingSoonSvg = generateLeavingSoonRibbonSvg(options.leavingSoonDays);
        const ribbonBuf = await sharp(Buffer.from(leavingSoonSvg)).resize(1000, 78).toBuffer();
        overlays.push({
            input: ribbonBuf,
            top: 0,
            left: 0
        });
    }

    // 2. Agregarr-Style Placeholder Banner (if active)
    if (options.showPlaceholder) {
        const phSvg = generatePlaceholderRibbonSvg(options.placeholderType || "countdown", {
            daysRemaining: options.placeholderDays,
            formattedDate: options.placeholderDate,
            customText: options.placeholderText,
            theme: options.placeholderTheme
        });
        const phBuf = await sharp(Buffer.from(phSvg)).resize(1000, 72).toBuffer();
        const phPos = options.placeholderPosition || "bottom";
        overlays.push({
            input: phBuf,
            top: phPos === "top" ? (options.showLeavingSoon ? 78 : 0) : 1500 - 72,
            left: 0
        });
    }

    // 3. Diagonal Corner Ribbons (Kometa Waterfall Priority / Single Ribbon)
    if (options.showRibbon || options.ribbonText || (options.tieredRibbons && options.tieredRibbons.length > 0) || options.ribbonMode === "auto_stack" || options.ribbonMode === "tiered" || options.ribbonMode === "waterfall") {
        const rPos = options.ribbonPosition || "top-right";
        let winningRibbon: { text: string; theme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" } | null = null;

        if (options.ribbonMode === "single") {
            // Single explicit custom text
            let rText = options.ribbonText;
            let rTheme = options.ribbonTheme || "purple";

            if (!rText && options.ribbonType) {
                const mapped = resolveRibbonPresetTextAndTheme(options.ribbonType, mediaInfo, options.leavingSoonDays);
                rText = mapped.text;
                if (!options.ribbonTheme) rTheme = mapped.theme;
            }

            if (!rText) {
                if (mediaInfo.detectedBadges.resolution === "4K") {
                    rText = "4K UHD";
                } else if (mediaInfo.detectedBadges.hdr) {
                    rText = String(mediaInfo.detectedBadges.hdr).toUpperCase();
                } else {
                    rText = "FEATURED";
                }
            }

            winningRibbon = { text: rText, theme: rTheme };
        } else {
            // Waterfall Priority Mode (Default in Kometa)
            const waterfallTiers = (options.tieredRibbons && options.tieredRibbons.length > 0)
                ? options.tieredRibbons
                : [
                    { id: "tier-1", type: "imdb_top_250", text: "IMDb TOP 250", theme: "gold" as const, enabled: true },
                    { id: "tier-2", type: "certified_fresh", text: "CERTIFIED FRESH", theme: "crimson" as const, enabled: true },
                    { id: "tier-3", type: "auto_quality", text: "4K UHD", theme: "purple" as const, enabled: true },
                    { id: "tier-4", type: "auto_edition", text: "SPECIAL EDITION", theme: "cyan" as const, enabled: true }
                ];

            const matched = evaluateWaterfallRibbon(mediaInfo, waterfallTiers, {
                leavingSoonDays: options.leavingSoonDays,
                ratingsSource: options.ratingsSource
            });

            if (matched) {
                winningRibbon = { text: matched.text, theme: matched.theme };
            }
        }

        if (winningRibbon && winningRibbon.text) {
            const stockRibbonPath = resolveStockRibbonPath(winningRibbon.text, winningRibbon.theme);
            let ribbonBuf: Buffer;

            if (stockRibbonPath && fs.existsSync(path.join(STOCK_KOMETA_DIR, stockRibbonPath))) {
                let img = sharp(path.join(STOCK_KOMETA_DIR, stockRibbonPath)).resize(380, 380, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } });
                if (rPos.endsWith("left")) img = img.flop();
                if (rPos.startsWith("bottom")) img = img.flip();
                ribbonBuf = await img.toBuffer();
            } else {
                const cornerRibbonSvg = generateKometaCornerRibbonSvg(winningRibbon.text, rPos, winningRibbon.theme);
                ribbonBuf = await sharp(Buffer.from(cornerRibbonSvg)).resize(380, 380).toBuffer();
            }

            const rTop = rPos.startsWith("top") ? (options.showLeavingSoon ? 78 : 0) : 1500 - 380;
            const rLeft = rPos.endsWith("right") ? 1000 - 380 : 0;

            overlays.push({
                input: ribbonBuf,
                top: rTop,
                left: rLeft
            });
        }
    }

    // 4. Custom Badge Media Stream Matcher with Dovetail & Compound Support
    function doesCustomBadgeMatchMedia(
        cb: { category?: string; matchRule?: string | null; name?: string; filePath?: string },
        mInfo: PlexMediaStreamInfo
    ): boolean {
        const rawRule = (cb.matchRule || "").trim().toLowerCase();
        const rawCategory = (cb.category || "").trim().toLowerCase();
        const rawName = (cb.name || "").toLowerCase();
        const rawFile = path.basename(cb.filePath || "").toLowerCase();

        // Wildcard or universal banner/ribbon without rules
        if (rawRule === "all" || rawRule === "*" || (rawCategory === "ribbon" && !rawRule) || (rawCategory === "banner" && !rawRule)) {
            return true;
        }

        const primaryMedia = mInfo.media?.[0];
        const audioCodec = (primaryMedia?.audioCodec || "").toLowerCase();
        const audioProfile = (primaryMedia?.audioProfile || "").toLowerCase();
        const audioTitle = (primaryMedia?.audioTitle || "").toLowerCase();
        const fullAudioStr = `${mInfo.detectedBadges.audio || ""} ${audioCodec} ${audioProfile} ${audioTitle}`.toLowerCase();

        // Parse tokens from rule (split by +, ,, &, or space when compound)
        let tokens: string[] = [];
        if (rawRule.includes("+") || rawRule.includes(",") || rawRule.includes("&")) {
            tokens = rawRule.split(/[+,&]/).map(t => t.trim()).filter(Boolean);
        } else if (rawRule) {
            tokens = [rawRule];
        } else {
            // Infer from name or filename
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

        // ALL token conditions must match
        return tokens.every(tok => evaluateBadgeCondition(tok, mInfo.detectedBadges, fullAudioStr));
    }

    // 5. Resolve Independent Positions and Buckets for All Badges
    const fallbackPos = options.position || "top-right";
    const resPos = options.resolutionPosition || options.videoPosition || fallbackPos;
    const hdrPos = options.hdrPosition || options.videoPosition || fallbackPos;
    const codecPos = options.codecPosition || options.videoPosition || fallbackPos;
    const audioPos = options.audioPosition || "top-left";
    const channelsPos = options.channelsPosition || options.audioPosition || "top-left";
    const editionPos = options.editionPosition || "top-left";
    const studioPos = options.studioPosition || "bottom-left";
    const contentRatingPos = options.contentRatingPosition || options.ratingPosition || "bottom-left";
    const ratingsPos = options.ratingsPosition || options.ratingPosition || "bottom-right";

    const buckets: Record<string, Array<{ buf: Buffer; w: number; h: number; layerKey: string }>> = {
        "top-right": [],
        "top-left": [],
        "bottom-right": [],
        "bottom-left": [],
        "top-center": [],
        "bottom-center": []
    };

    let hasCustomResolution = false;
    let hasCustomHdr = false;
    let hasCustomCodec = false;
    let hasCustomAudio = false;
    let hasCustomEdition = false;
    let hasCustomStudio = false;
    let hasCustomContentRating = false;

    // Helper to determine all categories fulfilled by a custom badge
    function getCustomBadgeCategories(cb: { category?: string; matchRule?: string | null; name?: string; filePath?: string }): string[] {
        const cat = (cb.category || "").toLowerCase();
        const rule = (cb.matchRule || "").toLowerCase();
        const name = (cb.name || "").toLowerCase();
        const fName = path.basename(cb.filePath || "").toLowerCase();
        const combined = `${cat} ${rule} ${name} ${fName}`;

        const categories: string[] = [];
        if (cat === "resolution" || /\b(4k|2160p?|1080p?|720p?|480p?|576p?|sd|uhd|fhd)\b/i.test(combined)) categories.push("resolution");
        if (cat === "hdr" || /\b(dv|dolby\s*vision|hdr10\+|hdr10|hdr|hdrplus)\b/i.test(combined)) categories.push("hdr");
        if (cat === "codec" || /\b(hevc|av1|prores|avc|h\.?264|h\.?265|x264|x265)\b/i.test(combined)) categories.push("codec");
        if (cat === "audio" || /\b(atmos|truehd|dts:?x|dts-hd|dts|flac|aac|eac3|ac3)\b/i.test(combined)) categories.push("audio");
        if (/\b(7\.1|5\.1|2\.0|surround)\b/i.test(combined)) categories.push("channels");
        if (cat === "edition" || /\b(imax|criterion|directors?[\s_-]?cut|extended|remux|theatrical|remastered?)\b/i.test(combined)) categories.push("edition");
        if (cat === "studio" || /\b(netflix|disney\+?|hbo(?:\s*max)?|apple\s*tv\+?|prime(?:\s*video)?|paramount\+?|marvel|dc(?:\s*comics)?|a24)\b/i.test(combined)) categories.push("studio");
        if (cat === "ratings" || cat === "contentrating" || cat === "rating" || /\b(pg-13|nc-17|tv-ma|tv-14|tv-pg|tv-g|rated\s+[a-z0-9-]+)\b/i.test(combined)) categories.push("contentRating");
        if (cat === "ribbon" || /\b(ribbon|laurel|award|top_?250|cannes|oscar|emmy|bafta|certified_fresh|palme)\b/i.test(combined)) categories.push("ribbon");

        if (categories.length === 0 && cat && cat !== "custom") categories.push(cat);
        return categories;
    }

    const appliedCategories = new Set<string>();

    // First, process active Custom Badges (from GitHub / Uploads) matching this specific media item
    if (options.customBadges && Array.isArray(options.customBadges)) {
        // Sort custom badges so more specific compound badges (e.g. "4k + dv + hdr10+" with 3 tokens) apply first
        const sortedCustomBadges = [...options.customBadges].sort((a, b) => {
            const aTokens = (a.matchRule || "").split(/[+,&]/).length;
            const bTokens = (b.matchRule || "").split(/[+,&]/).length;
            return bTokens - aTokens;
        });

        for (const cb of sortedCustomBadges) {
            if (!cb.filePath || !fs.existsSync(cb.filePath)) continue;
            
            // Only apply if the custom badge matches the media stream telemetry
            if (!doesCustomBadgeMatchMedia(cb, mediaInfo)) continue;

            const badgeCats = getCustomBadgeCategories(cb);

            // Deduplication: If all categories provided by this custom badge have ALREADY been fulfilled, skip it
            if (badgeCats.length > 0 && badgeCats.every(c => appliedCategories.has(c))) {
                continue;
            }

            // Check if all its categories are explicitly disabled in options
            const allDisabled = badgeCats.length > 0 && badgeCats.every(c => {
                if (c === "resolution" && options.showResolution === false) return true;
                if (c === "hdr" && options.showHdr === false) return true;
                if (c === "codec" && !options.showCodec) return true;
                if (c === "audio" && options.showAudio === false) return true;
                if (c === "channels" && !options.showAudioChannels) return true;
                if (c === "edition" && !options.showEdition) return true;
                if (c === "studio" && !options.showStudio) return true;
                if (c === "contentRating" && !options.showContentRating) return true;
                return false;
            });
            if (allDisabled) continue;

            try {
                const scale = options.badgeScale || 1.0;
                const rawW = cb.width || 140;
                const rawH = cb.height || 46;
                const isFullPoster = rawW >= 800 && rawH >= 1200;

                // Register all categories this badge fulfills so no duplicates are added
                for (const cat of badgeCats) {
                    appliedCategories.add(cat);
                    if (cat === "resolution") hasCustomResolution = true;
                    if (cat === "hdr") hasCustomHdr = true;
                    if (cat === "codec") hasCustomCodec = true;
                    if (cat === "audio") hasCustomAudio = true;
                    if (cat === "edition") hasCustomEdition = true;
                    if (cat === "studio") hasCustomStudio = true;
                    if (cat === "contentRating") hasCustomContentRating = true;
                }

                if (isFullPoster) {
                    // Full-frame poster overlay (e.g. 1000x1500 Kometa template)
                    let fullBuf = await sharp(cb.filePath)
                        .resize(1000, 1500, { fit: "cover" })
                        .toBuffer();

                    if (cb.opacity !== undefined && cb.opacity < 1.0) {
                        fullBuf = await sharp(fullBuf)
                            .ensureAlpha()
                            .linear(cb.opacity, 0)
                            .toBuffer();
                    }

                    overlays.push({
                        input: fullBuf,
                        top: 0,
                        left: 0
                    });
                } else {
                    // Corner / positioned badge
                    const cbWidth = scale !== 1.0 && scale > 0.1 ? Math.round(rawW * scale) : rawW;
                    const cbHeight = scale !== 1.0 && scale > 0.1 ? Math.round(rawH * scale) : rawH;
                    const cbPos = cb.position || fallbackPos;

                    let cbBuffer = await sharp(cb.filePath)
                        .resize(cbWidth, cbHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .toBuffer();

                    if (cb.opacity !== undefined && cb.opacity < 1.0) {
                        cbBuffer = await sharp(cbBuffer)
                            .ensureAlpha()
                            .linear(cb.opacity, 0)
                            .toBuffer();
                    }

                    const primaryLayerKey = badgeCats[0] || "custom";
                    buckets[cbPos]?.push({ buf: cbBuffer, w: cbWidth, h: cbHeight, layerKey: primaryLayerKey });
                }
            } catch (err) {
                logger.addLog("WARN", "CURATION", `Failed to load custom badge ${cb.name}: ${err}`);
            }
        }
    }

    const pushSvgToBucket = async (pos: string, svg: string, layerKey: string) => {
        if (!buckets[pos]) return;
        let buf = Buffer.from(svg);
        const meta = await sharp(buf).metadata();
        const rawW = meta.width || 140;
        const rawH = meta.height || 46;
        const scale = options.badgeScale || 1.0;
        
        let w = rawW;
        let h = rawH;
        if (scale !== 1.0 && scale > 0.1) {
            w = Math.round(rawW * scale);
            h = Math.round(rawH * scale);
            buf = await sharp(buf)
                .resize(w, h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .toBuffer();
        }

        buckets[pos].push({
            buf,
            w,
            h,
            layerKey
        });
    };

    const pushStockImageToBucket = async (pos: string, relativePath: string, layerKey: string, targetW = 140, targetH = 46): Promise<boolean> => {
        if (!buckets[pos]) return false;
        const fullPath = path.join(STOCK_KOMETA_DIR, relativePath);
        if (!fs.existsSync(fullPath)) return false;

        try {
            const scale = options.badgeScale || 1.0;
            const meta = await sharp(fullPath).metadata();
            const srcW = meta.width || targetW;
            const srcH = meta.height || targetH;
            const aspect = srcW / srcH;

            let w = targetW;
            let h = Math.round(targetW / aspect);
            if (h > targetH) {
                h = targetH;
                w = Math.round(targetH * aspect);
            }

            if (scale !== 1.0 && scale > 0.1) {
                w = Math.round(w * scale);
                h = Math.round(h * scale);
            }

            const buf = await sharp(fullPath)
                .resize(w, h, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                .toBuffer();

            buckets[pos].push({
                buf,
                w,
                h,
                layerKey
            });
            return true;
        } catch (e) {
            return false;
        }
    };

    // Dovetailed Resolution & HDR Combination (Kometa stock PNG or procedural SVG)
    const shouldDovetail = (options.dovetailResolutionHdr !== false) &&
        options.showResolution !== false &&
        options.showHdr !== false &&
        resPos === hdrPos &&
        !hasCustomResolution &&
        !hasCustomHdr &&
        Boolean(mediaInfo.detectedBadges.resolution);

    if (shouldDovetail) {
        const stockRes = resolveStockResolutionBadgePath(mediaInfo.detectedBadges.resolution!, mediaInfo.detectedBadges.hdr);
        let stockApplied = false;
        if (stockRes) {
            stockApplied = await pushStockImageToBucket(resPos, stockRes, "resolution", 220, 50);
        }
        if (!stockApplied) {
            const dtSvg = generateDovetailedResolutionHdrBadgeSvg(
                mediaInfo.detectedBadges.resolution!,
                mediaInfo.detectedBadges.hdr,
                options.theme
            );
            await pushSvgToBucket(resPos, dtSvg, "resolution");
        }
    } else {
        if (options.showResolution !== false && mediaInfo.detectedBadges.resolution && !hasCustomResolution) {
            const stockRes = resolveStockResolutionBadgePath(mediaInfo.detectedBadges.resolution!, null);
            let stockApplied = false;
            if (stockRes) stockApplied = await pushStockImageToBucket(resPos, stockRes, "resolution", 140, 46);
            if (!stockApplied) {
                await pushSvgToBucket(resPos, generateResolutionBadgeSvg(mediaInfo.detectedBadges.resolution, options.theme), "resolution");
            }
        }
        if (options.showHdr !== false && mediaInfo.detectedBadges.hdr && !hasCustomHdr) {
            await pushSvgToBucket(hdrPos, generateHdrBadgeSvg(mediaInfo.detectedBadges.hdr, options.theme), "hdr");
        }
    }
    if (options.showCodec && mediaInfo.detectedBadges.codec && !hasCustomCodec) {
        await pushSvgToBucket(codecPos, generateCodecBadgeSvg(mediaInfo.detectedBadges.codec, options.theme), "codec");
    }
    if (options.showAudio !== false && mediaInfo.detectedBadges.audio && !hasCustomAudio) {
        const stockAudio = resolveStockAudioCodecBadgePath(mediaInfo.detectedBadges.audio);
        let stockApplied = false;
        if (stockAudio) stockApplied = await pushStockImageToBucket(audioPos, stockAudio, "audio", 140, 46);
        if (!stockApplied) {
            await pushSvgToBucket(audioPos, generateAudioBadgeSvg(mediaInfo.detectedBadges.audio, options.theme), "audio");
        }
    }
    if (options.showAudioChannels && mediaInfo.detectedBadges.audioChannels) {
        await pushSvgToBucket(channelsPos, generateAudioChannelBadgeSvg(mediaInfo.detectedBadges.audioChannels, options.theme), "channels");
    }
    if (options.showEdition && mediaInfo.detectedBadges.edition && !hasCustomEdition) {
        const stockEdition = resolveStockEditionBadgePath(mediaInfo.detectedBadges.edition);
        let stockApplied = false;
        if (stockEdition) stockApplied = await pushStockImageToBucket(editionPos, stockEdition, "edition", 140, 46);
        if (!stockApplied) {
            await pushSvgToBucket(editionPos, generateEditionBadgeSvg(mediaInfo.detectedBadges.edition, options.theme), "edition");
        }
    }
    if (options.showStudio && mediaInfo.detectedBadges.studio && !hasCustomStudio) {
        await pushSvgToBucket(studioPos, generateStudioLogoBadgeSvg(mediaInfo.detectedBadges.studio, options.theme), "studio");
    }
    if (options.showContentRating && mediaInfo.detectedBadges.contentRating && !hasCustomContentRating) {
        await pushSvgToBucket(contentRatingPos, generateContentRatingBadgeSvg(mediaInfo.detectedBadges.contentRating, options.theme), "contentRating");
    }
    if (options.showRatings && options.ratingsSource) {
        const rSvg = generateRatingsBadgeSvg(options.ratingsSource, options.theme);
        if (rSvg) await pushSvgToBucket(ratingsPos, rSvg, "ratings");
    }

    // Default layer priority order fallback
    const defaultPriority = ["ribbon", "resolution", "hdr", "codec", "audio", "channels", "edition", "studio", "ratings", "contentRating"];
    const priorityOrder = (options.layerPriorityOrder && options.layerPriorityOrder.length > 0)
        ? options.layerPriorityOrder
        : defaultPriority;

    // Render Each Bucket onto Poster Overlays
    for (const [posKey, items] of Object.entries(buckets)) {
        if (!items || items.length === 0) continue;

        // Sort items in this bucket according to user-configured layer priority
        items.sort((a, b) => {
            const idxA = priorityOrder.indexOf(a.layerKey);
            const idxB = priorityOrder.indexOf(b.layerKey);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

        const isBTop = posKey.startsWith("top");
        const isBRight = posKey.endsWith("right");
        const isBCenter = posKey.includes("center");

        const isRibbonInSameCorner = Boolean(options.showRibbon) && (options.ribbonPosition || "top-right") === posKey;
        const bTopOffset = isBTop ? (options.showLeavingSoon && Boolean(mediaInfo.isLeavingSoon) ? 95 : 35) : (1500 - 35);

        if (isBCenter) {
            let totalW = items.reduce((acc, it) => acc + it.w + 12, 0) - 12;
            let curX = (1000 - totalW) / 2;
            for (const it of items) {
                overlays.push({
                    input: it.buf,
                    top: isBTop ? bTopOffset : bTopOffset - it.h,
                    left: Math.round(curX)
                });
                curX += it.w + 12;
            }
        } else {
            let currentX = isBRight 
                ? (isRibbonInSameCorner ? 1000 - 280 - 40 : 1000 - 35) 
                : (isRibbonInSameCorner ? 280 + 40 : 35);

            for (const it of items) {
                const placeX = isBRight ? currentX - it.w : currentX;
                const placeY = isBTop ? bTopOffset : bTopOffset - it.h;

                overlays.push({
                    input: it.buf,
                    top: Math.round(placeY),
                    left: Math.round(placeX)
                });

                if (isBRight) {
                    currentX -= (it.w + 12);
                } else {
                    currentX += (it.w + 12);
                }
            }
        }
    }

    // 6. Digital Release Banner (if set)
    if (options.showDigitalRelease && options.digitalReleaseDate && !options.showPlaceholder) {
        const relDate = new Date(options.digitalReleaseDate);
        const now = new Date();
        const diffDays = Math.ceil((relDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const formatted = relDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

        const relSvg = generateDigitalReleaseRibbonSvg(diffDays, formatted);
        const relBuf = await sharp(Buffer.from(relSvg)).resize(1000, 68).toBuffer();
        overlays.push({
            input: relBuf,
            top: 1500 - 68,
            left: 0
        });
    }

    // Composite all layers together
    const finalImage = await baseImage
        .composite(overlays)
        .jpeg({ quality: 92 })
        .toBuffer();

    return finalImage;
}

/**
 * Backs up pristine original artwork and applies overlay to a Plex item.
 */
export async function backupAndApplyOverlay(
    serverUrl: string,
    token: string,
    serverId: string,
    item: PlexMediaStreamInfo,
    options: OverlayOptions = {}
): Promise<{ success: boolean; message?: string }> {
    ensureBackupDir();

    if (!item.thumb) {
        return { success: false, message: "Item has no thumbnail to overlay." };
    }

    // 1. Fetch current raw poster buffer
    const originalBuffer = await fetchPlexPosterBuffer(serverUrl, token, item.thumb);
    if (!originalBuffer) {
        return { success: false, message: "Failed to download poster buffer from Plex." };
    }

    // 2. Check if backup already exists in database
    const existingBackup = await prisma.mediaArtBackup.findUnique({
        where: {
            serverId_ratingKey: {
                serverId,
                ratingKey: item.ratingKey
            }
        }
    });

    const backupFilePath = path.join(BACKUP_DIR, `${serverId}_${item.ratingKey}.jpg`);

    if (!existingBackup) {
        // Save pristine original to disk
        fs.writeFileSync(backupFilePath, originalBuffer);

        // Record in DB
        await prisma.mediaArtBackup.create({
            data: {
                ratingKey: item.ratingKey,
                serverId,
                originalArtUrl: item.thumb,
                backupFilePath
            }
        });
        logger.addLog("INFO", "CURATION", `Backed up original poster for "${item.title}" (RatingKey: ${item.ratingKey})`);
    }

    // 3. Composite overlays with sharp
    const overlayBuffer = await applyOverlaysToPoster(
        existingBackup && fs.existsSync(existingBackup.backupFilePath)
            ? fs.readFileSync(existingBackup.backupFilePath)
            : originalBuffer,
        item,
        options
    );

    // 4. Upload composited poster to Plex
    const uploaded = await uploadPlexItemPoster(serverUrl, token, item.ratingKey, overlayBuffer);

    if (uploaded) {
        logger.addLog("SUCCESS", "CURATION", `Applied overlay badges to "${item.title}" on Plex.`);
        return { success: true, message: `Applied overlay to "${item.title}".` };
    } else {
        return { success: false, message: "Failed to upload overlay poster to Plex." };
    }
}

/**
 * Restores the pristine original poster from the backup vault.
 */
export async function restoreItemOriginalArtwork(
    serverUrl: string,
    token: string,
    serverId: string,
    ratingKey: string
): Promise<{ success: boolean; message?: string }> {
    const backup = await prisma.mediaArtBackup.findUnique({
        where: {
            serverId_ratingKey: {
                serverId,
                ratingKey
            }
        }
    });

    if (!backup) {
        return { success: false, message: "No backup found for this item." };
    }

    if (fs.existsSync(backup.backupFilePath)) {
        const originalBuf = fs.readFileSync(backup.backupFilePath);
        const restored = await uploadPlexItemPoster(serverUrl, token, ratingKey, originalBuf);

        if (restored) {
            // Remove backup file and record
            try { fs.unlinkSync(backup.backupFilePath); } catch (e) {}
            await prisma.mediaArtBackup.delete({ where: { id: backup.id } });

            logger.addLog("SUCCESS", "CURATION", `Restored pristine original poster for RatingKey: ${ratingKey}`);
            return { success: true, message: "Original poster restored successfully." };
        }
    }

    return { success: false, message: "Failed to restore poster file." };
}

/**
 * Restores ALL backed-up posters in a library or server in 1 click.
 */
export async function restoreAllOriginalArtworks(
    serverUrl: string,
    token: string,
    serverId: string
): Promise<{ success: boolean; restoredCount: number; message?: string }> {
    const backups = await prisma.mediaArtBackup.findMany({
        where: { serverId }
    });

    let restoredCount = 0;
    for (const b of backups) {
        const res = await restoreItemOriginalArtwork(serverUrl, token, serverId, b.ratingKey);
        if (res.success) restoredCount++;
    }

    return {
        success: true,
        restoredCount,
        message: `Restored ${restoredCount} original posters back to Plex.`
    };
}
