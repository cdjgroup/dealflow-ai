import type { CapabilityCategory } from "@/lib/surface-policy";
import type { ActionPriority } from "@/lib/types/actions";

export type TrustLevel = "always" | "ask" | "never";
export type AutonomyLevel = 1 | 2 | 3;

export interface ConfidenceThresholds {
  enabled?: boolean;     // toggle confidence-based routing (defaults to true)
  autoApprove: number;   // 0.0-1.0, actions above this auto-approve
  requireReview: number; // 0.0-1.0, actions below this always pending
}
// Invariant: autoApprove > requireReview

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
    notifyPriorities?: ActionPriority[];
  };
  mcpClients?: Record<string, McpClientPolicy>;
  autonomyLevel: AutonomyLevel;
  confidenceThresholds?: ConfidenceThresholds;
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
    notifyPriorities: ["high", "medium"],
  },
  autonomyLevel: 1,
  confidenceThresholds: {
    enabled: true,
    autoApprove: 0.85,
    requireReview: 0.5,
  },
};
