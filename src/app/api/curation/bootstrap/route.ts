import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import {
    getCurationSettingsAction,
    getCustomBadgesAction,
    getOverlayRulesAction,
    getArrInstancesListAction,
    getYouTubeCookiesStatusAction,
} from "@/app/curation-actions";

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

        const [settingsRes, badgesRes, rulesRes, arrRes, youtubeCookiesRes] = await Promise.all([
            getCurationSettingsAction().catch((err) => ({ success: false, error: err?.message })),
            getCustomBadgesAction().catch(() => ({ success: false, badges: [] })),
            getOverlayRulesAction().catch(() => ({ success: false, rules: [], backupsCount: 0 })),
            getArrInstancesListAction().catch(() => ({ success: false, radarr: [], sonarr: [] })),
            getYouTubeCookiesStatusAction().catch(() => ({ success: false })),
        ]);

        return NextResponse.json(
            {
                settings: settingsRes,
                badges: badgesRes,
                rules: rulesRes,
                arr: arrRes,
                youtubeCookies: youtubeCookiesRes,
            },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            }
        );
    } catch (e: any) {
        console.error("GET /api/curation/bootstrap error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load curation DB state" },
            { status: 500 }
        );
    }
}
