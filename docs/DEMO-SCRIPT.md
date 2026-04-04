# DealFlow AI — Demo Script

> 3-minute max. Every second counts. No filler, no fumbling.

## Setup (before recording)

1. Log in at https://dealflow-ai-seven.vercel.app
2. Google and Slack connected (green badges on Permissions)
3. Seed data: `fetch('/api/seed', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } })`
4. Clear conversations (sidebar > Clear All)
5. Clear/dismiss existing actions so Action Center starts fresh
6. Have Permissions page open in a second tab (for fast switch)

---

## Act 1: The AI Acts Through Token Vault (45 sec)

> "DealFlow AI is a sales assistant that acts on the user's behalf through Auth0 Token Vault. The AI never stores credentials."

1. Type: **"What's on my calendar tomorrow?"**
   - Token lifecycle animation appears (6 stages: AI Decides → Token Exchange → Scoped Token → API Call → Response → Token Expires)
   - "Auth0 exchanges a refresh token for a short-lived Google access token. The AI gets a scoped token, never credentials."

2. Type: **"Analyze my pipeline and suggest next steps"**
   - AI calls `analyzePipeline`, creates suggestions
   - "The AI read 8 deals across the full pipeline — including a $120K closed-won and a lost deal — and generated prioritized action items."

## Act 2: Action Center — Review Before Execution (1 min)

> "Authorized to Act means the user sees what the AI wants to do, why, and decides whether it happens."

3. **Click Actions** in nav — show the Action Center
   - Point at a card: "Each suggestion has a justification — the AI explains its reasoning."
   - Point at priorities: "High priority for stale high-value deals, medium for routine follow-ups."

4. **Click Edit** on an email action → change the subject → Save
   - "The user can customize every draft. This isn't rubber-stamping — it's informed consent."

5. **Click Approve → Execute** on one email action
   - Watch: Approved (blue) → Executing (pulse) → Completed (green)
   - "That draft just landed in Gmail through Token Vault. Same OAuth flow as chat, different surface."

## Act 3: Two-Step Consent + Trust Controls (45 sec)

> "High-value actions get device-level verification — like a bank wire transfer."

6. **Type in chat**: "Create a deal for Acme Corp worth $75,000"
   - Inline approval card appears → click **Approve**
   - CIBA card appears: "Device Verification Required" with phone icon + countdown
   - **Show phone**: Guardian push notification arrives → tap Approve
   - Deal created
   - "Two-step consent. The app asks 'are you sure', then Auth0 independently verifies on a separate device."

7. **Quick contrast**: "Create a deal for SmallCo worth $10,000"
   - Only inline approval (no CIBA push)
   - "Routine actions don't need device verification. The agent is smart about when to escalate."

8. **Quick hits** (say while navigating, don't pause):
   - Click "Full audit log →": "Every action logged — including CIBA approval status"
   - Click "MCP" in nav: "External AI agents use the same secure pipeline via MCP"

## Act 4: Closing (30 sec)

> Deliver standing at the Permissions page or MCP Explorer.

"DealFlow AI demonstrates four levels of 'Authorized to Act':
1. **Per-tool** — capability toggles, trust levels, step-up approval
2. **Per-device** — CIBA Guardian push for high-value actions (two-step consent)
3. **Per-action** — the Action Center queues AI suggestions for human review
4. **Per-agent** — MCP gives external agents the same secure, audited access

All through Auth0 Token Vault. The AI never stores credentials. Every action is auditable. The user is always in control."

---

## Timing guide

| Act | Content | Target |
|-----|---------|--------|
| 1 | Chat + pipeline analysis | 0:00–0:45 |
| 2 | Action Center review + execute | 0:45–1:45 |
| 3 | Trust controls + audit + MCP | 1:45–2:30 |
| 4 | Closing statement | 2:30–3:00 |

## If something breaks

- Google not connected: "By design — the AI can't act without the user connecting first"
- Execution fails: "Errors surface to the user with Retry — no silent failures"
- No suggestions: "The AI only suggests when deals need attention — no spam"
- Slow API: Keep talking through the wait, the animations cover the latency
