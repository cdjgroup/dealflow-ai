"use client";

import { useState, useEffect, useCallback } from "react";
import { ChatWindow } from "./chat-window";
import { ConversationList } from "./conversation-list";
import type { ConversationMeta } from "@/lib/types/conversation";
import { PanelLeftClose, PanelLeft } from "lucide-react";

function newId(): string {
  return crypto.randomUUID();
}

interface ChatContainerProps {
  userId: string;
}

export function ChatContainer({ userId }: ChatContainerProps) {
  const [conversations, setConversations] = useState<ConversationMeta[]>([]);
  const [activeId, setActiveId] = useState<string>(newId);
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
    setActiveId(newId());
  };

  const handleSelect = (id: string) => {
    setActiveId(id);
  };

  const handleConversationCreated = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  const handleClearAll = useCallback(async () => {
    try {
      await fetch("/api/conversations", {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      setConversations([]);
      setActiveId(newId());
    } catch {
      // Silently fail
    }
  }, []);

  return (
    <div className="flex h-[calc(100vh-8rem)]">
      {/* Collapsible conversation sidebar */}
      {sidebarOpen && (
        <div className="w-48 shrink-0 border-r border-border overflow-y-auto pr-2">
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
            activeId={activeId}
            onSelect={handleSelect}
            onNew={handleNew}
            onClearAll={handleClearAll}
          />
        </div>
      )}

      {/* Chat area */}
      <div className="flex-1 min-w-0 relative">
        {!sidebarOpen && (
          <button
            onClick={() => setSidebarOpen(true)}
            className="absolute left-2 top-2 z-10 text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Open chat sidebar"
          >
            <PanelLeft className="size-4" />
          </button>
        )}
        <ChatWindow
          key={activeId}
          conversationId={activeId}
          onConversationCreated={handleConversationCreated}
        />
      </div>
    </div>
  );
}
