#!/bin/bash
# sync-with-main.sh - Sync current worktree with origin/main
#
# Handles: stashing, fast-forward, merge, conflict detection
#
# Usage:
#   ./scripts/sync-with-main.sh            # Sync (fast-forward only by default)
#   ./scripts/sync-with-main.sh --force    # Force merge if can't fast-forward
#   ./scripts/sync-with-main.sh --no-sync  # Check status only

set -e

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"
fw_setup_git_env

STATE_DIR="$FW_PROJECT_ROOT/.claude/state"
_NOTIFICATION_PROVIDER=$(fw_get_nested "notifications.provider" "none")
_NOTIFICATION_WEBHOOK_ENV=$(fw_get_nested "notifications.webhook_env" "")

# Parse arguments
FORCE_MERGE=false
CHECK_ONLY=false

while [[ "${1:-}" == --* ]]; do
    case "${1:-}" in
        --force|-f) FORCE_MERGE=true; shift ;;
        --no-sync|--check) CHECK_ONLY=true; shift ;;
        --help|-h)
            echo "Usage: $0 [--force] [--no-sync]"
            echo ""
            echo "Options:"
            echo "  --force, -f    Force merge if fast-forward not possible"
            echo "  --no-sync      Check status only"
            exit 0
            ;;
        *) shift ;;
    esac
done

# Fetch latest
echo "Fetching latest from origin/main..."
if ! git fetch origin main 2>/dev/null; then
    echo "  Network error - couldn't fetch. Skipping sync."
    exit 0
fi

# Count commits behind
behind_count=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

if [ "$behind_count" -eq 0 ]; then
    echo "  Already up to date with origin/main"
    exit 0
fi

echo "Your worktree is $behind_count commits behind origin/main"
echo ""
echo "Commits to sync:"
git log --oneline HEAD..origin/main | head -5 | sed 's/^/  /'
if [ "$behind_count" -gt 5 ]; then
    echo "  ... and $((behind_count - 5)) more"
fi
echo ""

if [ "$CHECK_ONLY" = true ]; then
    echo "Run without --no-sync to sync these changes"
    exit 0
fi

# Check for uncommitted changes
STASHED=0
_has_changes=false
if ! git diff --quiet || ! git diff --cached --quiet; then
    _has_changes=true
fi

if [ "$_has_changes" = true ]; then
    echo "  Stashing uncommitted changes before sync..."
    STASH_NAME="auto-stash-sync-$(date +%Y%m%d-%H%M%S)"
    git stash push -m "$STASH_NAME"
    STASHED=1
    echo "  Changes stashed as: $STASH_NAME"
fi

# Try fast-forward first
echo ""
echo "Attempting to sync..."

if git merge origin/main --ff-only 2>/dev/null; then
    echo "  Fast-forwarded to origin/main"
    if [ "$STASHED" = 1 ]; then
        git stash pop && echo "  Stash restored" || echo "  Warning: Stash pop had issues"
    fi
    echo ""
    echo "  Sync complete!"
    exit 0
fi

# Can't fast-forward
if [ "$FORCE_MERGE" = false ]; then
    echo "  Cannot fast-forward. Use --force to attempt merge."
    if [ "$STASHED" = 1 ]; then
        git stash pop
    fi
    exit 1
fi

# Attempt merge
echo "  Attempting merge with origin/main..."
if git merge origin/main --no-edit 2>/dev/null; then
    echo "  Merged origin/main successfully"
    if [ "$STASHED" = 1 ]; then
        git stash pop && echo "  Stash restored" || echo "  Warning: Stash pop had issues"
    fi
    echo ""
    echo "  Sync complete!"
    exit 0
fi

# Merge conflict
echo ""
echo "  Merge conflict detected - leaving in progress for Claude to resolve"
echo ""

CONFLICTED_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ' ')

echo "Conflicted files:"
git diff --name-only --diff-filter=U 2>/dev/null | sed 's/^/  - /'
echo ""

# Create marker file
mkdir -p "$STATE_DIR"
cat > "$STATE_DIR/merge-conflict.json" << EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "behind_count": $behind_count,
    "conflicted_files": "$(echo $CONFLICTED_FILES | sed 's/ $//')",
    "stashed": $STASHED,
    "stash_name": "${STASH_NAME:-}"
}
EOF

echo "  Claude will automatically resolve these conflicts when prompted."
echo ""
echo "To manually resolve:"
echo "  1. Edit conflicted files (remove <<<<<<, ======, >>>>>> markers)"
echo "  2. git add <files>"
echo "  3. git merge --continue"
if [ "$STASHED" = 1 ]; then
    echo "  4. git stash pop  # Restore your stashed changes"
fi
echo ""

exit 0
