import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { createExtractorFromData } from "node-unrar-js";
import { getJwtSecret } from "@/lib/auth-secret";

async function checkLibraryAccess(allowedUsersStr: string, restrictedUsersStr: string = "", username: string = "", email: string = "", role: string = "") {
    if ((role || "").toUpperCase() === "ADMIN") return true;

    const safeUsername = (username || "").toLowerCase();
    const safeEmail = (email || "").toLowerCase();

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

function getImageContentType(filename: string): string {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".png") return "image/png";
    if (ext === ".webp") return "image/webp";
    if (ext === ".gif") return "image/gif";
    if (ext === ".bmp") return "image/bmp";
    if (ext === ".avif") return "image/avif";
    return "image/jpeg";
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

        let targetPath = book.filePath;
        const stat = fs.statSync(targetPath);
        if (stat.isDirectory()) {
            const files = fs.readdirSync(targetPath).filter(f => /\.(?:cbz|cbr|zip|rar)$/i.test(f));
            if (files.length > 0) {
                targetPath = path.join(targetPath, files[0]);
            } else {
                return new NextResponse("No comic file found in directory", { status: 404 });
            }
        }

        const ext = path.extname(targetPath).toLowerCase();
        const isZip = ext === ".cbz" || ext === ".zip";
        const isRar = ext === ".cbr" || ext === ".rar";

        if (!isZip && !isRar) {
            return NextResponse.json({
                success: false,
                error: `Unsupported comic format: ${ext}`
            }, { status: 400 });
        }

        const searchParams = req.nextUrl.searchParams;
        const pageParam = searchParams.get("page");

        // Handle CBZ / ZIP
        if (isZip) {
            const fileData = fs.readFileSync(targetPath);
            const zip = await JSZip.loadAsync(fileData);
            const imageEntries = Object.keys(zip.files)
                .filter(name => !zip.files[name].dir && /\.(?:jpe?g|png|webp|gif|bmp|avif)$/i.test(name))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

            if (imageEntries.length === 0) {
                return NextResponse.json({ success: false, error: "No comic pages/images found in archive" }, { status: 404 });
            }

            if (!pageParam) {
                return NextResponse.json({
                    success: true,
                    format: "cbz",
                    title: book.title,
                    totalPages: imageEntries.length,
                    pages: imageEntries.map((name, idx) => ({
                        pageNumber: idx + 1,
                        name: path.basename(name)
                    }))
                });
            }

            const pageNum = parseInt(pageParam, 10);
            if (isNaN(pageNum) || pageNum < 1 || pageNum > imageEntries.length) {
                return new NextResponse("Invalid Page Number", { status: 400 });
            }

            const targetEntry = imageEntries[pageNum - 1];
            const imgBuffer = await zip.file(targetEntry)!.async("nodebuffer");
            const contentType = getImageContentType(targetEntry);

            return new NextResponse(imgBuffer as any, {
                headers: {
                    "Content-Type": contentType,
                    "Content-Length": String(imgBuffer.length),
                    "Cache-Control": "public, max-age=86400, immutable"
                }
            });
        }

        // Handle CBR / RAR
        if (isRar) {
            const fileData = fs.readFileSync(targetPath);
            const extractor = await createExtractorFromData({
                data: fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength)
            });
            const list = extractor.getFileList();
            const fileHeaders = [...list.fileHeaders];
            const imageEntries = fileHeaders
                .map(h => h.name)
                .filter(name => /\.(?:jpe?g|png|webp|gif|bmp|avif)$/i.test(name))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

            if (imageEntries.length === 0) {
                return NextResponse.json({ success: false, error: "No comic pages/images found in RAR archive" }, { status: 404 });
            }

            if (!pageParam) {
                return NextResponse.json({
                    success: true,
                    format: "cbr",
                    title: book.title,
                    totalPages: imageEntries.length,
                    pages: imageEntries.map((name, idx) => ({
                        pageNumber: idx + 1,
                        name: path.basename(name)
                    }))
                });
            }

            const pageNum = parseInt(pageParam, 10);
            if (isNaN(pageNum) || pageNum < 1 || pageNum > imageEntries.length) {
                return new NextResponse("Invalid Page Number", { status: 400 });
            }

            const targetEntry = imageEntries[pageNum - 1];
            const extracted = extractor.extract({ files: [targetEntry] });
            const file = [...extracted.files][0];

            if (!file || !file.extraction) {
                return new NextResponse("Failed to extract page from archive", { status: 500 });
            }

            const imgBuffer = Buffer.from(file.extraction);
            const contentType = getImageContentType(targetEntry);

            return new NextResponse(imgBuffer as any, {
                headers: {
                    "Content-Type": contentType,
                    "Content-Length": String(imgBuffer.length),
                    "Cache-Control": "public, max-age=86400, immutable"
                }
            });
        }

        return NextResponse.json({ success: false, error: "Unsupported format" }, { status: 400 });
    } catch (e: any) {
        console.error("Comic processing error:", e);
        return NextResponse.json({ success: false, error: e.message || "Failed to process comic file" }, { status: 500 });
    }
}
