import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { getStreamIntelligenceDataAction, getTautulliBackfillStatusAction } from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (String(user.role || "").toUpperCase() !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const sp = req.nextUrl.searchParams;
        const rangeParam = (sp.get("range") || "all") as "all" | "30d" | "60d" | "90d" | "custom";
        const search = sp.get("search") || undefined;
        const serverFilter = sp.get("serverFilter") || undefined;
        const startDate = sp.get("startDate") || undefined;
        const endDate = sp.get("endDate") || undefined;
        const userSort = sp.get("userSort") || undefined;

        const [telemetry, backfillStatus] = await Promise.all([
            getStreamIntelligenceDataAction({
                search,
                serverFilter,
                range: rangeParam,
                startDate,
                endDate,
                userSort,
            }),
            getTautulliBackfillStatusAction().catch(() => null),
        ]);

        return NextResponse.json(
            { telemetry, backfillStatus },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            }
        );
    } catch (e: any) {
        console.error("GET /api/admin/tautulli error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load stream intelligence data" },
            { status: 500 }
        );
    }
}
