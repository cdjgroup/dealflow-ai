"use client";

import { useState, useTransition } from "react";
import type { UserSettings, TrustLevel } from "@/lib/types/settings";

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

const TOKEN_VAULT_TOOLS: {
  name: string;
  label: string;
  provider: string;
  accessLevel: "read" | "write";
}[] = [
  { name: "checkCalendar", label: "Check Calendar", provider: "Google", accessLevel: "read" },
  { name: "searchEmails", label: "Search Emails", provider: "Google", accessLevel: "read" },
  { name: "draftEmail", label: "Draft Email", provider: "Google", accessLevel: "write" },
  { name: "listSlackChannels", label: "List Slack Channels", provider: "Slack", accessLevel: "read" },
  { name: "sendSlackMessage", label: "Send Slack Message", provider: "Slack", accessLevel: "write" },
];

const TRUST_OPTIONS: { value: TrustLevel; label: string; color: string }[] = [
  { value: "always", label: "Always allow", color: "bg-emerald-500" },
  { value: "ask", label: "Ask each time", color: "bg-amber-500" },
  { value: "never", label: "Never allow", color: "bg-red-500" },
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

  async function handleTrustChange(toolName: string, trust: TrustLevel) {
    const updated = {
      ...settings,
      toolTrust: {
        ...(settings.toolTrust || {}),
        [toolName]: trust,
      },
    };
    setSettings(updated);

    startTransition(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ toolTrust: { [toolName]: trust } }),
      });
    });
  }

  function clearTrust(toolName: string) {
    const newTrust = { ...(settings.toolTrust || {}) };
    delete newTrust[toolName];
    const updated = { ...settings, toolTrust: newTrust };
    setSettings(updated);

    startTransition(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify({ toolTrust: newTrust }),
      });
    });
  }

  return (
    <div className="space-y-4">
      {/* Capability toggles */}
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

      {/* CRM approval toggle */}
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

      {/* Per-tool trust levels */}
      <div className="border-t border-border pt-4">
        <h3 className="text-sm font-semibold text-foreground mb-1">
          Tool Trust Levels
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Control consent behavior for each Token Vault tool. Overrides default approval settings.
        </p>
        <div className="space-y-2">
          {TOKEN_VAULT_TOOLS.map(({ name, label, provider, accessLevel }) => {
            const currentTrust = settings.toolTrust?.[name];
            return (
              <div
                key={name}
                className="rounded-lg border border-border bg-card/50 px-4 py-3"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    <span className="text-[10px] text-muted-foreground bg-muted rounded px-1.5 py-0.5">
                      {provider}
                    </span>
                    <span className={`text-[10px] rounded px-1.5 py-0.5 ${
                      accessLevel === "read"
                        ? "text-emerald-400 bg-emerald-500/10"
                        : "text-amber-400 bg-amber-500/10"
                    }`}>
                      {accessLevel}
                    </span>
                  </div>
                  {currentTrust && (
                    <button
                      onClick={() => clearTrust(name)}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={`Reset ${label} to default`}
                    >
                      reset
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {TRUST_OPTIONS.map(({ value, label: trustLabel, color }) => {
                    const isActive = currentTrust === value;
                    return (
                      <button
                        key={value}
                        onClick={() => handleTrustChange(name, value)}
                        disabled={isPending}
                        aria-pressed={isActive}
                        className={`flex-1 text-xs py-1.5 rounded-md border transition-all ${
                          isActive
                            ? `${color} text-white border-transparent`
                            : "bg-card border-border text-muted-foreground hover:text-foreground hover:border-foreground/20"
                        } ${isPending ? "opacity-50" : ""}`}
                      >
                        {trustLabel}
                      </button>
                    );
                  })}
                </div>
                {!currentTrust && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    Default: {accessLevel === "write" ? "requires approval" : "auto-approved"}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
