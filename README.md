# DealFlow AI

AI-powered sales agent that securely manages your pipeline, checks calendars, drafts emails, and sends Slack updates — all authenticated through **Auth0 Token Vault** with boundary-pushing authorization controls.

Built for the [Authorized to Act: Auth0 for AI Agents](https://authorizedtoact.devpost.com/) hackathon.

**Live:** [dealflow-ai-seven.vercel.app](https://dealflow-ai-seven.vercel.app)

## What Makes This Different

Most AI agents get blanket access to your data. DealFlow AI demonstrates five authorization patterns that put the user in control:

1. **Dynamic Scope Narrowing** — The AI voluntarily restricts itself to minimum required scopes, even though the token grants broader access
2. **Consent-Aware Tool Selection** — Per-tool trust levels (always / ask each time / never) that override default approval behavior
3. **Token Vault Audit Visualization** — An animated 6-stage pipeline in the chat showing exactly how your token flows through each API call
4. **MCP Server for External Agents** — Any AI agent (OpenClaw, Claude Desktop, Cursor) can securely use these tools via the Model Context Protocol
5. **Cross-Agent Delegation** — Scoped, time-limited delegation tokens that let one agent grant restricted access to another

## Architecture

```
                              DealFlow AI Architecture
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
                      │ CIBA Step-Up     │  Guardian push notification
                      │ (Device Auth)    │  for >$50K deals, stage changes
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

### v0.5.0 — CIBA Step-Up Authentication

Device-level consent for high-value actions via Auth0 Guardian push notifications. When the AI agent creates a deal >$50K or closes a deal as won, a two-step consent flow activates: inline approval in the app, then a push notification to the user's phone. The user approves on their Guardian app before the action executes. Same pattern banks use for wire transfers — defense in depth at the identity layer.

- CibaWaitingCard with polling, countdown, and status transitions
- Action Center integration with `ciba-pending` status
- Direct HTTP to Auth0 `/bc-authorize` (ADR 004)
- Redis-backed CIBA sessions prevent re-initiation

### v0.4.0–v0.4.1 — Action Center + Permissions Redesign

AI-suggested next steps queue at `/dashboard/actions`. The AI analyzes deal context and generates actionable suggestions (follow-up emails, demo meetings, Slack updates) with justification. Users review, edit inline, approve, and execute through Token Vault. Permissions page redesigned into unified integration cards per provider.

### v0.3.0 — Boundary-Pushing Auth

#### Dynamic Scope Narrowing
Token exchange captures the full granted scope from Auth0, while each tool declares its minimum required scope. The UI shows "Using calendar.readonly of 3 granted scopes" — voluntary least-privilege at the application layer.

#### Consent-Aware Tool Selection
Per-tool trust levels that give users granular control:
- **Always** — skip approval (even for external actions like email)
- **Ask each time** — require consent on every invocation (even for read-only tools)
- **Never** — hard-block the tool entirely (AI never sees it)

#### Token Vault Audit Visualization
An animated 6-stage pipeline that appears in the chat during Token Vault tool execution: AI Decides → Token Exchange → Scoped Token → API Call → Response → Token Expires. Shows scope, TTL, and provider in a collapsible panel. Audit table entries include token exchange metadata.

#### MCP Server for External AI Agents
`/api/mcp` endpoint exposing read-only tools via Model Context Protocol (Streamable HTTP). External agents authenticate with Auth0 bearer tokens. Compatible with Claude API MCP Connector, Claude Desktop, Cursor, and OpenClaw.

#### Cross-Agent Delegation
The `delegateResearch` tool creates scoped, time-limited delegation tokens (stored in Redis with TTL). The user must approve the delegation, specifying which tools are authorized and for how long (1-30 minutes). Tool names are validated against the known set and cross-checked against user capabilities.

### v0.2.x — Core Platform

#### AI Agent
- Chat-based interface with Claude for sales pipeline management
- 13 tools: CRM (7), Calendar (1), Gmail (2), Slack (2), Delegation (1)
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
- Getting Started checklist (5 steps) with auto-detection of completed steps
- Resource center with external docs, quick actions, and glossary

## MCP Integration

External AI agents can connect to DealFlow AI's tools:

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
    "dealflow-ai": {
      "url": "https://dealflow-ai-seven.vercel.app/api/mcp"
    }
  }
}
```

Only read-only tools are exposed via MCP (approval-required tools like email drafting and Slack messaging are excluded since MCP has no interactive approval UI).

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
   - Grant Types: Authorization Code, Refresh Token, CIBA

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
      mcp/           # MCP server for external AI agents
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
  components/
    chat-container.tsx       # Conversation list + chat orchestration
    chat-window.tsx          # Chat interface (useChat)
    chat-message.tsx         # Message renderer with tool cards + token lifecycle
    token-lifecycle.tsx      # Animated token flow visualization (6-stage pipeline)
    tool-result-card.tsx     # Rich cards (7 tool types)
    capability-toggles.tsx   # Per-tool ON/OFF switches + trust levels
    approval-card.tsx        # Action approval UI (incl. delegation consent)
    scope-indicator.tsx      # Active OAuth scope display
    audit-table.tsx          # Expandable audit log with token metadata
    revoke-button.tsx        # Disconnect connection
    conversation-list.tsx    # Chat history sidebar
    token-status.tsx         # Live connection status
  lib/
    data/
      crm.ts          # Deals, contacts, activities (Redis)
      settings.ts     # User preferences + trust levels (Redis)
      audit.ts        # Audit log with TokenMeta (Redis lists)
      conversations.ts # Chat persistence (Redis)
    tools/
      calendar.ts      # Google Calendar tool (+ _tokenMeta)
      gmail.ts         # Gmail draft + search tools (+ _tokenMeta)
      slack.ts         # Slack channels + messaging tools (+ _tokenMeta)
      crm.ts           # CRM tools (7)
      delegate.ts      # Cross-agent delegation tool
      capability-filter.ts  # Filter by capabilities + "never" trust
      approval-logic.ts     # T1/S3/S1/U2 approval layers
      scope-map.ts          # TOOL_SCOPE_CONFIG (single source of truth)
    mcp/
      tool-adapter.ts  # AI SDK → MCP tool conversion
    ciba/
      authorize.ts       # Auth0 /bc-authorize (CIBA initiation)
      poll.ts            # Auth0 /oauth/token (CIBA grant polling)
      should-require.ts  # CIBA threshold check ($50K+, terminal stages)
      session.ts         # Redis-backed CIBA session management
      types.ts           # CIBA type definitions
    delegation.ts      # Redis-backed delegation token store
    token-exchange.ts  # Auth0 RFC 8693 exchange (+ scope metadata)
    types/
      settings.ts      # UserSettings + TrustLevel
      audit.ts         # AuditEntry + TokenMeta
```

## Testing

```bash
npm test              # 290 tests across 33 files
npm run build         # TypeScript + Next.js production build
npx playwright test   # E2E smoke tests
```

## License

Built for the Authorized to Act hackathon. See contest rules for usage terms.
