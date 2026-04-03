"use client";

import { useEffect, useState, useCallback } from "react";

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
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/token-status");
      const data = await res.json();
      setStatuses(data);
      setLastChecked(new Date());
    } catch {
      setStatuses([
        {
          connection: "unknown",
          provider: "Unknown",
          connected: false,
          scopes: [],
          error: "Unable to retrieve token status",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    // Auto-refresh every 30 seconds to show live status
    const interval = setInterval(fetchStatus, 30000);
    return () => clearInterval(interval);
  }, [fetchStatus]);

  if (loading) {
    return (
      <div className="animate-pulse space-y-2">
        <div className="h-12 rounded bg-muted/50" />
        <div className="h-12 rounded bg-muted/50" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {statuses.map((s) => (
        <div
          key={s.connection}
          className={`flex items-center justify-between rounded-lg border px-4 py-3 transition-colors ${
            s.connected
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-red-500/20 bg-red-500/5"
          }`}
        >
          <div className="flex items-center gap-3">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                s.connected ? "bg-emerald-500" : "bg-red-500"
              }`}
            />
            <div>
              <span className="text-sm font-medium text-foreground">
                {s.provider}
              </span>
              {s.connected && (
                <div className="flex gap-1 mt-0.5">
                  {s.scopes.map((scope) => (
                    <span
                      key={scope}
                      className="rounded bg-muted/50 px-1 py-0.5 text-[10px] text-muted-foreground"
                    >
                      {scope}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="text-right">
            <span
              className={`text-xs font-medium ${
                s.connected ? "text-emerald-400" : "text-red-400"
              }`}
            >
              {s.connected ? "Connected" : s.error || "Not connected"}
            </span>
            {s.connected && (
              <div className="text-[10px] text-muted-foreground/50">
                Token active
              </div>
            )}
          </div>
        </div>
      ))}
      {lastChecked && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-muted-foreground/50">
            Last checked: {lastChecked.toLocaleTimeString()}
          </p>
          <button
            onClick={() => { setLoading(true); fetchStatus(); }}
            className="text-[10px] text-primary hover:underline"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
}
