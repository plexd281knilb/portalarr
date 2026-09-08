import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getPlexServers } from "@/lib/plex";

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

        // Direct HTTP/HTTPS external image
        if (img.startsWith("http://") || img.startsWith("https://")) {
            try {
                const res = await fetch(img, { headers: { "User-Agent": "Portalarr/1.0" } });
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

        const cleanImg = img.startsWith("/") ? img : `/${img}`;

        const settings = (await prisma.settings.findFirst()) || (await prisma.settings.findUnique({ where: { id: "global" } }));
        const adminToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";

        // 1. Direct Plex Media Server image proxying via Plex Token
        if (adminToken && (serverUrl || instanceId?.startsWith("plex::"))) {
            const rawServer = (serverUrl || instanceId?.split("::").slice(2).join("::") || "").replace(/\/+$/, "");
            
            const serverCandidates: string[] = [];
            if (rawServer) serverCandidates.push(rawServer);
            if (rawServer.startsWith("https://") && rawServer.includes(".plex.direct")) {
                serverCandidates.push(rawServer.replace("https://", "http://"));
            }

            for (const serverBase of serverCandidates) {
                // Method A: Scaled / Transcoded thumbnail (highest reliability across all Plex platforms)
                const photoUrl = `${serverBase}/photo/:/transcode?url=${encodeURIComponent(cleanImg)}&width=600&height=400&minSize=1&upscale=1&X-Plex-Token=${encodeURIComponent(adminToken)}`;
                try {
                    const res = await fetch(photoUrl, { headers: { "User-Agent": "Portalarr/1.0" } });
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

                // Method B: Direct image endpoint
                const sep = cleanImg.includes("?") ? "&" : "?";
                const directUrl = `${serverBase}${cleanImg}${sep}X-Plex-Token=${encodeURIComponent(adminToken)}`;
                try {
                    const res = await fetch(directUrl, { headers: { "User-Agent": "Portalarr/1.0" } });
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

        // 2. Try Tautulli instance proxy
        let instance = null;
        if (instanceId && !instanceId.startsWith("plex::")) {
            instance = await prisma.tautulliInstance.findUnique({
                where: { id: instanceId }
            });
        }
        if (!instance && !instanceId?.startsWith("plex::")) {
            instance = await prisma.tautulliInstance.findFirst();
        }

        if (instance) {
            const cleanBase = instance.url.replace(/\/$/, "").replace(/\/api\/v2\/?$/, "");
            const apiKey = decryptData(instance.apiKey);
            const targetUrl = `${cleanBase}/pms_image_proxy?img=${encodeURIComponent(cleanImg)}&apikey=${encodeURIComponent(apiKey)}`;

            try {
                const res = await fetch(targetUrl, {
                    headers: { "User-Agent": "Portalarr/1.0" }
                });

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

        // 3. Fallback: If specific server or Tautulli failed, search all discovered Plex Servers
        if (adminToken) {
            try {
                const plexServers = await getPlexServers(adminToken);
                for (const srv of plexServers) {
                    const sToken = srv.accessToken || adminToken;
                    for (const conn of srv.connections) {
                        const cleanBase = conn.uri.replace(/\/+$/, "");
                        const photoUrl = `${cleanBase}/photo/:/transcode?url=${encodeURIComponent(cleanImg)}&width=600&height=400&minSize=1&upscale=1&X-Plex-Token=${encodeURIComponent(sToken)}`;
                        try {
                            const res = await fetch(photoUrl, { headers: { "User-Agent": "Portalarr/1.0" } });
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
            } catch (e) {}
        }

        return new NextResponse("Image not found", { status: 404 });

    } catch (e: any) {
        return new NextResponse("Failed to proxy image", { status: 500 });
    }
}
