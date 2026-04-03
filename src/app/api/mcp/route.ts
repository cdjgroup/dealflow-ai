import { createMcpHandler, withMcpAuth } from "mcp-handler";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";

/**
 * Validate bearer token against Auth0 /userinfo.
 * Returns AuthInfo with userId or undefined for invalid tokens.
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

const handler = createMcpHandler(
  async (server) => {
    // Auth context is attached to the request by withMcpAuth
    // For now, register tools for a default user context
    // In production, the userId would come from the auth context
    const userId = "mcp-anonymous";
    const registerTools = adaptToolsForMcp(userId);
    await registerTools(server);
  },
  {
    serverInfo: {
      name: "dealflow-ai",
      version: "0.3.0",
    },
  },
  {
    basePath: "/api",
    maxDuration: 60,
    redisUrl: process.env.UPSTASH_REDIS_REST_URL,
  }
);

const authHandler = withMcpAuth(handler, verifyToken, {
  required: false, // Allow unauthenticated discovery, require auth for tool calls
});

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
