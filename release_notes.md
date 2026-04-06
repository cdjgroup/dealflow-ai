# Release Notes — v0.6.7

## DealFlow AI: Approval Loop Fix + Action Center Polish

Fixed the infinite approval retry loop that caused write tools (Slack, Gmail, Calendar) to show 10-14 "Approved" badges before rate-limiting. Also fixed action badge count and reseed behavior.

### What's new

- **Approval loop fix**: Root cause was a hand-rolled `sendAutomaticallyWhen` that checked ALL message parts instead of just the last step. Replaced with the SDK's built-in `lastAssistantMessageIsCompleteWithApprovalResponses` (vercel/ai#9968, #7683). Added execute dedup wrapper and system prompt guard as defense-in-depth.
- **Write tool re-execution guard**: If the model re-proposes draftEmail, sendSlackMessage, or createCalendarEvent after it already succeeded (within the same `streamText` call), the execute wrapper returns "already completed" instead of sending again.
- **Rate limit headroom**: Write-tier tools 5→10/min, endpoint 10→20/min for multi-tool chat workflows.
- **Action badge fix**: Badge polled `?status=pending` but server counted all active actions. Now polls all actions and filters client-side (matching server logic).
- **Reseed improvements**: Clears old actions, resets autonomyLevel to 1 (Suggest Only), clears toolTrust overrides.
- **UI label changes**: "Autonomy Level" → "Actions Behavior" (larger font). Confidence Routing now shows "Overrides Actions Behavior at extremes" when enabled.
- **Insight #029 updated**: Full diagnosis of the three-layer approval loop bug (client-side sendAutomaticallyWhen + SDK message conversion + model re-proposal).

### Architecture

- `lastAssistantMessageIsCompleteWithApprovalResponses` imported from `ai` package — checks only last step via `step-start` boundaries
- `toolAlreadyExecuted()` scans SDK model-format messages (`context.messages`) for prior `tool-result` entries
- Write tool dedup wrapper applied as outermost layer (after rate limiter) — checks `context.messages` in execute
- Three known AI SDK bugs documented: #9968 (duplicate tool_use IDs), #7683 (sendAutomaticallyWhen + stopWhen conflict), #10980 (missing tool_result for Anthropic)

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai

---

# Release Notes — v0.6.6 (Previous)

## DealFlow AI: Per-Connection Autonomy + Permissions Consolidation

Autonomy and confidence routing controls move from the Actions page to the Permissions page, with per-connection granularity. Each integration (Google, Slack) gets its own autonomy level and confidence thresholds.

### What's new

- **Per-connection autonomy**: Google and Slack each get independent autonomy level (Suggest Only / Auto-Approve / Full Autonomous) and confidence routing thresholds. Global settings serve as defaults.
- **Permissions page consolidation**: Single control surface for both access (connection toggles, capability toggles, per-tool trust) and behavior (autonomy, confidence routing). Clear "Behavior" section label per integration card.
- **Summary + inline expand UI**: Apple iOS Settings pattern — compact summary row (mini zone bar + autonomy label) expands to full controls on click. Keeps cards scannable while providing full configurability.
- **Page width standardization**: All dashboard pages (Permissions, Actions, Audit, MCP) now use `max-w-4xl`, matching the landing page.
- **MCP Playground improvements**: Discovery errors now visible in Connection card; Playground moved to top of MCP page.
- **Trust nudge demo seeding**: "Reseed Demo Data" pre-loads 4/5 email approvals so the trust calibration nudge triggers on the next approve action.
- **Test fixes**: 10 pre-existing test failures fixed (MCP client headers mock, rate-limiter stale expectation). 715/715 tests passing.

### Architecture

- `ConnectionAutonomyConfig` type + `connectionAutonomy?: Record<string, ConnectionAutonomyConfig>` field on `UserSettings` (additive, backwards compatible)
- `resolveInitialStatus` resolves per-connection via `ACTION_TYPE_TO_CONNECTION` map (email/calendar → google, slack → slack), falls back to global defaults
- Post-merge size enforcement at data layer (max 5 connectionAutonomy entries)
- ADR 010: Per-Connection Autonomy with Global Fallback

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
