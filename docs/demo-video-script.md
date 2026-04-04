# Demo Video Script — DealFlow AI (3 minutes)

## Pre-Recording Checklist
- [ ] Seed demo data (click "Load Demo Data" or POST /api/seed)
- [ ] Ensure Google is connected (Calendar + Gmail)
- [ ] Clear any previous chat history
- [ ] Browser in dark mode for visual impact
- [ ] Record at 1080p or higher

---

## 0:00–0:15 — Opening Hook (15s)

**Show:** Landing page at dealflow-ai-seven.vercel.app

**Say:** "DealFlow AI is an AI sales agent that manages your pipeline, checks calendars, drafts emails, and sends Slack updates. But what makes it different isn't the AI — it's the security model. Let me show you."

**Action:** Click "Sign In" → Auth0 login → redirects to dashboard

---

## 0:15–0:45 — Core Agent Demo (30s)

**Show:** Dashboard with chat + deal sidebar

**Say:** "Here's my pipeline — six active deals worth $330K, plus a closed-won and a lost deal. Let me ask the agent about one."

**Action:** Type: "What's the status of the Meridian deal?"

**Show:** Agent calls getDealDetails → rich deal card appears with stage badge, value, contact info, activity timeline

**Say:** "The agent pulled the deal details, contact, and full activity history. Notice the tool result renders as a structured card, not plain text."

---

## 0:45–1:15 — Token Vault + Multi-Tool Chain (30s)

**Say:** "Now let me ask something that requires multiple tools and Google access."

**Action:** Type: "Check my calendar for tomorrow and draft a follow-up email to Sarah Chen about available meeting times"

**Show:** Agent chains checkCalendar → draftEmail. Calendar card shows events + free slots. Email draft card shows To/Subject with "Open in Gmail" link.

**Say:** "The agent checked my Google Calendar via Auth0 Token Vault, found free slots, then drafted an email in Gmail. Notice — it creates a draft, never sends. And each tool only requests the scopes it needs: calendar gets read-only, email drafting gets compose."

---

## 1:15–1:45 — Security & User Control (30s)

**Action:** Navigate to Permissions page

**Show:** Capability toggles, connection status, approval toggle

**Say:** "This is where DealFlow AI is different. Users control exactly what the agent can do. Watch what happens when I disable Gmail."

**Action:** Toggle Gmail OFF → go back to chat → type "Draft an email to Marcus"

**Show:** Agent responds that Gmail tools are disabled

**Say:** "The agent can't even see email tools — they're removed from its tool set entirely. Not a permission check at runtime — the LLM doesn't know they exist."

**Action:** Toggle Gmail back ON

---

## 1:45–2:25 — Two-Step Consent: Inline + CIBA Device Approval (40s)

**Say:** "Now the key security feature. Watch what happens with a high-value deal."

**Action:** Type: "Create a new deal for Acme Corp, $75,000, proposal stage"

**Show:** Approval card appears with deal details and Approve/Reject buttons

**Say:** "First — app-level consent. The agent pauses and shows me exactly what it wants to do."

**Action:** Click Approve

**Show:** CibaInlineCard appears — phone icon, "Device Verification Required", binding message, pulsing indicator, countdown timer

**Say:** "But that's not enough for a $75K deal. Auth0 now sends a push notification to my phone via Guardian. The identity provider independently verifies on a separate device."

**Action:** Show phone receiving Guardian push notification → tap Approve

**Show:** CibaInlineCard shows "Approved on Device" → deal created

**Say:** "Two-step consent — like a bank wire transfer. The app asks 'are you sure', then Auth0 verifies on a physically separate device. The AI agent can never act on high-value decisions without two independent confirmations."

**Action:** Navigate to Audit Log page

**Show:** Table with all tool invocations, timestamps, parameters, status, duration

**Say:** "Every action is logged with full transparency."

---

## 2:15–2:40 — Disconnect & Token Vault Scoping (25s)

**Action:** Navigate back to Permissions

**Say:** "Users can also disconnect their Google account at any time."

**Action:** Click Disconnect Google → confirm

**Show:** Status changes to disconnected

**Say:** "Cached tokens are cleared. Next time the agent needs Google, it'll ask for fresh consent. This is Auth0 Token Vault's value — tokens are scoped, short-lived, and user-revocable."

**Action:** Show Connection Status section showing disconnected state

---

## 2:40–3:00 — Architecture + Closing (20s)

**Show:** README architecture diagram (open GitHub repo) or a prepared slide

**Say:** "Under the hood, every request passes through six security layers: CSRF protection, rate limiting, capability filtering, step-up authorization, scoped Token Vault exchange, and audit logging. Two Token Vault connections — Google and Slack — using the same RFC 8693 pattern. Built with Next.js, Claude, Auth0, and Upstash Redis."

**Say:** "DealFlow AI — because AI agents should be powerful AND accountable."

---

## Recording Tips
- Keep mouse movements deliberate and slow
- Pause briefly after each tool result card appears (let judges read it)
- Don't rush the Permissions page — linger on the toggles and audit log
- If the Token Vault consent popup appears, that's GOOD — show it
- Consider a brief picture-in-picture of yourself for the opening/closing
