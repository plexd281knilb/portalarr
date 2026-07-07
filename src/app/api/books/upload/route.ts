import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

const JWT_SECRET_RAW = process.env.JWT_SECRET || "";
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET_RAW || "build-time-fallback-key");

export async function POST(req: NextRequest) {
    const session = req.cookies.get("session")?.value;
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload;
    try {
        const decoded = await jwtVerify(session, SECRET_KEY);
        payload = decoded.payload;
    } catch (e) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (payload.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const title = formData.get("title") as string | null;
        const author = formData.get("author") as string | null;
        const libraryId = formData.get("libraryId") as string | null;

        if (!file || !title || !libraryId) {
            return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
        }

        const library = await prisma.library.findUnique({ where: { id: libraryId } });
        if (!library) {
            return NextResponse.json({ error: "Library not found" }, { status: 404 });
        }

              let dirPath = library.path;
        if (!dirPath || !fs.existsSync(dirPath)) {
            dirPath = path.join(process.cwd(), "data", "books");
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
        }

        const fileExtension = path.extname(file.name) || ".pdf";
        const sanitizedTitle = title.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase();
        const fileName = `${libraryId}_${sanitizedTitle}_${Date.now()}${fileExtension}`;
        const filePath = path.join(dirPath, fileName);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);
        fs.writeFileSync(filePath, buffer);

        let finalPath = filePath;
        let finalSize = file.size;
        if (fileExtension.toLowerCase() === ".epub") {
            try {
                const { processEpubForKindle } = require("@/app/actions");
                finalPath = await processEpubForKindle(filePath);
                const stats = fs.statSync(finalPath);
                finalSize = stats.size;
            } catch (err: any) {
                console.error("Kindle epub processing failed:", err);
                return NextResponse.json({ error: `Epub validation failed: ${err.message}` }, { status: 400 });
            }
        }

        const book = await prisma.book.create({
            data: {
                title,
                author: author || "Unknown Author",
                filePath: finalPath,
                fileSize: finalSize,
                fileType: fileExtension.replace(".", "").toLowerCase(),
                libraryId
            }
        });

        return NextResponse.json({ success: true, book });
    } catch (e: any) {
        console.error("Upload failed:", e);
        return NextResponse.json({ error: e.message || "Internal Server Error" }, { status: 500 });
    }
}
