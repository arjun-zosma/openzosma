# OpenZosma

**Build AI teams that work alongside yours -- accessible from your phone.**

OpenZosma is an open-source, self-hosted platform for creating hierarchical AI agents that act as digital work twins for your team. Configure an agent org chart that mirrors your business structure, delegate tasks through natural conversation, and manage your operations from anywhere -- your phone, WhatsApp, Slack, or a web dashboard. No laptop required.

## How It Works

You define a hierarchy of agents that mirrors your organization. Each agent has a role, a set of capabilities, and knows which agents report to it. You talk to the top-level agent, and it delegates work down the chain.

```
You (from your phone, WhatsApp, or Slack)
  |
  CEO Agent
  |
  +-- Sales Manager Agent
  |       +-- Lead Qualifier Agent
  |       +-- CRM Updater Agent
  |
  +-- Operations Agent
  |       +-- Invoice Processor Agent
  |       +-- Inventory Tracker Agent
  |
  +-- Support Agent
          +-- Ticket Router Agent
          +-- FAQ Responder Agent
```

**Example:** You message your CEO Agent from WhatsApp: "What were last week's sales numbers and are there any open support tickets over 48 hours?" The CEO Agent delegates to the Sales Manager Agent and Support Agent in parallel. They query your connected systems, and you get a consolidated answer back -- all from a single message on your phone.

Agents don't replace your team. They handle the routine lookups, status checks, data entry, and coordination that eat up your team's day -- so your people can focus on work that requires human judgment.

> **Note:** The gateway `dev` script loads `../../.env.local` automatically via `--env-file`. If you need a different env file, run `npx tsx --env-file=<path> src/index.ts` from `packages/gateway/`. When `.env.local` has `DB_HOST` or `DATABASE_URL` set, the gateway connects to PostgreSQL and enables A2A per-agent routes.

### Full Setup

## Key Features

* **Hierarchical agents** -- Configure org-chart-like agent trees. Manager agents delegate to specialist agents automatically.

* **Talk from anywhere** -- Web dashboard, mobile app, WhatsApp, Slack, or agent-to-agent via the [A2A protocol](https://github.com/google/A2A).

* **Self-hosted** -- Your data stays on your infrastructure. One instance = one organization.

* **Connect your tools** -- Integrate with databases, CRMs, email, and other business systems through configurable connectors.

* **Secure by design** -- Each agent session runs in an isolated sandbox ([NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw) + [OpenShell](https://github.com/NVIDIA/OpenShell)) with Landlock, seccomp, and network namespace isolation.

* **Open source** -- Apache 2.0 license. No vendor lock-in, no usage fees, no data leaving your network.

## Quick Start

```bash
git clone https://github.com/zosmaai/openzosma.git
cd openzosma
pnpm install

# Start services: PostgreSQL (with pgvector), Valkey, and RabbitMQ
docker compose up -d

# Configure environment
cp .env.example .env.local
# Edit .env.local with your API keys and secrets

# Run database migrations
pnpm db:migrate
pnpm db:migrate:auth

# Build and start
pnpm run build
pnpm --filter @openzosma/gateway dev   # Terminal 1 (port 4000)
pnpm --filter @openzosma/web dev       # Terminal 2 (port 3000)
```

Open <http://localhost:3000>, sign up, and start a conversation.

### Running with Sandboxes (Optional)

To run agent sessions inside isolated OpenShell sandboxes instead of in-process:

```bash
# 1. Install the OpenShell CLI (https://github.com/NVIDIA/OpenShell)
# 2. Build the sandbox image
docker build -f infra/openshell/Dockerfile -t openzosma/sandbox-server:latest .

# 3. Set sandbox mode in .env.local
echo 'OPENZOSMA_SANDBOX_MODE=orchestrator' >> .env.local

# 4. Start the gateway (it will create sandboxes on demand)
pnpm --filter @openzosma/gateway dev
```

See [infra/openshell/README.md](./infra/openshell/README.md) for sandbox image details and policy configuration.

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full development setup, environment variables, and conventions.

## Architecture

```
Clients (Web, Mobile, WhatsApp, Slack, A2A agents)
                    |
            API Gateway (REST / WebSocket / A2A)
                    |
              Orchestrator (in-process library)
                    |  HTTP / SSE
                    v
            Per-user OpenShell Sandboxes
            (one persistent sandbox per user)
```

The gateway runs in two modes controlled by `OPENZOSMA_SANDBOX_MODE`:

- **`local`** (default) -- pi-agent runs in-process inside the gateway. No OpenShell needed. Good for development.
- **`orchestrator`** -- Each user gets a persistent OpenShell sandbox. The orchestrator (an in-process library, not a separate service) manages sandbox lifecycle and proxies messages to the sandbox-server via HTTP/SSE. Sandboxes are created on demand and suspended after idle timeout.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the full system design.

## Documentation

| Document                                         | Description                                           |
| ------------------------------------------------ | ----------------------------------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)             | System design, component interactions, data flow      |
| [CONTRIBUTING.md](./CONTRIBUTING.md)             | Development setup, environment variables, conventions |
| [packages/db/README.md](./packages/db/README.md) | Database migrations, schemas, query module            |
| [docs/](./docs/)                                 | Phase-by-phase implementation plans                   |

## Tech Stack

| Component      | Technology                                                 |
| -------------- | ---------------------------------------------------------- |
| Runtime        | Node.js 22 (TypeScript)                                    |
| HTTP Server    | Hono                                                       |
| Internal RPC   | HTTP/SSE (orchestrator to sandbox-server inside OpenShell) |
| Database       | PostgreSQL (raw SQL via `pg`, migrations via `db-migrate`) |
| Auth           | Better Auth                                                |
| Sandbox        | NVIDIA NemoClaw + OpenShell                                |
| Web Dashboard  | Next.js 16, React 19, Tailwind CSS v4                      |
| Mobile         | React Native (planned)                                     |
| Agent Protocol | [Google A2A](https://github.com/google/A2A)                |

## Repository Structure

| Phase                                     | Description                                   | Duration  | Status                                              |
| ----------------------------------------- | --------------------------------------------- | --------- | --------------------------------------------------- |
| [Phase 1](./docs/PHASE-1-MULTITENANT.md)  | Multi-instance pi-agent refactor (in pi-mono) | 3-4 days  | Complete                                            |
| [Phase 2](./docs/PHASE-2-MONOREPO.md)     | OpenZosma monorepo setup + DB schema + auth   | 1 week    | Complete                                            |
| [Phase 3](./docs/PHASE-3-GATEWAY.md)      | API Gateway + A2A + auth                      | 1 week    | Complete (REST + A2A + WebSocket + auth)             |
| [Phase 4](./docs/PHASE-4-ORCHESTRATOR.md) | Orchestrator + OpenShell sandbox integration  | 1.5 weeks | In progress (core infra done, integration pending)  |
| [Phase 5](./docs/PHASE-5-ADAPTERS.md)     | Channel adapters (Slack, WhatsApp)            | 1 week    | Not started                                         |
| [Phase 6](./docs/PHASE-6-SKILLS.md)       | Enterprise skills (database tool, reports)    | 2 weeks   | Not started                                         |
| [Phase 7](./docs/PHASE-7-DASHBOARD.md)    | Web dashboard (Next.js)                       | 2 weeks   | In progress (MVP)                                   |

**MVP (Phases 1-4):** \~4 weeks
**Full platform (Phases 1-7):** \~10 weeks

## Gateway API

The gateway (`packages/gateway/`) exposes REST, WebSocket, and A2A protocol endpoints on port 4000. See [PHASE-3-GATEWAY.md](./docs/PHASE-3-GATEWAY.md) for the full spec.

## Self-Hosted

One instance = one organization. Deploy with Docker Compose for development or Kubernetes for production.

## Related Repositories

* **[pi-mono](https://github.com/badlogic/pi-mono)** -- Agent SDK. Published as npm packages (`pi-ai`, `pi-agent-core`, `pi-coding-agent`, etc.). OpenZosma depends on these packages.

* **[NVIDIA NemoClaw](https://github.com/NVIDIA/NemoClaw)** -- Sandbox runtime. Runs agents inside OpenShell sandboxes with Landlock + seccomp + network namespace isolation, deny-by-default network policies, and inference routing.

* **[NVIDIA OpenShell](https://github.com/NVIDIA/OpenShell)** -- Underlying sandbox infrastructure. K3s-based isolation with declarative YAML policies.

* **[Google A2A](https://github.com/google/A2A)** -- Agent-to-Agent protocol. JSON-RPC 2.0 over HTTPS with SSE streaming and gRPC support.

```
openzosma/
  apps/
    web/                  Next.js dashboard
    mobile/               React Native app (planned)
  packages/
    gateway/              API gateway (REST + WebSocket + A2A), dual-mode session manager
    orchestrator/         Sandbox lifecycle, session proxying, health checks, quotas
    agents/               Agent provider interface + implementations
    sandbox/              OpenShell CLI wrapper (TypeScript)
    sandbox-server/       Hono HTTP server running inside sandbox containers
    db/                   Database migrations and query module
    auth/                 Better Auth setup
    a2a/                  A2A protocol implementation
    grpc/                 Proto definitions + generated stubs (not used at runtime)
    sdk/                  Client SDK (@openzosma/sdk)
    adapters/             Channel adapters (Slack, WhatsApp)
    skills/               Enterprise skills (reports, charts)
  proto/                  Protobuf service definitions
  infra/
    openshell/            Sandbox Dockerfile, policies, entrypoint script
  docs/                   Implementation plans and design docs
```

## License

[Apache License 2.0](./LICENSE)
