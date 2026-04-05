# ADR 007: CIBA-Gated Write Tools for MCP (Inline Executors)

**Status:** PROPOSED
**Date:** 2026-04-05

## Context

DealFlow AI's MCP server originally exposed only read-only tools because "MCP has no approval UI." Write tools (draftEmail, createCalendarEvent, sendSlackMessage) were excluded entirely. This made MCP a second-class execution surface — external agents could read data but not act on it.

The existing CIBA infrastructure (v0.5.0) provides device-level consent via Auth0 Guardian push notifications. CIBA is a backchannel protocol designed precisely for server-initiated flows without user sessions — making it a natural fit for MCP's headless, stateless model.

Additionally, the existing MCP read tools called `exchangeToken()` internally, which depends on `auth0.getSession()` (browser session cookies). This meant MCP Token Vault tools didn't work for true external clients (Claude Desktop, Cursor) — only same-origin browser requests.

## Decision

1. **Register write tools on MCP** (draftEmail, createCalendarEvent, sendSlackMessage), gated by synchronous CIBA approval within the MCP request lifecycle.

2. **Use inline MCP executors** (Approach 1: Minimal) rather than modifying existing tool `execute` functions or bridging to `executor.ts`. Each executor is a thin fetch wrapper (5-15 lines) that accepts a pre-obtained access token.

3. **Use stored refresh tokens** for ALL MCP Token Vault tools (read + write), matching the scheduled actions trust model. Users must opt into scheduled actions to enable MCP Token Vault tools.

### Alternatives Considered

- **Token override parameter on tools** (Approach 2: Clean) — Rejected: modifies 6 existing tool functions, adds complexity to the chat hot path for MCP's benefit.
- **Reuse executor.ts for writes** (Approach 3: Pragmatic) — Rejected: param shape mismatch between tool params and SuggestedAction draft shapes requires awkward bridging code.

## Consequences

### Positive
- MCP becomes a first-class execution surface with the same security guarantees as chat
- Complete trust spectrum: Action Center (low) → Chat (medium) → MCP+CIBA (high) → MCP read (autonomous)
- MCP + Token Vault + CIBA composition appears to be novel — no other project combines all three for agent consent
- MCP Token Vault tools now work for true external clients (stored refresh tokens, no session cookies needed)

### Negative
- ~80 lines of fetch call logic in MCP executors mirrors existing tool/executor code (intentional — keeps MCP as independent execution path)
- Users must opt into scheduled actions before MCP Token Vault tools work (could be confusing without clear error messaging — addressed with "Enable scheduled actions" error)
- Synchronous CIBA polling blocks Vercel function for up to 50 seconds per write tool call

### Neutral
- CRM write tools remain excluded from MCP (no Token Vault involvement, different consent model)
- CIBA access token (scoped to `openid`) is correctly discarded — used only as proof of consent, not for API calls

## Standards Alignment

The MCP trust spectrum (Action Center → Chat → MCP+CIBA → MCP read) maps to the three delegation patterns in [IETF draft-klrc-aiagent-auth-01](https://datatracker.ietf.org/doc/draft-klrc-aiagent-auth-01/): pre-authorized execution (Action Center review, MCP read-only), interactive delegation (Chat step-up, MCP+CIBA push consent), and autonomous operation within pre-configured trust boundaries.
