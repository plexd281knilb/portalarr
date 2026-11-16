import { NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { getPlexServersAndSectionsAction } from "@/app/curation-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (String(user.role || "").toUpperCase() !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const res = await getPlexServersAndSectionsAction();
        return NextResponse.json(res, {
            headers: {
                "Cache-Control": "no-store, max-age=0",
            },
        });
    } catch (e: any) {
        console.error("GET /api/curation/plex-sections error:", e);
        return NextResponse.json(
            { success: false, servers: [], error: e?.message || "Failed to fetch Plex server sections" },
            { status: 500 }
        );
    }
}
