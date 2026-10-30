import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { logAgentEvent } from "@/lib/ai-agent-guardrails";
import { runDeepPlexPlaybackHealthCheck, PlexPlaybackDiagnosticReport } from "@/lib/plex-playback-probe";
import { 
    inspectMediaStreams, 
    searchAndGrabRadarrReplacement, 
    searchAndGrabSonarrReplacement, 
    redownloadBookWithDiagnostics 
} from "@/lib/ai-media-diagnostics";
import { getPersonalizedBookRecommendations } from "@/lib/ai-book-recommendations";
import { listDockerContainers, restartDockerContainer } from "@/lib/monitoring/docker-client";
import { analyzeActiveSessionsForSharing } from "@/lib/telemetry/stream-tracker";
import { calculateIptvCapacity } from "@/lib/iptv/provider-vault";
import { ensureDefaultIptvProfiles, testDispatcharrConnection } from "@/lib/iptv/dispatcharr-client";
import { 
    UserDiagnosticSnapshot, 
    AgentActionReport, 
    MediaStreamInspection,
    StreamTelemetry 
} from "@/lib/ai-server-assistant-types";

// ============================================================================
// 1. TOOL SCHEMAS FOR GEMINI & OPENAI
// ============================================================================

export const GEMINI_TOOL_DECLARATIONS = [
    {
        name: "probe_playback_health",
        description: "Run a deep synthetic playback probe on Plex servers to physically stream real byte chunks from disk storage and verify SQLite DB latency. Use when asked if Plex is working, down, or able to play media.",
        parameters: {
            type: "OBJECT",
            properties: {
                server_name: { type: "STRING", description: "Optional specific Plex server name to probe (e.g. MainPlexServer, KidsPlexServer)" }
            }
        }
    },
    {
        name: "get_cluster_status",
        description: "Check status of all media server nodes across the cluster, including online status, API ping, and active stream volume.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "terminate_playback_stream",
        description: "Stop or terminate an active playback stream. For standard users, restricted to their own account or linked sub-accounts. Administrators can terminate any session.",
        parameters: {
            type: "OBJECT",
            properties: {
                target_device: { type: "STRING", description: "Target player or device name (e.g. Living Room TV, iPad, Roku)" },
                media_title: { type: "STRING", description: "Title of the media currently playing to terminate" }
            }
        }
    },
    {
        name: "inspect_media_container",
        description: "Deeply inspect a movie or TV episode in the Plex library to check audio language tracks (e.g. Spanish vs English), subtitles, container format, and physical disk readability.",
        parameters: {
            type: "OBJECT",
            properties: {
                title: { type: "STRING", description: "Canonical title of the movie or TV show to inspect (e.g. 'R.J. Decker', 'The Sandlot'). For TV shows, provide the series title only; do not include season or episode numbers in this string." },
                season: { type: "INTEGER", description: "Season number (e.g. 1, 2) if inspecting a TV series episode" },
                episode: { type: "INTEGER", description: "Episode number (e.g. 5) if inspecting a TV series episode" },
                year: { type: "INTEGER", description: "Release year of the title if known" },
                target_server: { type: "STRING", description: "Specific Plex server to inspect if known" }
            },
            required: ["title"]
        }
    },
    {
        name: "search_and_replace_media",
        description: "Search connected indexers via Radarr or Sonarr to find a verified replacement release with the correct language or quality, and queue download in autonomous mode.",
        parameters: {
            type: "OBJECT",
            properties: {
                title: { type: "STRING", description: "Title of the media to replace" },
                year: { type: "INTEGER", description: "Release year if known" },
                season: { type: "INTEGER", description: "Season number if TV show" },
                episode: { type: "INTEGER", description: "Episode number if TV show" },
                media_type: { type: "STRING", description: "movie or tv" },
                issue: { type: "STRING", description: "Reason for replacement (e.g. missing English audio, corrupt file)" }
            },
            required: ["title"]
        }
    },
    {
        name: "redownload_book",
        description: "Search and trigger an automated re-download and diagnostics check for a book or audiobook.",
        parameters: {
            type: "OBJECT",
            properties: {
                title: { type: "STRING", description: "Title of the book or audiobook" }
            },
            required: ["title"]
        }
    },
    {
        name: "recommend_books_and_media",
        description: "Search the server's book/audiobook library and recommend titles tailored to the user's taste, past requests, or specified author, genre, or reference book. Cross-references available server books on disk (which can be read or sent to Kindle immediately) and unacquired books ready to request.",
        parameters: {
            type: "OBJECT",
            properties: {
                reference_title: { type: "STRING", description: "Optional title of a book or movie the user liked (e.g. 'Project Hail Mary', 'Dune', 'The Way of Kings')" },
                author: { type: "STRING", description: "Optional author name to find similar books for (e.g. 'Brandon Sanderson', 'Frank Herbert', 'Andy Weir')" },
                genre: { type: "STRING", description: "Optional genre or theme (e.g. 'Sci-Fi', 'Fantasy', 'Mystery', 'Thriller', 'Non-fiction')" },
                media_type: { type: "STRING", description: "Optional format filter: 'ebook', 'audiobook', or 'all'" }
            }
        }
    },
    {
        name: "get_homelab_hardware_telemetry",
        description: "Query physical host hardware telemetry from Glances (CPU utilization %, RAM usage %, and system load). RESTRICTED TO SERVER ADMINISTRATORS.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "get_docker_fleet_status",
        description: "Inspect the Docker container fleet across the homelab, reporting total containers, running/stopped/unhealthy containers, CPU, and RAM. RESTRICTED TO SERVER ADMINISTRATORS.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "restart_docker_container",
        description: "Safely restart a specific Docker container by name or ID (e.g. plex, sonarr, radarr, glances, tautulli). RESTRICTED TO SERVER ADMINISTRATORS.",
        parameters: {
            type: "OBJECT",
            properties: {
                container_name_or_id: { type: "STRING", description: "Exact container name or short/full ID (e.g. 'plex', 'sonarr', 'radarr')" }
            },
            required: ["container_name_or_id"]
        }
    },
    {
        name: "get_account_sharing_alerts",
        description: "Retrieve active credential-sharing alerts where an account is streaming simultaneously across multiple distinct public residential IP addresses. RESTRICTED TO SERVER ADMINISTRATORS.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "probe_iptv_stream",
        description: "Perform a live synthetic diagnostic probe on an IPTV channel or Dispatcharr tuner to verify stream reachability, latency, and provider line saturation.",
        parameters: {
            type: "OBJECT",
            properties: {
                channel_name_or_number: { type: "STRING", description: "Name, callsign, or number of the live TV channel (e.g. ESPN, RedZone, Fox News, 570)" }
            },
            required: ["channel_name_or_number"]
        }
    },
    {
        name: "search_live_event",
        description: "Search the Live TV & IPTV channel catalog and guide across all profiles (Sports, News, Entertainment, Kids, Fios, Spectrum) to locate where a channel, network, or live game is airing.",
        parameters: {
            type: "OBJECT",
            properties: {
                query: { type: "STRING", description: "Channel name, network, sport, or event to find (e.g. 'ESPN', 'NFL RedZone', 'Cartoon Network', 'CNN')" },
                genre: { type: "STRING", description: "Optional category filter (e.g. Sports, News, Kids, Entertainment, Movies, Local)" }
            },
            required: ["query"]
        }
    },
    {
        name: "check_provider_capacity",
        description: "Check active IPTV provider connection capacity, simultaneous stream saturation, DVR buffer reservation, and free lines.",
        parameters: {
            type: "OBJECT",
            properties: {}
        }
    },
    {
        name: "request_live_channel",
        description: "Submit an on-demand request to add or activate a missing live TV channel or sports network in the IPTV lineup.",
        parameters: {
            type: "OBJECT",
            properties: {
                channel_name: { type: "STRING", description: "Name or callsign of the requested live channel" },
                genre: { type: "STRING", description: "Category such as Sports, News, Entertainment, Kids, or Local" },
                reason: { type: "STRING", description: "Optional user reason or note for requesting the channel" }
            },
            required: ["channel_name"]
        }
    }
];

export const OPENAI_TOOL_DEFINITIONS = GEMINI_TOOL_DECLARATIONS.map(d => ({
    type: "function",
    function: {
        name: d.name,
        description: d.description,
        parameters: {
            type: "object",
            properties: Object.fromEntries(
                Object.entries(d.parameters.properties).map(([k, v]: [string, any]) => [
                    k,
                    {
                        type: v.type.toLowerCase() === "integer" ? "integer" : "string",
                        description: v.description
                    }
                ])
            ),
            required: (d.parameters as any).required || []
        }
    }
}));

// ============================================================================
// 2. TOOL EXECUTION CONTEXT & DISPATCHER
// ============================================================================

export interface ToolExecutionContext {
    user: any;
    snapshot: UserDiagnosticSnapshot;
    actionsTaken: AgentActionReport[];
    autonomyLevel: "advisory" | "assisted" | "autonomous";
    mediaInspectionHolder: { current?: MediaStreamInspection };
    playbackProbeHolder: { current?: PlexPlaybackDiagnosticReport };
}

export async function executeAiAssistantTool(
    name: string,
    args: any,
    ctx: ToolExecutionContext
): Promise<{ success: boolean; result: any; summary: string }> {
    const isAdmin = ctx.user?.role === "ADMIN";
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    logAgentEvent("INFO", `[Tool Call] Executing tool "${name}" for user "${ctx.user?.username || 'anonymous'}"`, args);

    switch (name) {
        // --- 1. PLAYBACK HEALTH PROBE ---
        case "probe_playback_health": {
            try {
                const probe = await runDeepPlexPlaybackHealthCheck();
                ctx.playbackProbeHolder.current = probe;
                const status = probe.allCanPlay ? "SUCCESS" : "FAILED";
                const summary = `Deep Playback Probe: ${probe.operationalServers}/${probe.totalServers} servers operational. Can Stream: ${probe.allCanPlay ? "YES" : "NO"}`;
                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status,
                    target: args.server_name || "Plex Playback Probe",
                    summary,
                    details: probe,
                    timestamp
                });
                return { success: true, result: probe, summary };
            } catch (err: any) {
                return { success: false, result: { error: err.message }, summary: `Probe failed: ${err.message}` };
            }
        }

        // --- 2. CLUSTER STATUS ---
        case "get_cluster_status": {
            const nodes = ctx.snapshot.serverNodes || [];
            const summary = `Cluster Status: ${ctx.snapshot.serversOnlineCount} online nodes, ${ctx.snapshot.activeStreamsCount} active stream(s).`;
            ctx.actionsTaken.push({
                action: "STREAM_PATTERN_DIAGNOSTIC",
                status: "SUCCESS",
                target: "Cluster Status",
                summary,
                details: { nodes, activeStreamsCount: ctx.snapshot.activeStreamsCount },
                timestamp
            });
            return {
                success: true,
                result: {
                    serversOnlineCount: ctx.snapshot.serversOnlineCount,
                    activeStreamsCount: ctx.snapshot.activeStreamsCount,
                    nodes: ctx.snapshot.serverNodes || []
                },
                summary
            };
        }

        // --- 3. TERMINATE STREAM ---
        case "terminate_playback_stream": {
            const streams = ctx.snapshot.activeStreams;
            let target = ctx.snapshot.primaryActiveStream || streams[0];

            if (args.target_device) {
                const lowerDev = String(args.target_device).toLowerCase();
                const matched = streams.find(s => 
                    s.player?.toLowerCase().includes(lowerDev) || 
                    s.deviceType?.toLowerCase().includes(lowerDev) ||
                    s.platform?.toLowerCase().includes(lowerDev)
                );
                if (matched) target = matched;
            } else if (args.media_title) {
                const lowerTitle = String(args.media_title).toLowerCase();
                const matched = streams.find(s => s.title?.toLowerCase().includes(lowerTitle));
                if (matched) target = matched;
            }

            if (!target || !target.sessionKey) {
                return { 
                    success: false, 
                    result: { message: "No active stream found matching criteria to terminate." }, 
                    summary: "No active stream found to terminate." 
                };
            }

            if (ctx.autonomyLevel === "advisory") {
                return {
                    success: true,
                    result: { 
                        advisory: true, 
                        message: `Advisory Mode: Automatic stream termination is disabled in Level 1. Please stop playback from My Plex Hub or directly on ${target.player}.` 
                    },
                    summary: `Advisory Mode: Manual stop required on ${target.player}.`
                };
            }

            try {
                const { killUserStream } = await import("@/app/actions");
                const instanceId = target.serverName ? `tautulli::${target.serverName}` : "plex";
                const killRes = await killUserStream(instanceId, target.sessionKey);

                if (killRes.success) {
                    const summary = `Autonomous Stream Termination: Ended active playback of "${target.title}" on ${target.player}.`;
                    ctx.actionsTaken.push({
                        action: "STREAM_PATTERN_DIAGNOSTIC",
                        status: "SUCCESS",
                        target: target.title,
                        summary,
                        timestamp
                    });
                    return { success: true, result: { message: summary, target }, summary };
                } else {
                    return { success: false, result: { error: killRes.error }, summary: `Termination failed: ${killRes.error}` };
                }
            } catch (kErr: any) {
                return { success: false, result: { error: kErr.message }, summary: `Error: ${kErr.message}` };
            }
        }

        // --- 4. INSPECT MEDIA CONTAINER ---
        case "inspect_media_container": {
            try {
                const insp = await inspectMediaStreams(
                    args.title, 
                    ctx.user, 
                    args.target_server, 
                    args.year, 
                    args.season, 
                    args.episode
                );
                ctx.mediaInspectionHolder.current = insp;

                const summary = `Inspected Plex container for "${insp.title}": Found ${insp.audioTracks.length} audio tracks (${insp.audioTracks.map(t => t.displayTitle).join(", ")}). Verdict: ${insp.verdict}.`;
                ctx.actionsTaken.push({
                    action: "INSPECT_MEDIA",
                    status: insp.verdict === "FILE_CORRUPT" ? "FAILED" : "SUCCESS",
                    target: insp.title,
                    summary,
                    details: insp,
                    timestamp
                });

                // Auto-grab if English audio is missing and in autonomous mode
                if (insp.verdict === "MISSING_LANGUAGE_TRACK" && ctx.autonomyLevel === "autonomous") {
                    const isTv = args.season !== undefined || args.episode !== undefined || insp.mediaType === "episode";
                    const targetSeason = args.season ?? insp.season;
                    const targetEpisode = args.episode ?? insp.episode;
                    const grabResult = isTv
                        ? await searchAndGrabSonarrReplacement(
                            insp.showTitle || insp.title,
                            targetSeason,
                            targetEpisode,
                            "Missing English audio track / Spanish only release",
                            ctx.user
                        )
                        : await searchAndGrabRadarrReplacement(
                            insp.title,
                            insp.year ? parseInt(insp.year, 10) : undefined,
                            "Missing English audio track / Spanish only release",
                            ctx.user
                        );
                    if (grabResult.success) {
                        const grabSummary = grabResult.alreadyOptimal
                            ? `Optimal Release Confirmed: Highest-quality release "${grabResult.releaseTitle}" (${grabResult.quality}) is already present in ${isTv ? "Sonarr" : "Radarr"} (Custom Format Score: ${grabResult.existingScore ?? 900000}).`
                            : `Autonomous Grab: Queued verified English release "${grabResult.releaseTitle}" (${grabResult.quality}) in ${isTv ? "Sonarr" : "Radarr"}.`;
                        ctx.actionsTaken.push({
                            action: "RADARR_SEARCH_GRAB",
                            status: "SUCCESS",
                            target: insp.title,
                            summary: grabSummary,
                            details: grabResult,
                            timestamp
                        });
                    } else if (grabResult.escalated) {
                        ctx.actionsTaken.push({
                            action: "ESCALATE_ADMIN_TICKET",
                            status: "ESCALATED",
                            target: insp.title,
                            summary: `Escalated: Support Ticket #${grabResult.ticketId} created with complete container telemetry.`,
                            ticketId: grabResult.ticketId,
                            details: grabResult,
                            timestamp
                        });
                    }
                }

                return { success: true, result: insp, summary };
            } catch (iErr: any) {
                return { success: false, result: { error: iErr.message }, summary: `Container inspection failed: ${iErr.message}` };
            }
        }

        // --- 5. SEARCH AND REPLACE MEDIA ---
        case "search_and_replace_media": {
            try {
                const isTv = args.media_type === "tv" || args.season !== undefined || args.episode !== undefined;
                const grabResult = isTv 
                    ? await searchAndGrabSonarrReplacement(
                        args.title, 
                        args.season, 
                        args.episode, 
                        args.issue || "Media defect replacement", 
                        ctx.user
                    )
                    : await searchAndGrabRadarrReplacement(args.title, args.year, args.issue || "Media defect replacement", ctx.user);

                if (grabResult.success) {
                    const summary = grabResult.alreadyOptimal
                        ? `Optimal Release Confirmed: The highest-scoring release "${grabResult.releaseTitle}" (${grabResult.quality}) is already downloaded and present on disk in ${isTv ? "Sonarr" : "Radarr"} (Custom Format Score: ${grabResult.existingScore ?? 900000}). Indexers have no superior releases.`
                        : `Autonomous Grab: Queued verified release "${grabResult.releaseTitle}" (${grabResult.quality}) in ${isTv ? "Sonarr" : "Radarr"}.`;
                    ctx.actionsTaken.push({
                        action: "RADARR_SEARCH_GRAB",
                        status: "SUCCESS",
                        target: args.title,
                        summary,
                        details: grabResult,
                        timestamp
                    });
                    return { success: true, result: grabResult, summary };
                } else if (grabResult.escalated) {
                    const summary = `Admin Escalated: Support Ticket #${grabResult.ticketId} created. No safe releases met criteria on indexers.`;
                    ctx.actionsTaken.push({
                        action: "ESCALATE_ADMIN_TICKET",
                        status: "ESCALATED",
                        target: args.title,
                        summary,
                        ticketId: grabResult.ticketId,
                        details: grabResult,
                        timestamp
                    });
                    return { success: true, result: grabResult, summary };
                } else {
                    return { success: false, result: grabResult, summary: grabResult.error || "Search failed" };
                }
            } catch (err: any) {
                return { success: false, result: { error: err.message }, summary: `Error: ${err.message}` };
            }
        }

        // --- 6. REDOWNLOAD BOOK ---
        case "redownload_book": {
            try {
                const bookRes = await redownloadBookWithDiagnostics(args.title, undefined, ctx.user);
                if (bookRes.success) {
                    const summary = `Dispatched automated book search & download for "${args.title}".`;
                    ctx.actionsTaken.push({
                        action: "REDOWNLOAD_BOOK",
                        status: "SUCCESS",
                        target: args.title,
                        summary,
                        timestamp
                    });
                    return { success: true, result: bookRes, summary };
                } else {
                    return { success: false, result: bookRes, summary: bookRes.error || "Book search failed" };
                }
            } catch (bErr: any) {
                return { success: false, result: { error: bErr.message }, summary: `Error: ${bErr.message}` };
            }
        }

        // --- 6.5. PERSONALIZED BOOK & MEDIA RECOMMENDATIONS ---
        case "recommend_books_and_media": {
            try {
                const recResult = await getPersonalizedBookRecommendations({
                    user: ctx.user,
                    profile: ctx.snapshot.readingProfile,
                    referenceTitle: args.reference_title,
                    author: args.author,
                    genre: args.genre,
                    mediaType: args.media_type,
                    limit: 5
                });

                const summary = recResult.summary;
                ctx.actionsTaken.push({
                    action: "BOOK_RECOMMENDATION",
                    status: "SUCCESS",
                    target: args.reference_title || args.author || args.genre || "Personalized Reading Profile",
                    summary,
                    details: recResult,
                    timestamp
                });

                return { success: true, result: recResult, summary };
            } catch (err: any) {
                return { success: false, result: { error: err.message }, summary: `Failed to generate recommendations: ${err.message}` };
            }
        }

        // --- 7. GET HOMELAB HARDWARE TELEMETRY (ADMIN ONLY) ---
        case "get_homelab_hardware_telemetry": {
            if (!isAdmin) {
                return { 
                    success: false, 
                    result: { error: "Permission Denied: Homelab hardware telemetry is restricted to Administrators." }, 
                    summary: "Permission Denied: Admin role required." 
                };
            }

            try {
                const glancesInstances = await prisma.glancesInstance.findMany({ where: { monitored: true } }).catch(() => []);
                const { fetchGlancesHardwareStats } = await import("@/app/actions");

                const hostsTelemetry = await Promise.all(
                    glancesInstances.map(async (g) => {
                        const start = Date.now();
                        const stats = await fetchGlancesHardwareStats(g.url, 4000);
                        return {
                            name: g.name,
                            url: g.url,
                            online: stats.online,
                            cpuPercent: stats.cpu,
                            ramPercent: stats.ram,
                            latencyMs: Date.now() - start
                        };
                    })
                );

                const summary = `Homelab Hardware Telemetry: Queried ${hostsTelemetry.length} host(s). ${hostsTelemetry.map(h => `${h.name}: CPU ${h.cpuPercent}%, RAM ${h.ramPercent}%`).join(" | ")}`;
                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status: "SUCCESS",
                    target: "Homelab Hardware (Glances)",
                    summary,
                    details: hostsTelemetry,
                    timestamp
                });

                return { success: true, result: { hosts: hostsTelemetry }, summary };
            } catch (hErr: any) {
                return { success: false, result: { error: hErr.message }, summary: `Hardware query failed: ${hErr.message}` };
            }
        }

        // --- 8. GET DOCKER FLEET STATUS (ADMIN ONLY) ---
        case "get_docker_fleet_status": {
            if (!isAdmin) {
                return { 
                    success: false, 
                    result: { error: "Permission Denied: Docker fleet status is restricted to Administrators." }, 
                    summary: "Permission Denied: Admin role required." 
                };
            }

            try {
                const fleetRes = await listDockerContainers();
                if (!fleetRes || !fleetRes.summary) {
                    return { success: false, result: { error: "Failed to query Docker daemon" }, summary: "Docker query failed." };
                }

                const d = fleetRes.summary;
                const summary = `Docker Fleet: ${d.runningCount}/${d.totalContainers} running (${d.unhealthyCount} unhealthy, ${d.stoppedCount} stopped). Engine: ${d.source}.`;
                
                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status: "SUCCESS",
                    target: "Docker Fleet",
                    summary,
                    details: {
                        totalContainers: d.totalContainers,
                        runningCount: d.runningCount,
                        stoppedCount: d.stoppedCount,
                        unhealthyCount: d.unhealthyCount,
                        source: d.source,
                        containers: fleetRes.containers || []
                    },
                    timestamp
                });

                return {
                    success: true,
                    result: {
                        totalContainers: d.totalContainers,
                        runningCount: d.runningCount,
                        stoppedCount: d.stoppedCount,
                        unhealthyCount: d.unhealthyCount,
                        restartingCount: d.restartingCount,
                        engine: d.source,
                        containers: (fleetRes.containers || []).map(c => ({
                            name: c.name,
                            state: c.state,
                            image: c.image,
                            cpuPercent: c.cpuPercent,
                            memoryUsage: c.memoryUsage ? `${(c.memoryUsage / (1024 * 1024)).toFixed(0)} MB` : "N/A",
                            statusText: c.status
                        }))
                    },
                    summary
                };
            } catch (fErr: any) {
                return { success: false, result: { error: fErr.message }, summary: `Docker fleet query failed: ${fErr.message}` };
            }
        }

        // --- 9. RESTART DOCKER CONTAINER (ADMIN ONLY) ---
        case "restart_docker_container": {
            if (!isAdmin) {
                return { 
                    success: false, 
                    result: { error: "Permission Denied: Docker container lifecycle control is restricted to Administrators." }, 
                    summary: "Permission Denied: Admin role required." 
                };
            }

            try {
                const containerIdOrName = String(args.container_name_or_id || "").trim();
                if (!containerIdOrName) {
                    return { success: false, result: { error: "Missing container_name_or_id argument." }, summary: "Missing container argument." };
                }

                const restartRes = await restartDockerContainer(containerIdOrName);
                const status = restartRes.success ? "SUCCESS" : "FAILED";
                const summary = restartRes.message || (restartRes.success ? `Restarted container "${containerIdOrName}".` : `Failed to restart container "${containerIdOrName}".`);

                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status,
                    target: `Docker Container: ${containerIdOrName}`,
                    summary,
                    details: restartRes,
                    timestamp
                });

                return { success: restartRes.success, result: restartRes, summary };
            } catch (rErr: any) {
                return { success: false, result: { error: rErr.message }, summary: `Restart failed: ${rErr.message}` };
            }
        }

        // --- 10. GET ACCOUNT SHARING ALERTS (ADMIN ONLY) ---
        case "get_account_sharing_alerts": {
            if (!isAdmin) {
                return { 
                    success: false, 
                    result: { error: "Permission Denied: Account sharing intelligence is restricted to Administrators." }, 
                    summary: "Permission Denied: Admin role required." 
                };
            }

            try {
                const settings = await prisma.settings.findFirst({ where: { id: "global" } }).catch(() => null);
                const allActiveStreams = ctx.snapshot.activeStreams || [];
                const sharingMap = analyzeActiveSessionsForSharing(allActiveStreams as any, settings?.maxConcurrentStreamsPerUser || 3);

                const sharingAlerts: any[] = [];
                for (const [username, analysis] of sharingMap.entries()) {
                    if (analysis.isSharingSuspected || analysis.isMultiIp) {
                        sharingAlerts.push({
                            username,
                            publicIpsCount: analysis.distinctPublicIps.length,
                            publicIps: analysis.distinctPublicIps,
                            devices: analysis.devices,
                            reasons: analysis.sharingReason ? [analysis.sharingReason] : []
                        });
                    }
                }

                const summary = sharingAlerts.length > 0 
                    ? `Sharing Alerts: ${sharingAlerts.length} account(s) detected streaming across multiple distinct public residential IPs.`
                    : "Sharing Alerts: 0 concurrent multi-IP sharing violations detected across all active streams.";

                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status: "SUCCESS",
                    target: "Account Sharing Intelligence",
                    summary,
                    details: { totalAlerts: sharingAlerts.length, sharingAlerts },
                    timestamp
                });

                return {
                    success: true,
                    result: { totalAlerts: sharingAlerts.length, alerts: sharingAlerts },
                    summary
                };
            } catch (sErr: any) {
                return { success: false, result: { error: sErr.message }, summary: `Sharing audit failed: ${sErr.message}` };
            }
        }

        // --- 11. PROBE IPTV STREAM ---
        case "probe_iptv_stream": {
            try {
                await ensureDefaultIptvProfiles();
                const query = String(args.channel_name_or_number || "").trim();
                const [dispatcharrStatus, capacity, allChannels] = await Promise.all([
                    testDispatcharrConnection(),
                    calculateIptvCapacity(),
                    prisma.iptvChannel.findMany({ where: { isActive: true } })
                ]);

                const qLower = query.toLowerCase();
                const matchedChannel = allChannels.find(
                    c => c.name.toLowerCase().includes(qLower) ||
                         (c.callsign && c.callsign.toLowerCase().includes(qLower)) ||
                         String(c.channelNumber || "") === qLower
                );

                const summary = matchedChannel
                    ? `IPTV Probe for "${matchedChannel.name}" (Ch ${matchedChannel.channelNumber || 'N/A'}): Active in catalog. Provider Saturation: ${capacity.totalActiveStreams}/${capacity.totalMaxConnections} lines used (${capacity.freeStreamBuffer} free after DVR reserve).`
                    : `IPTV Probe: Channel "${query}" not found in active catalog. Provider Saturation: ${capacity.totalActiveStreams}/${capacity.totalMaxConnections}.`;

                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status: capacity.isSaturated ? "FAILED" : "SUCCESS",
                    target: `IPTV Channel: ${query}`,
                    summary,
                    details: { matchedChannel, dispatcharrStatus, capacity },
                    timestamp
                });

                return {
                    success: true,
                    result: { matchedChannel, dispatcharrStatus, capacity },
                    summary
                };
            } catch (err: any) {
                return { success: false, result: { error: err.message }, summary: `IPTV probe failed: ${err.message}` };
            }
        }

        // --- 12. SEARCH LIVE EVENT / CHANNEL ---
        case "search_live_event": {
            try {
                await ensureDefaultIptvProfiles();
                const query = String(args.query || "").trim().toLowerCase();
                const genre = String(args.genre || "").trim().toLowerCase();

                const channels = await prisma.iptvChannel.findMany({
                    where: { isActive: true },
                    include: {
                        profileChannels: {
                            include: { profile: { select: { name: true, slug: true } } }
                        }
                    },
                    orderBy: { channelNumber: "asc" }
                });

                const matches = channels.filter(c => {
                    const nameMatch = !query || c.name.toLowerCase().includes(query) || (c.callsign && c.callsign.toLowerCase().includes(query)) || (c.genre && c.genre.toLowerCase().includes(query));
                    const genreMatch = !genre || (c.genre && c.genre.toLowerCase().includes(genre));
                    return nameMatch && genreMatch;
                }).slice(0, 12).map(c => ({
                    channelNumber: c.channelNumber,
                    callsign: c.callsign,
                    name: c.name,
                    genre: c.genre,
                    profiles: c.profileChannels.map(pc => pc.profile.name)
                }));

                const summary = matches.length > 0
                    ? `Found ${matches.length} live TV channel(s) matching "${args.query}": ${matches.map(m => `${m.name} (Ch ${m.channelNumber})`).slice(0, 4).join(", ")}.`
                    : `No active channels matched "${args.query}". You can submit a channel request to add it!`;

                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status: "SUCCESS",
                    target: `Live TV Search: ${args.query}`,
                    summary,
                    details: { matches },
                    timestamp
                });

                return {
                    success: true,
                    result: { count: matches.length, channels: matches },
                    summary
                };
            } catch (err: any) {
                return { success: false, result: { error: err.message }, summary: `Live TV search failed: ${err.message}` };
            }
        }

        // --- 13. CHECK PROVIDER CAPACITY ---
        case "check_provider_capacity": {
            try {
                const capacity = await calculateIptvCapacity();
                const summary = `IPTV Capacity: ${capacity.totalActiveStreams}/${capacity.totalMaxConnections} active streams (${capacity.saturationPercentage}% saturation, ${capacity.dvrReservedStreams} reserved for DVR, ${capacity.freeStreamBuffer} open lines).`;

                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status: capacity.isSaturated ? "FAILED" : "SUCCESS",
                    target: "IPTV Provider Capacity",
                    summary,
                    details: capacity,
                    timestamp
                });

                return {
                    success: true,
                    result: capacity,
                    summary
                };
            } catch (err: any) {
                return { success: false, result: { error: err.message }, summary: `Capacity check failed: ${err.message}` };
            }
        }

        // --- 14. REQUEST LIVE CHANNEL ---
        case "request_live_channel": {
            try {
                const channelName = String(args.channel_name || "").trim();
                if (!channelName) {
                    return { success: false, result: { error: "Channel name required" }, summary: "Missing channel name" };
                }

                const { MEDIA_MARKETS, generateMarketAiPrompt } = await import("@/lib/iptv/market-locator");
                const { provisionMarketChannelsFromDispatcharr } = await import("@/lib/iptv/dispatcharr-client");

                const lowerInput = `${channelName} ${args.reason || ""}`.toLowerCase();
                let matchedMarketSlug: string | null = null;
                for (const [slug, m] of Object.entries(MEDIA_MARKETS)) {
                    if (lowerInput.includes(m.shortName.toLowerCase()) || lowerInput.includes(slug)) {
                        matchedMarketSlug = slug;
                        break;
                    }
                }

                let adminNotes: string | null = null;
                let autoProvisionCount = 0;
                let autoProvisioned = false;

                if (matchedMarketSlug) {
                    const aiPrompt = generateMarketAiPrompt(matchedMarketSlug, ctx.user?.username);
                    adminNotes = aiPrompt;
                    try {
                        const provRes = await provisionMarketChannelsFromDispatcharr(matchedMarketSlug);
                        if (provRes.success && provRes.createdCount > 0) {
                            autoProvisioned = true;
                            autoProvisionCount = provRes.createdCount;
                            adminNotes = `${aiPrompt}\n\n[AUTO-PROVISIONED]: Added ${provRes.createdCount} streams in Dispatcharr: ${provRes.matchedStreams.join(", ")}`;
                        }
                    } catch {}
                }

                const created = await prisma.iptvChannelRequest.create({
                    data: {
                        channelName,
                        genre: args.genre ? String(args.genre).trim() : (matchedMarketSlug ? "Local" : "Sports"),
                        reason: args.reason ? String(args.reason).trim() : "Requested via AI Server Assistant",
                        adminNotes,
                        requestedByUserId: ctx.user?.id || "anonymous",
                        requestedByUsername: ctx.user?.username || "member",
                        status: autoProvisioned ? "ACTIVATED" : "PENDING"
                    }
                });

                const summary = autoProvisioned
                    ? `Auto-provisioned ${autoProvisionCount} local channels for "${channelName}" in Dispatcharr and updated lineup!`
                    : `Submitted Live TV channel request for "${channelName}" with Dispatcharr AI prompt (Status: PENDING).`;

                ctx.actionsTaken.push({
                    action: "STREAM_PATTERN_DIAGNOSTIC",
                    status: "SUCCESS",
                    target: `Channel Request: ${channelName}`,
                    summary,
                    details: { ...created, autoProvisioned, autoProvisionCount },
                    timestamp
                });

                return {
                    success: true,
                    result: { ...created, autoProvisioned, autoProvisionCount },
                    summary
                };
            } catch (err: any) {
                return { success: false, result: { error: err.message }, summary: `Channel request failed: ${err.message}` };
            }
        }

        default:
            return { success: false, result: { error: `Unknown tool "${name}".` }, summary: `Unknown tool "${name}".` };
    }
}
