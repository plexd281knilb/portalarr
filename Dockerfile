# 1. Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

# 2. Builder stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy node_modules from deps
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Generate Prisma Client using the local pinned binary
RUN ./node_modules/.bin/prisma generate

# Build environment variables
ENV DATABASE_URL="file:./prisma/dev.db"
ENV NEXT_TELEMETRY_DISABLED=1

# Build the application
RUN npm run build

# 3. Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN apk add --no-cache openssl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy standalone build artifacts
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

# CRITICAL: We need the prisma CLI in the final image for migrations.
# Next.js standalone doesn't include devDependencies like the prisma CLI.
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run migrations using the pinned prisma version. 
# Using npx with an explicit version ensures we use 6.2.1 even if the local path is tricky.
CMD ["sh", "-c", "npx prisma@6.2.1 migrate deploy && node server.js"]
