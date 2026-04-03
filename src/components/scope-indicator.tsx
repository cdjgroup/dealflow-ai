"use client";

import { motion, AnimatePresence } from "framer-motion";
import { TOOL_SCOPES, scopeProvider } from "@/lib/tools/scope-map";

interface Props {
  activeTools: string[];
}

const providerIcons: Record<string, string> = {
  Google: "🔐",
  Slack: "🔐",
};

export function ScopeIndicator({ activeTools }: Props) {
  // Collect unique scopes from currently running tools
  const activeScopes = new Set<string>();
  for (const tool of activeTools) {
    const scopes = TOOL_SCOPES[tool];
    if (scopes) {
      for (const scope of scopes) activeScopes.add(scope);
    }
  }

  const scopeArray = Array.from(activeScopes);
  const provider = scopeProvider(scopeArray);

  return (
    <AnimatePresence>
      {activeScopes.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.95 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 backdrop-blur-sm p-3 mb-3"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-semibold text-emerald-400">
              Token Vault Active
            </span>
            {provider && (
              <span className="text-xs text-muted-foreground">
                {providerIcons[provider] || "🔐"} {provider}
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {scopeArray.map((scope, i) => (
              <motion.span
                key={scope}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05, duration: 0.2 }}
                className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[10px] text-emerald-300"
              >
                <svg
                  className="w-2.5 h-2.5"
                  viewBox="0 0 12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path d="M6 1.5v3M6 7.5v3M1.5 6h3M7.5 6h3" strokeLinecap="round" />
                </svg>
                {scope}
              </motion.span>
            ))}
          </div>
          <p className="text-[9px] text-muted-foreground/50 mt-1.5">
            Short-lived token via Auth0 — revocable anytime
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
