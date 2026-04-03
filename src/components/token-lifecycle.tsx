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
  { label: "AI Decides", icon: "🤖", color: "text-primary" },
  { label: "Token Exchange", icon: "🔐", color: "text-amber-400" },
  { label: "Scoped Token", icon: "🎯", color: "text-emerald-400" },
  { label: "API Call", icon: "📡", color: "text-blue-400" },
  { label: "Response", icon: "✓", color: "text-emerald-400" },
  { label: "Token Expires", icon: "⏱", color: "text-muted-foreground" },
];

export function TokenLifecycle({
  toolName,
  state,
  provider,
  scope,
  minScope,
  expiresIn,
  connection,
}: TokenLifecycleProps) {
  const [expanded, setExpanded] = useState(state === "running");
  const isComplete = state === "completed";
  const activeStage = isComplete ? STAGES.length - 1 : 3;

  return (
    <div className="my-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full"
      >
        <span className="relative flex h-2 w-2">
          {!isComplete && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={`relative inline-flex h-2 w-2 rounded-full ${
              isComplete ? "bg-emerald-500" : "bg-emerald-400"
            }`}
          />
        </span>
        <span>
          Token Vault {isComplete ? "completed" : "active"}
          {provider && ` — ${provider}`}
        </span>
        <span className="ml-auto opacity-60">{expanded ? "▲" : "▼"}</span>
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
            <div className="mt-2 rounded-lg border border-border/50 bg-card/30 backdrop-blur-sm p-3">
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
                      transition={{ delay: i * 0.08, duration: 0.2 }}
                      className="flex items-center gap-1 shrink-0"
                    >
                      <div
                        className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium border ${
                          isCurrent
                            ? "border-emerald-500/40 bg-emerald-500/10"
                            : isActive
                              ? "border-border/30 bg-card/50"
                              : "border-transparent"
                        } ${isActive ? stage.color : "text-muted-foreground/40"}`}
                      >
                        <span>{stage.icon}</span>
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
                          transition={{ delay: i * 0.08 + 0.05, duration: 0.15 }}
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
                    <span className="text-foreground font-mono">{connection}</span>
                  </>
                )}
                {minScope && (
                  <>
                    <span className="text-muted-foreground">Using scope</span>
                    <span className="text-emerald-400 font-mono">{minScope}</span>
                  </>
                )}
                {scope && scope !== minScope && (
                  <>
                    <span className="text-muted-foreground">Granted scope</span>
                    <span className="text-muted-foreground/70 font-mono text-[9px]">
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

              <p className="text-[8px] text-muted-foreground/40 mt-2">
                Short-lived token via Auth0 Token Vault — revocable anytime
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
