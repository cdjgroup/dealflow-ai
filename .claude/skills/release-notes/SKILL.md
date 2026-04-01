---
name: release-notes
description: Generate release notes and insight entry from git diff. Use after completing a feature branch and before creating a PR.
allowed-tools: Bash, Read, Grep, Glob, Write, Edit
argument-hint: "<insight_number> <title>"
---

Generate release notes and insight entry. Arguments: $ARGUMENTS

## Steps

1. **Get the current branch diff against main**:
   Run `git diff main...HEAD --stat` and `git log main..HEAD --oneline` to understand all changes.

2. **Read the changed files** to understand what was done (focus on non-test source files).

3. **Generate release_notes.md entry**:
   - Read current `release_notes.md` to match format
   - Add a new entry at the top with: version placeholder, title, bullet points of changes, insight reference

4. **Generate docs/70-INSIGHTS.md entry**:
   - Read current `docs/70-INSIGHTS.md` to match format
   - Add a new insight entry with the format:
     ```
     ### Insight #N: Title (vX.Y.Z)
     **Date**: YYYY-MM-DD
     **Context**: What situation prompted this decision
     **Root Cause**: The underlying issue (if applicable)
     **Key Insight**: The decision and why
     **Files Changed**: List of key files modified
     ```

5. **Update CLAUDE.md version description**:
   - Update the "Current Version" line with the new title
   - Update the "Last Deploy" line with today's date

6. **Present the changes** for user review before writing.

## Format Rules
- Keep release notes concise (3-7 bullet points)
- Insight entries should explain WHY not just WHAT
- Use the insight number and title from arguments
