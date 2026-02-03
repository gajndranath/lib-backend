# Multi-stage build for optimized production image
FROM node:18-alpine AS base
WORKDIR /app

# ============================================================================
# DEPENDENCIES STAGE
# ============================================================================
FROM base AS dependencies
COPY package*.json ./
RUN npm ci --only=production && \
    npm cache clean --force

# ============================================================================
# PRODUCTION STAGE
# ============================================================================
FROM base AS production

# Install dumb-init to handle signals properly
RUN apk add --no-cache dumb-init curl

# Set environment
ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=1024

# Copy production node modules
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create necessary directories with proper permissions
RUN mkdir -p logs && \
    chmod -R 755 logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Use dumb-init to handle signals
ENTRYPOINT ["/sbin/dumb-init", "--"]

# Start application
CMD ["node", "src/index.js"]
