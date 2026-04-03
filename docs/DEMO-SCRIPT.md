# DealFlow AI — Demo Script

> 5-minute walkthrough for hackathon judges. Hit the strongest moments.

## Setup (before demo)

1. Log in at https://dealflow-ai-seven.vercel.app
2. Ensure Google and Slack are connected (Permissions page, green badges)
3. Seed demo data if needed (browser console: `fetch('/api/seed', { method: 'POST', headers: { 'X-Requested-With': 'XMLHttpRequest' } })`)
4. Clear any existing conversations (sidebar > Clear All)
5. Dismiss/reset any existing actions if needed

---

## Act 1: AI Chat with Token Vault (1 min)

**Talking point**: "DealFlow AI is a sales assistant that acts on behalf of the user through Auth0 Token Vault — never storing credentials."

1. Type: **"Show me my deals"**
   - AI uses CRM tools, shows 4 deals with values and stages
   - Point out: "This is internal data — no OAuth needed"

2. Type: **"What's on my calendar tomorrow?"**
   - Watch the **token lifecycle animation** appear in chat (6 stages)
   - Point out: "Auth0 Token Vault exchanges a refresh token for a short-lived Google access token. The AI never sees credentials."

## Act 2: AI Generates Action Center Suggestions (1 min)

**Talking point**: "The AI doesn't just answer questions — it proactively suggests next steps."

3. Type: **"Analyze my pipeline and suggest next steps"**
   - AI calls `analyzePipeline` tool
   - Returns: "Created X suggested actions in your Action Center"
   - Point out: "The AI analyzed deal stages, activity dates, and contact history to generate these"

4. **Click "Actions" in nav** — show the Action Center
   - Point out the badge count, filter tabs, justifications on each card
   - "Each suggestion explains WHY — judges and users see the AI's reasoning"

## Act 3: Human-in-the-Loop Review (1.5 min)

**Talking point**: "Authorized to Act means the user curates what the AI does — not just rubber-stamps it."

5. **Click Edit on an email action** — modify the subject line
   - "Users can customize every draft before it goes out"
   - Click Save

6. **Click Approve** on one action — card turns blue
   - "Approved doesn't mean executed. There's a deliberate two-step: approve, then execute."

7. **Click Execute** on the approved email
   - Watch status transition: Approved → Executing (pulse) → Completed (green)
   - "That email draft just landed in Gmail via Token Vault — same OAuth flow, different surface."

8. **Batch Approve** remaining actions
   - "For efficiency, approve multiple actions at once. Each still requires individual execution."

## Act 4: Trust Controls (1 min)

**Talking point**: "The same authorization model governs both chat and the Action Center."

9. **Go to Permissions** → set Gmail to disabled (or trust to "never")

10. **Go back to Actions** → try to Approve an email action
    - **Blocked** with error: "Cannot approve: gmail is disabled"
    - "Same control, different surface. The user's permissions are consistent everywhere."

11. **Re-enable Gmail** → Approve now works
    - "Granular control. The user decides what the AI can do."

## Act 5: Security Story (30 sec)

**Talking points** (say while navigating):
- **Permissions page**: "Every tool has capability toggles, trust levels, and connection status in one place"
- **Disconnect button**: "One click revokes the AI's access to Google or Slack — instantly"
- **Audit log** (click "Full audit log →"): "Every action the AI takes is logged — tool name, parameters, duration, success/failure"
- **Action Center**: "Even the Action Center execution writes to the audit trail"

---

## Key phrases for judges

- "The AI never stores credentials — Token Vault provides short-lived tokens via RFC 8693"
- "Authorized to Act means human-in-the-loop at every level: per-tool trust, approval flow, and Action Center review"
- "Same authorization pipeline whether the AI acts through chat or the Action Center"
- "The user sees WHY the AI suggests each action — full justification, not a black box"

## Fallback talking points (if something fails)

- If Google isn't connected: "This is by design — the AI can't act without the user connecting their account first"
- If execution fails: "The error is surfaced to the user with a Retry button — no silent failures"
- If no suggestions generated: "The AI only suggests actions when deals need attention — no spam"
