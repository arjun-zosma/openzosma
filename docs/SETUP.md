# OpenZosma Setup Guide

How to run the OpenZosma platform locally. Two modes are available:

- **Local mode** -- agent runs in-process inside the gateway. No OpenShell or Docker image needed. Good for development and testing.
- **Orchestrator mode** -- agent runs inside per-user OpenShell sandboxes. Each user gets a persistent, isolated environment. This is the production configuration.

## Prerequisites

| Dependency | Version | Notes |
|---|---|---|
| Node.js | 22+ | Runtime for all packages |
| pnpm | 10+ | Workspace package manager (`corepack enable`) |
| Docker | 24+ | Runs PostgreSQL, Valkey, RabbitMQ |
| OpenShell CLI | latest | Only required for orchestrator mode |

## 1. Clone and Install

```bash
git clone <repo-url> openzosma
cd openzosma
pnpm install
```

## 2. Start Infrastructure

PostgreSQL, Valkey, and RabbitMQ run via Docker Compose:

```bash
docker compose up -d
```

This starts:
- **PostgreSQL** on port 5432 (with pgvector)
- **Valkey** on port 6379
- **RabbitMQ** on ports 5672 (AMQP) and 15672 (management UI)

## 3. Configure Environment

Copy the example env file and fill in your values:

```bash
cp .env.example .env.local
```

**Required settings:**
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` -- at least one LLM provider key
- `OPENZOSMA_MODEL_PROVIDER` / `OPENZOSMA_MODEL_ID` -- which model to use (e.g. `openai` / `gpt-4o`)
- `OPENZOSMA_SANDBOX_MODE` -- `local` or `orchestrator` (see sections below)

All other defaults work out of the box for local development.

## 4. Run Database Migrations

```bash
pnpm db:migrate
pnpm db:migrate:auth
```

This creates the public schema tables and the Better Auth tables.

## 5. Build

```bash
pnpm run build
```

Turborepo builds all packages in dependency order.

## 6a. Local Mode (Simple)

Set in `.env.local`:

```
OPENZOSMA_SANDBOX_MODE=local
```

Start the gateway and web app:

```bash
# Terminal 1 -- gateway
pnpm --filter @openzosma/gateway run dev

# Terminal 2 -- web dashboard
pnpm --filter web run dev
```

- Gateway: http://localhost:4000
- Web app: http://localhost:3000

In local mode, the agent runs in-process inside the gateway. No Docker image or OpenShell needed.

## 6b. Orchestrator Mode (Sandboxed)

Orchestrator mode runs each user's agent inside an isolated OpenShell sandbox (K3s pod inside Docker).

### Install OpenShell

Follow the [OpenShell installation guide](https://docs.nvidia.com/openshell/) to install the CLI.

Verify:

```bash
openshell --version
```

### Create the OpenShell Cluster

```bash
openshell cluster create
```

This starts a K3s cluster inside Docker. The container is named `openshell-cluster-openshell`.

### Build and Import the Sandbox Image

A convenience script automates the Docker build and K3s import:

```bash
chmod +x scripts/build-sandbox.sh
./scripts/build-sandbox.sh          # builds openzosma/sandbox-server:v0.1.0
./scripts/build-sandbox.sh v0.2.0   # or with a custom tag
```

**What the script does:**
1. `docker build -f infra/openshell/Dockerfile -t openzosma/sandbox-server:<tag> .` from repo root
2. `docker save <image> | docker exec -i openshell-cluster-openshell ctr images import --all-platforms -`

**Important:** Use a versioned tag (e.g. `v0.1.0`), NOT `:latest`. K3s sets `imagePullPolicy: Always` for `:latest` tags, which causes `ImagePullBackOff` since the image isn't on Docker Hub.

### Configure Environment

Set in `.env.local`:

```
OPENZOSMA_SANDBOX_MODE=orchestrator
SANDBOX_IMAGE=openzosma/sandbox-server:v0.1.0
SANDBOX_POLICY_PATH=infra/openshell/policies/default.yaml
```

### Start

```bash
# Terminal 1 -- gateway (with orchestrator)
pnpm --filter @openzosma/gateway run dev

# Terminal 2 -- web dashboard
pnpm --filter web run dev
```

When a user sends their first message, the orchestrator automatically:
1. Creates an OpenShell sandbox for the user
2. Waits for the sandbox to reach Ready phase
3. Sets up port forwarding
4. Injects environment variables (LLM keys)
5. Waits for the sandbox server to become healthy
6. Proxies the message to the sandbox

The first message takes ~30-40 seconds due to sandbox provisioning. Subsequent messages are fast since the sandbox persists.

## Rebuilding the Sandbox Image

After changing any of these files, you must rebuild the image and re-import into K3s:

- `infra/openshell/Dockerfile`
- `infra/openshell/scripts/entrypoint.sh`
- `infra/openshell/policies/default.yaml`
- `packages/sandbox-server/src/**`
- `packages/agents/src/**`

```bash
./scripts/build-sandbox.sh
```

If a sandbox is already running, delete it so the next session creates a fresh one with the new image:

```bash
openshell sandbox list --names
openshell sandbox delete <name>
```

## Type Checking

```bash
pnpm run check
```

Runs `tsc --noEmit` across all packages via Turborepo.

## Troubleshooting

### `ImagePullBackOff` in sandbox

The image tag is `:latest`. K3s tries to pull from Docker Hub. Use a versioned tag like `:v0.1.0` instead.

### Sandbox stuck in `Creating` phase

Check if the image has `iproute2` installed. The OpenShell supervisor requires the `ip` command for network namespace creation. Without it, the pod enters `CrashLoopBackOff`.

### `sandbox user 'sandbox' not found in image`

The Docker image must create a `sandbox` user and group. See the Dockerfile for the required `addgroup`/`adduser` commands.

### Port forwarding conflict

The OpenShell gateway uses port 8080. Sandbox ports are allocated in the 10000-19999 range to avoid conflicts. If you see port conflicts, check `openshell forward list`.

### Agent crashes with ENOENT on `~/.pi/`

The `sandbox` user's home directory must exist. Ensure the Dockerfile uses `--home /home/sandbox` in the `adduser` command and pre-creates `/home/sandbox/.pi`.

### ANSI escape codes in CLI output

The `openshell` CLI emits ANSI color codes even when piped. The sandbox client strips these automatically. If you see parsing failures, check that `NO_COLOR=1` is set in the CLI environment.
