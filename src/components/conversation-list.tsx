"use client";

import type { ConversationMeta } from "@/lib/types/conversation";

interface Props {
  conversations: ConversationMeta[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNew: () => void;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
}: Props) {
  return (
    <div className="space-y-2">
      <button
        onClick={onNew}
        className="w-full rounded-lg border border-dashed border-border bg-card/30 px-3 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
      >
        + New Chat
      </button>

      {conversations.map((conv) => (
        <button
          key={conv.id}
          onClick={() => onSelect(conv.id)}
          className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
            conv.id === activeId
              ? "border-primary/50 bg-primary/5"
              : "border-border bg-card/30 hover:bg-card/60"
          }`}
        >
          <p className="text-sm text-foreground truncate">{conv.title}</p>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-muted-foreground">
              {conv.messageCount} messages
            </span>
            <span className="text-[10px] text-muted-foreground">
              {timeAgo(conv.updatedAt)}
            </span>
          </div>
        </button>
      ))}

      {conversations.length === 0 && (
        <p className="px-2 text-xs text-muted-foreground">
          No previous conversations
        </p>
      )}
    </div>
  );
}
