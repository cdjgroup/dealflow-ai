"use client";

import { useEffect, useState } from "react";

interface TokenStatusEntry {
  connection: string;
  provider: string;
  connected: boolean;
  scopes: string[];
  error?: string;
}

export function TokenStatus() {
  const [statuses, setStatuses] = useState<TokenStatusEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/token-status")
      .then((r) => r.json())
      .then(setStatuses)
      .catch(() =>
        setStatuses([
          {
            connection: "unknown",
            provider: "Unknown",
            connected: false,
            scopes: [],
            error: "Unable to retrieve token status",
          },
        ])
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-10 rounded bg-muted/50" />
        <div className="h-10 rounded bg-muted/50" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {statuses.map((s) => (
        <div
          key={s.connection}
          className="flex items-center justify-between rounded-lg border border-border bg-card/30 px-4 py-2"
        >
          <div className="flex items-center gap-2">
            <span
              className={`h-2 w-2 rounded-full ${
                s.connected ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            <span className="text-sm text-foreground">{s.provider}</span>
          </div>
          <span
            className={`text-xs ${
              s.connected ? "text-emerald-400" : "text-muted-foreground"
            }`}
          >
            {s.connected ? "Connected" : s.error || "Not connected"}
          </span>
        </div>
      ))}
    </div>
  );
}
