# 1. Install dependencies
FROM node:20-alpine AS deps
# ADDED: python3, make, and g++ are required to compile better-sqlite3 on Alpine
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
# Install all dependencies (including devDependencies) so we can build
RUN npm install

# 2. Rebuild the source code
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# UPDATED: Install Prisma 6 globally to match our package.json update
RUN npm install -g prisma@6
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

# UPDATED: Install Prisma 6 globally in the runner too
RUN npm install -g prisma@6

# Copy the standalone build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma

USER root

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Run prisma migrations on startup, then boot the server
CMD ["sh", "-c", "prisma migrate deploy && node server.js"]