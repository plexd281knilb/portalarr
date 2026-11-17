import { headers } from "next/headers";

const SAFE_HOST_RE = /^(?:[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*|\[[0-9a-fA-F:]+\])(?::\d{1,5})?$/;

function getAllowedOriginCandidates(): string[] {
    if (!process.env.ALLOWED_ORIGINS) return [];
    return process.env.ALLOWED_ORIGINS.split(",")
        .map((o) => o.trim())
        .filter((o) => o && o !== "*");
}

export async function getAppUrl(): Promise<string> {
    try {
        const { prisma } = await import("@/lib/prisma");
        const settings = await prisma.settings.findUnique({
            where: { id: "global" },
            select: { appUrl: true }
        });
        if (settings?.appUrl && settings.appUrl.trim()) {
            let url = settings.appUrl.trim();
            if (!url.startsWith("http://") && !url.startsWith("https://")) {
                url = `https://${url}`;
            }
            return url.replace(/\/+$/, "");
        }
    } catch (e) {
        // Fall back if database is not available yet or query fails
    }

    if (process.env.APP_URL && process.env.APP_URL.trim()) {
        let url = process.env.APP_URL.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = `https://${url}`;
        }
        return url.replace(/\/+$/, "");
    }

    const allowedOrigins = getAllowedOriginCandidates();
    const externalAllowed = allowedOrigins.find(
        (o) => !o.includes("localhost") && !o.includes("127.0.0.1")
    );
    if (externalAllowed) {
        const proto = externalAllowed.includes("443") || externalAllowed.includes("https") ? "https" : "http";
        const resolved = externalAllowed.startsWith("http") ? externalAllowed : `${proto}://${externalAllowed}`;
        return resolved.replace(/\/+$/, "");
    }

    try {
        const headerList = await headers();
        const rawHost = (headerList.get("x-forwarded-host") || headerList.get("host") || "").split(",")[0].trim();
        const rawProto = (headerList.get("x-forwarded-proto") || "http").split(",")[0].trim().toLowerCase();
        const safeProto = rawProto === "https" ? "https" : "http";
        if (rawHost && SAFE_HOST_RE.test(rawHost) && !rawHost.includes("localhost") && !rawHost.includes("127.0.0.1")) {
            const hostOnly = rawHost.split(":")[0].toLowerCase();
            if (allowedOrigins.length === 0 || allowedOrigins.some((o) => o.toLowerCase().includes(hostOnly))) {
                return `${safeProto}://${rawHost}`;
            }
        }
    } catch (e) {}

    return "http://localhost:3000";
}
