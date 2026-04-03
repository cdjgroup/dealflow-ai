"use client";

import type { AuditFilters } from "@/lib/types/audit";

const DATE_PRESETS: { label: string; value: string }[] = [
  { label: "All time", value: "" },
  { label: "Last 24 hours", value: "24h" },
  { label: "Last 3 days", value: "3d" },
  { label: "Last 7 days", value: "7d" },
];

export function getDateRange(preset: string): { startDate?: string; endDate?: string } {
  if (!preset) return {};
  const now = new Date();
  const end = now.toISOString().split("T")[0];
  const ms = preset === "24h" ? 1 : preset === "3d" ? 3 : 7;
  const start = new Date(now.getTime() - ms * 24 * 60 * 60 * 1000);
  return { startDate: start.toISOString().split("T")[0], endDate: end };
}

interface AuditFilterBarProps {
  filters: AuditFilters;
  datePreset: string;
  onFilterChange: (filters: AuditFilters) => void;
  onDatePresetChange: (preset: string) => void;
  availableTools: string[];
}

export function AuditFilterBar({
  filters,
  datePreset,
  onFilterChange,
  onDatePresetChange,
  availableTools,
}: AuditFilterBarProps) {
  const activeCount = [
    filters.toolName,
    filters.result,
    filters.startDate || filters.endDate,
  ].filter(Boolean).length;

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      {/* Tool name filter */}
      <div className="flex items-center gap-1.5">
        <label
          htmlFor="filter-tool"
          className="text-xs font-medium text-muted-foreground"
        >
          Tool
        </label>
        <select
          id="filter-tool"
          value={filters.toolName || ""}
          onChange={(e) =>
            onFilterChange({
              ...filters,
              toolName: e.target.value || undefined,
            })
          }
          className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All tools</option>
          {availableTools.map((tool) => (
            <option key={tool} value={tool}>
              {tool}
            </option>
          ))}
        </select>
      </div>

      {/* Result filter */}
      <div className="flex items-center gap-1.5">
        <label
          htmlFor="filter-result"
          className="text-xs font-medium text-muted-foreground"
        >
          Result
        </label>
        <select
          id="filter-result"
          value={filters.result || ""}
          onChange={(e) =>
            onFilterChange({
              ...filters,
              result: (e.target.value as "success" | "error") || undefined,
            })
          }
          className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
        >
          <option value="">All results</option>
          <option value="success">Success</option>
          <option value="error">Error</option>
        </select>
      </div>

      {/* Date range preset */}
      <div className="flex items-center gap-1.5">
        <label
          htmlFor="filter-date"
          className="text-xs font-medium text-muted-foreground"
        >
          Period
        </label>
        <select
          id="filter-date"
          value={datePreset}
          onChange={(e) => {
            const preset = e.target.value;
            onDatePresetChange(preset);
            const range = getDateRange(preset);
            onFilterChange({
              ...filters,
              startDate: range.startDate,
              endDate: range.endDate,
            });
          }}
          className="h-8 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-primary"
        >
          {DATE_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      {/* Clear filters */}
      {activeCount > 0 && (
        <button
          onClick={() => {
            onDatePresetChange("");
            onFilterChange({});
          }}
          className="ml-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear filters ({activeCount})
        </button>
      )}
    </div>
  );
}
