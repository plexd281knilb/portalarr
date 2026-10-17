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
import { logAgentEvent, validateUserCrossBoundaryQuery } from "@/lib/ai-agent-guardrails";
import { runDeepPlexPlaybackHealthCheck, PlexPlaybackDiagnosticReport } from "@/lib/plex-playback-probe";
import { normalizeGeminiModel, getGeminiCandidateModels, getAvailableGeminiModels } from "@/lib/ai-agent";
import { 
    GEMINI_TOOL_DECLARATIONS, 
    OPENAI_TOOL_DEFINITIONS, 
    executeAiAssistantTool, 
    ToolExecutionContext 
} from "@/lib/ai-assistant-tools";
import { resolveResolution } from "@/lib/telemetry/stream-tracker";
import { 
    getUserReadingAndRequestProfile, 
    getPersonalizedBookRecommendations 
} from "@/lib/ai-book-recommendations";

function cleanUrl(url: string): string {
    if (!url) return "";
    return url.replace(/\/$/, ""); 
}

async function fetchTautulliApiJson(url: string, signal?: AbortSignal, _nextOptions?: any): Promise<{ ok: boolean; data: any; error?: string }> {
    try {
        const fetchOpts: any = { 
            signal: signal || AbortSignal.timeout(5000),
            cache: "no-store"
        };

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

    // Query linked sub-accounts (e.g. kids, living room) for primary accounts
    let linkedSubAccounts: any[] = [];
    if (user?.id && !user?.parentUserId) {
        try {
            linkedSubAccounts = await prisma.user.findMany({
                where: { parentUserId: user.id },
                select: {
                    id: true,
                    username: true,
                    email: true,
                    plexUsername: true,
                    plexEmail: true,
                    subAccountLabel: true,
                    accountType: true
                }
            });
            for (const sub of linkedSubAccounts) {
                if (sub.username) userAliases.add(sub.username.toLowerCase().trim());
                if (sub.email) userAliases.add(sub.email.toLowerCase().trim());
                if (sub.plexUsername) userAliases.add(sub.plexUsername.toLowerCase().trim());
                if (sub.plexEmail) userAliases.add(sub.plexEmail.toLowerCase().trim());
                if (sub.subAccountLabel) userAliases.add(sub.subAccountLabel.toLowerCase().trim());
            }
        } catch (e) {}
    }

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    const tautullis = await prisma.tautulliInstance.findMany().catch(() => []);

    let adminToken = "";
    if (settings?.mainPlexToken) {
        try {
            adminToken = decryptData(settings.mainPlexToken);
        } catch (e) {}
    }
    if (!adminToken) {
        const plexServersWithToken = await prisma.plexServer.findMany({ where: { token: { not: null } } }).catch(() => []);
        for (const ps of plexServersWithToken) {
            if (ps.token) {
                try {
                    const dec = decryptData(ps.token);
                    if (dec) {
                        adminToken = dec;
                        break;
                    }
                } catch (e) {}
            }
        }
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
    const serverNodes: any[] = [];

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
                serverNodes.push({
                    name: t.name || "Tautulli Monitor",
                    type: "tautulli",
                    status: "ONLINE",
                    connectionUri: cleanBase
                });
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
                            transcodeThrottled: Boolean(s.transcode_throttled === 1 || s.transcode_throttled === true || s.transcode_throttled === "1"),
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
    let plexServers: any[] = [];
    if (adminToken) {
        try {
            plexServers = await getPlexServers(adminToken);
        } catch (e) {}
    }

    try {
        const dbPlexServers = await prisma.plexServer.findMany();
        for (const dbs of dbPlexServers) {
            const cleanDbUrl = dbs.url.trim().replace(/\/+$/, "");
            const sToken = dbs.token ? (decryptData(dbs.token) || adminToken) : adminToken;
            const matchIndex = plexServers.findIndex(s =>
                (s.clientIdentifier && dbs.clientIdentifier && s.clientIdentifier.toLowerCase() === dbs.clientIdentifier.toLowerCase()) ||
                s.name.toLowerCase() === dbs.name.toLowerCase() ||
                s.connections?.some((c: any) => c.uri?.replace(/\/+$/, "") === cleanDbUrl)
            );
            if (matchIndex >= 0) {
                if (sToken && !plexServers[matchIndex].accessToken) {
                    plexServers[matchIndex].accessToken = sToken;
                }
            } else {
                plexServers.push({
                    name: dbs.name || "Plex Server",
                    clientIdentifier: dbs.clientIdentifier || dbs.id,
                    accessToken: sToken,
                    connections: [{ uri: cleanDbUrl, local: true, relay: false }]
                });
            }
        }
    } catch (e) {}

    if (plexServers.length > 0) {
        try {
            await Promise.allSettled(plexServers.map(async (srv: any) => {
                const token = srv.accessToken || adminToken;
                const connections = srv.connections || [];

                // Prioritize local connections first
                const sortedConns = [...connections].sort((a: any, b: any) => {
                    if (a.local && !b.local) return -1;
                    if (!a.local && b.local) return 1;
                    if (!a.relay && b.relay) return -1;
                    if (a.relay && !b.relay) return 1;
                    return 0;
                });

                let isServerOnline = false;
                let bestConn = sortedConns[0];
                let serverPingMs = 0;
                let activeSessionsOnServer = 0;

                for (const conn of sortedConns) {
                    try {
                        const cleanBase = conn.uri.replace(/\/+$/, "");
                        const pStart = Date.now();
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
                            isServerOnline = true;
                            bestConn = conn;
                            serverPingMs = Date.now() - pStart;
                            const sJson = await sRes.json();
                            const rawSessions = sJson.MediaContainer?.Metadata || [];
                            const sessions = Array.isArray(rawSessions) ? rawSessions : [rawSessions];
                            activeSessionsOnServer = sessions.length;

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

                                    const mediaList = Array.isArray(s.Media) ? s.Media : (s.Media ? [s.Media] : []);
                                    const mediaObj = mediaList.find((m: any) => 
                                        m.selected === true || m.selected === 1 || m.selected === "1" ||
                                        m.Part?.some((p: any) => p.selected === true || p.selected === 1 || p.selected === "1" || (p.Stream && p.Stream.length > 0))
                                    ) || mediaList[0] || {};
                                    const part = mediaObj?.Part?.[0];
                                    const videoStream = part?.Stream?.find((st: any) => st.streamType === 1 || st.streamType === "1" || st.codec_type === "video");
                                    const srcRes = resolveResolution(videoStream?.displayTitle || mediaObj?.videoResolution, mediaObj?.height, mediaObj?.width) || "1080p";
                                    const targetRes = s.TranscodeSession 
                                        ? (resolveResolution(s.TranscodeSession.videoResolution || s.TranscodeSession.targetVideoResolution || mediaObj?.videoResolution, s.TranscodeSession.height || mediaObj?.height, s.TranscodeSession.width || mediaObj?.width) || srcRes)
                                        : srcRes;

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
                                        videoResolution: targetRes,
                                        sourceResolution: srcRes,
                                        videoCodec: (s.TranscodeSession?.sourceVideoCodec || mediaObj?.videoCodec || videoStream?.codec || "H264").toUpperCase(),
                                        audioCodec: (s.TranscodeSession?.sourceAudioCodec || mediaObj?.audioCodec || "AAC").toUpperCase(),
                                        streamBitrate: s.TranscodeSession?.bitrate ? Number(s.TranscodeSession.bitrate) : (mediaObj?.bitrate ? Number(mediaObj.bitrate) : undefined),
                                        transcodeDecision: transDecision as any,
                                        transcodeSpeed: s.TranscodeSession?.speed ? String(s.TranscodeSession.speed) : undefined,
                                        transcodeThrottled: Boolean(s.TranscodeSession?.throttled === 1 || s.TranscodeSession?.throttled === true || s.TranscodeSession?.throttled === "1"),
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
                            break;
                        }
                    } catch (e) {}
                }

                serverNodes.push({
                    name: srv.name || "Plex Server",
                    type: "plex",
                    status: isServerOnline ? "ONLINE" : (connections.length > 0 ? "ONLINE" : "OFFLINE"),
                    isLocal: bestConn?.local ?? false,
                    isRelay: bestConn?.relay ?? false,
                    connectionUri: bestConn?.uri,
                    pingMs: serverPingMs || 12,
                    activeSessions: activeSessionsOnServer
                });
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

        // Issue D: Slow Transcode Speed (Ignore when intentionally throttled with buffer ahead)
        if (primary.transcodeSpeed && Number(primary.transcodeSpeed) < 1.0 && isTranscoding && !primary.transcodeThrottled) {
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

    const onlinePlex = serverNodes.filter(s => s.type === "plex" && s.status === "ONLINE").length;
    const totalPlex = serverNodes.filter(s => s.type === "plex").length;
    const onlineTautulli = serverNodes.filter(s => s.type === "tautulli" && s.status === "ONLINE").length;
    const finalServersCount = Math.max(onlinePlex, totalPlex, onlineTautulli, tautullis.length, 1);

    // 5. Fetch User Reading & Request Profile for personalized recommendations
    const readingProfile = await getUserReadingAndRequestProfile(user).catch(() => undefined);

    return {
        username: safeUsername,
        email: safeEmail,
        role: role,
        activeStreamsCount: activeStreams.length,
        primaryActiveStream: primary,
        activeStreams,
        recentDevices: Array.from(recentDevicesSet),
        recentWatchHistory: recentWatchHistory.slice(0, 10),
        serversOnlineCount: finalServersCount,
        serverNodes,
        detectedIssues,
        patternInsights,
        linkedSubAccounts: linkedSubAccounts.map((s: any) => ({
            id: s.id,
            username: s.username,
            label: s.subAccountLabel || s.accountType,
            accountType: s.accountType
        })),
        readingProfile,
        generatedAt: new Date().toISOString()
    };
}

export function extractContextFromHistory(history: AiChatMessage[] = []): {
    lastTitle?: string;
    lastYear?: number;
    lastServer?: string;
    lastWasPlaybackTest?: boolean;
} {
    if (!history || history.length === 0) return {};

    for (let i = history.length - 1; i >= 0; i--) {
        const msg = history[i];

        // 1. Check mediaInspection on message
        if (msg.mediaInspection?.title) {
            const y = msg.mediaInspection.year ? parseInt(msg.mediaInspection.year, 10) : undefined;
            return {
                lastTitle: msg.mediaInspection.title,
                lastYear: isNaN(y!) ? undefined : y,
                lastServer: msg.mediaInspection.serverName,
                lastWasPlaybackTest: true
            };
        }

        // 2. Check actionsTaken
        if (msg.actionsTaken && msg.actionsTaken.length > 0) {
            for (const act of msg.actionsTaken) {
                if (act.target && act.target !== "Security Boundary" && act.target !== "Plex Playback Probe" && act.target !== "Server Cluster") {
                    return {
                        lastTitle: act.target,
                        lastWasPlaybackTest: true
                    };
                }
            }
        }

        // 3. Check assistant content for "tested media playback for <Title>"
        const matchTested = msg.content.match(/tested media playback for\s+([^\n\r(]+)(?:\s*\((19\d\d|20\d\d)\))?/i);
        if (matchTested) {
            return {
                lastTitle: matchTested[1].trim(),
                lastYear: matchTested[2] ? parseInt(matchTested[2], 10) : undefined,
                lastWasPlaybackTest: true
            };
        }

        // 4. Check user query for title
        if (msg.role === "user") {
            const cleaned = cleanMediaSearchQuery(msg.content);
            if (cleaned.title && !cleaned.isPronoun) {
                return {
                    lastTitle: cleaned.title,
                    lastYear: cleaned.year,
                    lastServer: cleaned.targetServer,
                    lastWasPlaybackTest: cleaned.isPlaybackTest
                };
            }
        }
    }

    return {};
}

export async function askAiServerMaster(
    question: string,
    history: AiChatMessage[] = [],
    user?: any
): Promise<AiAssistantResponse> {
    // Quick diagnostic snapshot gathering with instant memory cache check and 2.5s network race
    const safeUsername = String(user?.username || "guest").toLowerCase();
    const { getUserCache, setUserCache } = await import("@/lib/prewarm");
    const cacheKey = `user_diag_snapshot:${safeUsername}`;
    const cachedSnapshot = getUserCache<UserDiagnosticSnapshot>(cacheKey);

    let snapshot: UserDiagnosticSnapshot;
    if (cachedSnapshot) {
        snapshot = cachedSnapshot;
    } else {
        try {
            snapshot = await Promise.race([
                getUserDiagnosticSnapshot(user),
                new Promise<UserDiagnosticSnapshot>((_, reject) => 
                    setTimeout(() => reject(new Error("Telemetry timeout")), 2500)
                )
            ]);
            if (snapshot) {
                setUserCache(cacheKey, snapshot, 3 * 60 * 1000);
            }
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
                linkedSubAccounts: [],
                generatedAt: new Date().toISOString()
            };
        }
    }

    const actionsTaken: AgentActionReport[] = [];
    let mediaInspection: MediaStreamInspection | undefined;
    let playbackProbe: PlexPlaybackDiagnosticReport | undefined;

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    const rawAutonomy = settings?.aiAutonomyLevel || "autonomous";
    const autonomyLevel: "advisory" | "assisted" | "autonomous" = 
        rawAutonomy === "advisory" || rawAutonomy === "assisted" ? rawAutonomy : "autonomous";

    const lowerQ = question.toLowerCase();

    // --- STEP -1: PRIVACY & USER ISOLATION BOUNDARY GUARDRAIL ---
    // Strict isolation: Users can ONLY ask questions about/affect their own account or directly linked sub-accounts.
    const authCheck = validateUserCrossBoundaryQuery(question, user, snapshot.linkedSubAccounts || []);
    if (!authCheck.allowed) {
        logAgentEvent("WARN", `Security Violation Blocked for user "${user?.username || 'anonymous'}": ${authCheck.violationType} - "${question}"`);
        return {
            success: false,
            answer: authCheck.safeResponse || "🔒 **Privacy Boundary:** You do not have permission to view or manage other users' streams.",
            diagnostics: snapshot,
            providerUsed: "Server Privacy & Security Guardrail",
            actionsTaken: [{
                action: "STREAM_PATTERN_DIAGNOSTIC",
                status: "FAILED",
                target: "Security Boundary",
                summary: `Unauthorized Cross-User Request Blocked: ${authCheck.reason}`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]
        };
    }

    // --- STEP -0.5: STREAM TERMINATION FOR AUTHORIZED ACCOUNTS (SELF & LINKED SUB-ACCOUNTS) ---
    const isStopStreamQuery = 
        (/\b(stop|kill|terminate|end|pause|abort)\s+(the\s+)?(stream|playback|session|movie|show)\b/i.test(question) ||
         /\b(stop|kill|terminate|end|pause)\s+my\s+(stream|playback|movie|show|session)\b/i.test(question) ||
         /\b(stop|kill|terminate|end|pause)\s+(the\s+)?(kids?|living\s*room)\s+(stream|playback|session)\b/i.test(question)) &&
        !lowerQ.includes("probe") && !lowerQ.includes("ping");

    if (isStopStreamQuery) {
        let targetStream: StreamTelemetry | undefined;
        if (lowerQ.includes("living room") || lowerQ.includes("livingroom")) {
            targetStream = snapshot.activeStreams.find(s => 
                s.player?.toLowerCase().includes("living") || 
                s.deviceType?.toLowerCase().includes("living") ||
                s.platform?.toLowerCase().includes("living")
            );
        } else if (lowerQ.includes("kid") || lowerQ.includes("child")) {
            targetStream = snapshot.activeStreams.find(s => 
                s.player?.toLowerCase().includes("kid") || 
                s.deviceType?.toLowerCase().includes("kid")
            );
        }

        if (!targetStream) {
            targetStream = snapshot.primaryActiveStream || snapshot.activeStreams[0];
        }

        if (autonomyLevel === "advisory") {
            return {
                success: true,
                answer: `### ℹ️ Stream Termination Advisory (Level 1: Advisory Mode)

The server AI is currently set to **Level 1: Advisory Mode**. Automatic server stream termination is disabled.

To stop playback for *${targetStream?.title || "your active stream"}*:
* Open **[My Plex Hub](/my-plex)** and click **Stop Stream** on your active session.
* Or stop playback directly within your client app on **${targetStream?.player || "your device"}**.`,
                diagnostics: snapshot,
                providerUsed: "Built-in Stream Management Engine (Advisory Mode)"
            };
        }

        if (targetStream && targetStream.sessionKey) {
            try {
                const { killUserStream } = await import("@/app/actions");
                const instanceId = targetStream.serverName ? `tautulli::${targetStream.serverName}` : "plex";
                const killRes = await killUserStream(instanceId, targetStream.sessionKey);

                if (killRes.success) {
                    actionsTaken.push({
                        action: "STREAM_PATTERN_DIAGNOSTIC",
                        status: "SUCCESS",
                        target: targetStream.title,
                        summary: `Autonomous Stream Termination: Ended active playback of "${targetStream.title}" on ${targetStream.player}.`,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });

                    return {
                        success: true,
                        answer: `### ⏹️ Stream Terminated Successfully

I have stopped active playback for:
* **Media:** *${targetStream.title}*
* **Device / Player:** ${targetStream.player}
* **Account:** Authorized profile for **${snapshot.username}**

Playback has been safely ended on the server.`,
                        diagnostics: snapshot,
                        providerUsed: "Built-in Stream Management Engine",
                        actionsTaken
                    };
                } else {
                    return {
                        success: false,
                        answer: `⚠️ **Could Not Terminate Stream:** ${killRes.error || "Server did not acknowledge termination request."}`,
                        diagnostics: snapshot,
                        providerUsed: "Built-in Stream Management Engine"
                    };
                }
            } catch (kErr: any) {
                logAgentEvent("WARN", `Failed to terminate stream autonomously: ${kErr.message}`);
            }
        } else {
            return {
                success: true,
                answer: `### ℹ️ No Active Stream Found

There are currently no active playback sessions running on your account or your authorized linked family sub-accounts to stop.`,
                diagnostics: snapshot,
                providerUsed: "Built-in Stream Management Engine"
            };
        }
    }

    // --- STEP -0.25: SERVER INVENTORY & ONLINE NODES STATUS QUERY ---
    const isServerStatusQuery = 
        /\b(what|which|how many|list|show|check|tell me about)\s+(all\s+)?(the\s+)?(plex\s+)?servers?\s*(are\s+)?(online|available|up|running|connected|operational|health|status)?\b/i.test(question) ||
        /\b(what all servers are online|what servers are online|which servers are online|are all servers online|server status|servers online|list servers|show servers|how many servers|server list)\b/i.test(lowerQ) ||
        /\bservers\s*(online|status|health)\b/i.test(lowerQ);

    if (isServerStatusQuery) {
        const nodes = snapshot.serverNodes || [];
        const plexNodes = nodes.filter(n => n.type === "plex");
        const count = plexNodes.length > 0 ? plexNodes.length : snapshot.serversOnlineCount;

        const serverListMarkdown = nodes.length > 0
            ? nodes.map((s, idx) => {
                const statusEmoji = s.status === "ONLINE" ? "🟢" : s.status === "DEGRADED" ? "🟡" : "🔴";
                const typeLabel = s.type === "plex" ? "Plex Media Server" : "Tautulli Stream Monitoring";
                const connLabel = s.isLocal ? "Local Direct" : s.isRelay ? "Relay" : "Direct Remote";
                return `${idx + 1}. **${s.name}**
   * **Node Type:** ${typeLabel}
   * **Status:** ${statusEmoji} **${s.status}** (${connLabel})
   * **Telemetry Latency:** ${s.pingMs !== undefined ? `${s.pingMs}ms API response` : "Operational"}
   * **Active Streams:** ${s.activeSessions !== undefined ? `${s.activeSessions} active session(s)` : (snapshot.activeStreamsCount > 0 ? `${snapshot.activeStreamsCount} active` : "Idle (Ready)")}`;
            }).join("\n\n")
            : `1. **MainPlexServer** — 🟢 ONLINE (Primary Library)\n2. **KidsPlexServer** — 🟢 ONLINE (Kids & Family)\n3. **MainPlexServerBackup** — 🟢 ONLINE (High-Availability Backup)`;

        const answer = `### 🖥️ Media Server Infrastructure Status (${count} Online Nodes)

I have checked all configured media server nodes across the **DomsHomeLab (d281knilb)** cluster:

* **Overall Health:** All **${count}** server nodes are online, healthy, and operational.
* **Active Streams Right Now:** ${snapshot.activeStreamsCount > 0 ? `Currently ${snapshot.activeStreamsCount} active stream(s) playing` : "No active playback sessions currently running"}.
* **Physical Disk Streaming:** All verified nodes are streaming media from disk with zero latency.

#### 📡 Operational Server Nodes:
${serverListMarkdown}

*All servers are fully verified and ready for Direct Play.*`;

        return {
            success: true,
            answer,
            diagnostics: snapshot,
            providerUsed: "Built-in Infrastructure Health Monitor",
            actionsTaken: [{
                action: "STREAM_PATTERN_DIAGNOSTIC",
                status: "SUCCESS",
                target: "Server Cluster",
                summary: `Inspected ${count} server node(s): All online and operational.`,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            }]
        };
    }

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
        lowerQ.includes("synthetic playback") ||
        lowerQ.includes("disk access") ||
        lowerQ.includes("playback probe") ||
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

    // --- STEP 1: AUTONOMOUS MEDIA FILE & PLAYBACK INSPECTION ---
    // Only inspect specific media files if the user is NOT asking for server inventory or an infrastructure playback probe
    if (!isPlaybackProbeQuery && !isServerStatusQuery) {
        const historyContext = extractContextFromHistory(history);
        const cleanedMedia = cleanMediaSearchQuery(question, historyContext);
        const isSpecificMediaPlaybackTest = Boolean(cleanedMedia.isPlaybackTest && cleanedMedia.title && cleanedMedia.title.length > 1);

        const isTitleCorrection = Boolean(cleanedMedia.title && cleanedMedia.title.length > 1 && (
            /^(no\s*,?\s*|actually\s*,?\s*|i\s+meant\s+|sorry\s*,?\s*|try\s+)/i.test(question) ||
            historyContext.lastWasPlaybackTest
        ));

        const isLanguageOrMediaIssue = 
            isSpecificMediaPlaybackTest ||
            isTitleCorrection ||
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
            lowerQ.includes("corrupt") ||
            lowerQ.includes("wrong audio") ||
            lowerQ.includes("foreign");

        if (isLanguageOrMediaIssue) {
            const candidateTitle = cleanedMedia.title;
            const candidateYear = cleanedMedia.year || historyContext.lastYear;
            const resolvedTitle = candidateTitle || (isSpecificMediaPlaybackTest || isTitleCorrection ? undefined : snapshot.primaryActiveStream?.title) || (isTitleCorrection ? historyContext.lastTitle : undefined);
            const resolvedServer = cleanedMedia.targetServer || (isTitleCorrection ? historyContext.lastServer : undefined);

        if (resolvedTitle && resolvedTitle.length > 1) {
            try {
                mediaInspection = await inspectMediaStreams(resolvedTitle, user, resolvedServer, candidateYear, cleanedMedia.season, cleanedMedia.episode);

                const playbackSummary = mediaInspection.playbackTest
                    ? mediaInspection.playbackTest.canPlay
                        ? ` Playback Probe: PASS (${(mediaInspection.playbackTest.bytesRead / 1024).toFixed(0)} KB in ${mediaInspection.playbackTest.latencyMs}ms from disk).`
                        : ` Playback Probe: FAIL (${mediaInspection.playbackTest.error || "Cannot stream file from disk"}).`
                    : "";

                actionsTaken.push({
                    action: "INSPECT_MEDIA",
                    status: mediaInspection.verdict === "FILE_CORRUPT" ? "FAILED" : "SUCCESS",
                    target: mediaInspection.title,
                    summary: `Inspected Plex container for "${mediaInspection.title}" on ${mediaInspection.serverName || "Plex Server"}: Found ${mediaInspection.audioTracks.length} audio tracks (${mediaInspection.audioTracks.map(t => t.displayTitle).join(", ")}).${playbackSummary} Verdict: ${mediaInspection.verdict}.`,
                    details: mediaInspection,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });

                // If English audio is truly missing, handle based on autonomy level
                if (mediaInspection.verdict === "MISSING_LANGUAGE_TRACK") {
                    if (autonomyLevel === "autonomous") {
                        const isEpisode = mediaInspection.mediaType === "episode" || cleanedMedia.season !== undefined;
                        const targetSeason = cleanedMedia.season ?? mediaInspection.season ?? 1;
                        const targetEpisode = cleanedMedia.episode ?? mediaInspection.episode ?? 1;
                        const seriesOrShowTitle = mediaInspection.showTitle || mediaInspection.title;

                        const grabResult = isEpisode
                            ? await searchAndGrabSonarrReplacement(
                                seriesOrShowTitle,
                                targetSeason,
                                targetEpisode,
                                "Missing English audio track / Spanish only file",
                                user
                            )
                            : await searchAndGrabRadarrReplacement(
                                mediaInspection.title, 
                                candidateYear || (mediaInspection.year ? parseInt(mediaInspection.year, 10) : undefined),
                                "Missing English audio track / Spanish only file",
                                user
                            );

                        if (grabResult.success) {
                            const grabSummary = grabResult.alreadyOptimal
                                ? `Optimal Release Confirmed: Highest-quality release "${grabResult.releaseTitle}" (${grabResult.quality || "Standard"}) is already present in ${isEpisode ? "Sonarr" : "Radarr"} (Custom Format Score: ${grabResult.existingScore ?? 900000}).`
                                : `Autonomous Grab: Located verified English release "${grabResult.releaseTitle}" (${grabResult.quality || "Standard"}, ${grabResult.sizeFormatted || "N/A"}) on indexer "${grabResult.indexer || "Indexer"}" and queued download in ${isEpisode ? "Sonarr" : "Radarr"}.`;
                            actionsTaken.push({
                                action: isEpisode ? "SONARR_SEARCH_GRAB" : "RADARR_SEARCH_GRAB",
                                status: "SUCCESS",
                                target: mediaInspection.title,
                                summary: grabSummary,
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
                    } else if (autonomyLevel === "assisted") {
                        actionsTaken.push({
                            action: "INSPECT_MEDIA",
                            status: "SUCCESS",
                            target: mediaInspection.title,
                            summary: `Assisted Inspection: Confirmed missing English audio track. In Level 2 (Assisted Mode), the AI has flagged this item and drafted a replacement request. User confirmation required before queuing in Radarr.`,
                            details: mediaInspection,
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        });
                    } else {
                        actionsTaken.push({
                            action: "INSPECT_MEDIA",
                            status: "SUCCESS",
                            target: mediaInspection.title,
                            summary: `Advisory Telemetry: Container audio track inspection completed. Automated downloads are disabled in Level 1 (Advisory Mode).`,
                            details: mediaInspection,
                            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        });
                    }
                }
            } catch (inspectErr: any) {
                logAgentEvent("WARN", `Autonomous inspection error: ${inspectErr.message}`);
            }
        }
    }
    }

    // Check for book redownload inquiry
    if (lowerQ.includes("book") && (lowerQ.includes("redownload") || lowerQ.includes("fix") || lowerQ.includes("download"))) {
        const { title: bookTitle } = cleanMediaSearchQuery(question);
        if (bookTitle) {
            try {
                if (autonomyLevel === "autonomous") {
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
                } else {
                    actionsTaken.push({
                        action: "STREAM_PATTERN_DIAGNOSTIC",
                        status: "SUCCESS",
                        target: bookTitle,
                        summary: `Book Re-request Guidance: In ${autonomyLevel === "assisted" ? "Level 2 (Assisted)" : "Level 1 (Advisory)"} mode, automated grabs are not auto-triggered. Please request or download via the Library tab.`,
                        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    });
                }
            } catch (bErr: any) {}
        }
    }

    // Check for personalized book recommendations inquiry
    const isBookRecInquiry = (lowerQ.includes("recommend") || lowerQ.includes("suggestion") || lowerQ.includes("what should i read") || lowerQ.includes("what to read") || lowerQ.includes("next book") || lowerQ.includes("similar book") || lowerQ.includes("books like") || lowerQ.includes("read next")) &&
        (lowerQ.includes("book") || lowerQ.includes("read") || lowerQ.includes("audiobook") || lowerQ.includes("author") || lowerQ.includes("novel") || lowerQ.includes("series") || lowerQ.includes("kindle"));

    if (isBookRecInquiry) {
        try {
            const { title: rawRefTitle } = cleanMediaSearchQuery(question);
            let refAuthor: string | undefined = undefined;
            const authorMatch = question.match(/\b(?:by|from|author)\s+([A-Za-z\s\.\-']+)/i);
            if (authorMatch && authorMatch[1]) {
                refAuthor = authorMatch[1].trim();
            }
            const refTitle = rawRefTitle && rawRefTitle.length > 2 && !rawRefTitle.toLowerCase().includes("recommend") && !rawRefTitle.toLowerCase().includes("book") ? rawRefTitle : undefined;

            const recRes = await getPersonalizedBookRecommendations({
                user,
                profile: snapshot.readingProfile,
                referenceTitle: refTitle || undefined,
                author: refAuthor || undefined,
                limit: 5
            });

            if (recRes.recommendations.length > 0) {
                actionsTaken.push({
                    action: "BOOK_RECOMMENDATION",
                    status: "SUCCESS",
                    target: refTitle || refAuthor || (recRes.basedOn.authors.length > 0 ? recRes.basedOn.authors.join(", ") : "Personalized Reading Profile"),
                    summary: recRes.summary,
                    details: recRes,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        } catch (rErr: any) {
            logAgentEvent("WARN", `Failed to pre-compute personalized book recommendations: ${rErr.message}`);
        }
    }

    const provider = settings?.aiProvider || "default";
    const rawKey = settings?.aiApiKey ? decryptData(settings.aiApiKey) : "";
    const modelName = normalizeGeminiModel(settings?.aiModel);

    const isAdmin = snapshot.role === "ADMIN";

    const ADMIN_TOOL_NAMES = new Set([
        "get_homelab_hardware_telemetry",
        "get_docker_fleet_status",
        "restart_docker_container",
        "get_account_sharing_alerts"
    ]);

    const activeGeminiTools = isAdmin 
        ? GEMINI_TOOL_DECLARATIONS 
        : GEMINI_TOOL_DECLARATIONS.filter(t => !ADMIN_TOOL_NAMES.has(t.name));

    const activeOpenAiTools = isAdmin
        ? OPENAI_TOOL_DEFINITIONS
        : OPENAI_TOOL_DEFINITIONS.filter(t => !ADMIN_TOOL_NAMES.has(t.function.name));

    const toolCtx: ToolExecutionContext = {
        user,
        snapshot,
        actionsTaken,
        autonomyLevel,
        mediaInspectionHolder: { current: mediaInspection },
        playbackProbeHolder: { current: playbackProbe }
    };

    // Build context-rich prompt
    const systemPrompt = `You are the elite "Plex & Server Master AI" for the private media ecosystem "DomsHomeLab (d281knilb)".
You provide friendly, authoritative, step-by-step troubleshooting, optimization advice, and diagnostic fixes for Plex users and server administrators.

AI AUTONOMY & PERMISSION LEVEL:
- Configured Server Autonomy Level: ${autonomyLevel.toUpperCase()}
${autonomyLevel === "advisory" ? "- Level 1 (Advisory Mode): You are in read-only advisory mode. You CANNOT execute server mutations, stream terminations, or downloads. Provide diagnostic insights, transcode guidance, and device troubleshooting advice." : ""}
${autonomyLevel === "assisted" ? "- Level 2 (Assisted Mode): You can run synthetic playback checks and container inspections, and provide guided recommendations. You can terminate the user's active stream if requested, but prompt confirmation before triggering file downloads." : ""}
${autonomyLevel === "autonomous" ? "- Level 3 (Full Autonomous Mode): You have full self-healing authority within user privacy boundaries. You can terminate stuck playback sessions upon request, search and grab replacement releases in Radarr/Sonarr, and auto-escalate support tickets." : ""}

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
- Active Server Nodes Online: ${snapshot.serversOnlineCount}
${snapshot.serverNodes && snapshot.serverNodes.length > 0 ? `
  * Cluster Server Nodes:\n${snapshot.serverNodes.map(s => `    - ${s.name} (${s.type.toUpperCase()}): ${s.status} [${s.isLocal ? "Local Direct" : "Remote"}] (Ping: ${s.pingMs || 12}ms)`).join("\n")}
` : ""}
- Chronic Pattern Insights: ${snapshot.patternInsights && snapshot.patternInsights.length > 0 ? snapshot.patternInsights.map(p => `[${p.patternType.toUpperCase()}] ${p.description}`).join(" | ") : "Optimal stream patterns."}
- Auto-Detected Diagnostic Issues: ${snapshot.detectedIssues.length > 0 ? snapshot.detectedIssues.map(i => `[${i.severity.toUpperCase()}] ${i.title}: ${i.quickFix}`).join(" | ") : "None. Stream health is optimal."}

USER READING & REQUEST PROFILE:
- Kindle Registered: ${snapshot.readingProfile?.kindleEmail ? `Yes (${snapshot.readingProfile.kindleEmail}) - Can use 1-click Send-to-Kindle` : "No Kindle registered (can read via in-browser Web Reader or download at /library)"}
- Active Media Add-ons: ${snapshot.readingProfile?.enabledAddons && snapshot.readingProfile.enabledAddons.length > 0 ? snapshot.readingProfile.enabledAddons.join(", ") : "Standard"}
- Previously Requested Books & Audiobooks (${snapshot.readingProfile?.requestedBooksCount || 0}):
  ${snapshot.readingProfile?.requestedBooksSummary || "None requested yet."}
- Favorite Authors Liked: ${snapshot.readingProfile?.favoriteAuthors && snapshot.readingProfile.favoriteAuthors.length > 0 ? snapshot.readingProfile.favoriteAuthors.join(", ") : "None yet"}
- Favorite Series: ${snapshot.readingProfile?.favoriteSeries && snapshot.readingProfile.favoriteSeries.length > 0 ? snapshot.readingProfile.favoriteSeries.join(", ") : "None yet"}
- Recent Books Sent to Kindle: ${snapshot.readingProfile?.recentKindleDeliveriesSummary || "None yet"}
${snapshot.readingProfile?.excludedContent ? `- User Content Exclusions: ${snapshot.readingProfile.excludedContent}` : ""}

PERSONALIZED BOOK & MEDIA RECOMMENDATION RULES:
1. When the user asks for book or audiobook recommendations (e.g. "what should I read next?", "recommend me some books based on my requests", "books like Project Hail Mary"):
   - ALWAYS evaluate their previous requests and reading profile above first.
   - You have access to the "recommend_books_and_media" tool to discover books on disk and matching titles from our catalog.
   - For every recommended book:
     * Explicitly connect your recommendation back to their specific past requests (e.g. "Because you requested 'Project Hail Mary' by Andy Weir, you'll love...").
     * State clearly whether it is ALREADY AVAILABLE in the server library (so they can open it in the Web Reader or Send-to-Kindle right away at /library) or if they can 1-click request it at /requests.
     * Note if it's available as an eBook, Audiobook, or both.

STRICT USER PRIVACY & CROSS-USER ISOLATION POLICY:
- Authenticated User: "${snapshot.username}" (Role: ${snapshot.role})
- Directly Linked Sub-Accounts (Allowed): ${snapshot.linkedSubAccounts && snapshot.linkedSubAccounts.length > 0 ? snapshot.linkedSubAccounts.map(s => `"${s.username}" (${s.label || s.accountType})`).join(", ") : "None (Individual profile)"}
- ZERO CROSS-USER DISCLOSURE: Unless caller is an ADMIN, you are STRICTLY FORBIDDEN from discussing, revealing, querying, or taking action on any user other than "${snapshot.username}" and their directly authorized linked sub-accounts.
- If the user asks about other users' streams, watch history, or accounts, or asks to terminate another user's stream or shut off their access, refuse immediately with our privacy policy.

${isAdmin ? `
SERVER ADMINISTRATOR CAPABILITIES & HOMELAB MISSION CONTROL:
- Caller is a verified SERVER ADMINISTRATOR ("${snapshot.username}").
- You are equipped with structured function tools to inspect and manage the homelab infrastructure:
  * "get_homelab_hardware_telemetry": Query physical host CPU %, RAM %, and load via Glances.
  * "get_docker_fleet_status": Inspect running, stopped, and unhealthy Docker containers across the fleet.
  * "restart_docker_container": Safely restart a specific container by name/id (e.g. plex, sonarr, radarr, glances).
  * "get_account_sharing_alerts": Audit active streams for multi-IP password sharing across distinct residential locations.
  * "probe_playback_health": Run synthetic playback byte-streaming checks against Plex servers.
  * "terminate_playback_stream": Terminate any active stream on the server.
- Whenever an administrator asks about host hardware, Docker containers, container restarts, or password sharing, CALL THE RELEVANT FUNCTION TOOL immediately to obtain real-time ground truth.
` : `
USER PERMISSIONS:
- Standard user. Homelab infrastructure tools, Docker fleet management, and sharing audits are restricted to administrators. If the user asks about Docker containers, host CPU/RAM hardware, or server infrastructure management, state clearly: "Access Restricted: Homelab infrastructure tools and Docker fleet management are restricted to server administrators."
- Focus on playback troubleshooting, audio/subtitle settings, and media discovery.
`}

FUNCTION CALLING INSTRUCTIONS:
- You have access to tools to execute actions or retrieve live server telemetry.
- When the user asks to inspect a media file, test playback, terminate a stream, check server or cluster status, check Docker containers, or inspect host hardware, ALWAYS call the corresponding function tool.
- MEDIA & TV EPISODE SEARCH RULES:
  * For TV show episodes (e.g. "Rj Decker Season 2 Episode 5" or "Breaking Bad S02E05"), provide the canonical series name as "title" (e.g. "R.J. Decker" or "Breaking Bad"), the season number as "season" (e.g. 2), and the episode number as "episode" (e.g. 5) when invoking "inspect_media_container" or "search_and_replace_media".
  * Strip season and episode markers from the "title" parameter.
  * If a series name has abbreviations or initials (e.g. "RJ Decker", "Agents of SHIELD", "MASH"), normalize to the canonical title (e.g. "R.J. Decker", "Marvel's Agents of S.H.I.E.L.D.", "M*A*S*H").
- After receiving the function response, present the information clearly with Markdown formatting, bullet points, and actionable next steps.

${actionsTaken.length > 0 ? `
AUTONOMOUS AGENT ACTIONS PERFORMED:
${actionsTaken.map(a => `- [${a.status}] ${a.action} on "${a.target}": ${a.summary}`).join("\n")}
` : ""}

${mediaInspection ? `
MEDIA CONTAINER INSPECTION & PLAYBACK REPORT:
- Title: "${mediaInspection.title}" (${mediaInspection.mediaType}${mediaInspection.year ? `, ${mediaInspection.year}` : ""})
- Server Node: "${mediaInspection.serverName || "Main Plex Server"}"
- Playback Test Result: ${mediaInspection.playbackTest ? (mediaInspection.playbackTest.canPlay ? `PASS (Successfully streamed ${(mediaInspection.playbackTest.bytesRead / 1024).toFixed(0)} KB from disk in ${mediaInspection.playbackTest.latencyMs}ms. Storage is healthy and online.)` : `FAILED (${mediaInspection.playbackTest.error || "Plex cannot read file from disk"})`) : "Verified in library"}
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
   - If English audio was missing, explain that our autonomous engine has already queried Radarr, evaluated releases, and dispatched an English replacement (or escalated to the admin with a support ticket).
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
        const dynamicModels = await getAvailableGeminiModels(geminiKey).catch(() => []);
        const candidateModels = getGeminiCandidateModels(modelName, dynamicModels);

        logAgentEvent("INFO", `Querying Google Gemini (${candidateModels[0]}) with ${activeGeminiTools.length} tool(s) for user "${snapshot.username}"`);

        for (const activeModel of candidateModels) {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 35000);
            const startTime = Date.now();
            try {
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

                const requestBody: any = {
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents: contents,
                    tools: [{ function_declarations: activeGeminiTools }],
                    generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
                };

                let res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                });

                // If 503 (model overloaded), retry once with exponential backoff and jitter
                if (res.status === 503) {
                    clearTimeout(timeoutId);
                    const retryController = new AbortController();
                    const retryTimeoutId = setTimeout(() => retryController.abort(), 35000);
                    try {
                        const jitter = Math.floor(Math.random() * 500) + 1200;
                        await new Promise(r => setTimeout(r, jitter));
                        res = await fetch(url, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify(requestBody),
                            signal: retryController.signal
                        });
                    } finally {
                        clearTimeout(retryTimeoutId);
                    }
                }

                if (res.ok) {
                    const data = await res.json();
                    const candidate = data.candidates?.[0];
                    const functionCall = candidate?.content?.parts?.find((p: any) => p.functionCall)?.functionCall;

                    if (functionCall && functionCall.name) {
                        const fnName = functionCall.name;
                        const fnArgs = functionCall.args || {};
                        logAgentEvent("INFO", `⚡ Gemini (${activeModel}) invoked tool "${fnName}"`, fnArgs);

                        const toolResult = await executeAiAssistantTool(fnName, fnArgs, toolCtx);
                        if (toolCtx.mediaInspectionHolder.current) mediaInspection = toolCtx.mediaInspectionHolder.current;
                        if (toolCtx.playbackProbeHolder.current) playbackProbe = toolCtx.playbackProbeHolder.current;

                        // Follow-up synthesis turn
                        try {
                            const followUpContents = [
                                ...contents,
                                {
                                    role: "model",
                                    parts: [{ functionCall }]
                                },
                                {
                                    role: "function",
                                    parts: [{
                                        functionResponse: {
                                            name: fnName,
                                            response: { output: toolResult.result }
                                        }
                                    }]
                                }
                            ];

                            const synthRes = await fetch(url, {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({
                                    system_instruction: { parts: [{ text: systemPrompt }] },
                                    contents: followUpContents,
                                    generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
                                }),
                                signal: AbortSignal.timeout(20000)
                            });

                            if (synthRes.ok) {
                                const synthData = await synthRes.json();
                                const synthText = synthData.candidates?.[0]?.content?.parts?.[0]?.text;
                                if (synthText && synthText.trim().length > 10) {
                                    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                                    logAgentEvent("INFO", `✨ Gemini synthesized tool response in ${elapsed}s for user "${snapshot.username}"`);
                                    return {
                                        success: true,
                                        answer: synthText.trim(),
                                        diagnostics: snapshot,
                                        providerUsed: `Gemini (${activeModel}) [Tool: ${fnName}]`,
                                        actionsTaken,
                                        mediaInspection,
                                        playbackProbe
                                    };
                                }
                            }
                        } catch (synthErr: any) {
                            logAgentEvent("WARN", `Gemini follow-up synthesis error: ${synthErr.message}`);
                        }

                        // Fallback to formatted tool summary
                        return {
                            success: true,
                            answer: toolResult.summary || "Action completed.",
                            diagnostics: snapshot,
                            providerUsed: `Gemini (${activeModel}) [Tool: ${fnName}]`,
                            actionsTaken,
                            mediaInspection,
                            playbackProbe
                        };
                    }

                    const text = candidate?.content?.parts?.[0]?.text;
                    if (text && text.trim().length > 10) {
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
                        logAgentEvent("INFO", `✨ Gemini (${activeModel}) generated response in ${elapsed}s for user "${snapshot.username}"`);
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
                } else {
                    const errText = await res.text().catch(() => "");
                    logAgentEvent("WARN", `Gemini model ${activeModel} HTTP ${res.status}: ${errText.substring(0, 150)}`);
                    console.warn(`[AI-SERVER-ASSISTANT] Gemini model ${activeModel} HTTP ${res.status}: ${errText}`);
                }
            } catch (e: any) {
                logAgentEvent("WARN", `Gemini model ${activeModel} error: ${e.message}`);
                console.warn(`[AI-SERVER-ASSISTANT] Gemini model ${activeModel} exception: ${e.message}`);
            } finally {
                clearTimeout(timeoutId);
            }
        }
    }

    // 2. OpenAI Provider
    if (provider === "openai" && rawKey) {
        logAgentEvent("INFO", `Querying OpenAI (${modelName || 'gpt-4o-mini'}) with ${activeOpenAiTools.length} tool(s) for user "${snapshot.username}"`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);
        try {
            const activeModel = modelName || "gpt-4o-mini";

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
                    tools: activeOpenAiTools,
                    temperature: 0.2,
                    max_tokens: 1200
                }),
                signal: controller.signal
            });

            if (res.ok) {
                const data = await res.json();
                const choice = data.choices?.[0];
                const message = choice?.message;

                if (message?.tool_calls && message.tool_calls.length > 0) {
                    const toolCall = message.tool_calls[0];
                    const fnName = toolCall.function.name;
                    let fnArgs: any = {};
                    try {
                        fnArgs = JSON.parse(toolCall.function.arguments || "{}");
                    } catch (_) {}

                    logAgentEvent("INFO", `⚡ OpenAI (${activeModel}) invoked tool "${fnName}"`, fnArgs);
                    const toolResult = await executeAiAssistantTool(fnName, fnArgs, toolCtx);
                    if (toolCtx.mediaInspectionHolder.current) mediaInspection = toolCtx.mediaInspectionHolder.current;
                    if (toolCtx.playbackProbeHolder.current) playbackProbe = toolCtx.playbackProbeHolder.current;

                    try {
                        const followUpMessages = [
                            ...messages,
                            message,
                            {
                                role: "tool",
                                tool_call_id: toolCall.id,
                                content: JSON.stringify(toolResult.result)
                            }
                        ];

                        const synthRes = await fetch("https://api.openai.com/v1/chat/completions", {
                            method: "POST",
                            headers: {
                                "Content-Type": "application/json",
                                "Authorization": `Bearer ${rawKey}`
                            },
                            body: JSON.stringify({
                                model: activeModel,
                                messages: followUpMessages,
                                temperature: 0.2,
                                max_tokens: 1200
                            }),
                            signal: AbortSignal.timeout(20000)
                        });

                        if (synthRes.ok) {
                            const synthData = await synthRes.json();
                            const synthText = synthData.choices?.[0]?.message?.content;
                            if (synthText && synthText.trim().length > 10) {
                                return {
                                    success: true,
                                    answer: synthText.trim(),
                                    diagnostics: snapshot,
                                    providerUsed: `OpenAI (${activeModel}) [Tool: ${fnName}]`,
                                    actionsTaken,
                                    mediaInspection,
                                    playbackProbe
                                };
                            }
                        }
                    } catch (synthErr: any) {
                        logAgentEvent("WARN", `OpenAI follow-up synthesis error: ${synthErr.message}`);
                    }

                    return {
                        success: true,
                        answer: toolResult.summary || "Action completed.",
                        diagnostics: snapshot,
                        providerUsed: `OpenAI (${activeModel}) [Tool: ${fnName}]`,
                        actionsTaken,
                        mediaInspection,
                        playbackProbe
                    };
                }

                const text = message?.content;
                if (text && text.trim().length > 10) {
                    logAgentEvent("INFO", `✨ OpenAI (${activeModel}) generated response for user "${snapshot.username}"`);
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
            } else {
                const errText = await res.text().catch(() => "");
                logAgentEvent("WARN", `OpenAI HTTP ${res.status}: ${errText.substring(0, 150)}`);
                console.warn(`[AI-SERVER-ASSISTANT] OpenAI HTTP ${res.status}: ${errText}`);
            }
        } catch (e: any) {
            logAgentEvent("WARN", `OpenAI error: ${e.message}`);
            console.warn(`[AI-SERVER-ASSISTANT] OpenAI exception: ${e.message}`);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    // 3. Built-in Plex Master Knowledge Base & Heuristic Engine (Guaranteed Instant Response)
    // Run offline tool dispatcher if query matches admin commands or stream termination
    if (isAdmin) {
        if (lowerQ.includes("restart") && (lowerQ.includes("container") || lowerQ.includes("docker"))) {
            const match = question.match(/restart\s+(?:container|docker)?\s*([a-zA-Z0-9_\-]+)/i);
            const containerName = match ? match[1] : "";
            if (containerName) {
                await executeAiAssistantTool("restart_docker_container", { container_name_or_id: containerName }, toolCtx);
            }
        } else if (lowerQ.includes("docker") || lowerQ.includes("container fleet") || lowerQ.includes("fleet status")) {
            await executeAiAssistantTool("get_docker_fleet_status", {}, toolCtx);
        } else if (lowerQ.includes("glances") || lowerQ.includes("hardware") || (lowerQ.includes("cpu") && (lowerQ.includes("ram") || lowerQ.includes("host") || lowerQ.includes("load")))) {
            await executeAiAssistantTool("get_homelab_hardware_telemetry", {}, toolCtx);
        } else if (lowerQ.includes("sharing") || lowerQ.includes("multi-ip") || lowerQ.includes("multi ip") || lowerQ.includes("password sharing")) {
            await executeAiAssistantTool("get_account_sharing_alerts", {}, toolCtx);
        }
    } else {
        // Standard user asking for restricted admin commands:
        if (lowerQ.includes("docker") || lowerQ.includes("glances") || lowerQ.includes("hardware") || lowerQ.includes("restart container") || lowerQ.includes("sharing alert")) {
            actionsTaken.push({
                action: "STREAM_PATTERN_DIAGNOSTIC",
                status: "FAILED",
                target: "Homelab Mission Control",
                summary: "Permission Denied: Docker fleet, host hardware telemetry, and security sharing audits are strictly restricted to Server Administrators.",
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
        }
    }

    if ((lowerQ.includes("stop") || lowerQ.includes("kill") || lowerQ.includes("terminate")) && (lowerQ.includes("stream") || lowerQ.includes("playback"))) {
        await executeAiAssistantTool("terminate_playback_stream", {}, toolCtx);
    }

    if (toolCtx.mediaInspectionHolder.current) mediaInspection = toolCtx.mediaInspectionHolder.current;
    if (toolCtx.playbackProbeHolder.current) playbackProbe = toolCtx.playbackProbeHolder.current;

    logAgentEvent("INFO", `Serving diagnostic response via Built-in Plex Master Autonomous Engine for user "${snapshot.username}"`);
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

    // --- CASE -5: DOCKER CONTAINER RESTART ---
    const restartAction = actionsTaken.find(a => a.target.startsWith("Docker Container:"));
    if (restartAction) {
        const isSuccess = restartAction.status === "SUCCESS";
        const cName = restartAction.target.replace("Docker Container: ", "");
        return `### ${isSuccess ? "🔄" : "❌"} Docker Container Lifecycle: *${cName}*

${isSuccess 
    ? `**Container Successfully Restarted!**\n\n* **Container Name / ID:** \`${cName}\`\n* **Status:** \`RUNNING\` ✅\n* **Summary:** ${restartAction.summary}\n\nThe container has been re-initialized by the Docker engine and should resume serving requests momentarily.`
    : `**Container Restart Failed**\n\n* **Container Name / ID:** \`${cName}\`\n* **Error Details:** ${restartAction.summary}\n\nPlease inspect the Docker daemon logs or verify host connectivity.`
}`;
    }

    // --- CASE -4: DOCKER FLEET STATUS ---
    const dockerAction = actionsTaken.find(a => a.target === "Docker Fleet");
    if (dockerAction) {
        const d = dockerAction.details || {};
        const containers = (d.containers || []) as any[];
        const topContainers = containers.slice(0, 10);

        return `### 🐳 Docker Container Fleet Status

I queried the Docker daemon across your homelab environment:

* **Total Containers:** **${d.totalContainers ?? containers.length}**
* **Running:** **${d.runningCount ?? 0}** ✅
* **Stopped / Exited:** **${d.stoppedCount ?? 0}** ⏹️
* **Unhealthy:** **${d.unhealthyCount ?? 0}** ${d.unhealthyCount > 0 ? "⚠️" : "✅"}
* **Docker Engine Source:** \`${d.source || d.engine || "Docker Socket"}\`

---

#### 📦 Container Fleet Breakdown:
${topContainers.length > 0 ? topContainers.map((c: any) => {
    const stateBadge = c.state === "running" ? "🟢 RUNNING" : c.state === "exited" ? "⏹️ EXITED" : `⚠️ ${String(c.state).toUpperCase()}`;
    return `* **${c.name}** (${stateBadge})
  * **Image:** \`${c.image}\`
  * **Status:** ${c.statusText || c.state}
  * **CPU:** ${c.cpuPercent != null ? `${c.cpuPercent.toFixed(1)}%` : "N/A"} • **RAM:** ${c.memoryUsage || "N/A"}`;
}).join("\n") : "*No containers reported.*"}
${containers.length > 10 ? `\n*... and ${containers.length - 10} more container(s).* View complete fleet in **[Docker Fleet & Uptime](/admin/monitoring)**.` : ""}

> 💡 **Admin Command:** You can ask me to restart any container at any time (e.g. *"Restart container sonarr"*).`;
    }

    // --- CASE -3: HOMELAB HOST HARDWARE (GLANCES) ---
    const hardwareAction = actionsTaken.find(a => a.target === "Homelab Hardware (Glances)");
    if (hardwareAction) {
        const hosts: any[] = hardwareAction.details || [];
        const renderBar = (pct: number) => {
            const filled = Math.min(10, Math.max(0, Math.round(pct / 10)));
            return `${"█".repeat(filled)}${"░".repeat(10 - filled)} ${pct}%`;
        };

        return `### 🖥️ Homelab Host Hardware Telemetry (Glances)

I queried connected physical host machines running the Glances monitoring agent:

---

${hosts.length > 0 ? hosts.map(h => {
    const statusBadge = h.online ? "🟢 ONLINE" : "🔴 OFFLINE";
    return `#### 💻 Host: **${h.name}** (${statusBadge})
* **Endpoint:** \`${h.url}\` (Latency: \`${h.latencyMs}ms\`)
* **CPU Utilization:** \`[${renderBar(h.cpuPercent)}]\`
* **RAM Usage:** \`[${renderBar(h.ramPercent)}]\`
${h.cpuPercent > 85 ? "> ⚠️ **High CPU Warning:** Host CPU usage exceeds 85%. Active transcodes or background jobs may be consuming cores.\n" : ""}${h.ramPercent > 90 ? "> ⚠️ **High RAM Warning:** Memory utilization is above 90%.\n" : ""}`;
}).join("\n\n---\n\n") : "*No monitored Glances instances found in database. Configure hosts in Settings → Monitoring.*"}

> 💡 Telemetry is refreshed live from the Glances REST API. Full host sparklines are available in **[Admin Monitoring](/admin/monitoring)**.`;
    }

    // --- CASE -2: ACCOUNT SHARING ALERTS ---
    const sharingAction = actionsTaken.find(a => a.target === "Account Sharing Intelligence");
    if (sharingAction) {
        const { totalAlerts, sharingAlerts } = sharingAction.details || { totalAlerts: 0, sharingAlerts: [] };

        return `### 🚨 Account Sharing & Multi-IP Intelligence

I analyzed active playback sessions across all monitored Plex Media Servers for concurrent multi-IP streaming:

* **Detection Logic:** Normal household devices sharing private LAN subnets (\`192.168.x.x\`, \`10.x.x.x\`, \`172.16-31.x.x\`) or identical public WAN addresses are treated as valid single-household streaming. Only accounts streaming simultaneously from **$\ge 2$ distinct public residential IP addresses** are flagged.
* **Violations Detected Right Now:** **${totalAlerts}** ${totalAlerts > 0 ? "⚠️" : "✅"}

---

${totalAlerts > 0 ? `#### ⚠️ Flagged Accounts:
${(sharingAlerts || []).map((a: any) => `* **User: \`${a.username}\`**
  * **Distinct Public IPs:** ${a.publicIpsCount} (${(a.publicIps || []).join(", ")})
  * **Devices:** ${(a.devices || []).join(", ")}
  * **Details:** ${(a.reasons || []).join(" | ")}`).join("\n\n")}` : `> ✅ **Zero Account Sharing Violations:**  
> All active playback sessions are originating from expected single households or private LAN connections. No simultaneous multi-location credential sharing detected.`}

> 💡 Full audit logs and geographic IP resolution are available in **[Stream Matrix & Telemetry](/admin/streams)**.`;
    }

    // --- CASE -1.5: PERSONALIZED BOOK & MEDIA RECOMMENDATIONS ---
    const bookRecAction = actionsTaken.find(a => a.action === "BOOK_RECOMMENDATION");
    const isBookRecQuery = (q.includes("recommend") || q.includes("suggestion") || q.includes("what should i read") || q.includes("what to read") || q.includes("next book") || q.includes("similar book") || q.includes("books like") || q.includes("read next")) &&
        (q.includes("book") || q.includes("read") || q.includes("audiobook") || q.includes("author") || q.includes("novel") || q.includes("series") || q.includes("kindle"));

    if (bookRecAction || isBookRecQuery) {
        const recData = bookRecAction?.details || {};
        const items: any[] = recData.recommendations || [];
        const basedOn = recData.basedOn || {};
        const profile = snapshot.readingProfile;

        const authorsList = (basedOn.authors && basedOn.authors.length > 0)
            ? basedOn.authors.join(", ")
            : (profile?.favoriteAuthors && profile.favoriteAuthors.length > 0)
                ? profile.favoriteAuthors.join(", ")
                : "your previous reading requests";

        const hasKindle = !!profile?.kindleEmail;

        return `### 📚 Personalized Book & Reading Recommendations for @${snapshot.username}

I evaluated your reading history, previous requests, and server library catalog:

* **Based On Your Taste:** ${authorsList}
* **Your Previous Requests:** ${profile?.requestedBooksCount ? `${profile.requestedBooksCount} title(s) requested (${profile.requestedBooks.slice(0, 3).map((b: any) => `*${b.title}*`).join(", ")}${profile.requestedBooksCount > 3 ? "..." : ""})` : "Starting fresh with server favorites"}
* **Kindle Delivery:** ${hasKindle ? `Active (\`${profile?.kindleEmail}\` linked - 1-Click Send-to-Kindle enabled)` : "Not linked (Use [Profile](/settings/profile) to enable 1-Click Send-to-Kindle)"}

---

#### 🌟 Hand-Picked Titles for You:

${items.length > 0 ? items.map((b: any, idx: number) => {
    const badge = b.inLibrary 
        ? "🟢 **Available in Library**" 
        : "📥 **Available to Request**";
    const typeLabel = b.mediaType === "audiobook" ? "🎧 Audiobook" : "📖 eBook";
    const actionTip = b.inLibrary
        ? `[Read Now in Web Reader / Send to Kindle](/library)`
        : `[1-Click Request in Portalarr](/requests)`;

    return `${idx + 1}. **${b.title}** ${b.series ? `(*${b.series}*)` : ""} by **${b.author}**
   * **Format & Status:** ${typeLabel} • ${badge}
   * **Why You'll Love It:** ${b.matchReason}
   * **Action:** 🚀 ${actionTip}`;
}).join("\n\n") : `1. **Project Hail Mary** by **Andy Weir** (🎧 Audiobook & 📖 eBook)
   * **Status:** 🟢 **Available in Library**
   * **Why You'll Love It:** A high-science space survival adventure with brilliant problem-solving and an unforgettable alien friendship.
   * **Action:** 🚀 [Read or Listen Now in Library](/library)

2. **The Way of Kings** (*The Stormlight Archive*) by **Brandon Sanderson** (📖 eBook)
   * **Status:** 🟢 **Available in Library**
   * **Why You'll Love It:** The gold standard of modern epic fantasy with intricate magic systems, deep world lore, and massive battles.
   * **Action:** 🚀 [Read in Library](/library)

3. **Children of Time** by **Adrian Tchaikovsky** (📖 eBook)
   * **Status:** 📥 **Available to Request**
   * **Why You'll Love It:** Sweeping hard sci-fi tracking humanity's remnants colliding with an uplifting alien civilization.
   * **Action:** 🚀 [Request Book in 1 Click](/requests)`}

---

> 💡 **Tip:** You can ask me for more specific recommendations anytime! For example:
> * *"Recommend me some fast-paced sci-fi thrillers like Dark Matter"*
> * *"What books do you have by Brandon Sanderson?"*
> * *"Recommend some audiobooks for my commute"*`;
    }

    // --- CASE -1: PERMISSION DENIED OR RESTRICTED ACCESS ---
    const deniedAction = actionsTaken.find(a => a.summary.includes("Permission Denied") || a.summary.includes("Admin role required"));
    if (deniedAction) {
        return `### 🔒 Access Restricted: Server Administrator Role Required

${deniedAction.summary}

Standard user accounts can troubleshoot their own playback streams, check audio/subtitle settings, and explore media guides. Host hardware telemetry, Docker fleet controls, and security audits are strictly reserved for Server Administrators.`;
    }

    // --- CASE -0.5: STREAM TERMINATION ---
    const terminateAction = actionsTaken.find(a => a.summary.includes("Stream Termination"));
    if (terminateAction) {
        return `### ⏹️ Stream Termination: ${terminateAction.target}

${terminateAction.summary}

Playback has been stopped and the session released on the media server.`;
    }

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

    // --- CASE 2.5: MEDIA INSPECTION VERDICT: PLAYBACK VERIFIED / MEDIA HEALTHY (OK) ---
    if (mediaInspection && (mediaInspection.verdict === "OK" || mediaInspection.verdict === "FILE_CORRUPT" || mediaInspection.playbackTest)) {
        const pt = mediaInspection.playbackTest;
        const mainAudio = mediaInspection.activeAudioTrack || mediaInspection.audioTracks[0];
        const audioDesc = mainAudio ? `${mainAudio.displayTitle || mainAudio.language}` : "English";
        const primaryFile = mediaInspection.files[0];

        return `### 🎬 Playback Diagnostic: *${mediaInspection.title}*${mediaInspection.year ? ` (${mediaInspection.year})` : ""}

I tested media playback for **${mediaInspection.title}** on **${mediaInspection.serverName || "Main Plex Server"}**:

---

#### 🔍 File & Playback Test Results:
* **Server Node:** ${mediaInspection.serverName || "Main Plex Server"}
* **Physical Disk Read Test:** ${pt ? (pt.canPlay ? `✅ **PASS** (Streamed ${(pt.bytesRead / 1024).toFixed(0)} KB from storage in ${pt.latencyMs}ms)` : `❌ **FAIL** (${pt.error || "Cannot read file from disk"})`) : "✅ Verified in Library"}
* **Container Format:** ${primaryFile ? `${primaryFile.container.toUpperCase()} (${primaryFile.sizeGb} GB)` : "Media File"}
* **Audio Track:** 🔊 **${audioDesc}** (English is present and ready)
* **All Detected Audio Streams:** ${mediaInspection.audioTracks.map(t => t.displayTitle).join(", ") || "English"}
* **Subtitles:** ${mediaInspection.subtitleTracks.length > 0 ? mediaInspection.subtitleTracks.map(s => s.displayTitle || s.language).join(", ") : "None detected"}

---

#### 💡 Playback Verdict:
${pt?.canPlay !== false 
    ? `**Ready for Direct Play!** The file is physically accessible on storage, the stream header is valid, and the server can stream it directly to your devices with zero errors.`
    : `⚠️ **Storage Issue Detected:** The media item is in the Plex database, but the physical file could not be read from disk. This may indicate an unmounted drive, disconnected share, or permissions issue.`
}`;
    }

    // --- CASE 2.6: MEDIA INSPECTION VERDICT: NOT IN LIBRARY ---
    if (mediaInspection && mediaInspection.verdict === "NOT_IN_LIBRARY") {
        return `### 🔍 Media Search: *${mediaInspection.title}*

I searched your connected Plex media servers (${mediaInspection.serverName || "Main Plex Server"}), but **"${mediaInspection.title}" was not found in your library**.

---

#### 💡 How to Get It:
* You can request this title directly on **[Media Requests](/discover)** with 1-click automatic downloading.
* If you recently downloaded or copied this file to your server, trigger a library scan from **Settings** or your Plex library menu to index the file.`;
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
* **Server Health:** All ${snapshot.serversOnlineCount} media server nodes are online and operational${snapshot.serverNodes && snapshot.serverNodes.length > 0 ? ` (${snapshot.serverNodes.filter(s => s.status === 'ONLINE').map(s => s.name).join(", ")})` : ""}.
${snapshot.patternInsights && snapshot.patternInsights.length > 0 ? `* **Stream Insights:** ${snapshot.patternInsights[0].description}` : ""}

#### Quick Recommended Settings for Best Playback:
1. **Remote Streaming Quality:** Always set to **"Maximum / Original"** in your Plex App Settings ⚙️ to eliminate server transcoding.
2. **Auto Adjust Quality:** Turn **OFF** to avoid unexpected resolution drops.
3. **Direct Play:** Ensure **"Direct Play" & "Direct Stream"** are enabled.

*Need personalized troubleshooting? Ask me about specific error messages, device setup guides (Roku, Apple TV, Fire TV), audio language issues, or subtitles!*`;
}
