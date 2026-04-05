# Release Notes — v0.6.0

## DealFlow AI: MCP Write Tools with CIBA Consent

External AI agents can now execute write operations (email, calendar, Slack) through the Model Context Protocol endpoint, with device-level consent enforced via Auth0 Guardian push notifications.

### What's new

- **MCP write tools**: draftEmail, createCalendarEvent, sendSlackMessage now exposed via `/api/mcp`
- **CIBA gating**: All write operations require Guardian push approval before execution
- **Synchronous blocking**: MCP handler blocks up to 50s while polling for phone approval; returns error on timeout/denial
- **Binding messages**: Tool-specific messages on Guardian push (e.g., "MCP: draft email to alice@acme.com", "MCP: calendar \"Pipeline Review\"")
- **Capability enforcement**: MCP respects per-user permission toggles from `/dashboard/permissions`
- **Stored refresh tokens**: All MCP Token Vault tools (read + write) use stored refresh tokens from schedule opt-in
- **New module**: `src/lib/mcp/ciba-gate.ts` handles CIBA initiation and polling for MCP context
- **New function**: `shouldRequireCibaMcp()` determines CIBA requirement for MCP write tools

### Security

- Device-level consent required for all MCP write operations (Guardian push)
- Capability toggles enforced — disabled tools return error, not available to external agents
- Connection-disabled check before CIBA initiation (no unnecessary push notifications)
- HTTP response status validated for API calls (prevents silent error masking)
- Full audit trail with `threadId: "mcp"` for all operations

### Architecture

- MCP write operations use the same CIBA flow as scheduled actions (v0.5.1) — `initiateCiba()` + `pollCiba()`
- Synchronous polling within request (unlike chat which streams CibaWaitingCard to client)
- Per-tool MCP executors bypass tool `execute` functions (which need browser sessions) and call APIs directly with pre-obtained tokens
- Trust spectrum complete: Action Center (low) → Chat (medium) → MCP+CIBA (high) → MCP read (autonomous)

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
- Requires: Auth0 CIBA grant type enabled + Guardian push factor configured + user enrolled in MFA + scheduled actions opt-in (for stored refresh token)
