# ==========================================
# Stage 1: Build & Assets
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Enable Corepack and prepare exact pnpm declared in package.json
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate

# Copy root dependency manifests
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./

# Install root dependencies using frozen lockfile
RUN pnpm config set ignore-scripts true && pnpm install --frozen-lockfile

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source code and build server
COPY src ./src
RUN pnpm run build

# Copy and build landing page using its dedicated package-lock.json
COPY landing/package*.json ./landing/
RUN npm --prefix landing ci
COPY landing ./landing
RUN npm --prefix landing run build

# Prune devDependencies to keep only production dependencies
RUN pnpm prune --prod

# ==========================================
# Stage 2: Production Runtime
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV WHATSAPP_AUTH_DIR=/app/baileys_auth

# Install curl for docker healthcheck
RUN apk add --no-cache curl

# Create WhatsApp auth directory and assign permissions to unprivileged node user
RUN mkdir -p /app/baileys_auth && chown -R node:node /app

# Copy production node_modules from builder with node ownership
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Copy Prisma schema and generated client from builder
COPY --from=builder --chown=node:node /app/prisma ./prisma

# Copy built server from builder
COPY --from=builder --chown=node:node /app/dist ./dist

# Copy static assets and built landing page
COPY --chown=node:node public ./public
COPY --from=builder --chown=node:node /app/landing/dist ./landing/dist

# Ensure runtime directory permissions
RUN chown -R node:node /app

# Security: Run as unprivileged node user
USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

CMD ["node", "dist/src/server.js"]
