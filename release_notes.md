# Release Notes — v0.6.8

## DealFlow AI: Trust Filter Fix + Approval Reliability

Aligned the system prompt with the trust-filtered tool set so "Never allow" takes effect instantly, made approved-tool execution server-side to work around the unfixed vercel/ai#10980 SDK bug, and extended the context-aware `needsApproval` wrapper to every tool (not just writes).

### What's new

- **System prompt trust alignment**: The system prompt now derives available-tool descriptions from the trust-filtered tool set instead of raw capability toggles. When a user sets a tool to "Never allow", the LLM immediately knows the capability is unavailable instead of wasting turns probing for it. Covers all CRM tools, Calendar, Gmail, Slack, delegation, and pipeline analysis.
- **Server-side approved tool execution**: Workaround for the still-open [vercel/ai#10980](https://github.com/vercel/ai/issues/10980) (PR [#12914](https://github.com/vercel/ai/pull/12914) open not merged). `executeApprovedAndPatchDenied` now runs server-side — it processes all `approval-responded` parts in messages, executes approved tools directly, and injects results as `output-available`. The model sees completed tool results without depending on client-side SDK behavior.
- **Universal approval dedup**: All tools (not just write tools) get the context-aware `needsApproval` wrapper. If a tool already has a result in `context.messages`, the wrapper returns `false` to prevent re-approval cards when the model re-proposes an already-executed tool.

### Architecture

- `buildSystemPrompt` now consumes the same `filterTools()` output the streamText call uses, so the two never drift.
- `executeApprovedAndPatchDenied` runs before `streamText` (three-layer defense with `attachApprovalChecks` + server-side dedup) — mirrors the structural fix in vercel/ai#12914.
- `needsApproval` wrapper reads `context.messages` looking for prior `tool-result` entries matching the current `toolCallId`.

### Known upstream issues acknowledged this release

- [vercel/ai#10980](https://github.com/vercel/ai/issues/10980) — OPEN. The server-side execute workaround is our current mitigation.
- [vercel/ai#12914](https://github.com/vercel/ai/pull/12914) — fix PR, OPEN not merged.
- [auth0-ai-js#175](https://github.com/auth0/auth0-ai-js/issues/175) — OPEN. Motivates direct Auth0 `/oauth/token` exchange (ADR 001).

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai

---

# Release Notes — v0.6.7 (Previous)

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
