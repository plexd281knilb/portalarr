/**
 * Tautulli History Backfill Engine
 * Connects to configured external Tautulli instances, extracts historical watch sessions,
 * normalizes media and stream telemetry, and backfills them into Portalarr's native SQLite WatchHistory table.
 */

import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { normalizeIp, isPrivateOrLocalIp } from "./stream-tracker";
import { logger } from "@/lib/logger";

function cleanUrl(rawUrl: string): string {
    return rawUrl.trim().replace(/\/+$/, "");
}

export interface TautulliBackfillResult {
    success: boolean;
    imported: number;
    skipped: number;
    totalAvailable: number;
    instancesProcessed: number;
    message: string;
    errors?: string[];
}

export async function backfillTautulliHistoryInternal(options?: {
    instanceId?: string;
    limit?: number;
}): Promise<TautulliBackfillResult> {
    const maxItems = Math.min(5000, Math.max(50, options?.limit || 500));
    const errors: string[] = [];

    try {
        const instances = await prisma.tautulliInstance.findMany({
            where: options?.instanceId ? { id: options.instanceId } : undefined,
            orderBy: { createdAt: "asc" }
        });

        if (instances.length === 0) {
            return {
                success: false,
                imported: 0,
                skipped: 0,
                totalAvailable: 0,
                instancesProcessed: 0,
                message: "No Tautulli instances found to backfill from.",
                errors: ["No configured Tautulli instance found in settings."]
            };
        }

        let totalImported = 0;
        let totalSkipped = 0;
        let grandTotal = 0;

        for (const inst of instances) {
            let baseUrl = cleanUrl(inst.url).replace(/\/api\/v2\/?$/, "");
            const apiKey = inst.apiKey ? decryptData(inst.apiKey) : "";

            if (!apiKey) {
                errors.push(`Missing or invalid API key for Tautulli instance "${inst.name}".`);
                continue;
            }

            const historyUrl = `${baseUrl}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_history&length=${maxItems}&start=0`;

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 15000);

                const res = await fetch(historyUrl, {
                    signal: controller.signal,
                    headers: { "Accept": "application/json" }
                });
                clearTimeout(timeoutId);

                if (!res.ok) {
                    errors.push(`Tautulli "${inst.name}" responded with HTTP ${res.status}: ${res.statusText}`);
                    continue;
                }

                const json = await res.json();
                const resp = json.response || json;
                if (resp.result === "error") {
                    errors.push(`Tautulli "${inst.name}" error: ${resp.message || "Unknown error"}`);
                    continue;
                }

                const historyItems = resp.data?.data || resp.data || [];
                if (!Array.isArray(historyItems)) {
                    errors.push(`Tautulli "${inst.name}" returned unexpected history format.`);
                    continue;
                }

                grandTotal += historyItems.length;

                for (const item of historyItems) {
                    const rawUser = (item.friendly_name || item.user || "Plex User").trim();
                    const sessionKey = String(item.session_key || item.id || item.row_id || "");
                    const ratingKey = String(item.rating_key || "");
                    const title = item.title || item.full_title || "Unknown Media";
                    const grandparentTitle = item.grandparent_title || null;
                    const parentTitle = item.parent_title || null;
                    const isEpisode = item.media_type === "episode" || !!grandparentTitle;
                    const mediaType = isEpisode ? "episode" : "movie";
                    const year = item.year ? Number(item.year) : null;
                    const seasonNum = item.parent_media_index ? Number(item.parent_media_index) : null;
                    const episodeNum = item.media_index ? Number(item.media_index) : null;

                    const startedTimestamp = item.started || item.date || item.stopped;
                    if (!startedTimestamp) {
                        totalSkipped++;
                        continue;
                    }

                    const watchedAt = new Date(startedTimestamp * 1000);
                    const stoppedAt = item.stopped ? new Date(item.stopped * 1000) : watchedAt;

                    // Deduplication check: check if an identical play is already logged in SQLite within a 2-hour window
                    const twoHoursBefore = new Date(watchedAt.getTime() - 2 * 60 * 60 * 1000);
                    const twoHoursAfter = new Date(watchedAt.getTime() + 2 * 60 * 60 * 1000);

                    const existing = await prisma.watchHistory.findFirst({
                        where: {
                            user: rawUser,
                            serverName: inst.name,
                            ...(ratingKey ? { ratingKey } : { title }),
                            watchedAt: {
                                gte: twoHoursBefore,
                                lte: twoHoursAfter
                            }
                        }
                    }).catch(() => null);

                    if (existing) {
                        totalSkipped++;
                        continue;
                    }

                    const ipAddress = normalizeIp(item.ip_address);
                    const location = isPrivateOrLocalIp(ipAddress) ? "LAN" : "Remote";
                    const videoDecision = (item.video_decision || item.transcode_decision || "direct play").toLowerCase();
                    const audioDecision = (item.audio_decision || "direct play").toLowerCase();
                    const percentComplete = item.percent_complete !== undefined ? Number(item.percent_complete) : (item.watched_status === 1 ? 100 : 0);
                    const isCompleted = item.watched_status === 1 || percentComplete >= 90;
                    const durationSec = item.duration ? Number(item.duration) : 0;
                    const durationMs = durationSec * 1000;
                    const viewOffsetMs = Math.round((percentComplete / 100) * durationMs);

                    await prisma.watchHistory.create({
                        data: {
                            sessionKey: sessionKey || undefined,
                            ratingKey: ratingKey || undefined,
                            serverName: inst.name,
                            user: rawUser,
                            title,
                            grandparentTitle,
                            parentTitle,
                            seasonNum,
                            episodeNum,
                            mediaType,
                            year,
                            thumb: item.thumb || null,
                            player: item.player || item.product || null,
                            platform: item.platform || null,
                            device: item.platform || item.player || null,
                            ipAddress: ipAddress || null,
                            location,
                            videoDecision,
                            audioDecision,
                            transcodeHw: false,
                            streamBitrate: item.bitrate ? Number(item.bitrate) : null,
                            viewOffsetMs,
                            durationMs,
                            progressPercent: percentComplete,
                            state: isCompleted ? "completed" : "stopped",
                            watchedAt,
                            stoppedAt,
                            completed: isCompleted,
                            isSharingAlert: false
                        }
                    }).catch(() => null);

                    totalImported++;
                }

            } catch (instErr: any) {
                errors.push(`Failed querying Tautulli "${inst.name}": ${instErr.message || instErr}`);
            }
        }

        logger.addLog(
            "INFO",
            "SYSTEM",
            `📥 [TAUTULLI-BACKFILL] Completed watch history backfill: Imported ${totalImported} records, skipped ${totalSkipped} duplicates across ${instances.length} instance(s).`
        );

        return {
            success: totalImported > 0 || errors.length === 0,
            imported: totalImported,
            skipped: totalSkipped,
            totalAvailable: grandTotal,
            instancesProcessed: instances.length,
            message: `Successfully backfilled ${totalImported} historical sessions (${totalSkipped} existing duplicates skipped).`,
            errors: errors.length > 0 ? errors : undefined
        };
    } catch (err: any) {
        console.error("[TAUTULLI-BACKFILL] Fatal error during history backfill:", err);
        return {
            success: false,
            imported: 0,
            skipped: 0,
            totalAvailable: 0,
            instancesProcessed: 0,
            message: `Backfill failed: ${err.message || String(err)}`,
            errors: [err.message || String(err)]
        };
    }
}
