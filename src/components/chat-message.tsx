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
              <div key={i} className="prose prose-invert prose-sm max-w-none">
                <ReactMarkdown>{part.text}</ReactMarkdown>
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            const toolName = "toolName" in part ? String(part.toolName) : part.type;
            const state = "state" in part ? String(part.state) : "";
            return (
              <div
                key={i}
                className="text-xs bg-slate-900/50 rounded px-2 py-1 my-1 text-slate-400"
              >
                <span className="text-emerald-400">{toolName}</span>
                {state === "result" && (
                  <span className="ml-2 text-slate-500">done</span>
                )}
                {state === "call" && (
                  <span className="ml-2 text-yellow-400 animate-pulse">
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
