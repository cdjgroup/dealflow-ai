"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import type { McpClient } from "@/lib/types/policy";
import { MCP_SAFE_TOOLS } from "@/lib/constants/tools";

const TRUST_TIER_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  full: { label: "Full Access", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  standard: { label: "Standard", color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  restricted: { label: "Restricted", color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  readonly: { label: "Read Only", color: "text-muted-foreground", bg: "bg-muted/50 border-border" },
};

interface McpClientCardProps {
  client: McpClient;
  onDelete: (clientId: string) => void;
  onRotateKey: (clientId: string) => void;
}

export function McpClientCard({ client, onDelete, onRotateKey }: McpClientCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [rotating, setRotating] = useState(false);

  const tier = TRUST_TIER_STYLES[client.trustTier] || TRUST_TIER_STYLES.standard;
  const allMcpTools = Array.from(MCP_SAFE_TOOLS);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="rounded-lg border border-border overflow-hidden"
    >
      {/* Header */}
      <div className="bg-muted/20 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground">{client.name}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${tier.bg} ${tier.color}`}>
            {tier.label}
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <span>{client.rateLimit} req/min</span>
          {client.lastUsedAt && (
            <span>Last used: {new Date(client.lastUsedAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-4 py-3 space-y-3">
        {client.description && (
          <p className="text-xs text-muted-foreground">{client.description}</p>
        )}

        {/* API Key prefix */}
        <div className="flex items-center gap-2">
          <code className="text-xs font-mono text-foreground/70 bg-muted/50 rounded px-2 py-1">
            {client.apiKeyPrefix}••••••••••••
          </code>
        </div>

        {/* Allowed tools */}
        <div>
          <p className="text-[10px] font-medium text-muted-foreground mb-1.5">
            Tools ({client.allowedTools.length} of {allMcpTools.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {allMcpTools.map((tool) => {
              const allowed = client.allowedTools.includes(tool);
              return (
                <span
                  key={tool}
                  className={`text-[10px] rounded px-1.5 py-0.5 ${
                    allowed
                      ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                      : "text-muted-foreground/40 bg-muted/30 line-through"
                  }`}
                >
                  {tool}
                </span>
              );
            })}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
          <button
            onClick={async () => {
              setRotating(true);
              try { await onRotateKey(client.id); } finally { setRotating(false); }
            }}
            disabled={rotating}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            Rotate Key
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-[10px] text-red-400 hover:text-red-300 transition-colors ml-auto"
            >
              Delete
            </button>
          ) : (
            <div className="flex items-center gap-1 ml-auto">
              <span className="text-[10px] text-red-400">Confirm?</span>
              <button
                onClick={() => onDelete(client.id)}
                className="text-[10px] text-red-400 font-medium hover:text-red-300"
              >
                Yes
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                className="text-[10px] text-muted-foreground hover:text-foreground"
              >
                No
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
