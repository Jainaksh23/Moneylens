# ==========================================
# MoneyLens Backend - Production Dockerfile
# Multi-stage build with non-root security
# ==========================================

# Stage 1: Build TypeScript source
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci

# Copy TypeScript configuration and source
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript to JavaScript in /app/dist
RUN npm run build

# Stage 2: Minimal Production Runner
FROM node:20-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

# Install curl for container health check
RUN apk add --no-cache curl

# Install production dependencies only and clean cache
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# Copy compiled JavaScript dist from builder
COPY --from=builder /app/dist ./dist

# Create necessary directories and set ownership for non-root node user
RUN chown -R node:node /app

# Switch to non-root user
USER node

# Expose backend service port (Render overrides with its own PORT env var)
EXPOSE ${PORT:-5000}

# Container healthcheck using backend readiness probe
# Uses PORT env var so it works both locally (5000) and on Render (dynamic port)
HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:${PORT:-5000}/health/ready || exit 1

CMD ["node", "dist/server.js"]
