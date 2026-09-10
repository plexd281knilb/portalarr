import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import { getCurrentUser } from "@/app/auth-actions";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const badge = await prisma.customBadge.findUnique({
            where: { id }
        });

        if (!badge || !fs.existsSync(badge.filePath)) {
            return new NextResponse("Badge not found", { status: 404 });
        }

        const fileBuffer = fs.readFileSync(badge.filePath);
        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": badge.mimeType || "image/png",
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
            }
        });
    } catch (e: any) {
        return new NextResponse("Error serving badge", { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const badge = await prisma.customBadge.findUnique({ where: { id } });

        if (badge) {
            try {
                if (fs.existsSync(badge.filePath)) {
                    fs.unlinkSync(badge.filePath);
                }
            } catch (err) {}
            await prisma.customBadge.delete({ where: { id } });
        }

        return NextResponse.json({ success: true, message: "Custom badge deleted." });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
