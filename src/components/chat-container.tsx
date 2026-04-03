"use client";

import { useState, useEffect, useCallback } from "react";
import { ChatWindow } from "./chat-window";
import { ConversationList } from "./conversation-list";
import type { ConversationMeta } from "@/lib/types/conversation";
import { PanelLeftClose, PanelLeft } from "lucide-react";

interface ChatContainerProps {
  userId: string;
}

export function ChatContainer({ userId }: ChatContainerProps) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", {
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data);
      }
    } catch {
      // Silently fail — conversation list is non-critical
    }
  }, []);

  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleNew = () => {
    setActiveId(null);
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
  };

  const handleConversationCreated = useCallback(() => {
    // Refresh conversation list when a new conversation is saved
    fetchConversations();
  }, [fetchConversations]);

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Collapsible conversation sidebar */}
      {sidebarOpen && (
        <div className="w-56 shrink-0 border-r border-border overflow-y-auto pr-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Chats
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Close chat sidebar"
            >
              <PanelLeftClose className="size-4" />
            </button>
          </div>
          <ConversationList
            conversations={conversations}
            activeId={activeId ?? undefined}
            onSelect={handleSelect}
            onNew={handleNew}
          />
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 min-w-0">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-5 top-20 z-10 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open chat sidebar"
          >
            <PanelLeft className="size-4" />
          </button>
        )}
        <ChatWindow
          key={activeId ?? "new"}
          conversationId={activeId}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    </div>
  );
}
