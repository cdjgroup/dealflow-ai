# DealFlow — Demo Script


## Demo Account

- **Email:** Demouser.ai.a
- **Password:** Claudec0deisthebest

---

## Setup (before recording)

1. Log in at https://dealflow-ai-seven.vercel.app (use demo account above)
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


**Show the Action Center screen** 

> "DealFlow suggests first and lets you decide.(point) It provides justification for the suggested action and its priority along with a confidence %."

**Click Edit** on an email action

> "I can refine the AI's draft before it goes anywhere."

**Click Approve → Execute** 

> (status changes) "That email draft just landed in Gmail through Auth0 Token Vault. The AI never touched my credentials."

**Verify on gmail tab** 


---

## Act 2: Chat — Multi-Step Orchestration (0:30–1:10)

> Switch to Chat.

Type **"I need to follow up with Sarah Chen about the Acme deal — check what we last discussed, find a time that works, and draft an email"**


> "One prompt, four tools. The agent pulled deal context, searched email history, checked calendar availability, and composed a follow-up. Each external API call went through Token Vault's short automatically exchanged, short-lived tokens."

Approval card appears for draftEmail → **approve it**.

> "The agent planned the whole chain autonomously but paused before the sensitive action. That's graduated authorization, the AI earns trust through transparency."

> "It can be taken away as well"

**adjust permisssions and ask again** 

---

## Act 3: CIBA Phone Approval — The Climax (1:10–1:55)



Type: **"Analyze my pipeline and suggest next steps"**


**Switch to Action Center** → **Show the Schedule panel** at top.
> "The user can opt into scheduled review times. At 8am, noon, or 5pm, a single Guardian push goes to their phone for all pending actions."

**Click "Run Now"** → show "Awaiting approval..." with pulsing indicator.
**Pick up phone** → show Guardian notification: "DealFlow: 5 actions - 3 email, 2 calendar"
> "One push notification. One decision. The binding message tells the user exactly what they're authorizing."

**Approve on phone** → watch actions flip from Pending to Completed in real-time.
> "Token Vault exchanged tokens for Google and Slack. Emails drafted, meetings scheduled, Slack updated — all within the CIBA token's time-boxed window. The AI acted autonomously, but only after device-level consent."

---

## Act 4: Unified Security + MCP (1:55–2:40)


### **Switch to Permissions** → disable Gmail (toggle off).

**Switch to Actions** → try to approve an email action → **Blocked**:

> "One toggle. Blocked in Actions, blocked in Chat, blocked for MCP agents. Same control, consistent everywhere."
**Re-enable Gmail.**


### Point at confidence indicators on action cards:
> "The AI scores its own confidence. The AI's uncertainty becomes a routing signal while it learns over time."



*### **Click MCP** in nav → show MCP Explorer with per-client policies.

> "External AI agents connect through our MCP endpoint — same Token Vault pipeline, same audit trail. Each agent gets its own policy: 'Cursor' gets full read access, 'CI Pipeline' gets CRM only, with parameter constraints that restrict what queries it can run."*



### **Click Audit** → show cross-surface entries with policyReason badges.

> "Every action across every surface — Chat, Action Center, MCP — logged with which policy layer decided, not just what happened."

---

## Act 5: Closing (2:40–3:00)

"DealFlow demonstrates **graduated trust** for AI agents:

1. **Per-tool** — capability toggles, trust levels, confidence routing
2. **Per-action** — AI suggests with justification, user reviews and edits before execution
3. **Per-schedule** — CIBA batch consent with time-boxed Token Vault execution
4. **Per-agent** — MCP gives external agents individually scoped, audited access




