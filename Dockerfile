# 1. Install dependencies
# Using a specific alpine version for stability and speed
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
# Use 'npm ci' for faster, more reliable installs in CI environments
RUN npm ci

# 2. Rebuild the source code
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client
# Note: We do this before 'npm run build' to ensure types are ready
RUN npx prisma generate

# Environment variables for build-time (Next.js needs these if used in getStaticProps/Link etc.)
ENV DATABASE_URL="file:./dev.db"
ENV JWT_SECRET="placeholder-for-build-purposes-only"
ENV NEXT_TELEMETRY_DISABLED 1

# Build the application
RUN npm run build

# 3. Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED 1

RUN apk add --no-cache openssl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Only install the prisma binary needed for migrations, not the whole CLI if possible
# Alternatively, use 'npx prisma' in CMD which uses the local version from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy the standalone build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

# Run migrations using the local prisma CLI copied from the builder
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
