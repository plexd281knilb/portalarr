import type { NextConfig } from "next";
import { networkInterfaces } from "os";

// --- HELPER: AUTO-DETECT LOCAL IPS ---
function getLocalIps() {
  const nets = networkInterfaces();
  const results: string[] = ["localhost:3000", "127.0.0.1:3000"]; 
  const rawIps: string[] = ["localhost", "127.0.0.1"];

  // Add custom origins from environment if provided
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",").forEach(origin => {
        results.push(origin.trim());
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

const nextConfig: NextConfig = {
  output: "standalone",
  
  // --- THE FIX FROM YOUR CONSOLE LOGS ---
  // Tells Next.js to stop blocking your local network IP
  allowedDevOrigins: rawIps,

  // ... top half of your config stays the same ...
  
  experimental: {
    serverActions: {
      allowedOrigins: allowedOrigins,
    },
  },
  
  // ADD THIS CRITICAL LINE TO FIX THE DOCKER BUILD:
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