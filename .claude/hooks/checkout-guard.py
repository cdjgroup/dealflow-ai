#!/usr/bin/env python3
"""
checkout-guard.py - PreToolUse hook to prevent branch switches during active sessions

This hook intercepts git checkout/switch commands and blocks them if another
Claude session is active on the same worktree. This prevents the #1 cause of
lost work: another session switching branches mid-session.

Hook Type: PreToolUse (runs BEFORE command execution)
Exit Codes:
  0 = Allow command to proceed
  2 = Block command (shows reason to user)

Prevents branch switches when another Claude session is active on the same worktree.
"""

import json
import os
import sys
from pathlib import Path
from datetime import datetime, timedelta

# Import worktree-aware path utilities
try:
    from path_utils import get_project_root, read_session_lock, is_lock_stale, is_process_alive
    PROJECT_ROOT = get_project_root()
except ImportError:
    # Fallback to cwd-based detection
    PROJECT_ROOT = Path.cwd()
    while PROJECT_ROOT != PROJECT_ROOT.parent:
        if (PROJECT_ROOT / '.git').exists():
            break
        PROJECT_ROOT = PROJECT_ROOT.parent

    def read_session_lock():
        lock_file = PROJECT_ROOT / '.claude' / 'state' / 'session-lock.json'
        if not lock_file.exists():
            return None
        try:
            return json.loads(lock_file.read_text())
        except (json.JSONDecodeError, IOError):
            return None

    def is_lock_stale(lock):
        if not lock or 'last_heartbeat' not in lock:
            return True
        try:
            heartbeat = datetime.fromisoformat(lock['last_heartbeat'])
            return datetime.now() - heartbeat > timedelta(minutes=30)
        except (ValueError, TypeError):
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
SESSION_LOCK_FILE = STATE_DIR / 'session-lock.json'


def get_my_session_id():
    """Get current session ID from environment or generate one based on PID."""
    return os.environ.get('CLAUDE_SESSION_ID', f"session-{os.getpid()}")


def is_checkout_command(command):
    """Check if command is a git checkout/switch that changes branches.

    We want to block:
    - git checkout <branch>
    - git checkout -b <branch>
    - git switch <branch>
    - git switch -c <branch>

    We should NOT block:
    - git checkout -- <file>  (file restore, not branch switch)
    - git checkout HEAD -- <file>
    """
    if not command:
        return False

    cmd_lower = command.lower().strip()

    # Must start with git
    if not cmd_lower.startswith('git '):
        return False

    # Check for checkout/switch commands
    checkout_patterns = [
        'git checkout ',
        'git switch ',
    ]

    if not any(cmd_lower.startswith(p) for p in checkout_patterns):
        return False

    # Exclude file-only operations (git checkout -- <file>)
    # These restore files, not switch branches
    if ' -- ' in command and 'checkout' in cmd_lower:
        # Check if it's "git checkout -- file" (no branch before --)
        parts = command.split(' -- ')
        if len(parts) >= 2:
            before_dashdash = parts[0].strip()
            # "git checkout -- file" or "git checkout HEAD -- file"
            if before_dashdash in ['git checkout', 'git checkout HEAD']:
                return False

    return True


def main():
    # Read hook input from stdin (JSON format from Claude)
    try:
        hook_input = json.loads(sys.stdin.read())
    except json.JSONDecodeError:
        sys.exit(0)  # Allow if can't parse

    tool_name = hook_input.get('tool_name', '')
    tool_input = hook_input.get('tool_input', {})

    # Only check Bash commands
    if tool_name != 'Bash':
        sys.exit(0)

    command = tool_input.get('command', '')

    # Only check checkout/switch commands
    if not is_checkout_command(command):
        sys.exit(0)

    # Check session lock
    lock = read_session_lock()
    my_session_id = get_my_session_id()

    if not lock:
        # No lock exists, allow
        sys.exit(0)

    lock_session_id = lock.get('session_id')
    lock_pid = lock.get('pid')
    lock_branch = lock.get('branch', 'unknown')

    # Same session owns the lock, allow
    if lock_session_id == my_session_id:
        sys.exit(0)

    # Different session - check if it's actually alive
    if is_lock_stale(lock) or not is_process_alive(lock_pid):
        # Lock is stale or process dead, allow (the checkout is fine)
        sys.exit(0)

    # Active session detected - BLOCK the checkout
    result = {
        "decision": "block",
        "reason": (
            f"🛑 BLOCKED: Cannot switch branches - another Claude session is active!\n\n"
            f"   Session ID: {lock_session_id}\n"
            f"   Branch: {lock_branch}\n"
            f"   PID: {lock_pid}\n\n"
            f"Switching branches would corrupt that session's work.\n\n"
            f"Options:\n"
            f"  1. Use that session's terminal instead\n"
            f"  2. Kill it: kill {lock_pid}\n"
            f"  3. Start a NEW worktree: ./scripts/claude-session.sh [branch-name]"
        )
    }
    print(json.dumps(result))
    sys.exit(2)  # Exit code 2 = block command


if __name__ == "__main__":
    main()
