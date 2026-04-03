import { getUserSettings } from "@/lib/data/settings";

const HIGH_VALUE_THRESHOLD = 50_000;

// CRM write tools that can require approval via user settings
const CRM_WRITE_TOOLS = new Set([
  "createDeal",
  "updateDeal",
  "createContact",
  "logActivity",
]);

// External action tools always require approval (sends data outside the app)
const EXTERNAL_ACTION_TOOLS = new Set([
  "draftEmail",
  "sendSlackMessage",
]);

/**
 * Creates a dynamic needsApproval function for a given tool.
 *
 * Four layers of approval (checked in order):
 * - T1: Trust level override (toolTrust per-tool setting)
 * - S3: External action approval (draftEmail, sendSlackMessage always need approval)
 * - S1: Value-based step-up (createDeal >$50K, updateDeal to terminal stages)
 * - U2: User settings-based approval (crmWrite toggle)
 */
export function createApprovalCheck(
  userId: string,
  toolName: string
): (params: Record<string, unknown>) => Promise<boolean> {
  return async (params: Record<string, unknown>) => {
    const settings = await getUserSettings(userId);

    // T1: Trust level override — highest priority
    const trust = settings.toolTrust?.[toolName];
    if (trust === "always") return false;
    if (trust === "ask" || trust === "never") return true;

    // S3: External action tools always need approval
    if (EXTERNAL_ACTION_TOOLS.has(toolName)) {
      return true;
    }

    // Read-only tools never need approval (unless T1 overrode above)
    if (!CRM_WRITE_TOOLS.has(toolName)) {
      return false;
    }

    // S1: Value-based step-up for createDeal
    if (toolName === "createDeal") {
      const value = typeof params.value === "number" ? params.value : 0;
      if (value > HIGH_VALUE_THRESHOLD) return true;
    }

    // S1: Stage-based step-up for updateDeal (terminal stages are high-stakes)
    if (toolName === "updateDeal") {
      if (params.stage === "closed-won" || params.stage === "closed-lost") {
        return true;
      }
    }

    // U2: User settings-based approval
    if (settings.approvalRequired.crmWrite) {
      return true;
    }

    return false;
  };
}
