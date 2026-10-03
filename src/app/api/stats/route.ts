import { NextResponse } from "next/server";
import { getLandingStats } from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const rawStats = await getLandingStats();

        // Security: Strip out API keys, URLs, and internal IPs
        // but KEEP the exact structure the frontend expects!
        const safeStats = {
            // Keep the array of down apps
            downApps: rawStats.downApps || [],
            
            // Map the streams per server
            streamStats: rawStats.streamStats?.map((server: any) => ({
                name: server.name,
                count: server.count
            })) || [],
            
            // Map the hardware stats
            serverStats: rawStats.serverStats?.map((server: any) => ({
                name: server.name,
                online: server.online,
                cpu: server.cpu,
                ram: server.ram
            })) || []
        };

        return NextResponse.json(safeStats, {
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        });
    } catch (error) {
        console.error("Stats API Error:", error);
        return NextResponse.json({ error: "Service unavailable" }, { 
            status: 500,
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0"
            }
        });
    }
}