import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/app/auth-actions";
import { getIptvSettings, getDecryptedDispatcharrApiKey } from "@/lib/iptv/provider-vault";

export const dynamic = "force-dynamic";

function isSafeDispatcharrUrl(rawUrl: string): boolean {
    try {
        const u = new URL(rawUrl);
        if (u.protocol !== "http:" && u.protocol !== "https:") return false;
        const host = u.hostname.toLowerCase();
        if (host === "169.254.169.254" || host.startsWith("169.254.") || host.startsWith("fe80:") || host === "metadata.google.internal") {
            return false;
        }
        return true;
    } catch {
        return false;
    }
}

export async function GET(
    request: NextRequest,
    context: { params: Promise<{ id: string }> }
) {
    try {
        const user = await getCurrentUser();
        if (!user) {
            return new NextResponse("Unauthorized", { status: 401 });
        }
        if (user.role !== "ADMIN" && user.status !== "APPROVED" && user.status !== "TRIAL") {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const { id } = await context.params;
        if (!id || !/^\d{1,12}$/.test(id.trim())) {
            return new NextResponse("Invalid logo ID", { status: 400 });
        }

        const settings = await getIptvSettings();
        if (user.role !== "ADMIN" && user.status === "TRIAL" && !settings.allowTrialAccess) {
            return new NextResponse("Forbidden", { status: 403 });
        }

        const baseUrl = (settings?.dispatcharrUrl || "http://192.168.1.87:9191").replace(/\/+$/, "");
        if (!isSafeDispatcharrUrl(baseUrl)) {
            return new NextResponse("Invalid Dispatcharr URL configuration", { status: 400 });
        }

        const apiKey = await getDecryptedDispatcharrApiKey();
        const headers: Record<string, string> = { "Accept": "image/png, image/jpeg, image/webp, image/gif" };
        if (apiKey) {
            headers["X-API-Key"] = apiKey;
        }

        const upstreamUrl = `${baseUrl}/api/channels/logos/${id.trim()}/cache/`;
        const res = await fetch(upstreamUrl, {
            headers,
            signal: AbortSignal.timeout(6000)
        }).catch(() => null);

        if (!res || !res.ok) {
            return new NextResponse("Logo not found", { status: 404 });
        }

        const rawContentType = (res.headers.get("content-type") || "image/png").split(";")[0].trim().toLowerCase();
        if (!rawContentType.startsWith("image/") || rawContentType === "image/svg+xml") {
            return new NextResponse("Unsupported media type", { status: 415 });
        }

        const buffer = await res.arrayBuffer();

        return new NextResponse(buffer, {
            status: 200,
            headers: {
                "Content-Type": rawContentType,
                "Cache-Control": "public, max-age=604800, stale-while-revalidate=86400",
                "X-Content-Type-Options": "nosniff"
            }
        });
    } catch {
        return new NextResponse("Error fetching logo", { status: 500 });
    }
}
