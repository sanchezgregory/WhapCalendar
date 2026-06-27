#!/usr/bin/env bash

set -euo pipefail

COMPOSE_FILE="docker-compose.wc.yml"
DEFAULT_POSTGRES_USER="unicorn_user"
DEFAULT_POSTGRES_DB="calendso"

usage() {
  cat <<'EOF'
WhapCalendar deploy helper

Usage:
  ./scripts/wc-up.sh
  ./scripts/wc-up.sh --target vps --mode testing
  ./scripts/wc-up.sh --target local --mode testing --rebuild

Options:
  --target local|vps       Deployment target
  --mode testing|production Deployment mode
  --action up|status|logs|down Action to run (default: up)
  --rebuild                Build images before starting services
  --auto-port              Allow production mode to pick a different web port if the preferred port is busy
  --allow-branch           Skip branch/mode safety check
  --help                   Show this help
EOF
}

TARGET=""
MODE=""
ACTION="up"
REBUILD=0
AUTO_PORT=0
ALLOW_BRANCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --mode)
      MODE="${2:-}"
      shift 2
      ;;
    --action)
      ACTION="${2:-}"
      shift 2
      ;;
    --rebuild)
      REBUILD=1
      shift
      ;;
    --auto-port)
      AUTO_PORT=1
      shift
      ;;
    --allow-branch)
      ALLOW_BRANCH=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

prompt_choice() {
  local prompt="$1"
  shift
  local options=("$@")
  local choice=""

  echo >&2
  echo "$prompt" >&2
  local i=1
  for option in "${options[@]}"; do
    echo "  $i) $option" >&2
    i=$((i + 1))
  done

  while true; do
    read -r -p "Choose an option: " choice
    if [[ "$choice" =~ ^[0-9]+$ ]] && (( choice >= 1 && choice <= ${#options[@]} )); then
      echo "${options[$((choice - 1))]}"
      return 0
    fi
    echo "Invalid choice." >&2
  done
}

confirm() {
  local prompt="$1"
  local answer=""
  read -r -p "$prompt [y/N] " answer
  [[ "$answer" == "y" || "$answer" == "Y" || "$answer" == "yes" || "$answer" == "YES" ]]
}

repo_root() {
  git rev-parse --show-toplevel 2>/dev/null
}

current_branch() {
  git branch --show-current 2>/dev/null
}

is_port_busy() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 && return 0
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn | grep -qE "[:.]$port[[:space:]]" && return 0
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -ltn 2>/dev/null | grep -qE "[:.]$port[[:space:]]" && return 0
  fi

  return 1
}

first_free_port() {
  local port="$1"
  while is_port_busy "$port"; do
    port=$((port + 1))
  done
  echo "$port"
}

random_base64() {
  local bytes="$1"
  openssl rand -base64 "$bytes" | tr -d '\n'
}

random_hex() {
  local bytes="$1"
  openssl rand -hex "$bytes" | tr -d '\n'
}

env_get() {
  local key="$1"
  local file="$2"
  local line=""

  line=$(grep -E "^${key}=" "$file" | tail -n 1 || true)
  if [[ -z "$line" ]]; then
    return 1
  fi

  line="${line#*=}"
  line="${line%$'\r'}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

env_set() {
  local key="$1"
  local value="$2"
  local file="$3"
  local escaped_value=""

  escaped_value=$(printf '%s' "$value" | sed 's/[&/]/\\&/g')
  if grep -qE "^${key}=" "$file"; then
    sed -i.bak "s/^${key}=.*/${key}=${escaped_value}/" "$file"
    rm -f "${file}.bak"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

env_ensure() {
  local key="$1"
  local value="$2"
  local file="$3"
  local current=""

  current=$(env_get "$key" "$file" || true)
  if [[ -z "$current" ]]; then
    env_set "$key" "$value" "$file"
  fi
}

env_ensure_defined() {
  local key="$1"
  local file="$2"

  if ! grep -qE "^${key}=" "$file"; then
    printf '\n%s=\n' "$key" >> "$file"
  fi
}

detect_public_ip() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsS --max-time 3 https://api.ipify.org 2>/dev/null || true
  fi
}

prompt_host() {
  local default_host="$1"
  local host=""

  read -r -p "Public host/IP for browser URLs [$default_host]: " host
  if [[ -z "$host" ]]; then
    host="$default_host"
  fi
  echo "$host"
}

compose() {
  WC_ENV_FILE="$ENV_FILE" docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
}

require_command git
require_command docker
require_command openssl
require_command grep
require_command sed

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose v2 is required. Make sure 'docker compose' works." >&2
  exit 1
fi

ROOT="$(repo_root)"
if [[ -z "$ROOT" || ! -f "$ROOT/AGENTS.md" || ! -d "$ROOT/apps/web" || ! -d "$ROOT/packages/prisma" ]]; then
  echo "This script must be run inside the WhapCalendar repository." >&2
  exit 1
fi

cd "$ROOT"

if [[ ! -f "$COMPOSE_FILE" ]]; then
  echo "Missing $COMPOSE_FILE." >&2
  exit 1
fi

if [[ -z "$TARGET" ]]; then
  TARGET=$(prompt_choice "Select target:" "local" "vps")
fi

if [[ -z "$MODE" ]]; then
  MODE=$(prompt_choice "Select mode:" "testing" "production")
fi

if [[ "$TARGET" != "local" && "$TARGET" != "vps" ]]; then
  echo "Invalid target: $TARGET" >&2
  exit 1
fi

if [[ "$MODE" != "testing" && "$MODE" != "production" ]]; then
  echo "Invalid mode: $MODE" >&2
  exit 1
fi

if [[ "$ACTION" != "up" && "$ACTION" != "status" && "$ACTION" != "logs" && "$ACTION" != "down" ]]; then
  echo "Invalid action: $ACTION" >&2
  exit 1
fi

BRANCH="$(current_branch)"
EXPECTED_BRANCH="develop"
if [[ "$MODE" == "production" ]]; then
  EXPECTED_BRANCH="master"
fi

echo
echo "Selected deployment:"
echo "  Target: $TARGET"
echo "  Mode: $MODE"
echo "  Current branch: ${BRANCH:-unknown}"
echo "  Expected branch: $EXPECTED_BRANCH"
echo "  Action: $ACTION"

if [[ "$ALLOW_BRANCH" -ne 1 && "$BRANCH" != "$EXPECTED_BRANCH" ]]; then
  echo
  echo "Branch mismatch. Switch branch first:"
  echo "  git checkout $EXPECTED_BRANCH"
  echo
  echo "Or rerun with --allow-branch if this is intentional."
  exit 1
fi

if [[ "$ACTION" == "up" ]] && ! confirm "Continue with this deployment?"; then
  echo "Aborted."
  exit 0
fi

ENV_FILE=".env.wc.${TARGET}.${MODE}"
PREFIX="whapcalendar-${TARGET}-${MODE}"

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f .env.example ]]; then
    cp .env.example "$ENV_FILE"
  else
    touch "$ENV_FILE"
  fi
  printf '\n# WhapCalendar generated deployment settings\n' >> "$ENV_FILE"
fi

if [[ "$TARGET" == "local" ]]; then
  DEFAULT_HOST="localhost"
  WEB_BIND_HOST="0.0.0.0"
  API_BIND_HOST="127.0.0.1"
  DB_BIND_HOST="127.0.0.1"
  WHAP_PORT="8001"
else
  DEFAULT_HOST="$(detect_public_ip)"
  if [[ -z "$DEFAULT_HOST" ]]; then
    DEFAULT_HOST="VPS_IP"
  fi
  WEB_BIND_HOST="0.0.0.0"
  API_BIND_HOST="0.0.0.0"
  DB_BIND_HOST="127.0.0.1"
  WHAP_PORT="8001"
  if [[ "$MODE" == "testing" ]]; then
    WHAP_PORT="8002"
  fi
fi

HOST_VALUE="$(env_get WC_PUBLIC_HOST "$ENV_FILE" || true)"
if [[ -z "$HOST_VALUE" || "$HOST_VALUE" == "VPS_IP" ]]; then
  HOST_VALUE="$(prompt_host "$DEFAULT_HOST")"
  env_set WC_PUBLIC_HOST "$HOST_VALUE" "$ENV_FILE"
fi

if [[ "$MODE" == "production" ]]; then
  WEB_PORT_DEFAULT="3000"
  API_PORT_DEFAULT="5555"
  DB_PORT_DEFAULT="5434"
else
  WEB_PORT_DEFAULT="3001"
  API_PORT_DEFAULT="5556"
  DB_PORT_DEFAULT="5434"
fi

WEB_PORT="$(env_get WC_WEB_PORT "$ENV_FILE" || true)"
API_PORT="$(env_get WC_API_PORT "$ENV_FILE" || true)"
DB_PORT="$(env_get WC_DB_PORT "$ENV_FILE" || true)"

if [[ -z "$WEB_PORT" ]]; then
  if [[ "$MODE" == "production" && "$AUTO_PORT" -ne 1 && "$WEB_PORT_DEFAULT" == "3000" && $(is_port_busy 3000 && echo busy || echo free) == "busy" ]]; then
    echo
    echo "Port 3000 is already in use. Production should not silently choose another web port."
    if confirm "Pick the next available production web port anyway?"; then
      WEB_PORT="$(first_free_port "$WEB_PORT_DEFAULT")"
    else
      echo "Aborted."
      exit 1
    fi
  else
    WEB_PORT="$(first_free_port "$WEB_PORT_DEFAULT")"
  fi
fi

if [[ -z "$API_PORT" ]]; then
  API_PORT="$(first_free_port "$API_PORT_DEFAULT")"
fi

if [[ -z "$DB_PORT" ]]; then
  DB_PORT="$(first_free_port "$DB_PORT_DEFAULT")"
fi

WEB_URL="http://${HOST_VALUE}:${WEB_PORT}"
API_URL_VALUE="http://${HOST_VALUE}:${API_PORT}"
WHAP_URL="http://${HOST_VALUE}:${WHAP_PORT}"

env_set WC_TARGET "$TARGET" "$ENV_FILE"
env_set WC_MODE "$MODE" "$ENV_FILE"
env_set WC_ENV_FILE "$ENV_FILE" "$ENV_FILE"
env_set WC_CONTAINER_PREFIX "$PREFIX" "$ENV_FILE"
env_set WC_WEB_BIND_HOST "$WEB_BIND_HOST" "$ENV_FILE"
env_set WC_API_BIND_HOST "$API_BIND_HOST" "$ENV_FILE"
env_set WC_DB_BIND_HOST "$DB_BIND_HOST" "$ENV_FILE"
env_set WC_WEB_PORT "$WEB_PORT" "$ENV_FILE"
env_set WC_API_PORT "$API_PORT" "$ENV_FILE"
env_set WC_DB_PORT "$DB_PORT" "$ENV_FILE"

env_ensure POSTGRES_USER "$DEFAULT_POSTGRES_USER" "$ENV_FILE"
env_ensure POSTGRES_PASSWORD "$(random_base64 24)" "$ENV_FILE"
env_ensure POSTGRES_DB "$DEFAULT_POSTGRES_DB" "$ENV_FILE"
env_set DATABASE_HOST "database" "$ENV_FILE"

env_ensure NEXTAUTH_SECRET "$(random_base64 32)" "$ENV_FILE"
env_ensure JWT_SECRET "$(random_base64 32)" "$ENV_FILE"
env_ensure CALENDSO_ENCRYPTION_KEY "$(random_base64 24)" "$ENV_FILE"
env_ensure WHAPCALENDAR_WEBHOOK_SECRET "$(random_base64 32)" "$ENV_FILE"
env_ensure CRON_API_KEY "$(random_hex 16)" "$ENV_FILE"

env_set NODE_ENV "production" "$ENV_FILE"
env_set NEXT_PUBLIC_WEBAPP_URL "$WEB_URL" "$ENV_FILE"
env_set NEXT_PUBLIC_WEBSITE_URL "$WEB_URL" "$ENV_FILE"
env_set NEXTAUTH_URL "$WEB_URL" "$ENV_FILE"
env_set WEB_APP_URL "$WEB_URL" "$ENV_FILE"
env_set API_URL "$API_URL_VALUE" "$ENV_FILE"
env_set NEXT_PUBLIC_API_V2_URL "${API_URL_VALUE}/api/v2" "$ENV_FILE"
env_set NEXT_PUBLIC_EMBED_LIB_URL "${WEB_URL}/embed/embed.js" "$ENV_FILE"
env_set ALLOWED_HOSTNAMES "\"${HOST_VALUE}:${WEB_PORT}\",\"localhost:${WEB_PORT}\",\"127.0.0.1:${WEB_PORT}\"" "$ENV_FILE"
env_set NEXTAUTH_COOKIE_DOMAIN "" "$ENV_FILE"
env_set NEXT_PUBLIC_WHAP_URL "$WHAP_URL" "$ENV_FILE"
env_set NEXT_PUBLIC_WHAP_LOGIN_URL "${WHAP_URL}/login" "$ENV_FILE"
env_set NEXT_PUBLIC_WHAP_PROFILE_URL "${WHAP_URL}/backoffice/settings/profile" "$ENV_FILE"
env_set WHAP_API_BASE_URL "http://host.docker.internal:${WHAP_PORT}/api" "$ENV_FILE"
env_set REDIS_URL "redis://redis:6379" "$ENV_FILE"
env_set CALCOM_TELEMETRY_DISABLED "1" "$ENV_FILE"
env_set CRON_ENABLE_APP_SYNC "false" "$ENV_FILE"

OPTIONAL_COMPOSE_KEYS=(
  NEXT_PUBLIC_LICENSE_CONSENT
  NEXT_PUBLIC_WEBSITE_TERMS_URL
  NEXT_PUBLIC_WEBSITE_PRIVACY_POLICY_URL
  NEXT_PUBLIC_SINGLE_ORG_SLUG
  ORGANIZATIONS_ENABLED
  CSP_POLICY
  LOG_LEVEL
  API_KEY_PREFIX
  REWRITE_API_V2_PREFIX
  CALCOM_LICENSE_KEY
  NEXT_PUBLIC_VAPID_PUBLIC_KEY
  VAPID_PRIVATE_KEY
  STRIPE_API_KEY
  STRIPE_WEBHOOK_SECRET
  STRIPE_PRICE_ID_STARTER
  STRIPE_PRICE_ID_STARTER_OVERAGE
  STRIPE_PRICE_ID_ESSENTIALS
  STRIPE_PRICE_ID_ESSENTIALS_OVERAGE
  STRIPE_PRICE_ID_ENTERPRISE
  STRIPE_PRICE_ID_ENTERPRISE_OVERAGE
  STRIPE_TEAM_MONTHLY_PRICE_ID
  IS_TEAM_BILLING_ENABLED
  AXIOM_DATASET
  AXIOM_TOKEN
  LOGGER_BRIDGE_LOG_LEVEL
  DOCS_URL
  GET_LICENSE_KEY_URL
)

for key in "${OPTIONAL_COMPOSE_KEYS[@]}"; do
  env_ensure_defined "$key" "$ENV_FILE"
done

POSTGRES_USER_VALUE="$(env_get POSTGRES_USER "$ENV_FILE")"
POSTGRES_PASSWORD_VALUE="$(env_get POSTGRES_PASSWORD "$ENV_FILE")"
POSTGRES_DB_VALUE="$(env_get POSTGRES_DB "$ENV_FILE")"

if [[ "$ACTION" == "status" ]]; then
  compose ps
elif [[ "$ACTION" == "logs" ]]; then
  compose logs -f calcom calcom-api
elif [[ "$ACTION" == "down" ]]; then
  compose down
else
  echo
  echo "Validating Docker Compose configuration..."
  compose config >/dev/null

  echo "Starting database and redis..."
  compose up -d database redis

  if [[ "$REBUILD" -eq 1 ]]; then
    echo "Building web and API images..."
    compose build calcom calcom-api
  else
    echo "Building missing images if needed..."
    compose build calcom calcom-api
  fi

  echo "Starting WhapCalendar services..."
  compose up -d calcom calcom-api
  compose ps
fi

echo
echo "WhapCalendar deployment result"
echo
echo "Target: $TARGET"
echo "Mode: $MODE"
echo "Branch: ${BRANCH:-unknown}"
echo "Compose file: $COMPOSE_FILE"
echo "Env file: $ENV_FILE"
echo
echo "Web:"
echo "  $WEB_URL"
echo
echo "API v2:"
echo "  ${API_URL_VALUE}/api/v2"
echo
echo "Containers:"
echo "  ${PREFIX}-web"
echo "  ${PREFIX}-api"
echo "  ${PREFIX}-database"
echo "  ${PREFIX}-redis"
echo
echo "Database:"
echo "  Container host: database"
echo "  VPS/local host: 127.0.0.1"
echo "  VPS/local port: $DB_PORT"
echo "  Database: $POSTGRES_DB_VALUE"
echo "  User: $POSTGRES_USER_VALUE"
echo "  Password: $POSTGRES_PASSWORD_VALUE"
echo
if [[ "$TARGET" == "vps" ]]; then
  echo "Local DB client tunnel:"
  echo "  ssh -L ${DB_PORT}:127.0.0.1:${DB_PORT} root@${HOST_VALUE}"
  echo
fi
echo "Local DB client:"
echo "  Host: 127.0.0.1"
echo "  Port: $DB_PORT"
echo "  Database: $POSTGRES_DB_VALUE"
echo "  User: $POSTGRES_USER_VALUE"
echo "  Password: $POSTGRES_PASSWORD_VALUE"
