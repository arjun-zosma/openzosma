#!/usr/bin/env bash
# =============================================================================
# Build the OpenZosma sandbox Docker image and import it into the K3s cluster.
#
# Usage:
#   ./scripts/build-sandbox.sh              # defaults to v0.1.0
#   ./scripts/build-sandbox.sh v0.2.0       # custom tag
#
# Prerequisites:
#   - Docker must be running
#   - OpenShell gateway must be running (openshell gateway start)
# =============================================================================
set -euo pipefail

TAG="${1:-v0.1.0}"
IMAGE="openzosma/sandbox-server:${TAG}"
K3S_CONTAINER="openshell-cluster-openshell"

# Resolve repo root (directory containing pnpm-workspace.yaml)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "[build-sandbox] Building image: ${IMAGE}"
echo "[build-sandbox] Build context: ${REPO_ROOT}"

docker build \
  -f "${REPO_ROOT}/infra/openshell/Dockerfile" \
  -t "${IMAGE}" \
  "${REPO_ROOT}"

echo "[build-sandbox] Importing image into K3s cluster..."

# Verify the K3s container is running
if ! docker inspect "${K3S_CONTAINER}" >/dev/null 2>&1; then
  echo "[build-sandbox] ERROR: K3s container '${K3S_CONTAINER}' not found."
  echo "[build-sandbox] Make sure OpenShell is running: openshell gateway start"
  exit 1
fi

docker save "${IMAGE}" | docker exec -i "${K3S_CONTAINER}" ctr images import --all-platforms -

echo "[build-sandbox] Done. Image '${IMAGE}' is available in the K3s cluster."
echo ""
echo "[build-sandbox] To verify:"
echo "  docker exec ${K3S_CONTAINER} ctr images list | grep openzosma"
