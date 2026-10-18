# ==========================================
# MoneyLens Frontend - Production Dockerfile
# Multi-stage build with Vite & Nginx
# ==========================================

# Stage 1: Build Vite React application
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first for efficient layer caching
COPY package*.json ./
RUN npm ci

# Copy source code and build config
COPY . .

# Set API base URL to /api/v1 for same-site proxying via Nginx
ARG VITE_API_BASE_URL=/api/v1
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

# Run production build
RUN npm run build

# Stage 2: Serve static build via hardened Nginx
FROM nginx:1.25-alpine

# Install curl for container healthcheck
RUN apk add --no-cache curl

# Copy custom Nginx configuration with SPA fallback and /api/ reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Health check probe
HEALTHCHECK --interval=10s --timeout=5s --start-period=5s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
