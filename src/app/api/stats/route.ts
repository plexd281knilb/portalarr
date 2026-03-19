import { NextResponse } from "next/server";
import { getLandingStats } from "@/app/actions";

// Cache the response for 30 seconds
export const revalidate = 5; 

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

        return NextResponse.json(safeStats);
    } catch (error) {
        console.error("Stats API Error:", error);
        return NextResponse.json({ error: "Service unavailable" }, { status: 500 });
    }
}