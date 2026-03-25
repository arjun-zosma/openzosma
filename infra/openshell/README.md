# OpenShell Infrastructure

NVIDIA OpenShell configuration for sandbox environments. Each user gets a persistent, isolated sandbox built from the Docker image defined here.

## Directory Structure

```
infra/openshell/
  Dockerfile              Multi-stage build for the sandbox container image
  scripts/
    entrypoint.sh         Container entrypoint (starts sandbox-server)
  policies/
    default.yaml          Default security policy (filesystem, network, process)
    presets/
      slack.yaml          Extended policy for Slack integration
      docker.yaml         Extended policy for Docker access
      huggingface.yaml    Extended policy for HuggingFace model downloads
```

## Sandbox Image

The Dockerfile builds a container image that runs `@openzosma/sandbox-server` (a Hono HTTP server wrapping pi-agent) inside an OpenShell sandbox.

### Build

A convenience script builds the image and imports it into the K3s cluster (required for OpenShell):

```bash
./scripts/build-sandbox.sh v0.1.0     # default tag
./scripts/build-sandbox.sh v0.2.0     # custom tag
```

Use a versioned tag, not `:latest`. K3s sets `imagePullPolicy: Always` for `:latest`, which causes `ImagePullBackOff` since the image is local.

To build the Docker image without importing (e.g. for CI or direct `docker run` testing):

```bash
docker build -f infra/openshell/Dockerfile -t openzosma/sandbox-server:v0.1.0 .
```

### Architecture

The image follows NemoClaw's pattern:

* **Multi-stage build**: Stage 1 (`builder`) compiles `@openzosma/sandbox-server` and `@openzosma/agents`. Stage 2 (`runtime`) installs minimal dependencies and copies built artifacts.

* **Immutable config**: Policies are copied to `/app/policies/` and owned by root with read-only permissions (444).

* **Writable workspace**: `/workspace` and `/tmp/agent` are owned by the `sandbox` user (uid 1001).

* **Non-root execution**: The container runs as the `sandbox` user.

* **tini as PID 1**: Proper signal handling for container shutdown.

### Image contents

| Path                  | Owner            | Purpose                                               |
| --------------------- | ---------------- | ----------------------------------------------------- |
| `/app/dist/`          | root             | Compiled sandbox-server                               |
| `/app/agents-dist/`   | root             | Compiled agents package                               |
| `/app/node_modules/`  | root             | Runtime dependencies                                  |
| `/app/entrypoint.sh`  | root             | Container entrypoint (must be under `/app/` for Landlock) |
| `/app/policies/`      | root (read-only) | Security policy YAML files                            |
| `/workspace/`         | sandbox          | User's persistent workspace (files, code, agent data) |
| `/tmp/agent/`         | sandbox          | Temporary agent working directory                     |

### Ports

The sandbox-server listens on port **8080** (configurable via `SANDBOX_SERVER_PORT` env var). The orchestrator communicates with it over HTTP/SSE.

## Security Policies

OpenShell uses declarative YAML policies to restrict what code running inside the sandbox can do.

### Default Policy (`policies/default.yaml`)

The default policy allows:

* **Filesystem**: Read/write to `/workspace` and `/tmp`. Read-only for Node.js modules. Denies access to sensitive system files.

* **Network**: Deny-by-default. Explicitly allows LLM API endpoints (OpenAI, Anthropic).

* **Process**: Allows `node`, `npm`, `npx`, `python3`, `git`, `bash`. Denies `sudo`, `su`, privilege escalation tools.

### Presets

Presets in `policies/presets/` extend the default policy for specific use cases:

* **`slack.yaml`** -- Adds network access to Slack API endpoints

* **`docker.yaml`** -- Adds access to Docker socket and registry

* **`huggingface.yaml`** -- Adds access to HuggingFace model download endpoints

### Custom Policies

To use a custom policy, set `SANDBOX_POLICY_PATH` in your `.env.local`:

```bash
SANDBOX_POLICY_PATH=path/to/custom-policy.yaml
```

Or construct policies programmatically using `PolicyBuilder` from `@openzosma/sandbox`:

```typescript
import { PolicyBuilder } from "@openzosma/sandbox"

const policy = new PolicyBuilder()
  .allowRead("/workspace")
  .allowWrite("/workspace")
  .allowNetwork("api.openai.com")
  .allowProcess("node")
  .build()
```

## Testing Locally

1. Build the image and import into K3s:

   ```bash
   ./scripts/build-sandbox.sh v0.1.0
   ```

2. Run it directly (without OpenShell, for quick testing):

   ```bash
   docker build -f infra/openshell/Dockerfile -t openzosma/sandbox-server:test .
   docker run --rm -p 8080:8080 \
     -e ANTHROPIC_API_KEY=your-key \
     openzosma/sandbox-server:test
   ```

3. Check health:

   ```bash
   curl http://localhost:8080/health
   ```

4. With OpenShell (full sandbox isolation):

   ```bash
   openshell sandbox create \
     --from openzosma/sandbox-server:v0.1.0 \
     --policy infra/openshell/policies/default.yaml \
     --name test-sandbox
   ```

