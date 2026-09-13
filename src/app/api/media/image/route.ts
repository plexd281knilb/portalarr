import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getPlexServers, resolveWorkingPlexServerConnection } from "@/lib/plex";

function generateFallbackPosterSvg(title: string, year: string): string {
    const cleanTitle = (title || "Plex Media").slice(0, 36);
    const cleanYear = year ? `(${year})` : "";
    return `<svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="posterBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#090d16" />
                <stop offset="50%" stop-color="#111827" />
                <stop offset="100%" stop-color="#030712" />
            </linearGradient>
            <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#a855f7" />
                <stop offset="100%" stop-color="#06b6d4" />
            </linearGradient>
            <filter id="cardGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect width="600" height="900" fill="url(#posterBg)" />
        <rect x="30" y="30" width="540" height="840" rx="20" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
        <circle cx="300" cy="380" r="90" fill="#1e1b4b" opacity="0.6" />
        <g transform="translate(265, 345)" stroke="#c084fc" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <rect x="0" y="0" width="70" height="70" rx="14" fill="#0f172a" />
            <polygon points="28,22 48,35 28,48" fill="#c084fc" stroke="none" />
        </g>
        <rect x="80" y="540" width="440" height="2" fill="url(#accentGrad)" opacity="0.7" />
        <text x="300" y="600" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="26" fill="#f8fafc" text-anchor="middle">${cleanTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")}</text>
        ${cleanYear ? `<text x="300" y="640" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="18" fill="#94a3b8" text-anchor="middle">${cleanYear}</text>` : ""}
        <text x="300" y="810" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="12" fill="#818cf8" text-anchor="middle" letter-spacing="3">PORTALARR MEDIA</text>
    </svg>`;
}

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
        const targetServerId = searchParams.get("serverId") || searchParams.get("instanceId") || "";
        const serverUrl = searchParams.get("serverUrl") || "";
        const rawImg = searchParams.get("thumb") || searchParams.get("url") || searchParams.get("img") || searchParams.get("path") || "";
        const title = searchParams.get("title") || "";
        const year = searchParams.get("year") || "";
        const type = (searchParams.get("type") || "movie").toLowerCase();

        // 1. Direct HTTP/HTTPS external image
        if (rawImg && (rawImg.startsWith("http://") || rawImg.startsWith("https://"))) {
            const directRes = await tryFetchImage(rawImg, {}, 4000);
            if (directRes) return directRes;
        }

        let cleanImg = rawImg;
        if (cleanImg.includes("pms_image_proxy")) {
            try {
                const dummyUrl = new URL(cleanImg, "http://localhost");
                const nested = dummyUrl.searchParams.get("img") || dummyUrl.searchParams.get("url");
                if (nested) cleanImg = nested;
            } catch (e) {}
        }
        if (cleanImg && !cleanImg.startsWith("/") && !cleanImg.startsWith("http")) {
            cleanImg = `/${cleanImg}`;
        }

        const settings = (await prisma.settings.findFirst()) || (await prisma.settings.findUnique({ where: { id: "global" } }));
        const adminToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";

        // 2. Direct Plex Media Server image resolution using targetServerId or serverUrl
        if (cleanImg && (targetServerId || serverUrl || adminToken)) {
            let candidateUrls: string[] = [];
            let candidateToken = adminToken;

            // Try resolving targeted server
            if (targetServerId || serverUrl) {
                const resolved = await resolveWorkingPlexServerConnection(targetServerId || undefined, adminToken, serverUrl || undefined).catch(() => null);
                if (resolved) {
                    if (resolved.token) candidateToken = resolved.token;
                    candidateUrls.push(resolved.serverUrl, ...resolved.allCandidateUrls);
                }
            }

            // Also check manual Plex servers directly
            if (targetServerId && candidateUrls.length === 0) {
                const manual = await prisma.plexServer.findFirst({
                    where: {
                        OR: [
                            { id: targetServerId },
                            { clientIdentifier: targetServerId },
                            { url: targetServerId },
                            { name: targetServerId }
                        ]
                    }
                }).catch(() => null);
                if (manual) {
                    const cleanUrl = manual.url.replace(/\/+$/, "");
                    candidateUrls.push(cleanUrl);
                    if (manual.token) {
                        const dec = decryptData(manual.token);
                        if (dec) candidateToken = dec;
                    }
                }
            }

            if (serverUrl && !candidateUrls.includes(serverUrl.replace(/\/+$/, ""))) {
                candidateUrls.unshift(serverUrl.replace(/\/+$/, ""));
            }

            // Prepare image path variations
            const imgCandidates: string[] = [cleanImg];
            const strippedThumb = cleanImg.replace(/\/thumb\/[0-9]+$/, "/thumb");
            if (strippedThumb !== cleanImg) imgCandidates.push(strippedThumb);
            if (cleanImg.includes("/art/")) imgCandidates.push(cleanImg.replace("/art/", "/thumb/").replace(/\/thumb\/[0-9]+$/, "/thumb"));

            for (const serverBase of Array.from(new Set(candidateUrls))) {
                for (const targetPath of imgCandidates) {
                    // Method A: Direct PMS image URL
                    const sep = targetPath.includes("?") ? "&" : "?";
                    const directUrl = `${serverBase}${targetPath}${sep}X-Plex-Token=${encodeURIComponent(candidateToken)}`;
                    const directRes = await tryFetchImage(directUrl, {}, 2500);
                    if (directRes) return directRes;

                    // Method B: Transcoded PMS thumbnail (2:3 portrait poster ratio)
                    const photoUrl = `${serverBase}/photo/:/transcode?url=${encodeURIComponent(targetPath)}&width=600&height=900&minSize=1&upscale=1&X-Plex-Token=${encodeURIComponent(candidateToken)}`;
                    const photoRes = await tryFetchImage(photoUrl, {}, 2500);
                    if (photoRes) return photoRes;
                }
            }
        }

        // 3. Try Tautulli instance proxy
        let instance = null;
        if (cleanImg && targetServerId && !targetServerId.startsWith("plex::")) {
            instance = await prisma.tautulliInstance.findUnique({
                where: { id: targetServerId }
            }).catch(() => null);
        }
        if (cleanImg && !instance && !targetServerId.startsWith("plex::")) {
            instance = await prisma.tautulliInstance.findFirst().catch(() => null);
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

                        const photoUrl = `${cleanBase}/photo/:/transcode?url=${encodeURIComponent(cleanImg)}&width=600&height=900&minSize=1&upscale=1&X-Plex-Token=${encodeURIComponent(sToken)}`;
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
                        const hdArtworkUrl = item.artworkUrl100.replace("100x100bb", "600x900bb");
                        const hdImageRes = await tryFetchImage(hdArtworkUrl, {}, 3500);
                        if (hdImageRes) return hdImageRes;
                    }
                }
            } catch (e) {}
        }

        // 6. Return graceful SVG fallback poster (never broken image)
        const svg = generateFallbackPosterSvg(title || "Poster", year);
        return new NextResponse(svg, {
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=86400"
            }
        });

    } catch (e: any) {
        const svg = generateFallbackPosterSvg("Poster", "");
        return new NextResponse(svg, {
            headers: {
                "Content-Type": "image/svg+xml",
                "Cache-Control": "public, max-age=3600"
            }
        });
    }
}

