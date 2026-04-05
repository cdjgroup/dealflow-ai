import type { ActionTypeStats, TrustLevel } from "@/lib/types/settings";

export interface TrustNudge {
  tool: string;
  actionType: "email" | "calendar" | "slack";
  currentTrust: TrustLevel;
  suggestedTrust: TrustLevel;
  stats: ActionTypeStats;
}

const MIN_DECISIONS = 5;
const UPGRADE_RATE = 0.8;

export function evaluateTrustGraduation(
  stats: ActionTypeStats,
  currentTrust: TrustLevel
): TrustLevel | null {
  const total = stats.approved + stats.dismissed;
  if (total < MIN_DECISIONS) return null;
  if (currentTrust !== "ask") return null;
  const rate = stats.approved / total;
  if (rate > UPGRADE_RATE) return "always";
  return null;
}
