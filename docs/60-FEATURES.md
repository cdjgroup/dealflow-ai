# Features

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

## v0.3.0 — Conversation Management & Help-Kit

### Conversation Management
Collapsible sidebar with conversation history. Users can:
- Start a fresh chat via "+ New Chat" button
- Switch between previous conversations (loaded from Redis)
- See conversation titles (auto-generated from first user message), message counts, and timestamps
- Collapse/expand the sidebar to maximize chat space

Conversations auto-save via `onFinish` callback in the chat API route, including full tool call history across all reasoning steps. Redis keys have 30-day TTL.

### Help-Kit Onboarding
Five-step "Getting Started" checklist in the dashboard sidebar:
1. Connect Google — link Google account for calendar and email
2. Connect Slack — enable team communication
3. Try a chat command — send first message to DealFlow AI
4. Check your pipeline — review deal metrics
5. Review permissions — configure tool access

Progress persists in localStorage (keyed by userId). Checklist is dismissible and collapsible with progress bar.

### Resource Center
Help drawer accessible via (?) icon in the navigation bar:
- **External docs**: Auth0 Token Vault, RFC 8693 Token Exchange, AI SDK Documentation
- **Quick actions**: Manage Permissions, View Audit Log
- **Glossary**: 8 DealFlow-specific terms (Token Vault, Step-Up Auth, Capability Toggles, Audit Trail, Connected Accounts, Short-Lived Token, RFC 8693, Needs Approval)

## v0.2.2 — Landing Page & Permissions Refinement

### Landing Page Education
Two new sections explain the Token Vault security story to first-time visitors:

**How It Works (4 steps):** Token request from Auth0 Token Vault, consent popup for new connections, short-lived token delivery, and approval requirements for external actions.

**Built for Security (4 highlights):** Zero Stored Credentials, Granular Permissions, Step-Up Authorization, Full Audit Trail — each with description targeting hackathon judging criteria.

### Simplified Navigation & Permissions
- Removed "Audit Log" from top nav (accessible via Permissions > Recent Activity "View full audit log" link)
- Removed redundant Profile section from Permissions page
- Made Tool Capability Matrix collapsible (`<details>` element, collapsed by default)

### Chat Readability
- Fixed light mode text contrast in user chat bubbles (prose-invert for white-on-indigo)
- Fixed table header visibility in user bubble markdown

### Accessibility
- aria-hidden on decorative emoji icons and SVG arrows
- Semantic heading hierarchy (h1 > h2 > h3) on landing page
- focus-visible styles on interactive links
- Safari VoiceOver-safe details/summary pattern

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
