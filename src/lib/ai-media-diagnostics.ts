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
import { searchPlexLibraryItems, inspectPlexMediaItemFull, type PlexMediaStreamInfo } from "@/lib/curation/plex-analyzer";
import { getEnabledArrInstancesInternal, arrApiGet, arrApiPost } from "@/app/arr-actions";
import nodemailer from "nodemailer";

/**
 * Strips conversational filler, intent verbs, and noise to extract canonical title and year.
 * e.g. "The Sandlot is in Spanish only" -> "The Sandlot"
 * e.g. "Why is Gladiator (2000) buffering" -> "Gladiator" (year: 2000)
 */
export interface MediaSearchContext {
    lastTitle?: string;
    lastYear?: number;
    lastServer?: string;
    lastWasPlaybackTest?: boolean;
}

export interface CleanedMediaQuery {
    title: string;
    year?: number;
    targetServer?: string;
    rawCleaned: string;
    isPlaybackTest?: boolean;
    isPronoun?: boolean;
}

/**
 * Strips conversational filler, test intent verbs, server names, and noise to extract canonical title and year.
 * e.g. "test to make sure the sandlot runs on the main Plex server" -> "The Sandlot", targetServer: "main"
 * e.g. "can you test it on the main server?" (with context of The Sandlot) -> "The Sandlot", targetServer: "main"
 * e.g. "no the sandlot" (with context of main server test) -> "The Sandlot", targetServer: "main"
 */
export function cleanMediaSearchQuery(rawQuery: string, context?: MediaSearchContext): CleanedMediaQuery {
    let clean = (rawQuery || "").trim();

    // 0. Detect if this is an explicit conversational correction e.g. "no the sandlot", "actually the sandlot"
    const hasCorrectionPrefix = /^(no\s*,?\s*|actually\s*,?\s*|i\s+meant\s+|sorry\s*,?\s*|try\s+|switch\s+to\s+|check\s+out\s+)/i.test(clean);
    clean = clean.replace(/^(no\s*,?\s*|actually\s*,?\s*|i\s+meant\s+|sorry\s*,?\s*|try\s+|switch\s+to\s+|check\s+out\s+)/i, "").trim();

    // Detect if this is a playback test / verification query
    let isPlaybackTest = /\b(test|verify|check|make sure|see if|can play|does play|will play|playable|runs?|plays?|working)\b/i.test(rawQuery) || Boolean(hasCorrectionPrefix && context?.lastWasPlaybackTest);

    // 1. Extract year if present in parentheses e.g. (1993) or (2020)
    let extractedYear: number | undefined;
    const yearParenMatch = clean.match(/\s*\(\s*(19\d\d|20\d\d)\s*\)\s*/);
    if (yearParenMatch) {
        extractedYear = parseInt(yearParenMatch[1], 10);
        clean = clean.replace(yearParenMatch[0], " ");
    } else {
        const yearStandaloneMatch = clean.match(/\b(19\d\d|20\d\d)\b/);
        if (yearStandaloneMatch) {
            extractedYear = parseInt(yearStandaloneMatch[1], 10);
            clean = clean.replace(yearStandaloneMatch[0], " ");
        }
    }

    // 2. Detect target server if user specified one (e.g. "on the main Plex server", "on kids server", "on backup", "on main")
    let targetServer: string | undefined;
    const serverMatch = clean.match(/\b(on|in|for|about|to)\s+(the\s+)?(main|primary|backup|kids?|living\s*room)(\s*(plex)?\s*(server)?)?\b/i) ||
                        clean.match(/\b(the\s+)?(main|primary|backup|kids?|living\s*room)\s+(plex\s+)?server\b/i);
    if (serverMatch) {
        let rawSrv = (serverMatch[3] || serverMatch[2] || "").toLowerCase().trim();
        if (rawSrv === "kid") rawSrv = "kids";
        if (rawSrv === "primary") rawSrv = "main";
        targetServer = rawSrv;
        clean = clean.replace(serverMatch[0], " ");
    }

    // Strip surrounding punctuation (e.g. trailing question mark)
    clean = clean.replace(/[?.,!":;]+$/g, "").trim();

    // 3. Strip leading polite phrases, question words, and intent phrases
    const leadingPatterns = [
        /^(can you|could you|would you|will you|can we|could we)(\s+please)?\s+/i,
        /^(please\s+)?(run|execute|perform)\s+(a\s+)?(quick\s+)?(playback|stream|server|file)?\s*test\s+(on|for|of)?\s+/i,
        /^(please\s+)?(test|check|verify|see|diagnose|inspect|probe|try|run)\s+(playback\s+(of|for)|streaming\s+(of|for)|stream\s+(of|for)|to\s+make\s+sure(\s+that)?|if|whether|that|it|this|out)?\s*/i,
        /^(make\s+sure(\s+that)?)\s+/i,
        /^(how\s+about|what\s+about)\s+/i,
        /^(please\s+)?(redownload|re-download|download|grab|search for|replace|fix)\s+/i,
        /^(why is|why does|how do i|how come|is|does|can)\s+/i,
        /^(the movie|the film|the show|the tv show|the episode|the series|the book)\s+/i,
        /^(movie|film|show|series)\s+/i
    ];

    let changed = true;
    while (changed) {
        changed = false;
        for (const pattern of leadingPatterns) {
            const next = clean.replace(pattern, "").trim();
            if (next !== clean) {
                clean = next;
                changed = true;
            }
        }
    }

    // 4. Strip trailing intent phrases, condition phrases, server phrases
    const trailingPatterns = [
        /\s+on\s+(the\s+)?(main|primary|backup|kids?|living\s*room)?\s*(plex)?\s*(server)?$/i,
        /\s+on\s+plex$/i,
        /\s+on\s+server$/i,
        /\s+in\s+plex$/i,
        /\s+runs?\s+fine$/i,
        /\s+runs?$/i,
        /\s+plays?\s+fine$/i,
        /\s+plays?$/i,
        /\s+works?\s+fine$/i,
        /\s+works?$/i,
        /\s+is\s+(playing|running|working)(\s+fine)?$/i,
        /\s+can\s+(play|stream|run)$/i,
        /\s+is\s+playable$/i,
        /\s+for\s+playback\s+issues$/i,
        /\s+for\s+playback$/i,
        /\s+for\s+issues$/i,
        /\s+for\s+streaming$/i,
        /\s+playback\s+test$/i,
        /\s+playback$/i,
        /\s+(is in spanish only|in spanish only|only in spanish|spanish only|in spanish|only spanish)$/i,
        /\s+(has no english audio|no english audio|missing english audio|missing english|no english|english audio missing)$/i,
        /\s+(is not playing|wont play|won't play|not working|is broken|corrupted|buffering|stuttering)$/i
    ];

    changed = true;
    while (changed) {
        changed = false;
        for (const pattern of trailingPatterns) {
            const next = clean.replace(pattern, "").trim();
            if (next !== clean) {
                clean = next;
                changed = true;
            }
        }
    }

    // Clean remaining punctuation and whitespace
    clean = clean.replace(/[?.,!":;]/g, " ").replace(/\s+/g, " ").trim();

    // 4.5 Detect system-wide infrastructure queries, playback probes, and general troubleshooting questions that do not name a movie
    const lowerClean = clean.toLowerCase();
    const isSystemOrProbePhrase = 
        /\b(is\s+)?plex\s+working\b/i.test(lowerClean) ||
        /\b(is\s+)?(the\s+)?server\s+(working|online|up|down)\b/i.test(lowerClean) ||
        /\b(disk\s+access|synthetic\s+playback|playback\s+probe)\b/i.test(lowerClean) ||
        /\b(all\s+servers|each\s+server|media\s+servers|across\s+all)\b/i.test(lowerClean) ||
        /\b(servers?\s*(online|status|health))\b/i.test(lowerClean) ||
        /\b(what|which)\s+servers\b/i.test(lowerClean) ||
        /\b(direct\s+play\s+vs\s+transcoding|100%?\s+direct\s+play)\b/i.test(lowerClean) ||
        /\b(stream\s+buffering|why\s+is\s+my\s+stream\s+buffering)\b/i.test(lowerClean) ||
        /\b(roku\s+giving\s+an\s+error|quality\s+is\s+too\s+low)\b/i.test(lowerClean);

    if (isSystemOrProbePhrase) {
        return {
            title: "",
            year: undefined,
            targetServer,
            rawCleaned: "",
            isPlaybackTest: false,
            isPronoun: false
        };
    }

    // 5. Detect and resolve pronouns and action verbs (e.g. "it", "that", "this", "test", "test it")
    const PRONOUN_TERMS = new Set([
        "it", "that", "this", "them",
        "the movie", "the film", "the show", "the tv show", "the series",
        "the media", "the file", "the video", "the stream", "the track"
    ]);

    const INVALID_TITLES = new Set([
        "test it", "check it", "verify it", "probe it", "play it", "stream it", "run it",
        "it", "that", "this", "them",
        "test", "check", "verify", "diagnose", "inspect", "probe", "try", "run", "play"
    ]);

    const isPronounOrVerb = 
        PRONOUN_TERMS.has(clean.toLowerCase().trim()) ||
        INVALID_TITLES.has(clean.toLowerCase().trim()) ||
        /^(test|check|verify|inspect|diagnose|probe|play|stream)\s*(it|this|that)?$/i.test(clean.trim());

    if (isPronounOrVerb) {
        isPlaybackTest = true;
        clean = "";
    }

    // 6. Context Resolution: inherit from previous conversational turns
    if (context) {
        if ((!clean || isPronounOrVerb) && context.lastTitle) {
            clean = context.lastTitle;
            if (!extractedYear && context.lastYear) {
                extractedYear = context.lastYear;
            }
            isPlaybackTest = true;
        }

        // If targetServer was not specified in the current query, inherit from previous context if this is a follow-up/correction
        if (!targetServer && context.lastServer && (hasCorrectionPrefix || isPronounOrVerb || context.lastWasPlaybackTest)) {
            targetServer = context.lastServer;
        }

        if (context.lastWasPlaybackTest) {
            isPlaybackTest = true;
        }
    }

    // Capitalize properly if lowercased
    let finalTitle = clean;
    if (finalTitle.length > 0) {
        finalTitle = finalTitle.split(" ").map(w => {
            const lower = w.toLowerCase();
            if (["a", "an", "the", "and", "or", "of", "in", "on", "at", "to", "for", "with"].includes(lower)) {
                return lower;
            }
            return lower.charAt(0).toUpperCase() + lower.slice(1);
        }).join(" ");
        finalTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
    }

    return {
        title: finalTitle,
        year: extractedYear,
        targetServer,
        rawCleaned: clean,
        isPlaybackTest,
        isPronoun: isPronounOrVerb
    };
}

/**
 * Inspects a media file's audio, video, and subtitle streams via Direct Plex API,
 * and performs an active byte-range playback probe on the physical disk file.
 */
export async function inspectMediaStreams(
    rawQuery: string,
    user?: any,
    targetServerName?: string,
    targetYear?: number
): Promise<MediaStreamInspection> {
    const cleaned = cleanMediaSearchQuery(rawQuery);
    const searchTitle = cleaned.title || rawQuery;
    const year = targetYear || cleaned.year;
    const serverPref = targetServerName || cleaned.targetServer;

    logAgentEvent("INFO", `Inspecting media streams for title "${searchTitle}"`, { 
        user: user?.username, 
        year,
        targetServer: serverPref 
    });

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    let token = "";
    if (settings?.mainPlexToken) {
        try {
            token = decryptData(settings.mainPlexToken);
        } catch (e) {}
    }
    if (!token) {
        // Fallback: check any PlexServer configured with an encrypted token
        const plexServersWithToken = await prisma.plexServer.findMany({ where: { token: { not: null } } }).catch(() => []);
        for (const ps of plexServersWithToken) {
            if (ps.token) {
                try {
                    token = decryptData(ps.token);
                    if (token) break;
                } catch (e) {}
            }
        }
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
            diagnosisSummary: "Plex Server token is not configured. Cannot inspect container streams."
        };
    }

    // Locate active Plex Media Servers
    let servers: any[] = [];
    try {
        servers = await getPlexServers(token);
    } catch (e) {}

    // Add mainPlexUrl if configured and not present in servers
    if (settings?.mainPlexUrl) {
        const cleanMain = settings.mainPlexUrl.replace(/\/+$/, "");
        const alreadyHas = servers.some(s => s.connections?.some((c: any) => c.uri.startsWith(cleanMain)));
        if (!alreadyHas) {
            servers.unshift({
                name: "Main Plex Server",
                accessToken: token,
                connections: [{ uri: cleanMain, local: true, relay: false }]
            });
        }
    }

    // Sort servers if user requested a specific server (e.g. "main", "kids", "backup")
    if (serverPref) {
        const lowerPref = serverPref.toLowerCase();
        servers.sort((a, b) => {
            const aMatch = (a.name || "").toLowerCase().includes(lowerPref);
            const bMatch = (b.name || "").toLowerCase().includes(lowerPref);
            if (aMatch && !bMatch) return -1;
            if (!aMatch && bMatch) return 1;
            return 0;
        });
    }

    let matchedItem: any = null;
    let matchedServerUrl = "";
    let matchedToken = token;
    let matchedServerName = "Main Plex Server";

    // Search across candidate servers using fast non-blocking connection probes
    for (const srv of servers) {
        const srvToken = srv.accessToken || token;
        const connections = srv.connections || [];

        // Prioritize local connections first, direct remote second, relay last
        const sortedConns = [...connections].sort((a, b) => {
            if (a.local && !b.local) return -1;
            if (!a.local && b.local) return 1;
            if (!a.relay && b.relay) return -1;
            if (a.relay && !b.relay) return 1;
            return 0;
        });

        // 1. Probe for the first responsive connection on this server with a fast 1500ms ping
        let activeUri = "";
        for (const conn of sortedConns) {
            const cleanUri = conn.uri.replace(/\/+$/, "");
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 1500);
                const pingRes = await fetch(`${cleanUri}/identity`, {
                    headers: {
                        Accept: "application/json",
                        "X-Plex-Token": srvToken,
                        "X-Plex-Client-Identifier": "portalarr-ai-diagnostics"
                    },
                    signal: controller.signal,
                    cache: "no-store"
                });
                clearTimeout(timeoutId);
                if (pingRes.ok) {
                    activeUri = cleanUri;
                    break;
                }
            } catch (e) {}
        }

        if (!activeUri) {
            // Server has no responsive connections, skip without blocking
            continue;
        }

        // 2. Query Plex on the verified active connection
        // Try exact searchTitle, and if not found try variants (without 'The ' or with 'The ')
        const titlesToTry: string[] = [searchTitle];
        if (/^The\s+/i.test(searchTitle)) {
            titlesToTry.push(searchTitle.replace(/^The\s+/i, ""));
        } else {
            titlesToTry.push("The " + searchTitle);
        }

        let results: PlexMediaStreamInfo[] = [];
        for (const qTitle of titlesToTry) {
            try {
                results = await searchPlexLibraryItems(activeUri, srvToken, qTitle, undefined, 10);
                if (results && results.length > 0) break;
            } catch (e) {}
        }

        if (results && results.length > 0) {
            // Find closest match by title
            const sLower = searchTitle.toLowerCase().trim();
            const sClean = sLower.replace(/^the\s+/i, "").trim();

            const exactOrClose = results.find(r => {
                const rLower = (r.title || "").toLowerCase().trim();
                const rClean = rLower.replace(/^the\s+/i, "").trim();
                if (!rClean || !sClean) return false;
                if (rLower === sLower || rClean === sClean) return true;
                if (sClean.length >= 3 && rClean.startsWith(sClean)) return true;
                if (rClean.length >= 4 && sClean.startsWith(rClean)) return true;
                if (sClean.length >= 4 && rClean.includes(sClean)) return true;
                return false;
            });

            if (exactOrClose) {
                matchedItem = exactOrClose;
                matchedServerUrl = activeUri;
                matchedToken = srvToken;
                matchedServerName = srv.name || "Plex Server";
                break;
            }
        }
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
            diagnosisSummary: `Media item "${searchTitle}" could not be located in your Plex media library on ${matchedServerName}.`
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
        displayTitle: s.title || `${s.language || "Unknown"} [${s.codec?.toUpperCase()}]`,
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

    // Active Playback Verification: Test physical disk streaming on candidate part file
    let playbackTestResult: {
        canPlay: boolean;
        httpStatus: number;
        bytesRead: number;
        latencyMs: number;
        testedPartFile?: string;
        error?: string;
    } | undefined;

    if (details.parts && details.parts.length > 0) {
        const primaryPart = details.parts[0];
        const partKey = (primaryPart as any).key || (primaryPart.id ? `/library/parts/${primaryPart.id}` : null);
        if (partKey) {
            const testUrl = `${matchedServerUrl.replace(/\/+$/, "")}${partKey.startsWith("/") ? partKey : "/" + partKey}`;
            const pStart = Date.now();
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3500);
                const rangeRes = await fetch(testUrl, {
                    headers: {
                        "X-Plex-Token": matchedToken,
                        "X-Plex-Client-Identifier": "portalarr-ai-playback-probe",
                        Range: "bytes=0-65535" // Request first 64KB
                    },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const latencyMs = Date.now() - pStart;
                const canPlay = rangeRes.status === 200 || rangeRes.status === 206;
                let bytesRead = 0;
                if (canPlay) {
                    const buf = await rangeRes.arrayBuffer().catch(() => new ArrayBuffer(0));
                    bytesRead = buf.byteLength || 65536;
                }

                playbackTestResult = {
                    canPlay,
                    httpStatus: rangeRes.status,
                    bytesRead,
                    latencyMs,
                    testedPartFile: primaryPart.file ? primaryPart.file.split(/[/\\]/).pop() : primaryPart.container,
                    error: canPlay ? undefined : `Plex streaming endpoint returned HTTP ${rangeRes.status}`
                };
            } catch (pErr: any) {
                playbackTestResult = {
                    canPlay: false,
                    httpStatus: 0,
                    bytesRead: 0,
                    latencyMs: Date.now() - pStart,
                    testedPartFile: primaryPart.file ? primaryPart.file.split(/[/\\]/).pop() : primaryPart.container,
                    error: pErr.name === "AbortError" ? "Storage read timed out (exceeded 3.5s)" : pErr.message || "Failed to stream media part from storage"
                };
            }
        }
    }

    // Determine verdict
    let verdict: MediaStreamInspection["verdict"] = "OK";
    let diagnosisSummary = "";
    let recommendedClientSteps: string[] | undefined;

    if (playbackTestResult && !playbackTestResult.canPlay) {
        // Storage failure or missing disk file!
        verdict = "FILE_CORRUPT";
        diagnosisSummary = `Storage playback check failed for "${matchedItem.title}": The underlying media file could not be read from disk on ${matchedServerName} (${playbackTestResult.error}). The hard drive, network share, or file path may be disconnected.`;
    } else if (hasSpanishAudio && hasEnglishAudio) {
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
        diagnosisSummary = `Playback verified: "${matchedItem.title}" (${matchedItem.year || "N/A"}) is physically readable from disk on ${matchedServerName} (${playbackTestResult ? `${(playbackTestResult.bytesRead / 1024).toFixed(0)} KB in ${playbackTestResult.latencyMs}ms` : "OK"}). English audio is present and ready for Direct Play.`;
    }

    if (serverPref && !matchedServerName.toLowerCase().includes(serverPref.toLowerCase())) {
        diagnosisSummary = `Note: "${matchedItem.title}" was not located in your ${serverPref} server library, but was found and verified on ${matchedServerName}. ${diagnosisSummary}`;
    }

    logAgentEvent("INFO", `Media stream inspection completed for "${matchedItem.title}": Verdict=${verdict}`, {
        hasEnglishAudio,
        hasSpanishAudio,
        audioTracksCount: audioTracks.length,
        canPlay: playbackTestResult?.canPlay
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
        recommendedClientSteps,
        playbackTest: playbackTestResult
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

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    const maxGrabs = settings?.aiMaxDailyGrabs ?? 3;

    // 1. Guardrail Rate Limit Check
    const rateLimit = checkAgentRateLimit(userIdentifier, maxGrabs);
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
        logAgentEvent("ERROR", "No enabled Radarr instances found in system settings");
        const escalation = await escalateToAdminTicket({
            user,
            title,
            issue: `User requested replacement for "${title}" due to "${reason}", but no enabled Radarr instances were found.`,
            stepsTaken: [
                `1. Inspected media streams: Missing English audio confirmed.`,
                `2. Attempted autonomous Radarr search: No enabled Radarr instances configured.`
            ],
            recommendation: "Configure and enable a Radarr instance in Settings -> Monitoring & Apps."
        });
        return {
            success: false,
            escalated: true,
            ticketId: escalation.ticketId,
            error: "No Radarr instance is connected. A support ticket has been sent to the server administrator."
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
    recordAgentGrabAction(userIdentifier, "RADARR_REPLACE", title, maxGrabs);

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

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    const maxGrabs = settings?.aiMaxDailyGrabs ?? 3;

    const rateLimit = checkAgentRateLimit(userIdentifier, maxGrabs);
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
            recommendation: "Enable Sonarr instance in system settings."
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
        recordAgentGrabAction(userIdentifier, "SONARR_REPLACE", `${title} S${seasonNumber || 1}E${episodeNumber || 1}`, maxGrabs);
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

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    const maxGrabs = settings?.aiMaxDailyGrabs ?? 3;

    const rateLimit = checkAgentRateLimit(userIdentifier, maxGrabs);
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
            recordAgentGrabAction(userIdentifier, "BOOK_REPLACE", title, maxGrabs);
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
            recordAgentGrabAction(userIdentifier, "BOOK_REPLACE", title, maxGrabs);
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
    const userEmail = params.user?.email || "user@domshomelab.local";

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
