---
name: qa
description: Diff-aware visual QA testing. Identifies changed UI routes from git diff and runs visual inspection on each affected page.
allowed-tools: Bash, Read, Grep, Glob, Write, Edit
argument-hint: "[url] [--full]"
---

Run diff-aware visual QA testing. Arguments: $ARGUMENTS

## Steps

### Step 1: Identify Changed Files

```bash
git diff main...HEAD --name-only
```

If `--full` flag is passed, skip diffing and test ALL configured routes.

### Step 2: Map Changed Files to Routes

Use these conventions to determine which routes are affected:

| File Pattern | Likely Route |
|---|---|
| `src/app/<path>/page.tsx` (Next.js App Router) | `/<path>` |
| `src/pages/<path>.tsx` (Next.js Pages Router) | `/<path>` |
| `src/components/<name>` | Check which pages import this component |
| `src/views/<name>` | `/<name>` |
| `backend/` changes only | No UI routes affected (skip visual QA) |

Also check `config/framework.yaml` for `qa.route_map` overrides:
```yaml
qa:
  route_map:
    "src/components/Dashboard": ["/dashboard", "/dashboard/analytics"]
    "src/components/Settings": ["/settings"]
```

### Step 3: Visual Inspection per Route

For each affected route:

1. **Read base URL** from `qa.dev_url` in `config/framework.yaml` (default: `http://localhost:3003`)
   - If a URL argument was provided, use it instead
2. **Navigate** to the route using Playwright MCP browser tools (or curl fallback)
3. **Screenshot** the page
4. **Console check** for JavaScript errors
5. **Accessibility snapshot** for a11y issues

### Step 4: Generate Report

Write a report to the QA reports directory (read `qa.report_dir` from config, default `.qa-reports/`):

**File**: `<report_dir>/qa-<date>-<short-hash>.md`

**Format**:
```markdown
# Visual QA Report
**Date**: YYYY-MM-DD HH:MM
**Commit**: <short hash>
**Changed Files**: N files
**Routes Tested**: N routes

## Results

### /route-name
- Status: PASS | WARN | FAIL
- Console Errors: none | list
- A11y Issues: none | list
- Notes: any observations

## Summary
- Routes Passed: X/Y
- Console Errors: N total
- A11y Issues: N total
```

### Step 5: Report to User

Display a summary table:

| Route | Status | Console | A11y |
|-------|--------|---------|------|
| /dashboard | PASS | 0 errors | 0 issues |
| /settings | WARN | 1 warning | 2 issues |

## Fallback (No Playwright MCP)

If Playwright MCP tools are not available:
1. Use `curl` to verify HTTP 200 for each route
2. Report HTTP status codes
3. Note that full visual inspection requires Playwright MCP
