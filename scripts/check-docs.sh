#!/bin/bash
# check-docs.sh - Validate documentation structure and consistency
#
# Usage: ./scripts/check-docs.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"

echo ""
echo "================================================================"
echo "  Documentation Validation"
echo "================================================================"
echo ""

PASSED=0
WARNED=0

check_file() {
    local file="$1"
    local description="$2"
    if [ -f "$file" ]; then
        echo -e "  ${FW_GREEN}OK${FW_NC}: $description ($file)"
        PASSED=$((PASSED + 1))
    else
        echo -e "  ${FW_YELLOW}MISSING${FW_NC}: $description ($file)"
        WARNED=$((WARNED + 1))
    fi
}

# Check required docs exist
check_file "CLAUDE.md" "Claude integration docs"
check_file "README.md" "Project README"
check_file "docs/00-README.md" "Documentation guide"
check_file "docs/10-ARCHITECTURE.md" "Architecture docs"
check_file "docs/20-DEPLOYMENT.md" "Deployment docs"
check_file "docs/35-SECURITY.md" "Security docs"
check_file "docs/40-DATABASE.md" "Database docs"
check_file "docs/50-TESTING.md" "Testing docs"
check_file "docs/60-FEATURES.md" "Features docs"
check_file "docs/70-INSIGHTS.md" "Insights docs"
check_file "docs/80-TROUBLESHOOTING.md" "Troubleshooting docs"

echo ""

# Check version consistency
echo "  Version check:"
PRIMARY_SOURCE=$(fw_get_nested "versioning.primary_source" "package.json")
if [ -f "$PRIMARY_SOURCE" ]; then
    VERSION=$(grep -oE '[0-9]+\.[0-9]+\.[0-9]+' "$PRIMARY_SOURCE" | head -1)
    echo -e "  ${FW_GREEN}OK${FW_NC}: Primary version: $VERSION (from $PRIMARY_SOURCE)"
    PASSED=$((PASSED + 1))
else
    echo -e "  ${FW_YELLOW}WARN${FW_NC}: Primary version source not found: $PRIMARY_SOURCE"
    WARNED=$((WARNED + 1))
fi

echo ""
echo "================================================================"
echo "  Results: $PASSED passed, $WARNED warnings"
echo "================================================================"
echo ""
