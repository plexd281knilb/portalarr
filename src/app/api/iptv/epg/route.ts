import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { ensureDefaultIptvProfiles } from "@/lib/iptv/dispatcharr-client";

export async function GET(req: NextRequest) {
    try {
        await ensureDefaultIptvProfiles();
        const { searchParams } = new URL(req.url);
        const token = (searchParams.get("token") || "").trim();

        if (!token) {
            return new NextResponse("Unauthorized: Missing IPTV token", { status: 401 });
        }

        const userToken = await prisma.iptvUserToken.findUnique({
            where: { token },
            include: { user: true }
        });

        if (!userToken || userToken.isRevoked || !userToken.user) {
            return new NextResponse("Forbidden: Invalid or revoked token", { status: 403 });
        }

        const channels = await prisma.iptvChannel.findMany({
            where: { isActive: true },
            orderBy: [{ channelNumber: "asc" }, { name: "asc" }]
        });

        const xmlLines: string[] = [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<!DOCTYPE tv SYSTEM "xmltv.dtd">`,
            `<tv generator-info-name="DomsHomeLab IPTV Hub v1.4" generator-info-url="https://domshomelab.com">`
        ];

        for (const ch of channels) {
            const id = ch.xmltvId || ch.callsign || ch.name;
            xmlLines.push(`  <channel id="${id}">`);
            xmlLines.push(`    <display-name>${ch.name.replace(/&/g, "&amp;")}</display-name>`);
            if (ch.channelNumber) {
                xmlLines.push(`    <display-name>${ch.channelNumber}</display-name>`);
            }
            xmlLines.push(`  </channel>`);
        }

        xmlLines.push(`</tv>`);

        return new NextResponse(xmlLines.join("\n"), {
            status: 200,
            headers: {
                "Content-Type": "application/xml; charset=utf-8"
            }
        });
    } catch (err: any) {
        return new NextResponse(`Error generating XMLTV: ${err?.message || "Unknown error"}`, { status: 500 });
    }
}
