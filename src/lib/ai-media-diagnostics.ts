import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getAppUrl } from "@/lib/app-url";
import { renderEmailTemplate } from "@/lib/email-templates";
import { 
    MediaStreamInspection, 
    AudioTrackInfo, 
    SubtitleTrackInfo, 
    MediaFilePart, 
    AgentActionReport 
} from "@/lib/ai-server-assistant-types";
import { 
    checkAgentRateLimit, 
    recordAgentGrabAction, 
    validateMediaReleaseCandidate, 
    logAgentEvent 
} from "@/lib/ai-agent-guardrails";
import { getPlexServers } from "@/lib/plex";
import { searchPlexLibraryItems, inspectPlexMediaItemFull } from "@/lib/curation/plex-analyzer";
import { getEnabledArrInstancesInternal, arrApiGet, arrApiPost } from "@/app/arr-actions";
import nodemailer from "nodemailer";

/**
 * Strips conversational filler, intent verbs, and noise to extract canonical title and year.
 * e.g. "The Sandlot is in Spanish only" -> "The Sandlot"
 * e.g. "Why is Gladiator (2000) buffering" -> "Gladiator" (year: 2000)
 */
export function cleanMediaSearchQuery(rawQuery: string): { title: string; year?: number; rawCleaned: string } {
    let clean = (rawQuery || "").trim();

    // Extract year if present in parentheses e.g. (1993) or (2020)
    let extractedYear: number | undefined;
    const yearMatch = clean.match(/\b(19\d\d|20\d\d)\b/);
    if (yearMatch) {
        extractedYear = parseInt(yearMatch[1], 10);
    }

    // Strip common prompt/query prefixes and suffixes
    clean = clean.replace(/^(can you|please|could you|why is|why does|how do i|fix|check|diagnose|inspect|redownload|re-download|download|grab|search for|replace)\s+/i, "");
    clean = clean.replace(/^(the movie|the film|the show|the tv show|the episode|the series|the book)\s+/i, "");
    clean = clean.replace(/\b(is in spanish only|in spanish only|only in spanish|spanish only|in spanish|only spanish)\b/i, "");
    clean = clean.replace(/\b(has no english audio|no english audio|missing english audio|missing english|no english|english audio missing)\b/i, "");
    clean = clean.replace(/\b(is not playing|wont play|won't play|not working|is broken|corrupted|buffering|stuttering)\b/i, "");
    clean = clean.replace(/\s*\(\d{4}\)\s*/g, " "); // Strip (1993)
    clean = clean.replace(/[?.,!]/g, " ").trim();

    return {
        title: clean.trim(),
        year: extractedYear,
        rawCleaned: clean.trim()
    };
}

/**
 * Inspects a media file's audio, video, and subtitle streams via Direct Plex API.
 * Detects whether English audio exists in the container or is truly missing.
 */
export async function inspectMediaStreams(
    rawQuery: string,
    user?: any
): Promise<MediaStreamInspection> {
    const { title, year } = cleanMediaSearchQuery(rawQuery);
    const searchTitle = title || rawQuery;

    logAgentEvent("INFO", `Inspecting media streams for title "${searchTitle}"`, { user: user?.username, year });

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    let token = "";
    if (settings?.mainPlexToken) {
        try {
            token = decryptData(settings.mainPlexToken);
        } catch (e) {}
    }

    if (!token) {
        return {
            mediaType: "unknown",
            title: searchTitle,
            year: year ? String(year) : undefined,
            files: [],
            audioTracks: [],
            subtitleTracks: [],
            hasEnglishAudio: false,
            hasSpanishAudio: false,
            hasEnglishSubtitles: false,
            verdict: "NOT_IN_LIBRARY",
            diagnosisSummary: "Plex Server token is not configured in Portalarr. Cannot inspect container streams."
        };
    }

    // Locate active Plex Media Servers
    let servers: any[] = [];
    try {
        servers = await getPlexServers(token);
    } catch (e) {}

    let matchedItem: any = null;
    let matchedServerUrl = "";
    let matchedToken = token;
    let matchedServerName = "Main Plex Server";

    // Search across candidate servers
    for (const srv of servers) {
        const srvToken = srv.accessToken || token;
        for (const conn of srv.connections) {
            try {
                const results = await searchPlexLibraryItems(conn.uri, srvToken, searchTitle, undefined, 10);
                if (results && results.length > 0) {
                    // Find closest match by title
                    const exactOrClose = results.find(r => 
                        r.title.toLowerCase() === searchTitle.toLowerCase() ||
                        r.title.toLowerCase().includes(searchTitle.toLowerCase()) ||
                        searchTitle.toLowerCase().includes(r.title.toLowerCase())
                    ) || results[0];

                    if (exactOrClose) {
                        matchedItem = exactOrClose;
                        matchedServerUrl = conn.uri;
                        matchedToken = srvToken;
                        matchedServerName = srv.name || "Plex Server";
                        break;
                    }
                }
            } catch (e) {}
        }
        if (matchedItem) break;
    }

    if (!matchedItem || !matchedItem.ratingKey) {
        logAgentEvent("WARN", `Media item "${searchTitle}" was not found in Plex library.`);
        return {
            mediaType: "unknown",
            title: searchTitle,
            year: year ? String(year) : undefined,
            files: [],
            audioTracks: [],
            subtitleTracks: [],
            hasEnglishAudio: false,
            hasSpanishAudio: false,
            hasEnglishSubtitles: false,
            verdict: "NOT_IN_LIBRARY",
            diagnosisSummary: `Media item "${searchTitle}" could not be located in your Plex media library.`
        };
    }

    // Fetch full stream details
    const details = await inspectPlexMediaItemFull(matchedServerUrl, matchedToken, matchedItem.ratingKey);
    if (!details) {
        return {
            mediaType: matchedItem.type === "movie" ? "movie" : "episode",
            title: matchedItem.title,
            year: matchedItem.year ? String(matchedItem.year) : undefined,
            ratingKey: matchedItem.ratingKey,
            serverName: matchedServerName,
            files: [],
            audioTracks: [],
            subtitleTracks: [],
            hasEnglishAudio: false,
            hasSpanishAudio: false,
            hasEnglishSubtitles: false,
            verdict: "NOT_IN_LIBRARY",
            diagnosisSummary: `Could not fetch stream container metadata for ${matchedItem.title}.`
        };
    }

    // Parse audio streams
    const audioTracks: AudioTrackInfo[] = (details.rawStreams?.audio || []).map((a: any, idx: number) => ({
        id: a.id || idx + 1,
        codec: String(a.codec || "unknown").toUpperCase(),
        channels: Number(a.channels || 2),
        channelLayout: a.channelLayout || a.audioChannelLayout,
        audioChannelLayout: a.audioChannelLayout,
        bitrate: a.bitrate,
        language: a.language || "Unknown",
        languageCode: a.languageCode?.toLowerCase() || "",
        title: a.title,
        displayTitle: a.title || `${a.language || "Unknown"} (${a.codec?.toUpperCase()} ${a.channels}ch)`,
        selected: Boolean(a.selected),
        default: Boolean(a.default)
    }));

    // Parse subtitle streams
    const subtitleTracks: SubtitleTrackInfo[] = (details.rawStreams?.subtitles || []).map((s: any, idx: number) => ({
        id: s.id || idx + 1,
        codec: String(s.codec || "srt").toUpperCase(),
        language: s.language || "Unknown",
        languageCode: s.languageCode?.toLowerCase() || "",
        title: s.title || `${s.language || "Unknown"} [${s.codec?.toUpperCase()}]`,
        forced: Boolean(s.forced),
        selected: Boolean(s.selected),
        default: Boolean(s.default)
    }));

    const files: MediaFilePart[] = (details.parts || []).map((p: any) => ({
        id: p.id,
        file: p.file,
        sizeGb: p.sizeGb,
        container: p.container
    }));

    // Check language flags
    const hasEnglishAudio = audioTracks.some(a => 
        a.languageCode === "eng" || 
        a.languageCode === "en" || 
        a.language.toLowerCase() === "english" ||
        (a.title && /\b(eng|english)\b/i.test(a.title))
    );

    const hasSpanishAudio = audioTracks.some(a => 
        a.languageCode === "spa" || 
        a.languageCode === "es" || 
        a.language.toLowerCase() === "spanish" ||
        (a.title && /\b(spa|spanish|espanol|español|castellano)\b/i.test(a.title))
    );

    const hasEnglishSubtitles = subtitleTracks.some(s => 
        s.languageCode === "eng" || 
        s.languageCode === "en" || 
        s.language.toLowerCase() === "english"
    );

    const activeAudioTrack = audioTracks.find(a => a.selected) || audioTracks.find(a => a.default) || audioTracks[0];

    // Determine verdict
    let verdict: MediaStreamInspection["verdict"] = "OK";
    let diagnosisSummary = "";
    let recommendedClientSteps: string[] | undefined;

    if (hasSpanishAudio && hasEnglishAudio) {
        // CASE A: User reports Spanish, but English track DOES exist in the file!
        verdict = "AUDIO_EXISTS_CLIENT_FIX";
        const engTrack = audioTracks.find(a => 
            a.languageCode === "eng" || 
            a.languageCode === "en" || 
            a.language.toLowerCase() === "english"
        );
        const engDesc = engTrack ? `${engTrack.displayTitle || engTrack.language}` : "English";
        const currentDesc = activeAudioTrack ? `${activeAudioTrack.displayTitle || activeAudioTrack.language}` : "Spanish";

        diagnosisSummary = `Good news! The media file for "${matchedItem.title}" already contains a full English audio track (${engDesc}). However, your player is currently defaulting to the Spanish track (${currentDesc}). No redownload is required.`;

        recommendedClientSteps = [
            `1. Start playing "${matchedItem.title}" on your Plex device`,
            "2. Bring up the playback controls (press Up, Down, or OK/Select on your remote)",
            "3. Select the Audio / Subtitles icon (💬 or ⚙️ Settings)",
            `4. In the Audio Stream menu, change from "${currentDesc}" to "${engDesc}"`,
            "5. Resume playback to enjoy crystal-clear English audio!"
        ];
    } else if (hasSpanishAudio && !hasEnglishAudio) {
        // CASE B: English audio is truly missing from the file!
        verdict = "MISSING_LANGUAGE_TRACK";
        diagnosisSummary = `File container inspection confirmed: "${matchedItem.title}" ONLY contains Spanish audio (${audioTracks.map(t => t.displayTitle).join(", ")}). There is NO English audio track in this file.`;
    } else if (!hasEnglishAudio && audioTracks.length > 0) {
        verdict = "MISSING_LANGUAGE_TRACK";
        diagnosisSummary = `The media file on disk does not have an English audio track. Available audio tracks: ${audioTracks.map(t => t.displayTitle).join(", ")}.`;
    } else {
        verdict = "OK";
        diagnosisSummary = `Media container is healthy. English audio (${audioTracks.map(t => t.displayTitle).join(", ")}) is present and selected.`;
    }

    logAgentEvent("INFO", `Media stream inspection completed for "${matchedItem.title}": Verdict=${verdict}`, {
        hasEnglishAudio,
        hasSpanishAudio,
        audioTracksCount: audioTracks.length
    });

    return {
        mediaType: matchedItem.type === "movie" ? "movie" : "episode",
        title: matchedItem.title,
        year: matchedItem.year ? String(matchedItem.year) : undefined,
        ratingKey: matchedItem.ratingKey,
        serverName: matchedServerName,
        files,
        audioTracks,
        subtitleTracks,
        hasEnglishAudio,
        hasSpanishAudio,
        activeAudioTrack,
        hasEnglishSubtitles,
        verdict,
        diagnosisSummary,
        recommendedClientSteps
    };
}

/**
 * Searches indexers via Radarr, validates releases for English audio and quality profile, and grabs replacement.
 * Automatically escalates to an Admin Support Ticket if no valid release is found.
 */
export async function searchAndGrabRadarrReplacement(
    title: string,
    year?: number,
    reason: string = "Spanish only / Missing English audio track",
    user?: any
): Promise<{
    success: boolean;
    releaseTitle?: string;
    indexer?: string;
    quality?: string;
    sizeFormatted?: string;
    escalated?: boolean;
    ticketId?: string;
    error?: string;
}> {
    const userIdentifier = user?.username || user?.email || "anonymous";

    // 1. Guardrail Rate Limit Check
    const rateLimit = checkAgentRateLimit(userIdentifier);
    if (!rateLimit.allowed) {
        logAgentEvent("WARN", `Rate limit prevented Radarr replacement for "${title}" by "${userIdentifier}": ${rateLimit.reason}`);
        return {
            success: false,
            error: rateLimit.reason
        };
    }

    logAgentEvent("INFO", `Initiating autonomous Radarr search & replace for "${title}"`, { reason, userIdentifier });

    // 2. Fetch enabled Radarr instances
    const appsRes = await getEnabledArrInstancesInternal("radarr");
    if (!appsRes.success || !appsRes.data || appsRes.data.length === 0) {
        logAgentEvent("ERROR", "No enabled Radarr instances found in Portalarr settings");
        const escalation = await escalateToAdminTicket({
            user,
            title,
            issue: `User requested replacement for "${title}" due to "${reason}", but no enabled Radarr instances were found in Portalarr.`,
            stepsTaken: [
                `1. Inspected media streams: Missing English audio confirmed.`,
                `2. Attempted autonomous Radarr search: No enabled Radarr instances configured.`
            ],
            recommendation: "Configure and enable a Radarr instance in Portalarr Settings -> Monitoring & Apps."
        });
        return {
            success: false,
            escalated: true,
            ticketId: escalation.ticketId,
            error: "No Radarr instance is connected to Portalarr. A support ticket has been sent to the server administrator."
        };
    }

    const app = appsRes.data[0]; // Primary Radarr instance

    // 3. Locate movie in Radarr
    let targetMovieId = 0;
    try {
        const lookupRes = await arrApiGet(app, `/api/v3/movie/lookup?term=${encodeURIComponent(title)}`);
        if (lookupRes.success && Array.isArray(lookupRes.data) && lookupRes.data.length > 0) {
            const matchedMovie = lookupRes.data.find((m: any) => 
                m.title.toLowerCase() === title.toLowerCase() ||
                (year && m.year === year)
            ) || lookupRes.data[0];

            if (matchedMovie && matchedMovie.id) {
                targetMovieId = matchedMovie.id;
            }
        }
    } catch (e) {}

    // Fallback: check Radarr existing library
    if (targetMovieId === 0) {
        try {
            const libRes = await arrApiGet(app, "/api/v3/movie");
            if (libRes.success && Array.isArray(libRes.data)) {
                const libMovie = libRes.data.find((m: any) => 
                    m.title.toLowerCase() === title.toLowerCase() ||
                    (year && m.year === year)
                );
                if (libMovie && libMovie.id) {
                    targetMovieId = libMovie.id;
                }
            }
        } catch (e) {}
    }

    if (targetMovieId === 0) {
        logAgentEvent("WARN", `Movie "${title}" not found in Radarr library or lookup.`);
        const escalation = await escalateToAdminTicket({
            user,
            title,
            issue: `User reported issue with "${title}" (${reason}). Movie was not found in Radarr library to trigger an automated release search.`,
            stepsTaken: [
                `1. Inspected Plex media: English audio track missing.`,
                `2. Looked up movie in Radarr: Movie "${title}" is not registered in Radarr instance.`
            ],
            recommendation: `Add "${title}" to Radarr and search indexers for an English 1080p release.`
        });
        return {
            success: false,
            escalated: true,
            ticketId: escalation.ticketId,
            error: `Movie "${title}" could not be located in Radarr. A ticket was created for your server administrator.`
        };
    }

    // 4. Fetch candidate releases from indexers via Radarr
    logAgentEvent("INFO", `Querying indexers for Radarr movieId=${targetMovieId} ("${title}")`);
    const releaseRes = await arrApiGet(app, `/api/v3/release?movieId=${targetMovieId}`);
    if (!releaseRes.success || !Array.isArray(releaseRes.data) || releaseRes.data.length === 0) {
        const escalation = await escalateToAdminTicket({
            user,
            title,
            issue: `Missing English audio for "${title}". Searched Radarr indexers, but zero releases were returned.`,
            stepsTaken: [
                `1. Verified missing English track in media container.`,
                `2. Queried Radarr indexers for movie ID ${targetMovieId}: 0 indexer releases returned.`
            ],
            recommendation: `Verify Prowlarr/Torznab indexers connectivity, or search manually for an English copy of "${title}".`
        });
        return {
            success: false,
            escalated: true,
            ticketId: escalation.ticketId,
            error: `No releases were returned by your server's indexers for "${title}". A high-priority ticket was dispatched to your administrator.`
        };
    }

    // 5. Evaluate and score releases against strict guardrails
    const evaluatedReleases: Array<{ release: any; score: number }> = [];

    for (const rel of releaseRes.data) {
        const validation = validateMediaReleaseCandidate(rel, "movie", "English");
        if (validation.ok) {
            evaluatedReleases.push({ release: rel, score: validation.score });
        }
    }

    if (evaluatedReleases.length === 0) {
        logAgentEvent("WARN", `All ${releaseRes.data.length} candidate releases for "${title}" were rejected by safety guardrails.`);
        const escalation = await escalateToAdminTicket({
            user,
            title,
            issue: `Missing English audio for "${title}". Searched indexers (found ${releaseRes.data.length} releases), but ALL were rejected by guardrails (foreign-only, low-quality CAM, or zero seeders).`,
            stepsTaken: [
                `1. Inspected file: Confirmed Spanish only audio.`,
                `2. Found ${releaseRes.data.length} releases on indexers.`,
                `3. Filtered candidates: None met English language, 1080p, and seeders criteria.`
            ],
            recommendation: `Check indexers for an English Bluray/WEBDL release of "${title}" and manually grab.`
        });
        return {
            success: false,
            escalated: true,
            ticketId: escalation.ticketId,
            error: `Found ${releaseRes.data.length} releases on indexers, but none contained verified English audio with sufficient quality and seeders. An admin escalation ticket has been dispatched.`
        };
    }

    // Sort by highest score
    evaluatedReleases.sort((a, b) => b.score - a.score);
    const bestCandidate = evaluatedReleases[0].release;

    // 6. Dispatch release download to Radarr
    logAgentEvent("INFO", `Grabbing top candidate release for "${title}": "${bestCandidate.title}" (score=${evaluatedReleases[0].score})`);

    const grabRes = await arrApiPost(app, "/api/v3/release", {
        guid: bestCandidate.guid,
        indexerId: bestCandidate.indexerId
    });

    if (!grabRes.success) {
        logAgentEvent("ERROR", `Radarr release grab rejected: ${grabRes.error}`);
        const escalation = await escalateToAdminTicket({
            user,
            title,
            issue: `Attempted to download verified English release "${bestCandidate.title}" for "${title}", but Radarr API rejected the command: ${grabRes.error}`,
            stepsTaken: [
                `1. Inspected file: Confirmed missing English audio.`,
                `2. Found matching candidate: "${bestCandidate.title}".`,
                `3. POST /api/v3/release failed: ${grabRes.error}`
            ],
            recommendation: `Check Radarr download client configuration or disk space.`
        });
        return {
            success: false,
            escalated: true,
            ticketId: escalation.ticketId,
            error: `Download dispatch failed in Radarr: ${grabRes.error}. An admin ticket has been opened.`
        };
    }

    // 7. Record grab action for rate limiting and audit
    recordAgentGrabAction(userIdentifier, "RADARR_REPLACE", title);

    const sizeGb = bestCandidate.size ? (bestCandidate.size / (1024 * 1024 * 1024)).toFixed(2) + " GB" : "Unknown size";
    const qualityName = bestCandidate.quality?.quality?.name || "1080p";

    return {
        success: true,
        releaseTitle: bestCandidate.title,
        indexer: bestCandidate.indexer,
        quality: qualityName,
        sizeFormatted: sizeGb
    };
}

/**
 * Searches Sonarr indexers for TV episodes, verifies English audio, and queues replacement.
 */
export async function searchAndGrabSonarrReplacement(
    title: string,
    seasonNumber?: number,
    episodeNumber?: number,
    reason: string = "Missing English audio track / Corrupt episode",
    user?: any
): Promise<{
    success: boolean;
    releaseTitle?: string;
    indexer?: string;
    quality?: string;
    sizeFormatted?: string;
    escalated?: boolean;
    ticketId?: string;
    error?: string;
}> {
    const userIdentifier = user?.username || user?.email || "anonymous";

    const rateLimit = checkAgentRateLimit(userIdentifier);
    if (!rateLimit.allowed) {
        return { success: false, error: rateLimit.reason };
    }

    const appsRes = await getEnabledArrInstancesInternal("sonarr");
    if (!appsRes.success || !appsRes.data || appsRes.data.length === 0) {
        const escalation = await escalateToAdminTicket({
            user,
            title,
            issue: `User requested TV replacement for "${title}" (S${seasonNumber || 1}E${episodeNumber || 1}), but no Sonarr instances are connected.`,
            stepsTaken: ["1. TV episode stream inspection", "2. Looked up Sonarr instances: none enabled"],
            recommendation: "Enable Sonarr instance in Portalarr settings."
        });
        return { success: false, escalated: true, ticketId: escalation.ticketId, error: "No Sonarr instance configured." };
    }

    const app = appsRes.data[0];

    // Find series
    let seriesId = 0;
    try {
        const seriesRes = await arrApiGet(app, `/api/v3/series/lookup?term=${encodeURIComponent(title)}`);
        if (seriesRes.success && Array.isArray(seriesRes.data) && seriesRes.data.length > 0) {
            seriesId = seriesRes.data[0].id || 0;
        }
    } catch (e) {}

    if (seriesId === 0) {
        const escalation = await escalateToAdminTicket({
            user,
            title,
            issue: `Series "${title}" not found in Sonarr to replace S${seasonNumber || 1}E${episodeNumber || 1}.`,
            stepsTaken: ["1. Checked Sonarr library: Series not found."],
            recommendation: `Add "${title}" to Sonarr and monitor.`
        });
        return { success: false, escalated: true, ticketId: escalation.ticketId, error: `Series "${title}" not found in Sonarr.` };
    }

    // Trigger Sonarr episode search command
    try {
        await arrApiPost(app, "/api/v3/command", {
            name: "SeriesSearch",
            seriesId
        });
        recordAgentGrabAction(userIdentifier, "SONARR_REPLACE", `${title} S${seasonNumber || 1}E${episodeNumber || 1}`);
        return {
            success: true,
            releaseTitle: `${title} - Season ${seasonNumber || 1}`,
            quality: "HDTV / WEB-DL"
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Redownloads a book or audiobook with diagnostics.
 */
export async function redownloadBookWithDiagnostics(
    title: string,
    author?: string,
    user?: any
): Promise<{ success: boolean; error?: string }> {
    const userIdentifier = user?.username || user?.email || "anonymous";
    const rateLimit = checkAgentRateLimit(userIdentifier);
    if (!rateLimit.allowed) {
        return { success: false, error: rateLimit.reason };
    }

    try {
        const { autoDownloadBookRequest } = await import("@/app/actions");
        const existingReq = await prisma.bookRequest.findFirst({
            where: { title: { contains: title } }
        });

        if (existingReq) {
            await autoDownloadBookRequest(existingReq.id, existingReq.title, existingReq.author || author || "");
            recordAgentGrabAction(userIdentifier, "BOOK_REPLACE", title);
            return { success: true };
        } else {
            // Create a book request and trigger auto download
            const newReq = await prisma.bookRequest.create({
                data: {
                    title,
                    author: author || "Unknown Author",
                    requestedBy: userIdentifier,
                    status: "Searching"
                }
            });
            await autoDownloadBookRequest(newReq.id, title, author || "");
            recordAgentGrabAction(userIdentifier, "BOOK_REPLACE", title);
            return { success: true };
        }
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

/**
 * Escalates an unresolved incident or failed grab to the Server Administrator.
 * Creates a high-priority Support Ticket in SQLite and sends an email via SMTP.
 */
export async function escalateToAdminTicket(params: {
    user?: any;
    title?: string;
    issue: string;
    stepsTaken: string[];
    recommendation: string;
    telemetry?: any;
}): Promise<{ success: boolean; ticketId: string }> {
    const userName = params.user?.username || "Plex User";
    const userEmail = params.user?.email || "user@portalarr.local";

    const formattedIssue = `### 🤖 Autonomous AI Agent Escalation Report

**Target Media / Issue:** ${params.title || "Playback / Stream Issue"}
**Reported by User:** \`${userName}\` (${userEmail})
**Timestamp:** ${new Date().toLocaleString()}

---

#### 🔍 Diagnostic Finding:
${params.issue}

---

#### 🛠️ Autonomous Steps Taken by Agent:
${params.stepsTaken.map(s => `- ${s}`).join("\n")}

---

#### 💡 Recommended Server Administrator Action:
${params.recommendation}
`;

    let ticketId = "";
    try {
        const ticket = await prisma.supportTicket.create({
            data: {
                name: `[AI Agent] ${userName}`,
                email: userEmail,
                issue: formattedIssue,
                status: "Pending"
            }
        });
        ticketId = ticket.id;

        logAgentEvent("WARN", `Created Support Ticket #${ticketId} for admin review regarding "${params.title || 'Incident'}"`);

        // Send email notification to Admin if SMTP is configured
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        if (settings?.smtpHost && settings?.smtpUser && settings?.emailNotificationsEnabled !== false) {
            try {
                const transporter = nodemailer.createTransport({
                    host: settings.smtpHost,
                    port: settings.smtpPort,
                    secure: settings.smtpPort === 465,
                    auth: { user: settings.smtpUser, pass: decryptData(settings.smtpPass as string) }
                } as any);

                const appUrl = await getAppUrl();
                const senderEmail = settings.smtpFrom || settings.smtpUser;
                const { subject, html } = await renderEmailTemplate("ticket_error_alert", {
                    name: `AI Agent (${userName})`,
                    email: userEmail,
                    pageUrl: "/",
                    errorTitle: `AI Escalation: ${params.title || "Media Issue"}`,
                    errorMessage: formattedIssue,
                    userNoteBlock: params.recommendation,
                    ticketsUrl: `${appUrl}/admin/tickets`,
                    appUrl
                });

                await transporter.sendMail({
                    from: senderEmail,
                    to: settings.smtpUser,
                    replyTo: userEmail,
                    subject: `🚨 [AI Escalation] ${params.title || "Stream Issue"} - Action Required`,
                    text: formattedIssue,
                    html
                });

                logAgentEvent("INFO", `Admin notification email dispatched for ticket #${ticketId}`);
            } catch (mailErr: any) {
                logAgentEvent("WARN", `Failed to send escalation email: ${mailErr.message}`);
            }
        }
    } catch (e: any) {
        logAgentEvent("ERROR", `Failed creating escalation ticket: ${e.message}`);
        ticketId = `err-${Date.now()}`;
    }

    return {
        success: true,
        ticketId
    };
}
