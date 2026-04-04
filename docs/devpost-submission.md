# Devpost Submission Text — DealFlow AI

## Inspiration

Most AI agent demos show an impressive chat interface — but give users zero control over what the agent can actually do. We asked: what would it take to build an AI agent that a sales team would actually trust with their CRM, calendar, and email? The answer wasn't better prompts — it was layered security, user-controlled permissions, and full auditability.

## What it does

DealFlow AI is an AI sales agent that manages your pipeline, checks your Google Calendar, drafts Gmail follow-ups, and sends Slack team updates — all secured through Auth0 Token Vault.

What makes it different is the security and control model:

- **Capability toggles** — Users control which tools the agent can use. Disable Gmail? The agent literally can't see email tools. It's not a permission check at runtime — the tools are removed from the LLM entirely
- **Step-up authorization** — High-value operations ($50K+ deals, closing as "won") require explicit user approval before execution, using AI SDK 6's native `needsApproval`
- **Audit trail** — Every agent action is logged with sanitized parameters, viewable in a dedicated dashboard. Full transparency into what the agent did and when
- **Progressive consent** — Each tool requests only the OAuth scopes it needs. Calendar gets read-only. Only email drafting requests compose access
- **Disconnect & revoke** — Users can revoke OAuth connections at any time. The next tool invocation triggers a fresh consent flow
- **Live scope indicator** — Shows which OAuth scopes are actively being used during tool execution

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

The Token Vault integration uses direct token exchange rather than the `@auth0/ai-vercel` SDK wrapper, which we found to be incompatible with AI SDK v6. The same RFC 8693 pattern works identically for both Google and Slack connections.

## Challenges we ran into

1. **@auth0/ai-vercel SDK incompatibility** — The SDK wrapper's `protect` method silently fails with AI SDK v6. We bypassed it entirely and call Auth0's `/oauth/token` endpoint directly. Same security, fewer abstractions
2. **CIBA requires Enterprise Plan** — Our original design included CIBA (Guardian push notifications) for step-up auth. We discovered this needs Enterprise-tier Auth0. We pivoted to AI SDK 6's native `needsApproval`, which turned out cleaner and simpler
3. **Google login vs Connected Accounts** — Logging in with Google does NOT enable Token Vault. You need: enableConnectAccountEndpoint, My Account API audience, connection purpose set to "Auth + Connected Accounts," and MRRT enabled. This took significant debugging
4. **Free Plan connection limit** — Two Token Vault connections maximum. We designed for exactly two (Google + Slack) and built capability toggles so users can manage both

## Accomplishments that we're proud of

- **Three-surface security** — Chat, Action Center, and MCP Server all enforce the same capability/trust/audit pipeline. Disable Gmail in Permissions → it's blocked everywhere
- **AI justifications** — Every suggested action explains WHY, making human-in-the-loop meaningful rather than ceremonial
- **MCP as ecosystem security** — Turned one app's Token Vault integration into a reusable pattern for external AI agents (OpenClaw, Claude Desktop, Cursor)
- **Two Token Vault providers** — Google + Slack, demonstrating the pattern's extensibility with identical integration code
- **Token lifecycle visualization** — Animated 6-stage pipeline makes the invisible security model visible for users and judges

## What we learned

- Security is a composition problem — no single mechanism is sufficient
- Remove tools from the LLM entirely when disabled, don't check at runtime. The model produces cleaner behavior when it doesn't know about tools it can't use
- Check your framework before building custom auth flows. AI SDK 6's `needsApproval` replaced hundreds of lines of custom code
- Auth0's Free Plan provides everything you need for a production-grade Token Vault integration

## What's next for DealFlow AI

- **AI-driven suggestion timing** — Automatically surface Action Center suggestions based on deal activity patterns
- **Incremental authorization** — Request additional OAuth scopes only when needed
- **Multi-user workspaces** — Team-level permissions and delegation policies
- **OpenClaw reference integration** — Published example showing OpenClaw agents using DealFlow tools via MCP with full Token Vault security
- Additional Token Vault connections (GitHub, Salesforce, Microsoft 365)

## Built With

auth0, anthropic-claude, nextjs, react, typescript, upstash-redis, vercel, tailwindcss, vercel-ai-sdk
