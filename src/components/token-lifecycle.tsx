"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface TokenLifecycleProps {
  toolName: string;
  state: "running" | "completed";
  provider?: string;
  scope?: string;
  minScope?: string;
  expiresIn?: number | null;
  connection?: string;
}

const STAGES = [
  { label: "AI Decides", shortLabel: "Decide", icon: "\u{1F916}", color: "text-primary" },
  { label: "Token Exchange", shortLabel: "Exchange", icon: "\u{1F510}", color: "text-amber-400" },
  { label: "Scoped Token", shortLabel: "Scoped", icon: "\u{1F3AF}", color: "text-emerald-400" },
  { label: "API Call", shortLabel: "Call", icon: "\u{1F4E1}", color: "text-blue-400" },
  { label: "Response", shortLabel: "Done", icon: "\u2713", color: "text-emerald-400" },
  { label: "Token Expires", shortLabel: "Expire", icon: "\u23F1", color: "text-muted-foreground" },
];

const API_CALL_INDEX = STAGES.findIndex(s => s.label === "API Call");

export function TokenLifecycle({
  toolName,
  state,
  provider,
  scope,
  minScope,
  expiresIn,
  connection,
}: TokenLifecycleProps) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = state === "completed";
  const activeStage = isComplete ? STAGES.length - 1 : API_CALL_INDEX;

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        aria-label={`Token Vault ${isComplete ? "completed" : "active"}${provider ? ` for ${provider}` : ""}. ${expanded ? "Collapse" : "Expand"} details.`}
        className="flex items-center gap-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full py-2"
      >
        <span className="relative flex h-2.5 w-2.5">
          {!isComplete && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2.5 w-2.5 rounded-full ${
              isComplete ? "bg-emerald-500" : "bg-emerald-400"
            }`}
          />
        </span>
        <span>
          Token Vault {isComplete ? "completed" : "active"}
          {provider && ` \u2014 ${provider}`}
        </span>
        <span className="ml-auto opacity-60" aria-hidden="true">{expanded ? "\u25B2" : "\u25BC"}</span>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-1 rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm p-3">
              {/* Stage pipeline */}
              <div className="flex items-center gap-1 mb-3 overflow-x-auto">
                {STAGES.map((stage, i) => {
                  const isActive = i <= activeStage;
                  const isCurrent = i === activeStage && !isComplete;
                  return (
                    <motion.div
                      key={stage.label}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{
                        opacity: isActive ? 1 : 0.3,
                        scale: isCurrent ? 1.05 : 1,
                      }}
                      transition={{ delay: i * 0.3, duration: 0.4 }}
                      className="flex items-center gap-1 shrink-0"
                    >
                      <div
                        title={stage.label}
                        aria-label={stage.label}
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium border ${
                          isCurrent
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : isActive
                              ? "border-border/30 bg-card/50"
                              : "border-transparent"
                        } ${isActive ? stage.color : "text-muted-foreground/40"}`}
                      >
                        <span aria-hidden="true">{stage.icon}</span>
                        <span className="sm:hidden">{stage.shortLabel}</span>
                        <span className="hidden sm:inline">{stage.label}</span>
                      </div>
                      {i < STAGES.length - 1 && (
                        <motion.div
                          className={`w-3 h-px ${
                            i < activeStage
                              ? "bg-emerald-500/50"
                              : "bg-border/30"
                          }`}
                          initial={{ scaleX: 0 }}
                          animate={{ scaleX: i < activeStage ? 1 : 0.5 }}
                          transition={{ delay: i * 0.3 + 0.15, duration: 0.3 }}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                {connection && (
                  <>
                    <span className="text-muted-foreground">Connection</span>
                    <span className="text-foreground font-mono truncate" title={connection}>{connection}</span>
                  </>
                )}
                {minScope && (
                  <>
                    <span className="text-muted-foreground">Using scope</span>
                    <span className="text-emerald-400 font-mono break-all">{minScope}</span>
                  </>
                )}
                {scope && scope !== minScope && (
                  <>
                    <span className="text-muted-foreground">Granted scope</span>
                    <span className="text-muted-foreground/70 font-mono text-[9px] break-all">
                      {scope}
                    </span>
                  </>
                )}
                {expiresIn != null && (
                  <>
                    <span className="text-muted-foreground">Token TTL</span>
                    <span className="text-foreground">
                      {expiresIn >= 3600
                        ? `${Math.floor(expiresIn / 3600)}h`
                        : `${Math.floor(expiresIn / 60)}m`}
                      {" "}({expiresIn}s)
                    </span>
                  </>
                )}
              </div>

              <p className="text-[10px] text-muted-foreground/60 mt-2">
                Short-lived token via Auth0 Token Vault \u2014 revocable anytime
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
