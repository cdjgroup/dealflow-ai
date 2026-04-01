#!/bin/bash
# generate-shell-alias.sh - Generate a shell alias for quick Claude session launch
#
# Reads project.name from framework.yaml and outputs a shell function
# that can be added to .zshrc or .bashrc.
#
# Usage: ./scripts/generate-shell-alias.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

PROJECT_NAME=$(fw_get_nested "project.name")
PROJECT_ROOT="$FW_PROJECT_ROOT"

if [ -z "$PROJECT_NAME" ]; then
    echo "Error: project.name not set in framework.yaml" >&2
    exit 1
fi

# Sanitize project name for use as a function name (replace non-alphanumeric with -)
FUNC_NAME=$(echo "$PROJECT_NAME" | tr -c '[:alnum:]-' '-' | tr '[:upper:]' '[:lower:]')

echo ""
echo "================================================================"
echo "  Shell Alias Generator"
echo "================================================================"
echo ""
echo "Add the following to your ~/.zshrc or ~/.bashrc:"
echo ""
echo "# ---- Claude session launcher for $PROJECT_NAME ----"
echo "claude-${FUNC_NAME}() {"
echo "    local branch=\"\${1:-feature/work}\""
echo "    cd \"$PROJECT_ROOT\" && ./scripts/claude-session.sh \"\$branch\""
echo "}"
echo "# ---- End $PROJECT_NAME alias ----"
echo ""
echo "Then reload your shell: source ~/.zshrc"
echo ""
echo "Usage:"
echo "  claude-${FUNC_NAME} feature/my-feature    # Launch Claude session"
echo "  claude-${FUNC_NAME}                        # Default: feature/work"
echo ""
