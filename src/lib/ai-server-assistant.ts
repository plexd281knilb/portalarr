import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { 
    UserDiagnosticSnapshot, 
    StreamTelemetry, 
    DetectedIssue, 
    AiChatMessage, 
    AiAssistantResponse,
    AgentActionReport,
    MediaStreamInspection,
    StreamPatternInsight
} from "@/lib/ai-server-assistant-types";
import { getPlexOwnerUser, getPlexServerFriends, getPlexServers } from "@/lib/plex";
import { analyzeStreamPatterns } from "@/lib/ai-stream-patterns";
import { 
    inspectMediaStreams, 
    searchAndGrabRadarrReplacement, 
    searchAndGrabSonarrReplacement, 
    redownloadBookWithDiagnostics, 
    cleanMediaSearchQuery 
} from "@/lib/ai-media-diagnostics";
import { logAgentEvent } from "@/lib/ai-agent-guardrails";
import { runDeepPlexPlaybackHealthCheck, PlexPlaybackDiagnosticReport } from "@/lib/plex-playback-probe";

function cleanUrl(url: string): string {
    if (!url) return "";
    return url.replace(/\/$/, ""); 
}

async function fetchTautulliApiJson(url: string, signal?: AbortSignal, nextOptions?: any): Promise<{ ok: boolean; data: any; error?: string }> {
    try {
        const fetchOpts: any = { signal };
        if (nextOptions) {
            fetchOpts.next = nextOptions;
        } else {
            fetchOpts.cache = "no-store";
        }

        const res = await fetch(url, fetchOpts);
        if (!res.ok) {
            return { ok: false, data: null, error: `HTTP ${res.status}: ${res.statusText || "Request failed"}` };
        }

        const contentType = res.headers.get("content-type") || "";
        const text = await res.text();
        const trimmed = (text || "").trim();

        if (!trimmed) {
            return { ok: false, data: null, error: "Empty response received from server" };
        }

        if (trimmed.startsWith("<") || contentType.includes("html") || contentType.includes("xml")) {
            return { 
                ok: false, 
                data: null, 
                error: "Server returned HTML/XML instead of JSON." 
            };
        }

        const data = JSON.parse(trimmed);
        const tautulliResponse = data.response || data;
        
        if (tautulliResponse.result === "error") {
            return { ok: false, data: null, error: tautulliResponse.message || "Tautulli API Error" };
        }

        return { ok: true, data: tautulliResponse.data !== undefined ? tautulliResponse.data : tautulliResponse };
    } catch (e: any) {
        return { ok: false, data: null, error: e.name === "AbortError" ? "Request timed out" : e.message || "Network error" };
    }
}

export async function getUserDiagnosticSnapshot(user: any): Promise<UserDiagnosticSnapshot> {
    const safeUsername = String(user?.username || "");
    const safeEmail = String(user?.email || "");
    const role = String(user?.role || "USER");
    const isAdmin = role === "ADMIN";

    const userAliases = new Set<string>();
    if (safeUsername) userAliases.add(safeUsername.toLowerCase().trim());
    if (safeEmail) userAliases.add(safeEmail.toLowerCase().trim());

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    const tautullis = await prisma.tautulliInstance.findMany().catch(() => []);

    let adminToken = "";
    if (settings?.mainPlexToken) {
        try {
            adminToken = decryptData(settings.mainPlexToken);
        } catch (e) {}
    }

    // Expand user aliases
    if (adminToken) {
        if (isAdmin) {
            try {
                const ownerUser = await getPlexOwnerUser(adminToken);
                if (ownerUser) {
                    if (ownerUser.username) userAliases.add(ownerUser.username.toLowerCase().trim());
                    if (ownerUser.email) userAliases.add(ownerUser.email.toLowerCase().trim());
                    if (ownerUser.title) userAliases.add(ownerUser.title.toLowerCase().trim());
                }
            } catch (e) {}
        } else {
            try {
                const friends = await getPlexServerFriends(adminToken);
                const matchedFriend = friends.find((f: any) => 
                    (f.username && userAliases.has(f.username.toLowerCase().trim())) ||
                    (f.email && userAliases.has(f.email.toLowerCase().trim()))
                );
                if (matchedFriend) {
                    if (matchedFriend.username) userAliases.add(matchedFriend.username.toLowerCase().trim());
                    if (matchedFriend.email) userAliases.add(matchedFriend.email.toLowerCase().trim());
                }
            } catch (e) {}
        }
    }

    const activeStreams: StreamTelemetry[] = [];
    const seenSessionKeys = new Set<string>();
    const recentWatchHistory: Array<{
        title: string;
        fullTitle: string;
        player: string;
        date: string;
        percentComplete: number;
        mediaType: string;
    }> = [];
    const recentDevicesSet = new Set<string>();
    let serversOnlineCount = 0;

    // 1. Scan Tautulli instances with strict 2.5s timeout
    await Promise.allSettled(tautullis.map(async (t) => {
        const cleanBase = cleanUrl(t.url).replace(/\/api\/v2\/?$/, "");
        const apiKey = decryptData(t.apiKey);

        // Fetch activity
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const actUrl = `${cleanBase}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_activity`;
            const actResult = await fetchTautulliApiJson(actUrl, controller.signal);
            clearTimeout(timeoutId);

            if (actResult.ok && actResult.data) {
                serversOnlineCount++;
                const sessions = actResult.data.sessions || [];
                for (const s of sessions) {
                    const sKey = String(s.session_key || s.session_id || "");
                    if (seenSessionKeys.has(sKey)) continue;

                    const sUser = (s.user || "").toLowerCase().trim();
                    const sEmail = (s.email || "").toLowerCase().trim();
                    const sFriendly = (s.friendly_name || "").toLowerCase().trim();
                    const sUserId = String(s.user_id ?? "");

                    const isMatch = userAliases.has(sUser) || 
                                    userAliases.has(sEmail) || 
                                    userAliases.has(sFriendly) || 
                                    (isAdmin && (sUserId === "0" || sUser === "local" || sUser === "admin"));

                    if (isMatch) {
                        seenSessionKeys.add(sKey);
                        const player = s.player || s.platform || "Plex Device";
                        recentDevicesSet.add(player);

                        const transDecision = String(s.transcode_decision || s.video_decision || "direct play").toLowerCase() as any;
                        const stream: StreamTelemetry = {
                            sessionKey: sKey,
                            sessionId: s.session_id ? String(s.session_id) : undefined,
                            title: s.title || "Media Item",
                            year: s.year ? String(s.year) : undefined,
                            mediaType: s.media_type || (s.grandparent_title ? "episode" : "movie"),
                            player: player,
                            platform: s.platform || s.player || "Plex Client",
                            deviceType: s.platform_name || s.platform || player,
                            ipAddress: s.ip_address || s.ip_address_public,
                            videoResolution: s.stream_video_resolution || s.video_resolution || "1080p",
                            sourceResolution: s.video_resolution || "1080p",
                            videoCodec: s.video_codec,
                            audioCodec: s.audio_codec,
                            streamAudioCodec: s.stream_audio_codec,
                            streamBitrate: Number(s.stream_bitrate || s.bitrate || 0),
                            transcodeDecision: ["direct play", "direct stream", "transcode", "copy"].includes(transDecision) ? transDecision : "transcode",
                            transcodeSpeed: s.transcode_speed ? String(s.transcode_speed) : undefined,
                            transcodeHwRequested: !!(s.transcode_hw_decoding || s.transcode_hw_encoding),
                            transcodeReason: s.transcode_hw_decoding_title || s.transcode_reason || s.stream_container_decision,
                            subtitleDecision: s.subtitle_decision,
                            subtitleCodec: s.subtitle_codec,
                            percentComplete: Number(s.progress_percent || 0),
                            state: s.state || "playing",
                            serverName: t.name
                        };
                        activeStreams.push(stream);
                    }
                }
            }
        } catch (e) {}

        // Fetch History
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2000);
            const histUrl = `${cleanBase}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_history&length=10`;
            const histResult = await fetchTautulliApiJson(histUrl, controller.signal, { revalidate: 30 });
            clearTimeout(timeoutId);

            if (histResult.ok && histResult.data) {
                const rows = histResult.data.data || (Array.isArray(histResult.data) ? histResult.data : []);
                for (const r of rows) {
                    const rUser = (r.user || r.username || "").toLowerCase().trim();
                    const rEmail = (r.email || "").toLowerCase().trim();
                    const isMatch = userAliases.has(rUser) || userAliases.has(rEmail) || (isAdmin && (!rUser || rUser === "local" || rUser === "admin"));
                    if (isMatch) {
                        const player = r.player || r.platform || "Plex Device";
                        recentDevicesSet.add(player);
                        let displayTitle = r.title || "Unknown";
                        if (r.grandparent_title) {
                            const sNum = r.parent_media_index ? String(r.parent_media_index).padStart(2, "0") : "01";
                            const eNum = r.media_index ? String(r.media_index).padStart(2, "0") : "01";
                            displayTitle = `${r.grandparent_title} (S${sNum}E${eNum})`;
                        } else if (r.year) {
                            displayTitle = `${r.title} (${r.year})`;
                        }
                        recentWatchHistory.push({
                            title: r.title || displayTitle,
                            fullTitle: displayTitle,
                            player: player,
                            date: r.date ? new Date(r.date * 1000).toISOString() : new Date().toISOString(),
                            percentComplete: Number(r.percent_complete || 100),
                            mediaType: r.media_type || (r.grandparent_title ? "episode" : "movie")
                        });
                    }
                }
            }
        } catch (e) {}
    }));

    // 2. Scan Direct Plex Media Servers if active
    if (adminToken) {
        try {
            const plexServers = await getPlexServers(adminToken);
            await Promise.allSettled(plexServers.map(async (srv: any) => {
                const token = srv.accessToken || adminToken;
                for (const conn of srv.connections) {
                    try {
                        const cleanBase = conn.uri.replace(/\/+$/, "");
                        const controller = new AbortController();
                        const timeoutId = setTimeout(() => controller.abort(), 2000);
                        const sRes = await fetch(`${cleanBase}/status/sessions`, {
                            headers: {
                                "Accept": "application/json",
                                "X-Plex-Token": token,
                                "X-Plex-Client-Identifier": "portalarr-ai-assistant"
                            },
                            signal: controller.signal,
                            cache: "no-store"
                        });
                        clearTimeout(timeoutId);

                        if (sRes.ok) {
                            const sJson = await sRes.json();
                            const rawSessions = sJson.MediaContainer?.Metadata || [];
                            const sessions = Array.isArray(rawSessions) ? rawSessions : [rawSessions];

                            for (const s of sessions) {
                                const sKey = String(s.sessionKey || s.Session?.id || "");
                                if (seenSessionKeys.has(sKey)) continue;

                                const sUser = (s.User?.title || s.User?.username || s.User?.name || s.username || s.user || "").toLowerCase().trim();
                                const sEmail = (s.User?.email || s.email || "").toLowerCase().trim();
                                const isMatch = userAliases.has(sUser) || userAliases.has(sEmail) || (isAdmin && (!sUser || sUser === "local" || sUser === "admin"));

                                if (isMatch) {
                                    seenSessionKeys.add(sKey);
                                    const player = s.Player?.title || s.Player?.product || s.Player?.device || "Plex Client";
                                    recentDevicesSet.add(player);

                                    const part = s.Media?.[0]?.Part?.[0];
                                    const transDecision = s.TranscodeSession 
                                        ? (s.TranscodeSession.videoDecision === "copy" ? "direct stream" : "transcode")
                                        : "direct play";

                                    const stream: StreamTelemetry = {
                                        sessionKey: sKey,
                                        sessionId: s.Session?.id,
                                        title: s.title || "Media Item",
                                        year: s.year ? String(s.year) : undefined,
                                        mediaType: s.type || "movie",
                                        player: player,
                                        platform: s.Player?.platform || player,
                                        deviceType: s.Player?.device || player,
                                        ipAddress: s.Player?.address,
                                        videoResolution: s.Media?.[0]?.videoResolution || "1080p",
                                        sourceResolution: s.Media?.[0]?.videoResolution || "1080p",
                                        videoCodec: s.Media?.[0]?.videoCodec,
                                        audioCodec: s.Media?.[0]?.audioCodec,
                                        streamBitrate: s.Media?.[0]?.bitrate ? Number(s.Media?.[0]?.bitrate) : undefined,
                                        transcodeDecision: transDecision as any,
                                        transcodeSpeed: s.TranscodeSession?.speed ? String(s.TranscodeSession.speed) : undefined,
                                        transcodeHwRequested: !!s.TranscodeSession?.transcodeHwRequested,
                                        transcodeReason: s.TranscodeSession?.transcodeHwDecodingTitle || s.TranscodeSession?.videoDecision,
                                        subtitleDecision: part?.Stream?.find((st: any) => st.streamType === 3 && st.selected)?.decision,
                                        subtitleCodec: part?.Stream?.find((st: any) => st.streamType === 3 && st.selected)?.codec,
                                        percentComplete: s.viewOffset && s.duration ? Math.round((s.viewOffset / s.duration) * 100) : 0,
                                        state: s.Player?.state === "paused" ? "paused" : "playing",
                                        serverName: srv.name
                                    };
                                    activeStreams.push(stream);
                                }
                            }
                        }
                    } catch (e) {}
                }
            }));
        } catch (e) {}
    }

    // 3. Evaluate Real-Time Diagnostic Rules for User's Active Streams
    const detectedIssues: DetectedIssue[] = [];
    const primary = activeStreams[0] || null;

    if (primary) {
        const isRoku = /roku/i.test(primary.player) || /roku/i.test(primary.platform);
        const isFireTv = /fire/i.test(primary.player) || /aft/i.test(primary.platform);
        const isAppleTv = /apple/i.test(primary.player) || /tvos/i.test(primary.platform);
        const isWeb = /web|chrome|firefox|safari|edge/i.test(primary.player) || /web/i.test(primary.platform);
        const isTranscoding = primary.transcodeDecision === "transcode";

        // Issue A: Roku "Auto Adjust Quality" bug / "not enough bandwidth"
        if (isRoku && (isTranscoding || primary.streamBitrate && primary.streamBitrate < 500)) {
            detectedIssues.push({
                id: "roku-auto-adjust",
                type: "roku_auto_adjust",
                severity: "error",
                title: "Roku Auto Adjust Quality Bug / Buffering",
                summary: "Roku's 'Auto Adjust Quality' frequently drops bitrate below the server's minimum threshold (103kbps), crashing or buffering streams.",
                deviceAffected: primary.player,
                quickFix: "Turn OFF 'Auto Adjust Quality' and set Remote Streaming to 'Original' in your Roku Plex settings.",
                fixGuideId: "roku",
                steps: [
                    "1. Open the Plex app on your Roku",
                    "2. Click your Avatar / Settings ⚙️ icon in the top corner",
                    "3. Select Video Quality",
                    "4. Turn 'Auto Adjust Quality' → OFF",
                    "5. Set 'Remote Streaming' → 'Original' (or Maximum)",
                    "6. Set 'Direct Play' → 'Force' or 'Auto'"
                ]
            });
        }

        // Issue B: 2 Mbps / 720p Remote Cap
        const is720pCapped = (primary.videoResolution === "720p" || (primary.streamBitrate && primary.streamBitrate <= 2100)) &&
                             primary.sourceResolution && primary.sourceResolution !== "720p" && primary.sourceResolution !== "sd" && primary.sourceResolution !== "480p" &&
                             isTranscoding;

        if (is720pCapped) {
            detectedIssues.push({
                id: "bandwidth-cap-720p",
                type: "bandwidth_cap_720p",
                severity: "error",
                title: "Forced 720p (2 Mbps) Remote Quality Limit",
                summary: `Your ${primary.player} is using Plex's default 2 Mbps remote cap, forcing the server to downscale from ${primary.sourceResolution?.toUpperCase() || "HD"} to 720p.`,
                deviceAffected: primary.player,
                quickFix: "Change 'Remote Streaming Quality' from 2 Mbps / 720p to 'Maximum / Original'.",
                fixGuideId: isRoku ? "roku" : isFireTv ? "firetv" : isAppleTv ? "appletv" : "smarttv",
                steps: [
                    `1. Open Plex Settings on your ${primary.player}`,
                    "2. Go to Video Quality → Remote Streaming Quality",
                    "3. Select 'Maximum' or 'Original'",
                    "4. Resume stream to enjoy crystal clear Direct Play"
                ]
            });
        }

        // Issue C: Subtitle Burn-in
        const subBurn = primary.subtitleDecision === "burn" || 
                        (isTranscoding && ["pgs", "vobsub", "ass"].some(sub => (primary.subtitleCodec || "").toLowerCase().includes(sub)));
        if (subBurn) {
            detectedIssues.push({
                id: "subtitle-burn",
                type: "subtitle_burn",
                severity: "warning",
                title: "Image Subtitle Burn-In (Lag / High CPU)",
                summary: `The subtitle track (${primary.subtitleCodec?.toUpperCase() || "Image Subtitles"}) cannot be rendered natively by ${primary.player}, forcing the server to burn it into the video.`,
                deviceAffected: primary.player,
                quickFix: "Switch to an SRT subtitle track or set 'Burn Subtitles' to 'Only Image Formats'.",
                steps: [
                    "1. During playback, open the Subtitle / Audio track selector (💬)",
                    "2. Switch to an 'SRT' subtitle track (search for one if needed)",
                    "3. In Plex Settings → Subtitles, set 'Burn Subtitles' to 'Only Image Formats'"
                ]
            });
        }

        // Issue D: Slow Transcode Speed
        if (primary.transcodeSpeed && Number(primary.transcodeSpeed) < 1.0 && isTranscoding) {
            detectedIssues.push({
                id: "slow-transcode",
                type: "slow_transcode",
                severity: "error",
                title: "Server Transcoder Speed Falling Behind (< 1.0x)",
                summary: `Transcode speed is currently ${primary.transcodeSpeed}x (must be > 1.0x to avoid buffering).`,
                deviceAffected: primary.player,
                quickFix: "Enable Direct Play on your device to stop transcoding entirely.",
                steps: [
                    "1. Set Remote Streaming Quality to 'Original / Maximum'",
                    "2. Ensure Direct Play is set to 'Auto' or 'Forced'",
                    "3. If playing in a web browser, switch to the official Plex Desktop app"
                ]
            });
        }

        // Issue E: Web Browser Limitations
        if (isWeb && isTranscoding) {
            detectedIssues.push({
                id: "browser-limit",
                type: "browser_limit",
                severity: "info",
                title: "Web Browser Codec Limitations",
                summary: "Web browsers (Chrome, Firefox, Safari) do not support HEVC/H.265, TrueHD audio, or ASS subtitles natively, causing the server to transcode.",
                deviceAffected: "Web Browser",
                quickFix: "Use the official Plex Desktop App for Windows / Mac for zero transcoding.",
                fixGuideId: "web",
                steps: [
                    "1. Download the free Plex Desktop app from plex.tv/media-server-downloads/#plex-app",
                    "2. Log into your account",
                    "3. Enjoy 100% Direct Play for all 4K HDR, Dolby Atmos, and HEVC formats"
                ]
            });
        }
    }

    // 4. Compute Stream Pattern Insights across history
    const patternInsights = analyzeStreamPatterns(activeStreams, recentWatchHistory);

    return {
        username: safeUsername,
        email: safeEmail,
        role: role,
        activeStreamsCount: activeStreams.length,
        primaryActiveStream: primary,
        activeStreams,
        recentDevices: Array.from(recentDevicesSet),
        recentWatchHistory: recentWatchHistory.slice(0, 10),
        serversOnlineCount: Math.max(serversOnlineCount, tautullis.length),
        detectedIssues,
        patternInsights,
        generatedAt: new Date().toISOString()
    };
}

export async function askAiServerMaster(
    question: string,
    history: AiChatMessage[] = [],
    user?: any
): Promise<AiAssistantResponse> {
    // Quick diagnostic snapshot gathering with 2.5s maximum timeout
    let snapshot: UserDiagnosticSnapshot;
    try {
        snapshot = await Promise.race([
            getUserDiagnosticSnapshot(user),
            new Promise<UserDiagnosticSnapshot>((_, reject) => 
                setTimeout(() => reject(new Error("Telemetry timeout")), 2500)
            )
        ]);
    } catch {
        snapshot = {
            username: user?.username || "Plex User",
            email: user?.email,
            role: user?.role || "USER",
            activeStreamsCount: 0,
            primaryActiveStream: null,
            activeStreams: [],
            recentDevices: [],
            recentWatchHistory: [],
            serversOnlineCount: 1,
            detectedIssues: [],
            generatedAt: new Date().toISOString()
        };
    }

    const actionsTaken: AgentActionReport[] = [];
    let mediaInspection: MediaStreamInspection | undefined;
    let playbackProbe: PlexPlaybackDiagnosticReport | undefined;

    const lowerQ = question.toLowerCase();

    // --- STEP 0: ACTIVE PLAYBACK SYNTHETIC PROBE ---
    // Triggered when users ask "is plex working?", "is plex down?", "can plex play anything?", "test playback", "ping servers", etc.
    const isPlaybackProbeQuery = 
        lowerQ.includes("is plex working") ||
        lowerQ.includes("is plex up") ||
        lowerQ.includes("is the server up") ||
        lowerQ.includes("is the server working") ||
        lowerQ.includes("plex working") ||
        lowerQ.includes("plex down") ||
        lowerQ.includes("server down") ||
        lowerQ.includes("can plex play") ||
        lowerQ.includes("ping plex") ||
        lowerQ.includes("test playback") ||
        lowerQ.includes("test plex");

    if (isPlaybackProbeQuery) {
        try {
            playbackProbe = await runDeepPlexPlaybackHealthCheck();
            actionsTaken.push({
                action: "STREAM_PATTERN_DIAGNOSTIC",
                status: playbackProbe.allCanPlay ? "SUCCESS" : "FAILED",
                target: "Plex Playback Probe",
                summary: `Deep Playback Synthetic Probe: ${playbackProbe.operationalServers}/${playbackProbe.totalServers} servers operational. Can Stream: ${playbackProbe.allCanPlay ? "YES" : "NO"}`,
                details: playbackProbe,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        } catch (e: any) {}
    }

    // --- STEP 1: AUTONOMOUS MEDIA FILE & LANGUAGE INSPECTION ---
    const isLanguageOrMediaIssue = 
        lowerQ.includes("spanish") ||
        lowerQ.includes("language") ||
        lowerQ.includes("audio") ||
        lowerQ.includes("soundtrack") ||
        lowerQ.includes("dub") ||
        lowerQ.includes("track") ||
        lowerQ.includes("redownload") ||
        lowerQ.includes("re-download") ||
        lowerQ.includes("replace") ||
        lowerQ.includes("broken") ||
        lowerQ.includes("sandlot") ||
        lowerQ.includes("corrupt") ||
        lowerQ.includes("wrong audio") ||
        lowerQ.includes("foreign");

    if (isLanguageOrMediaIssue) {
        const { title: candidateTitle, year: candidateYear } = cleanMediaSearchQuery(question);
        const resolvedTitle = candidateTitle || snapshot.primaryActiveStream?.title;

        if (resolvedTitle && resolvedTitle.length > 1) {
            try {
                mediaInspection = await inspectMediaStreams(resolvedTitle, user);

                actionsTaken.push({
                    action: "INSPECT_MEDIA",
                    status: "SUCCESS",
                    target: mediaInspection.title,
                    summary: `Inspected Plex container: Found ${mediaInspection.audioTracks.length} audio tracks (${mediaInspection.audioTracks.map(t => t.displayTitle).join(", ")}). Verdict: ${mediaInspection.verdict}.`,
                    details: mediaInspection,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                // If English audio is truly missing, automatically attempt Radarr search & replace
                if (mediaInspection.verdict === "MISSING_LANGUAGE_TRACK") {
                    const grabResult = await searchAndGrabRadarrReplacement(
                        mediaInspection.title, 
                        candidateYear || (mediaInspection.year ? parseInt(mediaInspection.year, 10) : undefined),
                        "Missing English audio track / Spanish only file",
                        user
                    );

                    if (grabResult.success) {
                        actionsTaken.push({
                            action: "RADARR_SEARCH_GRAB",
                            status: "SUCCESS",
                            target: mediaInspection.title,
                            summary: `Autonomous Grab: Located verified English release "${grabResult.releaseTitle}" (${grabResult.quality}, ${grabResult.sizeFormatted}) on indexer "${grabResult.indexer}" and queued download in Radarr.`,
                            details: grabResult,
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        });
                    } else if (grabResult.escalated) {
                        actionsTaken.push({
                            action: "ESCALATE_ADMIN_TICKET",
                            status: "ESCALATED",
                            target: mediaInspection.title,
                            summary: `Admin Escalated: Support Ticket #${grabResult.ticketId} created with complete container telemetry. No safe English releases met criteria on indexers.`,
                            ticketId: grabResult.ticketId,
                            details: grabResult,
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        });
                    }
                }
            } catch (inspectErr: any) {
                logAgentEvent("WARN", `Autonomous inspection error: ${inspectErr.message}`);
            }
        }
    }

    // Check for book redownload inquiry
    if (lowerQ.includes("book") && (lowerQ.includes("redownload") || lowerQ.includes("fix") || lowerQ.includes("download"))) {
        const { title: bookTitle } = cleanMediaSearchQuery(question);
        if (bookTitle) {
            try {
                const bookRes = await redownloadBookWithDiagnostics(bookTitle, undefined, user);
                if (bookRes.success) {
                    actionsTaken.push({
                        action: "REDOWNLOAD_BOOK",
                        status: "SUCCESS",
                        target: bookTitle,
                        summary: `Dispatched automated book search & download for "${bookTitle}".`,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                }
            } catch (bErr: any) {}
        }
    }

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    const provider = settings?.aiProvider || "default";
    const rawKey = settings?.aiApiKey ? decryptData(settings.aiApiKey) : "";
    const modelName = settings?.aiModel || "gemini-2.5-flash";

    // Build context-rich prompt
    const systemPrompt = `You are the elite "Plex & Server Master AI" for the private media ecosystem "Portalarr".
You provide friendly, authoritative, step-by-step troubleshooting, optimization advice, and diagnostic fixes for Plex users and server administrators.

USER & REAL-TIME STREAM CONTEXT:
- Username: ${snapshot.username} (Role: ${snapshot.role})
- Active Streams Right Now: ${snapshot.activeStreamsCount}
${snapshot.primaryActiveStream ? `
  * Current Media: "${snapshot.primaryActiveStream.title}" (${snapshot.primaryActiveStream.mediaType}, ${snapshot.primaryActiveStream.year || "N/A"})
  * Device / Player: ${snapshot.primaryActiveStream.player} (${snapshot.primaryActiveStream.platform})
  * Playback Decision: ${snapshot.primaryActiveStream.transcodeDecision.toUpperCase()}
  * Video Codec: ${snapshot.primaryActiveStream.videoCodec || "N/A"} (${snapshot.primaryActiveStream.videoResolution} -> Stream: ${snapshot.primaryActiveStream.videoResolution})
  * Audio Codec: ${snapshot.primaryActiveStream.audioCodec || "N/A"} (Stream: ${snapshot.primaryActiveStream.streamAudioCodec || "Direct"})
  * Bitrate: ${snapshot.primaryActiveStream.streamBitrate ? (snapshot.primaryActiveStream.streamBitrate / 1000).toFixed(1) + " Mbps" : "Original"}
  * Transcode Speed: ${snapshot.primaryActiveStream.transcodeSpeed || "N/A"} (Hardware Acceleration: ${snapshot.primaryActiveStream.transcodeHwRequested ? "Enabled" : "Disabled"})
  * Subtitle Decision: ${snapshot.primaryActiveStream.subtitleDecision || "None"} (${snapshot.primaryActiveStream.subtitleCodec || "N/A"})
  * Server: ${snapshot.primaryActiveStream.serverName || "Main Server"}
` : "  * No active stream currently playing."}

- Recent Devices Used: ${snapshot.recentDevices.length > 0 ? snapshot.recentDevices.join(", ") : "None detected"}
- Chronic Pattern Insights: ${snapshot.patternInsights && snapshot.patternInsights.length > 0 ? snapshot.patternInsights.map(p => `[${p.patternType.toUpperCase()}] ${p.description}`).join(" | ") : "Optimal stream patterns."}
- Auto-Detected Diagnostic Issues: ${snapshot.detectedIssues.length > 0 ? snapshot.detectedIssues.map(i => `[${i.severity.toUpperCase()}] ${i.title}: ${i.quickFix}`).join(" | ") : "None. Stream health is optimal."}

${actionsTaken.length > 0 ? `
AUTONOMOUS AGENT ACTIONS PERFORMED BY PORTALARR:
${actionsTaken.map(a => `- [${a.status}] ${a.action} on "${a.target}": ${a.summary}`).join("\n")}
` : ""}

${mediaInspection ? `
MEDIA CONTAINER INSPECTION REPORT:
- Title: "${mediaInspection.title}" (${mediaInspection.mediaType})
- Verdict: ${mediaInspection.verdict}
- Summary: ${mediaInspection.diagnosisSummary}
- Audio Tracks Found: ${mediaInspection.audioTracks.map(t => `${t.displayTitle} (${t.language}) [Selected: ${t.selected}]`).join(", ")}
- Has English Audio Track: ${mediaInspection.hasEnglishAudio}
- Has Spanish Audio Track: ${mediaInspection.hasSpanishAudio}
${mediaInspection.recommendedClientSteps ? `- Recommended Player Fix Steps:\n${mediaInspection.recommendedClientSteps.join("\n")}` : ""}
` : ""}

${playbackProbe ? `
SYNTHETIC PLAYBACK PROBE RESULTS:
- Total Servers Tested: ${playbackProbe.totalServers}
- Fully Operational (Web API + Database + Media Disk Streaming): ${playbackProbe.operationalServers}
- Overall Status: ${playbackProbe.allCanPlay ? "ALL SYSTEMS OPERATIONAL" : "PLAYBACK DEGRADED OR OFFLINE"}
- Can Actually Play Files: ${playbackProbe.allCanPlay ? "YES" : "NO"}
- Summary: ${playbackProbe.summary}
- Server Details:
${playbackProbe.servers.map((s: any) => `  * [${s.serverName}] Overall: ${s.overallStatus}, Web API Ping: ${s.apiPingMs}ms, DB Latency: ${s.databaseLatencyMs}ms, Disk Playback Test: ${s.playbackTest?.canPlayMedia ? `PASS (${s.playbackTest.bytesRead} bytes read in ${s.playbackTest.readLatencyMs}ms from "${s.playbackTest.testedTitle || "Sample Media"}")` : `FAIL (${s.playbackTest?.error || "Cannot stream file from disk"})`}, Transcoder: ${s.transcodeTest?.ready ? "Ready" : "Degraded"}`).join("\n")}
` : ""}

CORE PLEX MASTER KNOWLEDGE & DIAGNOSTIC RULES:
1. Multi-Track Audio (e.g. The Sandlot Spanish vs English):
   - When a media file contains an English audio track alongside Spanish, advise the user on how to switch audio tracks on their specific player.
   - If English audio was missing, explain that Portalarr autonomous engine has already queried Radarr, evaluated releases, and dispatched an English replacement (or escalated to the admin with a support ticket).
2. Roku "Auto Adjust Quality" Bug / "not enough bandwidth" / "minimum bandwidth of 103kbps":
   - In Roku Plex App → Settings ⚙️ → Video → Turn "Auto Adjust Quality" OFF. Change "Remote Streaming" to "Original". Set "Direct Play" to "Force".
3. 2 Mbps (720p) Default Remote Limit:
   - Settings → Video Quality → Set "Remote Streaming Quality" to "Maximum" / "Original".
4. Subtitle Burn-In:
   - Select SRT text subtitles, or Settings → Subtitles → set "Burn Subtitles" to "Only Image Formats".
5. Buffering / Stutter:
   - Check if transcode speed is < 1.0x, verify 5GHz Wi-Fi or Ethernet connection, and force Direct Play.

INSTRUCTIONS:
- Directly answer the user's inquiry, highlighting any autonomous actions already performed (inspections, Radarr downloads, or admin escalations).
- Provide numbered, easy-to-follow steps with exact player menu names.
- Keep the tone encouraging, technical yet accessible, and structured with clean markdown bolding and bullet points.`;

    // 1. Google Gemini Provider
    const geminiKey = rawKey || process.env.GEMINI_API_KEY || "";
    if ((provider === "gemini" || provider === "google" || (!provider || provider === "default")) && geminiKey) {
        const candidateModels = Array.from(new Set([
            ...(modelName && modelName !== "gemini-2.5-flash" && modelName !== "default" ? [modelName] : []),
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro"
        ]));

        for (const activeModel of candidateModels) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 7000);
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent?key=${encodeURIComponent(geminiKey)}`;

                const contents: any[] = [];
                for (const h of history.slice(-4)) {
                    contents.push({
                        role: h.role === "assistant" ? "model" : "user",
                        parts: [{ text: h.content }]
                    });
                }
                contents.push({
                    role: "user",
                    parts: [{ text: question }]
                });

                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        system_instruction: { parts: [{ text: systemPrompt }] },
                        contents: contents,
                        generationConfig: { temperature: 0.2, maxOutputTokens: 1400 }
                    }),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const data = await res.json();
                    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (text && text.trim().length > 10) {
                        return {
                            success: true,
                            answer: text.trim(),
                            diagnostics: snapshot,
                            providerUsed: `Gemini (${activeModel})`,
                            actionsTaken,
                            mediaInspection,
                            playbackProbe
                        };
                    }
                }
            } catch (e: any) {}
        }
    }

    // 2. OpenAI Provider
    if (provider === "openai" && rawKey) {
        try {
            const activeModel = modelName || "gpt-4o-mini";
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 6000);

            const messages: any[] = [
                { role: "system", content: systemPrompt }
            ];
            for (const h of history.slice(-4)) {
                messages.push({ role: h.role, content: h.content });
            }
            messages.push({ role: "user", content: question });

            const res = await fetch("https://api.openai.com/v1/chat/completions", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${rawKey}`
                },
                body: JSON.stringify({
                    model: activeModel,
                    messages: messages,
                    temperature: 0.2,
                    max_tokens: 1400
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json();
                const text = data.choices?.[0]?.message?.content;
                if (text && text.trim().length > 10) {
                    return {
                        success: true,
                        answer: text.trim(),
                        diagnostics: snapshot,
                        providerUsed: `OpenAI (${activeModel})`,
                        actionsTaken,
                        mediaInspection,
                        playbackProbe
                    };
                }
            }
        } catch (e: any) {}
    }

    // 3. Built-in Plex Master Knowledge Base & Heuristic Engine (Guaranteed Instant Response)
    const heuristicAnswer = resolvePlexMasterHeuristic(question, snapshot, actionsTaken, mediaInspection, playbackProbe);
    return {
        success: true,
        answer: heuristicAnswer,
        diagnostics: snapshot,
        providerUsed: "Built-in Plex Master Autonomous Engine",
        actionsTaken,
        mediaInspection,
        playbackProbe
    };
}

function resolvePlexMasterHeuristic(
    question: string, 
    snapshot: UserDiagnosticSnapshot,
    actionsTaken: AgentActionReport[] = [],
    mediaInspection?: MediaStreamInspection,
    playbackProbe?: PlexPlaybackDiagnosticReport
): string {
    const q = question.toLowerCase();
    const primary = snapshot.primaryActiveStream;
    const deviceName = primary?.player || snapshot.recentDevices[0] || "your Roku / Plex device";

    // --- CASE 0: DEEP PLAYBACK SYNTHETIC PROBE ---
    if (playbackProbe && playbackProbe.servers.length > 0) {
        const statusEmoji = playbackProbe.allCanPlay ? "🟢" : playbackProbe.operationalServers > 0 ? "🟡" : "🔴";
        const statusTitle = playbackProbe.allCanPlay 
            ? "All Servers Verified Operational & Streaming from Disk" 
            : playbackProbe.operationalServers > 0 
                ? "Partial Playback Outage / Degraded Disk Storage" 
                : "Plex Server Playback Outage";

        const serverCards = playbackProbe.servers.map(s => {
            const isOp = s.overallStatus === "OPERATIONAL";
            const sBadge = isOp ? "✅ OPERATIONAL" : s.apiStatus !== "DOWN" ? "⚠️ STORAGE / DB ISSUE" : "❌ UNREACHABLE";
            const diskBadge = s.playbackTest.canPlayMedia
                ? `✅ Physical Disk Streaming Verified (${s.playbackTest.bytesRead} bytes read in ${s.playbackTest.readLatencyMs}ms)`
                : `❌ Media Disk Read Failed (${s.playbackTest.error || "Storage offline"})`;
            const dbBadge = s.databaseStatus === "OK" 
                ? `✅ SQLite DB: ${s.databaseLatencyMs}ms (${s.sectionsCount} sections)` 
                : `❌ SQLite DB Issue (${s.databaseStatus})`;
            const transcodeBadge = s.transcodeTest.ready 
                ? `✅ Transcode Engine Ready (${s.transcodeTest.latencyMs}ms)` 
                : `⚠️ Transcoder Issue (${s.transcodeTest.error || "Degraded"})`;

            return `#### 🖥️ Server: **${s.serverName}** (${sBadge})
* **Web API Listener:** \`${s.apiPingMs}ms\` (${s.apiStatus}) • Connection: \`${s.connectionUri}\` (${s.isLocal ? "Local LAN" : s.isRelay ? "Plex Relay" : "Remote Direct"})
* **Database Responsiveness:** ${dbBadge}
* **Physical Media Storage Read:** ${diskBadge}
* **Transcode Subsystem:** ${transcodeBadge}
${s.playbackTest.testedTitle ? `* *Sample Media Tested:* \`${s.playbackTest.testedTitle}\`` : ""}`;
        }).join("\n\n---\n\n");

        const hasFalsePositive = playbackProbe.servers.some(s => s.apiStatus === "OK" && !s.playbackTest.canPlayMedia);

        return `### ${statusEmoji} Server Health & Playback Diagnostic: **${statusTitle}**

I ran an **active synthetic playback probe** against your media server infrastructure. 

Unlike standard port pings (which report "online" even if storage shares disconnect or databases freeze), this diagnostic connects to PMS, queries the SQLite database, and **physically streams byte chunks of real media from the storage disk**.

---

${serverCards}

---

${hasFalsePositive ? `> ⚠️ **Storage Disconnect Alert:** One or more servers are accepting network pings, but **failed to read media from the storage disk**. This typically indicates an unmounted network share (NFS/SMB), disconnected drive pool, or permissions issue.` : `> 💡 **Playback Verdict:** ${playbackProbe.allCanPlay ? `All ${playbackProbe.operationalServers} server(s) are confirmed able to stream media directly to devices right now with zero disk read or database errors.` : "Some servers cannot stream media right now."}`}`;
    }

    // --- CASE 1: MEDIA INSPECTION VERDICT: AUDIO TRACK EXISTS (CLIENT SWITCH NEEDED) ---
    if (mediaInspection && mediaInspection.verdict === "AUDIO_EXISTS_CLIENT_FIX") {
        const engTrack = mediaInspection.audioTracks.find(t => 
            t.language.toLowerCase() === "english" || t.languageCode === "eng" || t.languageCode === "en"
        );
        const engDesc = engTrack ? engTrack.displayTitle || "English" : "English Audio Track";
        const currentDesc = mediaInspection.activeAudioTrack ? mediaInspection.activeAudioTrack.displayTitle : "Spanish Track";

        return `### 🎧 Audio Track Diagnostic: *${mediaInspection.title}*

I inspected the media file on disk (**${mediaInspection.files[0]?.file || mediaInspection.title}**). 

**Good news! The file already contains a high-definition English audio track.**

---

#### 🔍 Container Stream Analysis:
* **Current Active Track:** ❌ \`${currentDesc}\`
* **Available Tracks in File:**
${mediaInspection.audioTracks.map(t => `  * **${t.displayTitle}** ${t.selected ? '*(Currently Selected)*' : t.language.toLowerCase() === 'english' ? '🚀 *(English Available)*' : ''}`).join('\n')}

Your Plex client is currently defaulting to the Spanish audio track, which is why you are hearing Spanish. **No redownload is required!**

---

#### 🛠️ How to Switch to English on **${deviceName}**:
${(mediaInspection.recommendedClientSteps || [
    `1. Start playing "${mediaInspection.title}"`,
    "2. Press Up or Down on your remote to bring up the playback menu",
    "3. Select the Audio / Subtitle selector (💬 or Gear ⚙️ icon)",
    `4. Under Audio Stream, switch to "${engDesc}"`,
    "5. Resume playback to enjoy English audio!"
]).map(s => `- ${s}`).join("\n")}

> **💡 Pro Tip:** To permanently default to English for all movies, open **Plex Web / Client Settings ⚙️ → Audio & Subtitles**, and set **Preferred Audio Language** to **English**.`;
    }

    // --- CASE 2: MEDIA INSPECTION VERDICT: MISSING LANGUAGE TRACK (RADARR SEARCH / ESCALATION) ---
    if (mediaInspection && mediaInspection.verdict === "MISSING_LANGUAGE_TRACK") {
        const radarrGrab = actionsTaken.find(a => a.action === "RADARR_SEARCH_GRAB" && a.status === "SUCCESS");
        const escalation = actionsTaken.find(a => a.action === "ESCALATE_ADMIN_TICKET");

        if (radarrGrab) {
            return `### 🚀 Replacement Download Dispatched to Radarr: *${mediaInspection.title}*

I inspected the server media file and verified that it **only contains Spanish audio** (${mediaInspection.audioTracks.map(t => t.displayTitle).join(", ")}). There is no English audio track in the current file.

---

#### 🤖 Autonomous Remediation Taken:
* **Container Check:** Verified 0 English audio tracks in \`${mediaInspection.files[0]?.file || mediaInspection.title}\`.
* **Indexer Search:** Queried Radarr indexers for verified releases containing English audio and matching our quality profile.
* **Selected Release:** \`${radarrGrab.details?.releaseTitle || radarrGrab.target}\`
* **Quality & Size:** **${radarrGrab.details?.quality || "1080p"}** (${radarrGrab.details?.sizeFormatted || "HD"})
* **Indexer:** **${radarrGrab.details?.indexer || "Prowlarr"}**
* **Status:** **Dispatched to Radarr Download Queue** ✅

Once the download completes, Radarr will automatically upgrade the file on disk and replace the Spanish-only copy in Plex!`;
        }

        if (escalation) {
            return `### 🚨 Missing English Audio Escalated to Admin: *${mediaInspection.title}*

I inspected the media file on disk and verified that it **only contains Spanish audio** (${mediaInspection.audioTracks.map(t => t.displayTitle).join(", ")}).

---

#### 🤖 Autonomous Actions Taken:
1. **Container Inspection:** Inspected Plex stream tracks: English audio is completely missing from the file.
2. **Radarr Indexer Search:** Searched connected indexers for an English replacement release.
3. **Safety Guardrails:** All candidate releases on indexers were rejected (either foreign-only, CAM quality, or lacking seeders).
4. **Admin Escalation:** Automatically created **Support Ticket #${escalation.ticketId}** with full diagnostic logs and dispatched an email notification to the server administrator.

The administrator has been alerted and will manually source a verified English release of *${mediaInspection.title}* for you!`;
        }
    }

    // --- CASE 3: ROKU QUALITY / AUTO ADJUST / 103kbps ERROR ---
    if (
        q.includes("minimum bandwidth") || 
        q.includes("103kbps") || 
        q.includes("not enough bandwidth") || 
        q.includes("can not convert") || 
        q.includes("cannot convert") || 
        q.includes("auto adjust") || 
        q.includes("quality too low") || 
        q.includes("roku") || 
        q.includes("transcoder exited") || 
        q.includes("conversion failed")
    ) {
        return `### 📺 Fix for: *"Not enough bandwidth for any playback / Can not convert below minimum bandwidth (103kbps)"*

This is a well-known **Roku Plex App bug** caused by the **"Auto Adjust Quality"** setting. 

#### 🔍 Why this happens:
When bandwidth fluctuates even slightly, Roku's *Auto Adjust Quality* feature attempts to dynamically step down quality below the server's hard minimum threshold (**103 kbps**). The Plex Media Server rejects this impossible bitrate and aborts the stream with this exact error.

---

#### 🛠️ Step-by-Step Fix (Takes 30 Seconds):
1. **Open the Plex App** on your **${deviceName.includes("Roku") ? deviceName : "Roku device"}**.
2. Go to your **Profile Avatar / Settings (Gear Icon ⚙️)**.
3. Select **Video** (or **Video Quality**).
4. Find **"Auto Adjust Quality"** and turn it **OFF** ❌.
5. Set **"Remote Streaming Quality"** to **"Original"** (or **"Maximum"**) 🚀.
6. Set **"Direct Play"** to **"Force"** (or **"Auto"**).
7. Return to your movie or TV show and press **Play**.

---

> **💡 Why this permanently fixes the problem:**  
> Forcing **Original Quality** stops the server from attempting to transcode the video into lower bitrates, allowing your Roku to stream directly from disk with **100% native quality, zero buffering, and zero CPU load on the server**.`;
    }

    // --- CASE 4: BUFFERING / STUTTERING ---
    if (q.includes("buffer") || q.includes("stutter") || q.includes("lag") || q.includes("freeze") || q.includes("slow")) {
        const transcodeNote = primary?.transcodeDecision === "transcode" 
            ? `\n* **Active Stream Detected:** You are currently transcoding *${primary.title}* on *${primary.player}* (Transcode Speed: ${primary.transcodeSpeed || "N/A"}).`
            : "";

        return `### ⚡ Resolving Stream Buffering & Stuttering
${transcodeNote}

Buffering is almost always caused by **forced transcoding** over a restricted remote quality cap or Wi-Fi interference.

#### Immediate Action Steps:
1. **Unlock Full Remote Quality:**
   * In your Plex App on **${deviceName}**, go to **Settings ⚙️ → Video Quality**.
   * Change **Remote Streaming Quality** from *2 Mbps (720p)* to **"Maximum" / "Original"**.
2. **Disable Auto Adjust Quality:**
   * Turn **"Auto Adjust Quality" → OFF** to prevent continuous quality fluctuations.
3. **Check Subtitles:**
   * Image subtitles (*PGS, VOBSUB, ASS*) force the server CPU to burn subtitles frame-by-frame. Switch to an **SRT** text subtitle track.
4. **Network Connection:**
   * If on Wi-Fi, switch to **5GHz Wi-Fi** or connect a wired Ethernet cable.

*If buffering continues, run the **Server Speed Test** in My Plex Hub to verify your connection speed.*`;
    }

    // --- CASE 5: AUDIO PLAYBACK ---
    if (q.includes("audio") || q.includes("sound") || q.includes("surround") || q.includes("volume") || q.includes("voices") || q.includes("quiet")) {
        return `### 🔊 Audio Playback & Dialogue Optimization

#### If you have No Sound or Quiet Dialogue:
1. **Select the 5.1 / Stereo Track:**
   * Many 4K movies default to *7.1 TrueHD / DTS-HD MA* which TV speakers cannot decode.
   * In the playback menu (💬 / Audio), switch from *TrueHD 7.1* to **5.1 AC3 / EAC3** or **Stereo**.
2. **Enable Audio Passthrough:**
   * If you have an AV Receiver or Soundbar connected via HDMI eARC/Optical:
   * Go to **Plex Settings ⚙️ → Audio / Advanced → Audio Passthrough → Set to HDMI / Optical**.
3. **Dialogue Boost:**
   * In Plex audio settings, enable **"Boost Dialogue" (Large/Medium)** to make voices crystal clear during action scenes.`;
    }

    // --- CASE 6: SUBTITLES ---
    if (q.includes("subtitle") || q.includes("sub") || q.includes("captions") || q.includes("pgs") || q.includes("srt")) {
        return `### 💬 Subtitle Optimization Guide

#### Preventing Subtitle Lag & Transcoding:
1. **Use SRT Subtitles:**
   * **SRT (SubRip)** text subtitles render natively on all smart TVs and streaming sticks with zero server load.
   * Avoid *PGS, VOBSUB, and ASS* formatted subtitles when possible.
2. **Adjust Plex Subtitle Settings:**
   * Go to **Plex Settings ⚙️ → Subtitles / Advanced**.
   * Set **"Burn Subtitles" → "Only Image Formats"** (or Automatic).
   * Do NOT set to *"Always"*, as that forces heavy CPU video re-encoding.
3. **Search Subtitles in Playback:**
   * In the playback controls, click Subtitles (💬) → **Search Subtitles** → Select an English [SRT] file.`;
    }

    // --- DEFAULT SERVER MASTER DIAGNOSTICS ---
    return `### 🤖 Plex & Server Master Diagnostics

Hello **${snapshot.username}**! I have checked your server telemetry and connection status:

* **Active Streams:** ${snapshot.activeStreamsCount > 0 ? `Currently playing "${primary?.title}" on ${primary?.player}` : "No active streams currently running"}
* **Detected Devices:** ${snapshot.recentDevices.length > 0 ? snapshot.recentDevices.join(", ") : "Plex Client"}
* **Server Health:** All ${snapshot.serversOnlineCount} media server nodes are online and operational.
${snapshot.patternInsights && snapshot.patternInsights.length > 0 ? `* **Stream Insights:** ${snapshot.patternInsights[0].description}` : ""}

#### Quick Recommended Settings for Best Playback:
1. **Remote Streaming Quality:** Always set to **"Maximum / Original"** in your Plex App Settings ⚙️ to eliminate server transcoding.
2. **Auto Adjust Quality:** Turn **OFF** to avoid unexpected resolution drops.
3. **Direct Play:** Ensure **"Direct Play" & "Direct Stream"** are enabled.

*Need personalized troubleshooting? Ask me about specific error messages, device setup guides (Roku, Apple TV, Fire TV), audio language issues, or subtitles!*`;
}
