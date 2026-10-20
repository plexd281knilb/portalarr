const fs = require("fs");
const path = require("path");

// Self-installer flag
if (process.argv[2] === "--install") {
    try {
        const hookDir = path.resolve(__dirname, "..", ".git", "hooks");
        if (fs.existsSync(hookDir)) {
            const hookFile = path.join(hookDir, "commit-msg");
            const hookContent = `#!/bin/sh\nnode scripts/git-commit-msg-hook.js "$1"\n`;
            fs.writeFileSync(hookFile, hookContent, { mode: 0o755 });
            console.log("✅ Git commit-msg hook installed successfully.");
        }
    } catch (e) {
        console.warn("⚠️ Failed to install git hook:", e.message);
    }
    process.exit(0);
}

const msgFile = process.argv[2];
if (!msgFile || !fs.existsSync(msgFile)) {
    process.exit(0);
}

try {
    const pkgPath = path.resolve(__dirname, "..", "package.json");
    if (!fs.existsSync(pkgPath)) {
        process.exit(0);
    }
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
    const version = pkg.version;
    if (!version) {
        process.exit(0);
    }

    const versionTag = `v${version}`;
    const rawContent = fs.readFileSync(msgFile, "utf8");
    const lines = rawContent.split(/\r?\n/);
    const firstLine = lines[0] || "";

    // If commit message already contains version tag or clean version, leave it as is
    if (firstLine.includes(versionTag) || firstLine.includes(`[v${version}]`) || firstLine.includes(`(${version})`)) {
        process.exit(0);
    }

    // Ignore automated merge commits
    if (firstLine.startsWith("Merge branch ") || firstLine.startsWith("Merge remote-tracking branch ") || firstLine.startsWith("Merge pull request ")) {
        process.exit(0);
    }

    // Append (vX.Y.Z) to the summary line
    lines[0] = `${firstLine.trim()} (${versionTag})`;
    fs.writeFileSync(msgFile, lines.join("\n"), "utf8");
} catch (err) {
    // Fail-open so commit is not blocked
    console.warn("[commit-msg-hook] Note:", err.message);
}
