# Changelog

All notable changes to this project will be documented in this file.

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
- Direct Auth0 /oauth/token calls instead of @auth0/ai-vercel SDK wrapper (incompatible with AI SDK v6)
- Upstash Redis via HTTP for all data (no PostgreSQL, Edge-compatible)
- Claude Sonnet 4.6 as the LLM (configurable via ANTHROPIC_MODEL env var)
