import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkCalendar } from "@/lib/tools/calendar";
import { searchEmails } from "@/lib/tools/gmail";
import { listSlackChannels } from "@/lib/tools/slack";
import { createCrmTools } from "@/lib/tools/crm";
import { writeAuditEntry } from "@/lib/data/audit";
import { getMcpClientLimiter } from "@/lib/rate-limit";
import { checkToolRateLimit } from "@/lib/circuit-breaker";
import { recordMcpCall } from "@/lib/data/mcp-analytics";
import { getToolNamesForSurface, getReadToolNamesForScopes } from "@/lib/surface-policy";

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
          const userId = extra?.authInfo?.clientId;
          if (!userId) {
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: "Authentication required" }) }],
              isError: true,
            };
          }

          // Layer 2: Per-request scope check (from surface policy + user settings)
          const clientScopes: string[] = extra?.authInfo?.scopes ?? [];
          const mcpClientId = extra?.authInfo?.extra?.mcpClientId as string | undefined;

          // For Auth0 token users (default), enforce scope-based filtering
          if (!mcpClientId || mcpClientId === "default") {
            const scopeAllowedTools = new Set(getReadToolNamesForScopes(clientScopes));
            if (!scopeAllowedTools.has(toolEntry.name)) {
              writeAuditEntry(userId, {
                threadId: "mcp",
                toolName: toolEntry.name,
                input: params,
                result: "error",
                errorMessage: "Scope denied: tool not authorized for this client's scope",
                durationMs: 0,
                surface: "mcp",
              });
              return {
                content: [{ type: "text" as const, text: JSON.stringify({ error: "Tool not authorized for this client's scope" }) }],
                isError: true,
              };
            }
          }

          // Layer 3: Per-client API key filtering (AC-10, AC-11, AC-12)
          const allowedTools = extra?.authInfo?.extra?.allowedTools as string[] | undefined;

          if (mcpClientId && mcpClientId !== "default" && allowedTools) {
            if (!allowedTools.includes(toolEntry.name)) {
              return {
                content: [{ type: "text" as const, text: JSON.stringify({ error: "Tool not available for this client" }) }],
                isError: true,
              };
            }
          }

          // Per-client rate limiting (AC-13, AC-14)
          const clientRateLimit = extra?.authInfo?.extra?.rateLimit as number | undefined;
          if (mcpClientId && mcpClientId !== "default" && clientRateLimit) {
            try {
              const limiter = getMcpClientLimiter(mcpClientId, clientRateLimit);
              const { success } = await limiter.limit(mcpClientId);
              if (!success) {
                return {
                  content: [{ type: "text" as const, text: JSON.stringify({ error: "Rate limit exceeded" }) }],
                  isError: true,
                };
              }
            } catch (err) {
              console.error("MCP rate limit check failed (fail-closed):", err);
              return {
                content: [{ type: "text" as const, text: JSON.stringify({ error: "Service temporarily unavailable" }) }],
                isError: true,
              };
            }
          }

          // Per-tool rate limiting — same limits as chat endpoint, enforced across all surfaces
          const cbResult = await checkToolRateLimit(userId, toolEntry.name);
          if (!cbResult.allowed) {
            writeAuditEntry(userId, {
              threadId: mcpClientId ? `mcp:${mcpClientId}` : "mcp",
              toolName: toolEntry.name,
              input: params,
              result: "error",
              errorMessage: `Per-tool rate limit: ${cbResult.tier} tier, resets in ${cbResult.resetMs}ms`,
              durationMs: 0,
              surface: "mcp",
            });
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: `Rate limit exceeded for ${toolEntry.name}. Resets in ${Math.ceil((cbResult.resetMs ?? 0) / 1000)}s.` }) }],
              isError: true,
            };
          }

          const start = Date.now();
          try {
            let result: unknown;
            if (toolEntry.isCrmTool) {
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

            const clientId = mcpClientId && mcpClientId !== "default" ? mcpClientId : undefined;
            const clientName = extra?.authInfo?.extra?.clientName as string | undefined;

            writeAuditEntry(userId, {
              threadId: mcpClientId ? `mcp:${mcpClientId}` : "mcp",
              toolName: toolEntry.name,
              input: params,
              result: "success",
              durationMs,
              surface: "mcp",
              mcpClientId: clientId,
              mcpClientName: clientName,
            });

            // Record analytics for named clients
            if (clientId) {
              recordMcpCall(userId, clientId, toolEntry.name, true).catch(() => {});
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

            const errClientId = mcpClientId && mcpClientId !== "default" ? mcpClientId : undefined;
            const errClientName = extra?.authInfo?.extra?.clientName as string | undefined;

            writeAuditEntry(userId, {
              threadId: mcpClientId ? `mcp:${mcpClientId}` : "mcp",
              toolName: toolEntry.name,
              input: params,
              result: "error",
              errorMessage: err instanceof Error ? err.message : "Unknown error",
              durationMs,
              surface: "mcp",
              mcpClientId: errClientId,
              mcpClientName: errClientName,
            });

            if (errClientId) {
              recordMcpCall(userId, errClientId, toolEntry.name, false).catch(() => {});
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
