import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { getSeerrSettingsAction } from "@/app/seerr-actions";
import { getDiscordBotSettingsAction } from "@/app/discord-actions";
import { getAdminMediaServersAction } from "@/app/media-server-actions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (String(user.role || "").toUpperCase() !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const panel = req.nextUrl.searchParams.get("panel") || "";
        if (panel === "seerr") {
            const res = await getSeerrSettingsAction();
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store, max-age=0" } });
        }
        if (panel === "discord") {
            const res = await getDiscordBotSettingsAction();
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store, max-age=0" } });
        }
        if (panel === "media-servers") {
            const res = await getAdminMediaServersAction();
            return NextResponse.json(res, { headers: { "Cache-Control": "no-store, max-age=0" } });
        }

        return NextResponse.json({ error: "Invalid panel query parameter" }, { status: 400 });
    } catch (e: any) {
        console.error("GET /api/admin/panels error:", e);
        return NextResponse.json(
            { success: false, error: e?.message || "Failed to load panel settings" },
            { status: 500 }
        );
    }
}
