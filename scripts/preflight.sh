#!/bin/bash
# ============================================================================
# Pre-flight check script for Claude Code sessions
# Run this BEFORE making any code changes to verify branch state
#
# Usage: ./scripts/preflight.sh
# ============================================================================

set -e

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"
fw_setup_git_env

# Read config
BACKEND_PORT=$(fw_get_nested "stack.backend.port" "")
FRONTEND_PORT=$(fw_get_nested "stack.frontend.port" "3000")

echo ""
echo "================================================================"
echo "  PRE-FLIGHT CHECK"
echo "================================================================"
echo ""

# 1. Current Branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "UNKNOWN")
echo -e "Branch: ${FW_GREEN}$CURRENT_BRANCH${FW_NC}"

# 2. Check if on main (warning)
if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
    echo -e "   ${FW_RED}CRITICAL: On main branch!${FW_NC}"
    echo -e "   ${FW_YELLOW}Create a feature branch before making changes!${FW_NC}"
    echo -e "   ${FW_YELLOW}   git checkout -b feature/your-feature-name${FW_NC}"
fi

# 2a. Check for corrupted merge/rebase state
GIT_DIR_PATH="${GIT_DIR:-$FW_PROJECT_ROOT/.git}"
# Resolve if it's a worktree pointer file
if [ -f "$GIT_DIR_PATH" ] && grep -q "gitdir:" "$GIT_DIR_PATH" 2>/dev/null; then
    RESOLVED_GIT_DIR=$(grep "gitdir:" "$GIT_DIR_PATH" | cut -d' ' -f2)
    if [[ "$RESOLVED_GIT_DIR" = /* ]]; then
        GIT_DIR_PATH="$RESOLVED_GIT_DIR"
    else
        GIT_DIR_PATH="$FW_PROJECT_ROOT/$RESOLVED_GIT_DIR"
    fi
fi

for merge_file in AUTO_MERGE MERGE_HEAD REBASE_HEAD CHERRY_PICK_HEAD; do
    if [ -f "$GIT_DIR_PATH/$merge_file" ]; then
        echo -e "   ${FW_RED}CRITICAL: $merge_file detected - incomplete operation${FW_NC}"
        echo -e "   ${FW_YELLOW}   Run: ./scripts/cleanup-merge-state.sh${FW_NC}"
    fi
done

# 2b. Branch tracking status (ahead/behind remote)
TRACKING=$(git status -sb 2>/dev/null | head -1)
if echo "$TRACKING" | grep -q "ahead"; then
    AHEAD=$(echo "$TRACKING" | grep -oE "ahead [0-9]+" | grep -oE "[0-9]+")
    echo -e "   ${FW_YELLOW}Branch is $AHEAD commit(s) ahead of remote${FW_NC}"
fi
if echo "$TRACKING" | grep -q "behind"; then
    BEHIND=$(echo "$TRACKING" | grep -oE "behind [0-9]+" | grep -oE "[0-9]+")
    echo -e "   ${FW_YELLOW}Branch is $BEHIND commit(s) behind remote - consider pulling${FW_NC}"
fi

# 2c. Compare with main branch
COMMITS_AHEAD_OF_MAIN=$(git rev-list --count main.."$CURRENT_BRANCH" 2>/dev/null || echo "0")
if [ "$COMMITS_AHEAD_OF_MAIN" != "0" ] && [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "   ${FW_GREEN}$COMMITS_AHEAD_OF_MAIN commit(s) ahead of main${FW_NC}"
elif [ "$COMMITS_AHEAD_OF_MAIN" = "0" ] && [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "   ${FW_YELLOW}No unique commits - branch is identical to main${FW_NC}"
fi

# 3. Modified files
echo ""
echo -e "${FW_BLUE}Modified Files:${FW_NC}"
MODIFIED=$(git status --short 2>/dev/null)
if [ -z "$MODIFIED" ]; then
    echo -e "   ${FW_GREEN}(no changes)${FW_NC}"
else
    echo "$MODIFIED" | head -15 | sed 's/^/   /'
    COUNT=$(echo "$MODIFIED" | wc -l | tr -d ' ')
    if [ "$COUNT" -gt 15 ]; then
        echo -e "   ${FW_YELLOW}... and $((COUNT - 15)) more files${FW_NC}"
    fi
fi

# 4. Uncommitted changes warning
if [ -n "$MODIFIED" ]; then
    echo ""
    if [ "$CURRENT_BRANCH" = "main" ] || [ "$CURRENT_BRANCH" = "master" ]; then
        echo -e "   ${FW_RED}DANGER: Uncommitted changes on main branch!${FW_NC}"
        echo -e "   ${FW_YELLOW}Suggested actions:${FW_NC}"
        echo -e "   ${FW_YELLOW}   1. git stash${FW_NC}"
        echo -e "   ${FW_YELLOW}   2. git checkout -b feature/your-work${FW_NC}"
        echo -e "   ${FW_YELLOW}   3. git stash pop${FW_NC}"
    else
        echo -e "   ${FW_YELLOW}You have uncommitted changes.${FW_NC}"
        echo -e "   ${FW_YELLOW}   Consider committing before switching branches.${FW_NC}"
    fi
fi

# 5. Server status (using config-driven ports)
echo ""
echo -e "${FW_BLUE}Server Status:${FW_NC}"
if [ -n "$BACKEND_PORT" ] && [ "$BACKEND_PORT" != "0" ]; then
    if lsof -i :"$BACKEND_PORT" > /dev/null 2>&1; then
        echo -e "   Backend ($BACKEND_PORT):  ${FW_GREEN}Running${FW_NC}"
    else
        echo -e "   Backend ($BACKEND_PORT):  ${FW_RED}Not running${FW_NC}"
    fi
fi
if [ -n "$FRONTEND_PORT" ] && [ "$FRONTEND_PORT" != "0" ]; then
    if lsof -i :"$FRONTEND_PORT" > /dev/null 2>&1; then
        echo -e "   Frontend ($FRONTEND_PORT): ${FW_GREEN}Running${FW_NC}"
    else
        echo -e "   Frontend ($FRONTEND_PORT): ${FW_RED}Not running${FW_NC}"
    fi
fi

# 6. Reminder
echo ""
echo "================================================================"
echo -e "${FW_GREEN}Verify branch is correct before making changes!${FW_NC}"
echo "================================================================"
echo ""
