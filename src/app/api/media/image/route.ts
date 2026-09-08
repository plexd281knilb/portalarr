import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";

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
        const instanceId = searchParams.get("instanceId");
        const img = searchParams.get("img");

        if (!img) {
            return new NextResponse("Missing image path", { status: 400 });
        }

        let instance = null;
        if (instanceId) {
            instance = await prisma.tautulliInstance.findUnique({
                where: { id: instanceId }
            });
        }
        if (!instance) {
            instance = await prisma.tautulliInstance.findFirst();
        }

        if (!instance) {
            return new NextResponse("No Tautulli instance configured", { status: 404 });
        }

        const cleanBase = instance.url.replace(/\/$/, "").replace(/\/api\/v2\/?$/, "");
        let targetUrl = "";

        if (img.startsWith("http://") || img.startsWith("https://")) {
            targetUrl = img;
        } else {
            const cleanImg = img.startsWith("/") ? img : `/${img}`;
            targetUrl = `${cleanBase}/pms_image_proxy?img=${encodeURIComponent(cleanImg)}&apikey=${instance.apiKey}`;
        }

        const res = await fetch(targetUrl, {
            headers: {
                "User-Agent": "Portalarr/1.0"
            }
        });

        if (!res.ok) {
            return new NextResponse("Image not found", { status: res.status });
        }

        const contentType = res.headers.get("content-type") || "image/jpeg";
        const buffer = await res.arrayBuffer();

        return new NextResponse(Buffer.from(buffer), {
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
            }
        });

    } catch (e: any) {
        return new NextResponse("Failed to proxy image", { status: 500 });
    }
}
