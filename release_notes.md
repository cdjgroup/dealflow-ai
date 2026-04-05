# Release Notes — v0.5.2

## DealFlow AI: Real-Time Circuit Breaking for AI Tool Execution

Two-layer circuit breaking prevents runaway AI agent tool loops — the AI agent can no longer scrape your entire inbox or flood your calendar.

### What's new

- **Per-Tool Rate Limiting (Layer A)**: Tools grouped into 4 tiers with per-minute budgets. Read tools (calendar, email, Slack search) get 10 calls/min. Write tools (draft email, create event, send Slack) get 5 calls/min. CRM reads get 20 calls/min. CRM writes get 5 calls/min. Compound tools (delegateResearch, analyzePipeline) get 3 calls/min. When a tool hits its limit, the AI model gets an error result and can explain to the user why — other tools still work.
- **Per-Request Tool Call Cap (Layer B)**: Max 15 tool calls per single chat request. If the model tries to exceed this (runaway execution loop), the circuit breaker aborts the entire stream and the user sees an amber warning: "Request limit reached."
- **Clean Error Messaging**: Route refactored from `streamText.toUIMessageStreamResponse` to `createUIMessageStream` wrapper, enabling injection of an error chunk before the AbortController fires. This ensures the client sees a meaningful circuit-breaker message instead of a silent stream termination.
- **Amber Circuit Breaker Alerts**: Circuit breaker errors render with amber/warning styling in the chat, visually distinct from red error banners for other failures.
- **Audit Trail Integration**: Every rate limit denial is logged to the Redis audit trail with tool name, tier, and reset time — visible at `/dashboard/audit`.

### Security

- AbortController kills runaway streams mid-flight when tool call limit exceeded
- Rate limit checks use Upstash Ratelimit sliding window (sub-10ms overhead per check)
- Fail-open on Redis errors: read tools still work during Upstash outages (availability over strictness)
- `delegateResearch` and `analyzePipeline` now rate-limited at 3/min (most expensive compound tools)

### Architecture

- Two-layer design: Layer A (Upstash Ratelimit, cross-request, surgical) + Layer B (in-memory counter, per-request, nuclear)
- `attachCircuitBreaker()` follows same wrapping pattern as `attachCibaChecks()` and `attachApprovalChecks()`
- `ephemeralCache` on Upstash Ratelimit blocks repeated rate-limited calls with zero Redis commands
- `RequestToolCounter` instantiated fresh per request (no cross-request state leakage)

### Insight

The AI SDK's `experimental_onToolCallFinish` callback fires *after* each tool call, and errors thrown inside it are silently swallowed (`notify.ts` wraps callbacks in try/catch). But `AbortController.abort()` doesn't throw — it fires a signal. This means calling `abort()` from inside the swallowed callback actually works. The signal propagates through the merged abort chain and kills the stream. Server-side abort sends `{ type: 'abort' }` then closes cleanly — the client sees `status: 'ready'` (no error). To surface a meaningful message, we write an error chunk via `createUIMessageStream`'s writer *before* aborting, which the client processes first.
