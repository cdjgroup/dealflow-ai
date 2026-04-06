import { AsyncLocalStorage } from "async_hooks";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";
import { verifyMcpToken } from "@/lib/mcp/auth";

/**
 * MCP server endpoint for external AI agents.
 *
 * Security pipeline (four layers):
 * 1. Authentication: Dual-path — dfk_ API keys (per-client policy) or
 *    Auth0 bearer tokens (scope-derived from surface policy)
 * 2. Tool discovery filtering: Per-client allowedTools filter restricts
 *    which tools appear in tools/list (defense-in-depth via ALS bridge)
 * 3. Per-request enforcement: Tool handler checks authInfo.scopes and
 *    per-client allowedTools before execution
 * 4. CIBA consent: Write tools (draftEmail, createCalendarEvent, sendSlackMessage)
 *    require Guardian push approval before execution
 *
 * All Token Vault tools (read and write) require stored refresh tokens.
 * Write tools additionally require CIBA device consent via Guardian push.
 * CRM write tools are not exposed via MCP.
 */

// Bridge auth context from withMcpAuth into initializeServer.
// mcp-handler creates a new McpServer per request but doesn't export
// getAuthContext(), so we use our own ALS to thread allowedTools.
const mcpAuthStore = new AsyncLocalStorage<{ allowedTools?: string[] }>();

const mcpHandler = createMcpHandler(
  async (server) => {
    const ctx = mcpAuthStore.getStore();
    const registerTools = adaptToolsForMcp(ctx?.allowedTools);
    await registerTools(server);
  },
  {
    serverInfo: {
      name: "dealflow",
      version: "0.6.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
  }
);

// Wrap the MCP handler to bridge per-client allowedTools into ALS
// before mcp-handler creates the per-request McpServer instance.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const wrappedHandler = (req: Request) => {
  const auth = (req as any).auth;
  const allowedTools = auth?.extra?.allowedTools as string[] | undefined;
  return mcpAuthStore.run({ allowedTools }, () => mcpHandler(req));
};

const authHandler = withMcpAuth(
  wrappedHandler,
  (_req: Request, bearerToken?: string) => verifyMcpToken(bearerToken),
  { required: true }
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
