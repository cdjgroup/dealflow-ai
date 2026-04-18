# Devpost paste kit

Two ready-to-paste blocks for the Devpost submission description. Both are optimized for the **Insight Value** + **Security Model** criteria, pre-empt the most likely judge callout, and stay inside Devpost's 250-word blog-bonus floor.

---

## Opening block — lead with Insight Value (R5)

> ### Five bugs we filed / reproduced while building DealFlow
>
> An AI agent that's *authorized to act* needs three honest things: a consent model that actually fires, step-up auth that isn't spoofable, and telemetry when the gate misbehaves. Building DealFlow on Auth0 Token Vault + CIBA + MCP surfaced five bugs we now think of as free gifts for anyone else building in this space:
>
> 1. **[auth0-ai-js#175](https://github.com/auth0/auth0-ai-js/issues/175) — still OPEN.** The `@auth0/ai-vercel` wrapper swallows federated-connection errors and replaces them with a misleading "Authorization required" interrupt. We pulled out of the wrapper and call Auth0's `/oauth/token` directly so real failures surface; ADR 001 captures why.
> 2. **[vercel/ai#10980](https://github.com/vercel/ai/issues/10980) — still OPEN, fix PR [#12914](https://github.com/vercel/ai/pull/12914) unmerged.** The AI SDK's `needsApproval` flow drops `tool_result` blocks on approval, wedging Anthropic. Our `executeApprovedAndPatchDenied` runs server-side and is structurally identical to the community's best workaround. Three-layer defense documented in INSIGHTS #029 / #031.
> 3. **CIBA endpoints require form-urlencoded, not JSON** (not documented at the time) — discovered empirically, written up in INSIGHTS #011.
> 4. **CIBA `binding_message` charset is restricted to alphanumerics + `+-_.,:#@`** and truncates at 64 chars — discovered at runtime, documented in INSIGHTS #016, and the reason DealFlow sanitizes messages before sending.
> 5. **Auth0 Guardian serializes pushes per-user**, which makes "one push per action" infeasible for batch autonomy — hence DealFlow's single-push batch approval pattern (INSIGHTS #015).
>
> 31 total numbered insights live in [`docs/70-INSIGHTS.md`](./70-INSIGHTS.md). We figure the hackathon rewards surfacing them, not burying them.

---

## Threat-model block — pre-empt the bearer-token callout (R3)

> ### Threat model and trade-offs — MCP bearer tokens
>
> **Known limitation**: DealFlow's MCP API keys are unbound bearer tokens. A stolen key lets an attacker call write tools and wait for a Guardian push the user might approve if the `binding_message` reads plausibly.
>
> **Layered mitigations actually shipped:**
> - Per-client rate limits (`/api/mcp/clients` — configurable, enforced pre-execute)
> - **CIBA device consent required on every write tool** (`draftEmail`, `sendSlackMessage`, `createCalendarEvent`) — the push lands on the user's phone, not the attacker's
> - Per-client regex parameter constraints (recipient allowlists, channel allowlists) — ADR 008
> - Binding message names the action + the target, e.g., `"MCP: draft email to alice@acme.com"`
> - Full audit trail attributing every call to the client
> - Capability toggles — disabled tools are removed from the MCP advertise response, not just hidden
>
> **Production hardening path:** DPoP ([RFC 9449](https://datatracker.ietf.org/doc/html/rfc9449)) when MCP client SDKs add support. The [MCP 2026 roadmap](https://blog.modelcontextprotocol.io/posts/2026-mcp-roadmap/) has SEP-1932 (DPoP) and SEP-1933 (Workload Identity Federation) as active proposals, not yet in the 2025-11-25 spec. Until clients ship it, the binding_message + Guardian push + audit trail is our defense-in-depth, and we self-document the gap in [`docs/70-INSIGHTS.md`](./70-INSIGHTS.md) #024.
>
> We think the honest version of "Authorized to Act" says what the gate doesn't cover, not just what it does.

---

## Notes

- **Blog-bonus qualifier**: the threat-model block is >250 words when combined with the MCP+CIBA explanation. Include both blocks in the Devpost description and you qualify for the $250 Token Vault blog prize.
- **Don't paraphrase**: the specific bug numbers and spec-section references are load-bearing — they're what gives this "Insight Value" instead of "marketing copy." Swap URLs only if they 404.
