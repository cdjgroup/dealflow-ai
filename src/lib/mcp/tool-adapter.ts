import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkCalendar } from "@/lib/tools/calendar";
import { draftEmail, searchEmails } from "@/lib/tools/gmail";
import { listSlackChannels, sendSlackMessage } from "@/lib/tools/slack";
import { createCrmTools } from "@/lib/tools/crm";
import { writeAuditEntry } from "@/lib/data/audit";

interface ToolDef {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute: (params: Record<string, unknown>) => unknown;
}

/**
 * Builds a flat list of all tools available for MCP registration.
 * Reuses the same tool definitions as the chat route.
 */
function getAllTools(userId: string): ToolDef[] {
  const crmTools = createCrmTools(userId);

  // Token Vault tools (exported as AI SDK tool objects)
  const vaultTools: ToolDef[] = [
    { name: "checkCalendar", description: checkCalendar.description!, inputSchema: (checkCalendar as unknown as { inputSchema: z.ZodType }).inputSchema, execute: (p) => checkCalendar.execute!(p as { date: string }, { toolCallId: "mcp", messages: [], abortSignal: AbortSignal.timeout(55000) }) },
    { name: "draftEmail", description: draftEmail.description!, inputSchema: (draftEmail as unknown as { inputSchema: z.ZodType }).inputSchema, execute: (p) => draftEmail.execute!(p as { to: string; subject: string; body: string }, { toolCallId: "mcp", messages: [], abortSignal: AbortSignal.timeout(55000) }) },
    { name: "searchEmails", description: searchEmails.description!, inputSchema: (searchEmails as unknown as { inputSchema: z.ZodType }).inputSchema, execute: (p) => searchEmails.execute!(p as { query: string; maxResults?: number }, { toolCallId: "mcp", messages: [], abortSignal: AbortSignal.timeout(55000) }) },
    { name: "listSlackChannels", description: listSlackChannels.description!, inputSchema: (listSlackChannels as unknown as { inputSchema: z.ZodType }).inputSchema, execute: (p) => listSlackChannels.execute!(p as Record<string, never>, { toolCallId: "mcp", messages: [], abortSignal: AbortSignal.timeout(55000) }) },
    { name: "sendSlackMessage", description: sendSlackMessage.description!, inputSchema: (sendSlackMessage as unknown as { inputSchema: z.ZodType }).inputSchema, execute: (p) => sendSlackMessage.execute!(p as { channel: string; text: string }, { toolCallId: "mcp", messages: [], abortSignal: AbortSignal.timeout(55000) }) },
  ];

  // CRM tools (returned as a record from factory)
  const crmEntries = Object.entries(crmTools).map(([name, t]) => ({
    name,
    description: (t as unknown as { description: string }).description,
    inputSchema: (t as unknown as { inputSchema: z.ZodType }).inputSchema,
    execute: (p: Record<string, unknown>) =>
      (t as unknown as { execute: (p: unknown, ctx: unknown) => Promise<unknown> }).execute(p, { toolCallId: "mcp", messages: [], abortSignal: AbortSignal.timeout(55000) }),
  }));

  return [...vaultTools, ...crmEntries];
}

/**
 * Returns a function that registers all DealFlow AI tools on an MCP server.
 * Each tool call is logged to the audit trail.
 */
export function adaptToolsForMcp(userId: string) {
  return async (server: McpServer) => {
    const tools = getAllTools(userId);

    for (const tool of tools) {
      server.registerTool(
        tool.name,
        {
          description: tool.description,
          inputSchema: tool.inputSchema,
        },
        async (args: unknown) => {
          const params = (args ?? {}) as Record<string, unknown>;
          const start = Date.now();
          try {
            const result = await tool.execute(params);
            const durationMs = Date.now() - start;

            // Audit trail — same as chat route
            writeAuditEntry(userId, {
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
            writeAuditEntry(userId, {
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
