# Release Notes — v0.6.0

## DealFlow AI: Per-Client MCP Policy + CIBA-Gated Write Tools

External AI agents now get individually scoped access through named MCP clients with API keys, trust tiers, and per-client tool allowlists. Additionally, write operations (email, calendar, Slack) are now available via MCP with device-level CIBA consent.

### Per-Client MCP Policies

- **Per-Client MCP Policies**: Create named MCP clients (e.g., "Claude Desktop", "Research Bot") each with a unique API key (`dfk_...`), a trust tier, and a tool allowlist. Different agents get different access levels to the same MCP endpoint.
- **Trust Tier Spectrum**: Four tiers — Read Only (CRM data only), Restricted (CRM + calendar + email), Standard (all read-only tools), Full (all MCP tools). Each tier has default tool sets that can be customized per client.
- **Dual Authentication**: MCP endpoint accepts both `dfk_`-prefixed API keys (per-client policy) and Auth0 bearer tokens (backward compatible, all MCP-safe tools). API keys are SHA-256 hashed before storage.
- **Per-Client Rate Limiting**: Each MCP client has a configurable rate limit (requests/minute) enforced via Upstash Ratelimit with independent buckets.
- **Usage Analytics**: Per-client call counts, success rates, and top tools tracked with daily granularity. View via client analytics API endpoint.
- **Audit Source Filter**: Audit log now shows a Source column (Chat / MCP / Actions) with colored badges. Filter by surface to see "what happened via MCP today" across all clients.
- **MCP Client Management UI**: Create, manage, and revoke clients from the MCP Explorer page. Trust tier visualization, tool checkboxes, key rotation, and delete confirmation built in.
- **Surface Policy Registry**: Formal code-level declarations of what each surface (chat, actions, MCP) allows — makes the three-surface trust model explicit and auditable.

### MCP Write Tools with CIBA Consent

- **MCP write tools**: draftEmail, createCalendarEvent, sendSlackMessage now exposed via `/api/mcp`
- **CIBA gating**: All write operations require Guardian push approval before execution
- **Synchronous blocking**: MCP handler blocks up to 50s while polling for phone approval; returns error on timeout/denial
- **Binding messages**: Tool-specific messages on Guardian push (e.g., "MCP: draft email to alice@acme.com", "MCP: calendar \"Pipeline Review\"")
- **Capability enforcement**: MCP respects per-user permission toggles from `/dashboard/permissions`
- **Stored refresh tokens**: All MCP Token Vault tools (read + write) use stored refresh tokens from schedule opt-in

### Security

- API keys: SHA-256 hashed before storage, raw key shown once on creation, `dfk_` prefix for identification
- CSRF enforcement on all client management mutations
- Per-client tool filtering at both `tools/list` and `tools/call` — restricted clients see only authorized tools
- Circuit breaker fails closed on Redis error — rate limits enforced even during outages
- CIBA binding messages include client name prefix + sanitize all attacker-controllable params
- User-scoped Redis keys prevent cross-user client access
- Rate limit per client prevents abuse from any single external agent
- Device-level consent required for all MCP write operations (Guardian push)
- Capability toggles enforced — disabled tools return error, not available to external agents
- Connection-disabled check before CIBA initiation (no unnecessary push notifications)
- HTTP response status validated for API calls (prevents silent error masking)

### Architecture

- `verifyMcpToken()` dual-path: API key hash lookup vs Auth0 /userinfo, both fail closed
- `AuthInfo.extra` carries client metadata (allowedTools, rateLimit, trustTier) from auth to tool handlers
- Tool registration is static in `mcp-handler`; per-client filtering via `setRequestHandler(ListToolsRequestSchema)` override
- `tools/list` now filtered per-client using same scope/allowedTools as `tools/call` (via `_registeredTools` private Map — hackathon trade-off)
- MCP write operations use the same CIBA flow as scheduled actions (v0.5.1) — `initiateCiba()` + `pollCiba()`
- Synchronous polling within request (unlike chat which streams CibaWaitingCard to client)
- Per-tool MCP executors bypass tool `execute` functions (which need browser sessions) and call APIs directly with pre-obtained tokens
- Trust spectrum complete: Action Center (low) → Chat (medium) → MCP+CIBA (high) → MCP read (autonomous)

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
- Requires: Auth0 CIBA grant type enabled + Guardian push factor configured + user enrolled in MFA + scheduled actions opt-in (for stored refresh token)
