# =============================================================================
# OpenZosma Gateway Image
#
# Runs the API gateway service with Hono HTTP server and dual-mode session
# manager. Provides REST/WebSocket/A2A endpoints for external clients and
# communicates with orchestrator for sandbox lifecycle management.
#
# Architecture follows the same pattern as sandbox-server:
# - Multi-stage build (builder + runtime)
# - pnpm deploy for self-contained dependencies (no symlinks)
# - Minimal runtime image with only required system libraries
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Build gateway and all workspace dependencies
# ---------------------------------------------------------------------------
FROM node:22-slim AS builder

# Install build-time dependencies for native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    g++ \
    make \
    pkg-config \
    python3 \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@10.32.1 --activate

WORKDIR /build

# Copy workspace configuration and all packages
# .dockerignore excludes node_modules, dist, .turbo, and other build artifacts
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/ packages/
COPY proto/ proto/

# Install dependencies (creates node_modules, doesn't overwrite source code)
RUN pnpm install --frozen-lockfile

# Build all packages in dependency order
RUN pnpm --filter @openzosma/logger run build
RUN pnpm --filter @openzosma/db run build
RUN pnpm --filter @openzosma/memory run build
RUN pnpm --filter @openzosma/grpc run build
RUN pnpm --filter @openzosma/sandbox run build
RUN pnpm --filter @openzosma/skill-reports run build
RUN pnpm --filter @openzosma/integrations run build
RUN pnpm --filter @openzosma/agents run build
RUN pnpm --filter @openzosma/a2a run build
RUN pnpm --filter @openzosma/auth run build
RUN pnpm --filter @openzosma/adapter-slack run build
RUN pnpm --filter @openzosma/orchestrator run build
RUN pnpm --filter @openzosma/gateway run build

# Use pnpm deploy to create a self-contained directory with all runtime
# dependencies resolved (no symlinks)
RUN pnpm --filter @openzosma/gateway deploy /deploy --prod --legacy

# Copy built dist into the deploy directory
RUN cp -r packages/gateway/dist /deploy/dist

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM node:22-slim

# Runtime system dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the self-contained deploy bundle (node_modules + dist, no symlinks)
COPY --from=builder /deploy ./

# Expose the gateway HTTP server port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production

# Start the gateway server
CMD ["node", "dist/index.js"]
