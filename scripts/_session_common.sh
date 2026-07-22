#!/bin/bash
# _session_common.sh - Shared functions for host session launchers
# (claude-session.sh, codex-session.sh).
#
# Sourced after _framework.sh. Defines no top-level side effects — only
# function definitions — so it is safe to source from any launcher script
# regardless of that script's config-loading order.

# ===================================================================
# Copy-on-Write & .claude/ Bootstrap Functions
# ===================================================================

# Copy-on-Write aware recursive copy.
# Uses APFS clonefile on macOS, reflink on Linux, plain cp fallback.
# Args: $1=source $2=destination
cp_cow() {
    local src="$1"
    local dst="$2"

    case "$(uname -s)" in
        Darwin)
            cp -Rc "$src" "$dst"
            ;;
        Linux)
            cp -r --reflink=auto "$src" "$dst"
            ;;
        *)
            cp -r "$src" "$dst"
            ;;
    esac
}

# Bootstrap .claude/ directory in a worktree from main repo.
# Copies hooks/, rules/, agents/, skills/, settings.json (physical copies, not symlinks).
# Symlinks settings.local.json (personal, gitignored).
# Creates fresh state/ directory (per-worktree, never shared).
# Skips files/dirs that already exist in target (no clobber).
# Args: $1=source_claude_dir (e.g. /path/to/main/.claude)
#       $2=target_worktree_dir (e.g. /path/to/worktree)
bootstrap_claude_dir() {
    local source_dir="$1"
    local target_worktree="$2"
    local target_claude="$target_worktree/.claude"

    # If source doesn't exist, nothing to bootstrap
    if [ ! -d "$source_dir" ]; then
        return 0
    fi

    # Ensure target .claude/ exists
    mkdir -p "$target_claude"

    # Copy content directories (hooks, rules, agents, skills) — no clobber
    for subdir in hooks rules agents skills; do
        if [ -d "$source_dir/$subdir" ] && [ ! -d "$target_claude/$subdir" ]; then
            cp_cow "$source_dir/$subdir" "$target_claude/$subdir"
        fi
    done

    # Copy settings.json — no clobber
    if [ -f "$source_dir/settings.json" ] && [ ! -f "$target_claude/settings.json" ]; then
        cp "$source_dir/settings.json" "$target_claude/settings.json"
    fi

    # Symlink settings.local.json (personal, gitignored) — replace dangling, no clobber valid
    local target_local="$target_claude/settings.local.json"
    if [ -L "$target_local" ] && [ ! -e "$target_local" ]; then
        # Dangling symlink (target moved/deleted) — remove so we can re-create
        rm -f "$target_local"
    fi
    if [ -f "$source_dir/settings.local.json" ] && \
       [ ! -e "$target_local" ] && [ ! -L "$target_local" ]; then
        ln -s "$source_dir/settings.local.json" "$target_local"
    fi

    # state/ — each worktree gets its OWN state (never symlinked)
    if [ -L "$target_claude/state" ]; then
        rm -f "$target_claude/state"
    fi
    if [ ! -d "$target_claude/state" ]; then
        mkdir -p "$target_claude/state"
        touch "$target_claude/state/.gitkeep"
    fi
}

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
    local fe_dir="$worktree/$FRONTEND_ROOT"

    echo "   Starting frontend on port $port..."

    if [ ! -d "$fe_dir" ]; then
        echo "   Frontend directory not found: $fe_dir"
        return 1
    fi

    cd "$fe_dir" || { echo "   Cannot cd to $fe_dir"; return 1; }
    local logfile="/tmp/frontend-$port.log"
    touch "$logfile" && chmod 600 "$logfile"
    # PORT env var is the universal fallback (Next.js reads it natively).
    # port_flag (e.g., "--port" for Vite, "-p" for Next.js) is additive for
    # frameworks that need an explicit CLI arg. Empty port_flag = PORT-only mode.
    if [ -n "$FRONTEND_PORT_FLAG" ]; then
        PORT=$port BROWSER=none $FRONTEND_START_CMD -- $FRONTEND_PORT_FLAG $port > "$logfile" 2>&1 &
    else
        PORT=$port BROWSER=none $FRONTEND_START_CMD > "$logfile" 2>&1 &
    fi
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
# Codex Session Lock
# ===================================================================

# Create the session lock for a Codex session via path_utils.create_session_lock
# — Codex has no SessionStart-equivalent hook, so nothing else ever creates a
# fresh lock for a Codex session (checkout-guard.py only refreshes an existing
# own-lock or blocks a foreign one; it never creates one). Honors a live
# foreign session's lock (e.g. a Claude session resuming this same worktree)
# rather than silently overwriting it. See docs/adr/039-codex-session-lock-guard-port.md.
# Args: $1=session_id $2=branch $3=worktree_dir (must contain .claude/hooks)
#       $4=claimed ("true"/"false", default "false"). This function is CODEX-ONLY
#       (its sole caller is codex-session.sh) and by construction always runs
#       BEFORE `codex` starts and mints its real session_id — so the lock it
#       writes is ALWAYS a placeholder. The default is therefore "false", which
#       lets checkout-guard.py's first Bash call adopt the placeholder (rewrite
#       session_id to the real one, flip claimed=true). Defaulting here (a
#       replace-policy shared lib) rather than requiring codex-session.sh (a
#       template-policy file consumers customize and never auto-sync) to pass
#       "false" is what makes the fix actually reach consumers — see
#       docs/adr and path_utils.create_session_lock's `claimed` docstring.
# Echoes: "OK" (lock acquired), "CONFLICT" (live foreign lock OR the lock write
# itself failed — see stderr), or "ERROR:<msg>" (import/exec failure before
# create_session_lock could run)
fw_session_create_codex_lock() {
    local session_id="$1"
    local branch="$2"
    local worktree_dir="$3"
    local claimed="${4:-false}"

    # create_session_lock() resolves its target path via get_state_dir(),
    # which walks cwd upward looking for .git — it must run with cwd inside
    # worktree_dir or it silently resolves a different repo's lock file.
    # Subshell so this never mutates the caller's cwd.
    (
        cd "$worktree_dir" || { echo "ERROR:cannot cd to $worktree_dir"; exit 0; }
        python3 - "$session_id" "$branch" "$worktree_dir" "$claimed" <<'PYEOF'
import sys
sys.path.insert(0, f"{sys.argv[3]}/.claude/hooks")
try:
    from path_utils import create_session_lock
    claimed = sys.argv[4].lower() == "true"
    print("OK" if create_session_lock(sys.argv[1], sys.argv[2], claimed=claimed) else "CONFLICT")
except Exception as e:
    print(f"ERROR:{e}")
PYEOF
    )
}

# ===================================================================
# Worktree Preservation Guard
# ===================================================================

# Decide whether the current worktree (caller must already be cd'd into it)
# has unsaved work that makes destroying it unsafe. Echoes a non-empty
# reason string if so, empty string if safe to destroy. Relies on the
# caller's $BRANCH_NAME global — session/* branches are exempt from the
# unpushed-commits check (disposable by design).
fw_session_check_preserve_reason() {
    local reason=""
    if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
        reason="uncommitted changes"
    elif [[ "$BRANCH_NAME" != session/* ]]; then
        # Non-session branch: check for unpushed commits.
        # No upstream = never pushed = treat all commits as unpushed.
        if ! git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
            if [ -n "$(git log --oneline 2>/dev/null | head -1)" ]; then
                reason="branch has no upstream (commits would be lost)"
            fi
        elif [ -n "$(git log '@{u}..' --oneline 2>/dev/null)" ]; then
            reason="unpushed commits"
        fi
    fi
    echo "$reason"
}

# ===================================================================
# Auto-Sync with Main
# ===================================================================

# Sync the current worktree with origin/main: fast-forward if possible,
# merge otherwise, and leave a merge-conflict.json marker for the
# merge-conflict-resolver hook if a merge conflict occurs. Relies on the
# caller's $WORKTREE_DIR and $FW_PROJECT_ROOT globals.
# Args: $1=label - the agent name shown in the conflict message
#       (e.g. "Claude", "Codex") so each launcher can use its own wording.
fw_session_sync_with_main() {
    local label="$1"

    cd "$WORKTREE_DIR" || { echo "   Cannot cd to $WORKTREE_DIR"; return 1; }

    # Fingerprint the frontend dependency manifest BEFORE syncing. The caller
    # ran `npm install` against the pre-sync manifest already. If the sync below
    # advances this worktree onto a newer origin/main whose package.json/lock
    # added dependencies, that node_modules is now stale and tools like
    # `expo start` fail resolving newly-referenced modules ("Failed to resolve
    # plugin ... Do you have node modules installed?"). We compare against this
    # fingerprint after the sync and re-install only if it changed. Lockfile-
    # preferred (pins transitive deps); falls back to package.json.
    local fe_dir="" fe_manifest="" pre_sync_manifest_hash=""
    if [ -n "$FRONTEND_ROOT" ] && [ -f "$WORKTREE_DIR/$FRONTEND_ROOT/package.json" ]; then
        fe_dir="$WORKTREE_DIR/$FRONTEND_ROOT"
        if [ -f "$fe_dir/package-lock.json" ]; then
            fe_manifest="$fe_dir/package-lock.json"
        else
            fe_manifest="$fe_dir/package.json"
        fi
        pre_sync_manifest_hash=$(git hash-object "$fe_manifest" 2>/dev/null || echo "")
    fi

    local commits_behind
    commits_behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo "0")

    if [ "$commits_behind" -eq 0 ]; then
        echo "   Already up to date with origin/main"
    else
        echo "   $commits_behind commits behind origin/main - syncing..."
        echo ""
        git log --oneline HEAD..origin/main 2>/dev/null | head -5 | sed 's/^/     /' || true
        echo ""

        # Check for uncommitted changes
        local stashed=0
        local stash_name=""

        if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
            stash_name="auto-stash-before-sync-$(date +%Y%m%d-%H%M%S)"
            echo "   Stashing uncommitted changes before sync..."
            git stash push -m "$stash_name"
            stashed=1
        fi

        # Try fast-forward first
        if git merge origin/main --ff-only 2>/dev/null; then
            echo "   Fast-forwarded to origin/main"
            if [ "$stashed" = 1 ]; then
                git stash pop 2>/dev/null && echo "   Restored stashed changes" || echo "   Stash pop had issues"
            fi
        else
            echo "   Cannot fast-forward. Attempting merge..."
            if git merge origin/main --no-edit 2>/dev/null; then
                echo "   Merged origin/main successfully"
                if [ "$stashed" = 1 ]; then
                    git stash pop 2>/dev/null && echo "   Restored stashed changes" || echo "   Stash pop had issues"
                fi
            else
                echo ""
                echo "   MERGE CONFLICT - $label will resolve this automatically!"
                echo ""
                git diff --name-only --diff-filter=U 2>/dev/null | sed 's/^/     - /'
                echo ""

                # Create marker file for hook
                mkdir -p "$WORKTREE_DIR/.claude/state"
                local conflicted_files
                conflicted_files=$(git diff --name-only --diff-filter=U 2>/dev/null | tr '\n' ' ')
                cat > "$WORKTREE_DIR/.claude/state/merge-conflict.json" << CONFLICT_EOF
{
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "behind_count": $commits_behind,
    "conflicted_files": "$(echo $conflicted_files | sed 's/ $//')",
    "stashed": $stashed,
    "stash_name": "$stash_name"
}
CONFLICT_EOF

                echo "   The merge-conflict-resolver hook will instruct Claude to fix this."
            fi
        fi
    fi

    # Re-install frontend deps if the sync changed the manifest (see the
    # fingerprint captured before syncing, above). Re-install only on an actual
    # change, so the common no-sync / deps-unchanged path pays nothing. Runs in
    # a subshell so the function's cwd is unaffected.
    if [ -n "$fe_manifest" ] && [ -n "$pre_sync_manifest_hash" ]; then
        local post_sync_manifest_hash
        post_sync_manifest_hash=$(git hash-object "$fe_manifest" 2>/dev/null || echo "")
        if [ -n "$post_sync_manifest_hash" ] && \
           [ "$post_sync_manifest_hash" != "$pre_sync_manifest_hash" ]; then
            echo "   Sync changed frontend dependencies - re-installing..."
            if ( cd "$fe_dir" && HUSKY=0 npm install --silent 2>/dev/null ); then
                echo "   Frontend dependencies re-installed"
            else
                echo "   Frontend re-install failed - run 'npm install' manually"
            fi
        fi
    fi

    cd "$FW_PROJECT_ROOT" || { echo "   Cannot cd back to $FW_PROJECT_ROOT"; return 1; }
}

# ===================================================================
# Session worktree creation (clean base ref)
# ===================================================================

# Resolve the repo's default branch name for basing new session branches on.
# Order: explicit FW_SESSION_BASE_REF override → the remote's advertised HEAD
# (via symbolic-ref, which distinguishes main vs master) → "main". Never prints
# empty. Reads the ambient git env (GIT_DIR/GIT_WORK_TREE) the launcher exports.
# nounset-safe: every expansion is guarded so the function is callable under the
# launchers' `set -euo pipefail`. A leading `origin/` on the override is stripped
# so an operator who passes the fully-qualified form (a natural mistake — it's how
# git status prints it) still resolves to a short branch name for the fetch/rev-parse.
fw_session_default_branch() {
    if [ -n "${FW_SESSION_BASE_REF:-}" ]; then
        printf '%s\n' "${FW_SESSION_BASE_REF#origin/}"
        return 0
    fi
    local resolved
    resolved="$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null || true)"
    resolved="${resolved#origin/}"
    printf '%s\n' "${resolved:-main}"
}

# Create the session worktree.
#   - EXISTING branch  → check it out unchanged (no base ref applied).
#   - NEW branch       → base it on origin/<default-branch> so the session branch
#     never inherits unrelated commits from whatever branch the launcher checkout
#     happens to be parked on. Falls back local-main-ward, then HEAD-ward, and
#     WARNS loudly (never silently) rather than aborting when nothing resolves.
# The fetch is best-effort and NON-interactive (GIT_TERMINAL_PROMPT=0) so it can
# neither hang on a credential prompt nor abort the launch under `set -e`.
# Args: $1=BRANCH_NAME  $2=WORKTREE_DIR
# Requires: ambient git env (GIT_DIR/GIT_WORK_TREE) set by the launcher.
fw_session_worktree_add() {
    local branch_name="$1"
    local worktree_dir="$2"

    if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        echo "   Note: Branch '$branch_name' already exists, checking it out"
        git worktree add "$worktree_dir" "$branch_name"
        return 0
    fi

    local main_branch base_ref
    main_branch="$(fw_session_default_branch)"

    # Refresh the remote ref if we can; ignore all failure (offline, no remote,
    # auth) — the resolution ladder below degrades gracefully regardless.
    # `--end-of-options` (git 2.24+, ubiquitous today) forces $main_branch to be read as a refspec,
    # never a git option: without it a poisoned FW_SESSION_BASE_REF=--upload-pack=<cmd>
    # would be parsed as an option and could spawn a local process (CWE-88). Options
    # are placed ahead of `origin` so the separator only guards the variable.
    GIT_TERMINAL_PROMPT=0 git fetch --no-tags --quiet origin --end-of-options "$main_branch" 2>/dev/null || true

    # Resolution ladder: remote default → local default → HEAD (last resort).
    # The terminal `echo HEAD` keeps the command substitution's exit status 0,
    # so neither `set -e` nor `pipefail` aborts here (verified). `--end-of-options`
    # keeps the pattern consistent (rev-parse spawns nothing, so this is defensive).
    base_ref="$(git rev-parse --verify --quiet --end-of-options "origin/$main_branch" \
             || git rev-parse --verify --quiet --end-of-options "$main_branch" \
             || echo HEAD)"

    if [ "$base_ref" = "HEAD" ]; then
        echo "   WARNING: could not resolve origin/$main_branch or local $main_branch;" >&2
        echo "            basing session on current HEAD - branch may carry unrelated commits." >&2
    fi

    git worktree add -b "$branch_name" "$worktree_dir" "$base_ref"
}
