import { getToolNamesForScopes } from "@/lib/surface-policy";
import { getMcpClientLimiter } from "@/lib/rate-limit";
import { checkToolRateLimit } from "@/lib/rate-limiter";
import { getUserSettings } from "@/lib/data/settings";
import { TOOL_CATEGORIES } from "@/lib/tools/capability-filter";
import type { UserSettings } from "@/lib/types/settings";

export interface ToolAuthContext {
  userId: string;
  mcpClientId: string | undefined;
  clientName: string | undefined;
  settings: UserSettings;
}

export type ToolAuthResult =
  | { ok: true; ctx: ToolAuthContext }
  | { ok: false; error: string; userId?: string; mcpClientId?: string; clientName?: string };

export interface McpAuthInfo {
  clientId?: string;
  scopes?: string[];
  extra?: {
    mcpClientId?: string;
    allowedTools?: string[];
    rateLimit?: number;
    clientName?: string;
    parameterConstraints?: Record<string, unknown>;
  };
}

export async function enforceToolAuth(toolName: string, extra: { authInfo?: McpAuthInfo }): Promise<ToolAuthResult> {
  const userId = extra?.authInfo?.clientId;
  if (!userId) {
    return { ok: false, error: "Authentication required" };
  }

  const clientScopes = extra?.authInfo?.scopes ?? [];
  const mcpClientId = extra?.authInfo?.extra?.mcpClientId;
  const allowedTools = extra?.authInfo?.extra?.allowedTools;
  const clientRateLimit = extra?.authInfo?.extra?.rateLimit;
  const clientName = extra?.authInfo?.extra?.clientName;
  const resolvedClientId = mcpClientId && mcpClientId !== "default" ? mcpClientId : undefined;

  // Layer 2: Scope check for Auth0 token users (default clients)
  if (!mcpClientId || mcpClientId === "default") {
    const scopeAllowedTools = new Set(getToolNamesForScopes(clientScopes));
    if (!scopeAllowedTools.has(toolName)) {
      return {
        ok: false,
        error: "Scope denied: tool not authorized for this client's scope",
        userId,
        mcpClientId: resolvedClientId,
        clientName,
      };
    }
  }

  // Layer 3: Per-client API key allowlist
  if (mcpClientId && mcpClientId !== "default" && allowedTools) {
    if (!allowedTools.includes(toolName)) {
      return { ok: false, error: "Tool not available for this client", userId };
    }
  }

  // Layer 3b: Per-client rate limiting
  if (mcpClientId && mcpClientId !== "default" && clientRateLimit) {
    try {
      const limiter = getMcpClientLimiter(mcpClientId, clientRateLimit);
      const { success } = await limiter.limit(mcpClientId);
      if (!success) {
        return { ok: false, error: "Rate limit exceeded", userId };
      }
    } catch (err) {
      console.error("MCP rate limit check failed (fail-closed):", err instanceof Error ? err.message : "unknown");
      return { ok: false, error: "Service temporarily unavailable", userId };
    }
  }

  // Per-tool rate limiting (circuit breaker — same limits as chat endpoint)
  const cbResult = await checkToolRateLimit(userId, toolName);
  if (!cbResult.allowed) {
    return {
      ok: false,
      error: `Rate limit exceeded for ${toolName}. Resets in ${Math.ceil((cbResult.resetMs ?? 0) / 1000)}s.`,
      userId,
      mcpClientId: resolvedClientId,
    };
  }

  // Capability check — respect user's per-tool permission settings
  const settings = await getUserSettings(userId);
  const category = TOOL_CATEGORIES[toolName] as keyof typeof settings.capabilities | undefined;
  if (settings.toolTrust?.[toolName] === "never") {
    return { ok: false, error: "Tool disabled by user", userId, mcpClientId: resolvedClientId, clientName };
  }
  if (category && !settings.capabilities[category]) {
    return { ok: false, error: "Tool category disabled by user", userId, mcpClientId: resolvedClientId, clientName };
  }

  return {
    ok: true,
    ctx: {
      userId,
      mcpClientId: resolvedClientId,
      clientName: resolvedClientId ? clientName : undefined,
      settings,
    },
  };
}
