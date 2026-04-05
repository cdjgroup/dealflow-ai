# Release Notes — v0.5.2

## DealFlow AI: AI Autonomy Selector — Graduated Trust for AI Agents

Users control exactly how much the AI agent can do without human intervention via a 3-level autonomy spectrum on the Action Center.

### What's new

- **AI Autonomy Selector**: 3-level control on the Action Center lets users choose their trust posture:
  - **Level 1 — Suggest Only** (default): AI queues actions as "pending" for manual review
  - **Level 2 — Auto-Approve**: AI auto-approves high/medium priority actions; execution still requires one CIBA Guardian push
  - **Level 3 — Full Autonomous**: AI auto-approves AND auto-executes routine actions on schedule. High-value actions (>$50K deal value) still require Guardian device consent — the AI knows when to ask.
- **Confirmation dialog**: Selecting Full Autonomous mode shows a warning dialog explaining what changes. Only activates on explicit confirmation.
- **Graduated trust with safety net**: Even at Level 3, low-priority actions stay pending, capability toggles are enforced, and high-value deals still get CIBA consent.
- **Scheduled Action Review**: Users opt into scheduled times (8am, 12pm, 5pm) via checkboxes on the Action Center page. At the selected time, a single Guardian push notification describes the batch (e.g., "DealFlow: 5 actions - 3 email, 2 calendar") — approve once on your phone and all high/medium priority actions auto-execute within the token's time-boxed window.
- **Priority filtering**: Only high and medium priority actions are included in scheduled execution. Low priority actions stay pending for manual review in the Action Center.
- **Run Now**: On-demand button in the Schedule panel triggers immediate batch CIBA execution without waiting for the next scheduled hour. UI polls for approval and shows real-time progress.
- **Two-phase Vercel cron design**: Phase 1 runs hourly to find opted-in users (timezone-aware), initiate CIBA. Phase 2 polls every minute — on approval, exchanges stored refresh tokens for Google/Slack access tokens and executes all actions.
- **AES-256-GCM encrypted token storage**: User's Auth0 refresh token encrypted at rest in Redis for offline/cron execution. Defense-in-depth beyond Upstash's infrastructure encryption.
- **SchedulePanel UI**: Checkbox cards for each time slot, optimistic saves, Active badge, timezone display, Run Now button with polling progress, error rollback.
- **Reseed Demo Data**: Resets CRM data and onboarding checklist to fresh state for demo purposes.
- **Action list real-time sync**: Action statuses update in real-time after scheduled execution via server component refresh.
- **Removed token lifecycle animation**: Simplified chat UI by removing the 6-stage pipeline visualization.

### Security

- Timing-safe CRON_SECRET verification (crypto.timingSafeEqual)
- Distributed execution lock (Redis SET NX) prevents duplicate action execution from overlapping cron ticks
- AES-256-GCM with random IV per encryption, auth tag verification on decrypt
- Encryption key length validated at startup with actionable error
- IANA timezone validated in API schema (prevents silent UTC fallback)
- Token exchange errors sanitized — OAuth internals never stored in user-facing fields
- CIBA denial reverts actions to pending (not failed) — respects user choice
- CIBA binding message sanitized to Auth0-allowed characters (alphanumerics + `+-_.,:#`, 64-char max)

### Architecture

- **Executor refactoring**: `executeActionWithToken()` accepts pre-obtained token, `executeAction()` unchanged (session-based). Shared `executeWithToken()` dispatcher — zero duplication.
- **Offline access pattern**: Refresh token stored at opt-in (RFC 6749/9700 compliant), exchanged at cron time via `exchangeTokenWithRefresh()`. CIBA token is proof of consent only (scoped to `openid`).
- **Redis key design**: `schedule:idx:{hour}` (user index), `ciba:scheduled:{userId}:{batchId}` (session with 10min TTL), `schedule:ciba:active` (active sessions index), `{userId}:schedule:refresh-token` (encrypted, 90-day TTL)
- **Idempotency**: Hour-truncated batch IDs prevent duplicate CIBA pushes. SET NX execution lock prevents duplicate action execution.
- Direct HTTP to Auth0 `/bc-authorize` and `/oauth/token` (CIBA grant type `urn:openid:params:grant-type:ciba`)
- Follows ADR 001 pattern: direct HTTP for full error observability (SDK swallows errors — [auth0-ai-js#175](https://github.com/auth0/auth0-ai-js/issues/175))

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
- Requires: Auth0 CIBA grant type enabled + Guardian push factor configured + user enrolled in MFA
