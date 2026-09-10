import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(req: NextRequest) {
    try {
        const badges = await prisma.customBadge.findMany({
            orderBy: { createdAt: "desc" }
        });
        return NextResponse.json({ success: true, badges });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
