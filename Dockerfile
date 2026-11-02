# TeacherDox — Multi-Tenant Docker Image
# Build: docker build -t teacherdox:latest .
# Run: docker run -p 3000:3000 --env-file .env teacherdox:latest

FROM node:20-alpine AS base

# Install system dependencies
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    vips-dev \
    postgresql-client \
    redis \
    curl \
    bash

# Create app user
RUN addgroup -g 1000 -S teacherdox && \
    adduser -u 1000 -S teacherdox -G teacherdox

WORKDIR /app

# Copy package files
COPY package*.json ./

# ==================== DEPENDENCIES ====================
FROM base AS deps
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force

# ==================== BUILD ====================
FROM base AS builder
COPY package*.json ./
RUN npm ci --ignore-scripts

COPY . .
RUN npm run build 2>/dev/null || echo "No build script, skipping"

# ==================== PRODUCTION ====================
FROM base AS production

# Copy production dependencies
COPY --from=deps /app/node_modules ./node_modules

# Copy application code
COPY --from=builder /app .

# Create necessary directories
RUN mkdir -p /app/logs /app/tmp /app/uploads && \
    chown -R teacherdox:teacherdox /app

# Switch to non-root user
USER teacherdox

# Environment
ENV NODE_ENV=production
ENV PORT=3000
ENV TZ=Asia/Kolkata

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Expose port
EXPOSE 3000

# Start command
CMD ["node", "index.js"]