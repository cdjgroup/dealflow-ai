# DealFlow AI — Devpost Submission Draft

> **Hackathon**: Authorized to Act: Auth0 for AI Agents
> **Deadline**: April 6, 2026 5:00 PM PT

---

## Inspiration

AI agents that can draft emails, schedule meetings, and post Slack updates are powerful — but dangerous when they act without guardrails. Most AI agent frameworks treat authorization as an afterthought: OpenClaw (250K GitHub stars) stores credentials in local JSON files with no RBAC or audit trail. Sales teams using AI assistants lose deals when follow-ups fall through the cracks, but they also risk data breaches when the AI has unrestricted access.

We built DealFlow AI to prove that an AI sales agent can be both powerful AND trustworthy — suggesting actions with clear justification, letting users review and edit before anything executes, and using Auth0 Token Vault so the AI **never touches credentials**. Then we took it further: we exposed the same secure, audited pipeline to external AI agents via MCP, turning one app's security model into a reusable pattern for the AI agent ecosystem.

## What it does

DealFlow AI is an AI-powered sales assistant that manages your deal pipeline, communicates with prospects, and suggests proactive next steps — all through Auth0 Token Vault.

### Three Surfaces, One Security Pipeline

**1. Chat Interface** — Ask the AI about your pipeline, check your calendar, draft emails, or post Slack updates. Every external API call flows through Token Vault's RFC 8693 token exchange. An animated 6-stage token lifecycle visualization shows users exactly what happens: AI Decides → Token Exchange → Scoped Token → API Call → Response → Token Expires.

**2. Action Center** — The AI analyzes your pipeline and generates suggested next steps (follow-up emails, demo meetings, team updates). Each suggestion includes the AI's reasoning — not a black box. Users review, edit drafts inline, approve, and execute. Same Token Vault OAuth flow, different surface. This is the "Authorized to Act" thesis in action: the user curates what the AI does, not just rubber-stamps it.

**3. MCP Server for External AI Agents** — Any MCP-compatible agent (OpenClaw, Claude Desktop, Cursor) can discover and invoke DealFlow's tools through the `/api/mcp` endpoint. Same Token Vault pipeline, same audit trail, same capability controls. OpenClaw's notoriously weak auth model gets Auth0-grade security without any framework changes. This isn't just one app's security — it's a reusable pattern for the entire AI agent ecosystem.

### Unified Security Model

The same capability toggles, trust levels, and connection controls govern all three surfaces. Disable Gmail in Permissions → the chat AI can't draft emails, the Action Center can't approve email actions, and MCP agents can't invoke the draftEmail tool. One control, consistent everywhere.

## How we built it

- **Next.js 16** (App Router) on Vercel
- **Auth0 Token Vault** for OAuth token management (Google, Slack)
- **Claude Sonnet 4.6** via Vercel AI SDK v6
- **Upstash Redis** for CRM data, conversations, audit trail, and action queue
- **RFC 8693** federated connection access token exchange (direct — see Challenges)
- **Model Context Protocol** for external agent interop

### Architecture

```
                    ┌─────────────────┐
                    │   Auth0 Login    │
                    │  (Session + RT)  │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴─────┐
        │  Chat UI   │ │  Action   │ │    MCP     │
        │ (AI SDK)   │ │  Center   │ │  Server    │
        └─────┬─────┘ └─────┬─────┘ └──────┬─────┘
              │              │              │
              └──────────────┼──────────────┘
                             │
                    ┌────────┴────────┐
                    │ exchangeToken() │
                    │   (RFC 8693)    │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │  Auth0 Token    │
                    │     Vault       │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
        ┌─────┴─────┐ ┌─────┴─────┐ ┌──────┴─────┐
        │   Gmail    │ │  Google   │ │   Slack    │
        │   API      │ │ Calendar  │ │   API      │
        └───────────┘ └───────────┘ └────────────┘
                             │
                    ┌────────┴────────┐
                    │   Audit Trail   │
                    │   (Redis)       │
                    └─────────────────┘
```

The same `exchangeToken()` function works from all three entry points — proving Token Vault is composable across surfaces, not coupled to any single UI pattern.

## Key Features

### Security Model (Judging: Security Model, User Control)
| Layer | What | How |
|-------|------|-----|
| **Capability toggles** | Enable/disable CRM, Calendar, Gmail, Slack | Per-user Redis settings |
| **Trust levels** | "always" / "ask each time" / "never" per tool | "never" hides tool from AI entirely |
| **Step-up approval** | Confirm high-value deals (>$50K), external actions | AI SDK `needsApproval` with async logic |
| **CIBA device consent** | Guardian push for >$50K deals, terminal stages | Direct HTTP to Auth0 `/bc-authorize` + polling |
| **One-click disconnect** | Revoke OAuth access instantly | Redis flag + Token Vault cleanup |
| **Audit trail** | Every tool call logged | Parameters, duration, token metadata, success/failure |
| **Scope awareness** | Tools self-declare minimum scopes | UI shows voluntary least-privilege |

### User Control (Judging: User Control, Design)
| Feature | User Value |
|---------|-----------|
| **Action Center** | AI suggestions queued for review — never auto-executed |
| **Inline editing** | Modify email/calendar/Slack drafts before approving |
| **AI justifications** | Every suggestion explains WHY — informed consent, not rubber-stamping |
| **Batch approve** | Approve multiple actions at once for efficiency |
| **Status feedback** | Pending → Approved → Executing → Completed/Failed in real-time |
| **Trust enforcement** | Same controls apply across chat, Action Center, and MCP |

### Technical Innovation (Judging: Technical Execution)
| Feature | Why it matters |
|---------|---------------|
| **Two-step consent** | Inline approval (AI SDK) + CIBA Guardian push (Auth0) — graduated device-level authorization |
| **Token lifecycle visualization** | Makes the invisible security model visible — 6-stage animation in chat |
| **MCP Server** | External AI agents get Auth0-grade security without framework changes |
| **Cross-agent delegation** | Scoped, time-limited delegation tokens for agent-to-agent trust |
| **Pipeline analysis tool** | AI reads deal context and generates prioritized suggestions with justification |
| **Direct RFC 8693 exchange** | SDK swallows errors ([#175](https://github.com/auth0/auth0-ai-js/issues/175)) — direct calls give full error observability + richer token metadata |
| **CIBA via direct HTTP** | Device-level consent using Auth0 Guardian push — same direct HTTP pattern as Token Vault (ADR 004) |

### Potential Impact (Judging: Potential Impact)

**The MCP pattern is the key insight.** DealFlow AI doesn't just secure one application — the MCP server turns Auth0 Token Vault into a security layer for the entire AI agent ecosystem. OpenClaw (the most popular AI agent framework, 250K GitHub stars) has notoriously weak authorization: credentials in local JSON files, no RBAC, no audit trail. Our MCP server gives any OpenClaw agent secure, audited access to user resources through Token Vault. The agent authenticates, discovers tools, and every call flows through the same token exchange and audit pipeline as the chat UI.

**Connection config for any MCP client:**
```json
{
  "mcpServers": {
    "dealflow": {
      "url": "https://dealflow-ai-seven.vercel.app/api/mcp",
      "transport": "streamable-http",
      "headers": {
        "Authorization": "Bearer <auth0-access-token>"
      }
    }
  }
}
```

This pattern is reusable: any application with Auth0 Token Vault can expose its tools via MCP, giving the growing ecosystem of AI agents (OpenClaw, Claude Desktop, Cursor, custom agents) a standard way to act on behalf of users — securely, with consent, and with a full audit trail.

### Insight Value (Judging: Insight Value)

We documented 12 non-obvious discoveries during development:

1. **@auth0/ai-vercel SDK swallows token exchange errors** ([#175](https://github.com/auth0/auth0-ai-js/issues/175)) — failed exchanges return "Authorization required" instead of the real error. Fix: call Auth0's token exchange endpoint directly for full error observability.
2. **Google login ≠ Token Vault Connected Accounts** — separate OAuth flows with different scopes and refresh token behavior.
3. **Token Vault tokenset deletion doesn't revoke access** — tokensets are a cache layer. Application-level enforcement is required.
4. **Auth0 Token Vault does NOT support scope narrowing** — the `scope` parameter is ignored on federated exchanges. Scope narrowing must be application-layer.
5. **MCP endpoints need the same security layers as chat** — every new entry point must replicate capability filtering, approval checks, and audit attribution.

Full insights with technical details: `docs/70-INSIGHTS.md`

## Challenges we ran into

1. **@auth0/ai-vercel SDK error swallowing** ([#175](https://github.com/auth0/auth0-ai-js/issues/175)): The SDK's `TokenVaultAuthorizerBase` silently returns `undefined` when token exchange fails, then `validateToken()` throws a misleading "Authorization required" interrupt. The real error (wrong credentials, misconfigured connection, expired refresh token) is swallowed. We called Auth0's `/oauth/token` endpoint directly using RFC 8693 — which surfaces actual error messages and yields richer token metadata (scope, TTL, connection) that powers the lifecycle visualization.

2. **Token Vault tokenset deletion is non-revocable**: Deleting a tokenset via the Management API doesn't prevent re-provisioning. Auth0 silently creates a new tokenset on the next exchange. We implemented application-level disconnect via Redis flags checked at three integration points: `exchangeToken()`, `/api/token-status`, and the permissions UI.

3. **OAuth scope configuration**: Google Calendar event creation requires upgrading from `calendar.readonly` to `calendar.events` — configured in Auth0 Dashboard, not code. Auth0 Token Vault does NOT accept a `scope` parameter on federated exchanges, so scopes must be configured at the connection level. Users must re-authorize after scope changes.

4. **Three surfaces, one pipeline**: Ensuring capability toggles, trust levels, and audit logging work identically across chat (AI SDK streaming), Action Center (REST API), and MCP (external agents) required careful design. The key was making `exchangeToken()` context-agnostic — it reads the Auth0 session cookie, which is present in any browser-initiated request.

## Accomplishments we're proud of

- **Three-surface security**: Chat, Action Center, and MCP all enforce the same capability/trust/audit pipeline — no gaps between surfaces
- **AI-generated justifications**: Every suggested action explains WHY, making human-in-the-loop meaningful rather than ceremonial
- **MCP as ecosystem security**: Turned one app's Token Vault integration into a reusable pattern for external AI agents
- **CIBA device-level consent**: Two-step approval for high-value actions — inline card + Auth0 Guardian push notification on a separate device
- **290 tests passing**: Comprehensive coverage across data layer, API routes, approval logic, CIBA module, and capability filtering
- **12 insights documented**: Non-obvious discoveries about Token Vault, SDK compatibility, CIBA, and OAuth patterns that benefit the Auth0 community
- **Architecture Decision Records**: Four ADRs documenting the rationale behind direct token exchange, action center execution, scope narrowing, and CIBA implementation

## What we learned

Auth0 Token Vault is a powerful primitive, but "Authorized to Act" requires more than token management. Real user control means:

1. **The user sees WHAT and WHY** — AI justifications, not black-box actions
2. **The user can edit, approve, or block** — at per-tool, per-action, and per-agent levels
3. **Controls are consistent** — same rules regardless of how the AI acts (chat, queue, MCP)
4. **Everything is auditable** — token metadata, parameters, duration, success/failure
5. **The pattern is reusable** — MCP turns app-level security into ecosystem-level security

## What's next

- **AI-driven suggestion timing**: Automatically surface Action Center suggestions based on deal activity patterns
- **Incremental authorization**: Request additional OAuth scopes only when needed
- **Multi-user workspaces**: Team-level permissions and delegation policies
- **OpenClaw reference integration**: Published example showing OpenClaw agents using DealFlow tools via MCP with full Token Vault security

## Built with

Auth0, Token Vault, Next.js, React, TypeScript, Vercel AI SDK, Claude, Upstash Redis, Tailwind CSS, Framer Motion, Vercel, Model Context Protocol

---

## Screenshots needed

1. **Chat with token lifecycle animation** — 6-stage pipeline during a calendar check
2. **Action Center with suggestions** — justifications, priorities, filter tabs, badge count
3. **Inline editing** — expanded email card with editable To/Subject/Body fields
4. **Execution result** — card showing "Completed" green badge after Token Vault execution
5. **Trust blocking** — error message when Gmail is disabled and user tries to approve
6. **Permissions page** — integration cards with connection status, toggles, trust levels
7. **MCP Explorer** — LIVE badge, tool list, connection config snippets
8. **Audit log** — entries showing tool calls with duration, status, and token metadata

## Video demo

Record a 3-minute walkthrough following `docs/DEMO-SCRIPT.md`. Four acts:
1. AI chat with token lifecycle animation (45s)
2. Action Center review, edit, execute (60s)
3. Trust controls + audit + MCP story (45s)
4. Closing — three levels of "Authorized to Act" (30s)
