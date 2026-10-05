import { NextResponse } from "next/server";
import { getActiveDownloads } from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
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