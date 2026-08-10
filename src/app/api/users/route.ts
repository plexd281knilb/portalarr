import { NextResponse } from "next/server";
import { getAppUsers } from "@/app/actions";

export async function GET() {
    try {
        const users = await getAppUsers();
        return NextResponse.json({ users: users || [] });
    } catch (e: any) {
        console.error("GET /api/users error:", e);
        return NextResponse.json({ error: e.message || "Failed to fetch users" }, { status: 500 });
    }
}
