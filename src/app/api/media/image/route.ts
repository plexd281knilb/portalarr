import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";

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
        const serverUrl = searchParams.get("serverUrl");
        const img = searchParams.get("img");

        if (!img) {
            return new NextResponse("Missing image path", { status: 400 });
        }

        // Direct Plex Media Server image proxying via Plex Token
        if (serverUrl || instanceId?.startsWith("plex::")) {
            const settings = (await prisma.settings.findFirst()) || (await prisma.settings.findUnique({ where: { id: "global" } }));
            const adminToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
            const cleanServer = (serverUrl || instanceId?.split("::").slice(2).join("::") || "").replace(/\/+$/, "");
            if (cleanServer && adminToken) {
                const cleanImg = img.startsWith("/") ? img : `/${img}`;
                const targetUrl = `${cleanServer}${cleanImg}?X-Plex-Token=${encodeURIComponent(adminToken)}`;
                try {
                    const res = await fetch(targetUrl, { headers: { "User-Agent": "Portalarr/1.0" } });
                    if (res.ok) {
                        const contentType = res.headers.get("content-type") || "image/jpeg";
                        const buffer = await res.arrayBuffer();
                        return new NextResponse(Buffer.from(buffer), {
                            headers: {
                                "Content-Type": contentType,
                                "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
                            }
                        });
                    }
                } catch (e) {}
            }
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
            return new NextResponse("No Tautulli or Plex instance configured", { status: 404 });
        }

        const cleanBase = instance.url.replace(/\/$/, "").replace(/\/api\/v2\/?$/, "");
        const apiKey = decryptData(instance.apiKey);
        let targetUrl = "";

        if (img.startsWith("http://") || img.startsWith("https://")) {
            targetUrl = img;
        } else {
            const cleanImg = img.startsWith("/") ? img : `/${img}`;
            targetUrl = `${cleanBase}/pms_image_proxy?img=${encodeURIComponent(cleanImg)}&apikey=${encodeURIComponent(apiKey)}`;
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
