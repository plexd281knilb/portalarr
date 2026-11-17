import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/auth-secret";
import prisma from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { getPlexServers, resolveWorkingPlexServerConnection } from "@/lib/plex";
import { escapeHtml, sanitizeSvgContent } from "@/lib/security";

function generateFallbackPosterSvg(title: string, year: string): string {
    const cleanTitle = (title || "Plex Media").slice(0, 36);
    const cleanYear = year ? `(${String(year).slice(0, 12)})` : "";
    return `<svg width="600" height="900" viewBox="0 0 600 900" xmlns="http://www.w3.org/2000/svg">
        <defs>
            <linearGradient id="posterBg" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#090d16" />
                <stop offset="50%" stop-color="#111827" />
                <stop offset="100%" stop-color="#030712" />
            </linearGradient>
            <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#f59e0b" />
                <stop offset="100%" stop-color="#0ea5e9" />
            </linearGradient>
            <filter id="cardGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feDropShadow dx="0" dy="8" stdDeviation="12" flood-color="#000000" flood-opacity="0.8"/>
            </filter>
        </defs>
        <rect width="600" height="900" fill="url(#posterBg)" />
        <rect x="30" y="30" width="540" height="840" rx="20" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="2" />
        <circle cx="300" cy="380" r="90" fill="#1e293b" opacity="0.7" />
        <g transform="translate(265, 345)" stroke="#f59e0b" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round">
            <rect x="0" y="0" width="70" height="70" rx="14" fill="#0f172a" />
            <polygon points="28,22 48,35 28,48" fill="#f59e0b" stroke="none" />
        </g>
        <rect x="80" y="540" width="440" height="2" fill="url(#accentGrad)" opacity="0.7" />
        <text x="300" y="600" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="26" fill="#f8fafc" text-anchor="middle">${escapeHtml(cleanTitle)}</text>
        ${cleanYear ? `<text x="300" y="640" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="700" font-size="18" fill="#94a3b8" text-anchor="middle">${escapeHtml(cleanYear)}</text>` : ""}
        <text x="300" y="810" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-weight="800" font-size="12" fill="#94a3b8" text-anchor="middle" letter-spacing="3">DOMSHOMELAB MEDIA</text>
    </svg>`;
}

function isSafeExternalImageUrl(rawUrl: string): boolean {
    try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return false;
        const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
        // Block cloud instance metadata, loopback, link-local, and private network endpoints
        if (
            host === "metadata.google.internal" ||
            host === "localhost" ||
            host === "0.0.0.0" ||
            host === "::1" ||
            host.endsWith(".local") ||
            host.endsWith(".internal") ||
            host.startsWith("127.") ||
            host.startsWith("10.") ||
            host.startsWith("192.168.") ||
            host.startsWith("169.254.") ||
            /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
            host.startsWith("fe80:") ||
            host.startsWith("fc00:") ||
            host.startsWith("fd00:")
        ) {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

function normalizeServerHostPort(rawUrl: string): string | null {
    try {
        const trimmed = rawUrl.trim();
        if (!trimmed) return null;
        const withProto = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
        const parsed = new URL(withProto);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
        const defaultPort = parsed.protocol === "https:" ? "443" : "80";
        const port = parsed.port || defaultPort;
        return `${parsed.hostname.toLowerCase()}:${port}`;
    } catch {
        return null;
    }
}

async function tryFetchImage(url: string, headers: Record<string, string> = {}, timeoutMs = 3500, allowConfiguredInternal = false): Promise<NextResponse | null> {
    if (!allowConfiguredInternal && !isSafeExternalImageUrl(url)) return null;
    if (allowConfiguredInternal) {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
            const host = parsed.hostname.toLowerCase();
            if (host === "metadata.google.internal" || host.startsWith("169.254.")) return null;
        } catch {
            return null;
        }
    }
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        const res = await fetch(url, {
            headers: { "User-Agent": "DomsHomeLab/1.0", ...headers },
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
            const contentType = res.headers.get("content-type") || "image/jpeg";
            if (contentType.startsWith("image/") || contentType.includes("octet-stream")) {
                const buffer = await res.arrayBuffer();
                if (buffer.byteLength > 200) {
                    const outType = contentType.startsWith("image/") ? contentType : "image/jpeg";
                    const isSvg = outType.toLowerCase().includes("svg");
                    const payload = isSvg
                        ? Buffer.from(sanitizeSvgContent(Buffer.from(buffer).toString("utf-8")), "utf-8")
                        : Buffer.from(buffer);
                    return new NextResponse(payload, {
                        headers: {
                            "Content-Type": outType,
                            "Cache-Control": "private, max-age=3600",
                            "X-Content-Type-Options": "nosniff",
                            ...(isSvg ? { "Content-Security-Policy": "sandbox; default-src 'none'" } : {})
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
        
        let payload: any;
        try {
            const decoded = await jwtVerify(session, getJwtSecret());
            payload = decoded.payload;
        } catch (e) {
            return new NextResponse("Unauthorized", { status: 401 });
        }

        const userId = String(payload?.userId || payload?.id || "");
        if (!userId) return new NextResponse("Unauthorized", { status: 401 });
        const dbUser = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, status: true }
        });
        if (!dbUser) return new NextResponse("Unauthorized", { status: 401 });
        const role = String(dbUser.role || "").toUpperCase();
        const status = String(dbUser.status || "").toUpperCase();
        if (role !== "ADMIN" && (status === "PENDING" || status === "REJECTED" || status === "SUSPENDED" || status === "EXPIRED")) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const searchParams = req.nextUrl.searchParams;
        const targetServerId = searchParams.get("serverId") || searchParams.get("instanceId") || "";
        const serverName = searchParams.get("serverName") || "";
        let serverUrl = searchParams.get("serverUrl") || "";
        const tokenParam = searchParams.get("token") || "";
        const rawImg = searchParams.get("thumb") || searchParams.get("url") || searchParams.get("img") || searchParams.get("path") || "";
        const title = searchParams.get("title") || "";
        const year = searchParams.get("year") || "";
        const type = (searchParams.get("type") || "movie").toLowerCase();

        let lookupServerId = targetServerId;
        if (lookupServerId.startsWith("plex::")) {
            const parts = lookupServerId.split("::");
            if (parts[1]) lookupServerId = parts[1];
            if (parts[2] && !serverUrl) serverUrl = parts[2];
        }

        // 1. Direct HTTP/HTTPS external image
        let cleanImg = rawImg;
        if (rawImg && (rawImg.startsWith("http://") || rawImg.startsWith("https://"))) {
            const directRes = await tryFetchImage(rawImg, {}, 3500);
            if (directRes) return directRes;

            // If direct fetch fails (e.g. LAN IP unreachable or token expired), extract relative path for PMS candidate resolution
            try {
                const parsed = new URL(rawImg);
                if (parsed.searchParams.has("img")) {
                    cleanImg = parsed.searchParams.get("img") || parsed.pathname;
                } else if (parsed.searchParams.has("url")) {
                    cleanImg = parsed.searchParams.get("url") || parsed.pathname;
                } else if (parsed.pathname.includes("/library/metadata/")) {
                    cleanImg = parsed.pathname;
                }
            } catch (e) {}
        }

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

        // 2. Direct Tautulli Resolution (Fast-path if targetServerId matches a Tautulli instance)
        const tautulliId = searchParams.get("instanceId") || lookupServerId;
        let tautulliInstance = null;
        if (cleanImg && tautulliId && !tautulliId.startsWith("plex::")) {
            tautulliInstance = await prisma.tautulliInstance.findUnique({
                where: { id: tautulliId }
            }).catch(() => null);
        }
        if (cleanImg && tautulliInstance) {
            let cleanBase = tautulliInstance.url.trim().replace(/\/$/, "").replace(/\/api\/v2\/?$/, "");
            if (!cleanBase.startsWith("http://") && !cleanBase.startsWith("https://")) {
                cleanBase = `http://${cleanBase}`;
            }
            const apiKey = decryptData(tautulliInstance.apiKey);
            if (apiKey) {
                // Tautulli API v2 cmd=pms_image_proxy with dimensions
                const apiV2Url = `${cleanBase}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=pms_image_proxy&img=${encodeURIComponent(cleanImg)}&width=300&height=450&fallback=poster`;
                const v2Res = await tryFetchImage(apiV2Url, {}, 3500, true);
                if (v2Res) return v2Res;

                // Tautulli API v2 raw
                const apiV2UrlRaw = `${cleanBase}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=pms_image_proxy&img=${encodeURIComponent(cleanImg)}`;
                const v2RawRes = await tryFetchImage(apiV2UrlRaw, {}, 3000, true);
                if (v2RawRes) return v2RawRes;

                // Stripped timestamp variation
                const strippedThumb = cleanImg.replace(/\/thumb\/[0-9]+$/, "/thumb");
                if (strippedThumb !== cleanImg) {
                    const fallbackTautulli = `${cleanBase}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=pms_image_proxy&img=${encodeURIComponent(strippedThumb)}&width=300&height=450&fallback=poster`;
                    const fbRes = await tryFetchImage(fallbackTautulli, {}, 2500, true);
                    if (fbRes) return fbRes;
                }

                // Web UI proxy endpoint
                const targetUrl = `${cleanBase}/pms_image_proxy?img=${encodeURIComponent(cleanImg)}&apikey=${encodeURIComponent(apiKey)}`;
                const tautulliRes = await tryFetchImage(targetUrl, {}, 2000, true);
                if (tautulliRes) return tautulliRes;
            }
        }

        const settings = (await prisma.settings.findFirst()) || (await prisma.settings.findUnique({ where: { id: "global" } }));
        const adminToken = settings?.mainPlexToken ? decryptData(settings.mainPlexToken) : "";
        const configuredPlexServers = await prisma.plexServer.findMany({ select: { url: true } }).catch(() => []);
        const trustedHostPorts = new Set(
            [settings?.mainPlexUrl || "", ...configuredPlexServers.map((s) => s.url || "")]
                .map((u) => normalizeServerHostPort(u))
                .filter((v): v is string => Boolean(v))
        );

        if (serverUrl && !tokenParam) {
            const requestedHostPort = normalizeServerHostPort(serverUrl);
            if (!requestedHostPort || !trustedHostPorts.has(requestedHostPort)) {
                return new NextResponse("Forbidden: Untrusted Plex server URL", { status: 403 });
            }
        }

        // 3. Direct Plex Media Server image resolution using lookupServerId, serverName or serverUrl
        if (cleanImg && (lookupServerId || serverUrl || serverName || adminToken)) {
            let candidateUrls: string[] = [];
            let candidateToken = tokenParam || adminToken;

            // Try resolving targeted server
            if (lookupServerId || serverUrl || serverName) {
                const resolved = await resolveWorkingPlexServerConnection(lookupServerId || serverName || undefined, adminToken, serverUrl || undefined).catch(() => null);
                if (resolved) {
                    if (resolved.token && !tokenParam) candidateToken = resolved.token;
                    candidateUrls.push(resolved.serverUrl, ...resolved.allCandidateUrls);
                }
            }

            // Also check manual Plex servers directly
            if ((lookupServerId || serverName) && candidateUrls.length === 0) {
                const manual = await prisma.plexServer.findFirst({
                    where: {
                        OR: [
                            { id: lookupServerId || undefined },
                            { clientIdentifier: lookupServerId || undefined },
                            { url: lookupServerId || undefined },
                            { name: lookupServerId || serverName || undefined }
                        ]
                    }
                }).catch(() => null);
                if (manual) {
                    let cleanUrl = manual.url.replace(/\/+$/, "");
                    if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) cleanUrl = `http://${cleanUrl}`;
                    candidateUrls.push(cleanUrl);
                    if (manual.token && !tokenParam) {
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
            if (cleanImg.includes("/thumb/")) imgCandidates.push(cleanImg.replace("/thumb/", "/art/").replace(/\/art\/[0-9]+$/, "/art"));

            for (const serverBase of Array.from(new Set(candidateUrls))) {
                const baseHostPort = normalizeServerHostPort(serverBase);
                const isTrustedBase = Boolean(baseHostPort && trustedHostPorts.has(baseHostPort)) || (!serverUrl && Boolean(lookupServerId || serverName));
                for (const targetPath of imgCandidates) {
                    // Method A: Direct PMS image URL
                    const sep = targetPath.includes("?") ? "&" : "?";
                    const directUrl = `${serverBase}${targetPath}${sep}X-Plex-Token=${encodeURIComponent(candidateToken)}`;
                    const directRes = await tryFetchImage(directUrl, {}, 2500, isTrustedBase);
                    if (directRes) return directRes;

                    // Method B: Transcoded PMS thumbnail (2:3 portrait poster ratio)
                    const photoUrl = `${serverBase}/photo/:/transcode?url=${encodeURIComponent(targetPath)}&width=600&height=900&minSize=1&upscale=1&X-Plex-Token=${encodeURIComponent(candidateToken)}`;
                    const photoRes = await tryFetchImage(photoUrl, {}, 2500, isTrustedBase);
                    if (photoRes) return photoRes;
                }
            }
        }

        // 4. Try any available Tautulli instance if still unresolved
        let fallbackInstance = null;
        if (cleanImg && !lookupServerId.startsWith("plex::")) {
            fallbackInstance = await prisma.tautulliInstance.findFirst().catch(() => null);
        }

        if (cleanImg && fallbackInstance && fallbackInstance.id !== tautulliInstance?.id) {
            let cleanBase = fallbackInstance.url.trim().replace(/\/$/, "").replace(/\/api\/v2\/?$/, "");
            if (!cleanBase.startsWith("http://") && !cleanBase.startsWith("https://")) {
                cleanBase = `http://${cleanBase}`;
            }
            const apiKey = decryptData(fallbackInstance.apiKey);
            if (apiKey) {
                const apiV2Url = `${cleanBase}/api/v2?apikey=${encodeURIComponent(apiKey)}&cmd=pms_image_proxy&img=${encodeURIComponent(cleanImg)}&width=300&height=450&fallback=poster`;
                const v2Res = await tryFetchImage(apiV2Url, {}, 3500, true);
                if (v2Res) return v2Res;

                const targetUrl = `${cleanBase}/pms_image_proxy?img=${encodeURIComponent(cleanImg)}&apikey=${encodeURIComponent(apiKey)}`;
                const tautulliRes = await tryFetchImage(targetUrl, {}, 2000, true);
                if (tautulliRes) return tautulliRes;
            }
        }

        // 4b. Fallback: Search all discovered Plex Servers concurrently
        if (cleanImg && adminToken) {
            try {
                const plexServers = await getPlexServers(adminToken);
                for (const srv of plexServers) {
                    const sToken = srv.accessToken || adminToken;
                    for (const conn of srv.connections) {
                        const cleanBase = conn.uri.replace(/\/+$/, "");
                        const sep = cleanImg.includes("?") ? "&" : "?";
                        const directUrl = `${cleanBase}${cleanImg}${sep}X-Plex-Token=${encodeURIComponent(sToken)}`;
                        const dRes = await tryFetchImage(directUrl, {}, 2000, true);
                        if (dRes) return dRes;

                        const photoUrl = `${cleanBase}/photo/:/transcode?url=${encodeURIComponent(cleanImg)}&width=600&height=900&minSize=1&upscale=1&X-Plex-Token=${encodeURIComponent(sToken)}`;
                        const pRes = await tryFetchImage(photoUrl, {}, 2000, true);
                        if (pRes) return pRes;
                    }
                }
            } catch (e) {}
        }

        // 5a. Automated High-Definition Metadata Artwork Fallback (TMDb API)
        if (title) {
            try {
                let cleanTitle = title.replace(/\(\d{4}\)/g, "").trim();
                if ((type === "episode" || type === "show") && cleanTitle.includes(" - ")) {
                    cleanTitle = cleanTitle.split(" - ")[0].trim();
                }
                const tmdbKey = settings?.tmdbApiKey || process.env.TMDB_API_KEY || "431a8708161bcd1f1fbe7536137e61ed";
                const isTv = type === "episode" || type === "show";
                const endpoint = isTv ? "search/tv" : "search/movie";
                const yearParam = year ? (isTv ? `&first_air_date_year=${encodeURIComponent(year)}` : `&year=${encodeURIComponent(year)}`) : "";
                const tmdbUrl = `https://api.themoviedb.org/3/${endpoint}?api_key=${tmdbKey}&query=${encodeURIComponent(cleanTitle)}${yearParam}&include_adult=false&language=en-US&page=1`;
                
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const tmdbRes = await fetch(tmdbUrl, {
                    headers: { "Accept": "application/json" },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                if (tmdbRes.ok) {
                    const tmdbData = await tmdbRes.json();
                    const match = tmdbData.results?.[0];
                    if (match && match.poster_path) {
                        const posterUrl = `https://image.tmdb.org/t/p/w500${match.poster_path}`;
                        const tmdbImgRes = await tryFetchImage(posterUrl, {}, 3500);
                        if (tmdbImgRes) return tmdbImgRes;
                    }
                }
            } catch (e) {}
        }

        // 5b. Automated High-Definition Metadata Artwork Fallback (iTunes Media API)
        if (title) {
            try {
                let cleanTitle = title.replace(/\(\d{4}\)/g, "").trim();
                if ((type === "episode" || type === "show") && cleanTitle.includes(" - ")) {
                    cleanTitle = cleanTitle.split(" - ")[0].trim();
                }
                const itunesEntity = type === "episode" || type === "show" ? "tvSeason" : (type === "track" ? "song" : "movie");
                const itunesMedia = type === "episode" || type === "show" ? "tvShow" : (type === "track" ? "music" : "movie");
                
                const itunesSearchUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(`${cleanTitle} ${year}`.trim())}&media=${itunesMedia}&entity=${itunesEntity}&limit=1`;
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 3000);
                const itunesRes = await fetch(itunesSearchUrl, { 
                    headers: { "User-Agent": "DomsHomeLab/1.0" },
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
                "Content-Security-Policy": "sandbox; default-src 'none'",
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "private, max-age=3600"
            }
        });

    } catch (e: any) {
        const svg = generateFallbackPosterSvg("Poster", "");
        return new NextResponse(svg, {
            headers: {
                "Content-Type": "image/svg+xml",
                "Content-Security-Policy": "sandbox; default-src 'none'",
                "X-Content-Type-Options": "nosniff",
                "Cache-Control": "private, no-store"
            }
        });
    }
}

