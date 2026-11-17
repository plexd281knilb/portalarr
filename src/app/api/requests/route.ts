import { NextResponse } from "next/server";
import { getBookRequests } from "@/app/actions";
import { getSession } from "@/app/auth-actions";
import prisma from "@/lib/prisma";

export async function GET() {
    try {
        const session = await getSession();
        const userId = String(session?.userId || session?.id || "");
        if (!userId) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, status: true }
        });
        if (!dbUser) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        const role = String(dbUser.role || "").toUpperCase();
        const status = String(dbUser.status || "").toUpperCase();
        if (role !== "ADMIN" && (status === "PENDING" || status === "REJECTED" || status === "SUSPENDED" || status === "EXPIRED")) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const reqs = await getBookRequests();
        return NextResponse.json({ requests: reqs || [] });
    } catch (e: any) {
        const msg = e?.message || "Failed to fetch requests";
        if (msg.toLowerCase().includes("unauthorized")) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        console.error("GET /api/requests error:", e);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
