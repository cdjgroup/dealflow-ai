import { getToolNamesForScopes } from "@/lib/surface-policy";
import { getMcpClientLimiter } from "@/lib/rate-limit";
import { checkToolRateLimit } from "@/lib/rate-limiter";
import { getUserSettings } from "@/lib/data/settings";

// Tool-to-capability category mapping (subset of capability-filter.ts — CRM write tools excluded from MCP)
export const TOOL_CATEGORIES: Record<string, string> = {
  checkCalendar: "calendar",
  createCalendarEvent: "calendar",
  searchEmails: "gmail",
  draftEmail: "gmail",
  listSlackChannels: "slack",
  sendSlackMessage: "slack",
  listDeals: "crmRead",
  getDealDetails: "crmRead",
  searchContacts: "crmRead",
};

export interface ToolAuthContext {
  userId: string;
  mcpClientId: string | undefined;
  clientName: string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  settings: any;
}

export type ToolAuthResult =
  | { ok: true; ctx: ToolAuthContext }
  | { ok: false; error: string; userId?: string; mcpClientId?: string; clientName?: string };

/**
 * Four-layer MCP auth orchestration.
 *
 * Layer 1 (registration) is handled at server init time.
 * This function handles Layers 2-4+ at request time:
 * - Layer 2: Scope-based filtering for Auth0 token users
 * - Layer 3: Per-client allowedTools filtering for API key users
 * - Layer 3b: Per-client rate limiting
 * - Per-tool rate limiting (circuit breaker)
 * - Capability check (user permission settings)
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
      console.error("MCP rate limit check failed (fail-closed):", err);
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
