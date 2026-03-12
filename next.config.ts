import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// --- HELPER: AUTO-DETECT LOCAL IPS ---
function getLocalIps() {
  const nets = networkInterfaces();
  const results: string[] = ["localhost:3000", "127.0.0.1:3000"]; 

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]!) {
      if (net.family === 'IPv4' && !net.internal) {
        results.push(`${net.address}:3000`);
      }
    }
  }
  return results;
}

const allowedOrigins = getLocalIps();
console.log("✅ Allowed Origins Auto-Detected:", allowedOrigins);

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    // instrumentationHook: true,  <--- REMOVE OR COMMENT OUT THIS LINE
    serverActions: {
      allowedOrigins: allowedOrigins,
    },
  },
};

export default nextConfig;