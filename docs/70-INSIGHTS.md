# Insights

Non-obvious design decisions and discoveries.

## 001 — @auth0/ai-vercel SDK incompatible with AI SDK v6 (2026-04-02)

The `@auth0/ai-vercel` v5.1.0 `withTokenVault()` wrapper silently fails with Vercel AI SDK v6. The wrapper's `protect` method throws before the tool's `execute` function runs, but the error is swallowed by the streaming response — no interrupt is thrown and no token is passed. Fix: call Auth0's `/oauth/token` endpoint directly using RFC 8693 federated connection access token exchange. The `Tool` type changed from `parameters` (zod/v3) to `inputSchema` (zod v4) in v6, and the wrapper's TypeScript types are incompatible.

## 002 — Google login ≠ Token Vault Connected Accounts (2026-04-02)

Logging in with "Continue with Google" authenticates the user but does NOT store Google's refresh token in Token Vault. The Token Vault needs a separate "Connected Accounts" flow triggered via Auth0's `/auth/connect` endpoint (`enableConnectAccountEndpoint: true`). The connection must be set to purpose "Authentication and Connected Accounts for Token Vault". Additionally, Google only returns a refresh token on first consent — if using Auth0 development keys (which don't request `access_type=offline`), the refresh token is never stored. Must use your own Google OAuth credentials.

## 003 — AI SDK v6 breaking changes (2026-04-02)

## 004 — AI SDK v6 needsApproval supports async functions (2026-04-02)

The `tool()` function in AI SDK v6 accepts `needsApproval` as either a boolean or an async function `(params) => Promise<boolean>`. This enables dynamic approval logic — e.g., approving low-value deals automatically but requiring confirmation for >$50K. The SDK streams an `approval-requested` state to the client, which renders an approval card. The client calls `addToolApprovalResponse({ id, approved })` to proceed. This is superior to CIBA for hackathon demos because the consent happens inline in the chat (judges see it live) rather than on a separate device.

Multiple breaking changes from AI SDK v5 to v6: `parameters` → `inputSchema`, `maxSteps` → `stopWhen: stepCountIs(n)`, `maxTokens` → `maxOutputTokens`, `useChat` no longer has `input`/`handleInputChange`/`handleSubmit` (use `sendMessage` + `status`), `api` option replaced by `transport: new DefaultChatTransport({api})`, and `messages` from client are `UIMessage[]` that need `convertToModelMessages()` before passing to `streamText`.

## 006 — Help-Kit as a portable component suite across projects (2026-04-03)

The onboarding checklist and resource center were ported directly from the Hoshin Kanri project (`cdjgroup/hoshin-kanri`). The component architecture (OnboardingProvider context + useLocalStorage hook + content files) is deliberately decoupled from app-specific logic: swap the content files (`help-content.ts`, `glossary.ts`) and the suite works in any Next.js + shadcn/ui project. This is a pattern worth maintaining — build reusable component kits once, customize via content injection.

The `autoCompletions` prop on OnboardingProvider is the key extensibility point: the parent passes a `Record<string, boolean>` mapping step IDs to completion status, and the provider auto-marks steps. This avoids coupling the checklist to specific API calls (token status, deal count) — the parent owns detection logic.

## 005 — Landing page education > feature parity for hackathon judges (2026-04-03)

Teaching judges WHY the security features matter is more impactful than demonstrating all features. The "How It Works" and "Built for Security" sections on the landing page are deliberate UI real estate choices: (1) judges see the security narrative without navigating to settings, (2) "AI agent never stores credentials" differentiates from typical OAuth flows, (3) first-time visitors understand the approval flow before signing in.

The Audit Log was removed from top navigation because: (a) judges don't check logs unless something fails, (b) reducing nav from 3 items to 2 focuses attention on the primary workflow, (c) it remains accessible in context on the Permissions page where users manage connections. Principle: frequently-used features in top nav, reference features in context.

## 007 — Token Vault tokenset deletion is a cache operation, not a revocation (2026-04-03)

Deleting a Token Vault tokenset via the Auth0 Management API (`DELETE /api/v2/users/{id}/federated-connections-tokensets/{tokensetId}`) does NOT prevent future token exchanges. Auth0 logs confirm a successful "seta" (token exchange) event immediately after deletion. This is because the tokenset is a cache layer: the underlying social connection (Google OAuth) and the user's Auth0 refresh token remain valid, so Auth0 silently re-provisions a new tokenset on the next RFC 8693 exchange.

Auth0's official approach is the My Account API (`@auth0/myaccount-js` SDK, `connectedAccounts.delete()` with `delete:me:connected_accounts` scope), which invalidates the connection at the Auth0 level. However, this requires additional Auth0 configuration and a user access token with a specific scope.

Our solution: an app-level Redis flag (`{userId}:disabled-connections` set) checked at three integration points before any Auth0 call is made: (1) `exchangeToken()` blocks all five tools, (2) `/api/token-status` returns "Disconnected by user" without calling Auth0, (3) the permissions page renders a persistent "Reconnect" button from server-side state. The tokenset deletion is kept as best-effort cleanup but is non-fatal.

This pattern demonstrates that real user control over AI agent access requires application-level enforcement, not just token-level operations. Token Vault manages token lifecycle (issuance, refresh, expiry) but revocation semantics must be owned by the application. This is a general principle for any OAuth-based AI agent system: the agent framework manages tokens, but the application must manage permissions.
