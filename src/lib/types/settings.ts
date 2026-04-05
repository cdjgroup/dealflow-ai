export type TrustLevel = "always" | "ask" | "never";
export type AutonomyLevel = 1 | 2 | 3;

export interface ActionTypeStats {
  approved: number;
  dismissed: number;
}

export type TrustStats = Record<"email" | "calendar" | "slack", ActionTypeStats>;

export const DEFAULT_TRUST_STATS: TrustStats = {
  email: { approved: 0, dismissed: 0 },
  calendar: { approved: 0, dismissed: 0 },
  slack: { approved: 0, dismissed: 0 },
};

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
  autonomyLevel: AutonomyLevel;
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
  autonomyLevel: 1,
};
