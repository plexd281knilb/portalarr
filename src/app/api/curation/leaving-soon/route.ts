import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";
import { resolveWorkingPlexServerConnection } from "@/lib/plex";
import { syncPlexCollection, getPlexLibraryMediaItems } from "@/lib/curation/plex-analyzer";
import { backupAndApplyOverlay, restoreItemOriginalArtwork } from "@/lib/curation/overlay-engine";

export async function GET(req: NextRequest) {
    try {
        const advisories = await prisma.mediaContentAdvisory.findMany({
            where: {
                isLeavingSoon: true
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
        if (serverId && ratingKey && sectionKey) {
            const resolved = await resolveWorkingPlexServerConnection(serverId);
            if (resolved && resolved.serverUrl && resolved.token) {
                const token = resolved.token;
                const urlsToTry = [resolved.serverUrl, ...resolved.allCandidateUrls.filter(u => u !== resolved.serverUrl)];

                // Sync to "Leaving Soon" Plex collection
                await syncPlexCollection(
                    urlsToTry,
                    token,
                    sectionKey,
                    "⚠️ Leaving Soon",
                    [ratingKey],
                    {
                        summary: "These items are scheduled to be removed soon to free up disk space. Watch them while you can!",
                        sortTitle: "!000_LeavingSoon"
                    }
                );

                // Apply overlay if requested
                if (applyOverlay) {
                    const items = await getPlexLibraryMediaItems(urlsToTry, token, sectionKey, 100);
                    const matchedItem = items.find(it => it.ratingKey === ratingKey);
                    if (matchedItem) {
                        const daysLeft = Math.max(1, Math.ceil((effectiveDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
                        await backupAndApplyOverlay(
                            resolved.serverUrl,
                            token,
                            serverId,
                            matchedItem,
                            {
                                showLeavingSoon: true,
                                leavingSoonDays: daysLeft,
                                position: "top-right"
                            }
                        );
                    }
                }
            }
        }

        logger.addLog("WARN", "CURATION", `Marked "${title || ratingKey}" as LEAVING SOON (Scheduled for ${effectiveDate.toLocaleDateString()})`, `Reason: ${reason || 'Storage pruning'}`);

        return NextResponse.json({
            success: true,
            advisory,
            message: `Flagged "${title || ratingKey}" as leaving soon.`
        });
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Failed to flag leaving soon: ${e.message}`);
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const ratingKey = searchParams.get("ratingKey");
        const serverId = searchParams.get("serverId") || "default";

        if (!ratingKey) {
            return NextResponse.json({ success: false, error: "Missing ratingKey." }, { status: 400 });
        }

        await prisma.mediaContentAdvisory.updateMany({
            where: {
                ratingKey,
                serverId
            },
            data: {
                isLeavingSoon: false,
                leavingSoonDate: null,
                leavingReason: null
            }
        });

        // Revert poster art if backed up
        const settings = await prisma.settings.findFirst({ where: { id: "global" } });
        const token = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        const serverUrl = settings?.mainPlexUrl || "";

        if (token && serverUrl) {
            await restoreItemOriginalArtwork(serverUrl, token, serverId, ratingKey);
        }

        return NextResponse.json({
            success: true,
            message: `Removed leaving soon tag for RatingKey: ${ratingKey}.`
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: e.message }, { status: 500 });
    }
}
