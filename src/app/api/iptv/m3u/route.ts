import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getIptvSettings } from "@/lib/iptv/provider-vault";
import { ensureDefaultIptvProfiles } from "@/lib/iptv/dispatcharr-client";
import { validateClientIp } from "@/lib/security";

function sanitizeM3uAttr(val: string | null | undefined): string {
    return String(val || "")
        .replace(/[\r\n]+/g, " ")
        .replace(/"/g, "'")
        .trim();
}

export async function GET(req: NextRequest) {
    try {
        await ensureDefaultIptvProfiles();
        const { searchParams } = new URL(req.url);
        const token = (searchParams.get("token") || "").trim();
        const profileParam = (searchParams.get("profile") || "").trim().toLowerCase();

        if (!token) {
            return new NextResponse("#EXTM3U\n#EXTINF:-1,Unauthorized: Missing IPTV Token\nhttp://127.0.0.1/unauthorized.ts\n", {
                status: 401,
                headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8" }
            });
        }

        const userToken = await prisma.iptvUserToken.findUnique({
            where: { token },
            include: { user: true, profile: true }
        });

        if (
            !userToken ||
            userToken.isRevoked ||
            (userToken.expiresAt && userToken.expiresAt.getTime() <= Date.now()) ||
            !userToken.user
        ) {
            return new NextResponse("#EXTM3U\n#EXTINF:-1,Forbidden: Invalid, Expired, or Revoked Token\nhttp://127.0.0.1/revoked.ts\n", {
                status: 403,
                headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8" }
            });
        }

        if (userToken.user.role !== "ADMIN" || userToken.user.status !== "APPROVED") {
            return new NextResponse("#EXTM3U\n#EXTINF:-1,Access Denied: Standalone M3U streaming is restricted to active administrators\nhttp://127.0.0.1/denied.ts\n", {
                status: 403,
                headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8" }
            });
        }

        const settings = await getIptvSettings();
        if (settings.enabled === false) {
            return new NextResponse("#EXTM3U\n#EXTINF:-1,Service Disabled\nhttp://127.0.0.1/disabled.ts\n", {
                status: 403,
                headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8" }
            });
        }

        // If token is pinned to a profile, prevent bypassing it via ?profile=all
        const pinnedSlug = userToken.profile?.slug?.toLowerCase() || "";
        if (pinnedSlug && profileParam && profileParam !== pinnedSlug) {
            return new NextResponse("#EXTM3U\n#EXTINF:-1,Forbidden: Token is pinned to an assigned profile\nhttp://127.0.0.1/forbidden.ts\n", {
                status: 403,
                headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8" }
            });
        }

        const clientIp = validateClientIp(req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for"));
        await prisma.iptvUserToken.update({
            where: { id: userToken.id },
            data: {
                lastAccessIp: clientIp,
                lastAccessAt: new Date()
            }
        }).catch(() => {});

        const dispatcharrBase = (settings.dispatcharrUrl || "http://192.168.1.87:9191").replace(/\/+$/, "");

        const targetProfileSlug = pinnedSlug || profileParam || "";
        let channels = await prisma.iptvChannel.findMany({
            where: { isActive: true },
            orderBy: [{ channelNumber: "asc" }, { name: "asc" }]
        });

        if (targetProfileSlug && targetProfileSlug !== "all") {
            const prof = await prisma.iptvProfile.findUnique({
                where: { slug: targetProfileSlug },
                include: { profileChannels: { select: { channelId: true } } }
            });
            if (!prof) {
                channels = [];
            } else {
                const allowedIds = new Set(prof.profileChannels.map((pc) => pc.channelId));
                channels = channels.filter((c) => allowedIds.has(c.id));
            }
        }

        const lines: string[] = [
            `#EXTM3U url-tvg="${dispatcharrBase}/output/epg/" x-tvg-url="${dispatcharrBase}/output/epg/"`
        ];

        const origin = req.nextUrl.origin;
        for (const ch of channels) {
            const chNum = ch.channelNumber || 100;
            const safeName = sanitizeM3uAttr(ch.name);
            const tvgId = sanitizeM3uAttr(ch.xmltvId || ch.callsign || ch.name);
            const group = sanitizeM3uAttr(ch.genre || "Live TV");
            let logoVal = ch.logoUrl;
            if (logoVal && logoVal.startsWith("/")) {
                logoVal = `${origin}${logoVal}`;
            }
            const logo = logoVal ? ` tvg-logo="${sanitizeM3uAttr(logoVal)}"` : "";
            lines.push(
                `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${safeName}" tvg-chno="${chNum}"${logo} group-title="${group}",${safeName}`
            );
            lines.push(`${dispatcharrBase}/proxy/ts/stream/${encodeURIComponent(ch.callsign || String(chNum))}`);
        }

        return new NextResponse(lines.join("\n") + "\n", {
            status: 200,
            headers: {
                "Content-Type": "audio/x-mpegurl; charset=utf-8",
                "Content-Disposition": `inline; filename="domshomelab-${(targetProfileSlug || "iptv").replace(/[^a-z0-9_-]/g, "")}.m3u"`
            }
        });
    } catch (err: any) {
        return new NextResponse(`#EXTM3U\n#ERROR: ${sanitizeM3uAttr(err?.message || "Internal Error")}\n`, {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
    }
}
