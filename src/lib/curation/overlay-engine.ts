import sharp from "sharp";
import fs from "fs";
import path from "path";
import crypto from "crypto";
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
    placeholderTheme?: "indigo-purple" | "crimson-red" | "emerald-green" | "amber-gold" | "cinematic-blue" | "cyber-neon" | "glass" | "slate-frosted" | string;
    placeholderPosition?: "top" | "bottom" | "corner" | "lower_third" | "middle" | "upper_third" | string;
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
    categoryScales?: Record<string, number>;
    resolutionScale?: number;
    hdrScale?: number;
    codecScale?: number;
    audioScale?: number;
    channelsScale?: number;
    editionScale?: number;
    studioScale?: number;
    contentRatingScale?: number;
    ratingsScale?: number;
    ribbonScale?: number;
    
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
    resolution?: string | null,
    hdr?: string | null
): string | null {
    const resUpper = (resolution || "").toUpperCase();
    const hasRes = Boolean(resUpper && !resUpper.includes("NONE") && !resUpper.includes("AUTO_HDR_ONLY"));
    const is4k = resUpper.includes("4K") || resUpper.includes("2160") || resUpper.includes("UHD");
    const is1080 = resUpper.includes("1080") || resUpper.includes("FHD");
    const is720 = resUpper.includes("720") || resUpper.includes("HD");
    const is576 = resUpper.includes("576");
    const is480 = resUpper.includes("480") || resUpper.includes("SD");

    const basePrefix = is4k ? "4k" : is1080 ? "1080p" : is720 ? "720p" : is576 ? "576p" : is480 ? "480p" : "1080p";

    const hdrUpper = (hdr || "").toUpperCase();
    const isDv = hdrUpper.includes("DV") || hdrUpper.includes("DOLBY") || hdrUpper.includes("VISION");
    const isPlus = hdrUpper.includes("HDR10+") || hdrUpper.includes("PLUS");
    const isHdr = isDv || hdrUpper.includes("HDR") || hdrUpper.includes("HDR10");
    const isHlg = hdrUpper.includes("HLG");

    let candidate = "";
    if (hasRes) {
        if (isDv && isPlus) candidate = `resolution/${basePrefix}dvhdrplus.png`;
        else if (isDv && isHdr) candidate = `resolution/${basePrefix}dvhdr.png`;
        else if (isDv) candidate = `resolution/${basePrefix}dv.png`;
        else if (isPlus) candidate = `resolution/${basePrefix}plus.png`;
        else if (isHdr) candidate = `resolution/${basePrefix}hdr.png`;
        else if (isHlg) candidate = `resolution/${basePrefix}hlg.png`;
        else candidate = `resolution/${basePrefix}.png`;
    } else {
        // Standalone HDR badges (without resolution prefix)
        if (isDv && isPlus) candidate = `resolution/dvhdrplus.png`;
        else if (isDv && isHdr) candidate = `resolution/dvhdr.png`;
        else if (isDv) candidate = `resolution/dv.png`;
        else if (isPlus) candidate = `resolution/plus.png`;
        else if (isHdr) candidate = `resolution/hdr.png`;
        else if (isHlg) candidate = `resolution/hlg.png`;
    }

    if (candidate && fs.existsSync(path.join(STOCK_KOMETA_DIR, candidate))) {
        return candidate;
    }

    // Fallback candidates
    if (hasRes && fs.existsSync(path.join(STOCK_KOMETA_DIR, `resolution/${basePrefix}.png`))) {
        return `resolution/${basePrefix}.png`;
    }
    if (!hasRes && fs.existsSync(path.join(STOCK_KOMETA_DIR, `resolution/hdr.png`))) {
        return `resolution/hdr.png`;
    }
    return null;
}

/**
 * Resolves the matching official stock Kometa ribbon PNG image (with authentic laurel wreaths/logos).
 */
export function resolveStockRibbonPath(
    ribbonName: string,
    theme: string = "gold"
): string | null {
    const color = (theme === "gold" || theme === "amber-gold" || theme === "yellow") ? "yellow"
        : (theme === "glass" || theme === "minimal" || theme === "black") ? "black"
        : (theme === "classic" || theme === "gray") ? "gray"
        : "red";

    const nameLower = (ribbonName || "").toLowerCase().replace(/[^a-z0-9_]/g, "");

    let assetName = `blank-${color}`;
    if (nameLower.includes("oscar") || nameLower.includes("academy") || nameLower.includes("bestpicture")) assetName = "oscars";
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
    else if (nameLower.includes("common")) assetName = "common";

    const candidate = `ribbon/${color}/${assetName}.png`;
    if (fs.existsSync(path.join(STOCK_KOMETA_DIR, candidate))) {
        return candidate;
    }

    // Color fallback to yellow or red
    const yellowCandidate = `ribbon/yellow/${assetName}.png`;
    if (fs.existsSync(path.join(STOCK_KOMETA_DIR, yellowCandidate))) {
        return yellowCandidate;
    }

    const redCandidate = `ribbon/red/${assetName}.png`;
    if (fs.existsSync(path.join(STOCK_KOMETA_DIR, redCandidate))) {
        return redCandidate;
    }

    // Default blank ribbon in theme color
    const blankCandidate = `ribbon/${color}/blank-${color}.png`;
    if (fs.existsSync(path.join(STOCK_KOMETA_DIR, blankCandidate))) {
        return blankCandidate;
    }

    return `ribbon/yellow/blank-yellow.png`;
}

/**
 * Resolves stock Kometa edition badge PNG.
 */
export function resolveStockEditionBadgePath(edition: string): string | null {
    const raw = (edition || "").toLowerCase();
    let nameKey = raw.replace(/[^a-z0-9]/g, "");

    if (nameKey.includes("director")) nameKey = "directors";
    else if (nameKey.includes("extended")) nameKey = "extended";
    else if (nameKey.includes("imax")) nameKey = "imax";
    else if (nameKey.includes("criterion")) nameKey = "criterion";
    else if (nameKey.includes("theatrical")) nameKey = "theatrical";
    else if (nameKey.includes("unrated")) nameKey = "unrated";
    else if (nameKey.includes("uncut")) nameKey = "uncut";
    else if (nameKey.includes("remaster")) nameKey = "remastered";
    else if (nameKey.includes("special")) nameKey = "special";
    else if (nameKey.includes("collector")) nameKey = "collector";
    else if (nameKey.includes("ultimate")) nameKey = "ultimate";
    else if (nameKey.includes("anniversary")) nameKey = "anniversary";
    else if (nameKey.includes("definitive")) nameKey = "definitive";
    else if (nameKey.includes("openmatte") || nameKey.includes("open_matte")) nameKey = "openmatte";
    else if (nameKey.includes("blackchrome") || nameKey.includes("black_and_chrome")) nameKey = "blackchrome";
    else if (nameKey.includes("coda")) nameKey = "coda";
    else if (nameKey.includes("diamond")) nameKey = "diamond";
    else if (nameKey.includes("enhanced")) nameKey = "enhanced";
    else if (nameKey.includes("final")) nameKey = "final";
    else if (nameKey.includes("international")) nameKey = "international";
    else if (nameKey.includes("platinum")) nameKey = "platinum";
    else if (nameKey.includes("producer")) nameKey = "producers";
    else if (nameKey.includes("donner")) nameKey = "richarddonner";
    else if (nameKey.includes("ulysses")) nameKey = "ulysses";
    else if (nameKey.includes("alternate")) nameKey = "alternate";

    const candidate = `edition/${nameKey}.png`;
    if (fs.existsSync(path.join(STOCK_KOMETA_DIR, candidate))) {
        return candidate;
    }
    return null;
}

/**
 * Resolves stock Kometa audio codec badge PNG.
 */
export function resolveStockAudioCodecBadgePath(codec: string, channels?: string | null): string | null {
    const nameLower = (codec || "").toLowerCase();
    let filename = "";

    if (nameLower.includes("atmos")) filename = "atmos.png";
    else if (nameLower.includes("truehd")) filename = "truehd.png";
    else if (nameLower.includes("dts:x") || nameLower.includes("dtsx") || nameLower.includes("dts-x")) filename = "dtsx.png";
    else if (nameLower.includes("dts-hd") || nameLower.includes("dtshd") || nameLower.includes("dtsma") || nameLower.includes("ma")) filename = "ma.png";
    else if (nameLower.includes("dts-es") || nameLower.includes("dtses")) filename = "dtses.png";
    else if (nameLower.includes("dts")) filename = "dts.png";
    else if (nameLower.includes("flac")) filename = "flac.png";
    else if (nameLower.includes("eac3") || nameLower.includes("ddp") || nameLower.includes("digital+")) filename = "plus.png";
    else if (nameLower.includes("ac3") || nameLower.includes("dolby digital") || nameLower.includes("digital")) filename = "digital.png";
    else if (nameLower.includes("aac")) filename = "aac.png";
    else if (nameLower.includes("opus")) filename = "opus.png";
    else if (nameLower.includes("pcm")) filename = "pcm.png";
    else if (nameLower.includes("mp3")) filename = "mp3.png";

    if (filename) {
        const p = `audio_codec/standard/${filename}`;
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    return null;
}

/**
 * Resolves stock Kometa content rating badge PNG.
 */
export function resolveStockContentRatingBadgePath(rating: string): string | null {
    const raw = (rating || "").toUpperCase().trim();
    let filename = "";

    if (raw === "PG-13" || raw.includes("PG-13") || raw === "US:PG-13" || raw === "PG13") filename = "uspg-13.png";
    else if (raw === "R" || raw === "US:R" || raw === "RESTRICTED") filename = "usr.png";
    else if (raw === "PG" || raw === "US:PG") filename = "uspg.png";
    else if (raw === "G" || raw === "US:G") filename = "usg.png";
    else if (raw === "NC-17" || raw === "US:NC-17" || raw === "NC17") filename = "usnc-17.png";
    else if (raw === "TV-MA" || raw === "US:TV-MA" || raw === "TVMA") filename = "ustv-ma.png";
    else if (raw === "TV-14" || raw === "US:TV-14" || raw === "TV14") filename = "ustv-14.png";
    else if (raw === "TV-PG" || raw === "US:TV-PG" || raw === "TVPG") filename = "ustv-pg.png";
    else if (raw === "TV-G" || raw === "US:TV-G" || raw === "TVG") filename = "ustv-g.png";
    else if (raw === "TV-Y" || raw === "US:TV-Y" || raw === "TVY") filename = "ustv-y.png";
    else if (raw === "TV-Y7" || raw === "US:TV-Y7" || raw === "TVY7") filename = "ustv-y.png";
    else if (raw === "NR" || raw === "UNRATED" || raw === "NOT RATED") filename = "usnr.png";
    else if (raw === "12" || raw === "12A" || raw.includes("12")) filename = "uk12.png";
    else if (raw === "15" || raw.includes("15")) filename = "uk15.png";
    else if (raw === "18" || raw.includes("18")) filename = "uk18.png";
    else if (raw === "U") filename = "uku.png";
    else if (raw === "DE:0" || raw === "0") filename = "de0.png";
    else if (raw === "DE:6" || raw === "6") filename = "de6.png";
    else if (raw === "DE:12") filename = "de12.png";
    else if (raw === "DE:16") filename = "de16.png";
    else if (raw === "DE:18") filename = "de18.png";
    else if (raw.includes("AU_M") || raw === "AU:M" || raw === "M") filename = "au_m.png";
    else if (raw.includes("AU_MA") || raw === "AU:MA15+" || raw === "MA15+") filename = "au_ma.png";
    else if (raw.includes("AU_PG") || raw === "AU:PG") filename = "au_pg.png";
    else if (raw.includes("AU_G") || raw === "AU:G") filename = "au_g.png";
    else if (raw.includes("AU_R") || raw === "AU:R") filename = "au_r.png";

    if (filename) {
        const p = `cr/${filename}`;
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    return null;
}

/**
 * Resolves stock Kometa studio or streaming service badge PNG.
 */
export function resolveStockStudioBadgePath(studio: string): string | null {
    const sLower = (studio || "").toLowerCase();

    // 1. Check streaming logos first
    if (sLower.includes("netflix")) {
        const p = "streaming/color/Netflix.png";
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    if (sLower.includes("disney")) {
        const p = "streaming/color/Disney+.png";
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    if (sLower.includes("hbo") || sLower.includes("max")) {
        const p = "streaming/color/HBO Max.png";
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    if (sLower.includes("apple")) {
        const p = "streaming/color/AppleTV+.png";
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    if (sLower.includes("prime") || sLower.includes("amazon")) {
        const p = "streaming/color/Prime Video.png";
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    if (sLower.includes("paramount")) {
        const p = "streaming/color/Paramount+.png";
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    if (sLower.includes("hulu")) {
        const p = "streaming/color/Hulu.png";
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    if (sLower.includes("peacock")) {
        const p = "streaming/color/Peacock.png";
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }

    // 2. Check movie studio standard directories
    const studioDirs = ["studio/standard", "studio/bigger"];
    for (const dir of studioDirs) {
        const fullDir = path.join(STOCK_KOMETA_DIR, dir);
        if (!fs.existsSync(fullDir)) continue;

        const files = fs.readdirSync(fullDir);
        // Exact match
        const exact = files.find(f => f.toLowerCase().replace(/\.png$/i, "") === sLower);
        if (exact) return `${dir}/${exact}`;

        // Partial match
        const partial = files.find(f => {
            const clean = f.toLowerCase().replace(/\.png$/i, "");
            return clean.includes(sLower) || sLower.includes(clean);
        });
        if (partial) return `${dir}/${partial}`;
    }

    return null;
}

/**
 * Resolves stock Kometa rating / community score badge PNG.
 */
export function resolveStockRatingBadgePath(source: string, score?: number): string | null {
    const sLower = (source || "").toLowerCase();
    let filename = "";

    if (sLower.includes("imdb")) {
        filename = (score && score >= 8.3) ? "IMDbTop250.png" : "IMDb.png";
    } else if (sLower.includes("rt") || sLower.includes("rotten") || sLower.includes("critic")) {
        if (score !== undefined) {
            filename = score >= 75 ? "RT-Crit-Top.png" : score >= 60 ? "RT-Crit-Fresh.png" : "RT-Crit-Rotten.png";
        } else {
            filename = "RottenTomatoes.png";
        }
    } else if (sLower.includes("audience") || sLower.includes("popcorn")) {
        if (score !== undefined) {
            filename = score >= 60 ? "RT-Aud-Fresh.png" : "RT-Aud-Rotten.png";
        } else {
            filename = "Audience.png";
        }
    } else if (sLower.includes("meta") || sLower.includes("metacritic")) {
        filename = (score && score >= 81) ? "MetacriticTop.png" : "Metacritic.png";
    } else if (sLower.includes("letterboxd")) {
        filename = "Letterboxd.png";
    } else if (sLower.includes("tmdb")) {
        filename = "TMDb.png";
    } else if (sLower.includes("trakt")) {
        filename = "Trakt.png";
    }

    if (filename) {
        const p = `rating/${filename}`;
        if (fs.existsSync(path.join(STOCK_KOMETA_DIR, p))) return p;
    }
    return null;
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
    if (c === "directors_cut" || c === "director" || c === "directors") return (detected.edition || "").toLowerCase().includes("director");
    if (c === "extended") return (detected.edition || "").toLowerCase().includes("extended");
    if (c === "theatrical") return (detected.edition || "").toLowerCase().includes("theatrical");
    if (c === "remastered" || c === "remaster") return (detected.edition || "").toLowerCase().includes("remaster");
    if (c === "unrated") return (detected.edition || "").toLowerCase().includes("unrated");
    if (c === "uncut") return (detected.edition || "").toLowerCase().includes("uncut");
    if (c === "special") return (detected.edition || "").toLowerCase().includes("special") || (detected.edition || "").toLowerCase().includes("collector") || (detected.edition || "").toLowerCase().includes("ultimate") || (detected.edition || "").toLowerCase().includes("anniversary") || (detected.edition || "").toLowerCase().includes("definitive");

    // 6. Studios
    if (c === "netflix") return (detected.studio || "").toLowerCase().includes("netflix");
    if (c === "disney") return (detected.studio || "").toLowerCase().includes("disney");
    if (c === "hbo" || c === "max") return (detected.studio || "").toLowerCase().includes("hbo") || /\bmax\b/i.test(detected.studio || "");
    if (c === "apple" || c === "apple_tv") return (detected.studio || "").toLowerCase().includes("apple");
    if (c === "amazon" || c === "prime") return (detected.studio || "").toLowerCase().includes("amazon") || (detected.studio || "").toLowerCase().includes("prime");
    if (c === "paramount") return (detected.studio || "").toLowerCase().includes("paramount");
    if (c === "peacock") return (detected.studio || "").toLowerCase().includes("peacock");
    if (c === "hulu") return (detected.studio || "").toLowerCase().includes("hulu");
    if (c === "crunchyroll") return (detected.studio || "").toLowerCase().includes("crunchyroll");
    if (c === "amc") return (detected.studio || "").toLowerCase().includes("amc");
    if (c === "marvel") return (detected.studio || "").toLowerCase().includes("marvel");
    if (c === "dc") return (detected.studio || "").toLowerCase().includes("dc");
    if (c === "a24") return (detected.studio || "").toLowerCase().includes("a24");

    // 7. Ratings / Content Ratings
    const rawCr = (detected.contentRating || "").trim();
    const crClean = rawCr.toUpperCase().replace(/^(US|GB|UK|DE|CA|AU|FR|ES|IT|NZ)[:\-_/]?/i, "").replace(/^RATED[\s\-_]*/i, "").replace(/[^A-Z0-9]/g, "");
    const condClean = c.replace(/^(US|GB|UK|DE|CA|AU|FR|ES|IT|NZ)[:\-_/]?/i, "").replace(/^RATED[\s\-_]*/i, "").replace(/[^a-z0-9]/g, "");

    if (condClean === "pg13" || condClean === "13+" || condClean === "12a" || condClean === "12" || condClean === "pg13c") {
        return crClean === "PG13" || crClean === "13+" || crClean === "12A" || crClean === "12" || rawCr.includes("PG-13") || rawCr.includes("13");
    }
    if (condClean === "nc17" || condClean === "18+" || condClean === "r18+" || condClean === "nc17c") {
        return crClean === "NC17" || crClean === "18+" || crClean === "R18" || rawCr.includes("NC-17") || rawCr.includes("18");
    }
    if (condClean === "r" || condClean === "rc" || condClean === "restricted" || condClean === "15" || condClean === "16") {
        return crClean === "R" || crClean === "15" || crClean === "16" || rawCr === "R" || rawCr === "US:R";
    }
    if (condClean === "pg" || condClean === "pgc" || condClean === "6") {
        return crClean === "PG" || crClean === "6" || rawCr === "PG" || rawCr === "US:PG";
    }
    if (condClean === "g" || condClean === "gc" || condClean === "u" || condClean === "0") {
        return crClean === "G" || crClean === "U" || crClean === "0" || rawCr === "G" || rawCr === "US:G";
    }
    if (condClean === "tvma" || condClean === "tvmac") {
        return crClean === "TVMA" || rawCr === "TV-MA" || rawCr.includes("TV-MA") || rawCr.includes("MA");
    }
    if (condClean === "tv14" || condClean === "tv14c") {
        return crClean === "TV14" || rawCr === "TV-14" || rawCr.includes("TV-14") || rawCr.includes("14");
    }
    if (condClean === "tvpg" || condClean === "tvpgc") {
        return crClean === "TVPG" || rawCr === "TV-PG" || rawCr.includes("TV-PG");
    }
    if (condClean === "tvg" || condClean === "tvgc") {
        return crClean === "TVG" || rawCr === "TV-G" || rawCr.includes("TV-G");
    }
    if (condClean === "tvy" || condClean === "tvyc") {
        return crClean === "TVY" || rawCr === "TV-Y" || rawCr.includes("TV-Y");
    }
    if (condClean === "tvy7" || condClean === "tvy7c") {
        return crClean === "TVY7" || rawCr === "TV-Y7" || rawCr.includes("TV-Y7");
    }
    if (condClean === "nr" || condClean === "nrc" || condClean === "unrated" || condClean === "notrated") {
        return crClean === "NR" || crClean === "UNRATED" || crClean === "NOTRATED" || /NOT RATED|UNRATED|NR/i.test(rawCr);
    }
    if (condClean && crClean && condClean === crClean) {
        return true;
    }

    return false;
}

/**
 * Validates whether a given media item matches a specific ribbon preset type.
 */
export function isRibbonTypeMatching(
    type: string,
    mediaInfo: PlexMediaStreamInfo,
    options: {
        leavingSoonDays?: number;
        ratingsSource?: { rtCritics?: number; rtAudience?: number; metacritic?: number };
    } = {}
): boolean {
    const t = (type || "").toLowerCase().trim();

    // 1. IMDb Top 250 (movies or TV)
    if (t === "imdb_top_250") {
        const hasTop250 = mediaInfo.collections?.some(c => /top[\s_-]?250/i.test(c)) || mediaInfo.labels?.some(l => /top[\s_-]?250/i.test(l));
        const score = mediaInfo.imdbRating ?? mediaInfo.rating;
        if (hasTop250) return true;
        if (mediaInfo.type !== "show" && score && score >= 8.3) return true;
        return false;
    }
    if (t === "imdb_top_250_tv") {
        const hasTop250 = mediaInfo.collections?.some(c => /top[\s_-]?250|top[\s_-]?tv/i.test(c)) || mediaInfo.labels?.some(l => /top[\s_-]?250|top[\s_-]?tv/i.test(l));
        const score = mediaInfo.imdbRating ?? mediaInfo.rating;
        if (hasTop250) return true;
        if (mediaInfo.type === "show" && score && score >= 8.5) return true;
        return false;
    }

    // 2. Rotten Tomatoes Certified Fresh / RT Fresh
    if (t === "certified_fresh") {
        const rtCrit = mediaInfo.rtCriticsRating ?? options.ratingsSource?.rtCritics;
        const rtAud = mediaInfo.rtAudienceRating ?? options.ratingsSource?.rtAudience;
        return Boolean((rtCrit && rtCrit >= 75) || (rtAud && rtAud >= 80));
    }
    if (t === "rt_fresh") {
        const rtCrit = mediaInfo.rtCriticsRating ?? options.ratingsSource?.rtCritics;
        return Boolean(rtCrit && rtCrit >= 60);
    }

    // 3. Metacritic Must-See
    if (t === "metacritic_must_see") {
        const meta = options.ratingsSource?.metacritic;
        return Boolean(meta && meta >= 81);
    }

    // 4. Awards (Oscar / Academy Award / Emmy / Golden Globe / Cannes / BAFTA / Critics Choice)
    if (t === "oscar_winner" || t === "academy_award") {
        const hasOscar = mediaInfo.collections?.some(c => /oscar|academy[\s_-]?award|best[\s_-]?picture/i.test(c)) || mediaInfo.labels?.some(l => /oscar|academy[\s_-]?award/i.test(l));
        const fullStr = `${mediaInfo.title} ${mediaInfo.editionTitle || ""}`.toLowerCase();
        return Boolean(hasOscar || fullStr.includes("oscar") || fullStr.includes("academy award") || fullStr.includes("best picture"));
    }
    if (t === "emmy_winner") {
        const hasEmmy = mediaInfo.collections?.some(c => /emmy/i.test(c)) || mediaInfo.labels?.some(l => /emmy/i.test(l));
        return Boolean(hasEmmy || mediaInfo.title.toLowerCase().includes("emmy"));
    }
    if (t === "golden_globe") {
        const hasGlobe = mediaInfo.collections?.some(c => /golden[\s_-]?globe/i.test(c)) || mediaInfo.labels?.some(l => /golden[\s_-]?globe/i.test(l));
        return Boolean(hasGlobe || mediaInfo.title.toLowerCase().includes("golden globe"));
    }
    if (t === "cannes_winner") {
        const hasCannes = mediaInfo.collections?.some(c => /cannes|palme[\s_-]?d['\u2019]?or/i.test(c)) || mediaInfo.labels?.some(l => /cannes|palme[\s_-]?d['\u2019]?or/i.test(l));
        return Boolean(hasCannes || mediaInfo.title.toLowerCase().includes("cannes"));
    }
    if (t === "bafta_winner") {
        const hasBafta = mediaInfo.collections?.some(c => /bafta/i.test(c)) || mediaInfo.labels?.some(l => /bafta/i.test(l));
        return Boolean(hasBafta || mediaInfo.title.toLowerCase().includes("bafta"));
    }
    if (t === "critics_choice") {
        const hasCc = mediaInfo.collections?.some(c => /critics[\s_-]?choice/i.test(c)) || mediaInfo.labels?.some(l => /critics[\s_-]?choice/i.test(l));
        return Boolean(hasCc || mediaInfo.title.toLowerCase().includes("critics choice") || mediaInfo.title.toLowerCase().includes("critics' choice"));
    }

    // 5. Quality (4K UHD / Dolby Vision)
    if (t === "auto_quality" || t === "4k_uhd") {
        return Boolean(mediaInfo.detectedBadges?.resolution === "4K" || mediaInfo.detectedBadges?.hdr === "DV" || mediaInfo.detectedBadges?.hdr);
    }

    // 6. Special Edition
    if (t === "auto_edition") {
        return Boolean(mediaInfo.detectedBadges?.edition);
    }

    // 7. Leaving Soon
    if (t === "leaving_soon") {
        return Boolean(mediaInfo.isLeavingSoon || mediaInfo.labels?.some(l => /leaving[\s_-]?soon/i.test(l)) || mediaInfo.collections?.some(c => /leaving[\s_-]?soon/i.test(c)));
    }

    return false;
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

        const type = (tier.type || "").toLowerCase().trim();
        let isMatch = false;

        if (type === "custom" || tier.matchRule) {
            if (tier.matchRule) {
                isMatch = evaluateBadgeCondition(tier.matchRule, mediaInfo.detectedBadges);
            } else {
                isMatch = true;
            }
        } else if (type) {
            isMatch = isRibbonTypeMatching(type, mediaInfo, options);
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

// Backward compatibility stub generators
export function generatePlaceholderRibbonSvg(type: string, options: any = {}): string { 
    return generateBannerSvg(options.customText || type, options.theme || "indigo-purple", options.position || "corner").svg; 
}
export function generateLeavingSoonRibbonSvg(days?: number): string { return ""; }
export function generateDigitalReleaseRibbonSvg(days: number, date?: string): string { return ""; }
export function generateDovetailedResolutionHdrBadgeSvg(res: string, hdr?: string | null, theme?: string): string { return ""; }
export function generateResolutionBadgeSvg(res: string, theme?: string): string { return ""; }
export function generateHdrBadgeSvg(hdr: string, theme?: string): string { return ""; }
export function generateAudioBadgeSvg(audio: string, theme?: string): string { return ""; }
export function generateAudioChannelBadgeSvg(ch: string, theme?: string): string { return ""; }
export function generateCodecBadgeSvg(codec: string, theme?: string): string { return ""; }
export function generateEditionBadgeSvg(ed: string, theme?: string): string { return ""; }
export function generateStudioLogoBadgeSvg(studio: string, theme?: string): string { return ""; }
export function generateContentRatingBadgeSvg(rating: string, theme?: string): string { return ""; }
export function generateRatingsBadgeSvg(ratings: any, theme?: string): string { return ""; }
export function generateKometaCornerRibbonSvg(text: string, pos?: string, theme?: string): string { return ""; }
export function generateCornerRibbonSvg(text: string, pos?: string, theme?: string): string { return ""; }
export function generateTieredCornerRibbonSvg(ribbons: any[], pos?: string): string { return ""; }

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

function getBannerThemeColors(theme?: string): {
    grad1: string;
    grad2: string;
    grad3: string;
    border: string;
    text: string;
    accent: string;
} {
    const t = (theme || "indigo-purple").toLowerCase();
    if (t.includes("crimson") || t.includes("red")) {
        return {
            grad1: "#ef4444",
            grad2: "#b91c1c",
            grad3: "#450a0a",
            border: "#f87171",
            text: "#ffffff",
            accent: "#fca5a5"
        };
    }
    if (t.includes("gold") || t.includes("amber") || t.includes("yellow")) {
        return {
            grad1: "#fbbf24",
            grad2: "#d97706",
            grad3: "#78350f",
            border: "#fde68a",
            text: "#ffffff",
            accent: "#fef3c7"
        };
    }
    if (t.includes("green") || t.includes("emerald")) {
        return {
            grad1: "#34d399",
            grad2: "#059669",
            grad3: "#064e3b",
            border: "#6ee7b7",
            text: "#ffffff",
            accent: "#a7f3d0"
        };
    }
    if (t.includes("blue") || t.includes("cyan")) {
        return {
            grad1: "#38bdf8",
            grad2: "#0284c7",
            grad3: "#0c4a6e",
            border: "#7dd3fc",
            text: "#ffffff",
            accent: "#bae6fd"
        };
    }
    if (t.includes("cyber") || t.includes("neon")) {
        return {
            grad1: "#06b6d4",
            grad2: "#d946ef",
            grad3: "#4a044e",
            border: "#67e8f9",
            text: "#ffffff",
            accent: "#f0abfc"
        };
    }
    if (t.includes("netflix")) {
        return {
            grad1: "#e50914",
            grad2: "#990000",
            grad3: "#400000",
            border: "#ff4d4d",
            text: "#ffffff",
            accent: "#ff9999"
        };
    }
    if (t.includes("glass") || t.includes("slate") || t.includes("frosted")) {
        return {
            grad1: "#334155",
            grad2: "#0f172a",
            grad3: "#020617",
            border: "#94a3b8",
            text: "#f8fafc",
            accent: "#e2e8f0"
        };
    }
    // Default: Indigo-Purple
    return {
        grad1: "#a855f7",
        grad2: "#6366f1",
        grad3: "#312e81",
        border: "#c084fc",
        text: "#ffffff",
        accent: "#e9d5ff"
    };
}

function generateBannerSvg(
    text: string,
    theme: string,
    position: "top" | "bottom" | "corner" | "middle" | "lower_third" | "upper_third" | "center" | "top-right" | "top-left" | "bottom-right" | "bottom-left" | string = "bottom"
): { svg: string; width: number; height: number; top: number; left: number } {
    const colors = getBannerThemeColors(theme);
    const escapedText = (text || "LEAVING SOON")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    const isCorner = position === "corner" || position.includes("corner") || position === "top-right" || position === "top-left" || position === "bottom-right" || position === "bottom-left";

    if (isCorner) {
        const size = 420;
        const len = escapedText.length;
        const fontSize = len > 26 ? 20 : len > 20 ? 23 : len > 14 ? 26 : len > 8 ? 30 : 34;

        let polyPoints = "";
        let cx = 210, cy = 210;
        let rotAngle = 45;
        let top = 0;
        let left = 1000 - size;

        const effectivePos = position === "corner" ? "top-right" : position;

        if (effectivePos === "top-right") {
            polyPoints = "100,0 420,320 420,420 0,0";
            cx = 235;
            cy = 185;
            rotAngle = 45;
            top = 0;
            left = 1000 - size;
        } else if (effectivePos === "top-left") {
            polyPoints = "320,0 0,320 0,420 420,0";
            cx = 185;
            cy = 185;
            rotAngle = -45;
            top = 0;
            left = 0;
        } else if (effectivePos === "bottom-right") {
            polyPoints = "0,420 420,0 420,100 100,420";
            cx = 235;
            cy = 235;
            rotAngle = -45;
            top = 1500 - size;
            left = 1000 - size;
        } else { // bottom-left
            polyPoints = "420,420 0,0 0,100 320,420";
            cx = 185;
            cy = 235;
            rotAngle = 45;
            top = 1500 - size;
            left = 0;
        }

        const svg = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="cornerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="${colors.grad1}" />
                    <stop offset="50%" stop-color="${colors.grad2}" />
                    <stop offset="100%" stop-color="${colors.grad3}" />
                </linearGradient>
            </defs>
            <polygon points="${polyPoints}" fill="url(#cornerGrad)" />
            <g transform="rotate(${rotAngle} ${cx} ${cy})">
                <text x="${cx + 1}" y="${cy + 2}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}px" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000" opacity="0.95">${escapedText}</text>
                <text x="${cx - 1}" y="${cy + 2}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}px" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000" opacity="0.95">${escapedText}</text>
                <text x="${cx}" y="${cy}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}px" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${colors.text || '#ffffff'}" stroke="${colors.accent || '#fca5a5'}" stroke-width="0.8px">${escapedText}</text>
            </g>
        </svg>`;

        return { svg, width: size, height: size, top, left };
    }

    const width = 1000;
    const height = 180;
    const isTop = position === "top";
    
    // Position Top Offset calculation
    let topPos = 1500 - height; // default "bottom" = 1320
    if (position === "top") {
        topPos = 0;
    } else if (position === "upper_third") {
        topPos = 380;
    } else if (position === "middle" || position === "center") {
        topPos = Math.round((1500 - height) / 2); // 660
    } else if (position === "lower_third") {
        topPos = 1060;
    }

    const len = escapedText.length;
    const fontSize = len > 34 ? 32 : len > 22 ? 40 : 46;
    const textY = Math.round(height / 2);

    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bannerGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stop-color="${isTop ? colors.grad3 : colors.grad1}" stop-opacity="0.96" />
                <stop offset="50%" stop-color="${colors.grad2}" stop-opacity="0.95" />
                <stop offset="100%" stop-color="${isTop ? colors.grad1 : colors.grad3}" stop-opacity="0.98" />
            </linearGradient>
            <linearGradient id="lineGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="${colors.border}" stop-opacity="0.2" />
                <stop offset="25%" stop-color="${colors.accent}" stop-opacity="0.9" />
                <stop offset="50%" stop-color="#ffffff" stop-opacity="1" />
                <stop offset="75%" stop-color="${colors.accent}" stop-opacity="0.9" />
                <stop offset="100%" stop-color="${colors.border}" stop-opacity="0.2" />
            </linearGradient>
        </defs>
        
        <rect x="0" y="0" width="${width}" height="${height}" fill="url(#bannerGrad)" />
        
        ${isTop 
            ? `<line x1="0" y1="${height - 3}" x2="${width}" y2="${height - 3}" stroke="url(#lineGrad)" stroke-width="5" />
               <line x1="50" y1="${height - 10}" x2="${width - 50}" y2="${height - 10}" stroke="${colors.accent}" stroke-width="1.5" stroke-dasharray="10 5" opacity="0.6" />`
            : `<line x1="0" y1="3" x2="${width}" y2="3" stroke="url(#lineGrad)" stroke-width="5" />
               <line x1="50" y1="10" x2="${width - 50}" y2="10" stroke="${colors.accent}" stroke-width="1.5" stroke-dasharray="10 5" opacity="0.6" />
               <line x1="0" y1="${height - 3}" x2="${width}" y2="${height - 3}" stroke="url(#lineGrad)" stroke-width="5" opacity="0.5" />`
        }

        <!-- Deep Drop Shadows -->
        <text x="502" y="${textY + 3}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}px" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000" opacity="0.9">${escapedText}</text>
        <text x="498" y="${textY + 3}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}px" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000" opacity="0.9">${escapedText}</text>
        <text x="500" y="${textY + 4}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}px" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#000000" opacity="0.95">${escapedText}</text>

        <!-- Crisp High-Contrast Foreground Text Layer -->
        <text x="500" y="${textY}" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="${fontSize}px" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="${colors.text || '#ffffff'}" stroke="${colors.accent || '#fca5a5'}" stroke-width="1px">${escapedText}</text>
    </svg>`;

    return { svg, width, height, top: topPos, left: 0 };
}

function generatePlaceholderBackdropSvg(title: string): string {
    const escapedTitle = (title || "UPCOMING RELEASE")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");

    return `<svg width="1000" height="1500" viewBox="0 0 1000 1500" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <radialGradient id="bgGrad" cx="50%" cy="42%" r="65%">
                <stop offset="0%" stop-color="#1e293b" />
                <stop offset="60%" stop-color="#0f172a" />
                <stop offset="100%" stop-color="#020617" />
            </radialGradient>
            <linearGradient id="gridGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.1" />
                <stop offset="100%" stop-color="#8b5cf6" stop-opacity="0.05" />
            </linearGradient>
            <filter id="posterGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="4" stdDeviation="10" flood-color="#000000" flood-opacity="0.8" />
            </filter>
        </defs>
        
        <rect width="1000" height="1500" fill="url(#bgGrad)" />
        <rect width="1000" height="1500" fill="url(#gridGrad)" />

        <g opacity="0.18" transform="translate(375, 460)">
            <circle cx="125" cy="125" r="110" fill="none" stroke="#f8fafc" stroke-width="12" />
            <circle cx="125" cy="125" r="35" fill="none" stroke="#f8fafc" stroke-width="8" />
            <circle cx="125" cy="60" r="16" fill="#f8fafc" />
            <circle cx="125" cy="190" r="16" fill="#f8fafc" />
            <circle cx="60" cy="125" r="16" fill="#f8fafc" />
            <circle cx="190" cy="125" r="16" fill="#f8fafc" />
        </g>

        <g filter="url(#posterGlow)">
            <text x="500" y="780" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="44px" font-weight="900" text-anchor="middle" dominant-baseline="central" fill="#f8fafc">${escapedTitle}</text>
            <text x="500" y="830" font-family="DejaVu Sans, Arial, Helvetica, sans-serif" font-size="20px" font-weight="700" letter-spacing="3px" text-anchor="middle" dominant-baseline="central" fill="#94a3b8">PORTALARR PREVIEW</text>
        </g>
    </svg>`;
}

/**
 * Interpolates template tokens such as {date}, {days}, {title}, {source}, {status}, {reason}, {quality} in custom banner strings.
 * Automatically computes target dates and days remaining so banners always render populated text.
 */
export function interpolateBannerVariables(
    template: string,
    vars: {
        date?: string;
        days?: number | string;
        title?: string;
        source?: string;
        status?: string;
        reason?: string;
        quality?: string;
    } = {}
): string {
    if (!template) return "";
    let res = template;

    // Calculate effective days and formatted date if missing
    const effectiveDays = vars.days !== undefined && vars.days !== null ? Number(vars.days) : 14;
    const effectiveDate = vars.date || new Date(Date.now() + effectiveDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const effectiveFullDate = vars.date || new Date(Date.now() + effectiveDays * 86400000).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" });

    res = res.replace(/\{date\}/gi, effectiveDate);
    res = res.replace(/\{date_short\}/gi, effectiveDate);
    res = res.replace(/\{date_full\}/gi, effectiveFullDate);
    res = res.replace(/\{days\}/gi, String(effectiveDays));
    res = res.replace(/\{days_left\}/gi, String(effectiveDays));
    res = res.replace(/\{days_remaining\}/gi, String(effectiveDays));

    if (vars.title !== undefined && vars.title !== null) {
        res = res.replace(/\{title\}/gi, String(vars.title));
    } else {
        res = res.replace(/\{title\}/gi, "Media");
    }

    if (vars.source !== undefined && vars.source !== null) {
        res = res.replace(/\{source\}/gi, String(vars.source));
    } else {
        res = res.replace(/\{source\}/gi, "Plex");
    }

    if (vars.status !== undefined && vars.status !== null) {
        res = res.replace(/\{status\}/gi, String(vars.status));
    } else {
        res = res.replace(/\{status\}/gi, "Leaving Soon");
    }

    if (vars.reason !== undefined && vars.reason !== null) {
        res = res.replace(/\{reason\}/gi, String(vars.reason));
    } else {
        res = res.replace(/\{reason\}/gi, "Unwatched Media");
    }

    if (vars.quality !== undefined && vars.quality !== null) {
        res = res.replace(/\{quality\}/gi, String(vars.quality));
    } else {
        res = res.replace(/\{quality\}/gi, "4K UHD");
    }

    // Clean up any remaining unparsed token artifacts (e.g. {unknown})
    res = res.replace(/\{[a-zA-Z0-9_\-]+\}/g, "").replace(/\s{2,}/g, " ").trim();

    return res;
}

/**
 * Generates a full high-resolution composited placeholder poster with custom banner / ribbon using Sharp.
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
        position?: "top" | "bottom" | "corner" | "middle" | "lower_third" | "upper_third" | "center" | string;
    } = {}
): Promise<Buffer> {
    const width = 1000;
    const height = 1500;
    const baseBuffer: Buffer | null = await resolvePosterBuffer(posterUrl, title);

    let pipeline: ReturnType<typeof sharp>;
    if (baseBuffer) {
        pipeline = sharp(baseBuffer).resize(width, height, { fit: "cover" });
    } else {
        const bgSvg = generatePlaceholderBackdropSvg(title);
        pipeline = sharp(Buffer.from(bgSvg)).png().resize(width, height);
    }

    const effectiveDays = options.daysRemaining !== undefined && options.daysRemaining !== null ? Number(options.daysRemaining) : 14;
    const effectiveDate = options.date || options.formattedDate || new Date(Date.now() + effectiveDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

    const rawText = options.customText || options.type?.replace(/_/g, " ").toUpperCase() || "COMING SOON";
    const interpolatedText = interpolateBannerVariables(rawText, {
        date: effectiveDate,
        days: effectiveDays,
        title,
        source: options.source,
        status: options.status,
        reason: options.reason
    }).trim().toUpperCase();

    const bannerPos = options.position || "bottom";
    const bannerTheme = options.theme || "indigo-purple";

    const bannerInfo = generateBannerSvg(interpolatedText, bannerTheme, bannerPos);
    const bannerBuffer = await sharp(Buffer.from(bannerInfo.svg)).png().toBuffer();

    const composites = [
        {
            input: bannerBuffer,
            top: Math.round(bannerInfo.top),
            left: Math.round(bannerInfo.left)
        }
    ];

    return await pipeline.composite(composites).jpeg({ quality: 92 }).toBuffer();
}

/**
 * Applies pure pre-rendered PNG Kometa overlay badges & custom uploaded badges onto a poster image buffer using Sharp.
 * 100% font-independent raster pipeline — zero blank boxes, zero SVG text dependency.
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
    let renderedRibbonCorner: string | null = null;

    // 1. Leaving Soon Banner / Ribbon
    const isItemLeavingSoon = Boolean(
        mediaInfo.isLeavingSoon || 
        options.leavingSoonDays !== undefined || 
        Boolean(options.placeholderText && options.showLeavingSoon) ||
        mediaInfo.labels?.some(l => /leaving[\s_-]?soon/i.test(l)) || 
        mediaInfo.collections?.some(c => /leaving[\s_-]?soon/i.test(c))
    );
    if (options.showLeavingSoon && isItemLeavingSoon) {
        const effectiveDays = options.leavingSoonDays !== undefined ? Number(options.leavingSoonDays) : 14;
        const effectiveDate = options.digitalReleaseDate || new Date(Date.now() + effectiveDays * 86400000).toLocaleDateString("en-US", { month: "short", day: "numeric" });

        const leavingText = options.placeholderText 
            ? interpolateBannerVariables(options.placeholderText, {
                days: effectiveDays,
                date: effectiveDate,
                title: mediaInfo.title,
                reason: (mediaInfo as any).leavingReason || "Storage threshold optimization",
                status: "Leaving Soon",
                quality: mediaInfo.detectedBadges?.resolution || "4K UHD",
                source: "Plex"
            })
            : `LEAVING IN ${effectiveDays} DAYS`;

        const bannerPos = options.placeholderPosition || (options.position === "top-right" || options.position === "top-left" ? "corner" : "bottom");
        const bannerTheme = options.placeholderTheme || "crimson-red";

        const bannerInfo = generateBannerSvg(leavingText, bannerTheme, bannerPos as any);
        const bannerBuf = await sharp(Buffer.from(bannerInfo.svg)).png().toBuffer();
        overlays.push({
            input: bannerBuf,
            top: Math.round(bannerInfo.top),
            left: Math.round(bannerInfo.left)
        });

        // Add flame badge if available and banner is not corner
        const firePath = path.join(STOCK_KOMETA_DIR, "fire.png");
        const flamePath = path.join(STOCK_KOMETA_DIR, "flame.png");
        const iconPath = fs.existsSync(firePath) ? firePath : fs.existsSync(flamePath) ? flamePath : null;
        if (iconPath && bannerPos !== "corner") {
            const iconBuf = await sharp(iconPath).resize(80, 80).toBuffer();
            overlays.push({
                input: iconBuf,
                top: bannerPos === "top" ? 50 : 1500 - 130,
                left: 50
            });
        }
    }

    // 2. Diagonal Corner Ribbons (Kometa Waterfall Priority / Single Ribbon)
    if (options.showRibbon || options.ribbonText || (options.tieredRibbons && options.tieredRibbons.length > 0) || options.ribbonMode === "auto_stack" || options.ribbonMode === "tiered" || options.ribbonMode === "waterfall") {
        const rPos = options.ribbonPosition || "bottom-right";
        let winningRibbonName = "";
        let winningTheme = options.ribbonTheme || "gold";

        if (options.ribbonMode === "single") {
            if (options.ribbonText && options.ribbonText.trim()) {
                winningRibbonName = options.ribbonText.trim();
            } else if (options.ribbonType) {
                const isMatch = isRibbonTypeMatching(options.ribbonType, mediaInfo, {
                    leavingSoonDays: options.leavingSoonDays,
                    ratingsSource: options.ratingsSource
                });
                if (isMatch) {
                    winningRibbonName = options.ribbonType;
                }
            }
        } else {
            // Waterfall Priority Mode (Kometa Standard)
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
                winningRibbonName = matched.matchedType || matched.text;
                if (matched.theme) winningTheme = matched.theme;
            }
        }

        if (winningRibbonName) {
            const ribbonRelPath = resolveStockRibbonPath(winningRibbonName, winningTheme);
            if (ribbonRelPath) {
                // If it's a blank ribbon (e.g. leaving_soon or custom text or generic tier), render dynamic corner banner with crisp text!
                if (ribbonRelPath.includes("blank-") || winningRibbonName === "leaving_soon" || !fs.existsSync(path.join(STOCK_KOMETA_DIR, ribbonRelPath))) {
                    const ribbonText = winningRibbonName === "leaving_soon" 
                        ? (options.leavingSoonDays ? `LEAVING IN ${options.leavingSoonDays}D` : "LEAVING SOON") 
                        : (options.ribbonText || winningRibbonName).replace(/_/g, " ").toUpperCase();

                    const bannerTheme = winningTheme === "gold" ? "amber-gold" : winningTheme === "crimson" ? "crimson-red" : winningTheme === "purple" ? "indigo-purple" : "amber-gold";
                    const bannerInfo = generateBannerSvg(ribbonText, bannerTheme, rPos);
                    const ribbonBuf = await sharp(Buffer.from(bannerInfo.svg)).png().toBuffer();

                    overlays.push({
                        input: ribbonBuf,
                        top: Math.round(bannerInfo.top),
                        left: Math.round(bannerInfo.left)
                    });
                    renderedRibbonCorner = rPos;
                } else {
                    const fullRibbonPath = path.join(STOCK_KOMETA_DIR, ribbonRelPath);
                    if (fs.existsSync(fullRibbonPath)) {
                        let ribbonSharp = sharp(fullRibbonPath).resize(380, 380);

                        // Standard Kometa ribbon PNG is naturally in bottom-right
                        if (rPos === "bottom-left") {
                            ribbonSharp = ribbonSharp.flop();
                        } else if (rPos === "top-right") {
                            ribbonSharp = ribbonSharp.flip();
                        } else if (rPos === "top-left") {
                            ribbonSharp = ribbonSharp.flip().flop();
                        }

                        const ribbonBuf = await ribbonSharp.toBuffer();
                        const rTop = rPos.startsWith("top") ? 0 : 1500 - 380;
                        const rLeft = rPos.endsWith("right") ? 1000 - 380 : 0;

                        overlays.push({
                            input: ribbonBuf,
                            top: rTop,
                            left: rLeft
                        });
                        renderedRibbonCorner = rPos;
                    }
                }
            }
        }
    }

    // 3. Custom Badges Matcher & Category Tracking
    function doesCustomBadgeMatchMedia(
        cb: { category?: string; matchRule?: string | null; name?: string; filePath?: string },
        mInfo: PlexMediaStreamInfo
    ): boolean {
        const rawRule = (cb.matchRule || "").trim().toLowerCase();
        const rawCategory = (cb.category || "").trim().toLowerCase();
        const rawName = (cb.name || "").toLowerCase();
        const rawFile = path.basename(cb.filePath || "").toLowerCase();

        if (rawRule === "all" || rawRule === "*" || (rawCategory === "ribbon" && !rawRule) || (rawCategory === "banner" && !rawRule)) {
            return true;
        }

        const primaryMedia = mInfo.media?.[0];
        const audioCodec = (primaryMedia?.audioCodec || "").toLowerCase();
        const audioProfile = (primaryMedia?.audioProfile || "").toLowerCase();
        const audioTitle = (primaryMedia?.audioTitle || "").toLowerCase();
        const fullAudioStr = `${mInfo.detectedBadges.audio || ""} ${audioCodec} ${audioProfile} ${audioTitle}`.toLowerCase();

        let tokens: string[] = [];
        if (rawRule.includes("+") || rawRule.includes(",") || rawRule.includes("&")) {
            tokens = rawRule.split(/[+,&]/).map(t => t.trim()).filter(Boolean);
        } else if (rawRule) {
            tokens = [rawRule];
        } else {
            const baseName = `${rawName} ${rawFile.replace(/\.[^/.]+$/, "")}`.toLowerCase();
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

            // Infer Content / Age Ratings
            if (/uspg-13|uspg13|pg-13|pg13/i.test(baseName)) inferredTokens.push("pg-13");
            else if (/ustv-ma|ustvma|tv-ma|tvma/i.test(baseName)) inferredTokens.push("tv-ma");
            else if (/ustv-14|ustv14|tv-14|tv14/i.test(baseName)) inferredTokens.push("tv-14");
            else if (/ustv-pg|ustvpg|tv-pg|tvpg/i.test(baseName)) inferredTokens.push("tv-pg");
            else if (/ustv-g|ustvg|tv-g|tvg/i.test(baseName)) inferredTokens.push("tv-g");
            else if (/ustv-y7|ustvy7|tv-y7|tvy7/i.test(baseName)) inferredTokens.push("tv-y7");
            else if (/ustv-y|ustvy|tv-y|tvy/i.test(baseName)) inferredTokens.push("tv-y");
            else if (/usnc-17|usnc17|nc-17|nc17/i.test(baseName)) inferredTokens.push("nc-17");
            else if (/usr|\brated[\s_-]?r\b|\br\.png\b/i.test(baseName)) inferredTokens.push("r");
            else if (/uspg|\brated[\s_-]?pg\b|\bpg\.png\b/i.test(baseName)) inferredTokens.push("pg");
            else if (/usg|\brated[\s_-]?g\b|\bg\.png\b/i.test(baseName)) inferredTokens.push("g");
            else if (/usnr|unrated|not[\s_-]?rated/i.test(baseName)) inferredTokens.push("nr");

            tokens = inferredTokens;
        }

        if (tokens.length === 0) return false;
        return tokens.every(tok => evaluateBadgeCondition(tok, mInfo.detectedBadges, fullAudioStr));
    }

    function getCustomBadgeCategories(cb: { category?: string; matchRule?: string | null; name?: string; filePath?: string }): string[] {
        const cat = (cb.category || "").toLowerCase().trim();
        const rule = (cb.matchRule || "").toLowerCase().trim();
        const name = (cb.name || "").toLowerCase().trim();
        const fName = path.basename(cb.filePath || "").toLowerCase();
        const combined = `${cat} ${rule} ${name} ${fName}`;

        const categories = new Set<string>();
        if (cat === "resolution") categories.add("resolution");
        if (cat === "hdr") categories.add("hdr");
        if (cat === "codec") categories.add("codec");
        if (cat === "audio") categories.add("audio");
        if (cat === "channels") categories.add("channels");
        if (cat === "edition") categories.add("edition");
        if (cat === "studio") categories.add("studio");
        if (cat === "contentrating" || cat === "content_rating" || cat === "cr" || cat === "age_rating" || cat === "agerating" || cat === "mpaa") categories.add("contentRating");
        if (cat === "ratings" || cat === "rating" || cat === "audience") categories.add("ratings");
        if (cat === "ribbon" || cat === "banner") categories.add("ribbon");

        if (fName.includes("_resolution_") || /\b(4k|2160p?|1080p?|720p?|480p?|576p?|sd|uhd|fhd)\b/i.test(rule) || /\b(4k|2160p?|1080p?|720p?|480p?|576p?|sd|uhd|fhd)\b/i.test(name)) {
            categories.add("resolution");
        }
        if (fName.includes("_hdr_") || /\b(dv|dolby\s*vision|hdr10\+|hdr10|hdr|hlg|sdr)\b/i.test(rule) || /\b(dv|dolby\s*vision|hdr10\+|hdr10|hdr|hlg|sdr)\b/i.test(name)) {
            categories.add("hdr");
        }
        if (fName.includes("_codec_") || /\b(hevc|h265|x265|av1|prores|avc|h264|x264|vc1|mpeg2)\b/i.test(combined)) {
            categories.add("codec");
        }
        if (fName.includes("_audio_codec_") || /\b(atmos|truehd|dts:x|dts-x|dts-hd|dtshd|dts-ma|dts|flac|aac|eac3|ac3|pcm|opus|mp3)\b/i.test(combined)) {
            categories.add("audio");
        }
        if (/\b(7\.1|5\.1|2\.0|channels|surround)\b/i.test(combined)) {
            categories.add("channels");
        }
        if (fName.includes("_edition_") || /\b(imax|criterion|director|directors|extended|theatrical|remux|remaster|uncut|unrated|collector|definitive|anniversary)\b/i.test(combined)) {
            categories.add("edition");
        }
        if ((fName.includes("_streaming_") || fName.includes("_studio_") || /\b(netflix|disney|hbo|max|apple|prime|amazon|paramount|peacock|hulu|crunchyroll|amc|discovery|hayu|tubi|filmin|crave|itvx|a24|marvel|dc)\b/i.test(combined)) && !categories.has("edition")) {
            categories.add("studio");
        }
        if (fName.includes("_cr_") || /\b(usg|uspg|uspg-13|uspg13|usr|usnc-17|usnc17|usnr|ustv-ma|ustvma|ustv-14|ustv14|ustv-pg|ustvpg|pg-13|pg13|nc-17|nc17|tv-ma|tvma|tv-14|tv14|tv-pg|tvpg|tv-y7|tv-y|tv-g|rated\s+[a-z0-9-]+)\b/i.test(combined)) {
            categories.add("contentRating");
        }
        if (fName.includes("_rating_") || /\b(imdb|criticfresh|audiencefresh|criticrotten|audiencerotten|metacritic|tmdb|trakt|letterboxd|mdblist|anidb|mal)\b/i.test(combined)) {
            categories.add("ratings");
        }
        if (fName.includes("_ribbon_") || /\b(oscar|cannes|golden|emmy|bafta|sundance|berlinale|venice|spirit|rottenverified)\b/i.test(combined)) {
            categories.add("ribbon");
        }

        if (categories.size === 0 && cat && cat !== "custom") {
            categories.add(cat);
        }

        return Array.from(categories);
    }

    // 4. Resolve Independent Positions and Buckets for All Badges
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

    const appliedCategories = new Set<string>();

    const getCategoryScale = (category: string): number => {
        const catMap = options.categoryScales || {};
        if (category === "resolution") return catMap.resolution ?? options.resolutionScale ?? 1.0;
        if (category === "hdr") return catMap.hdr ?? options.hdrScale ?? 1.0;
        if (category === "codec") return catMap.codec ?? options.codecScale ?? 1.0;
        if (category === "audio") return catMap.audio ?? options.audioScale ?? 1.0;
        if (category === "channels") return catMap.channels ?? options.channelsScale ?? 1.0;
        if (category === "edition") return catMap.edition ?? options.editionScale ?? 1.0;
        if (category === "studio") return catMap.studio ?? options.studioScale ?? 1.0;
        if (category === "contentRating") return catMap.contentRating ?? options.contentRatingScale ?? 1.0;
        if (category === "ratings") return catMap.ratings ?? options.ratingsScale ?? 1.0;
        if (category === "ribbon") return catMap.ribbon ?? options.ribbonScale ?? 1.0;
        if (catMap[category] !== undefined) return catMap[category];
        return 1.0;
    };

    // Process active custom badges
    if (options.customBadges && Array.isArray(options.customBadges)) {
        const sortedCustomBadges = [...options.customBadges].sort((a, b) => {
            const aTokens = (a.matchRule || "").split(/[+,&]/).length;
            const bTokens = (b.matchRule || "").split(/[+,&]/).length;
            return bTokens - aTokens;
        });

        for (const cb of sortedCustomBadges) {
            if (!cb.filePath || !fs.existsSync(cb.filePath)) continue;
            if (!doesCustomBadgeMatchMedia(cb, mediaInfo)) continue;

            const badgeCats = getCustomBadgeCategories(cb);
            if (badgeCats.length > 0 && badgeCats.every(c => appliedCategories.has(c))) continue;

            try {
                const primaryLayerKey = badgeCats[0] || "custom";
                const catScale = getCategoryScale(primaryLayerKey);
                const masterScale = options.badgeScale || 1.0;
                const effectiveScale = masterScale * catScale;

                const rawW = cb.width || 240;
                const rawH = cb.height || 48;
                const isFullPoster = rawW >= 800 && rawH >= 1200;

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

                const cbWidth = Math.round(rawW * effectiveScale);
                const cbHeight = Math.round(rawH * effectiveScale);

                if (isFullPoster) {
                    let fullBuf = await sharp(cb.filePath).resize(1000, 1500, { fit: "cover" }).toBuffer();
                    if (cb.opacity !== undefined && cb.opacity < 1.0) {
                        fullBuf = await sharp(fullBuf).ensureAlpha().linear(cb.opacity, 0).toBuffer();
                    }
                    overlays.push({ input: fullBuf, top: 0, left: 0 });
                } else {
                    let targetCategoryPos = fallbackPos;
                    if (badgeCats.includes("edition")) targetCategoryPos = editionPos;
                    else if (badgeCats.includes("resolution")) targetCategoryPos = resPos;
                    else if (badgeCats.includes("hdr")) targetCategoryPos = hdrPos;
                    else if (badgeCats.includes("codec")) targetCategoryPos = codecPos;
                    else if (badgeCats.includes("audio")) targetCategoryPos = audioPos;
                    else if (badgeCats.includes("channels")) targetCategoryPos = channelsPos;
                    else if (badgeCats.includes("studio")) targetCategoryPos = studioPos;
                    else if (badgeCats.includes("contentRating")) targetCategoryPos = contentRatingPos;
                    else if (badgeCats.includes("ratings")) targetCategoryPos = ratingsPos;

                    const cbPos = targetCategoryPos || cb.position || fallbackPos;
                    let cbBuffer = await sharp(cb.filePath)
                        .resize(cbWidth, cbHeight, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
                        .toBuffer();

                    if (cb.opacity !== undefined && cb.opacity < 1.0) {
                        cbBuffer = await sharp(cbBuffer).ensureAlpha().linear(cb.opacity, 0).toBuffer();
                    }

                    buckets[cbPos]?.push({ buf: cbBuffer, w: cbWidth, h: cbHeight, layerKey: primaryLayerKey });
                }
            } catch (err) {
                logger.addLog("WARN", "CURATION", `Failed to load custom badge ${cb.name}: ${err}`);
            }
        }
    }

    // Helper to push pre-rendered stock PNG badge into bucket
    const pushStockImageToBucket = async (
        pos: string,
        relativePath: string,
        layerKey: string,
        targetW = 240,
        targetH = 48
    ): Promise<boolean> => {
        if (!buckets[pos]) return false;
        const fullPath = path.join(STOCK_KOMETA_DIR, relativePath);
        if (!fs.existsSync(fullPath)) return false;

        try {
            const catScale = getCategoryScale(layerKey);
            const masterScale = options.badgeScale || 1.0;
            const effectiveScale = masterScale * catScale;

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

            if (effectiveScale !== 1.0 && effectiveScale > 0.1) {
                w = Math.round(w * effectiveScale);
                h = Math.round(h * effectiveScale);
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

    // 5. Stock Resolution / HDR Badges
    const shouldCombineResHdr = (options.dovetailResolutionHdr !== false) &&
        options.showResolution !== false &&
        options.showHdr !== false &&
        resPos === hdrPos &&
        !hasCustomResolution &&
        !hasCustomHdr &&
        Boolean(mediaInfo.detectedBadges.resolution) &&
        Boolean(mediaInfo.detectedBadges.hdr);

    if (shouldCombineResHdr) {
        const resHdrPath = resolveStockResolutionBadgePath(
            mediaInfo.detectedBadges.resolution!,
            mediaInfo.detectedBadges.hdr
        );
        if (resHdrPath) {
            await pushStockImageToBucket(resPos, resHdrPath, "resolution", 240, 48);
        }
    } else {
        if (options.showResolution !== false && mediaInfo.detectedBadges.resolution && !hasCustomResolution) {
            const resPath = resolveStockResolutionBadgePath(mediaInfo.detectedBadges.resolution);
            if (resPath) {
                await pushStockImageToBucket(resPos, resPath, "resolution", 200, 48);
            }
        }
        if (options.showHdr !== false && mediaInfo.detectedBadges.hdr && !hasCustomHdr) {
            const hdrPath = resolveStockResolutionBadgePath(null, mediaInfo.detectedBadges.hdr);
            if (hdrPath) {
                await pushStockImageToBucket(hdrPos, hdrPath, "hdr", 200, 48);
            }
        }
    }

    // 6. Audio Codec Badge
    if (options.showAudio !== false && mediaInfo.detectedBadges.audio && !hasCustomAudio) {
        const audioPath = resolveStockAudioCodecBadgePath(mediaInfo.detectedBadges.audio, mediaInfo.detectedBadges.audioChannels);
        if (audioPath) {
            await pushStockImageToBucket(audioPos, audioPath, "audio", 210, 48);
        }
    }

    // 7. Edition / Cut Badge
    if (options.showEdition && mediaInfo.detectedBadges.edition && !hasCustomEdition) {
        const editionPath = resolveStockEditionBadgePath(mediaInfo.detectedBadges.edition);
        if (editionPath) {
            await pushStockImageToBucket(editionPos, editionPath, "edition", 210, 52);
        }
    }

    // 8. Content Rating Badge
    if (options.showContentRating && mediaInfo.detectedBadges.contentRating && !hasCustomContentRating) {
        const crPath = resolveStockContentRatingBadgePath(mediaInfo.detectedBadges.contentRating);
        if (crPath) {
            await pushStockImageToBucket(contentRatingPos, crPath, "contentRating", 120, 50);
        }
    }

    // 9. Studio Logo Badge
    if (options.showStudio && mediaInfo.detectedBadges.studio && !hasCustomStudio) {
        const studioPath = resolveStockStudioBadgePath(mediaInfo.detectedBadges.studio);
        if (studioPath) {
            await pushStockImageToBucket(studioPos, studioPath, "studio", 190, 55);
        }
    }

    // 10. Community Ratings Badge
    const effectiveRatings = options.ratingsSource || (
        (mediaInfo.imdbRating || mediaInfo.rating || mediaInfo.rtCriticsRating || mediaInfo.rtAudienceRating)
        ? {
            imdb: mediaInfo.imdbRating ?? mediaInfo.rating,
            rtCritics: mediaInfo.rtCriticsRating,
            rtAudience: mediaInfo.rtAudienceRating
        }
        : undefined
    );
    if (options.showRatings && effectiveRatings) {
        if (effectiveRatings.imdb) {
            const imdbPath = resolveStockRatingBadgePath("imdb", effectiveRatings.imdb);
            if (imdbPath) await pushStockImageToBucket(ratingsPos, imdbPath, "ratings", 100, 48);
        }
        if (effectiveRatings.rtCritics) {
            const rtPath = resolveStockRatingBadgePath("rt", effectiveRatings.rtCritics);
            if (rtPath) await pushStockImageToBucket(ratingsPos, rtPath, "ratings", 100, 48);
        }
    }

    // Default layer priority order fallback
    const defaultPriority = ["ribbon", "resolution", "hdr", "codec", "audio", "channels", "edition", "studio", "ratings", "contentRating"];
    const priorityOrder = (options.layerPriorityOrder && options.layerPriorityOrder.length > 0)
        ? options.layerPriorityOrder
        : defaultPriority;

    // 11. Render Buckets onto Poster Overlays (Vertical Stacking / Horizontal Row Stacking)
    for (const [posKey, items] of Object.entries(buckets)) {
        if (!items || items.length === 0) continue;

        items.sort((a, b) => {
            const idxA = priorityOrder.indexOf(a.layerKey);
            const idxB = priorityOrder.indexOf(b.layerKey);
            return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
        });

        const isBTop = posKey.startsWith("top");
        const isBRight = posKey.endsWith("right");
        const isBCenter = posKey.includes("center");

        const isRibbonInSameCorner = Boolean(renderedRibbonCorner) && renderedRibbonCorner === posKey;
        const bTopOffset = isBTop 
            ? (isRibbonInSameCorner ? 280 : 35) 
            : (isRibbonInSameCorner ? (1500 - 280) : (1500 - 35));

        if (isBCenter) {
            let totalW = items.reduce((acc, it) => acc + it.w + 14, 0) - 14;
            let curX = (1000 - totalW) / 2;
            for (const it of items) {
                overlays.push({
                    input: it.buf,
                    top: isBTop ? bTopOffset : bTopOffset - it.h,
                    left: Math.round(curX)
                });
                curX += it.w + 14;
            }
        } else {
            // Stack items vertically in each corner with clean spacing
            let currentY = bTopOffset;
            const currentX = isBRight ? 1000 - 35 : 35;

            for (const it of items) {
                const placeX = isBRight ? currentX - it.w : currentX;
                const placeY = isBTop ? currentY : currentY - it.h;

                overlays.push({
                    input: it.buf,
                    top: Math.round(placeY),
                    left: Math.round(placeX)
                });

                if (isBTop) {
                    currentY += (it.h + 14);
                } else {
                    currentY -= (it.h + 14);
                }
            }
        }
    }

    // Composite all layers together
    const finalImage = await baseImage
        .composite(overlays)
        .jpeg({ quality: 92 })
        .toBuffer();

    return finalImage;
}

/**
 * Computes a deterministic MD5 hash representing the media's stream telemetry and overlay options.
 * When media files are upgraded (e.g. 480p -> 1080p, HDR/Atmos added) or rules change, the hash changes.
 */
export function computeMediaOverlayHash(
    item: PlexMediaStreamInfo,
    options: OverlayOptions = {}
): string {
    const keyData = {
        ratingKey: String(item.ratingKey || ""),
        res: item.detectedBadges?.resolution || item.media?.[0]?.videoResolution || "",
        hdr: item.detectedBadges?.hdr || item.media?.[0]?.hdrFormat || "",
        audio: item.detectedBadges?.audio || item.media?.[0]?.audioCodec || "",
        channels: item.detectedBadges?.audioChannels || String(item.media?.[0]?.audioChannels || ""),
        edition: item.detectedBadges?.edition || item.editionTitle || "",
        studio: item.detectedBadges?.studio || item.studio || "",
        contentRating: item.detectedBadges?.contentRating || item.contentRating || "",
        leavingSoon: !!item.isLeavingSoon,
        customBadges: (options.customBadges || []).map(b => `${b.id}:${b.position}:${b.width}x${b.height}:${b.opacity}`).join(","),
        theme: options.theme,
        badgeScale: options.badgeScale,
        categoryScales: options.categoryScales,
        positions: {
            resolution: options.resolutionPosition,
            hdr: options.hdrPosition,
            audio: options.audioPosition,
            ratings: options.ratingsPosition,
            ribbon: options.ribbonPosition
        },
        toggles: {
            res: options.showResolution,
            hdr: options.showHdr,
            audio: options.showAudio,
            ratings: options.showRatings,
            leaving: options.showLeavingSoon,
            channels: options.showAudioChannels,
            codec: options.showCodec,
            edition: options.showEdition,
            studio: options.showStudio,
            contentRating: options.showContentRating,
            ribbon: options.showRibbon
        }
    };
    return crypto.createHash("md5").update(JSON.stringify(keyData)).digest("hex");
}

/**
 * Backs up pristine original artwork and applies overlay to a Plex item.
 * Automatically tracks mediaHash so unchanged items are skipped on incremental runs,
 * and upgraded items (e.g. 480p -> 1080p) are re-rendered from the pristine backup.
 */
export async function backupAndApplyOverlay(
    serverUrl: string,
    token: string,
    serverId: string,
    item: PlexMediaStreamInfo,
    options: OverlayOptions = {},
    forceReapply = false
): Promise<{ success: boolean; skipped?: boolean; upgraded?: boolean; applied?: boolean; message?: string }> {
    ensureBackupDir();

    if (!item.thumb) {
        return { success: false, message: "Item has no thumbnail to overlay." };
    }

    const currentHash = computeMediaOverlayHash(item, options);
    const badgeSummary = JSON.stringify({
        resolution: item.detectedBadges?.resolution,
        hdr: item.detectedBadges?.hdr,
        audio: item.detectedBadges?.audio,
        edition: item.detectedBadges?.edition,
        studio: item.detectedBadges?.studio,
        contentRating: item.detectedBadges?.contentRating,
        leavingSoon: item.isLeavingSoon
    });

    const existingBackup = await prisma.mediaArtBackup.findUnique({
        where: {
            serverId_ratingKey: {
                serverId,
                ratingKey: String(item.ratingKey)
            }
        }
    });

    // Check if item is already up to date with the exact same media attributes & rules
    if (!forceReapply && existingBackup && existingBackup.mediaHash === currentHash) {
        return {
            success: true,
            skipped: true,
            message: `"${item.title}" is already up to date with matching overlays.`
        };
    }

    const isUpgrade = Boolean(existingBackup && existingBackup.mediaHash && existingBackup.mediaHash !== currentHash);
    const backupFilePath = existingBackup?.backupFilePath || path.join(BACKUP_DIR, `${serverId}_${item.ratingKey}.jpg`);

    let originalBuffer: Buffer | null = null;
    if (existingBackup && fs.existsSync(existingBackup.backupFilePath)) {
        originalBuffer = fs.readFileSync(existingBackup.backupFilePath);
    } else {
        originalBuffer = await fetchPlexPosterBuffer(serverUrl, token, item.thumb);
        if (!originalBuffer) {
            return { success: false, message: "Failed to download poster buffer from Plex." };
        }
        fs.writeFileSync(backupFilePath, originalBuffer);
    }

    if (!existingBackup) {
        await prisma.mediaArtBackup.create({
            data: {
                ratingKey: String(item.ratingKey),
                serverId,
                title: item.title,
                originalArtUrl: item.thumb,
                backupFilePath,
                mediaHash: currentHash,
                appliedBadges: badgeSummary
            }
        });
        logger.addLog("INFO", "CURATION", `Backed up pristine original poster for "${item.title}" (RatingKey: ${item.ratingKey})`);
    }

    const overlayBuffer = await applyOverlaysToPoster(
        originalBuffer,
        item,
        options
    );

    const uploaded = await uploadPlexItemPoster(serverUrl, token, item.ratingKey, overlayBuffer);

    if (uploaded) {
        if (existingBackup) {
            await prisma.mediaArtBackup.update({
                where: { id: existingBackup.id },
                data: {
                    mediaHash: currentHash,
                    appliedBadges: badgeSummary,
                    updatedAt: new Date()
                }
            });
        }

        const actionType = isUpgrade ? "Upgraded" : "Applied";
        logger.addLog("SUCCESS", "CURATION", `${actionType} overlay badges to "${item.title}" on Plex.`);
        return { 
            success: true, 
            upgraded: isUpgrade, 
            applied: !isUpgrade,
            message: `${actionType} overlay to "${item.title}".` 
        };
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
