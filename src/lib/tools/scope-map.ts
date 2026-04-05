export interface ToolScopeConfig {
  connection: string;
  provider: string;
  scopes: string[];
  minScope: string;
  accessLevel: "read" | "write";
  dataDescription: string;
}

export type TokenVaultToolName =
  | "checkCalendar"
  | "createCalendarEvent"
  | "searchEmails"
  | "draftEmail"
  | "listSlackChannels"
  | "sendSlackMessage";

export const TOOL_SCOPE_CONFIG: Record<TokenVaultToolName, ToolScopeConfig> = {
  checkCalendar: {
    connection: "google-oauth2",
    provider: "Google",
    scopes: ["calendar.readonly"],
    minScope: "calendar.readonly",
    accessLevel: "read",
    dataDescription: "Google Calendar events and availability",
  },
  createCalendarEvent: {
    connection: "google-oauth2",
    provider: "Google",
    scopes: ["calendar.events"],
    minScope: "calendar.events",
    accessLevel: "write",
    dataDescription: "Google Calendar event creation",
  },
  searchEmails: {
    connection: "google-oauth2",
    provider: "Google",
    scopes: ["gmail.readonly"],
    minScope: "gmail.readonly",
    accessLevel: "read",
    dataDescription: "Gmail messages and metadata",
  },
  draftEmail: {
    connection: "google-oauth2",
    provider: "Google",
    scopes: ["gmail.compose", "gmail.readonly"],
    minScope: "gmail.compose",
    accessLevel: "write",
    dataDescription: "Gmail draft creation",
  },
  listSlackChannels: {
    connection: "sign-in-with-slack",
    provider: "Slack",
    scopes: ["channels:read"],
    minScope: "channels:read",
    accessLevel: "read",
    dataDescription: "Slack public channels list",
  },
  sendSlackMessage: {
    connection: "sign-in-with-slack",
    provider: "Slack",
    scopes: ["chat:write"],
    minScope: "chat:write",
    accessLevel: "write",
    dataDescription: "Slack message posting",
  },
};

// Derived from TOOL_SCOPE_CONFIG — used by ScopeIndicator component
export const TOOL_SCOPES: Record<string, string[]> = {
  ...Object.fromEntries(
    Object.entries(TOOL_SCOPE_CONFIG).map(([k, v]) => [k, v.scopes])
  ),
  // CRM tools have no external OAuth scopes
  listDeals: [],
  getDealDetails: [],
  searchContacts: [],
  createDeal: [],
  updateDeal: [],
  createContact: [],
  logActivity: [],
};

export function scopeProvider(scopes: string[]): string | null {
  if (scopes.some((s) => s.startsWith("calendar") || s.startsWith("gmail"))) {
    return "Google";
  }
  if (scopes.some((s) => s.includes("channels") || s.includes("chat"))) {
    return "Slack";
  }
  return null;
}
