import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { getJwtSecret } from "@/lib/auth-secret";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;
    const session = req.cookies.get("session")?.value;
    if (!session) return new NextResponse("Unauthorized", { status: 401 });

    try {
        const decoded = await jwtVerify(session, getJwtSecret());
        const payload = decoded.payload;

        const book = await prisma.book.findUnique({
            where: { id },
            include: { library: true }
        });

        if (!book) return new NextResponse("Book Not Found", { status: 404 });

        const searchParams = req.nextUrl.searchParams;
        const relativePath = searchParams.get("file");

        let targetFilePath = book.filePath;
        if (relativePath) {
            let baseDir = fs.statSync(book.filePath).isDirectory() ? book.filePath : path.dirname(book.filePath);
            const parentName = path.basename(baseDir);
            if (/^(?:Disc|CD|Part|Vol|Volume|Disk|Track)\s*\d+$/i.test(parentName)) {
                baseDir = path.dirname(baseDir);
            }
            targetFilePath = path.join(baseDir, relativePath);
        }

        if (!fs.existsSync(targetFilePath)) {
            return new NextResponse("Chapter File Not Found", { status: 404 });
        }

        const stat = fs.statSync(targetFilePath);
        const fileSize = stat.size;
        const range = req.headers.get("range");

        const ext = path.extname(targetFilePath).toLowerCase();
        let contentType = "audio/mpeg";
        if (ext === ".m4b" || ext === ".m4a") contentType = "audio/mp4";
        else if (ext === ".flac") contentType = "audio/flac";
        else if (ext === ".ogg") contentType = "audio/ogg";

        const isDownload = searchParams.get("download") === "1";
        const fileName = path.basename(targetFilePath);

        const headers: Record<string, string> = {
            "Content-Length": String(fileSize),
            "Content-Type": contentType,
            "Accept-Ranges": "bytes"
        };

        if (isDownload) {
            headers["Content-Disposition"] = `attachment; filename="${encodeURIComponent(fileName)}"`;
        }

        if (range && !isDownload) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const fileStream = fs.createReadStream(targetFilePath, { start, end });

            return new NextResponse(fileStream as any, {
                status: 206,
                headers: {
                    ...headers,
                    "Content-Range": `bytes ${start}-${end}/${fileSize}`,
                    "Content-Length": String(chunksize)
                }
            });
        }

        const fileStream = fs.createReadStream(targetFilePath);
        return new NextResponse(fileStream as any, { headers });
    } catch (e: any) {
        return new NextResponse(e.message || "Failed to stream chapter", { status: 500 });
    }
}
