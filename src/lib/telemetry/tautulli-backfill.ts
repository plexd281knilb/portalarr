/**
 * Tautulli History Backfill Engine
 * Connects to configured external Tautulli instances, extracts historical watch sessions,
 * normalizes media and stream telemetry, and backfills them into Portalarr's native SQLite WatchHistory table.
 * Supports unlimited / complete historical backfills with live progress tracking and pagination.
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

export interface BackfillProgressState {
    isRunning: boolean;
    instanceId?: string;
    instanceName?: string;
    totalAvailable: number;
    processedCount: number;
    importedCount: number;
    skippedCount: number;
    currentPage: number;
    totalPages: number;
    isUnlimited: boolean;
    limit: number;
    startedAt: string | null;
    completedAt: string | null;
    error: string | null;
    statusText: string;
    result?: TautulliBackfillResult | null;
}

export function getTautulliBackfillProgress(): BackfillProgressState {
    const globalState = (global as any).__tautulliBackfillProgress;
    if (!globalState) {
        return {
            isRunning: false,
            totalAvailable: 0,
            processedCount: 0,
            importedCount: 0,
            skippedCount: 0,
            currentPage: 0,
            totalPages: 0,
            isUnlimited: false,
            limit: 500,
            startedAt: null,
            completedAt: null,
            error: null,
            statusText: "Idle",
            result: null
        };
    }
    return { ...globalState };
}

function updateProgress(partial: Partial<BackfillProgressState>): BackfillProgressState {
    const current = getTautulliBackfillProgress();
    const updated: BackfillProgressState = { ...current, ...partial };
    (global as any).__tautulliBackfillProgress = updated;
    return updated;
}

export function stopTautulliBackfill(): boolean {
    const current = getTautulliBackfillProgress();
    if (!current.isRunning) return false;

    (global as any).__tautulliBackfillAbortRequested = true;
    const abortCtrl = (global as any).__tautulliBackfillAbortController as AbortController | undefined;
    if (abortCtrl) {
        try {
            abortCtrl.abort();
        } catch {}
    }
    updateProgress({
        statusText: "Stopping backfill..."
    });
    return true;
}

export async function startTautulliBackfillInternal(options?: {
    instanceId?: string;
    limit?: number;
    unlimited?: boolean;
}): Promise<{ success: boolean; started: boolean; alreadyRunning?: boolean; progress: BackfillProgressState }> {
    const current = getTautulliBackfillProgress();
    if (current.isRunning) {
        return { success: true, started: false, alreadyRunning: true, progress: current };
    }

    // Launch background asynchronous task (unawaited)
    backfillTautulliHistoryInternal(options).catch((err) => {
        console.error("[TAUTULLI-BACKFILL] Background execution error:", err);
    });

    return {
        success: true,
        started: true,
        progress: getTautulliBackfillProgress()
    };
}

export async function backfillTautulliHistoryInternal(options?: {
    instanceId?: string;
    limit?: number;
    unlimited?: boolean;
}): Promise<TautulliBackfillResult> {
    const isUnlimited = options?.unlimited === true || options?.limit === 0 || options?.limit === -1;
    const targetLimit = isUnlimited ? Number.MAX_SAFE_INTEGER : Math.max(1, options?.limit || 500);
    const errors: string[] = [];

    (global as any).__tautulliBackfillAbortRequested = false;

    updateProgress({
        isRunning: true,
        startedAt: new Date().toISOString(),
        completedAt: null,
        error: null,
        processedCount: 0,
        importedCount: 0,
        skippedCount: 0,
        currentPage: 0,
        totalPages: 0,
        isUnlimited,
        limit: isUnlimited ? 0 : targetLimit,
        statusText: `Starting ${isUnlimited ? "unlimited complete" : `${targetLimit} record`} backfill...`,
        result: null
    });

    try {
        const instances = await prisma.tautulliInstance.findMany({
            where: options?.instanceId ? { id: options.instanceId } : undefined,
            orderBy: { createdAt: "asc" }
        });

        if (instances.length === 0) {
            const failResult: TautulliBackfillResult = {
                success: false,
                imported: 0,
                skipped: 0,
                totalAvailable: 0,
                instancesProcessed: 0,
                message: "No Tautulli instances found to backfill from.",
                errors: ["No configured Tautulli instance found in settings."]
            };
            updateProgress({
                isRunning: false,
                completedAt: new Date().toISOString(),
                statusText: "No Tautulli instances found.",
                result: failResult
            });
            return failResult;
        }

        let totalImported = 0;
        let totalSkipped = 0;
        let grandTotal = 0;
        let grandProcessed = 0;

        const PAGE_SIZE = 500;

        for (const inst of instances) {
            if ((global as any).__tautulliBackfillAbortRequested) break;

            const baseUrl = cleanUrl(inst.url).replace(/\/api\/v2\/?$/, "");
            const apiKey = inst.apiKey ? decryptData(inst.apiKey) : "";

            if (!apiKey) {
                errors.push(`Missing or invalid API key for Tautulli instance "${inst.name}".`);
                continue;
            }

            let offset = 0;
            let instanceTotalRecords = 0;

            while (offset < targetLimit) {
                if ((global as any).__tautulliBackfillAbortRequested) break;

                const fetchLength = Math.min(PAGE_SIZE, targetLimit - offset);
                if (fetchLength <= 0) break;

                const historyUrl = `${baseUrl}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=get_history&length=${fetchLength}&start=${offset}`;

                const controller = new AbortController();
                (global as any).__tautulliBackfillAbortController = controller;
                const timeoutId = setTimeout(() => controller.abort(), 30000);

                let res: Response;
                try {
                    res = await fetch(historyUrl, {
                        signal: controller.signal,
                        headers: { "Accept": "application/json" }
                    });
                } catch (fetchErr: any) {
                    clearTimeout(timeoutId);
                    if ((global as any).__tautulliBackfillAbortRequested) break;
                    errors.push(`Tautulli "${inst.name}" connection error: ${fetchErr.message || fetchErr}`);
                    break;
                }
                clearTimeout(timeoutId);

                if (!res.ok) {
                    errors.push(`Tautulli "${inst.name}" responded with HTTP ${res.status}: ${res.statusText}`);
                    break;
                }

                const json = await res.json().catch(() => null);
                if (!json) {
                    errors.push(`Tautulli "${inst.name}" returned invalid JSON.`);
                    break;
                }

                const resp = json.response || json;
                if (resp.result === "error") {
                    errors.push(`Tautulli "${inst.name}" error: ${resp.message || "Unknown error"}`);
                    break;
                }

                const historyItems = resp.data?.data || resp.data || [];
                if (!Array.isArray(historyItems) || historyItems.length === 0) {
                    // No more records in Tautulli
                    break;
                }

                const recordsTotal = Number(resp.data?.recordsTotal || resp.data?.recordsFiltered || 0);
                if (recordsTotal > instanceTotalRecords) {
                    instanceTotalRecords = recordsTotal;
                    grandTotal = Math.max(grandTotal, instanceTotalRecords);
                }

                // Collect valid items with timestamps
                const validItems: Array<{ item: any; startedTimestamp: number }> = [];
                for (const item of historyItems) {
                    const startedTimestamp = item.started || item.date || item.stopped;
                    if (!startedTimestamp) {
                        totalSkipped++;
                        continue;
                    }
                    validItems.push({ item, startedTimestamp: Number(startedTimestamp) });
                }

                if (validItems.length > 0) {
                    // Optimized batch deduplication: find all candidate records in DB within time range +/- 2 hours
                    const timestamps = validItems.map((v) => v.startedTimestamp * 1000);
                    const minTime = Math.min(...timestamps) - 2 * 60 * 60 * 1000;
                    const maxTime = Math.max(...timestamps) + 2 * 60 * 60 * 1000;

                    const existingCandidates = await prisma.watchHistory.findMany({
                        where: {
                            serverName: inst.name,
                            watchedAt: {
                                gte: new Date(minTime),
                                lte: new Date(maxTime)
                            }
                        },
                        select: {
                            user: true,
                            ratingKey: true,
                            title: true,
                            watchedAt: true
                        }
                    }).catch(() => []);

                    const batchKnown: Array<{ user: string; ratingKey: string | null; title: string; watchedAt: Date }> = [...existingCandidates];
                    const rowsToInsert: any[] = [];

                    for (const { item, startedTimestamp } of validItems) {
                        const rawUser = (item.friendly_name || item.user || "Plex User").trim();
                        const sessionKey = String(item.session_key || item.id || item.row_id || "");
                        const ratingKey = String(item.rating_key || "");
                        const title = item.title || item.full_title || "Unknown Media";
                        const watchedAt = new Date(startedTimestamp * 1000);

                        // Deduplication: same user, matching ratingKey or title, within 2-hour window
                        const isDuplicate = batchKnown.some((ex) => {
                            if (ex.user.toLowerCase() !== rawUser.toLowerCase()) return false;
                            const keyMatch = (ratingKey && ex.ratingKey && ex.ratingKey === ratingKey) ||
                                             (ex.title.toLowerCase() === title.toLowerCase());
                            if (!keyMatch) return false;
                            const diffMs = Math.abs(ex.watchedAt.getTime() - watchedAt.getTime());
                            return diffMs <= 2 * 60 * 60 * 1000;
                        });

                        if (isDuplicate) {
                            totalSkipped++;
                            continue;
                        }

                        const grandparentTitle = item.grandparent_title || null;
                        const parentTitle = item.parent_title || null;
                        const isEpisode = item.media_type === "episode" || !!grandparentTitle;
                        const mediaType = isEpisode ? "episode" : "movie";
                        const year = item.year ? Number(item.year) : null;
                        const seasonNum = item.parent_media_index ? Number(item.parent_media_index) : null;
                        const episodeNum = item.media_index ? Number(item.media_index) : null;

                        const ipAddress = normalizeIp(item.ip_address);
                        const location = isPrivateOrLocalIp(ipAddress) ? "LAN" : "Remote";
                        const videoDecision = (item.video_decision || item.transcode_decision || "direct play").toLowerCase();
                        const audioDecision = (item.audio_decision || "direct play").toLowerCase();
                        const percentComplete = item.percent_complete !== undefined
                            ? Number(item.percent_complete)
                            : item.watched_status === 1
                            ? 100
                            : 0;
                        const isCompleted = item.watched_status === 1 || percentComplete >= 90;
                        const durationSec = item.duration ? Number(item.duration) : 0;
                        const durationMs = durationSec * 1000;
                        const viewOffsetMs = Math.round((percentComplete / 100) * durationMs);
                        const stoppedAt = item.stopped ? new Date(item.stopped * 1000) : watchedAt;

                        rowsToInsert.push({
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
                        });

                        batchKnown.push({ user: rawUser, ratingKey, title, watchedAt });
                    }

                    // Bulk insertion into SQLite in safe parameter chunks
                    if (rowsToInsert.length > 0) {
                        for (let c = 0; c < rowsToInsert.length; c += 40) {
                            const chunk = rowsToInsert.slice(c, c + 40);
                            try {
                                await prisma.watchHistory.createMany({ data: chunk });
                            } catch {
                                for (const singleRow of chunk) {
                                    await prisma.watchHistory.create({ data: singleRow }).catch(() => null);
                                }
                            }
                        }
                        totalImported += rowsToInsert.length;
                    }
                }

                offset += historyItems.length;
                grandProcessed += historyItems.length;

                const currentPage = Math.ceil(offset / PAGE_SIZE);
                const totalPages = instanceTotalRecords > 0
                    ? Math.ceil(instanceTotalRecords / PAGE_SIZE)
                    : currentPage + 1;

                updateProgress({
                    isRunning: true,
                    instanceId: inst.id,
                    instanceName: inst.name,
                    totalAvailable: Math.max(grandTotal, totalImported + totalSkipped),
                    processedCount: grandProcessed,
                    importedCount: totalImported,
                    skippedCount: totalSkipped,
                    currentPage,
                    totalPages,
                    isUnlimited,
                    limit: isUnlimited ? 0 : targetLimit,
                    statusText: `Imported ${totalImported.toLocaleString()} records (${totalSkipped.toLocaleString()} skipped) from ${inst.name}...`
                });

                // End of Tautulli records reached
                if (historyItems.length < fetchLength) {
                    break;
                }
                if (instanceTotalRecords > 0 && offset >= instanceTotalRecords) {
                    break;
                }
            }
        }

        const isCancelled = Boolean((global as any).__tautulliBackfillAbortRequested);

        if (totalImported > 0 || totalSkipped > 0) {
            await prisma.settings.updateMany({
                where: { id: "global" },
                data: { tautulliBackfillLastRun: new Date() }
            }).catch(() => {});
        }

        logger.addLog(
            "INFO",
            "SYSTEM",
            `📥 [TAUTULLI-BACKFILL] ${isCancelled ? "Cancelled" : "Completed"} watch history backfill: Imported ${totalImported} records, skipped ${totalSkipped} duplicates across ${instances.length} instance(s).`
        );

        const finalResult: TautulliBackfillResult = {
            success: totalImported > 0 || errors.length === 0,
            imported: totalImported,
            skipped: totalSkipped,
            totalAvailable: Math.max(grandTotal, totalImported + totalSkipped),
            instancesProcessed: instances.length,
            message: isCancelled
                ? `Backfill stopped by administrator: Imported ${totalImported.toLocaleString()} sessions (${totalSkipped.toLocaleString()} duplicates skipped before stopping).`
                : `Successfully backfilled ${totalImported.toLocaleString()} historical sessions (${totalSkipped.toLocaleString()} existing duplicates skipped).`,
            errors: errors.length > 0 ? errors : undefined
        };

        updateProgress({
            isRunning: false,
            completedAt: new Date().toISOString(),
            statusText: isCancelled ? "Backfill cancelled by administrator." : "Backfill completed.",
            result: finalResult
        });

        return finalResult;
    } catch (err: any) {
        console.error("[TAUTULLI-BACKFILL] Fatal error during history backfill:", err);
        const failResult: TautulliBackfillResult = {
            success: false,
            imported: 0,
            skipped: 0,
            totalAvailable: 0,
            instancesProcessed: 0,
            message: `Backfill failed: ${err.message || String(err)}`,
            errors: [err.message || String(err)]
        };
        updateProgress({
            isRunning: false,
            completedAt: new Date().toISOString(),
            error: err.message || String(err),
            statusText: `Error: ${err.message || String(err)}`,
            result: failResult
        });
        return failResult;
    } finally {
        (global as any).__tautulliBackfillAbortController = null;
        (global as any).__tautulliBackfillAbortRequested = false;
    }
}
