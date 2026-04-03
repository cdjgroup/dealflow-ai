export const toolIcons: Record<string, string> = {
  checkCalendar: "📅",
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
  "draftEmail",
  "sendSlackMessage",
]);
