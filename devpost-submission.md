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

Built in 7 days (March 31 – April 6, 2026). 380+ commits, 700+ tests, 11 ADRs, 31 documented insights.

## Challenges encountered

1. **SDK error swallowing** — `@auth0/ai-vercel` v5's `TokenVaultAuthorizerBase` silently returns `undefined` on failed exchanges, masking the real Auth0 API error. Fix: direct HTTP to `/oauth/token`.
2. **Token Vault tokenset deletion doesn't revoke access** — Auth0 silently re-provisions. Fix: application-level disconnect via Redis flags.
3. **Token Vault doesn't support scope narrowing** — the `scope` parameter is ignored on federated exchanges. Fix: application-layer scope awareness.
4. **CIBA + Token Vault composition** — Auth0 documents them as separate pillars. No official guide combines CIBA as a gate before Token Vault exchange in a batch model. DealFlow wired them together.

## Accomplishments we're proud of

- **Graduated trust architecture**: Four trust levels, three surfaces, one Token Vault pipeline — security adapts to the surface's trust properties
- **IETF draft alignment**: DealFlow's three surfaces loosely map to the delegation patterns described in individual Internet-Draft `draft-klrc-aiagent-auth-01` (March 2026): user-delegated (Chat), pre-authorized (Action Center), and agent-to-agent (MCP). Our strongest area is authorization — RFC 8693 token exchange, CIBA human-in-the-loop, step-up auth, and surface-aware trust graduation. Note: this is an individual draft, not adopted IETF consensus.
- **CIBA batch scheduling**: One Guardian push approves all actions, time-boxed execution within the CIBA token's lifetime
- **Trust calibration**: System observes approval patterns and recommends autonomy upgrades and user decides, never auto-escalating on its own
- **Confidence routing**: AI scores suggestions where users can elect to have high confidence auto-approve and/or low confidence forced reviews regardless of autonomy setting
- **Per-client MCP policies**: Each external agent gets its own API key, trust tier, tool allowlist, and parameter constraints
- **31 documented insights**: SDK bugs, Token Vault behaviors, CIBA patterns, and findings that benefit the Auth0 community


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
- Published reference integration examples for external MCP agents

## Built with

Auth0, Token Vault, CIBA, Next.js, React, TypeScript, Vercel AI SDK, Claude, Upstash Redis, Tailwind CSS, Framer Motion, Vercel, Model Context Protocol

---

## 📝 Bonus Blog Post: What We Learned Composing CIBA + Token Vault for Batch Agent Consent

> *Auth0 Token Vault discoveries from building a multi-surface AI sales agent.*

Auth0 Token Vault solves credential management. But when your AI agent operates across three different surfaces — chat, action queue, and MCP for external agents — you need more than tokens. You need consent that adapts.

**The gap we found:** Auth0 documents Token Vault and CIBA as separate features. We looked through docs, SDKs, example repos, and Discord but couldn't find anyone combining them — specifically, using CIBA as an authorization gate *before* Token Vault token exchange in a batch model. Maybe someone has and we missed it, but we couldn't find a reference.

**So we tried it.** The idea was straightforward: a cron job gathers pending AI-suggested actions, sends one Guardian push — "DealFlow: 5 actions - 3 email, 2 calendar, 1 slack" — and on phone approval, exchanges tokens through Token Vault within the CIBA token's time-boxed window. One tap, batch execution, automatic expiry. Our attempt at filling the gap between "always ask" and "never ask."

Getting there was less straightforward. CIBA's `/bc-authorize` endpoint expects `application/x-www-form-urlencoded` (not JSON like the Token Vault exchange endpoint), the `binding_message` field has a strict 64-character limit with a narrow character allowlist — no `@` signs, so email addresses in approval messages get rejected at runtime. The `login_hint` is a JSON string passed as a form field, so you're double-encoding. None of this was obvious from the docs; we found it by reading the `auth0` SDK source and hitting errors.

The bigger architectural realization: the CIBA access token you get back is scoped to `openid` only — it's proof of consent, not an API token. You still need the user's stored refresh token exchanged through Token Vault to actually call Gmail or Google Calendar. So the pattern is really "CIBA for consent, Token Vault for execution," and the CIBA token's expiry becomes a natural time-box for the whole batch.

This also turned out to be the key to making MCP write operations work. MCP is stateless request-response — there's no approval UI. Our initial assumption was that MCP had to be read-only. But CIBA doesn't need a UI at all; it sends consent to a separate device. So now an external AI agent can request a write action through MCP, the user's phone buzzes with what's about to happen, and one tap either approves or blocks it. Same Token Vault pipeline underneath, same audit trail.

**What broke along the way:**
- The `@auth0/ai-vercel` SDK silently swallows token exchange errors — failed exchanges return "Authorization required" instead of the real Auth0 error. We filed [#175](https://github.com/auth0/auth0-ai-js/issues/175). Fix: call `/oauth/token` directly via RFC 8693.
- Deleting a tokenset doesn't revoke access — Auth0 silently re-provisions on the next exchange. Fix: application-level Redis flags.
- Token Vault ignores the `scope` parameter on federated exchanges. Fix: application-layer scope awareness per tool.
- Vercel serverless functions can't poll for 5 minutes waiting for phone approval. Fix: two-phase cron — one job initiates CIBA, a separate per-minute job polls for approval and executes.
- Guardian only processes one CIBA push per user at a time. Per-action pushes don't scale. Fix: batch all pending actions into a single push.

None of these are complaints — they're the kind of findings we wish we'd had on day one, and hopefully they save the next developer some debugging time. All 31 insights documented with root cause and fix in our repo.

---

## Testing Instructions (for judges)

A demo Google account is provided so you can test the full Auth0 Token Vault integration without using your own credentials:

- **Email:** Demouser.ai.a
- **Password:** Claudec0deisthebest

Log in at https://dealflow-ai-seven.vercel.app using "Continue with Google" with these credentials. The account has pre-seeded calendar events and emails for the demo flow. Click "Reseed Demo Data" on the chat page (bottom right) to reset CRM data and action suggestions at any time (Note: Use "Clear All" on Actions page first). Also note the MCP Playground on the MCP page where, after creating an MCP client, you can verify with tests.
