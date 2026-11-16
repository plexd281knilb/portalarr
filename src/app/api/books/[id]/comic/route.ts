import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import JSZip from "jszip";
import { createExtractorFromData } from "node-unrar-js";
import { verifyBookFileRequest } from "@/lib/book-route-auth";

type CachedComicArchive =
    | { kind: "cbz"; zip: JSZip; imageEntries: string[]; expiresAt: number }
    | { kind: "cbr"; fileData: Buffer; imageEntries: string[]; expiresAt: number };

const COMIC_ARCHIVE_CACHE_MAX = 6;
const COMIC_ARCHIVE_TTL_MS = 2 * 60 * 1000;
const comicArchiveCache = new Map<string, CachedComicArchive>();
const comicInFlightLoads = new Map<string, Promise<CachedComicArchive>>();

function setBoundedComicCache(key: string, val: CachedComicArchive) {
    if (comicArchiveCache.has(key)) comicArchiveCache.delete(key);
    while (comicArchiveCache.size >= COMIC_ARCHIVE_CACHE_MAX) {
        const oldestKey = comicArchiveCache.keys().next().value;
        if (!oldestKey) break;
        comicArchiveCache.delete(oldestKey);
    }
    comicArchiveCache.set(key, val);
}

async function getParsedComicArchive(targetPath: string, isZip: boolean, mtimeMs: number, size: number): Promise<CachedComicArchive> {
    const cacheKey = `${targetPath}:${mtimeMs}:${size}`;
    const existing = comicArchiveCache.get(cacheKey);
    if (existing && existing.expiresAt > Date.now()) {
        return existing;
    }

    const pending = comicInFlightLoads.get(cacheKey);
    if (pending) return pending;

    const loader = (async (): Promise<CachedComicArchive> => {
        const fileData = await fs.promises.readFile(targetPath);
        if (isZip) {
            const zip = await JSZip.loadAsync(fileData);
            const imageEntries = Object.keys(zip.files)
                .filter(name => !zip.files[name].dir && /\.(?:jpe?g|png|webp|gif|bmp|avif)$/i.test(name))
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
            const entry: CachedComicArchive = { kind: "cbz", zip, imageEntries, expiresAt: Date.now() + COMIC_ARCHIVE_TTL_MS };
            setBoundedComicCache(cacheKey, entry);
            return entry;
        }

        const extractor = await createExtractorFromData({
            data: fileData.buffer.slice(fileData.byteOffset, fileData.byteOffset + fileData.byteLength)
        });
        const list = extractor.getFileList();
        const fileHeaders = [...list.fileHeaders];
        const imageEntries = fileHeaders
            .map(h => h.name)
            .filter(name => /\.(?:jpe?g|png|webp|gif|bmp|avif)$/i.test(name))
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
        const entry: CachedComicArchive = { kind: "cbr", fileData, imageEntries, expiresAt: Date.now() + COMIC_ARCHIVE_TTL_MS };
        setBoundedComicCache(cacheKey, entry);
        return entry;
    })().finally(() => {
        comicInFlightLoads.delete(cacheKey);
    });

    comicInFlightLoads.set(cacheKey, loader);
    return loader;
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

    try {
        const auth = await verifyBookFileRequest(req, id);
        if ("error" in auth) {
            return auth.error;
        }
        const { book } = auth;

        if (!fs.existsSync(book.filePath)) {
            return new NextResponse("File Not Found on Disk", { status: 404 });
        }

        let targetPath = book.filePath;
        let stat = await fs.promises.stat(targetPath);
        if (stat.isDirectory()) {
            const entries = await fs.promises.readdir(targetPath);
            const files = entries.filter(f => /\.(?:cbz|cbr|zip|rar)$/i.test(f));
            if (files.length > 0) {
                targetPath = path.join(targetPath, files[0]);
                stat = await fs.promises.stat(targetPath);
            } else {
                const rawImages = entries
                    .filter(f => /\.(?:jpe?g|png|webp|gif|bmp|avif)$/i.test(f))
                    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

                if (rawImages.length > 0) {
                    const pageParam = req.nextUrl.searchParams.get("page");

                    if (!pageParam) {
                        return NextResponse.json({
                            success: true,
                            format: "folder",
                            title: book.title,
                            totalPages: rawImages.length,
                            pages: rawImages.map((name, idx) => ({
                                pageNumber: idx + 1,
                                name: path.basename(name)
                            }))
                        });
                    }

                    const pageNum = parseInt(pageParam, 10);
                    if (isNaN(pageNum) || pageNum < 1 || pageNum > rawImages.length) {
                        return new NextResponse("Invalid Page Number", { status: 400 });
                    }

                    const targetImageName = rawImages[pageNum - 1];
                    const targetImagePath = path.join(targetPath, targetImageName);
                    const imgBuffer = await fs.promises.readFile(targetImagePath);
                    const contentType = getImageContentType(targetImageName);

                    return new NextResponse(imgBuffer as any, {
                        headers: {
                            "Content-Type": contentType,
                            "Content-Length": String(imgBuffer.length),
                            "Cache-Control": "public, max-age=86400, immutable"
                        }
                    });
                }
                return new NextResponse("No comic file or images found in directory", { status: 404 });
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

        const pageParam = req.nextUrl.searchParams.get("page");
        const parsed = await getParsedComicArchive(targetPath, isZip, stat.mtimeMs, stat.size);

        if (parsed.imageEntries.length === 0) {
            return NextResponse.json({
                success: false,
                error: isZip ? "No comic pages/images found in archive" : "No comic pages/images found in RAR archive"
            }, { status: 404 });
        }

        if (!pageParam) {
            return NextResponse.json({
                success: true,
                format: parsed.kind,
                title: book.title,
                totalPages: parsed.imageEntries.length,
                pages: parsed.imageEntries.map((name, idx) => ({
                    pageNumber: idx + 1,
                    name: path.basename(name)
                }))
            });
        }

        const pageNum = parseInt(pageParam, 10);
        if (isNaN(pageNum) || pageNum < 1 || pageNum > parsed.imageEntries.length) {
            return new NextResponse("Invalid Page Number", { status: 400 });
        }

        const targetEntry = parsed.imageEntries[pageNum - 1];
        let imgBuffer: Buffer;
        if (parsed.kind === "cbz") {
            imgBuffer = await parsed.zip.file(targetEntry)!.async("nodebuffer");
        } else {
            const extractor = await createExtractorFromData({
                data: Uint8Array.from(parsed.fileData).buffer
            });
            const extracted = extractor.extract({ files: [targetEntry] });
            const file = [...extracted.files][0];
            if (!file || !file.extraction) {
                return new NextResponse("Failed to extract page from archive", { status: 500 });
            }
            imgBuffer = Buffer.from(file.extraction);
        }

        return new NextResponse(imgBuffer as any, {
            headers: {
                "Content-Type": getImageContentType(targetEntry),
                "Content-Length": String(imgBuffer.length),
                "Cache-Control": "public, max-age=86400, immutable"
            }
        });
    } catch (e: any) {
        console.error("Comic processing error:", e);
        return NextResponse.json({ success: false, error: e.message || "Failed to process comic file" }, { status: 500 });
    }
}
