#!/usr/bin/env python3
"""
Branch Check Hook - Runs on EVERY user prompt submission.

Compares the current git branch against an expected branch file.
If there's a mismatch, it BLOCKS (exit 1) to prevent working on the wrong branch.

Features:
- Session-aware locking to detect concurrent sessions
- Stale lock detection (30 min timeout)
- Heartbeat updates on each check
- Drift detection from origin/main
- Auto-sync with origin/main (stash, fast-forward, merge)
- Merge conflict detection with instructions for Claude

Usage: Added to settings.local.json as UserPromptSubmit hook
"""

import subprocess
import sys
import os
import json
import uuid
import fcntl
from datetime import datetime
from pathlib import Path

# Import worktree-aware path utilities
try:
    from path_utils import (
        get_project_root, get_state_dir,
        GIT_ENV, get_current_branch, read_session_lock,
        is_lock_stale, is_process_alive, STALE_TIMEOUT_SECONDS,
    )
    PROJECT_ROOT = get_project_root()
except ImportError:
    # Fallback to cwd-based detection
    PROJECT_ROOT = Path.cwd()
    while PROJECT_ROOT != PROJECT_ROOT.parent:
        if (PROJECT_ROOT / '.git').exists():
            break
        PROJECT_ROOT = PROJECT_ROOT.parent

    STALE_TIMEOUT_SECONDS = 1800
    GIT_ENV = {
        **os.environ,
        'GIT_DIR': str(PROJECT_ROOT / '.git'),
        'GIT_WORK_TREE': str(PROJECT_ROOT)
    }

    def get_current_branch():
        try:
            result = subprocess.run(
                ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
                capture_output=True, text=True,
                cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
            )
            return result.stdout.strip() if result.returncode == 0 else "UNKNOWN"
        except Exception:
            return "UNKNOWN"

    def read_session_lock():
        lock_file = PROJECT_ROOT / '.claude' / 'state' / 'session-lock.json'
        try:
            if lock_file.exists():
                return json.loads(lock_file.read_text())
            return None
        except (json.JSONDecodeError, IOError):
            return None

    def is_lock_stale(lock_data):
        try:
            last_hb = datetime.fromisoformat(lock_data['last_heartbeat'])
            return (datetime.now() - last_hb).total_seconds() > STALE_TIMEOUT_SECONDS
        except Exception:
            return True

    def is_process_alive(pid):
        if pid is None:
            return False
        try:
            os.kill(pid, 0)
            return True
        except (OSError, TypeError):
            return False

STATE_DIR = PROJECT_ROOT / '.claude' / 'state'
EXPECTED_BRANCH_FILE = PROJECT_ROOT / '.claude' / 'expected-branch.txt'
SESSION_LOCK_FILE = STATE_DIR / 'session-lock.json'
HANDOFF_FILE = STATE_DIR / 'pre-compact-handoff.json'

# Drift check interval: only fetch every 5 minutes to avoid slowdown
DRIFT_CHECK_INTERVAL_SECONDS = 300
DRIFT_LAST_CHECK_FILE = STATE_DIR / 'drift-last-check.json'


def get_or_create_session_id():
    """Get session ID from environment or generate new one."""
    session_id = os.environ.get('CLAUDE_SESSION_ID')
    if not session_id:
        session_id = str(uuid.uuid4())[:8]
    return session_id


def get_expected_branch():
    """Read the expected branch from file."""
    try:
        return EXPECTED_BRANCH_FILE.read_text().strip()
    except FileNotFoundError:
        return None
    except (IOError, OSError, UnicodeDecodeError) as e:
        print(f"[branch-check] WARNING: Could not read expected branch file: {e}", file=sys.stderr)
        return None


def write_session_lock(session_id, branch):
    """Write/update the session lock file with atomic file locking."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    lock = {
        'session_id': session_id,
        'pid': os.getpid(),
        'branch': branch,
        'started_at': datetime.now().isoformat(),
        'last_heartbeat': datetime.now().isoformat()
    }
    try:
        with open(SESSION_LOCK_FILE, 'w') as f:
            fcntl.flock(f.fileno(), fcntl.LOCK_EX)
            try:
                json.dump(lock, f, indent=2)
            finally:
                fcntl.flock(f.fileno(), fcntl.LOCK_UN)
    except Exception as e:
        print(f"[branch-check] WARNING: Could not write session lock: {e}", file=sys.stderr)


def update_heartbeat(session_id, branch):
    """Update the heartbeat in the session lock file."""
    lock = read_session_lock()
    if lock and lock.get('session_id') == session_id:
        lock['last_heartbeat'] = datetime.now().isoformat()
        lock['branch'] = branch
        try:
            SESSION_LOCK_FILE.write_text(json.dumps(lock, indent=2))
        except Exception as e:
            print(f"[branch-check] WARNING: Could not update heartbeat: {e}", file=sys.stderr)


def check_session_conflict(my_session_id, current_branch):
    """Check for concurrent session conflicts."""
    lock = read_session_lock()

    if lock is None:
        write_session_lock(my_session_id, current_branch)
        return None

    lock_session_id = lock.get('session_id', 'unknown')
    lock_branch = lock.get('branch', 'unknown')
    lock_pid = lock.get('pid')

    if lock_session_id == my_session_id:
        update_heartbeat(my_session_id, current_branch)
        return None

    if is_lock_stale(lock) or not is_process_alive(lock_pid):
        write_session_lock(my_session_id, current_branch)
        return {
            'type': 'stale_lock_claimed',
            'previous_session': lock_session_id,
            'previous_branch': lock_branch,
            'previous_pid': lock_pid,
            'reason': 'stale_heartbeat' if is_lock_stale(lock) else 'process_dead'
        }

    return {
        'type': 'concurrent_session',
        'other_session': lock_session_id,
        'other_branch': lock_branch,
        'other_pid': lock_pid,
        'warning': f"Another session ({lock_session_id}) is active on this worktree (branch: {lock_branch}, PID: {lock_pid})"
    }


def check_handoff_file():
    """Check if there's a pre-compact handoff file to read."""
    try:
        if HANDOFF_FILE.exists():
            return json.loads(HANDOFF_FILE.read_text())
        return None
    except (json.JSONDecodeError, IOError) as e:
        print(f"[branch-check] WARNING: Could not read handoff file: {e}", file=sys.stderr)
        return None


def should_check_drift():
    """Check if enough time has passed since last drift check."""
    try:
        if not DRIFT_LAST_CHECK_FILE.exists():
            return True
        data = json.loads(DRIFT_LAST_CHECK_FILE.read_text())
        last_check = datetime.fromisoformat(data.get('checked_at', '2000-01-01'))
        elapsed = (datetime.now() - last_check).total_seconds()
        return elapsed > DRIFT_CHECK_INTERVAL_SECONDS
    except (json.JSONDecodeError, IOError, ValueError) as e:
        print(f"[branch-check] WARNING: Could not check drift interval: {e}", file=sys.stderr)
        return True


def record_drift_check():
    """Record that we just performed a drift check."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        DRIFT_LAST_CHECK_FILE.write_text(json.dumps({
            'checked_at': datetime.now().isoformat()
        }))
    except Exception as e:
        print(f"[branch-check] WARNING: Could not record drift check: {e}", file=sys.stderr)


def check_drift_from_main():
    """Check if origin/main has commits not in the current branch."""
    if not should_check_drift():
        return None

    try:
        fetch_result = subprocess.run(
            ['git', 'fetch', 'origin', 'main', '--quiet'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=10
        )
        record_drift_check()

        if fetch_result.returncode != 0:
            return None

        count_result = subprocess.run(
            ['git', 'rev-list', '--count', 'HEAD..origin/main'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )

        if count_result.returncode != 0:
            return None

        commits_behind = int(count_result.stdout.strip())
        if commits_behind == 0:
            return None

        log_result = subprocess.run(
            ['git', 'log', '--oneline', 'HEAD..origin/main', '-10'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )

        missed_commits = []
        if log_result.returncode == 0:
            missed_commits = log_result.stdout.strip().split('\n')[:5]

        return {
            'commits_behind': commits_behind,
            'missed_commits': missed_commits,
            'suggestion': 'Run: git fetch origin && git rebase origin/main'
        }

    except subprocess.TimeoutExpired:
        return None
    except Exception as e:
        print(f"[branch-check] WARNING: Drift check failed: {e}", file=sys.stderr)
        return None


# ═══════════════════════════════════════════════════════════════════
# Auto-Sync with Main
# ═══════════════════════════════════════════════════════════════════

SYNC_MARKER_FILE = STATE_DIR / 'last-auto-sync.json'
MERGE_CONFLICT_MARKER = STATE_DIR / 'merge-conflict.json'


def should_auto_sync():
    """Check if we should attempt auto-sync (once per session start)."""
    try:
        if not SYNC_MARKER_FILE.exists():
            return True
        data = json.loads(SYNC_MARKER_FILE.read_text())
        lock = read_session_lock()
        if lock and data.get('session_id') == lock.get('session_id'):
            return False
        return True
    except (json.JSONDecodeError, IOError) as e:
        print(f"[branch-check] WARNING: Could not check sync state: {e}", file=sys.stderr)
        return True


def record_sync_attempt(session_id, result):
    """Record that we attempted a sync."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        SYNC_MARKER_FILE.write_text(json.dumps({
            'session_id': session_id,
            'synced_at': datetime.now().isoformat(),
            'result': result
        }))
    except Exception as e:
        print(f"[branch-check] WARNING: Could not record sync attempt: {e}", file=sys.stderr)


def is_merge_in_progress():
    """Check if there's an active merge."""
    git_path = PROJECT_ROOT / '.git'
    if git_path.is_file():
        try:
            content = git_path.read_text().strip()
            if content.startswith('gitdir: '):
                git_path = Path(content[8:])
        except (IOError, OSError) as e:
            print(f"[branch-check] WARNING: Could not read .git file: {e}", file=sys.stderr)
    merge_head = git_path / 'MERGE_HEAD'
    return merge_head.exists()


def auto_sync_with_main(session_id, commits_behind):
    """Automatically sync with origin/main."""
    if not should_auto_sync():
        return None

    if is_merge_in_progress():
        return {'status': 'skipped', 'reason': 'merge_in_progress'}

    print(f"\nAUTO-SYNC: {commits_behind} commits behind origin/main", file=sys.stderr)

    # Check for uncommitted changes
    stashed = False
    stash_name = None
    try:
        diff_result = subprocess.run(
            ['git', 'diff', '--quiet'],
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )
        diff_cached = subprocess.run(
            ['git', 'diff', '--cached', '--quiet'],
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )

        if diff_result.returncode != 0 or diff_cached.returncode != 0:
            stash_name = f"auto-stash-sync-{datetime.now().strftime('%Y%m%d-%H%M%S')}"
            print(f"   Stashing uncommitted changes...", file=sys.stderr)
            stash_result = subprocess.run(
                ['git', 'stash', 'push', '-m', stash_name],
                capture_output=True, text=True,
                cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=30
            )
            if stash_result.returncode == 0:
                stashed = True
    except Exception as e:
        print(f"   Could not check/stash changes: {e}", file=sys.stderr)

    # Try fast-forward first
    try:
        ff_result = subprocess.run(
            ['git', 'merge', 'origin/main', '--ff-only'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=30
        )
        if ff_result.returncode == 0:
            print(f"   Fast-forwarded to origin/main", file=sys.stderr)
            if stashed:
                subprocess.run(
                    ['git', 'stash', 'pop'],
                    cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=30
                )
            record_sync_attempt(session_id, 'fast_forward')
            return {'status': 'synced', 'method': 'fast_forward'}
    except Exception as e:
        print(f"[branch-check] WARNING: Fast-forward merge failed: {e}", file=sys.stderr)

    # Try regular merge
    try:
        print(f"   Cannot fast-forward, attempting merge...", file=sys.stderr)
        merge_result = subprocess.run(
            ['git', 'merge', 'origin/main', '--no-edit'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=60
        )

        if merge_result.returncode == 0:
            print(f"   Merged origin/main successfully", file=sys.stderr)
            if stashed:
                subprocess.run(
                    ['git', 'stash', 'pop'],
                    cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=30
                )
            record_sync_attempt(session_id, 'merged')
            return {'status': 'synced', 'method': 'merge'}

        # Merge conflict
        print(f"\n   MERGE CONFLICT - Claude will resolve this!", file=sys.stderr)

        conflict_result = subprocess.run(
            ['git', 'diff', '--name-only', '--diff-filter=U'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )
        conflicted_files = conflict_result.stdout.strip() if conflict_result.returncode == 0 else ''

        STATE_DIR.mkdir(parents=True, exist_ok=True)
        MERGE_CONFLICT_MARKER.write_text(json.dumps({
            'timestamp': datetime.now().isoformat(),
            'behind_count': commits_behind,
            'conflicted_files': conflicted_files.replace('\n', ' ').strip(),
            'stashed': stashed,
            'stash_name': stash_name or ''
        }, indent=2))

        record_sync_attempt(session_id, 'conflict')
        return {'status': 'conflict', 'files': conflicted_files}

    except Exception as e:
        print(f"   Sync failed: {e}", file=sys.stderr)
        record_sync_attempt(session_id, f'error: {e}')
        return {'status': 'error', 'error': str(e)}


def main():
    session_id = get_or_create_session_id()
    current_branch = get_current_branch()
    expected_branch = get_expected_branch()

    handoff = check_handoff_file()
    conflict = check_session_conflict(session_id, current_branch)
    drift = check_drift_from_main()

    result = {
        "session_id": session_id,
        "current_branch": current_branch,
        "expected_branch": expected_branch,
        "match": expected_branch is None or current_branch == expected_branch
    }

    if handoff:
        result["handoff"] = {
            "saved_at": handoff.get('saved_at'),
            "branch": handoff.get('branch'),
            "message": handoff.get('message')
        }

    # BLOCK on concurrent session
    if conflict:
        result["session_conflict"] = conflict
        if conflict['type'] == 'concurrent_session':
            error_msg = {
                "error": "CONCURRENT_SESSION_BLOCKED",
                "session_id": session_id,
                "current_branch": current_branch,
                "conflict": conflict,
                "message": "BLOCKED: Another Claude session is active on this worktree!",
                "details": {
                    "other_session": conflict.get('other_session'),
                    "other_branch": conflict.get('other_branch'),
                    "other_pid": conflict.get('other_pid')
                },
                "action_required": (
                    f"Options:\n"
                    f"  1. Use the other session's terminal\n"
                    f"  2. Kill it: kill {conflict.get('other_pid')}\n"
                    f"  3. Start a NEW worktree: ./scripts/claude-session.sh [branch-name]\n"
                    f"\nThis protects your work from branch switches by other sessions."
                )
            }
            print(json.dumps(error_msg, indent=2))
            sys.exit(1)

    # Auto-sync with main if behind
    if drift:
        commits_behind = drift.get('commits_behind', 0)
        sync_result = auto_sync_with_main(session_id, commits_behind)
        if sync_result:
            result["auto_sync"] = sync_result

    # Check branch mismatch
    if expected_branch and current_branch != expected_branch:
        error_msg = {
            "error": "BRANCH_MISMATCH",
            "session_id": session_id,
            "current_branch": current_branch,
            "expected_branch": expected_branch,
            "message": f"Expected branch '{expected_branch}' but currently on '{current_branch}'",
            "action_required": f"Either:\n1. Switch to expected branch: git checkout {expected_branch}\n2. Clear expected branch file: rm {EXPECTED_BRANCH_FILE}"
        }
        if conflict:
            error_msg["session_conflict"] = conflict
        if drift:
            error_msg["drift_warning"] = drift
        print(json.dumps(error_msg, indent=2))
        sys.exit(1)
    else:
        print(json.dumps(result, indent=2))
        sys.exit(0)


if __name__ == "__main__":
    main()
