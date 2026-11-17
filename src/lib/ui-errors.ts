/**
 * Maps raw runtime/Next.js error objects to clear, user-friendly guidance
 * without exposing stack traces, SQLite paths, or internal module details.
 */
export function getFriendlyErrorDisplay(
    error: Error & { digest?: string },
    context: "global" | "profile" = "global"
): { title: string; description: string; digest?: string } {
    const raw = String(error?.message || "").toLowerCase();
    const isNextDigestRedacted =
        raw.includes("an error occurred in the server components render") ||
        raw.includes("omitted in production builds");

    if (raw.includes("unauthorized") || raw.includes("forbidden") || raw.includes("session")) {
        return {
            title: "Session Expired or Access Denied",
            description: "Your session could not be verified for this view. Please sign in again or verify your account permissions.",
            digest: error?.digest
        };
    }

    if (
        raw.includes("fetch failed") ||
        raw.includes("econnrefused") ||
        raw.includes("timed out") ||
        raw.includes("timeout") ||
        raw.includes("network")
    ) {
        return {
            title: "Upstream Media Service Unreachable",
            description: "One of the connected media services took too long to respond. Retry in a moment or inspect service health if this persists.",
            digest: error?.digest
        };
    }

    if (raw.includes("chunkloaderror") || raw.includes("loading chunk") || raw.includes("failed to find server action")) {
        return {
            title: "Portal Updated in Background",
            description: "A newer build of the dashboard is live. Click Try Again to reload fresh assets and continue cleanly.",
            digest: error?.digest
        };
    }

    if (context === "profile") {
        return {
            title: "Account Profile Temporarily Unavailable",
            description: isNextDigestRedacted || !error?.message
                ? "We could not load one or more profile services right now. Retry below, and include the reference ID if you open a support ticket."
                : "We encountered an issue loading your account profile settings. Retry below or return to the dashboard.",
            digest: error?.digest
        };
    }

    return {
        title: "Unable to Load This View",
        description: isNextDigestRedacted || !error?.message
            ? "An unexpected server error interrupted rendering. Retry below, and share the reference ID if the issue persists."
            : "An unexpected issue prevented this page from rendering cleanly. Retry below or return to the dashboard.",
        digest: error?.digest
    };
}
