#!/bin/sh
# =============================================================================
# Sandbox entrypoint script.
#
# Runs inside the OpenShell sandbox container as the main process.
# Starts the sandbox-server HTTP server which wraps pi-coding-agent.
#
# The sandbox-server port can be set via the SANDBOX_SERVER_PORT env var
# or passed as the first argument to this script (argument takes priority).
#
# Env vars (LLM keys, etc.) are injected AFTER the sandbox reaches Ready
# via `openshell sandbox upload`. This script waits for /sandbox/.env to
# appear before starting the server so the agent has access to the keys.
# =============================================================================
set -e

# Accept port as first argument (set by orchestrator at sandbox creation)
if [ -n "$1" ]; then
  export SANDBOX_SERVER_PORT="$1"
fi

echo "[sandbox] Starting OpenZosma agent sandbox"
echo "[sandbox] Workspace: ${OPENZOSMA_WORKSPACE:-/workspace}"
echo "[sandbox] Port: ${SANDBOX_SERVER_PORT:-3000}"
echo "[sandbox] Node: $(node --version)"

# Ensure workspace directory exists and is writable
mkdir -p "${OPENZOSMA_WORKSPACE:-/workspace}"

# ---------------------------------------------------------------------------
# Wait for env vars to be injected via /sandbox/.env
#
# The orchestrator uploads this file after the sandbox reaches Ready.
# We poll for up to 120 seconds. If it never appears we start anyway
# (sessions will fail on missing API keys, but the health endpoint works).
# ---------------------------------------------------------------------------
ENV_FILE="/sandbox/.env"
WAIT_SECS=120
ELAPSED=0

echo "[sandbox] Waiting for ${ENV_FILE} (up to ${WAIT_SECS}s)..."
while [ ! -f "$ENV_FILE" ] && [ "$ELAPSED" -lt "$WAIT_SECS" ]; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

if [ -f "$ENV_FILE" ]; then
  echo "[sandbox] Found ${ENV_FILE} after ${ELAPSED}s, sourcing..."
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
else
  echo "[sandbox] WARNING: ${ENV_FILE} not found after ${WAIT_SECS}s, starting without it"
fi

# Start the sandbox-server (HTTP/SSE server wrapping pi-coding-agent)
exec node /app/dist/index.js
