import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // This prevents Turbopack from bundling Prisma and losing your DB URL
  serverExternalPackages: ["@prisma/client", "@libsql/client"],
};

export default nextConfig;