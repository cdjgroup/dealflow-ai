# DealFlow — Devpost Submission


## Inspiration

DealFlow was built to prove an AI agent can be both powerful AND trustworthy by suggesting actions with clear justification, letting users review and edit before anything executes, and using Auth0 Token Vault so the AI never touches credentials. Then it was extended by exposing the same secure pipeline to external AI agents via MCP, turning one app's security into a reusable pattern for the AI agent ecosystem.


## What it does

DealFlow follows a **graduated trust architecture** — four trust levels, three execution surfaces, one Auth0 Token Vault pipeline.

Graduated trust is the idea that not every AI action deserves the same level of scrutiny — and not every action deserves the same level of freedom either. Think about how trust works with a new employee. Day one, you don't hand them the company credit card and say "go for it." But you also don't make them get approval to send a calendar invite. You calibrate low-risk stuff to flow freely, high-stakes stuff gets a checkpoint, and over time as they prove themselves, the checkpoints relax. DealFlow does the same thing with an AI sales agent, but structurally baked into the architecture.

Four levels, from most autonomous to most controlled:

  **1. Autonomous read (MCP external agents)** — Checking a calendar, listing deals, searching contacts. No human in the loop. The data flows and nobody needs to tap anything. This is the equivalent of letting the new hire look at the shared drive.

  **2. High trust with device consent (MCP write + CIBA)** — An external AI agent wants to draft an email or book a meeting through your system. That's a real action in the real world with your name on it. So before it happens, your phone buzzes with a Guardian push notification describing exactly what's about to happen. One tap to approve and the action executes within a time-boxed window. You didn't have to be at your computer but, you did have to consciously say yes.
  
  **3. Collaborative with guardrails (Chat UI)** — You're in the conversation, directing the agent in real time. It can chain tools together ie. pull deal details, check your calendar, draft a follow-up email etd. If it tries to create a deal over $50K or close one as won, the system hits a speed bump. Step-up approval right in the chat, and for the really sensitive stuff, CIBA sends it to your phone too.
  
  **4. Maximum control (Action Center)** — The AI proposes actions based on what it sees in your pipeline: "you should email this prospect", "book a follow-up
   with that account", but it doesn't do anything. You see the draft, you can edit it word by word, and only when you explicitly hit approve does it execute through Token Vault. This is the "I want to see everything before it goes out" mode.

  The key insight: all four levels use the same Auth0 Token Vault pipeline underneath. It's not four different auth systems. It's one pipeline with consent gates that open or close based on how much trust the context warrants. The security adapts to the situation rather than forcing one-size-fits-all.

And it's not static. The system watches your approval patterns — if you've approved 5+ similar actions at high confidence, it nudges you: "hey, want to auto-approve these?" It never auto-escalates its own permissions, but it does suggest relaxing yours. Trust grows over time, just like it does with people.

| Surface | Trust | Consent | Use Case |
|---------|-------|---------|----------|
| Action Center | Low | In-app review + edit | AI suggests, user reviews every action |
| Chat UI | Medium | Real-time + step-up | User directs, AI pauses for sensitive ops |
| MCP + CIBA | High | Phone push notification | External agent acts, user consents on device |
| MCP (read) | Autonomous | None needed | Read-only queries, no data modified |

### **Key Features**

**Action Center** — The AI analyzes your sales pipeline and generates prioritized suggestions (follow-up emails, demo meetings, Slack updates). Each includes the AI's reasoning and confidence score. Users review, edit drafts inline, and approve before execution. Scheduled batch execution via CIBA sends one Guardian push for all pending actions — approve on your phone, and everything executes within Token Vault's time-boxed window.

**Chat** — Natural language interface with multi-step tool orchestration. One prompt like "follow up with Sarah about the Acme deal" chains getDealDetails → searchEmails → checkCalendar → draftEmail — four Token Vault exchanges, one request. Step-up auth pauses for sensitive actions ($50K+ deals, terminal stages).

**MCP Server** — External AI agents (Claude Desktop, Cursor, custom agents) connect via `/api/mcp`. Per-client policies: each agent gets its own API key, trust tier, tool allowlist, rate limit, and parameter constraints. Write operations require CIBA device consent. Same Token Vault pipeline, same audit trail.

**Unified Security** — Disable Gmail in Permissions → blocked in Chat, Action Center, AND MCP. One control, consistent everywhere. Trust calibration suggests upgrading tools to auto-approve after 5+ approvals at >80% rate — but never auto-escalates.

## How it was built it

Next.js 16 (App Router), Auth0 Token Vault, Claude Sonnet 4.6 via Vercel AI SDK v6, Upstash Redis, Model Context Protocol. Direct RFC 8693 token exchange and CIBA via HTTP — the `@auth0/ai-vercel` SDK swallows errors ([#175](https://github.com/auth0/auth0-ai-js/issues/175)), Auth0 endpoints called directly for full observability.

Built in 6 days (March 31 – April 6, 2026). 250+ commits, 310+ tests, 9 ADRs, 27 documented insights.

## Challenges encountered

1. **SDK error swallowing** — `@auth0/ai-vercel` v5's `TokenVaultAuthorizerBase` silently returns `undefined` on failed exchanges, masking the real Auth0 API error. Fix: direct HTTP to `/oauth/token`.
2. **Token Vault tokenset deletion doesn't revoke access** — Auth0 silently re-provisions. Fix: application-level disconnect via Redis flags.
3. **Token Vault doesn't support scope narrowing** — the `scope` parameter is ignored on federated exchanges. Fix: application-layer scope awareness.
4. **CIBA + Token Vault composition** — Auth0 documents them as separate pillars. No official guide combines CIBA as a gate before Token Vault exchange in a batch model. DealFlow wired them together.

## Accomplishments we're proud of

- **Graduated trust architecture**: Four trust levels, three surfaces, one Token Vault pipeline — security adapts to the surface's trust properties
- **IETF draft alignment**: DealFlow's three surfaces implement the three delegation patterns from`draft-klrc-aiagent-auth-01` (March 2026). Further, it implements 7 of 9 AIMS layers substantively, with the two gaps (SPIFFE workload identity and hardware attestation) being infrastructure-level concerns that the framework itself acknowledges are deployment-specific. Our strongest alignment is at Layer 6 (Authorization), implementing all delegation scenarios: RFC 8693 token exchange, CIBA human-in-the-loop, step-up auth, and surface-aware trust graduation. This is the layer the framework spends the most time on, and it's where our implementation is most complete.
- **CIBA batch scheduling**: One Guardian push approves all actions, time-boxed execution within the CIBA token's lifetime
- **Trust calibration**: System observes approval patterns and recommends autonomy upgrades and user decides, never auto-escalating on its own
- **Confidence routing**: AI scores suggestions where users can elect to have high confidence auto-approve and/or low confidence forced reviews regardless of autonomy setting
- **Per-client MCP policies**: Each external agent gets its own API key, trust tier, tool allowlist, and parameter constraints
- **27 documented insights**: SDK bugs, Token Vault behaviors, CIBA patterns, and IETF alignment findings that benefit the Auth0 community


## What was learned

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

Token Vault handles the hard problem of credential management. But Token Vault answers "how does an AI agent get my credentials?" The harder question is: **"How do I control what happens with those credentials across a growing ecosystem of AI interfaces?"**

DealFlow didn't approach this as a yes or no but as a trust spectrum called **graduated trust**. Graduated trust is the idea that not every AI action deserves the same level of scrutiny — and not every action deserves the same level of freedom either. Think about how trust works with a new employee. Day one, you don't hand them the company credit card and say "go for it." But you also don't make them get approval to send a calendar invite. You calibrate low-risk stuff to flow freely, high-stakes stuff gets a checkpoint, and over time as they prove themselves, the checkpoints relax. DealFlow does the same thing with an AI sales agent, but structurally baked into the architecture.

Four levels, from most autonomous to most controlled:

  **1. Autonomous read (MCP external agents)** — Checking a calendar, listing deals, searching contacts. No human in the loop. The data flows and nobody needs to tap anything. This is the equivalent of letting the new hire look at the shared drive.

  **2. High trust with device consent (MCP write + CIBA)** — An external AI agent wants to draft an email or book a meeting through your system. That's a real action in the real world with your name on it. So before it happens, your phone buzzes with a Guardian push notification describing exactly what's about to happen. One tap to approve and the action executes within a time-boxed window. You didn't have to be at your computer but, you did have to consciously say yes.
  
  **3. Collaborative with guardrails (Chat UI)** — You're in the conversation, directing the agent in real time. It can chain tools together ie. pull deal details, check your calendar, draft a follow-up email etd. If it tries to create a deal over $50K or close one as won, the system hits a speed bump. Step-up approval right in the chat, and for the really sensitive stuff, CIBA sends it to your phone too.
  
  **4. Maximum control (Action Center)** — The AI proposes actions based on what it sees in your pipeline: "you should email this prospect", "book a follow-up
   with that account", but it doesn't do anything. You see the draft, you can edit it word by word, and only when you explicitly hit approve does it execute through Token Vault. This is the "I want to see everything before it goes out" mode.

  The key insight: all four levels use the same Auth0 Token Vault pipeline underneath. It's not four different auth systems. It's one pipeline with consent gates that open or close based on how much trust the context warrants. The security adapts to the situation rather than forcing one-size-fits-all.

And it's not static. The system watches your approval patterns — if you've approved 5+ similar actions at high confidence, it nudges you: "hey, want to auto-approve these?" It never auto-escalates its own permissions, but it does suggest relaxing yours. Trust grows over time, just like it does with people.

- **Action Center (low trust)**: The AI suggests actions with confidence scores and justification. The user reviews every suggestion, edits drafts inline, and approves individually. Nothing executes without explicit consent.
- **Chat (medium trust)**: The user directs the AI in real-time. The AI confirms with the user before executing write actions (Slack, email, calendar). High-value operations (>$50K deals, terminal stages) trigger CIBA Guardian push for device-level consent.
- **MCP with CIBA (high trust)**: External agents can execute write operations, but every write triggers a Guardian push notification to the user's phone. The user approves on their device without opening the app.
- **MCP read-only (autonomous)**: Read queries execute without consent. No data is modified.

**The key insight: security is a property of the tool, not the interface.** Each tool in DealFlow declares its own requirements — which OAuth scopes it needs, whether it requires approval, what its risk level is. When we added the MCP endpoint, we didn't write new security code. The MCP surface declared its trust properties (no interactive approval UI), and tools that require approval filtered themselves out — until we added CIBA as a consent mechanism, which re-enabled write tools with device-level gating.

**CIBA + Token Vault: a combination nobody documented.** Auth0 publishes Token Vault and CIBA as separate features. We couldn't find any official guide, SDK example, or community project that combines them — CIBA as an authorization gate before Token Vault token exchange, in a batch execution model. Our scheduled execution flow works like this: a Vercel cron job finds users who opted into a review time, sends a single CIBA Guardian push describing the batch ("DealFlow: 5 actions - 3 email, 2 calendar"), and on approval, exchanges stored refresh tokens through Token Vault to execute each action within the CIBA token's time-boxed window. This pattern enables autonomous agent action with device-level human consent — the missing piece between "always ask" and "never ask."

**Trust calibration closes the loop.** The Action Center records every approval, edit, and dismissal per tool type. After 5+ decisions at >80% approval rate, the system suggests upgrading that tool to auto-approve. But it never auto-escalates — even the system's recommendation requires explicit user consent. The AI's own confidence scores add another dimension: actions above 85% confidence auto-approve, actions below 50% force manual review regardless of the user's autonomy setting. The result is a trust model that adapts to both user behavior and AI uncertainty.

**Mapping to emerging standards.** Our three-surface model independently arrived at the same architecture proposed in IETF `draft-klrc-aiagent-auth-01` (March 2026, co-authored by OpenAI engineers): user-delegated authorization (Chat), pre-authorized agent action (Action Center), and agent-to-agent access (MCP). The graduated trust spectrum also aligns with EU AI Act Article 14 (Human Oversight, effective August 2026), which requires human oversight proportional to action sensitivity — exactly what our confidence-based routing provides.

**The pattern is reusable.** Any application with Auth0 Token Vault can expose tools via MCP. Our per-client policy system gives each external agent its own API key, trust tier, tool allowlist, and parameter constraints. The Security Model adapts per client: a trusted IDE gets full access, a CI pipeline gets read-only CRM, a research bot gets email search constrained to specific domains. Adding a new agent doesn't require new security code — just a new client with the right policy.

**What was found along the way.** 27 insights were captured during development, including:
- The `@auth0/ai-vercel` SDK silently swallows token exchange errors ([#175](https://github.com/auth0/auth0-ai-js/issues/175))
- Token Vault tokenset deletion doesn't prevent re-provisioning
- Token Vault doesn't accept a `scope` parameter on federated exchanges
- CIBA binding messages have strict character restrictions that aren't documented clearly
- MCP endpoints need every security layer the primary endpoint has: capability filtering, approval checks, audit attribution

All documented with technical details, root cause, and fix in our `docs/70-INSIGHTS.md`.

**The bottom line.** "Authorized to Act" isn't a single mechanism. It's a spectrum  from full human review to autonomous read access, with CIBA device consent and confidence-based routing in between. Auth0 Token Vault provides the credential management. The application provides the trust model. Together, they make AI agents that are both powerful and trustworthy.

---

*DealFlow: 250+ commits, 310+ tests, 9 ADRs, 27 insights. Built in 6 days.*
*Live: https://dealflow-ai-seven.vercel.app | Code: https://github.com/cdjgroup/dealflow-ai*

---

## Testing Instructions (for judges)

A demo Google account is provided so you can test the full Auth0 Token Vault integration without using your own credentials:

- **Email:** Demouser.ai.a
- **Password:** Claudec0deisthebest

Log in at https://dealflow-ai-seven.vercel.app using "Continue with Google" with these credentials. The account has pre-seeded calendar events and emails for the demo flow. Click "Reseed Demo Data" on the dashboard to reset CRM data and action suggestions at any time (Note: Use "Clear All" on Actions page first). Also note the MCP Playground on the MCP page where, after creating an MCP client, you can verify with tests.
