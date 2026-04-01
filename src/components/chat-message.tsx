"use client";

import ReactMarkdown from "react-markdown";
import type { UIMessage } from "ai";

export function ChatMessage({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} mb-4`}>
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 ${
          isUser
            ? "bg-primary/90 text-primary-foreground dark:bg-primary/20 dark:text-foreground"
            : "bg-card text-card-foreground border border-border"
        }`}
      >
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className="prose prose-sm max-w-none dark:prose-invert prose-table:border-collapse prose-th:border prose-th:border-border prose-th:px-3 prose-th:py-1 prose-th:bg-muted prose-td:border prose-td:border-border prose-td:px-3 prose-td:py-1 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-headings:text-primary prose-strong:text-foreground prose-a:text-accent"
              >
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            const toolName =
              "toolName" in part ? String(part.toolName) : part.type;
            const state = "state" in part ? String(part.state) : "";
            return (
              <div
                key={i}
                className="text-xs bg-muted/50 rounded px-2 py-1 my-1 text-muted-foreground flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                <span className="text-muted-foreground">{toolName}</span>
                {state === "result" && (
                  <span className="text-muted-foreground/60">completed</span>
                )}
                {(state === "call" || state === "input-streaming") && (
                  <span className="text-chart-4 animate-pulse">
                    running...
                  </span>
                )}
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}
