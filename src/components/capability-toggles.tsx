"use client";

import { useState, useTransition } from "react";
import type { UserSettings } from "@/lib/types/settings";

interface Props {
  initialSettings: UserSettings;
}

const CATEGORIES: {
  key: keyof UserSettings["capabilities"];
  label: string;
  description: string;
}[] = [
  {
    key: "crmRead",
    label: "CRM Read",
    description: "View deals, contacts, and activity history",
  },
  {
    key: "crmWrite",
    label: "CRM Write",
    description: "Create deals, contacts, and log activities",
  },
  {
    key: "calendar",
    label: "Google Calendar",
    description: "Check availability and view events",
  },
  {
    key: "gmail",
    label: "Gmail",
    description: "Draft emails and search correspondence",
  },
  {
    key: "slack",
    label: "Slack",
    description: "Send messages and list channels",
  },
];

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
      <div className="space-y-3">
        {CATEGORIES.map(({ key, label, description }) => (
          <div
            key={key}
            className="flex items-center justify-between rounded-lg border border-border bg-card/50 px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{description}</p>
            </div>
            <button
              role="switch"
              aria-checked={settings.capabilities[key]}
              aria-label={`Toggle ${label}`}
              onClick={() => handleToggle(key)}
              disabled={isPending}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
                settings.capabilities[key]
                  ? "bg-primary"
                  : "bg-muted"
              } ${isPending ? "opacity-50" : ""}`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                  settings.capabilities[key]
                    ? "translate-x-5"
                    : "translate-x-0"
                }`}
              />
            </button>
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-4">
        <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">
              Require Approval for CRM Writes
            </p>
            <p className="text-xs text-muted-foreground">
              Ask for confirmation before creating deals or logging activities
            </p>
          </div>
          <button
            role="switch"
            aria-checked={settings.approvalRequired.crmWrite}
            aria-label="Toggle approval requirement"
            onClick={handleApprovalToggle}
            disabled={isPending}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ${
              settings.approvalRequired.crmWrite
                ? "bg-amber-500"
                : "bg-muted"
            } ${isPending ? "opacity-50" : ""}`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                settings.approvalRequired.crmWrite
                  ? "translate-x-5"
                  : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
