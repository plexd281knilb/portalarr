import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { fetchPhoneClusterTelemetry } from "@/lib/monitoring/phone-cluster";

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

        const data = await fetchPhoneClusterTelemetry();
        return NextResponse.json(data, {
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        });
    } catch (e: any) {
        console.error("GET /api/admin/phone-cluster error:", e);
        return NextResponse.json(
            { success: false, error: e?.message || "Failed to probe phone cluster" },
            { status: 500 }
        );
    }
}
