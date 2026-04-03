# DealFlow AI — Claude Integration

> AI sales agent with Auth0 Token Vault — hackathon entry for "Authorized to Act"

---

## Current Version: 0.3.0 — Boundary-Pushing Auth (Scope Narrowing, Consent, Visualization, MCP, Delegation)
## Status: READY FOR DEPLOY
## Live URL: https://dealflow-ai-seven.vercel.app

---

## Quick Commands

| Action | Command |
|--------|---------|
| Dev server | `npm run dev` (http://localhost:3000) |
| Build | `npm run build` |
| Run tests | `npm test` |
| E2E tests | `npx playwright test` |
| Deploy | `vercel --prod` |

---

## Architecture

**Stack:** Next.js 16 (App Router) + Auth0 + Claude Sonnet 4.6 + Upstash Redis + Vercel

**Auth Flow:**
1. User logs in via Auth0 Universal Login (Google social connection)
2. Auth0 issues session with refresh token (MRRT for My Account API)
3. AI tools call Auth0 `/oauth/token` directly (RFC 8693 federated connection access token exchange)
4. Auth0 Token Vault returns short-lived Google access tokens
5. Tools call Google Calendar / Gmail APIs with those tokens

**Key Insight:** `@auth0/ai-vercel` SDK wrapper is incompatible with AI SDK v6. The wrapper's `protect` method silently throws instead of passing tokens to the tool's `execute` function. Fix: bypass the SDK and call Auth0's token exchange endpoint directly.

**Auth0 Dashboard Requirements:**
- Google connection: Purpose = "Authentication and Connected Accounts for Token Vault"
- Google connection: Must use YOUR OWN Google OAuth credentials (not Auth0 dev keys)
- My Account API: Activated with Connected Accounts scopes (create, read, delete)
- MRRT: Enabled for My Account API
- Refresh Token Rotation: Disabled
- Grant Types: Authorization Code, Refresh Token, Token Vault

---

## AI Tools

| Tool | Source | Token Vault? |
|------|--------|-------------|
| checkCalendar | Google Calendar API | Yes — direct exchange |
| draftEmail | Gmail API | Yes — direct exchange |
| searchEmails | Gmail API | Yes — direct exchange |
| listSlackChannels | Slack API | Yes — direct exchange |
| sendSlackMessage | Slack API | Yes — direct exchange |
| listDeals | Upstash Redis | No |
| getDealDetails | Upstash Redis | No |
| searchContacts | Upstash Redis | No |
| createDeal | Upstash Redis | No (needsApproval >$50K) |
| updateDeal | Upstash Redis | No (needsApproval closed-won) |
| createContact | Upstash Redis | No |
| logActivity | Upstash Redis | No |

---

## Security & User Control (v0.2.0)

- **Capability Toggles:** Per-tool ON/OFF at `/dashboard/permissions` (stored in Redis)
- **Step-Up Auth:** AI SDK `needsApproval` for deals >$50K and closed-won stage changes
- **Audit Trail:** Every tool call logged to Redis + viewable at `/dashboard/audit`
- **CSRF:** All mutation endpoints require `X-Requested-With: XMLHttpRequest`
- **Scope Indicator:** Live display of active OAuth scopes during tool execution
- **Disconnect:** Revoke OAuth connections via UpstashStore token deletion
- **Conversation Persistence:** Chat threads saved/loaded from Redis

---

## Environment Variables

See `.env.example` for all required variables.

Key: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_SECRET`, `APP_BASE_URL`, `ANTHROPIC_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`

---

## Hackathon

- **Contest:** Authorized to Act: Auth0 for AI Agents (authorizedtoact.devpost.com)
- **Deadline:** 2026-04-06 5:00 PM PT
- **Judging:** Security Model, User Control, Technical Execution, Design, Potential Impact, Insight Value
