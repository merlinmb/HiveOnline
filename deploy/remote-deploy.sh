#!/usr/bin/env bash
# Remote deployment helper for Hive Online.
# Uploaded and executed by deploy.ps1 from the project root on the Pi.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE="$ROOT/site"
DATA="$ROOT/data"
CONFIG="$ROOT/config"

if [ ! -d "$SITE" ]; then
  echo "error: $SITE is missing. Run deploy.ps1 from the development machine." >&2
  exit 1
fi

mkdir -p "$DATA" "$CONFIG"

if [ ! -f "$CONFIG/app.json" ]; then
  cp "$SITE/config.example.json" "$CONFIG/app.json"
  echo "Seeded $CONFIG/app.json"
fi

# The container runs as uid/gid 1000 (the "node" user in the image).
if [ "$(id -u)" -eq 0 ]; then
  chown -R 1000:1000 "$DATA" "$CONFIG"
elif chown -R 1000:1000 "$DATA" "$CONFIG" 2>/dev/null; then
  :
elif command -v sudo >/dev/null 2>&1; then
  sudo -n chown -R 1000:1000 "$DATA" "$CONFIG" 2>/dev/null || true
fi

cd "$ROOT"

if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  echo "error: neither 'docker compose' nor 'docker-compose' is available." >&2
  exit 1
fi

echo "Building Hive Online image..."
"${COMPOSE[@]}" build

echo "Starting containers..."
"${COMPOSE[@]}" up -d --remove-orphans

echo
"${COMPOSE[@]}" ps

# Wait for the container health check when one is configured.
STATUS="unknown"
for _ in $(seq 1 45); do
  STATUS="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' hive 2>/dev/null || echo missing)"
  if [ "$STATUS" = "healthy" ] || [ "$STATUS" = "running" ]; then
    break
  fi
  sleep 2
done

if [ "$STATUS" = "unhealthy" ] || [ "$STATUS" = "missing" ] || [ "$STATUS" = "exited" ]; then
  echo
  echo "Container did not become healthy (status: $STATUS). Recent logs:" >&2
  "${COMPOSE[@]}" logs --tail=80 hive >&2 || true
  exit 1
fi

echo
echo "Hive Online is $STATUS."
