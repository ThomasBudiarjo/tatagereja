#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/pocketbase-version.sh"
BACKEND_DIR=$(dirname "$SCRIPT_DIR")
POCKETBASE_BIN="$BACKEND_DIR/.pocketbase/$POCKETBASE_VERSION/pocketbase"

"$SCRIPT_DIR/install-pocketbase.sh"

exec "$POCKETBASE_BIN" serve \
  --http="${POCKETBASE_HTTP:-127.0.0.1:8090}" \
  --dir="$BACKEND_DIR/pb_data" \
  --hooksDir="$BACKEND_DIR/pb_hooks" \
  --migrationsDir="$BACKEND_DIR/pb_migrations"
