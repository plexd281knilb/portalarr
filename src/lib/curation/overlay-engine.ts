import sharp from "sharp";
import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { fetchPlexPosterBuffer, uploadPlexItemPoster, PlexMediaStreamInfo } from "./plex-analyzer";

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
    placeholderType?: "in_theaters" | "countdown" | "now_streaming" | "releasing_date" | "coming_soon" | "custom";
    placeholderDays?: number;
    placeholderDate?: string;
    placeholderText?: string;
    placeholderTheme?: "indigo-purple" | "crimson-red" | "emerald-green" | "amber-gold" | "cinematic-blue" | "glass";
    placeholderPosition?: "top" | "bottom" | "corner";
    position?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    videoPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    audioPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    editionPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    ratingPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left" | "top-center" | "bottom-center";
    showRibbon?: boolean;
    ribbonPosition?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
    ribbonTheme?: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange";
    ribbonText?: string;
    ribbonType?: "auto_quality" | "auto_edition" | "leaving_soon" | "custom";
    theme?: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson";
    ratingsSource?: {
        imdb?: number;
        rtCritics?: number;
        rtAudience?: number;
        metacritic?: number;
    };
    customBadges?: Array<{
        id: string;
        name: string;
        filePath: string;
        position?: string;
        width?: number;
        height?: number;
        opacity?: number;
    }>;
}

const BACKUP_DIR = path.join(process.cwd(), "data", "art_backups");
const CUSTOM_BADGES_DIR = path.join(process.cwd(), "data", "custom_badges");

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
    if (!fs.existsSync(CUSTOM_BADGES_DIR)) {
        fs.mkdirSync(CUSTOM_BADGES_DIR, { recursive: true });
    }
}

/**
 * Creates SVG for a resolution badge (4K UHD, 1080p FHD, 720p, SD).
 */
export function generateResolutionBadgeSvg(
    resolution: "4K" | "1080p" | "720p" | "SD",
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const is4k = resolution === "4K";
    const bgFill = theme === "gold" && is4k 
        ? "url(#goldGrad)" 
        : theme === "glass" 
            ? "rgba(15, 23, 42, 0.88)" 
            : theme === "cyber"
                ? "rgba(2, 6, 23, 0.92)"
                : "#0f172a";
    const borderColor = is4k 
        ? (theme === "cyber" ? "#22d3ee" : "#eab308") 
        : "#94a3b8";
    const textColor = is4k && theme === "gold" ? "#000000" : "#ffffff";
    const subColor = is4k && theme === "gold" ? "#333333" : "#cbd5e1";
    const textLabel = is4k ? "4K" : resolution;
    const subLabel = is4k ? "UHD" : resolution === "1080p" ? "FHD" : "HD";

    return `
    <svg width="140" height="46" viewBox="0 0 140 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a" />
                <stop offset="50%" stop-color="#eab308" />
                <stop offset="100%" stop-color="#ca8a04" />
            </linearGradient>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="136" height="42" rx="8" fill="${bgFill}" stroke="${borderColor}" stroke-width="2" filter="url(#shadow)"/>
        <text x="42" y="29" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="20" fill="${textColor}" text-anchor="middle" letter-spacing="0.5">${textLabel}</text>
        <line x1="72" y1="10" x2="72" y2="36" stroke="${borderColor}" stroke-width="1.5" opacity="0.6"/>
        <text x="104" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="14" fill="${subColor}" text-anchor="middle" letter-spacing="1.5">${subLabel}</text>
    </svg>`;
}

/**
 * Creates SVG for HDR / Dolby Vision badge.
 */
export function generateHdrBadgeSvg(
    hdrType: "DV" | "HDR10+" | "HDR10" | "HDR",
    theme: "glass" | "gold" | "classic" | "minimal" | "cyber" | "crimson" = "glass"
): string {
    const isDv = hdrType === "DV";
    const width = isDv ? 170 : 140;
    const bgFill = "rgba(10, 15, 30, 0.88)";
    const borderColor = isDv ? "#c084fc" : "#38bdf8";

    if (isDv) {
        return `
        <svg width="170" height="46" viewBox="0 0 170 46" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="dvGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#c084fc" />
                    <stop offset="100%" stop-color="#818cf8" />
                </linearGradient>
                <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                    <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
                </filter>
            </defs>
            <rect x="2" y="2" width="166" height="42" rx="8" fill="${bgFill}" stroke="url(#dvGrad)" stroke-width="2" filter="url(#shadow)"/>
            <text x="85" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="15" fill="#f8fafc" text-anchor="middle" letter-spacing="2">DOLBY VISION</text>
        </svg>`;
    }

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="hdrGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#38bdf8" />
                <stop offset="100%" stop-color="#0284c7" />
            </linearGradient>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="${borderColor}" stroke-width="2" filter="url(#shadow)"/>
        <text x="${width / 2}" y="29" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="16" fill="#f8fafc" text-anchor="middle" letter-spacing="1.5">${hdrType}</text>
    </svg>`;
}

/**
 * Creates SVG for Audio codec badge (Dolby Atmos, TrueHD, DTS:X, DTS-HD, etc.).
 */
export function generateAudioBadgeSvg(
    audio: "ATMOS" | "TRUEHD" | "DTS:X" | "DTS-HD" | "5.1" | "7.1"
): string {
    const isAtmos = audio === "ATMOS";
    const width = isAtmos ? 165 : audio.includes("DTS") ? 150 : 130;
    const label = isAtmos ? "DOLBY ATMOS" : audio === "TRUEHD" ? "TRUEHD 7.1" : audio === "DTS:X" ? "DTS:X" : audio === "DTS-HD" ? "DTS-HD MA" : `${audio} AUDIO`;
    const borderColor = isAtmos ? "#38bdf8" : "#a855f7";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(15, 23, 42, 0.88)" stroke="${borderColor}" stroke-width="1.8" filter="url(#shadow)"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="14" fill="#f1f5f9" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates SVG for Audio Channels badge (7.1, 5.1, 2.0).
 */
export function generateAudioChannelBadgeSvg(channels: string): string {
    const width = 110;
    const label = `${channels} CH`;
    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(15, 23, 42, 0.88)" stroke="#38bdf8" stroke-width="1.8" filter="url(#shadow)"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="14" fill="#38bdf8" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates SVG for Video Codec badge (HEVC, AVC, AV1, ProRes).
 */
export function generateCodecBadgeSvg(codec: string): string {
    const width = 120;
    const label = codec.toUpperCase();
    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(15, 23, 42, 0.88)" stroke="#818cf8" stroke-width="1.8" filter="url(#shadow)"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="14" fill="#c7d2fe" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates SVG for Movie Edition / Cut badge (IMAX, Criterion, Director's Cut, Extended, Remastered).
 */
export function generateEditionBadgeSvg(edition: string): string {
    const isImax = edition.toUpperCase().includes("IMAX");
    const isCriterion = edition.toUpperCase().includes("CRITERION");
    const width = isImax ? 150 : isCriterion ? 165 : 180;
    const strokeColor = isImax ? "#38bdf8" : isCriterion ? "#f59e0b" : "#ec4899";
    const label = edition.toUpperCase();

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(10, 15, 30, 0.92)" stroke="${strokeColor}" stroke-width="2" filter="url(#shadow)"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="13" fill="#fdf4ff" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates SVG for Studio / Network badge (HBO, Netflix, Disney+, Apple TV+, Prime, Marvel, DC, A24).
 */
export function generateStudioLogoBadgeSvg(studio: string): string {
    const s = studio.toUpperCase();
    const width = 140;
    let strokeColor = "#a855f7";
    let textColor = "#ffffff";

    if (s.includes("NETFLIX")) strokeColor = "#ef4444";
    else if (s.includes("DISNEY")) strokeColor = "#38bdf8";
    else if (s.includes("APPLE")) strokeColor = "#94a3b8";
    else if (s.includes("PRIME") || s.includes("AMAZON")) strokeColor = "#0284c7";
    else if (s.includes("MARVEL")) strokeColor = "#dc2626";
    else if (s.includes("DC")) strokeColor = "#2563eb";
    else if (s.includes("A24")) strokeColor = "#f59e0b";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(10, 15, 30, 0.92)" stroke="${strokeColor}" stroke-width="2" filter="url(#shadow)"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="14" fill="${textColor}" text-anchor="middle" letter-spacing="1.5">${s}</text>
    </svg>`;
}

/**
 * Creates SVG for Content Rating badge (G, PG, PG-13, R, NC-17, TV-MA).
 */
export function generateContentRatingBadgeSvg(rating: string): string {
    const r = rating.toUpperCase();
    const isMature = r.includes("R") || r.includes("TV-MA") || r.includes("NC-17");
    const width = 90;
    const strokeColor = isMature ? "#f43f5e" : "#10b981";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.5"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(15, 23, 42, 0.9)" stroke="${strokeColor}" stroke-width="2" filter="url(#shadow)"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="14" fill="#f8fafc" text-anchor="middle" letter-spacing="1">${r}</text>
    </svg>`;
}

/**
 * Creates SVG for Ratings badge (IMDb, RT Critics, RT Audience, Metacritic).
 */
export function generateRatingsBadgeSvg(ratings: {
    imdb?: number;
    rtCritics?: number;
    rtAudience?: number;
    metacritic?: number;
}): string {
    const segments: string[] = [];
    let curX = 10;

    if (ratings.imdb) {
        segments.push(`
            <rect x="${curX}" y="6" width="30" height="24" rx="4" fill="#f5c518"/>
            <text x="${curX + 15}" y="22" font-family="system-ui, sans-serif" font-weight="900" font-size="11" fill="#000" text-anchor="middle">IMDb</text>
            <text x="${curX + 38}" y="24" font-family="system-ui, sans-serif" font-weight="800" font-size="16" fill="#fff">${ratings.imdb.toFixed(1)}</text>
        `);
        curX += 74;
    }

    if (ratings.rtCritics) {
        const isFresh = ratings.rtCritics >= 60;
        segments.push(`
            <text x="${curX + 8}" y="24" font-size="16">${isFresh ? "🍅" : "🟢"}</text>
            <text x="${curX + 28}" y="24" font-family="system-ui, sans-serif" font-weight="800" font-size="15" fill="#fff">${ratings.rtCritics}%</text>
        `);
        curX += 72;
    }

    if (ratings.rtAudience) {
        segments.push(`
            <text x="${curX + 8}" y="24" font-size="16">🍿</text>
            <text x="${curX + 28}" y="24" font-family="system-ui, sans-serif" font-weight="800" font-size="15" fill="#fff">${ratings.rtAudience}%</text>
        `);
        curX += 72;
    }

    if (segments.length === 0) return "";

    const totalWidth = curX + 6;

    return `
    <svg width="${totalWidth}" height="42" viewBox="0 0 ${totalWidth} 42" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
                <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.6"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${totalWidth - 4}" height="38" rx="8" fill="rgba(10, 15, 30, 0.9)" stroke="rgba(255, 255, 255, 0.2)" stroke-width="1.5" filter="url(#shadow)"/>
        ${segments.join("")}
    </svg>`;
}

/**
 * Creates SVG for "LEAVING SOON" warning ribbon / banner.
 */
export function generateLeavingSoonRibbonSvg(daysRemaining?: number): string {
    const text = daysRemaining !== undefined && daysRemaining > 0 
        ? `⚠️ LEAVING SOON • ${daysRemaining} DAYS LEFT` 
        : `⚠️ LEAVING SOON`;

    return `
    <svg width="600" height="52" viewBox="0 0 600 52" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="warnGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#b91c1c" />
                <stop offset="50%" stop-color="#ef4444" />
                <stop offset="100%" stop-color="#b91c1c" />
            </linearGradient>
            <filter id="shadow" x="-5%" y="-10%" width="110%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.7"/>
            </filter>
        </defs>
        <rect x="0" y="0" width="600" height="52" fill="url(#warnGrad)" filter="url(#shadow)"/>
        <line x1="0" y1="50" x2="600" y2="50" stroke="#fca5a5" stroke-width="2"/>
        <text x="300" y="34" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="20" fill="#ffffff" text-anchor="middle" letter-spacing="2.5">${text}</text>
    </svg>`;
}

/**
 * Creates SVG for Digital Release countdown ribbon.
 */
export function generateDigitalReleaseRibbonSvg(daysRemaining: number, formattedDate?: string): string {
    const text = daysRemaining === 0 
        ? `✨ NOW STREAMING ON DIGITAL` 
        : daysRemaining > 0 
            ? `STREAMING ON DIGITAL IN ${daysRemaining} DAYS${formattedDate ? ` (${formattedDate})` : ''}`
            : `AVAILABLE ON DIGITAL`;

    return `
    <svg width="600" height="48" viewBox="0 0 600 48" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="streamGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#1e1b4b" />
                <stop offset="50%" stop-color="#4338ca" />
                <stop offset="100%" stop-color="#1e1b4b" />
            </linearGradient>
            <filter id="shadow" x="-5%" y="-10%" width="110%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.6"/>
            </filter>
        </defs>
        <rect x="0" y="0" width="600" height="48" fill="url(#streamGrad)" filter="url(#shadow)"/>
        <line x1="0" y1="46" x2="600" y2="46" stroke="#818cf8" stroke-width="2"/>
        <text x="300" y="31" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="16" fill="#e0e7ff" text-anchor="middle" letter-spacing="2">${text}</text>
    </svg>`;
}

/**
 * Creates SVG for Agregarr-Style Placeholder Banner Ribbon with customizable themes & timings.
 */
export function generatePlaceholderRibbonSvg(
    type: "in_theaters" | "countdown" | "now_streaming" | "releasing_date" | "coming_soon" | "custom",
    options: {
        daysRemaining?: number;
        formattedDate?: string;
        customText?: string;
        theme?: "indigo-purple" | "crimson-red" | "emerald-green" | "amber-gold" | "cinematic-blue" | "glass";
    } = {}
): string {
    const theme = options.theme || "indigo-purple";

    let label = "🚀 COMING SOON";
    if (type === "in_theaters") {
        label = "🎬 IN THEATERS NOW";
    } else if (type === "now_streaming") {
        label = "🔥 NOW STREAMING ON DIGITAL";
    } else if (type === "countdown") {
        const days = options.daysRemaining ?? 7;
        label = days === 0 ? "✨ STREAMING TODAY" : `✨ STREAMING IN ${days} DAYS${options.formattedDate ? ` (${options.formattedDate})` : ''}`;
    } else if (type === "releasing_date") {
        label = options.formattedDate ? `📅 RELEASING ${options.formattedDate}` : "📅 RELEASE DATE ANNOUNCED";
    } else if (type === "custom" && options.customText) {
        label = options.customText.toUpperCase();
    }

    // Themes
    let gradStops = `<stop offset="0%" stop-color="#1e1b4b" /><stop offset="50%" stop-color="#6366f1" /><stop offset="100%" stop-color="#1e1b4b" />`;
    let lineStroke = "#818cf8";

    if (theme === "crimson-red") {
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
    } else if (theme === "glass") {
        gradStops = `<stop offset="0%" stop-color="rgba(15,23,42,0.92)" /><stop offset="100%" stop-color="rgba(15,23,42,0.92)" />`;
        lineStroke = "rgba(255,255,255,0.3)";
    }

    return `
    <svg width="600" height="50" viewBox="0 0 600 50" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="phGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                ${gradStops}
            </linearGradient>
            <filter id="shadow" x="-5%" y="-10%" width="110%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" flood-opacity="0.6"/>
            </filter>
        </defs>
        <rect x="0" y="0" width="600" height="50" fill="url(#phGrad)" filter="url(#shadow)"/>
        <line x1="0" y1="48" x2="600" y2="48" stroke="${lineStroke}" stroke-width="2"/>
        <text x="300" y="32" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="17" fill="#ffffff" text-anchor="middle" letter-spacing="2.5">${label}</text>
    </svg>`;
}

/**
 * Generates high-definition diagonal corner ribbon (Top-Right, Top-Left, Bottom-Right, Bottom-Left).
 */
export function generateCornerRibbonSvg(
    text: string,
    position: "top-right" | "top-left" | "bottom-right" | "bottom-left" = "top-right",
    theme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" = "purple"
): string {
    const isTop = position.startsWith("top");
    const isRight = position.endsWith("right");

    const rotation = (isTop && isRight) || (!isTop && !isRight) ? 45 : -45;

    const gradients: Record<string, { start: string; mid: string; end: string; border: string; text: string; shadow: string }> = {
        crimson: { start: "#ef4444", mid: "#dc2626", end: "#991b1b", border: "#fca5a5", text: "#ffffff", shadow: "rgba(153, 27, 27, 0.7)" },
        emerald: { start: "#10b981", mid: "#059669", end: "#065f46", border: "#a7f3d0", text: "#ffffff", shadow: "rgba(6, 95, 70, 0.7)" },
        purple: { start: "#818cf8", mid: "#6366f1", end: "#4338ca", border: "#c7d2fe", text: "#ffffff", shadow: "rgba(67, 56, 202, 0.7)" },
        gold: { start: "#fef08a", mid: "#eab308", end: "#ca8a04", border: "#fef9c3", text: "#000000", shadow: "rgba(202, 138, 4, 0.7)" },
        cyan: { start: "#38bdf8", mid: "#0284c7", end: "#0369a1", border: "#bae6fd", text: "#ffffff", shadow: "rgba(3, 105, 161, 0.7)" },
        pink: { start: "#f472b6", mid: "#ec4899", end: "#be185d", border: "#fbcfe8", text: "#ffffff", shadow: "rgba(190, 24, 93, 0.7)" },
        glass: { start: "#334155", mid: "#1e293b", end: "#0f172a", border: "#94a3b8", text: "#f8fafc", shadow: "rgba(15, 23, 42, 0.8)" },
        orange: { start: "#fb923c", mid: "#ea580c", end: "#c2410c", border: "#ffedd5", text: "#ffffff", shadow: "rgba(194, 65, 12, 0.7)" }
    };

    const g = gradients[theme] || gradients.purple;
    const cleanText = text.toUpperCase().slice(0, 26);

    return `
    <svg width="340" height="340" viewBox="0 0 340 340" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="ribbonGrad_${theme}_${position}" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${g.start}" />
                <stop offset="35%" stop-color="${g.mid}" />
                <stop offset="100%" stop-color="${g.end}" />
            </linearGradient>
            <filter id="ribbonShadow_${theme}_${position}" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#000000" flood-opacity="0.6"/>
            </filter>
        </defs>
        <g transform="translate(170, 170) rotate(${rotation})">
            <!-- Drop Shadow Backer -->
            <rect x="-260" y="-24" width="520" height="48" fill="url(#ribbonGrad_${theme}_${position})" filter="url(#ribbonShadow_${theme}_${position})"/>
            <!-- Top Highlight Stripe -->
            <line x1="-260" y1="-22" x2="260" y2="-22" stroke="${g.border}" stroke-width="1.5" opacity="0.65"/>
            <!-- Bottom Border Stripe -->
            <line x1="-260" y1="22" x2="260" y2="22" stroke="${g.border}" stroke-width="1.5" opacity="0.45"/>
            <!-- Ribbon Text -->
            <text x="0" y="8" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="19" fill="${g.text}" text-anchor="middle" letter-spacing="2.2">${cleanText}</text>
        </g>
    </svg>`;
}

/**
 * Applies overlay SVG badges & custom uploaded badges onto a poster image buffer using sharp.
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
    if (options.showLeavingSoon) {
        const leavingSoonSvg = generateLeavingSoonRibbonSvg(options.leavingSoonDays);
        const ribbonBuf = await sharp(Buffer.from(leavingSoonSvg)).resize(1000, 75).toBuffer();
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
        const phBuf = await sharp(Buffer.from(phSvg)).resize(1000, 68).toBuffer();
        const phPos = options.placeholderPosition || "bottom";
        overlays.push({
            input: phBuf,
            top: phPos === "top" ? (options.showLeavingSoon ? 75 : 0) : 1500 - 68,
            left: 0
        });
    }

    // 3. Diagonal Corner Ribbon (e.g. 4K UHD, IMAX, CRITERION, LEAVING SOON, NEW RELEASE)
    if (options.showRibbon || options.ribbonText) {
        let rText = options.ribbonText;
        if (!rText) {
            if (options.ribbonType === "auto_edition" && mediaInfo.detectedBadges.edition) {
                rText = mediaInfo.detectedBadges.edition;
            } else if (options.ribbonType === "leaving_soon" || mediaInfo.isLeavingSoon) {
                rText = options.leavingSoonDays ? `LEAVING IN ${options.leavingSoonDays}D` : "LEAVING SOON";
            } else if (mediaInfo.detectedBadges.resolution === "4K") {
                rText = "4K UHD";
            } else if (mediaInfo.detectedBadges.hdr) {
                rText = String(mediaInfo.detectedBadges.hdr).toUpperCase();
            } else {
                rText = "FEATURED";
            }
        }

        const rPos = options.ribbonPosition || "top-right";
        const rTheme = options.ribbonTheme || "purple";
        const cornerRibbonSvg = generateCornerRibbonSvg(rText, rPos, rTheme);
        const ribbonBuf = await sharp(Buffer.from(cornerRibbonSvg)).resize(340, 340).toBuffer();

        let rTop = rPos.startsWith("top") ? (options.showLeavingSoon ? 75 : 0) : 1500 - 340;
        let rLeft = rPos.endsWith("right") ? 1000 - 340 : 0;

        overlays.push({
            input: ribbonBuf,
            top: rTop,
            left: rLeft
        });
    }

    // 4. Group Badges by Configured Positions & Placements
    const videoPos = options.videoPosition || options.position || "top-right";
    const audioPos = options.audioPosition || "top-left";
    const editionPos = options.editionPosition || (videoPos === "top-right" ? "bottom-right" : "top-right");
    const ratingPos = options.ratingPosition || "bottom-left";

    const buckets: Record<string, string[]> = {
        "top-right": [],
        "top-left": [],
        "bottom-right": [],
        "bottom-left": [],
        "top-center": [],
        "bottom-center": []
    };

    // Video badges -> videoPos
    if (options.showResolution !== false && mediaInfo.detectedBadges.resolution) {
        buckets[videoPos]?.push(generateResolutionBadgeSvg(mediaInfo.detectedBadges.resolution, options.theme));
    }
    if (options.showHdr !== false && mediaInfo.detectedBadges.hdr) {
        buckets[videoPos]?.push(generateHdrBadgeSvg(mediaInfo.detectedBadges.hdr, options.theme));
    }
    if (options.showCodec && mediaInfo.detectedBadges.codec) {
        buckets[videoPos]?.push(generateCodecBadgeSvg(mediaInfo.detectedBadges.codec));
    }

    // Audio badges -> audioPos
    if (options.showAudio !== false && mediaInfo.detectedBadges.audio) {
        buckets[audioPos]?.push(generateAudioBadgeSvg(mediaInfo.detectedBadges.audio));
    }
    if (options.showAudioChannels && mediaInfo.detectedBadges.audioChannels) {
        buckets[audioPos]?.push(generateAudioChannelBadgeSvg(mediaInfo.detectedBadges.audioChannels));
    }

    // Edition / Studio / Content Rating -> editionPos
    if (options.showEdition && mediaInfo.detectedBadges.edition) {
        buckets[editionPos]?.push(generateEditionBadgeSvg(mediaInfo.detectedBadges.edition));
    }
    if (options.showStudio && mediaInfo.detectedBadges.studio) {
        buckets[editionPos]?.push(generateStudioLogoBadgeSvg(mediaInfo.detectedBadges.studio));
    }
    if (options.showContentRating && mediaInfo.detectedBadges.contentRating) {
        buckets[editionPos]?.push(generateContentRatingBadgeSvg(mediaInfo.detectedBadges.contentRating));
    }

    // Render Each Bucket
    for (const [posKey, svgList] of Object.entries(buckets)) {
        if (!svgList || svgList.length === 0) continue;

        const isBTop = posKey.startsWith("top");
        const isBRight = posKey.endsWith("right");
        const isBCenter = posKey.includes("center");

        let bTopOffset = isBTop ? (options.showLeavingSoon ? 90 : 35) : (1500 - 35);

        if (isBCenter) {
            // Render centered horizontally
            let totalW = 0;
            const items: { buf: Buffer; w: number; h: number }[] = [];
            for (const svg of svgList) {
                const buf = Buffer.from(svg);
                const meta = await sharp(buf).metadata();
                const w = meta.width || 140;
                const h = meta.height || 46;
                items.push({ buf, w, h });
                totalW += w + 12;
            }
            totalW -= 12; // trim last margin
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
            let currentX = isBRight ? 1000 - 35 : 35;
            for (const svg of svgList) {
                const badgeBuf = Buffer.from(svg);
                const meta = await sharp(badgeBuf).metadata();
                const bWidth = meta.width || 140;
                const bHeight = meta.height || 46;

                let placeX = isBRight ? currentX - bWidth : currentX;
                let placeY = isBTop ? bTopOffset : bTopOffset - bHeight;

                overlays.push({
                    input: badgeBuf,
                    top: Math.round(placeY),
                    left: Math.round(placeX)
                });

                if (isBRight) {
                    currentX -= (bWidth + 12);
                } else {
                    currentX += (bWidth + 12);
                }
            }
        }
    }

    // 5. Custom Uploaded Badges (Image files from disk)
    if (options.customBadges && Array.isArray(options.customBadges)) {
        for (const cb of options.customBadges) {
            if (cb.filePath && fs.existsSync(cb.filePath)) {
                try {
                    const cbWidth = cb.width || 140;
                    const cbHeight = cb.height || 46;
                    const cbPos = cb.position || options.position || "top-left";
                    const isCbTop = cbPos.startsWith("top");
                    const isCbRight = cbPos.endsWith("right");
                    const isCbCenter = cbPos.includes("center");

                    let cbBuffer = await sharp(cb.filePath)
                        .resize(cbWidth, cbHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .toBuffer();

                    // Adjust opacity if < 1.0
                    if (cb.opacity !== undefined && cb.opacity < 1.0) {
                        const alphaVal = Math.round(cb.opacity * 255);
                        cbBuffer = await sharp(cbBuffer)
                            .ensureAlpha()
                            .linear(1, 0)
                            .toBuffer();
                    }

                    let cbX = isCbCenter ? (1000 - cbWidth) / 2 : (isCbRight ? 1000 - cbWidth - 35 : 35);
                    let cbY = isCbTop ? (options.showLeavingSoon ? 90 : 35) : (1500 - cbHeight - 35);

                    overlays.push({
                        input: cbBuffer,
                        top: Math.round(cbY),
                        left: Math.round(cbX)
                    });
                } catch (err) {
                    logger.addLog("WARN", "CURATION", `Failed to composite custom badge ${cb.name}: ${err}`);
                }
            }
        }
    }

    // 6. Ratings Badge (Render at configured ratingPosition)
    if (options.showRatings && options.ratingsSource) {
        const ratingsSvg = generateRatingsBadgeSvg(options.ratingsSource);
        if (ratingsSvg) {
            const ratingsBuf = Buffer.from(ratingsSvg);
            const rMeta = await sharp(ratingsBuf).metadata();
            const rWidth = rMeta.width || 200;
            const rHeight = rMeta.height || 42;

            const isRTop = ratingPos.startsWith("top");
            const isRRight = ratingPos.endsWith("right");
            const rX = isRRight ? 1000 - rWidth - 35 : 35;
            const rY = isRTop ? (options.showLeavingSoon ? 90 : 35) : 1500 - rHeight - 35;

            overlays.push({
                input: ratingsBuf,
                top: Math.round(rY),
                left: Math.round(rX)
            });
        }
    }

    // 7. Digital Release Banner (if set)
    if (options.showDigitalRelease && options.digitalReleaseDate && !options.showPlaceholder) {
        const relDate = new Date(options.digitalReleaseDate);
        const now = new Date();
        const diffDays = Math.ceil((relDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const formatted = relDate.toLocaleDateString("en-US", { month: "short", day: "numeric" });

        const relSvg = generateDigitalReleaseRibbonSvg(diffDays, formatted);
        const relBuf = await sharp(Buffer.from(relSvg)).resize(1000, 65).toBuffer();
        overlays.push({
            input: relBuf,
            top: 1500 - 65,
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
