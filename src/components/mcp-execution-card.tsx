"use client";

import { motion } from "framer-motion";

export type ExecutionPhase = "idle" | "executing" | "success" | "error";

interface McpExecutionCardProps {
  phase: ExecutionPhase;
  toolName: string;
  cibaRequired: boolean;
  durationMs?: number;
  response?: unknown;
  error?: string;
  onReset: () => void;
  onCancel?: () => void;
}

export function McpExecutionCard({
  phase,
  toolName,
  cibaRequired,
  durationMs,
  response,
  error,
  onReset,
  onCancel,
}: McpExecutionCardProps) {
  if (phase === "idle") return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-card border border-border rounded-lg p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-foreground">
          {toolName}
        </h3>
        {phase !== "executing" && (
          <button
            onClick={onReset}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Executing / CIBA waiting */}
      {phase === "executing" && (
        <div className="space-y-3" role="status" aria-live="polite">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-chart-4 rounded-full animate-pulse" />
            <span className="text-xs text-muted-foreground">
              {cibaRequired
                ? "Waiting for Guardian approval on your phone..."
                : "Executing..."}
            </span>
            {onCancel && (
              <button
                onClick={onCancel}
                className="ml-auto text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
          {cibaRequired && (
            <p className="text-[10px] text-muted-foreground/70 pl-4">
              A push notification was sent to your phone via Auth0 Guardian.
              Approve to continue, or deny to cancel.
            </p>
          )}
        </div>
      )}

      {/* Success */}
      {phase === "success" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] rounded-full border px-2.5 py-1 border-emerald-500/30 bg-emerald-500/15 text-emerald-600">
              Success
            </span>
            {cibaRequired && (
              <span className="text-[10px] rounded-full border px-2.5 py-1 border-blue-500/30 bg-blue-500/15 text-blue-600">
                CIBA Approved
              </span>
            )}
            {!cibaRequired && (
              <span className="text-[10px] rounded-full border px-2.5 py-1 border-muted-foreground/30 text-muted-foreground">
                No approval required
              </span>
            )}
            {durationMs != null && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {(durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <pre className="text-[11px] bg-muted/30 rounded-md p-3 max-h-60 overflow-auto whitespace-pre-wrap break-words text-foreground/80">
            {JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}

      {/* Error */}
      {phase === "error" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-[10px] rounded-full border px-2.5 py-1 border-red-500/30 bg-red-500/15 text-red-600">
              Failed
            </span>
            {cibaRequired && (
              <span className="text-[10px] rounded-full border px-2.5 py-1 border-amber-500/30 bg-amber-500/15 text-amber-700">
                Write Tool (CIBA)
              </span>
            )}
            {durationMs != null && (
              <span className="text-[10px] text-muted-foreground ml-auto">
                {(durationMs / 1000).toFixed(1)}s
              </span>
            )}
          </div>
          <div className="text-xs text-red-600/90 bg-red-500/15 border border-red-500/20 rounded-md p-3">
            {error || "Unknown error"}
          </div>
        </div>
      )}
    </motion.div>
  );
}
