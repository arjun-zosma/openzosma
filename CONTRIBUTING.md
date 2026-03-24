# Contributing

## Development Setup

### Prerequisites

- [Node.js 22+](https://nodejs.org/) (see `.nvmrc` / `.node-version`)
- [pnpm 9+](https://pnpm.io/)
- Docker and Docker Compose (for PostgreSQL, Valkey, RabbitMQ)
- [NemoClaw CLI](https://github.com/NVIDIA/NemoClaw) (for sandbox development, Phase 4+) -- only needed when running in orchestrator mode

### Getting Started

```bash
# Clone the repo
git clone https://github.com/zosmaai/openzosma.git
cd openzosma

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL with pgvector, Valkey, RabbitMQ)
docker compose up -d

# Copy environment config
cp .env.example .env.local
# Edit .env.local with your API keys, auth secret, encryption key, etc.

# Run database migrations
pnpm db:migrate          # Public schema tables (gateway + web app)
pnpm db:migrate:auth     # Auth schema tables (better-auth)

# Generate gRPC stubs from proto definitions (stubs exist but are not used at runtime)
pnpm proto:generate

# Build all packages
pnpm run build

# Type check
pnpm run check
```

### Running the Application

```bash
# Terminal 1 -- Gateway (port 4000)
pnpm --filter @openzosma/gateway dev

# Terminal 2 -- Web dashboard (port 3000)
pnpm --filter @openzosma/web dev
```

Open http://localhost:3000, sign up with email and password, and start a conversation.

The gateway defaults to port 4000 (`GATEWAY_PORT`) and host 0.0.0.0 (`GATEWAY_HOST`). The dashboard connects to the gateway at `http://localhost:4000` by default (`NEXT_PUBLIC_GATEWAY_URL`).

### Database Migrations

All migrations live in `packages/db/`. There are two separate migration systems:

1. **`db-migrate`** -- manages `public` schema tables (gateway and web app tables)
2. **`better-auth` CLI** -- manages `auth` schema tables (users, sessions, accounts, etc.)

Both must be run before starting the application. **Order matters:** run `db:migrate` first, then `db:migrate:auth`.

```bash
# Run public schema migrations
pnpm db:migrate

# Run auth schema migrations
pnpm db:migrate:auth

# Roll back the last public schema migration
pnpm db:migrate:down

# Create a new migration
pnpm db:migrate:create -- <name>
```

Migrations read database connection info from `.env.local` (then `.env`) in the repo root. You can also pass `--env-file=<path>` explicitly:

```bash
pnpm db:migrate -- --env-file=/path/to/.env.production
```

See [`packages/db/README.md`](./packages/db/README.md) for detailed documentation on migration structure, schemas, environment variables, and conventions.

### Using the Dev Container

If you prefer not to install Node.js and pnpm locally:

```bash
docker build -f Dockerfile.dev -t openzosma-dev .
docker run -it --rm \
  -v $(pwd):/app \
  -p 4000:4000 \
  openzosma-dev bash
```

This gives you a shell with Node.js 22, pnpm, protoc, and build tools pre-installed.

### Docker (Production)

Build individual services using multi-stage targets:

```bash
# API Gateway
docker build --target gateway -t openzosma-gateway .

# Sandbox image (for OpenShell sandboxes)
docker build -f infra/openshell/Dockerfile -t openzosma/sandbox-server:latest .
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in:

```bash
# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=openzosma
DB_USER=openzosma
DB_PASS=openzosma
DB_POOL_SIZE=10
# Or set DATABASE_URL directly (takes precedence over DB_* vars), for example:
# DATABASE_URL=postgres://openzosma:openzosma@localhost:5432/openzosma

# Auth
AUTH_SECRET=<random-secret>
AUTH_URL=http://localhost:3000
# ENCRYPTION_KEY can be either:
# - a 64-char hex string (used directly as a 32-byte key), or
# - any other passphrase (a key will be derived from it)
ENCRYPTION_KEY=<64-char-hex-string-or-passphrase>

# Web app
NEXT_PUBLIC_BASE_URL=http://localhost:3000
NEXT_PUBLIC_GATEWAY_URL=http://localhost:4000

# Google OAuth (optional)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=

# Gateway
GATEWAY_PORT=4000
GATEWAY_HOST=0.0.0.0
PUBLIC_URL=http://localhost:4000

# Agent
OPENZOSMA_MODEL_PROVIDER=anthropic
OPENZOSMA_MODEL_ID=claude-sonnet-4-20250514
OPENZOSMA_WORKSPACE=./workspace

# Valkey (Redis-compatible) -- not yet implemented
VALKEY_URL=redis://localhost:6379

# RabbitMQ -- not yet implemented
RABBITMQ_URL=amqp://openzosma:openzosma@localhost:5672

# Sandbox / Orchestrator
# "local" = in-process pi-agent (default), "orchestrator" = per-user OpenShell sandboxes
OPENZOSMA_SANDBOX_MODE=local
SANDBOX_IMAGE=openzosma/sandbox-server:latest
SANDBOX_AGENT_PORT=8080
SANDBOX_POLICY_PATH=infra/openshell/policies/default.yaml
MAX_SANDBOXES=0

# LLM providers (at least one required)
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
```

## Conventions

### Code Style

- TypeScript throughout
- No `any` types unless absolutely necessary
- No inline imports -- always standard top-level imports
- No global/module-level mutable state
- No ORM -- raw SQL via `pg`, migrations via `db-migrate`
- Biome for linting and formatting (tabs, 120 line width, double quotes)
- Run `pnpm run lint:fix` to auto-fix formatting issues

### Database

- Migrations live in `packages/db/migrations/` using `db-migrate` format (JS + sqls/)
- Create new migration: `pnpm db:migrate:create -- <name>`
- Run migrations: `pnpm db:migrate`
- Rollback: `pnpm db:migrate:down`
- Parameterized queries only (`$1`, `$2`, etc.), never string interpolation

### gRPC / Protobuf

Proto definitions exist in `proto/` at repo root but are **not used at runtime**. The orchestrator communicates with sandboxes via HTTP/SSE. Stubs are generated and checked in for reference.

- Generated TypeScript stubs go to `packages/grpc/src/generated/`
- Regenerate after proto changes: `pnpm proto:generate`
- Code generation uses `@protobuf-ts/plugin` via `npx protoc`

### Git

- Branch naming: `feat/description`, `fix/description`, `refactor/description`
- Commit format: `type(scope): description`
  - Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
  - Scopes: `gateway`, `orchestrator`, `sandbox`, `a2a`, `grpc`, `db`, `auth`, `adapters`, `skills`, `web`, `sdk`
- Include `fixes #N` or `closes #N` in commit messages for related issues
- Never force push to main

### Testing

- Use Vitest for unit and integration tests
- Test files live in `test/` directories alongside source, named `*.test.ts`
- Run from package root: `cd packages/gateway && npx vitest --run`
- Integration tests that need infrastructure should check for availability and skip gracefully
- See [docs/TESTING.md](./docs/TESTING.md) for the full testing strategy

### Pull Requests

- One feature or fix per PR
- Include tests for new functionality
- All checks must pass before merge
- PRs are reviewed, then merged to main

## Project Layout

```
apps/             Frontend applications (web dashboard, mobile)
packages/         Backend packages (each is an independent npm package)
proto/            Protobuf service definitions (not used at runtime)
infra/            Infrastructure configs (OpenShell sandbox Dockerfile, policies)
docs/             Phase implementation plans and design docs
```

Each package in `packages/` has its own `package.json`, `tsconfig.json`, and `src/` directory. Packages reference each other via workspace protocol (`workspace:*`).
