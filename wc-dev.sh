#!/usr/bin/env bash

set -euo pipefail

COMPOSE_FILE="docker-compose.dev.yml"
DEV_SERVICES=(calcom-dev calcom-api-dev)

usage() {
  cat <<'EOF'
WhapCalendar local development

Usage:
  ./wc-dev.sh [command]

Commands:
  up       Start web + API dev services with hot reload (default)
  start    Start web + API dev services in the background
  deps     Reinstall dependencies into the Docker node_modules volume
  reset    Remove dev volumes and start from a clean state
  down     Stop dev services
  logs     Follow web + API dev logs
  ps       Show dev service status
  status   Show service status and local HTTP checks
  help     Show this help
EOF
}

require_docker() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "Docker is not installed or not available in PATH." >&2
    exit 1
  fi

  if ! docker compose version >/dev/null 2>&1; then
    echo "Docker Compose v2 is required. Make sure 'docker compose' works." >&2
    exit 1
  fi
}

require_env() {
  if [[ ! -f .env ]]; then
    echo "Missing .env. Create it from .env.example before starting WhapCalendar." >&2
    exit 1
  fi
}

compose() {
  docker compose -f "$COMPOSE_FILE" "$@"
}

check_url() {
  local url="$1"
  local label="$2"

  if ! command -v curl >/dev/null 2>&1; then
    echo "$label: curl is not available"
    return 0
  fi

  if curl -fsS -o /dev/null -I --max-time 5 "$url"; then
    echo "$label: OK ($url)"
  else
    echo "$label: not ready ($url)"
  fi
}

command_name="${1:-up}"

case "$command_name" in
  up)
    require_docker
    require_env
    echo "Starting WhapCalendar dev services in the foreground."
    echo "First run can take a while while calcom-deps installs dependencies."
    compose up "${DEV_SERVICES[@]}"
    ;;
  start)
    require_docker
    require_env
    echo "Starting WhapCalendar dev services in the background."
    echo "First run can take a while while calcom-deps installs dependencies."
    compose up -d "${DEV_SERVICES[@]}"
    compose ps
    ;;
  deps)
    require_docker
    require_env
    compose up --force-recreate calcom-deps
    ;;
  reset)
    require_docker
    require_env
    compose down -v
    compose up "${DEV_SERVICES[@]}"
    ;;
  down)
    require_docker
    compose down
    ;;
  logs)
    require_docker
    compose logs -f "${DEV_SERVICES[@]}"
    ;;
  ps)
    require_docker
    compose ps
    ;;
  status)
    require_docker
    compose ps
    echo
    check_url "http://localhost:3000" "Web"
    check_url "http://localhost:${API_PORT:-5555}/api/v2" "API v2"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    echo "Unknown command: $command_name" >&2
    echo >&2
    usage >&2
    exit 1
    ;;
esac
