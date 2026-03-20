# 1. Install dependencies
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl python3 make g++
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

# 2. Rebuild the source code
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

RUN npm install -g prisma@6
RUN npx prisma generate

# Tell Docker exactly where the database is for the build process
ENV DATABASE_URL="file:./dev.db"

# --- FIX: Provide a placeholder for the build phase ---
ENV JWT_SECRET="placeholder-for-build-purposes-only"

RUN npx prisma migrate deploy
RUN npm run build

# 3. Production image
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN npm install -g prisma@6

# Copy the standalone build artifacts
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

ENV PORT 3000
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]