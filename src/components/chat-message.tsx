"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "framer-motion";
import type { UIMessage } from "ai";
import { ToolResultCard } from "@/components/tool-result-card";
import { ApprovalCard } from "@/components/approval-card";
import { ToolBadge } from "@/components/tool-badge";
import { CibaInlineCard } from "@/components/ciba-inline-card";

interface Props {
  message: UIMessage;
  index?: number;
  onApproval?: (id: string, approved: boolean) => void;
}

export function ChatMessage({ message, index = 0, onApproval }: Props) {
  const isUser = message.role === "user";

  // Collapse "approval-only" assistant messages into a minimal status line.
  // These are the initial messages where the model proposed a tool, the user
  // approved, and the result appears in the NEXT message. Without this, the
  // message shows duplicate text ("Let me check your calendar for tomorrow!").
  if (!isUser && message.parts) {
    const hasApprovedTool = message.parts.some(
      (p) =>
        p.type.startsWith("tool-") &&
        "state" in p && p.state === "approval-responded" &&
        "approval" in p && (p.approval as { approved?: boolean })?.approved === true
    );
    const hasToolOutput = message.parts.some(
      (p) =>
        p.type.startsWith("tool-") &&
        "state" in p &&
        ((p as { state: string }).state === "output-available" || (p as { state: string }).state === "result")
    );
    if (hasApprovedTool && !hasToolOutput) {
      // Render as a minimal status line instead of a full bubble
      const toolPart = message.parts.find((p) => p.type.startsWith("tool-"));
      const toolName = toolPart
        ? ("toolName" in toolPart ? String(toolPart.toolName) : toolPart.type.replace(/^tool-/, ""))
        : "tool";
      return (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex justify-start mb-2"
        >
          <div className="flex items-center gap-2 text-xs text-emerald-400 pl-9">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span>Approved {toolName}</span>
          </div>
        </motion.div>
      );
    }
  }

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
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
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

            // Approval responded
            if (state === "approval-responded" && approval) {
              // Approved: hide badge entirely — user already clicked approve,
              // the result (or next message) confirms execution
              if (approval.approved) {
                // If output is available, show result card
                if (output) {
                  return (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <ToolResultCard toolName={toolName} output={output} />
                    </motion.div>
                  );
                }
                return null; // Hide — approval confirmation is implicit
              }
              // Denied: show denial badge
              return (
                <div key={i}>
                  <div className="text-xs rounded px-2 py-1 my-1 flex items-center gap-1.5 bg-red-500/10 text-red-400">
                    <span>Denied: {toolName}</span>
                  </div>
                </div>
              );
            }

            // CIBA interrupt — show waiting card inline in tool result
            const cibaInterrupt = output && typeof output === "object"
              ? (output as Record<string, unknown>)._cibaInterrupt as {
                  type: string; authReqId: string; bindingMessage: string;
                  expiresIn: number; interval: number;
                } | undefined
              : undefined;

            if (cibaInterrupt && (state === "result" || state === "output-available")) {
              return (
                <div key={i}>
                  <ToolBadge toolName={toolName} state="approval" />
                  <CibaInlineCard
                    authReqId={cibaInterrupt.authReqId}
                    bindingMessage={cibaInterrupt.bindingMessage}
                    expiresIn={cibaInterrupt.expiresIn}
                    interval={cibaInterrupt.interval}
                  />
                </div>
              );
            }

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
                  <ToolResultCard toolName={toolName} output={output} />
                </motion.div>
              );
            }

            // Running / pending state
            return (
              <div key={i}>
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
