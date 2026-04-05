import type { CapabilityCategory } from "@/lib/surface-policy";

export type TrustLevel = "always" | "ask" | "never";

export interface McpClientPolicy {
  allowedCategories: CapabilityCategory[];
  label?: string;
}

export interface UserSettings {
  capabilities: {
    crmRead: boolean;
    crmWrite: boolean;
    calendar: boolean;
    gmail: boolean;
    slack: boolean;
  };
  approvalRequired: {
    crmWrite: boolean;
  };
  toolTrust: Record<string, TrustLevel>;
  schedule: {
    enabled: boolean;
    hours: number[];
    timezone: string;
  };
  mcpClients?: Record<string, McpClientPolicy>;
}

export const DEFAULT_SETTINGS: UserSettings = {
  capabilities: {
    crmRead: true,
    crmWrite: true,
    calendar: true,
    gmail: true,
    slack: false,
  },
  approvalRequired: {
    crmWrite: false,
  },
  toolTrust: {},
  schedule: {
    enabled: false,
    hours: [],
    timezone: "UTC",
  },
};
