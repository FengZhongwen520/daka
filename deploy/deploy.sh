#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: deploy/deploy.sh --env test [--dry-run] [--help]

Builds the static Daka app and publishes it to the BaoTa site directory over SSH.

Required environment:
  DAKA_DEPLOY_HOST       SSH host or configured SSH alias
  DAKA_DEPLOY_PATH       BaoTa site web root, for example /www/wwwroot/daka
  DAKA_DEPLOY_HEALTH_URL Public test URL

Optional environment:
  DAKA_DEPLOY_USER       SSH user (default: root)
  DAKA_DEPLOY_PORT       SSH port (default: 22)
  DAKA_DEPLOY_SSH_KEY    Private key path; agent authentication is used if unset
  DAKA_DEPLOY_USE_SUDO   Use non-interactive sudo for release activation (default: 0)
  DAKA_DEPLOY_OWNER      Owner applied after activation (default with sudo: www:www)
  DAKA_DEPLOY_KEEP       Previous release copies retained (default: 3)
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
SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

if [[ "$DEPLOY_USE_SUDO" != "0" && "$DEPLOY_USE_SUDO" != "1" ]]; then
  echo "DAKA_DEPLOY_USE_SUDO must be 0 or 1." >&2
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

echo "[1/5] Installing dependencies"
npm ci

echo "[2/5] Building static app"
npm run build
touch dist/.nojekyll

COMMIT_SHA="$(git rev-parse --short HEAD)"
RELEASE_ID="$(date +%Y%m%d-%H%M%S)-$COMMIT_SHA"
REMOTE_STAGE="${DEPLOY_PATH}.deploy-${RELEASE_ID}"
REMOTE_BACKUP="${DEPLOY_PATH}.previous.${RELEASE_ID}"
FINAL_UPLOAD=(ssh "${SSH_OPTS[@]}" "$SSH_TARGET")

if [[ "$DRY_RUN" == "1" ]]; then
  if [[ "$DEPLOY_USE_SUDO" == "1" ]]; then
    echo "[dry-run] ssh $SSH_TARGET $REMOTE_SUDO install -d $REMOTE_STAGE"
  else
    echo "[dry-run] ssh $SSH_TARGET mkdir -p $REMOTE_STAGE"
  fi
  echo "[dry-run] tar dist/ | ssh $SSH_TARGET tar -xzf - -C $REMOTE_STAGE"
  echo "[dry-run] ${REMOTE_SUDO:+$REMOTE_SUDO }atomically replace $DEPLOY_PATH"
  if [[ -n "$DEPLOY_OWNER" ]]; then
    echo "[dry-run] ${REMOTE_SUDO:+$REMOTE_SUDO }chown -R $DEPLOY_OWNER $DEPLOY_PATH"
  fi
  echo "[dry-run] health check $DEPLOY_HEALTH_URL"
  exit 0
fi

echo "[3/5] Uploading release $RELEASE_ID"
if [[ "$DEPLOY_USE_SUDO" == "1" ]]; then
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" \
    "sudo -n install -d -m 0775 -o \"\$(id -u)\" -g \"\$(id -g)\" '$REMOTE_STAGE'"
else
  ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p '$REMOTE_STAGE'"
fi
tar -C dist -czf - . | "${FINAL_UPLOAD[@]}" "tar -xzf - -C '$REMOTE_STAGE'"

echo "[4/5] Activating release"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "
set -Eeuo pipefail
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

echo "Deployed test commit $COMMIT_SHA"
echo "[5/5] Health check: $DEPLOY_HEALTH_URL"
if curl -fsS --max-time 12 "$DEPLOY_HEALTH_URL" >/dev/null; then
  echo "Health check passed"
  exit 0
fi

echo "Upload completed, but health check failed for $DEPLOY_HEALTH_URL" >&2
exit 1
