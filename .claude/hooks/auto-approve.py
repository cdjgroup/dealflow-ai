#!/usr/bin/env python3
"""
Claude Code PreToolUse Hook — Default (no project customization).

For projects that need custom patterns (worktree paths, project scripts, etc.),
replace this file with a project overlay that imports from auto_approve_base:

    import os
    from auto_approve_base import main
    main(
        extra_safe_rm_targets=[os.path.expanduser("~/worktrees/")],
        extra_script_patterns=["my-script\\.sh"],
        extra_git_worktree_pattern=r"my-project",
        extra_file_op_patterns=[r"/my-project"],
    )
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from auto_approve_base import main

if __name__ == "__main__":
    main()
