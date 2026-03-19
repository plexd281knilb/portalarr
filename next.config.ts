import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// --- HELPER: AUTO-DETECT LOCAL IPS ---
function getLocalIps() {
  const nets = networkInterfaces();
  const results: string[] = ["localhost:3000", "127.0.0.1:3000"]; 
  const rawIps: string[] = ["localhost", "127.0.0.1"];

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(`${net.address}:3000`);
        rawIps.push(net.address); // Capture just the IP for dev origins
      }
    }
  }
  return { results, rawIps };
}

const { results: allowedOrigins, rawIps } = getLocalIps();
console.log("✅ Allowed Origins Auto-Detected:", allowedOrigins);

const nextConfig: NextConfig = {
  output: "standalone",
  // CRITICAL FIX: Stops Turbopack from breaking on Windows symlinks
  serverExternalPackages: ["better-sqlite3", "@prisma/client"], 
  
  // --- THE FIX FROM YOUR CONSOLE LOGS ---
  // Tells Next.js to stop blocking your local network IP
  allowedDevOrigins: rawIps,

  experimental: {
    serverActions: {
      allowedOrigins: allowedOrigins,
    },
  },
  
  webpack: (config, context) => {
    config.watchOptions = {
      poll: 1000, 
      aggregateTimeout: 300,
    }
    return config
  },
};

export default nextConfig;