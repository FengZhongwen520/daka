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
DEPLOY_KEEP="${DAKA_DEPLOY_KEEP:-3}"
SSH_TARGET="${DEPLOY_USER}@${DEPLOY_HOST}"

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
  echo "[dry-run] ssh $SSH_TARGET mkdir -p $REMOTE_STAGE"
  echo "[dry-run] tar dist/ | ssh $SSH_TARGET tar -xzf - -C $REMOTE_STAGE"
  echo "[dry-run] atomically replace $DEPLOY_PATH"
  echo "[dry-run] health check $DEPLOY_HEALTH_URL"
  exit 0
fi

echo "[3/5] Uploading release $RELEASE_ID"
tar -C dist -czf - . | "${FINAL_UPLOAD[@]}" "mkdir -p '$REMOTE_STAGE' && tar -xzf - -C '$REMOTE_STAGE'"

echo "[4/5] Activating release"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "
set -Eeuo pipefail
if [[ -d '$DEPLOY_PATH' ]]; then
  mv '$DEPLOY_PATH' '$REMOTE_BACKUP'
fi
if ! mv '$REMOTE_STAGE' '$DEPLOY_PATH'; then
  mv '$REMOTE_BACKUP' '$DEPLOY_PATH'
  exit 1
fi
find '$(dirname "$DEPLOY_PATH")' -maxdepth 1 -type d -name '$(basename "$DEPLOY_PATH").previous.*' | sort -r | tail -n +$((DEPLOY_KEEP + 1)) | xargs -r rm -rf
"

echo "Deployed test commit $COMMIT_SHA"
echo "[5/5] Health check: $DEPLOY_HEALTH_URL"
if curl -fsS --max-time 12 "$DEPLOY_HEALTH_URL" >/dev/null; then
  echo "Health check passed"
  exit 0
fi

echo "Upload completed, but health check failed for $DEPLOY_HEALTH_URL" >&2
exit 1
