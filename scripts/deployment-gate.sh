#!/bin/bash
# deployment-gate.sh - Pre-deployment validation checks
#
# Usage: ./scripts/deployment-gate.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"
fw_setup_git_env

echo ""
echo "================================================================"
echo "  DEPLOYMENT GATE"
echo "================================================================"
echo ""

PASSED=0
FAILED=0

check() {
    local description="$1"
    local result="$2"
    if [ "$result" = "0" ]; then
        echo -e "  ${FW_GREEN}PASS${FW_NC}: $description"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${FW_RED}FAIL${FW_NC}: $description"
        FAILED=$((FAILED + 1))
    fi
}

# Check 1: On correct branch
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null)
[ "$CURRENT_BRANCH" = "main" ] && check "On main branch" 0 || check "On main branch (currently on: $CURRENT_BRANCH)" 1

# Check 2: No uncommitted changes
if git diff --quiet && git diff --cached --quiet; then
    check "No uncommitted changes" 0
else
    check "No uncommitted changes" 1
fi

# Check 3: Up to date with remote
git fetch origin main --quiet 2>/dev/null || true
BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")
[ "$BEHIND" = "0" ] && check "Up to date with origin/main" 0 || check "Up to date with origin/main ($BEHIND commits behind)" 1

# Check 4: Version consistency
PRIMARY_SOURCE=$(fw_get_nested "versioning.primary_source" "package.json")
if [ -f "$PRIMARY_SOURCE" ]; then
    check "Version source exists ($PRIMARY_SOURCE)" 0
else
    check "Version source exists ($PRIMARY_SOURCE)" 1
fi

echo ""
echo "================================================================"
echo "  Results: $PASSED passed, $FAILED failed"
echo "================================================================"
echo ""

# Send notification if configured
NOTIFY_PROVIDER=$(fw_get_nested "notifications.provider" "none")
if [ "$NOTIFY_PROVIDER" != "none" ] && [ -f "$FW_PROJECT_ROOT/scripts/notify.sh" ]; then
    if [ $FAILED -eq 0 ]; then
        "$FW_PROJECT_ROOT/scripts/notify.sh" success "Deployment gate passed ($PASSED checks)" 2>/dev/null || true
    else
        "$FW_PROJECT_ROOT/scripts/notify.sh" failure "Deployment gate failed ($FAILED checks failed)" 2>/dev/null || true
    fi
fi

[ $FAILED -eq 0 ] || exit 1
