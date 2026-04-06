# ADR 010: Per-Connection Autonomy with Global Fallback

**Status:** ACCEPTED
**Date:** 2026-04-05

## Context

DealFlow's autonomy level (Suggest Only / Auto-Approve / Full Autonomous) and confidence routing thresholds were global settings applied uniformly across all integrations. Users who trusted Google Calendar enough for auto-approve but wanted manual review for Slack messages had no way to express this. The controls lived on the Actions page, disconnected from the Permissions page where connections and capabilities are managed.

Three approaches were considered:
1. **Minimal** — Move controls to Permissions page visually, keep global data model. Fast but misleading.
2. **Clean** — Full per-connection data model, replace global settings entirely. Truthful but breaking.
3. **Pragmatic** — Per-connection overrides with global fallback. Additive, zero breaking changes.

## Decision

**Approach 3: Pragmatic — per-connection overrides with global fallback.**

A new `connectionAutonomy?: Record<string, ConnectionAutonomyConfig>` field on `UserSettings` stores per-connection autonomy level and confidence thresholds. The global `autonomyLevel` and `confidenceThresholds` are preserved as defaults for any connection without an override. Action routing resolves per-connection via an `ACTION_TYPE_TO_CONNECTION` map (email/calendar -> google, slack -> slack).

The UI follows the Apple iOS Settings pattern (Summary + Inline Expand): each integration card on the Permissions page shows a compact summary row (mini zone bar + autonomy label) that expands to full controls on click. This was chosen over always-inline (too tall, violates NNg 2-level limit), modals (breaks context), and separate tabs (loses which integration you're configuring).

Sources: NNg progressive disclosure, Apple HIG disclosure controls, Shneiderman's Mantra, Stripe Apps 6-input threshold, Material Design segmented buttons.

## Consequences

### Positive
- Users can set Google to "Auto-Approve" and Slack to "Suggest Only" independently
- Zero migration — additive field, existing users get identical behavior via global fallback
- The "default + override" pattern is battle-tested (CSS cascading, GitHub org/repo permissions)
- Permissions page becomes the single control surface for both access and behavior
- Page widths standardized to `max-w-4xl` across all dashboard pages

### Negative
- Cron/scheduled execution routes still use global autonomy (not per-connection) — would need per-action-type resolution for full coverage
- Per-connection adds complexity to the settings data model (one more level of nesting)
- Summary+expand requires one extra click vs always-inline for power users who frequently adjust

### Neutral
- Global settings remain as defaults and are still saved — no data loss if per-connection is later removed
- CRM integration deliberately excluded (no action generation, so no autonomy controls needed)
