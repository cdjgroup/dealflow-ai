"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, useMemo, useCallback, type FormEvent } from "react";
import { ChatMessage } from "./chat-message";
import { TokenVaultInterrupt } from "./token-vault-interrupt";

const transport = new DefaultChatTransport({
  api: "/api/chat",
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

function parseInterrupt(error: Error | undefined): {
  connection: string;
  scopes?: string[];
} | null {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.type === "TokenVaultInterrupt" || parsed.connection) {
      return {
        connection: parsed.connection || "google-oauth2",
        scopes: parsed.scopes,
      };
    }
  } catch {
    // Not an interrupt error
  }
  return null;
}

export function ChatWindow() {
  const [dismissedError, setDismissedError] = useState<Error | null>(null);
  const [input, setInput] = useState("");

  const { messages, sendMessage, status, error, regenerate, addToolApprovalResponse } = useChat({
    transport,
  });

  const detectedInterrupt = useMemo(() => parseInterrupt(error), [error]);
  // Show interrupt unless this specific error was dismissed
  const interrupt = error && error !== dismissedError ? detectedInterrupt : null;

  const isLoading = status === "streaming" || status === "submitted";
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage({ text: input });
    setInput("");
  };

  const handleSuggestion = (text: string) => {
    sendMessage({ text });
  };

  const handleApproval = useCallback(
    (approvalId: string, approved: boolean) => {
      addToolApprovalResponse({
        id: approvalId,
        approved,
        reason: approved ? "User approved" : "User denied",
      });
    },
    [addToolApprovalResponse]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-foreground/80 mb-2">
                Welcome to DealFlow AI
              </h2>
              <p className="text-muted-foreground mb-6 max-w-md">
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
                    className="text-sm bg-card hover:bg-secondary text-foreground/80 px-3 py-2 rounded-lg border border-border transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            onApproval={handleApproval}
          />
        ))}

        {interrupt && (
          <TokenVaultInterrupt
            connection={interrupt.connection}
            scopes={interrupt.scopes}
            onAuthorized={() => {
              setDismissedError(error ?? null);
              regenerate();
            }}
            onDismiss={() => setDismissedError(error ?? null)}
          />
        )}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start mb-4">
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                Thinking...
              </div>
            </div>
          </div>
        )}

        {error && !interrupt && (
          <div className="text-destructive text-sm bg-destructive/10 border border-destructive/20 rounded-lg px-4 py-3 mb-4">
            Error: {error.message}
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border px-4 py-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your deals, calendar, or contacts..."
            className="flex-1 bg-card border border-border rounded-lg px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground font-medium px-6 py-2.5 rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
