# Package READMEs -- TODO

Tracking document for adding `README.md` to each workspace package. Each README should follow the style of `packages/db/README.md`: title, overview, usage with code examples, environment variables, file structure. No fluff.

## Completed

- [x] **@openzosma/db** (`packages/db/`) -- Migrations, connection pooling, query modules
- [x] **@openzosma/logger** (`packages/logger/`) -- Structured logging, levels, formatters
- [x] **@openzosma/web** (`apps/web/`) -- Next.js dashboard

## Pending

### Core Backend

- [ ] **@openzosma/gateway** (`packages/gateway/`)
  - Dual-mode session management (local in-process vs orchestrator-delegated)
  - REST API routes: sessions, messages, artifacts, agent configs, API keys, KB sync
  - WebSocket and SSE real-time streaming
  - Authentication middleware (Better Auth + API key)
  - Channel adapter initialization at startup
  - Environment variables: `GATEWAY_PORT`, `GATEWAY_HOST`, `OPENZOSMA_SANDBOX_MODE`

- [ ] **@openzosma/orchestrator** (`packages/orchestrator/`)
  - SandboxManager: per-user sandbox provisioning, idle suspension, health checks
  - OrchestratorSessionManager: session creation and message routing to sandboxes
  - Quota enforcement (max sandboxes, max sessions per sandbox)
  - Configuration via `loadConfigFromEnv()` and env vars
  - Health check loop for monitoring active sandboxes

- [ ] **@openzosma/sandbox** (`packages/sandbox/`)
  - OpenShellClient: lifecycle ops (create, get, list, delete, waitReady)
  - File transfer: upload, uploadDir, injectEnv
  - Port forwarding: forwardStart / forwardStop
  - Security policy generation (buildPolicy, policyToYaml)
  - Error types: SandboxNotFoundError, SandboxNotReadyError, SandboxTimeoutError

- [ ] **@openzosma/sandbox-server** (`packages/sandbox-server/`)
  - In-container HTTP API for orchestrator communication
  - Session CRUD, SSE message streaming
  - Knowledge base file operations with path traversal protection
  - SandboxAgentManager: pi-coding-agent session management
  - Health endpoint for orchestrator polling

- [ ] **@openzosma/agents** (`packages/agents/`)
  - AgentProvider / AgentSession interfaces
  - PiAgentProvider: wraps pi-coding-agent with model resolution
  - Event stream translation (pi-agent events -> AgentStreamEvent)
  - Tool configuration with selective enablement
  - Extension integration: pi-memory, pi-subagents, pi-guardrails

- [ ] **@openzosma/memory** (`packages/memory/`)
  - bootstrapMemory: sets PI_MEMORY_DIR, resolves extension paths
  - Integration with pi-memory and pi-extension-observational-memory
  - MemoryConfig interface: workspaceDir, memoryDir
  - Graceful degradation when memory packages are missing

- [ ] **@openzosma/auth** (`packages/auth/`)
  - Better Auth integration with PostgreSQL (custom schema field mappings)
  - Social OAuth providers (GitHub, Google) via env vars
  - API key lifecycle: generation (ozk_ prefix), SHA-256 hashing, validation
  - RBAC: roles, permissions, hasPermission / getPermissions helpers
  - createAuthFromEnv: zero-config factory

### Protocol / Infrastructure

- [ ] **@openzosma/a2a** (`packages/a2a/`)
  - Agent card generation from DB-stored agent configs
  - OpenZosmaAgentExecutor: A2A JSON-RPC 2.0 task execution with streaming
  - Skill metadata definitions for capability advertisement
  - A2ASessionProvider interface

- [ ] **@openzosma/grpc** (`packages/grpc/`)
  - Generated TypeScript stubs from .proto definitions (orchestrator, sandbox)
  - createGrpcChannel / createGrpcServer / startGrpcServer helpers
  - Code generation script (scripts/generate.ts)
  - Note: stubs exist but are not used at runtime (HTTP/SSE is used instead)

- [ ] **@openzosma/sdk** (`packages/sdk/`)
  - Purpose: typed client SDK for the gateway REST/WebSocket API
  - Target consumers: web dashboard, external integrations
  - Placeholder -- implementation planned for Phase 7

### Channel Adapters

- [ ] **@openzosma/adapter-slack** (`packages/adapters/slack/`)
  - SlackAdapter: ChannelAdapter interface implementation
  - Bolt Socket Mode setup (bot token, app token)
  - Thread-to-session mapping (channel + thread_ts)
  - Message handling: streaming events -> threaded replies
  - Environment variables: `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`

- [ ] **@openzosma/adapter-whatsapp** (`packages/adapters/whatsapp/`)
  - Placeholder -- implementation planned for Phase 5
  - WhatsApp Business Cloud API integration
  - Expected pattern: same ChannelAdapter interface as Slack

### Skills

- [ ] **@openzosma/skill-reports** (`packages/skills/reports/`)
  - Placeholder -- implementation planned for Phase 6
  - Template-based and agent-generated report creation
  - Expected scope: report templates, rendering, export formats
