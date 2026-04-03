"use client";

import { motion } from "framer-motion";

interface Props {
  toolName: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onReject: () => void;
}

const toolLabels: Record<string, string> = {
  createDeal: "Create Deal",
  updateDeal: "Update Deal",
  createContact: "Create Contact",
  logActivity: "Log Activity",
  draftEmail: "Draft Email",
  sendSlackMessage: "Send Slack Message",
  delegateResearch: "Delegate Research",
};

function formatValue(key: string, value: unknown): string {
  if (key === "value" && typeof value === "number") {
    return `$${value.toLocaleString()}`;
  }
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function ApprovalCard({ toolName, args, onApprove, onReject }: Props) {
  const label = toolLabels[toolName] || toolName;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="my-2 rounded-lg border border-amber-500/30 bg-amber-500/5 backdrop-blur-sm p-4"
    >
      <div className="mb-3 flex items-center gap-2">
        <span className="text-amber-400">⚠️</span>
        <p className="text-sm font-medium text-foreground">
          Approval Required: {label}
        </p>
      </div>

      <div className="mb-3 space-y-1 rounded-md bg-card/50 p-3 text-sm">
        {Object.entries(args)
          .filter(([k]) => !k.startsWith("_"))
          .map(([key, value]) => (
            <div key={key} className="flex gap-2">
              <span className="text-muted-foreground">{key}:</span>
              <span className="text-foreground">{formatValue(key, value)}</span>
            </div>
          ))}
      </div>

      <div className="flex gap-2">
        <button
          onClick={onApprove}
          aria-label={`Approve ${label}`}
          className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Approve
        </button>
        <button
          onClick={onReject}
          aria-label={`Reject ${label}`}
          className="rounded-md border border-border bg-card px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Reject
        </button>
      </div>
    </motion.div>
  );
}
