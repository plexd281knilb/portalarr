import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import { getCurrentUser } from "@/app/auth-actions";
import { DEFAULT_BUILTIN_BADGE_DEFINITIONS } from "@/lib/curation/presets";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const decodedId = decodeURIComponent(id || "").trim();
        if (!decodedId) {
            return new NextResponse("Badge not found", { status: 404 });
        }

        // 1. Direct match with built-in badge definitions
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
                    "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
                }
            });
        }

        // 2. Query database for CustomBadge record
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

        // 3. Resolve candidate file paths across data/custom_badges and public/kometa_stock
        const candidatePaths: string[] = [];
        if (targetFilePath) {
            candidatePaths.push(targetFilePath);
            candidatePaths.push(path.join(process.cwd(), targetFilePath));
            candidatePaths.push(path.join(process.cwd(), "data", "custom_badges", path.basename(targetFilePath)));
            candidatePaths.push(path.join(process.cwd(), "public", "kometa_stock", path.basename(targetFilePath)));
            candidatePaths.push(path.join(process.cwd(), "public", targetFilePath));
        }

        // Also check decodedId in common folders
        candidatePaths.push(path.join(process.cwd(), "data", "custom_badges", `${decodedId}.svg`));
        candidatePaths.push(path.join(process.cwd(), "data", "custom_badges", `${decodedId}.png`));
        candidatePaths.push(path.join(process.cwd(), "data", "custom_badges", decodedId));
        candidatePaths.push(path.join(process.cwd(), "public", "kometa_stock", `${decodedId}.svg`));
        candidatePaths.push(path.join(process.cwd(), "public", "kometa_stock", `${decodedId}.png`));
        candidatePaths.push(path.join(process.cwd(), "public", "kometa_stock", decodedId));

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

                        const fileBuffer = fs.readFileSync(cand);
                        return new NextResponse(fileBuffer, {
                            headers: {
                                "Content-Type": mimeType,
                                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
                            }
                        });
                    }
                } catch (readErr) {}
            }
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
                    const badgeVaultDir = path.join(process.cwd(), "data", "custom_badges");
                    if (!fs.existsSync(badgeVaultDir)) fs.mkdirSync(badgeVaultDir, { recursive: true });
                    fs.writeFileSync(path.join(badgeVaultDir, `${badge.id}.svg`), fallbackBuiltin.svgContent, "utf-8");
                } catch (e) {}

                return new NextResponse(fallbackBuiltin.svgContent, {
                    headers: {
                        "Content-Type": "image/svg+xml; charset=utf-8",
                        "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
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
                if (fs.existsSync(badge.filePath)) {
                    fs.unlinkSync(badge.filePath);
                }
            } catch (err) {}
            await prisma.customBadge.delete({ where: { id } });
        }

        return NextResponse.json({ success: true, message: "Custom badge deleted." });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
