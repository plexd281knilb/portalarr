import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/app/auth-actions";

export async function GET(req: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== "ADMIN") {
            return NextResponse.json({ error: "Forbidden: Admin permissions required." }, { status: 403 });
        }
        const badges = await prisma.customBadge.findMany({
            orderBy: { createdAt: "desc" }
        });
        return NextResponse.json({ success: true, badges });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
