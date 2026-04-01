#!/bin/bash
# cleanup-merge-state.sh - Clean up corrupted merge/rebase state
#
# Usage: ./scripts/cleanup-merge-state.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"
fw_setup_git_env

# Resolve actual git dir (handles worktrees)
GIT_DIR_PATH="${GIT_DIR:-$FW_PROJECT_ROOT/.git}"
if [ -f "$GIT_DIR_PATH" ] && grep -q "gitdir:" "$GIT_DIR_PATH" 2>/dev/null; then
    RESOLVED=$(grep "gitdir:" "$GIT_DIR_PATH" | cut -d' ' -f2)
    if [[ "$RESOLVED" = /* ]]; then
        GIT_DIR_PATH="$RESOLVED"
    else
        GIT_DIR_PATH="$FW_PROJECT_ROOT/$RESOLVED"
    fi
fi

echo ""
echo "================================================================"
echo "  CLEANING UP MERGE/REBASE STATE"
echo "================================================================"
echo ""

CLEANED=0

for file in AUTO_MERGE MERGE_HEAD MERGE_MSG MERGE_MODE REBASE_HEAD CHERRY_PICK_HEAD ORIG_HEAD; do
    if [ -f "$GIT_DIR_PATH/$file" ]; then
        rm "$GIT_DIR_PATH/$file"
        echo -e "${FW_GREEN}Removed $file${FW_NC}"
        CLEANED=1
    fi
done

echo ""
echo "Attempting to abort in-progress operations..."
git rebase --abort 2>/dev/null && echo "Aborted rebase" && CLEANED=1 || true
git merge --abort 2>/dev/null && echo "Aborted merge" && CLEANED=1 || true
git cherry-pick --abort 2>/dev/null && echo "Aborted cherry-pick" && CLEANED=1 || true

echo ""
if [ $CLEANED -eq 1 ]; then
    echo -e "${FW_GREEN}Cleanup complete!${FW_NC}"
else
    echo "No corrupted state found - worktree is clean"
fi

echo ""
echo "Run ./scripts/preflight.sh to verify state"
echo ""
