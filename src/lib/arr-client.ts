import { prisma } from "@/lib/prisma";
import { decryptData } from "@/lib/encryption";
import { logger } from "@/lib/logger";

export function getCleanArrBase(rawUrl: string): string {
    let clean = (rawUrl || "").trim().replace(/\/+$/, "");
    if (!clean.startsWith("http://") && !clean.startsWith("https://")) {
        clean = `http://${clean}`;
    }
    return clean.replace(/\/api(\/v?[123])?$/, "");
}

export function resolveArrEndpoint(rawUrl: string, endpoint: string): string {
    const base = getCleanArrBase(rawUrl);
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    return `${base}${cleanEndpoint}`;
}

export async function getEnabledArrInstancesInternal(type: "radarr" | "sonarr") {
    try {
        const apps = await prisma.mediaApp.findMany({
            where: { type }
        });
        return {
            success: true,
            data: apps.map(app => ({
                id: app.id,
                name: app.name,
                url: app.url,
                externalUrl: app.externalUrl,
                allowedQualityProfileIds: app.allowedQualityProfileIds ? app.allowedQualityProfileIds.split(",").map(s => s.trim()) : [],
                allowedRootFolderIds: app.allowedRootFolderIds ? app.allowedRootFolderIds.split(",").map(s => s.trim()) : [],
                apiKey: decryptData(app.apiKey || "")
            }))
        };
    } catch (e: any) {
        return { success: false, error: e.message };
    }
}

export async function arrApiGet(app: any, endpoint: string) {
    try {
        const targetUrl = resolveArrEndpoint(app.url, endpoint);
        const res = await fetch(targetUrl, {
            headers: {
                "X-Api-Key": app.apiKey,
                "Accept": "application/json"
            },
            signal: AbortSignal.timeout(15000),
            cache: "no-store"
        });
        const text = await res.text();
        if (!res.ok) {
            let errorDetails = text;
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed) && parsed[0]?.errorMessage) {
                    errorDetails = parsed.map(e => e.errorMessage).join(", ");
                }
            } catch (e) {}
            throw new Error(`API GET ${endpoint} failed: ${res.statusText} - ${errorDetails}`);
        }
        try {
            return { success: true, data: JSON.parse(text) };
        } catch (err) {
            throw new Error(`API returned non-JSON. Incorrect URL or proxy issue? (Response: ${text.slice(0, 30)}...)`);
        }
    } catch (e: any) {
        logger.addLog("ERROR", "API", `[arrApiGet] Failed fetching ${endpoint}: ${e.message}`);
        return { success: false, error: e.message };
    }
}

export async function arrApiPost(app: any, endpoint: string, body: any) {
    try {
        const targetUrl = resolveArrEndpoint(app.url, endpoint);
        const res = await fetch(targetUrl, {
            method: "POST",
            headers: {
                "X-Api-Key": app.apiKey,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
            cache: "no-store"
        });
        const text = await res.text();
        if (!res.ok) {
            let errorDetails = text;
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed) && parsed[0]?.errorMessage) {
                    errorDetails = parsed.map(e => e.errorMessage).join(", ");
                }
            } catch (e) {}
            throw new Error(`API POST ${endpoint} failed: ${res.statusText} - ${errorDetails}`);
        }
        try {
            return { success: true, data: JSON.parse(text) };
        } catch (err) {
            throw new Error(`API returned non-JSON. (Response: ${text.slice(0, 30)}...)`);
        }
    } catch (e: any) {
        logger.addLog("ERROR", "API", `[arrApiPost] Failed POST to ${endpoint}: ${e.message}`);
        return { success: false, error: e.message };
    }
}

export async function arrApiPut(app: any, endpoint: string, body: any) {
    try {
        const targetUrl = resolveArrEndpoint(app.url, endpoint);
        const res = await fetch(targetUrl, {
            method: "PUT",
            headers: {
                "X-Api-Key": app.apiKey,
                "Content-Type": "application/json",
                "Accept": "application/json"
            },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
            cache: "no-store"
        });
        const text = await res.text();
        if (!res.ok) {
            let errorDetails = text;
            try {
                const parsed = JSON.parse(text);
                if (Array.isArray(parsed) && parsed[0]?.errorMessage) {
                    errorDetails = parsed.map(e => e.errorMessage).join(", ");
                }
            } catch (e) {}
            throw new Error(`API PUT ${endpoint} failed: ${res.statusText} - ${errorDetails}`);
        }
        try {
            return { success: true, data: JSON.parse(text) };
        } catch (err) {
            throw new Error(`API returned non-JSON. (Response: ${text.slice(0, 30)}...)`);
        }
    } catch (e: any) {
        logger.addLog("ERROR", "API", `[arrApiPut] Failed PUT to ${endpoint}: ${e.message}`);
        return { success: false, error: e.message };
    }
}

export async function arrApiDelete(app: any, endpoint: string) {
    try {
        const targetUrl = resolveArrEndpoint(app.url, endpoint);
        const res = await fetch(targetUrl, {
            method: "DELETE",
            headers: {
                "X-Api-Key": app.apiKey,
                "Accept": "application/json"
            },
            signal: AbortSignal.timeout(15000),
            cache: "no-store"
        });
        if (!res.ok && res.status !== 204) {
            const text = await res.text();
            throw new Error(`API DELETE ${endpoint} failed: ${res.statusText} - ${text}`);
        }
        return { success: true };
    } catch (e: any) {
        logger.addLog("ERROR", "API", `[arrApiDelete] Failed DELETE to ${endpoint}: ${e.message}`);
        return { success: false, error: e.message };
    }
}
