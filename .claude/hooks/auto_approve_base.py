#!/usr/bin/env python3
"""
Claude Code PreToolUse Hook — Base Safety Gate

Universal safety logic for auto-approving safe commands and blocking dangerous ones.
Projects extend this by importing main() and passing project-specific patterns.

Usage (default — no project customization):
    if __name__ == "__main__":
        main()

Usage (project overlay — adds project-specific patterns):
    from auto_approve_base import main
    main(
        extra_safe_rm_targets=[os.path.expanduser("~/worktrees/")],
        extra_script_patterns=["manage_servers\\.sh", "deploy-railway\\.sh"],
        extra_file_op_patterns=[r"/my-project"],
        extra_git_worktree_pattern=r"my-project",
        extra_env_prefixes=["MY_VAR"],
    )

Exit codes:
  0 = Continue (with optional approval JSON)
  2 = Block the command
"""
import json
import re
import shlex
import sys
from pathlib import Path

# Fire-and-forget metrics logging
try:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent / "scripts"))
    from fw_event_log import append_event as _log_event
except Exception:
    def _log_event(*a, **kw): pass  # no-op fallback


def approve(reason: str) -> None:
    """Return JSON to auto-approve the command."""
    _log_event("approve", "safety", {"reason": reason}, hook="auto_approve_base")
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": reason
        }
    }))
    sys.exit(0)


def block(reason: str) -> None:
    """Block the command (exit code 2)."""
    _log_event("block", "safety", {"reason": reason}, hook="auto_approve_base")
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason
        }
    }), file=sys.stderr)
    sys.exit(2)


def _approve_if_matches(cmds: set, pattern: str, reason: str) -> None:
    """Approve if any command variant matches the regex pattern."""
    for cmd in cmds:
        if re.match(pattern, cmd):
            approve(reason)


def main(
    *,
    extra_safe_rm_targets: list = None,
    extra_dangerous_rm_targets: list = None,
    extra_script_patterns: list = None,
    extra_git_worktree_pattern: str = None,
    extra_file_op_patterns: list = None,
    extra_env_prefixes: list = None,
) -> None:
    """Main hook entry point with extension points for project customization.

    Args:
        extra_safe_rm_targets: Additional paths safe for recursive rm (e.g., worktree base)
        extra_dangerous_rm_targets: Additional paths to block for recursive rm
        extra_script_patterns: Additional root-level scripts to auto-approve
        extra_git_worktree_pattern: Regex fragment for project-specific GIT_DIR matching
        extra_file_op_patterns: Additional path patterns for safe file operations
        extra_env_prefixes: Additional environment variable prefixes to auto-approve
    """
    if extra_safe_rm_targets is None:
        extra_safe_rm_targets = []
    if extra_dangerous_rm_targets is None:
        extra_dangerous_rm_targets = []
    if extra_script_patterns is None:
        extra_script_patterns = []
    if extra_file_op_patterns is None:
        extra_file_op_patterns = []
    if extra_env_prefixes is None:
        extra_env_prefixes = []

    try:
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"[auto-approve] WARNING: Could not parse hook input: {e}", file=sys.stderr)
        sys.exit(0)

    tool_name = input_data.get("tool_name", "")
    tool_input = input_data.get("tool_input", {})

    # ============================================================
    # BASH COMMANDS
    # ============================================================
    if tool_name == "Bash":
        command = tool_input.get("command", "")

        # ----- STRIP SUBSHELL PARENS -----
        inner_command = re.sub(r"^\(\s*", "", command)

        # ----- STRIP cd PREFIX -----
        effective_command = re.sub(r"^cd\s+\S+\s*&&\s*", "", inner_command)

        # ----- STRIP ENV VAR PREFIXES -----
        # "NODE_ENV=test npx -y pkg" -> "npx -y pkg" so per-tool guards apply
        effective_command = re.sub(r"^(\w+=\S+\s+)+", "", effective_command)

        # ----- DANGEROUS COMMANDS - CHECK FIRST -----
        is_recursive_rm = re.search(r"rm\s+(-[a-zA-Z]*r|--recursive)", command)
        if is_recursive_rm:
            safe_prefixes = ["/tmp/", "/var/tmp/", "/private/tmp/"]
            safe_prefixes.extend(extra_safe_rm_targets)

            dangerous_targets = [
                r"rm -rf /[^a-zA-Z.]", r"rm -rf /$", r"rm -rf ~/",
                r"rm -rf backend", r"rm -rf frontend",
                r"rm -rf docs", r"rm -rf .git", r"rm -rf ../",
            ]
            dangerous_targets.extend(extra_dangerous_rm_targets)
            target_is_dangerous = any(re.search(p, command) for p in dangerous_targets)

            # Parse actual path targets from the command (skip flags)
            # Validates each target starts with a safe prefix and has no path traversal
            target_is_safe = False
            try:
                tokens = shlex.split(command)
                path_args = [t for t in tokens[1:] if not t.startswith("-")]
                if path_args:
                    target_is_safe = all(
                        any(t.startswith(prefix) for prefix in safe_prefixes)
                        and ".." not in t
                        for t in path_args
                    )
            except ValueError as e:
                print(f"[auto-approve] WARNING: Could not parse command (shlex): {e}", file=sys.stderr)

            if target_is_safe and not target_is_dangerous:
                approve("Recursive removal of safe path")
            elif target_is_dangerous:
                block("BLOCKED: Recursive removal of project/system paths requires manual execution.")
            else:
                block("BLOCKED: Recursive removal requires manual review.")

        # git push --force, -f, or --force-with-lease
        if re.search(r"git\s+push\s+.*(-f\b|--force\b|--force-with-lease)", command):
            block("BLOCKED: Force push is prohibited. Use normal push or create a PR.")

        # sudo commands
        if re.match(r"^sudo\s", command):
            sys.exit(0)

        # SQL destructive commands (comment-aware normalization)
        normalized = re.sub(r'--[^\n]*', ' ', command)
        normalized = re.sub(r'/\*.*?\*/', ' ', normalized, flags=re.DOTALL)

        if re.search(r"DROP\s+(TABLE|DATABASE|SCHEMA)", normalized, re.IGNORECASE):
            block("BLOCKED: DROP operations require manual DBA execution.")
        if re.search(r"TRUNCATE", normalized, re.IGNORECASE):
            block("BLOCKED: TRUNCATE requires manual DBA execution.")
        if re.search(r"DELETE\s+FROM", normalized, re.IGNORECASE):
            if not re.search(r"DELETE\s+FROM\s+\S+\s+WHERE", normalized, re.IGNORECASE):
                block("BLOCKED: DELETE without WHERE clause is prohibited.")
            sys.exit(0)

        # ----- REQUIRE APPROVAL FOR DESTRUCTIVE GIT COMMANDS -----
        merge_match = re.search(r"git\s+merge\s+(\S+)", command)
        if merge_match and merge_match.group(1) != "--abort":
            sys.exit(0)

        if re.search(r"git\s+rebase", command):
            sys.exit(0)

        if re.search(r"git\s+reset\s+--hard", command):
            block("BLOCKED: git reset --hard is prohibited. Use git stash or git checkout <file>.")

        if re.search(r"git\s+branch\b.*(\s+-[a-zA-Z]*[dD]|\s+--delete\b)", command):
            block("BLOCKED: Branch deletion requires explicit user approval outside Claude.")

        if re.search(r"git\s+push\s+.*--delete", command):
            block("BLOCKED: Remote branch deletion requires explicit user approval outside Claude.")

        if re.search(r"gh\s+pr\s+merge\s+.*--delete-branch", command):
            block("BLOCKED: --delete-branch flag is prohibited per project policy.")

        if re.search(r"gh\s+pr\s+merge\b", command):
            sys.exit(0)

        # ----- BLOCK COMMIT/PUSH FROM AUTO-APPROVAL -----
        if re.search(r"git\s+(commit|push)", command):
            sys.exit(0)

        # ----- COMPOUND COMMAND GUARD -----
        # If the command contains shell operators that can hide destructive
        # actions (redirection, subshells, backticks), never auto-approve.
        # This is the primary defense against bypass-via-composition.
        has_shell_operators = re.search(
            r'[^-]>{1,2}\s'    # output redirection (but not --flag>)
            r'|>{1,2}/'        # redirect to absolute path (>/.., >/tmp)
            r'|>\S'            # no-space redirection (echo payload>file)
            r'|^>'             # command starting with redirect (> /tmp/file)
            r'|\d+>'           # fd redirection (2>, 1>)
            r'|`[^`]+`'        # backtick command substitution
            r'|\$\([^)]+\)'    # $() command substitution
            r'|\|'             # pipe (prevents cat X | curl exfil)
            r'|;\s*\S',        # semicolon chaining (ls; rm -rf /)
            command
        )
        # Also check for writes to safety-critical paths via any mechanism
        writes_to_hooks = re.search(
            r'\.claude/hooks/'
            r'|\.claude/rules/',
            command
        ) and re.search(r'>{1,2}|\btee\b|\bcp\b|\bmv\b', command)

        skip_auto_approve = has_shell_operators or writes_to_hooks

        # ----- APPROVAL CHECKS -----
        cmds_to_check = {command, inner_command, effective_command}

        # If compound command guard triggered, skip all auto-approvals
        # and fall through to user prompt for manual review
        if skip_auto_approve:
            sys.exit(0)

        # ----- GIT COMMANDS (all variants) -----
        for cmd in cmds_to_check:
            if extra_git_worktree_pattern:
                if re.match(
                    rf"^GIT_DIR=.*{extra_git_worktree_pattern}.*GIT_WORK_TREE=.*{extra_git_worktree_pattern}.*\s*(/usr/bin/)?(git|gh)\s",
                    cmd
                ):
                    approve("Git/gh command with worktree env vars")
            else:
                if re.match(r"^GIT_DIR=.*GIT_WORK_TREE=.*\s*(/usr/bin/)?(git|gh)\s", cmd):
                    approve("Git/gh command with worktree env vars")
            if re.match(r"^GIT_DIR=\.git\s+GIT_WORK_TREE=\.\s+(git|gh)\s", cmd):
                approve("Git/gh command with relative worktree env vars")
            if re.match(r"^(/usr/bin/|/opt/homebrew/bin/)?(git|gh)\s", cmd):
                approve("Git/gh command")

        # ----- SECRETS FILE ACCESS VIA SHELL (fall through to prompt) -----
        secrets_pattern = r"\.(env|pem|key|secret|credentials)"
        for cmd in cmds_to_check:
            if re.match(r"^(cat|head|tail|less|more)\s", cmd):
                if re.search(secrets_pattern, cmd, re.IGNORECASE):
                    sys.exit(0)

        # ----- READ-ONLY COMMANDS -----
        # NOTE: echo/printf removed — they write via shell redirection.
        # NOTE: find removed — it has -delete and -exec flags.
        readonly_commands = (
            "ls", "pwd", "cat", "head", "tail", "less", "more",
            "grep", "egrep", "fgrep", "rg", "ag",
            "locate", "which", "whereis",
            "tree", "file", "stat", "du", "df",
            "wc", "sort", "uniq", "diff", "cmp", "comm",
            "date", "whoami", "hostname",
            "ps", "top", "htop", "free", "uptime", "lsof"
        )
        _approve_if_matches(cmds_to_check,
                            rf"^({'|'.join(readonly_commands)})(\s|$)",
                            "Read-only command")

        # ----- ECHO/PRINTF (safe only without redirection) -----
        _approve_if_matches(cmds_to_check,
                            r"^(echo|printf)(\s|$)",
                            "Echo/printf (no redirection)")

        # ----- FIND (safe only without destructive flags) -----
        for cmd in cmds_to_check:
            if re.match(r"^find\s", cmd):
                if re.search(r'-delete|-exec|-execdir|-ok\b', cmd):
                    sys.exit(0)  # Fall through for destructive find
                approve("Find command (read-only)")

        # ----- PYTHON/VENV COMMANDS -----
        # Block inline code execution via -c flag (can run arbitrary code)
        for cmd in cmds_to_check:
            if re.match(r"^(python3?|node)\s+(-c|--command|-e|--eval)\s", cmd):
                sys.exit(0)  # Fall through — inline code needs user review
        _approve_if_matches(cmds_to_check,
                            r"^(PYTHONPATH=.*\s+)?\.?/?venv/bin/(python|pytest|pip|bandit)",
                            "Python venv command")
        _approve_if_matches(cmds_to_check, r"^\./venv/bin/", "Venv command")
        _approve_if_matches(cmds_to_check,
                            r"^(python3?|pytest|pip3?|bandit)(\s|$)",
                            "Python command")
        _approve_if_matches(cmds_to_check,
                            r"^/\S*/(python3?|pytest)(\s|$)",
                            "Python command (absolute path)")

        # ----- ENVIRONMENT VARIABLE PREFIXES -----
        env_prefixes = [
            "PYTHONPATH", "QASE_MODE", "QASE_ENABLED",
            "PLAYWRIGHT_SKIP_WEBSERVER", "PLAYWRIGHT_BASE_URL",
            "TEST_EMAIL", "TEST_PASSWORD",
            "TOKEN", "NODE_ENV",
        ]
        env_prefixes.extend(extra_env_prefixes)
        _approve_if_matches(cmds_to_check,
                            rf"^({'|'.join(env_prefixes)})=",
                            "Environment variable prefixed command")

        # ----- NPM/NODE COMMANDS -----
        for cmd in cmds_to_check:
            if re.match(r"^npx\s+(-y|--yes)\s", cmd):
                sys.exit(0)  # Fall through — auto-install needs review
        _approve_if_matches(cmds_to_check,
                            r"^(npm|npx|node|yarn|pnpm|bun)\s",
                            "Node.js command")

        # ----- PROJECT SCRIPTS -----
        # Reject path traversal (scripts/../evil.sh)
        script_pattern = r"^(\./)?scripts/(?!\.\\.)"
        if extra_script_patterns:
            combined = "|".join(extra_script_patterns)
            script_pattern = rf"^(\./)?(?:scripts/(?!\.\\.)|{combined})"
        for cmd in cmds_to_check:
            if re.match(r"^(\./)?scripts/", cmd) and ".." in cmd:
                sys.exit(0)  # Fall through — path traversal
        _approve_if_matches(cmds_to_check, script_pattern, "Project script")

        bash_script_pattern = r"^bash\s+(\./)?scripts/"
        if extra_script_patterns:
            combined = "|".join(extra_script_patterns)
            bash_script_pattern = rf"^bash\s+(\./)?(?:scripts/|{combined})"
        for cmd in cmds_to_check:
            if re.match(r"^bash\s+(\./)?scripts/", cmd) and ".." in cmd:
                sys.exit(0)  # Fall through — path traversal
        _approve_if_matches(cmds_to_check, bash_script_pattern, "Project script (via bash)")

        # ----- CURL/WGET (API TESTING) -----
        for cmd in cmds_to_check:
            if re.match(r"^curl\s", cmd):
                if re.search(
                    r'\s(-[dFT]\b|-X\s*(POST|PUT|PATCH|DELETE)'
                    r'|--data\b|--form\b|--upload-file\b'
                    r'|-o\b|-O\b|--output\b|--remote-name\b)', cmd
                ):
                    sys.exit(0)  # Fall through — not a simple GET
                approve("HTTP GET request (curl)")
            if re.match(r"^wget\s", cmd):
                if re.search(r'\s(-O\b|--output-document\b|--post-data\b)', cmd):
                    sys.exit(0)  # Fall through — writes or POSTs
                approve("HTTP GET request (wget)")

        # ----- DOCKER COMMANDS -----
        for cmd in cmds_to_check:
            if re.match(r"^docker\s+run\b", cmd):
                if re.search(r'\s(-v\b|--volume\b|--privileged\b|--cap-add\b)', cmd):
                    sys.exit(0)  # Fall through — filesystem escape risk
        _approve_if_matches(cmds_to_check,
                            r"^docker(\s+compose)?\s",
                            "Docker command")

        # ----- MAKE/BUILD COMMANDS -----
        for cmd in cmds_to_check:
            if re.match(r"^go\s+run\s", cmd):
                sys.exit(0)  # Fall through — arbitrary code execution
            if re.match(r"^make\s+(-f|--file)\s", cmd):
                sys.exit(0)  # Fall through — arbitrary makefile
        _approve_if_matches(cmds_to_check,
                            r"^(make|cmake|cargo|go)\s",
                            "Build command")

        # ----- SAFE FILE REMOVAL (non-recursive) -----
        sensitive_rm_targets = (
            r"\.(env|pem|key|secret|credentials)",
            r"auto.approve", r"auto_approve",  # Safety gate self-deletion
            r"\.claude/hooks/", r"\.claude/rules/",
        )
        for cmd in cmds_to_check:
            rm_match = re.match(r"^rm\s+((-[a-zA-Z]+\s+)*)", cmd)
            if rm_match and not re.search(r"-[a-zA-Z]*r", rm_match.group(1)):
                if any(re.search(p, cmd) for p in sensitive_rm_targets):
                    sys.exit(0)  # Fall through to user prompt for sensitive files
                approve("Non-recursive file removal")

        # ----- CD COMMANDS -----
        _approve_if_matches(cmds_to_check, r"^cd\s", "Directory navigation")

        # ----- PROJECT-SPECIFIC FILE OPERATIONS -----
        for pattern in extra_file_op_patterns:
            _approve_if_matches(cmds_to_check,
                                rf"^(mkdir|touch|cp|mv)\s.*{pattern}",
                                "File operation in project directory")

        # ----- TEMP DIRECTORY OPERATIONS -----
        _approve_if_matches(cmds_to_check,
                            r"^(mkdir|cp|mv)\s+.*(/tmp/|/var/tmp/)",
                            "Temp directory operation")

    # ============================================================
    # WEBFETCH - Always approve (read-only)
    # ============================================================
    if tool_name == "WebFetch":
        approve("WebFetch is read-only")

    # ============================================================
    # WEBSEARCH - Always approve (read-only)
    # ============================================================
    if tool_name == "WebSearch":
        approve("WebSearch is read-only")

    # ============================================================
    # READ - Approve except secrets files
    # ============================================================
    if tool_name == "Read":
        file_path = tool_input.get("file_path", "")

        if re.search(r"\.(env|pem|key|secret|credentials)", file_path, re.IGNORECASE):
            sys.exit(0)

        if re.search(r"/(\.ssh|\.gnupg|\.aws)/", file_path):
            sys.exit(0)

        approve("File read (not secrets)")

    # ============================================================
    # GREP - Always approve (read-only)
    # ============================================================
    if tool_name == "Grep":
        approve("Grep is read-only")

    # ============================================================
    # GLOB - Always approve (read-only)
    # ============================================================
    if tool_name == "Glob":
        approve("Glob is read-only")

    # ============================================================
    # Default: Fall through to normal permission flow
    # ============================================================
    sys.exit(0)


if __name__ == "__main__":
    main()
