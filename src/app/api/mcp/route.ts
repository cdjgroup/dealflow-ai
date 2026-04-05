import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";
import { verifyMcpToken } from "@/lib/mcp/auth";

/**
 * MCP server endpoint for external AI agents.
 *
 * Security pipeline (four layers):
 * 1. Authentication: Dual-path — dfk_ API keys (per-client policy) or
 *    Auth0 bearer tokens (scope-derived from surface policy)
 * 2. Scope derivation: MCP surface policy + per-client overrides determine
 *    which tool categories this client can access (crm:read, calendar:read, etc.)
 * 3. Per-request enforcement: Tool handler checks authInfo.scopes and
 *    per-client allowedTools before execution
 * 4. CIBA consent: Write tools (draftEmail, createCalendarEvent, sendSlackMessage)
 *    require Guardian push approval before execution
 *
 * All Token Vault tools (read and write) require stored refresh tokens.
 * Write tools additionally require CIBA device consent via Guardian push.
 * CRM write tools are not exposed via MCP.
 */
const handler = createMcpHandler(
  async (server) => {
    const registerTools = adaptToolsForMcp();
    await registerTools(server);
  },
  {
    serverInfo: {
      name: "dealflow-ai",
      version: "0.6.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
  }
);

const authHandler = withMcpAuth(
  handler,
  (_req: Request, bearerToken?: string) => verifyMcpToken(bearerToken),
  { required: true }
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
