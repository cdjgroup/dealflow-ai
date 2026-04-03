import { auth0, getUser } from "@/lib/auth0";
import { redirect } from "next/navigation";
import { getUserSettings } from "@/lib/data/settings";
import { CapabilityToggles } from "@/components/capability-toggles";
import { RevokeButton } from "@/components/revoke-button";
import { TokenStatus } from "@/components/token-status";
import { CapabilityMatrix } from "@/components/capability-matrix";
import { ActivityTimeline } from "@/components/activity-timeline";
import { getAuditLog } from "@/lib/data/audit";

export default async function PermissionsPage() {
  const session = await auth0.getSession();
  if (!session) redirect("/auth/login?returnTo=/dashboard/permissions");

  const user = await getUser();
  if (!user?.sub) redirect("/auth/login?returnTo=/dashboard/permissions");

  const [settings, recentActivity] = await Promise.all([
    getUserSettings(user.sub),
    getAuditLog(user.sub, { limit: 20 }),
  ]);

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-foreground">
        Permissions & Connected Accounts
      </h1>

      {/* Agent Capabilities (U1) */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Agent Capabilities
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Control which tools the AI agent can use. Disabled tools are
          completely hidden from the agent.
        </p>
        <CapabilityToggles initialSettings={settings} />
      </div>

      {/* Capability Matrix (Item 4) — collapsible reference */}
      <details className="bg-card border border-border rounded-lg">
        <summary className="p-6 cursor-pointer select-none flex flex-col gap-1 [&::-webkit-details-marker]:hidden">
          <h2 className="text-lg font-semibold text-foreground">
            Tool Capability Matrix
          </h2>
          <span className="text-sm text-muted-foreground">
            All 12 agent tools with their access levels, data sources, and
            security guardrails. Click to expand.
          </span>
        </summary>
        <div className="px-6 pb-6">
          <CapabilityMatrix settings={settings} />
        </div>
      </details>

      {/* Connection Status + Disconnect (Items 6 & 7) */}
      <div className="bg-card border border-border rounded-lg p-6">
        <h2 className="text-lg font-semibold text-foreground mb-2">
          Connected Accounts
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Auth0 Token Vault stores your OAuth tokens securely. DealFlow AI
          only receives short-lived access tokens, never your credentials.
          Disconnect to revoke the agent&apos;s access instantly.
        </p>

        {/* Live connection status */}
        <div className="mb-4">
          <TokenStatus />
        </div>

        {/* Account cards with disconnect */}
        <div className="space-y-3">
          <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-foreground text-background rounded-full flex items-center justify-center text-lg font-medium">
                G
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">
                  Google (Calendar + Gmail)
                </div>
                <div className="text-xs text-muted-foreground">
                  Scopes: calendar.readonly, gmail.compose, gmail.readonly
                </div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">
                  Token type: short-lived access token via RFC 8693 exchange
                </div>
              </div>
            </div>
            <RevokeButton connection="google-oauth2" label="Google" />
          </div>

          <div className="flex items-center justify-between bg-secondary/50 rounded-lg px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#4A154B] text-white rounded-full flex items-center justify-center text-lg font-bold">
                S
              </div>
              <div>
                <div className="text-sm font-medium text-foreground">
                  Slack
                </div>
                <div className="text-xs text-muted-foreground">
                  Scopes: channels:read, chat:write
                </div>
                <div className="text-xs text-muted-foreground/60 mt-0.5">
                  Token type: short-lived access token via RFC 8693 exchange
                </div>
              </div>
            </div>
            <RevokeButton connection="sign-in-with-slack" label="Slack" />
          </div>
        </div>
      </div>

      {/* Recent Activity (Item 8) */}
      <div className="bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-semibold text-foreground">
            Recent Agent Activity
          </h2>
          <a
            href="/dashboard/audit"
            className="text-xs text-primary hover:underline focus-visible:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
          >
            View full audit log &rarr;
          </a>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          Every action the AI agent performs is logged for transparency.
        </p>
        <ActivityTimeline entries={recentActivity} />
      </div>

    </div>
  );
}
