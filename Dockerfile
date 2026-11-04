# ==========================================
# Stage 1: Build & Assets
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy root dependency manifests
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (including devDependencies for tsc)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build server
COPY src ./src
RUN npm run build

# Copy and build landing page
COPY landing/package*.json ./landing/
RUN npm --prefix landing ci
COPY landing ./landing
RUN npm --prefix landing run build

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Install curl for docker healthcheck
RUN apk add --no-cache curl

# Copy root dependency manifests and install production-only dependencies
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy Prisma schema and generated client from builder
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

# Copy built server from builder
COPY --from=builder /app/dist ./dist

# Copy static assets and built landing page
COPY public ./public
COPY --from=builder /app/landing/dist ./landing/dist

# Security: Run as unprivileged node user
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/src/server.js"]

