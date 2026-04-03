import { tool } from "ai";
import { z } from "zod";
import { createDelegation } from "@/lib/delegation";
import { writeAuditEntry } from "@/lib/data/audit";

/**
 * Tool that creates a scoped, time-limited delegation for research tasks.
 * Uses needsApproval so the user consents before the delegation is created.
 *
 * The delegation token tracks which tools were authorized, for how long,
 * and links all subsequent tool calls via delegationId in the audit trail.
 */
export function createDelegateResearchTool(userId: string) {
  return tool({
    description:
      "Delegate scoped, time-limited access for a research task. " +
      "Creates a delegation token that authorizes specific tools for a limited time. " +
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
      const ttlSeconds = (ttlMinutes || 5) * 60;
      const delegation = await createDelegation(userId, tools, ttlSeconds);

      // Log the delegation creation to audit trail
      writeAuditEntry(userId, {
        threadId: "delegation",
        toolName: "delegateResearch",
        input: { purpose, tools, ttlMinutes },
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
          `Delegation created: ${delegation.allowedTools.length} tools authorized ` +
          `for ${ttlMinutes} minutes. Delegation ID: ${delegation.id}. ` +
          `Proceed with your research using the authorized tools. ` +
          `All actions will be tracked under this delegation.`,
        _delegation: {
          id: delegation.id,
          allowedTools: delegation.allowedTools,
          expiresAt: delegation.expiresAt,
          createdAt: delegation.createdAt,
        },
      };
    },
  });
}
