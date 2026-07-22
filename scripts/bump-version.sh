#!/bin/bash
# ============================================================================
# Bump version across all configured project files
# Usage: ./scripts/bump-version.sh [--ci] X.Y.Z
# --ci: Skip branch validation (for GitHub Actions auto-bump)
# ============================================================================

set -e

# Parse flags
CI_MODE=false
if [ "${1:-}" = "--ci" ]; then
    CI_MODE=true
    shift
fi

VERSION=$1

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

cd "$FW_PROJECT_ROOT"
fw_setup_git_env

# Read config
_PROJECT_NAME=$(fw_get_nested "project.name" "project")
PRIMARY_SOURCE=$(fw_get_nested "versioning.primary_source" "package.json")
PRIMARY_PATTERN=$(fw_get_nested "versioning.primary_pattern" '"version"')

# Validation: Check if version argument provided
if [ -z "$VERSION" ]; then
    echo -e "${FW_RED}Error: Version argument required${FW_NC}"
    echo "Usage: $0 [--ci] X.Y.Z (e.g., 0.6.28)"
    exit 1
fi

# Validation: Check version format (X.Y.Z)
if [[ ! $VERSION =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
    echo -e "${FW_RED}Error: Invalid version format${FW_NC}"
    echo "Expected: X.Y.Z (e.g., 0.6.28)"
    echo "Got: $VERSION"
    exit 1
fi

# Validation: Must be on main branch OR chore/version-bump* branch (or --ci mode)
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")

if [ "$CI_MODE" = true ]; then
    echo -e "${FW_GREEN}Running in CI mode (branch validation skipped)${FW_NC}"
elif [ "$CURRENT_BRANCH" != "main" ] && [[ ! "$CURRENT_BRANCH" =~ ^chore/version-bump ]]; then
    echo -e "${FW_RED}Error: Version bumps must be done on main branch or chore/version-bump* branch${FW_NC}"
    echo ""
    echo "Currently on: $CURRENT_BRANCH"
    echo ""
    echo -e "${FW_YELLOW}To fix this:${FW_NC}"
    echo "Option 1: From main branch directly"
    echo "   git checkout main && git pull && ./scripts/bump-version.sh X.Y.Z"
    echo ""
    echo "Option 2: Via PR (worktree workflow)"
    echo "   git checkout -b chore/version-bump-X.Y.Z origin/main"
    echo "   ./scripts/bump-version.sh X.Y.Z"
    echo "   git commit -am 'chore: bump version to X.Y.Z'"
    echo "   gh pr create --title 'chore: bump version to X.Y.Z'"
    exit 1
fi

# Log mode
if [ "$CI_MODE" = true ]; then
    echo -e "${FW_GREEN}Running in CI mode on $CURRENT_BRANCH${FW_NC}"
elif [ "$CURRENT_BRANCH" = "main" ]; then
    echo -e "${FW_GREEN}Running on main branch (direct mode)${FW_NC}"
else
    echo -e "${FW_YELLOW}Running on $CURRENT_BRANCH (PR mode for worktree)${FW_NC}"
fi

echo "================================================"
echo "  Bumping version to $VERSION"
echo "================================================"

# ── Read version locations from config ───────────────────────────────────────
# Parse the versioning.locations array from framework.yaml
# Each entry has: file, sed, display

# Pre-update: show current version from primary source
echo -e "\n${FW_YELLOW}Current version (from $PRIMARY_SOURCE):${FW_NC}"
if [ -f "$PRIMARY_SOURCE" ]; then
    CURRENT_VER=$(grep "$PRIMARY_PATTERN" "$PRIMARY_SOURCE" | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)
    echo "  $CURRENT_VER"
else
    echo -e "  ${FW_RED}$PRIMARY_SOURCE not found${FW_NC}"
fi

# Update all version locations
echo -e "\n${FW_YELLOW}Updating version strings...${FW_NC}"

# Parse locations from YAML and update each one
LOCATION_COUNT=0
_MISMATCHES=()

# Read the versioning.locations block from config
# We'll extract file and sed pattern for each location entry
awk '
/^  locations:/ { in_locations = 1; next }
in_locations && /^  [^ ]/ { exit }
in_locations && /^    - file:/ {
    file = $NF
    gsub(/"/, "", file)
}
in_locations && /sed:/ {
    # Extract everything after "sed: " and strip quotes
    sub(/.*sed: */, "")
    gsub(/^["'"'"']|["'"'"']$/, "")
    print file "|" $0
}
' "$FW_CONFIG" | while IFS='|' read -r loc_file loc_sed; do
    if [ -z "$loc_file" ] || [ -z "$loc_sed" ]; then
        continue
    fi

    # Replace VERSION placeholder with actual version
    actual_sed=$(echo "$loc_sed" | sed "s/VERSION/$VERSION/g")

    if [ -f "$loc_file" ]; then
        echo "  $loc_file"
        sedi "$actual_sed" "$loc_file"
        LOCATION_COUNT=$((LOCATION_COUNT + 1))
    else
        echo -e "  ${FW_YELLOW}$loc_file (not found, skipping)${FW_NC}"
    fi
done

# Show git diff
echo -e "\n${FW_YELLOW}Changes:${FW_NC}"
git diff || true

# Verification: use the same fail-closed checker as CI and PyPI publishing.
# The canonical-VERSION verifier only applies to repos whose primary source IS
# the VERSION file (the framework layout, and consumers that adopted it).
# package.json/version.json-primary consumers skip it — their layout has no
# canonical VERSION file for the verifier to anchor on (ADR-048).
if [ "$PRIMARY_SOURCE" = "VERSION" ]; then
    echo -e "\n${FW_YELLOW}Verification:${FW_NC}"
    python3 "$SCRIPT_DIR/check_version_integrity.py" \
        --root "$FW_PROJECT_ROOT" \
        --expected "$VERSION"
else
    echo -e "\n${FW_YELLOW}Verification skipped:${FW_NC} versioning.primary_source is '$PRIMARY_SOURCE' (canonical-VERSION verifier applies only to VERSION-primary repos)"
fi

echo -e "\n${FW_GREEN}Version bump to $VERSION complete${FW_NC}"
