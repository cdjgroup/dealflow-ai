# Release Notes — v0.3.1

## DealFlow AI: Permissions & Audit Log Polish + Boundary-Pushing Auth

Professional, accessible UI overhaul for the permissions page and audit log, plus five features that push the Auth0 Token Vault security model beyond traditional AI agent authorization.

### Permissions & Audit Polish

- **Audit log filters**: Filter entries by tool name, result (success/error), and date range presets (Last 24h / 3 days / 7 days). Filters apply server-side with a smooth client-side UX. "Clear filters" button and empty-state message when no entries match.
- **Structured audit detail panel**: Expanded audit entries now show a formatted key-value grid (tool, timestamp, status, duration, thread, parameters) instead of raw JSON. Empty parameters show "No parameters" instead of `{}`. Error details rendered in a highlighted box.
- **Grouped capability toggles**: Toggles organized into collapsible CRM / Google / Slack sections. Each group header shows "X of Y enabled" summary. Groups default to collapsed for a clean overview.
- **Impact descriptions**: Every toggle now includes a descriptive line explaining what the AI agent can do when that capability is enabled.
- **Connection health badges**: Google and Slack toggle group headers show live Connected/Disconnected badges pulled from the Token Vault status API.

### Accessibility improvements

- Audit table: proper `<td>` cells (was `colSpan` wrapping), `<time datetime>`, `aria-expanded`/`aria-controls`, keyboard navigation (Tab + Enter/Space)
- Capability matrix: `scope="col"` on headers, sr-only `<caption>`
- Decorative emojis: `aria-hidden="true"` throughout
- Error rows: red left-border severity indicator with text labels (not color-only)
- Loading spinner: `role="status"` with `aria-label`

### Boundary-Pushing Auth

**F3 — Dynamic Scope Narrowing**
- Token exchange now captures scope, expiresIn, connection, and exchangedAt from Auth0 responses (previously discarded)
- `TOOL_SCOPE_CONFIG` is the single source of truth for Token Vault tool metadata (connection, provider, scopes, minScope, accessLevel, dataDescription)
- `TOOL_SCOPES` derived from config to prevent drift
- `buildTokenMeta` helper attaches `_tokenMeta` to all Token Vault tool results
- UI shows "Using calendar.readonly of 3 granted scopes" — voluntary least-privilege

**F1 — Consent-Aware Tool Selection**
- Per-tool trust levels: "always" (skip approval), "ask" (require consent every time), "never" (hard-block — tool hidden from AI)
- T1 trust layer at top of approval chain overrides S3/S1/U2 layers
- "never" trust filters tools at registration — LLM never sees them
- Trust settings persisted per-user in Redis, merged per-key
- Settings API validates toolTrust with zod enum + size cap (20 entries, 64 char keys)

**F2 — Token Vault Audit Visualization**
- `TokenMeta` in audit entries (connection, provider, scope, expiresIn, apiEndpoint)
- Animated 6-stage token lifecycle pipeline in chat: AI Decides -> Token Exchange -> Scoped Token -> API Call -> Response -> Token Expires
- Collapsible panel with scope metadata, TTL countdown, provider badge
- Audit table expanded rows show token exchange details
- Accessible: aria-expanded, aria-label, aria-hidden, touch targets

**F4 — MCP Server for External AI Agents**
- `/api/mcp` endpoint using Streamable HTTP transport (mcp-handler + @modelcontextprotocol/sdk)
- Bearer token auth validates against Auth0 /userinfo
- Only read-only tools exposed (approval-required tools excluded — no approval UI in MCP)
- Every MCP tool call logged to audit trail, `_tokenMeta` stripped from responses
- Compatible with Claude API MCP Connector, Claude Desktop, Cursor, OpenClaw

**F5 — Cross-Agent Delegation**
- `delegateResearch` tool creates scoped, time-limited delegation tokens (Redis with TTL)
- User must approve delegation before it proceeds (needsApproval via S3)
- Validates tool names against known tools + cross-checks user capabilities
- Audit trail records delegation creation with delegation ID
- Demonstrates agent-to-agent trust pattern: scoped, time-bound, consented, auditable

### Bug fixes

- Audit filtering fetches larger Redis window when filters active (prevents incomplete results)
- Date preset dropdown stores state explicitly (prevents visual flicker over time)
- Fetch errors show visible error banner instead of silent failure
- Fixed branch-check.py hook that was stashing uncommitted changes during auto-sync

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
