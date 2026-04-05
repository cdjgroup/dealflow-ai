const HIGH_VALUE_THRESHOLD = 50_000;

/**
 * Determines if a tool call requires CIBA step-up in the chat context.
 * Only high-value CRM mutations trigger CIBA — external actions (email, Slack)
 * use inline approval cards only. MCP has different rules (see shouldRequireCibaMcp).
 */
export function shouldRequireCiba(
  toolName: string,
  params: Record<string, unknown>,
): boolean {
  if (toolName === "createDeal") {
    const value = typeof params.value === "number" ? params.value : 0;
    return value > HIGH_VALUE_THRESHOLD;
  }

  if (toolName === "updateDeal") {
    return params.stage === "closed-won" || params.stage === "closed-lost";
  }

  return false;
}

const MCP_CIBA_TOOLS = new Set(["draftEmail", "createCalendarEvent", "sendSlackMessage"]);

/**
 * All Token Vault write tools require CIBA when called via MCP.
 * Unlike shouldRequireCiba (which is value/stage-based for chat),
 * MCP has no interactive UI so every write operation needs device consent.
 */
export function shouldRequireCibaMcp(toolName: string): boolean {
  return MCP_CIBA_TOOLS.has(toolName);
}
