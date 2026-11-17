import { NextResponse } from "next/server";
import { getActiveDownloads } from "@/app/actions";
import { getSession } from "@/app/auth-actions";
import prisma from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const session = await getSession();
        const userId = String(session?.userId || session?.id || "");
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, status: true }
        });
        if (!dbUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const role = String(dbUser.role || "").toUpperCase();
        const status = String(dbUser.status || "").toUpperCase();
        if (role !== "ADMIN" && (status === "PENDING" || status === "REJECTED" || status === "SUSPENDED" || status === "EXPIRED")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const rawDownloads = await getActiveDownloads();
        
        // Strip out internal paths, IPs, and API keys
        const safeDownloads = rawDownloads?.map((app: any) => ({
            // Keep the app name but NOT its URL/Key
            appName: app.name || "Download Client", 
            queue: app.queue?.map((item: any) => ({
                filename: item.filename || item.title || "Unknown Download",
                mbleft: item.mbleft || 0,
                mb: item.mb || 0,
                percentage: item.percentage || 0,
                timeleft: item.timeleft || "Unknown Time"
            })) || []
        })) || [];

        return NextResponse.json(safeDownloads, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        });
    } catch (error) {
        return NextResponse.json({ error: "Service unavailable" }, { 
            status: 500,
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
            }
        });
    }
}