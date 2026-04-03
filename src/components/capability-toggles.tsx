"use client";

import { useState, useTransition } from "react";
import type { UserSettings } from "@/lib/types/settings";

interface Props {
  initialSettings: UserSettings;
}

interface CapabilityItem {
  key: keyof UserSettings["capabilities"];
  label: string;
  description: string;
  impact: string;
}

interface IntegrationGroup {
  id: string;
  label: string;
  icon: string;
  capabilities: CapabilityItem[];
}

const INTEGRATION_GROUPS: IntegrationGroup[] = [
  {
    id: "crm",
    label: "CRM",
    icon: "📊",
    capabilities: [
      {
        key: "crmRead",
        label: "CRM Read",
        description: "View deals, contacts, and activity history",
        impact: "When enabled, the AI agent can look up your deals, search contacts, and review activity logs in your CRM",
      },
      {
        key: "crmWrite",
        label: "CRM Write",
        description: "Create deals, contacts, and log activities",
        impact: "When enabled, the AI agent can create new deals, add contacts, and log sales activities on your behalf",
      },
    ],
  },
  {
    id: "google",
    label: "Google",
    icon: "🔗",
    capabilities: [
      {
        key: "calendar",
        label: "Google Calendar",
        description: "Check availability and view events",
        impact: "When enabled, the AI agent can access your Google Calendar to check availability and view upcoming meetings via Token Vault",
      },
      {
        key: "gmail",
        label: "Gmail",
        description: "Draft emails and search correspondence",
        impact: "When enabled, the AI agent can draft emails and search your inbox for relevant correspondence via Token Vault",
      },
    ],
  },
  {
    id: "slack",
    label: "Slack",
    icon: "💬",
    capabilities: [
      {
        key: "slack",
        label: "Slack",
        description: "Send messages and list channels",
        impact: "When enabled, the AI agent can send messages to Slack channels and browse available channels via Token Vault",
      },
    ],
  },
];

function ToggleSwitch({
  checked,
  onToggle,
  disabled,
  label,
  color = "bg-primary",
}: {
  checked: boolean;
  onToggle: () => void;
  disabled: boolean;
  label: string;
  color?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={`Toggle ${label}`}
      onClick={onToggle}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
        checked ? color : "bg-muted"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export function CapabilityToggles({ initialSettings }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();

  async function handleToggle(key: keyof UserSettings["capabilities"]) {
    const updated = {
      ...settings,
      capabilities: {
        ...settings.capabilities,
        [key]: !settings.capabilities[key],
      },
    };
    setSettings(updated);

    startTransition(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ capabilities: updated.capabilities }),
      });
    });
  }

  async function handleApprovalToggle() {
    const updated = {
      ...settings,
      approvalRequired: {
        crmWrite: !settings.approvalRequired.crmWrite,
      },
    };
    setSettings(updated);

    startTransition(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ approvalRequired: updated.approvalRequired }),
      });
    });
  }

  return (
    <div className="space-y-4">
      {INTEGRATION_GROUPS.map((group) => {
        const enabledCount = group.capabilities.filter(
          (c) => settings.capabilities[c.key]
        ).length;
        const totalCount = group.capabilities.length;

        return (
          <details key={group.id} className="group rounded-lg border border-border overflow-hidden">
            <summary className="flex items-center justify-between cursor-pointer px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors select-none list-none [&::-webkit-details-marker]:hidden">
              <div className="flex items-center gap-2">
                <span className="text-base">{group.icon}</span>
                <span className="text-sm font-semibold">{group.label}</span>
                <span className="text-xs text-muted-foreground">
                  {enabledCount} of {totalCount} enabled
                </span>
              </div>
              <span className="text-xs text-muted-foreground transition-transform group-open:rotate-180">
                ▼
              </span>
            </summary>

            <div className="space-y-0 divide-y divide-border">
              {group.capabilities.map(({ key, label, impact }) => (
                <div
                  key={key}
                  className="flex items-start justify-between px-4 py-3 bg-card/50"
                >
                  <div className="pr-4">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                      {impact}
                    </p>
                  </div>
                  <div className="pt-0.5">
                    <ToggleSwitch
                      checked={settings.capabilities[key]}
                      onToggle={() => handleToggle(key)}
                      disabled={isPending}
                      label={label}
                    />
                  </div>
                </div>
              ))}
            </div>
          </details>
        );
      })}

      <div className="border-t border-border pt-4">
        <div className="flex items-start justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div className="pr-4">
            <p className="text-sm font-medium text-foreground">
              Require Approval for CRM Writes
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
              When enabled, the AI agent will pause and ask for your confirmation before
              creating deals over $50K or changing a deal to closed-won status
            </p>
          </div>
          <div className="pt-0.5">
            <ToggleSwitch
              checked={settings.approvalRequired.crmWrite}
              onToggle={handleApprovalToggle}
              disabled={isPending}
              label="approval requirement"
              color="bg-amber-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
