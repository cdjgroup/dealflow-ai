#!/bin/bash
# ============================================================================
# _framework.sh — Shared bash library for dev-framework scripts
# ============================================================================
# Sources config/framework.yaml and provides helper functions.
# All scripts should: source "$(dirname "${BASH_SOURCE[0]}")/_framework.sh"
#
# Functions:
#   fw_get KEY              — Get a top-level YAML value
#   fw_get_nested KEY       — Get a dotted-path value (e.g., stack.backend.port)
#   fw_get_list KEY         — Get a YAML list as newline-separated values
#   fw_resolve_path VALUE   — Expand ${HOME}, $HOME, ~ in a path
#   fw_require KEY...       — Validate required keys exist
#   sedi ARGS...            — Cross-platform sed -i (macOS vs Linux)
#   fw_setup_git_env        — Configure GIT_DIR/GIT_WORK_TREE for worktrees
#   fw_project_root         — Echo project root (already set as FW_PROJECT_ROOT)
#
# Prerequisite checks (Bash 3.2+, Python 3.9+) run automatically on source.
# Set FW_SKIP_PREREQ_CHECK=1 to bypass (e.g., minimal CI environments).
# ============================================================================

set -euo pipefail

# ── Auto-detect project root ────────────────────────────────────────────────
# Walk up from the script's directory until we find config/framework.yaml
_fw_find_root() {
    local dir="$1"
    while [ "$dir" != "/" ]; do
        if [ -f "$dir/config/framework.yaml" ]; then
            echo "$dir"
            return 0
        fi
        dir="$(dirname "$dir")"
    done
    return 1
}

# Where is THIS script?
_FW_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Project root: parent of scripts/ OR wherever config/framework.yaml lives
FW_PROJECT_ROOT="$(_fw_find_root "$_FW_SCRIPT_DIR")" || {
    # Fallback: assume scripts/ is one level below project root
    FW_PROJECT_ROOT="$(cd "$_FW_SCRIPT_DIR/.." && pwd)"
}
export FW_PROJECT_ROOT

# Config file path
FW_CONFIG="$FW_PROJECT_ROOT/config/framework.yaml"

if [ ! -f "$FW_CONFIG" ]; then
    echo "ERROR: config/framework.yaml not found at $FW_CONFIG" >&2
    echo "Are you running from within a dev-framework project?" >&2
    exit 1
fi

# ── Colors ──────────────────────────────────────────────────────────────────
export FW_RED='\033[0;31m'
export FW_GREEN='\033[0;32m'
export FW_YELLOW='\033[1;33m'
export FW_BLUE='\033[0;34m'
export FW_NC='\033[0m'

# ── Prerequisite Checks ─────────────────────────────────────────────────────
# Validate Bash 3.2+ and Python 3.9+ on first source. Set FW_SKIP_PREREQ_CHECK=1
# to bypass (e.g., in minimal CI environments that only need YAML parsing).

if [[ "${FW_SKIP_PREREQ_CHECK:-0}" != "1" ]]; then
    # Bash 3.2+ (macOS default) is sufficient — no associative arrays or
    # Bash 4-only features are used. Keep this as a floor check.
    if [[ ${BASH_VERSINFO[0]} -lt 3 ]]; then
        echo -e "${FW_RED}ERROR: Bash 3.2+ required (found ${BASH_VERSION})${FW_NC}" >&2
        exit 1
    fi

    # Python 3.9+ (required for hooks)
    if ! command -v python3 &>/dev/null; then
        echo -e "${FW_RED}ERROR: Python 3.9+ required but python3 not found${FW_NC}" >&2
        echo "  Install Python:" >&2
        echo "    macOS:   brew install python" >&2
        echo "    Ubuntu:  sudo apt install python3" >&2
        echo "    Windows: use WSL or the DevContainer (.devcontainer/)" >&2
        exit 1
    fi

    _fw_python_version=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')" 2>/dev/null || echo "0.0")
    _fw_python_major=${_fw_python_version%%.*}
    _fw_python_minor=${_fw_python_version#*.}
    if [[ "$_fw_python_major" -lt 3 ]] || { [[ "$_fw_python_major" -eq 3 ]] && [[ "$_fw_python_minor" -lt 9 ]]; }; then
        echo -e "${FW_RED}ERROR: Python 3.9+ required (found ${_fw_python_version})${FW_NC}" >&2
        echo "  Upgrade Python:" >&2
        echo "    macOS:   brew upgrade python" >&2
        echo "    Ubuntu:  sudo apt install python3.12" >&2
        echo "    Windows: use WSL or the DevContainer (.devcontainer/)" >&2
        exit 1
    fi
    unset _fw_python_version _fw_python_major _fw_python_minor
fi

# ── YAML Parsing (no external dependencies) ─────────────────────────────────
# These functions use grep/sed to parse flat YAML. They handle:
#   - key: "value"  (quoted)
#   - key: value    (unquoted)
#   - key: 'value'  (single-quoted)
#   - Ignores comments and blank lines
#   - Does NOT handle multi-line values or complex nested structures

# Get a simple key: value from the config
# Usage: fw_get "project.name" or fw_get "notifications.provider"
# For nested keys, searches for the key at any indentation level
fw_get() {
    local key="$1"
    local default="${2:-}"

    if [ -z "$key" ]; then
        echo "$default"
        return
    fi

    # Handle dotted paths by extracting the leaf key and searching in context
    if [[ "$key" == *.* ]]; then
        fw_get_nested "$key" "$default"
        return
    fi

    # Simple key lookup — find the first match
    # Use || true to prevent pipefail from aborting when grep finds no match
    local value
    value=$(grep -E "^\s*${key}:" "$FW_CONFIG" 2>/dev/null | head -1 | sed 's/^[^:]*:\s*//' | sed 's/\s*#.*//' | sed 's/^"\(.*\)"$/\1/' | sed "s/^'\(.*\)'$/\1/" | tr -d '\r' || true)

    if [ -n "$value" ]; then
        echo "$value"
    else
        echo "$default"
    fi
}

# Get a nested YAML value using dotted path notation
# Usage: fw_get_nested "stack.backend.port" "8000"
#
# Strategy: Walk the path segments, narrowing the search context.
# For "stack.backend.port":
#   1. Find the "stack:" line, note its indent
#   2. From there, find "backend:" at a deeper indent
#   3. From there, find "port:" at a deeper indent
#   4. Return the value
fw_get_nested() {
    local dotted_key="$1"
    local default="${2:-}"

    # Split the dotted key into an array
    IFS='.' read -ra parts <<< "$dotted_key"

    if [ ${#parts[@]} -eq 0 ]; then
        echo "$default"
        return
    fi

    # If only one part, delegate to fw_get
    if [ ${#parts[@]} -eq 1 ]; then
        fw_get "${parts[0]}" "$default"
        return
    fi

    # Multi-part path: use awk to navigate the YAML structure
    local value
    value=$(awk -v parts="${parts[*]}" '
    BEGIN {
        n = split(parts, path, " ")
        depth = 0
        target_depth = 0
        found_context = 1  # Start at root context
        current_part = 1
    }
    {
        # Skip comments and blank lines
        if (/^[[:space:]]*#/ || /^[[:space:]]*$/) next

        # Calculate indentation (number of leading spaces)
        match($0, /^[[:space:]]*/)
        indent = RLENGTH

        # If we have found our context but indent decreased, we left it
        if (found_context && current_part > 1 && indent <= target_depth) {
            # We have left the nested block without finding the value
            found_context = 0
        }

        if (!found_context) next

        # Check if this line matches the current path segment
        regex = "^[[:space:]]*" path[current_part] ":"
        if ($0 ~ regex) {
            if (current_part == n) {
                # This is the final key — extract value
                sub(/^[^:]*:[[:space:]]*/, "")
                sub(/[[:space:]]*#.*/, "")   # strip inline comments
                gsub(/^["'"'"']|["'"'"']$/, "")  # strip quotes
                print
                exit
            } else {
                # Intermediate key — descend into this block
                target_depth = indent
                current_part++
                found_context = 1
            }
        }
    }' "$FW_CONFIG")

    if [ -n "$value" ]; then
        echo "$value"
    else
        echo "$default"
    fi
}

# Get a YAML list as newline-separated values
# Usage: fw_get_list "ci.blocking_jobs"
# Input YAML:
#   blocking_jobs:
#     - "backend-tests"
#     - "frontend-tests"
# Output:
#   backend-tests
#   frontend-tests
fw_get_list() {
    local dotted_key="$1"

    # Split into parts
    IFS='.' read -ra parts <<< "$dotted_key"

    # Find the section and extract list items
    awk -v parts="${parts[*]}" '
    BEGIN {
        n = split(parts, path, " ")
        current_part = 1
        in_list = 0
        target_depth = -1
    }
    {
        if (/^[[:space:]]*#/ || /^[[:space:]]*$/) next

        match($0, /^[[:space:]]*/)
        indent = RLENGTH

        # If in list mode and indent decreased, stop
        if (in_list && indent <= target_depth) exit

        if (in_list) {
            # Extract list item: "  - value" or "  - \"value\""
            if ($0 ~ /^[[:space:]]*-[[:space:]]/) {
                val = $0
                sub(/^[[:space:]]*-[[:space:]]*/, "", val)
                sub(/[[:space:]]*#.*/, "", val)  # strip comments
                gsub(/^["'"'"']|["'"'"']$/, "", val)  # strip quotes
                print val
            }
            next
        }

        regex = "^[[:space:]]*" path[current_part] ":"
        if ($0 ~ regex) {
            if (current_part == n) {
                in_list = 1
                target_depth = indent
            } else {
                current_part++
            }
        }
    }' "$FW_CONFIG"
}

# Expand environment variables and ~ in paths
# Usage: fw_resolve_path "${HOME}/worktrees"
fw_resolve_path() {
    local value="$1"

    # Expand ${HOME} and $HOME
    value="${value//\$\{HOME\}/$HOME}"
    value="${value//\$HOME/$HOME}"

    # Expand leading ~
    if [[ "$value" == "~/"* ]]; then
        value="$HOME/${value:2}"
    elif [[ "$value" == "~" ]]; then
        value="$HOME"
    fi

    echo "$value"
}

# Validate that required config keys exist and are non-empty
# Usage: fw_require "project.name" "project.repo"
fw_require() {
    local missing=()
    for key in "$@"; do
        local value
        value=$(fw_get_nested "$key")
        if [ -z "$value" ]; then
            missing+=("$key")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        echo -e "${FW_RED}ERROR: Missing required config keys in framework.yaml:${FW_NC}" >&2
        for key in "${missing[@]}"; do
            echo -e "${FW_RED}  - $key${FW_NC}" >&2
        done
        exit 1
    fi
}

# ── Cross-platform sed -i ────────────────────────────────────────────────────
# macOS BSD sed requires '' after -i, GNU sed does not
sedi() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# ── Git Worktree Helpers ─────────────────────────────────────────────────────

# Configure GIT_DIR and GIT_WORK_TREE for worktree-aware git commands
# Call this at the top of any script that needs git commands
fw_setup_git_env() {
    if [ -f "$FW_PROJECT_ROOT/.git" ] && grep -q "gitdir:" "$FW_PROJECT_ROOT/.git" 2>/dev/null; then
        local git_dir_path
        git_dir_path=$(grep "gitdir:" "$FW_PROJECT_ROOT/.git" | cut -d' ' -f2)
        if [[ ! "$git_dir_path" = /* ]]; then
            git_dir_path="$FW_PROJECT_ROOT/$git_dir_path"
        fi
        export GIT_DIR="$git_dir_path"
        export GIT_WORK_TREE="$FW_PROJECT_ROOT"
    else
        export GIT_DIR="$FW_PROJECT_ROOT/.git"
        export GIT_WORK_TREE="$FW_PROJECT_ROOT"
    fi
}

# Echo the project root
fw_project_root() {
    echo "$FW_PROJECT_ROOT"
}
