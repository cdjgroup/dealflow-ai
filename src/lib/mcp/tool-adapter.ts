import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkCalendar } from "@/lib/tools/calendar";
import { searchEmails } from "@/lib/tools/gmail";
import { listSlackChannels } from "@/lib/tools/slack";
import { createCrmTools } from "@/lib/tools/crm";
import { writeAuditEntry } from "@/lib/data/audit";

// CRM read-only tool names exposed via MCP
const CRM_READ_TOOLS = new Set(["listDeals", "getDealDetails", "searchContacts"]);

type AiTool = {
  description?: string;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  execute?: (params: never, ctx: never) => unknown;
};

interface ToolEntry {
  name: string;
  description: string;
  schema: z.ZodObject<z.ZodRawShape>;
  isCrmTool: boolean;
  tool: AiTool;
}

/**
 * Build the list of tools safe for MCP exposure.
 * Non-CRM tools (calendar, gmail search, slack list) are stateless.
 * CRM tools are created per-request with the authenticated userId.
 */
function getMcpSafeTools(): ToolEntry[] {
  const toolDefs: ToolEntry[] = [
    { name: "checkCalendar", tool: checkCalendar as unknown as AiTool, isCrmTool: false },
    { name: "searchEmails", tool: searchEmails as unknown as AiTool, isCrmTool: false },
    { name: "listSlackChannels", tool: listSlackChannels as unknown as AiTool, isCrmTool: false },
  ].map((t) => ({
    ...t,
    description: t.tool.description || t.name,
    schema: t.tool.inputSchema,
  }));

  // Register CRM read-only tool schemas (execution uses per-request userId)
  const schemaCrmTools = createCrmTools("schema-only");
  for (const [name, t] of Object.entries(schemaCrmTools)) {
    if (!CRM_READ_TOOLS.has(name)) continue;
    const tool = t as unknown as AiTool;
    toolDefs.push({
      name,
      description: tool.description || name,
      schema: tool.inputSchema,
      isCrmTool: true,
      tool,
    });
  }

  return toolDefs;
}

/**
 * Returns a function that registers MCP-safe tools on an MCP server.
 *
 * Security: Only read-only tools are exposed. Tools requiring approval
 * (external actions, CRM writes, delegation) are excluded because MCP
 * has no interactive approval flow. This mirrors filterToolsByCapabilities
 * and attachApprovalChecks from the chat route.
 *
 * CRM tools are created per-request using the authenticated userId from
 * the MCP auth context (extra.authInfo.clientId).
 */
export function adaptToolsForMcp() {
  return async (server: McpServer) => {
    const tools = getMcpSafeTools();

    for (const toolEntry of tools) {
      server.registerTool(
        toolEntry.name,
        {
          description: toolEntry.description,
          inputSchema: toolEntry.schema,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        async (args: unknown, extra: any) => {
          const params = (args ?? {}) as Record<string, unknown>;
          const userId = extra?.authInfo?.clientId || "mcp-anonymous";
          const start = Date.now();
          try {
            let result: unknown;
            if (toolEntry.isCrmTool) {
              // Create CRM tools with the authenticated userId
              const crmTools = createCrmTools(userId);
              const crmTool = (crmTools as Record<string, unknown>)[toolEntry.name] as AiTool;
              result = await crmTool.execute!(params as never, {
                toolCallId: "mcp",
                messages: [],
                abortSignal: AbortSignal.timeout(55000),
              } as never);
            } else {
              result = await toolEntry.tool.execute!(params as never, {
                toolCallId: "mcp",
                messages: [],
                abortSignal: AbortSignal.timeout(55000),
              } as never);
            }
            const durationMs = Date.now() - start;

            writeAuditEntry(userId, {
              threadId: "mcp",
              toolName: toolEntry.name,
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
            writeAuditEntry(userId, {
              threadId: "mcp",
              toolName: toolEntry.name,
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
