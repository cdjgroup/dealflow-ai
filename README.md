# DealFlow AI

AI-powered sales agent that securely manages your pipeline, checks calendars, drafts emails, and sends Slack updates — all authenticated through **Auth0 Token Vault**.

Built for the [Authorized to Act: Auth0 for AI Agents](https://authorizedtoact.devpost.com/) hackathon.

**Live:** [dealflow-ai-seven.vercel.app](https://dealflow-ai-seven.vercel.app)

## Architecture

```
                              DealFlow AI Architecture
  ┌─────────────────────────────────────────────────────────────────────────┐
  │                           USER BROWSER                                 │
  │                                                                        │
  │   ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌──────────────────┐  │
  │   │ Chat UI  │  │ Permissions  │  │ Audit    │  │ Capability       │  │
  │   │ (useChat)│  │ Page         │  │ Log Page │  │ Toggles          │  │
  │   └────┬─────┘  └──────┬───────┘  └────┬─────┘  └────────┬─────────┘  │
  └────────┼────────────────┼───────────────┼─────────────────┼────────────┘
           │                │               │                 │
  ═════════╪════════════════╪═══════════════╪═════════════════╪════════════
           │        NEXT.JS API ROUTES      │                 │
  ┌────────▼────────────────▼───────────────▼─────────────────▼────────────┐
  │                                                                        │
  │  POST /api/chat          GET /api/audit       GET/PUT /api/settings    │
  │  ┌──────────────────┐    GET /api/token-status                         │
  │  │ Settings Fetch   │    DELETE /api/connections/:conn                  │
  │  │ Capability Filter│    GET/PUT/DELETE /api/conversations/:id          │
  │  │ streamText()     │                                                  │
  │  │ Audit Logging    │                                                  │
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
  │                                                                        │
  │  Guardrails:  needsApproval (>$50K deals, closed-won)                  │
  │               Capability filter (disabled tools hidden from LLM)       │
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
  │ Exchange    │ │ Exchange   │ │  Token Cache    │
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
                      │ Settings Fetch   │  Per-user capability prefs
                      │ Capability Filter│  Disabled tools removed
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │ needsApproval    │  >$50K deals, closed-won
                      │ (Step-up Auth)   │  User confirms in chat
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │ Token Vault      │  RFC 8693 exchange
                      │ (OAuth Tokens)   │  Per-tool scoped tokens
                      └────────┬─────────┘
                               │
                      ┌────────▼─────────┐
                      │ Audit Trail      │  Every tool call logged
                      │ (Redis + stdout) │  Sanitized inputs
                      └─────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 16 (App Router) |
| **AI Model** | Claude Sonnet 4.6 via Vercel AI SDK v6 |
| **Auth** | Auth0 (Universal Login + Token Vault) |
| **Database** | Upstash Redis (REST API) |
| **Deployment** | Vercel |
| **Styling** | Tailwind CSS v4 + OKLCH design tokens |

## Features

### AI Agent
- Chat-based interface with Claude for sales pipeline management
- 12 tools: CRM (7), Calendar (1), Gmail (2), Slack (2)
- Multi-turn tool chaining (e.g., check calendar -> draft email with availability)
- Rich tool result cards (calendar events, email drafts, deal pipeline, Slack messages)

### Security
- Auth0 Token Vault with RFC 8693 token exchange (Google + Slack)
- Step-up authorization via `needsApproval` for high-value operations
- Per-tool capability toggles (users control what the agent can do)
- Approval queue for sensitive CRM writes (opt-in)
- Audit trail logging every agent action with sanitized inputs
- CSRF protection, rate limiting, Zod input validation
- Prompt injection defense (tool results treated as data, not instructions)

### User Control
- Permissions dashboard with live connection status
- Disconnect/revoke OAuth connections
- Active scope indicator showing which APIs are in use
- Conversation persistence (save/load chat history)

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
      settings/      # User capability settings
      audit/         # Audit log retrieval
      conversations/ # Chat thread persistence
      connections/   # OAuth connection management
      token-status/  # Live connection health check
      seed/          # Demo data seeding
    dashboard/
      page.tsx       # Main chat + deal sidebar
      permissions/   # Settings, toggles, connections
      audit/         # Audit log table
  components/
    chat-window.tsx          # Chat interface (useChat)
    chat-message.tsx         # Message renderer with tool cards
    tool-result-card.tsx     # Rich cards (7 tool types)
    capability-toggles.tsx   # Per-tool ON/OFF switches
    approval-card.tsx        # Action approval UI
    scope-indicator.tsx      # Active OAuth scope display
    revoke-button.tsx        # Disconnect connection
    conversation-list.tsx    # Chat history sidebar
    token-status.tsx         # Live connection status
    error-boundary.tsx       # React error boundary
  lib/
    data/
      crm.ts          # Deals, contacts, activities (Redis)
      settings.ts      # User preferences (Redis)
      audit.ts         # Audit log (Redis lists)
      conversations.ts # Chat persistence (Redis)
    tools/
      calendar.ts      # Google Calendar tool
      gmail.ts         # Gmail draft + search tools
      slack.ts         # Slack channels + messaging tools
      crm.ts           # CRM tools (7)
      capability-filter.ts  # Filter tools by user settings
      approval-logic.ts     # needsApproval for step-up auth
      scope-map.ts          # Tool -> OAuth scope mapping
    types/             # TypeScript interfaces
```

## License

Built for the Authorized to Act hackathon. See contest rules for usage terms.
