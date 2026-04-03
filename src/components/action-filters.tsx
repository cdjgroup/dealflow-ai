"use client";

import type { SuggestedAction, ActionStatus } from "@/lib/types/actions";

interface Props {
  actions: SuggestedAction[];
  activeFilter: ActionStatus | "all";
  onFilterChange: (filter: ActionStatus | "all") => void;
  onBatchApprove: () => void;
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
}: Props) {
  const pendingCount = actions.filter((a) => a.status === "pending").length;
  const approvedCount = actions.filter((a) => a.status === "approved").length;
  const sentCount = actions.filter((a) => a.status === "sent").length;

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

        {pendingCount > 0 && (
          <button
            onClick={onBatchApprove}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
          >
            Approve All Pending ({pendingCount})
          </button>
        )}
      </div>
    </div>
  );
}
