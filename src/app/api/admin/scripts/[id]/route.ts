import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { 
    getScriptById, 
    getScriptRuns, 
    getScriptRunLog 
} from "@/lib/scripts/script-manager";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Unauthorized. Admin role required." }, { status: 403 });
        }

        const { id } = await context.params;
        const { searchParams } = new URL(req.url);
        const logRunId = searchParams.get("runId");

        if (logRunId) {
            const logContent = getScriptRunLog(logRunId);
            return NextResponse.json({ runId: logRunId, content: logContent || "" });
        }

        const script = getScriptById(id);
        if (!script) {
            return NextResponse.json({ error: `Script ${id} not found.` }, { status: 404 });
        }

        const runs = getScriptRuns(id, 20);

        return NextResponse.json({
            script,
            runs
        });
    } catch (e: any) {
        return NextResponse.json({ error: e.message || "Failed to fetch script details" }, { status: 500 });
    }
}
