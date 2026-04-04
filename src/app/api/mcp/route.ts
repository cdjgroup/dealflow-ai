import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";

/**
 * Validate bearer token against Auth0 /userinfo.
 * Returns AuthInfo with userId as clientId, or undefined for invalid tokens.
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

    return {
      token: bearerToken,
      clientId: userinfo.sub,
      scopes: ["tools"],
    };
  } catch {
    return undefined;
  }
}

/**
 * MCP server endpoint for external AI agents.
 *
 * Auth is required for tool execution. The authenticated userId from
 * Auth0 /userinfo is used for capability filtering, approval checks,
 * and audit attribution — same security pipeline as the chat route.
 *
 * Tools that require approval (draftEmail, sendSlackMessage, delegateResearch,
 * high-value deals) are excluded from MCP since there is no approval UI.
 */
const handler = createMcpHandler(
  async (server) => {
    // userId is extracted from auth context at tool-call time.
    // For server initialization, we register a tool set that will
    // resolve the user dynamically. See tool-adapter for details.
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
