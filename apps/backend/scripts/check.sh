#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
. "$SCRIPT_DIR/pocketbase-version.sh"
BACKEND_DIR=$(dirname "$SCRIPT_DIR")
POCKETBASE_BIN="$BACKEND_DIR/.pocketbase/$POCKETBASE_VERSION/pocketbase"

"$SCRIPT_DIR/install-pocketbase.sh"

"$POCKETBASE_BIN" --version
