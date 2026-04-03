"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { AuditEntry } from "@/lib/types/audit";

const statusColors: Record<string, string> = {
  success: "text-emerald-400",
  error: "text-red-400",
};

const toolIcons: Record<string, string> = {
  checkCalendar: "📅",
  draftEmail: "✉️",
  searchEmails: "🔍",
  listDeals: "📊",
  getDealDetails: "📋",
  searchContacts: "👤",
  createDeal: "➕",
  updateDeal: "✏️",
  createContact: "👥",
  logActivity: "📝",
  listSlackChannels: "💬",
  sendSlackMessage: "💬",
};

// Token Vault tools use external OAuth — higher risk tier
const tokenVaultTools = new Set([
  "checkCalendar",
  "draftEmail",
  "searchEmails",
  "listSlackChannels",
  "sendSlackMessage",
]);

// Write operations are medium risk
const writeTools = new Set([
  "createDeal",
  "updateDeal",
  "createContact",
  "logActivity",
  "draftEmail",
  "sendSlackMessage",
]);

function riskLevel(toolName: string): {
  label: string;
  color: string;
  bg: string;
} {
  if (tokenVaultTools.has(toolName)) {
    return {
      label: "OAuth",
      color: "text-amber-400",
      bg: "bg-amber-500/10 border-amber-500/20",
    };
  }
  if (writeTools.has(toolName)) {
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

export function AuditTable({ log }: { log: AuditEntry[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm" aria-label="Agent audit log">
        <thead className="border-b border-border bg-muted/50">
          <tr>
            <th className="px-4 py-3 text-left font-medium">Time</th>
            <th className="px-4 py-3 text-left font-medium">Tool</th>
            <th className="px-4 py-3 text-left font-medium">Risk</th>
            <th className="px-4 py-3 text-left font-medium">Parameters</th>
            <th className="px-4 py-3 text-left font-medium">Status</th>
            <th className="px-4 py-3 text-right font-medium">Duration</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {log.map((entry) => {
            const risk = riskLevel(entry.toolName);
            const isExpanded = expandedId === entry.id;

            return (
              <tr key={entry.id} className="group">
                <td
                  colSpan={6}
                  className="p-0"
                >
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : entry.id)
                    }
                    className="w-full text-left hover:bg-muted/30 transition-colors"
                    aria-expanded={isExpanded}
                  >
                    <div className="grid grid-cols-[1fr_1fr_0.5fr_2fr_0.7fr_0.7fr] items-center">
                      <div className="px-4 py-3 whitespace-nowrap text-muted-foreground text-sm">
                        {new Date(entry.timestamp).toLocaleString()}
                      </div>
                      <div className="px-4 py-3 whitespace-nowrap text-sm">
                        <span className="mr-1">
                          {toolIcons[entry.toolName] || "🔧"}
                        </span>
                        {entry.toolName}
                      </div>
                      <div className="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${risk.bg} ${risk.color}`}
                        >
                          {risk.label}
                        </span>
                      </div>
                      <div className="px-4 py-3 max-w-xs truncate text-muted-foreground text-sm">
                        {Object.entries(entry.input)
                          .map(
                            ([k, v]) =>
                              `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`
                          )
                          .join(", ")}
                      </div>
                      <div className="px-4 py-3 whitespace-nowrap text-sm">
                        <span
                          className={statusColors[entry.result] || ""}
                        >
                          {entry.result}
                        </span>
                        {entry.errorMessage && (
                          <span className="ml-2 text-xs text-red-400">
                            {entry.errorMessage}
                          </span>
                        )}
                      </div>
                      <div className="px-4 py-3 text-right whitespace-nowrap text-muted-foreground text-sm">
                        {entry.durationMs ? `${entry.durationMs}ms` : "—"}
                        <span className="ml-2 text-[10px] text-muted-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity">
                          {isExpanded ? "▲" : "▼"}
                        </span>
                      </div>
                    </div>
                  </button>

                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-4 pb-3 pt-1">
                          <div className="rounded-md bg-muted/30 border border-border p-3 text-xs space-y-2">
                            <div>
                              <span className="text-muted-foreground font-medium">
                                Input:
                              </span>
                              <pre className="mt-1 overflow-x-auto text-foreground/80 whitespace-pre-wrap">
                                {JSON.stringify(entry.input, null, 2)}
                              </pre>
                            </div>
                            {entry.errorMessage && (
                              <div>
                                <span className="text-red-400 font-medium">
                                  Error:
                                </span>
                                <span className="ml-2 text-red-300">
                                  {entry.errorMessage}
                                </span>
                              </div>
                            )}
                            <div className="flex gap-4 text-muted-foreground">
                              <span>Thread: {entry.threadId}</span>
                              <span>ID: {entry.id}</span>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
