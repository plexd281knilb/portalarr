import { NextResponse } from "next/server";
import { getLibraries } from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const libs = await getLibraries();
        return NextResponse.json({ libraries: libs || [] });
    } catch (e: any) {
        const msg = e?.message || "Failed to fetch libraries";
        const lower = msg.toLowerCase();
        const status = lower.includes("forbidden") ? 403 : lower.includes("unauthorized") ? 401 : 500;
        if (status === 500) console.error("GET /api/libraries error:", e);
        return NextResponse.json({ error: msg }, { status });
    }
}
