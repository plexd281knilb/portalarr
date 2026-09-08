import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import crypto from "crypto";

export const dynamic = "force-dynamic";

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
        const sizeMbParam = searchParams.get("size");
        let sizeMb = sizeMbParam ? parseInt(sizeMbParam, 10) : 10;
        if (isNaN(sizeMb) || sizeMb < 1) sizeMb = 1;
        if (sizeMb > 50) sizeMb = 50;

        const totalBytes = sizeMb * 1024 * 1024;
        
        // Generate pseudo-random bytes chunk
        const chunkSize = 64 * 1024; // 64KB chunk
        const randomChunk = crypto.randomBytes(chunkSize);
        const chunksCount = Math.floor(totalBytes / chunkSize);
        
        // Use a readable stream for memory efficiency
        const stream = new ReadableStream({
            start(controller) {
                for (let i = 0; i < chunksCount; i++) {
                    controller.enqueue(randomChunk);
                }
                const remaining = totalBytes % chunkSize;
                if (remaining > 0) {
                    controller.enqueue(randomChunk.subarray(0, remaining));
                }
                controller.close();
            }
        });

        return new NextResponse(stream, {
            headers: {
                "Content-Type": "application/octet-stream",
                "Content-Length": totalBytes.toString(),
                "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
                "Pragma": "no-cache",
                "Expires": "0"
            }
        });

    } catch (e: any) {
        return new NextResponse("Speed test error", { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const session = req.cookies.get("session")?.value;
        if (!session) return new NextResponse("Unauthorized", { status: 401 });
        
        try {
            await jwtVerify(session, getJwtSecret());
        } catch (e) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const start = Date.now();
        const blob = await req.blob();
        const durationMs = Date.now() - start;

        return NextResponse.json({
            success: true,
            bytesReceived: blob.size,
            durationMs: Math.max(durationMs, 1)
        });
    } catch (e: any) {
        return NextResponse.json({ success: false, error: "Upload test failed" }, { status: 500 });
    }
}
