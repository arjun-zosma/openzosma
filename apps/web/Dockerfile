# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Install pnpm globally (project uses pnpm)
RUN npm install -g pnpm

# Copy all package files for dependency resolution
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy all packages and apps
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY turbo.json ./

# Install all dependencies including workspace packages
RUN pnpm install --frozen-lockfile

# Build the web application with standalone output
ENV NEXT_CONFIG_OUTPUT=standalone
RUN pnpm --filter @openzosma/web build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

# Set environment to production
ENV NODE_ENV=production

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
  adduser -S nextjs -u 1001

# Copy necessary files from builder
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "apps/web/server.js"]
