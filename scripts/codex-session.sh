#!/bin/bash
# codex-session.sh - Automated worktree-isolated Codex CLI session
#
# Codex sibling of claude-session.sh — same worktree-isolation workflow,
# same session-lock protection (checkout-guard.py, blocks concurrent
# Codex-or-Claude sessions sharing a worktree), different launch target.
# NOTE: Codex has no project-level hook config — checkout-guard.py only
# fires if the operator has pasted + /hooks-trusted the PreToolUse block
# (printed by `shipteam init --host codex`) into their OWN user-level
# $CODEX_HOME/config.toml. This script cannot wire that up for them; see
# docs/adr/035-codex-host-safety-gate-port.md. This script automatically:
# 1. Creates an isolated git worktree for the session
# 2. Bootstraps dependencies (Python venv, npm install)
# 3. Starts frontend dev server on unique port
# 4. Launches Codex CLI in that worktree
# 5. Cleans up server and worktree when Codex exits
#
# Usage:
#   ./scripts/codex-session.sh                      # Auto-generates session branch
#   ./scripts/codex-session.sh feature/my-feature   # Uses specific branch name
#   ./scripts/codex-session.sh --keep               # Don't cleanup on exit
#   ./scripts/codex-session.sh --no-servers         # Skip dev server startup
#   ./scripts/codex-session.sh --no-sync            # Skip auto-sync with origin/main

set -e

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"
# shellcheck source=scripts/_session_common.sh
source "$SCRIPT_DIR/_session_common.sh"

# Read configuration
PROJECT_NAME=$(fw_get_nested "project.name" "project")
PROJECT_REPO=$(fw_get_nested "project.repo" "")
WORKTREE_BASE=$(fw_resolve_path "$(fw_get_nested "paths.worktree_base" "${HOME}/worktrees")")
BACKEND_PORT=$(fw_get_nested "stack.backend.port" "8000")
BACKEND_ROOT=$(fw_get_nested "stack.backend.root" "")
BACKEND_LANG=$(fw_get_nested "stack.backend.language" "")
BACKEND_VERSION=$(fw_get_nested "stack.backend.version" "")
FRONTEND_PORT_START=$(fw_get_nested "stack.frontend.port" "3003")
FRONTEND_ROOT=$(fw_get_nested "stack.frontend.root" "")
FRONTEND_PORT_FLAG=$(fw_get_nested "stack.frontend.port_flag" "")
FRONTEND_START_CMD=$(fw_get_nested "stack.frontend.start_command" "npm run dev")
_NOTIFICATION_PROVIDER=$(fw_get_nested "notifications.provider" "none")
_NOTIFICATION_WEBHOOK_ENV=$(fw_get_nested "notifications.webhook_env" "")

# Guard: respect worktree.enabled config
WORKTREE_ENABLED=$(fw_get_nested "worktree.enabled" "true")
if [ "$WORKTREE_ENABLED" = "false" ]; then
    echo "ERROR: Worktree isolation is disabled (worktree.enabled: false in framework.yaml)"
    exit 1
fi

# Parse arguments
KEEP_WORKTREE=false
START_SERVERS=true
NO_SYNC=false
BRANCH_NAME=""
CLEAN_WORKTREE=false
EXPLICIT_BRANCH=false
MEMO=""
PRINT_BRANCH_NAME=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --keep)
            KEEP_WORKTREE=true
            shift
            ;;
        --clean)
            CLEAN_WORKTREE=true
            shift
            ;;
        --no-servers)
            START_SERVERS=false
            shift
            ;;
        --no-sync)
            NO_SYNC=true
            shift
            ;;
        -m|--memo)
            if [ $# -lt 2 ] || [[ "$2" == -* ]]; then
                echo "ERROR: -m/--memo requires a slug argument" >&2
                exit 1
            fi
            MEMO="$2"
            shift 2
            ;;
        --print-branch-name)
            PRINT_BRANCH_NAME=true
            shift
            ;;
        --help|-h)
            echo "Usage: $0 [--keep|--clean] [--no-servers] [--no-sync] [-m SLUG] [branch-name]"
            echo ""
            echo "Launches Codex CLI in an isolated git worktree with dev server."
            echo "Uses shared backend on port $BACKEND_PORT (ensure it's running)."
            echo ""
            echo "Worktree lifecycle:"
            echo "  Auto-generated branch (no arg): destroyed on exit (disposable session)"
            echo "  Explicit branch name:           preserved on exit (resumable)"
            echo ""
            echo "Options:"
            echo "  --keep         Force preserve worktree (overrides default destroy)"
            echo "  --clean        Force destroy worktree on exit (overrides default preserve)"
            echo "  --no-servers   Skip starting frontend server"
            echo "  --no-sync      Skip auto-sync with origin/main"
            echo "  -m, --memo SLUG  Append a short purpose slug to the auto-generated"
            echo "                   session branch name, e.g. -m sentinel-fix produces"
            echo "                   session/codex-YYYYMMDD-HHMMSS-sentinel-fix."
            echo "                   Slug must match ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?\$"
            echo "                   (lowercase alphanumeric + hyphens, 1-40 chars,"
            echo "                    no leading or trailing hyphen)."
            echo "                   Incompatible with an explicit branch-name argument."
            echo "  --help         Show this help message"
            exit 0
            ;;
        *)
            BRANCH_NAME="$1"
            EXPLICIT_BRANCH=true
            shift
            ;;
    esac
done

# Validate memo (if provided) before any side-effecting operations.
# The slug is interpolated into a git branch name and a worktree directory
# path, so reject anything outside a strict lowercase-alphanumeric-hyphen
# allowlist. This also rejects leading hyphens (to prevent the slug from
# being interpreted as a flag) and keeps branch names under git's tolerance
# for long refnames.
if [ -n "$MEMO" ]; then
    # First+last char must be alphanumeric; middle may include hyphens.
    # Length: 1 (first) + 0-38 (middle) + 1 (last) = 1..40. Single-char
    # slugs take the outer class only via the `()?` optional group.
    if ! [[ "$MEMO" =~ ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?$ ]]; then
        echo "ERROR: --memo must match ^[a-z0-9]([a-z0-9-]{0,38}[a-z0-9])?\$" >&2
        echo "       (lowercase alphanumeric + hyphens, 1-40 chars," >&2
        echo "        no leading or trailing hyphen)" >&2
        echo "       Got: '$MEMO'" >&2
        exit 1
    fi
    if [ "$EXPLICIT_BRANCH" = true ]; then
        echo "ERROR: -m/--memo and an explicit branch-name argument are mutually exclusive" >&2
        echo "       Memo only customizes the auto-generated session branch; pass one or the other." >&2
        exit 1
    fi
fi

# Generate branch name if not provided. Memo (if any) is appended after the
# timestamp so sort-order stays chronological and uniqueness is preserved
# across parallel sessions launched in the same second with the same memo.
if [ -z "$BRANCH_NAME" ]; then
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    if [ -n "$MEMO" ]; then
        BRANCH_NAME="session/codex-${TIMESTAMP}-${MEMO}"
    else
        BRANCH_NAME="session/codex-${TIMESTAMP}"
    fi
fi

# Testability: print the computed branch name and exit. Used by the bats
# regression tests to exercise arg-parsing and name computation without
# creating a worktree or launching Codex.
if [ "$PRINT_BRANCH_NAME" = true ]; then
    echo "$BRANCH_NAME"
    exit 0
fi

# Default lifecycle: explicit branches preserve (resumable, avoids stale-inode bug
# when a shell is cd'd into the worktree). Auto-generated sessions stay disposable.
# --keep / --clean override.
if [ "$EXPLICIT_BRANCH" = true ] && [ "$CLEAN_WORKTREE" = false ]; then
    KEEP_WORKTREE=true
fi

# Create worktree directory name (replace / with -)
SAFE_BRANCH_NAME=$(echo "$BRANCH_NAME" | sed 's/\//-/g')
WORKTREE_DIR="$WORKTREE_BASE/$PROJECT_NAME-$SAFE_BRANCH_NAME"

# Port tracking file
PORT_FILE="$WORKTREE_DIR/.claude-port"

# Server PID tracking
FRONTEND_PID=""
ASSIGNED_FRONTEND_PORT=""

# ===================================================================
# Main Script
# ===================================================================

echo "==================================================================="
echo "  Codex CLI Isolated Session Launcher"
echo "==================================================================="
echo ""
echo "  Creating isolated worktree for parallel development..."
echo "   Branch: $BRANCH_NAME"
echo "   Location: $WORKTREE_DIR"
echo ""

# Cleanup function — defined early so trap catches failures during worktree setup
cleanup() {
    echo ""
    echo "  Codex exited. Cleaning up..."

    if [ -n "$FRONTEND_PID" ] && kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "   Stopping frontend server (PID $FRONTEND_PID)..."
        kill $FRONTEND_PID 2>/dev/null || true
    fi

    rm -f "$PORT_FILE" 2>/dev/null || true

    if [ "$KEEP_WORKTREE" = true ]; then
        echo ""
        echo "==================================================================="
        echo "  Worktree preserved at: $WORKTREE_DIR"
        echo ""
        echo "To resume later:"
        echo "   cd $WORKTREE_DIR && codex"
        echo ""
        echo "To cleanup when done:"
        echo "   $FW_PROJECT_ROOT/scripts/cleanup-worktree.sh $WORKTREE_DIR"
        echo "==================================================================="
    else
        if [ -d "$WORKTREE_DIR" ]; then
            cd "$WORKTREE_DIR"

            # Safety guard: refuse to destroy worktrees with unsaved work.
            # EXIT-trap prompts are unreliable (non-interactive shells, crashes,
            # SIGTERM) so we preserve loudly instead of asking. session/* branches
            # are exempt — they are disposable by design.
            PRESERVE_REASON="$(fw_session_check_preserve_reason)"

            if [ -n "$PRESERVE_REASON" ]; then
                echo ""
                echo "  Refusing to destroy worktree: $PRESERVE_REASON"
                echo "  Preserved at: $WORKTREE_DIR"
                echo "  Force cleanup with: $FW_PROJECT_ROOT/scripts/cleanup-worktree.sh $WORKTREE_DIR"
                exit 0
            fi

            cd "$FW_PROJECT_ROOT"
            export GIT_DIR="$FW_PROJECT_ROOT/.git"
            export GIT_WORK_TREE="$FW_PROJECT_ROOT"
            git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
            git worktree prune
        fi

        echo "  Worktree and server cleaned up"
        echo ""
        echo "==================================================================="
        echo "Session complete!"
        echo "==================================================================="
    fi
}

trap cleanup EXIT

# Create base directory
mkdir -p "$WORKTREE_BASE"

# Change to project root
cd "$FW_PROJECT_ROOT"

# Set git environment for worktree creation
export GIT_DIR="$FW_PROJECT_ROOT/.git"
export GIT_WORK_TREE="$FW_PROJECT_ROOT"

# Check if worktree already exists
if [ -d "$WORKTREE_DIR" ]; then
    echo "  Worktree already exists at $WORKTREE_DIR"
    echo "   Resuming existing session..."

    # Migrate old whole-directory .claude symlink to physical copies
    if [ -L "$WORKTREE_DIR/.claude" ]; then
        echo "   Migrating .claude from whole-dir symlink to physical copies..."
        rm -f "$WORKTREE_DIR/.claude"
    fi

    # Bootstrap .claude/ — fills gaps (no clobber) on every resume
    if [ -d "$FW_PROJECT_ROOT/.claude" ]; then
        bootstrap_claude_dir "$FW_PROJECT_ROOT/.claude" "$WORKTREE_DIR"
        echo "   Configuration verified"
    fi

    if [ -f "$PORT_FILE" ]; then
        # Security: parse port file safely instead of sourcing (prevents code injection)
        ASSIGNED_FRONTEND_PORT=$(grep -oE '^ASSIGNED_FRONTEND_PORT=[0-9]+$' "$PORT_FILE" | cut -d= -f2)
        if [ -n "$ASSIGNED_FRONTEND_PORT" ]; then
            echo "   Previous frontend port: $ASSIGNED_FRONTEND_PORT"
        fi
    fi
else
    # Create the worktree. New branches base on origin/<default> (not the
    # launcher's current HEAD) so a session never inherits unrelated commits;
    # existing branches are checked out unchanged. See _session_common.sh.
    fw_session_worktree_add "$BRANCH_NAME" "$WORKTREE_DIR"

    echo ""
    echo "  Setting up dependencies..."

    # Bootstrap backend dependencies
    if [ -n "$BACKEND_ROOT" ] && [ -d "$WORKTREE_DIR/$BACKEND_ROOT" ] && [ -f "$WORKTREE_DIR/$BACKEND_ROOT/requirements.txt" ]; then
        echo "   Setting up Python virtual environment..."
        cd "$WORKTREE_DIR"

        # Determine Python command from config
        PYTHON_CMD="python3"
        if [ -n "$BACKEND_VERSION" ] && [ "$BACKEND_LANG" = "python" ]; then
            VERSIONED_CMD="python${BACKEND_VERSION}"
            if command -v "$VERSIONED_CMD" &>/dev/null; then
                PYTHON_CMD="$VERSIONED_CMD"
            fi
        fi

        if $PYTHON_CMD -m venv venv; then
            ./venv/bin/pip install --quiet -r "$BACKEND_ROOT/requirements.txt" 2>/dev/null || true
            echo "   Backend dependencies installed"
        else
            echo "   Venv creation failed - Codex will still work"
        fi
    fi

    # Bootstrap frontend dependencies
    if [ -n "$FRONTEND_ROOT" ] && [ -f "$WORKTREE_DIR/$FRONTEND_ROOT/package.json" ]; then
        echo "   Installing frontend dependencies..."
        cd "$WORKTREE_DIR/$FRONTEND_ROOT"
        if HUSKY=0 npm install --silent 2>/dev/null; then
            echo "   Frontend dependencies installed"
        else
            echo "   Frontend dependencies failed - run 'npm install' manually"
        fi
    fi

    # Bootstrap .claude/ into worktree — copies hooks, rules, agents, skills,
    # settings.json (physical copies); symlinks settings.local.json; fresh state/.
    # .claude/ is gitignored in all consumer projects, so git worktree add
    # does NOT populate it — bootstrap_claude_dir fills the gap. checkout-guard.py
    # itself lives under .claude/hooks/ (host-agnostic script, invoked by both
    # Claude's settings.json AND Codex's user-level $CODEX_HOME/config.toml
    # PreToolUse entry) — this bootstrap step is what makes the SCRIPT present
    # in the worktree; whether Codex actually INVOKES it still depends on the
    # operator having trusted the hook at the user level (see the header note
    # above and docs/adr/035-codex-host-safety-gate-port.md).
    if [ -d "$FW_PROJECT_ROOT/.claude" ]; then
        bootstrap_claude_dir "$FW_PROJECT_ROOT/.claude" "$WORKTREE_DIR"
        echo "   Configuration bootstrapped"
    fi

    # Symlink .env files from main repo (single source of truth)
    echo "   Linking environment files..."
    # Root-level .env files are always checked. Subdirectory .env files are only
    # added when root != "." to avoid duplicates (root/.env == ./.env).
    ENV_FILES=".env .env.local"
    [ -n "$BACKEND_ROOT" ] && [ "$BACKEND_ROOT" != "." ] && ENV_FILES="$ENV_FILES $BACKEND_ROOT/.env $BACKEND_ROOT/.env.local"
    [ -n "$FRONTEND_ROOT" ] && [ "$FRONTEND_ROOT" != "." ] && ENV_FILES="$ENV_FILES $FRONTEND_ROOT/.env.local"
    for env_file in $ENV_FILES; do
        if [ -f "$FW_PROJECT_ROOT/$env_file" ] && [ ! -e "$WORKTREE_DIR/$env_file" ]; then
            mkdir -p "$(dirname "$WORKTREE_DIR/$env_file")"
            ln -s "$FW_PROJECT_ROOT/$env_file" "$WORKTREE_DIR/$env_file"
            echo "   Linked $env_file"
        fi
    done

    # Configure git remote for gh CLI compatibility
    if [ -n "$PROJECT_REPO" ]; then
        cd "$WORKTREE_DIR"
        git remote set-url origin "https://github.com/${PROJECT_REPO}.git" 2>/dev/null || true
    fi
fi

# Reset git environment for worktree operations
unset GIT_DIR
unset GIT_WORK_TREE

# ===================================================================
# Auto-Sync with Main
# ===================================================================

echo ""
if [ "$NO_SYNC" = true ]; then
    echo "  Auto-sync disabled (--no-sync flag)"
else
    echo "  Auto-syncing with origin/main..."
    fw_session_sync_with_main "Codex"
fi

# ===================================================================
# Start Frontend Dev Server
# ===================================================================

if [ "$START_SERVERS" = true ]; then
    echo ""
    echo "  Starting frontend dev server..."

    # Check backend if configured
    if [ -n "$BACKEND_ROOT" ]; then
        echo "   Note: Uses shared backend on port $BACKEND_PORT (ensure it's running)"
        if ! lsof -i :"$BACKEND_PORT" >/dev/null 2>&1; then
            echo ""
            echo "   WARNING: Backend not running on port $BACKEND_PORT!"
            echo "   Start it with: cd $FW_PROJECT_ROOT && ./scripts/manage-servers.sh start"
            echo ""
        fi
    fi

    ASSIGNED_FRONTEND_PORT=$(find_available_port $FRONTEND_PORT_START)
    echo "   Assigned frontend port: $ASSIGNED_FRONTEND_PORT"
    echo "ASSIGNED_FRONTEND_PORT=$ASSIGNED_FRONTEND_PORT" > "$PORT_FILE"

    if [ -n "$FRONTEND_ROOT" ] && [ -f "$WORKTREE_DIR/$FRONTEND_ROOT/package.json" ]; then
        start_frontend_server $ASSIGNED_FRONTEND_PORT "$WORKTREE_DIR"
    elif [ -z "$FRONTEND_ROOT" ]; then
        echo "   No frontend configured (stack.frontend.root not set) - skipping"
    else
        echo "   Frontend package.json not found at $FRONTEND_ROOT/ - skipping"
    fi
fi

echo ""
echo "==================================================================="
echo "  Worktree ready! Launching Codex CLI..."
if [ "$START_SERVERS" = true ] && { [ -n "$ASSIGNED_FRONTEND_PORT" ] || [ -n "$BACKEND_ROOT" ]; }; then
    echo ""
    echo "  TEST YOUR CHANGES AT:"
    [ -n "$ASSIGNED_FRONTEND_PORT" ] && echo "   Frontend: http://localhost:$ASSIGNED_FRONTEND_PORT"
    [ -n "$BACKEND_ROOT" ] && echo "   Backend:  http://localhost:$BACKEND_PORT (shared)"
fi
echo "==================================================================="
echo ""

# Change to worktree directory
cd "$WORKTREE_DIR"

# Ensure git environment is clean
unset GIT_DIR
unset GIT_WORK_TREE

# Create the session lock ourselves — see fw_session_create_codex_lock() in
# _session_common.sh for why this launcher (not a hook) must do it: Codex has
# no SessionStart-equivalent hook, so nothing else ever creates a fresh lock
# for a Codex session. Without this, two Codex sessions could share this
# worktree with zero protection.
#
# CODEX_SESSION_ID is a synthetic placeholder, not Codex's real session_id —
# `codex` hasn't started yet, so that value doesn't exist. claimed=false marks
# it as such; checkout-guard.py's first Bash call for this worktree adopts it
# (rewrites session_id to the real one). See path_utils.create_session_lock's
# `claimed` docstring.
CODEX_SESSION_ID="codex-$(date +%s)-$$"
LOCK_RESULT=$(fw_session_create_codex_lock "$CODEX_SESSION_ID" "$BRANCH_NAME" "$WORKTREE_DIR" "false")
if [ "$LOCK_RESULT" != "OK" ]; then
    # Hard-abort rather than warn-and-continue: unlike Claude (where
    # checkout-guard.py is auto-wired in .claude/settings.json as a real
    # backstop), Codex's guard only takes effect after the operator's own
    # manual /hooks-trust config.toml step — which this script cannot verify
    # from here. Launching without a lock in that case means zero concurrent-
    # session protection, not just a delayed one, so this is the one point
    # where the launcher can still stop it.
    echo ""
    echo "  BLOCKED: could not acquire session lock ($LOCK_RESULT)."
    echo "  Another live session may already own this worktree, or the lock"
    echo "  write itself failed. Launching anyway would give this session zero"
    echo "  concurrent-session protection."
    echo ""
    echo "  If you're sure no other session is using this worktree, remove"
    echo "  .claude/state/session-lock.json and re-run this script."
    exit 1
fi

# Create helper script for git env
cat > "$WORKTREE_DIR/.git-env" << EOF
# Git environment for this worktree (auto-generated by codex-session.sh)
# Source this file if git commands fail: source .git-env
export GIT_WORK_TREE="$WORKTREE_DIR"
EOF

# Launch Codex CLI in a clean framework env so scripts inside codex's shell
# auto-detect FW_PROJECT_ROOT from their own source location instead of
# inheriting the launcher's (which resolves to the main-repo path, not the
# worktree). Strips identity + override vars; retains cosmetic color vars
# (FW_RED/GREEN/...) since they're harmless. Defense-in-depth for the guard
# in _framework.sh that PR #143 added: without this scrub, the guard warns
# on every framework script invocation inside codex's shell.
# `env -u` is preferred over `unset` so this script's own env remains
# intact for the EXIT cleanup trap that runs after codex exits.
# Bare `codex`, not `codex exec` — exec mode has no interactive backstop and
# is the wrong mode for an interactive dev session.
env -u FW_PROJECT_ROOT -u FW_CONFIG -u FW_FW_DIR -u FW_ROOT_OVERRIDE -u FW_SKIP_PREREQ_CHECK codex

# Cleanup happens automatically via trap
