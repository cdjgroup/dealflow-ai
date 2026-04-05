# ADR 008: Per-Client MCP Policy System

**Status:** ACCEPTED
**Date:** 2026-04-05

## Context

DealFlow AI exposes an MCP (Model Context Protocol) server so external AI agents (Cursor, Windsurf, CI pipelines) can call read-only tools. Before v0.6.0, all MCP clients shared identical access — any valid Auth0 bearer token granted the same tool set with the same rate limits. There was no way to give Cursor IDE full CRM + calendar access while restricting a CI pipeline to CRM-only reads.

The MCP specification (2025-03-26) defines no per-client policy mechanism. The protocol handles tool discovery (`tools/list`) and execution (`tools/call`) but has no concept of client identity, trust tiers, or per-client tool filtering. Authentication is delegated to the transport layer, which provides a single `AuthInfo` object — useful for identifying *who* the caller is, but not for expressing *what* they should be allowed to do.

Three approaches were evaluated:

1. **Minimal (scope-only)**: Derive scopes from user settings at auth time. All clients of the same user share identical access. No per-client differentiation.
2. **Custom per-client policy (chosen)**: API key system with per-client trust tiers, tool allowlists, and rate limits stored in Redis. Dual auth path — API keys for named clients, Auth0 tokens for default access.
3. **Wait for MCP spec**: Defer until the MCP spec adds native per-client policy support. Ship without client differentiation.

## Decision

Build a custom per-client policy layer on top of MCP's transport-level auth. Each MCP client gets:

- **Unique API key** (`dfk_` prefix) with SHA-256 hash storage in Redis
- **Trust tier** (full/standard/restricted/readonly) determining the ceiling of available tool categories
- **Tool allowlist** per client, intersected with the MCP surface policy (the surface policy is always the ceiling — a client can never exceed it)
- **Per-client rate limit** enforced at tool execution time
- **Usage analytics** (call counts, last-used timestamps) for cross-surface telemetry

Auth pipeline is dual-path:
- `dfk_`-prefixed tokens → hash lookup → per-client policy from Redis
- All other tokens → Auth0 `/userinfo` → scope derivation from surface policy + user capability toggles

Three-layer enforcement in the tool handler:
1. **Registration (server init)**: Only tools allowed by the MCP surface policy are registered
2. **Scope check (per-request)**: Derived scopes validated against tool category
3. **Client policy (per-request)**: Named clients get additional allowlist filtering and rate limiting

## Consequences

### Positive
- External AI agents can be granted least-privilege access — a CI pipeline gets CRM-read only, an IDE gets full read access
- Trust tiers provide a simple mental model for non-technical users configuring client access
- API keys are hashed (SHA-256) at rest — key exposure doesn't compromise stored credentials
- Surface policy remains the ceiling — per-client overrides can only narrow, never widen
- Audit trail captures per-client attribution (`mcpClientId`, `mcpClientName`, `surface: "mcp"`) enabling cross-surface telemetry
- Backward compatible — existing Auth0 bearer token users get "default" client treatment with no configuration changes

### Negative
- Custom policy system adds complexity that native MCP support would handle at the protocol level if/when it ships
- API key lifecycle (rotation, revocation) is manual — no automated rotation or expiry
- Trust tier → tool category mapping is hardcoded in `TRUST_TIER_CATEGORIES` — adding a new tier requires a code change
- Per-client rate limits are per-client-per-tool, not per-client-aggregate — a client could still make many calls across different tools within limits

### Neutral
- API key management UI is part of the MCP Clients dashboard — no separate admin surface needed
- The approach mirrors how cloud providers handle API key scoping, which is familiar to developers
- If MCP spec adds native per-client policy, migration path is straightforward — replace Redis policy lookups with spec-compliant metadata
