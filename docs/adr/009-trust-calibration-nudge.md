# ADR 009: Trust Calibration via Threshold-Based Nudge (Not Auto-Escalation)

**Status:** ACCEPTED
**Date:** 2026-04-05

## Context

DealFlow tracks per-tool approve/dismiss counts (`TrustStats`) in Redis, and displays approval rates in the Permissions UI. The autonomy selector (Levels 1/2/3) is a manual user setting. These two systems were disconnected — stats were recorded but never influenced autonomy. A judge reading the code would see that "trust calibration" was write-only telemetry, not a feedback loop.

Three approaches were considered:
1. **Auto-graduation** — automatically promote `toolTrust` from `ask` → `always` when thresholds are met
2. **Nudge banner** — suggest the upgrade, require user confirmation
3. **Toast notification** — ephemeral suggestion via toast system

## Decision

**Approach 2: Nudge banner with explicit user acceptance.**

A pure function (`evaluateTrustGraduation`) checks per-tool stats against thresholds (5+ decisions, >80% approval rate) and returns a suggested trust level. The API includes an optional `nudge` payload in approve responses. The Action Center renders a dismissible banner with "Auto-approve" and "Not now" buttons. Accept calls `PUT /api/settings` to update `toolTrust`. Dismiss hides the banner client-side (no persistence of dismissed nudges).

Upgrade-only — the system never suggests blocking a tool (`ask` → `always` only, never → `never`).

## Consequences

### Positive
- Closes the feedback loop between telemetry and autonomy — genuine trust calibration
- User retains full control — system suggests, never auto-escalates
- Aligns with "Authorized to Act" theme: even the system's own recommendations require consent
- Pure function is trivially testable (no I/O, no side effects)
- Backward-compatible API change (optional field)

### Negative
- Dismissed nudges are not persisted — banner reappears on next qualifying action (acceptable for hackathon)
- Single nudge per batch — mixed-type batches only surface the first qualifying type
- No downgrade suggestions — users who frequently dismiss must manually set trust to "never"

### Neutral
- Threshold values (5 decisions, 80% rate) are hardcoded constants, not configurable per-user
- Stats are per-action-type (email/calendar/slack), not per-tool — if multiple tools map to the same type, they share a nudge
