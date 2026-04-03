#!/bin/bash
# generate-shell-alias.sh - Generate a shell alias for quick Claude session launch
#
# Reads project.name from framework.yaml and outputs a shell function
# that can be added to .zshrc or .bashrc.
#
# Usage: ./scripts/generate-shell-alias.sh            # Print alias to stdout
#        ./scripts/generate-shell-alias.sh --install   # Append to shell config

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

# Parse arguments
INSTALL=false
while [[ $# -gt 0 ]]; do
    case $1 in
        --install) INSTALL=true; shift ;;
        *) shift ;;
    esac
done

# Build the alias block
ALIAS_BLOCK="# ---- Claude session launcher for $PROJECT_NAME ----
claude-${FUNC_NAME}() {
    local branch=\"\${1:-feature/work}\"
    cd \"$PROJECT_ROOT\" && ./scripts/claude-session.sh \"\$branch\"
}
# ---- End $PROJECT_NAME alias ----"

if [ "$INSTALL" = true ]; then
    # Determine shell config file
    if [ -n "$ZSH_VERSION" ] || [ -f "$HOME/.zshrc" ]; then
        SHELL_RC="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        SHELL_RC="$HOME/.bashrc"
    else
        SHELL_RC="$HOME/.zshrc"
    fi

    # Check if alias already exists
    if grep -q "claude-${FUNC_NAME}()" "$SHELL_RC" 2>/dev/null; then
        echo "  Alias claude-${FUNC_NAME} already exists in $SHELL_RC"
        echo "  To update, remove the existing block and re-run."
        exit 0
    fi

    # Prompt for confirmation
    echo ""
    echo "  This will add the following to $SHELL_RC:"
    echo ""
    echo "$ALIAS_BLOCK" | sed 's/^/    /'
    echo ""
    read -p "  Add alias to $SHELL_RC? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        echo "" >> "$SHELL_RC"
        echo "$ALIAS_BLOCK" >> "$SHELL_RC"
        echo ""
        echo "  Added claude-${FUNC_NAME} to $SHELL_RC"
        echo "  Reload your shell: source $SHELL_RC"
        echo ""
        echo "  Usage:"
        echo "    claude-${FUNC_NAME} feature/my-feature    # Launch Claude session"
        echo "    claude-${FUNC_NAME}                        # Default: feature/work"
    else
        echo "  Skipped. You can add it manually later:"
        echo ""
        echo "$ALIAS_BLOCK"
    fi
else
    echo ""
    echo "================================================================"
    echo "  Shell Alias Generator"
    echo "================================================================"
    echo ""
    echo "Add the following to your ~/.zshrc or ~/.bashrc:"
    echo ""
    echo "$ALIAS_BLOCK"
    echo ""
    echo "Then reload your shell: source ~/.zshrc"
    echo ""
    echo "Usage:"
    echo "  claude-${FUNC_NAME} feature/my-feature    # Launch Claude session"
    echo "  claude-${FUNC_NAME}                        # Default: feature/work"
    echo ""
    echo "Or run: ./scripts/generate-shell-alias.sh --install"
    echo ""
fi
