# ==========================================
# STAGE 1: Dependencies & Prisma Build
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Batasi alokasi memory agar tidak membekukan (freeze) VPS RAM rendah
ENV NODE_OPTIONS="--max-old-space-size=1536"

# Install system dependencies needed for native modules
RUN apk add --no-cache libc6-compat openssl

# Copy package manifests & prisma schema first for caching
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies including dev for prisma generate
RUN npm ci

# Generate Prisma Client
RUN npx prisma generate

# ==========================================
# STAGE 2: Production Standalone Runner
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Security: Jalankan sebagai non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 appuser

# Copy built node_modules and Prisma Client from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma

# Copy application source code
COPY --chown=appuser:nodejs package*.json ./
COPY --chown=appuser:nodejs server.js db.js ./
COPY --chown=appuser:nodejs src ./src
COPY --chown=appuser:nodejs css ./css
COPY --chown=appuser:nodejs img ./img
COPY --chown=appuser:nodejs index.html login.html manifest.json app.js ./

# Create barcode directory with proper write permissions for non-root user
RUN mkdir -p /app/barcode && chown -R appuser:nodejs /app/barcode

USER appuser

EXPOSE 3000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/stats || exit 1

CMD ["node", "server.js"]

