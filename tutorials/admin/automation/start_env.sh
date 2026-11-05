#!/usr/bin/env bash
# Starts the isolated tutorial environment (Git Bash on Windows).
#   MongoDB replica set  127.0.0.1:27118  (data in tutorials/admin/.local/mongo-data)
#   SMTP sink            127.0.0.1:2525   (captures mail into .local/mail, sends nothing)
#   API                  http://localhost:4100  (env from .local/api.env, never the project .env)
#   Web (prod build)     http://localhost:3100  (distDir apps/web/.next/tutorial)
# Usage: bash tutorials/admin/automation/start_env.sh [--rebuild]
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
LOCAL="$HERE/.local"
mkdir -p "$LOCAL/mongo-data" "$LOCAL/logs" "$LOCAL/mail"
MONGOD="${MONGOD:-$HOME/.cache/mongodb-binaries/mongod-x64-win32-8.2.6.exe}"

if [ ! -f "$LOCAL/api.env" ]; then
  echo "Missing $LOCAL/api.env (see automation/README.md)"; exit 1
fi
grep -q '^MONGODB_URI=mongodb://127.0.0.1:27118/mymacademia_tutorial' "$LOCAL/api.env" || {
  echo "api.env does not point to the local tutorial DB. Aborting."; exit 1; }

port_open() { netstat -ano | grep -q ":$1 .*LISTEN"; }

if ! port_open 27118; then
  "$MONGOD" --dbpath "$(cygpath -w "$LOCAL/mongo-data")" --port 27118 --bind_ip 127.0.0.1 \
    --replSet rs0 --logpath "$(cygpath -w "$LOCAL/logs/mongod.log")" --logappend &
  sleep 4
  mongosh --quiet "mongodb://127.0.0.1:27118/?directConnection=true" \
    --eval "try{rs.status().ok}catch(e){rs.initiate({_id:'rs0',members:[{_id:0,host:'127.0.0.1:27118'}]}).ok}"
  sleep 3
fi

if ! port_open 2525; then
  "$LOCAL/venv/Scripts/python" "$HERE/automation/smtp_sink.py" > "$LOCAL/logs/smtp.log" 2>&1 &
fi

if ! port_open 4100; then
  (cd "$REPO/apps/api" && DOTENV_CONFIG_PATH="$LOCAL/api.env" npx tsx src/server.ts > "$LOCAL/logs/api.log" 2>&1 &)
fi

if [ "${1:-}" = "--rebuild" ] || [ ! -d "$REPO/apps/web/.next/tutorial" ]; then
  # next build rewrites next-env.d.ts and tsconfig.json for the alternate distDir:
  # keep the project's versions untouched.
  cp "$REPO/apps/web/next-env.d.ts" "$LOCAL/next-env.d.ts.bak"
  cp "$REPO/apps/web/tsconfig.json" "$LOCAL/tsconfig.json.bak"
  (cd "$REPO/apps/web" && NEXT_PUBLIC_API_URL=http://localhost:4100/api MYM_E2E_DIST_DIR=.next/tutorial \
    pnpm exec next build > "$LOCAL/logs/web-build.log" 2>&1) || true
  cp "$LOCAL/next-env.d.ts.bak" "$REPO/apps/web/next-env.d.ts"
  cp "$LOCAL/tsconfig.json.bak" "$REPO/apps/web/tsconfig.json"
fi
if ! port_open 3100; then
  (cd "$REPO/apps/web" && NEXT_PUBLIC_API_URL=http://localhost:4100/api MYM_E2E_DIST_DIR=.next/tutorial \
    pnpm exec next start --port 3100 > "$LOCAL/logs/web.log" 2>&1 &)
fi

for i in $(seq 1 30); do
  curl -sf http://127.0.0.1:4100/api/health >/dev/null && curl -sf -o /dev/null http://localhost:3100/login && { echo "Tutorial environment ready."; exit 0; }
  sleep 2
done
echo "Environment did not become ready; check $LOCAL/logs"; exit 1
