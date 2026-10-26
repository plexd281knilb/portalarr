import type { NextConfig } from "next";
import { networkInterfaces, cpus } from "os";
import { execSync } from "child_process";
import packageJson from "./package.json";

// --- HELPER: AUTO-DETECT LOCAL IPS ---
function getLocalIps() {
  const nets = networkInterfaces();
  const results: string[] = ["*", "localhost:3000", "127.0.0.1:3000", "localhost", "127.0.0.1"]; 
  const rawIps: string[] = ["*", "localhost", "127.0.0.1"];

  // Add custom origins from environment if provided
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",").forEach(origin => {
        const clean = origin.trim();
        if (clean) results.push(clean);
    });
  }

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(`${net.address}:3000`);
        results.push(`${net.address}:3001`); // Common Unraid default
        results.push(`${net.address}`);      // Standard port 80
        rawIps.push(net.address); 
      }
    }
  }
  return { results, rawIps };
}

const { results: allowedOrigins, rawIps } = getLocalIps();
console.log("✅ Allowed Origins Auto-Detected:", allowedOrigins);

const buildTimestamp = new Date().toISOString();

function getGitMetadata() {
  let branch = (process.env.GIT_BRANCH || process.env.NEXT_PUBLIC_GIT_BRANCH || "").trim();
  let sha = (process.env.GIT_SHA || process.env.NEXT_PUBLIC_GIT_SHA || "").trim();
  const buildNumber = (process.env.BUILD_NUMBER || process.env.NEXT_PUBLIC_BUILD_NUMBER || "").trim();

  try {
    if (!branch) {
      branch = execSync("git rev-parse --abbrev-ref HEAD", { stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
    }
  } catch {}

  try {
    if (!sha) {
      sha = execSync("git rev-parse --short HEAD", { stdio: ["pipe", "pipe", "ignore"] }).toString().trim();
    }
  } catch {}

  if (!branch) {
    branch = packageJson.version.includes("beta") ? "main" : "stable";
  }

  return { branch, sha, buildNumber };
}

const gitMeta = getGitMetadata();
const availableCores = Math.max(2, cpus().length - 1);

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  env: {
    PORTALARR_BUILD_TIMESTAMP: buildTimestamp,
    PORTALARR_BUILD_VERSION: packageJson.version,
    NEXT_PUBLIC_PORTALARR_VERSION: packageJson.version,
    NEXT_PUBLIC_GIT_BRANCH: gitMeta.branch,
    NEXT_PUBLIC_GIT_SHA: gitMeta.sha,
    NEXT_PUBLIC_BUILD_NUMBER: gitMeta.buildNumber,
    NEXT_PUBLIC_BUILD_TIMESTAMP: buildTimestamp,
  },
  
  // Tells Next.js to stop blocking your local network IP
  allowedDevOrigins: rawIps,
  
  experimental: {
    cpus: availableCores,
    optimizePackageImports: [
      "lucide-react",
      "date-fns",
      "@radix-ui/react-icons",
      "rehype-raw",
      "remark-gfm",
    ],
    serverActions: {
      allowedOrigins: allowedOrigins,
    },
  },
  
  turbopack: {}, 
  
  webpack: (config, context) => {
    config.watchOptions = {
      poll: 1000, 
      aggregateTimeout: 300,
    }
    return config
  },
};

export default nextConfig;
