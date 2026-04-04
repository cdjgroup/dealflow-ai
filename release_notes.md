# Release Notes — v0.5.1

## DealFlow AI: Scheduled Action Review with CIBA Approval

AI agent autonomously proposes and executes pending actions on a user-defined schedule, with device-level consent via Auth0 Guardian.

### What's new

- **Scheduled Action Review**: Users opt into scheduled times (8am, 12pm, 5pm) via checkboxes on the Action Center page. At the selected time, a Guardian push notification asks "Execute N pending actions?" — approve on your phone and all actions auto-execute.
- **Two-phase Vercel cron design**: Phase 1 runs hourly to find opted-in users (timezone-aware), initiate CIBA. Phase 2 polls every minute — on approval, exchanges stored refresh tokens for Google/Slack access tokens and executes all actions.
- **AES-256-GCM encrypted token storage**: User's Auth0 refresh token encrypted at rest in Redis for offline/cron execution. Defense-in-depth beyond Upstash's infrastructure encryption.
- **SchedulePanel UI**: Checkbox cards for each time slot, optimistic saves, Active badge, timezone display, error rollback.
- **51 unit tests**: Full coverage of crypto, data layers, cron routes, executor refactoring, and settings integration.

### Security

- Timing-safe CRON_SECRET verification (crypto.timingSafeEqual)
- Distributed execution lock (Redis SET NX) prevents duplicate action execution from overlapping cron ticks
- AES-256-GCM with random IV per encryption, auth tag verification on decrypt
- Encryption key length validated at startup with actionable error
- IANA timezone validated in API schema (prevents silent UTC fallback)
- Token exchange errors sanitized — OAuth internals never stored in user-facing fields
- CIBA denial reverts actions to pending (not failed) — respects user choice

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
