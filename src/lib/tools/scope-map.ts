/**
 * Static mapping of tool names to their required OAuth scopes.
 * Used by the ScopeIndicator component to show which scopes
 * are actively being used during tool execution.
 */
export const TOOL_SCOPES: Record<string, string[]> = {
  checkCalendar: ["calendar.readonly"],
  searchEmails: ["gmail.readonly"],
  draftEmail: ["gmail.compose", "gmail.readonly"],
  listSlackChannels: ["channels:read"],
  sendSlackMessage: ["chat:write"],
  // CRM tools have no external OAuth scopes
  listDeals: [],
  getDealDetails: [],
  searchContacts: [],
  createDeal: [],
  updateDeal: [],
  createContact: [],
  logActivity: [],
};

/**
 * Returns the display-friendly provider name for a set of scopes.
 */
export function scopeProvider(scopes: string[]): string | null {
  if (scopes.some((s) => s.startsWith("calendar") || s.startsWith("gmail"))) {
    return "Google";
  }
  if (scopes.some((s) => s.includes("channels") || s.includes("chat"))) {
    return "Slack";
  }
  return null;
}
