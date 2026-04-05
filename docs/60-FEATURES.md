# Features

## v0.5.1 — Scheduled Action Review

### Autonomous Agent Execution on a Schedule
Users opt into scheduled review times (8am, 12pm, 5pm) via checkboxes on the Action Center page. At the scheduled time:
1. **Vercel cron** finds opted-in users whose local timezone matches the hour
2. **Batch CIBA Guardian push** sent to user's phone: "DealFlow: 5 actions - 3 email, 2 calendar"
3. **Phone approval** grants a time-boxed execution window — all high/medium priority actions execute within the token's lifetime
4. **Phone denial** reverts all actions to pending for next cycle

### Priority Filtering
Only **high** and **medium** priority actions are included in scheduled execution. Low priority actions stay pending for manual review in the Action Center. This prevents notification fatigue while ensuring time-sensitive actions get attention.

### Run Now (On-Demand)
A "Run Now" button in the Schedule panel triggers immediate batch CIBA execution without waiting for the next scheduled hour. The UI polls for approval and shows progress as actions execute. Useful for testing and demos.

### Reseed Demo Data
The "Reseed Demo Data" button resets CRM data and the onboarding checklist to fresh state for demo purposes.

### How It Works
- Two-phase cron: hourly initiate (finds users, sends CIBA) + per-minute poll (checks approval, executes)
- User's Auth0 refresh token stored encrypted (AES-256-GCM) at opt-in time for offline token exchange
- Distributed execution lock prevents duplicate execution from overlapping cron ticks
- Timezone-aware: uses browser's IANA timezone, validated server-side
- Binding message sanitized to Auth0-allowed characters (alphanumerics + `+-_.,:#`, 64-char max)
- Action list syncs in real-time after execution via server component refresh

### Security
- Timing-safe CRON_SECRET comparison on all cron endpoints
- Encrypted refresh token with 90-day TTL, separate encryption key
- CIBA token lifetime serves as natural execution boundary — time-boxed delegation
- Only pre-declared actions execute within the window (no open-ended agent authorization)

## v0.5.0 — CIBA Step-Up Authentication

### Device-Level Consent for High-Value Chat Actions
When the AI agent triggers a high-value action in chat ($50K+ deals or terminal stage changes like closed-won), a two-step consent flow activates:
1. **Inline approval** — standard approval card in chat (app-level consent)
2. **CIBA push notification** — Auth0 sends a push to the user's phone via Guardian app (device-level consent)

The user sees a CibaWaitingCard in the chat with the binding message (e.g., "Approve creating $75,000 deal: Acme Enterprise"), an animated pulse indicator, and a countdown timer. Upon phone approval, the tool executes normally.

### How It Works
- Direct HTTP calls to Auth0 `/bc-authorize` (CIBA initiation) and `/oauth/token` (CIBA grant polling)
- Follows the same pattern as Token Vault exchange (ADR 001) — no SDK wrapper
- Redis-backed CIBA sessions prevent re-initiation when the chat regenerates
- Access tokens never exposed to the client — consumed server-side only

## v0.4.0 — Action Center

### AI-Suggested Actions Queue
The Action Center (`/dashboard/actions`) surfaces AI-recommended next steps based on CRM deal context. Each suggestion includes:
- **Action type**: Email (Gmail draft), Calendar (Google Calendar event), or Slack (channel message)
- **Justification**: AI-generated explanation of why this action is recommended, with deal context
- **Draft content**: Pre-written email/meeting/message ready for user review

### Review & Edit Flow
Users review each suggestion and can:
- **Approve** — queues the action for execution
- **Edit** — expand the card to modify draft content inline (type-specific fields: To/Subject/Body for email, Title/Date/Time/Duration/Attendees for calendar, Channel/Message for Slack)
- **Dismiss** — removes the suggestion from the active queue
- **Batch approve** — approve all pending actions at once

### Execution via Token Vault
Approved actions execute through the same Auth0 Token Vault OAuth flow used by the AI chat tools:
- Email actions create Gmail drafts (user reviews in Gmail before sending)
- Calendar actions create Google Calendar events with attendees (`sendUpdates=none` to avoid surprising attendees)
- Slack actions post messages to channels

Status transitions are shown inline on each card: Pending (amber) → Approved (blue) → Executing (animated pulse) → Sent (green) / Failed (red with error message and Retry button).

### Navigation Integration
Pending action count shown as a badge on the "Actions" link in the nav bar. Badge hidden when count is zero.

## v0.4.1 — Permissions Page Redesign

### Unified Integration Cards
Permissions page consolidated from 4 separate sections into a unified view. Each integration (Google, Slack, CRM) is a single card showing connection status, capability toggles, and per-tool trust levels in one place. Disconnected integrations gray out their toggles.

### Provider Branding
Google: official multicolor G SVG per Google Identity branding guidelines. Slack: S on brand purple #4A154B (Slack prohibits using the octothorpe logo in third-party UI per their brand terms of service).

### Human-Readable Labels
OAuth scopes translated to plain English per Google's own consent screen patterns: `calendar.readonly` → "View your calendar", `gmail.compose` → "Draft emails", `channels:read` → "List channels". Tool names also translated: `checkCalendar` → "View Calendar" etc. Technical scope shown in tooltip for transparency.

### Collapsed Reference Sections
Tool Reference matrix and Recent Activity timeline start collapsed to keep the page focused on the primary controls.

## v0.3.1 — Permissions & Audit Log Polish

### Audit Log Filters
Filter bar with three controls: tool name dropdown (populated from log entries), result toggle (Success/Error), and date range presets (Last 24h/3d/7d). Filters apply server-side via extended `/api/audit` query params. Client-side state management with loading indicator and error feedback. Empty state with "Clear filters" action.

### Structured Audit Detail Panel
Expanded audit rows display a formatted `<dl>` key-value grid: Tool, Timestamp, Status, Duration, Thread ID, Entry ID, plus a Parameters section. Empty inputs show "No parameters". Error messages render in a highlighted box. Replaces raw `JSON.stringify` output.

### Grouped Capability Toggles
Toggles organized into collapsible integration groups (CRM, Google, Slack) using native `<details>/<summary>`. Each group header shows enabled count ("2 of 2 enabled") and live connection health badge (Connected/Disconnected) for OAuth-backed integrations. Groups default to collapsed.

### Impact Descriptions
Each capability toggle includes a descriptive line explaining the operational impact when enabled, helping users make informed permission decisions.

### Accessibility
Semantic HTML throughout: `<table>` with `scope="col"`, `<time datetime>`, `aria-expanded`/`aria-controls`, keyboard-navigable audit rows, `aria-hidden` on decorative emojis, `role="status"` on spinners, sr-only `<caption>` on capability matrix.

### Shared Constants
Tool icons, Token Vault tool set, and write tool set extracted to `src/lib/constants/tools.ts` — single source of truth used by audit table and activity timeline.

## v0.3.0 — Boundary-Pushing Auth

### Dynamic Scope Narrowing
Application-layer scope awareness for Token Vault tools. Each tool declares its minimum required scope via `TOOL_SCOPE_CONFIG`. The token exchange captures the full granted scope from Auth0, and the UI shows which subset the tool actually uses ("Using calendar.readonly of 3 granted scopes"). This demonstrates defense-in-depth: the agent voluntarily restricts itself beyond what the token enforces.

### Consent-Aware Tool Selection
Per-tool trust levels ("always" / "ask each time" / "never") that override the default approval behavior. Users can require consent on every calendar check or permanently block email access. The "never" level hard-blocks tools at registration — the AI never sees them. Trust settings persist per-user in Redis and are managed at `/dashboard/permissions`.

### Token Vault Audit Visualization
Audit table expanded rows display token exchange metadata (provider, scope, TTL). Makes the invisible security model visible for judges.

### MCP Server with Surface Policy & Per-Client Scopes
Model Context Protocol endpoint at `/api/mcp` using Streamable HTTP transport. External agents (Claude Desktop, Cursor, CI pipelines) discover and invoke tools through standard MCP protocol.

**Surface Policy Registry**: A formal policy registry (`src/lib/surface-policy.ts`) declares what each surface allows and why — the security constraints adapt per surface. If a surface can't support human consent, write access is revoked. The three surfaces:
- **Chat UI** (full access): All 13 tools with SDK approval flow + CIBA step-up
- **Action Center** (write-only): Pre-approved email/calendar/slack actions
- **MCP** (read-only): Bearer token auth, no approval UI available

**Scope-Aware Auth**: Bearer tokens validated against Auth0 `/userinfo`. Scopes derived from the surface policy (`crm:read`, `calendar:read`, `gmail:read`, `slack:read`) — not hardcoded. Per-request scope enforcement at tool execution time.

**Per-Client Policies**: Different MCP clients can have different access levels. Configurable at `/dashboard/mcp` — e.g., Cursor IDE gets CRM + calendar, while a CI pipeline gets CRM-only. Client policies intersect with the MCP surface ceiling (can't exceed read-only). User capability toggles are respected — disabling calendar in settings also removes it from MCP scopes.

All MCP calls logged to audit trail with scope denial tracking.

### Cross-Agent Delegation
The `delegateResearch` tool creates scoped, time-limited delegation tokens stored in Redis with automatic TTL expiry. The user must consent before a delegation proceeds. The delegation specifies which tools are authorized and for how long (1-30 minutes). Tool names are validated against the known set and cross-checked against user capabilities. Demonstrates agent-to-agent trust: scoped, time-bound, consented, auditable.

## v0.2.1 — UI Polish & Visual Storytelling

### Animated Landing Page
Gradient "DealFlow AI" title (text-7xl), staggered feature card animations, Token Vault architecture diagram showing the full auth flow (User → Auth0 → Token Vault → AI Agent → Google/Slack), and glow CTA button with indigo shadow.

### Chat Animations
Staggered fade-in on messages and tool result cards via framer-motion. AI messages show a gradient "D" avatar badge; user messages show "You". Glassmorphism (backdrop-blur-sm) on chat bubbles. Animated suggestion chips on empty state.

### Token Vault Active Indicator
Signature animated scope card that appears during tool execution showing which OAuth scopes are live. Emerald ping indicator, animated scope badges that fan in, and "Short-lived token via Auth0 — revocable anytime" footer. The security story made visual.

### Pipeline Metrics & Funnel
Summary metric cards (Active Deals, Pipeline Value, Won) and horizontal bar funnel visualization by pipeline stage in the dashboard sidebar.

### Expandable Audit Log
Click any audit row to expand full input/output JSON. Risk-level badges: OAuth (amber) for Token Vault tools, Write (yellow) for CRM mutations, Read (green) for queries.

### Animated ApprovalCard
Slide-up + scale entrance animation on step-up auth prompts, drawing attention to the approval flow.

### Glassmorphism Design
backdrop-blur-sm applied to chat bubbles, tool result cards, sidebar cards, landing page cards, and input fields — aligning with 2025-2026 award-winning design trends.

## v0.2.0 — Hackathon Feature Expansion

### needsApproval Tool Confirmations
External actions (draftEmail, sendSlackMessage) always require user approval before execution. Terminal deal stages (closed-won, closed-lost) and high-value deals (>$50K) trigger step-up authorization. Three approval layers: S1 value-based, S3 external actions, U2 user settings toggle.

### Capability Matrix
All 12 agent tools displayed on the permissions page (`/dashboard/permissions`) with:
- READ/WRITE access badges
- Token Vault vs Local CRM source indicators
- Enabled/disabled status based on user settings
- Per-tool guardrail tags (e.g., "Always requires approval", "Drafts only — never sends")
- "The agent cannot" boundary list

### Rich Tool Badges in Chat
Every tool call in the chat displays a badge with:
- Tool-specific icon
- Scope tag (READ or WRITE)
- Token Vault lock icon for OAuth-backed tools, "Local CRM" for Redis-backed tools
- State indicator (running, completed, awaiting approval)

### Enhanced Connection Status
Live OAuth connection status on permissions page:
- Green/red colored cards with scope badges
- Auto-refresh every 30 seconds
- Manual refresh button
- Token type info ("short-lived access token via RFC 8693 exchange")

### Activity Timeline
Visual timeline on permissions page showing recent agent actions:
- Usage stats: total actions, Token Vault calls, success rate, avg execution time
- Colored dots (green = success, red = error)
- Token Vault indicator on external tool calls
- Time-ago timestamps
- Links to full audit log

### Slack Integration
Two tools for Slack communication via Token Vault:
- `listSlackChannels` — list accessible channels (READ)
- `sendSlackMessage` — send a message to a channel (WRITE, requires approval)

## v0.1.0 — Initial Release

### AI Chat Agent
Claude Sonnet 4.6 with multi-step tool calling via Vercel AI SDK v6.

### Auth0 Token Vault
Secure Google Calendar and Gmail access via RFC 8693 federated token exchange.

### CRM
Deals, contacts, and activity history stored in Upstash Redis.

### Security
Rate limiting, CSRF protection, input validation, prompt injection defense.
