/** Maps action types to Auth0 federated connection names for token exchange */
export const CONNECTION_MAP: Record<string, string> = {
  email: "google-oauth2",
  calendar: "google-oauth2",
  slack: "sign-in-with-slack",
};

/** Maps action types to user capability setting keys */
export const CAPABILITY_MAP: Record<string, "gmail" | "calendar" | "slack"> = {
  email: "gmail",
  calendar: "calendar",
  slack: "slack",
};

export const HIGH_VALUE_THRESHOLD = 50_000;

export const toolIcons: Record<string, string> = {
  checkCalendar: "📅",
  createCalendarEvent: "📅",
  draftEmail: "✉️",
  searchEmails: "🔍",
  listDeals: "📊",
  getDealDetails: "📋",
  searchContacts: "👤",
  createDeal: "➕",
  updateDeal: "✏️",
  createContact: "👥",
  logActivity: "📝",
  listSlackChannels: "💬",
  sendSlackMessage: "💬",
};

/** Token Vault tools use external OAuth — higher risk tier */
export const TOKEN_VAULT_TOOLS = new Set([
  "checkCalendar",
  "createCalendarEvent",
  "draftEmail",
  "searchEmails",
  "listSlackChannels",
  "sendSlackMessage",
]);

/** Write operations are medium risk */
export const WRITE_TOOLS = new Set([
  "createDeal",
  "updateDeal",
  "createContact",
  "logActivity",
  "createCalendarEvent",
  "draftEmail",
  "sendSlackMessage",
  "delegateResearch",
]);

/** Human-readable tool names for UI display */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  checkCalendar: "View Calendar",
  createCalendarEvent: "Create Event",
  draftEmail: "Draft Email",
  searchEmails: "Search Emails",
  listDeals: "List Deals",
  getDealDetails: "Deal Details",
  searchContacts: "Search Contacts",
  createDeal: "Create Deal",
  updateDeal: "Update Deal",
  createContact: "Create Contact",
  logActivity: "Log Activity",
  listSlackChannels: "List Channels",
  sendSlackMessage: "Send Message",
};

/** Tools available on MCP surface (read + CIBA-gated writes) */
export const MCP_SAFE_TOOLS = new Set([
  "listDeals",
  "getDealDetails",
  "searchContacts",
  "checkCalendar",
  "searchEmails",
  "listSlackChannels",
  "draftEmail",
  "createCalendarEvent",
  "sendSlackMessage",
]);

/** Tool access by trust tier */
export const TRUST_TIER_TOOLS: Record<string, string[]> = {
  full: [
    "listDeals",
    "getDealDetails",
    "searchContacts",
    "createDeal",
    "updateDeal",
    "createContact",
    "logActivity",
    "checkCalendar",
    "createCalendarEvent",
    "draftEmail",
    "searchEmails",
    "listSlackChannels",
    "sendSlackMessage",
  ],
  standard: [
    "listDeals",
    "getDealDetails",
    "searchContacts",
    "createDeal",
    "updateDeal",
    "createContact",
    "logActivity",
    "checkCalendar",
    "createCalendarEvent",
    "draftEmail",
    "searchEmails",
    "listSlackChannels",
  ],
  restricted: [
    "listDeals",
    "getDealDetails",
    "searchContacts",
    "checkCalendar",
    "searchEmails",
  ],
  readonly: [
    "listDeals",
    "getDealDetails",
  ],
};

/**
 * Actions with confidence below this threshold are forced to "pending" regardless
 * of autonomy level. Downgrade-only gate — high confidence never overrides existing
 * safety gates (CIBA, value thresholds). Based on research showing LLM self-reported
 * confidence is systematically overconfident (Xiong 2024); a model scoring <0.5 is
 * genuinely uncertain.
 */
export const LOW_CONFIDENCE_THRESHOLD = 0.5;

/** Human-readable OAuth scope labels (per Google/Slack consent screen patterns) */
export const SCOPE_LABELS: Record<string, string> = {
  "calendar.readonly": "View your calendar",
  "gmail.readonly": "Search your emails",
  "gmail.compose": "Draft emails",
  "calendar.events": "Create calendar events",
  "channels:read": "List channels",
  "chat:write": "Send messages",
};
