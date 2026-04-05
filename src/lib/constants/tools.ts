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

/** Tools that are safe for MCP surface (read-only, no high-risk writes) */
export const MCP_SAFE_TOOLS = new Set([
  "listDeals",
  "getDealDetails",
  "searchContacts",
  "checkCalendar",
  "searchEmails",
  "listSlackChannels",
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

/** Human-readable OAuth scope labels (per Google/Slack consent screen patterns) */
export const SCOPE_LABELS: Record<string, string> = {
  "calendar.readonly": "View your calendar",
  "gmail.readonly": "Search your emails",
  "gmail.compose": "Draft emails",
  "calendar.events": "Create calendar events",
  "channels:read": "List channels",
  "chat:write": "Send messages",
};
