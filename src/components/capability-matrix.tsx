"use client";

import type { UserSettings } from "@/lib/types/settings";

interface ToolInfo {
  name: string;
  label: string;
  icon: string;
  scope: "read" | "write";
  source: "token-vault" | "local";
  category: keyof UserSettings["capabilities"];
  provider?: string;
  guardrails: string[];
}

const ALL_TOOLS: ToolInfo[] = [
  // CRM Read
  {
    name: "listDeals",
    label: "List Deals",
    icon: "\uD83D\uDCCA",
    scope: "read",
    source: "local",
    category: "crmRead",
    guardrails: ["User-scoped data only"],
  },
  {
    name: "getDealDetails",
    label: "Deal Details",
    icon: "\uD83D\uDCCB",
    scope: "read",
    source: "local",
    category: "crmRead",
    guardrails: ["User-scoped data only"],
  },
  {
    name: "searchContacts",
    label: "Search Contacts",
    icon: "\uD83D\uDC64",
    scope: "read",
    source: "local",
    category: "crmRead",
    guardrails: ["User-scoped data only"],
  },
  // CRM Write
  {
    name: "createDeal",
    label: "Create Deal",
    icon: "\u2795",
    scope: "write",
    source: "local",
    category: "crmWrite",
    guardrails: ["Approval required >$50K", "Step-up auth for high value"],
  },
  {
    name: "updateDeal",
    label: "Update Deal",
    icon: "\u270F\uFE0F",
    scope: "write",
    source: "local",
    category: "crmWrite",
    guardrails: ["Approval required for closed-won/lost"],
  },
  {
    name: "createContact",
    label: "Create Contact",
    icon: "\uD83D\uDC65",
    scope: "write",
    source: "local",
    category: "crmWrite",
    guardrails: ["Optional approval via settings"],
  },
  {
    name: "logActivity",
    label: "Log Activity",
    icon: "\uD83D\uDCDD",
    scope: "write",
    source: "local",
    category: "crmWrite",
    guardrails: ["Optional approval via settings"],
  },
  // Calendar
  {
    name: "checkCalendar",
    label: "Check Calendar",
    icon: "\uD83D\uDCC5",
    scope: "read",
    source: "token-vault",
    category: "calendar",
    provider: "Google",
    guardrails: ["Read-only access", "Short-lived token"],
  },
  // Gmail
  {
    name: "draftEmail",
    label: "Draft Email",
    icon: "\u2709\uFE0F",
    scope: "write",
    source: "token-vault",
    category: "gmail",
    provider: "Google",
    guardrails: ["Always requires approval", "Drafts only \u2014 never sends", "Short-lived token"],
  },
  {
    name: "searchEmails",
    label: "Search Emails",
    icon: "\uD83D\uDD0D",
    scope: "read",
    source: "token-vault",
    category: "gmail",
    provider: "Google",
    guardrails: ["Read-only access", "Short-lived token"],
  },
  // Slack
  {
    name: "listSlackChannels",
    label: "List Channels",
    icon: "\uD83D\uDCAC",
    scope: "read",
    source: "token-vault",
    category: "slack",
    provider: "Slack",
    guardrails: ["Read-only access", "Short-lived token"],
  },
  {
    name: "sendSlackMessage",
    label: "Send Message",
    icon: "\uD83D\uDCAC",
    scope: "write",
    source: "token-vault",
    category: "slack",
    provider: "Slack",
    guardrails: ["Always requires approval", "Short-lived token"],
  },
];

const CANNOT_DO = [
  "Send emails directly (always drafts)",
  "Access data from other users",
  "Store or see your OAuth passwords",
  "Execute actions on disabled capabilities",
  "Bypass approval requirements",
  "Access scopes beyond what you authorized",
];

interface Props {
  settings: UserSettings;
}

export function CapabilityMatrix({ settings }: Props) {
  return (
    <div className="space-y-4">
      {/* Tool Matrix */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" aria-label="Agent capability matrix">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 font-medium text-muted-foreground">Tool</th>
              <th className="pb-2 font-medium text-muted-foreground">Access</th>
              <th className="pb-2 font-medium text-muted-foreground">Source</th>
              <th className="pb-2 font-medium text-muted-foreground">Status</th>
              <th className="pb-2 font-medium text-muted-foreground">Guardrails</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {ALL_TOOLS.map((tool) => {
              const enabled = settings.capabilities[tool.category];
              return (
                <tr
                  key={tool.name}
                  className={enabled ? "" : "opacity-40"}
                >
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-1.5">
                      <span>{tool.icon}</span>
                      <span className="text-foreground">{tool.label}</span>
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                        tool.scope === "write"
                          ? "bg-amber-500/15 text-amber-400"
                          : "bg-blue-500/15 text-blue-400"
                      }`}
                    >
                      {tool.scope === "write" ? "WRITE" : "READ"}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    {tool.source === "token-vault" ? (
                      <span className="flex items-center gap-1 text-xs text-primary/80">
                        \uD83D\uDD12 {tool.provider}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Local CRM
                      </span>
                    )}
                  </td>
                  <td className="py-2 pr-3">
                    <span
                      className={`text-xs ${
                        enabled ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {enabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-1">
                      {tool.guardrails.map((g) => (
                        <span
                          key={g}
                          className="rounded bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {g}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cannot Do List */}
      <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">
          The agent cannot:
        </h3>
        <ul className="space-y-1">
          {CANNOT_DO.map((item) => (
            <li key={item} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="text-red-400">\u2715</span>
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
