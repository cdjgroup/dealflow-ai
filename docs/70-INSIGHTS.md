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
