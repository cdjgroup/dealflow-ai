# What We Learned Building Security-First AI Agents with Auth0 Token Vault

*Building DealFlow AI for the Authorized to Act hackathon taught us that the hardest part of agentic AI isn't the LLM — it's answering the question: "What is this agent allowed to do, and who decides?"*

## The Problem Nobody Talks About

Most AI agent demos follow the same pattern: connect an LLM to some tools, add OAuth, ship it. The agent can do anything the tokens allow, and the user's only control is whether to connect their account at all — an all-or-nothing choice.

In production, that's not good enough. When an AI agent can create $85,000 deals in your CRM, draft emails to your CEO, and post to your team's Slack channel, you need layered security — not just "is the token valid?"

## Our Security Layering Model

DealFlow AI is a sales agent powered by Claude that manages pipeline, checks calendars, drafts emails, and sends Slack updates. Under the hood, every request passes through six security layers before a tool can execute:

1. **CSRF validation** — Mutation endpoints require the `X-Requested-With` header, preventing cross-origin attacks
2. **Rate limiting** — 10 requests/minute per user via Upstash sliding window
3. **Capability filtering** — Users toggle individual tools ON/OFF. Disabled tools are removed from the LLM's tool set entirely — the agent doesn't know they exist, so it can't try to use them
4. **Step-up authorization** — High-value operations (deals over $50K, closing a deal as "won") trigger the AI SDK's `needsApproval` mechanism, requiring explicit user confirmation before execution
5. **Token Vault scoping** — Each tool requests only the OAuth scopes it needs. Calendar gets `calendar.readonly`. Gmail search gets `gmail.readonly`. Only email drafting requests `gmail.compose` — and only when the user has granted that scope
6. **Audit trail** — Every tool invocation is logged to Redis with sanitized parameters, viewable in a dashboard at `/dashboard/audit`

This isn't theoretical architecture — it's running code. The capability filter is 30 lines. The approval logic is 40 lines. The audit wrapper is a single `writeAuditEntry` call in the chat endpoint's `onToolCallFinish` callback. Simple primitives, composed deliberately.

## The CIBA Journey: From Per-Action to Batch Scheduled Consent

Our original plan included CIBA (Client Initiated Backchannel Authentication) for step-up authorization — the user would approve high-value operations via push notification on their phone through Auth0 Guardian. It's the gold standard for out-of-band consent.

We initially believed CIBA required an Auth0 Enterprise Plan, so we pivoted to the Vercel AI SDK v6's native `needsApproval` property:

```typescript
const createDeal = tool({
  needsApproval: async ({ value }) => value > 50000,
  execute: async (params) => { /* ... */ },
});
```

The SDK handles the full lifecycle: pausing execution, surfacing an approval request to the UI, collecting the user's response, and resuming or canceling. One property on the tool definition — elegant.

But we didn't stop at inline approval. We implemented CIBA via direct HTTP to Auth0's `/bc-authorize` endpoint for **scheduled batch execution**. Users configure review times (8am, 12pm, 5pm), and at each time the system sends a single Guardian push: "DealFlow: 5 actions - 3 email, 2 calendar." One approval executes all high/medium priority actions within the CIBA token's time-boxed window. A "Run Now" button lets users trigger batch execution on demand.

**The insight:** CIBA's real power for AI agents isn't per-action consent (that creates notification fatigue). It's **time-boxed delegation** — the user approves a batch, the token lifetime naturally bounds the execution window, and only pre-declared actions execute within it. The token expiry is the security boundary, not just a timeout.

## Two Connections, Not One

Auth0's Free Plan supports two Token Vault connections. Most implementations use one (Google). We used both — Google for Calendar and Gmail, Slack for team communication. This matters because it demonstrates the Token Vault pattern's extensibility. The same RFC 8693 token exchange flow works identically for both providers:

```typescript
// Same pattern, different connection name
const response = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
  body: JSON.stringify({
    grant_type: "urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token",
    connection: "slack",  // or "google-oauth2"
    // ... same parameters
  }),
});
```

Adding a third provider (GitHub, Salesforce, Microsoft) would be copy-paste with a new connection name and API calls. That's the Token Vault value proposition in action.

## User Control as a Feature, Not an Afterthought

The permissions page in DealFlow AI isn't informational — it's functional:

- **Capability toggles** let users disable entire tool categories. Turn off Gmail? The agent literally cannot see email tools
- **Approval requirements** are opt-in. Users who want a careful agent enable "Require approval for CRM writes." Users who want speed leave it off
- **Disconnect buttons** revoke cached tokens. The next tool invocation triggers a fresh consent flow
- **Live scope indicators** show which OAuth scopes are active during tool execution — transparency in real-time

This addresses the judging criterion directly: *"Can users understand what permissions the agent has? Are scopes and access boundaries clearly defined and visible?"* The answer isn't just yes — the answer is the user controls all of it.

## What We'd Do Differently

If we had more time, we'd add:

- **Per-tool audit analytics** — Which tools run most often, average latency, error rates
- **Role-based capability presets** — "Sales Rep" vs "Sales Manager" vs "Executive" with different default permissions
- **Token refresh observability** — Surface when tokens are silently refreshed vs when re-consent is needed
- **CIBA enrollment flow** — Currently requires manual Guardian setup; a guided in-app enrollment would improve onboarding

## Key Takeaways

1. **Security is a composition problem.** No single mechanism is sufficient. Layer CSRF + rate limiting + capability filtering + step-up auth + scoped tokens + audit logging
2. **Remove, don't restrict.** When a user disables a tool, don't check permissions at execution time — remove the tool from the LLM entirely. The model produces cleaner behavior when it doesn't know about tools it can't use
3. **Free Plan is enough.** Token Vault, two connections, async authorization patterns — everything we needed was available on the free tier
4. **Compose authorization mechanisms, don't choose.** AI SDK 6's `needsApproval` handles inline consent. CIBA handles device-level consent. Together they create graduated authorization that matches action sensitivity

---

*DealFlow AI is open source at [github.com/cdjgroup/dealflow-ai](https://github.com/cdjgroup/dealflow-ai). Built with Next.js, Claude, Auth0 Token Vault, and Upstash Redis.*
