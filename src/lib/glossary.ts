export const GLOSSARY: Record<string, string> = {
  "token-vault":
    "Auth0's secure credential store that holds OAuth refresh tokens. The AI agent never sees these — it only receives short-lived access tokens via RFC 8693 exchange.",
  "step-up-auth":
    "A security mechanism that prompts for explicit user approval before high-risk actions, such as creating deals over $50K or changing deal stages to closed-won.",
  "capability-toggles":
    "Per-user settings that control which tools the AI agent can access. Disabled tools are completely hidden from the agent — it cannot see or invoke them.",
  "audit-trail":
    "A chronological record of every tool the AI agent invokes, including timestamps, parameters, results, and duration. Viewable on the Permissions page.",
  "connected-accounts":
    "OAuth connections stored in Auth0 Token Vault. Each connection grants the AI agent access to a specific service (Google, Slack) with defined scopes.",
  "short-lived-token":
    "An access token that expires quickly (typically minutes). The AI agent receives these via token exchange — if compromised, exposure is limited by the short lifetime.",
  "rfc-8693":
    "The OAuth 2.0 Token Exchange standard. DealFlow AI uses this to exchange a user's refresh token for a short-lived access token scoped to a specific API (Google Calendar, Gmail, Slack).",
  "needs-approval":
    "A tool flag that triggers user confirmation before execution. Used for external actions (email, Slack) and high-value CRM operations.",
  ciba: "Client Initiated Backchannel Authentication — Auth0 Guardian sends a push notification to your phone for device-level consent. Used for high-value chat actions (deals >$50K) and batch scheduled execution.",
  mcp: "Model Context Protocol — an open standard that lets external AI agents (Claude Desktop, Cursor, OpenClaw) discover and invoke DealFlow AI's tools via the /api/mcp endpoint. Same Token Vault pipeline, same audit trail.",
  "confidence-routing":
    "AI confidence scores (0.0–1.0) drive action routing. High confidence (≥85%) auto-approves; low confidence (≤50%) forces manual review. The middle band defers to your autonomy setting.",
  "trust-calibration":
    "The system tracks per-tool approval rates and suggests upgrading frequently-approved tools to auto-approve. After 5+ decisions at >80% approval rate, a nudge appears. You decide — the system never auto-escalates.",
  "circuit-breaker":
    "Two-layer rate limiting for AI tool execution. Per-tool limits (read 10/min, write 5/min) and a per-request cap (15 tools max). Prevents runaway tool loops.",
  "scheduled-actions":
    "Opt into review times (8am, 12pm, 5pm). At each scheduled time, a single CIBA Guardian push approves all high/medium priority pending actions in a batch. The token lifetime serves as the execution boundary.",
};
