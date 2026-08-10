import { NextResponse } from "next/server";
import { getBookRequests } from "@/app/actions";

export async function GET() {
    try {
        const reqs = await getBookRequests();
        return NextResponse.json({ requests: reqs || [] });
    } catch (e: any) {
        console.error("GET /api/requests error:", e);
        return NextResponse.json({ error: e.message || "Failed to fetch requests" }, { status: 500 });
    }
}
