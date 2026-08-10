import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function GET() {
    try {
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
