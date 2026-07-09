# 1. Install dependencies
FROM node:20-bookworm-slim AS deps
# Install dependencies required for Prisma engines
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# 2. Builder stage
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client using the local binary
RUN ./node_modules/.bin/prisma generate

# Build environment variables
ENV DATABASE_URL="file:./prisma/dev.db"
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# 3. Production image
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# CRITICAL: Install libraries required for Prisma engines and Calibre for EPUB sanitation
RUN apt-get update && apt-get install -y openssl calibre bash && rm -rf /var/lib/apt/lists/*

# CRITICAL: Install Prisma CLI globally. 
# This is the most reliable way to ensure the 'prisma' command is in the PATH
# and that all of its own dependencies are correctly satisfied for migrations.
RUN npm install -g prisma@6.2.1

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid 1001 -m nextjs

# Copy standalone build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations using the globally installed prisma CLI
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]
