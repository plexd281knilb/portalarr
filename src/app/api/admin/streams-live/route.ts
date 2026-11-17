import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { getAdminDetailedStreamsAction } from "@/app/actions";

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

        const res = await getAdminDetailedStreamsAction();
        return NextResponse.json(res, {
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        });
    } catch (e: any) {
        console.error("GET /api/admin/streams-live error:", e);
        return NextResponse.json(
            { success: false, error: e?.message || "Failed to load detailed streams" },
            { status: 500 }
        );
    }
}
