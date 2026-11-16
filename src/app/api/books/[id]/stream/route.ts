import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { resolveContainedPath, verifyBookFileRequest } from "@/lib/book-route-auth";

export async function GET(
    req: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    const { id } = await context.params;

    try {
        const auth = await verifyBookFileRequest(req, id);
        if ("error" in auth) {
            return auth.error;
        }
        const { book } = auth;

        const searchParams = req.nextUrl.searchParams;
        const relativePath = searchParams.get("file");

        let targetFilePath = book.filePath;
        if (relativePath) {
            const bookStat = await fs.promises.stat(book.filePath);
            let baseDir = bookStat.isDirectory() ? book.filePath : path.dirname(book.filePath);
            const parentName = path.basename(baseDir);
            if (/^(?:Disc|CD|Part|Vol|Volume|Disk|Track)\s*\d+$/i.test(parentName)) {
                baseDir = path.dirname(baseDir);
            }
            const contained = resolveContainedPath(baseDir, relativePath);
            if (!contained) {
                return new NextResponse("Invalid chapter path", { status: 403 });
            }
            targetFilePath = contained;
        }

        if (!fs.existsSync(targetFilePath)) {
            return new NextResponse("Chapter File Not Found", { status: 404 });
        }

        const stat = await fs.promises.stat(targetFilePath);
        if (stat.isDirectory()) {
            return new NextResponse("Chapter File Not Found", { status: 404 });
        }
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
            let start = parseInt(parts[0], 10);
            let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

            if (isNaN(start)) {
                start = Math.max(0, fileSize - (isNaN(end) ? 0 : end));
                end = fileSize - 1;
            }
            if (isNaN(end) || end >= fileSize) {
                end = fileSize - 1;
            }
            if (start < 0 || start > end) {
                start = 0;
            }

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
