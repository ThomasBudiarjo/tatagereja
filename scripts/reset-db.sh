#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../backend"
rm -f local.db local.db-shm local.db-wal
atlas schema apply --env local --auto-approve
echo "Database reset complete."
