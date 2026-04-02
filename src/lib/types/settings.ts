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
};
