/**
 * Device Diagnostics & Quality Settings Engine
 * Evaluates active stream sessions and watch history to detect suboptimal client settings
 * (e.g. Roku 720p cap, default 2Mbps remote quality, subtitle burn-in, audio transcoding)
 * and generates step-by-step fix guides for users and administrators.
 */

export interface DeviceDiagnosis {
    hasIssue: boolean;
    issueType?: "roku_auto_adjust" | "remote_quality_cap" | "subtitle_burn_in" | "audio_incompatible" | "web_browser_codec" | "relay_bandwidth_cap";
    title: string;
    description: string;
    severity: "warning" | "error" | "info";
    deviceCategory: string; // "Roku" | "Apple TV" | "Fire TV" | "Android TV" | "Samsung / LG TV" | "Web Browser" | "Generic"
    quickFix: string;
    stepByStepGuide: string[];
    copyableNotice: string;
}

export function detectDeviceCategory(platform?: string | null, player?: string | null, device?: string | null): string {
    const raw = `${platform || ""} ${player || ""} ${device || ""}`.toLowerCase();
    if (raw.includes("roku")) return "Roku";
    if (raw.includes("apple") || raw.includes("tvos") || raw.includes("ios") || raw.includes("ipad")) return "Apple TV";
    if (raw.includes("fire") || raw.includes("aftt") || raw.includes("aftm") || raw.includes("amazon")) return "Fire TV";
    if (raw.includes("android") || raw.includes("google") || raw.includes("shield") || raw.includes("bravia")) return "Android TV";
    if (raw.includes("samsung") || raw.includes("tizen")) return "Samsung TV";
    if (raw.includes("lg") || raw.includes("webos")) return "LG TV";
    if (raw.includes("chrome") || raw.includes("firefox") || raw.includes("safari") || raw.includes("edge") || raw.includes("web") || raw.includes("browser")) return "Web Browser";
    return "Streaming Device";
}

export function diagnoseStreamSettings(session: any): DeviceDiagnosis {
    const platform = (session.platform || session.device || "").toLowerCase();
    const player = (session.player || "").toLowerCase();
    const device = (session.device || "").toLowerCase();
    const deviceCat = detectDeviceCategory(platform, player, device);

    const videoDecision = (session.videoDecision || session.video_decision || "direct play").toLowerCase();
    const audioDecision = (session.audioDecision || session.audio_decision || "direct play").toLowerCase();
    const isTranscoding = videoDecision === "transcode";
    const isAudioTranscoding = audioDecision === "transcode";

    const bitrate = Number(session.streamBitrate || session.stream_bitrate || session.bitrate || 0);
    const location = (session.location || "Remote").toLowerCase();
    const isRemote = location.includes("remote") || location.includes("wan");

    const rawTitle = session.grandparentTitle ? `${session.grandparentTitle} - ${session.title}` : (session.title || "Media");
    const user = session.user || "User";

    // 1. Roku Auto-Adjust Bug & 720p 4Mbps Cap
    if (deviceCat === "Roku" && isTranscoding && (bitrate === 0 || bitrate <= 4500)) {
        return {
            hasIssue: true,
            issueType: "roku_auto_adjust",
            title: "Roku Auto Adjust & 720p Cap Active",
            description: "The Roku Plex app has 'Auto Adjust Quality' enabled by default, artificially capping streams at 720p (4 Mbps or 2 Mbps) and forcing heavy server video transcoding.",
            severity: "warning",
            deviceCategory: "Roku",
            quickFix: "Turn OFF 'Auto Adjust Quality' and set Remote Quality to 'Original' in the Roku Plex app settings.",
            stepByStepGuide: [
                "Open the Plex app on your Roku.",
                "Click your User Profile icon in the top left and select Settings (⚙️).",
                "Navigate down to 'Video' in the left menu.",
                "Set 'Auto Adjust Quality' to OFF (this is on by default and throttles streams).",
                "Change 'Local Quality' to 'Original'.",
                "Change 'Remote Quality' to 'Original' (or Maximum)."
            ],
            copyableNotice: `Hey @${user}! We noticed your stream of "${rawTitle}" on your Roku is transcoding because Roku's "Auto Adjust Quality" feature is turned on by default. To get crisp original quality and smooth playback:\n1. Open Plex on your Roku → Settings (⚙️) → Video.\n2. Turn "Auto Adjust Quality" OFF.\n3. Change "Remote Quality" to Original (Maximum).\nThis will give you the best picture quality and prevent buffering!`
        };
    }

    // 2. Default Remote Quality Limit (2 Mbps / 4 Mbps) on Apple TV, Fire TV, Android TV, TVs
    if (isRemote && isTranscoding && (bitrate === 0 || bitrate <= 4500) && deviceCat !== "Web Browser") {
        return {
            hasIssue: true,
            issueType: "remote_quality_cap",
            title: `Default Remote Quality Cap (2-4 Mbps) on ${deviceCat}`,
            description: `The Plex client on ${deviceCat} is currently configured to the factory default 2 Mbps or 4 Mbps limit instead of Maximum/Original quality, forcing the server to downscale video to 720p.`,
            severity: "warning",
            deviceCategory: deviceCat,
            quickFix: `Change 'Remote Streaming Quality' from 2 Mbps / 4 Mbps to 'Maximum' / 'Original' in ${deviceCat} Plex settings.`,
            stepByStepGuide: [
                `Open the Plex app on your ${deviceCat}.`,
                "Go to Settings (⚙️) → Video (or Quality).",
                "Find 'Remote Streaming Quality' (often defaulted to 2 Mbps or 4 Mbps).",
                "Select 'Maximum' or 'Original'.",
                "If available, set 'Automatically Adjust Quality' to OFF."
            ],
            copyableNotice: `Hey @${user}! We noticed your stream of "${rawTitle}" on your ${deviceCat} is capped at low quality (2-4 Mbps 720p). To unlock full 1080p/4K Direct Play:\n1. Open Plex on your ${deviceCat} → Settings (⚙️) → Video / Quality.\n2. Change "Remote Streaming Quality" to Maximum (Original).\n3. Turn "Automatically Adjust Quality" OFF.\nEnjoy the full high-definition stream!`
        };
    }

    // 3. Web Browser Incompatible 4K / HEVC Codec
    if (deviceCat === "Web Browser" && isTranscoding) {
        return {
            hasIssue: true,
            issueType: "web_browser_codec",
            title: "Web Browser Cannot Direct Play Media",
            description: "Desktop web browsers (Chrome, Firefox, Safari) lack native hardware decoders for HEVC (H.265), 10-bit color, and surround audio, forcing the server to transcode.",
            severity: "info",
            deviceCategory: "Web Browser",
            quickFix: "Use the free official Plex Desktop App (Mac / Windows) for native Direct Play instead of a browser.",
            stepByStepGuide: [
                "Download the free Plex Desktop app from https://plex.tv/apps (choose Plex for Windows or Plex for Mac).",
                "Sign in to your account.",
                "The desktop app direct-plays all 4K, HEVC, and surround audio formats natively without any browser transcoding."
            ],
            copyableNotice: `Hey @${user}! We noticed you're watching "${rawTitle}" through a web browser. Browsers can't play high-efficiency video (HEVC/4K) natively and force the server to transcode. For the best experience with instant playback, download the free Plex Desktop App for Windows or Mac at https://plex.tv/apps!`
        };
    }

    // 4. Subtitle Burn-In Transcode
    if (isTranscoding && (session.transcodeHwDecoding || session.transcodeHwEncoding) && !session.transcodeHwRequested) {
        return {
            hasIssue: true,
            issueType: "subtitle_burn_in",
            title: "Subtitle Burn-In Forcing Video Transcoding",
            description: "Bitmap image subtitles (PGS, ASS, or VOBSUB) are being burned directly into the video frame by the server CPU.",
            severity: "warning",
            deviceCategory: deviceCat,
            quickFix: "Set 'Burn Subtitles' to 'Only Image Formats' in client settings, or switch to SRT text subtitles.",
            stepByStepGuide: [
                "During playback or in Plex Settings, open 'Subtitles'.",
                "Change 'Burn Subtitles' from 'Always' to 'Only Image Formats' (or 'Automatic').",
                "In the audio & subtitle track picker, select an SRT subtitle track instead of PGS."
            ],
            copyableNotice: `Hey @${user}! Your stream of "${rawTitle}" is transcoding because subtitles are set to burn into the video. In Plex Settings → Subtitles, change "Burn Subtitles" to "Only Image Formats" or pick an SRT subtitle track to Direct Play cleanly!`
        };
    }

    // 5. Audio-Only Transcoding (Passthrough Incompatible)
    if (isAudioTranscoding && !isTranscoding) {
        return {
            hasIssue: true,
            issueType: "audio_incompatible",
            title: "Audio Format Transcoding (Video Direct Plays)",
            description: "The video is Direct Playing smoothly, but the surround sound track (TrueHD or DTS-HD MA) is transcoding to AAC/Opus for your device.",
            severity: "info",
            deviceCategory: deviceCat,
            quickFix: "Switch to the standard 5.1 AC3 / EAC3 audio track in the player menu, or enable HDMI audio passthrough.",
            stepByStepGuide: [
                "In the player playback controls, click the Audio Stream selector.",
                "Select 'Dolby Digital 5.1 (AC3)' or 'Stereo' if available instead of TrueHD 7.1.",
                "If connected to an AVR soundbar, go to Plex Settings → Audio and turn ON 'HDMI Passthrough'."
            ],
            copyableNotice: `Hey @${user}! The video for "${rawTitle}" is Direct Playing perfectly, but the high-end 7.1 audio track is transcoding. In the playback audio menu, select the standard 5.1 (AC3) track if you don't have a 7.1 home theater receiver!`
        };
    }

    return {
        hasIssue: false,
        title: "Optimal Direct Play",
        description: "This stream is direct playing or functioning within normal operating parameters.",
        severity: "info",
        deviceCategory: deviceCat,
        quickFix: "No action required.",
        stepByStepGuide: [],
        copyableNotice: ""
    };
}

export interface UserTranscodeAlertResult {
    hasAlert: boolean;
    isActiveNow?: boolean;
    mediaTitle?: string;
    device?: string;
    platform?: string;
    serverName?: string;
    watchedAt?: string;
    diagnosis?: DeviceDiagnosis;
}

/**
 * Checks if a user has an active or recent stream (within 14 days) suffering from
 * suboptimal client settings / transcoding, to present a proactive fix banner.
 */
export async function getUserTranscodeAlert(username: string, email?: string): Promise<UserTranscodeAlertResult> {
    try {
        const cleanUser = username?.trim() || "";
        if (!cleanUser) return { hasAlert: false };

        const { prisma } = await import("@/lib/prisma");

        const userNames = [cleanUser];
        if (email && email.trim()) userNames.push(email.trim());

        // 1. Check recent watch history within 14 days
        const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
        const recentTranscode = await prisma.watchHistory.findFirst({
            where: {
                user: { in: userNames },
                videoDecision: "transcode",
                watchedAt: { gte: fourteenDaysAgo }
            },
            orderBy: { watchedAt: "desc" }
        });

        if (recentTranscode) {
            const diag = diagnoseStreamSettings(recentTranscode);
            if (diag.hasIssue) {
                const title = recentTranscode.grandparentTitle 
                    ? `${recentTranscode.grandparentTitle} - ${recentTranscode.title}` 
                    : recentTranscode.title;
                const dev = recentTranscode.device || recentTranscode.player || recentTranscode.platform || "Plex Client";
                return {
                    hasAlert: true,
                    isActiveNow: false,
                    mediaTitle: title,
                    device: dev,
                    platform: recentTranscode.platform || "Device",
                    serverName: recentTranscode.serverName,
                    watchedAt: recentTranscode.watchedAt.toISOString(),
                    diagnosis: diag
                };
            }
        }

        return { hasAlert: false };
    } catch (e) {
        return { hasAlert: false };
    }
}
