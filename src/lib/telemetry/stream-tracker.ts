import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface UserStreamAnalysis {
    username: string;
    email?: string;
    activeSessionsCount: number;
    sessions: any[];
    distinctIps: string[];
    distinctPublicIps: string[];
    devices: string[];
    platforms: string[];
    servers: string[];
    isMultiIp: boolean;
    isExcessiveConnections: boolean;
    isSharingSuspected: boolean;
    sharingReason?: string;
    isDualTvSharing?: boolean;
    hasFixedHomeDevice?: boolean;
}

export type AccountSharingRisk = 
    | "HIGH_SHARING_RISK"      // Multiple fixed home TVs overlapping concurrently across distinct public residential IPs
    | "MODERATE_SHARING_RISK"  // Frequent multi-IP overlaps with mixed mobile/TV devices
    | "SECOND_HOME"            // Alternating TV streaming between two home IPs with 0 concurrent overlap
    | "VACATION_TRAVEL"        // Temporary remote IP usage (<= 14 days) with 0 concurrency at primary home
    | "MOBILE_ROAMING"         // Streams on cell/mobile/laptops from various IPs, TV strictly at primary home
    | "CLEAN_SINGLE_HOME";     // Only 1 home IP or only LAN streaming

export interface UserSharingAssessment {
    risk: AccountSharingRisk;
    label: string;
    badgeColor: string;
    primaryHomeIp: string;
    secondaryHomeIp?: string;
    explanation: string;
    fixedTvOverlapCount: number;
    concurrentOverlapCount: number;
    distinctPublicIpsCount: number;
    fixedTvDevices: string[];
    mobileDevices: string[];
}

export interface DetectedOverlapSession {
    timestamp: Date;
    durationMinutes: number;
    isDualTv: boolean;
    session1: {
        title: string;
        device: string;
        platform: string;
        ipAddress: string;
        isFixedTv: boolean;
    };
    session2: {
        title: string;
        device: string;
        platform: string;
        ipAddress: string;
        isFixedTv: boolean;
    };
}

export interface WatchHistoryQueryOptions {
    user?: string;
    mediaType?: string;
    isSharingAlert?: boolean;
    search?: string;
    page?: number;
    limit?: number;
}

/**
 * Normalizes an IP address by stripping ports and IPv6 tunneling prefixes (::ffff:)
 */
export function normalizeIp(rawIp?: string | null): string {
    if (!rawIp) return "";
    let ip = rawIp.trim();
    if (ip.startsWith("::ffff:")) {
        ip = ip.replace("::ffff:", "");
    }
    // If IPv4 with port e.g. 192.168.1.50:52431
    if (ip.includes(":") && !ip.includes("::") && ip.split(":").length === 2) {
        ip = ip.split(":")[0];
    }
    return ip;
}

/**
 * Determines if an IP is local / private / loopback RFC1918
 */
export function isPrivateOrLocalIp(rawIp?: string | null): boolean {
    const ip = normalizeIp(rawIp);
    if (!ip) return true;
    if (ip === "localhost" || ip === "127.0.0.1" || ip === "::1") return true;
    if (ip.startsWith("192.168.")) return true;
    if (ip.startsWith("10.")) return true;
    if (ip.startsWith("169.254.")) return true;
    if (ip.startsWith("fc00:") || ip.startsWith("fe80:")) return true;

    // 172.16.0.0 – 172.31.255.255
    if (ip.startsWith("172.")) {
        const parts = ip.split(".");
        if (parts.length >= 2) {
            const secondOctet = parseInt(parts[1], 10);
            if (!isNaN(secondOctet) && secondOctet >= 16 && secondOctet <= 31) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Checks if two IP addresses match either exactly or belong to the same /24 IPv4 subnet
 * (common for residential dynamic ISP DHCP lease cycling).
 */
export function isSameSubnetOrIp(ipA?: string | null, ipB?: string | null): boolean {
    if (!ipA || !ipB) return false;
    const cleanA = normalizeIp(ipA).trim();
    const cleanB = normalizeIp(ipB).trim();
    if (!cleanA || !cleanB) return false;
    if (cleanA === cleanB) return true;

    // Check IPv4 /24 subnet (e.g. 73.18.20.15 vs 73.18.20.120)
    const partsA = cleanA.split(".");
    const partsB = cleanB.split(".");
    if (partsA.length === 4 && partsB.length === 4) {
        return partsA[0] === partsB[0] && partsA[1] === partsB[1] && partsA[2] === partsB[2];
    }

    // Check IPv6 /64 prefix (e.g. 2601:1c0:... vs 2601:1c0:...)
    if (cleanA.includes(":") && cleanB.includes(":")) {
        const segsA = cleanA.split(":").filter(Boolean);
        const segsB = cleanB.split(":").filter(Boolean);
        if (segsA.length >= 4 && segsB.length >= 4) {
            return segsA.slice(0, 4).join(":") === segsB.slice(0, 4).join(":");
        }
    }

    return false;
}

/**
 * Detects whether a device is a fixed living room / home appliance (TV, streaming stick, console)
 * that stays anchored to a physical residence.
 */
export function isFixedHomeDevice(device?: string | null, platform?: string | null, player?: string | null): boolean {
    const raw = `${device || ""} ${platform || ""} ${player || ""}`.toLowerCase();
    return (
        raw.includes("roku") ||
        raw.includes("appletv") ||
        raw.includes("apple tv") ||
        raw.includes("tvos") ||
        raw.includes("firetv") ||
        raw.includes("fire tv") ||
        raw.includes("firestick") ||
        raw.includes("aftt") ||
        raw.includes("aftm") ||
        raw.includes("aftb") ||
        raw.includes("android tv") ||
        raw.includes("google tv") ||
        raw.includes("shield") ||
        raw.includes("bravia") ||
        raw.includes("tizen") ||
        raw.includes("samsung") ||
        raw.includes("lg") ||
        raw.includes("webos") ||
        raw.includes("vizio") ||
        raw.includes("hisense") ||
        raw.includes("chromecast") ||
        raw.includes("smart tv") ||
        raw.includes("playstation") ||
        raw.includes("ps4") ||
        raw.includes("ps5") ||
        raw.includes("xbox")
    );
}

/**
 * Detects whether a device is mobile / roaming (cell phone, tablet, laptop, web browser)
 */
export function isMobileRoamingDevice(device?: string | null, platform?: string | null, player?: string | null): boolean {
    if (isFixedHomeDevice(device, platform, player)) return false;
    const raw = `${device || ""} ${platform || ""} ${player || ""}`.toLowerCase();
    return (
        raw.includes("iphone") ||
        raw.includes("ipad") ||
        raw.includes("android") ||
        raw.includes("phone") ||
        raw.includes("mobile") ||
        raw.includes("cellular") ||
        raw.includes("safari") ||
        raw.includes("chrome") ||
        raw.includes("firefox") ||
        raw.includes("edge") ||
        raw.includes("browser") ||
        raw.includes("laptop") ||
        raw.includes("mac") ||
        raw.includes("windows")
    );
}

/**
 * Formats milliseconds into human-readable H:MM:SS or M:SS clock string
 */
export function formatDurationMs(ms?: number | null): string {
    if (!ms || ms <= 0 || isNaN(ms)) return "0:00";
    const totalSecs = Math.floor(ms / 1000);
    const hours = Math.floor(totalSecs / 3600);
    const minutes = Math.floor((totalSecs % 3600) / 60);
    const seconds = totalSecs % 60;
    if (hours > 0) {
        return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
    }
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * Formats a future ETA epoch timestamp into a friendly clock string (e.g. "1:45 PM")
 */
export function formatEtaTimestamp(etaMs?: number | null): string {
    if (!etaMs || isNaN(etaMs)) return "";
    try {
        const date = new Date(etaMs);
        let hours = date.getHours();
        const minutes = date.getMinutes();
        const ampm = hours >= 12 ? "PM" : "AM";
        hours = hours % 12;
        hours = hours ? hours : 12;
        return `${hours}:${String(minutes).padStart(2, "0")} ${ampm}`;
    } catch {
        return "";
    }
}

/**
 * Formats audio channel counts into standard home theater nomenclature
 */
export function formatAudioChannels(channels?: number | string | null): string {
    if (!channels) return "";
    const s = String(channels).trim().toLowerCase();
    if (s === "7.1" || s === "8" || s === "8ch") return "7.1";
    if (s === "5.1" || s === "6" || s === "6ch") return "5.1";
    if (s === "2" || s === "2ch" || s === "stereo") return "Stereo";
    if (s === "1" || s === "1ch" || s === "mono") return "Mono";
    const c = Number(channels);
    if (isNaN(c) || c <= 0) return "";
    if (c >= 8) return "7.1";
    if (c >= 6) return "5.1";
    if (c === 2) return "Stereo";
    if (c === 1) return "Mono";
    return `${c}ch`;
}

/**
 * Formats video resolution tags into clean display badges
 */
export function formatResolution(res?: string | null): string {
    if (!res) return "";
    const r = String(res).toLowerCase().trim();
    const match = r.match(/\b(4k|2160p?|uhd|1080p?|720p?|576p?|480p?|sd)\b/i);
    if (match) {
        const token = match[1].toLowerCase();
        if (token === "4k" || token === "2160" || token === "2160p" || token === "uhd") return "4K UHD";
        if (token === "1080" || token === "1080p") return "1080p";
        if (token === "720" || token === "720p") return "720p";
        if (token === "576" || token === "576p") return "576p";
        if (token === "480" || token === "480p" || token === "sd") return "480p";
    }
    return String(res).toUpperCase();
}

/**
 * Resolves video resolution from raw strings, pixel height, and pixel width.
 * Essential for Plex Media Server TranscodeSession which frequently supplies height/width
 * without an explicit videoResolution attribute.
 */
export function resolveResolution(
    rawRes?: string | null,
    height?: number | string | null,
    width?: number | string | null
): string {
    const raw = String(rawRes || "").toLowerCase().trim();
    if (raw) {
        const match = raw.match(/\b(4k|2160p?|uhd|1080p?|720p?|576p?|480p?|sd)\b/i);
        if (match) {
            const token = match[1].toLowerCase();
            if (token === "4k" || token === "2160" || token === "2160p" || token === "uhd") return "4K UHD";
            if (token === "1080" || token === "1080p") return "1080p";
            if (token === "720" || token === "720p") return "720p";
            if (token === "576" || token === "576p") return "576p";
            if (token === "480" || token === "480p" || token === "sd") return "480p";
        }
    }

    const h = height !== undefined && height !== null && !isNaN(Number(height)) ? Number(height) : 0;
    const w = width !== undefined && width !== null && !isNaN(Number(width)) ? Number(width) : 0;

    if (w >= 3200 || h >= 1800) return "4K UHD";
    if (w >= 1600 || h >= 800) return "1080p"; // 1080p cinemascope (e.g. 1920x800)
    if (w >= 1000 || h >= 500) return "720p"; // 720p cinemascope (e.g. 1280x532)
    if (w >= 600 || h >= 400) return "480p";
    if (h > 0) return `${h}p`;

    if (raw) return formatResolution(raw);
    return "";
}

/**
 * Evaluates hardware acceleration decoding, encoding, engine brand, and power efficiency
 */
export function resolveHwTranscodeInfo(params: {
    transcodeHwRequested?: boolean;
    hwRequested?: boolean;
    transcodeHwDecoding?: string;
    transcodeHwEncoding?: string;
    transcodeHwDecodingTitle?: string;
    transcodeHwEncodingTitle?: string;
    transcodeHwFullPipeline?: boolean;
    videoDecoder?: string;
    videoEncoder?: string;
    isVideoTranscode: boolean;
}) {
    if (!params.isVideoTranscode) {
        return {
            isHw: false,
            transcodeHwRequested: false,
            transcodeHwDecoding: "",
            transcodeHwEncoding: "",
            transcodeHwFullPipeline: false,
            hwEngine: "",
            hwEngineLabel: "Direct Play",
            hwPowerBadge: "🟢 Direct Play (Zero Transcode Power)",
            efficiency: "idle" as const
        };
    }

    const isRequested = Boolean(
        params.transcodeHwRequested || 
        params.hwRequested || 
        params.transcodeHwDecoding || 
        params.transcodeHwEncoding || 
        params.videoDecoder || 
        params.videoEncoder
    );

    const rawDec = String(
        params.transcodeHwDecodingTitle || 
        params.transcodeHwDecoding || 
        params.videoDecoder || 
        ""
    ).trim();

    const rawEnc = String(
        params.transcodeHwEncodingTitle || 
        params.transcodeHwEncoding || 
        params.videoEncoder || 
        ""
    ).trim();

    const decLower = rawDec.toLowerCase();
    const encLower = rawEnc.toLowerCase();

    // Determine engine brand
    let engine = "NVENC";
    if (decLower.includes("qsv") || encLower.includes("qsv") || decLower.includes("quicksync") || encLower.includes("quicksync") || decLower.includes("intel") || encLower.includes("intel")) {
        engine = "Intel QuickSync";
    } else if (decLower.includes("vaapi") || encLower.includes("vaapi")) {
        engine = "VAAPI";
    } else if (decLower.includes("videotoolbox") || encLower.includes("videotoolbox") || decLower.includes("apple") || encLower.includes("apple")) {
        engine = "Apple VideoToolbox";
    } else if (decLower.includes("amf") || encLower.includes("amf") || decLower.includes("amd") || encLower.includes("amd")) {
        engine = "AMD AMF";
    } else if (decLower.includes("cuda") || encLower.includes("cuda") || decLower.includes("nvenc") || encLower.includes("nvenc") || decLower.includes("nvidia") || encLower.includes("nvidia")) {
        engine = "Nvidia NVENC";
    } else if (isRequested) {
        engine = "GPU Hardware";
    } else {
        return {
            isHw: false,
            transcodeHwRequested: false,
            transcodeHwDecoding: "",
            transcodeHwEncoding: "",
            transcodeHwFullPipeline: false,
            hwEngine: "CPU",
            hwEngineLabel: "CPU Software Transcode",
            hwPowerBadge: "🔥 High CPU Load / Power Consumption",
            efficiency: "cpu_heavy" as const
        };
    }

    const hasHwDec = Boolean(rawDec && rawDec !== "0" && decLower !== "cpu" && !decLower.includes("sw"));
    const hasHwEnc = Boolean(rawEnc && rawEnc !== "0" && encLower !== "cpu" && !encLower.includes("sw"));
    const isFullPipeline = Boolean(params.transcodeHwFullPipeline || (hasHwDec && hasHwEnc));

    const cleanDec = hasHwDec ? (rawDec.length < 15 ? rawDec.toUpperCase() : engine) : "CPU";
    const cleanEnc = hasHwEnc ? (rawEnc.length < 15 ? rawEnc.toUpperCase() : engine) : "CPU";

    let label = `${engine} HW Accel`;
    if (isFullPipeline) {
        label = `${engine} Full HW Pipeline`;
    } else if (hasHwEnc && !hasHwDec) {
        label = `${engine} HW Encode (CPU Decode)`;
    } else if (hasHwDec && !hasHwEnc) {
        label = `${engine} HW Decode (CPU Encode)`;
    }

    return {
        isHw: true,
        transcodeHwRequested: true,
        transcodeHwDecoding: cleanDec,
        transcodeHwEncoding: cleanEnc,
        transcodeHwFullPipeline: isFullPipeline,
        hwEngine: engine,
        hwEngineLabel: label,
        hwPowerBadge: `🟢 ${engine} HW (Low CPU • Power Efficient)`,
        efficiency: isFullPipeline ? ("hw_high" as const) : ("hw_hybrid" as const)
    };
}

/**
 * Detects dynamic range & HDR formats from video stream metadata
 */
export function detectHdrFormat(videoStream?: any, media?: any): string | null {
    if (videoStream?.colorTrc === "bt709") return null;
    const dovi = Boolean(
        videoStream?.doviProfile || 
        videoStream?.doviTitle || 
        videoStream?.doviPresent || 
        (videoStream?.colorTrc !== "bt709" && (media?.videoProfile?.toLowerCase().includes("dovi") || media?.videoProfile?.toLowerCase().includes("dv")))
    );
    if (dovi) return "Dolby Vision";
    const trc = String(videoStream?.colorTrc || media?.colorTrc || "").toLowerCase();
    if (trc.includes("smpte2084") || trc.includes("hdr10") || trc.includes("hdr")) return "HDR10";
    if (trc.includes("arib-std-b67") || trc.includes("hlg")) return "HLG";
    const space = String(videoStream?.colorSpace || media?.colorSpace || "").toLowerCase();
    if (space.includes("bt2020")) return "HDR";
    return null;
}

/**
 * Extracts granular video, audio, timing, and connection telemetry from Plex or Tautulli active sessions
 */
export function extractStreamTelemetry(s: any) {
    let durMs = Number(s.duration || s.durationMs || s.duration_ms || 0);
    let viewMs = Number(s.viewOffset || s.viewOffsetMs || s.view_offset || s.view_offset_ms || 0);

    // If duration is provided in seconds (e.g. from Tautulli API get_activity), convert to milliseconds
    const isSeconds = s.view_offset !== undefined || (durMs > 0 && durMs < 86400 && s.viewOffset === undefined && !s.TranscodeSession && !s.Media);
    if (isSeconds && durMs > 0) {
        durMs = durMs * 1000;
        viewMs = viewMs * 1000;
    }

    const progressPercent = s.progressPercent !== undefined 
        ? Number(s.progressPercent) 
        : (durMs > 0 ? Math.min(100, Math.round((viewMs / durMs) * 100)) : 0);

    const remainingMs = Math.max(0, durMs - viewMs);
    const etaMs = remainingMs > 0 && durMs > 0 ? (Date.now() + remainingMs) : null;

    // Media & Video specs:
    // When Plex is transcoding or playing a multi-edition movie, Plex sets selected: true on the active Media item
    // or on Part[0].selected, and populates the active Stream list inside Part[0].
    const mediaList = Array.isArray(s.Media) ? s.Media : (s.Media ? [s.Media] : []);
    const mediaObj = mediaList.find((m: any) => 
        m.selected === true || m.selected === 1 || m.selected === "1" ||
        m.Part?.some((p: any) => p.selected === true || p.selected === 1 || p.selected === "1" || (p.Stream && p.Stream.length > 0))
    ) || mediaList[0] || s.media || {};
    const partObj = (mediaObj.Part && mediaObj.Part[0]) || {};
    const streamsList: any[] = Array.isArray(partObj.Stream) ? partObj.Stream : (Array.isArray(s.Stream) ? s.Stream : []);

    const videoStream = streamsList.find((st: any) => st.streamType === 1 || st.streamType === "1" || st.codec_type === "video") || {};
    const audioStream = streamsList.find((st: any) => (st.streamType === 2 || st.streamType === "2" || st.codec_type === "audio") && (st.selected || st.selected === 1 || st.selected === "1")) || streamsList.find((st: any) => st.streamType === 2 || st.streamType === "2") || {};
    const subtitleStream = streamsList.find((st: any) => (st.streamType === 3 || st.streamType === "3" || st.codec_type === "subtitle") && (st.selected || st.selected === 1 || st.selected === "1"));

    // Video Decision: is it transcoding video?
    const rawVideoDecision = (s.videoDecision || s.video_decision || s.TranscodeSession?.videoDecision || videoStream.decision || "").toLowerCase();
    const isVideoTranscode = rawVideoDecision === "transcode" || 
        (!rawVideoDecision && Boolean(s.TranscodeSession && s.TranscodeSession?.videoDecision !== "copy"));

    // Source Resolution:
    // When videoStream.displayTitle or extendedDisplayTitle is present (e.g. "1080p (HEVC Main)"),
    // this is Plex's canonical source stream indicator displayed on the official Plex dashboard!
    const displayTitleRes = videoStream.displayTitle || videoStream.extendedDisplayTitle || "";
    const titleRes = resolveResolution(displayTitleRes);
    const rawSrcRes = titleRes 
        ? displayTitleRes 
        : (mediaObj.videoResolution || s.video_resolution || s.videoResolution || videoStream.videoResolution || "");
    const srcHeight = (titleRes ? videoStream.height : undefined) || mediaObj.height || s.height || videoStream.height;
    const srcWidth = (titleRes ? videoStream.width : undefined) || mediaObj.width || s.width || videoStream.width;

    const sourceResolution = titleRes || resolveResolution(rawSrcRes, srcHeight, srcWidth) || formatResolution(rawSrcRes) || "1080p";

    // Target Stream Resolution (What is it converting to?)
    const ts = s.TranscodeSession;
    const transcodeHeight = ts?.height || s.transcode_height || s.stream_height || (isVideoTranscode && mediaObj.height && mediaObj.height !== srcHeight ? mediaObj.height : undefined);
    const transcodeWidth = ts?.width || s.transcode_width || s.stream_width || (isVideoTranscode && mediaObj.width && mediaObj.width !== srcWidth ? mediaObj.width : undefined);
    const rawTargetRes = ts?.videoResolution || ts?.targetVideoResolution || s.stream_video_resolution || (isVideoTranscode && mediaObj.videoResolution && mediaObj.videoResolution !== sourceResolution ? mediaObj.videoResolution : undefined);

    let streamResolution = sourceResolution;
    if (isVideoTranscode) {
        const resolvedTarget = resolveResolution(rawTargetRes, transcodeHeight, transcodeWidth);
        if (resolvedTarget) {
            streamResolution = resolvedTarget;
        } else {
            // Stream bitrate downscaling fallback estimation
            const br = Number(s.streamBitrate || s.stream_bitrate || s.bitrate || (mediaObj.bitrate ? Number(mediaObj.bitrate) : 0));
            if (br > 0 && br <= 4500 && (sourceResolution === "4K UHD" || sourceResolution === "1080p")) {
                streamResolution = "720p";
            } else if (br > 4500 && br <= 12000 && sourceResolution === "4K UHD") {
                streamResolution = "1080p";
            }
        }
    }

    // HDR & Tone Mapping
    const hdrFormat = detectHdrFormat(videoStream, mediaObj) || (s.video_dynamic_range || null);
    const isToneMapping = Boolean(
        (hdrFormat && isVideoTranscode) || 
        ts?.transcodeHwToneMapping || 
        ts?.toneMapping || 
        s.transcode_hw_tone_mapping
    );

    // Video Codecs
    const videoCodec = (ts?.sourceVideoCodec || s.videoCodec || s.video_codec || mediaObj.videoCodec || videoStream.codec || "H264").toUpperCase();
    const streamVideoCodec = (ts?.videoCodec || (isVideoTranscode ? (videoStream.codec || ts?.videoCodec) : null) || s.stream_video_codec || videoCodec).toUpperCase();

    // Audio Codecs & Channels
    const titleChannelMatch = String(audioStream.displayTitle || audioStream.extendedDisplayTitle || "").match(/\b(7\.1|5\.1|stereo|mono)\b/i);
    const sourceAudioCodec = (ts?.sourceAudioCodec || audioStream.codec || mediaObj.audioCodec || s.audio_codec || s.audioCodec || "AAC").toUpperCase();
    const rawSrcChannels = titleChannelMatch ? titleChannelMatch[1] : (audioStream.channels || mediaObj.audioChannels || s.audio_channels || s.audioChannels);
    const sourceAudioChannels = formatAudioChannels(rawSrcChannels);

    const streamAudioCodec = (ts?.audioCodec || s.stream_audio_codec || sourceAudioCodec).toUpperCase();
    const rawStreamChannels = ts?.audioChannels || s.stream_audio_channels || audioStream.channels || rawSrcChannels;
    const streamAudioChannels = formatAudioChannels(rawStreamChannels);

    // Subtitles
    const hasSubtitle = Boolean(subtitleStream || s.subtitles === 1 || s.subtitles === "1" || s.subtitle_codec);
    const subtitleLanguage = subtitleStream?.language || subtitleStream?.languageCode || s.subtitle_language || null;
    const subtitleCodec = (subtitleStream?.codec || s.subtitle_codec || "").toUpperCase();
    const isSubtitleBurnIn = Boolean(
        ts?.subtitleDecision === "burn" || 
        s.subtitle_decision === "burn" || 
        subtitleStream?.burn === 1 ||
        subtitleStream?.burn === "1" ||
        subtitleStream?.burn === true
    );

    // Transcode Buffer Progress & Buffer Ahead
    const transcodeProgress = ts?.progress !== undefined && ts?.progress !== null && !isNaN(Number(ts.progress))
        ? Math.round(Number(ts.progress))
        : (s.transcode_progress !== undefined ? Math.round(Number(s.transcode_progress)) : null);

    let transcodeBufferAheadSec: number | null = null;
    let transcodeBufferAheadFormatted: string | null = null;
    if (ts?.maxOffsetAvailable !== undefined && viewMs > 0) {
        const viewSec = Math.round(viewMs / 1000);
        const maxOffsetSec = Math.round(Number(ts.maxOffsetAvailable));
        if (maxOffsetSec > viewSec) {
            transcodeBufferAheadSec = maxOffsetSec - viewSec;
            if (transcodeBufferAheadSec >= 60) {
                const m = Math.floor(transcodeBufferAheadSec / 60);
                const sec = transcodeBufferAheadSec % 60;
                transcodeBufferAheadFormatted = `+${m}m ${String(sec).padStart(2, "0")}s buffer`;
            } else {
                transcodeBufferAheadFormatted = `+${transcodeBufferAheadSec}s buffer`;
            }
        }
    }

    // Transcode Speed & Throttle Evaluation
    const rawSpeed = ts?.speed !== undefined ? ts.speed : s.transcode_speed;
    const speedNum = rawSpeed !== undefined && rawSpeed !== null && !isNaN(Number(rawSpeed)) ? Number(rawSpeed) : null;
    const transcodeSpeed = speedNum !== null ? `${speedNum.toFixed(1)}x` : null;

    // Check throttled flag from Plex (ts.throttled) or Tautulli (s.transcode_throttled)
    const isThrottledVal = (val: any) => val === true || val === 1 || val === "1" || val === "true";
    let transcodeThrottled = isThrottledVal(ts?.throttled) || isThrottledVal(s.transcode_throttled);

    // If Plex has transcode buffer lead time ahead (>= 10s) and speed drops below 1.0x (e.g. 0.0x), Plex has throttled transcode to save power
    if (!transcodeThrottled && transcodeBufferAheadSec !== null && transcodeBufferAheadSec >= 10 && speedNum !== null && speedNum < 1.0) {
        transcodeThrottled = true;
    }

    // Transcode speed health:
    // If throttled, Plex intentionally puts transcode process to sleep to save power -> 100% HEALTHY (NOT an error!).
    // If not throttled, >= 1.0x is healthy.
    const transcodeSpeedHealthy = transcodeThrottled
        ? true
        : (speedNum !== null ? speedNum >= 1.0 : true);

    // Hardware Acceleration & Power Metrics
    const hwInfo = resolveHwTranscodeInfo({
        transcodeHwRequested: !!(ts?.transcodeHwRequested || s.transcode_hw_requested),
        hwRequested: !!(ts?.hwRequested),
        transcodeHwDecoding: ts?.transcodeHwDecoding || s.transcode_hw_decoding,
        transcodeHwEncoding: ts?.transcodeHwEncoding || s.transcode_hw_encoding,
        transcodeHwDecodingTitle: ts?.transcodeHwDecodingTitle || s.transcode_hw_decoding_title,
        transcodeHwEncodingTitle: ts?.transcodeHwEncodingTitle || s.transcode_hw_encoding_title,
        transcodeHwFullPipeline: !!(ts?.transcodeHwFullPipeline || s.transcode_hw_full_pipeline),
        videoDecoder: ts?.videoDecoder,
        videoEncoder: ts?.videoEncoder,
        isVideoTranscode
    });

    // Network / Tunneling
    const isRelayed = Boolean(s.Player?.relayed || s.relayed === 1 || s.relayed === "1" || s.relayed === true);
    const isSecure = Boolean(s.Player?.secure !== false && s.secure !== 0 && s.secure !== "0");
    const cleanIp = normalizeIp(s.ipAddress || s.Player?.address || s.ip_address || "");
    const isLocal = Boolean(s.Player?.local || isPrivateOrLocalIp(cleanIp));

    let connectionMode: "relay" | "lan" | "wan" = "wan";
    let connectionLabel = "🌐 Direct WAN";
    if (isRelayed) {
        connectionMode = "relay";
        connectionLabel = "⚠️ Plex Relay (Throttled)";
    } else if (isLocal) {
        connectionMode = "lan";
        connectionLabel = "⚡ Direct LAN";
    }

    return {
        durationMs: durMs,
        viewOffsetMs: viewMs,
        progressPercent,
        viewOffsetFormatted: formatDurationMs(viewMs),
        durationFormatted: formatDurationMs(durMs),
        remainingFormatted: formatDurationMs(remainingMs),
        etaTime: etaMs ? formatEtaTimestamp(etaMs) : null,
        sourceResolution,
        streamResolution,
        isDownscaling: isVideoTranscode && sourceResolution !== streamResolution,
        hdrFormat,
        isToneMapping,
        videoCodec,
        streamVideoCodec,
        sourceAudioCodec,
        sourceAudioChannels,
        streamAudioCodec,
        streamAudioChannels,
        hasSubtitle,
        subtitleLanguage,
        subtitleCodec,
        isSubtitleBurnIn,
        transcodeSpeed,
        transcodeSpeedNum: speedNum,
        transcodeSpeedHealthy,
        transcodeThrottled,
        transcodeProgress,
        transcodeBufferAheadSec,
        transcodeBufferAheadFormatted,
        isHw: hwInfo.isHw,
        transcodeHwRequested: hwInfo.transcodeHwRequested,
        transcodeHwDecoding: hwInfo.transcodeHwDecoding,
        transcodeHwEncoding: hwInfo.transcodeHwEncoding,
        transcodeHwFullPipeline: hwInfo.transcodeHwFullPipeline,
        hwEngine: hwInfo.hwEngine,
        hwEngineLabel: hwInfo.hwEngineLabel,
        hwPowerBadge: hwInfo.hwPowerBadge,
        hwEfficiency: hwInfo.efficiency,
        isRelayed,
        isSecure,
        isLocal,
        connectionMode,
        connectionLabel,
        userThumb: s.User?.thumb || s.user_thumb || null
    };
}

/**
 * Evaluates active stream sessions to detect concurrent connections and credential/password sharing
 */
export function analyzeActiveSessionsForSharing(
    sessions: any[],
    defaultMaxStreams: number = 3
): Map<string, UserStreamAnalysis> {
    const userMap = new Map<string, any[]>();

    for (const s of sessions) {
        const rawUser = (s.user || s.User?.title || s.User?.username || s.username || "Plex User").trim();
        const userKey = rawUser.toLowerCase();
        if (!userMap.has(userKey)) {
            userMap.set(userKey, []);
        }
        userMap.get(userKey)!.push(s);
    }

    const analyses = new Map<string, UserStreamAnalysis>();

    for (const [userKey, userSessions] of userMap.entries()) {
        const first = userSessions[0];
        const username = first.user || first.User?.title || userKey;
        const email = first.email || first.User?.email || "";

        const allIps = new Set<string>();
        const publicIps = new Set<string>();
        const devices = new Set<string>();
        const platforms = new Set<string>();
        const servers = new Set<string>();
        let hasFixedHomeDevice = false;
        const tvPublicIps = new Set<string>();

        for (const s of userSessions) {
            const rawIp = s.ipAddress || s.Player?.address || s.ip_address || "";
            const cleanIp = normalizeIp(rawIp);
            if (cleanIp) {
                allIps.add(cleanIp);
                if (!isPrivateOrLocalIp(cleanIp)) {
                    publicIps.add(cleanIp);
                }
            }

            const isTv = isFixedHomeDevice(s.device || s.Player?.device, s.platform || s.Player?.platform, s.player || s.Player?.title);
            if (isTv) {
                hasFixedHomeDevice = true;
                if (cleanIp && !isPrivateOrLocalIp(cleanIp)) {
                    tvPublicIps.add(cleanIp);
                }
            }

            const dev = s.device || s.Player?.device || s.Player?.platform || "";
            if (dev) devices.add(dev);

            const plat = s.player || s.Player?.title || "";
            if (plat) platforms.add(plat);

            const srv = s.serverName || "";
            if (srv) servers.add(srv);
        }

        const distinctIpsList = Array.from(allIps);
        const distinctPublicIpsList = Array.from(publicIps);
        const streamCount = userSessions.length;
        const isDualTvSharing = tvPublicIps.size >= 2;

        // Multi-IP sharing detection: streaming from >= 2 distinct public IP addresses at the exact same time
        const isMultiIp = distinctPublicIpsList.length >= 2;
        const isExcessiveConnections = streamCount > defaultMaxStreams;
        const isSharingSuspected = isMultiIp || (streamCount >= 4 && distinctIpsList.length >= 2);

        let sharingReason: string | undefined = undefined;
        if (isMultiIp) {
            sharingReason = `Simultaneous playback from ${distinctPublicIpsList.length} distinct public IP addresses (${distinctPublicIpsList.join(", ")})`;
        } else if (isExcessiveConnections) {
            sharingReason = `User exceeds limit with ${streamCount} simultaneous active streams (limit: ${defaultMaxStreams})`;
        }

        analyses.set(userKey, {
            username,
            email,
            activeSessionsCount: streamCount,
            sessions: userSessions,
            distinctIps: distinctIpsList,
            distinctPublicIps: distinctPublicIpsList,
            devices: Array.from(devices),
            platforms: Array.from(platforms),
            servers: Array.from(servers),
            isMultiIp,
            isExcessiveConnections,
            isSharingSuspected,
            sharingReason,
            isDualTvSharing,
            hasFixedHomeDevice
        });
    }

    return analyses;
}

/**
 * Comprehensive account sharing intelligence:
 * Pinpoints Primary Home IP, detects vacation / travel, second home / cabin usage,
 * mobile roaming, and flags simultaneous living room TV playback across distinct public IPs.
 */
export function analyzeUserAccountSharing(userSessions: any[]): {
    sharingAssessment: UserSharingAssessment;
    detectedOverlaps: DetectedOverlapSession[];
} {
    // 1. Separate private LAN vs public WAN sessions
    const publicSessions: any[] = [];
    const fixedTvDevices = new Set<string>();
    const mobileDevices = new Set<string>();

    for (const s of userSessions) {
        const devName = s.device || s.player || s.platform || "Client";
        const isTv = isFixedHomeDevice(s.device, s.platform, s.player);
        const isMobile = isMobileRoamingDevice(s.device, s.platform, s.player);

        if (isTv) fixedTvDevices.add(devName);
        if (isMobile) mobileDevices.add(devName);

        const ip = normalizeIp(s.ipAddress);
        if (ip && !isPrivateOrLocalIp(ip)) {
            publicSessions.push(s);
        }
    }

    // Default assessment for pure LAN or empty history
    if (publicSessions.length === 0) {
        return {
            sharingAssessment: {
                risk: "CLEAN_SINGLE_HOME",
                label: "🟢 Single Household (LAN)",
                badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
                primaryHomeIp: "LAN / Local Network",
                explanation: "All streaming activity originates exclusively from the local private home network. No public remote connections recorded.",
                fixedTvOverlapCount: 0,
                concurrentOverlapCount: 0,
                distinctPublicIpsCount: 0,
                fixedTvDevices: Array.from(fixedTvDevices),
                mobileDevices: Array.from(mobileDevices)
            },
            detectedOverlaps: []
        };
    }

    // 2. Aggregate per-IP telemetry
    const ipMap = new Map<string, {
        ip: string;
        plays: number;
        durationSeconds: number;
        tvPlays: number;
        mobilePlays: number;
        firstSeen: Date;
        lastSeen: Date;
        devices: Set<string>;
    }>();

    for (const s of publicSessions) {
        const ip = normalizeIp(s.ipAddress);
        if (!ipMap.has(ip)) {
            ipMap.set(ip, {
                ip,
                plays: 0,
                durationSeconds: 0,
                tvPlays: 0,
                mobilePlays: 0,
                firstSeen: new Date(s.watchedAt),
                lastSeen: new Date(s.watchedAt),
                devices: new Set()
            });
        }
        const entry = ipMap.get(ip)!;
        entry.plays++;
        entry.durationSeconds += Math.round((s.durationMs || 0) / 1000);
        const watched = new Date(s.watchedAt);
        if (watched < entry.firstSeen) entry.firstSeen = watched;
        if (watched > entry.lastSeen) entry.lastSeen = watched;

        const isTv = isFixedHomeDevice(s.device, s.platform, s.player);
        const isMobile = isMobileRoamingDevice(s.device, s.platform, s.player);
        if (isTv) entry.tvPlays++;
        if (isMobile) entry.mobilePlays++;
        if (s.device || s.player) entry.devices.add(s.device || s.player);
    }

    const ipList = Array.from(ipMap.values());
    // Primary Home IP: IP with highest TV plays, or highest overall plays
    ipList.sort((a, b) => b.tvPlays !== a.tvPlays ? b.tvPlays - a.tvPlays : b.plays - a.plays);
    const primaryHomeIp = ipList[0]?.ip || "Unknown IP";

    // 3. Scan for concurrent overlapping playback across distinct public IPs
    const detectedOverlaps: DetectedOverlapSession[] = [];
    const seenOverlapPairs = new Set<string>();
    let fixedTvOverlapCount = 0;

    // Sort chronologically for pairwise interval checking
    const sortedPublic = [...publicSessions].sort((a, b) => new Date(a.watchedAt).getTime() - new Date(b.watchedAt).getTime());

    for (let i = 0; i < sortedPublic.length; i++) {
        const s1 = sortedPublic[i];
        const ip1 = normalizeIp(s1.ipAddress);
        const start1 = new Date(s1.watchedAt).getTime();
        const dur1 = Math.max((s1.durationMs || 0), 15 * 60 * 1000); // minimum 15 mins assumed
        const end1 = s1.stoppedAt ? new Date(s1.stoppedAt).getTime() : start1 + dur1;

        for (let j = i + 1; j < sortedPublic.length; j++) {
            const s2 = sortedPublic[j];
            const start2 = new Date(s2.watchedAt).getTime();
            // Since array is sorted by start time, if start2 >= end1, no further sessions can overlap with s1
            if (start2 >= end1) break;

            const ip2 = normalizeIp(s2.ipAddress);
            if (ip1 !== ip2) {
                const dur2 = Math.max((s2.durationMs || 0), 15 * 60 * 1000);
                const end2 = s2.stoppedAt ? new Date(s2.stoppedAt).getTime() : start2 + dur2;

                if (start1 < end2 && start2 < end1) {
                    const pairKey = [s1.id || `${start1}_${ip1}`, s2.id || `${start2}_${ip2}`].sort().join(":::");
                    if (!seenOverlapPairs.has(pairKey)) {
                        seenOverlapPairs.add(pairKey);
                        const isTv1 = isFixedHomeDevice(s1.device, s1.platform, s1.player);
                        const isTv2 = isFixedHomeDevice(s2.device, s2.platform, s2.player);
                        const isDualTv = isTv1 && isTv2;

                        if (isDualTv) fixedTvOverlapCount++;

                        detectedOverlaps.push({
                            timestamp: new Date(Math.max(start1, start2)),
                            durationMinutes: Math.round(Math.min(dur1, dur2) / 60000),
                            isDualTv,
                            session1: {
                                title: s1.grandparentTitle ? `${s1.grandparentTitle} - ${s1.title}` : s1.title,
                                device: s1.device || s1.player || "Client",
                                platform: s1.platform || "Platform",
                                ipAddress: ip1,
                                isFixedTv: isTv1
                            },
                            session2: {
                                title: s2.grandparentTitle ? `${s2.grandparentTitle} - ${s2.title}` : s2.title,
                                device: s2.device || s2.player || "Client",
                                platform: s2.platform || "Platform",
                                ipAddress: ip2,
                                isFixedTv: isTv2
                            }
                        });
                    }
                }
            }
        }
    }

    // 4. Secondary Home & Vacation Heuristics for remaining IPs
    let secondaryHomeIp: string | undefined = undefined;
    let hasVacation = false;
    let hasSecondHome = false;
    let hasMobileRoamingOnly = false;

    const nonHomeIps = ipList.filter(it => it.ip !== primaryHomeIp);

    if (nonHomeIps.length > 0 && fixedTvOverlapCount === 0) {
        // Find if there is an IP with TV usage
        const tvNonHome = nonHomeIps.filter(it => it.tvPlays > 0);
        if (tvNonHome.length > 0) {
            const topSecond = tvNonHome[0];
            const spanDays = (topSecond.lastSeen.getTime() - topSecond.firstSeen.getTime()) / (1000 * 60 * 60 * 24);
            if (spanDays <= 14) {
                hasVacation = true;
                secondaryHomeIp = topSecond.ip;
            } else {
                hasSecondHome = true;
                secondaryHomeIp = topSecond.ip;
            }
        } else {
            // All non-home IPs have 0 TV plays (all mobile phones, laptops, or cellular)
            hasMobileRoamingOnly = true;
        }
    }

    // 5. Classification Rules
    let risk: AccountSharingRisk;
    let label: string;
    let badgeColor: string;
    let explanation: string;

    if (fixedTvOverlapCount >= 1) {
        risk = "HIGH_SHARING_RISK";
        label = "🚨 Suspected Sharing (Dual TVs)";
        badgeColor = "bg-red-500/20 text-red-300 border-red-500/40";
        explanation = `Simultaneous playback detected on 2 physical living room TVs across different public IPs (${fixedTvOverlapCount} concurrent TV overlaps). This strongly indicates account sharing between separate households.`;
    } else if (detectedOverlaps.length >= 2 && ipList.length >= 2) {
        risk = "MODERATE_SHARING_RISK";
        label = "⚠️ Multi-Location Activity";
        badgeColor = "bg-amber-500/20 text-amber-300 border-amber-500/40";
        explanation = `Detected ${detectedOverlaps.length} concurrent playback overlaps across ${ipList.length} distinct public IPs. Mixed devices observed.`;
    } else if (hasSecondHome) {
        risk = "SECOND_HOME";
        label = "🏡 Second Home / Cabin";
        badgeColor = "bg-cyan-500/20 text-cyan-300 border-cyan-500/40";
        explanation = `Detected recurring TV streaming at secondary location (${secondaryHomeIp}) with zero concurrent overlaps. Consistent with a weekend cabin or secondary residence.`;
    } else if (hasVacation) {
        risk = "VACATION_TRAVEL";
        label = "🏖️ Vacation / Travel";
        badgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
        explanation = `Detected temporary away streaming (span ≤ 14 days) at ${secondaryHomeIp} with zero concurrent streaming at home base (${primaryHomeIp}). Consistent with travel or vacation.`;
    } else if (hasMobileRoamingOnly || ipList.length > 1) {
        risk = "MOBILE_ROAMING";
        label = "📱 Mobile / Cellular Roaming";
        badgeColor = "bg-indigo-500/20 text-indigo-300 border-indigo-500/40";
        explanation = `Remote IPs are strictly mobile phones, tablets, or cellular networks. Living room TVs remain anchored to home base (${primaryHomeIp}).`;
    } else {
        risk = "CLEAN_SINGLE_HOME";
        label = "🟢 Single Household";
        badgeColor = "bg-emerald-500/20 text-emerald-300 border-emerald-500/40";
        explanation = `Normal streaming within a single household. All playback originates from home base (${primaryHomeIp}) with no suspicious concurrency.`;
    }

    return {
        sharingAssessment: {
            risk,
            label,
            badgeColor,
            primaryHomeIp,
            secondaryHomeIp,
            explanation,
            fixedTvOverlapCount,
            concurrentOverlapCount: detectedOverlaps.length,
            distinctPublicIpsCount: ipList.length,
            fixedTvDevices: Array.from(fixedTvDevices),
            mobileDevices: Array.from(mobileDevices)
        },
        detectedOverlaps: detectedOverlaps.slice(0, 50)
    };
}

/**
 * Records active streaming sessions into WatchHistory and performs security auditing
 */
export async function recordActivePlexSessions(
    sessions: any[]
): Promise<{ success: boolean; recorded: number; recordedCount: number; sharingAlerts: number; analyses: UserStreamAnalysis[] }> {
    if (!sessions || sessions.length === 0) {
        return { success: true, recorded: 0, recordedCount: 0, sharingAlerts: 0, analyses: [] };
    }

    try {
        const settings = await prisma.settings.findUnique({ where: { id: "global" } }).catch(() => null);
        const defaultMaxStreams = settings?.maxConcurrentStreamsPerUser || 3;
        const detectSharing = settings?.detectPasswordSharing ?? true;

        const analysesMap = analyzeActiveSessionsForSharing(sessions, defaultMaxStreams);
        const analysesList = Array.from(analysesMap.values());

        let recordedCount = 0;
        let alertCount = 0;

        for (const s of sessions) {
            const rawUser = (s.user || s.User?.title || s.User?.username || s.username || "Plex User").trim();
            const userKey = rawUser.toLowerCase();
            const analysis = analysesMap.get(userKey);

            const isSharingAlert = detectSharing && Boolean(analysis?.isSharingSuspected);
            const sharingAlertNote = isSharingAlert ? analysis?.sharingReason : null;

            if (isSharingAlert) {
                alertCount++;
            }

            const sessionKey = String(s.sessionKey || s.ratingKey || "");
            const ratingKey = String(s.ratingKey || "");
            const serverName = s.serverName || "Plex";
            const serverId = s.serverId || s.instanceId || null;
            const title = s.title || "Unknown Media";
            const grandparentTitle = s.grandparentTitle || null;
            const parentTitle = s.parentTitle || null;
            const seasonNum = s.seasonNum !== undefined ? Number(s.seasonNum) : null;
            const episodeNum = s.episodeNum !== undefined ? Number(s.episodeNum) : null;
            const mediaType = s.mediaType || (grandparentTitle ? "episode" : "movie");
            const year = s.year ? parseInt(String(s.year), 10) || null : null;
            const thumb = s.thumb || null;
            const player = s.player || null;
            const platform = s.device || null;
            const device = s.device || null;
            const rawIp = s.ipAddress || s.Player?.address || null;
            const ipAddress = normalizeIp(rawIp);
            const location = isPrivateOrLocalIp(ipAddress) ? "LAN" : "Remote";
            const videoDecision = s.videoDecision || "direct play";
            const audioDecision = s.audioDecision || "direct play";
            const transcodeHw = Boolean(s.transcodeHwRequested || s.transcodeHwEncoding || s.transcodeHwDecoding);
            const streamBitrate = s.streamBitrate ? Number(s.streamBitrate) : null;
            const durationMs = s.duration ? Math.round(Number(s.duration)) : (s.durationMs ? Math.round(Number(s.durationMs)) : null);
            const viewOffsetMs = s.viewOffset ? Math.round(Number(s.viewOffset)) : (s.viewOffsetMs ? Math.round(Number(s.viewOffsetMs)) : null);
            let progressPercent = s.progressPercent !== undefined ? Number(s.progressPercent) : 0;
            if (!progressPercent && viewOffsetMs && durationMs && durationMs > 0) {
                progressPercent = Math.min(100, Math.round((viewOffsetMs / durationMs) * 100));
            }
            const state = s.state || "playing";
            const isCompleted = progressPercent >= 90;

            // Resolve Portalarr user account if exists
            let userId: string | null = null;
            try {
                const matchedUser = await prisma.user.findFirst({
                    where: {
                        OR: [
                            { username: { equals: rawUser } },
                            { plexUsername: { equals: rawUser } },
                            { email: { equals: s.email || "" } }
                        ]
                    },
                    select: { id: true, sharingAlertCount: true }
                });
                if (matchedUser) {
                    userId = matchedUser.id;
                    if (isSharingAlert) {
                        await prisma.user.update({
                            where: { id: matchedUser.id },
                            data: {
                                sharingAlertCount: { increment: 1 },
                                lastSharingAlertAt: new Date()
                            }
                        }).catch(() => {});
                    }
                }
            } catch {}

            // Find recent existing stream record for this session key/user to update progress
            const fourHoursAgo = new Date(Date.now() - 4 * 60 * 60 * 1000);
            const existingRecord = await prisma.watchHistory.findFirst({
                where: {
                    user: rawUser,
                    serverName: serverName,
                    ...(sessionKey ? { sessionKey } : { title }),
                    watchedAt: { gte: fourHoursAgo }
                },
                orderBy: { watchedAt: "desc" }
            }).catch(() => null);

            if (existingRecord) {
                await prisma.watchHistory.update({
                    where: { id: existingRecord.id },
                    data: {
                        progressPercent: Math.max(existingRecord.progressPercent, progressPercent),
                        viewOffsetMs: viewOffsetMs || existingRecord.viewOffsetMs,
                        durationMs: durationMs || existingRecord.durationMs,
                        state: isCompleted ? "completed" : state,
                        stoppedAt: new Date(),
                        completed: existingRecord.completed || isCompleted,
                        isSharingAlert: existingRecord.isSharingAlert || isSharingAlert,
                        sharingAlertNote: sharingAlertNote || existingRecord.sharingAlertNote,
                        ipAddress: ipAddress || existingRecord.ipAddress
                    }
                }).catch(() => {});
            } else {
                await prisma.watchHistory.create({
                    data: {
                        sessionKey: sessionKey || undefined,
                        ratingKey: ratingKey || undefined,
                        serverName,
                        serverId,
                        user: rawUser,
                        userEmail: s.email || undefined,
                        userId,
                        title,
                        grandparentTitle,
                        parentTitle,
                        seasonNum,
                        episodeNum,
                        mediaType,
                        year,
                        thumb,
                        player,
                        platform,
                        device,
                        ipAddress,
                        location,
                        videoDecision,
                        audioDecision,
                        transcodeHw,
                        streamBitrate,
                        viewOffsetMs: viewOffsetMs || 0,
                        durationMs: durationMs || 0,
                        progressPercent,
                        state: isCompleted ? "completed" : state,
                        watchedAt: new Date(),
                        stoppedAt: new Date(),
                        completed: isCompleted,
                        isSharingAlert,
                        sharingAlertNote
                    }
                }).catch(() => {});
            }

            recordedCount++;
        }

        // Log security warnings for sharing events
        for (const a of analysesList) {
            if (a.isSharingSuspected) {
                logger.addLog(
                    "WARN",
                    "SECURITY",
                    `🚨 [CREDENTIAL-SHARING-ALERT] User "${a.username}" streaming concurrently across ${a.distinctPublicIps.length} distinct public IP addresses: [${a.distinctPublicIps.join(", ")}]. Devices: ${a.devices.join(", ")}.`
                );
            }
        }

        return { success: true, recorded: recordedCount, recordedCount, sharingAlerts: alertCount, analyses: analysesList };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error recording active streams:", err.message || err);
        return { success: false, recorded: 0, recordedCount: 0, sharingAlerts: 0, analyses: [] };
    }
}

/**
 * Ensures any watch history thumbnail URL is safely proxied through /api/media/image
 * to eliminate mixed content warnings and LAN IP unreachability in client browsers.
 */
export function formatWatchHistoryThumb(item: any): string | null {
    if (!item) return null;
    let rawThumb = item.thumb || "";
    const title = item.grandparentTitle || item.title || "";
    const year = item.year ? String(item.year) : "";
    const type = item.mediaType || (item.grandparentTitle ? "episode" : "movie");

    if (rawThumb && rawThumb.startsWith("/api/media/image")) {
        return rawThumb;
    }

    if (rawThumb && (rawThumb.startsWith("http://") || rawThumb.startsWith("https://"))) {
        try {
            const parsed = new URL(rawThumb);
            if (parsed.searchParams.has("img")) {
                rawThumb = parsed.searchParams.get("img") || "";
            } else if (parsed.searchParams.has("url")) {
                rawThumb = parsed.searchParams.get("url") || "";
            } else if (parsed.pathname.includes("/library/metadata/")) {
                rawThumb = parsed.pathname;
            }
        } catch (e) {}
    }

    if (rawThumb && rawThumb.includes("pms_image_proxy")) {
        try {
            const dummyUrl = new URL(rawThumb.startsWith("http") ? rawThumb : `http://localhost/${rawThumb.replace(/^\/+/, "")}`);
            const nested = dummyUrl.searchParams.get("img") || dummyUrl.searchParams.get("url");
            if (nested) rawThumb = nested;
        } catch (e) {}
    }

    if (rawThumb || title) {
        return `/api/media/image?serverId=${encodeURIComponent(item.serverId || "")}&serverName=${encodeURIComponent(item.serverName || "")}&thumb=${encodeURIComponent(rawThumb)}&title=${encodeURIComponent(title)}&year=${encodeURIComponent(year)}&type=${encodeURIComponent(type)}`;
    }
    return null;
}

/**
 * Retrieves paginated watch history with statistical rollups
 */
export async function getWatchHistory(options?: WatchHistoryQueryOptions) {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 25));
    const skip = (page - 1) * limit;

    const where: any = {};

    if (options?.user) {
        where.user = { contains: options.user };
    }
    if (options?.mediaType && options.mediaType !== "all") {
        where.mediaType = options.mediaType;
    }
    if (options?.isSharingAlert !== undefined) {
        where.isSharingAlert = options.isSharingAlert;
    }
    if (options?.search) {
        const q = options.search.trim();
        where.OR = [
            { title: { contains: q } },
            { grandparentTitle: { contains: q } },
            { user: { contains: q } },
            { player: { contains: q } },
            { ipAddress: { contains: q } }
        ];
    }

    try {
        const [total, items, totalAlerts, completedCount] = await Promise.all([
            prisma.watchHistory.count({ where }),
            prisma.watchHistory.findMany({
                where,
                orderBy: { watchedAt: "desc" },
                skip,
                take: limit
            }),
            prisma.watchHistory.count({ where: { isSharingAlert: true } }),
            prisma.watchHistory.count({ where: { completed: true } })
        ]);

        const formattedItems = items.map(it => ({
            ...it,
            thumb: formatWatchHistoryThumb(it)
        }));

        return {
            items: formattedItems,
            total,
            sharingAlertsCount: totalAlerts,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            stats: {
                totalWatchSessions: total,
                completedMediaCount: completedCount,
                totalSharingAlerts: totalAlerts
            }
        };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error fetching watch history:", err.message || err);
        return {
            items: [],
            total: 0,
            sharingAlertsCount: 0,
            pagination: { page: 1, limit, total: 0, totalPages: 0 },
            stats: { totalWatchSessions: 0, completedMediaCount: 0, totalSharingAlerts: 0 }
        };
    }
}

/**
 * Retrieves per-user connection and credential sharing security insights
 */
export async function getConnectionSecurityInsights() {
    try {
        const [recentAlerts, usersWithAlerts] = await Promise.all([
            prisma.watchHistory.findMany({
                where: { isSharingAlert: true },
                orderBy: { watchedAt: "desc" },
                take: 10
            }),
            prisma.user.findMany({
                where: { sharingAlertCount: { gt: 0 } },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    sharingAlertCount: true,
                    lastSharingAlertAt: true,
                    maxConcurrentStreams: true
                },
                orderBy: { sharingAlertCount: "desc" }
            })
        ]);

        const formattedAlerts = recentAlerts.map(it => ({
            ...it,
            thumb: formatWatchHistoryThumb(it)
        }));

        return {
            usersWithAlerts,
            recentAlerts: formattedAlerts,
            recentFlaggedIncidents: formattedAlerts
        };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error fetching security insights:", err.message || err);
        return {
            usersWithAlerts: [],
            recentAlerts: [],
            recentFlaggedIncidents: []
        };
    }
}

/**
 * Aggregates all watch history into per-user telemetry profiles across all servers
 */
export async function getUserStreamProfiles() {
    try {
        const records = await prisma.watchHistory.findMany({
            orderBy: { watchedAt: "desc" },
            take: 2000
        });

        const userMap = new Map<string, {
            user: string;
            totalPlays: number;
            completedCount: number;
            totalWatchSeconds: number;
            directPlayCount: number;
            transcodeCount: number;
            servers: Set<string>;
            platforms: Set<string>;
            devices: Set<string>;
            ips: Set<string>;
            lastWatchedTitle: string;
            lastWatchedAt: Date;
            lastPlatform: string;
            lastIp: string;
            sharingAlerts: number;
            records: any[];
        }>();

        for (const r of records) {
            const uKey = r.user.toLowerCase().trim();
            if (!userMap.has(uKey)) {
                userMap.set(uKey, {
                    user: r.user,
                    totalPlays: 0,
                    completedCount: 0,
                    totalWatchSeconds: 0,
                    directPlayCount: 0,
                    transcodeCount: 0,
                    servers: new Set(),
                    platforms: new Set(),
                    devices: new Set(),
                    ips: new Set(),
                    lastWatchedTitle: r.grandparentTitle ? `${r.grandparentTitle} - ${r.title}` : r.title,
                    lastWatchedAt: r.watchedAt,
                    lastPlatform: r.platform || r.player || "Unknown",
                    lastIp: r.ipAddress || "",
                    sharingAlerts: 0,
                    records: []
                });
            }

            const profile = userMap.get(uKey)!;
            profile.totalPlays++;
            profile.records.push(r);
            if (r.completed) profile.completedCount++;
            profile.totalWatchSeconds += Math.round((r.durationMs || 0) / 1000);
            if (r.videoDecision === "direct play") profile.directPlayCount++;
            if (r.videoDecision === "transcode") profile.transcodeCount++;
            if (r.serverName) profile.servers.add(r.serverName);
            if (r.platform) profile.platforms.add(r.platform);
            if (r.device || r.player) profile.devices.add(r.device || r.player || "Client");
            if (r.ipAddress) profile.ips.add(r.ipAddress);
            if (r.isSharingAlert) profile.sharingAlerts++;
        }

        const profiles = Array.from(userMap.values()).map(p => {
            const total = p.directPlayCount + p.transcodeCount;
            const transcodeRate = total > 0 ? Math.round((p.transcodeCount / total) * 100) : 0;
            const { sharingAssessment } = analyzeUserAccountSharing(p.records);
            return {
                user: p.user,
                totalPlays: p.totalPlays,
                completedCount: p.completedCount,
                totalWatchHours: Number((p.totalWatchSeconds / 3600).toFixed(1)),
                directPlayCount: p.directPlayCount,
                transcodeCount: p.transcodeCount,
                transcodeRate,
                servers: Array.from(p.servers),
                platforms: Array.from(p.platforms),
                devices: Array.from(p.devices),
                ips: Array.from(p.ips),
                devicesCount: p.devices.size,
                ipsCount: p.ips.size,
                lastWatchedTitle: p.lastWatchedTitle,
                lastWatchedAt: p.lastWatchedAt,
                lastPlatform: p.lastPlatform,
                lastIp: p.lastIp,
                sharingAlerts: p.sharingAlerts,
                frequentTranscoder: transcodeRate >= 50 && p.totalPlays >= 2,
                sharingAssessment
            };
        });

        profiles.sort((a, b) => b.totalPlays - a.totalPlays);
        return profiles;
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error building user stream profiles:", err);
        return [];
    }
}

/**
 * Detailed telemetry profile for a specific user:
 * Includes full aggregated devices, all used IP addresses, and chronological playback history.
 */
export async function getUserDetailedTelemetry(username: string) {
    try {
        const cleanUser = username?.trim() || "";
        if (!cleanUser) {
            return {
                user: "",
                totalPlays: 0,
                completedCount: 0,
                totalWatchHours: 0,
                directPlayCount: 0,
                transcodeCount: 0,
                transcodeRate: 0,
                sharingAlerts: 0,
                devices: [],
                ips: [],
                history: []
            };
        }

        // Query watch history for this user
        const records = await prisma.watchHistory.findMany({
            where: {
                user: {
                    equals: cleanUser
                }
            },
            orderBy: { watchedAt: "desc" },
            take: 2000
        });

        let userRecords = records;
        if (userRecords.length === 0) {
            userRecords = await prisma.watchHistory.findMany({
                where: {
                    user: {
                        contains: cleanUser
                    }
                },
                orderBy: { watchedAt: "desc" },
                take: 2000
            });
        }

        let totalWatchSeconds = 0;
        let completedCount = 0;
        let directPlayCount = 0;
        let transcodeCount = 0;
        let sharingAlerts = 0;

        const deviceMap = new Map<string, {
            name: string;
            player: string;
            platform: string;
            device: string;
            playCount: number;
            directPlayCount: number;
            transcodeCount: number;
            lastSeen: Date;
            firstSeen: Date;
            servers: Set<string>;
        }>();

        const ipMap = new Map<string, {
            ip: string;
            location: string;
            isLan: boolean;
            playCount: number;
            sharingAlertCount: number;
            lastSeen: Date;
            firstSeen: Date;
            devices: Set<string>;
        }>();

        const formattedHistory: any[] = [];

        for (const r of userRecords) {
            totalWatchSeconds += Math.round((r.durationMs || 0) / 1000);
            if (r.completed) completedCount++;
            if (r.videoDecision === "direct play") directPlayCount++;
            if (r.videoDecision === "transcode") transcodeCount++;
            if (r.isSharingAlert) sharingAlerts++;

            // Device aggregation
            const devName = r.device || r.player || r.platform || "Plex Client";
            const platformName = r.platform || "Unknown";
            const playerName = r.player || "Plex";
            const devKey = `${platformName}:::${playerName}:::${devName}`.toLowerCase();

            if (!deviceMap.has(devKey)) {
                deviceMap.set(devKey, {
                    name: devName,
                    player: playerName,
                    platform: platformName,
                    device: r.device || "Client",
                    playCount: 0,
                    directPlayCount: 0,
                    transcodeCount: 0,
                    lastSeen: r.watchedAt,
                    firstSeen: r.watchedAt,
                    servers: new Set()
                });
            }
            const dev = deviceMap.get(devKey)!;
            dev.playCount++;
            if (r.videoDecision === "direct play") dev.directPlayCount++;
            if (r.videoDecision === "transcode") dev.transcodeCount++;
            if (r.watchedAt > dev.lastSeen) dev.lastSeen = r.watchedAt;
            if (r.watchedAt < dev.firstSeen) dev.firstSeen = r.watchedAt;
            if (r.serverName) dev.servers.add(r.serverName);

            // IP aggregation
            const ip = r.ipAddress || "Unknown IP";
            if (!ipMap.has(ip)) {
                const isLan = isPrivateOrLocalIp(ip);
                ipMap.set(ip, {
                    ip,
                    location: r.location || (isLan ? "LAN" : "Remote"),
                    isLan,
                    playCount: 0,
                    sharingAlertCount: 0,
                    lastSeen: r.watchedAt,
                    firstSeen: r.watchedAt,
                    devices: new Set()
                });
            }
            const ipEntry = ipMap.get(ip)!;
            ipEntry.playCount++;
            if (r.isSharingAlert) ipEntry.sharingAlertCount++;
            if (r.watchedAt > ipEntry.lastSeen) ipEntry.lastSeen = r.watchedAt;
            if (r.watchedAt < ipEntry.firstSeen) ipEntry.firstSeen = r.watchedAt;
            ipEntry.devices.add(devName);

            // Formatted history row
            formattedHistory.push({
                ...r,
                thumb: formatWatchHistoryThumb(r)
            });
        }

        const totalPlayback = directPlayCount + transcodeCount;
        const transcodeRate = totalPlayback > 0 ? Math.round((transcodeCount / totalPlayback) * 100) : 0;

        const devices = Array.from(deviceMap.values()).map(d => ({
            name: d.name,
            player: d.player,
            platform: d.platform,
            device: d.device,
            playCount: d.playCount,
            directPlayCount: d.directPlayCount,
            transcodeCount: d.transcodeCount,
            directPlayRate: d.playCount > 0 ? Math.round((d.directPlayCount / d.playCount) * 100) : 100,
            lastSeen: d.lastSeen,
            firstSeen: d.firstSeen,
            servers: Array.from(d.servers)
        })).sort((a, b) => b.playCount - a.playCount);

        const ips = Array.from(ipMap.values()).map(i => ({
            ip: i.ip,
            location: i.location,
            isLan: i.isLan,
            playCount: i.playCount,
            sharingAlertCount: i.sharingAlertCount,
            lastSeen: i.lastSeen,
            firstSeen: i.firstSeen,
            devices: Array.from(i.devices)
        })).sort((a, b) => b.playCount - a.playCount);

        const { sharingAssessment, detectedOverlaps } = analyzeUserAccountSharing(userRecords);

        return {
            user: cleanUser,
            totalPlays: userRecords.length,
            completedCount,
            totalWatchHours: Number((totalWatchSeconds / 3600).toFixed(1)),
            directPlayCount,
            transcodeCount,
            transcodeRate,
            sharingAlerts,
            devices,
            ips,
            history: formattedHistory,
            sharingAssessment,
            detectedOverlaps
        };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error building detailed user telemetry:", err);
        return {
            user: username,
            totalPlays: 0,
            completedCount: 0,
            totalWatchHours: 0,
            directPlayCount: 0,
            transcodeCount: 0,
            transcodeRate: 0,
            sharingAlerts: 0,
            devices: [],
            ips: [],
            history: [],
            sharingAssessment: null,
            detectedOverlaps: []
        };
    }
}

/**
 * Returns multi-server cluster statistics and top content leaderboards
 */
export async function getStreamIntelligenceAnalytics() {
    try {
        const [totalSessions, allHistory, completedCount] = await Promise.all([
            prisma.watchHistory.count(),
            prisma.watchHistory.findMany({
                select: {
                    title: true,
                    grandparentTitle: true,
                    mediaType: true,
                    durationMs: true,
                    videoDecision: true,
                    serverName: true,
                    thumb: true,
                    ratingKey: true,
                    serverId: true,
                    year: true
                },
                take: 3000
            }),
            prisma.watchHistory.count({ where: { completed: true } })
        ]);

        let totalDurationSeconds = 0;
        let directPlayCount = 0;
        let transcodeCount = 0;

        const moviePlays = new Map<string, number>();
        const showPlays = new Map<string, number>();
        const serverPlays = new Map<string, number>();
        const movieMeta = new Map<string, { thumb?: string | null; ratingKey?: string | null; serverId?: string | null; serverName?: string; year?: number | null }>();
        const showMeta = new Map<string, { thumb?: string | null; ratingKey?: string | null; serverId?: string | null; serverName?: string; year?: number | null }>();
        let moviesCount = 0;
        let episodesCount = 0;

        for (const h of allHistory) {
            totalDurationSeconds += Math.round((h.durationMs || 0) / 1000);
            if (h.videoDecision === "direct play") directPlayCount++;
            if (h.videoDecision === "transcode") transcodeCount++;

            if (h.serverName) {
                serverPlays.set(h.serverName, (serverPlays.get(h.serverName) || 0) + 1);
            }

            if (h.mediaType === "movie" || !h.grandparentTitle) {
                moviesCount++;
                const key = h.title;
                moviePlays.set(key, (moviePlays.get(key) || 0) + 1);
                if (!movieMeta.has(key) || (!movieMeta.get(key)?.thumb && h.thumb)) {
                    movieMeta.set(key, { thumb: h.thumb, ratingKey: h.ratingKey, serverId: h.serverId, serverName: h.serverName, year: h.year });
                }
            } else {
                episodesCount++;
                const key = h.grandparentTitle || h.title;
                showPlays.set(key, (showPlays.get(key) || 0) + 1);
                if (!showMeta.has(key) || (!showMeta.get(key)?.thumb && h.thumb)) {
                    showMeta.set(key, { thumb: h.thumb, ratingKey: h.ratingKey, serverId: h.serverId, serverName: h.serverName, year: h.year });
                }
            }
        }

        const totalPlayback = directPlayCount + transcodeCount;
        const directPlayRatio = totalPlayback > 0 ? Math.round((directPlayCount / totalPlayback) * 100) : 100;

        const topMovies = Array.from(moviePlays.entries())
            .map(([title, plays]) => {
                const meta = movieMeta.get(title);
                const thumb = formatWatchHistoryThumb({
                    thumb: meta?.thumb,
                    ratingKey: meta?.ratingKey,
                    serverId: meta?.serverId,
                    serverName: meta?.serverName,
                    title,
                    year: meta?.year,
                    mediaType: "movie"
                }) || `/api/media/image?title=${encodeURIComponent(title)}&type=movie`;
                return {
                    title,
                    plays,
                    year: meta?.year,
                    thumb
                };
            })
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const topShows = Array.from(showPlays.entries())
            .map(([title, plays]) => {
                const meta = showMeta.get(title);
                const thumb = formatWatchHistoryThumb({
                    thumb: meta?.thumb,
                    ratingKey: meta?.ratingKey,
                    serverId: meta?.serverId,
                    serverName: meta?.serverName,
                    title,
                    year: meta?.year,
                    mediaType: "show"
                }) || `/api/media/image?title=${encodeURIComponent(title)}&type=show`;
                return {
                    title,
                    plays,
                    year: meta?.year,
                    thumb
                };
            })
            .sort((a, b) => b.plays - a.plays)
            .slice(0, 10);

        const playsByServer = Array.from(serverPlays.entries())
            .map(([server, plays]) => ({ server, plays }))
            .sort((a, b) => b.plays - a.plays);

        return {
            totalSessions,
            completedCount,
            totalWatchHours: Number((totalDurationSeconds / 3600).toFixed(1)),
            totalHoursStreamed: Number((totalDurationSeconds / 3600).toFixed(1)),
            directPlayCount,
            transcodeCount,
            directPlayRatio,
            directPlayPercentage: directPlayRatio,
            moviesCount,
            episodesCount,
            topMovies,
            topShows,
            playsByServer
        };
    } catch (err: any) {
        console.error("[STREAM-TRACKER] Error calculating stream analytics:", err);
        return {
            totalSessions: 0,
            completedCount: 0,
            totalWatchHours: 0,
            totalHoursStreamed: 0,
            directPlayCount: 0,
            transcodeCount: 0,
            directPlayRatio: 100,
            directPlayPercentage: 100,
            moviesCount: 0,
            episodesCount: 0,
            topMovies: [],
            topShows: [],
            playsByServer: []
        };
    }
}

