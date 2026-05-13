#!/usr/bin/env bash
set -euo pipefail
echo "Starting frontend (5173) and backend (8080)..."
trap 'kill 0' EXIT
(cd backend && air) &
(cd frontend && npm run dev) &
wait
