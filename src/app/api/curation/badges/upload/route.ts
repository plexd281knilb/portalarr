import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import { getJwtSecret } from "@/lib/auth-secret";
import { logger } from "@/lib/logger";

const CUSTOM_BADGES_DIR = path.join(process.cwd(), "data", "custom_badges");

function ensureCustomBadgesDir() {
    if (!fs.existsSync(CUSTOM_BADGES_DIR)) {
        fs.mkdirSync(CUSTOM_BADGES_DIR, { recursive: true });
    }
}

export async function POST(req: NextRequest) {
    const session = req.cookies.get("session")?.value;
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let payload;
    try {
        const decoded = await jwtVerify(session, getJwtSecret());
        payload = decoded.payload;
    } catch (e) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (payload.role !== "ADMIN") {
        return NextResponse.json({ error: "Forbidden: Admin required" }, { status: 403 });
    }

    try {
        ensureCustomBadgesDir();

        const formData = await req.formData();
        const file = formData.get("file") as File | null;
        const name = (formData.get("name") as string | null) || "Custom Badge";
        const category = (formData.get("category") as string | null) || "custom";
        const position = (formData.get("position") as string | null) || "top-right";
        const width = parseInt((formData.get("width") as string | null) || "140", 10);
        const height = parseInt((formData.get("height") as string | null) || "46", 10);
        const opacity = parseFloat((formData.get("opacity") as string | null) || "1.0");
        const matchRule = formData.get("matchRule") as string | null;

        if (!file) {
            return NextResponse.json({ error: "No badge file provided." }, { status: 400 });
        }

        const ext = path.extname(file.name).toLowerCase() || ".png";
        const cleanName = name.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
        const fileId = `badge_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const fileName = `${fileId}_${cleanName}${ext}`;
        const filePath = path.join(CUSTOM_BADGES_DIR, fileName);

        const bytes = await file.arrayBuffer();
        const buffer = Buffer.from(bytes);

        // Validate image format with sharp if raster
        let mimeType = file.type || "image/png";
        if (ext === ".svg") {
            mimeType = "image/svg+xml";
            fs.writeFileSync(filePath, buffer);
        } else {
            try {
                // Ensure valid image and save
                await sharp(buffer).metadata();
                fs.writeFileSync(filePath, buffer);
            } catch (err: any) {
                return NextResponse.json({ error: `Invalid image format: ${err.message}` }, { status: 400 });
            }
        }

        const badge = await prisma.customBadge.create({
            data: {
                id: fileId,
                name,
                category,
                filePath,
                fileType: ext.replace(".", "").toLowerCase(),
                mimeType,
                position,
                width: isNaN(width) ? 140 : width,
                height: isNaN(height) ? 46 : height,
                opacity: isNaN(opacity) ? 1.0 : Math.max(0.1, Math.min(1.0, opacity)),
                matchRule: matchRule || null,
                enabled: true
            }
        });

        logger.addLog("SUCCESS", "CURATION", `Uploaded custom overlay badge "${name}" (${badge.fileType})`);
        return NextResponse.json({ success: true, badge });
    } catch (e: any) {
        logger.addLog("ERROR", "CURATION", `Failed to upload custom badge: ${e.message}`);
        return NextResponse.json({ error: e.message || "Failed to upload custom badge" }, { status: 500 });
    }
}
