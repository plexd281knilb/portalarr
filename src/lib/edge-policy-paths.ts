/**
 * Cloudflare Access & Edge Security Policy Paths
 * 
 * Single authoritative source of truth for reverse proxy, WAF, Zero Trust,
 * and Cloudflare Access route rules across Portalarr / DomsHomeLab.
 * 
 * ARCHITECTURE:
 * - Admin-Only Paths (11 paths): Explicitly locked down in Cloudflare Access to Dom's admin email.
 * - Open Edge Paths (Bypass / Member / Media Apps): Kept open at Cloudflare's edge with zero
 *   edge barriers; security and role-based permissions (USER, TRIAL, SUPER_USER, ADMIN) are
 *   enforced natively at origin by DomsHomeLab's JWT session middleware and server actions.
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
    "/tickets*",
    "/beta*",
    "/channels*",
    "/api/iptv*",
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

export const CLOUDFLARE_SUPER_USER_PATHS: string[] = [
    "/radarr*",
    "/sonarr*"
];

export const CLOUDFLARE_ADMIN_PATHS: string[] = [
    "/settings*",
    "/admin*",
    "/curation*",
    "/tautulli*",
    "/streams*",
    "/api/admin*",
    "/api/system*",
    "/api/debug*",
    "/api/curation*",
    "/api/users*",
    "/api/books/upload*"
];

/**
 * Test whether a given route path is open at Cloudflare's Edge (bypasses edge blocks)
 * and handled natively by DomsHomeLab session auth.
 * Strict Zero-Trust Guard: If a path matches any admin-protected route, it is NEVER bypassed/open.
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
 * Test whether a given route path is covered by Super User (Media Apps) policy (open at edge, role-gated at origin).
 */
export function matchesCloudflareSuperUser(path: string): boolean {
    const cleanPath = path.split("?")[0].replace(/\/$/, "") || "/";
    return CLOUDFLARE_SUPER_USER_PATHS.some((pattern) => {
        if (pattern === cleanPath) return true;
        if (pattern.endsWith("*")) {
            const prefix = pattern.slice(0, -1).replace(/\/$/, "");
            return cleanPath === prefix || cleanPath.startsWith(prefix + "/");
        }
        return false;
    });
}

/**
 * Test whether a given route path is strictly locked down at Cloudflare's Edge (Admin Protected).
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
