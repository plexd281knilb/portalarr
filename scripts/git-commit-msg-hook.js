const fs = require("fs");
const path = require("path");

/**
 * Ensures the commit message has the active version placed at the front:
 * e.g. "[v3.0.0-beta.2] feat(scope): message"
 */
function formatCommitMessageWithVersion(rawContent, version) {
    if (!rawContent || !version) return rawContent;
    const versionTag = `v${version}`;
    const prefix = `[${versionTag}]`;

    const lines = rawContent.split(/\r?\n/);
    let firstLine = (lines[0] || "").trim();

    // Ignore automated merge commits
    if (
        firstLine.startsWith("Merge branch ") || 
        firstLine.startsWith("Merge remote-tracking branch ") || 
        firstLine.startsWith("Merge pull request ")
    ) {
        return rawContent;
    }

    // Already correctly prefixed at the front
    if (
        firstLine.startsWith(prefix) || 
        firstLine.startsWith(`v${version}:`) ||
        firstLine.startsWith(`[${version}]`)
    ) {
        return rawContent;
    }

    // Strip trailing or misplaced version tags if present
    const escapedVer = version.replace(/\./g, "\\.");
    firstLine = firstLine
        .replace(new RegExp(`\\s*\\([vV]?${escapedVer}\\)$`), "")
        .replace(new RegExp(`\\s*\\[[vV]?${escapedVer}\\]$`), "")
        .trim();

    lines[0] = `${prefix} ${firstLine}`;
    return lines.join("\n");
}

function installGitHook() {
    const hookDir = path.resolve(__dirname, "..", ".git", "hooks");
    if (!fs.existsSync(hookDir)) {
        return false;
    }
    const hookFile = path.join(hookDir, "commit-msg");
    const hookContent = `#!/bin/sh\nnode scripts/git-commit-msg-hook.js "$1"\n`;
    fs.writeFileSync(hookFile, hookContent, { mode: 0o755 });
    return true;
}

// CLI / Hook Execution
if (require.main === module) {
    // Self-installer flag
    if (process.argv[2] === "--install") {
        try {
            if (installGitHook()) {
                console.log("✅ Git commit-msg hook installed successfully.");
            }
        } catch (e) {
            console.warn("⚠️ Failed to install git hook:", e.message);
        }
        process.exit(0);
    }

    const msgFile = process.argv[2];
    if (msgFile && fs.existsSync(msgFile)) {
        try {
            const pkgPath = path.resolve(__dirname, "..", "package.json");
            if (fs.existsSync(pkgPath)) {
                const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
                const version = pkg.version;
                if (version) {
                    const rawContent = fs.readFileSync(msgFile, "utf8");
                    const updated = formatCommitMessageWithVersion(rawContent, version);
                    if (updated !== rawContent) {
                        fs.writeFileSync(msgFile, updated, "utf8");
                    }
                }
            }
        } catch (err) {
            console.warn("[commit-msg-hook] Note:", err.message);
        }
    }
}

module.exports = {
    formatCommitMessageWithVersion,
    installGitHook
};
