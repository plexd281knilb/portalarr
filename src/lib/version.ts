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
    iconKey: "prod" | "beta" | "dev";
    iconSvgPath: string;
    iconPngPath: string;
    faviconIcoPath: string;
    containerIconUrl: string;
}

/**
 * Resolves comprehensive build and branch telemetry.
 * Safe to call on both client and server components.
 */
export function getBuildTelemetry(): VersionInfo {
    const rawVersion = process.env.NEXT_PUBLIC_PORTALARR_VERSION || packageJson.version || "1.3.4";
    
    // Resolve branch: environment variable -> fallback to version string hints
    let rawBranch = (process.env.NEXT_PUBLIC_GIT_BRANCH || process.env.GIT_BRANCH || "").trim();
    if (!rawBranch) {
        if (rawVersion.includes("beta")) {
            rawBranch = "beta";
        } else if (rawVersion.includes("dev")) {
            rawBranch = "dev";
        } else if (process.env.NODE_ENV === "production") {
            rawBranch = "prod";
        } else {
            rawBranch = "dev";
        }
    }
    const branch = rawBranch.toLowerCase();

    // Determine channel:
    // - prod / stable -> Production ("stable" channel, strips any -beta/-dev suffix)
    // - beta (or main with -beta suffix) -> Beta ("beta" channel, prod fixes in testing)
    // - dev (or main) -> Development ("dev" channel, future releases in testing)
    const isStable = branch === "prod" || branch === "stable" || (!rawVersion.includes("beta") && !rawVersion.includes("dev") && branch !== "dev" && branch !== "beta" && branch !== "main");
    const isBeta = !isStable && (branch === "beta" || rawVersion.includes("beta"));
    const version = isStable ? rawVersion.replace(/-(beta|dev)(\.\d+)?$/i, "") : rawVersion;
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

    const tagBranch = branch === "prod" || branch === "stable"
        ? branch
        : branch === "beta" || branch === "dev" || branch === "main"
        ? branch
        : isBeta ? "beta" : isStable ? "prod" : "dev";
    const dockerImageTag = `ghcr.io/plexd281knilb/portalarr:${tagBranch}`;

    const iconKey: "prod" | "beta" | "dev" = isBeta ? "beta" : isStable ? "prod" : "dev";
    const iconSvgPath = `/icons/portalarr-${iconKey}.svg`;
    const iconPngPath = `/icons/portalarr-${iconKey}.png`;
    const faviconIcoPath = `/icons/favicon-${iconKey}.ico`;
    const containerIconUrl = `https://raw.githubusercontent.com/plexd281knilb/portalarr/${iconKey}/public/icons/portalarr-${iconKey}.png`;

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
        dockerImageTag,
        iconKey,
        iconSvgPath,
        iconPngPath,
        faviconIcoPath,
        containerIconUrl
    };
}

/**
 * Blocks automatic outbound emails from running on non-production channels ("dev" or "beta")
 * so mounting a production database or enabling notifications on dev/beta can never send real emails automatically.
 * Returns null only when running on the "stable" (prod) release channel.
 */
export function getNonProdAutomaticEmailBlockReason(): string | null {
    const telemetry = getBuildTelemetry();
    if (telemetry.channel !== "stable") {
        return `Blocked automatic outbound email on non-production "${telemetry.channel}" channel (branch="${telemetry.branch}", v${telemetry.version})`;
    }
    return null;
}
