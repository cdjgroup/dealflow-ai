# DealFlow AI — Devpost Submission Draft

> **Hackathon**: Authorized to Act: Auth0 for AI Agents
> **Deadline**: April 6, 2026 5:00 PM PT

---

## Inspiration

Sales teams lose deals because follow-ups fall through the cracks. AI assistants can draft emails and check calendars, but they shouldn't act without the user's informed consent. We built DealFlow AI to show that an AI sales agent can be both powerful AND transparent — suggesting actions with clear justification, letting users review and edit before anything executes, and using Auth0 Token Vault so the AI never touches credentials.

## What it does

DealFlow AI is an AI-powered sales assistant that manages your deal pipeline, communicates with prospects, and suggests proactive next steps — all through Auth0 Token Vault.

**Chat Interface**: Ask the AI about your pipeline, check your calendar, draft emails, or post Slack updates. Every external API call flows through Token Vault's RFC 8693 token exchange — the AI receives short-lived access tokens, never credentials.

**Action Center**: The AI analyzes your pipeline and generates suggested next steps (follow-up emails, demo meetings, team updates). Each suggestion includes the AI's reasoning. Users review, edit drafts inline, approve, and execute — creating a complete human-in-the-loop workflow.

**Unified Security Model**: The same capability toggles, trust levels, and connection controls govern both the chat and the Action Center. Disable Gmail in Permissions → neither the chat AI nor the Action Center can draft emails.

## How we built it

- **Next.js 16** (App Router) on Vercel
- **Auth0 Token Vault** for OAuth token management (Google, Slack)
- **Claude Sonnet 4.6** via Vercel AI SDK v6
- **Upstash Redis** for CRM data, conversations, audit trail, and action queue
- **RFC 8693** federated connection access token exchange (direct, bypassing the @auth0/ai-vercel wrapper which is incompatible with AI SDK v6)

### Architecture

```
User → Auth0 Login → Session with Refresh Token
                          ↓
AI Tool Call → exchangeToken() → Auth0 /oauth/token (RFC 8693)
                                      ↓
                              Short-lived Google/Slack token
                                      ↓
                              Gmail / Calendar / Slack API
                                      ↓
                              Result → Audit Trail → User
```

The same `exchangeToken()` function works from both the AI chat streaming context and the Action Center's execute endpoint — proving that Token Vault is composable across surfaces.

## Key Features

### Security Model
- **Per-tool capability toggles**: Enable/disable CRM, Calendar, Gmail, Slack independently
- **Trust levels**: "always" (skip approval), "ask" (confirm each time), "never" (tool hidden from AI)
- **Step-up approval**: AI SDK `needsApproval` for high-value deals (>$50K) and external actions
- **One-click disconnect**: Revoke OAuth access instantly via Redis flag + Token Vault cleanup
- **Audit trail**: Every tool call logged with parameters, duration, success/failure, and token metadata

### User Control
- **Action Center**: AI suggestions queued for review, not auto-executed
- **Inline editing**: Modify email/calendar/Slack drafts before approving
- **Batch approve**: Review and approve multiple actions at once
- **Execution feedback**: Real-time status transitions (Pending → Approved → Executing → Completed/Failed)
- **Trust enforcement**: Same controls apply whether AI acts through chat or Action Center

### Technical Innovation
- **Token Vault Audit Visualization**: Animated 6-stage token lifecycle in chat
- **Dynamic Scope Narrowing**: Tools self-declare minimum scopes, UI shows voluntary least-privilege
- **MCP Server**: External AI agents can discover and use DealFlow tools via Model Context Protocol
- **Cross-Agent Delegation**: Scoped, time-limited delegation tokens for agent-to-agent trust

## Challenges we ran into

1. **@auth0/ai-vercel SDK incompatibility**: The v5 SDK wrapper silently fails with AI SDK v6. We bypassed it and called Auth0's token exchange endpoint directly — which actually gave us more control over token metadata.

2. **Token Vault tokenset deletion is non-revocable**: Deleting a tokenset via Management API doesn't prevent re-provisioning. We implemented application-level disconnect via Redis flags checked at three integration points.

3. **OAuth scope configuration**: Google Calendar event creation requires upgrading from `calendar.readonly` to `calendar.events` — configured in Auth0 Dashboard, not code. Users must re-authorize after scope changes.

## Accomplishments we're proud of

- **Unified security model**: The same authorization pipeline works across chat, Action Center, and MCP — no security gaps between surfaces
- **AI-generated justifications**: Every suggested action explains WHY, making the human-in-the-loop meaningful rather than rubber-stamping
- **269 tests passing**: Comprehensive test coverage including data layer, API routes, and approval logic
- **10 insights documented**: Non-obvious discoveries about Token Vault, SDK compatibility, and OAuth patterns that benefit the Auth0 community

## What we learned

Auth0 Token Vault is a powerful primitive, but "Authorized to Act" requires more than token management. Real user control means:
- The user sees WHAT the AI wants to do and WHY
- The user can edit, approve, or block at every level
- The same controls apply regardless of how the AI acts (chat, queue, MCP)
- Every action is auditable and reversible

## What's next

- **AI-driven suggestion timing**: Automatically surface Action Center suggestions based on deal activity patterns
- **Incremental authorization**: Request additional OAuth scopes only when needed
- **Multi-user workspaces**: Team-level permissions and delegation
- **Production hardening**: Background execution queue, WebSocket status updates, pagination

## Built with

Auth0, Token Vault, Next.js, React, TypeScript, Vercel AI SDK, Claude, Upstash Redis, Tailwind CSS, Framer Motion, Vercel, Model Context Protocol

---

## Screenshots needed

1. **Chat with token lifecycle animation** — shows the 6-stage pipeline during a calendar check
2. **Action Center with 5 suggestions** — shows justifications, priorities, filter tabs
3. **Inline editing** — expanded email card with editable fields
4. **Execution result** — card showing "Completed" green badge
5. **Trust blocking** — error message when Gmail is disabled and user tries to approve
6. **Permissions page** — unified integration cards with connection status and toggles
7. **Audit log** — entries showing tool calls with duration and status

## Video demo

Record a 3-5 minute walkthrough following the demo script in `docs/DEMO-SCRIPT.md`.
