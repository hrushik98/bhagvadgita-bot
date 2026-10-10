#!/usr/bin/env bash
# Starts Gita Guide in Docker.
#   Web: http://localhost:5501
#   API: http://localhost:5502
#
# Usage: ./start.sh           build (if needed) and start in the background
#        ./start.sh --logs    same, then follow the logs (Ctrl+C stops following, not the app)
# Stop:  docker compose down

set -euo pipefail
cd "$(dirname "$0")"

WEB_URL="http://localhost:5501"
API_URL="http://localhost:5502"

fail() {
  echo "Error: $*" >&2
  exit 1
}

command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Get it from https://docs.docker.com/get-docker/"
docker info >/dev/null 2>&1 || fail "Docker is not running. Start Docker Desktop and try again."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required (the 'docker compose' command)."

if [[ ! -f apps/api/.env ]]; then
  cp apps/api/.env.example apps/api/.env
  fail "Created apps/api/.env. Add your DEEPSEEK_API_KEY to it, then run ./start.sh again."
fi
grep -Eq '^DEEPSEEK_API_KEY=.+' apps/api/.env || fail "Set DEEPSEEK_API_KEY in apps/api/.env, then run ./start.sh again."

# Re-running while the app is up just rebuilds and restarts it, so only check
# the ports when our containers are not already running.
if [[ -z "$(docker compose ps --quiet 2>/dev/null)" ]] && command -v lsof >/dev/null 2>&1; then
  for port in 5501 5502; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      fail "Port $port is already in use by another process."
    fi
  done
fi

# Mounted into the API container. Creating them here keeps them owned by you.
mkdir -p data .cache

if [[ ! -f data/gita.db ]]; then
  echo "First run: the API will build the search index and download a 1.2 GB embedding model."
  echo "This can take several minutes. Later starts take seconds."
fi

echo "Building and starting containers..."
docker compose up --build --detach

wait_for() {
  local name=$1 url=$2 timeout=$3 elapsed=0
  printf "Waiting for %s" "$name"
  until curl -fsS -o /dev/null "$url" 2>/dev/null; do
    if ((elapsed >= timeout)); then
      echo
      fail "$name did not become ready in ${timeout}s. See: docker compose logs"
    fi
    if [[ -n "$(docker compose ps --status exited --quiet 2>/dev/null)" ]]; then
      echo
      docker compose logs --tail 40 >&2
      fail "A container exited. Logs are above."
    fi
    printf "."
    sleep 2
    elapsed=$((elapsed + 2))
  done
  echo " ready"
}

wait_for "API" "$API_URL/health" 1800
wait_for "web" "$WEB_URL" 300

cat <<EOF

Gita Guide is running.
  Web:  $WEB_URL
  API:  $API_URL

Logs: docker compose logs -f
Stop: docker compose down
EOF

if [[ "${1:-}" == "--logs" ]]; then
  docker compose logs -f
fi
