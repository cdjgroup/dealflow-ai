# Release Notes — v0.6.2

## DealFlow AI: Confidence Routing + Intent Constraints

AI confidence scores now drive the action approval flow. The `resolveInitialStatus` function routes actions through a three-band system: high confidence (>=85%) auto-approves regardless of autonomy level, low confidence (<=50%) forces manual review regardless of autonomy level, and the middle band defers to the existing autonomy toggle. Low-confidence actions are also excluded from scheduled batch CIBA execution.

Per-client MCP parameter constraints add semantic intent verification. Each MCP client can now include regex-based constraints on tool parameters — e.g., restrict `searchEmails` to only `from:.*@acme\.com` queries. Constraints are validated at creation time and enforced fail-closed at runtime (Layer 3.5, between client allowlist and CIBA gate).

EU AI Act Article 14 references connect DealFlow's trust spectrum to upcoming regulation, positioning the architecture as forward-looking compliance.

### Confidence-Based Routing
- **Auto-approve threshold**: confidence >= 0.85 → approved (overrides autonomy level)
- **Require-review threshold**: confidence <= 0.5 → pending (overrides autonomy level)
- **Middle band**: defers to existing autonomy level logic
- **Batch filtering**: low-confidence actions excluded from scheduled execution
- **UI**: two range sliders in schedule panel, defaults enabled (0.85/0.5)

### MCP Parameter Constraints
- **Per-client regex constraints**: stored in McpClient, enforced in tool-adapter.ts
- **Fail-closed**: invalid regex patterns block the call, never pass
- **Audit trail**: constraint violations recorded with tool name, param, and description
- **Bounded**: max 5 constraints per tool, 10 tools per client
- **UI**: collapsible constraint editor in MCP client create form

### EU AI Act Article 14
- Blog post: new section mapping trust spectrum to Article 14 human oversight requirements
- Devpost: confidence routing mention in graduated trust architecture section
- Insights 025 (Article 14 alignment) and 026 (parameter constraints as intent verification)

### Previous: v0.6.1 — Trust Calibration Nudge

The trust stats feedback loop is now closed. After approving 5+ actions of the same type with >80% approval rate, a nudge banner appears in the Action Center suggesting the user upgrade that tool to auto-approve. This is genuine trust calibration — the system observes user behavior and recommends autonomy changes, but never auto-escalates.

### Trust Calibration
- **Threshold-based nudge**: After 5+ decisions with >80% approval rate for a tool, the API includes a `nudge` payload in the approve response
- **Upgrade-only**: System only suggests promoting `ask` → `always` (never suggests blocking)
- **Accept/Dismiss**: One-click Accept updates `toolTrust` via settings API; Dismiss hides the banner
- **Best-effort**: Nudge evaluation errors never break the approve/dismiss flow
- **Batch support**: Batch "Approve All" also evaluates and surfaces nudges
- **Backward-compatible**: Optional `nudge?` field added to existing API responses

### Previous: v0.6.0 — Per-Client MCP Policy + CIBA-Gated Write Tools

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
- Tool registration uses AsyncLocalStorage bridge to thread per-client `allowedTools` from auth into `initializeServer`
- `tools/list` now returns only tools the client is allowed to call (defense-in-depth; execution-layer enforcement remains as fallback)
- MCP write operations use the same CIBA flow as scheduled actions (v0.5.1) — `initiateCiba()` + `pollCiba()`
- Synchronous polling within request (unlike chat which streams CibaWaitingCard to client)
- Per-tool MCP executors bypass tool `execute` functions (which need browser sessions) and call APIs directly with pre-obtained tokens
- Trust spectrum complete: Action Center (low) → Chat (medium) → MCP+CIBA (high) → MCP read (autonomous)

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
- Requires: Auth0 CIBA grant type enabled + Guardian push factor configured + user enrolled in MFA + scheduled actions opt-in (for stored refresh token)
