import { NextResponse } from "next/server";
import { getLibraries } from "@/app/actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const libs = await getLibraries();
        return NextResponse.json({ libraries: libs || [] });
    } catch (e: any) {
        console.error("GET /api/libraries error:", e);
        return NextResponse.json({ error: e.message || "Failed to fetch libraries" }, { status: 500 });
    }
}
