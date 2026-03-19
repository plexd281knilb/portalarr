import { NextResponse } from "next/server";
import { getActiveDownloads } from "@/app/actions";

export const revalidate = 5; 

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

        return NextResponse.json(safeDownloads);
    } catch (error) {
        return NextResponse.json({ error: "Service unavailable" }, { status: 500 });
    }
}