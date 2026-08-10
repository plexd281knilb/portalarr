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
    if (!session) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    let payload;
    try {
        const decoded = await jwtVerify(session, getJwtSecret());
        payload = decoded.payload;
    } catch (e) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const userStatus = (payload.status as string) || "APPROVED";
    if (userStatus === "PENDING" || userStatus === "REJECTED") {
        return new NextResponse("Account Pending Approval", { status: 403 });
    }

    try {
        const book = await prisma.book.findUnique({
            where: { id },
            include: { library: true }
        });

        if (!book) {
            return new NextResponse("Book Not Found", { status: 404 });
        }

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

        if (!fs.existsSync(book.filePath)) {
            return new NextResponse("File Not Found on Disk", { status: 404 });
        }

        const stat = fs.statSync(book.filePath);
        let targetPath = book.filePath;
        
        if (stat.isDirectory()) {
            const validExts = [".m4b", ".mp3", ".m4a", ".flac", ".aac", ".ogg", ".opus", ".epub", ".pdf", ".mobi", ".azw3"];
            const searchParams = req.nextUrl.searchParams;
            const reqFile = searchParams.get("file");

            if (reqFile) {
                targetPath = path.join(book.filePath, reqFile);
            } else {
                const files = fs.readdirSync(book.filePath).filter(f => validExts.includes(path.extname(f).toLowerCase()));
                if (files.length > 0) {
                    files.sort();
                    targetPath = path.join(book.filePath, files[0]);
                }
            }
        }

        if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
            return new NextResponse("File Not Found on Disk", { status: 404 });
        }

        const ext = path.extname(targetPath).toLowerCase();
        let contentType = "application/octet-stream";
        if (ext === ".pdf") contentType = "application/pdf";
        else if (ext === ".epub") contentType = "application/epub+zip";
        else if (ext === ".mobi") contentType = "application/x-mobipocket-ebook";
        else if (ext === ".cbz") contentType = "application/x-cbz";
        else if (ext === ".mp3") contentType = "audio/mpeg";
        else if (ext === ".m4b" || ext === ".m4a") contentType = "audio/mp4";
        else if (ext === ".flac") contentType = "audio/flac";

        const fileName = path.basename(targetPath);
        const fileStream = fs.createReadStream(targetPath);
        const fileStat = fs.statSync(targetPath);

        return new NextResponse(fileStream as any, {
            headers: {
                "Content-Type": contentType,
                "Content-Length": String(fileStat.size),
                "Content-Disposition": `attachment; filename="${encodeURIComponent(fileName)}"`
            }
        });
    } catch (e) {
        console.error("Failed to stream book:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
