import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { getFleetMonitoringDataAction, getMonitoringConfigAction } from "@/app/actions";

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

        const [telemetry, config] = await Promise.all([
            getFleetMonitoringDataAction(),
            getMonitoringConfigAction().catch(() => null),
        ]);

        return NextResponse.json(
            { telemetry, config },
            {
                headers: {
                    "Cache-Control": "no-store, max-age=0",
                },
            }
        );
    } catch (e: any) {
        console.error("GET /api/admin/monitoring error:", e);
        return NextResponse.json(
            { error: e?.message || "Failed to load fleet monitoring telemetry" },
            { status: 500 }
        );
    }
}
