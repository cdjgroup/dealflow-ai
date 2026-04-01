---
name: tdd-commit
description: AI-generated commit messages for TDD phase commits. Wraps tdd-commit.sh with intelligent message generation when no message is provided.
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "<red|green|refactor> [message]"
---

Commit the current staged changes as a TDD phase commit. The TDD phase and optional message are: $ARGUMENTS

## Workflow

### Step 1: Parse Arguments

Extract the TDD phase (`red`, `green`, or `refactor`) and optional commit message from the arguments.

- If no phase is provided, error: "Usage: /tdd-commit <red|green|refactor> [message]"
- Phase must be exactly `red`, `green`, or `refactor` (case-insensitive, normalize to lowercase)

### Step 2: Generate or Pass Message

**If a message is provided:** Pass it directly to the script in Step 3.

**If no message is provided:** Generate one:

1. Read the staged diff:
   ```bash
   git diff --cached --stat && git diff --cached
   ```

2. Read recent commit messages for style matching:
   ```bash
   git log --oneline -10
   ```

3. Generate a commit message following these rules:
   - **Subject line**: imperative mood, under 72 chars, describes WHAT changed
   - **Body** (if needed): 1-3 lines explaining WHY, separated by blank line
   - Match the style of recent commits in the repo
   - For `red` phase: focus on what behavior is being defined by the new tests
   - For `green` phase: focus on what capability was implemented to pass the tests
   - For `refactor` phase: focus on what structural improvement was made

4. Show the generated message to the user and ask for confirmation before proceeding.

### Step 3: Execute tdd-commit.sh

Run the TDD commit script with the phase and message:

```bash
./scripts/tdd-commit.sh <phase> "<message>"
```

The script handles:
- Test validation (GREEN/REFACTOR phases run tests before committing)
- Phase prefix tagging (e.g., `[RED]`, `[GREEN]`, `[REFACTOR]`)
- TDD_MODE enforcement if enabled
- Attribution line if configured in `config/framework.yaml`

**Do NOT bypass the script.** Do NOT run `git commit` directly. The script IS the commit mechanism.

### Step 4: Report Result

If the script succeeds, show the commit hash and message.
If the script fails (e.g., tests fail on GREEN phase), report the failure and suggest fixes.

## Key Rules

- This skill is a thin AI wrapper around `tdd-commit.sh`, NOT a reimplementation
- NEVER run `git commit` directly -- always delegate to the script
- NEVER skip test validation -- the script handles this
- If the user provides a message, pass it through without modification
- If generating a message, ALWAYS confirm with the user before committing
