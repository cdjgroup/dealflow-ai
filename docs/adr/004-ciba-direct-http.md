# ADR 004: CIBA via Direct HTTP vs @auth0/ai SDK Wrapper

**Status:** ACCEPTED
**Date:** 2026-04-04

## Context

DealFlow AI needs device-level step-up authentication for high-value actions ($50K+ deals, terminal stage changes). Auth0 supports CIBA (Client-Initiated Backchannel Authentication) which sends push notifications to the user's phone via Guardian for out-of-band approval.

The `@auth0/ai` package (v6.0.0, installed as a dependency) provides `withAsyncAuthorization()` — a tool wrapper that manages the CIBA lifecycle (initiate, poll, interrupt/resume, store). However, ADR 001 established that the `@auth0/ai-vercel` SDK wrapper is incompatible with AI SDK v6's tool execution model. The `withAsyncAuthorization()` wrapper follows the same architectural pattern (intercepting tool execution via higher-order functions) and carries similar compatibility risk.

Three approaches were evaluated:
1. **Minimal**: Direct HTTP, chat only, reuse TokenVaultInterrupt pattern
2. **SDK-based**: Use `@auth0/ai`'s `withAsyncAuthorization()` wrapper
3. **Pragmatic**: Direct HTTP with clean abstractions, full Action Center support

## Decision

Use direct HTTP calls to Auth0's backchannel endpoints, following the ADR 001 pattern. Create a dedicated `src/lib/ciba/` module with clean separation of concerns:
- `authorize.ts` — POST to `/bc-authorize` with form-urlencoded body
- `poll.ts` — POST to `/oauth/token` with CIBA grant type
- `should-require.ts` — pure function for threshold logic
- `session.ts` — Redis-backed session management

Integrate via the existing interrupt pattern: JSON error thrown from tool execution → `parseInterrupt()` in chat-window → CibaWaitingCard component → `regenerate()` on approval.

## Consequences

### Positive
- Zero SDK compatibility risk — proven direct HTTP pattern
- Full control over CIBA lifecycle (initiation, polling, session caching)
- Clean module boundaries — each CIBA concern is a separate file
- Reuses existing interrupt pattern (no new architectural concepts)
- Redis sessions solve the regeneration re-initiation problem cleanly

### Negative
- Must maintain Auth0 endpoint contracts manually (no SDK abstraction)
- Form-urlencoded encoding differs from Token Vault's JSON (cognitive overhead)
- No access to future `@auth0/ai` improvements for CIBA (e.g., interrupt mode, credential caching)

### Neutral
- The `@auth0/ai` package remains installed (used by other dependencies) but CIBA-specific features are unused
- If Auth0 fixes SDK v6 compatibility, migration path is straightforward — replace direct HTTP calls with SDK wrapper
