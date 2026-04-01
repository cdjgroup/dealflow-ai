---
name: ship
description: One-command workflow to create a branch, commit, push, and open a PR. Handles branch creation, staging, committing, pushing with upstream tracking, generating release notes, and creating a PR via gh CLI.
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "[branch-name]"
---

Ship the current changes to a pull request. Optional branch name: $ARGUMENTS

## Workflow

### Step 1: Check Current Branch

```bash
git branch --show-current
```

- If on `main` or `master`: a new branch is required (see Step 2)
- If on a feature branch: skip to Step 3

### Step 2: Create Branch (if on main/master)

**If a branch name was provided as argument:** Confirm with user: "Create branch `<name>` from main?"
**If no branch name provided:** Suggest a descriptive name based on staged/unstaged changes, then ASK the user to confirm.

WAIT for explicit user confirmation before creating the branch.

```bash
git checkout -b <branch-name>
```

### Step 3: Stage and Commit

1. Check for unstaged changes:
   ```bash
   git status --short
   ```

2. If there are unstaged changes, show them and ask the user what to stage.

3. If there are staged changes, generate a commit message:
   - Read `git diff --cached` and `git log --oneline -10`
   - Generate subject + body matching repo commit style
   - Show the message and ASK for confirmation before committing

4. Commit via the appropriate mechanism:
   - If `./scripts/tdd-commit.sh` exists and user is in a TDD workflow, use it
   - Otherwise, use `git commit` directly

### Step 4: Push with Upstream Tracking

```bash
git push -u origin <branch-name>
```

- NEVER force push (`--force`, `--force-with-lease`)
- If push fails due to remote changes, suggest `git pull --rebase` first

### Step 5: Generate Release Notes

Run the `/release-notes` skill to generate PR description content from the git diff.

If the skill is not available, generate a summary manually:
1. `git log main..<branch> --oneline` for commit list
2. `git diff main...<branch> --stat` for files changed
3. Format as a PR body with Summary and Test Plan sections

### Step 6: Create Pull Request

Write the PR body to a temp file, then create the PR:

```bash
# Write body to temp file (worktree-safe, avoids heredoc bug)
cat > /tmp/pr-body.md << 'PREOF'
<generated PR body>
PREOF

# Create PR using --body-file (NOT --body)
gh pr create --title "<PR title>" --body-file /tmp/pr-body.md

# Clean up
rm -f /tmp/pr-body.md
```

**Worktree note:** Always use `--body-file` instead of `--body` with heredoc. In git worktrees, `gh pr create --body "$(cat <<'EOF'...)"` silently fails. If in a worktree, also add `--repo <org/repo>` flag (read from `config/framework.yaml` `project.repo`).

Show the PR URL to the user when complete.

## Safety Rules

- **NEVER** force push
- **NEVER** merge the PR (user approval required)
- **NEVER** delete branches
- **NEVER** push to main/master directly
- **ALWAYS** confirm branch name with user before creation
- **ALWAYS** confirm commit message with user before committing
- **ALWAYS** use `--body-file` for PR creation (worktree compatibility)
