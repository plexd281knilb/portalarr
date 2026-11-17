import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/app/auth-actions";
import { resolveWorkingPlexServerConnection } from "@/lib/plex";
import { syncPlexCollection, getPlexLibraryMediaItems } from "@/lib/curation/plex-analyzer";
import { backupAndApplyOverlay, restoreItemOriginalArtwork } from "@/lib/curation/overlay-engine";

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ success: false, error: "Forbidden: Admin permissions required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const serverId = searchParams.get("serverId")?.trim() || undefined;

        const advisories = await prisma.mediaContentAdvisory.findMany({
            where: {
                isLeavingSoon: true,
                ...(serverId ? { serverId } : {})
            },
            orderBy: {
                leavingSoonDate: "asc"
            }
        });

        return NextResponse.json({
            success: true,
            leavingSoonCount: advisories.length,
            items: advisories
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ success: false, error: "Forbidden: Admin permissions required." }, { status: 403 });
        }

        const body = await req.json();
        const {
            ratingKey,
            serverId,
            sectionKey,
            title,
            reason,
            daysRemaining,
            deleteDate,
            imdbId,
            tmdbId,
            applyOverlay = true
        } = body;

        if (!ratingKey && !imdbId && !tmdbId) {
            return NextResponse.json({ success: false, error: "Missing ratingKey, imdbId, or tmdbId." }, { status: 400 });
        }

        const effectiveDate = deleteDate 
            ? new Date(deleteDate) 
            : daysRemaining 
                ? new Date(Date.now() + daysRemaining * 24 * 60 * 60 * 1000) 
                : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

        // Update or create MediaContentAdvisory record
        const advisory = await prisma.mediaContentAdvisory.upsert({
            where: {
                ratingKey_serverId: {
                    ratingKey: ratingKey || `guid-${imdbId || tmdbId}`,
                    serverId: serverId || "default"
                }
            },
            update: {
                isLeavingSoon: true,
                leavingSoonDate: effectiveDate,
                leavingReason: reason || "Storage capacity cleanup",
                imdbId: imdbId || undefined,
                tmdbId: tmdbId ? String(tmdbId) : undefined,
                title: title || undefined
            },
            create: {
                ratingKey: ratingKey || `guid-${imdbId || tmdbId}`,
                serverId: serverId || "default",
                title: title || "Unknown Media",
                isLeavingSoon: true,
                leavingSoonDate: effectiveDate,
                leavingReason: reason || "Storage capacity cleanup",
                imdbId: imdbId || undefined,
                tmdbId: tmdbId ? String(tmdbId) : undefined
            }
        });

        // If server credentials exist, update Plex collection and overlay
        let resolved: any = null;
        if (serverId) {
            resolved = await resolveWorkingPlexServerConnection(serverId).catch(() => null);
        }

        const canonicalServerId = resolved?.serverId || serverId || "default";

        if (serverId && ratingKey && sectionKey) {
            if (resolved && resolved.serverUrl && resolved.token) {
                const token = resolved.token;
                const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter((u: string) => u !== resolved.serverUrl)];

                // Fetch all active leaving soon items for this server
                const serverIdCandidates = Array.from(new Set([serverId, canonicalServerId].filter(Boolean)));
                const allLeavingRecords = await prisma.mediaContentAdvisory.findMany({
                    where: { isLeavingSoon: true, serverId: { in: serverIdCandidates } },
                    select: { ratingKey: true }
                });
                const allLeavingKeys = Array.from(new Set([...allLeavingRecords.map(r => r.ratingKey), ratingKey])).filter(k => !k.startsWith("guid-"));

                // Sync to "Leaving Soon" Plex collection
                if (allLeavingKeys.length > 0) {
                    await syncPlexCollection(
                        urlsToTry,
                        token,
                        sectionKey,
                        "⚠️ Leaving Soon",
                        allLeavingKeys,
                        {
                            summary: "These items are scheduled to be removed soon to free up disk space. Watch them while you can!",
                            sortTitle: "!000_LeavingSoon",
                            serverName: resolved.serverName
                        }
                    );
                }

                // Apply overlay if requested
                if (applyOverlay) {
                    const items = await getPlexLibraryMediaItems(urlsToTry, token, sectionKey, 100);
                    const matchedItem = items.find(it => it.ratingKey === ratingKey);
                    if (matchedItem) {
                        const daysLeft = Math.max(1, Math.ceil((effectiveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                        matchedItem.isLeavingSoon = true;
                        await backupAndApplyOverlay(
                            urlsToTry,
                            token,
                            canonicalServerId,
                            matchedItem,
                            {
                                showLeavingSoon: true,
                                leavingSoonDays: daysLeft,
                                placeholderText: `LEAVING IN ${daysLeft} DAYS`,
                                placeholderTheme: "crimson-red",
                                placeholderPosition: "bottom",
                                position: "bottom-center"
                            },
                            true,
                            resolved.serverName
                        );
                    }
                }
            }
        }

        const targetServerLabel = resolved?.serverName || serverId || "Plex";
        logger.addLog("WARN", "CURATION", `Marked "${title || ratingKey}" as LEAVING SOON on Plex server "${targetServerLabel}" (Scheduled for ${effectiveDate.toLocaleDateString()})`, `Reason: ${reason || 'Storage pruning'}`);

        return NextResponse.json({
            success: true,
            advisory,
            message: `Flagged "${title || ratingKey}" as leaving soon on Plex server "${targetServerLabel}".`
        });
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Failed to flag leaving soon: ${e.message}`);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ success: false, error: "Forbidden: Admin permissions required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const ratingKey = searchParams.get("ratingKey");
        const serverId = searchParams.get("serverId")?.trim() || "default";

        if (!ratingKey) {
            return NextResponse.json({ success: false, error: "Missing ratingKey." }, { status: 400 });
        }

        const resolved = await resolveWorkingPlexServerConnection(serverId).catch(() => null);
        const serverIdCandidates = Array.from(new Set([serverId, resolved?.serverId].filter((s): s is string => Boolean(s))));

        await prisma.mediaContentAdvisory.updateMany({
            where: {
                ratingKey,
                serverId: { in: serverIdCandidates }
            },
            data: {
                isLeavingSoon: false,
                leavingSoonDate: null,
                leavingReason: null
            }
        });

        // Strictly revert poster art on the target server only (never fall back to Main Plex!)
        if (resolved && resolved.serverUrl && resolved.token) {
            const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter((u: string) => u !== resolved.serverUrl)];
            await restoreItemOriginalArtwork(urlsToTry, resolved.token, resolved.serverId, ratingKey);
        }

        return NextResponse.json({
            success: true,
            message: `Removed leaving soon tag for RatingKey: ${ratingKey}.`
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
