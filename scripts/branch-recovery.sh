#!/bin/bash
# branch-recovery.sh - Escape hatch for branch recovery
#
# Usage: ./scripts/branch-recovery.sh <target-branch> [--abort-merge]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"
fw_setup_git_env

TARGET_BRANCH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --abort-merge) shift ;;
        *) TARGET_BRANCH="$1"; shift ;;
    esac
done

echo "================================================================"
echo "  BRANCH RECOVERY"
echo "================================================================"

CURRENT_BRANCH=$(git branch --show-current)
echo "Current branch: $CURRENT_BRANCH"

echo "Cleaning up any in-progress operations..."
git merge --abort 2>/dev/null || true
git rebase --abort 2>/dev/null || true
git cherry-pick --abort 2>/dev/null || true

git reset HEAD 2>/dev/null || true

if [ -n "$TARGET_BRANCH" ]; then
    echo "Switching to: $TARGET_BRANCH"
    git checkout "$TARGET_BRANCH"
    echo "Now on: $(git branch --show-current)"
fi

echo "================================================================"
echo "Recovery complete"
git status --short
