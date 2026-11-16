import { NextResponse } from "next/server";
import { getAppUsersResult } from "@/app/actions";

export const dynamic = "force-dynamic";

export async function GET() {
    try {
        const res = await getAppUsersResult();
        if (!res.success) {
            const status = res.error === "Unauthorized" ? 401 : 500;
            return NextResponse.json({ error: res.error || "Failed to fetch users" }, { status });
        }
        return NextResponse.json({ users: res.users || [] });
    } catch (e: any) {
        console.error("GET /api/users error:", e);
        return NextResponse.json({ error: e?.message || "Failed to fetch users" }, { status: 500 });
    }
}
