import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getIptvSettings } from "@/lib/iptv/provider-vault";
import { ensureDefaultIptvProfiles } from "@/lib/iptv/dispatcharr-client";

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

        if (!userToken || userToken.isRevoked || !userToken.user) {
            return new NextResponse("#EXTM3U\n#EXTINF:-1,Forbidden: Invalid or Revoked Token\nhttp://127.0.0.1/revoked.ts\n", {
                status: 403,
                headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8" }
            });
        }

        if (userToken.user.role !== "ADMIN" && !userToken.user.canAccessIptv) {
            return new NextResponse("#EXTM3U\n#EXTINF:-1,Access Denied: IPTV Not Enabled\nhttp://127.0.0.1/denied.ts\n", {
                status: 403,
                headers: { "Content-Type": "audio/x-mpegurl; charset=utf-8" }
            });
        }

        const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "127.0.0.1";
        await prisma.iptvUserToken.update({
            where: { id: userToken.id },
            data: {
                lastAccessIp: clientIp,
                lastAccessAt: new Date()
            }
        }).catch(() => {});

        const settings = await getIptvSettings();
        const dispatcharrBase = (settings.dispatcharrUrl || "http://192.168.1.87:9191").replace(/\/+$/, "");

        const targetProfileSlug = profileParam || userToken.profile?.slug || "";
        let channels = await prisma.iptvChannel.findMany({
            where: { isActive: true },
            orderBy: [{ channelNumber: "asc" }, { name: "asc" }]
        });

        if (targetProfileSlug && targetProfileSlug !== "all") {
            const prof = await prisma.iptvProfile.findUnique({
                where: { slug: targetProfileSlug },
                include: { profileChannels: { select: { channelId: true } } }
            });
            if (prof && prof.profileChannels.length > 0) {
                const allowedIds = new Set(prof.profileChannels.map((pc) => pc.channelId));
                channels = channels.filter((c) => allowedIds.has(c.id));
            }
        }

        const lines: string[] = [
            `#EXTM3U url-tvg="${dispatcharrBase}/output/epg/" x-tvg-url="${dispatcharrBase}/output/epg/"`
        ];

        const origin = request.nextUrl.origin;
        for (const ch of channels) {
            const chNum = ch.channelNumber || 100;
            const tvgId = ch.xmltvId || ch.callsign || ch.name;
            const group = ch.genre || "Live TV";
            let logoVal = ch.logoUrl;
            if (logoVal && logoVal.startsWith("/")) {
                logoVal = `${origin}${logoVal}`;
            }
            const logo = logoVal ? ` tvg-logo="${logoVal}"` : "";
            lines.push(
                `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${ch.name}" tvg-chno="${chNum}"${logo} group-title="${group}",${ch.name}`
            );
            lines.push(`${dispatcharrBase}/proxy/ts/stream/${ch.callsign || chNum}`);
        }

        return new NextResponse(lines.join("\n") + "\n", {
            status: 200,
            headers: {
                "Content-Type": "audio/x-mpegurl; charset=utf-8",
                "Content-Disposition": `inline; filename="domshomelab-${targetProfileSlug || "iptv"}.m3u"`
            }
        });
    } catch (err: any) {
        return new NextResponse(`#EXTM3U\n#ERROR: ${err?.message || "Internal Error"}\n`, {
            status: 500,
            headers: { "Content-Type": "text/plain; charset=utf-8" }
        });
    }
}
