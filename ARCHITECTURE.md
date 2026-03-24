# Architecture

## Current State (MVP + Phase 4 Core)

The gateway supports two execution modes controlled by `OPENZOSMA_SANDBOX_MODE`:

### Local Mode (default)

```
Dashboard (Next.js :3000)
     |
     WebSocket (/ws) + REST (/api/v1/*)
     |
Gateway (Hono :4000)
     |
     pi-agent (in-process)
     |
     LLM API (streaming)
```

**What is implemented:**
- Gateway: Hono HTTP server with REST endpoints, WebSocket (`ws` package, `noServer` mode), and A2A protocol
- Dual-mode SessionManager: local (in-process pi-agent) or orchestrator (per-user sandboxes)
- Auth via Better Auth (email/password + OAuth)
- Database persistence via PostgreSQL (db-migrate migrations)
- Dashboard: Next.js 15 + React 19 + Tailwind CSS 4, chat page at `/chat`

### Orchestrator Mode

```
Dashboard (Next.js :3000)
     |
     WebSocket (/ws) + REST (/api/v1/*)
     |
Gateway (Hono :4000)
     |
     OrchestratorSessionManager (in-process library)
     |
     SandboxManager -> OpenShell CLI
     |
     HTTP/SSE (via pod IP or openshell exec)
     |
Per-user OpenShell Sandbox
     |
     sandbox-server (Hono :8080)
     |
     pi-agent -> LLM API
```

**What is implemented (Phase 4a + 4b):**
- OpenShell CLI wrapper (`packages/sandbox/`) -- TypeScript client for `openshell` binary
- Sandbox HTTP server (`packages/sandbox-server/`) -- Hono server wrapping pi-agent inside sandbox
- Per-user sandbox manager (`packages/orchestrator/src/sandbox-manager.ts`) -- creates, suspends, resumes, destroys sandboxes
- HTTP/SSE client (`packages/orchestrator/src/sandbox-http-client.ts`) -- communicates with sandbox-server
- Orchestrator session manager (`packages/orchestrator/src/session-manager.ts`) -- bridges gateway to sandbox sessions
- Quota enforcement (`packages/orchestrator/src/quota.ts`)
- Health check loop (`packages/orchestrator/src/health.ts`)
- Sandbox Docker image (`infra/openshell/Dockerfile`) -- multi-stage build with immutable + writable split
- Security policies (`infra/openshell/policies/`) -- default.yaml + presets (slack, docker, huggingface)
- DB migration: `user_sandboxes` table for tracking sandbox lifecycle
- Env-var-based config loading (`packages/orchestrator/src/config.ts`)
- Gateway wiring: `OPENZOSMA_SANDBOX_MODE=orchestrator` activates sandbox mode

**What is planned (not yet implemented):**
- Valkey pub/sub for multi-gateway fan-out
- RabbitMQ event bus (webhooks, analytics)
- Channel adapters (Slack, WhatsApp)
- Integration tests for sandbox lifecycle

## System Overview

OpenZosma is a self-hosted AI agent platform. The backend is a standalone TypeScript service. Clients (Next.js dashboard, React Native app, WhatsApp bot, Slack bot, external A2A agents) are independent consumers connected via REST, WebSocket, or A2A protocol.

The orchestrator is an **in-process library** imported by the gateway -- not a separate service. When `OPENZOSMA_SANDBOX_MODE=orchestrator`, the gateway instantiates `SandboxManager` and `OrchestratorSessionManager` which communicate with sandbox-server instances inside OpenShell sandboxes via **HTTP/SSE**.

There are no Next.js API routes in the critical path. The backend owns all business logic.

```
+-----------------------------------------------------------------+
|                         Clients                                  |
|  Web (Next.js)  |  Mobile (RN)  |  Slack  |  WhatsApp  |  A2A  |
+-------------------------------+---------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                    API Gateway (Hono)                             |
|                                                                  |
|  REST API          WebSocket Server       A2A Endpoint           |
|  /api/v1/*         /api/v1/sessions/      /.well-known/agent.json|
|                    :id/ws                 /a2a (JSON-RPC 2.0)    |
|                                                                  |
|  Auth middleware (Better Auth)                                    |
|  Rate limiting (configurable)                                    |
|  Request validation                                              |
|                                                                  |
|  SessionManager (dual mode: local or orchestrator)               |
+-------------------------------+---------------------------------+
                                |
                   (orchestrator mode only)
                          HTTP / SSE
                                |
              +-----------------+------------------+
              v                 v                  v
+----------------+  +----------------+  +----------------+
|  OpenShell     |  |  OpenShell     |  |  OpenShell     |
|  Sandbox       |  |  Sandbox       |  |  Sandbox       |
|  (user A)      |  |  (user B)      |  |  (user C)      |
|                |  |                |  |                |
|  sandbox-server|  |  sandbox-server|  |  sandbox-server|
|  (Hono :8080)  |  |  (Hono :8080)  |  |  (Hono :8080)  |
|  pi-agent      |  |  pi-agent      |  |  pi-agent      |
+----------------+  +----------------+  +----------------+
```

Each user gets **one persistent sandbox** that persists across sessions. Sessions are conversations within that sandbox. Sandboxes are created on first use, suspended after idle timeout, and resumed on next activity.

## Communication Protocols

| Path | Protocol | Purpose |
|---|---|---|
| External clients -> Gateway | REST + WebSocket | Web dashboard, SDK, mobile |
| External agents -> Gateway | A2A (JSON-RPC 2.0 over HTTPS + SSE) | Agent-to-agent |
| Gateway -> Sandbox (orchestrator mode) | HTTP/SSE (via pod IP) | Session creation, message proxying, health checks |
| Channel adapters | Native (Slack Socket Mode, WhatsApp webhooks) | Slack, WhatsApp |

HTTP/SSE is used for orchestrator-to-sandbox communication. The `SandboxHttpClient` connects to the sandbox-server's Hono HTTP endpoint inside the OpenShell pod. SSE is used for streaming agent events back to the gateway during message processing. gRPC proto definitions exist in `proto/` and `packages/grpc/` but are not used at runtime.

## Components

### API Gateway (`packages/gateway/`)

Single Hono server exposing three external protocols:

**REST API** for standard request-response:
```
POST   /api/v1/sessions              Create session
GET    /api/v1/sessions/:id          Get session status
DELETE /api/v1/sessions/:id          End session
POST   /api/v1/sessions/:id/messages Send message
GET    /api/v1/sessions/:id/messages List messages
GET    /api/v1/sessions/:id/stream   SSE event stream
GET    /api/v1/agents                List available agents
GET    /api/v1/usage                 Usage statistics
```

**WebSocket** for real-time bidirectional communication:
```
ws://host/api/v1/sessions/:id/ws
```
Client sends messages, server pushes `AgentEvent` stream using the existing `ProxyAssistantMessageEvent` wire format from pi-agent (`packages/agent/src/proxy.ts`).

**A2A Protocol** for agent-to-agent interaction:
```
GET  /.well-known/agent.json     Agent Card (capabilities, skills)
POST /a2a                        JSON-RPC 2.0 endpoint
```
Methods: `tasks/send`, `tasks/sendSubscribe` (SSE), `tasks/get`, `tasks/cancel`, `tasks/pushNotification/set`, `tasks/pushNotification/get`.

A2A tasks map 1:1 to OpenZosma sessions.

In orchestrator mode, the gateway delegates session operations to the `OrchestratorSessionManager` (an in-process library), which communicates with sandbox-server instances via HTTP/SSE.

### gRPC Definitions (`packages/grpc/`, `proto/`)

Proto definitions exist for planned services but are **not used at runtime**. The orchestrator communicates with sandboxes via HTTP/SSE instead.

```protobuf
// proto/orchestrator.proto (reference only, not used at runtime)
service OrchestratorService {
  rpc CreateSession(CreateSessionRequest) returns (Session);
  rpc EndSession(EndSessionRequest) returns (Empty);
  rpc SendMessage(SendMessageRequest) returns (stream AgentEvent);
  rpc CancelTurn(CancelTurnRequest) returns (Empty);
  rpc GetSession(GetSessionRequest) returns (Session);
  rpc ListActiveSessions(ListActiveSessionsRequest) returns (SessionList);
}

// proto/sandbox.proto (reference only, not used at runtime)
service SandboxAgentService {
  rpc ProcessMessage(stream AgentMessage) returns (stream AgentEvent);
  rpc HealthCheck(Empty) returns (HealthResponse);
}
```

### Orchestrator (`packages/orchestrator/`)

In-process library imported by the gateway (not a separate service). Active when `OPENZOSMA_SANDBOX_MODE=orchestrator`. Key components:

- **`SandboxManager`** -- Per-user sandbox lifecycle. Creates sandboxes on demand via OpenShell CLI, suspends after idle timeout, resumes on next activity, destroys on explicit request. Tracks state in both PostgreSQL (`user_sandboxes` table) and in-memory (`SandboxState` map).
- **`OrchestratorSessionManager`** -- Bridge between the gateway's `SessionManager` and sandbox-server instances. Creates sessions inside sandboxes via HTTP, proxies messages via SSE streaming, cleans up on session end.
- **`SandboxHttpClient`** -- HTTP/SSE client for communicating with the sandbox-server Hono endpoint. Supports health checks, session CRUD, and SSE message streaming.
- **`loadConfigFromEnv()`** -- Reads `SANDBOX_IMAGE`, `SANDBOX_AGENT_PORT`, `MAX_SANDBOXES`, etc. from environment variables.
- **Quota enforcement** -- Optional concurrent sandbox and session limits.
- **Health check loop** -- Background sweep that checks sandbox health and suspends idle sandboxes.

### Sandbox (`packages/sandbox/`, `packages/sandbox-server/`)

**`packages/sandbox/`** -- TypeScript wrapper around the NVIDIA OpenShell CLI binary. Provides:
- `OpenShellClient` class with methods for `create`, `list`, `info`, `delete`, `suspend`, `resume`, `exec`
- `PolicyBuilder` for constructing OpenShell YAML policies programmatically
- Error types: `SandboxNotFoundError`, `SandboxNotReadyError`, `OpenShellError`

**`packages/sandbox-server/`** -- Lightweight Hono HTTP server that runs **inside** the sandbox container as the main process. It wraps pi-agent and exposes:
- `GET /health` -- sandbox health status
- `POST /sessions` -- create a new agent session
- `POST /sessions/:id/messages` -- send message, returns SSE stream of `AgentStreamEvent`
- `DELETE /sessions/:id` -- end a session
- `GET /sessions` -- list active sessions

**Sandbox lifecycle (per-user persistent model):**
1. User sends first message -> Gateway asks `SandboxManager.ensureSandbox(userId)`
2. `SandboxManager` checks `user_sandboxes` DB table for existing sandbox
3. If none exists: creates OpenShell sandbox with custom Docker image + YAML policy
4. If suspended: resumes the existing sandbox
5. Waits for sandbox-server to become ready (HTTP health check)
6. `OrchestratorSessionManager` creates a session inside the sandbox via HTTP
7. Messages are proxied via SSE streaming
8. After idle timeout (default 30 min): sandbox is suspended (state preserved)
9. On next activity: sandbox is resumed (faster than cold start)

**Policy structure** (`infra/openshell/policies/default.yaml`):
```yaml
version: "1.0"
sandbox:
  filesystem:
    allow_read: ["/workspace", "/tmp", "/usr/local/lib/node_modules"]
    allow_write: ["/workspace", "/tmp"]
    deny: ["/etc/shadow", "/proc/kcore"]
  network:
    default: deny
    allow:
      - host: "api.openai.com"
      - host: "api.anthropic.com"
  process:
    allow: ["node", "npm", "npx", "python3", "git", "bash"]
    deny: ["sudo", "su", "chmod", "chown"]
```

Presets in `infra/openshell/policies/presets/` extend the default policy for specific use cases (Slack, Docker, HuggingFace).

### Database (`packages/db/`)

PostgreSQL with raw SQL via `pg` driver. Migrations via `db-migrate`.

Core tables:

| Table | Purpose |
|---|---|
| `users` | id, email, name, role, auth_provider_id, created_at |
| `sessions` | id, user_id, agent_config_id, sandbox_id, status, created_at, ended_at |
| `messages` | id, session_id, role, content, tool_calls, tokens_used, created_at |
| `agent_configs` | id, name, model, system_prompt, tools_enabled, skills, created_at |
| `api_keys` | id, name, key_hash, key_prefix, scopes, expires_at, created_at |
| `usage` | id, session_id, tokens_in, tokens_out, cost, model, created_at |
| `connections` | id, name, type, encrypted_credentials, schema_cache, read_only, created_at |
| `settings` | key, value (instance-level configuration) |
| `user_sandboxes` | id, user_id, sandbox_name, status, metadata, created_at, last_active_at |

### Cache and Pub/Sub (Valkey)

- **Session state:** Active session metadata, sandbox assignments
- **Message cache:** Recent messages for fast retrieval (PostgreSQL is source of truth)
- **Pub/Sub:** Fan-out for SSE and WebSocket connections (multiple gateway instances can serve the same session)
- **Auth tokens:** Session cookies, API key validation cache

### Job Queue (RabbitMQ)

- **Webhook delivery:** Retry with exponential backoff
- **Analytics events:** Usage tracking
- **Async tasks:** Report generation, long-running operations
- **Sandbox lifecycle events:** Creation, health check failures, cleanup

### Auth (`packages/auth/`)

Better Auth with:
- Email/password + OAuth (GitHub, Google)
- API key auth for programmatic access
- RBAC: admin, member
- Session management via Valkey

### A2A Protocol (`packages/a2a/`)

Implementation using `@a2a-js/sdk`:
- Agent Card generation from `agent_configs` table
- Task lifecycle mapping: A2A task -> OpenZosma session
- SSE streaming via `tasks/sendSubscribe`
- Push notifications (webhooks) for async task completion

### Channel Adapters (`packages/adapters/`)

Each adapter translates between a channel's native protocol and the OpenZosma gateway (via REST or direct SessionManager calls).

**Slack** (`packages/adapters/slack/`):
- Based on existing `pi-mom` package in pi-mono
- Socket Mode or HTTP Events API
- Slack threads -> OpenZosma sessions
- File upload support

**WhatsApp** (`packages/adapters/whatsapp/`):
- WhatsApp Business Cloud API
- Webhook receiver for incoming messages
- Phone number + conversation -> session mapping
- Media handling (images, documents)
- Template messages for notifications

### Database Querying

Database querying is NOT a separate skill package. It is a **guardrailed tool** available to the agent inside the sandbox. Connection details are injected via environment variables:

```bash
DB_TYPE=postgresql          # postgresql, mysql, mongodb, clickhouse, bigquery, sqlite
DB_HOST=db.example.com
DB_PORT=5432
DB_NAME=analytics
DB_USER=readonly
DB_PASS=***
# or
DB_CONNECTION_STRING=postgresql://readonly:***@db.example.com:5432/analytics
```

The tool parses SQL before execution and enforces:
- **Read-only:** Only `SELECT`, `WITH...SELECT`, `EXPLAIN` allowed
- **Blocked:** `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `CREATE`, `TRUNCATE`, `GRANT`, `REVOKE`
- **Limits:** `LIMIT` appended if missing, statement timeout enforced
- **MongoDB:** Only `find`, `aggregate`, `countDocuments` allowed

### Report Skill (`packages/skills/reports/`)

Two approaches, both supported:
1. **Template-based:** Agent produces structured JSON -> rendered via React-PDF (PDF) / pptxgenjs (PPTX) / chart.js (charts). Deterministic output. Good for standardized reports.
2. **Agent-generated code:** Agent writes Python (matplotlib, pandas) or JS (chart.js, D3) code -> executed inside sandbox -> output files (PNG, PDF, SVG) returned. Flexible output. Good for ad-hoc analysis.

### Web Dashboard (`apps/web/`)

Next.js app consuming OpenZosma REST + WebSocket APIs. No API routes in the critical path.

Pages:
- `/login`, `/register` -- auth flows
- `/dashboard` -- overview, active sessions, usage stats
- `/chat` -- real-time agent interaction (WebSocket)
- `/sessions` -- session history, replay
- `/agents` -- configure agent personas, tools, models
- `/connections` -- manage database connections
- `/settings` -- instance settings, team management, API keys

## Data Flow

### User sends a message (WebSocket)

**Local mode:**
```
1. Client -> WebSocket -> Gateway
2. Gateway authenticates, validates
3. SessionManager runs pi-agent in-process
4. pi-agent processes message, calls tools, streams AgentEvents
5. Events emitted to per-session EventEmitter
6. Gateway pushes events to all connected WebSocket/SSE clients
```

**Orchestrator mode:**
```
1. Client -> WebSocket -> Gateway
2. Gateway authenticates, validates
3. SessionManager delegates to OrchestratorSessionManager
4. OrchestratorSessionManager ensures user's sandbox is running (SandboxManager)
5. OrchestratorSessionManager -> HTTP POST -> sandbox-server /sessions/:id/messages
6. sandbox-server runs pi-agent, streams AgentEvents back via SSE
7. OrchestratorSessionManager reads SSE stream, emits events to gateway
8. Gateway pushes events to all connected WebSocket/SSE clients
```

### A2A task lifecycle

```
1. External agent -> POST /a2a { method: "tasks/sendSubscribe", params: { message } }
2. Gateway parses JSON-RPC, authenticates via Agent Card
3. Gateway creates OpenZosma session (if new task) or routes to existing
4. SessionManager processes message (local or orchestrator mode)
5. AgentEvents streamed back as SSE (Content-Type: text/event-stream)
6. Task status transitions: submitted -> working -> completed/failed
7. If push notification configured, webhook fired on completion
```

## Pi-Mono Integration

OpenZosma depends on pi-mono packages via npm:
- `pi-ai` -- LLM abstraction (streaming, multi-provider)
- `pi-agent-core` -- Agent class, event system, tool loop
- `pi-coding-agent` -- AgentSession, coding tools, session management

Key abstractions used:
- `StreamFn` (`agent/src/types.ts:23`) -- pluggable LLM transport
- `AgentEvent` (`agent/src/types.ts:199-214`) -- agent lifecycle events
- `ProxyAssistantMessageEvent` (`agent/src/proxy.ts:36-57`) -- bandwidth-optimized wire format
- `EventStream<T, R>` (`ai/src/utils/event-stream.ts`) -- generic async iterable
- RPC mode (stdin/stdout JSONL) -- already exists in pi-coding-agent, used by sandbox-server to host pi-agent inside OpenShell

Phase 1 refactors pi-coding-agent to remove 7 global state issues that block multi-instance usage. See [docs/PHASE-1-MULTITENANT.md](./docs/PHASE-1-MULTITENANT.md) for details.


