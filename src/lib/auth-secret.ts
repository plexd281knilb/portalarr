import crypto from "crypto";
import { headers } from "next/headers";

export function getJwtSecret(): Uint8Array {
    const raw = process.env.JWT_SECRET || "build-time-fallback-key";
    return new TextEncoder().encode(raw);
}

export function getEncryptionKey(): string {
    const raw = process.env.JWT_SECRET || "build-time-fallback-key";
    return crypto.createHash('sha256').update(raw).digest('base64').substring(0, 32);
}

export async function getAppUrl(): Promise<string> {
    if (process.env.APP_URL && process.env.APP_URL.trim()) {
        let url = process.env.APP_URL.trim();
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            url = `https://${url}`;
        }
        return url.replace(/\/$/, "");
    }

    try {
        const headerList = await headers();
        const host = headerList.get("x-forwarded-host") || headerList.get("host");
        const proto = headerList.get("x-forwarded-proto") || "http";
        if (host && !host.includes("localhost") && !host.includes("127.0.0.1")) {
            return `${proto}://${host}`;
        }
    } catch (e) {}

    if (process.env.ALLOWED_ORIGINS) {
        const origins = process.env.ALLOWED_ORIGINS.split(",").map(o => o.trim()).filter(Boolean);
        const external = origins.find(o => !o.includes("localhost") && !o.includes("127.0.0.1") && o !== "*");
        if (external) {
            const proto = external.includes("443") || external.includes("https") ? "https" : "http";
            return external.startsWith("http") ? external : `${proto}://${external}`;
        }
    }

    return "https://home.domshomelab.com";
}
