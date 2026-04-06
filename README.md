# DealFlow

AI-powered sales agent with graduated trust architecture — four trust levels, three execution surfaces, one Auth0 Token Vault pipeline. The AI suggests actions with justification, users review and edit before execution, and every action is auditable across Chat, Action Center, and MCP.

Built for the [Authorized to Act: Auth0 for AI Agents](https://authorizedtoact.devpost.com/) hackathon.

> **Demo Video:** [Watch the 3-minute walkthrough](TODO_YOUTUBE_LINK) | **Live:** [dealflow-ai-seven.vercel.app](https://dealflow-ai-seven.vercel.app)

## What Makes This Different

Most AI agents get blanket access to your data. DealFlow implements a graduated trust spectrum where security adapts to each surface's trust properties:

| Surface | Trust Level | Consent | What Happens |
|---------|------------|---------|--------------|
| **Action Center** | Low | In-app review + edit | AI suggests, user reviews every action |
| **Chat UI** | Medium | Real-time + step-up | User directs, AI pauses for sensitive ops |
| **MCP + CIBA** | High | Phone push notification | External agent acts, user consents on device |
| **MCP (read)** | Autonomous | None needed | Read-only queries, no data modified |

Key innovations:
1. **CIBA Batch Scheduling** — One Guardian push approves all pending actions on a schedule, time-boxed to token lifetime
2. **Confidence Routing** — AI scores suggestions 0-1; high confidence auto-approves, low confidence forces review (configurable)
3. **Trust Calibration** — System observes approval patterns and suggests upgrading tools to auto-approve (never auto-escalates)
4. **Per-Client MCP Policies** — Each external agent gets its own API key, trust tier, tool allowlist, and parameter constraints
5. **Reasoning-Aware Audit** — Every entry logs which policy layer decided, not just what happened

## Architecture

```
                              DealFlow Architecture
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                           USER BROWSER                                 │
  │                                                                        │
  │   ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐  │
  │   │ Chat UI  │  │ Permissions  │  │ Audit    │  │ Trust Level      │  │
  │   │ (useChat)│  │ + Trust Lvls │  │ Log Page │  │ Controls         │  │
  │   └────┬─────┘  └──────┬───────┘  └────┬─────┘  └────────┬─────────┘  │
  └────────┼────────────────┼───────────────┼─────────────────┼────────────┘
           │                │               │                 │
  ═════════╪════════════════╪═══════════════╪═════════════════╪════════════
           │        NEXT.JS API ROUTES      │                 │
  ┌────────▼────────────────▼───────────────▼─────────────────▼────────────┐
  │                                                                        │
  │  POST /api/chat          GET /api/audit       GET/PUT /api/settings    │
  │  ┌──────────────────┐    GET /api/token-status                         │
  │  │ T1 Trust Filter  │    DELETE /api/connections/:conn                  │
  │  │ Capability Filter│    GET/PUT/DELETE /api/conversations/:id          │
  │  │ Approval Checks  │                                                  │
  │  │ streamText()     │    POST /api/mcp ← External AI agents (MCP)      │
  │  │ Audit + TokenMeta│                                                  │
  │  └──────┬───────────┘                                                  │
  └─────────┼──────────────────────────────────────────────────────────────┘
            │
  ┌─────────▼──────────────────────────────────────────────────────────────┐
  │                        AI AGENT (Claude)                               │
  │                                                                        │
  │  Tools:  checkCalendar | draftEmail | searchEmails                     │
  │          listSlackChannels | sendSlackMessage                          │
  │          listDeals | getDealDetails | searchContacts                   │
  │          createDeal | updateDeal | createContact | logActivity         │
  │          delegateResearch (scoped, time-limited delegation)            │
  │                                                                        │
  │  Guardrails:  T1 trust levels (always/ask/never per tool)              │
  │               needsApproval (>$50K deals, external actions, delegation)│
  │               Capability filter (disabled/"never" tools hidden)        │
  │               Scope narrowing (tools use minimum required scope)       │
  │               Prompt injection defense (tool results = DATA only)      │
  └──────┬──────────────┬──────────────┬───────────────────────────────────┘
         │              │              │
  ┌──────▼──────┐ ┌─────▼──────┐ ┌────▼────────────┐
  │ Auth0       │ │ Auth0      │ │  Upstash Redis  │
  │ Token Vault │ │ Token Vault│ │                 │
  │ (Google)    │ │ (Slack)    │ │  CRM Data       │
  │             │ │            │ │  Settings       │
  │ RFC 8693    │ │ RFC 8693   │ │  Audit Log      │
  │ Token       │ │ Token      │ │  Conversations  │
  │ Exchange    │ │ Exchange   │ │  Delegation Tkns│
  └──────┬──────┘ └─────┬──────┘ └─────────────────┘
         │              │
  ┌──────▼──────┐ ┌─────▼──────┐
  │ Google APIs │ │ Slack APIs │
  │             │ │            │
  │ Calendar    │ │ channels   │
  │ Gmail       │ │ chat       │
  └─────────────┘ └────────────┘
```

### Security Model

```
  Request Flow with Security Layers:

  User Request
       │
       ▼
  ┌─────────────┐     ┌──────────────────┐
  │ Auth0 Login │────▶│ Session (Cookie)  │
  └─────────────┘     └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │ CSRF Check       │  X-Requested-With header
                      │ Rate Limiting    │  10 req/min per user
                      │ Input Validation │  Zod schemas
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │ T1 Trust Filter  │  Per-tool always/ask/never
                      │ Settings Fetch   │  Per-user capability prefs
                      │ Capability Filter│  Disabled + "never" removed
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │ needsApproval    │  >$50K deals, external actions,
                      │ (Step-up Auth)   │  delegation, closed-won stage
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │ Token Vault      │  RFC 8693 exchange
                      │ + Scope Metadata │  scope, TTL, connection tracked
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │ Audit Trail      │  Every tool call logged
                      │ + Token Metadata │  scope, TTL, provider in audit
                      └─────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **AI Model** | Claude Sonnet 4.6 via Vercel AI SDK v6 |
| **Auth** | Auth0 (Universal Login + Token Vault) |
| **Database** | Upstash Redis (REST API) |
| **MCP** | mcp-handler + @modelcontextprotocol/sdk |
| **Deployment** | Vercel |
| **Styling** | Tailwind CSS v4 + OKLCH design tokens |
| **Animation** | Framer Motion |

## Features

### v0.6.2 — Confidence Routing + Intent Constraints
- AI confidence scores (0.0–1.0) drive action routing: auto-approve above 85%, force manual review below 50%
- Per-client MCP parameter constraints with regex validation
- EU AI Act Article 14 alignment documentation

### v0.6.0 — Per-Client MCP Policy + CIBA Write Tools
- Named MCP clients with API keys, trust tiers, and tool allowlists
- CIBA-gated write tools for external agents (draftEmail, createCalendarEvent, sendSlackMessage)
- Two-layer circuit breaking: per-tool rate limits + per-request cap
- Cross-surface audit telemetry with source attribution

### v0.5.1 — Scheduled Action Review
- Scheduled batch execution via Vercel cron + CIBA Guardian push
- Priority filtering: high/medium auto-execute, low stays for manual review
- "Run Now" for on-demand batch CIBA execution

### v0.5.0 — CIBA Step-Up Authentication
- Two-step consent for high-value chat actions: inline approval + Guardian push
- CibaWaitingCard with binding message, pulse animation, countdown timer
- Direct HTTP CIBA (no SDK wrapper, per ADR 004)

### v0.4.0 — Action Center
- AI-suggested next steps queued for human review with justifications
- Inline editing of email/calendar/Slack drafts before approval
- Execution via Token Vault with real-time status transitions

### v0.3.0 — Auth

#### Dynamic Scope Narrowing
Token exchange captures the full granted scope from Auth0, while each tool declares its minimum required scope. The UI shows "Using calendar.readonly of 3 granted scopes" — voluntary least-privilege at the application layer.

#### Consent-Aware Tool Selection
Per-tool trust levels that give users granular control:
- **Always** — skip approval (even for external actions like email)
- **Ask each time** — require consent on every invocation (even for read-only tools)
- **Never** — hard-block the tool entirely (AI never sees it)

#### Token Vault Audit Visualization
Audit table entries include token exchange metadata (provider, scope, TTL) for every Token Vault tool call. Expanded rows show the full exchange details.

#### MCP Server for External AI Agents
`/api/mcp` endpoint exposing read and write tools via Model Context Protocol (Streamable HTTP). External agents authenticate with Auth0 bearer tokens. Write tools (email, calendar, Slack) require CIBA device consent via Guardian push. Compatible with Claude API MCP Connector, Claude Desktop, Cursor, and OpenClaw.

#### Cross-Agent Delegation
The `delegateResearch` tool creates scoped, time-limited delegation tokens (stored in Redis with TTL). The user must approve the delegation, specifying which tools are authorized and for how long (1-30 minutes). Tool names are validated against the known set and cross-checked against user capabilities.

### v0.2.x — Core Platform

#### AI Agent
- Chat-based interface with Claude for sales pipeline management
- 15 tools: CRM (7), Calendar (2), Gmail (2), Slack (2), Pipeline Analysis (1), Delegation (1)
- Multi-turn tool chaining (e.g., check calendar → draft email with availability)
- Rich tool result cards (calendar events, email drafts, deal pipeline, Slack messages)
- Conversation management: new chat, history sidebar, auto-save to Redis

#### Security
- Auth0 Token Vault with RFC 8693 token exchange (Google + Slack)
- Step-up authorization via `needsApproval` for high-value operations
- Per-tool capability toggles (users control what the agent can do)
- Audit trail logging every agent action with sanitized inputs
- CSRF protection, rate limiting, Zod input validation
- Prompt injection defense (tool results treated as data, not instructions)
- Disconnect/reconnect via Redis-backed revocation

#### User Control
- Permissions dashboard with live connection status and trust level controls
- Disconnect/revoke OAuth connections with persistent state
- Active scope indicator showing which APIs are in use
- Conversation persistence with auto-save and 30-day TTL

#### Onboarding & Help
- Getting Started checklist (8 steps) with auto-detection of completed steps
- Resource center with external docs, quick actions, and glossary

## MCP Integration

External AI agents can connect to DealFlow's tools:

```bash
# Discover available tools
curl -X POST https://dealflow-ai-seven.vercel.app/api/mcp \
  -H "Authorization: Bearer <auth0-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Call a tool
curl -X POST https://dealflow-ai-seven.vercel.app/api/mcp \
  -H "Authorization: Bearer <auth0-access-token>" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"checkCalendar","arguments":{"date":"2026-04-04"}},"id":2}'
```

**Claude Desktop / Cursor config:**
```json
{
  "mcpServers": {
    "dealflow": {
      "url": "https://dealflow-ai-seven.vercel.app/api/mcp"
    }
  }
}
```

Read tools execute immediately. Write tools (draftEmail, createCalendarEvent, sendSlackMessage) require CIBA approval — a Guardian push notification to the user's phone. The MCP handler blocks up to 50 seconds for approval. All MCP operations respect the user's capability settings at `/dashboard/permissions`.

## Setup

### Prerequisites
- Node.js 20+
- Auth0 tenant with Token Vault enabled
- Upstash Redis database
- Anthropic API key
- Google Cloud project with Calendar + Gmail APIs enabled
- (Optional) Slack app for Slack integration

### Environment Variables

```bash
# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-client-id
AUTH0_CLIENT_SECRET=your-client-secret
AUTH0_SECRET=your-session-secret
APP_BASE_URL=http://localhost:3000

# Upstash Redis
UPSTASH_REDIS_REST_URL=your-redis-url
UPSTASH_REDIS_REST_TOKEN=your-redis-token

# Anthropic
ANTHROPIC_MODEL=claude-sonnet-4-6
```

### Auth0 Configuration

1. **Application Settings:**
   - Type: Regular Web Application
   - Allowed Callback URLs: `{APP_BASE_URL}/auth/callback`
   - Allowed Logout URLs: `{APP_BASE_URL}`
   - Grant Types: Authorization Code, Refresh Token

2. **Token Vault (Connected Accounts):**
   - Enable "Connected Accounts" on your application
   - Connection purpose: "Auth + Connected Accounts"
   - Enable MRRT (Multiple Refresh Token Rotation)
   - Configure My Account API audience

3. **Google Connection:**
   - Social Connection: google-oauth2
   - Scopes: `calendar.readonly`, `gmail.compose`, `gmail.readonly`

4. **Slack Connection (Optional):**
   - Social Connection: slack
   - Scopes: `channels:read`, `chat:write`
   - See [Slack Setup Guide](#slack-setup) below

### Install & Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Slack Setup

1. **Create Slack App:** Go to [api.slack.com/apps](https://api.slack.com/apps) -> Create New App -> From scratch
2. **Add Scopes:** OAuth & Permissions -> Bot Token Scopes -> `channels:read`, `chat:write`, `users:read`
3. **Add Redirect URL:** `https://{AUTH0_DOMAIN}/login/callback`
4. **Auth0 Social Connection:** Authentication -> Social -> Slack -> Enter Client ID + Secret from Slack app
5. **Enable for your app:** Toggle the Slack connection on for your Auth0 application

## Project Structure

```
src/
  app/
    api/
      chat/          # AI agent streaming endpoint
      mcp/           # MCP server + client management endpoints
      ciba/          # CIBA initiate + status polling
      cron/          # Scheduled action execution (initiate + poll)
      actions/       # Action Center CRUD + batch approve
      settings/      # User capability + trust level settings
      audit/         # Audit log retrieval
      conversations/ # Chat thread persistence
      connections/   # OAuth connection management
      token-status/  # Live connection health check
      seed/          # Demo data seeding
    dashboard/
      page.tsx       # Main chat + deal sidebar
      permissions/   # Settings, toggles, trust levels, connections
      audit/         # Audit log table with token metadata
      actions/       # Action Center — AI suggestions queue
      mcp/           # MCP Explorer — client management
  components/
    chat-container.tsx       # Conversation list + chat orchestration
    chat-window.tsx          # Chat interface (useChat)
    chat-message.tsx         # Message renderer with tool cards
    tool-result-card.tsx     # Rich cards for tool results
    capability-toggles.tsx   # Per-tool ON/OFF switches + trust levels
    approval-card.tsx        # Action approval UI (incl. delegation consent)
    ciba-waiting-card.tsx    # CIBA polling with countdown timer
    ciba-inline-card.tsx     # Inline CIBA status display
    scope-indicator.tsx      # Active OAuth scope display
    audit-table.tsx          # Expandable audit log with token metadata
    action-card.tsx          # Action Center suggestion cards
    action-list.tsx          # Action list with filters
    schedule-panel.tsx       # Scheduled execution + confidence thresholds
    trust-nudge-banner.tsx   # Trust calibration upgrade suggestion
    mcp-explorer.tsx         # MCP client management UI
    mcp-client-card.tsx      # Per-client policy card
    revoke-button.tsx        # Disconnect connection
    conversation-list.tsx    # Chat history sidebar
    token-status.tsx         # Live connection status
  lib/
    data/
      crm.ts            # Deals, contacts, activities (Redis)
      settings.ts       # User preferences + trust levels (Redis)
      audit.ts          # Audit log with TokenMeta (Redis lists)
      conversations.ts  # Chat persistence (Redis)
      actions.ts        # Action Center CRUD (Redis)
      mcp-clients.ts    # Per-client MCP policies (Redis)
      mcp-analytics.ts  # Per-client usage tracking (Redis)
      schedule-tokens.ts # Encrypted refresh token storage (Redis)
      scheduled-ciba.ts # Scheduled CIBA batch management (Redis)
    tools/
      calendar.ts        # Google Calendar tools (+ _tokenMeta)
      gmail.ts           # Gmail draft + search tools (+ _tokenMeta)
      slack.ts           # Slack channels + messaging tools (+ _tokenMeta)
      crm.ts             # CRM tools (7)
      analyze-pipeline.ts # LLM subagent for pipeline analysis + suggestions
      delegate.ts        # Cross-agent delegation tool
      capability-filter.ts  # Filter by capabilities + "never" trust
      approval-logic.ts     # T1/S3/S1/U2 approval layers
      scope-map.ts          # TOOL_SCOPE_CONFIG (single source of truth)
    mcp/
      tool-adapter.ts  # MCP tool registration + CIBA-gated execution
      ciba-gate.ts     # Synchronous CIBA gate for MCP write tools
      auth.ts          # Dual auth: API key + Auth0 bearer token
      tool-auth.ts     # Per-client tool filtering + parameter constraints
    delegation.ts      # Redis-backed delegation token store
    token-exchange.ts  # Auth0 RFC 8693 exchange (+ scope metadata)
    types/
      settings.ts      # UserSettings + TrustLevel + ConfidenceThresholds
      audit.ts         # AuditEntry + TokenMeta
      actions.ts       # Action + ActionDraft types
      policy.ts        # SurfacePolicy + McpClient types
      scheduled-ciba.ts # ScheduledCiba types
```

## Testing

```bash
npm test              # 676 tests across 64 files
npm run build         # TypeScript + Next.js production build
npx playwright test   # E2E smoke tests
```

Test coverage spans API routes, components, data layer, tools & approval logic, CIBA device consent, MCP adapters, trust calibration, confidence routing, parameter constraints, core library, and E2E smoke tests.

## License

Built for the Authorized to Act hackathon. See contest rules for usage terms.
