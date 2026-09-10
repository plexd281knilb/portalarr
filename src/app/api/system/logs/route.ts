import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getCurrentUser } from "@/app/auth-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const limitParam = searchParams.get("limit");
        const sinceId = searchParams.get("since") || undefined;
        const limit = limitParam ? parseInt(limitParam, 10) : 1000;

        const logs = logger.getLogs(isNaN(limit) ? 1000 : limit, sinceId);
        const total = logger.getTotalCount();

        return NextResponse.json(
            { logs, total, timestamp: new Date().toISOString() },
            {
                headers: {
                    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, proxy-revalidate",
                    "Pragma": "no-cache",
                    "Expires": "0"
                }
            }
        );
    } catch (e: any) {
        console.error("GET /api/system/logs error:", e);
        return NextResponse.json({ error: e.message || "Failed to retrieve logs" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
        }

        logger.clearLogs();
        return NextResponse.json({ success: true, message: "System logs buffer cleared." });
    } catch (e: any) {
        console.error("DELETE /api/system/logs error:", e);
        return NextResponse.json({ error: e.message || "Failed to clear logs" }, { status: 500 });
    }
}
