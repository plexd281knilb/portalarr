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

        if (!fs.existsSync(book.filePath)) {
            return new NextResponse("File Not Found on Disk", { status: 404 });
        }

        const stat = await fs.promises.stat(book.filePath);
        let targetPath = book.filePath;

        if (stat.isDirectory()) {
            const validExts = [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus", ".epub", ".pdf", ".mobi", ".azw3", ".cbz", ".cbr"];
            const reqFile = req.nextUrl.searchParams.get("file");

            if (reqFile) {
                const contained = resolveContainedPath(book.filePath, reqFile);
                if (!contained) {
                    return new NextResponse("Invalid file path", { status: 403 });
                }
                targetPath = contained;
            } else {
                const entries = await fs.promises.readdir(book.filePath);
                const files = entries.filter(f => validExts.includes(path.extname(f).toLowerCase()));
                if (files.length > 0) {
                    files.sort();
                    targetPath = path.join(book.filePath, files[0]);
                }
            }
        }

        if (!fs.existsSync(targetPath)) {
            return new NextResponse("File Not Found on Disk", { status: 404 });
        }
        const fileStat = await fs.promises.stat(targetPath);
        if (fileStat.isDirectory()) {
            return new NextResponse("File Not Found on Disk", { status: 404 });
        }

        const ext = path.extname(targetPath).toLowerCase();
        let contentType = "application/octet-stream";
        if (ext === ".pdf") contentType = "application/pdf";
        else if (ext === ".epub") contentType = "application/epub+zip";
        else if (ext === ".mobi") contentType = "application/x-mobipocket-ebook";
        else if (ext === ".cbz") contentType = "application/x-cbz";
        else if (ext === ".cbr") contentType = "application/x-cbr";
        else if (ext === ".mp3") contentType = "audio/mpeg";
        else if (ext === ".m4b" || ext === ".m4a") contentType = "audio/mp4";
        else if (ext === ".flac") contentType = "audio/flac";

        const fileName = path.basename(targetPath);
        const fileStream = fs.createReadStream(targetPath);

        const searchParams = req.nextUrl.searchParams;
        const isDownload = searchParams.get("download") === "1" || searchParams.get("download") === "true";
        const disposition = isDownload ? "attachment" : "inline";

        return new NextResponse(fileStream as any, {
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(fileStat.size),
                "Content-Disposition": `${disposition}; filename="${encodeURIComponent(fileName)}"`
            }
        });
    } catch (e) {
        console.error("Failed to stream book:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
