#!/usr/bin/env python3
"""
PreCompact Hook - Saves branch state BEFORE context compaction.

Fires when Claude's context is about to be compacted (summarized).
Saves critical state to disk so the next session can restore context.

Key Problem Solved:
- Context compaction loses Claude's in-memory knowledge of which branch it's on
- This hook persists that state to disk before memory is cleared
- The branch-check.py hook can then restore this context on the next prompt

Enhanced state includes:
- Task context (branch type, PR title, recent commits)
- Diff statistics (insertions/deletions across branch)
- Active plan reference (most recent ~/.claude/plans/ file)
- Session metadata from stdin (session_id, transcript_path, trigger)

Usage: Added to settings.local.json as PreCompact hook
"""

import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

# Import worktree-aware path utilities
try:
    from path_utils import get_project_root, get_state_dir, get_config, GIT_ENV, get_current_branch
    PROJECT_ROOT = get_project_root()
except ImportError:
    PROJECT_ROOT = Path.cwd()
    while PROJECT_ROOT != PROJECT_ROOT.parent:
        if (PROJECT_ROOT / '.git').exists():
            break
        PROJECT_ROOT = PROJECT_ROOT.parent

    def get_config(key, default=""):
        return default

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
            return result.stdout.strip() if result.returncode == 0 else 'UNKNOWN'
        except Exception:
            return 'UNKNOWN'

STATE_DIR = PROJECT_ROOT / '.claude' / 'state'
HANDOFF_FILE = STATE_DIR / 'pre-compact-handoff.json'


def get_uncommitted_files():
    """Get list of uncommitted files (max 10 for brevity)."""
    try:
        result = subprocess.run(
            ['git', 'status', '--porcelain'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().split('\n')[:10]
        return []
    except (subprocess.SubprocessError, OSError) as e:
        print(f"[pre-compact] WARNING: Could not get uncommitted files: {e}", file=sys.stderr)
        return []


def get_current_commit():
    """Get the current commit SHA (short)."""
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--short', 'HEAD'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )
        return result.stdout.strip() if result.returncode == 0 else 'UNKNOWN'
    except Exception as e:
        print(f"[pre-compact] WARNING: Could not get current commit: {e}", file=sys.stderr)
        return 'UNKNOWN'


def get_task_context(branch):
    """Parse branch name for context and fetch PR title if available."""
    context = {
        'branch_type': 'unknown',
        'branch_description': branch,
        'pr_title': None,
        'recent_commits': []
    }
    try:
        # Parse branch name (e.g., "feature/add-widget" -> type="feature", desc="add-widget")
        if '/' in branch:
            parts = branch.split('/', 1)
            context['branch_type'] = parts[0]
            context['branch_description'] = parts[1]

        # Try to get PR title — uses project.repo from config, skips if unconfigured
        repo = get_config("project.repo")
        if repo:
            cmd = ['gh', 'pr', 'view', '--repo', repo,
                   '--json', 'title', '--jq', '.title']
            result = subprocess.run(
                cmd, capture_output=True, text=True,
                cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
            )
            if result.returncode == 0 and result.stdout.strip():
                context['pr_title'] = result.stdout.strip()

        # Get recent commits on this branch
        result = subprocess.run(
            ['git', 'log', 'main..HEAD', '--oneline', '--max-count=10'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            context['recent_commits'] = result.stdout.strip().split('\n')
    except Exception as e:
        print(f"[pre-compact] WARNING: Could not get task context: {e}", file=sys.stderr)
    return context


def get_diff_stats():
    """Get diff statistics for full branch changes and unstaged work."""
    stats = {
        'total_insertions': 0,
        'total_deletions': 0,
        'files': {}
    }
    try:
        # Full branch diff against main
        result = subprocess.run(
            ['git', 'diff', '--numstat', 'main...HEAD'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            for line in result.stdout.strip().split('\n'):
                parts = line.split('\t')
                if len(parts) == 3:
                    try:
                        ins = int(parts[0]) if parts[0] != '-' else 0
                        dels = int(parts[1]) if parts[1] != '-' else 0
                        stats['files'][parts[2]] = {'+': ins, '-': dels}
                        stats['total_insertions'] += ins
                        stats['total_deletions'] += dels
                    except ValueError:
                        continue

        # Also check unstaged changes
        result = subprocess.run(
            ['git', 'diff', '--numstat', 'HEAD'],
            capture_output=True, text=True,
            cwd=str(PROJECT_ROOT), env=GIT_ENV, timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            for line in result.stdout.strip().split('\n'):
                parts = line.split('\t')
                if len(parts) == 3:
                    try:
                        ins = int(parts[0]) if parts[0] != '-' else 0
                        dels = int(parts[1]) if parts[1] != '-' else 0
                        if parts[2] not in stats['files']:
                            stats['files'][parts[2]] = {'+': ins, '-': dels}
                            stats['total_insertions'] += ins
                            stats['total_deletions'] += dels
                    except ValueError:
                        continue
    except Exception as e:
        print(f"[pre-compact] WARNING: Could not get diff stats: {e}", file=sys.stderr)
    return stats


def get_active_plan():
    """Find the most recently modified plan file."""
    plan_info = {
        'filename': None,
        'path': None
    }
    try:
        plans_dir = Path.home() / '.claude' / 'plans'
        if plans_dir.exists():
            plan_files = sorted(plans_dir.glob('*.md'), key=lambda p: p.stat().st_mtime, reverse=True)
            if plan_files:
                plan_info['filename'] = plan_files[0].name
                plan_info['path'] = str(plan_files[0])
    except Exception as e:
        print(f"[pre-compact] WARNING: Could not get active plan: {e}", file=sys.stderr)
    return plan_info


def main():
    """Save pre-compaction state to disk."""
    # Read PreCompact input from Claude Code (JSON on stdin)
    stdin_data = {}
    try:
        import select
        if select.select([sys.stdin], [], [], 0.1)[0]:
            stdin_text = sys.stdin.read()
            if stdin_text.strip():
                stdin_data = json.loads(stdin_text)
    except json.JSONDecodeError as e:
        print(f"[pre-compact] WARNING: Malformed stdin JSON: {e}", file=sys.stderr)
    except (IOError, OSError):
        pass  # stdin not available (manual run)

    session_id = stdin_data.get('session_id', 'unknown')
    transcript_path = stdin_data.get('transcript_path')
    trigger = stdin_data.get('trigger', 'unknown')
    custom_instructions = stdin_data.get('custom_instructions')

    # Ensure state directory exists
    STATE_DIR.mkdir(parents=True, exist_ok=True)

    # Gather current state
    current_branch = get_current_branch()
    current_commit = get_current_commit()
    uncommitted_files = get_uncommitted_files()
    task_context = get_task_context(current_branch)
    diff_stats = get_diff_stats()
    active_plan = get_active_plan()

    # Build enhanced message
    parts = [f'Context compacted on \'{current_branch}\'']
    if task_context.get('pr_title'):
        parts.append(f'(PR: \'{task_context["pr_title"]}\')')
    file_count = len(diff_stats['files']) or len(uncommitted_files)
    if file_count:
        parts.append(f'. {file_count} files changed (+{diff_stats["total_insertions"]}/-{diff_stats["total_deletions"]})')
    if active_plan.get('filename'):
        parts.append(f'. Plan: {active_plan["filename"]}')
    message = ' '.join(parts) + '.'

    handoff = {
        'saved_at': datetime.now().isoformat(),
        'reason': 'context_compaction',
        'session_id': session_id,
        'transcript_path': transcript_path,
        'trigger': trigger,
        'custom_instructions': custom_instructions,
        'branch': current_branch,
        'commit': current_commit,
        'uncommitted_files': uncommitted_files,
        'uncommitted_count': len(uncommitted_files),
        'task_context': task_context,
        'diff_stats': diff_stats,
        'active_plan': active_plan,
        'message': message,
        'action_required': 'Verify branch and review plan before continuing.'
    }

    # Write handoff file
    try:
        HANDOFF_FILE.write_text(json.dumps(handoff, indent=2))
        print(json.dumps({
            'status': 'success',
            'action': 'pre_compact_state_saved',
            'branch': current_branch,
            'commit': current_commit,
            'uncommitted_files': len(uncommitted_files),
            'task_context': bool(task_context.get('pr_title')),
            'diff_stats': bool(diff_stats['files']),
            'active_plan': bool(active_plan.get('filename'))
        }))
    except Exception as e:
        print(json.dumps({
            'status': 'error',
            'error': str(e)
        }), file=sys.stderr)

    # Always exit 0 - don't block compaction
    sys.exit(0)


if __name__ == '__main__':
    main()
