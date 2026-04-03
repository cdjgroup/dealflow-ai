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
};
