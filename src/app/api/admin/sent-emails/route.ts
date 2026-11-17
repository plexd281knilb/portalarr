import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { getSentEmailLogsAction } from "@/app/actions";

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
        const search = sp.get("search") || "";
        const mode = (sp.get("mode") || "ALL") as "ALL" | "AUTOMATIC" | "APPROVED_AND_SENT";
        const status = (sp.get("status") || "ALL") as "ALL" | "SENT" | "FAILED";
        const page = Number(sp.get("page") || "1") || 1;
        const limit = Number(sp.get("limit") || "25") || 25;

        const res = await getSentEmailLogsAction({ search, mode, status, page, limit });
        return NextResponse.json(res, {
            headers: { "Cache-Control": "no-store, max-age=0" },
        });
    } catch (e: any) {
        console.error("GET /api/admin/sent-emails error:", e);
        return NextResponse.json(
            { success: false, error: e?.message || "Failed to load sent email logs" },
            { status: 500 }
        );
    }
}
