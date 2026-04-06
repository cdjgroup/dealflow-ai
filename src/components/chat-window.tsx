"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useEffect, useState, useMemo, useCallback, type FormEvent } from "react";
import { motion } from "framer-motion";
import { ChatMessage } from "./chat-message";
import { TokenVaultInterrupt } from "./token-vault-interrupt";
import { CibaWaitingCard } from "./ciba-waiting-card";

const transport = new DefaultChatTransport({
  api: "/api/chat",
  headers: { "X-Requested-With": "XMLHttpRequest" },
});

interface TokenVaultInterruptData {
  type: "TokenVaultInterrupt";
  connection: string;
  scopes?: string[];
}

interface CibaInterruptData {
  type: "CibaInterrupt";
  authReqId: string;
  bindingMessage: string;
  expiresIn: number;
  interval: number;
}

type InterruptData =
  | { kind: "token-vault"; data: TokenVaultInterruptData }
  | { kind: "ciba"; data: CibaInterruptData };

function parseInterrupt(error: Error | undefined): InterruptData | null {
  if (!error) return null;
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.type === "CibaInterrupt" && parsed.authReqId) {
      return { kind: "ciba", data: parsed };
    }
    if (parsed.type === "TokenVaultInterrupt" || parsed.connection) {
      return {
        kind: "token-vault",
        data: {
          type: "TokenVaultInterrupt",
          connection: parsed.connection || "google-oauth2",
          scopes: parsed.scopes,
        },
      };
    }
  } catch {
    // Not an interrupt error
  }
  return null;
}

const suggestions = [
  "Analyze my pipeline and suggest next steps",
  "Show me my deals",
  "What's on my calendar tomorrow?",
  "Draft a follow-up email to Sarah about the proposal",
  "Search contacts at Meridian",
  "Send a Slack update about the Vantage deal",
  "What Slack channels can I post to?",
];

interface ChatWindowProps {
  conversationId: string;
  isExisting?: boolean;
  onConversationCreated?: () => void;
}

export function ChatWindow({ conversationId, isExisting, onConversationCreated }: ChatWindowProps) {
  const [dismissedError, setDismissedError] = useState<Error | null>(null);
  const [input, setInput] = useState("");
  const [loadingHistory, setLoadingHistory] = useState(!!isExisting);

  const { messages, sendMessage, setMessages, status, error, regenerate, addToolApprovalResponse } = useChat({
    transport,
    id: conversationId,
    // sendAutomaticallyWhen is intentionally OMITTED. The SDK's auto-send mechanism
    // has an unfixable loop: it checks the predicate in makeRequest's finally block
    // (line 13271) after EVERY completed request, creating infinite recursion.
    // Instead, we use regenerate() in handleApproval — the same pattern used for
    // token vault interrupts and CIBA flows.
  });

  // Notify parent when the first assistant response completes (replaces onFinish)
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (
      !notifiedRef.current &&
      status === "ready" &&
      messages.length > 0 &&
      messages.some((m) => m.role === "assistant")
    ) {
      notifiedRef.current = true;
      onConversationCreated?.();
    }
  }, [status, messages, onConversationCreated]);

  // Load saved messages when opening an existing conversation
  useEffect(() => {
    if (!isExisting) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/conversations/${conversationId}`, {
          headers: { "X-Requested-With": "XMLHttpRequest" },
        });
        if (res.ok && !cancelled) {
          const data = await res.json();
          if (Array.isArray(data.messages) && data.messages.length > 0) {
            setMessages(data.messages);
          }
        }
      } catch {
        // Non-critical — user can still start a new conversation
      } finally {
        if (!cancelled) setLoadingHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [conversationId, isExisting, setMessages]);

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
    <div className="flex flex-col h-full">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {loadingHistory && (
          <div className="flex items-center justify-center h-full">
            <div className="flex items-center gap-2 text-muted-foreground text-sm">
              <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
              Loading conversation...
            </div>
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="text-2xl font-semibold text-foreground/80 mb-2"
              >
                Welcome to{" "}
                <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                  DealFlow
                </span>
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                className="text-muted-foreground mb-6 max-w-md mx-auto"
              >
                Ask me about your pipeline, check your calendar, or draft a
                follow-up email.
              </motion.p>
              <div className="flex flex-wrap gap-2 justify-center max-w-lg mx-auto">
                {suggestions.map((suggestion, i) => (
                  <motion.button
                    key={suggestion}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.2 + i * 0.08 }}
                    whileHover={{ scale: 1.03 }}
                    onClick={() => handleSuggestion(suggestion)}
                    className="text-sm bg-card/80 backdrop-blur-sm hover:bg-secondary text-foreground/80 px-3 py-2 rounded-lg border border-border hover:border-primary/30 transition-colors"
                  >
                    {suggestion}
                  </motion.button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((message, i) => (
          <ChatMessage
            key={message.id}
            message={message}
            index={i}
            onApproval={handleApproval}
          />
        ))}

        {interrupt?.kind === "token-vault" && (
          <TokenVaultInterrupt
            connection={interrupt.data.connection}
            scopes={interrupt.data.scopes}
            onAuthorized={() => {
              setDismissedError(error ?? null);
              regenerate();
            }}
            onDismiss={() => setDismissedError(error ?? null)}
          />
        )}

        {interrupt?.kind === "ciba" && (
          <CibaWaitingCard
            authReqId={interrupt.data.authReqId}
            bindingMessage={interrupt.data.bindingMessage}
            expiresIn={interrupt.data.expiresIn}
            interval={interrupt.data.interval}
            onApproved={() => {
              setDismissedError(error ?? null);
              regenerate();
            }}
            onDenied={() => {
              setDismissedError(error ?? null);
            }}
            onDismiss={() => setDismissedError(error ?? null)}
          />
        )}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start mb-4"
          >
            <div className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-primary to-accent text-[10px] font-bold text-white mr-2 mt-1 shrink-0">
              D
            </div>
            <div className="bg-card/80 backdrop-blur-sm border border-border rounded-lg px-4 py-3">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <div className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                Thinking...
              </div>
            </div>
          </motion.div>
        )}

        {error && !interrupt && (
          <div className={`text-sm border rounded-lg px-4 py-3 mb-4 ${
            error.message?.startsWith("Rate limit")
              ? "text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/40 dark:border-amber-800"
              : "text-destructive bg-destructive/10 border-destructive/20"
          }`}>
            {error.message?.startsWith("Rate limit")
              ? <><strong>Request limit reached.</strong> {error.message}</>
              : <>Error: {error.message}</>
            }
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="border-t border-border px-4 py-3">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about your deals, calendar, or contacts..."
            className="flex-1 bg-card/80 backdrop-blur-sm border border-border rounded-lg px-4 py-2.5 text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="bg-primary hover:bg-primary/90 disabled:bg-muted disabled:text-muted-foreground text-primary-foreground font-medium px-6 py-2.5 rounded-lg transition-all shadow-[0_0_16px_rgba(99,102,241,0.15)] hover:shadow-[0_0_24px_rgba(99,102,241,0.3)]"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
