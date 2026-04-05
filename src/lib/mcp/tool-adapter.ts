import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkCalendar } from "@/lib/tools/calendar";
import { searchEmails } from "@/lib/tools/gmail";
import { listSlackChannels } from "@/lib/tools/slack";
import { createCrmTools } from "@/lib/tools/crm";
import { writeAuditEntry } from "@/lib/data/audit";
import { recordMcpCall } from "@/lib/data/mcp-analytics";
import { getToolNamesForSurface } from "@/lib/surface-policy";
import { enforceToolAuth, type ToolAuthContext } from "@/lib/mcp/tool-auth";

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
 *
 * Uses the surface policy registry to determine which tools are allowed,
 * replacing the previous hardcoded CRM_READ_TOOLS set. The policy is the
 * single source of truth — adding a new read tool only requires updating
 * TOOL_CATEGORIES in capability-filter.ts.
 */
function getMcpSafeTools(): ToolEntry[] {
  const allowedNames = new Set(getToolNamesForSurface("mcp"));

  // Non-CRM tools (stateless, no userId needed for schema registration)
  const statelessTools: Array<{ name: string; tool: AiTool }> = [
    { name: "checkCalendar", tool: checkCalendar as unknown as AiTool },
    { name: "searchEmails", tool: searchEmails as unknown as AiTool },
    { name: "listSlackChannels", tool: listSlackChannels as unknown as AiTool },
  ];

  const toolDefs: ToolEntry[] = statelessTools
    .filter((t) => allowedNames.has(t.name))
    .map((t) => ({
      ...t,
      description: t.tool.description || t.name,
      schema: t.tool.inputSchema,
      isCrmTool: false,
    }));

  // CRM read-only tools (created per-request with userId, schema-only here)
  const schemaCrmTools = createCrmTools("schema-only");
  for (const [name, t] of Object.entries(schemaCrmTools)) {
    if (!allowedNames.has(name)) continue;
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

/** Consolidated audit logging for MCP tool calls */
function logMcpAudit(
  userId: string,
  toolName: string,
  params: Record<string, unknown>,
  result: "success" | "error",
  ctx: Pick<ToolAuthContext, "mcpClientId" | "clientName">,
  extra?: { errorMessage?: string; durationMs?: number }
) {
  writeAuditEntry(userId, {
    threadId: ctx.mcpClientId ? `mcp:${ctx.mcpClientId}` : "mcp",
    toolName,
    input: params,
    result,
    durationMs: extra?.durationMs ?? 0,
    surface: "mcp",
    ...(result === "error" && extra?.errorMessage && { errorMessage: extra.errorMessage }),
    ...(ctx.mcpClientId && { mcpClientId: ctx.mcpClientId }),
    ...(ctx.clientName && { mcpClientName: ctx.clientName }),
  });
}

/**
 * Returns a function that registers MCP-safe tools on an MCP server.
 *
 * Security model (three-layer enforcement):
 * - Layer 1 (registration): Tool SET is determined by the surface policy registry.
 *   Only read-only tools are registered. This is a server-init-time decision.
 *   Note: tools/list returns the full registered set regardless of client scopes.
 *   This is intentional — discovery is not access. Clients see available tools
 *   but scope enforcement at execution prevents unauthorized calls.
 * - Layer 2 (scope check): Per-REQUEST scope check validates authInfo.scopes against
 *   the tool's category. Different clients can have different scopes derived from
 *   user settings (per-client MCP policies).
 * - Layer 3 (client policy): Per-client API key users get additional tool allowlist
 *   filtering, rate limiting, and usage analytics.
 * - Audit trail records both successful calls and scope/policy denials.
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

          // Layers 2-4: Auth, scope check, client policy, rate limiting
          const authResult = await enforceToolAuth(toolEntry.name, extra);
          if (!authResult.ok) {
            if (authResult.userId) {
              logMcpAudit(authResult.userId, toolEntry.name, params, "error",
                { mcpClientId: undefined, clientName: undefined },
                { errorMessage: authResult.error },
              );
            }
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: authResult.error }) }],
              isError: true,
            };
          }

          const { ctx } = authResult;
          const start = Date.now();

          try {
            let result: unknown;
            if (toolEntry.isCrmTool) {
              const crmTools = createCrmTools(ctx.userId);
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

            logMcpAudit(ctx.userId, toolEntry.name, params, "success", ctx, { durationMs });

            if (ctx.mcpClientId) {
              recordMcpCall(ctx.userId, ctx.mcpClientId, toolEntry.name, true).catch(() => {});
            }

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

            logMcpAudit(ctx.userId, toolEntry.name, params, "error", ctx, {
              errorMessage: err instanceof Error ? err.message : "Unknown error",
              durationMs,
            });

            if (ctx.mcpClientId) {
              recordMcpCall(ctx.userId, ctx.mcpClientId, toolEntry.name, false).catch(() => {});
            }

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
