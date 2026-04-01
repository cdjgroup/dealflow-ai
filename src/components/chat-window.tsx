"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, type FormEvent } from "react";
import { ChatMessage } from "./chat-message";
import { TokenVaultInterrupt } from "./token-vault-interrupt";

const transport = new DefaultChatTransport({
  api: "/api/chat",
});

export function ChatWindow() {
  const [interrupt, setInterrupt] = useState<{
    connection: string;
    scopes?: string[];
  } | null>(null);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error, regenerate } = useChat({
    transport,
  });

  const isLoading = status === "streaming" || status === "submitted";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (error) {
      try {
        const parsed = JSON.parse(error.message);
        if (parsed.type === "TokenVaultInterrupt" || parsed.connection) {
          setInterrupt({
            connection: parsed.connection || "google-oauth2",
            scopes: parsed.scopes,
          });
        }
      } catch {
        // Not an interrupt error
      }
    }
  }, [error]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    sendMessage({ text });
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-slate-300 mb-2">
                Welcome to DealFlow AI
              </h2>
              <p className="text-slate-500 mb-6 max-w-md">
                Ask me about your pipeline, check your calendar, or draft a
                follow-up email.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {[
                  "Show me my deals",
                  "What's on my calendar tomorrow?",
                  "Draft an email to Sarah about the proposal",
                  "Search contacts at Meridian",
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => handleSuggestion(suggestion)}
                    className="text-sm bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg border border-slate-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage key={message.id} message={message} />
        ))}

        {interrupt && (
          <TokenVaultInterrupt
            connection={interrupt.connection}
            scopes={interrupt.scopes}
            onAuthorized={() => {
              setInterrupt(null);
              regenerate();
            }}
            onDismiss={() => setInterrupt(null)}
          />
        )}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start mb-4">
            <div className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 text-slate-400 text-sm">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                Thinking...
              </div>
            </div>
          </div>
        )}

        {error && !interrupt && (
          <div className="text-red-400 text-sm bg-red-900/20 border border-red-800/30 rounded-lg px-4 py-3 mb-4">
            Error: {error.message}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-slate-800 px-4 py-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your deals, calendar, or contacts..."
            className="flex-1 bg-slate-800 border border-slate-700 rounded-lg px-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
