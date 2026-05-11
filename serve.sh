#!/usr/bin/env bash
# Local preview over an HTTPS tunnel.
# Runs python3 -m http.server and exposes it via `cloudflared tunnel --url`.
# Copy the https://*.trycloudflare.com URL it prints onto your phone.

set -euo pipefail

PORT="${PORT:-8000}"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed."
  echo "  macOS:   brew install cloudflared"
  echo "  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required."
  exit 1
fi

cd "$(dirname "$0")"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/fcp-serve.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT INT TERM

echo "Local server: http://127.0.0.1:$PORT (logs: /tmp/fcp-serve.log)"
echo "Starting Cloudflare quick tunnel — open the https URL below on your phone."
echo

exec cloudflared tunnel --url "http://localhost:$PORT"
