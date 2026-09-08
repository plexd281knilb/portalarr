import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
    try {
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
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const dbUrl = process.env.DATABASE_URL || "";
        const rawPath = dbUrl.replace("file:", "").trim();
        const targetPath = path.isAbsolute(rawPath) ? rawPath : path.join(process.cwd(), rawPath);

        const targetExists = fs.existsSync(targetPath);
        const targetSize = targetExists ? fs.statSync(targetPath).size : 0;

        const candidatePaths = [
            path.join(process.cwd(), "prisma", "dev.db"),
            path.join(process.cwd(), "dev.db"),
            "/app/prisma/dev.db",
            "/app/dev.db"
        ];
        const legacyFound = candidatePaths
            .filter(p => p !== targetPath && fs.existsSync(p))
            .map(p => ({ path: p, size: fs.statSync(p).size }));

        const librariesCount = await prisma.library.count().catch(() => 0);
        const usersCount = await prisma.user.count().catch(() => 0);
        const libraries = await prisma.library.findMany().catch(() => []);

        return NextResponse.json({
            databaseUrl: dbUrl,
            targetPath,
            targetExists,
            targetSizeBytes: targetSize,
            librariesCount,
            usersCount,
            libraries,
            legacyFound
        });
    } catch (e: any) {
        console.error("GET /api/debug/db error:", e);
        return NextResponse.json({ error: e.message || "Failed to inspect database" }, { status: 500 });
    }
}
