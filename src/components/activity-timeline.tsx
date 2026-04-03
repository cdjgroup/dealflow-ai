"use client";

import type { AuditEntry } from "@/lib/types/audit";
import { toolIcons, TOKEN_VAULT_TOOLS } from "@/lib/constants/tools";

function timeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

interface Props {
  entries: AuditEntry[];
}

export function ActivityTimeline({ entries }: Props) {
  if (entries.length === 0) {
    return (
      <div className="text-center py-6 text-sm text-muted-foreground">
        No agent actions recorded yet. Start a conversation to see activity here.
      </div>
    );
  }

  // Compute token usage stats
  const tokenVaultCalls = entries.filter((e) =>
    TOKEN_VAULT_TOOLS.has(e.toolName)
  );
  const successCount = entries.filter((e) => e.result === "success").length;
  const avgDuration =
    entries.filter((e) => e.durationMs).reduce((sum, e) => sum + (e.durationMs || 0), 0) /
    (entries.filter((e) => e.durationMs).length || 1);

  return (
    <div className="space-y-4">
      {/* Usage Stats (Item 7) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg bg-muted/30 p-3 text-center">
          <div className="text-lg font-semibold text-foreground">
            {entries.length}
          </div>
          <div className="text-[10px] text-muted-foreground">Total Actions</div>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 text-center">
          <div className="text-lg font-semibold text-primary">
            {tokenVaultCalls.length}
          </div>
          <div className="text-[10px] text-muted-foreground">
            Token Vault Calls
          </div>
        </div>
        <div className="rounded-lg bg-muted/30 p-3 text-center">
          <div className="text-lg font-semibold text-emerald-400">
            {entries.length > 0
              ? Math.round((successCount / entries.length) * 100)
              : 0}
            %
          </div>
          <div className="text-[10px] text-muted-foreground">Success Rate</div>
        </div>
      </div>

      {/* Avg Response Time */}
      <div className="text-xs text-muted-foreground text-center">
        Avg tool execution: {Math.round(avgDuration)}ms
      </div>

      {/* Timeline (Item 8) */}
      <div className="relative">
        <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
        <div className="space-y-3">
          {entries.slice(0, 15).map((entry) => (
            <div key={entry.id} className="relative flex items-start gap-3 pl-7">
              <div
                className={`absolute left-2 top-1.5 w-2.5 h-2.5 rounded-full border-2 border-card ${
                  entry.result === "success" ? "bg-emerald-500" : "bg-red-500"
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm">
                    {toolIcons[entry.toolName] || "\uD83D\uDD27"}
                  </span>
                  <span className="text-xs font-medium text-foreground">
                    {entry.toolName}
                  </span>
                  {TOKEN_VAULT_TOOLS.has(entry.toolName) && (
                    <span className="text-[10px] text-primary/70">
                      \uD83D\uDD12 Token Vault
                    </span>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {timeAgo(entry.timestamp)}
                  </span>
                </div>
                {Object.keys(entry.input).length > 0 && (
                  <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                    {Object.entries(entry.input)
                      .slice(0, 3)
                      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
                      .join(" \u00B7 ")}
                  </div>
                )}
                {entry.errorMessage && (
                  <div className="text-[10px] text-red-400 mt-0.5">
                    {entry.errorMessage}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {entries.length > 15 && (
        <div className="text-center">
          <a
            href="/dashboard/audit"
            className="text-xs text-primary hover:underline"
          >
            View all {entries.length} entries &rarr;
          </a>
        </div>
      )}
    </div>
  );
}
