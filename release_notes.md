# Release Notes — v0.5.0

## DealFlow AI: CIBA Step-Up Authentication

Device-level consent via Auth0 Guardian push notifications for high-value AI agent actions.

### What's new

- **CIBA step-up authentication**: When the AI agent triggers a high-value action ($50K+ deals, closed-won/closed-lost stage changes), a two-step consent flow activates: inline approval card in chat followed by Auth0 Guardian push notification on the user's phone.
- **CibaWaitingCard**: Animated UI component showing the binding message ("Approve creating $75,000 deal: Acme Enterprise"), pulsing indicator, countdown timer, and status transitions (waiting/approved/denied/expired).
- **Action Center CIBA integration**: High-value actions in the Action Center trigger device approval before execution. Status badge shows "Device Approval..." during CIBA pending state.
- **CIBA API routes**: `POST /api/ciba/initiate` starts CIBA flow, `GET /api/ciba/status/[authReqId]` polls for user response.
- **Redis-backed CIBA sessions**: Prevents re-initiation when chat regenerates after phone approval. Sessions auto-expire via TTL.
- **21 unit tests**: Full coverage of CIBA threshold logic, Auth0 backchannel initiation, and polling response handling.

### Security

- Access tokens from CIBA grants never exposed to the client (stripped at API boundary)
- Auth0 error descriptions sanitized — no internal detail leakage
- CIBA sessions user-scoped in Redis with TTL cleanup
- CSRF protection on initiate endpoint
- Binding messages truncated to 64 chars per CIBA spec

### Architecture

- Direct HTTP to Auth0 `/bc-authorize` and `/oauth/token` (CIBA grant type `urn:openid:params:grant-type:ciba`)
- Follows ADR 001 pattern: bypass `@auth0/ai` SDK wrapper, call endpoints directly
- Form-urlencoded content type with `iss_sub` login_hint format per Auth0 SDK reference
- Reuses existing TokenVaultInterrupt pattern for chat-side interrupt handling

### Deployment

- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
- Requires: Auth0 CIBA grant type enabled + Guardian push factor configured + user enrolled in MFA
