#!/usr/bin/env python3
"""
Hook: merge-conflict-resolver.py
Trigger: UserPromptSubmit
Purpose: Detect merge conflicts and prompt Claude to resolve them

Runs on every user prompt and checks if there's an active git merge
with unresolved conflicts. If so, outputs instructions for Claude.
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
MERGE_CONFLICT_MARKER = STATE_DIR / 'merge-conflict.json'

GIT_ENV = {
    **os.environ,
    'GIT_DIR': str(PROJECT_ROOT / '.git'),
    'GIT_WORK_TREE': str(PROJECT_ROOT)
}


def get_git_dir():
    """Get the actual git directory, resolving worktree symlinks."""
    git_path = PROJECT_ROOT / '.git'
    if git_path.is_file():
        try:
            content = git_path.read_text().strip()
            if content.startswith('gitdir: '):
                return Path(content[8:])
        except (IOError, OSError) as e:
            print(f"[merge-conflict] WARNING: Could not read .git file: {e}", file=sys.stderr)
    return git_path


def is_merge_in_progress():
    """Check if there's an active merge."""
    git_dir = get_git_dir()
    return (git_dir / 'MERGE_HEAD').exists()


def get_conflicted_files():
    """Get list of files with merge conflicts."""
    try:
        result = subprocess.run(
            ['git', 'diff', '--name-only', '--diff-filter=U'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )
        if result.returncode == 0:
            return [f.strip() for f in result.stdout.strip().split('\n') if f.strip()]
        return []
    except Exception as e:
        print(f"[merge-conflict] WARNING: Could not get conflicted files: {e}", file=sys.stderr)
        return []


def read_merge_marker():
    """Read the merge conflict marker file."""
    try:
        if MERGE_CONFLICT_MARKER.exists():
            return json.loads(MERGE_CONFLICT_MARKER.read_text())
        return None
    except (json.JSONDecodeError, IOError) as e:
        print(f"[merge-conflict] WARNING: Could not read merge marker: {e}", file=sys.stderr)
        return None


def remove_merge_marker():
    """Remove the merge conflict marker file."""
    try:
        if MERGE_CONFLICT_MARKER.exists():
            MERGE_CONFLICT_MARKER.unlink()
    except Exception as e:
        print(f"[merge-conflict] WARNING: Could not remove merge marker: {e}", file=sys.stderr)


def main():
    if not is_merge_in_progress():
        remove_merge_marker()
        sys.exit(0)

    conflicted_files = get_conflicted_files()

    if not conflicted_files:
        marker = read_merge_marker()
        if marker:
            print("\n" + "=" * 60)
            print("INFO: Merge in progress (no conflicts)")
            print("=" * 60)
            print("\nThe merge from origin/main has been resolved.")
            print("Please complete the merge:")
            print("  1. git merge --continue")
            if marker.get('stashed'):
                print("  2. git stash pop  # Restore stashed changes")
            print("\n" + "=" * 60 + "\n")
        sys.exit(0)

    marker = read_merge_marker()
    behind_count = marker.get('behind_count', '?') if marker else '?'
    stashed = marker.get('stashed', False) if marker else False

    print("\n" + "=" * 60)
    print("MERGE CONFLICT - CLAUDE ACTION REQUIRED")
    print("=" * 60)
    print(f"\nDuring auto-sync, a merge from origin/main was attempted")
    print(f"but there are {len(conflicted_files)} file(s) with conflicts:")
    print("")
    for f in conflicted_files:
        print(f"  - {f}")

    print("\n" + "-" * 60)
    print("INSTRUCTIONS FOR CLAUDE:")
    print("-" * 60)
    print("""
1. READ each conflicted file using the Read tool
   - Look for conflict markers: <<<<<<<, =======, >>>>>>>

2. RESOLVE conflicts using the Edit tool
   - Keep the appropriate code (usually both if they don't conflict)
   - Remove ALL conflict markers

3. STAGE resolved files:
   git add <file1> <file2> ...

4. COMPLETE the merge:
   git merge --continue""")

    if stashed:
        print("""
5. RESTORE stashed changes:
   git stash pop""")

    print("\n" + "=" * 60)
    print("Note: This is AUTO-SYNC pulling in production changes.")
    print("Your local changes should be preserved.")
    print("=" * 60 + "\n")

    # Structured output for downstream parsing
    print(json.dumps({
        "merge_conflict": True,
        "conflicted_files": conflicted_files,
        "behind_count": behind_count,
        "stashed": stashed
    }))

    sys.exit(0)


if __name__ == '__main__':
    main()
