"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import type { UserSettings, TrustLevel, TrustStats, AutonomyLevel, ConfidenceThresholds } from "@/lib/types/settings";
import { SCOPE_LABELS } from "@/lib/constants/tools";
import { ConnectionAutonomyControls } from "@/components/connection-autonomy";

/* ─── Types ─── */

interface ConnectionStatus {
  connection: string;
  provider: string;
  connected: boolean;
  scopes: string[];
  error?: string;
}

interface Props {
  initialSettings: UserSettings;
  disabledConnections: string[];
  trustStats?: TrustStats;
}

/* ─── Brand assets ─── */

/** Google multicolor G — official branding per https://developers.google.com/identity/branding-guidelines */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

/** Slack uses brand purple #4A154B — cannot use octothorpe logo per brand terms */
function SlackIcon({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-[#4A154B] text-white rounded font-bold text-xs ${className}`} aria-hidden="true">
      S
    </div>
  );
}

function CrmIcon({ className }: { className?: string }) {
  return (
    <div className={`flex items-center justify-center bg-primary/10 text-primary rounded font-bold text-xs ${className}`} aria-hidden="true">
      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" />
      </svg>
    </div>
  );
}

/* ─── Sub-components ─── */

const TRUST_OPTIONS: { value: TrustLevel; label: string; color: string }[] = [
  { value: "always", label: "Always allow", color: "bg-emerald-500" },
  { value: "ask", label: "Ask each time", color: "bg-amber-500" },
  { value: "never", label: "Never allow", color: "bg-red-500" },
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
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
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

function ConnectionActions({
  connection,
  label,
  isDisconnected,
  isTokenVaultConnected,
  onConnectionChange,
}: {
  connection: string;
  label: string;
  isDisconnected: boolean;
  isTokenVaultConnected: boolean;
  onConnectionChange: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [localDisconnected, setLocalDisconnected] = useState(isDisconnected);
  const [error, setError] = useState(false);
  const popupRef = useRef<Window | null>(null);

  // Listen for postMessage from the Auth0 connect popup
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === "auth0-connect-success") {
        setConnecting(false);
        popupRef.current = null;
        window.dispatchEvent(new Event("connection-changed"));
        onConnectionChange();
      }
    }
    window.addEventListener("message", handleMessage);
    return () => {
      window.removeEventListener("message", handleMessage);
      popupRef.current?.close();
    };
  }, [onConnectionChange]);

  function handleConnect() {
    setConnecting(true);
    const params = new URLSearchParams({
      connection,
      returnTo: "/close",
    });
    popupRef.current = window.open(
      `/auth/connect?${params.toString()}`,
      "auth0-connect",
      "width=500,height=600,scrollbars=yes"
    );
  }

  async function handleRevoke() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/connections/${connection}`, {
        method: "DELETE",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error("Failed");
      setLocalDisconnected(true);
      setConfirming(false);
      window.dispatchEvent(new Event("connection-changed"));
      onConnectionChange();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function handleReconnect() {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`/api/connections/${connection}`, {
        method: "POST",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) throw new Error("Failed");
      setLocalDisconnected(false);
      window.dispatchEvent(new Event("connection-changed"));
      onConnectionChange();
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  // Not connected to Token Vault yet — show Connect button
  if (!isTokenVaultConnected && !localDisconnected) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting}
        className="rounded bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {connecting ? "Connecting..." : `Connect ${label}`}
      </button>
    );
  }

  if (localDisconnected) {
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={handleReconnect}
          disabled={loading}
          className="rounded border border-primary/30 px-2.5 py-1 text-xs text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : "Reconnect"}
        </button>
        {error && <span className="text-xs text-red-400">Failed</span>}
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Disconnect {label}?</span>
        <button
          onClick={handleRevoke}
          disabled={loading}
          className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-500 disabled:opacity-50"
        >
          {loading ? "..." : "Yes"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="rounded border border-border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="rounded bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-500 transition-colors"
    >
      Disconnect
    </button>
  );
}

/* ─── Integration definitions ─── */

interface ToolCapability {
  key: keyof UserSettings["capabilities"];
  label: string;
  description: string;
  toolNames?: string[]; // maps to trust level tools
}

interface Integration {
  id: string;
  label: string;
  icon: React.ReactNode;
  connectionId?: string;
  scopes?: string[];
  capabilities: ToolCapability[];
}

const INTEGRATIONS: Integration[] = [
  {
    id: "google",
    label: "Google",
    icon: <GoogleIcon className="w-5 h-5" />,
    connectionId: "google-oauth2",
    scopes: ["calendar.readonly", "calendar.events", "gmail.readonly", "gmail.compose"],
    capabilities: [
      {
        key: "calendar",
        label: "Calendar access",
        description: "Check availability, view meetings, and create events",
        toolNames: ["checkCalendar", "createCalendarEvent"],
      },
      {
        key: "gmail",
        label: "Email access",
        description: "Search emails and draft new messages",
        toolNames: ["searchEmails", "draftEmail"],
      },
    ],
  },
  {
    id: "slack",
    label: "Slack",
    icon: <SlackIcon className="w-5 h-5" />,
    connectionId: "sign-in-with-slack",
    scopes: ["channels:read", "chat:write"],
    capabilities: [
      {
        key: "slack",
        label: "Slack workspace access",
        description: "List channels and send messages",
        toolNames: ["listSlackChannels", "sendSlackMessage"],
      },
    ],
  },
  {
    id: "crm",
    label: "CRM Data",
    icon: <CrmIcon className="w-5 h-5" />,
    capabilities: [
      {
        key: "crmRead",
        label: "View deals & contacts",
        description: "Search your pipeline, view deal details and contact info",
      },
      {
        key: "crmWrite",
        label: "Create & update records",
        description: "Add deals, contacts, and log activities",
      },
    ],
  },
];

/* ─── Main component ─── */

// Map tool names to action types for trust stats display
const TOOL_ACTION_TYPE_MAP: Record<string, "email" | "calendar" | "slack"> = {
  draftEmail: "email",
  createCalendarEvent: "calendar",
  sendSlackMessage: "slack",
};

export function IntegrationPermissions({ initialSettings, disabledConnections, trustStats }: Props) {
  const [settings, setSettings] = useState(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({});
  const [statusLoading, setStatusLoading] = useState(true);

  const fetchConnectionStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/token-status");
      if (!res.ok) throw new Error("fetch failed");
      const data: ConnectionStatus[] = await res.json();
      const map: Record<string, ConnectionStatus> = {};
      for (const s of data) map[s.connection] = s;
      setConnectionStatuses(map);
    } catch {
      // "Unknown" handled in render
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConnectionStatus();
    const handler = () => fetchConnectionStatus();
    window.addEventListener("connection-changed", handler);
    return () => window.removeEventListener("connection-changed", handler);
  }, [fetchConnectionStatus]);

  function updateSettings(partial: Partial<UserSettings>) {
    const updated = { ...settings, ...partial };
    setSettings(updated);
    startTransition(async () => {
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Requested-With": "XMLHttpRequest" },
        body: JSON.stringify(partial),
      });
    });
  }

  function handleToggle(key: keyof UserSettings["capabilities"]) {
    updateSettings({
      capabilities: { ...settings.capabilities, [key]: !settings.capabilities[key] },
    });
  }

  function handleTrustChange(toolName: string, trust: TrustLevel) {
    updateSettings({
      toolTrust: { ...(settings.toolTrust || {}), [toolName]: trust },
    });
  }

  function clearTrust(toolName: string) {
    const newTrust = { ...(settings.toolTrust || {}) };
    delete newTrust[toolName];
    updateSettings({ toolTrust: newTrust });
  }

  function handleConnectionAutonomyChange(connectionId: string, level: AutonomyLevel) {
    const current = settings.connectionAutonomy ?? {};
    const existing = current[connectionId] ?? {
      autonomyLevel: settings.autonomyLevel,
      confidenceThresholds: settings.confidenceThresholds,
    };
    updateSettings({
      connectionAutonomy: {
        ...current,
        [connectionId]: { ...existing, autonomyLevel: level },
      },
    });
  }

  function handleConnectionConfidenceChange(connectionId: string, thresholds: ConfidenceThresholds) {
    const current = settings.connectionAutonomy ?? {};
    const existing = current[connectionId] ?? {
      autonomyLevel: settings.autonomyLevel,
    };
    updateSettings({
      connectionAutonomy: {
        ...current,
        [connectionId]: { ...existing, confidenceThresholds: thresholds },
      },
    });
  }

  return (
    <div className="space-y-3">
      {INTEGRATIONS.map((integration) => {
        const connStatus = integration.connectionId
          ? connectionStatuses[integration.connectionId]
          : undefined;
        const isOAuth = !!integration.connectionId;
        const isConnected = !isOAuth || connStatus?.connected === true;
        const isDisconnected = isOAuth && (
          disabledConnections.includes(integration.connectionId!) ||
          (connStatus && !connStatus.connected)
        );
        const enabledCount = integration.capabilities.filter(
          (c) => settings.capabilities[c.key]
        ).length;

        return (
          <div
            key={integration.id}
            className={`rounded-lg border overflow-hidden transition-colors ${
              isOAuth && isDisconnected
                ? "border-border/50 bg-muted/10"
                : "border-border bg-card"
            }`}
          >
            {/* Integration header */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/20">
              <div className="flex items-center gap-2.5">
                {integration.icon}
                <span className="text-sm font-semibold">{integration.label}</span>

                {/* Connection status badge */}
                {isOAuth && !statusLoading && (
                  isConnected ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-red-400" />
                      Disconnected
                    </span>
                  )
                )}

                {!isOAuth && (
                  <span className="text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
                    Local
                  </span>
                )}

                <span className="text-xs text-muted-foreground">
                  {enabledCount} of {integration.capabilities.length} enabled
                </span>
              </div>

              {/* Connection actions */}
              {isOAuth && (
                <ConnectionActions
                  connection={integration.connectionId!}
                  label={integration.label}
                  isDisconnected={!!isDisconnected}
                  isTokenVaultConnected={isConnected}
                  onConnectionChange={fetchConnectionStatus}
                />
              )}
            </div>

            {/* Scope summary for OAuth integrations */}
            {isOAuth && isConnected && integration.scopes && (
              <div className="px-4 py-1.5 bg-muted/10 border-t border-border/50 flex flex-wrap gap-1.5">
                {integration.scopes.map((scope) => (
                  <span
                    key={scope}
                    className="text-xs text-muted-foreground bg-muted/50 rounded px-1.5 py-0.5"
                    title={scope}
                  >
                    {SCOPE_LABELS[scope] || scope}
                  </span>
                ))}
              </div>
            )}

            {/* Capability toggles */}
            <div className="divide-y divide-border/50">
              {integration.capabilities.map(({ key, label, description, toolNames }) => {
                const enabled = settings.capabilities[key];
                const grayed = isOAuth && isDisconnected;

                return (
                  <div key={key} className={grayed ? "opacity-40 pointer-events-none" : ""}>
                    <div className="flex items-center justify-between px-4 py-2.5">
                      <div className="pr-3">
                        <p className="text-sm font-medium text-foreground">{label}</p>
                        <p className="text-sm text-muted-foreground">{description}</p>
                      </div>
                      <ToggleSwitch
                        checked={enabled}
                        onToggle={() => handleToggle(key)}
                        disabled={isPending || !!grayed}
                        label={label}
                      />
                    </div>

                    {/* Per-tool trust levels (only for Token Vault tools) */}
                    {enabled && toolNames && toolNames.length > 0 && !grayed && (
                      <div className="px-4 pb-2.5 space-y-1.5">
                        {toolNames.map((toolName) => {
                          const currentTrust = settings.toolTrust?.[toolName] ?? "always";
                          return (
                            <div key={toolName} className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground w-28 truncate">
                                {SCOPE_LABELS[
                                  // Map tool to its primary scope for labeling
                                  toolName === "checkCalendar" ? "calendar.readonly" :
                                  toolName === "createCalendarEvent" ? "calendar.events" :
                                  toolName === "searchEmails" ? "gmail.readonly" :
                                  toolName === "draftEmail" ? "gmail.compose" :
                                  toolName === "listSlackChannels" ? "channels:read" :
                                  toolName === "sendSlackMessage" ? "chat:write" : ""
                                ] || toolName}
                              </span>
                              <div className="flex gap-1">
                                {TRUST_OPTIONS.map(({ value, label: trustLabel, color }) => {
                                  const isActive = currentTrust === value;
                                  return (
                                    <button
                                      key={value}
                                      onClick={() => handleTrustChange(toolName, value)}
                                      disabled={isPending}
                                      aria-pressed={isActive}
                                      className={`px-2 py-0.5 text-[10px] rounded transition-all ${
                                        isActive
                                          ? `${color} text-white`
                                          : "bg-muted/50 text-muted-foreground hover:text-foreground"
                                      } ${isPending ? "opacity-50" : ""}`}
                                    >
                                      {trustLabel}
                                    </button>
                                  );
                                })}
                              </div>
                              {/* Trust calibration stats */}
                              {(() => {
                                const actionType = TOOL_ACTION_TYPE_MAP[toolName];
                                if (!actionType || !trustStats) return null;
                                const stats = trustStats[actionType];
                                const total = stats.approved + stats.dismissed;
                                if (total === 0) return null;
                                const rate = stats.approved / total;
                                return (
                                  <span className="text-xs text-muted-foreground ml-1">
                                    <span aria-label={`${stats.approved} of ${total} actions approved, ${Math.round(rate * 100)}%`}>
                                      {stats.approved}/{total} approved ({Math.round(rate * 100)}%)
                                    </span>
                                    {rate > 0.8 && currentTrust !== "always" && (
                                      <span className="text-emerald-400 ml-1.5"> · Consider auto-approve</span>
                                    )}
                                  </span>
                                );
                              })()}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Behavior section — per-connection autonomy (only for action-generating integrations) */}
            {integration.id !== "crm" && isConnected && !isDisconnected && (
              <div className="px-4 py-3 border-t border-border/50">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Behavior
                </h4>
                <ConnectionAutonomyControls
                  connectionId={integration.id}
                  connectionLabel={integration.label}
                  autonomyLevel={
                    settings.connectionAutonomy?.[integration.id]?.autonomyLevel
                    ?? settings.autonomyLevel
                  }
                  confidenceThresholds={
                    settings.connectionAutonomy?.[integration.id]?.confidenceThresholds
                    ?? settings.confidenceThresholds
                    ?? { enabled: true, autoApprove: 0.85, requireReview: 0.5 }
                  }
                  onAutonomyChange={handleConnectionAutonomyChange}
                  onConfidenceChange={handleConnectionConfidenceChange}
                  saving={isPending}
                />
              </div>
            )}

            {/* CRM approval toggle (only for CRM integration) */}
            {integration.id === "crm" && (
              <div className="px-4 py-2.5 border-t border-amber-500/20 bg-amber-500/5">
                <div className="flex items-center justify-between">
                  <div className="pr-3">
                    <p className="text-sm font-medium text-foreground">
                      Require approval for high-value changes
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Deals over $50K and closed-won status changes need your confirmation
                    </p>
                  </div>
                  <ToggleSwitch
                    checked={settings.approvalRequired.crmWrite}
                    onToggle={() =>
                      updateSettings({
                        approvalRequired: { crmWrite: !settings.approvalRequired.crmWrite },
                      })
                    }
                    disabled={isPending}
                    label="approval requirement"
                    color="bg-amber-500"
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
