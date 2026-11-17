import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getIptvSettings } from "@/lib/iptv/provider-vault";
import { ensureDefaultIptvProfiles } from "@/lib/iptv/dispatcharr-client";
import { validateClientIp } from "@/lib/security";

function escapeXml(val: string | number | null | undefined): string {
    return String(val ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

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

        if (
            !userToken ||
            userToken.isRevoked ||
            (userToken.expiresAt && userToken.expiresAt.getTime() <= Date.now()) ||
            !userToken.user ||
            userToken.user.role !== "ADMIN" ||
            userToken.user.status !== "APPROVED"
        ) {
            return new NextResponse("Forbidden: Standalone EPG feeds are restricted to active administrators", { status: 403 });
        }

        const settings = await getIptvSettings();
        if (settings.enabled === false) {
            return new NextResponse("Forbidden: IPTV Hub is disabled", { status: 403 });
        }

        const clientIp = validateClientIp(req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || req.headers.get("x-forwarded-for"));
        await prisma.iptvUserToken.update({
            where: { id: userToken.id },
            data: { lastAccessIp: clientIp, lastAccessAt: new Date() }
        }).catch(() => {});

        const channels = await prisma.iptvChannel.findMany({
            where: { isActive: true },
            orderBy: [{ channelNumber: "asc" }, { name: "asc" }]
        });

        const xmlLines: string[] = [
            `<?xml version="1.0" encoding="UTF-8"?>`,
            `<!DOCTYPE tv SYSTEM "xmltv.dtd">`,
            `<tv generator-info-name="DomsHomeLab IPTV Hub v1.5" generator-info-url="https://domshomelab.com">`
        ];

        for (const ch of channels) {
            const id = escapeXml(ch.xmltvId || ch.callsign || ch.name);
            xmlLines.push(`  <channel id="${id}">`);
            xmlLines.push(`    <display-name>${escapeXml(ch.name)}</display-name>`);
            if (ch.channelNumber) {
                xmlLines.push(`    <display-name>${escapeXml(ch.channelNumber)}</display-name>`);
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
        return new NextResponse(`Error generating XMLTV: ${escapeXml(err?.message || "Unknown error")}`, { status: 500 });
    }
}
