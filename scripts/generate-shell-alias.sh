#!/bin/bash
# generate-shell-alias.sh - Generate a shell alias for quick session launch
#
# Reads project.name from framework.yaml and outputs a shell function
# that can be added to .zshrc or .bashrc for launching claude-session.sh
# and/or codex-session.sh.
#
# Usage: ./scripts/generate-shell-alias.sh                  # Print Claude alias to stdout
#        ./scripts/generate-shell-alias.sh --host codex     # Codex alias instead
#        ./scripts/generate-shell-alias.sh --host both      # Both aliases
#        ./scripts/generate-shell-alias.sh --install        # Append to shell config

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
HOST="claude"
while [[ $# -gt 0 ]]; do
    case $1 in
        --install) INSTALL=true; shift ;;
        --host)
            if [ $# -lt 2 ]; then
                echo "ERROR: --host requires an argument (claude|codex|both)" >&2
                exit 1
            fi
            HOST="$2"
            shift 2
            ;;
        *) shift ;;
    esac
done

case "$HOST" in
    claude) HOSTS=(claude) ;;
    codex) HOSTS=(codex) ;;
    both) HOSTS=(claude codex) ;;
    *)
        echo "ERROR: --host must be claude, codex, or both (got: $HOST)" >&2
        exit 1
        ;;
esac

_host_label() {
    case "$1" in
        claude) echo "Claude" ;;
        codex) echo "Codex" ;;
    esac
}

# Build the alias block for one host. Sets ALIAS_FUNC and ALIAS_BLOCK.
# Args: $1=host ("claude" or "codex")
_emit_alias_block() {
    local host="$1"
    local script="${host}-session.sh"
    local label
    label="$(_host_label "$host")"
    ALIAS_FUNC="${host}-${FUNC_NAME}"
    ALIAS_BLOCK="# ---- $label session launcher for $PROJECT_NAME ----
${ALIAS_FUNC}() {
    local branch=\"\${1:-feature/work}\"
    cd \"$PROJECT_ROOT\" && ./scripts/${script} \"\$branch\"
}
# ---- End $PROJECT_NAME alias ----"
}

if [ "$INSTALL" = true ]; then
    # Determine shell config file
    if [ -n "${ZSH_VERSION:-}" ] || [ -f "$HOME/.zshrc" ]; then
        SHELL_RC="$HOME/.zshrc"
    elif [ -f "$HOME/.bashrc" ]; then
        SHELL_RC="$HOME/.bashrc"
    else
        SHELL_RC="$HOME/.zshrc"
    fi

    # Each host's presence is checked independently so --host both is
    # idempotent even when only one of the two aliases was installed before.
    TO_INSTALL=()
    for host in "${HOSTS[@]}"; do
        _emit_alias_block "$host"
        if grep -q "${ALIAS_FUNC}()" "$SHELL_RC" 2>/dev/null; then
            echo "  Alias ${ALIAS_FUNC} already exists in $SHELL_RC"
            echo "  To update, remove the existing block and re-run."
        else
            TO_INSTALL+=("$host")
        fi
    done

    if [ ${#TO_INSTALL[@]} -eq 0 ]; then
        exit 0
    fi

    echo ""
    echo "  This will add the following to $SHELL_RC:"
    echo ""
    for host in "${TO_INSTALL[@]}"; do
        _emit_alias_block "$host"
        echo "$ALIAS_BLOCK" | sed 's/^/    /'
        echo ""
    done
    read -p "  Add alias(es) to $SHELL_RC? (y/N) " confirm
    if [ "$confirm" = "y" ] || [ "$confirm" = "Y" ]; then
        for host in "${TO_INSTALL[@]}"; do
            _emit_alias_block "$host"
            echo "" >> "$SHELL_RC"
            echo "$ALIAS_BLOCK" >> "$SHELL_RC"
            echo ""
            echo "  Added ${ALIAS_FUNC} to $SHELL_RC"
        done
        echo "  Reload your shell: source $SHELL_RC"
        echo ""
        echo "  Usage:"
        for host in "${TO_INSTALL[@]}"; do
            _emit_alias_block "$host"
            echo "    ${ALIAS_FUNC} feature/my-feature    # Launch $(_host_label "$host") session"
            echo "    ${ALIAS_FUNC}                        # Default: feature/work"
        done
    else
        echo "  Skipped. You can add it manually later:"
        echo ""
        for host in "${TO_INSTALL[@]}"; do
            _emit_alias_block "$host"
            echo "$ALIAS_BLOCK"
            echo ""
        done
    fi
else
    echo ""
    echo "================================================================"
    echo "  Shell Alias Generator"
    echo "================================================================"
    echo ""
    echo "Add the following to your ~/.zshrc or ~/.bashrc:"
    echo ""
    for host in "${HOSTS[@]}"; do
        _emit_alias_block "$host"
        echo "$ALIAS_BLOCK"
        echo ""
    done
    echo "Then reload your shell: source ~/.zshrc"
    echo ""
    echo "Usage:"
    for host in "${HOSTS[@]}"; do
        _emit_alias_block "$host"
        echo "  ${ALIAS_FUNC} feature/my-feature    # Launch $(_host_label "$host") session"
        echo "  ${ALIAS_FUNC}                        # Default: feature/work"
    done
    echo ""
    echo "Or run: ./scripts/generate-shell-alias.sh --install"
    echo ""
fi
