#!/bin/bash
# claude-session.sh - Automated worktree-isolated Claude Code session
#
# This script automatically:
# 1. Creates an isolated git worktree for the session
# 2. Bootstraps dependencies (Python venv, npm install)
# 3. Starts frontend dev server on unique port
# 4. Launches Claude Code in that worktree
# 5. Cleans up server and worktree when Claude exits
#
# Usage:
#   ./scripts/claude-session.sh                      # Auto-generates session branch
#   ./scripts/claude-session.sh feature/my-feature   # Uses specific branch name
#   ./scripts/claude-session.sh --keep               # Don't cleanup on exit
#   ./scripts/claude-session.sh --no-servers         # Skip dev server startup
#   ./scripts/claude-session.sh --no-sync            # Skip auto-sync with origin/main

set -e

# Source shared framework library
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/_framework.sh"

# Read configuration
PROJECT_NAME=$(fw_get_nested "project.name" "project")
PROJECT_REPO=$(fw_get_nested "project.repo" "")
WORKTREE_BASE=$(fw_resolve_path "$(fw_get_nested "paths.worktree_base" "${HOME}/worktrees")")
BACKEND_PORT=$(fw_get_nested "stack.backend.port" "")
FRONTEND_PORT_START=$(fw_get_nested "stack.frontend.port" "3000")
BACKEND_LANG=$(fw_get_nested "stack.backend.language" "")
BACKEND_VERSION=$(fw_get_nested "stack.backend.version" "")
NOTIFICATION_PROVIDER=$(fw_get_nested "notifications.provider" "none")
NOTIFICATION_WEBHOOK_ENV=$(fw_get_nested "notifications.webhook_env" "")

# Parse arguments
KEEP_WORKTREE=false
START_SERVERS=true
NO_SYNC=false
BRANCH_NAME=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --keep)
            KEEP_WORKTREE=true
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
        --help|-h)
            echo "Usage: $0 [--keep] [--no-servers] [--no-sync] [branch-name]"
            echo ""
            echo "Launches Claude Code in an isolated git worktree with dev server."
            echo "Uses shared backend on port $BACKEND_PORT (ensure it's running)."
            echo "Automatically cleans up when Claude exits."
            echo ""
            echo "Options:"
            echo "  --keep         Don't cleanup worktree when Claude exits"
            echo "  --no-servers   Skip starting frontend server"
            echo "  --no-sync      Skip auto-sync with origin/main"
            echo "  --help         Show this help message"
            exit 0
            ;;
        *)
            BRANCH_NAME="$1"
            shift
            ;;
    esac
done

# Generate branch name if not provided
if [ -z "$BRANCH_NAME" ]; then
    BRANCH_NAME="session/claude-$(date +%Y%m%d-%H%M%S)"
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
# Port Management Functions
# ===================================================================

find_available_port() {
    local base_port=$1
    local port=$base_port

    while lsof -i :$port >/dev/null 2>&1; do
        port=$((port + 1))
        if [ $port -gt $((base_port + 100)) ]; then
            echo "ERROR: No available ports found in range $base_port-$port" >&2
            return 1
        fi
    done
    echo $port
}

start_frontend_server() {
    local port=$1
    local worktree=$2
    local start_cmd
    start_cmd=$(fw_get_nested "stack.frontend.start_command" "npm run dev")

    echo "   Starting frontend on port $port..."

    # Support both monorepo (frontend/ subdir) and single-app (root) layouts
    if [ -d "$worktree/frontend" ]; then
        cd "$worktree/frontend"
    else
        cd "$worktree"
    fi
    local logfile="/tmp/frontend-$port.log"
    touch "$logfile" && chmod 600 "$logfile"
    BROWSER=none $start_cmd -- --port $port > "$logfile" 2>&1 &
    FRONTEND_PID=$!

    sleep 3

    if kill -0 $FRONTEND_PID 2>/dev/null; then
        echo "   Frontend running: http://localhost:$port"
        return 0
    else
        echo "   Frontend failed to start (check /tmp/frontend-$port.log)"
        FRONTEND_PID=""
        return 1
    fi
}

# ===================================================================
# Main Script
# ===================================================================

echo "==================================================================="
echo "  Claude Code Isolated Session Launcher"
echo "==================================================================="
echo ""
echo "  Creating isolated worktree for parallel development..."
echo "   Branch: $BRANCH_NAME"
echo "   Location: $WORKTREE_DIR"
echo ""

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

    # Migrate old whole-directory .claude symlink to targeted symlinks
    if [ -L "$WORKTREE_DIR/.claude" ]; then
        echo "   Migrating .claude from whole-dir symlink to tracked files..."
        rm -f "$WORKTREE_DIR/.claude"
        # Restore git-tracked .claude/ files into the worktree
        # (unset GIT_DIR/GIT_WORK_TREE so git operates on the worktree, not main repo)
        (unset GIT_DIR GIT_WORK_TREE && cd "$WORKTREE_DIR" && git checkout HEAD -- .claude 2>/dev/null) || true
        # Apply targeted symlinks for gitignored files
        if [ -f "$FW_PROJECT_ROOT/.claude/settings.local.json" ] && \
           [ ! -e "$WORKTREE_DIR/.claude/settings.local.json" ] && \
           [ ! -L "$WORKTREE_DIR/.claude/settings.local.json" ]; then
            ln -s "$FW_PROJECT_ROOT/.claude/settings.local.json" "$WORKTREE_DIR/.claude/settings.local.json"
        fi
        # state/ — own directory per worktree (symlink breaks git stash)
        if [ -L "$WORKTREE_DIR/.claude/state" ]; then
            rm -f "$WORKTREE_DIR/.claude/state"
        fi
        mkdir -p "$WORKTREE_DIR/.claude/state"
        touch "$WORKTREE_DIR/.claude/state/.gitkeep"
        echo "   Migration complete"
    fi

    if [ -f "$PORT_FILE" ]; then
        # Security: parse port file safely instead of sourcing (prevents code injection)
        ASSIGNED_FRONTEND_PORT=$(grep -oE '^ASSIGNED_FRONTEND_PORT=[0-9]+$' "$PORT_FILE" | cut -d= -f2)
        if [ -n "$ASSIGNED_FRONTEND_PORT" ]; then
            echo "   Previous frontend port: $ASSIGNED_FRONTEND_PORT"
        fi
    fi
else
    # Create the worktree
    if git show-ref --verify --quiet "refs/heads/$BRANCH_NAME"; then
        echo "   Note: Branch '$BRANCH_NAME' already exists, checking it out"
        git worktree add "$WORKTREE_DIR" "$BRANCH_NAME"
    else
        git worktree add -b "$BRANCH_NAME" "$WORKTREE_DIR"
    fi

    echo ""
    echo "  Setting up dependencies..."

    # Bootstrap backend dependencies (Python projects with backend/ subdir)
    if [ -d "$WORKTREE_DIR/backend" ] && [ -f "$WORKTREE_DIR/backend/requirements.txt" ]; then
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
            ./venv/bin/pip install --quiet -r backend/requirements.txt 2>/dev/null || true
            echo "   Backend dependencies installed"
        else
            echo "   Venv creation failed - Claude will still work"
        fi
    fi

    # Bootstrap frontend dependencies
    # Supports both monorepo (frontend/ subdir) and single-app (root package.json) layouts
    if [ -f "$WORKTREE_DIR/frontend/package.json" ]; then
        echo "   Installing frontend dependencies..."
        cd "$WORKTREE_DIR/frontend"
        if HUSKY=0 npm install --silent 2>/dev/null; then
            echo "   Frontend dependencies installed"
        else
            echo "   Frontend dependencies failed - run 'npm install' manually"
        fi
    elif [ -f "$WORKTREE_DIR/package.json" ] && [ ! -d "$WORKTREE_DIR/backend" ]; then
        echo "   Installing dependencies (single-app layout)..."
        cd "$WORKTREE_DIR"
        if HUSKY=0 npm install --silent 2>/dev/null; then
            echo "   Dependencies installed"
        else
            echo "   npm install failed - run 'npm install' manually"
        fi
    fi

    # Link gitignored .claude files that need sharing across worktrees
    # (tracked files like hooks/, rules/, skills/, agents/, settings.json are
    # already checked out by git — DO NOT symlink the whole directory)
    if [ -d "$FW_PROJECT_ROOT/.claude" ]; then
        # settings.local.json (gitignored, contains user's local hook config)
        if [ -f "$FW_PROJECT_ROOT/.claude/settings.local.json" ] && \
           [ ! -e "$WORKTREE_DIR/.claude/settings.local.json" ] && \
           [ ! -L "$WORKTREE_DIR/.claude/settings.local.json" ]; then
            ln -s "$FW_PROJECT_ROOT/.claude/settings.local.json" "$WORKTREE_DIR/.claude/settings.local.json"
        fi
        # state/ directory — each worktree gets its OWN state (not symlinked)
        # Symlinking state/ causes "beyond a symbolic link" errors with git stash
        # because .gitkeep is tracked inside state/ but git can't traverse symlinks
        if [ -L "$WORKTREE_DIR/.claude/state" ]; then
            rm -f "$WORKTREE_DIR/.claude/state"
        fi
        mkdir -p "$WORKTREE_DIR/.claude/state"
        touch "$WORKTREE_DIR/.claude/state/.gitkeep"
        echo "   Configuration linked"
    fi

    # Symlink .env files from main repo (single source of truth)
    # Supports both monorepo (backend/.env, frontend/.env.local) and single-app (.env.local) layouts
    echo "   Linking environment files..."
    for env_file in .env.local backend/.env backend/.env.local frontend/.env.local; do
        if [ -f "$FW_PROJECT_ROOT/$env_file" ] && [ ! -e "$WORKTREE_DIR/$env_file" ]; then
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

    cd "$WORKTREE_DIR"

    COMMITS_BEHIND=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

    if [ "$COMMITS_BEHIND" -eq 0 ]; then
        echo "   Already up to date with origin/main"
    else
        echo "   $COMMITS_BEHIND commits behind origin/main - syncing..."
        echo ""
        git log --oneline HEAD..origin/main 2>/dev/null | head -5 | sed 's/^/     /' || true
        echo ""

        # Check for uncommitted changes
        STASHED=0
        STASH_NAME=""

        if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
            STASH_NAME="auto-stash-before-sync-$(date +%Y%m%d-%H%M%S)"
            echo "   Stashing uncommitted changes before sync..."
            git stash push -m "$STASH_NAME"
            STASHED=1
        fi

        # Try fast-forward first
        if git merge origin/main --ff-only 2>/dev/null; then
            echo "   Fast-forwarded to origin/main"
            if [ "$STASHED" = 1 ]; then
                git stash pop 2>/dev/null && echo "   Restored stashed changes" || echo "   Stash pop had issues"
            fi
        else
            echo "   Cannot fast-forward. Attempting merge..."
            if git merge origin/main --no-edit 2>/dev/null; then
                echo "   Merged origin/main successfully"
                if [ "$STASHED" = 1 ]; then
                    git stash pop 2>/dev/null && echo "   Restored stashed changes" || echo "   Stash pop had issues"
                fi
            else
                echo ""
                echo "   MERGE CONFLICT - Claude will resolve this automatically!"
                echo ""
                git diff --name-only --diff-filter=U 2>/dev/null | sed 's/^/     - /'
                echo ""

                # Create marker file for hook
                mkdir -p "$FW_PROJECT_ROOT/.claude/state"
                CONFLICTED_FILES=$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ' ')
                cat > "$FW_PROJECT_ROOT/.claude/state/merge-conflict.json" << CONFLICT_EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "behind_count": $COMMITS_BEHIND,
    "conflicted_files": "$(echo $CONFLICTED_FILES | sed 's/ $//')",
    "stashed": $STASHED,
    "stash_name": "$STASH_NAME"
}
CONFLICT_EOF

                echo "   The merge-conflict-resolver hook will instruct Claude to fix this."
            fi
        fi
    fi

    cd "$FW_PROJECT_ROOT"
fi

# ===================================================================
# Start Frontend Dev Server
# ===================================================================

if [ "$START_SERVERS" = true ]; then
    echo ""
    echo "  Starting dev server..."

    if [ -n "$BACKEND_PORT" ] && [ "$BACKEND_PORT" != "0" ]; then
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

    if [ -f "$WORKTREE_DIR/frontend/package.json" ] || [ -f "$WORKTREE_DIR/package.json" ]; then
        start_frontend_server $ASSIGNED_FRONTEND_PORT "$WORKTREE_DIR"
    else
        echo "   No package.json found - skipping dev server"
    fi
fi

echo ""
echo "==================================================================="
echo "  Worktree ready! Launching Claude Code..."
if [ -n "$ASSIGNED_FRONTEND_PORT" ]; then
    echo ""
    echo "  TEST YOUR CHANGES AT:"
    echo "   http://localhost:$ASSIGNED_FRONTEND_PORT"
    if [ -n "$BACKEND_PORT" ] && [ "$BACKEND_PORT" != "0" ]; then
        echo "   Backend:  http://localhost:$BACKEND_PORT (shared)"
    fi
fi
echo "==================================================================="
echo ""

# Change to worktree directory
cd "$WORKTREE_DIR"

# Ensure git environment is clean
unset GIT_DIR
unset GIT_WORK_TREE

# Create helper script for git env
cat > "$WORKTREE_DIR/.git-env" << EOF
# Git environment for this worktree (auto-generated by claude-session.sh)
# Source this file if git commands fail: source .git-env
export GIT_WORK_TREE="$WORKTREE_DIR"
EOF

# Cleanup function
cleanup() {
    echo ""
    echo "  Claude exited. Cleaning up..."

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
        echo "   cd $WORKTREE_DIR && claude"
        echo ""
        echo "To cleanup when done:"
        echo "   $FW_PROJECT_ROOT/scripts/cleanup-worktree.sh $WORKTREE_DIR"
        echo "==================================================================="
    else
        cd "$WORKTREE_DIR"
        if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
            echo ""
            echo "  Warning: Uncommitted changes detected!"
            git status --short
            echo ""
            read -p "Delete worktree anyway? (y/N) " confirm
            if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
                echo "Worktree preserved at: $WORKTREE_DIR"
                exit 0
            fi
        fi

        cd "$FW_PROJECT_ROOT"
        export GIT_DIR="$FW_PROJECT_ROOT/.git"
        export GIT_WORK_TREE="$FW_PROJECT_ROOT"
        git worktree remove "$WORKTREE_DIR" --force 2>/dev/null || true
        git worktree prune

        echo "  Worktree and server cleaned up"
        echo ""
        echo "==================================================================="
        echo "Session complete!"
        echo "==================================================================="
    fi
}

trap cleanup EXIT

# Launch Claude Code
claude

# Cleanup happens automatically via trap
