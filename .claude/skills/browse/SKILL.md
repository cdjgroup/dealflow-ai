---
name: browse
description: Visual page inspection using Playwright MCP browser. Navigates to a URL, takes a screenshot, checks console for errors, and reports findings.
allowed-tools: Bash, Read, Grep, Glob
argument-hint: "<url>"
---

Browse and inspect a web page visually. URL: $ARGUMENTS

## Steps

1. **Determine URL**:
   - If a URL argument was provided, use it directly
   - Otherwise, read `config/framework.yaml` for `qa.dev_url` (default: `http://localhost:3003`)

2. **Navigate to URL**:
   Use the Playwright MCP browser tools if available:
   - `mcp__playwright__browser_navigate` to load the page
   - Wait for the page to fully load

3. **Capture screenshot**:
   - `mcp__playwright__browser_take_screenshot` to capture the current viewport
   - Display the screenshot to the user

4. **Check for errors**:
   - `mcp__playwright__browser_console_messages` to check for JavaScript errors
   - Report any console errors or warnings

5. **Accessibility snapshot** (optional):
   - `mcp__playwright__browser_snapshot` to get the accessibility tree
   - Flag any obvious a11y issues (missing labels, broken ARIA)

6. **Report findings**:
   - Page title and URL
   - Screenshot (displayed)
   - Console errors (if any)
   - Accessibility issues (if any)
   - Overall assessment: PASS / WARN / FAIL

7. **Cleanup**:
   - `mcp__playwright__browser_close` to close the browser

> **Note**: The `/qa` skill should NOT delegate to `/browse`. Instead, `/qa` should inline its own Playwright calls directly so it can keep the browser open across multiple route inspections. `/browse` always closes the browser at the end, making it unsuitable for multi-route testing.

## Fallback (No Playwright MCP)

If Playwright MCP tools are not available:
1. Use `curl -s -o /dev/null -w "%{http_code}" <url>` to check HTTP status
2. Report HTTP status code
3. Suggest installing Playwright MCP for full visual inspection:
   ```
   Add to .claude/settings.json under mcpServers:
   "playwright": { "command": "npx", "args": ["@anthropic-ai/mcp-playwright"] }
   ```
