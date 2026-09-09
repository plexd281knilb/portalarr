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
    showRatings?: boolean;
    showLeavingSoon?: boolean;
    leavingSoonDays?: number;
    showDigitalRelease?: boolean;
    digitalReleaseDate?: string;
    position?: "top-right" | "top-left" | "bottom-right" | "bottom-left";
    theme?: "glass" | "gold" | "classic" | "minimal";
    ratingsSource?: {
        imdb?: number;
        rtCritics?: number;
        rtAudience?: number;
        metacritic?: number;
    };
}

const BACKUP_DIR = path.join(process.cwd(), "data", "art_backups");

function ensureBackupDir() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }
}

/**
 * Creates SVG for a resolution badge (4K UHD, 1080p FHD, 720p).
 */
export function generateResolutionBadgeSvg(
    resolution: "4K" | "1080p" | "720p" | "SD",
    theme: "glass" | "gold" | "classic" | "minimal" = "glass"
): string {
    const is4k = resolution === "4K";
    const bgFill = theme === "gold" && is4k 
        ? "url(#goldGrad)" 
        : theme === "glass" 
            ? "rgba(15, 23, 42, 0.85)" 
            : "#0f172a";
    const borderColor = is4k ? "#eab308" : "#94a3b8";
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
    theme: "glass" | "gold" | "classic" | "minimal" = "glass"
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
 * Creates SVG for Audio codec badge (Dolby Atmos, TrueHD, DTS:X, DTS-HD).
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
 * Applies overlay SVG badges onto a poster image buffer using sharp.
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

    const isTop = (options.position || "top-right").startsWith("top");
    const isRight = (options.position || "top-right").endsWith("right");

    // 1. Leaving Soon Banner (Takes precedence at the very top)
    if (options.showLeavingSoon) {
        const leavingSoonSvg = generateLeavingSoonRibbonSvg(options.leavingSoonDays);
        // Resize leaving soon to 1000px width
        const ribbonBuf = await sharp(Buffer.from(leavingSoonSvg)).resize(1000, 75).toBuffer();
        overlays.push({
            input: ribbonBuf,
            top: 0,
            left: 0
        });
    }

    // 2. Badges collection (Resolution, HDR, Audio)
    const badgeSvgs: string[] = [];

    if (options.showResolution !== false && mediaInfo.detectedBadges.resolution) {
        badgeSvgs.push(generateResolutionBadgeSvg(mediaInfo.detectedBadges.resolution, options.theme));
    }

    if (options.showHdr !== false && mediaInfo.detectedBadges.hdr) {
        badgeSvgs.push(generateHdrBadgeSvg(mediaInfo.detectedBadges.hdr, options.theme));
    }

    if (options.showAudio !== false && mediaInfo.detectedBadges.audio) {
        badgeSvgs.push(generateAudioBadgeSvg(mediaInfo.detectedBadges.audio));
    }

    let topOffset = options.showLeavingSoon ? 90 : 35;
    let bottomOffset = 1500 - 65;

    // Stack badges horizontally or vertically
    let currentX = isRight ? 1000 - 35 : 35;

    for (const svg of badgeSvgs) {
        const badgeBuf = Buffer.from(svg);
        const meta = await sharp(badgeBuf).metadata();
        const bWidth = meta.width || 140;
        const bHeight = meta.height || 46;

        let placeX = isRight ? currentX - bWidth : currentX;
        let placeY = isTop ? topOffset : bottomOffset - bHeight;

        overlays.push({
            input: badgeBuf,
            top: placeY,
            left: placeX
        });

        if (isRight) {
            currentX -= (bWidth + 14);
        } else {
            currentX += (bWidth + 14);
        }
    }

    // 3. Ratings Badge (Render at bottom left or right)
    if (options.showRatings && options.ratingsSource) {
        const ratingsSvg = generateRatingsBadgeSvg(options.ratingsSource);
        if (ratingsSvg) {
            const ratingsBuf = Buffer.from(ratingsSvg);
            const rMeta = await sharp(ratingsBuf).metadata();
            const rWidth = rMeta.width || 200;
            const rHeight = rMeta.height || 42;

            overlays.push({
                input: ratingsBuf,
                top: 1500 - rHeight - 35,
                left: 35
            });
        }
    }

    // 4. Digital Release Banner (if set)
    if (options.showDigitalRelease && options.digitalReleaseDate) {
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
