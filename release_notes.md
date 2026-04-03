# Release Notes — v0.2.0

## DealFlow AI: Hackathon Feature Expansion

Security, user control, and rich UI improvements for the "Authorized to Act" hackathon.

### What's new

- **needsApproval tool confirmations**: External actions (draftEmail, sendSlackMessage) always require user approval. Terminal deal stages (closed-won/closed-lost) and high-value deals (>$50K) also trigger step-up authorization. Three-layer approval: value-based, external action, user settings.
- **Capability matrix**: All 12 agent tools displayed on permissions page with READ/WRITE badges, Token Vault vs Local CRM source indicators, enabled/disabled status, guardrail tags, and "agent cannot" boundary list.
- **Rich tool badges in chat**: Every tool call shows icon, scope badge (READ/WRITE), and Token Vault lock icon vs Local CRM indicator during execution.
- **Enhanced connection status**: Green/red colored status cards with inline scope badges, auto-refresh every 30s, manual refresh button, and token type info.
- **Activity timeline**: Visual timeline on permissions page with usage stats (total actions, Token Vault calls, success rate, avg execution time), colored dots, and time-ago timestamps.
- **Code cleanup**: Extracted shared token exchange into `src/lib/token-exchange.ts`, removed unused `@auth0/ai-vercel` dependency, consolidated error handling.
- **Slack integration**: listSlackChannels + sendSlackMessage tools with Token Vault auth via RFC 8693.

### Deployment
- Live at: https://dealflow-ai-seven.vercel.app
- Repo: https://github.com/cdjgroup/dealflow-ai
