#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: deploy/deploy.sh --env test [--dry-run] [--help]

Builds the Yechao app, publishes it with its news API to BaoTa over SSH, and
configures the API systemd service and Nginx proxy.

Required environment:
  DAKA_DEPLOY_HOST       SSH host or configured SSH alias
  DAKA_DEPLOY_PATH       BaoTa site web root, e.g. /www/wwwroot/MyFront/daka
  DAKA_DEPLOY_HEALTH_URL Public test URL

Optional environment:
  DAKA_DEPLOY_USER       SSH user (default: root)
  DAKA_DEPLOY_PORT       SSH port (default: 22)
  DAKA_DEPLOY_SSH_KEY    Private key path; agent authentication is used if unset
  DAKA_DEPLOY_USE_SUDO   Use non-interactive sudo for release activation (default: 0)
  DAKA_DEPLOY_OWNER      Owner applied after activation (default with sudo: www:www)
  DAKA_DEPLOY_KEEP       Previous release copies retained (default: 3)
  DAKA_DEPLOY_NEWS_API_PORT        News API port (default: 8787)
  DAKA_DEPLOY_NEWS_SERVICE         systemd service name (default: daka-news-api)
  DAKA_DEPLOY_NODE_BIN             Node executable on the server (auto-detected)
  DAKA_DEPLOY_NGINX_BIN            Nginx executable (default: BaoTa path)
  DAKA_DEPLOY_NGINX_EXTENSION_DIR  BaoTa vhost extension directory
  DAKA_DEPLOY_API_HEALTH_URL       Public /api/health URL (derived from health URL)
  DAKA_DEPLOY_NEWS_CHECK_URL       Public API data-check URL (derived silently)
EOF
}

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_ENV=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env)
      [[ $# -ge 2 ]] || { echo "Missing value for --env" >&2; exit 2; }
      TARGET_ENV="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ "$TARGET_ENV" != "test" ]]; then
  echo "Only --env test is supported by this project." >&2
  exit 2
fi

cd "$ROOT"
if [[ -f "deploy/baota.env" ]]; then
  # shellcheck disable=SC1091
  source "deploy/baota.env"
fi

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "test" ]]; then
  echo "Deployment must run from the test branch; current branch: $CURRENT_BRANCH" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or push changes before deployment." >&2
  exit 1
fi

DEPLOY_HOST="${DAKA_DEPLOY_HOST:-106.55.36.254}"
DEPLOY_USER="${DAKA_DEPLOY_USER:-ubuntu}"
DEPLOY_PORT="${DAKA_DEPLOY_PORT:-22}"
DEPLOY_PATH="${DAKA_DEPLOY_PATH:-/www/wwwroot/daka}"
DEPLOY_HEALTH_URL="${DAKA_DEPLOY_HEALTH_URL:-http://106.55.36.254:23562/}"
DEPLOY_SSH_KEY="${DAKA_DEPLOY_SSH_KEY:-}"
DEPLOY_USE_SUDO="${DAKA_DEPLOY_USE_SUDO:-0}"
DEPLOY_OWNER="${DAKA_DEPLOY_OWNER:-}"
DEPLOY_KEEP="${DAKA_DEPLOY_KEEP:-3}"
DEPLOY_NEWS_API_PORT="${DAKA_DEPLOY_NEWS_API_PORT:-8787}"
DEPLOY_NEWS_SERVICE="${DAKA_DEPLOY_NEWS_SERVICE:-daka-news-api}"
DEPLOY_NODE_BIN="${DAKA_DEPLOY_NODE_BIN:-}"
DEPLOY_NGINX_BIN="${DAKA_DEPLOY_NGINX_BIN:-/www/server/nginx/sbin/nginx}"
DEPLOY_NGINX_EXTENSION_DIR="${DAKA_DEPLOY_NGINX_EXTENSION_DIR:-/www/server/panel/vhost/nginx/extension/${DEPLOY_HOST}}"
DEPLOY_API_HEALTH_URL="${DAKA_DEPLOY_API_HEALTH_URL:-${DEPLOY_HEALTH_URL%/}/api/health}"
DEPLOY_NEWS_CHECK_URL="${DAKA_DEPLOY_NEWS_CHECK_URL:-${DEPLOY_HEALTH_URL%/}/api/news?sources=qbitai,ithome}"
SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ "$DEPLOY_USE_SUDO" != "0" && "$DEPLOY_USE_SUDO" != "1" ]]; then
  echo "DAKA_DEPLOY_USE_SUDO must be 0 or 1." >&2
  exit 2
fi

if ! [[ "$DEPLOY_NEWS_API_PORT" =~ ^[0-9]+$ ]] ||
  (( DEPLOY_NEWS_API_PORT < 1 || DEPLOY_NEWS_API_PORT > 65535 )); then
  echo "DAKA_DEPLOY_NEWS_API_PORT must be a valid TCP port." >&2
  exit 2
fi

REMOTE_SUDO=""
if [[ "$DEPLOY_USE_SUDO" == "1" ]]; then
  REMOTE_SUDO="sudo -n"
  DEPLOY_OWNER="${DEPLOY_OWNER:-www:www}"
fi

SSH_OPTS=(-p "$DEPLOY_PORT" -o StrictHostKeyChecking=yes -o ConnectTimeout=10)
if [[ -n "$DEPLOY_SSH_KEY" ]]; then
  SSH_OPTS+=(-i "$DEPLOY_SSH_KEY")
fi

echo "Target: $SSH_TARGET:$DEPLOY_PATH"
echo "Health: $DEPLOY_HEALTH_URL"
echo "API: http://127.0.0.1:${DEPLOY_NEWS_API_PORT}/api/news via $DEPLOY_NEWS_SERVICE"

echo "[1/8] Installing dependencies"
npm ci

echo "[2/8] Building static app"
npm run build
touch dist/.nojekyll

COMMIT_SHA="$(git rev-parse --short HEAD)"
RELEASE_ID="$(date +%Y%m%d-%H%M%S)-$COMMIT_SHA"
REMOTE_STAGE="${DEPLOY_PATH}.deploy-${RELEASE_ID}"
REMOTE_BACKUP="${DEPLOY_PATH}.previous.${RELEASE_ID}"
REMOTE_SERVICE_FILE="/etc/systemd/system/${DEPLOY_NEWS_SERVICE}.service"
REMOTE_NGINX_CONF="${DEPLOY_NGINX_EXTENSION_DIR}/${DEPLOY_NEWS_SERVICE}.conf"
SSH_COMMAND=(ssh "${SSH_OPTS[@]}" "$SSH_TARGET")

if [[ "$DRY_RUN" == "1" ]]; then
  if [[ "$DEPLOY_USE_SUDO" == "1" ]]; then
    echo "[dry-run] ssh $SSH_TARGET $REMOTE_SUDO install -d $REMOTE_STAGE"
  else
    echo "[dry-run] ssh $SSH_TARGET mkdir -p $REMOTE_STAGE"
  fi
  echo "[dry-run] verify the server has Node.js 18+, otherwise install Node.js 22"
  echo "[dry-run] package dist/ and server/news-{api,service}.mjs into $REMOTE_STAGE"
  echo "[dry-run] ${REMOTE_SUDO:+$REMOTE_SUDO }atomically replace $DEPLOY_PATH"
  if [[ -n "$DEPLOY_OWNER" ]]; then
    echo "[dry-run] ${REMOTE_SUDO:+$REMOTE_SUDO }chown -R $DEPLOY_OWNER $DEPLOY_PATH"
  fi
  echo "[dry-run] install and restart $REMOTE_SERVICE_FILE"
  echo "[dry-run] write $REMOTE_NGINX_CONF and reload $DEPLOY_NGINX_BIN"
  echo "[dry-run] health checks $DEPLOY_HEALTH_URL $DEPLOY_API_HEALTH_URL"
  exit 0
fi

echo "[3/8] Ensuring Node.js 18+ is available"
"${SSH_COMMAND[@]}" "REMOTE_SUDO='$REMOTE_SUDO' bash -s" <<'REMOTE_NODE'
set -Eeuo pipefail

as_root() {
  if [[ -n "${REMOTE_SUDO:-}" ]]; then
    ${REMOTE_SUDO} "$@"
  else
    "$@"
  fi
}

node_major() {
  node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0
}

NODE_MAJOR=0
if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node_major)"
fi

if [[ "$NODE_MAJOR" -lt 18 ]]; then
  if [[ "$(id -u)" -ne 0 && -z "${REMOTE_SUDO:-}" ]]; then
    echo "Node.js 18+ is required, but this deploy user cannot install it." >&2
    exit 1
  fi
  command -v curl >/dev/null 2>&1 || {
    echo "curl is required to install Node.js." >&2
    exit 1
  }
  NODE_SETUP_FILE="$(mktemp /tmp/nodesource-setup.XXXXXX.sh)"
  trap 'rm -f "$NODE_SETUP_FILE"' EXIT
  curl -fsSL https://deb.nodesource.com/setup_22.x -o "$NODE_SETUP_FILE"
  as_root env DEBIAN_FRONTEND=noninteractive bash "$NODE_SETUP_FILE"
  as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
fi

NODE_MAJOR="$(node_major)"
if [[ "$NODE_MAJOR" -lt 18 ]]; then
  echo "Node.js $(node --version 2>/dev/null || echo unknown) is too old; version 18+ is required." >&2
  exit 1
fi
echo "Using Node.js $(node --version) at $(command -v node)"
REMOTE_NODE

DEPLOY_NODE_BIN="${DEPLOY_NODE_BIN:-$("${SSH_COMMAND[@]}" 'command -v node')}"
if [[ "$DEPLOY_NODE_BIN" != /* ]]; then
  echo "Could not resolve the remote Node.js executable." >&2
  exit 1
fi

echo "[4/8] Packaging release $RELEASE_ID"
RELEASE_TEMP="$(mktemp -d "${TMPDIR:-/tmp}/daka-release.XXXXXX")"
trap 'rm -rf "$RELEASE_TEMP"' EXIT
cp -R dist/. "$RELEASE_TEMP/"
mkdir -p "$RELEASE_TEMP/server"
cp server/news-api.mjs server/news-service.mjs "$RELEASE_TEMP/server/"

echo "[5/8] Uploading release $RELEASE_ID"
if [[ "$DEPLOY_USE_SUDO" == "1" ]]; then
  REMOTE_PREPARE="sudo -n install -d -m 0775 -o \"\$(id -u)\" -g \"\$(id -g)\" '$REMOTE_STAGE'"
else
  REMOTE_PREPARE="mkdir -p '$REMOTE_STAGE'"
fi

tar -C "$RELEASE_TEMP" -czf - . | "${SSH_COMMAND[@]}" "
set -Eeuo pipefail
$REMOTE_PREPARE
tar -xzf - -C '$REMOTE_STAGE'

echo '[6/8] Activating release'
if [[ -d '$DEPLOY_PATH' ]]; then
  $REMOTE_SUDO mv '$DEPLOY_PATH' '$REMOTE_BACKUP'
fi
if ! $REMOTE_SUDO mv '$REMOTE_STAGE' '$DEPLOY_PATH'; then
  $REMOTE_SUDO mv '$REMOTE_BACKUP' '$DEPLOY_PATH'
  exit 1
fi
if [[ -n '$DEPLOY_OWNER' ]]; then
  $REMOTE_SUDO chown -R '$DEPLOY_OWNER' '$DEPLOY_PATH'
fi
find '$(dirname "$DEPLOY_PATH")' -maxdepth 1 -type d -name '$(basename "$DEPLOY_PATH").previous.*' | sort -r | tail -n +$((DEPLOY_KEEP + 1)) | xargs -r $REMOTE_SUDO rm -rf
"

echo "[7/8] Configuring news API service and Nginx proxy"
"${SSH_COMMAND[@]}" "$REMOTE_SUDO install -d -m 0755 '$DEPLOY_NGINX_EXTENSION_DIR'"

{
  cat <<SERVICE
[Unit]
Description=Daka News API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=www
Group=www
WorkingDirectory=${DEPLOY_PATH}
Environment=NODE_ENV=production
Environment=NEWS_API_HOST=127.0.0.1
Environment=NEWS_API_PORT=${DEPLOY_NEWS_API_PORT}
ExecStart=${DEPLOY_NODE_BIN} ${DEPLOY_PATH}/server/news-api.mjs
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true

[Install]
WantedBy=multi-user.target
SERVICE
} | "${SSH_COMMAND[@]}" "$REMOTE_SUDO tee '$REMOTE_SERVICE_FILE' >/dev/null"

{
  cat <<NGINX
location ^~ /api/ {
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_connect_timeout 5s;
    proxy_send_timeout 45s;
    proxy_read_timeout 45s;
    proxy_pass http://127.0.0.1:${DEPLOY_NEWS_API_PORT};
}
NGINX
} | "${SSH_COMMAND[@]}" "$REMOTE_SUDO tee '$REMOTE_NGINX_CONF' >/dev/null"

"${SSH_COMMAND[@]}" "
set -Eeuo pipefail
$REMOTE_SUDO systemctl daemon-reload
$REMOTE_SUDO systemctl enable '$DEPLOY_NEWS_SERVICE'
$REMOTE_SUDO systemctl restart '$DEPLOY_NEWS_SERVICE'
$REMOTE_SUDO systemctl is-active --quiet '$DEPLOY_NEWS_SERVICE'
if [[ ! -x '$DEPLOY_NGINX_BIN' ]]; then
  echo 'Nginx executable not found: $DEPLOY_NGINX_BIN' >&2
  exit 1
fi
$REMOTE_SUDO '$DEPLOY_NGINX_BIN' -t
$REMOTE_SUDO '$DEPLOY_NGINX_BIN' -s reload
"

echo "Deployed test commit $COMMIT_SHA"
echo "[8/8] Health checks"
if ! curl -fsS --max-time 12 "$DEPLOY_HEALTH_URL" >/dev/null; then
  echo "Site health check failed for $DEPLOY_HEALTH_URL" >&2
  exit 1
fi

if ! curl -fsS --max-time 20 "$DEPLOY_API_HEALTH_URL" | grep -q '"ok":true'; then
  echo "News API health check failed for $DEPLOY_API_HEALTH_URL" >&2
  exit 1
fi

if ! curl -fsS --max-time 45 "$DEPLOY_NEWS_CHECK_URL" | grep -q '"sources"'; then
  echo "News API data check failed for $DEPLOY_NEWS_CHECK_URL" >&2
  exit 1
fi

echo "Health checks passed"
