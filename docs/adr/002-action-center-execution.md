# ADR 002: Action Center — Pragmatic Execution via Direct Tool Calls

**Status:** PROPOSED
**Date:** 2026-04-03

## Context

The AI agent needs to suggest next steps (emails, calendar events, Slack messages) based on CRM deal context and let users review, edit, and execute them. The execution path must call external APIs (Gmail, Google Calendar, Slack) via Auth0 Token Vault OAuth exchange.

Three approaches were considered:
1. **Minimal**: Display suggestions, link back to chat for execution (no direct execution)
2. **Clean**: Abstract `ActionExecutor` strategy pattern with WebSocket status updates
3. **Pragmatic**: Direct tool calls from execute API route, typed draft interfaces, optimistic UI

## Decision

**Pragmatic approach**: Execute actions directly from a Next.js API route handler using the same `exchangeToken()` function that AI chat tools use. Each action type (email, calendar, Slack) has a dedicated execution function in `src/lib/actions/executor.ts`. No abstraction layer, no WebSocket, no strategy pattern.

Key technical choices:
- Synchronous execution (user clicks Execute, waits for result) — no background workers
- Optimistic UI updates with rollback on error in the client
- Type-specific Zod validation on draft payloads (not a generic JSON schema)
- Google Calendar event creation via Events.insert API with `calendar.events` scope
- `sendUpdates=none` on calendar events to avoid surprising attendees during demo

## Consequences

### Positive
- Complete "AI suggests → user reviews → approves → executes" demo loop via Token Vault
- Reuses proven patterns (Redis from crm.ts, API auth from settings/route.ts, UI from approval-card.tsx)
- Minimal new abstractions — each execution function is self-contained and testable
- Token Vault works identically in API route context (session cookie present)

### Negative
- No cross-tab synchronization (action approved in one tab not reflected in another)
- Synchronous execution blocks the user briefly during API calls
- Each new action type requires adding a function to executor.ts (not pluggable)
- Calendar event creation adds a scope dependency (`calendar.events` must be configured in Auth0 Dashboard)

### Neutral
- The Minimal approach would have been safer but weaker for hackathon impact
- The Clean approach would be better engineering for a production system but premature for a 3-day hackathon
