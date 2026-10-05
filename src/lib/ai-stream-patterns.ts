import { StreamTelemetry, StreamPatternInsight } from "@/lib/ai-server-assistant-types";

interface StreamHistoryEntry {
    title: string;
    fullTitle: string;
    player: string;
    date: string;
    percentComplete: number;
    mediaType: string;
}

/**
 * Analyzes active streams and historical playback sessions to detect persistent bottlenecks and patterns.
 */
export function analyzeStreamPatterns(
    activeStreams: StreamTelemetry[],
    recentHistory: StreamHistoryEntry[]
): StreamPatternInsight[] {
    const insights: StreamPatternInsight[] = [];

    const allSessions = [
        ...activeStreams.map(s => ({
            player: s.player || s.platform || "Plex Client",
            resolution: s.videoResolution || "",
            transcodeDecision: s.transcodeDecision,
            subtitleCodec: s.subtitleCodec || "",
            transcodeSpeed: s.transcodeSpeed,
            bitrate: s.streamBitrate
        })),
        ...recentHistory.map(h => ({
            player: h.player || "Plex Client",
            resolution: "",
            transcodeDecision: "unknown" as const,
            subtitleCodec: "",
            transcodeSpeed: undefined,
            bitrate: undefined
        }))
    ];

    // 1. Detect Roku Auto-Adjust / Bandwidth cap pattern
    const rokuSessions = allSessions.filter(s => /roku/i.test(s.player));
    if (rokuSessions.length > 0) {
        insights.push({
            patternType: "roku_auto_adjust_chronic",
            severity: "warning",
            title: "Roku Auto Adjust Quality Risk",
            description: `We detected ${rokuSessions.length} stream session(s) from Roku devices. Roku's default "Auto Adjust Quality" frequently causes premature stream termination ("Cannot convert below minimum bandwidth 103kbps").`,
            affectedDevices: Array.from(new Set(rokuSessions.map(s => s.player))),
            occurrenceCount: rokuSessions.length,
            remedy: "Turn OFF 'Auto Adjust Quality' and set 'Remote Streaming Quality' to 'Original / Maximum' in your Roku Plex Settings.",
            fixGuideId: "roku"
        });
    }

    // 2. Detect 720p / 2Mbps Remote Cap Chronic Pattern
    const active720pCapped = activeStreams.filter(s => 
        (s.videoResolution?.includes("720") || (s.streamBitrate && s.streamBitrate <= 2100)) &&
        s.transcodeDecision === "transcode" &&
        s.sourceResolution && !s.sourceResolution.includes("720") && !s.sourceResolution.includes("480")
    );

    if (active720pCapped.length > 0) {
        const affectedPlayers = Array.from(new Set(active720pCapped.map(s => s.player)));
        const firstPlayer = affectedPlayers[0] || "Plex Client";
        const isFireTv = /fire/i.test(firstPlayer);
        const isAppleTv = /apple/i.test(firstPlayer);
        const isRoku = /roku/i.test(firstPlayer);

        insights.push({
            patternType: "bandwidth_cap_720p_chronic",
            severity: "error",
            title: "Forced 720p (2 Mbps) Downscaling",
            description: `Your active stream on ${firstPlayer} is restricted by Plex's default 2 Mbps remote ceiling, forcing high-definition media to downscale to 720p.`,
            affectedDevices: affectedPlayers,
            occurrenceCount: active720pCapped.length,
            remedy: "Change Remote Streaming Quality from 2 Mbps (720p) to 'Maximum / Original' in Plex Video Quality settings.",
            fixGuideId: isRoku ? "roku" : isFireTv ? "firetv" : isAppleTv ? "appletv" : "smarttv"
        });
    }

    // 3. Chronic Image Subtitle Burn-In (PGS / VOBSUB / ASS)
    const subBurnSessions = activeStreams.filter(s => 
        s.subtitleDecision === "burn" ||
        (s.transcodeDecision === "transcode" && ["pgs", "vobsub", "ass"].some(sub => (s.subtitleCodec || "").toLowerCase().includes(sub)))
    );

    if (subBurnSessions.length > 0) {
        const affectedPlayers = Array.from(new Set(subBurnSessions.map(s => s.player)));
        insights.push({
            patternType: "subtitle_burn_chronic",
            severity: "warning",
            title: "Image Subtitle CPU Burn-in",
            description: `Active playback is burning image-based subtitles (${subBurnSessions[0].subtitleCodec?.toUpperCase() || "PGS"}) directly into the video stream, causing elevated CPU usage and potential buffering.`,
            affectedDevices: affectedPlayers,
            occurrenceCount: subBurnSessions.length,
            remedy: "Switch to an external SRT text subtitle track, or set 'Burn Subtitles' to 'Only Image Formats' in Plex client settings."
        });
    }

    // 4. Chronic Web Browser Codec Limitations
    const webSessions = allSessions.filter(s => /web|chrome|firefox|safari|edge/i.test(s.player));
    if (webSessions.length >= 2) {
        insights.push({
            patternType: "browser_transcode_chronic",
            severity: "info",
            title: "Web Browser Streaming Detected",
            description: `You have ${webSessions.length} session(s) streaming via a web browser. Browsers lack hardware decoding for HEVC/H.265, TrueHD, and ASS subtitles, forcing transcode overhead.`,
            affectedDevices: ["Web Browser"],
            occurrenceCount: webSessions.length,
            remedy: "Download and use the official Plex Desktop App for Windows / Mac to achieve 100% Direct Play.",
            fixGuideId: "web"
        });
    }

    return insights;
}
