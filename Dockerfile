# syntax=docker/dockerfile:1
# Base image definition - uses official node:20-bookworm-slim
ARG BASE_IMAGE=node:20-bookworm-slim

# 1. Install dependencies & pre-generate Prisma Client (cached unless package.json or prisma/ changes)
FROM ${BASE_IMAGE} AS deps
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y openssl
WORKDIR /app

COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --prefer-offline --no-audit

COPY prisma ./prisma
RUN ./node_modules/.bin/prisma generate

# 2. Builder stage
FROM ${BASE_IMAGE} AS builder
WORKDIR /app

# Copy cached node_modules (with generated Prisma Client) from deps BEFORE volatile git args
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build environment variables (placed right before build so earlier layers stay 100% cached)
ARG GIT_BRANCH=main
ARG GIT_SHA=dev
ARG BUILD_NUMBER=local
ENV GIT_BRANCH=${GIT_BRANCH}
ENV GIT_SHA=${GIT_SHA}
ENV BUILD_NUMBER=${BUILD_NUMBER}
ENV NEXT_PUBLIC_GIT_BRANCH=${GIT_BRANCH}
ENV NEXT_PUBLIC_GIT_SHA=${GIT_SHA}
ENV NEXT_PUBLIC_BUILD_NUMBER=${BUILD_NUMBER}
ENV DATABASE_URL="file:./prisma/dev.db"
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application with persistent Next.js/Turbopack compiler cache
RUN --mount=type=cache,target=/app/.next/cache \
    npm run build

# 3. Production image (heavy OS packages & global Prisma CLI placed BEFORE volatile git args so they are 100% cached!)
FROM ${BASE_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# CRITICAL: Install libraries required for Prisma engines, Calibre for EPUB sanitation, Font packages for Kometa poster overlay rendering, and ffmpeg/yt-dlp for placeholder trailers
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y openssl calibre bash ffmpeg curl python3 fontconfig fonts-dejavu-core fonts-liberation fonts-freefont-ttf && \
    curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# CRITICAL: Install Prisma CLI globally (cached across all commits)
RUN --mount=type=cache,target=/root/.npm \
    npm install -g prisma@6.2.1 --prefer-offline --no-audit

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid 1001 -m nextjs && \
    mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Inject commit-specific telemetry env vars only after all heavy layers are cached
ARG GIT_BRANCH=main
ARG GIT_SHA=dev
ARG BUILD_NUMBER=local
ENV GIT_BRANCH=${GIT_BRANCH}
ENV GIT_SHA=${GIT_SHA}
ENV BUILD_NUMBER=${BUILD_NUMBER}
ENV NEXT_PUBLIC_GIT_BRANCH=${GIT_BRANCH}
ENV NEXT_PUBLIC_GIT_SHA=${GIT_SHA}
ENV NEXT_PUBLIC_BUILD_NUMBER=${BUILD_NUMBER}

# Copy standalone build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/roadmap.md ./roadmap.md

# Copy entrypoint script AFTER standalone artifacts so it is never overwritten, and enforce 755 permissions
COPY --chmod=755 docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod 755 /app/docker-entrypoint.sh && chown nextjs:nodejs /app/docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Automatically create and initialize database on new installs before running server
ENTRYPOINT ["/bin/sh", "/app/docker-entrypoint.sh"]
CMD ["node", "server.js"]
