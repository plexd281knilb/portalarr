/**
 * Cloudflare Access & Edge Security Policy Paths
 * 
 * Single authoritative source of truth for reverse proxy, WAF, Zero Trust,
 * and Cloudflare Access route rules across Portalarr / DomsHomeLab.
 * 
 * ⚠️ MANDATORY RULE: Whenever a new page route (src/app/.../page.tsx) or API route
 * (src/app/api/.../route.ts) is added, moved, or deleted, update these arrays
 * and verify with scripts/verify-all.ts.
 */

export const CLOUDFLARE_BYPASS_PATHS: string[] = [
    "/",
    "/hub*",
    "/login",
    "/join*",
    "/invite*",
    "/pending",
    "/discover*",
    "/requests*",
    "/library*",
    "/guides*",
    "/profile*",
    "/beta*",
    "/api/books*",
    "/api/cover*",
    "/api/media/*",
    "/api/libraries*",
    "/api/requests*",
    "/api/stats*",
    "/api/downloads*",
    "/api/speedtest*",
    "/_next/*",
    "/favicon.ico"
];

export const CLOUDFLARE_ADMIN_PATHS: string[] = [
    "/settings*",
    "/admin*",
    "/curation*",
    "/radarr*",
    "/sonarr*",
    "/api/system*",
    "/api/debug*",
    "/api/curation*",
    "/api/users*",
    "/api/books/upload*"
];

/**
 * Test whether a given route path is covered by Cloudflare Bypass policy.
 * Strict Zero-Trust Guard: If a path matches any admin protected route,
 * it is NEVER bypassed.
 */
export function matchesCloudflareBypass(path: string): boolean {
    if (matchesCloudflareAdmin(path)) {
        return false;
    }

    const cleanPath = path.split("?")[0].replace(/\/$/, "") || "/";
    return CLOUDFLARE_BYPASS_PATHS.some((pattern) => {
        if (pattern === cleanPath) return true;
        if (pattern.endsWith("*")) {
            const prefix = pattern.slice(0, -1).replace(/\/$/, "");
            return cleanPath === prefix || cleanPath.startsWith(prefix + "/");
        }
        return false;
    });
}

/**
 * Test whether a given route path is covered by Cloudflare Admin Protected policy
 */
export function matchesCloudflareAdmin(path: string): boolean {
    const cleanPath = path.split("?")[0].replace(/\/$/, "") || "/";
    return CLOUDFLARE_ADMIN_PATHS.some((pattern) => {
        if (pattern === cleanPath) return true;
        if (pattern.endsWith("*")) {
            const prefix = pattern.slice(0, -1).replace(/\/$/, "");
            return cleanPath === prefix || cleanPath.startsWith(prefix + "/");
        }
        return false;
    });
}

