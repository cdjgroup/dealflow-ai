const HIGH_VALUE_THRESHOLD = 50_000;

/**
 * Pure function: determines if a tool call requires CIBA step-up authentication.
 * Only high-value CRM mutations trigger CIBA — external actions (email, Slack)
 * and read-only tools use inline approval only.
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
