"use client";

import { useState, useEffect, useRef } from "react";
import type { SuggestedAction, ActionStatus } from "@/lib/types/actions";

interface Props {
  actions: SuggestedAction[];
  activeFilter: ActionStatus | "all";
  onFilterChange: (filter: ActionStatus | "all") => void;
  onBatchApprove: () => void;
  onClearAll: () => void;
}

const filters: { label: string; value: ActionStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Completed", value: "sent" },
  { label: "Dismissed", value: "dismissed" },
];

export function ActionFilters({
  actions,
  activeFilter,
  onFilterChange,
  onBatchApprove,
  onClearAll,
}: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const pending = actions.filter((a) => a.status === "pending");
  const pendingCount = pending.length;

  useEffect(() => {
    if (pendingCount === 0) setShowConfirm(false);
  }, [pendingCount]);

  useEffect(() => {
    if (showConfirm) cancelRef.current?.focus();
  }, [showConfirm]);
  const approvedCount = actions.filter((a) => a.status === "approved").length;
  const sentCount = actions.filter((a) => a.status === "sent").length;

  const emailCount = pending.filter((a) => a.type === "email").length;
  const calendarCount = pending.filter((a) => a.type === "calendar").length;
  const slackCount = pending.filter((a) => a.type === "slack").length;

  const breakdownParts: string[] = [];
  if (emailCount > 0) breakdownParts.push(`${emailCount} email${emailCount > 1 ? "s" : ""}`);
  if (calendarCount > 0) breakdownParts.push(`${calendarCount} calendar event${calendarCount > 1 ? "s" : ""}`);
  if (slackCount > 0) breakdownParts.push(`${slackCount} Slack message${slackCount > 1 ? "s" : ""}`);

  return (
    <div className="space-y-3">
      {/* Summary Stats */}
      <div className="flex items-center gap-4 text-sm">
        <span className="text-muted-foreground">
          {actions.length} total
        </span>
        {pendingCount > 0 && (
          <span className="text-amber-400">{pendingCount} pending</span>
        )}
        {approvedCount > 0 && (
          <span className="text-emerald-400">{approvedCount} ready to execute</span>
        )}
        {sentCount > 0 && (
          <span className="text-emerald-400">{sentCount} completed</span>
        )}
      </div>

      {/* Filter Tabs + Batch Action */}
      <div className="flex items-center justify-between">
        <div role="tablist" aria-label="Filter actions" className="flex gap-1">
          {filters.map((f) => {
            const count =
              f.value === "all"
                ? actions.length
                : actions.filter((a) => a.status === f.value).length;
            return (
              <button
                key={f.value}
                role="tab"
                aria-selected={activeFilter === f.value}
                onClick={() => onFilterChange(f.value)}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  activeFilter === f.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {f.label}
                {count > 0 && (
                  <span className="ml-1 text-xs opacity-70">({count})</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && !showConfirm && (
            <button
              onClick={() => setShowConfirm(true)}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Approve All Pending ({pendingCount})
            </button>
          )}
          {actions.length > 0 && (
            <button
              onClick={onClearAll}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Batch Approve Confirmation */}
      {showConfirm && (
        <div
          className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 space-y-2"
          onKeyDown={(e) => { if (e.key === "Escape") setShowConfirm(false); }}
        >
          <p className="text-sm font-medium text-foreground">
            Approve {pendingCount} pending action{pendingCount > 1 ? "s" : ""}?
          </p>
          <p className="text-xs text-muted-foreground">
            {breakdownParts.join(", ")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => {
                onBatchApprove();
                setShowConfirm(false);
              }}
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Approve {pendingCount} action{pendingCount > 1 ? "s" : ""}
            </button>
            <button
              ref={cancelRef}
              onClick={() => setShowConfirm(false)}
              className="rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
