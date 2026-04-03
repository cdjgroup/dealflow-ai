"use client";

interface ToolBadgeProps {
  toolName: string;
  state: "running" | "completed" | "pending" | "approval";
}

interface ToolMeta {
  icon: string;
  label: string;
  scope: "read" | "write";
  source: "token-vault" | "local";
}

const TOOL_META: Record<string, ToolMeta> = {
  // Google Calendar — Token Vault
  checkCalendar: {
    icon: "\uD83D\uDCC5",
    label: "Check Calendar",
    scope: "read",
    source: "token-vault",
  },
  // Gmail — Token Vault
  draftEmail: {
    icon: "\u2709\uFE0F",
    label: "Draft Email",
    scope: "write",
    source: "token-vault",
  },
  searchEmails: {
    icon: "\uD83D\uDD0D",
    label: "Search Emails",
    scope: "read",
    source: "token-vault",
  },
  // Slack — Token Vault
  listSlackChannels: {
    icon: "\uD83D\uDCAC",
    label: "List Channels",
    scope: "read",
    source: "token-vault",
  },
  sendSlackMessage: {
    icon: "\uD83D\uDCAC",
    label: "Send Message",
    scope: "write",
    source: "token-vault",
  },
  // CRM — Local (Redis)
  listDeals: {
    icon: "\uD83D\uDCCA",
    label: "List Deals",
    scope: "read",
    source: "local",
  },
  getDealDetails: {
    icon: "\uD83D\uDCCB",
    label: "Deal Details",
    scope: "read",
    source: "local",
  },
  searchContacts: {
    icon: "\uD83D\uDC64",
    label: "Search Contacts",
    scope: "read",
    source: "local",
  },
  createDeal: {
    icon: "\u2795",
    label: "Create Deal",
    scope: "write",
    source: "local",
  },
  updateDeal: {
    icon: "\u270F\uFE0F",
    label: "Update Deal",
    scope: "write",
    source: "local",
  },
  createContact: {
    icon: "\uD83D\uDC65",
    label: "Create Contact",
    scope: "write",
    source: "local",
  },
  logActivity: {
    icon: "\uD83D\uDCDD",
    label: "Log Activity",
    scope: "write",
    source: "local",
  },
};

const STATE_STYLES = {
  running: {
    dot: "bg-accent animate-pulse",
    text: "text-chart-4 animate-pulse",
    label: "running...",
  },
  completed: {
    dot: "bg-emerald-500",
    text: "text-muted-foreground/60",
    label: "completed",
  },
  pending: {
    dot: "bg-muted-foreground",
    text: "text-muted-foreground/60",
    label: "",
  },
  approval: {
    dot: "bg-amber-500 animate-pulse",
    text: "text-amber-400",
    label: "awaiting approval",
  },
};

export function ToolBadge({ toolName, state }: ToolBadgeProps) {
  const meta = TOOL_META[toolName];
  const stateStyle = STATE_STYLES[state];

  if (!meta) {
    return (
      <div className="text-xs bg-muted/50 rounded px-2 py-1 my-1 text-muted-foreground flex items-center gap-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${stateStyle.dot} inline-block`} />
        <span>{toolName}</span>
        {stateStyle.label && (
          <span className={stateStyle.text}>{stateStyle.label}</span>
        )}
      </div>
    );
  }

  return (
    <div className="text-xs bg-muted/50 rounded px-2 py-1 my-1 text-muted-foreground flex items-center gap-1.5">
      <span className={`w-1.5 h-1.5 rounded-full ${stateStyle.dot} inline-block`} />
      <span>{meta.icon}</span>
      <span className="text-foreground/80">{meta.label}</span>
      <span
        className={`rounded px-1 py-0.5 text-[10px] font-medium ${
          meta.scope === "write"
            ? "bg-amber-500/15 text-amber-400"
            : "bg-blue-500/15 text-blue-400"
        }`}
      >
        {meta.scope === "write" ? "WRITE" : "READ"}
      </span>
      {meta.source === "token-vault" ? (
        <span className="text-[10px] text-primary/70 flex items-center gap-0.5" title="Secured via Auth0 Token Vault">
          \uD83D\uDD12 Token Vault
        </span>
      ) : (
        <span className="text-[10px] text-muted-foreground/50" title="Local CRM data (Redis)">
          Local CRM
        </span>
      )}
      {stateStyle.label && (
        <span className={stateStyle.text}>{stateStyle.label}</span>
      )}
    </div>
  );
}

/** Export tool metadata for use in capability matrix */
export { TOOL_META };
export type { ToolMeta };
