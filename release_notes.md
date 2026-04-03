# Release Notes — v0.3.0

## DealFlow AI: Boundary-Pushing Auth

Five features that push the Auth0 Token Vault security model beyond traditional AI agent authorization: application-layer scope awareness, consent-aware tool execution, token lifecycle visualization, an MCP server for external agents, and cross-agent delegation.

### What's new

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
- Animated 6-stage token lifecycle pipeline in chat: AI Decides → Token Exchange → Scoped Token → API Call → Response → Token Expires
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

### Framework fix
- Fixed branch-check.py hook that was stashing uncommitted changes during auto-sync and losing them on merge conflicts

### Test coverage
- 217 tests across 24 test files (57 F3 + 21 F1 + 9 F2 + 3 F4 + 6 F5 + existing)

### Dependencies added
- `mcp-handler` — Vercel MCP server adapter
- `@modelcontextprotocol/sdk` — MCP protocol implementation

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
