# 1. Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
# Install all dependencies (including devDependencies) so we can build
RUN npm install

# 2. Rebuild the source code
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# FIX: Install Prisma globally to guarantee the binary exists and is the right version
RUN npm install -g prisma@5.22.0
RUN prisma generate

# Build Next.js
RUN npm run build

# 3. Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# FIX: Install Prisma globally in the runner too, so we can run migrations
RUN npm install -g prisma@5.22.0

# Copy the standalone build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# FIX: Run prisma directly (since it is global now)
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]