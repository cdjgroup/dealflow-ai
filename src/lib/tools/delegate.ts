import { tool } from "ai";
import { z } from "zod";
import { createDelegation } from "@/lib/delegation";
import { writeAuditEntry } from "@/lib/data/audit";
import { getUserSettings } from "@/lib/data/settings";
import { TOOL_SCOPES } from "@/lib/tools/scope-map";

// All valid tool names that can be delegated
const DELEGATABLE_TOOLS = new Set(Object.keys(TOOL_SCOPES));

/**
 * Tool that creates a scoped, time-limited delegation for research tasks.
 *
 * Approval is enforced externally by the chat route's attachApprovalChecks
 * (delegateResearch is in EXTERNAL_ACTION_TOOLS). This tool is NOT available
 * via MCP since it requires interactive approval.
 *
 * The delegation token is stored in Redis with TTL for audit/visualization
 * purposes. The primary agent executes delegated tools directly — there is
 * no separate agent process. Enforcement of the delegation scope is the
 * agent's responsibility (server-side enforcement is a future enhancement).
 */
export function createDelegateResearchTool(userId: string) {
  return tool({
    description:
      "Delegate scoped, time-limited access for a research task. " +
      "Creates a delegation token that records which tools are authorized and for how long. " +
      "Use this when you need to perform a multi-step research task that accesses " +
      "multiple external services (calendar, email, CRM). The user must approve " +
      "the delegation before it proceeds. After approval, execute the research " +
      "steps using the authorized tools and report findings.",
    inputSchema: z.object({
      purpose: z
        .string()
        .describe("Brief description of the research task (shown to user for consent)"),
      tools: z
        .array(z.string())
        .min(1)
        .max(6)
        .describe("List of tool names to delegate (e.g., ['checkCalendar', 'searchEmails'])"),
      ttlMinutes: z
        .number()
        .int()
        .min(1)
        .max(30)
        .default(5)
        .describe("How long the delegation lasts in minutes (1-30, default 5)"),
    }),
    execute: async ({
      purpose,
      tools,
      ttlMinutes,
    }: {
      purpose: string;
      tools: string[];
      ttlMinutes: number;
    }) => {
      // Validate tool names against known tools
      const invalidTools = tools.filter(t => !DELEGATABLE_TOOLS.has(t));
      if (invalidTools.length > 0) {
        return {
          error: `Unknown tool names: ${invalidTools.join(", ")}. Use valid tool names.`,
        };
      }

      // Cross-check against user's active capabilities
      const settings = await getUserSettings(userId);
      const disabledTools = tools.filter(t => {
        if (t === "checkCalendar" && !settings.capabilities.calendar) return true;
        if ((t === "draftEmail" || t === "searchEmails") && !settings.capabilities.gmail) return true;
        if ((t === "listSlackChannels" || t === "sendSlackMessage") && !settings.capabilities.slack) return true;
        if (["listDeals", "getDealDetails", "searchContacts"].includes(t) && !settings.capabilities.crmRead) return true;
        if (["createDeal", "updateDeal", "createContact", "logActivity"].includes(t) && !settings.capabilities.crmWrite) return true;
        return false;
      });
      if (disabledTools.length > 0) {
        return {
          error: `Cannot delegate disabled tools: ${disabledTools.join(", ")}. Enable them in Permissions first.`,
        };
      }

      const ttlSeconds = (ttlMinutes || 5) * 60;
      const delegation = await createDelegation(userId, tools, ttlSeconds);

      // Log the delegation creation to audit trail
      writeAuditEntry(userId, {
        threadId: "delegation",
        toolName: "delegateResearch",
        input: { purpose, tools, ttlMinutes, delegationId: delegation.id },
        result: "success",
        consentAction: "approved",
      });

      return {
        delegationId: delegation.id,
        purpose,
        authorizedTools: delegation.allowedTools,
        expiresAt: delegation.expiresAt,
        ttlSeconds,
        message:
          `Delegation created: ${delegation.allowedTools.length} tools recorded ` +
          `for ${ttlMinutes} minutes. Delegation ID: ${delegation.id}. ` +
          `Proceed with your research using the listed tools. ` +
          `All actions are tracked in the audit trail.`,
      };
    },
  });
}
