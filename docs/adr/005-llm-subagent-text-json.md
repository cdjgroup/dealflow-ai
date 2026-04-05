# ADR 005: LLM Subagent via Plain Text JSON vs Structured Output

**Status:** ACCEPTED
**Date:** 2026-04-05

## Context

DealFlow's `analyzePipeline` tool generates suggested actions (emails, calendar events, Slack messages) for the user's sales pipeline. Originally, these suggestions were produced by hardcoded heuristic rules — template strings with interpolated deal data. This undermined the "AI suggests actions" narrative: a judge examining the output would see static patterns, not genuine AI reasoning.

To make suggestions truly AI-generated, the tool needed to call Claude (Haiku) as a subagent within the tool's `execute` handler. The AI SDK v6 officially supports this as the "subagent" pattern ([ai-sdk.dev/docs/agents/subagents](https://ai-sdk.dev/docs/agents/subagents)) — calling `generateText()` inside a tool that's being orchestrated by an outer `streamText()`.

The key architectural question: how should the inner LLM call produce structured output that maps to the existing `SuggestedAction` type?

## Decision

Use plain `generateText()` with a JSON-requesting system prompt, then `JSON.parse()` the response text and validate with Zod. The old heuristic logic is retained as a fallback if the LLM call fails for any reason.

```typescript
const { text } = await generateText({
  model: anthropic("claude-haiku-4-5-20251001"),
  system: SYSTEM_PROMPT, // includes JSON schema documentation
  prompt: JSON.stringify({ deals, existingActions, focus, today }),
  maxRetries: 1,
  abortSignal,
});

const cleaned = text.replace(/^```(?:json)?\s*/m, "").replace(/\s*```\s*$/m, "").trim();
const parsed = suggestionsOutputSchema.safeParse(JSON.parse(cleaned));
```

Additional defense: LLM-generated drafts are validated through the strict `draftSchema` (with length limits, email format, regex patterns) before being written to Redis.

## Alternatives Considered

### Alternative A: `Output.object()` with Zod schema (REJECTED)

AI SDK v6's `Output.object({ schema })` provides constrained decoding — the model cannot produce tokens that violate the schema. This was the initial implementation.

**Why rejected:** Failed silently in production. The Zod schema used `z.union([emailDraftSchema, calendarDraftSchema, slackDraftSchema])` for the `draft` field because each action type has a different draft shape. Anthropic's constrained decoder could not resolve this untagged union, causing the `generateText()` call to throw. The error was caught by the fallback handler, silently reverting to heuristic suggestions — making it appear that nothing had changed.

**Key lesson:** `Output.object()` works well with simple, flat schemas but struggles with `z.union()` where the discriminator is implicit (the `type` field determines which draft shape applies, but the union itself has no explicit discriminator tag).

### Alternative B: `generateObject()` (REJECTED)

The AI SDK's `generateObject()` function forces tool use to extract structured data.

**Why rejected:** Deprecated in AI SDK v6, will be removed in v7. Also uses the same constrained decoding under the hood, so would likely hit the same `z.union()` issue.

### Alternative C: Per-deal LLM calls (REJECTED)

Call `generateText()` once per deal for better per-deal reasoning.

**Why rejected:** For a pipeline with 5-10 deals, this means 5-10 sequential API calls. At ~0.5-1.5s per call, that's 5-15 seconds of latency inside a tool execution — unacceptably slow for a streaming chat experience.

## Consequences

### Positive
- Robust in production — plain text JSON parsing tolerates markdown fences, whitespace, and minor formatting variations
- Full error observability — LLM failures are logged with `console.error` and the `generationMethod` field in the return value distinguishes AI from heuristic suggestions
- Heuristic fallback ensures the tool never fails silently — users always get suggestions
- Zod validation on both the LLM output schema and the strict `draftSchema` provides defense-in-depth against prompt injection via deal data
- Haiku is fast (~0.5-1.5s) and cheap ($1/M input) for nested tool calls

### Negative
- No compile-time guarantee that the LLM output matches the schema — validation is runtime-only
- The system prompt must document the JSON schema in natural language, which could drift from the Zod schema
- Markdown fence stripping is a heuristic (regex-based) that could theoretically strip valid content

### Neutral
- The subagent pattern adds one additional API call per `analyzePipeline` invocation, roughly doubling the Anthropic API cost for that tool call (Haiku cost is negligible)
- The `abortSignal` from the outer tool context is passed through, so cancellation propagates correctly
