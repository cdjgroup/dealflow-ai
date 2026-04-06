import { getUserSettings } from "@/lib/data/settings";

const HIGH_VALUE_THRESHOLD = 50_000;

// CRM write tools that can require approval via user settings
const CRM_WRITE_TOOLS = new Set([
  "createDeal",
  "updateDeal",
  "createContact",
  "logActivity",
]);

// External action tools — SDK needsApproval is DISABLED for these.
// The AI SDK's approval mechanism (needsApproval + sendAutomaticallyWhen/regenerate)
// has unfixable infinite loop bugs in ai@6.0.142 (vercel/ai#7717, #9968, #10169).
// Instead, the AI confirms with the user in chat before executing ("Does this look
// good?"), providing the same user control without the broken SDK approval cards.
// High-value CRM operations still use CIBA step-up auth (separate mechanism).
const EXTERNAL_ACTION_TOOLS = new Set([
  "createCalendarEvent",
  "draftEmail",
  "sendSlackMessage",
  "delegateResearch",
]);

/**
 * Creates a dynamic needsApproval function for a given tool.
 *
 * T1 (toolTrust per-tool) is NOT enforced here. The AI SDK's approval pipeline
 * (needsApproval → sendAutomaticallyWhen → collectToolApprovals) has unfixable
 * loop bugs in ai@6.0.142. Trust levels are enforced via:
 * - "never": capability-filter.ts removes the tool entirely (LLM never sees it)
 * - "ask": Action Center flow (our own API routes, proven reliable)
 * - "always": tool executes without interruption
 *
 * SDK needsApproval is only used for:
 * - S1: Value-based step-up (createDeal >$50K, updateDeal to terminal stages)
 * - U2: User settings-based approval (crmWrite toggle)
 */
export function createApprovalCheck(
  userId: string,
  toolName: string
): (params: Record<string, unknown>) => Promise<boolean> {
  return async (params: Record<string, unknown>) => {
    // S3: External action tools — SDK approval DISABLED (loop bug).
    // The AI confirms with the user in chat instead.
    if (EXTERNAL_ACTION_TOOLS.has(toolName)) {
      return false;
    }

    // Read-only tools never need SDK approval cards
    if (!CRM_WRITE_TOOLS.has(toolName)) {
      return false;
    }

    const settings = await getUserSettings(userId);

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
