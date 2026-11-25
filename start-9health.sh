#!/usr/bin/env bash
set -euo pipefail

ROUTER_URL="${ROUTER_URL:-http://127.0.0.1:20128/v1/models}"
HEALTH_PORT="${PORT:-3099}"

echo "============================================"
echo "  9health Unified Launcher"
echo "============================================"

echo "[1/3] Checking 9router readiness at ${ROUTER_URL}..."
if ! curl -fsS --max-time 2 "${ROUTER_URL}" >/dev/null 2>&1; then
  if command -v 9router >/dev/null 2>&1; then
    echo "[1/3] Starting 9router in background..."
    9router >/tmp/9router.log 2>&1 &
    echo "[2/3] Waiting for 9router port 20128..."
    for _ in $(seq 1 15); do
      if curl -fsS --max-time 2 "${ROUTER_URL}" >/dev/null 2>&1; then
        echo "[2/3] 9router is ready."
        break
      fi
      sleep 1
    done
  else
    echo "[WARN] '9router' CLI not found in PATH. Launching 9health anyway (Demo Mode or manual URL available)."
  fi
else
  echo "[1/3] 9router is already running."
fi

if [ ! -d "dist" ]; then
  echo "[3/3] Building 9health production bundle..."
  pnpm run build
fi

echo "[3/3] Starting 9health on http://127.0.0.1:${HEALTH_PORT}"
PORT="${HEALTH_PORT}" exec pnpm run start
