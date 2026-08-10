import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

const JWT_SECRET_RAW = process.env.JWT_SECRET || "";
const SECRET_KEY = new TextEncoder().encode(JWT_SECRET_RAW || "build-time-fallback-key");

async function checkLibraryAccess(allowedUsersStr: string, restrictedUsersStr: string = "", username: string = "", email: string = "", role: string = "") {
    if (role === "ADMIN") return true;

    const safeUsername = (username || "").toLowerCase();
    const safeEmail = (email || "").toLowerCase();

    // Explicit denial check: If user is listed in restrictedUsers, block access immediately
    if (restrictedUsersStr && restrictedUsersStr.trim() !== "") {
        const restricted = restrictedUsersStr.split(",").map(u => u.trim().toLowerCase());
        if ((safeUsername && restricted.includes(safeUsername)) || (safeEmail && restricted.includes(safeEmail))) {
            return false;
        }
    }

    if (!allowedUsersStr || allowedUsersStr.trim() === "" || allowedUsersStr.trim() === "*") return true;
    const allowed = allowedUsersStr.split(",").map(u => u.trim().toLowerCase());
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
        const decoded = await jwtVerify(session, SECRET_KEY);
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
