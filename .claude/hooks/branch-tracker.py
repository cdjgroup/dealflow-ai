#!/usr/bin/env python3
"""
Branch Tracker Hook - Runs after git checkout/switch commands.

Automatically updates the expected branch file when Claude switches branches.
Ensures the branch-check.py hook knows which branch is "expected".

Usage: Added to settings.local.json as PostToolUse hook for Bash commands
       containing "git checkout" or "git switch"
"""

import subprocess
import sys
import os
import json
import uuid
from datetime import datetime
from pathlib import Path

# Import worktree-aware path utilities
try:
    from path_utils import get_project_root, get_state_dir, GIT_ENV, get_current_branch
    PROJECT_ROOT = get_project_root()
except ImportError:
    PROJECT_ROOT = Path.cwd()
    while PROJECT_ROOT != PROJECT_ROOT.parent:
        if (PROJECT_ROOT / '.git').exists():
            break
        PROJECT_ROOT = PROJECT_ROOT.parent

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
            return result.stdout.strip() if result.returncode == 0 else None
        except Exception:
            return None

STATE_DIR = PROJECT_ROOT / '.claude' / 'state'
EXPECTED_BRANCH_FILE = PROJECT_ROOT / '.claude' / 'expected-branch.txt'
SESSION_LOCK_FILE = STATE_DIR / 'session-lock.json'


def get_or_create_session_id():
    """Get session ID from environment or generate new one."""
    session_id = os.environ.get('CLAUDE_SESSION_ID')
    if not session_id:
        session_id = str(uuid.uuid4())[:8]
    return session_id


def write_expected_branch(branch):
    """Write the expected branch to file."""
    try:
        EXPECTED_BRANCH_FILE.parent.mkdir(parents=True, exist_ok=True)
        EXPECTED_BRANCH_FILE.write_text(branch)
        return True
    except Exception as e:
        print(f"Warning: Could not write expected branch file: {e}", file=sys.stderr)
        return False


def update_session_lock(session_id, branch):
    """Update the session lock file with new branch."""
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        if SESSION_LOCK_FILE.exists():
            lock = json.loads(SESSION_LOCK_FILE.read_text())
            lock['branch'] = branch
            lock['last_heartbeat'] = datetime.now().isoformat()
        else:
            lock = {
                'session_id': session_id,
                'pid': os.getpid(),
                'branch': branch,
                'started_at': datetime.now().isoformat(),
                'last_heartbeat': datetime.now().isoformat()
            }
        SESSION_LOCK_FILE.write_text(json.dumps(lock, indent=2))
        return True
    except Exception as e:
        print(f"Warning: Could not update session lock: {e}", file=sys.stderr)
        return False


def main():
    try:
        input_data = json.loads(sys.stdin.read())
    except (json.JSONDecodeError, Exception) as e:
        print(f"[branch-tracker] WARNING: Could not parse hook input: {e}", file=sys.stderr)
        sys.exit(0)

    tool_name = input_data.get('tool_name', '')
    tool_input = input_data.get('tool_input', {})

    if tool_name == 'Bash':
        command = tool_input.get('command', '')
        is_checkout = 'git checkout' in command or 'git switch' in command

        if is_checkout:
            current_branch = get_current_branch()
            if current_branch:
                session_id = get_or_create_session_id()
                branch_updated = write_expected_branch(current_branch)
                lock_updated = update_session_lock(session_id, current_branch)

                result = {
                    "action": "branch_switch_tracked",
                    "session_id": session_id,
                    "branch": current_branch,
                    "expected_branch_updated": branch_updated,
                    "session_lock_updated": lock_updated,
                    "message": f"Expected branch set to '{current_branch}'"
                }
                print(json.dumps(result))

    sys.exit(0)


if __name__ == "__main__":
    main()
