#!/usr/bin/env bash
#
# Deploy this app to YOUR OWN Cloudflare account, backed by YOUR OWN Supabase
# project.
#
# WHAT IT DOES
# ------------
# 1. Loads your config from .env.cloudflare (falls back to .env).
# 2. Builds the browser bundle with YOUR public Supabase keys baked in, so the
#    deployed site talks to YOUR project (not Lovable Cloud).
# 3. Pushes the server-side values to your Worker as secrets, so server
#    functions (profile, admin role, reports, user management) work at runtime.
# 4. Deploys the Worker.
#
# USAGE
#   1. cp .env.cloudflare.example .env.cloudflare   # then fill it in
#   2. npx wrangler login                           # one time
#   3. bash scripts/deploy-cloudflare.sh
#
set -euo pipefail

CONFIG="dist/server/wrangler.json"
# Keep deploying to the Worker behind sama.safetyportal.workers.dev instead of
# silently creating a second Worker from the generated package name.
CLOUDFLARE_WORKER_NAME="${CLOUDFLARE_WORKER_NAME:-sama}"

# --- Load config -------------------------------------------------------------
load_env() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  # shellcheck disable=SC1090
  set -a; source "$file"; set +a
}
# .env.cloudflare wins over .env for the self-host case.
load_env ".env"
load_env ".env.cloudflare"

# Accept the APP_SUPABASE_* names previously used by the secure input form. If
# present, they deliberately override Lovable's defaults loaded from .env so
# both the browser bundle and Worker point to the user's own project.
if [[ -n "${APP_SUPABASE_URL:-}" ]]; then
  SUPABASE_URL="$APP_SUPABASE_URL"
  VITE_SUPABASE_URL="$APP_SUPABASE_URL"
else
  : "${SUPABASE_URL:=${VITE_SUPABASE_URL:-}}"
  : "${VITE_SUPABASE_URL:=${SUPABASE_URL:-}}"
fi

APP_PUBLISHABLE_KEY="${APP_SUPABASE_PUBLISHABLE_KEY:-${APP_SUPABASE_API_KEY:-}}"
if [[ -n "$APP_PUBLISHABLE_KEY" ]]; then
  SUPABASE_PUBLISHABLE_KEY="$APP_PUBLISHABLE_KEY"
  VITE_SUPABASE_PUBLISHABLE_KEY="$APP_PUBLISHABLE_KEY"
else
  : "${SUPABASE_PUBLISHABLE_KEY:=${VITE_SUPABASE_PUBLISHABLE_KEY:-}}"
  : "${VITE_SUPABASE_PUBLISHABLE_KEY:=${SUPABASE_PUBLISHABLE_KEY:-}}"
fi

if [[ -n "${APP_SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  SUPABASE_SERVICE_ROLE_KEY="$APP_SUPABASE_SERVICE_ROLE_KEY"
fi

if [[ -z "${VITE_SUPABASE_URL:-}" || -z "${VITE_SUPABASE_PUBLISHABLE_KEY:-}" ]]; then
  echo "ERROR: VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are missing."
  echo "       Fill them in .env.cloudflare (copy from .env.cloudflare.example)."
  exit 1
fi

# --- Build with YOUR keys ----------------------------------------------------
echo "==> Building browser bundle against ${VITE_SUPABASE_URL}"
export VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PROJECT_ID
bun run build

if [[ ! -f "$CONFIG" ]]; then
  echo "ERROR: Build completed without creating $CONFIG."
  exit 1
fi

# The generated name follows package.json and may not be the Worker the user is
# visiting. Pin it before both secret upload and deployment.
node -e '
  const fs = require("node:fs");
  const [path, name] = process.argv.slice(1);
  const config = JSON.parse(fs.readFileSync(path, "utf8"));
  config.name = name;
  fs.writeFileSync(path, JSON.stringify(config, null, 2) + "\n");
' "$CONFIG" "$CLOUDFLARE_WORKER_NAME"
echo "==> Updating Worker: $CLOUDFLARE_WORKER_NAME"

# --- Push Worker secrets -----------------------------------------------------
put_secret() {
  local name="$1"
  local value="${!name:-}"
  if [[ -z "$value" ]]; then
    echo "  - $name: (empty, skipped)"
    return 0
  fi
  printf '%s' "$value" | npx wrangler secret put "$name" -c "$CONFIG" >/dev/null
  echo "  - $name: set"
}

echo "==> Setting REQUIRED secrets (sign-in + data depend on these):"
put_secret SUPABASE_URL
put_secret SUPABASE_PUBLISHABLE_KEY

echo "==> Setting secrets for admin management + hidden admin + email:"
put_secret SUPABASE_SERVICE_ROLE_KEY
put_secret HIDDEN_ADMIN_EMAIL
put_secret HIDDEN_ADMIN_PASSWORD
put_secret RESEND_API_KEY
put_secret RESEND_FROM_EMAIL
put_secret LOVABLE_API_KEY

echo "==> Confirming required Worker secrets are attached:"
SECRET_LIST="$(npx wrangler secret list -c "$CONFIG")"
for required in SUPABASE_URL SUPABASE_PUBLISHABLE_KEY; do
  if ! grep -q "\"name\"[[:space:]]*:[[:space:]]*\"$required\"" <<<"$SECRET_LIST"; then
    echo "ERROR: $required was not attached to Worker $CLOUDFLARE_WORKER_NAME."
    exit 1
  fi
  echo "  - $required: confirmed"
done

echo "==> Deploying Worker..."
npx wrangler deploy -c "$CONFIG"

echo "==> Done. Open your Worker URL and sign in."
