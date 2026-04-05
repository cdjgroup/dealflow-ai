# DealFlow AI — Demo Script

> 3-minute max. Every second counts. Lead with wow, not setup.
>
> **Thesis (say this or a variant within 30 seconds):**
> "DealFlow AI implements graduated trust for AI agents — four trust levels, three execution surfaces, one Auth0 Token Vault pipeline."

## Setup (before recording)

1. Log in at https://dealflow-ai-seven.vercel.app
2. Google and Slack connected (green badges on Permissions)
3. Click "Reseed Demo Data" on dashboard (resets CRM + actions)
4. Run "Analyze my pipeline" in chat so Action Center has AI-generated suggestions
5. Verify Action Center has 5+ suggestions with confidence scores and justifications
6. Enable at least one schedule time in Action Center (e.g., 12pm)
7. Have Permissions page open in a second tab (for fast switch)
8. Have Guardian app ready on phone — test a CIBA push before recording
9. Pre-create at least one MCP client with parameter constraints in MCP Explorer

---

## Act 1: Action Center — The 30-Second Wow (0:00–0:30)

> Open on Action Center, already populated with AI suggestions. Do NOT start with chat.

**Show the Action Center screen** — 5 AI-suggested actions with justification text, priority badges, and confidence scores visible.

> "Most AI agents act first and apologize later. DealFlow AI suggests first and lets you decide."

Point at a card:
> "The AI analyzed my sales pipeline and generated five next steps. Each one explains why — 'Acme deal inactive 7 days, $150K in qualified stage, follow-up keeps momentum.' Every draft is editable. Nothing executes until I say so."

**Click Edit** on an email action → change the subject line → Save.
> "I can refine the AI's draft before it goes anywhere. This is informed consent, not rubber-stamping."

**Click Approve → Execute** on the edited email action.
Watch: Approved (blue) → Executing (pulse) → Completed (green).
> "That email draft just landed in Gmail through Auth0 Token Vault. The AI never touched my credentials."

---

## Act 2: Chat — Multi-Step Orchestration (0:30–1:10)

> Switch to Chat. Show the AI is genuinely capable, not just a Token Vault wrapper.

Type: **"I need to follow up with Sarah Chen about the Acme deal — check what we last discussed, find a time that works, and draft an email"**

AI chains: `getDealDetails` → `searchEmails` → `checkCalendar` → `draftEmail` (4 tools, one prompt).
> "One prompt, four tools. The agent pulled deal context, searched email history, checked calendar availability, and composed a follow-up. Each external API call went through Token Vault — short-lived tokens, automatically exchanged."

Approval card appears for draftEmail → **approve it**.
> "The agent planned the whole chain autonomously but paused before the sensitive action. That's graduated authorization — the AI earns trust through transparency."

---

## Act 3: CIBA Phone Approval — The Climax (1:10–1:55)

> This is the most memorable moment. Phone visible next to laptop.

Type: **"Analyze my pipeline and suggest next steps"**
AI calls `analyzePipeline`, creates new suggestions in Action Center.

**Switch to Action Center** → **Show the Schedule panel** at top.
> "The user can opt into scheduled review times. At 8am, noon, or 5pm, a single Guardian push goes to their phone for all pending actions."

**Click "Run Now"** → show "Awaiting approval..." with pulsing indicator.
**Pick up phone** → show Guardian notification: "DealFlow: 5 actions - 3 email, 2 calendar"
> "One push notification. One decision. The binding message tells the user exactly what they're authorizing."

**Approve on phone** → watch actions flip from Pending to Completed in real-time.
> "Token Vault exchanged tokens for Google and Slack. Emails drafted, meetings scheduled, Slack updated — all within the CIBA token's time-boxed window. The AI acted autonomously, but only after device-level consent."

---

## Act 4: Unified Security + MCP (1:55–2:40)

> Fast-paced. Prove the security model is real, not decorative.

### Disable-and-Block (15 sec)
**Switch to Permissions** → disable Gmail (toggle off).
**Switch to Actions** → try to approve an email action → **Blocked**: "Cannot approve: gmail is disabled"
> "One toggle. Blocked in Actions, blocked in Chat, blocked for MCP agents. Same control, consistent everywhere."
**Re-enable Gmail.**

### Confidence Routing (10 sec)
Point at confidence indicators on action cards:
> "The AI scores its own confidence. Above 85%, auto-approved. Below 50%, forced to manual review regardless of the user's autonomy setting. The AI's uncertainty becomes a routing signal."

### MCP Ecosystem (20 sec)
**Click MCP** in nav → show MCP Explorer with per-client policies.
> "External AI agents connect through our MCP endpoint — same Token Vault pipeline, same audit trail. Each agent gets its own policy: 'Cursor' gets full read access, 'CI Pipeline' gets CRM only, with parameter constraints that restrict what queries it can run."

### Audit Trail (10 sec)
**Click Audit** → show cross-surface entries with policyReason badges.
> "Every action across every surface — Chat, Action Center, MCP — logged with which policy layer decided, not just what happened."

---

## Act 5: Closing (2:40–3:00)

> Deliver standing at the MCP Explorer or Audit page.

"DealFlow AI demonstrates **graduated trust** for AI agents:

1. **Per-tool** — capability toggles, trust levels, confidence routing
2. **Per-action** — AI suggests with justification, user reviews and edits before execution
3. **Per-schedule** — CIBA batch consent with time-boxed Token Vault execution
4. **Per-agent** — MCP gives external agents individually scoped, audited access

Three surfaces. One Auth0 Token Vault pipeline. The AI never stores credentials. Every action is auditable. And the system learns — after enough approvals, it suggests upgrading to auto-approve. Trust is earned, not assumed.

27 documented insights. 310+ tests. Built in 5 days."

---

## Timing guide

| Act | Content | Target | Wow Moment |
|-----|---------|--------|------------|
| 1 | Action Center: justify, edit, execute | 0:00–0:30 | Screen full of reasoned AI suggestions |
| 2 | Chat: multi-step tool orchestration | 0:30–1:10 | One prompt, four Token Vault exchanges |
| 3 | CIBA: scheduled batch phone approval | 1:10–1:55 | Pick up phone, approve, watch UI flip |
| 4 | Security: disable/block + confidence + MCP + audit | 1:55–2:40 | One toggle blocks all surfaces |
| 5 | Closing: graduated trust thesis | 2:40–3:00 | Stats + thesis |

## If something breaks

- Google not connected: "By design — the AI can't act without the user connecting first"
- CIBA push delayed: Keep talking about the binding message security. "The push includes exactly what's being authorized — no blank check."
- Execution fails: "Errors surface to the user with Retry. No silent failures — that's production-aware design."
- Slow API: Keep narrating. The status animations (pulse, color changes) cover latency visually.
- No suggestions from analyzePipeline: Use pre-seeded actions. "The AI only suggests when deals need attention."

## What NOT to show (put in Devpost text instead)

- Glassmorphism / animation details — judges see it, don't narrate it
- Scope narrowing — too subtle for video
- Cross-agent delegation tool — complex, not visual
- Provider branding details — invisible to judges
- Architecture diagram — Devpost text
- Landing page — skip directly to dashboard
