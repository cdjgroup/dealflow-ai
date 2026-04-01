#!/usr/bin/env python3
"""
Claude Code PreToolUse Hook to prevent directory escape.

This hook runs BEFORE Bash tool execution and BLOCKS commands
that would change directory to an absolute path outside the project.
Relative cd commands (cd src/, cd ..) are allowed.

Decision logic:
- "cd /absolute/path" outside project root -> DENY
- "cd relative/path" -> ALLOW
- "cd" with no args -> ALLOW
- Non-cd commands -> ALLOW (pass through)

Exit codes:
  0 = Always (decision communicated via JSON output)

Usage:
  Register in .claude/settings.local.json:
  {
    "hooks": {
      "PreToolUse": [
        {
          "command": "python3 .claude/hooks/no-cd-commands.py",
          "matcher": "Bash"
        }
      ]
    }
  }
"""
import json
import os
import re
import sys


def get_project_root() -> str:
    """Detect project root by walking up from this script's location."""
    current = os.path.dirname(os.path.abspath(__file__))
    while current != "/":
        if os.path.exists(os.path.join(current, "config", "framework.yaml")):
            return current
        current = os.path.dirname(current)
    # Fallback: two levels up from .claude/hooks/
    return os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


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

    # Find cd commands with absolute paths
    # Matches: cd /path, cd "/path", cd '/path'
    # Also matches chained: something && cd /path
    cd_matches = re.findall(r'\bcd\s+["\']?(/[^\s"\';&|]+)', command)

    if not cd_matches:
        # No absolute cd found, allow
        sys.exit(0)

    project_root = get_project_root()

    for target_path in cd_matches:
        # Resolve the path
        resolved = os.path.realpath(target_path)

        # Check if it's within the project root
        if not resolved.startswith(project_root):
            # Block: trying to cd outside the project
            print(json.dumps({
                "decision": "deny",
                "reason": (
                    f"Blocked: 'cd {target_path}' would leave the project root "
                    f"({project_root}). Use relative paths or work within the project."
                )
            }))
            sys.exit(0)

    # All cd targets are within project root, allow
    sys.exit(0)


if __name__ == "__main__":
    main()
