import { NextResponse } from "next/server";
import { getLibraries } from "@/app/actions";
import prisma from "@/lib/prisma";

export async function GET() {
    try {
        let libs = await getLibraries().catch(() => []);
        if (!libs || libs.length === 0) {
            try {
                const rawLibs: any[] = await prisma.$queryRawUnsafe(`SELECT * FROM "Library";`);
                if (rawLibs && rawLibs.length > 0) {
                    libs = rawLibs.map(l => ({
                        id: l.id,
                        name: l.name,
                        description: l.description || "",
                        path: l.path || "",
                        allowedUsers: l.allowedUsers || "*",
                        restrictedUsers: l.restrictedUsers || "",
                        downloadCategory: l.downloadCategory || "books",
                        mediaType: l.mediaType || "ebook"
                    }));
                }
            } catch (rawErr) {}
        }
        return NextResponse.json({ libraries: libs || [] });
    } catch (e: any) {
        console.error("GET /api/libraries error:", e);
        return NextResponse.json({ error: e.message || "Failed to fetch libraries" }, { status: 500 });
    }
}
