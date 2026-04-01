# Anti-Patterns -- MANDATORY

> These rules prevent the most common and costly mistakes in AI-assisted development.

## 1. NEVER Present Assumptions as Facts
- ALWAYS read the source file, config, or log BEFORE making a claim
- If you haven't verified it, say "I believe..." or "I need to check..."
- **Applies to**: CI/CD configs, API contracts, database schemas, environment variables, auth flows, deployment configs

## 2. NEVER Skip Verification Steps to Save Time
- Do not guess selectors, column names, or env var values
- 30 seconds of verification prevents 30 minutes of wrong-direction work
- **Applies to**: Schema changes, test fixes, deployment, environment config, API integration

## 3. NEVER Guess API Contracts or Response Shapes
- Read the actual endpoint code, or call it and inspect the response
- Do not assume response format, error shape, or auth headers
- **Applies to**: Backend routes, third-party APIs, RPC calls, SSE events

## 4. NEVER Assume Dev Environment = CI/Production Environment
- Ports, NODE_ENV, env vars, and build modes differ across environments
- Read `.github/workflows/` and deployment configs for the actual environment
- **Applies to**: Port numbers, API URLs, feature flags, env vars, build modes, auth flows

## 5. NEVER Use waitForTimeout() or Arbitrary Delays
- Use event-driven waits: `toBeVisible()`, `toBeEnabled()`, `waitForResponse()`, async assertions
- Timeouts hide race conditions
- **Applies to**: E2E tests, integration tests, async operations

## 6. NEVER Use CSS Class Selectors in Tests
- Playwright hierarchy: `getByRole()` > `getByText()` > `data-testid` > CSS
- Class selectors break on styling changes and couple to framework internals

## 7. NEVER Write Tests for Features That Do Not Exist Yet
- Tests must be GREEN or explicitly skipped with `test.skip()` and a tracking issue
- RED tests belong in feature branches, not main

## 8. NEVER Modify Production Data Without Confirmation
- All external interactions must be mocked in tests, confirmed in deployments
- No migrations against production without approval. No hitting production APIs in test runs.

## 9. NEVER Commit Debugging Artifacts
- No `console.log()`/`print()` in committed code. No `.env` files or credentials.
- No commented-out code "for reference." Clean up before commit.

## 10. NEVER Increase Scope Without Asking
- Do exactly what was asked. If scope expansion seems valuable, ASK FIRST.
- No drive-by refactors, no surprise dependency upgrades, no unrequested error handling.

## Enforcement
- Every claim must trace to a source file, log line, or config
- "I don't know yet, let me check" is ALWAYS better than a confident wrong answer
