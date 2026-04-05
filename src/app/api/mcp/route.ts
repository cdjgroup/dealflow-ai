import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";
import { getUserSettings } from "@/lib/data/settings";
import { deriveMcpScopes } from "@/lib/surface-policy";

/**
 * Validate bearer token against Auth0 /userinfo and derive scopes
 * from the surface policy registry.
 *
 * Scope derivation:
 * 1. Authenticate via Auth0 /userinfo (identity verification)
 * 2. Load user settings from Redis
 * 3. Check for per-client MCP policy (mcpClients[userId])
 * 4. Derive scopes from MCP surface policy + client override
 *
 * Per-client extensibility: When MCP clients authenticate with distinct
 * credentials (e.g., M2M tokens with unique client IDs), the clientId
 * can be used to look up per-client policies in mcpClients. Currently,
 * clientId = userinfo.sub (the user's own Auth0 ID), so per-client
 * differentiation requires explicit configuration via the Settings API.
 */
async function verifyToken(
  _req: Request,
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  try {
    const response = await fetch(
      `https://${process.env.AUTH0_DOMAIN}/userinfo`,
      { headers: { Authorization: `Bearer ${bearerToken}` } }
    );

    if (!response.ok) return undefined;

    const userinfo = await response.json();
    if (!userinfo.sub) return undefined;

    // Derive scopes from surface policy + user's per-client MCP config
    const settings = await getUserSettings(userinfo.sub);
    const scopes = deriveMcpScopes(settings, userinfo.sub);

    return {
      token: bearerToken,
      clientId: userinfo.sub,
      scopes,
    };
  } catch {
    return undefined;
  }
}

/**
 * MCP server endpoint for external AI agents.
 *
 * Security pipeline (three layers):
 * 1. Authentication: Bearer token validated against Auth0 /userinfo
 * 2. Scope derivation: MCP surface policy + per-client overrides determine
 *    which tool categories this client can access (crm:read, calendar:read, etc.)
 * 3. Per-request enforcement: Tool handler checks authInfo.scopes before execution
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
      version: "0.5.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
  }
);

const authHandler = withMcpAuth(handler, verifyToken, {
  required: true,
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
