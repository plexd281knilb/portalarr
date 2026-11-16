import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import {
    getAppUsersResult,
    getSettings,
    getTautulliInstances,
    getGlancesInstances,
    getMediaApps,
    getBetaDashboardText,
    getBetaCards,
    getRoadmapText,
    getDevRoadmapText,
    getAlertBanner,
    getAiAgentSettings,
    getPlexServersAction,
    getAdminNotificationEmailAction,
} from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (String(user.role || "").toUpperCase() !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const [
            usersRes,
            settings,
            tautulli,
            glances,
            mediaApps,
            betaText,
            betaCards,
            roadmapText,
            devRoadmapText,
            alertBanner,
            aiSettings,
            plexServers,
            adminEmailRes,
        ] = await Promise.all([
            getAppUsersResult().catch((err) => ({ success: false, users: [], error: err?.message })),
            getSettings().catch(() => ({})),
            getTautulliInstances().catch(() => []),
            getGlancesInstances().catch(() => []),
            getMediaApps().catch(() => []),
            getBetaDashboardText().catch(() => ""),
            getBetaCards().catch(() => []),
            getRoadmapText().catch(() => ""),
            getDevRoadmapText().catch(() => ""),
            getAlertBanner().catch(() => ({ enabled: false, text: "" })),
            getAiAgentSettings().catch(() => null),
            getPlexServersAction().catch(() => []),
            getAdminNotificationEmailAction().catch(() => null),
        ]);

        return NextResponse.json(
            {
                users: usersRes?.users || [],
                settings: settings || {},
                tautulli: tautulli || [],
                glances: glances || [],
                mediaApps: mediaApps || [],
                betaText: betaText || "",
                betaCards: betaCards || [],
                roadmapText: roadmapText || "",
                devRoadmapText: devRoadmapText || "",
                alertBanner: alertBanner || { enabled: false, text: "" },
                aiSettings: aiSettings || null,
                plexServers: plexServers || [],
                adminEmailRes: adminEmailRes || null,
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            }
        );
    } catch (e: any) {
        console.error("GET /api/admin/settings error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load settings" },
            { status: 500 }
        );
    }
}
