# Insights

Non-obvious design decisions and discoveries.

## 001 — @auth0/ai-vercel SDK swallows token exchange errors (2026-04-02)

The `@auth0/ai-vercel` SDK's `TokenVaultAuthorizerBase` silently swallows federated connection errors ([auth0-ai-js#175](https://github.com/auth0/auth0-ai-js/issues/175), still open). When the token exchange HTTP call fails, the SDK returns `undefined` instead of throwing — then `validateToken()` throws a misleading `TokenVaultInterrupt` saying "Authorization required" when the real issue may be misconfigured credentials, wrong connection name, or expired refresh token. This made initial Token Vault setup extremely difficult to debug. Fix: call Auth0's `/oauth/token` endpoint directly using RFC 8693 federated connection access token exchange, which surfaces actual error messages. **Note:** The SDK added AI SDK v6 compatibility in v5.0.0 (Jan 29, 2026) — the version mismatch we initially hit is resolved, but error swallowing remains the primary reason for direct exchange.

## 002 — Google login ≠ Token Vault Connected Accounts (2026-04-02)

Logging in with "Continue with Google" authenticates the user but does NOT store Google's refresh token in Token Vault. The Token Vault needs a separate "Connected Accounts" flow triggered via Auth0's `/auth/connect` endpoint (`enableConnectAccountEndpoint: true`). The connection must be set to purpose "Authentication and Connected Accounts for Token Vault". Additionally, Google only returns a refresh token on first consent — if using Auth0 development keys (which don't request `access_type=offline`), the refresh token is never stored. Must use your own Google OAuth credentials.

## 003 — AI SDK v6 breaking changes (2026-04-02)

## 004 — AI SDK v6 needsApproval supports async functions (2026-04-02)

The `tool()` function in AI SDK v6 accepts `needsApproval` as either a boolean or an async function `(params) => Promise<boolean>`. This enables dynamic approval logic — e.g., approving low-value deals automatically but requiring confirmation for >$50K. The SDK streams an `approval-requested` state to the client, which renders an approval card. The client calls `addToolApprovalResponse({ id, approved })` to proceed. This is superior to CIBA for hackathon demos because the consent happens inline in the chat (judges see it live) rather than on a separate device.

Multiple breaking changes from AI SDK v5 to v6: `parameters` → `inputSchema`, `maxSteps` → `stopWhen: stepCountIs(n)`, `maxTokens` → `maxOutputTokens`, `useChat` no longer has `input`/`handleInputChange`/`handleSubmit` (use `sendMessage` + `status`), `api` option replaced by `transport: new DefaultChatTransport({api})`, and `messages` from client are `UIMessage[]` that need `convertToModelMessages()` before passing to `streamText`.

## 005 — Auth0 Token Vault does NOT support scope narrowing (2026-04-03)

Auth0's federated connection access token exchange (`urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token`) does NOT accept a `scope` parameter. Confirmed by Auth0 docs and `@auth0/ai` SDK source code. The response includes `scope` and `expires_in` fields, but you cannot request narrower scopes at exchange time — the full consented scope set is always returned. The `@auth0/ai` SDK uses scopes only for post-exchange validation (throws `TokenVaultInterrupt` if required scopes are missing), never sends them in the exchange request. For scope narrowing, implement it at the application layer: tools self-declare minimum required scopes and the UI shows which subset is actually used.

## 006 — MCP server needs same security layers as chat route (2026-04-03)

When adding a new entry point (MCP endpoint alongside the existing chat API), every security layer from the original entry point must be replicated: capability filtering, approval checks, user identity resolution, and audit attribution. The MCP route was initially added with tool registration but without `filterToolsByCapabilities` or `attachApprovalChecks`, creating a bypass for all permission controls. Fix: MCP only exposes read-only tools (approval-required tools excluded since MCP has no interactive approval UI), requires auth, and logs all calls to the audit trail.

## 007 — AI SDK tool objects use `inputSchema` not `parameters` (2026-04-03)

In AI SDK v6, the `tool()` helper returns an object with `{ description, inputSchema, execute }`. The property is `inputSchema` (matching the v6 naming), not `parameters` (which was the v5 name). When building adapters that convert AI SDK tools to other formats (like MCP), inspect the actual runtime shape rather than guessing from memory or type casts.

## 008 — In-memory audit filtering is acceptable at hackathon scale (2026-04-03)

Redis lists (`LRANGE`) do not support field-level filtering — there's no `WHERE toolName = 'x'` equivalent. For a production audit log, you'd use a secondary index (Redis Search, Sorted Sets by timestamp, or a proper database). For a hackathon with a 7-day TTL and max ~500 entries per user, fetching a larger slice from Redis and filtering in-memory is pragmatic: the data fits in a single response, latency is negligible, and it avoids adding a search dependency. The key insight: when filters are active, fetch 4x the requested limit (min 500) to ensure enough candidates survive filtering, then slice the result to the caller's limit.

## 009 — Action queue is stronger than inline approval for "Authorized to Act" narrative (2026-04-03)

The AI SDK's `needsApproval` flow (v0.2.0) interrupts the user mid-conversation with approval cards. This works for single actions, but doesn't scale to "the AI analyzed your pipeline and recommends 5 next steps." A dedicated Action Center page where suggestions are queued, reviewed, and batch-approved is a fundamentally better UX for the hackathon theme: the user sees ALL suggested actions in context, can compare priorities, edit drafts, and approve selectively. This demonstrates that "Authorized to Act" means more than per-tool confirmation — it means giving users a complete picture of what the AI wants to do and letting them curate it.

The Token Vault integration is reusable outside the AI SDK streaming context. The `exchangeToken()` function works in any Next.js API route handler because it reads the Auth0 session cookie (present in all browser-initiated requests). This means action execution from a dedicated page uses the exact same OAuth flow as the chat tools — no separate auth mechanism needed. RFC 8693 token exchange is context-agnostic by design.

## 010 — Google and Slack have opposite branding rules for third-party UIs (2026-04-03)

Google *requires* you to use their official multicolor G logo (not a monochrome version) per their Identity branding guidelines. Slack *prohibits* using their octothorpe (#) logo in third-party product UIs per their brand terms of service ("Cannot include Slack assets in your product's user interface"). The correct approach: Google gets the official SVG, Slack gets a text "S" on their brand purple (#4A154B). Both verified against official documentation — Google: developers.google.com/identity/branding-guidelines, Slack: slack.com/terms-of-service/slack-brand.

Similarly, OAuth scopes should follow each provider's own consent screen patterns.

## 011 — Auth0 CIBA endpoints require form-urlencoded, not JSON (2026-04-04)

Auth0's backchannel endpoints (`/bc-authorize` and `/oauth/token` for CIBA grant) require `Content-Type: application/x-www-form-urlencoded` with `URLSearchParams` body encoding. This differs from the Token Vault exchange endpoint (`/oauth/token` for RFC 8693 grant) which accepts `application/json`. Verified by reading the `auth0` SDK v4.37 source (`node_modules/auth0/dist/esm/auth/backchannel.js`). The `login_hint` parameter is a JSON string (`{"format":"iss_sub","iss":"https://domain/","sub":"auth0|id"}`) passed as a form field value — double encoding is required. Additionally, `binding_message` is limited to 64 characters per the CIBA spec, and `requested_expiry` acts as a routing switch: <=300s routes to Guardian push, >300s routes to email.

## 012 — CIBA interrupt reuses TokenVaultInterrupt pattern exactly (2026-04-04)

The existing TokenVaultInterrupt pattern (JSON error in tool execution → `parseInterrupt()` in chat-window → specialized card component → `regenerate()` on resolution) works for CIBA without architectural changes. The key insight: throwing a JSON-encoded error from a tool's `execute` function is a generic "interrupt" mechanism, not specific to token vault. CibaInterrupt and TokenVaultInterrupt are just different payloads in the same pattern. The challenge is preventing re-initiation: when `regenerate()` retries the tool, it would initiate a new CIBA request. Solution: Redis-keyed sessions (`ciba:{userId}:{toolName}`) that the wrapper checks before initiating. If an approved session exists, skip CIBA and proceed. Google translates `calendar.readonly` to "See and download any calendar you can access" on their consent screen. Showing raw scope strings like `calendar.readonly` or `channels:read` is a developer-facing anti-pattern — end users don't know what these mean. The fix: maintain a SCOPE_LABELS map with human-readable translations, show the friendly version as primary text, keep the technical scope available via tooltip for transparency.

## 013 — CIBA is designed for server-initiated flows (2026-04-04)

Auth0's CIBA implementation (`/bc-authorize`) does not require a user HTTP session or browser context — it only needs `client_id`, `client_secret`, `login_hint` (userId), and `binding_message`. This makes it ideal for server-initiated consent: a cron job can send a Guardian push notification without the user being in the app. The CIBA access token returned on approval is scoped to `openid` only — it's proof of consent, not an API token. For actual execution (calling Gmail/Slack/Calendar), you still need the user's refresh token stored separately and exchanged via Token Vault. This "CIBA for consent, refresh token for execution" separation is the key architectural insight.

## 014 — Vercel cron requires two-phase design for CIBA polling (2026-04-04)

Vercel serverless functions can't poll for 5+ minutes (CIBA timeout). Solution: separate the initiation (hourly cron sends CIBA push) from polling (per-minute cron checks Auth0, executes on approval). This maps naturally to the CIBA spec's async model. Key constraint: Hobby plan = daily minimum/hourly precision; Pro plan = per-minute. Vercel delivers cron events at-least-once, so idempotency guards (hour-truncated batch IDs, SET NX execution locks) are essential.

## 015 — Batch CIBA beats per-action CIBA for AI agent consent (2026-04-05)

Per-action CIBA (one Guardian push per action) creates notification fatigue. With 5+ pending actions, the user gets bombarded with push notifications. Worse, Auth0 Guardian only processes one CIBA push per user at a time — subsequent pushes are silently queued or overridden. The fix: batch all high/medium priority actions into a single CIBA request. The binding message describes the batch ("DealFlow: 5 actions - 3 email, 2 calendar"), the user approves once, and all actions execute within the CIBA token's expiry window. The token lifetime is the natural execution boundary — time-boxed delegation, not open-ended authorization.

## 016 — CIBA binding_message character restrictions are strict (2026-04-05)

Auth0's CIBA binding message only allows alphanumerics, whitespace, and `+-_.,:#` characters. Email addresses (containing `@`) are rejected with a validation error. This isn't documented prominently — discovered via runtime error. Fix: sanitize with `/[^\w\s+\-_.,:#]/g` and use contact names instead of email addresses in messages. The 64-character limit also requires careful message construction: prioritize action type counts over individual details.

## 017 — useState(initialProps) doesn't re-sync on server refresh (2026-04-05)

React's `useState(initialValue)` only uses the initial value on first mount. When a Next.js server component re-renders via `router.refresh()` and passes new props, client components that stored those props in `useState` won't see the update. This caused the Action Center to show stale statuses after CIBA batch execution — the server had the updated data, but the client's local state was frozen. Fix: add `useEffect(() => setActions(initialActions), [initialActions])` to sync state when server props change.

## 018 — Per-client MCP tool filtering is entirely custom — no spec support (2026-04-05)

The MCP specification (2025-03-26) defines OAuth 2.1 auth with scopes, and `mcp-handler` v1.1.0 supports `requiredScopes` for handler-level gating. However, **per-client `tools/list` filtering is not in the spec, the library, or Auth0's MCP docs**. The `createMcpHandler` callback runs once at server initialization — tool registration is static, not per-session. Our solution: populate `AuthInfo.extra` with client metadata (allowedTools, rateLimit, trustTier) in `verifyMcpToken()`, then check it inside each tool handler before execution. This means `tools/list` returns all tools to all clients (they can "see" tools they can't call), but `tools/call` enforces the policy. This is a known limitation we document in the UI. A future spec revision or library update could support dynamic tool registration, which would enable true per-client tool discovery.

## 019 — AI SDK callbacks swallow errors but not abort signals (2026-04-05)

The Vercel AI SDK's `notify.ts` wraps all callbacks (including `experimental_onToolCallFinish`) in try/catch that silently swallows errors. This means throwing from a callback cannot stop the stream. However, `AbortController.abort()` doesn't throw — it fires a signal synchronously. Calling `abort()` from inside the swallowed callback works because the signal propagates through the merged abort chain independent of the try/catch. Furthermore, server-side abort sends `{ type: 'abort' }` then closes cleanly — the client sees `status: 'ready'` (not error). To show a meaningful error, write an error chunk via `createUIMessageStream`'s writer *before* calling `abort()` — the synchronous enqueue happens on the outer stream controller, independent of the inner streamText stream, guaranteeing delivery before the abort closes the connection.

## 020 — Two-layer circuit breaking: surgical vs nuclear (2026-04-05)

Per-tool rate limiting (Layer A) and per-request abort (Layer B) serve fundamentally different purposes. Layer A is surgical — it blocks one tool while letting others continue, and the AI model can adapt by explaining the limit or using alternative tools. Layer B is nuclear — it kills the entire stream. Neither alone is sufficient: Layer A can't stop a model that alternates between different tools (each within its own limit), and Layer B can't catch abuse that spans multiple requests (each under the per-request cap). Together, they cover cross-request patterns (A: Upstash sliding window per user) and within-request runaway loops (B: in-memory counter + AbortController). The Upstash Ratelimit SDK's `ephemeralCache` means repeated rate-limited calls within the same serverless invocation are blocked with zero Redis commands — important for the runaway-loop case where the model might retry a blocked tool 7 times in one request.

## 021 — CIBA unlocks MCP write operations without approval UI (2026-04-05)

MCP is a stateless request-response protocol with no concept of interactive approval cards. The original assumption was that MCP must be read-only because "MCP has no approval UI." But CIBA (Client Initiated Backchannel Authentication) is designed precisely for this scenario — consent on a separate device with no client-side UI required. The MCP handler blocks synchronously while polling for Guardian push approval, then executes the tool with a stored refresh token. This makes MCP a first-class execution context rather than a second-class read-only surface. The combination of MCP + Token Vault + CIBA for agent consent appears to be novel — we haven't found another project that composes all three.

## 022 — EU AI Act Article 14 validates the trust spectrum design (2026-04-05)

The EU AI Act's Article 14 ("Human Oversight," effective August 2026) requires high-risk AI systems to be designed for "effective oversight by natural persons." DealFlow AI's three-level autonomy spectrum (Suggest Only, Auto-Approve, Full Autonomous) with confidence-based routing and CIBA device consent was designed independently from the regulation, but maps directly to Article 14's graduated oversight model. The insight: building for user trust and building for regulatory compliance converge on the same design — layered human oversight proportional to action sensitivity. Both the regulation and good UX design start from the same premise: AI systems that take real-world actions need human oversight proportional to the risk of those actions. Confidence-based routing adds the final dimension: the AI's own uncertainty becomes a routing signal, ensuring that low-confidence suggestions always surface for human review regardless of the user's autonomy setting.

## 023 — Per-client parameter constraints add intent verification to MCP (2026-04-05)

Binary tool-level access control ("can this client call searchEmails?") doesn't capture intent. A client with searchEmails access can search for anything — there's no semantic constraint on the query parameter. Adding per-client `parameterConstraints` (regex-based, fail-closed) creates a middle layer: the MCP server can enforce that a specific client can only search emails from `@acme.com` domains, or only check calendars for specific date ranges. This is a pragmatic approximation of the XACML/ODRL policy models proposed in academic literature (arXiv:2501.09674), implemented as ~10 lines of regex validation in the tool handler. The key trade-off: regex is less expressive than structured policy languages, but it's immediately understandable, requires no policy engine, and covers the most common intent constraints.
