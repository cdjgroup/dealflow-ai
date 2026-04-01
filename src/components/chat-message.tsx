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
            ? "bg-emerald-600 text-white"
            : "bg-slate-800 text-slate-200 border border-slate-700"
        }`}
      >
        {message.parts?.map((part, i) => {
          if (part.type === "text") {
            return (
              <div
                key={i}
                className="prose prose-invert prose-sm max-w-none prose-table:border-collapse prose-th:border prose-th:border-slate-600 prose-th:px-3 prose-th:py-1 prose-th:bg-slate-700/50 prose-td:border prose-td:border-slate-700 prose-td:px-3 prose-td:py-1 prose-p:my-2 prose-ul:my-2 prose-li:my-0.5 prose-headings:text-emerald-400 prose-strong:text-white prose-a:text-emerald-400"
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
                className="text-xs bg-slate-900/50 rounded px-2 py-1 my-1 text-slate-400 flex items-center gap-1.5"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span className="text-slate-500">{toolName}</span>
                {state === "result" && (
                  <span className="text-slate-600">completed</span>
                )}
                {(state === "call" || state === "input-streaming") && (
                  <span className="text-yellow-400 animate-pulse">
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
