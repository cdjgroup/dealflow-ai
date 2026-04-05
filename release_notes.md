# Release Notes — v0.6.0

## DealFlow AI: Per-Client MCP Policy System

External AI agents now get individually scoped access through named MCP clients with API keys, trust tiers, and per-client tool allowlists.

### What's new

- **Per-Client MCP Policies**: Create named MCP clients (e.g., "Claude Desktop", "Research Bot") each with a unique API key (`dfk_...`), a trust tier, and a tool allowlist. Different agents get different access levels to the same MCP endpoint.
- **Trust Tier Spectrum**: Four tiers — Read Only (CRM data only), Restricted (CRM + calendar + email), Standard (all read-only tools), Full (all MCP tools). Each tier has default tool sets that can be customized per client.
- **Dual Authentication**: MCP endpoint accepts both `dfk_`-prefixed API keys (per-client policy) and Auth0 bearer tokens (backward compatible, all MCP-safe tools). API keys are SHA-256 hashed before storage.
- **Per-Client Rate Limiting**: Each MCP client has a configurable rate limit (requests/minute) enforced via Upstash Ratelimit with independent buckets.
- **Usage Analytics**: Per-client call counts, success rates, and top tools tracked with daily granularity. View via client analytics API endpoint.
- **Audit Source Filter**: Audit log now shows a Source column (Chat / MCP / Actions) with colored badges. Filter by surface to see "what happened via MCP today" across all clients.
- **MCP Client Management UI**: Create, manage, and revoke clients from the MCP Explorer page. Trust tier visualization, tool checkboxes, key rotation, and delete confirmation built in.
- **Surface Policy Registry**: Formal code-level declarations of what each surface (chat, actions, MCP) allows — makes the three-surface trust model explicit and auditable.

### Security

- API keys: SHA-256 hashed before storage, raw key shown once on creation, `dfk_` prefix for identification
- CSRF enforcement on all client management mutations
- Per-client tool filtering at `tools/call` time — disallowed tools return clear error
- User-scoped Redis keys prevent cross-user client access
- Rate limit per client prevents abuse from any single external agent

### Architecture

- `verifyMcpToken()` dual-path: API key hash lookup vs Auth0 /userinfo, both fail closed
- `AuthInfo.extra` carries client metadata (allowedTools, rateLimit, trustTier) from auth to tool handlers
- Tool registration is static in `mcp-handler`; per-client filtering happens inside each tool handler
- Known limitation: `tools/list` returns all MCP tools regardless of client (filtering at call time only)

---

# Release Notes — v0.5.1 (Previous)

## DealFlow AI: Scheduled Action Review with CIBA Approval

AI agent autonomously proposes and executes pending actions on a user-defined schedule, with device-level consent via Auth0 Guardian.

### What's new

- **Scheduled Action Review**: Users opt into scheduled times (8am, 12pm, 5pm) via checkboxes on the Action Center page. At the selected time, a single Guardian push notification describes the batch (e.g., "DealFlow: 5 actions - 3 email, 2 calendar") — approve once on your phone and all high/medium priority actions auto-execute within the token's time-boxed window.
- **Priority filtering**: Only high and medium priority actions are included in scheduled execution. Low priority actions stay pending for manual review in the Action Center.
- **Run Now**: On-demand button in the Schedule panel triggers immediate batch CIBA execution without waiting for the next scheduled hour. UI polls for approval and shows real-time progress.
- **Two-phase Vercel cron design**: Phase 1 runs hourly to find opted-in users (timezone-aware), initiate CIBA. Phase 2 polls every minute — on approval, exchanges stored refresh tokens for Google/Slack access tokens and executes all actions.
- **AES-256-GCM encrypted token storage**: User's Auth0 refresh token encrypted at rest in Redis for offline/cron execution. Defense-in-depth beyond Upstash's infrastructure encryption.
- **SchedulePanel UI**: Checkbox cards for each time slot, optimistic saves, Active badge, timezone display, Run Now button with polling progress, error rollback.
- **Reseed Demo Data**: Resets CRM data and onboarding checklist to fresh state for demo purposes.
- **Action list real-time sync**: Action statuses update in real-time after scheduled execution via server component refresh.
- **Removed token lifecycle animation**: Simplified chat UI by removing the 6-stage pipeline visualization.

### Security

- Timing-safe CRON_SECRET verification (crypto.timingSafeEqual)
- Distributed execution lock (Redis SET NX) prevents duplicate action execution from overlapping cron ticks
- AES-256-GCM with random IV per encryption, auth tag verification on decrypt
- Encryption key length validated at startup with actionable error
- IANA timezone validated in API schema (prevents silent UTC fallback)
- Token exchange errors sanitized — OAuth internals never stored in user-facing fields
- CIBA denial reverts actions to pending (not failed) — respects user choice
- CIBA binding message sanitized to Auth0-allowed characters (alphanumerics + `+-_.,:#`, 64-char max)

### Architecture

- **Executor refactoring**: `executeActionWithToken()` accepts pre-obtained token, `executeAction()` unchanged (session-based). Shared `executeWithToken()` dispatcher — zero duplication.
- **Offline access pattern**: Refresh token stored at opt-in (RFC 6749/9700 compliant), exchanged at cron time via `exchangeTokenWithRefresh()`. CIBA token is proof of consent only (scoped to `openid`).
- **Redis key design**: `schedule:idx:{hour}` (user index), `ciba:scheduled:{userId}:{batchId}` (session with 10min TTL), `schedule:ciba:active` (active sessions index), `{userId}:schedule:refresh-token` (encrypted, 90-day TTL)
- **Idempotency**: Hour-truncated batch IDs prevent duplicate CIBA pushes. SET NX execution lock prevents duplicate action execution.
- Direct HTTP to Auth0 `/bc-authorize` and `/oauth/token` (CIBA grant type `urn:openid:params:grant-type:ciba`)
- Follows ADR 001 pattern: direct HTTP for full error observability (SDK swallows errors — [auth0-ai-js#175](https://github.com/auth0/auth0-ai-js/issues/175))

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
- Requires: Auth0 CIBA grant type enabled + Guardian push factor configured + user enrolled in MFA
