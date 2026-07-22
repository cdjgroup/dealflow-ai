#!/bin/bash
# ============================================================================
# next-insight-number.sh - Get the next available insight number
#
# Usage:
#   ./scripts/next-insight-number.sh
#
# Output:
#   2  (or whatever the next number is)
# ============================================================================

set -e

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

INSIGHTS_FILE="$FW_PROJECT_ROOT/docs/70-INSIGHTS.md"

if [ ! -f "$INSIGHTS_FILE" ]; then
    echo "Error: $INSIGHTS_FILE not found" >&2
    exit 1
fi

# Extract all insight numbers from 70-INSIGHTS.md AND archive files
# Pattern: "Insight #NNN" (case insensitive)
# This prevents number collisions after archiving old insights
ARCHIVES_DIR="$FW_PROJECT_ROOT/docs/archives"

# Search active insights file
# Extraction is anchored to the '#NNN' token: a bare '[0-9]+' grab would also
# harvest digits from grep's filename prefixes (absolute repo paths can carry
# date-like digit runs, e.g. dated session-worktree names), producing a bogus
# huge "next number".
# `|| true` prevents _framework.sh's pipefail from silently killing the script
# when grep matches nothing (empty insights file / no archive .md files).
HIGHEST_ACTIVE=$(grep -oiE 'Insight\s*#[0-9]+' "$INSIGHTS_FILE" 2>/dev/null | \
          grep -oE '#[0-9]+' | tr -d '#' | \
          sort -n | \
          tail -1 || true)

# Search archive files for insight numbers (-h: never emit filename prefixes)
HIGHEST_ARCHIVE=""
if [ -d "$ARCHIVES_DIR" ]; then
    HIGHEST_ARCHIVE=$(grep -rhoiE 'Insight\s*#[0-9]+' "$ARCHIVES_DIR"/*.md 2>/dev/null | \
              grep -oE '#[0-9]+' | tr -d '#' | \
              sort -n | \
              tail -1 || true)
fi

# Use the highest number from either source
HIGHEST="${HIGHEST_ACTIVE:-0}"
if [ -n "$HIGHEST_ARCHIVE" ] && [ "$HIGHEST_ARCHIVE" -gt "$HIGHEST" ] 2>/dev/null; then
    HIGHEST="$HIGHEST_ARCHIVE"
fi

if [ "$HIGHEST" = "0" ] || [ -z "$HIGHEST" ]; then
    # No insights yet, start at 1
    echo "1"
    exit 0
fi

# Next number is highest + 1
NEXT=$((HIGHEST + 1))

echo "$NEXT"
