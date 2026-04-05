import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { checkCalendar, createCalendarEvent } from "@/lib/tools/calendar";
import { searchEmails, draftEmail } from "@/lib/tools/gmail";
import { listSlackChannels, sendSlackMessage } from "@/lib/tools/slack";
import { createCrmTools } from "@/lib/tools/crm";
import { writeAuditEntry } from "@/lib/data/audit";
import { getScheduleRefreshToken } from "@/lib/data/schedule-tokens";
import { exchangeTokenWithRefresh } from "@/lib/token-exchange";
import { isConnectionDisabled } from "@/lib/data/connections";
import { cibaGate, buildMcpBindingMessage } from "@/lib/mcp/ciba-gate";
import { shouldRequireCibaMcp } from "@/lib/ciba/should-require";
import { TOOL_SCOPE_CONFIG, type TokenVaultToolName } from "@/lib/tools/scope-map";
import { buildRawEmail, resolveSlackChannelId } from "@/lib/api-utils";
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
  isTokenVaultTool: boolean;
  tool: AiTool;
}

// ---------------------------------------------------------------------------
// Per-tool API executors — each receives the access token and params, and
// returns the raw API response data (already parsed from JSON).
// ---------------------------------------------------------------------------

type ToolExecutor = (
  params: Record<string, unknown>,
  accessToken: string
) => Promise<Response>;

const MCP_EXECUTORS: Record<string, ToolExecutor> = {
  // Read tools
  checkCalendar: (params, accessToken) => {
    const date = params.date as string;
    const timeMin = encodeURIComponent(new Date(`${date}T00:00:00Z`).toISOString());
    const timeMax = encodeURIComponent(new Date(`${date}T23:59:59Z`).toISOString());
    return global.fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&timeMax=${timeMax}&singleEvents=true&orderBy=startTime`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  },

  searchEmails: (params, accessToken) => {
    const query = encodeURIComponent(params.query as string);
    const maxResults = (params.maxResults as number | undefined) ?? 5;
    return global.fetch(
      `https://www.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxResults}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  },

  listSlackChannels: (_params, accessToken) =>
    global.fetch(
      "https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=50",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    ),

  // Write tools
  draftEmail: (params, accessToken) => {
    const raw = buildRawEmail(
      params.to as string,
      params.subject as string,
      params.body as string
    );
    return global.fetch("https://www.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw } }),
    });
  },

  createCalendarEvent: (params, accessToken) => {
    const eventBody: Record<string, unknown> = {
      summary: params.summary,
      start: { dateTime: params.startDateTime },
      end: { dateTime: params.endDateTime },
    };
    if (params.description) eventBody.description = params.description;
    if (params.location) eventBody.location = params.location;
    if (params.attendees) {
      eventBody.attendees = (params.attendees as string[]).map((email) => ({ email }));
    }
    return global.fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      }
    );
  },

  sendSlackMessage: async (params, accessToken) => {
    const channel = params.channel as string;
    const SLACK_CHANNEL_ID_RE = /^[CG][A-Z0-9]{8,11}$/;
    let channelId = channel;
    if (!SLACK_CHANNEL_ID_RE.test(channel)) {
      const resolved = await resolveSlackChannelId(channel, accessToken);
      if ("error" in resolved) {
        return new Response(JSON.stringify({ error: resolved.error }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      channelId = resolved.id;
    }
    return global.fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ channel: channelId, text: params.text }),
    });
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Strips internal _tokenMeta from any result object before returning to MCP. */
function stripTokenMeta(value: unknown): unknown {
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).filter(([k]) => k !== "_tokenMeta")
    );
  }
  return value;
}

/** Write an error audit entry and return the MCP error response. */
function auditAndErrorResponse(
  userId: string,
  toolName: string,
  params: Record<string, unknown>,
  errorMessage: string,
  durationMs: number,
  extra?: { mcpClientId?: string; mcpClientName?: string; surface?: "chat" | "mcp" | "actions" }
) {
  writeAuditEntry(userId, {
    threadId: extra?.mcpClientId ? `mcp:${extra.mcpClientId}` : "mcp",
    toolName,
    input: params,
    result: "error",
    errorMessage,
    durationMs,
    surface: extra?.surface ?? "mcp",
    mcpClientId: extra?.mcpClientId,
    mcpClientName: extra?.mcpClientName,
  });

  if (extra?.mcpClientId) {
    recordMcpCall(userId, extra.mcpClientId, toolName, false).catch(() => {});
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }],
    isError: true,
  };
}

/** Write a success audit entry and record analytics. */
function auditSuccess(
  userId: string,
  toolName: string,
  params: Record<string, unknown>,
  durationMs: number,
  ctx: Pick<ToolAuthContext, "mcpClientId" | "clientName">,
  mcpClientIdRaw?: string
) {
  writeAuditEntry(userId, {
    threadId: mcpClientIdRaw ? `mcp:${mcpClientIdRaw}` : "mcp",
    toolName,
    input: params,
    result: "success",
    durationMs,
    surface: "mcp",
    mcpClientId: ctx.mcpClientId,
    mcpClientName: ctx.clientName,
  });

  if (ctx.mcpClientId) {
    recordMcpCall(userId, ctx.mcpClientId, toolName, true).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

/**
 * Build the list of tools safe for MCP exposure.
 *
 * Uses the surface policy registry to determine which tools are allowed,
 * replacing the previous hardcoded CRM_READ_TOOLS set. The policy is the
 * single source of truth — adding a new read tool only requires updating
 * TOOL_CATEGORIES in capability-filter.ts.
 *
 * Non-CRM tools (calendar, gmail, slack — read and write) use stored refresh tokens.
 * Write tools additionally require CIBA device consent.
 * CRM tools are created per-request with the authenticated userId.
 */
function getMcpSafeTools(): ToolEntry[] {
  const allowedNames = new Set(getToolNamesForSurface("mcp"));

  // Non-CRM tools (stateless, no userId needed for schema registration)
  // Includes both read tools and CIBA-gated write tools
  const tokenVaultTools: Array<{ name: string; tool: AiTool }> = [
    { name: "checkCalendar", tool: checkCalendar as unknown as AiTool },
    { name: "searchEmails", tool: searchEmails as unknown as AiTool },
    { name: "listSlackChannels", tool: listSlackChannels as unknown as AiTool },
    { name: "draftEmail", tool: draftEmail as unknown as AiTool },
    { name: "createCalendarEvent", tool: createCalendarEvent as unknown as AiTool },
    { name: "sendSlackMessage", tool: sendSlackMessage as unknown as AiTool },
  ];

  const toolDefs: ToolEntry[] = tokenVaultTools
    .filter((t) => allowedNames.has(t.name))
    .map((t) => ({
      ...t,
      description: t.tool.description || t.name,
      schema: t.tool.inputSchema,
      isCrmTool: false,
      isTokenVaultTool: true,
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
      isTokenVaultTool: false,
      tool,
    });
  }

  return toolDefs;
}

/**
 * Returns a function that registers MCP-safe tools on an MCP server.
 *
 * Security model (four-layer enforcement):
 * - Layer 1 (registration): Tool SET is determined by the surface policy registry.
 *   Read-only tools and CIBA-gated write tools are registered. This is a
 *   server-init-time decision.
 *   Note: tools/list returns the full registered set regardless of client scopes.
 *   This is intentional — discovery is not access. Clients see available tools
 *   but scope enforcement at execution prevents unauthorized calls.
 * - Layer 2 (scope check): Per-REQUEST scope check validates authInfo.scopes against
 *   the tool's category. Different clients can have different scopes derived from
 *   user settings (per-client MCP policies).
 * - Layer 3 (client policy): Per-client API key users get additional tool allowlist
 *   filtering, rate limiting, and usage analytics.
 * - Layer 4 (CIBA consent): Write tools (draftEmail, createCalendarEvent,
 *   sendSlackMessage) require Guardian push approval before execution.
 * - Audit trail records both successful calls and scope/policy denials.
 *
 * Token Vault tools (read and write) use stored refresh tokens obtained via
 * getScheduleRefreshToken. Write tools additionally require CIBA approval
 * before proceeding.
 *
 * CRM tools are created per-request using the authenticated userId from
 * the MCP auth context (extra.authInfo.clientId).
 */
export function adaptToolsForMcp(_userId?: string) {
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
          const mcpClientIdRaw = extra?.authInfo?.extra?.mcpClientId as string | undefined;

          // Layers 2-4: Auth, scope, client policy, rate limiting, capability check
          const authResult = await enforceToolAuth(toolEntry.name, extra);
          if (!authResult.ok) {
            if (authResult.userId) {
              return auditAndErrorResponse(
                authResult.userId, toolEntry.name, params, authResult.error, 0,
                { mcpClientId: authResult.mcpClientId, mcpClientName: authResult.clientName, surface: "mcp" }
              );
            }
            return {
              content: [{ type: "text" as const, text: JSON.stringify({ error: authResult.error }) }],
              isError: true,
            };
          }

          const { ctx } = authResult;
          const start = Date.now();

          // CRM tool path
          if (toolEntry.isCrmTool) {
            try {
              const crmTools = createCrmTools(ctx.userId);
              const crmTool = (crmTools as Record<string, unknown>)[toolEntry.name] as AiTool;
              const result = await crmTool.execute!(params as never, {
                toolCallId: "mcp",
                messages: [],
                abortSignal: AbortSignal.timeout(55000),
              } as never);

              auditSuccess(ctx.userId, toolEntry.name, params, Date.now() - start, ctx, mcpClientIdRaw);

              return {
                content: [{ type: "text" as const, text: JSON.stringify(stripTokenMeta(result)) }],
              };
            } catch (err) {
              return auditAndErrorResponse(
                ctx.userId, toolEntry.name, params,
                err instanceof Error ? err.message : "Unknown error",
                Date.now() - start,
                { mcpClientId: ctx.mcpClientId, mcpClientName: ctx.clientName, surface: "mcp" }
              );
            }
          }

          // Token Vault tool path
          try {
            const toolName = toolEntry.name as TokenVaultToolName;
            const scopeConfig = TOOL_SCOPE_CONFIG[toolName];
            const connection = scopeConfig?.connection ?? "google-oauth2";

            // Step 1: Check connection disabled (before CIBA)
            const disabled = await isConnectionDisabled(ctx.userId, connection);
            if (disabled) {
              return auditAndErrorResponse(
                ctx.userId, toolEntry.name, params, "Connection disabled", Date.now() - start,
                { mcpClientId: ctx.mcpClientId, mcpClientName: ctx.clientName, surface: "mcp" }
              );
            }

            // Step 2: CIBA gate for write tools (Layer 4)
            if (shouldRequireCibaMcp(toolEntry.name)) {
              const bindingMessage = buildMcpBindingMessage(toolEntry.name, params);
              const cibaResult = await cibaGate(ctx.userId, toolEntry.name, bindingMessage);
              if (!cibaResult.approved) {
                const errorMsg = (cibaResult as { error?: string }).error ?? "CIBA approval failed";
                return auditAndErrorResponse(
                  ctx.userId, toolEntry.name, params, errorMsg, Date.now() - start,
                  { mcpClientId: ctx.mcpClientId, mcpClientName: ctx.clientName, surface: "mcp" }
                );
              }
            }

            // Step 3: Get stored refresh token
            const refreshToken = await getScheduleRefreshToken(ctx.userId);
            if (!refreshToken) {
              return auditAndErrorResponse(
                ctx.userId, toolEntry.name, params,
                "No stored refresh token. Enable scheduled actions in the app to use MCP tools.",
                Date.now() - start,
                { mcpClientId: ctx.mcpClientId, mcpClientName: ctx.clientName, surface: "mcp" }
              );
            }

            // Step 4: Exchange token
            const tokenResult = await exchangeTokenWithRefresh(connection, refreshToken);
            if ("error" in tokenResult) {
              return auditAndErrorResponse(
                ctx.userId, toolEntry.name, params, tokenResult.error, Date.now() - start,
                { mcpClientId: ctx.mcpClientId, mcpClientName: ctx.clientName, surface: "mcp" }
              );
            }
            const accessToken = tokenResult.token;

            // Step 5: Execute API call with token
            const executor = MCP_EXECUTORS[toolEntry.name];
            if (!executor) {
              return auditAndErrorResponse(
                ctx.userId, toolEntry.name, params, "No executor configured", Date.now() - start,
                { mcpClientId: ctx.mcpClientId, mcpClientName: ctx.clientName, surface: "mcp" }
              );
            }
            const fetchResult = await executor(params, accessToken);
            const data = await fetchResult.json();

            if (!fetchResult.ok) {
              const errMsg = (data as { error?: string; error_description?: string }).error
                ?? (data as { error_description?: string }).error_description
                ?? `API request failed (${fetchResult.status})`;
              return auditAndErrorResponse(
                ctx.userId, toolEntry.name, params, errMsg, Date.now() - start,
                { mcpClientId: ctx.mcpClientId, mcpClientName: ctx.clientName, surface: "mcp" }
              );
            }

            auditSuccess(ctx.userId, toolEntry.name, params, Date.now() - start, ctx, mcpClientIdRaw);

            return {
              content: [{ type: "text" as const, text: JSON.stringify(stripTokenMeta(data)) }],
            };
          } catch (err) {
            return auditAndErrorResponse(
              ctx.userId, toolEntry.name, params,
              err instanceof Error ? err.message : "Unknown error",
              Date.now() - start,
              { mcpClientId: ctx.mcpClientId, mcpClientName: ctx.clientName, surface: "mcp" }
            );
          }
        }
      );
    }
  };
}
