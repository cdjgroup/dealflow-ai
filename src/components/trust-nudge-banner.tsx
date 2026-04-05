"use client";

import type { TrustNudge } from "@/lib/trust-graduation";

const TOOL_LABELS: Record<string, string> = {
  draftEmail: "Email drafts",
  checkCalendar: "Calendar",
  sendSlackMessage: "Slack messages",
};

interface Props {
  nudge: TrustNudge | null;
  onAccept: (nudge: TrustNudge) => void;
  onDismiss: () => void;
}

export function TrustNudgeBanner({ nudge, onAccept, onDismiss }: Props) {
  if (!nudge) return null;

  const total = nudge.stats.approved + nudge.stats.dismissed;
  const label = TOOL_LABELS[nudge.tool] ?? nudge.tool;

  return (
    <div
      role="status"
      className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-emerald-400">
          Trust calibration
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          You&apos;ve approved {nudge.stats.approved} of {total} {label.toLowerCase()} actions.
          Upgrade to auto-approve?
        </p>
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={() => onAccept(nudge)}
          className="text-xs font-medium px-3 py-1.5 rounded-md bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
        >
          Auto-approve
        </button>
        <button
          onClick={onDismiss}
          className="text-xs font-medium px-3 py-1.5 rounded-md border border-border hover:bg-muted/50 transition-colors"
        >
          Not now
        </button>
      </div>
    </div>
  );
}
