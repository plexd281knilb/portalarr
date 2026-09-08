import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getPlexServers } from "@/lib/plex";

async function tryFetchImage(url: string, headers: Record<string, string> = {}, timeoutMs = 3500): Promise<NextResponse | null> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, {
            headers: { "User-Agent": "Portalarr/1.0", ...headers },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const contentType = res.headers.get("content-type") || "image/jpeg";
            if (contentType.startsWith("image/") || contentType.includes("octet-stream")) {
                const buffer = await res.arrayBuffer();
                if (buffer.byteLength > 200) {
                    return new NextResponse(Buffer.from(buffer), {
                        headers: {
                            "Content-Type": contentType.startsWith("image/") ? contentType : "image/jpeg",
                            "Cache-Control": "public, max-age=86400, stale-while-revalidate=43200"
                        }
                    });
                }
            }
        }
    } catch (e) {}
    return null;
}

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
        const instanceId = searchParams.get("instanceId") || "";
        const serverUrl = searchParams.get("serverUrl") || "";
        const img = searchParams.get("img") || "";
        const title = searchParams.get("title") || "";
        const year = searchParams.get("year") || "";
        const type = (searchParams.get("type") || "movie").toLowerCase();

        // 1. Direct HTTP/HTTPS external image
        if (img && (img.startsWith("http://") || img.startsWith("https://"))) {
            const directRes = await tryFetchImage(img, {}, 4000);
            if (directRes) return directRes;
        }

        let cleanImg = img;
        if (cleanImg.includes("pms_image_proxy")) {
            try {
                const dummyUrl = new URL(cleanImg, "http://localhost");
                const nested = dummyUrl.searchParams.get("img");
                if (nested) cleanImg = nested;
            } catch (e) {}
        }
        if (cleanImg && !cleanImg.startsWith("/")) {
            cleanImg = `/${cleanImg}`;
        }

        const settings = (await prisma.settings.findFirst()) || (await prisma.settings.findUnique({ where: { id: "global" } }));
        const adminToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";

        // 2. Direct Plex Media Server image proxying via Plex Token
        if (cleanImg && adminToken && (serverUrl || instanceId.startsWith("plex::"))) {
            const rawServer = (serverUrl || instanceId.split("::").slice(2).join("::") || "").replace(/\/+$/, "");
            
            const serverCandidates: string[] = [];
            if (rawServer) serverCandidates.push(rawServer);
            if (rawServer.startsWith("https://") && rawServer.includes(".plex.direct")) {
                serverCandidates.push(rawServer.replace("https://", "http://"));
            }

            const imgCandidates: string[] = [cleanImg];
            // If thumb has a timestamp hash (e.g. /library/metadata/123/thumb/17234567), also try stripped base
            const strippedThumb = cleanImg.replace(/\/thumb\/[0-9]+$/, "/thumb");
            if (strippedThumb !== cleanImg) imgCandidates.push(strippedThumb);
            if (cleanImg.includes("/art/")) imgCandidates.push(cleanImg.replace("/art/", "/thumb/").replace(/\/thumb\/[0-9]+$/, "/thumb"));

            for (const serverBase of serverCandidates) {
                for (const targetPath of imgCandidates) {
                    // Method A: Direct PMS image URL
                    const sep = targetPath.includes("?") ? "&" : "?";
                    const directUrl = `${serverBase}${targetPath}${sep}X-Plex-Token=${encodeURIComponent(adminToken)}`;
                    const directRes = await tryFetchImage(directUrl, {}, 2500);
                    if (directRes) return directRes;

                    // Method B: Transcoded PMS thumbnail
                    const photoUrl = `${serverBase}/photo/:/transcode?url=${encodeURIComponent(targetPath)}&width=600&height=400&minSize=1&upscale=1&X-Plex-Token=${encodeURIComponent(adminToken)}`;
                    const photoRes = await tryFetchImage(photoUrl, {}, 2500);
                    if (photoRes) return photoRes;
                }
            }
        }

        // 3. Try Tautulli instance proxy
        let instance = null;
        if (cleanImg && instanceId && !instanceId.startsWith("plex::")) {
            instance = await prisma.tautulliInstance.findUnique({
                where: { id: instanceId }
            });
        }
        if (cleanImg && !instance && !instanceId.startsWith("plex::")) {
            instance = await prisma.tautulliInstance.findFirst();
        }

        if (cleanImg && instance) {
            const cleanBase = instance.url.replace(/\/$/, "").replace(/\/api\/v2\/?$/, "");
            const apiKey = decryptData(instance.apiKey);
            if (apiKey) {
                const targetUrl = `${cleanBase}/pms_image_proxy?img=${encodeURIComponent(cleanImg)}&apikey=${encodeURIComponent(apiKey)}`;
                const tautulliRes = await tryFetchImage(targetUrl, {}, 3000);
                if (tautulliRes) return tautulliRes;

                const strippedThumb = cleanImg.replace(/\/thumb\/[0-9]+$/, "/thumb");
                if (strippedThumb !== cleanImg) {
                    const fallbackTautulli = `${cleanBase}/pms_image_proxy?img=${encodeURIComponent(strippedThumb)}&apikey=${encodeURIComponent(apiKey)}`;
                    const fbRes = await tryFetchImage(fallbackTautulli, {}, 2500);
                    if (fbRes) return fbRes;
                }
            }
        }

        // 4. Fallback: Search all discovered Plex Servers concurrently
        if (cleanImg && adminToken) {
            try {
                const plexServers = await getPlexServers(adminToken);
                for (const srv of plexServers) {
                    const sToken = srv.accessToken || adminToken;
                    for (const conn of srv.connections) {
                        const cleanBase = conn.uri.replace(/\/+$/, "");
                        const sep = cleanImg.includes("?") ? "&" : "?";
                        const directUrl = `${cleanBase}${cleanImg}${sep}X-Plex-Token=${encodeURIComponent(sToken)}`;
                        const dRes = await tryFetchImage(directUrl, {}, 2000);
                        if (dRes) return dRes;

                        const photoUrl = `${cleanBase}/photo/:/transcode?url=${encodeURIComponent(cleanImg)}&width=600&height=400&minSize=1&upscale=1&X-Plex-Token=${encodeURIComponent(sToken)}`;
                        const pRes = await tryFetchImage(photoUrl, {}, 2000);
                        if (pRes) return pRes;
                    }
                }
            } catch (e) {}
        }

        // 5. Automated High-Definition Metadata Artwork Fallback (iTunes Media API)
        if (title) {
            try {
                const cleanTitle = title.replace(/\(\d{4}\)/g, "").trim();
                const itunesEntity = type === "episode" || type === "show" ? "tvSeason" : (type === "track" ? "song" : "movie");
                const itunesMedia = type === "episode" || type === "show" ? "tvShow" : (type === "track" ? "music" : "movie");
                
                const itunesSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(`${cleanTitle} ${year}`.trim())}&media=${itunesMedia}&entity=${itunesEntity}&limit=1`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const itunesRes = await fetch(itunesSearchUrl, { 
                    headers: { "User-Agent": "Portalarr/1.0" },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (itunesRes.ok) {
                    const itunesData = await itunesRes.json();
                    const item = itunesData.results?.[0];
                    if (item && item.artworkUrl100) {
                        const hdArtworkUrl = item.artworkUrl100.replace("100x100bb", "600x600bb");
                        const hdImageRes = await tryFetchImage(hdArtworkUrl, {}, 3500);
                        if (hdImageRes) return hdImageRes;
                    }
                }
            } catch (e) {}
        }

        return new NextResponse("Image not found", { status: 404 });

    } catch (e: any) {
        return new NextResponse("Failed to proxy image", { status: 500 });
    }
}

