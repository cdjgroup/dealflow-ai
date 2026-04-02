# ADR 001: Direct Token Exchange vs @auth0/ai-vercel SDK Wrapper

**Status:** ACCEPTED
**Date:** 2026-04-02

## Context

DealFlow AI uses Auth0 Token Vault to access Google Calendar and Gmail on behalf of users. The `@auth0/ai-vercel` SDK (v5.1.0) provides a `withTokenVault()` wrapper that should handle the OAuth token exchange automatically. However, the SDK was built for Vercel AI SDK v5, and our project uses AI SDK v6.

The SDK wrapper's `protect` method silently threw errors instead of passing Google access tokens to the tool's `execute` function. Debugging revealed that the wrapper intercepted execution before `execute` ran, and `getAccessTokenFromTokenVault()` (which reads from AsyncLocalStorage context) was never populated. No interrupt was thrown either — the error was swallowed by the streaming response.

## Decision

Bypass the `@auth0/ai-vercel` SDK wrapper entirely and call Auth0's `/oauth/token` endpoint directly using the RFC 8693 federated connection access token exchange grant type.

Each tool (calendar.ts, gmail.ts) has a `getGoogleToken()` helper that:
1. Gets the Auth0 refresh token from the session
2. Calls `POST /oauth/token` with `grant_type: urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token`
3. Returns the Google access token or an error message

## Consequences

### Positive
- Token Vault works reliably with AI SDK v6
- Full control over error handling (no silent failures)
- Transparent — every HTTP call is visible and debuggable
- No dependency on SDK internals or AsyncLocalStorage context

### Negative
- `getGoogleToken()` is duplicated in calendar.ts and gmail.ts (should be extracted)
- `@auth0/ai-vercel` and `@auth0/ai` remain as unused dependencies
- We lose the SDK's built-in interrupt flow for consent popups (replaced with explicit ConnectGoogle button)

### Neutral
- The Auth0 token exchange API is stable (RFC 8693) — unlikely to change
- When `@auth0/ai-vercel` ships AI SDK v6 support, we can migrate back to the wrapper
