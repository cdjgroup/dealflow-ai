import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";
import { verifyMcpToken } from "@/lib/mcp/auth";

/**
 * MCP server endpoint for external AI agents.
 *
 * Security pipeline (three layers):
 * 1. Authentication: Dual-path — dfk_ API keys (per-client policy) or
 *    Auth0 bearer tokens (scope-derived from surface policy)
 * 2. Scope derivation: MCP surface policy + per-client overrides determine
 *    which tool categories this client can access (crm:read, calendar:read, etc.)
 * 3. Per-request enforcement: Tool handler checks authInfo.scopes and
 *    per-client allowedTools before execution
 *
 * Tools that require approval (draftEmail, sendSlackMessage, high-value deals)
 * are excluded from MCP since the protocol has no interactive approval UI.
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
