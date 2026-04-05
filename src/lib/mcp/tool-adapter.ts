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
import { getUserSettings } from "@/lib/data/settings";
import { getMcpClientLimiter } from "@/lib/rate-limit";
import { checkToolRateLimit } from "@/lib/circuit-breaker";
import { recordMcpCall } from "@/lib/data/mcp-analytics";
import { getToolNamesForSurface, getToolNamesForScopes } from "@/lib/surface-policy";

// Tool-to-capability category mapping (subset of capability-filter.ts — CRM write tools excluded from MCP)
const TOOL_CATEGORIES: Record<string, string> = {
  checkCalendar: "calendar",
  createCalendarEvent: "calendar",
  searchEmails: "gmail",
  draftEmail: "gmail",
  listSlackChannels: "slack",
  sendSlackMessage: "slack",
  listDeals: "crmRead",
  getDealDetails: "crmRead",
  searchContacts: "crmRead",
};

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
    // Resolve channel name to ID if not already an ID (C/G prefix + alphanumeric)
    const SLACK_CHANNEL_ID_RE = /^[CG][A-Z0-9]{8,11}$/;
    let channelId = channel;
    if (!SLACK_CHANNEL_ID_RE.test(channel)) {
      const resolved = await resolveSlackChannelId(channel, accessToken);
      if ("error" in resolved) {
        // Return a synthetic Response that the caller can handle like an API error
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
  extra?: { mcpClientId?: string; mcpClientName?: string; surface?: "chat" | "mcp" | "actions"; policyReason?: string }
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
    policyReason: extra?.policyReason,
  });

  if (extra?.mcpClientId) {
    recordMcpCall(userId, extra.mcpClientId, toolName, false).catch(() => {});
  }

  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: errorMessage }) }],
    isError: true,
  };
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
 * - Layer 1 (registration): Tool SET is determined by the surface policy registry,
 *   then narrowed by the optional `allowedToolFilter` parameter. When a per-client
 *   API key provides an `allowedTools` list, only those tools are registered —
 *   so `tools/list` returns only what the client can actually call.
 *   Auth0 token clients (no filter) see all MCP-surface tools.
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
export function adaptToolsForMcp(allowedToolFilter?: string[]) {
  return async (server: McpServer) => {
    let tools = getMcpSafeTools();

    // Per-client tools/list filtering: only register tools the client is allowed to use.
    // Defense-in-depth — execution-layer enforcement (Layer 3) remains as a fallback.
    if (allowedToolFilter) {
      const allowed = new Set(allowedToolFilter);
      tools = tools.filter((t) => allowed.has(t.name));
    }

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
            const scopeAllowedTools = new Set(getToolNamesForScopes(clientScopes));
            if (!scopeAllowedTools.has(toolEntry.name)) {
              const clientId = mcpClientId && mcpClientId !== "default" ? mcpClientId : undefined;
              const clientName = extra?.authInfo?.extra?.clientName as string | undefined;
              return auditAndErrorResponse(
                userId, toolEntry.name, params,
                "Scope denied: tool not authorized for this client's scope",
                0,
                { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp",
                  policyReason: `Scope denied: ${toolEntry.name} requires scope not in [${clientScopes.join(", ")}]` }
              );
            }
          }

          // Layer 3: Per-client API key filtering (AC-10, AC-11, AC-12)
          const allowedTools = extra?.authInfo?.extra?.allowedTools as string[] | undefined;

          if (mcpClientId && mcpClientId !== "default" && allowedTools) {
            if (!allowedTools.includes(toolEntry.name)) {
              const clientId = mcpClientId && mcpClientId !== "default" ? mcpClientId : undefined;
              const clientName = extra?.authInfo?.extra?.clientName as string | undefined;
              return auditAndErrorResponse(
                userId, toolEntry.name, params,
                "Tool not available for this client",
                0,
                { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp",
                  policyReason: `Client policy: ${toolEntry.name} not in allowedTools for ${clientName ?? mcpClientId}` }
              );
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

          // Step 0: Capability check — respect user's per-tool permission settings
          const settings = await getUserSettings(userId);
          const category = TOOL_CATEGORIES[toolEntry.name] as keyof typeof settings.capabilities | undefined;
          if (settings.toolTrust?.[toolEntry.name] === "never") {
            return auditAndErrorResponse(userId, toolEntry.name, params, "Tool disabled by user", Date.now() - start,
              { policyReason: `Capability: ${toolEntry.name} disabled (trustLevel: never)` });
          }
          if (category && !settings.capabilities[category]) {
            return auditAndErrorResponse(userId, toolEntry.name, params, "Tool category disabled by user", Date.now() - start,
              { policyReason: `Capability: ${category} category disabled by user` });
          }

          const clientId = mcpClientId && mcpClientId !== "default" ? mcpClientId : undefined;
          const clientName = extra?.authInfo?.extra?.clientName as string | undefined;

          // CRM tool path
          if (toolEntry.isCrmTool) {
            try {
              const crmTools = createCrmTools(userId);
              const crmTool = (crmTools as Record<string, unknown>)[toolEntry.name] as AiTool;
              const result = await crmTool.execute!(params as never, {
                toolCallId: "mcp",
                messages: [],
                abortSignal: AbortSignal.timeout(55000),
              } as never);
              const durationMs = Date.now() - start;

              writeAuditEntry(userId, {
                threadId: mcpClientId ? `mcp:${mcpClientId}` : "mcp",
                toolName: toolEntry.name,
                input: params,
                result: "success",
                durationMs,
                surface: "mcp",
                mcpClientId: clientId,
                mcpClientName: clientName,
                policyReason: "Capability: enabled, scope: granted, rate limit: within budget",
              });

              // Record analytics for named clients
              if (clientId) {
                recordMcpCall(userId, clientId, toolEntry.name, true).catch(() => {});
              }

              return {
                content: [{ type: "text" as const, text: JSON.stringify(stripTokenMeta(result)) }],
              };
            } catch (err) {
              return auditAndErrorResponse(
                userId, toolEntry.name, params,
                err instanceof Error ? err.message : "Unknown error",
                Date.now() - start,
                { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp" }
              );
            }
          }

          // Token Vault tool path — wrapped in try/catch for Redis/network errors
          try {
            const toolName = toolEntry.name as TokenVaultToolName;
            const scopeConfig = TOOL_SCOPE_CONFIG[toolName];
            const connection = scopeConfig?.connection ?? "google-oauth2";

            // Step 1: Check connection disabled (before CIBA)
            const disabled = await isConnectionDisabled(userId, connection);
            if (disabled) {
              return auditAndErrorResponse(
                userId, toolEntry.name, params, "Connection disabled", Date.now() - start,
                { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp",
                  policyReason: `Connection: ${connection} disabled by user` }
              );
            }

            // Step 2: CIBA gate for write tools (Layer 4)
            if (shouldRequireCibaMcp(toolEntry.name)) {
              const bindingMessage = buildMcpBindingMessage(toolEntry.name, params);
              const cibaResult = await cibaGate(userId, toolEntry.name, bindingMessage);
              if (!cibaResult.approved) {
                const errorMsg = (cibaResult as { error?: string }).error ?? "CIBA approval failed";
                return auditAndErrorResponse(
                  userId, toolEntry.name, params, errorMsg, Date.now() - start,
                  { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp" }
                );
              }
            }

            // Step 3: Get stored refresh token
            const refreshToken = await getScheduleRefreshToken(userId);
            if (!refreshToken) {
              return auditAndErrorResponse(
                userId, toolEntry.name, params,
                "No stored refresh token. Enable scheduled actions in the app to use MCP tools.",
                Date.now() - start,
                { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp" }
              );
            }

            // Step 4: Exchange token
            const tokenResult = await exchangeTokenWithRefresh(connection, refreshToken);
            if ("error" in tokenResult) {
              return auditAndErrorResponse(
                userId, toolEntry.name, params, tokenResult.error, Date.now() - start,
                { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp" }
              );
            }
            const accessToken = tokenResult.token;

            // Step 5: Execute API call with token
            const executor = MCP_EXECUTORS[toolEntry.name];
            if (!executor) {
              return auditAndErrorResponse(
                userId, toolEntry.name, params, "No executor configured", Date.now() - start,
                { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp" }
              );
            }
            const fetchResult = await executor(params, accessToken);
            const data = await fetchResult.json();

            // Check HTTP status — API errors (4xx/5xx) should not be treated as success
            if (!fetchResult.ok) {
              const errMsg = (data as { error?: string; error_description?: string }).error
                ?? (data as { error_description?: string }).error_description
                ?? `API request failed (${fetchResult.status})`;
              return auditAndErrorResponse(
                userId, toolEntry.name, params, errMsg, Date.now() - start,
                { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp" }
              );
            }

            const durationMs = Date.now() - start;
            writeAuditEntry(userId, {
              threadId: mcpClientId ? `mcp:${mcpClientId}` : "mcp",
              toolName: toolEntry.name,
              input: params,
              result: "success",
              durationMs,
              surface: "mcp",
              mcpClientId: clientId,
              mcpClientName: clientName,
              policyReason: "Capability: enabled, scope: granted, connection: active, rate limit: within budget",
            });

            // Record analytics for named clients
            if (clientId) {
              recordMcpCall(userId, clientId, toolEntry.name, true).catch(() => {});
            }

            return {
              content: [{ type: "text" as const, text: JSON.stringify(stripTokenMeta(data)) }],
            };
          } catch (err) {
            return auditAndErrorResponse(
              userId, toolEntry.name, params,
              err instanceof Error ? err.message : "Unknown error",
              Date.now() - start,
              { mcpClientId: clientId, mcpClientName: clientName, surface: "mcp" }
            );
          }
        }
      );
    }
  };
}
