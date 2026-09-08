import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { getJwtSecret } from "@/lib/auth-secret";

async function checkLibraryAccess(allowedUsersStr: string, restrictedUsersStr: string = "", username: string = "", email: string = "", role: string = "") {
    if ((role || "").toUpperCase() === "ADMIN") return true;

    const safeUsername = (username || "").toLowerCase();
    const safeEmail = (email || "").toLowerCase();

    // Explicit denial check: If user is listed in restrictedUsers, block access immediately
    if (restrictedUsersStr && restrictedUsersStr.trim() !== "") {
        const restricted = restrictedUsersStr.split(",").map(u => u.trim().toLowerCase()).filter(Boolean);
        if ((safeUsername && restricted.includes(safeUsername)) || (safeEmail && restricted.includes(safeEmail))) {
            return false;
        }
    }

    if (!allowedUsersStr || allowedUsersStr.trim() === "" || allowedUsersStr.trim() === "*") return true;
    const allowed = allowedUsersStr.split(",").map(u => u.trim().toLowerCase()).filter(Boolean);
    return allowed.includes("*") || (safeUsername && allowed.includes(safeUsername)) || (safeEmail && allowed.includes(safeEmail));
}

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

        const userStatus = (payload.status as string) || "APPROVED";
        if (userStatus === "PENDING" || userStatus === "REJECTED") {
            return new NextResponse("Account Pending Approval", { status: 403 });
        }

        const book = await prisma.book.findUnique({
            where: { id },
            include: { library: true }
        });

        if (!book) return new NextResponse("Book Not Found", { status: 404 });

        const hasAccess = await checkLibraryAccess(
            book.library.allowedUsers,
            book.library.restrictedUsers || "",
            (payload.username || "") as string,
            (payload.email || "") as string,
            (payload.role || "") as string
        );

        if (!hasAccess) {
            return new NextResponse("Access Denied", { status: 403 });
        }

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
