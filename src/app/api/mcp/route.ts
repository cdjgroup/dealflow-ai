import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { adaptToolsForMcp } from "@/lib/mcp/tool-adapter";
import { verifyMcpToken } from "@/lib/mcp/auth";

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

const authHandler = withMcpAuth(
  handler,
  (_req: Request, bearerToken?: string) => verifyMcpToken(bearerToken),
  { required: true }
);

export { authHandler as GET, authHandler as POST, authHandler as DELETE };
