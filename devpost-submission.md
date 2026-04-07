# DealFlow — Devpost Submission

> Condensed submission text for Devpost form fields. See `docs/DEVPOST-DRAFT.md` for the full internal draft with screenshots checklist and extended details.

---

## Inspiration

AI agents that draft emails, schedule meetings, and post Slack updates are powerful — but dangerous without guardrails. Most AI agent frameworks treat authorization as an afterthought. We built DealFlow to prove an AI sales agent can be both powerful AND trustworthy: suggesting actions with clear justification, letting users review and edit before anything executes, and using Auth0 Token Vault so the AI never touches credentials. Then we went further — exposing the same secure pipeline to external AI agents via MCP, turning one app's security into a reusable pattern for the AI agent ecosystem.

## What it does

DealFlow is an AI sales assistant with a **graduated trust architecture** — four trust levels, three execution surfaces, one Auth0 Token Vault pipeline.

| Surface | Trust | Consent | Use Case |
|---------|-------|---------|----------|
| Action Center | Low | In-app review + edit | AI suggests, user reviews every action |
| Chat UI | Medium | Real-time + step-up | User directs, AI pauses for sensitive ops |
| MCP + CIBA | High | Phone push notification | External agent acts, user consents on device |
| MCP (read) | Autonomous | None needed | Read-only queries, no data modified |

**Action Center** — The AI analyzes your sales pipeline and generates prioritized suggestions (follow-up emails, demo meetings, Slack updates). Each includes the AI's reasoning and confidence score. Users review, edit drafts inline, and approve before execution. Scheduled batch execution via CIBA sends one Guardian push for all pending actions — approve on your phone, and everything executes within Token Vault's time-boxed window.

**Chat** — Natural language interface with multi-step tool orchestration. One prompt like "follow up with Sarah about the Acme deal" chains getDealDetails → searchEmails → checkCalendar → draftEmail — four Token Vault exchanges, one request. Step-up auth pauses for sensitive actions ($50K+ deals, terminal stages).

**MCP Server** — External AI agents (Claude Desktop, Cursor, custom agents) connect via `/api/mcp`. Per-client policies: each agent gets its own API key, trust tier, tool allowlist, rate limit, and parameter constraints. Write operations require CIBA device consent. Same Token Vault pipeline, same audit trail.

**Unified Security** — Disable Gmail in Permissions → blocked in Chat, Action Center, AND MCP. One control, consistent everywhere. Trust calibration suggests upgrading tools to auto-approve after 5+ approvals at >80% rate — but never auto-escalates.

## How we built it

Next.js 16 (App Router), Auth0 Token Vault, Claude Sonnet 4.6 via Vercel AI SDK v6, Upstash Redis, Model Context Protocol. Direct RFC 8693 token exchange and CIBA via HTTP — the `@auth0/ai-vercel` SDK swallows errors ([#175](https://github.com/auth0/auth0-ai-js/issues/175)), so we call Auth0 endpoints directly for full observability.

Built in 5 days (March 31 – April 5, 2026). 250+ commits, 310+ tests, 9 ADRs, 27 documented insights.

## Challenges we ran into

1. **SDK error swallowing** — `@auth0/ai-vercel` v5's `TokenVaultAuthorizerBase` silently returns `undefined` on failed exchanges, masking the real Auth0 API error. Fix: direct HTTP to `/oauth/token`.
2. **Token Vault tokenset deletion doesn't revoke access** — Auth0 silently re-provisions. Fix: application-level disconnect via Redis flags.
3. **Token Vault doesn't support scope narrowing** — the `scope` parameter is ignored on federated exchanges. Fix: application-layer scope awareness.
4. **CIBA + Token Vault composition** — Auth0 documents them as separate pillars. No official guide combines CIBA as a gate before Token Vault exchange in a batch model. We wired them together.

## Accomplishments we're proud of

- **Graduated trust architecture**: Four trust levels, three surfaces, one Token Vault pipeline — security adapts to the surface's trust properties
- **CIBA batch scheduling**: One Guardian push approves all actions, time-boxed execution within the CIBA token's lifetime
- **Trust calibration**: System observes approval patterns and recommends autonomy upgrades — user decides, never auto-escalates
- **Confidence routing**: AI scores suggestions 0-1; high confidence auto-approves, low confidence forces review regardless of autonomy setting
- **Per-client MCP policies**: Each external agent gets its own API key, trust tier, tool allowlist, and parameter constraints
- **27 documented insights**: SDK bugs, Token Vault behaviors, CIBA patterns, and IETF alignment findings that benefit the Auth0 community
- **IETF draft alignment**: Our three surfaces implement the three delegation patterns from `draft-klrc-aiagent-auth-01` (March 2026)

## What we learned

Token Vault is a powerful primitive, but "Authorized to Act" requires more than token management:

1. **Users must see WHAT and WHY** — AI justifications make consent meaningful
2. **Controls must be consistent** — same rules across chat, queue, and MCP
3. **Trust should be earned** — the system suggests autonomy upgrades based on behavior, but never escalates without consent
4. **Security should be a property of the tool, not the UI** — adding a new surface shouldn't require rebuilding auth
5. **The pattern is reusable** — MCP turns app-level security into ecosystem-level security

## What's next

- Incremental authorization (request OAuth scopes only when needed)
- Multi-user workspaces with team-level policies
- Published OpenClaw integration example

## Built with

Auth0, Token Vault, CIBA, Next.js, React, TypeScript, Vercel AI SDK, Claude, Upstash Redis, Tailwind CSS, Framer Motion, Vercel, Model Context Protocol

---

## 📝 Bonus Blog Post: What We Learned Composing CIBA + Token Vault for Batch Agent Consent

> *Auth0 Token Vault discoveries from building a multi-surface AI sales agent.*

Auth0 Token Vault solves credential management. But when your AI agent operates across three different surfaces — chat, action queue, and MCP for external agents — you need more than tokens. You need consent that adapts.

**The gap we found:** Auth0 documents Token Vault and CIBA as separate features. We searched docs, SDKs, example repos, and Discord. Nobody had combined them — specifically, CIBA as an authorization gate *before* Token Vault token exchange in a batch model.

**So we built it.** A cron job gathers pending AI-suggested actions, sends one Guardian push — "DealFlow: 5 actions - 3 email, 2 calendar" — and on phone approval, exchanges tokens through Token Vault within the CIBA token's time-boxed window. One tap, batch execution, automatic expiry. This fills the gap between "always ask" and "never ask."

**What broke along the way:**
- The `@auth0/ai-vercel` SDK silently swallows token exchange errors — failed exchanges return "Authorization required" instead of the real Auth0 error. We filed [#175](https://github.com/auth0/auth0-ai-js/issues/175). Fix: call `/oauth/token` directly via RFC 8693.
- Deleting a tokenset doesn't revoke access — Auth0 silently re-provisions on the next exchange. Fix: application-level Redis flags.
- Token Vault ignores the `scope` parameter on federated exchanges. Fix: application-layer scope awareness per tool.

These aren't complaints — they're findings that save the next developer a day of debugging. All 27 insights documented with root cause and fix in our repo.
