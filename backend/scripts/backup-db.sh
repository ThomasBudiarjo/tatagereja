#!/usr/bin/env bash
set -euo pipefail
OUTPUT="${1:-backup-$(date +%Y%m%d).sql}"
echo "Backing up to $OUTPUT..."
turso db shell shepherd-prod ".dump" > "$OUTPUT"
echo "Done: $OUTPUT"
