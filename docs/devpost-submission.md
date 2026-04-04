# Devpost Submission Text — DealFlow AI

## Inspiration

Most AI agent demos show an impressive chat interface — but give users zero control over what the agent can actually do. We asked: what would it take to build an AI agent that a sales team would actually trust with their CRM, calendar, and email? The answer wasn't better prompts — it was layered security, user-controlled permissions, and full auditability.

## What it does

DealFlow AI is an AI sales agent that manages your pipeline, checks your Google Calendar, drafts Gmail follow-ups, and sends Slack team updates — all secured through Auth0 Token Vault.

What makes it different is the security and control model — a **policy-driven authorization framework** where every tool invocation passes through a layered decision pipeline:

1. **CSRF + Rate Limiting** — Request-level protection (10 req/min per user)
2. **Capability Filtering** — Users toggle tools ON/OFF. Disabled tools are removed from the LLM entirely — the agent can't see them, can't try to use them
3. **Trust Level Evaluation** — Per-tool policy: "always" (skip approval), "ask" (require consent), "never" (hard-block). Overrides all other layers
4. **Value-Based Step-Up** — High-value operations ($50K+ deals, closing as "won") require explicit approval via AI SDK 6's `needsApproval`
5. **CIBA Device Consent** — Critical mutations trigger Auth0 Guardian push notifications for out-of-band approval on the user's phone
6. **Audit Trail** — Every tool call logged with parameters, duration, token metadata, and outcome

Each tool invocation evaluates all six layers in sequence. The result isn't a single yes/no — it's a graduated response: proceed silently, prompt for approval, require device consent, or block entirely. This mirrors how enterprise access control works: context-dependent authorization, not blanket permissions.

**Design philosophy:** We treat AI agency as a spectrum of delegation, not a binary. Users grant specific capabilities, set trust levels per tool, approve high-value actions inline, and confirm critical mutations on their phone. The AI is authorized to act — but only within bounds the user controls in real-time

The agent supports 13 tools across 4 services:
- **CRM** (8 tools): deals, contacts, activities, pipeline analysis — stored in Upstash Redis
- **Google Calendar** (1): check availability and events
- **Gmail** (2): draft emails (never auto-send) and search correspondence
- **Slack** (2): list channels and send team messages

Beyond chat, the **Action Center** queues AI-suggested next steps (follow-up emails, demo meetings, team updates) for human review. Each suggestion includes the AI's reasoning. Users edit drafts inline, approve, and execute through Token Vault. An **MCP Server** exposes the same secure, audited tools to external AI agents (OpenClaw, Claude Desktop, Cursor).

## How we built it

- **Next.js 16** (App Router) for the full-stack framework
- **Claude Sonnet 4.6** via Vercel AI SDK v6 for the AI agent with tool calling
- **Auth0 Token Vault** with direct RFC 8693 token exchange for Google and Slack OAuth
- **Upstash Redis** for CRM data, user settings, audit logs, and conversation persistence
- **Vercel** for deployment

We followed a structured development methodology with test-driven development and multi-agent code review. The pipeline demo seeds 8 deals (including closed-won and closed-lost), 7 contacts, 12 activities, and 8 AI-suggested actions across all stages.

The Token Vault integration uses direct RFC 8693 token exchange rather than the `@auth0/ai-vercel` SDK wrapper. We found that the SDK swallows federated connection errors ([auth0-ai-js#175](https://github.com/auth0/auth0-ai-js/issues/175)) — returning a misleading "Authorization required" interrupt instead of the actual Auth0 API error, making Token Vault setup nearly impossible to debug. Direct calls give us full error observability plus rich token metadata (scope, TTL, connection) that powers the lifecycle visualization. The same pattern works identically for both Google and Slack connections.

## Challenges we ran into

1. **@auth0/ai-vercel SDK error swallowing** — The SDK wrapper swallows federated connection errors ([auth0-ai-js#175](https://github.com/auth0/auth0-ai-js/issues/175)), returning "Authorization required" instead of the actual error. We call Auth0's `/oauth/token` endpoint directly for full error observability and richer token metadata
2. **CIBA: from "can't" to two-step consent** — We initially believed CIBA required an Enterprise Plan and pivoted to AI SDK 6's `needsApproval` for inline approval. That worked well — so we kept it as the first layer. Then we implemented CIBA anyway via direct HTTP to Auth0's `/bc-authorize` endpoint, adding device-level consent as a second layer. The result: a two-step consent flow (inline approval card → Guardian push notification) that's stronger than either mechanism alone
3. **Google login vs Connected Accounts** — Logging in with Google does NOT enable Token Vault. You need: enableConnectAccountEndpoint, My Account API audience, connection purpose set to "Auth + Connected Accounts," and MRRT enabled. This took significant debugging
4. **Free Plan connection limit** — Two Token Vault connections maximum. We designed for exactly two (Google + Slack) and built capability toggles so users can manage both

## Accomplishments that we're proud of

- **Three-surface security** — Chat, Action Center, and MCP Server all enforce the same capability/trust/audit pipeline. Disable Gmail in Permissions → it's blocked everywhere
- **AI justifications** — Every suggested action explains WHY, making human-in-the-loop meaningful rather than ceremonial
- **MCP as ecosystem security** — Turned one app's Token Vault integration into a reusable pattern for external AI agents (OpenClaw, Claude Desktop, Cursor)
- **Two Token Vault providers** — Google + Slack, demonstrating the pattern's extensibility with identical integration code
- **Two-step consent** — Inline approval (AI SDK) + CIBA Guardian push (Auth0) for high-value mutations — device-level consent on the user's phone
- **Token lifecycle visualization** — Animated 6-stage pipeline makes the invisible security model visible for users and judges

## What we learned

- Security is a composition problem — no single mechanism is sufficient. Our six-layer pipeline (CSRF → rate limit → capability filter → trust level → value step-up → CIBA device consent) demonstrates graduated authorization
- Remove tools from the LLM entirely when disabled, don't check at runtime. The model produces cleaner behavior when it doesn't know about tools it can't use
- Layer your consent mechanisms: AI SDK `needsApproval` for inline approval + CIBA Guardian push for device-level consent. Neither alone is sufficient; together they provide both convenience and security
- Auth0's Token Vault enables a composable auth pattern — the same `exchangeToken()` works across chat, Action Center, and MCP without any surface-specific auth code

## What's next for DealFlow AI

- **AI-driven suggestion timing** — Automatically surface Action Center suggestions based on deal activity patterns
- **Incremental authorization** — Request additional OAuth scopes only when needed
- **Multi-user workspaces** — Team-level permissions and delegation policies
- **OpenClaw reference integration** — Published example showing OpenClaw agents using DealFlow tools via MCP with full Token Vault security
- Additional Token Vault connections (GitHub, Salesforce, Microsoft 365)

## Built With

auth0, anthropic-claude, nextjs, react, typescript, upstash-redis, vercel, tailwindcss, vercel-ai-sdk
