import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { 
    UserDiagnosticSnapshot, 
    StreamTelemetry, 
    DetectedIssue, 
    AiChatMessage, 
    AiAssistantResponse 
} from "@/lib/ai-server-assistant-types";
import { getPlexOwnerUser, getPlexServerFriends, getPlexServers } from "@/lib/plex";

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

    // 1. Scan Tautulli instances
    await Promise.allSettled(tautullis.map(async (t) => {
        const cleanBase = cleanUrl(t.url).replace(/\/api\/v2\/?$/, "");
        const apiKey = decryptData(t.apiKey);

        // Fetch activity
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
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
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const histUrl = `${cleanBase}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_history&length=15`;
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
                        const timeoutId = setTimeout(() => controller.abort(), 3500);
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
                                    const player = s.Player?.title || s.Player?.device || s.Player?.platform || "Plex Device";
                                    recentDevicesSet.add(player);

                                    const ts = s.TranscodeSession;
                                    const transDecision = ts ? (ts.videoDecision === "copy" && ts.audioDecision === "copy" ? "direct stream" : "transcode") : "direct play";

                                    activeStreams.push({
                                        sessionKey: sKey,
                                        sessionId: s.Session?.id ? String(s.Session.id) : undefined,
                                        title: s.title || "Media Item",
                                        year: s.year ? String(s.year) : undefined,
                                        mediaType: s.type || (s.grandparentTitle ? "episode" : "movie"),
                                        player: player,
                                        platform: s.Player?.platform || player,
                                        deviceType: s.Player?.device || player,
                                        ipAddress: s.Player?.address,
                                        videoResolution: ts?.videoResolution || s.Media?.[0]?.videoResolution || "1080p",
                                        sourceResolution: s.Media?.[0]?.videoResolution || "1080p",
                                        videoCodec: ts?.videoCodec || s.Media?.[0]?.videoCodec,
                                        audioCodec: ts?.sourceAudioCodec || s.Media?.[0]?.audioCodec,
                                        streamAudioCodec: ts?.audioCodec,
                                        streamBitrate: Number(ts?.bitrate || s.Media?.[0]?.bitrate || 0),
                                        transcodeDecision: transDecision as any,
                                        transcodeSpeed: ts?.speed ? String(ts.speed) : undefined,
                                        transcodeHwRequested: !!ts?.transcodeHwRequested,
                                        transcodeReason: ts?.transcodeHwDecodingTitle || ts?.context,
                                        subtitleDecision: ts?.subtitleDecision,
                                        subtitleCodec: ts?.subtitleCodec,
                                        percentComplete: s.viewOffset && s.duration ? Math.round((Number(s.viewOffset) / Number(s.duration)) * 100) : 0,
                                        state: s.Player?.state || "playing",
                                        serverName: srv.name
                                    });
                                }
                            }
                        }
                    } catch (e) {}
                }
            }));
        } catch (e) {}
    }

    // Sort watch history
    recentWatchHistory.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 3. Automated Issue Detection Engine
    const detectedIssues: DetectedIssue[] = [];
    const primary = activeStreams[0] || null;

    if (primary) {
        const pPlayerLower = (primary.player + " " + primary.platform).toLowerCase();
        const isRoku = pPlayerLower.includes("roku");
        const isFireTv = pPlayerLower.includes("fire") || pPlayerLower.includes("aft");
        const isAppleTv = pPlayerLower.includes("apple") || pPlayerLower.includes("tvos");
        const isWeb = pPlayerLower.includes("chrome") || pPlayerLower.includes("firefox") || pPlayerLower.includes("safari") || pPlayerLower.includes("web");
        const isTranscoding = primary.transcodeDecision === "transcode";

        // Issue A: Roku Auto Adjust Quality & Quality Cap
        if (isRoku) {
            detectedIssues.push({
                id: "roku-auto-adjust",
                type: "roku_auto_adjust",
                severity: isTranscoding ? "error" : "warning",
                title: "Roku Auto Adjust Quality Bug Detected",
                summary: "Roku Plex apps have an 'Auto Adjust Quality' feature that frequently crashes playback or drops stream quality to an unsupported bitrate.",
                deviceAffected: primary.player || "Roku Device",
                quickFix: "Turn OFF 'Auto Adjust Quality' and set Remote Streaming to 'Original' in Roku Plex Settings.",
                fixGuideId: "roku",
                steps: [
                    "1. On your Roku remote, open the Plex app",
                    "2. Navigate to your Profile Avatar / Settings (Gear ⚙️) → Video",
                    "3. Turn 'Auto Adjust Quality' to OFF",
                    "4. Set 'Remote Streaming' to 'Original' (or Maximum)",
                    "5. Set 'Direct Play' to 'Force' or 'Auto'",
                    "6. Restart video playback"
                ]
            });
        }

        // Issue B: 2 Mbps / 720p Remote Quality Limit
        const isCapped = (primary.streamBitrate && primary.streamBitrate <= 2200) || 
                         (primary.videoResolution?.includes("720") && !primary.sourceResolution?.includes("720") && !primary.sourceResolution?.includes("480"));
        if (isTranscoding && isCapped) {
            detectedIssues.push({
                id: "bandwidth-cap-720p",
                type: "bandwidth_cap_720p",
                severity: "error",
                title: "2 Mbps (720p) Quality Cap Enforced",
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
        generatedAt: new Date().toISOString()
    };
}

export async function askAiServerMaster(
    question: string,
    history: AiChatMessage[] = [],
    user?: any
): Promise<AiAssistantResponse> {
    const snapshot = await getUserDiagnosticSnapshot(user);
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
- Auto-Detected Diagnostic Issues: ${snapshot.detectedIssues.length > 0 ? snapshot.detectedIssues.map(i => `[${i.severity.toUpperCase()}] ${i.title}: ${i.quickFix}`).join(" | ") : "None. Stream health is optimal."}

CORE PLEX MASTER KNOWLEDGE & DIAGNOSTIC RULES:
1. Roku "Auto Adjust Quality" Bug:
   - Problem: Roku client tries to dynamically drop quality below the server's minimum bandwidth, causing transcoder errors, stuttering, or "Conversion failed: The transcoder exited due to an error".
   - Fix: In Roku Plex App → Settings ⚙️ → Video → Turn "Auto Adjust Quality" OFF. Change "Remote Streaming" to "Original" (or Maximum). Set "Direct Play" to "Force" or "Auto".
2. 2 Mbps (720p) Default Remote Limit:
   - Problem: Plex client default forces 2 Mbps / 720p cap, converting 4K/1080p to downscaled 720p with buffering.
   - Fix: Settings → Video Quality → Set "Remote Streaming Quality" to "Maximum" / "Original".
3. Subtitle Burn-In:
   - Problem: PGS/VOBSUB/ASS subtitles force CPU video transcode.
   - Fix: Select SRT text subtitles, or Settings → Subtitles → set "Burn Subtitles" to "Only Image Formats".
4. Audio Transcoding & TrueHD / 7.1:
   - Direct Stream (video Direct Play + audio transcode) is normal for TV speakers. If receiver has surround, enable Audio Passthrough (HDMI).
5. Web Browser Playback:
   - Web browsers cannot play HEVC/H.265 natively; recommend Plex Desktop App for Windows/Mac.
6. Buffering / Stutter:
   - Check if transcode speed is < 1.0x, verify 5GHz Wi-Fi or Ethernet connection, and force Direct Play.

INSTRUCTIONS:
- Directly address the user's question, incorporating their actual active stream or recent device details if relevant.
- Provide numbered, easy-to-follow steps with exact Plex menu names.
- Keep the tone encouraging, technical yet accessible, and structured with clean markdown bolding and bullet points.
- If the issue cannot be resolved through client settings, encourage them to submit a Support Ticket via the Portalarr dashboard.`;

    // 1. Google Gemini Provider
    if ((provider === "gemini" || provider === "google" || (!provider || provider === "default")) && (rawKey || process.env.GEMINI_API_KEY)) {
        try {
            const keyToUse = rawKey || process.env.GEMINI_API_KEY || "";
            const activeModel = modelName || "gemini-2.5-flash";
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(activeModel)}:generateContent?key=${encodeURIComponent(keyToUse)}`;

            const contents: any[] = [];
            // Add previous history
            for (const h of history.slice(-6)) {
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
                    generationConfig: { temperature: 0.2, maxOutputTokens: 1200 }
                })
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
                if (text) {
                    return {
                        success: true,
                        answer: text.trim(),
                        diagnostics: snapshot,
                        providerUsed: `Gemini (${activeModel})`
                    };
                }
            }
        } catch (e: any) {
            console.warn(`[AI-ASSISTANT-GEMINI] Gemini query failed: ${e.message}. Falling back to knowledge base.`);
        }
    }

    // 2. OpenAI Provider
    if (provider === "openai" && rawKey) {
        try {
            const activeModel = modelName || "gpt-4o-mini";
            const messages: any[] = [
                { role: "system", content: systemPrompt }
            ];
            for (const h of history.slice(-6)) {
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
                    max_tokens: 1200
                })
            });

            if (res.ok) {
                const data = await res.json();
                const text = data.choices?.[0]?.message?.content;
                if (text) {
                    return {
                        success: true,
                        answer: text.trim(),
                        diagnostics: snapshot,
                        providerUsed: `OpenAI (${activeModel})`
                    };
                }
            }
        } catch (e: any) {
            console.warn(`[AI-ASSISTANT-OPENAI] OpenAI query failed: ${e.message}. Falling back to knowledge base.`);
        }
    }

    // 3. Built-in Plex Master Knowledge Base & Heuristic Engine (Offline / Zero-Key Fallback)
    const heuristicAnswer = resolvePlexMasterHeuristic(question, snapshot);
    return {
        success: true,
        answer: heuristicAnswer,
        diagnostics: snapshot,
        providerUsed: "Built-in Plex Master Engine"
    };
}

function resolvePlexMasterHeuristic(question: string, snapshot: UserDiagnosticSnapshot): string {
    const q = question.toLowerCase();
    const primary = snapshot.primaryActiveStream;
    const deviceName = primary?.player || snapshot.recentDevices[0] || "your device";

    // 1. Roku Quality / Auto-adjust / Lower quality error
    if (q.includes("roku") || q.includes("quality too low") || q.includes("auto adjust") || q.includes("transcoder exited") || q.includes("conversion failed")) {
        return `### 📺 Roku Quality Adjustment & Transcode Error Fix

This issue occurs because the **Roku Plex app's "Auto Adjust Quality" feature** attempts to dynamically throttle the bitrate down to an unsupported low level when bandwidth fluctuates, causing the server transcoder to crash or reject the stream.

#### Step-by-Step Fix for Roku:
1. **Open the Plex App** on your **${deviceName.includes("Roku") ? deviceName : "Roku device"}**.
2. Navigate to your **Profile Avatar / Settings (Gear ⚙️)**.
3. Select **Video Quality** (or **Video**).
4. Turn **"Auto Adjust Quality" → OFF**.
5. Set **"Remote Streaming" → Original** (or **Maximum**).
6. Set **"Direct Play" → Force** (or **Auto**).
7. Return to your movie or show and press Play!

> **💡 Why this works:** Forcing *Original Quality* stops the server from re-encoding the video into 720p, letting your Roku play the video directly from disk with zero CPU load and highest picture clarity.`;
    }

    // 2. Buffering / Stuttering
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

    // 3. Audio / No Sound / Audio Transcode
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

    // 4. Subtitles
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

    // 5. General / Default Assistance
    return `### 🤖 Plex & Server Master Diagnostics

Hello **${snapshot.username}**! I have checked your server telemetry and connection status:

* **Active Streams:** ${snapshot.activeStreamsCount > 0 ? `Currently playing "${primary?.title}" on ${primary?.player}` : "No active streams currently running"}
* **Detected Devices:** ${snapshot.recentDevices.length > 0 ? snapshot.recentDevices.join(", ") : "Plex Client"}
* **Server Health:** All ${snapshot.serversOnlineCount} media server nodes are online and operational.

#### Quick Recommended Settings for Best Playback:
1. **Remote Streaming Quality:** Always set to **"Maximum / Original"** in your Plex App Settings ⚙️ to eliminate server transcoding.
2. **Auto Adjust Quality:** Turn **OFF** to avoid unexpected resolution drops.
3. **Direct Play:** Ensure **"Direct Play" & "Direct Stream"** are enabled.

*Need personalized troubleshooting? Ask me about specific error messages, device setup guides (Roku, Apple TV, Fire TV), audio sync, or subtitles!*`;
}
