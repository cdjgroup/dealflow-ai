---
name: retro
description: Engineering retrospective from git history. Analyzes commit patterns, file hotspots, TDD phase ratios, session durations, and PR metrics over a time window.
allowed-tools: Bash, Read, Grep, Glob, Write
argument-hint: "[7d|14d|30d] [--since YYYY-MM-DD]"
---

Generate an engineering retrospective report. Arguments: $ARGUMENTS

## Configuration

Read from `config/framework.yaml`:
- `retro.default_window`: default time window (e.g., "7d")
- `retro.storage_dir`: where to save reports (default: ".context/retros")
- `retro.track_tdd_phases`: whether to analyze TDD commit prefixes

## Steps

### Step 1: Determine Time Window

Parse arguments:
- `7d`, `14d`, `30d` -> use as `--since` for git log
- `--since YYYY-MM-DD` -> use exact date
- No argument -> use `retro.default_window` from config (default: 7d)

### Step 2: Gather Git Metrics

Run these commands to collect data:

```bash
# Commit volume
git log --since="<window>" --oneline | wc -l

# Commits by author
git log --since="<window>" --format='%aN' | sort | uniq -c | sort -rn

# File hotspots (most-changed files)
git log --since="<window>" --name-only --pretty=format: | sort | uniq -c | sort -rn | head -15

# Lines added/removed (uses numstat for accurate totals across all commits)
git log --since="<window>" --numstat --pretty=format: | awk 'NF==3 {ins+=$1; del+=$2} END {printf "+%d -%d\n", ins, del}'

# Commit frequency by day
git log --since="<window>" --format='%ad' --date=format:'%Y-%m-%d' | sort | uniq -c

# Commit frequency by hour (work pattern)
git log --since="<window>" --format='%ad' --date=format:'%H' | sort | uniq -c | sort -k2
```

### Step 3: TDD Phase Analysis (if enabled)

If `retro.track_tdd_phases: true`, analyze commits with TDD prefixes:

```bash
# Count TDD phase commits (from tdd-commit.sh format)
git log --since="<window>" --oneline | grep -c "^[a-f0-9]* tdd(red):" || echo 0
git log --since="<window>" --oneline | grep -c "^[a-f0-9]* tdd(green):" || echo 0
git log --since="<window>" --oneline | grep -c "^[a-f0-9]* tdd(refactor):" || echo 0
```

Calculate ratios: RED:GREEN:REFACTOR. Ideal is roughly 1:1:0.5.

### Step 4: Coding Session Detection

Identify coding sessions using a 45-minute gap heuristic:

```bash
# Get commit timestamps
git log --since="<window>" --format='%at' | sort -n
```

Group commits where gaps < 45 minutes into sessions. Report:
- Number of sessions
- Average session duration
- Longest session
- Most productive session (by commit count)

### Step 5: PR Metrics (if gh available)

```bash
# Recent merged PRs
gh pr list --state merged --limit 20 --json number,title,createdAt,mergedAt,additions,deletions

# Time to merge (createdAt -> mergedAt delta)
# Review turnaround
```

### Step 6: Compare to Previous Retro

Check for previous retro files in the storage directory:

```bash
ls -t <storage_dir>/retro-*.md | head -1
```

If a previous retro exists, calculate week-over-week deltas:
- Commit volume change (e.g., +15% or -8%)
- File hotspot changes (new hotspots, cooled-down areas)
- TDD ratio trend
- Session pattern changes

### Step 7: Generate Report

Write to `<storage_dir>/retro-YYYY-MM-DD.md`:

```markdown
# Engineering Retrospective
**Period**: YYYY-MM-DD to YYYY-MM-DD (Xd window)
**Generated**: YYYY-MM-DD

## Summary
- Total commits: N
- Lines added: +N / removed: -N
- Coding sessions: N (avg Xh Xm)
- PRs merged: N

## Commit Activity
| Day | Commits |
|-----|---------|
| Mon | 12 |
| Tue | 8 |
...

## File Hotspots
| File | Changes | Notes |
|------|---------|-------|
| src/components/Dashboard.tsx | 15 | Consider refactoring |
...

## TDD Health
- RED: N commits (X%)
- GREEN: N commits (X%)
- REFACTOR: N commits (X%)
- Ratio: 1:X:X (target: 1:1:0.5)

## Session Patterns
- Sessions: N
- Avg duration: Xh Xm
- Longest: Xh Xm (date)
- Peak hours: HH:00-HH:00

## Week-over-Week
| Metric | Previous | Current | Delta |
|--------|----------|---------|-------|
| Commits | N | N | +X% |
...

## Observations
- [Auto-generated insights based on data patterns]
```

### Step 8: Display Summary

Show a condensed version of the report to the user with key highlights and any concerning trends.
