# Release Notes — v0.6.6

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
