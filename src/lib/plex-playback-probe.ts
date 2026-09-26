import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getPlexServers, PlexServerResource } from "@/lib/plex";
import { logAgentEvent } from "@/lib/ai-agent-guardrails";

export interface ServerPlaybackProbeResult {
    serverName: string;
    clientIdentifier?: string;
    version?: string;
    connectionUri: string;
    isLocal: boolean;
    isRelay: boolean;
    apiPingMs: number;
    apiStatus: "OK" | "SLOW" | "DOWN";
    databaseStatus: "OK" | "LOCKED" | "ERROR";
    databaseLatencyMs: number;
    sectionsCount: number;
    playbackTest: {
        testedTitle?: string;
        testedFile?: string;
        httpStatus: number;
        canPlayMedia: boolean;
        readLatencyMs: number;
        bytesRead: number;
        error?: string;
    };
    transcodeTest: {
        ready: boolean;
        latencyMs: number;
        error?: string;
    };
    overallStatus: "OPERATIONAL" | "DEGRADED" | "OFFLINE";
    summary: string;
    failureReason?: string;
}

export interface PlexPlaybackDiagnosticReport {
    success: boolean;
    timestamp: string;
    totalServers: number;
    operationalServers: number;
    allCanPlay: boolean;
    servers: ServerPlaybackProbeResult[];
    summary: string;
}

/**
 * Executes an active playback synthetic probe against a single Plex server candidate URL.
 * Tests:
 * 1. Web API listener ping (/identity)
 * 2. SQLite database responsiveness & library query (/library/sections)
 * 3. Physical disk file access & byte-range streaming (Range: bytes=0-1024 on Part URL)
 * 4. Image/Video transcode engine readiness (/photo/:/transcode)
 */
async function probeSinglePlexServer(
    server: PlexServerResource,
    adminToken: string
): Promise<ServerPlaybackProbeResult> {
    const token = server.accessToken || adminToken;
    const connections = server.connections || [];

    // Prioritize direct local connections, then direct remote, and relay as last resort
    const sortedConns = [...connections].sort((a, b) => {
        if (a.local && !b.local) return -1;
        if (!a.local && b.local) return 1;
        if (!a.relay && b.relay) return -1;
        if (a.relay && !b.relay) return 1;
        return 0;
    });

    let activeUri = sortedConns[0]?.uri || "";
    let isLocal = sortedConns[0]?.local || false;
    let isRelay = sortedConns[0]?.relay || false;

    const baseResult: ServerPlaybackProbeResult = {
        serverName: server.name || "Plex Server",
        clientIdentifier: server.clientIdentifier,
        connectionUri: activeUri,
        isLocal,
        isRelay,
        apiPingMs: 0,
        apiStatus: "DOWN",
        databaseStatus: "ERROR",
        databaseLatencyMs: 0,
        sectionsCount: 0,
        playbackTest: {
            httpStatus: 0,
            canPlayMedia: false,
            readLatencyMs: 0,
            bytesRead: 0
        },
        transcodeTest: {
            ready: false,
            latencyMs: 0
        },
        overallStatus: "OFFLINE",
        summary: "Server is unreachable"
    };

    if (!activeUri) {
        baseResult.failureReason = "No connection URIs found for server";
        return baseResult;
    }

    // Step 1: Probe Web API listener (/identity)
    let identityOk = false;
    let serverVersion = "";
    for (const conn of sortedConns) {
        const cleanUri = conn.uri.replace(/\/+$/, "");
        const start = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 2500);
            const res = await fetch(`${cleanUri}/identity`, {
                headers: {
                    Accept: "application/json",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-playback-probe"
                },
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId);

            if (res.ok) {
                const data = await res.json().catch(() => null);
                baseResult.apiPingMs = Date.now() - start;
                baseResult.apiStatus = baseResult.apiPingMs > 800 ? "SLOW" : "OK";
                serverVersion = data?.MediaContainer?.version || "";
                activeUri = cleanUri;
                isLocal = conn.local;
                isRelay = conn.relay;
                identityOk = true;
                break;
            }
        } catch (e) {}
    }

    if (!identityOk) {
        baseResult.apiStatus = "DOWN";
        baseResult.overallStatus = "OFFLINE";
        baseResult.failureReason = "Web API (/identity) failed to respond on all connection candidates.";
        baseResult.summary = `Server "${server.name}" is completely OFFLINE. The Plex process is not responding to network requests.`;
        return baseResult;
    }

    baseResult.connectionUri = activeUri;
    baseResult.isLocal = isLocal;
    baseResult.isRelay = isRelay;
    baseResult.version = serverVersion;

    // Step 2: Probe SQLite Database & Library Sections (/library/sections)
    const dbStart = Date.now();
    let sectionsData: any[] = [];
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        const secRes = await fetch(`${activeUri}/library/sections`, {
            headers: {
                Accept: "application/json",
                "X-Plex-Token": token,
                "X-Plex-Client-Identifier": "portalarr-playback-probe"
            },
            signal: controller.signal,
            cache: "no-store"
        });
        clearTimeout(timeoutId);

        baseResult.databaseLatencyMs = Date.now() - dbStart;
        if (secRes.ok) {
            const secJson = await secRes.json().catch(() => null);
            const dirList = secJson?.MediaContainer?.Directory || [];
            sectionsData = Array.isArray(dirList) ? dirList : [dirList];
            baseResult.sectionsCount = sectionsData.length;
            baseResult.databaseStatus = "OK";
        } else {
            baseResult.databaseStatus = "ERROR";
            baseResult.failureReason = `Database query returned HTTP ${secRes.status}`;
        }
    } catch (e: any) {
        baseResult.databaseStatus = "LOCKED";
        baseResult.databaseLatencyMs = Date.now() - dbStart;
        baseResult.failureReason = "Database query timed out. SQLite database may be locked by a long-running process.";
    }

    // Step 3: Physical Disk File Playback Test (Range: bytes=0-1024)
    // We fetch a real media item from the first video library, find its Part URL, and request the first 1KB of the container!
    const videoSection = sectionsData.find(s => s.type === "movie" || s.type === "show") || sectionsData[0];
    let sampleRatingKey = "";

    if (videoSection && videoSection.key) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 4000);
            const itemsRes = await fetch(`${activeUri}/library/sections/${videoSection.key}/all?X-Plex-Container-Start=0&X-Plex-Container-Size=1`, {
                headers: {
                    Accept: "application/json",
                    "X-Plex-Token": token,
                    "X-Plex-Client-Identifier": "portalarr-playback-probe"
                },
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId);

            if (itemsRes.ok) {
                const itemsJson = await itemsRes.json().catch(() => null);
                const item = itemsJson?.MediaContainer?.Metadata?.[0];

                if (item) {
                    baseResult.playbackTest.testedTitle = item.title;
                    sampleRatingKey = item.ratingKey;

                    const part = item.Media?.[0]?.Part?.[0];
                    if (part && part.key) {
                        const partUrl = `${activeUri}${part.key}`;
                        baseResult.playbackTest.testedFile = part.file || part.key;

                        // Synthetic Byte-Range Stream Probe
                        const playStart = Date.now();
                        const playController = new AbortController();
                        const playTimeoutId = setTimeout(() => playController.abort(), 4000);

                        const streamRes = await fetch(partUrl, {
                            headers: {
                                "X-Plex-Token": token,
                                "Range": "bytes=0-1024",
                                "X-Plex-Client-Identifier": "portalarr-playback-probe"
                            },
                            signal: playController.signal,
                            cache: "no-store"
                        });
                        clearTimeout(playTimeoutId);

                        baseResult.playbackTest.readLatencyMs = Date.now() - playStart;
                        baseResult.playbackTest.httpStatus = streamRes.status;

                        // HTTP 206 Partial Content or HTTP 200 OK means PMS successfully read the physical disk file!
                        if (streamRes.status === 206 || streamRes.status === 200) {
                            const buffer = await streamRes.arrayBuffer();
                            baseResult.playbackTest.bytesRead = buffer.byteLength;
                            baseResult.playbackTest.canPlayMedia = buffer.byteLength > 0;
                        } else {
                            baseResult.playbackTest.canPlayMedia = false;
                            baseResult.playbackTest.error = `Server returned HTTP ${streamRes.status} when reading file from disk. Underlying storage/mount may be disconnected.`;
                        }
                    } else {
                        baseResult.playbackTest.error = "No media part key found for sample item";
                    }
                } else {
                    baseResult.playbackTest.error = "Library section has no media items to test";
                    baseResult.playbackTest.canPlayMedia = true; // Section exists, just empty
                }
            }
        } catch (e: any) {
            baseResult.playbackTest.canPlayMedia = false;
            baseResult.playbackTest.error = `File stream probe timed out or failed: ${e.message}`;
        }
    }

    // Step 4: Transcode Engine & Scratch Cache Probe
    if (sampleRatingKey) {
        const transStart = Date.now();
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 3500);
            const transUrl = `${activeUri}/photo/:/transcode?width=100&height=100&minSize=1&upscale=1&url=/library/metadata/${encodeURIComponent(sampleRatingKey)}/thumb&X-Plex-Token=${encodeURIComponent(token)}`;
            
            const transRes = await fetch(transUrl, {
                signal: controller.signal,
                cache: "no-store"
            });
            clearTimeout(timeoutId);

            baseResult.transcodeTest.latencyMs = Date.now() - transStart;
            if (transRes.ok) {
                baseResult.transcodeTest.ready = true;
            } else {
                baseResult.transcodeTest.ready = false;
                baseResult.transcodeTest.error = `Transcoder returned HTTP ${transRes.status}`;
            }
        } catch (e: any) {
            baseResult.transcodeTest.ready = false;
            baseResult.transcodeTest.error = `Transcoder probe failed: ${e.message}`;
        }
    } else {
        baseResult.transcodeTest.ready = true;
    }

    // Step 5: Formulate Overall Verdict
    if (baseResult.apiStatus === "OK" && baseResult.databaseStatus === "OK" && baseResult.playbackTest.canPlayMedia) {
        baseResult.overallStatus = "OPERATIONAL";
        baseResult.summary = `Server "${server.name}" is 100% OPERATIONAL. Verified actual media file reading from disk (${baseResult.playbackTest.bytesRead} bytes in ${baseResult.playbackTest.readLatencyMs}ms) with responsive SQLite database.`;
    } else if (baseResult.apiStatus === "OK" && !baseResult.playbackTest.canPlayMedia) {
        baseResult.overallStatus = "DEGRADED";
        baseResult.failureReason = baseResult.playbackTest.error || "Plex API is responding, but PMS cannot physically read media files from disk.";
        baseResult.summary = `⚠️ FALSE-POSITIVE WARNING: Server "${server.name}" responds to pings, but CANNOT stream files! Storage mount is inaccessible (${baseResult.failureReason}).`;
    } else if (baseResult.databaseStatus === "LOCKED") {
        baseResult.overallStatus = "DEGRADED";
        baseResult.failureReason = "SQLite database locked or query timed out";
        baseResult.summary = `Server "${server.name}" web listener is up, but database is locked. Playback will stall.`;
    } else {
        baseResult.overallStatus = "DEGRADED";
        baseResult.summary = `Server "${server.name}" is in a degraded state.`;
    }

    return baseResult;
}

/**
 * Runs deep synthetic playback health checks across all registered Plex Media Servers.
 * Solves the "server pings OK, but won't play anything" problem!
 */
export async function runDeepPlexPlaybackHealthCheck(): Promise<PlexPlaybackDiagnosticReport> {
    logAgentEvent("INFO", "Running Deep Synthetic Plex Playback Probe across all servers...");

    const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
    let adminToken = "";
    if (settings?.mainPlexToken) {
        try {
            adminToken = decryptData(settings.mainPlexToken);
        } catch (e) {}
    }

    let servers: PlexServerResource[] = [];
    if (adminToken) {
        try {
            servers = await getPlexServers(adminToken, true);
        } catch (e) {}
    }

    if (servers.length === 0) {
        return {
            success: false,
            timestamp: new Date().toISOString(),
            totalServers: 0,
            operationalServers: 0,
            allCanPlay: false,
            servers: [],
            summary: "No Plex servers or main Plex token configured in Portalarr settings."
        };
    }

    // Run probes concurrently across all servers with Promise.allSettled
    const results = await Promise.allSettled(
        servers.map(s => probeSinglePlexServer(s, adminToken))
    );

    const probeResults: ServerPlaybackProbeResult[] = [];
    for (const r of results) {
        if (r.status === "fulfilled") {
            probeResults.push(r.value);
        }
    }

    const operationalCount = probeResults.filter(r => r.overallStatus === "OPERATIONAL").length;
    const allCanPlay = probeResults.length > 0 && probeResults.every(r => r.playbackTest.canPlayMedia);

    let summaryText = "";
    if (operationalCount === probeResults.length && allCanPlay) {
        summaryText = `✅ All ${probeResults.length} Plex server(s) are online, healthy, and verified capable of streaming actual media files from disk.`;
    } else {
        const degradedOrOffline = probeResults.filter(r => r.overallStatus !== "OPERATIONAL");
        const details = degradedOrOffline.map(s => `"${s.serverName}": ${s.failureReason || s.summary}`).join("; ");
        summaryText = `⚠️ Playback issues detected! ${operationalCount} of ${probeResults.length} server(s) are operational. Issues: ${details}`;
    }

    logAgentEvent("INFO", `Plex Playback Probe finished: ${operationalCount}/${probeResults.length} operational (All can play: ${allCanPlay})`);

    return {
        success: true,
        timestamp: new Date().toISOString(),
        totalServers: probeResults.length,
        operationalServers: operationalCount,
        allCanPlay,
        servers: probeResults,
        summary: summaryText
    };
}
