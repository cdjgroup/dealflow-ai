#!/bin/bash
# merge-to-main.sh - Merge feature branch to main using worktree workflow
#
# Usage: ./scripts/merge-to-main.sh [feature-branch-name]

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"
fw_setup_git_env

echo -e "${FW_BLUE}=== Merge to Main ===${FW_NC}"

CURRENT_BRANCH=$(git branch --show-current)
FEATURE_BRANCH=${1:-$CURRENT_BRANCH}

echo -e "Feature branch: ${FW_GREEN}$FEATURE_BRANCH${FW_NC}"
echo ""

# Step 1: Push feature branch
echo -e "${FW_BLUE}[1/4] Pushing feature branch to remote...${FW_NC}"
git push origin "$FEATURE_BRANCH"
echo -e "${FW_GREEN}Feature branch pushed${FW_NC}"
echo ""

# Step 2: Fetch and update main
echo -e "${FW_BLUE}[2/4] Updating main branch...${FW_NC}"
git fetch origin main
echo -e "${FW_GREEN}Main branch fetched${FW_NC}"
echo ""

# Step 3: Merge (via PR is recommended)
echo -e "${FW_YELLOW}[3/4] Create a PR to merge into main:${FW_NC}"
echo "   gh pr create --title 'Your PR title' --body 'Description'"
echo ""

# Step 4: After merge, sync
echo -e "${FW_YELLOW}[4/4] After PR is merged, sync:${FW_NC}"
echo "   ./scripts/sync-with-main.sh"
echo ""

echo -e "${FW_GREEN}=== Push complete! Create a PR to finish the merge. ===${FW_NC}"
