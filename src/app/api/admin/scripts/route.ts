import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { 
    getAllScripts, 
    saveScript, 
    deleteScript, 
    getScriptRuns 
} from "@/lib/scripts/script-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
        }

        const scripts = getAllScripts();
        const runs = getScriptRuns(undefined, 30);

        return NextResponse.json({
            scripts,
            recentRuns: runs,
            timestamp: new Date().toISOString()
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to fetch scripts" }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
        }

        const body = await req.json().catch(() => ({}));
        if (!body.name) {
            return NextResponse.json({ error: "Script name is required." }, { status: 400 });
        }

        const saved = saveScript(body);
        return NextResponse.json({ success: true, script: saved });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to save script" }, { status: 500 });
    }
}

export async function DELETE(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);
        const id = searchParams.get("id");
        if (!id) {
            return NextResponse.json({ error: "id parameter is required." }, { status: 400 });
        }

        const success = deleteScript(id);
        return NextResponse.json({ success });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to delete script" }, { status: 500 });
    }
}
