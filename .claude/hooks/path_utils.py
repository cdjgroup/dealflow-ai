"""
Dynamic path resolution and shared utilities for Claude hooks.

Works in both main repo and git worktree contexts.
This module provides portable path resolution so hooks don't need hardcoded paths,
plus shared git/session utilities that multiple hooks need.

Usage:
    from path_utils import (
        get_project_root, get_claude_dir, get_state_dir, detect_worktree, get_config,
        GIT_ENV, get_current_branch, read_session_lock, is_lock_stale,
        is_process_alive, STALE_TIMEOUT_SECONDS,
    )

    PROJECT_ROOT = get_project_root()
    CLAUDE_DIR = get_claude_dir()
    STATE_DIR = get_state_dir()
    repo = get_config("project.repo")  # reads config/framework.yaml
"""
import json
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path


def detect_worktree() -> bool:
    """
    Detect if we're running in a git worktree.

    In a worktree, .git is a FILE containing a gitdir pointer,
    not a directory like in the main repo.

    Returns:
        True if running in a worktree, False otherwise.
    """
    git_path = Path.cwd() / '.git'

    # If .git doesn't exist, we're not in a git repo at all
    if not git_path.exists():
        return False

    # If .git is a file, it's a worktree
    if git_path.is_file():
        content = git_path.read_text()
        return 'gitdir:' in content

    # .git is a directory = main repo
    return False


def get_project_root() -> Path:
    """
    Get project root by walking up from cwd to find .git.

    Works in both main repo (where .git is a directory) and
    worktree (where .git is a file) contexts.

    Returns:
        Path to project root, or cwd as fallback.
    """
    current = Path.cwd()

    # Walk up the directory tree looking for .git
    while current != current.parent:
        git_path = current / '.git'
        if git_path.exists():
            return current
        current = current.parent

    # Fallback to current working directory
    return Path.cwd()


def get_claude_dir() -> Path:
    """
    Get the .claude directory path.

    Returns:
        Path to {project_root}/.claude
    """
    return get_project_root() / '.claude'


def get_state_dir() -> Path:
    """
    Get the .claude/state directory path, creating it if it doesn't exist.

    Returns:
        Path to {project_root}/.claude/state
    """
    state_dir = get_claude_dir() / 'state'
    state_dir.mkdir(parents=True, exist_ok=True)
    return state_dir


# ── Config reader ────────────────────────────────────────────────────────────
# Two-tier parser: yaml.safe_load() if available, else line-by-line fallback.
# Hooks only read ~4 config values (all simple strings), so the fallback
# covers realistic usage even without PyYAML installed.

_config_cache: dict = {}


def _parse_config_yaml(config_path: Path) -> dict:
    """Parse config/framework.yaml using PyYAML."""
    import yaml  # type: ignore[import-untyped]
    with open(config_path) as f:
        return yaml.safe_load(f) or {}


def _parse_config_fallback(config_path: Path) -> dict:
    """Flat key-value fallback for environments without PyYAML.

    Handles indented YAML sections by tracking the current section name.
    Supports patterns like:
        project:
          repo: "myorg/my-project"
    Produces: {"project": {"repo": "myorg/my-project"}}
    """
    result: dict = {}
    current_section = ""
    for line in config_path.read_text().splitlines():
        stripped = line.strip()
        # Skip comments and blanks
        if not stripped or stripped.startswith('#'):
            continue
        # Top-level section (no leading whitespace, ends with colon, no value)
        if not line[0].isspace() and stripped.endswith(':') and ': ' not in stripped:
            current_section = stripped[:-1]
            result.setdefault(current_section, {})
            continue
        # Indented key: value pair
        if ': ' in stripped and current_section:
            key, _, value = stripped.partition(': ')
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            result[current_section][key] = value
    return result


def get_config(key: str, default: str = "") -> str:
    """Read a dotted-path value from config/framework.yaml. Never raises.

    Args:
        key: Dotted path like "project.repo" or "deployment.health_url"
        default: Value to return if key is missing or on any error

    Returns:
        The config value as a string, or default.
    """
    global _config_cache

    if not _config_cache:
        config_path = get_project_root() / 'config' / 'framework.yaml'
        if not config_path.exists():
            return default
        try:
            _config_cache = _parse_config_yaml(config_path)
        except Exception:
            try:
                _config_cache = _parse_config_fallback(config_path)
            except Exception:
                return default

    # Walk dotted path: "project.repo" -> config["project"]["repo"]
    try:
        node = _config_cache
        for part in key.split('.'):
            node = node[part]
        return str(node) if node is not None else default
    except (KeyError, TypeError, AttributeError):
        return default


# ── Git environment ──────────────────────────────────────────────────────────
# Shared GIT_DIR/GIT_WORK_TREE env dict for worktree-aware git commands.
# Hooks that shell out to git should pass env=GIT_ENV to subprocess.run().

def _build_git_env() -> dict:
    """Build git environment dict with GIT_DIR and GIT_WORK_TREE."""
    root = get_project_root()
    return {
        **os.environ,
        'GIT_DIR': str(root / '.git'),
        'GIT_WORK_TREE': str(root),
    }


GIT_ENV: dict = _build_git_env()


# ── Shared git helpers ───────────────────────────────────────────────────────

def get_current_branch() -> str:
    """Get the current git branch name.

    Returns:
        Branch name, or "UNKNOWN" on failure.
    """
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--abbrev-ref', 'HEAD'],
            capture_output=True, text=True,
            cwd=str(get_project_root()), env=GIT_ENV, timeout=5
        )
        if result.returncode == 0:
            return result.stdout.strip()
        return "UNKNOWN"
    except Exception:
        return "UNKNOWN"


# ── Session lock helpers ─────────────────────────────────────────────────────
# Multiple hooks need to read/check session locks. Centralised here to avoid
# duplicating JSON parsing and staleness logic across 4+ hooks.

STALE_TIMEOUT_SECONDS: int = 1800  # 30 minutes without heartbeat = stale


def read_session_lock() -> dict | None:
    """Read the session lock file if it exists.

    Returns:
        Parsed lock dict, or None if missing/corrupt.
    """
    lock_file = get_state_dir() / 'session-lock.json'
    try:
        if lock_file.exists():
            return json.loads(lock_file.read_text())
        return None
    except (json.JSONDecodeError, IOError) as e:
        print(f"[path_utils] WARNING: Could not read session lock: {e}", file=sys.stderr)
        return None


def is_lock_stale(lock_data: dict) -> bool:
    """Check if a session lock is stale (no heartbeat for > timeout).

    Args:
        lock_data: Parsed session lock dict with 'last_heartbeat' key.

    Returns:
        True if stale or unparseable, False if still fresh.
    """
    try:
        last_heartbeat = datetime.fromisoformat(lock_data['last_heartbeat'])
        age_seconds = (datetime.now() - last_heartbeat).total_seconds()
        return age_seconds > STALE_TIMEOUT_SECONDS
    except Exception:
        return True


def is_process_alive(pid) -> bool:
    """Check if a process with given PID is still running.

    Args:
        pid: Process ID to check (int or None).

    Returns:
        True if process exists and is running.
    """
    if pid is None:
        return False
    try:
        os.kill(pid, 0)
        return True
    except (OSError, TypeError):
        return False
