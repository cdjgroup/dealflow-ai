import type { SuggestedAction } from "@/lib/types/actions";

export function sanitizeBindingMessage(msg: string): string {
  return msg.replace(/[^\w\s+\-_.,:#]/g, "").trim().slice(0, 64);
}

export function buildBatchMessage(actions: SuggestedAction[]): string {
  const counts: Record<string, number> = {};
  for (const a of actions) {
    counts[a.type] = (counts[a.type] || 0) + 1;
  }
  const parts = Object.entries(counts)
    .map(([type, count]) => `${count} ${type}`)
    .join(", ");
  return sanitizeBindingMessage(`DealFlow: ${actions.length} actions - ${parts}`);
}
