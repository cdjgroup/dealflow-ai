# DealFlow — Demo Script

> 3-minute max. Every second counts. No filler, no fumbling.

## Setup (before recording)

1. Log in at https://dealflow-ai-seven.vercel.app
2. Google and Slack connected (green badges on Permissions)
3. Click "Reseed Demo Data" on dashboard (resets CRM data + onboarding checklist)
4. Clear conversations (sidebar > Clear All)
5. Clear/dismiss existing actions so Action Center starts fresh
6. Enable at least one schedule time in Action Center (12pm or 5pm)
7. Have Permissions page open in a second tab (for fast switch)
8. Have Guardian app ready on phone for CIBA approval

---

## Act 1: The AI Acts Through Token Vault (45 sec)

> "DealFlow is a sales assistant that acts on the user's behalf through Auth0 Token Vault. The AI never stores credentials."

1. Type: **"What's on my calendar tomorrow?"**
   - "Auth0 exchanges a refresh token for a short-lived Google access token. The AI gets a scoped token, never credentials."

2. Type: **"I need to follow up with Sarah Chen about the Acme deal — check what we last discussed, find a time that works, and draft an email"**
   - AI chains: `getDealDetails` → `searchEmails` → `checkCalendar` → `draftEmail` (4 tools, one prompt)
   - "One prompt, four tools. The agent reasoned through the workflow — deal context, email history, calendar availability — then composed a follow-up. Each external call went through Token Vault."
   - Approval card appears for draftEmail → approve it
   - "The agent planned the whole chain autonomously, but paused before the sensitive action. That's graduated authorization."

3. Type: **"Analyze my pipeline and suggest next steps"**
   - AI calls `analyzePipeline`, creates suggestions
   - "The AI read 8 deals across the full pipeline and generated prioritized action items for the Action Center."

## Act 2: Action Center — Review Before Execution (1 min)

> "Authorized to Act means the user sees what the AI wants to do, why, and decides whether it happens."

4. **Click Actions** in nav — show the Action Center
   - Point at a card: "Each suggestion has a justification — the AI explains its reasoning."
   - Point at priorities: "High priority for stale high-value deals, medium for routine follow-ups."

5. **Click Edit** on an email action → change the subject → Save
   - "The user can customize every draft. This isn't rubber-stamping — it's informed consent."

6. **Click Approve → Execute** on one email action
   - Watch: Approved (blue) → Executing (pulse) → Completed (green)
   - "That draft just landed in Gmail through Token Vault. Same OAuth flow as chat, different surface."

## Act 3: Scheduled Execution via CIBA (45 sec)

> "The agent can act autonomously on a schedule — but only with device-level consent."

7. **Show the Schedule panel** at top of Action Center
   - Point at checkboxes: "The user opts into review times. At each time, a single Guardian push goes to their phone."
   - Point at "Run Now": "For the demo, we'll trigger it on demand."

8. **Click "Run Now"** → show "Awaiting approval..." in UI
   - **Pick up phone** → show Guardian notification: "DealFlow: 5 actions - 3 email, 2 calendar"
   - "One push, one decision. The binding message tells the user what they're authorizing."
   - **Approve on phone** → watch actions flip from Pending to Sent in real-time
   - "Token Vault exchanged tokens for Google and Slack — emails drafted, meetings scheduled, Slack updated. All within the CIBA token's time-boxed window."

## Act 3b: Confidence Routing + MCP Constraints (20 sec)

> "The AI scores its own confidence, and the system routes accordingly."

8b. **Show confidence routing** (in Action Center or Actions page)
   - Point at confidence indicators: "The AI scores its confidence 0 to 1. Above 85%, actions auto-approve. Below 50%, forced to manual review. The middle band follows the user's autonomy setting — graduated trust, not binary."

8c. **Show MCP parameter constraints** (in MCP client config at /dashboard/mcp)
   - Click into a client's policy: "External agents can be constrained at the parameter level — regex patterns restrict what queries they can run. Defense in depth for the agent ecosystem."

## Act 4: Trust Controls & Security (30 sec)

> "The same authorization model governs every surface — chat, Action Center, scheduled execution, and external agents."

9. **Switch to Permissions tab** → disable Gmail (toggle off or trust to "never")

10. **Switch back to Actions** → try to Approve another email action
   - **Blocked**: "Cannot approve: gmail is disabled"
   - "Same control, consistent everywhere. The user's decision propagates to every surface."

11. **Quick hits** (say while navigating, don't pause):
   - Re-enable Gmail
   - Click "Full audit log →": "Every action — chat and Action Center — logged with parameters, duration, status"
   - Click "MCP" in nav: "External AI agents like OpenClaw can discover and use these same tools through MCP. Same Token Vault pipeline, same audit trail. This isn't just one app's security — it's a reusable pattern for the AI agent ecosystem."

## Act 5: Closing (15 sec)

> Deliver standing at the Permissions page or MCP Explorer.

"DealFlow demonstrates four levels of 'Authorized to Act':
1. **Per-tool** — capability toggles, trust levels, step-up approval
2. **Per-action** — the Action Center queues AI suggestions for human review
3. **Per-schedule** — CIBA batch consent with time-boxed execution for autonomous agent action
4. **Per-agent** — MCP gives external agents the same secure, audited access

All through Auth0 Token Vault. The AI never stores credentials. Every action is auditable. The user is always in control."

---

## Timing guide

| Act | Content | Target |
|-----|---------|--------|
| 1 | Multi-step orchestration + pipeline analysis | 0:00–0:45 |
| 2 | Action Center review + execute | 0:45–1:30 |
| 3 | Scheduled execution via CIBA | 1:30–2:15 |
| 3b | Confidence routing + MCP constraints | 2:15–2:35 |
| 4 | Trust controls + audit + MCP | 2:35–2:50 |
| 5 | Closing statement | 2:50–3:00 |

## If something breaks

- Google not connected: "By design — the AI can't act without the user connecting first"
- Execution fails: "Errors surface to the user with Retry — no silent failures"
- No suggestions: "The AI only suggests when deals need attention — no spam"
- Slow API: Keep talking through the wait, the animations cover the latency
