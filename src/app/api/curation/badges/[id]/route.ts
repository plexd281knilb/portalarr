import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { getCurrentUser } from "@/app/auth-actions";
import { DEFAULT_BUILTIN_BADGE_DEFINITIONS } from "@/lib/curation/presets";
import { resolveContainedPath } from "@/lib/book-route-auth";
import { sanitizeSvgContent } from "@/lib/security";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const user = await getCurrentUser();
        if (!user || (user.role !== "ADMIN" && ["PENDING", "REJECTED", "SUSPENDED", "EXPIRED"].includes(String(user.status || "").toUpperCase()))) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const { id } = await params;
        const decodedId = decodeURIComponent(id || "").trim();
        if (!decodedId || decodedId.includes("..") || decodedId.includes("\0")) {
            return new NextResponse("Badge not found", { status: 404 });
        }

        // 1. Query database for CustomBadge record
        const badge = await prisma.customBadge.findFirst({
            where: {
                OR: [
                    { id: decodedId },
                    { name: decodedId }
                ]
            }
        });

        const targetFilePath = badge?.filePath || "";
        let mimeType = badge?.mimeType || "image/png";

        // 2. Resolve candidate file paths safely constrained within data/custom_badges and public/kometa_stock
        const badgesBase = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "custom_badges");
        const stockBase = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "kometa_stock");
        const candidatePaths: string[] = [];

        const pushIfContained = (base: string, rel: string) => {
            const p = resolveContainedPath(base, rel);
            if (p) candidatePaths.push(p);
        };

        if (targetFilePath) {
            pushIfContained(badgesBase, path.basename(targetFilePath));
            pushIfContained(stockBase, path.basename(targetFilePath));
            pushIfContained(path.join(/*turbopackIgnore: true*/ process.cwd(), "data"), targetFilePath);
            pushIfContained(path.join(/*turbopackIgnore: true*/ process.cwd(), "public"), targetFilePath);
        }

        // Only probe direct ID filenames if decodedId contains no path separators
        if (!decodedId.includes("/") && !decodedId.includes("\\")) {
            pushIfContained(badgesBase, `${decodedId}.png`);
            pushIfContained(badgesBase, `${decodedId}.svg`);
            pushIfContained(badgesBase, decodedId);
            pushIfContained(stockBase, `${decodedId}.png`);
            pushIfContained(stockBase, `${decodedId}.svg`);
            pushIfContained(stockBase, decodedId);
        }

        for (const cand of candidatePaths) {
            if (cand && fs.existsSync(cand)) {
                try {
                    const stat = fs.statSync(cand);
                    if (stat.isFile()) {
                        const ext = path.extname(cand).toLowerCase();
                        if (ext === ".svg") mimeType = "image/svg+xml; charset=utf-8";
                        else if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
                        else if (ext === ".webp") mimeType = "image/webp";
                        else if (ext === ".png") mimeType = "image/png";

                        const rawBuffer = fs.readFileSync(cand);
                        const isSvg = mimeType.includes("svg");
                        const outBuffer = isSvg
                            ? Buffer.from(sanitizeSvgContent(rawBuffer.toString("utf-8")), "utf-8")
                            : rawBuffer;
                        return new NextResponse(outBuffer, {
                            headers: {
                                "Content-Type": mimeType,
                                "Cache-Control": "private, max-age=3600",
                                "X-Content-Type-Options": "nosniff",
                                ...(isSvg ? { "Content-Security-Policy": "sandbox; default-src 'none'" } : {})
                            }
                        });
                    }
                } catch (readErr) {}
            }
        }

        // 3. Fallback to built-in badge definitions if no disk file exists
        const directBuiltin = DEFAULT_BUILTIN_BADGE_DEFINITIONS.find(b => 
            b.id === decodedId || 
            b.id.toLowerCase() === decodedId.toLowerCase() ||
            b.name.toLowerCase() === decodedId.toLowerCase() ||
            b.matchRule === decodedId
        );
        if (directBuiltin && directBuiltin.svgContent) {
            return new NextResponse(directBuiltin.svgContent, {
                headers: {
                    "Content-Type": "image/svg+xml; charset=utf-8",
                    "Content-Security-Policy": "sandbox; default-src 'none'",
                    "X-Content-Type-Options": "nosniff",
                    "Cache-Control": "private, max-age=3600"
                }
            });
        }

        // 4. Built-in badge fallback & auto-repair if DB record exists
        if (badge) {
            const fallbackBuiltin = DEFAULT_BUILTIN_BADGE_DEFINITIONS.find(b => 
                b.id === badge.id || 
                b.name.toLowerCase() === badge.name.toLowerCase() ||
                (badge.matchRule && b.matchRule === badge.matchRule)
            );
            if (fallbackBuiltin && fallbackBuiltin.svgContent) {
                try {
                    const badgeVaultDir = path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "custom_badges");
                    if (!fs.existsSync(badgeVaultDir)) fs.mkdirSync(badgeVaultDir, { recursive: true });
                    fs.writeFileSync(path.join(/*turbopackIgnore: true*/ badgeVaultDir, `${badge.id}.svg`), fallbackBuiltin.svgContent, "utf-8");
                } catch (e) {}

                return new NextResponse(fallbackBuiltin.svgContent, {
                    headers: {
                        "Content-Type": "image/svg+xml; charset=utf-8",
                        "Content-Security-Policy": "sandbox; default-src 'none'",
                        "X-Content-Type-Options": "nosniff",
                        "Cache-Control": "private, max-age=3600"
                    }
                });
            }
        }

        return new NextResponse("Badge not found", { status: 404 });
    } catch (e: any) {
        return new NextResponse("Error serving badge", { status: 500 });
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const user = await getCurrentUser();
    if (!user || user.role !== "ADMIN") {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const badge = await prisma.customBadge.findUnique({ where: { id } });

        if (badge) {
            try {
                const safeDeletePath = badge.filePath
                    ? resolveContainedPath(path.join(/*turbopackIgnore: true*/ process.cwd(), "data"), badge.filePath)
                    : null;
                if (safeDeletePath && fs.existsSync(safeDeletePath)) {
                    fs.unlinkSync(safeDeletePath);
                }
            } catch (err) {}
            await prisma.customBadge.delete({ where: { id } });
        }

        return NextResponse.json({ success: true, message: "Custom badge deleted." });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
