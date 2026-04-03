"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { AuditEntry, AuditFilters } from "@/lib/types/audit";
import { AuditTable } from "@/components/audit-table";
import { AuditFilterBar } from "@/components/audit-filter-bar";

export function AuditPageClient({
  initialLog,
}: {
  initialLog: AuditEntry[];
}) {
  const [log, setLog] = useState<AuditEntry[]>(initialLog);
  const [filters, setFilters] = useState<AuditFilters>({});
  const [loading, setLoading] = useState(false);

  const hasActiveFilters = Boolean(
    filters.toolName || filters.result || filters.startDate
  );

  const availableTools = useMemo(() => {
    const tools = new Set(initialLog.map((e) => e.toolName));
    return Array.from(tools).sort();
  }, [initialLog]);

  const fetchFiltered = useCallback(async (f: AuditFilters) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (f.toolName) params.set("toolName", f.toolName);
      if (f.result) params.set("result", f.result);
      if (f.startDate) params.set("startDate", f.startDate);
      if (f.endDate) params.set("endDate", f.endDate);

      const res = await fetch(`/api/audit?${params.toString()}`, {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (res.ok) {
        const data = await res.json();
        setLog(data);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (hasActiveFilters) {
      fetchFiltered(filters);
    } else {
      setLog(initialLog);
    }
  }, [filters, hasActiveFilters, fetchFiltered, initialLog]);

  const handleFilterChange = (newFilters: AuditFilters) => {
    setFilters(newFilters);
  };

  return (
    <div className="space-y-4">
      <AuditFilterBar
        filters={filters}
        onFilterChange={handleFilterChange}
        availableTools={availableTools}
      />

      {loading && (
        <div className="flex justify-center py-4">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

      {!loading && log.length === 0 && hasActiveFilters && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          <p>No matching entries found.</p>
          <button
            onClick={() => setFilters({})}
            className="mt-2 text-sm text-primary hover:underline"
          >
            Clear filters
          </button>
        </div>
      )}

      {!loading && log.length === 0 && !hasActiveFilters && (
        <div className="rounded-lg border border-border bg-card p-8 text-center text-muted-foreground">
          No agent actions recorded yet. Start a conversation to see activity here.
        </div>
      )}

      {!loading && log.length > 0 && <AuditTable log={log} />}
    </div>
  );
}
