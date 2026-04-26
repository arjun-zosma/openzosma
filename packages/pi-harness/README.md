<p align="center">
  <img src="https://raw.githubusercontent.com/zosmaai/openzosma/main/packages/pi-harness/assets/banner.png" alt="Pi-Harness" width="100%">
</p>

# Pi-Harness ⚡

> _"Standing on the shoulders of giants — pi-coding-agent by [Mario Zechner](https://github.com/badlogic) is the real hero here. We're just building the saddle."_

**Pi-Harness** is the top-level harness for the [Pi ecosystem](https://github.com/badlogic/pi-coding-agent). It takes the extraordinary power of `pi-coding-agent` — Mario Zechner's thoughtful, fast, and capable coding agent — and wraps it as a **headless HTTP/SSE server** that fits into _your_ workflow, not the other way around.

Unlike generic platforms that force companies to adapt to their opinions, Pi-Harness is designed to be **deeply customizable**. Configure your own models, tools, system prompts, extensions, and skills. Run it on a $5 VPS, a Kubernetes cluster, or even your phone via Termux. One process serves many users. Inference happens in the cloud. Your hardware just needs Node.js.

<table>
<tr><td><b>🚀 Standalone & Headless</b></td><td>No TUI, no database, no auth complexity. Just a clean HTTP API over pi-coding-agent's core SDK.</td></tr>
<tr><td><b>🏢 Company-First Design</b></td><td>Your workflow, your rules. Custom system prompts, tool allowlists, extensions, and skills per-deployment.</td></tr>
<tr><td><b>📡 Real-Time SSE Streaming</b></td><td>Every thought, tool call, and token streams to clients via Server-Sent Events. Build reactive UIs.</td></tr>
<tr><td><b>🔧 Full Pi Ecosystem Support</b></td><td>Not just coding agent — designed to harness all Pi packages: pi-ai, pi-agent-core, pi-tui, pi-lens, and more.</td></tr>
<tr><td><b>🧩 Extension & Skill Registry</b></td><td>Official skills and extensions published via git. Drop them in and they work. Community-driven ecosystem.</td></tr>
<tr><td><b>📱 Runs Anywhere</b></td><td>Linux, macOS, WSL2, Docker, Kubernetes, Termux on Android. Minimal resource footprint.</td></tr>
</table>

---

## 🙏 With Gratitude

**Pi-Harness would not exist without [pi-coding-agent](https://github.com/badlogic/pi-coding-agent) by Mario Zechner.** The Pi ecosystem — `pi-ai`, `pi-agent-core`, `pi-coding-agent`, `pi-tui`, `pi-lens` — represents some of the most thoughtful agent infrastructure built for developers. Mario's work on session management, the tool loop, the event system, and the TUI is the foundation everything here rests on.

**We are building this with his blessing and with deep respect.** Pi-Harness is not a fork, not a replacement, and not a competitor. It is a **deployment layer** — a way to run Pi's incredible agent logic in contexts where the interactive TUI isn't the right fit: background services, multi-user servers, embedded devices, automated pipelines, and company-specific integrations.

If you haven't tried `pi-coding-agent` directly, you should. It's beautiful.

```bash
npm install -g @mariozechner/pi-coding-agent
pi                            # experience the TUI firsthand
```

---

## ⚡ Quick Start

### Install (Recommended)

```bash
npm install -g @openzosma/pi-harness
```

Requires Node.js 22+. That's it — no cloning, no monorepo, no pnpm.

### First Run

```bash
pi-harness
```

On first run, pi-harness detects you're not configured and walks you through an interactive setup wizard. It asks for your LLM provider, API key, model preferences, and server settings. Your config is saved to `~/.pi-harness/.env`.

After setup, the server starts automatically.

### Daily Usage

```bash
pi-harness                  # Start server (foreground)
pi-harness start --daemon   # Start in background
pi-harness status           # Check if running
pi-harness logs             # Tail server logs
pi-harness stop             # Stop background daemon
pi-harness tui              # Connect with interactive client
pi-harness setup            # Re-run setup wizard
pi-harness --help           # Show all commands
```

### One-Liner Install (Alternative)

Prefer curl? We got you:

```bash
curl -fsSL https://raw.githubusercontent.com/zosmaai/openzosma/main/packages/pi-harness/scripts/install.sh | bash
```

This installs Node.js (if needed), pnpm, clones the repo, builds everything, and adds `pi-harness` to your PATH.

### Manual Setup (OpenZosma Monorepo)

For development within the openzosma repo:

```bash
cd /path/to/openzosma
pnpm install
pnpm --filter @openzosma/pi-harness build
pnpm --filter @openzosma/pi-harness start
```

---

## 📖 What Is Pi-Harness?

Pi-coding-agent has three run modes:

1. **Interactive mode** — The TUI (`pi` command). Beautiful, immersive, local.
2. **Print mode** — Single-shot CLI output.
3. **SDK mode** — Programmatic via `AgentSession`, `createAgentSession()`.

**Pi-Harness uses SDK mode.** The TUI (`pi-tui`) is never loaded. The core agent logic runs headlessly, streaming events through an async generator that the HTTP server consumes and forwards as SSE.

This means:

- **No GPU required locally** — inference happens at your chosen API endpoint
- **Multiple sessions, one process** — concurrent users share a lightweight Node.js runtime
- **Any client** — web dashboard, mobile app, CLI, Discord bot, CI pipeline
- **Tiny footprint** — ~50-100 MB base + ~10-30 MB per session

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Your Client                              │
│  (Web dashboard / CLI / Mobile / Discord / CI)              │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP + SSE
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     Pi-Harness (Node.js)                     │
│                                                              │
│  ┌─────────────┐    ┌─────────────────────────────────────┐ │
│  │ Hono HTTP   │───▶│  HarnessSessionManager              │ │
│  │ Server      │    │  • Multi-session in-process         │ │
│  │ :8080       │◀───│  • Per-session workspace isolation  │ │
│  └─────────────┘    └─────────────────────────────────────┘ │
│         │                              │                     │
│         │                              ▼                     │
│         │                    ┌──────────────────┐            │
│         │                    │ @openzosma/agents │            │
│         │                    │ (PiAgentProvider) │            │
│         │                    └────────┬─────────┘            │
│         │                             │                      │
│         ▼                             ▼                      │
│   REST + SSE                    @mariozechner/               │
│   /sessions                     pi-coding-agent              │
│   /sessions/:id/messages       (headless SDK mode)           │
│                                NO TUI — core only            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
                    Cloud LLM APIs (OpenRouter, OpenAI,
                    Anthropic, OpenCode Go, Ollama, etc.)
```

---

## 🔌 API Reference

### Session Management

| Method   | Path            | Description                           |
| -------- | --------------- | ------------------------------------- |
| `GET`    | `/health`       | Health check + uptime + session count |
| `POST`   | `/sessions`     | Create a new session                  |
| `GET`    | `/sessions`     | List active session IDs               |
| `GET`    | `/sessions/:id` | Get session metadata                  |
| `DELETE` | `/sessions/:id` | End a session                         |

### Messaging

| Method | Path                     | Description                |
| ------ | ------------------------ | -------------------------- |
| `POST` | `/sessions/:id/messages` | Send message → SSE stream  |
| `POST` | `/sessions/:id/steer`    | Steering message mid-turn  |
| `POST` | `/sessions/:id/followup` | Queue follow-up after turn |
| `POST` | `/sessions/:id/cancel`   | Cancel active turn         |

### Create Session

```bash
curl -X POST http://localhost:8080/sessions \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-secret" \
  -d '{
    "model": "claude-sonnet-4",
    "systemPromptPrefix": "You are a senior Rust engineer.",
    "toolsEnabled": ["read", "bash", "write"]
  }'
```

Response:

```json
{ "sessionId": "abc-123-..." }
```

### Send Message (SSE)

```bash
curl -N -X POST http://localhost:8080/sessions/abc-123/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: dev-secret" \
  -d '{"content": "Write a hello world in Rust"}'
```

Response (SSE stream):

```
event: turn_start
data: {"type":"turn_start","id":"..."}

event: message_start
data: {"type":"message_start","id":"..."}

event: message_update
data: {"type":"message_update","id":"...","text":"I'll"}

event: message_update
data: {"type":"message_update","id":"...","text":" create"}

event: tool_call_start
data: {"type":"tool_call_start","toolCallId":"...","toolName":"write","toolArgs":"{...}"}

event: tool_call_end
data: {"type":"tool_call_end","toolCallId":"...","toolName":"write","toolResult":"File written."}

event: turn_end
data: {"type":"turn_end","id":"..."}
```

---

## ⚙️ Configuration

All configuration is via environment variables. No config files, no database, no ceremony.

### Required

| Variable                    | Description                       | Example                         |
| --------------------------- | --------------------------------- | ------------------------------- |
| `OPENROUTER_API_KEY`        | OpenRouter API key                | `sk-or-v1-...`                  |
| `OPENAI_API_KEY`            | OpenAI API key                    | `sk-...`                        |
| `ANTHROPIC_API_KEY`         | Anthropic API key                 | `sk-ant-...`                    |
| `OPENZOSMA_LOCAL_MODEL_URL` | Custom OpenAI-compatible endpoint | `https://opencode.ai/zen/go/v1` |

You only need **one** provider key. Pi-Harness auto-detects which one you have.

### Server Settings

| Variable                          | Default         | Description                |
| --------------------------------- | --------------- | -------------------------- |
| `PI_HARNESS_PORT`                 | `8080`          | HTTP server port           |
| `PI_HARNESS_HOST`                 | `0.0.0.0`       | Host to bind to            |
| `PI_HARNESS_API_KEY`              | _(none)_        | Require `x-api-key` header |
| `PI_HARNESS_MAX_SESSIONS`         | `0` (unlimited) | Max concurrent sessions    |
| `PI_HARNESS_IDLE_TIMEOUT_MINUTES` | `30`            | Auto-cleanup idle sessions |
| `PI_HARNESS_WORKSPACE`            | `./workspace`   | Session workspace root     |
| `PI_HARNESS_MAX_BODY_SIZE`        | `10MB`          | Request body limit         |

### Agent Defaults

| Variable                          | Description                           | Example                             |
| --------------------------------- | ------------------------------------- | ----------------------------------- |
| `PI_HARNESS_PROVIDER`             | Default LLM provider                  | `openrouter`, `anthropic`, `openai` |
| `PI_HARNESS_MODEL`                | Default model ID                      | `claude-sonnet-4`, `gpt-4o`         |
| `PI_HARNESS_TOOLS`                | Default tools (comma-separated)       | `read,bash,write,edit`              |
| `PI_HARNESS_SYSTEM_PROMPT_PREFIX` | Prefix for all sessions               | `"You work at Acme Corp..."`        |
| `PI_HARNESS_SYSTEM_PROMPT_SUFFIX` | Suffix for all sessions               | `"Always write tests."`             |
| `PI_HARNESS_EXTENSIONS_DIR`       | Load pi-coding-agent extensions       | `/path/to/extensions`               |
| `PI_HARNESS_SKILLS_DIR`           | _(future)_ Load skills from directory | `/path/to/skills`                   |
| `PI_HARNESS_VERBOSE`              | `false`                               | Enable verbose logging              |

### Full Example

```bash
# Provider: OpenCode Go (affordable bundled models)
export OPENZOSMA_LOCAL_MODEL_URL="https://opencode.ai/zen/go/v1"
export OPENZOSMA_LOCAL_MODEL_API_KEY="sk-..."
export OPENZOSMA_LOCAL_MODEL_ID="qwen3.6-plus"

# Server
export PI_HARNESS_PORT=8080
export PI_HARNESS_API_KEY="company-secret"
export PI_HARNESS_MAX_SESSIONS=50
export PI_HARNESS_IDLE_TIMEOUT_MINUTES=30

# Agent defaults for your company
export PI_HARNESS_PROVIDER="local"
export PI_HARNESS_MODEL="qwen3.6-plus"
export PI_HARNESS_TOOLS="read,bash,write,edit,grep,find,ls"
export PI_HARNESS_SYSTEM_PROMPT_PREFIX="You are a senior engineer at Acme Corp. Follow our style guide at https://acme.dev/style. Use TypeScript, prefer functional patterns, and always write tests."
export PI_HARNESS_EXTENSIONS_DIR="/opt/pi-harness/extensions"

# Run
pnpm --filter @openzosma/pi-harness start
```

---

## 🖥️ Running in Background

### Built-in Daemon (Easiest)

Pi-Harness has native daemon support — no external tools needed:

```bash
pi-harness start --daemon   # Start in background
pi-harness status             # Check if running
pi-harness logs               # Tail server logs
pi-harness stop               # Stop daemon
```

Your config and logs live in `~/.pi-harness/`.

### systemd (Linux Servers)

Create `/etc/systemd/system/pi-harness.service`:

```ini
[Unit]
Description=Pi-Harness Agent Server
After=network.target

[Service]
Type=simple
User=pi-harness
WorkingDirectory=/opt/pi-harness
EnvironmentFile=/opt/pi-harness/.env
ExecStart=/usr/bin/pi-harness start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable pi-harness
sudo systemctl start pi-harness
sudo systemctl status pi-harness
```

### pm2 (Node.js Process Manager)

```bash
npm install -g pm2

pm2 start "pi-harness start" --name pi-harness

pm2 save
pm2 startup

# Logs
pm2 logs pi-harness

# Restart
pm2 restart pi-harness
```

### Docker Compose

```yaml
services:
  pi-harness:
    build: ./packages/pi-harness
    ports:
      - "8080:8080"
    environment:
      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - PI_HARNESS_API_KEY=${PI_HARNESS_API_KEY}
      - PI_HARNESS_MAX_SESSIONS=50
      - PI_HARNESS_SYSTEM_PROMPT_PREFIX=${PI_HARNESS_SYSTEM_PROMPT_PREFIX}
    volumes:
      - ./workspace:/app/workspace
      - ./extensions:/app/extensions
    restart: unless-stopped
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: pi-harness
spec:
  replicas: 2
  selector:
    matchLabels:
      app: pi-harness
  template:
    metadata:
      labels:
        app: pi-harness
    spec:
      containers:
        - name: pi-harness
          image: openzosma/pi-harness:latest
          ports:
            - containerPort: 8080
          env:
            - name: OPENROUTER_API_KEY
              valueFrom:
                secretKeyRef:
                  name: llm-secrets
                  key: openrouter
            - name: PI_HARNESS_API_KEY
              valueFrom:
                secretKeyRef:
                  name: harness-secrets
                  key: api-key
            - name: PI_HARNESS_MAX_SESSIONS
              value: "100"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "1Gi"
              cpu: "1000m"
```

---

## 🧩 Extensions & Skills

### Pi-Coding-Agent Extensions

Pi-coding-agent supports extensions loaded from a directory. Pi-Harness exposes this via `PI_HARNESS_EXTENSIONS_DIR`.

Extensions are JavaScript/TypeScript modules that hook into the agent lifecycle. They can add tools, modify prompts, or react to events. Place them in the extensions directory and they'll be loaded automatically on session creation.

```bash
export PI_HARNESS_EXTENSIONS_DIR="/opt/pi-harness/extensions"
```

Directory structure:

```
extensions/
├── my-company-tool/
│   ├── package.json
│   └── index.js          # exports extension hooks
└── custom-validator/
    └── index.js
```

### Skills (Coming Soon)

Skills are higher-level procedural memory — reusable task patterns the agent can invoke by name. Think of them as functions the LLM can call that encode multi-step workflows.

We're building an official skills registry at `github.com/zosmaai/pi-harness-skills`. Drop a skill directory into `PI_HARNESS_SKILLS_DIR` and the agent gains new capabilities:

```
skills/
├── deploy-to-vercel/
│   ├── skill.json          # metadata, parameters, description
│   └── workflow.md         # step-by-step instructions for the agent
├── run-security-audit/
│   ├── skill.json
│   └── workflow.md
└── generate-changelog/
    ├── skill.json
    └── workflow.md
```

Skills follow the open [AgentSkills](https://agentskills.io) standard where possible.

---

## 🌐 Ecosystem Vision

Pi-Harness is not just a coding agent server. It is the **top-level harness** for the entire Pi ecosystem.

### What This Means

| Package           | What It Does                                            | How Pi-Harness Uses It                                           |
| ----------------- | ------------------------------------------------------- | ---------------------------------------------------------------- |
| `pi-coding-agent` | The core coding agent with tools and session management | **Primary engine** — runs headlessly via SDK mode                |
| `pi-ai`           | LLM abstraction layer                                   | **Model routing** — supports any provider via pi-ai's registry   |
| `pi-agent-core`   | Agent loop, event system, tool framework                | **Event streaming** — SSE events originate from pi-agent-core    |
| `pi-tui`          | Terminal UI framework                                   | **Client option** — TUI client can be built on pi-tui components |
| `pi-lens`         | Code intelligence and navigation                        | **Future** — LSP-powered code context for agent sessions         |

### Our Philosophy

**Big tech platforms make you fit into their workflow.** They decide which models you can use, which tools are available, how auth works, and how much it costs. They own your data and your configuration.

**Pi-Harness makes the platform fit into your workflow.** You choose:

- Which LLM provider (or your own endpoint)
- Which tools are enabled per-deployment
- What the agent knows about your company
- Where it runs and who has access
- How it integrates with your existing systems

This is **infrastructure as code** for AI agents. Deploy it, configure it, extend it. It's yours.

---

## 📊 Resource Usage

Pi-Harness is designed to run on minimal hardware:

| Component              | Usage                                    |
| ---------------------- | ---------------------------------------- |
| Node.js runtime        | ~50-100 MB base                          |
| Per-session overhead   | ~10-30 MB (depends on history)           |
| 50 concurrent sessions | ~1-2 GB RAM total                        |
| CPU between turns      | Near zero                                |
| CPU during streaming   | Spikes during LLM I/O and tool execution |

**No GPU required.** All inference happens at your configured API endpoint.

---

## 🔗 Comparison

|                   | Pi-Harness              | Gateway + Orchestrator   | sandbox-server   |
| ----------------- | ----------------------- | ------------------------ | ---------------- |
| **Weight**        | Light                   | Heavy                    | Medium           |
| **Database**      | None                    | PostgreSQL + Better Auth | None             |
| **Auth**          | Optional API key        | Full user auth           | None             |
| **Sandbox**       | No                      | Yes (OpenShell)          | Yes (OpenShell)  |
| **Dashboard**     | No                      | Yes (Next.js)            | No               |
| **A2A Protocol**  | No                      | Yes                      | No               |
| **Multi-tenancy** | Sessions                | Users + Orgs             | Sessions         |
| **Best For**      | Standalone agent server | Full platform            | Sandboxed agents |

Use **Pi-Harness** when you want a simple, deployable agent server without platform complexity.

Use **Gateway** when you need user auth, billing, persistent history, and a web dashboard.

---

## 🛠️ Development

```bash
git clone https://github.com/zosmaai/openzosma.git
cd openzosma
pnpm install
pnpm --filter @openzosma/pi-harness build
pnpm --filter @openzosma/pi-harness check    # TypeScript check
pnpm --filter @openzosma/pi-harness dev      # tsx watch mode
```

### Project Structure

```
packages/pi-harness/
├── src/
│   ├── cli.ts             # CLI router (lightweight, no heavy deps)
│   ├── commands.ts        # Heavy command implementations (start, tui)
│   ├── index.ts           # Server entry point (daemon/foreground)
│   ├── server.ts          # Hono HTTP server (REST + SSE)
│   ├── session-manager.ts # Multi-session lifecycle manager
│   ├── config.ts          # Environment configuration
│   ├── types.ts           # Shared TypeScript types
│   └── tui.ts             # Terminal client
├── scripts/
│   ├── install.sh         # One-liner installer
│   ├── setup.sh           # Interactive setup wizard
│   └── build-bundle.mjs   # esbuild bundler for standalone npm
├── dist/                  # Bundled + compiled output
├── README.md
└── package.json
```

---

## 🗺️ Roadmap

- [x] Headless HTTP/SSE server
- [x] Multi-session management
- [x] TUI client (`pi-harness-tui`)
- [x] One-liner install script
- [x] Interactive setup wizard
- [x] Default tools, prompts, and extensions
- [ ] Session persistence (SQLite/JSON) for restart survival
- [ ] WebSocket transport option
- [ ] gRPC server mode
- [ ] Metrics endpoint (Prometheus)
- [ ] Official skills registry (git-based)
- [ ] Extension marketplace
- [ ] A2A protocol endpoint
- [ ] Horizontal pod autoscaling example
- [ ] Termux/Android automated install
- [ ] pi-lens integration for code intelligence

---

## 🤝 Contributing

We welcome contributions! This is an open-source project by [Zosma AI](https://zosma.ai), built with deep respect for the Pi ecosystem.

- 🐛 [Open an issue](https://github.com/zosmaai/openzosma/issues)
- 💡 [Start a discussion](https://github.com/zosmaai/openzosma/discussions)
- 🔀 [Submit a PR](https://github.com/zosmaai/openzosma/pulls)

Special thanks to **Mario Zechner** for creating the Pi ecosystem and for his blessing in building this harness.

---

## 📜 License

MIT — see the [OpenZosma LICENSE](../../LICENSE).

The underlying `pi-coding-agent` and Pi packages are licensed under their respective licenses (MIT). All credit for the agent intelligence belongs to Mario Zechner and the Pi contributors.

---

<p align="center">
  <b>Built with 💜 by <a href="https://zosma.ai">Zosma AI</a></b><br>
  <sub>Standing on the shoulders of <a href="https://github.com/badlogic">Mario Zechner</a>'s Pi ecosystem</sub>
</p>
