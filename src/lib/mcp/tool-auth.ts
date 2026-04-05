import { getReadToolNamesForScopes } from "@/lib/surface-policy";
import { getMcpClientLimiter } from "@/lib/rate-limit";

export interface ToolAuthContext {
  userId: string;
  mcpClientId: string | undefined;
  clientName: string | undefined;
  allowedTools: string[] | undefined;
  rateLimit: number | undefined;
}

export type ToolAuthResult =
  | { ok: true; ctx: ToolAuthContext }
  | { ok: false; error: string; userId?: string };

/**
 * Three-layer MCP auth orchestration extracted from tool-adapter.
 *
 * Layer 1 (registration) is handled at server init time.
 * This function handles Layers 2-4 at request time:
 * - Layer 2: Scope-based filtering for Auth0 token users
 * - Layer 3: Per-client allowedTools filtering for API key users
 * - Layer 4: Per-client rate limiting
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function enforceToolAuth(toolName: string, extra: any): Promise<ToolAuthResult> {
  const userId = extra?.authInfo?.clientId as string | undefined;
  if (!userId) {
    return { ok: false, error: "Authentication required" };
  }

  const clientScopes: string[] = extra?.authInfo?.scopes ?? [];
  const mcpClientId = extra?.authInfo?.extra?.mcpClientId as string | undefined;
  const allowedTools = extra?.authInfo?.extra?.allowedTools as string[] | undefined;
  const clientRateLimit = extra?.authInfo?.extra?.rateLimit as number | undefined;
  const clientName = extra?.authInfo?.extra?.clientName as string | undefined;

  // Layer 2: Scope check for Auth0 token users (default clients)
  if (!mcpClientId || mcpClientId === "default") {
    const scopeAllowedTools = new Set(getReadToolNamesForScopes(clientScopes));
    if (!scopeAllowedTools.has(toolName)) {
      return { ok: false, error: "Tool not authorized for this client's scope", userId };
    }
  }

  // Layer 3: Per-client API key allowlist
  if (mcpClientId && mcpClientId !== "default" && allowedTools) {
    if (!allowedTools.includes(toolName)) {
      return { ok: false, error: "Tool not available for this client", userId };
    }
  }

  // Layer 4: Per-client rate limiting
  if (mcpClientId && mcpClientId !== "default" && clientRateLimit) {
    try {
      const limiter = getMcpClientLimiter(mcpClientId, clientRateLimit);
      const { success } = await limiter.limit(mcpClientId);
      if (!success) {
        return { ok: false, error: "Rate limit exceeded", userId };
      }
    } catch (err) {
      console.error("MCP rate limit check failed (fail-closed):", err);
      return { ok: false, error: "Service temporarily unavailable", userId };
    }
  }

  const resolvedClientId = mcpClientId && mcpClientId !== "default" ? mcpClientId : undefined;

  return {
    ok: true,
    ctx: {
      userId,
      mcpClientId: resolvedClientId,
      clientName: resolvedClientId ? clientName : undefined,
      allowedTools,
      rateLimit: clientRateLimit,
    },
  };
}
