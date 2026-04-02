import { getUserSettings } from "@/lib/data/settings";

const HIGH_VALUE_THRESHOLD = 50_000;

// CRM write tools that can require approval
const CRM_WRITE_TOOLS = new Set([
  "createDeal",
  "updateDeal",
  "createContact",
  "logActivity",
]);

/**
 * Creates a dynamic needsApproval function for a given tool.
 * Combines S1 (value-based step-up) and U2 (user settings-based approval).
 *
 * Returns a function that inspects tool params and user settings to decide
 * whether the tool call requires user approval before execution.
 */
export function createApprovalCheck(
  userId: string,
  toolName: string
): (params: Record<string, unknown>) => Promise<boolean> {
  // Read-only tools never need approval
  if (!CRM_WRITE_TOOLS.has(toolName)) {
    return async () => false;
  }

  return async (params: Record<string, unknown>) => {
    // S1: Value-based step-up for createDeal
    if (toolName === "createDeal") {
      const value = typeof params.value === "number" ? params.value : 0;
      if (value > HIGH_VALUE_THRESHOLD) return true;
    }

    // S1: Stage-based step-up for updateDeal (closing a deal is high-stakes)
    if (toolName === "updateDeal" && params.stage === "closed-won") {
      return true;
    }

    // U2: User settings-based approval
    const settings = await getUserSettings(userId);
    if (settings.approvalRequired.crmWrite) {
      return true;
    }

    return false;
  };
}
