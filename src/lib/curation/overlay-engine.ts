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
        category?: string;
        matchRule?: string | null;
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
        : theme === "glass" 
            ? "rgba(8, 12, 22, 0.92)" 
            : theme === "cyber"
                ? "rgba(2, 6, 23, 0.94)"
                : "rgba(15, 23, 42, 0.94)";
    
    const strokeGrad = is4k 
        ? (theme === "cyber" ? "url(#cyberStrokeGrad)" : "url(#goldStrokeGrad)")
        : resolution === "1080p"
            ? "url(#fhdStrokeGrad)"
            : "url(#hdStrokeGrad)";

    const textColor = is4k && theme === "gold" ? "#000000" : "#ffffff";
    const subColor = is4k && theme === "gold" ? "#1e293b" : is4k ? "#fef08a" : "#93c5fd";
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
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <!-- Outer Glassmorphism Base -->
        <rect x="2" y="2" width="136" height="42" rx="8" fill="${bgFill}" stroke="${strokeGrad}" stroke-width="1.8" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight (Kometa Gloss Effect) -->
        <line x1="8" y1="5" x2="132" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
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
    const bgFill = "rgba(8, 12, 22, 0.92)";

    if (isDv) {
        return `
        <svg width="175" height="46" viewBox="0 0 175 46" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="dvGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#c084fc" />
                    <stop offset="50%" stop-color="#818cf8" />
                    <stop offset="100%" stop-color="#6366f1" />
                </linearGradient>
                <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                    <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
                </filter>
            </defs>
            <rect x="2" y="2" width="171" height="42" rx="8" fill="${bgFill}" stroke="url(#dvGrad)" stroke-width="1.8" filter="url(#kometaShadow)"/>
            <!-- Specular Top Highlight -->
            <line x1="8" y1="5" x2="167" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
            <!-- Dolby double-D iconic mark -->
            <g transform="translate(14, 15)">
                <rect x="0" y="0" width="4.5" height="16" rx="1.5" fill="#c084fc"/>
                <path d="M 6 0 A 8 8 0 0 1 6 16 Z" fill="#c084fc"/>
                <path d="M 21 0 A 8 8 0 0 0 21 16 Z" fill="#818cf8"/>
                <rect x="22.5" y="0" width="4.5" height="16" rx="1.5" fill="#818cf8"/>
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
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="${bgFill}" stroke="url(#hdrGrad)" stroke-width="1.8" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        <line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
        <text x="${width / 2}" y="29" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="16" fill="#f8fafc" text-anchor="middle" letter-spacing="1.8">${hdrType}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Audio codec badge (Dolby Atmos, TrueHD, DTS:X, DTS-HD MA, 5.1/7.1).
 */
export function generateAudioBadgeSvg(
    audio: "ATMOS" | "TRUEHD" | "DTS:X" | "DTS-HD" | "5.1" | "7.1"
): string {
    const isAtmos = audio === "ATMOS";
    const isDts = audio.startsWith("DTS");
    const isTrueHd = audio === "TRUEHD";
    const width = isAtmos ? 170 : isDts ? 155 : isTrueHd ? 145 : 135;
    const label = isAtmos ? "DOLBY ATMOS" : isTrueHd ? "TRUEHD 7.1" : audio === "DTS:X" ? "DTS:X" : audio === "DTS-HD" ? "DTS-HD MA" : `${audio} AUDIO`;
    
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
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(8, 12, 22, 0.92)" stroke="url(#audioStroke_${audio.replace(/[^a-zA-Z0-9]/g, '')})" stroke-width="1.8" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        <line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="13.5" fill="#f8fafc" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Audio Channels badge (7.1, 5.1, 2.0).
 */
export function generateAudioChannelBadgeSvg(channels: string): string {
    const width = 115;
    const label = `${channels} CH`;
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
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(8, 12, 22, 0.92)" stroke="url(#chGrad)" stroke-width="1.8" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        <line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="14" fill="#38bdf8" text-anchor="middle" letter-spacing="1.8">${label}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Video Codec badge (HEVC, AVC, AV1, ProRes).
 */
export function generateCodecBadgeSvg(codec: string): string {
    const width = 125;
    const cUpper = codec.toUpperCase();
    const label = cUpper.includes("HEVC") ? "HEVC • 10b" : cUpper.includes("AV1") ? "AV1 • HDR" : cUpper.includes("AVC") ? "AVC • x264" : cUpper;
    
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
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(8, 12, 22, 0.92)" stroke="url(#codecGrad)" stroke-width="1.8" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        <line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="13" fill="#c7d2fe" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Movie Edition / Cut badge (IMAX Enhanced, Criterion, Director's Cut, Extended, Remux).
 */
export function generateEditionBadgeSvg(edition: string): string {
    const isImax = edition.toUpperCase().includes("IMAX");
    const isCriterion = edition.toUpperCase().includes("CRITERION");
    const isRemux = edition.toUpperCase().includes("REMUX");
    const width = isImax ? 165 : isCriterion ? 175 : isRemux ? 160 : 180;
    const strokeGrad = isImax 
        ? "url(#imaxGrad)" 
        : isCriterion 
            ? "url(#critGrad)" 
            : isRemux
                ? "url(#remuxGrad)"
                : "url(#editGrad)";
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
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="${strokeGrad}" stroke-width="1.8" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        <line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="12.5" fill="#fdf4ff" text-anchor="middle" letter-spacing="1.5">${label}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Studio / Network badge (HBO, Netflix, Disney+, Apple TV+, Prime, Marvel, DC, A24, Paramount+).
 */
export function generateStudioLogoBadgeSvg(studio: string): string {
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

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="${strokeColor}" stroke-width="1.8" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        <line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="13" fill="${textColor}" text-anchor="middle" letter-spacing="1.8">${s}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Content Rating badge (G, PG, PG-13, R, NC-17, TV-MA, TV-14, TV-PG, TV-G).
 */
export function generateContentRatingBadgeSvg(rating: string): string {
    const r = rating.toUpperCase();
    const isMature = r.includes("R") || r.includes("TV-MA") || r.includes("NC-17");
    const isTeen = r.includes("PG-13") || r.includes("TV-14");
    const width = 95;
    const strokeColor = isMature ? "#f43f5e" : isTeen ? "#fb923c" : "#10b981";

    return `
    <svg width="${width}" height="46" viewBox="0 0 ${width} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${width - 4}" height="42" rx="8" fill="rgba(8, 12, 22, 0.92)" stroke="${strokeColor}" stroke-width="1.8" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        <line x1="8" y1="5" x2="${width - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
        <text x="${width / 2}" y="28" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="14" fill="#f8fafc" text-anchor="middle" letter-spacing="1.2">${r}</text>
    </svg>`;
}

/**
 * Creates Kometa-Style SVG for Community Ratings badge (IMDb, RT Critics, RT Audience, Metacritic).
 */
export function generateRatingsBadgeSvg(ratings: {
    imdb?: number;
    rtCritics?: number;
    rtAudience?: number;
    metacritic?: number;
}): string {
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

    return `
    <svg width="${totalWidth}" height="46" viewBox="0 0 ${totalWidth} 46" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <filter id="kometaShadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="3" stdDeviation="3.5" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect x="2" y="2" width="${totalWidth - 4}" height="42" rx="8" fill="rgba(8, 12, 22, 0.94)" stroke="rgba(255, 255, 255, 0.25)" stroke-width="1.5" filter="url(#kometaShadow)"/>
        <!-- Specular Top Highlight -->
        <line x1="8" y1="5" x2="${totalWidth - 8}" y2="5" stroke="rgba(255,255,255,0.4)" stroke-width="1.2" stroke-linecap="round"/>
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
 * Creates Kometa/Agregarr-Style SVG for Placeholder Banner with customizable themes & timings.
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

    let gradStops = `<stop offset="0%" stop-color="#1e1b4b" /><stop offset="50%" stop-color="#6366f1" /><stop offset="100%" stop-color="#1e1b4b" />`;
    let lineStroke = "#a5b4fc";

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
        gradStops = `<stop offset="0%" stop-color="rgba(8,12,22,0.94)" /><stop offset="100%" stop-color="rgba(8,12,22,0.94)" />`;
        lineStroke = "rgba(255,255,255,0.4)";
    }

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
        <text x="300" y="34" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="17.5" fill="#ffffff" text-anchor="middle" letter-spacing="2.5">${label}</text>
    </svg>`;
}

/**
 * Generates Kometa-Style 45-degree diagonal corner ribbon (Top-Right, Top-Left, Bottom-Right, Bottom-Left).
 */
export function generateCornerRibbonSvg(
    text: string,
    position: "top-right" | "top-left" | "bottom-right" | "bottom-left" = "top-right",
    theme: "crimson" | "emerald" | "purple" | "gold" | "cyan" | "pink" | "glass" | "orange" = "purple"
): string {
    const isTop = position.startsWith("top");
    const isRight = position.endsWith("right");

    const rotation = (isTop && isRight) || (!isTop && !isRight) ? 45 : -45;

    const gradients: Record<string, { start: string; mid: string; end: string; border: string; text: string }> = {
        crimson: { start: "#ef4444", mid: "#dc2626", end: "#991b1b", border: "#fca5a5", text: "#ffffff" },
        emerald: { start: "#10b981", mid: "#059669", end: "#065f46", border: "#a7f3d0", text: "#ffffff" },
        purple: { start: "#818cf8", mid: "#6366f1", end: "#4338ca", border: "#c7d2fe", text: "#ffffff" },
        gold: { start: "#fef08a", mid: "#eab308", end: "#ca8a04", border: "#fef9c3", text: "#000000" },
        cyan: { start: "#38bdf8", mid: "#0284c7", end: "#0369a1", border: "#bae6fd", text: "#ffffff" },
        pink: { start: "#f472b6", mid: "#ec4899", end: "#be185d", border: "#fbcfe8", text: "#ffffff" },
        glass: { start: "#334155", mid: "#1e293b", end: "#0f172a", border: "#94a3b8", text: "#f8fafc" },
        orange: { start: "#fb923c", mid: "#ea580c", end: "#c2410c", border: "#ffedd5", text: "#ffffff" }
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
            <filter id="ribbonShadow_${theme}_${position}" x="-25%" y="-25%" width="150%" height="150%">
                <feDropShadow dx="0" dy="5" stdDeviation="7" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <g transform="translate(170, 170) rotate(${rotation})">
            <!-- Ribbon Background -->
            <rect x="-260" y="-25" width="520" height="50" fill="url(#ribbonGrad_${theme}_${position})" filter="url(#ribbonShadow_${theme}_${position})"/>
            <!-- Top Highlight Line -->
            <line x1="-260" y1="-23" x2="260" y2="-23" stroke="${g.border}" stroke-width="1.6" opacity="0.75"/>
            <!-- Bottom Border Stripe -->
            <line x1="-260" y1="23" x2="260" y2="23" stroke="${g.border}" stroke-width="1.6" opacity="0.55"/>
            <!-- Ribbon Text -->
            <text x="0" y="8" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="19" fill="${g.text}" text-anchor="middle" letter-spacing="2.2">${cleanText}</text>
        </g>
    </svg>`;
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
    if (options.showLeavingSoon) {
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

    // 3. Diagonal Corner Ribbon
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

        const rTop = rPos.startsWith("top") ? (options.showLeavingSoon ? 78 : 0) : 1500 - 340;
        const rLeft = rPos.endsWith("right") ? 1000 - 340 : 0;

        overlays.push({
            input: ribbonBuf,
            top: rTop,
            left: rLeft
        });
    }

    // 4. Custom Badge Media Stream Matcher
    function doesCustomBadgeMatchMedia(
        cb: { category?: string; matchRule?: string | null; name?: string; filePath?: string },
        mInfo: PlexMediaStreamInfo
    ): boolean {
        const rawRule = (cb.matchRule || "").toLowerCase().trim();
        const rawCategory = (cb.category || "").toLowerCase().trim();
        const rawName = (cb.name || "").toLowerCase();
        const rawFile = path.basename(cb.filePath || "").toLowerCase();
        const combined = `${rawRule} ${rawCategory} ${rawName} ${rawFile}`;

        // Wildcard or universal banner/ribbon without rules
        if (rawRule === "all" || rawRule === "*" || (rawCategory === "ribbon" && !rawRule) || (rawCategory === "banner" && !rawRule)) {
            return true;
        }

        // 1. Resolution Matching (4K, 1080p, 720p, SD)
        if (rawCategory === "resolution" || /4k|uhd|2160|1080|fhd|720|hd|sd|480|576/.test(rawRule) || /ultra-hd|1080p|720p/.test(rawFile)) {
            const itemRes = mInfo.detectedBadges.resolution; // "4K" | "1080p" | "720p" | "SD"
            if (/4k|uhd|2160|ultra-hd/i.test(combined)) {
                return itemRes === "4K";
            }
            if (/1080|fhd/i.test(combined)) {
                return itemRes === "1080p";
            }
            if (/720|hd/i.test(combined) && !/1080|4k|fhd|uhd/i.test(combined)) {
                return itemRes === "720p";
            }
            if (/sd|480|576/i.test(combined)) {
                return itemRes === "SD";
            }
        }

        // 2. HDR & Dolby Vision Matching
        if (rawCategory === "hdr" || /dv|dolby.*vision|hdr10\+|hdr10|hdr/i.test(combined)) {
            const itemHdr = mInfo.detectedBadges.hdr;
            if (!itemHdr) return false;

            if (/dv|dolby.*vision/i.test(combined)) {
                return itemHdr === "DV";
            }
            if (/hdr10\+/i.test(combined)) {
                return itemHdr === "HDR10+";
            }
            if (/hdr10/i.test(combined)) {
                return itemHdr === "HDR10" || itemHdr === "HDR10+";
            }
            if (/hdr/i.test(combined)) {
                return !!itemHdr;
            }
        }

        // 3. Audio & Codec Matching (Atmos, TrueHD, DTS:X, DTS-HD, 5.1, 7.1)
        if (rawCategory === "audio" || rawCategory === "codec" || /atmos|truehd|dts|flac|aac|eac3|ac3|5\.1|7\.1/i.test(combined)) {
            const itemAudio = mInfo.detectedBadges.audio;
            const itemChannels = mInfo.detectedBadges.audioChannels;
            const primaryMedia = mInfo.media?.[0];
            const audioCodec = (primaryMedia?.audioCodec || "").toLowerCase();
            const audioProfile = (primaryMedia?.audioProfile || "").toLowerCase();
            const audioTitle = (primaryMedia?.audioTitle || "").toLowerCase();
            const fullAudioStr = `${itemAudio || ""} ${audioCodec} ${audioProfile} ${audioTitle}`.toLowerCase();

            if (/atmos/i.test(combined)) {
                return fullAudioStr.includes("atmos") || itemAudio === "ATMOS";
            }
            if (/truehd/i.test(combined)) {
                return fullAudioStr.includes("truehd") || itemAudio === "TRUEHD";
            }
            if (/dts[-:_]?x/i.test(combined)) {
                return fullAudioStr.includes("dts:x") || fullAudioStr.includes("dts-x") || itemAudio === "DTS:X";
            }
            if (/dts[-:_]?hd|dtshd|dts[-:_]?ma/i.test(combined)) {
                return fullAudioStr.includes("dts-hd") || fullAudioStr.includes("ma") || itemAudio === "DTS-HD";
            }
            if (/dts/i.test(combined) && !/dts[-:_]?x|dts[-:_]?hd/i.test(combined)) {
                return fullAudioStr.includes("dts") || fullAudioStr.includes("dca");
            }
            if (/7\.1/i.test(combined)) {
                return itemChannels === "7.1";
            }
            if (/5\.1/i.test(combined)) {
                return itemChannels === "5.1";
            }
        }

        // 4. Video Codecs (HEVC, AV1, ProRes, AVC)
        if (rawCategory === "codec" || /hevc|h265|x265|av1|prores|h264|x264|avc/i.test(combined)) {
            const itemCodec = mInfo.detectedBadges.codec;
            if (/hevc|h265|x265/i.test(combined)) return itemCodec === "HEVC";
            if (/av1/i.test(combined)) return itemCodec === "AV1";
            if (/prores/i.test(combined)) return itemCodec === "ProRes";
            if (/h264|x264|avc/i.test(combined)) return itemCodec === "AVC";
        }

        // 5. Editions & Cuts (IMAX, Criterion, Director's Cut, Extended, Remastered, Remux)
        if (rawCategory === "edition" || /imax|criterion|director|extended|remaster|remux|theatrical|unrated/i.test(combined)) {
            const itemEdition = (mInfo.detectedBadges.edition || "").toLowerCase();
            if (!itemEdition) return false;

            if (/imax/i.test(combined)) return itemEdition.includes("imax");
            if (/criterion/i.test(combined)) return itemEdition.includes("criterion");
            if (/director/i.test(combined)) return itemEdition.includes("director");
            if (/extended/i.test(combined)) return itemEdition.includes("extended");
            if (/remaster/i.test(combined)) return itemEdition.includes("remaster");
            if (/remux/i.test(combined)) return itemEdition.includes("remux");
        }

        // 6. Streaming Services & Studios
        if (rawCategory === "studio" || /netflix|disney|hbo|apple|prime|paramount|marvel|dc|a24|hulu|peacock/i.test(combined)) {
            const itemStudio = (mInfo.detectedBadges.studio || "").toLowerCase();
            if (!itemStudio) return false;

            if (/netflix/i.test(combined)) return itemStudio.includes("netflix");
            if (/disney/i.test(combined)) return itemStudio.includes("disney");
            if (/hbo/i.test(combined)) return itemStudio.includes("hbo") || itemStudio.includes("max");
            if (/apple/i.test(combined)) return itemStudio.includes("apple");
            if (/prime|amazon/i.test(combined)) return itemStudio.includes("prime") || itemStudio.includes("amazon");
            if (/paramount/i.test(combined)) return itemStudio.includes("paramount");
            if (/marvel/i.test(combined)) return itemStudio.includes("marvel");
            if (/dc/i.test(combined)) return itemStudio.includes("dc");
            if (/a24/i.test(combined)) return itemStudio.includes("a24");
        }

        // 7. Content Ratings (G, PG, PG-13, R, NC-17, TV-MA)
        if (rawCategory === "ratings" || /pg-13|tv-14|pg|tv-pg|nc-17|tv-ma|\br\b|\bg\b/i.test(combined)) {
            const itemRating = (mInfo.detectedBadges.contentRating || "").toUpperCase();
            if (!itemRating) return false;

            if (/pg-13|tv-14/i.test(combined)) return itemRating === "PG-13";
            if (/nc-17/i.test(combined)) return itemRating === "NC-17";
            if (/\br\b|tv-ma/i.test(combined)) return itemRating === "R";
            if (/pg\b|tv-pg/i.test(combined)) return itemRating === "PG";
            if (/\bg\b|tv-g|tv-y/i.test(combined)) return itemRating === "G";
        }

        return rawCategory === "custom" || rawCategory === "";
    }

    // 5. Resolve Independent Positions and Buckets for All Badges
    const fallbackPos = options.position || "top-right";
    const resPos = options.resolutionPosition || options.videoPosition || fallbackPos;
    const hdrPos = options.hdrPosition || options.videoPosition || fallbackPos;
    const codecPos = options.codecPosition || options.videoPosition || fallbackPos;
    const audioPos = options.audioPosition || "top-left";
    const channelsPos = options.channelsPosition || options.audioPosition || "top-left";
    const editionPos = options.editionPosition || "bottom-right";
    const studioPos = options.studioPosition || options.editionPosition || "bottom-left";
    const contentRatingPos = options.contentRatingPosition || options.ratingPosition || "bottom-left";
    const ratingsPos = options.ratingsPosition || options.ratingPosition || "bottom-left";

    const buckets: Record<string, Array<{ buf: Buffer; w: number; h: number }>> = {
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

    // First, process active Custom Badges (from GitHub / Uploads) matching this specific media item
    if (options.customBadges && Array.isArray(options.customBadges)) {
        for (const cb of options.customBadges) {
            if (!cb.filePath || !fs.existsSync(cb.filePath)) continue;
            
            // Only apply if the custom badge matches the media stream telemetry
            if (!doesCustomBadgeMatchMedia(cb, mediaInfo)) continue;

            try {
                const scale = options.badgeScale || 1.0;
                const rawW = cb.width || 140;
                const rawH = cb.height || 46;
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

                // Check category to avoid duplicate default SVGs
                const cat = (cb.category || "").toLowerCase();
                const rule = (cb.matchRule || "").toLowerCase();
                const fName = (cb.name || "").toLowerCase();
                const combinedCheck = `${cat} ${rule} ${fName}`;

                if (cat === "resolution" || /4k|1080|720|sd|uhd|fhd/i.test(combinedCheck)) hasCustomResolution = true;
                if (cat === "hdr" || /dv|hdr|dolby.*vision/i.test(combinedCheck)) hasCustomHdr = true;
                if (cat === "codec" || /hevc|av1|prores|avc/i.test(combinedCheck)) hasCustomCodec = true;
                if (cat === "audio" || /atmos|truehd|dts/i.test(combinedCheck)) hasCustomAudio = true;
                if (cat === "edition" || /imax|criterion|director|extended/i.test(combinedCheck)) hasCustomEdition = true;
                if (cat === "studio") hasCustomStudio = true;
                if (cat === "ratings") hasCustomContentRating = true;

                buckets[cbPos]?.push({ buf: cbBuffer, w: cbWidth, h: cbHeight });
            } catch (err) {
                logger.addLog("WARN", "CURATION", `Failed to load custom badge ${cb.name}: ${err}`);
            }
        }
    }

    const pushSvgToBucket = async (pos: string, svg: string) => {
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
            h
        });
    };

    if (options.showResolution !== false && mediaInfo.detectedBadges.resolution && !hasCustomResolution) {
        await pushSvgToBucket(resPos, generateResolutionBadgeSvg(mediaInfo.detectedBadges.resolution, options.theme));
    }
    if (options.showHdr !== false && mediaInfo.detectedBadges.hdr && !hasCustomHdr) {
        await pushSvgToBucket(hdrPos, generateHdrBadgeSvg(mediaInfo.detectedBadges.hdr, options.theme));
    }
    if (options.showCodec && mediaInfo.detectedBadges.codec && !hasCustomCodec) {
        await pushSvgToBucket(codecPos, generateCodecBadgeSvg(mediaInfo.detectedBadges.codec));
    }
    if (options.showAudio !== false && mediaInfo.detectedBadges.audio && !hasCustomAudio) {
        await pushSvgToBucket(audioPos, generateAudioBadgeSvg(mediaInfo.detectedBadges.audio));
    }
    if (options.showAudioChannels && mediaInfo.detectedBadges.audioChannels) {
        await pushSvgToBucket(channelsPos, generateAudioChannelBadgeSvg(mediaInfo.detectedBadges.audioChannels));
    }
    if (options.showEdition && mediaInfo.detectedBadges.edition && !hasCustomEdition) {
        await pushSvgToBucket(editionPos, generateEditionBadgeSvg(mediaInfo.detectedBadges.edition));
    }
    if (options.showStudio && mediaInfo.detectedBadges.studio && !hasCustomStudio) {
        await pushSvgToBucket(studioPos, generateStudioLogoBadgeSvg(mediaInfo.detectedBadges.studio));
    }
    if (options.showContentRating && mediaInfo.detectedBadges.contentRating && !hasCustomContentRating) {
        await pushSvgToBucket(contentRatingPos, generateContentRatingBadgeSvg(mediaInfo.detectedBadges.contentRating));
    }
    if (options.showRatings && options.ratingsSource) {
        const rSvg = generateRatingsBadgeSvg(options.ratingsSource);
        if (rSvg) await pushSvgToBucket(ratingsPos, rSvg);
    }

    // Render Each Bucket onto Poster Overlays
    for (const [posKey, items] of Object.entries(buckets)) {
        if (!items || items.length === 0) continue;

        const isBTop = posKey.startsWith("top");
        const isBRight = posKey.endsWith("right");
        const isBCenter = posKey.includes("center");

        const bTopOffset = isBTop ? (options.showLeavingSoon ? 95 : 35) : (1500 - 35);

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
            let currentX = isBRight ? 1000 - 35 : 35;
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
