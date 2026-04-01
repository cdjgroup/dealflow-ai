#!/usr/bin/env python3
"""
Worktree Enforcer Hook - Warns when not running in an isolated worktree.

Runs on UserPromptSubmit and checks if we're in the main repo
or in an isolated worktree. For parallel development safety,
recommends using worktrees.
"""
import json
import os
import subprocess
import sys
from pathlib import Path

# Import worktree-aware path utilities
try:
    from path_utils import get_project_root, get_state_dir
    PROJECT_ROOT = get_project_root()
except ImportError:
    PROJECT_ROOT = Path.cwd()
    while PROJECT_ROOT != PROJECT_ROOT.parent:
        if (PROJECT_ROOT / '.git').exists():
            break
        PROJECT_ROOT = PROJECT_ROOT.parent

STATE_DIR = PROJECT_ROOT / '.claude' / 'state'
WORKTREE_WARNING_FILE = STATE_DIR / 'worktree-warning-shown.flag'
WORKTREE_WARNING_INTERVAL = 3600 * 4  # Warn every 4 hours


def get_current_worktree():
    """Get the current working directory's worktree path."""
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--show-toplevel'],
            capture_output=True, text=True, timeout=5,
            cwd=str(PROJECT_ROOT)
        )
        return result.stdout.strip() if result.returncode == 0 else None
    except Exception as e:
        print(f"[worktree-enforcer] WARNING: Could not detect worktree: {e}", file=sys.stderr)
        return None


def is_in_main_repo():
    """Check if we're in the main repo (not a worktree)."""
    current = get_current_worktree()
    return current == str(PROJECT_ROOT)


def should_show_warning():
    """Check if we should show the worktree warning (rate limited)."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    if not WORKTREE_WARNING_FILE.exists():
        return True
    try:
        import time
        mtime = WORKTREE_WARNING_FILE.stat().st_mtime
        age = time.time() - mtime
        return age > WORKTREE_WARNING_INTERVAL
    except Exception as e:
        print(f"[worktree-enforcer] WARNING: Could not check warning interval: {e}", file=sys.stderr)
        return True


def touch_warning_flag():
    """Update the warning flag to track last warning time."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        WORKTREE_WARNING_FILE.touch()
    except Exception as e:
        print(f"[worktree-enforcer] WARNING: Could not update warning flag: {e}", file=sys.stderr)


def check_for_other_sessions():
    """Check if there are other Claude sessions that might conflict."""
    lock_file = STATE_DIR / 'session-lock.json'
    if not lock_file.exists():
        return None
    try:
        from datetime import datetime
        lock_data = json.loads(lock_file.read_text())
        last_heartbeat = datetime.fromisoformat(lock_data.get('last_heartbeat', ''))
        age_seconds = (datetime.now() - last_heartbeat).total_seconds()

        # If heartbeat is recent (< 5 min), there might be another session
        if age_seconds < 300:
            current_pid = os.getpid()
            lock_pid = lock_data.get('pid')
            # Check if the other process is still running
            if lock_pid and lock_pid != current_pid:
                try:
                    os.kill(lock_pid, 0)
                    return lock_data
                except (OSError, ProcessLookupError):
                    pass
        return None
    except Exception as e:
        print(f"[worktree-enforcer] WARNING: Could not check for other sessions: {e}", file=sys.stderr)
        return None


def main():
    """Main hook logic."""
    try:
        hook_input = json.loads(sys.stdin.read())
    except Exception as e:
        print(f"[worktree-enforcer] WARNING: Could not parse hook input: {e}", file=sys.stderr)
        sys.exit(0)

    if hook_input.get('type') != 'user_prompt_submit':
        sys.exit(0)

    if is_in_main_repo():
        other_session = check_for_other_sessions()
        if other_session and should_show_warning():
            touch_warning_flag()
            print("\n" + "="*70, file=sys.stderr)
            print("PARALLEL SESSION DETECTED", file=sys.stderr)
            print("="*70, file=sys.stderr)
            print(f"Another Claude session may be active:", file=sys.stderr)
            print(f"   Branch: {other_session.get('branch', 'unknown')}", file=sys.stderr)
            print(f"   PID: {other_session.get('pid', 'unknown')}", file=sys.stderr)
            print("", file=sys.stderr)
            print("For parallel work, use isolated worktrees:", file=sys.stderr)
            print("   ./scripts/claude-session.sh feature/my-feature", file=sys.stderr)
            print("="*70 + "\n", file=sys.stderr)

    sys.exit(0)


if __name__ == '__main__':
    main()
