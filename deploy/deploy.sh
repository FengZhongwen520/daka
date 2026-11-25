#!/usr/bin/env bash
set -Eeuo pipefail

usage() {
  cat <<'EOF'
Usage: deploy/deploy.sh --env test [--dry-run] [--help]

Builds the static Daka app and publishes dist/ to the GitHub Pages branch.

Environment overrides:
  DEPLOY_REMOTE       Git remote to push to (default: gitub)
  DEPLOY_BRANCH       Deployment branch (default: gh-pages)
  DEPLOY_HEALTH_URL   URL probed after publish
                      (default: https://fengzhongwen520.github.io/daka/)
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

CURRENT_BRANCH="$(git branch --show-current)"
if [[ "$CURRENT_BRANCH" != "test" ]]; then
  echo "Deployment must run from the test branch; current branch: $CURRENT_BRANCH" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or push changes before deployment." >&2
  exit 1
fi

DEPLOY_REMOTE="${DEPLOY_REMOTE:-gitub}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-gh-pages}"
DEPLOY_HEALTH_URL="${DEPLOY_HEALTH_URL:-https://fengzhongwen520.github.io/daka/}"
REMOTE_URL="$(git remote get-url "$DEPLOY_REMOTE")"
COMMIT_SHA="$(git rev-parse --short HEAD)"

echo "[1/4] Installing dependencies"
npm ci

echo "[2/4] Building static app"
npm run build
touch dist/.nojekyll

STAGE_DIR="$(mktemp -d)"
trap 'rm -rf "$STAGE_DIR"' EXIT
cp -R dist/. "$STAGE_DIR/"

echo "[3/4] Creating deployment commit"
git -C "$STAGE_DIR" init -q
git -C "$STAGE_DIR" checkout -q -b "$DEPLOY_BRANCH"
git -C "$STAGE_DIR" add -A
git -C "$STAGE_DIR" \
  -c user.name="Daka Deploy" \
  -c user.email="deploy@local.invalid" \
  commit -q -m "deploy: test $COMMIT_SHA"

if [[ "$DRY_RUN" == "1" ]]; then
  echo "[dry-run] git push --force $DEPLOY_REMOTE HEAD:$DEPLOY_BRANCH"
  echo "[dry-run] health check $DEPLOY_HEALTH_URL"
  exit 0
fi

echo "[4/4] Publishing to $DEPLOY_REMOTE/$DEPLOY_BRANCH"
git -C "$STAGE_DIR" push --force "$REMOTE_URL" "HEAD:refs/heads/$DEPLOY_BRANCH"

echo "Published commit $COMMIT_SHA"
echo "Health check: $DEPLOY_HEALTH_URL"
for _ in $(seq 1 12); do
  if curl -fsS --max-time 8 "$DEPLOY_HEALTH_URL" >/dev/null; then
    echo "Health check passed"
    exit 0
  fi
  sleep 5
done

echo "Deployment branch was pushed, but the public URL is not healthy yet." >&2
echo "Check GitHub Pages settings for $DEPLOY_HEALTH_URL" >&2
exit 1
