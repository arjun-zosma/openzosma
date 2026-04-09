# Gateway Docker Build

## Overview

This directory contains the Docker build configuration for the OpenZosma Gateway service.

## Building the Image

From the repository root, build the gateway image:

```bash
docker build -f packages/gateway/Dockerfile -t openzosma/gateway:latest .
```

Or build from the gateway directory:

```bash
cd packages/gateway
docker build -t openzosma/gateway:latest .
```

## Running the Container

```bash
docker run -d \
  --name openzosma-gateway \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/dbname \
  -e OPENAI_API_KEY=sk-... \
  openzosma/gateway:latest
```

## Configuration

The gateway service requires the following environment variables:

* `DATABASE_URL`: PostgreSQL connection string

* `OPENAI_API_KEY`: OpenAI API key (or other provider API keys)

* `OPENZOSMA_ORCHESTRATOR_URL`: Orchestrator service URL (optional, defaults to internal routing)

## Architecture

The Docker build uses a multi-stage approach:

1. **Builder Stage**: Compiles TypeScript and builds all workspace dependencies
2. **Runtime Stage**: Minimal image with only the compiled JavaScript and runtime dependencies

This results in a smaller, more secure production image.

## Dependencies

The gateway depends on the following workspace packages:

* `@openzosma/a2a`: A2A protocol implementation

* `@openzosma/adapter-slack`: Slack integration adapter

* `@openzosma/agents`: Agent session management

* `@openzosma/auth`: Authentication/authorization

* `@openzosma/db`: Database queries and migrations

* `@openzosma/grpc`: gRPC protocol definitions

* `@openzosma/logger`: Logging utilities

* `@openzosma/orchestrator`: Sandbox lifecycle management

All dependencies are built in the correct order and bundled using `pnpm deploy`.
