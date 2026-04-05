# DealFlow AI — Devpost Submission

> Condensed submission text for Devpost form fields. See `docs/DEVPOST-DRAFT.md` for the full internal draft with screenshots checklist and extended details.

---

## Inspiration

AI agents that draft emails, schedule meetings, and post Slack updates are powerful — but dangerous without guardrails. Most AI agent frameworks treat authorization as an afterthought. We built DealFlow AI to prove an AI sales agent can be both powerful AND trustworthy: suggesting actions with clear justification, letting users review and edit before anything executes, and using Auth0 Token Vault so the AI never touches credentials. Then we went further — exposing the same secure pipeline to external AI agents via MCP, turning one app's security into a reusable pattern for the AI agent ecosystem.

## What it does

DealFlow AI is an AI sales assistant with a **graduated trust architecture** — four trust levels, three execution surfaces, one Auth0 Token Vault pipeline.

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

## Bonus Blog Post

### Graduated Trust: What "Authorized to Act" Really Means for AI Agents

Every entry in this hackathon integrates Auth0 Token Vault. That's table stakes — Token Vault handles the hard problem of credential management. But Token Vault answers "how does an AI agent get my credentials?" The harder question is: **"How do I control what happens with those credentials across a growing ecosystem of AI interfaces?"**

We spent five days building DealFlow AI and discovered that the answer isn't a single mechanism — it's a spectrum. We call it **graduated trust**.

**The problem with binary authorization.** Most AI agent frameworks offer two modes: the agent can act, or it can't. But real-world authorization is contextual. When I'm in a chat with the AI, I want it to check my calendar immediately (low risk) but pause before emailing a client (high risk). When I've scheduled the AI to review my pipeline overnight, I want one phone approval for the whole batch, not 12 separate prompts. When an external agent queries my CRM via MCP, I want read access but not write access — unless it goes through CIBA device consent.

**Four trust levels, one pipeline.** DealFlow AI implements four distinct trust levels across three execution surfaces, all sharing one Auth0 Token Vault pipeline:

- **Action Center (low trust)**: The AI suggests actions with confidence scores and justification. The user reviews every suggestion, edits drafts inline, and approves individually. Nothing executes without explicit consent.
- **Chat (medium trust)**: The user directs the AI in real-time. Most operations proceed immediately, but sensitive actions (>$50K deals, terminal stages) trigger step-up approval via AI SDK's `needsApproval`.
- **MCP with CIBA (high trust)**: External agents can execute write operations, but every write triggers a Guardian push notification to the user's phone. The user approves on their device without opening the app.
- **MCP read-only (autonomous)**: Read queries execute without consent. No data is modified.

**The key insight: security is a property of the tool, not the interface.** Each tool in DealFlow declares its own requirements — which OAuth scopes it needs, whether it requires approval, what its risk level is. When we added the MCP endpoint, we didn't write new security code. The MCP surface declared its trust properties (no interactive approval UI), and tools that require approval filtered themselves out — until we added CIBA as a consent mechanism, which re-enabled write tools with device-level gating.

**CIBA + Token Vault: a combination nobody documented.** Auth0 publishes Token Vault and CIBA as separate features. We couldn't find any official guide, SDK example, or community project that combines them — CIBA as an authorization gate before Token Vault token exchange, in a batch execution model. Our scheduled execution flow works like this: a Vercel cron job finds users who opted into a review time, sends a single CIBA Guardian push describing the batch ("DealFlow: 5 actions - 3 email, 2 calendar"), and on approval, exchanges stored refresh tokens through Token Vault to execute each action within the CIBA token's time-boxed window. This pattern enables autonomous agent action with device-level human consent — the missing piece between "always ask" and "never ask."

**Trust calibration closes the loop.** The Action Center records every approval, edit, and dismissal per tool type. After 5+ decisions at >80% approval rate, the system suggests upgrading that tool to auto-approve. But it never auto-escalates — even the system's recommendation requires explicit user consent. The AI's own confidence scores add another dimension: actions above 85% confidence auto-approve, actions below 50% force manual review regardless of the user's autonomy setting. The result is a trust model that adapts to both user behavior and AI uncertainty.

**Mapping to emerging standards.** Our three-surface model independently arrived at the same architecture proposed in IETF `draft-klrc-aiagent-auth-01` (March 2026, co-authored by OpenAI engineers): user-delegated authorization (Chat), pre-authorized agent action (Action Center), and agent-to-agent access (MCP). The graduated trust spectrum also aligns with EU AI Act Article 14 (Human Oversight, effective August 2026), which requires human oversight proportional to action sensitivity — exactly what our confidence-based routing provides.

**The pattern is reusable.** Any application with Auth0 Token Vault can expose tools via MCP. Our per-client policy system gives each external agent its own API key, trust tier, tool allowlist, and parameter constraints. The Security Model adapts per client: a trusted IDE gets full access, a CI pipeline gets read-only CRM, a research bot gets email search constrained to specific domains. Adding a new agent doesn't require new security code — just a new client with the right policy.

**What we found along the way.** We documented 27 non-obvious insights during development, including:
- The `@auth0/ai-vercel` SDK silently swallows token exchange errors ([#175](https://github.com/auth0/auth0-ai-js/issues/175))
- Token Vault tokenset deletion doesn't prevent re-provisioning
- Token Vault doesn't accept a `scope` parameter on federated exchanges
- CIBA binding messages have strict character restrictions that aren't documented clearly
- MCP endpoints need every security layer the primary endpoint has — capability filtering, approval checks, audit attribution

These aren't complaints. They're the kind of findings that help the Auth0 community build more robust agent integrations. Every one is documented with technical details, root cause, and fix in our `docs/70-INSIGHTS.md`.

**The bottom line.** "Authorized to Act" isn't a single mechanism. It's a spectrum — from full human review to autonomous read access, with CIBA device consent and confidence-based routing in between. Auth0 Token Vault provides the credential management. The application provides the trust model. Together, they make AI agents that are both powerful and trustworthy.

---

*DealFlow AI: 250+ commits, 310+ tests, 9 ADRs, 27 insights. Built in 5 days.*
*Live: https://dealflow-ai-seven.vercel.app | Code: https://github.com/cdjgroup/dealflow-ai*
