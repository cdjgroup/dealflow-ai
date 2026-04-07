# ADR 001: Direct Token Exchange vs @auth0/ai-vercel SDK Wrapper

**Status:** ACCEPTED
**Date:** 2026-04-02

## Context

DealFlow uses Auth0 Token Vault to access Google Calendar and Gmail on behalf of users. The `@auth0/ai-vercel` SDK provides a `withTokenVault()` wrapper that handles OAuth token exchange automatically.

During initial development (April 2, 2026), we encountered silent failures when integrating the wrapper. The SDK's `TokenVaultAuthorizerBase` swallows federated connection errors — when the HTTP token exchange fails, it silently returns `undefined` instead of surfacing the actual error ([auth0-ai-js#175](https://github.com/auth0/auth0-ai-js/issues/175), still open). This `undefined` flows into `validateToken()`, which throws a `TokenVaultInterrupt` with a misleading "Authorization required" message — making it appear the user hasn't authorized, when the real problem could be misconfigured credentials, wrong connection name, or an expired refresh token.

This error-swallowing behavior made Token Vault debugging nearly impossible during setup. Additionally, the direct approach yields richer metadata (scope, TTL, connection) that powers the token lifecycle visualization and audit trail.

**Note:** The `@auth0/ai-vercel` SDK added AI SDK v6 support in v5.0.0 (January 29, 2026, [PR #338](https://github.com/auth0/auth0-ai-js/pull/338)). The version incompatibility we initially encountered is resolved, but the error-swallowing issue remains the primary reason we chose direct exchange.

## Decision

Call Auth0's `/oauth/token` endpoint directly using Auth0's federated connection access token exchange grant type (a custom grant inspired by RFC 8693), via a shared `exchangeToken()` utility (`src/lib/token-exchange.ts`).

The utility:
1. Gets the Auth0 refresh token from the session
2. Calls `POST /oauth/token` with `grant_type: urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token`
3. On failure, surfaces the actual Auth0 error message (not a generic interrupt)
4. On success, returns the access token plus metadata (scope, expiresIn, connection, exchangedAt)

## Consequences

### Positive
- Full error observability — actual Auth0 API errors surfaced to developers and users
- Rich token metadata (scope, TTL, connection) enables lifecycle visualization and audit trail
- Transparent — every HTTP call is visible and debuggable
- No dependency on SDK internals or AsyncLocalStorage context
- Same `exchangeToken()` works across all three surfaces (chat, Action Center, MCP)

### Negative
- Must maintain Auth0 endpoint contracts manually (no SDK abstraction layer)
- We lose the SDK's built-in interrupt flow for consent popups (replaced with explicit ConnectGoogle button)

### Neutral
- The Auth0 token exchange API is stable (Auth0's custom grant extends RFC 8693 patterns) — unlikely to change
- The error-swallowing issue (#175) may be fixed in a future SDK release, at which point migration back to the wrapper would be viable

## Standards Alignment

This decision follows the delegation transparency principle described in the individual IETF draft [draft-klrc-aiagent-auth-01](https://datatracker.ietf.org/doc/draft-klrc-aiagent-auth-01/), which recommends that AI agent frameworks maintain full observability of token exchange flows rather than abstracting away authorization errors behind opaque interrupts.
