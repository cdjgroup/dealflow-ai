# Features

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
