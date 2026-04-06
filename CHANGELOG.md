# Changelog

All notable changes to this project will be documented in this file.

## [0.6.5] - 2026-04-05

### Fixed
- Approval retry loop: external action tools re-requested approval on every tool-call round, burning rate limits. Root cause: `needsApproval` was stateless and CIBA/rate-limiter wrappers overwrote the execute tracking. Fix: shared `executedTools` Set populated by `onToolCallFinish` callback.
- Rate limits too tight for multi-tool workflows: write tier 5→10/min, endpoint 10→20/min

## [0.6.4] - 2026-04-05

### Added
- Confidence routing redesign: Stripe Radar-inspired pattern with read-only viz bar, numeric inputs, zone icons, and dynamic autonomy level references
- Enable/disable toggle for confidence routing (falls back to autonomy-level-only routing)
- Guardian notification priority selector: user-configurable priority checkboxes for scheduled batch execution
- Priority labels on action cards ("high priority" instead of "high")

### Fixed
- Settings persistence bug: `confidenceThresholds` silently dropped in `updateUserSettings` — now field-level merged
- Light mode contrast across MCP components (~40 instances): text-*-400 to -600/-700, bg-*/5-10 to -/15 (WCAG AA)
- Action card priority badge contrast for light mode

### Changed
- Confidence routing UI moved from dual-thumb slider to numeric stepper inputs + read-only visualization bar
- `notifyPriorities` setting controls which priorities are included in scheduled Guardian push (default: high + medium)

## [0.6.3] - 2026-04-05

### Added
- MCP Playground page at `/dashboard/mcp-playground` for interactive MCP tool testing
- Dynamic form generation from MCP tool `inputSchema` (JSON Schema → HTML inputs)
- CIBA consent visualization: pulsing wait state with cancel button for write tools
- `.mcp.json` project-scoped Claude Code config with env var expansion for API key
- `mcpCall()` JSON-RPC helper with AbortController support

## [0.6.2] - 2026-04-05

### Added
- Confidence-based routing: AI confidence scores drive action approval — high confidence (>=85%) auto-approves, low confidence (<=50%) forces manual review regardless of autonomy level
- Per-client MCP parameter constraints: regex-based semantic filtering on tool parameters (e.g., restrict searchEmails to @acme.com domains)
- Layer 3.5 enforcement in MCP tool handler: parameter constraints validated between client allowlist and CIBA gate, fail-closed on invalid regex
- Confidence threshold sliders in schedule panel UI with three-band visualization
- Parameter constraint editor in MCP client create form (collapsible, tool+param+regex+description)
- EU AI Act Article 14 references in blog post, Devpost submission, and insights docs (025, 026)
- Regex validation at MCP client creation time (defense-in-depth with runtime fail-closed)
- Constraints bounded: max 5 per tool, max 10 tools per client

## [0.6.1] - 2026-04-05

### Added
- Trust calibration nudge: after 5+ approvals at >80% rate, banner suggests upgrading tool to auto-approve
- Nudge in single-action and batch approve API responses (optional `nudge` field, backward-compatible)
- TrustNudgeBanner component in Action Center with Accept/Dismiss controls
- Accept updates `toolTrust` via settings API; dismiss hides banner (re-appears on next threshold hit)
- Hardened `getTrustStats` to merge against defaults for legacy Redis records

## [0.6.0] - 2026-04-05

### Added
- Per-client MCP policy system: create named clients with API keys, trust tiers, and tool allowlists
- Dual MCP authentication: `dfk_`-prefixed API keys with SHA-256 hashing + Auth0 bearer tokens (backward compatible)
- Surface policy registry: formal declarations for chat/mcp/actions trust boundaries
- Trust tier spectrum: Full > Standard > Restricted > Read Only, each with default tool sets
- API key management: generation, rotation, revocation via `/api/mcp/clients` REST endpoints
- Confidence-informed autonomy: low-confidence actions (<0.5) forced to manual review regardless of autonomy level
- Structured confidence rubric in LLM prompt for better calibration (anchored at 0.9+/0.7-0.9/0.5-0.7/<0.5)
- Policy reason in audit trail: every audit entry explains which authorization layer triggered the decision
- `policyReason` field displayed in audit detail panel (amber "Policy Decision" row)
- Per-client API key denials now audited (previously returned error without audit entry)
- Per-client rate limiting: configurable requests/minute per MCP client via Upstash Ratelimit
- Per-client usage analytics: call counts, success rates, top tools with daily granularity
- Audit log source filter: filter by Chat, MCP, or Actions surface with colored badges
- MCP client management UI in MCP Explorer: create/delete clients, trust tier visualization, tool checkboxes
- MCP client card component: trust tier badge, allowed tools display, key rotation, delete confirmation
- Two-layer rate limiting for AI tool execution (per-tool + per-request)
- Per-tool rate limiting: 4 tiers (read: 10/min, write: 5/min, crm-read: 20/min, crm-write: 5/min)
- Per-request tool call counter: max 15 tool calls per chat request, aborts on breach
- Rate limit audit trail: denials logged with tier, remaining budget, reset time
- Amber-styled rate limit alerts in chat UI (distinct from red error banners)
- MCP write tools: draftEmail, createCalendarEvent, sendSlackMessage now exposed via `/api/mcp`
- CIBA gating for all MCP write operations (Guardian push approval required)
- `cibaGate()` function for synchronous CIBA polling in MCP context (50s timeout)
- `buildMcpBindingMessage()` for tool-specific CIBA binding messages
- `shouldRequireCibaMcp()` for MCP write tool detection
- MCP capability enforcement: respects per-user permission toggles
- Per-tool MCP executors using stored refresh tokens (same trust model as scheduled actions)

### Changed
- MCP `tools/list` now filtered by per-client `allowedTools` via AsyncLocalStorage bridge (closes information disclosure gap)
- `adaptToolsForMcp()` signature changed from `(_userId?: string)` to `(allowedToolFilter?: string[])`
- MCP route uses ALS to thread auth context from `withMcpAuth` into `initializeServer` callback
- Chat route refactored from `toUIMessageStreamResponse` to `createUIMessageStream` wrapper for clean error injection before stream abort
- MCP server version bumped to 0.6.0
- All MCP Token Vault tools now use stored refresh tokens instead of session-based `exchangeToken()`
- Tool adapter expanded from 6 read-only tools to 9 tools (6 read + 3 CIBA-gated write)

### Security
- MCP `tools/list` filtered per-client by scope and allowedTools (closes info disclosure)
- Circuit breaker fails closed on Redis error (was fail-open — blocks tool execution instead of bypassing rate limits)
- CIBA binding messages include client name prefix for attribution + sanitize all params
- SHA-256 API key hash rationale documented in code comment
- Token binding (DPoP/mTLS) absence documented as future hardening (insight #022)
- API keys hashed with SHA-256 before storage; raw key shown only once on creation
- CSRF enforcement on all MCP client management mutations
- Per-client tool discovery filtering: `tools/list` returns only client's allowed tools (defense-in-depth)
- Per-client tool execution filtering: disallowed tools return error at `tools/call` time
- User-scoped Redis keys prevent cross-user client access
- AbortController kills runaway streams mid-flight when tool call limit exceeded
- Write tools require device-level CIBA consent before MCP execution
- Capability toggles enforced on MCP path (prevents bypassing permission settings)
- Connection-disabled check runs before CIBA (no unnecessary push notifications)
- HTTP response status validated for API calls (prevents silent error masking)

### Documentation
- Added "Graduated Trust Architecture" section to Devpost with IETF draft-klrc-aiagent-auth-01 and EU AI Act Article 14 references
- Added "Standards Alignment" sections to ADRs 001, 003, 004, 006, 007
- Added OpenFGA/WIMSE acknowledgment to Devpost "What's next"

## [0.5.2] - 2026-04-05

### Added
- AI Autonomy Selector: 3-level control (Suggest Only / Auto-Approve / Full Autonomous)
- LLM-powered action suggestions via Claude Haiku subagent with confidence scores
- Trust calibration tracking with approval rate display in Permissions UI
- Surface policy registry + scope-aware MCP auth

## [0.5.1] - 2026-04-05

### Added
- `createCalendarEvent` AI tool: schedule meetings directly via Token Vault (calendar.events scope)
- Calendar event result card with "Open in Calendar" link in chat UI
- Scheduled Action Review: users opt into 8am/12pm/5pm review via checkboxes on Action Center
- Batch CIBA consent: one Guardian push for all high/medium priority actions (e.g., "DealFlow: 5 actions - 3 email, 2 calendar")
- Time-boxed execution: CIBA approval grants a token window, all actions execute within it
- Priority filtering: only high and medium priority actions included in scheduled execution
- "Run Now" button for on-demand batch CIBA execution (testing/demos)
- Vercel cron jobs: Phase 1 (hourly initiate) sends Guardian push, Phase 2 (per-minute poll) auto-executes on approval
- AES-256-GCM encrypted refresh token storage for offline/cron execution
- Distributed execution lock (Redis SET NX) prevents duplicate action execution
- Timezone-aware scheduling with IANA timezone validation
- SchedulePanel UI component with optimistic updates, polling progress, and error handling
- "Reseed Demo Data" resets onboarding checklist for demo purposes
- Action list syncs with server data in real-time after scheduled execution

### Security
- Timing-safe CRON_SECRET comparison (crypto.timingSafeEqual)
- Encryption key length validation with actionable error messages
- Token exchange errors sanitized before user-facing storage
- IANA timezone validated in Zod schema (prevents silent UTC fallback)
- CIBA binding message sanitized to Auth0-allowed characters (alphanumerics + +-_.,:#)

### Changed
- Executor refactored: new `executeActionWithToken()` for pre-obtained tokens (cron flow)
- Schedule index uses idempotent SADD (self-heals index drift)
- CIBA denial on scheduled batch reverts actions to pending (not failed)

## [0.5.0] - 2026-04-04

### Added
- CIBA (Client-Initiated Backchannel Authentication) step-up for high-value actions
- Auth0 Guardian push notification approval on phone for deals >$50K and terminal stage changes
- Two-step consent: inline approval card (app-level) then CIBA push (device-level)
- CibaWaitingCard component with animated polling, countdown timer, and status states
- CIBA API routes: POST /api/ciba/initiate, GET /api/ciba/status/[authReqId]
- Redis-backed CIBA session management (prevents re-initiation on regenerate)
- Action Center CIBA integration: high-value actions trigger device approval before execution
- `ciba-pending` action status with device approval styling
- 21 unit tests for CIBA core module (should-require, authorize, poll)
- Audit trail includes cibaAuthReqId for traceability

### Security
- Access tokens stripped from client-facing CIBA status endpoint
- Auth0 error descriptions sanitized (no internal detail leakage)
- CIBA sessions user-scoped in Redis with TTL cleanup

## [0.4.1] - 2026-04-03

### Changed
- Permissions page redesigned: merged Agent Capabilities + Connected Accounts into unified integration cards (Google, Slack, CRM)
- Google multicolor G SVG icon per official branding guidelines
- Slack S on brand purple #4A154B (octothorpe logo prohibited in third-party UI per Slack brand terms)
- OAuth scopes shown as human-readable labels (calendar.readonly → "View your calendar")
- Tool names shown as human-readable labels throughout (checkCalendar → "View Calendar")
- Tool Reference and Recent Activity sections start collapsed
- Disconnected integrations gray out capability toggles
- Eliminated redundant TokenStatus component and separate account cards (3 places showing connection status → 1)

## [0.4.0] - 2026-04-03

### Added
- Action Center page (`/dashboard/actions`) for AI-suggested next steps
- Action card component with inline draft editing (email, calendar, Slack)
- Action filters with tab-based status filtering and batch approve
- Action execution via Token Vault OAuth (Gmail drafts, Calendar events, Slack messages)
- Google Calendar event creation (Events.insert API with `calendar.events` scope)
- Type-specific Zod draft validation schemas (email, calendar, Slack)
- Action seeding in demo data endpoint (5 actions tied to existing deals)
- Nav badge showing pending action count
- Redis-backed action CRUD with per-user data isolation
- 14 new data layer unit tests

### Changed
- Nav component accepts `pendingActionCount` prop for badge display
- Dashboard layout fetches pending action count in parallel with existing data
- Seed endpoint returns action count alongside deal/contact/activity counts

### Fixed
- Execute endpoint returns 502 on downstream API failure (was returning 200)
- Action creation restricted to "pending" status only (prevents approval bypass)

## [0.3.1] - 2026-04-03

### Added
- Audit log filters: filter by tool name, result (success/error), and date range (Last 24h/3d/7d)
- Structured audit detail panel: key-value layout replaces raw JSON in expanded rows
- Capability toggles grouped by integration: collapsible CRM/Google/Slack sections
- Impact descriptions on every toggle explaining what the AI agent can/cannot do
- Connection health badges (Connected/Disconnected) inline in Google and Slack group headers
- Shared tool constants module (`src/lib/constants/tools.ts`)
- `AuditFilters` type and server-side filtering in audit API route

### Changed
- Audit table uses proper semantic HTML: individual `<td>` cells, `<time datetime>`, `aria-expanded`, `scope="col"`, `<dl>/<dt>/<dd>` detail panel
- Capability matrix adds `scope="col"` and sr-only `<caption>` for accessibility
- Error rows in audit log get red left-border severity indicator
- Audit table rows are keyboard-navigable (tabIndex + Enter/Space)
- Decorative emojis marked `aria-hidden="true"` for screen readers

### Fixed
- Audit filtering fetches larger Redis window (4x limit) when filters active to prevent incomplete results
- Date preset dropdown tracks state explicitly instead of reverse-computing from dates
- Filter error state shown to user instead of silent failure

## [0.3.0] - 2026-04-03

### Added
- Dynamic scope narrowing: enriched token exchange with scope/expiresIn/connection metadata, TOOL_SCOPE_CONFIG as single source of truth, buildTokenMeta helper
- Per-tool trust levels (always/ask/never) with T1 priority layer in approval logic
- "never" trust hard-blocks tools at registration (LLM never sees them)
- Token lifecycle animation in chat showing 6-stage pipeline during Token Vault tool execution
- TokenMeta in audit entries (connection, provider, scope, expiresIn)
- MCP server endpoint at /api/mcp for external AI agents (Streamable HTTP transport)
- Cross-agent delegation with scoped, time-limited tokens (delegateResearch tool)
- Delegation validates tool names and cross-checks user capabilities

### Changed
- Token exchange return type enriched from { token } to { token, scope, expiresIn, connection, exchangedAt }
- TOOL_SCOPES derived from TOOL_SCOPE_CONFIG (single source of truth, prevents drift)
- Approval logic restructured: T1 trust > S3 external > S1 value > U2 settings
- Settings API accepts toolTrust with zod validation (enum + size cap)

### Fixed
- branch-check.py hook: auto-sync no longer stashes uncommitted changes (was causing silent data loss on merge conflicts)
- Slack channel-lookup failure now returns explicit error instead of silently falling through
- Network errors in token exchange return generic message (no infrastructure details leaked)

### Security
- MCP endpoint requires auth (bearer token validated against Auth0 /userinfo)
- MCP exposes only read-only tools (approval-required tools excluded)
- toolTrust keys capped at 64 chars, max 20 entries per request
- delegateResearch validates tool names against known set

### Dependencies
- Added mcp-handler, @modelcontextprotocol/sdk

## [0.2.1] - 2026-04-03

### Added
- Gradient text branding on hero (text-7xl) and nav with indigo-to-cyan gradient
- Staggered fade-in animations on chat messages, suggestions, and tool cards (framer-motion)
- "Token Vault Active" scope card with animated badges during tool execution
- Pipeline metrics cards (Active Deals, Pipeline Value, Won) in dashboard sidebar
- Deal stage funnel visualization in dashboard sidebar
- Expandable audit log rows with full I/O JSON and risk-level badges (OAuth/Write/Read)
- Glassmorphism (backdrop-blur-sm) on chat bubbles, tool cards, sidebar, and landing cards
- Glow shadow on CTA buttons with hover intensification
- Animated ApprovalCard entrance (slide-up + scale)
- Avatar badges on chat messages (gradient "D" for AI, "You" for user)
- Token Vault architecture diagram on landing page

### Removed
- Redundant Connect Services card from dashboard sidebar (handled by Token Vault interrupt + Permissions page)

### Dependencies
- Added framer-motion for animation system

## [0.2.0] - 2026-04-02

### Added
- needsApproval for external actions (draftEmail, sendSlackMessage) and terminal deal stages (closed-won/closed-lost)
- Three-layer approval: S1 value-based step-up, S3 external action approval, U2 user settings toggle
- Capability matrix on permissions page — all 12 tools with READ/WRITE badges, Token Vault vs Local CRM source, guardrails
- "Agent cannot" boundary list on permissions page
- Rich tool badges in chat with icon, scope tag, Token Vault lock icon vs Local CRM
- Activity timeline on permissions page with usage stats and colored timeline
- Enhanced connection status with green/red indicators, auto-refresh, inline scope badges
- Slack integration (listSlackChannels, sendSlackMessage) with Token Vault auth
- Shared token exchange utility (`src/lib/token-exchange.ts`)

### Removed
- `@auth0/ai-vercel` dependency (unused since direct RFC 8693 exchange)
- Duplicated `getGoogleToken()` / `getSlackToken()` functions (consolidated into shared module)

### Changed
- Token status endpoint uses shared `exchangeTokenWithRefresh()` instead of inline fetch
- Calendar, Gmail, Slack tools use shared `exchangeToken()` and `sanitizeApiError()`
- Approval logic extended to cover draftEmail, sendSlackMessage, and closed-lost stage

## [0.1.0] - 2026-04-02

### Added
- Auth0 authentication with Universal Login (Google social connection)
- AI chat agent powered by Claude Sonnet 4.6 via Vercel AI SDK v6
- Token Vault integration for Google Calendar and Gmail (direct RFC 8693 exchange)
- CRM data layer in Upstash Redis (deals, contacts, activities)
- 8 AI tools: checkCalendar, draftEmail, searchEmails, listDeals, getDealDetails, searchContacts, createDeal, logActivity
- Custom UpstashStore implementing @auth0/ai Store interface
- Connect Google Account button using Auth0 Connected Accounts flow
- Permissions dashboard showing connected accounts and scopes
- Hardcoded seed data for demo reliability
- Rate limiting on AI endpoint via @upstash/ratelimit
- Corrupted cookie recovery in middleware
- LLM prompt injection defense in system prompt
- Request body validation and CSRF protection
- Landing page with Auth0 login
- Unit tests (vitest) + E2E smoke tests (Playwright)
- Vercel production deployment

### Architecture Decisions
- Direct Auth0 /oauth/token calls instead of @auth0/ai-vercel SDK wrapper (SDK swallows exchange errors — see auth0-ai-js#175)
- Upstash Redis via HTTP for all data (no PostgreSQL, Edge-compatible)
- Claude Sonnet 4.6 as the LLM (configurable via ANTHROPIC_MODEL env var)
