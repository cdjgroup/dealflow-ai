# ADR 003: Application-Layer Scope Narrowing

**Status:** ACCEPTED
**Date:** 2026-04-03

## Context

DealFlow v0.3.0 needed a dynamic scope narrowing feature where the AI agent uses only the minimum required OAuth scopes for each tool operation, demonstrating voluntary least-privilege.

The initial assumption was that Auth0 Token Vault's federated connection exchange (RFC 8693) would accept a `scope` parameter to request narrowed scopes at exchange time.

Research (confirmed by Auth0 docs and `@auth0/ai` SDK source) revealed that the exchange endpoint does NOT accept a `scope` parameter. The response returns `scope` and `expires_in` fields, but the full consented scope set is always returned regardless.

## Decision

Implement scope narrowing at the application layer instead of the Auth0 token exchange level:

1. Capture `scope` and `expires_in` from the token exchange response (previously discarded)
2. Each tool declares its minimum required scope via `TOOL_SCOPE_CONFIG`
3. The UI shows which subset of granted scopes the tool actually uses
4. `buildTokenMeta` helper attaches scope metadata to tool results for audit and visualization

## Consequences

### Positive
- Demonstrates defense-in-depth: the agent voluntarily restricts itself beyond what the token enforces
- Single source of truth (`TOOL_SCOPE_CONFIG`) for tool scope metadata, used by scope indicator, lifecycle visualization, and audit trail
- No dependency on Auth0 API changes — works with any OAuth provider
- Better story for hackathon judges: "The AI reasons about its own permissions"

### Negative
- Scope narrowing is advisory, not enforced — the token still carries all consented scopes
- If a tool's actual API usage exceeds its declared `minScope`, no error is raised
- True server-side scope enforcement would require Auth0 to support per-request scope narrowing

### Neutral
- `TOOL_SCOPES` (used by ScopeIndicator) is now derived from `TOOL_SCOPE_CONFIG`, preventing drift between the two
- The `_tokenMeta` field flows through tool results to the audit pipeline; it also reaches the LLM context (accepted trade-off for hackathon)

## Standards Alignment

Application-layer scope narrowing follows the least-privilege delegation principle described in the individual IETF draft [draft-klrc-aiagent-auth-01](https://datatracker.ietf.org/doc/draft-klrc-aiagent-auth-01/), where agents should request only the minimum scopes required for the immediate operation even when broader grants are available.
