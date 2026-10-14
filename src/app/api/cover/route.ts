import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
function generateFallbackBookSvg(title: string, author: string, isAudiobook: boolean): string {
    const cleanTitle = (title || "Book").slice(0, 40);
    const cleanAuthor = (author || "Unknown Author").slice(0, 30);
    return `<svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="bookBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="${isAudiobook ? '#78350f' : '#1e1b4b'}" />
                <stop offset="50%" stop-color="${isAudiobook ? '#451a03' : '#0f172a'}" />
                <stop offset="100%" stop-color="#020617" />
            </linearGradient>
            <linearGradient id="spine" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="rgba(255,255,255,0.15)" />
                <stop offset="100%" stop-color="rgba(0,0,0,0.4)" />
            </linearGradient>
        </defs>
        <rect width="600" height="900" fill="url(#bookBg)" />
        <rect x="0" y="0" width="30" height="900" fill="url(#spine)" />
        <rect x="50" y="50" width="500" height="800" rx="16" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="2" />
        <circle cx="300" cy="380" r="80" fill="rgba(255,255,255,0.05)" />
        <text x="300" y="400" font-size="70" text-anchor="middle">${isAudiobook ? "🎧" : "📖"}</text>
        <text x="300" y="580" font-family="Georgia, serif" font-weight="bold" font-size="28" fill="#f8fafc" text-anchor="middle">${cleanTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</text>
        <text x="300" y="640" font-family="system-ui, sans-serif" font-weight="600" font-size="18" fill="#94a3b8" text-anchor="middle">${cleanAuthor.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</text>
        <text x="300" y="800" font-family="system-ui, sans-serif" font-weight="800" font-size="12" fill="${isAudiobook ? '#f59e0b' : '#818cf8'}" text-anchor="middle" letter-spacing="3">${isAudiobook ? "PORTALARR AUDIOBOOK" : "PORTALARR LIBRARY"}</text>
    </svg>`;
}

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

        // 1. Check Book table
        const book = await prisma.book.findUnique({
            where: { id }
        });

        if (book) {
            if (book.filePath) {
                let dirPath = "";
                try {
                    const stat = fs.statSync(book.filePath);
                    dirPath = stat.isDirectory() ? book.filePath : path.dirname(book.filePath);
                } catch (e) {}

                if (dirPath) {
                    let coverPath = path.join(dirPath, "cover.jpg");
                    if (!fs.existsSync(coverPath)) {
                        coverPath = path.join(dirPath, "cover.png");
                    }

                    if (fs.existsSync(coverPath)) {
                        const fileBuffer = fs.readFileSync(coverPath);
                        const ext = path.extname(coverPath).toLowerCase();
                        const contentType = ext === ".png" ? "image/png" : "image/jpeg";

                        return new NextResponse(fileBuffer, {
                            headers: {
                                "Content-Type": contentType,
                                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
                            }
                        });
                    }
                }
            }

            // Fallback to book.coverUrl if remote URL
            if (book.coverUrl && book.coverUrl.startsWith("http")) {
                const cleanRemoteUrl = book.coverUrl.replace(/[\?&]lib=[a-zA-Z0-9_\-]+/, "");
                try {
                    const imgRes = await fetch(cleanRemoteUrl);
                    if (imgRes.ok) {
                        const imgBuffer = await imgRes.arrayBuffer();
                        const cType = imgRes.headers.get("content-type") || "image/jpeg";
                        return new NextResponse(Buffer.from(imgBuffer), {
                            headers: {
                                "Content-Type": cType,
                                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
                            }
                        });
                    }
                } catch (e) {
                    return NextResponse.redirect(cleanRemoteUrl);
                }
            }
            // Dynamic fetch fallback if coverUrl is missing or invalid
            try {
                const { fetchBookCover } = await import("@/app/actions");
                const dynamicCover = await fetchBookCover(book.title, book.author || "Unknown Author", book.mediaType || "ebook");
                if (dynamicCover && dynamicCover !== "local" && dynamicCover.startsWith("http")) {
                    const imgRes = await fetch(dynamicCover);
                    if (imgRes.ok) {
                        const imgBuffer = await imgRes.arrayBuffer();
                        const cType = imgRes.headers.get("content-type") || "image/jpeg";
                        prisma.book.update({
                            where: { id: book.id },
                            data: { coverUrl: dynamicCover }
                        }).catch(() => {});
                        return new NextResponse(Buffer.from(imgBuffer), {
                            headers: {
                                "Content-Type": cType,
                                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
                            }
                        });
                    }
                }
            } catch (e) {}

            const isAudiobook = book.mediaType === "audiobook";
            const svg = generateFallbackBookSvg(book.title, book.author || "", isAudiobook);
            return new NextResponse(svg, {
                headers: {
                    "Content-Type": "image/svg+xml",
                    "Cache-Control": "public, max-age=86400"
                }
            });
        }

        // 2. Check BookRequest table
        const bookReq = await prisma.bookRequest.findUnique({
            where: { id }
        });

        if (bookReq && bookReq.coverUrl) {
            const cleanCoverUrl = bookReq.coverUrl.replace(/[\?&]lib=[a-zA-Z0-9_\-]+/, "");
            if (cleanCoverUrl.startsWith("http")) {
                try {
                    const imgRes = await fetch(cleanCoverUrl);
                    if (imgRes.ok) {
                        const imgBuffer = await imgRes.arrayBuffer();
                        const cType = imgRes.headers.get("content-type") || "image/jpeg";
                        return new NextResponse(Buffer.from(imgBuffer), {
                            headers: {
                                "Content-Type": cType,
                                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
                            }
                        });
                    }
                } catch (e) {
                    return NextResponse.redirect(cleanCoverUrl);
                }
            }
        }

        if (bookReq) {
            const isAudiobook = bookReq.mediaType === "audiobook";
            const svg = generateFallbackBookSvg(bookReq.title, bookReq.author || "", isAudiobook);
            return new NextResponse(svg, {
                headers: {
                    "Content-Type": "image/svg+xml",
                    "Cache-Control": "public, max-age=86400"
                }
            });
        }

        const fallbackSvg = generateFallbackBookSvg("Book", "Portalarr", false);
        return new NextResponse(fallbackSvg, {
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=86400"
            }
        });
    } catch (e) {
        console.error("[COVER-API] Error:", e);
        const fallbackSvg = generateFallbackBookSvg("Book", "Portalarr", false);
        return new NextResponse(fallbackSvg, {
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=3600"
            }
        });
    }
}
