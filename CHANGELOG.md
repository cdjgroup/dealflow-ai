# Changelog

All notable changes to this project will be documented in this file.

## [0.5.2] - 2026-04-05

### Added
- LLM-powered action suggestions: `analyzePipeline` tool now calls Claude Haiku to generate personalized email drafts, meeting agendas, and Slack messages with AI reasoning instead of hardcoded templates
- AI confidence scores (0-1) on suggested actions, displayed as badges in the Action Center
- Trust calibration tracking: per-action-type approval/dismiss stats stored in Redis
- Trust stats displayed in Permissions UI with approval rates and "Consider auto-approve" recommendation at >80%
- Batch approve confirmation panel: type breakdown summary before approving (prevents accidental bulk approval)
- `generationMethod` field in analyzePipeline return value distinguishes AI vs heuristic suggestions

### Changed
- `analyzePipeline` activities fetched in parallel (Promise.all) instead of sequential N+1 queries
- Batch approve route now enforces same capability/trust guards as single-action approval
- LLM-generated drafts validated against strict draftSchema before Redis write (defense-in-depth)

### Security
- LLM output validated through Zod draftSchema before persistence (prevents oversized/malformed drafts from prompt injection)
- Batch route capability guard prevents approving actions for disabled integrations

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
