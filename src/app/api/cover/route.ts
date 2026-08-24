import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
    try {
        const session = req.cookies.get("session")?.value;
        if (!session) return new NextResponse("Unauthorized", { status: 401 });
        
        try {
            await jwtVerify(session, getJwtSecret());
        } catch (e) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const searchParams = req.nextUrl.searchParams;
        const id = searchParams.get("id");

        if (!id) return new NextResponse("Missing id", { status: 400 });

        const book = await prisma.book.findUnique({
            where: { id }
        });

        if (!book || !book.filePath) return new NextResponse("Book not found", { status: 404 });

        let dirPath = "";
        try {
            const stat = fs.statSync(book.filePath);
            dirPath = stat.isDirectory() ? book.filePath : path.dirname(book.filePath);
        } catch (e) {
            return new NextResponse("Book path invalid", { status: 404 });
        }

        let coverPath = path.join(dirPath, "cover.jpg");
        if (!fs.existsSync(coverPath)) {
            coverPath = path.join(dirPath, "cover.png");
        }

        if (!fs.existsSync(coverPath)) {
            return new NextResponse("Cover not found", { status: 404 });
        }

        const fileBuffer = fs.readFileSync(coverPath);
        const ext = path.extname(coverPath).toLowerCase();
        const contentType = ext === ".png" ? "image/png" : "image/jpeg";

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
            }
        });
    } catch (e) {
        console.error("[COVER-API] Error:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
