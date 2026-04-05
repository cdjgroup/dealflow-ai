# Release Notes — v0.6.4

## DealFlow AI: Confidence Routing Overhaul + Light Mode

Redesigned confidence routing controls (Stripe Radar pattern), enable/disable toggle, Guardian notification priority selector, and comprehensive light mode fixes.

### What's new

- **Confidence routing redesign**: Replaced dual-thumb slider with Stripe Radar-inspired pattern — read-only visualization bar with zone icons, numeric stepper inputs for precise threshold control, and zone descriptions that dynamically reference the current autonomy level.
- **Enable/disable toggle**: Confidence routing can now be toggled off entirely, falling back to autonomy-level-only routing. Toggle state persists across sessions.
- **Settings persistence fix**: Fixed a bug where confidence thresholds were silently dropped on every save — values now persist correctly via field-level merge.
- **Guardian notification priority selector**: Users can choose which priority levels (high/medium/low) are included in scheduled Guardian push notifications. Default: high + medium.
- **Priority labels**: Action cards now display "high priority", "medium priority", "low priority" instead of bare priority names.
- **MCP light mode fixes**: ~40 contrast improvements across 4 MCP components (text-*-400 to -600/-700, bg-*/5-10 to -/15) for WCAG AA compliance.
- **Action card contrast**: Priority badge colors fixed for light mode readability.

### Architecture

- Two-gate system explained in UI: confidence routing overrides autonomy at extremes, autonomy level is the fallback for the middle band
- `resolveInitialStatus()` respects `enabled === false` (backward-compatible with existing Redis data)
- `notifyPriorities` wired through both cron routes (schedule-initiate + schedule-trigger)
- Field-level merge in `updateUserSettings` prevents partial patches from dropping nested fields

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
