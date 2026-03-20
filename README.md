# OpenZosma

Open-source, self-hosted AI agent platform. Exposes agents via [A2A protocol](https://github.com/google/A2A), REST API, WebSocket, and gRPC. Sandboxes each session using [NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw) (running agents inside [OpenShell](https://github.com/NVIDIA/OpenShell) sandboxes with Landlock + seccomp + network namespace isolation). Supports multiple communication channels: Web, Mobile, WhatsApp, Slack, and agent-to-agent.

Built on top of [pi-mono](https://github.com/badlogic/pi-mono) (TypeScript agent SDK).

## Getting Started

### Prerequisites

- [Node.js 22+](https://nodejs.org/) (see `.nvmrc`)
- [pnpm 9+](https://pnpm.io/)
- [Docker](https://docs.docker.com/get-docker/) and Docker Compose
- [NemoClaw CLI](https://github.com/NVIDIA/NemoClaw) (for sandbox development)

### Quick Start (MVP)

The fastest way to get a working end-to-end flow (ask a question, get a streaming LLM response):

```bash
git clone https://github.com/zosmaai/openzosma.git
cd openzosma
pnpm install
pnpm run build

# Terminal 1 — Gateway (port 4000)
OPENAI_API_KEY=sk-... pnpm --filter @openzosma/gateway dev

# Terminal 2 — Dashboard (port 3000)
pnpm --filter @openzosma/web dev
```

Open http://localhost:3000, type a message, and see the streaming response.

The MVP gateway uses in-memory sessions and calls OpenAI directly (no database, no auth, no gRPC separation). See [ARCHITECTURE.md](./ARCHITECTURE.md) for details on what is implemented vs. planned.

> **Note:** The gateway `dev` script loads `../../.env` automatically via `--env-file`. If you need a different env file, run `npx tsx --env-file=<path> src/index.ts` from `packages/gateway/`. When `.env` has `DB_HOST` or `DATABASE_URL` set, the gateway connects to PostgreSQL and enables A2A per-agent routes.

### Full Setup

```bash
# Clone the repo
git clone https://github.com/zosmaai/openzosma.git
cd openzosma

# Install dependencies
pnpm install

# Start infrastructure (PostgreSQL, Valkey, RabbitMQ)
docker compose up -d

# Copy environment config
cp .env.example .env.local
# Edit .env.local with your settings (LLM API keys, auth secret, etc.)

# Symlink .env.local into apps/web so Next.js can find it
ln -s ../../.env.local apps/web/.env.local

# Run database migrations (see "Database Migrations" section below)
pnpm db:migrate        # Public schema tables (gateway + web app)
pnpm db:migrate:auth   # Auth schema tables (better-auth)

# Generate gRPC stubs from proto definitions
pnpm proto:generate

# Build all packages
pnpm run build

# Type check
pnpm run check
```

### Database Migrations

All migrations live in `packages/db/`. There are two separate migration systems:

1. **`db-migrate`** -- manages `public` schema tables (gateway and web app tables)
2. **`better-auth` CLI** -- manages `auth` schema tables (users, sessions, accounts, etc.)

Both must be run before starting the application.

#### Prerequisites

PostgreSQL with the [pgvector](https://github.com/pgvector/pgvector) extension must be running and accessible. The default `docker compose up -d` uses the `pgvector/pgvector:pg16` image, which includes pgvector out of the box. If you manage PostgreSQL yourself, install the pgvector extension before running migrations.

#### Environment Variables

Migrations read database connection info from environment variables. They look for an `.env.local` file first, then `.env` in the repo root. You can also pass `--env-file=<path>` explicitly.

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | _(built from DB\_\* vars)_ | Full PostgreSQL connection string |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `openzosma` | Database name |
| `DB_USER` | `openzosma` | Database user |
| `DB_PASS` | `openzosma` | Database password |

If `DATABASE_URL` is set, it takes precedence. Otherwise it is constructed from the individual `DB_*` variables.

#### Running Migrations

```bash
# 1. Run public schema migrations (gateway + web app tables)
pnpm db:migrate

# 2. Run auth schema migrations (better-auth tables)
pnpm db:migrate:auth
```

**Order matters:** Run `db:migrate` first (creates `public` schema tables), then `db:migrate:auth` (creates `auth` schema and its tables).

#### Rolling Back

```bash
# Roll back the last public schema migration
pnpm db:migrate:down
```

Auth migrations are managed by the better-auth CLI and do not have a rollback command.

#### Creating New Migrations

```bash
# Creates a new migration with timestamp prefix + JS boilerplate + SQL files
pnpm db:migrate:create -- <name>
```

This generates three files in `packages/db/migrations/`:

```
migrations/
  <timestamp>-<name>.js                  # JS boilerplate (reads SQL files)
  sqls/<timestamp>-<name>-up.sql         # Write your UP SQL here
  sqls/<timestamp>-<name>-down.sql       # Write your DOWN SQL here
```

#### Using an Explicit Env File

```bash
pnpm db:migrate -- --env-file=/path/to/.env.production
pnpm db:migrate:auth -- --env-file=/path/to/.env.production
```

See [`packages/db/README.md`](./packages/db/README.md) for detailed documentation on migration structure, schemas, and conventions.

### Docker (Development)

For contributors who prefer not to install Node.js and pnpm locally:

```bash
docker build -f Dockerfile.dev -t openzosma-dev .
docker run -it --rm -v $(pwd):/app -p 4000:4000 -p 50051:50051 openzosma-dev bash
```

### Docker (Production)

Build individual services using multi-stage targets:

```bash
# API Gateway
docker build --target gateway -t openzosma-gateway .

# Orchestrator
docker build --target orchestrator -t openzosma-orchestrator .
```

## Architecture Overview

```
Clients (Web, Mobile, Slack, WhatsApp, A2A agents)
                    |
            API Gateway (Hono)
       REST / WebSocket / A2A / gRPC
                    |
          Orchestrator (gRPC)
        (session mgmt, routing,
         configurable quotas)
                    |
        +-----------+-----------+
        |           |           |
   NemoClaw     NemoClaw     NemoClaw
   Sandbox A    Sandbox B    Sandbox C
  (OpenShell     (OpenShell    (OpenShell
   isolation,    isolation,    isolation,
   pi-agent      pi-agent     pi-agent
   via gRPC)     via gRPC)    via gRPC)
```

Each agent session runs inside an isolated NemoClaw sandbox (Landlock + seccomp + network namespace isolation, deny-by-default network policies). The orchestrator manages sandbox lifecycle and routes messages. Internal communication between gateway, orchestrator, and sandboxes uses gRPC with bidirectional streaming. External clients use REST, WebSocket, or A2A.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Repository Structure

```
openzosma/
├── packages/
│   ├── db/                   # db-migrate migrations, raw SQL queries (PostgreSQL)
│   ├── auth/                 # Better Auth setup
│   ├── gateway/              # Hono HTTP server (REST + WS + A2A)
│   ├── orchestrator/         # Session lifecycle, sandbox pool
│   ├── sandbox/              # NemoClaw sandbox wrapper
│   ├── a2a/                  # A2A protocol implementation
│   ├── grpc/                 # Proto definitions + generated stubs
│   ├── adapters/
│   │   ├── web/              # WebSocket adapter
│   │   ├── whatsapp/         # WhatsApp Business API
│   │   └── slack/            # Slack adapter
│   ├── skills/
│   │   └── reports/          # PDF, PPTX, charts
│   └── sdk/                  # Client SDK (@openzosma/sdk)
├── apps/
│   ├── web/                  # Next.js dashboard (client-only)
│   └── mobile/               # React Native app (deferred)
├── proto/                    # .proto service definitions
├── infra/
│   ├── openshell/            # NemoClaw sandbox Dockerfile + policies
│   └── k8s/                  # Kubernetes manifests (production)
├── docs/                     # Phase-by-phase implementation plans
├── ARCHITECTURE.md           # System architecture
├── AGENTS.md                 # Instructions for AI coding agents
├── CONTRIBUTING.md           # Development setup and conventions
└── LICENSE                   # Apache 2.0
```

## Tech Stack

| Component | Technology |
|---|---|
| Runtime | Node.js 22 (TypeScript) |
| Agent SDK | pi-mono (`pi-agent-core`, `pi-ai`, `pi-coding-agent`) |
| HTTP Server | Hono |
| Internal RPC | gRPC (`@grpc/grpc-js`, `protobuf-ts`) |
| A2A Protocol | `@a2a-js/sdk` + Hono |
| Database | PostgreSQL (raw SQL via `pg`, migrations via `db-migrate`) |
| Cache / Pub-Sub | Valkey (Redis-compatible) |
| Job Queue | RabbitMQ |
| Auth | Better Auth |
| Sandbox | NVIDIA NemoClaw + OpenShell (Landlock, seccomp, network namespace isolation) |
| Web Dashboard | Next.js |
| Mobile | React Native (deferred) |

## Implementation Phases

| Phase | Description | Duration | Status |
|-------|-------------|----------|--------|
| [Phase 1](./docs/PHASE-1-MULTITENANT.md) | Multi-instance pi-agent refactor (in pi-mono) | 3-4 days | Complete |
| [Phase 2](./docs/PHASE-2-MONOREPO.md) | OpenZosma monorepo setup + DB schema + auth | 1 week | Complete |
| [Phase 3](./docs/PHASE-3-GATEWAY.md) | API Gateway + A2A + gRPC server | 1 week | In progress (REST + A2A done, gRPC/auth pending) |
| [Phase 4](./docs/PHASE-4-ORCHESTRATOR.md) | Orchestrator + NemoClaw sandbox integration | 1.5 weeks | Not started |
| [Phase 5](./docs/PHASE-5-ADAPTERS.md) | Channel adapters (Slack, WhatsApp) | 1 week | Not started |
| [Phase 6](./docs/PHASE-6-SKILLS.md) | Enterprise skills (database tool, reports) | 2 weeks | Not started |
| [Phase 7](./docs/PHASE-7-DASHBOARD.md) | Web dashboard (Next.js) | 2 weeks | In progress (MVP) |

**MVP (Phases 1-4):** ~4 weeks
**Full platform (Phases 1-7):** ~10 weeks

## Gateway API

The gateway (`packages/gateway/`) exposes REST, WebSocket, and A2A protocol endpoints on port 4000. See [PHASE-3-GATEWAY.md](./docs/PHASE-3-GATEWAY.md) for the full spec.

### REST Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/agents` | List agent configurations |
| `GET` | `/api/v1/agents/:id` | Get agent configuration |
| `POST` | `/api/v1/sessions` | Create a session |
| `GET` | `/api/v1/sessions/:id` | Get session details |
| `DELETE` | `/api/v1/sessions/:id` | Delete a session |
| `POST` | `/api/v1/sessions/:id/messages` | Send a message |
| `GET` | `/api/v1/sessions/:id/messages` | List messages |
| `GET` | `/api/v1/sessions/:id/stream` | SSE event stream |
| `POST` | `/api/v1/api-keys` | Create an API key |
| `GET` | `/api/v1/api-keys` | List API keys |
| `DELETE` | `/api/v1/api-keys/:id` | Delete an API key |

### A2A Protocol Endpoints

Each agent configuration is exposed as a separate A2A agent with its own card and JSON-RPC endpoint.

| Method | Path | Description |
|---|---|---|
| `GET` | `/.well-known/agent.json` | Default agent card (first config) |
| `GET` | `/a2a/agents` | List all agent cards |
| `GET` | `/a2a/agents/:configId/agent.json` | Agent card for a specific config |
| `POST` | `/a2a/agents/:configId` | JSON-RPC 2.0 (`tasks/send`, `tasks/sendSubscribe`, `tasks/get`, `tasks/cancel`) |

### Postman Collection

Import [`docs/openzosma-gateway.postman_collection.json`](./docs/openzosma-gateway.postman_collection.json) into Postman to get all gateway endpoints pre-configured. The collection uses a `base_url` variable (default `http://localhost:4000`) and auto-captures IDs from responses into collection variables for chained requests.

## Self-Hosted

One instance = one organization. Deploy with Docker Compose for development or Kubernetes for production.

## Related Repositories

- **[pi-mono](https://github.com/badlogic/pi-mono)** -- Agent SDK. Published as npm packages (`pi-ai`, `pi-agent-core`, `pi-coding-agent`, etc.). OpenZosma depends on these packages.
- **[NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw)** -- Sandbox runtime. Runs agents inside OpenShell sandboxes with Landlock + seccomp + network namespace isolation, deny-by-default network policies, and inference routing.
- **[NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell)** -- Underlying sandbox infrastructure. K3s-based isolation with declarative YAML policies.
- **[Google A2A](https://github.com/google/A2A)** -- Agent-to-Agent protocol. JSON-RPC 2.0 over HTTPS with SSE streaming and gRPC support.

## License

[Apache License 2.0](./LICENSE)
