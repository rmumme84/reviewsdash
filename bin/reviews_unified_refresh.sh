#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ACKER_ROOT:-$(cd "$SCRIPT_DIR/.." && pwd)}"
DATA_DIR="$ROOT/data/reviews"
LOG=${LOG:-$DATA_DIR/reviews_unified_refresh.log}
mkdir -p "$(dirname "$LOG")"

export ACKER_ROOT="$ROOT"

echo "[$(date -Is)] refresh start" | tee -a "$LOG"

# IMPORTANT: SSOT is data/reviews/reviews_archive.jsonl
# Collection is out of scope for this restore MVP.
# This refresh script only rebuilds derived datasets.

node "$ROOT/bin/reviews_unified_build.js" \
  --places "$DATA_DIR/places.json" \
  --google-places "$DATA_DIR/google_places_reviews.json" \
  --archive "$DATA_DIR/reviews_archive.jsonl" \
  --out "$DATA_DIR/reviews_unified.json" 2>&1 | tee -a "$LOG"

node "$ROOT/bin/reviews_dash_build.js" \
  --in "$DATA_DIR/reviews_unified.json" \
  --out "$DATA_DIR/reviews_dash.json" 2>&1 | tee -a "$LOG"

node "$ROOT/bin/reviews_page_build.js" \
  --in "$DATA_DIR/reviews_unified.json" \
  --out "$DATA_DIR/reviews_page.json" 2>&1 | tee -a "$LOG"

node "$ROOT/bin/reviews_report90_build.js" \
  --in "$DATA_DIR/reviews_unified.json" \
  --out "$DATA_DIR/reviews_report90.json" 2>&1 | tee -a "$LOG"

echo "[$(date -Is)] refresh done" | tee -a "$LOG"
