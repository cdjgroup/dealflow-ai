import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkCalendar } from "@/lib/tools/calendar";
import { draftEmail, searchEmails } from "@/lib/tools/gmail";
import { listSlackChannels, sendSlackMessage } from "@/lib/tools/slack";
import { createCrmTools } from "@/lib/tools/crm";
import { writeAuditEntry } from "@/lib/data/audit";

// Tools that require approval in the chat UI are excluded from MCP
// because MCP has no interactive approval flow.
const APPROVAL_REQUIRED_TOOLS = new Set([
  "draftEmail",
  "sendSlackMessage",
  "delegateResearch",
]);

interface ToolEntry {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

/**
 * Build the list of tools safe for MCP exposure.
 * Excludes tools requiring approval (no approval UI in MCP).
 * Uses a placeholder userId for CRM tools — real userId comes at call time.
 */
function getMcpSafeTools(): ToolEntry[] {
  // AI SDK tool objects store schema and execute on the object
  // We extract what we need with explicit type access
  type AiTool = {
    description?: string;
    inputSchema: z.ZodObject<z.ZodRawShape>;
    execute?: (params: never, ctx: never) => unknown;
  };

  const toolDefs: Array<{ name: string; tool: AiTool }> = [
    { name: "checkCalendar", tool: checkCalendar as unknown as AiTool },
    { name: "searchEmails", tool: searchEmails as unknown as AiTool },
    { name: "listSlackChannels", tool: listSlackChannels as unknown as AiTool },
  ];

  // CRM read-only tools (safe for MCP — no approval needed)
  const crmTools = createCrmTools("mcp-placeholder");
  for (const [name, t] of Object.entries(crmTools)) {
    if (APPROVAL_REQUIRED_TOOLS.has(name)) continue;
    // CRM write tools (createDeal, updateDeal, etc.) may need approval
    // for high-value operations — exclude all CRM writes from MCP for safety
    if (["createDeal", "updateDeal", "createContact", "logActivity"].includes(name)) continue;
    toolDefs.push({ name, tool: t as unknown as AiTool });
  }

  return toolDefs
    .filter(({ name }) => !APPROVAL_REQUIRED_TOOLS.has(name))
    .map(({ name, tool }) => ({
      name,
      description: tool.description || name,
      schema: tool.inputSchema,
      execute: async (params: Record<string, unknown>) => {
        const result = await tool.execute!(params as never, {
          toolCallId: "mcp",
          messages: [],
          abortSignal: AbortSignal.timeout(55000),
        } as never);
        return result;
      },
    }));
}

/**
 * Returns a function that registers MCP-safe tools on an MCP server.
 *
 * Security: Only read-only tools are exposed. Tools requiring approval
 * (external actions, CRM writes, delegation) are excluded because MCP
 * has no interactive approval flow. This mirrors filterToolsByCapabilities
 * and attachApprovalChecks from the chat route.
 */
export function adaptToolsForMcp() {
  return async (server: McpServer) => {
    const tools = getMcpSafeTools();

    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.schema,
        },
        async (args: unknown) => {
          const params = (args ?? {}) as Record<string, unknown>;
          const start = Date.now();
          try {
            const result = await tool.execute(params);
            const durationMs = Date.now() - start;

            writeAuditEntry("mcp-authenticated", {
              threadId: "mcp",
              toolName: tool.name,
              input: params,
              result: "success",
              durationMs,
            });

            // Strip _tokenMeta from MCP response
            const clean = typeof result === "object" && result !== null
              ? Object.fromEntries(
                  Object.entries(result as Record<string, unknown>).filter(([k]) => k !== "_tokenMeta")
                )
              : result;

            return {
              content: [{ type: "text" as const, text: JSON.stringify(clean) }],
            };
          } catch (err) {
            const durationMs = Date.now() - start;
            writeAuditEntry("mcp-authenticated", {
              threadId: "mcp",
              toolName: tool.name,
              input: params,
              result: "error",
              errorMessage: err instanceof Error ? err.message : "Unknown error",
              durationMs,
            });
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "Tool execution failed" }) }],
              isError: true,
            };
          }
        }
      );
    }
  };
}
