import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { lookupByApiKey, getMcpClient } from "@/lib/data/mcp-clients";
import { getUserSettings } from "@/lib/data/settings";
import { deriveMcpScopes } from "@/lib/surface-policy";

const API_KEY_PREFIX = "dfk_";

/**
 * Dual-path MCP token verification.
 *
 * - dfk_-prefixed tokens: API key path — hash and look up in Redis
 * - All other tokens: Auth0 /userinfo path with scope derivation
 *
 * Returns AuthInfo with client metadata in `extra` for per-client
 * tool filtering and rate limiting in tool handlers.
 */
export async function verifyMcpToken(
  bearerToken?: string
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  // API key path
  if (bearerToken.startsWith(API_KEY_PREFIX)) {
    return verifyApiKey(bearerToken);
  }

  // Auth0 /userinfo path with scope derivation
  return verifyAuth0Token(bearerToken);
}

async function verifyApiKey(rawKey: string): Promise<AuthInfo | undefined> {
  try {
    const lookup = await lookupByApiKey(rawKey);
    if (!lookup) return undefined;

    const client = await getMcpClient(lookup.userId, lookup.clientId);
    if (!client) return undefined;

    return {
      token: rawKey,
      clientId: lookup.userId,
      scopes: ["tools"],
      extra: {
        mcpClientId: client.id,
        allowedTools: client.allowedTools,
        rateLimit: client.rateLimit,
        trustTier: client.trustTier,
        clientName: client.name,
        parameterConstraints: client.parameterConstraints,
      },
    };
  } catch {
    return undefined;
  }
}

async function verifyAuth0Token(
  bearerToken: string
): Promise<AuthInfo | undefined> {
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
      extra: {
        mcpClientId: "default",
      },
    };
  } catch {
    return undefined;
  }
}
