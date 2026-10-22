import packageJson from "../../package.json";

export interface VersionInfo {
    version: string;
    branch: string;
    commitSha: string;
    commitShortSha: string;
    buildNumber: string;
    buildTimestamp: string;
    channel: "beta" | "stable" | "dev";
    isBeta: boolean;
    isStable: boolean;
    displayBadge: string;
    fullDisplay: string;
    workflowUrl?: string;
    dockerImageTag: string;
}

/**
 * Resolves comprehensive build and branch telemetry.
 * Safe to call on both client and server components.
 */
export function getBuildTelemetry(): VersionInfo {
    const rawVersion = process.env.NEXT_PUBLIC_PORTALARR_VERSION || packageJson.version || "1.3.3";
    
    // Resolve branch: environment variable -> fallback to version string hints
    let rawBranch = (process.env.NEXT_PUBLIC_GIT_BRANCH || process.env.GIT_BRANCH || "").trim();
    if (!rawBranch) {
        if (rawVersion.includes("beta")) {
            rawBranch = "main";
        } else if (process.env.NODE_ENV === "production") {
            rawBranch = "stable";
        } else {
            rawBranch = "dev";
        }
    }
    const branch = rawBranch.toLowerCase();

    // Determine channel: when branch is explicitly "stable", it is always production and strips any -beta suffix
    const isStable = branch === "stable" || (!rawVersion.includes("beta") && !rawVersion.includes("dev") && branch !== "main");
    const isBeta = !isStable && (branch === "main" || branch.includes("beta") || rawVersion.includes("beta"));
    const version = isStable ? rawVersion.replace(/-beta(\.\d+)?$/i, "") : rawVersion;
    const channel: "beta" | "stable" | "dev" = isBeta ? "beta" : isStable ? "stable" : "dev";

    // Git commit hash
    const fullSha = (process.env.NEXT_PUBLIC_GIT_SHA || process.env.GIT_SHA || "dev").trim();
    const commitShortSha = fullSha.length > 7 ? fullSha.substring(0, 7) : fullSha;

    // Workflow build number
    const buildNumber = (process.env.NEXT_PUBLIC_BUILD_NUMBER || process.env.BUILD_NUMBER || "").trim();

    // Timestamp
    const buildTimestamp = (process.env.NEXT_PUBLIC_BUILD_TIMESTAMP || process.env.PORTALARR_BUILD_TIMESTAMP || "").trim();

    // Format badge text
    const displayBadge = isBeta 
        ? `BETA • v${version}`
        : isStable 
        ? `PROD • v${version}`
        : `DEV • v${version}`;

    // Full display
    const buildPart = buildNumber ? ` #${buildNumber}` : "";
    const shaPart = commitShortSha !== "dev" && commitShortSha !== "latest" ? ` (${commitShortSha})` : "";
    const fullDisplay = `${isBeta ? "Beta" : isStable ? "Prod" : "Dev"} v${version} [${branch}${buildPart}${shaPart}]`;

    const dockerImageTag = isBeta 
        ? "ghcr.io/plexd281knilb/portalarr:main" 
        : "ghcr.io/plexd281knilb/portalarr:stable";

    const workflowUrl = buildNumber 
        ? `https://github.com/plexd281knilb/portalarr/actions` 
        : undefined;

    return {
        version,
        branch,
        commitSha: fullSha,
        commitShortSha,
        buildNumber,
        buildTimestamp,
        channel,
        isBeta,
        isStable,
        displayBadge,
        fullDisplay,
        workflowUrl,
        dockerImageTag
    };
}
