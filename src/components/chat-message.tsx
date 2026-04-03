"use client";

import ReactMarkdown from "react-markdown";
import { motion } from "framer-motion";
import type { UIMessage } from "ai";
import { ToolResultCard } from "@/components/tool-result-card";
import { ApprovalCard } from "@/components/approval-card";
import { ToolBadge } from "@/components/tool-badge";
import { TokenLifecycle } from "@/components/token-lifecycle";
import { TOOL_SCOPE_CONFIG } from "@/lib/tools/scope-map";

interface Props {
  message: UIMessage;
  index?: number;
  onApproval?: (id: string, approved: boolean) => void;
}

export function ChatMessage({ message, index = 0, onApproval }: Props) {
  const isUser = message.role === "user";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.3) }}
      className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}
    >
      {/* AI avatar */}
      {!isUser && (
        <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white mr-2 mt-1 shrink-0">
          D
        </div>
      )}

      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border text-card-foreground"
        }`}
      >
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className={`prose prose-sm max-w-none prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-1 prose-th:bg-muted prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-1 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 ${
                  isUser
                    ? "prose-invert prose-th:bg-white/20 prose-headings:text-primary-foreground prose-strong:text-primary-foreground prose-a:text-primary-foreground/80"
                    : "dark:prose-invert prose-headings:text-primary prose-strong:text-foreground prose-a:text-accent"
                }`}
              >
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            const toolName =
              "toolName" in part ? String(part.toolName) : part.type.replace(/^tool-/, "");
            const state = "state" in part ? String(part.state) : "";
            const output = "output" in part ? part.output : undefined;
            const approval =
              "approval" in part
                ? (part.approval as { id: string; approved?: boolean } | undefined)
                : undefined;
            const input =
              "input" in part
                ? (part.input as Record<string, unknown>)
                : undefined;

            // Approval requested — show approval card
            if (state === "approval-requested" && approval && onApproval) {
              return (
                <div key={i}>
                  <ToolBadge toolName={toolName} state="approval" />
                  <ApprovalCard
                    toolName={toolName}
                    args={input || {}}
                    onApprove={() => onApproval(approval.id, true)}
                    onReject={() => onApproval(approval.id, false)}
                  />
                </div>
              );
            }

            // Approval responded (user already approved/denied)
            if (state === "approval-responded" && approval) {
              const approved = approval.approved;
              return (
                <div key={i}>
                  <div className={`text-xs rounded px-2 py-1 my-1 flex items-center gap-1.5 ${
                    approved ? "bg-emerald-500/10 text-emerald-400" : "bg-red-500/10 text-red-400"
                  }`}>
                    <span>{approved ? "Approved" : "Denied"}: {toolName}</span>
                  </div>
                </div>
              );
            }

            // Token Vault tool metadata for lifecycle display
            const scopeConfig = TOOL_SCOPE_CONFIG[toolName as keyof typeof TOOL_SCOPE_CONFIG];
            const tokenMeta = output && typeof output === "object"
              ? (output as Record<string, unknown>)._tokenMeta as Record<string, unknown> | undefined
              : undefined;

            // Rich tool result cards
            if (
              (state === "result" || state === "output-available") &&
              output
            ) {
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  {scopeConfig && (
                    <TokenLifecycle
                      toolName={toolName}
                      state="completed"
                      provider={scopeConfig.provider}
                      scope={tokenMeta?.scope as string | undefined}
                      minScope={scopeConfig.minScope}
                      expiresIn={tokenMeta?.expiresIn as number | null | undefined}
                      connection={scopeConfig.connection}
                    />
                  )}
                  <ToolBadge toolName={toolName} state="completed" />
                  <ToolResultCard toolName={toolName} output={output} />
                </motion.div>
              );
            }

            // Running / pending state
            return (
              <div key={i}>
                {scopeConfig && (state === "call" || state === "input-streaming") && (
                  <TokenLifecycle
                    toolName={toolName}
                    state="running"
                    provider={scopeConfig.provider}
                    minScope={scopeConfig.minScope}
                    connection={scopeConfig.connection}
                  />
                )}
                <ToolBadge
                  toolName={toolName}
                  state={
                    state === "result"
                      ? "completed"
                      : state === "call" || state === "input-streaming"
                        ? "running"
                        : "pending"
                  }
                />
              </div>
            );
          }
          return null;
        })}
      </div>

      {/* User avatar */}
      {isUser && (
        <div className="flex size-7 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground ml-2 mt-1 shrink-0">
          You
        </div>
      )}
    </motion.div>
  );
}
