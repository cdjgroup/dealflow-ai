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
    # Parse the configured command as argv, never as shell source. The Python
    # supervisor creates a dedicated process group and remains its identifiable
    # leader while the configured command runs.
    # Default the owner token here, in the shared lib, for the same reason
    # fw_session_create_codex_lock defaults its `claimed` argument: the
    # launchers that export FW_SESSION_OWNER_TOKEN are template-policy files
    # consumers customize and fw-sync never auto-updates, so a consumer on a
    # current shared lib can still be running a launcher that predates the
    # token. A bare expansion aborts such a launcher outright under the
    # `set -euo pipefail` inherited from _framework.sh. The token only has to
    # pair this spawn with the identity probe below, so a launch-local value
    # is sufficient whenever no session owner supplied one.
    FRONTEND_GROUP_TOKEN="${FW_SESSION_OWNER_TOKEN:-fw-session-$$}-frontend"
    PORT=$port BROWSER=none python3 -c '
import os
import shlex
import signal
import subprocess
import sys

token, command, port_flag, port = sys.argv[1:]
argv = shlex.split(command)
if not argv:
    raise SystemExit("frontend start command is empty")
if port_flag:
    argv.extend(["--", port_flag, port])
os.setsid()
# Keep the identifiable group leader alive until its direct child resolves.
# TERM still reaches the entire group; ordinary children exit and release this
# wait, while a stubborn child leaves the supervisor alive for the bounded
# cleanup probe to detect without an unbounded shell `wait`.
signal.signal(signal.SIGTERM, lambda _signum, _frame: None)
child = subprocess.Popen(argv)
raise SystemExit(child.wait())
' "$FRONTEND_GROUP_TOKEN" "$FRONTEND_START_CMD" \
        "$FRONTEND_PORT_FLAG" "$port" > "$logfile" 2>&1 &
    FRONTEND_PID=$!
    FRONTEND_PGID=$FRONTEND_PID

    sleep 3

    if fw_session_frontend_identity_matches \
        "$FRONTEND_PID" "$FRONTEND_PGID" "$FRONTEND_GROUP_TOKEN"; then
        echo "   Frontend running: http://localhost:$port"
        return 0
    else
        echo "   Frontend failed to start (check /tmp/frontend-$port.log)"
        return 1
    fi
}

# ===================================================================
# Codex Session Lock
# ===================================================================

# Create the session lock for a Codex session via path_utils.create_session_lock
# — this protects startup before a trusted Codex SessionStart hook can replace
# the placeholder with the real session identity. checkout-guard provides the
# first-tool fallback when SessionStart is unavailable. Honors a live
# foreign session's lock (e.g. a Claude session resuming this same worktree)
# rather than silently overwriting it. See docs/adr/039-codex-session-lock-guard-port.md.
# Args: $1=session_id $2=branch $3=worktree_dir (must contain .claude/hooks)
#       $4=claimed ("true"/"false", default "false"). This function is CODEX-ONLY
#       $5=optional owner token
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
fw_session_install_codex_permission_profile() {
    local worktree_dir="$1"
    local framework_root
    local runtime
    framework_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)" || {
        echo "ERROR:cannot resolve trusted session framework"
        return 1
    }
    runtime="$framework_root/.claude/hooks/codex_permissions.py"
    if [ ! -f "$runtime" ] || [ -L "$runtime" ]; then
        echo "ERROR:trusted Codex permission profile runtime is missing or unsafe"
        return 1
    fi
    python3 "$runtime" "$worktree_dir"
}

fw_session_create_codex_lock() {
    local session_id="$1"
    local branch="$2"
    local worktree_dir="$3"
    local claimed="${4:-false}"
    local owner_token="${5:-}"
    local permission_result

    if ! permission_result="$(fw_session_install_codex_permission_profile "$worktree_dir" 2>&1)"; then
        echo "${permission_result:-ERROR:Codex permission profile install failed}"
        return 0
    fi
    if [ "$permission_result" != "OK" ]; then
        echo "${permission_result:-ERROR:Codex permission profile install returned no result}"
        return 0
    fi

    # create_session_lock() resolves its target path via get_state_dir(),
    # which walks cwd upward looking for .git — it must run with cwd inside
    # worktree_dir or it silently resolves a different repo's lock file.
    # Subshell so this never mutates the caller's cwd.
    (
        cd "$worktree_dir" || { echo "ERROR:cannot cd to $worktree_dir"; exit 0; }
        python3 - "$session_id" "$branch" "$worktree_dir" "$claimed" "$owner_token" <<'PYEOF'
import sys
sys.path.insert(0, f"{sys.argv[3]}/.claude/hooks")
try:
    from path_utils import create_session_lock
    claimed = sys.argv[4].lower() == "true"
    owner_token = sys.argv[5] or None
    print(
        "OK"
        if create_session_lock(
            sys.argv[1], sys.argv[2], claimed=claimed, owner_token=owner_token
        )
        else "CONFLICT"
    )
except Exception as e:
    print(f"ERROR:{e}")
PYEOF
    )
}

# ===================================================================
# Worktree Preservation Guard
# ===================================================================

# Run Git against an exact worktree after removing inherited overrides that
# would otherwise disable repository discovery and pin probes elsewhere.
fw_session_git_at_worktree() {
    local exact_worktree_path="$1"
    shift

    env -u GIT_DIR -u GIT_WORK_TREE \
        git -C "$exact_worktree_path" "$@"
}

# Capture the immutable device/inode identity of one exact physical directory.
# The caller separately retains its canonical path for later comparison.
fw_session_capture_directory_identity() {
    local exact_path="$1"
    local canonical_path="$2"
    python3 - "$exact_path" "$canonical_path" <<'PYEOF'
import os
import stat
import sys

exact, canonical = sys.argv[1:]
entry = os.lstat(exact)
if not stat.S_ISDIR(entry.st_mode) or os.path.realpath(exact) != canonical:
    raise SystemExit(1)
print(entry.st_dev, entry.st_ino)
PYEOF
}

# Remove only `.claude-port` relative to the captured physical worktree
# directory. Opening with O_NOFOLLOW plus fstat identity verification prevents
# an intermediate or final path replacement from redirecting the unlink.
fw_session_unlink_port_file() {
    local exact_worktree_path="$1"
    local canonical_worktree="$2"
    local expected_dev="$3"
    local expected_ino="$4"

    if [ "${FW_TEST_PORT_UNLINK_FAIL:-}" = "1" ]; then
        echo "injected anchored port-file unlink failure" >&2
        return 74
    fi
    python3 - \
        "$exact_worktree_path" "$canonical_worktree" \
        "$expected_dev" "$expected_ino" <<'PYEOF'
import errno
import os
import stat
import sys

exact, canonical, expected_dev, expected_ino = sys.argv[1:]
expected = (int(expected_dev), int(expected_ino))
try:
    entry = os.lstat(exact)
except OSError as error:
    print(f"worktree identity probe failed: {error}", file=sys.stderr)
    raise SystemExit(1)
if (
    not stat.S_ISDIR(entry.st_mode)
    or (entry.st_dev, entry.st_ino) != expected
    or os.path.realpath(exact) != canonical
):
    print("worktree identity changed before port-file cleanup", file=sys.stderr)
    raise SystemExit(1)

flags = os.O_RDONLY
flags |= getattr(os, "O_DIRECTORY", 0)
flags |= getattr(os, "O_NOFOLLOW", 0)
try:
    directory_fd = os.open(exact, flags)
except OSError as error:
    print(f"could not open captured worktree: {error}", file=sys.stderr)
    raise SystemExit(1)
try:
    opened = os.fstat(directory_fd)
    if (opened.st_dev, opened.st_ino) != expected:
        print("opened worktree identity does not match capture", file=sys.stderr)
        raise SystemExit(1)
    try:
        port_entry = os.stat(".claude-port", dir_fd=directory_fd, follow_symlinks=False)
    except FileNotFoundError:
        raise SystemExit(0)
    if stat.S_ISLNK(port_entry.st_mode):
        print("refusing symlink .claude-port entry", file=sys.stderr)
        raise SystemExit(1)
    try:
        os.unlink(".claude-port", dir_fd=directory_fd)
    except FileNotFoundError:
        pass
finally:
    os.close(directory_fd)
PYEOF
}

# Classify one exact worktree path from the main checkout.  Python consumes
# Git's bytes directly so command substitution cannot trim records and paths
# quoted by pre-2.36 porcelain output are decoded without requiring `-z`.
# Echoes: unknown, fully-absent, unregistered-with-residue,
# registered-and-missing<TAB>branch, or registered-and-present<TAB>branch.
fw_session_classify_worktree() {
    local main_checkout="$1"
    local exact_worktree_path="$2"

    env -u GIT_DIR -u GIT_WORK_TREE \
        python3 - "$main_checkout" "$exact_worktree_path" <<'PYEOF'
import os
import subprocess
import sys

main_checkout, target = sys.argv[1:]
env = os.environ.copy()
env.pop("GIT_DIR", None)
env.pop("GIT_WORK_TREE", None)
try:
    result = subprocess.run(
        ["git", "-C", main_checkout, "worktree", "list", "--porcelain"],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        env=env,
        check=False,
    )
except OSError:
    print("unknown")
    raise SystemExit
if result.returncode:
    print("unknown")
    raise SystemExit

def unquote_git_path(value):
    if not (value.startswith(b'"') and value.endswith(b'"')):
        return os.fsdecode(value)
    value = value[1:-1]
    output = bytearray()
    escapes = {
        ord("a"): 7, ord("b"): 8, ord("t"): 9, ord("n"): 10,
        ord("v"): 11, ord("f"): 12, ord("r"): 13,
        ord("\\"): 92, ord('"'): 34,
    }
    index = 0
    while index < len(value):
        byte = value[index]
        if byte != 92:
            output.append(byte)
            index += 1
            continue
        index += 1
        if index >= len(value):
            output.append(92)
            break
        byte = value[index]
        if 48 <= byte <= 55:
            digits = bytearray()
            while index < len(value) and len(digits) < 3 and 48 <= value[index] <= 55:
                digits.append(value[index])
                index += 1
            output.append(int(digits.decode("ascii"), 8))
            continue
        output.append(escapes.get(byte, byte))
        index += 1
    return os.fsdecode(bytes(output))

canonical_target = os.path.realpath(target)
registered_branch = None
for record in result.stdout.split(b"\n\n"):
    path = None
    branch = ""
    for line in record.splitlines():
        if line.startswith(b"worktree "):
            path = unquote_git_path(line[len(b"worktree "):])
        elif line.startswith(b"branch "):
            branch = os.fsdecode(line[len(b"branch "):])
        elif line == b"detached":
            branch = "(detached)"
    if path is not None and os.path.realpath(path) == canonical_target:
        registered_branch = branch or "(unknown)"
        break

present = os.path.lexists(target)
if registered_branch is not None:
    state = "registered-and-present" if present else "registered-and-missing"
    print(f"{state}\t{registered_branch}")
elif present:
    print("unregistered-with-residue")
else:
    print("fully-absent")
PYEOF
}

# Refuse to resume a directory unless Git registers that exact path for the
# exact requested local branch. This closes collisions in the legacy
# slash-to-hyphen directory encoding (for example feat/a-b vs feat-a/b).
fw_session_validate_existing_worktree() {
    local main_checkout="$1"
    local exact_worktree_path="$2"
    local expected_branch="$3"
    local observed state branch

    observed="$(fw_session_classify_worktree "$main_checkout" "$exact_worktree_path")"
    state="${observed%%	*}"
    if [ "$observed" = "$state" ]; then
        branch=""
    else
        branch="${observed#*	}"
    fi
    if [ "$state" != "registered-and-present" ]; then
        echo "ERROR: refusing to resume $exact_worktree_path: exact worktree state is $state" >&2
        return 1
    fi
    if [ "$branch" != "refs/heads/$expected_branch" ]; then
        echo "ERROR: refusing to resume $exact_worktree_path: registered branch is $branch, requested refs/heads/$expected_branch (directory-name collision or stale worktree)" >&2
        return 1
    fi
    if [ ! -d "$exact_worktree_path" ] || [ -L "$exact_worktree_path" ]; then
        echo "ERROR: refusing to resume $exact_worktree_path: target is not a physical directory" >&2
        return 1
    fi
}

# Validate the launcher-owned lock and emit stable evidence for a later
# same-instance recheck. A non-OK line is a user-facing preserve reason.
fw_session_check_lock_reason() {
    local lock_path="$1"
    local ownership_nonce="$2"
    local expected_branch="$3"
    local canonical_worktree="$4"

    python3 - \
        "$lock_path" "$ownership_nonce" "$expected_branch" \
        "$canonical_worktree" <<'PYEOF'
import json
import os
import sys
from datetime import datetime
from pathlib import Path

lock_path = Path(sys.argv[1])
canonical_worktree = Path(os.path.realpath(sys.argv[4]))
expected_lock = canonical_worktree / ".claude" / "state" / "session-lock.json"
if (
    not lock_path.is_file()
    or lock_path.is_symlink()
    or Path(os.path.realpath(lock_path)) != expected_lock
):
    print("session lock is missing")
    raise SystemExit
try:
    resolved_lock = lock_path.resolve(strict=True)
    if resolved_lock != expected_lock:
        raise ValueError("lock resolved outside canonical worktree")
    before = resolved_lock.stat()
    lock = json.loads(resolved_lock.read_text())
    after = resolved_lock.stat()
except Exception:
    print("session lock is malformed")
    raise SystemExit
if (before.st_dev, before.st_ino, before.st_size, before.st_mtime_ns) != (
    after.st_dev, after.st_ino, after.st_size, after.st_mtime_ns
):
    print("session lock changed during validation")
    raise SystemExit
if not isinstance(lock, dict):
    print("session lock schema is invalid")
    raise SystemExit
if not isinstance(lock.get("session_id"), str) or not lock["session_id"]:
    print("session lock schema is invalid")
    raise SystemExit
pid = lock.get("pid")
if isinstance(pid, bool) or not isinstance(pid, int) or pid <= 0:
    print("session lock schema is invalid")
    raise SystemExit
try:
    started = datetime.fromisoformat(lock["started_at"].replace("Z", "+00:00"))
    started_age = (datetime.now(started.tzinfo) - started).total_seconds()
    if started_age < 0:
        print("session lock start time is invalid")
        raise SystemExit
except (KeyError, TypeError, ValueError):
    print("session lock schema is invalid")
    raise SystemExit
try:
    heartbeat = datetime.fromisoformat(
        lock["last_heartbeat"].replace("Z", "+00:00")
    )
    now = datetime.now(heartbeat.tzinfo)
    age_seconds = (now - heartbeat).total_seconds()
    if age_seconds < 0:
        print("session lock heartbeat is invalid")
        raise SystemExit
    if age_seconds > 1800:
        print("session lock is stale")
        raise SystemExit
except (KeyError, TypeError, ValueError):
    print("session lock is stale")
    raise SystemExit
if lock.get("claimed") is not True:
    print("session lock is not claimed")
elif lock.get("owner_token") != sys.argv[2]:
    print("session lock owner mismatch")
elif lock.get("branch") != sys.argv[3]:
    print("session lock branch mismatch")
elif lock.get("worktree_path") != sys.argv[4]:
    print("session lock worktree mismatch")
else:
    evidence = [
        str(resolved_lock),
        after.st_dev,
        after.st_ino,
        after.st_size,
        after.st_mtime_ns,
    ]
    print("OK:" + json.dumps(evidence, separators=(",", ":")))
PYEOF
}

# Echo a non-empty reason unless CLEAN_WORKTREE=true and
# FW_SESSION_CLEANUP_ARMED=true and the request proves lock ownership, exact
# worktree/branch identity, clean Git-visible state, and local commit
# containment. Zero-argument legacy callers always preserve.
fw_session_check_preserve_reason() {
    if [ "$#" -eq 0 ]; then
        echo "cleanup ownership was not validated"
        return 0
    fi

    local exact_worktree_path="$1"
    local expected_branch="$2"
    local ownership_nonce="$3"
    local launch_base_oid="$4"
    local branch_created_this_launch="$5"

    if [ "${CLEAN_WORKTREE:-}" != "true" ] || \
       [ "${FW_SESSION_CLEANUP_ARMED:-}" != "true" ] || \
       [ -z "$ownership_nonce" ]; then
        echo "cleanup request is not armed"
        return 0
    fi

    local canonical_worktree
    canonical_worktree="$(cd "$exact_worktree_path" 2>/dev/null && pwd -P)" || {
        echo "worktree probe failed"
        return 0
    }

    local initial_lock_evidence
    if ! initial_lock_evidence="$(
        fw_session_check_lock_reason \
            "$exact_worktree_path/.claude/state/session-lock.json" \
            "$ownership_nonce" "$expected_branch" "$canonical_worktree"
    )"; then
        echo "session lock probe failed"
        return 0
    fi
    if [[ "$initial_lock_evidence" != OK:* ]]; then
        echo "$initial_lock_evidence"
        return 0
    fi

    local current_branch
    current_branch="$(
        fw_session_git_at_worktree \
            "$exact_worktree_path" symbolic-ref --quiet --short HEAD 2>/dev/null
    )" || {
        echo "worktree branch could not be resolved"
        return 0
    }
    if [ "$current_branch" != "$expected_branch" ]; then
        echo "worktree branch mismatch"
        return 0
    fi

    local status_output
    status_output="$(
        mktemp "${TMPDIR:-/tmp}/shipteam-status.XXXXXX"
    )" || {
        echo "worktree status probe failed"
        return 0
    }
    if ! \
        fw_session_git_at_worktree \
            "$exact_worktree_path" status \
            --porcelain=v1 -z --untracked-files=all \
            --ignore-submodules=none >"$status_output" 2>/dev/null; then
        rm -f "$status_output"
        echo "worktree status probe failed"
        return 0
    fi
    if [ -s "$status_output" ]; then
        rm -f "$status_output"
        echo "worktree has uncommitted changes"
        return 0
    fi
    rm -f "$status_output"

    local ahead_reason
    ahead_reason="$(
        fw_session_check_ahead_reason \
            "$exact_worktree_path" "$launch_base_oid" \
            "$branch_created_this_launch"
    )"
    if [ -n "$ahead_reason" ]; then
        echo "$ahead_reason"
        return 0
    fi

    local final_lock_evidence
    if ! final_lock_evidence="$(
        fw_session_check_lock_reason \
            "$exact_worktree_path/.claude/state/session-lock.json" \
            "$ownership_nonce" "$expected_branch" "$canonical_worktree"
    )"; then
        echo "session lock probe failed"
        return 0
    fi
    if [[ "$final_lock_evidence" != OK:* ]]; then
        echo "$final_lock_evidence"
        return 0
    fi
    if [ "$final_lock_evidence" != "$initial_lock_evidence" ]; then
        echo "session lock changed during validation"
        return 0
    fi
    echo ""
}

fw_session_check_ahead_reason() {
    local exact_worktree_path="$1"
    local launch_base_oid="$2"
    local branch_created_this_launch="$3"

    if ! fw_session_git_at_worktree \
        "$exact_worktree_path" rev-parse --is-inside-work-tree \
        >/dev/null 2>&1; then
        echo "repository probe failed"
        return 0
    fi

    local head_oid
    head_oid="$(
        fw_session_git_at_worktree \
            "$exact_worktree_path" rev-parse --verify 'HEAD^{commit}' 2>/dev/null
    )" || {
        echo "HEAD probe failed"
        return 0
    }
    if ! fw_session_git_at_worktree \
        "$exact_worktree_path" cat-file -e "$head_oid^{commit}" \
        >/dev/null 2>&1; then
        echo "HEAD object probe failed"
        return 0
    fi

    if [ "$branch_created_this_launch" = "true" ]; then
        local baseline_oid
        baseline_oid="$(
            fw_session_git_at_worktree \
                "$exact_worktree_path" rev-parse --verify \
                "$launch_base_oid^{commit}" 2>/dev/null
        )" || {
            echo "launch baseline $launch_base_oid is invalid (probe failed)"
            return 0
        }
        if [ "$head_oid" != "$baseline_oid" ]; then
            echo "branch HEAD $head_oid moved from launch baseline $launch_base_oid"
        else
            echo ""
        fi
        return 0
    fi

    local current_branch upstream remote
    current_branch="$(
        fw_session_git_at_worktree \
            "$exact_worktree_path" symbolic-ref --quiet --short HEAD 2>/dev/null
    )" || {
        echo "branch could not be resolved"
        return 0
    }
    upstream="$(
        fw_session_git_at_worktree \
            "$exact_worktree_path" rev-parse \
            --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null
    )" || {
        echo "branch has no remote upstream"
        return 0
    }
    remote="$(
        fw_session_git_at_worktree \
            "$exact_worktree_path" config --get \
            "branch.$current_branch.remote" 2>/dev/null
    )" || true
    if [ -z "$remote" ] || [ "$remote" = "." ]; then
        echo "branch upstream is not remote"
        return 0
    fi
    local upstream_oid
    upstream_oid="$(
        fw_session_git_at_worktree \
            "$exact_worktree_path" rev-parse --verify \
            "$upstream^{commit}" 2>/dev/null
    )" || {
        echo "upstream $upstream probe failed"
        return 0
    }
    local merge_base_status
    if fw_session_git_at_worktree \
        "$exact_worktree_path" merge-base --is-ancestor \
        "$head_oid" "$upstream_oid" >/dev/null 2>&1; then
        echo ""
        return 0
    else
        merge_base_status=$?
    fi
    if [ "$merge_base_status" -eq 1 ]; then
        echo "branch HEAD $head_oid is ahead of or not contained by upstream $upstream"
        return 0
    fi
    echo "reachability probe failed for HEAD $head_oid and upstream $upstream"
}

# Remove one exact worktree from the main checkout without forcing or pruning.
# On failure, leave git's stderr visible and report the exact state observed by
# a fresh registration/path probe.
fw_session_remove_worktree() {
    local main_checkout="$1"
    local exact_worktree_path="$2"
    local ownership_nonce="$3"
    local expected_branch="$4"
    local canonical_snapshot="$5"
    local remove_status

    python3 - \
        "$main_checkout" "$exact_worktree_path" \
        "$ownership_nonce" "$expected_branch" "$canonical_snapshot" <<'PYEOF'
import fcntl
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

(
    main,
    selected_target,
    owner_token,
    expected_branch,
    canonical_snapshot,
) = sys.argv[1:]
if (
    not os.path.isabs(selected_target)
    or os.path.islink(selected_target)
    or not os.path.isdir(selected_target)
):
    print("  Worktree removal failed: target identity changed", file=sys.stderr)
    raise SystemExit(1)
if (
    not os.path.isabs(canonical_snapshot)
    or os.path.realpath(canonical_snapshot) != canonical_snapshot
    or os.path.realpath(selected_target) != canonical_snapshot
):
    print("  Worktree removal failed: target identity changed", file=sys.stderr)
    raise SystemExit(1)
lock_path = (
    Path(canonical_snapshot) / ".claude" / "state" / "session-lock.json"
)
guard_path = lock_path.with_name(lock_path.name + ".guard")
flags = os.O_CREAT | os.O_RDWR
flags |= getattr(os, "O_CLOEXEC", 0)
flags |= getattr(os, "O_NOFOLLOW", 0)
fd = os.open(guard_path, flags, 0o600)
with os.fdopen(fd, "a+") as guard:
    fcntl.flock(guard.fileno(), fcntl.LOCK_EX)
    try:
        if lock_path.is_symlink() or lock_path.resolve(strict=True) != lock_path:
            raise ValueError("lock path changed")
        lock = json.loads(lock_path.read_text())
        if not isinstance(lock, dict):
            raise ValueError("lock schema")
        if lock.get("claimed") is not True:
            raise ValueError("lock is not claimed")
        if lock.get("owner_token") != owner_token:
            raise ValueError("lock owner mismatch")
        if lock.get("branch") != expected_branch:
            raise ValueError("lock branch mismatch")
        if lock.get("worktree_path") != canonical_snapshot:
            raise ValueError("lock worktree mismatch")
        for key in ("started_at", "last_heartbeat"):
            parsed = datetime.fromisoformat(lock[key].replace("Z", "+00:00"))
            age = (datetime.now(parsed.tzinfo) - parsed).total_seconds()
            if age < 0:
                raise ValueError(f"{key} is in the future")
            if key == "last_heartbeat" and age > 1800:
                raise ValueError("lock is stale")
        env = os.environ.copy()
        env.pop("GIT_DIR", None)
        env.pop("GIT_WORK_TREE", None)
        top = subprocess.run(
            ["git", "-C", canonical_snapshot, "rev-parse", "--show-toplevel"],
            env=env, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        branch = subprocess.run(
            ["git", "-C", canonical_snapshot, "symbolic-ref",
             "--quiet", "--short", "HEAD"],
            env=env, text=True, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
        if (
            top.returncode != 0
            or os.path.realpath(top.stdout.strip()) != canonical_snapshot
            or branch.returncode != 0
            or branch.stdout.strip() != expected_branch
        ):
            raise ValueError("worktree registration or branch changed")
    except Exception as exc:
        print(
            f"  Worktree removal failed: session lock validation: {exc}",
            file=sys.stderr,
        )
        raise SystemExit(1)

    # Keep the authorization guard through Git's non-force removal.
    completed = subprocess.run(
        ["git", "-C", main, "worktree", "remove", canonical_snapshot],
        env=env,
    )
    raise SystemExit(completed.returncode)
PYEOF
    remove_status=$?

    local observed
    observed="$(fw_session_classify_worktree "$main_checkout" "$exact_worktree_path")"
    observed="${observed%%	*}"
    if [ "$remove_status" -eq 0 ] && [ "$observed" = "fully-absent" ]; then
        return 0
    fi

    echo "  Worktree removal failed: $observed" >&2
    if [ "$remove_status" -eq 0 ]; then
        return 1
    fi
    return "$remove_status"
}

# Verify that the direct supervisor still has the expected process group and
# random argv token immediately before group signaling.
fw_session_frontend_identity_matches() {
    local frontend_pid="$1"
    local frontend_pgid="$2"
    local frontend_token="$3"

    if [ "${FW_TEST_FRONTEND_IDENTITY_FAIL_COUNT:-0}" -gt 0 ] 2>/dev/null; then
        FW_TEST_FRONTEND_IDENTITY_FAIL_COUNT=$(
            expr "${FW_TEST_FRONTEND_IDENTITY_FAIL_COUNT:-0}" - 1
        )
        export FW_TEST_FRONTEND_IDENTITY_FAIL_COUNT
        echo "injected transient frontend identity-probe failure" >&2
        return 1
    fi
    python3 - "$frontend_pid" "$frontend_pgid" "$frontend_token" <<'PYEOF'
import subprocess
import sys

pid, expected_pgid, token = sys.argv[1:]
try:
    result = subprocess.run(
        ["ps", "-o", "pgid=", "-o", "command=", "-p", pid],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        check=False,
    )
except OSError:
    raise SystemExit(1)
line = result.stdout.strip()
if result.returncode or not line:
    raise SystemExit(1)
parts = line.split(None, 1)
if len(parts) != 2 or parts[0] != expected_pgid or token not in parts[1]:
    raise SystemExit(1)
PYEOF
}

# Return success while any non-zombie member of the exact group lives.
fw_session_frontend_group_has_live_members() {
    local frontend_pgid="$1"
    python3 - "$frontend_pgid" <<'PYEOF'
import subprocess
import sys

expected = int(sys.argv[1])
try:
    result = subprocess.run(
        ["ps", "-eo", "pid=,pgid=,stat="],
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        text=True,
        check=False,
    )
except OSError:
    raise SystemExit(2)
if result.returncode:
    raise SystemExit(2)
for line in result.stdout.splitlines():
    parts = line.split()
    if len(parts) >= 3 and int(parts[1]) == expected and "Z" not in parts[2]:
        raise SystemExit(0)
raise SystemExit(1)
PYEOF
}

# Stop and reap the launcher-owned process group. Identity is checked before
# TERM and disappearance is bounded; an unverified or stubborn tree fails
# closed so its worktree is not removed.
fw_session_stop_frontend() {
    local frontend_pid="$1"
    local frontend_pgid="$2"
    local frontend_token="$3"
    local attempts=0
    local group_status

    case "$frontend_pid" in
        ''|*[!0-9]*)
            echo "  Frontend cleanup failed: invalid process-group identity" >&2
            return 1
            ;;
    esac
    case "$frontend_pgid" in
        ''|*[!0-9]*)
            echo "  Frontend cleanup failed: invalid process-group identity" >&2
            return 1
            ;;
    esac
    if ! fw_session_frontend_identity_matches \
        "$frontend_pid" "$frontend_pgid" "$frontend_token"; then
        echo "  Frontend cleanup failed: launcher-owned process identity could not be verified; preserving worktree" >&2
        return 1
    fi
    echo "   Stopping frontend process group $frontend_pgid..."
    kill -TERM -- "-$frontend_pgid" 2>/dev/null || {
        echo "  Frontend cleanup failed: could not signal process group $frontend_pgid" >&2
        return 1
    }
    while [ "$attempts" -lt 20 ]; do
        fw_session_frontend_group_has_live_members "$frontend_pgid"
        group_status=$?
        if [ "$group_status" -eq 1 ]; then
            wait "$frontend_pid" 2>/dev/null || true
            return 0
        fi
        if [ "$group_status" -gt 1 ]; then
            echo "  Frontend cleanup failed: process-group probe failed; preserving worktree" >&2
            return 1
        fi
        sleep 0.1
        attempts=$((attempts + 1))
    done
    echo "  Frontend cleanup failed: process group $frontend_pgid did not stop after TERM; preserving worktree" >&2
    return 1
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

    # Best-effort CI-health backfill (ADR-066 AC-1): fire-and-forget, never blocks
    # session launch. backfill_ci_health() already fails closed on any
    # git/gh error and bounds itself with per-subprocess timeouts (~66s
    # worst case for a full lookback window). Running it detached in the
    # background means that worst case is invisible to the interactive
    # session regardless of gh's responsiveness. Must run with cwd ==
    # $WORKTREE_DIR: `-m scripts.ci_health_backfill` resolves the `scripts`
    # package via cwd, and the module writes its watermark relative to cwd.
    # stderr is captured (not discarded) so a pre-backfill_ci_health()
    # startup failure -- missing python3, a broken `scripts` package import
    # -- leaves a trace instead of silently disabling ADR-066 AC-1 forever. The
    # target directory is gitignored and absent on a fresh worktree; bash
    # resolves the >> redirect before exec'ing python3, so a missing
    # directory would silently no-op the whole command (defeating the
    # stderr-capture fix above) unless created first.
    mkdir -p "$WORKTREE_DIR/.context/metrics"
    ( cd "$WORKTREE_DIR" && python3 -m scripts.ci_health_backfill \
        >/dev/null 2>>"$WORKTREE_DIR/.context/metrics/ci-backfill-startup.log" & ) 2>/dev/null

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
