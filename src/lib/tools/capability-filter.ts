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
 * Filters a tools record by user capability settings and trust levels.
 * Tools whose category is disabled OR whose trust level is "never" are
 * removed entirely — the LLM never sees them.
 */
export function filterToolsByCapabilities(
  tools: Record<string, Tool>,
  settings: UserSettings
): Record<string, Tool> {
  const filtered: Record<string, Tool> = {};
  for (const [name, tool] of Object.entries(tools)) {
    // Hard-block: trust level "never" removes the tool entirely
    if (settings.toolTrust?.[name] === "never") continue;

    const category = TOOL_CATEGORIES[name];
    if (!category || settings.capabilities[category]) {
      filtered[name] = tool;
    }
  }
  return filtered;
}
