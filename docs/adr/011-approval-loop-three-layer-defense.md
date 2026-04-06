# ADR 011 — Three-Layer Defense Against AI SDK Approval Loop

**Status:** ACCEPTED  
**Date:** 2026-04-05

## Context

AI SDK v6's `needsApproval` mechanism for tool calling has three independent bug vectors that compound into an infinite approval loop:

1. **Client-side re-send loop (vercel/ai#7683)**: `sendAutomaticallyWhen` implementations that check ALL parts of the last assistant message re-trigger on old `approval-responded` parts from earlier steps.
2. **Duplicate tool_use IDs (vercel/ai#9968)**: `convertToModelMessages` creates duplicate `tool_use` blocks when processing `approval-responded` parts across multiple request cycles, which Anthropic's API rejects.
3. **Model re-proposal**: After `collectToolApprovals` executes an approved tool, the model can re-propose the same write tool within the same `streamText` call, triggering another approval card.

Six PRs attempted single-layer fixes before the three-vector nature was understood.

## Decision

Implement defense at all three layers:

1. **Client**: Replace hand-rolled `sendAutomaticallyWhen` with SDK's built-in `lastAssistantMessageIsCompleteWithApprovalResponses` (checks only last step via `step-start` boundaries).
2. **needsApproval**: For write tools (draftEmail, sendSlackMessage, createCalendarEvent), check `context.messages` (SDK model-format messages) for prior `tool-result` entries. If found, return `false` to skip re-approval.
3. **Execute dedup**: Outermost wrapper checks `context.messages` for prior `tool-result`. Returns `{ skipped: true, message: "already completed" }` instead of re-executing.

Additionally, the system prompt instructs the model not to re-call write tools after success.

## Consequences

### Positive
- Approval cards work correctly for the hackathon demo — one card, one approval, one execution
- Defense-in-depth means any single layer failing doesn't cause the loop
- Write tools are idempotent within a conversation turn
- S3 external action approval (approval cards for write tools) can remain enabled

### Negative
- Write tools cannot be called twice intentionally in a single conversation turn (edge case: "send a message to #sales-team AND #deal-flow" would require two separate user messages)
- Dependency on SDK's built-in `lastAssistantMessageIsCompleteWithApprovalResponses` — if it changes, we need to verify
- Three layers of defense add complexity to the tool wrapping pipeline

### Neutral
- The `context.messages` parameter that the SDK passes to both `needsApproval` and `execute` is the reliable data source — raw UI messages and wrapper-level tracking are unreliable
- `toolTrust` settings saved in Redis can re-enable approval for any tool, which would hit the same loop if the client-side fix regresses
