#!/usr/bin/env python3
"""
Claude Code PostToolUse Hook for deployment protocol enforcement.

This hook runs AFTER Bash tool execution and:
- WARNS on deployment-related actions (push to main, deploy scripts)
- BLOCKS PR creation when documentation is stale (release_notes.md,
  CHANGELOG.md not updated for the current version)

Trigger points:
- git push to main/master -> Remind about health check
- gh pr create -> Check doc staleness (BLOCK if stale), remind about approval
- deploy scripts -> Remind about waiting and health check

Exit codes:
  0 = Pass (warning issued but not blocking)
  2 = Block (doc staleness check failed — update docs before creating PR)

Usage:
  Register in .claude/settings.json:
  {
    "hooks": {
      "PostToolUse": [
        {"command": "python3 .claude/hooks/protocol-validator.py"}
      ]
    }
  }
"""
import json
import os
import re
import sys
from pathlib import Path

# Fire-and-forget metrics logging
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))
    from fw_event_log import append_event as _log_event
except Exception:
    def _log_event(*a, **kw): pass  # no-op fallback

# Import config reader for project-specific deploy script detection
try:
    from path_utils import get_config, get_project_root
except ImportError:
    def get_config(key, default=""):
        return default

    def get_project_root():
        current = os.path.abspath(os.getcwd())
        while True:
            if os.path.exists(os.path.join(current, "CLAUDE.md")):
                return current
            parent = os.path.dirname(current)
            if parent == current:
                return os.getcwd()
            current = parent


def warn(message: str, *, trigger: str = "unknown") -> None:
    """Output warning to stderr (visible to Claude)."""
    _log_event("warn", "protocol", {"trigger": trigger, "message": message[:200]},
               hook="protocol_validator")
    separator = "=" * 60
    print(f"\n{separator}", file=sys.stderr)
    print(message, file=sys.stderr)
    print(f"{separator}\n", file=sys.stderr)


def block(message: str, *, trigger: str = "unknown") -> None:
    """Output blocking message to stderr and exit with code 2."""
    _log_event("block", "protocol", {"trigger": trigger, "message": message[:200]},
               hook="protocol_validator")
    separator = "!" * 60
    print(f"\n{separator}", file=sys.stderr)
    print(f"BLOCKED: {message}", file=sys.stderr)
    print(f"{separator}\n", file=sys.stderr)
    sys.exit(2)


def get_version_from_claude_md(project_root: str) -> str:
    """Extract current version from CLAUDE.md '## Current Version:' line."""
    claude_md = os.path.join(project_root, "CLAUDE.md")
    if not os.path.exists(claude_md):
        return ""
    try:
        with open(claude_md) as f:
            for line in f:
                match = re.match(r"## Current Version:\s*(\S+)", line)
                if match:
                    return match.group(1)
    except OSError:
        pass
    return ""


def check_file_has_version(filepath: str, version: str) -> bool:
    """Check if a file contains a reference to the given version."""
    if not os.path.exists(filepath):
        return False
    try:
        with open(filepath) as f:
            content = f.read()
        # Match version in common patterns: ## vX.Y.Z, ## [X.Y.Z], v0.7.0, etc.
        escaped = re.escape(version)
        return bool(re.search(rf"(?:v?{escaped}|\[{escaped}\])", content))
    except OSError:
        return False


def check_doc_staleness(project_root: str) -> str | None:
    """Check if docs are stale. Returns error message if stale, None if OK."""
    # Gate: skip if doc_staleness_check is disabled
    if get_config("hooks.doc_staleness_check") == "false":
        return None

    version = get_version_from_claude_md(project_root)
    if not version:
        return None  # Can't determine version — skip check

    missing = []

    release_notes = os.path.join(project_root, "release_notes.md")
    if not check_file_has_version(release_notes, version):
        missing.append(f"  - release_notes.md (no entry for v{version})")

    changelog = os.path.join(project_root, "CHANGELOG.md")
    if not check_file_has_version(changelog, version):
        missing.append(f"  - CHANGELOG.md (no entry for v{version})")

    if missing:
        return (
            "DOCUMENTATION IS STALE\n\n"
            f"CLAUDE.md declares version {version}, but these docs are not updated:\n"
            + "\n".join(missing) + "\n\n"
            "Update documentation BEFORE creating a PR:\n"
            "  1. Update release_notes.md with PR description\n"
            "  2. Update CHANGELOG.md with Keep a Changelog entry\n"
            "  3. Update docs/60-FEATURES.md if new features added\n"
            "  4. Add insight to docs/70-INSIGHTS.md if applicable\n\n"
            "See: CLAUDE.md deployment checklist"
        )

    return None


def main() -> None:
    # Read input from stdin
    try:
        input_text = sys.stdin.read()
        if not input_text.strip():
            sys.exit(0)
        input_data = json.loads(input_text)
    except (json.JSONDecodeError, ValueError):
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    # Only process Bash commands
    if tool_name != "Bash":
        sys.exit(0)

    command = tool_input.get("command", "")
    if not command:
        sys.exit(0)

    # Check: git push to main/master
    if re.search(r"git\s+push\b.*\b(main|master)\b", command):
        warn(
            "DEPLOYMENT REMINDER\n\n"
            "You just pushed to main. Did you:\n"
            "  1. Wait for CI to pass?\n"
            "  2. Verify health endpoint after deploy?\n"
            "  3. Check the health endpoint returns correct version?\n\n"
            "See: docs/20-DEPLOYMENT.md for full protocol",
            trigger="push-main",
        )

    # Check: PR creation — doc staleness gate + approval reminder
    if "gh pr create" in command:
        project_root = get_project_root()
        staleness_error = check_doc_staleness(project_root)
        if staleness_error:
            block(staleness_error, trigger="pr-create-doc-stale")

        warn(
            "STOP - USER APPROVAL REQUIRED\n\n"
            "You just created a PR. Before merging:\n"
            "  1. Wait for user to review and explicitly approve\n"
            "  2. Do NOT merge without explicit 'yes' from user\n"
            "  3. Check CI status on the PR\n\n"
            "See: CLAUDE.md deployment checklist",
            trigger="pr-create",
        )

    # Check: Deploy scripts — project-specific or generic fallback pattern
    deploy_script = get_config("deployment.deploy_script")
    is_deploy = False
    if deploy_script and deploy_script in command:
        is_deploy = True
    elif re.search(r"deploy|deployment-gate", command) and "scripts/" in command:
        is_deploy = True

    if is_deploy:
        warn(
            "DEPLOYMENT IN PROGRESS\n\n"
            "A deployment script was executed. Remember:\n"
            "  1. Wait for deployment to complete\n"
            "  2. Verify health endpoint\n"
            "  3. Monitor for errors\n\n"
            "See: docs/20-DEPLOYMENT.md",
            trigger="deploy-script",
        )

    sys.exit(0)


if __name__ == "__main__":
    main()
