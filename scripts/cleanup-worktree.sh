#!/bin/bash
# cleanup-worktree.sh - Clean up a completed worktree session
#
# Usage:
#   ./scripts/cleanup-worktree.sh /path/to/worktree
#   ./scripts/cleanup-worktree.sh /path/to/worktree --delete-branch

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

# Parse arguments
DELETE_BRANCH=false
WORKTREE_DIR=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --delete-branch) DELETE_BRANCH=true; shift ;;
        --help|-h)
            echo "Usage: $0 <worktree-path> [--delete-branch]"
            exit 0
            ;;
        *) WORKTREE_DIR="$1"; shift ;;
    esac
done

if [ -z "$WORKTREE_DIR" ]; then
    echo "Error: No worktree path provided"
    echo "Usage: $0 <worktree-path> [--delete-branch]"
    exit 1
fi

WORKTREE_DIR=$(realpath "$WORKTREE_DIR" 2>/dev/null || echo "$WORKTREE_DIR")

export GIT_DIR="$FW_PROJECT_ROOT/.git"
export GIT_WORK_TREE="$FW_PROJECT_ROOT"

if ! git worktree list | grep -q "$WORKTREE_DIR"; then
    echo "Error: Not a valid worktree: $WORKTREE_DIR"
    echo ""
    echo "Available worktrees:"
    git worktree list
    exit 1
fi

BRANCH_NAME=$(git worktree list --porcelain | grep -A1 "worktree $WORKTREE_DIR" | grep "branch" | sed 's/branch refs\/heads\///')

echo "Cleaning up worktree session..."
echo "   Worktree: $WORKTREE_DIR"
[ -n "$BRANCH_NAME" ] && echo "   Branch: $BRANCH_NAME"
echo ""

# Check for uncommitted changes
if [ -d "$WORKTREE_DIR" ]; then
    cd "$WORKTREE_DIR"
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
        echo "Warning: Uncommitted changes detected!"
        git status --short
        echo ""
        read -p "Continue anyway? (y/N) " confirm
        if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
            echo "Aborted."
            exit 1
        fi
    fi
fi

cd "$FW_PROJECT_ROOT"
git worktree remove "$WORKTREE_DIR" --force
echo "Worktree removed"

if [ "$DELETE_BRANCH" = true ] && [ -n "$BRANCH_NAME" ]; then
    if [ "$BRANCH_NAME" = "main" ] || [ "$BRANCH_NAME" = "master" ] || [ "$BRANCH_NAME" = "develop" ]; then
        echo "Skipping branch deletion for protected branch: $BRANCH_NAME"
    else
        read -p "Delete branch '$BRANCH_NAME'? (y/N) " confirm
        if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
            git branch -D "$BRANCH_NAME"
            echo "Branch deleted: $BRANCH_NAME"
        fi
    fi
fi

git worktree prune

echo ""
echo "==================================================================="
echo "Cleanup complete!"
echo ""
echo "Remaining worktrees:"
git worktree list
echo "==================================================================="
