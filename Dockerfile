# RC Engine -- Production Docker image
# Multi-stage build: compile TypeScript + bundle React, then run on slim Node
#
# Build:   docker build -t rc-engine .
# Run:     docker run -p 3100:3100 --env-file .env rc-engine

# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install dependencies first (cache layer)
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Copy source and build
COPY tsconfig.json ./
COPY src/ src/
COPY web/ web/
COPY knowledge/ knowledge/

# Build backend (TypeScript -> dist/)
RUN npx tsc --project tsconfig.json

# Build frontend (Vite -> web/dist-client/)
RUN npm run web:build

# ── Stage 2: Production ────────────────────────────────────────────────────
FROM node:20-slim AS production

WORKDIR /app

# Install only production dependencies
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# Copy built artifacts
COPY --from=builder /app/dist/ dist/
COPY --from=builder /app/web/dist-client/ web/dist-client/
COPY --from=builder /app/web/server/ web/server/
COPY --from=builder /app/knowledge/ knowledge/

# Create runtime directories
RUN mkdir -p .rc-engine/audit .rc-engine/logs .rc-engine/cache

# Non-root user for security
RUN addgroup --system rcengine && adduser --system --ingroup rcengine rcengine
RUN chown -R rcengine:rcengine /app
USER rcengine

# Environment defaults
ENV NODE_ENV=production
ENV RC_WEB_PORT=3100

EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://localhost:3100/auth/me').then(r => r.ok ? process.exit(0) : process.exit(1)).catch(() => process.exit(1))"

CMD ["node", "web/server/index.js"]
