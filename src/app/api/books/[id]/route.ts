import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

const JWT_SECRET_RAW = process.env.JWT_SECRET || "";
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET_RAW || "build-time-fallback-key");

async function checkLibraryAccess(allowedUsersStr: string, username: string, role: string) {
    if (role === "ADMIN") return true;
    if (!allowedUsersStr) return false;
    const allowed = allowedUsersStr.split(",").map(u => u.trim().toLowerCase());
    if (allowed.includes("*") || allowed.includes(username.toLowerCase())) {
        return true;
    }
    return false;
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
        const decoded = await jwtVerify(session, SECRET_KEY);
        payload = decoded.payload;
    } catch (e) {
        return new NextResponse("Unauthorized", { status: 401 });
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
            payload.username as string,
            payload.role as string
        );

        if (!hasAccess) {
            return new NextResponse("Access Denied", { status: 403 });
        }

        if (!fs.existsSync(book.filePath)) {
            return new NextResponse("File Not Found on Disk", { status: 404 });
        }

        const fileBuffer = fs.readFileSync(book.filePath);
        let contentType = "application/octet-stream";
        if (book.fileType === "pdf") contentType = "application/pdf";
        else if (book.fileType === "epub") contentType = "application/epub+zip";
        else if (book.fileType === "mobi") contentType = "application/x-mobipocket-ebook";
        else if (book.fileType === "cbz") contentType = "application/x-cbz";

        return new NextResponse(fileBuffer, {
            headers: {
                "Content-Type": contentType,
                "Content-Disposition": `inline; filename="${encodeURIComponent(book.title)}.${book.fileType}"`
            }
        });
    } catch (e) {
        console.error("Failed to stream book:", e);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}
