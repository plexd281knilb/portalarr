# Base image definition - uses AWS Public ECR Docker Library mirror to eliminate Docker Hub anonymous 429 rate limits
ARG BASE_IMAGE=public.ecr.aws/docker/library/node:20-bookworm-slim

# 1. Install dependencies
FROM ${BASE_IMAGE} AS deps
# Install dependencies required for Prisma engines
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# 2. Builder stage
FROM ${BASE_IMAGE} AS builder
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
FROM ${BASE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# CRITICAL: Install libraries required for Prisma engines, Calibre for EPUB sanitation, Font packages for Kometa poster overlay rendering, and ffmpeg/yt-dlp for placeholder trailers
RUN apt-get update && apt-get install -y openssl calibre bash ffmpeg curl python3 fontconfig fonts-dejavu-core fonts-liberation fonts-freefont-ttf && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp && \
    rm -rf /var/lib/apt/lists/*

# CRITICAL: Install Prisma CLI globally. 
# This is the most reliable way to ensure the 'prisma' command is in the PATH
# and that all of its own dependencies are correctly satisfied for migrations.
RUN npm install -g prisma@6.2.1

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid 1001 -m nextjs

# Create default data directory with nextjs permissions
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Copy standalone build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# Copy entrypoint script and ensure executable
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Automatically create and initialize database on new installs before running server
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
