import type { UserSettings } from "@/lib/types/settings";
import type { Tool } from "ai";

const TOOL_CATEGORIES: Record<string, keyof UserSettings["capabilities"]> = {
  // CRM Read
  listDeals: "crmRead",
  getDealDetails: "crmRead",
  searchContacts: "crmRead",
  // CRM Write
  createDeal: "crmWrite",
  updateDeal: "crmWrite",
  createContact: "crmWrite",
  logActivity: "crmWrite",
  // Calendar
  checkCalendar: "calendar",
  // Gmail
  draftEmail: "gmail",
  searchEmails: "gmail",
  // Slack
  listSlackChannels: "slack",
  sendSlackMessage: "slack",
};

/**
 * Filters a tools record by user capability settings.
 * Tools whose category is disabled are removed entirely —
 * the LLM never sees them, producing cleaner agent behavior.
 */
export function filterToolsByCapabilities(
  tools: Record<string, Tool>,
  settings: UserSettings
): Record<string, Tool> {
  const filtered: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(tools)) {
    const category = TOOL_CATEGORIES[name];
    if (!category || settings.capabilities[category]) {
      filtered[name] = tool;
    }
  }
  return filtered;
}
