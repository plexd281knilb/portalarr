import { NextRequest, NextResponse } from "next/server";
import { getIptvSettings, getDecryptedDispatcharrApiKey } from "@/lib/iptv/provider-vault";

export const dynamic = "force-dynamic";

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await context.params;
        if (!id) {
            return new NextResponse("Logo ID required", { status: 400 });
        }

        const settings = await getIptvSettings();
        const baseUrl = (settings?.dispatcharrUrl || "http://192.168.1.87:9191").replace(/\/+$/, "");
        const apiKey = await getDecryptedDispatcharrApiKey();

        const headers: Record<string, string> = { "Accept": "image/*, */*" };
        if (apiKey) {
            headers["X-API-Key"] = apiKey;
        }

        const upstreamUrl = `${baseUrl}/api/channels/logos/${id}/cache/`;
        const res = await fetch(upstreamUrl, {
            headers,
            signal: AbortSignal.timeout(6000)
        }).catch(() => null);

        if (!res || !res.ok) {
            return new NextResponse("Logo not found", { status: 404 });
        }

        const contentType = res.headers.get("content-type") || "image/png";
        const buffer = await res.arrayBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": contentType,
                "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
                "X-Content-Type-Options": "nosniff"
            }
        });
    } catch {
        return new NextResponse("Error fetching logo", { status: 500 });
    }
}
