# ADR 006: Two-Layer Rate Limiting for AI Tool Execution

**Status:** ACCEPTED
**Date:** 2026-04-05

## Context

DealFlow's chat endpoint lets Claude call tools in a loop (up to 7 steps per request, via `stopWhen: stepCountIs(7)`). If the model goes haywire — calling `searchEmails` repeatedly or alternating between tools in an infinite analysis loop — the only protection was a global 10 req/min rate limit at the HTTP level, which counts the *chat request* as 1 call regardless of how many tools fire inside it.

The audit trail already captures every tool call, but monitoring alone doesn't prevent abuse. Token Vault tokens are valid until expiry, and capability toggles are per-tool ON/OFF — neither provides real-time anomaly-based protection.

Three approaches were evaluated:
1. **Minimal (A only)**: Per-tool Upstash Ratelimit wrappers. Blocks individual tools when rate exceeded. Cannot kill a runaway stream.
2. **Combined A+C (Pragmatic)**: Per-tool rate limits + per-request AbortController kill switch. Requires refactoring route to `createUIMessageStream` wrapper.
3. **Clean (A+C + signal passthrough)**: Same as Combined plus threading `abortSignal` through all 6 tool files' `fetch()` calls so in-flight HTTP requests cancel on abort.

## Decision

Use Combined A+C (Pragmatic). Two layers with complementary coverage:

**Layer A (surgical):** Upstash Ratelimit per-tool per-user. 4 tiers: read (10/min), write (5/min), crm-read (20/min), crm-write (5/min), compound (3/min). When hit, returns error to model — other tools still work. Follows same wrapper pattern as `attachCibaChecks()`.

**Layer B (nuclear):** In-memory `RequestToolCounter` per request. When 15 total tool calls exceeded, writes error chunk to stream via `createUIMessageStream` writer, then fires `AbortController.abort()` to kill the stream.

Route refactored from `streamText.toUIMessageStreamResponse()` to `createUIMessageStream` wrapper to enable clean error injection before abort.

## Consequences

### Positive
- Stops runaway AI agent loops in real time (both within-request and cross-request)
- Per-tool blocking lets the model adapt — it can explain the limit or use alternative tools
- Audit trail captures every rate limit event for operational visibility
- Sub-10ms overhead per tool call (Upstash Ratelimit uses server-side Lua scripts)
- `createUIMessageStream` wrapper enables future stream-level features (custom data parts, richer notifications)

### Negative
- Route refactor from `toUIMessageStreamResponse` to `createUIMessageStream` increases code complexity
- Conversation persistence on abort depends on `createUIMessageStream.onFinish` — different callback lifecycle than `streamText.onFinish`
- Tools don't pass `abortSignal` to their `fetch()` calls — in-flight HTTP requests complete after abort (results discarded). Acceptable because write tools are already gated by approval + CIBA.
- Rate limits are hardcoded in `TOOL_RATE_LIMITS` config map — no UI for users to customize thresholds

### Neutral
- `ephemeralCache` on Upstash Ratelimit means repeated blocked calls within the same serverless invocation cost zero Redis commands
- `RequestToolCounter` is per-request (in-memory), not per-session — by design, since each streaming request is independent
- Fail-open on Redis errors is a conscious trade-off: availability over strictness for a hackathon demo

## Standards Alignment

Two-layer rate limiting addresses the controllability requirement of [EU AI Act Article 14](https://artificialintelligenceact.eu/article/14/), providing real-time mechanisms to interrupt and halt AI agent execution when behavior exceeds expected operational boundaries.
