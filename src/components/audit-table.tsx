"use client";

import { Fragment, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AuditEntry } from "@/lib/types/audit";
import { toolIcons, TOKEN_VAULT_TOOLS, WRITE_TOOLS, TOOL_DISPLAY_NAMES, SCOPE_LABELS } from "@/lib/constants/tools";

const statusColors: Record<string, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
};

function riskLevel(toolName: string): {
  label: string;
  color: string;
  bg: string;
} {
  if (TOKEN_VAULT_TOOLS.has(toolName)) {
    return {
      label: "OAuth",
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    };
  }
  if (WRITE_TOOLS.has(toolName)) {
    return {
      label: "Write",
      color: "text-chart-4",
      bg: "bg-chart-4/10 border-chart-4/20",
    };
  }
  return {
    label: "Read",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20",
  };
}

function rowSeverityClass(result: string): string {
  if (result === "error") return "bg-red-500/5 border-l-2 border-l-red-500/40";
  return "";
}

function DetailPanel({ entry }: { entry: AuditEntry }) {
  const inputEntries = Object.entries(entry.input);
  const hasInput = inputEntries.length > 0;

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
      id={`audit-detail-${entry.id}`}
      role="region"
      aria-label={`Details for ${entry.toolName} call`}
    >
      <div className="px-4 pb-3 pt-1">
        <div className="rounded-md bg-muted/30 border border-border p-3 text-xs space-y-3">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <div className="contents">
              <dt className="text-muted-foreground font-medium">Tool</dt>
              <dd>{TOOL_DISPLAY_NAMES[entry.toolName] || entry.toolName}</dd>
            </div>
            <div className="contents">
              <dt className="text-muted-foreground font-medium">Timestamp</dt>
              <dd>
                <time dateTime={entry.timestamp}>
                  {new Date(entry.timestamp).toLocaleString()}
                </time>
              </dd>
            </div>
            <div className="contents">
              <dt className="text-muted-foreground font-medium">Status</dt>
              <dd className={statusColors[entry.result] || ""}>
                {entry.result}
              </dd>
            </div>
            {entry.durationMs != null && (
              <div className="contents">
                <dt className="text-muted-foreground font-medium">Duration</dt>
                <dd>{entry.durationMs}ms</dd>
              </div>
            )}
            {entry.consentAction && (
              <div className="contents">
                <dt className="text-muted-foreground font-medium">Consent</dt>
                <dd className={
                  entry.consentAction === "approved" || entry.consentAction === "always-allowed"
                    ? "text-emerald-400"
                    : entry.consentAction === "denied"
                      ? "text-red-400"
                      : "text-muted-foreground"
                }>
                  {entry.consentAction}
                </dd>
              </div>
            )}
            {entry.policyReason && (
              <div className="contents">
                <dt className="text-muted-foreground font-medium">Policy Decision</dt>
                <dd className="text-amber-400">{entry.policyReason}</dd>
              </div>
            )}
            <div className="contents">
              <dt className="text-muted-foreground font-medium">Thread</dt>
              <dd className="text-muted-foreground">{entry.threadId}</dd>
            </div>
            <div className="contents">
              <dt className="text-muted-foreground font-medium">Entry ID</dt>
              <dd className="text-muted-foreground">{entry.id}</dd>
            </div>
          </dl>

          {hasInput ? (
            <div>
              <span className="text-muted-foreground font-medium text-xs block mb-1.5">
                Parameters
              </span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded bg-muted/40 px-2.5 py-2">
                {inputEntries.map(([key, value]) => (
                  <div key={key} className="contents">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="text-foreground/80 break-all">
                      {typeof value === "object"
                        ? JSON.stringify(value)
                        : String(value)}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : (
            <p className="text-muted-foreground italic">No parameters</p>
          )}

          {entry.tokenMeta && (
            <div className="rounded-md bg-emerald-500/5 border border-emerald-500/20 p-2 space-y-1">
              <span className="text-emerald-400 font-medium text-[10px]">
                Token Exchange
              </span>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-[10px]">
                <div className="contents">
                  <dt className="text-muted-foreground">Provider</dt>
                  <dd>{entry.tokenMeta.provider}</dd>
                </div>
                <div className="contents">
                  <dt className="text-muted-foreground">Connection</dt>
                  <dd className="font-mono">{entry.tokenMeta.connection}</dd>
                </div>
                {entry.tokenMeta.grantedScope && (
                  <div className="contents">
                    <dt className="text-muted-foreground">Scope</dt>
                    <dd className="text-emerald-400">
                      {entry.tokenMeta.grantedScope.split(" ").map((s) => SCOPE_LABELS[s] || s).join(", ")}
                    </dd>
                  </div>
                )}
                {entry.tokenMeta.expiresIn != null && (
                  <div className="contents">
                    <dt className="text-muted-foreground">Token TTL</dt>
                    <dd>{entry.tokenMeta.expiresIn}s</dd>
                  </div>
                )}
              </dl>
            </div>
          )}

          {entry.errorMessage && (
            <div className="rounded bg-red-500/10 border border-red-500/20 px-2.5 py-2">
              <span className="text-red-400 font-medium">Error: </span>
              <span className="text-red-300">{entry.errorMessage}</span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function AuditTable({ log }: { log: AuditEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" aria-label="Agent audit log">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left font-medium">Time</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Source</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Tool</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Risk</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Parameters</th>
            <th scope="col" className="px-4 py-3 text-left font-medium">Status</th>
            <th scope="col" className="px-4 py-3 text-right font-medium">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {log.map((entry) => {
            const risk = riskLevel(entry.toolName);
            const isExpanded = expandedId === entry.id;

            return (
              <Fragment key={entry.id}>
                <tr
                  tabIndex={0}
                  className={`group cursor-pointer hover:bg-muted/30 transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset ${rowSeverityClass(entry.result)}`}
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setExpandedId(isExpanded ? null : entry.id);
                    }
                  }}
                  aria-expanded={isExpanded}
                  aria-controls={`audit-detail-${entry.id}`}
                >
                  <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                    <time dateTime={entry.timestamp}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </time>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    {entry.surface ? (
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                        entry.surface === "chat" ? "text-blue-400 bg-blue-500/10 border-blue-500/20" :
                        entry.surface === "mcp" ? "text-purple-400 bg-purple-500/10 border-purple-500/20" :
                        "text-amber-400 bg-amber-500/10 border-amber-500/20"
                      }`}>
                        {entry.surface === "chat" ? "Chat" : entry.surface === "mcp" ? "MCP" : "Actions"}
                        {entry.mcpClientName && ` (${entry.mcpClientName})`}
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="mr-1" aria-hidden="true">
                      {toolIcons[entry.toolName] || "🔧"}
                    </span>
                    {TOOL_DISPLAY_NAMES[entry.toolName] || entry.toolName}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${risk.bg} ${risk.color}`}
                    >
                      {risk.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-muted-foreground">
                    {Object.entries(entry.input)
                      .map(
                        ([k, v]) =>
                          `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`
                      )
                      .join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className={statusColors[entry.result] || ""}>
                      {entry.result}
                    </span>
                    {entry.errorMessage && (
                      <span className="ml-2 text-xs text-red-400">
                        {entry.errorMessage}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground">
                    {entry.durationMs ? `${entry.durationMs}ms` : "—"}
                    <span className="ml-2 text-[10px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
                      {isExpanded ? "▲" : "▼"}
                    </span>
                  </td>
                </tr>
                <AnimatePresence>
                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <DetailPanel entry={entry} />
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
